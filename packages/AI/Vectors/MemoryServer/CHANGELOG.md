# @memberjunction/ai-vectors-memory-server

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [0a348e2]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-vectors-memory@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [39b35f1]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [2274f42]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [03c085c]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-vectors-memory@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ai-vectors-memory@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 28df136: In-memory vector search is faster, keeps its index current incrementally, and on a server no longer blocks the event loop.

  **`@memberjunction/ai-vectors-memory`** (browser-safe; same public API)
  - **Packed storage.** Vectors are stored in one contiguous typed array with cached norms, not a `Map` of number arrays. `float64` (the default) gives results bit-identical to before. `new SimpleVectorService({ Precision: 'float32' })` halves the memory for embeddings. Results are re-scored with the same kernels, so `FindNearest`, `FindSimilar`, `FindAboveThreshold`, K-Means and DBSCAN return exactly what they did before.
  - **Faster kernels.** Cosine, euclidean and dot product scans are specialised per precision and reuse cached norms. In JavaScript alone, a top-10 cosine search over 20,000 × 1,536 vectors drops from 80 ms to 65 ms. With a metadata filter it drops from 12 ms to 9 ms.
  - **Async variants.** `FindNearestAsync`, `KMeansClusterAsync` and `DBSCANClusterAsync` let a registered `BaseVectorAccelerator` run the work elsewhere. Without one they run in-process.
  - **Incremental index cache.** `SimpleVectorServiceProvider` applies entity saves and deletes to a loaded index in place instead of discarding it. Patching one row takes about 0.2 ms; the old rebuild re-read and re-parsed every row, about 4.4 s of parsing alone for 20,000 vectors. A remote invalidate without record data is re-read in one batched query, once per user an index was loaded as. A stale index keeps serving while it reloads. `InvalidateIndex` now also supersedes a load already in flight, so the next query cannot be answered from rows read before the invalidate.
  - **`SimpleVectorDatabase` no longer serves one user's cached rows to another.** Rows are read as the calling user, but the parsed index was reused whenever the row count matched. A user who could see a different set of rows of the same size got the first user's rows. The cache is now reused only when the rows' keys, `__mj_UpdatedAt` values and vector presence, and the index config, all match. A row whose vector size differs from the rest is now skipped, with one log line, instead of failing every query. An empty query vector now returns a failure response instead of throwing.
  - **`SimpleVectorDatabase` applies metadata filters.** `QueryIndex` used to ignore `filter`, so a search scope's `MetadataFilter` — including a tenant push-down — had no effect on this driver. It is now evaluated in memory (`$eq $ne $gt $gte $lt $lte $in $nin $exists $and $or`), and a filter it cannot apply fails the query instead of running unfiltered. The evaluator is exported as `CompileMetadataFilter`. The driver now also reports `IsReadOnly = true` and `RequiresAPIKey = false`, and `ListVectorIDs` returns the contract's `NextPaginationToken` (it returned `NextCursor`); `SimpleVectorServiceProvider.ListVectorIDs` had the same bug.
  - **Fixes.** A query whose dimensions differ from the index, or an unknown metric, is logged once rather than once per row. `GetVector` and `ExportVectors` return copies, never live storage.

  **`@memberjunction/ai-vectors-memory-server`** (new, server-only)

  Registers a `WorkerPoolVectorAccelerator`. Under 32 concurrent searches the longest event-loop stall drops from 2.5 s to 13 ms. Stores are allocated in `SharedArrayBuffer`, so large searches and clustering run on a worker-thread pool without copying. Exact searches use the optional `usearch` native SIMD backend, but only when its candidate set can be proven complete. Otherwise they fall back to JavaScript. Opt-in HNSW approximate search (`MJ_VECTOR_ANN=1`) is available for very large cosine indexes. Every failure degrades to in-process work. The browser-manifest leakage gate denies the package.

  **`@memberjunction/core-entities-server`.** When the embedder returns an empty vector or throws, `MJQueryEntityServer` now clears the stored vector (both columns and the model ID) and logs the error, as `MJTagEntityServer` already did, instead of keeping a vector computed from the previous text. The save still succeeds.

  **Consumers.** `AIEngine` (notes, examples), `TagEngine` and `QueryEngineServer` use `float32` storage and `FindNearestAsync`. `ClusteringEngine` uses the async clustering methods. `@memberjunction/server-bootstrap` loads the server accelerator, so a standard MJAPI gets it with no configuration.

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [28df136]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-vectors-memory@6.2.0-edge.3
