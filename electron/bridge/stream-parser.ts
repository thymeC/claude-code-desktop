import { SCHEMA_VERSION, type ChatEvent } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function normalizeCliLine(line: unknown): ChatEvent | ChatEvent[] | null {
  const obj = asRecord(line)
  if (!obj || typeof obj.type !== 'string') return null

  if (obj.type === 'stream_event') {
    const event = asRecord(obj.event)
    const delta = event ? asRecord(event.delta) : null
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return { schemaVersion: SCHEMA_VERSION, type: 'partial', text: delta.text, raw: line }
    }
  }

  if (obj.type === 'assistant') {
    const message = asRecord(obj.message)
    const content = Array.isArray(message?.content) ? message.content : []
    const text = content
      .map((block) => {
        const b = asRecord(block)
        return b?.type === 'text' && typeof b.text === 'string' ? b.text : ''
      })
      .join('')
    if (text) {
      return { schemaVersion: SCHEMA_VERSION, type: 'message', role: 'assistant', text, raw: line }
    }

    const tools: ChatEvent[] = []
    for (const block of content) {
      const b = asRecord(block)
      if (b?.type === 'tool_use') {
        tools.push({
          schemaVersion: SCHEMA_VERSION,
          type: 'tool',
          toolName: typeof b.name === 'string' ? b.name : 'tool',
          toolInput: b.input,
          raw: line,
        })
      }
    }
    if (tools.length) return tools
  }

  if (obj.type === 'control_request') {
    const request = asRecord(obj.request)
    if (request?.subtype === 'can_use_tool') {
      return {
        schemaVersion: SCHEMA_VERSION,
        type: 'permission_request',
        requestId: String(obj.request_id ?? ''),
        toolName: String(request.tool_name ?? 'tool'),
        toolInput: request.input,
        raw: line,
      }
    }
  }

  if (obj.type === 'result') {
    return {
      schemaVersion: SCHEMA_VERSION,
      type: 'done',
      sessionId: typeof obj.session_id === 'string' ? obj.session_id : undefined,
      raw: line,
    }
  }

  if (obj.type === 'error' || typeof obj.error === 'string') {
    return {
      schemaVersion: SCHEMA_VERSION,
      type: 'error',
      error: String(obj.error ?? obj.message ?? 'Unknown CLI error'),
      raw: line,
    }
  }

  return null
}

export function createStreamParser(onEvent: (event: ChatEvent) => void) {
  let buffer = ''

  return {
    push(chunk: string) {
      buffer += chunk
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed) continue
        try {
          const parsed: unknown = JSON.parse(trimmed)
          const event = normalizeCliLine(parsed)
          if (Array.isArray(event)) event.forEach(onEvent)
          else if (event) onEvent(event)
        } catch {
          onEvent({
            schemaVersion: SCHEMA_VERSION,
            type: 'error',
            error: `Failed to parse CLI line: ${trimmed.slice(0, 200)}`,
            raw: trimmed,
          })
        }
      }
    },
    reset() {
      buffer = ''
    },
  }
}
