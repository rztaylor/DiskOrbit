# DiskOrbit contributor guidance

DiskOrbit is a local-only, cross-platform disk usage analyser distributed as
one Go executable with an embedded browser frontend. Preserve the boundaries
and safety rules in `.agents/facts/` before changing architecture or behavior.

- Follow the active execution sequence in `docs/dev/roadmap.md`.
- Keep filesystem discovery, scan orchestration, HTTP, lifecycle, and browser
  presentation separate.
- Treat the browser as an untrusted boundary. All application API calls must
  use Singleserve authentication; never expose its credentials.
- DiskOrbit is analysis-only. Do not add delete, move, rename, permission,
  repair, shell-execution, telemetry, account, or cloud behavior.
- Use feature branches and focused changes. Update facts, docs, tests, roadmap,
  and changelog when their declared contracts change.
- Run `scripts/check.sh` before handing off a change.

