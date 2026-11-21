import { describe, expect, it, vi } from 'vitest'
import type { DbResult, TableName } from '../shared/contract'
import type { DbClient } from './db/client'
import { registerDbIpc } from './ipc'

const PAGE = 'file:///Applications/opulent.app/renderer/dist/index.html'

function setup() {
  let handler!: (event: unknown, ...args: unknown[]) => unknown
  let announce!: (tables: TableName[]) => void
  const result: DbResult<unknown> = { ok: true, output: [] }
  const client: DbClient = {
    call: vi.fn(async () => result),
    onChange: (listener) => ((announce = listener), () => {}),
    close: async () => {},
  }
  const mainFrame = { url: PAGE }
  const webContents = { mainFrame, send: vi.fn() }
  const window = { webContents }
  registerDbIpc(
    { handle: (_channel, listener) => (handler = listener as typeof handler) },
    client,
    { windows: () => [window] as never, pageUrl: PAGE }
  )
  return { handler, announce, client, result, mainFrame, webContents }
}

describe('db:call', () => {
  it('runs a call from a window’s own page', async () => {
    const { handler, client, result, mainFrame, webContents } = setup()

    const reply = await handler(
      { sender: webContents, senderFrame: mainFrame },
      'accounts.list',
      {}
    )

    expect(client.call).toHaveBeenCalledWith('accounts.list', {})
    expect(reply).toBe(result)
  })

  it('refuses a call from an embedded frame', async () => {
    const { handler, client, webContents } = setup()

    const reply = await handler(
      { sender: webContents, senderFrame: { url: PAGE } },
      'accounts.list',
      {}
    )

    expect(reply).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(client.call).not.toHaveBeenCalled()
  })

  it('refuses a call once the window shows a page that is not the app', async () => {
    const { handler, client, mainFrame, webContents } = setup()
    mainFrame.url = 'file:///Users/me/Downloads/evil.html'

    const reply = await handler(
      { sender: webContents, senderFrame: mainFrame },
      'accounts.list',
      {}
    )

    expect(reply).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(client.call).not.toHaveBeenCalled()
  })

  it('refuses a call from web contents that are not an app window', async () => {
    const { handler, client } = setup()
    const frame = { url: PAGE }

    const reply = await handler(
      { sender: { mainFrame: frame }, senderFrame: frame },
      'accounts.list',
      {}
    )

    expect(reply).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(client.call).not.toHaveBeenCalled()
  })
})

describe('db:changed', () => {
  it('tells every window which tables changed', () => {
    const { announce, webContents } = setup()

    announce(['account_values'])

    expect(webContents.send.mock.calls).toEqual([
      ['db:changed', ['account_values']],
    ])
  })
})
