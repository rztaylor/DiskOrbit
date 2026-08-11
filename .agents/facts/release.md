# Release facts

- Maturity: pre-release, with no compatibility promise before v1.0.0.
- Versioning: Semantic Versioning; tags use `vMAJOR.MINOR.PATCH`.
- Changelog: `CHANGELOG.md`; release governance:
  `docs/dev/ops/release-governance.md`.
- Release notes are curated from the matching changelog section, not raw commit
  history.
- Intended artifacts: Windows, macOS, and Linux for amd64 and arm64, packaged
  as one executable per target with SHA-256 checksums. Archive names use
  `diskorbit_<version>_<os>_<arch>`; Windows uses `.zip`, while macOS and Linux
  use `.tar.gz`.
- Signing and notarisation are optional future enhancements and are not build
  requirements. Checksums provide integrity but not publisher identity.
- Hosted workflow: `.github/workflows/release.yml`, triggered by `v*` tags. It
  validates policy and a real browser, builds on six native GitHub-hosted
  runners, packages on Ubuntu, verifies checksums, and publishes with the
  workflow token. Ordinary validation requires no credentials.
- Releases are tag-driven only after all declared checks pass. Failed or partial
  uploads must be corrected with a new candidate rather than silently reused.
- Decision needed: the project owner must select and add an open-source licence
  before the first public release. The hosted workflow enforces this blocker.
