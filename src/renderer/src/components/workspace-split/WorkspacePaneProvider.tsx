// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useMemo } from 'react'
import { WorkspacePaneContext } from './workspace-pane-context'

export function WorkspacePaneProvider({
  focused,
  headerOwnsWindowChrome,
  children
}: {
  focused: boolean
  headerOwnsWindowChrome: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const value = useMemo(
    () => ({ focused, headerOwnsWindowChrome }),
    [focused, headerOwnsWindowChrome]
  )
  return <WorkspacePaneContext.Provider value={value}>{children}</WorkspacePaneContext.Provider>
}
