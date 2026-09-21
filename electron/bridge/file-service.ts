import fs from 'node:fs'
import path from 'node:path'
import type { AttachmentRef } from './types'

export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_FILES_PER_TURN = 10

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

export function validateAndStage(paths: string[], stagingDir: string): AttachmentRef[] {
  if (paths.length > MAX_FILES_PER_TURN) {
    throw new Error(`You can attach at most ${MAX_FILES_PER_TURN} files per turn`)
  }
  fs.mkdirSync(stagingDir, { recursive: true })
  return paths.map((p) => {
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`)
    const stat = fs.statSync(p)
    if (!stat.isFile()) throw new Error(`Not a file: ${p}`)
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File exceeds 20 MB: ${path.basename(p)}`)
    }
    const name = path.basename(p)
    const dest = path.join(stagingDir, `${Date.now()}-${name}`)
    fs.copyFileSync(p, dest)
    return { path: dest, name, mimeType: mimeFor(p), size: stat.size }
  })
}

export function isImageAttachment(ref: AttachmentRef): boolean {
  return ref.mimeType.startsWith('image/') || IMAGE_EXT.has(path.extname(ref.name).toLowerCase())
}
