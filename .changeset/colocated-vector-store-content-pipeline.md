---
'@memberjunction/content-autotagging': minor
'@memberjunction/core-entities-server': minor
---

Content vectorization: make colocated vector stores usable, and stop ignoring an index's declared dimensions

A colocated vector provider (`SQLServerVectorDatabase`, pgvector) keeps vectors in the application's own
database. It has no credentials to present, and it needs the active data-provider connection handed to it
before use. The ContentSource pipeline honored neither, so a colocated store could be **searched** but
never **written** — and it failed in a way that pointed somewhere else entirely: `CreateIndex` logged
`"requires a host connection"` and continued, then vectorization died later on a vector-database cache
miss, which reads like bad metadata rather than a missing wire-up.

Four changes, in two places that both create provider instances:

- **`AutotagBaseEngine.createVectorDBInstance`** now instantiates first, calls `TryWireColocatedHost`, and
  only then requires an API key — for providers that actually need one (`!SupportsColocatedQuery &&
  RequiresAPIKey`). The old order could not work: whether a provider is colocated is not knowable until it
  exists. A non-empty sentinel is passed to the constructor because `VectorDBBase` rejects an empty key
  outright and colocated providers do not override it, so `''` would throw for precisely the keyless case.
- **`MJVectorIndexEntityServer.getVectorDBInstance`** gets the same treatment. This is the site that runs
  on `VectorIndex.Save()`, so without it the provider index is never created regardless of the above.
- **`AutotagBaseEngine.createEmbeddingInstance`** drops its pre-flight key check, matching the decision
  already documented in the EntityDocument pipeline: an empty key is legitimate for local-only drivers
  (`LocalEmbedding` runs ONNX in-process and defends itself with `super(apiKey || 'local')`), and a cloud
  driver that genuinely needs one raises a real provider-level auth error, which is more actionable than a
  guard here. Gating up front made local embedding models unusable from this pipeline.
- **`MJVectorIndexEntityServer.resolveDimensions`** now honors the index's own `Dimensions` column instead
  of returning a hardcoded 1536. This was a latent bug with real consequences on any store that enforces
  width: a colocated SQL Server index is a `VECTOR(n)` column, so a 384-dimension model got a
  `VECTOR(1536)` table and every insert was rejected.

**Behaviour change worth noting before upgrading:** a `MJ: Vector Indexes` record whose `Dimensions`
differs from 1536 will now have its provider index created at the stated width. That is the intent — the
column exists to be honored, and the embedding call already honored it — but an index created earlier at
1536 will not match, and wants recreating.

Verified end to end against SQL Server 2025 with local embeddings: two content sources differing only in
whether they declare `VectorEntityName`, both vectorized through the real pipeline into a real colocated
index. Before these changes the pipeline could not reach that state at all.

Both entries are `minor` rather than `patch` because the bump level is evaluated per branch and this branch
also changes `metadata/` — see `.claude/rules/changesets.md`. The changes here are code only.
