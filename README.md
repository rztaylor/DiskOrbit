<p align="center">
  <img src="assets/branding/diskorbit-1024.png" alt="DiskOrbit" width="160" height="160">
</p>

# DiskOrbit

DiskOrbit is a local-only disk usage analyser for Windows, macOS, and Linux.
It turns a directory scan into an explorable radial map, a synchronised lazy
tree and sortable table, and bounded local reports that answer a simple
question: **what is using my disk space?**

The distributed application is one native Go executable with its React
frontend embedded. It uses the existing browser through
[Singleserve](https://github.com/rztaylor/singleserve); it does not embed a
webview, require Node at runtime, create an account, send telemetry, or offer
destructive filesystem operations.

## What works

- Bounded, cancellable scanning with honest progressive totals and warning
  counts; only one scan runs at a time.
- Allocated size by default, with a logical-size alternate view and unknown
  allocated measurements shown as unknown rather than replaced with logical
  size.
- A bounded startup launcher that uses platform-aware standard folders and
  recognizes installed cloud-sync locations without recursively searching the
  home directory.
- A live D3 radial partition that refreshes during scanning: unsettled branches
  remain monochrome and completed subtrees gain stable branch colours.
- Persisted chart controls for 2–12 rings (seven by default), a 200–4,000 item
  budget (4,000 by default), directory expansion, per-directory resolution,
  small-segment pruning, spiky or filled omitted geometry, segment ordering,
  folder/file gaps, and individual large-file visibility by count or size.
- Five colour encodings: stable folder branches, single-hue shades, a two-colour
  size gradient, rainbow wash, and conservative image/video/audio/document/code/
  archive/software file-type groups derived from complete retained subtrees.
- Directory drill-down, clickable centre-up navigation, breadcrumbs, keyboard
  focus, and exact bounded reconciliation at a parent ring or in `Other`.
- Optional free and unaccounted-used wedges for volume-root scans with known
  capacity, available in the allocated-size chart without changing measured
  node values.
- A persistent directory tree beside full-area Chart, sortable Contents, and
  Insights tabs that share the current path; Escape returns data views to the
  chart.
- A transient Review list at the bottom of Browse for collecting files and
  folders from the chart, tree, Contents, or Insights by drag-and-drop or named
  actions. It consolidates nested selections, shows measured totals, and
  provides selection and native reveal actions without changing the filesystem.
- A card-first startup launcher for the home directory, existing familiar
  folders, and deduplicated local or mounted network volumes, with a read-only
  modal folder browser and manual-path fallback; the header brand returns
  finished scans to this launcher.
- An accessible five-category Settings page for theme, default allocated/logical
  measurement, capacity display, and chart behavior; plus a scrollable scan
  coverage drawer with exact issue groups, bounded examples, and fatal errors.
- Native reveal-in-file-manager actions.
- Largest-file, extension, and subtree summary reports plus streaming JSON and
  CSV export after a scan reaches a terminal state, reachable directly or from
  a chart segment's actions menu.
- Authenticated loopback-only browser access and clean browser-bound process
  lifetime.
- Build version, commit, and date through `--version` and the authenticated
  status API.

Visual loading is deliberately bounded by the selected item budget in addition
to ring, breadth, segment, and file controls. The loader reserves room for later
rings so a broad root cannot consume the whole budget. Smaller, hidden, or
not-yet-loaded siblings either combine into an exact `Other` segment or stop at
their solid parent ring to form the selected spiky-gap style; the complete scan
tree is never sent to the browser as one document. Chart navigation pauses
while a scan is active, but hover detail and the live completion colours keep
the scan observable.

Display preferences are saved as `DiskOrbit/settings.json` under the operating
system's user configuration directory: `~/Library/Application Support` on
macOS, `%AppData%` on Windows, or `$XDG_CONFIG_HOME`/`~/.config` on Linux. This
file contains only appearance and chart choices—not scan paths, results,
credentials, or filesystem history. DiskOrbit does not use browser Web Storage.

## Run from source

Prerequisites:

- Go 1.26.5 or later in the 1.26 release line;
- Node.js 22 or later and npm at build time;
- a modern installed browser.

```sh
npm --prefix frontend ci
npm --prefix frontend run build
GOCACHE=$PWD/.cache/go-build go run ./cmd/diskorbit [path]
```

Node is not needed after the executable has been built. The optional path is
canonicalised and validated before the browser opens. Without a path, the
startup screen offers bounded scan choices discovered locally without reading
their contents; selecting a card starts that scan directly.

```text
Usage: diskorbit [options] [path]

--debug       show non-secret server, scan, warning, and shutdown diagnostics
--help        show command help
--version     show embedded build information
--workers N   bound scanner concurrency (0 selects the automatic default)
```

If the browser cannot be opened automatically, DiskOrbit prints one
short-lived manual URL to stderr. Treat that URL as a temporary secret and open
it within two minutes.

## Build and test

Run the full local gate—frontend lint, tests and production build; Go formatting,
tests, race checks and vet; and the native embedded executable build—with:

```sh
scripts/check.sh
```

The separately declared real-browser gate builds the application, scans only a
synthetic temporary fixture, checks desktop/narrow UI and lifecycle behavior,
and captures ignored screenshots:

```sh
PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright npm --prefix frontend exec playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright npm --prefix frontend run test:e2e
```

Windows developers can run the equivalent npm and Go commands in PowerShell;
`make`, Docker, Python, Java, and a desktop webview runtime are not required.
See [`docs/dev/guides/development.md`](docs/dev/guides/development.md).

## Filesystem interpretation

Logical size is apparent file length. Allocated size is obtained from native
metadata when available (`st_blocks × 512` on macOS/Linux and
`GetCompressedFileSizeW` on Windows). Sparse files, compression, allocation
units, copy-on-write clones, metadata, and cloud or network filesystems can make
allocated totals differ from physical space actually reclaimable.

Symbolic links and Windows reparse points discovered beneath the selected root
are represented but not followed; an explicitly selected directory alias can
serve as the root. Traversal stays on the selected filesystem by default when a
stable device identity is available. Repeated paths to a directory with the
same stable filesystem identity are traversed once, preventing macOS APFS
firmlink views such as `/Users` and `/System/Volumes/Data/Users` from being
counted twice. Hard-linked file entries remain counted separately, so totals
describe apparent per-entry usage—not deduplicated physical storage. Filesystem
contents may also change while a scan is running.

See [`docs/filesystem-semantics.md`](docs/filesystem-semantics.md) for the full
measurement and uncertainty contract.

## Safety and privacy

- Singleserve provides a loopback-only, per-launch authenticated origin.
- Filesystem data stays in the local Go process and is never sent to a cloud
  service.
- Reveal actions accept retained scan node IDs; the browser cannot submit an
  arbitrary path for native execution.
- The per-scan Review list retains only bounded node projections in browser
  memory and is cleared when the scan changes; it does not persist paths or
  perform cleanup.
- There is no telemetry, analytics, advertising, account, or update check.
- Delete, trash, move, rename, permission changes, repair, and arbitrary command
  execution are explicitly out of scope.

Architecture and API ownership are documented in
[`docs/architecture.md`](docs/architecture.md).

## Releases

CI validates pull requests and `main`. A `vMAJOR.MINOR.PATCH` tag drives six
native GitHub-hosted builds for Windows, macOS, and Linux on amd64 and arm64.
Release archives use `diskorbit_<version>_<os>_<arch>` and include a
`SHA256SUMS` file. Builds are currently unsigned and not notarised, so operating
systems may display an unknown-publisher warning; checksums verify integrity,
not publisher identity.

The canonical project mark and its approved concept reference live under
[`assets/branding`](assets/branding), with ready-to-use Windows, macOS, and
Linux icon files under [`assets/packaging`](assets/packaging). These assets are
prepared for future desktop packaging; current release archives remain the
terminal executables described above.

Public publishing is intentionally blocked until the project owner adds the
selected open-source `LICENSE`. No rights beyond those provided by applicable
law should be inferred before that file exists.
