// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store'
import { makeOpenFile } from '../../store/slices/store-test-helpers'
import { captureWorkspaceEmptiedReaction } from './workspace-emptied-reaction'

const LEFT = 'repo1::/tmp/left'
const RIGHT = 'repo1::/tmp/right'

const setActiveWorktree = vi.fn<(id: string | null) => boolean>()

beforeEach(() => {
  setActiveWorktree.mockReset()
  setActiveWorktree.mockImplementation((id) => {
    useAppStore.setState({ activeWorktreeId: id })
    return true
  })
  useAppStore.setState({
    workspaceSplitGroups: [],
    unifiedTabsByWorktree: {},
    tabsByWorktree: {},
    browserTabsByWorktree: {},
    activeWorktreeId: RIGHT,
    setActiveWorktree
  })
  useAppStore.getState().placeWorkspaceAtEdge(RIGHT, LEFT, 'bottom')
})

describe('emptying a pane of a workspace split', () => {
  it('removes the pane and selects the workspace that stays', () => {
    captureWorkspaceEmptiedReaction(RIGHT)()

    expect(useAppStore.getState().workspaceSplitGroups).toEqual([])
    expect(setActiveWorktree).toHaveBeenCalledWith(LEFT)
    expect(useAppStore.getState().activeWorktreeId).toBe(LEFT)
  })

  it('keeps the split while the pane still has a tab', () => {
    useAppStore.setState({ openFiles: [makeOpenFile({ id: 'notes.md', worktreeId: RIGHT })] })
    useAppStore.getState().createUnifiedTab(RIGHT, 'editor', { id: 'notes.md', label: 'notes.md' })

    captureWorkspaceEmptiedReaction(RIGHT)()

    expect(useAppStore.getState().workspaceSplitGroups).toHaveLength(1)
    expect(setActiveWorktree).not.toHaveBeenCalledWith(LEFT)
  })

  it('leaves a workspace that is not split to the existing empty-workspace behavior', () => {
    useAppStore.setState({ workspaceSplitGroups: [] })

    captureWorkspaceEmptiedReaction(RIGHT)()

    expect(useAppStore.getState().workspaceSplitGroups).toEqual([])
  })
})
