<!-- For the overall forms architecture (tabs / dialogs / slide-ins, the form
host, EntityFormConfig, generated vs interactive forms), see
/guides/FORMS_ARCHITECTURE_GUIDE.md. This doc covers ONE piece of it: adding
panels to a form via the slot system. -->

# BaseFormPanel: dynamic slot-based form extensions

Add panels to entity edit forms WITHOUT replacing the generated form. Panels
self-register against well-known slots and `<mj-form-panel-slot>` mounts them
dynamically at runtime. No template edits per consumer, no per-entity custom
form class.

> Before this existed, the only way to extend a generated form was to
> override it entirely — declare a `*Extended` class, restate every
> generated panel by hand, and re-render the related-entity grids. That
> pattern still exists for forms that are 100% custom (`AIAgentFormComponentExtended`
> is a good example), but for "I just want to add one or two panels" the
> slot system is much cleaner.

## TL;DR

1. Write a standalone Angular component that extends `BaseFormPanel`.
2. Decorate it with `@RegisterClassEx(BaseFormPanel, { metadata: { entity, slot, sortKey } })`.
3. Add it to your module's `declarations` so the decorator runs.
4. Done. The next time anyone opens that entity's edit form, the panel renders in your chosen slot.

## Architecture

```
<mj-record-form-container>                  ← provides FormSlotCoordinator (per-instance)
   ├── <mj-form-toolbar>
   ├── [top-area slot]                      ← CodeGen-emitted; rare
   ├── [before-fields slot]                 ← CodeGen-emitted; banners / warnings
   ├── Connection Details (generated)
   ├── Content Classification (generated)
   ├── ... other field panels (generated)
   ├── [after-fields slot]                  ← CodeGen-emitted; THE common slot
   ├── Content Items grid (related-entity)
   ├── ... other related-entity grids
   ├── [after-related slot]                 ← CodeGen-emitted; bottom addenda
   └── [after-everything slot]              ← Container-emitted; ALWAYS present (fallback)
```

Every `<mj-form-panel-slot>` host:
- Queries `MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(BaseFormPanel, ...)` to find panels for its `(entity, slot)` pair.
- Sorts results by `metadata.sortKey` desc, then `Priority` desc, then registration order.
- Mounts each registered panel via `ViewContainerRef.createComponent`, wiring `[Record]` / `[FormComponent]` / `[FormContext]`.
- Coordinates with siblings via the per-container `FormSlotCoordinator` to handle fallbacks (see below).

## Available slots

| Slot                | When CodeGen emits it                                 | Fallback behavior                          |
|---------------------|--------------------------------------------------------|--------------------------------------------|
| `top-area`          | Inside the optional top-area section, if the entity has one. | Forwards to `before-fields` if missing.    |
| `before-fields`     | Above the first field panel.                          | Forwards to `after-fields` if missing.     |
| `after-fields`      | Between field panels and related-entity grids.        | Forwards to `after-related` if missing.    |
| `after-related`     | Below the related-entity grids.                       | Forwards to `after-everything`.            |
| `after-everything`  | **Always present** (container guarantees it).         | (terminal — never falls through)           |

The fallback chain (`FORM_SLOT_CHAIN` in `form-slot-coordinator.service.ts`) walks forward only. A panel that wants `after-fields` but lands on a form whose CodeGen-generated HTML predates the slot emitter will mount at `after-everything` instead — at the bottom of the form, still functional, still editable. After the consumer reruns CodeGen, the panel jumps into the preferred position.

## Authoring a panel

Two files: `your-panel.ts` (component) and `your-panel.html` (template). CSS optional.

### `your-panel.ts`

```typescript
import { Component } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJContentSourceEntity } from '@memberjunction/core-entities';

@RegisterClassEx(BaseFormPanel, {
    key: 'content-sources:my-extra-panel',     // for diagnostics; not used for matching
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: Content Sources',         // exact entity name (case-sensitive)
        slot: 'after-fields',                  // where you want it
        sortKey: 50,                           // higher = earlier within the slot
    },
})
@Component({
    standalone: false,
    selector: 'mj-content-sources-my-extra-panel',
    templateUrl: './your-panel.html',
})
export class ContentSourcesMyExtraPanel extends BaseFormPanel<MJContentSourceEntity> {
    // Inherited: Record, FormComponent, FormContext, EditMode.
    // Define your own getters/setters that read/write Record fields.
}
```

### `your-panel.html`

Wrap the content in `<mj-collapsible-panel>` so it visually matches the other panels in the form. Pass `[Form]="FormComponent"` (not `[Form]="this"` — `this` is the panel component, not the form). The collapsible panel takes care of section-state tracking via the form component.

```html
<mj-collapsible-panel
    SectionKey="myExtraPanel"
    SectionName="My Extra Panel"
    Icon="fa fa-flask"
    [Form]="FormComponent"
    [FormContext]="FormContext">

    <!-- your fields here -->
</mj-collapsible-panel>
```

### Module declaration

Standalone-or-not, the decorated class still needs to be declared somewhere for the decorator side effects to fire and to avoid tree-shaking. Add it to your feature module's `declarations` AND `exports`:

```typescript
import { ContentSourcesMyExtraPanel } from './your-panel';

@NgModule({
    declarations: [ContentSourcesMyExtraPanel, /* ... */],
    exports:      [ContentSourcesMyExtraPanel, /* ... */],
    // ...
})
export class YourFeatureModule {}
```

That's the entire authoring contract. Once the module is imported by an app, the panel is discoverable.

## Entity-agnostic panels (the `'*'` wildcard)

Register with `entity: '*'` to make a panel mount on **every** entity's form,
regardless of which entity it is. This is for cross-cutting concerns that aren't
tied to one entity — e.g. a panel that surfaces an ML model's predictions on any
record that has a scoring binding, governance widgets that apply fleet-wide, etc.

```typescript
@RegisterClassEx(BaseFormPanel, {
    key: 'model-predictions:model-prediction',
    skipNullKeyWarning: true,
    metadata: { entity: '*', slot: 'after-fields', sortKey: 40 },
})
@Component({ standalone: false, selector: '...', templateUrl: '...' })
export class ModelPredictionPanel extends BaseFormPanel { /* ... */ }
```

**Wildcard panels MUST self-hide.** Because the panel mounts on *every* form, it
has to render nothing on the forms it doesn't apply to — otherwise it clutters
the 99% of forms it has no business on. Do the applicability check in the panel
(typically one cached `RunView` keyed on `Record.EntityInfo.ID`) and gate the
whole template behind it:

```html
@if (HasPredictions) {
  <mj-collapsible-panel SectionName="Model Predictions" ...>
    <!-- ... -->
  </mj-collapsible-panel>
}
```

Keep that check cheap — a single cached RunView, skipped once resolved per
entity. The reference implementation is `ModelPredictionPanel`
(`core-entity-forms/src/lib/panels/model-predictions/`), which only renders when
the record's entity has an active `MJ: ML Model Scoring Bindings` row.

## Multiple panels in the same slot

Slot host sorts by `metadata.sortKey` (desc), then `Priority` (desc), then registration order. Use ranges (100, 50, 10) so future panels can wedge in without renumbering every neighbor.

```typescript
// Renders first
@RegisterClassEx(BaseFormPanel, { metadata: { entity: 'X', slot: 'after-fields', sortKey: 100 } })
class HighPriorityPanel extends BaseFormPanel {}

// Renders below
@RegisterClassEx(BaseFormPanel, { metadata: { entity: 'X', slot: 'after-fields', sortKey: 50 } })
class LowerPriorityPanel extends BaseFormPanel {}
```

## Source-type-conditional panels (gating inside the panel template)

When a panel only applies to a subset of entity rows (e.g., Website content sources but not Entity sources), gate the rendering inside your panel's TEMPLATE — don't try to register conditionally:

```html
@if (IsWebsiteSourceType) {
  <mj-collapsible-panel SectionName="Website Crawler Settings" ...>
    <!-- your fields here -->
  </mj-collapsible-panel>
}
```

```typescript
public get IsWebsiteSourceType(): boolean {
    const t = this.Record?.ContentSourceType;
    return t != null && t.trim().toLowerCase() === 'website';
}
```

The panel still mounts and pays the registration cost, but renders nothing — cheap. Conditional registration ("only register if record.SomeField === X") doesn't work because the slot host queries by entity name, not by per-record state.

## Reusing panels outside the slot system (composition)

`BaseFormPanel` subclasses are plain Angular components. You can embed them directly anywhere you want — they don't have to be discovered via the slot host:

```html
<!-- A dashboard quick-edit dialog that shares one panel with the entity form -->
<mj-content-sources-my-extra-panel
  [Record]="record"
  [FormComponent]="hostFormComponent">
</mj-content-sources-my-extra-panel>
```

This is the composition pattern. The same panel implementation serves both the dynamic slot system AND any number of custom UIs. Write the panel once, use it everywhere.

> Note: `FormComponent` is required by `<mj-collapsible-panel>` for section-state tracking. If you're embedding the panel into a non-`BaseFormComponent` host (a popover, a dashboard slide-in), either skip the collapsible wrapper or pass a stub.

## When to use this vs. a custom form override

| Need                                                          | Use                                          |
|---------------------------------------------------------------|----------------------------------------------|
| Add a few extra panels to an otherwise-fine generated form    | **BaseFormPanel + slot**                     |
| Hide or rearrange generated field panels                      | Custom form override (whole-form replace)    |
| Replace the toolbar / record container                        | Custom form override                         |
| Add source-type-conditional UI (e.g., Website-only panel)     | **BaseFormPanel + slot**, gate in template   |
| One-off panel for a specific entity                           | **BaseFormPanel + slot**                     |
| Highly bespoke UX like AI Agent's flow editor                 | Custom form override                         |

The slot system handles 90%+ of "I want to extend this form" cases without the maintenance burden of restating the entire generated structure.

## Implementation files

| File                                                                                  | Role                                                          |
|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `base-form-panel.ts`                                                                  | `BaseFormPanel` abstract class + `FormPanelSlot` type union + `FormPanelRegistrationMetadata` shape. |
| `form-panel-slot.component.ts`                                                        | `<mj-form-panel-slot>` host — discovery, sorting, dynamic mount, fallback resolution. |
| `form-slot-coordinator.service.ts`                                                    | `FormSlotCoordinator` — per-container registry of which slots are physically present. `FORM_SLOT_CHAIN` constant. |
| `record-form-container.component.{ts,html}`                                           | Provides `FormSlotCoordinator` (`providers:`) + the always-on `after-everything` slot in its template. |
| `packages/CodeGenLib/src/Angular/angular-codegen.ts` (`innerCollapsiblePanelsHTML`)   | Emits the four primary slot markers into every generated form template. |
