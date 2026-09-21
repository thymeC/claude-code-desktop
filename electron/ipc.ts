import { BrowserWindow, dialog, ipcMain, app } from 'electron'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { ClaudeBridge } from './bridge/claude-bridge'
import { detectClaudeCli } from './bridge/cli-detector'
import { loadSettings, saveSettings } from './bridge/app-settings'
import { validateAndStage } from './bridge/file-service'
import { listSessions } from './bridge/session-store'
import type { AttachmentRef, PermissionDecision } from './bridge/types'
import { SCHEMA_VERSION } from './bridge/types'

const bridge = new ClaudeBridge()

function stagingDir() {
  const dir = path.join(app.getPath('temp'), 'claude-code-desktop-attachments')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function send(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc() {
  ipcMain.handle('cli:check', async () => {
    const settings = loadSettings()
    const status = await detectClaudeCli({ explicitPath: settings.claudePath })
    send('cli:status', status)
    return status
  })

  ipcMain.handle('cli:browse', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select claude binary',
    })
    if (result.canceled || !result.filePaths[0]) return null
    const claudePath = result.filePaths[0]
    saveSettings({ claudePath })
    const status = await detectClaudeCli({ explicitPath: claudePath })
    send('cli:status', status)
    return status
  })

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const projectPath = result.filePaths[0]
    saveSettings({ lastProjectPath: projectPath })
    return projectPath
  })

  ipcMain.handle('project:get', async () => loadSettings().lastProjectPath ?? null)

  ipcMain.handle('session:list', async (_e, projectPath: string) => listSessions(projectPath))

  ipcMain.handle('session:new', async (_e, projectPath: string) => {
    const settings = loadSettings()
    const status = await detectClaudeCli({ explicitPath: settings.claudePath })
    if (!status.found) throw new Error(status.guidance)
    const sessionId = randomUUID()
    saveSettings({ lastProjectPath: projectPath, lastSessionId: sessionId })
    bridge.start({
      claudePath: status.path,
      projectPath,
      sessionId,
      permissionMode: settings.permissionMode,
      onEvent: (event) => {
        send('chat:event', event)
        if (event.sessionId) saveSettings({ lastSessionId: event.sessionId })
      },
      onExit: () => send('chat:event', { schemaVersion: SCHEMA_VERSION, type: 'done' }),
    })
    send('session:updated', { projectPath })
    return { ok: true, sessionId }
  })

  ipcMain.handle('session:resume', async (_e, payload: { projectPath: string; sessionId: string }) => {
    const settings = loadSettings()
    const status = await detectClaudeCli({ explicitPath: settings.claudePath })
    if (!status.found) throw new Error(status.guidance)
    saveSettings({ lastProjectPath: payload.projectPath, lastSessionId: payload.sessionId })
    bridge.start({
      claudePath: status.path,
      projectPath: payload.projectPath,
      sessionId: payload.sessionId,
      resume: true,
      permissionMode: settings.permissionMode,
      onEvent: (event) => send('chat:event', event),
      onExit: () => send('chat:event', { schemaVersion: SCHEMA_VERSION, type: 'done' }),
    })
    send('session:updated', { projectPath: payload.projectPath })
    return { ok: true }
  })

  ipcMain.handle('chat:send', async (_e, payload: { text: string; attachments?: AttachmentRef[] }) => {
    bridge.sendMessage(payload.text, payload.attachments ?? [])
  })

  ipcMain.handle('chat:stop', async () => {
    bridge.stop()
  })

  ipcMain.handle('chat:respondPermission', async (_e, decision: PermissionDecision) => {
    bridge.respondPermission(decision)
  })

  ipcMain.handle('files:pick', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Attach files',
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return validateAndStage(result.filePaths, stagingDir())
  })

  ipcMain.handle('files:stagePaths', async (_e, paths: string[]) => {
    return validateAndStage(paths, stagingDir())
  })

  ipcMain.handle('settings:get', async () => loadSettings())
  ipcMain.handle(
    'settings:set',
    async (_e, partial: Parameters<typeof saveSettings>[0]) => saveSettings(partial),
  )
}

export function stopBridge() {
  bridge.stop()
}

export function clearAttachmentStaging() {
  const dir = path.join(app.getPath('temp'), 'claude-code-desktop-attachments')
  fs.rmSync(dir, { recursive: true, force: true })
}
