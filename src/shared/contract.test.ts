import { describe, expect, it } from 'vitest'
import { ACCOUNT_KINDS, accountKindGroup } from './accounts'
import { isOperationName, operations } from './contract'

const create = operations['accounts.create'].input
const record = operations['accountValues.record'].input
const account = { name: 'Checking', kind: 'checking', currency: 'USD' }
const value = { accountId: 1, asOf: '2026-01-01T00:00:00Z', amountMinor: 100 }

describe('account kinds', () => {
  it.each([
    ['checking', 'cash'],
    ['roth_ira', 'investment'],
    ['credit_card', 'credit'],
    ['mortgage', 'loan'],
    ['vehicle', 'property'],
    ['other', 'other'],
  ] as const)('groups %s under %s', (kind, group) => {
    expect(accountKindGroup(kind)).toBe(group)
  })

  it('places each kind in exactly one group', () => {
    expect(new Set(ACCOUNT_KINDS).size).toBe(ACCOUNT_KINDS.length)
  })
})

describe('accounts.create input', () => {
  it('trims text and fills omitted details with null', () => {
    expect(create.parse({ ...account, name: '  Checking  ' })).toEqual({
      ...account,
      institution: null,
      accountNumber: null,
      openedOn: null,
    })
  })

  it.each([
    ['a blank name', { name: '   ' }],
    ['an unknown kind', { kind: 'piggy_bank' }],
    ['a lowercase currency', { currency: 'usd' }],
    ['a blank account number', { accountNumber: '' }],
    ['a day that does not exist', { openedOn: '2026-02-30' }],
    ['a field the operation does not take', { balance: 100 }],
  ])('rejects %s', (_label, override) => {
    expect(create.safeParse({ ...account, ...override }).success).toBe(false)
  })
})

describe('accountValues.record input', () => {
  it.each([
    ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00.000Z'],
    ['2026-01-01T09:30:00+09:30', '2026-01-01T00:00:00.000Z'],
    ['2025-12-31T19:00:00.5-05:00', '2026-01-01T00:00:00.500Z'],
  ])('normalises %s to %s', (asOf, canonical) => {
    expect(record.parse({ ...value, asOf }).asOf).toBe(canonical)
  })

  it.each([
    ['a date without a time', { asOf: '2026-01-01' }],
    ['a time without a zone', { asOf: '2026-01-01T00:00:00' }],
    ['a fractional amount', { amountMinor: 10.5 }],
    ['an amount too large to be exact', { amountMinor: 2 ** 53 }],
    ['a non-positive account id', { accountId: 0 }],
  ])('rejects %s', (_label, override) => {
    expect(record.safeParse({ ...value, ...override }).success).toBe(false)
  })
})

describe('isOperationName', () => {
  it.each(['accounts.list', 'accountValues.record'])('accepts %s', (name) => {
    expect(isOperationName(name)).toBe(true)
  })

  it.each(['accounts.drop', 'constructor', '', 7, null])('rejects %s', (name) => {
    expect(isOperationName(name)).toBe(false)
  })
})
