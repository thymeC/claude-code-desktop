import { describe, expect, it } from 'vitest'
import {
  defaultModelCatalog,
  displayModelLabel,
  enabledModels,
  ensureSavedModelInCatalog,
  mergeModelCatalog,
  resolveEnabledSelection,
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

describe('claude catalog', () => {
  it('keeps Claude builtins after OpenAI API sync', () => {
    const synced = syncRemoteModels(defaultModelCatalog(), 'openai', [
      { id: 'gpt-5.6-luna' },
      { id: 'kimi-k2.6' },
    ])
    const claude = enabledModels(synced, 'claude').map((m) => m.id)
    expect(claude).toEqual(['', 'sonnet', 'opus', 'haiku'])
  })

  it('resolves Default (empty id) and aliases for Claude', () => {
    const catalog = defaultModelCatalog()
    expect(resolveEnabledSelection(catalog, 'claude', undefined)).toBe('')
    expect(resolveEnabledSelection(catalog, 'claude', '')).toBe('')
    expect(resolveEnabledSelection(catalog, 'claude', 'sonnet')).toBe('sonnet')
    expect(displayModelLabel(catalog, 'claude', '')).toBe('Default')
    expect(displayModelLabel(catalog, 'claude', 'opus')).toBe('Opus')
  })

  it('adds a saved Claude model missing from the catalog so picker matches CLI', () => {
    const catalog = defaultModelCatalog()
    expect(resolveEnabledSelection(catalog, 'claude', 'claude-opus-5')).toBe('')

    const ensured = ensureSavedModelInCatalog(catalog, 'claude', 'claude-opus-5')
    expect(
      ensured.some((m) => m.provider === 'claude' && m.id === 'claude-opus-5' && m.enabled),
    ).toBe(true)
    expect(resolveEnabledSelection(ensured, 'claude', 'claude-opus-5')).toBe('claude-opus-5')
  })

  it('keeps Default when syncing Claude from Anthropic API', () => {
    const synced = syncRemoteModels(
      defaultModelCatalog(),
      'claude',
      [
        { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
        { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      ],
      { keepIds: [''] },
    )
    const claude = synced.filter((m) => m.provider === 'claude')
    expect(claude.some((m) => m.id === '' && m.label === 'Default')).toBe(true)
    expect(claude.some((m) => m.id === 'claude-opus-4-20250514' && m.fromApi)).toBe(true)
    expect(claude.some((m) => m.id === 'sonnet')).toBe(false)

    const merged = mergeModelCatalog(synced)
    expect(merged.some((m) => m.provider === 'claude' && m.id === '')).toBe(true)
    expect(merged.some((m) => m.provider === 'claude' && m.id === 'haiku' && !m.fromApi)).toBe(false)
  })
})
