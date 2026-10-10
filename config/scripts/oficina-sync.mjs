#!/usr/bin/env node
// Merges the newest stable Orca release into the Oficina branch (docs/OFICINA.md, "Syncing with Orca").
//
//   pnpm oficina:sync                     merge, install, run the gates; stops with a local branch ready
//   pnpm oficina:sync --push              also push the branch and open a PR into `oficina`
//   pnpm oficina:sync --push --merge      also merge that PR with a merge commit and delete the branch
//   pnpm oficina:sync --install           also install the packaged build over /Applications/Oficina.app
//   pnpm oficina:sync --gates-only        no merge: run install and the gates on this checkout (lint base: oficina)
//   --commit-trailer=<line>               appended to the merge commit message
//   --notes-file=<path>                   appended to the PR body (conflict notes, footer)
//
// Never rebases or squashes: upstream history stays in `oficina` as ordinary merge commits.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mergeTagOntoNewBranch } from './oficina-sync-merge.mjs'
import {
  newestStableTag,
  pickSyncTag,
  selectOficinaE2eSpecs,
  selectOficinaUnitTests
} from './oficina-sync-selection.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const BASE = 'oficina'
const UPSTREAM_SLUG = 'stablyai/orca'
const KNOWN_FLAGS = ['--push', '--merge', '--install', '--gates-only']
const KNOWN_OPTIONS = ['commit-trailer', 'notes-file']
const flags = new Set(process.argv.slice(2).filter((arg) => !arg.includes('=')))
const optionValue = (name) =>
  process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3)

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    // Why: `git ls-files` on this repo is several MB.
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit']
  }).trimEnd()
}
const git = (...args) => capture('git', args)
const lines = (text) => text.split('\n').filter(Boolean)
const gitSucceeds = (...args) =>
  spawnSync('git', args, { cwd: repoRoot, stdio: 'ignore' }).status === 0

function run(command, args, { cwd = repoRoot, env = {} } = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} could not start: ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`)
  }
}

function slugOf(remote) {
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(git('remote', 'get-url', remote))
  if (!match) {
    throw new Error(`Remote ${remote} is not a GitHub repository.`)
  }
  return match[1]
}

function assertReady() {
  const unknown = process.argv
    .slice(2)
    .filter(
      (arg) => !KNOWN_FLAGS.includes(arg) && !KNOWN_OPTIONS.some((o) => arg.startsWith(`--${o}=`))
    )
  if (unknown.length > 0) {
    throw new Error(`Unknown arguments: ${unknown.join(' ')}. See the header of this script.`)
  }
  const required = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).engines.node
  if (String(process.versions.node.split('.')[0]) !== required) {
    throw new Error(
      `Node ${required} is required (running ${process.versions.node}). Run: COREPACK_ENABLE_DOWNLOAD_PROMPT=0 fnm exec --using ${required} -- pnpm oficina:sync`
    )
  }
  // Why here: install refuses a running Oficina, and finding that out after the merge and build is late.
  if (
    process.argv.includes('--install') &&
    spawnSync('pgrep', ['-f', '/Applications/Oficina.app/Contents/']).status === 0
  ) {
    throw new Error('Oficina is running; quit it before a sync with --install.')
  }
  const dirty = git('status', '--porcelain', '--untracked-files=all')
  if (dirty) {
    throw new Error(`Working tree is not clean; commit, stash or remove:\n${dirty}`)
  }
  if (slugOf('upstream') !== UPSTREAM_SLUG) {
    throw new Error(`Remote "upstream" must point at ${UPSTREAM_SLUG}.`)
  }
  if (slugOf('origin') === UPSTREAM_SLUG) {
    throw new Error('Remote "origin" points at upstream; pull requests must go to the fork.')
  }
  if (flags.has('--merge') && !flags.has('--push')) {
    throw new Error('--merge needs --push: there is no pull request to merge otherwise.')
  }
  if (flags.has('--gates-only') && flags.size > 1) {
    throw new Error('--gates-only runs the gates on this checkout and takes no other flag.')
  }
}

function currentBranch() {
  return git('branch', '--show-current')
}

// Why compare before fetching: a fetch of a tag already here still runs a connectivity walk that takes
// minutes in this partial clone, and fetching every upstream tag stalls the same way.
function fetchReleaseTag(tag) {
  const ref = `refs/tags/${tag}`
  const [upstreamId] = capture('git', ['ls-remote', 'upstream', ref]).split(/\s+/)
  if (!upstreamId) {
    throw new Error(`Release ${tag} is published, but upstream has no ${ref}.`)
  }
  const localId = gitSucceeds('rev-parse', '--verify', '--quiet', ref)
    ? git('rev-parse', ref)
    : null
  if (localId === upstreamId && gitSucceeds('cat-file', '-e', `${ref}^{commit}`)) {
    console.log(`[oficina-sync] ${tag} is already here`)
    return
  }
  run('git', ['fetch', '--no-recurse-submodules', 'upstream', `${ref}:${ref}`])
}

// Why a continue mode: after a conflict the merge is finished by hand on sync/<tag>; re-running then resumes at the gates.
function resolveSyncTag() {
  const lastMerged = newestStableTag(lines(git('tag', '--merged', BASE)))
  const onSyncBranch = /^sync\/(v\d+\.\d+\.\d+)$/.exec(currentBranch())
  if (onSyncBranch) {
    const [, tag] = onSyncBranch
    if (!gitSucceeds('merge-base', '--is-ancestor', tag, 'HEAD')) {
      throw new Error(`${currentBranch()} does not contain ${tag} yet; finish the merge first.`)
    }
    if (!gitSucceeds('merge-base', '--is-ancestor', BASE, 'HEAD')) {
      throw new Error(`${currentBranch()} does not contain ${BASE}.`)
    }
    return { tag, lastMerged, resumed: true }
  }
  console.log('[oficina-sync] fetching origin and listing upstream releases')
  run('git', ['fetch', '--no-recurse-submodules', 'origin', BASE])
  if (git('rev-parse', `refs/heads/${BASE}`) !== git('rev-parse', `refs/remotes/origin/${BASE}`)) {
    throw new Error(`Local ${BASE} differs from origin/${BASE}; fast-forward or push it first.`)
  }
  const releaseTags = JSON.parse(
    capture('gh', [
      'release',
      'list',
      '--repo',
      UPSTREAM_SLUG,
      '--exclude-drafts',
      '--exclude-pre-releases',
      '--limit',
      '100',
      '--json',
      'tagName'
    ])
  ).map((release) => release.tagName)
  const picked = pickSyncTag({ mergedTags: lines(git('tag', '--merged', BASE)), releaseTags })
  if (picked.tag) {
    fetchReleaseTag(picked.tag)
  }
  return { ...picked, resumed: false }
}

function createMergedBranch({ tag, lastMerged }) {
  const branch = `sync/${tag}`
  if (gitSucceeds('rev-parse', '--verify', `refs/heads/${branch}`)) {
    throw new Error(`Branch ${branch} already exists; delete it, or switch to it to continue.`)
  }
  const trailer = optionValue('commit-trailer')
  const message = [
    `chore(sync): merge Orca ${tag}`,
    `Upstream release: https://github.com/${UPSTREAM_SLUG}/releases/tag/${tag}\nPrevious sync: ${lastMerged}`,
    ...(trailer ? [trailer] : [])
  ].join('\n\n')
  const result = mergeTagOntoNewBranch({ cwd: repoRoot, base: BASE, tag, branch, message })
  if (result.merged) {
    return
  }
  console.error(`\n${result.output}`)
  console.error(`\n[oficina-sync] merging ${tag} into ${BASE} failed; the merge was aborted.`)
  console.error(
    `Conflicting files (${result.conflicts.length}):\n${result.conflicts.map((file) => `  ${file}`).join('\n')}`
  )
  console.error(
    `\nReproduce and resolve by hand:\n  git switch -c ${branch} ${BASE} && git merge --no-ff ${tag}\n` +
      `Then commit, and re-run pnpm oficina:sync from ${branch} to continue with the gates.`
  )
  process.exit(1)
}

function testSelections() {
  const tracked = lines(git('ls-files'))
  // Why against the newest release merged into HEAD: that diff is exactly Oficina's footprint.
  const lastMerged = newestStableTag(lines(git('tag', '--merged', 'HEAD')))
  const changed = lastMerged ? lines(git('diff', '--name-only', lastMerged, 'HEAD')) : []
  const unitTests = selectOficinaUnitTests(tracked, changed)
  const e2eSpecs = selectOficinaE2eSpecs(tracked, changed)
  // Why a floor: a renamed pattern that matches nothing would otherwise turn a gate into a pass.
  if (unitTests.length === 0 || e2eSpecs.length === 0) {
    throw new Error('No Oficina unit tests or e2e specs found; fix oficina-sync-selection.mjs.')
  }
  console.log(`[oficina-sync] unit tests (${unitTests.length}):\n  ${unitTests.join('\n  ')}`)
  console.log(`[oficina-sync] e2e specs (${e2eSpecs.length}):\n  ${e2eSpecs.join('\n  ')}`)
  return { unitTests, e2eSpecs }
}

function buildSteps({ lintBase, unitTests, e2eSpecs }) {
  const node = process.execPath
  const testEnv = {
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_TEST_NODE_EXECUTABLE: process.execPath,
    ORCA_TEST_NODE_VERSION: process.versions.node
  }
  return [
    {
      name: 'install (frozen lockfile, root and mobile)',
      covers: 'dependencies match the committed lockfiles',
      execute() {
        run('pnpm', ['install', '--frozen-lockfile'])
        run('pnpm', ['install', '--frozen-lockfile'], { cwd: join(repoRoot, 'mobile') })
      }
    },
    {
      name: 'typecheck',
      covers: 'node, cli and web TypeScript projects (pnpm tc)',
      execute: () => run('pnpm', ['tc'])
    },
    {
      name: 'unit tests',
      covers: 'Oficina identity, builder config, sync selection and workspace-split tests',
      execute() {
        run(node, ['config/scripts/ensure-native-runtime.mjs', '--runtime=node'])
        run(
          node,
          [
            'node_modules/vitest/vitest.mjs',
            'run',
            '--config',
            'config/vitest.config.ts',
            ...unitTests
          ],
          { env: testEnv }
        )
      }
    },
    {
      name: 'e2e specs',
      covers:
        'split layout, pane header, restart, folder workspaces and agent-status receiver, on an e2e-mode build (harness global setup)',
      execute() {
        run('pnpm', ['run', 'ensure:electron-runtime'])
        run(
          'pnpm',
          [
            'exec',
            'playwright',
            'test',
            '--config',
            'tests/playwright.config.ts',
            '--project=electron-headless',
            ...e2eSpecs
          ],
          { env: { ORCA_BACKGROUND_LAUNCH: '1' } }
        )
      }
    },
    {
      name: 'changed-code lint',
      covers: `lint rules on every line changed on top of ${lintBase}`,
      // Why the tag as base: upstream CI already gated its own lines; Oficina's are what the new rules can break.
      execute: () => run(node, ['config/scripts/check-changed-code-quality.mjs', lintBase])
    },
    {
      name: 'packaged build',
      covers:
        'build:desktop, helpers, electron-builder, local signing, bundle checks (oficina-local.mjs build)',
      execute: () => run(node, ['config/scripts/oficina-local.mjs', 'build'])
    }
  ]
}

function runSteps(steps) {
  const results = []
  for (const step of steps) {
    console.log(`\n[oficina-sync] ${step.name}`)
    const startedAt = Date.now()
    let error = null
    try {
      step.execute()
    } catch (caught) {
      error = caught
      console.error(String(caught.message ?? caught))
    }
    results.push({ ...step, ok: !error, seconds: Math.round((Date.now() - startedAt) / 100) / 10 })
    if (error) {
      break
    }
  }
  return results
}

function gateTable(results) {
  return [
    '| Gate | Result | Seconds | Covers |',
    '| --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.name} | ${r.ok ? 'pass' : 'FAIL'} | ${r.seconds} | ${r.covers} |`)
  ].join('\n')
}

function printSummary({ heading, results, prUrl }) {
  const total = results.reduce((sum, r) => sum + r.seconds, 0)
  console.log(`\n[oficina-sync] summary: ${heading}`)
  for (const r of results) {
    console.log(`  ${String(r.seconds).padStart(7)} s  ${r.ok ? 'pass' : 'FAIL'}  ${r.name}`)
  }
  console.log(`  ${String(Math.round(total * 10) / 10).padStart(7)} s  TOTAL`)
  if (prUrl) {
    console.log(`  PR: ${prUrl}`)
  }
}

function openPullRequest({ tag, lastMerged, branch, results, resumed }, forkSlug) {
  const notesFile = optionValue('notes-file')
  const body = [
    `Merges the stable Orca release \`${tag}\` (previous sync: \`${lastMerged}\`) into \`${BASE}\` with a merge commit, so upstream history stays in the branch.`,
    `Release notes: https://github.com/${UPSTREAM_SLUG}/releases/tag/${tag}`,
    resumed
      ? 'The merge needed manual conflict resolution; see the notes below.'
      : 'The merge applied cleanly, with no conflicts.',
    '### Gates',
    gateTable(results),
    ...(notesFile ? [readFileSync(notesFile, 'utf8').trim()] : [])
  ].join('\n\n')
  const dir = mkdtempSync(join(tmpdir(), 'oficina-sync-'))
  const bodyFile = join(dir, 'body.md')
  try {
    writeFileSync(bodyFile, `${body}\n`)
    run('git', ['push', '--set-upstream', 'origin', branch])
    const existing = JSON.parse(
      capture('gh', [
        'pr',
        'list',
        '--repo',
        forkSlug,
        '--head',
        branch,
        '--state',
        'open',
        '--json',
        'url'
      ])
    )
    if (existing.length > 0) {
      run('gh', ['pr', 'edit', existing[0].url, '--repo', forkSlug, '--body-file', bodyFile])
      return existing[0].url
    }
    return capture('gh', [
      'pr',
      'create',
      '--repo',
      forkSlug,
      '--base',
      BASE,
      '--head',
      branch,
      '--title',
      `chore(sync): merge Orca ${tag}`,
      '--body-file',
      bodyFile
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function mergePullRequest({ tag, branch }, prUrl, forkSlug) {
  const trailer = optionValue('commit-trailer')
  const number = /\/pull\/(\d+)/.exec(prUrl)[1]
  // Why --merge and no --delete-branch: a merge commit keeps upstream history, and gh's own branch
  // cleanup tries to check out `oficina`, which another worktree holds.
  run('gh', [
    'pr',
    'merge',
    number,
    '--repo',
    forkSlug,
    '--merge',
    '--subject',
    `chore(sync): merge Orca ${tag} (#${number})`,
    ...(trailer ? ['--body', trailer] : [])
  ])
  run('git', ['push', 'origin', '--delete', branch])
  const merged = JSON.parse(
    capture('gh', ['pr', 'view', number, '--repo', forkSlug, '--json', 'state,mergeCommit'])
  )
  if (merged.state !== 'MERGED') {
    throw new Error(`PR #${number} is ${merged.state}, not MERGED.`)
  }
  console.log(`[oficina-sync] PR #${number} merged as ${merged.mergeCommit.oid}`)
}

function installBuild({ merged }) {
  if (merged) {
    // Why rebuild: the merge commit GitHub made is the new tip of `oficina`; the build id must name that commit.
    run('git', ['fetch', 'origin', BASE])
    run('git', ['switch', '--detach', `origin/${BASE}`])
    run(process.execPath, ['config/scripts/oficina-local.mjs', 'build'])
  }
  run(process.execPath, ['config/scripts/oficina-local.mjs', 'install', '--replace'])
}

function main() {
  assertReady()
  if (flags.has('--gates-only')) {
    const results = runSteps(buildSteps({ lintBase: BASE, ...testSelections() }))
    printSummary({ heading: `gates on ${currentBranch() || 'a detached HEAD'}`, results })
    process.exitCode = results.every((r) => r.ok) ? 0 : 1
    return
  }
  const forkSlug = slugOf('origin')
  const sync = resolveSyncTag()
  if (!sync.tag) {
    console.log(
      `[oficina-sync] nothing new: ${BASE} already has ${sync.lastMerged}, the newest stable Orca release.`
    )
    return
  }
  const branch = `sync/${sync.tag}`
  if (!sync.resumed) {
    createMergedBranch(sync)
  }
  console.log(`[oficina-sync] ${sync.lastMerged} -> ${sync.tag} on ${branch}`)
  const results = runSteps(buildSteps({ lintBase: sync.tag, ...testSelections() }))
  const context = { ...sync, branch, results }
  const heading = `${sync.lastMerged} -> ${sync.tag} on ${branch}`
  if (results.some((r) => !r.ok)) {
    printSummary({ heading, results })
    console.error('\n[oficina-sync] a gate failed; nothing was pushed or installed.')
    process.exit(1)
  }
  let prUrl = null
  if (flags.has('--push')) {
    prUrl = openPullRequest(context, forkSlug)
    if (flags.has('--merge')) {
      mergePullRequest(context, prUrl, forkSlug)
    }
  }
  if (flags.has('--install')) {
    installBuild({ merged: flags.has('--merge') })
  }
  printSummary({ heading, results, prUrl })
  if (flags.has('--merge')) {
    console.log(
      `\nNext: in the checkout that holds ${BASE}, run: git fetch origin && git merge --ff-only origin/${BASE}`
    )
  }
}

try {
  main()
} catch (error) {
  console.error(`[oficina-sync] ${error.message ?? error}`)
  process.exit(1)
}
