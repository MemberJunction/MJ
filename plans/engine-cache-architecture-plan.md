# Engine / cache / event-bus — findings, positions and plan

**Companion to [`engine-cache-architecture.md`](./engine-cache-architecture.md) (the brief).**
Written 2026-09-16 on `next` at `c7a30c7c03` (v6.1.0). Every claim below carries a file:line
from that commit; where a claim is a hypothesis rather than a verified fact it says so.

Sections 1–5 are the investigation result (brief objectives 1–3). Section 6 is the plan to agree
on before implementation (objective 4). Section 7 is the experiment design and the baseline log
(objective 5). Section 8 lists the decisions that need a human.

---

## 1. Architecture as verified

### 1.1 Three write funnels, one wire

Every cross-process signal originates from a **cache write**, never from an entity write directly:

| Funnel | Where | Publishes? |
|---|---|---|
| RunView cache fill | `ProviderBase.PostRunViews` → `LocalCacheManager.SetRunViewResult` (`providerBase.ts:3807-3817`, `localCacheManager.ts:1942`) | on Redis: yes, full row set as `Data` |
| In-place slot maintenance after a save/delete | `LocalCacheManager.HandleBaseEntityEvent` → `UpsertSingleEntity`/`RemoveSingleEntity` → `storeCachedResults` → `SetItem(full array)` (`localCacheManager.ts:986-1044`, `2433-2594`) | yes, **full array** re-published for a one-row change |
| Provider swap at boot | `LocalCacheManager.SetStorageProvider` migrates every registry entry with `newProvider.SetItem` (`localCacheManager.ts:589-628`) | yes, one event per entry |

`RedisLocalStorageProvider.SetItem` does `SET`/`SETEX` + `SADD` into the category set, then
`publishChange(key, cat, 'set', serialized)` fire-and-forget (`RedisLocalStorageProvider.ts:471-511`,
`925-956`). `Remove` publishes `removed`; `ClearCategory` publishes `category_cleared`.

Receive side: `handlePubSubMessage` drops self-originated events by `ProcessUUID`
(`RedisLocalStorageProvider.ts:892-915`) → `OnCacheChanged` → MJServer `DispatchCacheChange`
(`MJServer/src/index.ts:682-699`) → per-fingerprint callbacks → `BaseEngine.OnExternalCacheChange`
(`baseEngine.ts:2158-2215`), which materializes the rows, replaces the property, rebuilds derived
state (`RebuildDerivedState`, serialized per engine, `:286`), and emits.

MJServer additionally re-broadcasts **every** Redis event to every connected browser as an
entity-level invalidation (`index.ts:691-699`), including cache-fill events.

### 1.2 Boot ordering — the same on MJAPI and Skip

1. `setupSQLServerClient` → `StartupManager.Startup` → `LocalCacheManager.Initialize(in-memory
   provider, **no config**)` (`RegisterForStartup.ts:504-509`) → every `@RegisterForStartup` engine
   loads with `Config(false)`. `AIEngineBase` is one of them (`BaseAIEngine.ts:162`). Each load
   writes its slots into the in-memory provider and registers a change callback per config
   (`baseEngine.ts:1764`, `2119-2145`).
2. Redis provider is constructed and installed on the data provider (`MJServer/src/index.ts:671-678`;
   Skip `apps/API/src/shared/util.ts:64,185-205`).
3. `LocalCacheManager.SetStorageProvider(redis)` migrates every in-memory entry into Redis, each
   publishing a `set` event with the full payload (`index.ts:708`; Skip `util.ts:117`).

So **every replica publishes every startup-loaded config to every peer at boot**, and every peer
materializes and rebuilds each one. That is the storm; it is the migration step, not the RunView
write path. On MJAPI with Redis this also means the startup loads themselves never read Redis —
every replica reads the database in full.

### 1.3 What is shared in the Redis keyspace (`{prefix}:{category}:{key}`)

- `RunViewCache:<fingerprint>` slots (no TTL: `pipeline.set`, `RedisLocalStorageProvider.ts:489-497`).
- `__categories__:RunViewCache` — a Set of every key ever written (`sadd` on every write, `srem`
  only on `Remove`; **expiry does not remove members**, documented at `:594-598`).
- `Metadata:__MJ_CACHE_REGISTRY__` — `LocalCacheManager`'s registry, **shared by every replica on
  the same prefix**: read at boot (`loadRegistry`, `localCacheManager.ts:3078`), overwritten
  whole by every replica's debounced `persistRegistry` (`:3105-3125`), and — because it is a
  `SetItem` — published as a pub/sub event carrying the entire registry as `Data`.
- Metadata/dataset slots keyed by `InstanceConnectionString` (`providerBase.ts:5716`).

### 1.4 Read path: no validation on a server

`runViewCacheEligible` = `!BypassCache && !AfterKey && !Materialized && ResultType !== 'count_only'
&& (CacheLocal || TrustLocalCacheCompletely) && IsServerCacheAllowedForEntity` (`providerBase.ts:1567-1576`).
`DatabaseProviderBase` sets `TrustLocalCacheCompletely = true` (`databaseProviderBase.ts:96-103`), so
`CacheLocal` is irrelevant server-side and a hit is returned with no `rowCount`/`maxUpdatedAt`
probe; the smart-cache machinery runs only for remote clients (`providerBase.ts:3115`). Confirms
the brief §2.

---

## 2. Corrections to the brief (say so explicitly — §9 working agreement)

**C1 — §7 "a Skip replica neither adopts a payload nor broadcasts one" is wrong on both halves.**
Adopts: `StartupManager` has already initialized `LocalCacheManager` and loaded `AIEngineBase`
(`Config(false)`) before Skip's explicit `Config(true)` runs, so `IsInitialized` is true and
`LoadConfigs` registers the callbacks regardless of `bypassCache` (`baseEngine.ts:1764`). Skip
adopts every peer payload — which is how the incident reached it. Broadcasts: the in-memory
entries written by that startup load are migrated to Redis at `util.ts:117` and each migration
publishes (§1.2). `Config(true)` protects Skip's AIEngine from being *seeded* from a stale Redis; it
does not stop it publishing or adopting. Skip's comment at `util.ts:105-108` ("Skip must initialize
LocalCacheManager explicitly") is stale for the same reason.

**C2 — §5 item 6 (connection string collapses to `localhost`) is already fixed on `next`.**
`eb962a16ef` (2026-09-03) reads `pool.config` instead of the private member and is pinned by
`SQLServerDataProvider/src/__tests__/instance-connection-string.test.ts`. It is in v6.1.0 and **not**
in 5.51.3 (`git merge-base --is-ancestor` → no), which Skip pins. Item 6 is a Skip upgrade item.

**C3 — §5 item 3 "no default TTL" understates it: two TTL knobs exist and both are dead.**
`RedisProviderConfig.defaultTTLSeconds` (native `SETEX`, `RedisLocalStorageProvider.ts:78-90`) is
never passed by MJServer (`index.ts:671-676`) or Skip (`util.ts:186-191`). `cacheSettings.defaultTTLSeconds`
in `mj.config.cjs` (`MJServer/src/config.ts:228`) is mapped to `defaultTTLMs` at `index.ts:718` —
inside `if (!LocalCacheManager.Instance.IsInitialized)`, which is always false by then (§1.2 step 1),
and `Initialize` returns early once initialized (`localCacheManager.ts:451-467`). **Every
`cacheSettings` value (maxMemoryMB, per-entity cap, TTL, sweep interval, verboseLogging) is a
no-op on MJAPI.** New finding, not in the brief.

**C4 — §5 item 3 "a default TTL fixes both halves" is half right.** A Redis TTL makes
`volatile-lru` able to evict, but expiry does not `srem` the category set, so `GetCategoryKeys`
(`smembers`) keeps returning dead members and the set keeps growing. TTL needs index pruning
alongside it (§5 N3).

**C5 — §6 Idea A: on a server there is no per-record path to make incremental.** A one-row save
on replica A reaches replica B as a *whole-array* `set` payload (§1.1 second funnel). An
incremental hook would need a protocol change (row-level events on the wire), not a method.

**C6 — §6 Idea C's "compare against the payload's `rowCount`/`maxUpdatedAt`" would rarely skip.**
The slot-maintenance funnel writes `maxUpdatedAt = new Date().toISOString()` at upsert time
(`localCacheManager.ts:1028`, `:1128`), not the max of the rows, so it never equals anything the
receiver holds. The cache-fill funnel does compute it from rows (`providerBase.ts:3808`,
`extractMaxUpdatedAt`). A row-level identity (see §4 Idea C) is independent of writer semantics.

**C7 — §3 "AIEngineBase declares 42 entity configs": it is 43 unconditional + 6 conditional
(`BaseAIEngine.ts:246-457`, `:488-535`) — 49 on a fully migrated schema.**

**C8 — §5 item 7's retry story is more specific than "a failed statement strands a connection".**
`isStaleConnectionError` retries once for the `not the Final state` / `not the SentClientRequest
state` family, non-transactional only (`SQLServerDataProvider.ts:99-113`, `218-228`). The ambient
transaction path is never retried by design. Still not reproduced; kept out of this plan's scope
except as a candidate for a mutation-tier check (§9).

---

## 3. New findings (beyond the brief)

**F1 — The registry is hidden cross-replica shared state and a large broadcast.** §1.3: every
replica's debounced `persistRegistry` (1 s) overwrites the same Redis key with its own view
(last-writer-wins on `lastAccessedAt`, `sizeBytes`, `expiresAt`, `maxUpdatedAt`), loads a peer's
registry at boot, and each persist publishes the whole registry over pub/sub. With the 10,158-key
production keyspace that is a multi-megabyte message per write burst per replica. *Hypothesis to
measure (E6):* this alone can trip Redis's default `client-output-buffer-limit pubsub 32mb 8mb 60`
and disconnect subscribers, silently losing invalidations (pub/sub is at-most-once).

**F2 — The routine poller is worse than a write-only key.** `UserRoutineDispatcherDriver.loadCandidateRoutines`
(`packages/Scheduling/engine/src/drivers/UserRoutineDispatcherDriver.ts:250-255`) runs every minute
(`metadata/scheduled-jobs/.user-routine-dispatcher-job.json:7`, cron `0 * * * * *`) with
`now.toISOString()` in the filter. Per minute per replica: one new permanent key, one `sadd`, one
pub/sub `set` event to every peer, and — via `index.ts:691-699` — one entity-level invalidation to
every connected browser on every server, which then fires `remote-invalidate` into
`UserRoutineEngine` and `LocalCacheManager` on each client. `MJ: User Routines` has
`AllowCaching = 1` because it is in `__mj` (`V202604131300…AllowCaching…sql:23-26` backfills the
schema; CodeGen's INSERT for the entity carries the resolved default). Confirmed on `mj_test_2`:
`userRoutinesAllowCaching = true`.

**F3 — `OnExternalCacheChange` ignores the permission-constrained state.** `RegisterCacheChangeCallbacks`
receives the full `entityConfigs` list even when `CheckPermissionsOrSkipAll` returned `[]`
(`baseEngine.ts:1756-1764`), and the handler assigns the payload without consulting
`_isPermissionConstrained`, unlike `HandleIndividualBaseEntityEvent` (`:862`). Server-side engines
load as the system user so this is theoretical there; it is an inconsistency worth one line.

**F4 — Engines that load before `LocalCacheManager.Initialize` never register callbacks and never
recover.** `RegisterCacheChangeCallbacks` returns early on `!IsInitialized` (`baseEngine.ts:2126`)
and nothing re-registers later except `Config(true)`/`RefreshAllItems`. Any process that calls an
engine before `StartupManager` (custom hosts, scripts) is a permanent non-subscriber. Cheap to make
`SetStorageProvider`/`Initialize` re-register through `BaseEngineRegistry`.

**F5 — Two engines have derived-state rebuilds that are expensive by construction.** `GeoDataEngine`
parses ~3,092 polygons synchronously in `AdditionalLoading` (`GeoDataEngine.ts:113-118`);
`DocumentationEngine` issues an HTTP GET per library item and *appends* (`DocUtils/src/Engine.ts:82-92`,
not idempotent). Neither is `@RegisterForStartup`, but any peer cache write to their configs
triggers the full cost on every replica that has loaded them. 8 of 53 engines override
`AdditionalLoading`; `AIEngineBase` is the only linear one after #4470 (survey table in the agent
report is reproduced in §A).

**F6 — `mj migrate` has no provider at all; `mj sync push` and standalone CodeGen use the
in-memory provider.** Confirmed (`MJCLI/src/commands/migrate/index.ts`; `MetadataSync/src/lib/provider-utils.ts:101-102`;
`SQLServerCodeGenProvider.ts:63-66`). Exception: CodeGen run in-process by RSU inherits MJAPI's
Redis provider (`index.ts:600-606`) and does publish. There is no cache-clear endpoint, mutation,
or CLI command anywhere (`grep RefreshCache|InvalidateCache|FlushCache` → nothing).

**F7 — `MarkConfigEmptyLoaded` and `CheckPermissionsOrSkipAll` have zero tests** (unit or
integration). Both permanent-empty paths in §5 item 1 are untested code.

**F8 — The built `dist/` in this clone predated #4470** (MJCore built 2026-09-13 02:55; the fix
landed 23:11). Exactly the §3 trap. Rebuilt with the full graph before any measurement; the
integration-test-suite build then failed on two unlinked workspace packages
(`@memberjunction/testing-engine`, `@memberjunction/unit-testing`, declared 2026-09-16) until
`pnpm install` at the root. Recorded so the next session does not repeat it.

---

## 4. Positions on the proposals

### Idea A — derived-state hook for incremental changes: **against, as a base-class change**

1. Nothing per-record reaches a server (C5); the client's per-record paths already call
   `AdditionalLoading` and cost ~2 ms after #4470.
2. Incremental derived state is the bug class this investigation was about; the full rebuild is
   correct by construction, and the seam to override already exists (`RebuildDerivedState` is
   `protected`, zero overrides today).
3. The real cost outliers are two specific engines (F5), which should fix their own
   `AdditionalLoading` (make it idempotent; cache parsed geometry by row identity) rather than
   push a new contract onto 53 subclasses.

What replaces it: Idea C in its row-identity shape removes the *redundant* rebuilds, which is where
the boot-storm cost is (R×(R−1)×C events, nearly all identical).

### Idea B — periodic reconciliation against the database: **for, scoped and sequenced third**

Scope to engine-owned fingerprints only (bounded: ≤ 49 for AI, single digits elsewhere), one probe
batch per interval via the existing `SELECT COUNT(*), MAX(__mj_UpdatedAt) … WHERE <config filter>`
shape (`GenericDatabaseProvider.ts:2998-3033`, batched on SQL Server at
`SQLServerDataProvider.ts:801-857`), single owner via a Redis `SET NX PX` lease so N replicas do not
sweep N times. The verdict must compare the probe against the **engine's live array** (count and
max `__mj_UpdatedAt` of the rows it holds), never against the registry (C6, F1). Action on stale:
`LoadSingleConfig(config, user, bypassCache=true)` → `RebuildDerivedState` → the resulting cache
write republishes and heals peers. Justification is writers that cannot be enumerated (direct SQL,
migrations, other applications); the CLI is enumerable and gets the cheaper fix first.

Known limitation to document: an update that does not bump `__mj_UpdatedAt` (raw SQL) is
invisible; same limitation the client smart-cache check already accepts.

### Idea C — skipping redundant payloads: **for, in a self-validating, row-level shape**

Identity is derived from what the property currently holds and from the payload rows, nothing is
remembered: `count` + sorted multiset hash of `(PK, __mj_UpdatedAt)` on both sides, O(n) each.
Skip the assignment, the materialization *and* the rebuild when identical; apply otherwise.
Independent of writer `maxUpdatedAt` semantics (C6), catches delete-plus-insert, cannot go stale
because there is no memory. Engines whose entity lacks `__mj_UpdatedAt` never skip. This is what
turns the boot storm from R×(R−1)×C materializations into R×(R−1)×C cheap comparisons.

Regression pins: unit test on `OnExternalCacheChange` (identical → no `HandleSingleViewResult`,
no rebuild, no emit; one changed `__mj_UpdatedAt` → full apply); extend IT84 with the same pair
against the real engine; the wire rig (`cache-payload-materialization-tests.ts`) with a replay of
the *same* captured bytes asserting no rebuild, then the marker-modified bytes asserting apply.

---

## 5. Additional levers (brainstorm beyond the brief)

**N1 — Install Redis before `StartupManager` runs.** Then the startup engine loads read Redis
first: replica 1 misses, reads the DB, writes, publishes once; replicas 2..R hit Redis and neither
read the DB nor publish. That removes both the R× database herd and the R×(R−1)×C storm at the
source, and lets `StartupManager` pass the real `cacheSettings` into `Initialize` (fixes C3).
Requires (a) constructing the Redis provider from config before the data provider and handing it
in (there is no such option on `SQLServerProviderConfigData` today — the provider lazily creates
`InMemoryLocalStorageProvider`, `GenericDatabaseProvider.ts:184-189`), and (b) **items 2 and 3 of
the brief landing first**, because a `Config(false)` boot that trusts Redis is exactly the
"stale readers become stale writers" shape in §7 of the brief. This is the highest-leverage change
here and the one most in need of measurement before and after.

**N2 — Stop sharing the registry.** Key `__MJ_CACHE_REGISTRY__` per `ProcessUUID` (or do not
persist it on a shared provider at all — its purpose is per-process eviction accounting) and stop
publishing it. Removes F1 entirely. Also stops a fresh replica adopting a peer's `expiresAt`.

**N3 — Replace the category Set with a scan, or prune it.** `resolveFingerprintsForEntity` only
needs keys with prefix `<Entity>|`; `SCAN MATCH {prefix}:RunViewCache:<Entity>|*` needs no index
and cannot leak. Alternatively keep the Set and reconcile it (`SSCAN` + `EXISTS`) on the sweep
interval. Required before any TTL is turned on (C4).

**N4 — Pollers should say so.** `UserRoutineDispatcherDriver` wants fresh rows by definition:
`BypassCache: true` on that RunView (one line), plus `AllowCaching = false` on `MJ: User Routines`
(metadata). Audit the other scheduled drivers and the task-graph dispatcher for the same shape.

**N5 — Make `cacheSettings` real.** Either N1 or, minimally, call
`LocalCacheManager.Instance.UpdateConfig(cacheConfig)` at `index.ts:711` instead of the dead
`if (!IsInitialized)` branch, and pass `defaultTTLSeconds` into `RedisLocalStorageProvider`.

**N6 — A derived-state census.** `BaseEngine.GetStateCensus(): { property, rowCount, maxUpdatedAt,
identityHash }[]` plus an overridable `GetDerivedStateCensus()` (AIEngineBase: models with vendors
attached, total vendors attached, prompts attached to categories) exposed through
`CacheStatsResolver` and usable from Skip's `assertAIEngineLoaded`. This is the instrument that
would have caught the incident (counts identical, derived census 0/0) and it is what E4
(convergence) needs; it also becomes the assertion primitive for every new check.

**N7 — Ordering guard on adoption.** With the row identity from Idea C available, refuse a payload
whose max `__mj_UpdatedAt` is *older* than the array's — the "slower replica's older snapshot"
race in brief §7 stops at the adoption layer. The slot in Redis can still be overwritten by the
older writer; a compare-and-set (`WATCH`/Lua on `maxUpdatedAt`) fixes that half. Quantify (E1/E2)
before building either.

**N8 — Decouple browser fan-out from cache writes.** `index.ts:691-699` re-broadcasts every Redis
event to browsers; the correct trigger is an *entity* write. Publish entity-level invalidations on
their own channel from the BaseEntity listener (`index.ts:903-919`) and stop re-broadcasting cache
fills. Measure first (E7).

**N9 — Bounded self-heal for permanent-empty states (brief item 1).** `MarkConfigEmptyLoaded`
should only fire when the failure *is* a permission failure (inspect `ErrorMessage`, or retry once
with `bypassCache` before classifying), and `CheckPermissionsOrSkipAll` should record a
re-check timer the way `scheduleEventRefreshRetry` does, so a transient answer cannot be
permanent. Add the missing tests (F7).

**N10 — Production-visible degradation logs (brief item 8).** Route the cache-path fallbacks
(`baseEngine.ts:2208`, the restricted-role message at `:1936`, the `[CACHE-WRITE-GATE]` skips)
through a level that survives `NODE_ENV=production` (`logging.ts:294`).

---

## 6. Proposed plan (to agree before implementation)

Ordered by confidence and dependency. Each item names its regression pin; nothing merges on
argument alone (brief §4).

### Phase 0 — Baseline (no code changes; §7)

### Phase 1 — Cheap, self-contained, high confidence
| # | Change | Pin |
|---|---|---|
| 1.1 | N4: `BypassCache: true` in the routine poller; `AllowCaching=false` on `MJ: User Routines` (+ audit) | integration check: after N polls the RunViewCache key count is unchanged |
| 1.2 | N5: apply `cacheSettings` for real; wire `defaultTTLSeconds` to Redis; N3 index pruning/scan so TTL cannot leak the index | unit: config applied; rig: keys carry a TTL and the category index does not grow after expiry |
| 1.3 | Idea C, row-identity shape (§4) | unit + IT84 pair + wire-rig replay pair |
| 1.4 | N9 + F7 tests | unit for both permanent-empty paths |
| 1.5 | N10 logging; F3 one-line guard; F4 re-register on init/swap | unit |
| 1.6 | N6 census (read-only, additive) | used by E4 and by Phase 2 checks |

### Phase 2 — Propagation correctness
| # | Change | Pin |
|---|---|---|
| 2.1 | CLI/CodeGen publish (brief item 2). Cheapest correct form: when `REDIS_URL` is configured, `mj sync push` / `mj codegen` / `mj migrate` finish by `ClearCategory('RunViewCache')` (+ `DatasetCache`, `Metadata`) through a `RedisLocalStorageProvider`, whose `category_cleared` event reaches **every** registered callback (`localCacheManager.ts:1350-1361`) and forces a DB reload on every replica. Plus an explicit `mj cache clear` for operators. Per-entity precision is a later refinement | E3 re-run: staleness window drops from ∞ to the propagation latency |
| 2.2 | N2 registry isolation | E6 re-run: registry bytes on the wire → 0 |
| 2.3 | N1 Redis-before-engines boot ordering (depends on 2.1 + 1.2) | E1 re-run: DB loads per fleet → 1 per config; events per replica → ~C not (R−1)×C |

### Phase 3 — Defence in depth (measure-gated)
| # | Change | Gate |
|---|---|---|
| 3.1 | Idea B scoped sweeper with lease | after 2.1; E3 with a raw-SQL writer must recover within the interval |
| 3.2 | N7 ordering guard | only if E1/E2 show the older-snapshot race |
| 3.3 | N8 browser fan-out decoupling | only if E7 shows meaningful client churn |

### Phase 4 — Skip
Upgrade to a release containing `eb962a16ef` and Phases 1–2; wire `assertAIEngineLoaded` to the
census; revert `Config(true)` → `Config(false)` **only after 2.1 and 2.3 are in the pinned release**.

### Explicitly not proposed
- Idea A as a `BaseEngine` hook (§4). Outlier engines (F5) fix themselves.
- `TrustLocalCacheCompletely = false` on servers (brief §8 item 7): most expensive, least needed once
  1–3 exist. Revisit only if 3.1 proves insufficient.

---

## 7. Experiments

All run against `mj_test_2` (schema state recorded in the log below) and a local `redis-server`
on a private prefix, with **child processes** as replicas (engines are singletons, so "in-process
replicas" cannot exist; a child process is the cheapest faithful unit). Instrumentation lives in
the rig (wrapping instance methods on the objects it owns, never `node_modules`). Rig:
`packages/TestingFramework/integration-test-suite/rigs/cache-fleet-baseline.ts` (to be written;
findings graduate into checks under `src/checks/`).

| Id | Question | Measure | Fail condition (what would refute the design) |
|---|---|---|---|
| E1 boot storm | R ∈ {1,2,3,5} replicas start together | per replica: pub/sub events received, payload bytes, materializations, rebuilds, rebuild-queue drain time, DB `ExecuteSQL` calls, time to `Loaded` | events ≠ (R−1)×C; DB loads ≠ R×C (both predicted by §1.2) |
| E2 propagation latency | save on A → visible in B's array | 50 trials, p50/p95/max | p95 > 2 s (the cross-server rig's settle time) |
| E3 staleness window | (a) in-memory-provider process saves (the CLI shape); (b) raw SQL update | time until any replica sees it; whether a *new* replica booted with `Config(false)` republishes the stale slot to fresh peers | prediction: ∞ for both; (b) re-poisoning confirmed |
| E4 convergence | after E1+E2 bursts | per replica: N6 census vs a fresh `Config(true)` process | any derived-census mismatch with identical row counts |
| E5 rebuild cost | per `AdditionalLoading` call, per engine loaded | ms distribution; where it stops being negligible | > 50 ms on any startup engine |
| E6 registry traffic | during E1/E2 | Metadata-category events, bytes; subscriber disconnects (`redis-cli CLIENT LIST` obuf) | any `oll`/`omem` growth or disconnect |
| E7 browser fan-out | one Explorer client on a 2-replica fleet during 5 poller cycles | `CACHE_INVALIDATION` messages received | > 0 per cycle proves N8's premise |

### 7.1 Baseline log (unmodified `next`, `c7a30c7c03`, 2026-09-16)

- Environment: SQL Server `sql2022` on localhost:1433, `mj_test_2` migrated to v6.1.x (66
  migrations applied 2026-09-16; 224 AI models, 630 model-vendor rows); private `redis-server`
  on 16380 started by the rig; Node v24.11.1, pnpm 10.33.0. `dist/` rebuilt from source the same
  day and verified to contain #4470 (`RebuildDerivedState` present in `MJCore/dist`).
- Rig: `packages/TestingFramework/integration-test-suite/rigs/cache-fleet-baseline.ts` (scratch;
  child replicas in `rigs/lib/cache-fleet-replica.ts`). Each replica is a separate process that
  boots the MJAPI way (§1.2). Commands, in order:
  ```
  npx tsx …/cache-fleet-baseline.ts --replicas=1 --phases=boot
  npx tsx …/cache-fleet-baseline.ts --replicas=2 --phases=boot,latency,stale --trials=10
  npx tsx …/cache-fleet-baseline.ts --replicas=3 --phases=boot,latency --trials=20
  npx tsx …/cache-fleet-baseline.ts --replicas=5 --phases=boot
  ```
  Reports and per-replica logs are in the session scratchpad (`fleet/*.json`).

**E1 — boot storm.** Per replica, every run: 109 `ExecuteSQL` + 4 `ExecuteSQLBatch` during boot,
135 cache slots written (every `@RegisterForStartup` engine's configs), 137 Redis `SET`s at the
swap, and `Loaded` in 2.4–3.2 s. What a replica *receives* depends on R:

| R | events received / replica | payload bytes / replica | AI payloads applied / replica | fleet DB calls | fleet pub/sub bytes | wall to all-loaded | drain after |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 109 | 0 | 3.1 s | — |
| 2 | 124–137 | 38–39 MB | 49 | 218 | 77 MB | 3.1 s | 2.4 s |
| 3 | 100–274 | 44–78 MB | 49–98 | 327 | 174 MB | 3.8 s | 2.1 s |
| 5 | 150–319 | 28–45 MB | 46–147 | 545 | 178 MB | 4.3 s | 2.1 s |

Theoretical (R−1)×135 events per replica is reached only by the replica that subscribes first
(R=3: r0 got 270 of 270); later subscribers miss the events published before they were listening —
**pub/sub is at-most-once and boot ordering decides who hears what**. The per-replica byte volume
is the real cost: ~280 KB average per event, and every replica JSON-parses every message
(`handlePubSubMessage`) even though only 49 of the 135 keys have a callback in the AI engine
(the other 86 are parsed and dropped). The Redis client output buffers stayed at 0 at this scale
(`omem`), so the F1 disconnect hypothesis is **not confirmed** at 135 keys; it stays a hypothesis
for the 10k-key production shape.

**E5 — rebuild cost.** `AIEngineBase.AdditionalLoading` after #4470: p50 **0.17 ms**, max
**1.7 ms** over 47–148 rebuilds per replica (R=5). Payload apply including materialization of up
to 1,013 rows: max 47 ms, typically < 20 ms. Confirms §4: the incremental hook (Idea A) has
nothing to save on this engine.

**E4 — convergence.** Identical `fleetHash` (every property's (PK, UpdatedAt) hash plus the
derived census) on every replica after every boot storm, R=1..5: 223 models with vendors attached,
630 vendors attached, on all of them. The post-#4470 rebuild converges.

**E6 — registry traffic.** 1–7 registry broadcasts received per replica per boot, 63 KB each at
135 entries (~470 bytes/entry ⇒ ~4.7 MB per broadcast at the production 10k keys). Confirms the
mechanism in F1; the size at scale is extrapolated, not measured.

**E2 — propagation latency** (save on A → note visible in B's `AgentNotes`, measured from before
`Save()`): 50 observations across R=2 and R=3, **p50 27 ms, min 19 ms, p95 320–522 ms, 0 misses**;
the p95 is entirely the first one or two trials after boot (JIT/warm-up), steady state is 22–31 ms.
Each save costs every peer one full-array payload + one rebuild (payloadsApplied +1 per save and
+1 per delete per observer).

**Inversion worth recording:** the *saving* replica's own `AIEngineBase` array lags its peers.
Peers adopt the Redis payload in ~30 ms; the saver has an `AdditionalLoading` override so it cannot
mutate in place and takes the 1.5 s debounced full refresh (`baseEngine.ts:1122`, `:1210`). At
1.5 s after a save on r0, r1 showed the new value and r0 still showed the old one.

**E3 — staleness.**
- (a) raw SQL `UPDATE` on `__mj.AIModel.Description`: every replica's engine still served the
  old value 3 s later and would forever (no event, no publish). A `RunView` of the same entity on
  a replica returned the old value from the engine's Redis slot with `ExecutionTime: 0` — the
  §1.4 "hit is never validated" path, observed. Side observation from the first run: a `RunView`
  *without* `IgnoreMaxRows` does not share the engine's slot (no `imr:1` segment) and created a
  second slot for the same entity, maintained independently — every engine-cached entity that is
  also read plainly is cached twice.
- (b) CLI-shaped writer (in-memory provider, `BaseEntity.Save`, exit): 135 cache writes and 109
  DB calls in the CLI process, zero publishes; every replica stale; a **lazily-loaded engine on a
  running replica read the stale slot from Redis (0 DB calls, 0 writes)** — the stale-reader shape.
- (c) A **fresh replica boot healed every peer**: it read the DB during `StartupManager`, then its
  swap migration re-published the slot and r0/r1 adopted the CLI writer's value within the
  quiesce window. **Under the current ordering, any restart repairs stale startup-engine slots.**
  This is an accidental safety property that N1 (Redis-before-engines) would remove — the
  "stale readers become stale writers" prediction in the brief §7 describes N1's world, not
  today's, except for engines loaded lazily after the swap (b).
- E7 (browser fan-out) was not run; no Explorer client in the rig.

**Baseline verdicts against the §7 fail conditions:** E1 fleet DB calls = R×109 (herd confirmed);
E2 p95 within 2 s (pass); E3 staleness = ∞ for both writer shapes (confirmed); E4 no divergence
(pass); E5 nothing above 50 ms (pass); E6 mechanism confirmed, scale extrapolated.

### 7.1a After Phase 1 (branch `engine-cache-architecture`, 2026-09-16)

Same commands as §7.1, same database, `dist/` rebuilt from the branch. Additional flags:
`--phases=boot,latency,expiry` at R=3. Reports are in the session scratchpad as
`fleet/ph1-r{1,2,3,5}.json`.

| R | Events in / replica | Payload MB / replica | Fleet MB | Handler calls / replica | **Rebuilds / replica** | Fleet DB calls |
|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 0 | 0 | 1 | 109 |
| 2 | 15–27 | 16–17 | 34 | 0 | **1** | 218 |
| 3 | 28–54 | 32–34 | 101 | 0 | **1** | 327 |
| 5 | 28–548 | 22–155 | 448 | 0–196 | **1** (baseline 47–148) | 545 |

- **Derived state:** 223 models / 630 vendors attached on every replica; `fleetHash` identical at
  every R.
- **Rebuilds:** the one rebuild is the initial load. Every peer payload was an identical row set
  and was skipped (1.3).
- **Redis at the end of boot:** 135 slots, TTL ≈ 3598 s, `__categories__` set 0, 123 group sets
  holding 135 members.
- **Latency:** p50 27–28 ms, p95 261–335 ms (first trials), 0 misses.
- **Expiry:** a save after the notes slot expired reached r1/r2 in 29/31 ms. The index went
  146 → 166 → 146.
- **Staleness:** unchanged, as expected until 2.1. Raw-SQL and CLI-shaped writes are still never
  seen, the lazy engine reads the stale slot, and a fresh boot still heals peers.

**Unchanged by design:**
- DB calls per replica: N1's job.
- Publishes per replica, 137: N1/N2's job.
- Event volume per replica, which depends on subscribe timing. At R=5 one replica subscribed first
  and received all 4 × 137 = 548 events. The fleet byte total (448 MB here, 178 MB in the baseline
  run) moves with that timing, so this pair of numbers is not a trend.

### 7.1b After Phase 2, N7 and N11 (branch `engine-cache-architecture`, 2026-09-17)

Same database and rig; `dist/` rebuilt from the branch. Replicas boot the MJAPI way as of 2.3 (the
shared cache is installed before metadata and engines load). Commands:
```
--replicas=1 --phases=boot
--replicas=2 --phases=boot,latency,stale --trials=10
--replicas=3 --phases=boot,latency,stale,expiry,race,burst --trials=20 --burst-mode=transaction
--replicas=3 --phases=boot --stagger=300
--replicas=5 --phases=boot                  (and again with --stagger=300)
```
Reports: session scratchpad `fleet/p2-*.json`.

**E1 — boot.** Simultaneous starts (every replica starts cold at the same moment):

| R | Fleet DB calls | Fleet MB received | Rebuilds / replica | Wall |
|---|---|---|---|---|
| 1 | 109 | 0 | 1 | 3.0 s |
| 2 | 170 | 42 | 1 | 2.7 s |
| 3 | 327 | 132 | 1 | 3.0 s |
| 5 | 398 | 271 | 1 | 3.9 s |

Staggered starts (300 ms apart):

| R | Fleet DB calls | Fleet MB received | First replica | Each later replica |
|---|---|---|---|---|
| 3 | 127 | ~0 | 109 calls, 135 writes, 2.7 s | **9 calls, 0 writes, 0.5 s** |
| 5 | 145 | ~0 | 109 calls, 135 writes | **9 calls, 0 writes, 0.5–1.8 s** |

- Baseline for comparison: R×109 DB calls in every case, 77–178 MB, and 47–148 rebuilds per
  replica at R=5.
- A replica that starts after the cache is warm reads everything from Redis.
- **Replicas that start at the same moment still herd:** at R=3 each one queried the database fully
  and published its 135 slots to the others. At R=5, the replicas that started a little later
  already found some slots (10–97 calls instead of 109).
  - This is the "cold-start herd" left open in §12 2.3.
- Registry bytes are 0 everywhere; no `__categories__` set; every slot has a TTL (≈3598 s).
- `fleetHash`, 223 models with vendors and 630 vendors attached are identical on every replica in
  every run.

**E2 — propagation.** R=2: p50 37 ms, p95 479 ms. R=3: p50 36 ms, p95 261 ms. 0 misses. The p95
is still the first trials after boot.

**E3 — staleness.**

| Writer | Baseline (§7.1) | Now |
|---|---|---|
| Raw SQL, nothing else | never seen | never seen (Phase 3.1 addresses this) |
| Raw SQL, then `mj cache clear` | — | every replica current **85–125 ms** after the clear |
| CLI writer (`BaseEntity.Save` in a separate process), then its automatic clear | never seen | every replica current **82–157 ms** after the clear |
| Lazily loaded engine after the clear | read the stale slot | reads the current value |
| Fresh replica boot | healed peers by republishing | reads the shared cache in 0.5 s; no longer needed to heal |

**Other phases (R=3).**
- **N7 race:** 0 disagreements in 20 rounds (baseline 5–24).
- **Expiry:** a save after the notes slot expired reached both peers in 23 ms. The index went
  115 → 135 → 115.
- **N11 burst, one transaction:** 1 slot write per step (96 KB for the saves, 74 B for the
  deletes); each peer received 1 event and did 1 rebuild.

---

## 8. Decisions needed from a human

1. **Phase order.** Agree Phase 1 → 2 → 3 as above, or pull N1 (2.3) forward with 2.1 as its
   gate? My recommendation is the order shown: N1 without 2.1 is the incident again.
2. **2.1 shape.** Category-clear from the CLI (blunt, small, correct) versus per-entity publish
   (precise, larger). Recommend the blunt form first.
3. **Registry (2.2).** Per-process key, or stop persisting on shared providers entirely? Recommend
   stop persisting when `SharesReferences === false` (the Redis case), keep for IndexedDB.
4. **TTL default.** A number has to be chosen once N3 exists; 1 h is the conservative suggestion
   (bounded staleness for unenumerable writers; event invalidation remains primary).
5. **Branch.** This is investigation on `next` with no code changed; implementation needs a
   feature branch tracking a same-named remote (repo rule 3/4).

---

## 9. Out of scope / deferred

- Brief item 7 (stranded connection): not reproduced; propose a mutation-tier check that runs a
  failing statement inside and outside an ambient transaction and asserts the next call succeeds.
- Brief item 5 (RLS in engine fingerprints): engines load as the system user, so the RLS clause
  is empty on that path and the two-argument fingerprint matches the provider's. Client-side
  engines with RLS-scoped users are the only exposure; leave a note in `BuildRunViewParamsForConfig`.
- PostgreSQL cell: the rig is platform-portable by construction (provider-agnostic); run it once
  the SQL Server baseline exists.

---

## A. Engine survey (reference)

53 production `BaseEngine` subclasses; 8 override `AdditionalLoading` (`AIEngineBase` 43+6 configs,
linear after #4470; `GeoDataEngine` 2, synchronous polygon parse; `DocumentationEngine` 2, HTTP per
item, append; `IntegrationEngineBase` 8, empty override that still disables immediate mutation;
`APIKeysEngineBase` 5, four maps; `TemplateEngineBase` 1 dataset, O(P×C) filter;
`EntityCommunicationsEngineBase` 0, cross-engine `Config`; `CommunicationEngineBase` 5, O(P×C)).
`@RegisterForStartup` engines on a server: AIEngineBase, IntegrationEngineBase, APIKeysEngineBase,
AIBridgeEngineBase, RemoteBrowserEngineBase, SearchEngineBase, EncryptionEngineBase,
RemoteOperationEngineBase, QueryEngine, DashboardEngine, ApplicationSettingEngine, PermissionEngine,
IdentityClaimEngine, UserInfoEngine, ResourcePermissionEngine, AuthProviderEngine,
ConversationsRuntime (deferred). One production override of `OnExternalCacheChange`
(`SchedulingEngineBase.ts:251`, re-filters after `super`). `OnDerivedStateInvalidated` does not exist;
the seam is `RebuildDerivedState` (`baseEngine.ts:286`), zero overrides.

---

## 10. Decisions recorded — review round 1 (2026-09-16)

Recorded from discussion; these amend §5/§6/§8 above rather than rewriting them.

| Item | Decision |
|---|---|
| N1 Redis-before-engines | **Permitted and encouraged.** Implement in `GenericDatabaseProvider` so SQL Server and PostgreSQL both get it. Sequencing unchanged: after 2.1 (CLI publish) and 1.2 (TTL), because E3c showed a fresh boot is what heals stale peers today and N1 removes that. |
| N2 registry | Each replica keeps its in-memory registry; on a provider that isolates (Redis) it is **neither persisted nor published**. The entity→slot index is rebuilt from the per-entity sets (N3). Persisting stays for IndexedDB in the browser. |
| N3 category index | **Per-entity sets** (`__entity__:RunViewCache:<Entity>`) replace prefix-scanning the category set on the hot path; members are pruned lazily on read (pipelined `EXISTS` + `SREM`). `SCAN` is reserved for `ClearCategory` / admin. Agreed. |
| N4 pollers | **Metadata only**: `AllowCaching=false` on `MJ: User Routines` and any entity read on a schedule with a per-run filter. `BypassCache` on the driver dropped. |
| N5 dead `cacheSettings` | Agreed. Fold into N1 (config reaches `Initialize` on the first call). |
| N6 census | Kept as a supporting item — the assertion primitive for the new checks, read-only. |
| N7 ordering | Two distinct hazards, both to be **measured before building**: (1) older snapshot overwrites newer → adoption guard + compare-and-set on the slot stamp; (2) concurrent rewrites of one slot from two replicas → lost update, needs a per-slot lock or server-side read-modify-write; `withFingerprintLock` is per-process only. Rig variant: simultaneous saves from two replicas, then compare arrays and slot to the DB. |
| N8 browser fan-out | Agreed. One "entity changed" message per save on a dedicated Redis channel, published by the existing global BaseEntity listener and relayed by every server to its browsers; delete the cache-write rebroadcast. **To verify first:** whether a resolver-path save on server A fires both the resolver publish and the global-listener publish to A's own browsers today. |
| N9, N10 | Agreed. |
| `maxUpdatedAt` | The slot-maintenance funnel will compute `maxUpdatedAt` from the rows (fallback to the clock only when the column is absent), as part of Idea C. Row-level comparison remains the skip test. Client-cache checks (C3/C10) must run because the stamp feeds the browser smart-cache check. |
| Idempotent `AdditionalLoading` | **Subsequent phase (Phase 5).** Do not build a new grouping mechanism: the related-record-collection feature (`DeclareRelatedRecords`, `Source: 'cache'`, `Load: 'lazy'`, generated from `EntityRelationship.RelatedRecordCollection`; see `packages/MJCore/docs/related-record-collections.md` §4) already resolves the donor engine's array on every access and therefore has **no derived state to go stale**. `agent.Actions` was migrated this way already. Migrate the remaining hand-groupings (`model.ModelVendors`, `category.Prompts`, `agent.Notes`, and the O(P×C) loops in the Template / Communication engines) onto declared collections; this is an API-shape change for callers (`.Items` / iterable instead of a plain array) and requires each caller to have awaited the donor engine. For whatever overrides remain, add a non-production double-run idempotency check in `RebuildDerivedState` (run twice, compare a census hash, `LogError` naming the engine) plus one integration check that does the same across every registered engine. |

## 11. Decisions recorded — review round 2 (2026-09-16)

| Topic | Decision |
|---|---|
| Phase order | §6 order agreed: Phase 1 → 2 → 3 → 5 (collection migration). N1 waits for 2.1 and 1.2. |
| 2.1 shape | Blunt category clear from `mj sync push` / `mj codegen` / `mj migrate` when `REDIS_URL` is configured, plus an explicit `mj cache clear`. Closes #4083. Later, surgical form = install the Redis provider in the CLI (task mode) so the existing save cascade rewrites shared slots itself — **only after batching (N11) exists**, or a bulk push republishes a slot once per row. |
| TTL default | 1 hour on slots, once the per-entity index (N3) exists. |
| Skip | Stays on `Config(true)` until these changes are in an **LTS** release; Skip never takes edge releases. Phase 4 rewritten accordingly; the Skip upgrade for the connection-string fix rides the same LTS. |
| Branch | Feature branch/worktree off `next`, created when the user says go. |
| PostgreSQL | **In scope for testing.** The fleet rig must run on both platforms: the raw-SQL step currently uses an `N'…'` literal (SQL Server only) and needs the platform-neutral form; a PG test database at the current migration level is needed (the `pg-autoquote` container on 5434 exists, no MJ database on it yet). |

### N11 — batch scope for invalidation (new; owner's idea, issues #4250 / #4301)

The fleet has the same per-row fan-out #4250 documents for browsers: one bulk unit of work of N
saves to one entity rewrites the affected slot N times, publishes the full array N times, and every
peer materializes it N times (E2 measured +1 payload apply per save per peer). Design it as **one
mechanism, two consumers**, in MJCore where `BaseEntity` events originate (the placement #4250
already argues for):

- An explicit batch scope (`RunInEntityTransaction` / `TransactionGroup` open one implicitly; a
  public primitive for other bulk writers). While open, `LocalCacheManager` buffers upserts/removes
  **per slot** and applies them on close: one read-modify-write, one `SET`, one publish per slot.
- The MJServer browser listener publishes once per unit of work on close, preserving per-record
  payloads (#4250 rules out a plain debounce because it drops `RecordData`; the slot path has no
  such constraint since its payload is the whole array).
- Receive side, independently cheap: a peer with several payloads queued for one fingerprint
  materializes only the newest (extend the existing `beginConfigRefresh` generation guard to skip
  materialization, not just assignment).
- Measurement: rig phase "burst" — 100 saves to `MJ: AI Agent Notes` from one replica; count slot
  writes, payload bytes, and per-peer applies before/after. #4301's mock-browser fixture is the
  browser-side counterpart and should share the driver.
- Sequencing: Phase 2, before the CLI gets a Redis provider and before Idea B's sweeper (whose
  republishes should also coalesce).

### #3059 folds into N7

The per-entity write fence proposed in #3059 (stamp a monotonic version on save; treat a cache
entry older than the entity's last write as stale on read) and N7's adoption guard are one version
counter seen from the read and the receive side. Design them together so there is one stamp, not
two; #3059's repro (rapid saves on a filtered `CacheLocal` config, then a plain read) becomes a
check in the same bundle.

---

## 12. Implementation log — session 2, 2026-09-16

Branch `engine-cache-architecture`, cut from `c7a30c7c03` (the commit the baseline and `dist/` were
verified against) and tracking `origin/engine-cache-architecture`. `origin/next` had already moved to
`89503cb232`; merge it before opening a PR, and rebuild the graph before measuring after the merge.

**Build check on the branch before any edit** (`--replicas=3 --phases=boot,latency,stale --trials=20`):
109 `ExecuteSQL` per replica at boot, identical `fleetHash`, propagation p50 20 ms / p95 406 ms,
0 misses, staleness ∞ for both writer shapes, fresh boot heals every peer. Matches §7.1.

### 1.1 — done

`metadata/entities/.caching-scheduled-poll-entities.json` sets `AllowCaching=false` on
`MJ: User Routines`, `MJ: AI Agent Session Bridges` (bridge runner, `ScheduledStartTime <= now`, every
60 s) and `MJ: Action Execution Logs` (retention driver, `StartedAt < cutoff`). Pin: IT96
(`cache-architecture` bundle) — CA1 asserts the three flags; CA2 runs the real
`UserRoutineDispatcherDriver` three times and asserts neither `LocalCacheManager`'s index nor the
storage provider gained a `MJ: User Routines` key. **Verified to fail before the metadata push**
(CA2: "expected 0, got 3") and pass after.

Audit of scheduled readers with a per-run filter (full table in the session transcript) and why the
rest were **not** flagged:

| Reader | Entity | Why not flagged |
|---|---|---|
| `ScheduledJobEngine.sweepStaleInflightJobs` (every poll, ~10–30 s while a job is in flight) | `MJ: Scheduled Jobs` | **Engine-held** (`SchedulingEngineBase`, which overrides `OnExternalCacheChange`). `AllowCaching=false` would stop cross-server propagation of job edits. **Needs a decision — see §12 open questions.** |
| `SessionJanitor` staleness sweep (60 s) | `MJ: AI Agent Sessions` | Already `AllowCaching=false`. |
| Memory Manager agent (15 min) | `MJ: AI Agent Runs` | Held by the client `ConversationEngine`; one key per 15 min. |
| Memory Cleanup agent (daily, disabled) | `MJ: AI Agent Notes`, `MJ: AI Agent Examples` | Engine-held (`AIEngineBase`); job ships disabled. |
| TaskGraph reconcile / request expiry | `MJ: Tasks`, `MJ: AI Agent Requests` | Already `BypassCache: true`. |

Local environment note: `mj_test_2` had never had `mj sync push`. It was pushed from a copy of
`metadata/` in the session scratchpad (with a `packages` symlink so `{@include ../../../../packages/…}`
in prompt templates resolves), so no `lastModified` was written into the repo. 14,259 records were
already identical (the migrations carry them).

### 1.2 — done (N3 index + TTL). N5 stays with N1 as §10 decided.

What changed:

- `ILocalStorageProvider.SetItem` takes optional `LocalStorageWriteOptions { TTLSeconds, IndexGroup }`;
  new optional `GetIndexGroupKeys(category, group)`. Providers that cannot honour an option ignore it.
- `RedisLocalStorageProvider`:
  - The index is **generic**, not entity-specific as §10 wrote it: `{prefix}:__group__:{category}:{group}`.
    The provider does not know what an entity is. `LocalCacheManager` passes the entity name as the group.
  - A Lua script adds the member and keeps the set alive at least as long as its longest-lived member
    (Redis 6-compatible commands only; hosted tiers still run 6.x).
  - `GetIndexGroupKeys` prunes dead members on read (pipelined `EXISTS`, one `SREM`; an `EXISTS` error
    keeps the member).
  - **The category-wide set is gone.** `ClearCategory` and `GetCategoryKeys` use `SCAN`. `ClearCategory`
    also deletes the category's group sets and the legacy `__categories__` set.
  - **Default TTL is 3600 s in the provider**, so every consumer (MJAPI, Skip when it upgrades) gets it.
    `0` disables it.
- MJServer: `REDIS_TTL_SECONDS` (wins) or `cacheSettings.sharedCacheTTLSeconds`, otherwise the provider
  default. **Deliberately not `cacheSettings.defaultTTLSeconds`.** That knob drives `LocalCacheManager`'s
  in-process sweep, whose `Remove` publishes `removed` to every peer. Once N5 makes it live, a non-zero
  value would make every replica reload every engine config on each sweep. A Redis TTL expires silently.
- `LocalCacheManager`:
  - RunView writes (fill, slot maintenance, and the migration in `SetStorageProvider`) pass
    `IndexGroup = entity` and the time left on a slot's own expiry.
  - `resolveFingerprintsForEntity` **unions** this process's index with the provider's group on every
    save when the provider has `GetIndexGroupKeys`. Without it, the old behaviour stays (list the
    category only when the local index is empty).

**F9 — new finding, reproduced: a TTL on engine slots breaks propagation unless a vanished slot is
invalidated.** Engines hold rows in memory and never read their slot again after loading. When the
slot expires under running replicas, a later save finds nothing to rewrite, publishes nothing, and
every peer engine stays stale.

Rig phase `expiry` (a) deletes the notes engine slot, then saves a note on r0:
- With the N3/TTL build and without the fix: **r1 and r2 never saw it** (`null` after 8 s).
- Fix: `LocalCacheManager.invalidateIfNotMaintained`. When the in-place upsert or remove reports it
  could not maintain an indexed slot, invalidate it. On Redis that publishes `removed`, and every peer
  engine reloads that config from the database (the existing `OnExternalCacheChange` fallback).
- After the fix: **both peers saw it in 33 ms.** Unit pin in `localCacheManager.sharedIndex.test.ts`.

**F10 — fixed; fleet impact not reproduced.** `resolveFingerprintsForEntity` returned the local set
whenever it was non-empty. So a slot a peer wrote after this process booted was only known through the
shared registry, which N2 is about to remove. The union fixes it. The unit test fails without the
union; no fleet repro was attempted.

**Rolling-deploy caveat.** An older replica finds peer slots only through the shared registry and the
`__categories__` set, and the new version no longer writes that set. In a mixed fleet the old replicas
can miss invalidating slots the new ones wrote until the old ones are gone. Deploy the whole fleet
together, or accept that window.

Measured (`--replicas=3 --phases=boot,latency,expiry --trials=20`, N3 + TTL + fix):
`sampleTTL` 3598, `categorySetMembers` 0, 123 group sets holding 135 members for 135 slots, boot DB
calls unchanged (109/replica), propagation p50 26 ms / p95 287 ms / 0 misses, identical `fleetHash`.
Expiry (b): 20 unique-filter reads grew the index from 146 to 166 members; after those slots expired
and one save read the index, it was back to 146.

Tests at this point:

| Suite | Result |
|---|---|
| MJCore unit | 2,613 passed |
| RedisProvider unit + real-Redis | 87 passed (`REDIS_URL` → private `redis-server` on 16381) |
| MJServer unit | 1,336 passed, 56 skipped |
| testing-integration unit | 70 passed |
| integration-test-suite unit | 281 passed |
| GraphQLDataProvider unit | 450 passed |
| Deterministic tier after 1.1 | 50 passed, 2 failed, 6 skipped of 58 |

In the tier run, both failures are IT78/IT79 fixture setup (`CREATE TABLE permission denied`): the
local `DB_USERNAME` cannot run DDL, while CI connects as `sa`. All six skips are mutation-gated, which
CI does not enable either.

### 1.3 — done (Idea C, row-identity shape)

- `BaseEngine.OnExternalCacheChange` skips a payload when the config is loaded and both row sets
  have the same sorted (primary key lower-cased, `__mj_UpdatedAt` epoch ms) multiset. The skip is
  exact (sorted comparison, not a hash). It never claims a refresh generation, so a reload already
  in flight still commits its rows. **Correction to my first draft:** claiming a generation on a
  skip would cancel a reload that may hold newer database rows; an identical payload carries no
  information and must behave as if it never arrived.
- The payload is applied whenever identity cannot be established: config not loaded, entity without
  `__mj_UpdatedAt`, an unreadable timestamp, or any error in the comparison (it is an optimization).
- `storeCachedResults` (slot maintenance) stamps `maxUpdatedAt` from the rows through the new
  `LocalCacheManager.MaxUpdatedAtOfRows`, falling back to the event time only when the rows carry no
  timestamp column. **Bug caught by the new test:** a `null` timestamp read as the epoch.
- Pins:
  - `baseEngine.externalCacheIdentity.test.ts`: 9 tests; with the skip disabled, 3 fail.
  - `localCacheManager.slotStamp.test.ts`: 4 tests.
  - IT84 NC4/NC5: NC4 fails with the skip disabled; verified.
  - Wire rig NW4, plus NW2 now bumping `__mj_UpdatedAt`: 4/4 on real Redis. NW2's old replay changed
    only the text while keeping the stamp, which real traffic never produces.
- **Measured** (boot, N3 + TTL + 1.3), rebuilds per replica:

  | R | Before 1.3 (§7.1) | After 1.3 |
  |---|---|---|
  | 3 | 1–99 | 1 |
  | 5 | 47–148 | 1 |

  After 1.3 the one rebuild is the initial load. Total payload-handler time per replica is 3–45 ms,
  every replica's `fleetHash` is identical, and all report 223 models / 630 vendors. Events and
  bytes received are unchanged: that is N1/N2's job.

### 1.4 — done (N9 + F7)

Both loaded-empty permission states keep today's immediate behaviour (loaded, empty, no hang) and
now schedule bounded re-checks: 5 s, 15 s, 45 s (`MaxPermissionRechecks`,
`PermissionRecheckDelayMs`, both overridable).

- A re-check only reads permission metadata. When the answer flips, it reloads from the database
  (`bypassCache`) and rebuilds derived state.
- Attempts are counted per key and reset only after a successful heal. A config whose reload fails
  after access is granted is handed to `scheduleEventRefreshRetry`.
- Timers are `unref`'d.
- The error-message inspection §5 floated was **not** used; a re-check on the permission answer is
  independent of provider error text.
- New `EngineDataMapEntry.readDenied` marks the classifier path.
- Pin: `baseEngine.permissionRecheck.test.ts`, 10 tests.

### 1.5 — done (N10, F3, F4)

- `LogWarning(message, category)` in MJCore writes through the error channel with a `[WARNING]`
  prefix, so production keeps it. It now carries:
  - the payload-apply fallback;
  - the restricted-role degradation and the skip-all message;
  - the re-check give-up and heal messages;
  - the system-user fallback;
  - local cache sync failures;
  - `[CACHE-SCHEMA-STALE]`;
  - the two oversized-entry write gates.
- Routine write gates (`AllowCaching=false`, keyset queries, external entity without a TTL) stay
  verbose: they fire on every such read.
- F3: `OnExternalCacheChange` returns immediately when the engine is permission-constrained or the
  config is `readDenied`, for both payloads and removals.
- F4: `LocalCacheManager.WhenInitialized(listener)`. `RegisterCacheChangeCallbacks` defers to it
  when the cache manager is not initialized, keeping only the latest config list.
- Pin: `baseEngine.cacheWiring.test.ts`, 7 tests.
- Test drift fixed: four `localCacheManager.*` test files mock the logging module and needed
  `LogWarning`.

### 1.6 — done (N6 census)

- `BaseEngine.GetStateCensus()` returns, per property: row count, newest `__mj_UpdatedAt`, a 64-bit
  FNV hash of the sorted row versions, and load/permission flags. It also returns the result of the
  overridable `GetDerivedStateCensus()`.
- `AIEngineBase` reports `ModelsWithVendors`, `VendorsAttached`, `CategoriesWithPrompts`,
  `PromptsAttached`, `AgentsWithNotes` and `NotesAttached`.
- MJServer exposes the `EngineStateCensus(EngineClass?)` GraphQL query (`@RequireSystemUser`).
- Pins: `baseEngine.stateCensus.test.ts` (5 tests) and IT96 CA3 against the real engine. CA3 checks
  three things:
  - the derived count equals an independent count from the arrays;
  - emptying one model's `ModelVendors` changes `VendorsAttached` while **every identity hash stays
    the same** — the incident's signature;
  - `Config(true)` restores the count and reproduces every hash.

### 2.1 — done (blunt CLI clear, closes #4083)

- `@memberjunction/redis-provider` exports `ClearSharedCacheCategories({ Connection, Categories, DryRun })`.
  It pings first, so an unreachable Redis throws rather than silently clearing nothing, and it
  sends a closing ping so the fire-and-forget `category_cleared` publishes reach the server before
  disconnect.
- MJCLI `lib/shared-cache.ts` reads `REDIS_URL` / `REDIS_KEY_PREFIX` (the variables MJAPI reads).
  It clears `RunViewCache`, `DatasetCache` and `Metadata`. A failed clear is a warning naming
  `mj cache clear`; it never fails a command whose database write succeeded. Opt-out:
  `--skip-cache-clear` or `MJ_SKIP_SHARED_CACHE_CLEAR=1`.
- **Where the clear runs.** `sync push` and `codegen` are `BaseCLIPlugin`s whose `Cleanup()`
  force-exits, so an oclif `postrun` hook would never run for `sync push`.
  - The MJCLI shims now subclass the plugins and clear after a successful `Execute()`. `sync push`
    skips the clear on `--dry-run`; `codegen` skips it on `--skipdb`.
  - `mj migrate` clears after a successful migrate.
  - The plugins themselves are untouched, so a third-party host that runs the plugins directly
    does not clear. In-process RSU CodeGen inside MJAPI already publishes (F6).
- New `mj cache clear [--dry-run] [--category …] [--url] [--prefix]` (a LIGHT command; `cache`
  domain profile and usage page added). Descriptions never include credentials.
- **Related MJCore fix.** `DispatchCacheChange` used to send `category_cleared` for *any* category
  to every callback. All callbacks watch RunView slots, so a three-category clear made every
  engine reload three times. Only a `RunViewCache` clear reaches them now.
- **Lockfile.** `pnpm install` also rewrote an unrelated `googleapis` peer entry; that part was
  reverted by hand. The committed lockfile diff is only the new workspace link, verified with
  `pnpm install --frozen-lockfile`.
- **Pins.**
  - MJCLI `shared-cache.test.ts` (11 tests) and `shared-cache-commands.test.ts` (5 tests, the
    shims against stand-in plugin bases).
  - redis-provider real-Redis tests: the clear deletes, notifies, and a dry run deletes nothing;
    an unreachable Redis throws.
  - MJCore `category_cleared` test.
  - Smoke test of the real binary: with a wrong password it reports "unreachable" without echoing
    the credentials.
- **E3 re-run** (R=3, `--phases=boot,stale`; the rig runs the real `mj cache clear` binary for the
  raw writer, and the CLI-shaped writer clears exactly as the shim does):

  | Writer | Before 2.1 | After 2.1 |
  |---|---|---|
  | Raw SQL + `mj cache clear` | ∞ | every replica current **94 ms** after the command returned (the command itself takes ~4 s, mostly Node/CLI start-up) |
  | CLI-shaped write + clear | ∞ | every replica current **138 ms** after the clear started |

  After the clear, a lazily loaded engine reads the new value, and a fresh boot agrees.
  **Staleness from enumerable writers is now bounded by the clear, not infinite.** Unenumerable
  writers (direct SQL without an operator clear) still depend on the 1 h TTL for non-engine slots
  and on Phase 3.1 for engine slots.

### 2.2 — done (N2 registry isolation)

- **Correction to §10's wording.** "`SharesReferences === false`" does not separate Redis from
  IndexedDB: both isolate references. The real property is *shared across processes*. New optional
  `ILocalStorageProvider.SharedAcrossProcesses`, declared `true` by `RedisLocalStorageProvider`
  (the test wrapper delegates it).
- `LocalCacheManager.loadRegistry` / `persistRegistry` are no-ops on such a provider. Each process
  keeps its own in-memory registry for eviction accounting. Entries other processes wrote are found
  through the per-entity index (1.2), which is why N3 had to land first.
- A registry key left by an older version stays in Redis until `mj cache clear` (Metadata category)
  or a rewrite with the TTL.
- Pins: three tests in `localCacheManager.sharedIndex.test.ts`: a shared store is never read or
  written for the registry, including across the swap; a non-shared store still persists it.

**E6 re-run after 2.2** (R=3, `boot,latency,snapshot`):

| Measure | Baseline (§7.1) | After 2.2 |
|---|---|---|
| Registry broadcasts received per replica | 1–7 (63 KB each) | **0** |
| Registry key in Redis | 63 KB | **0 bytes** |

Propagation is unchanged: p50 27 ms, p95 258 ms, 0 misses. Every replica has the same `fleetHash`
and still does exactly one rebuild.

**F11 — new finding, measured: servers publish their multi-megabyte metadata snapshot to every peer.**
- `ProviderBase.SaveLocalMetadataToStorage` writes four keys through the provider's storage, with
  no category (Redis category `default`): `AllMetadata` (1.93 MB gzip+base64 on `mj_test_2`),
  `Timestamps`, `Format`, `DatasetMembership`.
- MJAPI swaps that storage to Redis after startup, so any later metadata refresh — the
  `CheckRefreshIntervalSeconds` timer, RSU, `RefreshCurrentUser` — publishes a `set` for each key.
- Rig phase `snapshot`: one save on r0 delivered **4 events / 1.94 MB to each peer**. Nothing
  listens for those keys. Each peer still JSON-parses the whole message.
- `MJServer/src/index.ts:691-699` also relays every event to every connected browser as an
  entity-level invalidation for the "entity" `___MJCore_Metadata_AllMetadata` (by inspection; the
  rig has no browser).
- The same applies to `LocalCacheManager` dataset slots (`DatasetCache`) and to provider dataset
  caches (`default`): no callback is registered for any of them, since `RegisterChangeCallback`
  keys are RunView fingerprints.
- **This bears directly on N1.** With Redis installed before `Config()`, every booting server reads
  the shared snapshot (validated by timestamps, so correct and faster). But a server that has to
  refresh it would publish 2 MB to the fleet during the boot storm.
- **Proposed** (needs agreement, see below): the Redis provider publishes only the categories
  someone subscribes to, configurable and defaulting to all for compatibility. MJAPI would pass
  `['RunViewCache']`, and the browser relay would take only those events (the rest of N8 stays as
  planned).

### Open questions for the owner

1. **`MJ: Scheduled Jobs`** is read every engine poll with `ExpectedCompletionAt < now` (one new key
   per poll while a job is in flight). `AllowCaching=false` would break propagation of job edits,
   because `SchedulingEngineBase` holds that entity and relies on cache events. The options conflict
   with the §10 "metadata only" decision:
   - (a) `BypassCache: true` on that one read, which §10 dropped for the dispatcher;
   - (b) leave it, and rely on the TTL plus index pruning from 1.2 to bound the garbage;
   - (c) have the sweep filter in JS over the engine's array instead of querying.

   Recommendation: **(a)**. The read (`ScheduledJobEngine.ts:1568`) is meant to see live lock and
   lease state (its own comment says the engine copy "would be stale"). On a server,
   `TrustLocalCacheCompletely` would serve it from the cache. Today only the `now` timestamp embedded
   in the filter keeps it a miss, so the read is correct only by accident. That rules out (c), and
   `BypassCache` states the intent.

2. **Pub/sub scope, before N1 (F11).** Should `RedisLocalStorageProvider` publish only configured
   categories, with MJAPI and Skip passing `['RunViewCache']` so that metadata snapshots, dataset
   slots and the registry are never broadcast? Recommendation: yes. Nothing subscribes to the
   others, and N1 would otherwise add a 2 MB broadcast to any boot that refreshes metadata.
3. **Local integration environment.** IT78/IT79 fail locally only because `DB_USERNAME` cannot
   `CREATE TABLE` on `mj_test_2` (CI connects as `sa`). Either grant DDL to that login on
   `mj_test_2` or point the tier at a login that has it; the fixture itself is unchanged.

### Owner answers (2026-09-16, later)

- **Q1 answered — (a).** `ScheduledJobEngine.sweepStaleInflightJobs` now sets `BypassCache: true`.
  Scheduling engine unit tests: 260 passed, 1 skipped.
- **Q3 resolved.** Run the tier as the CodeGen login (`CODEGEN_DB_USERNAME`/`CODEGEN_DB_PASSWORD`
  from the repo's dotenv file) by setting `DB_USERNAME`/`DB_PASSWORD` for the run only; dotenv does
  not override variables already set. Result with that login: **52 passed, 0 failed, 6 skipped**
  (all six mutation-gated). IT78/IT79 pass.
- **Q2 still open.** The owner asked how servers learn about metadata changes. Servers do not use
  the broadcast. They learn from:
  - their own writes to metadata-member entities (a debounced reload in the same process);
  - a database timestamp poll every `metadataCacheRefreshInterval` (180 s default).
- **1.4 questioned by the owner** as not worth its cost; decision pending.

### Owner decisions, round 3 (2026-09-16)

**1.4 re-checks removed.** The owner judged the bounded permission re-check wasted compute:
permissions do not realistically change under a running engine, and `Config(true)` re-evaluates
them.

- Removed: `schedulePermissionRecheck` and everything that drove it.
- Kept:
  - the `readDenied` flag, which the F3 guard uses;
  - the helper extracted from `CheckPermissionsOrSkipAll`;
  - the F7 tests, now `baseEngine.permissionEmptyStates.test.ts` (4 tests). They assert both
    loaded-empty states and that nothing is scheduled afterwards.

**F11 implemented — metadata changes reach other servers by a small notice.**

- `RedisProviderConfig.publishModes` / `defaultPublishMode`: per category, publish `'full'` (value
  in `Data`), `'notice'` (key only) or `'none'`. `category_cleared` is always published. The
  default stays `'full'` for compatibility.
- New MJServer module `sharedCache.ts`:
  - MJAPI publishes `RunViewCache: 'full'`, `default: 'notice'`, everything else `'none'`.
  - Incoming events go to `RouteSharedCacheEvent`:
    - a metadata-snapshot notice goes to `ProviderBase.HandlePeerMetadataNotice`;
    - everything goes to `LocalCacheManager.DispatchCacheChange`;
    - only RunView `set`/`removed` events are relayed to browsers. This stops the
      `___MJCore_Metadata_*` "entity" invalidations.
- `ProviderBase.IsMetadataChangeNotice` / `HandlePeerMetadataNotice` react to the snapshot's
  `Timestamps` key, which is written last. After a 500 ms debounce they run
  `RefreshIfNeeded(undefined, true)`. That compares database timestamps and adopts the shared
  snapshot. A server that is already current saves nothing, so notices do not echo.
- **Bug found on the way:** `SQLServerDataProvider.RefreshIfNeeded()` took no arguments, so the
  throttle-bypass flag of every event-driven check was silently dropped. It now passes both
  arguments through. PostgreSQL has no override.
- **Integrated test.** Two real MJAPI processes (`node -r dotenv/config packages/MJAPI/dist/index.js`
  on ports 14100/14101), `mj_test_2`, a private Redis on 16390. B runs with
  `METADATA_CACHE_REFRESH_INTERVAL=3600000`, so its poll cannot be the cause.
  - New cross-server check XS3 sets `UserViewMaxRows=3` on `MJ: AI Models` through A, then polls
    B until B serves 3 rows. The server applies the cap from its in-memory metadata.
  - With the notice: **B applied the change 3.9 s after A's save** (restore: 3.8 s). B's log shows
    six key-only notices, then `[Metadata Cache] Load complete … 230 ms` — B adopted the shared
    snapshot and ran no `GetAllMetadata` of its own.
  - With `default: 'none'`: **B never applied it (20 s timeout)**. Verified by rebuild and rerun.
  - **Wire volume per metadata save, before → after.** Before: values of 3.74 MB
    (`AllMetadata`) + 17.5 MB (the provider's `__DATASET__MJ_Metadata` cache key) + small keys,
    about 21 MB to every server. After: 6 notices, ~2.1 KB for two saves.
- **Pre-existing rig bug, fixed.** The cross-server rig never talked to two servers:
  `new GraphQLDataProvider()` returns the process singleton, so "client A" was client B and XS2's
  "save in A" ran on B, in CI too. The rig now builds a non-singleton provider the way
  `fls-client.checks.ts` does, and asserts the two clients are distinct. Server logs confirm the
  saves land on A. XS2 still passes across two real servers.
- Tests:

  | Suite | Result |
  |---|---|
  | MJCore | 2,649 passed |
  | RedisProvider | 78 passed, 14 Redis-gated |
  | MJServer | 1,340 passed, 56 skipped |
  | SQLServerDataProvider | 188 passed |
  | integration-test-suite | 281 passed |
  | Deterministic tier (CodeGen login) | 52 passed, 0 failed, 6 skipped |

- **F12 (by inspection, not measured):** on a Redis fleet, every periodic metadata check
  (`CheckToSeeIfRefreshNeeded`) also runs `LoadLocalMetadataFromStorage`. So each server
  downloads, decompresses and deserializes the 3.7 MB snapshot every poll interval even when
  nothing changed (230 ms in B's log). A cheap fix: compare the stored `Timestamps` key before
  reading the payload. Deferred.

### 2.3 — done (N1: Redis before engines, SQL Server and PostgreSQL)

- MJCore:
  - `ProviderConfigDataBase.LocalStorageProvider` (optional).
  - `StartupOptions.cacheManagerConfig`, passed to `LocalCacheManager.Initialize` — **N5: `cacheSettings` are applied now.**
  - `LocalCacheManager.SetStorageProvider` is a no-op when given the provider already in use. Without that, migrating onto itself would republish every entry.
- `GenericDatabaseProvider.Config` installs the configured storage before `ProviderBase.Config` loads metadata. SQL Server and PostgreSQL both call through it.
- MJServer `serve()`:
  - builds the shared cache (`CreateSharedCacheFromEnvironment`) and subscribes (`WireSharedCacheEvents`, provider resolved per event) **before** the database branch;
  - passes it on both platform configs, and passes `CacheManagerConfigFromSettings(cacheSettings)` to startup;
  - no longer performs the late swap. What remains is a guarded fallback.
- `bootstrapIntegrationServer({ SharedStorage })` boots the rig's replicas the same way. The rig has `--boot=redis-first|legacy` and `--stagger=ms`.
- **Measured (rig, R=3):**

  | Boot | Replica | DB calls at boot | RunView writes | Events in | Boot |
  |---|---|---|---|---|---|
  | redis-first, staggered | r0 (first) | 109 + 4 batches | 135 | 8 (~0 MB) | 2.9 s |
  | redis-first, staggered | r1, r2 | **9 + 1** | **0** | 4 / 0 (~0 MB) | **0.44 s** |
  | legacy, staggered | each | 109 + 4 | 135 | 270 / 135 / 0 (77 / 39 / 0 MB) | 2.1 s |
  | redis-first, simultaneous | each | 109 + 4 | 135 | 290 (44 MB) | 3.5 s |

  - `fleetHash` is identical in every run.
  - A simultaneous cold start still herds: every replica misses together. N1 helps restarts, scale-out and staggered starts. A cross-process single-flight on cache fill (Redis `SET NX` per fingerprint) would address the cold herd; not built. Candidate for Phase 3.
  - Latency p50 29 ms, 0 misses. Expiry heal 29 ms.
  - E3: `mj cache clear` → 106 ms; CLI writer + clear → 123 ms.
  - A fresh boot after the clear agrees with its peers, and a lazily loaded engine reads fresh.
  - The "stale reader re-poisons the fleet" risk is covered by 2.1 for enumerable writers and by the 1 h TTL for others. Engine slots from unenumerable writers remain Phase 3.1's job.
- **Measured on two real MJAPI processes** (A started first on an empty private Redis; command stats reset before B):
  - B's metadata phase took **0.4 s vs A's 2.4 s**: B adopted the shared snapshot.
  - B's warm boot wrote only 24 `MJ: Entity Record Documents` slots (deleted again moments later), one `MJ: Scheduled Jobs` slot, and two provider dataset caches.
  - XS1–XS3 pass with both servers booted this way.
- **F13 (observed):** a startup job reads `MJ: Entity Record Documents` in batches with `RecordID IN (…)` filters, then saves. Every batch writes a filtered slot that its own save invalidates immediately, which is write-only traffic like F2. Candidate for `BypassCache` on that read. Not changed.
- Tests:

  | Suite | Result |
  |---|---|
  | MJCore | 2,651 passed |
  | GenericDatabaseProvider | 1,102 passed, 5 skipped |
  | MJServer | 1,344 passed, 56 skipped |
  | testing-integration | 70 passed |
  | Deterministic tier | 52 / 0 / 6 |

- **Not yet done: a PostgreSQL run.** The code path is shared, but no MJ database exists on PostgreSQL. The `pg-autoquote` server on 5434 is available.

### N7 (item 3.2 in §6) — hazard 2 measured, reproduced and fixed; hazard 1 not reproduced

**Measured first, as §10 required.**
- New rig phase `race`: in each round r0 and r1 save a note at the same moment. After a quiesce, the
  rig compares each engine's notes and the shared notes slot with the database.
- Current code: **5/20 rounds disagreed** (a later run: 24/30). The slot lost one of two concurrent
  inserts, and the losses accumulated: 15 notes missing after 30 rounds.
  - The two savers stayed correct, because their own events apply locally.
  - The observer r2, which only adopts the slot, ended up missing exactly the lost rows, and never
    recovered.
- A write trace (`FLEET_TRACE_NOTES=1`) shows the mechanism directly: r0 and r1 both wrote the slot
  in the same millisecond with `rows=3`, each having read `rows=2`.

**Fix.**
- New optional `ILocalStorageProvider.WithKeyLock(key, category, work)`.
  `RedisLocalStorageProvider` implements it as `SET {prefix}:__lock__:{cat}:{key} <uuid> NX PX 10000`,
  retried every 20 ms for up to 5 s, and released by compare-and-delete in Lua.
- `LocalCacheManager.withFingerprintLock` takes the shared lock inside its per-process chain.
- If the lock cannot be acquired, the rewrite reports "not maintained" (`maintainSlotLocked`), and
  the existing fallback invalidates the slot so every server reloads. It never writes unlocked.

**Result:** **0/30 rounds disagreed**, and propagation is unchanged (p50 27 ms, 0 misses).
- The first run after the fix still disagreed. It turned out the rig's
  `InstrumentedLocalStorageProvider` did not pass `WithKeyLock` through; it now does, the same way
  it passes `GetIndexGroupKeys`. MJAPI uses the Redis provider directly and was never affected.

**Pins.**
- Real-Redis test: two providers × 25 locked increments = 50. The lock is released when `work`
  throws, and a timed-out caller never deletes another holder's lock.
- `LocalCacheManager` tests: the lock is taken around a save-driven rewrite, and a lock failure
  invalidates instead of writing.
- The rig `race` phase.

**Hazard 1 — an older snapshot overwrites a newer slot on the fill path.**
- Not reproduced. Since N1, fills happen only on a miss: the first boot, after expiry, or after a
  clear.
- The adoption guard and #3059's version fence stay unbuilt until a measurement shows the race.

**Tests.** MJCore 2,653 passed; RedisProvider 94 passed with Redis; testing-integration 70 passed;
deterministic tier 52 / 0 / 6.


### N11 — batch scope, done for the slot path (browser relay stays with #4250)

**Measured first** (rig phase `burst`, R=3, stagger 300 ms: r0 saves 100 `MJ: AI Agent Notes`,
then deletes them).

| Run | Step | r0 slot writes | Bytes published | Each peer: events / applies / rebuilds |
|---|---|---|---|---|
| Before, one save at a time | saves | 111 | 8.15 MB | 111 / 100 / 100 |
| Before, one save at a time | deletes | 100 | 4.78 MB | 100 / 100 / 100 |
| Before, whole burst in one transaction | saves | 111 | 8.15 MB | 111 / 100 / 100 |
| Before, whole burst in one transaction | deletes | 100 | 4.78 MB | 100 / 100 / 100 |
| **After, one transaction** | saves | **1** | **96 KB** | **1 / 1 / 1** |
| **After, one transaction** | deletes | **1** | **74 B** | **1 / 1 / 1** |
| After, one save at a time | saves | 100 | 4.88 MB | 100 / 100 / 100 |
| After, one save at a time | deletes | 100 | 4.78 MB | 100 / 100 / 100 |

Peers converged in 1.5–1.8 s in every run; the time is the saves themselves. A transaction did not
help before: events were applied as they were raised, one slot rewrite per save.

**Also found: uncommitted rows reached the shared cache.** `BaseEntity` raises `save` / `delete`
while the transaction is still open, and the cache applied them at once. A transaction that
rolled back left its rows in the shared slot, and every server adopted them. CA4 reproduces this
when batching is switched off: mid-transaction, the stored slot already held the five uncommitted
notes.

**Design as built.**
- The batch opens and closes with the outermost `DatabaseProviderBase.BeginEntityTransaction` on a
  provider instance. It is keyed on that instance. The ambient transaction lives there too, so
  every save buffered in a batch belongs to the same database transaction. `RunInEntityTransaction`,
  IS-A chains and graph saves all get it without changes.
- `LocalCacheManager.BeginEntityEventBatch` / `EndEntityEventBatch` / `RunInEntityEventBatch` are
  public for bulk writers that do not use a transaction. Nested levels share one batch.
- While a batch is open, `save` / `delete` events raised through that provider are captured with
  the record's values at that moment, then applied when the batch closes:
  - Unfiltered slots: all changes in one read-modify-write (`ApplyRowChanges`), under the N7 lock:
    one `SET` and one publish.
  - Filtered slots: one invalidation when the batch saved anything; deletes only, one rewrite.
  - Subset and aggregate slots: one invalidation.
- If any level fails (rollback, commit error, thrown work), the touched entities' slots are
  invalidated instead of written, so every server reloads from the database.
- Past 20,000 buffered changes, a batch stops recording rows and invalidates on close instead.
- **Read-your-writes inside the transaction.** A slot is behind while its entity has unapplied
  changes. Code that saves and then reads inside the transaction would otherwise get the old rows,
  where it used to get fresh ones within milliseconds. While any open batch holds changes for an
  entity, `GetRunViewResult(s)` treat its slots as misses (the database answers) and
  `SetRunViewResult` does not store fills for it. Slot maintenance reads past the guard. This guard
  also removed 11 slot fills per burst that were being written from inside the transaction.
- `BaseEngine.syncLocalCacheForConfig` skips its own rewrite while a batch is open for the entity's
  provider. The batch rewrites every indexed slot, the engine's included.
- **Receive side.** `OnExternalCacheChange` claims its generation, yields one macrotask, and
  materializes only if no newer payload for the same property has arrived. Three payloads
  delivered together now cost one materialization and one rebuild, not three.

**Not done.**
- **Browser relay (#4250).** MJServer still publishes one browser message per save. Batching it
  needs a multi-record message and matching client handling in `GraphQLDataProvider`, which is
  #4250's scope. That listener also still relays saves from transactions that later roll back.
- **Engines' in-memory arrays.** They still apply local events as they are raised, so a rolled-back
  transaction leaves phantom rows in the *local* engines of the process that ran it, as before.
  Peers are no longer affected.
- **Saves without a transaction are unchanged.** One-at-a-time bulk writers need
  `RunInEntityEventBatch` or a transaction to benefit.
- **Needed before the CLI gets a Redis provider (2.1's surgical form).** `mj sync push` wraps its
  work in the provider's raw `BeginTransaction` / `CommitTransaction` (`TransactionManager`), which
  do not open a batch; only `BeginEntityTransaction` does. `TransactionManager` should call
  `Begin/EndEntityEventBatch` on the same provider. Not changed now: the CLI has no shared cache
  yet, and while a batch is open, reads of the touched entities go to the database, so the effect
  on push time should be measured first.

**Pins.**
- MJCore `localCacheManager.entityEventBatch.test.ts` (16 tests):
  - one write per slot, and values captured when the event was raised;
  - failure → invalidation; nesting; other providers are not held back;
  - filtered slots; `RunInEntityEventBatch`;
  - real `BeginEntityTransaction` commit, rollback and failed commit;
  - overflow; the read and fill guard; `BaseEngine` sync skipped during a batch.
  - With buffering switched off, 9 of the first 13 fail; with the guard switched off, its 2 fail.
- `baseEngine.externalCacheIdentity.test.ts`: a burst materializes once (fails without the yield);
  payloads that arrive one after another still all apply.
- IT96 **CA4**: in a real SQL Server transaction, 5 note saves leave the stored slot untouched and
  cached reads miss until commit; after commit the slot holds all 5; a delete transaction empties
  it; a rolled-back save invalidates the slot. **Fails with batching switched off** (the stored slot
  held the uncommitted rows).
- Rig: `--burst-mode=serial|transaction`.

## 13. Implementation log — session 3, 2026-09-17

The session scratchpad was emptied between sessions, so reports from before this point are gone;
their numbers are recorded above. Rig reports for this session are in `fleet/p2-*`, `fleet/pg-*`,
`fleet/p3-*` and `fleet/herd-*`.

### Fleet re-run after Phase 2 — done

Recorded as §7.1b.

### PostgreSQL run — done, on a private database

**Setup.**
- Container `mj-pg-cachearch` (postgres:16, port 5441), database `MJ_6_1_0_PG_cachearch`, user
  `mj_cachearch`.
- `mj migrate --dir=migrations-pg`: 94 migrations in 7.5 s, once the `cdp_*` roles existed (as CI
  creates them).
- `mj sync push` for `metadata/` and `metadata-optional/integration-test/`, from a scratch copy.
- Every command ran with inline `DB_PLATFORM=postgresql …` variables; the repository's dotenv file
  was not changed.
- **The database is kept** for the rest of this work. It is a clean-room build, apart from the
  repairs listed below.

**Toolchain problems found on a fresh PostgreSQL build.** Not fixed in the repository; they belong
to the release toolchain (root `CLAUDE.md`, "PostgreSQL is toolchain territory"). Reported here for
the build engineer.
1. The baseline needs the `cdp_UI` / `cdp_Developer` / `cdp_Integration` roles to exist first.
   Without them `mj migrate` fails with `role "cdp_Developer" does not exist`. CI creates the roles
   by hand; the developer guide does not say so.
2. After migrate, **10 orphaned virtual `EntityField` rows** remained, although
   `R__RefreshMetadata.pg-only.sql` reported success:
   - `RootConsolidatedIntoNoteID`, `RootLastSessionID`, `RootRestoredFromID`;
   - `EntityAction` on 4 entities;
   - `ClaimType`, `Entity`, `ClaimedByUser` on Identity Claims.

   Every read of those entities failed with `column … does not exist`. That broke `AIEngineBase`'s
   notes load and made `mj sync push` fail with a duplicate key: the existence lookup failed, so
   push inserted a row that already existed. Calling `spDeleteUnneededEntityFields('sys,staging')`
   by hand afterwards removed all 10.
3. `mj codegen --skipfiles` exits 1 on this database:
   - `could not open relation with OID …` in "updating existing entity fields" whenever the same run
     regenerated a view;
   - on a second run, `UQ_EntityField_EntityID_Sequence` collisions;
   - without `--no-ai`, it attempted LLM validator generation, which failed.

   Each run also wrote `migrations-pg/v5/CodeGen_Run_*.sql`. All three files were moved out of the
   repository.
4. **Repair used on this private database only.** Dropping the affected views makes CodeGen
   regenerate them. It did not help: the regenerated views still lack those virtual fields, so the
   field-row cleanup in 2 was the actual fix. The drop cascaded to the hand-written
   `spCreateRecordChange_Internal`, which was restored verbatim from the v5.46 baseline.

**Integration harness gaps found and fixed.**
- `bootstrapIntegrationServer` on PostgreSQL never ran `StartupManager` (SQL Server's
  `setupSQLServerClient` does). Engine-backed checks ran against unloaded engines. It now runs the
  startup engines as MJAPI does.
- The rig forced `NODE_ENV=production` on its replicas, which makes the PostgreSQL provider demand
  SSL. It now keeps the caller's `NODE_ENV`.
- The rig counted database calls only on `SQLServerDataProvider`; it now counts both providers.
  `integration-test-suite` declares `@memberjunction/postgresql-dataprovider`; the lockfile change
  is that link only.

**Results on PostgreSQL.**
- IT96 CA1–CA5: all pass.
- Deterministic tier: **48 passed, 3 failed, 27 skipped** (the skips are client-transport and
  mutation-gated bundles). The 3 failures do not touch code this branch changed:
  - IT76 WD4: the run-tree query uses `[` bracket syntax;
  - IT87 NT8b / NT10: PostgreSQL lets `COMMIT` succeed on an aborted transaction, and its error
    text differs; both checks use the raw `BeginTransaction` / `CommitTransaction`;
  - IT90: needs an mssql pool.
- Rig, R=3:
  - boot: 223 / 630 on every replica, identical `fleetHash`;
  - latency: p50 18 ms, p95 136 ms, 0 misses;
  - race: 0 / 20;
  - expiry heal: 7 ms;
  - raw SQL + `mj cache clear`: 50 ms; CLI writer + clear: 83 ms;
  - transaction burst: 1 write per step.
- Staggered boot: a later replica makes 37 database calls and 0 writes and boots in 0.38 s. The
  first replica makes 173. PostgreSQL has no batched status query, which is why these counts are
  higher than on SQL Server.

### F12 — done

`ProviderBase.CheckToSeeIfRefreshNeeded` used to download, decompress and deserialize the whole
metadata snapshot at every poll. It now reads only the stored `Timestamps` key and loads the
snapshot only when:
- the process holds no metadata yet;
- the stored timestamps differ from the ones this process last loaded or saved (a peer's newer
  snapshot, which the F11 notice relies on adopting); or
- the store was cleared.

Pin: `providerBase.metadataPollReadsTimestampsOnly.test.ts` (3 tests). 2 of them fail with the old
call.

### F13 — done

`EntityVectorSyncer.UpsertEntityRecordDocumentBatch`'s existence read sets `BypassCache`. It is a
find-or-create read, and each batch's `RecordID IN (…)` filter is unique, so every batch wrote a
cache entry that its own saves dropped.

Pin: `entityVectorSyncExistenceRead.test.ts`, which fails without the flag.

### §9 leftovers — done

- **Brief item 7 (stranded connection).** IT96 CA5 runs 10 failing statements interleaved with 10
  good ones concurrently, then a `RunView` that bypasses the cache, then a failing statement inside
  a rolled-back transaction, and checks the provider is still usable. It writes nothing, so it runs
  in the deterministic tier, not the mutation tier. Passes on SQL Server and PostgreSQL.
- **Brief item 5 (RLS in engine fingerprints).** Documented on `BuildRunViewParamsForConfig`.

### 3.1 — done (engine sweep with a lease)

- **Probe.** `IRunViewProvider.GetRunViewsDatabaseStatus` (optional) is implemented in
  `GenericDatabaseProvider`. It gives the row count and newest `__mj_UpdatedAt` per view, straight
  from the database. It reuses the cache check's WHERE clause (filter, user search, RLS,
  PreRunView hooks) and the batched status query. SQL Server sends one batch; PostgreSQL sends one
  query per view.
- **`BaseEngine.SweepAgainstDatabase()`.**
  - Probes every loaded, readable entity config in one call.
  - Compares with the held rows (the census count and newest timestamp, 1 s tolerance as in the
    smart-cache check).
  - Reloads what differs with `bypassCache`.
  - Writes the fresh rows to the config's cache slot once, so peers adopt them.
  - Rebuilds derived state once, then emits.
  - Datasets are not checked. Entities without `__mj_UpdatedAt` are compared by count only.
- **`BaseEngineSweeper`** (MJCore singleton): `Start(intervalMs)`, `Stop()`, `SweepOnce(leaseMs)`.
  The per-engine lease is `engine-sweep:<EngineClass>`, taken through
  `LocalCacheManager.TryAcquireSharedLease`.
- **Lease.** `ILocalStorageProvider.TryAcquireLease` (optional) is
  `SET {prefix}:__lease__:<name> NX PX` on Redis. A store without it grants the lease.
- **MJAPI.** `cacheSettings.engineSweepIntervalSeconds`, default 300, 0 turns it off; started by
  `StartEngineSweeper` after startup.
- **Gate met (rig phase `sweep`, `--sweep-ms=3000`, R=3).** A raw SQL change reached every replica
  in **3.2 s on SQL Server and 3.1 s on PostgreSQL**, and the restore in 1.4 / 1.5 s. Each time one
  replica swept and reloaded, and the other two applied its single published payload. Without the
  sweep, a raw SQL change is never seen (the `stale` phase).
- **Pins.**
  - `baseEngine.sweepAgainstDatabase.test.ts` (10);
  - `getRunViewsDatabaseStatus.test.ts` (3);
  - the Redis lease integration test;
  - `sharedCache.test.ts` (`StartEngineSweeper`);
  - the instrumented-cache pass-through test.
- **Limits.** An UPDATE that does not change `__mj_UpdatedAt` or the row count is invisible. MJ's
  update triggers set the timestamp, so raw SQL is caught unless it disables them.

### Cold-start herd — done (warm-up turn)

- `StartupManager` takes the shared lease `startup-warmup` around the synchronous engine loads and
  releases it afterwards (`ILocalStorageProvider.ReleaseLease`, compare-and-delete on Redis).
  - Servers that start together take turns: the first loads from the database and fills the
    cache; the others wait (100 ms polls), then load from the warm cache.
  - `StartupOptions.warmupLeaseMs` (default 30 s) bounds both the lease and the wait; 0 turns it
    off.
  - A store that cannot be asked ends the wait at once, and task mode takes no turn.
- A cross-process lock on every RunView cache miss was considered and rejected. It would put a
  lock on the hottest read path, and a slot the filler decides not to store (for example, an
  oversized result) would stall every waiter.
- **Measured, simultaneous boots:**

  | R | Fleet DB calls before (§7.1b) | After |
  |---|---|---|
  | 3 | 327 | **129** |
  | 5 | 398 | **149** |

  The first replica makes 109 + 4 calls; each other replica makes 10 + 2 (the metadata and user
  cache that load before `StartupManager`) and writes those 31 slots itself.
- **Not improved:** message volume. The waiting replicas are already subscribed (N1), so they
  receive every slot the first replica publishes: 367 MB fleet-wide at R=5, against 271 MB before.
  The waiters hold no engine data yet, so each message is only parsed and dropped. Avoiding this
  needs a wire format whose envelope can be read without parsing the payload (F1). Not built.
- **Pins:** `registerForStartup.warmupLease.test.ts` (7); the Redis lease integration test
  (release only by the holder).

**Tests (this section).**

| Suite | Passed | Skipped |
|---|---|---|
| MJCore | 2,691 | 0 |
| GenericDatabaseProvider | 1,105 | 5 |
| SQLServerDataProvider | 188 | 0 |
| PostgreSQLDataProvider | 218 | 7 |
| MJServer | 1,345 | 56 |
| RedisProvider (with Redis) | 95 | 0 |
| testing-integration | 71 | 0 |
| integration-test-suite | 281 | 0 |
| Vector sync | 70 | 0 |
| BaseAIEngine | 229 | 0 |
| MJCLI | 880 | 0 |

**Deterministic tier, SQL Server, full coverage.**
- Setup: a private MJAPI on port 14100 with a private Redis on 16390, so the client-transport
  bundles run; `RUN_MUTATION_TESTS=1`.
- Result: **76 passed, 1 failed, 1 skipped** of 78.
  - The failure was IT74 TX12/TX16. The MJAPI's own task-graph dispatcher raced the bundle, as the
    check itself reports. With `MJ_DISABLE_TASK_GRAPH_DISPATCHER=1` on that MJAPI, IT74 passes
    27/27.
  - The skip is IT52 (`RUN_SEARCH_TESTS` not set).
- Without an MJAPI the tier reports 51 passed / 27 skipped, the skips being the client-transport
  bundles. The port-4000 server on this machine belongs to another project and was not used.

### Phase 5 — done (engine-filled arrays → related-record collections; idempotency checks)

**Migrated.** These are declared in `metadata/entities/.related-record-collections.json` as
`Source: 'cache'`, `Load: 'lazy'` (read-only by default), pushed to `mj_test_2` and to the private
PostgreSQL database, and emitted by `mj codegen --skipdb`. The only regenerated change is the four
declarations in `MJCoreEntities/src/generated/entities/__mj.ts`, +104 lines.

| Parent → child | Was | Now |
|---|---|---|
| AI Models → AI Model Vendors (`ModelID`) | `MJAIModelEntityExtended.ModelVendors` array, filled in `AIEngineBase.AdditionalLoading` | `model.ModelVendors` collection |
| AI Prompt Categories → AI Prompts (`CategoryID`) | `MJAIPromptCategoryEntityExtended.Prompts` array, same loop | `category.Prompts` collection |
| AI Agents → AI Agent Notes (`AgentID`) | `MJAIAgentEntityExtended.Notes` array, same loop | `agent.Notes` collection |
| Communication Providers → Provider Message Types (`CommunicationProviderID`) | `MJCommunicationProviderEntityExtended.MessageTypes` get/set, assigned in `CommunicationEngineBase.AdditionalLoading` | `provider.MessageTypes` collection |

**Changes.**
- The getters, the setter and the three AI grouping loops are deleted.
  - `AIEngineBase.AdditionalLoading` now only resets its memoized indexes.
  - `CommunicationEngineBase` no longer overrides `AdditionalLoading`, so its entity configs now
    update in place on save and delete instead of reloading.
- `AIEngineBase.GetDerivedStateCensus` counts through the collections. A collection whose engine is
  not loaded (`IsAvailable` false) counts 0 instead of throwing.
- Callers use `Items`:
  - `AIPromptRunner`, 14 sites;
  - `ExecutionPlanner`, `base-agent`, `generate-image.action`;
  - `send-single-message.action`, `ng-entity-communications` `preview.component`;
  - `communication.checks`, the fleet rig.

  The inventory was done before the change: every production read was server-side on
  engine-held parents, except the Angular preview component. No Angular template read these
  properties.
- Test doubles were updated:
  - `UnitTesting`'s `FxModel.ModelVendors` is now a collection-shaped `FxRelatedRecords`;
  - the native-tools and prefill tests;
  - the BaseAIEngine and Communication mocks.
- **CA3 rewritten.** It used to splice `model.ModelVendors` to simulate the 5.51.3 loss. That
  cannot happen any more: the view is read-only and there is no held copy to lose. CA3 now asserts:
  - the view holds the engine's own instances and is read-only;
  - after a forced reload it shows the reloaded instances, and the census and identity hashes are
    unchanged.
- **Behaviour change.** Reading a lazy collection before its engine has loaded throws; the old
  arrays silently returned `[]`. Every production caller runs after the engine is configured.
  Display code should check `IsAvailable`.
- **Downstream repositories.** SaaS (`entities-server/src/email-utils.ts`, 2 sites) and AskSkip
  (`Resolvers/src/email_notifications/util.ts`) call `provider.MessageTypes.find(...)` and need
  `.Items.find(...)` when they take this release. Skip-Brain has no use of the four properties.

**Not migrated.** `TemplateEngineBase` loads templates as a dataset, and a cache-sourced collection
can only find rows in entity configs (`BaseEngineRegistry.FindCachedEntity`). `template.Content` and
`template.Params` therefore stay hand-associated. The O(T×C) filter is replaced by one grouping
pass; each template still gets a new array on every run, so the rebuild stays idempotent. Moving
the template engine to entity configs would also bring template edits under cross-server
propagation (datasets publish nothing on MJAPI). That is a separate change.

**Idempotency checks.**
- `BaseEngine.VerifyDerivedStateIdempotent()` runs `AdditionalLoading` twice in the rebuild queue
  and compares census fingerprints (row counts, identity hashes and derived counts).
- `BaseEngine.VerifyDerivedStateOnRebuild` (static, default off) makes every `RebuildDerivedState`
  do the extra run and `LogError` naming a drifting engine.
  - §10 asked for this outside production by default. It is opt-in instead, because some overrides
    do I/O on every run (DocumentationEngine issues an HTTP call per item), and MJCore cannot read
    the environment in the browser.
- IT96 **CA6** runs the check on every loaded engine and fails if any engine's second run changes
  anything.
- Pins: `baseEngine.derivedStateIdempotency.test.ts` (3); the Templates rebuild test; the
  BaseAIEngine census and reload tests; the MJCoreEntities type tests for the four collections.

**Found by the integration tier, not by review.** The first full tier run failed IT42:
`providerEntity.MessageTypes.find is not a function`. Two more callers had been missed:
- `Communication/engine/src/Engine.ts`;
- `Communication/entity-comm-server/src/entity-communications.ts`.

The text search had excluded lines mentioning `ProviderMessageTypes`, and both packages still
compiled against the old `dist`. `MJServer/src/resolvers/RunAIPromptResolver.ts` had an
`?? model.ModelVendors ?? []` fallback that only a rebuilt `ai-core-plus` exposed. After fixing
them, every package depending on `ai-core-plus` or `communication-types` (69) was type-checked:
all pass.

**Results.**
- **Deterministic tier, SQL Server, full coverage** (private MJAPI, mutation on): **77 passed,
  0 failed, 1 skipped** (IT52 opt-in).
- IT96 CA1–CA6 pass on SQL Server and PostgreSQL.
- Rig with the collections: 223 / 630 on every replica on both platforms; race 0/10; sweep 1.3–2.3 s;
  burst 1 write per step.
- **Latency.** p50 rose to 48–50 ms on SQL Server, against 36 ms in §7.1b.
  - The machine was under heavy background load for these runs (Spotlight indexing and two system
    analysis daemons, about 140 % CPU; `min` rose from 24 to 31–37 ms in the same way).
  - Phase 5 only removes work from this path: the peer's rebuild no longer regroups anything.
  - Re-measure on a quiet machine before quoting a number.

| Suite | Passed | Skipped |
|---|---|---|
| MJCore | 2,694 | 0 |
| MJCoreEntities (incl. type tests) | 671 | 0 |
| AI CorePlus | 701 | 0 |
| BaseAIEngine | 231 | 0 |
| AI Prompts | 343 | 0 |
| AI Agents | 2,400 | 0 |
| CoreActions | 505 | 0 |
| Communication types / engine / entity-comm-server | 114 / 29 / 8 | 0 |
| Templates base-types | 5 | 0 |
| UnitTesting | 75 | 0 |
| MJServer | 1,345 | 56 |
| GenericDatabaseProvider | 1,105 | 5 |
| integration-test-suite | 281 | 0 |
| Explorer dashboards / conversations / core-entity-forms | 1,753 / 1,349 / 284 | 0 |
| QueryGen / Reranker / AgentManager core / TagEngine | 19 / 74 / 45 / 42 | 0 |

**Remaining work.**
- A `mj sync push` batch in `TransactionManager` (before the CLI gets Redis; measure first).
- Moving the template engine from a dataset to entity configs.
- The browser relay (#4250).
- N7 hazard 1 (measure-gated).
- The message volume of a simultaneous cold start (F1 wire format).
- Merging `origin/next`.

### Phase 5 split out (2026-09-17)

At the owner's request, the breaking part of Phase 5 (the four related-record collections and
their callers) was moved to its own branch so it can be approved separately:
- **Branch and worktree:** `engine-related-record-collections`, worktree
  `../MJ-worktrees/engine-related-record-collections`, cut from `c7a30c7c03`.
- **Its notes:** `plans/engine-related-record-collections.md` in that worktree. They cover what
  moved, how it was verified, and the follow-ups when the two branches meet (the AIEngineBase
  census, IT96 CA3 and the rig census must switch to the collection form).

Stayed on this branch (not breaking):
- `BaseEngine.VerifyDerivedStateIdempotent` / `VerifyDerivedStateOnRebuild` and IT96 CA6;
- the `TemplateEngineBase` single-pass grouping.

On this branch, `AIEngineBase` keeps its grouping loops and the array-based census, and CA3 keeps
its splice-based check.

**Databases.** `mj_test_2` and `MJ_6_1_0_PG_cachearch` had `RelatedRecordCollection` reset to NULL
for the four relationships, so `mj codegen --skipdb` from this clone regenerates nothing (verified).

## 14. CLI cache update: scoped `mj sync push`, tested under load (2026-09-17)

### Owner's questions

1. **Does `mj sync push` wipe the whole cache, or invalidate only what changed?** Until now it wiped.
   It cleared the RunView, dataset and metadata categories after every successful push, even a
   push that changed nothing, and it missed the metadata snapshot, which lives in the `default`
   category. `mj codegen` and `mj migrate` had the same gap. It now invalidates only what changed
   (below). Codegen and migrate still wipe, now including the snapshot.
2. **Is the clear triggered by `REDIS_URL` in the environment?** Yes. `packages/MJCLI/bin/run.js`
   loads the working directory's dotenv file, so a `REDIS_URL` there turns it on as well. It is off
   when `REDIS_URL` is unset, with `--skip-cache-clear`, or with `MJ_SKIP_SHARED_CACHE_CLEAR=1`.
3. **What should the default be?** Recommendation: keep it on by default.
   - Without it, a server holding the pre-change rows never corrects them (#4083).
   - A scoped push that changed nothing now does nothing, so the cost of leaving it on is small.
   - The opt-out already exists (flag and environment variable).
   - The breaking-change risk is limited to fleets that share a Redis. When `REDIS_URL` points at a
     Redis that servers share, clearing is what those servers need.

### What changed

- **`mj sync push`.**
  - An `EntityChangeCollector` in the CLI records the entities saved or deleted while the push
    runs, from the `save` / `delete` events `BaseEntity` raises on `MJGlobal`.
  - `ResolveSyncPushScope` turns those into:
    - the entity names;
    - `ClearQueryCache`, when any `MJ: Quer…` definition entity changed;
    - `MetadataChanged`, from `ProviderBase.IsMetadataDatasetEntity`. It is true when the provider
      cannot tell.
  - `InvalidateSharedCacheScope` (RedisProvider) calls
    `RedisLocalStorageProvider.InvalidateIndexGroup` once per entity. That call deletes the
    entity's indexed keys and any unindexed keys found by scan, then publishes one
    `group_invalidated` notice naming the entity.
  - The notice is published even when nothing was stored. A server can hold results that were
    never stored or have expired, and a per-key `removed` notice would not reach those.
  - On the server, `LocalCacheManager.DispatchCacheChange` hands `group_invalidated` to every
    callback whose fingerprint belongs to the entity. MJAPI relays it to browsers as an
    entity-level invalidation.
  - A failed push still invalidates the entities it saved, including when the push throws (the
    first version only handled a failure that returned; fixed after the owner's review). See
    "Sync push is not one transaction" below for why. `--full-cache-clear` keeps the old wipe and,
    after a failure, wipes only if something was saved. A dry run does nothing.
- **Metadata snapshot.** `ClearSharedCacheCategories` takes `IncludeMetadataSnapshot`. The CLI's
  automatic clear and `mj cache clear` without `--category` set it. The snapshot keys are removed
  with the timestamps key last.
- **Servers.**
  - `ProviderBase.IsMetadataChangeNotice` also accepts `removed` of the timestamps key.
  - The check it schedules is delayed by the debounce plus up to
    `PeerMetadataNoticeJitterMs` (2 s) of random delay.
  - After the snapshot is removed, a server that already holds metadata compares it with the
    database instead of assuming it is stale. It reloads only when the database changed.
- **Known limit.** Scoped pushes reach only servers on this release. Older servers ignore
  `group_invalidated`; use `--full-cache-clear` against a mixed fleet.

### Tests

- **Unit tests.**
  - MJCore 2,699 pass (new: `group_invalidated` dispatch, removed-snapshot handling, jitter,
    `IsMetadataDatasetEntity`).
  - MJCLI 889 pass (collector, scope, command wiring: scoped / no change / failed / dry run /
    `--full-cache-clear` / skip).
  - MJServer `sharedCache` 10 pass.
  - RedisProvider 100 pass against a real Redis, including `InvalidateSharedCacheScope`:
    - only the changed entity's keys go, with one notice;
    - an unindexed lowercase key goes too;
    - the notice is sent for an entity with nothing stored;
    - query and snapshot keys go only when asked;
    - it throws when Redis cannot be reached.
- **Why not the deterministic tier.** That tier runs against one MJAPI and has no second server
  or CLI process to observe. The check needs several server processes on one Redis while the
  real `mj` binary runs, so it lives in the fleet rig as phase `cli-ops`:
  ```
  npx tsx packages/TestingFramework/integration-test-suite/rigs/cache-fleet-baseline.ts \
      --replicas=3 --phases=cli-ops --ops=push,push-metadata,migrate,codegen [--mid-boot-ms=3000]
  ```
  - Each replica reads continuously during the command: the engine's rows, a cached RunView, a
    database read that skips the cache, and metadata. Replicas route metadata notices as MJAPI
    does.
  - A fresh replica boots 3 s into the command, and its data is compared with its peers'.
  - The rig reports reader failures, how long after the CLI exits every replica shows the
    change, per-replica engine reloads, rebuilds, database calls, and metadata checks and reloads.

### Results (SQL Server, `mj_test_2`, 3 replicas)

| Command | CLI run | All replicas current | Per replica: engine reloads / rebuilds / DB calls | Metadata checks / reloads | Reader failures | Boot mid-command |
|---|---|---|---|---|---|---|
| `sync push`, 1 AI Model changed (scoped) | 5.2 s | 7 ms after exit | 5 / 1–2 / 1 | 0 / 0 | 0 | OK (388 ms), same data |
| `sync push`, nothing changed | 4.7 s | — | 0 / 0 / 0 | 0 / 0 | 0 | — |
| `sync push --full-cache-clear` | 5.2 s | 145 ms | 149 / 50 / 107 | 1 / 0 | 0 | — |
| `sync push`, `MJ: Entities` row changed (scoped) | 5.8 s | 3.1 s (metadata) | 0 / 0 / 9–17 | 2–3 / 1 | 0 | OK (785 ms), same data |
| same, restored | 5.4 s | 4.4 s | 0 / 0 / 9 | 2 / 1 | 0 | — |
| `migrate` (nothing pending) | 17.6 s | — | 198 / 49 / 107 | 1 / 0 | 0 | OK (359 ms), same data |
| `codegen --skipfiles` (388 entities) | 68.5 s | — | 198 / 49 / 109 | 2 / 0 | 0 | OK (2.7 s), same data |

- **Scoped vs full.** A one-record push costs each server about 1 database call instead of about
  107, and 5 engine reloads instead of 149.
- **No read failures during codegen.** About 2,400 read rounds per replica, including uncached
  database reads, raised no errors during the 68 s codegen run. SQL Server's view regeneration
  did not interrupt readers on this database.
- **Servers booting mid-command** came up and matched their peers each time.
- **The jitter did not stop a metadata herd.** After a scoped metadata push, all three replicas
  reloaded metadata from the database; none adopted a peer's snapshot, so the 0–2 s spread was not
  enough here. It is harmless (about 9 calls each), but it belongs with the "cold-start message
  volume" item.
- **Pre-existing, not fixed.** `ProviderBase.CacheDataset` writes to the `default` category, while
  `GetAndCacheDatasetByName` reads `DatasetCache`, so that dataset cache never hits.
- **Deterministic tier (SQL Server, private MJAPI with Redis):** 76 passed, 1 failed, 1 skipped (IT52,
  opt-in). IT91 failed, and still fails when run alone. Cause: `mj_test_2` has two `UserRole` rows
  for the FLS test user and role.
  - `4A9811EE…` is the ID the fixture file pins.
  - `C87ACBE4…` is a stray copy created at 06:50 UTC, before this work.
  - This is the fixture drift described in `restoreUserRole`, not a cache defect. Deleting the stray
    row should fix it; the owner has not approved that yet.

### Owner review, round 2 (2026-09-17)

**Is the push's cache invalidation batched?**
- **On Redis: yes.** Nothing reaches Redis while the push runs; the CLI has no shared cache. After
  the push ends there is one `InvalidateIndexGroup` per changed entity: one delete of that entity's
  keys and one notice. Each server reloads each affected engine config once, however many records
  changed.
- **In the CLI process: no.** Each save still updates the CLI's own in-memory cache one record at
  a time. `TransactionManager` opens a raw transaction, not an entity-event batch. That cache
  disappears when the command exits, so it does not matter until the CLI gets a Redis provider.

**Sync push is not one transaction (pre-existing; measured).** `PushService` opens a host
transaction, but it covers only deletions (Phase 2) and deferred records (Phase 2.5).
- **Phase 1 writes happen elsewhere.** Creates and updates are saved through `GraphProviderPool`:
  one independent connection per JSON root graph, added in `4456222c8f` to avoid a deadlock. A
  graph is committed when its last dependency level finishes.
- **What a failure rolls back.** A later error rolls back only graphs still open in the same file,
  plus the host transaction.
- **Repro (`mj_test_2`).**
  - One folder, two files: file A changes one AI Model's Description; file B sets another model's
    Name to null.
  - The push failed with "Name cannot be null" and printed "Database transaction rolled back
    successfully".
  - File A's change was still in the database.
  - The JSON file backups were restored, so the files and the database disagreed afterwards.
  - Restored with a clean push.
- **Consequences.**
  - The rollback message is misleading.
  - A failed push can leave the database partly updated.
- **Why the cache step still matters.**
  - Invalidating after a failure is what keeps servers from holding stale rows for the committed
    part.
  - On a push that fully rolled back it only costs reloads, never wrong data: the invalidation runs
    after the rollback and only deletes cache entries, and the servers then reload committed rows.
  - The one extra case: a graph that saved a record and then rolled back still names its entity,
    so that entity is reloaded for nothing.
- **Verified end to end.** The same failing push with `REDIS_URL` set invalidated the committed
  entity and then exited with the error.
- **Not fixed here.** Making the push atomic is a MetadataSync change: one transaction for all
  graphs, or commit graphs only once every file has succeeded. It must keep `4456222c8f`'s
  deadlock fix. The owner has to decide.

**IT91.** The stray `UserRole` row `C87ACBE4…` was deleted with the owner's approval; IT91 passes
again (9 of 9 checks).

**Across entity folders (owner question, measured).**
- **Push.** `directoryOrder: [a-vendors, b-models]` with `autoCreateMissingRecords`. Folder A
  created one AI Vendor and updated another; folder B had an AI Model with a null Name.
- **Result.** The push failed and printed "Database transaction rolled back successfully". Folder
  A's created row and its update both stayed in the database.
- **What the tool promises.** Before starting, the push prints "All operations will occur within a
  transaction and can be rolled back on error". The README says a failed deferred record rolls
  back "the entire push transaction". Only the parallel-push section describes independent
  per-graph connections.
- **Non-throwing record errors.** When a record in folder A failed without throwing (a create
  without auto-create), the same folder's update was still committed, and the push went on to
  folder B.
- **Deletes.** They run only after every create and update succeeded, inside the host
  transaction, so a failed delete should roll back the earlier deletes. This was not measured: the
  referenced vendor's delete always ran first.
- **Cleanup.** The probe vendor (`5960B213…`) was deleted and Alibaba Cloud's description
  restored. Their Record Changes rows remain.

### Owner decision, round 3 (2026-09-17): scoped invalidation withdrawn

Because `mj sync push` is not all-or-nothing (above), the owner withdrew the request for per-entity
invalidation. Until the push is fixed, the safe behaviour is a full clear.
- **What was removed.**
  - The per-entity invalidation (`EntityChangeCollector`, `ResolveSyncPushScope`,
    `InvalidateSharedCacheAfterPush`);
  - `InvalidateSharedCacheScope`, `RedisLocalStorageProvider.InvalidateIndexGroup` and the
    `group_invalidated` action (`LocalCacheManager` dispatch, MJAPI relay);
  - `ProviderBase.IsMetadataDatasetEntity`;
  - the `--full-cache-clear` flag, and the tests for all of these.
- **What stays.**
  - The snapshot removal on full clears (`IncludeMetadataSnapshot`).
  - The server handling of a removed snapshot: the staleness check, with jitter, that reloads only
    when the database changed.
  - The `cli-ops` rig phase.
- **`mj sync push` now clears after every run that is not a dry run.** That includes a push that
  failed, or threw after its rollback; the clear runs before the error propagates. Opt out with
  `--skip-cache-clear` / `MJ_SKIP_SHARED_CACHE_CLEAR=1`.
- **Tests.** MJCore 2,696, RedisProvider 97 (real Redis), MJServer `sharedCache` 9, MJCLI 882.
  A failing push with `REDIS_URL` set cleared the cache ("after mj sync push (failed)") and then
  exited with the error.
- **Rig, 3 replicas, `--ops=push,push-metadata`.**
  - Every push, including one that changed nothing, costs each replica 149 engine reloads and
    about 103–114 database calls.
  - Readers saw no failures.
  - The model change was visible everywhere about 100 ms after the CLI exited.
  - The metadata change took 6.3 s. The replicas adopted the snapshot saved by the replica booted
    mid-command: 1 check each, no reloads.
  - The metadata restore took 4.2 s, with one reload each.
- **Follow-up.** Investigate the non-atomic push in a separate session:
  `plans/metadata-sync-push-atomicity-jumpstart.md`. Once the push is atomic, per-entity
  invalidation can be reconsidered.

## 15. The user cache: process-local state the invalidation architecture could not reach (2026-09-17)

Reported from outside this repo, during Skip's MJ 6.1.2 LTS certification. Not an MJ 6 regression —
the code path is the same in 5.51.3.

### The report, and what the source says

An organization onboarded through Skip's admin UI got a new MJ user and an API key. Skip's API
rejected the key as "invalid or expired" while the database showed it active and correctly bound;
restarting the API made the same key work. The validator
(`SaaS/packages/api-keys/src/BCAPIKeyEngine.ts`) ends with
`UserCache.Instance.Users.find(...)` and returns null when it finds nothing. The user was created at
21:59 by another process, on a server booted at 18:38.

Everything in the report checks out against the source, and three things are worth adding:

1. **`UserCache` had no invalidation path at all.** It is a `BaseSingleton`, not a `BaseEngine`. It
   never entered `BaseEngineRegistry`, so the Phase 3.1 sweeper could not see it; it registered no
   `LocalCacheManager` callback, so no shared-cache event could reach it; and it is loaded with two
   raw `SELECT`s rather than `RunView`, so nothing about it has a cache fingerprint.
2. **Its only self-refresh was off by default.** The interval comes from
   `CheckRefreshIntervalSeconds`, which `SQLServerProviderConfigData` defaults to 0. The
   PostgreSQL provider never refreshes the cache at all — only MJAPI's bootstrap does.
3. **The remaining refresh calls are all local.** Sixteen of them, the telling one being
   `MJServer/src/resolvers/SyncRolesUsersResolver.ts`: the process that creates a user refreshes its
   own copy and nobody else's.

The plan's engine survey (§A) was scoped to `BaseEngine` subclasses, which is why this was invisible
to it. The survey question was "which engines cache entities"; it should have been "what process-local
state is built from the database".

### The severity multiplier: a miss rendered as a negative fact

`Users.find(...) === undefined` means "this process has not loaded that user". The validator read it
as "that user does not exist" and answered "invalid or expired API key" — pointing the customer at
their key rather than at our cache. MJ's own `APIKeyEngine` does not have this bug: it reads the user
with a live `RunView`.

**Position recorded for the architecture** (also added to `guides/CACHING_AND_PUBSUB_GUIDE.md`): a
cache filled from the database must not report absence as non-existence. A hit is an answer; a miss
is a question for the database, bounded so a miss storm cannot become a query storm. Where no
authoritative read is possible, the error must say "could not verify", not "invalid". The same shape
produced `TaskClaimStore.affectedRows() === 0` meaning both "permission denied" and "guard did not
match".

### What was built

`UserCache` keeps its read surface (about twenty packages and two downstream repositories use
`UserCache.Instance.Users`), and gains the wiring:

- **Local writes.** It subscribes to `BaseEntity` save and delete events for `MJ: Users` and
  `MJ: User Roles` and reloads, collecting a burst into one read. The scattered explicit `Refresh`
  calls are now belt-and-braces rather than the mechanism.
- **Other processes.** After reloading for a local write it writes `__MJ_UserCache_Stamp__` to the
  shared store. MJAPI publishes the `default` category as a key-only notice, so each server gets one
  small message and reloads after a short random delay. It hears that notice through
  `LocalCacheManager.RegisterChangeCallback`, which also delivers RunView category clears — so
  `mj sync push` / `mj codegen` / `mj migrate` / `mj cache clear` heal the user cache too.
- **Everything else.** `RefreshIfChangedInDatabase()` compares two row counts and the newest
  `__mj_UpdatedAt` (one `UNION ALL` query) with the database and reloads only on a difference. MJAPI
  runs it on `cacheSettings.userCacheCheckIntervalSeconds` (default 300, 0 disables).
- **`FindUser({ ID | Email })`.** Answers from memory on a hit; on a miss reads the single row,
  caches it, and remembers a genuine absence for `MissRetryIntervalMs` (5 s). MJServer's
  `verifyUserRecord` now uses it, so the JWT path no longer depends on the opt-in
  `updateCacheWhenNotFound`.

**Why not the alternatives.** Making it a `BaseEngine` would change the read surface (engines hold
entity objects, not `UserInfo`) across every consumer, and `BaseEngine` loads through `RunView` with
a `contextUser` — which this cache is what resolves, so the bootstrap would be circular. Retiring it
in favour of an existing engine is not available: no engine caches the user set (`UserInfoEngine`
holds per-user preferences, notifications and favourites).

### Tests

- **Unit** (`GenericDatabaseProvider`, 43 in the user-cache file, 1,118 in the package): local save
  and delete reload and publish; unrelated entities do not; a burst is one reload; a private store
  publishes nothing; a peer notice reloads without echoing; a RunView category clear reloads, other
  categories do not; the staleness check reloads only on a difference; `FindUser` hits memory, loads
  a user created elsewhere, and asks once for a user that does not exist.
- **Multi-process** — a single-process test cannot see this bug, so the fleet rig has a `users`
  phase: `--phases=users` with 3 replicas on one Redis, plus a control pair whose caches are not
  shared.

| | Created → seen by peers | Role granted → seen | Deactivated → seen |
|---|---|---|---|
| SQL Server, shared cache | 1,019 ms | 1,016 ms | 916 ms |
| PostgreSQL, shared cache | 1,016 ms | 913 ms | 812 ms |
| Control (caches not shared) | never | never | never |

  The control is the current production behaviour. On both platforms the authoritative lookup found
  the user even on the replica that never heard the notice, including its deactivated state — that
  is the fallback doing its job. Deactivation propagating is the security-relevant direction: a user
  disabled on one server stops authenticating on the others within about a second.
- **Deterministic tier**: see below.

### Double-scan: process-local database-derived state with no invalidation

Scanned by shape, not by base class. Full classification is in the survey; the items that matter:

| Item | File | Reaches an auth decision | Refresh path today | Miss = negative fact |
|---|---|---|---|---|
| **AuthProviderFactory** | `packages/AuthProviders/src/AuthProviderFactory.ts` | Yes | Startup only; `refreshAuthProviders()` has no production caller | Yes — an unknown issuer is rejected, and a **deleted or disabled provider keeps being accepted** on servers that have not restarted |
| **MCPServer `ScopeService.scopeCache`** | `packages/AI/MCPServer/src/auth/ScopeService.ts` | Yes | 5-minute TTL only | Yes — a scope absent from the snapshot is reported invalid |
| **FileStorageEngine `_driverCache`** | `packages/MJStorage/src/FileStorageEngine.ts` | Credentials | `Config()` / explicit only | No |
| **EncryptionEngine key caches** | `packages/Encryption/src/EncryptionEngine.ts` | Key lifetime | TTL only | No |
| **AgentDataPreloader `_perAgentCache`** | `packages/AI/Agents/src/AgentDataPreloader.ts` | Row-level data | TTL | No — but the key is `AgentID:SourceName` with **no user**, so rows read under one user's permissions are served to another until the TTL expires |
| QueueManager `_queueTypes` | `packages/MJQueue/src/generic/QueueManager.ts` | No | Loaded once, never refreshed | Yes — "Queue Type not found" for a type added after boot |
| EntityDocumentCache `_typeCache` | `packages/AI/Vectors/Sync/src/models/EntityDocumentCache.ts` | No | Load-once | Yes |
| ExternalDataSourceRouter `driverCache` | `packages/ExternalDataSources/Engine/src/ExternalDataSourceRouter.ts` | No | Local entity events; its `remote-invalidate` branch never fires server-side | No |
| TemplateEngineServer, AIEngine `_actions`, SearchEngine `_cache`, RerankerService, MCPClientManager, React component/lint caches, Angular mention cache | various | No | TTL or explicit | No |

Also recorded, because it explains why the gap exists: `remote-invalidate` events are raised **only**
by the browser provider (`GraphQLDataProvider`). Server-side, cross-process freshness comes from
`LocalCacheManager` callbacks and the sweeper, and both require the engine registry or an explicit
callback. Any server-side cache relying on `remote-invalidate` is relying on an event that never
arrives.

**None of these are fixed here.** They are separate changes with their own blast radius; the two
auth-path items and the per-agent cache key are worth their own issues.

### Why the user cache does not load through `RunView` (owner question)

`DatabaseProviderBase` is an `IRunViewProvider`, so `UserCache` could read through the standard path
and inherit its shared-cache invalidation for free. It deliberately does not. Three blockers, from
the source:

1. **Bootstrap: there is no user to read as.** Server-side `RunView` requires a `contextUser` —
   `GenericDatabaseProvider.RunView` calls `CheckUserReadPermissions`, which throws
   `contextUser is null` (`databaseProviderBase.ts:1211`), and `RunView.GetEntityNameFromRunViewParams`
   spells out "server-side callers must pass one". `MJServer/src/index.ts` refreshes this cache at
   line 388 and reads `GetSystemUser()` from it at line 391, which is then what every engine and
   startup task runs as. The cache produces the identity that `RunView` would demand.
2. **The set must be unfiltered, and `RunView`'s is not.** It applies the reading user's entity
   permission, row-level security (`UserExemptFromRowLevelSecurity` exempts only where a role grants
   the operation with no filter) and a field-level projection
   (`buildFieldSecuritySelectList`, `GenericDatabaseProvider.ts:2229`). This cache is process-global
   and answers "who is this?" for every request, so a set scoped to whichever user happened to
   bootstrap is the wrong semantics: add an RLS filter or deny a role read access to `Email` on
   `MJ: Users`, and identity silently breaks for everyone, in the direction of denying valid users —
   the same failure this section exists to remove. On `mj_test_2` today `MJ: Users` has no RLS
   filter and no field permissions, so this is a latent rather than current hazard; it is
   configuration a deployment can change.
3. **It would publish the user table to Redis.** `MJ: Users` and `MJ: User Roles` are both
   `AllowCaching = true`, so a `RunView` load would write every user row — names, emails, employee
   links — into the shared cache, where nothing about users is stored today. That is a deployment
   decision, not a refactor.

The same reasoning rules out `GetRunViewsDatabaseStatus` for the staleness probe: it takes a
`contextUser` and applies RLS to the counts it compares.

**What did change.** The view names now come from metadata (`EntityByName('MJ: Users').BaseView` and
its schema) when metadata is loaded, falling back to the core schema and the conventional names
during bootstrap — so the hand-written part is the two `SELECT`s, not the object names. The
freshness `RunView` would have brought is what the subscriptions in this section provide.

## 16. Review of the implementation against the plan (2026-09-17, by the plan's author)

Reviewed the working tree of `engine-cache-architecture` (54 modified, 34 new files) against §6, §10 and §11,
with five targeted verification passes over the Redis provider, `LocalCacheManager`, `BaseEngine` and the
sweeper, the boot path, and the CLI/checks/rig. Every item below was traced in code; items marked *plausible*
were reasoned from code but not executed.

### 16.1 Verdict

The architecture landed as agreed, the measurements are real, and the record is unusually honest. It is
**not mergeable yet**: three items the record reports as done are not (N5, batch coverage, "every path
rebuilds"), one new mechanism has a fail-open bug that silently disables cross-server invalidation, and the
blanket TTL breaks two ordering invariants the metadata code depends on. All are bounded fixes.

### 16.2 Decision fidelity (§10/§11)

| Decision | Status |
|---|---|
| N1 in `GenericDatabaseProvider`, both platforms, after 2.1 and 1.2 | Honoured. Store installed before metadata load; identity guard in `SetStorageProvider` removes the migration storm. |
| N2 registry never persisted/published on a shared store | Honoured; the `SharedAcrossProcesses` reinterpretation is correct. |
| N3 per-entity sets, lazy pruning, `SCAN` for admin | Honoured as generic index groups. Defects in 16.3 (#2, #11, #18). |
| N4 metadata only | Honoured for the three entities; `BypassCache` on Scheduled Jobs was owner-approved. F13 (`BypassCache` in the vector sync read) is a code change of the same class, fine. |
| **N5 `cacheSettings` applied** | **Not honoured, recorded as done.** `ProviderBase.Config` (`providerBase.ts:4648-4650`) initializes `LocalCacheManager` with no config before `StartupManager` runs, and `Initialize` is a no-op afterwards. Every `cacheSettings` cache knob is still inert on MJAPI; three doc comments say otherwise. `UpdateConfig` exists and has no production caller. |
| N6 census | Honoured. |
| N7 measure first | Honoured: hazard 2 reproduced and fixed with the key lock; hazard 1 not reproduced, not built. **But #3059 was folded into N7 and then dropped under "not reproduced"; #3059 has its own repro and is a different mechanism (a stale fill re-installing after invalidation). Reopen it as its own item.** |
| N8 entity channel | Not built; only the relay filter (RunView events only). Consistent with the E7 gate, but the verification question from §10 (does a resolver save reach its own browsers twice) is still unanswered. Record it as open, not partial. |
| N9 / brief item 1 | Built, then removed by the owner. The transient-failure-recorded-as-permanent risk stays open by decision. |
| N10, `maxUpdatedAt` from rows, Skip on `Config(true)`, PostgreSQL in testing, TTL 1 h, blunt 2.1 | Honoured. TTL scope and 2.1 details in 16.3/16.4. |
| N11 one mechanism | Slot path done; browser listener deferred to #4250 (recorded). **Coverage is narrower than stated:** only `BeginEntityTransaction` opens a batch. Raw `BeginTransaction()` callers open none: `MJServer/src/auth/newUsers.ts:42`, `MagicLinkService.ts`, `SyncRolesUsersResolver.ts` (×3), the 17 generated cascade-delete overrides in `MJCoreEntities/src/generated/entities/__mj.ts`, `IntegrationEngine.ts`, `MetadataSync/transaction-manager.ts`. Those still rewrite and publish per save and still put uncommitted rows in the shared cache. |
| Phase 5 idempotency check "non-production by default" | Reinterpreted as opt-in (`VerifyDerivedStateOnRebuild = false`). Acceptable given it mutates a non-idempotent engine and MJCore cannot read the environment in the browser; CA6 in the tier is the real gate. Docblock should say the check mutates state. |

### 16.3 Defects, ranked

**Must fix before merge**

1. **N5 not applied** (above). Fix: pass `cacheManagerConfig` through `ProviderConfigDataBase` so `ProviderBase.Config` initializes with it, or call `UpdateConfig` from `StartupManager`. Pin with a test that initializes a provider first, as MJAPI does. Also fixes the three false comments (`RegisterForStartup.ts:203`, `index.ts:680`).
2. **Index pruning fails open.** `RedisLocalStorageProvider.filterExistingMembers` (`:859-874`): a `null` or short `pipeline.exec()` reply leaves `alive` empty, then `GetIndexGroupKeys` `SREM`s every live member and returns `[]`. Peers' slots for that entity are never invalidated again until they expire. Fail closed: return all members when the reply is missing or short.
3. **Blanket TTL inverts written-order invariants.** Every category gets 3600 s, including `default`. `_Timestamps` is written after `AllMetadata` so it expires later: a server booting in that window adopts the timestamps, finds no payload, and believes it is current with empty metadata (`providerBase.ts:6160-6167` documents exactly this state as a bug that was fixed). Same for dataset `_date` outliving its blob → `TypeError` in `IsDatasetCacheUpToDate` (`:5702-5712`). Fix: exempt `default` from the provider default (per-category defaults), or give proxy keys a shorter TTL than what they vouch for, and add the `undefined` guard at `:5712`.
4. **Raw transactions open no batch** (16.2, N11). Fix in `GenericDatabaseProvider.BeginTransaction/CommitTransaction/RollbackTransaction` (outermost only), so the entity-scope path and the raw path share one batch. That also makes the CLI's `TransactionManager` batch for free.
5. **An out-of-order scope settle permanently bypasses an entity's cache.** `EntityEventBatchSet.pendingEntities` is a strong map decremented only on `Close`; the detector at `databaseProviderBase.ts:287-297` logs and continues, so `HasPendingChanges` stays true forever and every read misses, every fill is skipped. `ResetTransactionState()` has the same gap. Force-close the batch (invalidate) in both places.
6. **The sweep writes shared slots without the key lock.** `storeConfigRows` → `SetRunViewResult` → bare `SetItem`. A concurrent locked read-modify-write on a peer can be clobbered. Route the sweep write through `maintainSlotLocked` (whole-slot replace under the lock).
7. **User cache refreshes inside the creating transaction.** `UserCache` subscribes to raw entity events; `newUsers.ts` and SaaS's `BCSaaSNewUserHandler` create the user inside a raw `BeginTransaction()`. With RCSI or on PostgreSQL the 250 ms reload runs before commit, misses the user, and the stamp makes peers reload too early; without RCSI the reload blocks on the row lock. `FindUser` covers the auth path, but `Users.find` consumers (the SaaS validator) stay stale until the 300 s check. Fix: deliver user-entity events to the cache from the batch settle (after #4), not from the raw event.
8. **`FindUser` cost under probing.** Each miss runs the single-row users read plus a **full `vwUserRoles` scan** (`LoadUsers` never filters roles), and `_recentMisses` grows without bound per distinct e-mail/ID until the next full refresh. Filter roles by `UserID` on the miss path; cap and prune the miss map.
9. **`cacheSettings.defaultTTLSeconds` becomes a fleet-wide deletion storm once #1 is fixed.** The in-process sweep `Remove`s shared keys by this process's `cachedAt` and publishes `removed` per key; peers reload each engine config. Today dormant only because #1 drops the config. Gate the sweep's TTL branch on `!SharedAcrossProcesses`, or document and reject the value on a shared store.
10. **Status probe brittleness** (`GetRunViewsDatabaseStatus` / `SweepAgainstDatabase`): SQL Server's batch is all-or-nothing (`SQLServerDataProvider.ts:848-853`), so one bad statement fails the whole engine's sweep; the probe SQL always selects `MAX(__mj_UpdatedAt)`, so an entity without the column errors instead of the documented count-only comparison; a NULL timestamp in any held row nulls the census stamp while SQL `MAX` ignores NULLs, so that config reloads every interval forever.

**Should fix before merge**

11. Group set stranded persistent: `ADD_TO_GROUP_SCRIPT` returns early when the set is persistent and has >1 member, so once the persistent member is rewritten or removed the set never expires (`volatile-*` cannot evict it).
12. Lock: `work` outliving `PX 10000` is neither renewed nor detected (silent lost update); the timeout throws a plain `Error` so `maintainSlotLocked` treats a bug inside `fn` as a lock failure and downgrades it to an invalidation. Distinct error type; document the bound.
13. `mj migrate` clears the fleet cache on a zero-migration run (`MigrationsApplied` is logged one line above) and does **not** clear on a failed run that printed partial application; `codegen` also skips on failure. `sync push` clears on failure. One policy: clear when anything was written, including on failure.
14. `mj cache clear` is not a LIGHT command: `light-commands.ts` lists `'cache clear'` but oclif's id is `cache:clear` (verified with `Config.load`), so it pays the full bootstrap; `domain-profiles.ts` says `fast`. Add `'cache:clear'` and a test on the id form.
15. A partially failed clear reports success: `ClearCategory` swallows errors and the CLI's provider has `enableLogging: false`; `KeyCount` is a pre-count; `--category` is unvalidated (a typo is a silent no-op that prints "servers will reload"). Return per-category success; validate against `SHARED_CACHE_WRITE_CATEGORIES`.
16. IT96: CA2 runs the **real** `UserRoutineDispatcherDriver` (it saves routines and can execute them) and CA4 writes rows, both without `RequiresMutation`, in the tier whose contract is "writes no rows"; CA6 leaves engines double-rebuilt with no restore; CA2's zero-delta assertion also passes if RunView caching is off entirely.
17. Real-Redis tests never run in CI (`describe.skipIf(!REDIS_URL)`; no Redis service in the deterministic job). See 16.6.
18. The local fingerprint index is never pruned against the shared group, so every save calls `SMEMBERS` + pipelined `EXISTS` even when nothing changed, and the first save after a TTL wave publishes one `removed` per expired slot the process ever wrote.
19. `MaxUpdatedAtOfRows` does not mirror `extractMaxUpdatedAt`: no `UpdatedAt` fallback column, `undefined` vs `''` for timestamp-less rows, so the two funnels still stamp differently.
20. `SweepAgainstDatabase` and the `OnExternalCacheChange` fallback emit before the rebuild (`LoadSingleEntityConfig:2074`), violating the invariant stated at `:2400`; `RefreshItem` and the expiration timer rebuild nothing, so the comment "every other path that replaces a property does this" is false; "the per-record path applies the same [`readDenied`] rule" is also false.
21. Warm-up lease: released before deferred engines load (they still herd); TTL equals max-wait with no renewal, so a holder slower than 30 s re-forms the herd; `warmupLeaseMs` is not configurable from `mj.config.cjs`.
22. Metadata notice: one resettable debounce timer can starve the check under sustained notices (add a max-age deadline); a notice arriving during a SQL Server transaction is dropped with no re-arm.
23. Guide: no mention of `publishModes`/`defaultPublishMode`, any lease, or the sweeper; the user-cache table says any clear heals it, but only a RunView category clear does (`--category DatasetCache` does not).
24. Stale comments: `localCacheManager.ts:645-651` (MJAPI still "swaps to Redis afterward"), `sharedCache.ts:123` ("everything → Dispatch", but a consumed notice returns first).
25. Rig fidelity: the replica's `clear-shared-cache` omits `IncludeMetadataSnapshot`, so the "what `mj sync push` does" leg measures a weaker clear than shipped. The rig asserts nothing (exit 0 on any result).

### 16.4 The 2.1 reversal

Right call: scoped invalidation cannot be trusted while a push can commit part of its work, and the record
proves it can. Two improvements need no atomicity: skip the clear when the command wrote nothing (a boolean
from the collector that was removed; `mj migrate` already has `MigrationsApplied`), and make the failure
policy uniform across push, codegen and migrate (#13). Once `plans/metadata-sync-push-atomicity-jumpstart.md`
lands, revert to scoped invalidation; the removed `group_invalidated` design was sound and should be the
target there.

### 16.5 §15 (user cache) and the recorded position

The design is right and the reasons for not using `BaseEngine` or `RunView` hold: the bootstrap circularity
is real, and a process-global identity cache must not inherit per-user row and field filtering. "A miss is
not a negative fact" is the correct rule and belongs in the guide. Three things to fix: the pre-commit
refresh (#7), the per-miss roles scan and unbounded miss map (#8), and the downstream note that SaaS's
validator still uses `Users.find` and therefore depends on the notice path rather than `FindUser`. One
inconsistency to record: the guide's "any clear heals it" (#23).

### 16.6 Defaults

- **TTL 1 h**: right for RunView slots; wrong as a blanket over `default` (#3). Per-category defaults, with
  proxy keys shorter than their payloads.
- **Engine sweep 300 s**: fine. One probe batch per engine per fleet per interval.
- **Warm-up lease 30 s**: fine for Skip-sized loads; make it configurable and renew it while loading, or the
  slow cold-DB case re-herds (#21).
- **User-cache check 300 s**: fine.
- **Metadata notice jitter 2 s**: measured insufficient (all three replicas reloaded). Replace jitter with a
  `metadata-refresh` lease like the warm-up turn: the first to notice reloads and saves, the rest adopt the
  snapshot. The mechanism already exists.

### 16.7 What should move from the rig into gated checks

Add a Redis service to the deterministic CI job and a `cache-shared` bundle that skips-as-pass without
`REDIS_URL`. Single-process with a foreign-`SourceServerId` replay (the wire rig's technique) covers: slot
expiry then save → `removed` published (F9); lock timeout → invalidate, never an unlocked write; a foreign
lease holder blocks `TryAcquireLease`; user-cache stamp notice → reload; RunView `category_cleared` →
engine and user-cache reload; slots carry a TTL and the group set prunes; snapshot keys removed with
timestamps last. Run the two RedisProvider integration files in that job. For cross-process behaviour,
give the rig assertions and exit codes and run `boot --stagger`, `race`, `burst`, `users` in the nightly
cross-server job; today six changeset measurements rest on a script that cannot fail.

### 16.8 Record corrections

- §12 2.3: "N5: `cacheSettings` are applied now" — false (#1).
- §12 N11: "IS-A chains and graph saves all get it without changes" — true, but raw `BeginTransaction`
  callers, including user creation, do not (#4).
- `baseEngine.ts:2394` and `:2348` comments — false (#20).
- §11's "#3059 folds into N7" — reopen #3059.
- Open items to add: AuthProviderFactory (auth-path registry, never refreshes), MCP `ScopeService`,
  `AgentDataPreloader` key without user, the N8 verification question, `ProviderBase.CacheDataset`
  category mismatch, and the raw-transaction batch gap.

## 17. Verification of §16 (2026-09-22, by the implementer)

Every §16 claim below was re-derived from source before being accepted. Sixteen were checked: four by
hand, twelve through three parallel source audits. **All sixteen hold.** Three need refinement and two
are larger than §16 states. Nothing here disputes the verdict: the branch is not mergeable as it stands.

### Confirmed as written

§16.3 #1 (N5 inert — `ProviderBase.Config:4650` is the first `Initialize`, both later calls no-op),
#2 (fail-open pruning), #3 (both TTL inversions: metadata timestamps outliving the payload, and
`IsDatasetCacheUpToDate:5712` dereferencing a missing blob), #6 (`storeConfigRows` → `SetRunViewResult`
→ bare `SetItem`, outside the lock), #9 (`runEvictionSweep` → `Remove` → one `removed` publish per key),
#10 (SQL Server batch all-or-nothing at `SQLServerDataProvider.ts:848-853`; a null timestamp on either
side makes `heldRowsMatchDatabase` false forever), #11, #12a, #13, #14, #16, #17, #20 (the sweep's
`LoadSingleConfig:2074` emits with no rebuild), #7, #8, #25.

### Corrections

- **#5's cause is wrong; the real one is more likely.** An out-of-order settle cannot leak
  `pendingEntities`: `Open`/`Close` are depth-balanced and the `settled` flag makes a double settle
  impossible. The leak is a batch **opened and never closed** — `ReleaseIndependentInstance()`
  (`databaseProviderBase.ts:206-214`) settles leftover depth with a raw `RollbackTransaction()` and never
  calls `EndEntityEventBatch`, and MetadataSync's `graph-provider-pool.ts:131-153` does the same. Because
  `batches` is a `WeakMap` and `pendingEntities` a strong `Map`, the count outlives the owner and can
  never be decremented. The consequence §16 describes is exact; the fix is to force-close on release (and
  in `ResetTransactionState`), not only at the out-of-order detector.
- **#1's "three new comments" is one of three.** `index.ts:682-683` (new) asserts the opposite;
  `RegisterForStartup.ts:200-203` (new) is hedged but misleading; `providerBase.ts:4646-4647` is accurate
  and predates the branch (`c8a0fdee0b7`). Field severity is also narrower than it reads: MJServer's
  fallbacks are numerically identical to `DEFAULT_CONFIG`, so only an operator who changes one of the five
  values is affected. §16.8's correction of §12 stands.
- **#12b not confirmed.** `ApplyRowChanges` catches its own inner errors, so the "a bug inside `fn` is
  downgraded to an invalidation" path looks narrower than stated. #12a (no renewal, no ownership check
  after `work()`) is confirmed.

### Larger than stated

- **#4:** 41 production call sites of raw `BeginTransaction()` across 24 files, not the four named
  categories — including `DatabaseProviderBase.MergeRecords`, `AgentRunner`, `IntegrationEngine`,
  four CoreActions, and MetadataSync's own `TransactionManager`. This strengthens §16.3's fix (hook the
  outermost raw begin/commit/rollback) over patching callers.
- **#14:** the space-form id defect is not limited to `cache clear`. `plugin add`, `migrate create`,
  `dev workspace *`, `migrate convert`, `dbdoc *` and `codegen manifest` are all dead entries; the last
  one's own comment says it must be light to break a bootstrap-lite build cycle. Measured 4.4–7.4 s
  against 0.19–0.29 s for a matching entry.

### Why the implementation's own testing missed all of this

The rig measured happy paths and the unit tests pinned intended behaviour. Neither exercised a failure
mode — a null pipeline reply, expiry ordering, a dropped scope. The rig also asserts nothing and exits 0
whatever happens, so six changeset measurements rest on a script that cannot fail. §16.7 is the
structural answer; more manual runs are not.

### Attribution, for sequencing

#10's batch behaviour, #20's emit ordering and #3's dataset-date inversion are pre-existing code. This
branch made the first two load-bearing and its TTL made the third reachable, so they belong to this work
— but they are not regressions it introduced.

**Status (updated 2026-09-27):** group 1 done — see §18. Groups 2–5 outstanding. Proposed sequence: (1) N5,
fail-closed pruning, per-category TTL + the `undefined` guard, gate the TTL sweep on a shared store;
(2) raw-transaction batching, then force-close orphaned batches (#7 depends on it); (3) locked sweep
write, probe robustness, emit-after-rebuild; (4) user cache #7/#8; (5) CLI policy, colon-form ids,
per-category clear results, IT96 gating, Redis in CI + rig assertions, guide fixes. The changeset
measurements touched by (1)–(3) need re-measuring afterwards.

## 18. Fixes, group 1 (2026-09-27)

Owner approved the §17 sequence. This group is the four correctness defects plus the IT96 gate; the
transaction-batching work (group 2) is deliberately not started, and the CI work moved to its own
branch.

### Fixed

- **§16.3 #1 — `cacheSettings` were inert.** `LocalCacheManager.Initialize` now applies a config
  handed to it by a *later* caller (and one passed while an initialization is in flight), because a
  database provider always initializes the manager first, from inside its own `Config()`, with no
  settings. `UpdateConfig` re-arms the eviction sweep instead of only recording the value. MJServer
  calls `Initialize` unconditionally — the `!IsInitialized` guard skipped exactly the case that
  mattered. The misleading comments are corrected.
- **§16.3 #2 — index pruning failed open.** `filterExistingMembers` now keeps every member when the
  pipeline reply is missing or shorter than the batch, instead of treating unanswered members as
  dead and `SREM`-ing live keys out of the index.
- **§16.3 #3 — a blanket TTL inverted two written-order invariants.** New
  `RedisProviderConfig.categoryTTLSeconds`, defaulting to `{ default: 0 }`: the `default` category
  holds proxy keys (the metadata timestamps key, a dataset's `_date`) that are written *after* what
  they vouch for, so under one TTL they outlived it. Two deeper guards, because a cache clear
  produces the same window on purpose: `LoadLocalMetadataFromStorage` only adopts stored timestamps
  when the payload is there to adopt with them, and `IsDatasetCacheUpToDate` returns false instead
  of dereferencing a blob that is gone.
- **§16.3 #9 — a local TTL against a shared store.** `runEvictionSweep` no longer ages entries out by
  this process's clock when the store is shared; it warns once and leaves expiry to the store. Every
  server deleting the same keys on its own schedule, each publishing `removed`, is a fleet-wide
  reload storm for entries Redis already expires.
- **§16.3 #16 — IT96 ran ungated.** CA2 (the real User Routine dispatcher), CA4 (note saves and a
  rollback) and CA5 (failing statements in a transaction) now carry `RequiresMutation`, and the
  bundle opts in with `runMutationTests`. CA1, CA3 and CA6 read only.

### Tests, and the proof they can fail

New: `localCacheManager.configAndSharedTTL.test.ts` (5), `providerBase.expiredSnapshotClaim.test.ts`
(4), and 5 in `RedisLocalStorageProvider.test.ts` (fail-closed pruning ×3, per-category expiry ×2).

Each was run against the un-fixed code to confirm it catches the regression:

| Fix reverted | Result |
|---|---|
| `claimUsable = !!tsRaw && !!raw` → `!!tsRaw` | 1 failed |
| `Initialize` late-config application | 1 failed |
| shared-store TTL guard | 1 failed |
| fail-closed prune guard | 2 failed |

That check is the point: the review's criticism was that the rig cannot fail, so a test that has
never been seen to fail is not evidence.

Suites: MJCore 2,705; RedisProvider 83 (+19 Redis-gated, 102 with a real server); MJServer 1,346;
GenericDatabaseProvider 1,119. All packages rebuilt.

### Still open from §16

Group 2 (raw-transaction batching #4, orphaned batches #5 — note §17's correction of the cause),
group 3 (locked sweep write #6, probe brittleness #10, emit ordering #20), group 4 (user cache #7,
#8), group 5 (#11, #12, #13, #14 and the other space-form ids, #15, #18–#25).

### CI work split out

`engine-cache-ci-gates`, worktree `../MJ-worktrees/engine-cache-ci-gates`, cut from `c7a30c7c03`;
notes in its `plans/engine-cache-ci-gates.md`. Part 1 (a Redis service on the unit-test shards plus
a guard that fails when the gated suites skip) is written there and is independent of this branch.
Parts 2 and 3 (the `cache-shared` bundle, rig assertions, the nightly cross-process job) are
specified but need this branch's code, so they land after it.

## 19. Fixes, groups 2 and 3 (2026-09-27)

### Group 2 — transactions

- **§16.3 #4 — raw transactions opened no batch.** `GenericDatabaseProvider.BeginTransaction` now
  opens the entity-event batch and `Commit`/`Rollback` settle it, so the 41 production call sites
  that use the raw primitive get what `BeginEntityTransaction` already had: one cache write per slot
  on commit, and no uncommitted rows published to the fleet on rollback. A failed commit settles as
  a failure (invalidate, not write). The two levels nest: `BeginEntityTransaction` still opens its
  own, and the batch applies once, at the outermost settle.
- **§16.3 #5 — an abandoned batch bypassed the cache forever.** New
  `LocalCacheManager.AbandonEntityEventBatch`, called from `DatabaseProviderBase.ReleaseIndependentInstance`
  and `GenericDatabaseProvider.ResetTransactionState`. Per §17's correction, the leak comes from a
  batch that is never closed — not an out-of-order settle — and the batch map is weak while the
  pending-entity counts are strong, so the count outlived the owner and every cached read of those
  entities missed for the life of the process. The abandoned batch's entities are invalidated:
  whether its rows reached the database is unknown.

### Group 3 — the sweep and its probe

- **§16.3 #6 — the sweep wrote shared slots unlocked.** New
  `LocalCacheManager.ReplaceRunViewResultLocked`, used by `BaseEngine.storeConfigRows`, so a
  whole-slot replace takes the same cross-process lock the event path uses. An unlocked replace
  could land inside a peer's read-modify-write and publish the losing state to the fleet.
- **§16.3 #10 — the probe was brittle three ways.**
  - `heldRowsMatchDatabase` computes the held stamp with `MaxUpdatedAtOfRows`, which ignores null
    timestamps exactly as SQL `MAX` does, instead of the census stamp, which is null unless every
    row carries one. One un-stamped row used to mean "stale" on every sweep forever — a reload each
    interval that rewrote the shared slot and made every peer reload too. Two sides with no stamp
    agree; one with and one without is a real difference.
  - New `GenericDatabaseProvider.BuildCacheStatusSQL`: the probe selects `MAX(__mj_UpdatedAt)` only
    when the entity has that column, and compares by count alone when it does not, as
    `SweepAgainstDatabase` always documented. A partial `EntityInfo` degrades to count-only rather
    than throwing.
  - SQL Server's batched probe falls back to the per-item path when the batch fails, instead of
    marking every item failed — one bad statement used to blind the sweep for a whole engine.
- **§16.3 #20 — the sweep emitted before the rebuild.** `LoadSingleConfig` /
  `LoadSingleEntityConfig` take `suppressEmit`; the sweep passes it and emits once, after
  `RebuildDerivedState`. Subscribers could otherwise observe a property carrying the previous
  load's derived state.

### Tests

New: `rawTransactionBatching.test.ts` (8, in GenericDatabaseProvider, against a real provider
subclass rather than a depth-counting stub — the reason the old coverage missed this),
`baseEngine.sweepRobustness.test.ts` (6), and 1 in `localCacheManager.entityEventBatch.test.ts` for
a provider that does not inherit `GenericDatabaseProvider`'s reset.

Each verified against the un-fixed code:

| Fix reverted | Result |
|---|---|
| raw `BeginTransaction` opens no batch | 7 failed |
| `ReleaseIndependentInstance` abandon | 1 failed |
| `ResetTransactionState` abandon | 1 failed |
| null-tolerant held stamp | 1 failed |
| locked slot replace | 1 failed |
| emit after rebuild | 1 failed (order was `emit, rebuild, emit`) |

One test-double drift surfaced and was fixed rather than worked around: the probe fixture's
`EntityInfo` carried no `Fields`, which no longer matches what the probe reads.

Suites: MJCore 2,712 · GenericDatabaseProvider 1,127 · SQLServerDataProvider 188 ·
PostgreSQLDataProvider 218 · MetadataSync 382 · MJServer 1,346 · BaseAIEngine 229 · Templates 5.
Deterministic tier after group 2: 77 passed, 0 failed, 1 opt-in skip.

### Remaining from §16

Group 4 (user cache #7 pre-commit refresh, #8 `FindUser` cost) and group 5 (#11 stranded group set,
#12 lock renewal, #13 clear policy, #14 colon-form command ids, #15 per-category clear results,
#18, #19, #21–#25).

## 20. Fixes, groups 4 and 5 (2026-09-27)

### Group 4 — the user cache

- **§16.3 #7 — it reloaded inside the transaction that made the change.** A save raises its event
  while its transaction is still open, and every writer of this cache (new-user creation on first
  login, the magic-link service, SaaS's provisioning handler) saves inside one. The reload read a
  database that did not have the row yet, and the peer notice made every other server reload just as
  early. `scheduleRefresh` now waits for `TransactionDepth` to reach 0, re-arming every
  `TransactionWaitMs` (250 ms) up to `MaxTransactionWaits` (60, so 15 s) — a transaction stuck past
  that is not allowed to hold the cache hostage, and the periodic check is the backstop.
- **§16.3 #8 — `FindUser` was expensive under probing.** A miss loaded the single user row and then
  scanned the whole `vwUserRoles` table; it now filters roles by the loaded user ids. The
  remembered-miss map prunes expired entries and is capped at `MaxRememberedMisses` (500), so a run
  of distinct unknown addresses cannot grow it without limit.

### Group 5 — the long tail (partial)

- **#13 — one clear policy.** `mj migrate` no longer clears the fleet's cache after a run that
  applied nothing, and now does clear when migrations were applied before a failure. That matches
  `mj sync push`: clear whenever something was written, success or not.
- **#14 — six dead LIGHT_COMMANDS entries.** oclif ids are colon-separated whatever `topicSeparator`
  says, so `'cache clear'` never matched and the command paid the full bootstrap (4.4–7.4 s against
  0.19–0.29 s). Every multi-word entry now carries its colon form, `codegen:manifest` included —
  whose own comment says it must be light to break a bootstrap-lite build cycle. New
  `light-commands.ids.test.ts` fails on a space-only entry and on an id oclif does not have.
- **#15 — a failed clear reported success.** New `RedisLocalStorageProvider.ClearCategoryChecked`;
  `SharedCacheCategoryClear` carries `Ok` and `Error`; `mj cache clear` warns per category, exits
  non-zero when any failed, and rejects an unknown `--category` instead of silently doing nothing
  and printing "servers will reload".
- **#11 — an emptied index-group set lingered.** `GetIndexGroupKeys` deletes the set when its last
  member is gone, instead of leaving a persistent empty set that a `volatile-*` policy can never
  evict.
- **#23/#24 — documentation.** The guide's user-cache table said any clear heals it (only a RunView
  category clear does), and the guide never mentioned publish modes, leases or the sweep; both
  fixed, along with the pre-commit wait. Two stale comments corrected
  (`localCacheManager.ts` on MJAPI's swap order, `sharedCache.ts` on "everything → Dispatch").
- **#25 (part) — rig fidelity.** The replica's `clear-shared-cache` passes
  `IncludeMetadataSnapshot: true`, so the rig measures the clear that ships. Assertions and exit
  codes belong to the CI branch.

### Tests

New: 4 in `user-cache.test.ts` (transaction wait ×2, scoped roles read, bounded miss map), 3 in
`light-commands.ids.test.ts`, 4 in `RedisLocalStorageProvider.test.ts` (clear outcome ×2, emptied
group set ×2). Every one verified against the un-fixed code; one weak test (a mock asserting its own
mock) was caught and replaced with a real failure-path test.

Suites: MJCore 2,712 · GenericDatabaseProvider 1,131 · RedisProvider 106 (real Redis) · MJCLI 885 ·
MJServer 1,346 · SQLServerDataProvider 188 · PostgreSQLDataProvider 218 · MetadataSync 382.
Fleet rig `users` phase re-measured after the transaction wait: 1,117 / 812 / 814 ms, control never.

### Still open from §16

#12 (lock renewal and a distinct timeout error type; the missing renewal is confirmed), #18 (the
local fingerprint index is never pruned against the shared group), #19 (`MaxUpdatedAtOfRows` vs
`extractMaxUpdatedAt`), #21 (warm-up lease not configurable, not renewed, released before deferred
engines load), #22 (metadata-notice debounce can starve; a notice dropped during a SQL Server
transaction is not re-armed). Plus CI branch parts 2 and 3, which need this branch merged first.

## 21. Fixes, the last five review items (2026-09-27)

Four fixed, one rejected on evidence.

### #12 — the key lock could be lost silently

`WithKeyLock` never renewed its 10 s lock and never checked it still held it, so work that ran
longer simply lost it: another process took the lock and both wrote — the lost update the lock
exists to prevent. It now renews every 3 s while the work runs (a Lua compare-and-extend, so it can
only extend its own), and raises `KeyLockLostError` if the lock went anyway. A wait that times out
raises `KeyLockTimeoutError`. Both are exported.

`maintainSlotLocked` distinguishes them: a lock problem is contention and is logged as a warning
before invalidating; anything else is a fault in the work itself and is logged as an error rather
than filed under contention. It recognises them by `name`, because the storage provider depends on
MJCore and not the other way round.

### #18 — REJECTED: the local index must not be pruned against the shared group

The review asked for the local fingerprint index to be pruned against the shared group, to stop a
save publishing "one `removed` per expired slot the process ever wrote".

I implemented it, and `localCacheManager.sharedIndex.test.ts` failed: *"invalidates an indexed slot
that expired, so peers holding it in memory reload"*. That test pins plan F9. A slot the group no
longer lists is one that expired **while peers may still hold its rows in memory**, and the next
save's invalidation is exactly what tells them to reload. Pruning first removes the only signal they
would get — the staleness Phase 1 was written to eliminate.

The cost the review objected to is also bounded: invalidating removes the fingerprint from the
index, so each expired slot costs one notice, once, not one per save. What remains true is the
`SMEMBERS` + pipelined `EXISTS` per save on a shared store, which is the price of finding slots
other processes wrote.

Reverted, with the reasoning in the code, and three tests now pin both halves: an expired
fingerprint is kept for the notification, peers' fingerprints are merged in, and an invalidated one
is forgotten so the notice never repeats.

### #19 — two max-stamp helpers disagreed

`ProviderBase.extractMaxUpdatedAt` read `__mj_UpdatedAt` or a legacy `UpdatedAt`;
`LocalCacheManager.MaxUpdatedAtOfRows` read only the first. The same rows therefore got different
slot stamps depending on which funnel wrote them. `MaxUpdatedAtOfRows` now reads the fallback
column, and `extractMaxUpdatedAt` delegates to it, so there is one implementation. Five cases pin
that the two agree, including the legacy column and a null among real stamps.

### #21 — the warm-up lease

Its TTL doubled as the maximum another server would wait for it, so a holder slower than 30 s let
the herd through mid-load. It is now renewed every third of its TTL while engines load (new
`LocalCacheManager.RenewSharedLease` and `RedisLocalStorageProvider.RenewLease`, which extends only
a lease this process holds and never steals one back). MJAPI exposes it as
`cacheSettings.startupWarmupLeaseSeconds` (default 30, 0 disables).

Not changed: the lease is still released before deferred engines load. Deferred engines are
fire-and-forget by design and holding a startup lease across them would delay every other server's
sync load for work that is explicitly background.

### #22 — the metadata notice could starve, or be dropped

The debounce timer was reset by every arriving notice, so a steady stream — a bulk import — could
postpone the check indefinitely. A run of notices now runs the check once
`PeerMetadataNoticeMaxDeferralMs` (15 s) has passed, however they keep arriving. And a check that
came due while the provider was inside a transaction was dropped entirely; it now re-arms, bounded
by the same budget as the member-refresh path.

### Tests

14 in `cacheHardening.reviewRound2.test.ts`, plus 2 real-Redis tests for lock renewal and
lease ownership. Each verified against the un-fixed code:

| Fix reverted | Result |
|---|---|
| unified stamp helper (#19) | 1 failed |
| local index pruning (#18, my wrong version) | pre-existing F9 test failed — the reason it was rejected |
| lock/fault error distinction (#12) | 1 failed |
| notice deferral budget (#22) | 1 failed |
| notice transaction re-arm (#22) | 1 failed |

Suites: MJCore 2,727 · GenericDatabaseProvider 1,131 · RedisProvider 108 (real Redis) · MJServer
1,346 · SQLServerDataProvider 188 · PostgreSQLDataProvider 218 · MJCLI 885 · MetadataSync 382.

### §16 is now closed

Every must-fix and should-fix item is either fixed or, for #18, rejected with evidence. What remains
is the CI branch's parts 2 and 3, which need this branch merged first.

## 22. Final pass on §18–21 (2026-09-29, by the plan's author)

Verified the fixes in code, not from the record: four targeted passes over groups 1, 2–3, 4–5 and §21,
plus direct checks of the batch arithmetic and the user-cache provider question. Of the 25 items,
**19 are confirmed fixed as described, 4 are partial, 1 (#18) is correctly rejected but overstated,
and 1 test in the tree is red.** The passes also found nine new defects, three of them created by the
fixes themselves.

### 22.1 Verdict

Closer, not mergeable. Nothing here reopens the architecture; the remaining items are bounded, and
most are one-function fixes. But two of the fixes are ineffective on MJAPI's main write path, one
introduced a silent permanent degradation on a path the branch itself made reachable, and one test
is failing in the working tree.

### 22.2 Blocking

1. **`check-registry.test.ts` is red.** `EXPECTED_MUTATION_GATED` (`:368-569`) was not updated for
   CA2/CA4/CA5; the integration-test-suite package was not in the §18 suites list. Three-line fix.
2. **User-cache transaction wait watches the wrong provider.** `transactionStillOpen()` reads
   `this._provider.TransactionDepth` (the global provider). MJAPI resolvers write through per-request
   providers (`SyncRolesUsersResolver.ts:95-115`, the generated mutations, transaction groups), so the
   wait never observes the transaction it was built for and the §16.3 #7 failure stands there. Use the
   event's provider (`event.baseEntity.ProviderToUse`, which `BaseEntityEvent` documents as the source
   of truth). The two new tests pass only because one stub plays both providers; add a test with the
   writer on provider B. The guide's "a reload waits for the transaction" now asserts a guarantee the
   code gives only for `Metadata.Provider`.
3. **A batch on an unreleased provider leaks forever.** Group 2 made raw transactions open batches,
   and MJServer's per-request providers are never `Dispose`d or `Release`d (`context.ts:766,780`);
   `Dispose()` on both providers abandons nothing. A raw transaction that escapes without settling
   leaves the batch in the `WeakMap` and the strong `pendingEntities` count at 1 for the process's
   life: every cached read of that entity misses, every fill is skipped, no log line. Before group 2
   this path had no cache consequence. Fix the root: hold the owner via `WeakRef` with a
   `FinalizationRegistry` that abandons on collection, and abandon in `Dispose`.
4. **Unmatched rollback closes an outer batch.** `Open` runs only after `beginTransactionCore`
   succeeds, `Close` runs unconditionally in `RollbackTransaction`'s `finally`. The generated
   cascade-delete shape (`try { Begin; … } catch { Rollback }`) issues a rollback with no matching open
   when a nested begin throws, taking a depth-1 outer batch to 0 and releasing `pendingEntities`.
   The physical outer transaction is rolled back by the same call (pre-existing semantics), so the
   published-uncommitted-rows window is narrower than it looks, but the arithmetic is wrong. Track
   opened levels per provider and settle only levels this provider opened.
5. **Group-set delete race.** `GetIndexGroupKeys` issues an unconditional `DEL` when every observed
   member is dead. A peer's `SADD` between the `EXISTS` pipeline and the `DEL` is lost, and nothing
   ever re-adds it: that slot is never invalidated again until it expires. Do `SREM dead` and
   `SCARD==0 → DEL` in one Lua script.
6. **The automatic post-command clear still reports success over a failed category.**
   `ClearSharedCacheAfterWrite` hardcodes `Ok: true` and never reads `categories[].Ok`, so `mj migrate`
   prints "running servers will reload" after a category failed — the #15 symptom one layer up.
   `mj codegen` still returns early on `!result.success` (#13 named it; §20 dropped it).
7. **#20 is half done.** The sweep path is fixed, but the `OnExternalCacheChange` fallback
   (`baseEngine.ts:2420-2423`) still emits before the rebuild and never after, and `RefreshItem` (also
   the `Expiration` timer callback) still rebuilds nothing. Both are the failure mode #4470 fixed.
8. **The renewed key lock has no maximum hold.** A hung `work()` now renews every 3 s forever; before,
   the 10 s expiry freed it. Peers degrade to always-invalidate for that slot. Cap total hold (60 s is
   ample for a read-modify-write) and stop renewing past it; update the `:865` comment.
9. **The renewed warm-up lease makes the herd worse past 30 s.** Waiter max-wait is still
   `= TTL = 30 s`. Before, the lease expired and one waiter took it. Now the holder keeps renewing, so
   every waiter gives up at the same instant and all load at once with no lease to serialise behind.
   Waiters should wait while the lease key exists (bounded by, say, 5× TTL), not for a fixed 30 s.
10. **`storeConfigRows` is a third stamp funnel with the clock fallback** (`baseEngine.ts:2624`:
    `?? new Date().toISOString()`), the exact value `extractMaxUpdatedAt`'s comment forbids. Use `''`.
11. **`SetRunQueryResult` drops the external data source's TTL** (`localCacheManager.ts:3276` passes
    no write options). Under `sharedCacheTTLSeconds: 0` such keys never expire on Redis and only the
    local `expiresAt` sweep reclaims them: the #9 pattern, for query results. Forward `ttlMs` as the
    RunView path does (`:2558`).

### 22.3 Should fix before merge

- **#18 (F9) is best-effort, not a guarantee — and there is a deterministic signal available.** A cache
  hit never adds a fingerprint to the local index (verified: `addToEntityIndex` is called only from
  fills, shared-group reads and the swap migration), and the registry is not loaded on a shared store.
  So a server that booted warm (N1) holds an engine's rows but has an empty local index for them.
  After the slot expires: if that server saves, nothing is published and every peer stays stale until
  the sweep. The rejection of pruning is right (pruning only removes signal), but §21's "the next
  save's invalidation is exactly what tells them to reload" holds only when the saver is the filler.
  The right source is `_changeCallbacks`: every server's engines register the fingerprints they hold,
  so on a save for entity X, union in the registered fingerprints for X (same prefix parse as the
  index). A registered fingerprint whose slot is gone → invalidate → `removed` → all peers reload,
  regardless of who filled it. In-memory, cheap, deterministic. Add a test: empty local index,
  registered callback, missing slot, save → `removed` published.
- `providerBase.ts:4684` still says later `Initialize` calls are no-ops.
- `categoryTTLSeconds` replaces rather than merges `{ default: 0 }`; a host setting any other category
  silently reinstates #3. Merge.
- CA6 still restores nothing after running `AdditionalLoading` twice on every loaded engine.
- `publishToPeers` is clobbered when a peer notice arrives during a local change's wait (window now up
  to 15 s): the local write is never announced.
- `--category runviewcache` passes case-insensitive validation, then scans `mj:runviewcache:*` and
  reports success. Normalise to the canonical name.
- `mj migrate` throw path and empty-`Details` failure still never clear.
- `stillHoldsLock` returns true on a read error, correlated with the failure it detects.
- `expiresAt` entries are still swept locally on a shared store (each server publishes `removed` for
  expired external slots on its own clock); narrow but the same shape as #9.
- `default` category now never expires and grows with every distinct dataset filter set
  (`GetDatasetCacheKey`), with `CacheDataset` writing `default` while `GetAndCacheDatasetByName` reads
  `DatasetCache` (pre-existing, recorded in §14, still open). Fix the category mismatch and cap or
  expire dataset keys.
- Docs: new guide heading missing from the TOC; lease renewal and the deferred-engine release
  undocumented; `light-commands.ids.test.ts` comment claims topic-prefix matching the hook does not
  do, and the manifest half of the test silently passes on a tree without `oclif.manifest.json`;
  §21 says 14 tests (11 `it`, 15 cases); `_peerMetadataNoticeRetries` not reset on the success path;
  the 15 s deferral budget resets before the transaction branch so the count budget is the real bound.

### 22.4 Answers

**Verdict change.** No. Still not mergeable; the list above is what remains, and it is shorter and
smaller than §16's.

**#18.** The rejection is right and the test that failed is correct for its scenario. The framing is
wrong: F9 is not eliminated, it is best-effort with the sweep as the real backstop. The callback-
registry union above makes it deterministic and should replace the debate.

**Raw-transaction hook level.** Right level, and the verification confirms the arithmetic nests
correctly with `BeginEntityTransaction`, over-invalidates safely on savepoint rollback, and gates
nothing for `ExecuteSQL`-only transactions (`install-orchestrator`'s long teardown costs nothing).
Two corrections needed (22.2 #3, #4). One refinement for later: the read guard is per-entity,
process-global, so a request-scoped transaction makes every concurrent request in the process miss
for those entities; scoping it to the owning provider (PreRunView has `this`) is a follow-up, not a
blocker. Record explicitly that engines still apply local events eagerly, so a rolled-back raw
transaction leaves phantom rows in the local engine arrays of the 41 sites too (pre-existing shape,
newly wider).

**Defaults.** Lock renewal 3 s / 10 s TTL: fine, add a max hold. Warm-up renewal at TTL/3: fine,
but the waiter must not have a fixed deadline equal to the TTL (22.2 #9). Notice deferral 15 s:
fine. User-cache wait 250 ms × 60: fine once it watches the writer's provider. Misses capped at 500:
fine.

**CI part 1.** Before this branch merges. It is independent, and without it every real-Redis test
that pins these fixes is `describe.skipIf`-skipped in CI, so the branch would merge with its own
regression net switched off.

**Deferred-engine release.** Agree with not holding the warm-up lease across deferred engines.

## 23. Response to §22 (2026-09-29)

Nine blocking items. Eight fixed; one is a disagreement, recorded below. Every claim was re-derived
from source before being accepted — two parallel audits plus direct reading — and two came back
larger or differently caused than stated.

### Fixed

- **The red test was mine.** `check-registry.test.ts` pins the mutation-gated set precisely so a
  check cannot start self-skipping unnoticed. Adding `RequiresMutation` to CA2/CA4/CA5 drifted it,
  and I did not run that package. Snapshot updated; 169 pass. The under-scoped re-run is the root
  cause, so this round ran every package the branch touches, not just the ones I edited.
- **The user-cache transaction wait watched the wrong provider.** It read the provider the cache was
  configured with — process-wide, depth always 0 — while MJServer resolvers save through a
  per-request instance. The wait therefore never fired where it was built to fire. It now tracks the
  providers that raised the pending changes (`baseEntity.ProviderToUse`) and waits on those. **The
  original test passed only because one stub played both roles**; the new one uses two and fails
  against the old code. The guide asserted the stronger guarantee and is corrected.
- **A batch whose owner is collected releases its pending counts** (`FinalizationRegistry`, keyed on
  the batch not the owner, unregistered on a normal close). Context that matters: the verification
  found **no first-party call site that leaves a begin unsettled** — every one pairs with a commit or
  rollback. So this is latent, reachable by third-party callers, and it is a floor under the
  explicit paths rather than a load-bearing one. It earns its place because the failure is silent,
  process-lifetime and unrepairable: a strong pending count behind a weak batch.
- **The index prune is one Lua script.** Read, test each member, prune the dead, drop an emptied set
  — atomically. Separate round trips let a peer's `SADD` land after the read and be deleted unseen,
  and that slot then had no invalidation hook at all. This also removes the partial-reply class the
  §16.3 #2 guard existed for, so `filterExistingMembers` is gone.
- **The automatic clear no longer hardcodes success** — a category that failed is named, and the
  report says so instead of "servers will reload". **`mj codegen` clears after a failed run too**: it
  applies schema as it goes, so a late failure leaves the database changed. `--skipdb` still clears
  nothing, because it wrote nothing.
- **#20 finished.** The `OnExternalCacheChange` fallback and `RefreshItem` now rebuild before
  emitting. `RefreshItem` is what the expiration timer calls, so a config with an expiry was
  replacing its rows and rebuilding nothing.
- **The key lock has a maximum hold** (60 s), after which renewal stops and it expires as before.
- **The warm-up wait is no longer tied to the lease TTL** (`WarmupWaitLeaseMultiple`, 4×). The
  review's "worse than before" does not hold — the verification showed the same number of concurrent
  loaders with and without renewal — but the real gap was that no waiter ever waited longer than one
  TTL, which is what this fixes.
- **Stamps and TTLs.** `storeConfigRows` no longer substitutes the clock (the third funnel, and the
  one the #19 rationale forbids); `ReplaceRunViewResultLocked` carries the slot's existing expiry;
  `SetRunQueryResult` passes the expiry to the STORE (a peer has no registry entry, so nothing
  bounded it there) and keeps the expiry a rewrite found instead of pushing it forward.

### Disagreement: the unmatched rollback

The mechanism is confirmed: a nested begin whose savepoint fails does leave the caller's catch
issuing a rollback for a level it never opened, and the seventeen generated cascade-delete overrides
are written exactly that way.

The consequence does not follow. That rollback runs while `_transactionDepth` is 1, so it rolls the
**outer** transaction back physically; closing the outer batch as failed is then the correct
response, not a premature one. The second rollback that follows is inert, because
`EntityEventBatchSet.Close` already returns null for an owner with no batch.

A level counter is in place as bookkeeping, and two tests pin the invariant — but **both pass with
the counter removed**, so they are not regression pins and are labelled as such. By the standard
this branch adopted after §16.7, a test that has never been seen to fail is not evidence.

### Still open

The twelve should-fix items in §22.3. And §22's correction to §18 stands: a server that booted warm
holds engine rows with an empty local fingerprint index, so F9's save-time invalidation cannot fire
for it — the sweep is the real backstop, and the `_changeCallbacks` union is the deterministic
signal that would replace the debate. That is a design change, not a fix, and belongs in its own
round.
