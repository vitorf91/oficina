// Oficina fork identity: every machine-global name this build owns, in one module.
// Why: Oficina and the official Orca run side by side on one Mac. Anything global (bundle id, app-data
// dir, ~/.orca, URL scheme, listener port, CLI command, hook files) must differ or the two apps
// overwrite each other. Mirrored for electron-builder in config/oficina-identity.cjs; a unit test
// keeps both in sync. See docs/OFICINA.md.

export type OficinaIdentity = {
  productName: string
  appId: string
  userDataDirName: string
  devUserDataDirName: string
  homeDirName: string
  urlScheme: string
  mobileWsPort: number
  devMobileWsPort: number
  cliCommandName: string
  autoUpdateEnabled: boolean
  agentStatusHooksEnabled: boolean
  agentStatusReceiverEnabled: boolean
  computerUseBundled: boolean
  worktreeTrashSweepEnabled: boolean
}

export const OFICINA_IDENTITY: OficinaIdentity = {
  productName: 'Oficina',
  appId: 'com.vitorf91.oficina',
  // Folder under Electron's appData, and its dev-run counterpart (upstream: orca / orca-dev).
  userDataDirName: 'Oficina',
  devUserDataDirName: 'oficina-dev',
  // Home-directory folder for credentials and keybindings (upstream: .orca).
  homeDirName: '.oficina',
  urlScheme: 'oficina',
  // Mobile pairing / runtime RPC WebSocket listener (upstream: 6768, dev 6769).
  mobileWsPort: 6778,
  devMobileWsPort: 6779,
  // Global shell command a user can register from Settings (upstream: orca).
  cliCommandName: 'oficina',
  // The fork ships no update feed: stablyai releases must never replace Oficina.
  autoUpdateEnabled: false,
  // Agent status hooks write ~/.orca/agent-hooks and ~/.claude, ~/.codex, ~/.cursor... configs that
  // the official Orca owns, so the fork keeps them off until it has namespaced hooks of its own.
  agentStatusHooksEnabled: false,
  // Receiving is not installing: the local hook listener runs and its address is exported into this
  // app's own terminals, so the scripts the official Orca already installed report here. No file is written.
  agentStatusReceiverEnabled: true,
  // The fork bundles no Computer Use helper; one found by path or env would be Orca's, with Orca's permissions.
  computerUseBundled: false,
  // Both apps open the same repos. The official Orca parks a removed checkout in <workspace>/.orca-worktree-trash and renames
  // it back if the removal fails, so a sweep from this app could delete a checkout that Orca is about to restore.
  worktreeTrashSweepEnabled: false
}
