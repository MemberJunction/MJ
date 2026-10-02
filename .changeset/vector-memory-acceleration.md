---
"@memberjunction/ai-vectors-memory": patch
"@memberjunction/ai-vectors-memory-server": patch
"@memberjunction/aiengine": patch
"@memberjunction/tag-engine": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/clustering-engine": patch
"@memberjunction/server-bootstrap": patch
---

In-memory vector search is faster, keeps its index current incrementally, and on a server no longer blocks the event loop.

**`@memberjunction/ai-vectors-memory`** (browser-safe; same public API)

- **Packed storage.** Vectors are stored in one contiguous typed array with cached norms, not a `Map` of number arrays. `float64` (the default) gives results bit-identical to before. `new SimpleVectorService({ Precision: 'float32' })` halves the memory for embeddings. Results are re-scored with the same kernels, so `FindNearest`, `FindSimilar`, `FindAboveThreshold`, K-Means and DBSCAN return exactly what they did before.
- **Faster kernels.** Cosine, euclidean and dot product scans are specialised per precision and reuse cached norms. In JavaScript alone, a top-10 cosine search over 20,000 × 1,536 vectors drops from 84 ms to 53 ms. With a metadata filter it drops from 15 ms to 7 ms.
- **Async variants.** `FindNearestAsync`, `KMeansClusterAsync` and `DBSCANClusterAsync` let a registered `BaseVectorAccelerator` run the work elsewhere. Without one they run in-process.
- **Incremental index cache.** `SimpleVectorServiceProvider` applies entity saves and deletes to a loaded index in place instead of discarding it. A remote invalidate without record data is re-read in one batched query. A stale index keeps serving while it reloads.
- **Fixes.** A query whose dimensions differ from the index, or an unknown metric, is logged once rather than once per row. `GetVector` and `ExportVectors` return copies, never live storage.

**`@memberjunction/ai-vectors-memory-server`** (new, server-only)

Registers a `WorkerPoolVectorAccelerator`. Stores are allocated in `SharedArrayBuffer`, so large searches and clustering run on a worker-thread pool without copying. Exact searches use the optional `usearch` native SIMD backend, but only when its candidate set can be proven complete. Otherwise they fall back to JavaScript. Opt-in HNSW approximate search (`MJ_VECTOR_ANN=1`) is available for very large cosine indexes. Every failure degrades to in-process work. The browser-manifest leakage gate denies the package.

**Consumers.** `AIEngine` (notes, examples), `TagEngine` and `QueryEngineServer` use `float32` storage and `FindNearestAsync`. `ClusteringEngine` uses the async clustering methods. `@memberjunction/server-bootstrap` loads the server accelerator, so a standard MJAPI gets it with no configuration.
