// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { createContext, useContext } from 'react'

export type WorkspacePaneState = {
  /** This pane's workspace owns keyboard focus; only one visible pane does. */
  focused: boolean
  /** A pane header above the tab strips already clears the window controls. */
  headerOwnsWindowChrome: boolean
}

// Defaults describe a lone workspace, so hosts that never mount a split keep stock behavior.
const STANDALONE_WORKSPACE_PANE: WorkspacePaneState = {
  focused: true,
  headerOwnsWindowChrome: false
}

export const WorkspacePaneContext = createContext<WorkspacePaneState>(STANDALONE_WORKSPACE_PANE)

export function useWorkspacePane(): WorkspacePaneState {
  return useContext(WorkspacePaneContext)
}
