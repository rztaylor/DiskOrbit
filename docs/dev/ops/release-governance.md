# Release governance

DiskOrbit is pre-release and follows Semantic Versioning with
`vMAJOR.MINOR.PATCH` tags. Before v1.0, compatibility changes may be made when
they improve safety or architecture, but user-visible changes and known limits
must still be documented.

## Release blockers

A candidate is blocked by:

- a missing owner-selected `LICENSE`;
- a tag that is not valid Semantic Versioning or lacks a matching
  `CHANGELOG.md` section;
- frontend lint, unit test, production build, Go format/test/race/vet, embedded
  executable, or real-browser lifecycle failure;
- undocumented filesystem uncertainty or support limitations;
- a missing Windows, macOS, or Linux amd64/arm64 executable;
- packaging or SHA-256 verification failure;
- exposed credentials, private filesystem data, or a destructive behavior that
  is not explicitly intended and documented;
- an existing GitHub Release for the same tag.

Skipped validation is recorded as a blocker, not treated as passing evidence.
Signing and notarisation are optional future enhancements and must never be
simulated or bypassed. Until they exist, release notes must retain the unsigned
binary warning: checksums establish integrity, not publisher identity.

## Candidate procedure

1. Move curated user-facing notes from `Unreleased` into a dated section named
   for the version, such as `## [0.1.0] - 2026-08-07`.
2. Run `scripts/check.sh`, then the Playwright command documented in
   `docs/dev/guides/development.md`.
3. Confirm the repository contains the selected `LICENSE` and no release
   blocker remains.
4. Create and push the matching `vMAJOR.MINOR.PATCH` tag. Do not invoke the
   hosted workflow through a branch or ad-hoc publish token.
5. `.github/workflows/release.yml` repeats validation, tests the real browser,
   and builds each target on a native GitHub-hosted runner:
   Windows amd64/arm64, macOS amd64/arm64, and Linux amd64/arm64.
6. The publish job packages one executable per archive, creates
   `SHA256SUMS`, verifies every checksum, derives release notes from the exact
   changelog section, and creates the GitHub Release with the workflow token.

Archive names are `diskorbit_<version>_<os>_<arch>`. Windows archives are ZIP;
macOS and Linux archives are tar+gzip. Action dependencies are pinned to commit
SHAs and workflow permissions are read-only except for the final publish job's
`contents: write` grant.

## Failure, re-run, and rollback policy

Build artifacts are immutable and retained for seven days. A failure before
the publish job creates no GitHub Release and must be investigated before a new
candidate. A release is never overwritten or silently repaired: if publishing
partially succeeds or the Release already exists, correct the source and create
a new patch candidate and tag.

Removing a bad public Release or tag is an exceptional owner action and is not
automated by this repository. Document why it happened and direct users to the
replacement. DiskOrbit has no persistent schema or migration in the initial
release, but filesystem interpretation or API compatibility changes still
belong in release notes.

## Current owner setup

The archive convention, MIT licence, and public GitHub repository are settled.
The first public release still requires a dated changelog version and matching
tag after the complete local and real-browser gates pass. The hosted policy job
checks for `LICENSE` before it performs expensive validation or publishes
anything.
