#!/usr/bin/env node
// Local tooling for the Oficina fork (docs/OFICINA.md): build, sign, install and seed preferences.
//
//   node config/scripts/oficina-local.mjs build            JS build + native helpers + packaged arm64 .app + sign
//   node config/scripts/oficina-local.mjs sign [app]       sign every Mach-O inside-out with the local identity
//   node config/scripts/oficina-local.mjs install [app]    copy the .app to /Applications/Oficina.app
//   node config/scripts/oficina-local.mjs import-orca-data [--target=dir]  copy repo list + preferences from the official Orca
//
// Nothing here writes to the official Orca's bundle or data folder; import-orca-data only reads them.
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const identity = require('../oficina-identity.cjs')
const repoRoot = resolve(import.meta.dirname, '../..')
const defaultAppPath = join(repoRoot, 'dist', 'mac-arm64', `${identity.productName}.app`)
const installPath = `/Applications/${identity.productName}.app`
const entitlementsPath = join(repoRoot, 'resources', 'build', 'entitlements.mac.plist')
const CODESIGN_TIMEOUT_MS = 120_000

const OFFICIAL_ORCA_DATA_DIR = join(homedir(), 'Library', 'Application Support', 'orca')
// Why --target: lets a dry run seed a throwaway userData folder before the real one is touched.
const targetArgument = process.argv.find((arg) => arg.startsWith('--target='))
const OFICINA_DATA_DIR = targetArgument
  ? resolve(targetArgument.slice('--target='.length))
  : join(homedir(), 'Library', 'Application Support', identity.userDataDirName)

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit', ...options })
}

function pnpm(args, env = {}) {
  run('pnpm', args, { env: { ...process.env, ...env } })
}

function timed(label, fn, timings) {
  const startedAt = Date.now()
  fn()
  timings.push({ label, seconds: Math.round((Date.now() - startedAt) / 100) / 10 })
}

function build() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    throw new Error('oficina-local build targets an arm64 Mac')
  }
  const timings = []
  const overallStart = Date.now()
  timed(
    'build:desktop (typecheck, relay, cli, electron-vite, web)',
    () => pnpm(['run', 'build:desktop']),
    timings
  )
  timed('keyboard-layout helper', () => pnpm(['run', 'build:keyboard-layout-macos']), timings)
  timed(
    'notification-status helper (bundle id embedded)',
    () =>
      run('node', [
        'config/scripts/build-notification-status-macos.mjs',
        '--bundle-id',
        identity.appId,
        '--single-arch'
      ]),
    timings
  )
  timed('ensure electron runtime', () => pnpm(['run', 'ensure:electron-runtime']), timings)
  timed(
    'electron-builder (arm64 dir)',
    () =>
      run(
        'pnpm',
        [
          'exec',
          'electron-builder',
          '--config',
          'config/electron-builder.oficina.config.cjs',
          '--mac',
          '--arm64',
          '--dir',
          '--publish',
          'never'
        ],
        { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } }
      ),
    timings
  )
  timed('sign with local identity', () => sign(defaultAppPath), timings)
  const total = Math.round((Date.now() - overallStart) / 100) / 10
  console.log('\n[oficina-local] build timings')
  for (const { label, seconds } of timings) {
    console.log(`  ${String(seconds).padStart(7)} s  ${label}`)
  }
  console.log(`  ${String(total).padStart(7)} s  TOTAL`)
}

// Mach-O magic numbers: thin 32/64-bit in either byte order, and fat/universal.
const MACH_O_MAGICS = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe'])
const FAT_MAGIC = 'cafebabe'

function isMachO(path) {
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(8)
    if (readSync(fd, head, 0, 8, 0) < 8) {
      return false
    }
    const magic = head.subarray(0, 4).toString('hex')
    // Why the arch-count bound: 0xcafebabe is also the Java class-file magic.
    return MACH_O_MAGICS.has(magic) || (magic === FAT_MAGIC && head.readUInt32BE(4) < 20)
  } finally {
    closeSync(fd)
  }
}

function collectSigningTargets(appPath) {
  const targets = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      // Why lstat semantics: framework Versions/Current and top-level aliases are symlinks to code signed once.
      if (entry.isSymbolicLink()) {
        continue
      }
      if (entry.isDirectory()) {
        if (/\.(app|framework)$/.test(entry.name)) {
          targets.push({ path, kind: 'bundle' })
        }
        walk(path)
      } else if (entry.isFile() && lstatSync(path).size >= 8 && isMachO(path)) {
        targets.push({ path, kind: 'file' })
      }
    }
  }
  walk(appPath)
  // Why deepest first: a bundle's seal covers its contents, so contents are signed before it.
  targets.sort((a, b) => b.path.split('/').length - a.path.split('/').length)
  return targets
}

function codesign(args) {
  const result = spawnSync('codesign', args, { encoding: 'utf8', timeout: CODESIGN_TIMEOUT_MS })
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      `codesign blocked for ${CODESIGN_TIMEOUT_MS / 1000}s: a keychain prompt is probably waiting for "${identity.signingIdentityName}".`
    )
  }
  if (result.status !== 0) {
    throw new Error(`codesign ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
}

function sign(appPath = defaultAppPath) {
  if (!existsSync(appPath)) {
    throw new Error(`No app to sign at ${appPath}`)
  }
  const found = execFileSync('security', ['find-identity', '-p', 'codesigning'], {
    encoding: 'utf8'
  })
  if (!found.includes(`"${identity.signingIdentityName}"`)) {
    throw new Error(
      `Signing identity "${identity.signingIdentityName}" is not in the keychain; see docs/OFICINA.md.`
    )
  }
  const targets = collectSigningTargets(appPath)
  console.log(`[oficina-local] signing ${targets.length} nested items, then ${basename(appPath)}`)
  for (const target of targets) {
    // Why entitlements on app bundles only: they mirror upstream's local build and are inert without hardened runtime.
    const entitlements =
      target.kind === 'bundle' && target.path.endsWith('.app')
        ? ['--entitlements', entitlementsPath]
        : []
    codesign(['--force', '--sign', identity.signingIdentityName, ...entitlements, target.path])
  }
  codesign([
    '--force',
    '--sign',
    identity.signingIdentityName,
    '--entitlements',
    entitlementsPath,
    appPath
  ])
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath])
  run('codesign', ['-dr', '-', appPath])
}

function install(appPath = defaultAppPath) {
  if (basename(installPath) !== `${identity.productName}.app`) {
    throw new Error('Refusing to install anywhere but Oficina.app')
  }
  if (!existsSync(appPath)) {
    throw new Error(`No app to install at ${appPath}`)
  }
  // Why: --replace deletes the installed bundle first, so installing it onto itself would leave no app.
  if (resolve(appPath) === resolve(installPath)) {
    throw new Error(`Refusing to install ${installPath} onto itself`)
  }
  if (existsSync(installPath) && !process.argv.includes('--replace')) {
    throw new Error(`${installPath} exists; pass --replace to overwrite this fork's own bundle.`)
  }
  if (existsSync(installPath)) {
    if (spawnSync('pgrep', ['-f', `${installPath}/Contents/`]).status === 0) {
      throw new Error(`${installPath} is running; quit Oficina first.`)
    }
    // Why: ditto merges into an existing bundle, so a file the new build dropped would break the seal.
    rmSync(installPath, { recursive: true, force: true })
  }
  run('ditto', [appPath, installPath])
  run('codesign', ['--verify', '--deep', '--strict', installPath])
}

// Settings that are secrets, account-bound, or bind this profile to the official Orca's runtime.
const DROPPED_SETTINGS = new Set([
  'opencodeGoApiKey',
  'opencodeSessionCookie',
  'claudeManagedAccounts',
  'codexManagedAccounts',
  'activeClaudeManagedAccountId',
  'activeCodexManagedAccountId',
  'activeCodexManagedAccountIdsByRuntime',
  'activeRuntimeEnvironmentId',
  'agentDefaultEnv',
  'pluginConsents',
  'httpProxyUrl',
  'geminiCliOAuthEnabled',
  'minimaxEndpoint',
  'minimaxGroupId',
  'minimaxUsageModels',
  'telemetry',
  'devPluginPaths'
])
const DROPPED_SETTING_PREFIXES = ['mobilePairing']
const KEPT_UI_KEYS = [
  'uiZoomLevel',
  'sidebarWidth',
  'rightSidebarWidth',
  'sortBy',
  'groupBy',
  'projectOrderBy',
  'manualRepoOrder',
  'statusBarItems',
  'statusBarVisible',
  'worktreeCardProperties',
  'editorFontZoomLevel',
  'browserDefaultZoomLevel'
]
// Repo list and project structure only: no sessions, terminals, SSH targets, PTY ids or worktree metadata.
const KEPT_TOP_LEVEL_KEYS = [
  'schemaVersion',
  'repos',
  'projects',
  'projectHostSetups',
  'projectGroups',
  'folderWorkspaces',
  'sparsePresetsByRepo'
]
// Booleans that only say a secret exists elsewhere; the importer resets them to false.
const BOOLEAN_FLAG_KEY_PATHS = new Set(['$.settings.voice.openAiApiKeyConfigured'])
const SECRET_KEY_NAME =
  /(api[-_]?key|token|secret|passw(?:or)?d|cookie|credential|authorization|bearer)/i
const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/
]

function findSecretKeyPaths(value, path = '$') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretKeyPaths(item, `${path}[${index}]`))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(SECRET_KEY_NAME.test(key) ? [`${path}.${key}`] : []),
      ...findSecretKeyPaths(child, `${path}.${key}`)
    ])
  }
  return []
}

function importOrcaData() {
  const sourceFile = join(OFFICIAL_ORCA_DATA_DIR, 'profiles', 'local-default', 'orca-data.json')
  const targetFile = join(OFICINA_DATA_DIR, 'orca-data.json')
  const targetProfileDir = join(OFICINA_DATA_DIR, 'profiles')
  if (existsSync(targetFile) || existsSync(targetProfileDir)) {
    throw new Error(`${OFICINA_DATA_DIR} already holds a profile; refusing to overwrite it.`)
  }
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'))
  const filtered = {}
  for (const key of KEPT_TOP_LEVEL_KEYS) {
    if (source[key] !== undefined) {
      filtered[key] = source[key]
    }
  }
  const droppedSettings = []
  filtered.settings = {}
  for (const [key, value] of Object.entries(source.settings ?? {})) {
    if (
      DROPPED_SETTINGS.has(key) ||
      DROPPED_SETTING_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      droppedSettings.push(key)
      continue
    }
    filtered.settings[key] = value
  }
  // Why forced off: the fork keeps agent hooks off (docs/OFICINA.md), so the saved switch must say so too.
  filtered.settings.agentStatusHooksEnabled = false
  // Why: the flag describes a key stored in the official Orca's ~/.orca, which Oficina does not read.
  if (filtered.settings.voice && typeof filtered.settings.voice === 'object') {
    filtered.settings.voice = { ...filtered.settings.voice, openAiApiKeyConfigured: false }
  }
  filtered.ui = Object.fromEntries(
    KEPT_UI_KEYS.filter((key) => source.ui?.[key] !== undefined).map((key) => [key, source.ui[key]])
  )

  const secretKeyPaths = findSecretKeyPaths(filtered).filter(
    (path) => !BOOLEAN_FLAG_KEY_PATHS.has(path)
  )
  const serialized = JSON.stringify(filtered)
  const pointsIntoOfficialOrca = /Application Support\/orca|\/\.orca\b/i.test(serialized)
  const secretValueHits = SECRET_VALUE_PATTERNS.filter((pattern) => pattern.test(serialized)).length
  if (pointsIntoOfficialOrca) {
    throw new Error('Refusing to write: a kept value points into the official Orca folders.')
  }
  if (secretKeyPaths.length > 0 || secretValueHits > 0) {
    throw new Error(
      `Refusing to write: ${secretKeyPaths.length} secret-looking key names (${secretKeyPaths.join(', ')}), ${secretValueHits} secret-looking values. Extend DROPPED_SETTINGS.`
    )
  }

  mkdirSync(OFICINA_DATA_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(targetFile, JSON.stringify(filtered), { mode: 0o600 })
  chmodSync(targetFile, 0o600)
  // Verdict only: counts and key names, never values.
  console.log(
    JSON.stringify(
      {
        wrote: targetFile,
        repos: filtered.repos?.length ?? 0,
        projects: filtered.projects?.length ?? 0,
        folderWorkspaces: filtered.folderWorkspaces?.length ?? 0,
        settingsKept: Object.keys(filtered.settings).length,
        settingsDropped: droppedSettings,
        uiKeysKept: Object.keys(filtered.ui).length,
        secretKeyNames: 0,
        secretValueHits: 0
      },
      null,
      2
    )
  )
  console.log(
    `[oficina-local] next launch of ${identity.productName} imports this file into its own profile; ${OFFICIAL_ORCA_DATA_DIR} was only read.`
  )
}

const [command, ...rest] = process.argv.slice(2)
const appArgument = rest.find((arg) => !arg.startsWith('--'))
switch (command) {
  case 'build':
    build()
    break
  case 'sign':
    sign(appArgument ? resolve(appArgument) : defaultAppPath)
    break
  case 'install':
    install(appArgument ? resolve(appArgument) : defaultAppPath)
    break
  case 'import-orca-data':
    importOrcaData()
    break
  default:
    console.error(
      'usage: oficina-local.mjs build | sign [app] | install [app] [--replace] | import-orca-data [--target=dir]'
    )
    process.exitCode = 2
}
