import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type CliStatus =
  | { found: true; path: string; version: string }
  | { found: false; guidance: string }

export function installGuidance(): string {
  return [
    'Claude Code CLI was not found.',
    'Install Claude Code from https://code.claude.com/docs/en/overview then click Check again.',
    'Or use Browse to select your claude binary.',
  ].join('\n')
}

async function defaultWhich(bin: string): Promise<string | null> {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(cmd, [bin])
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return first || null
  } catch {
    return null
  }
}

const FALLBACKS = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  path.join(process.env.HOME ?? '', '.local/bin/claude'),
]

export async function detectClaudeCli(opts?: {
  explicitPath?: string
  which?: (bin: string) => Promise<string | null>
  exec?: typeof execFileAsync
  fallbacks?: string[]
}): Promise<CliStatus> {
  const which = opts?.which ?? defaultWhich
  const exec = opts?.exec ?? execFileAsync
  // Custom which (tests) skips disk fallbacks unless explicitly provided
  const fallbacks = opts?.fallbacks ?? (opts?.which ? [] : FALLBACKS)

  const candidates: string[] = []
  if (opts?.explicitPath) candidates.push(opts.explicitPath)
  const fromPath = await which('claude')
  if (fromPath) candidates.push(fromPath)
  for (const fb of fallbacks) {
    if (fb) candidates.push(fb)
  }

  for (const candidate of candidates) {
    try {
      // Injected exec (unit tests) may target paths that do not exist on disk
      if (!opts?.exec && !fs.existsSync(candidate)) continue
      const { stdout } = await exec(candidate, ['--version'])
      const version = String(stdout).trim() || 'unknown'
      return { found: true, path: candidate, version }
    } catch {
      // try next
    }
  }

  return { found: false, guidance: installGuidance() }
}
