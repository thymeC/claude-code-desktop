import { randomUUID } from 'node:crypto'
import type { AttachmentRef, ChatEvent } from './types'
import { SCHEMA_VERSION } from './types'
import { formatFetchError, httpFetch } from './http-fetch'
import {
  OPENAI_PROJECT_TOOLS,
  buildProjectTree,
  runProjectTool,
} from './project-tools'
import {
  loadOpenAiSession,
  saveOpenAiSession,
  type OpenAiStoredSession,
} from './openai-session-store'
import type { TranscriptMessage } from './session-store'

type Role = 'system' | 'user' | 'assistant' | 'tool'

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: Role
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface OpenAiChatOptions {
  baseUrl: string
  apiKey: string
  model: string
  projectPath: string
  /** Electron userData path for persisting sessions */
  userData: string
  /** Resume an existing OpenAI session id */
  sessionId?: string
  /** Seed history from a Claude transcript when starting OpenAI on a Claude session */
  seedHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  onEvent: (event: ChatEvent) => void
}

const MAX_TOOL_ROUNDS = 8

/**
 * OpenAI-compatible chat with sandboxed project tools (list/read/grep).
 */
export class OpenAiChat {
  private messages: ChatMessage[] = []
  private uiMessages: TranscriptMessage[] = []
  private abort: AbortController | null = null
  private active = false
  private inFlight = false
  private opts: OpenAiChatOptions | null = null
  sessionId: string | null = null

  get running() {
    return this.active
  }

  get pending() {
    return this.inFlight
  }

  /** Update model for subsequent completions without restarting the session. */
  setModel(model: string) {
    if (this.opts) this.opts.model = model
  }

  private emit(event: Omit<ChatEvent, 'schemaVersion' | 'sessionId'> & { sessionId?: string }) {
    if (!this.opts) return
    this.opts.onEvent({
      schemaVersion: SCHEMA_VERSION,
      sessionId: this.sessionId ?? undefined,
      ...event,
    })
  }

  start(opts: OpenAiChatOptions) {
    this.stop()
    this.opts = opts
    const tree = buildProjectTree(opts.projectPath)
    const system: ChatMessage = {
      role: 'system',
      content: [
        'You are a helpful coding assistant in Claude Code Desktop (OpenAI-compatible mode).',
        `The user's open project is at: ${opts.projectPath}`,
        'Use list_dir, read_file, and grep to inspect the codebase before answering about it.',
        'Prefer relative paths from the project root. Keep replies concise.',
        '',
        'Project tree (truncated):',
        '```',
        tree,
        '```',
      ].join('\n'),
    }

    const existing = opts.sessionId
      ? loadOpenAiSession(opts.userData, opts.projectPath, opts.sessionId)
      : null

    if (existing) {
      this.sessionId = existing.id
      this.uiMessages = [...existing.messages]
      this.messages = [
        system,
        ...existing.history.map((h) => ({ role: h.role, content: h.content }) as ChatMessage),
      ]
    } else {
      this.sessionId = opts.sessionId ?? randomUUID()
      this.uiMessages = []
      this.messages = [system]
      if (opts.seedHistory?.length) {
        for (const h of opts.seedHistory) {
          this.messages.push({ role: h.role, content: h.content })
          this.uiMessages.push({
            id: randomUUID(),
            role: h.role,
            text: h.content,
          })
        }
      }
    }

    this.active = true
    this.emit({
      type: 'session',
      sessionId: this.sessionId ?? undefined,
    })
  }

  stop() {
    this.abort?.abort()
    this.abort = null
    this.inFlight = false
    this.active = false
  }

  async sendMessage(text: string, attachments: AttachmentRef[] = []) {
    if (!this.opts || !this.active) {
      throw new Error('OpenAI chat is not running. Click + New chat first.')
    }

    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
    if (text.trim()) contentParts.push({ type: 'text', text })
    for (const file of attachments) {
      if (file.mimeType.startsWith('image/') && file.previewDataUrl) {
        contentParts.push({ type: 'image_url', image_url: { url: file.previewDataUrl } })
      } else {
        contentParts.push({ type: 'text', text: `[Attached file: ${file.name}]` })
      }
    }
    if (contentParts.length === 0) contentParts.push({ type: 'text', text: '' })

    const userText =
      contentParts.length === 1 && contentParts[0]!.type === 'text'
        ? (contentParts[0]!.text ?? '')
        : contentParts.map((p) => p.text ?? '[image]').join('\n')

    this.messages.push({
      role: 'user',
      content:
        contentParts.length === 1 && contentParts[0]!.type === 'text'
          ? (contentParts[0]!.text ?? '')
          : contentParts,
    })
    if (userText.trim()) {
      this.uiMessages.push({ id: randomUUID(), role: 'user', text: userText })
    }

    this.abort = new AbortController()
    this.inFlight = true

    try {
      await this.runAgentLoop()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        this.emit({
          type: 'error',
          error: e instanceof Error ? e.message : String(e),
        })
      }
    } finally {
      this.inFlight = false
    }

    this.persist()
    this.emit({
      type: 'done',
      sessionId: this.sessionId ?? undefined,
    })
  }

  private persist() {
    if (!this.opts || !this.sessionId) return
    const history: OpenAiStoredSession['history'] = []
    for (const m of this.messages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue
      if (m.tool_calls) continue
      const content =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c) => c.text ?? '').join('')
            : ''
      if (!content.trim()) continue
      history.push({ role: m.role, content })
    }
    const preview = this.uiMessages.find((m) => m.role === 'user')?.text.slice(0, 80)
    saveOpenAiSession(this.opts.userData, {
      id: this.sessionId,
      projectPath: this.opts.projectPath,
      updatedAt: Date.now(),
      preview,
      messages: this.uiMessages,
      history,
    })
  }

  private async runAgentLoop() {
    if (!this.opts) return
    let rounds = 0

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++
      const result = await this.completionRound()
      if (!result) return

      if (result.toolCalls.length > 0) {
        this.messages.push({
          role: 'assistant',
          content: result.content || null,
          tool_calls: result.toolCalls,
        })

        for (const call of result.toolCalls) {
          this.emit({
            type: 'tool',
            toolName: call.function.name,
            toolInput: safeJson(call.function.arguments),
          })
          const output = runProjectTool(
            this.opts.projectPath,
            call.function.name,
            call.function.arguments,
          )
          this.messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: output.slice(0, 80_000),
          })
        }
        continue
      }

      if (result.content) {
        this.messages.push({ role: 'assistant', content: result.content })
        this.uiMessages.push({ id: randomUUID(), role: 'assistant', text: result.content })
        this.emit({
          type: 'partial',
          text: result.content,
        })
        this.emit({
          type: 'message',
          role: 'assistant',
          text: result.content,
        })
      }
      return
    }

    this.emit({
      type: 'error',
      error: 'Stopped after too many tool rounds. Try a more specific question.',
    })
  }

  private async completionRound(): Promise<{
    content: string
    toolCalls: ToolCall[]
  } | null> {
    if (!this.opts) return null
    const base = this.opts.baseUrl.replace(/\/$/, '')
    const url = `${base}/chat/completions`

    let res: Response
    try {
      res = await httpFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages: this.messages,
          tools: OPENAI_PROJECT_TOOLS,
          tool_choice: 'auto',
          stream: true,
        }),
        signal: this.abort?.signal,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      this.emit({
        type: 'error',
        error: formatFetchError(e, url),
      })
      return null
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      // Some gateways reject tools — retry once without tools
      if (res.status === 400 && body.toLowerCase().includes('tool')) {
        return this.completionRoundNoTools()
      }
      this.emit({
        type: 'error',
        error: `OpenAI API ${res.status}: ${body.slice(0, 400)}`,
      })
      return null
    }

    return this.parseStream(res)
  }

  private async completionRoundNoTools(): Promise<{
    content: string
    toolCalls: ToolCall[]
  } | null> {
    if (!this.opts) return null
    const base = this.opts.baseUrl.replace(/\/$/, '')
    const url = `${base}/chat/completions`
    let res: Response
    try {
      res = await httpFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages: this.messages.filter((m) => m.role !== 'tool' && !m.tool_calls),
          stream: true,
        }),
        signal: this.abort?.signal,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      this.emit({
        type: 'error',
        error: formatFetchError(e, url),
      })
      return null
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      this.emit({
        type: 'error',
        error: `OpenAI API ${res.status}: ${body.slice(0, 400)}`,
      })
      return null
    }
    return this.parseStream(res)
  }

  private async parseStream(res: Response): Promise<{
    content: string
    toolCalls: ToolCall[]
  } | null> {
    if (!this.opts) return null
    const reader = res.body?.getReader()
    if (!reader) {
      this.emit({
        type: 'error',
        error: 'No response body from OpenAI API',
      })
      return null
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string
                  tool_calls?: Array<{
                    index?: number
                    id?: string
                    function?: { name?: string; arguments?: string }
                  }>
                }
              }>
            }
            const delta = json.choices?.[0]?.delta
            if (delta?.content) {
              content += delta.content
            }
            for (const tc of delta?.tool_calls ?? []) {
              const idx = tc.index ?? 0
              const cur = toolAcc.get(idx) ?? { id: '', name: '', arguments: '' }
              if (tc.id) cur.id = tc.id
              if (tc.function?.name) cur.name += tc.function.name
              if (tc.function?.arguments) cur.arguments += tc.function.arguments
              toolAcc.set(idx, cur)
            }
          } catch {
            // ignore bad chunks
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      this.emit({
        type: 'error',
        error: formatFetchError(e, 'stream'),
      })
      return null
    }

    const toolCalls: ToolCall[] = [...toolAcc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, t]) => ({
        id: t.id || randomUUID(),
        type: 'function' as const,
        function: { name: t.name, arguments: t.arguments || '{}' },
      }))
      .filter((t) => t.function.name)

    return { content, toolCalls }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
