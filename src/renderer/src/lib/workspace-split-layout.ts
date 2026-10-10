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

/** The first other member of the group that is live, or null when the workspace stands alone. */
export function findWorkspaceSplitPartner(
  groups: readonly WorkspaceSplitGroup[] | undefined,
  workspaceId: string,
  isLive: (workspaceId: string) => boolean = () => true
): string | null {
  const group = findWorkspaceSplitGroup(groups, workspaceId)
  return group
    ? (collectWorkspaceIds(group.layout).find((id) => id !== workspaceId && isLive(id)) ?? null)
    : null
}

/**
 * The layout restricted to the members `keep` accepts; a dropped member's space goes to its
 * sibling. Null when no member is kept, and the same object when none was dropped.
 */
export function restrictWorkspaceLayout(
  node: WorkspaceLayoutNode,
  keep: (workspaceId: string) => boolean
): WorkspaceLayoutNode | null {
  if (node.type === 'leaf') {
    return keep(node.workspaceId) ? node : null
  }
  const first = restrictWorkspaceLayout(node.first, keep)
  const second = restrictWorkspaceLayout(node.second, keep)
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  return first === node.first && second === node.second ? node : { ...node, first, second }
}

/**
 * The group as it shows for `workspaceId`: only its live members, so a member that is still
 * loading or was deleted outside the app leaves the others in place instead of hiding the whole
 * group. Null when fewer than two remain, which shows the workspace on its own.
 */
export function liveWorkspaceSplitGroup(
  groups: readonly WorkspaceSplitGroup[] | undefined,
  workspaceId: string | null,
  isLive: (workspaceId: string) => boolean
): WorkspaceSplitGroup | null {
  const group = findWorkspaceSplitGroup(groups, workspaceId)
  if (!group || !workspaceId || !isLive(workspaceId)) {
    return null
  }
  const layout = restrictWorkspaceLayout(group.layout, isLive)
  if (!layout || collectWorkspaceIds(layout).length < 2) {
    return null
  }
  return layout === group.layout ? group : { ...group, layout }
}

/**
 * Translates a path in the live layout back to the stored layout, stepping through the splits
 * that were collapsed because one side has no live member.
 */
export function storedWorkspaceLayoutPath(
  stored: WorkspaceLayoutNode,
  isLive: (workspaceId: string) => boolean,
  livePath: WorkspaceLayoutPath
): WorkspaceLayoutPath {
  const hasLiveMember = (node: WorkspaceLayoutNode): boolean =>
    collectWorkspaceIds(node).some(isLive)
  const storedPath: ('first' | 'second')[] = []
  let node = stored
  let rest = livePath
  while (node.type === 'split') {
    const firstLive = hasLiveMember(node.first)
    if (firstLive && hasLiveMember(node.second)) {
      if (rest.length === 0) {
        break
      }
      storedPath.push(rest[0])
      node = node[rest[0]]
      rest = rest.slice(1)
    } else {
      const side = firstLive ? 'first' : 'second'
      storedPath.push(side)
      node = node[side]
    }
  }
  return storedPath
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
    .map((group) => ({
      ...group,
      layout: restrictWorkspaceLayout(group.layout, (id) => id !== workspaceId)
    }))
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
