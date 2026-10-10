import { vi } from 'vitest'

// Why: the suite inherited from stablyai/orca pins upstream names (.orca, 6768, hooks on, updater on).
// Running it against upstream values keeps those tests unedited so merges stay cheap; the fork's real
// values are covered by src/shared/oficina-identity.test.ts and the packaged-app proof in docs/OFICINA.md.
vi.mock('../../src/shared/oficina-identity', () => ({
  OFICINA_IDENTITY: {
    productName: 'Orca',
    appId: 'com.stablyai.orca',
    userDataDirName: 'orca',
    devUserDataDirName: 'orca-dev',
    homeDirName: '.orca',
    urlScheme: 'orca',
    mobileWsPort: 6768,
    devMobileWsPort: 6769,
    cliCommandName: 'orca',
    autoUpdateEnabled: true,
    agentStatusHooksEnabled: true
  }
}))
