import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Why: the shared test profile swaps the identity module for upstream Orca values; these tests
// pin what the fork actually does with its own.
vi.unmock('../../shared/oficina-identity')

const electronMock = vi.hoisted(() => {
  const paths = new Map<string, string>([['appData', '/tmp/app-data']])
  return {
    paths,
    app: {
      getPath: (name: string) => paths.get(name) ?? '',
      setPath: (name: string, value: string) => {
        paths.set(name, value)
      },
      isPackaged: true,
      getAppPath: () => '/tmp/oficina-app',
      commandLine: { appendSwitch: () => undefined, getSwitchValue: () => '' }
    }
  }
})

vi.mock('electron', () => ({ app: electronMock.app, safeStorage: {}, shell: {} }))

describe('Oficina identity wiring', () => {
  it('keeps its dev run out of the official Orca dev profile', async () => {
    const { configureDevUserDataPath } = await import('./configure-process')
    const previous = process.env.ORCA_DEV_USER_DATA_PATH
    delete process.env.ORCA_DEV_USER_DATA_PATH
    try {
      configureDevUserDataPath(true)
    } finally {
      if (previous !== undefined) {
        process.env.ORCA_DEV_USER_DATA_PATH = previous
      }
    }

    expect(electronMock.paths.get('userData')).toBe(join('/tmp/app-data', 'oficina-dev'))
  })

  it('never installs managed agent hooks at startup', async () => {
    const { shouldInstallManagedHooks } = await import('./configure-process')

    expect(shouldInstallManagedHooks(false)).toBe(false)
  })

  it('treats agent status hooks as off even when a profile asks for them', async () => {
    const { isAgentStatusHooksEnabled, isAgentStatusHooksEnabledForAgent } =
      await import('../../shared/agent-status-hooks-setting')

    expect(isAgentStatusHooksEnabled({ agentStatusHooksEnabled: true })).toBe(false)
    expect(isAgentStatusHooksEnabledForAgent({ agentStatusHooksEnabled: true }, 'claude')).toBe(
      false
    )
  })

  it('still receives agent status, because the scripts the official Orca installed only need a listener', async () => {
    const { isAgentStatusReceiverEnabled } = await import('../../shared/agent-status-hooks-setting')

    expect(isAgentStatusReceiverEnabled({ agentStatusHooksEnabled: true })).toBe(true)
    expect(isAgentStatusReceiverEnabled({})).toBe(true)
    // Why: the Settings switch stays the user's way to turn status off.
    expect(isAgentStatusReceiverEnabled({ agentStatusHooksEnabled: false })).toBe(false)
  })

  it('resolves no Computer Use helper, so its TCC reset and process kill cannot reach Orca', async () => {
    const { resolveMacOSComputerUseAppPath, resolveMacOSComputerUseExecutablePath } =
      await import('../computer/macos-native-provider-paths')
    const { resetComputerUsePermissions } =
      await import('../computer/macos-computer-use-permissions')
    // Why: an existing folder stands for an official Orca helper bundle reached through the override variable.
    vi.stubEnv('ORCA_COMPUTER_MACOS_HELPER_APP_PATH', tmpdir())
    try {
      expect(resolveMacOSComputerUseAppPath()).toBeNull()
      expect(resolveMacOSComputerUseExecutablePath()).toBeNull()
      if (process.platform === 'darwin') {
        await expect(resetComputerUsePermissions()).rejects.toThrow('was not found')
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('leaves worktree trash alone, because the official Orca may still restore what is in it', async () => {
    const { sweepStaleWorktreeTrash } = await import('../worktree-trash')
    const workspace = mkdtempSync(join(tmpdir(), 'oficina-trash-'))
    const entry = join(workspace, '.orca-worktree-trash', 'wt-1700000000000-abcdef12')
    try {
      mkdirSync(entry, { recursive: true })
      writeFileSync(join(entry, 'unsaved.txt'), 'work in progress')

      await expect(sweepStaleWorktreeTrash([workspace])).resolves.toEqual({ removed: 0 })
      expect(existsSync(join(entry, 'unsaved.txt'))).toBe(true)
    } finally {
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  it('makes install and remove no-ops so no user-wide agent file is written', async () => {
    const { installManagedAgentHooks, removeManagedAgentHooks, removeManagedAgentHooksAsync } =
      await import('../agent-hooks/managed-agent-hook-controls')

    await expect(installManagedAgentHooks({ agentStatusHooksEnabled: true })).resolves.toEqual([])
    await expect(removeManagedAgentHooks()).resolves.toEqual([])
    await expect(removeManagedAgentHooksAsync({ agents: ['grok'] })).resolves.toEqual([])
  })

  it('registers its own CLI command and never the orca symlink', async () => {
    const { DEFAULT_MAC_COMMAND_PATH } = await import('../cli/cli-install-constants')

    expect(DEFAULT_MAC_COMMAND_PATH).toBe('/usr/local/bin/oficina')
  })

  it('keeps credentials and keybindings out of ~/.orca', async () => {
    const { getUserKeybindingsPath } = await import('../keybindings/keybinding-file')

    expect(getUserKeybindingsPath(homedir())).toBe(join(homedir(), '.oficina', 'keybindings.json'))
  })

  it('listens for mobile pairing on its own port', async () => {
    const { DEFAULT_WS_PORT } = await import('../runtime/runtime-rpc/runtime-rpc-pairing-types')

    expect(DEFAULT_WS_PORT).toBe(6778)
  })

  it('never polls stablyai/orca release assets for agent state rules', async () => {
    const { AgentStateRulesLiveUpdater } =
      await import('../runtime/agent-state-rules/agent-state-rules-live-update')
    const fetch = vi.fn()
    const updater = new AgentStateRulesLiveUpdater({
      userDataPath: '/tmp/oficina-rules-test',
      appVersion: '1.4.223',
      isPackaged: true,
      fetch,
      readSettings: () => ({ agentStateRulesPath: undefined, agentStateRulesLiveUpdates: true }),
      onActivated: () => undefined
    })

    await updater.start()
    updater.stop()

    expect(fetch).not.toHaveBeenCalled()
  })
})
