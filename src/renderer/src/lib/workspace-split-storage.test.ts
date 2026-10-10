// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseWorkspaceSplitGroups,
  readWorkspaceSplitGroups,
  writeWorkspaceSplitGroups
} from './workspace-split-storage'
import {
  collectWorkspaceIds,
  MAX_WORKSPACE_PANES,
  placeWorkspaceAtEdge,
  setWorkspaceSplitRatio,
  type WorkspaceSplitGroup
} from './workspace-split-layout'

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('workspace split storage', () => {
  it('round-trips groups, including resized ratios, without treating 16 as a global limit', () => {
    let groups: WorkspaceSplitGroup[] = placeWorkspaceAtEdge([], 'a-1', 'a-0', 'right', 'view-a')
    for (let index = 2; index < MAX_WORKSPACE_PANES; index += 1) {
      groups = placeWorkspaceAtEdge(groups, `a-${index}`, 'a-0', 'bottom', 'unused')
    }
    groups = placeWorkspaceAtEdge(groups, 'b-1', 'b-0', 'right', 'view-b')
    groups = setWorkspaceSplitRatio(groups, 'view-b', [], 0.3)
    writeWorkspaceSplitGroups(groups)
    const restored = readWorkspaceSplitGroups()
    expect(restored).toEqual(groups)
    expect(restored.flatMap((group) => collectWorkspaceIds(group.layout))).toHaveLength(18)
  })

  it('returns nothing for absent, corrupt or non-array storage', () => {
    expect(readWorkspaceSplitGroups()).toEqual([])
    window.localStorage.setItem('orca.workspaceSplitGroups.v1', '{not json')
    expect(readWorkspaceSplitGroups()).toEqual([])
    window.localStorage.setItem('orca.workspaceSplitGroups.v1', '{"id":"x"}')
    expect(readWorkspaceSplitGroups()).toEqual([])
  })

  it('drops groups with fewer than two workspaces and workspaces claimed twice', () => {
    const leaf = (workspaceId: string) => ({ type: 'leaf', workspaceId })
    const pair = (a: string, b: string) => ({
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: leaf(a),
      second: leaf(b)
    })
    const parsed = parseWorkspaceSplitGroups([
      { id: 'lone', layout: leaf('solo') },
      { id: 'ok', layout: pair('a', 'b') },
      { id: 'clash', layout: pair('b', 'c') },
      { id: 7, layout: pair('d', 'e') },
      null
    ])
    expect(parsed.map((group) => group.id)).toEqual(['ok'])
  })

  it('clamps stored ratios and normalises unknown directions', () => {
    const [group] = parseWorkspaceSplitGroups([
      {
        id: 'g',
        layout: {
          type: 'split',
          direction: 'sideways',
          ratio: 9,
          first: { type: 'leaf', workspaceId: 'a' },
          second: { type: 'leaf', workspaceId: 'b' }
        }
      }
    ])
    expect(group.layout).toMatchObject({ direction: 'horizontal', ratio: 0.85 })
  })

  it('collapses a split whose half is unreadable instead of losing the other half', () => {
    const parsed = parseWorkspaceSplitGroups([
      {
        id: 'g',
        layout: {
          type: 'split',
          direction: 'horizontal',
          ratio: 0.5,
          first: { type: 'leaf', workspaceId: 'a' },
          second: { type: 'junk' }
        }
      }
    ])
    expect(parsed).toEqual([])
  })

  it('never restores more than 16 workspaces from an oversized or very deep layout', () => {
    let node: unknown = { type: 'leaf', workspaceId: 'leaf-0' }
    for (let depth = 0; depth < MAX_WORKSPACE_PANES * 3; depth += 1) {
      node = {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: node,
        second: { type: 'leaf', workspaceId: `leaf-${depth + 1}` }
      }
    }
    const restored = parseWorkspaceSplitGroups([{ id: 'deep', layout: node }])
    const members = restored.flatMap((group) => collectWorkspaceIds(group.layout))
    expect(members.length).toBeLessThanOrEqual(MAX_WORKSPACE_PANES)
  })
})
