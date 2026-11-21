# MemberJunction Performance & Agent Overhead Benchmark Report

- **Timestamp**: `2026-11-21T03:48:21.314Z`
- **Database**: `MJ_PS_PR4_claude`
- **Primitives Total CPU Time (PB1–PB6)**: **124.45 ms**
- **`SaveReturnMode: 'datestamps_only'` Entities Active (PB13)**: **25** (`{"__mj":25}`)
- **10x 32 KB `ErrorLog` Saves with `datestamps_only` (PB13)**: **96.24 ms**

## 1. Core, Cache & SQL Primitive Microbenchmarks (PB1–PB6, PB13, PB15–PB17)

| Check | Benchmark | Elapsed / Value |
|---|---|---:|
| **PB1** | `ClassFactory` (`GetRegistration` + `GetAllRegistrations`) & `ObjectCache.Find` (10k iters / 450 classes) | 5.97 ms |
| **PB2** | `EntityInfo.ChildEntities` + `BaseEntity` Hydration (`LoadFromData`/`SetMany`/`GetAll`) + FLS (2,000 rows x 25 fields) | 34.95 ms |
| **PB3** | `LocalCacheManager` `SetRunViewResult` + `SetDataset` + `GetStats` (80 large entries) | 1.8 ms |
| **PB4** | `TemplateEngineServer.RenderTemplateSimple` + `NunjucksSandbox` (1,000 renders) | 59 ms |
| **PB5** | `RedactParamsToJSON` + `AIEngineBase` permissions & catalog lookup (500 iters) | 13.73 ms |
| **PB6** | `PayloadManager.applyAgentChangeRequest` + `DeepDiffer` (50 turns) | 9 ms |
| **PB13** | `SaveReturnMode: 'datestamps_only'` 10x 32 KB `MJ: Error Logs` SQL roundtrips (25 entities configured) | 96.24 ms |
| **PB15** | `LocalCacheManager.ApplyRowChanges` CoW (50 updates on 5,000 rows) | 42.95 ms |
| **PB15** | `BaseEngine` `PKMap` O(1) row-delta merge (100 deltas on 2,000 rows) | 0.59 ms (35.2x vs linear) |
| **PB15** | `GetEntityObjectWithOptions({ SkipNewRecord: true })` (500 calls) | 2.43 ms (vs 7.35 ms default) |
| **PB15** | `UserCache.UserByEmail` secondary index (10,000 lookups across 500 users) | 2.19 ms (46.6x vs linear) |
| **PB16** | Narrow `Fields: ['ID', 'Name']` + `UserSearchString` `RunView` (10 calls on `MJ: Actions`) | 62.01 ms (2 cols vs 41 wide) |
| **PB16** | `CanCountFromBaseTable` entities & `MJ: Record Changes` base-table `COUNT(*)` | 486 entities (`baseTable=true`) |
| **PB17** | `TwoTierCacheStorageProvider` L1 frozen CoW (200 reads + 50 row deltas) | 5.11 ms (`zeroClone=true`) |
| **PB17** | `FrozenRowSerializationCache` `WeakMap` wire serialize (5,000 rows x 20 responses) | 9.75 ms (3.62x vs `JSON.stringify`) |
| **PB19** | `BuildRecordChangePayload` `skipFullRecordJSON` (500 x 32 KB rows) | 0.2 ms (vs 50.17 ms unskipped, 250.85x faster) |
| **PB19** | `CanCountFromBaseTable` subqueries & PG temporal + `EXISTS` `count_only` | 3/3 filters, 86.68 ms (`baseTable=true`) |
| **PB20** | `EntityInfo` lazy `Fields` construction (all 11.11 ms) & 5-entity access | 0.02 ms (storage roundtrip: 1000.54 ms, structuredClone=true) |
| **PB21** | Wave 6A frozen `Fields` wire cache (5,000 rows x 20), PG pools, BGE worker cap, `UserByID` (10k) | 10.38 ms (3.44x), RO=50/Adhoc=10, BGE=100, `UserByID`=4 ms |
| **PB22** | Wave 6B `SharedTabKernel` (10 tabs: single WS, RunView coalescing, single-IDB L1 & write dedup) | WS=1, RV backend=1, IDB reads=0, dedup writes=9 (74.89 ms) |
| **PB23** | Wave 6C edge hint permission sanitization & `SimpleVectorService` float32 lookup (1,000 x 384d, 100 queries) | Discarded=3, Conf=0.9089, `Float32`=50.55 ms (0.5055 ms/query) |

## 2. Multi-Turn Agent Loop & SQL Server Footprint Benchmarks (PB7–PB12)

| Check / Agent | Mode | Wall Time (ms) | LLM Time (ms) | Framework Overhead (ms) | Runs | Steps | Total Step DB Bytes | Pointer Steps (Start / End) | Est. Dedup Savings |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| **PB7: Sage (4-turn deterministic)** | `deterministic-testllm` | 770.92 | 198 | 572.92 | 1 | 7 | 36,249 B | 4 / 4 | 77.6% |
| **PB8: Query Builder + Query Strategist (deterministic)** | `deterministic-testllm` | 421.24 | 172 | 249.24 | 2 | 10 | 126,565 B | 4 / 3 | 47.2% |
| **PB9: Research Agent + Report Writer (deterministic)** | `deterministic-testllm` | 237.44 | 132 | 105.44 | 2 | 6 | 104,158 B | 2 / 1 | 32.1% |
| **PB10: Sage (live-model)** | `live-model` | 2490.14 | 2351 | 139.14 | 1 | 3 | 1,034 B | 0 / 0 | 0% |
| **PB11: Query Builder (live-model)** | `live-model` | 52494.66 | 52239 | 255.66 | 2 | 13 | 52,903 B | 7 / 5 | 52.1% |
| **PB12: Research Agent (live-model)** | `live-model` | 2261.23 | 2208 | 53.23 | 1 | 2 | 518 B | 0 / 0 | 0% |

## 3. Longitudinal Waves 1–4 & Baseline Regression Comparison (PB18)

| Metric | Unit | Pre-Wave-1 | Wave 2 | Wave 3 | Pre-Wave-4 | Wave 4 Baseline | Current | Delta vs Baseline | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| **Aggregate Suite: Core/Cache/SQL Primitives (PB1–PB6, PB13, PB15–PB17)** | `ms` | — | — | — | 433.97 | 165.43 | **345.72** | +109% | **FAIL** |
| **Aggregate Suite: Deterministic Agent Framework Overhead (PB7–PB9)** | `ms` | — | 790.43 | 727.45 | 691.47 | 811.1 | **927.6** | +14.4% | **PASS** |
| **PB1–PB6 Primitives Total CPU** | `ms` | 337.06 | 52.5 | 66.04 | 69.68 | 57.32 | **124.45** | +117.1% | **FAIL** |
| **PB1 ClassFactory & ObjectCache (10k)** | `ms` | 53.68 | 2.57 | 3.01 | 2.38 | 3.48 | **5.97** | +71.6% | **PASS** |
| **PB2 BaseEntity Hydration & FLS (2k rows)** | `ms` | 75.39 | 6.68 | 18.3 | 18.95 | 8.7 | **34.95** | +301.7% | **FAIL** |
| **PB3 LocalCacheManager Writes & Stats** | `ms` | 42.9 | 1.18 | 0.72 | 0.74 | 1.02 | **1.8** | +76.5% | **PASS** |
| **PB4 TemplateEngine RenderSimple (1k)** | `ms` | 44.11 | 33.79 | 30.88 | 34.48 | 35.05 | **59** | +68.3% | **WARN** |
| **PB5 Action Snapshot & AI Perms (500)** | `ms` | 112.9 | 4.58 | 8.7 | 7.77 | 4.32 | **13.73** | +217.8% | **WARN** |
| **PB6 PayloadManager & DeepDiffer (50)** | `ms` | 8.08 | 3.7 | 4.43 | 5.36 | 4.75 | **9** | +89.5% | **PASS** |
| **PB13 datestamps_only 10x 32KB Saves** | `ms` | — | — | — | 32.39 | 35.94 | **96.24** | +167.8% | **FAIL** |
| **PB15 ApplyRowChanges CoW (50 on 5k rows)** | `ms` | — | — | — | 60.89 | 28.32 | **42.95** | +51.7% | **WARN** |
| **PB15 BaseEngine PKMap 100 Row Deltas** | `ms` | — | — | — | 69.84 | 0.19 | **0.59** | +210.5% | **PASS** |
| **PB15 GetEntityObject SkipNewRecord (500)** | `ms` | — | — | — | 2.85 | 1.21 | **2.43** | +100.8% | **PASS** |
| **PB15 UserCache.UserByEmail (10k lookups)** | `ms` | — | — | — | 44.66 | 1.13 | **2.19** | +93.8% | **PASS** |
| **PB16 Narrow Search RunView (10 calls)** | `ms` | — | — | — | 105.1 | 36.76 | **62.01** | +68.7% | **WARN** |
| **PB17 TwoTier L1 CoW (200 reads + 50 deltas)** | `ms` | — | — | — | 32.18 | 1.59 | **5.11** | +221.4% | **PASS** |
| **PB17 FrozenRow WeakMap Wire (5k x 20)** | `ms` | — | — | — | 15.86 | 3.96 | **9.75** | +146.2% | **WARN** |
| **PB7 Sage 4-Turn Step Storage** | `bytes` | 179831 | 52774 | 52699 | 84218 | 52871 | **36249** | -31.4% | **PASS** |
| **PB8 Query Builder + Strategist Storage** | `bytes` | 172499 | 119464 | 119588 | 126565 | 126263 | **126565** | +0.2% | **PASS** |
| **PB9 Research Agent + Writer Storage** | `bytes` | 157183 | 103911 | 104050 | 104158 | 104158 | **104158** | 0% | **PASS** |
| **Aggregate Primitives Slowness Factor (vs Baseline)** | `x` | — | — | — | 2.62x | 1.00x | **2.09x** | +109% | **FAIL** |
| **Aggregate Agent Framework Slowness Factor (vs Baseline)** | `x` | — | 0.97x | 0.90x | 0.85x | 1.00x | **1.14x** | +14% | **PASS** |
| **PB16 Narrow Search SQL Columns Projected** | `cols` | — | — | — | 37 | 2 | **2** | 0% | **PASS** |
| **PB16 MJ: Record Changes Count Targets Base Table** | `bool` | — | — | — | false | true | **true** | — | **PASS** |
| **PB15 BaseEngine PKMap vs Linear Speedup Ratio** | `x` | — | — | — | 1.0 | 104.1x | **35.2x** | — | **PASS** |
| **PB15 UserCache.UserByEmail vs Linear Speedup Ratio** | `x` | — | — | — | 1.0 | 43.4x | **46.6x** | — | **PASS** |
| **PB17 FrozenRow WeakMap vs JSON.stringify Speedup** | `x` | — | — | — | 1.0 | 4.9x | **3.62x** | — | **PASS** |
