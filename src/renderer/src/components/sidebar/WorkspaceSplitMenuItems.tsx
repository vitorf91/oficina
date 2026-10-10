// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useMemo } from 'react'
import { Columns2 } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { findWorkspaceSplitGroup } from '@/lib/workspace-split-layout'
import { resolveWorktreeDisplayName } from '@/lib/worktree-default-display-name'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/selectors'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { unsplitWorkspaceAndFocusPartner } from '../workspace-split/unsplit-workspace'

type SplitCandidate = { id: string; name: string; project: string }

/** Context-menu entries to put a workspace next to another, or take it out of its split. */
export function WorkspaceSplitMenuItems({
  worktreeId,
  disabled
}: {
  worktreeId: string
  disabled: boolean
}): React.JSX.Element | null {
  const allWorktrees = useAllWorktrees()
  const folders = useAppStore((state) => state.folderWorkspaces)
  const repos = useAppStore((state) => state.repos)
  const groups = useAppStore((state) => state.workspaceSplitGroups)
  const placeWorkspaceAtEdge = useAppStore((state) => state.placeWorkspaceAtEdge)
  const isSplit = findWorkspaceSplitGroup(groups, worktreeId) !== null
  const candidates = useMemo(() => {
    const projectNames = new Map(repos.map((repo) => [repo.id, repo.displayName]))
    const options: SplitCandidate[] = [
      ...allWorktrees.map((worktree) => ({
        id: worktree.id,
        name: resolveWorktreeDisplayName(worktree),
        project: projectNames.get(worktree.repoId) ?? ''
      })),
      ...folders.map((folder) => ({
        id: folderWorkspaceKey(folder.id),
        name: folder.name,
        project: ''
      }))
    ]
    const seen = new Set<string>()
    return options.filter((option) => {
      if (
        option.id === worktreeId ||
        seen.has(option.id) ||
        findWorkspaceSplitGroup(groups, option.id)
      ) {
        return false
      }
      seen.add(option.id)
      return true
    })
  }, [allWorktrees, folders, groups, repos, worktreeId])

  if (isSplit) {
    return (
      <>
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() => unsplitWorkspaceAndFocusPartner(worktreeId)}
        >
          <Columns2 className="size-3.5" />
          {translate('workspaceSplit.unsplit', 'Unsplit workspace')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    )
  }
  if (candidates.length === 0) {
    return null
  }
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>
          <Columns2 className="size-3.5" />
          {translate('workspaceSplit.splitWith', 'Split with workspace')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <div className="max-h-80 overflow-y-auto worktree-sidebar-scrollbar">
            {candidates.map((candidate) => (
              <DropdownMenuItem
                key={candidate.id}
                onSelect={() => {
                  if (
                    activateAndRevealWorkspace(candidate.id, { revealInSidebar: false }) !==
                      false &&
                    activateAndRevealWorkspace(worktreeId, { revealInSidebar: false }) !== false
                  ) {
                    placeWorkspaceAtEdge(candidate.id, worktreeId, 'right')
                  }
                }}
              >
                <span className="max-w-56 truncate">{candidate.name}</span>
                {candidate.project ? (
                  <span className="max-w-32 truncate text-muted-foreground">
                    {candidate.project}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  )
}
