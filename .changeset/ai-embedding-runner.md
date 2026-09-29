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
