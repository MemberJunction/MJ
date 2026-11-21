# @memberjunction/record-comparison

Framework-agnostic **record comparison** primitive for MemberJunction.

`RecordComparisonEngine` loads a set of records for a single entity and computes a
structured, field-level delta between them — a survivor candidate plus its potential
matches diffed column-by-column. It performs one read-only load (`RunView` with
`ResultType: 'simple'` and a targeted field list) and never mutates records.

It is one piece of MJ's duplicate management feature. The end-to-end picture — detection,
LLM reasoning, review and merging — is in the
[Duplicate Management Guide](../../guides/DUPLICATE_MANAGEMENT_GUIDE.md).

## Why this package exists

The comparison logic is needed by two callers that sit on **opposite sides** of the
dependency graph:

- The **LLM duplicate-detection reasoning path** (`@memberjunction/ai-vector-dupe`), whose
  `MatchedSetDeltaBuilder` feeds the differing-field deltas of a matched set to the reasoning
  provider as context.
- The **side-by-side comparison panel** in the UI (`@memberjunction/ng-record-merge`, used by the
  entity grid's merge flow), which reaches the engine through the `RecordComparison.Compare`
  **Remote Operation** this package registers.

`@memberjunction/core-entities-server` depends on `@memberjunction/ai-vector-dupe`, so the dupe
package sits *lower* in the graph and cannot reach an engine that lives in a server package
without a build cycle. Hoisting the engine into this low-level package (it depends only on
`@memberjunction/core`, `@memberjunction/core-entities` and `@memberjunction/global`) gives both
sides one implementation, no cycle, and no duplicated delta logic.

## Usage

### On the server

```typescript
import { RecordComparisonEngine } from '@memberjunction/record-comparison';
import { CompositeKey } from '@memberjunction/core';

const engine = new RecordComparisonEngine();

// By entity name — resolves the entity from the (request-scoped) provider's metadata.
const result = await engine.CompareRecords(
  { EntityName: 'Accounts', Keys: [survivorKey, candidateKey] },
  contextUser,
  provider // request-scoped IMetadataProvider (multi-provider safety)
);

// With an already-resolved EntityInfo and an injected RunView (the dupe path) — skips the
// by-name lookup and reuses the caller's request-scoped RunView.
const result2 = await engine.CompareRecordsForEntity(
  entityInfo,
  [sourceKey, ...candidateKeys],
  contextUser,
  { RunViewInstance: runView, IncludeFields: ['Name', 'Email', 'Phone'] }
);

if (result.Success) {
  for (const field of result.Fields.filter(f => f.Differs)) {
    console.log(field.DisplayName, field.Cells.map(c => c.Value));
  }
}
```

The engine never throws for ordinary failures: check `result.Success` and read
`result.ErrorMessage`.

### From any client: the `RecordComparison.Compare` Remote Operation

This package registers `RecordComparisonCompareServerOperation` under the operation key
`RecordComparison.Compare`. The typed client base, `RecordComparisonCompareOperation`, is
generated into `@memberjunction/core-entities`, so the browser calls the same contract over the
generic remote-operation transport — there is no bespoke resolver or GraphQL client:

```typescript
import { RecordComparisonCompareOperation } from '@memberjunction/core-entities';

const op = new RecordComparisonCompareOperation();
const result = await op.Execute(
  {
    EntityName: 'Accounts',
    Keys: [
      { KeyValuePairs: [{ FieldName: 'ID', Value: survivorId }] },
      { KeyValuePairs: [{ FieldName: 'ID', Value: candidateId }] },
    ],
  },
  { provider: this.ProviderToUse }
);
if (result.Success && result.Output) {
  const { Records, Fields } = result.Output;
}
```

In Angular, `RecordComparisonService.GetRecordComparison()` in `@memberjunction/ng-record-merge`
wraps exactly this call. The operation runs as the calling user, so entity permissions and
row-level security apply to the records it loads. Make sure the server bootstrap loads this
package (`LoadRecordComparisonCompareOperation()` is the tree-shaking anchor) so the registration
exists.

## What gets compared

| Rule | Detail |
|---|---|
| Field set | The `IncludeFields` list (case-insensitive) when given; otherwise every field except primary keys and `__mj_*` system columns. |
| Field order | Name fields first, then `DefaultInView` fields, then by `Sequence`, then by name. |
| Reference column | `Keys[0]` is the reference (the survivor candidate). Every other record's cell carries `EqualsReference`. |
| Equality | Trimmed, case-insensitive string comparison; `null` equals only `null`/`undefined`. |
| Empty fields | A field whose value is empty in **every** record is dropped — it carries no signal. |
| `Differs` | `true` when any cell differs from the reference. |
| Record label | The first name field's value, falling back to the key's values. |
| Loading | One `RunView` that ORs every key's `WHERE` clause, `MaxRows` = number of keys, run as the context user. Works for single-column and composite keys of any column name. |

## Result shape

```typescript
interface RecordComparisonResult {
    Success: boolean;
    ErrorMessage?: string;
    EntityName: string;
    Records: RecordComparisonRecord[];       // one per input key, ColumnIndex aligned with Keys
    Fields: RecordComparisonFieldDelta[];    // one per compared, non-empty field
}

interface RecordComparisonFieldDelta {
    FieldName: string;
    DisplayName: string;
    Category: string | null;
    Cells: { ColumnIndex: number; Value: string | number | boolean | null; EqualsReference: boolean }[];
    Differs: boolean;
}
```

`Fields` is a plain-data delta matrix (no `BaseEntity` instances), so it serializes cleanly over
the wire and into a reasoning prompt.

> **Field-level security.** The engine loads values as the context user, so a field the user may
> not read never reaches them. The duplicate-reasoning path additionally drops fields that any
> role is restricted from (`GetIndexRestrictedFieldNames`), because its prompt and stored
> reasoning are read by everyone who can see the duplicate run — see
> `MatchedSetDeltaBuilder` in `@memberjunction/ai-vector-dupe`.

## Development

```bash
pnpm run build
pnpm run test
```

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.
