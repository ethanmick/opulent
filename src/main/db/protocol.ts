import type { DbResult, OperationName } from '../../shared/contract'

export type WorkerRole = 'writer' | 'reader'

export interface WorkerInit {
  dbPath: string
  role: WorkerRole
}

export type WorkerRequest =
  | { type: 'call'; id: number; name: OperationName; args: unknown }
  | { type: 'close' }

export type WorkerResponse =
  { type: 'ready' } | { type: 'result'; id: number; result: DbResult<unknown> }
