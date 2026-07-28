---
'@memberjunction/content-autotagging': patch
'@memberjunction/core-entities': patch
---

Follow-up polish for #3275 (resolves #3287) — no behavior change:

- **Export the vector-config interfaces** from `@memberjunction/content-autotagging` with TSDoc
  (`ResolvedVectorInfrastructure`, `ResolvedVectorStorageConfig`, `EmbeddingChunk`, `PersistedChunk`,
  `ChunkPurgeStats`, `ChunkEmbedStats`, and the `VectorIDStrategy` / `ChunkTextStorage` /
  `VectorMetadataConfig` / `VectorMetadataFieldConfig` aliases) so downstream consumers can reason
  about resolved vector infrastructure.
- **`AutotagBaseEngine` chunk-record shaping is now subclass-overridable**: the per-chunk record
  construction is extracted into a new `protected buildVectorRecord(...)`, and `buildVectorRecords`
  plus its collaborators (`resolveChunkVectorId`, `buildVectorMetadata`, `buildProviderDirectives`,
  `resolveItemVectorStorageConfig`, `isItemLevelVector`) are now `protected` with TSDoc.
- **O(1) by-id lookups in `KnowledgeHubMetadataEngine`**: `GetContentSourceByID`,
  `GetContentTypeByID`, `GetContentSourceTypeByID`, `GetContentFileTypeByID` (plus the existing
  `GetVectorIndexByID` / `GetEntityDocumentByID`) are now backed by lazily-built id indexes that
  self-invalidate on the engine's `DataChange$`. `AutotagBaseEngine` now routes its by-id lookups
  through these helpers instead of repeated `.find()` scans.
