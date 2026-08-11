# Architecture facts

- `cmd/diskorbit` owns process signals and dependency wiring only.
- `internal/cli` owns arguments, help/version output, and exit-code mapping.
- `internal/app` composes the application router with Singleserve and owns the
  browser/process lifecycle, not domain scanning or presentation.
- `internal/api` owns HTTP request/response models and handlers; handlers must
  not contain filesystem traversal or UI behavior.
- `internal/settings` owns defaults, validation, and atomic OS configuration
  persistence for non-sensitive display preferences. It never stores scan
  paths, filesystem observations, or Singleserve credentials.
- `internal/webui` owns embedded compiled assets and HTTP asset delivery.
- Scanner, filesystem, model, platform, and reporting packages own their
  respective domain responsibilities and do not depend on HTTP or React.
- `internal/platform` owns bounded scan-target discovery and capacity lookup
  for an explicitly selected volume root. Discovery may stat known candidate
  paths and enumerate at most 64 immediate entries per directory across a
  non-recursive two-level usefulness probe; it never performs scan traversal or
  probes capacity. Quick places
  are deduplicated and capped at Home, seven standard folders, and four cloud
  folders. Quick places must expose discoverable content: locations that are
  empty, unreadable, or contain only empty or unreadable immediate directories
  or hidden metadata are omitted. The frontend consumes typed authenticated projections without
  persisting paths.
- `internal/filesystem` owns bounded, non-recursive, read-only directory
  listings for the folder navigator. HTTP owns request validation and response
  mapping; React owns modal state and presentation. Listings never read file
  contents or persist browsed paths.
- Every hand-written Go package has a concise canonical `doc.go`. Generated-only
  frontend assets are exempt from boundary documents.
- `frontend/src` uses the ownership direction documented in
  `.agents/facts/frontend-ui.md`.
- The browser API transport starts with revision-based polling; scanner state
  must not depend on that transport so streaming can be added later.
- Generated frontend output lives in `internal/webui/assets/generated/`, is
  untracked, and is embedded only after `npm run build`.
- Scan state is process-local and bounded; DiskOrbit creates no persistent
  application database or cache of filesystem observations. The only durable
  application state is the small validated display-preferences document.
- The compact model owns exact logical-byte totals for broad extension-based
  file types in a directory-only sidecar. HTTP projects each directory's
  leading type and bytes; React applies the persisted dominance threshold.
- Scanner-owned transient counters propagate authoritative subtree-completion
  flags into the compact model; HTTP and React consume but do not infer them.
- Current external integration: `github.com/rztaylor/singleserve` v0.2.x.
