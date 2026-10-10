// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
/**
 * A workspace split, with its resized ratio, survives a full app restart.
 *
 * Restart persistence needs two Electron launches sharing one userData dir, so it lives in E2E
 * rather than in a store test; the render layer then proves the panes really come back.
 */

import { existsSync, readFileSync } from 'node:fs'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { TEST_REPO_PATH_FILE } from './global-setup'

test('restores a workspace split and its ratio after an app restart', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.setTimeout(300_000)
  const repoPath = existsSync(TEST_REPO_PATH_FILE)
    ? readFileSync(TEST_REPO_PATH_FILE, 'utf-8').trim()
    : ''
  test.skip(!repoPath || !existsSync(repoPath), 'Global setup did not produce a seeded test repo')
  const session = createRestartSession(testInfo)
  let firstApp: ElectronApplication | null = null
  let secondApp: ElectronApplication | null = null
  try {
    const first = await session.launch()
    firstApp = first.app
    await waitForSessionReady(first.page)
    const repoWorktreeId = await attachRepoAndOpenTerminal(first.page, repoPath)
    await expect
      .poll(() =>
        first.page.evaluate(async (activeId) => {
          const store = window.__store!
          const repoId = activeId.split('::')[0]
          await store.getState().fetchWorktrees(repoId)
          return store.getState().worktreesByRepo[repoId]?.length ?? 0
        }, repoWorktreeId)
      )
      .toBeGreaterThanOrEqual(2)
    const ids = await first.page.evaluate(() => {
      const state = window.__store!.getState()
      const worktrees = Object.values(state.worktreesByRepo).find((items) => items.length >= 2)
      if (!worktrees) {
        throw new Error('Expected the seeded primary and secondary workspaces')
      }
      const [left, right] = worktrees.map((worktree) => worktree.id)
      state.placeWorkspaceAtEdge(right, left, 'right')
      const group = window.__store!.getState().workspaceSplitGroups[0]
      state.setWorkspaceSplitRatio(group.id, [], 0.3)
      state.setActiveWorktree(left)
      return { left, right }
    })
    await expect(first.page.locator('[data-workspace-split="true"]')).toBeVisible()
    const beforeRestart = await first.page.evaluate(() =>
      JSON.stringify(window.__store!.getState().workspaceSplitGroups)
    )

    await session.close(firstApp)
    firstApp = null

    // Relaunch against the same userDataDir: the real restore path.
    const second = await session.launch()
    secondApp = second.app
    await waitForSessionReady(second.page)
    await expect
      .poll(
        () =>
          second.page.evaluate(() =>
            JSON.stringify(window.__store!.getState().workspaceSplitGroups)
          ),
        { timeout: 15_000 }
      )
      .toBe(beforeRestart)

    // Render-layer proof: opening either member shows both panes, divided as left.
    await second.page
      .locator(`[role="option"][data-worktree-id="${ids.right}"]`)
      .click({ timeout: 30_000 })
    await expect(second.page.locator('[data-workspace-split="true"]')).toBeVisible()
    const surface = (id: string) => second.page.locator(`[data-workspace-surface-id="${id}"]`)
    await expect(surface(ids.left)).toBeVisible()
    await expect(surface(ids.right)).toBeVisible()
    await expect
      .poll(async () => {
        const left = await surface(ids.left).boundingBox()
        const right = await surface(ids.right).boundingBox()
        return left && right ? Math.round((left.width / (left.width + right.width)) * 10) / 10 : 0
      })
      .toBe(0.3)
  } finally {
    // Guard each step so a failing close still runs the remaining cleanup.
    for (const app of [secondApp, firstApp]) {
      if (!app) {
        continue
      }
      try {
        await session.close(app)
      } catch {
        // best-effort cleanup
      }
    }
    await session.dispose()
  }
})
