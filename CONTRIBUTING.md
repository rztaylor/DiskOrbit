# Contributing to DiskOrbit

Thanks for helping improve DiskOrbit. Keep changes focused and preserve its
local-only, analysis-only safety boundary.

## Before changing code

1. Read `AGENTS.md` and the relevant facts under `.agents/facts/`.
2. Check `docs/dev/roadmap.md` for the active execution sequence.
3. Create a `feature/<short-description>` branch from `main`.
4. Keep filesystem discovery, scanning, HTTP, lifecycle, and browser
   presentation responsibilities separate.

Do not add delete, trash, move, rename, permission-changing, repair,
shell-execution, telemetry, account, or cloud-service behavior. Treat the
browser as untrusted: application API calls must use Singleserve authentication
and credentials must never be exposed.

## Development setup

Install Go 1.26.5 or later in the 1.26 line and Node.js 22 or later, then run:

```sh
npm --prefix frontend ci
scripts/check.sh
```

The full gate runs frontend lint, unit tests and production build; Go formatting
checks, tests, race tests and vet; and the embedded native build. For visible UI
or lifecycle changes, also run the Playwright gate documented in
[`docs/dev/guides/development.md`](docs/dev/guides/development.md).

Tests must be deterministic and must not inspect the developer's real
filesystem. Use temporary directories, synthetic fixtures, or fakes.

## Documentation and pull requests

Update documentation, facts, tests, roadmap state, release governance, and the
changelog when their declared contracts change. Keep `CHANGELOG.md` entries
curated and user-facing rather than copying commit subjects.

Open a focused pull request with the motivation, important implementation
details, validation performed, documentation and changelog impact, and any
known follow-up work. Do not include private paths, credentials, scan results,
or debug logs without reviewing and redacting them first.
