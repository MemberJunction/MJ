# Change Log - @memberjunction/templates-base-types

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

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [08b3d7b]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
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
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

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
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
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
- Updated dependencies [8ec1515]
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
- Updated dependencies [8288711]
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
- Updated dependencies [2741d46]
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
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fefca2]
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
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0

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
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
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
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

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
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

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

## 6.1.0-edge.2

### Patch Changes

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
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0

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
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
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
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
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
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0

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

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0

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
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

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

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
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

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
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
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
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
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
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

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

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
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/core-entities@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/core-entities@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/core@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/core-entities@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/core@2.61.0
- @memberjunction/core-entities@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [659f892]
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
  - @memberjunction/core@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0
- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [556ee8d]
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- 99b27c5: various updates
- Updated dependencies [fbc30dc]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/core@2.42.0
- @memberjunction/core-entities@2.42.0
- @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/core@2.40.0
- @memberjunction/core-entities@2.40.0
- @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [c9ccc36]
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [9d709e2]
  - @memberjunction/core@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/core@2.33.0
- @memberjunction/core-entities@2.33.0
- @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/core@2.31.0
- @memberjunction/core-entities@2.31.0
- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/core@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/core-entities@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/global to v1.6.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/global to v1.5.3
