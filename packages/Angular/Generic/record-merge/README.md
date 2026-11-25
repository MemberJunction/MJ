# @memberjunction/ng-record-merge

A reusable Angular widget for **comparing two records side by side and choosing, field by field,
which values survive a merge** — plus a thin service that fetches the field comparison from the
server.

It is the merge UI used by the entity grid's **Merge** button in `@memberjunction/ng-entity-viewer`.
How merging works end to end — `Metadata.MergeRecords`, dependency re-pointing, logging, auto-merge
and duplicate detection — is covered in the
[Duplicate Management Guide](../../../../guides/DUPLICATE_MANAGEMENT_GUIDE.md).

> **The panel does not merge anything.** It collects the user's choices and emits them. The host
> builds the `RecordMergeRequest` and calls `MergeRecords` on its provider.

## Installation

```bash
npm install @memberjunction/ng-record-merge
```

```typescript
import { RecordMergeModule } from '@memberjunction/ng-record-merge';

@NgModule({
  imports: [RecordMergeModule],
})
export class MyFeatureModule {}
```

`RecordMergePanelComponent` is NgModule-declared (`standalone: false`); import `RecordMergeModule`.
`RecordComparisonService` is `providedIn: 'root'`.

## What's in the package

| Export | Kind | Purpose |
|---|---|---|
| `RecordMergeModule` | NgModule | Declares and exports the panel |
| `RecordMergePanelComponent` (`mj-record-merge-panel`) | Component | Two-column comparison with per-field selection and a confirm step |
| `RecordComparisonService` | Service | Calls the `RecordComparison.Compare` Remote Operation for the field-level comparison |
| `FieldComparison`, `MergeConfig`, `MergeComparisonResult`, `MergeConfirmedEvent`, `FieldSelectionEvent`, `MergeActionResult` | Types | The panel's data contracts |

## `mj-record-merge-panel`

### Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `Fields` | `FieldComparison[]` | `[]` | One row per field: left and right values, whether they conflict, which side is selected, read-only flag, data type |
| `Config` | `MergeConfig \| null` | `null` | Entity name, the two record IDs, the column labels, and which side survives. The panel renders an empty state until this is set. |
| `ShowConflictsOnly` | `boolean` | `false` | Start with only the conflicting fields visible (the user can toggle) |
| `MergeEnabled` | `boolean` | `true` | Show the **Merge Records** / **Cancel** footer. Set it to `false` for a comparison-only view. |
| `IsMerging` | `boolean` | `false` | Shows *Merging…* and disables the footer buttons while the host's merge call is running |

`Fields` and `Config` are read when the panel initializes (the conflict counts are computed in
`ngOnInit`). To show a different pair, re-create the panel — for example inside an `@if` keyed on the
pair — rather than mutating the inputs in place.

### Outputs

| Output | Payload | When |
|---|---|---|
| `MergeConfirmed` | `MergeConfirmedEvent` (`Config`, `ResolvedFields`) | The user confirmed the merge in the panel's confirmation dialog |
| `MergeCancelled` | `void` | The user clicked **Cancel** |
| `FieldSelected` | `FieldSelectionEvent` (`FieldName`, `SelectedSide`, `Value`) | The user picked a side for one field |

### Behaviour

- Header: *Record Comparison*, the entity name, and *N conflicts / M fields*; a toggle between
  **Show Conflicts Only** and **Show All Fields**.
- Click a value to keep it; the column headers have *select all from this side* buttons. Read-only
  fields (`IsReadOnly`) show a lock and cannot be changed.
- Values render as text; `null`/`undefined` show as *(empty)*, booleans as *Yes*/*No*, dates in the
  user's locale.
- **Merge Records** opens a confirmation (*"This will merge the selected field values and create a
  merge log. This action cannot be undone."*) with **Confirm Merge** and **Cancel**. Only confirming
  emits `MergeConfirmed`.
- The panel compares **two** records. For three or more, use the Duplicates dashboard or call
  `MergeRecords` directly.

## Wiring it up

```typescript
import { CompositeKey, RecordMergeRequest } from '@memberjunction/core';
import { FieldComparison, MergeConfig, MergeConfirmedEvent, RecordComparisonService } from '@memberjunction/ng-record-merge';

export class MyMergeHost extends BaseAngularComponent {
    private comparison = inject(RecordComparisonService);
    public Fields: FieldComparison[] = [];
    public Config: MergeConfig | null = null;
    public IsMerging = false;

    public async Load(entityName: string, left: CompositeKey, right: CompositeKey): Promise<void> {
        // Key values travel as strings.
        const toKey = (k: CompositeKey) => ({
            KeyValuePairs: k.KeyValuePairs.map(kv => ({ FieldName: kv.FieldName, Value: String(kv.Value) })),
        });
        const result = await this.comparison.GetRecordComparison(
            { EntityName: entityName, Keys: [toKey(left), toKey(right)] },
            this.ProviderToUse
        );
        if (!result.Success || !result.Output) {
            // show result.ErrorMessage
            return;
        }
        this.Fields = result.Output.Fields.map(f => ({
            FieldName: f.FieldName,
            DisplayLabel: f.DisplayName,
            LeftValue: f.Cells[0]?.Value ?? null,
            RightValue: f.Cells[1]?.Value ?? null,
            HasConflict: f.Differs,
            SelectedSide: 'left',
            IsReadOnly: false, // look the field up on the EntityInfo and use its ReadOnly flag
            DataType: '',
        }));
        this.Config = {
            EntityName: entityName,
            LeftRecordID: left.ToURLSegment(),
            RightRecordID: right.ToURLSegment(),
            SurvivorSide: 'left',
            LeftLabel: result.Output.Records[0]?.Label ?? 'Left',
            RightLabel: result.Output.Records[1]?.Label ?? 'Right',
        };
    }

    public async OnMergeConfirmed(e: MergeConfirmedEvent, survivor: CompositeKey, loser: CompositeKey): Promise<void> {
        const takeFrom: 'left' | 'right' = e.Config.SurvivorSide === 'left' ? 'right' : 'left';
        const request: RecordMergeRequest = {
            EntityName: e.Config.EntityName,
            SurvivingRecordCompositeKey: survivor,
            RecordsToMerge: [loser],
            // Only the fields where the user kept the OTHER record's value need to be sent.
            FieldMap: e.ResolvedFields
                .filter(f => f.HasConflict && !f.IsReadOnly && f.SelectedSide === takeFrom)
                .map(f => ({ FieldName: f.FieldName, Value: takeFrom === 'left' ? f.LeftValue : f.RightValue })),
        };
        this.IsMerging = true;
        try {
            const result = await this.ProviderToUse.MergeRecords(request);
            // check result.Success / result.OverallStatus and notify the user
        } finally {
            this.IsMerging = false;
        }
    }
}
```

```html
@if (Config) {
  <mj-record-merge-panel
      [Fields]="Fields"
      [Config]="Config"
      [ShowConflictsOnly]="true"
      [IsMerging]="IsMerging"
      (MergeConfirmed)="OnMergeConfirmed($event, survivorKey, loserKey)"
      (MergeCancelled)="Config = null">
  </mj-record-merge-panel>
}
```

The working reference is `GridViewRendererComponent` in `@memberjunction/ng-entity-viewer`
(`src/lib/view-types/renderers/grid-view-renderer.component.ts`): it gates the Merge button on
`AllowRecordMerge` and the user's update and delete permissions, refuses IS-A subtype records, shows
each side's dependent-record count, lets the user pick which record to keep, and sends a `FieldMap`
of the conflicting writable fields taken from the record being merged away.

## `RecordComparisonService`

```typescript
GetRecordComparison(
    input: RecordComparisonCompareInput,          // EntityName, Keys (column 0 = reference), optional IncludeFields
    provider?: IMetadataProvider | null           // pass the component's ProviderToUse
): Promise<RemoteOpResult<RecordComparisonCompareOutput>>
```

A thin wrapper over the `RecordComparison.Compare` Remote Operation, implemented on the server by
[`@memberjunction/record-comparison`](../../../RecordComparison/README.md). It never throws for
logical failures: check `Success` and read `Output` (`Records`, `Fields`). The comparison runs as the
calling user, skips primary keys and `__mj_*` columns, and drops fields that are empty in every
record.

## Dependencies

- `@memberjunction/core`, `@memberjunction/core-entities`, `@memberjunction/global`
- `@memberjunction/ng-ui-components` (empty state), `@memberjunction/ng-shared-generic`
- `@angular/core`, `@angular/common` (peers)

## Development

```bash
pnpm run build
pnpm run test
```

## License

Business Source License 1.1 — see [LICENSE](../../../../LICENSE) for details.
