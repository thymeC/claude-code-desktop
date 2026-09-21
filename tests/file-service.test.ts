import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_FILES_PER_TURN, validateAndStage } from '../electron/bridge/file-service'

describe('validateAndStage', () => {
  it('stages existing small files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    const src = path.join(dir, 'a.txt')
    fs.writeFileSync(src, 'hello')
    const staging = path.join(dir, 'stage')
    const refs = validateAndStage([src], staging)
    expect(refs).toHaveLength(1)
    expect(fs.existsSync(refs[0].path)).toBe(true)
  })

  it('rejects more than MAX_FILES_PER_TURN', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    const paths = Array.from({ length: MAX_FILES_PER_TURN + 1 }, (_, i) => {
      const p = path.join(dir, `${i}.txt`)
      fs.writeFileSync(p, 'x')
      return p
    })
    expect(() => validateAndStage(paths, path.join(dir, 'stage'))).toThrow(/10/)
  })
})
