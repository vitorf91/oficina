// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import type {
  WorkspaceLayoutPath,
  WorkspaceSplitEdge,
  WorkspaceSplitGroup
} from '@/lib/workspace-split-layout'

/** Workspaces shown side by side: complete workspace surfaces arranged in a resizable tree. */
export type UISliceWorkspaceSplit = {
  workspaceSplitGroups: WorkspaceSplitGroup[]
  placeWorkspaceAtEdge: (
    source: string,
    target: string,
    edge: WorkspaceSplitEdge,
    wholeWindow?: boolean
  ) => void
  unsplitWorkspace: (workspaceId: string) => void
  setWorkspaceSplitRatio: (groupId: string, path: WorkspaceLayoutPath, ratio: number) => void
}
