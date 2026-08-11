// Package buildinfo exposes immutable executable build metadata.
//
// It owns version, commit, and build-date presentation shared by the CLI and
// status API. Release tooling may set its package variables with Go linker
// flags; buildinfo performs no Git or network discovery at runtime.
package buildinfo
