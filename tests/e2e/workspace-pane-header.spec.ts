// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('pane headers name every workspace, keep window chrome at the outer edge and drag workspaces', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  test.setTimeout(180_000)
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.setBackgroundThrottling(false)
    }
  })
  await waitForSessionReady(orcaPage)
  const ids = await orcaPage.evaluate(() => {
    const s = window.__store!.getState()
    const worktrees = Object.values(s.worktreesByRepo).find((items) => items.length >= 2)!
    const [left, right] = worktrees.map((w) => w.id)
    s.createTab(left)
    s.createTab(right)
    const root = s.getActiveTab(left)!.groupId
    const bottom = s.createEmptySplitGroup(left, root, 'down')!
    s.createTab(left, bottom)
    s.placeWorkspaceAtEdge(right, left, 'right')
    s.setActiveWorktree(left)
    s.setActiveView('terminal')
    return { left, right }
  })
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  const header = (id: string) => surface(id).locator('[data-workspace-pane-header]')
  const split = orcaPage.locator('[data-workspace-split="true"]')

  // Every pane is named, and each carries its own X.
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(2)
  await expect(orcaPage.locator('[data-workspace-unsplit-button]:visible')).toHaveCount(2)
  const names = await orcaPage.evaluate(
    (workspaceIds) => {
      const s = window.__store!.getState()
      return workspaceIds.map((id) => {
        const worktree = Object.values(s.worktreesByRepo)
          .flat()
          .find((item) => item.id === id)
        const repo = s.repos.find((item) => item.id === worktree?.repoId)
        return {
          name:
            worktree?.displayName?.trim() ||
            worktree?.branch?.replace(/^refs\/heads\//, '') ||
            worktree?.path.split(/[\\/]/).findLast(Boolean) ||
            '',
          project: repo?.displayName ?? ''
        }
      })
    },
    [ids.left, ids.right]
  )
  for (const [index, id] of [ids.left, ids.right].entries()) {
    await expect(header(id)).toContainText(names[index].name)
    await expect(header(id)).toContainText(names[index].project)
  }
  // The focused pane's header reads stronger than the other one.
  await expect(header(ids.left)).toHaveAttribute('data-focused', 'true')
  await expect(header(ids.right)).toHaveAttribute('data-focused', 'false')

  // With both sidebars closed the window controls sit over the outer corners only: the
  // right pane's header leaves the corner clear, the left pane's X stays at its own edge.
  await orcaPage.evaluate(() => {
    const s = window.__store!.getState()
    s.setSidebarOpen(false)
    s.setRightSidebarOpen(false)
  })
  await expect
    .poll(async () => {
      const x = await orcaPage
        .locator(`[data-workspace-unsplit-button="${ids.right}"]`)
        .boundingBox()
      const pane = await surface(ids.right).boundingBox()
      return pane && x ? pane.x + pane.width - (x.x + x.width) : -1
    })
    .toBeGreaterThanOrEqual(40)
  const leftX = await orcaPage
    .locator(`[data-workspace-unsplit-button="${ids.left}"]`)
    .boundingBox()
  const leftPane = await surface(ids.left).boundingBox()
  expect(leftPane!.x + leftPane!.width - (leftX!.x + leftX!.width)).toBeLessThan(12)
  // Tab strips below a header never reserve window-control space of their own: the last
  // control of the focused right pane's strip stays against the strip's right edge.
  await orcaPage.evaluate((id) => window.__store!.getState().setActiveWorktree(id), ids.right)
  await expect(header(ids.right)).toHaveAttribute('data-focused', 'true')
  const gapToStripEnd = await surface(ids.right)
    .locator('[data-tab-group-strip-id]')
    .first()
    .evaluate((strip) => {
      const stripRight = strip.getBoundingClientRect().right
      const rights = Array.from(strip.querySelectorAll('button'))
        .map((button) => button.getBoundingClientRect())
        .filter((rect) => rect.width > 0)
        .map((rect) => rect.right)
      return stripRight - Math.max(...rights)
    })
  expect(gapToStripEnd).toBeLessThan(24)
  await orcaPage.evaluate((id) => window.__store!.getState().setActiveWorktree(id), ids.left)
  await orcaPage.evaluate(() => {
    const s = window.__store!.getState()
    s.setSidebarOpen(true)
    s.setRightSidebarOpen(true)
  })

  // The blank part of a header drags its workspace, here onto the window's bottom edge.
  const blank = await header(ids.left).locator('div.flex-1').boundingBox()
  const paneBounds = await surface(ids.left).boundingBox()
  expect(blank).not.toBeNull()
  await orcaPage.mouse.move(blank!.x + blank!.width / 2, blank!.y + blank!.height / 2)
  await orcaPage.mouse.down()
  await orcaPage.mouse.move(
    paneBounds!.x + paneBounds!.width / 2,
    paneBounds!.y + paneBounds!.height - 8,
    {
      steps: 8
    }
  )
  await expect(orcaPage.locator('[data-workspace-drop-preview="bottom"]')).toBeVisible()
  await orcaPage.mouse.up()
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store!.getState().workspaceSplitGroups[0].layout))
    .toMatchObject({
      type: 'split',
      direction: 'vertical',
      second: { type: 'leaf', workspaceId: ids.left }
    })
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(2)
  await orcaPage.screenshot({ path: testInfo.outputPath('workspace-header-vertical.png') })

  // Escape cancels a header drag without moving anything.
  const before = await orcaPage.evaluate(() =>
    JSON.stringify(window.__store!.getState().workspaceSplitGroups)
  )
  const blankAgain = await header(ids.left).locator('div.flex-1').boundingBox()
  const rightBounds = await surface(ids.right).boundingBox()
  await orcaPage.mouse.move(blankAgain!.x + blankAgain!.width / 2, blankAgain!.y + 4)
  await orcaPage.mouse.down()
  await orcaPage.mouse.move(rightBounds!.x + 10, rightBounds!.y + rightBounds!.height / 2, {
    steps: 6
  })
  await orcaPage.keyboard.press('Escape')
  await orcaPage.mouse.up()
  await expect(orcaPage.locator('[data-workspace-drop-preview]')).toHaveCount(0)
  expect(
    await orcaPage.evaluate(() => JSON.stringify(window.__store!.getState().workspaceSplitGroups))
  ).toBe(before)

  // The X removes a pane and leaves the other workspace active.
  await orcaPage.locator(`[data-workspace-unsplit-button="${ids.left}"]`).click()
  await expect(split).toHaveCount(0)
  await expect(orcaPage.locator('[data-workspace-pane-header]')).toHaveCount(0)
  await expect(
    orcaPage.locator(`[role="option"][data-worktree-id="${ids.right}"]`)
  ).toHaveAttribute('aria-current', 'page')
})
