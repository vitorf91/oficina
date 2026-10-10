# Oficina

Oficina is a personal fork of [Orca](https://github.com/stablyai/orca) (MIT). It exists to put whole workspaces side by side in one window. Everything else stays stock Orca so merges from upstream stay cheap.

This page covers step 0: Oficina builds and runs as its own app, next to the installed Orca, without touching anything Orca owns.

## What Oficina changes vs Orca

- **Own identity.** One module, `src/shared/oficina-identity.ts`, owns every machine-global name (table below). `config/oficina-identity.cjs` mirrors it for electron-builder; `src/main/startup/oficina-identity.test.ts` fails if they drift.
- **Agent status hooks are off.** Orca's installers write `~/.orca/agent-hooks` and the Claude, Codex, Cursor, Gemini... user configs. Those belong to the official Orca, so the fork never writes or removes them (`isAgentStatusHooksEnabled` is false, installers and removers are no-ops).
- **No auto-update.** The updater never loads, no `app-update.yml` is packaged, and the agent-state-rules download from stablyai release assets is off.
- **Own global CLI command.** Settings can register `oficina`, never `orca` (Orca's installer would otherwise reclaim any `*.app` launcher symlink, including Orca's).
- **No computer-use helper and no file associations** in the bundle (shared bundle id with Orca; extra Open-With rows).
- **Packaging lives beside upstream.** `config/electron-builder.oficina.config.cjs` wraps the untouched upstream builder config; `config/scripts/oficina-local.mjs` builds, signs, installs and seeds data.
- **Tests.** `config/scripts/vitest-upstream-identity-setup.ts` runs the inherited suites against upstream names (`.orca`, 6768, hooks on) so they stay unedited. `oficina-*` tests pin the fork's real values.

## Identity

| Item | Orca | Oficina |
| --- | --- | --- |
| Product name | Orca | Oficina |
| Bundle id / AUMID | `com.stablyai.orca` | `com.vitorf91.oficina` |
| Data folder | `~/Library/Application Support/orca` | `~/Library/Application Support/Oficina` (dev: `oficina-dev`) |
| Home folder (credentials, keybindings) | `~/.orca` | `~/.oficina` |
| URL scheme | `orca://` | `oficina://` |
| Mobile pairing / runtime WebSocket port | 6768 (dev 6769) | 6778 (dev 6779) |
| Global CLI command | `orca` | `oficina` |
| Keychain item | `orca Safe Storage` | `Oficina Safe Storage` |
| Signing identity | Developer ID | `Oficina Local Signing` (self-signed) |

## Build and install locally

Run everything through Node 24 (`fnm exec --using 24 -- ...`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`). The machine default Node 26 is not supported.

```sh
fnm exec --using 24 -- pnpm install --frozen-lockfile                 # root
(cd mobile && fnm exec --using 24 -- pnpm install --frozen-lockfile)  # mobile web bundle needs its own install
fnm exec --using 24 -- node config/scripts/oficina-local.mjs build    # JS build, helpers, arm64 .app, signing
fnm exec --using 24 -- node config/scripts/oficina-local.mjs install  # copies to /Applications/Oficina.app (--replace to overwrite)
fnm exec --using 24 -- node config/scripts/oficina-local.mjs import-orca-data
```

A clean build took 110 s on a 10-core M-series Mac (typecheck+JS 38 s, helpers 10 s, electron-builder 30 s, signing 33 s), plus 6 s for the root install and 24 s for the mobile install.

`build` runs `build:desktop`, which ends in `install-dev-cli.mjs`; it tries to link `/usr/local/bin/orca-dev` and is refused without sudo. That is harmless and leaves `orca` alone.

### Signing identity (once)

The bundle is signed with a self-signed identity so macOS sees the same designated requirement on every rebuild and keeps folder-access grants. No hardened runtime, no notarization.

```sh
cat > openssl.cnf <<'EOF'
[req]
distinguished_name=dn
x509_extensions=v3
prompt=no
[dn]
CN=Oficina Local Signing
[v3]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
EOF
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 3650 -config openssl.cnf
PW=$(openssl rand -hex 12)
openssl pkcs12 -export -inkey key.pem -in cert.pem -out id.p12 -name "Oficina Local Signing" \
  -passout pass:$PW -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1
security import id.p12 -k ~/Library/Keychains/login.keychain-db -P "$PW" -T /usr/bin/codesign
# then delete key.pem and id.p12; the key stays in the keychain
```

`security find-identity -p codesigning` lists it as `CSSMERR_TP_NOT_TRUSTED`; that is expected for a self-signed certificate and does not stop `codesign`. The designated requirement is `identifier "com.vitorf91.oficina" and certificate leaf = H"<sha1 of the certificate>"`.

### Data import

`import-orca-data` reads the official Orca's `profiles/local-default/orca-data.json` (read-only) and writes a filtered `orca-data.json` into Oficina's data folder. Oficina imports it into its own SQLite profile on first launch.

- Kept: repos, projects, project groups and host setups, folder workspaces, settings, a few sidebar view preferences.
- Dropped: sessions, terminals, PTY ids, worktree metadata, SSH targets, account/auth settings, API keys and cookies, proxy URL, mobile pairing, telemetry consent, `agentDefaultEnv`.
- A copy is refused if any kept key name or value looks like a secret, or points into Orca's folders. Orca's device tokens, E2EE keys and account session files are never copied.
- It refuses to run over an existing Oficina profile.

## Audit: what Orca writes outside its own data folder

| Item | Where (file:line) | Handling in Oficina |
| --- | --- | --- |
| App name, data folder | `configure-process.ts:191`, `main-process-ready-foundation.ts:105`, package.json `productName` | `Oficina`; the packaged folder comes from `productName` set by `extraMetadata` in the builder wrapper |
| Bundle id, AUMID | `dev-instance-identity.ts:6`, builder `appId` | `com.vitorf91.oficina` |
| URL scheme `orca://` | builder `protocols` (Info.plist), `index.ts:97` (`open-url`, skill-share only); no `setAsDefaultProtocolClient` anywhere | `oficina://`. Pairing QR codes keep the `orca://pair` text (`shared/pairing.ts:26`) because the mobile app expects it; it is never registered on the Mac |
| File associations (md, csv, tsv) | builder `mac.fileAssociations` | none |
| Auto-updater | `updater/*.ts` guards, `updater-setup.ts:143` and feed URL `:164`, builder `publish` (writes `app-update.yml`) | off; `publish: null`; guards return early |
| Agent-state-rules download | `agent-state-rules-live-update.ts:124` (GitHub release asset, every 4 h) | off |
| `orca` CLI symlink | `cli-install-constants.ts:4`, `ipc/cli.ts:130`, serve auto-install `main-process-runtime-launch.ts:178`, reclaim rule `cli-command-inspection.ts:62` | command is `oficina`; Oficina terminals still get their own `Resources/bin` first on PATH |
| CLI launcher | `resources/darwin/bin/orca:24` hardcoded `MacOS/Orca` | reads `CFBundleExecutable` |
| CLI runtime pointer (`orca-runtime.json`) | CLI default folder `cli/runtime/metadata.ts` | Oficina folder, so a shell CLI never reaches Orca's runtime |
| Agent hooks (Claude, Codex, Cursor, Gemini, Grok, ... user configs and `~/.orca/agent-hooks`) | `main-process-ready-runtime.ts:104-123`, `managed-agent-hook-controls.ts:144`, `main-process-quit.ts:170` (removes Grok hooks on quit), `codex-hook-local-install.ts:156` | off (`agent-status-hooks-setting.ts:15`); see Impact |
| `~/.orca` credential and key stores (Linear, Jira, Bitbucket, MiniMax, OpenAI speech, Z Code, keybindings, agent-teams shim) | `linear-credential-paths.ts:9`, `site-credential-store.ts:30`, `credential-store.ts:55`, `minimax-cookie-store.ts:20`, `openai-api-key-store.ts:17`, `zcode-plan-api-key-store.ts:20`, `encrypted-api-key-file-store.ts:42`, `keybinding-file.ts:29`, `claude-agent-teams-shim-env.ts:88` | `~/.oficina` |
| Mobile pairing listener | `runtime-rpc-pairing-types.ts:18`, dev `main-process-runtime-launch.ts:78` | 6778 / 6779 |
| Daemon socket, token, pid | `daemon-spawner.ts:71` (`<userData>/daemon`; named pipe on Windows hashes the folder) | already per data folder |
| Single-instance lock | `single-instance-lock.ts:44` | scoped to the data folder |
| Launch agents, login items | none found (`setLoginItemSettings`, LaunchAgents) | n/a |
| Keychain | Electron `safeStorage` ("`<CFBundleName>` Safe Storage"); `macos-keychain/generic-password.ts:132` writes only on account-linking clicks | `Oficina Safe Storage`; Orca's `orca Safe Storage` is untouched |
| Crash reports | `crashpad-capture.ts:68` (`uploadToServer: false`) | unchanged, nothing uploaded |
| Telemetry | `telemetry/client.ts:29` (PostHog key is a build-time define) | no key in local builds, so nothing is sent |
| `defaults` domain (press and hold) | `macos-press-and-hold-default.ts:46` | writes `com.vitorf91.oficina`; before this change an Orca-id bundle would have written Orca's domain |
| TCC rows | helper bundle id `com.stablyai.orca.computer-use` (`build-computer-macos.mjs:17`), notification helper (`build-notification-status-macos.mjs:31`) | computer-use helper omitted; notification helper built with Oficina's id |
| Logs folder fallback | `logs-directory.ts:2` (hardcoded `Orca`, the same folder on a case-insensitive disk) | Oficina folder |
| Skills and CLI from the "Install CLI & Skills" tip | renderer feature tip, runs only on a click | not run at startup; avoid clicking it in Oficina |
| Remote SSH hosts (`~/.orca-remote`, remote hook installs) | relay and hook services | unchanged; both apps share a remote host's folders |

## Coexistence check

Run this after any sync from upstream:

1. Snapshot (hash, size, mtime) the files Orca owns: the `~/.orca` tree, the user agent configs (`~/.claude/settings.json`, `~/.codex/{config.toml,hooks.json}`, `~/.cursor/hooks.json`...), the `/usr/local/bin/orca` symlink, `Orca.app`'s plist/executable/seal, Orca's preferences plist and runtime pointer files; plus the LaunchServices handler for `orca://` and `oficina://`, the `orca Safe Storage` keychain attributes and any Orca or Oficina launch agents.
2. Launch Oficina, open a terminal in a worktree, quit it (its own PIDs only).
3. Snapshot again and diff. Expected: identical, `orca://` still `com.stablyai.orca`, only `Oficina Safe Storage` new.

The first run of this check wrapped Oficina in `sandbox-exec` with a profile that denies writes to those paths. Chromium cannot nest its own sandbox inside that one, so the wrapped run used `--no-sandbox`; a normal launch does not.

## Impact and limits

- **No hook-driven agent status.** The sidebar falls back to the title-based status. Orca's own globally installed hooks do nothing in Oficina terminals, because Oficina does not export the hook endpoint to them.
- **Branding in the renderer is still "Orca"** (page title, in-app labels, tips). The app menu, Dock name and bundle are Oficina.
- **Computer-use is absent** from this build.
- **First launch from Finder or the Dock** asks macOS for Documents access once (the repos live there). Click Allow; the stable signature keeps the grant across rebuilds.
- **Self-signed, not notarized.** Gatekeeper would reject a downloaded copy; a locally built one runs.

## Keeping upstream merges cheap

Upstream files changed for the identity are one-line swaps to `OFICINA_IDENTITY` (see `git diff v1.4.223 --stat`). `config/electron-builder.config.cjs` is untouched. After a sync, rerun `pnpm tc`, the unit tests and `oficina-local.mjs build`, then check the coexistence checklist: `orca://` still resolves to Orca, `/usr/local/bin/orca` still points into Orca.app, and `~/.orca` and the user agent configs are unchanged after a launch.
