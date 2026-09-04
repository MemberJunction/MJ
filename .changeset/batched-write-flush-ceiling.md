---
"@memberjunction/integration-engine": patch
---

An operator can bound how much a batched apply holds in memory.

A batched write group holds every enrolled record's rendered SQL and parameters until `Submit`, so
peak memory for an apply is roughly (maps in flight × group size × row size). With wide rows that is
the largest allocation a sync makes, and a box that has run out of heap has no way to trade a little
throughput for headroom.

`MJ_INTEGRATION_BATCH_FLUSH_AT` sets a ceiling on deferred writes per group: on reaching it the
group is submitted and replaced mid-batch.

Unset — the default — means no mid-batch flush at all, so a batch remains exactly one group and one
transaction. That default is deliberate: splitting a batch into several transactions is a real
trade, since an earlier flush stays committed if a later one fails. The per-record fallback that
follows a failed batch is idempotent, so the split is recoverable, but it is no longer
all-or-nothing — which is why it happens only when explicitly asked for.
