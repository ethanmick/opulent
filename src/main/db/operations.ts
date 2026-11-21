import {
  DbError,
  type OperationArgs,
  type OperationName,
  type OperationOutput,
} from '../../shared/contract'
import type { Connection } from './connection'
import { listAccountValues, upsertAccountValue } from './queries/account-values'
import {
  accountExists,
  closeAccount,
  insertAccount,
  listAccountsWithLatestValue,
} from './queries/accounts'

type Handlers = {
  [N in OperationName]: (
    db: Connection,
    args: OperationArgs<N>
  ) => OperationOutput<N>
}

function requireAccount(db: Connection, id: number): void {
  if (!accountExists(db, id)) {
    throw new DbError('not_found', `Account ${id} does not exist`)
  }
}

export const handlers: Handlers = {
  'accounts.create': insertAccount,
  'accounts.close': (db, args) => {
    const account = closeAccount(db, args)
    if (!account) {
      throw new DbError('not_found', `Account ${args.id} does not exist`)
    }
    return account
  },
  'accounts.list': listAccountsWithLatestValue,
  'accountValues.record': (db, args) => {
    requireAccount(db, args.accountId)
    return upsertAccountValue(db, args)
  },
  'accountValues.history': (db, args) => {
    requireAccount(db, args.accountId)
    return listAccountValues(db, args.accountId)
  },
}
