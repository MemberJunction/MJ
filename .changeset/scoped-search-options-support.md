---
"@memberjunction/ai": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vectors-pinecone": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/search-engine": patch
---

Add optional embedding dimensions, per-record Pinecone namespace routing, and scope-level provider config support.

**`@memberjunction/ai`** — Add optional `dimensions` field to `EmbedTextParams`, `EmbedTextsParams`, and `EmbedContentParams`. When provided, overrides the model's native output dimension (only effective on models that support it, e.g. OpenAI `text-embedding-3-*`).

**`@memberjunction/ai-openai`** — `OpenAIEmbedding.EmbedText` and `embedBatch` now forward `params.dimensions` to the OpenAI embeddings API when set.

**`@memberjunction/ai-vectordb`** — Three additive changes to the vector DB abstraction layer:
- `VectorRecord` gains an optional `providerTemporaryDirectives` field — an MJ-internal routing map set by ingestion and stripped before any external upsert.
- `QueryParamsBase` gains an optional `providerConfig` field — an opaque blob sourced from the scope's rendered `ExternalIndexConfig`, threaded through to the driver at query time.
- `VectorDBBase` gains a `BuildProviderDirectives(sourceRecord, providerConfig)` hook (default: returns `{}`) that drivers override to extract per-record routing values (e.g. namespace) from the raw source row.
- `CreateRecord` and `CreateRecords` signatures gain an optional `providerConfig` parameter.

**`@memberjunction/ai-vectors-pinecone`** — Full namespace routing support:
- `BuildProviderDirectives` reads `providerConfig.namespaceField`, looks up that field on each source record, and returns `{ namespace: '<value>' }` so records are routed to the correct Pinecone namespace during ingestion.
- `CreateRecords` groups a mixed batch by namespace and issues one `upsert` per distinct namespace; falls back to a single-namespace path when no per-record directives are present.
- `QueryIndex` extracts `providerConfig.namespace`, calls `index.namespace(ns)` when present, and strips the field before passing params to the Pinecone SDK.
- `providerTemporaryDirectives` is stripped from each `VectorRecord` before any upsert call.

**`@memberjunction/ai-vector-sync`** — Sync pipeline now reads `VectorIndex.Dimensions` and `VectorIndex.ProviderConfig` and threads them through:
- `Dimensions` is forwarded to `EmbedTexts` so the embedding model produces vectors at the configured size.
- `ProviderConfig` (parsed from JSON) is forwarded to `upsertBatchToVectorDB`, which passes it to `BuildProviderDirectives` per record and to `CreateRecords`.
- Metadata value storage is now type-aware: SQL numeric types (`int`, `float`, `decimal`, etc.) are stored as JS numbers; a new `storeAs` field config supports `'epochSeconds'` and `'epochMilliseconds'` for datetime columns, `'number'`, and `'boolean'`.

**`@memberjunction/search-engine`** — `ExternalIndexConfig` on scope external-index rows is now treated as a Nunjucks template: it is rendered against the caller's `SearchContext` before being JSON-parsed. The rendered object (e.g. `{ namespace: '<orgId>' }`) is forwarded as `providerConfig` through `VectorSearchProvider.queryOneIndex` to the vector DB driver. `VectorIndex.Dimensions` is also forwarded to the query-time embedding call.
