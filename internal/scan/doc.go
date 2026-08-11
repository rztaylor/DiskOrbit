// Package scan manages process-local scanner lifetimes and progressive views.
//
// It owns scan IDs, states, cancellation, bounded completed-record retention,
// latest-revision snapshots, exact coverage summaries, selected-root capacity
// metadata, and access to authoritative node views. Traversal belongs to scanner; platform probing,
// HTTP models, CLI behavior, and browser state remain separate owners.
package scan
