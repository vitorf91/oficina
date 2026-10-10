import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const identity = require('../oficina-identity.cjs')
const upstream = require('../electron-builder.config.cjs')
const config = require('../electron-builder.oficina.config.cjs')

describe('Oficina electron-builder config', () => {
  it('uses its own bundle id, name and URL scheme, never orca://', () => {
    expect(config.appId).toBe(identity.appId)
    expect(config.appId).not.toBe(upstream.appId)
    expect(config.productName).toBe('Oficina')
    expect(config.protocols).toEqual([{ name: 'Oficina', schemes: ['oficina'] }])
  })

  it('sets package.json productName so Electron derives the Oficina userData folder', () => {
    expect(config.extraMetadata.productName).toBe(identity.productName)
    expect(identity.userDataDirName).toBe(identity.productName)
  })

  it('has no publish block, so no app-update.yml can point at stablyai releases', () => {
    expect(config.publish).toBeNull()
  })

  it('claims no file associations and ships no shared-id computer-use helper', () => {
    expect(config.mac.fileAssociations).toEqual([])
    expect(config.mac.extraResources.map((resource) => resource.to)).not.toContain(
      'Orca Computer Use.app'
    )
  })

  it('builds an unsigned arm64 directory that the local script signs afterwards', () => {
    expect(config.mac.identity).toBeNull()
    expect(config.mac.target).toEqual([{ target: 'dir', arch: ['arm64'] }])
    expect(config.mac.hardenedRuntime).toBe(false)
    expect(config.mac.notarize).toBe(false)
  })

  it('keeps local test output and sources out of app.asar', () => {
    expect(config.files).toEqual(expect.arrayContaining(upstream.files))
    for (const excluded of ['test-results', 'playwright-report', 'tests']) {
      expect(config.files).toContain(`!${excluded}{,/**/*}`)
    }
  })

  it('leaves the upstream config module untouched', () => {
    expect(upstream.appId).toBe('com.stablyai.orca')
    expect(upstream.publish.repo).toBe('orca')
  })
})
