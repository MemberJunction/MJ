# @memberjunction/content-pipeline-base

## 6.3.0-edge.0

### Patch Changes

- Updated dependencies [62eca59]
- Updated dependencies [4d2c52d]
- Updated dependencies [7ed32af]
- Updated dependencies [567d7b9]
- Updated dependencies [c07f654]
- Updated dependencies [9ec4dce]
- Updated dependencies [03bb8b6]
- Updated dependencies [0ebebfe]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [63636e0]
- Updated dependencies [abb285b]
- Updated dependencies [4884a47]
- Updated dependencies [5c3d369]
- Updated dependencies [b2789ee]
- Updated dependencies [31cc053]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [28cec7d]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0

## 6.2.0

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

- c8c48e1: Add an `Upload` content source type for content an application pushes instead of the pipeline discovering it. `ContentUploadIngestor.Ingest` takes a stored `MJ: Files` row (plus an optional origin record, linked through `MJ: Entity Record Documents` using `CompositeKey.ToCompactURLSegment()` so search's origin check applies) and creates the Content Item with `URL = upload://<FileID>` and `CallerTitle` confidence on `Name`, then can run Extract, Segment, Tag, and Embed in order for that item; `Remove` detaches `FileID` on the root `upload://<FileID>` row and marks the item, its descendants, and their chunks for deletion. Discover and Sync skip push-only sources instead of failing, so uploaded items are never treated as orphans. Delete treats a stored file as the caller's if and only if the item's locator is `upload://<FileID>` (push-only sources get no special case and there is no "keep when unsure" path; items moved onto an Upload source must be re-ingested through `ContentUploadIngestor` so they receive the `upload://` locator, otherwise their file is treated as a pipeline copy). Embed skips a read-only vector index instead of retrying.
- 539dfe3: Add Semantic Graph substrate (`MJ: Graph Types`, `MJ: Graph Concept Types`, `MJ: Graph Authority Tiers`, `MJ: Graphs`, `MJ: Graph Concepts`, `MJ: Graph Edge Types`, `MJ: Graph Edge Type Endpoints`, `MJ: Graph Edge Providers`, `MJ: Graph Edges`, and `ContentSource.GraphID`), Content Pipeline `GraphStage` with `EntityGraphOverlayStore` and `DeterministicConceptSynthesizer`, deterministic `TaskGraph` DAG similarity & workflow health telemetry in `@memberjunction/ai-core-plus`, and Semantic Graph & Canon Explorer UI in `@memberjunction/ng-graph-view` and `@memberjunction/ng-dashboards`.

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [6c36fb6]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [29b16ee]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [5e4205c]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [2274f42]
- Updated dependencies [0fb3649]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [4c0eaec]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [397ae9a]
- Updated dependencies [7e72c86]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [dc38250]
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0

## 6.2.0-edge.8

### Minor Changes

- 539dfe3: Add Semantic Graph substrate (`MJ: Graph Types`, `MJ: Graph Concept Types`, `MJ: Graph Authority Tiers`, `MJ: Graphs`, `MJ: Graph Concepts`, `MJ: Graph Edge Types`, `MJ: Graph Edge Type Endpoints`, `MJ: Graph Edge Providers`, `MJ: Graph Edges`, and `ContentSource.GraphID`), Content Pipeline `GraphStage` with `EntityGraphOverlayStore` and `DeterministicConceptSynthesizer`, deterministic `TaskGraph` DAG similarity & workflow health telemetry in `@memberjunction/ai-core-plus`, and Semantic Graph & Canon Explorer UI in `@memberjunction/ng-graph-view` and `@memberjunction/ng-dashboards`.

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [e69634e]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8

## 6.2.0-edge.7

### Minor Changes

- c8c48e1: Add an `Upload` content source type for content an application pushes instead of the pipeline discovering it. `ContentUploadIngestor.Ingest` takes a stored `MJ: Files` row (plus an optional origin record, linked through `MJ: Entity Record Documents` using `CompositeKey.ToCompactURLSegment()` so search's origin check applies) and creates the Content Item with `URL = upload://<FileID>` and `CallerTitle` confidence on `Name`, then can run Extract, Segment, Tag, and Embed in order for that item; `Remove` detaches `FileID` on the root `upload://<FileID>` row and marks the item, its descendants, and their chunks for deletion. Discover and Sync skip push-only sources instead of failing, so uploaded items are never treated as orphans. Delete treats a stored file as the caller's if and only if the item's locator is `upload://<FileID>` (push-only sources get no special case and there is no "keep when unsure" path; items moved onto an Upload source must be re-ingested through `ContentUploadIngestor` so they receive the `upload://` locator, otherwise their file is treated as a pipeline copy). Embed skips a read-only vector index instead of retrying.

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [29b16ee]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [397ae9a]
- Updated dependencies [4ef13d6]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7

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

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
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
