import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.tox',
  '.mypy_cache',
  'coverage',
  '.idea',
  '.vscode',
  'target',
  '.turbo',
])

const MAX_TREE_ENTRIES = 200
const MAX_READ_BYTES = 120_000
const MAX_GREP_HITS = 40
const MAX_LIST_ENTRIES = 200

export function resolveInProject(projectPath: string, relOrAbs: string): string {
  const root = path.resolve(projectPath)
  const candidate = path.isAbsolute(relOrAbs)
    ? path.resolve(relOrAbs)
    : path.resolve(root, relOrAbs)
  const rel = path.relative(root, candidate)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${relOrAbs}`)
  }
  return candidate
}

export function buildProjectTree(projectPath: string, maxDepth = 3): string {
  const root = path.resolve(projectPath)
  if (!fs.existsSync(root)) return `(project path missing: ${root})`

  const lines: string[] = [path.basename(root) + '/']
  let count = 0

  function walk(dir: string, depth: number, prefix: string) {
    if (count >= MAX_TREE_ENTRIES || depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const entry of entries) {
      if (count >= MAX_TREE_ENTRIES) {
        lines.push(`${prefix}…`)
        return
      }
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
      count++
      if (entry.isDirectory()) {
        lines.push(`${prefix}${entry.name}/`)
        walk(path.join(dir, entry.name), depth + 1, `${prefix}  `)
      } else {
        lines.push(`${prefix}${entry.name}`)
      }
    }
  }

  walk(root, 1, '  ')
  return lines.join('\n')
}

export function listDir(projectPath: string, rel = '.'): string {
  const dir = resolveInProject(projectPath, rel || '.')
  if (!fs.existsSync(dir)) return `Not found: ${rel}`
  if (!fs.statSync(dir).isDirectory()) return `Not a directory: ${rel}`
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const lines: string[] = []
  for (const entry of entries.slice(0, MAX_LIST_ENTRIES)) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    lines.push(`${entry.isDirectory() ? 'dir ' : 'file'} ${entry.name}`)
  }
  if (entries.length > MAX_LIST_ENTRIES) lines.push(`… ${entries.length - MAX_LIST_ENTRIES} more`)
  return lines.join('\n') || '(empty)'
}

export function readFile(projectPath: string, rel: string): string {
  const file = resolveInProject(projectPath, rel)
  if (!fs.existsSync(file)) return `Not found: ${rel}`
  if (!fs.statSync(file).isFile()) return `Not a file: ${rel}`
  const buf = fs.readFileSync(file)
  if (buf.length > MAX_READ_BYTES) {
    return `${buf.subarray(0, MAX_READ_BYTES).toString('utf8')}\n\n… truncated (${buf.length} bytes total)`
  }
  return buf.toString('utf8')
}

export function grepProject(
  projectPath: string,
  pattern: string,
  rel = '.',
): string {
  let re: RegExp
  try {
    re = new RegExp(pattern, 'i')
  } catch {
    return `Invalid regex: ${pattern}`
  }
  const root = resolveInProject(projectPath, rel || '.')
  const hits: string[] = []

  function walk(dir: string) {
    if (hits.length >= MAX_GREP_HITS) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (hits.length >= MAX_GREP_HITS) return
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.match(/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|exe|dll|so|dylib|bin)$/i)) {
        continue
      }
      let text: string
      try {
        const buf = fs.readFileSync(full)
        if (buf.length > MAX_READ_BYTES) continue
        text = buf.toString('utf8')
      } catch {
        continue
      }
      const relPath = path.relative(path.resolve(projectPath), full)
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= MAX_GREP_HITS) break
        if (re.test(lines[i]!)) {
          hits.push(`${relPath}:${i + 1}: ${lines[i]!.slice(0, 200)}`)
        }
      }
    }
  }

  if (fs.existsSync(root) && fs.statSync(root).isFile()) {
    // single file
    const relPath = path.relative(path.resolve(projectPath), root)
    try {
      const text = fs.readFileSync(root, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (hits.length < MAX_GREP_HITS && re.test(line)) {
          hits.push(`${relPath}:${i + 1}: ${line.slice(0, 200)}`)
        }
      })
    } catch {
      return `Could not read ${rel}`
    }
  } else {
    walk(root)
  }

  return hits.length ? hits.join('\n') : `No matches for /${pattern}/`
}

export const OPENAI_PROJECT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_dir',
      description: 'List files and directories under the project (relative path).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path (default ".")' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read a text file from the project by relative path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep',
      description: 'Search file contents in the project with a regex pattern.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'JavaScript regex pattern' },
          path: { type: 'string', description: 'Relative path to limit search (default ".")' },
        },
        required: ['pattern'],
      },
    },
  },
]

export function runProjectTool(
  projectPath: string,
  name: string,
  rawArgs: string,
): string {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return `Invalid JSON arguments: ${rawArgs}`
  }
  try {
    if (name === 'list_dir') {
      return listDir(projectPath, String(args.path ?? '.'))
    }
    if (name === 'read_file') {
      if (!args.path) return 'Missing path'
      return readFile(projectPath, String(args.path))
    }
    if (name === 'grep') {
      if (!args.pattern) return 'Missing pattern'
      return grepProject(projectPath, String(args.pattern), String(args.path ?? '.'))
    }
    return `Unknown tool: ${name}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
