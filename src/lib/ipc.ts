import type {
  AppSettings,
  AttachmentRef,
  AuthStatus,
  ChatEvent,
  CliStatus,
  PermissionDecision,
  SessionSummary,
} from './types'

export interface CcdApi {
  cliCheck: () => Promise<CliStatus>
  cliBrowse: () => Promise<CliStatus | null>
  projectOpen: () => Promise<string | null>
  projectGet: () => Promise<string | null>
  projectList: () => Promise<string[]>
  projectSelect: (projectPath: string) => Promise<string | null>
  projectReorder: (orderedPaths: string[]) => Promise<string[]>
  projectRemove: (projectPath: string) => Promise<string[]>
  sessionNew: (projectPath: string) => Promise<{ ok: true; sessionId: string | null }>
  sessionResume: (projectPath: string, sessionId: string) => Promise<{
    ok: true
    alreadyLive?: boolean
  }>
  sessionList: (projectPath: string) => Promise<SessionSummary[]>
  sessionTranscript: (
    projectPath: string,
    sessionId: string,
  ) => Promise<Array<{ id: string; role: 'user' | 'assistant' | 'system'; text: string }>>
  sessionLive: () => Promise<{
    sessionId: string | null
    pending: boolean
    running: boolean
  }>
  chatSend: (text: string, attachments?: AttachmentRef[]) => Promise<void>
  chatStop: () => Promise<void>
  chatRespondPermission: (decision: PermissionDecision) => Promise<void>
  settingsGet: () => Promise<AppSettings>
  settingsSet: (partial: Partial<AppSettings>) => Promise<AppSettings>
  authStatus: () => Promise<AuthStatus>
  authSetApiKey: (apiKey: string) => Promise<AuthStatus>
  authClearApiKey: () => Promise<AuthStatus>
  authSetOpenAi: (payload: {
    apiKey?: string
    baseUrl?: string
    model?: string
  }) => Promise<AuthStatus>
  authClearOpenAi: () => Promise<AuthStatus>
  authSetProvider: (provider: 'claude' | 'openai') => Promise<AuthStatus>
  filesPick: () => Promise<AttachmentRef[]>
  filesPickImages: () => Promise<AttachmentRef[]>
  filesStagePaths: (paths: string[]) => Promise<AttachmentRef[]>
  filesPasteImage: () => Promise<AttachmentRef>
  clipboardWriteText: (text: string) => Promise<boolean>
  getPathForFile: (file: File) => string
  onChatEvent: (cb: (event: ChatEvent) => void) => () => void
  onCliStatus: (cb: (status: CliStatus) => void) => () => void
  onSessionUpdated: (cb: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    ccd: CcdApi
  }
}

export const ccd = () => window.ccd
