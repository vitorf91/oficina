import { homedir } from 'node:os'
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
})
