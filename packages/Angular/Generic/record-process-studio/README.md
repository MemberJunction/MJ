# @memberjunction/ng-record-process-studio

The generic **Bulk Operations studio** — reusable Angular UI for authoring, running, and auditing
**Record Processes** (rules-driven bulk operations). MJExplorer's *Bulk Operations* app is a thin host over
these components, but any MJ Angular app can drop them in.

A "Record Process" is a saved, reusable operation that runs over a set of an entity's records. The flagship
work type is **FieldRules** — declarative rules that set fields from a fixed value, another field, a
formula, an entity lookup, or an **AI prompt** — always previewed as an exact per-record diff before any
write happens.

## Components

| Component | Selector | Purpose |
|---|---|---|
| `RecordProcessStudioComponent` | `<mj-record-process-studio>` | The hub — list / search / create / edit / run bulk operations. |
| `RecordProcessEditorComponent` | `<mj-record-process-editor>` | Author one process: basics + target entity + scope + the embedded visual rules builder + an inline dry-run **Preview**. |
| `RecordProcessHistoryComponent` | `<mj-record-process-history>` | Run history with per-record drill-in (the field diff persisted on each Process Run Detail). |

All three are **standalone**, `OnPush`, extend `BaseAngularComponent` (so they accept `[Provider]` for
multi-provider), use **`--mj-*` design tokens** only (light + dark), and import nothing from
`@angular/router` (Generic-package rule).

## Quick use

```html
<!-- the whole hub -->
<mj-record-process-studio [Provider]="ProviderToUse"></mj-record-process-studio>

<!-- just the authoring editor for one record (e.g. embedded in an entity form) -->
<mj-record-process-editor [Record]="record" [ShowToolbar]="false" [Provider]="ProviderToUse"></mj-record-process-editor>

<!-- run history, optionally scoped to one process -->
<mj-record-process-history [RecordProcessID]="id" [Provider]="ProviderToUse"></mj-record-process-history>
```

Call `LoadRecordProcessStudio()` once from your app bootstrap to keep the components through tree-shaking.

## How it composes

```
ng-record-process-studio
   ├─ embeds <mj-field-rules-builder>   ← @memberjunction/ng-entity-action-ux (visual rule authoring)
   ├─ embeds <mj-ai-prompt-selector>    ← (grouped AI-prompt picker, via the builder)
   ├─ mounts  RecordProcessRunnerUX     ← @memberjunction/ng-entity-action-ux (dry-run → confirm runner)
   └─ runs    RunRecordProcess          ← @memberjunction/graphql-dataprovider → RecordProcessExecutor engine
```

The studio is intentionally **thin orchestration** over already-tested primitives: the rule engine
(`@memberjunction/global` field-rules, 25 tests), its metadata-aware layer (`@memberjunction/core`
`EntityFieldRules`), the transform plugins (`@memberjunction/field-rules-transforms`, 8 tests), the
builder/runner/serialization (`@memberjunction/ng-entity-action-ux`, 23 tests), and the executor +
scope-override (`@memberjunction/record-set-processor`, 24 facade tests). The studio adds the
list/edit/run/history surfaces around them.

## The editor, embedded two ways

- **In the Bulk Operations app** — `RecordProcessStudioComponent` shows it with its Save / Preview toolbar.
- **In the custom `MJ: Record Processes` entity form** — `ShowToolbar=false`; the form's
  `<mj-record-form-container>` owns Save while the editor mutates the record in place. So editing a process
  from anywhere in Explorer gets the same visual rules builder instead of a raw `Configuration` JSON field.

## Conventions held

Standalone + `inject()` · `@if`/`@for`/`@switch` · **PascalCase public members** · `--mj-*` tokens only ·
multi-provider via `[Provider]` / `ProviderToUse` · no Router imports · self-contained chrome (each component
owns its own toolbar so it drops into any host).
