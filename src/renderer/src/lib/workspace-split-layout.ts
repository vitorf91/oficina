// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
// Which itself adapted whyjp's worktree layout tree in stablyai/orca#8379: leaves are
// complete workspaces, each with its own tabs.
export type WorkspaceLayoutNode =
  | { type: 'leaf'; workspaceId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: WorkspaceLayoutNode
      second: WorkspaceLayoutNode
      ratio: number
    }

export type WorkspaceSplitGroup = { id: string; layout: WorkspaceLayoutNode }
export type WorkspaceSplitEdge = 'left' | 'right' | 'top' | 'bottom'
export type WorkspaceLayoutPath = readonly ('first' | 'second')[]
export const MAX_WORKSPACE_PANES = 16
export const MIN_WORKSPACE_SPLIT_RATIO = 0.15
export const MAX_WORKSPACE_SPLIT_RATIO = 0.85

export function clampWorkspaceSplitRatio(ratio: number): number {
  return Math.max(MIN_WORKSPACE_SPLIT_RATIO, Math.min(MAX_WORKSPACE_SPLIT_RATIO, ratio))
}

export function collectWorkspaceIds(node: WorkspaceLayoutNode): string[] {
  return node.type === 'leaf'
    ? [node.workspaceId]
    : [...collectWorkspaceIds(node.first), ...collectWorkspaceIds(node.second)]
}

export function findWorkspaceSplitGroup(
  groups: readonly WorkspaceSplitGroup[] | undefined,
  workspaceId: string | null
): WorkspaceSplitGroup | null {
  // Why the array guard: this runs during the workspace context menu's render,
  // so any caller whose store has not produced the split state yet would throw
  // inside React and take the whole menu down with it. Absent state means no
  // splits, which is exactly what a null answer says.
  if (!workspaceId || !Array.isArray(groups)) {
    return null
  }
  return groups.find((group) => collectWorkspaceIds(group.layout).includes(workspaceId)) ?? null
}

export function findWorkspaceSplitPartner(
  groups: readonly WorkspaceSplitGroup[] | undefined,
  workspaceId: string
): string | null {
  const group = findWorkspaceSplitGroup(groups, workspaceId)
  return group ? (collectWorkspaceIds(group.layout).find((id) => id !== workspaceId) ?? null) : null
}

function removeLeaf(node: WorkspaceLayoutNode, id: string): WorkspaceLayoutNode | null {
  if (node.type === 'leaf') {
    return node.workspaceId === id ? null : node
  }
  const first = removeLeaf(node.first, id)
  const second = removeLeaf(node.second, id)
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  return first === node.first && second === node.second ? node : { ...node, first, second }
}

function edgeSplit(
  existing: WorkspaceLayoutNode,
  sourceId: string,
  edge: WorkspaceSplitEdge
): WorkspaceLayoutNode {
  const source: WorkspaceLayoutNode = { type: 'leaf', workspaceId: sourceId }
  const before = edge === 'left' || edge === 'top'
  return {
    type: 'split',
    direction: edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
    first: before ? source : existing,
    second: before ? existing : source,
    ratio: 0.5
  }
}

function splitLeaf(
  node: WorkspaceLayoutNode,
  targetId: string,
  sourceId: string,
  edge: WorkspaceSplitEdge
): WorkspaceLayoutNode {
  if (node.type === 'leaf') {
    return node.workspaceId === targetId ? edgeSplit(node, sourceId, edge) : node
  }
  return {
    ...node,
    first: splitLeaf(node.first, targetId, sourceId, edge),
    second: splitLeaf(node.second, targetId, sourceId, edge)
  }
}

function withoutWorkspace(
  groups: readonly WorkspaceSplitGroup[],
  workspaceId: string
): WorkspaceSplitGroup[] {
  return groups
    .map((group) => ({ ...group, layout: removeLeaf(group.layout, workspaceId) }))
    .filter((group): group is WorkspaceSplitGroup => group.layout !== null)
    .filter((group) => collectWorkspaceIds(group.layout).length >= 2)
}

/**
 * Moves `sourceId` next to `targetId` on one edge. With `wholeWindow` the edge wraps the whole
 * target group instead of only the target leaf. A source already in another group leaves it.
 */
export function placeWorkspaceAtEdge(
  groups: readonly WorkspaceSplitGroup[],
  sourceId: string,
  targetId: string,
  edge: WorkspaceSplitEdge,
  newGroupId: string,
  wholeWindow = false
): WorkspaceSplitGroup[] {
  if (sourceId === targetId && wholeWindow) {
    targetId = findWorkspaceSplitPartner(groups, sourceId) ?? targetId
  }
  if (!sourceId || !targetId || sourceId === targetId) {
    return [...groups]
  }
  const target = findWorkspaceSplitGroup(groups, targetId)
  if (
    target &&
    !collectWorkspaceIds(target.layout).includes(sourceId) &&
    collectWorkspaceIds(target.layout).length >= MAX_WORKSPACE_PANES
  ) {
    return [...groups]
  }
  const remaining = withoutWorkspace(groups, sourceId)
  const targetAfterMove = findWorkspaceSplitGroup(remaining, targetId)
  if (targetAfterMove) {
    return remaining.map((group) =>
      group.id === targetAfterMove.id
        ? {
            ...group,
            layout: wholeWindow
              ? edgeSplit(group.layout, sourceId, edge)
              : splitLeaf(group.layout, targetId, sourceId, edge)
          }
        : group
    )
  }
  const layout = edgeSplit({ type: 'leaf', workspaceId: targetId }, sourceId, edge)
  return [...remaining, { id: newGroupId, layout }]
}

export function removeWorkspaceFromSplit(
  groups: readonly WorkspaceSplitGroup[],
  workspaceId: string
): WorkspaceSplitGroup[] {
  return withoutWorkspace(groups, workspaceId)
}

/** Drops members that are no longer live workspaces; groups left with one member dissolve. */
export function pruneWorkspaceSplitGroups(
  groups: readonly WorkspaceSplitGroup[],
  isLive: (workspaceId: string) => boolean
): WorkspaceSplitGroup[] {
  let pruned = [...groups]
  for (const group of groups) {
    for (const id of collectWorkspaceIds(group.layout)) {
      if (!isLive(id)) {
        pruned = withoutWorkspace(pruned, id)
      }
    }
  }
  return pruned
}

export function setWorkspaceSplitRatio(
  groups: readonly WorkspaceSplitGroup[],
  groupId: string,
  path: WorkspaceLayoutPath,
  ratio: number
): WorkspaceSplitGroup[] {
  const update = (node: WorkspaceLayoutNode, rest: WorkspaceLayoutPath): WorkspaceLayoutNode => {
    if (node.type !== 'split') {
      return node
    }
    if (rest.length === 0) {
      return { ...node, ratio: clampWorkspaceSplitRatio(ratio) }
    }
    const [side, ...tail] = rest
    return { ...node, [side]: update(node[side], tail) }
  }
  return groups.map((group) =>
    group.id === groupId ? { ...group, layout: update(group.layout, path) } : group
  )
}
