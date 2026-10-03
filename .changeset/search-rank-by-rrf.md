---
"@memberjunction/search-engine": patch
---

Search now ranks multi-source results by Reciprocal Rank Fusion end to end. `SearchFusion.Deduplicate` used to raise each fused score to the max raw `ScoreBreakdown` value and re-sort. Raw scores from different providers are on different scales, so that threw away the RRF order (and a reranker's order): an exact keyword match, such as a person's full name, ranked below every semantic near-miss. Fused scores are now mapped onto a readable 0–1 scale that preserves the RRF order, and `ScoreBreakdown` still carries each provider's raw score.
