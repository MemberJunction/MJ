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

Batched writes no longer force concurrency 1.

The write mutex existed because the shared provider connection holds one transaction at a time, and it wrapped the whole apply block. For `BeginTransaction` + per-record `Save()` that is right — the transaction is open across the batch. For a batched batch it is not: a `TransactionGroup` is an in-memory list until `Submit()`, so enrolling an entity validates, checks row scope, renders the CRUD procedure call and parks it without a statement travelling or a transaction opening. Only `Submit` touches the connection.

So the whole apply block was being serialized on account of work that never needed it, and the cost was the thing batching exists for: maps could not overlap on fetching, paging, transforming or enrolling, because they were queued behind each other's writes.

The batched path now takes the mutex only around the writes — the group's `Submit`, the reconciled-skip touch, and the record-map flush. One transaction is still in flight at a time, so the invariant is unchanged; what changes is that everything which never touched the connection now runs in parallel.

Each batch keeps its OWN group, in its own `AsyncLocalStorage` scope. Assigning onto the shared run context would be a single slot, and the moment two maps overlap the second would overwrite the first's group and enrol its records into the wrong batch. Per-batch scoping also keeps failures isolated: a poison record fails the group its own map owns, and a map applying alongside it is untouched — no shared transaction means no way for one map to make another fail.

Nesting the mutex is deliberately avoided rather than merely unused: the inner call waits on a chain that already contains the outer one, so it would hang instead of erroring. Under the outer mutex the writes are already serialized and run inline; the batched path takes it per write. That hazard is covered by a test, because a deadlock leaves nothing to read.

Batching follows `writeMode`, not concurrency.

Gating the decision on `useTransaction` — which is `getSyncConcurrency(config) <= 1` — would have meant batching only ever engaged at concurrency 1, the exact tradeoff this change exists to remove. Raising concurrency would silently drop every record back onto the per-record pool, and nothing in the sync reports that: throughput simply fails to improve, which is indistinguishable from the feature not helping.

Batching is a property of how the writes travel; concurrency is a property of how many maps fetch at once. They are independent, so the decision follows `writeMode` alone and the batch-atomic branch is entered whenever writes are batched. A batched batch is atomic by construction — the group is one transaction — so entering that branch is what it already meant; at concurrency above 1 the atomicity is per entity map, and a group failure still degrades to the record-by-record retry.

