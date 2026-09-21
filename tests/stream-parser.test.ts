import { describe, expect, it, vi } from 'vitest'
import { createStreamParser, normalizeCliLine } from '../electron/bridge/stream-parser'

describe('normalizeCliLine', () => {
  it('maps assistant partial text', () => {
    const event = normalizeCliLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
    })
    expect(event).toMatchObject({ schemaVersion: 1, type: 'partial', text: 'Hi' })
  })

  it('maps permission request', () => {
    const event = normalizeCliLine({
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
      },
    })
    expect(event).toMatchObject({
      type: 'permission_request',
      requestId: 'req-1',
      toolName: 'Bash',
    })
  })

  it('returns null for unknown shapes', () => {
    expect(normalizeCliLine({ type: 'noise' })).toBeNull()
  })
})

describe('createStreamParser', () => {
  it('splits on newlines and ignores incomplete trailing chunk', () => {
    const onEvent = vi.fn()
    const parser = createStreamParser(onEvent)
    parser.push(
      '{"type":"assistant","message":{"content":[{"type":"text","text":"A"}]}}\n{"type":',
    )
    expect(onEvent).toHaveBeenCalledTimes(1)
    parser.push('"assistant","message":{"content":[{"type":"text","text":"B"}]}}\n')
    expect(onEvent).toHaveBeenCalledTimes(2)
  })
})
