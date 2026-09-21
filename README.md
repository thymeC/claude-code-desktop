# Claude Code Desktop

Local desktop GUI shell around the [Claude Code](https://code.claude.com/docs/en/overview) CLI — chat, project folders, file/image attach, session resume, and in-app tool permission prompts.

## Prerequisites

- Node.js 22.12+ (Electron 44 / this repo’s `engines.node`; Node 18 will spam `EBADENGINE` and Vite will crash)
- Claude Code CLI installed and logged in (`claude` on your PATH)

If Electron fails to download (GitHub timeouts / `Electron failed to install correctly`), `postinstall` retries via npmmirror. You can also force it:

```bash
# macOS / Linux
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install

# Windows CMD
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ && npm install

# Windows PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"; npm install
```

## Develop

```bash
npm install
npm run dev
```

## Rebuild

Production build (renderer + Electron main/preload into `dist/` and `dist-electron/`):

```bash
npm run build
```

Unpackaged app folder (good for a quick local smoke of the built app):

```bash
npm run pack
```

Then open:

```bash
# macOS
open "release/mac-arm64/Claude Code Desktop.app"

# Windows
start "" "release\win-unpacked\Claude Code Desktop.exe"
```

Full installers (run on the target OS — macOS → DMG/zip, Windows → NSIS/zip):

```bash
npm run dist
```

`npm run dist` / `pack` use a cross-platform Node launcher that sets Electron + electron-builder binary mirrors and disables code-signing discovery (so the same command works in CMD, PowerShell, and zsh).

Artifacts land in `release/`:

- macOS: `Claude Code Desktop-0.3.0-arm64.dmg`, `…-mac.zip`
- Windows: `Claude Code Desktop-0.3.0-x64.exe` (NSIS), `…-x64.zip`

After pulling new changes, a typical rebuild is:

```bash
npm install
npm run build
npm run dist
```

## Test

```bash
npm test
npm run typecheck
```
## Auth

Enter an Anthropic API key when prompted (or set `ANTHROPIC_API_KEY` in your environment). The app stores the key encrypted via the OS keychain when available and passes it to Claude Code as `ANTHROPIC_API_KEY`.

## Docs

- Design: `design/2026-09-22-claude-code-desktop-design.md`
- Plan: `design/2026-09-22-claude-code-desktop-plan.md`
