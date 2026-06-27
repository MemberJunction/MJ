# Memory Consolidation Activation — Specification & Implementation Plan

**Feature Branch**: `001-memory-consolidation`
**Created**: 2026-03-27
**Status**: Draft — Pending Review
**Development Branch**: `claude/study-agent-memory-architecture-ZfjHS`

---

## Part 1: Auto Dream Analysis & Strategic Rationale

### What Is Auto Dream?

Claude Code shipped a feature called "Auto Dream" — a background sub-agent that consolidates memory files between sessions. The system prompt literally says: *"You are performing a dream — a reflective pass over your memory files."* The name is deliberate, modeled after how human brains consolidate memories during REM sleep.

Auto Dream addresses a specific problem: after 20+ sessions, Claude Code's auto-memory notes become a mess. Contradictory entries pile up, relative dates like "yesterday" lose meaning, and stale debugging solutions reference files that no longer exist. The notebook that was supposed to help Claude remember instead becomes noise that confuses it.

**Sources**: [Claude Code Dreams](https://claudefa.st/blog/guide/mechanics/auto-dream), [MindStudio Analysis](https://www.mindstudio.ai/blog/what-is-claude-code-autodream-memory-consolidation-2), [SFEIR Institute](https://institute.sfeir.com/en/articles/claude-code-dream-auto-dream-memory-consolidation/), [Sleep-time Compute paper (arXiv:2504.13171)](https://arxiv.org/abs/2504.13171)

### Auto Dream's Four Memory Layers

| Layer | Purpose | MJ Equivalent |
|-------|---------|---------------|
| CLAUDE.md | Human-authored rules and instructions | Agent system prompts + metadata config |
| Auto Memory | Raw notes Claude writes per session | Memory Manager extraction from conversations |
| Session Memory | Conversation continuity within a session | ConversationDetail records |
| Auto Dream | Periodic consolidation of accumulated notes | **Disabled consolidation infrastructure** (this feature activates it) |

### Auto Dream's Four-Phase Cycle

1. **Orient**: Scan memory directory, read MEMORY.md index, build a map of what exists
2. **Gather Signal**: Search session transcripts (JSONL files) via grep-style pattern matching for user corrections, recurring themes, important decisions — not exhaustive reads
3. **Consolidate**: Merge overlapping entries, convert relative dates to absolute, delete contradicted facts, remove stale references to deleted files
4. **Prune**: Keep MEMORY.md under 200 lines (startup loading threshold), update index to reflect current topic files

**Trigger conditions**: Dual gate — 24 hours elapsed AND 5+ sessions since last dream. In one documented case, it consolidated 913 sessions of accumulated memory in under 9 minutes.

### Comparative Analysis: MJ Memory vs. Auto Dream

#### Where MJ Is Already Significantly Better

| Dimension | MJ Advantage | Auto Dream |
|-----------|-------------|------------|
| **Storage & Durability** | SQL database with typed entities, embeddings, and full ACID transactions. Notes survive server restarts, cluster failovers, and are queryable via standard SQL. | Flat markdown files in `~/.claude/projects/`. No transactions, no structured queries, no backup strategy. |
| **Multi-Tenancy** | 8-level scoping hierarchy (Agent+User+Company → Global) with per-dimension inheritance modes (cascading vs strict). Notes are properly isolated per tenant. | Single user, single project. No concept of multi-tenant scoping. |
| **Retrieval Sophistication** | Vector semantic search via embeddings + optional two-stage reranking + SQL fallback. Strategy selection per agent (Relevant/Recent/All). MaxNotesToInject budget control. | Entire MEMORY.md file loaded at session start if under 200 lines. No semantic search, no relevance ranking, no budget control. |
| **Extraction Quality** | LLM-powered extraction with confidence thresholds (min 80%), typed notes (Preference/Constraint/Context/Example/Issue), per-candidate deduplication via embedding similarity + LLM judgment. | Background observation during sessions. No confidence scoring, no typed categorization, no explicit dedup pipeline. |
| **Observability** | Full AgentRunStep records for each extraction phase. Prompt run logging. Source conversation linkage. | No observability. No way to audit what the dream cycle did or why. |
| **Conflict Resolution at Retrieval** | `<memory_policy>` preamble injected with scope precedence rules. LLM receives explicit instructions on how to handle contradictions in-context. | No conflict resolution guidance at retrieval time. |
| **Access Tracking** | AccessCount and LastAccessedAt on every note. Enables data-driven decisions about note value. | No access tracking. No way to know which memories are actually useful. |
| **Example Learning** | Separate MJAIAgentExampleEntity with input/output pairs, SuccessScore, and semantic search. Agents learn from good and bad interactions. | No example extraction or learning system. |

#### Where Auto Dream Is Better (The Gap This Feature Closes)

| Dimension | Auto Dream Advantage | MJ Current State |
|-----------|---------------------|------------------|
| **Active Consolidation** | Core feature. Merges overlapping entries, resolves contradictions, synthesizes clusters into authoritative notes. Runs automatically on a dual-gate trigger. | Infrastructure exists but is **disabled** (`frequency: 'disabled'`). Notes accumulate without synthesis. |
| **Contradiction Resolution** | Proactive: "If you switched from Express to Fastify, the old 'API uses Express' entry gets removed" during the dream cycle, before it ever reaches an active session. | Reactive only: contradictions caught at extraction time via `mergeWithExistingIds`. Notes that contradict across different extraction runs are never reconciled. |
| **Temporal Normalization** | Converts relative dates to absolute: "Yesterday we decided to use Redis" becomes "On 2026-03-15 we decided to use Redis." | No temporal normalization. Relative dates in notes become meaningless over time. |
| **Stale Reference Pruning** | Detects notes referencing deleted files and removes them immediately regardless of age. | Calendar-based archival only (90/180 day hard cutoffs). A note referencing a deleted agent sits for 90 days before cleanup. |
| **Unified Memory Lifecycle** | Single dream agent handles all maintenance: consolidation, contradiction resolution, pruning, index management. | Split across two agents (Memory Manager for extraction, Memory Cleanup for archival) with no coordination and potential race conditions. |

### Why Consolidation Is the Priority

Of the seven improvement opportunities identified in our analysis, consolidation is by far the highest-leverage change:

1. **It's the single biggest gap** between MJ and Auto Dream. MJ's extraction, retrieval, and scoping are already superior — but without consolidation, note quality degrades linearly with usage.
2. **The infrastructure already exists**. The `CONSOLIDATION_CONFIG`, `shouldRunConsolidation()`, `findConsolidationClusters()`, `processConsolidationCluster()`, the LLM prompt, and the wiring in `executeAgentInternal` are all built. This is activation + enhancement, not greenfield.
3. **It compounds**. Clean, consolidated notes improve every downstream operation: retrieval quality goes up, MaxNotesToInject budget is better utilized, agents receive less contradictory guidance.
4. **The other improvements are nice-to-haves by comparison**:
   - *Memory index/summary layer*: Useful but MJ's semantic search already handles note discovery better than a 200-line flat file.
   - *Session transcript mining*: MJ already does full LLM extraction from conversations — more sophisticated than grep-style pattern matching.
   - *Idle-time compute*: The daily frequency gate already approximates this without needing load-awareness.
   - *Topic-based organization*: MJ's AgentNoteType system already provides categorization.

### What This Feature Delivers

This feature bridges the consolidation gap while preserving MJ's existing advantages. After implementation:

- **Consolidation**: Activated with daily frequency, vector-based clustering, LLM synthesis, temporal normalization, and access-frequency weighting
- **Contradiction Detection**: New phase that proactively resolves conflicting notes (the most damaging form of memory decay)
- **Stale Reference Pruning**: Signal-based pruning that detects orphaned references immediately, not after 90 calendar days
- **Unified Lifecycle**: All memory maintenance in one agent, one sequential pipeline, no race conditions
- **Full Observability**: AgentRunStep records for every maintenance phase

The result is a memory system that has Auto Dream's lifecycle management running on top of MJ's already-superior storage, retrieval, multi-tenancy, and extraction infrastructure.

---

## Part 2: User Scenarios & Requirements

### User Story 1 — Note Consolidation Reduces Memory Noise (Priority: P1)

As a system running AI agents with memory injection, accumulated notes from many conversations should be periodically merged into concise, authoritative notes so that agents receive clean, non-redundant context and stay within their MaxNotesToInject budget.

**Why this priority**: This is the core feature. Without consolidation, note quality degrades over time as similar observations pile up. Agents waste context window budget on redundant notes and may receive contradictory guidance.

**Independent Test**: Run the Memory Manager with consolidation enabled on a database containing 10+ semantically similar notes for a single agent. Verify that similar notes are clustered, consolidated into fewer comprehensive notes, and source notes are revoked with proper linkage.

**Acceptance Scenarios**:

1. **Given** 5 active auto-generated notes about the same topic for an agent, **When** the Memory Manager runs with consolidation enabled, **Then** those notes are consolidated into 1-2 comprehensive notes, and the 5 source notes are revoked with `ConsolidatedIntoNoteID` pointing to the replacement.
2. **Given** consolidation frequency is set to 'daily', **When** the Memory Manager runs within 24 hours of its last consolidation, **Then** the consolidation phase is skipped.
3. **Given** fewer than 3 similar notes exist (below `minClusterSize`), **When** consolidation runs, **Then** no consolidation occurs and the notes are left as-is.
4. **Given** a cluster of notes spanning different scopes (user-level and company-level), **When** consolidated, **Then** the consolidated note uses the least restrictive scope that accurately represents the combined information.

---

### User Story 2 — Contradiction Detection Resolves Conflicting Notes (Priority: P2)

As a system with long-running agent memory, contradictory notes that accumulated over different extraction runs should be detected and resolved so that agents don't receive conflicting instructions.

**Why this priority**: Contradictions are the most damaging form of memory decay. An agent told both "user prefers formal tone" and "user prefers casual tone" will produce inconsistent results. Consolidation alone handles notes that are similar enough to cluster; contradiction detection specifically targets notes that are topically related but factually opposed.

**Independent Test**: Insert two notes for the same agent that contradict each other (e.g., "Customer uses metric units" and "Customer uses imperial units"). Run the Memory Manager. Verify the older/less-accessed note is revoked and the authoritative note survives.

**Acceptance Scenarios**:

1. **Given** two active notes that are semantically similar but contain contradictory facts, **When** the contradiction detection phase runs, **Then** the less authoritative note is revoked with an explanation in Comments.
2. **Given** two contradictory notes where one was created 14 days after the other, **When** contradiction detection runs, **Then** the newer note is kept as authoritative (recency wins).
3. **Given** two contradictory notes created on the same day where one has AccessCount=25 and the other has AccessCount=2, **When** contradiction detection runs, **Then** the higher-access note is kept (usage frequency wins).
4. **Given** two notes that are semantically similar but NOT contradictory (complementary facts), **When** contradiction detection runs, **Then** both notes are preserved.

---

### User Story 3 — Stale Reference Pruning Removes Orphaned Notes (Priority: P3)

As a system where agents, users, and conversations can be deleted or deactivated, notes referencing entities that no longer exist should be automatically archived so that agents don't receive outdated or nonsensical context.

**Why this priority**: Stale references cause confusion but are less damaging than contradictions or redundancy. A note referencing a deleted agent is useless but not actively harmful. This is a cleanup operation that complements consolidation.

**Independent Test**: Create a note referencing an agent, then deactivate that agent. Run the Memory Manager. Verify the orphaned note is archived.

**Acceptance Scenarios**:

1. **Given** an active note whose `AgentID` references an agent with Status='Disabled', **When** the stale reference pruning phase runs, **Then** the note is archived with a comment explaining the referenced agent no longer exists.
2. **Given** an active note whose `SourceConversationID` references a deleted conversation, **When** stale reference pruning runs, **Then** the note is archived.
3. **Given** an active note whose referenced agent is still active, **When** stale reference pruning runs, **Then** the note is preserved.
4. **Given** more than 200 orphaned notes exist, **When** stale reference pruning runs, **Then** at most 200 are processed per cycle to prevent long-running operations.

---

### User Story 4 — Expired Item Archival, Absorbed from Cleanup Agent (Priority: P3)

As a system with retention policies on auto-generated notes and examples, items past their expiration or retention period should be archived automatically within the Memory Manager's execution cycle, eliminating the need for a separate Cleanup Agent.

**Why this priority**: This is existing functionality being relocated. The Memory Cleanup Agent's calendar-based archival (90-day notes, 180-day low-scoring examples, explicit ExpiresAt) is absorbed into the Memory Manager as a final phase.

**Acceptance Scenarios**:

1. **Given** an auto-generated note with ExpiresAt in the past, **When** the Memory Manager runs, **Then** the note is archived.
2. **Given** an auto-generated note not accessed in 91 days (default 90-day retention), **When** the Memory Manager runs, **Then** the note is archived.
3. **Given** an auto-generated example with SuccessScore < 50 not accessed in 181 days, **When** the Memory Manager runs, **Then** the example is archived.
4. **Given** a manually created note (IsAutoGenerated=false) not accessed in 91 days, **When** the Memory Manager runs, **Then** the note is NOT archived (manual notes are preserved).

---

### User Story 5 — Observability for All Maintenance Phases (Priority: P4)

As a system administrator reviewing agent run history, all memory maintenance phases should produce AgentRunStep records so that the full lifecycle is visible and debuggable.

**Acceptance Scenarios**:

1. **Given** consolidation runs and processes 2 clusters, **When** viewing the agent run, **Then** there is a parent "Consolidate Related Notes" step and 2 child steps (one per cluster) with details.
2. **Given** contradiction detection runs and finds 1 contradiction, **When** viewing the agent run, **Then** there is a "Detect Note Contradictions" step with input (pairs analyzed) and output (contradictions resolved).
3. **Given** no maintenance work was needed, **When** viewing the agent run, **Then** the maintenance steps still appear with "skipped" or "no items" status.

---

### Edge Cases

- **Note in both consolidation and contradiction**: Consolidation runs first; contradiction detection operates on post-consolidation state. No double-processing.
- **Consolidation prompt says "shouldConsolidate: false"**: Cluster is skipped, notes remain as-is. Existing behavior.
- **Chained revocations**: A revoked source note's `ConsolidatedIntoNoteID` points to a note that is later itself consolidated. The chain is preserved for auditing. No cascading.
- **No similar notes found**: Note has no cluster, no contradiction candidates. Left untouched.
- **Missing consolidation prompt**: Consolidation is skipped with error log. Extraction still completes normally.
- **Note references multiple deleted entities**: Archived once with a comment listing all missing references.

### Functional Requirements

#### Phase Management
- **FR-001**: The Memory Manager MUST execute maintenance phases in this order after extraction: (1) Consolidation, (2) Contradiction Detection, (3) Stale Reference Pruning, (4) Expired Item Archival.
- **FR-002**: Each maintenance phase MUST have its own dedicated LLM prompt (where applicable) to avoid cross-phase confusion.
- **FR-003**: All maintenance phases MUST be gated behind a configurable frequency check (default: daily).
- **FR-004**: Failure in any single maintenance phase MUST NOT prevent subsequent phases from executing.

#### Consolidation (Phase 1)
- **FR-010**: Consolidation frequency MUST be changed from 'disabled' to 'daily'.
- **FR-011**: Cluster detection MUST use vector similarity at 0.60 threshold with minimum cluster size of 3.
- **FR-012**: Each cluster MUST be processed by a dedicated consolidation prompt.
- **FR-013**: Consolidated notes MUST inherit the combined AccessCount from all source notes.
- **FR-014**: Source notes MUST be revoked with `ConsolidatedIntoNoteID` set to the new note's ID.
- **FR-015**: The consolidation prompt MUST perform temporal normalization (relative → absolute dates).
- **FR-016**: The consolidation prompt MUST weight access frequency when resolving conflicts.

#### Contradiction Detection (Phase 2)
- **FR-020**: Contradiction scan MUST use a higher similarity threshold (0.70) than consolidation.
- **FR-021**: Each similar pair MUST be evaluated by a dedicated contradiction detection prompt.
- **FR-022**: Authoritative note selection: prefer newer by >7 days, then higher AccessCount.
- **FR-023**: Revoked contradicted notes MUST have `ConsolidatedIntoNoteID` and explanatory Comments.
- **FR-024**: Complementary (non-contradictory) pairs MUST be preserved.

#### Stale Reference Pruning (Phase 3)
- **FR-030**: MUST check active auto-generated notes for references to nonexistent/inactive entities.
- **FR-031**: Validated references: AgentID, UserID, CompanyID, SourceConversationID.
- **FR-032**: Orphaned notes MUST be archived with descriptive comments.
- **FR-033**: MUST process at most 200 notes per pruning cycle.
- **FR-034**: MUST cache entity lookups within a single cycle.

#### Expired Item Archival (Phase 4)
- **FR-040**: MUST archive auto-generated notes past their ExpiresAt timestamp.
- **FR-041**: MUST archive auto-generated notes not accessed within retention period (default 90 days).
- **FR-042**: MUST archive auto-generated examples with SuccessScore < 50 past retention period (default 180 days).
- **FR-043**: MUST NOT archive manually created items (IsAutoGenerated=false).
- **FR-044**: MUST read per-agent retention config (NoteRetentionDays, ExampleRetentionDays, AutoArchiveEnabled).

#### Database Schema
- **FR-050**: New nullable `ConsolidatedIntoNoteID` column on AIAgentNote as self-referential FK.
- **FR-051**: Column MUST be populated when a note is revoked due to consolidation or contradiction resolution.

#### Observability
- **FR-060**: Each maintenance phase MUST create AgentRunStep records with input/output data.
- **FR-061**: Each consolidation cluster MUST create a child run step.
- **FR-062**: Contradiction detection MUST log pairs analyzed and contradictions resolved.

#### Cleanup Agent Deprecation
- **FR-070**: Memory Cleanup Agent's archival logic MUST be fully replicated before deprecation.
- **FR-071**: Cleanup Agent class MUST remain in codebase but its scheduled job should be disabled.

### Key Entities

- **AI Agent Note**: Gains `ConsolidatedIntoNoteID` (self-referential FK). Status: Active/Pending/Revoked. Existing fields: EmbeddingVector, AccessCount, LastAccessedAt, ExpiresAt, IsAutoGenerated, multi-tenant scoping.
- **AI Agent Example**: Input/output pairs with SuccessScore. Subject to retention-based archival.
- **AI Agent Run Step**: Observability records for each Memory Manager phase.

### Success Criteria

- **SC-001**: After consolidation, active note count decreases by at least 20% on a corpus with known redundancies, while preserving all distinct factual content.
- **SC-002**: Contradictory note pairs are resolved within one daily cycle of their co-existence.
- **SC-003**: Notes referencing deleted entities are archived within one daily cycle.
- **SC-004**: All maintenance phases complete within 10 minutes for up to 1,000 active notes.
- **SC-005**: Every maintenance phase produces at least one AgentRunStep record.
- **SC-006**: Memory Cleanup Agent can be disabled with no loss of functionality.
- **SC-007**: Unit tests achieve 90%+ coverage of all new/enhanced logic.

---

## Part 3: Architecture & Implementation Plan

### Architecture Decision: Single Agent

All memory lifecycle operations run inside the Memory Manager Agent in a guaranteed sequential pipeline:

```
Extract → Dedup → Create Notes/Examples → Consolidate → Detect Contradictions → Prune Stale Refs → Archive Expired
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          New/enhanced phases (gated behind daily frequency check)
```

**Why single agent**:
- Eliminates race conditions between separate agents competing over the same notes
- Consolidation output feeds into contradiction detection input — guaranteed ordering
- No coordination logic needed between agents
- Single agent run provides unified observability
- Daily gate means maintenance adds zero overhead to ~95% of runs

**Phase isolation**: Each phase has its own dedicated LLM prompt with distinct instructions. The LLM is called separately per phase — no single prompt tries to do consolidation AND contradiction detection simultaneously.

### Dependency Graph

```
Task 1 (Migration) ──────────────────────────────┐
                                                   │
Task 2 (Activate config) ────────────────────┐    │
                                              │    │
Task 7 (Enhance consolidation prompt) ───┐   │    │
                                          │   │    │
                                          ▼   ▼    ▼
                                     Task 3 (Wire ConsolidatedIntoNoteID)
                                          │
                                          ▼
                                     Task 4 (Contradiction detection)
                                          │
Task 5 (Stale ref pruning) ─────────(independent, can parallel with 3-4)
                                          │
Task 6 (Absorb cleanup agent) ──────(depends on Task 5)
                                          │
                                          ▼
                                     Task 8 (Observability run steps)
                                          │
                                          ▼
                                     Task 9 (Unit tests)
                                          │
                                          ▼
                                     Task 10 (Deprecate cleanup agent)
```

### Implementation Waves

| Wave | Tasks | Parallelizable? |
|------|-------|-----------------|
| 1 | Tasks 1, 2, 5, 7 | Yes — no interdependencies |
| 2 | Task 3 | After Task 1 migration + CodeGen |
| 3 | Task 4 | After Task 3 |
| 4 | Task 6 | After Task 5 |
| 5 | Tasks 8, 9 | After all code tasks |
| 6 | Task 10 | After tests pass |

---

## Part 4: Task List

> **This is the living document. Update task status, add notes, and track blockers here as work progresses.**

### Task 1: Database Migration — Add `ConsolidatedIntoNoteID` FK

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 (blocks Tasks 3, 4) |
| Type | Migration + CodeGen |
| Effort | Small |
| Depends on | Nothing |

**What to do**:
- Create migration: `migrations/v5/V202603281000__v5.21.x_Add_ConsolidatedIntoNoteID_To_AIAgentNote.sql`
- `ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD ConsolidatedIntoNoteID UNIQUEIDENTIFIER NULL`
- Add self-referential FK: `FK_AIAgentNote_ConsolidatedIntoNote` referencing `AIAgentNote.ID`
- Add extended property describing the column's purpose
- Do NOT add an index (CodeGen handles FK indexes)
- Do NOT add __mj timestamp columns (CodeGen handles these)

**After migration**:
- Run the migration against the database
- Run CodeGen to regenerate `entity_subclasses.ts`, views, and stored procedures
- Verify `MJAIAgentNoteEntity` gains `ConsolidatedIntoNoteID` getter/setter

**Files**:
- Create: `migrations/v5/V202603281000__v5.21.x_Add_ConsolidatedIntoNoteID_To_AIAgentNote.sql`
- Auto-updated by CodeGen: `packages/MJCoreEntities/src/generated/entity_subclasses.ts`

**Acceptance**: `MJAIAgentNoteEntity` has `get ConsolidatedIntoNoteID(): string | null` and `set ConsolidatedIntoNoteID(value: string | null)` after CodeGen.

---

### Task 2: Activate Consolidation Config

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 |
| Type | Code change (1 line) |
| Effort | Tiny |
| Depends on | Nothing |

**What to do**:
- In `packages/AI/Agents/src/memory-manager-agent.ts`, line ~42
- Change `frequency: 'disabled'` to `frequency: 'daily'`
- Keep `minClusterSize: 3` unchanged
- Keep `similarityThreshold: 0.60` unchanged

**Rationale**: Memory Manager runs every 15 min. Daily = ~1 of 96 runs. `shouldRunConsolidation()` already supports 'daily'. minClusterSize=3 prevents merging coincidental pairs. 0.60 threshold is moderate enough to catch topically related notes with different phrasing.

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: `CONSOLIDATION_CONFIG.frequency === 'daily'`.

---

### Task 3: Wire `ConsolidatedIntoNoteID` into Revocation

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 |
| Type | Code change |
| Effort | Small |
| Depends on | Task 1 |

**What to do**:
- In `packages/AI/Agents/src/memory-manager-agent.ts`, method `processConsolidationCluster()` (line ~1381-1395)
- In the revocation loop, after `noteToRevoke.Status = 'Revoked'`, add: `noteToRevoke.ConsolidatedIntoNoteID = newNote.ID`
- Remove the TODO comment at lines 1379-1380
- Update `noteToRevoke.Comments` to include the consolidated note ID

**Before**:
```typescript
noteToRevoke.Status = 'Revoked';
noteToRevoke.Comments = 'Revoked during note consolidation';
```

**After**:
```typescript
noteToRevoke.Status = 'Revoked';
noteToRevoke.ConsolidatedIntoNoteID = newNote.ID;
noteToRevoke.Comments = `Consolidated into note ${newNote.ID}: ${parsedResult.reason}`;
```

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Revoked source notes have `ConsolidatedIntoNoteID` populated.

---

### Task 4: Add Contradiction Detection Phase

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code + Prompt + Metadata |
| Effort | Medium |
| Depends on | Tasks 1, 2 |

#### 4a. Create the contradiction detection prompt template
- Create: `metadata/prompts/templates/memory-manager/detect-contradictions.md`
- Prompt receives pairs of semantically similar notes and determines:
  - Are they contradictory? (same topic, opposing facts)
  - If yes, which is authoritative? (newer if >7 days apart, else higher AccessCount)
  - Returns JSON: `{ isContradiction: boolean, keepNoteId: string, revokeNoteId: string, reason: string }`
- Must explicitly distinguish contradiction from complementary
- Edge case: same date + same access count → keep both

#### 4b. Add prompt metadata entry
- Add to: `metadata/prompts/.memory-manager-prompts.json`
- Name: `"Memory Manager - Detect Contradictions"`
- Category: `"MJ: System"`
- Same model assignments as other MM prompts (Gemini 3 Flash pri 1, GPT-OSS-120B pri 2)
- ResponseFormat: JSON, AssistantPrefill: `` "```json" ``, StopSequences: `` "\n```" ``

#### 4c. Implement `detectAndResolveContradictions()` method
- Add to: `packages/AI/Agents/src/memory-manager-agent.ts`
- New config constant:
  ```
  CONTRADICTION_CONFIG = {
      similarityThreshold: 0.70,    // Higher than consolidation — same-topic pairs
      maxPairsPerRun: 50,           // Limit LLM calls per cycle
  }
  ```
- Algorithm:
  1. Load all active auto-generated notes
  2. For each note, find semantically similar notes at 0.70 threshold
  3. Build unique pairs (avoid A→B and B→A)
  4. Skip pairs where both notes were in a consolidation cluster this run
  5. For each pair, call the contradiction detection prompt
  6. If contradiction: revoke loser, set `ConsolidatedIntoNoteID` to winner, update Comments
  7. Track processed pairs to avoid re-checking

#### 4d. Wire into `executeAgentInternal`
- Add after existing consolidation block (line ~1706), before final step construction
- Gate behind `shouldRunConsolidation()` (same daily frequency)
- Add contradiction count to final step message and payload

**Files**:
- Create: `metadata/prompts/templates/memory-manager/detect-contradictions.md`
- Modify: `metadata/prompts/.memory-manager-prompts.json`
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**After metadata changes**: `npx mj sync push --dir=metadata --include="prompts"`

**Acceptance**: Contradictory pairs detected and resolved. Complementary pairs preserved.

---

### Task 5: Add Stale Reference Pruning Phase

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P3 |
| Type | Code change |
| Effort | Medium |
| Depends on | Nothing (independent) |

#### 5a. Implement `pruneStaleReferences()` method
- Add to: `packages/AI/Agents/src/memory-manager-agent.ts`
- New config constant:
  ```
  STALE_PRUNING_CONFIG = {
      maxNotesPerRun: 200,
  }
  ```
- Algorithm:
  1. Query active auto-generated notes with non-null FK references
  2. Build lookup caches:
     - Agent cache: `AIEngine.Instance.Agents` filtered to active (already in memory)
     - User cache: Single RunView for all referenced UserIDs
     - Company cache: Single RunView for all referenced CompanyIDs
     - Conversation cache: Single RunView for all referenced ConversationIDs
  3. Check each note's references against caches
  4. Archive orphaned notes with descriptive Comments
  5. Cap at `maxNotesPerRun`

#### 5b. Wire into `executeAgentInternal`
- Add after contradiction detection, before expired item archival
- Gate behind `shouldRunConsolidation()`
- Add pruned count to final step payload

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Note**: No LLM prompt needed — purely database validation logic. Zero risk of prompt confusion.

**Acceptance**: Orphaned notes archived. Active references preserved. Max 200 per cycle.

---

### Task 6: Absorb Cleanup Agent's Archival Logic

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P3 |
| Type | Code change |
| Effort | Medium |
| Depends on | Task 5 |

#### 6a. Port archival logic from `memory-cleanup-agent.ts`
- New method `archiveExpiredAndStaleItems()` replicating:
  - `archiveExpiredItems()`: Notes/examples past ExpiresAt
  - `archiveStaleItems()`: Notes not accessed within NoteRetentionDays (default 90), low-scoring examples past ExampleRetentionDays (default 180)
- Port helpers: `getCutoffDate()`, `getNoteRetentionDays()`, `getExampleRetentionDays()`, `getAutoArchiveEnabled()`
- Use `AIEngine.Instance.Agents` for per-agent config

#### 6b. Wire into `executeAgentInternal`
- Final maintenance phase, after stale reference pruning
- Gate behind `shouldRunConsolidation()`

**Important — Status value list**: Current `MJAIAgentNoteEntity.Status` allows Active/Pending/Revoked. The cleanup agent sets Status='Archived' but this may not be in the value list. Check whether to add 'Archived' via Task 1 migration or use 'Revoked' with descriptive Comments.

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`
- Possibly: Extend Task 1 migration to add 'Archived' to Status value list

**Acceptance**: All User Story 4 scenarios pass. Cleanup Agent functionality fully replicated.

---

### Task 7: Enhance Consolidation Prompt

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Prompt template + metadata push |
| Effort | Small |
| Depends on | Nothing (independent) |

#### 7a. Add temporal normalization section
After "Resolve Conflicts" in `consolidate-notes.md`:
```
### 3b. Temporal Normalization
- Convert relative time references to absolute dates using each note's createdAt timestamp
- "last week" in a note created March 20 → "week of March 13"
- "recently" → reference the note's creation date
- "yesterday" → calculate the actual date from createdAt
- The consolidated note should NEVER contain relative time references
```

#### 7b. Add access frequency weighting
Add to "Resolve Conflicts":
```
- Weight access count heavily: AccessCount > 10 = high confidence (frequently validated)
- AccessCount < 3 with age > 30 days = low-value (droppable if contradicted)
- Between conflicting notes of similar age, prefer higher AccessCount
```

#### 7c. Add aggressive contradiction resolution
Add to "Resolve Conflicts":
```
- If notes contradict and one was created >7 days later, the newer one supersedes
- Do NOT preserve both sides "for historical context"
- Consolidated note MUST contain ONLY current truth
- Superseded info lives on in revoked source notes for auditing
```

**Files**:
- Modify: `metadata/prompts/templates/memory-manager/consolidate-notes.md`

**After**: `npx mj sync push --dir=metadata --include="prompts"`

**Acceptance**: Prompt includes temporal normalization, access weighting, and aggressive contradiction resolution.

---

### Task 8: Add Observability Run Steps

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P4 |
| Type | Code change |
| Effort | Medium |
| Depends on | Tasks 3, 4, 5, 6 |

#### 8a. Consolidation run steps
- Parent: `CreateRunStep('Decision', 'Consolidate Related Notes', { frequency, activeNoteCount })`
- Per-cluster child: `CreateRunStep('Prompt', 'Process Consolidation Cluster', { clusterSize, noteIds })`

#### 8b. Contradiction detection run step
- `CreateRunStep('Decision', 'Detect Note Contradictions', { pairsToAnalyze })`
- Finalize: `{ contradictionsFound, contradictionsResolved, pairsAnalyzed }`

#### 8c. Stale reference pruning run step
- `CreateRunStep('Decision', 'Prune Stale References', { notesChecked })`
- Finalize: `{ notesArchived, orphanedAgents, orphanedUsers, orphanedConversations }`

#### 8d. Archival run step
- `CreateRunStep('Decision', 'Archive Expired Items', { agentsChecked })`
- Finalize: `{ notesExpired, notesStale, examplesExpired, examplesStale }`

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Each maintenance phase produces AgentRunStep records.

---

### Task 9: Unit Tests

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Test code |
| Effort | Medium |
| Depends on | Tasks 2, 3, 4, 5, 6 |

#### 9a. Consolidation tests
- Create: `packages/AI/Agents/src/__tests__/memory-consolidation.test.ts`
- `shouldRunConsolidation()`: true for 'daily' when >24h; false when <24h
- `findConsolidationClusters()`: groups similar notes; leaves dissimilar unclustered
- `processConsolidationCluster()`: sets `ConsolidatedIntoNoteID` on revoked notes
- Config defaults: minClusterSize=3, similarityThreshold=0.60, frequency='daily'

#### 9b. Contradiction detection tests
- Contradictory pair → older revoked, newer kept
- Same date → higher AccessCount wins
- Complementary pair → both preserved
- Self-pairing prevented
- Pair deduplication (A-B not checked as B-A)

#### 9c. Stale reference pruning tests
- Deleted agent → note archived
- Active agent → note preserved
- Deleted conversation → note archived
- Max 200 per cycle enforced
- Entity lookup caching (same entity not queried twice)

#### 9d. Archival tests
- Expired notes archived
- Stale notes (>90 days, auto-generated) archived
- Manual notes (IsAutoGenerated=false) NOT archived
- Per-agent retention config respected

**Files**:
- Create: `packages/AI/Agents/src/__tests__/memory-consolidation.test.ts`
- Possibly extend: `packages/AI/Agents/src/__tests__/agent-memory-features.test.ts`

**Acceptance**: All tests pass. Coverage >= 90% for new logic.

---

### Task 10: Deprecate Memory Cleanup Agent

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P4 (do last) |
| Type | Configuration + annotation |
| Effort | Small |
| Depends on | Tasks 6, 9 |

**What to do**:
- Disable Cleanup Agent's scheduled job (metadata config change)
- Add deprecation JSDoc to `memory-cleanup-agent.ts`: *"Deprecated: Archival logic absorbed into Memory Manager Agent. Class retained for reference. Scheduled job should not be active."*
- Do NOT delete the file — keep for reference and rollback
- Update any documentation referencing the Cleanup Agent

**Files**:
- Modify: `packages/AI/Agents/src/memory-cleanup-agent.ts` (deprecation notice)
- Modify: Scheduled job metadata (disable)

**Acceptance**: Cleanup Agent job disabled. Memory Manager handles all archival. No loss of functionality.

---

## Open Questions

1. **Status value list**: Current AIAgentNote Status allows Active/Pending/Revoked. The cleanup agent uses 'Archived'. Do we add 'Archived' via Task 1 migration, or use 'Revoked' with descriptive Comments for all archival/consolidation?

2. **Contradiction prompt model selection**: Currently using Gemini 3 Flash / GPT-OSS-120B. Should contradiction detection use a more capable model for nuanced factual comparison?

3. **Rollback strategy**: If consolidation produces bad results, should we build a "decompose" utility that restores source notes via the `ConsolidatedIntoNoteID` chain? Or is manual admin UI intervention sufficient for v1?

## Assumptions

- Existing consolidation code is functionally correct — needs activation + enhancement, not rewriting
- Existing consolidation prompt is a solid foundation needing enhancement, not replacement
- Vector similarity search performs adequately at both 0.60 (consolidation) and 0.70 (contradiction) thresholds
- Memory Cleanup Agent scheduling can be disabled without a migration
- 200 notes per stale-pruning cycle is sufficient for steady-state operation
- Each maintenance phase's LLM prompt runs independently, preventing cross-phase confusion
