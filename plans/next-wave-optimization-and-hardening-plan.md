# MemberJunction Wave 1 + Wave 2: Performance, Robustness & Agent Automation — Master Execution Plan, Integrated Benchmarks & PR Index

> **Status**: All Approved Workstreams Implemented, Combined onto Multi-Repo Integration Branch (`integration/wave1-and-wave2-all-prs`), Verified End-to-End (Unit + Live-DB Integration Suites on `MJ_IT_ARM_B_INTEGRATED`), Benchmarked Head-to-Head (`Arm A: origin/next` vs `Arm B: Integrated`), Documented, and Ready to Merge.
> **Master Plan PR**: **[MJ PR #5809](https://github.com/MemberJunction/MJ/pull/5809)**
> **Wave 1 Predecessor PRs**: [PR #5728 (`IT123` Benchmark Suite — Merged)](https://github.com/MemberJunction/MJ/pull/5728) & **[PR #5729 (Wave 1 Track A/B/C Core & Agent Optimizations)](https://github.com/MemberJunction/MJ/pull/5729)**

---

## 📈 Executive Performance Benchmark Summary: Arm A (`origin/next`) vs Arm B (`Integrated` Across All 14 PRs)

To validate the cumulative impact of all 14 open PRs before merging into `next`, we assembled a multi-repository integration environment combining all `MemberJunction/MJ` PR branches (`#5729`, `#5800`–`#5808`) and all 4 OpenApp PR branches (`bizapps-common#298`, `bizapps-orders#762`, `bizapps-contracts#119`, `bizapps-tasks#128`) against isolated SQL Server databases (`MJ_IT_ARM_A_NEXT` vs `MJ_IT_ARM_B_INTEGRATED`).

### 1. Core Framework Hot-Path Primitives (`PB1`–`PB6` on `IT123`)

| Benchmark Check | Workload | Arm A (`origin/next`) | Arm B (`Integrated`) | Speedup / Improvement | Attributable PR(s) |
|---|---|---:|---:|---:|---|
| **`PB1`: `ClassFactory` & `ObjectCache`** | 10,000 iterations over 450 registered classes (`GetRegistration` + `GetAllRegistrations` + `ObjectCache`) | `155.87 ms` | **`2.58 ms`** | **`60.4x` faster (`-98.3%`)** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729), [MJ #5803](https://github.com/MemberJunction/MJ/pull/5803) |
| **`PB2`: `BaseEntity` Hydration & FLS** | 2,000 rows × 25 fields (`LoadFromData` + `CheckPermissions` + `EntityInfo.Fields` lookup) | `75.39 ms` | **`18.66 ms`** | **`4.04x` faster (`-75.2%`)** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729) |
| **`PB3`: `LocalCacheManager` Writes & `GetStats`** | 80 large dataset cache entries (`SetRunViewResult` + `GetStats` running counter) | `5.89 ms` | **`1.12 ms`** | **`5.26x` faster (`-81.0%`)** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729) |
| **`PB4`: `TemplateEngineServer.RenderTemplateSimple`** | 1,000 renders across 20 distinct Nunjucks templates (compiled template LRU cache) | `82.41 ms` | **`34.31 ms`** | **`2.40x` faster (`-58.4%`)** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729) |
| **`PB5`: `RedactParamsToJSON` & `AIEngine` Permissions** | 500 iterations of action param redaction & single-pass `Set` role/user permission evaluation | `5.54 ms` | **`5.20 ms`** | **`1.07x` faster (`-6.1%`)** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729) |
| **`PB6`: `PayloadManager.applyAgentChangeRequest`** | 50 agent turns of access control, snapshot clone, mutation & `DeepDiffer` | `11.96 ms` | **`4.57 ms`** | **`2.62x` faster (`-61.8%`)** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729) |
| **Total Core Primitives CPU Time (`PB1`–`PB6`)** | **Combined CPU execution time across all 6 hot-path benchmarks** | **`337.06 ms`** | **`66.44 ms`** | **`5.07x` faster (`-80.3%` CPU)** | **[MJ #5729](https://github.com/MemberJunction/MJ/pull/5729) + Wave 2** |

---

### 2. Multi-Turn Agent Run Storage & Pointer Deduplication (`PB7`–`PB9` on `IT123`)

| Agent Benchmark (`TestLLM` Deterministic) | Metric | Arm A (`origin/next`) | Arm B (`Integrated`) | Delta / Savings | Attributable PR(s) |
|---|---|---:|---:|---:|---|
| **`PB7`: `Sage` (4-Turn Loop + 3 Actions, 8 Steps)** | Total `AIAgentRunStep` DB Bytes<br>`PayloadAtStart` / `PayloadAtEnd` Bytes<br>Pointer Deduplications (`Start` / `End`) | `179,831 B`<br>`62,698 B` / `109,720 B`<br>`3` / `0` (`3` total) | **`52,774 B`**<br>**`15,675 B` / `31,349 B`**<br>**`6` / `5` (`11` total)** | **`-70.7%` DB storage (`3.41x` smaller)**<br>`-75.0%` / `-71.4%` payload bytes<br>**`+8` pointer deduplications** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729), [MJ #5808](https://github.com/MemberJunction/MJ/pull/5808) |
| **`PB8`: `Query Builder` → `Query Strategist` (2 Runs, 10 Steps)** | Total `AIAgentRunStep` DB Bytes<br>`PayloadAtStart` / `PayloadAtEnd` Bytes<br>Pointer Deduplications (`Start` / `End`) | `184,392 B`<br>`48,426 B` / `96,869 B`<br>`3` / `0` (`3` total) | **`119,464 B`**<br>**`32,284 B` / `48,443 B`**<br>**`4` / `3` (`7` total)** | **`-35.2%` DB storage (`1.54x` smaller)**<br>`-33.3%` / `-50.0%` payload bytes<br>**`+4` pointer deduplications** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729), [MJ #5808](https://github.com/MemberJunction/MJ/pull/5808) |
| **`PB9`: `Research Agent` → `Report Writer` (2 Runs, 6 Steps)** | Total `AIAgentRunStep` DB Bytes<br>Wall-Clock / Framework Overhead Time<br>Pointer Deduplications (`Start` / `End`) | `120,728 B`<br>`234.55 ms` / `99.55 ms`<br>`2` / `0` (`2` total) | **`103,910 B`**<br>**`216.23 ms` / `86.23 ms`**<br>**`2` / `1` (`3` total)** | **`-13.9%` DB storage**<br>**`-7.8%` wall / `-13.4%` framework**<br>**`+1` pointer deduplication** | [MJ #5729](https://github.com/MemberJunction/MJ/pull/5729), [MJ #5808](https://github.com/MemberJunction/MJ/pull/5808) |
| **Combined Agent Suite (`PB7` + `PB8` + `PB9`, 24 Steps)** | **Aggregate `AIAgentRunStep` SQL Bytes**<br>**Total Pointer Deduplications** | **`484,951 B`**<br>`8` pointers | **`276,148 B`**<br>**`21` pointers** | **`-43.1%` total step storage (`-208.8 KB`)**<br>**`2.63x` more steps deduplicated** | **[MJ #5729](https://github.com/MemberJunction/MJ/pull/5729), [MJ #5808](https://github.com/MemberJunction/MJ/pull/5808)** |

---

### 3. Per-PR / Workstream Attribution Benchmarks (`WB1`–`WB7`)

| Workstream & PR(s) | Benchmark Dimension | Arm A (`origin/next`) | Arm B (`Integrated`) | Measured Gain / Attribution |
|---|---|---:|---:|---|
| **Item 1.1 — KV-Cache & `<mj-runtime-state>`**<br>[MJ #5800](https://github.com/MemberJunction/MJ/pull/5800) | Active Loop agents with 100% static system prompt<br>`FlowAgentType` `<mj-runtime-state>` alignment<br>`BedrockLLM` prompt cache breakpoints (`cachePoint`) | `52 / 58` (`89.7%`, 6 evicted)<br>`false` (`_CURRENT_PAYLOAD` inline)<br>`0` breakpoints emitted | **`58 / 58` (`100.0%`, 0 evicted)**<br>**`true` (`0` volatile placeholders)**<br>**`2` breakpoints (system + history)** | **+6 shipped Loop agents (`agent-manager`, `database-designer`, `model-development-agent`, `data-scout`, `experiment-designer`, `goal-analyst`), all Flow agents, and Bedrock Claude models now achieve 100% system/history KV-cache prefix stability.** |
| **Item 1.2 — `SaveReturnMode: 'datestamps_only'`**<br>[MJ #5804](https://github.com/MemberJunction/MJ/pull/5804) | Post-write SQL `SELECT` time (30 saves on 79 KB step row)<br>TDS bytes returned from SQL Server per `Save()`<br>Total TDS bytes returned across 30 saves | `70.56 ms` (`2.35 ms/save`)<br>`79,166 B / save`<br>`2,374,980 B` (`2.37 MB`) | **`20.92 ms` (`0.70 ms/save`)**<br>**`133 B / save`**<br>**`3,990 B` (`3.99 KB`)** | **`3.37x` faster post-write SQL read (`-70.4%`)** and **`595x` smaller TDS return payload (`-99.83%` wire bytes)** while preserving exact DB `__mj_CreatedAt` & `__mj_UpdatedAt`. |
| **Item 1.3 — Non-Blocking Save Queue & FK Chaining**<br>[MJ #5808](https://github.com/MemberJunction/MJ/pull/5808) | Synchronous blocking `AIPromptRun.Save()` calls (15 turns)<br>In-flight rapid-turn `PayloadAtStartSourceStepID` hits<br>Duplicate `PayloadAtStart` JSON bytes written (6 steps) | `30 / 30` blocking DB saves<br>`0 / 5` steps deduplicated<br>`140,425 B` duplicate JSON | **`0 / 30` blocking (`100%` queued)**<br>**`5 / 5` steps deduplicated (`100%`)**<br>**`0 B` duplicate JSON** | **Eliminates `2` synchronous DB roundtrips per prompt turn** from the LLM critical path and **eliminates `100%` (`140.4 KB`) of rapid-turn duplicate `PayloadAtStart` writes** via `AgentRunStepSaveQueue` prerequisite chaining. |
| **Item 1.4 — GraphQL Delta-Only `Save()`**<br>[MJ #5807](https://github.com/MemberJunction/MJ/pull/5807) | Fields serialized in `vars.input` on 1-field `Update`<br>Entries serialized in `vars.input.OldValues___`<br>GraphQL JSON payload per save / across 50 saves | `20` fields<br>`24` `OldValues___` entries<br>`50,407 B` / `2,520,390 B` (`2.52 MB`) | **`2` fields (`ID` + dirty field)**<br>**`2` `OldValues___` entries**<br>**`964 B` / `48,240 B` (`48.2 KB`)** | **`52.3x` smaller GraphQL `Update` request payload (`-98.09%` wire bytes)** and `-90%` field entries serialized, with full server-side `hasCompleteOldValues` DB truth protection. |
| **Item 2.1 — `ClassFactory` Collision Elimination**<br>[MJ #5803](https://github.com/MemberJunction/MJ/pull/5803), [orders #762](https://github.com/MemberJunction/bizapps-orders/pull/762), [contracts #119](https://github.com/MemberJunction/bizapps-contracts/pull/119), [tasks #128](https://github.com/MemberJunction/bizapps-tasks/pull/128) | `ClassFactory.Register` collision warnings at bootstrap<br>`Task Dependencies` & `Tasks` subclass priority<br>Test/mock files excluded from manifest scanner | `5` collision warnings<br>`@1` (colliding with codegen `@1`)<br>`false` (`GraphTestListEntity` leaked) | **`0` collision warnings**<br>**`@2` (clean auto-increment)**<br>**`true` (`IsTestOrMockFilePath`)** | **100% elimination of all 5 `ClassFactory` unrelated-class and duplicate-priority collisions** across `MJ` and OpenApps (`MJ: Lists`, `Product Prices`, `Contract Types`, `Contract Template Types`, `Tasks`, `Task Dependencies`). |
| **Item 2.2 — OpenApp FK Indexes & CI Gate**<br>[common #298](https://github.com/MemberJunction/bizapps-common/pull/298), [MJ #5801](https://github.com/MemberJunction/MJ/pull/5801) | Indexed FK columns across all schemas (`IT24` `MC4`)<br>Missing `IDX_AUTO_MJ_FKEY_*` indexes in `BizAppsCommon`<br>Automated `schema-consistency.yml` in `mj app create` | `981 / 990` (`99.09%`)<br>`9` missing FK indexes<br>`false` | **`991 / 991` (`100.00%`)**<br>**`0` missing FK indexes**<br>**`true` (scaffolded by default)** | **100% FK index coverage (`991/991` FKs)** across core `__mj` and all installed OpenApp schemas, preventing full table scans on JOINs and `DELETE` cascades. |
| **Items 2.3, 2.4 & 3.1 — Singletons, Tree Budgets & Post-Run Compaction**<br>[MJ #5806](https://github.com/MemberJunction/MJ/pull/5806), [MJ #5805](https://github.com/MemberJunction/MJ/pull/5805), [MJ #5802](https://github.com/MemberJunction/MJ/pull/5802) | Weak `static _instance` singletons remaining<br>Root-tree sub-agent budget guard (`AgentTreeBudget`)<br>Post-run conversation compaction (28 → 10 msgs) | `6` weak singletons<br>`false` (per-agent `maxSteps` only)<br>`50,480 B` (`0%` reduction) | **`0` weak singletons (`62` in global store)**<br>**`true` (`steps`/`tokens`/`cost`/`duration`)**<br>**`16,812 B` (`-66.7%` prompt context)** | **100% `BaseSingleton` compliance**, shared root-to-leaf `AgentTreeBudget` across sequential/parallel sub-agents, and **`-66.7%` conversation context payload** on the next user turn with **0 ms** start-of-turn compaction latency. |

---

## 🛠️ Bugs Caught & Fixed During Multi-PR Integrated Verification

Assembling the multi-repo integration branch (`integration/wave1-and-wave2-all-prs`) and running the full live-DB integration test suite against `MJ_IT_ARM_B_INTEGRATED` caught **two subtle cross-cutting issues** before any PR was merged:

1. **`metadata-consistency.MC5` (`EntityField.Sequence` Drift on `MJ: AI Agent Run Steps` in Wave 1 [PR #5729](https://github.com/MemberJunction/MJ/pull/5729))**:
   - **Finding**: In `migrations/v6/V202610141910__v6.2.x__AIAgentRunStep_PayloadAtEndSourceStepID.sql` ([PR #5729](https://github.com/MemberJunction/MJ/pull/5729)), `PayloadAtEndSourceStepID` and virtual field `PayloadAtEndSourceStep` were inserted into `EntityField` using `COALESCE(MAX(Sequence), 0) + 1` (`Sequence = 37` and `38`). However, in `vwAIAgentRunSteps`, `PayloadAtEndSourceStepID` is a physical table column at `sys.columns.column_id = 29` (before the joined view columns `AgentRun`, `Parent`, `PayloadAtStartSourceStep`, `PayloadAtEndSourceStep`). `IT24` check `MC5` caught the `Sequence` mismatch (`expected 29, got 37`).
   - **Fix Applied & Pushed**: Added an idempotent `UPDATE ef SET ef.[Sequence] = c.column_id FROM [__mj].[EntityField] ef INNER JOIN sys.columns c ON c.object_id = OBJECT_ID('[__mj].[vwAIAgentRunSteps]') AND c.name = ef.[Name]` alignment block to `V202610141910__v6.2.x__AIAgentRunStep_PayloadAtEndSourceStepID.sql` and pushed to **[PR #5729](https://github.com/MemberJunction/MJ/pull/5729)** (`78a987ef2f`). `MC5` now passes with **0 offenders across 465 entities**.
2. **Dual-Transport Compatibility in `entity-writes.EW12` ([PR #5807](https://github.com/MemberJunction/MJ/pull/5807))**:
   - **Finding**: Integration check `entity-writes.EW12` tested concurrent non-overlapping updates (`Description` vs `ParentID`) assuming `ctx.Provider` was always a `GraphQLDataProvider` client connected to `MJAPI`. When the integration harness ran directly against `SQLServerDataProvider` in-process, `catB.Save()` called `spUpdateActionCategory` with all in-memory fields rather than executing the `GraphQLDataProvider` delta extraction + `ResolverBase.UpdateRecord` DB-truth merge path.
   - **Fix Applied & Pushed**: Updated `EW12` in `packages/TestingFramework/integration-test-suite/src/checks/entity-writes.checks.ts` so it exercises `cat.Save()` directly when `ctx.Provider` is `GraphQLDataProvider` (`isGraphQLTransport`) and exercises the exact delta extraction + server-truth `SetMany` merge contract when running on `SQLServerDataProvider`, and pushed to **[PR #5807](https://github.com/MemberJunction/MJ/pull/5807)** (`54f4b8f282`). Both `EW11` and `EW12` pass 100% on both transports.

---

## 🗺️ Master PR Index & Recommended Merge Order (All 15 PRs: Wave 1 + Wave 2 + Header Plan)

To guarantee a clean, conflict-free merge sequence across all repositories, merge in the following order:

### Phase A — Downstream OpenApp Repository PRs (4 PRs — Independent, Merge Anytime)

| Merge Order | Item | Repository | PR | Branch | Verification Summary |
|---:|---|---|---|---|---|
| **1** | **2.2a** | `MemberJunction/bizapps-common` | **[#298](https://github.com/MemberJunction/bizapps-common/pull/298)** | `fix/missing-fk-indexes` | Adds SQL Server & PostgreSQL migrations for all 9 missing `IDX_AUTO_MJ_FKEY_*` indexes in `__mj_BizAppsCommon` + `.github/workflows/schema-consistency.yml` CI gate. **95/95 guard tests + `IT24` `MC4` 991/991 FKs indexed (0 offenders).** |
| **2** | **2.1b** | `MemberJunction/bizapps-orders` | **[#762](https://github.com/MemberJunction/bizapps-orders/pull/762)** | `fix/product-price-server-entity-inheritance` | Fixes `ProductPriceEntityServer` to extend `ProductPriceEntity` (`@mj-biz-apps/orders-entities`), eliminating the `'MJ_BizApps_Orders: Product Prices'` collision and preserving client/shared `Validate()` rules. **3,289/3,289 unit tests passed.** |
| **3** | **2.1c** | `MemberJunction/bizapps-contracts` | **[#119](https://github.com/MemberJunction/bizapps-contracts/pull/119)** | `fix/contract-type-server-entity-inheritance` | Fixes `ContractTypeEntityServer` & `ContractTemplateTypeEntityServer` to extend `ContractTypeEntity` & `ContractTemplateTypeEntity` (`@mj-biz-apps/contracts-entities`). **50/50 unit tests passed, 0 collision warnings.** |
| **4** | **2.1d** | `MemberJunction/bizapps-tasks` | **[#128](https://github.com/MemberJunction/bizapps-tasks/pull/128)** | `fix/task-dependency-registration-priority` | Removes duplicate explicit priority `1` on `TaskDependencyEntitySubclass` & `TaskEntitySubclass` (auto-incrementing to `@2`) and replaces `.Get()`/`.Set()` with strong typing. **19/19 unit tests passed, 0 warnings.** |

### Phase B — `MemberJunction/MJ` Core, CodeGen, GraphQL, OpenApp & Singleton PRs (6 PRs)

| Merge Order | Item | Repository | PR | Branch | Verification Summary |
|---:|---|---|---|---|---|
| **5** | **Wave 1** | `MemberJunction/MJ` | **[#5729](https://github.com/MemberJunction/MJ/pull/5729)** | `an-dev-79` | Wave 1 Track A/B/C optimizations (`ClassFactory` + `ObjectCache` **60.4x**, `BaseEntity` hydration **4.04x**, `LocalCacheManager` **5.26x**, `TemplateEngineServer` **2.40x**, `PayloadAtEndSourceStepID` cross-step pointer deduplication **-70.7% storage** on Sage, including `MC5` `Sequence` fix). |
| **6** | **2.2b** | `MemberJunction/MJ` | **[#5801](https://github.com/MemberJunction/MJ/pull/5801)** | `feat/openapp-fk-index-ci-template` | Updates `@memberjunction/open-app-engine` (`app-scaffolder.ts`) so `mj app create` scaffolds `.github/workflows/schema-consistency.yml` and `.github/scripts/check-schema-consistency.mjs`. **498/498 unit tests + `IT24` (7/7) passed.** |
| **7** | **2.1a** | `MemberJunction/MJ` | **[#5803](https://github.com/MemberJunction/MJ/pull/5803)** | `fix/class-registrations-exclude-test-files` | Fixes `GraphTestListEntity` to extend `MJListEntityServer` and hardens `GenerateClassRegistrationsManifest` (`IsTestOrMockFilePath`) to exclude test/mock files across `src/` and `dist/`. **2,554/2,554 unit tests + `CR1`–`CR5` passed.** |
| **8** | **2.3** | `MemberJunction/MJ` | **[#5806](https://github.com/MemberJunction/MJ/pull/5806)** | `refactor/migrate-weak-singletons-to-base-singleton` | Migrates all 6 remaining weak singletons (`WellKnownUserSource`, `ArtifactBuilderService`, `RubricEngine`, `LibraryLintCache`, `SemanticValidatorRegistry`, `ComponentRegistryService`) to `BaseSingleton<T>` / `GetGlobalObjectStore()`. **4,648/4,648 unit tests passed.** |
| **9** | **1.2** | `MemberJunction/MJ` | **[#5804](https://github.com/MemberJunction/MJ/pull/5804)** | `perf/save-return-datestamps-only` | Adds `SaveReturnMode: 'full' \| 'datestamps_only'` to `IEntityConfiguration`, `EntityInfo`, `EntitySaveOptions`, `CodeGenLib`, and SQL Server / PG providers (**3.37x** faster post-write read, **595x** smaller TDS return payload). **2,547/2,547 unit tests + `EW11` passed.** |
| **10** | **1.4** | `MemberJunction/MJ` | **[#5807](https://github.com/MemberJunction/MJ/pull/5807)** | `perf/graphql-delta-only-save` | Filters `GraphQLDataProvider.Save()` `Update` payloads (`vars.input` and `OldValues___`) to PK + dirty writable fields (**52.3x** smaller wire payload, **-98.1%** bytes) + `ResolverBase.hasCompleteOldValues` guard. **3,964/3,964 unit tests + `EW12` passed.** |

### Phase C — `MemberJunction/MJ` AI Agent & Prompt Pipeline PRs + Master Plan PR (5 PRs)

*(Note: PRs `#5800`, `#5808`, `#5805`, and `#5802` touch `packages/AI/Agents/src/base-agent.ts` in separate functional areas; merging in order **11 → 12 → 13 → 14 → 15** matches the tested integration branch merge order.)*

| Merge Order | Item | Repository | PR | Branch | Verification Summary |
|---:|---|---|---|---|---|
| **11** | **1.1** | `MemberJunction/MJ` | **[#5800](https://github.com/MemberJunction/MJ/pull/5800)** | `perf/agent-kv-cache-alignment` | Aligns 6 shipped Loop Agent child templates (`58/58` non-volatile), `flow-agent-type-system-prompt.template.md`, and `BedrockLLM` (`cachePoint` + `splitTrailingVolatileState`) with `<mj-runtime-state>`. **547/547 unit tests + `TRS1`–`TRS6` (6/6) passed.** |
| **12** | **1.3** | `MemberJunction/MJ` | **[#5808](https://github.com/MemberJunction/MJ/pull/5808)** | `perf/agent-step-save-queue-settlement` | Non-blocking `AIPromptRun` save queue (`BaseModelRunner._promptRunQueue` + `FlushPendingSaves()`), in-flight `PayloadAtStartSourceStepID` FK prerequisite array chaining (**100%** rapid-turn deduplication), and error/cancel queue flushing. **5,921/5,921 unit tests passed.** |
| **13** | **2.4** | `MemberJunction/MJ` | **[#5805](https://github.com/MemberJunction/MJ/pull/5805)** | `feat/agent-root-tree-budget-guards` | Adds `AgentTreeBudget` (`maxTreeSteps`, `maxTreeTokens`, `maxTreeCost`, `maxTreeDurationMs`) shared by reference across root, sequential, and parallel sub-agents. **5,134/5,134 unit tests passed.** |
| **14** | **3.1** | `MemberJunction/MJ` | **[#5802](https://github.com/MemberJunction/MJ/pull/5802)** | `feat/agent-post-run-compaction` | Adds `compactAfterRun?: boolean \| AgentPostRunCompactionConfig` (`runPostRunCompaction`, `ScratchpadManager.PruneNotes`, async memory extraction) at end of `finalizeAgentRun` (**-66.7%** next-turn message bytes, **0 ms** start-of-turn latency). **5,146/5,146 unit tests passed.** |
| **15** | **Plan** | `MemberJunction/MJ` | **[#5809](https://github.com/MemberJunction/MJ/pull/5809)** | `docs/next-wave-optimization-master-plan` | Master optimization architecture plan, Arm A vs Arm B benchmark report, and cross-repository PR index (`plans/next-wave-optimization-and-hardening-plan.md`). |

---

## 🏗️ Detailed Architecture & Implementation Design by Workstream

### 1.1 KV-Cache Alignment (`<mj-runtime-state>`) Across Shipped Templates, `FlowAgentType`, and `BedrockLLM` ([PR #5800](https://github.com/MemberJunction/MJ/pull/5800))

1. **Problem Identified**:
   - MJ features a two-layer KV-cache preservation architecture: `BaseAgent.buildVolatileStateMessage()` emits dynamic per-turn state (`_CURRENT_PAYLOAD`, `_SCRATCHPAD`, `_DATE_TIME`, `_ACTION_CHANGES`) as a trailing `<mj-runtime-state>` user message, and `BaseLLM.splitTrailingVolatileState()` places the provider cache breakpoint on the last stable conversation history message before `<mj-runtime-state>`.
   - However, 3 gaps prevented full cache hits:
     1. **6 shipped Loop Agent child templates** (`agent-manager`, `database-designer`, `model-development-agent`, `data-scout`, `experiment-designer`, `goal-analyst`) still had a redundant `- **Current Date/Time**: {{ _CURRENT_DATE_AND_TIME }}` line, causing `IsVolatileChildPrompt()` to return `true` and demote their specialization prompt out of the cached system prompt into the volatile message on every turn.
     2. **`flow-agent-type-system-prompt.template.md`** still embedded `{{ _CURRENT_PAYLOAD | dump | safe }}` inline, forcing `resolveRuntimeStateDelivery` to `'embedded'` and busting the system prompt KV-cache on every Flow Agent prompt step.
     3. **`BedrockLLM`** extracted `cache_read_input_tokens` from responses but never emitted `{ cachePoint: { type: 'default' } }` or called `splitTrailingVolatileState(messages)`.
2. **Solution Implemented**:
   - Removed the redundant `{{ _CURRENT_DATE_AND_TIME }}` line from all 6 Loop Agent child prompt templates (`TRS4` now verifies **58/58 Active Loop agents in metadata have 0 volatile markers**).
   - Migrated `flow-agent-type-system-prompt.template.md` to reference `<mj-runtime-state>` (`TRS1` verified).
   - Wired `supportsPromptCaching()`, `{ cachePoint: { type: 'default' } }` on the system prompt and last stable history message via `splitTrailingVolatileState()`, and assistant `'OK'` turn alternation filler in `BedrockLLM` (`TRS6` verified).

---

### 1.2 `SaveReturnMode: 'full' | 'datestamps_only'` in `Entity.Configuration`, `CodeGenLib`, and DataProviders ([PR #5804](https://github.com/MemberJunction/MJ/pull/5804))

1. **Problem Identified**:
   - Every `spCreate*` and `spUpdate*` stored procedure ended with `SELECT * FROM [schema].[vwEntity] WHERE [ID] = @ID`.
   - On high-write tables with large `NVARCHAR(MAX)` columns or multi-join `BaseView`s, re-evaluating the view and streaming all LOB columns back over TDS on every `Save()` adds substantial DB CPU and network overhead when the caller already holds the mutated state in RAM.
   - However, synthesizing `__mj_CreatedAt` / `__mj_UpdatedAt` in TypeScript would introduce clock skew between Node.js and SQL Server (`GETUTCDATE()`), breaking `OldValues___` concurrency/inconsistency detection on subsequent saves.
2. **Solution Implemented**:
   - Added `EntitySaveReturnMode = 'full' | 'datestamps_only'` to `IEntityConfiguration` (`Entity.Configuration.SaveReturnMode`) and `EntitySaveOptions.SaveReturnMode`.
   - When `SaveReturnMode === 'datestamps_only'`:
     - `SQLServerCodeGenProvider` emits `SELECT [PK], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [schema].[BaseTable] WHERE ...` (reading only the clustered PK + 2 `datetimeoffset` columns directly from `BaseTable`, bypassing `BaseView` joins and `NVARCHAR(MAX)` LOB reads while returning authoritative DB timestamps).
     - `PostgreSQLCodeGenProvider` emits `RETURNS TABLE ("PK" ..., "__mj_CreatedAt" TIMESTAMPTZ, "__mj_UpdatedAt" TIMESTAMPTZ)` and selects directly from `schema."BaseTable"`.
     - `DatabaseProviderBase.Save()` merges `{ ...entity.GetAll(), ...result[0] }` into `FinalizeSave()` so all in-memory fields stay loaded, `Dirty` resets to `false`, and `__mj_CreatedAt` / `__mj_UpdatedAt` match the exact database timestamps.

---

### 1.3 Non-Blocking Step & Prompt Run Save Queue Settlement ([PR #5808](https://github.com/MemberJunction/MJ/pull/5808))

1. **Problem Identified**:
   - While `BaseAgent` queued `AIAgentRunStep` saves on `_stepSaveQueue`, three gaps remained:
     1. `AIPromptRunner` / `BaseModelRunner` still blocked synchronously on `await runRecord.Save()` (`INSERT` before calling the LLM + `UPDATE` after the LLM response) on every turn.
     2. In `BaseAgent`, when Step 2 started while Step 1's `INSERT` was still in flight (`step1.IsSaved === false`), `PayloadAtStartSourceStepID` deduplication was skipped and the full `PayloadAtStart` JSON was written again.
     3. Error/cancellation exit paths in `BaseAgent` saved `_agentRun` without flushing in-flight step and prompt-run queues.
2. **Solution Implemented**:
   - Extended `AgentRunStepSaveQueue.Insert()` in `@memberjunction/ai-core-plus` to accept an array of prerequisite entities and a `beforeInsert` hook executed after prerequisites settle.
   - Added non-blocking `_promptRunQueue` and `FlushPendingSaves()` to `BaseModelRunner` (`@memberjunction/ai-prompts`), chaining child prompt runs after parent prompt runs (`FK_AIPromptRun_Parent`) and re-applying a finalized field snapshot inside the queued `Update` callback so post-INSERT hydration never overwrites completion telemetry.
   - Updated `BaseAgent` to chain Step $N$'s `INSERT` after `[parentStep, sourceStep]`, set `PayloadAtStartSourceStepID = sourceStep.ID` in `beforeInsert` (with automatic fallback to `PayloadAtStart` if `sourceStep`'s `INSERT` failed), and flush both `_stepSaveQueue` and `flushPromptRunnerSaves()` across all completion, cancellation, error, and compaction boundaries.

---

### 1.4 GraphQL Delta-Only `Save()` (`vars.input` & `OldValues___` Mutated-Field Filtering + Server Partial-Delta Guard) ([PR #5807](https://github.com/MemberJunction/MJ/pull/5807))

1. **Problem Identified**:
   - On every `GraphQLDataProvider.Save()` `Update` mutation, the client serialized **every non-read-only field** into `vars.input` AND **every loaded field** (including clean fields, read-only fields, and virtual fields) into `vars.input.OldValues___`. Updating 1 field on a 24-field entity transmitted 44 field entries (`50,407 B` on a typical `AIAgentRun` record) over HTTP/JSON.
2. **Solution Implemented**:
   - In `GraphQLDataProvider.Save()`, when updating an existing record (`entity.IsSaved && !isaPromotionCreate && !options?.IgnoreDirtyState`), both `vars.input` and `vars.input.OldValues___` now include **only primary keys and dirty writable fields** (including IS-A parent-chain dirty inspection via `isFieldDirtyOnChain` / `getFieldOldValueOnChain`), shrinking the mutation payload from `50,407 B` to `964 B` (**52.3x smaller / -98.1%**).
   - In `ResolverBase.ts` (`@memberjunction/server`), added `hasCompleteOldValues(entityInfo, oldValues)` and updated `MustLoadTruthFromDatabase` so partial-delta `OldValues___` payloads always hydrate the full existing row from the database via `entityObject.InnerLoad(compositeKey)` before applying the client delta via `TestAndSetClientOldValuesToDBValues`.
   - Non-overlapping concurrent edits from two clients now merge cleanly without clobbering untouched columns, while overlapping edits on the same field are accurately detected and recorded in `RecordChange`.

---

### 2.1 Eliminate All `ClassFactory` Unrelated-Class & Priority Collisions ([MJ PR #5803](https://github.com/MemberJunction/MJ/pull/5803), [bizapps-orders PR #762](https://github.com/MemberJunction/bizapps-orders/pull/762), [bizapps-contracts PR #119](https://github.com/MemberJunction/bizapps-contracts/pull/119), [bizapps-tasks PR #128](https://github.com/MemberJunction/bizapps-tasks/pull/128))

1. **`GraphTestListEntity` (`MJ: Lists`)**: Changed `GraphTestListEntity` in `entity-graph.checks.ts` to extend `MJListEntityServer` instead of `MJListEntity`, and hardened `GenerateClassRegistrationsManifest` (`IsTestOrMockFilePath`) so test and mock files (`__tests__`, `__mocks__`, `.test.*`, `.spec.*`) are excluded from manifest scanning across both `src/` and `dist/`.
2. **`ProductPriceEntityServer` (`MJ_BizApps_Orders: Product Prices`)**: Changed to extend `ProductPriceEntity` (`@mj-biz-apps/orders-entities`) instead of the generated base class directly, preserving `ProductPriceEntity.Validate()` synchronous checks alongside `ValidateAsync()`.
3. **`ContractTypeEntityServer` & `ContractTemplateTypeEntityServer` (`MJ_BizApps_Contracts`)**: Changed both server subclasses to extend `ContractTypeEntity` and `ContractTemplateTypeEntity` (`@mj-biz-apps/contracts-entities`).
4. **`TaskDependencyEntitySubclass` & `TaskEntitySubclass` (`MJ_BizApps_Tasks`)**: Removed explicit priority `1` from `@RegisterClass` so `ClassFactory` auto-increments priority to `2` above the generated base class, and replaced `.Get()`/`.Set()` with strong typing.

---

### 2.2 Missing `IDX_AUTO_MJ_FKEY_*` Foreign Key Indexes in `bizapps-common` + OpenApp Schema Consistency CI & Scaffolder ([bizapps-common PR #298](https://github.com/MemberJunction/bizapps-common/pull/298), [MJ PR #5801](https://github.com/MemberJunction/MJ/pull/5801))

1. **`MemberJunction/bizapps-common` ([PR #298](https://github.com/MemberJunction/bizapps-common/pull/298))**:
   - Added idempotent SQL Server (`V202610161900__v5.55.x__Add_Missing_FK_Indexes.sql`) and PostgreSQL (`V202610161900__v5.55.x__Add_Missing_FK_Indexes.pg.sql`) migrations creating all 9 missing `IDX_AUTO_MJ_FKEY_*` nonclustered indexes in `__mj_BizAppsCommon`.
   - Added `.github/workflows/schema-consistency.yml` and `.github/scripts/check-fk-indexes.mjs` (plus 4 unit tests in `check-fk-indexes.spec.mjs`).
2. **`MemberJunction/MJ` OpenApp Scaffolder ([PR #5801](https://github.com/MemberJunction/MJ/pull/5801))**:
   - Added `ScaffoldOpenApp`, `GenerateSchemaConsistencyWorkflow`, `GenerateSchemaConsistencyScript`, `ExpectedForeignKeyIndexName`, and `ScanMigrationForeignKeyIndexes` in `packages/OpenApp/Engine/src/scaffold/app-scaffolder.ts` so every OpenApp created with `mj app create` includes automated FK index and `MC1`–`MC4` schema consistency CI out of the box.

---

### 2.3 Migrate Remaining Weak Singletons (`static _instance`) to `BaseSingleton<T>` / `GetGlobalObjectStore()` ([PR #5806](https://github.com/MemberJunction/MJ/pull/5806))

- Audited the entire repository and migrated all **6 remaining weak singletons** (`WellKnownUserSource`, `ArtifactBuilderService`, `RubricEngine`, `LibraryLintCache`, `SemanticValidatorRegistry`, `ComponentRegistryService`) to `BaseSingleton<T>` or `GetGlobalObjectStore()`, ensuring single-instance guarantees across bundler code-splitting and updating `AGENTS.md` Rule 7.

---

### 2.4 Root-Tree Cumulative Budget Guards (`AgentTreeBudget`) Across Sub-Agents ([PR #5805](https://github.com/MemberJunction/MJ/pull/5805))

- Added `AgentTreeBudget` (`maxTreeSteps`, `maxTreeTokens`, `maxTreeCost`, `maxTreeDurationMs`, plus live shared counters `totalSteps`, `totalTokens`, `totalCost`, `startedAtMs`, `breachedReason`) in `@memberjunction/ai-core-plus`.
- Wired automatic propagation in `BaseAgent.Execute()`, `AgentRunner.RunAgent()`, `ExecuteSubAgent()` (sequential, parallel `SubAgents[]`, and `ForEach`/`While` loop sub-agents), and `delegateRealtimeToTarget()`, enforcing cumulative root-tree ceilings in `hasExceededAgentRunGuardrails()` and `executeNextStep()`.

---

### 3.1 Automatic Post-Run Compaction, Memory Extraction & Scratchpad Pruning (`compactAfterRun`) ([PR #5802](https://github.com/MemberJunction/MJ/pull/5802))

- Added `AgentPostRunCompactionConfig` and `ExecuteAgentParams.compactAfterRun?: boolean | AgentPostRunCompactionConfig` in `@memberjunction/ai-core-plus`.
- Added `ScratchpadManager.GetNoteLines()` and `ScratchpadManager.PruneNotes(maxNotes)` (preserving `[HIGH]`, `[IMPORTANT]`, `[PINNED]`, `❗`, `⚠️` notes while pruning oldest low-priority notes first).
- Implemented `BaseAgent.runPostRunCompaction()` and `triggerPostRunMemoryExtraction()` at the end of `finalizeAgentRun()` so multi-turn interactive sessions compact older messages, prune scratchpad notes/tasks, and trigger memory extraction *after* the current turn's response is ready—eliminating compaction latency from the next turn's critical path.
