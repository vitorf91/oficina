// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  collectWorkspaceIds,
  type WorkspaceLayoutPath,
  type WorkspaceSplitEdge
} from '@/lib/workspace-split-layout'
import type { TerminalController } from '../use-terminal-controller'
import type { WorkspacePaneRect } from './WorkspaceSplitLayoutSlots'
import { useWorkspacePaneDrop } from './use-workspace-pane-drop'
import { workspaceTouchesWindowEdge } from './workspace-window-edges'

type SplitSurfaceController = Pick<
  TerminalController,
  | 'activeView'
  | 'anyMountedWorktreeHasLayout'
  | 'mountedWorktreeIdsRef'
  | 'renderedActiveWorktreeId'
  | 'visibleWorkspaceSplitGroup'
  | 'workspaceSurfaces'
>

export type WorkspaceSurfaceSplitProps = {
  isMultiPane: boolean
  isFocused: boolean
  paneRect: WorkspacePaneRect | undefined
  hoverEdge: WorkspaceSplitEdge | null
  /** The header sits at a window corner and must clear the window controls there. */
  reserveChromeStart: boolean
  reserveChromeEnd: boolean
}

/** Everything the workbench needs to lay several complete workspaces out in one split group. */
export function useWorkspaceSplitSurfaces(controller: SplitSurfaceController) {
  const {
    activeView,
    anyMountedWorktreeHasLayout,
    mountedWorktreeIdsRef,
    renderedActiveWorktreeId,
    visibleWorkspaceSplitGroup,
    workspaceSurfaces
  } = controller
  const rootRef = useRef<HTMLDivElement>(null)
  const [paneRects, setPaneRects] = useState<Map<string, WorkspacePaneRect>>(() => new Map())
  const onRatioChange = useCallback(
    (path: WorkspaceLayoutPath, ratio: number) => {
      if (visibleWorkspaceSplitGroup) {
        useAppStore.getState().setWorkspaceSplitRatio(visibleWorkspaceSplitGroup.id, path, ratio)
      }
    },
    [visibleWorkspaceSplitGroup]
  )
  // Why: the group shows only once every member's surface is mounted, so a partner still
  // waiting to mount never leaves a hole next to the active workspace.
  const group =
    activeView === 'terminal' &&
    visibleWorkspaceSplitGroup &&
    collectWorkspaceIds(visibleWorkspaceSplitGroup.layout).every(
      (id) =>
        mountedWorktreeIdsRef.current.has(id) &&
        workspaceSurfaces.some((workspace) => workspace.id === id)
    )
      ? visibleWorkspaceSplitGroup
      : null
  const visibleIds =
    activeView !== 'terminal'
      ? []
      : group
        ? collectWorkspaceIds(group.layout)
        : renderedActiveWorktreeId
          ? [renderedActiveWorktreeId]
          : []
  const rendersRoot = anyMountedWorktreeHasLayout || group !== null
  const hover = useWorkspacePaneDrop(rootRef, visibleIds, rendersRoot)

  const surfaceProps = (workspaceId: string, isVisible: boolean): WorkspaceSurfaceSplitProps => ({
    isMultiPane: group !== null && isVisible,
    isFocused: isVisible && workspaceId === renderedActiveWorktreeId,
    paneRect: group && isVisible ? paneRects.get(workspaceId) : undefined,
    hoverEdge: hover?.id === workspaceId && !hover.wholeWindow ? hover.edge : null,
    reserveChromeStart:
      group !== null &&
      workspaceTouchesWindowEdge(group.layout, workspaceId, 'top') &&
      workspaceTouchesWindowEdge(group.layout, workspaceId, 'left'),
    reserveChromeEnd:
      group !== null &&
      workspaceTouchesWindowEdge(group.layout, workspaceId, 'top') &&
      workspaceTouchesWindowEdge(group.layout, workspaceId, 'right')
  })
  return {
    rootRef,
    group,
    visibleIds,
    rendersRoot,
    hover,
    setPaneRects,
    onRatioChange,
    surfaceProps
  }
}
