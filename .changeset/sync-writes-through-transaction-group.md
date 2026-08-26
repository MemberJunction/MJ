---
"@memberjunction/integration-engine": patch
---

A sync batch can send its writes together instead of one at a time.

The apply loop already made a batch atomic — `BeginTransaction`, apply each record, `Commit`. But atomicity is not batching: each record's `Save()` still sent its own statement, so N records cost N round trips, and on a high-latency link the round trip is the write ceiling.

A `TransactionGroup` closes exactly that gap. Enrolling an entity in one makes `Save()` defer its **write** to `Submit()` while still doing everything else it does — validation, row-scope checks, `GenerateSaveSQL` producing the generated CRUD procedure call, Record Changes, and `OnAfterSaveExecute` when the result returns. The statements then travel together.

This is the distinction that matters: the speed comes from *how the SQL travels*, not from skipping what the SQL does. Writing rows directly reaches similar numbers by not calling the procedures at all, and pays for it with every stored-procedure side effect, every Record Changes row, and every save event — including the cache-invalidation events that `TrustLocalCacheCompletely` is justified on.

Opt-in per connection via `Configuration.writeMode === 'batched'`, and it fails closed: absent, unparseable, wrongly-typed or unrecognised configuration keeps the proven per-record path, so the default never changes underneath an existing tenant. A group that fails to commit routes into the same handler a thrown error does, so the existing degradation is reached by both shapes — counters restored from the batch snapshot, queued record maps discarded, and the batch re-applied record-by-record so one poison record cannot cost its healthy siblings.

The group rides the run's `AsyncLocalStorage` context rather than a threaded parameter, for the reason that context already exists: the entity is constructed several frames below the code that owns the batch.

Requires the batched submit in `@memberjunction/sqlserver-dataprovider` and `@memberjunction/postgresql-dataprovider` to be the thing that makes it one round trip; without those a group is atomic but still serial, which is today's behaviour.
