import { formatFetchError, httpFetch } from './http-fetch'

export interface RemoteModelOption {
  id: string
  label: string
}

export type FetchOpenAiModelsResult =
  | { ok: true; models: RemoteModelOption[] }
  | { ok: false; models: null; error: string }

/** Subset of OpenAI /models response we care about. */
interface ModelsListResponse {
  data?: Array<{ id?: string; object?: string }>
}

/**
 * Fetch model IDs from an OpenAI-compatible GET {baseUrl}/models.
 * When `idPrefix` is set (e.g. "gpt"), only matching ids are returned.
 */
export async function fetchOpenAiModels(opts: {
  baseUrl: string
  apiKey: string
  signal?: AbortSignal
  /** Case-insensitive id prefix filter, e.g. "gpt" */
  idPrefix?: string
}): Promise<FetchOpenAiModelsResult> {
  const base = opts.baseUrl.replace(/\/$/, '')
  const url = `${base}/models`
  let res: Response
  try {
    res = await httpFetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
      signal: opts.signal,
    })
  } catch (e) {
    return { ok: false, models: null, error: formatFetchError(e, url) }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      models: null,
      error: `Models ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    }
  }

  let json: ModelsListResponse
  try {
    json = (await res.json()) as ModelsListResponse
  } catch {
    return { ok: false, models: null, error: `Invalid JSON from ${url}` }
  }

  let ids = (json.data ?? [])
    .map((m) => (typeof m.id === 'string' ? m.id.trim() : ''))
    .filter(Boolean)

  const prefix = opts.idPrefix?.trim().toLowerCase()
  if (prefix) {
    ids = ids.filter((id) => id.toLowerCase().startsWith(prefix))
  }

  if (ids.length === 0) {
    return {
      ok: false,
      models: null,
      error: prefix
        ? `No models starting with "${opts.idPrefix}" from ${url}`
        : `Empty models list from ${url}`,
    }
  }

  const scored = ids.map((id) => {
    const lower = id.toLowerCase()
    let score = 50
    if (/gpt|claude|o\d|chat|sonnet|opus|haiku|kimi|deepseek|qwen|llama|mistral|gemini/i.test(lower)) {
      score = 10
    }
    if (/embed|whisper|tts|dall-e|moderation|babbage|davinci|curie|ada|realtime|audio/i.test(lower)) {
      score = 90
    }
    return { id, score }
  })
  scored.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))

  const models = scored.slice(0, 80).map(({ id }) => ({ id, label: id }))
  return { ok: true, models }
}
