---
"@memberjunction/db-auto-doc": patch
"@memberjunction/cli": patch
---

Add incremental schema-evolution analysis (`db-auto-doc analyze --incremental <state.json>`, `mj dbdoc analyze --incremental <state.json>`, and `DBAutoDocAPI.AnalyzeIncremental`) to update existing DBAutoDoc runs when database schemas change without re-running unaffected tables.

- **Catalog-aware Schema Diff & Merge (`SchemaDiffer`, `IncrementalStateMerger`)**: Diffs freshly introspected schemas and indexes against a baseline `state.json` while distinguishing catalog constraints from AI-discovered soft keys, pruning stale PK/FK/query/cache artifacts, and delta-sampling only new, modified, or newly populated columns.
- **Bidirectional Incremental Relationship Discovery (`DiscoveryEngine.DiscoverIncremental`, `FKDetector`)**: Decomposes candidate discovery into surviving `(S_old x T_old)` relationships, `(S_delta x T)` for new/modified/orphaned source columns, and `(S_old x T_delta)` so unchanged tables automatically discover incoming FKs to newly added or newly keyed tables; deduplicates multi-pattern target matches in `FKDetector` and seeds `ColumnStatsCache` from schema statistics.
- **Affected-Subgraph Descriptions, Backpropagation & Scoped Pruning (`IncrementalAnalysisTracker`, `AnalysisEngine`)**: Runs the existing topological level pass only over added, modified, and relationship-affected tables, propagating material parent description changes downward along `dependents` and child insights upward via `BackpropagationEngine`, while scoping two-pass PK/FK pruning to tables with changed candidates.
- **Incremental Organic Keys (`OrganicKeyCache`, `SemanticPhase`)**: Persists SHA-256 fingerprinted per-table normalizations and embeddings in `OrganicKeyDetectionPhase.CachedNormalizations` so unchanged tables reuse normalizations and vectors with zero LLM/embedding calls while clustering globally across unchanged and modified columns.
