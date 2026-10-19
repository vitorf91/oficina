import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Why: the shared test profile swaps this module for upstream Orca values; this file checks the real ones.
vi.unmock('../shared/oficina-identity')

// Why: an upstream release can add code that writes into the official Orca's folders or launchd and
// defaults namespaces, which Oficina must never touch (docs/OFICINA.md). This fails on every new site
// until it is swapped to OFICINA_IDENTITY or listed here with the reason it is safe.
const ACCEPTED_SITES: Record<string, string> = {
  'src/main/agent-hooks/installer-utils.ts': "path of Orca's hook scripts; the installers are off",
  'src/main/codex/codex-home-paths.ts': 'fallback only when ORCA_USER_DATA_PATH is unset (CLI)',
  'src/main/computer/macos-computer-use-permissions.ts': 'computer use is not bundled',
  'src/main/daemon/macos-daemon-job-label.ts':
    "label carries a hash of Oficina's own userData path",
  'src/main/grok/grok-hook-owners.ts': "path of Orca's hook owners; the installers are off",
  'src/main/jcode/hook-settings.ts': "path of Orca's hook scripts; the installers are off",
  'src/main/macos-press-and-hold-default.ts': 'doc comment; the bundle id is swapped',
  'src/main/macos-tcc-prompt-watch.ts':
    'matches log lines from both apps; Oficina ids listed first',
  'src/shared/local-build-compatibility-contract.ts': 'contract the build scripts compare against',
  'src/shared/local-build-compatibility.ts': 'reads the contract above'
}
const ORCA_NAMESPACE =
  /com\.stablyai\.orca|'Application Support',\s*'orca'|homedir\(\),\s*'\.orca'|LOCAL_BUILD_COMPATIBILITY_CONTRACT\.appId/

const repoRoot = join(import.meta.dirname, '..', '..')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : sourceFiles(path)
    }
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('Orca namespaces in Oficina source', () => {
  it('lists every site that still names an official Orca folder, bundle id or launchd label', () => {
    const sites = sourceFiles(join(repoRoot, 'src'))
      .filter((path) => ORCA_NAMESPACE.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repoRoot, path).split(sep).join('/'))
      .sort()
    expect(sites).toEqual(Object.keys(ACCEPTED_SITES).sort())
  })

  it('keeps the shared coordination, serve, credential and launchd namespaces Oficina-owned', async () => {
    const { OFICINA_IDENTITY: identity } = await import('../shared/oficina-identity')
    const { macCoordinationRoot, SERVE_LAUNCHD_LABEL_PREFIX } =
      await import('../shared/serve-bundle-coordination')
    const { orcadCredentialRoot } = await import('./orcad/orcad-plaintext-credential-migration')

    expect(macCoordinationRoot('/home/user')).toBe(
      join('/home/user', 'Library', 'Application Support', identity.userDataDirName)
    )
    expect(SERVE_LAUNCHD_LABEL_PREFIX).toBe(`${identity.appId}.serve`)
    expect(orcadCredentialRoot()).toBe(join(homedir(), identity.homeDirName))
  })
})
