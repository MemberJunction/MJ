# Intelligent Duplicate Detection & Merge — Implementation Spec

**Status:** Implementation started (Phase 1) — migration landed; CodeGen + reasoning layer next
**Branch:** `feature/intelligent-dupe-detection` (PR #2805)
**Source design:** Amith's "MJ — Intelligent Duplicate Detection & Merge" design doc
**Relationship to PR 2804:** This branch is cut from the 2804 bugfix HEAD (ghost/self-match, recursion fan-out, auto-merge abort, unsorted UI). 2804 merges on its own; this feature stacks on top.

---

## 0. TL;DR of decisions

| Topic | Decision |
|---|---|
| Reasoning execution | **Dual provider behind one seam.** Default = **solo AI Prompt** (cheap/fast, low overhead). **AI Agent** for heavy entities that warrant deeper reasoning (unlocks the memory/learning loop + context-exploration tools). Both consume **one shared core instruction set**; the mode is chosen **per Entity Document** via `ReasoningMode`. |
| Reasoning gate | Reasoning runs **once per source record's matched set** (not per pair), and **only** when the set's top vector score clears a per-entity `ReasoningThreshold` (cost + log-volume control). |
| Pluggability | Reasoning behind a `@RegisterClass` **`DuplicateReasoningProvider`** seam, with **two shipped implementations**: `PromptReasoningProvider` (calls `AIPromptRunner.ExecutePrompt`) and `AgentReasoningProvider` (calls `AgentRunner.RunAgent`). Implementations can be overridden/added without forking the pipeline. |
| Delta computation | Lifted into a **server-side engine + resolver + GraphQL client** (standard MJ full-stack pattern); the engine is built **first** for the server/LLM path. The existing UI's client-side diff swap is **opportunistic (phase 1.5)**, not a hard gate — we don't destabilize a working panel for DRY on day one. |
| Field-level retention | LLM proposes per-field survivor **choices**; these resolve to literal values in the existing `Metadata.MergeRecords()` `FieldMap` (`{FieldName, Value}[]`, applied to the survivor **before** the transactional merge). **Field-override UI is in Phase 1.** |
| Back-compat | When `EnableLLMReasoning = false`, the engine path (vector pass, RRF, `ProcessAutoMerges`) is **byte-for-byte unchanged**. `AutomationLevel` is consulted **only** when reasoning is enabled. |
| Provenance | **Granular `DataSourceScope` enum on `Entity`**: `Local` / `SingleExternal` / `MultiExternal` / `Mixed`. Merge posture on `CompanyIntegrationEntityMap.MergeStrategy`; per-record external IDs in `CompanyIntegrationRecordMap`. **Spec'd now, built in Future phase.** |
| Batch inference | Documented as a **spun-off PR**; out of scope here. |
| Source-system merge | Documented as **Future**; out of scope here. |

---

## 0a. Design principles (carried from the source design doc)

1. **Vectors filter, reasoning validates.** The LLM never replaces the vector pass; it refines candidates above a configurable threshold — strengthening or weakening the score, never blindly overriding it.
2. **Everything is configurable, per entity where it makes sense.** Thresholds, model/prompt vs. agent, automation level, and whether reasoning runs at all are all user-controlled on the Entity Document.
3. **Opinionated but pluggable.** Sophisticated and flexible defaults out of the box, while preserving MJ's pluggability (subclasses, drivers, metadata indirection) so an implementation can override specific stages without forking the pipeline.
4. **Human-in-the-loop is first class, and graduated.** Customers dial in their comfort level, from "review every merge" to "auto-merge above X%."
5. **Transparency / auditability.** Every layer's contribution — vector score, LLM recommendation, LLM reasoning, the user's decision — is logged and surfaced in the UI.
6. **Learn over time.** The system gets smarter across runs and implementations via the memory/learning loop (Phase 2).

---

## 1. Existing architecture (what we build on)

### 1.1 Detection engine
- `DuplicateRecordDetector` (`packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`, extends `VectorBase`).
  - Entry: `GetDuplicateRecords(params, contextUser)` (batch, persisted) and `CheckSingleRecord(...)` (single, **not** persisted — returns results directly).
  - Pipeline: validate entity document → optional revectorize → init providers → resolve/create run → load record IDs (List / View / ExtraFilter) → batch loop (500 outer, 100 vector sub-batch, resumable via `LastProcessedOffset`) → filter (`FilterSelfMatches` via `CompositeKey.Equals`, `FilterNonExistentMatches` ghost-vector guard, threshold) → persist (inverse-dedup via `_seenPairs`) → auto-merge.
  - Scoring: cosine + optional hybrid search w/ Reciprocal Rank Fusion (`scoring/ReciprocalRankFusion.ts`, `ComputeRRF`, default `k=60`).
  - **Auto-merge (`ProcessAutoMerges`)** already exists: gated by `AbsoluteMatchThreshold` **and** entity `AllowRecordMerge`; per-merge try/catch so one failure never aborts the run; sets `MergeStatus`/`Action`/`MergedAt`.

### 1.2 Data model (existing)
> TS code uses the **registered entity names** (see Appendix A), not table names.
- **`MJDuplicateRunEntity`** (`__mj.DuplicateRun`, *"MJ: Duplicate Runs"*) — run-level: `EntityID`, `ProcessingStatus`, progress counters, `LastProcessedOffset`, `BatchSize`, `ApprovalStatus`, `CancellationRequested`.
- **`MJDuplicateRunDetailEntity`** (`__mj.DuplicateRunDetail`, *"MJ: Duplicate Run Details"*) — per source record: `RecordID`, `MatchStatus`, `SkippedReason`, `MergeStatus`, `MergeErrorMessage`.
- **`MJDuplicateRunDetailMatchEntity`** (`__mj.DuplicateRunDetailMatch`, *"MJ: Duplicate Run Detail Matches"*) — per candidate match: `MatchSource` ('SP'|'Vector'), `MatchRecordID`, `MatchProbability` (numeric(12,11)), `Action`, `ApprovalStatus`, `MergeStatus`, `RecordMergeLogID`, `RecordMetadata`.
- **`MJEntityDocumentEntity`** (`__mj.EntityDocument`, *"MJ: Entity Documents"*) — per-entity config: `TemplateID`, `AIModelID`, `VectorDatabaseID`, `PotentialMatchThreshold` (0.7), `AbsoluteMatchThreshold` (0.95), `Configuration` (JSON).

### 1.3 Merge
- `Metadata.MergeRecords(RecordMergeRequest, contextUser, options?)` — transactional, FK dependency-graph driven, **throws** if `AllowRecordMerge` is false, accepts `FieldMap` for per-field survivor overrides. The `FieldMap` is `{FieldName: string, Value: any}[]` — literal values **applied to the surviving record before** the merge runs (inside the transaction). Resolver: `packages/MJServer/src/resolvers/MergeRecordsResolver.ts`. Logs to `MJ: Record Merge Logs` + deletion-log detail.

### 1.4 UI
- `DuplicateDetectionResourceComponent` (`packages/Angular/Explorer/dashboards/src/AI/components/duplicates/`) — Kanban (Pending/Approved/Rejected, table fallback >50 groups), slide-in side-by-side comparison panel that already `RunView`s full records and computes field diffs (`buildComparisonData`, `AreValuesEqual`), per-field survivor selection (`ComparisonFieldRow.SelectedColumnIndex`), and dependency preview.

### 1.5 Reasoning runtime (both providers available)
- `AIPromptRunner.ExecutePrompt(params)` (`packages/AI/Prompts/src/AIPromptRunner.ts`) — single-shot inference with structured-output validation, hierarchical template composition, per-prompt model selection, and `MJ: AI Prompt Runs` audit. **The cheap default path.**
- `AgentRunner.RunAgent<C,R>(params)` (`packages/AI/Agents/src/AgentRunner.ts`) — resolves agent type → `DriverClass` via `ClassFactory` → `BaseAgent.Execute()`. Carries the conversation/memory context and tools. **The heavy-entity path.**
- Memory: `MemoryManagerAgent` (`packages/AI/Agents/src/memory-manager-agent.ts`) — **not** literal "sleep cycles": it uses **frequency-driven consolidation** (`every-run` / `hourly` / `daily`) plus **continuous Ebbinghaus-inspired importance-weighted decay** (7-signal importance scoring, contradiction detection, stale-reference pruning). This is what the Phase-2 learning loop rides on.

### 1.6 Provenance (current state)
- **No first-class entity-level provenance flag.** Per-record external origin lives in `MJCompanyIntegrationRecordMapEntity` (`CompanyIntegrationID`, `EntityID`, `EntityRecordID` → `ExternalSystemRecordID`). Entity↔integration mapping in `MJCompanyIntegrationEntityMapEntity` (already has `SyncDirection`, `ConflictResolution`, `MatchStrategy`, `DeleteBehavior`, `Configuration`).

---

## 2. Phase 1 — build scope

### 2.1 Record comparison engine (full-stack, shared)

Build the field-delta computation once, server-side, per the Transport-Layer guide — **for the server/LLM path first**. The existing UI's swap to this client is **phase 1.5 (opportunistic)**: the comparison panel already computes diffs client-side and works; we collect the DRY win once the engine is proven, without risking a regression on a polished panel on day one.

1. **Engine** — framework-agnostic class (home TBD: `@memberjunction/core-entities-server` vs. a small dedicated package — see watch-item 4), e.g. `RecordComparisonEngine`:
   - Input: `EntityName`, an array of `CompositeKey`s (survivor candidate + matches), optional field-include list.
   - Loads full records (`RunView`, `simple` + targeted `Fields` since this path doesn't mutate), computes a **structured delta**: per field, the value per record, equality flag, and a "differs" marker.
   - Output: a serializable `RecordComparisonResult` (records + per-field delta matrix). This is **both** the LLM "deltas" payload and (eventually) the UI side-by-side model.
   - No Angular, no Router, no resolver coupling.
2. **Resolver** — thin `ResolverBase` subclass exposing `GetRecordComparison(...)`, per-request `contextUser`.
3. **GraphQL client** — typed `GraphQLRecordComparisonClient` in `@memberjunction/graphql-dataprovider` (no inline `gql` in components).
4. **Angular wrapper** — thinnest service; the comparison panel switches from its bespoke diff to this client **when convenient**. One diff implementation, multiple consumers.

### 2.2 Data-model extension (migration → CodeGen → typed code)

**`migrations/v5/` migration** (single `ALTER TABLE` per table; `sp_addextendedproperty` for every new column):

**`DuplicateRunDetailMatch`** — add:
| Column | Type | Notes |
|---|---|---|
| `AIAgentRunID` | uniqueidentifier NULL | FK → `MJ: AI Agent Runs`. Populated in Agent mode (full audit trail). |
| `AIPromptRunID` | uniqueidentifier NULL | FK → `MJ: AI Prompt Runs`. Populated in Prompt mode (full audit trail). |
| `LLMRecommendation` | nvarchar(20) NULL | CHECK in (`'Merge'`,`'NotDuplicate'`,`'Uncertain'`). |
| `LLMConfidence` | numeric(12,11) NULL | Reasoning-adjusted confidence (0–1), distinct from `MatchProbability`. |
| `LLMReasoning` | nvarchar(max) NULL | Human-readable rationale. |
| `LLMProposedSurvivorRecordID` | nvarchar(500) NULL | Proposed surviving record (URL-segment key). |
| `LLMProposedFieldMap` | nvarchar(max) NULL | JSON of proposed per-field survivor choices (resolved to `{FieldName,Value}[]` at merge time). |

> `MatchSource` is **not** overloaded — vectors still originate candidates; the LLM annotates.

**`EntityDocument`** — add:
| Column | Type | Notes |
|---|---|---|
| `EnableLLMReasoning` | bit NOT NULL DEFAULT 0 | Off = current vector-only path, **untouched**. |
| `ReasoningMode` | nvarchar(20) NOT NULL DEFAULT `'Prompt'` | CHECK in (`'Prompt'`,`'Agent'`). `Prompt` = cheap solo single-shot; `Agent` = heavy entities (memory + tools). |
| `ReasoningThreshold` | numeric(12,11) NULL | Vector-score gate above which reasoning runs (per matched set). |
| `ReasoningPromptID` | uniqueidentifier NULL | FK → `MJ: AI Prompts`. Default resolved to the seeded "Duplicate Resolution" prompt. Drives `Prompt` mode; the prompt's own model config is the per-entity model knob. |
| `ReasoningAgentID` | uniqueidentifier NULL | FK → `MJ: AI Agents`. Default resolved to the seeded "Duplicate Resolution Agent". Drives `Agent` mode. |
| `AutomationLevel` | nvarchar(30) NOT NULL DEFAULT `'ReviewAll'` | CHECK in (`'ReviewAll'`,`'LLMGated'`,`'AutoMergeAboveAbsolute'`). **Consulted only when `EnableLLMReasoning = 1`** (see §2.4). |

Advanced/experimental knobs continue to live in `EntityDocument.Configuration` (JSON).

After migration: run CodeGen, then write TS exclusively against the generated typed properties (no `.Get()/.Set()` on new fields).

### 2.3 Reasoning layer (dual-provider, gated, pluggable)

- **Seam:** `DuplicateReasoningProvider` interface resolved via `@RegisterClass`. Two shipped implementations:
  - **`PromptReasoningProvider`** (default) — calls `AIPromptRunner.ExecutePrompt()` with the seeded "Duplicate Resolution" prompt. Cheap, fast, no per-set `AIAgentRun` row. Persists `AIPromptRunID`.
  - **`AgentReasoningProvider`** — calls `AgentRunner.RunAgent()` with the seeded "Duplicate Resolution Agent". Unlocks memory-note injection + context-exploration tools. Persists `AIAgentRunID`.
  - Selected per Entity Document via `ReasoningMode`. **Both consume one shared core instruction set** (a reasoning instruction template) so the prompt and the agent's system prompt stay in lockstep — only the runtime (single-shot vs. orchestrated/tools/memory) differs.
- **Gate:** reasoning runs **once per source record's matched set** (the whole set of candidates for that record), and only when the set's top `MatchProbability >= EntityDocument.ReasoningThreshold`. Below the gate → recorded for review with vector score only. (This bounds cost: N candidates for a record = one call, not N.)
- **Reasoning contract** (identical across both providers):
  - **Input context:** structural description of the entity + the `RecordComparisonResult` deltas for the matched set (NOT the full entity documents).
  - **Structured output:** `{ recommendation: 'Merge'|'NotDuplicate'|'Uncertain', confidence: number, reasoning: string, survivorRecordId: string, fieldChoices: {FieldName: string, sourceRecordId: string}[] }`.
  - Persisted to the new `DuplicateRunDetailMatch` columns + the run-id of whichever provider ran.
- **Why dual now:** the solo prompt is the right default at scale (no orchestration overhead, no `AIAgentRun` per gated set); the agent is opt-in for entities that warrant deeper reasoning. Because the seam, contract, and shared instructions are identical, promoting an entity from `Prompt` to `Agent` — and the Phase-2 memory/tools work — is incremental, not a re-architecture.

### 2.4 Decision & merge workflow

- **Back-compat first:** when `EnableLLMReasoning = 0`, none of the below applies — the engine runs exactly as today (vector pass → `ProcessAutoMerges` gated by `AbsoluteMatchThreshold` + `AllowRecordMerge`). `AutomationLevel` is **ignored** in this case, so the NOT-NULL default of `'ReviewAll'` can never silently disable an existing entity's vector-only auto-merge.
- When `EnableLLMReasoning = 1`, `AutomationLevel` drives behavior:
  - `ReviewAll` — every proposed merge goes to human review.
  - `LLMGated` — only matches the LLM recommends `Merge` surface for review; LLM `NotDuplicate` are suppressed (still logged).
  - `AutoMergeAboveAbsolute` — at/above `AbsoluteMatchThreshold` **and** LLM `Merge`, auto-execute (honors the 2804 per-merge guard + `AllowRecordMerge` skip).
- Field retention: the LLM's proposed `fieldChoices` resolve to literal `{FieldName, Value}` entries (via the same logic the UI uses to turn a `SelectedColumnIndex` into a value) and preload the comparison panel; the user overrides per field; the final `FieldMap` is passed to `Metadata.MergeRecords()`. **No merge-engine change required.**
- Locked dependent records: surface as per-match `MergeStatus='Error'` with a specific reason; never abort the run.

### 2.5 UI enrichment

- Surface per match: LLM recommendation, confidence (vs. vector `MatchProbability`), and reasoning.
- **Disagreement badge:** when the LLM recommendation contradicts the vector score (e.g. 0.98 vector but `NotDuplicate`), badge it and show *why* — this is the prime human-intervention trigger.
- Preload proposed survivor + per-field choices; **field-level override UI is in Phase 1** (cheap given the existing `FieldMap` contract + the panel's existing per-field selection).
- Comparison panel consumes the new GraphQL comparison client (§2.1) **when the swap is low-risk** (phase 1.5).
- Seed the reasoning prompt **and** agent (sharing the core instruction template) as metadata (`/metadata/`), not SQL INSERTs.

### 2.6 Phase-1 task order

1. ✅ Migration (both tables) — `migrations/v5/V202606191344__v5.43.x__Intelligent_Dupe_Detection_LLM_Reasoning.sql`. **Next:** run CodeGen → confirm generated typed properties.
2. `RecordComparisonEngine` + resolver + GraphQL client (+ Angular wrapper, low-risk swap deferrable).
3. `DuplicateReasoningProvider` seam + **both** `PromptReasoningProvider` (default) and `AgentReasoningProvider`; wire the per-set gate + `ReasoningMode` switch into `DuplicateRecordDetector`'s persist path.
4. Seed the shared core instruction template + "Duplicate Resolution" prompt + "Duplicate Resolution Agent" (metadata).
5. UI: LLM columns, disagreement badge, field-override; comparison-client swap when convenient.
6. Tests (Vitest) for engine, RRF unchanged, gate logic (one-call-per-set), provider selection, and automation-level branching incl. the `EnableLLMReasoning=0` back-compat path.

---

## 3. Provenance model (spec now, build in Future phase)

Granular, declarative, with detail delegated to the integration architecture.

- **`Entity.DataSourceScope`** (new enum, NOT NULL DEFAULT `'Local'`): `'Local'` | `'SingleExternal'` | `'MultiExternal'` | `'Mixed'`.
  - `Local` — no external records; safe local hard-merge.
  - `SingleExternal` — all records from one external system.
  - `MultiExternal` — records from multiple external systems.
  - `Mixed` — combination of local + external.
  - Coarse gate for the dedup engine/UI ("do I need to think about external provenance?") and for branching the default merge strategy. Auto-derivation from record maps is a later nicety; ships as settable metadata defaulting to `Local`.
- **`CompanyIntegrationEntityMap.MergeStrategy`** (new, per entity×integration): `'LocalHardMerge'` | `'LogicalMergeOnly'` | `'WriteBackViaSync'` | `'Custom'`. Sits alongside the existing `SyncDirection` / `ConflictResolution` / `MatchStrategy` / `DeleteBehavior`.
- **`CompanyIntegrationRecordMap`** (existing): per-record `ExternalSystemRecordID` — the source of truth write-back needs.

Phase 1 stays unaware of all of this.

---

## 4. Deferred / spun-off (documented, not built here)

### 4.1 Phase 2 — Agentic upgrade + learning loop
- Promote selected entities from `Prompt` to `Agent` mode; add context-exploration **tools** to the reasoning agent.
- Memory-note injection (system / entity-scoped) into agent context.
- Learning loop: post-run distillation prompt over user decisions → candidate notes → injected into the next run. Rides MJ's `MemoryManagerAgent` (frequency-driven consolidation + Ebbinghaus importance-weighted decay, contradiction detection) — **not** a from-scratch memory build.

### 4.2 Future — Source-system merge orchestration
- Logical-merge status markers, bidirectional-sync write-back, flow agents for custom workflows.
- Driven by the §3 provenance model + `MergeStrategy`.
- Crystallize recurring per-system patterns into reusable packs/plugins.

### 4.3 Spun-off PR — first-class batch inference
- General provider-layer primitive (batch/off-peak inference, ~24h turnaround, lower cost). Well beyond dedup. **Separate PR.**

---

## 5. Architecture review checklist (confirm before/while building)

- [ ] Workflow uses **metadata indirection** for classes (likely already true — double-check the detector + reasoning seam).
- [ ] Each stage is **pluggable** via subclass/driver so an implementation can override scoring, context assembly, the reasoning prompt/agent, record/field retention, merge execution, and (later) source-system handling — **without** forking the pipeline.
- [ ] Defaults remain sophisticated and flexible out of the box.
- [ ] `EnableLLMReasoning=0` path is provably unchanged (regression test).

---

## 6. Open watch-items

1. Reasoning **log volume** at 100k+ records — the per-set `ReasoningThreshold` gate is the control; Agent mode adds an `AIAgentRun` per set, which is why `Prompt` is the default. Monitor.
2. Messy/incomplete source data — does the delta context suffice, or is upfront normalization warranted? (design §9.3)
3. Memory-note conflict resolution as the learning loop matures (Phase 2) — rides `MemoryManagerAgent` contradiction detection.
4. `RecordComparisonEngine` home package — confirm `MJCoreEntitiesServer` vs. a dedicated package before building.

---

## Appendix A — registered entity names (use in TS, not table names)

| Table | Registered name (`md.GetEntityObject` / `RunView.EntityName`) |
|---|---|
| `__mj.DuplicateRun` | `MJ: Duplicate Runs` |
| `__mj.DuplicateRunDetail` | `MJ: Duplicate Run Details` |
| `__mj.DuplicateRunDetailMatch` | `MJ: Duplicate Run Detail Matches` |
| `__mj.EntityDocument` | `MJ: Entity Documents` |
| `__mj.CompanyIntegrationRecordMap` | `MJ: Company Integration Record Maps` |
| `__mj.CompanyIntegrationEntityMap` | `MJ: Company Integration Entity Maps` |
| `__mj.Entity` | `MJ: Entities` |
| (AI agent run log) | `MJ: AI Agent Runs` |
| (AI prompt run log) | `MJ: AI Prompt Runs` |
| (agents) | `MJ: AI Agents` |
| (prompts) | `MJ: AI Prompts` |
