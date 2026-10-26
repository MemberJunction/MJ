---
"@memberjunction/ai-cohere": minor
"@memberjunction/ai-reranker": minor
"@memberjunction/search-engine": minor
"@memberjunction/ng-core-entity-forms": patch
---

Add Cohere Rerank 5 (`rerank-v5.0-pro` and `rerank-v5.0-fast`) model metadata, `Default Rerank` prompt bindings, and Context Focus (`relevant_spans` via `/v2/rerank`) support across `@memberjunction/ai-cohere` and `@memberjunction/search-engine`. Fix `CohereReranker` to pass raw queries without instruction wrapping (required by Rerank 5's calibrated cross-encoder) and remove debug console logging. Update Sage and Chief of Staff agent memory `RerankerConfiguration` to use `rerank-v5.0-fast` with calibrated relevance threshold (`0.1`).
