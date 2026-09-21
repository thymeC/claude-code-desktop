import { describe, expect, it } from 'vitest'
import { detectClaudeCli, installGuidance } from '../electron/bridge/cli-detector'

describe('detectClaudeCli', () => {
  it('returns found when which + version succeed', async () => {
    const status = await detectClaudeCli({
      which: async () => '/opt/homebrew/bin/claude',
      exec: (async (_file, _args) => ({ stdout: '2.1.22 (Claude Code)\n' })) as never,
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
    })
    expect(status).toMatchObject({ found: true, path: '/custom/claude' })
  })
})

describe('installGuidance', () => {
  it('mentions official install', () => {
    expect(installGuidance()).toMatch(/code\.claude\.com|Claude Code/i)
  })
})
