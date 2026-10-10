// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { describe, expect, it } from 'vitest'
import { placeWorkspaceAtEdge } from '@/lib/workspace-split-layout'
import { workspaceTouchesWindowEdge } from './workspace-window-edges'

describe('workspaceTouchesWindowEdge', () => {
  it('gives each edge of a side-by-side pair to the outer workspace only', () => {
    const [group] = placeWorkspaceAtEdge([], 'right', 'left', 'right', 'view')
    expect(workspaceTouchesWindowEdge(group.layout, 'left', 'left')).toBe(true)
    expect(workspaceTouchesWindowEdge(group.layout, 'right', 'left')).toBe(false)
    expect(workspaceTouchesWindowEdge(group.layout, 'right', 'right')).toBe(true)
    expect(workspaceTouchesWindowEdge(group.layout, 'left', 'right')).toBe(false)
    expect(workspaceTouchesWindowEdge(group.layout, 'left', 'top')).toBe(true)
    expect(workspaceTouchesWindowEdge(group.layout, 'right', 'top')).toBe(true)
  })

  it('keeps top chrome off a workspace placed below others', () => {
    let groups = placeWorkspaceAtEdge([], 'b', 'a', 'right', 'view')
    groups = placeWorkspaceAtEdge(groups, 'c', 'a', 'bottom', 'unused')
    const { layout } = groups[0]
    expect(workspaceTouchesWindowEdge(layout, 'a', 'top')).toBe(true)
    expect(workspaceTouchesWindowEdge(layout, 'c', 'top')).toBe(false)
    expect(workspaceTouchesWindowEdge(layout, 'c', 'left')).toBe(true)
    expect(workspaceTouchesWindowEdge(layout, 'b', 'right')).toBe(true)
  })
})
