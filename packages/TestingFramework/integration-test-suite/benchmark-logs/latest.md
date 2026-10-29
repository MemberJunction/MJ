# MemberJunction Performance & Agent Overhead Benchmark Report

- **Timestamp**: `2026-10-20T02:03:17.960Z`
- **Database**: `MJ_Phase2_FullStack_Verify`
- **Primitives Total CPU Time (PB1–PB6)**: **67.6 ms**
- **`SaveReturnMode: 'datestamps_only'` Entities Active (PB13)**: **38** (`{"__mj":25,"__mj_BizAppsCommon":2,"__mj_BizAppsForms":2,"__mj_BizAppsOrders":4,"__mj_BizAppsSonar":3,"__mj_BizAppsTasks":2}`)
- **10x 32 KB `ErrorLog` Saves with `datestamps_only` (PB13)**: **40.01 ms**

## 1. Core & AI Primitive Microbenchmarks (PB1–PB6, PB13)

| Check | Benchmark | Elapsed (ms) |
|---|---|---:|
| **PB1** | `ClassFactory` (`GetRegistration` + `GetAllRegistrations`) & `ObjectCache.Find` (10k iters / 450 classes) | 2.6 |
| **PB2** | `EntityInfo.ChildEntities` + `BaseEntity` Hydration (`LoadFromData`/`SetMany`/`GetAll`) + FLS (2,000 rows x 25 fields) | 19.12 |
| **PB3** | `LocalCacheManager` `SetRunViewResult` + `SetDataset` + `GetStats` (80 large entries) | 1.2 |
| **PB4** | `TemplateEngineServer.RenderTemplateSimple` + `NunjucksSandbox` (1,000 renders) | 33.55 |
| **PB5** | `RedactParamsToJSON` + `AIEngineBase` permissions & catalog lookup (500 iters) | 5.8 |
| **PB6** | `PayloadManager.applyAgentChangeRequest` + `DeepDiffer` (50 turns) | 5.33 |
| **PB13** | `SaveReturnMode: 'datestamps_only'` 10x 32 KB `MJ: Error Logs` SQL roundtrips (38 entities configured) | 40.01 |

## 2. Multi-Turn Agent Loop & SQL Server Footprint Benchmarks (PB7–PB12)

| Check / Agent | Mode | Wall Time (ms) | LLM Time (ms) | Framework Overhead (ms) | Runs | Steps | Total Step DB Bytes | Pointer Steps (Start / End) | Est. Dedup Savings |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| **PB7: Sage (4-turn deterministic)** | `deterministic-testllm` | 569.43 | 179 | 390.43 | 1 | 8 | 52,699 B | 6 / 5 | 76.6% |
| **PB8: Query Builder + Query Strategist (deterministic)** | `deterministic-testllm` | 522.28 | 185 | 337.28 | 2 | 10 | 119,588 B | 4 / 3 | 48.6% |
| **PB9: Research Agent + Report Writer (deterministic)** | `deterministic-testllm` | 237.77 | 134 | 103.77 | 2 | 6 | 104,050 B | 2 / 1 | 32.2% |
