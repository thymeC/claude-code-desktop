import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeProjectPath, listSessions } from '../electron/bridge/session-store'

describe('encodeProjectPath', () => {
  it('replaces path separators', () => {
    expect(encodeProjectPath('/Users/me/proj')).toContain('-Users-me-proj')
  })
})

describe('listSessions', () => {
  it('returns sessions sorted by mtime desc', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-home-'))
    const project = '/tmp/demo-project'
    const dir = path.join(home, 'projects', encodeProjectPath(project))
    fs.mkdirSync(dir, { recursive: true })

    const older = '11111111-1111-1111-1111-111111111111.jsonl'
    const newer = '22222222-2222-2222-2222-222222222222.jsonl'
    fs.writeFileSync(
      path.join(dir, older),
      `${JSON.stringify({ message: { content: 'old' } })}\n`,
    )
    const olderTime = Date.now() - 10_000
    fs.utimesSync(path.join(dir, older), olderTime / 1000, olderTime / 1000)

    fs.writeFileSync(
      path.join(dir, newer),
      `${JSON.stringify({ message: { content: [{ type: 'text', text: 'fresh hello' }] } })}\n`,
    )

    const sessions = listSessions(project, { claudeHome: home })
    expect(sessions).toHaveLength(2)
    expect(sessions[0].id).toBe('22222222-2222-2222-2222-222222222222')
    expect(sessions[0].preview).toContain('fresh')
  })
})
