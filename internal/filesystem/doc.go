// Package filesystem owns safe local filesystem discovery primitives.
//
// It canonicalises selected roots, resolves root aliases for validation, reads
// directories in bounded batches, provides bounded read-only folder listings,
// and extracts portable entry metadata plus platform identity where available.
// It does not schedule scans, aggregate nodes, expose HTTP, read file contents,
// or perform destructive filesystem operations.
package filesystem
