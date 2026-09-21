import type {
  AppSettings,
  AttachmentRef,
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
  sessionNew: (projectPath: string) => Promise<{ ok: true; sessionId: string }>
  sessionResume: (projectPath: string, sessionId: string) => Promise<{ ok: true }>
  sessionList?: (projectPath: string) => Promise<SessionSummary[]>
  chatSend: (text: string, attachments?: AttachmentRef[]) => Promise<void>
  chatStop: () => Promise<void>
  chatRespondPermission: (decision: PermissionDecision) => Promise<void>
  settingsGet: () => Promise<AppSettings>
  settingsSet: (partial: Partial<AppSettings>) => Promise<AppSettings>
  filesPick?: () => Promise<AttachmentRef[]>
  filesStagePaths?: (paths: string[]) => Promise<AttachmentRef[]>
  onChatEvent: (cb: (event: ChatEvent) => void) => () => void
  onCliStatus: (cb: (status: CliStatus) => void) => () => void
}

declare global {
  interface Window {
    ccd: CcdApi
  }
}

export const ccd = () => window.ccd
