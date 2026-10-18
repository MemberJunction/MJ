---
"@memberjunction/ai-vectors": patch
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions-content-autotag": patch
"@memberjunction/ai-knowledge-pipeline": patch
---

Fix vectorization into a colocated vector database (SQL Server 2025 `VECTOR`, pgvector colocated) when the syncer is built without a provider (#4910).

`VectorBase.Provider` fell back to the `Metadata` wrapper instead of a real `IMetadataProvider`. The wrapper fails `IsColocatedVectorHost`, so `TryWireColocatedHost` never wired a host and every upsert failed with "requires a host connection". The fallback is now `Metadata.Provider`, and the `as unknown as` casts are gone.

The callers that build an `EntityVectorSyncer` now pass the provider they already hold: `VectorizeEntityResolver` (the request's provider), `KnowledgeAgent` (the tool call's provider, also for `DuplicateRecordDetector`), the `Vectorize Entity` and `Autotag and Vectorize Content` actions (`params.Provider`), and `KnowledgePipeline`, which gains an optional constructor provider.
