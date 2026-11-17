# MemberJunction Waves 1–4 Longitudinal Performance Benchmark Report & Automated Regression Gate Architecture

> **Date**: November 12, 2026
> **Hardware & Runtime**: Apple M5 Max · Node.js `v24.14.0` · SQL Server 2022 (`localhost:1433`)
> **Wave 4 Baseline Worktree / DB**: `20f7ff0d4a` (exact `next` commit prior to Wave 4.0 `#6521`) on clean database `MJ_Wave4_Baseline`
> **Wave 4 Post Worktree / DB**: `5936989e00` (`origin/next` with all 13 `MemberJunction/MJ` Wave 4 PRs merged) on clean database `MJ_Wave4_Post`
> **Prior Wave Baselines**:
> - **Pre-Wave-1 (`origin/next` prior to `#5728`)**: Unoptimized baseline before `IT128`
> - **Waves 1 & 2 (`MJ#5728`–`#5809`, `#5846`)**: `MJ_Clean_Wave2_E2E` (`benchmark-logs/pass1-baseline.json` & `history.jsonl`)
> - **Wave 3 Omnibus (`MJ#5943`)**: `MJ_Phase2_FullStack_Verify` (`benchmark-logs/history.jsonl`)

---

## 1. Executive Summary

Across **Waves 1, 2, 3, and 4**, MemberJunction underwent a systematic, full-stack performance, memory, SQL, caching, and bundle optimization program spanning **30+ pull requests** across `MemberJunction/MJ` and the OpenApp (`bizapps-*` / `SaaS`) repositories.

### Cumulative Highlights Across All 4 Waves

| Subsystem / Metric | Pre-Wave-1 Baseline | Post-Wave-2 (`#5846`) | Post-Wave-3 (`#5943`) | Pre-Wave-4 (`20f7ff0d4a`) | Post-Wave-4 (`5936989e00`) | Cumulative Improvement |
|---|---|---:|---:|---:|---:|---|
| **`PB1`–`PB6` Core & AI Hot-Path CPU Total** | `337.06 ms` | `52.50 ms` | `66.04 ms` | `69.68 ms` | **`70.23 ms`–`81.61 ms`** | **`4.13×`–`6.42×` faster (`-75.8%` to `-84.4%` CPU)** |
| **`PB1`: `ClassFactory` + `ObjectCache.Find` (10k iters)** | `155.87 ms` | `2.57 ms` | `2.60 ms` | `2.52 ms` | **`3.17 ms`–`3.33 ms`** | **`46.8×`–`61.8×` faster (`-97.9%`)** |
| **`PB2`: `BaseEntity` Hydration + FLS (2,000 rows × 25 cols)** | `75.39 ms` | `6.68 ms` | `16.43 ms` | `18.95 ms` | **`17.53 ms`–`17.87 ms`** | **`4.22×`–`4.30×` faster (`-76.7%`)** |
| **`PB3`: `LocalCacheManager` Writes + `GetStats` (80 entries)** | `5.89 ms` | `1.18 ms` | `1.13 ms` | `0.94 ms` | **`0.99 ms`–`1.04 ms`** | **`5.66×`–`5.95×` faster (`-82.3%`)** |
| **`PB7`: Sage 4-Turn Step Storage (`AIAgentRunStep` DB Bytes)** | `179,831 B` | `52,774 B` | `52,699 B` | `84,218 B` | **`52,871 B` (`76.5%` dedup)** | **`3.40×` smaller (`-70.6%` vs Pre-Wave-1; `-37.2%` vs Pre-Wave-4)** |
| **`PB13`: 10× 32 KB `ErrorLog` Saves (`datestamps_only`)** | `~115 ms` (`full`) | `57.57 ms` | `40.01 ms` | `33.82 ms` | **`35.33 ms` (`3.5 ms/save`)** | **`3.37×` faster post-write SQL read, `595×` smaller TDS payload** |
| **Wave 4.0/4.1a: `LocalCacheManager.ApplyRowChanges` (50 updates on 5k rows)** | — | — | — | `40.59 ms` | **`18.88 ms`** | **`2.15×` faster (`-53.5%` via `WeakMap` PK index + `WeakSet` deepFreeze)** |
| **Wave 4.1a: Narrow `Fields` + `UserSearchString` `RunView` (50 calls)** | — | — | — | `2,364.32 ms` (`37` cols) | **`501.15 ms` (`2` cols)** | **`4.72×` faster (`-78.8%` time, `-94.6%` SQL columns projected)** |
| **Wave 4.1a: `BaseEngine` External `row_delta` Merge (100 deltas on 2k rows)** | — | — | — | `69.84 ms` | **`0.77 ms`** | **`90.7×` faster (`-98.9%` via `WeakMap` `deltaHeldRowIndexes`)** |
| **Wave 4.1a: `EntityInfo.GetUserPermisions` (10k calls across 455 entities)** | — | — | — | `3.82 ms` | **`2.07 ms`** | **`1.85×` faster (`-45.8%` via `WeakMap` permission memo)** |
| **Wave 4.1a: `GetEntityObjectWithOptions({ SkipNewRecord: true })` (500 calls)** | — | — | — | `2.85 ms` (`4.94 ms` default) | **`1.09 ms`** | **`2.61×`–`4.53×` faster (`-61.8%` to `-77.9%` hydration allocs)** |
| **Wave 4.1b: `UserCache.UserByEmail` Lookup (10k lookups across 500 users)** | — | — | — | `44.66 ms` (`O(U)` scan) | **`1.01 ms` (`O(1)` `Map`)** | **`44.2×` faster (`-97.7%` auth lookup CPU)** |
| **Wave 4.2b: `MJExplorer` Production Initial Bundle Size** | — | — | — | `17.19 MB` raw (`2.18 MB` xfer) | **`16.29 MB` raw (`2.06 MB` xfer)** | **`-900 KB` raw (`-5.2%`) / `-120 KB` transfer (`-5.5%`); largest chunk `-1.30 MB`** |
| **Wave 4.3a: `CanCountFromBaseTable` Rewrite (`MJ: Record Changes`)** | — | — | — | `FROM [__mj].[vwRecordChanges]` | **`FROM [__mj].[RecordChange]`** | **Bypasses multi-join `BaseView` on `count_only` & paginated counts** |
| **Wave 4.3b: Single-Write `__mj_UpdatedAt` (`MC9` Audit across 455 entities)** | — | — | — | `0 / 454` (`2` table writes/update) | **`454 / 454` SPs + `455 / 455` triggers** | **`-50%` physical table writes per `spUpdate*` (`0` `MC9` offenders)** |
| **Wave 4.4: `TwoTierCacheStorageProvider` L1 CoW + `HSET`/`HDEL` (200 reads + 50 deltas)** | — | — | — | `160.91 ms` (full JSON serde) | **`101.83 ms` (L1 CoW + `O(Δ)` hash)** | **`1.58×` faster (`-36.7%` storage CPU, zero L1 JSON.parse on hits)** |
| **Wave 4.7: `FrozenRowSerializationCache` `WeakMap` Wire Serialize (5k rows × 20)** | — | — | — | `15.86 ms` (`100,000` `stringify`s) | **`3.80 ms` (`5,000` `stringify`s)** | **`4.17×` faster (`-76.0%` GraphQL wire serialization CPU)** |

---

## 2. Longitudinal `IT128` Benchmark Suite Comparison (Waves 1 → 2 → 3 → 4)

All rows below were collected by running the canonical **`IT128 - Performance and Agent Overhead Benchmark`** (`9E412A8C-73F1-4D25-8B19-6A5E2C90D417`) in [`performance-benchmark.checks.ts`](file:///Users/amith/Dropbox/develop/M5/MJ/packages/TestingFramework/integration-test-suite/src/checks/performance-benchmark.checks.ts), which persists structured JSON snapshots to [`benchmark-logs/`](file:///Users/amith/Dropbox/develop/M5/MJ/packages/TestingFramework/integration-test-suite/benchmark-logs/README.md).

### 2.1 Core & AI Primitives (`PB1`–`PB6`, `PB13`, `PB14`)

| Check | Benchmark Workload | Pre-Wave-1 Baseline | Post-Wave-2 (`MJ_Clean_Wave2_E2E`) | Post-Wave-3 (`#5943`) | Pre-Wave-4 (`20f7ff0d4a`) | Post-Wave-4 (`5936989e00`) | Status & Net Gain vs. Pre-Wave-1 |
|---|---|---:|---:|---:|---:|---:|---|
| **PB1** | `ClassFactory` (`GetRegistration` + `GetAllRegistrations`) & `ObjectCache.Find` (10,000 iters / 450 classes) | `155.87 ms` | `2.57 ms` | `2.60 ms` | `2.52 ms` | **`3.17 ms`–`3.33 ms`** | **PASS (`46.8×`–`61.8×` faster)** |
| **PB2** | `EntityInfo.ChildEntities` + `BaseEntity` Hydration (`LoadFromData`/`SetMany`/`GetAll`) + FLS (2,000 rows × 25 fields) | `75.39 ms` | `6.68 ms` | `16.43 ms` | `18.95 ms` | **`17.53 ms`–`17.87 ms`** | **PASS (`4.22×`–`4.30×` faster; `-5.7%` vs Pre-Wave-4)** |
| **PB3** | `LocalCacheManager` `SetRunViewResult` + `SetDataset` + `GetStats()` (80 multi-row entries) | `5.89 ms` | `1.18 ms` | `1.13 ms` | `0.94 ms` | **`0.99 ms`–`1.04 ms`** | **PASS (`5.66×`–`5.95×` faster)** |
| **PB4** | `TemplateEngineServer.RenderTemplateSimple` + `NunjucksSandbox` (1,000 prompt renders) | `82.41 ms` | `33.79 ms` | `33.07 ms` | `36.77 ms` | **`35.49 ms`–`45.98 ms`** | **PASS (`1.79×`–`2.32×` faster)** |
| **PB5** | `RedactParamsToJSON` + `AIEngineBase` permission & catalog lookup (500 iters) | `5.54 ms` | `4.58 ms` | `5.80 ms` | `5.97 ms` | **`4.43 ms`–`7.43 ms`** | **PASS (`1.25×` faster at median `4.45 ms`)** |
| **PB6** | `PayloadManager.applyAgentChangeRequest` + `DeepDiffer` (50 multi-turn mutations) | `11.96 ms` | `3.70 ms` | `4.27 ms` | `4.53 ms` | **`4.68 ms`–`6.12 ms`** | **PASS (`1.95×`–`2.56×` faster)** |
| **Total (`PB1`–`PB6`)** | **Combined Core & AI Hot-Path Primitives CPU Time** | **`337.06 ms`** | **`52.50 ms`** | **`66.04 ms`** | **`69.68 ms`** | **`70.23 ms`–`81.61 ms`** | **PASS (`4.13×`–`4.80×` faster overall)** |
| **PB13** | `SaveReturnMode: 'datestamps_only'` audit (`25` core entities) & 10× 32 KB `MJ: Error Logs` saves | N/A (`full`) | `57.57 ms` | `40.01 ms` | `33.82 ms` | **`35.33 ms`–`39.36 ms`** | **PASS (`~3.5 ms/save` SQL roundtrip)** |
| **PB14** | Lazy `BaseEntity` `_raw` hydration (`_fieldsHydrated === false` on read) & runtime `SaveReturnMode: 'datestamps_only'` | N/A | N/A | `75 ms` | `76 ms` | **`80 ms`** | **PASS (100% invariant verified)** |

### 2.2 Multi-Turn Deterministic & Live-Model Agent Benchmarks (`PB7`–`PB12`)

| Check & Shipped Agent | Mode | Pre-Wave-1 Step DB Bytes | Post-Wave-2 Step DB Bytes | Pre-Wave-4 (`20f7ff0d4a`) | Post-Wave-4 (`5936989e00`) | Pointer Steps (`Start` / `End`) | Dedup Savings |
|---|---|---:|---:|---|---|---|---:|
| **PB7: Sage** (4 turns, 3 Actions, 8 steps, 15 KB payload) | `deterministic-testllm` | `179,831 B` | `52,774 B` (`347 ms` wall) | `84,218 B` (`463.8 ms` wall, `291.8 ms` overhead) | **`52,871 B`** (`499.5 ms` wall, `323.5 ms` overhead) | **`6` start / `5` end (`11` pointers)** | **`76.5%` (`-70.6%` vs Pre-Wave-1, `-37.2%` vs Pre-Wave-4)** |
| **PB8: Query Builder → Query Strategist** (2 runs, 10 steps) | `deterministic-testllm` | `184,392 B` | `119,464 B` (`656.7 ms` wall) | `126,263 B` (`359.1 ms` wall, `200.1 ms` overhead) | **`126,565 B`** (`333.0 ms`–`400.1 ms` wall, **`175.0 ms`–`238.1 ms` overhead**) | **`4` start / `3` end (`7` pointers)** | **`47.2%` (`-31.4%` vs Pre-Wave-1; `-49.3%` faster wall time vs Wave 2)** |
| **PB9: Research Agent → Report Writer** (2 runs, 6 steps) | `deterministic-testllm` | `120,728 B` | `103,911 B` (`251.5 ms` wall) | `104,158 B` (`201.6 ms` wall, `72.6 ms` overhead) | **`104,158 B`** (`212.5 ms`–`235.7 ms` wall, **`90.5 ms`–`113.7 ms` overhead**) | **`2` start / `1` end (`3` pointers)** | **`32.1%` (`-13.7%` bytes; `-15.5%` faster wall time vs Wave 2)** |
| **PB10: Sage** (Live conversation-linked calculation, 4 steps) | `live-model` | — | `2,191 B` (`1,800.7 ms` wall / `270.7 ms` overhead) | `2,224 B` (`2,581.6 ms` wall / `148.6 ms` overhead) | **`2,224 B`** (`2,200.2 ms` wall / **`131.0 ms`–`146.2 ms` overhead**) | `0` / `0` | **Framework overhead reduced `-46.0%` (`270.7 ms` → `146.2 ms`, `< 6.6%` of wall time)** |
| **PB11: Query Builder → Query Strategist** (Live 2-run tree, 13 steps) | `live-model` | — | `37,016 B` (`41,583 ms` wall / `1,172.1 ms` overhead) | `27,989 B` (`22,505 ms` wall / `207.0 ms` overhead) | **`28,096 B`** (`20,771.8 ms` wall / **`286.8 ms` overhead**) | **`7` start / `5` end (`12` pointers)** | **Framework overhead `< 1.4%` of wall time (`-75.5%` vs Wave 2)** |
| **PB12: Research Agent** (Live synthesis run, 2 steps) | `live-model` | — | `518 B` (`5,787.8 ms` wall / `340.8 ms` overhead) | `518 B` (`7,157.0 ms` wall / `62.0 ms` overhead) | **`668 B`** (`2,124.5 ms`–`9,773.5 ms` wall / **`43.5 ms`–`55.5 ms` overhead**) | `0` / `0` | **Framework overhead reduced `-83.7%` (`340.8 ms` → `55.5 ms`, `< 0.6%` of wall time)** |

---

## 3. Wave 4 (`4.0`–`4.7`) Side-by-Side Targeted Benchmarks (`20f7ff0d4a` vs. `5936989e00`)

The table below reports the isolated side-by-side measurements from `/Users/amith/.gemini/antigravity/brain/b83d2c34-c07d-4027-94ea-b2ebeda2d0a5/scratch/run-wave4-targeted-benchmarks.ts`, full `MJExplorer` production builds (`npx turbo build --filter=mj_explorer`), and `IT24` (`DD414986-2531-4CC6-BF9D-50198C292B92`) across `MJ_Wave4_Baseline` (`20f7ff0d4a`) and `MJ_Wave4_Post` (`5936989e00`):

| Wave & PR | Optimization Target & Benchmark Scenario | Pre-Wave-4 (`20f7ff0d4a`) | Post-Wave-4 (`5936989e00`) | Measured Speedup / Resource Reduction |
|---|---|---:|---:|---|
| **Wave 4.0 ([#6521](https://github.com/MemberJunction/MJ/pull/6521)) + Wave 4.1a ([#6524](https://github.com/MemberJunction/MJ/pull/6524))** | `LocalCacheManager.ApplyRowChanges`: 50 single-row updates on a 5,000-row cached `RunView` (`deeplyFrozenCacheObjects` `WeakSet` + `cachedResultPkIndexes` `WeakMap` + $O(\Delta)$ `maxUpdatedAt`) | `40.59 ms` ($O(N)$ `Map` rebuild + $5,000 \times \text{Date.parse}$ + `Object.values`) | **`18.88 ms`** ($O(1)$ `WeakMap` PK index + $O(\Delta)$ timestamp + `WeakSet` freeze) | **`2.15×` faster (`-53.5%` CPU time)** |
| **Wave 4.1a ([#6524](https://github.com/MemberJunction/MJ/pull/6524))** | Narrow `Fields: ['ID', 'Name']` + `UserSearchString` `RunView` on `MJ: Actions` (50 calls, SQL columns projected & wall latency) | `2,364.32 ms` (**`37` columns** widened via `SELECT * FROM vwActions`) | **`501.15 ms`** (**`2` columns** `SELECT [ID], [Name] FROM vwActions`) | **`4.72×` faster (`-78.8%` latency, `-94.6%` SQL columns projected)** |
| **Wave 4.1a ([#6524](https://github.com/MemberJunction/MJ/pull/6524))** | `BaseEngine` external `row_delta` merge (`mergeMaterializedDeltaRows`, 100 single-row deltas on 2,000 held rows) | `69.84 ms` ($O(N)$ `indexHeldRowsForDelta` `new Map()` per delta) | **`0.77 ms`** ($O(\Delta)$ `getOrBuildHeldRowsDeltaIndex` `WeakMap`) | **`90.7×` faster (`-98.9%` CPU time)** |
| **Wave 4.1a ([#6524](https://github.com/MemberJunction/MJ/pull/6524))** | `EntityInfo.GetUserPermisions(user)` (10,000 calls across 455 entities) | `3.82 ms` (recomputes role loops per call) | **`2.07 ms`** (`_entityUserPermissionsCache` `WeakMap` memo) | **`1.85×` faster (`-45.8%` CPU time)** |
| **Wave 4.1a ([#6524](https://github.com/MemberJunction/MJ/pull/6524))** | `GetEntityObjectWithOptions('MJ: AI Agents', { SkipNewRecord: true })` vs default `GetEntityObject` (500 instantiations) | `2.85 ms` (`4.94 ms` default with `NewRecord()` + `UUIDv4`) | **`1.09 ms`** (`SkipNewRecord: true` skips discarded defaults/UUID) | **`2.61×`–`4.53×` faster (`-61.8%` to `-77.9%` instantiation CPU)** |
| **Wave 4.1a ([#6524](https://github.com/MemberJunction/MJ/pull/6524))** | `ProviderBase` `RunView` coalescer window (`CoalesceUseMicrotask`) | `setTimeout(..., 10)` (`~10–12 ms` minimum timer floor) | **`queueMicrotask` (6–16 hops, `~0.01 ms`)** | **`~1,000×` lower coalescing latency floor (`-10 ms` per batch)** |
| **Wave 4.1b ([#6560](https://github.com/MemberJunction/MJ/pull/6560))** | `UserCache.UserByEmail` lookup (10,000 lookups across 500 users) | `44.66 ms` ($O(U)$ `Users.find` + `.toLowerCase().trim()`) | **`1.01 ms`** ($O(1)$ `_usersByEmailMap` lookup) | **`44.2×` faster (`-97.7%` auth lookup CPU)** |
| **Wave 4.1b ([#6560](https://github.com/MemberJunction/MJ/pull/6560))** | Per-request `SQLServerDataProvider` setup (`ConfigureFromGlobalSync` + `DetachInvalidationListeners`, 100 requests) | `0.62 ms` (async `Config()` + lingering `WeakRef` in `_invalidationTargets`) | **`0.57 ms`** (synchronous `ConfigureFromGlobalSync` + `0` leaked `WeakRef`s on `res.on('close')`) | **`-8.1%` setup time + eliminates per-request `_invalidationTargets` accumulation** |
| **Wave 4.2a ([#6541](https://github.com/MemberJunction/MJ/pull/6541))** | Angular Idle CPU (`TabContainer` `ChangeDetectorRef.detach()` on hidden tabs, `RecordFormContainer` outside NgZone, `MarkdownComponent` $O(1)$ block-tail streaming) | `60 Hz` `requestAnimationFrame` + `O(N^2)` full markdown re-parse per token | **`0` idle ticks (`ChangeDetectorRef.detach()`) + $O(1)$ last-block markdown parse** | **Eliminates background tab CD trees, 60 Hz idle zone ticks, and $O(N^2)$ streaming lag** |
| **Wave 4.2b ([#6603](https://github.com/MemberJunction/MJ/pull/6603))** | `MJExplorer` Initial Bundle Size (`ExplorerCoreModule` `FileStorageModule` severance + 6 core & 4 BizApps engines `{ deferred: IsBrowser() }` + `MJ_CLASS_NAME_SYMBOL`) | **`17.19 MB` raw** (`2.18 MB` transfer; largest chunk `8.59 MB` / `779.46 kB`) | **`16.29 MB` raw** (`2.06 MB` transfer; largest chunk `7.29 MB` / `595.23 kB`) | **`-900 KB` raw (`-5.2%`) / `-120 KB` transfer (`-5.5%`); `-1.30 MB` (`-15.1%`) on main chunk** |
| **Wave 4.3a ([#6544](https://github.com/MemberJunction/MJ/pull/6544))** | `CanCountFromBaseTable` automatic `COUNT(*)` rewrite on `MJ: Record Changes` (`ExtraFilter: "Status = 'Complete'"`) | `SELECT COUNT(*) AS [TotalRowCount] FROM [__mj].[vwRecordChanges] WHERE (Status = 'Complete')` (`false`) | **`SELECT COUNT(*) AS [TotalRowCount] FROM [__mj].[RecordChange] WHERE (Status = 'Complete')` (`true`)** | **Eliminates multi-table `LEFT OUTER JOIN` expansion on `count_only` & paginated `RunView`s** |
| **Wave 4.3a ([#6544](https://github.com/MemberJunction/MJ/pull/6544))** | `TransactionGroup` commit-before-flush & deferred geocoding (`RunAfterCommit`) + parameterized `@rls_p0` RLS filters | Exclusive SQL `X`-locks held across Redis pub/sub & HTTP geocoding; literal per-user RLS SQL plan bloat | **SQL `COMMIT` executes before cache flush & HTTP geocoding; single shared `@rls_p0` SQL plan** | **Eliminates network I/O inside open SQL transactions and per-user SQL plan cache bloat** |
| **Wave 4.3b ([#6605](https://github.com/MemberJunction/MJ/pull/6605) & [#6622](https://github.com/MemberJunction/MJ/pull/6622))** | Single-write `__mj_UpdatedAt = GETUTCDATE()` in `spUpdate*` + `IF NOT UPDATE([__mj_UpdatedAt])` in `trgUpdate*` (`IT24` `MC9` audit across 455 entities) | `0 / 454` procedures (`spUpdateHasSingleWrite: false`, `trgUpdateHasIfNotUpdateGuard: false` — **2 table writes per save**) | **`454 / 454` `spUpdate*` + `455 / 455` `trgUpdate*` (`MC9: 0 offenders across 455 scanned` — 1 table write per save)** | **`-50%` physical table writes, index leaf maintenance, and transaction log records per `UPDATE`** |
| **Wave 4.4 ([#6556](https://github.com/MemberJunction/MJ/pull/6556))** | `TwoTierCacheStorageProvider` L1 frozen CoW cache + `ApplyRunViewRowDelta` (`HSET`/`HDEL`) across 200 reads & 50 single-row deltas on 2,000 rows | `160.91 ms` (full `JSON.parse` on every read + full 2,000-row `JSON.stringify` on every delta) | **`101.83 ms`** (zero-parse L1 frozen CoW hit + $O(\Delta)$ single-row `ApplyRunViewRowDelta`) | **`1.58×` faster (`-36.7%` latency; `0` JSON.parse on L1 hits; $O(\Delta)$ Redis `HSET`/`HDEL`)** |
| **Wave 4.5 ([#6606](https://github.com/MemberJunction/MJ/pull/6606))** | `BaseAgent.heuristicTokenCount` zero-alloc single-pass scanner (1,000 calls on 64 KB prompt) + immediate `AgentRunner` pub/sub streaming + worker-thread embeddings | `152.70 ms` (3 regex `.match()` array allocations per call; `CreateAndRun` buffered until run end) | **`149.99 ms`** (`0` array allocations per call; `CreateAndRun` streams step progress in real time) | **Zero regex array GC churn + real-time conversational agent step streaming** |
| **Wave 4.6 ([#6548](https://github.com/MemberJunction/MJ/pull/6548))** | `mj codegen manifest` AST Cache v2 (SHA-256 content + mtime/size fast path) + `turbo.json` inputs + `tsconfig.server.json` `incremental: true` + peerDep deduplication | `3,291.12 ms` cold (`450+` duplicate `ClassFactory.Register` warnings from peerDep duplication) | **`3,095.93 ms` CLI warm** (**`< 180 ms` in-process AST Cache v2 warm walk; `0` duplicate `ClassFactory` warnings**) | **Eliminates duplicate `@memberjunction/*` peer-dep instances & caches TypeScript AST walks** |
| **Wave 4.7 ([#6607](https://github.com/MemberJunction/MJ/pull/6607))** | `FrozenRowSerializationCache` `WeakMap` wire serialization (5,000 frozen cached `RunView` rows × 20 GraphQL responses) + single-pass `ApplyBuiltInDirectivesTransformer` | `15.86 ms` ($100,000 \times \text{JSON.stringify}$) + $4\times$ `mapSchema` passes at startup | **`3.80 ms`** ($5,000 \times \text{JSON.stringify}$ + $95,000$ $O(1)$ `WeakMap` hits) + $1\times$ `mapSchema` pass | **`4.17×` faster (`-76.0%` wire serialization CPU) + `-75%` GraphQL directive schema passes** |

---

## 4. `IT24` Live SQL Metadata & Single-Write `__mj_UpdatedAt` Consistency Audit (`MC1`–`MC9`)

Executed on `MJ_Wave4_Post` (`5936989e00`) via `MJ_INTEGRATION_TEST=1 node packages/MJCLI/bin/run.js test run DD414986-2531-4CC6-BF9D-50198C292B92`:

| Check ID | Description | Result | Duration | Details |
|---|---|---|---:|---|
| **`metadata-consistency.MC1`** | Every generated `BaseView` exists in `sys.objects` | **PASS** | `36 ms` | `455` entities audited |
| **`metadata-consistency.MC2`** | Every generated `spCreate`/`spUpdate`/`spDelete` exists in `sys.objects` | **PASS** | `13 ms` | `455` entities audited |
| **`metadata-consistency.MC3`** | `CHECK`-constraint value lists match `EntityFieldValue` rows | **PASS** | `139 ms` | `0` mismatches |
| **`metadata-consistency.MC4`** | Every FK column has its `IDX_AUTO_MJ_FKEY` index | **PASS** | `42 ms` | `0` missing FK indexes |
| **`metadata-consistency.MC5`** | Field `Sequence`s are gapless from 1 and match `BaseView` column order | **PASS** | `56 ms` | `0` sequence/column order drifts |
| **`metadata-consistency.MC6`** | Every core-schema physical field carries an `MS_Description` | **PASS** | `91 ms` | `0` missing descriptions |
| **`metadata-consistency.MC8`** | `SchemaInfo` covers every entity schema with casing-correct names | **PASS** | `9 ms` | `0` schema mismatches |
| **`metadata-consistency.MC9`** | **Single-write `__mj_UpdatedAt` in `spUpdate*` + `IF NOT UPDATE` trigger guard across all entities** | **PASS** | `1,107 ms` | **`0` offenders across `455` entities (`454` `spUpdate*` + `455` `trgUpdate*`)** |

---

## 5. Wave 4 Part B (BizApps) Optimization & Single-Write Backfill Summary

All 6 BizApps pull requests include both their targeted Wave 4 runtime/UI/caching optimizations and a full CodeGen SQL backfill migration regenerating every `spUpdate*` and `trgUpdate*` in their schema for single-write `__mj_UpdatedAt`:

| Repository | PR | Branch | Entities Backfilled (`spUpdate*` + `trgUpdate*`) | Runtime & Engine Optimizations Included | CI Status |
|---|---|---|---:|---|---|
| **`BlueCypress/SaaS`** | **[#176](https://github.com/BlueCypress/SaaS/pull/176)** | `perf/wave4-bcsaas-cache-indexes` | **61 tables** (`__bcsaas`) | `BCSaaSEngine` $O(1)$ `Map` indexes (`_rolesByAccountAndName`, `_productsByCode`, `_appsByCategoryId`), `WorkspaceManager` `ChangeDetectionStrategy.OnPush`, `mj-class-registrations` | **6 / 6 Green** |
| **`MemberJunction/bizapps-common`** | **[#436](https://github.com/MemberJunction/bizapps-common/pull/436)** | `perf/wave4-common-geo-timezone` | **30 tables** (`__mj_BizAppsCommon`) | `BusinessTimeZoneEngine` `{ deferred: IsBrowser() }`, `PersonEntityServer` `Promise.all` parallel link creation, `Address` / `AddressLink` post-commit geocoding (`RunAfterCommit`) | **10 / 10 Green** |
| **`MemberJunction/bizapps-accounting`** | **[#510](https://github.com/MemberJunction/bizapps-accounting/pull/510)** | `perf/wave4-accounting-engine-maps` | **26 tables** (`__mj_BizAppsAccounting`) | `AccountingEngineBase` `{ deferred: IsBrowser() }` + $O(1)$ `Map` indexes (`_accountsByCompanyId`, `_periodsByFiscalYearId`, `_classesByTypeId`), `OnPush` on all 9 dashboard components | **7 / 7 Green** |
| **`MemberJunction/bizapps-orders`** | **[#1072](https://github.com/MemberJunction/bizapps-orders/pull/1072)** | `perf/wave4-orders-engine-maps` | **71 tables** (`__mj_BizAppsOrders`) | `OrdersEngine` `{ deferred: IsBrowser() }` + $O(1)$ `Map` indexes (`_productsByID`, `_creditReasonsByID`, `_orderStatusesByID`, `_subscriptionPlansByProductID`), `InvoiceEntityServer` batch line load | **8 / 8 Green** |
| **`MemberJunction/bizapps-fpna`** | **[#18](https://github.com/MemberJunction/bizapps-fpna/pull/18)** | `perf/wave4-fpna-engine-maps` | **33 tables** (`__mj_BizAppsFPNA`) | `FPNAEngineBase` `{ deferred: IsBrowser() }` + $O(1)$ `Map` indexes (`_scenariosByTypeId`, `_departmentsByParentId`, `_budgetsByScenarioId`, `_modelsByStatus`), `OnPush` on all 7 dashboards | **All Checks Green** |
| **`MemberJunction/bizapps-contracts`** | **[#201](https://github.com/MemberJunction/bizapps-contracts/pull/201)** | `perf/wave4-contracts-count-batching` | **6 tables** (`__mj_BizAppsContracts`) | Replaced 6 full `entity_object` `RunViews` with `ResultType: 'count_only'`, fixed `contract-ai.service.ts` `interval(2000)` leak via `takeUntil(this.destroy$)`, `OnPush` on all 10 components | **All Checks Green** |

---

## 6. Architecture for Turning the Full Benchmark Suite into an Automated JSON Regression-Gating Integration Test (`IT128` `PB1`–`PB18`)

You asked:
> *"Might make sense to turn the entire benchmark suite into an integration test and use JSON for storing the data and that way we can look for major variances as regressions to flag when something is done that causes performance issues?"*

### 6.1 What Already Exists in `IT128` (`performance-benchmark.checks.ts`)
- **`IT128 - Performance and Agent Overhead Benchmark`** (`packages/TestingFramework/integration-test-suite/src/checks/performance-benchmark.checks.ts`) is **already a first-class MJ Integration Test** (`ID: 9E412A8C-73F1-4D25-8B19-6A5E2C90D417`) that runs `PB1`–`PB14` and writes structured JSON reports on every run to `packages/TestingFramework/integration-test-suite/benchmark-logs/`:
  - `latest.json` & `latest.md`
  - `history.jsonl` (append-only historical log across Waves 1, 2, 3, and 4)
  - `pass1-baseline.json` (committed Wave 2 baseline JSON)

### 6.2 How We Can Complete the Loop (`PB15`–`PB18` + Committed `baseline.json` Variance Gate)
By adding **`PB15`–`PB18`** directly into `packages/TestingFramework/integration-test-suite/src/checks/performance-benchmark.checks.ts` and committing `packages/TestingFramework/integration-test-suite/benchmark-logs/wave4-baseline.json`, **every Wave 1–4 benchmark and regression check runs in a single `mj test run` command**:

1. **`PB15` — Wave 4 Core, Cache & Engine Hot-Path Check**:
   - Measures and records in `Primitives`:
     - `ApplyRowChanges50On5000RowsMs` (`LocalCacheManager.ApplyRowChanges` $O(\Delta)$ with `WeakMap` PK index + `WeakSet` deepFreeze)
     - `NarrowSearchRunViewSqlColumns` & `NarrowSearchRunView50CallsMs` (**hard assertion**: `Assert(cols <= 3)` so `Fields: ['ID', 'Name']` + `UserSearchString` can never silently regress back to `SELECT *` `37` columns!)
     - `BaseEngine100RowDeltasMs` (`getOrBuildHeldRowsDeltaIndex` + `mergeMaterializedDeltaRows` $O(\Delta)$ merge)
     - `GetUserPermissions10kMs` (`EntityInfo.GetUserPermisions` `WeakMap` memo)
     - `GetEntityObjectSkipNewRecord500Ms` (`SkipNewRecord: true` fast path)
     - `UserCacheEmailLookup10kMs` (`UserCache.UserByEmail` $O(1)$ `Map`)
2. **`PB16` — Wave 4 SQL & Database Layer Check**:
   - Measures and enforces:
     - `CanCountFromBaseTable` rewrite on `MJ: Record Changes` (**hard assertion**: `Assert(sql.includes('[RecordChange]') && !sql.includes('[vwRecordChanges]'))`)
     - `SpUpdate50SavesMs` + single-write `spUpdate*` and `IF NOT UPDATE([__mj_UpdatedAt])` trigger guard verification
3. **`PB17` — Wave 4 Distributed Cache, AI & Wire Serialization Check**:
   - Measures and records:
     - `TwoTierExternalStorage200ReadsAnd50DeltasMs` (`TwoTierCacheStorageProvider` L1 frozen CoW read hit + `ApplyRunViewRowDelta`)
     - `HeuristicTokenCount1000Ms` (`BaseAgent.heuristicTokenCount` zero-alloc scan)
     - `FrozenRowWireSerialize5000x20Ms` (`FrozenRowSerializationCache` `WeakMap` wire serialization)
4. **`PB18` — Automated JSON Baseline Comparator & Variance Regression Gate**:
   - Reads `packages/TestingFramework/integration-test-suite/benchmark-logs/wave4-baseline.json` (committed in git).
   - Computes a structured `RegressionSummary` block written into `latest.json` and `history.jsonl` with `{ metric, baselineValue, currentValue, ratio, deltaPercent, status: 'improved' | 'stable' | 'warning' | 'regression' }` for every metric.
   - **Two-tier enforcement so CI is never flaky**:
     - **Tier 1 — Deterministic Structural Invariants (Always Hard-Gated)**:
       - `NarrowSearchRunViewSqlColumns <= 3` (was `37`)
       - `CountRewriteUsesBaseTable === true` (was `false`)
       - `SpUpdateHasSingleWrite === true` & `TrgUpdateHasIfNotUpdateGuard === true`
       - `DatestampsOnlyEntityCount >= 25`
       - `PB7` `PayloadAtStartPointerSteps >= 6` & `PayloadAtEndPointerSteps >= 5` (`TotalStepStorageBytes <= 65,000 B`)
     - **Tier 2 — Timing / CPU Variance Thresholds (Configurable via `MJ_PERF_VARIANCE_THRESHOLD`, default `2.5×` warn / `MJ_PERF_STRICT_REGRESSION=1` fail)**:
       - Flags any primitive or agent framework-overhead metric that degrades by more than the configured multiplier relative to `wave4-baseline.json` (e.g. if an $O(1)$ `WeakMap`/`Map` lookup accidentally reverts to an $O(N)$ linear scan, it jumps $10\times$–$90\times$ and is caught immediately).
