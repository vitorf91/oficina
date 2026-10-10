// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { describe, expect, it } from 'vitest'
import { createTestStore, makeWorktree, TEST_REPO } from '../../store/slices/store-test-helpers'
import { resolveWorkspaceLabelParts } from './workspace-split-label'

describe('resolveWorkspaceLabelParts', () => {
  const store = createTestStore()
  store.setState({
    repos: [{ ...TEST_REPO, displayName: 'billing-api', executionHostId: 'local' }],
    worktreesByRepo: {
      repo1: [
        makeWorktree({ id: 'repo1::/tmp/a', repoId: 'repo1', displayName: 'fix-rounding' }),
        makeWorktree({
          id: 'repo1::/tmp/b',
          repoId: 'repo1',
          displayName: '',
          branch: 'refs/heads/feature/login'
        })
      ]
    }
  })

  it('names a worktree and its project', () => {
    expect(resolveWorkspaceLabelParts(store.getState(), 'repo1::/tmp/a')).toEqual({
      name: 'fix-rounding',
      project: 'billing-api'
    })
  })

  it('falls back to the branch when the custom name is cleared', () => {
    expect(resolveWorkspaceLabelParts(store.getState(), 'repo1::/tmp/b').name).toBe('feature/login')
  })

  it('answers empty for a workspace that is not (or no longer) known', () => {
    expect(resolveWorkspaceLabelParts(store.getState(), 'repo1::/tmp/gone')).toEqual({
      name: '',
      project: ''
    })
  })
})
