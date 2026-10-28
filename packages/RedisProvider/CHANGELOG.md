# @memberjunction/redis-provider

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [0a348e2]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [39b35f1]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [2274f42]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5

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

- c87f87a: Give the dataset cache one category, so its warm-serve path works again

  Six functions on `ProviderBase` touch the dataset cache and only the warm read in
  `GetAndCacheDatasetByName` named a category (`'DatasetCache'`); the write and the other four readers
  passed none and so landed in `default`. Every storage provider isolates by category — Redis keys are
  `{prefix}:{category}:{key}`, browser localStorage `[mj]:[category]:[key]`, IndexedDB a dedicated
  object store — so the read looked in a namespace nothing wrote to and missed on every transport since
  `987a126aab` (2026-05-02). The fallback refetched and rewrote the cache, so the system was slow rather
  than wrong, which is why it went unnoticed: nothing asserted that a second call did not hit the server.

  All six now share `ProviderBase.DatasetCacheCategory`, which also makes
  `mj cache clear --category DatasetCache` honest — it previously reported a successful clear of 0 keys
  while the dataset sat in `default`. Dataset keys an older build left there are still swept by a full
  clear, so no migration is needed. Expiry is unchanged: `CacheDataset` already passed explicit TTLs,
  and a per-write TTL wins over any category setting.

  Fixing the category switches on a freshness comparison that had not run in five months, and the two
  copies of it had drifted: the warm path dereferenced `cachedDataset.Results` unguarded, so a cached
  blob without `Results` threw instead of refetching — on the metadata bootstrap path. Both paths now
  call one `DatasetRowCountsMatch`, preserving the two behaviours that matter: a status with no
  per-entity counts is judged on its timestamp alone (returning false there makes such a dataset
  permanently stale), and a missing blob with counts to compare means refetch.

  Also widens `CacheDataset`'s `itemFilters` to optional on `ProviderBase`, `Metadata` and
  `IMetadataProvider`, matching every sibling method and the implementation's own handling of a falsy
  value, and adds integration check `dataset-cache.DS4`, which distinguishes a warm call that was served
  from one that silently refetched — something DS1 through DS3 could not do.

- 79b3816: Follow-up to the Redis CI gate: the main test step now runs the Redis-backed suites too.

  `REDIS_URL` was set on the job but not declared on the `test` task in `turbo.json`. Turbo 2.x runs
  tasks in strict env mode, so it was stripped before vitest started and the main test step skipped
  every gated suite — only the gate step ran them for real. Declaring it also puts it in the task's
  cache key, so turbo cannot replay a result produced without Redis.

  Also: the gate script is now in the workflow's `paths:` triggers, so a PR that edits only the gate
  still runs it; `REDIS_KEY_PREFIX` is removed from the job because nothing reads it (the suites set
  their own prefix and each job has its own Redis container); and stale comments are corrected.

  No runtime behaviour changes.

- 6ec7778: Named-channel pub/sub on `RedisLocalStorageProvider` is now usable by applications that need cross-replica messaging, so they no longer have to open their own Redis connections (#4726).
  - **`PublishMessageAndWait(channel, payload)`** resolves to the number of subscribers that received the message, and rejects when pub/sub is disabled or Redis rejects the publish. `PublishMessage` stays fire-and-forget.
  - **`IsPubSubEnabled`** tells a caller whether the channel methods are live. With pub/sub off they do nothing, which was previously indistinguishable from a working subscription.
  - **Unsubscribing the last handler on a channel now unsubscribes it in Redis.** Before, the subscription stayed for the life of the process.
  - **A failed `StartListening` no longer breaks every later subscription.** The subscriber was kept after a failed start, so later calls treated it as running, and it had no message listener, so their handlers never fired. It is now closed and the next call starts a fresh one. Concurrent callers share one start-up.
  - **Async handlers** are accepted (`ChannelMessageHandler`). A rejected promise is logged and contained like a thrown error, and handler failures are logged even with `enableLogging: false`.
  - **`__pubsub__` is refused as a channel name.** A message there would be read as a cache change by every server.

- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

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

- 196160a: Survive a Redis outage: reconnect without giving up, fail fast, say so, and come back correct

  `RedisLocalStorageProvider` could not survive an outage longer than ~11 seconds, and if it could it
  would have come back with a cache it believed was valid and wasn't. Found operationally: an Azure
  Cache for Redis instance was unreachable for ~25 minutes and every server already running went
  permanently cache-blind without saying so.

  **Reconnection no longer surrenders.** `retryStrategy` returned `null` past `maxRetries` (default 10),
  and `null` tells ioredis to stop reconnecting for the life of the client — no recovery short of a
  process restart. The backoff was `times * 200`, linear despite a comment claiming otherwise, so ten
  attempts was ~11 seconds of tolerance: shorter than a Redis restart, an ElastiCache failover or a pod
  reschedule. The ceiling now sits on the delay between attempts (`maxRetryDelayMs`, default 30s) rather
  than on the attempt count, and `maxRetries` becomes an opt-in for short-lived scripts that genuinely
  should fail rather than wait.

  **Reconnecting is no longer mistaken for being correct.** Pub/sub has no replay, so a subscriber that
  was away receives nothing published during the gap — it resumes holding entries its siblings
  invalidated minutes ago. The failure is symmetric: invalidations this process published while
  disconnected never reached its siblings either. A fleet-wide epoch counter, incremented once per
  mutation and carried on every `CacheChangedEvent`, is compared on reconnect: unchanged means nothing
  was invalidated anywhere and the local cache is **kept**; advanced means everything local is dropped;
  a process that mutated while disconnected bumps the epoch so its siblings flush too; and a counter
  that cannot be read flushes, because an unestablished correctness claim should cost the expensive
  answer. Keeping the cache when nothing changed is the point — a blind flush-on-reconnect is also
  correct but discards a valid cache on every connection blip.

  **Commands fail fast instead of accumulating.** With `maxRetriesPerRequest: null` and ioredis's
  default offline queue, a multi-minute outage queued commands whose promises never settled — unbounded
  memory plus awaits that hung for the duration. Once a connection has been established and then lost,
  reads return a miss and writes no-op, both of which are correct and merely slower. Startup is
  deliberately exempt: before the first connection a brief queue is the difference between a warm cache
  and a cold one, and nothing can be stale because nothing is cached.

  **The failure is now observable.** Every lifecycle handler was gated behind `enableLogging` and logged
  via `LogStatus`, which is suppressed when `GetProductionStatus()` is true — so a dead cache client
  produced no output at all in production. Connection loss and recovery are now public events
  (`OnConnectionLost`, `OnConnectionRestored`, `OnReconciliationRequired`) so a consumer can degrade
  deliberately and report health, with error-channel logging as the production-visible fallback.

  `CacheChangedEvent` gains an optional `Epoch`. Transports that do not implement the counter omit it
  and consumers that do not care about recovery can ignore it. The post-reconnect guarantee is
  documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`.

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- e9bdb16: CI now runs RedisProvider's integration suites against a real Redis, and fails when they skip.

  Those files are gated `describe.skipIf(!REDIS_URL)`, which in CI did not report a gap — it reported
  success: every test skipped, the file passed, and the summary looked identical to a real run. The
  shared-cache behaviour they pin (index-group pruning, per-category TTL, the key lock, leases) had no
  CI coverage as a result.

  The unit shards now start a `redis:7-alpine` service with a health check and a per-run key prefix, and
  the shard that draws this package runs `.github/scripts/check-redis-suites-ran.mjs`, which re-runs the
  gated files and requires a non-zero passed count and zero skipped. The guard discovers the files by
  naming convention rather than listing them, so it neither breaks on a file that has not landed yet nor
  silently ignores one that has.

  No runtime behaviour changes.

- ea4080e: fix: an agent completion reaches the conversation even when the WebSocket dies without closing (MJ#4222)

  On an unstable connection, sending a message to an agent left the message spinning forever: status updates stopped, the elapsed timer counted up with no ceiling, and no error appeared. The agent ran fine and its answer persisted; only a refresh revealed it.

  The cause was not a missing timeout but a single point of failure. Five recovery mechanisms — graphql-ws `retryAttempts`, `GraphQLDataProvider._socketStateSubject`, Explorer's `ServerConnectivityService`, `ConversationStreaming.scheduleReconnection()` and `FireAndForgetHelper.onStreamEnd` — were all triggered by the socket `closed` event, and the failure mode is precisely "the socket never closes". They failed together. graphql-ws re-arms its keepalive only on pong receipt, so a half-open socket gets one ping and then permanent silence; its own JSDoc says nothing happens automatically if the server never responds.

  **Transport.** `getOrCreateWSClient()` now arms a pong watchdog on each ping it sends and calls `client.terminate()` if no pong returns, producing a real `4499` close that the existing retry apparatus can act on. Each client owns its own pong timer, and a close from a client that has already been replaced is ignored, so one socket can never terminate or disarm its replacement. `connectionAckWaitTimeout` is set, and `keepAlive` drops to 10s, making detection ~14s in practice instead of never. MJServer passes its `useServer` keepAlive explicitly rather than relying on an invisible library default.

  **Recovery triggers.** New `ConversationLiveness` (L0, no Angular) aggregates socket reconnect, stream re-subscribe, tab-visible and browser-online into one coalesced reconciliation request, throttled leading-edge at 500ms. `ng-conversations` adds a root-provided DOM bridge and `ReconcileNow()`, which refreshes agent runs **before** comparing status — without that the comparison reads the stale in-memory map the outage froze and silently no-ops. The reconciliation path runs over HTTP, so it repairs a message while the socket is still dead.

  **Durable read model.** New `TailConversationEvents` query over existing `AIAgentRunStep` rows — no table, no migration. The cursor never rewinds, events are capped at 200, authorization is delegated to `RunView` as the calling user through the request's read-only provider, and not-found and not-authorized are indistinguishable. Only the columns an event carries are read, never the step's input, output or payload columns. A run `Paused` on a still-running workflow reports `IsInFlight: true`, and a failed call does too, because it knows nothing about the run. `FinalPayload` falls back to the conversation detail's message because `AIAgentRun.Result` is agent-dependent and null on many successful runs; callers must decide terminality from `IsInFlight`/`DetailStatus`, never from its presence. `GraphQLConversationClient` and `ConversationTail` hold a per-message cursor that advances only on a successful read. When the tail call fails, for example a new client against an older server, the client completes a message from its run list as it did before.

  **Cross-instance delivery.** Push-status updates now carry `SourceServerId` and fan out over Redis through a generic `PublishMessage`/`SubscribeToChannel` pair on `RedisLocalStorageProvider`, closing the case where the mutation lands on one replica and the browser's socket on another. Inbound messages are type-checked, then republish onto the local topic and still pass the identity filter, so a replica never decides who sees what. Streaming deltas are deliberately not replicated. Measured: 5 push frames delivered cross-replica with Redis, 0 without — and the message still completed without it, so fan-out is a latency optimization rather than a requirement.

  **Deployment order.** A client deployed before the server gets a failed tail call on every reconcile and falls back to the run list, which cannot see the conversation detail's own status. The liveness pulse (`DEFAULT_PULSE_INTERVAL_MS`, 5 min → 60 s in MJServer) and the client's idle window (`DEFAULT_IDLE_TIMEOUT_MS`, 12 min → 3 min in GraphQLDataProvider) are a matched pair in separate packages. Ship the server first or with the client: a client on the 3-minute window against a server still pulsing every 5 minutes times out on every pulse gap. `DEFAULT_MAX_STALL_RECONCILES` stays at 6, so the give-up horizon moves from roughly 72 minutes to roughly 18.

  **Honest UI.** The message time pill degrades `live → checking → stalled`, with thresholds anchored to the agent watchdog's own 30s heartbeat and 5-minute stale threshold rather than invented values. Silence is measured from the last push frame the browser received for the run or the message, including the server's 60s liveness pulse, and from the run's database timestamps when the run was re-read. Progress frames carry the server's in-memory run, whose timestamps do not move until the run ends, so they cannot be the only signal. A row with no MJ agent run, such as one written by a host's own turn handler, stays live while frames that name it arrive. The database timestamp is bounded by how long the component has been watching, so browser-versus-database clock skew cannot invent a stall. While HTTP works, a dead socket alone does not degrade the pill: each reconcile re-reads the run and its fresh heartbeat. The connectivity banner reports the socket. The pill's one-second timer stops whenever nothing is in flight.

  A quiet pill's request for a re-check goes through the same 500ms coalescing trigger as the transport signals, and only one reconcile pass runs at a time. A request that arrives during a pass shares it and schedules one follow-up, so no request is lost and no message is completed twice.

  Also fixes three defects found by manual testing that unit tests missed, each an instance of the same pattern as the original bug — a mechanism wired to a signal the failure mode suppresses: liveness was computed only in `ngDoCheck`, which `detectChanges()` does not re-invoke; `agentRunMap` was absent from `message-list`'s `ngOnChanges`, so a refreshed heartbeat never reached the rendered bubble; and the reconnection backoff reset on every re-subscribe, which succeeds against a dead socket, pinning the delay at its base value and leaving the escalation inert. The backoff escalates to a 60s ceiling and retries for the life of the page; it has no attempt cap, because no host calls `initialize()` outside `ngOnInit`, so a stream that stopped retrying would stay stopped until a reload. Up to 20% is taken off each delay at random so tabs do not retry in lockstep, and the backoff clears when the socket reports `connected`, which follows the server's acknowledgement, so a quiet healthy stream does not start its next outage at the ceiling.

  Two further defects this surfaced, both fixed here. Explorer's connectivity warning cleared on an HTTP 200 from `/healthcheck`, before the socket was back — reachable over HTTP and able to carry frames are different properties, and a half-open socket satisfies the first while dropping every push. The warning now clears when the socket itself reports `connected`, and a `degraded` flag makes that sticky so the transient `unknown` emitted by the service's own `ForceSocketReconnect()` cannot read as recovery. The one exception is a screen with no active subscription: no socket exists there, so no `connected` can arrive, and an HTTP 200 clears the warning. A subscription opened later against a socket that is still down raises it again.

  And a new `OrphanedConversationDetailReconciler` closes conversation details left `In-Progress` by a run that is already over. `AgentRunner` closes the detail as a run's final step, so a process that dies mid-run never reaches it; the agent-run watchdog repairs the run but nothing repaired the detail, which is the row the chat renders from. It runs at boot and every five minutes, asks only for details that have a finished run so stuck rows cannot fill its 200-row window, waits a grace period so it cannot race a normal completion, skips a detail that something else closed after it was listed, and writes as the conversation's OWNER — `MJConversationDetailEntityExtended.Save()` refuses a non-owner without a resource grant, so a maintenance pass running as the system user is silently rejected, returning false with no `LatestResult` to read. Verified against five real orphaned details aged 42 to 246 minutes: all five closed, none left.

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

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

- Updated dependencies [834f8d7]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [c996a56]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [c42c0e8]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3

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

- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

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
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/global@5.39.0

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
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- 17b8087: no migration but marking as minor due to cache bump stuff added here, good practice, but we're on a minor bump anyway

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- de34786: Add `GetItems<T>(keys, category?)` batched read to `ILocalStorageProvider`. IndexedDB implementation uses a single read transaction with N parallel `get()` calls; Redis uses one `MGET` command. Used internally by `LocalCacheManager.GetRunViewResults` to batch the smart-cache-check warm-load reads (eliminating ~85 sequential per-key IDB transactions per coalesced engine bundle), the dataset-cache load (eliminating 3 redundant data-key reads per cached dataset access), and the metadata-snapshot bootstrap (3 keys → 1 batched read). Also fixes `IsDatasetCached` to probe via the tiny `_date` key instead of pulling the multi-MB dataset blob just for an existence check. No on-disk schema change; no version bump needed for the IDB schema. 28 new unit tests cover generic contract behavior, IDB single-transaction verification, and Redis MGET semantics including per-key error tolerance and deduplication.
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
