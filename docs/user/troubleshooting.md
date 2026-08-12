# Troubleshooting DiskOrbit

## The browser did not open

DiskOrbit prints a manual URL to stderr when automatic browser launch fails.
Open it within two minutes and do not share it: the URL contains a short-lived
bootstrap secret used to establish the private browser session.

If no URL appears, run with `--debug` and inspect stderr for startup details.
Debug output may include scan paths and filesystem errors, so review it before
sharing logs publicly.

## A folder does not appear on the launcher

Quick places are intentionally conservative and bounded. Empty or unreadable
locations, protected wrapper folders, and locations containing only hidden
metadata may be omitted. Use **Another folder** and enter the path manually.

DiskOrbit does not mount network shares or request credentials. Connect or
mount the location through the operating system first, then browse to it.

## The scan is partial

Open the coverage indicator to see exact issue categories and bounded example
paths. Common causes include operating-system privacy controls, ordinary file
permissions, disappearing files, stale network paths, and files changing while
the scan is running.

A partial or stopped scan can still be useful, but its totals describe only the
entries DiskOrbit observed. Grant access through the operating system or choose
a narrower root, then scan again if complete coverage is required.

## Allocated size is unknown or surprising

DiskOrbit does not replace an unavailable allocated measurement with logical
size. Sparse files, compression, allocation units, copy-on-write clones,
snapshots, deduplication, cloud placeholders, and network filesystems can also
make allocated totals differ from apparent size or reclaimable capacity.

Hard-linked file entries are counted separately. See
[Filesystem semantics](../filesystem-semantics.md) for the full measurement and
traversal contract.

## Free space is not shown

Capacity is available only for a scan path that exactly matches a discovered
volume root, only in Allocated mode, and only when the operating system returns
a reliable capacity sample. Ordinary folders do not own their containing
volume, so DiskOrbit does not attach free space to them.

## Reveal does not work

Reveal is available for retained scan entries that still exist. If a file was
moved or removed after scanning, scan again. Linux also requires an available
desktop file-manager opener such as `xdg-open`.

DiskOrbit never accepts an arbitrary browser-provided path for reveal. The Go
process reconstructs the path from the retained scan and node ID before calling
the native file manager.

## Settings cannot be loaded or saved

DiskOrbit validates the complete settings document and reports invalid or
unreadable files rather than silently replacing them. Close DiskOrbit, move the
`settings.json` file aside, and restart to use defaults. See
[Using DiskOrbit](using-diskorbit.md#tune-the-chart) for the platform path.

If saving fails, verify that the configuration directory is writable. DiskOrbit
creates no other persistent database or scan cache.

## DiskOrbit remains running after closing a tab

The process exits after the final authenticated browser session disconnects and
its short grace period expires. Other connected tabs keep it alive. Use the
in-app **Quit** action or `Ctrl+C` in the launching terminal when you need an
immediate, explicit shutdown.

## Reporting a problem

Search the [GitHub issues](https://github.com/rztaylor/DiskOrbit/issues) before
opening a report. Include the operating system, architecture, DiskOrbit version
from `diskorbit --version`, steps to reproduce, and the exact visible error.
Remove private paths and filenames from screenshots or debug output.

For a suspected vulnerability, follow [SECURITY.md](../../SECURITY.md) instead
of opening a public issue.
