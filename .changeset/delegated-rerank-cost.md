---
"@memberjunction/ai-reranker": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai": patch
---

A rerank answered by `LLMReranker` now carries its chat model's cost: the chat prompt's run is a child of the rerank's run, and its cost is recorded as the rerank run's `DescendantCost` and `TotalCost`. `RerankResponse` gains an optional `Usage`, which a reranker driver sets when it knows its call's tokens and cost.
