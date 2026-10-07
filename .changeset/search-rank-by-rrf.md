---
"@memberjunction/search-engine": minor
"@memberjunction/ng-search": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ai-agents": patch
---

Search now ranks multi-source results by Reciprocal Rank Fusion end to end, and applies `MinScore` before fusion.

- **Order:** `SearchFusion.Deduplicate` used to raise each fused score to the max raw `ScoreBreakdown` value and re-sort, which threw away the RRF order (and a reranker's). An exact keyword match, such as a person's full name, ranked below every semantic near-miss. The RRF order is now kept.
- **`Score`:** the RRF score divided by its maximum (Σ weights of the lanes that returned results / (k + 1), k = 60), in [0, 1]. 1.0 means every such lane ranked it first. It is rank-based, not a confidence. Each provider's raw score stays in `ScoreBreakdown`.
- **Identity:** fusion keys results by `EntityName` + `RecordID` (integer IDs no longer merge across entities) and counts a record once per lane, so `Score` stays within [0, 1].
- **`MinScore`:** a floor on the semantic (vector) lane's own similarity, applied before fusion and to streamed per-provider results. Keyword, full-text, tag and storage hits have no numeric floor, and the fused `Score` is no longer compared to `MinScore`.
- **Explorer:** the search page's relevance slider and the search-bar dropdown's relevance filter now judge semantic similarity only (`PassesSemanticFloor`). Filtering on the fused score hid most results when three or more lanes returned hits.
- **Descriptions:** the `MinScore` parameter of the Search and Scoped Search actions, the `Search.DefaultMinScore` setting, the RAG guide and the agent `filterByScore` tool now describe the new meaning. These are metadata changes, so the changeset is `minor`.
