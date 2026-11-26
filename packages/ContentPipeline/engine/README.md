# @memberjunction/content-pipeline

The processor that runs content pipeline stages under Record Set Processing, the hydrator and committer,
and the built-in stages and extractors. Start with
[`@memberjunction/content-pipeline-base`](../base/README.md) if you are writing a stage, and see the
**[Content Pipeline, Training, and Retrieval Guide](../../../guides/CONTENT_PIPELINE_GUIDE.md)** for the
end-to-end architecture, configuration precedence, `ContentAutotagging` relationship, and retrieval integration.

## How a stage runs

```
Record Set Processing     selects records with the Record Process's filter
      ↓ ProcessRecord / ProcessBatch
PipelineProcessor         hydrate → run the configured stage(s) → commit unless a test
      ↓ Run(workingRecord, context)
Stages                    Discover · Extract · Tag · Segment · Embed · Graph · Delete (and NoOp)
```

`ContentPipelineStartup` registers the `Pipeline Stage` work type and its paired
`PipelineProcessRunTracker`, which opens a Process Run Detail row when a record starts and updates it in
place as the stage reports progress. `ServerBootstrap` depends on this package so the startup class loads;
outside a server, call `RegisterPipelineWorkType()` and `LoadContentPipelineStages()` yourself.

## Configuring a Record Process

```json
{
  "Stages": ["Extract"],
  "IsTest": false,
  "StageBudgetMs": 30000,
  "Options": { "Tuning": { "MaxArchiveMembers": 10000 }, "ObjectKeyTemplate": "{ContentSourceID}/{RecordID}-{Name}" }
}
```

- `Stages` names one stage in production. A test run may chain several (`["Discover", "Extract"]`); the
  processor hands each stage's output straight to the next, in memory.
- `IsTest` (or a dry run) withholds every commit. Produced records are still reported, under their URL.
- `StageBudgetMs` time-boxes each stage per record by aborting its signal.

## The stages, and what they reuse

| Stage | Runs over | Reuses |
|---|---|---|
| Discover | Content Source | The source type's existing driver (`ContentSourceType.DriverClass`, an `AutotagBase` subclass) and its `Discover` method (`Options.Mode`: `'Discover'` incremental via `LastDiscoveredAt` minus `ClockSkewOverlapMs`, or `'Sync'` exhaustive orphan sweep via `LastSyncedAt`); session access via `AccessResolver` (`BaseAccessDriver`, including `CredentialAccessDriver`) |
| Extract | Content Item | Detection rules from `MJ: Content File Types`; `AccessResolver` + the driver's `Fetch` or `HttpGet`; `@memberjunction/document-parsing`; SHA-256 content checksum reconciliation; durable copies through `FileStorageEngine.UploadFile` |
| Tag | Content Item | `BaseContentClassifier` registry (`ClassifierKey`), defaulting to `ManagedPromptClassifier` wrapping the shared Content Autotagging prompt (`ContentAutotagPrompt`); tags promoted through `TagEngine` |
| Segment | Content Item | `@memberjunction/ai-segmentation` (`SegmenterKey`) |
| Embed / Delete | Chunk or Item | `ContentVectorInfrastructure` (shared with the autotagger) for index, model, credential and namespace; `AIEmbeddingRunner`; the vector providers |
| Graph | Content Item | `ResolveGraphOverlayConfig` (`ContentSource.GraphID` + `Configuration.GraphOverlay`), `ClusterContentIntoConceptSeeds` (authority-ranked concept clustering, MJ schema/query grounding, and cross-chunk conflict detection), and `BaseConceptSynthesizer` (`ManagedPromptConceptSynthesizer` by default) to project `MJ: Graph Concepts` and `MJ: Graph Edges`. See the **[Canon-First Methodology & Semantic Graphs Guide](../../../guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md)** |

Every stage resolves its settings in the same precedence order:
**Item override → Run `Configuration` (`Options`) → Content Source → Content Source Type / Content Type → File Type / Default**.

## Reading the web

Web settings (`PageRenderer`, `PageRenderMode`, `PageRendererOptions`, `Website.*`) resolve through
`ResolveWebFetchSettings` (in `content-pipeline-base`): run, then source, then its `SourceSpecificConfiguration`,
then the source type, the same in Extract and the website crawl. This package provides:

- **`HeadlessPageRenderer`** (`PageRenderer: 'Headless'`): Playwright Chromium with every request and redirect hop
  checked by the SSRF guard, the session restored per page, and `PageRendererOptions` honoured. Launch arguments come
  from `MJ_HEADLESS_CHROMIUM_ARGS` (or `HeadlessPageRenderer.LaunchArgs`).
- **`FormLoginAccessDriver`** (`AccessDriverKey: 'FormLogin'`) and **`BrowserLoginAccessDriver`**
  (`'BrowserLogin'`): sign in to a members-only site and hand the session on as cookies (and, for a browser login,
  the browser's storage state for the session's origins). `LoginSession.ts` holds what they share; cookies are kept in a `tough-cookie` jar, and a form login's redirects go through `HttpRequest`'s SSRF-checked `OnRedirect` hook.
- **`HtmlExtractor`** (charset from the BOM, the served `Content-Type`, then `<meta charset>`; `ExtractorOptions.Html.TitleSelector`)
  and **`ManifestExtractor`** (`DetectByHeader`, `FallbackLinkColumns`, `KeyColumns`, `KeyAsURL`).

When a page is rendered is the source's `BasePageRenderPolicy` (`PageRenderMode`, in `content-pipeline-base`).
An extractor reading a single document may return its `Date` and `Decorator` as block `Fields`; Extract applies them
to the item. Details: the guide's Stage 2.

## Hydrate and commit

`WorkingRecordHydrator` and `WorkingRecordCommitter` are the only code that touches the database.

- **Lookup fields carry a name.** A stage sees `FileType = 'pdf'`; the column is `ContentFileTypeID`,
  resolved by name from the cached Knowledge Hub metadata. A name that matches nothing leaves the column unset.
- **Produced records are matched, not duplicated.** A Content Item is matched by URL within its source.
  Extract computes the SHA-256 checksum of the extracted text: an unchanged checksum is a no-op (or promotes
  `EmbeddingStatus` to `'MetadataOnly'` when item metadata changed); a changed checksum resets downstream
  statuses. Re-segmenting mints new chunks and marks the old ones for the Delete stage.
