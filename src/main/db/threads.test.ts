import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccountValue } from '../../shared/accounts'
import {
  DbError,
  type OperationInput,
  type OperationName,
  type OperationOutput,
} from '../../shared/contract'
import { openDbClient, type DbClient } from './client'
import { threadSpawner } from './spawn'

// Compiled by test/compile-main.ts before the suite starts.
const WORKER = path.resolve('dist/main/db/worker.js')

let dir: string
let dbPath: string
let client: DbClient | undefined

const open = async () =>
  (client = await openDbClient({
    spawn: threadSpawner(WORKER, dbPath),
    readers: 2,
  }))

async function call<N extends OperationName>(
  name: N,
  input: OperationInput<N>
): Promise<OperationOutput<N>> {
  const result = await client!.call(name, input)
  if (!result.ok) throw new DbError(result.error.code, result.error.message)
  return result.output as OperationOutput<N>
}

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()
const checking = {
  name: 'Checking',
  kind: 'checking',
  currency: 'USD',
} as const

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opulent-threads-'))
  dbPath = path.join(dir, 'app.db')
})
afterEach(async () => {
  await client?.close()
  client = undefined
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('real worker threads', () => {
  it('shows every committed write to the next read', async () => {
    await open()
    const { id } = await call('accounts.create', checking)

    for (let n = 0; n < 50; n++) {
      await call('accountValues.record', {
        accountId: id,
        asOf: day(n),
        amountMinor: n,
      })
      const [account] = await call('accounts.list', {})
      expect(account.latestValue?.amountMinor).toBe(n)
    }
  })

  it('answers reads while writes are still queued', async () => {
    await open()
    const { id } = await call('accounts.create', checking)
    const settled: string[] = []

    const writes = Array.from({ length: 3000 }, (_, n) =>
      call('accountValues.record', {
        accountId: id,
        asOf: day(n),
        amountMinor: n,
      })
    )
    const lastWrite = writes[writes.length - 1].then(() =>
      settled.push('write')
    )
    const read = call('accounts.list', {}).then(() => settled.push('read'))
    await Promise.all([lastWrite, read])

    expect(settled).toEqual(['read', 'write'])
    const history: AccountValue[] = await call('accountValues.history', {
      accountId: id,
    })
    expect(history).toHaveLength(3000)
  })

  it('keeps data across restarts and leaves no write-ahead log behind', async () => {
    await open()
    await call('accounts.create', { ...checking, accountNumber: '0001234' })
    await client!.close()

    expect(fs.readdirSync(dir)).toEqual(['app.db'])

    await open()
    const [account] = await call('accounts.list', {})
    expect(account.accountNumber).toBe('0001234')
  })

  it('refuses to open a database from a newer version of the app', async () => {
    const db = new Database(dbPath)
    db.pragma('user_version = 9999')
    db.close()

    await expect(open()).rejects.toThrow(/newer than this app supports/)
  })
})
