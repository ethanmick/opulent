import Database from 'better-sqlite3'
import type { WorkerRole } from './protocol'

export type Connection = Database.Database

export function openConnection(dbPath: string, role: WorkerRole): Connection {
  const readonly = role === 'reader'
  const db = new Database(dbPath, {
    readonly,
    fileMustExist: readonly,
    timeout: 5000,
  })
  if (readonly) {
    db.pragma('query_only = ON')
  } else {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}
