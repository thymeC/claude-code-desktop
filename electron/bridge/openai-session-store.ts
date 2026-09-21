import fs from 'node:fs'
import path from 'node:path'
import { encodeProjectPath, type SessionSummary, type TranscriptMessage } from './session-store'

export interface OpenAiStoredSession {
  id: string
  projectPath: string
  updatedAt: number
  preview?: string
  /** Display transcript */
  messages: TranscriptMessage[]
  /** Serialized API turns (user/assistant text only) for resume */
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

function sessionsRoot(userData: string) {
  return path.join(userData, 'openai-sessions')
}

function projectDir(userData: string, projectPath: string) {
  return path.join(sessionsRoot(userData), encodeProjectPath(projectPath))
}

function sessionFile(userData: string, projectPath: string, sessionId: string) {
  return path.join(projectDir(userData, projectPath), `${sessionId}.json`)
}

export function listOpenAiSessions(userData: string, projectPath: string): SessionSummary[] {
  const dir = projectDir(userData, projectPath)
  if (!fs.existsSync(dir)) return []
  const out: SessionSummary[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const id = name.replace(/\.json$/, '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as OpenAiStoredSession
      out.push({
        id,
        mtime: raw.updatedAt || fs.statSync(path.join(dir, name)).mtimeMs,
        preview: raw.preview,
        source: 'openai',
      })
    } catch {
      // skip corrupt
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

export function loadOpenAiSession(
  userData: string,
  projectPath: string,
  sessionId: string,
): OpenAiStoredSession | null {
  const full = sessionFile(userData, projectPath, sessionId)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8')) as OpenAiStoredSession
  } catch {
    return null
  }
}

export function saveOpenAiSession(
  userData: string,
  session: OpenAiStoredSession,
): void {
  const dir = projectDir(userData, session.projectPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(sessionFile(userData, session.projectPath, session.id), JSON.stringify(session, null, 2))
}

export function openAiTranscript(
  userData: string,
  projectPath: string,
  sessionId: string,
): TranscriptMessage[] {
  return loadOpenAiSession(userData, projectPath, sessionId)?.messages ?? []
}
