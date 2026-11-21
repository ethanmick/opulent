import { describe, expect, it, vi } from 'vitest'
import type { DbResult } from '../../shared/contract'
import { openDbClient, type DbClient, type WorkerLike } from './client'
import type { WorkerRequest, WorkerResponse, WorkerRole } from './protocol'

type CallRequest = Extract<WorkerRequest, { type: 'call' }>

class FakeWorker implements WorkerLike {
  readonly sent: WorkerRequest[] = []
  private readonly listeners: Record<string, ((value: never) => void)[]> = {}

  constructor(readonly role: WorkerRole) {}

  postMessage(message: WorkerRequest): void {
    this.sent.push(message)
  }

  on(event: string, listener: (value: never) => void): void {
    ;(this.listeners[event] ??= []).push(listener)
  }

  private emit(event: string, value: unknown): void {
    for (const listener of this.listeners[event] ?? []) listener(value as never)
  }

  get calls(): CallRequest[] {
    return this.sent.filter((m): m is CallRequest => m.type === 'call')
  }

  ready(): void {
    this.emit('message', { type: 'ready' } satisfies WorkerResponse)
  }

  reply(call: CallRequest, result: DbResult<unknown>): void {
    this.emit('message', {
      type: 'result',
      id: call.id,
      result,
    } satisfies WorkerResponse)
  }

  exit(code = 0): void {
    this.emit('exit', code)
  }

  crash(message: string): void {
    this.emit('error', new Error(message))
    this.exit(1)
  }
}

const ok = (output: unknown): DbResult<unknown> => ({ ok: true, output })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const newAccount = { name: 'Checking', kind: 'checking', currency: 'USD' }
const newAccountArgs = {
  ...newAccount,
  institution: null,
  accountNumber: null,
  openedOn: null,
}

function harness() {
  const workers: FakeWorker[] = []
  const spawn = (role: WorkerRole) => {
    const worker = new FakeWorker(role)
    workers.push(worker)
    return worker
  }
  const of = (role: WorkerRole) => workers.filter((w) => w.role === role)
  return { workers, spawn, of }
}

async function openClient(readers = 2) {
  const h = harness()
  const opening = openDbClient({ spawn: h.spawn, readers })
  h.workers[0].ready()
  await tick()
  for (const reader of h.of('reader')) reader.ready()
  const client: DbClient = await opening
  return { ...h, client, writer: h.workers[0] }
}

describe('opening', () => {
  it('starts readers only after the writer has finished starting', async () => {
    const h = harness()
    const opening = openDbClient({ spawn: h.spawn, readers: 2 })
    await tick()

    expect(h.workers.map((w) => w.role)).toEqual(['writer'])

    h.workers[0].ready()
    await tick()
    expect(h.workers.map((w) => w.role)).toEqual(['writer', 'reader', 'reader'])

    for (const reader of h.of('reader')) reader.ready()
    await expect(opening).resolves.toBeDefined()
  })

  it('fails with the cause when the writer cannot start', async () => {
    const h = harness()
    const opening = openDbClient({ spawn: h.spawn, readers: 2 })

    h.workers[0].crash('database is newer than this app')

    await expect(opening).rejects.toThrow(/database is newer than this app/)
  })
})

describe('calling', () => {
  it('sends a write to the writer with validated arguments', async () => {
    const { client, writer, of } = await openClient()

    const pending = client.call('accounts.create', {
      ...newAccount,
      name: '  Checking ',
    })
    await tick()

    expect(writer.calls).toEqual([
      { type: 'call', id: 1, name: 'accounts.create', args: newAccountArgs },
    ])
    expect(of('reader').flatMap((r) => r.calls)).toEqual([])

    writer.reply(writer.calls[0], ok({ id: 1 }))
    await expect(pending).resolves.toEqual(ok({ id: 1 }))
  })

  it('sends a read to a reader', async () => {
    const { client, writer, of } = await openClient(1)

    const pending = client.call('accounts.list', {})
    await tick()

    const [reader] = of('reader')
    expect(reader.calls.map((c) => c.name)).toEqual(['accounts.list'])
    expect(writer.calls).toEqual([])

    reader.reply(reader.calls[0], ok([]))
    await expect(pending).resolves.toEqual(ok([]))
  })

  it('spreads concurrent reads across idle readers', async () => {
    const { client, of } = await openClient(2)

    void client.call('accounts.list', {})
    void client.call('accounts.list', {})
    void client.call('accounts.list', {})
    await tick()

    expect(of('reader').map((r) => r.calls.length)).toEqual([2, 1])
  })

  it('matches out-of-order replies to their calls', async () => {
    const { client, of } = await openClient(1)
    const first = client.call('accountValues.history', { accountId: 1 })
    const second = client.call('accountValues.history', { accountId: 2 })
    await tick()
    const [reader] = of('reader')

    reader.reply(reader.calls[1], ok('second'))
    reader.reply(reader.calls[0], ok('first'))

    await expect(first).resolves.toEqual(ok('first'))
    await expect(second).resolves.toEqual(ok('second'))
  })

  it.each([['accounts.drop'], ['toString'], [42], [undefined]])(
    'rejects %s as an unknown operation without reaching a worker',
    async (name) => {
      const { client, workers } = await openClient()

      const result = await client.call(name, {})

      expect(result).toMatchObject({
        ok: false,
        error: { code: 'unknown_operation' },
      })
      expect(workers.flatMap((w) => w.calls)).toEqual([])
    }
  )

  it('rejects invalid input, naming the field, without reaching a worker', async () => {
    const { client, workers } = await openClient()

    const result = await client.call('accounts.create', {
      ...newAccount,
      currency: 'dollars',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_input' } })
    expect(result.ok === false && result.error.message).toMatch(/currency/)
    expect(workers.flatMap((w) => w.calls)).toEqual([])
  })

  it('passes a failed result through unchanged', async () => {
    const { client, writer } = await openClient()
    const failure: DbResult<unknown> = {
      ok: false,
      error: { code: 'not_found', message: 'Account 5 does not exist' },
    }

    const pending = client.call('accounts.close', {
      id: 5,
      closedOn: '2026-01-01',
    })
    await tick()
    writer.reply(writer.calls[0], failure)

    await expect(pending).resolves.toEqual(failure)
  })
})

describe('change notifications', () => {
  it('announces the changed tables once a write has succeeded', async () => {
    const { client, writer } = await openClient()
    const listener = vi.fn()
    client.onChange(listener)

    const pending = client.call('accounts.create', newAccount)
    await tick()
    expect(listener).not.toHaveBeenCalled()

    writer.reply(writer.calls[0], ok({ id: 1 }))
    await pending

    expect(listener.mock.calls).toEqual([[['accounts']]])
  })

  it('stays silent when a write fails', async () => {
    const { client, writer } = await openClient()
    const listener = vi.fn()
    client.onChange(listener)

    const pending = client.call('accounts.create', newAccount)
    await tick()
    writer.reply(writer.calls[0], {
      ok: false,
      error: { code: 'constraint', message: 'no' },
    })
    await pending

    expect(listener).not.toHaveBeenCalled()
  })

  it('stays silent for reads', async () => {
    const { client, of } = await openClient(1)
    const listener = vi.fn()
    client.onChange(listener)

    const pending = client.call('accounts.list', {})
    await tick()
    of('reader')[0].reply(of('reader')[0].calls[0], ok([]))
    await pending

    expect(listener).not.toHaveBeenCalled()
  })

  it('completes the write and tells other listeners when one listener throws', async () => {
    const { client, writer } = await openClient()
    const listener = vi.fn()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    client.onChange(() => {
      throw new Error('window is gone')
    })
    client.onChange(listener)

    const pending = client.call('accounts.create', newAccount)
    await tick()
    writer.reply(writer.calls[0], ok({ id: 1 }))

    await expect(pending).resolves.toEqual(ok({ id: 1 }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()
  })

  it('stops notifying a listener that unsubscribed', async () => {
    const { client, writer } = await openClient()
    const listener = vi.fn()
    const unsubscribe = client.onChange(listener)
    unsubscribe()

    const pending = client.call('accounts.create', newAccount)
    await tick()
    writer.reply(writer.calls[0], ok({ id: 1 }))
    await pending

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('worker failure', () => {
  it('fails the calls a crashed worker was holding', async () => {
    const { client, writer } = await openClient()
    const pending = client.call('accounts.create', newAccount)
    await tick()

    writer.crash('out of memory')

    const result = await pending
    expect(result).toMatchObject({ ok: false, error: { code: 'unavailable' } })
    expect(result.ok === false && result.error.message).toMatch(/out of memory/)
  })

  it('replaces a crashed writer on the next write', async () => {
    const { client, writer, of } = await openClient()
    writer.crash('out of memory')

    const pending = client.call('accounts.create', newAccount)
    await tick()

    const [, replacement] = of('writer')
    expect(replacement.calls.map((c) => c.name)).toEqual(['accounts.create'])
    replacement.ready()
    replacement.reply(replacement.calls[0], ok({ id: 1 }))
    await expect(pending).resolves.toEqual(ok({ id: 1 }))
  })

  it('replaces a crashed reader on the next read', async () => {
    const { client, of } = await openClient(1)
    of('reader')[0].crash('out of memory')

    const pending = client.call('accounts.list', {})
    await tick()

    const [, replacement] = of('reader')
    replacement.ready()
    replacement.reply(replacement.calls[0], ok([]))
    await expect(pending).resolves.toEqual(ok([]))
  })

  it('fails calls sent to a replacement that cannot start', async () => {
    const { client, writer, of } = await openClient()
    writer.crash('out of memory')
    const pending = client.call('accounts.create', newAccount)
    await tick()

    of('writer')[1].crash('disk is full')

    const result = await pending
    expect(result.ok === false && result.error).toMatchObject({
      code: 'unavailable',
      message: expect.stringMatching(/disk is full/),
    })
  })
})

describe('closing', () => {
  it('lets queued calls finish before asking a worker to close', async () => {
    const { client, writer, of } = await openClient(1)
    const pending = client.call('accounts.create', newAccount)
    await tick()

    const closing = client.close()
    await tick()
    of('reader')[0].exit()
    await tick()

    expect(writer.sent.map((m) => m.type)).toEqual(['call', 'close'])
    writer.reply(writer.calls[0], ok({ id: 1 }))
    writer.exit()
    await closing
    await expect(pending).resolves.toEqual(ok({ id: 1 }))
  })

  it('closes the writer last, after every reader has exited', async () => {
    const { client, writer, of } = await openClient(2)
    const [first, second] = of('reader')

    const closing = client.close()
    await tick()

    expect(first.sent).toEqual([{ type: 'close' }])
    expect(second.sent).toEqual([{ type: 'close' }])
    expect(writer.sent).toEqual([])

    first.exit()
    await tick()
    expect(writer.sent).toEqual([])

    second.exit()
    await tick()
    expect(writer.sent).toEqual([{ type: 'close' }])

    let closed = false
    void closing.then(() => (closed = true))
    await tick()
    expect(closed).toBe(false)

    writer.exit()
    await closing
  })

  it('refuses calls made after closing began', async () => {
    const { client, workers } = await openClient()
    void client.close()

    const result = await client.call('accounts.list', {})

    expect(result).toMatchObject({ ok: false, error: { code: 'unavailable' } })
    expect(workers.flatMap((w) => w.calls)).toEqual([])
  })

  it('does not restart a worker that already crashed', async () => {
    const { client, writer, of, workers } = await openClient(1)
    writer.crash('out of memory')

    const closing = client.close()
    await tick()
    of('reader')[0].exit()
    await closing

    expect(workers).toHaveLength(2)
  })
})
