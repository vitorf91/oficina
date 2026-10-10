import { describe, expect, it } from 'vitest'
import {
  compareStableTags,
  newestStableTag,
  parseStableTag,
  pickSyncTag,
  selectOficinaE2eSpecs,
  selectOficinaUnitTests
} from './oficina-sync-selection.mjs'

describe('stable tags', () => {
  it('accepts only vX.Y.Z', () => {
    expect(parseStableTag('v1.4.224')).toEqual([1, 4, 224])
    for (const tag of ['v1.4.224-rc.1', 'v1.4', '1.4.224', 'mobile-android-v0.0.14', 'v1.4.224x']) {
      expect(parseStableTag(tag)).toBeNull()
    }
  })

  it('orders numerically, not as text', () => {
    expect(compareStableTags('v1.4.99', 'v1.4.224')).toBeLessThan(0)
    expect(compareStableTags('v1.10.0', 'v1.9.300')).toBeGreaterThan(0)
    expect(compareStableTags('v2.0.0', 'v2.0.0')).toBe(0)
  })

  it('finds the newest stable tag and ignores everything else', () => {
    expect(newestStableTag(['v1.4.9', 'v1.4.10', 'v1.5.0-rc.1', 'issue-assets-9432'])).toBe(
      'v1.4.10'
    )
    expect(newestStableTag(['_gh-attach-assets', 'v1.4.224-rc.2'])).toBeNull()
  })
})

describe('pickSyncTag', () => {
  const mergedTags = ['v1.4.222', 'v1.4.223', 'v1.5.0-rc.1', 'issue-assets-9432']

  it('derives the last merged release from the tags the branch contains', () => {
    expect(pickSyncTag({ mergedTags, releaseTags: [] })).toEqual({
      lastMerged: 'v1.4.223',
      tag: null
    })
  })

  it('picks the newest published stable release newer than the last merged one', () => {
    const releaseTags = ['v1.4.225', 'v1.4.224', 'v1.4.223', 'v1.4.222']
    expect(pickSyncTag({ mergedTags, releaseTags }).tag).toBe('v1.4.225')
  })

  it('skips releases that are not newer, including older patch lines', () => {
    expect(
      pickSyncTag({ mergedTags, releaseTags: ['v1.4.223', 'v1.3.400', 'v1.4.1'] }).tag
    ).toBeNull()
  })

  it('never picks a tag that is not a published stable release', () => {
    // A release candidate is a tag in git but not in the published, non-prerelease list.
    const releaseTags = ['v1.4.224', 'v1.4.225-rc.1']
    expect(pickSyncTag({ mergedTags, releaseTags }).tag).toBe('v1.4.224')
  })

  it('fails when the branch holds no stable release to measure from', () => {
    expect(() => pickSyncTag({ mergedTags: ['v1.5.0-rc.1'], releaseTags: ['v1.4.224'] })).toThrow(
      /No stable upstream release tag/
    )
  })
})

describe('Oficina test selection', () => {
  const tracked = [
    'config/scripts/electron-builder-oficina-config.test.mjs',
    'config/scripts/oficina-sync-selection.test.mjs',
    'src/main/startup/oficina-identity.test.ts',
    'src/main/ipc/pty/host-env/oficina-report-only-env.test.ts',
    'src/renderer/src/lib/workspace-split-layout.test.ts',
    'src/renderer/src/components/sidebar/worktree-list/drag/pointer-flush.workspace-pane.test.ts',
    'src/renderer/src/components/workspace-split/use-visible-workspace-split.test.tsx',
    'src/renderer/src/components/workspace-split/WorkspacePaneHeader.tsx',
    'src/main/startup/unrelated.test.ts',
    'src/oficina-sibling/unrelated.test.ts',
    'tests/e2e/workspace-split-layout.spec.ts',
    'tests/e2e/workspace-split-folder.spec.ts',
    'tests/e2e/workspace-pane-header.spec.ts',
    'tests/e2e/oficina-agent-status-receiver.spec.ts',
    'tests/e2e/floating-workspace-pane-height.spec.ts',
    'tests/e2e/golden-quit-relaunch-session.spec.ts'
  ]

  it('selects unit tests by file name, not by directory', () => {
    expect(selectOficinaUnitTests(tracked)).toEqual([
      'config/scripts/electron-builder-oficina-config.test.mjs',
      'config/scripts/oficina-sync-selection.test.mjs',
      'src/main/ipc/pty/host-env/oficina-report-only-env.test.ts',
      'src/main/startup/oficina-identity.test.ts',
      'src/renderer/src/components/sidebar/worktree-list/drag/pointer-flush.workspace-pane.test.ts',
      'src/renderer/src/components/workspace-split/use-visible-workspace-split.test.tsx',
      'src/renderer/src/lib/workspace-split-layout.test.ts'
    ])
  })

  it('selects the split, pane-header and agent-status e2e specs only', () => {
    expect(selectOficinaE2eSpecs(tracked)).toEqual([
      'tests/e2e/oficina-agent-status-receiver.spec.ts',
      'tests/e2e/workspace-pane-header.spec.ts',
      'tests/e2e/workspace-split-folder.spec.ts',
      'tests/e2e/workspace-split-layout.spec.ts'
    ])
  })
})
