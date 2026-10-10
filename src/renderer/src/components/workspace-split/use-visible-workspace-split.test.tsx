// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectWorkspaceIds,
  placeWorkspaceAtEdge,
  type WorkspaceSplitGroup
} from '@/lib/workspace-split-layout'
import { useVisibleWorkspaceSplit } from './use-visible-workspace-split'

const mocks = vi.hoisted(() => ({ state: { workspaceSplitGroups: [] as WorkspaceSplitGroup[] } }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))

afterEach(cleanup)

function storeGroup(ids: string[]): void {
  let groups = placeWorkspaceAtEdge([], ids[1], ids[0], 'right', 'view-1')
  for (const id of ids.slice(2)) {
    groups = placeWorkspaceAtEdge(groups, id, ids[0], 'bottom', 'unused')
  }
  mocks.state.workspaceSplitGroups = groups
}

function renderSplit(active: string | null, live: string[]) {
  return renderHook(
    (props: { active: string | null; live: string[] }) =>
      useVisibleWorkspaceSplit(props.active, new Set(props.live)),
    { initialProps: { active, live } }
  )
}

describe('useVisibleWorkspaceSplit', () => {
  it('shows every member of a group whose members are all live', () => {
    storeGroup(['a', 'b', 'c'])
    const { result } = renderSplit('a', ['a', 'b', 'c'])
    expect(result.current.visibleWorkspaceSplitGroup).toBe(mocks.state.workspaceSplitGroups[0])
    expect([...result.current.visibleWorkspaceIds].sort()).toEqual(['a', 'b', 'c'])
  })

  it('still shows the live members when one was deleted outside the app', () => {
    storeGroup(['a', 'b', 'c'])
    const { result } = renderSplit('a', ['a', 'c'])
    expect(collectWorkspaceIds(result.current.visibleWorkspaceSplitGroup!.layout)).toEqual([
      'a',
      'c'
    ])
    expect([...result.current.visibleWorkspaceIds].sort()).toEqual(['a', 'c'])
    // What shows never rewrites the stored arrangement.
    expect(collectWorkspaceIds(mocks.state.workspaceSplitGroups[0].layout)).toEqual(['a', 'c', 'b'])
  })

  it('shows the lone survivor as an ordinary workspace', () => {
    storeGroup(['a', 'b'])
    const { result } = renderSplit('a', ['a'])
    expect(result.current.visibleWorkspaceSplitGroup).toBeNull()
    expect(result.current.visibleWorkspaceIds).toEqual(['a'])
  })

  it('puts a workspace that loads late back in its place', () => {
    storeGroup(['a', 'b', 'c'])
    const { result, rerender } = renderSplit('a', ['a', 'b'])
    expect(result.current.visibleWorkspaceIds).toEqual(['a', 'b'])
    rerender({ active: 'a', live: ['a', 'b', 'c'] })
    expect(collectWorkspaceIds(result.current.visibleWorkspaceSplitGroup!.layout)).toEqual([
      'a',
      'c',
      'b'
    ])
  })

  it('shows nothing extra when there is no active workspace', () => {
    storeGroup(['a', 'b'])
    const { result } = renderSplit(null, ['a', 'b'])
    expect(result.current.visibleWorkspaceSplitGroup).toBeNull()
    expect(result.current.visibleWorkspaceIds).toEqual([])
  })
})
