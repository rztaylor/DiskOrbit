# Product facts

- Product: DiskOrbit.
- Audience: people who need a fast, understandable view of local disk usage.
- Shape: one native Go process and the user's existing browser; no webview,
  runtime Node installation, account, cloud service, telemetry, or analytics.
- Primary experience: a restrained, information-dense radial filesystem view
  supported by a directory tree, table, transient per-scan Review list, text
  status, and accessible controls.
- Startup experience: make familiar local folders and deduplicated mounted
  volumes obvious scan choices before presenting a modal, read-only folder
  navigator with manual path fallback.
- Supported targets: Windows, macOS, and Linux on amd64 and arm64.
- Safety boundary: analysis and reveal-in-file-manager only. Delete, trash,
  move, rename, permission changes, repair, and arbitrary execution are out of
  scope for initial releases.
- Data boundary: scan data remains authoritative in Go and local to the current
  process. The browser receives bounded, validated views rather than a complete
  filesystem dump.
- Persistence boundary: only non-sensitive appearance and chart preferences are
  saved in the user's OS configuration directory. Scan roots, results, reports,
  credentials, and browsing history are not persisted.
- Decision needed: choose the repository's open-source licence before the first
  public release. No licence text should be inferred from dependencies.
