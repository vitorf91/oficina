import { describe, expect, it, vi } from 'vitest'

// Why: the shared test profile swaps the identity module for upstream Orca values; this test pins the fork's.
vi.unmock('../../shared/oficina-identity')

import { CodexHookService } from './codex-hook-service-implementation'

describe('Oficina Codex launch prep', () => {
  it('never refreshes, promotes or cleans user-wide Codex hooks when agent status hooks are off', async () => {
    const service = new CodexHookService()
    const forRuntimeHome = vi.spyOn(service, 'refreshRuntimeUserHooksForRuntimeHome')
    const forLaunchPrep = vi.spyOn(service, 'refreshRuntimeUserHooksForLaunchPrep')

    for (const runtimeHomePath of ['/tmp/oficina-managed-codex-home', null]) {
      const status = await service.prepareRuntimeHomeForLaunch(
        runtimeHomePath,
        undefined,
        () => false,
        true
      )
      expect(status).toMatchObject({
        agent: 'codex',
        state: 'skipped',
        skipReason: 'hooks_disabled'
      })
    }
    expect(forRuntimeHome).not.toHaveBeenCalled()
    expect(forLaunchPrep).not.toHaveBeenCalled()
  })
})
