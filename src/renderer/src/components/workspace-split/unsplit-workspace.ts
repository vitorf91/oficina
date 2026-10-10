// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useAppStore } from '@/store'
import { isLiveWorkspace } from '@/lib/live-workspace'
import { findWorkspaceSplitPartner } from '@/lib/workspace-split-layout'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'

/** Removes a workspace from its split and keeps the user on the pane that stays. */
export function unsplitWorkspaceAndFocusPartner(workspaceId: string): void {
  const state = useAppStore.getState()
  const partnerId = findWorkspaceSplitPartner(state.workspaceSplitGroups, workspaceId, (id) =>
    isLiveWorkspace(state, id)
  )
  if (!partnerId) {
    return
  }
  // Activate first so the emptied pane never leaves the window without a selection. A partner
  // that can no longer be activated (deleted, unmounted folder) must not trap the group.
  activateAndRevealWorkspace(partnerId, { revealInSidebar: false })
  state.unsplitWorkspace(workspaceId)
}
