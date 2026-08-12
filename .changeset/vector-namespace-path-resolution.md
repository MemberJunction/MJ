---
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vectors-pinecone": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/actions-content-autotag": patch
---

Content vectorization: generic field-path resolution for provider directives, Pinecone namespace hardening, and autotag action flag coercion

- **New `VectorDBBase.GetSourceRecordFieldPaths(providerConfig)`** — a vector-DB driver declares which source-record field paths (plain or single-hop dotted, e.g. `'ContentSourceID.OrganizationID'`) its `ProviderConfig` needs. Default: none. Calling pipelines resolve the declared paths and hand `BuildProviderDirectives` an enriched record; what a path's value MEANS (a namespace, a shard key, a routing region...) is entirely the driver's business — the framework stays generic.

- **New `FieldPathResolver`** (`@memberjunction/content-autotagging`) — resolves those declared paths for a batch of `BaseEntity` records. A single-hop path's first segment is validated as a foreign key on the root entity via `EntityInfo` metadata; the related record is loaded and, when the related entity is an IS-A parent type, its child-type row (shared PK) is loaded and merged over it — so a field that physically lives on an IS-A extension entity resolves without any config ever naming that entity. Batched (one `IN (...)` load per entity per pass, not per record) and per-pass cached; consults `BaseEngineRegistry.TryGetCachedRecords` first, so a hop through an already-cached entity (e.g. `ContentSource` via `KnowledgeHubMetadataEngine`) costs zero queries.

- **`BuildProviderDirectives` may now throw to reject a record.** `AutotagBaseEngine` converts a throw into a per-record failure — the item/chunk is marked `Failed` (purge: left `Pending`) and the rest of the batch proceeds — across all three call sites: live vectorization, the `EmbedPendingChunks` backfill, and `PurgeDeletedChunks`.

- **Pinecone now fails closed on an unresolvable configured namespace.** `PineconeDatabase.BuildProviderDirectives` throws when `namespaceField` is configured but the record has no usable value, instead of returning `{}` — which previously routed the vector into the index's default namespace, silently breaching the tenant wall namespacing exists to build.

- **Fix: Pinecone deletes are now namespace-aware.** `DeleteRecord` / `DeleteRecords` route through the per-record `providerTemporaryDirectives.namespace` (grouped, mirroring `CreateRecords`) instead of always deleting from the default namespace — previously a namespaced vector's delete silently no-opped (Pinecone reports success deleting IDs that don't exist in a given namespace). Also fixes both methods calling `index.deleteOne` / `deleteMany` without `await`, so a failed delete could report success.

- **Fix: `AutotagAndVectorizeContentAction` flag params accept string values.** `Autotag` / `Vectorize` / `ForceReprocess` / `Purge` / `EmbedPendingChunks` now accept `"1"` / `"true"` / `"yes"` via a new `flagIsSet()` helper — the generic `RunAction` GraphQL mutation types every param as a string, so a caller passing `Value: "1"` previously failed the action's strict `=== 1` check and the phase silently no-op'd with no error.

Note: if a `VectorIndex.ProviderConfig` already has `namespaceField` set, any content item whose namespace value was previously unresolvable was silently landing in the default Pinecone namespace. After this change those records fail closed (marked `Failed` / left `Pending`) instead of writing there. Worth checking for any such records once this ships.
