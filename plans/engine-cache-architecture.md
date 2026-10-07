# Engine / cache / event-bus architecture — investigation brief and workspace

**Read this first. It is both the briefing and the shared scratchpad for the work.**

You are picking up an investigation into MemberJunction's caching, engine-loading and
cross-process event propagation. One production defect has already been found, fixed and shipped
(5.51.3). That fix closed a hole; it did not address the design weaknesses the investigation
exposed. Your job is to evaluate those weaknesses, argue for or against the proposals recorded
here, propose better ones, and then prove the result with measurements and regression tests.

---

## 1. Objectives, in order

1. **Understand the current architecture.** `BaseEngine`, `LocalCacheManager`, `ProviderBase` /
   `GenericDatabaseProvider`, `RedisLocalStorageProvider`, and `MJGlobal`'s event bus. How a cache
   entry is written, read, invalidated, and propagated; what is in-process versus cross-process.
2. **Take a position on the proposals in §5.** Argue *for or against* each one on the evidence.
   The analysis recorded here is a starting point written under time pressure, not a conclusion —
   it has already been wrong more than once (see §6). Disagreeing with it is a valid outcome.
3. **Brainstorm beyond them.** The proposals came from one incident. A systematic review will
   likely surface better levers.
4. **Produce a plan document** to be discussed and agreed before implementation.
5. **Establish a measured baseline** on the *current* architecture (§4).
6. **Implement the agreed improvements.**
7. **Re-run the same experiments** and compare against baseline. Report real numbers.
8. **Write or update integration tests** that pin the improvements against regression.

The two standing goals behind all of it: **caches become correct again within a bounded, stated
time after going stale**, and **performance**.

### The workload that matters most

Multi-process products that share one Redis — Skip is the reference case: several API replicas plus
a separate MJAPI, all on one database and one Redis keyspace, replicas starting and restarting
independently. That is the most demanding cache-orchestration shape MJ supports. **Correctness
there implies correctness in simpler single-process setups, so bias every experiment toward it.**

---

## 2. What already happened (established, do not re-litigate)

### The shipped defect

`BaseEngine.OnExternalCacheChange` applied a peer's cache payload by replacing the config's
property with newly materialized entity objects, then returned **without calling
`AdditionalLoading`**. Anything a subclass derived from the *previous* objects — grouped child
collections, memoized lookups — still referenced instances the engine had discarded.

For `AIEngineBase` that meant `model.ModelVendors` was empty on every model, so
`createCandidatesForModel` produced nothing and model selection threw *"No suitable model found …
No model-vendor candidates were available"* on every request until the process restarted.

It resisted diagnosis because **every row count stayed identical** (models 204→204, modelVendors
576→576, promptModels 1013→1013). The arrays were complete and correct, Redis was healthy, the
startup census passed, and the state never self-corrected — the config was still marked loaded, so
`EnsureLoaded()`/`Config()` short-circuited. Trigger: any peer warming its cache at startup
republishes every entity config it loads.

**Shipped in 5.51.3** as `849fea1d70` (PR #4470). Four commits:

| Commit | Change |
|---|---|
| `e32943a760` | rebuild derived state after a cache payload — the root cause |
| `eff6a21c51` | drop a redundant-payload skip that proved unsound (see §5, Idea C) |
| `2d2887d203` | serialize derived-state rebuilds; contain their failures |
| `e602886822` | whitespace |

That PR also made `AIEngineBase.AdditionalLoading` idempotent and linear (it previously appended
into each parent's existing collection, which is only correct on a full load) and added
`emitPropertyChange` to the payload path, which had never notified `ObserveProperty` subscribers.

### Propagation model — verified, and load-bearing for everything below

- **`MJGlobal`'s event bus is in-process only.** It is an RxJS `Subject` (`MJGlobal/src/Global.ts:13`).
  It does not cross processes.
- For a **server** replica the *only* cross-process channel is:
  `peer writes cache → RedisLocalStorageProvider.publishChange → subscriber's OnCacheChanged →
  LocalCacheManager.DispatchCacheChange → RegisterChangeCallback(fingerprint) →
  BaseEngine.OnExternalCacheChange`. Servers ignore their own publishes via
  `SourceServerId === ProcessUUID`.
- **`remote-invalidate` BaseEntity events are a GraphQL-client mechanism** — raised by
  `GraphQLDataProvider` (`graphQLDataProvider.ts:3382`) from push notifications. A server on
  `SQLServerDataProvider` has no subscription feeding them, so `applyRemoteRecordData` /
  `applyRemoteDelete` are effectively **dead code on server replicas**. They only ever receive
  whole-property cache payloads.
- **Staleness validation is client-only.** `PreRunViews` gates the rowCount+`maxUpdatedAt` smart
  check on `!this.TrustLocalCacheCompletely`, and database providers override that to `true`
  (`databaseProviderBase.ts:101`). Server-side, a cache hit is returned **verbatim, never validated**.
  The design assumes every writer participates in the event bus.

---

## 3. Environment you have

- **SQL Server** in Docker. **`mj_test_2` is yours** — wipe, migrate, CodeGen, seed, break it
  freely. Do not touch other databases on that server; several belong to live client work.
- **PostgreSQL** in Docker. The suite is authored platform-portable and is *intended* to run on
  both; a PG cell is in scope (see `docs/build-engineering-runbook.md` → "PostgreSQL").
- **Full stack via Docker Compose**, already built for this shape:
  ```bash
  docker compose -f docker/regression/docker-compose.test.yml \
                 -f docker/regression/docker-compose.cross-server.yml \
                 --profile full up -d --wait sqlserver db-setup mjapi mjapi-b
  ```
  That overlay adds a **shared Redis** and a **second MJAPI replica** (`mjapi-b`, host port 14001)
  on the same DB + Redis, with `REDIS_KEY_PREFIX` defaulting to `mj` on both so they share one
  keyspace. There is an existing driver:
  `packages/TestingFramework/integration-test-suite/rigs/cross-server-invalidation-tests.ts`
  (the compose header still cites its old `MJServer/integration-test-scripts/` path — it moved).
  `docker/workbench/docker-compose.yml` also has Redis.
- You may spawn **MJAPI** and **MJExplorer** directly, run **multiple** server processes, stand up
  **Redis**, insert mock data, add migrations, create schemas/tables, and run **CodeGen**.
- Scale past two replicas when the question needs it — the compose overlay is a starting point,
  not a ceiling.

### Tooling that already exists — extend it, do not rebuild it

MJ already carries most of what this work needs. Survey before writing anything new.

**Check bundles** (`packages/TestingFramework/integration-test-suite/src/checks/`) — eight cache
bundles already: `server-cache`, `client-cache`, `dataset-cache`, `runquery-cache`,
`aggregates-cache`, `cache-gauntlet`, `cache-immutability`, `agent-note-cache-types`. Regression
coverage for the improvements belongs **here**, dispatched through `mj test`, not in ad-hoc scripts.

**Rigs** (`packages/TestingFramework/integration-test-suite/rigs/`):
- `cache-payload-materialization-tests.ts` — proves, *off the real Redis wire*, that a cross-server
  payload lands in a `BaseEngine` property as real `BaseEntity` instances. Its own header explains
  the point: the unit suite and the `agent-note-cache-types` bundle both inject a **hand-authored**
  event straight into `OnExternalCacheChange`, so everything upstream — fingerprint, serialization,
  wire shape — is assumed. This rig removes that assumption by replaying real captured bytes with a
  foreign `SourceServerId`. That is the right fidelity bar for anything new.
- `cross-server-invalidation-tests.ts` — drives the two real MJAPI processes from the compose overlay.

**A predecessor harness existed in Skip-Brain and is gone** (never committed, unrecoverable). Do not
try to reconstruct it — it was Skip-shaped, and the rigs above already do its job better. Three
things about it are worth carrying forward as *technique*:

1. **Assert on derived state, not row counts.** The shipped defect was invisible to every
   count-based check; what exposed it was a census that summed `model.ModelVendors` across all
   models (`203 models with vendors attached / 576 total` → `0 / 0` while every array length held).
   Any new check must be able to fail this way.
2. **Let MJ produce the bytes.** Its writer published through `LocalCacheManager.SetRunViewResult`
   — the same call `PostRunViews` makes — so the Redis write and pub/sub event were MJ's, not
   hand-forged. `cache-payload-materialization-tests.ts` already embodies this.
3. **A fast N-process loop is worth having for the experiment phase.** Docker compose bring-up is
   slow for tight iteration. A scratch rig under `rigs/` that starts N in-process replicas against
   one Redis is legitimate for measurement, provided the *findings* graduate into checks.

**Anti-pattern to avoid:** that harness traced by patching `node_modules`. It works in a consuming
repo where you have no source, but here you have the source — instrument behind a verbose flag and
rebuild. Patched `node_modules` is wiped by `npm install`, and it silently produced a mixed build
during this investigation (see the traps below).

### What Skip-Brain is still good for

Reference only — no tooling left there. Worth reading as a real consumer of these APIs:

- `apps/API/src/shared/util.ts` — `handleServerInit` and `assertAIEngineLoaded`. The latter is a
  startup census that fails the process if any AI metadata list is empty; note it **cannot** detect
  derived-state corruption, since every count stays correct. Its comments also record why Skip moved
  to `Config(true)`, which is the decision §7 revisits.
- Skip's production topology is the reference workload: several API replicas plus a separate MJAPI,
  one database, one Redis keyspace, replicas restarting independently.

### Environment traps that already cost this investigation time

- **A port answering is not proof your process owns it.** Check the PID. An earlier session ran a
  whole suite against a different team's MJAPI because `curl` returned 200.
- **Turbo filters environment variables.** `DB_*` exported in a shell do not reach a task spawned
  through turbo; the MJAPI died on `dbDatabase: Required`. Run the package directly, or use the
  documented config path.
- **Rebuilding one package after a branch switch produces a mixed `dist`.** An earlier session
  rebuilt only MJCore/BaseAIEngine after switching branches and ran an entire suite against half
  `next`, half `lts/5` code. Always rebuild with the dependency graph (`--filter=pkg...`).
- **`npm install` ≠ `npm ci`.** The repo declares `packageManager: pnpm`, CI runs `npm ci` from
  `package-lock.json`, and some package builds shell out to `pnpm`. Mismatched installs leave
  workspace packages unlinked (`@memberjunction/NetworkUtils` went missing this way).
- **`mj sync push` writes `lastModified` back into `metadata/**/*.json`.** Restore before committing.
- **Read `.github/workflows/integration.yml` before trying to reproduce a CI failure.** CI runs no
  CodeGen, starts no MJAPI, and does **not** set `RUN_MUTATION_TESTS`. The `bootstrap-clean-db`
  skill does all three — it is for clean-room verification, not for reproducing a CI lane. Using
  the wrong runbook cost this investigation several hours.

---

## 4. Methodology

**Baseline first, on unmodified `next`.** No improvement gets merged on argument alone; it gets
merged on a measured delta against a baseline captured the same way.

Suggested instrumentation targets — refine them, they are not prescriptive:

1. **Boot storm.** R replicas starting simultaneously against one Redis + DB (R = 1, 2, 3, 5).
   Measure: cache events delivered per replica; derived-state rebuilds per replica; time for each
   replica's rebuild queue to drain; total DB queries across the fleet; wall-clock to first
   successful request.
2. **Steady-state propagation latency.** Write on replica A → observe on replica B. Report a
   distribution, not a mean.
3. **Staleness window.** Mutate the DB by a path that does *not* publish (the CLI is one — §5
   item 2), then measure how long each replica serves stale data, and whether it ever recovers
   without a restart.
4. **Convergence.** After a burst, does every replica hold *identical* derived state, and does it
   match a freshly-booted replica? Row counts will not reveal divergence — the shipped defect had
   perfect counts. Compare derived structures.
5. **Cost of the rebuild.** `AdditionalLoading` is O(parents + children) after #4470; confirm, and
   find where it stops being negligible.

**A note on the failure mode to hunt.** The defect that started this was invisible to every
count-based check. Design experiments that can *fail* — assert on derived state and observable
behaviour, not on lengths.

---

## 5. Open items carried forward

Framework-level, in rough priority. Items marked *(measured)* have evidence behind them; the rest
are reasoned.

1. **`BaseEngine` can still load into a permanently-empty state.** Two paths mark a config
   successful while holding nothing, neither self-correcting:
   - `HandleSingleViewResult` → on a failed load it consults `ContextUserCanReadConfigEntity`; a
     `false` answer calls `MarkConfigEmptyLoaded`, recording `{ data: [], loadedSuccessfully: true }`.
     The classifier reads `entityInfo.GetUserPermisions(user).CanRead`, so if roles or entity
     permissions are not fully resolved at that instant, a transient network failure is recorded as
     a permanent denial. `_loaded` stays true and `EnsureLoaded()` short-circuits forever.
   - `CheckPermissionsOrSkipAll` → one denied entity skips **all** configs, marks them
     `loadedSuccessfully: true, permissionDenied: true`, and returns `[]`. Getters then throw
     `PermissionConstrainedError`. Equally permanent.

   Same structural flaw #4470 fixed — a config marked successful while empty. Neither is known to
   have fired in production.

2. **`mj sync push` leaves the Redis cache stale, and a restart does not clear it.** `MetadataSync`
   initialises `LocalCacheManager` via `StartupManager.Startup` but never sets a
   `RedisLocalStorageProvider`, so it writes to an in-memory cache nothing subscribes to. All four
   recovery routes are closed at once: server-side reads never validate (§2); no publisher on the
   bus; entries never expire *(measured: `TTL = -1`)*; and a restart re-reads the same stale entry
   if the server boots with `Config(false)`.

3. **Nothing expires, and nothing is evictable** *(measured)*. No default TTL in
   `LocalCacheManager` — `ttlMs` is opt-in and currently required only for external-data-source
   entities. Production Redis runs `maxmemory-policy: volatile-lru`, which evicts **only keys with
   a TTL**. Since none carry one, the policy can never select a victim; at `maxmemory` Redis
   returns OOM on writes instead of evicting. A default TTL fixes both halves and is the cheapest
   bounded-staleness mechanism available.

4. **Cache-everything-by-default mints unbounded write-only keys** *(measured)*. In one production
   Redis, **9,875 of 10,158 keys (97%)** were one query shape: a scheduler polling
   `MJ: User Routines` with `new Date().toISOString()` embedded in `ExtraFilter`. The fingerprint
   includes the filter, so every poll minted a new permanent key — written once, never readable
   again, never expiring, publishing a pub/sub event on write. The caller never opted in;
   `runViewCacheEligible` gates on `(param.CacheLocal === true || this.TrustLocalCacheCompletely)`
   and servers set the latter, so **`CacheLocal` is irrelevant server-side and every eligible
   RunView is cached**. This class cannot be fixed by auditing callers.

   Memory is not the pressing part (74 bytes each). The live cost is the category index: every
   `SetItem` does `sadd` into `mj:__categories__:RunViewCache` (10,149 members), and
   `GetCategoryKeys` is a plain `smembers` returning every key string — called by
   `resolveFingerprintsForEntity` on entity saves. Available today with no code:
   `AllowCaching = false` on the entity, which `SetRunViewResult` honours as a write gate.

5. **Fingerprint computation is inconsistent about RLS.** `ProviderBase` computes fingerprints
   *with* an `rlsWhereClause`; `BaseEngine` computes them with two arguments and no RLS clause
   (`RegisterCacheChangeCallbacks`, `syncLocalCacheForConfig`). Means a read returning RLS-filtered
   rows could land on the unfiltered system slot. Unexamined.

6. **Cache keys do not separate environments** *(measured)*. Every `RunViewCache` key ends with
   connection prefix `mssql://localhost:1433/` — `InstanceConnectionString` resolves to `localhost`
   regardless of real host or database. A local repro produced a key byte-identical to production's.
   Any process pointed at a shared Redis, behind any SQL Server, writes into that keyspace.

7. **A failed statement can strand a pooled connection.** `runquery-cache.checks.ts:341` runs
   `SELECT FROM nowhere_at_all` as a negative-path fixture; in CI the *next* request on that
   connection — the `MJ_Metadata` dataset batch — failed with
   `Requests can only be made in the LoggedIn state`. Metadata lost every entity, and **73 bundles**
   then failed `createTestRun` with `Cannot read properties of null (reading 'NewRecord')` while the
   suite still reported 69/77, because the loss broke telemetry rather than the checks. Timing-
   sensitive; did not reproduce locally. A failed statement should not strand the connection for
   the next caller.

8. **`LogStatus` output is dropped in production.** `logToConsole` writes non-error output only when
   `GetProductionStatus()` is false. Anything diagnostic routed through `LogStatus` — including the
   restricted-role degradation message in item 1 — is invisible exactly where it is needed.

---

## 6. The proposals, and the case against each

These came out of one incident. **Each has a real objection recorded; treat the objections as
seriously as the proposals.**

### Idea A — a derived-state hook for incremental changes

Give subclasses a way to respond to a *specific* change instead of rebuilding everything.
`AdditionalLoading` receives no information about what changed, so it must rebuild all of it.

Recommended shape — a **separate** method, not an optional parameter on `AdditionalLoading`
(which would give one method two meanings and silently change the contract for all existing
overrides):

```ts
protected async OnDerivedStateInvalidated(
    change: { propertyName: string; kind: 'replaced' | 'record-added' | 'record-updated' | 'record-removed';
              entity?: BaseEntity },
    contextUser?: UserInfo
): Promise<void> {
    await this.AdditionalLoading(contextUser);   // default: correct, if coarse
}
```

**Against:** the performance case is weak — after #4470 made the rebuild linear, 44 cache events
completed all 44 rebuilds in **~100 ms total (~2 ms each)**. Worse, incremental derived state is
*exactly* the bug class this investigation was about: a full rebuild is self-healing by
construction, an incremental path can diverge and stay diverged silently. Any override would need
a verify mode (run both, compare) to be trustworthy.

**And a correction that guts most of its value for the reference workload:** the per-record paths
where the waste supposedly concentrates (`applyRemoteRecordData` / `applyRemoteDelete`) **never fire
on a server replica** — they are GraphQL-client-only (§2). Skip would get nothing from this. It
still matters for Explorer.

### Idea B — periodic staleness reconciliation against the database

Compare cached `rowCount` / `maxUpdatedAt` against the DB on an interval, in batch.

**For:** the machinery already exists and is used only to answer *client* requests.
`getBatchedServerCacheStatus` runs `SELECT COUNT(*), MAX(__mj_UpdatedAt) …` per item, and SQL Server
overrides it to `ExecuteSQLBatch` so N probes cost one round trip. `isCacheCurrent` does the
comparison. The registry already stores `maxUpdatedAt`. Missing pieces: a scheduler and an action.

**Against:** it cannot run over the keyspace — 10,158 keys in production, 97% of them garbage
(item 4). Scope it to engine-owned fingerprints (bounded; `AIEngineBase` declares 42 entity
configs). It needs an owner (N replicas each sweeping is N× load). And it treats the symptom:
teaching the CLI to publish (item 2) is far less code. Its real justification is writers that
*cannot* be enumerated — direct SQL, migrations, other applications.

**Unsettled:** what a stale verdict should *do*. Evicting the key does not help the case this
investigation was about, because the engine's in-memory array is a separate copy. For engine
configs the sweeper likely wants `LoadSingleConfig(config, user, /*bypassCache*/ true)` so derived
state rebuilds too; evict for non-engine entries.

`__mj_UpdatedAt` coverage is fine — external-data-source entities are already excluded explicitly
and TTL-cached instead, and aggregate reads are stamped from the validation SQL. Reuse those
exclusions.

### Idea C — skipping redundant cache payloads *(attempted, reverted — learn from this one)*

A peer warming its cache republishes every config it loads, mostly identical to what the receiver
already holds. Applying one costs an array swap plus a full rebuild.

**It was implemented and reverted** (`eff6a21c51`). It recorded the `rowCount`/`maxUpdatedAt` of the
last payload applied per property and skipped matches — but cleared that identity only on
`OnExternalCacheChange`'s own fallback path. Every other path that reassigns a property
(`Config(true)`/`Load`, `LoadSingleConfig`, `RefreshItem`, `MarkConfigEmptyLoaded`, the remote apply
paths) left it stale, after which an *identical* payload was wrongly skipped. Integration check
`agent-note-cache-types.NC2` caught it.

**The lesson:** remembering *"what did I last apply"* creates an invariant every future assignment
path must maintain — the same cross-path coupling that caused the original defect.

**The better shape:** derive identity from **what is currently held**, not from memory. Compare the
incoming payload's `rowCount`/`maxUpdatedAt` against the live array's row count and maximum
`__mj_UpdatedAt`. Nothing is remembered, so nothing can go stale; it stays correct after a reload,
a permission degradation, or any path nobody has written yet. Cost is one O(n) scan of an array
about to be discarded anyway. Keep the pair — `rowCount` alone misses delete-plus-insert.

---

## 7. Multi-replica behaviour, and the `Config(false)` question

Skip currently boots engines with `Config(true)`, which sets `BypassCache`.
`runViewCacheEligible` gates reads **and** writes on it, so a Skip replica today neither adopts a
payload nor broadcasts one — it is a subscriber that never publishes. The remaining risk is a
cold-start **thundering herd on the database**.

Reverting to `Config(false)` so replicas benefit from the cache is desired, but changes the shape:

- **Boot storm.** R replicas start together, all miss, all read the DB, all write the same slots,
  all publish. Each payload reaches R−1 peers and triggers a rebuild — order R×(R−1)×C events. The
  #4470 serialization bounds concurrency *within* a replica; it does not reduce the event count.
- **Last-write-wins, no versioning.** `SetItem` is a plain `set`, `publishChange` is fire-and-forget
  and unawaited, and pub/sub is at-most-once with no cross-publisher ordering. A slower replica's
  older snapshot can overwrite a newer one, and every peer then adopts it.
- **Stale readers become stale writers.** After a sync push, a replica that boots, reads a stale
  entry and republishes it **re-poisons peers that were holding fresh data**. One stale reader
  becomes a fleet-wide broadcast.

That last point is the strongest argument for sequencing: the revert should wait on items 2 and 3.
**Quantify it rather than assuming** — it is a prediction, not a measurement.

---

## 8. Suggested sequencing (argue with it)

1. `AllowCaching = false` on `MJ: User Routines` and any other polling entity — metadata only,
   available today, stops the write-only keys at source.
2. Default TTL — bounds staleness *and* makes `volatile-lru` able to evict at all.
3. Make the CLI (and any non-server writer) publish invalidation — removes the known cause of item 2.
4. `OnDerivedStateInvalidated` with a safe default — but see the objection in §6.
5. Redundant-payload skip in the self-validating shape (Idea C).
6. Scoped reconciliation sweeper — defence in depth against writers that cannot be enumerated.
7. Revisit `TrustLocalCacheCompletely` last; validating every server read is the most expensive
   option and the least necessary once 1–6 exist.

---

## 9. Working agreement

**This document is the shared workspace.** Append findings, measurements, and decisions as you go;
correct anything here that turns out to be wrong, and say so explicitly rather than quietly editing
— the provenance of a claim matters when the next session inherits it. If it grows unwieldy, split
the plan and the experiment log into siblings under `plans/` and link them from here.

**Model handoff.** Research, critique and planning may run on a lighter model; implementation and
testing may continue in the same conversation or resume in a fresh session on a stronger one. Write
for a reader with **no memory of the conversation that produced a finding** — state the file, the
symbol, and the evidence, not "as we discussed".

**Evidence standard, learned the hard way.** This investigation asserted a confident root cause
**twice** before the third one proved correct, and reported local suite results that were invalid
because the build was half one branch and half another. Before claiming a cause: reproduce it, or
label it explicitly as a hypothesis. Before reporting a test result: verify the binary under test
is what you think it is. Prefer "I could not reproduce this" over a plausible story.

---

## 10. Session log — 2026-09-16 (objectives 1–5 done; 6–8 wait on agreement)

**Read [`engine-cache-architecture-plan.md`](./engine-cache-architecture-plan.md) next.** It holds the
verified architecture (§1), the corrections to this brief (§2), eight new findings (§3), positions
on Ideas A/B/C (§4), ten further levers (§5), the phased plan to agree on (§6), the experiment
design with the measured baseline (§7), and the decisions that need a human (§8).

### Corrections to this document (details and file:line in the plan §2)

- §7: a Skip replica **does** adopt peer payloads and **does** broadcast at boot. `StartupManager`
  loads `AIEngineBase` and initializes `LocalCacheManager` before Skip's `Config(true)`; the swap to
  Redis migrates and publishes every startup-loaded slot. `Config(true)` only stops Skip's own
  engine being seeded from Redis.
- §5 item 6 (connection string): fixed on `next` by `eb962a16ef` (v6.1.0), absent from 5.51.3.
  Measured key shape today: `…|mssql://localhost:1433/mj_test_2`. Skip upgrade item.
- §5 item 3: two TTL knobs already exist (`RedisProviderConfig.defaultTTLSeconds`,
  `cacheSettings.defaultTTLSeconds`) and both are dead; **every `cacheSettings` value is a no-op on
  MJAPI** because `StartupManager` initializes the cache manager with defaults first.
- §5 item 3: a TTL alone leaks the `__categories__` Set (expiry never `srem`s).
- §6 Idea A: no per-record path reaches a server — a one-row save arrives at peers as the whole
  array. Idea C: the writer's `maxUpdatedAt` is wall-clock on the upsert path, so compare rows.
- §3: `AIEngineBase` has 43 + 6 conditional configs, not 42.
- §7 "stale readers become stale writers": measured **not** true of today's ordering for startup
  engines — a fresh boot reads the DB and its swap migration *heals* stale peers (E3c). It is true
  of engines loaded lazily after the swap (E3b), and it becomes true for everything under the
  Redis-before-engines ordering (plan §5 N1). Sequencing in plan §6 follows from this.

### Measured (unmodified `next`, plan §7.1)

Boot storm at R=5: 545 fleet DB calls, ~178 MB of pub/sub payload, up to 319 events and 147 AI
payload applies per replica, all converging to an identical derived-state census. Rebuild after
#4470: p50 0.17 ms, max 1.7 ms. Cross-replica propagation of a save: p50 27 ms (the saver's own
engine lags at 1.5 s because of the debounce). Staleness after a raw-SQL or CLI-shaped write: ∞,
and a server `RunView` serves the stale slot with `ExecutionTime: 0`.

### Environment state left behind

- `mj_test_2` migrated to v6.1.x (66 migrations). No CodeGen, no `mj sync push` run. The one AI
  model the rig edits (`Eleven Labs`, Description) was restored; the notes it created were deleted.
- `dist/` rebuilt from source across the whole graph (it had predated #4470); `pnpm install` was
  needed first to link `@memberjunction/testing-engine` / `unit-testing` into the test suite.
- Scratch rig, **not for merge as-is**: `rigs/cache-fleet-baseline.ts` + `rigs/lib/cache-fleet-replica.ts`.
  Findings that need a regression pin go into `src/checks/` per plan §6.
- Nothing committed; branch is still `next` (implementation needs a feature branch — plan §8.5).
