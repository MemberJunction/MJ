# MemberJunction Agent Memory System — State Log

**Purpose**: A dated changelog of the agent memory system's architecture. Each H2 date header below is a point-in-time snapshot of what the system looked like at that time. Entries are **additive** — new snapshots stack on top of older ones, and older entries are frozen (they describe historical state, not current truth). To see how the system has evolved between two points in time, diff between the corresponding dated sections.

**Convention**: Each entry uses the same section structure (System Overview → Database Schema → Memory Manager Agent → Memory Cleanup Agent → Agent Context Injector → Vector Services → Scoping → Prompts → Metadata → Tests → Data Flows → Known Gaps) so diffs between snapshots highlight what actually changed at each level of the stack.

---

## 2026-04-11 — Memory Consolidation Activation

Branch: `claude/study-agent-memory-architecture-ZfjHS`. All changes below are on that branch, either committed or in the working tree. This snapshot describes the system **after** the Memory Consolidation Activation feature (spec `001-memory-consolidation/spec.md`) was implemented, hardened, and verified end-to-end through the Explorer chat UI with database-level confirmation of note injection.

### 1. System Overview Changes

**Memory Manager pipeline expanded from ~7 phases to 13.** One unified run now handles the entire memory lifecycle: extraction → importance scoring → consolidation → contradiction detection → stale reference pruning → decay-based archival. The single-pipeline design is deliberate — decay decisions depend on `ImportanceScore` values computed earlier in the same run, so splitting the lifecycle across separate agents would break the importance-weighted ordering.

**Memory Cleanup Agent deprecated.** Its retention-window archival logic is superseded by `MemoryManagerAgent.decayBasedArchival()`, which uses importance-weighted Ebbinghaus decay instead of fixed `NoteRetentionDays` / `ExampleRetentionDays`. The class is retained (marked `@deprecated`) for reference and rollback; its scheduled job is flipped to `Status: "Disabled"`.

### 2. Database Schema Changes

**Migration**: `migrations/v5/V202604011000__v5.21.x_Memory_Consolidation_Schema.sql`

Five new columns on `AIAgentNote`:

| Column | Type | Purpose |
|---|---|---|
| `ConsolidatedIntoNoteID` | `uniqueidentifier NULL` | Self-referential FK pointing at the consolidated note that replaced this one when revoked during consolidation or contradiction resolution. Enables consolidation provenance. |
| `ConsolidationCount` | `int NOT NULL DEFAULT 0` | Re-summarization depth. 0 = raw extraction, 1 = first consolidation, 2 = re-consolidation. Capped at 3 in application logic to prevent semantic drift. |
| `DerivedFromNoteIDs` | `nvarchar(MAX) NULL` | JSON array of source note IDs that were consolidated into this note. Used by `resolveOriginalSources()` for provenance chain resolution at the drift cap. |
| `ProtectionTier` | `nvarchar(20) NOT NULL DEFAULT 'Standard'` | Controls consolidation/archival behavior per note. Enforced via CHECK constraint. Values: `Immutable` / `Protected` / `Standard` / `Ephemeral`. |
| `ImportanceScore` | `decimal(5,2) NULL` | Composite 0–10 score computed from 7 signals (recency decay, LLM importance, relevance, uniqueness, correction boost, goal alignment, user mark). Drives authority decisions in consolidation, contradiction resolution, and Ebbinghaus decay. |

**Status CHECK extended** to include `Archived` (used by the new decay-based archival phase). New constraint: `CK_AIAgentNote_Status CHECK (Status IN ('Active', 'Pending', 'Revoked', 'Archived'))`.

### 3. Memory Manager Agent — Expanded 13-Phase Pipeline

`packages/AI/Agents/src/memory-manager-agent.ts` — `executeAgentInternal()` method. Each phase runs in its own try/catch and writes an `AIAgentRunStep` record for observability. Ordering is strict:

1. **Agent Validation** (pre-existing)
2. **Load Conversations With New Activity** (pre-existing)
3. **Load High-Value Agent Runs** (pre-existing)
4. **Extract Notes from Conversations** (pre-existing)
5. **Deduplicate Note Candidates** (pre-existing)
6. **Extract Examples from Conversations** (pre-existing)
7. **Deduplicate Example Candidates** (pre-existing)
8. **Create Note Records** (pre-existing)
9. **Create Example Records** (pre-existing)
10. **Compute Importance Scores** (NEW — 7-signal composite with auto-promote to `Protected` at score ≥ 8.0)
11. **Consolidate Related Notes** (NEW — semantic clustering + LLM-driven synthesis with anchored mode and cap-based drift prevention)
12. **Detect Note Contradictions** (NEW — entity-attribute-value triple extraction, tier-aware resolution)
13. **Prune Stale References + Decay-Based Archival** (NEW — run in parallel under `Promise.allSettled`)

Phases 10–13 are gated behind `shouldRunConsolidation()`, which enforces daily frequency, event-driven 100-note trigger, or explicit `forceMaintenance` bypass.

### 4. Memory Manager Agent — Code Hardening (M1–M6)

1. **M1 — `FORCE_MAINTENANCE` env var → typed parameter.** Removed the `process.env.FORCE_MAINTENANCE === '1'` sidechannel entirely. Callers now pass `data: { forceMaintenance: true }` in `ExecuteAgentParams`. Rationale: env-var sidechannels leak into production configs and cause massive DB/LLM churn if accidentally set.
2. **M2 — LLM Type coercion validated at runtime.** Added `VALID_NOTE_TYPES` const + `isValidNoteType()` type guard. Consolidation falls back to the template note's type if the LLM returns an invalid value. Was previously a blind `as` cast.
3. **M3 — `MAX_SOURCE_RESOLUTION_DEPTH = 10` on recursion.** `resolveOriginalSources()` already had a visited-set for cycle prevention, but lacked a hard depth limit. Added explicit depth cap.
4. **M4 — `Promise.allSettled` (not `Promise.all`) for parallel prune + decay.** Ensures a failure in one phase doesn't abort the sibling phase. Inline comment explains the choice.
5. **M5 — `accessRetentionCap = 1.5` on decay formula.** Previously the `accessRetention = 1 + AccessCount * 0.2` multiplier was unbounded, meaning frequently-accessed notes (`AccessCount = 1000` → multiplier 201) never decayed. Now capped so access count meaningfully slows decay without making notes immortal.
6. **M6 — `executeNoteExtraction()` decomposed.** The original 310-line function violated the MJ 40-line convention. Split into 7 focused helpers: `runNoteExtractionPrompt`, `normalizeMergeCandidates`, `filterByConfidenceAndLength`, `applySparsityLimits`, `collapseMergeCandidates` (pre-existing, called by the new flow), `deduplicateCandidates`, `runDedupePromptForCandidate`, `enrichWithConversationContext`.

### 5. Memory Manager Agent — Two Production Bugs Fixed

1. **Event-driven 100-note trigger was dead code.** `shouldRunConsolidation()` filtered the new-note count query by `AgentID = '${agentId}'`, but `agentId` at the call site is the Memory Manager's own ID (from `params.agent.ID`). The Memory Manager doesn't own notes — it processes notes belonging to other memory-enabled agents. The count was always 0 and the event trigger never fired. **Fix**: removed the `AgentID` filter so the query counts system-wide note volume since the last MM run.
2. **Extraction merge path silently revoked Immutable / Protected notes.** When the extraction LLM flagged a new candidate as a "merge target" of an existing note, the merge logic unconditionally set `existingNote.Status = 'Revoked'` regardless of `ProtectionTier`. Safety constraints in `Immutable` tier could be silently destroyed. The contradiction-detection phase honored tier protection but this earlier merge path bypassed it. **Fix**: added a tier check before revocation. `Immutable` and `Protected` notes are now annotated via `Comments` instead of revoked, and a `LogStatus` line records the skip for observability.

### 6. Memory Cleanup Agent — Deprecated

`packages/AI/Agents/src/memory-cleanup-agent.ts`:
- Class marked `@deprecated` in JSDoc with a pointer to `MemoryManagerAgent.decayBasedArchival()` as the replacement
- Retention-window logic retained inline for reference / rollback only
- Class is not deleted — rollback story: if Ebbinghaus decay misbehaves in production, re-enabling the old agent is a one-field flip in metadata

`metadata/scheduled-jobs/.memory-cleanup-job.json`:
- `Status` flipped from `"Active"` to `"Disabled"`
- `Description` rewritten to lead with `[Deprecated]`, explain the replacement path, and document the rollback procedure

### 7. Agent Context Injector — Unchanged in this snapshot

No code changes to `packages/AI/Agents/src/agent-context-injector.ts` during this work. Observed behavior during verification:
- Vector search (`FindSimilarAgentNotes`) correctly returns the fresh notes for queries
- Reranker fails fast in the workbench env (the configured reranker model ID isn't loadable locally), `success=false, durationMs=~8`
- `fallbackOnError: true` config handles the failure gracefully — vector matches are used directly
- Notes are correctly injected into the `📝 AGENT NOTES` block of the Sage system prompt; verified via inspection of `AIAgentRunStep.InputData` for `Execute Agent Prompt` steps

### 8. LLM Prompt Templates — Optimized and Extended

All four prompts follow the "principles over heuristics" rule: no keyword lists, no pattern-matching rules, all logic driven by LLM reasoning over worked examples and clearly-stated criteria.

| Prompt | File | Accuracy (train/val/test) | Status |
|---|---|---|---|
| Extract Notes | `extract-notes.md` | 100 / 87 / 80 | Rewritten — **known gap**: 20% test miss rate. Failure patterns documented in `metadata/prompts/templates/memory-manager/README.md` for future optimization passes. |
| Deduplicate Note | `deduplicate-note.md` | 100 / 100 / 100 | Rewritten — at target accuracy |
| Consolidate Notes | `consolidate-notes.md` | 100 / 100 / 75 | Rewritten — above floor but below 90% test target |
| Detect Contradictions | `detect-contradictions.md` | 100 / 100 / 100 | **NEW** — uses entity-attribute-value triple extraction to evaluate note pairs and determine authority |

The new `detect-contradictions.md` is wired into `.memory-manager-prompts.json` with `Gemini 3 Flash` as the primary model and `GPT-OSS-120B` (Groq) as fallback.

A new `metadata/prompts/templates/memory-manager/README.md` file documents the accuracy baselines and known failure patterns for each prompt, so future optimizer runs have a target.

### 9. Metadata & Scheduled Jobs

- `.memory-manager-prompts.json` — extended with the new `Memory Manager - Detect Contradictions` prompt record + refreshed sync checksums for the optimized prompts
- `.prompts.json` — sync checksums refreshed
- `.memory-cleanup-job.json` — `Status: "Disabled"`, description updated (see Section 6)

### 10. Tests

**Unit tests**: `cd packages/AI/Agents && npm test` → 12 test files, 386 tests passing in ~1.5 s. The placeholder `memory-consolidation-integration.test.ts` file (18 `expect(true).toBe(true)` stubs that provided false CI confidence) was deleted as part of this work.

**Manual E2E verification script**: `packages/AI/Agents/scripts/manual-tests/memory-consolidation-e2e.ts` (local-dev only, excluded from git via `.git/info/exclude` because it requires a live DB and real LLM credentials). 24 scenarios exercising the full pipeline against the workbench DB, most recent run: 15–16 pass, 0 fail, 8–9 skip (skip reasons documented and reviewed).

**DB-level verification of memory injection**: After extracting notes via `@Memory Manager` in the chat UI, querying `AIAgentRunStep.InputData` for subsequent Sage runs confirmed the fresh notes were injected into the system prompt verbatim (no stale cache, no duplicates, correct scope annotations).

### 11. Known Gaps as of This Snapshot

**Carried forward from 2026-03-31 snapshot**:
- Angular UI components for notes/examples are read-only (no edit/delete UI)
- Analytics / reporting dashboards for memory system health

**New gaps identified during verification**:
- Extract prompt test accuracy is 80% (target ≥ 90%) — documented in prompt-templates README for future optimization
- `BaseAIEngine.Config(forceRefresh=true)` doesn't reliably reload newly-created agents mid-process — surfaces only in the contrived "agent created mid-run" test scenario, not in realistic production flow. Lives in upstream `@memberjunction/base-ai-engine`, out of scope for this work.
- Reranker fails silently when the configured model ID isn't loadable (user confirmed production has working keys so this won't fire there). The `fallbackOnError: true` path works correctly but masks what would be a visible observability gap in dev environments. Lives in `agent-context-injector.ts`, out of scope for this work.
- Scheduled job metadata for the *new* Memory Manager pipeline has not been audited in this work — treated as a consumer responsibility per framework conventions

### 12. Branch Commit State

As of 2026-04-11, the `claude/study-agent-memory-architecture-ZfjHS` branch has 4 committed chunks plus 1 pending:

1. **`Add memory consolidation schema to AIAgentNote`** — schema migration + CodeGen output (5 new fields, Status constraint update, Angular form regen)
2. **`Deprecate Memory Cleanup Agent in favor of unified Memory Manager pipeline`** — JSDoc `@deprecated` marker + scheduled job flipped to Disabled
3. **`Optimize Memory Manager prompts and add contradiction detection prompt`** — 4 optimized prompts + new contradiction prompt + sync metadata + accuracy baseline README
4. **(Pending)** Memory Manager agent code changes — `memory-manager-agent.ts` with M1–M6 hardening and the 2 bug fixes (still unstaged in the working tree)

---

## 2026-03-31 — Pre-consolidation baseline

*Original snapshot written immediately before the Memory Consolidation Activation work started. Describes the state of the agent memory system as a reference point for the diff against 2026-04-11 and any future entries.*

**Purpose**: Comprehensive reference of everything implemented for agent memory prior to the Memory Consolidation Activation feature (spec `001-memory-consolidation/spec.md`).

---

### Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Schema](#2-database-schema)
3. [Memory Manager Agent](#3-memory-manager-agent)
4. [Memory Cleanup Agent](#4-memory-cleanup-agent)
5. [Agent Context Injector](#5-agent-context-injector)
6. [AIEngine Vector Services](#6-aiengine-vector-services)
7. [SimpleVectorService (In-Memory Vector Search)](#7-simplevectorservice-in-memory-vector-search)
8. [BaseAIEngine Memory Caching](#8-baseaiengine-memory-caching)
9. [Multi-Tenant Scoping Architecture](#9-multi-tenant-scoping-architecture)
10. [LLM Prompt Templates](#10-llm-prompt-templates)
11. [Metadata & Scheduled Jobs](#11-metadata--scheduled-jobs)
12. [Optimized Query](#12-optimized-query)
13. [Base Agent Integration](#13-base-agent-integration)
14. [Angular UI Components](#14-angular-ui-components)
15. [Unit Tests](#15-unit-tests)
16. [End-to-End Data Flows](#16-end-to-end-data-flows)
17. [Performance Optimizations](#17-performance-optimizations)
18. [Known Gaps (Pre-Consolidation)](#18-known-gaps-pre-consolidation)

---

### 1. System Overview

MemberJunction's agent memory system is an enterprise-grade infrastructure that enables AI agents to learn from conversations, retain observations as typed notes, and inject relevant context into future interactions. It consists of:

| Component | Package | Purpose |
|-----------|---------|---------|
| **Memory Manager Agent** | `@memberjunction/ai-agents` | Extracts notes and examples from conversations every 15 minutes |
| **Memory Cleanup Agent** | `@memberjunction/ai-agents` | Archives stale notes/examples daily based on retention policies |
| **Agent Context Injector** | `@memberjunction/ai-agents` | Retrieves and formats notes for injection into agent context at runtime |
| **AIEngine (Server)** | `@memberjunction/ai-engine` | Server-side vector search, embedding management, and semantic matching |
| **BaseAIEngine** | `@memberjunction/ai-base-engine` | Client/server metadata caching for notes, examples, and note types |
| **SimpleVectorService** | `@memberjunction/ai-vectors-memory` | In-memory vector similarity search with configurable distance metrics |
| **Entity Classes** | `@memberjunction/core-entities` | Generated TypeScript classes for `AIAgentNote`, `AIAgentExample`, `AIAgentNoteType` |

#### Architecture Diagram

```
                          ┌─────────────────────────────────────┐
                          │         Scheduled Jobs              │
                          │  Memory Manager: every 15 min       │
                          │  Memory Cleanup:  daily 3 AM UTC    │
                          └──────┬──────────────────┬───────────┘
                                 │                  │
                    ┌────────────▼────────┐  ┌──────▼──────────────┐
                    │  Memory Manager     │  │  Memory Cleanup     │
                    │  Agent              │  │  Agent              │
                    │                     │  │                     │
                    │  1. Load convos     │  │  1. Archive expired │
                    │  2. Extract notes   │  │  2. Archive stale   │
                    │  3. Dedup (3-level) │  │     (retention)     │
                    │  4. Create records  │  │                     │
                    │  5. Consolidate*    │  └─────────────────────┘
                    └───────┬─────────────┘         (* disabled)
                            │
             ┌──────────────▼──────────────┐
             │     SQL Database            │
             │  ┌────────────────────────┐ │
             │  │ AIAgentNote            │ │
             │  │ AIAgentExample         │ │
             │  │ AIAgentNoteType        │ │
             │  │ Conversation/Detail    │ │
             │  │ AIAgentRun/RunStep     │ │
             │  └────────────────────────┘ │
             └──────────────▲──────────────┘
                            │
             ┌──────────────┴──────────────┐
             │  Agent Context Injector     │
             │                             │
             │  Strategy: Relevant/Recent  │
             │  Scoping: 8-level priority  │
             │  Reranking: optional 2-stage│
             │  Formatting: with policy    │
             └──────────────▲──────────────┘
                            │
             ┌──────────────┴──────────────┐
             │  BaseAgent.initializeAgent  │
             │  Context()                  │
             │  (any agent with            │
             │   InjectNotes=true)         │
             └─────────────────────────────┘
```

---

### 2. Database Schema

#### 2.1 AIAgentNote Table

**File**: `migrations/v5/B202602151200__v5.0__Baseline.sql`
**Entity Name**: `MJ: AI Agent Notes`
**TypeScript Class**: `MJAIAgentNoteEntity` (in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`)

| Column | SQL Type | Default | Nullable | Description |
|--------|----------|---------|----------|-------------|
| `ID` | `uniqueidentifier` | `NEWSEQUENTIALID()` | No | Primary key |
| `AgentID` | `uniqueidentifier` | `NULL` | Yes | FK to `AIAgent`. NULL = not agent-specific |
| `AgentNoteTypeID` | `uniqueidentifier` | `NULL` | Yes | FK to `AIAgentNoteType` |
| `Note` | `nvarchar(MAX)` | `NULL` | Yes | The textual content of the note |
| `UserID` | `uniqueidentifier` | `NULL` | Yes | FK to `User`. NULL = not user-specific |
| `CompanyID` | `uniqueidentifier` | `NULL` | Yes | FK to `Company`. NULL = not company-specific |
| `Type` | `nvarchar(20)` | `'Preference'` | No | One of: `Preference`, `Constraint`, `Context`, `Example`, `Issue` |
| `IsAutoGenerated` | `bit` | `0` | No | `1` = extracted by Memory Manager, `0` = manually created |
| `Comments` | `nvarchar(MAX)` | `NULL` | Yes | Internal comments (NOT injected into agent context) |
| `Status` | `nvarchar(20)` | `'Active'` | No | One of: `Active`, `Pending`, `Revoked` |
| `SourceConversationID` | `uniqueidentifier` | `NULL` | Yes | FK to `Conversation` that originated this note |
| `SourceConversationDetailID` | `uniqueidentifier` | `NULL` | Yes | FK to specific `ConversationDetail` message |
| `SourceAIAgentRunID` | `uniqueidentifier` | `NULL` | Yes | FK to `AIAgentRun` that generated this note |
| `EmbeddingVector` | `nvarchar(MAX)` | `NULL` | Yes | JSON-encoded float array for semantic search |
| `EmbeddingModelID` | `uniqueidentifier` | `NULL` | Yes | FK to `AIModel` used for embedding generation |
| `PrimaryScopeEntityID` | `uniqueidentifier` | `NULL` | Yes | Entity type for primary scope (e.g., "Organizations") |
| `PrimaryScopeRecordID` | `nvarchar(100)` | `NULL` | Yes | Specific record ID within primary scope entity |
| `SecondaryScopes` | `nvarchar(MAX)` | `NULL` | Yes | JSON object with additional scope dimensions |
| `LastAccessedAt` | `datetimeoffset` | `NULL` | Yes | When note was last injected into agent context |
| `AccessCount` | `int` | `0` | No | Number of times note has been accessed/injected |
| `ExpiresAt` | `datetimeoffset` | `NULL` | Yes | Optional explicit expiration timestamp |
| `__mj_CreatedAt` | `datetimeoffset` | `GETUTCDATE()` | No | Auto-set creation timestamp (CodeGen) |
| `__mj_UpdatedAt` | `datetimeoffset` | `GETUTCDATE()` | No | Auto-set update timestamp (CodeGen) |

**Indexes**:
- `IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID` — FK index on AgentID (CodeGen)
- `IX_AIAgentNote_PrimaryScope` — Composite on `(PrimaryScopeEntityID, PrimaryScopeRecordID)` for scope-based queries
- `IX_AIAgentNote_ExpiresAt` — On `ExpiresAt` for lifecycle management queries
- `IX_AIAgentNote_Lifecycle` — Composite on `(IsAutoGenerated, Status, LastAccessedAt)` for finding active auto-generated notes with access tracking

**Zod Schema** (TypeScript validation):
```typescript
Type: z.union([z.literal('Constraint'), z.literal('Context'), z.literal('Example'), z.literal('Issue'), z.literal('Preference')])
Status: z.union([z.literal('Active'), z.literal('Pending'), z.literal('Revoked')])
```

#### 2.2 AIAgentExample Table

**Entity Name**: `MJ: AI Agent Examples`
**TypeScript Class**: `MJAIAgentExampleEntity`

| Column | SQL Type | Default | Nullable | Description |
|--------|----------|---------|----------|-------------|
| `ID` | `uniqueidentifier` | `NEWSEQUENTIALID()` | No | Primary key |
| `AgentID` | `uniqueidentifier` | — | No | FK to `AIAgent` (always required for examples) |
| `UserID` | `uniqueidentifier` | `NULL` | Yes | Optional user scope |
| `CompanyID` | `uniqueidentifier` | `NULL` | Yes | Optional company scope |
| `Type` | `nvarchar(20)` | `'Example'` | No | Same value list as notes |
| `ExampleInput` | `nvarchar(MAX)` | — | No | The input text/prompt |
| `ExampleOutput` | `nvarchar(MAX)` | — | No | The successful response |
| `IsAutoGenerated` | `bit` | `0` | No | `1` = auto-captured, `0` = manually created |
| `SourceConversationID` | `uniqueidentifier` | `NULL` | Yes | FK to source Conversation |
| `SourceConversationDetailID` | `uniqueidentifier` | `NULL` | Yes | FK to specific message |
| `SourceAIAgentRunID` | `uniqueidentifier` | `NULL` | Yes | FK to agent run |
| `SuccessScore` | `decimal(5,2)` | `NULL` | Yes | Effectiveness score 0-100 |
| `Comments` | `nvarchar(MAX)` | `NULL` | Yes | Internal comments (NOT injected) |
| `Status` | `nvarchar(20)` | `'Active'` | No | Active / Pending / Revoked |
| `EmbeddingVector` | `nvarchar(MAX)` | `NULL` | Yes | JSON embedding for semantic search |
| `EmbeddingModelID` | `uniqueidentifier` | `NULL` | Yes | FK to AI model |
| `PrimaryScopeEntityID` | `uniqueidentifier` | `NULL` | Yes | Primary scope entity type |
| `PrimaryScopeRecordID` | `nvarchar(100)` | `NULL` | Yes | Primary scope record ID |
| `SecondaryScopes` | `nvarchar(MAX)` | `NULL` | Yes | JSON secondary scope dimensions |
| `LastAccessedAt` | `datetimeoffset` | `NULL` | Yes | Last access timestamp |
| `AccessCount` | `int` | `0` | No | Access count |
| `ExpiresAt` | `datetimeoffset` | `NULL` | Yes | Expiration timestamp |
| `__mj_CreatedAt` | `datetimeoffset` | `GETUTCDATE()` | No | Auto-set (CodeGen) |
| `__mj_UpdatedAt` | `datetimeoffset` | `GETUTCDATE()` | No | Auto-set (CodeGen) |

**Indexes**: Same pattern as AIAgentNote — FK index, PrimaryScope composite, ExpiresAt, and Lifecycle composite.

#### 2.3 AIAgentNoteType Table

**Entity Name**: `MJ: AI Agent Note Types`
**TypeScript Class**: `MJAIAgentNoteTypeEntity`

| Column | SQL Type | Default | Nullable | Description |
|--------|----------|---------|----------|-------------|
| `ID` | `uniqueidentifier` | `NEWSEQUENTIALID()` | No | Primary key |
| `Name` | `nvarchar(255)` | `NULL` | Yes | Type name |
| `Description` | `nvarchar(MAX)` | `NULL` | Yes | Type description |
| `Priority` | `int` | `0` | No | Injection ordering (lower = higher priority, 0 is highest) |
| `Status` | `nvarchar(20)` | `'Active'` | No | Active / Pending / Revoked |
| `__mj_CreatedAt` | `datetimeoffset` | `GETUTCDATE()` | No | Auto-set (CodeGen) |
| `__mj_UpdatedAt` | `datetimeoffset` | `GETUTCDATE()` | No | Auto-set (CodeGen) |

#### 2.4 AIAgent Memory Configuration Fields

The `AIAgent` entity includes these memory-specific fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `InjectNotes` | `boolean` | `true` | Enable note injection into agent context |
| `MaxNotesToInject` | `number` | `5` | Maximum notes to inject per request |
| `NoteInjectionStrategy` | `'All' \| 'Recent' \| 'Relevant'` | `'Relevant'` | Note selection strategy |
| `InjectExamples` | `boolean` | `false` | Enable example injection |
| `MaxExamplesToInject` | `number` | `3` | Maximum examples to inject per request |
| `ExampleInjectionStrategy` | `'Rated' \| 'Recent' \| 'Semantic'` | `'Semantic'` | Example selection strategy |
| `NoteRetentionDays` | `number \| null` | `90` | Days before auto-archive for inactivity. NULL = system default |
| `ExampleRetentionDays` | `number \| null` | `180` | Days before low-scoring example auto-archive. NULL = system default |
| `AutoArchiveEnabled` | `boolean` | `true` | Enable automatic archival of stale items |
| `RerankerConfiguration` | `string \| null` | `NULL` | JSON config for optional two-stage retrieval reranking |

**RerankerConfiguration JSON Schema**:
```json
{
  "enabled": true,
  "rerankerModelId": "uuid",
  "retrievalMultiplier": 3,
  "minRelevanceThreshold": 0.5,
  "rerankPromptId": "uuid (optional)",
  "contextFields": ["field1", "field2"],
  "fallbackOnError": true
}
```

#### 2.5 Entity Relationship Diagram

```
AIAgent ────────────────────┐
├── InjectNotes=true        │
├── NoteInjectionStrategy   │
├── NoteRetentionDays       │
├── AutoArchiveEnabled      │
└── RerankerConfiguration   │
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
    ▼                       ▼                       ▼
AIAgentNote            AIAgentExample          AIAgentRun
├── AgentID (FK)       ├── AgentID (FK, req'd) ├── AgentID (FK)
├── UserID (FK)        ├── UserID (FK)         ├── PrimaryScope*
├── CompanyID (FK)     ├── CompanyID (FK)      ├── SecondaryScopes
├── Type               ├── ExampleInput        └── AIAgentRunStep
├── Note               ├── ExampleOutput           ├── Type
├── Status             ├── SuccessScore             ├── Input/Output
├── IsAutoGenerated    ├── EmbeddingVector          └── Status
├── EmbeddingVector    ├── PrimaryScope*
├── PrimaryScope*      └── SecondaryScopes
├── SecondaryScopes
├── LastAccessedAt
├── AccessCount
├── ExpiresAt
└── Source* (ConvID, DetailID, RunID)

AIAgentNoteType
├── Name
├── Description
├── Priority
└── Status
```

---

### 3. Memory Manager Agent

**File**: `packages/AI/Agents/src/memory-manager-agent.ts`
**Agent ID**: `A1575099-1576-45E9-A6FD-88102FB7E510`
**Schedule**: Every 15 minutes (`0 */15 * * * *`)
**Type**: Loop agent (system-restricted)

#### 3.1 Configuration Constants

```typescript
// Lines 20-32
const EXTRACTION_CONFIG = {
    maxNotesPerRun: 1000,
    maxNotesPerConversation: 1000,
    maxNotesPerMessage: 1000,
    minConfidenceThreshold: 80,    // Minimum confidence score (0-100) to accept
    minContentLength: 10,          // Minimum note text length in characters
    cooldownHours: 24              // Don't re-extract from same conversation within 24h
};

// Lines 33-45
const CONSOLIDATION_CONFIG = {
    frequency: 'disabled' as 'disabled' | 'every-run' | 'hourly' | 'daily' | number,
    minClusterSize: 3,             // Minimum notes to form a consolidation cluster
    similarityThreshold: 0.60      // Vector cosine similarity threshold for clustering
};
```

#### 3.2 Key Interfaces

```typescript
// Lines 51-71
interface ConversationWithRatings {
    conversationId: string;
    userId: string | null;
    agentRunId: string | null;
    messages: MessageWithRating[];
    hasPositiveRating: boolean;    // Any message rated 8-10
    hasNegativeRating: boolean;    // Any message rated 1-3
    isUnrated: boolean;            // No ratings at all
}

// Lines 104-123
interface ExtractedNote {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    agentId?: string;
    userId?: string;
    companyId?: string;
    content: string;
    confidence: number;
    sourceConversationId?: string;
    sourceConversationDetailId?: string;
    sourceAgentRunId?: string;
    mergeWithExistingIds?: string[];    // IDs of existing notes to revoke/replace
    mergeWithExistingId?: string;       // Legacy singular form (normalized to plural)
    scopeLevel?: 'global' | 'company' | 'user';
}

// Lines 128-147
interface ExtractedExample {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    agentId: string;
    userId?: string;
    companyId?: string;
    exampleInput: string;
    exampleOutput: string;
    successScore: number;
    confidence: number;
    sourceConversationId?: string;
    sourceConversationDetailId?: string;
    sourceAgentRunId?: string;
    scopeLevel?: 'global' | 'company' | 'user';
}
```

#### 3.3 Execution Flow (`executeAgentInternal`)

The main execution method (lines 1539-1735) runs the following pipeline:

```
Step 1: LoadConversationsWithNewActivity()
    │  Uses optimized GetConversationsForMemoryManager SQL query
    │  Returns ConversationWithRatings[] with rating context
    │
Step 2: LoadHighValueAgentRuns()
    │  Finds runs with high-usage artifacts (shared 2+ or used 5+ times)
    │
Step 3: Ensure vector services via AIEngine.Instance.Config(true, contextUser)
    │
Step 4: ExtractNotesFromConversations()
    │  Uses 'Memory Manager - Extract Notes' prompt
    │
Step 5: ExtractExamples()
    │  Uses 'Memory Manager - Extract Examples' prompt
    │
Step 6: CreateNoteRecords() + CreateExampleRecords()
    │  Handles scope inheritance from source agent runs
    │  Handles merge/contradiction revocation
    │
Step 7: shouldRunConsolidation() check
    │  (Currently always false — frequency='disabled')
    │
Step 8: consolidateRelatedNotes() — if consolidation enabled
    │
Final: Return summary with counts
```

#### 3.4 Note Extraction Pipeline (Lines 435-783)

**Input**: `ConversationWithRatings[]` with messages and rating context.

**Process**:

1. **Load existing notes** for deduplication baseline
2. **Prepare conversation threads** with rating data for LLM context
3. **Find prompt**: `'Memory Manager - Extract Notes'`
4. **Execute LLM** via `AIPromptRunner`
5. **Parse results** — handle JSON string wrapping
6. **Normalize fields** — convert singular `mergeWithExistingId` to plural `mergeWithExistingIds` (lines 569-574)
7. **Filter** by confidence (`>= 80`) and content length (`>= 10` chars)
8. **Apply sparsity controls** — enforce per-message and per-conversation limits
9. **Collapse merge candidates** — deduplicate notes with identical content targeting different existing notes (lines 1097-1117)
10. **Three-level deduplication** (lines 679-742):

    **Level 1 — Exact match**: Case-insensitive, trimmed content comparison. Skip if duplicate found.

    **Level 2 — Semantic similarity**: `FindSimilarAgentNotes()` at 85% threshold, top 10 results. Includes cross-user dedup for org/global notes (UserID=null visibility).

    **Level 3 — LLM dedup decision**: If similar notes found, ask `'Memory Manager - Deduplicate Note'` prompt. LLM decides `shouldAdd` with reasons.

    **Auto-approve**: Notes with `mergeWithExistingIds` bypass dedup (treated as intentional contradiction resolutions).

11. **Enrich** with userId and agentRunId from conversation context (lines 758-781)

#### 3.5 Note Creation with Scope Inheritance (Lines 949-1089)

When creating note records from extracted data:

1. **Load source agent run** (if `sourceAgentRunId` provided) for scope inheritance
2. **Handle merge/contradiction** — If `mergeWithExistingIds` is set:
   - Revoke existing notes with `Status='Revoked'`
   - Add comment: `"Superseded: contradiction detected..."`
3. **UUID validation** — Filter LLM placeholder values like `"user-uuid-here"` (lines 1020-1023)
4. **Apply scope based on `scopeLevel`**:

   | scopeLevel | PrimaryScopeRecordID | SecondaryScopes | UserID |
   |------------|---------------------|-----------------|--------|
   | `global` | null | null | null |
   | `company` | Copied from source run | null | null |
   | `user` (default) | Copied from source run | Copied from source run | Set from conversation |

5. **UserID special handling**: Only set for `scopeLevel === 'user'`. Setting UserID to null for company-scoped notes enables cross-user visibility in semantic dedup.

#### 3.6 Note Consolidation (Lines 1175-1403)

**Status**: Infrastructure built, currently **disabled** (`frequency: 'disabled'`).

**`shouldRunConsolidation()`**: Checks frequency setting:
- `'disabled'` — always returns false
- `'every-run'` — always returns true
- `'hourly'` — true if >1 hour since last consolidation
- `'daily'` — true if >24 hours since last consolidation
- `number` — true every N runs

**`findConsolidationClusters()` (lines 1252-1286)**:
1. For each active auto-generated note, find similar notes at 60% similarity threshold
2. Form clusters of size >= `minClusterSize` (3)
3. Track processed IDs to avoid overlapping clusters

**`processConsolidationCluster()` (lines 1292-1403)**:
1. Execute `'Memory Manager - Consolidate Notes'` prompt with cluster data
2. LLM decides whether to consolidate (`shouldConsolidate: boolean`)
3. If yes: create consolidated note with combined `AccessCount` from all source notes
4. Revoke source notes with `Status='Revoked'` and `Comments='Revoked during note consolidation'`
5. Apply scope from template note

**Current gap**: Revoked source notes do **NOT** have a `ConsolidatedIntoNoteID` field (column does not exist yet). The TODO comment at lines 1379-1380 acknowledges this.

#### 3.7 Merge Candidate Collapsing (Lines 1097-1117)

When the LLM extracts multiple notes with identical content but targeting different existing notes for replacement:

**Example**: LLM extracts "User hates pizza" targeting both a pepperoni-note and a mushroom-note.

**Algorithm**:
1. Group candidates by normalized content (lowercase, trimmed)
2. For candidates with `mergeWithExistingIds`, collect all merge targets
3. Return collapsed list where each unique content appears once with all targets combined

#### 3.8 Observability (Lines 169-247)

Each phase creates `AIAgentRunStep` records:

| Step | Type | Description |
|------|------|-------------|
| Load Conversations | Decision | Counts of conversations loaded |
| Load Agent Runs | Decision | High-value agent runs found |
| Extract Notes | Prompt | Notes extracted with confidence data |
| Deduplicate Notes | Decision | Approvals/rejections from dedup |
| Create Note Records | Decision | Created/merged/failed counts |
| Extract Examples | Prompt | Examples extracted |
| Deduplicate Examples | Decision | Example dedup results |
| Create Example Records | Decision | Created/failed counts |

Methods:
- `CreateRunStep(type, description, inputData)` — Creates step record
- `FinalizeRunStep(stepId, status, outputData, error?)` — Updates step with results

---

### 4. Memory Cleanup Agent

**File**: `packages/AI/Agents/src/memory-cleanup-agent.ts`
**Agent ID**: `A4998A55-C023-47B4-9A20-1FC965F4B5D3`
**Schedule**: Daily at 3:00 AM UTC (`0 0 3 * * *`)
**Type**: Loop agent (system-restricted, no LLM prompts)

#### 4.1 Constants

```typescript
DEFAULT_NOTE_RETENTION_DAYS = 90;
DEFAULT_EXAMPLE_RETENTION_DAYS = 180;
LOW_SUCCESS_SCORE_THRESHOLD = 50;
```

#### 4.2 Execution Flow (Lines 36-78)

```
Step 1: archiveExpiredItems()
    │  Notes/examples with ExpiresAt < now()
    │
Step 2: archiveStaleItems()
    │  Per-agent retention policy evaluation
    │
Final: Build summary and return
```

#### 4.3 Retention Policy Logic (Lines 112-145)

For each agent with `AutoArchiveEnabled = true`:

**Note archival criteria**:
- `IsAutoGenerated = true` (manual notes are NEVER auto-archived)
- `Status = 'Active'`
- `LastAccessedAt < cutoff` OR (`LastAccessedAt IS NULL` AND `__mj_CreatedAt < cutoff`)
- Cutoff = `now() - NoteRetentionDays` (default: 90 days)

**Example archival criteria**:
- All note criteria above, PLUS:
- `SuccessScore < 50`
- Cutoff = `now() - ExampleRetentionDays` (default: 180 days)

**Expired items** (independent of retention):
- Any note/example with `ExpiresAt IS NOT NULL AND ExpiresAt < now()`

#### 4.4 Archive Implementation (Lines 250-291)

- Sets `Status = 'Archived'`
- Appends comment: `[Archived by Memory Cleanup Agent: {reason} on {timestamp}]`

**Note**: The `'Archived'` status value may not be in the current Status value list (which only includes Active/Pending/Revoked). This is an open question from the consolidation spec.

---

### 5. Agent Context Injector

**File**: `packages/AI/Agents/src/agent-context-injector.ts`

#### 5.1 Core Interfaces

```typescript
// Lines 29-56
interface GetNotesParams {
    agentId: string;
    userId?: string;
    companyId?: string;
    currentInput?: string;              // For semantic search
    strategy: 'Relevant' | 'Recent' | 'All';
    maxNotes: number;
    contextUser: UserInfo;
    primaryScopeEntityId?: string;
    primaryScopeRecordId?: string;
    secondaryScopes?: Record<string, string>;
    secondaryScopeConfig?: SecondaryScopeConfig;
    rerankerConfig?: RerankerConfiguration;
    // Observability
    agentRunID?: string;
    parentStepID?: string;
}

// Lines 61-80
interface GetExamplesParams {
    // Same structure as notes
    strategy: 'Semantic' | 'Recent' | 'Rated';
    // ...
}
```

#### 5.2 Retrieval Strategies

##### Notes Retrieval (Lines 91-258)

| Strategy | Method | Behavior |
|----------|--------|----------|
| `Relevant` | Semantic vector search | `AIEngine.FindSimilarAgentNotes()` at 0.5 threshold. Optional two-stage reranking. Scope pre-filter applied before reranking. |
| `Recent` | Database query | RunView with 8-level scoping filter + secondary scope filter, sorted by `__mj_CreatedAt DESC` |
| `All` | Database query | Same as Recent but sorted by note type priority |

**Two-stage reranking** (when `rerankerConfig.enabled = true`):
1. Fetch `N * retrievalMultiplier` candidates from vector search
2. Rerank with configured reranker model
3. Return top N reranked results
4. Fallback to vector results on error (if `fallbackOnError = true`)

##### Examples Retrieval (Lines 105-275)

| Strategy | Method | Behavior |
|----------|--------|----------|
| `Semantic` | Vector search | `AIEngine.FindSimilarAgentExamples()` at 0.5 threshold |
| `Recent` | Cached filter | Filter `AIEngine.AgentExamples`, sort by `__mj_CreatedAt DESC` |
| `Rated` | Cached filter | Filter `AIEngine.AgentExamples`, sort by `SuccessScore DESC` |

#### 5.3 Formatting for Injection

**`FormatNotesForInjection()`** (Lines 722-809):

Produces structured text with an optional `<memory_policy>` preamble containing:
1. Precedence rules (current message > user-specific > company > global)
2. Conflict resolution strategy
3. Instructions for the agent on how to weight conflicting notes

Format per note:
```
[Type] Note content
  Scope: Agent + User specific
```

**`FormatExamplesForInjection()`**: Q/A pairs with success scores.

#### 5.4 Scope Determination Helpers (Lines 813-838)

`determineNoteScope()` returns human-readable strings:
- "Agent + User + Company specific"
- "Agent + Company specific"
- "User-specific"
- "Global"
- etc.

`determineSecondaryScope()`: Returns multi-tenant scope label or null.

---

### 6. AIEngine Vector Services

**File**: `packages/AI/Engine/src/AIEngine.ts`

#### 6.1 Vector Service Properties

```typescript
private _noteVectorService: SimpleVectorService<NoteEmbeddingMetadata> | null = null;
private _exampleVectorService: SimpleVectorService<ExampleEmbeddingMetadata> | null = null;
```

#### 6.2 Embedding Refresh

**`RefreshServerSpecificMetadata()`** loads all embeddings in parallel:
- `RefreshAgentEmbeddings()`
- `RefreshActionEmbeddings()`
- `RefreshNoteEmbeddings()`
- `RefreshExampleEmbeddings()`

**`RefreshNoteEmbeddings()`**:
1. Load all active agent notes
2. Skip notes without existing embeddings
3. Parse `EmbeddingVector` JSON into float arrays
4. Package metadata (AgentID, UserID, CompanyID, scope fields)
5. Create `SimpleVectorService<NoteEmbeddingMetadata>` and load vectors

**`RefreshExampleEmbeddings()`**: Same pattern for examples.

#### 6.3 Vector Search Methods

**`FindSimilarAgentNotes()`** (Lines 946-1043):
```typescript
FindSimilarAgentNotes(
    queryText: string,
    agentId: string,
    userId?: string,
    companyId?: string,
    maxResults?: number,       // default: 5-10
    similarityThreshold?: number,  // default: 0.5
    scopePreFilter?: (metadata: NoteEmbeddingMetadata) => boolean
): NoteMatchResult[]
```

Returns `NoteMatchResult[]` with similarity scores. Falls back to cached notes without ranking if vector service is unavailable.

**`FindSimilarAgentExamples()`** (Lines 1050-1133): Same signature pattern, returns `ExampleMatchResult[]`.

#### 6.4 Metadata Packaging

**`NoteEmbeddingMetadata`**: Tracks AgentID, UserID, CompanyID, PrimaryScopeEntityID, PrimaryScopeRecordID, SecondaryScopes for scope pre-filtering during vector search.

**`ExampleEmbeddingMetadata`**: Same approach for examples.

---

### 7. SimpleVectorService (In-Memory Vector Search)

**Package**: `@memberjunction/ai-vectors-memory`
**File**: `packages/AI/Vectors/Memory/src/models/SimpleVectorService.ts`

#### 7.1 Core Types

```typescript
type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan' | 'dotproduct' | 'jaccard' | 'hamming';

interface VectorEntry<TMetadata> {
    key: string;           // Unique identifier
    vector: number[];      // The embedding
    metadata?: TMetadata;  // Associated metadata
}

interface VectorSearchResult<TMetadata> {
    key: string;           // Matched vector key
    score: number;         // Similarity score (0-1 for cosine)
    metadata?: TMetadata;  // Associated metadata
}

interface ClusterResult<TMetadata> {
    clusters: Map<number, string[]>;         // Cluster ID -> vector keys
    centroids?: Map<number, number[]>;       // K-means centroids
    outliers?: string[];                     // DBSCAN outliers
    metadata?: {
        metric: DistanceMetric;
        iterations?: number;
        inertia?: number;
        silhouetteScore?: number;
    };
}
```

#### 7.2 Public Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `LoadVectors` | `(entries: VectorEntry[] \| Map<string, number[]>)` | Bulk load vectors with dimension validation |
| `AddVector` | `(key, vector, metadata?)` | Add or update single vector |
| `FindNearest` | `(queryVector, topK?, threshold?, metric?, filter?)` | Find similar vectors with optional metadata pre-filter |
| `FindSimilar` | `(key, topK?, threshold?, metric?, filter?)` | Find similar to existing vector (excludes self) |
| `Similarity` | `(key1, key2)` | Cosine similarity between two stored vectors |

**Cosine similarity scale**:
- `1.0` = identical vectors
- `0.7-1.0` = high similarity
- `0.3-0.7` = moderate similarity
- `< 0.3` = low similarity
- `0.0` = perpendicular
- `-1.0` = opposite

---

### 8. BaseAIEngine Memory Caching

**File**: `packages/AI/BaseAIEngine/src/BaseAIEngine.ts`

#### 8.1 Cached Properties

```typescript
// Line 87-88
private _agentNotes: MJAIAgentNoteEntity[] = [];
private _agentExamples: MJAIAgentExampleEntity[] = [];
```

Registered as MJ cached properties (lines 165-170) with load methods:
- `_agentNotes` → `GetAgentMemoryNotes`
- `_agentExamples` → `GetAgentMemoryExamples`

#### 8.2 Public Getters

```typescript
public get AgentNotes(): MJAIAgentNoteEntity[] { return this._agentNotes; }
public get AgentExamples(): MJAIAgentExampleEntity[] { return this._agentExamples; }
public get AgentNoteTypes(): MJAIAgentNoteTypeEntity[] { /* from metadata */ }
```

These caches are loaded on `AIEngine.Config()` and used by the context injector for database-strategy retrievals (Recent, All, Rated).

---

### 9. Multi-Tenant Scoping Architecture

**Documentation**: `packages/AI/Agents/docs/AGENT_MEMORY_SCOPING.md`

#### 9.1 Three Scope Tiers

```
Tier 1: Built-in Fixed Scopes (Always Available)
├── AgentID   — Agent-specific memory
├── UserID    — User-specific memory
└── CompanyID — Company/tenant isolation

Tier 2: Primary Scope (Entity-Based)
├── PrimaryScopeEntityID  — Entity type (e.g., "Organizations")
└── PrimaryScopeRecordID  — Specific record ID (indexed for performance)

Tier 3: Secondary Scopes (Flexible JSON)
└── SecondaryScopes — JSON object with custom dimension values
    Example: { "ContactID": "contact-456", "TeamID": "team-alpha" }
```

#### 9.2 8-Level MJ-Internal Priority System

Notes are retrieved using an OR-based filter with 8 priority levels. Higher priority levels are more specific:

| Priority | AgentID | UserID | CompanyID | Description |
|----------|---------|--------|-----------|-------------|
| 1 (highest) | Set | Set | Set | Agent + User + Company |
| 2 | Set | Set | NULL | Agent + User |
| 3 | Set | NULL | Set | Agent + Company |
| 4 | NULL | Set | Set | User + Company |
| 5 | Set | NULL | NULL | Agent only |
| 6 | NULL | Set | NULL | User only |
| 7 | NULL | NULL | Set | Company only |
| 8 (lowest) | NULL | NULL | NULL | Global |

All levels are combined with OR — the injector retrieves notes at all applicable scope levels and lets the memory policy preamble guide the agent on precedence.

#### 9.3 SecondaryScopeConfig

Stored on `AIAgent.ScopeConfig` as JSON:

```json
{
    "dimensions": [
        {
            "name": "ContactID",
            "entityId": "uuid",
            "required": false,
            "inheritanceMode": "cascading",
            "description": "Customer contact"
        }
    ],
    "defaultInheritanceMode": "cascading",
    "allowSecondaryOnly": false,
    "strictValidation": true
}
```

#### 9.4 Inheritance Modes

| Mode | Query Has Value | Note Has Value | Matches? |
|------|----------------|----------------|----------|
| **Cascading** | ContactID=123 | ContactID=123 | Yes |
| **Cascading** | ContactID=123 | *(missing)* | Yes (broader note surfaces) |
| **Cascading** | ContactID=123 | ContactID=456 | No |
| **Strict** | DealStage=A | DealStage=A | Yes |
| **Strict** | DealStage=A | *(missing)* | No (must match exactly) |
| **Strict** | DealStage=A | DealStage=B | No |

SQL implementation uses `JSON_VALUE(SecondaryScopes, '$.ContactID')` for dimension matching.

#### 9.5 Scope Inheritance from Agent Runs

When the Memory Manager creates notes from conversations, it inherits scope from the source agent run:

| scopeLevel (from LLM) | PrimaryScopeRecordID | SecondaryScopes | UserID |
|------------------------|---------------------|-----------------|--------|
| `global` | null | null | null |
| `company` | Copied from source run | null | null |
| `user` (default) | Copied from source run | Copied from source run | Set from conversation |

#### 9.6 Scope Pre-Filter in Vector Search

The `AgentContextInjector` builds a scope pre-filter callback passed to `FindSimilarAgentNotes()`. This filter runs on vector search results **before** reranking, ensuring scope-invalid notes are never considered.

---

### 10. LLM Prompt Templates

**Location**: `metadata/prompts/templates/memory-manager/`
**Metadata index**: `metadata/prompts/.memory-manager-prompts.json`
**Models**: Gemini 3 Flash (priority 1), GPT-OSS-120B (priority 2)

#### 10.1 Extract Notes (`extract-notes.md`)

**Purpose**: Analyze conversation threads and extract typed notes with confidence scores.

**Key sections**:

- **Rating Context**: Differentiates extraction behavior based on conversation ratings:
  - Positive (8-10): Extract what user LIKED
  - Negative (1-3): Extract what user DIDN'T like
  - Unrated: Only explicit preferences mentioned

- **Note Types**:
  - `Preference` — User preferences for information presentation
  - `Constraint` — Hard rules ("Never include PII")
  - `Context` — Background facts and domain knowledge
  - `Issue` — Known bugs and limitations

- **Scoping Rules**:
  - Company scope keywords: "we", "our", "my team", "company", "organization"
  - User scope keywords: "I", "me", "my", "prefer", "like", "want"
  - Global scope keywords: "always", "never", "all users", "everyone"
  - Disambiguation test: "Would violating this norm be wrong for ANY agent talking to ANY user?" If yes → global

- **Deduplication within extraction**:
  - Step 1: Check if existing notes already cover this content (skip if exact dup)
  - Step 2: Check if new observation contradicts existing note (set `mergeWithExistingId` to the note being replaced)
  - Step 3: Extract as new if neither duplicate nor contradiction

- **Confidence scoring**:
  - 90-100: High confidence, explicitly stated
  - 80-89: Medium confidence, inferred
  - <80: Below threshold, skip

- **Output**: JSON array of `ExtractedNote` objects

#### 10.2 Extract Examples (`extract-examples.md`)

**Purpose**: Extract input/output pairs from positively-rated messages.

**Scoring formula**:
- User rating contribution: 40 points
- Completeness: 30 points
- Clarity: 30 points
- Minimum threshold: 70

**Constraints**:
- `exampleInput` max 500 characters
- `exampleOutput` max 1000 characters
- `successScore` must be >= 70

#### 10.3 Deduplicate Note (`deduplicate-note.md`)

**Purpose**: Evaluate whether a candidate note adds value beyond existing similar notes.

**Core principle**: "High similarity does NOT equal duplicate. Two notes can be about the same subject yet convey distinct facts."

**Add if**:
1. New or additive information
2. Different scope level
3. Refinement/more specific detail
4. Contradiction resolution

**Skip if**:
1. True duplicate (exact same specific info)
2. Strict subset (every detail already covered)
3. Redundant (no additional value)

#### 10.4 Deduplicate Example (`deduplicate-example.md`)

**Purpose**: Evaluate whether a candidate example adds value beyond existing similar examples.

**Add criteria**: Different aspect, more complete, edge case, different valid approach, higher quality.

**Skip criteria**: Duplicate, same pattern, lower quality, minor variation, >90% similarity.

#### 10.5 Consolidate Notes (`consolidate-notes.md`)

**Purpose**: Synthesize clusters of semantically similar notes into single comprehensive notes.

**Guidelines**:
1. **Preserve information**: Combine distinct facts, keep most specific
2. **Resolve conflicts**: Prefer more recent note OR higher access count
3. **Maintain type consistency**: Same type as majority or most appropriate
4. **Quality standards**: Max 200 characters, clear language
5. **Scope selection**: Least restrictive scope that still accurately represents info

**Output**:
```json
{
    "shouldConsolidate": true,
    "consolidatedNote": {
        "type": "Preference",
        "content": "...",
        "scopeLevel": "user",
        "confidence": 90
    },
    "sourceNoteIds": ["id1", "id2", "id3"],
    "reason": "..."
}
```

**Current gaps in this prompt** (identified by consolidation spec):
- No temporal normalization (relative dates not converted to absolute)
- No explicit access frequency weighting rules
- No aggressive contradiction resolution instructions

#### 10.6 Prompt Configuration

All prompts share:
- **ResponseFormat**: JSON
- **AssistantPrefill**: `` ```json ``
- **StopSequences**: `` \n``` ``
- **Model assignments**: Gemini 3 Flash (priority 1), GPT-OSS-120B (priority 2)

---

### 11. Metadata & Scheduled Jobs

#### 11.1 Memory Manager Agent Metadata

**File**: `metadata/agents/.memory-manager-agent.json`

```json
{
    "Name": "Memory Manager",
    "Type": "Loop",
    "Status": "Active",
    "IsRestricted": true,
    "InjectNotes": false,
    "InjectExamples": false,
    "ArtifactCreationMode": "Never",
    "IconClass": "fa-solid fa-brain"
}
```

Related prompts (via `relatedEntities`):
- Memory Manager - Extract Notes (ExecutionOrder: 0)
- Memory Manager - Extract Examples (ExecutionOrder: 1)

#### 11.2 Memory Cleanup Agent Metadata

**File**: `metadata/agents/.memory-cleanup-agent.json`

```json
{
    "Name": "Memory Cleanup Agent",
    "Type": "Loop",
    "Status": "Active",
    "IsRestricted": true,
    "InjectNotes": false,
    "InjectExamples": false,
    "IconClass": "fa-solid fa-broom"
}
```

No related prompts — this is a non-LLM agent (pure database operations).

#### 11.3 Scheduled Job Configurations

**Memory Manager** (`metadata/scheduled-jobs/.memory-manager-job.json`):
- Cron: `0 */15 * * * *` (every 15 minutes)
- Initial message: "Analyze recent conversations and extract notes/examples"

**Memory Cleanup** (`metadata/scheduled-jobs/.memory-cleanup-job.json`):
- Cron: `0 0 3 * * *` (daily at 3 AM UTC)
- Initial message: "Archive stale notes and examples based on retention policies"

---

### 12. Optimized Query

**File**: `metadata/queries/.get-conversations-for-memory-manager.json`

#### Purpose

Single optimized SQL query that replaces 4 separate database queries for the Memory Manager. Returns conversation details with:

- Conversation ID
- User ID (for scope inheritance)
- Most recent AgentRunID (for scope inheritance)
- Messages as JSON array (via SQL Server `FOR JSON PATH`)
- Rating summary flags: `HasPositiveRating`, `HasNegativeRating`, `IsUnrated`
- Quality assessment: QualityRank 9/10, ExecutionCostRank 3/10

#### Optimization Impact

Before: 4 sequential RunView calls to load conversations, messages, ratings, and agent runs.
After: 1 query returning denormalized data with JSON aggregation.

---

### 13. Base Agent Integration

**File**: `packages/AI/Agents/src/base-agent.ts`

#### `initializeAgentContext()` Memory Integration

When any agent starts execution, `BaseAgent` checks if memory injection is enabled:

1. Check `agent.InjectNotes` and `agent.InjectExamples` flags
2. Resolve scope from `params` or `params.data` (GraphQL fallback)
3. Call `AgentContextInjector.GetNotesForContext()` with:
   - Agent's configured strategy and max limits
   - Scope config for secondary scope validation
   - Current input text for semantic search (if strategy is 'Relevant')
   - Optional reranker configuration
4. Format retrieved notes/examples and inject into agent context

This means **any agent** with `InjectNotes=true` automatically receives relevant memory at the start of each execution.

---

### 14. Angular UI Components

#### Generated Form Components

CodeGen produces standard CRUD forms for memory entities:

| Entity | Component Directory |
|--------|-------------------|
| `MJ: AI Agent Notes` | `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJAIAgentNote/` |
| `MJ: AI Agent Examples` | `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJAIAgentExample/` |
| `MJ: AI Agent Note Types` | `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJAIAgentNoteType/` |

These provide basic data entry and management for memory records through MJExplorer. There is no specialized dashboard or visualization UI for memory management — it uses the standard entity form infrastructure.

---

### 15. Unit Tests

**File**: `packages/AI/Agents/src/__tests__/agent-memory-features.test.ts` (~612 lines)

#### Test Coverage Areas

| Area | Tests |
|------|-------|
| **Scope Determination** | `determineNoteScope()` variations, `determineSecondaryScope()`, multi-level combinations |
| **Format Notes** | Memory policy inclusion/exclusion, note count and content, secondary scope display, empty notes handling |
| **Feedback Questions** | Warning filtering (`requiresFeedback`), content truncation, key removal, context inclusion |
| **PayloadFeedbackManager** | Question generation, LLM response mapping, feedback normalization |

#### Additional Test Files

- `packages/AI/Vectors/Memory/test-clustering.ts` — Vector clustering tests
- `packages/AI/Vectors/Memory/test-distance-metrics.ts` — Distance metric accuracy tests

---

### 16. End-to-End Data Flows

#### 16.1 Memory Extraction Flow (Every 15 Minutes)

```
Scheduled Job triggers Memory Manager Agent
    │
    ▼
LoadAgentsUsingMemory()
    │  Filter: agents with InjectNotes=true OR InjectExamples=true
    │
    ▼
LoadConversationsWithNewActivity()
    │  Optimized SQL query with rating summaries
    │  Cooldown: skip conversations processed within 24h
    │
    ▼
LoadHighValueAgentRuns()
    │  Artifacts shared 2+ times or used 5+ times
    │
    ▼
AIEngine.Instance.Config(true, contextUser)
    │  Ensure vector services initialized with embeddings
    │
    ▼
ExtractNotesFromConversations()
    │  LLM: 'Extract Notes' prompt with rating context
    │  Filter: confidence >= 80, length >= 10
    │  Sparsity: per-message and per-conversation limits
    │  Collapse merge candidates
    │  Dedup: exact match → semantic (85%) → LLM decision
    │
    ▼
ExtractExamples()
    │  LLM: 'Extract Examples' prompt
    │  Filter: successScore >= 70
    │  Dedup: semantic → LLM decision
    │
    ▼
CreateNoteRecords()
    │  Load source agent run for scope
    │  Handle mergeWithExistingIds (revoke + replace)
    │  UUID validation (filter LLM placeholders)
    │  Apply scopeLevel (global/company/user)
    │  Scope inheritance from source run
    │
    ▼
CreateExampleRecords()
    │  Same scope logic
    │
    ▼
shouldRunConsolidation()  ← currently always false
    │
    ▼
(Consolidation would run here if enabled)
    │
    ▼
Return summary: notes created, examples created, conversations processed
```

#### 16.2 Memory Retrieval Flow (On Every Agent Execution)

```
Agent execution begins
    │
    ▼
BaseAgent.initializeAgentContext()
    │  Check: agent.InjectNotes? agent.InjectExamples?
    │
    ▼
AgentContextInjector.GetNotesForContext()
    │
    ├── Strategy: 'Relevant'
    │   ├── Build scope pre-filter callback
    │   ├── AIEngine.FindSimilarAgentNotes(currentInput, 0.5 threshold)
    │   ├── Optional: two-stage reranking
    │   │   ├── Fetch N × retrievalMultiplier candidates
    │   │   ├── Rerank with configured model
    │   │   └── Fallback to vector results on error
    │   └── Return top N notes
    │
    ├── Strategy: 'Recent'
    │   ├── Build 8-level scoping SQL filter
    │   ├── Build secondary scope SQL filter
    │   ├── RunView sorted by __mj_CreatedAt DESC
    │   └── Return top N notes
    │
    └── Strategy: 'All'
        ├── Same scoping filters
        ├── Sort by NoteType priority
        └── Return top N notes
    │
    ▼
FormatNotesForInjection()
    │  <memory_policy> preamble with precedence rules
    │  [Type] Note content
    │    Scope: ...
    │
    ▼
Inject into agent system context
    │
    ▼
Agent processes request with memory-enriched context
```

#### 16.3 Memory Cleanup Flow (Daily 3 AM UTC)

```
Scheduled Job triggers Memory Cleanup Agent
    │
    ▼
archiveExpiredItems()
    │  Query: ExpiresAt IS NOT NULL AND ExpiresAt < now()
    │  Set Status='Archived', add comment
    │
    ▼
archiveStaleItems()
    │  For each agent with AutoArchiveEnabled=true:
    │    │
    │    ├── Notes: IsAutoGenerated=true, not accessed within NoteRetentionDays
    │    │   Set Status='Archived'
    │    │
    │    └── Examples: IsAutoGenerated=true, SuccessScore < 50,
    │        not accessed within ExampleRetentionDays
    │        Set Status='Archived'
    │
    ▼
Return summary: notesArchived, examplesArchived, notesExpired, examplesExpired
```

---

### 17. Performance Optimizations

| Optimization | Location | Impact |
|-------------|----------|--------|
| **Single optimized query** | `GetConversationsForMemoryManager` | Replaces 4 sequential DB calls with 1 query using `FOR JSON PATH` |
| **Parallel embedding refresh** | `AIEngine.RefreshServerSpecificMetadata()` | Notes, examples, agents, actions loaded concurrently |
| **Vector service caching** | `AIEngine._noteVectorService` | Embeddings cached in memory, only refreshed on `Config()` calls |
| **Sparsity controls** | `EXTRACTION_CONFIG` | Per-message/conversation limits prevent over-extraction |
| **Merge candidate collapsing** | `collapseMergeCandidates()` | Deduplicates identical content before LLM decisions |
| **Source run caching** | `CreateNoteRecords()` | Source agent runs cached in Map to avoid repeated lookups |
| **Scope pre-filter** | `AgentContextInjector` | Filters scope-invalid notes before expensive reranking |
| **Lifecycle indexes** | `IX_AIAgentNote_Lifecycle` | Composite index on `(IsAutoGenerated, Status, LastAccessedAt)` for cleanup queries |
| **PrimaryScope index** | `IX_AIAgentNote_PrimaryScope` | Composite on `(PrimaryScopeEntityID, PrimaryScopeRecordID)` for scoped queries |

---

### 18. Known Gaps (Pre-Consolidation)

These are the gaps identified by the consolidation spec (`001-memory-consolidation/spec.md`) that the new feature aims to address:

| Gap | Description | Current State |
|-----|-------------|---------------|
| **Consolidation disabled** | `CONSOLIDATION_CONFIG.frequency = 'disabled'`. Infrastructure built but never runs. Notes accumulate without synthesis. | Code exists at lines 1175-1403 but is gated behind disabled config |
| **No `ConsolidatedIntoNoteID`** | When notes are revoked during consolidation, there's no FK linking them to the replacement note. TODO comment at lines 1379-1380. | Column does not exist in schema |
| **No contradiction detection** | Contradictions are caught at extraction time (`mergeWithExistingIds`) but not proactively between existing notes from different extraction runs. | Reactive only, not proactive |
| **No temporal normalization** | Relative dates in notes ("last week", "yesterday") become meaningless over time. The consolidation prompt does not convert them to absolute dates. | Not addressed in current prompt |
| **No stale reference pruning** | Notes referencing deleted/deactivated agents, users, or conversations persist until calendar-based archival (90 days). | No orphan detection |
| **Split lifecycle management** | Memory Manager handles extraction + consolidation, Memory Cleanup handles archival. No coordination, potential race conditions. | Two independent agents |
| **No access frequency weighting** | Consolidation prompt doesn't use AccessCount to weight conflicting notes. | Not in current prompt |
| **Status value list gap** | Cleanup Agent sets `Status='Archived'` but the value list only includes Active/Pending/Revoked. | Possible data integrity issue |

---

### Appendix: Key File Index

| File | Purpose |
|------|---------|
| `packages/AI/Agents/src/memory-manager-agent.ts` | Memory extraction, dedup, consolidation |
| `packages/AI/Agents/src/memory-cleanup-agent.ts` | Retention-based archival |
| `packages/AI/Agents/src/agent-context-injector.ts` | Memory retrieval and injection |
| `packages/AI/Agents/src/base-agent.ts` | Agent initialization with memory integration |
| `packages/AI/Engine/src/AIEngine.ts` | Server-side vector search and embedding management |
| `packages/AI/BaseAIEngine/src/BaseAIEngine.ts` | Memory caching (AgentNotes, AgentExamples) |
| `packages/AI/Vectors/Memory/src/models/SimpleVectorService.ts` | In-memory vector similarity search |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Generated entity classes with Zod schemas |
| `metadata/prompts/templates/memory-manager/extract-notes.md` | Note extraction prompt |
| `metadata/prompts/templates/memory-manager/extract-examples.md` | Example extraction prompt |
| `metadata/prompts/templates/memory-manager/deduplicate-note.md` | Note dedup prompt |
| `metadata/prompts/templates/memory-manager/deduplicate-example.md` | Example dedup prompt |
| `metadata/prompts/templates/memory-manager/consolidate-notes.md` | Note consolidation prompt |
| `metadata/prompts/.memory-manager-prompts.json` | Prompt metadata entries |
| `metadata/agents/.memory-manager-agent.json` | Memory Manager agent metadata |
| `metadata/agents/.memory-cleanup-agent.json` | Cleanup Agent metadata |
| `metadata/scheduled-jobs/.memory-manager-job.json` | 15-minute schedule config |
| `metadata/scheduled-jobs/.memory-cleanup-job.json` | Daily 3 AM schedule config |
| `metadata/queries/.get-conversations-for-memory-manager.json` | Optimized SQL query |
| `packages/AI/Agents/docs/AGENT_MEMORY_SCOPING.md` | Multi-tenant scoping documentation |
| `packages/AI/Agents/src/__tests__/agent-memory-features.test.ts` | Unit tests |
| `migrations/v5/B202602151200__v5.0__Baseline.sql` | Database schema baseline |
