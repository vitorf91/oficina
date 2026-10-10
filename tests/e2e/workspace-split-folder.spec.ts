// Adapted from brooksgolden/orca, feature/sessions-grid-custom, MIT.
import { mkdtempSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { cleanupTestRepository } from './global-teardown'

test('a folder workspace card can be dropped into a pane and the pair splits', async ({
  orcaPage,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(180_000)
  const folderPath = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-folder-')))
  registerPostElectronShutdownCleanup(async () => cleanupTestRepository(folderPath))
  const { primaryId, folderKey } = await orcaPage.evaluate(async (dir) => {
    const store = window.__store!
    const state = store.getState()
    const primary = Object.values(state.worktreesByRepo)
      .flat()
      .find((worktree) => worktree.isMainWorktree)!
    const group = await window.api.projectGroups.create({ name: 'Folder E2E', parentPath: dir })
    const workspace = await state.createFolderWorkspace({
      projectGroupId: group.id,
      name: 'notes-folder',
      folderPath: dir
    })
    if (!workspace) {
      throw new Error('Expected the folder workspace to be created')
    }
    state.setActiveWorktree(primary.id)
    return { primaryId: primary.id, folderKey: `folder:${workspace.id}` }
  }, folderPath)
  const row = (id: string) => orcaPage.locator(`[role="option"][data-worktree-id="${id}"]`)
  const surface = (id: string) => orcaPage.locator(`[data-workspace-surface-id="${id}"]`)
  await expect(row(folderKey)).toBeVisible()
  await expect(surface(primaryId)).toBeVisible()

  const bounds = await surface(primaryId).boundingBox()
  await row(folderKey).dragTo(surface(primaryId), {
    sourcePosition: { x: 80, y: 16 },
    targetPosition: { x: bounds!.width - 8 - 30, y: Math.floor(bounds!.height / 2) }
  })
  await expect(orcaPage.locator('[data-workspace-split="true"]')).toBeVisible()
  await expect(surface(primaryId)).toBeVisible()
  await expect(surface(folderKey)).toBeVisible()
  await expect(surface(folderKey).locator('[data-workspace-pane-header]')).toContainText(
    'notes-folder'
  )
  await expect(row(folderKey)).toHaveAttribute('aria-current', 'page')

  // Its pane can be taken out again from the pane header.
  await surface(folderKey).getByRole('button', { name: 'Remove workspace from split' }).click()
  await expect(orcaPage.locator('[data-workspace-split="true"]')).toHaveCount(0)
  await expect(row(primaryId)).toHaveAttribute('aria-current', 'page')
})
