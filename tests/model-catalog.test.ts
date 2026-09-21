import { describe, expect, it } from 'vitest'
import {
  defaultModelCatalog,
  mergeModelCatalog,
  syncRemoteModels,
} from '../src/lib/models'

describe('syncRemoteModels', () => {
  it('replaces the full OpenAI catalog with the API list and drops unsupported builtins', () => {
    const before = defaultModelCatalog()
    expect(before.some((m) => m.provider === 'openai' && m.id === 'gpt-4o')).toBe(true)

    const synced = syncRemoteModels(before, 'openai', [
      { id: 'gpt-5.6-luna' },
      { id: 'gpt-5.5' },
      { id: 'kimi-k2.6' },
      { id: 'gpt-image-2' },
    ])

    const openaiIds = synced.filter((m) => m.provider === 'openai').map((m) => m.id).sort()
    expect(openaiIds).toEqual(['gpt-5.5', 'gpt-5.6-luna', 'gpt-image-2', 'kimi-k2.6'])
    expect(openaiIds).not.toContain('gpt-4o')
    expect(openaiIds).not.toContain('o4-mini')

    const merged = mergeModelCatalog(synced)
    const mergedOpenAi = merged
      .filter((m) => m.provider === 'openai')
      .map((m) => m.id)
      .sort()
    expect(mergedOpenAi).toEqual(['gpt-5.5', 'gpt-5.6-luna', 'gpt-image-2', 'kimi-k2.6'])
    expect(merged.filter((m) => m.provider === 'openai').every((m) => m.fromApi)).toBe(true)
  })

  it('can still replace only a prefix when requested', () => {
    const withKimi = [
      ...defaultModelCatalog(),
      {
        id: 'kimi-k2.6',
        label: 'kimi-k2.6',
        provider: 'openai' as const,
        enabled: true,
        custom: true,
      },
    ]
    const synced = syncRemoteModels(
      withKimi,
      'openai',
      [{ id: 'gpt-5.6-luna' }],
      { idPrefix: 'gpt' },
    )
    expect(synced.some((m) => m.id === 'kimi-k2.6')).toBe(true)
    expect(synced.some((m) => m.id === 'gpt-5.6-luna' && m.fromApi)).toBe(true)
    expect(synced.some((m) => m.id === 'gpt-4o')).toBe(false)
  })
})
