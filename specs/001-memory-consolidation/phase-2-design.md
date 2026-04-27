# Phase 2: Memory Architecture Enhancements — Detailed Design

**Feature Branch**: `001-memory-consolidation`
**Created**: 2026-03-31
**Status**: Design Draft
**Depends On**: Phase 1 (consolidation activation, updated_spec.md)
**Research Input**: [`research.md`](research.md) — cognitive science foundations
**Phase 1 Reference**: [`updated_spec.md`](updated_spec.md) — prerequisite infrastructure

---

## Overview

Phase 1 activates consolidation, drift prevention, contradiction detection, composite importance scoring, Ebbinghaus decay, and protection tiers. It deliberately lays groundwork for six architectural enhancements that require deeper structural changes. This document provides implementation-ready designs for each, grounded in the research findings from `research.md` and referencing specific Phase 1 outputs that enable them.

Each section follows a uniform structure: research rationale with citations, architectural sketch (entities, relationships, data flow), Phase 1 prerequisites that enable it, and estimated scope.

---

## 1. Knowledge Graph Layer

### Research Rationale

Vector similarity alone cannot reliably distinguish contradiction from topical similarity. Zep/Graphiti (Rasmussen et al., 2025) achieves 94.8% accuracy on dialogue memory retrieval using a bi-temporal knowledge graph that tracks both event time and ingestion time. When two edges assert conflicting relations for the same entity-attribute pair (e.g., "user prefers React" vs. "user prefers Vue"), the graph detects this as a schema violation structurally, without relying on embedding distance.

Mem0's hybrid architecture (vector + graph + key-value) demonstrates 26% relative improvement over OpenAI Memory on the LOCOMO benchmark. HippoRAG (NeurIPS 2024) combines LLMs with knowledge graphs and Personalized PageRank to outperform state-of-the-art RAG by up to 20%, with 10-30x cost reduction and 6-13x speed improvement over iterative retrieval methods.

The key insight: graph structures represent relationships that embeddings flatten. A vector for "the team uses PostgreSQL" and "the team migrated from PostgreSQL to MySQL" may be highly similar, but a graph immediately reveals that the `team -> database` edge has a temporal successor.

### Architectural Sketch

#### New Entities

**AIAgentMemoryNode**
| Field | Type | Purpose |
|-------|------|---------|
| ID | uniqueidentifier | PK |
| AgentID | uniqueidentifier | FK to AI Agents |
| Label | nvarchar(500) | Entity name (e.g., "user", "PostgreSQL", "team") |
| NodeType | nvarchar(50) | `Entity`, `Concept`, `Preference`, `Constraint` |
| EmbeddingVector | vector | For semantic node lookup |
| Attributes | nvarchar(max) | JSON blob of extracted properties |
| SourceNoteID | uniqueidentifier | FK to AIAgentNote that produced this node |
| ScopeHierarchyKey | nvarchar(200) | 8-level scope key matching note scoping |

**AIAgentMemoryEdge**
| Field | Type | Purpose |
|-------|------|---------|
| ID | uniqueidentifier | PK |
| SourceNodeID | uniqueidentifier | FK to AIAgentMemoryNode (subject) |
| TargetNodeID | uniqueidentifier | FK to AIAgentMemoryNode (object) |
| Relation | nvarchar(200) | Predicate label (e.g., "prefers", "uses", "deployed_on") |
| CreatedAt | datetimeoffset | When the edge was first ingested (ingestion time) |
| ExpiredAt | datetimeoffset | When the edge was invalidated (null = still valid) |
| ValidFrom | datetimeoffset | When the fact became true in the real world (event time) |
| InvalidFrom | datetimeoffset | When the fact stopped being true (null = still true) |
| Confidence | decimal(5,2) | Extraction confidence (0-1) |
| SourceNoteID | uniqueidentifier | FK to AIAgentNote that produced this edge |
| EpisodeID | uniqueidentifier | Groups edges from the same extraction event |

The four-timestamp model (CreatedAt, ExpiredAt, ValidFrom, InvalidFrom) is the Graphiti bi-temporal pattern. It separates "when we learned this" from "when this was true," enabling queries like "what did we believe about the database at time T?" and "what was actually true at time T?"

#### Data Flow

1. **Extraction**: During note extraction (existing Memory Manager pipeline), an additional LLM prompt extracts entity-relation-entity triples from each note. Output: `[(subject, relation, object, validFrom)]` tuples.
2. **Node Resolution**: Each subject/object is matched against existing nodes by label + embedding similarity. New nodes created for unmatched entities. Deduplication threshold: 0.92 cosine similarity on node labels.
3. **Edge Insertion**: New edges are inserted with CreatedAt = now, ValidFrom = extracted event time (or now if unspecified), ExpiredAt = null, InvalidFrom = null.
4. **Structural Contradiction Detection**: Before inserting, check for existing active edges with the same (SourceNode, Relation, TargetNodeType) pattern but different TargetNode. If found, this is a structural contradiction. Set InvalidFrom on the old edge (do not delete). Create the new edge. Log the contradiction for the existing contradiction detection pipeline.
5. **Retrieval via Personalized PageRank**: When `AgentContextInjector` retrieves notes, also run a Personalized PageRank walk from query-relevant seed nodes. Seed nodes are identified by embedding similarity between query and node embeddings. PPR returns a ranked set of nodes; their associated notes are merged with the vector retrieval results using reciprocal rank fusion.

#### Contradiction Detection Enhancement

Phase 1's three-stage contradiction pipeline (embedding pre-filter -> entity-attribute extraction -> LLM judgment) becomes:

1. **Embedding pre-filter** (unchanged from Phase 1)
2. **Graph structure check** (new): Query the graph for edges sharing (SourceNode, Relation) with different TargetNodes. These are structural contradictions — no LLM needed.
3. **LLM judgment** (only for ambiguous cases not caught by graph structure)

This reduces LLM calls for contradiction detection significantly since the most common contradiction pattern (attribute value change) is caught structurally.

### Phase 1 Prerequisites

- **Entity-attribute extraction in contradiction prompt** (FR-020, FR-021): Phase 1 already requires the contradiction prompt to extract entity-attribute-value triples. This validates that the extraction approach works at small scale and provides a tested prompt template to adapt for graph ingestion.
- **EmbeddingVector on AIAgentNote**: Existing vector infrastructure for notes extends naturally to node embeddings.
- **ConsolidatedIntoNoteID / DerivedFromNoteIDs**: Provenance chain enables linking graph edges back through consolidation history to original source conversations.

### Estimated Scope

- 2 new database entities (AIAgentMemoryNode, AIAgentMemoryEdge) with migrations
- 1 new extraction prompt for triple extraction (adapt Phase 1 contradiction prompt)
- Node resolution logic with embedding-based deduplication
- Structural contradiction detection query (SQL-based, no external graph DB required)
- Personalized PageRank implementation (iterative matrix computation, ~200 LOC)
- Integration with AgentContextInjector retrieval pipeline
- **Estimate**: 3-4 weeks engineering

---

## 2. Dual-Store Architecture

### Research Rationale

Complementary Learning Systems (CLS) theory (McClelland, McNaughton & O'Reilly, 1995; CLS 2.0: Kumaran, Hassabis & McClelland, 2016) establishes that intelligent agents need two distinct learning systems: a fast-learning hippocampal system for rapid episodic encoding with sparse, pattern-separated representations, and a slow-learning neocortical system that gradually extracts generalizable structure through interleaved replay.

Schema-congruency gating (Tse et al., 2007) demonstrated that information consistent with existing knowledge schemas consolidates orders of magnitude faster — rats with pre-existing schemas consolidated new associations in 48 hours versus weeks. The medial prefrontal cortex performs this congruency detection in humans; the system needs an analogous gating mechanism to route schema-congruent notes to fast-track consolidation.

HippoRAG (NeurIPS 2024) directly implements CLS principles and demonstrated up to 20% improvement on multi-hop question answering by maintaining both a fast episodic index and slow knowledge graph integration. Trace Transformation Theory (Winocur & Moscovitch, 2011) further establishes that consolidation is not simple copying — memories transform during transfer, moving from detailed episodic form to abstract schematic form.

### Architectural Sketch

#### Logical Separation (No New Tables)

The dual-store is a logical distinction on existing AIAgentNote records, not a physical table split. This avoids data migration and keeps the existing retrieval, embedding, and scoping infrastructure intact.

**Hot Store** (Episodic): Notes where `ConsolidationCount = 0` and `Status = 'Active'`. These are raw extractions from recent conversations, retaining full episodic context (conversation ID, turn context, temporal details).

**Cold Store** (Semantic): Notes where `ConsolidationCount >= 1` and `Status = 'Active'`. These are consolidated, abstracted knowledge structures — the output of the consolidation pipeline.

#### Schema-Congruency Gate

A new step inserted between extraction and consolidation scheduling:

1. After a note is extracted, compute its embedding.
2. Query the cold store for the top-3 nearest neighbors by cosine similarity.
3. If the best match exceeds a congruency threshold (default: 0.85), the new note is **schema-congruent** — it aligns with existing consolidated knowledge.
4. Schema-congruent notes are flagged with `SchemaCongruent = true` and become eligible for accelerated consolidation (48-hour window instead of waiting for the daily/event-driven gate).
5. Notes below the congruency threshold are **schema-novel** — they stay in the hot store for a longer observation period (default: 7 days minimum) before consolidation eligibility.

New field on AIAgentNote:

| Field | Type | Purpose |
|-------|------|---------|
| SchemaCongruent | bit | Whether the note aligns with existing consolidated knowledge |

#### Retrieval Strategy per Store

The `AgentContextInjector` is modified to draw from both stores with distinct strategies:

- **Hot store retrieval**: Prioritize recency. Use a recency-weighted vector search (cosine similarity * recency_decay). Inject up to 40% of MaxNotesToInject budget from hot store.
- **Cold store retrieval**: Prioritize relevance. Use pure cosine similarity ranking. Inject up to 60% of MaxNotesToInject budget from cold store.
- **Budget allocation is adaptive**: If the hot store has fewer qualifying notes than its 40% budget, the surplus goes to cold store, and vice versa.

When both stores return a note on the same topic, cold store (consolidated) takes precedence unless the hot store note is less than 24 hours old — in which case the hot note is injected with a `[Recent observation — may supersede consolidated knowledge]` annotation.

#### Data Flow

```
Conversation -> Extraction -> New Note (Hot Store, ConsolidationCount=0)
                                |
                          Schema Congruency Check
                               / \
                    Congruent    Novel
                      |            |
              Fast-track (48h)   Standard (7d+ wait)
                      \          /
                   Consolidation Pipeline
                          |
                   Consolidated Note (Cold Store, ConsolidationCount=1+)
```

### Phase 1 Prerequisites

- **ConsolidationCount field** (FR-080): Already tracked on every note. The logical hot/cold boundary is `ConsolidationCount = 0` vs `>= 1`.
- **DerivedFromNoteIDs bidirectional links** (FR-084): Enable traversal between hot store sources and cold store consolidated notes, supporting provenance queries like "show me the raw observations behind this consolidated fact."
- **EmbeddingVector**: Existing embeddings power the schema-congruency check with zero additional embedding computation.
- **Composite ImportanceScore** (FR-100): Enables importance-weighted retrieval budget allocation across stores.

### Estimated Scope

- 1 new field on AIAgentNote (SchemaCongruent)
- Schema-congruency gate logic (~150 LOC)
- Modified retrieval in AgentContextInjector (~200 LOC, refactor existing retrieval path)
- Accelerated consolidation scheduling for congruent notes
- **Estimate**: 2 weeks engineering

---

## 3. Reconsolidation Engine

### Research Rationale

Nader, Schafe & LeDoux (2000) demonstrated that when consolidated memories are reactivated through retrieval, they enter a labile state lasting 4-6 hours requiring re-stabilization. During this window, memories can be updated, strengthened, or weakened. Reconsolidation is triggered by prediction error — a mismatch between what the memory predicted and what was experienced.

Stemerding et al. (2022) established boundary conditions: there is a Goldilocks zone for memory updating. Too little prediction error triggers no destabilization (the memory stays unchanged). Optimal error triggers reconsolidation (the memory updates). Too much error triggers new learning (a new memory is created rather than modifying the old one). Stronger, older, and more frequently confirmed memories are more resistant to modification.

Elastic Weight Consolidation (EWC) from continual learning research provides the computational analog. By selectively protecting important parameters (analogous to high-importance notes), EWC achieves a 45.7% reduction in catastrophic forgetting on knowledge graph tasks. The Fisher Information matrix in EWC maps directly to ImportanceScore in our system — high-importance notes require proportionally stronger evidence to modify.

### Architectural Sketch

#### Modifying AgentContextInjector for Read-Write Retrieval

Currently, `AgentContextInjector.getNotesForInjection()` is purely read-only: retrieve notes, format them, inject into context. Reconsolidation adds a post-interaction feedback loop:

1. **Pre-interaction**: Notes are retrieved and injected as usual. Each injected note ID is recorded in the agent run step.
2. **Post-interaction**: After the agent completes its turn, a lightweight reconsolidation check runs on all injected notes.
3. **Discrepancy detection**: For each injected note, compute cosine similarity between the note's embedding and the embedding of the agent's response. If the response covers the same topic but with different content, this is prediction error.

#### Graduated Response

The discrepancy magnitude determines the response:

| Discrepancy Level | Detection | Response |
|---|---|---|
| **Small** (cosine sim > 0.85 to response topic segment) | Response is consistent with the note | **Reinforce**: Increment AccessCount, refresh LastAccessedAt, apply small ImportanceScore boost (+0.1) |
| **Moderate** (cosine sim 0.60-0.85, same topic, new details) | Response adds information the note lacks | **Update**: Merge new details into note content. Increment ConsolidationCount. Preserve original core assertions. Log as reconsolidation event. |
| **Large** (cosine sim < 0.60, or explicit contradiction detected) | Response contradicts the note | **New entry**: Create a new note from the response content. Flag the original for contradiction detection in the next maintenance cycle. Do NOT auto-revoke — let the standard contradiction pipeline handle it. |

#### Importance-Weighted Update Resistance (EWC-Inspired)

Not all notes should be equally easy to modify. The update threshold scales with importance:

```
effective_threshold = base_threshold * (1 + importance_weight * (ImportanceScore / 10))
```

Where `importance_weight` defaults to 0.5. A note with ImportanceScore 9.0 requires 1.45x the base evidence to trigger a moderate update, while a note with ImportanceScore 2.0 requires only 1.1x. This prevents high-confidence, well-established facts from being overwritten by a single interaction while keeping low-importance notes responsive to change.

#### Temporal Lability Window

Reconsolidation only operates within a time window after retrieval. Based on Nader et al.'s 4-6 hour biological window, the system applies a configurable lability period (default: 1 hour for AI agents, shorter than biological since agent interactions are faster than human memory processes).

- Notes retrieved more than `labilityWindowMinutes` ago are immune to reconsolidation until next retrieval.
- The window starts at the moment of injection, not at the moment the agent responds.

#### New Fields

| Entity | Field | Type | Purpose |
|--------|-------|------|---------|
| AIAgentNote | LastReconsolidatedAt | datetimeoffset | When the note was last modified by reconsolidation |
| AIAgentNote | ReconsolidationCount | int | How many times this note has been updated via reconsolidation (separate from consolidation) |

#### Data Flow

```
Agent Run Start
  |
  v
AgentContextInjector retrieves notes -> records injected note IDs
  |
  v
Agent processes user message, generates response
  |
  v
Reconsolidation Check (async, non-blocking to response):
  For each injected note:
    1. Compute topic overlap with response
    2. If overlap exists, compute discrepancy magnitude
    3. Apply importance-weighted threshold
    4. Execute graduated response (reinforce / update / new entry)
    5. Log reconsolidation event as AgentRunStep
```

### Phase 1 Prerequisites

- **ImportanceScore** (FR-100, FR-101): Provides the importance-weighted update resistance signal. Without composite importance, the system cannot differentiate between notes that should resist modification and those that should be responsive.
- **ConsolidationCount** (FR-080): Tracks modification depth. Reconsolidation increments this, maintaining the generation counter for drift prevention. Notes at the generation cap (FR-081) are immune to reconsolidation updates.
- **EmbeddingVector**: Required for discrepancy detection between injected notes and agent responses.
- **AgentRunStep observability** (User Story 5): Reconsolidation events must be logged as run steps for auditability.

### Estimated Scope

- 2 new fields on AIAgentNote
- Post-interaction hook in AgentContextInjector (~300 LOC)
- Discrepancy detection logic with topic segmentation (~200 LOC)
- Graduated response handler (~150 LOC)
- Importance-weighted threshold computation (~50 LOC)
- Integration with existing contradiction detection for "large discrepancy" cases
- **Estimate**: 3 weeks engineering

---

## 4. Metamemory Monitor

### Research Rationale

Nelson & Narens (1990) established the metamemory framework distinguishing an object-level (the memories themselves) from a meta-level (the system's assessment of those memories). Information flows upward through monitoring ("how good is this memory?") and downward through control ("what should I do about it?"). Critically, Nelson & Narens note that "the object-level has no model of the meta-level" — architecturally, the monitoring system must be separate from the memory store itself.

The Zeigarnik effect (1927) demonstrates that incomplete tasks are recalled approximately 90% better than completed tasks. While a 2025 meta-analysis found the memory effect less robust than originally claimed, the related Ovsiankina effect (tendency to resume unfinished tasks) is more reliable. Task completion status should influence retrieval priority.

Current state: the Memory Manager is both object-level (storing and managing memories) and implicitly meta-level (making consolidation decisions). There is no independent auditor assessing overall memory quality, detecting systemic issues, or identifying coverage gaps.

### Architectural Sketch

#### Separate Scheduled Agent

The Metamemory Monitor is a distinct scheduled agent (not part of the Memory Manager pipeline) that runs weekly. This separation follows Nelson & Narens' architectural prescription: the meta-level must be independent from the object-level.

**Agent Configuration**:
- Type: System maintenance agent
- Schedule: Weekly (configurable, default Sunday 02:00 UTC)
- Scope: Runs once globally, iterates over all agents with active memory

#### Audit Dimensions

The monitor computes and logs metrics across four dimensions per agent:

**1. Coverage Gap Detection**
- Retrieve all active notes for an agent, grouped by NoteType.
- Compute embedding centroid per NoteType cluster.
- Identify large empty regions in the embedding space (areas with no notes but high query density from AccessCount patterns).
- Output: List of topic areas where the agent has been queried but has no stored knowledge.
- Action: Generate `[Coverage Gap]` advisory notes suggesting the agent may need information in these areas.

**2. Confidence Distribution Analysis**
- Histogram of ImportanceScore across all active notes.
- Flag agents with bimodal distributions (many very high and very low scores, few middle) — this suggests inconsistent extraction quality.
- Flag agents where >30% of notes have ImportanceScore < 3.0 — accumulated low-value noise.
- Action: Recommend bulk archival of low-importance clusters, or adjustment of extraction confidence thresholds.

**3. Contradiction Density Monitoring**
- Count notes with active contradiction flags per agent.
- Compute contradiction density = contradicted_notes / total_active_notes.
- Threshold: If density > 5%, flag for immediate deep contradiction resolution.
- Track contradiction density over time to detect trends (improving or degrading memory quality).
- Action: Trigger an out-of-cycle contradiction detection run for agents exceeding the density threshold.

**4. Staleness Distribution**
- Compute the Ebbinghaus decay score for all active notes.
- Identify notes in the "zombie zone" — above the archival threshold but below useful retrieval scores. These consume storage and retrieval budget without contributing value.
- Compute median age of active notes. Agents with median age > 60 days may have stale memory profiles.
- Action: Recommend decay threshold adjustment or trigger targeted re-evaluation.

#### Zeigarnik Effect: Task Completion Tracking

New field on AIAgentNote:

| Field | Type | Purpose |
|-------|------|---------|
| TaskStatus | nvarchar(20) | `null` (not a task), `Open`, `InProgress`, `Completed`, `Abandoned` |

Notes extracted with task-like content (detected by the extraction prompt: "TODO", "need to", "should investigate", action items) are tagged with `TaskStatus = 'Open'`.

Retrieval priority boost for open tasks:

```
retrieval_score = base_score * (TaskStatus == 'Open' ? 1.3 : 1.0)
```

The metamemory monitor also reports on open task age distribution and surfaces tasks that have been open for >30 days without access — these may need explicit resolution or abandonment.

#### Audit Output

The monitor produces an `AIAgentMemoryAudit` record per agent per run:

| Field | Type | Purpose |
|-------|------|---------|
| ID | uniqueidentifier | PK |
| AgentID | uniqueidentifier | FK |
| AuditDate | datetimeoffset | When the audit ran |
| TotalActiveNotes | int | Count of active notes |
| CoverageGaps | nvarchar(max) | JSON array of identified gap topics |
| ConfidenceDistribution | nvarchar(max) | JSON histogram of ImportanceScore |
| ContradictionDensity | decimal(5,4) | Ratio of contradicted to total notes |
| StalenessMedianDays | int | Median note age in days |
| ZombieNoteCount | int | Notes above archive threshold but below usefulness |
| OpenTaskCount | int | Unresolved task notes |
| RecommendedActions | nvarchar(max) | JSON array of suggested maintenance actions |

#### Control Flow (Meta-Level -> Object-Level)

The monitor does not directly modify memories (object-level). It issues recommendations that the Memory Manager acts on in its next cycle:

- `TRIGGER_CONTRADICTION_SCAN` — forces an immediate contradiction detection pass
- `ADJUST_ARCHIVE_THRESHOLD` — suggests raising/lowering the decay archival threshold
- `FLAG_ZOMBIE_NOTES` — marks specific notes for manual review or accelerated decay
- `COVERAGE_ADVISORY` — creates advisory notes for gap areas

These recommendations are stored in `RecommendedActions` and consumed by the Memory Manager's next run via a "check for metamemory directives" step at the start of the maintenance pipeline.

### Phase 1 Prerequisites

- **AgentRunStep observability** (User Story 5): The metamemory monitor needs the run step audit trail to compute metrics like extraction frequency, consolidation success rate, and contradiction detection accuracy.
- **ImportanceScore** (FR-100): Powers the confidence distribution analysis. Without composite scoring, the monitor has no quality signal to aggregate.
- **Protection tiers and contradiction flags** (FR-090, FR-025): Provide the raw data for contradiction density and protection tier distribution analysis.
- **Ebbinghaus decay function** (FR-041): Enables staleness distribution computation and zombie note identification.

### Estimated Scope

- 1 new entity (AIAgentMemoryAudit)
- 1 new field on AIAgentNote (TaskStatus)
- New scheduled agent configuration
- 4 audit dimension implementations (~100-150 LOC each)
- Zeigarnik retrieval boost in AgentContextInjector (~30 LOC)
- Recommendation consumption in Memory Manager (~100 LOC)
- **Estimate**: 2-3 weeks engineering

---

## 5. Pattern Separation

### Research Rationale

Engram research (Josselyn & Tonegawa, Science 2020) establishes that the hippocampus supports two complementary operations: pattern completion (CA3 region — reconstructing full memories from partial cues) and pattern separation (dentate gyrus — making similar inputs more distinct). Current vector-based retrieval handles pattern completion well (find the most similar note to a query) but has no mechanism for pattern separation.

The risk: consolidation inherently pushes memories toward similarity. Two notes about "database performance tuning for PostgreSQL" and "database performance tuning for MySQL" may be high-similarity candidates for merging, but they contain meaningfully different information that must remain distinct. Without pattern separation, consolidation can collapse important distinctions.

Anderson's Retrieval-Induced Forgetting (1994) compounds this: selectively retrieving certain memories actively suppresses related but non-retrieved memories. If the system always returns the top-k most similar results, it systematically suppresses relevant memories that happen to rank k+1 or lower. Over time, suppressed memories decay faster (lower AccessCount, lower ImportanceScore), creating a self-reinforcing feedback loop.

### Architectural Sketch

#### Orthogonal Embedding Perturbation

When two notes are similar (cosine similarity > 0.80) but the consolidation prompt determines they should NOT be consolidated (distinct facts about different subjects), apply a controlled perturbation to push their embeddings apart in the space:

1. Compute the difference vector: `delta = embedding_A - embedding_B`
2. Normalize: `delta_norm = delta / ||delta||`
3. Add a small perturbation along the difference direction: `embedding_A' = embedding_A + epsilon * delta_norm` and `embedding_B' = embedding_B - epsilon * delta_norm`
4. `epsilon` is calibrated so the new cosine similarity drops to approximately 0.70 (below the consolidation clustering threshold of 0.60 but still above meaningful relatedness).

This is the computational analog of dentate gyrus pattern separation: making similar inputs more orthogonal to prevent interference.

#### Disambiguation Tags

New field on AIAgentNote:

| Field | Type | Purpose |
|-------|------|---------|
| DisambiguationContext | nvarchar(500) | Machine-generated context that distinguishes this note from its nearest neighbors |

When post-consolidation verification identifies notes that were preserved (not consolidated) despite high similarity, the system generates a disambiguation tag:

- Example: Two notes about "database indexing" — one for PostgreSQL, one for MySQL. Tags: `[Context: PostgreSQL-specific]` and `[Context: MySQL-specific]`.
- Tags are generated by an LLM prompt that receives the two similar-but-distinct notes and produces a minimal distinguishing phrase.
- Tags are prepended to the note content during retrieval injection, helping the agent understand why both similar notes are present.

#### Diversity-Aware Retrieval (RIF Mitigation)

Modify `AgentContextInjector` to prevent Retrieval-Induced Forgetting:

1. **Standard retrieval**: Top-k notes by relevance (unchanged).
2. **Diversity injection**: Reserve 20% of the MaxNotesToInject budget for diversity candidates. These are notes that:
   - Are topically related to the query (cosine similarity > 0.40)
   - Were NOT in the top-k (would have been suppressed)
   - Have not been accessed in >14 days (at risk of forgetting)
   - Are selected using Maximal Marginal Relevance (MMR): maximize relevance to query while minimizing redundancy with already-selected notes

MMR formula: `MMR(d) = lambda * sim(d, query) - (1-lambda) * max(sim(d, selected))` where lambda = 0.7 balances relevance and diversity.

3. **AccessCount refresh**: All diversity-injected notes get their AccessCount incremented and LastAccessedAt refreshed, preventing the suppression feedback loop.

#### Consolidation-Time Separation

During the consolidation pipeline (Phase 1), add a pre-consolidation separation check:

1. For each cluster identified by the consolidation clustering step, run a lightweight LLM prompt: "Are all items in this cluster about the same specific topic, or do some cover distinct subjects?"
2. If the prompt identifies distinct sub-topics, split the cluster along those lines before consolidation.
3. Apply orthogonal embedding perturbation to the split groups to prevent re-clustering in the next cycle.

This prevents "creeping merge" where notes about related but distinct topics are gradually pulled together over multiple consolidation cycles.

### Phase 1 Prerequisites

- **Post-consolidation verification** (FR-082): The verification step that checks for missing entities also identifies cases where consolidation may have incorrectly merged distinct content. This is the trigger for retroactive pattern separation.
- **Outlier auto-protection** (FR-094, cluster size enforcement FR-011): Phase 1's outlier detection (notes with uniqueness above 95th percentile) is the first-pass pattern separation mechanism. Phase 2 extends this from binary (protect/don't protect) to continuous (perturb embeddings to maintain distinctness).
- **Cluster size cap** (FR-017): Limiting clusters to 7 items and splitting larger ones is the initial structural prevention of over-consolidation. Pattern separation makes this splitting semantically aware rather than purely threshold-based.

### Estimated Scope

- 1 new field on AIAgentNote (DisambiguationContext)
- Orthogonal embedding perturbation logic (~100 LOC)
- Disambiguation tag generation prompt and pipeline (~150 LOC)
- MMR-based diversity retrieval in AgentContextInjector (~200 LOC)
- Pre-consolidation separation check prompt and cluster splitting (~150 LOC)
- **Estimate**: 2-3 weeks engineering

---

## 6. Adaptive Thresholds

### Research Rationale

Phase 1 uses fixed thresholds: 0.60 cosine similarity for consolidation clustering, 0.70 for contradiction pre-filtering. Research consistently shows fixed thresholds are suboptimal. The Merge-Filter Representative-based Clustering framework (2021) demonstrates that variable and function-based thresholds outperform constant thresholds, particularly when cluster sizes and data characteristics vary.

The 0.60 threshold is reasonable but embedding-model-dependent — a threshold calibrated for `all-MiniLM-L6-v2` does not transfer to `text-embedding-3-large`. NVIDIA's NeMo Curator SemDeDup explicitly recommends per-model calibration rather than fixed values.

HDBSCAN (Hierarchical Density-Based Spatial Clustering of Applications with Noise) eliminates fixed distance thresholds entirely by finding natural density-based clusters. It automatically identifies outliers (noise points) without requiring an explicit outlier threshold, and produces a hierarchy of clusters at different density levels that can be cut at the optimal stability point.

### Architectural Sketch

#### HDBSCAN Replacement for Fixed-Threshold Clustering

Replace the current "all notes within 0.60 cosine similarity" clustering with HDBSCAN:

**Parameters**:
- `min_cluster_size = 3` (matches Phase 1 minimum, enforces Miller's lower bound)
- `min_samples = 2` (minimum neighborhood density)
- `metric = 'cosine'` (operates directly on embedding vectors)
- `cluster_selection_method = 'eom'` (Excess of Mass — selects the most persistent clusters)

**Benefits over fixed threshold**:
- Automatically adapts to the embedding model's similarity distribution
- Handles non-uniform density (some topics have many notes clustered tightly, others are spread)
- Explicitly identifies noise points (outliers) that should skip consolidation — replaces the 95th-percentile uniqueness heuristic from Phase 1 with a principled statistical method
- Produces cluster stability scores that indicate consolidation confidence

**Integration**:
- HDBSCAN runs on the full embedding matrix of active, Standard/Ephemeral-tier notes
- Clusters with stability < 0.5 are left unconsolidated (unstable groupings)
- Clusters exceeding `maxClusterSize` (7) are split using HDBSCAN's hierarchy — cut at a higher density level to produce sub-clusters
- Noise points are auto-flagged for the outlier protection mechanism

#### Per-Model Threshold Calibration (SemDeDup-Inspired)

For operations that still require a threshold (contradiction pre-filtering), implement per-model calibration:

1. **Calibration dataset**: On first use of a new embedding model, compute pairwise cosine similarities for a sample of 500 note pairs manually labeled as "same topic," "related topic," and "different topic."
2. **Distribution fitting**: Fit the similarity distributions for each category. The contradiction pre-filter threshold should be set at the intersection of "same topic" and "related topic" distributions (typically the point of equal error rate).
3. **Storage**: Calibrated thresholds are stored in a new config entity:

| Entity: AIAgentMemoryThresholdConfig |
|---|
| ID: uniqueidentifier |
| EmbeddingModelID: uniqueidentifier (FK to AI Models) |
| ConsolidationThreshold: decimal(4,3) |
| ContradictionThreshold: decimal(4,3) |
| SameTopicMeanSimilarity: decimal(4,3) |
| SameTopicStdDev: decimal(4,3) |
| CalibratedAt: datetimeoffset |
| SampleSize: int |

4. **Automatic recalibration**: When the embedding model changes (detected by model ID change in agent config), trigger recalibration using existing note pairs as the calibration set.

#### Quality Evaluation Loop (ROUGE/BERTScore)

Phase 1's post-consolidation verification checks for named entity and numeric value preservation. Phase 2 adds continuous quality scoring:

1. **After each consolidation**, compute:
   - **ROUGE-L**: Longest common subsequence between consolidated note and source notes. Measures content overlap. Target: > 0.60.
   - **BERTScore**: Semantic similarity between consolidated and source using contextual embeddings. Measures meaning preservation. Target: > 0.85.
   - **Entity recall**: Fraction of named entities in sources that appear in consolidated output (Phase 1's verification, now quantified).

2. **Quality feedback loop**:
   - If ROUGE-L < 0.50 or BERTScore < 0.80, flag the consolidation as low-quality.
   - Track quality metrics per cluster size. If quality degrades above a certain cluster size for this agent, automatically reduce `maxClusterSize` for that agent.
   - Track quality metrics per consolidation generation. If generation-2 consolidations consistently score lower than generation-1, reduce `maxConsolidationCount` for that agent.

3. **Storage**: Quality metrics are recorded per consolidation event:

| Entity: AIAgentConsolidationQuality |
|---|
| ID: uniqueidentifier |
| ConsolidatedNoteID: uniqueidentifier (FK to AIAgentNote) |
| SourceNoteCount: int |
| RougeL: decimal(4,3) |
| BertScore: decimal(4,3) |
| EntityRecall: decimal(4,3) |
| ConsolidationGeneration: int |
| QualityVerdict: nvarchar(20) (`Pass`, `Warning`, `Fail`) |
| MeasuredAt: datetimeoffset |

This creates a data-driven feedback loop where consolidation parameters self-tune based on measured quality outcomes rather than relying on fixed configuration.

### Phase 1 Prerequisites

- **Cluster size enforcement** (FR-011, FR-017): Phase 1's min/max cluster size constraints establish the baseline that adaptive thresholds will replace and refine. The fixed thresholds serve as initial calibration points.
- **Post-consolidation verification** (FR-082, FR-085): The verification step provides the seed for the quality evaluation loop. Phase 2 evolves binary verification (pass/fail) into continuous quality scoring (ROUGE/BERTScore).
- **Embedding infrastructure**: HDBSCAN operates on the same embedding vectors already computed for each note. No additional embedding computation required.
- **Consolidation generation counter** (FR-080): Enables per-generation quality tracking, which is the signal for automatic `maxConsolidationCount` adjustment.

### Estimated Scope

- HDBSCAN integration (Python library via child process or WASM port, ~200 LOC wrapper)
- Per-model calibration pipeline (~300 LOC)
- 2 new entities (AIAgentMemoryThresholdConfig, AIAgentConsolidationQuality)
- ROUGE-L and BERTScore computation (~150 LOC, leverage existing embedding infrastructure for BERTScore)
- Quality feedback loop with automatic parameter adjustment (~200 LOC)
- Migration of existing fixed-threshold clustering to HDBSCAN
- **Estimate**: 3 weeks engineering

---

## Implementation Ordering

The six enhancements have the following dependency structure:

| Enhancement | Depends On | Enables |
|---|---|---|
| 2. Dual-Store | None (uses Phase 1 ConsolidationCount) | 3. Reconsolidation (store-aware updates) |
| 6. Adaptive Thresholds | None (replaces Phase 1 fixed thresholds) | 1. Knowledge Graph (graph-aware clustering) |
| 1. Knowledge Graph | 6. Adaptive Thresholds (calibrated similarity) | 5. Pattern Separation (graph-based distinction) |
| 3. Reconsolidation | 2. Dual-Store (store-aware update routing) | 4. Metamemory (reconsolidation metrics) |
| 5. Pattern Separation | 1. Knowledge Graph (structural distinction) | 4. Metamemory (separation quality metrics) |
| 4. Metamemory Monitor | 3, 5 (needs reconsolidation and separation data) | All (quality feedback loop) |

**Recommended implementation order**:
1. Dual-Store Architecture (2 weeks) — lowest risk, highest immediate retrieval improvement
2. Adaptive Thresholds (3 weeks) — removes fixed-threshold technical debt
3. Knowledge Graph Layer (3-4 weeks) — enables structural contradiction detection
4. Reconsolidation Engine (3 weeks) — requires dual-store
5. Pattern Separation (2-3 weeks) — requires knowledge graph
6. Metamemory Monitor (2-3 weeks) — needs data from all other systems

**Total estimated engineering**: 15-19 weeks for all six enhancements.
