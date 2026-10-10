// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { collectWorkspaceIds, liveWorkspaceSplitGroup } from '@/lib/workspace-split-layout'

/**
 * The split group the active workspace belongs to and every workspace it shows at once. Members
 * that are not live workspaces (still loading, or deleted outside the app) are left out of what
 * shows, never out of what is stored, so a late one reappears in its place.
 */
export function useVisibleWorkspaceSplit(
  activeWorkspaceId: string | null,
  liveWorkspaceIds: ReadonlySet<string>
) {
  const workspaceSplitGroups = useAppStore((state) => state.workspaceSplitGroups)
  const visibleWorkspaceSplitGroup = useMemo(
    () =>
      liveWorkspaceSplitGroup(workspaceSplitGroups, activeWorkspaceId, (id) =>
        liveWorkspaceIds.has(id)
      ),
    [workspaceSplitGroups, activeWorkspaceId, liveWorkspaceIds]
  )
  const visibleWorkspaceIds = useMemo(
    () =>
      visibleWorkspaceSplitGroup
        ? collectWorkspaceIds(visibleWorkspaceSplitGroup.layout)
        : activeWorkspaceId
          ? [activeWorkspaceId]
          : [],
    [visibleWorkspaceSplitGroup, activeWorkspaceId]
  )
  return { visibleWorkspaceSplitGroup, visibleWorkspaceIds }
}
