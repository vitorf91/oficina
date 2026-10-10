import { spawnSync } from 'node:child_process'

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result
}

const gitLines = (cwd, args) => git(cwd, args).stdout.split('\n').filter(Boolean)

/**
 * Merges `tag` into `base` with a merge commit on a new `branch` and leaves it checked out.
 * Why the branch comes last: on a conflict the merge is aborted and the checkout is put back,
 * so a failed sync leaves no half-merged tree and no stray branch.
 */
export function mergeTagOntoNewBranch({ cwd, base, tag, branch, message }) {
  const [startBranch = ''] = gitLines(cwd, ['branch', '--show-current'])
  const [startSha] = gitLines(cwd, ['rev-parse', 'HEAD'])
  git(cwd, ['switch', '--detach', base])
  const merge = git(cwd, ['merge', '--no-ff', '--no-edit', '-m', message, tag], {
    allowFailure: true
  })
  if (merge.status === 0) {
    git(cwd, ['switch', '-c', branch])
    return { merged: true, conflicts: [], output: '' }
  }
  const conflicts = gitLines(cwd, ['diff', '--name-only', '--diff-filter=U'])
  git(cwd, ['merge', '--abort'], { allowFailure: true })
  git(cwd, startBranch ? ['switch', startBranch] : ['switch', '--detach', startSha])
  return { merged: false, conflicts, output: `${merge.stdout}${merge.stderr}`.trim() }
}
