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
  if (paths.length === 0) return []
  if (paths.length > MAX_FILES_PER_TURN) {
    throw new Error(`You can attach at most ${MAX_FILES_PER_TURN} files per turn`)
  }
  fs.mkdirSync(stagingDir, { recursive: true })
  return paths.map((p, index) => {
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`)
    const stat = fs.statSync(p)
    if (!stat.isFile()) throw new Error(`Not a file: ${p}`)
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File exceeds 20 MB: ${path.basename(p)}`)
    }
    const name = path.basename(p)
    const dest = path.join(stagingDir, `${Date.now()}-${index}-${name}`)
    fs.copyFileSync(p, dest)
    const mimeType = mimeFor(p)
    const ref: AttachmentRef = { path: dest, name, mimeType, size: stat.size }
    if (mimeType.startsWith('image/')) {
      ref.previewDataUrl = `data:${mimeType};base64,${fs.readFileSync(dest).toString('base64')}`
    }
    return ref
  })
}

export function stageImageBuffer(
  buffer: Buffer,
  stagingDir: string,
  opts?: { name?: string; mimeType?: string },
): AttachmentRef {
  if (buffer.byteLength === 0) {
    throw new Error('Clipboard image is empty')
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error('Image exceeds 20 MB')
  }
  fs.mkdirSync(stagingDir, { recursive: true })
  const mimeType = opts?.mimeType ?? 'image/png'
  const ext = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png'
  const name = opts?.name ?? `pasted-image-${Date.now()}${ext}`
  const dest = path.join(stagingDir, name)
  fs.writeFileSync(dest, buffer)
  return {
    path: dest,
    name,
    mimeType,
    size: buffer.byteLength,
    previewDataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
  }
}

export function isImageAttachment(ref: AttachmentRef): boolean {
  return ref.mimeType.startsWith('image/') || IMAGE_EXT.has(path.extname(ref.name).toLowerCase())
}

export function readAttachmentAsBase64(ref: AttachmentRef): string {
  return fs.readFileSync(ref.path).toString('base64')
}
