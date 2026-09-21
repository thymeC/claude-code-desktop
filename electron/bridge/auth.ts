import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, safeStorage } from 'electron'
import { loadSettings } from './app-settings'

export type ChatProvider = 'claude' | 'openai'

export type AuthSource = 'env' | 'stored' | 'claude-login' | 'openai' | null

export interface AuthStatus {
  authenticated: boolean
  source: AuthSource
  hasStoredKey: boolean
  provider: ChatProvider
  openaiBaseUrl?: string
  openaiModel?: string
}

function anthropicKeyPath() {
  return path.join(app.getPath('userData'), 'api-key.bin')
}

function openaiKeyPath() {
  return path.join(app.getPath('userData'), 'openai-api-key.bin')
}

function encryptWrite(file: string, value: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(file, safeStorage.encryptString(value))
  } else {
    fs.writeFileSync(file, value, { mode: 0o600 })
  }
}

function decryptRead(file: string): string | null {
  try {
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

export function getProvider(): ChatProvider {
  return loadSettings().chatProvider === 'openai' ? 'openai' : 'claude'
}

export function getStoredApiKey(): string | null {
  return decryptRead(anthropicKeyPath())
}

export function saveApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('API key cannot be empty')
  encryptWrite(anthropicKeyPath(), trimmed)
}

export function clearApiKey(): void {
  try {
    fs.rmSync(anthropicKeyPath(), { force: true })
  } catch {
    // ignore
  }
}

export function getStoredOpenAiKey(): string | null {
  return decryptRead(openaiKeyPath())
}

export function saveOpenAiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('API key cannot be empty')
  encryptWrite(openaiKeyPath(), trimmed)
}

export function clearOpenAiKey(): void {
  try {
    fs.rmSync(openaiKeyPath(), { force: true })
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

export function resolveOpenAiKey(): string | undefined {
  const fromEnv = process.env.OPENAI_API_KEY?.trim()
  if (fromEnv) return fromEnv
  return getStoredOpenAiKey() ?? undefined
}

export function getAuthStatus(): AuthStatus {
  const provider = getProvider()
  const settings = loadSettings()

  if (provider === 'openai') {
    const key = resolveOpenAiKey()
    const baseUrl = (settings.openaiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
    const model = settings.openaiModel ?? 'gpt-4o-mini'
    const hasStoredKey = Boolean(getStoredOpenAiKey())
    return {
      authenticated: Boolean(key),
      source: key ? (process.env.OPENAI_API_KEY?.trim() ? 'env' : 'openai') : null,
      hasStoredKey,
      provider: 'openai',
      openaiBaseUrl: baseUrl,
      openaiModel: model,
    }
  }

  const hasStoredKey = Boolean(getStoredApiKey())
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    return { authenticated: true, source: 'env', hasStoredKey, provider: 'claude' }
  }
  if (hasStoredKey) {
    return { authenticated: true, source: 'stored', hasStoredKey, provider: 'claude' }
  }
  if (claudeLoginLooksPresent()) {
    return { authenticated: false, source: 'claude-login', hasStoredKey: false, provider: 'claude' }
  }
  return { authenticated: false, source: null, hasStoredKey: false, provider: 'claude' }
}
