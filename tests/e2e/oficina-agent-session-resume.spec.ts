/**
 * Oficina must bring a Claude conversation back when its worktree is opened again.
 *
 * The fork installs no hook file; the claude CLI reports through the hook scripts the official Orca
 * installed. Those reports are the only way a provider session id reaches the resume record, so a
 * report that never arrives means a slept worktree reopens on a bare shell.
 *
 * Every test runs against a disposable HOME that holds the files an official Orca leaves behind, and
 * fails if the app changes any of them: resuming must never need a write to a user-wide file.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import { PROTOCOL_VERSION } from '../../src/main/daemon/types'
import { test, expect } from './helpers/orca-app'
import { TEST_REPO_PATH_FILE } from './global-setup'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { RuntimeClient } from '../../src/cli/runtime/client'
import { importProfileFromOfficialOrca } from './helpers/oficina-orca-profile-import'
import {
  FAKE_CLAUDE_SESSION_ID,
  installOficinaFakeClaude,
  readFakeClaudeArgv
} from './helpers/oficina-fake-claude'
import {
  diffHomeSnapshots,
  seedOrcaOwnedFiles,
  snapshotHome
} from './helpers/oficina-global-files-snapshot'
import {
  activateWorkspaceByClick,
  giveWorkspaceALivePty,
  readWorkspaceSample,
  sleepWorkspaceViaSidebar
} from './helpers/slept-workspace-probe'
import { getAllWorktreeIds, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePaneHookDescriptor,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'

test.describe.configure({ mode: 'serial' })

type ResumeRun = {
  session: ReturnType<typeof createRestartSession>
  repoPath: string
  logPath: string
  /** Fails when the app changed, added or removed a file an official Orca owns. */
  expectGlobalFilesUntouched: () => void
}

function openResumeRun(
  testInfo: TestInfo,
  profile: { savedStatusSwitch?: boolean; importedFromOrca?: boolean } = {}
): ResumeRun | null {
  const repoPath = readFileSync(TEST_REPO_PATH_FILE, 'utf-8').trim()
  if (!repoPath || !existsSync(repoPath)) {
    test.skip(true, 'Global setup did not produce a seeded test repo')
    return null
  }
  const session = createRestartSession(testInfo)
  const home = realpathSync(path.join(session.userDataDir, 'home'))
  seedOrcaOwnedFiles(home)
  const { logPath } = installOficinaFakeClaude({
    home,
    appCliBinDir: path.join(session.userDataDir, 'cli', 'bin')
  })
  const profileFile = path.join(session.userDataDir, 'orca-data.json')
  if (profile.importedFromOrca) {
    importProfileFromOfficialOrca(session.userDataDir)
  } else {
    const seeded = JSON.parse(readFileSync(profileFile, 'utf8'))
    seeded.settings = {
      ...seeded.settings,
      // Why: the trust marker write is the fork's documented, separate user-wide write; this run isolates hook files.
      agentWorkspaceTrustEnabled: false,
      ...(profile.savedStatusSwitch === undefined
        ? {}
        : { agentStatusHooksEnabled: profile.savedStatusSwitch })
    }
    writeFileSync(profileFile, `${JSON.stringify(seeded, null, 2)}\n`)
  }
  const before = snapshotHome(home)
  return {
    session,
    repoPath,
    logPath,
    expectGlobalFilesUntouched: () =>
      expect(diffHomeSnapshots(before, snapshotHome(home))).toEqual([])
  }
}

type Diagnosis = {
  agentRows: {
    paneKey: string
    agentType: string
    state: string
    providerSessionId: string | null
  }[]
  sleeping: { paneKey: string; origin: string | null; providerSessionId: string }[]
}

// Why the store: waiting on it and naming what it held when a wait fails; the claims themselves are the claude launches.
async function diagnose(page: Page, worktreeId: string): Promise<Diagnosis> {
  return page.evaluate((id) => {
    const state = window.__store!.getState()
    const tabIds = new Set((state.tabsByWorktree[id] ?? []).map((tab) => tab.id))
    return {
      agentRows: Object.values(state.agentStatusByPaneKey)
        .filter((entry) => entry.worktreeId === id || tabIds.has(entry.paneKey.split(':')[0]))
        .map((entry) => ({
          paneKey: entry.paneKey,
          agentType: String(entry.agentType),
          state: entry.state,
          providerSessionId: entry.providerSession?.id ?? null
        })),
      sleeping: Object.values(state.sleepingAgentSessionsByPaneKey)
        .filter((record) => record.worktreeId === id)
        .map((record) => ({
          paneKey: record.paneKey,
          origin: record.origin ?? null,
          providerSessionId: record.providerSession.id
        }))
    }
  }, worktreeId)
}

async function openRepoWithTwoWorktrees(
  page: Page,
  repoPath: string
): Promise<{ worktreeId: string; other: string }> {
  const worktreeId = await attachRepoAndOpenTerminal(page, repoPath)
  await waitForSessionReady(page)
  await waitForActiveWorktree(page)
  await waitForActiveTerminalManager(page, 30_000)
  await expect
    .poll(
      async () => {
        await page.evaluate(async () => {
          const state = window.__store!.getState()
          for (const repo of state.repos) {
            await state.fetchWorktrees(repo.id)
          }
        })
        return (await getAllWorktreeIds(page)).length
      },
      { timeout: 30_000, message: 'the seeded repo must expose a second worktree' }
    )
    .toBeGreaterThanOrEqual(2)
  const other = (await getAllWorktreeIds(page)).find((id) => id !== worktreeId)!
  return { worktreeId, other }
}

/** Types `claude` into the active pane and waits until the hook reports reached the status store. */
async function startFakeClaudeInActivePane(page: Page, worktreeId: string): Promise<void> {
  const ptyId = await waitForActivePanePtyId(page, 30_000)
  await execInTerminal(page, ptyId, 'command -v claude')
  await waitForTerminalOutput(page, '/cli/bin/claude')
  await execInTerminal(page, ptyId, 'claude')
  await waitForTerminalOutput(page, `FAKE_CLAUDE_READY:${FAKE_CLAUDE_SESSION_ID}`, 30_000)
  const descriptor = await waitForActivePaneHookDescriptor(page)
  await expect
    .poll(async () => (await diagnose(page, worktreeId)).agentRows, {
      timeout: 15_000,
      message: 'the hook reports of the claude run never produced a status row with its session id'
    })
    .toContainEqual(
      expect.objectContaining({
        paneKey: descriptor.paneKey,
        providerSessionId: FAKE_CLAUDE_SESSION_ID
      })
    )
}

function expectLastRunResumed(logPath: string): void {
  expect(readFakeClaudeArgv(logPath).at(-1)).toMatch(
    new RegExp(`(^|\\s)--resume ${FAKE_CLAUDE_SESSION_ID}$`)
  )
}

/** The user's Sleep on the claude worktree, then a click on it again; returns once claude ran again. */
async function sleepAndReopen(
  page: Page,
  logPath: string,
  ids: { worktreeId: string; other: string },
  expectedRuns: number
): Promise<void> {
  await giveWorkspaceALivePty(page, ids.other)
  await activateWorkspaceByClick(page, ids.worktreeId)
  await sleepWorkspaceViaSidebar(page, ids.worktreeId)
  await expect
    .poll(async () => (await readWorkspaceSample(page, ids.worktreeId)).livePtyCount, {
      timeout: 20_000,
      message: 'sleep did not release the workspace PTYs'
    })
    .toBe(0)
  const afterSleep = await diagnose(page, ids.worktreeId)
  expect(
    afterSleep.sleeping.map((record) => record.providerSessionId),
    `sleep kept no resume record: ${JSON.stringify(afterSleep)}`
  ).toContain(FAKE_CLAUDE_SESSION_ID)

  await activateWorkspaceByClick(page, ids.other)
  await activateWorkspaceByClick(page, ids.worktreeId)
  try {
    await expect
      .poll(() => readFakeClaudeArgv(logPath).length, { timeout: 40_000 })
      .toBe(expectedRuns)
  } catch (error) {
    throw new Error(
      `reopening the worktree never relaunched claude: ${JSON.stringify(await diagnose(page, ids.worktreeId))}`,
      { cause: error }
    )
  }
  expectLastRunResumed(logPath)
}

test('a Claude session in an Oficina terminal comes back with --resume after Sleep', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  const run = openResumeRun(testInfo)
  if (!run) {
    return
  }
  let app: ElectronApplication | null = null
  try {
    const launched = await run.session.launch()
    app = launched.app
    const ids = await openRepoWithTwoWorktrees(launched.page, run.repoPath)
    await startFakeClaudeInActivePane(launched.page, ids.worktreeId)
    expect(readFakeClaudeArgv(run.logPath)).toEqual([''])
    await sleepAndReopen(launched.page, run.logPath, ids, 2)
    await run.session.close(app)
    app = null
    run.expectGlobalFilesUntouched()
  } finally {
    if (app) {
      await run.session.close(app)
    }
    await run.session.dispose()
  }
})

test('after a quit that lost the daemon, Oficina reopens the worktree into claude --resume', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  test.skip(process.platform === 'win32', 'Uses POSIX SIGKILL to simulate daemon death')
  const run = openResumeRun(testInfo)
  if (!run) {
    return
  }
  let first: ElectronApplication | null = null
  let second: ElectronApplication | null = null
  try {
    const firstLaunch = await run.session.launch()
    first = firstLaunch.app
    const { worktreeId } = await openRepoWithTwoWorktrees(firstLaunch.page, run.repoPath)
    await startFakeClaudeInActivePane(firstLaunch.page, worktreeId)
    expect(readFakeClaudeArgv(run.logPath)).toEqual([''])

    const daemonPid = JSON.parse(
      readFileSync(
        path.join(run.session.userDataDir, 'daemon', `daemon-v${PROTOCOL_VERSION}.pid`),
        'utf8'
      )
    ).pid
    await run.session.close(first)
    first = null
    // The daemon, and the claude inside it, died while the app was closed (reboot, crash, update).
    process.kill(daemonPid, 'SIGKILL')

    const secondLaunch = await run.session.launch()
    second = secondLaunch.app
    await waitForSessionReady(secondLaunch.page)
    await waitForActiveWorktree(secondLaunch.page)
    await waitForActiveTerminalManager(secondLaunch.page, 30_000)
    try {
      await expect.poll(() => readFakeClaudeArgv(run.logPath).length, { timeout: 40_000 }).toBe(2)
    } catch (error) {
      throw new Error(
        `relaunch never resumed claude: ${JSON.stringify(await diagnose(secondLaunch.page, worktreeId))}`,
        { cause: error }
      )
    }
    expectLastRunResumed(run.logPath)
    await run.session.close(second)
    second = null
    run.expectGlobalFilesUntouched()
  } finally {
    if (second) {
      await run.session.close(second)
    }
    if (first) {
      await run.session.close(first)
    }
    await run.session.dispose()
  }
})

test('a profile saved with agent status off hears nothing until the switch is turned on, then resumes', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  // The shape import-orca-data used to write: Orca's hooks are installed, the saved switch says off.
  const run = openResumeRun(testInfo, { savedStatusSwitch: false })
  if (!run) {
    return
  }
  let app: ElectronApplication | null = null
  try {
    const launched = await run.session.launch()
    app = launched.app
    const page = launched.page
    const ids = await openRepoWithTwoWorktrees(page, run.repoPath)

    // Negative control: the terminal carries no hook address, so claude's reports go nowhere.
    const ptyId = await waitForActivePanePtyId(page, 30_000)
    await execInTerminal(page, ptyId, 'echo "HOOK_PORT:[$ORCA_AGENT_HOOK_PORT]"')
    await waitForTerminalOutput(page, 'HOOK_PORT:[]')
    await execInTerminal(page, ptyId, 'claude')
    await waitForTerminalOutput(page, `FAKE_CLAUDE_READY:${FAKE_CLAUDE_SESSION_ID}`, 30_000)
    await page.waitForTimeout(2_000)
    expect((await diagnose(page, ids.worktreeId)).agentRows).toEqual([])

    // The user's one click in Settings > Agents, then a new terminal (a running shell keeps its old environment).
    await page.evaluate(() =>
      window.__store!.getState().updateSettingsOrThrow({ agentStatusHooksEnabled: true })
    )
    await page.evaluate((id) => {
      window.__store!.getState().createTab(id)
    }, ids.worktreeId)
    await waitForActiveTerminalManager(page, 30_000)
    await expect
      .poll(async () => (await waitForActivePanePtyId(page, 30_000)) !== ptyId, { timeout: 30_000 })
      .toBe(true)
    await startFakeClaudeInActivePane(page, ids.worktreeId)
    expect(readFakeClaudeArgv(run.logPath)).toEqual(['', ''])

    await sleepAndReopen(page, run.logPath, ids, 3)
    await run.session.close(app)
    app = null
    run.expectGlobalFilesUntouched()
  } finally {
    if (app) {
      await run.session.close(app)
    }
    await run.session.dispose()
  }
})

test('a terminal the runtime creates for the CLI or a phone carries the hook address too', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  const run = openResumeRun(testInfo)
  if (!run) {
    return
  }
  let app: ElectronApplication | null = null
  try {
    const launched = await run.session.launch()
    app = launched.app
    await openRepoWithTwoWorktrees(launched.page, run.repoPath)
    const client = new RuntimeClient(run.session.userDataDir, 30_000)
    const created = await client.call<{ terminal: { handle: string } }>('terminal.create', {
      worktree: `path:${run.repoPath}`,
      title: 'Runtime-created terminal'
    })
    await client.call('terminal.send', {
      terminal: created.result.terminal.handle,
      text: 'echo "HOOK_PORT:[$ORCA_AGENT_HOOK_PORT] PANE:[$ORCA_PANE_KEY]"',
      enter: true
    })
    await expect
      .poll(
        async () =>
          (
            await client.call<{ terminal: { tail: string[] } }>('terminal.read', {
              terminal: created.result.terminal.handle,
              limit: 50
            })
          ).result.terminal.tail.join('\n'),
        { timeout: 20_000 }
      )
      .toMatch(/HOOK_PORT:\[\d+\] PANE:\[[^\]]+:[^\]]+\]/)
    await run.session.close(app)
    app = null
    run.expectGlobalFilesUntouched()
  } finally {
    if (app) {
      await run.session.close(app)
    }
    await run.session.dispose()
  }
})

test('a profile created by import-orca-data resumes a Claude session after Sleep', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  const run = openResumeRun(testInfo, { importedFromOrca: true })
  if (!run) {
    return
  }
  let app: ElectronApplication | null = null
  try {
    const launched = await run.session.launch()
    app = launched.app
    const ids = await openRepoWithTwoWorktrees(launched.page, run.repoPath)
    await startFakeClaudeInActivePane(launched.page, ids.worktreeId)
    await sleepAndReopen(launched.page, run.logPath, ids, 2)
    await run.session.close(app)
    app = null
    run.expectGlobalFilesUntouched()
  } finally {
    if (app) {
      await run.session.close(app)
    }
    await run.session.dispose()
  }
})

const OFFICIAL_ORCA_SESSION_ID = '6f1c1c58-2b8e-4f33-9a47-0d2a5e9c7b11'

test('a transcript a Claude left under the official Orca is listed and resumed in an Oficina terminal', async (// oxlint-disable-next-line no-empty-pattern -- Playwright's second fixture arg is testInfo; the first must be an object destructure to opt out of the default fixture set.
{}, testInfo) => {
  const run = openResumeRun(testInfo)
  if (!run) {
    return
  }
  const home = realpathSync(path.join(run.session.userDataDir, 'home'))
  // What `claude` writes while it runs inside the official Orca: a transcript under ~/.claude, nothing Oficina owns.
  const directory = path.join(home, '.claude', 'projects', '-synthetic-official-orca')
  mkdirSync(directory, { recursive: true })
  const timestamp = new Date().toISOString()
  writeFileSync(
    path.join(directory, `${OFFICIAL_ORCA_SESSION_ID}.jsonl`),
    `${[
      {
        type: 'user',
        sessionId: OFFICIAL_ORCA_SESSION_ID,
        cwd: run.repoPath,
        timestamp,
        message: { role: 'user', content: 'Session started in the official Orca' }
      },
      {
        type: 'assistant',
        sessionId: OFFICIAL_ORCA_SESSION_ID,
        timestamp,
        message: { role: 'assistant', content: 'Done in the official Orca.' }
      }
    ]
      .map((record) => JSON.stringify(record))
      .join('\n')}\n`
  )
  let app: ElectronApplication | null = null
  try {
    const launched = await run.session.launch()
    app = launched.app
    const page = launched.page
    await openRepoWithTwoWorktrees(page, run.repoPath)
    await page.evaluate(() => {
      const state = window.__store!.getState()
      state.setRightSidebarOpen(true)
      state.setRightSidebarTab('vault')
      state.setRightSidebarWidth(400)
    })
    await page.getByRole('button', { name: 'Agents', exact: true }).click()
    await page.getByRole('radio', { name: 'All', exact: true }).click()
    await page.getByRole('button', { name: 'Refresh Session History', exact: true }).click()
    const row = page.getByText('Session started in the official Orca', { exact: true })
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.click()
    await page.getByRole('button', { name: 'Resume in Worktree', exact: true }).first().click()
    await expect
      .poll(() => readFakeClaudeArgv(run.logPath), { timeout: 30_000 })
      .toContainEqual(expect.stringMatching(new RegExp(`--resume ${OFFICIAL_ORCA_SESSION_ID}$`)))
    await run.session.close(app)
    app = null
    run.expectGlobalFilesUntouched()
  } finally {
    if (app) {
      await run.session.close(app)
    }
    await run.session.dispose()
  }
})
