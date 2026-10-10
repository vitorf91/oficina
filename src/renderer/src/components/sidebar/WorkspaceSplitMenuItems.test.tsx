// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { placeWorkspaceAtEdge, type WorkspaceSplitGroup } from '@/lib/workspace-split-layout'
import type { Worktree } from '../../../../shared/worktree/types'
import { WorkspaceSplitMenuItems } from './WorkspaceSplitMenuItems'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  state: {
    folderWorkspaces: [],
    workspaceSplitGroups: [] as WorkspaceSplitGroup[],
    placeWorkspaceAtEdge: vi.fn()
  },
  worktrees: [] as Worktree[],
  unsplit: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))
vi.mock('@/store/selectors', () => ({
  useAllWorktrees: () => mocks.worktrees,
  useRepoMap: () => new Map()
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: vi.fn() }))
vi.mock('../workspace-split/unsplit-workspace', () => ({
  unsplitWorkspaceAndFocusPartner: mocks.unsplit
}))

const mounted: { root: Root; container: HTMLDivElement }[] = []

function worktree(id: string): Worktree {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the menu reads only the fields set here.
  return { id, repoId: 'repo', displayName: id, branch: `refs/heads/${id}` } as Worktree
}

// Live workspaces a, b and c; `ghost` is stored in the group but is not (or not yet) a workspace.
function openMenuFor(worktreeId: string, group: string[]): string[] {
  mocks.worktrees = ['a', 'b', 'c'].map(worktree)
  let groups: WorkspaceSplitGroup[] = []
  if (group.length > 0) {
    groups = placeWorkspaceAtEdge([], group[1], group[0], 'right', 'view-1')
    for (const id of group.slice(2)) {
      groups = placeWorkspaceAtEdge(groups, id, group[0], 'bottom', 'unused')
    }
  }
  mocks.state.workspaceSplitGroups = groups
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  mounted.push({ root, container })
  act(() => {
    root.render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <WorkspaceSplitMenuItems worktreeId={worktreeId} disabled={false} />
        </DropdownMenuContent>
      </DropdownMenu>
    )
  })
  return Array.from(document.querySelectorAll('[role="menuitem"]')).map(
    (item) => item.textContent ?? ''
  )
}

beforeEach(() => {
  mocks.unsplit.mockReset()
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
})

describe('WorkspaceSplitMenuItems', () => {
  it('offers a split to a workspace that is not in one', () => {
    expect(openMenuFor('a', [])).toEqual(['Split with workspace'])
  })

  it('offers to unsplit a workspace that shares a split with a live partner', () => {
    expect(openMenuFor('a', ['a', 'b'])).toEqual(['Unsplit workspace'])
  })

  it('still offers to unsplit when only one of the other members is missing', () => {
    expect(openMenuFor('a', ['a', 'b', 'ghost'])).toEqual(['Unsplit workspace'])
  })

  it('offers a new split to the lone survivor of a group, which shows on its own', () => {
    expect(openMenuFor('a', ['a', 'ghost'])).toEqual(['Split with workspace'])
  })

  it('lists live workspaces as split partners, including a lone survivor of another group', () => {
    // b is the lone survivor of the stale group [b, ghost]; it shows on its own, so it can be paired.
    openMenuFor('a', ['b', 'ghost'])
    const trigger = document.querySelector<HTMLElement>('[role="menuitem"]')!
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    const partners = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .map((item) => item.textContent)
      .filter((text) => text !== 'Split with workspace')
    expect(partners).toEqual(['b', 'c'])
  })
})
