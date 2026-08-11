# Bounded scanner

Status: **Completed**

## Goal

Add the authoritative Go scan model and a controlled worker pipeline that can
scan large directory trees progressively without unbounded goroutines, queues,
open descriptors, or duplicated full paths.

## Required outcomes

- Logical size, file count, directory count, exact grouped coverage-gap counts,
  bounded examples, cancellation, and honest elapsed/discovered progress.
- Configurable bounded workers and queues with deterministic aggregation.
- Conservative symlink/reparse and filesystem-boundary defaults.
- Indexed node storage designed for millions of entries, allocated-size known
  state, and later explicit hard-link ownership semantics.
- Synthetic and temporary-directory tests plus scanner benchmarks.

## Delivered design

- The indexed tree uses 32-bit relationships and one byte arena for names,
  reconstructing full paths only when requested.
- Fixed-size directory reads close before descendants run. A semaphore bounds
  active traversal and open readers; depth-first fallback avoids a duplicate
  unbounded work queue.
- Stable directory identities are claimed during parent discovery so repeated
  aliases are traversed once, shallower paths win before concurrent descendant
  work begins, and unknown identities retain conservative traversal.
- The manager retains only a bounded set of terminal scans and the latest
  revision snapshot, with cancellation joined into application shutdown.
- Authenticated APIs expose scan lifecycle, latest updates, one node, and
  cursor-paged immediate children. The CLI accepts an optional initial path and
  configurable worker cap.
- Synthetic and temporary-directory tests cover totals, coverage classification
  and example bounds, links, boundaries, cancellation, concurrency, retention,
  and API validation. Model and scanner benchmarks record allocation baselines.

Allocated-size measurement, volume discovery, and native reveal are now
implemented. Unique hard-link and copy-on-write extent ownership remains
deferred because current cross-platform metadata cannot support an honest
deduplicated physical-usage claim.
