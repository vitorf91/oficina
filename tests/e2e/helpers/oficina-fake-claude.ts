import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getManagedScript } from '../../../src/main/claude/hook-script'
import { getManagedCommand } from '../../../src/main/claude/hook-settings'

export const FAKE_CLAUDE_SESSION_ID = 'oficina-e2e-claude-session'

// A stand-in for the claude CLI: it reports its lifecycle through the hook wrapper the official Orca
// installs, with the same payload fields claude sends, then idles like a REPL waiting for input.
function fakeClaudeScript(home: string): string {
  return `#!/bin/sh
LOG="${home}/fake-claude.log"
SID="${FAKE_CLAUDE_SESSION_ID}"
SOURCE=startup
prev=
for arg in "$@"; do
  if [ "$prev" = "--resume" ]; then
    SID="$arg"
    SOURCE=resume
  fi
  prev="$arg"
done
printf 'ARGV %s\\n' "$*" >> "$LOG"
SLUG=$(printf '%s' "$PWD" | tr '/.' '--')
TRANSCRIPT="${home}/.claude/projects/$SLUG/$SID.jsonl"
mkdir -p "$(dirname "$TRANSCRIPT")"
[ -e "$TRANSCRIPT" ] || printf '{"type":"user","sessionId":"%s","cwd":"%s","message":{"role":"user","content":"say pong"}}\\n' "$SID" "$PWD" > "$TRANSCRIPT"
emit() { printf '%s' "$1" | /bin/sh "${home}/claude-hook-command.sh" >/dev/null 2>&1; }
BASE="\\"session_id\\":\\"$SID\\",\\"transcript_path\\":\\"$TRANSCRIPT\\",\\"cwd\\":\\"$PWD\\""
emit "{$BASE,\\"hook_event_name\\":\\"SessionStart\\",\\"source\\":\\"$SOURCE\\"}"
if [ "$SOURCE" = startup ]; then
  emit "{$BASE,\\"hook_event_name\\":\\"UserPromptSubmit\\",\\"prompt\\":\\"say pong\\"}"
  emit "{$BASE,\\"hook_event_name\\":\\"Stop\\",\\"last_assistant_message\\":\\"pong\\"}"
fi
printf 'FAKE_CLAUDE_READY:%s\\n' "$SID"
while :; do sleep 3600; done
`
}

/**
 * Lays out the official Orca's Claude hook files inside the disposable HOME and a fake `claude` in the
 * directory the app puts first on every terminal's PATH. Why not HOME: macOS `login` hands the shell the
 * real home, so only absolute paths reach the disposable one.
 */
export function installOficinaFakeClaude(args: { home: string; appCliBinDir: string }): {
  logPath: string
} {
  const { home, appCliBinDir } = args
  const scriptPath = path.join(home, '.orca', 'agent-hooks', 'claude-hook.sh')
  mkdirSync(path.dirname(scriptPath), { recursive: true })
  writeFileSync(scriptPath, getManagedScript('local'))
  chmodSync(scriptPath, 0o755)
  writeFileSync(
    path.join(home, 'claude-hook-command.sh'),
    `${getManagedCommand(scriptPath, { neutralJsonWhenMissing: true })}\n`
  )
  mkdirSync(appCliBinDir, { recursive: true })
  const claudePath = path.join(appCliBinDir, 'claude')
  writeFileSync(claudePath, fakeClaudeScript(home))
  chmodSync(claudePath, 0o755)
  return { logPath: path.join(home, 'fake-claude.log') }
}

export function readFakeClaudeArgv(logPath: string): string[] {
  if (!existsSync(logPath)) {
    return []
  }
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('ARGV '))
    .map((line) => line.slice('ARGV '.length))
}
