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
}
