import { formatFetchError, httpFetch } from './http-fetch'
import type { RemoteModelOption } from './openai-models'

export type FetchAnthropicModelsResult =
  | { ok: true; models: RemoteModelOption[] }
  | { ok: false; models: null; error: string }

interface AnthropicModelsPage {
  data?: Array<{ id?: string; display_name?: string }>
  has_more?: boolean
  last_id?: string
}

const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * Fetch model IDs from Anthropic GET /v1/models (paginated).
 * Requires an Anthropic API key (x-api-key).
 */
export async function fetchAnthropicModels(opts: {
  apiKey: string
  signal?: AbortSignal
}): Promise<FetchAnthropicModelsResult> {
  const models: RemoteModelOption[] = []
  let afterId: string | undefined

  for (let page = 0; page < 20; page++) {
    const url = new URL(ANTHROPIC_MODELS_URL)
    url.searchParams.set('limit', '100')
    if (afterId) url.searchParams.set('after_id', afterId)

    let res: Response
    try {
      res = await httpFetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        signal: opts.signal,
      })
    } catch (e) {
      return { ok: false, models: null, error: formatFetchError(e, ANTHROPIC_MODELS_URL) }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        ok: false,
        models: null,
        error: `Models ${res.status}: ${body.slice(0, 200) || res.statusText}`,
      }
    }

    let json: AnthropicModelsPage
    try {
      json = (await res.json()) as AnthropicModelsPage
    } catch {
      return { ok: false, models: null, error: `Invalid JSON from ${ANTHROPIC_MODELS_URL}` }
    }

    for (const m of json.data ?? []) {
      const id = typeof m.id === 'string' ? m.id.trim() : ''
      if (!id) continue
      models.push({
        id,
        label: (typeof m.display_name === 'string' && m.display_name.trim()) || id,
      })
    }

    if (!json.has_more || !json.last_id) break
    afterId = json.last_id
  }

  if (models.length === 0) {
    return { ok: false, models: null, error: `Empty models list from ${ANTHROPIC_MODELS_URL}` }
  }

  // Stable order: keep API order (newest first), cap list size
  const seen = new Set<string>()
  const deduped: RemoteModelOption[] = []
  for (const m of models) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    deduped.push(m)
    if (deduped.length >= 80) break
  }

  return { ok: true, models: deduped }
}
