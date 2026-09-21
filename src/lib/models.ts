import type { ChatProvider } from './types'

export interface ModelEntry {
  id: string
  label: string
  provider: ChatProvider
  enabled: boolean
  /** User-added; can be removed from the catalog */
  custom?: boolean
  /** Imported from provider GET /models */
  fromApi?: boolean
}

export interface ModelOption {
  id: string
  label: string
}

const DEFAULT_CLAUDE: Array<Omit<ModelEntry, 'provider' | 'enabled'>> = [
  { id: '', label: 'Default' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'haiku', label: 'Haiku' },
]

/** Seed only until the user refreshes from their OpenAI-compatible /models. */
const DEFAULT_OPENAI: Array<Omit<ModelEntry, 'provider' | 'enabled'>> = [
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  { id: 'gpt-4o', label: 'gpt-4o' },
  { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
  { id: 'gpt-4.1', label: 'gpt-4.1' },
  { id: 'o4-mini', label: 'o4-mini' },
  { id: 'o3-mini', label: 'o3-mini' },
]

/** Built-in catalog (all enabled by default). */
export function defaultModelCatalog(): ModelEntry[] {
  return [
    ...DEFAULT_CLAUDE.map((m) => ({ ...m, provider: 'claude' as const, enabled: true })),
    ...DEFAULT_OPENAI.map((m) => ({ ...m, provider: 'openai' as const, enabled: true })),
  ]
}

function entryKey(m: Pick<ModelEntry, 'provider' | 'id'>): string {
  return `${m.provider}::${m.id}`
}

/**
 * Merge saved catalog with built-ins.
 * Once any OpenAI model was imported from /models (`fromApi`), built-in OpenAI
 * presets are not re-seeded — the API list is the source of truth (so gpt-4o
 * won't reappear if the gateway doesn't offer it).
 */
export function mergeModelCatalog(saved?: ModelEntry[]): ModelEntry[] {
  const defaults = defaultModelCatalog()
  if (!saved?.length) return defaults

  const openAiFromApi = saved.some((m) => m?.provider === 'openai' && m.fromApi)
  const byKey = new Map<string, ModelEntry>()

  for (const m of defaults) {
    if (m.provider === 'openai' && openAiFromApi) continue
    byKey.set(entryKey(m), { ...m })
  }

  for (const m of saved) {
    if (!m || typeof m.id !== 'string' || (m.provider !== 'claude' && m.provider !== 'openai')) {
      continue
    }
    const key = entryKey(m)
    const existing = byKey.get(key)
    if (existing && !m.custom && !m.fromApi) {
      byKey.set(key, {
        ...existing,
        enabled: Boolean(m.enabled),
        label: existing.label,
      })
    } else {
      byKey.set(key, {
        id: m.id,
        label: m.label?.trim() || m.id || 'Default',
        provider: m.provider,
        enabled: Boolean(m.enabled),
        custom: Boolean(m.custom) || Boolean(m.fromApi) || !existing,
        fromApi: Boolean(m.fromApi),
      })
    }
  }
  return [...byKey.values()]
}

export function modelsForProvider(catalog: ModelEntry[], provider: ChatProvider): ModelEntry[] {
  return catalog.filter((m) => m.provider === provider)
}

export function enabledModels(catalog: ModelEntry[], provider: ChatProvider): ModelOption[] {
  return modelsForProvider(catalog, provider)
    .filter((m) => m.enabled)
    .map((m) => ({ id: m.id, label: m.label }))
}

export function displayModelLabel(
  catalog: ModelEntry[],
  provider: ChatProvider,
  model: string | undefined,
): string {
  const id = provider === 'openai' ? model?.trim() || '' : (model?.trim() ?? '')
  const hit = catalog.find((m) => m.provider === provider && m.id === id)
  if (hit) return hit.label
  if (provider === 'claude' && !id) return 'Default'
  return id || 'Default'
}

/** If current selection isn't enabled, return the first enabled id for that provider. */
export function resolveEnabledSelection(
  catalog: ModelEntry[],
  provider: ChatProvider,
  selected: string | undefined,
): string {
  const enabled = enabledModels(catalog, provider)
  if (enabled.length === 0) return ''
  const id = selected?.trim() ?? ''
  if (enabled.some((m) => m.id === id)) return id
  return enabled[0]!.id
}

export function upsertCustomModel(
  catalog: ModelEntry[],
  provider: ChatProvider,
  id: string,
  label?: string,
): ModelEntry[] {
  const trimmed = id.trim()
  if (!trimmed && provider === 'openai') return catalog
  const keyId = trimmed
  const next = catalog.filter((m) => !(m.provider === provider && m.id === keyId))
  next.push({
    id: keyId,
    label: (label ?? trimmed) || 'Default',
    provider,
    enabled: true,
    custom: true,
  })
  return next
}

/**
 * Replace models for `provider` whose ids match `idPrefix` with the live /models
 * list. Built-ins not returned by the API (e.g. gpt-4o on a custom gateway) are
 * dropped so the catalog matches what the server actually supports.
 */
export function syncRemoteModels(
  catalog: ModelEntry[],
  provider: ChatProvider,
  remote: Array<{ id: string; label?: string }>,
  opts?: { idPrefix?: string },
): ModelEntry[] {
  const prefix = (opts?.idPrefix ?? '').trim().toLowerCase()
  const base = mergeModelCatalog(catalog)

  const kept = base.filter((m) => {
    if (m.provider !== provider) return true
    if (!prefix) return false
    return !m.id.toLowerCase().startsWith(prefix)
  })

  const next: ModelEntry[] = [...kept]
  for (const r of remote) {
    const id = r.id.trim()
    if (!id) continue
    if (prefix && !id.toLowerCase().startsWith(prefix)) continue
    next.push({
      id,
      label: r.label?.trim() || id,
      provider,
      enabled: true,
      custom: true,
      fromApi: true,
    })
  }
  return next
}
