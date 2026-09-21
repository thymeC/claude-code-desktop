import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildProjectTree,
  readFile,
  resolveInProject,
  runProjectTool,
} from '../electron/bridge/project-tools'

describe('project-tools', () => {
  it('sandboxes paths inside the project', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-proj-'))
    try {
      fs.writeFileSync(path.join(tmp, 'main.py'), 'from fastapi import FastAPI\n')
      expect(resolveInProject(tmp, 'main.py')).toBe(path.join(tmp, 'main.py'))
      expect(() => resolveInProject(tmp, '../outside')).toThrow(/escapes/)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('reads files and builds a tree', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccd-proj-'))
    try {
      fs.mkdirSync(path.join(tmp, 'app'))
      fs.writeFileSync(path.join(tmp, 'app', 'main.py'), 'app = FastAPI()\n')
      const tree = buildProjectTree(tmp)
      expect(tree).toContain('app/')
      expect(tree).toContain('main.py')
      expect(readFile(tmp, 'app/main.py')).toContain('FastAPI')
      expect(runProjectTool(tmp, 'grep', JSON.stringify({ pattern: 'FastAPI' }))).toContain(
        'main.py',
      )
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
