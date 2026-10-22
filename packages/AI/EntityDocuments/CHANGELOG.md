# @memberjunction/entity-documents

## 6.2.0-edge.5

### Patch Changes

- 03c085c: A vector index records whether it was provisioned, vectorizing refuses embeddings the index cannot hold, and the embedding model is chosen deterministically.

  `MJVectorIndexEntityServer` still provisions in the background, so the save that creates the row returns at once. But the outcome of that background call used to reach only the server log, and a row whose provider refused, threw or never answered looked identical to one with an index behind it. The outcome is now written onto the row's `ProviderConfig` as `provisionState`, `provisionMessage` and `provisionCheckedAt`: `provisioned`, `failed` (with the provider's message), `timed-out` (the provider did not answer within `CREATE_INDEX_TIMEOUT_MS` and may still finish, so this is not recorded as a failure), `not-applicable` (the driver owns no index objects) or `unprovisioned` (no driver instance in this process). `Save()` never throws over provisioning. `Dimensions` and `Metric` are written back from the provider's response when it reports them, and `Metric` is requested from the row instead of hardcoded to `cosine`.

  `VectorDBBase.ManagesIndexes` (default `true`, `false` on both Memory drivers) separates "this driver owns no index objects" from `IsReadOnly`, which is about record ingestion. MJ ships a Vector Index row for `SimpleVectorServiceProvider`, whose `CreateIndex` correctly answers `success: false`; that is now recorded as `not-applicable`, not as a failure, and its delete no longer asks the driver to remove an index it never had.

  Vectorizing now refuses an index whose width disagrees with the embeddings it was handed, naming both widths, the index and the model. The width is the index's `Dimensions`, which is set at create time from the embedding-model probe. For rows whose `Dimensions` is still null, such as indexes created before that probe existed, the width is backfilled from `ListIndexes()` (matched on `ExternalID`, then `Name`), and a reported `dimension: 0` is treated as unknown rather than zero.

  Embedding-model selection is no longer whichever row the view happened to return first. `GetAIModel`'s no-id branch orders active models ahead of inactive ones, then by `PowerRank`, then by name, and logs that nobody asked for the model it picked. The model-type comparison is normalised, so a type row spelled `embeddings` no longer hides every embedding model. Vectorizing takes the model from `VectorIndex.EmbeddingModelID`, which is NOT NULL, rather than the nullable `EntityDocument.AIModelID`, and logs a disagreement between the two without failing the run.

  `EntityDocumentCache` no longer needs a process restart to see a new or edited entity document. Its `_loaded` flag was a one-way latch, and every production caller passes `refresh: false`. The cache now has a staleness window (`StaleAfterMs`, default 60s) plus an `Invalidate()` hook, and within the window a vectorize run over many entities still does not re-read metadata per entity.

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [08b3d7b]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [9ce70b3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/templates@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- 42d701e: Extract @memberjunction/entity-documents from @memberjunction/ai-vector-sync to provide reusable entity document parsing and caching across vector sync, autotagging, and feature pipelines.

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
