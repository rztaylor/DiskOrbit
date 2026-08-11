// Package app composes DiskOrbit's HTTP surface with its local browser lifetime.
//
// It owns router assembly, scan-manager composition, security headers,
// Singleserve startup, browser-open recovery, and graceful lifecycle reporting.
// CLI parsing, API models, static assets, filesystem traversal, and UI behavior
// remain separate owners.
package app
