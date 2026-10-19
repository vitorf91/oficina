import { spawnSync } from 'node:child_process'

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result
}

/**
 * Merges `tag` into `base` with a merge commit on a new `branch` and leaves it checked out.
 * Why `mergeBase`: Orca cuts each release on its own branch, so the release `base` last merged is not an
 * ancestor of `tag` and git's own merge base sits far back on main, where every release-only fix conflicts.
 * Measured from that last release, only the lines Oficina changed can conflict.
 * Why merge-tree: the merge is computed without touching the checkout, so a conflict leaves no
 * half-merged tree and no stray branch.
 */
export function mergeTagOntoNewBranch({ cwd, base, tag, branch, message, mergeBase }) {
  const merge = git(
    cwd,
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      '--no-messages',
      ...(mergeBase ? [`--merge-base=${mergeBase}`] : []),
      base,
      tag
    ],
    { allowFailure: true }
  )
  if (merge.status !== 0 && merge.status !== 1) {
    throw new Error(`git merge-tree failed: ${merge.stderr.trim()}`)
  }
  const [tree, ...conflicted] = merge.stdout.split('\n')
  if (merge.status === 1) {
    const end = conflicted.indexOf('')
    return { merged: false, conflicts: end === -1 ? conflicted : conflicted.slice(0, end), tree }
  }
  const commit = git(cwd, ['commit-tree', tree, '-p', base, '-p', tag, '-m', message]).stdout.trim()
  git(cwd, ['switch', '-c', branch, commit])
  return { merged: true, conflicts: [], tree }
}
