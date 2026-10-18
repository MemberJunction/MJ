# MemberJunction Performance & Agent Overhead Benchmark Report

- **Timestamp**: `2026-10-17T20:41:33.081Z`
- **Database**: `MJ_Clean_Wave2_E2E`
- **Primitives Total CPU Time (PB1–PB6)**: **87.18 ms**
- **`SaveReturnMode: 'datestamps_only'` Entities Active (PB13)**: **38** (`{"__mj":25,"__mj_BizAppsCommon":2,"__mj_BizAppsForms":2,"__mj_BizAppsOrders":4,"__mj_BizAppsSonar":3,"__mj_BizAppsTasks":2}`)
- **10x 32 KB `ErrorLog` Saves with `datestamps_only` (PB13)**: **202.06 ms**

## 1. Core & AI Primitive Microbenchmarks (PB1–PB6, PB13)

| Check | Benchmark | Elapsed (ms) |
|---|---|---:|
| **PB1** | `ClassFactory` (`GetRegistration` + `GetAllRegistrations`) & `ObjectCache.Find` (10k iters / 450 classes) | 3.71 |
| **PB2** | `EntityInfo.ChildEntities` + `BaseEntity` Hydration (`LoadFromData`/`SetMany`/`GetAll`) + FLS (2,000 rows x 25 fields) | 10.37 |
| **PB3** | `LocalCacheManager` `SetRunViewResult` + `SetDataset` + `GetStats` (80 large entries) | 1.38 |
| **PB4** | `TemplateEngineServer.RenderTemplateSimple` + `NunjucksSandbox` (1,000 renders) | 59.28 |
| **PB5** | `RedactParamsToJSON` + `AIEngineBase` permissions & catalog lookup (500 iters) | 6.76 |
| **PB6** | `PayloadManager.applyAgentChangeRequest` + `DeepDiffer` (50 turns) | 5.68 |
| **PB13** | `SaveReturnMode: 'datestamps_only'` 10x 32 KB `MJ: Error Logs` SQL roundtrips (38 entities configured) | 202.06 |

## 2. Multi-Turn Agent Loop & SQL Server Footprint Benchmarks (PB7–PB12)

| Check / Agent | Mode | Wall Time (ms) | LLM Time (ms) | Framework Overhead (ms) | Runs | Steps | Total Step DB Bytes | Pointer Steps (Start / End) | Est. Dedup Savings |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|
| **PB7: Sage (4-turn deterministic)** | `deterministic-testllm` | 680.1 | 197 | 483.1 | 1 | 8 | 52,775 B | 6 / 5 | 76.6% |
| **PB8: Query Builder + Query Strategist (deterministic)** | `deterministic-testllm` | 956.39 | 205 | 751.39 | 2 | 10 | 119,464 B | 4 / 3 | 48.6% |
| **PB9: Research Agent + Report Writer (deterministic)** | `deterministic-testllm` | 466.45 | 158 | 308.45 | 2 | 6 | 103,911 B | 2 / 1 | 32.2% |
| **PB10: Sage (live-model)** | `live-model` | 1800.65 | 1530 | 270.65 | 1 | 4 | 2,191 B | 0 / 0 | 0% |
| **PB11: Query Builder (live-model)** | `live-model` | 41583.1 | 40411 | 1172.1 | 2 | 13 | 37,016 B | 7 / 5 | 58.6% |
| **PB12: Research Agent (live-model)** | `live-model` | 5787.77 | 5447 | 340.77 | 1 | 2 | 518 B | 0 / 0 | 0% |
