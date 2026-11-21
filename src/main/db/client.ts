import { z } from 'zod'
import {
  isOperationName,
  operations,
  type DbErrorCode,
  type DbResult,
  type OperationName,
  type TableName,
} from '../../shared/contract'
import type { WorkerRequest, WorkerResponse, WorkerRole } from './protocol'

export interface WorkerLike {
  postMessage(message: WorkerRequest): void
  on(event: 'message', listener: (message: WorkerResponse) => void): unknown
  on(event: 'error', listener: (error: unknown) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
}

export type SpawnWorker = (role: WorkerRole) => WorkerLike

export interface DbClient {
  call(name: unknown, input: unknown): Promise<DbResult<unknown>>
  onChange(listener: (tables: TableName[]) => void): () => void
  close(): Promise<void>
}

const failure = (code: DbErrorCode, message: string): DbResult<never> => ({
  ok: false,
  error: { code, message },
})

/** One worker thread, from spawn to exit. */
class WorkerThread {
  readonly ready: Promise<void>
  readonly exited: Promise<void>
  hasExited = false
  private nextId = 1
  private readonly pending = new Map<
    number,
    (result: DbResult<unknown>) => void
  >()

  constructor(
    role: WorkerRole,
    private readonly worker: WorkerLike
  ) {
    let cause: unknown
    let markReady!: () => void
    let markFailed!: (error: Error) => void
    let markExited!: () => void
    this.ready = new Promise((resolve, reject) => {
      markReady = resolve
      markFailed = reject
    })
    this.exited = new Promise((resolve) => (markExited = resolve))
    // A replacement thread has nobody awaiting `ready`; its calls fail on exit.
    this.ready.catch(() => {})

    worker.on('message', (message) => {
      if (message.type === 'ready') return markReady()
      this.pending.get(message.id)?.(message.result)
      this.pending.delete(message.id)
    })
    worker.on('error', (error) => (cause = error))
    worker.on('exit', (code) => {
      this.hasExited = true
      const reason =
        cause instanceof Error ? cause.message : `exit code ${code}`
      const message = `Database ${role} stopped: ${reason}`
      markFailed(new Error(message))
      for (const settle of this.pending.values()) {
        settle(failure('unavailable', message))
      }
      this.pending.clear()
      markExited()
    })
  }

  get load(): number {
    return this.pending.size
  }

  call(name: OperationName, args: unknown): Promise<DbResult<unknown>> {
    const id = this.nextId++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.worker.postMessage({ type: 'call', id, name, args })
    })
  }

  /** The close request queues behind calls already sent, so they finish first. */
  close(): Promise<void> {
    if (!this.hasExited) this.worker.postMessage({ type: 'close' })
    return this.exited
  }
}

/** A role that is always backed by a live thread, respawning after a crash. */
class Slot {
  private thread: WorkerThread

  constructor(
    private readonly role: WorkerRole,
    private readonly spawn: SpawnWorker
  ) {
    this.thread = this.start()
  }

  private start(): WorkerThread {
    return new WorkerThread(this.role, this.spawn(this.role))
  }

  get ready(): Promise<void> {
    return this.thread.ready
  }

  live(): WorkerThread {
    if (this.thread.hasExited) this.thread = this.start()
    return this.thread
  }

  close(): Promise<void> {
    return this.thread.close()
  }
}

export async function openDbClient(options: {
  spawn: SpawnWorker
  readers: number
}): Promise<DbClient> {
  // The writer migrates the schema on start; readers must not open before that.
  const writer = new Slot('writer', options.spawn)
  await writer.ready
  const readers = Array.from(
    { length: options.readers },
    () => new Slot('reader', options.spawn)
  )
  await Promise.all(readers.map((reader) => reader.ready))

  const listeners = new Set<(tables: TableName[]) => void>()
  let closing: Promise<void> | undefined

  // The write is already committed, so a failing listener must not fail it.
  const announce = (tables: readonly TableName[]) => {
    for (const listener of listeners) {
      try {
        listener([...tables])
      } catch (error) {
        console.error('Database change listener failed', error)
      }
    }
  }

  const leastBusyReader = () =>
    readers
      .map((reader) => reader.live())
      .reduce((least, thread) => (thread.load < least.load ? thread : least))

  return {
    async call(name, input) {
      if (closing) return failure('unavailable', 'Database is closed')
      if (!isOperationName(name)) {
        return failure(
          'unknown_operation',
          `Unknown operation: ${String(name)}`
        )
      }
      const operation = operations[name]
      const parsed = operation.input.safeParse(input)
      if (!parsed.success) {
        return failure('invalid_input', z.prettifyError(parsed.error))
      }
      const isWrite = operation.mode === 'write'
      const thread = isWrite ? writer.live() : leastBusyReader()
      const result = await thread.call(name, parsed.data)
      if (result.ok && isWrite) announce(operation.tables)
      return result
    },

    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    // Readers go first so the writer holds the last connection, which lets
    // SQLite fold the WAL back into the database file on close.
    close() {
      closing ??= Promise.all(readers.map((reader) => reader.close())).then(
        () => writer.close()
      )
      return closing
    },
  }
}
