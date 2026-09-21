import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppSettings {
  claudePath?: string
  lastProjectPath?: string
  lastSessionId?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  /** UI font scale: 12–20 (px base). Default 14. */
  fontSize?: number
  /** Recently opened project folders (most recent first). */
  recentProjects?: string[]
  /** claude = Claude Code CLI; openai = OpenAI-compatible HTTP for testing */
  chatProvider?: 'claude' | 'openai'
  openaiBaseUrl?: string
  openaiModel?: string
  /** Claude Code CLI --model (empty = CLI default) */
  claudeModel?: string
  /** User catalog: enable/disable + custom models (Cursor-style) */
  modelCatalog?: Array<{
    id: string
    label: string
    provider: 'claude' | 'openai'
    enabled: boolean
    custom?: boolean
    fromApi?: boolean
  }>
}

const MAX_RECENT_PROJECTS = 20

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as AppSettings
  } catch {
    return {}
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const next: AppSettings = { ...loadSettings(), ...partial }
  for (const key of Object.keys(partial) as (keyof AppSettings)[]) {
    if (partial[key] === undefined) delete next[key]
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

/** Ensure project is in the list and set as current — does not reorder existing entries. */
export function rememberProject(
  projectPath: string,
  opts?: { preferFront?: boolean },
): AppSettings {
  const settings = loadSettings()
  const normalized = projectPath
  let recent = [...(settings.recentProjects ?? [])]
  if (!recent.includes(normalized)) {
    recent = opts?.preferFront ? [normalized, ...recent] : [...recent, normalized]
  }
  return saveSettings({
    lastProjectPath: normalized,
    recentProjects: recent.slice(0, MAX_RECENT_PROJECTS),
  })
}

export function listRecentProjects(): string[] {
  const settings = loadSettings()
  const list = [...(settings.recentProjects ?? [])]
  if (settings.lastProjectPath && !list.includes(settings.lastProjectPath)) {
    list.push(settings.lastProjectPath)
  }
  return list.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })
}

export function removeRecentProject(projectPath: string): AppSettings {
  const settings = loadSettings()
  const recent = (settings.recentProjects ?? []).filter((p) => p !== projectPath)
  const lastProjectPath =
    settings.lastProjectPath === projectPath ? recent[0] : settings.lastProjectPath
  return saveSettings({ recentProjects: recent, lastProjectPath })
}

/** Persist an explicit repo order from the UI (drag-and-drop). */
export function reorderProjects(orderedPaths: string[]): AppSettings {
  const existing = listRecentProjects()
  const existingSet = new Set(existing)
  const next: string[] = []
  for (const p of orderedPaths) {
    if (existingSet.has(p) && !next.includes(p)) next.push(p)
  }
  for (const p of existing) {
    if (!next.includes(p)) next.push(p)
  }
  return saveSettings({ recentProjects: next.slice(0, MAX_RECENT_PROJECTS) })
}
