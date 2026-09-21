import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ccd', {
  ping: () => 'pong',
})
