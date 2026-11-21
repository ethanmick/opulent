import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { openDbClient, type DbClient } from './db/client'
import { threadSpawner } from './db/spawn'
import { registerDbIpc } from './ipc'

const isDev = !app.isPackaged
const READER_THREADS = 2

let db: DbClient | undefined

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'
    win.loadURL(url).finally(() => {
      win.show()
      win.webContents.openDevTools({ mode: 'detach' })
    })
  } else {
    const indexHtml = path.join(
      app.getAppPath(),
      'renderer',
      'dist',
      'index.html'
    )
    win.loadFile(indexHtml).finally(() => win.show())
  }
}

function openDb(): Promise<DbClient> {
  const dbDir = app.getPath('userData')
  fs.mkdirSync(dbDir, { recursive: true })
  return openDbClient({
    spawn: threadSpawner(
      path.join(__dirname, 'db', 'worker.js'),
      path.join(dbDir, 'app.db')
    ),
    readers: READER_THREADS,
  })
}

async function start() {
  try {
    db = await openDb()
  } catch (error) {
    dialog.showErrorBox(
      'Cannot open the database',
      error instanceof Error ? error.message : String(error)
    )
    app.exit(1)
    return
  }
  registerDbIpc(ipcMain, db, () => BrowserWindow.getAllWindows())
  createWindow()
  app.on(
    'activate',
    () => BrowserWindow.getAllWindows().length === 0 && createWindow()
  )
}

// A second process would be a second writer on the same database file.
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })
  app.whenReady().then(start)
} else {
  app.quit()
}

app.on('before-quit', (event) => {
  if (!db) return
  event.preventDefault()
  const closing = db.close()
  db = undefined
  closing.finally(() => app.quit())
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
