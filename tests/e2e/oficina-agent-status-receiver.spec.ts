import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getManagedScript } from '../../src/main/claude/hook-script'
import { getManagedCommand } from '../../src/main/claude/hook-settings'
import { test, expect } from './helpers/orca-app'
import { readHookEndpoint } from './helpers/agent-hook-endpoint'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'

// The fork installs no hook file. It must still show agent state for hook scripts that the official Orca
// installed, which report to whatever receiver the terminal's environment names.

const FAKE_ORCA_TOKEN = 'fake-official-orca-token'
// Why a synchronous probe: test.use() needs the port before the app launches, and it is only read back by the fake receiver below.
const FAKE_ORCA_PORT = Number(
  execFileSync(process.execPath, [
    '-e',
    'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})'
  ])
    .toString()
    .trim()
)
const FAKE_ORCA_HOME = mkdtempSync(path.join(tmpdir(), 'orca-fake-official-'))
const FAKE_ORCA_ENDPOINT = path.join(FAKE_ORCA_HOME, 'agent-hooks', 'endpoint.env')
mkdirSync(path.dirname(FAKE_ORCA_ENDPOINT), { recursive: true })
writeFileSync(
  FAKE_ORCA_ENDPOINT,
  [
    `ORCA_AGENT_HOOK_PORT=${FAKE_ORCA_PORT}`,
    `ORCA_AGENT_HOOK_TOKEN=${FAKE_ORCA_TOKEN}`,
    'ORCA_AGENT_HOOK_ENV=production',
    'ORCA_AGENT_HOOK_VERSION=1',
    ''
  ].join('\n')
)

// Why: the app starts as if launched from an official Orca terminal, so these coordinates are inherited and must never survive into Oficina's terminals.
test.use({
  orcaAppExtraEnv: {
    ORCA_AGENT_HOOK_PORT: String(FAKE_ORCA_PORT),
    ORCA_AGENT_HOOK_TOKEN: FAKE_ORCA_TOKEN,
    ORCA_AGENT_HOOK_ENV: 'production',
    ORCA_AGENT_HOOK_VERSION: '1',
    ORCA_AGENT_HOOK_ENDPOINT: FAKE_ORCA_ENDPOINT
  }
})

test.afterAll(() => {
  rmSync(FAKE_ORCA_HOME, { recursive: true, force: true })
})

test('Oficina shows agent state from hook scripts Orca installed, and never reports to Orca', async ({
  orcaPage,
  electronApp
}) => {
  const fakeOrcaRequests: string[] = []
  const fakeOrca: Server = createServer((req, res) => {
    fakeOrcaRequests.push(`${req.method} ${req.url}`)
    res.writeHead(204)
    res.end()
  })
  await new Promise<void>((resolve) => fakeOrca.listen(FAKE_ORCA_PORT, '127.0.0.1', resolve))
  try {
    // Control: the fake official receiver records what reaches it, so the empty list at the end means something.
    await fetch(`http://127.0.0.1:${FAKE_ORCA_PORT}/control`, { method: 'POST' })
    expect(fakeOrcaRequests).toEqual(['POST /control'])
    fakeOrcaRequests.length = 0

    await waitForSessionReady(orcaPage)
    await expect(orcaPage).toHaveTitle('Oficina')
    await expect(orcaPage.locator('.titlebar-app-name')).toHaveText('Oficina')
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    await orcaPage.evaluate(() => {
      const state = window.__store?.getState()
      state?.setAgentActivityDisplayMode('full')
      if (state && !state.worktreeCardProperties.includes('inline-agents')) {
        state.setWorktreeCardProperties([...state.worktreeCardProperties, 'inline-agents'])
      }
    })

    // Install the official layout inside the disposable HOME: the shared script plus the exact wrapper command Claude's settings.json runs.
    const home = await electronApp.evaluate(({ app }) => app.getPath('home'))
    const scriptPath = path.join(home, '.orca', 'agent-hooks', 'claude-hook.sh')
    mkdirSync(path.dirname(scriptPath), { recursive: true })
    writeFileSync(scriptPath, getManagedScript('local'))
    chmodSync(scriptPath, 0o755)
    const wrapperPath = path.join(home, 'claude-hook-command.sh')
    writeFileSync(
      wrapperPath,
      `${getManagedCommand(scriptPath, { neutralJsonWhenMissing: true })}\n`
    )

    const endpoint = await readHookEndpoint(electronApp)
    const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    const ptyId = await waitForActivePanePtyId(orcaPage)

    // The terminal names Oficina's own receiver, not the inherited official one.
    await execInTerminal(
      orcaPage,
      ptyId,
      `echo "ENDPOINT:$(case "$ORCA_AGENT_HOOK_ENDPOINT" in "${userDataPath}"/*) echo own;; *) echo foreign;; esac)"`
    )
    await waitForTerminalOutput(orcaPage, 'ENDPOINT:own')
    await execInTerminal(
      orcaPage,
      ptyId,
      `echo "COORDS:$([ "$ORCA_AGENT_HOOK_PORT" = "${endpoint.port}" ] && [ "$ORCA_AGENT_HOOK_TOKEN" = "${endpoint.token}" ] && echo own || echo foreign)"`
    )
    await waitForTerminalOutput(orcaPage, 'COORDS:own')
    expect(endpoint.port).not.toBe(FAKE_ORCA_PORT)

    const runHook = async (payload: Record<string, unknown>, marker: string): Promise<void> => {
      await execInTerminal(
        orcaPage,
        ptyId,
        `printf '%s' '${JSON.stringify(payload)}' | /bin/sh "${wrapperPath}" >/dev/null; echo "${marker}:$?"`
      )
      await waitForTerminalOutput(orcaPage, `${marker}:0`)
    }

    const working = orcaPage.locator('[aria-label="Working"]')
    const attention = orcaPage.locator('[aria-label="Needs attention"]')
    const done = orcaPage.locator('[aria-label="Done"]')
    const session = { session_id: 'oficina-e2e-session', cwd: home }

    await runHook(
      { ...session, hook_event_name: 'UserPromptSubmit', prompt: 'Reply with the word pong' },
      'PROMPT'
    )
    await expect(working.first()).toBeVisible()

    await runHook(
      {
        ...session,
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input: { command: 'ls' }
      },
      'PERMISSION'
    )
    await expect(attention.first()).toBeVisible()

    await runHook({ ...session, hook_event_name: 'Stop', last_assistant_message: 'pong' }, 'STOP')
    await expect(done.first()).toBeVisible()
    await expect(working).toHaveCount(0)

    // Every report above went to Oficina; the inherited official receiver heard nothing.
    expect(fakeOrcaRequests).toEqual([])
  } finally {
    await new Promise<void>((resolve) => fakeOrca.close(() => resolve()))
  }
})
