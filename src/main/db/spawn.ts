import { Worker } from 'node:worker_threads'
import type { SpawnWorker } from './client'
import type { WorkerInit } from './protocol'

export function threadSpawner(workerPath: string, dbPath: string): SpawnWorker {
  return (role) => {
    const workerData: WorkerInit = { dbPath, role }
    return new Worker(workerPath, { workerData })
  }
}
