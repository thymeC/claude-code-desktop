import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, safeStorage } from 'electron'

export type AuthSource = 'env' | 'stored' | 'claude-login' | null

export interface AuthStatus {
  authenticated: boolean
  source: AuthSource
  /** True when a key is saved in app storage (not env / CLI login). */
  hasStoredKey: boolean
}

function keyFilePath() {
  return path.join(app.getPath('userData'), 'api-key.bin')
}

function claudeLoginLooksPresent(): boolean {
  const home = os.homedir()
  const candidates = [
    path.join(home, '.claude', '.credentials.json'),
    path.join(home, '.claude', 'credentials.json'),
    path.join(home, '.config', 'claude', 'credentials.json'),
    path.join(home, '.claude.json'),
  ]
  return candidates.some((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).size > 0
    } catch {
      return false
    }
  })
}

export function getStoredApiKey(): string | null {
  try {
    const file = keyFilePath()
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file)
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }
    return raw.toString('utf8')
  } catch {
    return null
  }
}

export function saveApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('API key cannot be empty')
  fs.mkdirSync(path.dirname(keyFilePath()), { recursive: true })
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyFilePath(), safeStorage.encryptString(trimmed))
  } else {
    fs.writeFileSync(keyFilePath(), trimmed, { mode: 0o600 })
  }
}

export function clearApiKey(): void {
  try {
    fs.rmSync(keyFilePath(), { force: true })
  } catch {
    // ignore
  }
}

/** Resolve the API key to inject into Claude Code process env, if any. */
export function resolveApiKeyForEnv(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim()
  if (fromEnv) return fromEnv
  return getStoredApiKey() ?? undefined
}

export function getAuthStatus(): AuthStatus {
  const hasStoredKey = Boolean(getStoredApiKey())
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return { authenticated: true, source: 'env', hasStoredKey }
  }
  if (hasStoredKey) {
    return { authenticated: true, source: 'stored', hasStoredKey }
  }
  // Claude CLI login alone is not treated as an API key — prompt the user.
  if (claudeLoginLooksPresent()) {
    return { authenticated: false, source: 'claude-login', hasStoredKey: false }
  }
  return { authenticated: false, source: null, hasStoredKey: false }
}
