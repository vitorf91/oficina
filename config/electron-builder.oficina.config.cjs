// Oficina packaging: the upstream Orca config with the fork's identity laid over it.
// Why a wrapper, not edits: config/electron-builder.config.cjs stays byte-identical to upstream,
// so a sync from stablyai/orca never conflicts here. Identity values: config/oficina-identity.cjs.
const base = require('./electron-builder.config.cjs')
const identity = require('./oficina-identity.cjs')

// Why dropped: its bundle id is shared by every Orca build, and a second signer under that id
// would overwrite the official Orca's Accessibility/Screen Recording grants in TCC.
const COMPUTER_USE_HELPER = 'Orca Computer Use.app'

module.exports = {
  ...base,
  appId: identity.appId,
  productName: identity.productName,
  // Why Oficina's own scheme: Orca's Info.plist claims orca://, and the later install wins the handler.
  protocols: [{ name: identity.productName, schemes: [identity.urlScheme] }],
  // Why: Electron derives its default userData folder from package.json before any app code runs.
  extraMetadata: { ...base.extraMetadata, productName: identity.productName },
  // Why: local e2e runs leave gitignored test-results/ and playwright-report/ in the checkout, and the
  // upstream file list would pack them into app.asar. tests/ is already excluded upstream.
  files: [...base.files, '!test-results{,/**/*}', '!playwright-report{,/**/*}'],
  // Why null: no publish block means no app-update.yml, so nothing can point at stablyai releases.
  publish: null,
  mac: {
    ...base.mac,
    // Why: claiming Markdown/CSV "Open With" rows would register the fork with LaunchServices next to Orca.
    fileAssociations: [],
    // Why null: scripts/oficina-local.mjs signs the bundle with the local identity, inside-out.
    identity: null,
    extraResources: base.mac.extraResources.filter(
      (resource) => resource.to !== COMPUTER_USE_HELPER
    ),
    target: [{ target: 'dir', arch: ['arm64'] }]
  }
}
