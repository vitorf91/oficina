// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampWorkspaceSplitRatio,
  type WorkspaceLayoutNode,
  type WorkspaceLayoutPath
} from '@/lib/workspace-split-layout'
import { cn } from '@/lib/utils'

export type WorkspacePaneRect = { top: number; left: number; width: number; height: number }

function sameRects(a: Map<string, WorkspacePaneRect>, b: Map<string, WorkspacePaneRect>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const [id, rect] of a) {
    const other = b.get(id)
    if (
      !other ||
      rect.top !== other.top ||
      rect.left !== other.left ||
      rect.width !== other.width ||
      rect.height !== other.height
    ) {
      return false
    }
  }
  return true
}

function ResizeHandle({
  direction,
  onRatioChange
}: {
  direction: 'horizontal' | 'vertical'
  onRatioChange: (ratio: number) => void
}): React.JSX.Element {
  const horizontal = direction === 'horizontal'
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={cn(
        'tab-group-split-resize-handle',
        horizontal ? 'is-vertical' : 'is-horizontal',
        dragging && 'is-dragging'
      )}
      data-workspace-split-handle={direction}
      onPointerDown={(event) => {
        event.preventDefault()
        const handle = event.currentTarget
        const parent = handle.parentElement
        const first = handle.previousElementSibling
        const second = handle.nextElementSibling
        if (
          !parent ||
          !(first instanceof HTMLElement) ||
          !(second instanceof HTMLElement) ||
          handle.hasPointerCapture(event.pointerId)
        ) {
          return
        }
        handle.setPointerCapture(event.pointerId)
        setDragging(true)
        const restored = { first: first.style.flex, second: second.style.flex }
        let draggedRatio: number | null = null
        const onMove = (move: PointerEvent): void => {
          if (move.pointerId !== event.pointerId) {
            return
          }
          const rect = parent.getBoundingClientRect()
          draggedRatio = clampWorkspaceSplitRatio(
            horizontal
              ? (move.clientX - rect.left) / rect.width
              : (move.clientY - rect.top) / rect.height
          )
          // Write the flex directly while dragging so a resize never commits per pointermove.
          first.style.flex = `${draggedRatio} 1 0%`
          second.style.flex = `${1 - draggedRatio} 1 0%`
        }
        const onEnd = (end: PointerEvent): void => {
          if (end.pointerId !== event.pointerId) {
            return
          }
          handle.removeEventListener('pointermove', onMove)
          handle.removeEventListener('pointerup', onEnd)
          handle.removeEventListener('pointercancel', onEnd)
          handle.removeEventListener('lostpointercapture', onEnd)
          setDragging(false)
          if (handle.hasPointerCapture(event.pointerId)) {
            handle.releasePointerCapture(event.pointerId)
          }
          if (end.type === 'pointerup' && draggedRatio !== null) {
            onRatioChange(draggedRatio)
          } else {
            // A cancelled drag leaves no committed ratio, so put back what React last rendered.
            first.style.flex = restored.first
            second.style.flex = restored.second
          }
        }
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', onEnd)
        handle.addEventListener('pointercancel', onEnd)
        handle.addEventListener('lostpointercapture', onEnd)
      }}
    />
  )
}

function SlotNode({
  node,
  path,
  register,
  onRatioChange
}: {
  node: WorkspaceLayoutNode
  path: WorkspaceLayoutPath
  register: (id: string, element: HTMLDivElement | null) => void
  onRatioChange: (path: WorkspaceLayoutPath, ratio: number) => void
}): React.JSX.Element {
  if (node.type === 'leaf') {
    return (
      <div
        ref={(element) => register(node.workspaceId, element)}
        data-workspace-slot={node.workspaceId}
        className="flex-1 min-w-0 min-h-0"
      />
    )
  }
  const horizontal = node.direction === 'horizontal'
  return (
    <div className={cn('flex flex-1 min-w-0 min-h-0', horizontal ? 'flex-row' : 'flex-col')}>
      <div
        className="relative flex min-w-0 min-h-0 overflow-hidden"
        style={{ flex: `${node.ratio} 1 0%` }}
      >
        <SlotNode
          node={node.first}
          path={[...path, 'first']}
          register={register}
          onRatioChange={onRatioChange}
        />
      </div>
      <ResizeHandle
        direction={node.direction}
        onRatioChange={(ratio) => onRatioChange(path, ratio)}
      />
      <div
        className="relative flex min-w-0 min-h-0 overflow-hidden"
        style={{ flex: `${1 - node.ratio} 1 0%` }}
      >
        <SlotNode
          node={node.second}
          path={[...path, 'second']}
          register={register}
          onRatioChange={onRatioChange}
        />
      </div>
    </div>
  )
}

/**
 * Empty flex slots that mirror the layout tree. Each workspace surface is absolutely positioned
 * onto its slot's measured rect, so a surface keeps its React identity when the tree reshapes.
 */
export function WorkspaceSplitLayoutSlots({
  layout,
  onRectsChange,
  onRatioChange
}: {
  layout: WorkspaceLayoutNode
  onRectsChange: (rects: Map<string, WorkspacePaneRect>) => void
  onRatioChange: (path: WorkspaceLayoutPath, ratio: number) => void
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const leavesRef = useRef(new Map<string, HTMLDivElement>())
  const lastRectsRef = useRef(new Map<string, WorkspacePaneRect>())
  const measure = useCallback(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const bounds = root.getBoundingClientRect()
    const rects = new Map<string, WorkspacePaneRect>()
    for (const [id, element] of leavesRef.current) {
      const rect = element.getBoundingClientRect()
      rects.set(id, {
        top: rect.top - bounds.top,
        left: rect.left - bounds.left,
        width: rect.width,
        height: rect.height
      })
    }
    if (!sameRects(rects, lastRectsRef.current)) {
      lastRectsRef.current = rects
      onRectsChange(rects)
    }
  }, [onRectsChange])
  const register = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      leavesRef.current.set(id, element)
    } else {
      leavesRef.current.delete(id)
    }
  }, [])
  useEffect(() => {
    const observer = new ResizeObserver(measure)
    if (rootRef.current) {
      observer.observe(rootRef.current)
    }
    for (const element of leavesRef.current.values()) {
      observer.observe(element)
    }
    measure()
    return () => {
      observer.disconnect()
    }
  }, [layout, measure])
  return (
    <div ref={rootRef} className="absolute inset-0 flex" data-workspace-split="true">
      <SlotNode node={layout} path={[]} register={register} onRatioChange={onRatioChange} />
    </div>
  )
}
