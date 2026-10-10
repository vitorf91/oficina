import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeTagOntoNewBranch } from './oficina-sync-merge.mjs'

let repo

const git = (...args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()

function commitFile(name, content, message) {
  writeFileSync(join(repo, name), content)
  git('add', name)
  git('commit', '-m', message)
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'oficina-sync-merge-'))
  git('init', '--initial-branch=oficina')
  // Why local config: the merge commit needs an identity, and a global signing setup must not matter here.
  git('config', 'user.name', 'Test')
  git('config', 'user.email', 'test@example.com')
  git('config', 'commit.gpgsign', 'false')
  commitFile('shared.txt', 'upstream line\n', 'base')
  git('tag', 'v1.0.0')
  git('switch', '--detach', 'v1.0.0')
  commitFile('shared.txt', 'upstream line, changed upstream\n', 'upstream change')
  git('tag', 'v1.0.1')
  git('switch', 'oficina')
})

afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('mergeTagOntoNewBranch', () => {
  it('merges a clean tag with a merge commit on a new branch', () => {
    commitFile('oficina-only.txt', 'fork file\n', 'fork change')
    const result = mergeTagOntoNewBranch({
      cwd: repo,
      base: 'oficina',
      tag: 'v1.0.1',
      branch: 'sync/v1.0.1',
      message: 'chore(sync): merge Orca v1.0.1'
    })
    expect(result).toEqual({ merged: true, conflicts: [], output: '' })
    expect(git('branch', '--show-current')).toBe('sync/v1.0.1')
    expect(git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3)
    expect(git('merge-base', '--is-ancestor', 'v1.0.1', 'HEAD')).toBe('')
    expect(git('log', '-1', '--format=%s')).toBe('chore(sync): merge Orca v1.0.1')
  })

  it('aborts on a conflict and leaves the checkout, the base and the branch list as they were', () => {
    commitFile('shared.txt', 'upstream line, changed by the fork\n', 'fork change')
    const before = git('rev-parse', 'HEAD')
    const result = mergeTagOntoNewBranch({
      cwd: repo,
      base: 'oficina',
      tag: 'v1.0.1',
      branch: 'sync/v1.0.1',
      message: 'chore(sync): merge Orca v1.0.1'
    })
    expect(result.merged).toBe(false)
    expect(result.conflicts).toEqual(['shared.txt'])
    expect(git('status', '--porcelain', '--untracked-files=all')).toBe('')
    expect(git('branch', '--show-current')).toBe('oficina')
    expect(git('rev-parse', 'HEAD')).toBe(before)
    expect(git('branch', '--list', 'sync/*')).toBe('')
    expect(() => git('rev-parse', '-q', '--verify', 'MERGE_HEAD')).toThrow()
  })

  it('returns to a detached checkout when that is where it started', () => {
    commitFile('shared.txt', 'upstream line, changed by the fork\n', 'fork change')
    git('switch', '--detach', 'v1.0.0')
    const result = mergeTagOntoNewBranch({
      cwd: repo,
      base: 'oficina',
      tag: 'v1.0.1',
      branch: 'sync/v1.0.1',
      message: 'chore(sync): merge Orca v1.0.1'
    })
    expect(result.merged).toBe(false)
    expect(git('branch', '--show-current')).toBe('')
    expect(git('rev-parse', 'HEAD')).toBe(git('rev-parse', 'v1.0.0'))
  })
})
