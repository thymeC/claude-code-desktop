# Claude Code Desktop — Design Spec

**Date:** 2026-09-22  
**Status:** Ready for user review  
**Product:** Local desktop GUI shell around the Claude Code CLI

## 1. Goals

Build a cross-platform desktop app that feels like Claude Desktop for day-to-day Claude Code use: chat, project folder, image/file attach, session resume, and in-app tool-permission prompts — while Claude Code remains the agent runtime and auth source.

### Success criteria (v1)

- User can open the app, pick a project folder, chat with Claude Code, and see streamed replies.
- User can attach images and files via picker or drag-and-drop (Claude Desktop–like).
- User can list and resume past sessions for a project.
- When Claude Code requests tool permission, the app shows Approve / Deny (and related choices) and continues the session.
- If `claude` is missing from PATH, the app shows install guidance and a re-check action (does not bundle the CLI).

### Non-goals (v1)

- Bundling or auto-installing Claude Code.
- Replacing Claude Code auth with a custom Anthropic API-key login UI.
- Full Claude Desktop feature parity (Artifacts, org admin, voice, etc.).
- Embedding a raw PTY terminal as the primary UX.

## 2. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Product shape | GUI shell over existing Claude Code CLI |
| Platforms | macOS, Windows, Linux |
| v1 scope | Chat + folder picker + attach + stream + sessions + permission UI |
| CLI provisioning | Detect on PATH; guide install if missing |
| Stack | Electron + React (Vite) + main-process stream-json bridge |

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React)                                       │
│  Chat · Attachments · Sessions · Permission modal       │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (typed)
┌──────────────────────────▼──────────────────────────────┐
│  Main process                                           │
│  • ClaudeBridge (spawn/manage CLI, parse stream-json)   │
│  • SessionStore (list/resume metadata)                  │
│  • CliDetector (PATH check + install guidance)          │
│  • FileService (dialogs, stage attachments)             │
└──────────────────────────┬──────────────────────────────┘
                           │ stdin/stdout
┌──────────────────────────▼──────────────────────────────┐
│  claude CLI (user-installed, already logged in)         │
└─────────────────────────────────────────────────────────┘
```

### Boundaries

- Renderer never spawns `claude`; it only uses typed IPC.
- `ClaudeBridge` is the sole process owner: start/stop, write turns/attachments, parse stream events, surface permission requests.
- Auth stays with Claude Code’s existing login; the app does not store Anthropic API keys.
- Missing CLI → blocking onboarding with install links and “Check again”.

### Process model

Primary integration path:

```text
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --include-partial-messages \
  [--resume <session-id> | --session-id <uuid>]
```

- Working directory = selected project folder.
- User messages and attachment references are written as JSON lines on stdin.
- Assistant/tool/permission events are read as JSON lines on stdout and forwarded to the UI.
- If stream-json permission protocol details differ across Claude Code versions, bridge adapters normalize to a stable internal event schema (see §6 `chat:event` types).

## 4. Components

### 4.1 CliDetector (main)

- Resolve `claude` via PATH (and common install locations as fallback).
- Offer “Browse for claude binary” so users can pick a non-PATH install; persist that path in app settings.
- Return `{ found, version, path }` or `{ found: false, guidance }`.
- Guidance points to official Claude Code install docs; user installs externally, then re-checks.

### 4.2 ClaudeBridge (main)

- Spawn/kill one active CLI child per window (v1: single active session process).
- Line-buffer stdout; parse JSON; emit typed events to renderer.
- Accept commands: `start`, `sendMessage`, `respondPermission`, `stop`, `resume`.
- Map attachments into whatever Claude Code accepts for media/files in print/stream mode (path references in the user turn and/or staged copies under a temp attach dir). Exact wire format is verified against the installed CLI during implementation and locked in an adapter.

### 4.3 SessionStore (main)

- Discover sessions Claude Code already persists for a project (read Claude Code’s on-disk session index where available).
- Maintain lightweight app metadata: last project path, last session id, window state.
- Expose `listSessions(projectPath)` and `resumeSession(sessionId)`.

### 4.4 FileService (main)

- Native open-file / open-folder dialogs.
- Accept drag-drop paths from renderer (validated: exists, size/type limits).
- Stage copies into an app-controlled temp directory when needed so the CLI always receives stable paths.
- Supported v1 attach types: common images (`png`, `jpg`, `jpeg`, `gif`, `webp`) and general files (documents, code, archives) with a configurable max size (default 20 MB per file, 10 files per turn).

### 4.5 Renderer UI modules

- **Onboarding** — CLI missing / not logged-in messaging (login remains `claude` CLI / browser flow).
- **Project bar** — current folder, change folder, open in finder/explorer.
- **Session sidebar** — list, new chat, resume.
- **Chat transcript** — user/assistant/tool activity; streaming partials.
- **Composer** — text, attach button, drag-drop zone, send / stop.
- **Permission modal** — tool name, summary/args preview, Approve / Deny (and Deny with feedback if protocol supports it).

## 5. Data flow

### 5.1 First launch

1. App starts → `CliDetector.check()`.
2. If missing → Onboarding; else → last project or “Open folder”.
3. User selects folder → SessionStore lists sessions → New chat or Resume.

### 5.2 Send message with attachments

1. User drops/selects files → FileService validates and stages → composer shows chips.
2. Send → IPC `sendMessage({ text, attachmentPaths })`.
3. Bridge writes a user turn on stdin (text + attachment refs).
4. Stream events update transcript (partial text, tool use, results).
5. Turn completes → session id persisted for resume.

### 5.3 Permission prompt

1. Bridge receives a permission-request event from the stream.
2. Renderer shows modal; chat input disabled until answered.
3. User chooses Approve / Deny → IPC `respondPermission({ requestId, decision })`.
4. Bridge writes the corresponding control message on stdin; stream continues.

If a given Claude Code version cannot do interactive permissions over `-p` stream-json, v1 falls back to `--permission-mode` presets selectable in settings (`default`, `acceptEdits`, `plan`, etc.) and documents the limitation — but the preferred path is interactive modal control.

### 5.4 Resume session

1. User picks a session → Bridge starts CLI with `--resume <id>` in that project cwd.
2. Transcript is reconstructed from Claude Code session history when available; otherwise show “Resumed” marker and continue from new turns.

## 6. IPC surface (v1)

Renderer → Main:

- `cli:check`
- `project:open` / `project:get`
- `session:list` / `session:new` / `session:resume`
- `chat:send` / `chat:stop` / `chat:respondPermission`
- `files:pick` / `files:stagePaths`

Main → Renderer (events):

- `cli:status`
- `chat:event` (normalized: `partial`, `message`, `tool`, `permission_request`, `error`, `done`)
- `session:updated`

All payloads are JSON-serializable and versioned with a `schemaVersion` field.

## 7. UI / UX notes

- Layout: left session list, center transcript, bottom composer (Claude Desktop–familiar, not a dashboard).
- Attachments appear as removable chips above the composer; images show thumbnails.
- Permission modal is modal and blocking for that session only.
- Dark/light follow OS preference in v1 (simple theme tokens; no purple-glow aesthetic).
- Copy is plain: “Claude Code Desktop” as product name in the title bar / about screen.

## 8. Error handling

| Case | Behavior |
|------|----------|
| `claude` not found | Onboarding with install guidance + re-check |
| CLI exits non-zero | Toast + transcript error; offer Restart session |
| Auth/login required | Surface CLI message; link to run `claude` once in terminal or use setup-token docs |
| Invalid/oversized attach | Reject with clear message before send |
| Stream parse error | Log raw line; show recoverable error; do not crash app |
| Permission timeout | No auto-deny; modal stays open until Approve, Deny, or Cancel (Cancel = Deny) |

## 9. Project layout (proposed)

```text
claude-code-desktop/
  design/                          # specs (this file)
  package.json
  electron/
    main.ts
    preload.ts
    bridge/claude-bridge.ts
    bridge/cli-detector.ts
    bridge/session-store.ts
    bridge/file-service.ts
  src/                             # React renderer
    App.tsx
    components/
    lib/ipc.ts
  docs/                            # optional user-facing docs later
```

## 10. Testing strategy

- **Unit:** JSON line parser; attachment validation; event normalizer.
- **Integration (local):** spawn real `claude -p` with a dry/fixture project when credentials exist; otherwise mock child process with recorded stream fixtures.
- **E2E (smoke):** open app → detect CLI mock → open folder → send text → see streamed events (Playwright for Electron or a small main-process smoke script).
- Manual checklist: drag-drop image, multi-file attach, resume session, approve/deny permission, missing-CLI onboarding on each OS CI image where feasible.

## 11. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| stream-json permission protocol incomplete/unstable | Adapter layer + settings fallback permission modes |
| Session history format undocumented | Prefer CLI resume; treat transcript rebuild as best-effort |
| Large files / many images | Hard limits; stage to temp; clear staging on quit |
| Cross-platform PATH quirks | Explicit detector + “Browse for claude binary” escape hatch |

## 12. Implementation order (high level)

1. Electron + Vite + React scaffold; basic window.
2. CliDetector + onboarding.
3. ClaudeBridge text-only stream chat in a chosen folder.
4. Attachments (picker + drag-drop).
5. Session list / resume.
6. Permission modal + control replies.
7. Packaging for macOS / Windows / Linux.

---

## Appendix A — Out of scope reminders

MCP management UI, plugin marketplace, multi-window multi-session processes, bundled CLI, and custom cloud auth are deferred past v1.
