---
"@memberjunction/integration-engine": patch
---

`syncConcurrency` now applies to writes, not just fetches.

Opting into concurrency already made the apply path give up batch atomicity — on that path each
record auto-commits on its own pooled connection specifically so concurrent streams cannot collide
on a held transaction — and then applied the records one at a time anyway. The caller paid the price
of concurrency and received none of it.

The transaction-free path now runs a bounded pool of workers pulling from a shared cursor, capped by
the requested `syncConcurrency` (clamped to 16). A fixed pool rather than `Promise.all` over the
batch, because 500 simultaneous saves would swamp the connection pool.

Both error behaviours are preserved: a poison record is still dead-lettered while its siblings
commit, and a `SchemaNotGeneratedError` still fail-stops the whole map — now by stopping the workers
at their next pull rather than grinding through the remaining records against a table that does not
exist. `ApplyRecords` takes the concurrency as a defaulted trailing parameter, so the serial path and
any caller that does not pass it are unchanged.
