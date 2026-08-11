// Package scanner discovers one filesystem tree with bounded concurrency.
//
// It owns scan preparation, cancellable traversal, worker limits, conservative
// link and filesystem-boundary policy, repeated-directory suppression, exact
// warning classification with bounded examples, progressive counters, and
// authoritative subtree-completion
// tracking. The indexed tree belongs to model; multi-scan state, HTTP, and UI
// presentation belong to higher-level packages.
package scanner
