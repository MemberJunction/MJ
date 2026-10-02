---
"@memberjunction/ai-reranker": minor
---

Reranking now goes through a new `AIRerankerRunner`, which picks a reranker model from the new `Default Rerank` prompt's bindings (or the model the caller pins), fails over between candidates, and writes an `MJ: AI Prompt Runs` row for every call. `RerankerService.RerankNotes` uses it, so agent memory reranking now appears in AI run history.
