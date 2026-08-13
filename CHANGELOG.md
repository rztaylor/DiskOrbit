# Changelog

All notable changes to DiskOrbit will be documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Licensed DiskOrbit under the MIT License.
- Added public contribution, security-reporting, user-workflow, troubleshooting,
  and automated dependency-update guidance for the GitHub repository.
- Added the repository foundation, documented ownership boundaries, local
  Singleserve application lifecycle, authenticated status API, and embedded
  React frontend shell.
- Added bounded, cancellable logical-size scanning with indexed node storage,
  conservative link and filesystem-boundary behavior, bounded coverage examples,
  scan lifecycle management, revision polling, paged node APIs, scanner
  benchmarks, and command-line path and worker controls.
- Added a progressive browser workspace with validated authenticated polling,
  honest scan status, typed scan controls, a lazy directory tree, and a
  sortable responsive table.
- Added a responsive card-first startup launcher for Home, existing familiar
  folders, and detected volumes, with direct keyboard-accessible scan actions,
  loading and recovery states, and an authenticated modal folder browser with
  manual-path fallback.
- Added bounded, read-only directory navigation for local and already-mounted
  network filesystems, with opt-in hidden folders, breadcrumbs, and recoverable
  unavailable-location states without exposing file contents.
- Added matching theme and Quit icon controls in the application header, plus
  a responsive, scrollable scan coverage drawer with Full/Partial/Failed status,
  exact issue groups, bounded examples, and fatal errors.
- Added an authenticated Settings page with five-category vertical-tab
  navigation and atomic OS configuration persistence for theme, default
  allocated/logical measurement, capacity display, ring and workload ceilings,
  branch/segment resolution, minimum visible-angle grouping, and individual-file
  count or size policies.
- Added persisted radial geometry and colour methods: spiky omitted-detail gaps
  or filled `Other`, size/folder/name ordering, folder/file separation, stable
  branch colours, single-hue shades, two-colour size encoding, rainbow wash,
  and conservative broad file-type dominance.
- Added a keyboard-accessible D3 radial partition view with shared selection,
  breadcrumbs, hover/focus detail, and bounded exact remainder reconciliation.
- Added live radial scan rendering with conservative subtree-completion colour,
  a configurable 2–12 ring depth, depth-boundary drill-down, and centre-up
  navigation. Stable branch hues and depth shading take cues from classic disk
  visualisers without reproducing their interface chrome.
- Added optional allocated-size free and unaccounted-used wedges for exact
  volume-root scans with known host capacity, including accessible capacity
  details and honest fallback when capacity is unavailable.
- Added native allocated-size measurement, filesystem-boundary behavior,
  platform volume discovery, and reveal-in-Finder/Explorer/file-manager actions
  that resolve retained scan node IDs rather than accepting browser paths.
- Added bounded largest-file and extension reports, subtree summaries, and
  streaming JSON/CSV export without materialising a second full scan tree.
- Added accessible chart-segment actions through right click, keyboard context
  menus, and the persistent inspector, including focus, pinned details, native
  reveal, copy path, and direct access to bounded subtree reports.
- Added a block-style extension breakdown and native Reveal actions to local
  Insights.
- Added a bounded per-scan Review list beneath Browse, with drag-and-drop and
  accessible add actions across Chart, directory tree, Contents, and Insights;
  nested selections are consolidated, totals remain explicitly measured and
  read-only, and shared icons identify View, Add, and Reveal actions consistently
  across result surfaces.
- Added Biome frontend linting, GitHub pull-request CI, real-browser lifecycle
  validation, six native release builds, deterministic ZIP/tar.gz packaging,
  embedded version metadata, SHA-256 checksums, and changelog-derived releases.

### Changed

- Made Quick places platform-aware, including Windows Known Folders and Linux
  XDG user directories, and added bounded recognition of Dropbox, Google Drive,
  OneDrive, iCloud Drive, and Box locations. Results are identity-deduplicated
  and capped to keep the startup launcher concise; empty, unreadable, or
  protected-wrapper folder locations are not offered, and hidden metadata does
  not make an otherwise empty location eligible.
- Adopted the selected colourful radial-orbit identity across the README,
  browser favicon and in-app header, with reusable Windows, macOS, and Linux
  packaging assets derived from the approved high-resolution artwork.
- Made allocated size the default view so the initial visualisation reflects
  the storage capacity users are trying to reclaim; logical size remains
  selectable.
- Replaced the session-only six-ring/240-node projection with depth-aware
  allocation across 2–12 rings and a configurable 200–4,000 item budget,
  defaulting to seven rings and 4,000 items while preserving omitted bytes at
  the authoritative parent ring or in `Other`.
- Replaced parent-relative small-segment filtering with a whole-chart minimum
  visible angle, defaulting to 0.75°, so nested branches no longer produce
  visually meaningless hairlines.
- Made the header brand an in-app Home action that returns terminal scan
  workspaces to the startup launcher while keeping active scan controls visible.
- Reframed recoverable scan observations as coverage with exact categories and
  bounded examples; active incomplete branches remain grey, while terminal
  charts restore configured colours and mark limited access only on incomplete
  angular portions without a rendered continuation, including pruned small
  descendants and focused-root circumference gaps, without placing hatching
  beneath visible child rings.
- Represented host-used capacity not covered by readable allocation as an
  unaccounted wedge instead of stretching measured entries.
- Simplified the startup hierarchy by removing the duplicate page hero and
  manual connection check, and by presenting scan choices directly on the page
  instead of inside an enclosing panel.
- Reworked terminal results into a chart-first viewport workspace with a much
  larger automatically fitted radial canvas, compact scan metrics, a dense
  collapsible and resizable directory rail, a persistent metric-card hover
  inspector, and full-area Chart, Contents, and Insights tabs that preserve the
  selected directory and return to Chart with Escape.
- Refined the radial inspector with clearer centre, preview, and pinned path
  states, larger colour-coded metric values, semantic coverage cards, and a
  separated limited-access warning.
- Increased the chart and Insights colour-key text and swatches, with extension
  tooltips on the Insights breakdown blocks.
- Simplified Largest files rows by moving full paths into filename tooltips
  instead of repeating them beneath every result.
- Made active scanning prominent at the point of change: the radial centre now
  labels the scan and emits an inside-out pulse whenever refreshed chart data
  arrives, while reduced-motion users retain the static status. The Stop action,
  indeterminate header line, live counters, and scanning browser title remain
  visible without implying a completion percentage.
- Removed the duplicate scan metric strip and anchored the target-marked root
  at the header centre, with active counters growing left and partial/failed
  coverage details growing right so changing values do not shift the status.
  Stop is now a distinct icon button beside the other header controls, while
  coverage still toggles the responsive diagnostics drawer.
- Simplified the application chrome by removing persistent healthy-connection
  messages and the footer, while retaining actionable failure and shutdown
  states.
- Expanded documentation for apparent versus allocated size, hard links,
  sparse files, copy-on-write uncertainty, report semantics, native reveal,
  unsigned binaries, and release governance.
- Narrowed explicit-Quit shutdown handling around a Singleserve v0.2.1 idle
  connection drain race while keeping all active-request and non-browser
  shutdown failures fatal.

### Fixed

- Corrected the pinned GitHub checkout action revision so hosted validation and
  release jobs can start.
- Made scan-target tests independent of host-specific standard folders and
  cloud configuration so the cross-platform CI matrix remains deterministic.
- Kept Folder Branches colours stable while focusing into directories, with
  related child hues and a focused-centre colour cue instead of an unrelated
  palette reset.
- Derived folder file-type colours from complete authoritative subtree totals,
  so bounded chart detail no longer leaves image-heavy directories neutral when
  Insights clearly identifies images as dominant; renamed the software group
  accordingly.
- Increased the luminance range and sibling variation of Single colour shades
  so neighbouring rings and segments remain distinguishable.
- Remembered Single colour and Size gradient choices independently, including
  both size-gradient endpoints, when switching methods or reopening Settings.
- Removed macOS startup-volume duplicates and stale `/Volumes` directories by
  discovering actual mount records, and classified mounted network volumes on
  macOS and Windows instead of presenting every drive as local.

- Kept the scanned workspace bound to the browser viewport after resizing, so
  the page cannot scroll past the result panels into empty background.
- Prevented clicks that dismiss a chart-segment actions menu from also
  activating the segment underneath it.
- Sized the radial chart from the smaller of its canvas width and usable height,
  preventing wide result workspaces from clipping the chart beneath the
  supporting panel.
- Allowed directory aliases selected as scan roots, including macOS volume
  aliases under `/Volumes`, while preserving the no-follow policy for links
  discovered inside a scan.
- Prevented stable directory aliases from being traversed and aggregated more
  than once per scan, including the macOS APFS firmlink views under `/Users`
  and `/System/Volumes/Data/Users`, without deduplicating file entries or
  omitting unique Data-volume content.
- Prevented long Largest files names from overrunning their size and action by
  truncating the stem while preserving a visible extension, and replaced the
  text Reveal action with a compact accessible file-manager icon.
- Returned to the scan workspace after Settings are saved, matching the
  existing Cancel navigation behavior.

### Security

- Pinned GitHub Actions dependencies to resolved commits and granted release
  write permission only to the final publishing job.
- Blocked public tag publishing until an owner-selected `LICENSE` and matching
  changelog version section exist.
