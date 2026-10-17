# MemberJunction Wave 2: Performance, Robustness & Agent Automation Execution Plan & PR Index

> **Status**: All 9 Approved Workstreams Implemented, Unit-Tested, Integration-Tested on Isolated SQL Server Databases (`MJ_IT_WT_1_1` through `MJ_IT_WT_3_1`), Documented, and Ready to Merge.
> **Predecessor (Wave 1)**: [PR #5728 (`IT123` Benchmark Suite — Merged)](https://github.com/MemberJunction/MJ/pull/5728) & [PR #5729 (Track A/B/C Core & Agent Optimizations)](https://github.com/MemberJunction/MJ/pull/5729)

---

## 🗺️ Master PR Index & Recommended Merge Order

To minimize rebase friction across the 13 Pull Requests (9 in `MemberJunction/MJ` and 4 across OpenApp repositories), merge in the following order:

### Phase A — Downstream OpenApp Repository PRs (Independent, Merge Anytime)

| Order | Item | Repository | PR | Branch | Summary & Verification |
|---:|---|---|---|---|---|
| **A1** | **2.2a** | `MemberJunction/bizapps-common` | **[#298](https://github.com/MemberJunction/bizapps-common/pull/298)** | `fix/missing-fk-indexes` | Adds idempotent SQL Server & PostgreSQL migrations for all 9 missing `IDX_AUTO_MJ_FKEY_*` indexes in `__mj_BizAppsCommon` + static & live SQL (`MC1`–`MC4`) `.github/workflows/schema-consistency.yml` CI gate. **95/95 guard tests + 51/51 FK columns verified + `IT24` `MC4` 0/990 offenders.** |
| **A2** | **2.1b** | `MemberJunction/bizapps-orders` | **[#762](https://github.com/MemberJunction/bizapps-orders/pull/762)** | `fix/product-price-server-entity-inheritance` | Fixes `ProductPriceEntityServer` to extend `ProductPriceEntity` (`@mj-biz-apps/orders-entities`), eliminating the `'MJ_BizApps_Orders: Product Prices'` unrelated-class collision and preserving synchronous `Validate()` rules alongside `ValidateAsync()`. **3,289/3,289 unit tests passed.** |
| **A3** | **2.1c** | `MemberJunction/bizapps-contracts` | **[#119](https://github.com/MemberJunction/bizapps-contracts/pull/119)** | `fix/contract-type-server-entity-inheritance` | Fixes `ContractTypeEntityServer` and `ContractTemplateTypeEntityServer` to extend `ContractTypeEntity` and `ContractTemplateTypeEntity` (`@mj-biz-apps/contracts-entities`), eliminating both unrelated-class collisions. **50/50 unit tests passed, 0 stderr warnings.** |
| **A4** | **2.1d** | `MemberJunction/bizapps-tasks` | **[#128](https://github.com/MemberJunction/bizapps-tasks/pull/128)** | `fix/task-dependency-registration-priority` | Removes duplicate explicit priority `1` on `TaskDependencyEntitySubclass` and `TaskEntitySubclass` so `ClassFactory` auto-increments to priority `2` above the generated base class, and replaces `.Get()`/`.Set()` with strong typing. **19/19 unit tests passed, 0 stderr warnings.** |

### Phase B — `MemberJunction/MJ` Core, CodeGen, OpenApp & Singleton PRs (Disjoint File Trees)

| Order | Item | Repository | PR | Branch | Isolated DB | Summary & Verification |
|---:|---|---|---|---|---|---|
| **B1** | **2.2b** | `MemberJunction/MJ` | **[#5801](https://github.com/MemberJunction/MJ/pull/5801)** | `feat/openapp-fk-index-ci-template` | `MJ_IT_WT_2_2` | Updates `@memberjunction/open-app-engine` (`app-scaffolder.ts`) so `mj app create` scaffolds `.github/workflows/schema-consistency.yml` and `.github/scripts/check-schema-consistency.mjs` into every new OpenApp. **498/498 unit tests + `IT24` (7/7) & `IT123` (9/9) passed.** |
| **B2** | **2.1a** | `MemberJunction/MJ` | **[#5803](https://github.com/MemberJunction/MJ/pull/5803)** | `fix/class-registrations-exclude-test-files` | `MJ_IT_WT_2_1` | Fixes `GraphTestListEntity` to extend `MJListEntityServer` (eliminating the `'MJ: Lists'` collision) and hardens `GenerateClassRegistrationsManifest` (`IsTestOrMockFilePath`) to exclude `__tests__`, `__mocks__`, `.test.*`, and `.spec.*` across `src/` and `dist/`. **2,554 unit tests + `IT48`, `IT72`, `IT01`, `IT06`, `IT123` 100% green.** |
| **B3** | **2.3** | `MemberJunction/MJ` | **[#5806](https://github.com/MemberJunction/MJ/pull/5806)** | `refactor/migrate-weak-singletons-to-base-singleton` | `MJ_IT_WT_2_3` | Migrates all 6 remaining weak singletons (`WellKnownUserSource`, `ArtifactBuilderService`, `RubricEngine`, `LibraryLintCache`, `SemanticValidatorRegistry`, `ComponentRegistryService`) to `BaseSingleton<T>` / `GetGlobalObjectStore()`. **4,648 unit tests + `IT01`, `IT12`, `IT27`, `IT30`, `IT123` 100% green.** |
| **B4** | **1.2** | `MemberJunction/MJ` | **[#5804](https://github.com/MemberJunction/MJ/pull/5804)** | `perf/save-return-datestamps-only` | `MJ_IT_WT_1_2` | Adds `SaveReturnMode: 'full' \| 'datestamps_only'` to `IEntityConfiguration`, `EntityInfo`, `EntitySaveOptions`, `SQLServerCodeGenProvider`, `PostgreSQLCodeGenProvider`, `DatabaseProviderBase`, `SQLServerDataProvider`, and `PostgreSQLDataProvider` + integration check `EW11` + README docs. **2,547 unit tests + `IT01`, `IT12`, `IT27` (`EW11`), `IT123` 100% green.** |
| **B5** | **1.4** | `MemberJunction/MJ` | **[#5807](https://github.com/MemberJunction/MJ/pull/5807)** | `perf/graphql-delta-only-save` | `MJ_IT_WT_1_4` | Filters `GraphQLDataProvider.Save()` `Update` payloads (`vars.input` and `OldValues___`) to primary keys + dirty writable fields only, adds `ResolverBase.hasCompleteOldValues` partial-delta DB truth guard + integration check `EW12` + README docs. **3,964 unit tests + live GraphQL `IT27` (`EW12`), `IT47`, `IT92`, `IT03`, `IT123` 100% green.** |

### Phase C — `MemberJunction/MJ` AI Agent & Prompt Pipeline PRs

*(Note: PRs #5800, #5808, #5805, and #5802 all touch `packages/AI/Agents/src/base-agent.ts` in different methods/regions; merging in order C1 → C2 → C3 → C4 keeps merges clean.)*

| Order | Item | Repository | PR | Branch | Isolated DB | Summary & Verification |
|---:|---|---|---|---|---|---|
| **C1** | **1.1** | `MemberJunction/MJ` | **[#5800](https://github.com/MemberJunction/MJ/pull/5800)** | `perf/agent-kv-cache-alignment` | `MJ_IT_WT_1_1` | Removes redundant `{{ _CURRENT_DATE_AND_TIME }}` from 6 shipped Loop Agent child templates, migrates `flow-agent-type-system-prompt.template.md` to `<mj-runtime-state>`, and adds `{ cachePoint: { type: 'default' } }` + `splitTrailingVolatileState` to `BedrockLLM`. **547 unit tests + `IT123` (`TRS1`–`TRS6`) & `IT30` (`CC1`–`CC23`) 100% green.** |
| **C2** | **1.3** | `MemberJunction/MJ` | **[#5808](https://github.com/MemberJunction/MJ/pull/5808)** | `perf/agent-step-save-queue-settlement` | `MJ_IT_WT_1_3` | Non-blocking `AIPromptRun` save queue (`BaseModelRunner._promptRunQueue` + `FlushPendingSaves()`), in-flight `PayloadAtStartSourceStepID` FK prerequisite array chaining in `AgentRunStepSaveQueue`, and error/cancel queue flushing in `BaseAgent`. **5,921 unit tests + `IT30`, `IT46`, `IT122`, `IT123`, `IT-1.3-A`, `IT-1.3-B` 100% green.** |
| **C3** | **2.4** | `MemberJunction/MJ` | **[#5805](https://github.com/MemberJunction/MJ/pull/5805)** | `feat/agent-root-tree-budget-guards` | `MJ_IT_WT_2_4` | Adds `AgentTreeBudget` (`maxTreeSteps`, `maxTreeTokens`, `maxTreeCost`, `maxTreeDurationMs`) shared by reference across root, sequential, and parallel sub-agent hierarchies + README docs. **5,134 unit tests + `IT30`, `IT46`, `IT97`, `IT122`, `IT123` 100% green.** |
| **C4** | **3.1** | `MemberJunction/MJ` | **[#5802](https://github.com/MemberJunction/MJ/pull/5802)** | `feat/agent-post-run-compaction` | `MJ_IT_WT_3_1` | Adds `compactAfterRun?: boolean \| AgentPostRunCompactionConfig` (`runPostRunCompaction`, `ScratchpadManager.PruneNotes`, async memory extraction) at the end of `finalizeAgentRun` + README docs. **5,146 unit tests + `IT30`, `IT123` & live DB check 100% green.** |

---

## 🏗️ Detailed Architecture & Implementation Design by Workstream

### 1.1 KV-Cache Alignment (`<mj-runtime-state>`) Across Shipped Templates, `FlowAgentType`, and `BedrockLLM` ([PR #5800](https://github.com/MemberJunction/MJ/pull/5800))

1. **Problem Identified**:
   - MJ already features a two-layer KV-cache preservation architecture: `BaseAgent.buildVolatileStateMessage()` emits dynamic per-turn state (`_CURRENT_PAYLOAD`, `_SCRATCHPAD`, `_DATE_TIME`, `_ACTION_CHANGES`) as a trailing `<mj-runtime-state>` user message, and `BaseLLM.splitTrailingVolatileState()` places the provider cache breakpoint on the last stable conversation history message before `<mj-runtime-state>`.
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
   - On every `GraphQLDataProvider.Save()` `Update` mutation, the client serialized **every non-read-only field** into `vars.input` AND **every loaded field** (including clean fields, read-only fields, and virtual fields) into `vars.input.OldValues___`. Updating 1 field on a 40-field entity transmitted 80+ field entries over HTTP/JSON.
2. **Solution Implemented**:
   - In `GraphQLDataProvider.Save()`, when updating an existing record (`entity.IsSaved && !isaPromotionCreate && !options?.IgnoreDirtyState`), both `vars.input` and `vars.input.OldValues___` now include **only primary keys and dirty writable fields** (including IS-A parent-chain dirty inspection via `isFieldDirtyOnChain` / `getFieldOldValueOnChain`).
   - In `ResolverBase.ts` (`@memberjunction/server`), added `hasCompleteOldValues(entityInfo, oldValues)` and updated `MustLoadTruthFromDatabase` so partial-delta `OldValues___` payloads always hydrate the full existing row from the database via `entityObject.InnerLoad(compositeKey)` before applying the client delta via `TestAndSetClientOldValuesToDBValues`.
   - Non-overlapping concurrent edits from two clients now merge cleanly without clobbering untouched columns, while overlapping edits on the same field are accurately detected and recorded in `RecordChange`.

---

### 2.1 Eliminate All 4 `ClassFactory` Unrelated-Class & Priority Collisions ([MJ PR #5803](https://github.com/MemberJunction/MJ/pull/5803), [bizapps-orders PR #762](https://github.com/MemberJunction/bizapps-orders/pull/762), [bizapps-contracts PR #119](https://github.com/MemberJunction/bizapps-contracts/pull/119), [bizapps-tasks PR #128](https://github.com/MemberJunction/bizapps-tasks/pull/128))

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
