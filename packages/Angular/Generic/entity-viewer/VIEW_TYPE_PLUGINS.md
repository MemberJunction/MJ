# Entity Viewer — View-Type Plug-in Architecture

`mj-entity-viewer` renders a set of entity records and lets the user switch between **view types** —
Grid, Cards, Timeline, Map, **Cluster**, and anything a third party contributes. View types are a
**plug-in system**: a view type is a class registered with MemberJunction's `ClassFactory` plus a row
in the `MJ: View Types` metadata table. The host discovers them at runtime, asks each whether it's
available for the current entity, renders a switcher, and mounts the selected one.

This document explains the architecture and shows **how to add your own view type with zero changes to
the host**.

---

## 1. The moving parts

| Piece | Where | Responsibility |
|---|---|---|
| **`IViewTypeDescriptor`** | `view-types/view-type.contracts.ts` | Metadata (name/icon) + availability predicate + the components to mount. |
| **`IViewRenderer`** | `view-types/view-type.contracts.ts` | The contract a renderer component honors so the host can feed it data + listen for events uniformly. |
| **`IViewPropSheet`** | `view-types/view-type.contracts.ts` | The contract a configuration prop-sheet honors. |
| **`BaseViewTypeDescriptor`** | `view-types/view-type.contracts.ts` | Abstract base; subclasses carry `@RegisterClass(BaseViewTypeDescriptor, '<DriverClass>')`. |
| **`ViewTypeEngine`** | `view-types/view-type.engine.ts` | Loads `MJ: View Types` rows, resolves descriptors via the ClassFactory, returns the ones available for an entity. |
| **`MJ: View Types`** | metadata (`metadata/view-types/.view-types.json`) | One row per view type: `Name`, `DisplayName`, `DriverClass`, `PropertySheetDriverClass`, `Icon`, `Sequence`, `IsActive`. |
| **The host** | `entity-viewer/entity-viewer.component.*` | Renders the switcher, mounts the active renderer, persists the selection. |

### How a view type is resolved (runtime)

```
MJ: View Types row ──DriverClass──▶ ClassFactory.CreateInstance(BaseViewTypeDescriptor, DriverClass)
        │                                          │
        │                                          ▼
        │                              descriptor.IsAvailableFor(entity)?  ──no──▶ hidden from switcher
        │                                          │ yes
        ▼                                          ▼
   switcher entry  ◀───────────────  available view type (icon + label + descriptor)
```

The DriverClass string is the single source of truth that links the **metadata row** to the
**registered class**. `'ClusterViewType'` in the metadata row's `DriverClass` column must match
`@RegisterClass(BaseViewTypeDescriptor, 'ClusterViewType')` on the descriptor class.

---

## 2. Two rendering paths (and why)

The four **built-in** view types (Grid, Cards, Timeline, Map) are deeply integrated with the host —
the Grid in particular is wired into the host's pagination, toolbar, grid-state persistence, export,
and foreign-key navigation. They render through dedicated, richly-bound template blocks.

**Plug-in** view types (Cluster and any third-party type) render through a **generic dynamic-mount
path**: the host calls `ViewContainerRef.createComponent(descriptor.RendererComponent)`, binds the
`IViewRenderer` inputs via `setInput`, and subscribes to its outputs. **This is the extension point —
a new view type needs no host changes.** It appears in the switcher and mounts automatically as soon as
its descriptor is registered and its `MJ: View Types` row exists.

> The switcher renders as an **icon strip** while there are few view types and collapses to a compact
> **dropdown** (showing the active type's icon + label) once there are more than five, to save space.

![View-type switcher — icon strip and the Cluster view active](./docs/images/view-type-switcher.png)

---

## 3. The contracts

### `IViewTypeDescriptor`

```typescript
export interface IViewTypeDescriptor {
  readonly Name: string;                 // == MJ: View Types.DriverClass, e.g. "ClusterViewType"
  readonly DisplayName: string;          // switcher label, e.g. "Cluster"
  readonly Icon: string;                 // Font Awesome class, e.g. "fa-solid fa-diagram-project"
  readonly RendererComponent: Type<unknown>;     // the component the host mounts
  readonly PropSheetComponent?: Type<unknown>;   // optional config component
  IsAvailableFor(entity: EntityInfo, provider?: IMetadataProvider): boolean;
  EnsureAvailabilityData?(provider?: IMetadataProvider): Promise<void>;  // optional async preload
}
```

`IsAvailableFor` is **synchronous**. If your availability depends on data (e.g. "does this entity have
vectors?"), load it in `EnsureAvailabilityData` — the host awaits that once before computing
availability, so the predicate can read from a now-populated cache.

### `IViewRenderer`

The host binds these inputs (by these exact camelCase names, via `setInput`) and subscribes to these
outputs:

```typescript
export interface IViewRenderer<TConfig = unknown> {
  entity: EntityInfo | null;
  records: Record<string, unknown>[];
  selectedRecordId: string | null;
  filterText: string | null;
  config: TConfig;
  recordSelected: EventEmitter<unknown>;
  recordOpened: EventEmitter<unknown>;
  configChanged: EventEmitter<TConfig>;
}
```

### `IViewPropSheet`

```typescript
export interface IViewPropSheet<TConfig = unknown> {
  entity: EntityInfo | null;
  config: TConfig;
  configChange: EventEmitter<TConfig>;
}
```

![A view type's configuration prop-sheet (Cluster)](./docs/images/view-type-prop-sheet.png)

---

## 4. Configuration & persistence

- The **active** view type is persisted on **`UserView.ViewTypeID`** (the source of truth; supersedes
  the legacy `DisplayState.defaultMode`).
- **Per-view-type config** is persisted in **`UserView.DisplayState.viewTypeConfigs`** — an array of
  `{ viewTypeId, config }` keyed by the `MJ: View Types` row ID, so each type keeps its own settings in
  parallel (switching Map↔Timeline↔Cluster and back preserves each one's config).
- The host treats `config` **opaquely** (`Record<string, unknown>`). Each plug-in owns the shape of its
  own config and parses it with its own typed interface (e.g. `ClusterViewConfig`). The host emits
  `viewTypeConfigChange` when a renderer/prop-sheet mutates config; the host app persists it.

---

## 5. How to add a new view type (worked example)

Suppose you want a **Kanban** view type for entities that have a status field.

### Step 1 — Renderer component (implements `IViewRenderer`)

```typescript
@Component({ standalone: false, selector: 'my-kanban-renderer', template: `...` })
export class KanbanRendererComponent implements IViewRenderer<Record<string, unknown>> {
  @Input() entity: EntityInfo | null = null;
  @Input() records: Record<string, unknown>[] = [];
  @Input() selectedRecordId: string | null = null;
  @Input() filterText: string | null = null;
  @Input() config: Record<string, unknown> = {};

  @Output() recordSelected = new EventEmitter<unknown>();
  @Output() recordOpened = new EventEmitter<unknown>();
  @Output() configChanged = new EventEmitter<Record<string, unknown>>();

  // ...group `records` into columns by the status field, render lanes, emit on click...
}
```

### Step 2 — (optional) Prop-sheet component (implements `IViewPropSheet`)

```typescript
@Component({ standalone: false, selector: 'my-kanban-prop-sheet', template: `...` })
export class KanbanPropSheetComponent implements IViewPropSheet<Record<string, unknown>> {
  @Input() entity: EntityInfo | null = null;
  @Input() config: Record<string, unknown> = {};
  @Output() configChange = new EventEmitter<Record<string, unknown>>();
  // ...let the user pick which field is the "status" column...
}
```

### Step 3 — Descriptor (registered with the ClassFactory)

```typescript
@RegisterClass(BaseViewTypeDescriptor, 'KanbanViewType')
export class KanbanViewType extends BaseViewTypeDescriptor {
  readonly Name = 'KanbanViewType';
  readonly DisplayName = 'Kanban';
  readonly Icon = 'fa-solid fa-table-columns';
  readonly RendererComponent: Type<unknown> = KanbanRendererComponent;
  override readonly PropSheetComponent: Type<unknown> = KanbanPropSheetComponent;

  override IsAvailableFor(entity: EntityInfo): boolean {
    return entity.Fields.some(f => f.Name.toLowerCase() === 'status');
  }
}

export function LoadKanbanViewType(): void { /* tree-shaking guard */ }
```

Declare the two components in your module, and call `LoadKanbanViewType()` (e.g. from the module
constructor) so the `@RegisterClass` side effect survives bundling.

### Step 4 — Seed the `MJ: View Types` metadata row

Add to `metadata/view-types/.view-types.json` (then `mj sync push`):

```json
{
  "fields": {
    "Name": "Kanban",
    "DisplayName": "Kanban",
    "DriverClass": "KanbanViewType",
    "PropertySheetDriverClass": "KanbanViewType",
    "Icon": "fa-solid fa-table-columns",
    "Sequence": 70,
    "IsActive": 1,
    "SupportsConfiguration": 1
  }
}
```

That's it. The Kanban view type now appears in the switcher for any entity with a `status` field — **no
changes to `mj-entity-viewer`.**

---

## 6. Reference implementation — the Cluster view type

The **Cluster** view type lives in `@memberjunction/ng-clustering` and is the canonical proof of the
model: a *feature package contributes a view type by depending only on this package's contracts* (the
dependency edge is `ng-clustering → ng-entity-viewer`, never the reverse).

- `view-type/cluster-view-type.ts` — the descriptor.
- `view-type/cluster-view-renderer.component.ts` — `IViewRenderer` wrapper over `mj-cluster-scatter`
  that runs the shared `ClusteringService` pipeline (same code the Knowledge Hub uses).
- `view-type/cluster-view-prop-sheet.component.ts` — `IViewPropSheet` for algorithm / K / 2D-3D /
  color-by / record cap / AI naming.
- `view-type/entity-document-availability.engine.ts` — a `BaseEngine` cache of active
  `MJ: Entity Documents`; the descriptor's `IsAvailableFor` returns true only for entities that have
  vectors, and `EnsureAvailabilityData` preloads it.

![The Cluster view type rendered inside the entity viewer](./docs/images/view-type-cluster.png)
