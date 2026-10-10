import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

// Why: the shared test profile swaps this module for upstream Orca values; this file checks the real ones.
vi.unmock('../../shared/oficina-identity')

const require = createRequire(import.meta.url)

describe('OFICINA_IDENTITY', () => {
  it('never reuses a global name the official Orca owns', async () => {
    const { OFICINA_IDENTITY: identity } = await import('../../shared/oficina-identity')

    expect(identity.appId).toBe('com.vitorf91.oficina')
    // Why: a packaged run takes its userData folder from package.json productName, which the
    // builder config sets from productName, so the folder name must equal it.
    expect(identity.userDataDirName).toBe(identity.productName)
    expect(identity.appId).not.toBe('com.stablyai.orca')
    // Why lowercased: macOS volumes are case-insensitive, so `Orca` and `orca` are one folder.
    expect(identity.userDataDirName.toLowerCase()).not.toBe('orca')
    expect(identity.devUserDataDirName.toLowerCase()).not.toBe('orca-dev')
    expect(identity.homeDirName).not.toBe('.orca')
    expect(identity.urlScheme).not.toBe('orca')
    expect(identity.cliCommandName).not.toBe('orca')
    expect([6768, 6769]).not.toContain(identity.mobileWsPort)
    expect([6768, 6769]).not.toContain(identity.devMobileWsPort)
    expect(identity.mobileWsPort).not.toBe(identity.devMobileWsPort)
  })

  it('keeps the fork off the update feed and off user-wide agent configs', async () => {
    const { OFICINA_IDENTITY: identity } = await import('../../shared/oficina-identity')

    expect(identity.autoUpdateEnabled).toBe(false)
    expect(identity.agentStatusHooksEnabled).toBe(false)
  })

  it('matches the CJS mirror electron-builder reads', async () => {
    const { OFICINA_IDENTITY: identity } = await import('../../shared/oficina-identity')
    const mirror = require('../../../config/oficina-identity.cjs')

    expect(mirror).toMatchObject({
      productName: identity.productName,
      appId: identity.appId,
      userDataDirName: identity.userDataDirName,
      urlScheme: identity.urlScheme
    })
  })
})
