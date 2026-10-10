// Mirror of src/shared/oficina-identity.ts for CJS tooling that cannot import TypeScript.
// src/main/startup/oficina-identity.test.ts fails if the two drift.
module.exports = {
  productName: 'Oficina',
  appId: 'com.vitorf91.oficina',
  userDataDirName: 'Oficina',
  urlScheme: 'oficina',
  signingIdentityName: 'Oficina Local Signing'
}
