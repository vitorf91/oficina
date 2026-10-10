// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useEffect, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  collectWorkspaceIds,
  findWorkspaceSplitGroup,
  MAX_WORKSPACE_PANES,
  type WorkspaceSplitEdge
} from '@/lib/workspace-split-layout'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  readWorkspaceDragData,
  WORKSPACE_STATUS_DRAG_TYPE
} from '../sidebar/workspace-status-drag-data'
import { workspaceDropTarget } from './workspace-drop-target'
import {
  readWorkspacePanePointerDetail,
  WORKSPACE_PANE_POINTER_CLEAR,
  WORKSPACE_PANE_POINTER_DROP,
  WORKSPACE_PANE_POINTER_MOVE
} from './workspace-pane-pointer-drag'

export type WorkspaceDropHover = { id: string; edge: WorkspaceSplitEdge; wholeWindow: boolean }

const SURFACE_SELECTOR = '[data-workspace-surface-id]'

function sameHover(a: WorkspaceDropHover | null, b: WorkspaceDropHover): boolean {
  return a?.id === b.id && a.edge === b.edge && a.wholeWindow === b.wholeWindow
}

/**
 * Turns drags of workspaces (sidebar cards, kanban cards, pane headers) over the visible pane
 * surfaces into a split placement, and reports the edge to preview while the drag is over a pane.
 */
export function useWorkspacePaneDrop(
  rootRef: RefObject<HTMLDivElement | null>,
  visibleWorkspaceIds: readonly string[],
  rendersRoot: boolean
): WorkspaceDropHover | null {
  const [hover, setHover] = useState<WorkspaceDropHover | null>(null)
  const visibleIdsKey = visibleWorkspaceIds.join('\u0000')
  // Why `rendersRoot`: the root mounts only once a layout exists, so the listeners have to
  // re-attach when it appears after the visible ids already settled.
  useEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const ids = new Set(visibleIdsKey.split('\u0000').filter(Boolean))
    const surfaceFrom = (element: Element | null): HTMLElement | null => {
      const surface = element?.closest<HTMLElement>(SURFACE_SELECTOR)
      return surface && root.contains(surface) && ids.has(surface.dataset.workspaceSurfaceId ?? '')
        ? surface
        : null
    }
    const targetAt = (surface: HTMLElement, x: number, y: number): WorkspaceDropHover | null => {
      const id = surface.dataset.workspaceSurfaceId
      return id
        ? {
            id,
            ...workspaceDropTarget(
              root.getBoundingClientRect(),
              surface.getBoundingClientRect(),
              x,
              y,
              ids.size > 1
            )
          }
        : null
    }
    const showHover = (next: WorkspaceDropHover | null): void => {
      setHover((previous) => (next && sameHover(previous, next) ? previous : next))
    }
    const place = (sourceId: string, surface: HTMLElement, x: number, y: number): void => {
      const target = targetAt(surface, x, y)
      if (!target || (sourceId === target.id && !target.wholeWindow)) {
        return
      }
      const state = useAppStore.getState()
      const existing = findWorkspaceSplitGroup(state.workspaceSplitGroups, target.id)
      if (
        existing &&
        !collectWorkspaceIds(existing.layout).includes(sourceId) &&
        collectWorkspaceIds(existing.layout).length >= MAX_WORKSPACE_PANES
      ) {
        toast.error(
          translate('workspaceSplit.paneLimit', 'A split can contain up to {{count}} workspaces', {
            count: MAX_WORKSPACE_PANES
          })
        )
        return
      }
      if (activateAndRevealWorkspace(sourceId, { revealInSidebar: false }) !== false) {
        state.placeWorkspaceAtEdge(sourceId, target.id, target.edge, target.wholeWindow)
      }
    }

    const nativeSurface = (event: DragEvent): HTMLElement | null =>
      Array.from(event.dataTransfer?.types ?? []).includes(WORKSPACE_STATUS_DRAG_TYPE) &&
      event.target instanceof Element
        ? surfaceFrom(event.target)
        : null
    const onDragOver = (event: DragEvent): void => {
      const surface = nativeSurface(event)
      if (!surface || !event.dataTransfer) {
        showHover(null)
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      showHover(targetAt(surface, event.clientX, event.clientY))
    }
    const onDrop = (event: DragEvent): void => {
      const surface = nativeSurface(event)
      showHover(null)
      if (!surface || !event.dataTransfer) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const sourceId = readWorkspaceDragData(event.dataTransfer)
      if (sourceId) {
        place(sourceId, surface, event.clientX, event.clientY)
      }
    }
    const clear = (): void => showHover(null)

    const onPointerMove = (event: Event): void => {
      const detail = readWorkspacePanePointerDetail(event)
      if (!detail) {
        return
      }
      const surface = surfaceFrom(document.elementFromPoint(detail.x, detail.y))
      const next = surface ? targetAt(surface, detail.x, detail.y) : null
      showHover(next && next.id === detail.sourceId && !next.wholeWindow ? null : next)
    }
    const onPointerDrop = (event: Event): void => {
      const detail = readWorkspacePanePointerDetail(event)
      if (!detail) {
        return
      }
      const surface = surfaceFrom(document.elementFromPoint(detail.x, detail.y))
      showHover(null)
      if (surface) {
        // Claiming the drop tells the sidebar it was not a reorder or status change.
        event.preventDefault()
        place(detail.sourceId, surface, detail.x, detail.y)
      }
    }

    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('drop', onDrop, true)
    document.addEventListener('dragend', clear, true)
    document.addEventListener(WORKSPACE_PANE_POINTER_MOVE, onPointerMove)
    document.addEventListener(WORKSPACE_PANE_POINTER_DROP, onPointerDrop)
    document.addEventListener(WORKSPACE_PANE_POINTER_CLEAR, clear)
    return () => {
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('dragend', clear, true)
      document.removeEventListener(WORKSPACE_PANE_POINTER_MOVE, onPointerMove)
      document.removeEventListener(WORKSPACE_PANE_POINTER_DROP, onPointerDrop)
      document.removeEventListener(WORKSPACE_PANE_POINTER_CLEAR, clear)
    }
  }, [rootRef, visibleIdsKey, rendersRoot])
  return hover
}
