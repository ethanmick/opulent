import { describe, expect, it, vi } from 'vitest'
import type { DbApi, DbResult, TableName } from '../../src/shared/contract'
import { watchQuery } from './watch-query'

function fakeDb() {
  const replies: ((result: DbResult<unknown>) => void)[] = []
  const subscribers = new Set<(tables: TableName[]) => void>()
  const db: DbApi = {
    call: vi.fn(() => new Promise<DbResult<unknown>>((r) => replies.push(r))),
    onChange: (listener) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
  }
  const reply = async (index: number, result: DbResult<unknown>) => {
    replies[index](result)
    await Promise.resolve()
  }
  const change = (...tables: TableName[]) =>
    subscribers.forEach((subscriber) => subscriber(tables))
  return { db, reply, change, subscribers }
}

const ok = (output: unknown): DbResult<unknown> => ({ ok: true, output })

describe('watchQuery', () => {
  it('loads at once and reports the data', async () => {
    const { db, reply } = fakeDb()
    const listener = vi.fn()

    watchQuery(db, 'accountValues.history', { accountId: 3 }, listener)
    expect(db.call).toHaveBeenCalledWith('accountValues.history', {
      accountId: 3,
    })
    await reply(0, ok(['a']))

    expect(listener.mock.calls).toEqual([[{ status: 'ready', data: ['a'] }]])
  })

  it('reports a failed call as an error', async () => {
    const { db, reply } = fakeDb()
    const listener = vi.fn()
    const error = { code: 'not_found', message: 'Account 3 does not exist' }

    watchQuery(db, 'accountValues.history', { accountId: 3 }, listener)
    await reply(0, { ok: false, error: error as never })

    expect(listener.mock.calls).toEqual([[{ status: 'error', error }]])
  })

  it('reloads when a table it reads has changed', async () => {
    const { db, reply, change } = fakeDb()
    const listener = vi.fn()
    watchQuery(db, 'accountValues.history', { accountId: 3 }, listener)
    await reply(0, ok(['a']))

    change('account_values')
    await reply(1, ok(['a', 'b']))

    expect(listener).toHaveBeenLastCalledWith({
      status: 'ready',
      data: ['a', 'b'],
    })
  })

  it('does not reload when an unrelated table has changed', async () => {
    const { db, reply, change } = fakeDb()
    watchQuery(db, 'accountValues.history', { accountId: 3 }, vi.fn())
    await reply(0, ok(['a']))

    change('accounts')

    expect(db.call).toHaveBeenCalledTimes(1)
  })

  it('drops a slow reply that a newer one has overtaken', async () => {
    const { db, reply, change } = fakeDb()
    const listener = vi.fn()
    watchQuery(db, 'accountValues.history', { accountId: 3 }, listener)
    change('account_values')

    await reply(1, ok(['new']))
    await reply(0, ok(['old']))

    expect(listener.mock.calls).toEqual([[{ status: 'ready', data: ['new'] }]])
  })

  it('goes quiet once stopped', async () => {
    const { db, reply, change, subscribers } = fakeDb()
    const listener = vi.fn()
    const stop = watchQuery(
      db,
      'accountValues.history',
      { accountId: 3 },
      listener
    )

    stop()
    await reply(0, ok(['a']))
    change('account_values')

    expect(listener).not.toHaveBeenCalled()
    expect(db.call).toHaveBeenCalledTimes(1)
    expect(subscribers.size).toBe(0)
  })
})
