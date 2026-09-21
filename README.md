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

## Test

```bash
npm test
npm run typecheck
```

## Package

```bash
npm run dist
```

Artifacts land in `release/`.

## Docs

- Design: `design/2026-09-22-claude-code-desktop-design.md`
- Plan: `design/2026-09-22-claude-code-desktop-plan.md`
