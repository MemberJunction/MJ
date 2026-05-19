# Spec Change Summary: spec.md → updated_spec.md

What changed, why, and where to look for details.

## Changes at a Glance

| Area | [spec.md](spec.md) (original) | [updated_spec.md](updated_spec.md) (proposed) | Why ([research.md](research.md)) |
|------|-------------------|---------------------------|----------------------------------|
| **Re-summarization** | No limit on how many times a note can be re-consolidated | Capped at 3 generations; reverts to original sources beyond that | 25.5% semantic drift after 5 iterations ([research.md § Consolidation Drift](research.md)) |
| **Contradiction detection** | Vector similarity (0.70 threshold) + LLM judgment ([spec.md § Phase 2](spec.md)) | Adds entity-attribute triple extraction as intermediate step ([updated_spec.md § Principle 2](updated_spec.md)) | 94.8% accuracy vs ~70% for vector-only ([research.md § Structural Contradiction](research.md)) |
| **High-value note conflicts** | Newer or higher-access note always wins ([spec.md § FR-020–024](spec.md)) | High-access notes (>10 accesses) resist auto-revocation; both preserved with contradiction flag ([updated_spec.md § US2](updated_spec.md)) | Prevents silent loss of well-validated knowledge ([research.md § Importance Weighting](research.md)) |
| **Retention policy** | Fixed cutoffs: 90 days for notes, 180 days for examples ([spec.md § FR-040–044](spec.md)) | Ebbinghaus decay function — importance slows decay, trivia fades naturally ([updated_spec.md § US4](updated_spec.md)) | Eliminates arbitrary deletion of important but infrequent memories ([research.md § Adaptive Lifecycle](research.md)) |
| **Importance scoring** | Raw AccessCount ([spec.md § FR-010](spec.md)) | 7-signal composite: recency, LLM importance, relevance, uniqueness, correction boost, goal alignment, user marking ([updated_spec.md § US7](updated_spec.md)) | AccessCount alone over-weights frequency, ignores quality ([research.md § Composite Scoring](research.md)) |
| **Memory protection** | None — all notes treated equally ([spec.md](spec.md)) | 4 tiers: Immutable, Protected, Standard, Ephemeral with auto-promotion rules ([updated_spec.md § US6](updated_spec.md)) | Rare high-information memories get deleted under uniform policies ([research.md § Tiered Protection](research.md)) |
| **Consolidation triggers** | Daily schedule only ([spec.md § FR-001](spec.md)) | Daily + event-driven (100+ new notes, high importance accumulation, contradiction density) ([updated_spec.md § US1](updated_spec.md)) | Prevents unbounded accumulation between cycles ([research.md § Hybrid Scheduling](research.md)) |
| **Cluster sizing** | minClusterSize=3, no max ([spec.md § FR-012](spec.md)) | Min 3, max 7; auto-splits larger clusters by raising similarity threshold ([updated_spec.md § US1](updated_spec.md)) | Quality degrades above 7 items per cluster — Miller's 7±2 ([research.md § Cluster Caps](research.md)) |
| **Post-consolidation checks** | None ([spec.md](spec.md)) | Named entity/number/date preservation verification; warnings if entities lost ([updated_spec.md § Principle 1](updated_spec.md)) | 75% of multi-doc summary content can be hallucinated ([research.md § Verification](research.md)) |
| **Source preservation** | Sources revoked, linked via ConsolidatedIntoNoteID ([spec.md § FR-050](spec.md)) | Same, plus SHA-256 content hash on originals and bidirectional DerivedFromNoteIDs for full rollback ([updated_spec.md § Principle 4](updated_spec.md)) | Enables programmatic drift detection and provenance audit ([research.md § Provenance](research.md)) |
| **Schema additions** | ConsolidatedIntoNoteID (FK) ([spec.md § FR-050](spec.md)) | Adds: ConsolidationCount, DerivedFromNoteIDs, ProtectionTier, ContentHash, ImportanceScore fields ([updated_spec.md § Schema](updated_spec.md)) | Forward-compatible with Phase 2 dual-store architecture ([research.md § Architectural Vision](research.md)) |

## What's Unchanged

The core 4-phase pipeline (Consolidation → Contradiction → Stale Pruning → Archival), multi-tenant scoping, vector-based clustering at 0.60 threshold, AgentRunStep observability, and Cleanup Agent deprecation are all preserved as-is from [spec.md](spec.md).

## Phase 2 (New Section)

[updated_spec.md](updated_spec.md) adds an architectural vision for Phase 2 — dual-store memory, reconsolidation engine, metamemory monitoring — that the proposed schema changes are designed to support. No Phase 2 implementation is included; it's there so the schema decisions make sense.
