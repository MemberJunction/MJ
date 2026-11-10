# MemberJunction Wave 4 Full-System Performance Architecture & Execution Plan

> **Predecessor Waves**:
> - **Wave 1 & Wave 2**: [PR #5728](https://github.com/MemberJunction/MJ/pull/5728), [PR #5729](https://github.com/MemberJunction/MJ/pull/5729), [PR #5809](https://github.com/MemberJunction/MJ/pull/5809) ([`plans/wave-1-and-2-unified-optimization-report.md`](./wave-1-and-2-unified-optimization-report.md))
> - **Wave 3 Foundation**: `#6186` (row-delta pub/sub & narrow projections), `#6271` (IS-A batch hydration), `#6291` / `#6356` (`BaseEngine` PK index), `#6316` (scoped metadata refresh & retry), `#6343` (`Simple` mode), `#6358` (changed-row cache deep-freeze), `#6457` (Round 21 memory-leak audit), `#6474` (delta `spUpdate` & `CompositeFilter`), `#6508` (stored `CodeName` / `FieldCodeName`)
> - **Consolidated Issues Addressed Across Wave 4**: [#3815](https://github.com/MemberJunction/MJ/issues/3815), [#5510](https://github.com/MemberJunction/MJ/issues/5510), [#5713](https://github.com/MemberJunction/MJ/issues/5713), [#6217](https://github.com/MemberJunction/MJ/issues/6217)

---

## 1. Executive Summary

Following Waves 1–3, a full-system audit of `MemberJunction` (and downstream multi-app OpenApp / SaaS workloads) uncovered **emergent cross-layer bottlenecks ("parking brakes")** where isolated optimizations silently cancel each other out at 900+ entity / 500+ package scale, alongside next-horizon opportunities across browser boot, server caching, SQL execution, wire serialization, AI streaming, background scheduling, and monorepo builds.

This Master Plan consolidates **all remaining in-flight performance PRs** and organizes **Wave 4** into a sequence of focused, independently reviewable and revertible pull requests linked back to this plan.

---

## 2. Consolidated In-Flight PRs Wrapped Into Wave 4

To avoid overlapping rebases across `GenericDatabaseProvider`, `MJCore`, `MJServer`, `CodeGenLib`, `AI`, and `Scheduling`, the validated designs and branches below are absorbed directly into the Wave 4 PR sequence (preserving full authorship/branch lineage and issue links):

| Original PR | Branch & Tip SHA | Original Scope | Wave 4 Target Wave & Enhancements |
| :--- | :--- | :--- | :--- |
| **[#5615](https://github.com/MemberJunction/MJ/pull/5615)** *(MarceloT-BC)* | `fix/5510-report-stalls` (`e4aa0c27f6`) | Event-loop stall monitor (`eventLoopStallMonitor.ts`, `/healthcheck` `eventLoopLagMs`), terminal `AgentRunWatchdog` untrack, slim `AgentRunStatusPublisher.OnStreaming` (`678 KB/token -> { ID, ConversationDetailID, Agent }`). Part of `#5510`. | **Wave 4.5 (AI Streaming, Event-Loop & Worker Offload)** — paired with decoupling `AgentRunner` `detail.Save()` before WS progress emit, pipelining initial `_agentRun` INSERT, and collapsing dual 35 ms token coalescers. |
| **[#5616](https://github.com/MemberJunction/MJ/pull/5616)** *(MarceloT-BC)* | `fix/5510-cpu-off-request-loop` (`eb6c10c6a1`) | `@memberjunction/worker-host` (`WorkerThreadHost<TCall, TResult>`) offloading `LocalEmbedding` ONNX inference (`2.6–3.3 s -> 14 ms`) and `WebPageContentAction` HTML/PDF conversion + `pdf-parse` `Uint8Array` offset fix. Closes `#5510`. | **Wave 4.5 (AI Streaming, Event-Loop & Worker Offload)** — paired with `Float32Array` 8× smaller in-memory vector storage and scoped `BaseAIEngine` notes/examples loading. |
| **[#6319](https://github.com/MemberJunction/MJ/pull/6319)** *(bg-BC)* | `fix/perf-06-rls-bound-parameters` (`ad0f7654b6`) | `RowLevelSecurityFilterInfo.MarkupFilterParameterized` + `EntityInfo.GetEffectiveRowFilterWhereClause` binder (`@rls_p<n>` `NVARCHAR(4000)` / `$n`) on `RunView`. Closes `#5713`. | **Wave 4.3 (SQL Plan Cache, Join Elimination & Transactions)** — extended beyond `RunView` to cover `Load()`, `GetRecordDependencies`, `ExtraFilter` `ID IN (...)` parameterization, and save-time `CheckCreateRLS`. |
| **[#6322](https://github.com/MemberJunction/MJ/pull/6322)** *(bg-BC)* | `fix/perf-03-scheduler-wake-when-due` (`2c15d5bd44`) | `BaseScheduledJob.NextWorkDueAt` work gate, exact due-time timer arming, and `UserRoutineScheduleIndex` so idle MJAPI instances let serverless SQL auto-pause. Closes `#6217`. | **Wave 4.5 (AI Streaming, Event-Loop & Worker Offload)** — paired with multi-replica Redis `PubSubEngine` synchronization. |
| **[#6307](https://github.com/MemberJunction/MJ/pull/6307)** *(bg-BC)* | `fix/perf-02-organic-key-round-trips` (`f671eff502`) | 3-read `ConfigEntityIndex` preload + write-only-on-change organic-key config pass in `CodeGenLib` (eliminates ~12,000 Azure SQL RTTs and no-op UPDATEs). Closes `#3815`. | **Wave 4.6 (Monorepo Build, CodeGen & Manifest Acceleration)** — paired with DAG-parallel PostgreSQL `sql_codegen`, cached `@RegisterClass` AST manifests, `peerDependencies` topological sorting, and `turbo.json` `inputs` + `incremental` TypeScript. |

---

## 3. Core Architectural Findings & Wave 4 Solutions

### 3.1 Core Cache, `BaseEngine`, Multi-User & Multi-Replica Architecture
1. **O(1) Module-Scoped `WeakSet` for `deepFreezeCacheValue` (`Wave 4.0`)**:
   - `#6358` introduced a per-call `visited = new WeakSet<object>()` in `packages/MJCore/src/generic/localCacheManager.ts` without short-circuiting on `Object.isFrozen()` so shallowly frozen caller inputs still have their nested children frozen. However, on in-place `InMemoryLocalStorageProvider` upserts (`ApplyRowChanges`), `deepFreezeCacheValue(updatedResults)` re-walks all `9,999` already-deeply-frozen sibling rows and allocates `10,000` `Object.values()` arrays per 1-row write.
   - **Solution**: Maintain a module-scoped `deeplyFrozenCacheObjects = new WeakSet<object>()` populated *after* recursive child freezing completes — preserving 100% of `#6358`'s shallow-freeze safety while making repeat visits strictly `O(1)`.
2. **Server Cache-Widening vs. `#6186` Narrow Projections (`Wave 4.1`)**:
   - In `packages/MJCore/src/generic/providerBase.ts`, `shouldWidenAndPopulateCache` replaces narrow `params.Fields` (`['ID', 'Name']`) with all 30–120 columns of `vw*` on every server cache miss (`AllowCaching !== false`), even for one-off `ExtraFilter` queries, entities with encrypted fields, or result sets exceeding `MaxEntrySizeBytes`.
   - **Solution**: Guard server column widening so narrow filtered/non-cacheable queries execute narrow SQL and benefit from SQL view join elimination.
3. **`UserInfoEngine` Multi-User Reload Storm & `BaseEngine` True `O(Δ)` (`Wave 4.1`)**:
   - On `MJAPI`, `UserInfoEngine` loads 8 user-scoped tables unfiltered across all users and stores a single scalar `_loadedForUserId`, causing concurrent requests for different users to set `forceRefresh = true` (`BypassCache: true`) across all 8 tables.
   - In `BaseEngine` (`packages/MJCore/src/generic/baseEngine.ts`), `primaryKeyOfRow` reads `record[pk.Name]` instead of `row.Get(pk.Name)` (causing fallback `BaseEntity` instances to collide on `'U'` and overwrite index `0`), `indexOf(entity)` runs an `O(N)` scan before the PK index, and `applyExternalRowDeltaSerialized` scans all `N` rows twice instead of using `primaryKeyIndexes`.
4. **Multi-Replica Invalidation & L1 + L2 Redis Hash Architecture (`Wave 4.1` & `Wave 4.4`)**:
   - Fix `originSessionId: null` self-echo in `packages/MJServer/src/index.ts`, stop `packages/MJServer/src/sharedCache.ts` (`relayRunViewChangeToBrowsers`) from turning peer read cache fills (`Action: 'set'`) into whole-entity browser cache wipes, remove the `GetDataResolver` `RecordTokenUse` result retention leak, and index `UserCache` by normalized email (`O(1)` auth lookup).
   - Introduce an in-process frozen Copy-on-Write **L1 cache** in front of `RedisLocalStorageProvider`, store L2 slots as per-row Redis `HASH`es (`HSET`/`HDEL` instead of rewriting 20–40 MB `STRING` blobs per row save), unify cross-replica sequence tracking + all 12 GraphQL `@Subscription` topics over Redis Streams/PubSub, and debounce/offload `SaveLocalMetadataToStorage`.

### 3.2 Frontend Bundle, Production Minification & Zero Idle CPU (`Wave 4.2`)
1. **Eliminate the 50 Hz Closed-Tab Change-Detection Storm**:
   - Call `appRef.detachView(componentRef.hostView)` (and `attachView` on restore) when caching closed tabs in `TabContainerComponent` (`packages/Angular/Explorer/explorer-core`), and replace the Zone-patched `200 ms` `setInterval` (`EffectiveRecord?.Dirty !== undefined`, where `false !== undefined` is always `true`) in `MjRecordFormContainerComponent` (`packages/Angular/Generic/base-forms`) with event-driven / outside-Angular dirty tracking.
   - Defer `<mj-recycle-bin-chip>` `MJ: Record Changes` queries until the parent sub-grid is expanded or hovered, and run `graphql-ws` + incremental block-tail streaming markdown outside `NgZone`.
2. **Restore True Lazy Loading & Enable Production Script Minification**:
   - Remove the 4 static module imports in `ExplorerCoreModule` and `MJExplorerModulesBundle` (`CoreDashboardsModule`, `CoreGeneratedFormsModule`, `ExplorerSettingsModule`, `FileStorageModule`) that currently force lazy feature chunks into the initial bundle, split pre-auth catalog exports in `@memberjunction/ng-auth-services` (and switch `main.ts` off `platformBrowserDynamic`), and defer non-shell `@RegisterForStartup` browser engines.
   - Stamp unmangleable class identifiers in `ClassFactory` / `mj codegen manifest` so `packages/MJExplorer/angular.json` can enable `"optimization": { "scripts": true }` (eliminating `131.99 MB` of unminified JS and `12,760` `ngDevMode` blocks) alongside lazy OpenApp/Form manifest loaders.

### 3.3 Database, SQL Plan Cache, CodeGen & `TransactionGroup` (`Wave 4.3`)
1. **Automatic Base-Table `COUNT(*)` Rewrite & `MaxRows: 1` Fast Path**:
   - In `GenericDatabaseProvider.BuildTotalRowCountSQL`, automatically target `[schema].[BaseTable]` instead of `[schema].[vwBaseView]` whenever `BaseViewGenerated` is true and `WhereSQL` + RLS reference only physical base-table columns (`100×–900×` faster counts on wide views).
   - Auto-enable `SkipTotalRowCount: true` and omit synthetic `ORDER BY [PK]` when `MaxRows === 1` and `AfterKey` is absent; quote `UserViewID` / `UserViewRunID` GUID filters; add `PostgreSQLDataProvider.ExecuteSQLBatch` and batched cache-status `UNION ALL`.
2. **Eliminate `trgUpdate*` Double-Writes, `@ResultChangesTable` Spills & Lock Convoying**:
   - Set `[__mj_UpdatedAt] = GETUTCDATE()` directly inside `spUpdate*` and guard `trgUpdate*` with `IF NOT UPDATE([__mj_UpdatedAt])` (cutting base-table clustered writes and WAL volume by 50%); remove the unused 19-column / 4-LOB `@ResultChangesTable` materialization in `SQLServerDataProvider`.
   - Move external HTTP geocoding (`GeoCodeSyncService`) and Redis distributed cache lock waits *outside* `CommitGroupTransaction()` in `TransactionGroupBase.Submit()` with 2,100-parameter batch chunking.
   - Auto-index polymorphic FK pairs (`EntityField.EntityIDFieldName`, `Name`), join `[__mj].[RecordGeoCode]` base table in generated views, and optimize SQL Server / PostgreSQL hierarchy functions & view join elimination.

### 3.4 Wire Protocol, Microtask Coalescing & GraphQL Schema Diet (`Wave 4.7`)
- Replace the `10 ms` macrotask `setTimeout` coalescer in `ProviderBase` with `queueMicrotask()` and coalesce `RunQuery`, `GetEntityRecordName`, and `BaseEntity.Load`.
- Add Columnar Raw-JSON transport for `RunViews` / `Datasets` (eliminating double `JSON.stringify` / `JSON.parse` and cutting payload bytes by ~52%) plus a pre-compressed `Brotli` + `ETag` metadata bootstrap path.
- Prune unused legacy per-entity GraphQL queries (`Run<E>ViewByID`, `Run<E>ViewByName`, `Run<E>DynamicView`, and unbounded `All<E>s`) and collapse multi-pass `mapSchema` clones at `MJServer` startup.

---

## 4. Quantified Performance & Resource Targets

| Dimension / Workload | Current Baseline | Post-Wave 4 Target | Expected Gain |
| :--- | :--- | :--- | :---: |
| **Explorer Cold Boot -> Interactive** *(50 Mbps, 15 OpenApps)* | `8.5 – 16.0 s` (`112.16 MB` raw / `17.78 MB` gzip JS) | **`0.9 – 1.8 s`** (`<3.5 MB` raw / `<0.9 MB` Brotli) | **~6× – 10× faster / -95% wire JS** |
| **Browser Idle CPU** *(10 open/closed Record Forms)* | `50+` full-app CD ticks/s (`12–28%` CPU) | **`0` idle ticks/s** (`<0.2%` CPU) | **~99% less idle CPU** |
| **Cold Narrow `RunView`** *(`Fields: ['ID', 'Name']`)* | `45 – 350 ms` (widened `SELECT *` + 10 ms sleep) | **`4 – 25 ms`** | **~8× – 15× faster** |
| **Warm `RunView` Hit on Multi-Replica Redis** *(20k rows)* | `90 – 280 ms` (`35–40 MB` TCP `GET` + `JSON.parse`) | **`0.05 – 0.40 ms`** (L1 RAM CoW hit) | **~200× – 500× faster** |
| **Redis East-West Traffic per 1-Row `Save()`** *(20 MB slot)* | `40 MB` (`GET` + `SETEX`) | **`2 – 4 KB`** (`HSET` + `XADD`) | **-99.99% (~10,000×)** |
| **Grid `COUNT(*)` on Wide Views** *(`1M+` rows)* | `1.5 – 36.8 s` | **`15 – 180 ms`** | **~20× – 200× faster** |
| **Single-Row `Save()`** *(Tracked + Redis + Geo)* | `85 – 650 ms` (2× SQL write + sync HTTP Geo) | **`6 – 18 ms`** (1× SQL write, `-50%` WAL) | **~10× – 35× faster** |
| **`MJAPI` Container Cold Start & Steady-State RSS** | `14 – 28 s` boot / `1.6 – 3.8 GB+` RSS | **`4.5 – 9.0 s` boot** / **`0.55 – 1.1 GB` RSS** | **~3× faster boot / -65% RSS** |
| **Warm `turbo build` (Test/Doc or Leaf Edit) & PG CodeGen** | `3.5 – 8.0 min` / `2 – 5 min` PG CodeGen | **`<2 s`** (test/doc), **`25 – 60 s`** (code) / **`15 – 35 s`** PG | **~5× – 100× faster** |

---

## 5. Sequenced Wave 4 PR Execution Checklist

Each Wave PR below is small enough for rigorous review and full CI verification, and links directly back to this Master Plan PR:

- [ ] **Wave 4.0 — In-Memory Cache Deep-Freeze `WeakSet` Fast Path**: Module-scoped `WeakSet` in `LocalCacheManager.deepFreezeCacheValue` preserving `#6358` shallow-freeze guarantees in `O(1)` across repeat upserts.
- [ ] **Wave 4.1 — Core, Engine & Server Parking Brakes**: `ProviderBase` narrow `Fields` widening guard + `queueMicrotask` coalescer, `#6356` `BaseEngine` `row.Get(pk)` + true `O(Δ)` PK delta patch, `UserInfoEngine` server multi-user fix, `MJServer` `OriginSessionID` self-echo + `sharedCache` read-wipe fix + `GetDataResolver` leak fix + `O(1)` `UserCache` email index.
- [ ] **Wave 4.2 — Angular Idle CPU, True Lazy Modules & Production Minification**: `TabContainerComponent` `detachView`, `MjRecordFormContainerComponent` dirty check fix, `<mj-recycle-bin-chip>` lazy count, sever 4 static module leaks in `ExplorerCoreModule`/`MJExplorerModulesBundle`, pre-auth barrel split, `ClassFactory` minification-safe IDs + `angular.json` `scripts: true`, lazy OpenApp/Form manifests, deferred browser startup engines.
- [ ] **Wave 4.3 — SQL Plan Cache, Base-Table `COUNT(*)`, `TransactionGroup` & CodeGen SQL**: Absorbs `#6319` (`#5713`) parameterized RLS + extends to `Load`/`ExtraFilter`/`CheckCreateRLS`; auto Base-Table `COUNT(*)` rewrite; `MaxRows: 1` `SkipTotalRowCount`; `TransactionGroupBase` commit-before-external-I/O + chunking; `spUpdate*` single-write `__mj_UpdatedAt` + drop `@ResultChangesTable`; auto-indexed polymorphic FKs; PG `ExecuteSQLBatch` + view join-elimination fixes.
- [ ] **Wave 4.4 — Two-Tier L1 CoW + L2 Redis Hash Cache & Cluster Streams**: L1 frozen CoW server cache in front of `RedisLocalStorageProvider`, per-row Redis `HASH` (`HSET`/`HDEL`), Redis Stream cluster invalidation sequence + 12-topic Redis `PubSubEngine`, async/debounced `SaveLocalMetadataToStorage`.
- [ ] **Wave 4.5 — AI Streaming, Event-Loop Stall Monitor, Worker Offload & Idle Scheduler**: Absorbs `#5615` + `#5616` (`#5510`) and `#6322` (`#6217`), plus `AgentRunner` decoupled `detail.Save()`, pipelined `_agentRun` INSERT, write-once `AIPromptRun.Messages` deltas, `Float32Array` 8× vector compaction, and `O(1)` outside-Zone streaming markdown.
- [ ] **Wave 4.6 — Monorepo Build, CodeGen & Duplicate `@RegisterClass` Fixes**: Absorbs `#6307` (`#3815`) 3-read organic-key pass, plus `turbo.json` `inputs`, `tsconfig.server.json` `incremental: true`, cached `@RegisterClass` manifest AST with `peerDependencies` topological sort + duplicate-copy priority guard, and DAG-parallel PG `sql_codegen`.
- [ ] **Wave 4.7 — Columnar Wire Transport, Brotli `MJ_Metadata` & GraphQL Schema Diet**: Columnar Raw-JSON `RunViews`/`Datasets`, pre-compressed `Brotli` + `ETag` `MJ_Metadata`, lazy per-request DB providers, and pruning ~75% unused per-entity TypeGraphQL `@Query`s + single-pass schema build.
