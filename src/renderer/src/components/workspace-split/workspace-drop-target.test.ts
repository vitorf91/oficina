// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { describe, expect, it } from 'vitest'
import { workspaceDropTarget } from './workspace-drop-target'

const root = { left: 0, right: 1000, top: 0, bottom: 600 }
const left = { left: 0, right: 500, top: 0, bottom: 600 }
const right = { left: 500, right: 1000, top: 0, bottom: 600 }

describe('workspaceDropTarget', () => {
  it('splits only the hovered workspace on its nearest inner edge', () => {
    expect(workspaceDropTarget(root, left, 100, 300, true)).toEqual({
      edge: 'left',
      wholeWindow: false
    })
    expect(workspaceDropTarget(root, right, 480 + 20, 300, true).wholeWindow).toBe(false)
    expect(workspaceDropTarget(root, left, 250, 560, true)).toEqual({
      edge: 'bottom',
      wholeWindow: false
    })
    expect(workspaceDropTarget(root, left, 250, 40, true)).toEqual({
      edge: 'top',
      wholeWindow: false
    })
  })

  it('wraps the whole window inside the outer 24px band of an existing split', () => {
    expect(workspaceDropTarget(root, left, 10, 300, true)).toEqual({
      edge: 'left',
      wholeWindow: true
    })
    expect(workspaceDropTarget(root, right, 990, 300, true)).toEqual({
      edge: 'right',
      wholeWindow: true
    })
    expect(workspaceDropTarget(root, left, 250, 590, true)).toEqual({
      edge: 'bottom',
      wholeWindow: true
    })
  })

  it('never wraps the window for a lone workspace', () => {
    expect(workspaceDropTarget(root, root, 10, 300, false)).toEqual({
      edge: 'left',
      wholeWindow: false
    })
  })

  it('does not treat a point outside the root as the window edge', () => {
    expect(workspaceDropTarget(root, left, -5, 300, true).wholeWindow).toBe(false)
  })
})
