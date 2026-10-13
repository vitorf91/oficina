import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TUI_AGENT_CONFIG } from '../../shared/tui-agent-config'

// Why: the shared test profile swaps the identity module for upstream Orca values; these tests pin the fork's.
vi.unmock('../../shared/oficina-identity')

const registry = vi.hoisted(() => ({
  install: vi.fn(),
  remove: vi.fn(),
  removeAsync: vi.fn(),
  refresh: vi.fn()
}))

vi.mock('./local-agent-cli-presence', () => ({
  detectLocalManagedAgentCliPresence: vi.fn(async () => ({}))
}))
vi.mock('../claude/claude-hook-event-versions', () => ({ probeClaudeCliVersion: vi.fn() }))
vi.mock('./managed-agent-hook-registry', () => ({
  MANAGED_AGENT_HOOK_INSTALLERS: [['claude', registry.install]],
  MANAGED_AGENT_HOOK_REMOVERS: [['claude', registry.remove]],
  MANAGED_AGENT_HOOK_ASYNC_REMOVERS: [['claude', registry.removeAsync]],
  MANAGED_AGENT_HOOK_STATUS_READERS: [],
  MANAGED_AGENT_HOOK_SCRIPT_REFRESHERS: [['claude', registry.refresh]]
}))

const opencode = vi.hoisted(() => ({ refresh: vi.fn(), refresh2: vi.fn() }))
vi.mock('../opencode/hook-service', () => ({
  openCodeHookService: { refreshInstalledPlugins: opencode.refresh },
  openCode2HookService: { refreshInstalledPlugins: opencode.refresh2 }
}))

import {
  applyAgentStatusHooksEnabled,
  installManagedAgentHooks,
  removeManagedAgentHooks,
  removeManagedAgentHooksAsync,
  resolveStartupManagedHookAction,
  shouldContinueManagedHookStartup
} from './managed-agent-hook-controls'
import { selectOpenCodePluginSources } from './opencode-plugin-settings'
import { refreshInstalledOpenCodeStatusPlugins } from '../opencode/opencode-status-plugin-startup-refresh'
import { shouldInstallManagedHooks } from '../startup/configure-process'
import {
  isAgentStatusHooksEnabled,
  isAgentStatusHooksEnabledForAgent,
  isAgentStatusReceiverEnabled
} from '../../shared/agent-status-hooks-setting'
import { ClaudeProfileRouter } from '../claude-accounts/claude-profile-router'
import type { ClaudeProfileSetupJob } from '../claude-accounts/claude-profile-setup-worker'
import type { ClaudeProfileSetupReport } from '../claude-accounts/claude-profile-setup'

// Why this is the guard: every file below belongs to the official Orca. A user who switches agent status
// on must get a receiver and nothing else, whichever entry point a caller reaches the installers by.
const ON = { agentStatusHooksEnabled: true }

let home: string
let userFile: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'oficina-hook-guard-'))
  userFile = join(home, '.claude', 'settings.json')
  mkdirSync(join(home, '.claude'), { recursive: true })
  writeFileSync(userFile, '{"hooks":{}}\n')
  vi.stubEnv('HOME', home)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

describe('installer entry points under the fork identity', () => {
  it('reports every agent as having no hooks to install, whatever the saved switch says', () => {
    for (const agent of Object.keys(TUI_AGENT_CONFIG)) {
      expect(isAgentStatusHooksEnabledForAgent(ON, agent as never), agent).toBe(false)
    }
    expect(isAgentStatusHooksEnabled(ON)).toBe(false)
    expect(isAgentStatusHooksEnabled(null)).toBe(false)
    expect(shouldInstallManagedHooks(true)).toBe(false)
    expect(shouldInstallManagedHooks(false)).toBe(false)
    expect(resolveStartupManagedHookAction(ON)).toBe('skip')
    expect(shouldContinueManagedHookStartup(false, ON, 'claude')).toBe(false)
  })

  it('keeps receiving on while the switch is on, which is all the fork does with it', () => {
    expect(isAgentStatusReceiverEnabled(ON)).toBe(true)
    expect(isAgentStatusReceiverEnabled({ agentStatusHooksEnabled: false })).toBe(false)
  })

  it('install, remove and the Settings toggle touch no registry entry and no file', async () => {
    expect(await installManagedAgentHooks(ON, { userInitiated: true })).toEqual([])
    expect(await removeManagedAgentHooks()).toEqual([])
    expect(await removeManagedAgentHooksAsync({ agents: ['claude'] })).toEqual([])
    expect(await applyAgentStatusHooksEnabled(true, ON)).toEqual([])
    expect(await applyAgentStatusHooksEnabled(false, ON)).toEqual([])
    for (const entry of Object.values(registry)) {
      expect(entry).not.toHaveBeenCalled()
    }
    expect(readFileSync(userFile, 'utf8')).toBe('{"hooks":{}}\n')
  })

  it('writes no OpenCode plugin at startup and hands relays empty plugin sources', () => {
    refreshInstalledOpenCodeStatusPlugins(ON)
    expect(opencode.refresh).not.toHaveBeenCalled()
    expect(opencode.refresh2).not.toHaveBeenCalled()
    const sources = selectOpenCodePluginSources(
      { opencodePluginSource: 'plugin', opencode2PluginSource: 'plugin2' } as never,
      ON
    )
    expect(sources).toMatchObject({ opencodePluginSource: '', opencode2PluginSource: '' })
  })

  it('sets a Claude account up without hook entries', async () => {
    const root = join(home, 'router')
    mkdirSync(join(root, 'personal', '.claude'), { recursive: true })
    const jobs: ClaudeProfileSetupJob[] = []
    const router = new ClaudeProfileRouter({
      getSettings: () => ({
        claudeManagedAccounts: [
          {
            id: 'a',
            email: 'a@example.test',
            authMethod: 'subscription-oauth',
            managedAuthPath: '/unused-legacy',
            createdAt: 0,
            updatedAt: 0,
            lastAuthenticatedAt: 0
          }
        ],
        activeClaudeManagedAccountId: 'a',
        activeClaudeManagedAccountIdsByRuntime: undefined,
        agentStatusHooksEnabled: true,
        disabledTuiAgents: []
      }),
      dataRoot: join(root, 'data'),
      userHome: join(root, 'personal'),
      env: {},
      runSetup: async (job: ClaudeProfileSetupJob): Promise<ClaudeProfileSetupReport> => {
        jobs.push(job)
        return { outcome: 'prepared', warnings: [], surfaces: {} }
      }
    })
    mkdirSync(join(root, 'data', 'claude-profiles', 'a', 'home'), { recursive: true })
    router.publish()
    await vi.waitFor(() => expect(jobs).toHaveLength(1))
    expect(jobs[0].hooks).toBe(false)
  })
})
