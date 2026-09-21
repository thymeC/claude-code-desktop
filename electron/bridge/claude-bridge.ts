import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import { createStreamParser } from './stream-parser'
import type { AttachmentRef, ChatEvent, PermissionDecision } from './types'
import { SCHEMA_VERSION } from './types'

export interface BridgeStartOptions {
  claudePath: string
  projectPath: string
  sessionId?: string
  resume?: boolean
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
  apiKey?: string
  onEvent: (event: ChatEvent) => void
  onExit: (code: number | null) => void
}

export class ClaudeBridge {
  private child: ChildProcessWithoutNullStreams | null = null
  private parser = createStreamParser(() => {})

  start(opts: BridgeStartOptions) {
    this.stop()
    this.parser = createStreamParser(opts.onEvent)

    const args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
    ]

    if (opts.permissionMode && opts.permissionMode !== 'default') {
      args.push('--permission-mode', opts.permissionMode)
    }

    if (opts.resume && opts.sessionId) {
      args.push('--resume', opts.sessionId)
    } else if (opts.sessionId) {
      args.push('--session-id', opts.sessionId)
    }

    this.child = spawn(opts.claudePath, args, {
      cwd: opts.projectPath,
      env: {
        ...process.env,
        ...(opts.apiKey ? { ANTHROPIC_API_KEY: opts.apiKey } : {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.parser.push(chunk))
    this.child.stderr.on('data', (chunk: string) => {
      const text = chunk.trim()
      if (!text) return
      opts.onEvent({
        schemaVersion: SCHEMA_VERSION,
        type: 'error',
        error: text,
      })
    })
    this.child.on('exit', (code) => {
      opts.onEvent({ schemaVersion: SCHEMA_VERSION, type: 'done' })
      opts.onExit(code)
      this.child = null
    })
  }

  sendMessage(text: string, attachments: AttachmentRef[] = []) {
    if (!this.child?.stdin.writable) {
      throw new Error('ClaudeBridge is not running')
    }

    const content: unknown[] = []
    if (text.trim()) {
      content.push({ type: 'text', text })
    }

    for (const file of attachments) {
      if (file.mimeType.startsWith('image/')) {
        const data = fs.readFileSync(file.path).toString('base64')
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mimeType,
            data,
          },
        })
      } else {
        content.push({
          type: 'text',
          text: `\n[Attached file: ${file.path}]`,
        })
      }
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' })
    }

    const payload = {
      type: 'user',
      message: {
        role: 'user',
        content,
      },
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  respondPermission(decision: PermissionDecision) {
    if (!this.child?.stdin.writable) {
      throw new Error('ClaudeBridge is not running')
    }
    const payload = {
      type: 'control_response',
      response: {
        subtype: 'can_use_tool',
        request_id: decision.requestId,
        decision: decision.decision === 'approve' ? 'allow' : 'deny',
      },
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  stop() {
    if (!this.child) return
    this.child.kill()
    this.child = null
    this.parser.reset()
  }

  get running() {
    return this.child !== null
  }
}
