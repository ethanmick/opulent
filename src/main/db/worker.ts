import { parentPort, workerData } from 'node:worker_threads'
import { openConnection } from './connection'
import { execute } from './execute'
import { migrate } from './migrate'
import { MIGRATIONS } from './migrations'
import type { WorkerInit, WorkerRequest, WorkerResponse } from './protocol'

const port = parentPort
if (!port) throw new Error('db worker must be started as a worker thread')

const { dbPath, role } = workerData as WorkerInit
const db = openConnection(dbPath, role)
if (role === 'writer') migrate(db, MIGRATIONS)

const send = (response: WorkerResponse) => port.postMessage(response)

port.on('message', (request: WorkerRequest) => {
  if (request.type === 'close') {
    db.close()
    port.close()
    return
  }
  send({
    type: 'result',
    id: request.id,
    result: execute(db, request.name, request.args),
  })
})

send({ type: 'ready' })
