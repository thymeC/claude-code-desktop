# repo-privacy-scan — Design Spec

**Date:** 2026-09-22  
**Status:** Approved (pending user review of this written spec)  
**Product:** Standalone CLI to detect whether a cloned repository phones home beyond LLM API usage

## 1. Goals

After downloading any repo, a user can run:

```bash
npx repo-privacy-scan .
```

and get a clear pass/fail report: does this project appear to send data to the internet **only** to well-known LLM API hosts (plus optional extras declared in a privacy manifest), or does it also include telemetry, analytics, or other upload destinations?

### Success criteria (v1)

- Install-free run via `npx repo-privacy-scan [path]` (default `.`).
- Offline static analysis only (does not execute the scanned project).
- Detects common telemetry/analytics dependencies and hardcoded non-LLM network destinations.
- Strict built-in allowlist of well-known LLM API hosts.
- Optional `privacy.json` in the scanned repo may **add** hosts to the allowlist only (cannot disable telemetry rules).
- Human-readable report + `--json`; exit codes: `0` pass, `1` fail, `2` tool error.
- Report always states: LLM providers still receive prompt/tool content; this tool only checks for *extra* destinations.

### Non-goals (v1)

- Guaranteeing runtime behavior after the user installs/runs the app.
- Scanning compiled binaries without readable source.
- Replacing a legal privacy policy or DPA.
- Prompt/skill-only “enforcement.”
- Network sandbox / live traffic capture.

## 2. Decisions (locked)

| Topic | Choice |
|-------|--------|
| Shape | Standalone npm package / GitHub repo (`repo-privacy-scan`) |
| Distribution | `npx` one-shot (publish to npm) |
| Detection mode | Static scan **+** optional `privacy.json` (approach C) |
| Allowlist policy | **Strict** built-in LLM hosts; manifest only extends |
| Runtime probing | Out of scope for v1 |
| Home for design notes | Spec may live in `claude-code-desktop` docs until the new repo exists; implementation lands in the new repo |

## 3. Architecture

```
npx repo-privacy-scan [dir]
        │
        ▼
┌───────────────────┐
│  CLI (bin)        │  parse args, exit codes, --json
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Walker           │  list text files; skip node_modules, dist, .git, …
└─────────┬─────────┘
          │
     ┌────┴────┐
     ▼         ▼
┌─────────┐ ┌──────────────┐
│ Deps    │ │ Content scan │  URLs, fetch/axios/ws hosts, upload patterns
│ scan    │ │              │
└────┬────┘ └──────┬───────┘
     │             │
     └──────┬──────┘
            ▼
┌───────────────────┐
│  Allowlist +      │  built-in LLM hosts ∪ privacy.json.allowedHosts
│  Classifier       │  telemetry always fail; unknown host fail
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Report           │  text or JSON
└───────────────────┘
```

## 4. CLI interface

```
repo-privacy-scan [path] [options]

Options:
  --json              Machine-readable output
  --require-manifest  Fail if privacy.json is missing
  --help
  --version
```

**Exit codes**

| Code | Meaning |
|------|---------|
| 0 | No failing findings |
| 1 | One or more failing findings |
| 2 | Invalid path, I/O error, or invalid `privacy.json` |

## 5. Manifest (`privacy.json`)

Optional file at the **root of the scanned repo**:

```json
{
  "allowedHosts": ["llm.example.com"],
  "notes": "Self-hosted OpenAI-compatible gateway"
}
```

Rules:

- `allowedHosts`: array of hostnames (no schemes/paths). Supports simple `*.` prefix wildcards for subdomains where documented.
- Manifest **cannot** mark telemetry SDKs as allowed.
- Manifest **cannot** disable the built-in LLM allowlist requirement for other hosts.
- Unknown keys: warn, ignore (forward compatible).

## 6. Built-in LLM allowlist (v1 seed)

Exact list is versioned in code and documented in README; initial seed includes hosts such as:

- `api.anthropic.com`
- `api.openai.com`
- `*.openai.azure.com`
- `generativelanguage.googleapis.com`
- `api.mistral.ai`
- `api.together.xyz`
- `api.groq.com`
- `api.fireworks.ai`
- `openrouter.ai` / `api.openrouter.ai`

Localhosts (`localhost`, `127.0.0.1`, `::1`) are treated as **info/warn** by default (local gateways), not automatic fail—unless `--strict-local` is added later. **v1:** localhost = warn only.

## 7. Finding categories

| Severity | Examples |
|----------|----------|
| **fail** | Known telemetry/analytics package in `package.json` / lockfile / imports; hardcoded URL host not on allowlist; obvious analytics/telemetry ingest paths |
| **warn** | Dynamic URL construction that cannot be resolved; localhost LLM gateway; docs mentioning third-party URLs without code use |
| **info** | Manifest present; summary of allowlisted hosts observed |

## 8. Static detection (v1 heuristics)

### Dependencies

Scan `package.json` (and optionally lockfile names) for known packages, e.g. `@sentry/*`, `posthog-js`, `posthog-node`, `mixpanel`, `amplitude-js`, `@segment/*`, `@datadog/*`, `applicationinsights`, `newrelic`, etc.

### Content

For common source extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`, `.rs`, `.java`, `.kt`, `.rb`, …):

- Extract `https?://` URLs and classify hosts.
- Flag `fetch(`, `axios.`, `got(`, `request(`, `WebSocket(`, `XMLHttpRequest` paired with string literals when host is recoverable.
- Flag path/query patterns like `/telemetry`, `/analytics`, `/collect`, `/ingest` on non-allowlisted hosts.

Skip: `node_modules`, `.git`, `dist`, `build`, `coverage`, binary/media files, minified bundles over a size threshold (warn that they were skipped).

## 9. Honesty / limitations (must appear in `--help` and report footer)

- Static analysis can miss obfuscation, native addons, and runtime-configured endpoints.
- Approving a repo does **not** mean the LLM never sees private data—only that *extra* internet destinations were not found by these heuristics.
- Users should still review permissions and provider policies.

## 10. Package layout (new repo)

```
repo-privacy-scan/
  package.json          # bin: repo-privacy-scan → dist/cli.js
  README.md
  src/
    cli.ts
    walk.ts
    scan-deps.ts
    scan-content.ts
    allowlist.ts
    manifest.ts
    report.ts
    types.ts
  tests/
    fixtures/           # tiny fake repos: clean / telemetry / custom-host
    *.test.ts
```

Stack: TypeScript, Node 18+, vitest, no Electron dependency.

## 11. Relationship to Claude Code Desktop

- Desktop app may later link to this tool (“Scan this repo”) or document `npx repo-privacy-scan .` in its README.
- Desktop app network allowlisting (runtime) is a **separate** feature; this CLI is the portable pre-install check.

## 12. Implementation phases

1. Scaffold npm package + CLI stub + fixtures.
2. Walker + dep scan + content URL scan + allowlist.
3. Manifest loader + report + exit codes.
4. Publish to npm; document `npx` usage.
5. (Optional) Claude Code Desktop README pointer.

## 13. Open points (non-blocking for v1)

- Exact telemetry package list expansion over time.
- Whether lockfile-only deps (not in package.json) are required for fail vs warn.
- CI GitHub Action wrapper (post-v1).
