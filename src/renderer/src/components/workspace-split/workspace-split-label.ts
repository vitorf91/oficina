// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { resolveWorktreeDisplayName } from '@/lib/worktree-default-display-name'
import { getRepoMapFromState, getWorktreeMapFromState } from '@/store/selectors'
import type { AppState } from '@/store/types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

type WorkspaceLabelState = Pick<AppState, 'worktreesByRepo' | 'repos' | 'folderWorkspaces'>

export type WorkspaceLabel = { name: string; project: string }

/** Display name and owning project of a worktree or folder workspace, '' when unknown. */
export function resolveWorkspaceLabelParts(
  state: WorkspaceLabelState,
  workspaceId: string
): WorkspaceLabel {
  const worktree = getWorktreeMapFromState(state).get(workspaceId)
  if (worktree) {
    return {
      name: resolveWorktreeDisplayName(worktree),
      project: getRepoMapFromState(state).get(worktree.repoId)?.displayName ?? ''
    }
  }
  const folder = state.folderWorkspaces.find((item) => folderWorkspaceKey(item.id) === workspaceId)
  return { name: folder?.name ?? '', project: '' }
}
