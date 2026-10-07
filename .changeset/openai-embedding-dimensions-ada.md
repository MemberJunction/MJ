---
"@memberjunction/ai-openai": patch
---

The OpenAI embedding driver no longer sends `dimensions` to `text-embedding-ada-002` when the requested width is the model's own 1536 (#5234). Entity vector sync and duplicate detection pass the vector index's `Dimensions` on every call, and MJ stamps one on every index it creates. OpenAI supports `dimensions` only on the text-embedding-3 models, so a call that named ada-002 with its own width was rejected, and the driver degraded that to an empty result.

- The driver keeps one table of its embedding models with each model's native width and whether it accepts `dimensions` (`OpenAIEmbeddingModelInfo`, returned by `GetEmbeddingModels`, which now also reports `AcceptsDimensions`).
- `dimensions` is omitted only for a model that rejects it, and only when the requested width is its native one. A reduced width on a text-embedding-3 model is still sent. A width ada-002 can't produce is still sent, so the request fails rather than returning vectors of the wrong width.
- This reaches deployments whose ada-002 model or vendor row sets `APIName` to `text-embedding-ada-002`. The stock rows leave `APIName` empty, so the driver is called with no model name and uses its default, `text-embedding-3-small`.
