// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { resolveWorktreeDisplayName } from '@/lib/worktree-default-display-name'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import type { AppState } from '@/store/types'

type WorkspaceLabelState = Pick<AppState, 'worktreesByRepo' | 'repos' | 'folderWorkspaces'>

export type WorkspaceLabel = { name: string; project: string }

/** Display name and owning project of a worktree or folder workspace, '' when unknown. */
export function resolveWorkspaceLabelParts(
  state: WorkspaceLabelState,
  workspaceId: string
): WorkspaceLabel {
  const folder = state.folderWorkspaces.find((item) => folderWorkspaceKey(item.id) === workspaceId)
  if (folder) {
    return { name: folder.name, project: '' }
  }
  for (const [repoId, worktrees] of Object.entries(state.worktreesByRepo)) {
    const worktree = worktrees.find((item) => item.id === workspaceId)
    if (worktree) {
      const repo = state.repos.find((item) => item.id === repoId)
      return { name: resolveWorktreeDisplayName(worktree), project: repo?.displayName ?? '' }
    }
  }
  return { name: '', project: '' }
}
