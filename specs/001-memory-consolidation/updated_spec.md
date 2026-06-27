# Memory Consolidation Activation — Research-Informed Specification

**Feature Branch**: `001-memory-consolidation`
**Created**: 2026-03-27
**Revised**: 2026-04-01
**Status**: Draft — Research-Informed Revision
**Development Branch**: `claude/study-agent-memory-architecture-ZfjHS`
**Research Input**: [`research.md`](research.md) — 10 cognitive science findings from psychology, neuroscience, and computer science (2023-2026)
**Current State Reference**: [`current-state.md`](current-state.md) — comprehensive documentation of existing implementation

---

## Part 1: Strategic Rationale

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
| **Multi-Tenancy** | 8-level scoping hierarchy (Agent+User+Company -> Global) with per-dimension inheritance modes (cascading vs strict). Notes are properly isolated per tenant. | Single user, single project. No concept of multi-tenant scoping. |
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

Of the improvement opportunities identified in our analysis, consolidation is by far the highest-leverage change:

1. **It's the single biggest gap** between MJ and Auto Dream. MJ's extraction, retrieval, and scoping are already superior — but without consolidation, note quality degrades linearly with usage.
2. **The infrastructure already exists**. The `CONSOLIDATION_CONFIG`, `shouldRunConsolidation()`, `findConsolidationClusters()`, `processConsolidationCluster()`, the LLM prompt, and the wiring in `executeAgentInternal` are all built. This is activation + enhancement, not greenfield.
3. **It compounds**. Clean, consolidated notes improve every downstream operation: retrieval quality goes up, MaxNotesToInject budget is better utilized, agents receive less contradictory guidance.

### Research-Informed Design Principles

Cognitive science research (documented in [`research.md`](research.md)) identified 10 high-impact findings that inform this feature's design. We organize them into five design principles — the first four are implemented in this feature (Phase 1), and the fifth is designed here but implemented in Phase 2.

#### Principle 1: Drift Prevention — Consolidation Must Not Corrupt

**Research finding**: Repeated LLM-based consolidation causes progressive semantic drift. Claude 3.5 Sonnet's cosine similarity to original content dropped from 0.9406 to 0.7008 after just five iterations — a **25.5% decline**. A 2% misalignment introduced early compounds into 40% failure by the end of a processing chain (Zylos, 2026). Up to 75% of LLM multi-document summary content can be hallucinated (Belem et al., 2024).

**Design response**:
- **Consolidation generation counter**: Every consolidated note tracks how many times it has been re-summarized. Capped at 3 generations — beyond that, consolidation goes back to original sources via `DerivedFromNoteIDs`.
- **Anchored iterative summarization**: When source notes include already-consolidated notes, the prompt EXTENDS the existing consolidated text rather than regenerating from scratch. Factory.ai research scores this approach 4.04 vs 3.74 for full reconstruction.
- **Source content hashing**: SHA-256 hash of each note's original content stored at creation time. Enables programmatic drift detection by comparing consolidated output against source hashes.
- **Post-consolidation verification**: After consolidation, a lightweight fact-check extracts named entities, numbers, and dates from source notes and verifies they survive in the consolidated output.
- **Dual gist-plus-verbatim**: Revoked source notes preserve their original text with bidirectional references (`ConsolidatedIntoNoteID` on source, `DerivedFromNoteIDs` on consolidated). This mirrors Fuzzy-Trace Theory's dual trace encoding. SmartSearch (2026) validated raw passage retrieval outperforms memory consolidation by 20+ points on open-ended questions — the verbatim trail ensures originals remain accessible.

#### Principle 2: Structural Contradiction Detection — Beyond Vector Similarity

**Research finding**: Cosine similarity alone cannot reliably distinguish contradiction from topical similarity. Zep/Graphiti achieves **94.8% accuracy** using a bi-temporal knowledge graph with entity-relation consistency checking. If Memory A says "user prefers React" and Memory B says "user prefers Vue," vector similarity scores them ~0.65-0.75 without detecting the contradiction.

**Design response**:
- **Entity-attribute extraction in contradiction prompt**: The contradiction detection LLM prompt explicitly extracts entity-attribute-value triples from each note before judging contradiction. This is lightweight graph reasoning without requiring a full graph database.
- **Three-stage pipeline**: (1) embedding pre-filter at 0.70 threshold to find candidate pairs, (2) entity-attribute extraction to identify competing relations, (3) LLM judgment as final arbiter for ambiguous cases.
- **Importance-weighted update resistance**: Notes with high AccessCount (>10) and high confidence are harder to auto-revoke. When both notes in a contradictory pair are high-confidence, the system preserves both with a contradiction flag rather than auto-resolving — mirroring the reconsolidation boundary condition research showing stronger memories resist modification.

#### Principle 3: Adaptive Memory Lifecycle — Replace Fixed Thresholds

**Research finding**: Fixed 90/180-day retention windows are suboptimal. Ebbinghaus-inspired decay functions, validated by MemoryBank and YourMemory MCP implementations, eliminate manual deletion while outperforming fixed thresholds. Park et al.'s Generative Agents (2023) showed recency, importance, and relevance contribute roughly equally to memory value. The Synaptic Homeostasis Hypothesis suggests decay should be proportional (multiply all strengths by a factor < 1), not threshold-based deletion.

**Design response**:
- **Ebbinghaus decay function**: Replaces fixed 90/180-day cutoffs with `strength = base_importance * e^(-lambda_eff * days_since_last_access) * (1 + access_count * 0.2)`, where `lambda_eff = 0.16 * (1 - normalized_importance * 0.8)`. Notes decay faster when unimportant and unaccessed. High-importance notes decay very slowly.
- **Composite importance scoring**: Replaces raw `AccessCount` as the sole authority signal with a 7-signal composite:
  ```
  score = w1*recency_decay + w2*llm_importance + w3*relevance + w4*uniqueness + w5*correction_boost + w6*goal_alignment + w7*user_mark
  ```
  Default weights: recency=0.20, importance=0.25, relevance=0.15, uniqueness=0.15, correction_boost=0.10, goal_alignment=0.10, user_mark=0.05.
- **Hybrid scheduling**: Beyond the daily time-based gate, consolidation triggers on event-driven conditions: when active note count for a single agent exceeds a threshold (default: 100), when accumulated importance of new notes exceeds a limit, or when contradiction density within a cluster exceeds a bound. Tiered periodic passes: daily light (dedup + basic clustering), weekly deep (cross-referencing, temporal normalization), monthly archival (stale pruning). This mirrors Active Systems Consolidation theory, where consolidation intensity correlates with learning volume.

#### Principle 4: Memory Protection & Provenance — Prevent Silent Loss

**Research finding**: Flashbulb memory research (Brown & Kulik, 1977; McGaugh, 2004) shows the brain creates a "biological highlighter" for emotionally significant experiences. HDBSCAN naturally identifies outlier memories that don't belong to any cluster — these should be auto-protected. Information-theoretically surprising memories (far from cluster centroids) carry more information and should resist consolidation. The W3C PROV-DM standard provides a mature model for provenance tracking with 97.5% storage reduction via lineage deduplication.

**Design response**:
- **Four-tier protection system**:
  - **Immutable**: User-pinned memories, system-critical information, safety constraints. Never consolidated, never archived, never deleted.
  - **Protected**: High-importance memories (ImportanceScore >= 8.0), manually created notes (IsAutoGenerated=false), factual anchors. Exempt from consolidation but subject to archival after extended inactivity (365+ days). Included in contradiction detection.
  - **Standard**: Normal retention and consolidation policies. Default for auto-generated notes.
  - **Ephemeral**: Low-importance temporary context. Aggressive consolidation (minClusterSize=2), short retention.
- **Provenance chain**: Every consolidated note stores `DerivedFromNoteIDs` (JSON array of all source note IDs). Combined with `ConsolidatedIntoNoteID` on revoked sources, this creates full bidirectional provenance enabling programmatic rollback. Drift detection uses the existing `EmbeddingVector` — cosine similarity between consolidated and source note embeddings provides a continuous measure of semantic drift without requiring additional columns.
- **Outlier protection**: Notes with uniqueness score (minimum cosine distance to nearest neighbor) above the 95th percentile skip consolidation entirely — they represent rare, high-information-value observations.
- **Cluster size cap**: Optimal consolidation cluster size is 3-7 items (Miller's 7+/-2). Clusters larger than 7 are split by raising the local similarity threshold. Quality degrades measurably above 10 items per cluster.

#### Principle 5: Architectural Vision (Phase 2)

These findings require architectural changes beyond the scope of consolidation activation but are designed here to ensure Phase 1 decisions don't preclude them:

- **Dual-Store Architecture** (CLS Theory): Fast "hot" store for raw notes from recent conversations, slow "cold" store for consolidated knowledge structures. Schema-congruent information fast-tracked into cold storage. Phase 1 enables this by preserving verbatim source notes alongside consolidated gist.
- **Reconsolidation Engine**: Retrieval becomes read-write. When a retrieved note shows prediction error against current context, it enters a labile state for updating. Graduated response: small discrepancy reinforces, moderate discrepancy updates, large discrepancy creates new entry. Phase 1 enables this via `ImportanceScore` and `ConsolidationCount` tracking.
- **Metamemory Monitor**: Separate monitoring layer that audits memory quality — detecting outdated memories, coverage gaps, low-confidence clusters. Nelson & Narens meta-level/object-level separation. Phase 1's observability (AgentRunStep records) provides the data foundation.
- **Knowledge Graph Layer**: Full bi-temporal knowledge graph for structural contradiction detection. Graphiti model with entity-relation edges tracking four timestamps per edge. Phase 1's entity-attribute extraction in the contradiction prompt validates the approach at small scale.
- **Pattern Separation**: Mechanisms to maintain distinctness between superficially similar but meaningfully different memories, complementing pattern completion (vector search). Phase 1's protection tiers and outlier protection are initial steps.

### What This Feature Delivers

This feature bridges the consolidation gap while preserving MJ's existing advantages and incorporating cognitive science safeguards. After implementation:

- **Consolidation**: Activated with hybrid scheduling (daily + event-driven), vector-based clustering with cluster size caps, LLM synthesis with drift-prevention safeguards, temporal normalization, and composite importance weighting
- **Drift Prevention**: Generation counter capped at 3, anchored iterative summarization, source content hashing, post-consolidation fact verification
- **Contradiction Detection**: New phase with entity-attribute extraction pipeline, importance-weighted update resistance, and structural conflict detection beyond vector similarity
- **Composite Importance**: 7-signal scoring formula replacing raw AccessCount for all retention, authority, and consolidation decisions
- **Ebbinghaus Decay**: Continuous decay function replacing fixed 90/180-day retention windows, with importance-dampened decay rates
- **Protection Tiers**: Four-level system preventing consolidation of immutable/protected notes and preserving rare, high-value observations
- **Stale Reference Pruning**: Signal-based pruning detecting orphaned references immediately
- **Unified Lifecycle**: All memory maintenance in one agent, one sequential pipeline, no race conditions
- **Full Observability**: AgentRunStep records for every maintenance phase
- **Phase 2 Foundation**: Schema and provenance infrastructure enabling future dual-store, reconsolidation, metamemory, and knowledge graph enhancements

---

## Part 2: User Scenarios & Requirements

### User Story 1 — Note Consolidation Reduces Memory Noise (Priority: P1)

As a system running AI agents with memory injection, accumulated notes from many conversations should be periodically merged into concise, authoritative notes so that agents receive clean, non-redundant context and stay within their MaxNotesToInject budget.

**Why this priority**: This is the core feature. Without consolidation, note quality degrades over time as similar observations pile up. Agents waste context window budget on redundant notes and may receive contradictory guidance.

**Independent Test**: Run the Memory Manager with consolidation enabled on a database containing 10+ semantically similar notes for a single agent. Verify that similar notes are clustered, consolidated into fewer comprehensive notes, and source notes are revoked with proper linkage.

**Acceptance Scenarios**:

1. **Given** 5 active auto-generated notes about the same topic for an agent, **When** the Memory Manager runs with consolidation enabled, **Then** those notes are consolidated into 1-2 comprehensive notes, and the 5 source notes are revoked with `ConsolidatedIntoNoteID` pointing to the replacement, and the consolidated note has `DerivedFromNoteIDs` listing all 5 source IDs.
2. **Given** consolidation frequency is set to 'daily', **When** the Memory Manager runs within 24 hours of its last consolidation AND no event-driven trigger (note count threshold) has fired, **Then** the consolidation phase is skipped.
3. **Given** fewer than 3 similar notes exist (below `minClusterSize`), **When** consolidation runs, **Then** no consolidation occurs and the notes are left as-is.
4. **Given** a cluster of notes spanning different scopes (user-level and company-level), **When** consolidated, **Then** the consolidated note uses the least restrictive scope that accurately represents the combined information.
5. **Given** a note that has already been consolidated twice (`ConsolidationCount >= 2`), **When** a new consolidation cluster includes it, **Then** the consolidation prompt receives all original source notes (resolved via the `DerivedFromNoteIDs` chain) rather than re-summarizing the already-consolidated text.
6. **Given** a consolidation cluster with 12 notes, **When** consolidation runs, **Then** the cluster is split into sub-clusters of at most `maxClusterSize` (7) notes each before processing.
7. **Given** consolidation produces a new note, **When** post-consolidation verification runs, **Then** all named entities and numeric values from source notes appear in the consolidated note, or the verification step logs a warning and adds a `[Verification: entities potentially missing]` comment to the consolidated note.
8. **Given** an agent has accumulated 120 new active notes since the last consolidation (exceeding `noteCountTrigger` of 100), **When** the Memory Manager runs even if fewer than 24 hours have elapsed, **Then** consolidation triggers via the event-driven gate.

---

### User Story 2 — Contradiction Detection Resolves Conflicting Notes (Priority: P2)

As a system with long-running agent memory, contradictory notes that accumulated over different extraction runs should be detected and resolved so that agents don't receive conflicting instructions.

**Why this priority**: Contradictions are the most damaging form of memory decay. An agent told both "user prefers formal tone" and "user prefers casual tone" will produce inconsistent results. Consolidation alone handles notes that are similar enough to cluster; contradiction detection specifically targets notes that are topically related but factually opposed.

**Independent Test**: Insert two notes for the same agent that contradict each other (e.g., "Customer uses metric units" and "Customer uses imperial units"). Run the Memory Manager. Verify the older/less-accessed note is revoked and the authoritative note survives.

**Acceptance Scenarios**:

1. **Given** two active notes that are semantically similar but contain contradictory facts, **When** the contradiction detection phase runs, **Then** the less authoritative note is revoked with an explanation in Comments, and `ConsolidatedIntoNoteID` points to the winner.
2. **Given** two contradictory notes where one was created 14 days after the other, **When** contradiction detection runs, **Then** the newer note is kept as authoritative (recency wins).
3. **Given** two contradictory notes created on the same day where one has AccessCount=25 and the other has AccessCount=2, **When** contradiction detection runs, **Then** the higher-access note is kept (usage frequency wins, weighted by composite importance score).
4. **Given** two notes that are semantically similar but NOT contradictory (complementary facts), **When** contradiction detection runs, **Then** both notes are preserved.
5. **Given** two contradictory notes where both have AccessCount > `highAccessCountThreshold` (10), **When** contradiction detection runs, **Then** both notes are preserved with a contradiction flag comment rather than auto-revoking one (importance-weighted update resistance).
6. **Given** the contradiction detection prompt, **When** evaluating a pair of notes, **Then** it extracts entity-attribute-value triples from each note (e.g., "user | preferred_framework | React" vs "user | preferred_framework | Vue") before making its judgment, rather than relying solely on semantic similarity.
7. **Given** a Protected-tier note in a contradictory pair with a Standard-tier note, **When** contradiction detection runs, **Then** the Protected note is never auto-revoked; instead both are preserved with contradiction flags.

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
5. **Given** a note with `ProtectionTier='Immutable'` whose agent has been deactivated, **When** stale reference pruning runs, **Then** the note is NOT archived (immutable tier overrides pruning).

---

### User Story 4 — Ebbinghaus Decay Replaces Fixed Retention Windows (Priority: P2)

As a system with retention policies on auto-generated notes and examples, items should decay based on a continuous importance-weighted function rather than hard cutoffs, so that valuable-but-infrequently-accessed memories persist while low-value noise fades naturally.

**Why this priority**: Research shows fixed 90/180-day windows are suboptimal — they treat a critical-but-dormant architectural decision the same as a trivial debug note. Ebbinghaus-inspired decay eliminates manual deletion while outperforming fixed thresholds (validated by MemoryBank and YourMemory implementations). This replaces the Cleanup Agent's archival logic.

**Acceptance Scenarios**:

1. **Given** an auto-generated note with ExpiresAt in the past, **When** the Memory Manager runs, **Then** the note is archived regardless of decay score.
2. **Given** an auto-generated note with ImportanceScore=2.0 not accessed in 30 days, **When** the decay function runs, **Then** the note's decay score is below the archival threshold and it is archived (low importance decays fast).
3. **Given** an auto-generated note with ImportanceScore=9.0 not accessed in 120 days, **When** the decay function runs, **Then** the note's decay score remains above the archival threshold and it is preserved (high importance decays slowly).
4. **Given** an auto-generated example with SuccessScore < 50 and ImportanceScore below threshold, **When** the decay function runs, **Then** the example is archived.
5. **Given** a manually created note (IsAutoGenerated=false), **When** the decay function runs, **Then** the note is NOT archived (manual notes default to ProtectionTier='Protected' and are exempt from decay-based archival).
6. **Given** per-agent retention config with `AutoArchiveEnabled=false`, **When** the decay function runs for that agent's notes, **Then** no archival occurs.
7. **Given** a note with `ProtectionTier='Immutable'`, **When** the decay function runs, **Then** the note is never archived regardless of decay score.
8. **Given** a note with `ProtectionTier='Protected'`, **When** the decay function runs, **Then** the note is only archived after 365+ days of inactivity (extended protection).

---

### User Story 5 — Observability for All Maintenance Phases (Priority: P4)

As a system administrator reviewing agent run history, all memory maintenance phases should produce AgentRunStep records so that the full lifecycle is visible and debuggable.

**Acceptance Scenarios**:

1. **Given** consolidation runs and processes 2 clusters, **When** viewing the agent run, **Then** there is a parent "Consolidate Related Notes" step and 2 child steps (one per cluster) with details including ConsolidationCount and cluster size.
2. **Given** contradiction detection runs and finds 1 contradiction, **When** viewing the agent run, **Then** there is a "Detect Note Contradictions" step with input (pairs analyzed, entity-attribute triples extracted) and output (contradictions resolved, high-confidence pairs flagged).
3. **Given** no maintenance work was needed, **When** viewing the agent run, **Then** the maintenance steps still appear with "skipped" or "no items" status.
4. **Given** post-consolidation verification finds missing entities, **When** viewing the agent run, **Then** the verification step includes the list of missing entities and the notes affected.
5. **Given** importance scoring runs, **When** viewing the agent run, **Then** a scoring step shows notes scored, score distribution, and any tier changes triggered by the new scores.

---

### User Story 6 — Protection Tiers Prevent Inappropriate Consolidation (Priority: P2)

As a system managing diverse memory types (user-pinned facts, safety constraints, temporary debug context), different notes should have different protection levels against consolidation and archival so that critical information is never inadvertently lost.

**Why this priority**: Research on flashbulb memory shows the brain protects emotionally significant experiences. Without protection tiers, consolidation could merge a safety constraint into a general preference note, diluting its specificity. HDBSCAN-identified outliers (rare, high-information memories) need explicit protection.

**Acceptance Scenarios**:

1. **Given** a note with `ProtectionTier='Immutable'`, **When** consolidation runs, **Then** the note is excluded from clustering entirely and never appears in any consolidation cluster.
2. **Given** a note with `ProtectionTier='Protected'`, **When** consolidation runs, **Then** the note is excluded from consolidation clustering but IS included in contradiction detection (with auto-revoke protection).
3. **Given** a note with `ProtectionTier='Ephemeral'`, **When** consolidation runs, **Then** it is eligible for consolidation with a relaxed `minClusterSize` of 2 (more aggressive merging).
4. **Given** a manually created note (IsAutoGenerated=false), **When** created, **Then** it defaults to `ProtectionTier='Protected'`.
5. **Given** a note whose uniqueness score (minimum cosine distance to nearest neighbor) is above the 95th percentile of all active notes, **When** importance scoring runs, **Then** the note is auto-promoted to `ProtectionTier='Protected'` with a comment explaining the reason.

---

### User Story 7 — Composite Importance Scoring Replaces Raw AccessCount (Priority: P2)

As a system making retention, authority, and consolidation decisions about agent memories, a multi-signal importance score should replace raw AccessCount as the sole authority metric so that decisions account for recency, relevance, uniqueness, and user-validated value.

**Why this priority**: Park et al.'s Generative Agents (2023) showed recency, LLM-judged importance, and relevance contribute roughly equally to memory value. AccessCount alone misses crucial dimensions: a rarely-accessed safety constraint may be far more important than a frequently-retrieved greeting preference. The Synaptic Tagging and Capture hypothesis shows that a strongly tagged event should boost nearby weak events — importance is relational, not absolute.

**Acceptance Scenarios**:

1. **Given** a newly extracted note, **When** created, **Then** its `ImportanceScore` is computed using the 7-signal composite formula and stored on the record.
2. **Given** a note with high uniqueness (far from cluster centroids) and correction type (`mergeWithExistingIds` set), **When** importance is scored, **Then** it receives a uniqueness boost and correction boost that elevate its score above a generic context note.
3. **Given** importance scoring runs on all active notes, **When** complete, **Then** notes with `ImportanceScore >= 8.0` that have `ProtectionTier='Standard'` are auto-promoted to `ProtectionTier='Protected'`.
4. **Given** two contradictory notes being evaluated, **When** the system determines authority, **Then** it uses `ImportanceScore` (not raw AccessCount) as the primary signal, with recency as tiebreaker.
5. **Given** a note's `ImportanceScore` drops below 2.0 due to decay and inactivity, **When** the decay function runs, **Then** the note becomes a candidate for archival.

---

### User Story 8 — Dual-Store Architecture Separates Raw and Consolidated Memory (Priority: P3 — Phase 2)

As a system that processes both recent observations and long-term knowledge, raw notes from recent conversations should be kept in a "hot" store while consolidated knowledge structures live in a "cold" store, so that retrieval can draw from both episodic detail and generalized knowledge.

**Why this priority**: CLS theory (McClelland et al., 1995; Kumaran et al., 2016) demonstrates intelligent agents need fast-learning and slow-learning systems. HippoRAG (NeurIPS 2024) showed 20% improvement on multi-hop QA using this pattern. Schema theory (Tse et al., 2007) shows schema-congruent information consolidates orders of magnitude faster — a congruency gate can optimize consolidation scheduling.

**Phase 2 — Not implemented in this feature. Phase 1 enables this by**:
- Preserving verbatim source notes (revoked, not deleted)
- Tracking `ConsolidationCount` (hot = generation 0, cold = generation 1+)
- `DerivedFromNoteIDs` providing bidirectional links between stores

**Acceptance Scenarios** (Phase 2):

1. **Given** a recently extracted note (< 24 hours old), **When** retrieval runs, **Then** the note is served from the hot store with full episodic context.
2. **Given** a schema-congruent note (consistent with existing knowledge cluster), **When** consolidation scheduling runs, **Then** it is fast-tracked to cold storage (48-hour accelerated consolidation).
3. **Given** a novel or contradictory note (inconsistent with existing clusters), **When** consolidation scheduling runs, **Then** it remains in the hot store for a longer observation period before integration.

---

### User Story 9 — Reconsolidation Updates Memories on Access (Priority: P3 — Phase 2)

As a system where retrieved memories may become stale relative to current context, accessing a memory should allow it to be updated in place when the current interaction reveals new information, rather than treating retrieval as read-only.

**Why this priority**: Nader et al. (2000) showed retrieved memories enter a labile state for 4-6 hours requiring re-stabilization. Reconsolidation is triggered by prediction error — mismatch between expected and experienced. This is the most biologically faithful mechanism for keeping memories current. EWC reduces catastrophic forgetting by 45.7% through importance-weighted update resistance.

**Phase 2 — Not implemented in this feature. Phase 1 enables this by**:
- `ImportanceScore` providing importance-weighted update resistance
- `ConsolidationCount` tracking modification depth
- `EmbeddingVector` cosine similarity detecting drift from original content

**Acceptance Scenarios** (Phase 2):

1. **Given** a retrieved note with small discrepancy vs current context (same topic, consistent info), **When** reconsolidation runs, **Then** the note is reinforced: AccessCount incremented, LastAccessedAt refreshed, ImportanceScore boosted.
2. **Given** a retrieved note with moderate discrepancy (meaningful new details), **When** reconsolidation runs, **Then** the note content is updated in-place with new information merged, ConsolidationCount incremented, and embedding similarity tracked for drift detection.
3. **Given** a retrieved note with large discrepancy (outright contradiction), **When** reconsolidation runs, **Then** a new memory entry is created and the original is flagged for contradiction resolution.
4. **Given** a high-importance note (ImportanceScore > 8.0), **When** reconsolidation encounters moderate discrepancy, **Then** stronger evidence is required for updating than for a low-importance note (importance-weighted resistance).

---

### Edge Cases

- **Note in both consolidation and contradiction**: Consolidation runs first; contradiction detection operates on post-consolidation state. No double-processing.
- **Consolidation prompt says "shouldConsolidate: false"**: Cluster is skipped, notes remain as-is. Existing behavior.
- **Chained revocations**: A revoked source note's `ConsolidatedIntoNoteID` points to a note that is later itself consolidated. The chain is preserved via `DerivedFromNoteIDs` for auditing. No cascading.
- **No similar notes found**: Note has no cluster, no contradiction candidates. Left untouched.
- **Missing consolidation prompt**: Consolidation is skipped with error log. Extraction still completes normally.
- **Note references multiple deleted entities**: Archived once with a comment listing all missing references.
- **Cluster exceeds maxClusterSize**: Split into sub-clusters by raising local similarity threshold. Each sub-cluster processed independently.
- **Note at generation cap**: When `ConsolidationCount >= maxConsolidationCount`, consolidation resolves the `DerivedFromNoteIDs` chain to load original (generation-0) source notes and passes those to the prompt instead of the already-consolidated text.
- **Protected note in contradiction pair**: Flag both with contradiction comments but do NOT auto-revoke the Protected note.
- **Content hash mismatch after consolidation**: Log warning, add `[Verification: potential drift detected]` comment to consolidated note, but proceed (non-blocking for Phase 1).
- **Decay function produces same score for many notes**: Archive in FIFO order (oldest first) when multiple notes cross the archival threshold simultaneously.
- **Importance scoring on note with no context**: Notes lacking source conversation or agent run context receive a default mid-range importance (5.0) until enriched by access patterns.

### Functional Requirements

#### Phase Management
- **FR-001**: The Memory Manager MUST execute maintenance phases in this order after extraction: (1) Importance Scoring, (2) Consolidation, (3) Post-Consolidation Verification, (4) Contradiction Detection, (5) Stale Reference Pruning, (6) Decay-Based Archival.
- **FR-002**: Each maintenance phase MUST have its own dedicated LLM prompt (where applicable) to avoid cross-phase confusion.
- **FR-003**: Maintenance phases MUST be gated behind a hybrid frequency check: time-based daily gate OR event-driven trigger (note count threshold, accumulated importance).
- **FR-004**: Failure in any single maintenance phase MUST NOT prevent subsequent phases from executing.

#### Consolidation (Phase 1 of Pipeline)
- **FR-010**: Consolidation frequency MUST be changed from 'disabled' to 'daily', with an additional event-driven trigger.
- **FR-011**: Cluster detection MUST use vector similarity at 0.60 threshold with minimum cluster size of 3 and maximum cluster size of 7.
- **FR-012**: Each cluster MUST be processed by a dedicated consolidation prompt.
- **FR-013**: Consolidated notes MUST inherit the combined AccessCount from all source notes AND have their ImportanceScore computed via the composite formula.
- **FR-014**: Source notes MUST be revoked with `ConsolidatedIntoNoteID` set to the new note's ID.
- **FR-015**: The consolidation prompt MUST perform temporal normalization (relative to absolute dates).
- **FR-016**: The consolidation prompt MUST weight composite ImportanceScore when resolving conflicts.
- **FR-017**: Clusters exceeding `maxClusterSize` MUST be split by raising the local similarity threshold until sub-clusters are within bounds.
- **FR-018**: Consolidation MUST use anchored iterative summarization when source notes include already-consolidated notes (ConsolidationCount > 0) — extend existing text rather than regenerate.

#### Drift Prevention
- **FR-080**: Consolidated notes MUST have `ConsolidationCount` set to `max(source.ConsolidationCount) + 1`.
- **FR-081**: Notes with `ConsolidationCount >= maxConsolidationCount` (default 3) MUST NOT be re-summarized; consolidation MUST resolve `DerivedFromNoteIDs` chains to load original (generation-0) source notes.
- **FR-082**: After consolidation, a verification step MUST check that all named entities and numeric values from source notes appear in the consolidated output.
- **FR-083**: Drift detection MUST use cosine similarity between the consolidated note's `EmbeddingVector` and the source notes' `EmbeddingVector`s. A separate content hash column is unnecessary — the existing embedding infrastructure provides continuous (not binary) drift measurement.
- **FR-084**: `DerivedFromNoteIDs` MUST be populated as a JSON array of all direct source note IDs when creating a consolidated note.
- **FR-085**: Verification failures MUST be logged as warnings and annotated on the consolidated note but MUST NOT block the consolidation from completing (non-blocking for Phase 1).

#### Contradiction Detection (Phase 4 of Pipeline)
- **FR-020**: Contradiction detection MUST use a three-stage pipeline: (1) embedding pre-filter at 0.70 threshold, (2) entity-attribute-value triple extraction, (3) LLM judgment for ambiguous cases.
- **FR-021**: Each candidate pair MUST be evaluated by a dedicated contradiction detection prompt that extracts entity-attribute-value triples before judging.
- **FR-022**: Authoritative note selection MUST use composite `ImportanceScore` as primary signal, with recency (>7 days newer) as tiebreaker.
- **FR-023**: Revoked contradicted notes MUST have `ConsolidatedIntoNoteID` set to the winner and explanatory Comments.
- **FR-024**: Complementary (non-contradictory) pairs MUST be preserved.
- **FR-025**: When both notes in a contradictory pair have `ImportanceScore` above `highAccessCountThreshold` (default mapped to score >= 7.0), BOTH notes MUST be preserved with contradiction flag comments rather than auto-revoking.
- **FR-026**: Protected-tier notes MUST NOT be auto-revoked during contradiction resolution.

#### Stale Reference Pruning (Phase 5 of Pipeline)
- **FR-030**: MUST check active auto-generated notes for references to nonexistent/inactive entities.
- **FR-031**: Validated references: AgentID, UserID, CompanyID, SourceConversationID.
- **FR-032**: Orphaned notes MUST be archived with descriptive comments.
- **FR-033**: MUST process at most 200 notes per pruning cycle.
- **FR-034**: MUST cache entity lookups within a single cycle.
- **FR-035**: Immutable-tier notes MUST NOT be pruned regardless of orphaned references.

#### Decay-Based Archival (Phase 6 of Pipeline)
- **FR-040**: MUST archive auto-generated notes past their ExpiresAt timestamp regardless of decay score.
- **FR-041**: MUST compute decay score using Ebbinghaus formula: `strength = base_importance * e^(-lambda_eff * days_since_last_access) * (1 + access_count * 0.2)`, where `lambda_eff = 0.16 * (1 - normalized_importance * 0.8)`.
- **FR-042**: MUST archive auto-generated notes whose decay score falls below the archival threshold (default: 1.0).
- **FR-043**: MUST archive auto-generated examples with SuccessScore < 50 whose decay score falls below threshold.
- **FR-044**: MUST NOT archive manually created items (IsAutoGenerated=false — these default to Protected tier).
- **FR-045**: MUST read per-agent retention config (`AutoArchiveEnabled`). When disabled, no decay-based archival occurs.
- **FR-046**: Immutable-tier notes MUST NOT be archived. Protected-tier notes MUST NOT be archived unless inactive for 365+ days.
- **FR-047**: Ephemeral-tier notes MUST use an accelerated decay rate (2x `lambda_eff`).

#### Protection Tiers
- **FR-090**: AIAgentNote MUST support a `ProtectionTier` column with values: `Immutable`, `Protected`, `Standard` (default), `Ephemeral`.
- **FR-091**: Immutable notes MUST be excluded from consolidation, contradiction auto-revocation, stale pruning, AND decay-based archival.
- **FR-092**: Protected notes MUST be excluded from consolidation but subject to contradiction detection (without auto-revoke) and extended archival (365+ days).
- **FR-093**: Manually created notes (IsAutoGenerated=false) MUST default to `ProtectionTier='Protected'`.
- **FR-094**: Notes with `ImportanceScore >= 8.0` and `ProtectionTier='Standard'` SHOULD be auto-promoted to `ProtectionTier='Protected'` during importance scoring.

#### Composite Importance Scoring
- **FR-100**: Each note MUST have an `ImportanceScore` field (decimal 0.00-10.00).
- **FR-101**: ImportanceScore MUST be computed using a weighted composite of available signals: recency decay (w=0.20), LLM-judged importance at extraction (w=0.25), relevance to recent queries (w=0.15), uniqueness/rarity (w=0.15), correction boost (w=0.10), goal alignment (w=0.10), explicit user mark (w=0.05).
- **FR-102**: Signals not available for a given note MUST use neutral defaults (0.5 normalized) and redistribute their weight proportionally to available signals.
- **FR-103**: ImportanceScore MUST be recomputed during each maintenance cycle for all active notes.
- **FR-104**: ImportanceScore MUST replace raw AccessCount as the authority signal in contradiction resolution and consolidation conflict resolution.
- **FR-105**: Notes with correction provenance (`mergeWithExistingIds` was set during extraction) MUST receive a correction boost of +1.5 to their score.

#### Hybrid Scheduling
- **FR-095**: Maintenance phases MUST trigger on a daily time-based gate (existing `shouldRunConsolidation()` with frequency='daily').
- **FR-096**: Maintenance phases MUST ALSO trigger when active auto-generated note count for any single agent exceeds `noteCountTrigger` (default: 100) since last consolidation.
- **FR-097**: Tiered periodic scheduling SHOULD be supported: daily (light: dedup + basic clustering), weekly (deep: cross-referencing, temporal normalization, full importance recomputation), monthly (archival: comprehensive stale pruning + decay sweep).
- **FR-098**: After periods of high activity (50+ notes created in a single run), SHOULD schedule an immediate light consolidation pass on the next run.

#### Database Schema
- **FR-050**: Single migration adds the following columns to AIAgentNote:
  - `ConsolidatedIntoNoteID` — UNIQUEIDENTIFIER NULL, self-referential FK
  - `ConsolidationCount` — INT NOT NULL DEFAULT 0
  - `DerivedFromNoteIDs` — NVARCHAR(MAX) NULL (JSON array)
  - `ProtectionTier` — NVARCHAR(20) NOT NULL DEFAULT 'Standard'
  - `ImportanceScore` — DECIMAL(5,2) NULL
- **FR-051**: `ConsolidatedIntoNoteID` MUST be populated when a note is revoked due to consolidation or contradiction resolution.
- **FR-052**: `ProtectionTier` MUST be constrained to values: Immutable, Protected, Standard, Ephemeral (via CHECK constraint).
- **FR-053**: `ConsolidationCount` MUST be incremented (not reset) during consolidation.

#### Observability
- **FR-060**: Each maintenance phase MUST create AgentRunStep records with input/output data.
- **FR-061**: Each consolidation cluster MUST create a child run step including `ConsolidationCount` and cluster size.
- **FR-062**: Contradiction detection MUST log pairs analyzed, entity-attribute triples extracted, contradictions resolved, and high-confidence pairs flagged.
- **FR-063**: Post-consolidation verification MUST log entities checked and any missing entities detected.
- **FR-064**: Importance scoring MUST log score distribution statistics (min, max, mean, median) and any tier promotions.
- **FR-065**: Decay-based archival MUST log decay score distribution and archival threshold applied.

#### Cleanup Agent Deprecation
- **FR-070**: Memory Cleanup Agent's archival logic MUST be fully replicated by the decay-based archival phase before deprecation.
- **FR-071**: Cleanup Agent class MUST remain in codebase but its scheduled job should be disabled.

### Key Entities

- **AI Agent Note**: Gains `ConsolidatedIntoNoteID` (self-referential FK), `ConsolidationCount` (int), `DerivedFromNoteIDs` (JSON array), `ProtectionTier` (4 values), `ImportanceScore` (decimal). Drift detection uses existing `EmbeddingVector`. Existing: Status (Active/Pending/Revoked/Archived), EmbeddingVector, AccessCount, LastAccessedAt, ExpiresAt, IsAutoGenerated, multi-tenant scoping.
- **AI Agent Example**: Input/output pairs with SuccessScore. Subject to decay-based archival.
- **AI Agent Run Step**: Observability records for each Memory Manager phase.

### Success Criteria

- **SC-001**: After consolidation, active note count decreases by at least 20% on a corpus with known redundancies, while preserving all distinct factual content.
- **SC-002**: Contradictory note pairs are resolved within one daily cycle of their co-existence.
- **SC-003**: Notes referencing deleted entities are archived within one daily cycle.
- **SC-004**: All maintenance phases complete within 10 minutes for up to 1,000 active notes.
- **SC-005**: Every maintenance phase produces at least one AgentRunStep record.
- **SC-006**: Memory Cleanup Agent can be disabled with no loss of functionality.
- **SC-007**: Unit tests achieve 90%+ coverage of all new/enhanced logic.
- **SC-008**: No note reaches `ConsolidationCount > 3` during normal operation (generation cap enforced).
- **SC-009**: Post-consolidation verification catches at least 90% of entity/number omissions in a test corpus of known consolidation inputs.
- **SC-010**: Immutable and Protected notes are never consolidated in any test scenario.
- **SC-011**: Ebbinghaus decay correctly preserves high-importance notes for 6+ months while archiving low-importance notes within 30-60 days in a simulated time-series test.
- **SC-012**: Composite importance scoring produces a measurably different ordering than raw AccessCount on a test corpus (Kendall's tau < 0.7, indicating the composite captures different information).

---

## Part 3: Architecture & Implementation Plan

### Architecture Decision: Single Agent, Enhanced Pipeline

All memory lifecycle operations run inside the Memory Manager Agent in a guaranteed sequential pipeline:

```
Extract -> Dedup -> Create Notes/Examples -> Score -> Consolidate -> Verify -> Detect Contradictions -> Prune Stale Refs -> Decay-Archive
                                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                             New/enhanced phases (gated behind hybrid frequency check)
```

**New phases vs original spec**:
- **Score**: Computes composite `ImportanceScore` for all active notes before consolidation, so that consolidation and contradiction detection can use importance-weighted decisions.
- **Verify**: Post-consolidation fact-check ensuring named entities and numbers survive consolidation. Non-blocking (logs warnings).
- **Decay-Archive**: Replaces fixed-window archival with Ebbinghaus decay function respecting protection tiers.

**Why single agent** (unchanged from original):
- Eliminates race conditions between separate agents competing over the same notes
- Consolidation output feeds into contradiction detection input — guaranteed ordering
- No coordination logic needed between agents
- Single agent run provides unified observability
- Hybrid gate means maintenance adds zero overhead to ~90% of runs

**Phase isolation**: Each phase has its own dedicated LLM prompt with distinct instructions. The LLM is called separately per phase — no single prompt tries to do consolidation AND contradiction detection simultaneously.

### Configuration Constants

```typescript
const CONSOLIDATION_CONFIG = {
    frequency: 'daily' as 'disabled' | 'every-run' | 'hourly' | 'daily' | number,
    minClusterSize: 3,
    maxClusterSize: 7,                  // NEW: Research-informed cap (Miller's 7+/-2)
    similarityThreshold: 0.60,
    maxConsolidationCount: 3,      // NEW: Cap re-summarization depth
    noteCountTrigger: 100,              // NEW: Event-driven trigger threshold per agent
};

const CONTRADICTION_CONFIG = {
    similarityThreshold: 0.70,
    maxPairsPerRun: 50,
    highImportanceThreshold: 7.0,       // NEW: Notes above this get importance-weighted protection
};

const IMPORTANCE_CONFIG = {
    weights: {
        recencyDecay: 0.20,
        llmImportance: 0.25,
        relevance: 0.15,
        uniqueness: 0.15,
        correctionBoost: 0.10,
        goalAlignment: 0.10,
        userMark: 0.05,
    },
    correctionBonusPoints: 1.5,         // Flat bonus for correction-provenance notes
    autoPromoteThreshold: 8.0,         // Auto-promote to Protected at this score
    archivalThreshold: 1.0,            // Decay score below this triggers archival
};

const DECAY_CONFIG = {
    baseLambda: 0.16,                  // Base decay rate (Ebbinghaus)
    importanceDampening: 0.8,          // How much importance slows decay
    accessBoostFactor: 0.2,            // Access count contribution
    protectedInactivityDays: 365,      // Protected tier extended retention
    ephemeralDecayMultiplier: 2.0,     // Ephemeral tier accelerated decay
};
```

### Dependency Graph

```
Task 1 (Migration - expanded) ───────────────────────┐
                                                       │
Task 2 (Config - expanded) ──────────────────────┐    │
                                                  │    │
Task 7 (Prompt - drift safeguards) ───────┐      │    │
                                           │      │    │
                                           v      v    v
                                     Task 3 (Wire consolidation fields)
                                           │
Task 15 (Importance scoring) ────────(depends on Task 1 for ImportanceScore column)
                                           │
                                           v
                                     Task 11 (Drift prevention logic)
                                           │
                                           v
                                     Task 13 (Post-consolidation verification)
                                           │
                                           v
                                     Task 4 (Contradiction - enhanced)
                                           │
Task 12 (Protection tiers) ─────────(depends on Task 1, can parallel with 11-13)
                                           │
Task 5 (Stale ref pruning) ────────(independent, can parallel with 3-4)
                                           │
Task 16 (Ebbinghaus decay) ────────(depends on Tasks 1, 15; replaces Task 6)
                                           │
                                           v
                                     Task 14 (Cluster size + hybrid trigger)
                                           │
                                           v
                                     Task 8 (Observability - expanded)
                                           │
                                           v
                                     Task 9 (Unit tests - expanded)
                                           │
                                           v
                                     Task 10 (Deprecate cleanup agent)
                                           │
                                           v
                                     Task 17 (Phase 2 design document)
                                           │
                                           v
                                     Task 18 (Integration tests)
```

### Implementation Waves

| Wave | Tasks | Parallelizable? | Notes |
|------|-------|-----------------|-------|
| 1 | Tasks 1, 2, 5, 7 | Yes | Migration (expanded), config, stale pruning, prompt enhancements |
| 2 | Tasks 3, 15, 12 | Partial | After migration + CodeGen. 15 and 12 can parallel. |
| 3 | Tasks 11, 13 | Yes | Drift prevention + verification, both depend on Task 3 |
| 4 | Task 4 | After Task 11 | Enhanced contradiction detection |
| 5 | Tasks 16, 14 | Yes | Ebbinghaus decay + cluster size/hybrid trigger |
| 6 | Tasks 8, 9 | Yes | Observability + unit tests for all new phases |
| 7 | Tasks 10, 17 | Yes | Deprecate cleanup agent + Phase 2 design doc |
| 8 | Task 18 | After all | Integration tests |

---

## Part 4: Task List

> **This is the living document. Update task status, add notes, and track blockers here as work progresses.**

### Task 1: Database Migration — Expanded Schema

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 (blocks Tasks 3, 4, 11, 12, 15, 16) |
| Type | Migration + CodeGen |
| Effort | Small-Medium |
| Depends on | Nothing |

**What to do**:
- Create migration: `migrations/v5/V202604011000__v5.22.x_Memory_Consolidation_Schema.sql`
- Add the following columns to AIAgentNote:

```sql
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD ConsolidatedIntoNoteID UNIQUEIDENTIFIER NULL;
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD ConsolidationCount INT NOT NULL DEFAULT 0;
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD DerivedFromNoteIDs NVARCHAR(MAX) NULL;
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD ProtectionTier NVARCHAR(20) NOT NULL DEFAULT 'Standard';
ALTER TABLE ${flyway:defaultSchema}.AIAgentNote ADD ImportanceScore DECIMAL(5,2) NULL;
```

- Add self-referential FK: `FK_AIAgentNote_ConsolidatedIntoNote` referencing `AIAgentNote.ID`
- Add CHECK constraint for ProtectionTier: `CHK_AIAgentNote_ProtectionTier CHECK (ProtectionTier IN ('Immutable', 'Protected', 'Standard', 'Ephemeral'))`
- Add extended properties describing each column's purpose
- Set ProtectionTier='Protected' for existing IsAutoGenerated=0 notes:
  ```sql
  UPDATE ${flyway:defaultSchema}.AIAgentNote SET ProtectionTier = 'Protected' WHERE IsAutoGenerated = 0;
  ```
- Do NOT add indexes (CodeGen handles FK indexes)
- Do NOT add __mj timestamp columns (CodeGen handles these)

**After migration**:
- Run the migration against the database
- Run CodeGen to regenerate `entity_subclasses.ts`, views, and stored procedures
- Verify `MJAIAgentNoteEntity` gains getters/setters for all 6 new fields

**Files**:
- Create: `migrations/v5/V202604011000__v5.22.x_Memory_Consolidation_Schema.sql`
- Auto-updated by CodeGen: `packages/MJCoreEntities/src/generated/entity_subclasses.ts`

**Acceptance**: `MJAIAgentNoteEntity` has typed getters/setters for `ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, and `ImportanceScore` after CodeGen.

---

### Task 2: Activate and Expand Configuration

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 |
| Type | Code change |
| Effort | Small |
| Depends on | Nothing |

**What to do**:
- In `packages/AI/Agents/src/memory-manager-agent.ts`:
  - Change `CONSOLIDATION_CONFIG.frequency` from `'disabled'` to `'daily'`
  - Add `maxClusterSize: 7` to `CONSOLIDATION_CONFIG`
  - Add `maxConsolidationCount: 3` to `CONSOLIDATION_CONFIG`
  - Add `noteCountTrigger: 100` to `CONSOLIDATION_CONFIG`
  - Add new `CONTRADICTION_CONFIG` constant with `highImportanceThreshold: 7.0`
  - Add new `IMPORTANCE_CONFIG` constant with all weight values and thresholds
  - Add new `DECAY_CONFIG` constant with Ebbinghaus parameters

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: All 4 config constants defined with research-informed values.

---

### Task 3: Wire Consolidation Fields into Revocation

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 |
| Type | Code change |
| Effort | Small |
| Depends on | Task 1 |

**What to do**:
- In `processConsolidationCluster()`:
  - Set `noteToRevoke.ConsolidatedIntoNoteID = newNote.ID` on revoked source notes
  - Set `newNote.ConsolidationCount = Math.max(...cluster.map(n => n.ConsolidationCount)) + 1`
  - Set `newNote.DerivedFromNoteIDs = JSON.stringify(cluster.map(n => n.ID))`
  - Set `newNote.ProtectionTier = 'Standard'` (consolidated notes start at Standard)
  - Remove the TODO comment at lines 1379-1380
  - Update `noteToRevoke.Comments` to include the consolidated note ID and reason

- In `CreateNoteRecords()` (note creation from extraction):
  - Set `ProtectionTier = 'Protected'` when `IsAutoGenerated = false`
  - Set `ConsolidationCount = 0` (raw extraction, no consolidation)

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Revoked source notes have `ConsolidatedIntoNoteID` populated. Consolidated notes have correct `ConsolidationCount` and `DerivedFromNoteIDs`. Manually created notes default to Protected tier.

---

### Task 4: Enhanced Contradiction Detection Phase

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code + Prompt + Metadata |
| Effort | Medium-Large |
| Depends on | Tasks 1, 2, 11 |

#### 4a. Create the contradiction detection prompt template
- Create: `metadata/prompts/templates/memory-manager/detect-contradictions.md`
- Prompt implements a three-stage evaluation:
  1. **Extract entity-attribute-value triples** from each note (e.g., "user | preferred_framework | React")
  2. **Check for competing relations**: same entity-attribute pair with different values = structural contradiction
  3. **LLM judgment**: for ambiguous cases where triples don't cleanly extract, use natural language reasoning
- Returns JSON:
  ```json
  {
      "entityTriples": {
          "noteA": [{"entity": "user", "attribute": "preferred_framework", "value": "React"}],
          "noteB": [{"entity": "user", "attribute": "preferred_framework", "value": "Vue"}]
      },
      "isContradiction": true,
      "contradictionType": "competing_relation",
      "keepNoteId": "...",
      "revokeNoteId": "...",
      "reason": "Same entity-attribute pair with conflicting values. Newer note preferred (created 14 days later).",
      "confidence": 0.92
  }
  ```
- Must explicitly distinguish: contradiction (same attribute, different value) vs complementary (different attributes of same entity) vs unrelated similarity
- Edge case: same date + same importance score -> keep both with flag

#### 4b. Add prompt metadata entry
- Add to: `metadata/prompts/.memory-manager-prompts.json`
- Name: `"Memory Manager - Detect Contradictions"`
- Category: `"MJ: System"`
- Model assignments: Use the same model tier as extraction prompts (entity-attribute extraction requires stronger reasoning than basic consolidation)
- ResponseFormat: JSON, AssistantPrefill: `` "```json" ``, StopSequences: `` "\n```" ``

#### 4c. Implement `detectAndResolveContradictions()` method
- Add to: `packages/AI/Agents/src/memory-manager-agent.ts`
- Algorithm (three-stage pipeline):
  1. Load all active auto-generated notes (excluding Immutable tier)
  2. For each note, find semantically similar notes at 0.70 threshold (embedding pre-filter)
  3. Build unique pairs (avoid A->B and B->A)
  4. Skip pairs where both notes were in a consolidation cluster this run
  5. For each pair, call the contradiction detection prompt (entity-attribute extraction + judgment)
  6. If contradiction AND neither note is above `highImportanceThreshold`:
     - Revoke loser (lower ImportanceScore, or older if scores are close)
     - Set `ConsolidatedIntoNoteID` to winner, update Comments
  7. If contradiction AND both notes have high ImportanceScore:
     - Preserve both, add contradiction flag comment to each
     - Log for administrator review
  8. If contradiction AND one note is Protected tier:
     - Never revoke the Protected note; preserve both with flags
  9. Track processed pairs to avoid re-checking

#### 4d. Wire into `executeAgentInternal`
- Add after post-consolidation verification, before stale reference pruning
- Gate behind hybrid frequency check (same as consolidation)
- Add contradiction count and flagged count to final step message and payload

**Files**:
- Create: `metadata/prompts/templates/memory-manager/detect-contradictions.md`
- Modify: `metadata/prompts/.memory-manager-prompts.json`
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**After metadata changes**: `npx mj sync push --dir=metadata --include="prompts"`

**Acceptance**: Contradictory pairs detected via entity-attribute extraction. High-importance pairs flagged but preserved. Protected notes never auto-revoked. Complementary pairs preserved.

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
  1. Query active auto-generated notes with non-null FK references, EXCLUDING `ProtectionTier='Immutable'`
  2. Build lookup caches:
     - Agent cache: `AIEngine.Instance.Agents` filtered to active (already in memory)
     - User cache: Single RunView for all referenced UserIDs
     - Company cache: Single RunView for all referenced CompanyIDs
     - Conversation cache: Single RunView for all referenced ConversationIDs
  3. Check each note's references against caches
  4. Archive orphaned notes with descriptive Comments
  5. Cap at `maxNotesPerRun`

#### 5b. Wire into `executeAgentInternal`
- Add after contradiction detection, before decay-based archival
- Gate behind hybrid frequency check
- Add pruned count to final step payload

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Note**: No LLM prompt needed — purely database validation logic. Zero risk of prompt confusion.

**Acceptance**: Orphaned notes archived. Active references preserved. Immutable notes never pruned. Max 200 per cycle.

---

### Task 7: Enhance Consolidation Prompt with Drift Safeguards

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Prompt template + metadata push |
| Effort | Medium |
| Depends on | Nothing (independent) |

#### 7a. Add anchored iterative summarization
Add to `consolidate-notes.md`:
```
### Anchored Summarization
When source notes include notes that were themselves consolidated (ConsolidationCount > 0):
- EXTEND the existing consolidated note's text rather than regenerating from scratch
- Treat the consolidated note as the authoritative base and MERGE new information into it
- This prevents progressive semantic drift (research shows extending scores 4.04 vs 3.74 for full reconstruction)
- If ALL source notes are generation-0 (never consolidated), generate freely
```

#### 7b. Add temporal normalization section
After "Resolve Conflicts":
```
### Temporal Normalization
- Convert ALL relative time references to absolute dates using each note's createdAt timestamp
- "last week" in a note created March 20 -> "week of March 13"
- "recently" -> "as of [note's creation date]"
- "yesterday" -> calculate the actual date from createdAt
- The consolidated note MUST NEVER contain relative time references
```

#### 7c. Add importance-weighted conflict resolution
Add to "Resolve Conflicts":
```
### Importance-Weighted Resolution
- Each note has an ImportanceScore (0-10). Use this as the primary authority signal.
- ImportanceScore > 8.0 = high confidence (frequently validated, widely relevant, or user-marked)
- ImportanceScore < 3.0 = low-value (droppable if contradicted by higher-scored note)
- Between conflicting notes of similar age, prefer higher ImportanceScore
- Never drop information from a high-importance note to satisfy a low-importance one
```

#### 7d. Add aggressive contradiction resolution
Add to "Resolve Conflicts":
```
### Contradiction Resolution
- If notes contradict and one was created >7 days later, the newer one supersedes
- Do NOT preserve both sides "for historical context"
- Consolidated note MUST contain ONLY current truth
- Superseded info lives on in revoked source notes for auditing
```

#### 7e. Add cluster size awareness
Add:
```
### Large Cluster Handling
- You may receive clusters of up to 7 notes
- For larger clusters, focus on the highest-ImportanceScore facts first
- Ensure the most important information is preserved even if less important details are dropped
- Maximum consolidated note length: 300 characters (increased from 200 to accommodate larger clusters)
```

**Files**:
- Modify: `metadata/prompts/templates/memory-manager/consolidate-notes.md`

**After**: `npx mj sync push --dir=metadata --include="prompts"`

**Acceptance**: Prompt includes anchored summarization, temporal normalization, importance weighting, aggressive contradiction resolution, and cluster size awareness.

---

### Task 8: Add Observability Run Steps (Expanded)

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P4 |
| Type | Code change |
| Effort | Medium |
| Depends on | Tasks 3, 4, 5, 11, 12, 13, 15, 16 |

#### 8a. Importance scoring run step
- `CreateRunStep('Decision', 'Compute Importance Scores', { activeNoteCount })`
- Finalize: `{ notesScored, scoreDistribution: { min, max, mean, median }, tierPromotions }`

#### 8b. Consolidation run steps
- Parent: `CreateRunStep('Decision', 'Consolidate Related Notes', { frequency, activeNoteCount, triggerType: 'daily'|'event' })`
- Per-cluster child: `CreateRunStep('Prompt', 'Process Consolidation Cluster', { clusterSize, noteIds, maxGeneration })`

#### 8c. Post-consolidation verification run step
- `CreateRunStep('Validation', 'Verify Consolidation Output', { clustersVerified })`
- Finalize: `{ entitiesChecked, entitiesMissing, verificationsPassed, verificationsFlagged }`

#### 8d. Contradiction detection run step
- `CreateRunStep('Decision', 'Detect Note Contradictions', { pairsToAnalyze })`
- Finalize: `{ contradictionsFound, contradictionsResolved, highImportanceFlagged, pairsAnalyzed, entityTriplesExtracted }`

#### 8e. Stale reference pruning run step
- `CreateRunStep('Decision', 'Prune Stale References', { notesChecked })`
- Finalize: `{ notesArchived, orphanedAgents, orphanedUsers, orphanedConversations }`

#### 8f. Decay-based archival run step
- `CreateRunStep('Decision', 'Decay-Based Archival', { activeNotesEvaluated })`
- Finalize: `{ notesArchived, examplesArchived, decayScoreDistribution: { min, max, mean }, protectedPreserved, ephemeralAccelerated }`

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Each maintenance phase produces AgentRunStep records with comprehensive input/output data.

---

### Task 9: Unit Tests (Expanded)

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Test code |
| Effort | Large |
| Depends on | Tasks 2, 3, 4, 5, 11, 12, 13, 15, 16 |

#### 9a. Consolidation tests
- Create: `packages/AI/Agents/src/__tests__/memory-consolidation.test.ts`
- `shouldRunConsolidation()`: true for 'daily' when >24h OR note count exceeds trigger; false otherwise
- `findConsolidationClusters()`: groups similar notes; respects maxClusterSize; excludes Immutable/Protected
- `processConsolidationCluster()`: sets all consolidation fields correctly; anchored summarization when generation > 0
- Config defaults: minClusterSize=3, maxClusterSize=7, similarityThreshold=0.60, frequency='daily'

#### 9b. Drift prevention tests
- ConsolidationCount incremented correctly (max of sources + 1)
- Notes at generation cap trigger original-source retrieval via DerivedFromNoteIDs chain
- DerivedFromNoteIDs contains correct IDs

#### 9c. Post-consolidation verification tests
- Detects missing named entities in consolidated output
- Detects missing numeric values
- Non-blocking: verification failure adds comment but doesn't prevent consolidation

#### 9d. Contradiction detection tests
- Contradictory pair -> lower ImportanceScore revoked, higher kept
- Same importance -> newer kept (if >7 days apart)
- Complementary pair -> both preserved
- Self-pairing prevented
- Pair deduplication (A-B not checked as B-A)
- High-importance pair (both > threshold) -> flagged but both preserved
- Protected-tier note never auto-revoked
- Entity-attribute extraction produces valid triples

#### 9e. Stale reference pruning tests
- Deleted agent -> note archived
- Active agent -> note preserved
- Deleted conversation -> note archived
- Immutable note never pruned
- Max 200 per cycle enforced
- Entity lookup caching (same entity not queried twice)

#### 9f. Importance scoring tests
- 7-signal composite formula produces expected scores for known inputs
- Missing signals use neutral defaults with weight redistribution
- Correction boost applied to notes with mergeWithExistingIds provenance
- Auto-promotion to Protected at threshold (8.0)
- Score ordering differs from raw AccessCount ordering

#### 9g. Decay function tests
- High importance + recent access -> high decay score (preserved)
- Low importance + old access -> low decay score (archived)
- Ephemeral tier uses accelerated decay (2x lambda)
- Protected tier uses extended retention (365 days)
- Immutable tier never archived
- Access count boost factor applied correctly
- Edge case: ExpiresAt overrides decay score

#### 9h. Protection tier tests
- Immutable excluded from consolidation, contradiction auto-revoke, pruning, and archival
- Protected excluded from consolidation, included in contradiction (without auto-revoke), extended archival
- Standard subject to all policies
- Ephemeral subject to aggressive consolidation (minClusterSize=2) and accelerated decay
- Manual notes (IsAutoGenerated=false) default to Protected

#### 9i. Hybrid scheduling tests
- Daily gate fires after 24h
- Note count trigger fires at threshold
- Both gates can fire independently
- Neither gate fires -> maintenance skipped

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
| Depends on | Tasks 9, 16 |

**What to do**:
- Disable Cleanup Agent's scheduled job (metadata config change)
- Add deprecation JSDoc to `memory-cleanup-agent.ts`: *"Deprecated: Archival logic replaced by Ebbinghaus decay function in Memory Manager Agent. Class retained for reference. Scheduled job should not be active."*
- Do NOT delete the file — keep for reference and rollback
- Update any documentation referencing the Cleanup Agent

**Files**:
- Modify: `packages/AI/Agents/src/memory-cleanup-agent.ts` (deprecation notice)
- Modify: Scheduled job metadata (disable)

**Acceptance**: Cleanup Agent job disabled. Memory Manager handles all archival via decay function. No loss of functionality.

---

### Task 11: Consolidation Drift Prevention Logic

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P1 |
| Type | Code change |
| Effort | Medium |
| Depends on | Tasks 1, 3 |

**What to do**:
- In `processConsolidationCluster()`, before calling the consolidation prompt:
  1. Check if any source note has `ConsolidationCount >= maxConsolidationCount` (default 3)
  2. If so, resolve the `DerivedFromNoteIDs` chain recursively to load ALL original generation-0 source notes
  3. Pass the original source notes (not the already-consolidated intermediaries) to the consolidation prompt
  4. Set a flag so the prompt knows to do fresh synthesis rather than anchored extension
- After consolidation creates the new note:
  1. Set `ConsolidationCount = max(sourceConsolidationCounts) + 1`
  3. Set `DerivedFromNoteIDs` to JSON array of direct source note IDs

**Helper methods**:
- `resolveOriginalSources(noteIds: string[]): Promise<MJAIAgentNoteEntity[]>` — walks DerivedFromNoteIDs chains to find generation-0 notes
- `computeContentHash(content: string): string` — SHA-256 hex string

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Notes at generation cap trigger original-source retrieval. Generation counter incremented correctly. Content hash stored on all consolidated notes.

---

### Task 12: Protection Tier Filtering

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code change |
| Effort | Small |
| Depends on | Task 1 |

**What to do**:
- In `findConsolidationClusters()`:
  - Exclude notes with `ProtectionTier='Immutable'` OR `ProtectionTier='Protected'` from clustering
  - For Ephemeral notes, use relaxed `minClusterSize` of 2
- In `detectAndResolveContradictions()`:
  - Include Protected notes in candidate pair finding
  - When a Protected note is in a contradictory pair, NEVER auto-revoke it — add contradiction flag comment instead
  - Immutable notes excluded from contradiction scanning entirely
- In `pruneStaleReferences()`:
  - Skip notes with `ProtectionTier='Immutable'`
- In `CreateNoteRecords()` (extraction):
  - Set `ProtectionTier='Protected'` when `IsAutoGenerated=false`
  - Default to `ProtectionTier='Standard'` for auto-generated notes
- In importance scoring (Task 15):
  - Auto-promote Standard notes to Protected when `ImportanceScore >= autoPromoteThreshold` (8.0)
  - Auto-protect outlier notes (uniqueness above 95th percentile)

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Immutable notes never consolidated, never auto-revoked, never pruned. Protected notes excluded from consolidation but included in contradiction detection (without auto-revoke). Ephemeral notes use relaxed clustering. Auto-promotion works.

---

### Task 13: Post-Consolidation Verification

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code change |
| Effort | Medium |
| Depends on | Task 3 |

**What to do**:
- New method `verifyConsolidationOutput(sourceNotes, consolidatedNote)`:
  1. Extract named entities from source notes using regex/simple NLP:
     - Numbers (integers, decimals, percentages)
     - Dates (various formats)
     - Proper nouns (capitalized sequences, excluding sentence starts)
     - Technical terms (camelCase, PascalCase, kebab-case identifiers)
  2. Check that each extracted entity appears in the consolidated note's text
  3. Return `{ entitiesChecked: number, entitiesMissing: string[], passed: boolean }`
- If verification fails:
  - Add `[Verification: potentially missing entities: entity1, entity2]` comment to the consolidated note
  - Log a warning via the observability step
  - Do NOT block the consolidation (non-blocking for Phase 1)
- Wire into pipeline: call after each `processConsolidationCluster()` completes

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Named entities and numbers extracted from source notes and verified in consolidated output. Missing entities logged and annotated. Consolidation proceeds regardless of verification outcome.

---

### Task 14: Cluster Size Enforcement + Hybrid Trigger

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code change |
| Effort | Small-Medium |
| Depends on | Task 2 |

#### 14a. Cluster size enforcement
- In `findConsolidationClusters()`:
  - After building a cluster, check if `cluster.length > maxClusterSize` (7)
  - If so, split into sub-clusters:
    1. Compute cluster centroid (average embedding vector)
    2. Sort notes by similarity to centroid (descending)
    3. Take top `maxClusterSize` notes as first sub-cluster
    4. Remaining notes form second sub-cluster if >= `minClusterSize`, else dropped
  - Recursively split if second sub-cluster also exceeds max

#### 14b. Hybrid trigger
- In `shouldRunConsolidation()`:
  - Existing time-based check (daily/hourly/etc.) remains as primary gate
  - Add secondary gate: query count of active auto-generated notes created since last consolidation timestamp
  - If count exceeds `noteCountTrigger` (100) for any agent, return true regardless of time elapsed
  - Track per-agent note counts for trigger evaluation

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: Clusters split at maxClusterSize boundary. Hybrid trigger fires on note count threshold. Both gates work independently.

---

### Task 15: Composite Importance Scoring

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code change |
| Effort | Medium-Large |
| Depends on | Task 1 |

**What to do**:
- New method `computeImportanceScores(notes, contextUser)`:
  1. For each active note, compute available signals:
     - **Recency decay** (w=0.20): `0.995 ^ hours_since_creation`, normalized 0-1
     - **LLM-judged importance** (w=0.25): Use `confidence` from extraction (already stored). For notes without extraction confidence, use 0.5
     - **Relevance** (w=0.15): Average cosine similarity to the 5 most recent conversation inputs for this agent. For notes without recent conversations, use 0.5
     - **Uniqueness** (w=0.15): Minimum cosine distance to nearest neighbor in the note vector space. Higher = more unique = more important. Normalized to 0-1
     - **Correction boost** (w=0.10): 1.0 if note has `mergeWithExistingIds` provenance (it was a correction), 0.0 otherwise. Plus flat bonus of 1.5 points to final score
     - **Goal alignment** (w=0.10): 0.5 default (Phase 2 will compute from agent goals). Can be enriched via agent-specific configuration
     - **User mark** (w=0.05): 1.0 if manually created (IsAutoGenerated=false), 0.0 otherwise
  2. Compute weighted sum, normalize to 0-10 scale
  3. Apply correction bonus (additive, post-normalization, capped at 10.0)
  4. Store result in `ImportanceScore` field
  5. Handle missing signals: redistribute weight proportionally to available signals

- Auto-promotion logic:
  - Notes with `ImportanceScore >= 8.0` and `ProtectionTier='Standard'` -> promote to Protected
  - Notes with uniqueness above 95th percentile and `ProtectionTier='Standard'` -> promote to Protected
  - Add comment explaining auto-promotion reason

- Wire into pipeline: run BEFORE consolidation (so consolidation/contradiction can use ImportanceScore)

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`

**Acceptance**: ImportanceScore computed for all active notes using 7-signal formula. Missing signals handled gracefully. Auto-promotion triggers at threshold. Score ordering measurably differs from raw AccessCount.

---

### Task 16: Ebbinghaus Decay Function (Replaces Task 6)

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P2 |
| Type | Code change |
| Effort | Medium |
| Depends on | Tasks 1, 15 |

**What to do**:
- New method `decayBasedArchival(contextUser)` replacing the ported cleanup agent logic:

  1. **Compute decay score** for each active auto-generated note:
     ```
     normalized_importance = (ImportanceScore ?? 5.0) / 10.0
     lambda_eff = DECAY_CONFIG.baseLambda * (1 - normalized_importance * DECAY_CONFIG.importanceDampening)
     days_since_access = daysSince(LastAccessedAt ?? __mj_CreatedAt)
     strength = normalized_importance * e^(-lambda_eff * days_since_access) * (1 + AccessCount * DECAY_CONFIG.accessBoostFactor)
     ```

  2. **Apply tier modifiers**:
     - Immutable: skip entirely (never archived)
     - Protected: only archive if `days_since_access > DECAY_CONFIG.protectedInactivityDays` (365)
     - Standard: archive if `strength < IMPORTANCE_CONFIG.archivalThreshold` (1.0)
     - Ephemeral: use `lambda_eff * DECAY_CONFIG.ephemeralDecayMultiplier` (2x faster decay)

  3. **Handle explicit expiration**: Notes with `ExpiresAt < now()` archived regardless of decay score

  4. **Handle examples**: Same decay logic for examples, with SuccessScore factored into base importance

  5. **Respect per-agent config**: Check `AutoArchiveEnabled` per agent. Skip if disabled.

  6. **Archive**: Set `Status='Archived'` (resolve open question: add 'Archived' to Status CHECK constraint in Task 1), add comment with decay score and reason

- Wire into pipeline: final maintenance phase, after stale reference pruning

**Files**:
- Modify: `packages/AI/Agents/src/memory-manager-agent.ts`
- Extend Task 1 migration: add 'Archived' to Status CHECK constraint

**Acceptance**: High-importance notes preserved for 6+ months. Low-importance notes archived within 30-60 days. Protection tier modifiers respected. Per-agent config honored.

---

### Task 17: Phase 2 Design Document

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P4 |
| Type | Documentation |
| Effort | Medium |
| Depends on | All Phase 1 tasks |

**What to do**:
- Create: `specs/001-memory-consolidation/phase-2-design.md`
- Document architectural designs for Phase 2 features, each with:
  - Research rationale (citations from `research.md`)
  - Architectural sketch (entities, relationships, data flow)
  - Prerequisite work from Phase 1 that enables it
  - Estimated scope and key risks

**Sections**:
1. **Knowledge Graph Layer**: Bi-temporal entity-relation graph. New entities for nodes/edges. Temporal tracking (created, expired, valid, invalid timestamps). Integration with contradiction detection to replace LLM-only judgment with structural detection. Reference: Graphiti/Zep model.
2. **Dual-Store Architecture**: Hot store for generation-0 notes (<48h), cold store for consolidated (generation 1+). Schema-congruency gating for fast-track consolidation. Separate retrieval strategies per store. Reference: CLS theory, HippoRAG.
3. **Reconsolidation Engine**: Update-on-access with prediction error detection. Graduated response (reinforce/update/create). Importance-weighted update resistance (EWC-inspired). Temporal lability window. Reference: Nader et al. 2000, Stemerding et al. 2022.
4. **Metamemory Monitor**: Separate monitoring agent that audits memory quality. Coverage gap detection. Confidence auditing. Contradiction density tracking. Quality metrics dashboard. Reference: Nelson & Narens 1990.
5. **Pattern Separation**: Mechanisms to maintain distinctness between similar but meaningfully different notes. Orthogonal embedding strategies. Disambiguation tags. Retrieval-induced forgetting mitigation (diversity-aware retrieval). Reference: Josselyn & Tonegawa 2020, Anderson 1994.
6. **Adaptive Thresholds**: HDBSCAN clustering eliminating fixed similarity thresholds. Per-embedding-model threshold calibration. Reference: NeMo Curator SemDeDup.

**Files**:
- Create: `specs/001-memory-consolidation/phase-2-design.md`

**Acceptance**: Document exists with sufficient architectural detail to begin Phase 2 implementation without re-reading research.md.

---

### Task 18: Integration Tests

| Field | Value |
|-------|-------|
| Status | Not Started |
| Priority | P3 |
| Type | Test code |
| Effort | Medium |
| Depends on | All Phase 1 code tasks |

**What to do**:
- Create end-to-end test scenarios that exercise the full pipeline:
  1. **Consolidation lifecycle**: Create 10 similar notes -> run Memory Manager -> verify consolidation to 2-3 notes -> run again -> verify no re-consolidation within daily window
  2. **Drift prevention**: Create notes -> consolidate -> consolidate again -> verify generation counter -> force a third consolidation -> verify original-source retrieval at generation cap
  3. **Contradiction resolution**: Create contradictory pair -> run Memory Manager -> verify correct note revoked -> verify entity-attribute triples in run step output
  4. **Protection tiers**: Create Immutable + Protected + Standard + Ephemeral notes -> run full pipeline -> verify correct tier behavior for each
  5. **Decay lifecycle**: Create notes with various importance scores -> simulate time passage -> run decay -> verify high-importance preserved, low-importance archived
  6. **Hybrid trigger**: Create 101 notes for one agent -> verify consolidation triggers despite <24h elapsed

**Files**:
- Create: `packages/AI/Agents/src/__tests__/memory-consolidation-integration.test.ts`

**Acceptance**: All integration scenarios pass. Full pipeline exercised end-to-end.

---

## Part 5: Phase 2 — Future Architecture

> These architectural enhancements are designed here to ensure Phase 1 decisions don't preclude them. Implementation is deferred to a separate feature.

### 5.1 Knowledge Graph Layer

**Research basis**: Graphiti (Rasmussen et al., 2025) achieves 94.8% accuracy on dialogue memory retrieval using a bi-temporal knowledge graph. HippoRAG (NeurIPS 2024) shows 10-30x cost reduction via Personalized PageRank over knowledge graphs.

**Architectural sketch**: New entity tables — `AIAgentMemoryNode` (entities mentioned in notes), `AIAgentMemoryEdge` (relations between entities with 4 timestamps: created, expired, valid, invalid). Contradiction detection becomes a graph operation: find competing edges for same node-attribute pair. Never delete edges — only invalidate, preserving full audit trail.

**Phase 1 prerequisite**: Entity-attribute extraction in the contradiction detection prompt (Task 4) validates the approach at small scale and produces the data that would populate graph nodes.

**Estimated scope**: Medium-Large. New migration, new entity classes, graph query infrastructure, integration with contradiction detection.

### 5.2 Dual-Store Architecture

**Research basis**: CLS theory (McClelland et al., 1995) demonstrates fast-learning (hippocampal) and slow-learning (neocortical) systems. Schema theory (Tse et al., 2007) shows schema-congruent information consolidates orders of magnitude faster.

**Architectural sketch**: Logical separation (not separate tables) using `ConsolidationCount` as the discriminator. Generation-0 notes are "hot" (full episodic detail, aggressive retrieval). Generation 1+ notes are "cold" (consolidated knowledge, stable retrieval). Schema-congruency gating: a fast-path check comparing new note embeddings against existing cold-store cluster centroids. High congruency -> accelerated consolidation (48h instead of waiting for daily cycle).

**Phase 1 prerequisite**: `ConsolidationCount` field (Task 1) enables hot/cold discrimination. `DerivedFromNoteIDs` (Task 1) provides bidirectional links.

**Estimated scope**: Medium. Retrieval strategy changes, congruency gating logic, no new tables needed.

### 5.3 Reconsolidation Engine

**Research basis**: Nader et al. (2000) showed retrieved memories enter a labile state for 4-6 hours. EWC (Elastic Weight Consolidation) reduces catastrophic forgetting by 45.7% through importance-weighted update resistance.

**Architectural sketch**: Modify `AgentContextInjector` to return note metadata alongside formatted text. After agent execution, a post-processing step compares agent output against injected notes for prediction error. Graduated response: small discrepancy -> reinforce (increment AccessCount), moderate -> update (merge new info, increment ConsolidationCount), large -> create new entry + flag contradiction. Importance-weighted resistance: `update_threshold = base_threshold * (1 + ImportanceScore * 0.3)`.

**Phase 1 prerequisite**: `ImportanceScore` (Task 15) provides update resistance weights. `ConsolidationCount` (Task 1) tracks modification depth. Existing `EmbeddingVector` provides drift detection via cosine similarity.

**Estimated scope**: Large. Changes to AgentContextInjector, BaseAgent, and post-execution pipeline.

### 5.4 Metamemory Monitor

**Research basis**: Nelson & Narens (1990) distinguish object-level (memories) from meta-level (system's assessment of memories). The Zeigarnik effect shows incomplete tasks recalled 90% better.

**Architectural sketch**: Separate scheduled agent (not part of Memory Manager) that runs weekly. Queries: coverage gaps (topics with no notes), confidence distribution (cluster of low-confidence notes = weak knowledge area), contradiction density (topics with high ratio of flagged contradictions = unresolved knowledge), staleness distribution (topics where all notes are aging without access). Outputs: quality report in AgentRunStep, optional alerts to administrators.

**Phase 1 prerequisite**: Observability infrastructure (Task 8) provides data. ImportanceScore (Task 15) and ProtectionTier (Task 12) provide quality signals.

**Estimated scope**: Medium. New agent class, monitoring queries, report generation. No schema changes.

### 5.5 Pattern Separation

**Research basis**: Josselyn & Tonegawa (2020) show the dentate gyrus makes similar inputs more distinct. Anderson's Retrieval-Induced Forgetting (1994) shows selectively retrieving certain memories actively suppresses non-retrieved ones.

**Architectural sketch**: Explicit disambiguation tags on notes that share high similarity but represent distinct knowledge. Orthogonal embedding perturbation: when two notes are semantically similar but factually distinct, add a small orthogonal vector to separate them in embedding space. Diversity-aware retrieval: periodically surface lower-ranked memories to prevent permanent suppression. Anti-clustering: identify notes that SHOULD NOT be consolidated despite surface similarity.

**Phase 1 prerequisite**: Post-consolidation verification (Task 13) prevents merging of superficially similar but distinct notes. Protection tier "outlier auto-protection" (Task 12) preserves rare memories.

**Estimated scope**: Large. Embedding manipulation, retrieval strategy changes, new disambiguation metadata.

### 5.6 Adaptive Thresholds

**Research basis**: NVIDIA NeMo Curator SemDeDup recommends per-model threshold experimentation. HDBSCAN eliminates fixed thresholds via density-based clustering with automatic outlier detection.

**Architectural sketch**: Replace fixed 0.60/0.70 thresholds with HDBSCAN clustering. HDBSCAN parameters (min_cluster_size, min_samples) replace similarity thresholds. Automatic outlier identification replaces the 95th-percentile uniqueness heuristic. Threshold calibration: periodically evaluate consolidation quality (ROUGE/BERTScore of outputs vs inputs) and auto-adjust parameters.

**Phase 1 prerequisite**: Cluster size enforcement (Task 14) validates the splitting approach. Post-consolidation verification (Task 13) provides quality metrics for calibration.

**Estimated scope**: Medium. Replace clustering algorithm, add quality evaluation loop. May require new dependency (HDBSCAN library).

---

## Open Questions

1. **Status value list**: Current AIAgentNote Status allows Active/Pending/Revoked. The cleanup agent uses 'Archived'. **Resolution**: Add 'Archived' to the Status CHECK constraint in the Task 1 migration. This is cleaner than overloading 'Revoked' for a semantically different operation (archival due to decay vs revocation due to supersession).

2. **Contradiction prompt model selection** (RESOLVED): Entity-attribute extraction requires stronger reasoning than basic consolidation. Use the same model tier as extraction prompts (Gemini 3 Flash / GPT-OSS-120B). Documented in Task 4.

3. **Rollback strategy** (RESOLVED): The `ConsolidatedIntoNoteID` chain + `DerivedFromNoteIDs` provide a programmatic rollback path. Revoked source notes preserve their original content — a "decompose" utility can walk the chain, restore source notes by setting Status back to Active and clearing ConsolidatedIntoNoteID. Deferred to post-v1 — manual admin UI intervention is sufficient initially.

4. **ProtectionTier enforcement** (NEW): ProtectionTier uses a SQL CHECK constraint (same pattern as Status field) for data integrity. Application-level logic handles the behavioral differences per tier.

5. **Ebbinghaus parameter tuning** (NEW): The decay parameters (`baseLambda: 0.16`, `importanceDampening: 0.8`, etc.) are based on research defaults. They should be treated as initial values subject to empirical tuning based on production observation. Consider making them per-agent configurable via agent metadata (analogous to existing NoteRetentionDays).

6. **ImportanceScore signal availability** (NEW): Several signals in the composite formula (goal alignment, relevance to recent queries) require infrastructure that may not be fully available in Phase 1. The weight redistribution mechanism (FR-102) handles graceful degradation, but the accuracy of ImportanceScore will improve as more signals become computable in Phase 2.

## Assumptions

- Existing consolidation code is functionally correct but needs drift safeguards before activation at scale
- Existing consolidation prompt is a solid foundation needing enhancement (anchored summarization, temporal normalization, importance weighting), not replacement
- Vector similarity search performs adequately at 0.60 (consolidation) and 0.70 (contradiction pre-filter) thresholds for Phase 1; adaptive thresholds are a Phase 2 enhancement
- SHA-256 hashing of note content is computationally negligible relative to LLM calls
- Cluster splitting by centroid similarity produces reasonable sub-clusters without requiring HDBSCAN for Phase 1
- Protection tier defaults cover the 80% case; per-note override via admin UI is sufficient for edge cases
- Post-consolidation verification via regex extraction is "good enough" for Phase 1; LLM-based entity extraction is a Phase 2 enhancement
- The Ebbinghaus decay parameters are reasonable starting points; production tuning will refine them
- Memory Cleanup Agent scheduling can be disabled without a migration
- The composite importance formula with weight redistribution for missing signals produces meaningful scores even when only 4-5 of 7 signals are available
- Each maintenance phase's LLM prompt runs independently, preventing cross-phase confusion
