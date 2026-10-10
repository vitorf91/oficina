// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { describe, expect, it, vi } from 'vitest'
import { createTestStore, makeTab } from '../store/slices/store-test-helpers'
import { collapseEmptyWorkspaceSplit } from './collapse-empty-workspace-split'
import { placeWorkspaceAtEdge } from './workspace-split-layout'

const LEFT = 'repo1::/tmp/left'
const RIGHT = 'repo1::/tmp/right'

function splitStore(partner = LEFT) {
  const store = createTestStore()
  const setActiveWorktree = vi.fn(() => true)
  const setActiveFolderWorkspace = vi.fn(() => true)
  store.setState({
    workspaceSplitGroups: placeWorkspaceAtEdge([], RIGHT, partner, 'right', 'view-1'),
    activeWorktreeId: RIGHT,
    setActiveWorktree,
    setActiveFolderWorkspace
  })
  return { store, setActiveWorktree, setActiveFolderWorkspace }
}

describe('collapseEmptyWorkspaceSplit', () => {
  it('removes an empty pane and moves focus to the workspace that stays', () => {
    const { store, setActiveWorktree } = splitStore()
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(true)
    expect(store.getState().workspaceSplitGroups).toEqual([])
    expect(setActiveWorktree).toHaveBeenCalledWith(LEFT)
  })

  it('keeps focus where it is when the emptied pane was not the active one', () => {
    const { store, setActiveWorktree } = splitStore()
    store.setState({ activeWorktreeId: LEFT })
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(true)
    expect(setActiveWorktree).not.toHaveBeenCalled()
  })

  it('keeps the pane while it still has a terminal tab', () => {
    const { store, setActiveWorktree } = splitStore()
    store.setState({ tabsByWorktree: { [RIGHT]: [makeTab({ id: 't1', worktreeId: RIGHT })] } })
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(false)
    expect(store.getState().workspaceSplitGroups).toHaveLength(1)
    expect(setActiveWorktree).not.toHaveBeenCalled()
  })

  it('does nothing for a workspace that is not in a split', () => {
    const { store } = splitStore()
    store.setState({ workspaceSplitGroups: [] })
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(false)
  })

  it('activates a folder workspace partner through the folder path', () => {
    const { store, setActiveWorktree, setActiveFolderWorkspace } = splitStore('folder:folder-1')
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(true)
    expect(setActiveFolderWorkspace).toHaveBeenCalledWith('folder-1')
    expect(setActiveWorktree).not.toHaveBeenCalled()
  })
})
