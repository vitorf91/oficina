// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { getWorktreeMapFromState } from '@/store/selectors'
import type { AppState } from '@/store/types'

/** Whether the id names a workspace the renderer currently knows (a worktree or a folder). */
export function isLiveWorkspace(
  state: Pick<AppState, 'worktreesByRepo' | 'folderWorkspaces'>,
  workspaceId: string
): boolean {
  return (
    getWorktreeMapFromState(state).has(workspaceId) ||
    state.folderWorkspaces.some((folder) => folderWorkspaceKey(folder.id) === workspaceId)
  )
}
