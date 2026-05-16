# Changelog

## [0.1.14](https://github.com/qwrobins/aether/compare/v0.1.13...v0.1.14) (2026-05-16)

### Features

* Add Tailscale Taildrop support
  * Add a built-in Tailscale destination that lists Taildrop-capable tailnet devices instead of remote files.
  * Queue local file sends to Taildrop devices with file-level transfer status and Taildrop history.
  * Add Linux receive collection through `tailscale file get` into the current local folder.
  * Surface missing, unavailable, offline, and platform-specific Taildrop states through typed IPC.

## [0.1.13](https://github.com/qwrobins/aether/compare/v0.1.12...v0.1.13) (2026-05-14)

### Automation

* Dispatch release workflow with default token ([#33](https://github.com/qwrobins/aether/pull/33))
  * remove the invalid RELEASE_TOKEN dependency from prepare-release
  * use the default workflow token for checkout, metadata lookup, and atomic release commit/tag push
  * add workflow_dispatch to the release workflow and explicitly dispatch it for the created tag
  * update README release automation docs
* Fix prepare release checkout authentication ([#32](https://github.com/qwrobins/aether/pull/32))
  * let actions/checkout use the default workflow token for repository fetches
  * validate RELEASE_TOKEN before release publishing work begins
  * apply RELEASE_TOKEN only for the final release commit/tag push so tag pushes still trigger the Release workflow
* Add macOS signing and notarization workflow ([#31](https://github.com/qwrobins/aether/pull/31))
  * add environment-gated Electron Forge macOS signing and notarization config
  * import Developer ID Application certificates during macOS release builds when secrets are configured
  * document required GitHub secrets and signed release setup

## [0.1.12](https://github.com/qwrobins/aether/compare/v0.1.11...v0.1.12) (2026-04-30)

### Bug Fixes

* Fix S3 file downloads ([#30](https://github.com/qwrobins/aether/pull/30))
  * Fixes S3 single-file downloads silently doing nothing.

## [0.1.11](https://github.com/qwrobins/aether/compare/v0.1.10...v0.1.11) (2026-04-30)

### Automation

* Fix release bump detection ([#29](https://github.com/qwrobins/aether/pull/29))
  * Fix release preparation so bump detection can use associated GitHub PR metadata, matching the release-note generation path.
  * Treat non-release PRs with non-conventional plain-English titles as patch releases, while skipping docs/test/ci/build/chore-only titles.
  * Allow `npm run release:prepare -- --dry-run` to query PR metadata so local release simulations match CI behavior.
* Improve release notes from merged PRs ([#26](https://github.com/qwrobins/aether/pull/26))
  * Regenerate prepared-release changelog entries from the actual merged PRs in the tag range instead of stale Release Please metadata.
  * Skip Release Please metadata PRs and standalone chore commits in generated notes.
  * Pull concise details from PR `## Summary` sections and group release workflow changes under Automation.
  * Correct the committed `0.1.10` changelog entry to match the updated GitHub release notes.

### Miscellaneous

* Revert "[codex] Align TypeScript toolchain" ([#28](https://github.com/qwrobins/aether/pull/28))
  * Reverts qwrobins/aether#27
* Align TypeScript toolchain ([#27](https://github.com/qwrobins/aether/pull/27)) - QWR-96
  * Upgrade TypeScript from 4.5 to 5.9 so the current Vite/React/Node type stack can be parsed and checked.
  * Fix the stricter TypeScript errors exposed in IPC handlers, SFTP transfer adapter typing, renderer S3 guards, and test mocks.
  * Keep runtime behavior unchanged while making `npx tsc --noEmit` a working verification path.

## [0.1.10](https://github.com/qwrobins/aether/compare/v0.1.9...v0.1.10) (2026-04-30)

### Automation

* Fix prepared release tagging ([#25](https://github.com/qwrobins/aether/pull/25))
  * Allows `scripts/prepare-release.mjs` to recover when release metadata is already prepared for a newer package version but the matching tag is missing.
  * Lets the prepare-release workflow continue when there are no metadata changes to commit, so it can create and push the missing tag.
* ci(release): prepare releases from main merges ([#23](https://github.com/qwrobins/aether/pull/23)) - QWR-101
  * Replace the Release Please PR handoff with a direct main-merge release preparation workflow
  * Add scripts to calculate the next semver tag, update package metadata and CHANGELOG.md, and extract release notes from the top changelog entry
  * Keep the asset publishing workflow tag-driven while validating tag/package version alignment and documenting the required RELEASE_TOKEN setup
  * Pin Vitest to NODE_ENV=test and quiet lint import parsing so release validation is deterministic

### Bug Fixes

* Fix transfer reliability and scale ([#24](https://github.com/qwrobins/aether/pull/24)) - QWR-93, QWR-94, QWR-95
  * Fixes QWR-93 by making S3 downloads respect write-stream backpressure while preserving progress, temp-file, rename, and cancellation behavior.
  * Fixes QWR-94 by streaming recursive local, S3, and SFTP expansion with a 10,000-file/object safety cap and rollback on queueing failure.
  * Fixes QWR-95 by returning structured SFTP per-path delete results and surfacing partial failures in the remote delete UI while still refreshing successful deletes.

## [0.1.9](https://github.com/qwrobins/aether/compare/v0.1.8...v0.1.9) (2026-04-29)


### Bug Fixes

* **security:** harden electron boundaries ([bfb15bc](https://github.com/qwrobins/aether/commit/bfb15bcde2ce6ba567487b06fce408478f993ed3))

## [0.1.8](https://github.com/qwrobins/aether/compare/v0.1.7...v0.1.8) (2026-04-03)


### Bug Fixes

* **macos:** replace Full Disk Access prompt with native folder picker ([b71720c](https://github.com/qwrobins/aether/commit/b71720c57528ff9f98091d97d6d56858417feb45))
* **macos:** replace Full Disk Access prompt with native folder picker ([9953ba3](https://github.com/qwrobins/aether/commit/9953ba3e676457b23e25adbbcd35f725cfbbfb61))

## [0.1.7](https://github.com/qwrobins/aether/compare/v0.1.6...v0.1.7) (2026-04-03)


### Bug Fixes

* **macos:** add code signing and notarization to fix damaged-app error ([9af262a](https://github.com/qwrobins/aether/commit/9af262abda5516d6eb5e284afb33d2e87543027b))
* **macos:** address CodeRabbit review feedback on shell:open-external ([1870553](https://github.com/qwrobins/aether/commit/1870553b7f087a3e0f07587c057c4f50f0f159c9))
* **macos:** handle EPERM on protected folders with Full Disk Access prompt ([c131cb8](https://github.com/qwrobins/aether/commit/c131cb8fc622415aae15b95c11d78305df9a7599))
* **macos:** handle EPERM on protected folders with Full Disk Access prompt ([3de0b33](https://github.com/qwrobins/aether/commit/3de0b33c1faf94e3695273cfbcfa8419d635f69f))

## [0.1.6](https://github.com/qwrobins/aether/compare/v0.1.5...v0.1.6) (2026-04-02)


### Bug Fixes

* replace globstar with find for asset collection on macOS ([cea7666](https://github.com/qwrobins/aether/commit/cea7666edb974aa7d9276522d18955d15651e227))
* replace globstar with find for macOS-compatible asset collection ([c9e1418](https://github.com/qwrobins/aether/commit/c9e14182b85e8ac6ad56b16c2a243830c30a6df2))

## [0.1.5](https://github.com/qwrobins/aether/compare/v0.1.4...v0.1.5) (2026-04-02)


### Bug Fixes

* use PAT for release-please to allow downstream workflow triggers ([29a9d89](https://github.com/qwrobins/aether/commit/29a9d89ac974cf5e7c71466cc97ef3301e3a70bf))
* use PAT for release-please to trigger release builds ([50ae39c](https://github.com/qwrobins/aether/commit/50ae39c0571f4c0d3e34fde14d8f9bdbc73a9cc7))

## [0.1.4](https://github.com/qwrobins/aether/compare/v0.1.3...v0.1.4) (2026-04-02)


### Bug Fixes

* correct action versions and switch macOS builds to DMG ([14407bb](https://github.com/qwrobins/aether/commit/14407bb2c556c987aeb5bc48a2e049608159efbe))
* correct action versions and switch macOS builds to DMG ([77a8310](https://github.com/qwrobins/aether/commit/77a831074d5b3f5d56b39bae03a989ad388c2bd5))
* trigger release build from release-please and clean tag format ([55a570c](https://github.com/qwrobins/aether/commit/55a570c7dc885c270c161908c49c710e2f512b27))
* trigger release build on GitHub release event and clean up tag format ([98c0e07](https://github.com/qwrobins/aether/commit/98c0e075df2dba32766121b78d343851e868774c))


### Miscellaneous

* add release-please workflow ([85763c0](https://github.com/qwrobins/aether/commit/85763c08ff5c0cd4e25376810c579e4997ba9b02))
* add release-please workflow ([024f913](https://github.com/qwrobins/aether/commit/024f913c22cb752f4e9772f7f54d8009e1d2d14e))
* generate icon.icns for macOS app icon ([7477a5f](https://github.com/qwrobins/aether/commit/7477a5fa78abd33660f097338c24329d9a123f40))
* **main:** release aether 0.1.3 ([265ddbf](https://github.com/qwrobins/aether/commit/265ddbfa115c878f6d7d54e7200f8b2cde1add10))
* **main:** release aether 0.1.3 ([18f28ce](https://github.com/qwrobins/aether/commit/18f28cebe8cdc4a5da1c1bc48ae10ccc0e6413f5))
* pin release-please action and add config files ([a31147d](https://github.com/qwrobins/aether/commit/a31147dad6eae535b01d5b0092194a4e9299a1d8))

## [0.1.3](https://github.com/qwrobins/aether/compare/aether-v0.1.2...aether-v0.1.3) (2026-04-02)


### Bug Fixes

* correct action versions and switch macOS builds to DMG ([14407bb](https://github.com/qwrobins/aether/commit/14407bb2c556c987aeb5bc48a2e049608159efbe))
* correct action versions and switch macOS builds to DMG ([77a8310](https://github.com/qwrobins/aether/commit/77a831074d5b3f5d56b39bae03a989ad388c2bd5))


### Miscellaneous

* add release-please workflow ([85763c0](https://github.com/qwrobins/aether/commit/85763c08ff5c0cd4e25376810c579e4997ba9b02))
* add release-please workflow ([024f913](https://github.com/qwrobins/aether/commit/024f913c22cb752f4e9772f7f54d8009e1d2d14e))
* generate icon.icns for macOS app icon ([7477a5f](https://github.com/qwrobins/aether/commit/7477a5fa78abd33660f097338c24329d9a123f40))
* pin release-please action and add config files ([a31147d](https://github.com/qwrobins/aether/commit/a31147dad6eae535b01d5b0092194a4e9299a1d8))
