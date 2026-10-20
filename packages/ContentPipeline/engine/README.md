# @memberjunction/content-pipeline

The processor that runs content pipeline stages under Record Set Processing, the hydrator and committer,
and the built-in stages and extractors. Start with
[`@memberjunction/content-pipeline-base`](../base/README.md) if you are writing a stage.

## How a stage runs

```
Record Set Processing     selects records with the Record Process's filter
      ↓ ProcessRecord / ProcessBatch
PipelineProcessor         hydrate → run the configured stage(s) → commit unless a test
      ↓ Run(workingRecord, context)
Stages                    Discover · Extract · Tag · Segment · Embed · Delete (and NoOp)
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
| Discover | Content Source | The source type's existing driver (`ContentSourceType.DriverClass`, an `AutotagBase` subclass) and its `Discover` method (`Options.Mode`: `'Discover'` incremental via `LastDiscoveredAt`, or `'Sync'` exhaustive orphan sweep via `LastSyncedAt`) |
| Extract | Content Item | Detection rules from `MJ: Content File Types`; the driver's `Fetch` or `HttpGet`; `@memberjunction/document-parsing`; SHA-256 content checksum reconciliation; durable copies through `FileStorageEngine.UploadFile` |
| Tag | Content Item | The Content Autotagging prompt and the autotagger's shared prompt helpers; tags through `TagEngine` |
| Segment | Content Item | `@memberjunction/ai-segmentation` |
| Embed / Delete | Chunk or Item | `ContentVectorInfrastructure` (shared with the autotagger) for index, model, credential and namespace; `AIEmbeddingRunner`; the vector providers |

Extract picks an extractor by: the item's `ExtractorKeyOverride` → the source's `ExtractorKey` setting →
`ContentType.ExtractorKey` → `ContentFileType.ExtractorKey` → a sanity-checked plain-text read.

## Hydrate and commit

`WorkingRecordHydrator` and `WorkingRecordCommitter` are the only code that touches the database.

- **Lookup fields carry a name.** A stage sees `FileType = 'pdf'`; the column is `ContentFileTypeID`,
  resolved by name from the cached Knowledge Hub metadata. A name that matches nothing leaves the column unset.
- **Produced records are matched, not duplicated.** A Content Item is matched by URL within its source.
  Extract computes the SHA-256 checksum of the extracted text: an unchanged checksum is a no-op (or promotes
  `EmbeddingStatus` to `'MetadataOnly'` when item metadata changed); a changed checksum resets downstream
  statuses. Re-segmenting mints new chunks and marks the old ones for the Delete stage.
