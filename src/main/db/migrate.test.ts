import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openConnection } from './connection'
import { migrate, schemaVersion, type Migration } from './migrate'

const one: Migration = { name: 'one', sql: 'CREATE TABLE one (x)' }
const two: Migration = { name: 'two', sql: 'CREATE TABLE two (x)' }

const tables = (db: Database.Database) =>
  db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name"
    )
    .pluck()
    .all()

describe('migrate', () => {
  it('brings a new database to the latest version', () => {
    const db = openConnection(':memory:', 'writer')

    migrate(db, [one, two])

    expect(tables(db)).toEqual(['one', 'two'])
    expect(schemaVersion(db)).toBe(2)
  })

  it('applies only the migrations a database has not seen', () => {
    const db = openConnection(':memory:', 'writer')
    migrate(db, [one])

    migrate(db, [one, two])

    expect(tables(db)).toEqual(['one', 'two'])
  })

  it('rolls a failed migration back and keeps the earlier ones', () => {
    const db = openConnection(':memory:', 'writer')
    const broken: Migration = {
      name: 'broken',
      sql: 'CREATE TABLE two (x); INSERT INTO missing VALUES (1);',
    }

    expect(() => migrate(db, [one, broken])).toThrow(
      /broken.*no such table: missing/
    )

    expect(tables(db)).toEqual(['one'])
    expect(schemaVersion(db)).toBe(1)
  })

  it('refuses a database written by a newer version of the app', () => {
    const db = openConnection(':memory:', 'writer')
    migrate(db, [one, two])

    expect(() => migrate(db, [one])).toThrow(/newer/)
  })

  describe('with a database file', () => {
    let dir: string
    let dbPath: string

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opulent-migrate-'))
      dbPath = path.join(dir, 'app.db')
    })
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

    it('backs the file up before upgrading existing data', () => {
      const db = openConnection(dbPath, 'writer')
      migrate(db, [one])
      db.prepare('INSERT INTO one VALUES (?)').run('precious')

      migrate(db, [one, two])
      db.close()

      const backup = new Database(`${dbPath}.v1.bak`, { readonly: true })
      expect(tables(backup)).toEqual(['one'])
      expect(backup.prepare('SELECT x FROM one').pluck().all()).toEqual([
        'precious',
      ])
      backup.close()
    })

    it('replaces a stale backup left by an earlier attempt', () => {
      fs.writeFileSync(`${dbPath}.v1.bak`, 'stale')
      const db = openConnection(dbPath, 'writer')
      migrate(db, [one])

      migrate(db, [one, two])
      db.close()

      const backup = new Database(`${dbPath}.v1.bak`, { readonly: true })
      expect(tables(backup)).toEqual(['one'])
      backup.close()
    })

    it('makes no backup when there is nothing to upgrade', () => {
      const db = openConnection(dbPath, 'writer')
      migrate(db, [one, two])
      migrate(db, [one, two])
      db.close()

      expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([])
    })

    it('opens readers that cannot write', () => {
      const writer = openConnection(dbPath, 'writer')
      migrate(writer, [one])
      const reader = openConnection(dbPath, 'reader')

      expect(() => reader.prepare('INSERT INTO one VALUES (1)').run()).toThrow(
        /readonly/
      )
      reader.close()
      writer.close()
    })
  })
})
