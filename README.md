<p align="center">
  <img src="assets/branding/diskorbit-1024.png" alt="DiskOrbit" width="160" height="160">
</p>

# DiskOrbit

[![CI](https://github.com/rztaylor/DiskOrbit/actions/workflows/ci.yml/badge.svg)](https://github.com/rztaylor/DiskOrbit/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DiskOrbit is a fast, local-only disk usage analyser for Windows, macOS, and
Linux. It turns a folder or volume scan into an explorable radial map backed by
a synchronised directory tree, sortable contents table, and focused reports.

DiskOrbit runs as one native Go executable and opens its embedded interface in
your existing browser. Filesystem data stays on your machine: there is no
account, cloud service, telemetry, runtime Node dependency, or destructive file
operation.

> **Project status:** feature-complete pre-release. Source builds are supported;
> signed installers and public release archives are not available yet.

## Highlights

- Bounded, cancellable scanning with live totals and honest coverage warnings.
- Allocated-size analysis by default, with logical size available when needed.
- An interactive radial chart with drill-down, breadcrumbs, colour modes,
  capacity context, and bounded rendering for very large trees.
- Synchronized Chart, Contents, and Insights views with a lazy directory tree.
- A transient Review list for collecting findings without changing files.
- Largest-file and extension reports plus streaming JSON and CSV export.
- Native reveal-in-file-manager actions using retained scan IDs—not browser
  supplied paths.
- Authenticated loopback-only browser access and clean browser-bound lifetime.
- Persisted appearance and chart preferences, with no saved scan history.

## Run from source

You need Go 1.26.5 or later in the 1.26 line, Node.js 22 or later, npm, and a
modern installed browser.

```sh
git clone https://github.com/rztaylor/DiskOrbit.git
cd DiskOrbit
npm --prefix frontend ci
scripts/build.sh
./build/diskorbit
```

Pass a folder to scan it immediately:

```sh
./build/diskorbit /path/to/folder
```

Node is used only to compile the embedded frontend. The resulting executable
does not require Node, Python, Java, a browser extension, or a webview runtime.

If DiskOrbit cannot open the browser, it prints one short-lived manual URL to
stderr. Treat that URL as a temporary secret and open it within two minutes.

## Using DiskOrbit

Start without a path to choose from familiar folders and detected volumes, or
use **Another folder** for the read-only folder navigator and manual-path
fallback. During a scan, the chart updates as completed subtrees become
authoritative; navigation becomes available when the scan reaches a terminal
state.

The browser workspace provides:

- **Chart** for radial exploration and segment actions;
- **Contents** for exact, sortable children of the selected directory;
- **Insights** for largest files, extension groups, and export;
- **Browse** for the lazy tree and transient Review list; and
- **Settings** for measurement, capacity, geometry, resolution, file, colour,
  and theme preferences.

See [Using DiskOrbit](docs/user/using-diskorbit.md) for the complete workflow
and [Troubleshooting](docs/user/troubleshooting.md) for permissions, browser,
coverage, and measurement questions.

## Measurement and safety

Allocated size is storage assigned to an entry by the host when a meaningful
value is available. It is not a promise of uniquely owned or exactly
reclaimable physical space: sparse files, compression, snapshots, clones,
deduplication, metadata, and network filesystems can all affect that meaning.

Symbolic links and Windows reparse points found below the selected root are not
followed. DiskOrbit stays on the selected filesystem by default when stable
identity is available, and hard-linked file entries are counted separately.
See [Filesystem semantics](docs/filesystem-semantics.md) for the exact contract.

DiskOrbit reads names and metadata only. It does not read file contents, delete,
trash, move, rename, repair, change permissions, or execute user-supplied
commands. Scan data remains in the local Go process and is never uploaded.

## Command line

```text
Usage: diskorbit [options] [path]

--debug       show non-secret server, scan, warning, and shutdown diagnostics
--help        show command help
--version     show embedded build information
--workers N   bound scanner concurrency (0 selects the automatic default)
```

## Contributing

Run the complete local gate with:

```sh
scripts/check.sh
```

This covers frontend lint, unit tests and production build; Go formatting,
tests, race checks and vet; and the native embedded build. See
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[development guide](docs/dev/guides/development.md) for the workflow and
real-browser gate.

Architecture, ownership boundaries, and the authenticated browser model are
documented in [Architecture](docs/architecture.md). Security reports should
follow [SECURITY.md](SECURITY.md).

## Licence

DiskOrbit is licensed under the [MIT License](LICENSE).
