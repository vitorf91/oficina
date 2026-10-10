// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'

/**
 * Pressing inside a pane of a workspace split makes its workspace the active one, so the sidebar
 * selection and the right sidebar follow focus. Capture phase, so the press still reaches its target.
 */
export function createPanePointerActivation(workspaceId: string, enabled: boolean) {
  return () => {
    if (enabled && useAppStore.getState().activeWorktreeId !== workspaceId) {
      activateAndRevealWorkspace(workspaceId, { revealInSidebar: false })
    }
  }
}
