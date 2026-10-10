// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
// Slim card-toned strip over each pane of a workspace split, sibling to the 32px tab strip:
// project and workspace name on the left, ghost icon-xs X that removes the pane on the right.
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { unsplitWorkspaceAndFocusPartner } from './unsplit-workspace'
import { useWorkspaceHeaderDrag } from './use-workspace-header-drag'
import { resolveWorkspaceLabelParts } from './workspace-split-label'

export function WorkspacePaneHeader({
  worktreeId,
  isFocused,
  reserveStart,
  reserveEnd
}: {
  worktreeId: string
  isFocused: boolean
  reserveStart: boolean
  reserveEnd: boolean
}): React.JSX.Element {
  const name = useAppStore((state) => resolveWorkspaceLabelParts(state, worktreeId).name)
  const project = useAppStore((state) => resolveWorkspaceLabelParts(state, worktreeId).project)
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const dragWorkspace = useWorkspaceHeaderDrag(worktreeId)
  const removeLabel = translate('workspaceSplit.removePane', 'Remove workspace from split')
  return (
    <div
      className="flex h-6 shrink-0 items-center gap-1.5 border-b border-border bg-card pr-1 [-webkit-app-region:no-drag]"
      data-workspace-pane-header={worktreeId}
      data-focused={isFocused ? 'true' : 'false'}
      data-terminal-focus-release-surface="true"
      onPointerDownCapture={dragWorkspace}
    >
      {/* Why: Electron's drag hit-test ignores z-index, so window controls need a no-drag gutter. */}
      {reserveStart && !sidebarOpen ? (
        <div className="shrink-0" style={{ width: 'var(--collapsed-sidebar-header-width)' }} />
      ) : (
        <div className="w-1.5 shrink-0" />
      )}
      <span
        className={cn(
          'min-w-0 truncate text-xs font-medium',
          isFocused ? 'text-foreground' : 'text-muted-foreground'
        )}
        title={project ? `${project} / ${name}` : name}
      >
        {name}
      </span>
      {project ? (
        <span className="min-w-0 shrink-[2] truncate text-xs text-muted-foreground">{project}</span>
      ) : null}
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={removeLabel}
            data-workspace-unsplit-button={worktreeId}
            onClick={(event) => {
              event.stopPropagation()
              unsplitWorkspaceAndFocusPartner(worktreeId)
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{removeLabel}</TooltipContent>
      </Tooltip>
      {reserveEnd && !rightSidebarOpen ? (
        <div
          className="shrink-0"
          style={{ width: 'calc(40px + var(--window-controls-width, 0px))' }}
        />
      ) : null}
    </div>
  )
}
