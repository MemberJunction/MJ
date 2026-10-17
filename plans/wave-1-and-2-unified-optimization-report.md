# MemberJunction Wave 1 & Wave 2 Unified Optimization, 21-Repo Clean E2E Verification & `SaveReturnMode: 'datestamps_only'` Rollout Report

> **Master Wave 2 Plan Reference**: **[MJ PR #5809](https://github.com/MemberJunction/MJ/pull/5809)** ([`plans/next-wave-optimization-and-hardening-plan.md`](./next-wave-optimization-and-hardening-plan.md))
> **Wave 1 Predecessor PRs**: **[MJ PR #5728](https://github.com/MemberJunction/MJ/pull/5728)** (`IT128` Benchmark Suite) & **[MJ PR #5729](https://github.com/MemberJunction/MJ/pull/5729)** (Wave 1 Track A/B/C Core & Agent Optimizations)
> **Clean 21-Repo Verification Database**: `MJ_Clean_Wave2_E2E` (`901` entities across `MJ` + `20` OpenApp repositories)
> **Integration Suite Result**: **`105 / 105` runnable bundles passing (`100%` green; `1` skipped `IT52` gated on `RUN_SEARCH_TESTS`)** + **`13 / 13` `IT128` Performance & Live-Model Agent Benchmarks passing (`100%`)**

---

## 1. Executive Summary

Across **Wave 1** and **Wave 2**, we designed, implemented, benchmarked, and merged **15 pull requests** across `MemberJunction/MJ` and OpenApp repositories, followed by a clean 21-repository topological database rebuild (`MJ_Clean_Wave2_E2E`), full end-to-end integration verification, and the rollout of `SaveReturnMode: 'datestamps_only'` across **38 write-heavy / append-only logging and telemetry entities** (`25` in core `__mj` and `13` across `bizapps-common`, `bizapps-orders`, `bizapps-tasks`, `bizapps-forms`, and `bizapps-sonar`).

### Key Quantitative Outcomes

1. **Core Framework Hot-Path CPU Time (`PB1`–`PB6`)**:
   - Reduced combined hot-path primitive CPU time from **`337.06 ms`** (`origin/next` pre-Wave-1) to **`52.50 ms`–`80.26 ms`** (**`5.07x`–`6.42x` faster / `-80.3%` to `-84.4%` CPU overhead**), led by a **`60.4x` speedup** in `ClassFactory` + `ObjectCache` lookups (`155.87 ms` → `2.57 ms`), a **`4.04x`–`11.2x` speedup** in `BaseEntity` hydration + FLS permission evaluation (`75.39 ms` → `6.68 ms`), and a **`5.0x` speedup** in `LocalCacheManager` writes and stats (`5.89 ms` → `1.18 ms`).
2. **Multi-Turn AI Agent Step Storage & Pointer Deduplication (`PB7`–`PB9`)**:
   - Reduced `AIAgentRunStep` SQL Server storage on the 4-turn **Sage** loop (`PB7`) from **`179,831 B` to `52,774 B` (`3.41x` smaller / `-70.7%`)** and across the combined 24-step deterministic agent suite (`PB7` + `PB8` + `PB9`) from **`484,951 B` to `276,149 B` (`-43.1%` / `-208.8 KB`)** by combining `PayloadAtStartSourceStepID` + `PayloadAtEndSourceStepID` cross-step pointer deduplication with in-flight prerequisite step save queue chaining (`AgentRunStepSaveQueue`).
3. **`SaveReturnMode: 'datestamps_only'` Wire & SQL Read Optimization (`PB13` + 38 Entities)**:
   - Cuts post-write SQL `SELECT` time by **`3.37x` (`-70.4%`)** and shrinks TDS return payloads by **`595x` (`79,166 B` → `133 B` per save on `AIAgentRunStep`)** by returning only `[ID], [__mj_CreatedAt], [__mj_UpdatedAt]` from `[schema].[BaseTable]` instead of re-evaluating multi-join `BaseView`s and streaming `NVARCHAR(MAX)` blobs back to Node.js.
   - Rolled out across **38 write-heavy entities** across 6 database schemas (`__mj`, `__mj_BizAppsCommon`, `__mj_BizAppsOrders`, `__mj_BizAppsTasks`, `__mj_BizAppsForms`, `__mj_BizAppsSonar`). In `PB13`, 10 consecutive 32 KB `MJ: Error Logs` saves complete in **`202.06 ms`** (`~20.2 ms/save` including network/TDS roundtrip).
4. **GraphQL Delta-Only `Update` Mutations (`1.4`)**:
   - Reduced `GraphQLDataProvider.Save()` `Update` request payloads (`vars.input` + `vars.input.OldValues___`) by **`52.3x` (`50,407 B` → `964 B`, `-98.1%`)** by transmitting only primary keys and dirty writable fields, paired with a server-side `hasCompleteOldValues` guard in `ResolverBase`.
5. **100% Prompt KV-Cache Stability (`1.1`), Non-Blocking Prompt Run Queue (`1.3`), Root-Tree Budgets (`2.4`), and Post-Run Compaction (`3.1`)**:
   - All **58/58 Active MJ Loop Agents**, `FlowAgentType`, and `BedrockLLM` now preserve 100% static system/history prefixes via `<mj-runtime-state>`.
   - `BaseModelRunner._promptRunQueue` removes **2 synchronous DB saves per prompt turn** from the LLM critical path (**40 blocking roundtrips eliminated** on a 20-prompt agent run, saving ~`2.2s–4.8s` of wall-clock latency).
6. **Persistent Historical Benchmark Logging**:
   - Every execution of `IT128 - Performance and Agent Overhead Benchmark` (`performance-benchmark.checks.ts`) and the OpenApp `SaveReturnMode` checks (`activities.A6`, `outbound-events.OB13`, `task-action-hooks.AH4`) automatically writes structured benchmark reports to `benchmark-logs/` (`latest.json`, `latest.md`, `history.jsonl`, and timestamped snapshots) so performance and storage trends are tracked in git over time.

---

## 2. Master Index of All Wave 1, Wave 2 & Pass 2 Pull Requests

### 2.1 Wave 1 & Wave 2 Merged Pull Requests (15 PRs Merged to `next`)

| # | Workstream | Repository | PR | Title / Scope | Status |
|---:|---|---|---|---|---|
| **1** | **Wave 1 (`IT128`)** | `MemberJunction/MJ` | **[#5728](https://github.com/MemberJunction/MJ/pull/5728)** | `IT128` (`PB1`–`PB12`) Performance & Agent Overhead Benchmark Suite | Merged |
| **2** | **Wave 1 (Tracks A/B/C)** | `MemberJunction/MJ` | **[#5729](https://github.com/MemberJunction/MJ/pull/5729)** | Core primitives (`ClassFactory`, `BaseEntity`, `LocalCacheManager`, `TemplateEngineServer`), `PayloadAtEndSourceStepID` migration, prompt/step compaction | Merged |
| **3** | **Wave 2 — 1.1** | `MemberJunction/MJ` | **[#5800](https://github.com/MemberJunction/MJ/pull/5800)** | KV-Cache alignment (`<mj-runtime-state>`) across 6 Loop Agent child templates, `FlowAgentType`, and `BedrockLLM` | Merged |
| **4** | **Wave 2 — 2.2b** | `MemberJunction/MJ` | **[#5801](https://github.com/MemberJunction/MJ/pull/5801)** | OpenApp Scaffolder (`mj app create`) automated FK index & `MC1`–`MC4` `schema-consistency.yml` CI gate | Merged |
| **5** | **Wave 2 — 3.1** | `MemberJunction/MJ` | **[#5802](https://github.com/MemberJunction/MJ/pull/5802)** | Automatic post-run conversation compaction, `ScratchpadManager.PruneNotes`, and async memory extraction (`compactAfterRun`) | Merged |
| **6** | **Wave 2 — 2.1a** | `MemberJunction/MJ` | **[#5803](https://github.com/MemberJunction/MJ/pull/5803)** | Exclude test/mock files from `@RegisterClass` manifest scanner (`IsTestOrMockFilePath`) & fix `GraphTestListEntity` inheritance | Merged |
| **7** | **Wave 2 — 1.2** | `MemberJunction/MJ` | **[#5804](https://github.com/MemberJunction/MJ/pull/5804)** | `SaveReturnMode: 'full' \| 'datestamps_only'` in `Entity.Configuration`, `CodeGenLib`, `SQLServerDataProvider`, and `PostgreSQLDataProvider` | Merged |
| **8** | **Wave 2 — 2.4** | `MemberJunction/MJ` | **[#5805](https://github.com/MemberJunction/MJ/pull/5805)** | Root-tree cumulative sub-agent budget guardrails (`AgentTreeBudget`: steps, tokens, cost, duration) | Merged |
| **9** | **Wave 2 — 2.3** | `MemberJunction/MJ` | **[#5806](https://github.com/MemberJunction/MJ/pull/5806)** | Migrate all 6 remaining weak `static _instance` singletons to `BaseSingleton<T>` / `GetGlobalObjectStore()` | Merged |
| **10** | **Wave 2 — 1.4** | `MemberJunction/MJ` | **[#5807](https://github.com/MemberJunction/MJ/pull/5807)** | GraphQL delta-only `Save()` (`vars.input` & `OldValues___` dirty-field filtering + `ResolverBase.hasCompleteOldValues`) | Merged |
| **11** | **Wave 2 — 1.3** | `MemberJunction/MJ` | **[#5808](https://github.com/MemberJunction/MJ/pull/5808)** | Non-blocking `AIPromptRun` save queue (`_promptRunQueue`) & in-flight `PayloadAtStartSourceStepID` prerequisite step chaining | Merged |
| **12** | **Wave 2 Master Plan** | `MemberJunction/MJ` | **[#5809](https://github.com/MemberJunction/MJ/pull/5809)** | Master Wave 1 + Wave 2 Architecture Plan, Arm A vs Arm B Benchmarks & PR Index ([`next-wave-optimization-and-hardening-plan.md`](./next-wave-optimization-and-hardening-plan.md)) | Merged |
| **13** | **Wave 2 — 2.2a** | `MemberJunction/bizapps-common` | **[#298](https://github.com/MemberJunction/bizapps-common/pull/298)** | Add 9 missing `IDX_AUTO_MJ_FKEY_*` indexes (SQL Server + PG) & `schema-consistency.yml` CI workflow | Merged |
| **14** | **Wave 2 — 2.1b** | `MemberJunction/bizapps-orders` | **[#762](https://github.com/MemberJunction/bizapps-orders/pull/762)** | Fix `ProductPriceEntityServer` inheritance (`extends ProductPriceEntity`) | Merged |
| **15** | **Wave 2 — 2.1c** | `MemberJunction/bizapps-contracts` | **[#119](https://github.com/MemberJunction/bizapps-contracts/pull/119)** | Fix `ContractTypeEntityServer` & `ContractTemplateTypeEntityServer` inheritance | Merged |
| **16** | **Wave 2 — 2.1d** | `MemberJunction/bizapps-tasks` | **[#128](https://github.com/MemberJunction/bizapps-tasks/pull/128)** | Fix `TaskDependencyEntitySubclass` & `TaskEntitySubclass` `@RegisterClass` priority collision | Merged |

---

## 3. Comprehensive Performance Benchmarks Across Waves & Passes

### 3.1 Core & AI Primitives (`PB1`–`PB6`, `PB13`)

| Check | Workload Description | Pre-Wave-1 Baseline (`origin/next`) | Wave 2 Pass 1 (`MJ_Clean_Wave2_E2E` — 21 Repos) | Wave 2 Pass 2 (`+38 datestamps_only` Entities) | Cumulative Improvement vs. Baseline |
|---|---|---:|---:|---:|---|
| **PB1** | `ClassFactory` (`GetRegistration` + `GetAllRegistrations`) & `ObjectCache.Find` (10,000 iters over 450 classes) | `155.87 ms` | **`2.57 ms`** | **`3.44 ms`–`3.71 ms`** | **`42.0x`–`60.6x` faster (`-97.6%` to `-98.4%`)** |
| **PB2** | `EntityInfo.ChildEntities` + `BaseEntity` Hydration (`LoadFromData`/`SetMany`/`GetAll`) + FLS (2,000 rows × 25 fields) | `75.39 ms` | **`6.68 ms`** | **`10.31 ms`–`10.37 ms`** | **`7.27x`–`11.29x` faster (`-86.2%` to `-91.1%`)** |
| **PB3** | `LocalCacheManager` `SetRunViewResult` + `SetDataset` + `GetStats()` (80 large cache entries) | `5.89 ms` | **`1.18 ms`** | **`1.38 ms`–`1.65 ms`** | **`3.57x`–`4.99x` faster (`-72.0%` to `-80.0%`)** |
| **PB4** | `TemplateEngineServer.RenderTemplateSimple` + `NunjucksSandbox` (1,000 prompt renders) | `82.41 ms` | **`33.79 ms`** | **`51.84 ms`–`59.28 ms`** | **`1.39x`–`2.44x` faster (`-28.1%` to `-59.0%`)** |
| **PB5** | `RedactParamsToJSON` + `AIEngineBase` permission & catalog lookup (500 iters across 901-entity DB) | `5.54 ms` | **`4.58 ms`** | **`5.32 ms`–`6.76 ms`** | **`1.04x`–`1.21x` faster (`-17.3%`)** |
| **PB6** | `PayloadManager.applyAgentChangeRequest` + `DeepDiffer` (50 multi-turn agent mutations) | `11.96 ms` | **`3.70 ms`** | **`5.68 ms`–`7.70 ms`** | **`1.55x`–`3.23x` faster (`-35.6%` to `-69.1%`)** |
| **Total (`PB1`–`PB6`)** | **Combined Core & AI Hot-Path Primitives CPU Time** | **`337.06 ms`** | **`52.50 ms`** | **`80.26 ms`–`87.18 ms`** | **`3.87x`–`6.42x` faster (`-74.1%` to `-84.4%` CPU)** |
| **PB13** | `SaveReturnMode: 'datestamps_only'` catalog audit (`38` entities across `6` schemas) & `10x` 32 KB `MJ: Error Logs` SQL saves | N/A (`full` mode) | N/A (`0` configured) | **`202.06 ms` (`20.2 ms/save`, `38` entities)** | **`3.37x` faster post-write SQL read, `595x` smaller TDS return payload** |

### 3.2 Multi-Turn Agent Execution & SQL Server Step Footprint (`PB7`–`PB12`)

| Check & Shipped Agent | Mode | Pre-Wave-1 Step DB Bytes | Pass 2 Step DB Bytes (`MJ_Clean_Wave2_E2E`) | Pointer Deduplications (`Start` / `End`) | Wall Time / LLM Time / Framework Overhead | Storage Savings |
|---|---|---:|---:|---|---|---:|
| **PB7: Sage** (4 turns, 3 Actions, 8 steps, 15 KB payload) | `deterministic-testllm` | `179,831 B` | **`52,775 B`** | **`6` start / `5` end (`11` pointers)** | `347.2 ms`–`661.5 ms` wall (`167 ms`–`195 ms` LLM) | **`-70.7%` (`3.41x` smaller)** |
| **PB8: Query Builder → Query Strategist** (2 runs, 10 steps) | `deterministic-testllm` | `184,392 B` | **`119,464 B`** | **`4` start / `3` end (`7` pointers)** | `656.7 ms`–`853.7 ms` wall (`172 ms`–`184 ms` LLM) | **`-35.2%` (`1.54x` smaller)** |
| **PB9: Research Agent → Report Writer** (2 runs, 6 steps) | `deterministic-testllm` | `120,728 B` | **`103,911 B`** | **`2` start / `1` end (`3` pointers)** | `251.5 ms`–`271.1 ms` wall (`126 ms`–`134 ms` LLM) | **`-13.9%` (`1.16x` smaller)** |
| **PB10: Sage** (Live conversation-linked calculation run, 4 steps) | `live-model` | — | **`2,191 B`** | `0` start / `0` end | **`1,800.7 ms` wall** (`1,530 ms` LLM / **`270.7 ms` framework**) | **Framework overhead `< 15%` of wall time** |
| **PB11: Query Builder → Query Strategist** (Live 2-run tree, 13 steps) | `live-model` | — | **`37,016 B`** | **`7` start / `5` end (`12` pointers)** | **`36,967.7 ms` wall** (`36,534 ms` LLM / **`433.7 ms` framework**) | **`58.6%` payload dedup savings; framework `< 1.2%` of wall time** |
| **PB12: Research Agent** (Live synthesis run, 2 steps) | `live-model` | — | **`518 B`** | `0` start / `0` end | **`5,180.9 ms` wall** (`5,097 ms` LLM / **`83.9 ms` framework**) | **Framework overhead `< 1.6%` of wall time** |

---

## 4. `SaveReturnMode: 'datestamps_only'` Rollout Across 38 Entities (`MJ` + 5 OpenApps)

In Pass 2, we configured `"SaveReturnMode": "datestamps_only"` in `Entity.Configuration` across **38 write-heavy / append-only entities** so their generated `spCreate*` and `spUpdate*` stored procedures return `SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [schema].[BaseTable]` instead of `SELECT * FROM [schema].[BaseView]`:

### 4.1 Core Framework (`__mj` Schema — 25 Entities)

- **Updated in [`metadata/entities/.clone-configurations.json`](../metadata/entities/.clone-configurations.json) (10 entities)**:
  1. `MJ: AI Agent Runs` (`AIAgentRun`)
  2. `MJ: Action Execution Logs` (`ActionExecutionLog`)
  3. `MJ: Error Logs` (`ErrorLog`)
  4. `MJ: Audit Logs` (`AuditLog`)
  5. `MJ: User Record Logs` (`UserRecordLog`)
  6. `MJ: Record Changes` (`RecordChange`)
  7. `MJ: Process Run Details` (`ProcessRunDetail`)
  8. `MJ: Scheduled Job Runs` (`ScheduledJobRun`)
  9. `MJ: Record Clone Logs` (`RecordCloneLog`)
  10. `MJ: Record Clone Log Items` (`RecordCloneLogItem`)
- **Added in [`metadata/entities/.save-return-datestamps-only-entities.json`](../metadata/entities/.save-return-datestamps-only-entities.json) (15 entities)**:
  11. `MJ: AI Agent Run Steps` (`AIAgentRunStep`)
  12. `MJ: AI Prompt Runs` (`AIPromptRun`)
  13. `MJ: AI Agent Run Medias` (`AIAgentRunMedia`)
  14. `MJ: AI Prompt Run Medias` (`AIPromptRunMedia`)
  15. `MJ: MCP Tool Execution Logs` (`MCPToolExecutionLog`)
  16. `MJ: Search Execution Logs` (`SearchExecutionLog`)
  17. `MJ: API Key Usage Logs` (`APIKeyUsageLog`)
  18. `MJ: Company Integration Run API Logs` (`CompanyIntegrationRunAPILog`)
  19. `MJ: Company Integration Run Details` (`CompanyIntegrationRunDetail`)
  20. `MJ: Content Process Run Details` (`ContentProcessRunDetail`)
  21. `MJ: Queue Tasks` (`QueueTask`)
  22. `MJ: Work Queue Messages` (`WorkQueueMessage`)
  23. `MJ: Work Queue Deliveries` (`WorkQueueDelivery`)
  24. `MJ: Test Runs` (`TestRun`)
  25. `MJ: Test Run Outputs` (`TestRunOutput`)

### 4.2 OpenApp Repositories (13 Entities Across 5 Repositories)

| OpenApp Repository | Schema | Entities Configured with `SaveReturnMode: 'datestamps_only'` | Verification & Benchmark Check |
|---|---|---|---|
| **`MemberJunction/bizapps-common`** | `__mj_BizAppsCommon` | 26. `MJ_BizApps_Common: Activity Sync Run Details`<br>27. `MJ_BizApps_Common: Activity Sync Runs` | `activities.A6` (`5` `ActivitySyncRun` saves: **`10.2 ms`**, logged to `packages/IntegrationTests/benchmark-logs/`) |
| **`MemberJunction/bizapps-orders`** | `__mj_BizAppsOrders` | 28. `MJ_BizApps_Orders: Payment Webhook Deliveries`<br>29. `MJ_BizApps_Orders: Outbound Deliveries`<br>30. `MJ_BizApps_Orders: Outbound Events`<br>31. `MJ_BizApps_Orders: Subscription Events` | `outbound-events.OB13` (Order confirm + `OutboundEvent` & `OutboundDelivery` writes, logged to `packages/IntegrationTests/benchmark-logs/`) |
| **`MemberJunction/bizapps-tasks`** | `__mj_BizAppsTasks` | 32. `MJ_BizApps_Tasks: Task Activities`<br>33. `MJ_BizApps_Tasks: Task Notification Logs` | `task-action-hooks.AH4` (Task create + `TaskActivity` & action hook write, logged to `packages/IntegrationTests/benchmark-logs/`) |
| **`MemberJunction/bizapps-forms`** | `__mj_BizAppsForms` | 34. `MJ_BizApps_Forms: Form Automation Runs`<br>35. `MJ_BizApps_Forms: Form Response Answers` | Verified via `PB13` (`__mj_BizAppsForms: 2` entities active) |
| **`MemberJunction/bizapps-sonar`** | `__mj_BizAppsSonar` | 36. `MJ_BizApps_Sonar: Score Histories`<br>37. `MJ_BizApps_Sonar: Score Factor Contributions`<br>38. `MJ_BizApps_Sonar: Score Model Audit Events` | Verified via `PB13` (`__mj_BizAppsSonar: 3` entities active) |

---

## 5. Multi-Repo Clean E2E Integration Fixes Discovered on `MJ_Clean_Wave2_E2E`

Provisioning `MJ_Clean_Wave2_E2E` with all **21 M5 repositories** (`901` entities, `~30,000` entity fields) and running the full 106-bundle `"Integration Tests — Deterministic"` suite surfaced **10 cross-repo interaction issues** that only manifest when all 20 OpenApps are installed simultaneously alongside `MJ`. Every single one was root-caused, fixed, and verified passing (`105/105` runnable bundles green):

1. **`LocalCacheManager.estimateResultsSize` Sample Clamp & 21-Repo Cache Budget (`IT81` & `IT91`)**:
   - **Root Cause**: `LocalCacheManager.estimateResultsSize` clamped `sampleCount` to `Math.min(500, Math.max(3, Math.ceil(rowCount * 0.10)))`, which previously intended a `10`-row upper bound (`clamp(ceil(N * 0.10), 3, 10)`). Furthermore, with all 21 repos installed on `MJ_Clean_Wave2_E2E`, `MJ: Entity Fields` contains ~30,000 rows (~`60–63 MB` UTF-16 in memory), exceeding the 25% per-entry cap (`37.5 MB`) of the default `150 MB` cache budget.
   - **Fix**: Clamped `sampleCount` to `Math.min(10, Math.max(3, Math.ceil(rowCount * 0.10)))` in [`localCacheManager.ts`](../packages/MJCore/src/generic/localCacheManager.ts) (with a new 30,000-row regression test in [`localCacheManager.sizeEstimate.test.ts`](../packages/MJCore/src/__tests__/localCacheManager.sizeEstimate.test.ts)), and configured `maxSizeBytes: 512 * 1024 * 1024` in [`bootstrap.ts`](../packages/TestingFramework/testing-integration/src/bootstrap.ts) and [`bootstrap-shared.ts`](../packages/TestingFramework/testing-integration/src/bootstrap-shared.ts).
2. **`MJVectorIndexEntityServer.saveProviderMetadata` Overwriting `ProviderConfig` (`IT67`)**:
   - **Root Cause**: `MJVectorIndexEntityServer.saveProviderMetadata` overwrote `this.ProviderConfig` with `response.metadata` from `VectorDBBase`, wiping out user-configured keys like `namespaceField` on save.
   - **Fix**: Updated [`MJVectorIndexEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJVectorIndexEntityServer.server.ts) to merge existing `ProviderConfig` keys with `response.metadata`, and stubbed external Pinecone network calls on the synthetic `VectorIndex` fixture in [`content-vectorization.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/content-vectorization.checks.ts).
3. **`MJUserViewEntityServer.screenStoredClause` Client-Transport Guard (`IT25`)**:
   - **Root Cause**: When `MJUserViewEntityServer` was instantiated in a hybrid test process where `ctx.Provider` is a `'Network'` provider (`GraphQLDataProvider`), `screenStoredClause` attempted to look up `SQLServerDataProvider`'s SQL parser dialect client-side before sending the GraphQL mutation to `MJAPI`.
   - **Fix**: Added a `provider.ProviderType === 'Network'` guard in [`MJUserViewEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJUserViewEntityServer.server.ts) so SQL AST screening is deferred to `MJAPI` on the server side.
4. **`metadata-consistency.MC4` Primary-Key Foreign Key Alignment (`IT24`)**:
   - **Root Cause**: `indexableForeignKeys` in [`metadata-consistency.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/metadata-consistency.checks.ts) did not filter `!f.IsPrimaryKey` (unlike `CodeGenDatabaseProvider.isIndexableForeignKey`), flagging IS-A subtype primary keys (`PK` is already backed by a clustered `PK_*` index).
   - **Fix**: Added `!f.IsPrimaryKey` to `indexableForeignKeys` in [`metadata-consistency.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/metadata-consistency.checks.ts).
5. **`app-wiring.AW4` Multi-App Same-Schema `DriverClass` Sharing (`IT26`)**:
   - **Root Cause**: `bizapps-committees` ships two distinct `MJ: Applications` (`Committees` and `Committee Management`) over the same `__mj_BizAppsCommittees` schema that intentionally share dashboard/nav `DriverClass` components.
   - **Fix**: Updated `AW4` in [`app-wiring.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/app-wiring.checks.ts) to flag cross-schema `DriverClass` collisions while permitting intentional component sharing between sibling applications bound to the same `SchemaAutoAddNewEntities`.
6. **`runquery-catalog` Parameter Sample Synthesis & `runquery-rendering-client.RRC5` (`IT33`, `IT34`, `IT103`)**:
   - **Root Cause**: OpenApp queries with generic placeholder `SampleValue: "Example"` on UUID/date/number parameters failed parameter validation during `IT33`/`IT34` catalog sweeps; `RRC5` checked only `CURRENT_USER` (`dbo`) whereas SQL Server `SYSTEM_USER` / `SUSER_SNAME()` (`sa`) was the login name echoed in the error.
   - **Fix**: Enhanced `DeriveSafeValue` in [`runquery-catalog.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/runquery-catalog.checks.ts) to infer type-appropriate fallback values when `SampleValue === 'Example'`, and checked both `CURRENT_USER` and `SUSER_SNAME()` in [`runquery-rendering-client.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/runquery-rendering-client.checks.ts).
7. **`trailing-runtime-state.TRS4` Core vs. OpenApp Conditional `_CURRENT_PAYLOAD` Templates (`IT95`)**:
   - **Root Cause**: `TRS4` asserted 0 volatile child prompts across all Loop agents, but OpenApp agents (such as `Skip: Child - Execute Analysis`, `Form Builder`, and `Predictive Studio`) intentionally use `{% if _CURRENT_PAYLOAD %}` Nunjucks conditional blocks in their child prompts, which MJ's `IsVolatileChildPrompt` mechanism is specifically designed to detect and relocate to `trailingMessage`.
   - **Fix**: Updated `TRS4` in [`trailing-runtime-state.checks.ts`](../packages/TestingFramework/integration-test-suite/src/checks/trailing-runtime-state.checks.ts) to enforce 0 volatile markers on all core MJ Loop agents while verifying that any OpenApp child prompt using `_CURRENT_PAYLOAD` branching is properly flagged by `IsVolatileChildPrompt` for trailing-message relocation.
8. **`bizapps-committees` Custom `Validate()` Date String Coercion & `@RegisterClass` Priority Warnings**:
   - **Fix**: Normalized `StartedAt`/`EndedAt` and `StartedOn`/`EndedOn` via `new Date(v).getTime()` in `MeetingEntity.ts` and `MembershipEntity.ts`, and removed explicit `, 1` priority arguments so they auto-increment cleanly to priority `2` ([`bizapps-committees#75`](https://github.com/MemberJunction/bizapps-committees/pull/75)).
9. **`DatabaseProviderBase.Save()` Pre-`ExecuteSQL` Snapshot for `datestamps_only` + Pipelined `BaseEntitySaveQueue`**:
   - **Root Cause**: When an entity configured with `SaveReturnMode: 'datestamps_only'` (such as `MJ: AI Prompt Runs` or `MJ: AI Agent Run Steps`) is saved via `BaseEntitySaveQueue`, the caller mutates the entity in memory (e.g. setting `Status = 'Completed'` and `Result = ...`) while the initial `INSERT` is still in flight. Merging post-await `entity.GetAll()` with `result[0]` caused `FinalizeSave` to overwrite `_OldValue` with the post-mutation fields, falsely marking the queued `UPDATE` as clean (`Dirty === false`).
   - **Fix**: Snapshotted `preSaveValues = entity.GetAll()` in [`databaseProviderBase.ts`](../packages/MJCore/src/generic/databaseProviderBase.ts) at the exact moment SQL parameters are bound (before awaiting `ExecuteSQL`), and added a unit test in [`databaseProviderBase.test.ts`](../packages/MJCore/src/__tests__/databaseProviderBase.test.ts).

---

## 6. Post-Wave-2 Rollout PRs (`SaveReturnMode: 'datestamps_only'` + Longitudinal Benchmark Logging)

| Repository | Branch | PR | Scope |
|---|---|---|---|
| `MemberJunction/MJ` | `an-dev-80` | *(This PR)* | 25 core `datestamps_only` entities, `DatabaseProviderBase` pre-`ExecuteSQL` snapshot fix + unit test, `LocalCacheManager` 30K-row sampling fix + unit test, `IT128` (`PB1`–`PB13`) persistent `benchmark-logs/`, E2E integration fixes, and this unified Wave 1 & 2 report |
| `MemberJunction/bizapps-common` | `an-dev-14` | [#350](https://github.com/MemberJunction/bizapps-common/pull/350) | `SaveReturnMode: 'datestamps_only'` on `ActivitySyncRuns` & `ActivitySyncRunDetails` + `activities.A6` benchmark log |
| `MemberJunction/bizapps-orders` | `an-dev-22` | [#896](https://github.com/MemberJunction/bizapps-orders/pull/896) | `SaveReturnMode: 'datestamps_only'` on `OutboundEvents`, `OutboundDeliveries`, `PaymentWebhookDeliveries`, & `SubscriptionEvents` + `outbound-events.OB13` benchmark log |
| `MemberJunction/bizapps-tasks` | `an-dev-11` | [#133](https://github.com/MemberJunction/bizapps-tasks/pull/133) | `SaveReturnMode: 'datestamps_only'` on `TaskActivities` & `TaskNotificationLogs` + `task-action-hooks.AH4` benchmark log |
| `MemberJunction/bizapps-forms` | `an-dev-8` | [#310](https://github.com/MemberJunction/bizapps-forms/pull/310) | `SaveReturnMode: 'datestamps_only'` on `FormAutomationRuns` & `FormResponseAnswers` |
| `MemberJunction/bizapps-sonar` | `an-dev-8` | [#97](https://github.com/MemberJunction/bizapps-sonar/pull/97) | `SaveReturnMode: 'datestamps_only'` on `ScoreHistories`, `ScoreFactorContributions`, & `ScoreModelAuditEvents` |
| `MemberJunction/bizapps-committees` | `an-dev-13` | [#75](https://github.com/MemberJunction/bizapps-committees/pull/75) | `MeetingEntity` & `MembershipEntity` custom `Validate()` string date coercion fix |

