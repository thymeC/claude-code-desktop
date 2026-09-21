# Claude Code Desktop

Local desktop GUI shell around the [Claude Code](https://code.claude.com/docs/en/overview) CLI — chat, project folders, file/image attach, session resume, and in-app tool permission prompts.

## Prerequisites

- Node.js 20+
- Claude Code CLI installed and logged in (`claude` on your PATH)

If Electron fails to download (e.g. GitHub timeouts), this repo’s `.npmrc` points `electron_mirror` at npmmirror. Or:

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
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
open "release/mac-arm64/Claude Code Desktop.app"
```

Full installers (DMG + zip on macOS):

```bash
npm run dist
```

Artifacts land in `release/` (e.g. `Claude Code Desktop-0.1.0-arm64.dmg`).

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
