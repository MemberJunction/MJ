# @memberjunction/testing-integration

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

### Patch Changes

- ed326fb: `IntegrationCheckRegistry` now rejects a duplicate check Id instead of silently replacing the earlier check (#5456). Before, a second check registered under an existing Id overwrote the first, which then never ran and was never reported missing.
  - `Register` throws, naming the Id, when the Id already belongs to a different check. Registering the same object again is a no-op. An equivalent copy (same Id, Name, tier flags and function source, as produced when a bundler evaluates the same check module twice) is accepted and replaces the stored one.
  - `RegisterLifecycle` applies the same rule per bundle: a different Setup/Teardown for a bundle that already has one throws.

- b968642: A transaction group now updates each cached result set once for the whole group instead of once per row. `TransactionGroupBase.Submit` runs the item callbacks and the outcome notification — where each entity in the group raises its save or delete event — inside an entity-event batch for every provider the group's entities use. On a shared cache this means one published message per affected result set rather than one per row: a group of 40 `MJ: AI Models` updates went from 40 messages (12.2 MB) to 1 (0.3 MB). A group that does not fully succeed invalidates the affected result sets instead of applying part of it. Browser-side groups get the same batching.

  `Submit()` now waits for that cache maintenance before it resolves, where per-row maintenance used to run without waiting: one wait per provider per group, including any wait on a shared cache's cross-process lock, the same as `BeginEntityTransaction`. Batches are keyed by provider, so a save raised for the same provider while the group's callbacks run joins its batch, and is invalidated rather than applied if the group fails. In a browser, where every entity shares one provider, that can include an unrelated save made in that window; it reloads on its next read.

  `BaseEngine` no longer rewrites its own cached result set for an event a batch already took: `LocalCacheManager.WasTakenByEntityEventBatch(event)` reports it, so an engine whose update lands after the batch has closed leaves the slot to the batch.

  `InstrumentedLocalStorageProvider` gains `SetCountForKey(key)`, the number of writes to a single cache key.

  The per-row cache-invalidation messages MJAPI pushes to connected browsers are unchanged.

- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [dde482c]
- Updated dependencies [49f26d9]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [32fedd8]
- Updated dependencies [fcf8e1c]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [e533f99]
- Updated dependencies [c0ebd97]
- Updated dependencies [7dc604e]
- Updated dependencies [08b3d7b]
- Updated dependencies [dbc3462]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [31057d8]
- Updated dependencies [aac148b]
- Updated dependencies [e1942c7]
- Updated dependencies [bdea87a]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [b653746]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/generic-database-provider@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.4
  - @memberjunction/dynamic-packages@6.2.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.4
  - @memberjunction/testing-engine@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/testing-engine-base@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 41c2c08: Stop serializing the whole metadata graph into a store nothing can read it back from

  `ProviderBase.SaveLocalMetadataToStorage()` ran `JSON.stringify` over the entire metadata graph on
  every metadata reload, then copied it into a `Blob`, gzipped it, and base64-encoded it one byte at a
  time. The snapshot exists so a cold process can start from a cached copy instead of querying — which
  only works if the store outlives the writer. On a server with no `REDIS_URL` the store is an
  in-process `Map`, so the only possible reader is the heap that already holds the live objects, and
  the whole round trip buys nothing.

  Measured on a 791-entity tenant: 131.5M characters per stringify, ~10s and ~1.2GB of transient heap
  per refresh against a 2.2GB steady state, and the final flatten of that string needs one contiguous
  ~500MB allocation. Saved queries are metadata members, so an agent writing them marks metadata stale
  and triggers a refresh roughly every 30 seconds; two overlapping refreshes exhausted the heap and
  MJAPI died with `Reached heap limit Allocation failed` inside `String::SlowFlatten`.

  `ILocalStorageProvider` gains an optional `SupportsCrossProcessPersistence`. `ProviderBase` skips
  both the save and the load when it is `false`, logging the reason once per process. A provider that
  does not declare it is treated as persistent, so Redis and browser behaviour is unchanged — the
  conservative direction, since a pointless save only wastes work while wrongly skipping a necessary
  one would leave a cache that never populates. Every in-repo provider now declares it, including the
  instrumented test wrapper, which delegates to the store it wraps.

  `arrayBufferToBase64` / `base64ToArrayBuffer` use Node's native codec when `Buffer` exists, falling
  back to the existing loops in the browser. The byte-at-a-time encoder built a rope the size of the
  payload and then forced a flatten, measured at 3702ms for an 8.6MB buffer under heap pressure
  against 191ms cold.

  `TelemetryManager.trimIfNeeded()` only ever trimmed `_events`. Three collections derived from it were
  never released for the life of the process: `_insights` grew by one entry per emitted warning,
  `_patterns` by one per distinct fingerprint (every new filter combination is a new fingerprint, so it
  grew with query variety), and `_insightDedupeWindow` by one per dedupe key. All three are now bound
  on the same schedule as the events they come from — `maxInsights` defaults to 1000, and the two map
  sweeps are O(n) so they run at most once a minute rather than on every recorded event.

  After the equivalent patch on a live tenant: the refresh cycle went from 10019/9372/8994 ms to
  330/214/298 ms, heap peak from 3597/3171/3171 MB to 1576/1575/1575 MB, the per-refresh transient
  spike from +1.0-1.2 GB to 0, and the retained baseline from 2204 MB to 1575 MB.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [fe39606]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/generic-database-provider@6.2.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/testing-engine@6.2.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.3
  - @memberjunction/testing-engine-base@6.2.0-edge.3
  - @memberjunction/dynamic-packages@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- 55c1c58: Add the `record-cloning` integration bundle (`IT96 - Record Cloning`, client transport): RC1 to RC9 from the record cloning plan (user, prompt and action clones, dry run, authorization refusal, rollback, provenance, stale plan hash, Record Change annotation) plus RC10 to RC12, read-only plans against the live database (unlisted relationships skipped, company integrations and encrypted values kept out of a scheduled job plan, and the user settings exclusions). `IntegrationCheckContext` gains a `RecordCloningFixture`.
- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [72d8a40]
- Updated dependencies [f3c6161]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [7e57b48]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [2ceedb4]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/testing-engine@6.2.0-edge.2
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.2
  - @memberjunction/generic-database-provider@6.2.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/testing-engine-base@6.2.0-edge.2
  - @memberjunction/dynamic-packages@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [48f77ea]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [351ba9f]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/dynamic-packages@6.2.0-edge.1
  - @memberjunction/generic-database-provider@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.1
  - @memberjunction/testing-engine@6.2.0-edge.1
  - @memberjunction/testing-engine-base@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [5df9486]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [3d633ed]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/generic-database-provider@6.2.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.0
  - @memberjunction/testing-engine-base@6.2.0-edge.0
  - @memberjunction/testing-engine@6.2.0-edge.0
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/dynamic-packages@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- f5ec13b: Fix the queue engine's terminal-status write, and stop MJAPI's task-graph dispatcher from competing with a test harness.

  **`QueueBase` could never record a task outcome.** `StartTask` discarded the boolean `Save()` return, so the terminal-status write failed silently: the row kept whatever status it held before the run while the in-memory task still reported `Complete`. Underneath it, no role held `CanUpdate` on `MJ: Queue Tasks` or `MJ: Queues`, so CodeGen had never emitted an update grant and `spUpdateQueueTask` carried no `EXECUTE` grant at all. The Developer + Integration CRUD grants are now in `metadata/entity-permissions`, matching every other engine-written entity (`MJ: Tasks`, `MJ: Scheduled Jobs`, `MJ: Action Execution Logs`), with a migration that applies the SQL grants directly — a fresh install runs `migrate` + `sync push` and no CodeGen, so metadata alone would leave the permission correct in Explorer and broken at runtime.

  **`MJ_DISABLE_TASK_GRAPH_DISPATCHER` opts a server out of claiming.** A dispatcher claims from the whole `Task` table rather than from "its own" graphs, so a second dispatcher on the same database is a competitor — correct in production, and wrong for a harness that injects a stub runner and then asserts which tasks its own runner executed. Tasks MJAPI won were executed with the real agent runner and never reached the stub, which the harness read as "never ran". Immediately-eligible root tasks lose that race most often, so it presented as an intermittent failure.

  Also in the integration suite: the RLS fixture now carries the clauses discovery compared (a client-transport check cannot re-derive them and was reporting a cache leak that did not exist), the auth-validation fixtures supply every shipped provider's required config fields, the cache-gauntlet anti-vacuity floors are created rather than assumed, and the task-graph checks wait for the child read-back instead of silently undercounting.

### Patch Changes

- 41b0d28: Load Open App server packages in every MJ process, not only MJAPI (#4199).

  `mj sync push` (and `mj app …`, `mj test`, the MCP/A2A servers, the integration-test bootstrap)
  never imported an installed app's server package, so `Metadata.GetEntityObject` handed back a
  generic `BaseEntity` for the app's entities and every custom `Save()`, validation rule and
  lifecycle hook was silently skipped — while MJ core's own server subclasses, loaded through the
  lite manifest, did run. New `@memberjunction/dynamic-packages` extracts the loader (and the
  host-anchored import) out of `server-bootstrap` into a package with no MJ runtime dependencies,
  and each host is now one `LoadDynamicPackages({ processId })` call. ServerBootstrap consumes it
  with two deliberate behaviour changes: it no longer attempts to import the Angular forms package
  into Node, and when an `mj-app.json` sits beside its `mj.config.cjs` (an Open App repo running its
  own dev host) it now loads that app's server packages and resolver paths too.

  `dynamicPackages.server[]` stays the single list `mj app install` writes; when both it and an
  `mj-app.json` name a package, the config entry decides `Enabled` and scoping while the manifest's
  on-disk location remains the resolution fallback. Entries gain optional
  `Processes` / `ExcludeProcesses` (process IDs or prefixes: `cli`, `cli:sync`, `cli:sync:push`,
  `mjapi`, `mcp`, …) and the section gains an optional `policy` map, so a package can be scoped to
  just `mj sync` or switched off for `mj migrate`. `MJ_DYNAMIC_PACKAGES=none` and the global CLI
  flag `--no-app-packages` (declared in `--help`) disable loading for one run — for app packages AND the
  host's own generated packages; MJ core's classes still load from the manifest. The `mj` prerun hook
  publishes its process id through `MJ_DYNAMIC_PACKAGES_PROCESS` so the nested `ai-cli` /
  `testing-cli` bootstraps apply the same scoping and policy. A package already loaded in the process
  is handed back from cache without re-running its startup export. New guide:
  `guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md`. `mj sync push` now warns, once per entity,
  when it is about to write with a `BaseEntity` because no subclass is registered.

- 8f63b57: Stop `rigs/lib/harness.ts` forwarding two symbols the framework package does not export.

  The shim re-exported `createRunQueryFixtures` and `teardownRunQueryFixtures` from
  `@memberjunction/testing-integration`. They are defined in `@memberjunction/integration-test-suite`
  (`src/checks/runquery-cache.checks.ts`) — the framework package ships content-free by design — so
  the module threw `SyntaxError: The requested module '@memberjunction/testing-integration' does not
provide an export named 'createRunQueryFixtures'` at load, taking down every rig that imports the
  shim before a single assertion ran. That is the nightly `Cross-server invalidation rig` failure,
  plus five hand-run `ps-live-*` rigs.

  Nothing consumed either symbol through the shim, and forwarding them contradicted the file's own
  stated rule ("Every symbol forwarded here is DEFINED in `@memberjunction/testing-integration`"), so
  they are removed rather than re-pointed. All 23 remaining forwarded symbols resolve against the
  package's 90 exports.

  Also removes the dangling comment in `testing-integration/src/index.ts` that still described the
  removed re-exports — that sentence is why a consumer went on importing a symbol that had moved.

- 8288711: Fix process-wide server cache corruption, and make the cache structurally unable to be
  corrupted by consumers.

  **Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
  names onto the data provider's own result rows, which the server cache holds _by reference_.
  Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
  `_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
  failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
  cache is process-wide, so a single response poisoned every subsequent request across all
  workers. Fixed by mapping onto copies.

  Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
  the API surface said "this array is shared, do not mutate," and the exposure runs in both
  directions (a cache _hit_ returns the stored array; a cache _miss_ stores the array it is about
  to return). So the cache now defends itself:
  - **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
    whether a provider hands back live references (the in-memory providers) or serialized copies
    (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
    keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
    provider that does not declare one (store a sentinel, read it back, compare identity), so a
    provider written before this contract still gets the correct protection instead of silently
    losing it to a falsy default.
  - **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
    the array itself — but only when the provider shares references. Mutations then throw a
    `TypeError` at the offending line instead of silently corrupting shared state, and cache
    **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
    funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
    slot-maintenance path that bypasses the first. The freeze lands immediately after the only
    gate that can decline a write (the synchronous oversized-entry check) and **before** the
    awaited eviction steps — callers do not always await these methods, so any yield point
    before the freeze is a window in which shared rows are handed out still mutable. Browser
    clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
    CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
    "client behavior is unchanged" holds only for the browser. The freeze decision also follows
    the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
    engine loading and swaps to Redis afterward, two providers with opposite semantics in one
    process. The deep-freeze skips **binary payloads**
    (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
    non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
    any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
  - **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
    write-through cache with the same fingerprint builder ordinary reads use, passing only
    `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
    dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
    silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
    callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
    unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
    the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
    segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
    existing cache entry is invalidated.
  - **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
    provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
    site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
    plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
    rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
    result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
    the live arrays to every engine subclass). The flag is persisted and carried forward through
    slot maintenance so a later save cannot re-freeze the slot.

  Pre-existing consumer bugs surfaced by the freeze and fixed:
  - **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
    row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
    fixed-width string — so on a cache-served row, _reading_ a `datetime` or `CHAR(n)` field threw.
    This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
    per-instance side table and never writes to the row at all. Gating the write on a once-sampled
    `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
    writes are not always awaited), so the sample could be stale by the first read and the write
    still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
    optimization for frozen rows, which the isFrozen-guard version had given up.
  - **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
    straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
    `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
    over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
    (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
    it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
    `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
  - **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
    `CachedRunViewResult` as four inline structural types, which had already caused one silent
    field drop; they now share the canonical type.
  - **The singular server RunView path silently dropped a `PostRunView` hook's returned
    replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
    reference), while the client and batch paths honored it. The freeze un-masked this: with
    in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
    that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
    it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
    so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
    `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
    modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
    or return a new result — never mutate rows in place.
  - **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
    OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
    `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
    to apply it once at write time for a reader who has not arrived yet. Three of the four server
    paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
    the all-cached batch returned early, so masking depended on whether a _sibling_ view in the same
    batch happened to miss. This looked correct before only by accident: the cache write precedes
    the hooks, so an in-place masking hook wrote through into the cached rows — which both made
    later hits appear masked and baked one user's masking decision into a shared slot. Both hit
    paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
    caller and can never write back into the cache. The zero-hook path (the default — no shipped
    middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
    the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
    `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
    before awaiting the chain.

  The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
  freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
  without adding protection. **This release contains no breaking changes** — every public signature
  it touches is additive or unchanged.

  Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
  `RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
  `rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
  `ResultType: 'entity_object'` results are unaffected (both get per-caller objects).

- 8d0d45a: build: declare dependencies that npm's hoisting was silently supplying, as part of the monorepo's cutover to pnpm.

  Under npm, a package could import a module it never declared and still resolve it, because npm flattens everything into the workspace-root `node_modules`. pnpm's strict, isolated linking gives a package only what it declares — so each of these was a latent bug that happened to work. They are fixed here independently of the package manager; nothing about the published API changes.

  Added declarations: `@types/mssql` (codegen-lib, sqlserver-dataprovider, testing-cli, testing-integration, react-test-harness), `@types/pg` (codegen-lib), `@types/express` (messaging-adapters, server-extensions-core), `@types/fs-extra` (codegen-lib), `@types/babel__traverse` (react-linter), `ora` (ai-cli), `glob` (react-test-harness), `tslib` (ng-bootstrap, which compiles with `importHelpers`), `@auth0/auth0-spa-js` (ng-auth-services), `@memberjunction/core-entities` + `@memberjunction/global` + `@memberjunction/aiengine` (cli), and `@memberjunction/ng-react` (ng-explorer-core, reached from a generated file).

  Two changes are more than a declaration:
  - **`@memberjunction/server`**: `@types/express` moves `^4.17.25` → `^5.0.6`. The package declares `express@^5.2.1` at runtime, so it was only compiling because hoisting supplied the v5 types that six sibling packages declare. The types now match the express it actually runs.
  - **`@memberjunction/ng-auth-services`**: `angularProviderFactory` gains an explicit `Provider[]` return type. Declaring `@auth0/auth0-spa-js` alone does not resolve TS2742 — the emitted declaration file still needed a nameable type rather than one inferred through a transitive package path.

  (A third change in this set applied to `@memberjunction/scheduled-actions-server` — dropping `@types/axios`, a deprecated stub carrying no type definitions. That package has since been removed from the workspace, so its entry is no longer part of this changeset.)

- d8adda1: **BREAKING — `UserCache` moved packages. Update the import, not just the call.**

  `UserCache` now lives in `@memberjunction/generic-database-provider`. It is no longer exported
  from `@memberjunction/sqlserver-dataprovider`, and there is deliberately **no re-export shim**,
  so every import of the symbol must be repointed or it will fail to resolve:

  ```diff
  - import { UserCache } from '@memberjunction/sqlserver-dataprovider';
  + import { UserCache } from '@memberjunction/generic-database-provider';
  ```

  `Refresh` is now dialect-neutral and takes the configured provider rather than an
  `mssql.ConnectionPool`:

  ```diff
  - await UserCache.Instance.Refresh(pool, intervalMs);
  + await UserCache.Instance.Refresh(provider, intervalMs);
  ```

  **These are two separate breaks, and the first is much wider than the second.** The import path
  affects _every_ consumer of the symbol — reads included. The signature affects only the handful
  of callers of `Refresh`. Anything that imports `UserCache` merely to call `Users`,
  `GetSystemUser()` or `UserByName()` still has to change its import, so a consumer who reads only
  "the signature changed" will treat this as a no-op and fail to build. In this repo the split was
  56 files versus 9 call sites.

  Packages that import `UserCache` must also declare `@memberjunction/generic-database-provider`
  as a dependency — pnpm resolves strictly, so an undeclared import fails rather than falling
  through to a hoisted copy.

  **Check for dynamic imports too**, not just static ones. `await import('@memberjunction/sqlserver-dataprovider')`
  destructuring `UserCache` breaks the same way, and a grep for `import { … } from` will not find it.

  **Unchanged:** the read surface (`Users`, `GetSystemUser`, `UserByName`, `SYSTEM_USER_ID`), and
  the class name. The name is load-bearing — `BaseSingleton` keys its global store on the
  constructor name, so keeping it `UserCache` preserves singleton identity across the move.

  **Also fixed:** `_users` now initializes to `[]`. It previously stayed `undefined` after a
  `Refresh` that never ran or that failed (failures are swallowed into `LogError`), so
  `GetSystemUser()` threw a `TypeError` off `.find()` instead of returning `undefined` as its
  callers already assume.

  **Why:** the cache was dialect-neutral except for that one `mssql` type, which left PostgreSQL
  with no user cache at all and produced four separate hand-rolled "read `vwUsers` + `vwUserRoles`,
  build `UserInfo[]`" implementations — one of which reached into the singleton's private field
  through a cast from another package. Those are all removed, and a PostgreSQL process that never
  goes through the server bootstrap now has a system user.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [489aecd]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [41b0d28]
- Updated dependencies [fd0a019]
- Updated dependencies [e2ad3c0]
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
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [8ec1515]
- Updated dependencies [eb962a1]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [e68d90d]
- Updated dependencies [8288711]
- Updated dependencies [6cbed1d]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [44fca09]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [8d0d45a]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [8b78695]
- Updated dependencies [cdd25c0]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [512bb53]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [cda0187]
- Updated dependencies [f2f1491]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [ac96bb6]
- Updated dependencies [f5ec13b]
- Updated dependencies [d8adda1]
- Updated dependencies [88f8898]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [6cd337d]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/server-bootstrap-lite@6.1.0
  - @memberjunction/sqlserver-dataprovider@6.1.0
  - @memberjunction/generic-database-provider@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/testing-engine@6.1.0
  - @memberjunction/dynamic-packages@6.1.0
  - @memberjunction/testing-engine-base@6.1.0

## 6.1.0-edge.7

### Patch Changes

- 8f63b57: Stop `rigs/lib/harness.ts` forwarding two symbols the framework package does not export.

  The shim re-exported `createRunQueryFixtures` and `teardownRunQueryFixtures` from
  `@memberjunction/testing-integration`. They are defined in `@memberjunction/integration-test-suite`
  (`src/checks/runquery-cache.checks.ts`) — the framework package ships content-free by design — so
  the module threw `SyntaxError: The requested module '@memberjunction/testing-integration' does not
provide an export named 'createRunQueryFixtures'` at load, taking down every rig that imports the
  shim before a single assertion ran. That is the nightly `Cross-server invalidation rig` failure,
  plus five hand-run `ps-live-*` rigs.

  Nothing consumed either symbol through the shim, and forwarding them contradicted the file's own
  stated rule ("Every symbol forwarded here is DEFINED in `@memberjunction/testing-integration`"), so
  they are removed rather than re-pointed. All 23 remaining forwarded symbols resolve against the
  package's 90 exports.

  Also removes the dangling comment in `testing-integration/src/index.ts` that still described the
  removed re-exports — that sentence is why a consumer went on importing a symbol that had moved.

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [44fca09]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [88f8898]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/generic-database-provider@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/testing-engine@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.7
  - @memberjunction/testing-engine-base@6.1.0-edge.7
  - @memberjunction/dynamic-packages@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 41b0d28: Load Open App server packages in every MJ process, not only MJAPI (#4199).

  `mj sync push` (and `mj app …`, `mj test`, the MCP/A2A servers, the integration-test bootstrap)
  never imported an installed app's server package, so `Metadata.GetEntityObject` handed back a
  generic `BaseEntity` for the app's entities and every custom `Save()`, validation rule and
  lifecycle hook was silently skipped — while MJ core's own server subclasses, loaded through the
  lite manifest, did run. New `@memberjunction/dynamic-packages` extracts the loader (and the
  host-anchored import) out of `server-bootstrap` into a package with no MJ runtime dependencies,
  and each host is now one `LoadDynamicPackages({ processId })` call. ServerBootstrap consumes it
  with two deliberate behaviour changes: it no longer attempts to import the Angular forms package
  into Node, and when an `mj-app.json` sits beside its `mj.config.cjs` (an Open App repo running its
  own dev host) it now loads that app's server packages and resolver paths too.

  `dynamicPackages.server[]` stays the single list `mj app install` writes; when both it and an
  `mj-app.json` name a package, the config entry decides `Enabled` and scoping while the manifest's
  on-disk location remains the resolution fallback. Entries gain optional
  `Processes` / `ExcludeProcesses` (process IDs or prefixes: `cli`, `cli:sync`, `cli:sync:push`,
  `mjapi`, `mcp`, …) and the section gains an optional `policy` map, so a package can be scoped to
  just `mj sync` or switched off for `mj migrate`. `MJ_DYNAMIC_PACKAGES=none` and the global CLI
  flag `--no-app-packages` (declared in `--help`) disable loading for one run — for app packages AND the
  host's own generated packages; MJ core's classes still load from the manifest. The `mj` prerun hook
  publishes its process id through `MJ_DYNAMIC_PACKAGES_PROCESS` so the nested `ai-cli` /
  `testing-cli` bootstraps apply the same scoping and policy. A package already loaded in the process
  is handed back from cache without re-running its startup export. New guide:
  `guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md`. `mj sync push` now warns, once per entity,
  when it is about to write with a `BaseEntity` because no subclass is registered.

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [489aecd]
- Updated dependencies [41b0d28]
- Updated dependencies [fd0a019]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [eb962a1]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [cdd25c0]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [512bb53]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [cda0187]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [ac96bb6]
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.6
  - @memberjunction/generic-database-provider@6.1.0-edge.6
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.6
  - @memberjunction/dynamic-packages@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/testing-engine@6.1.0-edge.6
  - @memberjunction/testing-engine-base@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [8b78695]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/generic-database-provider@6.1.0-edge.5
  - @memberjunction/testing-engine@6.1.0-edge.5
  - @memberjunction/testing-engine-base@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [6cbed1d]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.4
  - @memberjunction/testing-engine@6.1.0-edge.4
  - @memberjunction/generic-database-provider@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/testing-engine-base@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- f5ec13b: Fix the queue engine's terminal-status write, and stop MJAPI's task-graph dispatcher from competing with a test harness.

  **`QueueBase` could never record a task outcome.** `StartTask` discarded the boolean `Save()` return, so the terminal-status write failed silently: the row kept whatever status it held before the run while the in-memory task still reported `Complete`. Underneath it, no role held `CanUpdate` on `MJ: Queue Tasks` or `MJ: Queues`, so CodeGen had never emitted an update grant and `spUpdateQueueTask` carried no `EXECUTE` grant at all. The Developer + Integration CRUD grants are now in `metadata/entity-permissions`, matching every other engine-written entity (`MJ: Tasks`, `MJ: Scheduled Jobs`, `MJ: Action Execution Logs`), with a migration that applies the SQL grants directly — a fresh install runs `migrate` + `sync push` and no CodeGen, so metadata alone would leave the permission correct in Explorer and broken at runtime.

  **`MJ_DISABLE_TASK_GRAPH_DISPATCHER` opts a server out of claiming.** A dispatcher claims from the whole `Task` table rather than from "its own" graphs, so a second dispatcher on the same database is a competitor — correct in production, and wrong for a harness that injects a stub runner and then asserts which tasks its own runner executed. Tasks MJAPI won were executed with the real agent runner and never reached the stub, which the harness read as "never ran". Immediately-eligible root tasks lose that race most often, so it presented as an intermittent failure.

  Also in the integration suite: the RLS fixture now carries the clauses discovery compared (a client-transport check cannot re-derive them and was reporting a cache leak that did not exist), the auth-validation fixtures supply every shipped provider's required config fields, the cache-gauntlet anti-vacuity floors are created rather than assumed, and the task-graph checks wait for the child read-back instead of silently undercounting.

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
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
- Updated dependencies [e68d90d]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [f5ec13b]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/generic-database-provider@6.1.0-edge.3
  - @memberjunction/testing-engine@6.1.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.3
  - @memberjunction/testing-engine-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 8288711: Fix process-wide server cache corruption, and make the cache structurally unable to be
  corrupted by consumers.

  **Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
  names onto the data provider's own result rows, which the server cache holds _by reference_.
  Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
  `_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
  failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
  cache is process-wide, so a single response poisoned every subsequent request across all
  workers. Fixed by mapping onto copies.

  Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
  the API surface said "this array is shared, do not mutate," and the exposure runs in both
  directions (a cache _hit_ returns the stored array; a cache _miss_ stores the array it is about
  to return). So the cache now defends itself:
  - **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
    whether a provider hands back live references (the in-memory providers) or serialized copies
    (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
    keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
    provider that does not declare one (store a sentinel, read it back, compare identity), so a
    provider written before this contract still gets the correct protection instead of silently
    losing it to a falsy default.
  - **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
    the array itself — but only when the provider shares references. Mutations then throw a
    `TypeError` at the offending line instead of silently corrupting shared state, and cache
    **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
    funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
    slot-maintenance path that bypasses the first. The freeze lands immediately after the only
    gate that can decline a write (the synchronous oversized-entry check) and **before** the
    awaited eviction steps — callers do not always await these methods, so any yield point
    before the freeze is a window in which shared rows are handed out still mutable. Browser
    clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
    CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
    "client behavior is unchanged" holds only for the browser. The freeze decision also follows
    the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
    engine loading and swaps to Redis afterward, two providers with opposite semantics in one
    process. The deep-freeze skips **binary payloads**
    (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
    non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
    any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
  - **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
    write-through cache with the same fingerprint builder ordinary reads use, passing only
    `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
    dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
    silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
    callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
    unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
    the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
    segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
    existing cache entry is invalidated.
  - **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
    provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
    site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
    plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
    rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
    result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
    the live arrays to every engine subclass). The flag is persisted and carried forward through
    slot maintenance so a later save cannot re-freeze the slot.

  Pre-existing consumer bugs surfaced by the freeze and fixed:
  - **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
    row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
    fixed-width string — so on a cache-served row, _reading_ a `datetime` or `CHAR(n)` field threw.
    This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
    per-instance side table and never writes to the row at all. Gating the write on a once-sampled
    `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
    writes are not always awaited), so the sample could be stale by the first read and the write
    still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
    optimization for frozen rows, which the isFrozen-guard version had given up.
  - **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
    straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
    `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
    over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
    (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
    it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
    `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
  - **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
    `CachedRunViewResult` as four inline structural types, which had already caused one silent
    field drop; they now share the canonical type.
  - **The singular server RunView path silently dropped a `PostRunView` hook's returned
    replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
    reference), while the client and batch paths honored it. The freeze un-masked this: with
    in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
    that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
    it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
    so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
    `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
    modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
    or return a new result — never mutate rows in place.
  - **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
    OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
    `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
    to apply it once at write time for a reader who has not arrived yet. Three of the four server
    paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
    the all-cached batch returned early, so masking depended on whether a _sibling_ view in the same
    batch happened to miss. This looked correct before only by accident: the cache write precedes
    the hooks, so an in-place masking hook wrote through into the cached rows — which both made
    later hits appear masked and baked one user's masking decision into a shared slot. Both hit
    paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
    caller and can never write back into the cache. The zero-hook path (the default — no shipped
    middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
    the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
    `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
    before awaiting the chain.

  The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
  freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
  without adding protection. **This release contains no breaking changes** — every public signature
  it touches is additive or unchanged.

  Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
  `RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
  `rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
  `ResultType: 'entity_object'` results are unaffected (both get per-caller objects).

- d8adda1: **BREAKING — `UserCache` moved packages. Update the import, not just the call.**

  `UserCache` now lives in `@memberjunction/generic-database-provider`. It is no longer exported
  from `@memberjunction/sqlserver-dataprovider`, and there is deliberately **no re-export shim**,
  so every import of the symbol must be repointed or it will fail to resolve:

  ```diff
  - import { UserCache } from '@memberjunction/sqlserver-dataprovider';
  + import { UserCache } from '@memberjunction/generic-database-provider';
  ```

  `Refresh` is now dialect-neutral and takes the configured provider rather than an
  `mssql.ConnectionPool`:

  ```diff
  - await UserCache.Instance.Refresh(pool, intervalMs);
  + await UserCache.Instance.Refresh(provider, intervalMs);
  ```

  **These are two separate breaks, and the first is much wider than the second.** The import path
  affects _every_ consumer of the symbol — reads included. The signature affects only the handful
  of callers of `Refresh`. Anything that imports `UserCache` merely to call `Users`,
  `GetSystemUser()` or `UserByName()` still has to change its import, so a consumer who reads only
  "the signature changed" will treat this as a no-op and fail to build. In this repo the split was
  56 files versus 9 call sites.

  Packages that import `UserCache` must also declare `@memberjunction/generic-database-provider`
  as a dependency — pnpm resolves strictly, so an undeclared import fails rather than falling
  through to a hoisted copy.

  **Check for dynamic imports too**, not just static ones. `await import('@memberjunction/sqlserver-dataprovider')`
  destructuring `UserCache` breaks the same way, and a grep for `import { … } from` will not find it.

  **Unchanged:** the read surface (`Users`, `GetSystemUser`, `UserByName`, `SYSTEM_USER_ID`), and
  the class name. The name is load-bearing — `BaseSingleton` keys its global store on the
  constructor name, so keeping it `UserCache` preserves singleton identity across the move.

  **Also fixed:** `_users` now initializes to `[]`. It previously stayed `undefined` after a
  `Refresh` that never ran or that failed (failures are swallowed into `LogError`), so
  `GetSystemUser()` threw a `TypeError` off `.find()` instead of returning `undefined` as its
  callers already assume.

  **Why:** the cache was dialect-neutral except for that one `mssql` type, which left PostgreSQL
  with no user cache at all and produced four separate hand-rolled "read `vwUsers` + `vwUserRoles`,
  build `UserInfo[]`" implementations — one of which reached into the singleton's private field
  through a cast from another package. Those are all removed, and a PostgreSQL process that never
  goes through the server bootstrap now has a system user.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/generic-database-provider@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.2
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.2
  - @memberjunction/testing-engine@6.1.0-edge.2
  - @memberjunction/testing-engine-base@6.1.0-edge.2

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
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/testing-engine@6.1.0-edge.1
  - @memberjunction/testing-engine-base@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- 8d0d45a: build: declare dependencies that npm's hoisting was silently supplying, as part of the monorepo's cutover to pnpm.

  Under npm, a package could import a module it never declared and still resolve it, because npm flattens everything into the workspace-root `node_modules`. pnpm's strict, isolated linking gives a package only what it declares — so each of these was a latent bug that happened to work. They are fixed here independently of the package manager; nothing about the published API changes.

  Added declarations: `@types/mssql` (codegen-lib, sqlserver-dataprovider, testing-cli, testing-integration, react-test-harness), `@types/pg` (codegen-lib), `@types/express` (messaging-adapters, server-extensions-core), `@types/fs-extra` (codegen-lib), `@types/babel__traverse` (react-linter), `ora` (ai-cli), `glob` (react-test-harness), `tslib` (ng-bootstrap, which compiles with `importHelpers`), `@auth0/auth0-spa-js` (ng-auth-services), `@memberjunction/core-entities` + `@memberjunction/global` + `@memberjunction/aiengine` (cli), and `@memberjunction/ng-react` (ng-explorer-core, reached from a generated file).

  Two changes are more than a declaration:
  - **`@memberjunction/server`**: `@types/express` moves `^4.17.25` → `^5.0.6`. The package declares `express@^5.2.1` at runtime, so it was only compiling because hoisting supplied the v5 types that six sibling packages declare. The types now match the express it actually runs.
  - **`@memberjunction/ng-auth-services`**: `angularProviderFactory` gains an explicit `Provider[]` return type. Declaring `@auth0/auth0-spa-js` alone does not resolve TS2742 — the emitted declaration file still needed a nameable type rather than one inferred through a transitive package path.
  - **`@memberjunction/scheduled-actions-server`**: drops `@types/axios`, a deprecated stub package that carries no type definitions; its presence made TypeScript auto-include it and then fail to find any types. axios ships its own.

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
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.0
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/testing-engine@6.1.0-edge.0
  - @memberjunction/testing-engine-base@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/server-bootstrap-lite@6.0.0
  - @memberjunction/testing-engine@6.0.0
  - @memberjunction/testing-engine-base@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/server-bootstrap-lite@5.51.0
  - @memberjunction/testing-engine@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/testing-engine-base@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- fab223d: fix(testing): fail loudly when a server-transport integration bundle resolves a rebound client provider, and make the ai-verify persistence poll truthful + tunable (#3251)
  - `IntegrationTestDriver` now aborts a `server`-transport bundle with a clear, harness-attributed `Error` if the resolved provider is not a Database provider (i.e. a client-transport bundle rebound the process-global provider earlier in the process), instead of silently running the bundle over the wire. This enforces the previously prose-only suite-ordering invariant.
  - `ai-verify.ts`'s `fetchById` bounded poll no longer asserts "fire-and-forget write never landed" (which claimed data loss that did not occur); it states the actual bound it waited and names the new `MJ_IT_FETCH_POLL_MS` env knob (default 12000ms) so loaded boxes can widen the window.

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
  - @memberjunction/server-bootstrap-lite@5.50.0
  - @memberjunction/testing-engine@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/testing-engine-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 4c441dd: Close out every open cache-audit defect (B39–B44) plus the reachable differential throw found in adversarial round 3.
  - **B40** — `CacheLocal` + `Aggregates` returned no aggregates at all, even on a cold miss. Three independent drops in one pipe: the client's cache-check input map omitted `Aggregates` from the request, the resolver's coreParams map omitted them again, and the engine's `stale` reply dropped the computed results. All three now forward; the client parses values back to native types. `client-cache` is 13/13 and now registered in the deterministic gate.
  - **B39** — a `ViewID`-only `RunView` failed for _every_ caller (including the view's owner): the internal `MJ: User Views` lookup ran without a context user, and a miss fell through to `undefined` ("Entity undefined not found in metadata"). The user is now threaded through `EntityStatusCheck` → `GetEntityNameFromRunViewParams`, and a genuine miss throws an error naming the view and the cause.
  - **B41** — the differential-merge decline path now performs a **real full fetch** (CacheLocal stripped + BypassCache, so re-entry into the smart-cache transport is structurally impossible) instead of throwing away the caller's whole batch; with that fallback in place, the `hasNarrowingSegment` guard is restored on `ApplyDifferentialUpdate`.
  - **B42** — `OrderBy` (fingerprint segment [2]) joins the maintenance classifier: an in-place upsert appends out of order, so ordered slots invalidate on save (delete still removes in place — removal preserves relative order).
  - **B43** — the RunQuery TTL cache-hit now checks `UserCanRun` before serving; the fingerprint carries no user segment, so user A's warmed slot was served to user B with no permission check. Deny or unresolvable metadata falls through to normal, authorized execution.
  - **B44** — an every-field `Fields` list (the `entity_object` widening) now normalizes to `f:*` in the client fingerprint **only**, restoring in-place maintenance for the client's most common slot shape without touching what is fetched.

  Also: the round-3 finding that the "unreachable" differential throw was in fact reachable (aggregate slots and defensive `MaxRows` caps both failed live) is fixed at the server seam — `RunViewsWithCacheCheck` no longer offers a differential for subset/aggregate-shaped params, falling back to the same full-refresh path its own validation already uses.

- 0e52ff6: Add the `cache-gauntlet` integration bundle (CG1–CG6) — live coverage of the subset-slot × mutation cell that shipped two production cache bugs.

  An audit of the 61 existing cache checks found the exact bug class had **no live coverage**: `S16` tests that `MaxRows` _fingerprints_ separately (slot identity), `S17` tests that a _filtered_ slot invalidates on save, and `S23` tests that an _unfiltered_ slot upserts in place — but nothing ever saved into a **subset** slot. Both #3195 (`totalRowCount` collapse) and #3199 (rows maintained in place) lived in that gap.

  The bundle also pins the per-operation asymmetry that made #3199's delete half a _separate_ bug: filtered-DELETE is legitimately maintained in place (a deleted row matches no predicate), while subset-DELETE is not (removal shrinks the slot below the caller's limit). CG3 guards the legitimate half so a future over-correction doesn't needlessly invalidate it.

  Verified to actually catch the regression: with `isSubsetFingerprint` neutered, CG1/CG2/CG4/CG5 go red while CG3 correctly stays green — the checks discriminate rather than firing indiscriminately.

  Two adjacent gaps were investigated and are documented rather than silently left:
  - **Cross-server invalidation is already covered** by the existing `cross-server-invalidation-tests.ts` rig (XS1/XS2), but it has **no subset-slot coverage** and is **not registered in `run-all.ts`**, so it can rot unnoticed.
  - **Schema-drift staleness is now covered by CG6 — and it found a real defect (B38).** In-place maintenance (`UpsertSingleEntity`/`RemoveSingleEntity` → `storeCachedResults`) carries `totalRowCount` forward but **not `schemaHash`**, so a single save strips the hash; `isSchemaStaleCacheEntry` short-circuits on a missing hash and never fires for that slot again. Reproduced directly: cold read → `1bd8ea31`, after one SAVE → `NONE`. Schema-drift protection therefore only covers slots never written to. This is the same class of omission as #3195, which fixed `totalRowCount` on this exact write path. **CG6 is intentionally RED** pending the fix.

- 1e5b9b2: Fix a structural defect in RunView cache maintenance classification, plus the two holes it caused.

  Three shipped bugs (#3195 `totalRowCount`, #3199 rows, B38 `schemaHash`) were all symptoms of one root cause: `isFilteredFingerprint` inspected **only** fingerprint segment `[1]`, so segments appended later were silently classified as "safe to maintain in place":
  - **H1** — a saved view's `WhereClause` lives on the VIEW, not in `params.ExtraFilter`, so the filter segment stays `_`. Its slot was upserted in place on save and served rows the view's own `WhereClause` excludes. Views are how users are shown a restricted row set, so this reads as a data/permission leak.
  - **H3** — the per-user RLS predicate is appended as `rls:<hash>` after the filter segment is built. Same misclassification: a save by user A was upserted into user B's RLS-scoped slot, injecting a row B's predicate excludes. An RLS bypass.

  `hasNarrowingSegment()` replaces the segment-`[1]` check with a **deny-by-default allowlist**: only `imr:` (which widens the set) and the connection suffix are treated as safe; everything else, _including unknown future segments_, is treated as narrowing. A new segment can now cost a cache refill, but can never silently serve wrong rows.

  **H2** — aggregates were dropped by in-place maintenance, so a caller that asked for `COUNT(*)` got `Success: true` with no aggregate. The first fix attempt _carried the cached aggregate forward_ and was worse: it served `rows=7` alongside `COUNT(*)=6`. A caller can detect a missing aggregate; it cannot detect a stale one. Aggregate-bearing slots (`aggHash` segment) are now invalidated on **either** mutation, since the value is not derivable in JS. The delete branch previously bypassed classification entirely and now consults it.

  **H4/H5** — `ApplyDifferentialUpdate` refuses to merge into subset, narrowing, or aggregate slots, invalidating instead. It recomputed `schemaHash` (stamping today's schema onto rows fetched under the old one, masking drift) and still shrank subset slots — the third instance of #3199, previously unpinned by any test.

  **H6** — `cross-server-invalidation-tests.ts` documented that run-all included it behind `RUN_CROSS_SERVER=1`; that inclusion never existed, so it had never run in the gate. Now registered behind its documented gate.

  New `cache-gauntlet` checks CG7 (view slot) and CG8 (aggregate consistency) pin H1 and H2 live; the unit slot-maintenance matrix gains view/aggregate rows plus deny-by-default property tests.

- 3d0255b: Add server-free `./registry` and `./checks/*` subpath exports so client-first integration dispatchers stop loading server packages through the root barrel.

  The barrel re-exports `./bootstrap` (server) plus every check module, so a client dispatcher reaching for `TestRunner`/`IntegrationCheckRegistry` transitively loaded `@memberjunction/core-entities-server` — and the ClassFactory then resolved entities to their SERVER subclasses (`MJTagScopeEntityServer`) instead of the client classes a browser loads. That silently defeated the point of client-first testing.

  `./registry` exports only verified server-free primitives (runner, registry, check types, tiers, config — `check.ts`'s every import is `import type` and therefore erased). Client dispatchers pair it with `./client` plus a direct side-effect import of their own bundle via `./checks/*`, so only the intended checks register.

  Verified: `MJ: Tag Scopes` now resolves to `MJTagScopeEntity` (was `MJTagScopeEntityServer`), and the registry contains only the dispatcher's own bundle.

- 243523e: Make the client integration bootstrap browser-faithful. Split the bootstrap into a server-free shared core (`bootstrap-shared`), a server-free client bootstrap (`bootstrap-client`, exported via a new `./client` subpath), and the server bootstrap (`bootstrap`). Client dispatchers importing `bootstrapIntegrationClient` from `@memberjunction/testing-integration/client` now register only the CLIENT generated entity subclasses (via `@memberjunction/core-entities`, exactly like MJExplorer) and never load `@memberjunction/server-bootstrap-lite` / `@memberjunction/sqlserver-dataprovider`. Previously any client import transitively pulled in server-only `*EntityServer` subclasses whose constructors throw on a client provider, making a "client" integration test a server/client hybrid rather than a faithful browser client. The barrel still re-exports everything for the driver / server dispatchers, so existing consumers are unaffected.
- 88d707b: Headless clients can now run AI agents over the GraphQL wire.
  - **`graphql-dataprovider`** — `GraphQLAIClient.RunAIAgent` forced `fireAndForget = true` for every caller, and `FireAndForgetHelper.subscribeToPubSub` called `dataProvider.PushStatusUpdates` — a browser/Angular-only channel. Any provider lacking it (a headless integration client, Node/MCP consumer) crashed with `PushStatusUpdates is not a function`. The helper now feature-detects the channel at its single choke point: when `PushStatusUpdates` is absent it delegates to the resolver's already-existing **synchronous** mode (re-send with `fireAndForget: false`, await the inline sanitized result via a new optional `extractSyncResult` seam). The browser/full-provider path is byte-for-byte unchanged — WebSocket completion + idle-stall reconcile, needed for Azure's ~230s proxy timeout — so only providers without the channel take the synchronous branch. `graphQLAIClient` wires both `RunAIAgent` and `RunAIAgentFromConversationDetail` to the seam. Known follow-up: `conversationId` is still not a wire mutation arg (the resolver passes `undefined`); `conversationDetailId` works.
  - **`testing-integration`** — `ai-verify.fetchById` now bounded-polls (fire-and-forget Action-Execution-Log / child-prompt-run writes can land after a run handle returns, especially under the fast server-in-process transport), `verifyAgentRun` gains a `skipActionLogs` option, and `WireRunOptions` threads `conversationId`.

- 1a15bd2: Add the **"Integration Test" `TestType`** — a headless, metadata-driven integration tier that runs the real MJ provider stack (live SQL Server / GraphQL, real cache managers + engines, real entity saves; no browser, no mocks) inside the Testing Framework, focused first on cache-integrity. The standalone `tsx` cache suites in `packages/MJServer/integration-test-scripts/` are graduated into first-class check bundles on one shared registry, so the same definitions run identically via the `npm run test:integration` aggregator **and** via `mj test` / `TestRun` (the `IntegrationTestDriver`) — a single source of truth.

  **New package `@memberjunction/testing-integration`.** Dedicated-process bootstrap that installs an instrumented `LocalCacheManager` as the first caller (`bootstrapIntegrationServer` / `bootstrapIntegrationClient` / `installInstrumentedCacheFirst`, gated by `MJ_INTEGRATION_TEST=1`); the `IntegrationCheckRegistry` + `NamedCheck` contract; the `InstrumentedLocalStorageProvider` / `UniqueFilter` / `TestRunner` / `ai-verify` proof primitives; and the `IntegrationTestDriver` (`@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')`), which dispatches a Test's configured bundles against one bootstrapped context and maps each check to an `OracleResult`. `@memberjunction/testing-cli`'s run/suite commands install the instrumented cache first under `MJ_INTEGRATION_TEST=1` (byte-for-byte unchanged otherwise); the old `lib/harness.ts` becomes a thin re-export shim. The pre-built `@memberjunction/server-bootstrap` class-registration manifest is regenerated (and the package gains a `@memberjunction/testing-integration` dependency) so `IntegrationTestDriver` is registered in-process and survives tree-shaking.

  **Graduated check bundles (single source of truth).** Every standalone suite is now a thin dispatcher of a registry bundle with a metadata `Test` record (IT01–IT23) joined to an "Integration Tests" suite:
  - **Deterministic server:** `server-cache` (S1–S31), `runquery-cache`, `dataset-cache`, `aggregates-cache` (AGG1–3), `record-process`, `record-process-facade`, `scheduled-jobs`, `field-rules-bulk-update`, `remote-operations`, `ai-skills`, `api-keys`, `predictive-studio` seams, `rls-isolation` (RLS1–RLS10 — the two overlapping RLS implementations were merged into one canonical bundle), plus the final three graduated in this pass: `lists` (LS1–3, keyset pagination), `open-app-teardown` (OAT1–2, the FK-graph cascade + link-less Application cleanup — adds a `@memberjunction/open-app-engine` dependency), and `user-routines` (UR1–16, the entity servers + dispatcher end-to-end).
  - **Deterministic client** (needs a live MJAPI; skips cleanly otherwise): `remote-op-wire-progress` (the client bootstrap now derives a `ws(s)://` subscription URL from the HTTP endpoint so the RO-3 progress WebSocket actually connects — it previously passed an empty `wsurl` and threw `Invalid URL` the moment a live MJAPI was reachable, so the check could never pass), and `rls-isolation-client` (RLS7 — the client smart-cache companion to `rls-isolation`, now given its own seeded-Skip IT record instead of being a driver-only orphan).
  - **Live-model** (`RUN_AGENT_TESTS`): `prompt-runner`, `agent-runner`, `concurrent`, `remote-op-ai-authoring`.

  **tsx↔metadata sibling parity is now enforced.** The check logic lives once in a registry bundle; its two "siblings" are a `tsx` dispatcher script and a metadata `Test` record — both thin pointers. A new `sibling-parity.test.ts` drift-check (unit test) fails the build if any registered bundle is missing a dispatcher or an IT record, or if either points at a non-existent bundle (a small, reasoned `NO_TSX_DISPATCHER` allowlist covers deliberately driver/MJAPI-only bundles like `rls-isolation-client`). Backed by a new `IntegrationCheckRegistry.GetBundleNames()`; the coverage-loss guard was extended to the three new bundles. This closed the last three un-graduated `tsx` suites and the one registry-only bundle so all bundles now have both siblings.

  **Tiering & gating.** A single tier model (`tiers.ts`: `deterministic` | `mutation` | `live-model`, with `IsTierEnabled()` reading `RUN_MUTATION_TESTS` / `RUN_AGENT_TESTS`) is honored identically by the aggregator and the driver, so a flag skip-passes the same way on both paths.

  **Engine-level fixture lifecycle.** A per-bundle `BundleLifecycle` (Setup → run → Teardown in FK-safe order) plus suite-scoped `SuiteFixtureContext` (`@memberjunction/testing-engine-base`) with additive `BaseTestDriver.SetupSuite()` / `TeardownSuite()` hooks; `TestEngine.RunSuite` guarantees teardown + run-status update in a `finally` (pass / fail / thrown `Execute` / timeout), and a thrown `Execute` now resolves to a `Status='Error'` `TestRun` instead of wedging `'Running'`. Mutating suites self-clean identically on both front-ends.

  **RLS / multi-user cache isolation.** New version-controlled seed metadata — a purpose-built **"Integration Test: RLS Scoped Reader"** role (scoped read on `MJ: AI Agent Runs` via `UserID = '{{UserID}}'` and nothing else) plus three inert, login-less test accounts — so the strongest RLS checks (fingerprint divergence / server-superset no-cross-serve / live no-leak) **execute for real** instead of skipping on an admin-only DB. Accounts are `Type='User'`, no auth linkage, clearly named, safe to delete. **The test-only integration records — the IT01–IT23 Tests, the integration suite, AND these RLS principals — live in a dedicated optional sibling root `metadata-optional/integration-test/`, NOT the default-pushed `metadata/` tree**, so none of it (least of all the synthetic `IsActive` accounts) ever reaches a production DB that only syncs `metadata/`. (The inert `Integration Test` TestType definition stays in normal `metadata/test-types/` — it's just a type row, no data or security surface — and the IT records `@lookup` it by name.) Seed the optional records with `mj sync push --dir=metadata-optional/integration-test`; the RLS checks skip-as-pass (with the exact push command logged) when absent.

  **Dashboard legibility.** The custom `MJ: Test Runs` form's `getCheckResults()` now reads `ResultDetails` as the bare `OracleResult[]` the engine actually writes (fixing per-check rendering for all engine runs; mapping extracted into an Angular-free, unit-tested `test-run-checks.ts`), and the runs view binds `<mj-execution-context>` to the run's machine/CI fields. The Test Run dialog's "Execution Failed" banner no longer renders empty — a `failureMessage` getter falls back through top-level `errorMessage` → a synthesized per-test summary → the single test's message → a generic note (applies to every TestType).

  **CI / release gate.** New `run-all.ts` aggregator + root `npm run test:integration` spawn each deterministic server suite in its own process (so each owns `LocalCacheManager.Initialize` as first caller) and collapse the per-suite `0/1/2` exit codes into one. The deterministic SQL Server tier is a blocking PR gate.

  **Cross-platform & cross-server seams.** `DbConfig` gains a `Platform` field (`DB_PLATFORM` ∈ {sqlserver, postgresql}, default sqlserver) and `bootstrapIntegrationServer` dispatches accordingly (the PG path ships behind the tracked PG user-cache prerequisite; no PG CI lane yet). A `RUN_CROSS_SERVER=1` spec proves a `Save()` in one MJAPI invalidates a cached read in a second sharing one DB + Redis.

  **RunView cache-layer fixes (`@memberjunction/core`).** Four real bugs the new suites surfaced, fixed in `localCacheManager.ts` + `providerBase.ts`:
  - **SECURITY:** the cache-hit path returned _before_ the DB provider's read-permission gate, so a user lacking `CanRead` could be served rows a permitted user had warmed (an observed cross-user data leak). `PreRunView` and the `RunViews` batch now skip the cache when the user lacks read permission on the entity, falling through to the DB path's proper denial (server-cache S31).
  - **SECURITY:** closed the **ViewID-only** variant of that bypass. The S31 gate keys off the entity resolved from `params.EntityName`; a `ViewID`/`ViewName`-only request (the Explorer-standard saved-view shape) resolved no entity there, so a read-denied user could still hit a slot a permitted user warmed for the same ViewID. `ProviderBase.cacheDeniedForViewOnlyRequest` (both cache paths) now resolves `ViewEntity` synchronously and applies the `CanRead` gate, or **fails closed** for a `ViewID`/`ViewName`-only request whose entity is only known after the async view lookup the cache-hit path skips. This also closes the RLS cross-serve for view-by-ID (two differently-scoped users no longer share a ViewID slot). Pinned by `providerBase.viewOnlyCacheGate.test.ts` + integration check server-cache **S31b** (**operators: prioritize this upgrade — S31 + S31b are both data-leak fixes**).
  - **SECURITY:** a **stored view's identity** now participates in the RunView cache fingerprint (`vw:` segment). A saved view carries its own server-side `WhereClause` that is not reflected in `params.ExtraFilter`, so a filtered view and a plain unfiltered read of the same entity previously produced identical fingerprints and cross-served — the view was handed the unfiltered slot and returned rows _outside its own WhereClause_. Keyed by ViewID / ViewName / ViewEntity PK, appended only when a view identifier is present → plain entity+filter fingerprints stay byte-identical, no cache invalidation (server-cache S29).
  - **`IgnoreMaxRows`** now participates in the RunView cache fingerprint, so an `IgnoreMaxRows` request no longer collides with (and is served) the capped slot for the same entity. Appended only when true → existing fingerprints stay byte-identical, no cache invalidation (server-cache S28).
  - **`AggregateResults`** are remapped to the caller's requested order on a cache hit; the aggregate fingerprint is order-insensitive by design, so a reordered request must not inherit the warming caller's order (aggregates-cache AGG3).

  **Review-response hardening (PR #3020).** Beyond S31b above: a lifecycle bundle's `Setup` and `Teardown` now run inside ONE `try/finally` on both front-ends (driver + tsx dispatchers), and every mutating fixture publishes its handle up-front + populates it as records are created — so a mid-`Setup` crash still tears down whatever was created instead of orphaning it (`runquery-cache` aligned to the shared lifecycle pattern). A single hung check is now bounded by the remaining run budget (a per-check race) instead of running past the driver timeout forever. The integration CI gate's trigger surface was widened (`migrations/**`, the `metadata-optional/**` root, `mj.config.cjs`/`tsconfig*`/`turbo.json`) and given a `push:` backstop mirroring the unit-test gate; the non-`Active` suite-membership exclusion is now surfaced with a concise always-on log; the testing CLI fails fast when it cannot install the instrumented cache first; and the sibling-parity drift-check was extended to cover the `run-all.ts` aggregator wiring and suite-join membership. `mj sync push` now honors `MJ_MIGRATION_REQUEST_TIMEOUT` (MetadataSync's env-driven config defaults, mirroring MJCLI) so the CI metadata push gets the same cold-server request-timeout headroom as `mj migrate` — mssql's 15s default could otherwise abort the push mid-transaction under embedding-on-save + engine-load latency on a cold runner.

  One related cache gap is **deliberately deferred** and documented in-check as a self-healing skip-as-pass: cross-entity **denormalization** invalidation (server-cache S30) — renaming a parent record does not invalidate cached child rows that denormalize its name, because invalidation keys on the changed entity, not on dependent entities. Fixing it requires fanning invalidation out to dependent entities (a broad, higher-risk change), tracked separately; the check re-arms automatically once that lands.

  All changes are additive / back-compat. Verified live against `mj_integrations` via both the `tsx` scripts and the `IntegrationTestDriver` (server-cache 31/31 with `RUN_MUTATION_TESTS`, aggregates-cache 3/3, rls-isolation 9/9; MJCore unit tests 1484/1484, testing-integration 145/145, testing-engine 45/45, testing-cli 23/23); golden-equivalence (`scripts/integration-golden-diff.mjs`) enforces no coverage loss between the two front-ends.

- f1ab36f: Integration-test expansion Wave 1 — three new bundles (26 checks), all client-first where a client surface exists.

  **`app-wiring` (10 checks, client-first)** — the "every shipped app is wired correctly" contract, parameterized over ALL applications so new apps inherit it automatically. Provider↔table parity, nav-item well-formedness, exactly-one-default-tab, **globally-unique DriverClass** (the catalog's latent risk #1), unique slugs, entity/role/settings link resolution, `CanAdmin ⇒ CanAccess`, agent-reference resolution, and non-Active apps excluded from new-user fan-out. Measured 25 apps / 77 nav items / **77 distinct DriverClass values, zero collisions**.

  **`view-execution` (9 checks, client-first)** — the Viewing System data layer over the real wire: dynamic filter row-set equality (by PK set, not counts), Filter-JSON→WHERE compilation, ExtraFilter injection guard, `Fields` projection (+forced PK), OFFSET and keyset pagination completeness (no dup/gap), composite-PK keyset refusal, MaxRows/IgnoreMaxRows, and aggregates-vs-pagination.

  **`metadata-consistency` (7 checks, server transport)** — metadata↔physical-DB audit sweeping all entities: generated views and CRUD procs exist, CHECK-constraint values match `EntityFieldValue`, FK indexes present, field sequences gapless and matching base-view column order, column descriptions, and SchemaInfo coverage/casing.

  Also adds the `G5` static CI gate (`.github/scripts/check-driverclass-registrations.sh`) for DriverClass→Angular `@RegisterClass` resolution, which no server-side check can observe.

  All three ship both parity siblings (tsx dispatcher + metadata IT record joined to the deterministic suite). Every collection-iterating check asserts its collection is non-empty first, so a failed load cannot pass vacuously.

  **MC6 is a ratchet, not an absolute gate**: 270 core-schema columns predate the describe-every-column rule, so it fails only when that count _grows_. PK/FK columns are exempt per `migrations/CLAUDE.md` (correcting an initial 1003 false-positive count).

- 4a03c37: Integration-test expansion Wave 2 — two new bundles (22 checks) covering the core write-side and the permission model.

  **`entity-writes` (8 checks, client-first)** — Record-Change fidelity (exact before/after `ChangesJSON`, offenders identified by content not position), virtual-field capture on both INSERT and UPDATE, keyset `AfterKey` completeness over a real fixture set, keyset guardrail refusals each differing from a passing control by exactly one illegal ingredient, dedup-linger invalidation after save, UUID case-insensitive FK round-trip, `datetimeoffset` round-trip to the millisecond, and server-side `ValidateAsync` enforcement that survives `SkipAsyncValidation`.

  **`permission-engine` (14 checks, client-first)** — provider fan-out from the `MJ: Permission Domains` catalog (every active row ClassFactory-resolves a matching provider), normalized `PermissionAction`/`GranteeType` vocabulary conformance, catalog↔provider capability agreement, unknown-domain fails **closed**, and the **two-access-path asymmetry** for Agents and Skills (cached helper open-by-default vs unified provider closed-by-default over the same table) — where the divergence itself is the assertion, so it cannot collapse silently. Plus grant-flips-the-default-off, permission collapse ordering, and two genuinely distinct identities proving a role-less user gets neither entity CRUD nor any of 13 authorizations.

  Both bundles ship all parity siblings and register best-effort teardown for their mutation-tier checks.

  Note: `permission-engine`'s PE13 is intentionally RED — it pins a confirmed defect where a single unresolvable provider breaks `GetAllUserPermissions` for every user. It is mutation-tier, so the default CI gate stays green.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [6c910ef]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/server-bootstrap-lite@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/testing-engine@5.49.0
  - @memberjunction/testing-engine-base@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0
