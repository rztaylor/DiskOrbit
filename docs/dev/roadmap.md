# DiskOrbit roadmap

DiskOrbit is built in vertical increments that keep the executable runnable
while the scanner and visualisation mature.

## Active execution sequence

There are no pending implementation items in the initial milestone sequence.
The application foundation, bounded scanner, progressive browser, radial
visualisation, synchronised directory navigation, platform semantics, local
reporting, and release engineering are implemented. Their durable behavior now
lives in the architecture, filesystem, development, decision, release, and
changelog documents.

## First public release readiness

The remaining work is release preparation rather than product implementation:

- `CHANGELOG.md` must receive a dated initial version section before its
  matching `vMAJOR.MINOR.PATCH` tag is created.

The owner-selected MIT `LICENSE` and public GitHub repository are in place.

After those owner decisions are complete, run the full local and real-browser
release gates documented in
[`release governance`](ops/release-governance.md) before tagging. Do not create
a new implementation milestone merely to track release ceremony.

The [`app-foundation`](roadmap-items/app-foundation.md) brief remains because it
records the unresolved generic Singleserve drain improvement. The
[`bounded-scanner`](roadmap-items/bounded-scanner.md) brief remains because
unique hard-link/clone ownership is explicitly deferred. Neither is active
work.

Destructive filesystem operations remain outside the roadmap.
