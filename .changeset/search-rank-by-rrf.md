---
"@memberjunction/search-engine": patch
---

Search now ranks multi-source results by Reciprocal Rank Fusion end to end, and applies `MinScore` before fusion.

- **Order:** `SearchFusion.Deduplicate` used to raise each fused score to the max raw `ScoreBreakdown` value and re-sort, which threw away the RRF order (and a reranker's). An exact keyword match, such as a person's full name, ranked below every semantic near-miss. The RRF order is now kept.
- **`Score`:** the RRF score divided by its maximum (Σ lane weights / (k + 1), k = 60), in [0, 1]. 1.0 means every lane that returned results ranked it first. This applies to single-source results too. Each provider's raw score stays in `ScoreBreakdown`.
- **`MinScore`:** now a floor on the semantic (vector) lane's own similarity, applied before fusion and to streamed per-provider results. Keyword, full-text, tag and storage hits have no numeric floor, and the fused `Score` is no longer compared to `MinScore`.
