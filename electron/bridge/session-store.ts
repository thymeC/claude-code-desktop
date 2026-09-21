import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface SessionSummary {
  id: string
  mtime: number
  preview?: string
  source?: 'claude' | 'openai'
}

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
}

/** Claude Code encodes absolute project paths by replacing path seps with '-'. */
export function encodeProjectPath(projectPath: string): string {
  const resolved = path.resolve(projectPath)
  return resolved.replace(/[/\\:]/g, '-')
}

export function sessionsDirForProject(
  projectPath: string,
  claudeHome = path.join(os.homedir(), '.claude'),
): string {
  return path.join(claudeHome, 'projects', encodeProjectPath(projectPath))
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b) => {
      if (typeof b === 'string') return b
      if (typeof b === 'object' && b && 'text' in b) return String((b as { text: string }).text)
      return ''
    })
    .join('')
}

function previewFromJsonl(full: string): string | undefined {
  try {
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const parsed = JSON.parse(line) as {
        type?: string
        message?: { content?: unknown }
      }
      // Prefer user/assistant; also allow legacy fixtures with only message.content
      if (parsed.type && parsed.type !== 'user' && parsed.type !== 'assistant') continue
      const text = contentToText(parsed.message?.content).trim()
      if (text) return text.slice(0, 80)
    }
  } catch {
    // ignore
  }
  return undefined
}

export function listClaudeSessions(
  projectPath: string,
  opts?: { claudeHome?: string },
): SessionSummary[] {
  const dir = sessionsDirForProject(projectPath, opts?.claudeHome)
  if (!fs.existsSync(dir)) return []

  const sessions: SessionSummary[] = []
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue
    const id = name.replace(/\.jsonl$/, '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    sessions.push({
      id,
      mtime: stat.mtimeMs,
      preview: previewFromJsonl(full),
      source: 'claude',
    })
  }
  return sessions.sort((a, b) => b.mtime - a.mtime)
}

/** @deprecated Prefer listClaudeSessions; kept for tests. */
export function listSessions(
  projectPath: string,
  opts?: { claudeHome?: string },
): SessionSummary[] {
  return listClaudeSessions(projectPath, opts)
}

export function loadClaudeTranscript(
  projectPath: string,
  sessionId: string,
  opts?: { claudeHome?: string },
): TranscriptMessage[] {
  const full = path.join(
    sessionsDirForProject(projectPath, opts?.claudeHome),
    `${sessionId}.jsonl`,
  )
  if (!fs.existsSync(full)) return []

  const items: TranscriptMessage[] = []
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue
    let parsed: {
      type?: string
      uuid?: string
      message?: { role?: string; content?: unknown }
    }
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (parsed.type !== 'user' && parsed.type !== 'assistant') continue
    const text = contentToText(parsed.message?.content).trim()
    if (!text) continue
    const role: TranscriptMessage['role'] =
      parsed.type === 'user' || parsed.message?.role === 'user' ? 'user' : 'assistant'
    // Skip duplicate consecutive identical assistant/user blobs from stream retries
    const last = items[items.length - 1]
    if (last && last.role === role && last.text === text) continue
    items.push({
      id: parsed.uuid ?? `${role}-${items.length}`,
      role,
      text,
    })
  }
  return items
}
