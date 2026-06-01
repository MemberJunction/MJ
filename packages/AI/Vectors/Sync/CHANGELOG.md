# Change Log - @memberjunction/ai-vector-sync

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/ai-vectors@5.38.0
  - @memberjunction/templates@5.38.0
  - @memberjunction/ai-vectors-pinecone@5.38.0
  - @memberjunction/ai-vectordb@5.38.0
  - @memberjunction/credentials@5.38.0
  - @memberjunction/templates-base-types@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-prompts@5.37.0
  - @memberjunction/ai-vectors@5.37.0
  - @memberjunction/templates@5.37.0
  - @memberjunction/ai-vectordb@5.37.0
  - @memberjunction/ai-vectors-pinecone@5.37.0
  - @memberjunction/credentials@5.37.0
  - @memberjunction/templates-base-types@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/ai-prompts@5.36.0
  - @memberjunction/ai-vectors@5.36.0
  - @memberjunction/credentials@5.36.0
  - @memberjunction/templates-base-types@5.36.0
  - @memberjunction/templates@5.36.0
  - @memberjunction/ai-vectordb@5.36.0
  - @memberjunction/ai-vectors-pinecone@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 9580189: Fix keyset (AfterKey) pagination infinite loop in vector sync. `GenerateRunViewFingerprint` omitted `AfterKey`, so sequential keyset pages produced identical fingerprints and the dedup/linger layer returned page N's result for page N+1, freezing the seek cursor (observed on multi-page entities like a 2k-row Members table). The fingerprint now includes `AfterKey` (appended only when present, so non-keyset fingerprints are unchanged), fixing all keyset callers. The vectorizer's page reads now also set `BypassCache` since full-table sweeps read each page once, and `EntityVectorSyncer` halts with a clear error if the cursor ever fails to advance.
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
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ai-prompts@5.35.0
  - @memberjunction/ai-vectors@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-vectordb@5.35.0
  - @memberjunction/ai-vectors-pinecone@5.35.0
  - @memberjunction/credentials@5.35.0
  - @memberjunction/templates-base-types@5.35.0
  - @memberjunction/templates@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-prompts@5.34.1
  - @memberjunction/ai-vectors@5.34.1
  - @memberjunction/ai-vectordb@5.34.1
  - @memberjunction/ai-vectors-pinecone@5.34.1
  - @memberjunction/credentials@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/templates-base-types@5.34.1
  - @memberjunction/templates@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- cfffb6d: Add keyset (seek) pagination to `RunView` via the new `RunViewParams.AfterKey: CompositeKey` field. Iterating large entities (background jobs, scheduled actions, bulk processing) now stays O(log N) per page regardless of depth — `StartRow`-based OFFSET pagination is unchanged and remains the right choice for UI grids.

  **Framework changes**
  - New `RunViewParams.AfterKey: CompositeKey` accepted by all RunView entry points (TS, GraphQL, REST flows that go through RunView).
  - New exported error class `AfterKeyNotSupportedError` (with `Reason` codes `CompositePK | UnsupportedPKType | IncompatibleOrderBy | StartRowConflict | AfterKeyShape`).
  - New exported helper `IsKeysetPaginationOrderableType(sqlType)` and constant `KEYSET_PAGINATION_ORDERABLE_PK_TYPES`.
  - Keyset queries bypass server cache (read + write) automatically — they're inherently single-use so caching is pure overhead.
  - v1 constraint: single-column PK only. Composite-PK entities throw `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`.

  **Migrated callers (now use keyset by default when entity has a single-column PK)**
  - `ScheduledGeocodingAction` (`processMissingForEntity`) — falls back to OFFSET on composite-PK entities.
  - `VectorBase.PageRecordsByEntityID` + `EntityVectorSyncer.startDataPaging` — auto-promotes to keyset when possible. New helper `VectorBase.CanUseKeysetPagination()`. New optional `PageRecordsParams.AfterKey`.

  **Metadata**
  - `Geocoding Maintenance` scheduled job cron updated to weekly (Saturdays 2 AM UTC); description reworded to not hard-code a cadence. Administrators can adjust the `CronExpression` as needed.

  **Documentation**
  - New guide: `guides/KEYSET_PAGINATION_GUIDE.md`.
  - `CLAUDE.md` performance section updated.

  **Out of scope for v1**
  - `ExternalChangeDetection.ChangeDetector` uses `RunQuery` (saved queries with arbitrary SQL), which the framework can't safely rewrite. Stays on OFFSET; tracked as a follow-up.

  **Backwards compatibility**
  - Fully additive. Existing callers that don't pass `AfterKey` are unaffected.

- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-prompts@5.34.0
  - @memberjunction/ai-vectors@5.34.0
  - @memberjunction/ai-vectordb@5.34.0
  - @memberjunction/ai-vectors-pinecone@5.34.0
  - @memberjunction/credentials@5.34.0
  - @memberjunction/templates-base-types@5.34.0
  - @memberjunction/templates@5.34.0
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
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-vectors@5.33.0
  - @memberjunction/ai-vectordb@5.33.0
  - @memberjunction/ai-vectors-pinecone@5.33.0
  - @memberjunction/credentials@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/templates-base-types@5.33.0
  - @memberjunction/templates@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-prompts@5.32.0
  - @memberjunction/ai-vectors@5.32.0
  - @memberjunction/ai-vectordb@5.32.0
  - @memberjunction/ai-vectors-pinecone@5.32.0
  - @memberjunction/credentials@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/templates-base-types@5.32.0
  - @memberjunction/templates@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

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
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-prompts@5.31.0
  - @memberjunction/ai-vectors@5.31.0
  - @memberjunction/ai-vectordb@5.31.0
  - @memberjunction/ai-vectors-pinecone@5.31.0
  - @memberjunction/credentials@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/templates-base-types@5.31.0
  - @memberjunction/templates@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-prompts@5.30.1
- @memberjunction/ai-vectors@5.30.1
- @memberjunction/ai-vectordb@5.30.1
- @memberjunction/ai-vectors-pinecone@5.30.1
- @memberjunction/credentials@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/templates-base-types@5.30.1
- @memberjunction/templates@5.30.1

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
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ai-prompts@5.30.0
  - @memberjunction/ai-vectors@5.30.0
  - @memberjunction/ai-vectors-pinecone@5.30.0
  - @memberjunction/templates@5.30.0
  - @memberjunction/credentials@5.30.0
  - @memberjunction/templates-base-types@5.30.0
  - @memberjunction/ai-vectordb@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-prompts@5.29.0
  - @memberjunction/ai-vectors@5.29.0
  - @memberjunction/ai-vectordb@5.29.0
  - @memberjunction/ai-vectors-pinecone@5.29.0
  - @memberjunction/credentials@5.29.0
  - @memberjunction/templates-base-types@5.29.0
  - @memberjunction/templates@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [fdab4bb]
- Updated dependencies [115e4da]
  - @memberjunction/ai-prompts@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vectors@5.28.0
  - @memberjunction/ai-vectordb@5.28.0
  - @memberjunction/ai-vectors-pinecone@5.28.0
  - @memberjunction/credentials@5.28.0
  - @memberjunction/templates-base-types@5.28.0
  - @memberjunction/templates@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-prompts@5.27.1
  - @memberjunction/ai-vectors@5.27.1
  - @memberjunction/ai-vectordb@5.27.1
  - @memberjunction/ai-vectors-pinecone@5.27.1
  - @memberjunction/credentials@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/templates-base-types@5.27.1
  - @memberjunction/templates@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-prompts@5.27.0
- @memberjunction/ai-vectors@5.27.0
- @memberjunction/ai-vectordb@5.27.0
- @memberjunction/ai-vectors-pinecone@5.27.0
- @memberjunction/credentials@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/templates-base-types@5.27.0
- @memberjunction/templates@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/ai-prompts@5.26.0
  - @memberjunction/ai-vectors@5.26.0
  - @memberjunction/credentials@5.26.0
  - @memberjunction/templates-base-types@5.26.0
  - @memberjunction/templates@5.26.0
  - @memberjunction/ai-vectordb@5.26.0
  - @memberjunction/ai-vectors-pinecone@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-prompts@5.25.0
  - @memberjunction/ai-vectors@5.25.0
  - @memberjunction/ai-vectordb@5.25.0
  - @memberjunction/ai-vectors-pinecone@5.25.0
  - @memberjunction/credentials@5.25.0
  - @memberjunction/templates-base-types@5.25.0
  - @memberjunction/templates@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ai-prompts@5.24.0
  - @memberjunction/ai-vectors@5.24.0
  - @memberjunction/ai-vectordb@5.24.0
  - @memberjunction/ai-vectors-pinecone@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/templates@5.24.0
  - @memberjunction/templates-base-types@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Minor Changes

- 513b20c: migration/metadata

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-prompts@5.23.0
  - @memberjunction/ai-vectors@5.23.0
  - @memberjunction/ai-vectordb@5.23.0
  - @memberjunction/ai-vectors-pinecone@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/templates-base-types@5.23.0
  - @memberjunction/templates@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-prompts@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ai-vectors-pinecone@5.22.0
  - @memberjunction/ai-vectors@5.22.0
  - @memberjunction/ai-vectordb@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/templates@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/templates-base-types@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- c7dfb20: no migration/metadata changes (yet)
- Updated dependencies [c7dfb20]
  - @memberjunction/ai-vectors-pinecone@5.21.0
  - @memberjunction/ai-vectors@5.21.0
  - @memberjunction/ai-vectordb@5.21.0
  - @memberjunction/core@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/templates-base-types@5.21.0
  - @memberjunction/templates@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-vectors-pinecone@5.20.0
  - @memberjunction/ai-vectors@5.20.0
  - @memberjunction/ai-vectordb@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/templates-base-types@5.20.0
  - @memberjunction/templates@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/ai-vectors-pinecone@5.19.0
- @memberjunction/ai-vectors@5.19.0
- @memberjunction/ai-vectordb@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/templates-base-types@5.19.0
- @memberjunction/templates@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/aiengine@5.18.0
- @memberjunction/ai-vectors@5.18.0
- @memberjunction/templates@5.18.0
- @memberjunction/ai-vectors-pinecone@5.18.0
- @memberjunction/ai@5.18.0
- @memberjunction/ai-vectordb@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/templates-base-types@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-vectors-pinecone@5.17.0
  - @memberjunction/ai-vectors@5.17.0
  - @memberjunction/ai-vectordb@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/templates-base-types@5.17.0
  - @memberjunction/templates@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/ai-vectors-pinecone@5.16.0
  - @memberjunction/ai-vectors@5.16.0
  - @memberjunction/ai-vectordb@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/templates-base-types@5.16.0
  - @memberjunction/templates@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-vectors-pinecone@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/ai-vectors@5.15.0
  - @memberjunction/ai-vectordb@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/templates-base-types@5.15.0
  - @memberjunction/templates@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-vectors-pinecone@5.14.0
  - @memberjunction/ai-vectors@5.14.0
  - @memberjunction/ai-vectordb@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/templates-base-types@5.14.0
  - @memberjunction/templates@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/ai-vectors-pinecone@5.13.0
  - @memberjunction/ai-vectors@5.13.0
  - @memberjunction/ai-vectordb@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/templates-base-types@5.13.0
  - @memberjunction/templates@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-vectors-pinecone@5.12.0
  - @memberjunction/ai-vectors@5.12.0
  - @memberjunction/ai-vectordb@5.12.0
  - @memberjunction/templates-base-types@5.12.0
  - @memberjunction/templates@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-vectors-pinecone@5.11.0
  - @memberjunction/ai-vectors@5.11.0
  - @memberjunction/ai-vectordb@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/templates-base-types@5.11.0
  - @memberjunction/templates@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-vectors-pinecone@5.10.1
- @memberjunction/ai-vectors@5.10.1
- @memberjunction/ai-vectordb@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/templates-base-types@5.10.1
- @memberjunction/templates@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/ai-vectors-pinecone@5.10.0
  - @memberjunction/ai-vectors@5.10.0
  - @memberjunction/ai-vectordb@5.10.0
  - @memberjunction/templates-base-types@5.10.0
  - @memberjunction/templates@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/ai-vectors@5.9.0
  - @memberjunction/templates-base-types@5.9.0
  - @memberjunction/templates@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/ai-vectors-pinecone@5.9.0
  - @memberjunction/ai-vectordb@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-vectors-pinecone@5.8.0
  - @memberjunction/ai-vectors@5.8.0
  - @memberjunction/ai-vectordb@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/templates-base-types@5.8.0
  - @memberjunction/templates@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/ai-vectors@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/templates@5.7.0
  - @memberjunction/ai-vectors-pinecone@5.7.0
  - @memberjunction/ai-vectordb@5.7.0
  - @memberjunction/templates-base-types@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-vectors-pinecone@5.6.0
  - @memberjunction/ai-vectors@5.6.0
  - @memberjunction/ai-vectordb@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/templates-base-types@5.6.0
  - @memberjunction/templates@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/ai-vectors-pinecone@5.5.0
  - @memberjunction/ai-vectors@5.5.0
  - @memberjunction/ai-vectordb@5.5.0
  - @memberjunction/templates-base-types@5.5.0
  - @memberjunction/templates@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-vectors-pinecone@5.4.1
- @memberjunction/ai-vectors@5.4.1
- @memberjunction/ai-vectordb@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/templates-base-types@5.4.1
- @memberjunction/templates@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-vectors@5.4.0
  - @memberjunction/templates-base-types@5.4.0
  - @memberjunction/templates@5.4.0
  - @memberjunction/ai-vectors-pinecone@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/ai-vectordb@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/ai-vectors-pinecone@5.3.1
- @memberjunction/ai-vectors@5.3.1
- @memberjunction/ai-vectordb@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/templates-base-types@5.3.1
- @memberjunction/templates@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-vectors@5.3.0
  - @memberjunction/templates-base-types@5.3.0
  - @memberjunction/templates@5.3.0
  - @memberjunction/ai-vectors-pinecone@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/ai-vectordb@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/aiengine@5.2.0
  - @memberjunction/ai-vectors@5.2.0
  - @memberjunction/templates-base-types@5.2.0
  - @memberjunction/templates@5.2.0
  - @memberjunction/ai-vectors-pinecone@5.2.0
  - @memberjunction/ai-vectordb@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/aiengine@5.1.0
  - @memberjunction/ai-vectors-pinecone@5.1.0
  - @memberjunction/ai-vectors@5.1.0
  - @memberjunction/ai-vectordb@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/templates-base-types@5.1.0
  - @memberjunction/templates@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/aiengine@5.0.0
  - @memberjunction/ai-vectors-pinecone@5.0.0
  - @memberjunction/ai-vectors@5.0.0
  - @memberjunction/ai-vectordb@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/templates-base-types@5.0.0
  - @memberjunction/templates@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/ai-vectors-pinecone@4.4.0
  - @memberjunction/ai-vectors@4.4.0
  - @memberjunction/ai-vectordb@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/templates-base-types@4.4.0
  - @memberjunction/templates@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-vectors-pinecone@4.3.1
- @memberjunction/ai-vectors@4.3.1
- @memberjunction/ai-vectordb@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/templates-base-types@4.3.1
- @memberjunction/templates@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-vectors-pinecone@4.3.0
  - @memberjunction/ai-vectors@4.3.0
  - @memberjunction/ai-vectordb@4.3.0
  - @memberjunction/templates-base-types@4.3.0
  - @memberjunction/templates@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/ai-vectors-pinecone@4.2.0
- @memberjunction/ai-vectors@4.2.0
- @memberjunction/ai-vectordb@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/templates-base-types@4.2.0
- @memberjunction/templates@4.2.0

## 4.1.0

### Patch Changes

- 9fab8ca: ESM Compatibility
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/templates@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-vectors-pinecone@4.1.0
  - @memberjunction/ai-vectors@4.1.0
  - @memberjunction/ai-vectordb@4.1.0
  - @memberjunction/templates-base-types@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/ai-vectors@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-vectors-pinecone@4.0.0
  - @memberjunction/ai-vectordb@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/templates-base-types@4.0.0
  - @memberjunction/templates@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/templates@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-vectors@3.4.0
  - @memberjunction/templates-base-types@3.4.0
  - @memberjunction/ai-vectors-pinecone@3.4.0
  - @memberjunction/ai-vectordb@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/ai-vectors@3.3.0
  - @memberjunction/templates-base-types@3.3.0
  - @memberjunction/templates@3.3.0
  - @memberjunction/ai-vectors-pinecone@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/ai-vectordb@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/ai-vectors@3.2.0
  - @memberjunction/templates-base-types@3.2.0
  - @memberjunction/templates@3.2.0
  - @memberjunction/ai-vectors-pinecone@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/ai-vectordb@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/ai-vectors-pinecone@3.1.1
- @memberjunction/ai-vectors@3.1.1
- @memberjunction/ai-vectordb@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/templates-base-types@3.1.1
- @memberjunction/templates@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/ai-vectors-pinecone@3.0.0
- @memberjunction/ai-vectors@3.0.0
- @memberjunction/ai-vectordb@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/templates-base-types@3.0.0
- @memberjunction/templates@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-vectors-pinecone@2.133.0
  - @memberjunction/ai-vectors@2.133.0
  - @memberjunction/ai-vectordb@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/templates-base-types@2.133.0
  - @memberjunction/templates@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-vectors-pinecone@2.132.0
  - @memberjunction/ai-vectors@2.132.0
  - @memberjunction/ai-vectordb@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/templates-base-types@2.132.0
  - @memberjunction/templates@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-vectors-pinecone@2.131.0
  - @memberjunction/ai-vectors@2.131.0
  - @memberjunction/ai-vectordb@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/templates-base-types@2.131.0
  - @memberjunction/templates@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-vectors-pinecone@2.130.1
- @memberjunction/ai-vectors@2.130.1
- @memberjunction/ai-vectordb@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/templates-base-types@2.130.1
- @memberjunction/templates@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ai-vectors@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/templates@2.130.0
  - @memberjunction/ai-vectors-pinecone@2.130.0
  - @memberjunction/ai-vectordb@2.130.0
  - @memberjunction/templates-base-types@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/ai-vectors-pinecone@2.129.0
  - @memberjunction/ai-vectors@2.129.0
  - @memberjunction/ai-vectordb@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/templates-base-types@2.129.0
  - @memberjunction/templates@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/ai-vectors-pinecone@2.128.0
  - @memberjunction/ai-vectors@2.128.0
  - @memberjunction/ai-vectordb@2.128.0
  - @memberjunction/templates-base-types@2.128.0
  - @memberjunction/templates@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-vectors-pinecone@2.127.0
  - @memberjunction/ai-vectors@2.127.0
  - @memberjunction/ai-vectordb@2.127.0
  - @memberjunction/templates-base-types@2.127.0
  - @memberjunction/templates@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/ai-vectors-pinecone@2.126.1
- @memberjunction/ai-vectors@2.126.1
- @memberjunction/ai-vectordb@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/templates-base-types@2.126.1
- @memberjunction/templates@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-vectors-pinecone@2.126.0
  - @memberjunction/ai-vectors@2.126.0
  - @memberjunction/ai-vectordb@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/templates-base-types@2.126.0
  - @memberjunction/templates@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/ai-vectors-pinecone@2.125.0
  - @memberjunction/ai-vectors@2.125.0
  - @memberjunction/ai-vectordb@2.125.0
  - @memberjunction/templates-base-types@2.125.0
  - @memberjunction/templates@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/ai-vectors-pinecone@2.124.0
  - @memberjunction/ai-vectors@2.124.0
  - @memberjunction/ai-vectordb@2.124.0
  - @memberjunction/templates-base-types@2.124.0
  - @memberjunction/templates@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-vectors-pinecone@2.123.1
- @memberjunction/ai-vectors@2.123.1
- @memberjunction/ai-vectordb@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/templates-base-types@2.123.1
- @memberjunction/templates@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/aiengine@2.123.0
- @memberjunction/ai-vectors-pinecone@2.123.0
- @memberjunction/ai-vectors@2.123.0
- @memberjunction/templates@2.123.0
- @memberjunction/ai@2.123.0
- @memberjunction/ai-vectordb@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0
- @memberjunction/templates-base-types@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/ai-vectors@2.122.2
  - @memberjunction/templates-base-types@2.122.2
  - @memberjunction/templates@2.122.2
  - @memberjunction/ai-vectors-pinecone@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/ai-vectordb@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/ai-vectors-pinecone@2.122.1
- @memberjunction/ai-vectors@2.122.1
- @memberjunction/ai-vectordb@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/templates-base-types@2.122.1
- @memberjunction/templates@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/ai-vectors-pinecone@2.122.0
  - @memberjunction/ai-vectors@2.122.0
  - @memberjunction/ai-vectordb@2.122.0
  - @memberjunction/templates-base-types@2.122.0
  - @memberjunction/templates@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/ai-vectors-pinecone@2.121.0
  - @memberjunction/ai-vectors@2.121.0
  - @memberjunction/ai-vectordb@2.121.0
  - @memberjunction/templates-base-types@2.121.0
  - @memberjunction/templates@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/ai-vectors-pinecone@2.120.0
  - @memberjunction/ai-vectors@2.120.0
  - @memberjunction/ai-vectordb@2.120.0
  - @memberjunction/templates-base-types@2.120.0
  - @memberjunction/templates@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/ai-vectors-pinecone@2.119.0
  - @memberjunction/ai-vectors@2.119.0
  - @memberjunction/ai-vectordb@2.119.0
  - @memberjunction/templates-base-types@2.119.0
  - @memberjunction/templates@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [78721d8]
  - @memberjunction/core@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/ai-vectors@2.118.0
  - @memberjunction/templates-base-types@2.118.0
  - @memberjunction/templates@2.118.0
  - @memberjunction/ai-vectors-pinecone@2.118.0
  - @memberjunction/ai-vectordb@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/aiengine@2.117.0
  - @memberjunction/ai-vectors-pinecone@2.117.0
  - @memberjunction/ai-vectors@2.117.0
  - @memberjunction/ai-vectordb@2.117.0
  - @memberjunction/templates-base-types@2.117.0
  - @memberjunction/templates@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/aiengine@2.116.0
  - @memberjunction/ai-vectors-pinecone@2.116.0
  - @memberjunction/ai-vectors@2.116.0
  - @memberjunction/ai-vectordb@2.116.0
  - @memberjunction/templates-base-types@2.116.0
  - @memberjunction/templates@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [2e0fe8b]
  - @memberjunction/aiengine@2.115.0
  - @memberjunction/ai-vectors-pinecone@2.115.0
  - @memberjunction/ai-vectors@2.115.0
  - @memberjunction/templates@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-vectordb@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/global@2.115.0
  - @memberjunction/templates-base-types@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/aiengine@2.114.0
- @memberjunction/ai-vectors-pinecone@2.114.0
- @memberjunction/ai-vectors@2.114.0
- @memberjunction/ai-vectordb@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/templates-base-types@2.114.0
- @memberjunction/templates@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/aiengine@2.113.2
  - @memberjunction/ai-vectors-pinecone@2.113.2
  - @memberjunction/ai-vectors@2.113.2
  - @memberjunction/ai-vectordb@2.113.2
  - @memberjunction/templates-base-types@2.113.2
  - @memberjunction/templates@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
  - @memberjunction/aiengine@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-vectors-pinecone@2.112.0
  - @memberjunction/ai-vectors@2.112.0
  - @memberjunction/templates@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/ai-vectordb@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/templates-base-types@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/aiengine@2.110.1
- @memberjunction/ai-vectors-pinecone@2.110.1
- @memberjunction/ai-vectors@2.110.1
- @memberjunction/ai-vectordb@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/templates-base-types@2.110.1
- @memberjunction/templates@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/aiengine@2.110.0
- @memberjunction/ai-vectors@2.110.0
- @memberjunction/templates-base-types@2.110.0
- @memberjunction/templates@2.110.0
- @memberjunction/ai-vectors-pinecone@2.110.0
- @memberjunction/ai@2.110.0
- @memberjunction/ai-vectordb@2.110.0
- @memberjunction/core@2.110.0
- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [a38989b]
  - @memberjunction/aiengine@2.109.0
  - @memberjunction/ai-vectors@2.109.0
  - @memberjunction/templates-base-types@2.109.0
  - @memberjunction/templates@2.109.0
  - @memberjunction/ai-vectors-pinecone@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/ai-vectordb@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [687e2ae]
- Updated dependencies [656d86c]
  - @memberjunction/aiengine@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/ai-vectors-pinecone@2.108.0
  - @memberjunction/ai-vectors@2.108.0
  - @memberjunction/templates@2.108.0
  - @memberjunction/templates-base-types@2.108.0
  - @memberjunction/ai-vectordb@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/aiengine@2.107.0
- @memberjunction/ai-vectors-pinecone@2.107.0
- @memberjunction/ai-vectors@2.107.0
- @memberjunction/ai-vectordb@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/templates-base-types@2.107.0
- @memberjunction/templates@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/aiengine@2.106.0
- @memberjunction/ai-vectors-pinecone@2.106.0
- @memberjunction/ai-vectors@2.106.0
- @memberjunction/ai-vectordb@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/templates-base-types@2.106.0
- @memberjunction/templates@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [9b67e0c]
  - @memberjunction/ai@2.105.0
  - @memberjunction/aiengine@2.105.0
  - @memberjunction/ai-vectors-pinecone@2.105.0
  - @memberjunction/templates-base-types@2.105.0
  - @memberjunction/templates@2.105.0
  - @memberjunction/ai-vectors@2.105.0
  - @memberjunction/ai-vectordb@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [aafa827]
- Updated dependencies [2ff5428]
  - @memberjunction/ai-openai@2.104.0
  - @memberjunction/global@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/aiengine@2.104.0
  - @memberjunction/ai-mistral@2.104.0
  - @memberjunction/ai-vectors-pinecone@2.104.0
  - @memberjunction/ai-vectors@2.104.0
  - @memberjunction/ai-vectordb@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/templates-base-types@2.104.0
  - @memberjunction/templates@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
  - @memberjunction/core@2.103.0
  - @memberjunction/ai-vectors-pinecone@2.103.0
  - @memberjunction/ai-mistral@2.103.0
  - @memberjunction/templates-base-types@2.103.0
  - @memberjunction/ai-openai@2.103.0
  - @memberjunction/ai-vectordb@2.103.0
  - @memberjunction/templates@2.103.0
  - @memberjunction/ai-vectors@2.103.0
  - @memberjunction/aiengine@2.103.0
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/aiengine@2.100.3
- @memberjunction/ai-vectors@2.100.3
- @memberjunction/templates-base-types@2.100.3
- @memberjunction/templates@2.100.3
- @memberjunction/ai-vectors-pinecone@2.100.3
- @memberjunction/ai@2.100.3
- @memberjunction/ai-mistral@2.100.3
- @memberjunction/ai-openai@2.100.3
- @memberjunction/ai-vectordb@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/aiengine@2.100.2
- @memberjunction/ai-mistral@2.100.2
- @memberjunction/ai-openai@2.100.2
- @memberjunction/ai-vectors-pinecone@2.100.2
- @memberjunction/ai-vectors@2.100.2
- @memberjunction/ai-vectordb@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/global@2.100.2
- @memberjunction/templates-base-types@2.100.2
- @memberjunction/templates@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/aiengine@2.100.1
- @memberjunction/ai-mistral@2.100.1
- @memberjunction/ai-openai@2.100.1
- @memberjunction/ai-vectors-pinecone@2.100.1
- @memberjunction/ai-vectors@2.100.1
- @memberjunction/ai-vectordb@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/templates-base-types@2.100.1
- @memberjunction/templates@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
  - @memberjunction/core@2.100.0
  - @memberjunction/aiengine@2.100.0
  - @memberjunction/ai-vectors-pinecone@2.100.0
  - @memberjunction/ai-vectors@2.100.0
  - @memberjunction/ai-vectordb@2.100.0
  - @memberjunction/templates-base-types@2.100.0
  - @memberjunction/templates@2.100.0
  - @memberjunction/ai@2.100.0
  - @memberjunction/ai-mistral@2.100.0
  - @memberjunction/ai-openai@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [8bbb0a9]
  - @memberjunction/core@2.99.0
  - @memberjunction/aiengine@2.99.0
  - @memberjunction/ai-vectors@2.99.0
  - @memberjunction/templates-base-types@2.99.0
  - @memberjunction/templates@2.99.0
  - @memberjunction/ai-vectors-pinecone@2.99.0
  - @memberjunction/ai-vectordb@2.99.0
  - @memberjunction/ai@2.99.0
  - @memberjunction/ai-mistral@2.99.0
  - @memberjunction/ai-openai@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/aiengine@2.98.0
- @memberjunction/ai-mistral@2.98.0
- @memberjunction/ai-openai@2.98.0
- @memberjunction/ai-vectors-pinecone@2.98.0
- @memberjunction/ai-vectors@2.98.0
- @memberjunction/ai-vectordb@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/templates-base-types@2.98.0
- @memberjunction/templates@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/aiengine@2.97.0
- @memberjunction/ai-vectors@2.97.0
- @memberjunction/templates-base-types@2.97.0
- @memberjunction/templates@2.97.0
- @memberjunction/ai-vectors-pinecone@2.97.0
- @memberjunction/ai@2.97.0
- @memberjunction/ai-mistral@2.97.0
- @memberjunction/ai-openai@2.97.0
- @memberjunction/ai-vectordb@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/aiengine@2.96.0
  - @memberjunction/ai-vectors-pinecone@2.96.0
  - @memberjunction/ai-vectors@2.96.0
  - @memberjunction/ai-vectordb@2.96.0
  - @memberjunction/templates-base-types@2.96.0
  - @memberjunction/templates@2.96.0
  - @memberjunction/ai@2.96.0
  - @memberjunction/ai-mistral@2.96.0
  - @memberjunction/ai-openai@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/aiengine@2.95.0
  - @memberjunction/ai-vectors-pinecone@2.95.0
  - @memberjunction/ai-vectors@2.95.0
  - @memberjunction/ai-vectordb@2.95.0
  - @memberjunction/templates-base-types@2.95.0
  - @memberjunction/templates@2.95.0
  - @memberjunction/ai@2.95.0
  - @memberjunction/ai-mistral@2.95.0
  - @memberjunction/ai-openai@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/aiengine@2.94.0
- @memberjunction/ai-vectors@2.94.0
- @memberjunction/templates-base-types@2.94.0
- @memberjunction/templates@2.94.0
- @memberjunction/ai-vectors-pinecone@2.94.0
- @memberjunction/ai@2.94.0
- @memberjunction/ai-mistral@2.94.0
- @memberjunction/ai-openai@2.94.0
- @memberjunction/ai-vectordb@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
  - @memberjunction/core@2.93.0
  - @memberjunction/aiengine@2.93.0
  - @memberjunction/ai-vectors-pinecone@2.93.0
  - @memberjunction/ai-vectors@2.93.0
  - @memberjunction/ai-vectordb@2.93.0
  - @memberjunction/templates-base-types@2.93.0
  - @memberjunction/templates@2.93.0
  - @memberjunction/ai@2.93.0
  - @memberjunction/ai-mistral@2.93.0
  - @memberjunction/ai-openai@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/aiengine@2.92.0
  - @memberjunction/ai-vectors-pinecone@2.92.0
  - @memberjunction/ai-vectors@2.92.0
  - @memberjunction/ai-vectordb@2.92.0
  - @memberjunction/templates-base-types@2.92.0
  - @memberjunction/templates@2.92.0
  - @memberjunction/ai@2.92.0
  - @memberjunction/ai-mistral@2.92.0
  - @memberjunction/ai-openai@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
  - @memberjunction/core@2.91.0
  - @memberjunction/aiengine@2.91.0
  - @memberjunction/ai-vectors-pinecone@2.91.0
  - @memberjunction/ai-vectors@2.91.0
  - @memberjunction/ai-vectordb@2.91.0
  - @memberjunction/templates-base-types@2.91.0
  - @memberjunction/templates@2.91.0
  - @memberjunction/ai@2.91.0
  - @memberjunction/ai-mistral@2.91.0
  - @memberjunction/ai-openai@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
  - @memberjunction/aiengine@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/ai-vectors-pinecone@2.90.0
  - @memberjunction/ai-vectors@2.90.0
  - @memberjunction/templates@2.90.0
  - @memberjunction/ai-vectordb@2.90.0
  - @memberjunction/templates-base-types@2.90.0
  - @memberjunction/ai@2.90.0
  - @memberjunction/ai-mistral@2.90.0
  - @memberjunction/ai-openai@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/aiengine@2.89.0
- @memberjunction/ai-vectors@2.89.0
- @memberjunction/templates-base-types@2.89.0
- @memberjunction/templates@2.89.0
- @memberjunction/ai-vectors-pinecone@2.89.0
- @memberjunction/ai@2.89.0
- @memberjunction/ai-mistral@2.89.0
- @memberjunction/ai-openai@2.89.0
- @memberjunction/ai-vectordb@2.89.0
- @memberjunction/core@2.89.0
- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/aiengine@2.88.0
- @memberjunction/ai-vectors@2.88.0
- @memberjunction/templates-base-types@2.88.0
- @memberjunction/templates@2.88.0
- @memberjunction/ai-vectors-pinecone@2.88.0
- @memberjunction/ai@2.88.0
- @memberjunction/ai-mistral@2.88.0
- @memberjunction/ai-openai@2.88.0
- @memberjunction/ai-vectordb@2.88.0
- @memberjunction/core@2.88.0
- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/aiengine@2.87.0
  - @memberjunction/ai-vectors-pinecone@2.87.0
  - @memberjunction/ai-vectors@2.87.0
  - @memberjunction/ai-vectordb@2.87.0
  - @memberjunction/templates-base-types@2.87.0
  - @memberjunction/templates@2.87.0
  - @memberjunction/ai@2.87.0
  - @memberjunction/ai-mistral@2.87.0
  - @memberjunction/ai-openai@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/aiengine@2.86.0
- @memberjunction/ai-vectors@2.86.0
- @memberjunction/templates-base-types@2.86.0
- @memberjunction/templates@2.86.0
- @memberjunction/ai-vectors-pinecone@2.86.0
- @memberjunction/ai@2.86.0
- @memberjunction/ai-mistral@2.86.0
- @memberjunction/ai-openai@2.86.0
- @memberjunction/ai-vectordb@2.86.0
- @memberjunction/core@2.86.0
- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
- Updated dependencies [dbef064]
  - @memberjunction/ai@2.85.0
  - @memberjunction/ai-vectors@2.85.0
  - @memberjunction/aiengine@2.85.0
  - @memberjunction/ai-mistral@2.85.0
  - @memberjunction/ai-openai@2.85.0
  - @memberjunction/templates@2.85.0
  - @memberjunction/templates-base-types@2.85.0
  - @memberjunction/ai-vectors-pinecone@2.85.0
  - @memberjunction/ai-vectordb@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [75badca]
- Updated dependencies [0b9d691]
- Updated dependencies [25e3697]
  - @memberjunction/ai-openai@2.84.0
  - @memberjunction/core@2.84.0
  - @memberjunction/aiengine@2.84.0
  - @memberjunction/ai-vectors-pinecone@2.84.0
  - @memberjunction/ai-vectors@2.84.0
  - @memberjunction/ai-vectordb@2.84.0
  - @memberjunction/templates-base-types@2.84.0
  - @memberjunction/templates@2.84.0
  - @memberjunction/ai@2.84.0
  - @memberjunction/ai-mistral@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
  - @memberjunction/core@2.83.0
  - @memberjunction/aiengine@2.83.0
  - @memberjunction/ai-vectors-pinecone@2.83.0
  - @memberjunction/ai-vectors@2.83.0
  - @memberjunction/ai-vectordb@2.83.0
  - @memberjunction/templates-base-types@2.83.0
  - @memberjunction/templates@2.83.0
  - @memberjunction/ai@2.83.0
  - @memberjunction/ai-mistral@2.83.0
  - @memberjunction/ai-openai@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/aiengine@2.82.0
- @memberjunction/ai-vectors@2.82.0
- @memberjunction/templates-base-types@2.82.0
- @memberjunction/templates@2.82.0
- @memberjunction/ai-vectors-pinecone@2.82.0
- @memberjunction/ai@2.82.0
- @memberjunction/ai-mistral@2.82.0
- @memberjunction/ai-openai@2.82.0
- @memberjunction/ai-vectordb@2.82.0
- @memberjunction/core@2.82.0
- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/aiengine@2.81.0
  - @memberjunction/ai-vectors-pinecone@2.81.0
  - @memberjunction/ai-vectors@2.81.0
  - @memberjunction/ai-vectordb@2.81.0
  - @memberjunction/templates-base-types@2.81.0
  - @memberjunction/templates@2.81.0
  - @memberjunction/ai@2.81.0
  - @memberjunction/ai-mistral@2.81.0
  - @memberjunction/ai-openai@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/aiengine@2.80.1
- @memberjunction/ai-mistral@2.80.1
- @memberjunction/ai-openai@2.80.1
- @memberjunction/ai-vectors-pinecone@2.80.1
- @memberjunction/ai-vectors@2.80.1
- @memberjunction/ai-vectordb@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/templates-base-types@2.80.1
- @memberjunction/templates@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
  - @memberjunction/core@2.80.0
  - @memberjunction/aiengine@2.80.0
  - @memberjunction/ai-vectors-pinecone@2.80.0
  - @memberjunction/ai-vectors@2.80.0
  - @memberjunction/ai-vectordb@2.80.0
  - @memberjunction/templates-base-types@2.80.0
  - @memberjunction/templates@2.80.0
  - @memberjunction/ai@2.80.0
  - @memberjunction/ai-mistral@2.80.0
  - @memberjunction/ai-openai@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/ai-mistral@2.79.0
  - @memberjunction/ai-openai@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/ai-vectors@2.79.0
  - @memberjunction/templates-base-types@2.79.0
  - @memberjunction/templates@2.79.0
  - @memberjunction/ai-vectors-pinecone@2.79.0
  - @memberjunction/ai-vectordb@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
  - @memberjunction/ai@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/ai-mistral@2.78.0
  - @memberjunction/ai-openai@2.78.0
  - @memberjunction/ai-vectors@2.78.0
  - @memberjunction/templates@2.78.0
  - @memberjunction/templates-base-types@2.78.0
  - @memberjunction/ai-vectors-pinecone@2.78.0
  - @memberjunction/ai-vectordb@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/ai-vectors-pinecone@2.77.0
  - @memberjunction/ai-vectors@2.77.0
  - @memberjunction/ai-vectordb@2.77.0
  - @memberjunction/templates-base-types@2.77.0
  - @memberjunction/templates@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/ai-mistral@2.77.0
  - @memberjunction/ai-openai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [7dabb22]
  - @memberjunction/core@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/ai-vectors@2.76.0
  - @memberjunction/templates-base-types@2.76.0
  - @memberjunction/templates@2.76.0
  - @memberjunction/ai-vectors-pinecone@2.76.0
  - @memberjunction/ai-vectordb@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/ai-mistral@2.76.0
  - @memberjunction/ai-openai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/aiengine@2.75.0
- @memberjunction/ai-mistral@2.75.0
- @memberjunction/ai-openai@2.75.0
- @memberjunction/ai-vectors-pinecone@2.75.0
- @memberjunction/ai-vectors@2.75.0
- @memberjunction/ai-vectordb@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/global@2.75.0
- @memberjunction/templates-base-types@2.75.0
- @memberjunction/templates@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [d316670]
  - @memberjunction/core@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/ai-vectors@2.74.0
  - @memberjunction/templates-base-types@2.74.0
  - @memberjunction/templates@2.74.0
  - @memberjunction/ai-vectors-pinecone@2.74.0
  - @memberjunction/ai-vectordb@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/ai-mistral@2.74.0
  - @memberjunction/ai-openai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [26c2b03]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/ai-vectors-pinecone@2.73.0
  - @memberjunction/ai-vectors@2.73.0
  - @memberjunction/templates@2.73.0
  - @memberjunction/templates-base-types@2.73.0
  - @memberjunction/ai-mistral@2.73.0
  - @memberjunction/ai-openai@2.73.0
  - @memberjunction/ai-vectordb@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/aiengine@2.72.0
- @memberjunction/ai-vectors@2.72.0
- @memberjunction/templates-base-types@2.72.0
- @memberjunction/templates@2.72.0
- @memberjunction/ai-vectors-pinecone@2.72.0
- @memberjunction/ai@2.72.0
- @memberjunction/ai-mistral@2.72.0
- @memberjunction/ai-openai@2.72.0
- @memberjunction/ai-vectordb@2.72.0
- @memberjunction/core@2.72.0
- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/ai-mistral@2.71.0
  - @memberjunction/ai-openai@2.71.0
  - @memberjunction/ai-vectors-pinecone@2.71.0
  - @memberjunction/ai-vectors@2.71.0
  - @memberjunction/ai-vectordb@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/templates-base-types@2.71.0
  - @memberjunction/templates@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/ai-mistral@2.70.0
  - @memberjunction/ai-openai@2.70.0
  - @memberjunction/ai-vectors-pinecone@2.70.0
  - @memberjunction/ai-vectors@2.70.0
  - @memberjunction/ai-vectordb@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/templates-base-types@2.70.0
  - @memberjunction/templates@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/ai-vectors-pinecone@2.69.1
  - @memberjunction/ai-vectors@2.69.1
  - @memberjunction/ai-vectordb@2.69.1
  - @memberjunction/templates-base-types@2.69.1
  - @memberjunction/templates@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/ai-mistral@2.69.1
  - @memberjunction/ai-openai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/ai-vectors-pinecone@2.69.0
  - @memberjunction/ai-vectors@2.69.0
  - @memberjunction/ai-vectordb@2.69.0
  - @memberjunction/templates-base-types@2.69.0
  - @memberjunction/templates@2.69.0
  - @memberjunction/ai@2.69.0
  - @memberjunction/ai-mistral@2.69.0
  - @memberjunction/ai-openai@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/ai-vectors-pinecone@2.68.0
  - @memberjunction/ai-vectors@2.68.0
  - @memberjunction/ai-vectordb@2.68.0
  - @memberjunction/templates-base-types@2.68.0
  - @memberjunction/templates@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/ai-mistral@2.68.0
  - @memberjunction/ai-openai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/aiengine@2.67.0
- @memberjunction/ai-mistral@2.67.0
- @memberjunction/ai-openai@2.67.0
- @memberjunction/ai-vectors-pinecone@2.67.0
- @memberjunction/ai-vectors@2.67.0
- @memberjunction/ai-vectordb@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/global@2.67.0
- @memberjunction/templates-base-types@2.67.0
- @memberjunction/templates@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/aiengine@2.66.0
- @memberjunction/ai-vectors-pinecone@2.66.0
- @memberjunction/ai-vectors@2.66.0
- @memberjunction/templates@2.66.0
- @memberjunction/ai@2.66.0
- @memberjunction/ai-mistral@2.66.0
- @memberjunction/ai-openai@2.66.0
- @memberjunction/ai-vectordb@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/global@2.66.0
- @memberjunction/templates-base-types@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-mistral@2.65.0
  - @memberjunction/ai-openai@2.65.0
  - @memberjunction/ai-vectors@2.65.0
  - @memberjunction/templates@2.65.0
  - @memberjunction/ai-vectors-pinecone@2.65.0
  - @memberjunction/ai-vectordb@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/templates-base-types@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/aiengine@2.64.0
- @memberjunction/ai-vectors@2.64.0
- @memberjunction/templates-base-types@2.64.0
- @memberjunction/templates@2.64.0
- @memberjunction/ai-vectors-pinecone@2.64.0
- @memberjunction/ai@2.64.0
- @memberjunction/ai-mistral@2.64.0
- @memberjunction/ai-openai@2.64.0
- @memberjunction/ai-vectordb@2.64.0
- @memberjunction/core@2.64.0
- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-mistral@2.63.1
  - @memberjunction/ai-openai@2.63.1
  - @memberjunction/ai-vectors-pinecone@2.63.1
  - @memberjunction/ai-vectors@2.63.1
  - @memberjunction/ai-vectordb@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/templates-base-types@2.63.1
  - @memberjunction/templates@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/aiengine@2.63.0
- @memberjunction/ai-vectors@2.63.0
- @memberjunction/templates-base-types@2.63.0
- @memberjunction/templates@2.63.0
- @memberjunction/ai-vectors-pinecone@2.63.0
- @memberjunction/ai@2.63.0
- @memberjunction/ai-mistral@2.63.0
- @memberjunction/ai-openai@2.63.0
- @memberjunction/ai-vectordb@2.63.0
- @memberjunction/core@2.63.0
- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-mistral@2.62.0
  - @memberjunction/ai-openai@2.62.0
  - @memberjunction/ai-vectors@2.62.0
  - @memberjunction/templates@2.62.0
  - @memberjunction/templates-base-types@2.62.0
  - @memberjunction/ai-vectors-pinecone@2.62.0
  - @memberjunction/ai-vectordb@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/aiengine@2.61.0
- @memberjunction/ai-vectors-pinecone@2.61.0
- @memberjunction/ai-vectors@2.61.0
- @memberjunction/templates@2.61.0
- @memberjunction/ai@2.61.0
- @memberjunction/ai-mistral@2.61.0
- @memberjunction/ai-openai@2.61.0
- @memberjunction/ai-vectordb@2.61.0
- @memberjunction/core@2.61.0
- @memberjunction/global@2.61.0
- @memberjunction/templates-base-types@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/ai-vectors-pinecone@2.60.0
  - @memberjunction/ai-vectors@2.60.0
  - @memberjunction/ai-vectordb@2.60.0
  - @memberjunction/templates-base-types@2.60.0
  - @memberjunction/templates@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/ai-mistral@2.60.0
  - @memberjunction/ai-openai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-mistral@2.59.0
- @memberjunction/ai-openai@2.59.0
- @memberjunction/ai-vectors-pinecone@2.59.0
- @memberjunction/ai-vectors@2.59.0
- @memberjunction/ai-vectordb@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/templates-base-types@2.59.0
- @memberjunction/templates@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vectors-pinecone@2.58.0
  - @memberjunction/ai-vectors@2.58.0
  - @memberjunction/ai-vectordb@2.58.0
  - @memberjunction/templates-base-types@2.58.0
  - @memberjunction/templates@2.58.0
  - @memberjunction/ai-mistral@2.58.0
  - @memberjunction/ai-openai@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-vectors-pinecone@2.57.0
  - @memberjunction/ai-vectors@2.57.0
  - @memberjunction/ai-vectordb@2.57.0
  - @memberjunction/templates-base-types@2.57.0
  - @memberjunction/templates@2.57.0
  - @memberjunction/ai@2.57.0
  - @memberjunction/ai-mistral@2.57.0
  - @memberjunction/ai-openai@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/aiengine@2.56.0
- @memberjunction/ai-vectors@2.56.0
- @memberjunction/templates-base-types@2.56.0
- @memberjunction/templates@2.56.0
- @memberjunction/ai-vectors-pinecone@2.56.0
- @memberjunction/ai@2.56.0
- @memberjunction/ai-mistral@2.56.0
- @memberjunction/ai-openai@2.56.0
- @memberjunction/ai-vectordb@2.56.0
- @memberjunction/core@2.56.0
- @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/ai-mistral@2.55.0
  - @memberjunction/ai-openai@2.55.0
  - @memberjunction/ai-vectors@2.55.0
  - @memberjunction/templates@2.55.0
  - @memberjunction/ai-vectors-pinecone@2.55.0
  - @memberjunction/templates-base-types@2.55.0
  - @memberjunction/ai-vectordb@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-vectors-pinecone@2.54.0
  - @memberjunction/ai-vectors@2.54.0
  - @memberjunction/ai-vectordb@2.54.0
  - @memberjunction/templates-base-types@2.54.0
  - @memberjunction/templates@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/ai-mistral@2.54.0
  - @memberjunction/ai-openai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
  - @memberjunction/core@2.53.0
  - @memberjunction/templates@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-vectors-pinecone@2.53.0
  - @memberjunction/ai-vectors@2.53.0
  - @memberjunction/ai-vectordb@2.53.0
  - @memberjunction/templates-base-types@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/ai-mistral@2.53.0
  - @memberjunction/ai-openai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-mistral@2.52.0
  - @memberjunction/ai-openai@2.52.0
  - @memberjunction/ai-vectors-pinecone@2.52.0
  - @memberjunction/ai-vectors@2.52.0
  - @memberjunction/ai-vectordb@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/templates@2.52.0
  - @memberjunction/templates-base-types@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/ai-mistral@2.51.0
  - @memberjunction/ai-openai@2.51.0
  - @memberjunction/ai-vectors@2.51.0
  - @memberjunction/templates@2.51.0
  - @memberjunction/ai-vectors-pinecone@2.51.0
  - @memberjunction/ai-vectordb@2.51.0
  - @memberjunction/templates-base-types@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-mistral@2.50.0
- @memberjunction/ai-openai@2.50.0
- @memberjunction/ai-vectors-pinecone@2.50.0
- @memberjunction/ai-vectors@2.50.0
- @memberjunction/ai-vectordb@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/templates-base-types@2.50.0
- @memberjunction/templates@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-mistral@2.49.0
  - @memberjunction/ai-openai@2.49.0
  - @memberjunction/ai-vectors-pinecone@2.49.0
  - @memberjunction/ai-vectors@2.49.0
  - @memberjunction/ai-vectordb@2.49.0
  - @memberjunction/templates-base-types@2.49.0
  - @memberjunction/templates@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
  - @memberjunction/core@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vectors-pinecone@2.48.0
  - @memberjunction/ai-vectors@2.48.0
  - @memberjunction/ai-vectordb@2.48.0
  - @memberjunction/templates-base-types@2.48.0
  - @memberjunction/templates@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/ai-mistral@2.48.0
  - @memberjunction/ai-openai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/aiengine@2.47.0
- @memberjunction/ai-vectors-pinecone@2.47.0
- @memberjunction/ai-vectors@2.47.0
- @memberjunction/templates@2.47.0
- @memberjunction/ai@2.47.0
- @memberjunction/ai-mistral@2.47.0
- @memberjunction/ai-openai@2.47.0
- @memberjunction/ai-vectordb@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/global@2.47.0
- @memberjunction/templates-base-types@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-mistral@2.46.0
- @memberjunction/ai-openai@2.46.0
- @memberjunction/ai-vectors-pinecone@2.46.0
- @memberjunction/ai-vectors@2.46.0
- @memberjunction/ai-vectordb@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/templates-base-types@2.46.0
- @memberjunction/templates@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/ai-mistral@2.45.0
  - @memberjunction/ai-openai@2.45.0
  - @memberjunction/ai-vectors@2.45.0
  - @memberjunction/templates@2.45.0
  - @memberjunction/ai-vectors-pinecone@2.45.0
  - @memberjunction/templates-base-types@2.45.0
  - @memberjunction/ai-vectordb@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [d723c0c]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/templates@2.44.0
  - @memberjunction/templates-base-types@2.44.0
  - @memberjunction/ai-vectors-pinecone@2.44.0
  - @memberjunction/ai-vectors@2.44.0
  - @memberjunction/ai-mistral@2.44.0
  - @memberjunction/ai-openai@2.44.0
  - @memberjunction/ai-vectordb@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/templates@2.43.0
  - @memberjunction/aiengine@2.43.0
  - @memberjunction/ai-vectors-pinecone@2.43.0
  - @memberjunction/ai-vectors@2.43.0
  - @memberjunction/ai-vectordb@2.43.0
  - @memberjunction/templates-base-types@2.43.0
  - @memberjunction/ai@2.43.0
  - @memberjunction/ai-mistral@2.43.0
  - @memberjunction/ai-openai@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/aiengine@2.42.1
- @memberjunction/ai-mistral@2.42.1
- @memberjunction/ai-openai@2.42.1
- @memberjunction/ai-vectors-pinecone@2.42.1
- @memberjunction/ai-vectors@2.42.1
- @memberjunction/ai-vectordb@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/templates-base-types@2.42.1
- @memberjunction/templates@2.42.1

## 2.42.0

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/aiengine@2.42.0
  - @memberjunction/ai-mistral@2.42.0
  - @memberjunction/ai-openai@2.42.0
  - @memberjunction/ai-vectors@2.42.0
  - @memberjunction/templates@2.42.0
  - @memberjunction/ai-vectors-pinecone@2.42.0
  - @memberjunction/ai-vectordb@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/global@2.42.0
  - @memberjunction/templates-base-types@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
  - @memberjunction/core@2.41.0
  - @memberjunction/ai@2.41.0
  - @memberjunction/aiengine@2.41.0
  - @memberjunction/ai-vectors-pinecone@2.41.0
  - @memberjunction/ai-vectors@2.41.0
  - @memberjunction/ai-vectordb@2.41.0
  - @memberjunction/templates-base-types@2.41.0
  - @memberjunction/templates@2.41.0
  - @memberjunction/ai-mistral@2.41.0
  - @memberjunction/ai-openai@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [b6ce661]
- Updated dependencies [c9a8991]
  - @memberjunction/ai@2.40.0
  - @memberjunction/ai-openai@2.40.0
  - @memberjunction/ai-mistral@2.40.0
  - @memberjunction/templates@2.40.0
  - @memberjunction/aiengine@2.40.0
  - @memberjunction/ai-vectors@2.40.0
  - @memberjunction/ai-vectors-pinecone@2.40.0
  - @memberjunction/ai-vectordb@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/global@2.40.0
  - @memberjunction/templates-base-types@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
- Updated dependencies [0583a20]
- Updated dependencies [e93f580]
  - @memberjunction/ai@2.39.0
  - @memberjunction/ai-openai@2.39.0
  - @memberjunction/aiengine@2.39.0
  - @memberjunction/ai-mistral@2.39.0
  - @memberjunction/ai-vectors@2.39.0
  - @memberjunction/templates@2.39.0
  - @memberjunction/ai-vectors-pinecone@2.39.0
  - @memberjunction/templates-base-types@2.39.0
  - @memberjunction/ai-vectordb@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [3235b8b]
  - @memberjunction/ai-mistral@2.38.0
  - @memberjunction/aiengine@2.38.0
  - @memberjunction/ai-vectors@2.38.0
  - @memberjunction/templates-base-types@2.38.0
  - @memberjunction/templates@2.38.0
  - @memberjunction/ai-vectors-pinecone@2.38.0
  - @memberjunction/ai@2.38.0
  - @memberjunction/ai-openai@2.38.0
  - @memberjunction/ai-vectordb@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/aiengine@2.37.1
- @memberjunction/ai-mistral@2.37.1
- @memberjunction/ai-openai@2.37.1
- @memberjunction/ai-vectors-pinecone@2.37.1
- @memberjunction/ai-vectors@2.37.1
- @memberjunction/ai-vectordb@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/global@2.37.1
- @memberjunction/templates-base-types@2.37.1
- @memberjunction/templates@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/aiengine@2.37.0
- @memberjunction/ai-vectors@2.37.0
- @memberjunction/templates-base-types@2.37.0
- @memberjunction/templates@2.37.0
- @memberjunction/ai-vectors-pinecone@2.37.0
- @memberjunction/ai@2.37.0
- @memberjunction/ai-mistral@2.37.0
- @memberjunction/ai-openai@2.37.0
- @memberjunction/ai-vectordb@2.37.0
- @memberjunction/core@2.37.0
- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- b45b336: updated Embeddings->BaseEmbeddings
- Updated dependencies [d9defc9]
- Updated dependencies [38db5e1]
- Updated dependencies [9d709e2]
- Updated dependencies [577cc6a]
- Updated dependencies [b45b336]
  - @memberjunction/ai@2.36.1
  - @memberjunction/ai-mistral@2.36.1
  - @memberjunction/ai-openai@2.36.1
  - @memberjunction/core@2.36.1
  - @memberjunction/aiengine@2.36.1
  - @memberjunction/ai-vectors@2.36.1
  - @memberjunction/templates@2.36.1
  - @memberjunction/ai-vectors-pinecone@2.36.1
  - @memberjunction/ai-vectordb@2.36.1
  - @memberjunction/templates-base-types@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ai-vectors-pinecone@2.36.0
  - @memberjunction/ai-mistral@2.36.0
  - @memberjunction/templates-base-types@2.36.0
  - @memberjunction/ai-openai@2.36.0
  - @memberjunction/ai-vectordb@2.36.0
  - @memberjunction/templates@2.36.0
  - @memberjunction/ai-vectors@2.36.0
  - @memberjunction/aiengine@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/aiengine@2.35.1
  - @memberjunction/ai-vectors-pinecone@2.35.1
  - @memberjunction/ai-vectors@2.35.1
  - @memberjunction/ai-vectordb@2.35.1
  - @memberjunction/templates-base-types@2.35.1
  - @memberjunction/templates@2.35.1
  - @memberjunction/ai@2.35.1
  - @memberjunction/ai-mistral@2.35.1
  - @memberjunction/ai-openai@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- Updated dependencies [989a9b8]
- Updated dependencies [364f754]
  - @memberjunction/ai-openai@2.35.0
  - @memberjunction/ai@2.35.0
  - @memberjunction/aiengine@2.35.0
  - @memberjunction/ai-mistral@2.35.0
  - @memberjunction/ai-vectors-pinecone@2.35.0
  - @memberjunction/ai-vectors@2.35.0
  - @memberjunction/ai-vectordb@2.35.0
  - @memberjunction/core@2.35.0
  - @memberjunction/global@2.35.0
  - @memberjunction/templates-base-types@2.35.0
  - @memberjunction/templates@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/aiengine@2.34.2
- @memberjunction/ai-mistral@2.34.2
- @memberjunction/ai-openai@2.34.2
- @memberjunction/ai-vectors-pinecone@2.34.2
- @memberjunction/ai-vectors@2.34.2
- @memberjunction/ai-vectordb@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/templates-base-types@2.34.2
- @memberjunction/templates@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/aiengine@2.34.1
- @memberjunction/ai-mistral@2.34.1
- @memberjunction/ai-openai@2.34.1
- @memberjunction/ai-vectors-pinecone@2.34.1
- @memberjunction/ai-vectors@2.34.1
- @memberjunction/ai-vectordb@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/templates-base-types@2.34.1
- @memberjunction/templates@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/core@2.34.0
  - @memberjunction/ai@2.34.0
  - @memberjunction/ai-mistral@2.34.0
  - @memberjunction/ai-openai@2.34.0
  - @memberjunction/aiengine@2.34.0
  - @memberjunction/ai-vectors@2.34.0
  - @memberjunction/templates-base-types@2.34.0
  - @memberjunction/templates@2.34.0
  - @memberjunction/ai-vectors-pinecone@2.34.0
  - @memberjunction/ai-vectordb@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- efafd0e: Readme documentation, courtesy of Claude
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/ai-mistral@2.33.0
  - @memberjunction/ai-openai@2.33.0
  - @memberjunction/ai-vectors-pinecone@2.33.0
  - @memberjunction/ai-vectors@2.33.0
  - @memberjunction/ai-vectordb@2.33.0
  - @memberjunction/aiengine@2.33.0
  - @memberjunction/templates@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/global@2.33.0
  - @memberjunction/templates-base-types@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/aiengine@2.32.2
- @memberjunction/ai-mistral@2.32.2
- @memberjunction/ai-openai@2.32.2
- @memberjunction/ai-vectors-pinecone@2.32.2
- @memberjunction/ai-vectors@2.32.2
- @memberjunction/ai-vectordb@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/templates-base-types@2.32.2
- @memberjunction/templates@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/aiengine@2.32.1
- @memberjunction/ai-mistral@2.32.1
- @memberjunction/ai-openai@2.32.1
- @memberjunction/ai-vectors-pinecone@2.32.1
- @memberjunction/ai-vectors@2.32.1
- @memberjunction/ai-vectordb@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/templates-base-types@2.32.1
- @memberjunction/templates@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/aiengine@2.32.0
- @memberjunction/ai-mistral@2.32.0
- @memberjunction/ai-openai@2.32.0
- @memberjunction/ai-vectors-pinecone@2.32.0
- @memberjunction/ai-vectors@2.32.0
- @memberjunction/ai-vectordb@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/templates-base-types@2.32.0
- @memberjunction/templates@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [67c0b7f]
- Updated dependencies [b86a75d]
  - @memberjunction/aiengine@2.31.0
  - @memberjunction/templates@2.31.0
  - @memberjunction/ai-vectors-pinecone@2.31.0
  - @memberjunction/ai-vectors@2.31.0
  - @memberjunction/ai@2.31.0
  - @memberjunction/ai-mistral@2.31.0
  - @memberjunction/ai-openai@2.31.0
  - @memberjunction/ai-vectordb@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/global@2.31.0
  - @memberjunction/templates-base-types@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [97c69b4]
- Updated dependencies [a3ab749]
  - @memberjunction/ai-mistral@2.30.0
  - @memberjunction/aiengine@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/ai-vectors-pinecone@2.30.0
  - @memberjunction/ai-vectors@2.30.0
  - @memberjunction/templates@2.30.0
  - @memberjunction/templates-base-types@2.30.0
  - @memberjunction/ai@2.30.0
  - @memberjunction/ai-openai@2.30.0
  - @memberjunction/ai-vectordb@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/aiengine@2.29.2
  - @memberjunction/ai-vectors-pinecone@2.29.2
  - @memberjunction/ai-vectors@2.29.2
  - @memberjunction/ai-vectordb@2.29.2
  - @memberjunction/templates-base-types@2.29.2
  - @memberjunction/templates@2.29.2
  - @memberjunction/ai@2.29.2
  - @memberjunction/ai-mistral@2.29.2
  - @memberjunction/ai-openai@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/aiengine@2.28.0
  - @memberjunction/ai-vectors-pinecone@2.28.0
  - @memberjunction/ai-vectors@2.28.0
  - @memberjunction/ai-vectordb@2.28.0
  - @memberjunction/templates-base-types@2.28.0
  - @memberjunction/templates@2.28.0
  - @memberjunction/ai@2.28.0
  - @memberjunction/ai-mistral@2.28.0
  - @memberjunction/ai-openai@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/aiengine@2.27.1
- @memberjunction/ai-mistral@2.27.1
- @memberjunction/ai-openai@2.27.1
- @memberjunction/ai-vectors-pinecone@2.27.1
- @memberjunction/ai-vectors@2.27.1
- @memberjunction/ai-vectordb@2.27.1
- @memberjunction/core@2.27.1
- @memberjunction/global@2.27.1
- @memberjunction/templates-base-types@2.27.1
- @memberjunction/templates@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [b4d3cbc]
  - @memberjunction/core@2.27.0
  - @memberjunction/ai@2.27.0
  - @memberjunction/templates@2.27.0
  - @memberjunction/aiengine@2.27.0
  - @memberjunction/ai-vectors-pinecone@2.27.0
  - @memberjunction/ai-vectors@2.27.0
  - @memberjunction/ai-vectordb@2.27.0
  - @memberjunction/templates-base-types@2.27.0
  - @memberjunction/ai-mistral@2.27.0
  - @memberjunction/ai-openai@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/aiengine@2.26.1
- @memberjunction/ai-mistral@2.26.1
- @memberjunction/ai-openai@2.26.1
- @memberjunction/ai-vectors-pinecone@2.26.1
- @memberjunction/ai-vectors@2.26.1
- @memberjunction/ai-vectordb@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/templates-base-types@2.26.1
- @memberjunction/templates@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/aiengine@2.26.0
  - @memberjunction/ai-vectors-pinecone@2.26.0
  - @memberjunction/ai-vectors@2.26.0
  - @memberjunction/ai-vectordb@2.26.0
  - @memberjunction/templates-base-types@2.26.0
  - @memberjunction/templates@2.26.0
  - @memberjunction/ai@2.26.0
  - @memberjunction/ai-mistral@2.26.0
  - @memberjunction/ai-openai@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/aiengine@2.25.0
  - @memberjunction/ai-vectors-pinecone@2.25.0
  - @memberjunction/ai-vectors@2.25.0
  - @memberjunction/ai-vectordb@2.25.0
  - @memberjunction/templates-base-types@2.25.0
  - @memberjunction/templates@2.25.0
  - @memberjunction/ai@2.25.0
  - @memberjunction/ai-mistral@2.25.0
  - @memberjunction/ai-openai@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ai@2.24.1
- @memberjunction/aiengine@2.24.1
- @memberjunction/ai-mistral@2.24.1
- @memberjunction/ai-openai@2.24.1
- @memberjunction/ai-vectors-pinecone@2.24.1
- @memberjunction/ai-vectors@2.24.1
- @memberjunction/ai-vectordb@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/templates-base-types@2.24.1
- @memberjunction/templates@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0
  - @memberjunction/ai@2.24.0
  - @memberjunction/aiengine@2.24.0
  - @memberjunction/ai-mistral@2.24.0
  - @memberjunction/ai-openai@2.24.0
  - @memberjunction/ai-vectors-pinecone@2.24.0
  - @memberjunction/ai-vectors@2.24.0
  - @memberjunction/ai-vectordb@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/templates-base-types@2.24.0
  - @memberjunction/templates@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ai@2.23.2
- @memberjunction/aiengine@2.23.2
- @memberjunction/ai-mistral@2.23.2
- @memberjunction/ai-openai@2.23.2
- @memberjunction/ai-vectors-pinecone@2.23.2
- @memberjunction/ai-vectors@2.23.2
- @memberjunction/ai-vectordb@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/templates-base-types@2.23.2
- @memberjunction/templates@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ai@2.23.1
- @memberjunction/aiengine@2.23.1
- @memberjunction/ai-mistral@2.23.1
- @memberjunction/ai-openai@2.23.1
- @memberjunction/ai-vectors-pinecone@2.23.1
- @memberjunction/ai-vectors@2.23.1
- @memberjunction/ai-vectordb@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/templates-base-types@2.23.1
- @memberjunction/templates@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ai@2.23.0
  - @memberjunction/aiengine@2.23.0
  - @memberjunction/ai-mistral@2.23.0
  - @memberjunction/ai-openai@2.23.0
  - @memberjunction/ai-vectors-pinecone@2.23.0
  - @memberjunction/ai-vectors@2.23.0
  - @memberjunction/ai-vectordb@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/templates-base-types@2.23.0
  - @memberjunction/templates@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/aiengine@2.22.2
  - @memberjunction/ai-vectors-pinecone@2.22.2
  - @memberjunction/ai-vectors@2.22.2
  - @memberjunction/ai-vectordb@2.22.2
  - @memberjunction/templates-base-types@2.22.2
  - @memberjunction/templates@2.22.2
  - @memberjunction/ai@2.22.2
  - @memberjunction/ai-mistral@2.22.2
  - @memberjunction/ai-openai@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ai@2.22.1
- @memberjunction/aiengine@2.22.1
- @memberjunction/ai-mistral@2.22.1
- @memberjunction/ai-openai@2.22.1
- @memberjunction/ai-vectors-pinecone@2.22.1
- @memberjunction/ai-vectors@2.22.1
- @memberjunction/ai-vectordb@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/templates-base-types@2.22.1
- @memberjunction/templates@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/aiengine@2.22.0
  - @memberjunction/ai-vectors-pinecone@2.22.0
  - @memberjunction/ai-vectors@2.22.0
  - @memberjunction/ai-vectordb@2.22.0
  - @memberjunction/templates-base-types@2.22.0
  - @memberjunction/templates@2.22.0
  - @memberjunction/ai@2.22.0
  - @memberjunction/ai-mistral@2.22.0
  - @memberjunction/ai-openai@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/ai-vectordb to v2.21.0
- Bump @memberjunction/ai-vectors to v2.21.0
- Bump @memberjunction/ai-vectors-pinecone to v2.21.0
- Bump @memberjunction/ai-mistral to v2.21.0
- Bump @memberjunction/aiengine to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/templates to v2.21.0
- Bump @memberjunction/templates-base-types to v2.21.0
- Bump @memberjunction/ai-openai to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/ai-vectordb to v2.20.3
- Bump @memberjunction/ai-vectors to v2.20.3
- Bump @memberjunction/ai-vectors-pinecone to v2.20.3
- Bump @memberjunction/ai-mistral to v2.20.3
- Bump @memberjunction/aiengine to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/templates to v2.20.3
- Bump @memberjunction/templates-base-types to v2.20.3
- Bump @memberjunction/ai-openai to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/ai-vectordb to v2.20.2
- Bump @memberjunction/ai-vectors to v2.20.2
- Bump @memberjunction/ai-vectors-pinecone to v2.20.2
- Bump @memberjunction/ai-mistral to v2.20.2
- Bump @memberjunction/aiengine to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/templates to v2.20.2
- Bump @memberjunction/templates-base-types to v2.20.2
- Bump @memberjunction/ai-openai to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/ai-vectordb to v2.20.1
- Bump @memberjunction/ai-vectors to v2.20.1
- Bump @memberjunction/ai-vectors-pinecone to v2.20.1
- Bump @memberjunction/ai-mistral to v2.20.1
- Bump @memberjunction/aiengine to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/templates to v2.20.1
- Bump @memberjunction/templates-base-types to v2.20.1
- Bump @memberjunction/ai-openai to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/ai-vectordb to v2.20.0
- Bump @memberjunction/ai-vectors to v2.20.0
- Bump @memberjunction/ai-vectors-pinecone to v2.20.0
- Bump @memberjunction/ai-mistral to v2.20.0
- Bump @memberjunction/aiengine to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/templates to v2.20.0
- Bump @memberjunction/templates-base-types to v2.20.0
- Bump @memberjunction/ai-openai to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/ai-vectordb to v2.19.5
- Bump @memberjunction/ai-vectors to v2.19.5
- Bump @memberjunction/ai-vectors-pinecone to v2.19.5
- Bump @memberjunction/ai-mistral to v2.19.5
- Bump @memberjunction/aiengine to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/templates to v2.19.5
- Bump @memberjunction/templates-base-types to v2.19.5
- Bump @memberjunction/ai-openai to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/ai-vectordb to v2.19.4
- Bump @memberjunction/ai-vectors to v2.19.4
- Bump @memberjunction/ai-vectors-pinecone to v2.19.4
- Bump @memberjunction/ai-mistral to v2.19.4
- Bump @memberjunction/aiengine to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/templates to v2.19.4
- Bump @memberjunction/templates-base-types to v2.19.4
- Bump @memberjunction/ai-openai to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/ai-vectordb to v2.19.3
- Bump @memberjunction/ai-vectors to v2.19.3
- Bump @memberjunction/ai-vectors-pinecone to v2.19.3
- Bump @memberjunction/ai-mistral to v2.19.3
- Bump @memberjunction/aiengine to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/templates to v2.19.3
- Bump @memberjunction/templates-base-types to v2.19.3
- Bump @memberjunction/ai-openai to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/ai-vectordb to v2.19.2
- Bump @memberjunction/ai-vectors to v2.19.2
- Bump @memberjunction/ai-vectors-pinecone to v2.19.2
- Bump @memberjunction/ai-mistral to v2.19.2
- Bump @memberjunction/aiengine to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/templates to v2.19.2
- Bump @memberjunction/templates-base-types to v2.19.2
- Bump @memberjunction/ai-openai to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/ai-vectordb to v2.19.1
- Bump @memberjunction/ai-vectors to v2.19.1
- Bump @memberjunction/ai-vectors-pinecone to v2.19.1
- Bump @memberjunction/ai-mistral to v2.19.1
- Bump @memberjunction/aiengine to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/templates to v2.19.1
- Bump @memberjunction/templates-base-types to v2.19.1
- Bump @memberjunction/ai-openai to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/ai-vectordb to v2.19.0
- Bump @memberjunction/ai-vectors to v2.19.0
- Bump @memberjunction/ai-vectors-pinecone to v2.19.0
- Bump @memberjunction/ai-mistral to v2.19.0
- Bump @memberjunction/aiengine to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/templates to v2.19.0
- Bump @memberjunction/templates-base-types to v2.19.0
- Bump @memberjunction/ai-openai to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/ai-vectordb to v2.18.3
- Bump @memberjunction/ai-vectors to v2.18.3
- Bump @memberjunction/ai-vectors-pinecone to v2.18.3
- Bump @memberjunction/ai-mistral to v2.18.3
- Bump @memberjunction/aiengine to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/templates to v2.18.3
- Bump @memberjunction/templates-base-types to v2.18.3
- Bump @memberjunction/ai-openai to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/ai-vectordb to v2.18.2
- Bump @memberjunction/ai-vectors to v2.18.2
- Bump @memberjunction/ai-vectors-pinecone to v2.18.2
- Bump @memberjunction/ai-mistral to v2.18.2
- Bump @memberjunction/aiengine to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/templates to v2.18.2
- Bump @memberjunction/templates-base-types to v2.18.2
- Bump @memberjunction/ai-openai to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/ai-vectordb to v2.18.1
- Bump @memberjunction/ai-vectors to v2.18.1
- Bump @memberjunction/ai-vectors-pinecone to v2.18.1
- Bump @memberjunction/ai-mistral to v2.18.1
- Bump @memberjunction/aiengine to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/templates to v2.18.1
- Bump @memberjunction/templates-base-types to v2.18.1
- Bump @memberjunction/ai-openai to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/ai-vectordb to v2.18.0
- Bump @memberjunction/ai-vectors to v2.18.0
- Bump @memberjunction/ai-vectors-pinecone to v2.18.0
- Bump @memberjunction/ai-mistral to v2.18.0
- Bump @memberjunction/aiengine to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/templates to v2.18.0
- Bump @memberjunction/templates-base-types to v2.18.0
- Bump @memberjunction/ai-openai to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/ai-vectordb to v2.17.0
- Bump @memberjunction/ai-vectors to v2.17.0
- Bump @memberjunction/ai-vectors-pinecone to v2.17.0
- Bump @memberjunction/ai-mistral to v2.17.0
- Bump @memberjunction/aiengine to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/templates to v2.17.0
- Bump @memberjunction/templates-base-types to v2.17.0
- Bump @memberjunction/ai-openai to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/ai-vectordb to v2.16.1
- Bump @memberjunction/ai-vectors to v2.16.1
- Bump @memberjunction/ai-vectors-pinecone to v2.16.1
- Bump @memberjunction/ai-mistral to v2.16.1
- Bump @memberjunction/aiengine to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/templates to v2.16.1
- Bump @memberjunction/templates-base-types to v2.16.1
- Bump @memberjunction/ai-openai to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/ai-vectordb to v2.16.0
- Bump @memberjunction/ai-vectors to v2.16.0
- Bump @memberjunction/ai-vectors-pinecone to v2.16.0
- Bump @memberjunction/ai-mistral to v2.16.0
- Bump @memberjunction/aiengine to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/templates to v2.16.0
- Bump @memberjunction/templates-base-types to v2.16.0
- Bump @memberjunction/ai-openai to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/ai-vectordb to v2.15.2
- Bump @memberjunction/ai-vectors to v2.15.2
- Bump @memberjunction/ai-vectors-pinecone to v2.15.2
- Bump @memberjunction/ai-mistral to v2.15.2
- Bump @memberjunction/aiengine to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/templates to v2.15.2
- Bump @memberjunction/templates-base-types to v2.15.2
- Bump @memberjunction/ai-openai to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/ai-vectordb to v2.14.0
- Bump @memberjunction/ai-vectors to v2.14.0
- Bump @memberjunction/ai-vectors-pinecone to v2.14.0
- Bump @memberjunction/ai-mistral to v2.14.0
- Bump @memberjunction/aiengine to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/templates to v2.14.0
- Bump @memberjunction/templates-base-types to v2.14.0
- Bump @memberjunction/ai-openai to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/ai-vectordb to v2.13.4
- Bump @memberjunction/ai-vectors to v2.13.4
- Bump @memberjunction/ai-vectors-pinecone to v2.13.4
- Bump @memberjunction/ai-mistral to v2.13.4
- Bump @memberjunction/aiengine to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/templates to v2.13.4
- Bump @memberjunction/templates-base-types to v2.13.4
- Bump @memberjunction/ai-openai to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/ai-vectordb to v2.13.3
- Bump @memberjunction/ai-vectors to v2.13.3
- Bump @memberjunction/ai-vectors-pinecone to v2.13.3
- Bump @memberjunction/ai-mistral to v2.13.3
- Bump @memberjunction/aiengine to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/templates to v2.13.3
- Bump @memberjunction/templates-base-types to v2.13.3
- Bump @memberjunction/ai-openai to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/ai-vectordb to v2.13.2
- Bump @memberjunction/ai-vectors to v2.13.2
- Bump @memberjunction/ai-vectors-pinecone to v2.13.2
- Bump @memberjunction/ai-mistral to v2.13.2
- Bump @memberjunction/aiengine to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/templates to v2.13.2
- Bump @memberjunction/templates-base-types to v2.13.2
- Bump @memberjunction/ai-openai to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/ai-vectordb to v2.13.1
- Bump @memberjunction/ai-vectors to v2.13.1
- Bump @memberjunction/ai-vectors-pinecone to v2.13.1
- Bump @memberjunction/ai-mistral to v2.13.1
- Bump @memberjunction/aiengine to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/templates to v2.13.1
- Bump @memberjunction/templates-base-types to v2.13.1
- Bump @memberjunction/ai-openai to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/ai-vectordb to v2.13.0
- Bump @memberjunction/ai-vectors to v2.13.0
- Bump @memberjunction/ai-vectors-pinecone to v2.13.0
- Bump @memberjunction/ai-mistral to v2.13.0
- Bump @memberjunction/aiengine to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/templates to v2.13.0
- Bump @memberjunction/templates-base-types to v2.13.0
- Bump @memberjunction/ai-openai to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/ai-vectordb to v2.12.0
- Bump @memberjunction/ai-vectors to v2.12.0
- Bump @memberjunction/ai-vectors-pinecone to v2.12.0
- Bump @memberjunction/ai-mistral to v2.12.0
- Bump @memberjunction/aiengine to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/templates to v2.12.0
- Bump @memberjunction/templates-base-types to v2.12.0
- Bump @memberjunction/ai-openai to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/ai-vectordb to v2.11.0
- Bump @memberjunction/ai-vectors to v2.11.0
- Bump @memberjunction/ai-vectors-pinecone to v2.11.0
- Bump @memberjunction/ai-mistral to v2.11.0
- Bump @memberjunction/aiengine to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/templates to v2.11.0
- Bump @memberjunction/templates-base-types to v2.11.0
- Bump @memberjunction/ai-openai to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/ai-vectordb to v2.10.0
- Bump @memberjunction/ai-vectors to v2.10.0
- Bump @memberjunction/ai-vectors-pinecone to v2.10.0
- Bump @memberjunction/ai-mistral to v2.10.0
- Bump @memberjunction/aiengine to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/templates to v2.10.0
- Bump @memberjunction/templates-base-types to v2.10.0
- Bump @memberjunction/ai-openai to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/ai-vectordb to v2.9.0
- Bump @memberjunction/ai-vectors to v2.9.0
- Bump @memberjunction/ai-vectors-pinecone to v2.9.0
- Bump @memberjunction/ai-mistral to v2.9.0
- Bump @memberjunction/aiengine to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/templates to v2.9.0
- Bump @memberjunction/templates-base-types to v2.9.0
- Bump @memberjunction/ai-openai to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/ai-vectordb to v2.8.0
- Bump @memberjunction/ai-vectors to v2.8.0
- Bump @memberjunction/ai-vectors-pinecone to v2.8.0
- Bump @memberjunction/ai-mistral to v2.8.0
- Bump @memberjunction/aiengine to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/templates to v2.8.0
- Bump @memberjunction/templates-base-types to v2.8.0
- Bump @memberjunction/ai-openai to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/ai-vectordb to v2.7.1
- Bump @memberjunction/ai-vectors to v2.7.1
- Bump @memberjunction/ai-vectors-pinecone to v2.7.1
- Bump @memberjunction/ai-mistral to v2.7.1
- Bump @memberjunction/aiengine to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/templates to v2.7.1
- Bump @memberjunction/templates-base-types to v2.7.1
- Bump @memberjunction/ai-openai to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/ai-vectordb to v2.7.0
- Bump @memberjunction/ai-vectors to v2.7.0
- Bump @memberjunction/ai-vectors-pinecone to v2.7.0
- Bump @memberjunction/ai-mistral to v2.7.0
- Bump @memberjunction/aiengine to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/templates to v2.7.0
- Bump @memberjunction/templates-base-types to v2.7.0
- Bump @memberjunction/ai-openai to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/ai-vectordb to v2.6.1
- Bump @memberjunction/ai-vectors to v2.6.1
- Bump @memberjunction/ai-vectors-pinecone to v2.6.1
- Bump @memberjunction/ai-mistral to v2.6.1
- Bump @memberjunction/aiengine to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/templates to v2.6.1
- Bump @memberjunction/templates-base-types to v2.6.1
- Bump @memberjunction/ai-openai to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/ai-vectordb to v2.6.0
- Bump @memberjunction/ai-vectors to v2.6.0
- Bump @memberjunction/ai-vectors-pinecone to v2.6.0
- Bump @memberjunction/ai-mistral to v2.6.0
- Bump @memberjunction/aiengine to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/templates to v2.6.0
- Bump @memberjunction/templates-base-types to v2.6.0
- Bump @memberjunction/ai-openai to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/ai-vectordb to v2.5.2
- Bump @memberjunction/ai-vectors to v2.5.2
- Bump @memberjunction/ai-vectors-pinecone to v2.5.2
- Bump @memberjunction/ai-mistral to v2.5.2
- Bump @memberjunction/aiengine to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/templates to v2.5.2
- Bump @memberjunction/templates-base-types to v2.5.2
- Bump @memberjunction/ai-openai to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/ai-vectordb to v2.5.1
- Bump @memberjunction/ai-vectors to v2.5.1
- Bump @memberjunction/ai-vectors-pinecone to v2.5.1
- Bump @memberjunction/ai-mistral to v2.5.1
- Bump @memberjunction/aiengine to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/templates to v2.5.1
- Bump @memberjunction/templates-base-types to v2.5.1
- Bump @memberjunction/ai-openai to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/ai-vectordb to v2.5.0
- Bump @memberjunction/ai-vectors to v2.5.0
- Bump @memberjunction/ai-vectors-pinecone to v2.5.0
- Bump @memberjunction/ai-mistral to v2.5.0
- Bump @memberjunction/aiengine to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/templates to v2.5.0
- Bump @memberjunction/templates-base-types to v2.5.0
- Bump @memberjunction/ai-openai to v2.5.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/ai-vectordb to v2.4.1
- Bump @memberjunction/ai-vectors to v2.4.1
- Bump @memberjunction/ai-vectors-pinecone to v2.4.1
- Bump @memberjunction/ai-mistral to v2.4.1
- Bump @memberjunction/aiengine to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/templates to v2.4.1
- Bump @memberjunction/templates-base-types to v2.4.1
- Bump @memberjunction/ai-openai to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/ai-vectordb to v2.4.0
- Bump @memberjunction/ai-vectors to v2.4.0
- Bump @memberjunction/ai-vectors-pinecone to v2.4.0
- Bump @memberjunction/ai-mistral to v2.4.0
- Bump @memberjunction/aiengine to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/templates to v2.4.0
- Bump @memberjunction/templates-base-types to v2.4.0
- Bump @memberjunction/ai-openai to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/ai-vectordb to v2.3.3
- Bump @memberjunction/ai-vectors to v2.3.3
- Bump @memberjunction/ai-vectors-pinecone to v2.3.3
- Bump @memberjunction/ai-mistral to v2.3.3
- Bump @memberjunction/aiengine to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/templates to v2.3.3
- Bump @memberjunction/templates-base-types to v2.3.3
- Bump @memberjunction/ai-openai to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/ai-vectordb to v2.3.2
- Bump @memberjunction/ai-vectors to v2.3.2
- Bump @memberjunction/ai-vectors-pinecone to v2.3.2
- Bump @memberjunction/ai-mistral to v2.3.2
- Bump @memberjunction/aiengine to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/templates to v2.3.2
- Bump @memberjunction/templates-base-types to v2.3.2
- Bump @memberjunction/ai-openai to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/ai-vectordb to v2.3.1
- Bump @memberjunction/ai-vectors to v2.3.1
- Bump @memberjunction/ai-vectors-pinecone to v2.3.1
- Bump @memberjunction/ai-mistral to v2.3.1
- Bump @memberjunction/aiengine to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/templates to v2.3.1
- Bump @memberjunction/templates-base-types to v2.3.1
- Bump @memberjunction/ai-openai to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/ai-vectordb to v2.3.0
- Bump @memberjunction/ai-vectors to v2.3.0
- Bump @memberjunction/ai-vectors-pinecone to v2.3.0
- Bump @memberjunction/ai-mistral to v2.3.0
- Bump @memberjunction/aiengine to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/templates to v2.3.0
- Bump @memberjunction/templates-base-types to v2.3.0
- Bump @memberjunction/ai-openai to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/ai-vectordb to v2.2.1
- Bump @memberjunction/ai-vectors to v2.2.1
- Bump @memberjunction/ai-vectors-pinecone to v2.2.1
- Bump @memberjunction/ai-mistral to v2.2.1
- Bump @memberjunction/aiengine to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/templates to v2.2.1
- Bump @memberjunction/templates-base-types to v2.2.1
- Bump @memberjunction/ai-openai to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/ai-vectordb to v2.2.0
- Bump @memberjunction/ai-vectors to v2.2.0
- Bump @memberjunction/ai-vectors-pinecone to v2.2.0
- Bump @memberjunction/ai-mistral to v2.2.0
- Bump @memberjunction/aiengine to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/templates to v2.2.0
- Bump @memberjunction/templates-base-types to v2.2.0
- Bump @memberjunction/ai-openai to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/ai-vectordb to v2.1.5
- Bump @memberjunction/ai-vectors to v2.1.5
- Bump @memberjunction/ai-vectors-pinecone to v2.1.5
- Bump @memberjunction/ai-mistral to v2.1.5
- Bump @memberjunction/aiengine to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/templates to v2.1.5
- Bump @memberjunction/templates-base-types to v2.1.5
- Bump @memberjunction/ai-openai to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/ai-vectordb to v2.1.4
- Bump @memberjunction/ai-vectors to v2.1.4
- Bump @memberjunction/ai-vectors-pinecone to v2.1.4
- Bump @memberjunction/ai-mistral to v2.1.4
- Bump @memberjunction/aiengine to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/templates to v2.1.4
- Bump @memberjunction/templates-base-types to v2.1.4
- Bump @memberjunction/ai-openai to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/ai-vectordb to v2.1.3
- Bump @memberjunction/ai-vectors to v2.1.3
- Bump @memberjunction/ai-vectors-pinecone to v2.1.3
- Bump @memberjunction/ai-mistral to v2.1.3
- Bump @memberjunction/aiengine to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/templates to v2.1.3
- Bump @memberjunction/templates-base-types to v2.1.3
- Bump @memberjunction/ai-openai to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/ai-vectordb to v2.1.2
- Bump @memberjunction/ai-vectors to v2.1.2
- Bump @memberjunction/ai-vectors-pinecone to v2.1.2
- Bump @memberjunction/ai-mistral to v2.1.2
- Bump @memberjunction/aiengine to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/templates to v2.1.2
- Bump @memberjunction/templates-base-types to v2.1.2
- Bump @memberjunction/ai-openai to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/ai-vectordb to v2.1.1
- Bump @memberjunction/ai-vectors to v2.1.1
- Bump @memberjunction/ai-vectors-pinecone to v2.1.1
- Bump @memberjunction/ai-mistral to v2.1.1
- Bump @memberjunction/aiengine to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/templates to v2.1.1
- Bump @memberjunction/templates-base-types to v2.1.1
- Bump @memberjunction/ai-openai to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/ai-vectordb to v1.8.1
- Bump @memberjunction/ai-vectors to v1.8.1
- Bump @memberjunction/aiengine to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/ai-vectordb to v1.8.0
- Bump @memberjunction/ai-vectors to v1.8.0
- Bump @memberjunction/aiengine to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/global to v1.8.0

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/ai-vectordb to v1.7.1
- Bump @memberjunction/ai-vectors to v1.7.1
- Bump @memberjunction/aiengine to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Minor changes

- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/ai-vectordb to v1.7.0
- Bump @memberjunction/ai-vectors to v1.7.0
- Bump @memberjunction/aiengine to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/global to v1.7.0

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/ai-vectordb to v1.6.1
- Bump @memberjunction/ai-vectors to v1.6.1
- Bump @memberjunction/aiengine to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/ai-vectordb to v1.6.0
- Bump @memberjunction/ai-vectors to v1.6.0
- Bump @memberjunction/aiengine to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/ai-vectordb to v1.5.3
- Bump @memberjunction/ai-vectors to v1.5.3
- Bump @memberjunction/aiengine to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/ai-vectordb to v1.5.2
- Bump @memberjunction/ai-vectors to v1.5.2
- Bump @memberjunction/aiengine to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/ai-vectordb to v1.5.1
- Bump @memberjunction/ai-vectors to v1.5.1
- Bump @memberjunction/aiengine to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/ai-vectordb to v1.5.0
- Bump @memberjunction/ai-vectors to v1.5.0
- Bump @memberjunction/aiengine to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:54 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/ai-vectordb to v1.4.1
- Bump @memberjunction/ai-vectors to v1.4.1
- Bump @memberjunction/aiengine to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/ai-vectordb to v1.4.0
- Bump @memberjunction/ai-vectors to v1.4.0
- Bump @memberjunction/aiengine to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/global to v1.4.0

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/ai-vectordb to v1.3.3
- Bump @memberjunction/ai-vectors to v1.3.3
- Bump @memberjunction/aiengine to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/ai-vectordb to v1.3.2
- Bump @memberjunction/ai-vectors to v1.3.2
- Bump @memberjunction/aiengine to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/ai-vectordb to v1.3.1
- Bump @memberjunction/ai-vectors to v1.3.1
- Bump @memberjunction/aiengine to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/ai-vectordb to v1.3.0
- Bump @memberjunction/ai-vectors to v1.3.0
- Bump @memberjunction/aiengine to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/global to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/ai-vectordb to v1.2.2
- Bump @memberjunction/ai-vectors to v1.2.2
- Bump @memberjunction/ai-vectors-pinecone to v1.2.2
- Bump @memberjunction/aiengine to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/sqlserver-dataprovider to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/ai-vectordb to v1.2.1
- Bump @memberjunction/ai-vectors to v1.2.1
- Bump @memberjunction/ai-vectors-pinecone to v1.2.1
- Bump @memberjunction/aiengine to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/sqlserver-dataprovider to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/ai-vectordb to v1.2.0
- Bump @memberjunction/ai-vectors to v1.2.0
- Bump @memberjunction/ai-vectors-pinecone to v1.2.0
- Bump @memberjunction/aiengine to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/sqlserver-dataprovider to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/ai-vectordb to v1.1.3
- Bump @memberjunction/ai-vectors to v1.1.3
- Bump @memberjunction/ai-vectors-pinecone to v1.1.3
- Bump @memberjunction/aiengine to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/sqlserver-dataprovider to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/ai-vectordb to v1.1.2
- Bump @memberjunction/ai-vectors to v1.1.2
- Bump @memberjunction/ai-vectors-pinecone to v1.1.2
- Bump @memberjunction/aiengine to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/sqlserver-dataprovider to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/ai-vectordb to v1.1.1
- Bump @memberjunction/ai-vectors to v1.1.1
- Bump @memberjunction/ai-vectors-pinecone to v1.1.1
- Bump @memberjunction/aiengine to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/sqlserver-dataprovider to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/ai-vectordb to v1.1.0
- Bump @memberjunction/ai-vectors to v1.1.0
- Bump @memberjunction/ai-vectors-pinecone to v1.1.0
- Bump @memberjunction/aiengine to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/sqlserver-dataprovider to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- fix VectorSync's package.json (155523863+JS-BC@users.noreply.github.com)
- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/ai-vectordb to v1.0.11
- Bump @memberjunction/ai-vectors to v1.0.11
- Bump @memberjunction/ai-vectors-pinecone to v1.0.11
- Bump @memberjunction/aiengine to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/sqlserver-dataprovider to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/ai-vectordb to v1.0.9
- Bump @memberjunction/ai-vectors to v1.0.9
- Bump @memberjunction/aiengine to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/sqlserver-dataprovider to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/ai-vectordb to v1.0.8
- Bump @memberjunction/ai-vectors to v1.0.8
- Bump @memberjunction/aiengine to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/sqlserver-dataprovider to v1.0.8
