// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import {
  clampWorkspaceSplitRatio,
  collectWorkspaceIds,
  MAX_WORKSPACE_PANES,
  type WorkspaceLayoutNode,
  type WorkspaceSplitGroup
} from './workspace-split-layout'

// Why renderer storage: the arrangement is a per-profile view preference, and the
// profile's renderer origin already survives an app restart.
const STORAGE_KEY = 'orca.workspaceSplitGroups.v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNode(value: unknown, seen: Set<string>, depth = 0): WorkspaceLayoutNode | null {
  if (!isRecord(value) || depth > MAX_WORKSPACE_PANES * 2) {
    return null
  }
  const { type, workspaceId } = value
  if (type === 'leaf' && typeof workspaceId === 'string' && workspaceId.length > 0) {
    if (seen.has(workspaceId) || seen.size >= MAX_WORKSPACE_PANES) {
      return null
    }
    seen.add(workspaceId)
    return { type: 'leaf', workspaceId }
  }
  if (type !== 'split') {
    return null
  }
  const first = parseNode(value.first, seen, depth + 1)
  const second = parseNode(value.second, seen, depth + 1)
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  const { direction, ratio } = value
  return {
    type: 'split',
    direction: direction === 'vertical' ? 'vertical' : 'horizontal',
    first,
    second,
    ratio:
      typeof ratio === 'number' && Number.isFinite(ratio) ? clampWorkspaceSplitRatio(ratio) : 0.5
  }
}

/** Validates untrusted stored JSON: unknown shapes, duplicate members and lone leaves are dropped. */
export function parseWorkspaceSplitGroups(stored: unknown): WorkspaceSplitGroup[] {
  if (!Array.isArray(stored)) {
    return []
  }
  const used = new Set<string>()
  return stored.flatMap((candidate: unknown) => {
    if (!isRecord(candidate)) {
      return []
    }
    const { id } = candidate
    const layout = parseNode(candidate.layout, new Set())
    if (typeof id !== 'string' || !layout) {
      return []
    }
    const ids = collectWorkspaceIds(layout)
    if (ids.length < 2 || ids.some((member) => used.has(member))) {
      return []
    }
    ids.forEach((member) => used.add(member))
    return [{ id, layout }]
  })
}

export function readWorkspaceSplitGroups(): WorkspaceSplitGroup[] {
  try {
    return parseWorkspaceSplitGroups(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function writeWorkspaceSplitGroups(groups: readonly WorkspaceSplitGroup[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
  } catch {
    // Retain the current session's arrangement when storage is unavailable.
  }
}
