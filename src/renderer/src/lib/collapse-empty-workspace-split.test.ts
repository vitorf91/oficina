// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { describe, expect, it, vi } from 'vitest'
import { createTestStore, makeTab, makeWorktree } from '../store/slices/store-test-helpers'
import { collapseEmptyWorkspaceSplit } from './collapse-empty-workspace-split'
import type { AppState } from '@/store/types'
import { placeWorkspaceAtEdge } from './workspace-split-layout'

const LEFT = 'repo1::/tmp/left'
const RIGHT = 'repo1::/tmp/right'

function splitStore(partner = LEFT) {
  const store = createTestStore()
  const setActiveWorktree = vi.fn(() => true)
  const setActiveFolderWorkspace = vi.fn(() => true)
  store.setState({
    worktreesByRepo: {
      repo1: [
        makeWorktree({ id: LEFT, repoId: 'repo1', path: '/tmp/left' }),
        makeWorktree({ id: RIGHT, repoId: 'repo1', path: '/tmp/right' })
      ]
    },
    folderWorkspaces: [
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only the id is read to tell the folder is live.
      { id: 'folder-1' } as AppState['folderWorkspaces'][number]
    ],
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

  it('hands focus to a partner that is live, not to one that was deleted outside the app', () => {
    const { store, setActiveWorktree } = splitStore('repo1::/tmp/gone')
    store.setState({
      workspaceSplitGroups: placeWorkspaceAtEdge(
        store.getState().workspaceSplitGroups,
        LEFT,
        RIGHT,
        'left',
        'unused'
      )
    })
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(true)
    expect(setActiveWorktree).toHaveBeenCalledWith(LEFT)
  })

  it('leaves a lone survivor of a group alone: there is no visible split to collapse', () => {
    const { store, setActiveWorktree } = splitStore('repo1::/tmp/gone')
    expect(collapseEmptyWorkspaceSplit(store.getState(), RIGHT)).toBe(false)
    expect(store.getState().workspaceSplitGroups).toHaveLength(1)
    expect(setActiveWorktree).not.toHaveBeenCalled()
  })
})
