# Decisions

## 2026-08-07 — React frontend with a narrow dependency surface

Use React and TypeScript built by Vite. React's explicit component/state model
fits the synchronised chart, tree, table, and breadcrumb interactions. Avoid a
component framework, router, global state library, and CSS framework until a
demonstrated product need exists. Add D3 only with the radial visualisation.

## 2026-08-07 — Singleserve v0.2 browser boundary

Use Singleserve's application-provided handler, browser-bound lifetime,
one-time fragment bootstrap, host-isolated cookie, canonical browser client,
and `session.fetch`. DiskOrbit does not recreate `/_singleserve/` routes,
inspect launch credentials, or store authentication in browser state.

## 2026-08-07 — Generated frontend assets remain untracked

Vite writes compiled assets under `internal/webui/assets/generated/`. Release
and full-check workflows build those assets before Go compilation, keeping
generated bundles separate from hand-written source while preserving the
single-executable output.

## 2026-08-07 — Bounded browser projection over an authoritative Go tree

Keep complete scan truth in the compact Go model. Browser APIs expose one node
or cursor-bounded immediate children, while the radial loader caps depth,
fan-out, per-level expansion, and total nodes. Combine omitted descendants into
an exact `Other` segment derived from authoritative totals so bounded rendering
does not pretend data disappeared.

## 2026-08-07 — Apparent allocation before unique physical ownership

Expose logical and native allocated bytes with explicit known/unknown state.
Count hard-linked entries separately and document clone, sparse-file, snapshot,
and compression uncertainty. A future unique-physical mode requires an explicit
cross-platform identity and ownership design; it is not inferred from current
metadata.

## 2026-08-08 — Deduplicate directory traversal, not file allocation

Claim stable device-and-file identities for directories as their parent is
enumerated, and omit later paths to the same directory from that scan. Parent
enumeration finishes before descendant workers start, so shallower user-facing
paths take precedence over nested aliases such as macOS's
`/System/Volumes/Data` firmlink view. Traverse unknown identities and an
explicitly selected alias root conservatively. Continue counting repeated file
entries separately because identity alone cannot assign ownership of hard links,
copy-on-write clones, or shared extents.

## 2026-08-07 — Reports reuse terminal scan storage

Derive summaries, bounded largest-file heaps, extension heavy hitters, and
streaming exports by walking retained terminal scans. Do not create a second
full report model or read file contents. Reports may describe a labelled partial
tree after cancellation or failure.

## 2026-08-07 — Narrow local guard for Singleserve drain deadline

Chromium may leave an unused pre-header connection whose timeout races
Singleserve v0.2.1's graceful-drain deadline after authenticated Quit. Keep the
upstream dependency unchanged. Tolerate that deadline only for the browser
request shutdown reason and only when a request tracker proves no DiskOrbit
handler is active; preserve all other errors. Prefer an upstream fix that
closes idle `StateNew` connections or staggers the two deadlines.

## 2026-08-07 — Native, tag-driven release matrix

Build all six supported OS/architecture targets on matching GitHub-hosted
runners. Package immutable intermediate binaries centrally, verify SHA-256
checksums, and derive notes from the matching changelog section. Refuse release
replacement and block publishing before expensive work when `LICENSE` is absent.

## 2026-08-08 — Completion colour and bounded radial depth

Keep the radial chart visible and dynamically refreshed during scanning, but
pause chart navigation until scanning stops. Neutral grey means a directory
subtree can still change while scanning. After a terminal result, restore the
configured colour encoding for measured entries and mark only the angular
portions of incomplete branches that have no rendered continuation in the next
ring. Pruned or unloaded small descendants therefore retain an outward-facing
coverage cap without placing hatching beneath visible children. For the focused
root, the same cap sits immediately outside the centre circle and leaves each
visible child opening clear.
Default to six visible rings, allow a session-local 2–8 choice, and retain the
independent 240-node and fan-out ceilings. Any depth-boundary directory can
become a new root; the centre navigates to its parent and breadcrumbs jump to
any ancestor. This preserves the product's visual focus without sending the
whole tree to the browser.

## 2026-08-08 — Card-first local scan launcher

Replace the path field as the primary startup decision with authenticated,
backend-discovered scan cards. Offer Home and existing conventional user
folders before deduplicated local and already-mounted network volumes. Selecting
a card starts immediately using the current size metric. “Another folder” opens
an authenticated modal navigator that enumerates only direct child directories
under fixed limits, offers hidden folders through an unchecked option, and
keeps manual path entry as the recovery route for localised, unusual, truncated,
or unavailable locations.
Discovery itself may inspect candidate metadata but must not enumerate
contents, calculate disk capacity, prompt for permissions, retain history, or
persist paths in browser storage. The navigator does not mount shares, handle
network credentials, expose file contents, or mutate the filesystem.

## 2026-08-08 — Capacity-aware free-space wedge

Probe capacity once only after a canonical scan path exactly matches a
discovered volume root; do not add capacity work to startup discovery or imply
that ordinary folders own their containing volume. Offer a chart toggle only in
Allocated mode. Preserve measured entries at their observed sizes, add an
unaccounted-used wedge when host-reported used capacity is larger, and render
available capacity as a neutral missing wedge. Scale measured entries down only
when their aggregate exceeds host-reported used capacity. Do not alter
authoritative node sizes or claim that inaccessible files, filesystem metadata,
snapshots, and other unobserved allocations were individually measured.

## 2026-08-08 — Persisted, depth-aware chart preferences

Replace the session-only 240-node/six-ring projection with a versioned settings
document served through the authenticated application API. Keep persistence in
Go's OS user configuration directory and restrict it to non-sensitive display
preferences; do not use browser storage or retain scan paths and results.

Use a high-detail default of seven rings and 4,000 total chart items, with guarded
ranges of 2–12 and 200–4,000. Reserve the remaining item budget across later
rings, fairly distribute each level across the largest expandable directories,
and independently bound segments per directory. Add a minimum whole-chart
angular width so nested branches cannot produce visually meaningless hairlines,
plus explicit individual-file policies (off, largest count, or minimum size).
Always keep omitted content reconciled to an authoritative parent total. The
filled mode materialises that remainder as `Other`; this provides meaningful
depth and large-file discovery without turning every filesystem entry into
DOM/SVG work or implying that a configured maximum is a promised ring count.

Extend that policy with an explicit spiky-gap mode: keep omitted bytes in the
authoritative parent value but do not expand them into a synthetic outer-ring
segment. Retain filled `Other` as an alternate. Allow size, folder-first, and
name ordering, with a bounded background gap between folder and file groups.
The chosen omitted-content mode applies equally to item-budget, segment-count,
file-policy, and minimum-angle pruning. A combined `Other` segment remains
subject to the same minimum angle; a still-narrower remainder stops at its
authoritative parent ring instead.

Offer five complete-segment colour encodings: focus-stable, ancestry-derived
branch palettes whose child hues remain related; single-hue shades; a
two-colour size gradient; angular rainbow wash; and broad file-type groups.
Maintain extension-derived logical-byte totals for every
directory in the authoritative scan model and promote its leading category only
when that exact total clears the configured share of the directory. This keeps
bounded Chart projections consistent with Insights in both size modes without
scanning file contents. Scan completion and free-space colours keep their
existing semantic precedence over palette choices.

## 2026-08-08 — Chart-first results workspace

Treat the radial visualisation as the primary results workspace rather than one
panel in a vertically stacked report. Remove launcher controls after a scan
starts, retain a compact scan strip, and let the chart consume the remaining
viewport beside a dense collapsible and resizable directory rail. Keep the
hover inspector permanently visible on desktop because it is how users read
otherwise-unlabelled segments; present its active measurement and supporting
facts as large metric cards. Move exact children and terminal reports into a
collapsed supporting panel so they remain available without displacing the
visualisation.

Make unknown-duration scan work obvious without claiming false progress: put a
labelled status in the radial centre and emit an inside-out pulse whenever a
refreshed visual tree arrives, while keeping the Stop action, live counters, and
coverage state in one compact, consistently sized sticky-header group. Retain
the indeterminate header line and scanning document title; reduced-motion users
keep the status without the pulse. Segment actions are available through
pointer and keyboard context menus plus the inspector action button. They may
focus, pin details, reveal a retained scan node in the native file manager,
copy its already-projected path, or open bounded reports. Do not add terminal
launch or other arbitrary execution.

## 2026-08-10 — Review before cleanup

Add a bounded, per-scan Review list at the bottom of the Browse rail so users
can collect concrete files and folders from Chart, tree, Contents, and Insights
without losing their current workspace. Support native drag-and-drop as a
pointer convenience and equivalent named actions for keyboard and assistive
technology users. Expand the shelf upward behind a resizable separator, keep
its state in browser memory only, and label its logical or allocated total as
measured rather than reclaimable.

Resolve collected entries from retained scan and node IDs and consolidate
ancestor/descendant overlap instead of double-counting it. Keep selection,
native reveal, removal from the list, and clearing the list read-only. Moving
reviewed items to the operating system Trash or Recycle Bin is a desired future
direction, but it requires a separate roadmap decision, safety design, and
native backend boundary; do not treat the Review list as permission to add
filesystem mutation or permanent deletion.
