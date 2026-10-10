// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { expect, test } from './helpers/orca-app'

test('sidebar pairing, member navigation, unsplit, drag and persistence keep full panes', async ({
  orcaPage
}) => {
  test.setTimeout(180_000)
  const [firstId, secondId] = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const worktrees = Object.values(state.worktreesByRepo).find((items) => items.length >= 2)
    if (!worktrees) {
      throw new Error('Expected the seeded primary and secondary workspaces')
    }
    return worktrees.slice(0, 2).map((worktree) => worktree.id)
  })
  const row = (id: string) => orcaPage.locator(`[role="option"][data-worktree-id="${id}"]`)
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  const split = orcaPage.locator('[data-workspace-split="true"]')
  const removeFromSplit = (id: string) =>
    surface(id).getByRole('button', { name: 'Remove workspace from split' })
  const startEmptyPane = async (id: string) => {
    if (await surface(id).locator('[data-workspace-empty-pane]').isVisible()) {
      await surface(id).getByRole('button', { name: 'New terminal' }).click()
    }
    await expect(surface(id).locator('[data-tab-group-body-id]').first()).toBeVisible()
  }

  // The first workspace carries its own tab-group split, to prove a pane is a whole workspace.
  await orcaPage.evaluate((id) => {
    const state = window.__store!.getState()
    const activeTab = state.getActiveTab(id)
    if (!activeTab) {
      throw new Error('Expected a terminal tab in the primary workspace')
    }
    const splitGroupId = state.createEmptySplitGroup(id, activeTab.groupId, 'down', {
      activate: false
    })
    if (!splitGroupId) {
      throw new Error('Could not create a split tab group')
    }
    state.createTab(id, splitGroupId, undefined, { activate: false })
  }, firstId)
  await expect(surface(firstId).locator('[data-tab-group-body-id]')).toHaveCount(2)

  // Pair from the workspace context menu.
  const secondLabel = await orcaPage.evaluate((id) => {
    const worktree = Object.values(window.__store!.getState().worktreesByRepo)
      .flat()
      .find((item) => item.id === id)
    return (
      worktree?.displayName?.trim() ||
      worktree?.branch?.replace(/^refs\/heads\//, '') ||
      worktree?.path.split(/[\\/]/).findLast(Boolean) ||
      ''
    )
  }, secondId)
  await row(firstId).click({ button: 'right' })
  await orcaPage.getByRole('menuitem', { name: 'Split with workspace' }).hover()
  await orcaPage.getByRole('menuitem').filter({ hasText: secondLabel }).first().click()
  await expect(split).toBeVisible()
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  await expect(surface(firstId).locator('[data-tab-group-body-id]')).toHaveCount(2)
  await startEmptyPane(secondId)
  await expect(surface(firstId).locator('[data-workspace-pane-header]')).toBeVisible()
  await expect(surface(secondId).locator('[data-workspace-pane-header]')).toBeVisible()

  // Activating either member shows the whole group.
  await row(secondId).click()
  await expect(split).toBeVisible()
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  await expect(surface(firstId).locator('[data-tab-group-body-id]')).toHaveCount(2)
  await row(firstId).click()
  await expect(split).toBeVisible()
  await expect(surface(secondId)).toBeVisible()

  // Unsplit from the member's own menu keeps the partner.
  await row(secondId).click({ button: 'right' })
  await orcaPage.getByRole('menuitem', { name: 'Unsplit workspace' }).click()
  await expect(split).toHaveCount(0)
  await expect(row(firstId)).toHaveAttribute('aria-current', 'page')
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).not.toBeVisible()

  // Dragging a sidebar card onto the left edge of the visible pane splits it.
  const bounds = await surface(firstId).boundingBox()
  expect(bounds).not.toBeNull()
  const dragSecondOntoFirstLeftEdge = () =>
    row(secondId).dragTo(surface(firstId), {
      sourcePosition: { x: 80, y: 16 },
      targetPosition: { x: 8, y: Math.floor(bounds!.height / 2) }
    })
  await dragSecondOntoFirstLeftEdge()
  await expect(orcaPage.locator('[data-workspace-board-sheet]')).toHaveCount(0)
  await expect(split).toBeVisible()
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  await expect(row(secondId)).toHaveAttribute('aria-current', 'page')
  const secondBox = await surface(secondId).boundingBox()
  const firstBox = await surface(firstId).boundingBox()
  expect(secondBox!.x).toBeLessThan(firstBox!.x)

  // Closing the last tab of a pane collapses it.
  await startEmptyPane(secondId)
  const closeLastTab = surface(secondId).locator('[data-tab-close-button="true"]')
  await expect(closeLastTab).toHaveCount(1)
  const stopAndClose = orcaPage.getByRole('button', { name: 'Stop and Close' })
  // A shell that is still starting asks before it closes, and a floating onboarding card can
  // take the first click as a dismissal, so keep closing until the pane is gone.
  await expect
    .poll(
      async () => {
        if (await stopAndClose.isVisible()) {
          await stopAndClose.click()
        } else if ((await closeLastTab.count()) > 0) {
          await closeLastTab.click({ timeout: 2_000 }).catch(() => undefined)
        }
        return split.count()
      },
      { timeout: 30_000, intervals: [500, 1_000] }
    )
    .toBe(0)
  await expect(row(firstId)).toHaveAttribute('aria-current', 'page')
  await dragSecondOntoFirstLeftEdge()
  await expect(split).toBeVisible()
  await expect(row(secondId)).toHaveAttribute('aria-current', 'page')

  // A card released over a pane that does not take it cancels: no sidebar reorder, and the
  // sort mode stays as the user chose it.
  await orcaPage.evaluate(() => window.__store!.getState().setSortBy('recent'))
  const rowOrder = () =>
    orcaPage.evaluate(() =>
      Array.from(document.querySelectorAll('[role="option"][data-worktree-id]')).map((element) =>
        element.getAttribute('data-worktree-id')
      )
    )
  const orderBefore = await rowOrder()
  const firstRowBox = await row(firstId).boundingBox()
  const ownPaneBox = await surface(secondId).boundingBox()
  expect(firstRowBox).not.toBeNull()
  expect(ownPaneBox).not.toBeNull()
  await row(secondId).dragTo(surface(secondId), {
    sourcePosition: { x: 80, y: 16 },
    targetPosition: {
      x: Math.floor(ownPaneBox!.width / 2),
      y: Math.max(1, Math.floor(firstRowBox!.y + firstRowBox!.height / 2 - ownPaneBox!.y))
    }
  })
  await expect(split).toBeVisible()
  expect(await orcaPage.evaluate(() => window.__store!.getState().sortBy)).toBe('recent')
  expect(await rowOrder()).toEqual(orderBefore)

  // Resizing a divider is remembered.
  const handle = orcaPage.locator('[data-workspace-split-handle="horizontal"]')
  const handleBox = await handle.boundingBox()
  expect(handleBox).not.toBeNull()
  await orcaPage.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 40)
  await orcaPage.mouse.down()
  await orcaPage.mouse.move(handleBox!.x + 160, handleBox!.y + 40, { steps: 6 })
  await orcaPage.mouse.up()
  const storedRatio = () =>
    orcaPage.evaluate(() => {
      const layout = window.__store!.getState().workspaceSplitGroups[0]?.layout
      return layout?.type === 'split' ? layout.ratio : null
    })
  await expect.poll(storedRatio).not.toBe(0.5)
  const ratio = await storedRatio()

  // The split and its ratio come back after the page reloads.
  await orcaPage.reload()
  await orcaPage.waitForFunction(() => Boolean(window.__store), null, { timeout: 30_000 })
  await expect(row(firstId)).toBeVisible()
  await row(firstId).click()
  await expect(split).toBeVisible()
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  expect(await storedRatio()).toBe(ratio)

  // The pane's X takes it out of the group.
  await removeFromSplit(secondId).click()
  await expect(split).toHaveCount(0)
  await expect(row(firstId)).toHaveAttribute('aria-current', 'page')
})

test('two workspaces without any tab still split into empty panes that can start a terminal', async ({
  orcaPage
}) => {
  test.setTimeout(120_000)
  const [firstId, secondId] = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const worktrees = Object.values(state.worktreesByRepo).find((items) => items.length >= 2)!
    return worktrees.slice(0, 2).map((worktree) => worktree.id)
  })
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  // Empty both workspaces through the store, then pair them.
  await orcaPage.evaluate(
    ([a, b]) => {
      const state = window.__store!.getState()
      for (const id of [a, b]) {
        for (const tab of window.__store!.getState().tabsByWorktree[id] ?? []) {
          state.closeTab(tab.id)
        }
      }
      window.__store!.getState().placeWorkspaceAtEdge(b, a, 'right')
      window.__store!.getState().setActiveWorktree(a)
    },
    [firstId, secondId]
  )
  await expect(orcaPage.locator('[data-workspace-split="true"]')).toBeVisible()
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  // Both panes render inside the split; nothing else paints a terminal outside a pane.
  await expect(orcaPage.locator('.xterm:visible')).toHaveCount(0)
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(2)
  const empty = surface(secondId).locator('[data-workspace-empty-pane]')
  if (await empty.isVisible()) {
    await empty.getByRole('button', { name: 'New terminal' }).click()
    await expect(surface(secondId).locator('.xterm:visible')).toHaveCount(1)
  }
  await expect(
    orcaPage.locator('.xterm:visible').locator('xpath=ancestor::*[@data-workspace-surface-id]')
  ).toHaveCount(await orcaPage.locator('.xterm:visible').count())
})

test('a group with a member that is not a workspace shows the live ones and keeps the stored layout', async ({
  orcaPage
}) => {
  test.setTimeout(180_000)
  const [firstId, secondId] = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const worktrees = Object.values(state.worktreesByRepo).find((items) => items.length >= 2)!
    return worktrees.slice(0, 2).map((worktree) => worktree.id)
  })
  const ghostId = `${firstId.split('::')[0]}::/tmp/oficina-never-existed`
  const row = (id: string) => orcaPage.locator(`[role="option"][data-worktree-id="${id}"]`)
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  const split = orcaPage.locator('[data-workspace-split="true"]')
  const storedRatios = () =>
    orcaPage.evaluate(() => {
      const layout = window.__store!.getState().workspaceSplitGroups[0]?.layout
      return layout?.type === 'split' && layout.first.type === 'split'
        ? [layout.ratio, layout.first.ratio]
        : null
    })

  // Stored as (first over second) next to a workspace that no longer exists.
  await orcaPage.evaluate(
    ([first, second, ghost]) => {
      const state = window.__store!.getState()
      state.placeWorkspaceAtEdge(ghost, first, 'right')
      state.placeWorkspaceAtEdge(second, first, 'bottom')
      state.setActiveWorktree(first)
    },
    [firstId, secondId, ghostId]
  )
  await expect(split).toBeVisible()
  await expect(surface(firstId)).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  await expect(surface(ghostId)).toHaveCount(0)
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(2)
  // The two live panes are stacked and fill the width the missing one would have shared.
  const firstBox = (await surface(firstId).boundingBox())!
  const secondBox = (await surface(secondId).boundingBox())!
  expect(secondBox.y).toBeGreaterThan(firstBox.y)
  expect(Math.abs(firstBox.width - secondBox.width)).toBeLessThan(2)

  // The member menu still offers the group's own entry.
  await row(secondId).click({ button: 'right' })
  await expect(orcaPage.getByRole('menuitem', { name: 'Unsplit workspace' })).toBeVisible()
  await expect(orcaPage.getByRole('menuitem', { name: 'Split with workspace' })).toHaveCount(0)
  await orcaPage.keyboard.press('Escape')

  // A resize lands on the divider that was dragged, not on the hidden one beside it.
  const handle = orcaPage.locator('[data-workspace-split-handle="vertical"]')
  const handleBox = (await handle.boundingBox())!
  await orcaPage.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await orcaPage.mouse.down()
  await orcaPage.mouse.move(handleBox.x + 40, handleBox.y - 90, { steps: 6 })
  await orcaPage.mouse.up()
  await expect.poll(async () => (await storedRatios())?.[1]).not.toBe(0.5)
  expect((await storedRatios())![0]).toBe(0.5)

  // A workspace that is only slow to load comes back to its place instead of being lost.
  const removed = await orcaPage.evaluate((id) => {
    const state = window.__store!.getState()
    const repoId = Object.keys(state.worktreesByRepo).find((key) =>
      state.worktreesByRepo[key].some((worktree) => worktree.id === id)
    )!
    const worktree = state.worktreesByRepo[repoId].find((item) => item.id === id)!
    window.__store!.setState({
      worktreesByRepo: {
        ...state.worktreesByRepo,
        [repoId]: state.worktreesByRepo[repoId].filter((item) => item.id !== id)
      }
    })
    return { repoId, worktree }
  }, secondId)
  await expect(split).toHaveCount(0)
  await expect(surface(firstId)).toBeVisible()
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(0)
  await orcaPage.evaluate(({ repoId, worktree }) => {
    const state = window.__store!.getState()
    window.__store!.setState({
      worktreesByRepo: {
        ...state.worktreesByRepo,
        [repoId]: [...state.worktreesByRepo[repoId], worktree]
      }
    })
  }, removed)
  await expect(split).toBeVisible()
  await expect(surface(secondId)).toBeVisible()
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(2)
})

test('a seventeenth workspace is refused with a message and nothing is split', async ({
  orcaPage
}) => {
  test.setTimeout(120_000)
  const [firstId, secondId] = await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const worktrees = Object.values(state.worktreesByRepo).find((items) => items.length >= 2)!
    return worktrees.slice(0, 2).map((worktree) => worktree.id)
  })
  const row = (id: string) => orcaPage.locator(`[role="option"][data-worktree-id="${id}"]`)
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  // The first workspace already belongs to a group of sixteen: itself and fifteen that are
  // stored but not shown, which still hold their places.
  await orcaPage.evaluate(
    ([first]) => {
      const state = window.__store!.getState()
      for (let index = 0; index < 15; index += 1) {
        state.placeWorkspaceAtEdge(
          `${first.split('::')[0]}::/tmp/oficina-gone-${index}`,
          first,
          'right'
        )
      }
      state.setActiveWorktree(first)
    },
    [firstId]
  )
  await expect(surface(firstId)).toBeVisible()
  const bounds = (await surface(firstId).boundingBox())!
  await row(secondId).dragTo(surface(firstId), {
    sourcePosition: { x: 80, y: 16 },
    targetPosition: { x: 8, y: Math.floor(bounds.height / 2) }
  })
  await expect(orcaPage.getByText('A split can contain up to 16 workspaces')).toBeVisible()
  await expect(orcaPage.locator('[data-workspace-split="true"]')).toHaveCount(0)
  await expect(surface(secondId)).not.toBeVisible()
  await expect(row(firstId)).toHaveAttribute('aria-current', 'page')
})
