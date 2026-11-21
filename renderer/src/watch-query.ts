import {
  operations,
  type DbApi,
  type DbErrorShape,
  type OperationInput,
  type OperationOutput,
  type ReadOperationName,
  type TableName,
} from '../../src/shared/contract'

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: DbErrorShape }

/**
 * Runs a read and re-runs it whenever a table it depends on changes.
 * Returns a function that stops watching.
 */
export function watchQuery<N extends ReadOperationName>(
  db: DbApi,
  name: N,
  input: OperationInput<N>,
  listener: (state: QueryState<OperationOutput<N>>) => void
): () => void {
  const tables: readonly TableName[] = operations[name].tables
  let latest = 0
  let stopped = false

  const load = async () => {
    const ticket = ++latest
    const result = await db.call(name, input)
    if (stopped || ticket !== latest) return
    listener(
      result.ok
        ? { status: 'ready', data: result.output as OperationOutput<N> }
        : { status: 'error', error: result.error }
    )
  }

  const unsubscribe = db.onChange((changed) => {
    if (changed.some((table) => tables.includes(table))) void load()
  })
  void load()

  return () => {
    stopped = true
    unsubscribe()
  }
}
