import { SqliteError } from 'better-sqlite3'
import {
  DbError,
  operations,
  type DbErrorShape,
  type DbResult,
  type OperationName,
} from '../../shared/contract'
import type { Connection } from './connection'
import { handlers } from './operations'

function toErrorShape(error: unknown): DbErrorShape {
  if (error instanceof DbError) {
    return { code: error.code, message: error.message }
  }
  if (
    error instanceof SqliteError &&
    error.code.startsWith('SQLITE_CONSTRAINT')
  ) {
    return { code: 'constraint', message: error.message }
  }
  return {
    code: 'internal',
    message: error instanceof Error ? error.message : String(error),
  }
}

/** Runs one operation as a single transaction. `args` must already be validated. */
export function execute(
  db: Connection,
  name: OperationName,
  args: unknown
): DbResult<unknown> {
  const handler = handlers[name] as (db: Connection, args: unknown) => unknown
  const transaction = db.transaction(() => handler(db, args))
  try {
    const output =
      operations[name].mode === 'write'
        ? transaction.immediate()
        : transaction.deferred()
    return { ok: true, output }
  } catch (error) {
    return { ok: false, error: toErrorShape(error) }
  }
}
