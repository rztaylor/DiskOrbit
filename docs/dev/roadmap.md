# DiskOrbit roadmap

DiskOrbit is built in vertical increments that keep the executable runnable
while the scanner and visualisation mature.

**MAKE THE USER INTERFACE BEAUTIFUL**

## Active execution sequence

There are no pending implementation items in the initial milestone sequence.
The application foundation, bounded scanner, progressive browser, radial
visualisation, synchronised directory navigation, platform semantics, local
reporting, and release engineering are implemented. Their durable behavior now
lives in the architecture, filesystem, development, decision, release, and
changelog documents.

The first public release is an owner gate rather than an implementation item:
select and add an open-source `LICENSE`, then curate an initial version section
in `CHANGELOG.md` before creating its matching tag.

The [`app-foundation`](roadmap-items/app-foundation.md) brief remains because it
records the unresolved generic Singleserve drain improvement. The
[`bounded-scanner`](roadmap-items/bounded-scanner.md) brief remains because
unique hard-link/clone ownership is explicitly deferred. Neither is active
work.

Destructive filesystem operations remain outside the roadmap.
