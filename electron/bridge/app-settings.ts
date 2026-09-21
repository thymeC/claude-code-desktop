import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppSettings {
  claudePath?: string
  lastProjectPath?: string
  lastSessionId?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
}

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
  const next = { ...loadSettings(), ...partial }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
