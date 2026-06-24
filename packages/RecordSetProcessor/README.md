# Record Set Processor

MemberJunction's **one substrate for "do X to a set of an entity's records"** — batching, bounded concurrency,
rate-limiting, an error-rate circuit breaker, resume, pause/cancel, per-record isolation, and run audit, written
once so no feature re-invents it. Everything that iterates a record set (scheduled jobs, imports, bulk updates,
agent sweeps) routes through here.

This folder is **two packages** — a client-safe foundation and the server engine that drives it:

| Package | Side | What it is |
|---|---|---|
| [`@memberjunction/record-set-processor-base`](./base/README.md) | client-safe | the shared types, the **three seams** (Source / Processor / Tracker), and the built-in sources (`ArraySource`, `ViewSource`, `ListSource`, `FilterSource`, `KeysetSource`) |
| [`@memberjunction/record-set-processor`](./engine/README.md) | server-only | the hardened iteration **engine** (`RecordSetProcessor.Process`) + the **`RecordProcessExecutor`** facade that runs a saved `MJ: Record Processes` definition |

## The two layers

- **Substrate (code-level)** — compose a **Source × Processor × Tracker** and call
  `RecordSetProcessor.Instance.Process(options)`. The engine owns the hard parts between the seams; you supply
  *what to iterate*, *what to do*, and *where to persist*.
- **Record Process (declarative)** — a saved, reusable `MJ: Record Processes` row (target entity + **work type** +
  **scope** + JSON config + triggers) that the `RecordProcessExecutor` facade turns into a substrate run. This is
  what the Bulk Operations UI authors and runs, with four work types (**FieldRules / Action / Agent / Infer**),
  runtime scope overrides, and a **dry-run** preview.

```typescript
import { RecordSetProcessor, FunctionRecordProcessor } from '@memberjunction/record-set-processor';
import { ViewSource } from '@memberjunction/record-set-processor-base';

// Substrate, directly:
const result = await RecordSetProcessor.Instance.Process({
    source: new ViewSource(viewID),
    processor: new FunctionRecordProcessor(async (record, ctx) => ({ Status: 'Succeeded' })),
    contextUser, batchSize: 100, maxConcurrency: 4,
});

// Or run a saved Record Process via the facade:
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
await new RecordProcessExecutor().RunByID(recordProcessID, { contextUser, triggeredBy: 'OnDemand' });
```

## Where to go next

- 📘 **[Record Set Processing & Record Processes Guide](../../guides/RECORD_SET_PROCESSING_GUIDE.md)** — the full
  picture: the substrate seams, the four work types, scopes, dry-run, the persisted run model, the UI, the API
  surface, and extension recipes. **Start here.**
- [`base/README.md`](./base/README.md) — the seams + sources, and how to implement a custom source.
- [`engine/README.md`](./engine/README.md) — what the engine owns, usage, and the exported trackers/processors.

The UI that authors and runs Record Processes lives in
[`@memberjunction/ng-record-process-studio`](../Angular/Generic/record-process-studio/README.md) (the Bulk
Operations studio) and [`@memberjunction/ng-entity-action-ux`](../Angular/Generic/entity-action-ux/README.md) (the
in-grid runner); the typed API surface (`RecordProcess.RunNow` + control ops) is described in the
[Remote Operations Guide](../../guides/REMOTE_OPERATIONS_GUIDE.md).
