import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Why: `isAgentStatusHooksEnabled` is the fork's "installers are on" switch and is always false there. A consumer
// that only reads status, or exports an address, must follow the receiver switch instead, or the fork goes
// silent (the saved-off profile that import-orca-data used to write showed how little it takes). Upstream
// merges add consumers; this fails until each new one is classified in docs/OFICINA.md.
//   a: installs, refreshes or removes user-wide hook files, configs or plugins. Must stay off in the fork.
//   b: consumes hook events or session ids, or exports the receiver address. Follows the receiver switch.
const CONSUMERS: Record<string, 'a' | 'b'> = {
  'src/main/agent-hooks/managed-agent-hook-controls.ts': 'a',
  'src/main/agent-hooks/opencode-plugin-settings.ts': 'a',
  'src/main/agent-hooks/wsl-hook-relay-deps.ts': 'a',
  'src/main/claude-accounts/claude-profile-router.ts': 'a',
  'src/main/codex/codex-hook-service-implementation.ts': 'a',
  'src/main/ipc/pty/host-env/assembly.ts': 'a',
  'src/main/ipc/pty/host-env/opencode-config.ts': 'a',
  'src/main/ipc/pty/ipc/spawn-env-codex.ts': 'a',
  'src/main/ipc/pty/provider/local-configure.ts': 'a',
  'src/main/ipc/pty/runtime/spawn-preflight.ts': 'a',
  'src/main/ipc/settings.ts': 'a',
  'src/main/opencode/opencode-status-plugin-startup-refresh.ts': 'a',
  'src/main/orcad/orcad-entry.ts': 'b',
  'src/main/runtime/orca-runtime-stop-requested-pty-ids.ts': 'b',
  'src/main/runtime/rpc/methods/agent-hooks.ts': 'a',
  'src/main/runtime/runtime-client-settings.ts': 'a',
  'src/main/ssh/ssh-relay-session.ts': 'a',
  'src/main/startup/codex-launch-preparation.ts': 'a',
  'src/main/startup/codex-session-resume-launch.ts': 'a',
  'src/main/startup/configure-process.ts': 'a',
  'src/main/startup/main-process-pty-startup.ts': 'a',
  'src/main/startup/main-process-ready-foundation.ts': 'a',
  'src/main/startup/main-process-ready-runtime.ts': 'a',
  'src/main/startup/main-process-runtime-service.ts': 'b'
}

// Files that define the switches, or read the receiver one; they are the gate, not consumers of it.
const DEFINITIONS = new Set(['src/shared/agent-status-hooks-setting.ts'])
const CONSUMER_CALL =
  /\bisAgentStatusHooksEnabled(?:ForAgent)?\(|OFICINA_IDENTITY\.agentStatusHooksEnabled|\bopts\.agentStatusHooksEnabled|\boptions\.agentStatusHooksEnabled/

const repoRoot = join(import.meta.dirname, '..', '..', '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function consumerFiles(): string[] {
  return sourceFiles(join(repoRoot, 'src'))
    .map((path) => relative(repoRoot, path).split(sep).join('/'))
    .filter((path) => !DEFINITIONS.has(path))
    .filter((path) => CONSUMER_CALL.test(readFileSync(join(repoRoot, path), 'utf8')))
    .sort()
}

describe('consumers of the agent status hooks switch', () => {
  it('are all classified, so an upstream merge cannot add one unseen', () => {
    expect(consumerFiles()).toEqual(Object.keys(CONSUMERS).sort())
  })

  it('are all listed in docs/OFICINA.md with the same class', () => {
    const doc = readFileSync(join(repoRoot, 'docs', 'OFICINA.md'), 'utf8')
    const rows = doc.split('\n').filter((line) => line.startsWith('|'))
    for (const [file, kind] of Object.entries(CONSUMERS)) {
      const listed = rows.filter((candidate) => candidate.includes(`\`${file}:`))
      expect(listed, `${file} is missing from the consumer table in docs/OFICINA.md`).not.toEqual(
        []
      )
      expect(
        listed.some((row) => new RegExp(`\\|\\s*${kind}\\s*\\|`).test(row)),
        `${file} has no class ${kind} row`
      ).toBe(true)
    }
  })
})
