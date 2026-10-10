// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import { useAppStore } from '@/store'

/** Pane for a workspace that joined a split before it had any tab. */
export function WorkspacePaneEmpty({
  worktreeId,
  worktreePath
}: {
  worktreeId: string
  worktreePath: string
}): React.JSX.Element {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
      data-workspace-empty-pane={worktreeId}
    >
      <span>{basename(worktreePath) || worktreePath}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => useAppStore.getState().createTab(worktreeId)}
      >
        {translate('workspaceSplit.newTerminal', 'New terminal')}
      </Button>
    </div>
  )
}
