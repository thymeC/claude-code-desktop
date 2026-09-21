import { describe, expect, it } from 'vitest'
import {
  detectClaudeCli,
  expandWindowsCliCandidates,
  installGuidance,
  windowsCliPreference,
  cliSpawnNeedsShell,
} from '../electron/bridge/cli-detector'

describe('detectClaudeCli', () => {
  it('returns found when which + version succeed', async () => {
    const status = await detectClaudeCli({
      which: async () => '/opt/homebrew/bin/claude',
      exec: (async (_file, _args) => ({ stdout: '2.1.22 (Claude Code)\n' })) as never,
      platform: 'darwin',
    })
    expect(status).toEqual({
      found: true,
      path: '/opt/homebrew/bin/claude',
      version: '2.1.22 (Claude Code)',
    })
  })

  it('returns guidance when not found', async () => {
    const status = await detectClaudeCli({
      which: async () => null,
      explicitPath: undefined,
      platform: 'darwin',
      exists: () => false,
    })
    expect(status.found).toBe(false)
    if (!status.found) {
      expect(status.guidance).toContain('Claude Code')
    }
  })

  it('prefers explicitPath when provided', async () => {
    const status = await detectClaudeCli({
      explicitPath: '/custom/claude',
      which: async () => '/opt/homebrew/bin/claude',
      exec: (async () => ({ stdout: '9.9.9\n' })) as never,
      platform: 'darwin',
    })
    expect(status).toMatchObject({ found: true, path: '/custom/claude' })
  })

  it('on Windows prefers .cmd over extensionless path from where', async () => {
    const tried: string[] = []
    const status = await detectClaudeCli({
      platform: 'win32',
      which: async () => [
        String.raw`C:\Users\me\AppData\Roaming\npm\claude`,
        String.raw`C:\Users\me\AppData\Roaming\npm\claude.cmd`,
      ],
      exists: (p) =>
        p.endsWith('claude.cmd') || p.endsWith(String.raw`\claude`) || p.endsWith('/claude'),
      exec: (async (file: string) => {
        tried.push(file)
        return { stdout: '2.1.22 (Claude Code)\n' }
      }) as never,
      fallbacks: [],
    })
    expect(status).toMatchObject({
      found: true,
      path: String.raw`C:\Users\me\AppData\Roaming\npm\claude.cmd`,
    })
    expect(tried[0]).toMatch(/claude\.cmd$/i)
  })

  it('on Windows expands bare path to .cmd when present', async () => {
    const bare = String.raw`C:\Users\me\AppData\Roaming\npm\claude`
    const cmd = `${bare}.cmd`
    const status = await detectClaudeCli({
      platform: 'win32',
      which: async () => [bare],
      exists: (p) => p === cmd,
      exec: (async (file: string) => {
        expect(file).toBe(cmd)
        return { stdout: '2.0.0\n' }
      }) as never,
      fallbacks: [],
    })
    expect(status).toMatchObject({ found: true, path: cmd })
  })
})

describe('expandWindowsCliCandidates', () => {
  it('prefers .cmd then .exe for bare names', () => {
    const bare = String.raw`C:\npm\claude`
    const result = expandWindowsCliCandidates(bare, (p) =>
      [bare + '.cmd', bare + '.exe', bare].includes(p),
    )
    expect(result[0]).toBe(bare + '.cmd')
    expect(result[1]).toBe(bare + '.exe')
  })
})

describe('windowsCliPreference', () => {
  it('orders .cmd before .exe before bare', () => {
    const paths = ['claude', 'claude.exe', 'claude.cmd']
    expect([...paths].sort(windowsCliPreference)).toEqual(['claude.cmd', 'claude.exe', 'claude'])
  })
})

describe('cliSpawnNeedsShell', () => {
  it('is true for Windows .cmd', () => {
    expect(cliSpawnNeedsShell(String.raw`C:\npm\claude.cmd`, 'win32')).toBe(true)
    expect(cliSpawnNeedsShell('/opt/homebrew/bin/claude', 'darwin')).toBe(false)
    expect(cliSpawnNeedsShell(String.raw`C:\npm\claude.exe`, 'win32')).toBe(false)
  })
})

describe('installGuidance', () => {
  it('mentions official install', () => {
    expect(installGuidance()).toMatch(/code\.claude\.com|Claude Code/i)
  })
})
