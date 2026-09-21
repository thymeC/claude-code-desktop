import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type CliStatus =
  | { found: true; path: string; version: string }
  | { found: false; guidance: string }

const WIN_EXTS = ['.cmd', '.exe', '.bat'] as const

export function installGuidance(): string {
  return [
    'Claude Code CLI was not found.',
    'Install Claude Code from https://code.claude.com/docs/en/overview then click Check again.',
    'Or use Browse to select your claude binary.',
  ].join('\n')
}

function isWindows(platform = process.platform) {
  return platform === 'win32'
}

/** Rank paths so Windows .cmd/.exe win over extensionless npm shims. */
export function windowsCliPreference(a: string, b: string): number {
  const score = (p: string) => {
    const ext = path.extname(p).toLowerCase()
    if (ext === '.cmd') return 0
    if (ext === '.exe') return 1
    if (ext === '.bat') return 2
    return 3
  }
  return score(a) - score(b)
}

/**
 * Expand a candidate to concrete Windows executables when needed.
 * Prefer .cmd then .exe (npm global installs ship claude.cmd).
 */
export function expandWindowsCliCandidates(
  candidate: string,
  exists: (p: string) => boolean = fs.existsSync,
): string[] {
  const trimmed = candidate.trim().replace(/^"|"$/g, '')
  if (!trimmed) return []

  const ext = path.extname(trimmed).toLowerCase()
  if (WIN_EXTS.includes(ext as (typeof WIN_EXTS)[number])) {
    return exists(trimmed) ? [trimmed] : [trimmed]
  }

  const expanded: string[] = []
  for (const winExt of WIN_EXTS) {
    const withExt = trimmed + winExt
    if (exists(withExt)) expanded.push(withExt)
  }
  // Keep bare path last as a last resort (may still work with shell)
  if (exists(trimmed) || expanded.length === 0) expanded.push(trimmed)
  return expanded
}

function windowsFallbacks(): string[] {
  const home = os.homedir()
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
  return [
    path.join(appData, 'npm', 'claude.cmd'),
    path.join(appData, 'npm', 'claude.exe'),
    path.join(localAppData, 'Programs', 'claude', 'claude.exe'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
  ]
}

function unixFallbacks(): string[] {
  return [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.local', 'bin', 'claude'),
  ]
}

async function defaultWhich(bin: string): Promise<string[]> {
  try {
    if (isWindows()) {
      // where.exe lists all matches; prefer .cmd/.exe via later sorting
      const { stdout } = await execFileAsync('where.exe', [bin])
      return stdout
        .split(/\r?\n/)
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
    }
    const { stdout } = await execFileAsync('which', [bin])
    const first = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean)
    return first ? [first] : []
  } catch {
    return []
  }
}

async function execVersion(
  file: string,
  exec: typeof execFileAsync,
): Promise<string> {
  // .cmd/.bat need a shell on Windows; CreateProcess cannot run them directly
  const needsShell = isWindows() && /\.(cmd|bat)$/i.test(file)
  const { stdout } = needsShell
    ? await exec(file, ['--version'], { shell: true, windowsHide: true })
    : await exec(file, ['--version'])
  return String(stdout).trim() || 'unknown'
}

export async function detectClaudeCli(opts?: {
  explicitPath?: string
  which?: (bin: string) => Promise<string | string[] | null>
  exec?: typeof execFileAsync
  fallbacks?: string[]
  platform?: NodeJS.Platform
  exists?: (p: string) => boolean
}): Promise<CliStatus> {
  const platform = opts?.platform ?? process.platform
  const which = opts?.which ?? defaultWhich
  const exec = opts?.exec ?? execFileAsync
  const exists = opts?.exists ?? fs.existsSync
  const win = isWindows(platform)

  const fallbacks =
    opts?.fallbacks ??
    (opts?.which ? [] : win ? windowsFallbacks() : unixFallbacks())

  const rawCandidates: string[] = []
  if (opts?.explicitPath) rawCandidates.push(opts.explicitPath)

  const fromPath = await which('claude')
  if (Array.isArray(fromPath)) rawCandidates.push(...fromPath)
  else if (fromPath) rawCandidates.push(fromPath)

  for (const fb of fallbacks) {
    if (fb) rawCandidates.push(fb)
  }

  const candidates: string[] = []
  const seen = new Set<string>()
  for (const raw of rawCandidates) {
    const expanded = win ? expandWindowsCliCandidates(raw, exists) : [raw]
    for (const c of expanded) {
      const key = c.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(c)
    }
  }

  if (win) candidates.sort(windowsCliPreference)

  for (const candidate of candidates) {
    try {
      // Injected exec (unit tests) may target paths that do not exist on disk
      if (!opts?.exec && !exists(candidate)) continue
      const version = await execVersion(candidate, exec)
      return { found: true, path: candidate, version }
    } catch {
      // try next
    }
  }

  return { found: false, guidance: installGuidance() }
}

/** Whether spawning this CLI path needs shell:true on the current platform. */
export function cliSpawnNeedsShell(cliPath: string, platform = process.platform): boolean {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(cliPath)
}
