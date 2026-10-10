// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { collectWorkspaceIds, findWorkspaceSplitGroup } from '@/lib/workspace-split-layout'

/**
 * The split group the active workspace belongs to and every workspace it shows at once. A group
 * with a member that is not a live workspace yet (still loading, or removed) is not shown.
 */
export function useVisibleWorkspaceSplit(
  activeWorkspaceId: string | null,
  liveWorkspaceIds: ReadonlySet<string>
) {
  const workspaceSplitGroups = useAppStore((state) => state.workspaceSplitGroups)
  const visibleWorkspaceSplitGroup = useMemo(() => {
    const group = findWorkspaceSplitGroup(workspaceSplitGroups, activeWorkspaceId)
    return group && collectWorkspaceIds(group.layout).every((id) => liveWorkspaceIds.has(id))
      ? group
      : null
  }, [workspaceSplitGroups, activeWorkspaceId, liveWorkspaceIds])
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
