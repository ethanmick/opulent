import {
  DbError,
  operations,
  type OperationInput,
  type OperationName,
  type OperationOutput,
} from '../../shared/contract'
import { openConnection, type Connection } from './connection'
import { execute } from './execute'
import { migrate } from './migrate'
import { MIGRATIONS } from './migrations'

export function openTestDb(): Connection {
  const db = openConnection(':memory:', 'writer')
  migrate(db, MIGRATIONS)
  return db
}

/** Validates and executes like the real path, throwing on a failed result. */
export function run<N extends OperationName>(
  db: Connection,
  name: N,
  input: OperationInput<N>
): OperationOutput<N> {
  const result = execute(db, name, operations[name].input.parse(input))
  if (!result.ok) throw new DbError(result.error.code, result.error.message)
  return result.output as OperationOutput<N>
}
