# @memberjunction/content-pipeline-base

The working record, the stage contract, and the driver and extractor contracts shared by every content
pipeline stage. Nothing here touches a database. For the end-to-end architecture, `ContentAutotagging`
relationship, and retrieval integration, see the
**[Content Pipeline, Training, and Retrieval Guide](../../../guides/CONTENT_PIPELINE_GUIDE.md)**.

## The working record

One structure passes from stage to stage: an identity, a fixed set of well-known fields that map onto
real columns, and an in-memory extension space.

```ts
record.Propose('Title', parsed.heading, 6, 'Extract.Html');  // persisted, competes on confidence
record.SetExtension('Extract.Html', 'headingDepth', 2);      // in memory, for a later stage this run
record.MarkComplete();                                       // nothing further needs to happen
```

Stages read and write the record; only the hydrator and committer (in `@memberjunction/content-pipeline`)
touch storage. That is what lets the same stage code run live or as a test.

**Confidence, not order.** Each well-known field carries an integer confidence and the stage that set it.
A proposal wins only if its confidence is strictly higher, so two stages that know nothing of each other
resolve a shared field on merit, in any order. The baseline scores live in `ConfidenceScale`, can be
overridden per source type, per source, or per run under `Configuration.Confidence` via `ResolveConfidence`,
and are recorded per field in the `FieldConfidence` column:

```json
{ "Title": { "Score": 4, "SetBy": "Discover.RSS" } }
```

## Configuration precedence

Every stage resolves its driver keys (`ExtractorKey`, `SegmenterKey`, `ClassifierKey`, `AccessDriverKey`)
and confidence scale (`Confidence`) through one precedence order, from most specific to least specific:

1. **Item override** (e.g. `ExtractorKeyOverride` on an item)
2. **Run `Configuration`** (`StageContext.Configuration`, populated from `RecordProcessRun.Configuration.Options`)
3. **Content Source** (`ContentSource.Configuration` and per-extension `ContentSource.Configuration.Extractors`)
4. **Content Source Type / Content Type** (`ContentSourceType.Configuration` / `ContentType.Configuration`)
5. **File Type / Default** (`ContentFileType.ExtractorKey`, capability detection, or the built-in default)

## The stage contract

A stage extends `BasePipelineStage` and registers under its name; adding one is writing a class, never
editing a list.

```ts
@RegisterClass(BasePipelineStage, 'Extract')
export class ExtractStage extends BasePipelineStage {
    public readonly Name = 'Extract';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> { ... }
}
```

- **Cold start is normal.** A stage gets a record hydrated moments ago, with no other stage run first;
  a missing optional field is a legitimate input.
- **Return an outcome.** `Outcome.Complete / Skipped / Fatal / Retry`, or throw `TransientStageError` /
  `FatalStageError`. Any other throw is treated as fatal.
- **Honour `context.Signal`.** It fires when the stage's time budget runs out.
- **Be idempotent.** A commit that lands twice must leave the record correct.
- `Finalize` is an optional batch step for work far cheaper in bulk (Embed). It runs when the stage is
  last in the run's list.

The contract's names (`Signal`, `Log`, transient vs fatal) follow MJ's Work Queue handler contract, so a
future Record Set Processing → Work Queue bridge is an adapter, not a change to any stage.

## Driver contracts

- **Access drivers** (`access/BaseAccessDriver.ts`): turn a Content Source's `Configuration.AccessCredentials`
  (resolved from `MJ: Credentials`) and driver configuration into an in-memory `AccessArtifact` (headers,
  query params, cookies, or a token), cached for the run and never persisted on a Content Item.
- **Source drivers** (`discover/SourceDriver.ts`): the request/response types a Content Source Type's
  driver (`ContentSourceType.DriverClass`) implements for Discover (`Discover`, with incremental `Since`
  filtering, `SupportsExhaustiveWalk` for orphan sync, custom `Columns`, and per-item `Request` recipes)
  and Extract (`Fetch`).
- **Extractors** (`extract/BaseContentExtractor.ts`): turn bytes into one or more text blocks, registered
  by key and chosen by the extractor cascade.
- **Classifiers** (`tag/BaseContentClassifier.ts`): turn extracted text and an active taxonomy into tag
  observations and summary proposals, registered by key (`ManagedPrompt` by default).
- **Detection helpers** (`extract/`): byte signatures and file-type resolution over rules loaded from
  `MJ: Content File Types`, plus the fail-closed object-key template for durable copies.
- **Tuning** (`PipelineTuning`): operational knobs a run may set under `Options.Tuning`.
