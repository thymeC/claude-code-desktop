import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AttachmentRef, PermissionDecision } from './bridge/types'

contextBridge.exposeInMainWorld('ccd', {
  cliCheck: () => ipcRenderer.invoke('cli:check'),
  cliBrowse: () => ipcRenderer.invoke('cli:browse'),
  projectOpen: () => ipcRenderer.invoke('project:open'),
  projectGet: () => ipcRenderer.invoke('project:get'),
  projectList: () => ipcRenderer.invoke('project:list'),
  projectSelect: (projectPath: string) => ipcRenderer.invoke('project:select', projectPath),
  projectReorder: (orderedPaths: string[]) => ipcRenderer.invoke('project:reorder', orderedPaths),
  projectRemove: (projectPath: string) => ipcRenderer.invoke('project:remove', projectPath),
  sessionNew: (projectPath: string) => ipcRenderer.invoke('session:new', projectPath),
  sessionResume: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke('session:resume', { projectPath, sessionId }),
  sessionList: (projectPath: string) => ipcRenderer.invoke('session:list', projectPath),
  sessionTranscript: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke('session:transcript', { projectPath, sessionId }),
  sessionLive: () => ipcRenderer.invoke('session:live'),
  chatSend: (text: string, attachments?: AttachmentRef[]) =>
    ipcRenderer.invoke('chat:send', { text, attachments }),
  chatStop: () => ipcRenderer.invoke('chat:stop'),
  chatRespondPermission: (decision: PermissionDecision) =>
    ipcRenderer.invoke('chat:respondPermission', decision),
  filesPick: () => ipcRenderer.invoke('files:pick'),
  filesPickImages: () => ipcRenderer.invoke('files:pickImages'),
  filesStagePaths: (paths: string[]) => ipcRenderer.invoke('files:stagePaths', paths),
  filesPasteImage: () => ipcRenderer.invoke('files:pasteImage'),
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (partial: Record<string, unknown>) => ipcRenderer.invoke('settings:set', partial),
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetApiKey: (apiKey: string) => ipcRenderer.invoke('auth:setApiKey', apiKey),
  authClearApiKey: () => ipcRenderer.invoke('auth:clearApiKey'),
  authSetOpenAi: (payload: { apiKey?: string; baseUrl?: string; model?: string }) =>
    ipcRenderer.invoke('auth:setOpenAi', payload),
  authClearOpenAi: () => ipcRenderer.invoke('auth:clearOpenAi'),
  authSetProvider: (provider: 'claude' | 'openai') =>
    ipcRenderer.invoke('auth:setProvider', provider),
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
