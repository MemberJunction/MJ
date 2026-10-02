# @memberjunction/content-pipeline

The generic processor that runs content pipeline stages, the two places the pipeline touches a
database, and the built-in stages and readers.

The working record and the stage contract live in
[`@memberjunction/content-pipeline-base`](../base/README.md); start there if you are writing a stage.

## How a stage runs

Three layers, each ignorant of the one above it:

```
Record Set Processing     gets each record from the Record Process's scope
      ↓ ProcessRecord(recordRef, context)
PipelineProcessor         hydrate → run the configured stage(s) → commit, or not
      ↓ Run(workingRecord, context)
Stages                    Discover · Extract · Tag · Segment · Embed · Delete
      ↓
Drivers                   readers, segmenters, classifiers, vector writers
```

A stage never learns whether a filter or a queue supplied its record, and never touches storage.

## Registering it

Nothing works until the host loads this package. Two things are required, and the second is easy to
miss:

1. `ServerBootstrap` must declare `@memberjunction/content-pipeline` as a dependency, and its
   `prebuild` regenerates the committed class-registration manifest that imports it.
2. `ContentPipelineStartup` then registers the `'Pipeline Stage'` work type and forces the stage and
   reader classes into the bundle at server boot.

Without (1), `@RegisterForStartup` never fires, because nothing imports the module — a Record
Process with `WorkType = 'Pipeline Stage'` fails with "unsupported WorkType" and every stage name
resolves to null. Outside a server, call `RegisterPipelineWorkType()` and
`LoadContentPipelineStages()` yourself.

## Configuring a Record Process

```json
{
  "Stages": ["Extract"],
  "IsTest": false,
  "StageBudgetMs": 30000,
  "Options": { "ContentTypeExtractorKey": "Html", "ClassifierKey": "...", "VectorWriterKey": "..." }
}
```

`Stages` names one stage in production. A list is how a test run chains several: the processor runs
them on the same working record in memory, handing each stage's output straight to the next.

`IsTest` (or the run's dry-run flag) withholds every commit. The stage code is identical either way —
"test" is purely the processor skipping one step — and produced records are still reported, under
their ephemeral URL identity, so a `["Discover", "Extract"]` dry run is readable without writing
anything.

`StageBudgetMs` time-boxes each stage per record by aborting its stop signal, so any stage that
already honours cancellation is time-boxed with no change to its code.

## Hydrate and commit

`WorkingRecordHydrator` and `WorkingRecordCommitter` are the only code here that touches a database.
Three things they do that are easy to get wrong:

- **Lookup fields carry a name, not a key.** A stage asks for `FileType` and expects `'html'`; the
  column is `ContentFileTypeID`. These hydrate from the base view's denormalized name column and
  commit through `LookupResolver`, which has an explicit policy (`Skip` / `Create` / `Fail`) for a
  name that matches nothing.
- **A commit is safe to repeat.** A worker whose claim expired can finish after another has picked
  the record up; writing the same fields and status twice must leave the record correct.
- **Produced records are matched, not duplicated.** A Content Item is recognized by its URL within
  its source; a chunk by its sequence within its item. Unchanged content is a genuine no-op, and
  changed content triggers a flat reset of every downstream status.

## Drivers

The framework ships **no** Discover drivers, classifiers, vector writers or durable-copy stores, and
only a plain-text reader plus an archive reader whose unpacking is left to the deployment. Each is a
registered contract resolved by name, so adding one means writing a class and registering it.

`scripts/` holds runnable examples — `e2e.mjs` stands up a real HTTP server and drives
Discover → Extract → Tag → Segment → Embed against a database, with demonstration drivers in
`e2e-drivers.mjs`. They are development scripts, not shipped code.

## References

- Architecture spec — *The Content Pipeline*, §06 (running a stage), §08 (the built-in stages)
- `plans/content-pipeline-framework.md` — phases F0–F13
