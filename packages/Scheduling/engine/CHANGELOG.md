# @memberjunction/scheduling-engine

## 6.2.0-edge.5

### Minor Changes

- b14c72f: Add the personal Chief of Staff (`Chief of Staff`) AI agent, per-user narrowed governance (`MJ: AI Agent User Policies` + `AgentUserPolicyEngine`), 3-Tier Wake Gate on `MJ: User Routines` (`RoutineType = 'AgentWake'`), user-scoped calendar/email/availability actions (`EnterpriseMailboxSecurityGate`), and Communication Dashboard enterprise governance cards.
- ce758af: Feature Pipelines: keyed, versioned Feature Values and honest runs (migration `V202610201100__v6.2.x__Feature_Value_Key_And_Versions.sql`).
  - Feature Values upsert on a key (record, feature, pipeline version, prompt version, primary model, parameters, input); a value a person entered (`Source='Human'`) is never overwritten unless the run sets `overwriteHumanValues`. Child write-back can `reconcile` rows on a key.
  - `MJ: Feature Pipeline Versions` registers each pipeline pin; a gated pipeline runs only under a version whose golden-set result meets its threshold. The `Steward Feature Pipeline Version` Action (`StewardFeaturePipelineVersionAction`) and `Feature Pipeline Version Steward` Record Process (`WorkType='Action'`, scheduled via `RecordProcessScheduledJobDriver`) evaluate and backfill changed versions; golden sets carry a label-quality record, `Required` and `ExpectAbstain` cases.
  - New `@memberjunction/feature-pipelines-engine` package houses server-side Feature Pipeline execution (`InferProcessor`, `BaseFeaturePipelineDriver`, `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver`, `FeaturePipelineEscalation`, `FeaturePipelineHumanValueGuard`, `FeaturePipelineErrors`), golden-set testing (`FeaturePipelineGoldenSetDriver`, `golden-set-scoring`, `golden-label-quality`), and version stewardship (`FeaturePipelineVersionSteward`, `StewardFeaturePipelineVersionAction`, `RegisterInferRecordProcessor`), keeping `@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`, `@memberjunction/scheduling-engine`, and `@memberjunction/testing-engine` free of Feature Pipeline dependencies.
  - Outputs are checked against `lookup` constraints (per item with `ItemRef`); an output below its `MinConfidence` is withheld (`OnLowConfidence: 'null'`); `Context.RecordAsUserMessage` sends the record as a JSON user turn.
  - Dry runs write nothing, preview only what the real write would change, cap at 25 records and report `WouldRefuse`; a Feature Pipeline run with a failed record ends `Failed` with a `FeaturePipelineRunResult` summary; the breaker counts attempted records.
  - An output may omit its write target (builder target mode `Feature value only (no write-back)`): the answer is stored in `MJ: Feature Values` only, typed by its constraint (`numeric`/`money`, `boolean`, `date`), and no entity field is written. The Bulk Operations dry-run dialog shows each as a `<Feature> (feature value)` row with the previous and proposed value, and loads only the non-skipped details so a large scope counts every changed record.
  - A Feature Values panel on every record form shows the latest answer per pipeline and feature (Source, Confidence, version, Computed, Reasoning) and expands to its history; a latest answer that withheld its value reads "no value". `@memberjunction/ng-base-forms` re-resolves the form chrome when a panel mounts after first render, so a late panel gets its left-nav entry.
  - The Version Steward beats on a timer while its backfill runs, defers a backfill while a run is Running, marks only a clean run as backfilled, and ignores a Running Process Run not checkpointed for 30 minutes. A Feature Value insert that loses the race on its key to an equal value is `Unchanged`.
  - Bedrock sends a configured temperature of 0 as 0 (F-FP-13).
  - `AIPromptParams.templateAutoescape` (set by the Feature Pipeline drivers) renders a prompt template without HTML escaping; a Feature Pipeline run reads its prompt's template from the database at run start, so a template edit takes effect on the next run.
  - API moves & PascalCase standardization: `WriteBackResult`, `TagWriteBackPreview`, `FieldRulesResultPayload`, and `MetadataProviderCapabilities` live in `@memberjunction/record-set-processor-base`; `FeaturePipelineRunResults` lives in `@memberjunction/feature-pipelines`; `RunRecordProcessOptions`, `RecordProcessorContext`, `RecordSetProcessOptions`, `ProcessRunSummary`, and `WriteBackValuePreview` use `PascalCase` properties across `@memberjunction/record-set-processor-base` and `@memberjunction/record-set-processor`.

### Patch Changes

- Updated dependencies [3b0e8db]
- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [fd780a9]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [52b9fd5]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [db50c6b]
- Updated dependencies [afc1e0e]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0ab85d7]
- Updated dependencies [9d1eb6a]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [542795b]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [7e72c86]
- Updated dependencies [0cc6b08]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [9c2a051]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [091e7ea]
- Updated dependencies [dc38250]
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.5
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-agents@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/actions-base@6.2.0-edge.5
  - @memberjunction/actions@6.2.0-edge.5
  - @memberjunction/task-graph@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/record-set-processor@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5
  - @memberjunction/record-set-processor-base@6.2.0-edge.5
  - @memberjunction/integration-engine@6.2.0-edge.5
  - @memberjunction/notifications@6.2.0-edge.5
  - @memberjunction/materialization@6.2.0-edge.5
  - @memberjunction/rubrics@6.2.0-edge.5
  - @memberjunction/scheduling-engine-base@6.2.0-edge.5
  - @memberjunction/scheduling-base-types@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- d86bcbc: Engine and shared-cache hardening: phases 1–3 (items 2.1–2.3, 3.1, N7, N11) and the non-breaking part of Phase 5 of `plans/engine-cache-architecture-plan.md`. The related-record collection migration is in its own change.
  - **Polled entities no longer fill Redis with write-only keys.** `MJ: User Routines`, `MJ: AI Agent Session Bridges` and `MJ: Action Execution Logs` are read on a schedule with a timestamp in the filter, so every poll minted a permanent cache key and published it to every server. They are now `AllowCaching = false` (metadata).
  - **Shared cache entries expire (default one hour) without leaking the index.** `RedisLocalStorageProvider` defaults `defaultTTLSeconds` to 3600 (`0` disables it; MJAPI reads `REDIS_TTL_SECONDS` or `cacheSettings.sharedCacheTTLSeconds`). The ever-growing `__categories__` set is gone. RunView entries are indexed per entity in `{prefix}:__group__:RunViewCache:<Entity>`, pruned on read. `ClearCategory` and `GetCategoryKeys` use `SCAN`. `ILocalStorageProvider.SetItem` accepts optional `{ TTLSeconds, IndexGroup }`, and providers may implement `GetIndexGroupKeys`.
  - **A save now reaches cache entries written by other servers**, not only those this process knows about. When a save finds that an indexed entry has expired, it invalidates the entry, so peer engines reload instead of staying stale.
  - **Identical cross-server payloads are skipped.** `BaseEngine` compares the payload's (primary key, `__mj_UpdatedAt`) pairs with the rows it holds, and skips the re-materialization, rebuild and notification when they match. Slot maintenance now stamps `maxUpdatedAt` from the rows rather than the clock.
  - **Permission-constrained engines stay empty.** Payloads from other servers never fill a config the user cannot read. Engines that load before `LocalCacheManager` initializes still register their cross-server callbacks.
  - **A cached slot that expired under a running engine now notifies peers whichever server takes the next save.** Engines hold rows in memory and never re-read their slot, so when a slot expires the save that would normally rewrite it has nothing to rewrite and publishes nothing. The slot's fingerprint is now also recorded when a process _reads_ it — previously only the process that wrote it knew — so the save still invalidates it and every peer reloads. Shared stores only: on a process-local store there are no peers, and indexing reads would suppress the category scan that finds slots persisted from an earlier session.
  - **Degradations are visible in production** through the new `LogWarning`.
  - **The periodic database checks now run only where an entity declares it can drift.** The engine sweep and the user-cache staleness check both compared held rows with the database on a timer. They now visit only entities whose `TrustServerCacheCompletely` is `false` (the user-cache check also runs whenever the cache is shared across processes) — MJ's existing declaration that rows can appear without firing an event (and the flag a database CHECK already requires for `AllowDirectSQLInsert`/`Update`/`Delete`). The user cache's periodic full reload (`databaseSettings.metadataCacheRefreshInterval`, in milliseconds, default 180000) is gated the same way — it previously reloaded every user and role unconditionally, which on its own kept the database awake. The engine sweep visits an untrusted entity only when a loaded engine holds it as a config. Untrusted entities read only through one-off `RunView` calls are never swept. The user-cache staleness check (two aggregate queries) runs on any fleet sharing a cache, because a lost notice would otherwise leave a deactivated user or revoked role in force on a peer. Any recurring query prevents Azure SQL serverless auto-pause, so a deployment that needs the database to idle must set `engineSweepIntervalSeconds` to `0` (with or without Redis, unless no loaded engine holds an untrusted entity) and, on a shared-cache fleet, `userCacheCheckIntervalSeconds` to `0`. `engineSweepIntervalSeconds: 0` / `userCacheCheckIntervalSeconds: 0` still disable the timers outright.
  - **`BaseEngine.GetStateCensus()`** reports what an engine holds, including derived-state counts. It is exposed by the `EngineStateCensus` GraphQL query (system user only).
  - **The CLI clears the shared cache after it changes the database** (closes #4083). When `REDIS_URL` is set (in the environment or the dotenv file the CLI loads; prefix `REDIS_KEY_PREFIX`), `mj sync push`, `mj codegen` and `mj migrate` clear the RunView, query, dataset and metadata categories and the metadata snapshot, so every server reloads its engines and re-checks its metadata.
    - `mj sync push` clears after a successful push **that wrote rows**, and after a failed one **only when it left rows behind**. A cancelled push, or one that created, updated and deleted nothing, does not clear: a no-op push runs in every deploy, and clearing after it would drop every server's cache for nothing. Since #4550 an atomic push (the default) rolls its writes back and says so, so a clean rollback does not clear either. A push whose outcome cannot be read still clears. A non-atomic push that fails reports exactly what stayed committed, and that does clear; an outcome the CLI cannot read clears too.
    - Opt out with `--skip-cache-clear` or `MJ_SKIP_SHARED_CACHE_CLEAR=1`. The new `mj cache clear [--dry-run] [--category]` does the same on demand, for example after direct SQL.
    - `ClearSharedCacheCategories` accepts `IncludeMetadataSnapshot` (default: on when no categories are given).
    - A server that hears the metadata snapshot was removed runs its staleness check (with up to 2 s of random delay, `ProviderBase.PeerMetadataNoticeJitterMs`) and reloads only if the database changed.
  - **The user cache now hears about users created on other servers** (plan §15). `UserCache` is consulted on the authentication path but had no invalidation path at all: it is not a `BaseEngine`, so neither the sweeper nor shared-cache events reached it, and its optional poll is off by default. A user created on one server was invisible to every other server until that server restarted — a newly onboarded organization's first API key was rejected as "invalid or expired" until then.
    - It now reloads when `MJ: Users` or `MJ: User Roles` rows are saved or deleted in this process, and tells other servers through a key-only notice on the shared cache (they reload after a short random delay). A shared-cache clear from the CLI heals it too.
    - `RefreshIfChangedInDatabase()` compares two row counts and the newest `__mj_UpdatedAt` with the database and reloads only on a difference; MJAPI runs it on the new `cacheSettings.userCacheCheckIntervalSeconds` (default 300, 0 disables).
    - New `UserCache.FindUser({ ID | Email })`: a hit is answered from memory, a **miss is checked against the database** instead of being reported as "no such user". Prefer it over `Users.find(...)` on any path that decides whether a request is allowed. MJServer's `verifyUserRecord` uses it.
    - Measured on SQL Server and PostgreSQL with three servers on one Redis: a user created, given a role, or deactivated on one server reaches the others in about a second; with unshared caches (the old behaviour) it never arrives.
  - **`cacheSettings` now take effect.** `LocalCacheManager.Initialize` applies a configuration passed by a later caller, so the settings a host hands to `StartupManager` are no longer dropped because the database provider initialized the cache manager first (every knob — `maxMemoryMB`, `maxPercentOfCachePerEntity`, `defaultTTLSeconds`, `evictionSweepIntervalSeconds`, `verboseLogging` — was inert). `UpdateConfig` re-arms the eviction sweep.
  - **Shared-cache entries are no longer aged out by each process's own clock.** With a store shared across processes, expiry is left to the store; a local `defaultTTLSeconds` would have had every server deleting the same keys on its own schedule and publishing an invalidation for each.
  - **Expiry is per category, and proxy keys never expire on their own.** New `RedisProviderConfig.categoryTTLSeconds` (default `{ default: 0 }`). The metadata timestamps key and a dataset's `_date` key are written after what they vouch for, so a single TTL let them outlive it: a server booting into that window adopted a freshness claim with no payload behind it and served empty metadata as current, and the dataset check threw. A metadata load now adopts stored timestamps only alongside their payload, and `IsDatasetCacheUpToDate` reports out-of-date instead of throwing.
  - **The Redis index-group prune fails closed.** An unusable pipeline reply keeps every member; it previously treated unanswered members as dead and removed live keys from the index, after which a save never invalidated peers' copies of that entity.
  - **Every transaction batches its cache maintenance, not just `BeginEntityTransaction`.** The raw `BeginTransaction` / `CommitTransaction` / `RollbackTransaction` path now opens and settles the same batch, so the 41 call sites that use it — new-user creation on first login, the magic-link service, the roles/users sync resolver, `MergeRecords`, every generated cascade-delete override — get one cache write per slot on commit instead of one per save, and a rollback no longer leaves rows in the shared cache that were never committed. A failed commit invalidates rather than writing.
  - **A transaction handle released or reset with a batch still open no longer disables the cache for its entities.** New `LocalCacheManager.AbandonEntityEventBatch`, called from `ReleaseIndependentInstance` and `ResetTransactionState`: the batch is dropped and its entities invalidated. Previously the batch became unreachable while its entities stayed marked pending, so every cached read of them missed for the life of the process.
  - **The engine sweep writes shared slots under the same lock the event path uses** (new `LocalCacheManager.ReplaceRunViewResultLocked`), so a sweep can no longer clobber a peer's in-flight read-modify-write.
  - **The sweep's freshness probe is robust.** It compares the held newest-`__mj_UpdatedAt` the way SQL `MAX` does (ignoring nulls), so one un-stamped row no longer makes a config reload on every interval forever; it selects `MAX(__mj_UpdatedAt)` only for entities that have the column, comparing by row count alone otherwise; and on SQL Server a failed batched probe falls back to per-item probes instead of failing every entity in the engine.
  - **A reloaded engine property is emitted once, after its derived state is rebuilt**, so subscribers never observe rows with the previous load's derived state.
  - **The user cache waits for the writing transaction before reloading.** A save raises its event inside the transaction that made it, so the reload used to read a database that did not have the row yet — and told other servers to reload early. It now waits for the transaction to settle (bounded), and on a miss reads only that user's roles rather than scanning the whole role table, with the remembered-miss map bounded so repeated lookups of unknown addresses cannot grow it.
  - **`mj migrate` clears the shared cache when it changed something, and only then.** A run that applied no migrations no longer makes the whole fleet drop its cache; a run that applied migrations before failing now does clear, matching `mj sync push`.
  - **`mj cache clear` reports per category and fails loudly.** A category that could not be cleared is warned about and exits non-zero instead of printing a key count and "servers will reload"; an unknown `--category` is rejected rather than silently doing nothing. New `RedisLocalStorageProvider.ClearCategoryChecked`; `SharedCacheCategoryClear` carries `Ok`/`Error`.
  - **Six CLI commands stop paying the full bootstrap.** oclif command ids are colon-separated, so the space-form entries in the light-command list (`cache clear`, `plugin add`, `migrate create`, `migrate convert`, `dev workspace *`, `codegen manifest`, `dbdoc *`) never matched — `cache clear` measured 2.44–2.62 s against 0.17–0.19 s once its id matched, on the same build. A test now fails on an entry that cannot match a real command id.
  - **An emptied Redis index-group set is deleted** rather than left behind as a persistent empty set that a `volatile-*` eviction policy can never reclaim.
  - **A category clear only reloads engines when the RunView category is cleared.** Clearing metadata or datasets no longer triggers a reload per category.
  - **The cache registry stays in each process on a shared store.** New `ILocalStorageProvider.SharedAcrossProcesses`, declared by the Redis provider. Servers no longer overwrite one shared registry key or broadcast it.
  - **Metadata changes reach other servers in seconds, as a small notice.** `RedisLocalStorageProvider` accepts `publishModes` / `defaultPublishMode` (`'full'`, `'notice'` or `'none'` per category). MJAPI publishes RunView rows in full and metadata-snapshot writes as key-only notices; everything else is not published. A server that hears a notice runs its metadata staleness check and adopts the shared snapshot. Previously each metadata save broadcast about 21 MB to every server, and other servers only noticed at the next poll (3 minutes by default). Browsers are now relayed only RunView changes.
  - **`SQLServerDataProvider.RefreshIfNeeded` passes its arguments through**, so event-driven metadata checks are no longer throttled away.
  - **The scheduled-job stale-lease sweep reads the database directly** (`BypassCache`).
  - **Servers load from the shared cache from the start.** A database provider installs `ProviderConfigDataBase.LocalStorageProvider` before loading metadata, and `StartupOptions.cacheManagerConfig` reaches `LocalCacheManager` (MJAPI's `cacheSettings` now take effect). MJAPI builds and subscribes to Redis before connecting to the database. A server that starts after the cache is warm reads metadata and startup-engine data from Redis instead of the database: 14 queries instead of 111 in the fleet test, with no broadcasts.
  - **Concurrent saves on different servers no longer lose rows from a shared cache entry.** `RedisLocalStorageProvider.WithKeyLock` (new optional `ILocalStorageProvider` member) serializes `LocalCacheManager`'s in-place read-modify-write across processes. If the lock cannot be taken, the entry is invalidated instead. One gap remains: a save that waits more than 5 s for the lock invalidates without it, and if the holder then writes a slot built from older rows, that save's row is missing until the slot is next reloaded. This is rarer than before, when there was no lock at all. In the fleet test, concurrent saves previously left the shared entry — and the servers that adopt it — permanently missing rows in up to 80% of rounds; 0 of 20 rounds disagree now.
  - **A PROVIDER transaction updates each cached result once, on commit, and never with rolled-back rows.** `DatabaseProviderBase.BeginEntityTransaction` opens an entity-event batch on the provider. This covers `BeginEntityTransaction` and `RunInEntityTransaction`. Raw `provider.BeginTransaction()` opens the same batch, but `CommitTransaction` closes it before running post-commit tasks, so an engine's `CacheLocal` slot is still rewritten once per save there (100 saves gave 101 slot writes, against 1 under `BeginEntityTransaction`). It does **not** cover `TransactionGroup.Submit()` / the `ExecuteTransactionGroup` resolver, which open a transaction directly on the connection pool rather than through the provider, so each item still publishes its own update — measured on two live servers as 40 rows producing 40 messages and 11.4 MB. That path is #4250. The saves and deletes inside it are recorded, then applied when the outermost scope settles. On commit, each affected RunView cache entry gets one read-modify-write, one write and one publish. On rollback or failure, the affected entries are invalidated. While a batch has pending changes for an entity, cached reads of that entity miss and fills are not stored, so code inside the transaction still reads its own writes. New public `LocalCacheManager.BeginEntityEventBatch` / `EndEntityEventBatch` / `RunInEntityEventBatch` / `IsBatchingEntityEvents` and `ApplyRowChanges`. Measured in the fleet test on one build, 100 records on 3 replicas: saving them one at a time costs 111 slot writes and 9.96 MB published, and every other server does 100 handler calls, ~100 rebuilds and 190 ms of work; the same 100 saves in one `BeginEntityTransaction` cost 12 writes and 3.45 MB, and each peer does 1 handler call, 1 rebuild and 3 ms. Deleting them one at a time costs 100 writes and 6.53 MB against 1 write and 17.5 KB. Before, a rolled-back transaction left its rows in the shared cache. When several cross-server payloads for one engine property arrive together, `BaseEngine` now materializes only the newest.
  - **An operator runbook for enabling sweeping** is in `guides/CACHING_AND_PUBSUB_GUIDE.md`: the four periodic checks and their settings, how to declare an entity as drifting, and why the metadata snapshot must be invalidated for a declaration to take effect (a restart alone is not enough, because a warm-booting server adopts the existing snapshot). Note that enabling the metadata sweep is itself a metadata change, so it needs one explicit `mj cache clear` or `mj sync push` to break the circle; after that it keeps metadata converged on its own.
  - **Metadata changed outside MJ now reaches running servers, if you say it can.** A new metadata sweep (`cacheSettings.metadataSweepIntervalSeconds`, default 300, 0 disables) compares this process's metadata with the database and reloads when it differs. Metadata staleness was otherwise entirely event-driven — a `BaseEntity` write to a member entity, a peer's snapshot notice, or a CLI clear — so metadata written with raw SQL was never noticed by a running process. The sweep reads the database **only when one of the entities the metadata is built from declares `TrustServerCacheCompletely = false`**; on a stock installation none do, so it issues no query and takes no lease. New `ProviderBase.SweepMetadataAgainstDatabase()` and `MetadataMembersDeclaringDrift()`.
  - **Changes made outside MJ now reach running engines.** `BaseEngine.SweepAgainstDatabase()` compares each loaded config's row count and newest `__mj_UpdatedAt` with the database (new optional `IRunViewProvider.GetRunViewsDatabaseStatus`, implemented by `GenericDatabaseProvider`), reloads what differs, and writes the fresh rows to the shared cache once so every server adopts them. `BaseEngineSweeper` runs it on an interval. MJAPI starts it from `cacheSettings.engineSweepIntervalSeconds` (default 300, 0 turns it off). On a shared cache, one server per interval sweeps each engine, using the new optional `ILocalStorageProvider.TryAcquireLease` / `ReleaseLease` (`SET NX PX` on Redis). In the fleet test, a direct SQL change reached every server in 1.28 s and 1.49 s against a 3 s interval, with exactly one replica sweeping and reloading while the others adopted its payload; before, it was never seen. The entity must declare `TrustServerCacheCompletely = false` — see the gating note above.
  - **Servers that start together no longer all query the database.** `StartupManager` takes a shared warm-up lease around engine loading (`StartupOptions.warmupLeaseMs`, default 30 s, 0 turns it off). The first server fills the cache and the others load from it, so fleet boot cost grows by **14 database calls per additional server instead of 111**: three simultaneous servers make 139 calls (111 + 2 x 14) and five make 167 (111 + 4 x 14), with every replica converging on an identical state.
  - **Periodic metadata checks no longer download the whole snapshot.** On a shared cache, each check now reads only the stored timestamps and loads the multi-megabyte snapshot only when another server stored a newer one.
  - **Entity Record Document syncing reads existing documents from the database** (`BypassCache`) instead of writing a cache entry per batch that its own saves discard.
  - **The PostgreSQL integration bootstrap now runs the startup engines**, as MJAPI does, so engine-backed checks run against loaded engines on PostgreSQL.
  - **`TemplateEngineBase`** now groups template content and params in one pass instead of filtering both arrays for every template, which also makes its rebuild idempotent — the shape #4470 fixed in `AIEngineBase`. Engines with non-trivial derived state should carry a unit test that runs the rebuild twice and compares the result; see `baseEngine.derivedStateIdempotency.test.ts`.

- 1ef460d: Scheduling engine: a job switched from Disabled to Active while the server is running now
  gets its `NextRunAt` seeded at once (through the new targeted `spSetScheduledJobNextRunAt`
  sproc, so live locks are never overwritten) and becomes due on its next cron tick. Before,
  a null `NextRunAt` was never due, so an activated job silently waited for a restart.

### Patch Changes

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [bd0ee83]
- Updated dependencies [fd2a410]
- Updated dependencies [0dbd455]
- Updated dependencies [49f26d9]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [aaf74ca]
- Updated dependencies [432fe69]
- Updated dependencies [7316ac3]
- Updated dependencies [4c682c1]
- Updated dependencies [08a4cfc]
- Updated dependencies [08b3d7b]
- Updated dependencies [35d3c95]
- Updated dependencies [dbc3462]
- Updated dependencies [21175fa]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [7177e09]
- Updated dependencies [8704df6]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [45359c6]
- Updated dependencies [aee2d53]
- Updated dependencies [8ed4049]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [02bb563]
- Updated dependencies [a66f4b0]
- Updated dependencies [90829e3]
- Updated dependencies [57096ab]
- Updated dependencies [aac148b]
- Updated dependencies [f2f6f4b]
- Updated dependencies [a28ce42]
- Updated dependencies [9ce70b3]
- Updated dependencies [bc0e36f]
- Updated dependencies [bdea87a]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [d2ccfef]
  - @memberjunction/ai-agents@6.2.0-edge.4
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/rubrics@6.2.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.4
  - @memberjunction/record-set-processor@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/notifications@6.2.0-edge.4
  - @memberjunction/actions@6.2.0-edge.4
  - @memberjunction/templates@6.2.0-edge.4
  - @memberjunction/integration-engine@6.2.0-edge.4
  - @memberjunction/task-graph@6.2.0-edge.4
  - @memberjunction/actions-base@6.2.0-edge.4
  - @memberjunction/materialization@6.2.0-edge.4
  - @memberjunction/scheduling-engine-base@6.2.0-edge.4
  - @memberjunction/scheduling-base-types@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [24ddecc]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [997fe44]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.3
  - @memberjunction/ai-agents@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/rubrics@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/task-graph@6.2.0-edge.3
  - @memberjunction/actions@6.2.0-edge.3
  - @memberjunction/record-set-processor@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3
  - @memberjunction/notifications@6.2.0-edge.3
  - @memberjunction/integration-engine@6.2.0-edge.3
  - @memberjunction/materialization@6.2.0-edge.3
  - @memberjunction/scheduling-engine-base@6.2.0-edge.3
  - @memberjunction/scheduling-base-types@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 4d647e6: Add Rubrics, a core way to score any record against a published set of weighted criteria.

  What ships:
  - Schema for rubrics, versions, criteria, scales, anchors, bands, evaluations, and score rows, plus layered consensus views. Published versions are frozen. Raw writes to a frozen row throw 51101–51110. A draft version delete is an `INSTEAD OF DELETE` trigger. `MJ: Test Rubrics` is deprecated in metadata.
  - `RubricScoring` and `RubricVersionDiff` in `@memberjunction/rubrics-base`. The outcome ladder is Incomplete, NotApplicableFailure, GateFailed, Passed or BelowThreshold, then Scored. The publish base is the highest Published or Retired version.
  - `@memberjunction/rubrics`: LLM, agent, deterministic, and human evaluators. Actions are Evaluate Record Against Rubric, Get Rubric, Get Rubric Subject, Get Rubric Consensus, Create Rubric Draft, and Submit Human Rubric. Create Rubric Draft and the architect import do not publish. The evaluation agent does not call Get Rubric Consensus.
  - Presentational widgets in `@memberjunction/ng-rubrics`, Explorer forms, and a Rubrics application. The agent form has a Rubrics tab.
  - Six guide-example rubrics stay Draft. Seven agent rubrics publish at 1.0.0 and bind to their agents. Marketing Agent is not bound. Shipped self-check links and the sampling job stay Disabled. A test that already has an `llm-judge` oracle keeps it.
  - Testing: rubric resolution, a `rubric` oracle, judge calibration, per-criterion spread on `--flaky-check`, `mj rubric`, and `mj test promote-criteria`. `Test.RubricID` and `TestSuite.RubricID` select a rubric. `TestSuiteRun.Score` is stored.
  - The deterministic integration bundle is IT98 at sequence 49.

  `GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`. The base view for a criterion is `vwRubricCriteria`.

### Patch Changes

- Updated dependencies [ca853fc]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [664baea]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [0e5ad68]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [0adaf76]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [b03a928]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [861cbf0]
- Updated dependencies [9096523]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [f3fa01e]
- Updated dependencies [3276daa]
- Updated dependencies [d0cea53]
- Updated dependencies [e9ab27b]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [7bcba8c]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-agents@6.2.0-edge.2
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/record-set-processor@6.2.0-edge.2
  - @memberjunction/task-graph@6.2.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.2
  - @memberjunction/actions@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/rubrics@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
  - @memberjunction/notifications@6.2.0-edge.2
  - @memberjunction/integration-engine@6.2.0-edge.2
  - @memberjunction/materialization@6.2.0-edge.2
  - @memberjunction/scheduling-engine-base@6.2.0-edge.2
  - @memberjunction/scheduling-base-types@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [520bd09]
- Updated dependencies [520bd09]
- Updated dependencies [307da67]
- Updated dependencies [7110019]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [c4993f3]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-agents@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/ai-prompts@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/actions-base@6.2.0-edge.1
  - @memberjunction/actions@6.2.0-edge.1
  - @memberjunction/task-graph@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/integration-engine@6.2.0-edge.1
  - @memberjunction/materialization@6.2.0-edge.1
  - @memberjunction/notifications@6.2.0-edge.1
  - @memberjunction/record-set-processor@6.2.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1
  - @memberjunction/scheduling-engine-base@6.2.0-edge.1
  - @memberjunction/scheduling-base-types@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [42d701e]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [e3db74f]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [6fd16d2]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e7a0efe]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
  - @memberjunction/ai-agents@6.2.0-edge.0
  - @memberjunction/actions-base@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-prompts@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.0
  - @memberjunction/record-set-processor@6.2.0-edge.0
  - @memberjunction/actions@6.2.0-edge.0
  - @memberjunction/task-graph@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/notifications@6.2.0-edge.0
  - @memberjunction/integration-engine@6.2.0-edge.0
  - @memberjunction/materialization@6.2.0-edge.0
  - @memberjunction/scheduling-engine-base@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/scheduling-base-types@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 59def38: The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
  share a failure shape: a column, a flag or a field that read as configured and did nothing.

  **Action Filters now actually prevent execution.** `RunAction`'s filter-refusal branch built its
  result, logged it, and then fell through to run the action anyway — there was no `return`. Every
  Action Filter has therefore recorded that it prevented something while preventing nothing, since the
  mechanism shipped. The refusal row is why it went unnoticed: the observable said "prevented" and the
  side effect happened regardless, so #3606's claim that filters fail closed described evaluation,
  which landed, rather than enforcement, which did not. **Anyone relying on an Action Filter to gate an
  action has been getting the action anyway; after this it stops, which is the configured behaviour but
  a visible change.** A prevented run still writes a log row, deliberately — an operator should be able
  to see that a filter refused rather than wonder why nothing happened — so its `Message` is now an
  exported constant, since that is the only thing distinguishing a prevented run from an executed one.

  **Transition filters.** An entity action could see a record's current state and nothing else, so
  "when Status _becomes_ Approved" was indistinguishable from "when Status _is_ Approved" — which is
  true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
  filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
  never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
  `NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
  started at Approved did not _become_ anything. Comparison is loose across the string boundary
  metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

  The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
  `await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
  reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
  snapshot also closes a latent bug — `entity.IsSaved` was previously read _after_ an await, so a
  create whose save finalized in that window dispatched as `AfterUpdate`.

  **Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
  consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
  row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
  pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
  fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
  filter.

  **Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
  outright because the contract to honor it did not exist. It now reconciles onto an owned
  `ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
  expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
  trigger that silently never fires.

  **Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
  on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
  "compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
  reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
  one shared action, so matching on entity + action alone would let a second process silently repoint
  the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
  one expression vocabulary covers both surfaces.

  **Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
  loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
  the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
  orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
  binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
  submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
  be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
  `Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
  joins `agentName`/`assignToUser`.

  Durability replaces _execution_, not _dispatch_: `RunActionParams.DeferExecution` is called by
  `RunAction` in place of running the action, after validation and filters have passed, so a durable
  binding is gated by exactly what an inline one is gated by. Submitting at dispatch time instead —
  which is where this first landed — would have fired a scoped durable trigger for every record of the
  entity and a filtered one on every save.

  **Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
  with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
  claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
  time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
  and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
  run, reporting when it stopped at its ceiling rather than because it was finished.

  **The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
  with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
  one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
  parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
  inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
  drift again.

  **The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
  and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
  so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
  resolver reports it as the ordinary outcome it is.

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

### Patch Changes

- 834f8d7: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- 2741d46: Guarantee that a `MJ: User Routine Runs` row reaches a terminal status, and that the dispatcher never reports a status the database does not hold.

  Three defects, all of which reported success while the row said otherwise:
  1. **`finalizeRunRow` let an optional foreign key cost the run its status.** `AgentRunID` / `PromptRunID` / `ActionExecutionLogID` point at artifacts written fire-and-forget by the action/agent/prompt engines, so the id is valid for a row whose INSERT has not landed yet. When that FK rejected the save, the code logged and carried on: `Status` stayed `Success` in memory and the row stayed `Running` forever. The status is now landed first and the linkage re-attached over a few short escalating waits — losing a link is an observability loss, losing the status is a correctness one.
  2. **Bookkeeping that threw after the run row existed left it non-terminal.** `updateRoutineAfterRun` and notification delivery run after `finalizeRunRow`; a throw there escaped to the sweep's per-routine catch, which recorded `Failed` in its in-memory summary and returned, leaving the row `Running`. `executeRoutine` now drives the row to a terminal status on every path.
  3. **That new catch read the in-memory status, so it could still report a status that was never written.** `finalizeRunRow` sets `Status = 'Success'` before its first save, so when it exhausts its saves and throws, the catch saw `Success` on an object whose row said `Running` — concluded the outcome was already committed, left the row alone, and returned `Success` to the sweep. It now reads the persisted value (`OldValue`, which `BaseEntity` advances only on a save that lands), so an already-committed outcome is preserved and a still-`Running` row is driven to `Failed`.

  The third defect lived exactly at the seam between the fixes for the first two, each of which was tested only in isolation; the suite now covers the composition.

- Updated dependencies [394d276]
- Updated dependencies [323df0f]
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [405c035]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [b9a8324]
- Updated dependencies [ff1b875]
- Updated dependencies [79483bf]
- Updated dependencies [4586215]
- Updated dependencies [6242df1]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [8206993]
- Updated dependencies [2003cd3]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [1940a4d]
- Updated dependencies [489aecd]
- Updated dependencies [bb79505]
- Updated dependencies [d40251e]
- Updated dependencies [653c51d]
- Updated dependencies [52490a7]
- Updated dependencies [a59e52d]
- Updated dependencies [716b930]
- Updated dependencies [fa616d3]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [29187f8]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [8ec1515]
- Updated dependencies [eb962a1]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [f2fa6b3]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [5b30129]
- Updated dependencies [e7b4833]
- Updated dependencies [9cd81ca]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [9cce262]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [6cbed1d]
- Updated dependencies [be0bdb2]
- Updated dependencies [a723521]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [79afbff]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [d29d6b9]
- Updated dependencies [e3a1425]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [427fa8b]
- Updated dependencies [8e469c3]
- Updated dependencies [d10f112]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [8d0d45a]
- Updated dependencies [63bc733]
- Updated dependencies [f52be10]
- Updated dependencies [4f7f929]
- Updated dependencies [87aa62a]
- Updated dependencies [595c945]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [0aa2b91]
- Updated dependencies [9fc0e2d]
- Updated dependencies [74e161d]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [a04d5c9]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [af4bd79]
- Updated dependencies [f315e44]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [64915b9]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [f2f1491]
- Updated dependencies [5c1d762]
- Updated dependencies [a1a8989]
- Updated dependencies [29c3dc8]
- Updated dependencies [b00a985]
- Updated dependencies [d31cba4]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [cc474d5]
- Updated dependencies [2c8fbc7]
- Updated dependencies [ca3657d]
- Updated dependencies [82a8585]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [4f20e10]
- Updated dependencies [d8adda1]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [ec71199]
- Updated dependencies [1f66f31]
- Updated dependencies [4b1257f]
- Updated dependencies [c4e98ce]
- Updated dependencies [ca4feb4]
- Updated dependencies [6cd337d]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/actions@6.1.0
  - @memberjunction/integration-engine@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ai-agents@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/scheduling-engine-base@6.1.0
  - @memberjunction/sqlserver-dataprovider@6.1.0
  - @memberjunction/task-graph@6.1.0
  - @memberjunction/ai-prompts@6.1.0
  - @memberjunction/actions-base@6.1.0
  - @memberjunction/materialization@6.1.0
  - @memberjunction/record-set-processor@6.1.0
  - @memberjunction/notifications@6.1.0
  - @memberjunction/templates@6.1.0
  - @memberjunction/scheduling-base-types@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-prompts@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/materialization@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/actions-base@6.1.0-edge.7
  - @memberjunction/actions@6.1.0-edge.7
  - @memberjunction/notifications@6.1.0-edge.7
  - @memberjunction/integration-engine@6.1.0-edge.7
  - @memberjunction/record-set-processor@6.1.0-edge.7
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.7
  - @memberjunction/scheduling-engine-base@6.1.0-edge.7
  - @memberjunction/task-graph@6.1.0-edge.7
  - @memberjunction/templates@6.1.0-edge.7
  - @memberjunction/scheduling-base-types@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [489aecd]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [eb962a1]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [a723521]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai-agents@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/actions@6.1.0-edge.6
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.6
  - @memberjunction/integration-engine@6.1.0-edge.6
  - @memberjunction/record-set-processor@6.1.0-edge.6
  - @memberjunction/ai-prompts@6.1.0-edge.6
  - @memberjunction/task-graph@6.1.0-edge.6
  - @memberjunction/templates@6.1.0-edge.6
  - @memberjunction/actions-base@6.1.0-edge.6
  - @memberjunction/notifications@6.1.0-edge.6
  - @memberjunction/materialization@6.1.0-edge.6
  - @memberjunction/scheduling-engine-base@6.1.0-edge.6
  - @memberjunction/scheduling-base-types@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [323df0f]
- Updated dependencies [b1b24d7]
- Updated dependencies [405c035]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [b9a8324]
- Updated dependencies [ff1b875]
- Updated dependencies [79483bf]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [653c51d]
- Updated dependencies [716b930]
- Updated dependencies [fa616d3]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [5f33ca8]
- Updated dependencies [79afbff]
- Updated dependencies [e3a1425]
- Updated dependencies [23c2521]
- Updated dependencies [427fa8b]
- Updated dependencies [8e469c3]
- Updated dependencies [d10f112]
- Updated dependencies [f52be10]
- Updated dependencies [4f7f929]
- Updated dependencies [87aa62a]
- Updated dependencies [595c945]
- Updated dependencies [64915b9]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [5c1d762]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
- Updated dependencies [cc474d5]
- Updated dependencies [2c8fbc7]
- Updated dependencies [4f20e10]
- Updated dependencies [1f66f31]
  - @memberjunction/integration-engine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/actions@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5
  - @memberjunction/record-set-processor@6.1.0-edge.5
  - @memberjunction/task-graph@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
  - @memberjunction/notifications@6.1.0-edge.5
  - @memberjunction/materialization@6.1.0-edge.5
  - @memberjunction/scheduling-engine-base@6.1.0-edge.5
  - @memberjunction/scheduling-base-types@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [6242df1]
- Updated dependencies [d40251e]
- Updated dependencies [a59e52d]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [29187f8]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [f2fa6b3]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [e7b4833]
- Updated dependencies [9cce262]
- Updated dependencies [647bd71]
- Updated dependencies [6cbed1d]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0aa2b91]
- Updated dependencies [74e161d]
- Updated dependencies [0db4f4f]
- Updated dependencies [a04d5c9]
- Updated dependencies [a1a8989]
- Updated dependencies [d31cba4]
- Updated dependencies [d078c54]
- Updated dependencies [ec71199]
- Updated dependencies [c4e98ce]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/integration-engine@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/actions@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4
  - @memberjunction/record-set-processor@6.1.0-edge.4
  - @memberjunction/task-graph@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/notifications@6.1.0-edge.4
  - @memberjunction/materialization@6.1.0-edge.4
  - @memberjunction/scheduling-engine-base@6.1.0-edge.4
  - @memberjunction/scheduling-base-types@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

### Patch Changes

- 834f8d7: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- 2741d46: Guarantee that a `MJ: User Routine Runs` row reaches a terminal status, and that the dispatcher never reports a status the database does not hold.

  Three defects, all of which reported success while the row said otherwise:
  1. **`finalizeRunRow` let an optional foreign key cost the run its status.** `AgentRunID` / `PromptRunID` / `ActionExecutionLogID` point at artifacts written fire-and-forget by the action/agent/prompt engines, so the id is valid for a row whose INSERT has not landed yet. When that FK rejected the save, the code logged and carried on: `Status` stayed `Success` in memory and the row stayed `Running` forever. The status is now landed first and the linkage re-attached over a few short escalating waits — losing a link is an observability loss, losing the status is a correctness one.
  2. **Bookkeeping that threw after the run row existed left it non-terminal.** `updateRoutineAfterRun` and notification delivery run after `finalizeRunRow`; a throw there escaped to the sweep's per-routine catch, which recorded `Failed` in its in-memory summary and returned, leaving the row `Running`. `executeRoutine` now drives the row to a terminal status on every path.
  3. **That new catch read the in-memory status, so it could still report a status that was never written.** `finalizeRunRow` sets `Status = 'Success'` before its first save, so when it exhausts its saves and throws, the catch saw `Success` on an object whose row said `Running` — concluded the outcome was already committed, left the row alone, and returned `Success` to the sweep. It now reads the persisted value (`OldValue`, which `BaseEntity` advances only on a save that lands), so an already-committed outcome is preserved and a still-`Running` row is driven to `Failed`.

  The third defect lived exactly at the seam between the fixes for the first two, each of which was tested only in isolation; the suite now covers the composition.

- Updated dependencies [834f8d7]
- Updated dependencies [2003cd3]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [bb79505]
- Updated dependencies [52490a7]
- Updated dependencies [e7f1f88]
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
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [5b30129]
- Updated dependencies [9cd81ca]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [d29d6b9]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [af4bd79]
- Updated dependencies [f315e44]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/scheduling-engine-base@6.1.0-edge.3
  - @memberjunction/integration-engine@6.1.0-edge.3
  - @memberjunction/task-graph@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.3
  - @memberjunction/materialization@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/notifications@6.1.0-edge.3
  - @memberjunction/record-set-processor@6.1.0-edge.3
  - @memberjunction/scheduling-base-types@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 59def38: The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
  share a failure shape: a column, a flag or a field that read as configured and did nothing.

  **Action Filters now actually prevent execution.** `RunAction`'s filter-refusal branch built its
  result, logged it, and then fell through to run the action anyway — there was no `return`. Every
  Action Filter has therefore recorded that it prevented something while preventing nothing, since the
  mechanism shipped. The refusal row is why it went unnoticed: the observable said "prevented" and the
  side effect happened regardless, so #3606's claim that filters fail closed described evaluation,
  which landed, rather than enforcement, which did not. **Anyone relying on an Action Filter to gate an
  action has been getting the action anyway; after this it stops, which is the configured behaviour but
  a visible change.** A prevented run still writes a log row, deliberately — an operator should be able
  to see that a filter refused rather than wonder why nothing happened — so its `Message` is now an
  exported constant, since that is the only thing distinguishing a prevented run from an executed one.

  **Transition filters.** An entity action could see a record's current state and nothing else, so
  "when Status _becomes_ Approved" was indistinguishable from "when Status _is_ Approved" — which is
  true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
  filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
  never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
  `NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
  started at Approved did not _become_ anything. Comparison is loose across the string boundary
  metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

  The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
  `await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
  reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
  snapshot also closes a latent bug — `entity.IsSaved` was previously read _after_ an await, so a
  create whose save finalized in that window dispatched as `AfterUpdate`.

  **Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
  consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
  row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
  pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
  fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
  filter.

  **Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
  outright because the contract to honor it did not exist. It now reconciles onto an owned
  `ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
  expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
  trigger that silently never fires.

  **Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
  on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
  "compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
  reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
  one shared action, so matching on entity + action alone would let a second process silently repoint
  the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
  one expression vocabulary covers both surfaces.

  **Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
  loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
  the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
  orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
  binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
  submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
  be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
  `Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
  joins `agentName`/`assignToUser`.

  Durability replaces _execution_, not _dispatch_: `RunActionParams.DeferExecution` is called by
  `RunAction` in place of running the action, after validation and filters have passed, so a durable
  binding is gated by exactly what an inline one is gated by. Submitting at dispatch time instead —
  which is where this first landed — would have fired a scoped durable trigger for every record of the
  entity and a filtered one on every save.

  **Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
  with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
  claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
  time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
  and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
  run, reporting when it stopped at its ceiling rather than because it was finished.

  **The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
  with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
  one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
  parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
  inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
  drift again.

  **The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
  and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
  so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
  resolver reports it as the ordinary outcome it is.

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [82a8585]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/task-graph@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/integration-engine@6.1.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.2
  - @memberjunction/notifications@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/record-set-processor@6.1.0-edge.2
  - @memberjunction/scheduling-engine-base@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2
  - @memberjunction/scheduling-base-types@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

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
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/actions@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/task-graph@6.1.0-edge.1
  - @memberjunction/notifications@6.1.0-edge.1
  - @memberjunction/record-set-processor@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/integration-engine@6.1.0-edge.1
  - @memberjunction/scheduling-engine-base@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/scheduling-base-types@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [8d0d45a]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/notifications@6.1.0-edge.0
  - @memberjunction/integration-engine@6.1.0-edge.0
  - @memberjunction/record-set-processor@6.1.0-edge.0
  - @memberjunction/scheduling-engine-base@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/scheduling-base-types@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/notifications@6.0.0
  - @memberjunction/integration-engine@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/record-set-processor@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/scheduling-engine-base@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/scheduling-base-types@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [c382605]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/record-set-processor@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/notifications@5.51.0
  - @memberjunction/integration-engine@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/scheduling-engine-base@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/scheduling-base-types@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [1e0008f]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/integration-engine@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/notifications@5.50.0
  - @memberjunction/record-set-processor@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/scheduling-engine-base@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/scheduling-base-types@5.50.0

## 5.49.0

### Patch Changes

- 88d707b: Communication **DryRun** send mode + a real HTML-body fallback fix.
  - **DryRun seam (new capability)** — `Message.DryRun` and `MessageResult.DryRun` on the base contract (`communication-types`), threaded through the engine and honored by all five shipping providers (SendGrid, Gmail, Twilio, MS Graph, Expo Push). When `DryRun` is true a provider runs its **full** preflight + payload construction and reports success **without** contacting its external service, stamping `MessageResult.DryRun = true`. Lets scheduled jobs and tests exercise the entire send pipeline with zero real messages sent. `scheduling-engine` passes the flag through on scheduled communication sends.
  - **B64 fix (`communication-engine`)** — `ProcessedMessageServer.Process` derives the HTML body from the BodyTemplate (its HTML content render, or the documented rendered-text fallback), then the trailing `else` branch unconditionally overwrote it with `HTMLBody || ''` — so any message without an explicit HTMLBody/HTMLBodyTemplate shipped an **empty** HTML body, making the fallback dead code. The derived value is now preserved (`HTMLBody || ProcessedHTMLBody || ''`).

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

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [7db8ef5]
- Updated dependencies [505c8b5]
- Updated dependencies [48fa886]
- Updated dependencies [314f667]
- Updated dependencies [70113b1]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [5473e9a]
- Updated dependencies [bc388e3]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
- Updated dependencies [9d6e3d9]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/integration-engine@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/notifications@5.49.0
  - @memberjunction/record-set-processor@5.49.0
  - @memberjunction/scheduling-engine-base@5.49.0
  - @memberjunction/scheduling-base-types@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [2143b98]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-agents@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/sqlserver-dataprovider@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/ai-prompts@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/actions@5.48.0
  - @memberjunction/notifications@5.48.0
  - @memberjunction/integration-engine@5.48.0
  - @memberjunction/record-set-processor@5.48.0
  - @memberjunction/scheduling-engine-base@5.48.0
  - @memberjunction/templates@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/scheduling-base-types@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [936a286]
  - @memberjunction/core@5.47.0
  - @memberjunction/sqlserver-dataprovider@5.47.0
  - @memberjunction/ai-agents@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/ai-prompts@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/actions@5.47.0
  - @memberjunction/notifications@5.47.0
  - @memberjunction/integration-engine@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/record-set-processor@5.47.0
  - @memberjunction/scheduling-engine-base@5.47.0
  - @memberjunction/templates@5.47.0
  - @memberjunction/global@5.47.0
  - @memberjunction/scheduling-base-types@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-agents@5.46.0
  - @memberjunction/ai-prompts@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/actions@5.46.0
  - @memberjunction/notifications@5.46.0
  - @memberjunction/integration-engine@5.46.0
  - @memberjunction/record-set-processor@5.46.0
  - @memberjunction/sqlserver-dataprovider@5.46.0
  - @memberjunction/scheduling-engine-base@5.46.0
  - @memberjunction/templates@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/scheduling-base-types@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-agents@5.45.1
  - @memberjunction/ai-prompts@5.45.1
  - @memberjunction/record-set-processor@5.45.1
  - @memberjunction/templates@5.45.1
  - @memberjunction/sqlserver-dataprovider@5.45.1
  - @memberjunction/notifications@5.45.1
  - @memberjunction/actions-base@5.45.1
  - @memberjunction/actions@5.45.1
  - @memberjunction/integration-engine@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/scheduling-engine-base@5.45.1
  - @memberjunction/scheduling-base-types@5.45.1

## 5.45.0

### Minor Changes

- c1f2d3d: User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; Agent-target routines run inside a dedicated per-routine Conversation (Application-scoped via the Routines app so it stays out of the default chat list; RunAgentInConversation writes proper user/assistant turns; standalone fallback when the app is absent); UserRoutine.ConversationID schema + open-conversation and open-execution-record event chains through the conversations hosts; server-side cascade delete (recipients + run bookkeeping) so routines that have run delete cleanly; agent picker is a compact mj-tree-dropdown (DefaultExpansion pass-through added); mj-slide-panel settles to transform:none when open so position:fixed descendants (dropdown panels) keep true viewport coordinates; time-relative sidebar/card/history text is snapshot-based (NG0100 fix); 16-test live integration suite + live Playwright E2E; Explorer notifications page rebuilt (day-grouped cards, sanitized HTML + Markdown message rendering with expand/collapse previews, snapshot relative times, removal of a test harness that created junk Conversations on Mark-All-Read) and the seeded routine notification template gains a compact Markdown Text body that the dispatcher now prefers for in-app delivery (the HTML document stays for email); new @memberjunction/ng-composer package extracts the conversations message composer (mention editor + dropdown + message input box) so the routine editor's InitialMessage field uses the mention editor without an ng-conversations dependency cycle — and the composer's mention/command triggers are PLUGGABLE: a generic ComposerTriggerProvider contract (TriggerChar/Key/Priority/GetSuggestions, generic MentionSuggestion with provider-supplied presets) with two supply modes (explicit [TriggerProviders] list, or ClassFactory discovery via @RegisterClass(ComposerTriggerProvider,'<key>') filtered by [ExcludedTriggerKeys]), leaving ng-composer with ZERO AI knowledge; the AI plugins moved to ng-conversations (composer-plugins: 'agent-mentions' '@' agents+users w/ configuration presets, 'record-mentions' '#' entities+queries, 'skill-commands' '/' skills — tree-shake-guarded by LoadComposerPlugins(); MentionAutocompleteService moved back to ng-conversations as a BaseSingleton engine shared by plugins and components) plus a new mj-ai-composer wrapped component that proxies the full mj-message-input-box surface with the AI triggers built in and familiar EnableAgentMentions/EnableEntityMentions/EnableSkillCommands convenience flags (the chat composer now uses it); the routine editor uses discovery mode with agent-mentions excluded.

### Patch Changes

- d461df0: Auto-restart scheduled-job polling when a job is activated after MJAPI boot. Adds a JobsChanged$ notification on the base engine (covering local and cross-server changes) that wakes a suspended poll timer, and re-applies the Active-only filter on event-driven refreshes.
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [19ec4b0]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [f99cbc1]
- Updated dependencies [11d5b4e]
- Updated dependencies [fbee64c]
- Updated dependencies [81a8aa2]
- Updated dependencies [82ca89b]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
- Updated dependencies [d461df0]
  - @memberjunction/core@5.45.0
  - @memberjunction/ai-agents@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/integration-engine@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/scheduling-engine-base@5.45.0
  - @memberjunction/ai-prompts@5.45.0
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/actions@5.45.0
  - @memberjunction/notifications@5.45.0
  - @memberjunction/record-set-processor@5.45.0
  - @memberjunction/sqlserver-dataprovider@5.45.0
  - @memberjunction/templates@5.45.0
  - @memberjunction/scheduling-base-types@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [eb38a42]
- Updated dependencies [3633fbb]
- Updated dependencies [d88568e]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [91842c3]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agents@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/record-set-processor@5.44.0
  - @memberjunction/sqlserver-dataprovider@5.44.0
  - @memberjunction/actions-base@5.44.0
  - @memberjunction/actions@5.44.0
  - @memberjunction/integration-engine@5.44.0
  - @memberjunction/scheduling-engine-base@5.44.0
  - @memberjunction/scheduling-base-types@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [aa21fef]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [4e05350]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-agents@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/actions@5.43.0
  - @memberjunction/record-set-processor@5.43.0
  - @memberjunction/integration-engine@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/sqlserver-dataprovider@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/scheduling-engine-base@5.43.0
  - @memberjunction/scheduling-base-types@5.43.0

## 5.42.0

### Minor Changes

- 9b9b484: Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

  **Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
  - Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely _contains_ a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
  - New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
  - `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

  **Telemetry (`@memberjunction/core`)**
  - Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

  **Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
  - Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
  - Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

  **"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
  - Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.

- 6d970cd: Runtime SQL dialect correctness on PostgreSQL:
  - **scheduling-engine**: PostgreSQL-correct heartbeat lease extension — affected-rowcount handling +
    mixed-case column quoting in `spExtendScheduledJobLease`, with a PG-only migration. _(migration → minor)_
  - **postgresql-dataprovider** + call-sites (archiving-engine, core-entities, ng-dashboards,
    ng-entity-communications): translate T-SQL date functions (`GETDATE()`, `DATEADD`, etc.) in
    runtime SQL clauses to PostgreSQL equivalents. _(code → patch)_

- 0fa3cbc: Record Set Processing & Record Processes, plus the Remote Operations primitive.

  **Remote Operations** (`@memberjunction/core`, `@memberjunction/global`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`) — a typed, provider-routed capability the browser and server both invoke through one call site, the peer of `BaseEntity` (CRUD) and `RunView` (set reads):
  - `BaseRemotableOperation<TInput,TOutput>` with `OperationKey` / `RequiredScope` / `RequiresSystemUser` / `ExecutionMode`; `Execute()` routes per-provider, `ExecuteServer()` runs in-process and never throws on logical failure.
  - `IRemoteOperationProvider.RouteOperation` on `ProviderBase` (the documented power tool), in-process dispatch in `DatabaseProviderBase`, GraphQL marshalling in `GraphQLDataProvider`, and the single generic `ExecuteRemoteOperation` resolver that composes the existing API-key-scope + user-permission auth chain.
  - Genericized value-mapping resolver in `@memberjunction/global` (`getValueAtPath` / `resolveMappingRef` / `resolveValueMapping`) — one canonical mapping engine over pluggable named sources.

  **Record Set Processing substrate** (`@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`) — a hardened iterate-a-record-set-and-do-work engine with three pluggable seams (source / processor / run-tracker): batching, bounded concurrency, rate limiting, circuit breaker, checkpoint/resume, and pause/cancel. Ships Array/View/List/Filter/Keyset sources; Action / Agent / Infer record processors; a uniform `WriteBackProcessor` that applies an `OutputMapping` (fields / child record) to any work type; the `RecordProcessExecutor` facade (Scope→source, Work→processor); and the `RecordProcess.RunNow` / `GetRunStatus` / `Pause` / `Resume` / `Cancel` control operations.

  **Record Processes facade** (`@memberjunction/core-entities`, `@memberjunction/core-entities-server`, `@memberjunction/scheduling-engine`, `@memberjunction/actions`) — the `MJ: Record Processes` definition (Work × Scope × Trigger) plus generic `MJ: Process Runs` / `Process Run Details` tracking and the `MJ: Remote Operations` registry. `MJRecordProcessEntityServer` reconciles the owned recurrence Scheduled Job on save; `RecordProcessScheduledJobDriver` runs a process on its cron schedule and links each `ProcessRun` back to its `ScheduledJobRun`; the Entity Action `GetRecordList` View/List fan-out backs scoped iteration.

### Patch Changes

- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [5ada858]
- Updated dependencies [6ac8ca4]
- Updated dependencies [78f834d]
- Updated dependencies [4ec1732]
- Updated dependencies [6520bea]
- Updated dependencies [008f449]
- Updated dependencies [5ebf0e9]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-agents@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/sqlserver-dataprovider@5.42.0
  - @memberjunction/integration-engine@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/record-set-processor@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/scheduling-engine-base@5.42.0
  - @memberjunction/scheduling-base-types@5.42.0

## 5.41.0

### Minor Changes

- 2e48d1a: Add heartbeat-based lease renewal to the scheduled job engine (#2749): running jobs can opt in via context.heartbeat() to keep their concurrency slot alive (atomic, token-checked spExtendScheduledJobLease), with a new ScheduledJob.MaxRuntimeMinutes override for single-long-call jobs that can't beat mid-flight.

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai-agents@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/integration-engine@5.41.0
  - @memberjunction/sqlserver-dataprovider@5.41.0
  - @memberjunction/scheduling-engine-base@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/scheduling-base-types@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-agents@5.40.2
- @memberjunction/sqlserver-dataprovider@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/actions-base@5.40.2
- @memberjunction/actions@5.40.2
- @memberjunction/integration-engine@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/scheduling-engine-base@5.40.2
- @memberjunction/scheduling-base-types@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-agents@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/integration-engine@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/sqlserver-dataprovider@5.40.1
  - @memberjunction/scheduling-engine-base@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/scheduling-base-types@5.40.1

## 5.40.0

### Minor Changes

- 54c9526: Make the scheduling engine's lock/stats sproc calls dialect-aware so scheduled jobs fire on PostgreSQL. The three atomic lock sprocs (acquire → stats-update → release) previously emitted hardcoded T-SQL `EXEC`, which PostgreSQL rejects with a syntax error on the first dispatch tick — meaning no scheduled job ever fired on PG. Calls now route through `provider.Dialect.ProcedureCallSyntax` (`EXEC` on SQL Server, `SELECT * FROM fn(...)` on PostgreSQL) via a new `buildLockSprocCall` helper, the lock-sproc permission probe skips cleanly on non-SQL-Server platforms, and a PG-only migration ports the three routines to plpgsql functions. SQL Server output is byte-identical to before — no behavioral change on the default platform.

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [6ea4de7]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/sqlserver-dataprovider@5.40.0
  - @memberjunction/ai-agents@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/integration-engine@5.40.0
  - @memberjunction/scheduling-engine-base@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/scheduling-base-types@5.40.0

## 5.39.0

### Minor Changes

- 3d4510c: Add an agent-run watchdog that prevents `AIAgentRun` records from being left in `Status='Running'` after a process restart, crash/OOM, or a failed terminal-state write. While a run is in flight the owning process stamps a new `LastHeartbeatAt` column; a staleness-based sweep (once on boot and on a timer) force-fails any `Running` run whose heartbeat has gone stale, and a graceful-shutdown handler cancels the in-flight runs the process owns. All timing is anchored to the database clock and the sweep only ever touches `Status='Running'` rows, so it is safe across multiple MJAPI instances behind a load balancer. Also adds an optional, opt-in `Agent Run Sweep` scheduled-job type (`AgentRunSweepScheduledJobDriver`) that runs the same idempotent sweep through MJ's scheduler for audit/observability.
- 0bef51b: decouple poll loop from job execution to prevent single hung job from stalling the scheduler

### Patch Changes

- Updated dependencies [26761b8]
- Updated dependencies [3d4510c]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [a1e2776]
- Updated dependencies [eaee99f]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/ai-agents@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/sqlserver-dataprovider@5.39.0
  - @memberjunction/integration-engine@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/scheduling-engine-base@5.39.0
  - @memberjunction/scheduling-base-types@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [b2e6782]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-agents@5.38.0
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/sqlserver-dataprovider@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/integration-engine@5.38.0
  - @memberjunction/scheduling-engine-base@5.38.0
  - @memberjunction/scheduling-base-types@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-agents@5.37.0
  - @memberjunction/sqlserver-dataprovider@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/integration-engine@5.37.0
  - @memberjunction/scheduling-engine-base@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/scheduling-base-types@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-agents@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/integration-engine@5.36.0
  - @memberjunction/sqlserver-dataprovider@5.36.0
  - @memberjunction/scheduling-engine-base@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/scheduling-base-types@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [e9d4b1c]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ai-agents@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/sqlserver-dataprovider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/integration-engine@5.35.0
  - @memberjunction/scheduling-engine-base@5.35.0
  - @memberjunction/scheduling-base-types@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-agents@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/integration-engine@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/sqlserver-dataprovider@5.34.1
  - @memberjunction/scheduling-engine-base@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/scheduling-base-types@5.34.1

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
  - @memberjunction/ai-agents@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/integration-engine@5.34.0
  - @memberjunction/sqlserver-dataprovider@5.34.0
  - @memberjunction/scheduling-engine-base@5.34.0
  - @memberjunction/scheduling-base-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/sqlserver-dataprovider@5.33.0
  - @memberjunction/ai-agents@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/integration-engine@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/scheduling-engine-base@5.33.0
  - @memberjunction/scheduling-base-types@5.33.0

## 5.32.0

### Patch Changes

- 26ee07c: fix vectorization crash from using non-provider Metadata() fallback, and harden ScheduledJobEngine lock lifecycle with save verification and DB reload after stale lock cleanup
- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-agents@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/integration-engine@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/scheduling-engine-base@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/scheduling-base-types@5.32.0

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
  - @memberjunction/ai-agents@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/integration-engine@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0
  - @memberjunction/scheduling-engine-base@5.31.0
  - @memberjunction/scheduling-base-types@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agents@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/integration-engine@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/sqlserver-dataprovider@5.30.1
- @memberjunction/scheduling-engine-base@5.30.1
- @memberjunction/scheduling-base-types@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/ai-agents@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/integration-engine@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/scheduling-engine-base@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/scheduling-base-types@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-agents@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/integration-engine@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/scheduling-engine-base@5.29.0
  - @memberjunction/global@5.29.0
  - @memberjunction/scheduling-base-types@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [1d62875]
- Updated dependencies [115e4da]
  - @memberjunction/integration-engine@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-agents@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/scheduling-engine-base@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/scheduling-base-types@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai-agents@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/actions@5.27.1
  - @memberjunction/integration-engine@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/sqlserver-dataprovider@5.27.1
  - @memberjunction/scheduling-engine-base@5.27.1
  - @memberjunction/scheduling-base-types@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.27.0
- @memberjunction/ai-agents@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/actions-base@5.27.0
- @memberjunction/actions@5.27.0
- @memberjunction/integration-engine@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/scheduling-engine-base@5.27.0
- @memberjunction/scheduling-base-types@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/ai-agents@5.26.0
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/integration-engine@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/scheduling-engine-base@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/scheduling-base-types@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [62af878]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/ai-agents@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/integration-engine@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/scheduling-engine-base@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/scheduling-base-types@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-agents@5.24.0
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/integration-engine@5.24.0
  - @memberjunction/scheduling-engine-base@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/scheduling-base-types@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-agents@5.23.0
  - @memberjunction/sqlserver-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/integration-engine@5.23.0
  - @memberjunction/scheduling-engine-base@5.23.0
  - @memberjunction/scheduling-base-types@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [21e0b69]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-agents@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/integration-engine@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/scheduling-engine-base@5.22.0
  - @memberjunction/scheduling-base-types@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [b29716c]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-agents@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/integration-engine@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/scheduling-engine-base@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/scheduling-base-types@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [7ab01a8]
- Updated dependencies [2298f8a]
  - @memberjunction/ai-agents@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/integration-engine@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/scheduling-engine-base@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/scheduling-base-types@5.20.0

## 5.19.0

### Patch Changes

- Updated dependencies [f9001de]
  - @memberjunction/ai-agents@5.19.0
  - @memberjunction/ai-core-plus@5.19.0
  - @memberjunction/actions-base@5.19.0
  - @memberjunction/actions@5.19.0
  - @memberjunction/integration-engine@5.19.0
  - @memberjunction/core@5.19.0
  - @memberjunction/core-entities@5.19.0
  - @memberjunction/global@5.19.0
  - @memberjunction/sqlserver-dataprovider@5.19.0
  - @memberjunction/scheduling-engine-base@5.19.0
  - @memberjunction/scheduling-base-types@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [5f91957]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-agents@5.18.0
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/actions@5.18.0
  - @memberjunction/integration-engine@5.18.0
  - @memberjunction/sqlserver-dataprovider@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/scheduling-engine-base@5.18.0
  - @memberjunction/scheduling-base-types@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/integration-engine@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/ai-agents@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/scheduling-engine-base@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/scheduling-base-types@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-agents@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/integration-engine@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/sqlserver-dataprovider@5.16.0
  - @memberjunction/scheduling-engine-base@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/scheduling-base-types@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-agents@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/integration-engine@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/sqlserver-dataprovider@5.15.0
  - @memberjunction/scheduling-engine-base@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/scheduling-base-types@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/integration-engine@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/ai-agents@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/sqlserver-dataprovider@5.14.0
  - @memberjunction/scheduling-engine-base@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/scheduling-base-types@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-agents@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/integration-engine@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/sqlserver-dataprovider@5.13.0
  - @memberjunction/scheduling-engine-base@5.13.0
  - @memberjunction/scheduling-base-types@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [257512b]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/integration-engine@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/ai-agents@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/sqlserver-dataprovider@5.12.0
  - @memberjunction/scheduling-engine-base@5.12.0
  - @memberjunction/global@5.12.0
  - @memberjunction/scheduling-base-types@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [0dca9db]
  - @memberjunction/core@5.11.0
  - @memberjunction/sqlserver-dataprovider@5.11.0
  - @memberjunction/ai-agents@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/scheduling-engine-base@5.11.0
  - @memberjunction/global@5.11.0
  - @memberjunction/scheduling-base-types@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-agents@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/sqlserver-dataprovider@5.10.1
- @memberjunction/scheduling-engine-base@5.10.1
- @memberjunction/scheduling-base-types@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ai-agents@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/sqlserver-dataprovider@5.10.0
  - @memberjunction/scheduling-engine-base@5.10.0
  - @memberjunction/global@5.10.0
  - @memberjunction/scheduling-base-types@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/sqlserver-dataprovider@5.9.0
  - @memberjunction/ai-agents@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/scheduling-engine-base@5.9.0
  - @memberjunction/scheduling-base-types@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/sqlserver-dataprovider@5.8.0
  - @memberjunction/ai-agents@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/scheduling-engine-base@5.8.0
  - @memberjunction/global@5.8.0
  - @memberjunction/scheduling-base-types@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai-agents@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/sqlserver-dataprovider@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/scheduling-engine-base@5.7.0
  - @memberjunction/global@5.7.0
  - @memberjunction/scheduling-base-types@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-agents@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/sqlserver-dataprovider@5.6.0
  - @memberjunction/scheduling-engine-base@5.6.0
  - @memberjunction/global@5.6.0
  - @memberjunction/scheduling-base-types@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [2973c64]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/sqlserver-dataprovider@5.5.0
  - @memberjunction/ai-agents@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/scheduling-engine-base@5.5.0
  - @memberjunction/scheduling-base-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-agents@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/actions@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/sqlserver-dataprovider@5.4.1
- @memberjunction/scheduling-engine-base@5.4.1
- @memberjunction/scheduling-base-types@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
- Updated dependencies [bc993b8]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-agents@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/actions@5.4.0
  - @memberjunction/sqlserver-dataprovider@5.4.0
  - @memberjunction/scheduling-engine-base@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0
  - @memberjunction/scheduling-base-types@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-agents@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/actions@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/sqlserver-dataprovider@5.3.1
- @memberjunction/scheduling-engine-base@5.3.1
- @memberjunction/scheduling-base-types@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [ebf057a]
- Updated dependencies [1692c53]
  - @memberjunction/ai-agents@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/actions@5.3.0
  - @memberjunction/sqlserver-dataprovider@5.3.0
  - @memberjunction/scheduling-engine-base@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0
  - @memberjunction/scheduling-base-types@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/sqlserver-dataprovider@5.2.0
  - @memberjunction/ai-agents@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/scheduling-engine-base@5.2.0
  - @memberjunction/scheduling-base-types@5.2.0
  - @memberjunction/actions@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-agents@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/actions@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/sqlserver-dataprovider@5.1.0
  - @memberjunction/scheduling-engine-base@5.1.0
  - @memberjunction/scheduling-base-types@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/sqlserver-dataprovider@5.0.0
  - @memberjunction/ai-agents@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/actions@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/scheduling-engine-base@5.0.0
  - @memberjunction/scheduling-base-types@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-agents@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/actions@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/sqlserver-dataprovider@4.4.0
  - @memberjunction/scheduling-engine-base@4.4.0
  - @memberjunction/global@4.4.0
  - @memberjunction/scheduling-base-types@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-agents@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/actions@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/sqlserver-dataprovider@4.3.1
- @memberjunction/scheduling-engine-base@4.3.1
- @memberjunction/scheduling-base-types@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [6f4d33f]
- Updated dependencies [564e1af]
  - @memberjunction/ai-agents@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/actions@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/scheduling-engine-base@4.3.0
  - @memberjunction/global@4.3.0
  - @memberjunction/scheduling-base-types@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-agents@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/actions@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/sqlserver-dataprovider@4.2.0
- @memberjunction/scheduling-engine-base@4.2.0
- @memberjunction/scheduling-base-types@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/sqlserver-dataprovider@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-agents@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/actions@4.1.0
  - @memberjunction/scheduling-engine-base@4.1.0
  - @memberjunction/global@4.1.0
  - @memberjunction/scheduling-base-types@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/ai-agents@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/actions@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/scheduling-engine-base@4.0.0
  - @memberjunction/scheduling-base-types@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-agents@3.4.0
  - @memberjunction/actions@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/scheduling-engine-base@3.4.0
  - @memberjunction/global@3.4.0
  - @memberjunction/scheduling-base-types@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [4bbb600]
- Updated dependencies [ca551dd]
  - @memberjunction/ai-agents@3.3.0
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/actions-base@3.3.0
  - @memberjunction/actions@3.3.0
  - @memberjunction/sqlserver-dataprovider@3.3.0
  - @memberjunction/scheduling-engine-base@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0
  - @memberjunction/scheduling-base-types@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [011c820]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ai-agents@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/actions-base@3.2.0
  - @memberjunction/actions@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/scheduling-engine-base@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0
  - @memberjunction/scheduling-base-types@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai-agents@3.1.1
- @memberjunction/ai-core-plus@3.1.1
- @memberjunction/actions-base@3.1.1
- @memberjunction/actions@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/sqlserver-dataprovider@3.1.1
- @memberjunction/scheduling-engine-base@3.1.1
- @memberjunction/scheduling-base-types@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-agents@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/actions-base@3.0.0
- @memberjunction/actions@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/sqlserver-dataprovider@3.0.0
- @memberjunction/scheduling-engine-base@3.0.0
- @memberjunction/scheduling-base-types@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-agents@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/actions-base@2.133.0
  - @memberjunction/actions@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/scheduling-engine-base@2.133.0
  - @memberjunction/global@2.133.0
  - @memberjunction/scheduling-base-types@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-agents@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/actions-base@2.132.0
  - @memberjunction/actions@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/scheduling-engine-base@2.132.0
  - @memberjunction/global@2.132.0
  - @memberjunction/scheduling-base-types@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [3604aa1]
- Updated dependencies [81598e3]
- Updated dependencies [d3d2926]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-agents@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/actions-base@2.131.0
  - @memberjunction/actions@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/scheduling-engine-base@2.131.0
  - @memberjunction/global@2.131.0
  - @memberjunction/scheduling-base-types@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-agents@2.130.1
- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/actions-base@2.130.1
- @memberjunction/actions@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/sqlserver-dataprovider@2.130.1
- @memberjunction/scheduling-engine-base@2.130.1
- @memberjunction/scheduling-base-types@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
- Updated dependencies [f4e1f05]
  - @memberjunction/ai-agents@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/actions@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/actions-base@2.130.0
  - @memberjunction/scheduling-engine-base@2.130.0
  - @memberjunction/global@2.130.0
  - @memberjunction/scheduling-base-types@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [573179f]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/sqlserver-dataprovider@2.129.0
  - @memberjunction/ai-agents@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/actions-base@2.129.0
  - @memberjunction/actions@2.129.0
  - @memberjunction/scheduling-engine-base@2.129.0
  - @memberjunction/scheduling-base-types@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-agents@2.128.0
  - @memberjunction/actions-base@2.128.0
  - @memberjunction/actions@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/scheduling-engine-base@2.128.0
  - @memberjunction/global@2.128.0
  - @memberjunction/scheduling-base-types@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ai-agents@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/actions@2.127.0
  - @memberjunction/actions-base@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0
  - @memberjunction/scheduling-engine-base@2.127.0
  - @memberjunction/scheduling-base-types@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai-agents@2.126.1
- @memberjunction/actions-base@2.126.1
- @memberjunction/actions@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/sqlserver-dataprovider@2.126.1
- @memberjunction/scheduling-engine-base@2.126.1
- @memberjunction/scheduling-base-types@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [d424fce]
- Updated dependencies [703221e]
  - @memberjunction/ai-agents@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/actions-base@2.126.0
  - @memberjunction/actions@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/scheduling-engine-base@2.126.0
  - @memberjunction/global@2.126.0
  - @memberjunction/scheduling-base-types@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ai-agents@2.125.0
  - @memberjunction/actions-base@2.125.0
  - @memberjunction/actions@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/scheduling-engine-base@2.125.0
  - @memberjunction/global@2.125.0
  - @memberjunction/scheduling-base-types@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [4b2181d]
- Updated dependencies [cabe329]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-agents@2.124.0
  - @memberjunction/actions-base@2.124.0
  - @memberjunction/actions@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/scheduling-engine-base@2.124.0
  - @memberjunction/global@2.124.0
  - @memberjunction/scheduling-base-types@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-agents@2.123.1
- @memberjunction/actions-base@2.123.1
- @memberjunction/actions@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1
- @memberjunction/scheduling-engine-base@2.123.1
- @memberjunction/scheduling-base-types@2.123.1

## 2.123.0

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ai-agents@2.123.0
  - @memberjunction/actions@2.123.0
  - @memberjunction/sqlserver-dataprovider@2.123.0
  - @memberjunction/actions-base@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/scheduling-engine-base@2.123.0
  - @memberjunction/scheduling-base-types@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/ai-agents@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/actions@2.122.2
  - @memberjunction/actions-base@2.122.2
  - @memberjunction/scheduling-engine-base@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2
  - @memberjunction/scheduling-base-types@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai-agents@2.122.1
- @memberjunction/actions@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1
- @memberjunction/scheduling-engine-base@2.122.1
- @memberjunction/scheduling-base-types@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-agents@2.122.0
  - @memberjunction/actions@2.122.0
  - @memberjunction/scheduling-engine-base@2.122.0
  - @memberjunction/global@2.122.0
  - @memberjunction/scheduling-base-types@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai-agents@2.121.0
  - @memberjunction/actions@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/sqlserver-dataprovider@2.121.0
  - @memberjunction/scheduling-engine-base@2.121.0
  - @memberjunction/global@2.121.0
  - @memberjunction/scheduling-base-types@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-agents@2.120.0
  - @memberjunction/actions@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/sqlserver-dataprovider@2.120.0
  - @memberjunction/scheduling-engine-base@2.120.0
  - @memberjunction/global@2.120.0
  - @memberjunction/scheduling-base-types@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
- Updated dependencies [62790f4]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/ai-agents@2.119.0
  - @memberjunction/actions@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/scheduling-engine-base@2.119.0
  - @memberjunction/global@2.119.0
  - @memberjunction/scheduling-base-types@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [a2901ff]
- Updated dependencies [264c57a]
- Updated dependencies [a49a7a8]
- Updated dependencies [096ece6]
- Updated dependencies [7dcfd9c]
- Updated dependencies [78721d8]
  - @memberjunction/ai-agents@2.118.0
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/actions@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0
  - @memberjunction/scheduling-engine-base@2.118.0
  - @memberjunction/global@2.118.0
  - @memberjunction/scheduling-base-types@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [36db9d9]
- Updated dependencies [8c092ec]
  - @memberjunction/ai-agents@2.117.0
  - @memberjunction/core@2.117.0
  - @memberjunction/actions@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/sqlserver-dataprovider@2.117.0
  - @memberjunction/scheduling-engine-base@2.117.0
  - @memberjunction/global@2.117.0
  - @memberjunction/scheduling-base-types@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-agents@2.116.0
  - @memberjunction/actions@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/sqlserver-dataprovider@2.116.0
  - @memberjunction/scheduling-engine-base@2.116.0
  - @memberjunction/scheduling-base-types@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [6378103]
- Updated dependencies [c29e21b]
  - @memberjunction/ai-agents@2.115.0
  - @memberjunction/actions@2.115.0
  - @memberjunction/sqlserver-dataprovider@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0
  - @memberjunction/scheduling-engine-base@2.115.0
  - @memberjunction/scheduling-base-types@2.115.0

## 2.114.0

### Patch Changes

- Updated dependencies [683eaeb]
- Updated dependencies [7f46575]
- Updated dependencies [9af02f0]
  - @memberjunction/ai-agents@2.114.0
  - @memberjunction/actions@2.114.0
  - @memberjunction/core@2.114.0
  - @memberjunction/core-entities@2.114.0
  - @memberjunction/global@2.114.0
  - @memberjunction/sqlserver-dataprovider@2.114.0
  - @memberjunction/scheduling-engine-base@2.114.0
  - @memberjunction/scheduling-base-types@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-agents@2.113.2
  - @memberjunction/actions@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/sqlserver-dataprovider@2.113.2
  - @memberjunction/scheduling-engine-base@2.113.2
  - @memberjunction/global@2.113.2
  - @memberjunction/scheduling-base-types@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [2ac2120]
- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/ai-agents@2.112.0
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/actions@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/scheduling-engine-base@2.112.0
  - @memberjunction/scheduling-base-types@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-agents@2.110.1
- @memberjunction/actions@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/sqlserver-dataprovider@2.110.1
- @memberjunction/scheduling-engine-base@2.110.1
- @memberjunction/scheduling-base-types@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
- Updated dependencies [8f1384a]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/ai-agents@2.110.0
  - @memberjunction/actions@2.110.0
  - @memberjunction/scheduling-engine-base@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0
  - @memberjunction/scheduling-base-types@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [e2a6338]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-agents@2.109.0
  - @memberjunction/actions@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/scheduling-engine-base@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0
  - @memberjunction/scheduling-base-types@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [5d51137]
- Updated dependencies [687e2ae]
- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/ai-agents@2.108.0
  - @memberjunction/actions@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0
  - @memberjunction/scheduling-engine-base@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0
  - @memberjunction/scheduling-base-types@2.108.0

## 2.107.0

### Minor Changes

- e05a672: migration
- 0dd1d04: migration
- 0be127f: migration

### Patch Changes

- Updated dependencies [e05a672]
- Updated dependencies [0dd1d04]
- Updated dependencies [0be127f]
  - @memberjunction/scheduling-engine-base@2.107.0
  - @memberjunction/scheduling-base-types@2.107.0
  - @memberjunction/ai-agents@2.107.0
  - @memberjunction/actions@2.107.0
  - @memberjunction/core@2.107.0
  - @memberjunction/core-entities@2.107.0
  - @memberjunction/global@2.107.0
  - @memberjunction/sqlserver-dataprovider@2.107.0
