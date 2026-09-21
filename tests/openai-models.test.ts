import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenAiModels } from '../electron/bridge/openai-models'

describe('fetchOpenAiModels', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns sorted chat-like models from /models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'text-embedding-3-small' },
            { id: 'gpt-4o' },
            { id: 'kimi-k2.6' },
            { id: 'whisper-1' },
          ],
        }),
      })),
    )

    const result = await fetchOpenAiModels({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.models.map((m) => m.id)
    expect(ids[0]).toBe('gpt-4o')
    expect(ids).toContain('kimi-k2.6')
    expect(ids.indexOf('gpt-4o')).toBeLessThan(ids.indexOf('text-embedding-3-small'))
  })

  it('filters by idPrefix (gpt*)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-5.6-luna' },
            { id: 'gpt-5.5' },
            { id: 'kimi-k2.6' },
            { id: 'gpt-image-2' },
          ],
        }),
      })),
    )

    const result = await fetchOpenAiModels({
      baseUrl: 'https://api.judao.org/v1',
      apiKey: 'sk-test',
      idPrefix: 'gpt',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.models.map((m) => m.id)
    expect(ids).toEqual(['gpt-5.5', 'gpt-5.6-luna', 'gpt-image-2'])
    expect(ids.every((id) => id.startsWith('gpt'))).toBe(true)
  })

  it('returns error when the endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'missing',
        json: async () => ({}),
      })),
    )
    const result = await fetchOpenAiModels({
      baseUrl: 'https://example.com/v1',
      apiKey: 'sk-test',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/404/)
  })
})
