import { describe, expect, it } from 'vitest'
import { withProductName } from './oficina-product-name'

// No unmock here: the shared test profile runs this file under the upstream identity.
describe('withProductName under the upstream identity', () => {
  it('is the identity function, so inherited tests keep their strings', () => {
    expect(withProductName('Open Orca')).toBe('Open Orca')
    expect(withProductName('Show Orca Mobile Button')).toBe('Show Orca Mobile Button')
  })
})
