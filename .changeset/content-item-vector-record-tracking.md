---
"@memberjunction/content-autotagging": minor
"@memberjunction/core-entities": minor
---

Content autotagging: persist vector-database record identifiers, and add the ContentItemChunk entity

Vectorized Content Items previously had no back-reference to their stored vectors, and chunked items produced multiple vectors with no record of which portion of the item each represented. This adds that provenance.

- **`ContentItem.VectorRecordID`** (new `NVARCHAR(100)` column) — the vector-database record id for an item embedded as a single vector, providing traceability from the item to its stored vector.
- **New `ContentItemChunk` entity** — `ContentItemID` / `Sequence` / `Text` / `VectorRecordID`, with a unique constraint on `(ContentItemID, Sequence)`. When an item's text is split into multiple embedding chunks, each chunk becomes a row here, linking the stored vector back to the specific portion of the parent item.
- **`AutotagBaseEngine.VectorizeContentItems`** — after a successful upsert, persists the record ids it already generates: single-chunk items write `ContentItem.VectorRecordID`; multi-chunk items write ordered `ContentItemChunk` rows (replacing any prior rows first, so re-vectorization is idempotent). For multi-chunk items the item-level `VectorRecordID` is left null — the chunk table is the source of truth.

Additive only; existing vectorization behavior is unchanged when items fit in a single chunk.
