import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MAX_FILES_PER_TURN,
  stageImageBuffer,
  validateAndStage,
} from '../electron/bridge/file-service'

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

  it('adds previewDataUrl for images', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const src = path.join(dir, 'dot.png')
    fs.writeFileSync(src, png)
    const refs = validateAndStage([src], path.join(dir, 'stage'))
    expect(refs[0].mimeType).toBe('image/png')
    expect(refs[0].previewDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe('stageImageBuffer', () => {
  it('writes clipboard image to staging', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const ref = stageImageBuffer(png, path.join(dir, 'stage'))
    expect(fs.existsSync(ref.path)).toBe(true)
    expect(ref.previewDataUrl).toBeTruthy()
  })

  it('rejects empty buffer', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    expect(() => stageImageBuffer(Buffer.alloc(0), path.join(dir, 'stage'))).toThrow(/empty/)
  })
})
