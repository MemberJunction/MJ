# Intelligent Duplicate Detection & Merge — Implementation Spec

**Status:** Finalized for build (Phase 1)
**Branch:** `feature/intelligent-dupe-detection`
**Source design:** Amith's "MJ — Intelligent Duplicate Detection & Merge" design doc
**Relationship to PR 2804:** This branch is cut from the 2804 bugfix HEAD (ghost/self-match, recursion fan-out, auto-merge abort, unsorted UI). 2804 merges on its own; this feature stacks on top.

---

## 0. TL;DR of decisions

| Topic | Decision |
|---|---|
| Reasoning execution | **AI Agent** (not single-shot prompt) from Phase 1 — unlocks memory loop + tools for free. |
| Reasoning gate | Agent runs **only** for candidates above a per-entity `ReasoningThreshold` (cost + log-volume control). |
| Pluggability | Reasoning step behind a `@RegisterClass` seam; default impl calls `AgentRunner.RunAgent()`. |
| Delta computation | Lifted into a **server-side engine + resolver + GraphQL client** (standard MJ full-stack pattern); shared by engine, agent, and UI. |
| Field-level retention | LLM proposes a `FieldMap`; reuses existing `Metadata.MergeRecords()` `FieldMap` contract. **Field-override UI is in Phase 1.** |
| Provenance | **Granular `DataSourceScope` enum on `Entity`**: `Local` / `SingleExternal` / `MultiExternal` / `Mixed`. Merge posture on `CompanyIntegrationEntityMap`; per-record external IDs in `CompanyIntegrationRecordMap`. **Spec'd now, built in Future phase.** |
| Batch inference | Documented as a **spun-off PR**; out of scope here. |
| Source-system merge | Documented as **Future**; out of scope here. |

---

## 1. Existing architecture (what we build on)

### 1.1 Detection engine
- `DuplicateRecordDetector` (`packages/AI/Vectors/Dupe/src/duplicateRecordDetector.ts`, extends `VectorBase`).
  - Entry: `GetDuplicateRecords(params, contextUser)` and `CheckSingleRecord(...)`.
  - Pipeline: validate entity document → optional revectorize → init providers → resolve/create run → load record IDs (List / View / ExtraFilter) → batch loop (500 outer, 100 vector sub-batch, resumable via `LastProcessedOffset`) → filter (`FilterSelfMatches`, `FilterNonExistentMatches`, threshold) → persist → auto-merge.
  - Scoring: cosine + optional hybrid search w/ Reciprocal Rank Fusion (`scoring/ReciprocalRankFusion.ts`, `ComputeRRF`).

### 1.2 Data model (existing)
- **`MJDuplicateRunEntity`** (`__mj.DuplicateRun`) — run-level: `EntityID`, thresholds via the entity doc, `ProcessingStatus`, progress counters, `LastProcessedOffset`, `ApprovalStatus`, `CancellationRequested`.
- **`MJDuplicateRunDetailEntity`** (`__mj.DuplicateRunDetail`) — per source record: `RecordID`, `MatchStatus`, `MergeStatus`, `RecordMetadata` (JSON snapshot of name/icon/display fields from the vector DB).
- **`MJDuplicateRunDetailMatchEntity`** (`__mj.DuplicateRunDetailMatch`) — per candidate match: `MatchSource` ('SP'|'Vector'), `MatchRecordID`, `MatchProbability` (numeric(12,11)), `Action` ('Ignore'|'Merge'|'Delete'), `ApprovalStatus`, `MergeStatus`, `RecordMergeLogID`, `RecordMetadata`.
- **`MJEntityDocumentEntity`** (`__mj.EntityDocument`) — per-entity config: `TemplateID`, `AIModelID`, `VectorDatabaseID`, `PotentialMatchThreshold` (0.7), `AbsoluteMatchThreshold` (0.95), `Configuration` (JSON).

### 1.3 Merge
- `Metadata.MergeRecords(RecordMergeRequest, contextUser)` — transactional, FK dependency-graph driven, honors `AllowRecordMerge` (throws if false), accepts `FieldMap: FieldMapping[]` for per-field survivor overrides. Resolver: `packages/MJServer/src/resolvers/MergeRecordsResolver.ts`.

### 1.4 UI
- `DuplicateDetectionResourceComponent` (`packages/Angular/Explorer/dashboards/src/AI/components/duplicates/`) — Kanban (Pending/Approved/Rejected), side-by-side comparison panel that already `RunView`s full records and computes field diffs + per-field survivor selection + dependency preview.

### 1.5 Reasoning runtime
- `AgentRunner.RunAgent<C,R>(params)` (`packages/AI/Agents/src/AgentRunner.ts`) — resolves agent type → `DriverClass` via `ClassFactory` → `BaseAgent.Execute()`. Supports structured output and note/memory injection.
- `AIPromptRunner.ExecutePrompt(params)` (`packages/AI/Prompts/src/AIPromptRunner.ts`) — used internally by agents/prompts.

### 1.6 Provenance (current state)
- **No first-class entity-level provenance flag.** Per-record external origin lives in `MJCompanyIntegrationRecordMapEntity` (`CompanyIntegrationID`, `EntityID`, `RecordID` → `ExternalSystemRecordID`). Entity↔integration mapping in `MJCompanyIntegrationEntityMapEntity` (already has `SyncDirection`, `ConflictResolution`, `MatchStrategy`, `DeleteBehavior`, `Configuration`).

---

## 2. Phase 1 — build scope

### 2.1 Record comparison engine (full-stack, shared)

Build the field-delta computation once, server-side, per the Transport-Layer guide.

1. **Engine** — framework-agnostic class (candidate home: `@memberjunction/core-entities-server` or a small new package), e.g. `RecordComparisonEngine`:
   - Input: `EntityName`, an array of `CompositeKey`s (survivor candidate + matches), optional field-include list.
   - Loads full records (`RunView`, `entity_object` only if mutation needed — here `simple` + targeted `Fields`), computes a **structured delta**: per field, the value per record, equality flag, and a "differs" marker.
   - Output: a serializable `RecordComparisonResult` (records + per-field delta matrix). This is **both** the LLM "deltas" payload and the UI side-by-side model.
   - No Angular, no Router, no resolver coupling.
2. **Resolver** — thin `ResolverBase` subclass exposing `GetRecordComparison(...)`, per-request `contextUser`.
3. **GraphQL client** — typed `GraphQLRecordComparisonClient` in `@memberjunction/graphql-dataprovider` (no inline `gql` in components).
4. **Angular wrapper** — thinnest service; the comparison panel switches from its bespoke diff to this client. One diff implementation, three consumers.

### 2.2 Data-model extension (migration → CodeGen → typed code)

**`migrations/v5/` migration** (single `ALTER TABLE` per table; `sp_addextendedproperty` for every new column):

**`DuplicateRunDetailMatch`** — add:
| Column | Type | Notes |
|---|---|---|
| `AIAgentRunID` | uniqueidentifier NULL | FK → `MJ: AI Agent Runs`. Full audit trail (reuse existing logging). |
| `LLMRecommendation` | nvarchar(20) NULL | CHECK in (`'Merge'`,`'NotDuplicate'`,`'Uncertain'`). |
| `LLMConfidence` | numeric(12,11) NULL | Reasoning-adjusted confidence (0–1), distinct from `MatchProbability`. |
| `LLMReasoning` | nvarchar(max) NULL | Human-readable rationale. |
| `LLMProposedSurvivorRecordID` | nvarchar(500) NULL | Proposed surviving record (URL-segment key). |
| `LLMProposedFieldMap` | nvarchar(max) NULL | JSON serialization of proposed `FieldMapping[]`. |

> `MatchSource` is **not** overloaded — vectors still originate candidates; the LLM annotates.

**`EntityDocument`** — add:
| Column | Type | Notes |
|---|---|---|
| `EnableLLMReasoning` | bit NOT NULL DEFAULT 0 | Off = current vector-only path, untouched. |
| `ReasoningThreshold` | numeric(12,11) NULL | Vector-score gate above which the agent runs. |
| `ReasoningAgentID` | uniqueidentifier NULL | FK → `MJ: AI Agents`. Default resolved to the seeded "Duplicate Resolution Agent". |
| `AutomationLevel` | nvarchar(30) NOT NULL DEFAULT `'ReviewAll'` | CHECK in (`'ReviewAll'`,`'LLMGated'`,`'AutoMergeAboveAbsolute'`). |

Advanced/experimental knobs continue to live in `EntityDocument.Configuration` (JSON).

After migration: run CodeGen, then write TS exclusively against the generated typed properties (no `.Get()/.Set()` on new fields).

### 2.3 Reasoning layer (agent-backed, gated, pluggable)

- **Seam:** `DuplicateReasoningProvider` interface resolved via `@RegisterClass`. Default implementation: `AgentReasoningProvider` calling `AgentRunner.RunAgent()`.
- **Gate:** only candidates with `MatchProbability >= EntityDocument.ReasoningThreshold` get an agent run. Below the gate → recorded for review with vector score only.
- **Agent contract** (new seeded "Duplicate Resolution Agent", single-shot to start, tools later):
  - **Input context:** structural description of the entity + the `RecordComparisonResult` deltas for the matched set (NOT the full entity documents).
  - **Structured output:** `{ recommendation: 'Merge'|'NotDuplicate'|'Uncertain', confidence: number, reasoning: string, survivorRecordId: string, fieldMap: FieldMapping[] }`.
  - Persisted to the new `DuplicateRunDetailMatch` columns + `AIAgentRunID`.
- **Why agent now:** memory-note injection (system/entity-scoped) and context-exploration tools become incremental adds rather than a re-architecture. The learning loop (Phase 2) is then just a distillation prompt + note write.

### 2.4 Decision & merge workflow

- `AutomationLevel` drives behavior:
  - `ReviewAll` — every proposed merge goes to human review.
  - `LLMGated` — only matches the LLM recommends `Merge` surface for review; LLM `NotDuplicate` are suppressed (still logged).
  - `AutoMergeAboveAbsolute` — at/above `AbsoluteMatchThreshold` **and** LLM `Merge`, auto-execute (honors the 2804 per-merge guard + `AllowRecordMerge` skip).
- Field retention: LLM's `LLMProposedFieldMap` preloads the comparison panel; user overrides per field; final map passed to `Metadata.MergeRecords()`. No merge-engine change required.
- Locked dependent records: surface as per-match `MergeStatus='Error'` with a specific reason; never abort the run.

### 2.5 UI enrichment

- Comparison panel consumes the new GraphQL comparison client (§2.1).
- Surface per match: LLM recommendation, confidence (vs. vector `MatchProbability`), and reasoning.
- **Disagreement badge:** when LLM recommendation contradicts the vector score (e.g. 0.98 vector but `NotDuplicate`), badge it and show *why* — this is the prime human-intervention trigger.
- Preload proposed survivor + field map; **field-level override UI is in Phase 1** (cheap given the existing `FieldMap` contract + existing per-field selection in the panel).
- Seed the reasoning agent + its prompt as metadata (`/metadata/`), not SQL INSERTs.

### 2.6 Phase-1 task order

1. Migration (both tables) → CodeGen → confirm generated types.
2. `RecordComparisonEngine` + resolver + GraphQL client + Angular wrapper.
3. `DuplicateReasoningProvider` seam + `AgentReasoningProvider` default; wire gate into `DuplicateRecordDetector` persist path.
4. Seed "Duplicate Resolution Agent" + reasoning prompt (metadata).
5. UI: comparison client swap, LLM columns, disagreement badge, field-override.
6. Tests (Vitest) for engine, RRF unchanged, gate logic, automation-level branching.

---

## 3. Provenance model (spec now, build in Future phase)

Granular, declarative, with detail delegated to the integration architecture.

- **`Entity.DataSourceScope`** (new enum, NOT NULL DEFAULT `'Local'`): `'Local'` | `'SingleExternal'` | `'MultiExternal'` | `'Mixed'`.
  - `Local` — no external records; safe local hard-merge.
  - `SingleExternal` — all records from one external system.
  - `MultiExternal` — records from multiple external systems.
  - `Mixed` — combination of local + external.
  - Coarse gate for the dedup engine/UI ("do I need to think about external provenance?") and for branching the default merge strategy. Maintenance (auto-derivation from record maps) is a later nicety; ships as settable metadata defaulting to `Local`.
- **`CompanyIntegrationEntityMap.MergeStrategy`** (new, per entity×integration): `'LocalHardMerge'` | `'LogicalMergeOnly'` | `'WriteBackViaSync'` | `'Custom'`. Sits alongside the existing `SyncDirection` / `ConflictResolution` / `MatchStrategy` / `DeleteBehavior`.
- **`CompanyIntegrationRecordMap`** (existing): per-record `ExternalSystemRecordID` — the source of truth write-back needs.

Phase 1 stays unaware of all of this.

---

## 4. Deferred / spun-off (documented, not built here)

### 4.1 Phase 2 — Agentic upgrade + learning loop
- Add context-exploration **tools** to the reasoning agent.
- Memory-note injection (system / entity-scoped) into agent context.
- Learning loop: post-run distillation prompt over user decisions → notes → injected into next run. Leverages MJ memory curation (sleep-cycle distill/consolidate/purge).

### 4.2 Future — Source-system merge orchestration
- Logical-merge status markers, bidirectional-sync write-back, flow agents for custom workflows.
- Driven by the §3 provenance model + `MergeStrategy`.
- Crystallize recurring per-system patterns into reusable packs/plugins.

### 4.3 Spun-off PR — first-class batch inference
- General provider-layer primitive (batch/off-peak inference, ~24h turnaround, lower cost). Well beyond dedup. **Separate PR.**

---

## 5. Open watch-items

1. Agent-run **log volume** at 100k+ records — the `ReasoningThreshold` gate is the control; monitor.
2. Messy/incomplete source data — does the delta context suffice, or is upfront normalization warranted? (design §9.3)
3. Memory-note conflict resolution as the learning loop matures (Phase 2).
4. `RecordComparisonEngine` home package — confirm whether it belongs in `MJCoreEntitiesServer` or a dedicated package before building.
