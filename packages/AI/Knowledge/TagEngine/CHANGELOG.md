# @memberjunction/tag-engine

## 6.2.0-edge.3

### Minor Changes

- dfe40a4: Binary fields work end to end, and persisted embeddings gain a binary float32 copy that loads about 14× faster than the JSON one.

  **Binary fields (varbinary / binary / image on SQL Server, bytea on PostgreSQL).** Previously a binary column reached `BaseEntity` as whatever the driver returned. A Node `Buffer` then serialized over GraphQL as `{"type":"Buffer","data":[…]}`, and saves wrote the base64 text into the column. Now a binary field's value is a **base64 string** everywhere above the database: in `BaseEntity`, every cache, RunView results and the GraphQL wire. Providers convert at the boundary. SQL Server binds a `0x…` hex literal, PostgreSQL binds a `Buffer`, and rows read back become base64, including rows returned from a transaction group save. CodeGen now declares a length-less `varbinary` parameter as `varbinary(MAX)`; it used to emit `varbinary`, which T-SQL truncates to one byte. Generated getters document the encoding, and generated forms skip binary fields.
  - **`RunView` omits binary fields by default.** Set `IncludeBinaryFields: true`, or name a binary field in `Fields`, which sets it for you. The flag is part of the cache fingerprint, so the two shapes never share an entry. A single-record `Load()` always includes binary fields. Engine configs take `IncludeBinaryFields: true | 'DatabaseProviderOnly'`; the second loads binary fields only in server processes.
  - **Validation.** Saving a value that is not canonical base64 into a binary field fails `Validate()` with a message naming base64. A value whose decoded length exceeds a fixed-length column also fails.
  - **`@memberjunction/global` codecs.** `BytesToBase64` / `Base64ToBytes` / `TryBase64ToBytes` pick the fastest host implementation: native `Uint8Array.fromBase64`, then Node `Buffer`, then `atob`. On Node, validation is fused into the decode and is fuzz-tested to accept exactly what `IsValidBase64` accepts. `Float32VectorToBase64` / `Base64ToFloat32Vector` handle little-endian float32 vectors. `ReplaceByteArraysWithBase64` makes any raw query row JSON-safe.

  **Binary vector columns (migration `V202610021716`).** These nullable `varbinary(MAX)` companions of the JSON vector columns are added:
  - `EntityRecordDocument.VectorBinary`
  - `EmbeddingVectorBinary` on `AIAgentNote`, `AIAgentExample`, `Query` and `Tag`
  - `Component.FunctionalRequirementsVectorBinary` and `Component.TechnicalDesignVectorBinary`

  Every writer now fills both columns: `BaseEntity.GenerateEmbedding*` (new optional binary field parameter), the note, example, component, query and tag entity servers, `TagEngine`, and the entity vectorizer (`EntityVectorSyncer`). Readers prefer the binary column through the new `ReadStoredVector` and `DecodeVectorBinary` in `@memberjunction/ai-vectors-memory`, and fall back to JSON for rows written before the column existed or for invalid binary values. The readers are `SimpleVectorServiceProvider`, `SimpleVectorDatabase` (new `binaryVectorField` ProviderConfig key), `AIEngine`, `TagEngine`, `TagHealthJob`, `QueryEngineServer` and clustering. For 20,000 × 1,536 vectors, decoding takes 0.28 s, against 3.9 s to parse the JSON.

  Fixes found along the way:
  - Clustering no longer counts a binary-only row as having no vector.
  - A note, example or tag whose stored JSON vector is malformed is now dropped from the in-memory index instead of throwing.
  - A PostgreSQL transaction group post-processes each row with its entity's own provider rather than the process-global one.

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

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [28df136]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/aiengine@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-vectors-memory@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/tag-engine-base@6.2.0-edge.3
  - @memberjunction/clustering-engine@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- eaa9455: Introduce `AIEmbeddingRunner` extending `BaseModelRunner` with `RequiredModelType = 'Embeddings'`.
  - Implement credential resolution, failover across candidate models/vendors, retry handling, and `MJAIPromptRun` persistence.
  - Deprecate `AIModelRunner.RunEmbedding` and delegate transparently to `AIEmbeddingRunner`.
  - Migrate embedding call sites in `@memberjunction/tag-engine`, `@memberjunction/ai-vector-dupe`, `@memberjunction/ai-vector-sync`, `@memberjunction/content-autotagging`, and `@memberjunction/search-engine` to use `AIEmbeddingRunner`.
  - `AIEmbeddingRunner` runs a driver that needs no API key (`LocalEmbedding`, `OllamaEmbedding`) with no key configured, and follows the prompt's `FailoverStrategy` (`SameModelDifferentVendor` never switches models).
  - With no Embedding prompt, the runner embeds under an unsaved stand-in and writes no run row. `EmbeddingRunParams.SkipRunRecord` skips the row on demand.
  - `TagEngine` embeds tags, queries and new tags with one model (the Tag Semantic Matching prompt's, else the smallest) and persists that ID.
  - Vector search keys its query-embedding cache by model and dimension, not by driver.
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [8fd1c46]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [01fafc6]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [861cbf0]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/clustering-engine@6.2.0-edge.2
  - @memberjunction/tag-engine-base@6.2.0-edge.2
  - @memberjunction/ai-vectors-memory@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [ddcd666]
- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [15a4333]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [9b8a84e]
- Updated dependencies [c261eb8]
- Updated dependencies [307da67]
- Updated dependencies [7110019]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/ai-prompts@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/clustering-engine@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/tag-engine-base@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1
  - @memberjunction/ai-vectors-memory@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/aiengine@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-prompts@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/clustering-engine@6.2.0-edge.0
  - @memberjunction/tag-engine-base@6.2.0-edge.0
  - @memberjunction/ai-vectors-memory@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [1100077]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/ai-prompts@6.1.0
  - @memberjunction/ai-vectors-memory@6.1.0
  - @memberjunction/clustering-engine@6.1.0
  - @memberjunction/tag-engine-base@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-prompts@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/clustering-engine@6.1.0-edge.7
  - @memberjunction/tag-engine-base@6.1.0-edge.7
  - @memberjunction/ai-vectors-memory@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/ai-vectors-memory@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/clustering-engine@6.1.0-edge.6
  - @memberjunction/ai-prompts@6.1.0-edge.6
  - @memberjunction/tag-engine-base@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/clustering-engine@6.1.0-edge.5
  - @memberjunction/tag-engine-base@6.1.0-edge.5
  - @memberjunction/ai-vectors-memory@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/clustering-engine@6.1.0-edge.4
  - @memberjunction/tag-engine-base@6.1.0-edge.4
  - @memberjunction/ai-vectors-memory@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/clustering-engine@6.1.0-edge.3
  - @memberjunction/tag-engine-base@6.1.0-edge.3
  - @memberjunction/ai-vectors-memory@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/clustering-engine@6.1.0-edge.2
  - @memberjunction/tag-engine-base@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/ai-vectors-memory@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/clustering-engine@6.1.0-edge.1
  - @memberjunction/tag-engine-base@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/ai-vectors-memory@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/clustering-engine@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/tag-engine-base@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-vectors-memory@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/clustering-engine@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/tag-engine-base@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-vectors-memory@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/clustering-engine@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/tag-engine-base@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-vectors-memory@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/clustering-engine@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/tag-engine-base@5.50.0
  - @memberjunction/ai-vectors-memory@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/clustering-engine@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/tag-engine-base@5.49.0
  - @memberjunction/ai-vectors-memory@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/clustering-engine@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/tag-engine-base@5.48.0
  - @memberjunction/ai-prompts@5.48.0
  - @memberjunction/ai-vectors-memory@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/clustering-engine@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/tag-engine-base@5.47.0
  - @memberjunction/ai-prompts@5.47.0
  - @memberjunction/ai-vectors-memory@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-prompts@5.46.0
  - @memberjunction/clustering-engine@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/tag-engine-base@5.46.0
  - @memberjunction/ai-vectors-memory@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/clustering-engine@5.45.1
  - @memberjunction/aiengine@5.45.1
  - @memberjunction/ai-prompts@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/tag-engine-base@5.45.1
  - @memberjunction/ai-vectors-memory@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/clustering-engine@5.45.0
  - @memberjunction/tag-engine-base@5.45.0
  - @memberjunction/ai-prompts@5.45.0
  - @memberjunction/ai-vectors-memory@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/aiengine@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-vectors-memory@5.44.0
  - @memberjunction/clustering-engine@5.44.0
  - @memberjunction/ai-prompts@5.44.0
  - @memberjunction/tag-engine-base@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/ai-prompts@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/clustering-engine@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/tag-engine-base@5.43.0
  - @memberjunction/ai-vectors-memory@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [256ab06]
- Updated dependencies [c871a4d]
- Updated dependencies [9b9b484]
- Updated dependencies [d185a5c]
- Updated dependencies [e7c2437]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/ai-prompts@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vectors-memory@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/clustering-engine@5.42.0
  - @memberjunction/tag-engine-base@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ai-prompts@5.41.0
  - @memberjunction/clustering-engine@5.41.0
  - @memberjunction/tag-engine-base@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-engine-base@5.40.2
- @memberjunction/clustering-engine@5.40.2
- @memberjunction/ai@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/tag-engine-base@5.40.2
- @memberjunction/ai-prompts@5.40.2
- @memberjunction/ai-vectors-memory@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/clustering-engine@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/tag-engine-base@5.40.1
  - @memberjunction/ai-prompts@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Minor Changes

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/clustering-engine@5.40.0
  - @memberjunction/tag-engine-base@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-prompts@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-prompts@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/tag-engine-base@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/tag-engine-base@5.38.0
  - @memberjunction/ai-vectors-memory@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-prompts@5.37.0
  - @memberjunction/tag-engine-base@5.37.0
  - @memberjunction/ai-vectors-memory@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/tag-engine-base@5.36.0
  - @memberjunction/ai-prompts@5.36.0
  - @memberjunction/ai-vectors-memory@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ai-prompts@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/tag-engine-base@5.35.0
  - @memberjunction/ai-vectors-memory@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/tag-engine-base@5.34.1
  - @memberjunction/ai-prompts@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/tag-engine-base@5.34.0
  - @memberjunction/ai-prompts@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [7716c98]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-prompts@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/tag-engine-base@5.33.0
  - @memberjunction/ai-vectors-memory@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/tag-engine-base@5.32.0
  - @memberjunction/ai-prompts@5.32.0
  - @memberjunction/ai-vectors-memory@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- fc8b9b8: Autotagger scope & governance — per-tenant tag scoping, per-tag governance, persisted embeddings, suggestion queue, Tag Health, and a unified Tag Governance dashboard with full UI.

  **Schema (one additive migration `V202605010846`)** — 9 new columns on `__mj.Tag` (governance + persisted embedding cache), three new tables (`__mj.TagScope` polymorphic M2M, `__mj.TagSynonym`, `__mj.TagSuggestion` review queue). Existing rows default to `IsGlobal=1` so behavior is unchanged out of the box. `IContentSourceConfiguration` JSON type extended with five net-new optional knobs (`SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun`) — CodeGen emits the typed accessor.

  **Engine (`tag-engine` / `tag-engine-base` / `core-entities-server`)** — `MJTagEntityServer` + new `MJTagScopeEntityServer` enforce the `IsGlobal ⊕ TagScope` invariant via `ValidateAsync` (no DB triggers); persisted-embedding `Save()` hook + cold-start hydrate path replace the every-startup recompute. `TagEngineBase` eagerly loads scope + synonyms in `Config()` and exposes `GetVisibleTags / GetTagBySynonym / GetTagByName(name, ctx) / GetTaxonomyTree(rootID, ctx)`. New `TagScopeFilterBuilder` (`BaseSingleton`) produces SQL fragments + in-memory predicates + child-scope subset validator. `TagEngine.ResolveTag` widened with a `'hybrid'` mode and a `ResolveTagOptions` parameter — new 4+1-tier pipeline (synonym → exact → fuzzy → semantic with tiered confidence routing → governance-gated `handleNoMatch`). `SuggestThreshold` band routes to the suggestion queue; `createAndEmbedTag` snapshots parent scope onto new children when parent is non-global. `TagGovernanceEngine` adds `ValidateAutoGrow / EnqueueSuggestion / PromoteSuggestion / RejectSuggestion`; `MergeTags` carries source synonyms (`Source='Merged'`). New `TagHealthJob` with three idempotent emitters (merge / low-usage / wide-node), gated by `MJ_AUTOTAG_RUN_TAG_HEALTH=1` env or invokable on demand. New `TagEngine.RebuildTagEmbeddings(contextUser)` utility for post-model-change rebuilds.

  **Autotag pipeline (`content-autotagging`)** — `ScopeContextResolver` derives per-source scope from `TagRootID`, `RunBudget` enforces per-run + per-item caps, new `OnAfterBatch` hook on `AutotagBaseEngine` gracefully pauses runs via the existing `CancellationRequested` machinery. `BridgeContentItemTagToTaxonomy` threads `scopeContext`, `SuggestThreshold`, source traceability, and an `onTagCreated` callback into `ResolveTag`. Per-item budget exhaustion collapses the effective mode to `hybrid` so further new tags route to suggestions instead of being auto-created.

  **Server (`server` / `graphql-dataprovider`)** — new `TagGovernanceResolver` exposes `PromoteTagSuggestion` / `RejectTagSuggestion` / `RebuildTagEmbeddings` / `RunTagHealth` mutations so suggestion dispositions run transactionally on the server. Matching `GraphQLAIClient` methods + result interfaces.

  **UI (`ng-dashboards` / `ng-core-entity-forms`)** — new `TagGovernanceResourceComponent` (registered as `'TagGovernance'`) — single dashboard with **left-nav** (top nav stays with the MJExplorer shell). Three sections built to the picked mockup options: Taxonomy (Option A — tree + governance/scope/synonyms detail-form, scope dialog with parent-subset validation), Suggestions (Option C — table + drawer with bulk actions and "if approved" preview), Tag Health (Option A — three summary cards + threshold tuning + run history + Rebuild stale embeddings). `MJContentSourceFormComponentExtended` gains a "Tag Pipeline Configuration" panel (Option B dense form) with mode picker cards, threshold sliders that auto-keep `SuggestThreshold < MatchThreshold`, scope+root, and budget fields — the existing JSON code editor stays available collapsed below as the advanced override. Multi-provider safe + UUID-compliant throughout.

  **Tests** — 271 tests across the impacted packages, all green. New: 12 `TagScopeFilterBuilder`, 8 `ValidateAutoGrow`, 4 `TagHealthJob`, 7 `RunBudget`, 8 `ScopeContextResolver`, 18 `TagGovernanceResolver`, 18 `TagGovernance` dashboard, 23 `ContentSource` form (vitest newly enabled in `ng-core-entity-forms`).

  **Documentation** — `guides/TAXONOMY_TAGGING_GUIDE.md` (~730 lines, 7 Mermaid diagrams) covers the entity model, autotag pipeline, 4+1-tier resolver, taxonomy modes, governance gates, scope inheritance, suggestion lifecycle, worked implementation guides, seeding patterns, and ops guidance. `guides/BASE_ENTITY_SERVER_PATTERNS.md` captures the persisted-embedding + `ValidateAsync` invariant + FK-cleanup-before-delete patterns this PR introduces so future agents lift the recipe rather than re-discover it. `mockups/knowledge-hub-classify-redesign/` ships 12 polished HTML mockups (3 options each across the 3 high-priority surfaces) that drove the UX direction.

  Migration ordering: apply the SQL migration → run CodeGen → `mj sync push` for the JSON-type interface → build. The migration is additive and idempotent against `IsGlobal=1` defaults; existing customers see no behavior change until they opt in by setting per-tag governance flags or moving sources off the default `auto-grow` mode.

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/tag-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-prompts@5.31.0
  - @memberjunction/ai-vectors-memory@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/tag-engine-base@5.30.1
- @memberjunction/ai-prompts@5.30.1
- @memberjunction/ai-vectors-memory@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-prompts@5.30.0
  - @memberjunction/tag-engine-base@5.30.0
  - @memberjunction/ai-vectors-memory@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/tag-engine-base@5.29.0
  - @memberjunction/ai-prompts@5.29.0
  - @memberjunction/ai-vectors-memory@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [fdab4bb]
- Updated dependencies [115e4da]
  - @memberjunction/ai-prompts@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/tag-engine-base@5.28.0
  - @memberjunction/ai-vectors-memory@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/tag-engine-base@5.27.1
  - @memberjunction/ai-prompts@5.27.1
  - @memberjunction/ai-vectors-memory@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/tag-engine-base@5.27.0
- @memberjunction/ai-prompts@5.27.0
- @memberjunction/ai-vectors-memory@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/tag-engine-base@5.26.0
  - @memberjunction/ai-prompts@5.26.0
  - @memberjunction/ai-vectors-memory@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/tag-engine-base@5.25.0
  - @memberjunction/ai-prompts@5.25.0
  - @memberjunction/ai-vectors-memory@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/tag-engine-base@5.24.0
  - @memberjunction/ai-prompts@5.24.0
  - @memberjunction/ai-vectors-memory@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0
