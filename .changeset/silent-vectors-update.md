---
"@memberjunction/content-autotagging": patch
---

Fix Content Item EmbeddingStatus never transitioning out of `Pending` during vectorization. `updateEmbeddingStatusBatch` was defined on `AutotagBaseEngine` but never called from anywhere — items would have their vectors successfully embedded and upserted to the vector database, yet `EmbeddingStatus`, `EmbeddingModelID`, and `LastEmbeddedAt` would remain at their initial values forever, leaving dashboards permanently showing items as Pending. `vectorizeGroup` now marks every item in the group as `Processing` before processing begins, transitions each batch to `Complete` (with the resolved embedding model ID and timestamp) on a successful upsert, and to `Failed` when either the embedding API returns the wrong vector count or the vector DB upsert reports failure.
