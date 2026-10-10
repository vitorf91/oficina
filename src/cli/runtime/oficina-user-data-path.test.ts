import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultUserDataPath } from './metadata'

// Why: the shared test profile swaps the identity module for upstream Orca values; this pins the fork's.
vi.unmock('../../shared/oficina-identity')

describe('CLI default userData folder', () => {
  const previous = process.env.ORCA_USER_DATA_PATH

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.ORCA_USER_DATA_PATH
    } else {
      process.env.ORCA_USER_DATA_PATH = previous
    }
  })

  it('resolves to Oficina, never the official Orca runtime, when no env points elsewhere', () => {
    delete process.env.ORCA_USER_DATA_PATH

    expect(getDefaultUserDataPath('darwin', '/Users/me')).toBe(
      '/Users/me/Library/Application Support/Oficina'
    )
  })
})
