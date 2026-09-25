# @memberjunction/ng-base-forms

The foundation for rendering and editing MemberJunction entity records in
Angular — and for presenting **any** entity form as a full-page tab, a modal
dialog, a slide-in panel, or a floating window, from one set of forms with no
per-surface code and no regeneration.

> **Start with the architecture guide:** [/guides/FORMS_ARCHITECTURE_GUIDE.md](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md)
> — the big picture, how generated/custom/interactive forms coexist, and how to
> use every surface. This README is a quick map of the package.

> **Using these as general-purpose database controls (outside a form)?**
> See **[STANDALONE_USAGE.md](./STANDALONE_USAGE.md)** — `<mj-form-field>`,
> `<mj-entity-form-host>`, the overlay shells, `<mj-explorer-entity-data-grid>`, and
> `<mj-collapsible-panel>` are all data-bindable controls you can drop into any
> Angular component with just a `BaseEntity` and an import of `BaseFormsModule`.

## What's in here

| Area | Key exports | Notes |
|------|-------------|-------|
| **Form base** | `BaseFormComponent`, `BaseFormSectionComponent`, `MjRecordFormContainerComponent`, `MjCollapsiblePanelComponent`, `MjFormFieldComponent` | The form itself + its toolbar/section container. Generated forms extend `BaseFormComponent`. |
| **Form host** | `MjEntityFormHostComponent` (`<mj-entity-form-host>`) | Presentation-agnostic: resolve → load → create → bind → re-emit → teardown. Supports full forms and single sections (`SectionName`). Standard-form switch: `FormMode`, `ShowFormModeSwitch`, `FormModeChange`, `SwitchFormMode()` — see [Standard-form switch](#standard-form-switch). |
| **Overlay shells** | `MjFormDialogComponent`, `MjFormSlideInComponent`, `MjFormWindowComponent` (standalone) | Declarative dialog / slide-in / floating-window around the host. |
| **Imperative API** | `MJFormPresenterService.Open(...)` → `MJFormRef` | One call to open any form on any surface. |
| **Per-instance config** | `EntityFormConfig` + `TAB_/DIALOG_/SLIDEIN_FORM_CONFIG` | Toolbar / related sections / collapsibility / width / record-links. Applied via the form reference — **no regeneration**. |
| **Form resolution** | `FormResolverService` | Picks generated / custom / interactive-override form + variants (cached via `InteractiveFormsEngine`). `FormResolution.standard`, `ResolveStandardForm()` and `HasStandardFormAlternative()` expose the generated form a custom one hides. |
| **Form extension** | `BaseFormPanel` + `<mj-form-panel-slot>` + `<mj-form-contributions>` | Inject custom sections; claim a related-entity grid; fill in unbaked `DisplayInForm` relationships. See [PANELS.md](./PANELS.md) and [`/plans/form-contributions.md`](../../../../plans/form-contributions.md). |
| **Form chrome** | `ResolveFormChrome`, `BaseFormPolicy`, `MJ: Form Chrome Rules` | L0–L4 stack: inclusion, Auto ranker, install overlay, user order. Policy is cosmetics only. Left-nav related grids fill leftover column height (`display: contents` on slot hosts; no accordion pixel pin). `SetSectionRowCount` upserts so contribution badges appear. Section search matches title/`MatchesSearch`, not `IsVisible`. See [Forms Architecture §7d](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md#7d-form-chrome--accordion-left-nav-and-more). |
| **New-record defaults** | `BaseFormComponent.NewRecordValues` / `NewRecordValuesForJoinFields` | Related grids copy every join field onto the child. Explorer persists them as `/record/:entity/new?NewRecordValues=...`. |

## Quick start

```typescript
import { MJFormPresenterService, DIALOG_FORM_CONFIG } from '@memberjunction/ng-base-forms';

const ref = this.forms.Open({
  EntityName: 'MJ: AI Agents',
  RecordId: id,                      // omit → new record
  Presentation: 'slide-in',          // 'dialog' | 'slide-in' | 'window'
  Config: { ShowRelatedEntities: false },
});
const saved = await ref.AfterSaved(); // BaseEntity | null
```

```html
<mj-form-dialog [EntityName]="'Users'" [RecordID]="id"
  [(Visible)]="show" (Saved)="onSaved($event)"></mj-form-dialog>
```

## Standard-form switch

A custom class form registered at a higher priority, or an active interactive
override (`EntityFormOverride`), hides the CodeGen-generated form for its
entity. Before MJ#4755 the generated form was unreachable — even a hand-built
record URL resolved to the custom form — and an entity whose custom form only
handles existing records had no way to create one.

`<mj-entity-form-host>` now shows a slim "Open standard form" / "Back to custom
view" strip whenever a custom form hides the generated one. Entities whose only
registration is the generated form (the common case) get no strip.

| Member | Kind | Purpose |
|---|---|---|
| `FormMode: EntityFormMode` | `@Input` | `'default'` (the resolver's normal pick) or `'standard'` (the generated form). A change after the view initializes reloads the form and does **not** emit `FormModeChange`. If the entity has no standard form, the host falls back to the default and logs. |
| `ShowFormModeSwitch = true` | `@Input` | Set `false` to hide the strip; `FormMode` is still honoured. |
| `FormModeChange: EventEmitter<EntityFormMode>` | `@Output` | Emits when the mode changes from inside the host — the strip, `SwitchFormMode()`, or picking an interactive variant (which returns to `'default'`) — so the surface can persist it. |
| `SwitchFormMode(mode): boolean` | method | Switch programmatically. Returns `false` when refused (see below), `true` otherwise (including when already in `mode`). |

**What "standard" means.** The standard form is the **lowest-priority**
`BaseFormComponent` registration for the entity
(`FormResolverService.ResolveStandardForm`). CodeGen registers its form with no
explicit priority, and a custom form either declares a higher one or extends the
generated class (so it registers later and gets a higher auto priority).
`HasStandardFormAlternative(resolution)` is true only when that form exists and
is not the one already mounted.

**Unsaved work is never discarded.** A switch remounts the form, so the host
refuses it — returning `false` and emitting a `warning` `Notification` — when:

- a **saved** record is dirty (`record.IsSaved && record.Dirty`), or
- the form holds unsaved work outside the record's own fields
  (`BaseFormComponent.HasUnsavedChangesBeyondRecord`: pending related-record
  edits/deletes or `HasAdditionalUnsavedChanges`), for new and saved records alike.

**A new record keeps its values.** An unsaved new record (with no other pending
work) switches freely: the live record instance is carried into the other form,
so fields already typed survive the switch.

**Permissions are unchanged.** The standard form enforces the same entity
permissions as any other form; switching grants nothing.

**In Explorer** the mode lives in the record tab's `form` query param
(`?form=standard`), which is the source of truth. `NavigationOptions.formMode`,
a `?form=standard` deep link, back/forward and tab re-focus all reach the
mounted record through `OnQueryParamsChanged`, which switches via
`SwitchFormMode` (so the unsaved-work guard still applies; a refused switch
writes the on-screen mode back to the URL). A strip switch writes the param
back, so the URL records the requested mode, and a record URL without `form`
means the default form. (When the entity has no standard form, the host falls
back to the default form even if `form=standard` is requested.)

## Related docs

- **Architecture (read first):** [/guides/FORMS_ARCHITECTURE_GUIDE.md](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md)
- **Inject custom sections into a form:** [PANELS.md](./PANELS.md)
- **Form chrome (rail / More / inclusion):** [Forms Architecture §7d](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md#7d-form-chrome--accordion-left-nav-and-more)
- **Custom-form override + toolbar pattern:** [packages/Angular/CLAUDE.md](../../CLAUDE.md)
