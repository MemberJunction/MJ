# MemberJunction Performance & Agent Overhead Benchmark Report

- **Timestamp**: `2026-11-13T01:44:54.155Z`
- **Database**: `MJ_Demo_20261106`
- **Primitives Total CPU Time (PB1–PB6)**: **55.12 ms**
- **`SaveReturnMode: 'datestamps_only'` Entities Active (PB13)**: **25** (`{"__mj":25}`)
- **10x 32 KB `ErrorLog` Saves with `datestamps_only` (PB13)**: **39.46 ms**

## 1. Core, Cache & SQL Primitive Microbenchmarks (PB1–PB6, PB13, PB15–PB17)

| Check | Benchmark | Elapsed / Value |
|---|---|---:|
| **PB1** | `ClassFactory` (`GetRegistration` + `GetAllRegistrations`) & `ObjectCache.Find` (10k iters / 450 classes) | 3.06 ms |
| **PB2** | `EntityInfo.ChildEntities` + `BaseEntity` Hydration (`LoadFromData`/`SetMany`/`GetAll`) + FLS (2,000 rows x 25 fields) | 8.34 ms |
| **PB3** | `LocalCacheManager` `SetRunViewResult` + `SetDataset` + `GetStats` (80 large entries) | 0.99 ms |
| **PB4** | `TemplateEngineServer.RenderTemplateSimple` + `NunjucksSandbox` (1,000 renders) | 33.35 ms |
| **PB5** | `RedactParamsToJSON` + `AIEngineBase` permissions & catalog lookup (500 iters) | 4.47 ms |
| **PB6** | `PayloadManager.applyAgentChangeRequest` + `DeepDiffer` (50 turns) | 4.91 ms |
| **PB13** | `SaveReturnMode: 'datestamps_only'` 10x 32 KB `MJ: Error Logs` SQL roundtrips (25 entities configured) | 39.46 ms |
| **PB15** | `LocalCacheManager.ApplyRowChanges` CoW (50 updates on 5,000 rows) | 25.24 ms |
| **PB15** | `BaseEngine` `PKMap` O(1) row-delta merge (100 deltas on 2,000 rows) | 0.18 ms (107.6x vs linear) |
| **PB15** | `GetEntityObjectWithOptions({ SkipNewRecord: true })` (500 calls) | 1.27 ms (vs 3.98 ms default) |
| **PB15** | `UserCache.UserByEmail` secondary index (10,000 lookups across 500 users) | 1.13 ms (44.2x vs linear) |
| **PB16** | Narrow `Fields: ['ID', 'Name']` + `UserSearchString` `RunView` (10 calls on `MJ: Actions`) | 36.84 ms (2 cols vs 37 wide) |
| **PB16** | `CanCountFromBaseTable` entities & `MJ: Record Changes` base-table `COUNT(*)` | 707 entities (`baseTable=true`) |
| **PB17** | `TwoTierCacheStorageProvider` L1 frozen CoW (200 reads + 50 row deltas) | 1.36 ms (`zeroClone=true`) |
| **PB17** | `FrozenRowSerializationCache` `WeakMap` wire serialize (5,000 rows x 20 responses) | 4.19 ms (3.88x vs `JSON.stringify`) |

## 2. Multi-Turn Agent Loop & SQL Server Footprint Benchmarks (PB7–PB12)

| Check / Agent | Mode | Wall Time (ms) | LLM Time (ms) | Framework Overhead (ms) | Runs | Steps | Total Step DB Bytes | Pointer Steps (Start / End) | Est. Dedup Savings |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| **PB7: Sage (4-turn deterministic)** | `deterministic-testllm` | 569.82 | 178 | 391.82 | 1 | 8 | 52,871 B | 6 / 5 | 76.5% |
| **PB8: Query Builder + Query Strategist (deterministic)** | `deterministic-testllm` | 498.99 | 169 | 329.99 | 2 | 10 | 126,263 B | 4 / 3 | 47.3% |
| **PB9: Research Agent + Report Writer (deterministic)** | `deterministic-testllm` | 211.29 | 122 | 89.29 | 2 | 6 | 104,158 B | 2 / 1 | 32.1% |

## 3. Longitudinal Waves 1–4 & Baseline Regression Comparison (PB18)

| Metric | Unit | Pre-Wave-1 | Wave 2 | Wave 3 | Pre-Wave-4 | Wave 4 Baseline | Current | Delta vs Baseline | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| **PB1–PB6 Primitives Total CPU** | `ms` | 337.06 | 52.5 | 66.04 | 69.68 | 57.32 | **55.12** | -3.8% | **PASS** |
| **PB1 ClassFactory & ObjectCache (10k)** | `ms` | 53.68 | 2.57 | 3.01 | 2.38 | 3.48 | **3.06** | -12.1% | **IMPROVED** |
| **PB2 BaseEntity Hydration & FLS (2k rows)** | `ms` | 75.39 | 6.68 | 18.3 | 18.95 | 8.7 | **8.34** | -4.1% | **PASS** |
| **PB3 LocalCacheManager Writes & Stats** | `ms` | 42.9 | 1.18 | 0.72 | 0.74 | 1.02 | **0.99** | -2.9% | **PASS** |
| **PB4 TemplateEngine RenderSimple (1k)** | `ms` | 44.11 | 33.79 | 30.88 | 34.48 | 35.05 | **33.35** | -4.9% | **PASS** |
| **PB5 Action Snapshot & AI Perms (500)** | `ms` | 112.9 | 4.58 | 8.7 | 7.77 | 4.32 | **4.47** | +3.5% | **PASS** |
| **PB6 PayloadManager & DeepDiffer (50)** | `ms` | 8.08 | 3.7 | 4.43 | 5.36 | 4.75 | **4.91** | +3.4% | **PASS** |
| **PB13 datestamps_only 10x 32KB Saves** | `ms` | — | — | — | 32.39 | 35.94 | **39.46** | +9.8% | **PASS** |
| **PB15 ApplyRowChanges CoW (50 on 5k rows)** | `ms` | — | — | — | 60.89 | 28.32 | **25.24** | -10.9% | **IMPROVED** |
| **PB15 BaseEngine PKMap 100 Row Deltas** | `ms` | — | — | — | 69.84 | 0.19 | **0.18** | -5.3% | **PASS** |
| **PB15 GetEntityObject SkipNewRecord (500)** | `ms` | — | — | — | 2.85 | 1.21 | **1.27** | +5% | **PASS** |
| **PB15 UserCache.UserByEmail (10k lookups)** | `ms` | — | — | — | 44.66 | 1.13 | **1.13** | 0% | **PASS** |
| **PB16 Narrow Search RunView (10 calls)** | `ms` | — | — | — | 105.1 | 36.76 | **36.84** | +0.2% | **PASS** |
| **PB17 TwoTier L1 CoW (200 reads + 50 deltas)** | `ms` | — | — | — | 32.18 | 1.59 | **1.36** | -14.5% | **IMPROVED** |
| **PB17 FrozenRow WeakMap Wire (5k x 20)** | `ms` | — | — | — | 15.86 | 3.96 | **4.19** | +5.8% | **PASS** |
| **PB7 Sage 4-Turn Step Storage** | `bytes` | 179831 | 52774 | 52699 | 84218 | 52871 | **52871** | 0% | **PASS** |
| **PB8 Query Builder + Strategist Storage** | `bytes` | 172499 | 119464 | 119588 | 126565 | 126565 | **126263** | -0.2% | **PASS** |
| **PB9 Research Agent + Writer Storage** | `bytes` | 157183 | 103911 | 104050 | 104158 | 104158 | **104158** | 0% | **PASS** |
| **PB16 Narrow Search SQL Columns Projected** | `cols` | — | — | — | 37 | 2 | **2** | 0% | **PASS** |
| **PB16 MJ: Record Changes Count Targets Base Table** | `bool` | — | — | — | false | true | **true** | — | **PASS** |
| **PB15 BaseEngine PKMap vs Linear Speedup Ratio** | `x` | — | — | — | 1.0 | 104.1x | **107.6x** | — | **PASS** |
| **PB15 UserCache.UserByEmail vs Linear Speedup Ratio** | `x` | — | — | — | 1.0 | 43.4x | **44.2x** | — | **PASS** |
| **PB17 FrozenRow WeakMap vs JSON.stringify Speedup** | `x` | — | — | — | 1.0 | 4.9x | **3.88x** | — | **PASS** |
