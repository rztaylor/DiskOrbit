# Using DiskOrbit

DiskOrbit helps you understand local disk usage without changing the
filesystem. It reads names and metadata, keeps scan data on your device, and
does not delete or move files.

## Start a scan

Run `diskorbit` without a path to open the scan launcher. Choose a familiar
folder or detected volume, or select **Another folder** to browse one directory
at a time. The folder navigator is read-only; manual path entry remains
available for unusual, localised, or unavailable locations.

You can also begin with a path from the command line:

```sh
diskorbit /path/to/folder
```

Only one scan runs at a time. Use **Stop** to retain the useful partial result
when you no longer want to wait for completion.

## Read an active scan

The radial chart refreshes while scanning. Grey branches are still changing;
completed subtrees gain their configured colours. DiskOrbit does not show a
percentage because the total amount of work is not known in advance.

Chart navigation is paused while scanning, but the centre status, live
counters, hover details, Stop action, and coverage information remain
available. A warning badge opens exact coverage categories with bounded example
paths when permissions, concurrent changes, or metadata failures limit a scan.

## Explore a result

The selected directory is shared across every result view:

- **Chart** shows the bounded radial hierarchy. Select a segment to inspect it,
  focus into directories, or use the centre and breadcrumbs to move upward.
- **Contents** shows exact immediate children in a sortable, paged table.
- **Insights** shows largest files, extension totals, and JSON or CSV export for
  the selected subtree.
- **Browse** contains the lazy directory tree and the Review list.

Press `Escape` in Contents or Insights to return to the chart. Segment actions
are available with right click, `Shift+F10`, the Context Menu key, or the
inspector action button.

## Use the Review list

Add files or folders from Chart, Browse, Contents, or Insights. Drag and drop is
available as a pointer shortcut; every drag action also has a named button for
keyboard and assistive-technology users.

The list consolidates nested selections so measured totals are not counted
twice. It is limited to the current scan, stored only in browser memory, and
cleared when the scan changes. **Review is not a cleanup queue:** its actions
are limited to selecting, revealing, removing from the list, and clearing the
list.

## Choose a measurement

- **Allocated** is the default and shows storage assigned to entries when the
  operating system provides a meaningful value.
- **Logical** shows apparent file length.

Neither measurement guarantees exactly reclaimable physical space. Sparse
files, compression, clones, snapshots, hard links, filesystem metadata, and
network storage can affect the result. Unknown allocated measurements remain
unknown rather than silently falling back to logical size.

For exact volume-root scans, Allocated mode can add free and unaccounted-used
wedges when the host reports capacity. These wedges provide volume context and
do not alter measured file or directory values.

## Tune the chart

Settings control theme, default measurement, capacity display, ring depth,
item budget, directory expansion, per-directory resolution, small-segment
grouping, omitted-content geometry, segment order, folder/file gaps, visible
files, and colour encoding.

The chart is deliberately bounded. Content not expanded into its own segment
is reconciled at the authoritative parent or represented by `Other`, depending
on the selected geometry. A configured maximum is a workload ceiling, not a
promise that every chart will contain that many rings or items.

Settings are saved under the operating system's user configuration directory:

- macOS: `~/Library/Application Support/DiskOrbit/settings.json`
- Windows: `%AppData%\DiskOrbit\settings.json`
- Linux: `$XDG_CONFIG_HOME/DiskOrbit/settings.json`, or
  `~/.config/DiskOrbit/settings.json`

The file contains display preferences only—never scan roots, results,
credentials, reports, or browsing history.

## Finish safely

Use **Quit** to close DiskOrbit explicitly, or close the final browser tab and
allow its short disconnect grace period to expire. `Ctrl+C` also stops a
terminal-launched process. Active scan work is cancelled and joined before the
process exits; DiskOrbit does not leave a background service running.
