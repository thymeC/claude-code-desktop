import { describe, expect, it } from 'vitest'
import { ClaudeBridge } from '../electron/bridge/claude-bridge'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AttachmentRef } from '../electron/bridge/types'

describe('ClaudeBridge.sendMessage image payload', () => {
  it('includes base64 image blocks for image attachments', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-bridge-'))
    const imgPath = path.join(dir, 'x.png')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    fs.writeFileSync(imgPath, png)

    const bridge = new ClaudeBridge()
    const writes: string[] = []
    // @ts-expect-error test double
    bridge.child = {
      stdin: {
        writable: true,
        write: (chunk: string) => {
          writes.push(chunk)
          return true
        },
      },
    }

    const attachment: AttachmentRef = {
      path: imgPath,
      name: 'x.png',
      mimeType: 'image/png',
      size: png.byteLength,
    }
    bridge.sendMessage('see this', [attachment])
    expect(writes).toHaveLength(1)
    const payload = JSON.parse(writes[0]) as {
      message: { content: Array<{ type: string; source?: { type: string; data: string } }> }
    }
    expect(payload.message.content.some((c) => c.type === 'image')).toBe(true)
    const image = payload.message.content.find((c) => c.type === 'image')
    expect(image?.source?.type).toBe('base64')
    expect(image?.source?.data).toBeTruthy()
  })
})
