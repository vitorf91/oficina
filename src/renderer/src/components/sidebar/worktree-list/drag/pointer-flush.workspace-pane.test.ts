// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_PANE_DROP_TARGET_QUERY } from '../../../workspace-split/workspace-pane-pointer-drag'
import { flushWorktreePointerDragFrame, type WorktreePointerDragFrameArgs } from './pointer-flush'
import { NO_WORKTREE_SIDEBAR_DROP_TARGET } from './row-state'

vi.mock('../../workspace-kanban-sidebar-drop', () => ({
  clearWorkspaceKanbanSidebarDropTargetVisual: vi.fn(),
  hasWorkspaceKanbanSidebarDropBoard: () => false,
  isWorkspaceKanbanSidebarDropPointInBoard: () => false,
  updateWorkspaceKanbanSidebarDropTargetVisual: () => ({ status: null, isPinDrop: false })
}))

afterEach(() => {
  vi.restoreAllMocks()
})

function frameArgs(): WorktreePointerDragFrameArgs {
  return {
    drag: {
      pointerId: 1,
      sourceRow: document.createElement('div'),
      startX: 100,
      startY: 400,
      currentX: 100,
      currentY: 300,
      worktreeId: 'card',
      draggedIds: ['card'],
      reorderDraggedIds: ['card'],
      reorderUnitDraggedIds: ['card'],
      sourceGroupKey: 'repo',
      rects: [],
      active: true,
      preview: document.createElement('div'),
      previewOffsetX: 20,
      previewOffsetY: 20,
      workspaceBoardDragPreviewRequested: false,
      frameId: null,
      reorderIntent: null,
      latestBoardDropTarget: null,
      latestStatusDropTarget: null
    },
    ctx: {
      scrollRef: { current: null },
      workspaceStatuses: [],
      worktreeDragGroups: [],
      worktreeDragUnitGroups: [],
      refreshWorktreeDragSession: () => true,
      getEligibleLineageDropTarget: () => NO_WORKTREE_SIDEBAR_DROP_TARGET,
      computeWorktreeDrop: () => null,
      computeWorktreeStatusDrop: () => null,
      commitWorktreeLineageParentDrop: () => true,
      clearReorderedWorktreeParents: vi.fn(),
      clearWorktreeDrag: vi.fn(),
      onMoveWorktreesToStatus: vi.fn(),
      onMoveWorktreesToStatusAtIndex: vi.fn(),
      onReorderWorktrees: vi.fn(),
      onPinWorktrees: vi.fn()
    },
    workspaceBoardOpen: false,
    onWorkspaceBoardDragPreviewStart: vi.fn(),
    onWorkspaceBoardDragPreviewCommit: vi.fn(),
    shouldShowWorkspaceBoardDropIndicator: () => false,
    setDragOverStatus: vi.fn(),
    setPinDragOver: vi.fn(),
    setWorktreeDragState: vi.fn()
  }
}

describe('board preview at the start of a card drag', () => {
  it('opens when no workspace pane is on screen to take the drop', () => {
    const args = frameArgs()
    flushWorktreePointerDragFrame(args)
    flushWorktreePointerDragFrame(args)
    expect(args.onWorkspaceBoardDragPreviewStart).toHaveBeenCalledOnce()
    expect(args.drag.workspaceBoardDragPreviewRequested).toBe(true)
  })

  it('stays closed while a workspace pane can take the drop, since it would cover the pane', () => {
    const answer = (event: Event): void => event.preventDefault()
    document.addEventListener(WORKSPACE_PANE_DROP_TARGET_QUERY, answer)
    try {
      const args = frameArgs()
      flushWorktreePointerDragFrame(args)
      expect(args.onWorkspaceBoardDragPreviewStart).not.toHaveBeenCalled()
      expect(args.drag.workspaceBoardDragPreviewRequested).toBe(false)
    } finally {
      document.removeEventListener(WORKSPACE_PANE_DROP_TARGET_QUERY, answer)
    }
  })
})
