import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, 'oficina-local.mjs')
const WORKTREE_ID = 'repo-1::/work/tarsila-2.0'

let home
let target

function importOrcaData(...flags) {
  return spawnSync(process.execPath, [script, 'import-orca-data', `--target=${target}`, ...flags], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8'
  })
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'oficina-import-home-'))
  target = mkdtempSync(join(tmpdir(), 'oficina-import-target-'))
  const officialProfile = join(
    home,
    'Library',
    'Application Support',
    'orca',
    'profiles',
    'local-default'
  )
  mkdirSync(officialProfile, { recursive: true })
  writeFileSync(
    join(officialProfile, 'orca-data.json'),
    JSON.stringify({
      schemaVersion: 1,
      settings: { agentStatusHooksEnabled: true },
      repos: [{ id: 'repo-1', path: '/work/main', displayName: 'main' }],
      worktreeMeta: { [WORKTREE_ID]: { displayName: 'tarsila 2.0', workspaceStatus: 'todo' } },
      worktreeIdentityAliases: { [WORKTREE_ID]: ['wt2:local:instance-1'] },
      workspaceSession: { activeWorktreeId: WORKTREE_ID },
      automations: [{ id: 'nightly' }],
      claudeLivePtySessionIds: { pane: 'session' },
      ui: { collapsedGroups: ['repo-1'], hideSleepingWorkspaces: true }
    })
  )
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(target, { recursive: true, force: true })
})

describe('oficina-local import-orca-data', () => {
  it('carries worktree names, statuses and collapsed groups, but no sessions or automations', () => {
    const result = importOrcaData()
    expect(result.status, result.stderr).toBe(0)
    const imported = JSON.parse(readFileSync(join(target, 'orca-data.json'), 'utf8'))
    expect(imported.worktreeMeta[WORKTREE_ID]).toEqual({
      displayName: 'tarsila 2.0',
      workspaceStatus: 'todo'
    })
    expect(imported.worktreeIdentityAliases).toEqual({ [WORKTREE_ID]: ['wt2:local:instance-1'] })
    expect(imported.ui).toEqual({ collapsedGroups: ['repo-1'] })
    expect(imported.settings.agentStatusHooksEnabled).toBe(true)
    expect(imported).not.toHaveProperty('workspaceSession')
    expect(imported).not.toHaveProperty('automations')
    expect(imported).not.toHaveProperty('claudeLivePtySessionIds')
  })

  it('refuses to import over an existing profile without --replace', () => {
    mkdirSync(join(target, 'profiles', 'local-default'), { recursive: true })
    const result = importOrcaData()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('pass --replace')
    expect(existsSync(join(target, 'orca-data.json'))).toBe(false)
  })

  it('moves the existing profile aside with --replace and leaves app-wide files in place', () => {
    mkdirSync(join(target, 'profiles', 'local-default'), { recursive: true })
    writeFileSync(join(target, 'profiles', 'local-default', 'profile-state.db'), 'old profile')
    writeFileSync(join(target, 'orca-data.json'), 'old seed')
    writeFileSync(join(target, 'orca-profile-index.json'), '{}')
    mkdirSync(join(target, '.profile-state-access'))
    mkdirSync(join(target, 'Local Storage'))
    writeFileSync(join(target, 'orchestration.db'), 'app-wide')

    const result = importOrcaData('--replace')
    expect(result.status, result.stderr).toBe(0)

    const [backup] = readdirSync(join(target, 'profile-backups'))
    const backupDir = join(target, 'profile-backups', backup)
    expect(readdirSync(backupDir).sort()).toEqual(
      ['.profile-state-access', 'orca-data.json', 'orca-profile-index.json', 'profiles'].sort()
    )
    expect(
      readFileSync(join(backupDir, 'profiles', 'local-default', 'profile-state.db'), 'utf8')
    ).toBe('old profile')
    expect(existsSync(join(target, 'profiles'))).toBe(false)
    expect(existsSync(join(target, 'Local Storage'))).toBe(true)
    expect(readFileSync(join(target, 'orchestration.db'), 'utf8')).toBe('app-wide')
    expect(
      JSON.parse(readFileSync(join(target, 'orca-data.json'), 'utf8')).worktreeMeta
    ).toHaveProperty(WORKTREE_ID)
  })
})
