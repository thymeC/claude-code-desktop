#!/usr/bin/env node
/**
 * Cross-platform electron-builder launcher.
 * Sets download mirrors + disables code-signing discovery so `npm run dist`
 * works the same on Windows CMD/PowerShell and macOS/Linux shells.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const ELECTRON_MIRROR =
  process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/'
const ELECTRON_BUILDER_BINARIES_MIRROR =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
  'https://npmmirror.com/mirrors/electron-builder-binaries/'

const builderCli = require.resolve('electron-builder/cli.js')
const args = process.argv.slice(2)
if (!args.includes('--config') && !args.includes('-c')) {
  args.unshift('--config', 'electron-builder.yml')
}

const result = spawnSync(process.execPath, [builderCli, ...args], {
  cwd: root,
  env: {
    ...process.env,
    ELECTRON_MIRROR,
    ELECTRON_BUILDER_BINARIES_MIRROR,
    // Avoid mac keychain / Windows signtool discovery hangs
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false',
  },
  stdio: 'inherit',
  shell: false,
})

process.exit(result.status ?? 1)
