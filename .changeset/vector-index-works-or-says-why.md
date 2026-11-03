---
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vectors": patch
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/entity-documents": patch
---

A vector index records whether it was provisioned, vectorizing refuses embeddings the index cannot hold, and the embedding model is chosen deterministically.

`MJVectorIndexEntityServer` still provisions in the background, so the save that creates the row returns at once. But the outcome of that background call used to reach only the server log, and a row whose provider refused, threw or never answered looked identical to one with an index behind it. The outcome is now written onto the row's `ProviderConfig` as `provisionState`, `provisionMessage` and `provisionCheckedAt`: `provisioned`, `failed` (with the provider's message), `timed-out` (the provider did not answer within `CREATE_INDEX_TIMEOUT_MS` and may still finish, so this is not recorded as a failure), `not-applicable` (the driver owns no index objects) or `unprovisioned` (no driver instance in this process). `Save()` never throws over provisioning. `Dimensions` and `Metric` are written back from the provider's response when it reports them, and `Metric` is requested from the row instead of hardcoded to `cosine`.

`VectorDBBase.ManagesIndexes` (default `true`, `false` on both Memory drivers) separates "this driver owns no index objects" from `IsReadOnly`, which is about record ingestion. MJ ships a Vector Index row for `SimpleVectorServiceProvider`, whose `CreateIndex` correctly answers `success: false`; that is now recorded as `not-applicable`, not as a failure, and its delete no longer asks the driver to remove an index it never had.

Vectorizing now refuses an index whose width disagrees with the embeddings it was handed, naming both widths, the index and the model. The width is the index's `Dimensions`, which is set at create time from the embedding-model probe. For rows whose `Dimensions` is still null, such as indexes created before that probe existed, the width is backfilled from `ListIndexes()` (matched on `ExternalID`, then `Name`), and a reported `dimension: 0` is treated as unknown rather than zero.

Embedding-model selection is no longer whichever row the view happened to return first. `GetAIModel`'s no-id branch orders active models ahead of inactive ones, then by `PowerRank`, then by name, and logs that nobody asked for the model it picked. The model-type comparison is normalised, so a type row spelled `embeddings` no longer hides every embedding model. Vectorizing takes the model from `VectorIndex.EmbeddingModelID`, which is NOT NULL, rather than the nullable `EntityDocument.AIModelID`, and logs a disagreement between the two without failing the run.

`EntityDocumentCache` no longer needs a process restart to see a new or edited entity document. Its `_loaded` flag was a one-way latch, and every production caller passes `refresh: false`. The cache now has a staleness window (`StaleAfterMs`, default 60s) plus an `Invalidate()` hook, and within the window a vectorize run over many entities still does not re-read metadata per entity.
