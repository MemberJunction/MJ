# @memberjunction/content-pipeline-base

## 6.3.0-edge.2

### Minor Changes

- 30460b0: Canon unification phase U0 (findings F3, F4, F11) and three integration-check repairs.
  - **Edge type registry (F3).** Seeds the edge types the derived providers emit (`Subsets`, `Is A`, `References`, `Reads`, `Composes`, `Field Of`) as provider-only rows, plus `Same As` and `Preferred Over`. Retires `NarrowerThan` as a stored type (it is BroaderThan's inverse label; `AllowStored = 0`). Seeds `MJ: Graph Edge Type Endpoints` rows for `Defines`, `Describes`, `Measures` and `Implements`. A unit test fails when a provider or the synthesizer emits an edge type name with no seeded row.
  - **One direction for the concept edges (F4).** `Defines`, `Describes`, `Measures` and `Implements` run artifact to concept. The Content Pipeline synthesizer now writes them that way, so a pipeline-trained metric concept appears in `ExplainEntity`'s `MeasuringQueries`. Two on-demand FieldRules Record Processes (dry run first) flip edges stored the old way and retype `NarrowerThan` edges.
  - **Proposers check the contract before writing.** `EntityGraphOverlayStore` refuses, logs and counts (`RejectedEdgeCount`) an edge whose type has no row or whose endpoints break the type's endpoint rows. `GraphEdgeEndpointAllows` is the shared rule.
  - **Delete stages (F11).** `GraphEvidenceRetractor` already removes the `Inferred` edges both delete stages leave behind; `DeleteStage` now also keeps a chunk as a tombstone while a `Declared` graph edge still names it, so that edge never points at nothing.
  - **Integration checks.** `fls-closeout-client` probes REST readiness on a scoped route, so CW7/CW8 no longer run before MJAPI's scope cache has the minted key's `full_access` rule (REST enforces key scopes since MJ 6817). `work-bus-core` gives the context user an active Chief of Staff policy for WBC10 (wakes need one since MJ 6825) and restores it in teardown.

- d7a630c: Semantic graph authority tiers are now fully metadata-driven, and the graph engine accepts pluggable access policies (minor: adds three `MJ: Graph Types` columns).
  - `MJ: Graph Types` gains `DefaultAuthorityTierID`, `DefaultConceptTaxonomyMode` and `DefaultGroundingMode`. The Graph stage reads the target graph's real type and fills in what a content source leaves unset from it; `IsCanon` comes from the graph type, never from a configured type name. Seeded types keep their previous behaviour, and Network graphs now default to `Constrained` as documented.
  - Authority tier precedence comes only from `MJ: Graph Authority Tiers` rows: `AuthorityTierPrecedence` is removed and `GetAuthorityTierRank` requires the tier rows. A source may name its tier by ID (`AuthorityTierID`) or name; a name that matches no active tier fails the stage. A source with no tier is unranked instead of silently `Reference`. The `IContentSourceGraphOverlayConfig` keys `Enabled`, `DefaultAuthorityTier` and `DefaultAuthorityTierID` are honoured.
  - `GraphEngine` runs `BaseGraphNodeAccessPolicy` (per entity, `Extend` or `Replace`) and `BaseGraphEdgeAccessPolicy` (per edge type) registrations. Policies only narrow, run once per entity per viewer, and fail closed when they throw or cannot be created.
  - Built-in provenance policies: a content item, its chunks and the concepts synthesized from them are visible only to someone who can read the source record. An `Approved` concept in a Canon graph stays visible to anyone who can read concepts.
  - Edge type names are compared ignoring case and whitespace when filtering edges and when finding an edge access policy, matching how the content pipeline resolves them on write, so an edge cannot skip its policy because its name is spaced differently. Providers that name no edge type fall back to `RelatedTo`, the seeded type. `IsCanonGraph` decides from the graph type's `IsCanon` flag only, no longer from a graph named "MJ Canon".
  - The seeded edge type `Broader Than` (inverse `Narrower Than`) is renamed `BroaderThan` (inverse `NarrowerThan`), so every seeded edge type name is CamelCase. The row keeps its ID, and the content pipeline now writes the CamelCase name.

### Patch Changes

- 31f66b3: Docs only: guides, READMEs and two doc comments now describe what the code does (semantic graphs and Canon, search-scope permissions, taxonomy tagging, the Classify and Tags dashboards, the hierarchy tree, AI providers, testing oracles, SQL Server binary saves, and draft workflows). No code logic changes.
- Updated dependencies [c6b3913]
- Updated dependencies [f41ea95]
- Updated dependencies [0360f3f]
- Updated dependencies [3c70bf7]
- Updated dependencies [2f41586]
- Updated dependencies [30460b0]
- Updated dependencies [916fe91]
- Updated dependencies [d7a630c]
- Updated dependencies [dfc0449]
- Updated dependencies [2122c07]
- Updated dependencies [0711e70]
- Updated dependencies [90174df]
- Updated dependencies [4feb8ad]
- Updated dependencies [d7a630c]
- Updated dependencies [9499d4b]
- Updated dependencies [d635ec5]
- Updated dependencies [5f514f2]
- Updated dependencies [3d5adab]
- Updated dependencies [9471265]
- Updated dependencies [942e220]
- Updated dependencies [346795c]
- Updated dependencies [a5dbc84]
- Updated dependencies [c63e493]
- Updated dependencies [193d979]
- Updated dependencies [6cd3f38]
- Updated dependencies [be7f58e]
  - @memberjunction/core@6.3.0-edge.2
  - @memberjunction/global@6.3.0-edge.2

## 6.3.0-edge.1

### Minor Changes

- 8c2b0d0: Content pipeline: a driver can fetch a page of its own locators in one session. A driver may implement `FetchBatch({ URLs, ... })`, returning one result per locator (its bytes, or the error its fetch ended in). Stages gain an optional bulk step, `Prepare(records, context)`, that the processor runs over a page before any record runs (only for the run's first stage); Extract uses it to call `FetchBatch` once per source in the page, and each item then reads what came back for it. An item the batch did not return is fetched alone; one whose batch fetch failed fails (a permanent 4xx) or retries (anything else) alone, as a single fetch would; a `Prepare` that fails is logged and every record runs as before. The processor now pages a run whose first stage has a `Prepare` even when its last stage has no `Finalize`, finishing each record exactly as a single-record run does.
- 8c2b0d0: Content pipeline: the website crawler's Discover gains sitemap seeding, walks in parts and page rendering, and Extract can read pages through a renderer.

  `AutotagWebsite.Discover` now runs `WebsiteCrawl`: breadth-first over in-scope links (same root URL, pattern, `MaxDepth` and sibling-path rules as before), with its frontier and the URLs it has seen kept in a compact resume token, so a crawl past its deadline carries on in its next walk (each part reads at least one page, so a walk always moves on). New `Configuration.Website` settings: `UseSitemaps` (seed from the sitemaps robots.txt names, else /sitemap.xml, following sitemap indexes; a page whose `lastmod` is older than the walk's `Since` is not reported but its links are followed), `SitemapURLs`, `CrawlDelayMs` (default 1000), `MaxPages` and `RenderTimeoutMs`. The legacy `Autotag` crawl is unchanged.

  Page rendering: `BasePageRenderer` (content-pipeline-base) is a registered way of loading a page as a browser builds it, chosen per source with `Configuration.PageRenderer`. The pipeline ships `Headless` (`HeadlessPageRenderer`), which loads pages in a headless Chromium through Playwright, an optional peer dependency imported only when a page is rendered; one browser is shared and closed after a minute idle. Every request a rendered page makes is refused when it resolves to a private or reserved address (MJ's SSRF guard), checked at every redirect hop (Playwright's route sees only a redirect's first request, so the renderer fetches each request without following redirects: the page's own redirects are checked and followed one navigation at a time, and those of what it loads are followed hop by hop in the route). The page may open no WebSocket. The source's session headers go only to the session's own origins, hop by hop. The crawler reads pages through the source's renderer, and Extract fetches a web page through it when the source names one and its driver has no `Fetch` of its own; a page the renderer reports as an error status fails as an HTTP fetch would. Login works as before, through the Access layer.

- 8c2b0d0: Content pipeline: a `Manifest` extractor expands a CSV or TSV that lists documents into child items, the way an archive expands into its members. Each row becomes a Content Item with `ParentID` set to the manifest, so a Sync leaves the rows alone unless the manifest is removed and a re-extraction retires rows no longer listed. A row with text is complete as listed; a row with only a link becomes an item at that link (relative links resolve against the manifest's address), which its own Extract fetches through the source's fetch and Access path. Which columns hold the link, text, title, date, decorator and a stable row key is configuration (`ExtractorOptions.Manifest`), and further columns map to item columns through `Columns`, including an IS-A extension's fields. A CSV is never a manifest by default: the extractor runs only when the extractor order selects it, and it refuses a manifest with no link or text column, a configured column the header lacks, an unreadable date, or more rows than `MaxArchiveMembers` (and, like an archive, reading with no limit configured). Supporting changes in the extractor contract: `ExtractRequest.Options` carries an extractor's `ExtractorOptions[<key>]`, layered from the source type's Configuration, the source's settings and Configuration, and the run's Options; a `ContentBlock` can carry its own `URL` and well-known `Fields` (a field's `Date` replaces the inherited one); `ExtractResult.IsContainer` keeps a one-block result a container; and the confidence scale gains `DiscoveredDecorator`.
- 8c2b0d0: Content pipeline: a Discover walk can run in parts, and a driver can report removals.

  Walks in parts. A source too large to walk in one run had to finish in one go or start over every time. A driver's `Discover` may now end early by returning `{ ResumeToken }` (an `async *` generator's `return`), typically when the walk passes `DiscoverRequest.Deadline` (set from the new `Options.Tuning.DiscoverWalkBudgetMs`). The Discover stage keeps the token on the source in the new `ContentSource.DiscoverState` column (JSON, typed `IContentSourceDiscoverState`: `ResumeToken`, `WalkStartedAt`, `Mode`, `ItemsFound`) and hands it back as `DiscoverRequest.ResumeToken` on the next walk, which keeps the first part's `Since`. Until the walk finishes the source stays due (`ForceDiscovery` stays set, `LastDiscoveredAt` / `LastSyncedAt` do not move); the part that finishes stamps the first part's start and clears the state. The token is saved only when every item the part found commits: a part whose items could not be saved keeps the old token, so the next run walks that part again (and reports its removals again) instead of resuming past items that were never saved. A walk resumes only in the mode it started in. A Sync that runs in parts marks nothing for deletion by absence, since no single run saw the whole source.

  Removals. A driver can yield `{ URL, Removed: true }` for a locator it knows is gone; once the walk's items have committed, the source's top-level item at that URL is marked `DeleteStatus = 'Pending'` for the Delete stage, without waiting for a Sync. Child items go with their parent, as with Sync.

  Migration `V202611170732__v6.3.x__ContentPipeline_Discover_State` adds the column with its regenerated view, procedures, GraphQL type and form field.

- c5a5197: Content pipeline: a Retry outcome now waits and tries again instead of failing. Until now every outcome but Complete and Skipped was committed as the stage's `Failed` status, which no stage selects again, so a record a stage asked to retry (a rate limit, a timeout, a stage out of its time budget) stayed failed for good. A Retry now leaves the status ready and sets a wait on the record: Content Items and Content Item Chunks gain `RetryCount` and `RetryAfter`, the wait doubles with each Retry in a row (`Options.Tuning.RetryBackoffBaseMs`, default one minute; `RetryBackoffMaxMs`, default one hour), and every pipeline Record Process's `ScopeFilter` skips the record until `RetryAfter` has passed. A Delete that cannot finish, which already stayed `Pending`, now waits the same way instead of being selected by every run.

  Record Set Processing: a run can be stopped from the calling code. `RecordProcessExecutor.Run`/`RunByID` and `RecordSetProcessor.Process` take an optional `Signal` (an `AbortSignal`): the run starts no record after it fires and ends `Paused` without moving its resume cursor past the page it was on. Processors receive it as `RecordProcessorContext.Signal`, and the content pipeline hands it to each stage's `context.Signal` (with the stage budget), so a stage in flight can stop too; a record the run was stopped on is not committed, and stays ready.

### Patch Changes

- Updated dependencies [d4350c0]
- Updated dependencies [2f64a46]
- Updated dependencies [e5a392f]
- Updated dependencies [2d938cf]
- Updated dependencies [7a3333e]
- Updated dependencies [0f4d357]
- Updated dependencies [1351528]
- Updated dependencies [3abebb3]
- Updated dependencies [44b885a]
- Updated dependencies [e768fd4]
- Updated dependencies [acd082e]
- Updated dependencies [e73f729]
- Updated dependencies [c5a5197]
- Updated dependencies [880a114]
- Updated dependencies [fa811cc]
- Updated dependencies [bc39181]
- Updated dependencies [1f24d8a]
- Updated dependencies [c51c6f3]
- Updated dependencies [35bffba]
- Updated dependencies [86326f2]
- Updated dependencies [a9e640a]
- Updated dependencies [46173bd]
- Updated dependencies [4262206]
- Updated dependencies [f53f828]
- Updated dependencies [2b4969f]
- Updated dependencies [dc30912]
- Updated dependencies [d1bf1c9]
- Updated dependencies [0af123e]
- Updated dependencies [05100bd]
- Updated dependencies [fff3a52]
- Updated dependencies [38ca94f]
- Updated dependencies [6ea73e6]
- Updated dependencies [7ad8b8a]
- Updated dependencies [1197598]
- Updated dependencies [ce32cbf]
- Updated dependencies [64cc6f4]
- Updated dependencies [7747b73]
- Updated dependencies [3e9d745]
- Updated dependencies [687393c]
  - @memberjunction/core@6.3.0-edge.1
  - @memberjunction/global@6.3.0-edge.1

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
