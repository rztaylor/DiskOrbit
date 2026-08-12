# Filesystem semantics

This document defines what DiskOrbit measures and, just as importantly, what it
does not claim to know.

## Logical and allocated size

**Logical size** is the apparent byte length of file contents. It is available
from ordinary file metadata and remains available as an alternate view.

**Allocated size** is the storage assigned to an entry when the host exposes a
meaningful value. DiskOrbit uses `st_blocks × 512` on macOS and Linux and
`GetCompressedFileSizeW` on Windows. It tracks whether every descendant value
is known; an incomplete total is shown as unknown instead of substituting
logical bytes. This is the default view because it most closely represents the
storage capacity users are trying to reclaim.

Allocated size is not a promise of uniquely owned or exactly reclaimable
physical space. Sparse files, compression, allocation units, filesystem
metadata, copy-on-write, snapshots, clones, deduplication, cloud placeholders,
and network servers can all change that interpretation. APFS and Btrfs clones,
for example, may share extents that per-entry metadata cannot assign uniquely.

## Links and special entries

Symbolic links discovered beneath the selected root are represented but never
recursively followed. Windows junctions and other reparse points receive the
same conservative default. This prevents cycles and surprising traversal
outside the selected tree.

A directory alias explicitly selected as the scan root is followed for root
validation and directory access while the selected alias remains the displayed
scan path. This allows platform-provided aliases such as macOS entries under
`/Volumes` to work without changing the link policy inside the scanned tree.

When the platform supplies a stable device and file identity, a directory is
traversed only once per scan. Identities are claimed while each parent is being
enumerated, before descendant workers start, so a shallower user-facing path is
retained ahead of a nested alias. On macOS this prevents the APFS firmlink view
at paths such as `/Users` from being counted again through
`/System/Volumes/Data/Users`. Unique content beneath the Data volume remains
included, and explicitly selecting `/System/Volumes/Data` still scans that root
normally. Directories with unknown or zero file identities are traversed
conservatively rather than assumed to be duplicates.

Multiple directory entries may refer to one hard-linked file. DiskOrbit counts
each observed entry separately in logical and allocated totals. These are
apparent per-entry totals, not deduplicated unique physical consumption.
Directory traversal identity does not change this file accounting; a future
explicit unique-allocation mode still requires an ownership design that can
handle shared extents and clones.

Non-regular special entries are represented but do not contribute file-content
bytes.

## Filesystem boundaries and volumes

The default scan remains on the selected filesystem when the platform exposes a
stable device identity. A child directory on another known device is represented
and marked as a boundary but not traversed. The scan API supports an explicit
`crossFilesystems` option; the current browser uses the conservative default.
Unknown identity is reported conservatively rather than treated as proof that a
boundary is absent.

Startup scan choices are hints, not a claim that every root is readable or
available. DiskOrbit checks the home directory, platform-aware standard
folders, and recognised cloud-sync locations, retaining only directories with
discoverable content. That usefulness check is a bounded, non-recursive
two-level probe that enumerates at most 64 immediate entries per directory and
reads names and metadata only; it never reads file contents or measures size.
Volume discovery then adds platform roots:

- Windows enumerates logical drive roots and identifies mapped network drives.
- macOS reads actual mount records for `/` and direct `/Volumes` mounts,
  classifies network filesystems, and removes aliases of the same mounted
  filesystem. A directory merely left beneath `/Volumes` is not a volume.
- Linux reads at most 128 distinct mount points from `/proc/self/mountinfo`,
  filters common pseudo-filesystems, and labels recognised network types.

UNC paths, removable media, disconnected volumes, privacy controls, mount races,
and inaccessible system directories can still produce warnings or validation
errors. The modal folder browser enumerates one directory at a time with fixed
entry and response limits and never reads file contents. Its manual-path field
remains available when a familiar location is absent, localised under another
name, truncated from a listing, or unavailable to automatic discovery.

When the selected scan path exactly matches a discovered volume root, DiskOrbit
captures total and currently available capacity once at scan start. In
Allocated mode, the radial chart can show measured entries at their observed
sizes, an unaccounted-used wedge for host-reported used capacity not represented
by those entries, and a neutral free-capacity wedge. This avoids stretching
readable content to imply that inaccessible files, filesystem metadata,
snapshots, or shared allocations were measured individually. Only when measured
allocation exceeds host-reported used capacity are measured entries scaled down
to fit, since links, snapshots, and copy-on-write storage can make those views
disagree. Logical sizes are not compared with capacity because sparse files,
compression, and copy-on-write storage make those units incommensurate.
Capacity is omitted for ordinary folders and whenever the operating system
cannot report it reliably.

## Errors and concurrent changes

Permission denial, disappearing files, stale network paths, and recoverable
metadata failures become scan coverage gaps where possible. Exact counts are
grouped by cause, while at most five example locations per group are retained
to protect memory. Fatal root validation, cancellation, model-capacity, and
invariant failures remain distinct scan outcomes. Optional volume-capacity
lookup failure does not fail or warn an otherwise valid scan; the chart option
is simply unavailable.

Filesystem contents can change during traversal. DiskOrbit aggregates the
observations it successfully made; a result is not an atomic filesystem
snapshot. A cancelled or failed scan may retain a useful partial tree and is
labelled with its actual terminal state.

The live chart's completion colour is conservative. A directory is complete
only when its enumeration and every traversed descendant finish without a read
or metadata warning. Active incomplete branches remain grey. Once a scan stops,
measured entries regain the configured colour encoding. Limited-access caps
appear only on angular portions of incomplete branches with no rendered
continuation in the next ring, including where small descendants are pruned;
they do not sit beneath visible children. At the focused root, the cap follows
the unresolved portions of the centre circumference. A skipped
filesystem-boundary node remains explicitly marked as a boundary rather than
being presented as scanned.

## Reveal safety

Browser reveal requests contain a retained scan ID and node ID, never an
arbitrary path. The backend reconstructs the absolute path from the scan model,
checks that it still exists, and invokes the native file manager with a fixed
executable and exact arguments. No shell command is constructed.

## Read-only boundary

DiskOrbit reads names and metadata. It does not open file contents for reports,
export file contents, recursively follow links discovered beneath a scan root,
delete, trash, move, rename, repair, change permissions, or run user-supplied
commands.
