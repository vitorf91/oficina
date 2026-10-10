// Pure decisions for oficina-sync.mjs: which upstream release to merge, and which tests guard Oficina.
// Why a module of its own: the git/gh calls stay in the script; these take plain lists and are unit-tested.

const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/

/** `v1.4.224` -> [1, 4, 224]; anything else (rc tags, mobile tags, junk) -> null. */
export function parseStableTag(tag) {
  const match = STABLE_TAG.exec(tag)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function compareStableTags(a, b) {
  const left = parseStableTag(a)
  const right = parseStableTag(b)
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index]
    }
  }
  return 0
}

export function newestStableTag(tags) {
  const stable = tags.filter((tag) => parseStableTag(tag))
  return stable.length === 0 ? null : stable.sort(compareStableTags).at(-1)
}

/**
 * mergedTags: every tag reachable from the Oficina branch (`git tag --merged`).
 * releaseTags: tags of published, non-draft, non-prerelease upstream releases.
 * Returns the release to merge next, or null when the branch already has the newest one.
 */
export function pickSyncTag({ mergedTags, releaseTags }) {
  const lastMerged = newestStableTag(mergedTags)
  if (!lastMerged) {
    throw new Error('No stable upstream release tag (vX.Y.Z) is merged into the Oficina branch.')
  }
  const newer = releaseTags.filter(
    (tag) => parseStableTag(tag) && compareStableTags(tag, lastMerged) > 0
  )
  return { lastMerged, tag: newestStableTag(newer) }
}

const UNIT_TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const UNIT_TEST_NAME = /oficina|workspace-split|workspace-pane/
const E2E_SPEC_FILE =
  /^tests\/e2e\/(?:workspace-split-[^/]*|workspace-pane-header|oficina-[^/]*)\.spec\.ts$/

// Why by name, from the tracked files: Oficina's own tests need no list to maintain, and a test
// added by the next feature joins the gate by following the naming.
export function selectOficinaUnitTests(trackedFiles) {
  return trackedFiles
    .filter((file) => UNIT_TEST_FILE.test(file) && UNIT_TEST_NAME.test(file.split('/').at(-1)))
    .sort()
}

export function selectOficinaE2eSpecs(trackedFiles) {
  return trackedFiles.filter((file) => E2E_SPEC_FILE.test(file)).sort()
}
