import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  DB_CALL_CHANNEL,
  DB_CHANGED_CHANNEL,
  DbApi,
  TableName,
} from '../shared/contract'

// A sandboxed preload cannot require local modules, so the channel names are
// repeated here and checked against the contract by type.
const CALL: typeof DB_CALL_CHANNEL = 'db:call'
const CHANGED: typeof DB_CHANGED_CHANNEL = 'db:changed'

const api: DbApi = {
  call: (name, input) => ipcRenderer.invoke(CALL, name, input),
  onChange: (listener) => {
    const handler = (_event: IpcRendererEvent, tables: TableName[]) =>
      listener(tables)
    ipcRenderer.on(CHANGED, handler)
    return () => ipcRenderer.removeListener(CHANGED, handler)
  },
}

contextBridge.exposeInMainWorld('db', api)
