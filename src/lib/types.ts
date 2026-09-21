export const SCHEMA_VERSION = 1 as const

export type ChatEventType =
  | 'partial'
  | 'message'
  | 'tool'
  | 'permission_request'
  | 'error'
  | 'done'
  | 'session'

export interface ChatEvent {
  schemaVersion: typeof SCHEMA_VERSION
  type: ChatEventType
  text?: string
  role?: 'user' | 'assistant' | 'system'
  toolName?: string
  toolInput?: unknown
  requestId?: string
  sessionId?: string
  error?: string
  raw?: unknown
}

export interface PermissionDecision {
  requestId: string
  decision: 'approve' | 'deny'
}

export interface AttachmentRef {
  path: string
  name: string
  mimeType: string
  size: number
  previewDataUrl?: string
}

export type CliStatus =
  | { found: true; path: string; version: string }
  | { found: false; guidance: string }

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

export interface SessionSummary {
  id: string
  mtime: number
  preview?: string
  source?: 'claude' | 'openai'
}

export interface AppSettings {
  claudePath?: string
  lastProjectPath?: string
  lastSessionId?: string
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  fontSize?: number
  recentProjects?: string[]
  chatProvider?: ChatProvider
  openaiBaseUrl?: string
  openaiModel?: string
  /** Claude Code CLI --model (empty = CLI default) */
  claudeModel?: string
  modelCatalog?: Array<{
    id: string
    label: string
    provider: ChatProvider
    enabled: boolean
    custom?: boolean
    fromApi?: boolean
  }>
}
