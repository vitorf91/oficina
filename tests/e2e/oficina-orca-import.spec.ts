/**
 * Someone moving from the official Orca to Oficina must find their worktrees as they left them:
 * the names, statuses and comments given there come across through `import-orca-data`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import type { ElectronApplication } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { TEST_REPO_PATH_FILE } from './global-setup'
import { createRestartSession } from './helpers/orca-restart'
import { importProfileFromOfficialOrca } from './helpers/oficina-orca-profile-import'
import { waitForSessionReady } from './helpers/store'

const REPO_ID = '5f0c2f7e-1d0b-4c39-9a51-3c1e7f0b2a64'
const ORCA_NAME = 'tarsila 2.0'
const ORCA_COMMENT = 'Named in the official Orca'

function secondaryWorktreePath(repoPath: string): string | null {
  const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8'
  })
  const paths = porcelain
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
  return paths.find((candidate) => candidate !== repoPath) ?? null
}

test('worktree names, statuses and comments given in Orca show in Oficina after the import', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  const repoPath = readFileSync(TEST_REPO_PATH_FILE, 'utf-8').trim()
  const worktreePath = repoPath && existsSync(repoPath) ? secondaryWorktreePath(repoPath) : null
  if (!worktreePath) {
    test.skip(true, 'Global setup did not produce a seeded test repo with a second worktree')
    return
  }
  const session = createRestartSession(testInfo)
  const worktreeId = `${REPO_ID}::${worktreePath}`
  // The shape an official Orca 1.4.212 profile stores: the worktree row is keyed by repo id and path.
  importProfileFromOfficialOrca(session.userDataDir, {
    repos: [
      {
        id: REPO_ID,
        path: repoPath,
        displayName: 'imported-repo',
        badgeColor: '#ef4444',
        addedAt: 1789478496626,
        kind: 'git'
      }
    ],
    worktreeMeta: {
      [worktreeId]: {
        displayName: ORCA_NAME,
        displayNameIsPinned: true,
        comment: ORCA_COMMENT,
        workspaceStatus: 'todo',
        hostId: 'local',
        instanceId: '7d3f0a52-8c41-4f6e-b0a9-2e5d1c9f4b37',
        sortOrder: 1792100733786,
        isUnread: false
      }
    }
  })
  let app: ElectronApplication | null = null
  try {
    const launched = await session.launch()
    app = launched.app
    const page = launched.page
    await waitForSessionReady(page)
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const worktree = Object.values(window.__store!.getState().worktreesByRepo)
              .flat()
              .find((candidate) => candidate.id === id)
            return worktree
              ? {
                  displayName: worktree.displayName,
                  comment: worktree.comment,
                  workspaceStatus: worktree.workspaceStatus
                }
              : null
          }, worktreeId),
        { timeout: 30_000 }
      )
      .toEqual({ displayName: ORCA_NAME, comment: ORCA_COMMENT, workspaceStatus: 'todo' })
    await expect(page.getByText(ORCA_NAME, { exact: true }).first()).toBeVisible({
      timeout: 30_000
    })
    await session.close(app)
    app = null
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
  }
})
