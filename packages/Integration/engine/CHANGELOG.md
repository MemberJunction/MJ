# @memberjunction/integration-engine

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
