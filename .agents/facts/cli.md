# CLI facts

- Binary name: `diskorbit`.
- The CLI supports `--help`, `--version`, `--debug`, `--workers N`, and one
  optional scan path using Go's standard `flag` package through `internal/cli`.
- Normal startup is quiet. Debug output may disclose the non-secret bound
  listener address, scan lifecycle summaries, filesystem warning paths and
  messages, and shutdown reason; it must never disclose authentication data.
- Browser-open failure writes the short-lived manual bootstrap URL to stderr
  once, with its expiry, because this is the explicit recovery path.
- `diskorbit [options] [path]` starts the optional path automatically. Worker
  zero selects the conservative automatic default; accepted explicit limits are
  1 through 256. Multiple paths and out-of-range values are usage errors.
- stdout is for requested results such as version output. Help, warnings, and
  errors use the conventional stream selected by the command outcome.
- No destructive commands exist.
