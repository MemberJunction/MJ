---
'@memberjunction/ai-prompts': patch
'@memberjunction/tag-engine': patch
'@memberjunction/ai-vector-dupe': patch
'@memberjunction/ai-vector-sync': patch
'@memberjunction/content-autotagging': patch
'@memberjunction/search-engine': patch
---

Introduce `AIEmbeddingRunner` extending `BaseModelRunner` with `RequiredModelType = 'Embeddings'`.
- Implement credential resolution, failover across candidate models/vendors, retry handling, and `MJAIPromptRun` persistence.
- Deprecate `AIModelRunner.RunEmbedding` and delegate transparently to `AIEmbeddingRunner`.
- Migrate embedding call sites in `@memberjunction/tag-engine`, `@memberjunction/ai-vector-dupe`, `@memberjunction/ai-vector-sync`, `@memberjunction/content-autotagging`, and `@memberjunction/search-engine` to use `AIEmbeddingRunner`.
- `AIEmbeddingRunner` runs a driver that needs no API key (`LocalEmbedding`, `OllamaEmbedding`) with no key configured, and follows the prompt's `FailoverStrategy` (`SameModelDifferentVendor` never switches models).
- With no Embedding prompt, the runner embeds under an unsaved stand-in and writes no run row. `EmbeddingRunParams.SkipRunRecord` skips the row on demand.
- `TagEngine` embeds tags, queries and new tags with one model (the Tag Semantic Matching prompt's, else the smallest) and persists that ID.
- Vector search keys its query-embedding cache by model and dimension, not by driver.
