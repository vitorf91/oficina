import React from 'react'
import type { TabGroupLayoutNode } from '../../../shared/tab-types'
import type { ActivityTerminalPortalTarget } from './activity/activity-terminal-portal'
import {
  useBrowserGuestPaintRetention,
  useWorktreeBrowserPageIds
} from './browser-pane/host-guest/browser-guest-paint-retention'
import {
  shouldKeepHiddenWorktreeSurfacePaintable,
  shouldMountRetainedBrowserOverlay
} from './browser-pane/host-guest/browser-worktree-surface-paintability'
import TabGroupSplitLayout from './tab-group/TabGroupSplitLayout'
import { WorkspacePaneOverlayLayers } from './WorkspacePaneOverlayLayers'
import type { WorkspaceSplitEdge } from '@/lib/workspace-split-layout'
import { WorkspaceDropPreview } from './workspace-split/WorkspaceDropPreview'
import { WorkspacePaneEmpty } from './workspace-split/WorkspacePaneEmpty'
import { WorkspacePaneHeader } from './workspace-split/WorkspacePaneHeader'
import { WorkspacePaneProvider } from './workspace-split/WorkspacePaneProvider'
import { createPanePointerActivation } from './workspace-split/pane-pointer-activation'
import type { WorkspacePaneRect } from './workspace-split/WorkspaceSplitLayoutSlots'

// The surface of one workspace; inside a workspace split it is one pane of the group.
function WorktreeSplitSurfaceBody({
  worktreeId,
  worktreePath,
  layout,
  focusedGroupId,
  isVisible,
  isFocused = isVisible,
  isMultiPane = false,
  paneRect,
  hoverEdge = null,
  reserveChromeStart = false,
  reserveChromeEnd = false,
  shouldMeasureHiddenWorktree,
  shouldColdParkTerminalPanes,
  isForceParked,
  activityTerminalPortals,
  backgroundMountTabIds,
  activationDeferredMountTabIds
}: {
  worktreeId: string
  worktreePath: string
  /** Null for a workspace shown in a split before it has any tab. */
  layout: TabGroupLayoutNode | null
  focusedGroupId?: string
  isVisible: boolean
  /** Owns keyboard focus; the only visible pane of a workspace split that does. */
  isFocused?: boolean
  isMultiPane?: boolean
  /** Slot rect inside the split root; the pane stays hidden until it is measured. */
  paneRect?: WorkspacePaneRect
  hoverEdge?: WorkspaceSplitEdge | null
  reserveChromeStart?: boolean
  reserveChromeEnd?: boolean
  shouldMeasureHiddenWorktree: boolean
  shouldColdParkTerminalPanes: boolean
  isForceParked: boolean
  activityTerminalPortals: ActivityTerminalPortalTarget[]
  backgroundMountTabIds: ReadonlySet<string> | null
  activationDeferredMountTabIds: ReadonlySet<string> | null
}): React.JSX.Element {
  const browserPageIds = useWorktreeBrowserPageIds(worktreeId)
  const needsBrowserGuestPaint = useBrowserGuestPaintRetention(browserPageIds)
  const shouldKeepPaintable = shouldKeepHiddenWorktreeSurfacePaintable({
    shouldMeasureHiddenWorktree,
    needsBrowserGuestPaint
  })
  const isPaintVisible = isVisible && (!isMultiPane || paneRect !== undefined)
  const activateOnPointerDown = createPanePointerActivation(
    worktreeId,
    isPaintVisible && isMultiPane
  )

  return (
    <div
      className={
        isPaintVisible
          ? 'absolute inset-0 flex'
          : shouldKeepPaintable
            ? 'absolute inset-0 flex opacity-0 pointer-events-none'
            : 'absolute inset-0 hidden'
      }
      style={isMultiPane && paneRect ? { ...paneRect, right: 'auto', bottom: 'auto' } : undefined}
      data-workspace-surface-id={worktreeId}
      inert={!isPaintVisible}
      aria-hidden={!isPaintVisible}
      onPointerDownCapture={activateOnPointerDown}
    >
      <div className="flex flex-1 min-w-0 min-h-0 flex-col">
        {isPaintVisible && isMultiPane ? (
          <WorkspacePaneHeader
            worktreeId={worktreeId}
            isFocused={isFocused}
            reserveStart={reserveChromeStart}
            reserveEnd={reserveChromeEnd}
          />
        ) : null}
        {layout ? (
          <TabGroupSplitLayout
            layout={layout}
            worktreeId={worktreeId}
            focusedGroupId={focusedGroupId}
            isWorktreeActive={isVisible}
          />
        ) : isVisible ? (
          <WorkspacePaneEmpty worktreeId={worktreeId} worktreePath={worktreePath} />
        ) : null}
      </div>
      {hoverEdge ? <WorkspaceDropPreview edge={hoverEdge} scope="pane" /> : null}
      <WorkspacePaneOverlayLayers
        worktreeId={worktreeId}
        worktreePath={worktreePath}
        isVisible={isVisible}
        shouldMeasureHiddenWorktree={shouldMeasureHiddenWorktree}
        shouldColdParkTerminalPanes={shouldColdParkTerminalPanes}
        isForceParked={isForceParked}
        activityTerminalPortals={activityTerminalPortals}
        backgroundMountTabIds={backgroundMountTabIds}
        activationDeferredMountTabIds={activationDeferredMountTabIds}
        mountRetainedBrowserOverlay={shouldMountRetainedBrowserOverlay({
          isWorktreeVisible: isVisible,
          hasDeferredBackgroundMounts: backgroundMountTabIds !== null,
          needsBrowserGuestPaint
        })}
        mountEmulatorOverlay={isVisible || backgroundMountTabIds === null}
        ownsNativeChatToggleShortcut={isFocused}
      />
    </div>
  )
}

export const WorktreeSplitSurface = React.memo(function WorktreeSplitSurface(
  props: React.ComponentProps<typeof WorktreeSplitSurfaceBody>
): React.JSX.Element {
  return (
    <WorkspacePaneProvider
      focused={props.isFocused ?? props.isVisible}
      headerOwnsWindowChrome={props.isMultiPane ?? false}
    >
      <WorktreeSplitSurfaceBody {...props} />
    </WorkspacePaneProvider>
  )
})
