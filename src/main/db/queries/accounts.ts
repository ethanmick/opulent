import type {
  Account,
  AccountKind,
  AccountWithLatestValue,
} from '../../../shared/accounts'
import type { OperationArgs } from '../../../shared/contract'
import type { Connection } from '../connection'

interface AccountRow {
  id: number
  name: string
  kind: AccountKind
  currency: string
  institution: string | null
  account_number: string | null
  opened_on: string | null
  closed_on: string | null
  created_at: string
}

interface AccountWithLatestValueRow extends AccountRow {
  as_of: string | null
  amount_minor: number | null
  recorded_at: string | null
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    institution: row.institution,
    accountNumber: row.account_number,
    openedOn: row.opened_on,
    closedOn: row.closed_on,
    createdAt: row.created_at,
  }
}

export function insertAccount(
  db: Connection,
  args: OperationArgs<'accounts.create'>
): Account {
  const row = db
    .prepare<[typeof args], AccountRow>(
      `INSERT INTO accounts
         (name, kind, currency, institution, account_number, opened_on)
       VALUES
         (@name, @kind, @currency, @institution, @accountNumber, @openedOn)
       RETURNING *`
    )
    .get(args)
  return toAccount(row!)
}

export function closeAccount(
  db: Connection,
  args: OperationArgs<'accounts.close'>
): Account | undefined {
  const row = db
    .prepare<[typeof args], AccountRow>(
      'UPDATE accounts SET closed_on = @closedOn WHERE id = @id RETURNING *'
    )
    .get(args)
  return row && toAccount(row)
}

export function accountExists(db: Connection, id: number): boolean {
  return db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id) !== undefined
}

export function listAccountsWithLatestValue(
  db: Connection
): AccountWithLatestValue[] {
  const rows = db
    .prepare<[], AccountWithLatestValueRow>(
      `SELECT a.*, v.as_of, v.amount_minor, v.recorded_at
       FROM accounts a
       LEFT JOIN account_values v
         ON v.account_id = a.id
        AND v.as_of = (
          SELECT max(as_of) FROM account_values WHERE account_id = a.id
        )
       ORDER BY a.name COLLATE NOCASE, a.id`
    )
    .all()
  return rows.map((row) => ({
    ...toAccount(row),
    latestValue:
      row.as_of === null
        ? null
        : {
            accountId: row.id,
            asOf: row.as_of,
            amountMinor: row.amount_minor!,
            recordedAt: row.recorded_at!,
          },
  }))
}
