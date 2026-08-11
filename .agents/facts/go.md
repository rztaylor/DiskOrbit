# Go facts

- Module: `github.com/rztaylor/diskorbit` unless a future configured remote
  establishes a different canonical path.
- Minimum toolchain: Go 1.26.5, matching the supported Singleserve v0.2 line.
- Entrypoint: `cmd/diskorbit`.
- Hand-written implementation lives under `internal/`; no public `pkg/` API is
  currently intended.
- Every hand-written Go package includes a concise `doc.go` ownership contract.
- Generated web assets live under `internal/webui/assets/generated/` and are
  produced before the Go release build.
- Use the standard library by default and avoid CGO.
- Validation commands are declared in `.agents/facts/testing.md`.

