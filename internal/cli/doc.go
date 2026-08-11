// Package cli owns DiskOrbit command-line parsing and process-facing output.
//
// It validates startup flags, renders help and version results, and maps
// application errors to exit codes. Browser hosting belongs to app, and
// process signal registration remains in cmd/diskorbit.
package cli
