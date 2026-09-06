# @memberjunction/integration-engine

## 6.1.0-edge.5

### Patch Changes

- 323df0f: Adaptive per-connection fetch concurrency gate. The engine can fire more simultaneous vendor fetches than the account's concurrency grant allows (lanes × prefetch), and vendors that govern by concurrent requests answer the overflow with long backoffs served inside the fetch — invisible to every resource metric because a backoff is idle. The gate caps simultaneous in-flight fetches per company integration with a FIFO queue, and its cap is adaptive: it halves when a throttle is reported (including throttles a connector absorbed in its own retry and surfaced via ctx.RateLimitReport) and creeps back up by one on clean outcomes, clamped at the ceiling — so it converges on the account's real grant with zero configuration. **Opt-in:** the gate only exists when a ceiling is declared — a per-connection `Configuration.fetchConcurrency` override or the connector's `MaxConcurrencyHint`. Connectors that declare neither are completely ungated, byte-for-byte the previous behavior.
- 405c035: `syncConcurrency` now applies to writes, not just fetches.

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

- b9a8324: An operator can bound how much a batched apply holds in memory.

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

- ff1b875: Discovery: bound the keyless-parent sample to the classifier's significance floor.

  When a REST template-var child is sampled, its parent chain is walked lazily — the leaf's record target is the only bound, and it propagates all the way up. The one exception is a parent that declares no primary key: it cannot be descended into until its key is classified from its own rows, so some rows must be read up front.

  That read was sized to the leaf's target (default 500). The value-statistic classifier's significance floor is 50 rows, and above it more rows buy no additional verdict — so up to 10x the needed parents were fetched before a single child record was yielded. Because a parent may itself be a template-var child, each of those rows is a fetch that recurses up every level above it, multiplying the over-pull by the chain's depth.

  The buffer is now `min(target, 50)`. The resolved key is a local addressing decision used only to build child URLs — it is never persisted as the parent's primary key, which comes from that parent's own first-class discovery pass — so the extra rows were being spent on a throwaway verdict. Sampling accuracy is unchanged (50 is the floor the classifier itself applies, and the same floor every top-level object's key decision uses), and the declared-key path is untouched.

- 653c51d: A discovery sample that degrades to the catalog description now says so.

  When streaming fails, `DiscoverFieldsViaFetch` falls back to single-sample `DiscoverFields` — the
  catalog's own description, which carries no observed widths. The fallback was announced only to the
  console, so from the pipeline's side it was indistinguishable from a successful sample: the method
  returned fields and the run recorded a discovery that succeeded. The object then kept whatever width
  its catalog guessed, and every longer value it later received was dropped at sync time as a string
  overflow.

  `DiscoverFieldsViaFetch` takes an optional `OnFallback` notifier, and the creation pipeline passes
  one that emits a `discover-fields-fallback` stage error naming the object and what is unknown for
  that run. Behaviour is otherwise unchanged — the fallback still happens, callers that pass no
  notifier are byte-identical, and a throwing notifier cannot turn a degraded discovery into a failed
  one.

- 716b930: Discovery samples the union of declared and runtime objects, and honours a scoped introspection.

  Sampling was reachable only through a `DiscoverObjects` hit: the loop that sampled iterated the
  runtime list, so a declared object the connector does not re-surface at runtime — the normal shape
  for a catalog-driven connector, and for every object when `DiscoverObjects` fails — was never
  sampled. It kept whatever width the catalog guessed, which is how a column declared at 255 drops
  every longer record at sync time, and it could only gain undeclared columns later, one sync at a
  time, through the overflow path.

  `StageIntrospect` now iterates declared ∪ runtime, sampling each object exactly once through a
  single extracted `SampleDeclaredObjectInPlace`. A `DiscoverObjects` failure is no longer total —
  the declared catalog is already in hand, so those objects are still sampled — and the failure is
  recorded on the Introspect checkpoint as `discoverObjectsFailed` so a consumer can tell "the source
  has no other objects" from "we never got to ask". A scoped introspection's `ObjectNames` filter now
  also applies to the runtime pass, which previously pulled and sampled the whole catalog anyway.

  Merge direction is unchanged: sampling fills gaps and widens, never overrides, and a sampling
  failure leaves the declaration exactly as it was.

- fa616d3: Discovery samples the source for every declared object, and merges what it sees without overriding what was declared.

  Streaming records at introspect time used to happen only for an object that arrived with no fields. That is a gate on the wrong question: sampling answers three, and a declaration can only pre-answer one of them.

  | question                                    | can a declaration answer it?                   |
  | ------------------------------------------- | ---------------------------------------------- |
  | what is the primary key?                    | **yes** — a declared key is authoritative      |
  | which fields does the source actually send? | no — a catalog lists what the vendor documents |
  | how wide are the values?                    | no — only the data knows                       |

  So an object declared with fields and a key was never sampled. Its undeclared columns arrived later through the custom-overflow path, one sync at a time, and its widths were whatever the catalog guessed — a column declared 100 wide against 900-wide data is not slow discovery, it is a truncation or a migration written by hand afterwards.

  Sampling is now unconditional, and the merge is deliberately one-directional — it fills gaps and widens, never overrides:
  - **Primary key** — a declared key wins outright, even when the sample nominates a different column. Overriding it is how a child table ends up keyed on its parent's foreign key. An observed key is adopted only when none was declared.
  - **New fields** — an observed field absent from the declaration is added, so its column exists at RSU time instead of appearing in overflow after a sync.
  - **Widths** — effective length is `max(declared, observed)`, and an unbounded declaration beats any measured number. Never shrink: shrinking is the one outcome that loses data.
  - **Everything else** — labels, descriptions, types, nullability, relationships — the declaration stands. A sampled type is inferred from a handful of values; a declared one was written down.

  A fetch failure leaves the declaration exactly as it was, so the worst case is the behaviour that shipped before, and the error now says which of the two losses occurred — an object with no fields at all cannot sync until sampling succeeds, whereas one with a declaration merely runs with unknown widths for that run.

  This supersedes the narrower fix that widened the gate to "no fields, or no key": the gate is gone, and the key rule it introduced is preserved as the primary-key rule above.

- 79afbff: Discovery can now sample a multi-var child — and everything beneath it — when the tuple is provable.

  A child whose APIPath carries two or more template vars was deferred outright, and the deferral
  CASCADED: not just `/a/{aId}/b/{bId}/d` itself but every descendant of it got no sampling at all —
  no custom columns, no observed widths, and an object with no declared primary key was dropped
  entirely, since sampling was its only route to one.

  Real multi-var paths are overwhelmingly NESTED (`/campaigns/{cid}/funds/{fid}/gifts`, where funds is
  itself a child of campaigns), and a streamed record of that innermost parent already carries the
  whole tuple — its own id natively, its ancestor's tagged on by the recursion one level down. The new
  sampler resolves every var, streams the innermost candidate parent, and substitutes ALL vars from
  each record's own fields. A record that cannot fill every var is skipped; a candidate that proves
  barren over a bounded probe is abandoned for the next; when no candidate covers, the child adjourns
  to declared-only fields exactly as before.

  The old deferral's constraint still holds absolutely: no partial substitution ever leaves the
  process, and genuinely independent parents (neither knows the other's key) still adjourn — valid
  pairs are unknowable from data, and guessing them is the malformed-request bug the deferral existed
  to prevent. The difference is that a subtree now only dies when its tuple is genuinely unknowable,
  not whenever an ancestor merely had two parents.

- e3a1425: An object the account cannot serve no longer fails loudly on every sync.

  A vendor catalog lists record types a given account has not enabled. Asking for one returns the same
  error every run, forever, and treated as a fetch failure it costs an error event and a retry ladder
  per object per run — 71 such objects on one live connection produced 71 hard failures every sync,
  burying the real ones.

  The engine now recognises the signal as its own kind: `ObjectUnavailableError`, or any error carrying
  `code === 'OBJECT_UNAVAILABLE'` so a connector can classify one without a peer version bump. The map
  ends cleanly with a single warning — no retry ladder, no `FETCH_INCOMPLETE`, watermark untouched.

  The verdict is deliberately NOT persisted between runs. Remembering it would save one probe per
  object per run, and the object count in any real system is small enough that the trade is bad: a
  stored verdict is wrong from the moment the account changes, and every scheme for noticing that — a
  recheck clock, a full-sync override, a manual-run override — is another thing to keep correct.
  Re-asking every run is self-healing by construction, with nothing to configure and no staleness.

  It is also deliberately not modelled by disabling the entity map. `SyncEnabled`/`Status` are the
  user's levers; writing to them would conflate "this account cannot serve the object" with "the user
  does not want it".

- 427fa8b: Type and nullability overlays now respect a silent source, like every other attribute already does.

  The per-attribute rule in this file is that discovered metadata wins where the source states
  something and the declaration fills the silence. Descriptions, booleans and lengths all follow it.
  `Type` and `AllowsNull` did not:
  - `MapSourceType` answers every input, including `''` and `undefined`, because its fallback has to
    produce something for a genuinely unknown column. The caller used that answer either way, so a
    describe with no type opinion rewrote a curated `datetimeoffset` or `bit` to `nvarchar` — and a
    declared `nvarchar(MAX)` to a bounded `nvarchar`, which drops records at sync time.
  - `AllowsNull ?? !IsRequired` computed `true` when the source stated neither, because `!undefined` is
    `true` — so a describe with no opinion silently turned a declared NOT NULL column optional.

  Types are hard constraints backed by real DDL, so a wrong one is a migration rather than a cosmetic
  drift. `decideTypeOverlay` and `decideNullabilityOverlay` now make both decisions explicitly, in the
  same shape as `decideBooleanOverlay`. A source that states something still wins; `IsRequired` still
  derives nullability, since that is a statement made indirectly; and a field with no declaration still
  takes the mapped value, fallback included, because there is nothing curated to protect.

- 8e469c3: Writes for different entity maps no longer queue behind each other.

  Every engine write went through one provider-wide chain. That was necessary but too broad: the
  provider holds a single transaction on a single connection, so a write issued while that transaction
  is open joins it — and the chain was the only thing preventing one batch's transaction from
  swallowing an unrelated map's watermark save. The cost was that maps syncing concurrently also
  serialized all their bookkeeping, including when no transaction existed at all.

  `WriteSerializer` replaces the chain with a two-mode lock. Work that opens the provider transaction
  runs exclusively, exactly as before. Work scoped to one entity map that opens no transaction —
  watermark bookkeeping, match resolution, and the post-batch flushes of a batched apply — runs keyed
  by entity map: different maps overlap, the same map stays ordered.

  Waits are acyclic by construction: an exclusive section snapshots the in-flight keyed work at call
  time, and a keyed call captures the barrier at call time, so nothing ever waits on work created
  after it. Chains continue past rejections, so one errored batch cannot wedge later writers.

- d10f112: Column deactivation now requires a source that DECLARED its field list complete.

  A source describes its objects in one of three shapes, and only it knows which: it names no columns
  at all, it returns only the account's CUSTOM columns, or it returns the full mapping. Only the third
  can prove a column is gone.

  That distinction was inferred from "the discovered field list came back non-empty", which cannot
  tell the second shape from the third. A source returning only custom columns therefore looked
  complete, and every standard column it did not restate became a deactivation candidate on a
  comprehensive refresh.

  `SourceObjectInfo` gains `FieldsAreAuthoritative`, and `decideAbsentDeactivations` deactivates
  columns only for objects that declared it `true`. An object that declares nothing is left alone —
  absence of evidence is not evidence of absence, the same rule the primary-key search already
  follows. Object-level deactivation is unchanged.

  The same rule now governs OBJECT deactivation, which was passing a hardcoded `IsAuthoritative: true`
  and so overrode every connector that declares its discovery partial — a refresh that did not return
  an object disabled it even for a source that cannot prove absence. It now reads the connector's own
  claim, like the field level does.

- f52be10: Fix a duplicate-record defect in the create-path prefetch elision.

  `extractMappedPrimaryKey` returns the primary key value(s) already `'|'`-joined — the same shape
  `PrefetchContentHashes` keys its `Present` set with. Two call sites instead treated that string as a
  field map and re-derived a key from it (`mappedPK[f.Name]`), which evaluates to `''` for every
  record. `provablyAbsent` was therefore unconditionally true whenever the prefetch covered the batch,
  `existed` was permanently false, and any existing row reaching the create path was blind-INSERTed
  instead of loaded and updated — a silent duplicate row on soft-primary-key tables, a duplicate-key
  error on hard ones. It also made both content-hash skips on that path unreachable, since they sit
  behind `existed`.

  Reachable whenever an existing row reaches `CreateRecord`: a cleared record map, a new
  CompanyIntegration over pre-existing rows, a `Create` verdict from matching, or `UpdateRecord`'s
  unmatched fallback.

  Both sites now use `mappedPK` directly. The decision moves into `isProvablyAbsent` so it can be
  tested against the real extractor's output rather than a re-implementation of it, and `CreateRecord`
  now records a key it creates into `Present` — a mid-batch flush commits part of a batch, and the
  per-record fallback re-applies that batch against the same precheck, where an already-inserted row
  would otherwise still "prove" absent.

  The regression was invisible to its own tests: they stubbed `extractMappedPrimaryKey` with an
  object-returning fake while the real method returns a string, and asserted the buggy expression's
  source text rather than its behaviour. The suite now drives the real extractor, the real prefetch and
  the real decision end to end, including the duplicate scenario and composite keys.

- 4f7f929: Pipelined page prefetch for cursor-paged connectors. The fetch loop was strictly serial — fetch page, process page, fetch next — even though the next cursor is known the moment a page arrives. The next page now starts downloading while the current one is mapped and written, hiding the shorter leg under the longer (~20-30% cycle reduction measured at a ~6s fetch / ~1-2s process split). Cursor mode only; offset/page modes interact with gap-skip resume and stay serial. The prefetch runs through the same governed envelope as a loop-top fetch (rate limiter, adaptive fetch gate, timeout, transient-only retry, once-per-episode throttle reporting), it is built from the fully advanced position (NextPage/NextOffset/NextCursor/NextAfterKeyValue — a stale AfterKeyValue would make a keyset connector re-run the previous seek and stop at exactly two server pages), and a drifted cursor discards it rather than consuming the wrong page. Kill switch: MJ_INTEGRATION_PREFETCH=off.
- 87aa62a: A batch that already proved a row absent no longer re-checks it per record.

  Each apply batch queries the destination for the rows it is about to touch. `CreateRecord` then
  asked again, one record at a time, with an `InnerLoad` — a `SELECT *` returning every column
  including any `NVARCHAR(MAX)` — usually to discover the row is not there. On a first full sync that
  is one wasted round trip per record.

  The prefetch now also asks about create-path keys (the key the mapped fields carry, which is exactly
  what `CreateRecord` was about to probe) and returns three separate facts: the stored content hashes,
  the set of keys proven to EXIST, and whether the query covered every record in the batch. Presence is
  tracked separately from hashes on purpose — a row can exist while carrying no hash, and conflating
  the two would turn an update into a duplicate insert.

  `CreateRecord` skips its existence load only when absence is proven: the batch covered every record
  AND this key was missing from the result. A partial prefetch, a failed query, or a
  destination-generated key all mean "unknown", and fall through to the load exactly as before.

- 595c945: The absence-proof prefetch now passes `IgnoreMaxRows`, so a row-limit default can never truncate it.

  A plain `RunView` is not unbounded — it falls back to the entity's `UserViewMaxRows`, which defaults
  to 1000. The prefetch's result is what `CoversWholeBatch` absence proofs are judged against, and
  coverage is computed from the request side, never reconciled with the response length: a silently
  truncated response would mark every existing row beyond the cap "provably absent" and re-INSERT each
  as a duplicate on every sync. Today the apply batch (500) happens to sit under the default cap, so
  nothing fires — a 2× margin defended by nothing. This engine already documents the identical trap on
  its push side and fixes it the same way.

- 64915b9: Discovery samples ~50 records per table by default, not 500.

  Sampling exists to answer three questions, and 50 rows fully answers two of them: a statistically
  significant primary key (50 IS the classifier's significance floor — more rows change no verdict) and
  which custom columns exist in the data. Only the third, the largest observed string, benefits from
  more rows, and it has its own safety nets: the width bucket pads to twice the observed maximum, the
  overlay only ever grows a width, and a value that overflows at sync time is recorded as a widening
  candidate rather than lost.

  Paying ten times the discovery time on every object of every connection to sharpen one answer in
  three is the wrong default. On a large catalog that difference is the difference between a discovery
  a person will wait for and one they won't.

  The default is now sourced from `PK_STAT_MIN_ROWS_FOR_SIGNIFICANCE` rather than restated, so the
  sample target and the floor it is chosen to match cannot drift apart. The precedence chain is
  unchanged — explicit options, then per-connection `discoveryMaxRecords`, then
  `MJ_INTEGRATION_DISCOVERY_MAX_RECORDS`, then this default — so a connection that wants deeper width
  fidelity raises it.

- 5c1d762: A row whose content hash goes stale is repaired once, instead of losing its fast path forever.

  When a source stops sending a column, the mapper OMITS the absent key rather than mapping it to null
  — a missing value is not a null value. The recomputed content hash therefore differs from the stored
  one, so the hash fast path correctly does not skip. But `SetEntityFields` never touches that column
  either, so the entity is not dirty and the unchanged-record skip fires instead — and that path never
  refreshes the stored hash.

  The mismatch was permanent. That row lost the content-hash fast path for good, paying a full load and
  a field-by-field compare on every sync from then on, until some other field happened to change.

  A stale hash now counts as sync state needing repair, alongside a tombstone or an error status: one
  write brings the stored hash back in line with what is actually being mapped, and every later sync
  skips the row cheaply again. It deliberately does not conclude the column is gone — absence in the
  data is not evidence of absence in the schema, and the column's value is left exactly as it is.

- 905820a: Sync-scoped write-side-effect suppression. Record Changes and geocoding are per-write side effects, but the only way to relieve a high-volume writer of them was turning the entity flags off — which also turns them off for every human and API writer of the same entities, permanently. New `EntitySaveOptions.SkipRecordChanges` / `SkipGeoCoding` (and `EntityDeleteOptions.SkipRecordChanges`) scope the suppression to the individual save: providers omit the audit-row wrap and the geocode side trip for saves that carry the options, and only those. The sync engine sets them on its own writes when the connection asks via `Configuration.writeSideEffects === 'suppressed'` — fail-closed: absent or malformed configuration keeps the side effects on, and a save outside a suppressing sync run can never carry them. Materially identical to flags-off for the sync's writes; invisible to every other writer. The delete option is mirrored onto the GraphQL `DeleteOptionsInput` because the schema-sync gate requires every `EntityDeleteOptions` field to appear there, but it is **not honoured over the wire**: every wire entry point sanitizes it back to false and logs the attempt, because suppressing an audit row is a higher privilege than `entity:delete` — the only authorization a delete mutation performs. That keeps delete at exact parity with save, whose options have no GraphQL input type at all.
- cc474d5: A sync batch can send its writes together instead of one at a time.

  The apply loop already made a batch atomic — `BeginTransaction`, apply each record, `Commit`. But atomicity is not batching: each record's `Save()` still sent its own statement, so N records cost N round trips, and on a high-latency link the round trip is the write ceiling.

  A `TransactionGroup` closes exactly that gap. Enrolling an entity in one makes `Save()` defer its **write** to `Submit()` while still doing everything else it does — validation, row-scope checks, `GenerateSaveSQL` producing the generated CRUD procedure call, Record Changes, and `OnAfterSaveExecute` when the result returns. The statements then travel together.

  This is the distinction that matters: the speed comes from _how the SQL travels_, not from skipping what the SQL does. Writing rows directly reaches similar numbers by not calling the procedures at all, and pays for it with every stored-procedure side effect, every Record Changes row, and every save event — including the cache-invalidation events that `TrustLocalCacheCompletely` is justified on.

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

  Now that the providers can honour it (MJ#4087), the engine arms `BatchedSubmit` on the group it creates — so a batched batch travels as ONE round trip rather than one per item. Without that flag the group is atomic but still serial, which is the pre-existing behaviour and why this could land in either order.

  Batching is decided per ENTITY MAP, not only per connection. A map whose target's whole identity is server-assigned (a single auto-increment primary key) can never enrol a record, so batching it would create a group that stays empty — and because the batched branch skips `BeginTransaction` on the strength of a group existing, that batch would run non-atomically while an empty `Submit()` reported success. Such a map takes the transactional path instead and gets real atomicity. The per-record enrolment guard stays as well: it is total at the seam, which is where an entity whose metadata could not be resolved gets its answer.

- 2c8fbc7: Report per-object progress during discovery sampling

  Sampling is the expensive half of discovery — one read-path fetch per object — and it emitted
  nothing between the stage's start and its completion. A 23-object source looked exactly like a
  5-object one: a stage that had started, for an unbounded stretch, with no way to tell slow
  progress from a wedged run.

  `StageIntrospect` now emits a heartbeat per object it samples, carrying `processed` / `totalKnown`
  / `skipped` and a message that stands on its own (`Sampling "Invoice" (3 of 23)`), so a consumer
  that renders only the text still reads correctly.

  Two details that make the number trustworthy rather than merely present:
  - The denominator is the union both sampling passes will walk — in-scope runtime objects plus
    in-scope declared ones — computed before the first sample. Counting per-loop would show
    "1 of 2" and then restart when the declared-only pass began, revising the total upward under a
    user who is watching it.
  - Announcements are keyed by object name, so a connector that surfaces the same object twice
    cannot walk the count past its own denominator ("3 of 2").

  An exhausted sampling budget still walks the count to the end and reports the passed-over objects
  as `skipped`; freezing the count where sampling stopped would leave a completing stage looking
  identical to a wedged one.

  No new event type — `heartbeat` and its counts already exist, and readers already derive the
  latest counts from the stream.

- 4f20e10: An object the account cannot serve no longer advances its watermark.

  The `OBJECT_UNAVAILABLE` branch broke out of the fetch loop leaving `fetchCompletedCleanly` true, so
  control fell into the clean-fetch branch and treated a map that fetched **zero records** as one that
  had seen the complete set. On a full sync — and on a first encounter, where no watermark row exists
  yet — that minted a wall-clock `Timestamp` watermark. When the account later enabled the object, the
  next incremental filtered `modified > <the moment of the failed fetch>` and permanently missed every
  record that already existed, destroying the self-healing this path exists to provide. The same fall-
  through also ran orphan detection on an empty result and, under partition reconcile, overwrote the
  stored rollup snapshot with an empty map.

  The map still ends successfully with its single warning and no retry ladder — only the consequences
  of "we saw everything" are withheld. The warning is also now filed under the object name rather than
  the literal `'sync'`, matching every sibling warning, so per-object filtering works.

- 1f66f31: A completed sync's watermark is stored as a Timestamp again, not left typed as a Cursor.

  The watermark row is shared with the keyset resume position, which flips `WatermarkType` to
  `'Cursor'` mid-run. Creating a watermark stamps `'Timestamp'`, but updating one set only the value
  and `LastSyncAt` — so an entity map that saved a keyset cursor mid-run and then completed cleanly
  was left holding a timestamp value still typed as a cursor. `Load`'s consumers read the type to
  decide what the value means, so the next run could hand that timestamp back to the connector as a
  seek key.

  `UpdateExistingWatermark` now restores `WatermarkType='Timestamp'`, matching what creation already
  did. `RestoreValue` stays type-preserving on purpose: it undoes a mid-run durability floor, it does
  not declare a run complete.

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/integration-engine-base@6.1.0-edge.5
  - @memberjunction/integration-pk-classifier@6.1.0-edge.5
  - @memberjunction/integration-progress-artifacts@6.1.0-edge.5

## 6.1.0-edge.4

### Minor Changes

- a59e52d: Discovery can recognise a rate limit again — its throttle test could never return true.

  `IntrospectSchema` fans describes out to 8 concurrent and feeds each outcome to an AIMD controller that cuts the in-flight cap when an item reports `throttled`. It decided that by asking one question:

  ```ts
  return { ok: false, throttled: this.ExtractRetryAfterMs(err) !== undefined };
  ```

  and the base `ExtractRetryAfterMs` returned `undefined` unconditionally. So for any connector that did not override it — and for any error an overriding connector could not parse — the expression was `undefined !== undefined`, permanently false. The fan-out stayed at 8 straight through the vendor saying to slow down.

  Two changes, both in the base class so every connector inherits them:
  - **Classifier fallback.** The throttle test now falls back to `ClassifyError`, which reads the error's own text (`rate limit` / `throttl` / `429`) — the same classifier the sync fetch path already uses for exactly this decision. A connector's parsed value still wins when it has one; this is the floor beneath it. A throttled describe also emits an `introspect.object.throttled` event, so backing off is visible rather than inferred.
  - **`ExtractRetryAfterMs` reads the standard header by default.** `Retry-After` (RFC 9110 §10.2.3) in both delay-seconds and HTTP-date forms, from headers on the error, on `error.response`, or one level into `error.cause`. Values are bounded at 5 minutes, so a vendor returning a Unix timestamp as delay-seconds cannot freeze the token bucket for millennia; anything unusable falls back to the limiter's own decrease. Deliberately not a message-text parser — inventing a delay is worse than having none, so prose signals stay the connector's job.

  Connectors that already override `ExtractRetryAfterMs` keep their own parsing and are unaffected by the new default; they gain only the classifier floor for errors their parser returns nothing for.

  Ordinary describe failures are still not throttles: cutting concurrency on every error would make a permissions problem look like a rate limit.

- a04d5c9: A restart no longer turns concurrent syncs into a queue.

  Syncs are **started** concurrently — `processRSUPendingWork` launches each connector's `RunSync` without awaiting it — and were **resumed** serially: `ResumeOrphanedSyncs` awaited `ExecuteEntityMaps` + `FinalizeRun` inside its loop. So a restart silently converted a parallel workload into a queue ordered by whatever `RunView` happened to return, and the slowest connector became a head-of-line block for every other connector on the workspace. If it never finished, they never started.

  Observed live: a restart orphaned three syncs. One resumed and was still running five hours later; the other two (99,463 and 13,238 rows) never began. Nothing in the logs said so, because nothing had failed — they had never been reached. From outside the process a queued run and a crashed one are indistinguishable: `IsInFlight: true`, `CompletedAt: null`, counters frozen at the instant of the restart. The absence of an error is the only tell.

  The loop body is now `ResumeOneOrphanedRun` (line-for-line unchanged), run through a bounded pool. What is **not** parallelised: the write section stays serialized by `runWriteExclusive` — all maps share one provider connection with singular transaction state — and per-CompanyIntegration exclusion stays via the `activeSyncs` lock each resume takes. What overlaps is what overlapped before the restart: different connectors waiting on different sources.

  Bounded (default 4, `MJ_RESUME_CONCURRENCY` to override) rather than unbounded, because a workspace is one Node process: concurrency buys overlap on waiting, not more CPU, and a boot that adopted fifty runs at once would trade one pathology for another. A junk/zero/negative override falls back to the default rather than to 1 — silently restoring serial behaviour on a typo is the one outcome this must not have.

  The pool never stops early: one resume's failure costs exactly that resume, and the first error is rethrown only after every run has had its turn. Abandoning the queue on one bad item would recreate the head-of-line failure in a different shape.

### Patch Changes

- 6242df1: A transport failure is retryable again: read the error's `cause` chain, not just its message.

  `fetch` (undici) reports EVERY transport failure as the bare message `fetch failed` and puts the
  real reason — `ECONNRESET`, `ENOTFOUND`, `EAI_AGAIN`, `UND_ERR_SOCKET`, `socket hang up` — in
  `error.cause`. `ClassifyError` only read the top-level message, so that string matched no
  pattern, fell through to `UNKNOWN_ERROR`/`Critical`, and was therefore **not retryable**: a
  routine network blip ended the object's fetch loop, and the sync stopped early while reporting
  success on a partial pull. Measured on a long-running production sync, this fired every 30-60
  minutes and was indistinguishable from a completed run.

  `ClassifyError` now flattens the error's message plus every `cause` in the chain (depth-capped,
  so a cyclic chain cannot hang it) along with any `code`/`errno` found along the way, and checks
  an explicit list of transport-level signals FIRST — because a request that never reached a server
  carries no verdict, and must not be shadowed by a deterministic-looking keyword appearing deeper
  in the chain. Those classify as `NETWORK_TIMEOUT`/`Warning`, which the existing retry path
  already honors.

  Deliberately an explicit signal list rather than a loose substring: the neighbouring
  `DATABASE_ERROR` branch previously had to be narrowed for exactly that reason, and
  deterministic errors (duplicate key, FK violation, write-verification) must keep classifying as
  before.

- d40251e: Discovery samples are now bounded and observable:
  - **The base sampler enforces its own deadline between pages.** The deadline was handed to the connector so it could bound its internal fan-out, but a connector that ignores the marker (every connector predating it) keeps returning `HasMore=true` — and nothing above it enforced the budget at all, so an object one page short of its sample target was asked again forever. The sampler now stops at the deadline between pages, keeping everything collected so far. Legacy callers with no deadline are unchanged.
  - **A discovery watchdog names what is in flight.** From outside the process, a hung sample and a busy one were identical — nothing logged between start and end. While samples run, a ticker (default 15s, `MJ_INTEGRATION_DISCOVERY_WATCHDOG_MS`, `0` disables) names every object still in flight with its age, stage, pages, records, and time to deadline; silence now means the process is gone. The timer is unref'd and exists only while samples are in flight.
  - **Entry/exit lines with a budget marker.** `DiscoverFieldsViaFetch` logs what it set out to do and what it cost, and flags an object that consumed ≥90% of its time budget — separating "slow source" from "this object can never satisfy its stop condition".

- 29187f8: An explicit MAX width (`-1`) survives discovery instead of being silently narrowed.

  `-1` is the unbounded convention both dialects already speak — `sqlServerDialect` renders `len === -1` as `NVARCHAR(MAX)` and `postgresqlDialect` as `TEXT`. So it is the WIDEST width available, but two places ranked it as the narrowest:
  - `decideLengthOverlay` compared numerically, so `decideLengthOverlay(-1, 4000)` returned `4000` — any sampled width beat MAX. An operator who widened a column to unbounded because real values exceed every bounded width had it narrowed again on the next discovery.
  - `TypeMapper` routed `-1` through the `string` modality, where `resolveStringType`'s `maxLength > 0` test is false and the fallback is `NVARCHAR(255)` — the narrowest possible column for a field explicitly asked to be the widest.

  The consequence is worse than truncation: records too long for the re-narrowed column are **skipped whole**, so the data simply stops arriving with no error on the row.

  `decideLengthOverlay` now treats `-1` as the widest on both sides — a persisted MAX is never narrowed, and a source that reports unbounded upgrades a finite persisted width, consistent with the existing grow-only rule. `TypeMapper` resolves an unbounded width through the `text` modality, which each dialect already maps to its own unbounded type. A primary key is clamped to the dialect's key ceiling instead, since MAX is not indexable — a special case rather than a comparison, because `Math.min` would return `-1` here.

- f2fa6b3: Honour `Retry-After` between fetch attempts, and re-acquire a rate token on each retry.

  A 429 was already retried — `WithRetry` wraps `FetchChanges` and `IsRetryableError` admits `RATE_LIMIT_EXCEEDED` — but two things around that retry made the adaptation ineffective:
  - **The wait ignored what the source said.** `computeDelay` is pure exponential backoff plus jitter. The `Retry-After` a connector can already parse was consumed only by `RateLimiter.ReportThrottle`, which is called from the `catch` — after every attempt is exhausted. A source replying "expected available in 60 seconds" was retried on a ~1s/2s ladder regardless.
  - **Retries bypassed the limiter.** The rate token is acquired once, _before_ `WithRetry`, and never between attempts. So even once the bucket was frozen by a throttle report, the retries sailed straight past it.

  Net effect: a throttled object burned its attempts in a few seconds and ended with zero records, while every other object fetching concurrently kept hammering the source, because the shared bucket was never frozen in time to matter.

  `WithRetry` now takes two optional hooks, both no-ops for existing callers. `DelayForError` may replace the computed backoff with a source-directed wait — returning null or undefined keeps today's backoff, so a connector that cannot parse `Retry-After` is unaffected. `BeforeRetry` is awaited after the wait and before the next attempt, which is where the fetch path re-acquires its rate token, so a retry passes through the same gate the first attempt did and actually waits out the freeze.

- e7b4833: Index integration-object fields, and memoise the per-record field view.

  `GetIntegrationObjectFields(objectID)` was `this._integrationObjectFields.filter(f => UUIDsEqual(f.IntegrationObjectID, objectID))` — a full scan of every `IntegrationObjectField` in the process, on a path that runs **per record**: a connector's `RawToExternalRecord`/`TransformRecord` resolves an object's fields for every record it transforms. On a catalog of 364 objects, that scan plus the generated `IntegrationObjectID` getter it invokes per element measured **~46% of process CPU** in a live profile.

  It is now backed by a lazily-built `objectID → fields` index, keyed on the **identity** of `_integrationObjectFields`. The engine replaces that array wholesale on load/refresh (and `SeedForTesting` replaces it directly), so a new array is a new index automatically — there is no invalidation hook to forget. Keys are normalised the same way `UUIDsEqual` compares, so SQL Server's uppercase and PostgreSQL's lowercase land on the same bucket, and the `objectID == null` case keeps the original both-null-matches semantics via the unindexed path rather than inventing a magic key. Callers still receive a fresh array per call, so sorting or splicing the result behaves exactly as before.

  Also adds `RefreshCatalog()`, which re-reads **only** the `IntegrationObject`/`IntegrationObjectField` datasets straight from the database. `RefreshItem` will not do: it reloads through the local dataset cache, which is the very thing that goes stale when the catalog is edited by direct SQL, a sproc-based sync push, or another process — `BaseEngine`'s auto-refresh only observes in-process `BaseEntity` saves. Replacing the arrays is also what invalidates the memoised views, since both the field index and the connectors' `GetCachedFields` memo key on array identity.

- 9cce262: Refuse to write a record that has no value for its soft primary key.

  `CreateRecord` treated a missing mapped key as proof of a new row. That holds for a destination whose key is _generated_ — identity column, server-assigned UUID — because those rows are matched by record map rather than by key value. It does not hold for a **soft** primary key, which is the external system's own identifier stored as ordinary data: `DDLGenerator` deliberately emits it with no `PRIMARY KEY` and no `UNIQUE` constraint, since a unique constraint would reject legitimate rows. Nothing at the database level rejects a NULL key.

  A row written without its key can never be matched again. The next sync's existence check misses it and inserts another copy, and the pass after that inserts another. Every business column is populated and only the key column is empty, so nothing looks wrong from the outside — the failure is silent and compounding.

  The engine now refuses such a record before the insert/update decision, scoped to `IsSoftPrimaryKey` so generated-key destinations are entirely unaffected. The refusal is reported as `KEYLESS_RECORD_REFUSED` on the run's event stream (and to the console even without a logger — silence is the failure mode being fixed), names the entity and the key columns, and points at the two places the cause actually lives: the field map, and whether discovery resolved the object's primary key. It returns `'skipped'` rather than throwing, so one misconfigured object is counted instead of taking down the run.

  Any connector that returns an empty key reproduces this — a discovery that never resolved a PK, a field map missing the key column, a source that stops returning its id field — so the guard is the invariant that makes the whole class impossible to write.

  The refusal names the key columns that were actually absent rather than every soft column on the entity: `mappedPK == null` means some part of a composite key was empty, not all of it, and naming a populated column sends the operator to a field map that is working.

- 0aa2b91: Reactivating a connection no longer blocks on a live schema introspect, and stops reporting a failed refresh as a clean zero-count one.

  `IntegrationReactivateConnection` was the last schema-refresh path still awaiting the pipeline inline. Its two sibling mutations already gained `awaitSchemaRefresh` plus a detached launch; reactivate never did, and kept a hand-rolled copy of the message the shared builders exist to fix.
  - **Reactivation no longer scans the source.** `runSchemaRefresh` now defaults to **false**: resuming a connection and rescanning its schema are separate decisions that this mutation used to fuse. A one-click resume would spend minutes of a vendor's rate budget on an introspect nobody asked for, and the catalog is usually exactly as current as it was when the connection was paused. `IntegrationRefreshConnectorSchema` remains the operation for "rescan now"; pass `runSchemaRefresh: true` to get both. **This changes what an existing caller gets by default** — a client that passes only `companyIntegrationID` will now reactivate without a refresh.
  - **When a refresh IS requested, it is detached by default.** Reactivation is durably committed before the refresh begins — the mutation returns as soon as the connection is actually active, naming the run to tail. Holding the response open for the minutes a live introspect takes cannot make the reactivation more true, and a load balancer that terminates a held request at a fixed ceiling turns a succeeded operation into a reported failure with no run ID to check. Create and Update keep blocking by default, because there the caller is sitting on a wizard form and the counts are the answer they asked for. `awaitSchemaRefresh: true` restores blocking here.
  - **Failed refreshes say so.** The inline path formatted its counts unconditionally, and a pipeline that fails returns rather than throws with every count at zero — so a refresh that died at the credential check reported "0 created, 0 updated, 0 PK-unresolved", indistinguishable from a source with nothing new. Reactivate now goes through the same `describeFinishedRefresh` the other two use, so a failure is named as one.

  Also surfaces apply-time warnings for declared integration rows an apply silently leaves out: an `IntegrationObject`/`IntegrationObjectField` that a rediscovery or a schema-limit breach set to `Disabled` is excluded from the source schema the apply materializes, so the table appears without the column — or a requested object is not created at all — and nothing in the output said why.

- 74e161d: One covering index for every record-map lookup, and a per-record write path that matches the batched one.

  Every access path to `CompanyIntegrationRecordMap` resolves a row by `(CompanyIntegrationID, EntityID, ExternalSystemRecordID)` — `RecordMapBatch.readExisting` on the hot path of every sync, `LoadAllRecordMaps` for the orphan sweep, and `SaveRecordMap`'s upsert lookup. The table carried only its two single-column auto-FK indexes, so each read picked one and key-looked-up the rest, once per record per sync on a table holding a row for every record ever synced. A composite with `INCLUDE (EntityRecordID)` serves all three with no key lookup.

  Separately, `SaveRecordMap` now applies the rule `RecordMapBatch.flushChunk` has always applied: when the row already maps this external ID to this MJ record, return without loading or saving. A row pointing at a _different_ MJ record is still loaded and rewritten, and a missing row is still created — only the genuine no-op is skipped.

  Scope note: the apply loop builds a `RecordMapBatch`, so the ordinary incremental path was already filtered and never paid the per-record cost. `SaveRecordMap` is reached from call sites outside the apply loop and as the batch's own per-record fallback when a set-based write fails — which is where it mattered most, since that fallback degraded into two round trips per record.

- d31cba4: A connector can declare a source field excluded from sync.

  There was no way to say "do not sync this field". The nearest lever — deactivating its field map — does not exclude the value, it **reroutes** it: `FieldMappingEngine` captures every unmapped source key into `UnmappedFields`, the writer parks it in `__mj_integration_CustomOverflow`, and the custom-column promoter can later resurrect it as a real column. So the field costs more, not less.

  `SourceFieldInfo.SyncDirective?: 'Sync' | 'Exclude'` closes that. `undefined` means Sync, so connectors that predate this behave exactly as before.
  - **Persisted with no migration.** `IntegrationSchemaSync` writes the directive into `IntegrationObjectField.Configuration`, an existing JSON column. Overlay semantics match every other attribute — a stated directive wins, a silent connector preserves what is stored — so an operator-set directive survives connectors that never heard of the feature.
  - **Stripped before flatten and before mapping.** An excluded key reaches neither `MappedFields`, nor `UnmappedFields` (and so never the overflow column), nor the content hash, whose basis is `MappedFields`. An excluded field therefore stops influencing change detection entirely, rather than quietly forcing rewrites. The no-exclusions path allocates nothing.
  - **Visible in the run log.** The engine resolves the exclusion set once per entity map and emits `sync.entity-map.exclusions` naming what was withheld.

  Existing columns are untouched: exclusion stops fetching into them, and dropping a column stays an operator decision.

- ec71199: Mid-run watermark durability floor — the watermark twin of the keyset checkpoint. A watermark-based connector had no durable position at all until its run ended: a SIGKILL / OOM / container recycle mid-object threw away hours of applied batches, and the next run re-fetched the entire window from the last completed run's watermark. The 25-batch checkpoint now also persists the max watermark seen (`currentWatermark` only advances at the end of a fully-applied batch, so the floor can never point past an unwritten record). The floor is gated on no page-skip gap having occurred — a skipped page can hold records behind the max watermark seen, i.e. a hole behind the floor — and a floor already written is retracted to the pre-run value the moment the first gap appears, restoring the exact hold semantics the post-loop save has always had. Keyset connectors (their position is the seek key) and partition-reconcile maps (their watermark row stores the rollup snapshot) are excluded. `WatermarkService.RestoreValue` is new, accepting null because the prior state may be "no watermark yet".
- c4e98ce: Enforce within-batch ExternalID identity before mapping.

  ExternalID is the identity the record map keys on, so two records in one batch carrying the same one
  are two observations of a single source record — never two rows. The write path cannot detect this:
  it decides insert-vs-update by asking whether the identity exists in the DATABASE, and for a
  first-time record neither copy does, so both insert and the pair re-inserts on every later sync. The
  existing fingerprint guard only catches a batch repeated in full (the infinite-loop case), not
  duplicates inside one batch.

  Measured on a live tenant: one object held 54,119 rows for 42,519 distinct keys — 11,632 excess,
  across 11,200 duplicate groups that were byte-identical on every captured column and written within
  the same second, i.e. the source listed the same element twice inside one batch.

  The engine now collapses duplicate identities per batch, keeping the last occurrence (upsert
  semantics: the later entry is the more recent observation), and reports the count as a
  `DUPLICATE_IDENTITIES_IN_BATCH` warning rather than silently — a connector emitting duplicate
  identities is a defect worth fixing at its source. Records with no ExternalID pass through
  untouched, since collapsing those would merge unrelated rows.

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [e7b4833]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/integration-engine-base@6.1.0-edge.4
  - @memberjunction/integration-pk-classifier@6.1.0-edge.4
  - @memberjunction/integration-progress-artifacts@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 711c208: Durable sync runs: lease/fence run ownership, DB-backed cancellation and progress, and an opt-in worker mode.

  A sync run is now owned by exactly one process for the life of its lease. `MJ: RSU Pending Work` records the queue, and each run carries an owner token, lease expiry, heartbeat, and fence token, so a stalled or killed process releases its work instead of stranding it, and a resumed process cannot write through a newer owner's fence. Cancellation and progress move through the database rather than in-process state, so either is observable and actionable from any process. The engine no longer shares a single provider across concurrent runs — each run carries its own through an `AsyncLocalStorage` context — and run history is pruned to `MJ_INTEGRATION_MAX_RUNS_PER_CI`.

  RSU post-restart work moves the same way: `RuntimeSchemaManager` now registers it as `MJ: RSU Pending Work` rows instead of `.rsu_pending` files that were deleted as they were read, so a crash mid-consumption leaves visible, resumable work rather than losing it silently. Registration failures are reported on the pipeline result — a migration whose post-restart work never persisted no longer reports success, since the restart discards that work.

  **Additive on the public API.** Reading progress and requesting cancellation now hit the database, which cannot be done from a synchronous method, so they ship under new names: `IntegrationEngine.GetSyncProgressAsync()` and `IntegrationEngine.CancelSyncAsync()`. The three published statics they supersede — `GetSyncProgress`, `CancelSync`, `GetAllSyncProgress` — keep their exact original signatures so a consumer taking this minor upgrade still compiles. They are marked `@deprecated` and are no longer functional, because the in-process map they read no longer exists; each logs once naming its replacement, and each returns the value that previously meant "nothing to report" (`undefined`, `false`, empty map) rather than pretending to have succeeded.

  `RuntimeSchemaManager`'s pending-work entry points follow the same rule, since it too is exported from a published package. `ReadAndClearPendingWork()` keeps its zero-argument signature, warns once, and returns an empty array. `WritePendingWork(data)` keeps compiling — its new `contextUser` parameter is optional — but the one-argument form throws rather than returning a fabricated ID, because a durability queue that silently discards work is worse than one that fails loudly. Both replacements, `ReadPendingWork()` and `WritePendingWork(data, contextUser)`, are named in the messages.

  **One caveat on "additive", for TypeScript consumers.** The paragraph above concerns the deprecated statics. The `Status` value list itself is a different matter: it widens from five values to seven (`Queued`, `Cancelled`), and CodeGen turns a CHECK constraint into a literal union. Widening a union a consumer _reads_ is source-breaking in two patterns — assigning `run.Status` into a narrower hand-written type, and an exhaustive `switch` with no `default` and a declared return type. That is not hypothetical: the Integration dashboard in this repo carried two hand-copied `Status` unions and both had already fallen behind `Queued`. Consumers on those patterns will need one edit; the fix in both cases is to derive the type from the entity (`MJCompanyIntegrationRunEntity['Status']`) rather than restate it, which is what this PR does to the dashboard.

  **Two behaviour changes that are not compile breaks but are observable.** A cancelled run now reports `Cancelled` rather than `Failed`, so anything keyed on `Status='Failed'` — external dashboards, alerts, error-rate SLOs — will report fewer errors than before. And cancellation is now resumable, so "cancel, then re-run to re-pull" no longer re-fetches the window before the cancel point; that needs an explicit full sync.

  **`Cancelled` is now a run status.** `CK_CompanyIntegrationRun_Status` gains it alongside `Queued`, so a deliberately-stopped run records itself instead of being finalized as `Failed` with an explanatory `ErrorLog` — which meant every health, cadence, and error-rate consumer booked operator cancellations as errors unless it string-matched that text. `RunOwnershipService.Release` now takes a `TerminalRunStatus` (`Extract`-ed from the entity's own union, so the terminal subset can never drift from the CHECK constraint), and the Integration dashboard's status colours, icons, activity filter and KPIs handle both new values — its two hand-copied status unions are replaced with indexed access to the entity, which is also how they had already fallen behind `Queued`.

  **A cancelled sync no longer repeats its work on resume.** Stopping mid-fetch logged `— saving watermark`, but only keyset connectors actually persisted a position; a watermark-based connector saved nothing, so the next incremental re-fetched everything back to the last clean run. Measured on a 2,000-record source cancelled at 1,400: the following incremental processed 1,750 records (resuming from 250) where it now processes 600. The max watermark seen is persisted whenever whole batches completed and no page was skipped — never wall-clock `now`, since partial coverage must not advance past the point actually reached, and never when a page was skipped, because that leaves a hole behind the watermark.

  **Sync options survive a process death.** The run row now records its options (the shape `EnqueueSync` already wrote), and `ResumeOrphanedSyncs` reads them back, so an adopted run finishes what was asked for. Previously the resume rebuilt config from the `CompanyIntegration` alone: a `FullSync` that lost its owner resumed as an _incremental_, re-fetched nothing, and reported `Success` — the opposite of why a full sync is requested. The resumed run also reports its real trigger type rather than a hardcoded `Scheduled`.

  The worker's startup line moves from verbose-only to standard log level. `Stop()` already logged at standard level, so logs showed a worker stopping that never started, and there was no way to confirm from logs that a process was in worker mode.

- 9cd81ca: Integration apply path: stop record-map write amplification, surface pagination violations, and stop blocking the connection wizard on a schema refresh.

  `MJ: Company Integration Record Maps` is the highest-volume table the sync path writes — one row per external record ever mapped, re-touched every sync — and unlike its run-log siblings it still shipped with `TrackRecordChanges = 1`, so every mapping upsert also wrote a `RecordChange` row and doubled a sync's write volume. Nothing reads that history: the mapping row is the current state, and operators audit a sync through the per-run artifact stream. Change tracking is now off for that entity; existing history rows are left in place. Separately, a connector returning an oversized batch (a pagination-contract violation) is now reported rather than absorbed silently, and `IntegrationUpdateConnection` can launch its schema refresh without waiting on it.

  `MJCompanyIntegrationEntityServer` gains `SuppressActivationSchemaRefresh`, a transient opt-out that stops the activation (`IsActive` false→true) schema refresh from running inside `Save()` when the caller is going to run it itself. `IntegrationCreateConnection` sets it for `awaitSchemaRefresh: false`, which makes that flag actually non-blocking on create — previously the Save-side refresh ran first and awaited, so the mutation paid a full live introspect regardless — and moves the introspect after the connection test, so a connection rejected by that test is rolled back without having written IntegrationObject rows. Default false, so every other activation path is unchanged.

  `IntegrationConnectorCreationPipeline.Run()` now honours a caller-supplied `RunID` even when it coalesces onto an already-running or just-completed run for the same CompanyIntegration. Previously the supplied ID was silently discarded, so a caller that had already handed it to a client as "the run to tail" left that client polling a run directory that was never created — `IntegrationTailRunEvents` answering "Run not found" forever, which is indistinguishable from "hasn't started yet". A coalesced call now publishes a terminal alias run under the requested ID that mirrors the served run's outcome and names it, so the ID is always tailable.

### Patch Changes

- 2003cd3: Make the `FetchChanges` per-page timeout configurable instead of a hard-coded 30s.

  `IntegrationEngine` previously wrapped every `FetchChanges` call in `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs` (30s) with no way to change it. That punished the connectors that need it most: a connector that fans out one request per parent record does `BatchSize` requests inside a single `FetchChanges` call, so its page time scales with batch size and with however much concurrency the adaptive controller currently allows. Once a page exceeded 30s the timeout fired and `WithRetry` re-ran the _same_ page, paying the full cost again, until the retry budget was spent and the object ended with an incomplete result set.

  Two new resolution sources, checked before the framework default:
  - `CompanyIntegration.Configuration` → `{"fetchTimeoutMs": 120000}` — per-deployment, no code change. Settable and readable as a typed `FetchTimeoutMs` field on the `IntegrationSetSyncConfig` / `IntegrationGetSyncConfig` GraphQL surface, alongside the concurrency, rate-limit and discovery-budget knobs it sits with in that JSON.
  - `BaseIntegrationConnector.FetchChangesTimeoutMs` — a connector declares its own default (`null` keeps the framework's 30s).

  Precedence, highest first: `Configuration.fetchTimeoutMs` → `connector.FetchChangesTimeoutMs` → `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs`. **Both** override sources go through the same guard: non-numeric, non-finite and non-positive values are rejected and fall through to the next source. That matters for the connector source in particular — its declared type is `number | null`, so `0`, a negative, or the `NaN` you get from `Number(process.env.UNSET)` are all type-legal, and `setTimeout` coerces every one of them to ~1ms rather than erroring, which would silently time out every page. Resolution happens once per entity map.

  Fully backward compatible — with neither source set, behavior is byte-identical to before. `FetchChangesTimeoutMs` is additive to the `BaseIntegrationConnector` public surface, and `patch` is still the right level: every MJ package shares one `fixed` group, so `minor` is reserved for branches that change the database (a migration, or `metadata/**` that becomes one at release). This branch changes neither.

  Separately, an **unskippable fetch failure no longer completes silently.** When a persistent error hits a page the engine cannot page past (cursor paging, or the page-skip budget spent), the object stops with an incomplete result set — and previously reported nothing, so an object whose very first page failed was indistinguishable from a clean "nothing changed" run. It now emits a structured `FETCH_ABORTED_INCOMPLETE` warning on the run-event stream **and** records a `Warning`-severity entry in `CompanyIntegrationRun.ErrorLog`, so the condition survives in queryable run history rather than only in a pod-local artifact. The run's `Status` is deliberately unchanged (`Success` unless a record actually errored): the watermark is held, so the unfetched window is retried next run — this is a warning, not a failed run.

- bb79505: Tell a connector when it is being sampled, so a discovery sample cannot silently become an exhaustive walk.

  Discovery needs a corpus, not a corpus of everything: ~50 records is enough to infer columns, types, string widths and a provable primary key. `DiscoverFieldsViaFetch` already knows that and already computes a budget — but it hands that budget to the code CONSUMING the record stream, and the consumer only regains control BETWEEN `FetchChanges` calls. Nothing was ever passed to the connector, and `FetchContext` had no field for it, so a connector could not honour a budget even if it wanted to. It had no way to know it was being sampled rather than synced.

  That is survivable while one `FetchChanges` is one HTTP page — the consumer stops after 50 records and the gap never shows. It is not survivable for a parent-scoped object, where a single call fans out internally into one request per parent: control does not come back until every parent has been walked, so there is nothing for the consumer to interrupt. Observed live 2026-08-12: a Totara discovery spent 28 minutes inside one `FetchChanges`, walked every parent, and returned `rows=0` — half an hour of correct, pointless work to collect a sample it could never have found there.

  `FetchContext` gains three optional fields, set by `DiscoverySampleRecordStream`:
  - `IsDiscoverySample` — this call exists to characterise the shape of the data, not to move it.
  - `SampleTargetRecords` — stop once this many records have been collected.
  - `DeadlineMs` — epoch ms after which the connector should stop and return what it has.

  `SampleTargetRecords` is deliberately the primary stop and `DeadlineMs` only the backstop. A child object yields records only through its parents, so capping the number of parents visited would be wrong — if the first three courses have no enrolments you genuinely must keep walking to find fifty rows. Counting records stops the walk the moment it has enough, at whatever parent that happens to be; the deadline exists for the other case, parents that will never yield anything, where no record count is ever reached and only the clock can end it.

  No behaviour change on its own: every field is optional and a connector that ignores them behaves exactly as before. `DiscoverySampleRecordStream` gains an optional trailing `deadlineMs` parameter, so existing overrides keep compiling unchanged.

- 52490a7: Discovery now honours the `discoveryMaxRecords` setting it already exposed.

  `DiscoverFieldsViaFetch` resolves three budgets from per-connection Configuration, falling back to env then a default. Two of them read Configuration. `maxRecords` did not — the read was simply absent from the line:

  ```ts
  timeBudgetMs = opts ?? cfgInt(cfg.discoveryTimeBudgetMs) ?? env ?? default   // wired
  batchSize    = opts ?? cfgInt(cfg.discoveryBatchSize)    ?? env ?? default   // wired
  maxRecords   = opts ??              (nothing)            ?? env ?? default   // not wired
  ```

  Everything around it worked: `discoveryMaxRecords` is declared in the config type, documented in the comment directly above as a per-connection knob, accepted and persisted by `IntegrationSetSyncConfig`, returned by `IntegrationGetSyncConfig`, and surfaced in the product as a "Max records" settings field. The value saved and was read back correctly — nothing ever used it.

  The effect was that the one discovery budget an operator actually wants to lower for a slow source was the only one that could not be changed without an app setting and a process restart, while its two siblings were settable from the UI.

  Precedence now matches the other two: explicit opts > per-connection Configuration > operator env > default. No default changed.

- 5b30129: Stop one hung discovery from making a connector permanently unrefreshable.

  `Run()` coalesces concurrent callers for the same CompanyIntegration onto a single promise, and removes the map entry in a `finally` — which only fires when that promise SETTLES. A run that hangs therefore owned its slot forever, and every later refresh took the `if (inFlight) return inFlight` path and attached to a promise that would never resolve. No new run started, no `run.start` was emitted, nothing reached the workspace log: from the outside the request simply vanished.

  That is the whole explanation for behaviour that read as random for two days. A fresh process discovers in ~4 minutes; one hang poisons the slot; every attempt after it hangs; restarting the workspace clears the in-memory map and it appears fixed — until the next hang. Observed live 2026-08-12: a run frozen at `EventCount 5` with healthy runs on either side of it, and a customer pressing Re-check to no effect and no log output.

  Coalescing is correct for concurrent callers, but it is only safe if runs terminate, and nothing guarantees that. The entry now carries its start time and expires after `IN_FLIGHT_MAX_AGE_MS` (20 minutes): past that a caller stops trusting it and runs fresh, logging the discard. This does not stop the stalled work — a promise is not cancellable — it stops one hang from costing every future attempt.

  The `finally` now clears the slot only if it still holds _this_ run's promise, so a run settling after it was evicted cannot drop a newer run's entry.

- d29d6b9: Stop retrying the engine's own `FetchChanges` timeout — it multiplied load on sources that were already too slow.

  `WithTimeout` is a `Promise.race` with no cancellation: when the budget expires it rejects, but the wrapped operation **keeps running**. `ClassifyError` maps the timeout to `NETWORK_TIMEOUT` and `IsRetryableError` treats that as transient, so the fetch path retried it — up to `MaxAttempts: 3`.

  For a connector that fans out one request per parent record inside a single `FetchChanges` call, that meant attempt 1 timed out with its requests still in flight, ~1s later attempt 2 issued a _second_ full page of vendor requests overlapping the first, and ~2s later a third overlapped both. Up to **3× the concurrent load on a source that could not finish the work once** — a reliable way to earn a genuine 429, which _does_ back the adaptive limiter off. And the retry could never have succeeded on its merits: the same work under the same budget exceeds it again.

  `WithTimeout` now rejects with a new exported `OperationTimeoutError` (same message text, so `ClassifyError`, logging and the run-event stream are unchanged), and the fetch retry predicate excludes it by `instanceof`. The exclusion is deliberately identity-based rather than dropping `NETWORK_TIMEOUT` from `IsRetryableError`: `ClassifyError` folds `econnreset` in under that same code, and a reset socket genuinely is worth retrying. A vendor's own "gateway timeout" also stays retryable — only a budget _this engine_ set is treated as terminal.

  A page that exceeds its budget now fails once and lets the object end incomplete, which surfaces as the `FETCH_ABORTED_INCOMPLETE` run-event warning rather than after three full-cost attempts. Deployments that need a longer budget raise `Configuration.fetchTimeoutMs` or the connector's `FetchChangesTimeoutMs`, which is what those knobs are for.

  Also corrects a comment on `BaseIntegrationConnector.FetchChangesTimeoutMs` that described a timeout→concurrency-cut spiral. Only `RATE_LIMIT_EXCEEDED` feeds the adaptive limiter; a timeout never cut concurrency directly.

- af4bd79: Report a sub-minute connector-run deadline in seconds rather than rounding to
  minutes, and add the first test coverage for `RunDeadlineMs`.

  `RunDeadlineMs` is a public option and a caller may pass seconds, where rounding
  produced "the run deadline of 0min" — which reads as a pipeline bug rather than
  the limit the caller asked for. The 45min default is unaffected.

  The three new tests pin what a live run against a real database proved: a stage
  that never returns is failed _and_ writes `result.json` (the point of the
  deadline, since a run is reported in-flight precisely when that file is absent),
  the label renders in seconds, and `0` means "no deadline" rather than "already
  expired".

- f315e44: Give the connector-creation pipeline a whole-run deadline, so a hung stage fails instead of running forever.

  Every other budget in this system bounds something _inside_ a stage, and none of them can preempt an `await` that never settles. A connector's `outOfTime()` is only checked between requests; an HTTP abort signal governs only its own request; the discovery sample budget is spent by the code reading the stream. There is always one more layer able to stall — and when one does, the pipeline waits on it forever.

  Forever is literal. `complete()` and `fail()` are the only writers of `result.json`, and both sit inside the try/catch around the stages, so a stage that never returns reaches neither. Since `isInFlight` is computed as "result.json is absent", the run then reports itself running for the rest of time: no client can learn otherwise, no retry clears it, and the customer is left with a spinner over work that stopped being observable.

  Observed live 2026-08-12, three times on one connector — ConnectionTest completing in ~1s, Introspect starting, and the event stream flat for ten minutes and counting, against a reference run that finished the entire pipeline in 3m53s.

  Stages are now raced against `RunDeadlineMs` (default 45 minutes; 0 disables). This does **not** stop the stalled work — a promise is not cancellable, so it keeps running until the process ends — it stops _waiting_ on it. The run fails honestly, writes its artifact, and becomes retryable. A reported failure you can act on beats silence you cannot.

  The default is deliberately far above any healthy run, so it only ever fires on work that has genuinely stopped rather than work that is merely large.

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/integration-engine-base@6.1.0-edge.3
  - @memberjunction/integration-pk-classifier@6.1.0-edge.3
  - @memberjunction/integration-progress-artifacts@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- de343b5: Stop error diagnostics from carrying credentials into the log.

  **GraphQL transport.** `graphql-request`'s `ClientError` serialises the originating request — variables included — into its own `message` at construction, and V8 then embeds that message in `stack`. A mutation carrying a secret therefore holds it in three places on the error at once, and `ExecuteGQL` logged the object directly before calling `LogError(e)`, which stringifies it and re-emits the same payload. Redacting `request.variables` on a copy reaches none of that; spreading the error to redact it also drops `message` and `stack`, since both are non-enumerable on `Error`.

  New `SanitizeGraphQLError` builds a fresh diagnostic object from an allowlist of safe fields instead — re-deriving the message from `response.errors[0]` and stripping the header line off `stack` — so a change to the upstream error shape cannot silently widen what is logged. Response status, GraphQL errors, error code, query text and stack frames are all preserved; only values are withheld, and the log gains the variables' _shape_ (key names and value types, never values) so a redacted failure stays diagnosable. The caught error is never mutated, so JWT-expiry handling and every caller of the rethrown error are unaffected.

  `GraphQLProviderConfigData.LogVariableValues` (default `false`) opts in to logging values during development, mirroring the server's existing `loggingSettings.graphql.logVariables` tier.

  **OAuth2 token endpoints.** A token endpoint is the one call where a credential arrives in a response _body_. Five sites echoed that body into an `Error` message: the Integration and Actions OAuth2 managers, the MCP client's `TokenManager` and `ClientRegistration`, and the SharePoint storage driver's token refresh. RFC 6749 §5.2 says an error response carries no token, which makes this look safe — but token endpoints routinely echo the failing request back, and that request carries `client_secret` and the refresh token. The Integration site was reached on HTTP 200 as well, whenever the token sat somewhere its parser did not look, in which case the echoed body _was_ the access token.

  New `describeTokenEndpointFailure` in `@memberjunction/global`, shared by all five, surfaces only `error` and `error_description` and withholds everything else, including bodies that fail to parse.

  No API removals and no behaviour change for callers: the only observable differences are the contents of log lines and the text of token-endpoint error messages.

- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/integration-engine-base@6.1.0-edge.2
  - @memberjunction/integration-pk-classifier@6.1.0-edge.2
  - @memberjunction/integration-progress-artifacts@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/integration-engine-base@6.1.0-edge.1
  - @memberjunction/integration-pk-classifier@6.1.0-edge.1
  - @memberjunction/integration-progress-artifacts@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/integration-engine-base@6.1.0-edge.0
  - @memberjunction/integration-pk-classifier@6.1.0-edge.0
  - @memberjunction/integration-progress-artifacts@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/integration-engine-base@6.0.0
  - @memberjunction/integration-pk-classifier@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/integration-progress-artifacts@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/integration-engine-base@5.51.0
  - @memberjunction/integration-pk-classifier@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/integration-progress-artifacts@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- 1e0008f: fix(integration): apply-phase correctness — identity, completeness, and record-map durability

  Defects in the sync apply phase, all of which corrupt data rather than fail loudly.
  - **Content-unchanged records skipped their tombstone repair.** A record marked deleted in MJ but alive again externally hashes identical on every subsequent sync, so it never reached the sync-state repair and stayed tombstoned permanently. The early return now runs the repair before returning.
  - **Record-map loads stopped at the entity row cap.** `RunView` without `MaxRows` is not unbounded — it falls back to `UserViewMaxRows` (1000 by default). The orphan sweep silently stopped cleaning past row 1000, and worse, the full-push path read a missing mapping as "never pushed" and re-created records that already existed in the external system. `LoadAllRecordMaps` now walks the map with `AfterKey` keyset paging ordered by `ID` with `IgnoreMaxRows`, bounded by a `MAX_PAGES` backstop, and reports a `Complete` flag; callers that did not get the whole map refuse to act on it rather than acting on a partial one. Keyset rather than `StartRow` because OFFSET paging skips rows on PostgreSQL, where `gen_random_uuid()` primary keys are random rather than monotonic and concurrent inserts can land before the cursor.
  - **Identity was decided by two competing rules.** The entity primary key (soft PKs included) is now the single definition of record identity for both matching and saving. `IsKeyField` remains a fallback lookup for records whose mapped data does not carry the PK, and is no longer AND-ed on as an additional constraint when a complete PK is present.
  - **Record-map writes were three round trips per record on the hot path** — a lookup, a load, and a save, paid for every record the sync touched including the ones it decided not to change. The new `RecordMapBatch` resolves a whole chunk against the database in one `RunView` and then writes only the rows that are actually new or actually point somewhere different, so an incremental sync where mappings are stable costs one read and zero writes per chunk. Writes go through the provider's entity layer (`GetEntityObject` + `Save()`), not hand-written SQL, so they are dialect-agnostic by construction and still get field validation, timestamps, Record Changes and — the one that bites silently — the save event that invalidates `LocalCacheManager`. Per-row error attribution is structural rather than reconstructed: each mapping is its own `Save()` returning its own boolean, so a bad row names itself and its chunk-mates are unaffected. `Queue()` deliberately does not auto-flush on a full chunk — it is called from inside the apply pass's batch transaction, where a flush would write map rows that `Discard()` could no longer take back on rollback. The apply loop flushes once per batch, after commit.
  - **Identity lookups were one query per record.** They are now prefetched per field-set group, issued as one `RunViews`. The batched path indexes external IDs both exactly and collation-folded (lowercased, trailing blanks stripped), because the single-query path let SQL Server compare — case-insensitive and trailing-blank-insensitive under a default collation — while pairing rows in JavaScript with `===` would read `AB-100 ` against a stored `ab-100` as unmapped and create a duplicate record. **The fold is applied only on SQL Server**: PostgreSQL's `=` on text is case-sensitive and pads nothing, so folding there would hand back a mapping the database itself did not return and turn a CREATE into an UPDATE of a different row. A folded key that more than one distinct mapping collapses onto is marked ambiguous and deferred to the per-record query rather than guessed at, as is an ID that was never in the batch's `IN (…)` list. Absence is only ever concluded from a read that can prove it.
  - **A non-ASCII external ID was invisible to every record-map lookup on SQL Server.** The lookups embed the external ID as a SQL literal, and a bare `'…'` on SQL Server is a _varchar_ literal: any character outside the database's collation codepage is replaced with `?` before the comparison runs. Under the default `SQL_Latin1_General_CP1_CI_AS`, `ünïcödé-Ω-日本語` reads as `ünïcödé-O-???` and matches the stored (nvarchar) row zero times — so the record looked unmapped and was created a second time in the customer's external system on every sync. The literals are now `N`-prefixed on SQL Server (no prefix on PostgreSQL, whose literals are already Unicode), which also removes the implicit conversion that would otherwise sit on the column. Applied at all three lookup sites — the batched read, the batched read's per-record fallback, and `MatchEngine`'s per-record query — so they cannot disagree about a value.
  - **Batch sizes are configurable and clamped.** `MJ_INTEGRATION_RECORD_MAP_CHUNK_SIZE` (default 500, ceiling 5,000 — a chunk becomes one `IN (…)` list, so the filter text grows linearly with it) and `MJ_INTEGRATION_RECORD_MAP_PAGE_SIZE` (default 10,000, ceiling 50,000). Out-of-range values are clamped with a logged warning rather than accepted.

  Also: a schema pipeline whose migration already committed is never retried, so a retry cannot re-run a committed install step.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/integration-engine-base@5.50.0
  - @memberjunction/integration-pk-classifier@5.50.0
  - @memberjunction/integration-progress-artifacts@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Minor Changes

- 70113b1: Align the integrations framework — resolution overlay, EM/EFM lifecycle, sync locking, watermark backfill, and the U1–U5/U7/U10/U11 upstream defects.

  **Engine (`integration-engine`)**
  - U1: `IntrospectSchema`/creation-pipeline mappings propagate `undefined` PK/FK flags instead of coercing to `false` — a sample's silence can no longer wipe a declared primary key (`SourceFieldInfo.IsPrimaryKey/IsForeignKey` widened to optional).
  - Semantic overlay (`decideSemanticOverlay`): Description / DisplayName / IncrementalWatermarkField are external-wins-when-present, curated-fallback-when-silent (per-attribute overlay precedence).
  - Content-hash basis: the content-hash match/write covers MAPPED fields only — a newly-appearing custom key no longer forces a row rewrite. Custom-key candidates + sizing statistics are aggregated in-memory per sync (`SyncResult.CustomKeyStats`, `foldCustomKeyStats`, `inferColumnTypeFromStats`) and flow to the promotion callback regardless of row skips. **Operational note (one-time):** because the content-hash basis becomes mapped-only, the first sync after this deploys re-hashes and re-writes every overflow-carrying row exactly once — a bounded one-time load spike plus Record-Changes churn — after which stored hashes converge and steady-state (skip-unchanged) writes resume.
  - Maintenance lock (`AcquireMaintenanceLock`/`ReleaseMaintenanceLock`/`GetMaintenanceLock`): syncs refuse while a metadata refresh / schema evolution / RSU pipeline runs for the connection.
  - U3: live sync progress is monotonic under concurrency (`RatchetProgressSnapshot`).
  - U11: `IntrospectSchemaOptions.OnProgress` — determinate discovery progress (scanned/total).

  **Server (`server`)**
  - `IntegrationSchemaEvolution` is now the full re-resolution refresh: re-resolution → diff → removed objects' entity/field maps disabled (data kept) → changed objects' field maps reconciled + Pull watermarks reset (U10, backfills new columns) → new objects' tables created with entity maps born DISABLED (`autoEnableNewObjects` opts in) → RSU. Extended output: NewObjects/RemovedObjects/ChangedObjects/WatermarksReset.
  - `IntegrationApplyAll`/`ApplyAllBatch`: `UnselectedAction` ('disable' default) — objects absent from the selection get their entity + field maps disabled; re-selection re-enables both. First-ever apply defaults to a FULL sync.
  - U7: schedule creation is unique per (connection, job kind) — update-in-place instead of duplicates.
  - U5: boot-time assert when RSU's additionalSchemaInfo write path diverges from CodeGen's read path.
  - DAG exposure: `IntegrationListSourceObjects` items carry `DependsOn` parent names.
  - U11: RSU status/progress expose CurrentStepName/StepIndex/StepTotal; pipeline steps carry StepIndex/StepTotal.

  **SchemaEngine / schema-builder**
  - additionalSchemaInfo per-table REPLACE semantics for soft FKs (`ClearForeignKeysForTables`) — a refresh's resolution replaces the prior run's FK entries for its tables.
  - `RSUPendingWork`: `UnselectedAction` + `CreateDisabled` for the post-restart consumer; U11 step-index fields.

  **CodeGenLib / PostgreSQLDataProvider**
  - U2: `spUpdateExistingEntityFieldsFromSchema` honors `IsSoftPrimaryKey` on BOTH dialects (PG emitter + SQL Server migration) — schema sync no longer wipes resolved soft PKs.
  - U4: a keyless entity now throws a named "has no primary key" error instead of emitting malformed record-change SQL.

### Patch Changes

- 48fa886: Fix (U1): schema-discovery PK overlay now enforces the rsuplan "either/or" rule — a **declared** primary key wins over a **stream-discovered** one, per rsuplan line 29 ("find a primary key … only for objects where there is no primary key defined").

  Previously `IntegrationSchemaSync.UpsertField` applied `decideBooleanOverlay` to `IsPrimaryKey` per field with no object-level awareness, so a streamed unique column (e.g. HubSpot `hs_object_id`) was **added on top of** the declared PK (`id`), fabricating a composite key. When the added component was nullable/unpopulated, the generated `spCreate` read-back (`SELECT … WHERE a=@a AND b=@b`) could never match (SQL `x = NULL` is never true) → `"no rows returned"` → 0 rows synced.

  The overlay now computes, per object, whether a declared (non-`Discovered`) PK already exists. If it does, discovery may not promote a _different_ field to PK — its uniqueness is still recorded via `IsUniqueKey`. Streaming still runs on every object for column/width/custom-field discovery; only the PK promotion is gated. Connectors whose streamed key equals the declared PK are unaffected.

- 314f667: Stop silently truncating nested-child data in REST integration sync, plus two reliability fixes.
  - **Nested-child completeness** — `DescendTemplateVars` now drains a parent's FULL paginated child collection instead of capping it at `ctx.BatchSize`. The outer batch size bounds how many PARENTS a call processes (resumable via the parent keyset, never mid-child), so applying it to the per-parent child fetch permanently dropped every record past the first batch with no bookmark to ever revisit it. Live-verified: Wild Apricot Donation/Event/Invoice/Payment (single-parent, capped at 200 each) and a Mailchimp list's full 501-member set now land completely.
  - **Write-verification errors** — classify a create that returns no rows (`"no rows returned from SQL"`) as a distinct, non-retryable `WRITE_VERIFICATION_ERROR` instead of the retryable `DATABASE_ERROR` catch-all; retrying an identical write only reproduces the identical miss.
  - **Narrower DATABASE_ERROR match** — the over-broad `"sql"` substring match was routing deterministic failures through retry-with-backoff for no reason; it now keys on real transient signals (deadlock / connection lost).
  - **StartSync run-detection window** — extend the poll for the run record (fast first 2s, longer tail) so a large connector's synchronous setup (e.g. HubSpot's 168 entity maps) isn't misreported as "no run created" while it is genuinely syncing.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/integration-engine-base@5.49.0
  - @memberjunction/integration-pk-classifier@5.49.0
  - @memberjunction/integration-progress-artifacts@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/integration-engine-base@5.48.0
  - @memberjunction/integration-pk-classifier@5.48.0
  - @memberjunction/integration-progress-artifacts@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/integration-engine-base@5.47.0
  - @memberjunction/integration-pk-classifier@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/integration-progress-artifacts@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/integration-engine-base@5.46.0
  - @memberjunction/integration-pk-classifier@5.46.0
  - @memberjunction/integration-progress-artifacts@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/integration-engine-base@5.45.1
- @memberjunction/integration-pk-classifier@5.45.1
- @memberjunction/integration-progress-artifacts@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- 81a8aa2: Custom-column promotion gate (U3) + opt-in reclaim planner (U7) — two pure decision functions in `CustomColumnPromotion.ts`; the engine PLANS, the consumer executes.

  **U3 — hold promotion until a full sync (`planPromotions` + `PromotionPlanOptions.LockUntilFullSync`).** After a rediscovery, an _incremental_ sync only re-syncs changed rows, so unchanged rows still carry now-vanished keys in their overflow JSON — a coverage scan over that stale mix could **phantom-promote** a column the source already dropped. A full sync evicts every stale key per-row (`reconcileOverflowValue`, shipped in the schema-fidelity change), making the scan trustworthy. When `LockUntilFullSync` is set, `planPromotions` plans **nothing** — the engine's half of "lock column-application until the sync after a schema change." The engine supplies the lever; the consumer owns the state (it knows when a full sync completed) and pulls it. Default (undefined/false) = unlocked, so existing callers are unchanged.

  **U7 — opt-in reclaim of vanished promoted columns (`planColumnReclamations`).** A promoted column the source stops sending currently lingers all-NULL (non-destructive by design). This adds a **pure, triple-gated, default-OFF** planner: it returns candidates only when the deployment opts in (`ReclaimVanishedColumns`) AND a full sync was observed (`FullSyncCompleted`), and even then only for a column that is BOTH all-NULL across that full sync AND absent from the source. Nothing is dropped by default, and a column holding data is never a candidate. Symmetric to `planPromotions`: the engine only PLANS the drop; the consumer/RSU performs the destructive DDL.

  Both are pure and deterministic (sorted output), matching the existing `decideLengthOverlay` / `reconcileOverflowValue` pattern. Unit-tested (2 lock cases + 4 reclaim cases). No migration; no behavior change unless a caller passes the new options.

### Patch Changes

- f99cbc1: Fix: template-var **child** objects now receive sampled field metadata at discovery, and the parent's addressing key is **resolved from the fetched rows** rather than presupposed.

  A second-layer object whose API path nests under a parent (`/orgs/{OrgId}/events`) resolves its parent IDs through `LoadParentIDs`, which reads the **synced** DB. At discovery nothing is synced yet, so the child yields zero records → it is sampled with no fields (no widths, no PK, no custom-column capture), silently falling back to declared-only metadata. Discovery instead **walks the same DAG sync walks** — parents before children, a child reading its parents — but adapted with a rough per-table record limit (~`maxRecords`) and reading parents from a **live sample** instead of the DB. This is a single recursive routine (`StreamRecordsForDiscovery`), **uniform to all depths**: a template-var child streams its parent by calling the _same routine_ one level up, so a grandparent is sampled identically. Because each level pulls its parent lazily and there is **no per-level cap**, the child's fill-to-N demand propagates up the _entire_ dependency chain to the parentless top — the "fill to N" completion happens at the top of the chain, not locally. A million-row ancestor is streamed and cut off early (record-constrained, unlike sync which walks every row).

  Crucially, the parent's addressing-key **field name is not presupposed**. After fetching the parent it is resolved, in order: (1) a **declared PK** in metadata; else (2) the engine's **value-statistic PK classifier run over the rows fetch just returned** (`pickKeyFromStats` / soft-fallback — discovery-via-fetch, the same determination used everywhere). If neither resolves, the parent is genuinely keyless and its child **adjourns** (caught on the first real sync). No conventional identity name is ever guessed — a field name is never assumed for a field the data doesn't prove is the key.

  Discovery-only and additive: it runs through a dedicated path (the REST `DiscoverySampleRecordStream` override → `StreamRecordsForDiscovery`), so the **sync path** (`FetchWithTemplateVars` → `LoadParentIDs`) is untouched — `ZERO_PARENTS` and the "sync the parent first" DAG contract are unchanged; non-template-var objects are untouched. Multi-var (composition) children are **deferred**: the sampler adjourns them (declared-only until first sync) rather than fire malformed URLs at the vendor. The parent live-sample is an HTTP fetch with no SQL, so it is dialect-agnostic — identical on SQL Server and PostgreSQL. Covered by unit tests: the pre-fix zero-record gap, a declared-PK parent, a **keyless parent whose key is resolved from the fetched rows**, the record bound, and the sync path staying unchanged.

- 11d5b4e: Fix (MJ#3047): quote the primary-key identifier in the content-hash prefetch filter so an integration object whose PK column name is a SQL reserved word (e.g. Zendesk `custom_objects.key`) no longer silently loses idempotency.

  `IntegrationEngine.PrefetchContentHashes` built its bulk stored-hash lookup as `WHERE key IN (…)` with the PK identifier unquoted. For a reserved-word PK the database rejects the query; because the prefetch is best-effort it swallows the error and returns nothing, so the content-hash idempotent-skip fast path can never engage — every unchanged record is re-written on each sync (inflated `RecordsUpdated`, redundant writes). The filter now quotes the PK identifier(s) **and** value literals through the provider's dialect (`DatabaseProviderBase.Dialect` → `[key]` on SQL Server, `"key"` on PostgreSQL), so it is valid on both targets without reintroducing the SS-brackets-break-Postgres problem the previous unquoted form was guarding against. Filter construction is extracted to a pure `buildContentHashPrefetchFilter` helper with unit tests covering reserved-word single + composite PKs on both dialects.

- 82ca89b: Two catalog-fidelity fixes for the connector discovery/sync pipeline:
  - **Width never shrinks on rediscovery (U2).** `IntegrationSchemaSync`'s per-field overlay assigned the rediscovered `MaxLength` directly, so a rediscovery whose sample happened to be narrower than a prior run shrank the persisted `IOF.Length`. RSU only ever widens the physical column (never shrinks it), so the catalog drifted below the column (catalog `nvarchar(128)` vs column `nvarchar(512)`) and a later apply keyed off the catalog could truncate a value the wider column still holds. The overlay is now a pure `decideLengthOverlay` that grows the persisted width but never shrinks it (a null/undefined source width is "no opinion" — the persisted value sticks).
  - **Stale overflow keys are evicted on re-sync (U4), which also stops phantom promotion (U3).** The custom-overflow write only fired when a record had unmapped fields, so when a source column vanished the record's unmapped set emptied, the write was skipped, and the prior overflow JSON (with the now-gone key) stuck around forever — where a coverage scan could still promote it to a real column. The write now reconciles to the record's CURRENT unmapped keys on every sync (`reconcileOverflowValue`), clearing the column to null when there are none, so a vanished key is evicted the next time its row is synced. Byte-identical for customs-free rows (writing null to an already-null column is a no-op under dirty tracking).

  Both are extracted as pure, unit-tested decision functions (`decideLengthOverlay`, `reconcileOverflowValue`) matching the existing `decideBooleanOverlay` pattern. Code-only, no migration.

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/integration-engine-base@5.45.0
  - @memberjunction/integration-pk-classifier@5.45.0
  - @memberjunction/integration-progress-artifacts@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/integration-engine-base@5.44.0
  - @memberjunction/integration-pk-classifier@5.44.0
  - @memberjunction/integration-progress-artifacts@5.44.0

## 5.43.0

### Patch Changes

- b98366b: Integration framework hardening for wide-catalog and multi-level connectors (extracted from the 20-connector close-out; no connector-specific code).
  - **Wide-table safety (dialect-driven in-row size + column-count limits).** The row-size knowledge now lives in the dialect abstraction, not in platform string-branching: `SQLDialect` gains `MaxInRowSizeBytes` (SQL Server `8060`, PostgreSQL `null`), `MaxColumnCount` (SQL Server `1024`, PostgreSQL `1600`), and `EstimateInRowBytes(rawSqlType)` (SQL Server's per-type in-row footprint; base default a conservative off-row pointer). `SchemaBuilder` consumes these via `GetDialect()` — for a dialect with a hard in-row limit it keeps all primary-key columns + a declared-priority core subset within budget, defers the rest (they still sync and land in `__mj_integration_CustomOverflow`), and emits a structured warning instead of shipping a table that fails every `INSERT` with `Cannot create a row of size … greater than 8060`; a dialect with no in-row limit (PostgreSQL/TOAST) only gets a soft advisory near its column-count cap. `IntegrationEngine` adds an env-clamped per-table column ceiling (`MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE`, max 1000 = SQL Server's 1024 minus framework column headroom) so column-count-driven failures degrade to a reversible auto-disable at apply time. Proven on netFORUM (wide objects 8/17 → 15/17, zero 8060 INSERT failures); 17 row-size unit tests.
  - **Multi-level template-var traversal.** `BaseRESTIntegrationConnector.ResolveParentForVar` adds a per-variable parent map (`Configuration.parentObjectNames` `{ "<var>": "<SiblingObject>" }`, with optional `parentObjectIDFieldNames`), checked before the existing single-valued `parentObjectName`. This lets a path with more than one template variable (e.g. `/events/{eventCode}/sessions/{sessionCode}/…`) resolve each variable to its own parent object instead of collapsing both to one parent and tripping the `PARENT_CYCLE` guard (→ 0 rows). Backward-compatible: connectors that declare no `parentObjectNames` are unaffected.
  - **Large-catalog ApplyAll performance.** `IntegrationDiscoveryResolver.createEntityAndFieldMaps` reuses the already-in-memory persisted field schema (built in Phase 1) instead of issuing a live per-object `DiscoverFields` describe in a sequential loop, and resolves the target entity via an `O(1)` `schema.table → EntityInfo` map instead of an `O(N²)` scan. This removes the per-object round-trips and ~millions of comparisons that pushed very large catalogs (e.g. Salesforce's ~1,695 objects) past the client timeout with zero maps created.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/integration-engine-base@5.43.0
  - @memberjunction/integration-pk-classifier@5.43.0
  - @memberjunction/integration-progress-artifacts@5.43.0

## 5.42.0

### Minor Changes

- 6ac8ca4: feat(integration): v2 integration framework + unified connector set (GrowthZone, OpenWater, ORCID, PropFuel, Path LMS)

  Consolidated integration-v2 work — framework hardening + five connectors — proven end-to-end via the
  GraphQL stand-up path (clean DB, CreateConnection → ApplyAll → StartSync) on SQL Server.

  **Integration core (`integration-engine`, `integration-engine-base`, `integration-schema-builder`):**
  - Deterministic §4 content-hash identity stamp for keyless rows (stable storage key + idempotent re-sync).
  - Door-before-child dependency ordering derived from soft-FK `parentObjectName`/`ReferencedType` — children
    land in one pass (no ZERO_PARENTS, no second-sync self-heal).
  - Adaptive rate-limit hooks (`RateLimitAcquire`/`Report`/`MaxConcurrency`) on `FetchContext`.
  - Shared `auth-helpers` (`OAuth2TokenManager`); `KeySerialization`/`RecordFlatten` committed (were
    imported-but-untracked — fresh clones could not build); `IntegrationEngineBase.SeedForTesting` for
    offline replay harnesses.

  **Schema correctness + sizing (`integration-engine`, `integration-schema-builder`):**
  - `json`/`text`/`array`/`object` and unsized strings map to `NVARCHAR(MAX)`/unbounded text instead of
    being collapsed to `nvarchar(255)` — a nested-array JSON or long field routinely exceeds 255 and was
    dropped at sync time (OpenWater `Program.rounds` went from **0** rows to all of them). Bounded scalar
    strings keep a small, space-efficient size (255 floor; declared length + headroom when the source
    reports one; PK strings capped at the dialect index-key limit). Soft-PK columns are emitted nullable.
  - String-overflow is **skip-and-surface** (`STRING_OVERFLOW_SKIPPED` SyncWarning via the new
    `StringOverflowError`), not truncate or fail-the-batch.
  - **Active-only materialization (phantom-skip):** `buildSourceSchemaFromPersistedRows` materializes only
    `Status='Active'` objects/fields — no empty phantom tables, no wasted per-entity CodeGen/advancedGen cost.

  **StartSync honesty (`server`):**
  - `IntegrationStartSync` no longer returns optimistic `{Success:true, RunID:null}` for fast/no-op syncs;
    it resolves the run by recency over a bounded poll (real `RunID`), and returns `Success:false` with a
    message when no run record appears.

  **Soft-PK config cache (`codegen-lib`):**
  - `RunInProcess` invalidates `ManageMetadataBase`'s soft-PK/FK config cache per in-process run — the
    path-keyed cache went stale in the long-lived MJAPI RSU CodeGen path ("No primary key found" → entity
    never created → 0 rows synced until restart). Deterministic; the CLI `Run()` path is unchanged.

  **Unified connector set (`integration-connectors`):**
  - **GrowthZone** — OAuth2, 38 objects, idempotency + probe-amended pagination metadata.
  - **OpenWater** — 25 objects, OpenAPI-complete.
  - **ORCID** — 12 per-record objects, public-API live-verified.
  - **PropFuel** — file-feed slice (rich REST API documented out-of-scope).
  - **Path LMS (Blue Sky eLearn)** — GraphQL Reporting API, pull-only; GraphQL over `/graphql`, two-step
    app-credential → bearer auth; credential-free discovery from the public SpectaQL schema (84 record
    types / 1175 fields); per-object `AccessPath` walks the 16 GraphQL query doors to leaf records;
    content-hash idempotency.
  - All five validated under the v2 architecture (RealityProbe / completeness-diff / T12 idempotency).

  **Migration + metadata (additive schema → minor):** ships forward migration(s) + integration metadata
  seeds; additive only — no column drops, narrowing, renames, or new required params — backward-compatible
  **minor** per the publish-then-no-breaking-changes policy.

### Patch Changes

- 6520bea: Add MemberSuite (AMS) integration connector — REST API v2, 196 objects / ~6,000 fields extracted credential-free from MemberSuite's public module swaggers (CRM/membership/events/fundraising/financial). Signed-request auth via auth-helpers, narrow Activity/Certification write surface, runtime custom-field/saved-search discovery, full-record pass-through. Adds the `MemberSuite API` credential type. Also adds the additive `OAuth2TokenRequest.ExtraParams` field required by the existing RhythmConnector (engine patch).
- 5ebf0e9: Add the netFORUM Enterprise (Community Brands AMS) connector — xWeb SOAP/XML route.
  - **`NetForumConnector`** (`@memberjunction/integration-connectors`): integrates netFORUM Enterprise via the xWeb SOAP/XML web service (`netForumXML.asmx`), implemented as SOAP-over-HTTP on `BaseRESTIntegrationConnector`. Two-step `Authenticate` token auth; `GetQuery`/`GetQueryDefinition`/`ExecuteMethod` reads; per-facade `*_last_updated_dt` incremental watermarks; facade CRUD where the xWeb docs establish it. The standard Enterprise object model (34 Integration Objects) is Declared from the public xWeb WSDL; customer-specific queries/views/custom columns are runtime-discovered via `GetQueryDefinition` (`DiscoveryIsAuthoritative=false`), never baked into the connector.
  - **`@memberjunction/integration-engine`**: adds the optional `OAuth2TokenRequest.ExtraParams` field (extra `application/x-www-form-urlencoded` grant-body params, e.g. Auth0 `audience`), forwarded by `OAuth2TokenManager` with standard params taking precedence. This is the engine half of the OAuth2 change `RhythmConnector` already depends on.

  > **Note:** netFORUM's denormalized facades (e.g. `Individual`, `FundraisingGift`) can exceed SQL Server's hard 1024-column-per-table limit when fully flattened; those objects need column-overflow handling at the framework level before they can materialize as single tables.

- Updated dependencies [9b9b484]
- Updated dependencies [6ac8ca4]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/integration-engine-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/integration-pk-classifier@5.42.0
  - @memberjunction/integration-progress-artifacts@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/integration-engine-base@5.41.0
  - @memberjunction/integration-pk-classifier@5.41.0
  - @memberjunction/integration-progress-artifacts@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/integration-engine-base@5.40.2
- @memberjunction/integration-pk-classifier@5.40.2
- @memberjunction/integration-progress-artifacts@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/integration-engine-base@5.40.1
  - @memberjunction/integration-pk-classifier@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/integration-progress-artifacts@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/integration-engine-base@5.40.0
  - @memberjunction/integration-pk-classifier@5.40.0
  - @memberjunction/integration-progress-artifacts@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- db4addf: feat(integration): Integration Framework Expansion — schema + metadata-driven CRUD base class, generated layer, cross-dialect hardening, and field-mapping cache

  End-to-end increment expanding the integration framework: new per-operation write metadata on the schema, a generic metadata-driven CRUD base class, the regenerated entity/GraphQL/form layers that expose it, plus the cross-dialect (PostgreSQL + SQL Server) bug fixes and a field-mapping performance cache found while proving it live.

  **Schema (v5.39.x migration)**
  - `IntegrationObject`: explicit per-operation write columns — `CreateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `UpdateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `DeleteAPIPath`/`DeleteIDLocation`. The legacy `WriteAPIPath`/`WriteMethod` are kept one release as deprecated aliases.
  - `IntegrationObject`: `IncrementalWatermarkField` — vendor cursor/timestamp field name driving the incremental sync filter.
  - `IntegrationObject` + `IntegrationObjectField`: `MetadataSource` enum `{Declared, Discovered, Custom}` — provenance for merge precedence in `IntegrationSchemaSync`.

  All schema changes are additive (new nullable fields + a new enum field) — no existing field is removed, renamed, or narrowed — so the bumps are **minor**.

  **Engine / base class (`@memberjunction/integration-engine`)**
  - `ExternalFieldSchema`: add `IsPrimaryKey` (distinct from `IsUniqueKey`). Fixes an `IntrospectSchema` bug where `IsPrimaryKey` was incorrectly mapped from `IsUniqueKey` — an object can have multiple unique fields but only one primary key.
  - `BaseRESTIntegrationConnector`: new `TransformRecord` hook — optional per-record customization seam between `NormalizeResponse` and `ToExternalRecord` (default identity); override for vendor-specific record-level shape changes.
  - `BaseRESTIntegrationConnector`: generic metadata-driven CRUD — `CreateRecord`/`UpdateRecord`/`DeleteRecord`/`GetRecord` read the per-operation columns and execute generically. Concrete connectors override only when an API is genuinely idiosyncratic. Replaces the hand-rolled write logic previously duplicated across every concrete connector.
  - `FieldMappingEngine`: cache compiled `custom`-transform expressions instead of recompiling `new Function` once per field per record. A batch of N records sharing an expression compiles it once and executes the cached function N times, dropping per-record cost from `O(compile + execute)` to `O(execute)`. The cache stores a typed `CompiledExpression = (value, fields) => unknown` (no weak typing), caches compile failures too (a malformed expression is compiled once and the resulting `Error` re-thrown from cache per record, leaving `OnError` `Fail`/`Null`/`Skip` semantics unchanged), and is bounded by `MJLruCache` (1000-entry default) since the owning `IntegrationEngine` is a process-lifetime singleton.

  **Generated layer (CodeGen for the v5.39.x migration)**
  - `@memberjunction/core-entities` — `IntegrationObjectEntity` / `IntegrationObjectFieldEntity` gain strongly-typed accessors for the per-operation write columns, `IncrementalWatermarkField`, and the `MetadataSource` enum (`'Declared' | 'Discovered' | 'Custom'`).
  - `@memberjunction/server` — regenerated resolvers / GraphQL types expose the new fields.
  - `@memberjunction/ng-core-entity-forms` — regenerated `MJ: Integration Objects` / `MJ: Integration Object Fields` forms render the new fields.

  **Cross-dialect hardening (PostgreSQL + SQL Server)**

  Bugs found and fixed while proving the framework end-to-end on both dialects with live generated actions:
  - `@memberjunction/codegen-lib` — PostgreSQL CRUD generation emitted the primary-key column twice for composite-PK entities, so association/junction tables never synced on PG; `PostgreSQLCodeGenProvider` now treats a multi-column PK as strategy-handled. Soft-PK/FK application uses dialect-aware identifier quoting and boolean literals (`this.dialect.QuoteIdentifier` / `BooleanLiteral`) so the pass runs correctly on PostgreSQL.
  - `@memberjunction/server` — wired the PostgreSQL branch of the in-process CodeGen runner (`RuntimeSchemaManager.SetCodeGenRunner`) that previously existed only for SQL Server, so runtime schema sync no longer falls back to a hang-prone child process on PG. `IntegrationDiscoveryResolver` entity/field-map creation is now create-or-reuse (idempotent on re-apply), and its idempotency + operational list reads use `BypassCache` so create-vs-update decisions read committed state.
  - `@memberjunction/integration-engine` — `MatchEngine.FindRecordMapEntry` and the bulk record-map load now read committed state (`BypassCache`), fixing duplicate-create after a direct-DB change; watermark save/load is idempotent to avoid a transaction-abort on retry. `LoadRunConfiguration` and every remaining operational decision-read — the upsert-by-identity record-map lookup, field-maps, the full-vs-incremental gate, write-back external-id lookup, orphan-sweep, and orphaned-run resume — now also `BypassCache`. This closes a Postgres-only gap where a freshly-toggled entity-map `Configuration` (e.g. enabling partition/Merkle reconcile) was read stale → the ChangeToken rollup was silently never written on PG, and removes the broader read-stale-then-decide bug class so the read-your-own-writes pipeline always decides from committed state on both dialects.
  - `@memberjunction/core-actions` — the generated integration-action executor used stale entity names (`'Integrations'`, `'Company Integrations'`); corrected to `'MJ: Integrations'` / `'MJ: Company Integrations'` so `List`/`Get` invoke successfully.
  - `@memberjunction/core-entities-server` — declares its previously-undeclared `@memberjunction/integration-pk-classifier` dependency (used by the server-side LLM PK-detection callback), fixing the missing-dependency check; covers the integration server-entity behavior (`MJCompanyIntegrationEntityServer`, `IntegrationLLMPKCallback`).
  - Multi-provider safety — the post-pipeline metadata `Refresh()` calls in `IntegrationDiscoveryResolver` and `MJCompanyIntegrationEntityServer` now refresh the request's own provider (`provider ?? new Metadata()`) instead of the global default, satisfying the `MultiProviderCompliance` gate and refreshing the correct cache under a non-default provider.
  - Dialect layer (`@memberjunction/sql-dialect`) — statement splitting for runtime schema migrations is now a dialect concern: `SplitStatements` (naive `;`-split on the base, dollar-quote-aware override on PostgreSQL so `DO $$…$$` blocks stay intact) instead of living in the schema-engine runtime.

### Patch Changes

- a1e2776: Add an idempotent `Upsert` verb to integration connectors, implemented for HubSpot contacts.

  **Engine** (`integration-engine`): a new CRUD verb alongside Create/Update/Delete — a `SupportsUpsert` capability getter and a default-throwing `Upsert(ctx)` on `BaseIntegrationConnector`, a new `UpsertRecordContext` type (carries `Attributes` plus an optional `IDProperty` override of the upsert key), and an optional `UpsertKey` field on `IntegrationObjectInfo` so objects can declare their natural unique business key. Purely additive: existing connectors inherit the throwing default, `UpsertKey` is optional, and the action-generator verb set is unchanged (no auto-generated Upsert action).

  **HubSpot** (`integration-connectors`): `HubSpotConnector` overrides `Upsert` for contacts. This defines an error out of existence — a search-then-create sequence has a window in which a concurrent writer can create the same email-keyed contact, yielding `409 Contact already exists`; rather than catch and special-case that 409, `Upsert` issues a single idempotent call to `POST /crm/v3/objects/<object>/batch/upsert` with a batch of one (`idProperty`/`id` per input, `id` = the upsert-key value), which creates-on-missing and updates-on-existing without a 409, removing the race window entirely. The `idProperty` defaults from the object's `UpsertKey` metadata (`email` for contacts) and is overridable per call. It uses the write-verb error pattern: it never trusts a bare 2xx (a batch envelope reporting `numErrors`, a non-`COMPLETE` status, empty `results`, or a result with no object id all surface as `Success:false`), and a missing key/value fails with a 400 before any API call.

  Note: the single-record `PATCH /crm/v3/objects/contacts/{email}?idProperty=email` was verified live to NOT create-on-missing (404), so the batch/upsert-of-one is the correct single-call idempotent path; the documented multi-input batch caveats (whole-batch 409, no partial upserts) do not apply at size one.

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/integration-engine-base@5.39.0
  - @memberjunction/integration-pk-classifier@5.39.0
  - @memberjunction/integration-progress-artifacts@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/integration-engine-base@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/integration-engine-base@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/integration-engine-base@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/integration-engine-base@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/integration-engine-base@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/integration-engine-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/integration-engine-base@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/integration-engine-base@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/integration-engine-base@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/integration-engine-base@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Minor Changes

- 9154ac7: feat(integration): Salesforce + Sage Intacct pipeline hardening

  **This is in-progress work — not ready to merge.** PR is open for incremental review and discussion.

  ### Sage Intacct connector
  - Range-chunked walk over `RECORDNO` for numeric-PK objects, replacing the previous PK-cursor strategy that silently dropped records when SI's natural scan order wasn't PK-ascending.
  - Upper-bound discovery via exponential probe so termination is exact (not heuristic).
  - Sub-range verification on every completed chunk (independent count of two halves must sum to the parent's count) to catch SI inconsistencies that would otherwise silently undercount.
  - Discovery-probe retry with backoff for transport-only errors; immediate fail-stop on SI API errors (permissions, schema, syntax).
  - `WHENMODIFIED` filter values normalized to SI's `MM/DD/YYYY HH:mm:ss` format — the engine sometimes passes ISO 8601 which SI rejects with `DL02000001`.
  - Bumped `DEFAULT_PAGE_SIZE` from 100 to 1000 (proven safe via probing); legacy single-pull path now hard-fails on full-page-no-resultId instead of silently dropping records via PK-cursor.

  ### Salesforce connector
  - Removed dead `queryLocator` member field. `if (this.queryLocator && ctx.CurrentCursor)` was always false (member never assigned), so every "next batch" call re-executed the original SOQL and returned the same first page until the engine's duplicate-batch guard aborted the entity. Continuation now uses `ctx.CurrentCursor` directly via `FetchNextPage`.
  - Per-batch dedup by `Id` for system metadata sObjects (TabDefinition, FormulaFunctionAllowedType) where SF returns multiple records sharing the placeholder Id `000000000000000AAA`. Drops are logged once per object instead of producing N per-record `UQ_<table>_PK` constraint violations.
  - Removed the over-aggressive `!obj.createable` filter on `isUserRelevantSObject`. Many SF objects are flagged non-createable but carry real customer data (rollups, attachment-link junctions, history-style records).
  - `BuildSOQLQuery` no longer emits `LIMIT batchSize` — that was silently capping every full result set at the page size. Pagination is via SF's native `done` / `nextRecordsUrl`.
  - Watermark comparison uses `>=` instead of `>` so records modified at exactly the watermark instant aren't dropped on the next sync.

  ### IntegrationEngine
  - New typed `SchemaNotGeneratedError` (and `detectSchemaNotGenerated` helper) — `CreateRecord`/`UpdateRecord` now detect the SQL Server `Could not find stored procedure` pattern, throw the typed error, and `ProcessPullSync` fail-stops the entire EntityMap with one `[CONFIGURATION_ERROR]` log line + remaining records marked skipped. Previously every record produced an identical per-record error, drowning sync reports in O(records) duplicates.

  ### Picker → ApplyAll resolver fixes (`IntegrationDiscoveryResolver`)
  - New `resolveSourceObjectsToNames` per-item ID/Name fallback resolver. The old `resolveSourceObjectNames` only honored the IDs path and silently discarded any selection that arrived with `SourceObjectName` only (typical for newly-discovered objects with no IntegrationObject row yet). Real-world impact: 1,156 picker selections were collapsing to 420 IntegrationObjects to 181 generated tables. `LogError` now fires on truly unresolvable selections.
  - `buildTargetConfigs` collects every silent skip into three buckets (`notInSchema`, `noFields`, `noPK`) and emits a single summary line per call: `[buildTargetConfigs summary] requested=X, accepted=Y, dropped=Z (...)`. Lossy stages in the pipeline are now greppable.

  ### SchemaEngine RSU pipeline
  - `executeMigration` chunks oversized migration SQL (>32KB) into batches of 25 statements per `ExecuteSQL` call. Salesforce-class schemas (1100+ tables) produce migrations with 17K+ ALTER TABLE statements as a single batch, which exceeded mssql's client request timeout (30s). Each chunk now resets the timeout clock.

  ### Other
  - `IntegrationSchemaSync` and `IntegrationApplyAllBatch` plumbing for filtered IntrospectSchema flow (Salesforce-only path that describes selected objects rather than a full-org probe).
  - Integration dashboard UI tweaks (connections page rendering for high-FK supertype entities).

### Patch Changes

- 216ddc3: Wrap sequential Save/Delete looops in atomic transcatoins (TransactionGroup client-side BeginTransaction/Commit/Rollback server-side)
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/integration-engine-base@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/integration-engine-base@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Minor Changes

- 1d62875: feat: bidirectional sync engine, HubSpot/YM connector improvements, RSU #2239 fixes
  - Integration engine now respects SyncDirection (Pull/Push/Bidirectional) on entity maps
  - Push sync uses Record Changes to detect MJ-side modifications, reverse-maps fields, and calls connector CRUD methods
  - Separate Push watermarks tracked alongside Pull watermarks
  - New IntegrationWriteRecord GraphQL mutation for ad-hoc writes to any connector
  - HubSpot: 130 objects with full field metadata; association CRUD via v4 PUT/DELETE API; composite hs_object_id for association sync
  - YourMembership: 228 objects with accurate PKs across all endpoints; 400 errors now surfaced (not silently swallowed); DateTime.MinValue → null conversion
  - SchemaBuilder logs DDL history to \_\_mj_integration.SchemaHistory (separate schema, not surfaced as MJ Application)
  - IntegrationObject.IsCustom column added to distinguish static vs runtime-discovered objects
  - RSU #2239: in-process SQL execution for CodeGen (no sqlcmd dependency)
  - RSU #2239: RSU_RESTART_COMMAND env var override for non-PM2 environments
  - SQLServerDataProvider: incremental schema sync improvements

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/integration-engine-base@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/integration-engine-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/integration-engine-base@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/integration-engine-base@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/integration-engine-base@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/integration-engine-base@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/integration-engine-base@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/integration-engine-base@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/integration-engine-base@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/integration-engine-base@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/integration-engine-base@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [d2c4e54]
  - @memberjunction/integration-engine-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Minor Changes

- bbfbf5e: Runtime Schema Update (RSU) system with 32 integration lifecycle API endpoints, schema evolution, sync cancellation, watermark filtering, progress polling, and cascade delete fixes.

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/integration-engine-base@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/integration-engine-base@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/integration-engine-base@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Minor Changes

- 140fc6d: Add HubSpot v4 association fetch, fix empty-string-to-null coercion for HubSpot datetime fields, widen GetCachedObject/GetCachedFields visibility to protected, and fix OpenAI streaming max_completion_tokens parameter
- 6489cd8: metadata

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/integration-engine-base@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/integration-engine-base@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration
- 257512b: feat: Integration scheduled job type, YM/HubSpot connector improvements, CodeGen custom view refresh
  - Add ScheduledJobRunID FK to CompanyIntegrationRun and ScheduledJobID FK to CompanyIntegration (migration v5.12.x)
  - Add Integration Sync scheduled job type metadata
  - Pass contextUser through HubSpot credential loading for proper server-side data isolation
  - Make YM connector performance defaults (retries, timeouts, batch size, throttle) overrideable per Configuration JSON
  - CodeGen now auto-emits sp_refreshview for custom base views (BaseViewGenerated=false) so devs don't need to add it manually to migrations
  - BaseIntegrationPointAction scaffold for future write-back actions

### Patch Changes

- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/integration-engine-base@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/integration-engine-base@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/integration-engine-base@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/integration-engine-base@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/integration-engine-base@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0
