---
"@memberjunction/content-autotagging": minor
"@memberjunction/actions-content-autotag": minor
"@memberjunction/core-entities": minor
---

Content autotagging: persist vector-database record identifiers, and add the ContentItemChunk entity

Vectorized Content Items previously had no back-reference to their stored vectors, and chunked items produced multiple vectors with no record of which portion of the item each represented. This adds that provenance.

- **`ContentItem.VectorRecordID`** (new `NVARCHAR(100)` column) — the vector-database record id for an item embedded as a single vector, providing traceability from the item to its stored vector.
- **New `ContentItemChunk` entity** — `ContentItemID` / `Sequence` / `Text` / `VectorRecordID`. When an item's text is split into multiple embedding chunks, each chunk becomes a row here, linking the stored vector back to the specific portion of the parent item. `(ContentItemID, Sequence)` is intentionally NOT unique — superseded chunks are soft-deleted (kept as tombstones) so a chunk and its replacement can share a Sequence until purged.
- **`AutotagBaseEngine.VectorizeContentItems`** — after a successful upsert, persists the record ids: single-chunk items write `ContentItem.VectorRecordID`; multi-chunk items write ordered `ContentItemChunk` rows in a server-side transaction. For multi-chunk items the item-level `VectorRecordID` is left null — the chunk table is the source of truth. Each chunk gets a **unique, persistent per-chunk vector id** (not the old item-hash scheme) so a re-chunk's new rows never reuse a superseded chunk's vector id. Each chunk row is stamped `EmbeddingStatus='Complete'` with `LastEmbeddedAt` on creation.
- **Re-chunking is a soft-delete + append** — re-vectorizing an item marks its current live chunks `DeleteStatus='Pending'` (rows kept) and appends the new chunks, all in one SQL transaction (no third-party call inside it). **`AutotagBaseEngine.PurgeDeletedChunks`** then removes the superseded chunks' vectors from the vector database (`vectorDB.DeleteRecords`, bounded sub-batches + rate-limited) and flips them to `DeleteStatus='Deleted'` with `LastDeletedAt` — delete-vector-first so a mid-run failure stays retryable, and out-of-band from vectorization so the remote deletes can be batched to each provider's limits.
- **`ContentItem` also gains** a self-referencing `ParentID` (nullable FK, enabling a content-item hierarchy) and a nullable `DisplayLink` (`NVARCHAR(2000)`, a display/clickable URL).
- **`ContentItemChunk` also gains** status-lifecycle + tracking fields mirroring the `ContentItem` pattern: `EmbeddingStatus` / `TaggingStatus` (NOT NULL, default `Pending`; value list = ContentItem's plus `Active` and `Processed`), a nullable `DeleteStatus` (`Pending` / `Deleted`), and `LastEmbeddedAt` / `LastTaggedAt` / `LastDeletedAt` timestamps.
- **Standalone vectorization** (`@memberjunction/actions-content-autotag`) — the Autotag/Vectorize action now runs vectorization whenever `Vectorize=1`, decoupled from whether autotagging produced new items, so `Autotag=0, Vectorize=1` embeds pending content without re-tagging or `ForceReprocess`. `RunDirectVectorization` selects only items awaiting embedding (`EmbeddingStatus='Pending'`) and honors the `ContentSourceIDs` filter; `ForceReprocess` re-embeds everything.
- **Re-embed on change** — when a content item is (re)tagged because its content changed, `AutotagBaseEngine` resets its `EmbeddingStatus` to `Pending` as tagging begins, so the vectorization phase picks it up and re-embeds it.

Additive only; existing vectorization behavior is unchanged when items fit in a single chunk.
