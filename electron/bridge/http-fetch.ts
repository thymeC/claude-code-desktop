/**
 * Prefer Electron's Chromium network stack (system proxy / certs) over Node undici.
 * Falls back to global fetch outside Electron (e.g. vitest).
 */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    const { net } = await import('electron')
    if (typeof net?.fetch === 'function') {
      return net.fetch(input, init)
    }
  } catch {
    // not running under Electron
  }
  return fetch(input, init)
}

/** Turn opaque undici "fetch failed" into something actionable. */
export function formatFetchError(err: unknown, url: string): string {
  const e = err as Error & {
    cause?: { code?: string; message?: string; errno?: string | number }
  }
  const parts: string[] = []
  if (e.cause?.code) parts.push(String(e.cause.code))
  else if (e.cause?.errno != null) parts.push(String(e.cause.errno))
  if (e.cause?.message && e.cause.message !== e.message) parts.push(e.cause.message)
  if (e.message && e.message !== 'fetch failed') parts.push(e.message)
  const detail = parts.filter(Boolean).join(': ') || e.message || String(err)
  return `Request failed (${url}): ${detail}`
}
