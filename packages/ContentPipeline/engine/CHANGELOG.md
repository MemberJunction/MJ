# @memberjunction/content-pipeline

## 6.3.0-edge.0

### Minor Changes

- 63636e0: Semantic graph runtime review fixes: every graph node is checked as the caller and every audience reader at the hop it is reached (row-level security applies; no Owner bypass), query permission uses `UserCanRun().canRun`, edge approval requires `Graph: Approve Edges` and fails closed, unknown or inactive graphs return nothing, `GraphEngine` loads lazily and caches stored edges for Preload graphs only, per-step reads are bounded and ordered, and the graph search lane ranks by hop-attenuated RRF. Ships the "MJ Canon" graph and its metadata providers, the `Graph: Approve Edges` authorization, the `Semantic Graph` search provider and the `Get Graph Context` action metadata, and registers the graph expansion service at MJAPI startup. The Content Pipeline Graph stage keeps auto-approving the Inferred edges its content source's GraphOverlay policy approves, through a server operation scope API callers cannot enter; every other edge that starts Approved, of any origin, requires `Graph: Approve Edges`. Graph seeds pass the same caller-and-audience check as expanded nodes; only Approved concepts seed or appear unless proposed content is asked for; node labels, edge text and concept matches use only fields every principal may read; editing, demoting or deleting an Approved edge needs the authorization and the review stamp is server-written; Preload graph edges load lazily and reload per graph.

### Patch Changes

- Updated dependencies [62eca59]
- Updated dependencies [4d2c52d]
- Updated dependencies [7ed32af]
- Updated dependencies [567d7b9]
- Updated dependencies [c07f654]
- Updated dependencies [9ec4dce]
- Updated dependencies [0d484c2]
- Updated dependencies [03bb8b6]
- Updated dependencies [a01e840]
- Updated dependencies [6555a44]
- Updated dependencies [3c4de2b]
- Updated dependencies [5850233]
- Updated dependencies [0ebebfe]
- Updated dependencies [16ac431]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [3f95ef5]
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
- Updated dependencies [b9fda3f]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/core-entities@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/storage@6.3.0-edge.0
  - @memberjunction/ai-vectors@6.3.0-edge.0
  - @memberjunction/aiengine@6.3.0-edge.0
  - @memberjunction/credentials@6.3.0-edge.0
  - @memberjunction/ai-core-plus@6.3.0-edge.0
  - @memberjunction/record-set-processor@6.3.0-edge.0
  - @memberjunction/tag-engine@6.3.0-edge.0
  - @memberjunction/ai-prompts@6.3.0-edge.0
  - @memberjunction/ai-segmentation@6.3.0-edge.0
  - @memberjunction/ai-vectordb@6.3.0-edge.0
  - @memberjunction/content-autotagging@6.3.0-edge.0
  - @memberjunction/content-pipeline-base@6.3.0-edge.0
  - @memberjunction/record-set-processor-base@6.3.0-edge.0
  - @memberjunction/document-parsing@6.3.0-edge.0
  - @memberjunction/network-utils@6.3.0-edge.0

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

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- Updated dependencies [0d81c53]
- Updated dependencies [ddcd666]
- Updated dependencies [622f166]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [1419ba7]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [a50948e]
- Updated dependencies [2552b1e]
- Updated dependencies [25bb295]
- Updated dependencies [432cb73]
- Updated dependencies [3080e83]
- Updated dependencies [4c6a28b]
- Updated dependencies [c93c0f8]
- Updated dependencies [6c36fb6]
- Updated dependencies [b518dfa]
- Updated dependencies [0eeb89d]
- Updated dependencies [ecf36eb]
- Updated dependencies [52b9fd5]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [1d6e3e8]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [d43d86e]
- Updated dependencies [92ecdf9]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [91cba84]
- Updated dependencies [b14c72f]
- Updated dependencies [cc41d33]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [5e4205c]
- Updated dependencies [10c2311]
- Updated dependencies [8fd1c46]
- Updated dependencies [5da3ad2]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [1090caa]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [7384dd6]
- Updated dependencies [6849b00]
- Updated dependencies [67f6c85]
- Updated dependencies [ac9b00b]
- Updated dependencies [eb3a8d3]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [953086f]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [e1dd673]
- Updated dependencies [664baea]
- Updated dependencies [f3c6161]
- Updated dependencies [01fafc6]
- Updated dependencies [9b8a84e]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [d122a41]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [42d701e]
- Updated dependencies [1419678]
- Updated dependencies [307da67]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [af6f892]
- Updated dependencies [a65dfb8]
- Updated dependencies [7110019]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [6e6e3f1]
- Updated dependencies [1d38a22]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [0c634ba]
- Updated dependencies [a6f8c1c]
- Updated dependencies [432fe69]
- Updated dependencies [56d7614]
- Updated dependencies [223669e]
- Updated dependencies [9d4a28a]
- Updated dependencies [683f652]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [914e6ff]
- Updated dependencies [a8be410]
- Updated dependencies [cd39c95]
- Updated dependencies [7316ac3]
- Updated dependencies [2274f42]
- Updated dependencies [9ce7cf4]
- Updated dependencies [0fb3649]
- Updated dependencies [131f3c4]
- Updated dependencies [861cbf0]
- Updated dependencies [9096523]
- Updated dependencies [6fd16d2]
- Updated dependencies [63e6af4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [dd34a5c]
- Updated dependencies [5fed75a]
- Updated dependencies [e51ce8a]
- Updated dependencies [4c0eaec]
- Updated dependencies [1cb1d52]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [1d43161]
- Updated dependencies [0a75bb2]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [7658d68]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [6779eed]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [6d5c6ad]
- Updated dependencies [29b6ec3]
- Updated dependencies [0b406e8]
- Updated dependencies [1141164]
- Updated dependencies [44faf83]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [c018cb9]
- Updated dependencies [80905a1]
- Updated dependencies [4c97994]
- Updated dependencies [397ae9a]
- Updated dependencies [08b3d7b]
- Updated dependencies [7e72c86]
- Updated dependencies [e9ab27b]
- Updated dependencies [a17a228]
- Updated dependencies [21175fa]
- Updated dependencies [6b08ebf]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [89a5b59]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [373b180]
- Updated dependencies [aee2d53]
- Updated dependencies [8420f36]
- Updated dependencies [f0c78c3]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [02bb563]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [fd84ab1]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [68f5c01]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [1d29837]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [8c120db]
- Updated dependencies [57096ab]
- Updated dependencies [bea2386]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [aac148b]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [0cc6b08]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [d13cf6b]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [ec97ad4]
- Updated dependencies [0e5a4cd]
- Updated dependencies [fd7479e]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [c8fb9d7]
- Updated dependencies [2854a2e]
- Updated dependencies [03c085c]
- Updated dependencies [28df136]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/ai-prompts@6.2.0
  - @memberjunction/aiengine@6.2.0
  - @memberjunction/ai-core-plus@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/tag-engine@6.2.0
  - @memberjunction/content-autotagging@6.2.0
  - @memberjunction/storage@6.2.0
  - @memberjunction/credentials@6.2.0
  - @memberjunction/record-set-processor@6.2.0
  - @memberjunction/content-pipeline-base@6.2.0
  - @memberjunction/document-parsing@6.2.0
  - @memberjunction/record-set-processor-base@6.2.0
  - @memberjunction/ai-vectordb@6.2.0
  - @memberjunction/network-utils@6.2.0
  - @memberjunction/ai-vectors@6.2.0
  - @memberjunction/ai-segmentation@6.2.0

## 6.2.0-edge.8

### Minor Changes

- 539dfe3: Add Semantic Graph substrate (`MJ: Graph Types`, `MJ: Graph Concept Types`, `MJ: Graph Authority Tiers`, `MJ: Graphs`, `MJ: Graph Concepts`, `MJ: Graph Edge Types`, `MJ: Graph Edge Type Endpoints`, `MJ: Graph Edge Providers`, `MJ: Graph Edges`, and `ContentSource.GraphID`), Content Pipeline `GraphStage` with `EntityGraphOverlayStore` and `DeterministicConceptSynthesizer`, deterministic `TaskGraph` DAG similarity & workflow health telemetry in `@memberjunction/ai-core-plus`, and Semantic Graph & Canon Explorer UI in `@memberjunction/ng-graph-view` and `@memberjunction/ng-dashboards`.

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [6849b00]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [9ce7cf4]
- Updated dependencies [63e6af4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [dd34a5c]
- Updated dependencies [e69634e]
- Updated dependencies [373b180]
- Updated dependencies [539dfe3]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/core-entities@6.2.0-edge.8
  - @memberjunction/aiengine@6.2.0-edge.8
  - @memberjunction/tag-engine@6.2.0-edge.8
  - @memberjunction/storage@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/ai-core-plus@6.2.0-edge.8
  - @memberjunction/document-parsing@6.2.0-edge.8
  - @memberjunction/content-autotagging@6.2.0-edge.8
  - @memberjunction/ai-prompts@6.2.0-edge.8
  - @memberjunction/content-pipeline-base@6.2.0-edge.8
  - @memberjunction/ai-segmentation@6.2.0-edge.8
  - @memberjunction/ai-vectors@6.2.0-edge.8
  - @memberjunction/ai-vectordb@6.2.0-edge.8
  - @memberjunction/credentials@6.2.0-edge.8
  - @memberjunction/record-set-processor-base@6.2.0-edge.8
  - @memberjunction/record-set-processor@6.2.0-edge.8
  - @memberjunction/network-utils@6.2.0-edge.8

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
