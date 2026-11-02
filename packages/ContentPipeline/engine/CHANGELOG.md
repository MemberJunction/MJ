# @memberjunction/content-pipeline

## 6.2.0-edge.7

### Minor Changes

- c8c48e1: Add an `Upload` content source type for content an application pushes instead of the pipeline discovering it. `ContentUploadIngestor.Ingest` takes a stored `MJ: Files` row (plus an optional origin record, linked through `MJ: Entity Record Documents` using `CompositeKey.ToCompactURLSegment()` so search's origin check applies) and creates the Content Item with `URL = upload://<FileID>` and `CallerTitle` confidence on `Name`, then can run Extract, Segment, Tag, and Embed in order for that item; `Remove` detaches `FileID` on the root `upload://<FileID>` row and marks the item, its descendants, and their chunks for deletion. Discover and Sync skip push-only sources instead of failing, so uploaded items are never treated as orphans. Delete treats a stored file as the caller's if and only if the item's locator is `upload://<FileID>` (push-only sources get no special case and there is no "keep when unsure" path; items moved onto an Upload source must be re-ingested through `ContentUploadIngestor` so they receive the `upload://` locator, otherwise their file is treated as a pipeline copy). Embed skips a read-only vector index instead of retrying.

### Patch Changes

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [953086f]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [0b406e8]
- Updated dependencies [c018cb9]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [c8fb9d7]
- Updated dependencies [b0b2cc9]
  - @memberjunction/ai-core-plus@6.2.0-edge.7
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/aiengine@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/content-pipeline-base@6.2.0-edge.7
  - @memberjunction/content-autotagging@6.2.0-edge.7
  - @memberjunction/ai-prompts@6.2.0-edge.7
  - @memberjunction/tag-engine@6.2.0-edge.7
  - @memberjunction/record-set-processor@6.2.0-edge.7
  - @memberjunction/record-set-processor-base@6.2.0-edge.7
  - @memberjunction/ai-segmentation@6.2.0-edge.7
  - @memberjunction/ai-vectors@6.2.0-edge.7
  - @memberjunction/ai-vectordb@6.2.0-edge.7
  - @memberjunction/credentials@6.2.0-edge.7
  - @memberjunction/storage@6.2.0-edge.7
  - @memberjunction/document-parsing@6.2.0-edge.7
  - @memberjunction/network-utils@6.2.0-edge.7

## 6.2.0-edge.6

### Minor Changes

- 1090caa: Add the content pipeline framework: Discover, Extract, Tag, Segment, Embed and Delete stages that run over
  Content Sources, Items and Chunks through Record Set Processing's new `Pipeline Stage` work type. One
  working record passes between stages, each well-known field carrying a confidence score so stages resolve
  a shared field on merit. Only the hydrator and committer touch the database, so a test run is the same
  code with commits withheld.

  The stages reuse what MJ already has. Discover and Extract call the Content Source Type's existing driver
  (new optional `Discover` and `Fetch` on `AutotagBase`); file-type detection reads `MJ: Content File Types`
  (new `ByteSignature`, `IsText`, `ExtractorKey` columns, seeded in metadata); durable copies go through
  `FileStorageEngine.UploadFile`; Tag, Embed and Delete share the autotagger's prompt helpers and its new
  `ContentVectorInfrastructure`, which also routes a source or content type that names only a `VectorIndexID`
  (with no `EmbeddingModelID`) to that index using the index's own `EmbeddingModelID`. Document parsing moves
  into `@memberjunction/document-parsing`, used by Get File Content (which now trims extracted PDF and Word
  text) and the pipeline. Record Set Processing gains a per-work-type tracker pairing, so scheduled and
  on-change runs record the same detail rows as manual ones. Additionally, `AutotagLocalFileSystem` skips
  symbolic links and recurses into subfolders during tagging; `AutotagCloudStorage` normalizes extensions
  written with or without a leading dot and prefers the provider's first configured `MJ: File Storage Accounts`
  row over environment variables; `NormalizeAutotagKeywords` in `@memberjunction/content-autotagging` drops blank
  tag names; and `ContentItemTagBridge` in `@memberjunction/tag-engine` delegates `MJ: Tagged Items` creation to
  `TagEngine.CreateTaggedItem` (updating the stored weight on re-tagging).

### Patch Changes

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [fd84ab1]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/credentials@6.2.0-edge.6
  - @memberjunction/content-pipeline-base@6.2.0-edge.6
  - @memberjunction/document-parsing@6.2.0-edge.6
  - @memberjunction/record-set-processor-base@6.2.0-edge.6
  - @memberjunction/record-set-processor@6.2.0-edge.6
  - @memberjunction/content-autotagging@6.2.0-edge.6
  - @memberjunction/ai-vectordb@6.2.0-edge.6
  - @memberjunction/network-utils@6.2.0-edge.6
  - @memberjunction/tag-engine@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/storage@6.2.0-edge.6
  - @memberjunction/ai-segmentation@6.2.0-edge.6
  - @memberjunction/ai-vectors@6.2.0-edge.6
