import { BrowserWindow, clipboard, dialog, ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { ClaudeBridge } from './bridge/claude-bridge'
import { OpenAiChat } from './bridge/openai-chat'
import { detectClaudeCli } from './bridge/cli-detector'
import {
  loadSettings,
  saveSettings,
  rememberProject,
  listRecentProjects,
  removeRecentProject,
  reorderProjects,
} from './bridge/app-settings'
import { stageImageBuffer, validateAndStage } from './bridge/file-service'
import { listClaudeSessions, loadClaudeTranscript } from './bridge/session-store'
import {
  listOpenAiSessions,
  loadOpenAiSession,
  openAiTranscript,
} from './bridge/openai-session-store'
import {
  clearApiKey,
  clearOpenAiKey,
  getAuthStatus,
  getProvider,
  resolveApiKeyForEnv,
  resolveOpenAiKey,
  saveApiKey,
  saveOpenAiKey,
} from './bridge/auth'
import { fetchOpenAiModels } from './bridge/openai-models'
import { fetchAnthropicModels } from './bridge/anthropic-models'
import type { AttachmentRef, PermissionDecision } from './bridge/types'
import { SCHEMA_VERSION } from './bridge/types'

const bridge = new ClaudeBridge()
const openaiChat = new OpenAiChat()

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
  const auth = getAuthStatus()
  if (!auth.authenticated || auth.provider !== 'claude') {
    throw new Error('No Anthropic API key configured.')
  }
  return { settings, status }
}

function requireOpenAi() {
  const settings = loadSettings()
  const auth = getAuthStatus()
  if (!auth.authenticated || auth.provider !== 'openai') {
    throw new Error('No OpenAI API key configured.')
  }
  const apiKey = resolveOpenAiKey()
  if (!apiKey) throw new Error('No OpenAI API key configured.')
  return {
    settings,
    apiKey,
    baseUrl: (settings.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: settings.openaiModel ?? 'gpt-4o-mini',
  }
}

function startClaudeBridge(opts: {
  projectPath: string
  sessionId?: string
  resume?: boolean
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  claudePath: string
  model?: string
}) {
  openaiChat.stop()
  bridge.stop()
  const apiKey = resolveApiKeyForEnv()
  bridge.start({
    claudePath: opts.claudePath,
    projectPath: opts.projectPath,
    sessionId: opts.sessionId,
    resume: opts.resume,
    permissionMode: opts.permissionMode,
    model: opts.model,
    apiKey,
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

function startOpenAiChat(projectPath: string, opts?: { sessionId?: string; seedHistory?: Array<{ role: 'user' | 'assistant'; content: string }> }) {
  bridge.stop()
  const { apiKey, baseUrl, model } = requireOpenAi()
  openaiChat.start({
    baseUrl,
    apiKey,
    model,
    projectPath,
    userData: app.getPath('userData'),
    sessionId: opts?.sessionId,
    seedHistory: opts?.seedHistory,
    onEvent: (event) => {
      send('chat:event', event)
      if (event.sessionId) saveSettings({ lastSessionId: event.sessionId })
    },
  })
}

function mergedSessions(projectPath: string) {
  const claude = listClaudeSessions(projectPath)
  const openai = listOpenAiSessions(app.getPath('userData'), projectPath)
  const byId = new Map<string, (typeof claude)[0]>()
  for (const s of claude) byId.set(s.id, s)
  for (const s of openai) {
    const prev = byId.get(s.id)
    if (!prev || s.mtime >= prev.mtime) byId.set(s.id, s)
  }
  return [...byId.values()].sort((a, b) => b.mtime - a.mtime)
}

function loadTranscript(projectPath: string, sessionId: string) {
  const openai = openAiTranscript(app.getPath('userData'), projectPath, sessionId)
  if (openai.length) return openai
  return loadClaudeTranscript(projectPath, sessionId)
}

export function registerIpc() {
  ipcMain.handle('cli:check', async () => {
    const settings = loadSettings()
    const status = await detectClaudeCli({ explicitPath: settings.claudePath })
    send('cli:status', status)
    return status
  })

  ipcMain.handle('auth:status', async () => getAuthStatus())

  ipcMain.handle('openai:listModels', async (_e, opts?: { idPrefix?: string }) => {
    const settings = loadSettings()
    const apiKey = resolveOpenAiKey()
    const baseUrl = (settings.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
    if (!apiKey) {
      return { ok: false as const, models: null, error: 'No OpenAI API key configured.' }
    }
    const result = await fetchOpenAiModels({
      baseUrl,
      apiKey,
      idPrefix: opts?.idPrefix,
    })
    if (!result.ok) {
      return { ok: false as const, models: null, error: result.error }
    }
    return { ok: true as const, models: result.models, error: null }
  })

  ipcMain.handle('anthropic:listModels', async () => {
    const apiKey = resolveApiKeyForEnv()
    if (!apiKey) {
      return {
        ok: false as const,
        models: null,
        error: 'No Anthropic API key configured. Save a key in Settings to refresh models.',
      }
    }
    const result = await fetchAnthropicModels({ apiKey })
    if (!result.ok) {
      return { ok: false as const, models: null, error: result.error }
    }
    return { ok: true as const, models: result.models, error: null }
  })

  ipcMain.handle('auth:setApiKey', async (_e, apiKey: string) => {
    saveApiKey(apiKey)
    saveSettings({ chatProvider: 'claude' })
    return getAuthStatus()
  })

  ipcMain.handle('auth:clearApiKey', async () => {
    clearApiKey()
    return getAuthStatus()
  })

  ipcMain.handle(
    'auth:setOpenAi',
    async (
      _e,
      payload: { apiKey?: string; baseUrl?: string; model?: string },
    ) => {
      const key = payload.apiKey?.trim()
      if (key) {
        saveOpenAiKey(key)
      } else if (!resolveOpenAiKey()) {
        throw new Error('OpenAI API key is required')
      }
      saveSettings({
        chatProvider: 'openai',
        openaiBaseUrl: (payload.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        openaiModel: payload.model?.trim() || 'gpt-4o-mini',
      })
      return getAuthStatus()
    },
  )

  ipcMain.handle('auth:clearOpenAi', async () => {
    clearOpenAiKey()
    saveSettings({ chatProvider: 'claude' })
    return getAuthStatus()
  })

  ipcMain.handle('auth:setProvider', async (_e, provider: 'claude' | 'openai') => {
    if (provider === 'openai' && !resolveOpenAiKey()) {
      throw new Error('Save an OpenAI API key before switching to OpenAI mode')
    }
    saveSettings({ chatProvider: provider === 'openai' ? 'openai' : 'claude' })
    return getAuthStatus()
  })

  ipcMain.handle('cli:browse', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Select claude binary',
      filters:
        process.platform === 'win32'
          ? [
              { name: 'Claude CLI', extensions: ['cmd', 'exe', 'bat'] },
              { name: 'All files', extensions: ['*'] },
            ]
          : undefined,
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
    // Newly added repos go to the top; selecting later won't reshuffle
    rememberProject(projectPath, { preferFront: true })
    return projectPath
  })

  ipcMain.handle('project:get', async () => loadSettings().lastProjectPath ?? null)

  ipcMain.handle('project:list', async () => listRecentProjects())

  ipcMain.handle('project:select', async (_e, projectPath: string) => {
    if (!projectPath) return null
    rememberProject(projectPath)
    return projectPath
  })

  ipcMain.handle('project:reorder', async (_e, orderedPaths: string[]) => {
    reorderProjects(orderedPaths)
    return listRecentProjects()
  })

  ipcMain.handle('project:remove', async (_e, projectPath: string) => {
    removeRecentProject(projectPath)
    return listRecentProjects()
  })

  ipcMain.handle('session:list', async (_e, projectPath: string) => {
    return mergedSessions(projectPath)
  })

  ipcMain.handle('session:live', async () => {
    if (getProvider() === 'openai') {
      return {
        sessionId: openaiChat.sessionId,
        pending: openaiChat.pending,
        running: openaiChat.running,
      }
    }
    return {
      sessionId: null as string | null,
      pending: bridge.running,
      running: bridge.running,
    }
  })

  ipcMain.handle('session:transcript', async (_e, payload: { projectPath: string; sessionId: string }) => {
    return loadTranscript(payload.projectPath, payload.sessionId)
  })

  ipcMain.handle('session:new', async (_e, projectPath: string) => {
    rememberProject(projectPath)
    saveSettings({ lastProjectPath: projectPath, lastSessionId: undefined })

    if (getProvider() === 'openai') {
      startOpenAiChat(projectPath)
      send('session:updated', { projectPath })
      return { ok: true as const, sessionId: openaiChat.sessionId }
    }

    const { settings, status } = await requireClaude()
    startClaudeBridge({
      claudePath: status.path,
      projectPath,
      permissionMode: settings.permissionMode,
      model: settings.claudeModel,
    })
    send('session:updated', { projectPath })
    return { ok: true as const, sessionId: null }
  })

  ipcMain.handle('session:resume', async (_e, payload: { projectPath: string; sessionId: string }) => {
    saveSettings({ lastProjectPath: payload.projectPath, lastSessionId: payload.sessionId })

    if (getProvider() === 'openai') {
      // Keep in-flight work alive when switching back to the same session
      if (openaiChat.running && openaiChat.sessionId === payload.sessionId) {
        send('session:updated', { projectPath: payload.projectPath })
        return { ok: true as const, alreadyLive: true as const }
      }
      const stored = loadOpenAiSession(app.getPath('userData'), payload.projectPath, payload.sessionId)
      if (stored) {
        startOpenAiChat(payload.projectPath, { sessionId: payload.sessionId })
      } else {
        const claudeMessages = loadClaudeTranscript(payload.projectPath, payload.sessionId)
        startOpenAiChat(payload.projectPath, {
          sessionId: payload.sessionId,
          seedHistory: claudeMessages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text })),
        })
      }
      send('session:updated', { projectPath: payload.projectPath })
      return { ok: true as const, alreadyLive: false as const }
    }

    const { settings, status } = await requireClaude()
    startClaudeBridge({
      claudePath: status.path,
      projectPath: payload.projectPath,
      sessionId: payload.sessionId,
      resume: true,
      permissionMode: settings.permissionMode,
      model: settings.claudeModel,
    })
    send('session:updated', { projectPath: payload.projectPath })
    return { ok: true as const, alreadyLive: false as const }
  })

  ipcMain.handle('chat:send', async (_e, payload: { text: string; attachments?: AttachmentRef[] }) => {
    if (getProvider() === 'openai') {
      if (!openaiChat.running) {
        throw new Error('No active chat. Click + New chat to start.')
      }
      await openaiChat.sendMessage(payload.text, payload.attachments ?? [])
      return
    }
    if (!bridge.running) {
      throw new Error('No active chat. Click + New to start a session.')
    }
    bridge.sendMessage(payload.text, payload.attachments ?? [])
  })

  ipcMain.handle('chat:stop', async () => {
    openaiChat.stop()
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
    const items = await clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'))
      if (!imageType) continue
      const blob = (await item.getType(imageType)) as Blob
      const buf = Buffer.from(await blob.arrayBuffer())
      const ext = imageType.includes('jpeg') || imageType.includes('jpg') ? 'jpg' : 'png'
      return stageImageBuffer(buf, stagingDir(), {
        name: `clipboard-${Date.now()}.${ext}`,
        mimeType: imageType,
      })
    }
    throw new Error('No image on clipboard. Copy an image first, then paste.')
  })

  ipcMain.handle('clipboard:writeText', async (_e, text: string) => {
    await clipboard.writeText(text)
    return true
  })

  ipcMain.handle('settings:get', async () => loadSettings())
  ipcMain.handle('settings:set', async (_e, partial: Parameters<typeof saveSettings>[0]) => {
    const next = saveSettings(partial)
    if (typeof partial.openaiModel === 'string' && getProvider() === 'openai' && openaiChat.running) {
      openaiChat.setModel(partial.openaiModel.trim() || 'gpt-4o-mini')
    }
    return next
  })
}

export function stopBridge() {
  openaiChat.stop()
  bridge.stop()
}

export function clearAttachmentStaging() {
  const dir = path.join(app.getPath('temp'), 'claude-code-desktop-attachments')
  fs.rmSync(dir, { recursive: true, force: true })
}
