import fs from 'node:fs'
import type { Connection } from './connection'

export interface Migration {
  name: string
  sql: string
}

export function schemaVersion(db: Connection): number {
  return db.pragma('user_version', { simple: true }) as number
}

function backUp(db: Connection, version: number): void {
  const backupPath = `${db.name}.v${version}.bak`
  fs.rmSync(backupPath, { force: true })
  db.prepare('VACUUM INTO ?').run(backupPath)
}

/**
 * Applies the migrations a database has not seen, one transaction each.
 * A migration's position in the list is its schema version.
 */
export function migrate(
  db: Connection,
  migrations: readonly Migration[]
): void {
  const current = schemaVersion(db)
  if (current > migrations.length) {
    throw new Error(
      `Database schema version ${current} is newer than this app supports (${migrations.length})`
    )
  }
  if (current === migrations.length) return
  if (current > 0 && !db.memory) backUp(db, current)

  for (let version = current; version < migrations.length; version++) {
    const { name, sql } = migrations[version]
    try {
      db.transaction(() => {
        db.exec(sql)
        db.pragma(`user_version = ${version + 1}`)
      }).immediate()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Migration ${version + 1} (${name}) failed: ${reason}`, {
        cause: error,
      })
    }
  }
}
