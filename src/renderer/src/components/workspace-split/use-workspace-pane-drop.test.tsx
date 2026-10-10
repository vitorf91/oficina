// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_WORKSPACE_PANES, type WorkspaceSplitGroup } from '@/lib/workspace-split-layout'
import { useWorkspacePaneDrop } from './use-workspace-pane-drop'
import {
  dispatchWorkspacePanePointerDrop,
  hasWorkspacePaneDropTarget
} from './workspace-pane-pointer-drag'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const workspaceSplitGroups: WorkspaceSplitGroup[] = []
  return {
    state: { workspaceSplitGroups, placeWorkspaceAtEdge: vi.fn() },
    activate: vi.fn()
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: mocks.activate }))

const mounted: { root: Root; container: HTMLDivElement }[] = []

// A chain of 16 workspaces, every one a member of the single group.
function fullGroup(): WorkspaceSplitGroup[] {
  const ids = Array.from({ length: MAX_WORKSPACE_PANES }, (_, index) => `w-${index}`)
  const layout = ids.slice(1).reduce<WorkspaceSplitGroup['layout']>(
    (node, id) => ({
      type: 'split',
      direction: 'horizontal',
      first: node,
      second: { type: 'leaf', workspaceId: id },
      ratio: 0.5
    }),
    { type: 'leaf', workspaceId: ids[0] }
  )
  return [{ id: 'view-1', layout }]
}

function Harness({ ids }: { ids: string[] }): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  useWorkspacePaneDrop(rootRef, ids, true)
  return (
    <div ref={rootRef} data-testid="root">
      {ids.map((id) => (
        <div key={id} data-workspace-surface-id={id} />
      ))}
    </div>
  )
}

function mountPanes(ids: string[]): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.push({ root, container })
  act(() => root.render(<Harness ids={ids} />))
  const rect = { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }
  for (const element of container.querySelectorAll('div')) {
    element.getBoundingClientRect = () => ({ ...rect, x: 0, y: 0, toJSON: () => rect })
  }
  const surface = container.querySelector<HTMLElement>('[data-workspace-surface-id]')!
  // Happy-dom has no layout, so the pointer is told which pane it is over.
  document.elementFromPoint = () => surface
  return surface
}

function dropFrom(sourceId: string): boolean {
  let claimed = false
  act(() => {
    claimed = dispatchWorkspacePanePointerDrop({ sourceId, x: 500, y: 300 })
  })
  return claimed
}

beforeEach(() => {
  mocks.state.workspaceSplitGroups = []
  mocks.state.placeWorkspaceAtEdge.mockReset()
  mocks.activate.mockReset().mockReturnValue({})
  vi.mocked(toast.error).mockReset()
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('useWorkspacePaneDrop', () => {
  it('turns a card dropped on a pane into a split', () => {
    mountPanes(['w-0'])
    expect(dropFrom('outsider')).toBe(true)
    expect(mocks.state.placeWorkspaceAtEdge).toHaveBeenCalledWith('outsider', 'w-0', 'top', false)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('refuses a seventeenth workspace with a toast and changes nothing', () => {
    mocks.state.workspaceSplitGroups = fullGroup()
    mountPanes(['w-0', 'w-1'])
    expect(dropFrom('outsider')).toBe(true)
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      `A split can contain up to ${MAX_WORKSPACE_PANES} workspaces`
    )
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(mocks.state.placeWorkspaceAtEdge).not.toHaveBeenCalled()
  })

  it('lets a member of a full group be moved within it', () => {
    mocks.state.workspaceSplitGroups = fullGroup()
    mountPanes(['w-0', 'w-1'])
    dropFrom('w-5')
    expect(toast.error).not.toHaveBeenCalled()
    expect(mocks.state.placeWorkspaceAtEdge).toHaveBeenCalledWith('w-5', 'w-0', 'top', false)
  })

  it('does not claim a drop that lands outside every pane', () => {
    mountPanes(['w-0'])
    document.elementFromPoint = () => null
    expect(dropFrom('outsider')).toBe(false)
    expect(mocks.state.placeWorkspaceAtEdge).not.toHaveBeenCalled()
  })
})

describe('hasWorkspacePaneDropTarget', () => {
  it('is true only while a workspace pane is on screen to take the drop', () => {
    expect(hasWorkspacePaneDropTarget()).toBe(false)
    mountPanes(['w-0'])
    expect(hasWorkspacePaneDropTarget()).toBe(true)
    for (const { root } of mounted.splice(0)) {
      act(() => root.unmount())
    }
    expect(hasWorkspacePaneDropTarget()).toBe(false)
  })

  it('is false when no workspace is shown', () => {
    mountPanes([])
    expect(hasWorkspacePaneDropTarget()).toBe(false)
  })
})
