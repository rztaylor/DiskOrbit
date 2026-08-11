# Testing facts

- Full local validation: `scripts/check.sh`.
- Frontend checks: `npm --prefix frontend run lint`,
  `npm --prefix frontend test`, and `npm --prefix frontend run build`.
- Backend checks use a workspace cache:
  `GOCACHE=$PWD/.cache/go-build go test ./...`.
- Race validation uses:
  `GOCACHE=$PWD/.cache/go-build go test -race ./...`.
- Tests must be deterministic, avoid the developer's real filesystem, and use
  temporary directories or fakes for filesystem behavior.
- Generated frontend assets are a prerequisite for integration tests that
  exercise `internal/webui` or the complete application handler.
- Real-browser lifecycle checks are required before release; ordinary package
  tests must not require a browser, external service, or live network.
- Install the cached Chromium test browser with
  `PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright npm --prefix frontend exec playwright install chromium`,
  then run `PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright npm --prefix frontend run test:e2e`.
- `.github/workflows/ci.yml` runs the full local gate plus the Playwright smoke
  test on pull requests and pushes to `main`.
