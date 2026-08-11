# App foundation

Status: **Preserved — implemented**

## Goal

Produce a tested DiskOrbit executable that embeds a compiled React frontend,
uses Singleserve's current authenticated browser lifecycle, and exposes one
authenticated status endpoint.

## Acceptance criteria

- A frontend build followed by `go build ./cmd/diskorbit` produces one native
  executable with no runtime Node, Python, Java, or webview dependency.
- Startup opens Singleserve's authenticated bootstrap and displays the
  `DiskOrbit` scan launcher once the private session is ready. Healthy
  connection state stays visually quiet.
- The browser uses one Singleserve session for heartbeat, API calls, Quit,
  backend-loss handling, and terminal close-tab guidance.
- Closing the last tab or cancelling the process context drains the HTTP server
  without leaked work; browser-open failure provides one renewed manual URL.
- Package, UI, security, generated-asset, validation, and documentation
  ownership is explicit and tested.

## Ownership

- `cmd/diskorbit`: signals and executable wiring.
- `internal/cli`: flags, help/version output, and exit decisions.
- `internal/app`: router composition and Singleserve lifecycle.
- `internal/api`: status HTTP contract.
- `internal/webui`: compiled asset embedding and delivery.
- `frontend/src/api`: typed authenticated application requests.
- `frontend/src/lifecycle`: Singleserve session state and shutdown behavior.
- `frontend/src/components`: reusable scan and lifecycle controls.

## Preserved follow-up context

All planned successor milestones are implemented. A generic upstream
Singleserve improvement for idle pre-header connections during graceful drain
remains deferred; DiskOrbit's narrowly tested local guard is documented in
`docs/architecture.md` and `docs/dev/decisions.md`.
