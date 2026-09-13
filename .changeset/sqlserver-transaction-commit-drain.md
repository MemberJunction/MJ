---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/generic-database-provider": patch
---

Transaction commit and rollback no longer race a queued query, and a failed commit no longer leaks the transaction.

Every transactional query on a `SQLServerDataProvider` instance is serialized through its SQL queue, but `CommitPhysicalTransaction` and `RollbackPhysicalTransaction` bypassed it. They approximated "queue drained" by polling a private mssql field for up to 2 seconds, then **gave up silently and committed anyway** — which mssql rejects with `Can't commit transaction. There is a request in progress.` A `finally` then nulled the handle before the base class's abandon could roll it back, so the server-side transaction was left open and the caller's own rollback reported `No active transaction to rollback` on top of the real error. Under runner load that was roughly one in five integration runs failing inside `mj sync push`, across unrelated branches.

- **`drainSQLQueue()`** waits deterministically for every enqueued transactional query to finish — awaiting the most recently enqueued promise and looping until nothing new arrived — and commit/rollback call it first. No timeout, no private field.
- **`waitForActiveRequest` now throws** on timeout instead of falling through, naming the actual cause: a request that bypassed the queue.
- **A failed commit keeps the handle** so `AbandonPhysicalTransaction` can roll the doomed transaction back; it is cleared only on success.
- **`GenericDatabaseProvider`** treats a rollback issued after a failed outermost commit as already done rather than a second failure, since the abandon already rolled the handle back. The flag resets when the next physical transaction begins.

Closes #4447.
