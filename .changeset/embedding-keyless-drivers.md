---
'@memberjunction/ai': patch
'@memberjunction/ai-local-embeddings': patch
'@memberjunction/ai-ollama': patch
---

Add `BaseEmbeddings.RequiresAPIKey` (default `true`), mirroring `VectorDBBase.RequiresAPIKey`. `LocalEmbedding` and `OllamaEmbedding` return `false`, so credential checks such as `AIEmbeddingRunner`'s accept them with no API key configured.
