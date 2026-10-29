---
"@memberjunction/ai": minor
"@memberjunction/ai-local-embeddings": minor
"@memberjunction/ai-cohere": minor
"@memberjunction/ai-bedrock": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/tag-engine": minor
"@memberjunction/search-engine": minor
"@memberjunction/core": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/core-actions": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/interactive-component-types": minor
"@memberjunction/react-runtime": minor
"@memberjunction/react-test-harness": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Local embeddings move to `@huggingface/transformers` 4.3.1 and can switch models safely; EmbeddingGemma 2 is available as an opt-in model.

- `MJ_DEFAULT_LOCAL_EMBEDDING_MODEL` names the local model every process embeds with (default: the highest-PowerRank active local model). Agent note, example, tag and query indexes leave out vectors from other models, a save re-embeds such a row, and the new "Re-embed Local Vectors" action moves them all.
- Embedding calls take an optional `inputType` (`'query' | 'document'`); Cohere and Bedrock map it natively, and catalog prefixes come from `ModelConfiguration.Embedding`. `LocalEmbedding` batches, honors `dimensions`, truncates to the catalog's `MaxInputTokens`, and sizes ONNX Runtime's thread pool to the CPUs the process may use (in a 2-CPU container, queries were about 10× faster).
- A failed embed now returns `null` from `AIEngine.EmbedText` instead of an empty vector.

**Upgrade notes:**
- After upgrading, run `mj ai actions run -n "Re-embed Local Vectors" --param "Force=true"`, then restart the MJ server processes. The new runtime changes all-mpnet-base-v2's vectors (about 0.95 cosine on Linux x64) under the same model ID, and long texts are now truncated at `MaxInputTokens` (256 tokens for all-MiniLM-L6-v2, matching sentence-transformers).
- A `MJ_DEFAULT_LOCAL_EMBEDDING_MODEL` that names no active local model turns local embedding off, with an error. An inactive model is no longer picked as the default.
- TagEngine embeds with the default local model whenever one exists, even if the "Tag Semantic Matching" prompt names a hosted model.
- `LocalEmbedding` honors a vector index's `Dimensions`: a value above the model's size now fails instead of being ignored.
- The GraphQL `EmbedText` mutation's `modelSize: 'medium'` now means the default local model.
- `LocalEmbedding` no longer reads the `useQuantized` / `localURL` settings or `TRANSFORMERS_LOCAL_URL`; it always loads the 8-bit weights.
