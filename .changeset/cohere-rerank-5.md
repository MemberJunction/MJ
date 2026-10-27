---
"@memberjunction/ai-cohere": minor
"@memberjunction/ai-reranker": minor
"@memberjunction/search-engine": minor
"@memberjunction/ng-core-entity-forms": patch
---

Add Cohere Rerank 5 (`rerank-v5.0-pro`, `rerank-v5.0-fast`) and its Context Focus spans.

- `@memberjunction/ai-cohere`: `CohereReranker` always calls Cohere's `/v2/rerank`, sends the query as written for every Cohere model (the instruction wrapper is gone; Rerank 5 does not take relevance instructions), and defaults to `rerank-v5.0-fast`. The `RelevantSpans` option (`true` or `{ Threshold, MaxSpans }`) asks for Context Focus spans, returned on `document.metadata.RelevantSpans` as `CohereRelevantSpan[]` with text sliced by Unicode code points, as Cohere counts offsets.
- `@memberjunction/search-engine`: `CohereReRanker` uses that `CohereReranker` through the ClassFactory instead of its own Cohere client, and no longer declares `cohere-ai`. It defaults to `rerank-v5.0-fast`; scope config `relevantSpans` sets `SearchResultItem.RelevantSpans` and, unless `focusSnippet` is false, narrows `Snippet` to the spans. `minRelevanceThreshold` drops weak results but never empties the list.
- Metadata: Rerank 5 models, with `Default Rerank` preferring `rerank-v5.0-fast`, so callers that don't pin a model, and search scopes with no `model`, switch to it. Sage and Chief of Staff memory reranking moves to `rerank-v5.0-fast` with `minRelevanceThreshold` 0.02.
