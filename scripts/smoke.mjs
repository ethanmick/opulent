// End-to-end check through the real renderer -> IPC -> worker path, on a
// throwaway data directory. `dev` needs `pnpm dev:renderer` running.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9339
const target = process.argv[2]
if (!target) {
  console.error('usage: node scripts/smoke.mjs dev|<packaged-executable>')
  process.exit(2)
}

const [command, args] =
  target === 'dev'
    ? [createRequire(import.meta.url)('electron'), ['.']]
    : [target, []]

async function scenario() {
  const call = async (name, input) => {
    const result = await window.db.call(name, input)
    if (!result.ok) {
      throw new Error(`${name}: ${result.error.code} ${result.error.message}`)
    }
    return result.output
  }
  const changes = []
  const stop = window.db.onChange((tables) => changes.push(tables))

  const account = await call('accounts.create', {
    name: 'Smoke Checking',
    kind: 'checking',
    currency: 'USD',
    accountNumber: '000123456789',
  })
  await call('accountValues.record', {
    accountId: account.id,
    asOf: '2026-01-01T00:00:00Z',
    amountMinor: 100000,
  })
  await call('accountValues.record', {
    accountId: account.id,
    asOf: '2026-02-01T09:30:00+01:00',
    amountMinor: 125050,
  })
  const [list, history] = await Promise.all([
    call('accounts.list', {}),
    call('accountValues.history', { accountId: account.id }),
  ])
  const invalid = await window.db.call('accounts.create', { name: '' })
  const missing = await window.db.call('accountValues.history', {
    accountId: 999,
  })

  await new Promise((resolve) => setTimeout(resolve, 250))
  stop()
  const page = document.body.innerText
  return { account, list, history, invalid, missing, changes, page }
}

async function navigateAway() {
  const page = location.href
  location.href = 'https://example.com/'
  await new Promise((resolve) => setTimeout(resolve, 500))
  return location.href === page
}

async function findPage() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${PORT}/json/list`)
      ).json()
      const page = targets.find(
        (t) => t.type === 'page' && !t.url.startsWith('devtools://')
      )
      if (page) return page
    } catch {
      // not listening yet
    }
    await sleep(200)
  }
  throw new Error('App window did not appear')
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    socket.onopen = () => resolve(socket)
    socket.onerror = () => reject(new Error(`Cannot connect to ${url}`))
  })
}

let nextId = 0
function evaluate(socket, expression) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== id) return
      socket.removeEventListener('message', onMessage)
      const failure = message.error ?? message.result.exceptionDetails
      if (failure) reject(new Error(JSON.stringify(failure, null, 2)))
      else resolve(message.result.result.value)
    }
    socket.addEventListener('message', onMessage)
    socket.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true },
      })
    )
  })
}

const userData = mkdtempSync(path.join(os.tmpdir(), 'opulent-smoke-'))
const app = spawn(
  command,
  [...args, `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`],
  { stdio: 'inherit' }
)
const exited = new Promise((resolve) => app.once('exit', resolve))

try {
  const page = await findPage()
  const socket = await connect(page.webSocketDebuggerUrl)
  for (let attempt = 0; ; attempt++) {
    const rendered = await evaluate(
      socket,
      'Boolean(window.db && document.querySelector("form"))'
    ).catch(() => false) // the page may still be navigating
    if (rendered) break
    if (attempt === 50) throw new Error('The app never rendered')
    await sleep(200)
  }
  const result = await evaluate(socket, `(${scenario})()`)
  const stayedOnAppPage = await evaluate(socket, `(${navigateAway})()`)
  socket.close()

  assert.equal(stayedOnAppPage, true, 'navigation away was not blocked')

  assert.equal(result.account.accountNumber, '000123456789')
  assert.equal(result.list.length, 1)
  assert.deepEqual(result.list[0].latestValue.amountMinor, 125050)
  assert.deepEqual(
    result.history.map((value) => [value.asOf, value.amountMinor]),
    [
      ['2026-01-01T00:00:00.000Z', 100000],
      ['2026-02-01T08:30:00.000Z', 125050],
    ]
  )
  assert.equal(result.invalid.error.code, 'invalid_input')
  assert.equal(result.missing.error.code, 'not_found')
  assert.deepEqual(result.changes, [
    ['accounts'],
    ['account_values'],
    ['account_values'],
  ])
  assert.match(result.page, /Smoke Checking \(checking\).*1[.,]250[.,]50/)
  console.log(JSON.stringify(result, null, 2))
} finally {
  app.kill()
  await exited
}

try {
  const files = readdirSync(userData).filter((file) =>
    file.startsWith('app.db')
  )
  assert.deepEqual(
    files,
    ['app.db'],
    'expected a clean shutdown to fold the WAL'
  )
  console.log(`\nsmoke: ok (${target})`)
} finally {
  rmSync(userData, { recursive: true, force: true })
}
