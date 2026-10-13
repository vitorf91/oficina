import { createHash } from 'node:crypto'
import { chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Files an official Orca leaves in a user's home, in the shape its installers write them. Seeded into a
// disposable HOME so that any install, refresh or removal by the app under test shows up as a diff.
const ORCA_OWNED_FILES: Record<string, string> = {
  '.claude/settings.json': `${JSON.stringify(
    {
      theme: 'dark',
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: '/bin/sh "$HOME/.orca/agent-hooks/claude-hook.sh"' }
            ]
          }
        ]
      }
    },
    null,
    2
  )}\n`,
  '.claude.json': `${JSON.stringify({ projects: {} }, null, 2)}\n`,
  '.codex/config.toml': '[features]\ncodex_hooks = true\n',
  '.codex/hooks.json': `${JSON.stringify({ hooks: {} }, null, 2)}\n`,
  '.cursor/hooks.json': `${JSON.stringify({ version: 1, hooks: {} }, null, 2)}\n`,
  '.gemini/settings.json': `${JSON.stringify({ hooks: {} }, null, 2)}\n`,
  '.copilot/config.json': `${JSON.stringify({ trustedFolders: [] }, null, 2)}\n`,
  '.config/opencode/opencode.json': `${JSON.stringify({ plugin: [] }, null, 2)}\n`,
  '.config/opencode/plugins/orca-opencode-status.js': '// official orca opencode status plugin\n',
  '.hermes/config.yaml': 'plugins:\n  enabled: []\n',
  '.orca/agent-hooks/codex-hook.sh': '#!/bin/sh\n# official orca codex hook\nexit 0\n',
  '.orca/agent-hooks/cursor-hook.sh': '#!/bin/sh\n# official orca cursor hook\nexit 0\n',
  '.orca/agent-hooks/claude-statusline.sh': '#!/bin/sh\n# official orca statusline\nexit 0\n'
}

// Paths the test itself (or the fork's own namespace) writes: not part of what the app may leave alone.
const OWN_PATHS = [
  /^\.oficina(\/|$)/,
  // The default folder new worktrees are created in; the app makes it when a repo is added, hooks or not.
  /^orca\/workspaces(\/|$)/,
  /^orca\/?$/,
  /^\.claude\/projects(\/|$)/,
  /^fake-claude\.log$/,
  /^claude-hook-command\.sh$/,
  /^\.orca\/agent-hooks\/claude-hook\.sh$/
]

export function seedOrcaOwnedFiles(home: string): void {
  for (const [relative, content] of Object.entries(ORCA_OWNED_FILES)) {
    const target = path.join(home, relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
    chmodSync(target, relative.endsWith('.sh') ? 0o755 : 0o644)
  }
}

export type HomeSnapshot = Record<string, string>

function walk(root: string, current: string, into: HomeSnapshot): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name)
    const relative = path.relative(root, absolute).split(path.sep).join('/')
    if (OWN_PATHS.some((own) => own.test(relative))) {
      continue
    }
    if (entry.isDirectory()) {
      into[`${relative}/`] = 'dir'
      walk(root, absolute, into)
      continue
    }
    const stat = lstatSync(absolute)
    const hash = createHash('sha256')
      .update(entry.isSymbolicLink() ? 'symlink' : readFileSync(absolute))
      .digest('hex')
    into[relative] = `${hash} ${(stat.mode & 0o777).toString(8)} ${Math.floor(stat.mtimeMs)}`
  }
}

/** Content hash, mode and mtime of everything under the disposable HOME that the test does not own. */
export function snapshotHome(home: string): HomeSnapshot {
  const snapshot: HomeSnapshot = {}
  walk(home, home, snapshot)
  return snapshot
}

/** Human-readable differences; empty when the app left every global file alone. */
export function diffHomeSnapshots(before: HomeSnapshot, after: HomeSnapshot): string[] {
  const differences: string[] = []
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      differences.push(`removed ${key}`)
    } else if (before[key] !== after[key]) {
      differences.push(`changed ${key}`)
    }
  }
  for (const key of Object.keys(after)) {
    if (!(key in before)) {
      differences.push(`added ${key}`)
    }
  }
  return differences
}
