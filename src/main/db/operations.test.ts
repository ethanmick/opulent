import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KINDS } from '../../shared/accounts'
import type { Connection } from './connection'
import { execute } from './execute'
import { openTestDb, run } from './test-support'

let db: Connection

beforeEach(() => {
  db = openTestDb()
})

const checking = {
  name: 'Checking',
  kind: 'checking',
  currency: 'USD',
} as const

describe('accounts.create', () => {
  it('stores the full account number and nulls omitted details', () => {
    const account = run(db, 'accounts.create', {
      ...checking,
      accountNumber: '000123456789',
    })

    expect(account).toMatchObject({
      id: 1,
      name: 'Checking',
      kind: 'checking',
      currency: 'USD',
      institution: null,
      accountNumber: '000123456789',
      openedOn: null,
      closedOn: null,
    })
    expect(account.createdAt).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/
    )
  })

  it('accepts every account kind the app knows about', () => {
    for (const kind of ACCOUNT_KINDS) {
      expect(run(db, 'accounts.create', { ...checking, kind }).kind).toBe(kind)
    }
  })
})

describe('accounts.close', () => {
  it('records the closing date', () => {
    const { id } = run(db, 'accounts.create', checking)

    const closed = run(db, 'accounts.close', { id, closedOn: '2026-03-31' })

    expect(closed.closedOn).toBe('2026-03-31')
    expect(run(db, 'accounts.list', {})[0].closedOn).toBe('2026-03-31')
  })

  it('fails with not_found for a missing account', () => {
    expect(() =>
      run(db, 'accounts.close', { id: 7, closedOn: '2026-03-31' })
    ).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('accounts.list', () => {
  it('orders accounts by name, ignoring case', () => {
    for (const name of ['savings', 'Brokerage', 'checking']) {
      run(db, 'accounts.create', { ...checking, name })
    }

    expect(run(db, 'accounts.list', {}).map((a) => a.name)).toEqual([
      'Brokerage',
      'checking',
      'savings',
    ])
  })

  it('derives the latest value from the most recent observation', () => {
    const { id } = run(db, 'accounts.create', checking)
    const record = (asOf: string, amountMinor: number) =>
      run(db, 'accountValues.record', { accountId: id, asOf, amountMinor })
    record('2026-03-01T00:00:00Z', 300)
    record('2026-01-01T00:00:00Z', 100)
    record('2026-02-01T00:00:00Z', 200)

    expect(run(db, 'accounts.list', {})[0].latestValue).toMatchObject({
      accountId: id,
      asOf: '2026-03-01T00:00:00.000Z',
      amountMinor: 300,
    })
  })

  it('reports no latest value for an account without observations', () => {
    run(db, 'accounts.create', checking)

    expect(run(db, 'accounts.list', {})[0].latestValue).toBeNull()
  })

  it('keeps the latest values of different accounts apart', () => {
    const a = run(db, 'accounts.create', { ...checking, name: 'A' })
    const b = run(db, 'accounts.create', { ...checking, name: 'B' })
    run(db, 'accountValues.record', {
      accountId: a.id,
      asOf: '2026-01-01T00:00:00Z',
      amountMinor: 1,
    })
    run(db, 'accountValues.record', {
      accountId: b.id,
      asOf: '2026-06-01T00:00:00Z',
      amountMinor: -2,
    })

    expect(
      run(db, 'accounts.list', {}).map((x) => x.latestValue?.amountMinor)
    ).toEqual([1, -2])
  })
})

describe('accountValues.record', () => {
  it('replaces the value recorded for the same instant', () => {
    const { id } = run(db, 'accounts.create', checking)
    run(db, 'accountValues.record', {
      accountId: id,
      asOf: '2026-01-01T00:00:00Z',
      amountMinor: 100,
    })

    run(db, 'accountValues.record', {
      accountId: id,
      asOf: '2026-01-01T01:00:00+01:00',
      amountMinor: 150,
    })

    expect(
      run(db, 'accountValues.history', { accountId: id }).map((v) => [
        v.asOf,
        v.amountMinor,
      ])
    ).toEqual([['2026-01-01T00:00:00.000Z', 150]])
  })

  it('fails with not_found for a missing account', () => {
    expect(() =>
      run(db, 'accountValues.record', {
        accountId: 9,
        asOf: '2026-01-01T00:00:00Z',
        amountMinor: 1,
      })
    ).toThrow(expect.objectContaining({ code: 'not_found' }))
  })
})

describe('accountValues.history', () => {
  it('returns one account’s observations oldest first', () => {
    const a = run(db, 'accounts.create', checking)
    const b = run(db, 'accounts.create', checking)
    const record = (accountId: number, asOf: string, amountMinor: number) =>
      run(db, 'accountValues.record', { accountId, asOf, amountMinor })
    record(a.id, '2026-02-01T00:00:00Z', 2)
    record(b.id, '2026-01-15T00:00:00Z', 99)
    record(a.id, '2026-01-01T00:00:00Z', 1)

    expect(
      run(db, 'accountValues.history', { accountId: a.id }).map(
        (v) => v.amountMinor
      )
    ).toEqual([1, 2])
  })

  it('fails with not_found for a missing account', () => {
    expect(() => run(db, 'accountValues.history', { accountId: 9 })).toThrow(
      expect.objectContaining({ code: 'not_found' })
    )
  })
})

describe('execute', () => {
  it('reports a violated table constraint as a constraint error', () => {
    const result = execute(db, 'accounts.create', {
      ...checking,
      currency: 'usd',
      institution: null,
      accountNumber: null,
      openedOn: null,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'constraint' } })
  })
})

describe('schema', () => {
  const insertAccount = (columns: Record<string, unknown>) => {
    const row = { name: 'x', kind: 'checking', currency: 'USD', ...columns }
    const keys = Object.keys(row)
    db.prepare(
      `INSERT INTO accounts (${keys.join(', ')})
       VALUES (${keys.map((key) => `@${key}`).join(', ')})`
    ).run(row)
  }
  const insertValue = (accountId: number, asOf: string) =>
    db
      .prepare(
        'INSERT INTO account_values (account_id, as_of, amount_minor) VALUES (?, ?, 1)'
      )
      .run(accountId, asOf)

  it('rejects an unknown account kind', () => {
    expect(() => insertAccount({ kind: 'piggy_bank' })).toThrow(/CHECK/)
  })

  it.each(['2026-02-30', '2026-2-1', 'yesterday'])(
    'rejects %s as an opening date',
    (opened_on) => {
      expect(() => insertAccount({ opened_on })).toThrow(/CHECK/)
    }
  )

  it.each(['2026-01-01', '2026-01-01T00:00:00Z', '2026-01-01 00:00:00.000'])(
    'rejects %s as a non-canonical observation time',
    (asOf) => {
      insertAccount({})
      expect(() => insertValue(1, asOf)).toThrow(/CHECK/)
    }
  )

  it('rejects a value for an account that does not exist', () => {
    expect(() => insertValue(42, '2026-01-01T00:00:00.000Z')).toThrow(
      /FOREIGN KEY/
    )
  })

  it('rejects a fractional amount', () => {
    insertAccount({})
    expect(() =>
      db
        .prepare(
          `INSERT INTO account_values (account_id, as_of, amount_minor)
           VALUES (1, '2026-01-01T00:00:00.000Z', 10.5)`
        )
        .run()
    ).toThrow(/cannot store REAL/)
  })
})
