# @memberjunction/ng-entity-action-ux

A **pluggable runtime-UX framework for entity actions**, plus the flagship driver: a safe, two-step
**Record Process bulk-update runner** (dry-run → review the exact per-record diff → confirm → apply).

Most entity actions "fire and forget." Some need a real interaction first — a preview, a confirmation, a
small form. This package lets an entity action declare a **`RuntimeUXDriverClass`**; when present, the host
mounts that interactive component instead of invoking the action blind. New drivers register via the MJ
ClassFactory and need **zero host changes**.

```
┌─ entity grid / list / form ─────────────────────────────────────────────┐
│  user clicks an entity action                                            │
│        │ EntityActionRequested { action, selectedRecords, ... }          │
│        ▼                                                                  │
│  parent: does action.runtimeUXDriverClass exist?                         │
│        ├─ no  → invoke the action normally (existing path)               │
│        └─ yes → <mj-entity-action-ux-host [DriverClass] [Context]>        │
│                      │ ClassFactory.GetRegistration(Base…, DriverClass)   │
│                      ▼                                                     │
│                 RecordProcessRunnerUX  (or any registered driver)         │
│                   dry-run → diff → confirm → apply → Completed            │
└──────────────────────────────────────────────────────────────────────────┘
```

## What's in the box

| Export | Kind | Purpose |
|---|---|---|
| `BaseEntityActionRuntimeUX` | `@Directive()` base | The driver contract: `@Input() Context`, `@Output() Completed/Cancelled`, `abstract Start()`. |
| `EntityActionUXHostComponent` | `<mj-entity-action-ux-host>` | Resolves a driver key via ClassFactory and mounts it with a context. |
| `EntityActionUXContext` / `EntityActionUXResult` | types | The data the host hands a driver / the outcome it returns. |
| `RecordProcessRunnerUXComponent` | driver (`RecordProcessRunnerUX`) | The flagship: runs a `MJ: Record Processes` as a dry-run, shows the diff, applies on confirm. |
| `AIPromptSelectorComponent` | `<mj-ai-prompt-selector>` | Category-grouped, searchable AI-prompt picker. |
| `FieldRulesBuilderComponent` | `<mj-field-rules-builder>` | Visual authoring for a `FieldRuleSet` (static / field / formula / lookup / prompt + condition), with live metadata validation. |
| `field-rules-model` / `scope` / `prompt-grouping` | pure fns | Angular-free, unit-tested logic the components delegate to. |

## The Record Process Runner (flagship driver)

The runner turns a **FieldRules Record Process** into a safe bulk update:

1. **Dry-run** — calls the server (`RunRecordProcess`, `DryRun: true`), which computes the exact per-record
   field changes **without writing**, and persists them to `MJ: Process Run Details`.
2. **Review** — reads those details (`RunView`) and renders a per-record `old → new` diff, with a summary
   ("42 of 120 records will change · 67 field updates").
3. **Confirm** — only on the user's click does it call `RunRecordProcess` again with `DryRun: false`. MJ's
   built-in Record Changes versioning captures every before/after automatically.

Nothing is ever written until the user has seen precisely what will change.

## Wiring it into a grid (the full integration)

The MJ `entity-data-grid` already emits everything you need (`LoadEntityActionsRequested`,
`EntityActionRequested`) and exposes `ShowEntityActionButtons` to toggle visibility. The parent (an Explorer
view component) owns action resolution + mounting:

```typescript
import { EntityActionEngine } from '@memberjunction/actions';
import { EntityActionUXHostComponent, type EntityActionUXContext } from '@memberjunction/ng-entity-action-ux';
import type { EntityActionConfig } from '@memberjunction/ng-entity-viewer';

// 1) Resolve the entity's actions → grid configs (carry the driver key + its RecordProcessID param)
onLoadEntityActionsRequested(e: { entityInfo: EntityInfo }) {
    const actions = EntityActionEngine.Instance.GetActionsByEntityName(e.entityInfo.Name, 'Active');
    this.dataGrid.EntityActions = actions.map(a => ({
        id: a.ID, name: a.Action, icon: 'fa-solid fa-list-check',
        // the invocation's RuntimeUXDriverClass + the action's RecordProcessID param:
        runtimeUXDriverClass: a.invocations.find(i => i.RuntimeUXDriverClass)?.RuntimeUXDriverClass,
        metadata: { RecordProcessID: a.params.find(p => p.Name === 'RecordProcessID')?.Value },
    }));
}

// 2) On request — mount the driver if one is named, else invoke normally
onEntityActionRequested(e: { entityInfo: EntityInfo; action: EntityActionConfig; selectedRecords: Record<string, unknown>[] }) {
    if (e.action.runtimeUXDriverClass) {
        this.activeDriver = {
            DriverClass: e.action.runtimeUXDriverClass,
            Context: <EntityActionUXContext>{
                EntityInfo: e.entityInfo,
                ScopeKind: 'records',
                SelectedRecordIDs: e.selectedRecords.map(r => r[e.entityInfo.FirstPrimaryKey.Name] as string),
                Config: { RecordProcessID: e.action.metadata?.['RecordProcessID'] },
                Provider: this.Provider,           // multi-provider: thread your provider through
            },
        };
    } else {
        /* existing: invoke the action directly */
    }
}
```

```html
<mj-entity-data-grid #dataGrid [Entity]="entityName" [ShowEntityActionButtons]="true"
    (LoadEntityActionsRequested)="onLoadEntityActionsRequested($event)"
    (EntityActionRequested)="onEntityActionRequested($event)">
</mj-entity-data-grid>

@if (activeDriver) {
    <mj-entity-action-ux-host
        [DriverClass]="activeDriver.DriverClass" [Context]="activeDriver.Context"
        (Completed)="activeDriver = null; dataGrid.RefreshData()"
        (Cancelled)="activeDriver = null">
    </mj-entity-action-ux-host>
}
```

> **Tree-shaking:** call `LoadEntityActionUX()` once from your app bootstrap so the driver's `@RegisterClass`
> side effect survives bundling (same pattern as other MJ dynamically-resolved classes).

## Server pieces (this feature ships them)

- **`RunRecordProcess` GraphQL mutation** (`@memberjunction/server`) → typed
  **`GraphQLRecordProcessClient`** (`@memberjunction/graphql-dataprovider`). The runner uses the client; you
  never inline `gql`.
- **`Run Record Process` Action** (`@memberjunction/core-actions`) — the agent / workflow / low-code surface
  for the same engine. Seeded by [`metadata/actions/.record-processing.json`](../../../../metadata/actions/.record-processing.json).
- The engine is **`RecordProcessExecutor`** (`@memberjunction/record-set-processor`); FieldRules sit on the
  pure rules engine in `@memberjunction/global`.

## Authoring rules (the builder)

```html
<mj-field-rules-builder [EntityName]="'Accounts'" [Provider]="Provider"
    (ValueChange)="ruleSet = $event" (ValidChange)="canSave = $event">
</mj-field-rules-builder>
```

Serialize `ruleSet` into the Record Process's `Configuration` column (`JSON.stringify(ruleSet)`). The builder
validates live against the entity's metadata (`EntityFieldRules.Validate`) and shows per-rule errors.

## Demo metadata (copy-paste, adapt to your entity)

Wire the runner to an entity in three records. Seed a `MJ: Record Processes` (FieldRules), then an
`EntityAction` for the same entity whose invocation names the driver and whose param supplies the process ID:

```jsonc
// 1) the process — metadata/record-processes/.demo.json  (entity: "MJ: Record Processes")
{ "fields": {
    "Name": "Deactivate selected Accounts",
    "EntityID": "@lookup:MJ: Entities.Name=Accounts",
    "WorkType": "FieldRules",
    "ScopeType": "Filter",
    "Status": "Active",
    "Configuration": "{\"Rules\":[{\"TargetField\":\"Status\",\"Source\":{\"Kind\":\"static\",\"Value\":\"Inactive\"}}]}"
} }

// 2) the entity action — links the generic "Run Record Process" action to the Accounts entity,
//    names the driver on the invocation, and pins the RecordProcessID param.
{ "fields": {
    "EntityID": "@lookup:MJ: Entities.Name=Accounts",
    "ActionID": "@lookup:MJ: Actions.Name=Run Record Process",
    "Status": "Active"
  },
  "relatedEntities": {
    "MJ: Entity Action Invocations": [ { "fields": {
        "InvocationTypeID": "@lookup:MJ: Entity Action Invocation Types.Name=Multi-Record",
        "RuntimeUXDriverClass": "RecordProcessRunnerUX", "Status": "Active" } } ],
    "MJ: Entity Action Params": [ { "fields": {
        "Name": "RecordProcessID", "ValueType": "Static",
        "Value": "@lookup:MJ: Record Processes.Name=Deactivate selected Accounts" } } ]
  } }
```

## Roadmap / proposed next work

- **Field-Rules authoring agent** — an AI agent that turns a natural-language instruction ("set Status to
  Inactive for accounts with no activity in 12 months") into a validated `FieldRuleSet`, creates the Record
  Process, and offers to run it via the `Run Record Process` action. Designed; intentionally not seeded here
  because it needs a live system + prompt-tuning to validate.
- **`entityDocument` source** in the visual builder (engine already supports it; today it round-trips as a
  static slot).
- **Saved-rule templates** and a side-by-side "before/after" record preview in the runner.

## Conventions

Standalone components · `inject()` DI · `@if`/`@for`/`@switch` · PascalCase public members · `--mj-*` design
tokens · confirm-left/cancel-right buttons · multi-provider via `Context.Provider` / `[Provider]`.
