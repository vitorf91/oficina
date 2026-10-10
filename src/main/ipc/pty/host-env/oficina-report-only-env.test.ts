import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPtyHostEnv } from './assembly'
import type { BuildPtyHostEnvOptions } from './types'

// Why: the shared test profile swaps the identity module for upstream Orca values; these tests pin the fork's.
vi.unmock('../../../../shared/oficina-identity')

const fixture = vi.hoisted((): { userData: string; hookEnv: Record<string, string> } => ({
  userData: '',
  hookEnv: {}
}))
vi.mock('../../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => fixture.userData, onWillQuit: vi.fn() })
}))
vi.mock('../../../agent-hooks/server', () => ({
  agentHookServer: { buildPtyEnv: () => fixture.hookEnv }
}))
vi.mock('../../../agent-hooks/wsl-hook-relay-manager', () => ({
  wslHookRelayManager: {
    ensureForDistro: vi.fn(),
    getGuestEndpointFilePath: () => null,
    getOpenCodeOverlayDir: () => null,
    getGuestAgentPath: () => null
  }
}))
vi.mock('../../../pi/titlebar-extension-service', () => ({
  piTitlebarExtensionService: { buildPtyEnv: () => ({}), buildFreshOmpEnv: () => ({}) }
}))
vi.mock('../../../cli/orca-cli-child-path', () => ({ prependOrcaCliDirToChildPath: () => {} }))
vi.mock('../../../cli/wsl-managed-cli', () => ({
  getManagedWslCliDir: () => undefined,
  getWslCliCommandName: () => 'oficina'
}))

const OFFICIAL_ORCA_ENV = {
  ORCA_AGENT_HOOK_PORT: '6768',
  ORCA_AGENT_HOOK_TOKEN: 'official-orca-token',
  ORCA_AGENT_HOOK_ENDPOINT: '/official/orca/agent-hooks/endpoint.env'
}

let root: string
let home: string
let options: BuildPtyHostEnvOptions

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'oficina-report-only-env-'))
  home = join(root, 'home')
  mkdirSync(home)
  fixture.userData = join(root, 'user-data')
  fixture.hookEnv = {}
  vi.stubEnv('HOME', home)
  vi.stubEnv('USERPROFILE', home)
  vi.stubEnv('XDG_CONFIG_HOME', join(root, 'xdg'))
  options = {
    isPackaged: true,
    userDataPath: fixture.userData,
    selectedCodexHomePath: null,
    // Why: the fork's identity keeps installers off, and that is what the spawn path passes along.
    agentStatusHooksEnabled: false
  }
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('report-only terminal environment', () => {
  it('names the fork receiver and drops the coordinates inherited from an official Orca terminal', () => {
    fixture.hookEnv = {
      ORCA_AGENT_HOOK_PORT: '6778',
      ORCA_AGENT_HOOK_TOKEN: 'oficina-token',
      ORCA_AGENT_HOOK_ENDPOINT: '/oficina/agent-hooks/endpoint.env'
    }

    const env = buildPtyHostEnv('pty-1', { ...OFFICIAL_ORCA_ENV }, options)

    expect(env).toMatchObject(fixture.hookEnv)
    expect(Object.values(env)).not.toContain('official-orca-token')
  })

  it('exports nothing when the receiver is off, so an inherited official endpoint cannot leak through', () => {
    const env = buildPtyHostEnv('pty-1', { ...OFFICIAL_ORCA_ENV }, options)

    expect(env.ORCA_AGENT_HOOK_PORT).toBeUndefined()
    expect(env.ORCA_AGENT_HOOK_TOKEN).toBeUndefined()
    expect(env.ORCA_AGENT_HOOK_ENDPOINT).toBeUndefined()
  })

  it('writes nothing under the user home while preparing a bare shell', () => {
    fixture.hookEnv = { ORCA_AGENT_HOOK_PORT: '6778' }

    buildPtyHostEnv('pty-1', {}, options)

    expect(readdirSync(home)).toEqual([])
  })
})
