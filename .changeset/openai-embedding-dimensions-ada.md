---
"@memberjunction/ai": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-azure": patch
"@memberjunction/ai-bedrock": patch
---

Embedding drivers no longer send `dimensions` to a model that rejects it when the requested width is the model's own, and they refuse a width the model can't produce before making the call (#5234). Entity vector sync and duplicate detection pass the vector index's `Dimensions` on every call, and MJ stamps one on every index it creates. OpenAI's text-embedding-ada-002 and Bedrock's Titan Embed Text V1 reject `dimensions`, so a call that named them with their own width was rejected, and the driver degraded that to an empty result.

- `BaseEmbeddings` has a shared rule, `DimensionsParam(model, dimensions)`, driven by a per-driver table of models (`EmbeddingModels`, of `EmbeddingModelInfo`: native width, whether the model accepts `dimensions`, and optionally the widths it supports). A model that rejects `dimensions` is sent nothing when the width is its own. A model not in the table gets the width as requested.
- A width a listed model can't produce throws `EmbeddingDimensionsError` before any API call. It carries an `InvalidRequest` / `Fatal` classification with no failover, which `ErrorAnalyzer` keeps, so `AIEmbeddingRunner` fails the call with the cause instead of making a paid call, recording "No vectors returned" as retriable and failing over.
- OpenAI lists text-embedding-3-large (up to 3072), text-embedding-3-small (up to 1536) and ada-002 (1536 only). `GetEmbeddingModels` reports `AcceptsDimensions`.
- Azure applies ada-002's width when it's called with no model name and uses its default. A named model is a deployment, which could be any model, so its width is sent as requested.
- Bedrock lists Titan Embed Text V1 (1536 only) and V2 (256, 512 or 1024). The Cohere path never sends `dimensions` and is unchanged.
- On the per-text path, a refusal is neither retried through the backoff nor degraded to an empty result. `EmbedTexts`' error contract still degrades an ordinary per-text failure, and still rethrows a cancellation; a refused width now joins the cancellation as the second exception, because degrading it is exactly what the refusal replaces.
- The OpenAI change reaches deployments whose ada-002 model or vendor row sets `APIName` to `text-embedding-ada-002`. The stock rows leave `APIName` empty, so the driver is called with no model name and uses its default, `text-embedding-3-small` (#5237).
