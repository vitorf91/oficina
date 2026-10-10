import { describe, expect, it, vi } from 'vitest'
import { withProductName } from './oficina-product-name'

// Why: the shared test profile swaps the identity module for upstream Orca values; this file checks the fork's.
vi.unmock('./oficina-identity')

describe('withProductName', () => {
  it('renames the app in its own labels', () => {
    expect(withProductName('Open Orca')).toBe('Open Oficina')
    expect(withProductName('Getting Started with Orca')).toBe('Getting Started with Oficina')
    expect(withProductName('Orca Agent Dashboard')).toBe('Oficina Agent Dashboard')
  })

  it('leaves the phone app alone', () => {
    expect(withProductName('Show Orca Mobile Button')).toBe('Show Orca Mobile Button')
    expect(withProductName('Orca Mobile')).toBe('Orca Mobile')
  })

  it('does not touch words that merely contain the name', () => {
    expect(withProductName('Orcas and orca-dev')).toBe('Orcas and orca-dev')
  })
})
