# @memberjunction/content-pipeline-base

The working record, the stage contract, and the confidence convention shared by every content
pipeline stage. Client-safe — nothing here touches a database.

## The working record

One structure is passed from stage to stage. It has an identity, a fixed set of well-known fields
that map onto real entity columns, and an open extension space.

```ts
record.Propose('Title', parsed.heading, 6, 'Extract.Html');  // durable, competes on confidence
record.SetExtension('Extract.Html', 'headingDepth', 2);      // in-memory, for a later stage
record.MarkComplete();                                       // nothing further need happen
```

**Stages touch the record; only hydrate and commit touch storage.** That separation is what lets the
same stage code run live or as a test, alone or chained, without knowing which.

### Confidence, not sequence

More than one stage may have an opinion about the same field — Discover might propose a title from a
listing page, Extract a better one from the document itself. Every value carries an integer
confidence, higher meaning more trusted, with no ceiling.

**A proposal is taken only if its confidence is strictly higher.** Equal confidence leaves the
existing value alone. This is what lets two stages that have never heard of each other resolve a
shared field correctly: neither needs to know it is competing, only how much to trust its own kind of
finding. It also makes the result independent of the order the stages ran in.

Confidence is set in stage code and deliberately not exposed as configuration. Nobody adjusting the
number directly is what makes the persisted record of it trustworthy:

```json
{ "Title": { "Score": 4, "SetBy": "Discover.RSS" } }
```

## The stage contract

A stage is a registered class implementing one function shape. It is discovered by name through MJ's
class factory, so nothing has a compiled-in list of stages — adding one means writing a class and
registering it.

```ts
@RegisterClass(BasePipelineStage, 'Extract')
export class ExtractStage extends BasePipelineStage {
    public readonly Name = 'Extract';
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) return Outcome.Retry('stopped before starting');
        ...
    }
}
```

**Cold start is the normal case.** In production a stage is handed a record hydrated from storage
moments ago, with no other stage having run in the same call. Produce correct output from whatever is
actually present, and treat a missing optional field as a legitimate input.

**Resolution fails loudly.** `BasePipelineStage.Resolve` returns `null` for an unregistered name. It
uses `TryCreateInstance` rather than `CreateInstance` because the latter falls back to a hollow
instance of the base class, which would turn a typo in a Record Process row into a stage that
silently does nothing.

## Work Queue compatibility

These types are a **structural superset** of MJ's Work Queue handler contract. The queue packages
(`@memberjunction/work-queue-*`) are not on `next`, and the Record-Set-Processing → Work Queue bridge
does not exist on any branch, so nothing here imports them. Compatibility is achieved by mirroring
the shape, and this table is the adapter specification:

| Work Queue | content-pipeline-base | Notes |
|---|---|---|
| `WorkContext.Signal: AbortSignal` | `StageContext.Signal: AbortSignal` | Identical type and meaning |
| `WorkContext.Attempt` / `.MaxAttempts` | `StageContext.Attempt` / `.MaxAttempts` | `1` / `1` under filter scope |
| `WorkContext.IsReplay` | `StageContext.IsReplay` | `false` under filter scope |
| `WorkContext.Log` | `StageContext.Log` | Same three levels |
| `Outcome.Complete()` | `Outcome.Complete()` | |
| `Outcome.Retry(reason)` | `Outcome.Retry(reason)` | |
| `TransientWorkError` | `TransientStageError` | Retried with backoff in queue scope |
| `FatalWorkError` | `FatalStageError` | Never retried; dead-lettered |
| `BaseWorkHandler.Handle(message, context)` | `BasePipelineStage.Run(record, context)` | The bridge supplies the record from the message |

Under Record Set Processing the queue-shaped members take their degenerate values, and `Signal` fires
at page boundaries rather than in flight, because RSP's cancel handshake is per-checkpoint rather than
per-record. Stages are written against the richer contract from day one, so **no stage changes** when
those values become real.

### What this obliges every stage to do

- **Be idempotent.** Re-delivery is normal in a queue, and `IsReplay` may be true. A commit that
  lands twice must leave the record correct.
- **Honour `Signal`.** Check it where stopping is safe and return `Outcome.Retry`, rather than
  throwing. A stage that never checks runs to completion — cancellation cannot stop work the code
  does not pause for.
- **Classify failures.** Fatal (will never succeed) versus transient (might succeed later). Never
  throw a bare `Error`; it is treated as fatal.
- **Stay out of the audit trail.** No stage touches a tracker, a process run, or a delivery row. All
  status leaves through `StageContext`.
- **Know nothing about scope or batching.** One record in, one out. Whether a filter or a queue
  supplied it is not a stage's business.

## References

- Architecture spec — *The Content Pipeline*, §04 (the working record), §05 (the stage contract),
  §06 (running a stage), §12.1 (adding a stage)
- `plans/content-pipeline-framework.md` — phases F0 and F1
