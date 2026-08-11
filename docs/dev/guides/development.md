# Development

## Prerequisites

- Go 1.26.5 or later in the 1.26 line.
- Node.js 22 or later and npm for frontend build-time tooling.

Install frontend dependencies once:

```sh
npm --prefix frontend ci
```

Run all repository checks:

```sh
scripts/check.sh
```

This installs the locked frontend dependencies, runs Biome lint, Vitest, the
strict TypeScript/Vite production build, Go formatting checks, package tests,
the race detector, `go vet`, and one native embedded build.

For the real-browser lifecycle and visual smoke check, install the workspace
browser once and run the separate gate:

```sh
PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright npm --prefix frontend exec playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright npm --prefix frontend run test:e2e
```

This starts the compiled DiskOrbit executable with automatic browser opening
disabled, consumes its short-lived bootstrap in headless Chromium, verifies the
connected, synthetic-scan, navigation, report, responsive, and Quit flows, and
writes ignored desktop/narrow screenshots under `.cache/playwright-screenshots/`.

Build the frontend and native executable directly:

```sh
npm --prefix frontend run build
GOCACHE=$PWD/.cache/go-build go build -o build/diskorbit ./cmd/diskorbit
```

The Node toolchain is required only to compile embedded assets. Running the
resulting executable requires no Node, Python, Java, browser extension, or
desktop webview runtime.

Release policy, native target runners, archive naming, and the remaining
licence blocker are documented in
[`../ops/release-governance.md`](../ops/release-governance.md). The release-note
extractor can be checked without publishing with
`scripts/release-notes.sh Unreleased`. `scripts/package-artifacts.sh` is a
Linux publishing helper that expects the six workflow binary directories; it
does not build or upload anything itself.
