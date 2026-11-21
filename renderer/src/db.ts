import {
  DbError,
  type DbApi,
  type OperationInput,
  type OperationName,
  type OperationOutput,
} from '../../src/shared/contract'

declare global {
  interface Window {
    db: DbApi
  }
}

export async function call<N extends OperationName>(
  name: N,
  input: OperationInput<N>
): Promise<OperationOutput<N>> {
  const result = await window.db.call(name, input)
  if (!result.ok) throw new DbError(result.error.code, result.error.message)
  return result.output as OperationOutput<N>
}
