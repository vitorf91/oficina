// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectWorkspaceIds } from '@/lib/workspace-split-layout'
import { createTestStore } from '../store-test-helpers'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('workspace split store actions', () => {
  it('places, resizes and unsplits workspaces', () => {
    const store = createTestStore()
    store.getState().placeWorkspaceAtEdge('b', 'a', 'right')
    store.getState().placeWorkspaceAtEdge('c', 'b', 'bottom')
    const [group] = store.getState().workspaceSplitGroups
    expect(collectWorkspaceIds(group.layout)).toEqual(['a', 'b', 'c'])

    store.getState().setWorkspaceSplitRatio(group.id, ['first'], 0.5)
    store.getState().setWorkspaceSplitRatio(group.id, [], 0.25)
    expect(store.getState().workspaceSplitGroups[0].layout).toMatchObject({ ratio: 0.25 })

    store.getState().unsplitWorkspace('c')
    expect(collectWorkspaceIds(store.getState().workspaceSplitGroups[0].layout)).toEqual(['a', 'b'])
    store.getState().unsplitWorkspace('b')
    expect(store.getState().workspaceSplitGroups).toEqual([])
  })

  it('wraps the whole group when the drop is on the window edge', () => {
    const store = createTestStore()
    store.getState().placeWorkspaceAtEdge('b', 'a', 'right')
    store.getState().placeWorkspaceAtEdge('c', 'a', 'top', true)
    expect(store.getState().workspaceSplitGroups[0].layout).toMatchObject({
      direction: 'vertical',
      first: { type: 'leaf', workspaceId: 'c' }
    })
  })

  it('restores the arrangement, with its resized ratio, in a store created after a restart', () => {
    const before = createTestStore()
    before.getState().placeWorkspaceAtEdge('b', 'a', 'right')
    const [group] = before.getState().workspaceSplitGroups
    before.getState().setWorkspaceSplitRatio(group.id, [], 0.3)

    const afterRestart = createTestStore()
    expect(afterRestart.getState().workspaceSplitGroups).toEqual(
      before.getState().workspaceSplitGroups
    )
    expect(afterRestart.getState().workspaceSplitGroups[0].layout).toMatchObject({ ratio: 0.3 })
  })

  it('persists removal too, so a dissolved split does not return after a restart', () => {
    const before = createTestStore()
    before.getState().placeWorkspaceAtEdge('b', 'a', 'right')
    before.getState().unsplitWorkspace('b')
    expect(createTestStore().getState().workspaceSplitGroups).toEqual([])
  })
})
