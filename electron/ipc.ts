import { BrowserWindow, clipboard, dialog, ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { ClaudeBridge } from './bridge/claude-bridge'
import { detectClaudeCli } from './bridge/cli-detector'
import { loadSettings, saveSettings } from './bridge/app-settings'
import { stageImageBuffer, validateAndStage } from './bridge/file-service'
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

async function requireClaude() {
  const settings = loadSettings()
  const status = await detectClaudeCli({ explicitPath: settings.claudePath })
  if (!status.found) throw new Error(status.guidance)
  return { settings, status }
}

function startBridge(opts: {
  projectPath: string
  sessionId?: string
  resume?: boolean
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  claudePath: string
}) {
  bridge.stop()
  bridge.start({
    claudePath: opts.claudePath,
    projectPath: opts.projectPath,
    sessionId: opts.sessionId,
    resume: opts.resume,
    permissionMode: opts.permissionMode,
    onEvent: (event) => {
      send('chat:event', event)
      if (event.sessionId) saveSettings({ lastSessionId: event.sessionId })
    },
    onExit: (code) => {
      send('chat:event', {
        schemaVersion: SCHEMA_VERSION,
        type: 'done',
        error: code && code !== 0 ? `Claude exited with code ${code}` : undefined,
      })
    },
  })
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
    const { settings, status } = await requireClaude()
    saveSettings({ lastProjectPath: projectPath, lastSessionId: undefined })
    // Let Claude Code allocate the session id — do not force a pre-created UUID
    startBridge({
      claudePath: status.path,
      projectPath,
      permissionMode: settings.permissionMode,
    })
    send('session:updated', { projectPath })
    return { ok: true as const, sessionId: null }
  })

  ipcMain.handle('session:resume', async (_e, payload: { projectPath: string; sessionId: string }) => {
    const { settings, status } = await requireClaude()
    saveSettings({ lastProjectPath: payload.projectPath, lastSessionId: payload.sessionId })
    startBridge({
      claudePath: status.path,
      projectPath: payload.projectPath,
      sessionId: payload.sessionId,
      resume: true,
      permissionMode: settings.permissionMode,
    })
    send('session:updated', { projectPath: payload.projectPath })
    return { ok: true as const }
  })

  ipcMain.handle('chat:send', async (_e, payload: { text: string; attachments?: AttachmentRef[] }) => {
    if (!bridge.running) {
      throw new Error('No active chat. Click + New to start a session.')
    }
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
      title: 'Attach files or images',
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return validateAndStage(result.filePaths, stagingDir())
  })

  ipcMain.handle('files:pickImages', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      title: 'Attach images',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return []
    return validateAndStage(result.filePaths, stagingDir())
  })

  ipcMain.handle('files:stagePaths', async (_e, paths: string[]) => {
    return validateAndStage(paths, stagingDir())
  })

  ipcMain.handle('files:pasteImage', async () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) {
      throw new Error('No image on clipboard. Copy an image first, then paste.')
    }
    const png = image.toPNG()
    return stageImageBuffer(Buffer.from(png), stagingDir(), {
      name: `clipboard-${Date.now()}.png`,
      mimeType: 'image/png',
    })
  })

  ipcMain.handle('clipboard:writeText', async (_e, text: string) => {
    clipboard.writeText(text)
    return true
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
