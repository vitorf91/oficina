// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import type { AppState } from '@/store/types'
import { isLiveWorkspace } from './live-workspace'
import { findWorkspaceSplitPartner } from './workspace-split-layout'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'

/** Called only after a user close has succeeded, including host-owned terminal closes. */
export function collapseEmptyWorkspaceSplit(state: AppState, worktreeId: string): boolean {
  const partner = findWorkspaceSplitPartner(state.workspaceSplitGroups, worktreeId, (id) =>
    isLiveWorkspace(state, id)
  )
  if (
    !partner ||
    (state.unifiedTabsByWorktree[worktreeId] ?? []).length > 0 ||
    (state.tabsByWorktree[worktreeId] ?? []).length > 0 ||
    (state.browserTabsByWorktree[worktreeId] ?? []).length > 0
  ) {
    return false
  }
  state.unsplitWorkspace(worktreeId)
  if (state.activeWorktreeId === worktreeId || state.activeWorktreeId === null) {
    const scope = parseWorkspaceKey(partner)
    if (scope?.type === 'folder') {
      state.setActiveFolderWorkspace(scope.folderWorkspaceId)
    } else {
      state.setActiveWorktree(scope?.type === 'worktree' ? scope.worktreeId : partner)
    }
  }
  return true
}
