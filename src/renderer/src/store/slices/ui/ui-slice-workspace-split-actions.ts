// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import type { UISliceSet } from './ui-slice-contract'
import type { UISliceWorkspaceSplit } from './ui-slice-contract-workspace-split'
import {
  placeWorkspaceAtEdge,
  removeWorkspaceFromSplit,
  setWorkspaceSplitRatio,
  type WorkspaceSplitGroup
} from '@/lib/workspace-split-layout'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { readWorkspaceSplitGroups, writeWorkspaceSplitGroups } from '@/lib/workspace-split-storage'

export function createUiWorkspaceSplitActions(set: UISliceSet): UISliceWorkspaceSplit {
  // Every write persists the arrangement so it survives an app restart.
  const commit = (update: (groups: WorkspaceSplitGroup[]) => WorkspaceSplitGroup[]): void => {
    set((state) => {
      const workspaceSplitGroups = update(state.workspaceSplitGroups)
      writeWorkspaceSplitGroups(workspaceSplitGroups)
      return { workspaceSplitGroups }
    })
  }
  return {
    workspaceSplitGroups: readWorkspaceSplitGroups(),
    placeWorkspaceAtEdge: (source, target, edge, wholeWindow = false) =>
      commit((groups) =>
        placeWorkspaceAtEdge(groups, source, target, edge, createBrowserUuid(), wholeWindow)
      ),
    unsplitWorkspace: (workspaceId) =>
      commit((groups) => removeWorkspaceFromSplit(groups, workspaceId)),
    setWorkspaceSplitRatio: (groupId, path, ratio) =>
      commit((groups) => setWorkspaceSplitRatio(groups, groupId, path, ratio))
  }
}
