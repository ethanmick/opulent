import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import {
  DB_CALL_CHANNEL,
  DB_CHANGED_CHANNEL,
  type DbResult,
} from '../shared/contract'
import { isSamePage } from './app-page'
import type { DbClient } from './db/client'

const FORBIDDEN: DbResult<never> = {
  ok: false,
  error: { code: 'forbidden', message: 'Caller may not use the database' },
}

export function registerDbIpc(
  ipcMain: Pick<IpcMain, 'handle'>,
  client: DbClient,
  { windows, pageUrl }: { windows: () => BrowserWindow[]; pageUrl: string }
): void {
  const isAppPage = ({ sender, senderFrame }: IpcMainInvokeEvent) =>
    senderFrame !== null &&
    senderFrame === sender.mainFrame &&
    isSamePage(senderFrame.url, pageUrl) &&
    windows().some((window) => window.webContents === sender)

  ipcMain.handle(DB_CALL_CHANNEL, (event, name: unknown, input: unknown) =>
    isAppPage(event) ? client.call(name, input) : FORBIDDEN
  )
  client.onChange((tables) => {
    for (const window of windows()) {
      window.webContents.send(DB_CHANGED_CHANNEL, tables)
    }
  })
}
