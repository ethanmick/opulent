import type { AccountValue } from '../../../shared/accounts'
import type { OperationArgs } from '../../../shared/contract'
import type { Connection } from '../connection'

interface AccountValueRow {
  account_id: number
  as_of: string
  amount_minor: number
  recorded_at: string
}

function toAccountValue(row: AccountValueRow): AccountValue {
  return {
    accountId: row.account_id,
    asOf: row.as_of,
    amountMinor: row.amount_minor,
    recordedAt: row.recorded_at,
  }
}

export function upsertAccountValue(
  db: Connection,
  args: OperationArgs<'accountValues.record'>
): AccountValue {
  const row = db
    .prepare<[typeof args], AccountValueRow>(
      `INSERT INTO account_values (account_id, as_of, amount_minor)
       VALUES (@accountId, @asOf, @amountMinor)
       ON CONFLICT (account_id, as_of) DO UPDATE SET
         amount_minor = excluded.amount_minor,
         recorded_at = excluded.recorded_at
       RETURNING *`
    )
    .get(args)
  return toAccountValue(row!)
}

export function listAccountValues(
  db: Connection,
  accountId: number
): AccountValue[] {
  return db
    .prepare<[number], AccountValueRow>(
      'SELECT * FROM account_values WHERE account_id = ? ORDER BY as_of'
    )
    .all(accountId)
    .map(toAccountValue)
}
