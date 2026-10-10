// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import type { WorkspaceSplitEdge } from '@/lib/workspace-split-layout'
import TabGroupDropOverlay from '../tab-group/TabGroupDropOverlay'
import type { TabDropZone } from '../tab-group/tab-drag-data'

const ZONE_BY_EDGE: Record<WorkspaceSplitEdge, Exclude<TabDropZone, 'center'>> = {
  left: 'left',
  right: 'right',
  top: 'up',
  bottom: 'down'
}

/** The tab-drag split overlay on one half of the nearest positioned ancestor. */
export function WorkspaceDropPreview({
  edge,
  scope
}: {
  edge: WorkspaceSplitEdge
  scope: 'pane' | 'window'
}): React.JSX.Element {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-50"
      data-workspace-drop-preview={edge}
      data-workspace-drop-scope={scope}
    >
      <TabGroupDropOverlay zone={ZONE_BY_EDGE[edge]} />
    </div>
  )
}
