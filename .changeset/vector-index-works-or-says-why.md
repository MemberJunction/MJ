---
"@memberjunction/core-entities-server": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vectors": patch
"@memberjunction/ai-vectordb": patch
"@memberjunction/ai-vectors-memory": patch
---

Creating a vector index either provisions one or says why it did not.

`MJVectorIndexEntityServer` called `createIndexInProvider().catch(LogError)` — fired and forgotten.
Two consequences, both invisible to the caller. A provider returning `success: false` reached only
the log while the committed row kept `ExternalID`, `Dimensions` and `Metric` null and `Save()`
returned true; and on the happy path the write-back resolved *after* `Save()` had already returned,
so a client re-reading immediately saw the pre-provisioning values. That race, not a missing write,
is why `Dimensions` is null on so many rows. `metric` was also hardcoded to `'cosine'` and written
straight back, so the column could only ever echo our own constant.

Provisioning is now awaited and returns a discriminated outcome. `Dimensions` and `Metric` come off
the provider's response and fall back to the request only when it does not carry them. A provider
that refuses, or an index that was created but whose row cannot be made to address it, now throws
and quotes the provider instead of reporting success.

Two outcomes are deliberately non-fatal, because MJ ships a Vector Index row for
`SimpleVectorServiceProvider`, whose `CreateIndex` correctly returns `success: false` — escalating it
would break `mj sync push` of MJ's own metadata on every install. `VectorDBBase.ManagesIndexes`
(default `true`, `false` on both Memory drivers) separates "this driver owns no index objects" from
`IsReadOnly`, which is about record ingestion; and a process with no vector-DB driver loaded is an
environment gap, not a provider verdict. Both leave the row visibly unprovisioned, and the vectorize
side refuses exactly that state.

Vectorizing now refuses an index whose declared width disagrees with the embeddings it was handed,
naming both widths, the index and the model — previously the vectors were upserted regardless.
Indexes with no declared `Dimensions` are backfilled from `ListIndexes()` first, matched on
`ExternalID` then `Name`; a reported `dimension: 0` is treated as "unknown" rather than zero.

Embedding-model selection is no longer whichever row the view happened to return first.
`GetAIModel`'s no-id branch orders active models ahead of inactive ones, then by `PowerRank`, then by
name, and logs that nobody asked for the model it picked. The model-type comparison is normalised, so
a type row spelled `embeddings` no longer makes every embedding model invisible. The real binding now
takes the model from `VectorIndex.EmbeddingModelID`, which is NOT NULL, rather than the nullable
`EntityDocument.AIModelID`, reporting a disagreement without failing the run.

`EntityDocumentCache` no longer needs a process restart to see a new or edited entity document. Its
`_loaded` flag was a one-way latch, and every production caller passes `refresh: false`, so the flag
won every time; document *types* were restart-only unconditionally because `_typeCache` is populated
only inside `Refresh`. The cache now carries a staleness window (`StaleAfterMs`, default 60s) plus an
`Invalidate()` hook for a host that wants an exact guarantee. Within the window the skip is preserved,
so a vectorize run over many entities still does not re-read metadata per entity.
