import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAnthropicModels } from '../electron/bridge/anthropic-models'

describe('fetchAnthropicModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps display_name and id from /v1/models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4' },
            { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' },
          ],
          has_more: false,
        }),
      })),
    )

    const result = await fetchAnthropicModels({ apiKey: 'sk-ant-test' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.models).toEqual([
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    ])
  })

  it('returns error when unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '{"error":{"message":"invalid x-api-key"}}',
      })),
    )
    const result = await fetchAnthropicModels({ apiKey: 'bad' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/401/)
  })
})
