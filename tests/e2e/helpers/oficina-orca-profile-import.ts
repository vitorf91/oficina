import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getE2ECompletedOnboardingProfile } from './e2e-completed-onboarding-profile'

/**
 * Builds the first profile of an Oficina user the way the local installer does: runs
 * `oficina-local.mjs import-orca-data` over a stand-in for the official Orca's data folder
 * (its HOME is redirected, so the real folder is never opened) and writes the result as the
 * userData `orca-data.json` that the next launch imports into its own profile.
 */
export function importProfileFromOfficialOrca(userDataDir: string): void {
  const officialHome = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-official-home-')))
  try {
    const officialProfileDir = path.join(
      officialHome,
      'Library',
      'Application Support',
      'orca',
      'profiles',
      'local-default'
    )
    mkdirSync(officialProfileDir, { recursive: true })
    // An official Orca with agent status on, which is why its hook scripts exist at all.
    writeFileSync(
      path.join(officialProfileDir, 'orca-data.json'),
      JSON.stringify({
        schemaVersion: 1,
        settings: { agentStatusHooksEnabled: true, theme: 'dark' },
        repos: [],
        projects: [],
        projectHostSetups: [],
        projectGroups: [],
        folderWorkspaces: [],
        ui: { sidebarWidth: 300 }
      })
    )
    // The launch fixture seeded a first-run file; the importer refuses to write over a profile.
    const targetFile = path.join(userDataDir, 'orca-data.json')
    rmSync(targetFile)
    const scriptPath = path.join(process.cwd(), 'config', 'scripts', 'oficina-local.mjs')
    execFileSync(process.execPath, [scriptPath, 'import-orca-data', `--target=${userDataDir}`], {
      env: { ...process.env, HOME: officialHome },
      stdio: 'pipe'
    })
    // Only the first-run overlays are added; the agent status switch stays as the importer wrote it.
    const imported = JSON.parse(readFileSync(targetFile, 'utf8'))
    const completed = getE2ECompletedOnboardingProfile()
    writeFileSync(
      targetFile,
      JSON.stringify({
        ...imported,
        settings: {
          ...completed.settings,
          ...imported.settings,
          // The trust marker is the fork's separate, documented user-wide write; this run isolates hook files.
          agentWorkspaceTrustEnabled: false
        },
        onboarding: completed.onboarding,
        ui: { ...completed.ui, ...imported.ui }
      })
    )
  } finally {
    rmSync(officialHome, { recursive: true, force: true })
  }
}
