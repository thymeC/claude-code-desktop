import { contextBridge, ipcRenderer } from 'electron'
import type { AttachmentRef, PermissionDecision } from './bridge/types'

contextBridge.exposeInMainWorld('ccd', {
  cliCheck: () => ipcRenderer.invoke('cli:check'),
  cliBrowse: () => ipcRenderer.invoke('cli:browse'),
  projectOpen: () => ipcRenderer.invoke('project:open'),
  projectGet: () => ipcRenderer.invoke('project:get'),
  sessionNew: (projectPath: string) => ipcRenderer.invoke('session:new', projectPath),
  sessionResume: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke('session:resume', { projectPath, sessionId }),
  sessionList: (projectPath: string) => ipcRenderer.invoke('session:list', projectPath),
  chatSend: (text: string, attachments?: AttachmentRef[]) =>
    ipcRenderer.invoke('chat:send', { text, attachments }),
  chatStop: () => ipcRenderer.invoke('chat:stop'),
  chatRespondPermission: (decision: PermissionDecision) =>
    ipcRenderer.invoke('chat:respondPermission', decision),
  filesPick: () => ipcRenderer.invoke('files:pick'),
  filesStagePaths: (paths: string[]) => ipcRenderer.invoke('files:stagePaths', paths),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (partial: Record<string, unknown>) => ipcRenderer.invoke('settings:set', partial),
  onChatEvent: (cb: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => cb(event)
    ipcRenderer.on('chat:event', listener)
    return () => ipcRenderer.removeListener('chat:event', listener)
  },
  onCliStatus: (cb: (status: unknown) => void) => {
    const listener = (_: unknown, status: unknown) => cb(status)
    ipcRenderer.on('cli:status', listener)
    return () => ipcRenderer.removeListener('cli:status', listener)
  },
  onSessionUpdated: (cb: (payload: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on('session:updated', listener)
    return () => ipcRenderer.removeListener('session:updated', listener)
  },
})
