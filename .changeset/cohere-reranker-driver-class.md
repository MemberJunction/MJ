---
"@memberjunction/ai-cohere": patch
"@memberjunction/ai-reranker": patch
---

Cohere reranking works again. `CohereReranker` is registered under `CohereReranker`, the driver class every Cohere reranker model-vendor row carries, as well as `CohereLLM`; before, the ClassFactory fell back to a bare `BaseReranker` and every Cohere rerank failed. Its docs now name the right legacy environment variable, `AI_VENDOR_API_KEY__COHERERERANKER`. `RerankerService.GetReranker` is deprecated in favour of `AIRerankerRunner`.
