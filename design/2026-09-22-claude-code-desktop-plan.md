# Claude Code Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cross-platform Electron + React desktop shell around the Claude Code CLI with chat streaming, file/image attach, session resume, and in-app permission prompts.

**Architecture:** Main process owns CliDetector, ClaudeBridge (stream-json stdin/stdout), SessionStore, and FileService. Renderer is React UI talking only over typed IPC. Claude Code stays the agent and auth source; the app never embeds API keys.

**Tech Stack:** Electron 33+, Vite 6, React 19, TypeScript 5.6+, Vitest, electron-builder (packaging), Node `child_process` for CLI.

**Spec:** `design/2026-09-22-claude-code-desktop-design.md`

## Global Constraints

- Platforms: macOS, Windows, Linux
- Do not bundle or auto-install Claude Code; detect PATH (+ browse binary) and guide install
- Auth remains Claude Code login (no custom Anthropic API-key UI)
- Renderer never spawns `claude`
- Attachment limits: 20 MB per file, 10 files per turn; images `png jpg jpeg gif webp` + general files
- Permission UX: Approve / Deny; Cancel = Deny; no auto-deny timeout
- Product name copy: "Claude Code Desktop"
- Prefer TDD; commit after each task

---

## File map (create)

```text
package.json
tsconfig.json
tsconfig.node.json
vite.config.ts
vitest.config.ts
index.html
electron-builder.yml
electron/main.ts
electron/preload.ts
electron/ipc.ts
electron/bridge/types.ts
electron/bridge/cli-detector.ts
electron/bridge/stream-parser.ts
electron/bridge/claude-bridge.ts
electron/bridge/session-store.ts
electron/bridge/file-service.ts
electron/bridge/app-settings.ts
src/main.tsx
src/App.tsx
src/styles.css
src/lib/ipc.ts
src/lib/types.ts
src/components/Onboarding.tsx
src/components/ProjectBar.tsx
src/components/SessionSidebar.tsx
src/components/ChatTranscript.tsx
src/components/Composer.tsx
src/components/PermissionModal.tsx
tests/cli-detector.test.ts
tests/stream-parser.test.ts
tests/file-service.test.ts
tests/session-store.test.ts
```

---

### Task 1: Project scaffold (Electron + Vite + React + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `electron/main.ts`, `electron/preload.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`
- Test: smoke via `npm test` (empty pass) and `npm run build`

**Interfaces:**
- Consumes: none
- Produces: runnable Electron window loading Vite React app; scripts `dev`, `build`, `test`, `typecheck`

- [ ] **Step 1: Initialize git and package.json**

```bash
cd /Users/thyme/repo/claude-code-desktop
git init
```

Create `package.json`:

```json
{
  "name": "claude-code-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "Local desktop GUI shell for Claude Code",
  "main": "dist-electron/main.js",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.node.json && vite build && tsc -p tsconfig.node.json --outDir dist-electron",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.node.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "pack": "npm run build && electron-builder --dir",
    "dist": "npm run build && electron-builder"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "electron": "^33.2.0",
    "electron-builder": "^25.1.8",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vite-plugin-electron": "^0.28.8",
    "vite-plugin-electron-renderer": "^0.14.6",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Add TypeScript + Vite configs**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist-electron",
    "declaration": false,
    "types": ["node"]
  },
  "include": ["electron", "vite.config.ts", "vitest.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
})
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claude Code Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Minimal Electron main + preload + React shell**

`electron/main.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Claude Code Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`electron/preload.ts`:

```ts
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ccd', {
  ping: () => 'pong',
})
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <h1>Claude Code Desktop</h1>
      <p>Scaffold ready.</p>
    </main>
  )
}
```

`src/styles.css`:

```css
:root {
  color-scheme: light dark;
  --bg: Canvas;
  --fg: CanvasText;
  --muted: color-mix(in srgb, CanvasText 55%, Canvas);
  --accent: #1a6b4a;
  --border: color-mix(in srgb, CanvasText 18%, Canvas);
  --danger: #b42318;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--fg); }
.app-shell { padding: 1.5rem; }
```

- [ ] **Step 4: Install and verify**

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Expected: typecheck clean; vitest “No test files found” or 0 tests pass; Electron window titled **Claude Code Desktop** with scaffold text.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts index.html electron src design
git commit -m "$(cat <<'EOF'
chore: scaffold Electron + Vite + React app

EOF
)"
```

---

### Task 2: Shared types + stream parser (TDD)

**Files:**
- Create: `electron/bridge/types.ts`, `electron/bridge/stream-parser.ts`, `tests/stream-parser.test.ts`
- Test: `tests/stream-parser.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type ChatEventType = 'partial' | 'message' | 'tool' | 'permission_request' | 'error' | 'done' | 'session'`
  - `export interface ChatEvent { schemaVersion: 1; type: ChatEventType; ... }`
  - `export function createStreamParser(onEvent: (e: ChatEvent) => void): { push(chunk: string): void; reset(): void }`
  - `export function normalizeCliLine(line: unknown): ChatEvent | null`

- [ ] **Step 1: Write failing tests**

`tests/stream-parser.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createStreamParser, normalizeCliLine } from '../electron/bridge/stream-parser'

describe('normalizeCliLine', () => {
  it('maps assistant partial text', () => {
    const event = normalizeCliLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
    })
    expect(event).toMatchObject({ schemaVersion: 1, type: 'partial', text: 'Hi' })
  })

  it('maps permission request', () => {
    const event = normalizeCliLine({
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
      },
    })
    expect(event).toMatchObject({
      type: 'permission_request',
      requestId: 'req-1',
      toolName: 'Bash',
    })
  })

  it('returns null for unknown shapes', () => {
    expect(normalizeCliLine({ type: 'noise' })).toBeNull()
  })
})

describe('createStreamParser', () => {
  it('splits on newlines and ignores incomplete trailing chunk', () => {
    const onEvent = vi.fn()
    const parser = createStreamParser(onEvent)
    parser.push('{"type":"assistant","message":{"content":[{"type":"text","text":"A"}]}}\n{"type":')
    expect(onEvent).toHaveBeenCalledTimes(1)
    parser.push('"assistant","message":{"content":[{"type":"text","text":"B"}]}}\n')
    expect(onEvent).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- tests/stream-parser.test.ts
```

Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement types + parser**

`electron/bridge/types.ts`:

```ts
export const SCHEMA_VERSION = 1 as const

export type ChatEventType =
  | 'partial'
  | 'message'
  | 'tool'
  | 'permission_request'
  | 'error'
  | 'done'
  | 'session'

export interface ChatEvent {
  schemaVersion: typeof SCHEMA_VERSION
  type: ChatEventType
  text?: string
  role?: 'user' | 'assistant' | 'system'
  toolName?: string
  toolInput?: unknown
  requestId?: string
  sessionId?: string
  error?: string
  raw?: unknown
}

export interface PermissionDecision {
  requestId: string
  decision: 'approve' | 'deny'
}

export interface AttachmentRef {
  path: string
  name: string
  mimeType: string
  size: number
}
```

`electron/bridge/stream-parser.ts`:

```ts
import { SCHEMA_VERSION, type ChatEvent } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function normalizeCliLine(line: unknown): ChatEvent | null {
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
          if (event) onEvent(event)
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
```

Note: Claude Code stream shapes may differ slightly by version. Keep `normalizeCliLine` as the adapter; add fixtures when real CLI output is captured in Task 4.

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- tests/stream-parser.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/bridge/types.ts electron/bridge/stream-parser.ts tests/stream-parser.test.ts
git commit -m "$(cat <<'EOF'
feat: add stream-json parser and chat event types

EOF
)"
```

---

### Task 3: CliDetector (TDD)

**Files:**
- Create: `electron/bridge/cli-detector.ts`, `electron/bridge/app-settings.ts`, `tests/cli-detector.test.ts`
- Test: `tests/cli-detector.test.ts`

**Interfaces:**
- Consumes: Node `fs`, `child_process`, `path`
- Produces:
  - `export interface CliStatus { found: true; path: string; version: string } | { found: false; guidance: string }`
  - `export async function detectClaudeCli(opts?: { explicitPath?: string; exec?: typeof execFile; which?: (bin: string) => Promise<string | null> }): Promise<CliStatus>`
  - `export function installGuidance(): string`
  - `export interface AppSettings { claudePath?: string; lastProjectPath?: string; lastSessionId?: string }`
  - `loadSettings()` / `saveSettings(partial)`

- [ ] **Step 1: Write failing tests**

`tests/cli-detector.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { detectClaudeCli, installGuidance } from '../electron/bridge/cli-detector'

describe('detectClaudeCli', () => {
  it('returns found when which + version succeed', async () => {
    const status = await detectClaudeCli({
      which: async () => '/opt/homebrew/bin/claude',
      exec: (async (_file, _args) => ({ stdout: '2.1.22 (Claude Code)\n' })) as never,
    })
    expect(status).toEqual({
      found: true,
      path: '/opt/homebrew/bin/claude',
      version: '2.1.22 (Claude Code)',
    })
  })

  it('returns guidance when not found', async () => {
    const status = await detectClaudeCli({
      which: async () => null,
      explicitPath: undefined,
    })
    expect(status.found).toBe(false)
    if (!status.found) {
      expect(status.guidance).toContain('Claude Code')
    }
  })

  it('prefers explicitPath when provided', async () => {
    const status = await detectClaudeCli({
      explicitPath: '/custom/claude',
      which: async () => '/opt/homebrew/bin/claude',
      exec: (async () => ({ stdout: '9.9.9\n' })) as never,
    })
    expect(status).toMatchObject({ found: true, path: '/custom/claude' })
  })
})

describe('installGuidance', () => {
  it('mentions official install', () => {
    expect(installGuidance()).toMatch(/code\.claude\.com|Claude Code/i)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- tests/cli-detector.test.ts
```

- [ ] **Step 3: Implement settings + detector**

`electron/bridge/app-settings.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface AppSettings {
  claudePath?: string
  lastProjectPath?: string
  lastSessionId?: string
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) as AppSettings
  } catch {
    return {}
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...partial }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}
```

`electron/bridge/cli-detector.ts`:

```ts
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type CliStatus =
  | { found: true; path: string; version: string }
  | { found: false; guidance: string }

export function installGuidance(): string {
  return [
    'Claude Code CLI was not found.',
    'Install Claude Code from https://code.claude.com/docs/en/overview then click Check again.',
    'Or use Browse to select your claude binary.',
  ].join('\n')
}

async function defaultWhich(bin: string): Promise<string | null> {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const { stdout } = await execFileAsync(cmd, [bin])
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return first || null
  } catch {
    return null
  }
}

const FALLBACKS = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  path.join(process.env.HOME ?? '', '.local/bin/claude'),
]

export async function detectClaudeCli(opts?: {
  explicitPath?: string
  which?: (bin: string) => Promise<string | null>
  exec?: typeof execFileAsync
}): Promise<CliStatus> {
  const which = opts?.which ?? defaultWhich
  const exec = opts?.exec ?? execFileAsync

  const candidates: string[] = []
  if (opts?.explicitPath) candidates.push(opts.explicitPath)
  const fromPath = await which('claude')
  if (fromPath) candidates.push(fromPath)
  for (const fb of FALLBACKS) {
    if (fb && fs.existsSync(fb)) candidates.push(fb)
  }

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue
      const { stdout } = await exec(candidate, ['--version'])
      const version = String(stdout).trim() || 'unknown'
      return { found: true, path: candidate, version }
    } catch {
      // try next
    }
  }

  return { found: false, guidance: installGuidance() }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- tests/cli-detector.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add electron/bridge/cli-detector.ts electron/bridge/app-settings.ts tests/cli-detector.test.ts
git commit -m "$(cat <<'EOF'
feat: detect Claude Code CLI with install guidance

EOF
)"
```

---

### Task 4: ClaudeBridge process manager (text chat)

**Files:**
- Create: `electron/bridge/claude-bridge.ts`
- Modify: `electron/main.ts`, `electron/preload.ts`, `electron/ipc.ts` (create), `src/lib/types.ts`, `src/lib/ipc.ts`
- Test: extend `tests/stream-parser.test.ts` if needed; manual smoke with real CLI

**Interfaces:**
- Consumes: `createStreamParser`, `detectClaudeCli`, settings
- Produces:
  - `class ClaudeBridge { start(opts): void; sendMessage(text, attachments?): void; respondPermission(d): void; stop(): void }`
  - IPC channels from spec §6

- [ ] **Step 1: Implement ClaudeBridge**

`electron/bridge/claude-bridge.ts`:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createStreamParser } from './stream-parser'
import type { AttachmentRef, ChatEvent, PermissionDecision } from './types'

export interface BridgeStartOptions {
  claudePath: string
  projectPath: string
  sessionId?: string
  resume?: boolean
  onEvent: (event: ChatEvent) => void
  onExit: (code: number | null) => void
}

export class ClaudeBridge {
  private child: ChildProcessWithoutNullStreams | null = null
  private parser = createStreamParser((e) => this.onEvent?.(e))
  private onEvent: ((e: ChatEvent) => void) | null = null

  start(opts: BridgeStartOptions) {
    this.stop()
    this.onEvent = opts.onEvent
    this.parser = createStreamParser(opts.onEvent)

    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
    ]
    if (opts.resume && opts.sessionId) {
      args.push('--resume', opts.sessionId)
    } else if (opts.sessionId) {
      args.push('--session-id', opts.sessionId)
    }

    this.child = spawn(opts.claudePath, args, {
      cwd: opts.projectPath,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.parser.push(chunk))
    this.child.stderr.on('data', (chunk: string) => {
      opts.onEvent({
        schemaVersion: 1,
        type: 'error',
        error: chunk.trim(),
      })
    })
    this.child.on('exit', (code) => {
      opts.onEvent({ schemaVersion: 1, type: 'done' })
      opts.onExit(code)
      this.child = null
    })
  }

  sendMessage(text: string, attachments: AttachmentRef[] = []) {
    if (!this.child?.stdin.writable) {
      throw new Error('ClaudeBridge is not running')
    }
    const content: unknown[] = [{ type: 'text', text }]
    for (const file of attachments) {
      content.push({
        type: 'image',
        source: { type: 'path', path: file.path },
      })
      // Non-image files: include path hint in text as fallback
      if (!file.mimeType.startsWith('image/')) {
        content.push({ type: 'text', text: `\n[Attached file: ${file.path}]` })
      }
    }
    const payload = {
      type: 'user',
      message: { role: 'user', content },
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
}
```

If real CLI rejects image `source.path` shape, adjust in Task 5 after capturing a fixture — keep adapter logic in `sendMessage` only.

- [ ] **Step 2: Wire IPC in main + preload**

`electron/ipc.ts`:

```ts
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { ClaudeBridge } from './bridge/claude-bridge'
import { detectClaudeCli } from './bridge/cli-detector'
import { loadSettings, saveSettings } from './bridge/app-settings'
import type { AttachmentRef, PermissionDecision } from './bridge/types'

const bridge = new ClaudeBridge()

function send(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc() {
  ipcMain.handle('cli:check', async () => {
    const settings = loadSettings()
    const status = await detectClaudeCli({ explicitPath: settings.claudePath })
    send('cli:status', status)
    return status
  })

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const projectPath = result.filePaths[0]
    saveSettings({ lastProjectPath: projectPath })
    return projectPath
  })

  ipcMain.handle('project:get', async () => loadSettings().lastProjectPath ?? null)

  ipcMain.handle('session:new', async (_e, projectPath: string) => {
    const settings = loadSettings()
    const status = await detectClaudeCli({ explicitPath: settings.claudePath })
    if (!status.found) throw new Error(status.guidance)
    bridge.start({
      claudePath: status.path,
      projectPath,
      onEvent: (event) => {
        send('chat:event', event)
        if (event.sessionId) saveSettings({ lastSessionId: event.sessionId })
      },
      onExit: () => send('chat:event', { schemaVersion: 1, type: 'done' }),
    })
    return { ok: true }
  })

  ipcMain.handle('chat:send', async (_e, payload: { text: string; attachments?: AttachmentRef[] }) => {
    bridge.sendMessage(payload.text, payload.attachments ?? [])
  })

  ipcMain.handle('chat:stop', async () => {
    bridge.stop()
  })

  ipcMain.handle('chat:respondPermission', async (_e, decision: PermissionDecision) => {
    bridge.respondPermission(decision)
  })
}
```

Update `electron/main.ts` to call `registerIpc()` in `app.whenReady()` before `createWindow()`.

`electron/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { AttachmentRef, PermissionDecision } from './bridge/types'

contextBridge.exposeInMainWorld('ccd', {
  cliCheck: () => ipcRenderer.invoke('cli:check'),
  projectOpen: () => ipcRenderer.invoke('project:open'),
  projectGet: () => ipcRenderer.invoke('project:get'),
  sessionNew: (projectPath: string) => ipcRenderer.invoke('session:new', projectPath),
  chatSend: (text: string, attachments?: AttachmentRef[]) =>
    ipcRenderer.invoke('chat:send', { text, attachments }),
  chatStop: () => ipcRenderer.invoke('chat:stop'),
  chatRespondPermission: (decision: PermissionDecision) =>
    ipcRenderer.invoke('chat:respondPermission', decision),
  onChatEvent: (cb: (event: unknown) => void) => {
    const listener = (_: unknown, event: unknown) => cb(event)
    ipcRenderer.on('chat:event', listener)
    return () => ipcRenderer.removeListener('chat:event', listener)
  },
  onCliStatus: (cb: (status: unknown) => void) => {
    const listener = (_: unknown, status: unknown) => cb(status)
    ipcRenderer.on('cli:status', listener)
    return () => ipcRenderer.removeListener('cli:status', listener)
  },
})
```

`src/lib/types.ts` — re-export renderer-safe copies of `ChatEvent`, `CliStatus`, `AttachmentRef`, `PermissionDecision` (duplicate the interfaces; do not import Electron modules in renderer).

`src/lib/ipc.ts`:

```ts
import type { AttachmentRef, ChatEvent, CliStatus, PermissionDecision } from './types'

export interface CcdApi {
  cliCheck: () => Promise<CliStatus>
  projectOpen: () => Promise<string | null>
  projectGet: () => Promise<string | null>
  sessionNew: (projectPath: string) => Promise<{ ok: true }>
  chatSend: (text: string, attachments?: AttachmentRef[]) => Promise<void>
  chatStop: () => Promise<void>
  chatRespondPermission: (decision: PermissionDecision) => Promise<void>
  onChatEvent: (cb: (event: ChatEvent) => void) => () => void
  onCliStatus: (cb: (status: CliStatus) => void) => () => void
}

declare global {
  interface Window {
    ccd: CcdApi
  }
}

export const ccd = () => window.ccd
```

- [ ] **Step 3: Manual smoke**

```bash
npm run dev
```

In DevTools console after wiring a temporary button (next task adds UI): open folder, `sessionNew`, `chatSend('Say hi in one word')`. Expect `chat:event` partials/messages.

- [ ] **Step 4: Commit**

```bash
git add electron src/lib
git commit -m "$(cat <<'EOF'
feat: add ClaudeBridge and typed IPC for streaming chat

EOF
)"
```

---

### Task 5: Onboarding + project bar + basic chat UI

**Files:**
- Create: `src/components/Onboarding.tsx`, `src/components/ProjectBar.tsx`, `src/components/ChatTranscript.tsx`, `src/components/Composer.tsx`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: manual

**Interfaces:**
- Consumes: `window.ccd` API from Task 4
- Produces: usable text chat against a selected project when CLI is present

- [ ] **Step 1: Build UI components**

`Onboarding.tsx` — show `guidance`, buttons **Check again** and **Browse for claude** (add IPC `cli:browse` that opens file dialog and `saveSettings({ claudePath })`).

`ProjectBar.tsx` — show current path + **Open folder**.

`ChatTranscript.tsx` — render list of `{ id, role, text }` and streaming buffer.

`Composer.tsx` — textarea + Send + Stop; disable while permission modal open (later).

`App.tsx` flow:

1. On mount `cliCheck()`
2. If `!found` → `<Onboarding />`
3. Else load `projectGet()`; if none, prompt open folder
4. `sessionNew(projectPath)` then chat

- [ ] **Step 2: Manual verify**

- Quit Claude temporarily from PATH → onboarding appears
- Restore → Check again → main UI
- Open this repo folder → send message → streamed reply

- [ ] **Step 3: Commit**

```bash
git add src electron
git commit -m "$(cat <<'EOF'
feat: add onboarding, project bar, and streaming chat UI

EOF
)"
```

---

### Task 6: FileService + attachments (TDD)

**Files:**
- Create: `electron/bridge/file-service.ts`, `tests/file-service.test.ts`
- Modify: `electron/ipc.ts`, `electron/preload.ts`, `src/components/Composer.tsx`, `src/App.tsx`
- Test: `tests/file-service.test.ts`

**Interfaces:**
- Consumes: Node `fs`, `path`, `os`
- Produces:
  - `export const MAX_FILE_BYTES = 20 * 1024 * 1024`
  - `export const MAX_FILES_PER_TURN = 10`
  - `export function validateAndStage(paths: string[], stagingDir: string): AttachmentRef[]` (throws on violation)
  - IPC `files:pick`, `files:stagePaths`

- [ ] **Step 1: Write failing tests**

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_FILES_PER_TURN, validateAndStage } from '../electron/bridge/file-service'

describe('validateAndStage', () => {
  it('stages existing small files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    const src = path.join(dir, 'a.txt')
    fs.writeFileSync(src, 'hello')
    const staging = path.join(dir, 'stage')
    const refs = validateAndStage([src], staging)
    expect(refs).toHaveLength(1)
    expect(fs.existsSync(refs[0].path)).toBe(true)
  })

  it('rejects more than MAX_FILES_PER_TURN', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-'))
    const paths = Array.from({ length: MAX_FILES_PER_TURN + 1 }, (_, i) => {
      const p = path.join(dir, `${i}.txt`)
      fs.writeFileSync(p, 'x')
      return p
    })
    expect(() => validateAndStage(paths, path.join(dir, 'stage'))).toThrow(/10/)
  })
})
```

- [ ] **Step 2: Implement FileService**

`electron/bridge/file-service.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import type { AttachmentRef } from './types'

export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_FILES_PER_TURN = 10

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

export function validateAndStage(paths: string[], stagingDir: string): AttachmentRef[] {
  if (paths.length > MAX_FILES_PER_TURN) {
    throw new Error(`You can attach at most ${MAX_FILES_PER_TURN} files per turn`)
  }
  fs.mkdirSync(stagingDir, { recursive: true })
  return paths.map((p) => {
    if (!fs.existsSync(p)) throw new Error(`File not found: ${p}`)
    const stat = fs.statSync(p)
    if (!stat.isFile()) throw new Error(`Not a file: ${p}`)
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File exceeds 20 MB: ${path.basename(p)}`)
    }
    const name = path.basename(p)
    const dest = path.join(stagingDir, `${Date.now()}-${name}`)
    fs.copyFileSync(p, dest)
    return { path: dest, name, mimeType: mimeFor(p), size: stat.size }
  })
}

export function isImageAttachment(ref: AttachmentRef): boolean {
  return ref.mimeType.startsWith('image/') || IMAGE_EXT.has(path.extname(ref.name).toLowerCase())
}
```

Wire dialogs + drag-drop: renderer sends paths via `files:stagePaths`; Composer shows removable chips + thumbnails for images; clear staging on app quit in `main.ts`.

- [ ] **Step 3: Tests PASS + manual drag-drop image**

```bash
npm test -- tests/file-service.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add electron/bridge/file-service.ts tests/file-service.test.ts electron src
git commit -m "$(cat <<'EOF'
feat: add file/image attach with staging and limits

EOF
)"
```

---

### Task 7: SessionStore + sidebar resume

**Files:**
- Create: `electron/bridge/session-store.ts`, `tests/session-store.test.ts`, `src/components/SessionSidebar.tsx`
- Modify: `electron/ipc.ts`, `electron/preload.ts`, `src/App.tsx`
- Test: `tests/session-store.test.ts`

**Interfaces:**
- Consumes: Claude Code session files under `~/.claude/projects/<encoded-path>/` when present
- Produces:
  - `listSessions(projectPath): SessionSummary[]`
  - `SessionSummary { id: string; mtime: number; preview?: string }`
  - IPC `session:list`, `session:resume`

- [ ] **Step 1: Write failing test with temp fixture directory**

Create a fake project sessions dir with two `.jsonl` files named by uuid; `listSessions` returns sorted-by-mtime summaries.

- [ ] **Step 2: Implement SessionStore**

Encode project path the same way Claude Code does if discoverable (inspect `~/.claude/projects` on the implementer’s machine). Fallback: return sessions from `loadSettings` history array if Claude’s layout cannot be read — still support `--resume` when user pastes/selects an id from discovered files.

`session:resume` calls `bridge.start({ resume: true, sessionId, projectPath, ... })`.

- [ ] **Step 3: Sidebar UI** — New chat, list items, click to resume.

- [ ] **Step 4: Commit**

```bash
git add electron/bridge/session-store.ts tests/session-store.test.ts src electron
git commit -m "$(cat <<'EOF'
feat: list and resume Claude Code sessions

EOF
)"
```

---

### Task 8: Permission modal

**Files:**
- Create: `src/components/PermissionModal.tsx`
- Modify: `src/App.tsx`, `src/components/Composer.tsx`, `electron/bridge/stream-parser.ts` (fixtures), `tests/stream-parser.test.ts`
- Test: unit for normalize + manual approve/deny

**Interfaces:**
- Consumes: `ChatEvent` of type `permission_request`; `chatRespondPermission`
- Produces: blocking modal; composer disabled until resolved

- [ ] **Step 1: Add fixture test for control_request → permission_request** (already in Task 2; extend if real CLI field names differ after capture).

- [ ] **Step 2: Implement PermissionModal**

Show tool name, JSON-pretty `toolInput`, buttons Approve / Deny / Cancel(=Deny). On open, set `permissionPending` in App state; Composer `disabled={!!permissionPending}`.

- [ ] **Step 3: Settings fallback**

Add simple settings select for `--permission-mode`: `default | acceptEdits | plan | bypassPermissions` passed into `ClaudeBridge.start` args when interactive control_request is unavailable. Document in UI help text.

- [ ] **Step 4: Manual test** — ask Claude to run a bash command; modal appears; Deny then Approve paths both work.

- [ ] **Step 5: Commit**

```bash
git add src electron tests
git commit -m "$(cat <<'EOF'
feat: in-app approve/deny for Claude Code tool permissions

EOF
)"
```

---

### Task 9: Packaging (macOS / Windows / Linux)

**Files:**
- Create: `electron-builder.yml`, `README.md`
- Modify: `package.json` build scripts if needed

**Interfaces:**
- Produces: `npm run dist` artifacts per platform CI/host

- [ ] **Step 1: Add electron-builder config**

```yml
appId: com.anthropic.claude-code-desktop.unofficial
productName: Claude Code Desktop
files:
  - dist/**/*
  - dist-electron/**/*
directories:
  output: release
mac:
  target: [dmg, zip]
  category: public.app-category.developer-tools
win:
  target: [nsis, zip]
linux:
  target: [AppImage, deb]
  category: Development
```

- [ ] **Step 2: README** — prerequisites (`claude` on PATH), `npm install`, `npm run dev`, `npm run dist`, link to design spec.

- [ ] **Step 3: Build on this Mac**

```bash
npm run dist
```

Expected: artifacts under `release/`.

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml README.md package.json
git commit -m "$(cat <<'EOF'
chore: add electron-builder packaging for macOS Windows Linux

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Electron + React + stream-json bridge | 1, 2, 4 |
| CliDetector + install guidance + browse binary | 3, 5 |
| Project folder picker | 4, 5 |
| Streaming chat | 4, 5 |
| Image/file attach + limits | 6 |
| Session list / resume | 7 |
| Permission Approve/Deny (+ fallback modes) | 8 |
| macOS/Windows/Linux packaging | 9 |
| No bundled CLI / no custom API auth | Global + 3, 4 |

## Self-review notes

- No TBD placeholders left in task steps.
- Attachment wire format may need adapter tweak after first real CLI capture — confined to `ClaudeBridge.sendMessage`.
- Session path encoding must be verified against local `~/.claude/projects` during Task 7.
- `app-settings.ts` uses `electron.app` — unit tests for settings that need app should run under Electron or inject path; CliDetector tests inject `which`/`exec` and do not load settings.
