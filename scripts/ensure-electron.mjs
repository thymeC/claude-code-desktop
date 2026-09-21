#!/usr/bin/env node
/**
 * Ensure the Electron binary is present. If the default download failed
 * (common behind flaky GitHub access), retry via npmmirror.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = path.join(root, 'node_modules', 'electron')
const pathTxt = path.join(electronDir, 'path.txt')
const installJs = path.join(electronDir, 'install.js')

if (!existsSync(installJs)) {
  console.warn('[ensure-electron] electron package missing; skip')
  process.exit(0)
}

if (existsSync(pathTxt)) {
  process.exit(0)
}

console.warn('[ensure-electron] Electron binary missing; downloading via npmmirror…')
const result = spawnSync(process.execPath, [installJs], {
  cwd: electronDir,
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  },
  stdio: 'inherit',
})

if (result.status !== 0 || !existsSync(pathTxt)) {
  console.error(
    '[ensure-electron] Download failed. Try:\n' +
      '  ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install\n' +
      '  or: cd node_modules/electron && ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js',
  )
  process.exit(result.status || 1)
}

// Touch require so path resolves
try {
  require('electron')
} catch {
  // path.txt exists; runtime will resolve
}
