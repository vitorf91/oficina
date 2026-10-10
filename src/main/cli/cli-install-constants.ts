import { OFICINA_IDENTITY } from '../../shared/oficina-identity'

// Why not `orca`: the fork's global command must never replace the official Orca's symlink.
export const DEFAULT_MAC_COMMAND_PATH = `/usr/local/bin/${OFICINA_IDENTITY.cliCommandName}`
export const DEV_COMMAND_NAME = 'orca-dev'
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000
