---
"@memberjunction/core-entities-server": patch
---

A vector index created without an explicit `Dimensions` is now provisioned at its embedding model's real width instead of 1536.

Every index created from the UI (the Config page's Create Index and the Knowledge Hub "Vector Index: Auto" path) leaves `Dimensions` null, and `MJ: AI Models` has no width column to copy from, so `MJVectorIndexEntityServer` created the provider index at a 1536 fallback whatever the model. Models that can reduce their output width (OpenAI `text-embedding-3-*`) coped, because the sync passes the index's `Dimensions` into the embedding call; a model that cannot (a 384-dimension local model) got an index that rejected every write, since Pinecone, Qdrant, SQL Server and pgvector all fix the width at create time.

Before creating the provider index, the hook now embeds one short string with the index's own model (`AIEmbeddingRunner`, model pinned, no run row written, bounded by `DIMENSION_PROBE_TIMEOUT_MS`) and uses the returned vector's length. An explicit `Dimensions` on the record still wins. When the probe cannot run or fails (no model, no user context, no credentials, provider error), the index is created at `DEFAULT_DIMENSIONS` (1536) and the reason is logged so the width can be set by hand. The width used is written back to `Dimensions` with the rest of the provider metadata, as before. Closes #4988.
