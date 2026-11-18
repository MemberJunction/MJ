---
'@memberjunction/core': minor
'@memberjunction/ai-prompts': minor
'@memberjunction/tag-engine': minor
'@memberjunction/core-entities-server': minor
'@memberjunction/ai-vector-sync': minor
'@memberjunction/ai-vector-dupe': minor
'@memberjunction/search-engine': minor
---

Embedding attribution.

- A tag saved through the entity is embedded with the same model as TagEngine's tag index, under the "Tag Semantic Matching" prompt, and a stored vector is stale only when it came from another model (#4922). New `TagEngine.EmbedTagText` and `TagEngine.ResolveTagEmbeddingModelID`; the local helper is used only when TagEngine resolves no model.
- New carrier prompts "Vector Sync Embedding", "Duplicate Detection Embedding" and "Vector Search Embedding" (Embedding type, no model bindings). Vector sync, duplicate detection and vector search run their embeddings under them through the new `EmbeddingRunParams.PromptName`, so cost reports can tell the three apart (#4923). An embedding call that names no prompt now runs under "Content Embedding" when it exists, else the first active Embedding prompt by name, instead of whichever prompt the engine loaded first.
