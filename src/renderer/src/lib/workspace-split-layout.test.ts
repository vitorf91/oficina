// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { describe, expect, it } from 'vitest'
import {
  collectWorkspaceIds,
  findWorkspaceSplitGroup,
  findWorkspaceSplitPartner,
  liveWorkspaceSplitGroup,
  MAX_WORKSPACE_PANES,
  placeWorkspaceAtEdge,
  removeWorkspaceFromSplit,
  restrictWorkspaceLayout,
  setWorkspaceSplitRatio,
  storedWorkspaceLayoutPath,
  type WorkspaceSplitEdge,
  type WorkspaceSplitGroup
} from './workspace-split-layout'

function fill(count: number): WorkspaceSplitGroup[] {
  let groups = placeWorkspaceAtEdge([], 'w-1', 'w-0', 'right', 'view-1')
  for (let index = 2; index < count; index += 1) {
    groups = placeWorkspaceAtEdge(groups, `w-${index}`, 'w-0', 'bottom', 'unused')
  }
  return groups
}

describe('placeWorkspaceAtEdge', () => {
  it.each<[WorkspaceSplitEdge, 'horizontal' | 'vertical', string[]]>([
    ['left', 'horizontal', ['b', 'a']],
    ['right', 'horizontal', ['a', 'b']],
    ['top', 'vertical', ['b', 'a']],
    ['bottom', 'vertical', ['a', 'b']]
  ])('puts the dropped workspace on the %s edge of the target', (edge, direction, order) => {
    const [group] = placeWorkspaceAtEdge([], 'b', 'a', edge, 'view-1')
    expect(group.layout).toMatchObject({ type: 'split', direction, ratio: 0.5 })
    expect(collectWorkspaceIds(group.layout)).toEqual(order)
  })

  it('opens the same arrangement from either member and leaves the partner when unsplitting', () => {
    const paired = placeWorkspaceAtEdge([], 'project-b', 'project-a', 'right', 'view-1')
    expect(findWorkspaceSplitGroup(paired, 'project-a')).toBe(paired[0])
    expect(findWorkspaceSplitGroup(paired, 'project-b')).toBe(paired[0])
    expect(findWorkspaceSplitPartner(paired, 'project-b')).toBe('project-a')
    expect(removeWorkspaceFromSplit(paired, 'project-b')).toEqual([])
  })

  it('splits only the hovered leaf, nesting under it, and wraps the whole group at the window edge', () => {
    let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    groups = placeWorkspaceAtEdge(groups, 'c', 'b', 'bottom', 'unused')
    expect(groups[0].layout).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', workspaceId: 'a' },
      second: { type: 'split', direction: 'vertical' }
    })
    groups = placeWorkspaceAtEdge(groups, 'd', 'a', 'bottom', 'unused', true)
    expect(groups[0].layout).toMatchObject({
      type: 'split',
      direction: 'vertical',
      first: { type: 'split', direction: 'horizontal' },
      second: { type: 'leaf', workspaceId: 'd' }
    })
    expect(collectWorkspaceIds(groups[0].layout)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('treats dropping a member on its own window edge as wrapping the group', () => {
    const paired = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    const wrapped = placeWorkspaceAtEdge(paired, 'a', 'a', 'top', 'unused', true)
    expect(wrapped).toHaveLength(1)
    expect(collectWorkspaceIds(wrapped[0].layout).sort()).toEqual(['a', 'b'])
  })

  it('supports four workspaces, moving one to a different edge without duplicating it', () => {
    let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    groups = placeWorkspaceAtEdge(groups, 'c', 'a', 'bottom', 'unused')
    groups = placeWorkspaceAtEdge(groups, 'd', 'b', 'top', 'unused')
    expect(collectWorkspaceIds(groups[0].layout)).toEqual(['a', 'c', 'd', 'b'])
    groups = placeWorkspaceAtEdge(groups, 'b', 'c', 'left', 'unused')
    expect(collectWorkspaceIds(groups[0].layout)).toEqual(['a', 'b', 'c', 'd'])
    expect(new Set(collectWorkspaceIds(groups[0].layout)).size).toBe(4)
  })

  it('moves a workspace out of its old group into the target group', () => {
    let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    groups = placeWorkspaceAtEdge(groups, 'd', 'c', 'right', 'view-2')
    groups = placeWorkspaceAtEdge(groups, 'b', 'c', 'left', 'unused')
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('view-2')
    expect(collectWorkspaceIds(groups[0].layout).sort()).toEqual(['b', 'c', 'd'])
  })

  it('ignores a drop of a workspace on itself and empty ids', () => {
    expect(placeWorkspaceAtEdge([], 'a', 'a', 'left', 'view-1')).toEqual([])
    expect(placeWorkspaceAtEdge([], '', 'a', 'left', 'view-1')).toEqual([])
    expect(placeWorkspaceAtEdge([], 'a', '', 'left', 'view-1')).toEqual([])
  })

  it('caps a group at 16 workspaces', () => {
    const groups = fill(MAX_WORKSPACE_PANES)
    expect(collectWorkspaceIds(groups[0].layout)).toHaveLength(MAX_WORKSPACE_PANES)
    const overLimit = placeWorkspaceAtEdge(groups, 'overflow', 'w-0', 'right', 'unused')
    expect(overLimit).toEqual(groups)
    const overLimitAtWindowEdge = placeWorkspaceAtEdge(groups, 'overflow', 'w-0', 'top', 'x', true)
    expect(overLimitAtWindowEdge).toEqual(groups)
  })

  it('still lets a member of a full group move within it', () => {
    const groups = fill(MAX_WORKSPACE_PANES)
    const moved = placeWorkspaceAtEdge(groups, 'w-3', 'w-0', 'left', 'unused')
    expect(collectWorkspaceIds(moved[0].layout)).toHaveLength(MAX_WORKSPACE_PANES)
  })

  it('keeps independent arrangements when one is changed', () => {
    const first = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    const both = placeWorkspaceAtEdge(first, 'd', 'c', 'bottom', 'view-2')
    expect(both).toHaveLength(2)
    const changed = removeWorkspaceFromSplit(both, 'b')
    expect(changed).toHaveLength(1)
    expect(findWorkspaceSplitGroup(changed, 'c')?.id).toBe('view-2')
    expect(findWorkspaceSplitGroup(changed, 'd')?.id).toBe('view-2')
  })
})

describe('removeWorkspaceFromSplit', () => {
  it('keeps the rest of a larger group together and dissolves a pair', () => {
    let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    groups = placeWorkspaceAtEdge(groups, 'c', 'b', 'bottom', 'unused')
    const withoutB = removeWorkspaceFromSplit(groups, 'b')
    expect(collectWorkspaceIds(withoutB[0].layout)).toEqual(['a', 'c'])
    expect(removeWorkspaceFromSplit(withoutB, 'c')).toEqual([])
  })

  it('leaves unrelated groups and unknown ids alone', () => {
    const groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    expect(removeWorkspaceFromSplit(groups, 'missing')).toEqual(groups)
  })
})

// a | (b over (c | d)): three split nodes, so removing a member collapses a different level each time.
function nestedGroups(): WorkspaceSplitGroup[] {
  let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
  groups = placeWorkspaceAtEdge(groups, 'c', 'b', 'bottom', 'unused')
  return placeWorkspaceAtEdge(groups, 'd', 'c', 'right', 'unused')
}

const liveExcept =
  (...gone: string[]) =>
  (id: string) =>
    !gone.includes(id)

describe('restrictWorkspaceLayout', () => {
  it("gives a dropped member its sibling's space and keeps the other subtrees as they are", () => {
    const { layout } = nestedGroups()[0]
    const restricted = restrictWorkspaceLayout(layout, liveExcept('b'))
    expect(collectWorkspaceIds(restricted!)).toEqual(['a', 'c', 'd'])
    expect(restricted).toMatchObject({
      type: 'split',
      first: { type: 'leaf', workspaceId: 'a' },
      second: { type: 'split', direction: 'horizontal' }
    })
  })

  it('returns the very same layout when nothing is dropped, and null when nothing is kept', () => {
    const { layout } = nestedGroups()[0]
    expect(restrictWorkspaceLayout(layout, () => true)).toBe(layout)
    expect(restrictWorkspaceLayout(layout, () => false)).toBeNull()
  })
})

describe('liveWorkspaceSplitGroup', () => {
  it('shows only the live members of a group and leaves the stored group untouched', () => {
    const groups = nestedGroups()
    const shown = liveWorkspaceSplitGroup(groups, 'a', liveExcept('d'))
    expect(shown?.id).toBe('view-1')
    expect(collectWorkspaceIds(shown!.layout)).toEqual(['a', 'b', 'c'])
    expect(collectWorkspaceIds(groups[0].layout)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('brings a member back in its own place once it is live again', () => {
    const groups = nestedGroups()
    const whileLoading = liveWorkspaceSplitGroup(groups, 'a', liveExcept('c'))
    expect(collectWorkspaceIds(whileLoading!.layout)).toEqual(['a', 'b', 'd'])
    const loaded = liveWorkspaceSplitGroup(groups, 'a', () => true)
    expect(collectWorkspaceIds(loaded!.layout)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is the stored group itself while every member is live', () => {
    const groups = nestedGroups()
    expect(liveWorkspaceSplitGroup(groups, 'b', () => true)).toBe(groups[0])
  })

  it('shows a lone survivor on its own instead of as a split', () => {
    const groups = nestedGroups()
    expect(liveWorkspaceSplitGroup(groups, 'a', liveExcept('b', 'c', 'd'))).toBeNull()
    expect(liveWorkspaceSplitGroup(groups, 'a', (id) => id === 'a')).toBeNull()
  })

  it('answers nothing for an unknown, inactive or not-live workspace', () => {
    const groups = nestedGroups()
    expect(liveWorkspaceSplitGroup(groups, null, () => true)).toBeNull()
    expect(liveWorkspaceSplitGroup(groups, 'outsider', () => true)).toBeNull()
    expect(liveWorkspaceSplitGroup(groups, 'a', liveExcept('a'))).toBeNull()
    expect(liveWorkspaceSplitGroup(undefined, 'a', () => true)).toBeNull()
  })
})

describe('findWorkspaceSplitPartner', () => {
  it('skips partners that are not live', () => {
    const groups = nestedGroups()
    expect(findWorkspaceSplitPartner(groups, 'a')).toBe('b')
    expect(findWorkspaceSplitPartner(groups, 'a', liveExcept('b'))).toBe('c')
    expect(findWorkspaceSplitPartner(groups, 'a', liveExcept('b', 'c', 'd'))).toBeNull()
  })
})

describe('storedWorkspaceLayoutPath', () => {
  const stored = nestedGroups()[0].layout

  it('is the identity while every member is live', () => {
    expect(storedWorkspaceLayoutPath(stored, () => true, [])).toEqual([])
    expect(storedWorkspaceLayoutPath(stored, () => true, ['second', 'second'])).toEqual([
      'second',
      'second'
    ])
  })

  it('steps through a split that was collapsed by a missing member', () => {
    // Without b, the lower-right split (c | d) is the right-hand side of the shown root.
    const isLive = liveExcept('b')
    expect(storedWorkspaceLayoutPath(stored, isLive, [])).toEqual([])
    expect(storedWorkspaceLayoutPath(stored, isLive, ['second'])).toEqual(['second', 'second'])
  })

  it('maps the shown root to the stored node when whole sides are missing', () => {
    expect(storedWorkspaceLayoutPath(stored, liveExcept('a'), [])).toEqual(['second'])
    expect(storedWorkspaceLayoutPath(stored, liveExcept('a', 'b'), [])).toEqual([
      'second',
      'second'
    ])
  })

  it('makes a resize land on the node the user dragged', () => {
    const groups = nestedGroups()
    const isLive = liveExcept('b')
    const storedPath = storedWorkspaceLayoutPath(groups[0].layout, isLive, ['second'])
    const resized = setWorkspaceSplitRatio(groups, 'view-1', storedPath, 0.3)
    expect(resized[0].layout).toMatchObject({
      ratio: 0.5,
      second: { type: 'split', direction: 'vertical', ratio: 0.5, second: { ratio: 0.3 } }
    })
  })
})

describe('setWorkspaceSplitRatio', () => {
  it('clamps resizing the chosen split', () => {
    const groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    expect(setWorkspaceSplitRatio(groups, 'view-1', [], 0.99)[0].layout).toMatchObject({
      ratio: 0.85
    })
    expect(setWorkspaceSplitRatio(groups, 'view-1', [], -1)[0].layout).toMatchObject({
      ratio: 0.15
    })
  })

  it('changes only the split at the given path', () => {
    let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    groups = placeWorkspaceAtEdge(groups, 'c', 'b', 'bottom', 'unused')
    const resized = setWorkspaceSplitRatio(groups, 'view-1', ['second'], 0.3)
    expect(resized[0].layout).toMatchObject({
      ratio: 0.5,
      second: { type: 'split', direction: 'vertical', ratio: 0.3 }
    })
  })

  it('does not touch other groups or paths that point at a leaf', () => {
    const groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view-1')
    expect(setWorkspaceSplitRatio(groups, 'other', [], 0.7)).toEqual(groups)
    expect(setWorkspaceSplitRatio(groups, 'view-1', ['first'], 0.7)).toEqual(groups)
  })
})
