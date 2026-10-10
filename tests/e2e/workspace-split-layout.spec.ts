// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { createSeededTestRepo } from './helpers/seeded-test-repo'
import { cleanupTestRepository } from './global-teardown'

// ORCA_SPLIT_SHOTS_DIR keeps the evidence screenshots outside the per-test output folder.
const SHOTS_DIR = process.env.ORCA_SPLIT_SHOTS_DIR

test('three workspaces from two projects sit side by side with a fourth below', async ({
  orcaPage,
  electronApp,
  registerPostElectronShutdownCleanup
}, testInfo) => {
  test.setTimeout(240_000)
  const pageErrors: string[] = []
  orcaPage.on('pageerror', (error) => pageErrors.push(error.message))
  orcaPage.on('console', (message) => {
    if (message.type() === 'error') {
      pageErrors.push(message.text())
    }
  })
  // Evidence frames: hide the unrelated onboarding card and tooltip that float over the sidebar
  // in a fresh profile, and wait until every terminal has painted its prompt, so a capture
  // never shows a half-drawn pane.
  await orcaPage.addStyleTag({
    content: '[data-setup-script-prompt-layer], [role="tooltip"] { display: none !important }'
  })
  const shot = async (name: string) => {
    const dir = SHOTS_DIR ?? testInfo.outputDir
    mkdirSync(dir, { recursive: true })
    await expect(orcaPage.locator('.xterm:visible')).toHaveCount(4, { timeout: 20_000 })
    // The renderer draws to a canvas, so there is no text to wait on; give each shell a moment
    // to print its prompt.
    await orcaPage.waitForTimeout(1_500)
    await orcaPage.screenshot({ path: path.join(dir, name) })
  }

  // A second project, so the panes really come from different repos.
  const secondRepoPath = createSeededTestRepo({ publishPath: false })
  registerPostElectronShutdownCleanup(async () => cleanupTestRepository(secondRepoPath))
  const secondRepoId = await orcaPage.evaluate(async (repoPath) => {
    const result = await window.api.repos.add({ path: repoPath })
    if ('error' in result) {
      throw new Error(result.error)
    }
    return result.repo.id
  }, secondRepoPath)
  await expect
    .poll(() =>
      orcaPage.evaluate(async (repoId) => {
        const store = window.__store!
        await store.getState().fetchRepos()
        const repo = store.getState().repos.find((candidate) => candidate.id === repoId)
        if (!repo) {
          return 0
        }
        await store.getState().updateRepo(repo.id, { externalWorktreeVisibility: 'show' })
        await store.getState().fetchWorktrees(repoId)
        return store.getState().worktreesByRepo[repoId]?.length ?? 0
      }, secondRepoId)
    )
    .toBeGreaterThanOrEqual(2)

  // Give each workspace a name that reads like real work, so the headers are legible.
  const ids = await orcaPage.evaluate(async (repoId) => {
    const state = window.__store!.getState()
    const pick = (id: string) => {
      const worktrees = state.worktreesByRepo[id] ?? []
      return [
        worktrees.find((worktree) => worktree.isMainWorktree)!.id,
        worktrees.find((worktree) => !worktree.isMainWorktree)!.id
      ]
    }
    const firstRepoId = Object.keys(state.worktreesByRepo).find((id) => id !== repoId)!
    const [aMain, aSecond] = pick(firstRepoId)
    const [bMain, bSecond] = pick(repoId)
    await state.updateRepo(firstRepoId, { displayName: 'billing-api' })
    await state.updateRepo(repoId, { displayName: 'web-app' })
    await state.updateWorktreeMeta(aMain, { displayName: 'main' })
    await state.updateWorktreeMeta(aSecond, { displayName: 'fix-invoice-rounding' })
    await state.updateWorktreeMeta(bMain, { displayName: 'main' })
    await state.updateWorktreeMeta(bSecond, { displayName: 'checkout-redesign' })
    state.setActiveWorktree(aMain)
    return { aMain, aSecond, bMain, bSecond }
  }, secondRepoId)
  const row = (id: string) => orcaPage.locator(`[role="option"][data-worktree-id="${id}"]`)
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  const preview = orcaPage.locator('[data-workspace-drop-preview]')
  await expect(row(ids.bSecond)).toBeVisible()
  await expect(surface(ids.aMain)).toBeVisible()

  // Build the arrangement with real card drags: each lands on an edge of what is on screen.
  const dropCard = async (sourceId: string, targetId: string, x: number | 'edge', y: number) => {
    const box = await surface(targetId).boundingBox()
    await row(sourceId).dragTo(surface(targetId), {
      sourcePosition: { x: 80, y: 16 },
      targetPosition: { x: x === 'edge' ? box!.width - 8 : x, y }
    })
    await expect(surface(sourceId)).toBeVisible()
  }
  const aMainBox = await surface(ids.aMain).boundingBox()
  await dropCard(ids.aSecond, ids.aMain, 'edge', Math.floor(aMainBox!.height / 2))
  const aSecondBox = await surface(ids.aSecond).boundingBox()
  await dropCard(ids.bMain, ids.aSecond, 'edge', Math.floor(aSecondBox!.height / 2))
  // The outer band of the workspace area wraps the whole group, here along its bottom.
  const topRowBox = await surface(ids.bMain).boundingBox()
  await dropCard(ids.bSecond, ids.bMain, Math.floor(topRowBox!.width / 2), topRowBox!.height - 6)

  // The first drop split the hovered pane; the last two hit the outer band and wrapped the whole
  // group. Even out the three columns and give the lower pane a clear share.
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    const group = state.workspaceSplitGroups[0]
    const layout = group.layout
    if (layout.type !== 'split') {
      throw new Error('Expected a split layout')
    }
    state.setWorkspaceSplitRatio(group.id, [], 0.62)
    state.setWorkspaceSplitRatio(group.id, ['first'], 2 / 3)
    state.setWorkspaceSplitRatio(group.id, ['first', 'first'], 0.5)
  })
  for (const id of [ids.aMain, ids.aSecond, ids.bMain, ids.bSecond]) {
    await expect(surface(id)).toBeVisible()
    await expect(surface(id).locator('[data-workspace-empty-pane]')).toHaveCount(0)
    await expect(surface(id).locator('[data-tab-group-body-id]').first()).toBeVisible()
  }

  const boxes = {
    aMain: (await surface(ids.aMain).boundingBox())!,
    aSecond: (await surface(ids.aSecond).boundingBox())!,
    bMain: (await surface(ids.bMain).boundingBox())!,
    bSecond: (await surface(ids.bSecond).boundingBox())!
  }
  // Three side by side on one row, the fourth below and as wide as all three.
  expect(Math.abs(boxes.aMain.y - boxes.aSecond.y)).toBeLessThan(2)
  expect(Math.abs(boxes.aSecond.y - boxes.bMain.y)).toBeLessThan(2)
  expect(boxes.aMain.x + boxes.aMain.width).toBeLessThanOrEqual(boxes.aSecond.x + 8)
  expect(boxes.aSecond.x + boxes.aSecond.width).toBeLessThanOrEqual(boxes.bMain.x + 8)
  expect(boxes.bSecond.y).toBeGreaterThanOrEqual(boxes.aMain.y + boxes.aMain.height - 2)
  expect(boxes.bSecond.width).toBeGreaterThan(boxes.aMain.width * 2.8)
  expect(Math.abs(boxes.aMain.width - boxes.bMain.width)).toBeLessThan(40)
  // The headers name the project of each pane.
  await expect(surface(ids.aMain).locator('[data-workspace-pane-header]')).toContainText(
    'billing-api'
  )
  await expect(surface(ids.bMain).locator('[data-workspace-pane-header]')).toContainText('web-app')
  await expect(surface(ids.bSecond).locator('[data-workspace-pane-header]')).toContainText(
    'checkout-redesign'
  )
  await orcaPage.mouse.move(2, 2)
  await shot('01-three-side-by-side-fourth-below.png')

  // Mid-drag, the edge a drop would take shows a preview. Escape then cancels the drag.
  await orcaPage.evaluate(() => window.__store!.getState().setSortBy('manual'))
  const grab = await row(ids.bSecond).boundingBox()
  expect(grab).not.toBeNull()
  await orcaPage.mouse.move(grab!.x + 80, grab!.y + 16)
  await orcaPage.mouse.down()
  const target = boxes.aSecond
  await orcaPage.mouse.move(target.x + target.width * 0.5, target.y + target.height * 0.4, {
    steps: 10
  })
  await orcaPage.mouse.move(target.x + target.width - 10, target.y + target.height * 0.4, {
    steps: 6
  })
  await expect(preview).toHaveAttribute('data-workspace-drop-preview', 'right')
  await expect(preview).toHaveAttribute('data-workspace-drop-scope', 'pane')
  await shot('02-drop-preview-pane-edge.png')
  await orcaPage.mouse.move(
    target.x + target.width * 0.5,
    boxes.bSecond.y + boxes.bSecond.height - 8,
    {
      steps: 8
    }
  )
  await expect(preview).toHaveAttribute('data-workspace-drop-scope', 'window')
  await shot('03-drop-preview-window-edge.png')
  await orcaPage.keyboard.press('Escape')
  await orcaPage.mouse.up()
  await expect(preview).toHaveCount(0)
  // Nothing moved: the four panes are still where they were.
  const after = (await surface(ids.bSecond).boundingBox())!
  expect(Math.abs(after.y - boxes.bSecond.y)).toBeLessThan(2)
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(4)

  // A small window keeps all four panes and their headers inside it, with no sideways scroll.
  const noSidewaysScroll = () =>
    orcaPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  expect(await noSidewaysScroll()).toBe(true)
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1100, 720)
  })
  await expect.poll(() => orcaPage.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1100)
  await expect(orcaPage.locator('[data-workspace-pane-header]:visible')).toHaveCount(4)
  for (const id of [ids.aMain, ids.aSecond, ids.bMain, ids.bSecond]) {
    const header = await surface(id).locator('[data-workspace-pane-header]').boundingBox()
    const pane = await surface(id).boundingBox()
    expect(header!.x + header!.width).toBeLessThanOrEqual(pane!.x + pane!.width + 1)
  }
  expect(await noSidewaysScroll()).toBe(true)
  await shot('04-small-window.png')
  // The console stays clean of anything the split touches.
  expect(pageErrors.filter((message) => /workspace|split|pane/i.test(message))).toEqual([])
})
