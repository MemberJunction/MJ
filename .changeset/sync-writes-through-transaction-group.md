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


The per-record fallback no longer opens a provider transaction when writes are batched.

With batching decoupled from concurrency, the degradation path became reachable with more than one entity map in flight — and it was the one piece of the batched path still reaching for the provider's transaction. That state is not per-caller: `_transactionDepth`, the active transaction and the savepoint counter are single fields on the one shared provider instance. A second concurrent caller therefore reads a depth of 2, treats itself as nested and issues `SAVE TRANSACTION` against a transaction the first caller may already have committed; the depth it leaks then fails every later query on that connection with "Transaction has not begun. Call begin() first." The corruption outlives the sync, because the provider is shared with everything else reading through it.

The transaction was not buying anything to begin with. `ApplySingleRecord` performs exactly one write — a create, an update or a delete; record maps are queued into `RecordMapBatch` and flushed set-based afterwards — so there is no multi-statement unit for a transaction to make atomic. A single statement either commits or it does not, and the retry's next attempt starts clean whether or not a rollback was issued against a transaction that never held anything.

So when writes are batched the fallback now applies each record on auto-commit. The write itself is unchanged — the same `ApplySingleRecord`, the same `Save()`, the same generated CRUD procedure, the same Record Changes — it simply stops opening a transaction around one statement. This is what the concurrent non-batched path has always done, through the same call, which is the evidence that the shape is sound rather than merely smaller.

The sequential path keeps the per-record transaction exactly as before: there the engine owns the provider on its own, so the shared counter cannot be raced, and a deadlock or momentary timeout still rolls back and retries clean. The behaviour is selected by the caller rather than inferred, and the default is the sequential one, so a path that has not been considered keeps today's semantics.

Worth recording for anyone reading the concurrency story: the batch itself was never the hazard. Both dialects' `TransactionGroup` acquire their own dedicated pooled connection — `new sql.Transaction(pool)` on SQL Server, `pool.connect()` then `BEGIN` on Postgres — and neither reads the provider's transaction fields. Submitting groups concurrently was already safe; the fallback was the only place the shared state was touched, and therefore the only thing standing between batched writes and concurrency.

Two behavioural consequences worth stating plainly, because both are invisible from throughput alone.

**Per-record failure attribution moves to the group.** An enrolled `Save()` returns true immediately and subscribes to `TransactionNotifications$` for finalization, so the `if (!saved)` check and its dead-letter attribution in `CreateRecord` / `UpdateRecord` / `DeleteRecord` do not run under batching. Every server-side rejection surfaces instead as a whole-group failure and costs a full batch re-apply through the record-by-record fallback. That is the designed degradation and it is correct — but the steady-state cost is real: a batch containing a persistently poisonous row does roughly twice the work on every run, indefinitely, and the only signal is that throughput never improves. A connection seeing no gain from `writeMode: 'batched'` should be read as "something in these batches fails every time", not as "batching does not help here".

**Entities whose identity is a single auto-increment column are never enrolled.** A batched `Save()` returns before the row exists, and the caller reads the primary key immediately afterwards to build the record map. That is safe for the shapes sync produces — `NewRecord()` client-generates the UUID for a single `uniqueidentifier` key, and a composite or soft key takes its values from the mapped fields before the save — but an identity column has no value until the insert executes, which would write a blank `EntityRecordID` and reintroduce exactly the duplicate-on-every-sync failure the record-map code documents. Such an entity is therefore left out of the group and saves immediately: one round trip slower for that entity, and impossible to get silently wrong.
