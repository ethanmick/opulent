import { useEffect, useState } from 'react'
import type {
  OperationInput,
  OperationOutput,
  ReadOperationName,
} from '../../src/shared/contract'
import { watchQuery, type QueryState } from './watch-query'

const LOADING = { status: 'loading' } as const

export function useDbQuery<N extends ReadOperationName>(
  name: N,
  input: OperationInput<N>
): QueryState<OperationOutput<N>> {
  type State = QueryState<OperationOutput<N>>
  const key = JSON.stringify([name, input])
  const [result, setResult] = useState<{ key: string; state: State }>()

  useEffect(
    () =>
      watchQuery(window.db, name, JSON.parse(key)[1], (state) =>
        setResult({ key, state })
      ),
    [name, key]
  )

  return result?.key === key ? result.state : LOADING
}
