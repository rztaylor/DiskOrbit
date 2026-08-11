# Architecture

## Process and trust boundary

DiskOrbit is one Go process with a compiled React frontend embedded in the
binary. Its application router is passed to Singleserve, which owns the
authenticated loopback listener, one-time browser bootstrap, tab presence, and
graceful lifetime behavior.

```text
browser
  React shell
  authenticated revision polling and bounded node/report requests
  radial chart <-> lazy tree <-> table <-> breadcrumbs
        |
        | loopback HTTP through one Singleserve session
        v
Go process
  Singleserve authentication and lifetime
  application router       internal/app
    status/scans/reports/settings internal/api
    embedded frontend       internal/webui
  scan orchestration        internal/scan
  bounded traversal         internal/scanner
  indexed tree              internal/model
  filesystem metadata       internal/filesystem
  scan-target/reveal adapters internal/platform
  bounded reports/export    internal/report
  validated preferences     internal/settings
```

Singleserve v0.2.1 is used through its public API. The frontend imports
`connect` from `/_singleserve/client.js` and uses the returned session for
heartbeat, application requests, health, and Quit. DiskOrbit does not parse
launch credentials, copy the client, persist authentication in browser
storage, add permissive CORS, or implement replacement control routes.

All application routes are behind Singleserve's host, session-cookie, and
Origin checks. Security headers add a self-only content security policy,
no-referrer behavior, and content-type sniffing protection.

## Ownership and dependency direction

- `cmd/diskorbit`: process signals and executable wiring.
- `internal/cli`: arguments, help/version output, and exit-code mapping.
- `internal/buildinfo`: immutable version, commit, and build-date metadata.
- `internal/app`: router composition, security headers, and browser/process
  lifetime.
- `internal/api`: bounded HTTP request/response contracts and validation.
- `internal/scan`: scan IDs, one-active-scan policy, cancellation, revisions,
  selected-root capacity metadata, and bounded terminal-result retention.
- `internal/scanner`: controlled traversal, aggregation, exact warning
  classification with bounded examples, progress observations, and
  subtree-completion propagation.
- `internal/model`: compact authoritative indexed hierarchy and path
  reconstruction.
- `internal/filesystem`: fixed-batch host discovery, object identity, and size
  metadata.
- `internal/platform`: bounded familiar-folder and volume discovery,
  selected-volume capacity lookup, and exact-argument native reveal.
- `internal/report`: bounded terminal-scan summaries, heavy hitters, and
  streaming exports.
- `internal/settings`: versioned display defaults, validation, and atomic
  preference-file replacement in the OS user configuration directory.
- `internal/webui`: compiled-asset embedding and cache policy.
- `frontend/src/api`: runtime-validated authenticated backend calls.
- `frontend/src/lifecycle`: the single browser lifecycle session.
- `frontend/src/scans`, `visualization`, `reports`, and `settings`: feature
  state, bounded data transforms, and authenticated preference editing.
- `frontend/src/components`: reusable visible interactions; `App.tsx` composes
  the page and owns no API wire format.

Go domain packages do not depend on HTTP or React. React state does not own
scanner truth. D3 owns hierarchy layout and arc geometry only—not data loading,
selection state, or DOM lifecycle.

Every hand-written Go package has a concise `doc.go` ownership contract.
Generated frontend output is ignored under
`internal/webui/assets/generated/` and embedded after the frontend build.

## Scanner and model

The model stores nodes in an indexed array with 32-bit parent/child/sibling
links and a contiguous byte arena for names. It stores the canonical root path
once, reconstructs descendant paths on demand, and aggregates logical size,
known allocated size, files, directories, warnings, boundary flags, and broad
extension-based file-type totals in Go. File-type counters live in a compact
directory-only sidecar rather than increasing every file node.

Directory readers return fixed batches of 256 and close before descendant work
starts. A semaphore caps concurrent directory tasks and open readers; when all
slots are occupied, traversal proceeds depth-first in the current goroutine.
The authoritative tree doubles as the discovered-work index, avoiding a second
unbounded path queue. Recoverable metadata and directory errors become exact
counts grouped by cause, with at most five retained example locations per
group.

A compact transient completion tracker counts outstanding traversed child
directories without retaining paths or another hierarchy. A directory receives
the authoritative subtree-complete flag only after its own enumeration and all
traversed descendants finish successfully. Cancellation, read failures, and
metadata warnings keep affected branches and their ancestors incomplete;
filesystem boundaries are stable terminals under the selected no-cross policy
but are not themselves described as scanned.

Scan states are `scanning`, `cancelling`, `completed`, `cancelled`, and
`failed`. The API exposes the latest revision rather than retaining an
unbounded event history, and never invents a completion percentage for work
that has not yet been discovered.

## Browser data flow

The browser polls an active scan approximately several times per second. It
requests a selected node, its ancestor path, and cursor-bounded immediate
children with reconstructed paths. The chart loader enforces persisted limits:
2–12 rings, a 200–4,000 item ceiling, expanded directories per ring, segments
per directory, a minimum angular width relative to the complete chart, and
individual-file count or size rules.
Application defaults are defined only by `internal/settings.Defaults`.
`GET /api/settings` supplies both the effective saved value and that default
value to the browser; the settings page therefore restores the backend-owned
defaults instead of duplicating them in TypeScript.
The high-detail defaults are seven rings and 4,000 items. Each level receives a
fair share of the remaining ceiling so early breadth cannot consume all room
before deeper directory chains are loaded. Unloaded, hidden, or visually small
siblings can be represented by an exact `Other` value, or by stopping their
detail at an authoritative parent ring so the next ring contains an intentional
background gap. Both modes preserve measured totals; gaps encode “not expanded”
rather than unknown bytes.

Complete segments can use a stable name-derived branch palette, shades of one
colour, a two-colour parent-share gradient, an angular rainbow wash, or broad
file-type groups. Every retained regular file contributes its logical bytes to
the directory and all ancestors based on its extension; the API exposes each
directory's leading category and exact byte total. A folder inherits that type
only when it exceeds the configured share of authoritative logical size, so
bounded or omitted chart detail cannot change its classification and Allocated
mode remains consistent with Insights. DiskOrbit does not inspect file contents.
Pending scan branches remain neutral in every colour mode.

For an exact volume-root scan, the manager retains one platform capacity sample
with the scan snapshot. In Allocated mode the optional capacity view keeps
measured leaves at their observed weights, adds an unaccounted-used synthetic
leaf for host-used capacity not represented by the scan, and adds availability
as a neutral synthetic leaf. It scales measured weights down only when they
exceed host-reported used capacity. Capacity never changes authoritative node
sizes, tree/table values, or report calculations.

Tree, table, chart, and breadcrumbs share one controlled selected node. The
tree expands lazily with user-driven page loading; the table exposes bounded
previous/next pages; and the selected directory is always the chart's visual
root even when it was absent from an earlier bounded projection. Narrow layouts
hide the secondary tree and preserve chart and scrollable table navigation.

The browser also owns a bounded, transient Review list for the current scan.
Chart, tree, Contents, and Insights pass retained node IDs through a private
in-page drag payload or an explicit action. The list resolves each candidate
and its ancestry through authenticated node lookups, caps itself at 100
top-level entries, and consolidates overlapping parent and child selections so
its measured total is not double-counted. It is cleared when the scan changes,
never enters browser storage, and has no filesystem-mutation API.

While scanning, the chart refreshes once per second but navigation is disabled.
Unsettled directories render in neutral grey and authoritative completed
subtrees gain their configured encoding. After the scan reaches a terminal
state, measured segments use the configured encoding. Limited-access caps cover
only angular portions of incomplete branches with no rendered continuation in
the next ring, including pruned small descendants, and never sit beneath a
visible child. The same calculation draws unresolved focused-root intervals
immediately outside the centre circle. Any directory segment—including one at
the display-depth boundary—can become the new root. The centre moves to the
immediate parent and breadcrumbs jump to any ancestor.

Before a scan exists, the browser requests a bounded set of scan targets from
the authenticated API. Familiar folders and volumes render as direct scan
cards; the secondary route opens a modal folder browser backed by bounded,
non-recursive authenticated directory listings. It shows directories only,
hides hidden directories by default behind a modal checkbox, and retains manual
path entry for unusual or unavailable locations. Loading, empty, inaccessible, and truncated states stay
inside the modal. Neither target lists, browsed paths, nor directory listings
are persisted or treated as scanner truth.

Reports are available only after a terminal scan. Largest files use a bounded
min-heap. Extension reporting caps candidate cardinality and performs a second
pass for exact returned candidates, combining the remainder into `Other`.
JSON and CSV exports stream a selected subtree without materialising a second
full hierarchy.

## Display settings

The Settings page reads and writes one versioned document through authenticated
`GET /api/settings` and `PUT /api/settings` requests. Go validates the complete
document and atomically replaces `DiskOrbit/settings.json` beneath the platform
user configuration directory. A missing file yields balanced defaults; an
invalid or unreadable file produces an actionable UI error rather than silently
changing it.

This persistence is intentionally narrow: theme, default measurement, and
chart presentation, geometry, and colour choices only. Scan paths, scan trees,
warnings, reports, authentication material, and filesystem history never enter
the file. Browser Web Storage remains unused.

## Native integration

The platform layer suggests bounded roots: the current home directory;
platform-aware standard folders from Windows Known Folders, Linux XDG user
directories, or conventional fallbacks; recognized Dropbox, Google Drive,
OneDrive, iCloud Drive, and Box locations; classified logical drives on
Windows; actual `/` and `/Volumes` mount records on macOS; and filtered
`/proc/self/mountinfo` entries on Linux. Quick places are identity-deduplicated
and capped at Home, seven standard folders, and four cloud folders. Cloud
discovery reads at most 64 entries per directory in a non-recursive two-level
usefulness probe. Quick places must contain an immediate readable file or a
readable, non-empty immediate directory; empty locations and protected wrapper
directories are omitted, and hidden metadata such as macOS `.localized` files
does not make a location eligible.
Volume identities and mount paths suppress aliases
and duplicate roots, while stale mount-point directories are never offered.
Discovery does not probe capacity. Explicit folder-browser requests use the
filesystem boundary to enumerate only one directory at a time under fixed entry
and response limits. After scan-root validation, an exact discovered
volume may receive one native capacity sample. Reveal requests accept a
retained scan and node ID; Go reconstructs and validates the path before
invoking Finder, Explorer, or `xdg-open` with an exact argument vector and no
shell.

## Lifecycle and upstream drain edge case

Closing the final tab triggers Singleserve heartbeat expiry and disconnect
grace. `Ctrl+C` cancels the parent context. Explicit Quit first stops the client
heartbeat and aborts pending application fetches, then requests shutdown.
Active scans share the application context and are cancelled and joined before
cleanup; DiskOrbit leaves no daemon or orphan scanner.

Chromium can leave an unused TCP connection in the pre-header `StateNew` state.
Singleserve v0.2.1 uses the same five-second window for read-header timeout and
graceful drain, so those deadlines can race after authenticated Quit even when
no DiskOrbit request is active. DiskOrbit does not fork or silently modify the
dependency. Its workaround is intentionally narrow: a drain deadline is
tolerated only for Singleserve's authenticated browser-request shutdown reason
and only when DiskOrbit's request tracker proves there are zero active
application handlers. All other shutdown errors remain fatal.

A generic Singleserve improvement could close idle `StateNew` connections
before drain or stagger read-header and drain deadlines. That belongs upstream;
the local guard remains documented and regression-tested until then.
