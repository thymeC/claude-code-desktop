import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface SessionSummary {
  id: string
  mtime: number
  preview?: string
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

export function listSessions(
  projectPath: string,
  opts?: { claudeHome?: string },
): SessionSummary[] {
  const dir = sessionsDirForProject(projectPath, opts?.claudeHome)
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir)
  const sessions: SessionSummary[] = []

  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue
    const id = name.replace(/\.jsonl$/, '')
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    let preview: string | undefined
    try {
      const first = fs.readFileSync(full, 'utf8').split(/\r?\n/).find((l) => l.trim())
      if (first) {
        const parsed = JSON.parse(first) as { message?: { content?: unknown } }
        const content = parsed.message?.content
        if (typeof content === 'string') preview = content.slice(0, 80)
        else if (Array.isArray(content)) {
          const text = content
            .map((b) => (typeof b === 'object' && b && 'text' in b ? String((b as { text: string }).text) : ''))
            .join('')
          if (text) preview = text.slice(0, 80)
        }
      }
    } catch {
      // ignore preview errors
    }
    sessions.push({ id, mtime: stat.mtimeMs, preview })
  }

  return sessions.sort((a, b) => b.mtime - a.mtime)
}
