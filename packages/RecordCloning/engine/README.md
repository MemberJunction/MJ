# @memberjunction/record-cloning

Server-side engine for cloning an entity record together with the graph of records around it:
owned child rows, IS-A subtype rows, and the references it points at. It copies what the entity's
`Configuration.Clone` bag allows, re-points foreign keys at the new rows, and saves everything in
one transaction with full provenance.

Pure logic lives in [`@memberjunction/record-cloning-base`](../base/README.md): policy resolution,
the field mapper, naming, JSON remap, validation and the contract types. Graph traversal comes from
[`@memberjunction/record-graph`](../../RecordGraph/README.md). The design is in
[`plans/record-cloning/README.md`](../../../plans/record-cloning/README.md).

## Flow: Describe → Plan → Execute

| Step | What happens | Writes |
|---|---|---|
| **Describe** | Whether the user may clone this entity and what the UI may offer: presets, `UserEditable`, relationships with their default policy, and the Fire Hooks / Override Scope flags. | nothing |
| **Plan** | `ClonePlanner` walks the graph (`DependencyGraphWalker`), resolves each edge to `Deep`, `Reference` or `Skip`, runs the field pipeline on every row, applies `MaxDepth`/`MaxRecords` caps and authorization checks, and hashes the result. | nothing |
| **Execute** | Plans again. Refuses with `BLOCKED`/`FORBIDDEN` when the plan is blocked, or `PLAN_CHANGED` when the hash differs from the `ExpectedPlanHash` the user reviewed. Otherwise `CloneMaterializer` builds the in-memory graph and `CloneExecutor` saves it. | the clone and its provenance |

- **`ClonePlanner`** produces a deterministic `ClonePlan` (nodes, edges, field changes, warnings, `Blocked`).
- **`CloneMaterializer`** turns the plan into unsaved entity objects: the root, children in the
  parent's writable collection (or one declared with `BaseEntity.DeclareRelatedRecordsDynamic`),
  prerequisites for forward-FK targets, and sidecars.
- **`CloneExecutor`** sets a clone context on each staged row (`SetCloneContext`), then saves
  prerequisites, `root.Save()` and sidecars inside `RunInEntityTransaction`, followed by the provenance.

## Entry points

**Remote operations** (`src/operations.ts`): `RecordClone.Describe`, `RecordClone.Plan`,
`RecordClone.Execute` and `RecordClone.GetLineage`. Each server class extends the operation class
CodeGen emits into `@memberjunction/core-entities`. The input/output contracts are the types in
`metadata/remote-operations/types/record-clone-*.ts`. `Plan` output masks encrypted values.
`GetLineage` reads `ClonedFrom` record links in both directions.

**Programmatic API**, server-side:

```typescript
import { LogError } from '@memberjunction/core';
import { RecordCloneEngine } from '@memberjunction/record-cloning';

const engine = new RecordCloneEngine(provider);
const plan = await engine.Plan({ EntityName: 'MJ: AI Agents', SourceRecordKey: key }, contextUser);
if (!plan.Blocked) {
    const result = await engine.Clone(
        { EntityName: 'MJ: AI Agents', SourceRecordKey: key, Options: { Preset: 'deep-prompts' } },
        contextUser
    );
    if (!result.Success) LogError(result.ErrorMessage);
}
```

`Clone` returns the plan without writing anything when `Options.DryRun` is true. `Describe` and
`GetLineage` are also available.

**Actions** (`packages/Actions/CoreActions/src/custom/record-cloning/`):
- `Clone Record`: `EntityName`, `RecordID`, optional `Options` JSON and `DryRun`. Outputs
  `NewRecordID`, `CloneLogID`, `CreatedCount` and `Warnings`.
- `Clone Records`: takes `RecordIDs` instead and requires `Clone Records: Batch`. Each root is its
  own clone and transaction. The `Results` output reports each root, and the result code is
  `PARTIAL` when only some roots succeed.

**Record processes**: the `Clone` work type is `CloneRecordProcessor`. `RecordCloningStartup`
(`@RegisterForStartup`) registers it with `RecordProcessorRegistry` at server boot. The run's
`Configuration` JSON supplies `Options`, `EdgeOverrides`, `FieldOverrides` and `DryRun`. It requires
`Clone Records: Batch`.

## Authorization (`CloneAuthorization.ts`)

`CloneAuthorizer` checks every created row against its entity's clone authorization. That is
`Configuration.Clone.RequiredAuthorization` if set. Otherwise it is `Clone Records: <Entity Name>`
if that authorization exists, and otherwise `Clone Records in Platform Schema` (for `__mj`) or
`Clone Records in Custom Schemas`. Checks walk ancestors, so a holder of `Clone Records` passes all
of them. `Clone Records: Fire Hooks` lets a request change whether Entity Actions and AI Actions fire.
`Clone Records: Override Scope` lets a request widen a clone with a `Deep` override. An authorization
missing from metadata grants nothing. The planner also requires `CanCreate` on every created entity and
the root's `RequiredUserType`, if set.

## Provenance

A successful clone writes, in the same transaction:
- a Record Change per new row (for entities that track record changes), with `Source = 'Clone'` and `ChangeContext` JSON
- one `MJ: Record Clone Logs` header (masked plan, options, counts, `InitiatedByUserID` = the cloner)
- one `MJ: Record Clone Log Items` row per planned node (`Created` / `Referenced` / `Skipped`)
- one `MJ: Record Links` row per new record, with `LinkType = 'ClonedFrom'` (Source = clone, Target = original)
- a `Record Cloned` audit log entry

If the log or a link fails to save, the whole clone rolls back. The log, log items and links are
saved as the **system user** when one is available, because they are the platform's record, not the
cloner's data. The audit entry is recorded as the cloner. Refused and failed runs still get a log
(`Cancelled` / `Error`) and an audit entry, written outside any transaction.

## Transactions

A clone is all or nothing. If the provider lacks `SupportsEntityTransactions` and
`BeginEntityTransaction`, `Execute` refuses before writing anything and returns `EXECUTION_ERROR`.
It still records a refusal log. Run clones on the server, through the remote operations, the
actions or a record process.
