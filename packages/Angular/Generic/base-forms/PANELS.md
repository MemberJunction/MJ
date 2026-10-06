<!-- For the overall forms architecture (tabs / dialogs / slide-ins, the form
host, EntityFormConfig, generated vs interactive forms), see
/guides/FORMS_ARCHITECTURE_GUIDE.md. This doc covers ONE piece of it: adding
panels to a form via the slot system. -->

# BaseFormPanel: dynamic slot-based form extensions

Related grids appear on the parent form through the chrome stack in
[FORMS_ARCHITECTURE_GUIDE.md §7d](../../../guides/FORMS_ARCHITECTURE_GUIDE.md#7d-form-chrome--accordion-left-nav-and-more):
L1 `inclusion` (`Primary` / `More` / `None`), L2 ranker on Auto leftovers,
L3 `MJ: Form Chrome Rules`, L4 user order. `None` is not a More item.
In **left-nav** the rail is Primary contributions (lead band, e.g. Overview)
+ Details (leftover field panels) + each Primary related + More; the body
shows only the selected group, locked open. `inclusion: 'Primary'` on a
contribution is its own rail item — it does **not** fold into Details.
A persisted user section order can override that; the generated
`form.sections` list is not a custom order and does not.
First-class related items (and non-lead contributions) sort by
`UI.sortKey` / registration `sortKey` descending, then explicit
Primary, then ranker score. The left/right rail width is user-resizable
and persisted per entity (`mj.formChrome.<entity>.railWidth`); collapsed
is always the 36px spine.
`BaseFormPolicy.DecorateChrome` is cosmetics only — it cannot change
membership.

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
   ├── <mj-form-contributions>              ← Container-emitted; fill-in related grids
   └── [after-everything slot]              ← Container-emitted; ALWAYS present (fallback)
```

Every `<mj-form-panel-slot>` host:
- Queries `MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(BaseFormPanel, ...)` to find panels for its `(entity, slot)` pair.
- Sorts results by `metadata.sortKey` desc, then `Priority` desc, then registration order.
- Mounts each registered panel via `ViewContainerRef.createComponent`, wiring `[Record]` / `[FormComponent]` / `[FormContext]`.
- Sets the slot host (and `BaseFormPanel` itself) to `display: contents` so left-nav leftover height reaches the related grid, not a wrapper.
- Coordinates with siblings via the per-container `FormSlotCoordinator` to handle fallbacks (see below).

Related grids call `FormComponent.NewRecordValues(relatedEntity, joinField)`
so **New** prefills every join field that filters the grid.

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

## Section indicators (unsaved dot + invalid count) on your panel

Wrap your content in `<mj-collapsible-panel>` and the section gets the same marks a
generated section gets — an amber dot when one of its `mj-form-field`s is edited, a red
count when one is invalid or required-and-empty — on the accordion header and on the
left-nav rail item, with no code. The panel derives them from its projected fields
and registers itself with the container's `FormSectionIndicatorCoordinator`.

Content that is not `mj-form-field` (a grid editor, a designer) reports through the
`[Indicators]` input; counts are added to the derived ones:

```html
<mj-collapsible-panel SectionKey="lineItems" SectionName="Line Items" [Form]="FormComponent" [FormContext]="FormContext"
    [Indicators]="{ DirtyCount: EditedRows, ErrorCount: InvalidRows }">
```

Failed-save errors whose `Source` is a graph path (`Lines[2].Amount`) route to the panel
whose `SectionKey` matches the leading segment; declare `ValidationSources="Lines"` when
the names differ. A hero that is not a collapsible panel is not a rail item and needs
nothing; a custom rail section that is not a collapsible panel can implement
`FormSectionIndicatorSource` and register with the coordinator directly. See
[Forms Architecture §7d — Section indicators](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md#7d-form-chrome--accordion-left-nav-and-more).

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
| Replace a related-entity grid with a custom card              | **BaseFormPanel + `relatedEntity` claim**    |
| Surface another app's related records on this form            | Same claim, or let the composer fill in the stock grid |
| Hide or rearrange generated field panels                      | Custom form override (whole-form replace)    |
| Replace the toolbar / record container                        | Custom form override                         |
| Add source-type-conditional UI (e.g., Website-only panel)     | **BaseFormPanel + slot**, gate in template   |
| One-off panel for a specific entity                           | **BaseFormPanel + slot**                     |
| Highly bespoke UX like AI Agent's flow editor                 | Custom form override                         |

The slot system handles 90%+ of "I want to extend this form" cases without the maintenance burden of restating the entire generated structure.

## Form contributions

A form is a list of **contributions**. A related-entity grid is the default contribution when nobody claimed that relationship. Installed OpenApps register panels; ClassFactory discovery is “what is installed.” Full write-up: [`/plans/form-contributions.md`](../../../../plans/form-contributions.md).

**CodeGen keeps emitting baked related grids.** Override is runtime:

| On the form | Result |
|---|---|
| Baked grid, no claim | Baked grid shows. Composer does not add a second one. |
| A panel **claims** that relationship | Baked section is hidden (`HiddenSectionKeys`). The panel mounts in its slot. |
| `DisplayInForm` relationship not baked (other app installed; custom form omitted it) | Composer mounts the stock grid — or the claiming panel. |
| Extra pane (`relatedEntity` omitted) | Existing slot host mounts it. |

**Replace a related grid** so your panel is the contribution (baked grid hides):

```typescript
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:People:related:EventOrderLines',
    metadata: {
        entity: 'MJ_BizApps_Common: People',
        slot: 'after-related',
        sortKey: 80,
        relatedEntity: 'MJ_BizApps_Orders: Event Order Lines',
        relatedJoinField: 'PersonID',   // required when two FKs point at the same entity
    },
})
export class PersonEventTicketsPanel extends BaseFormPanel { /* ticket cards */ }
```

**Replace a field panel with a hero that is not a collapsible panel** (Orders header, Person identity):

```typescript
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:OrderHeaders:header',
    metadata: {
        entity: 'MJ_BizApps_Orders: Order Headers',
        slot: 'before-fields',          // top of every generated form
        sortKey: 100,
        contributionKey: 'header',      // last-wins identity if two apps ship a header
        replacesSectionKey: 'details',  // CodeGen SectionKey — hides the baked Details panel
    },
})
export class OrderHeaderHeroPanel extends BaseFormPanel {
    // template is a hero strip — no <mj-collapsible-panel>
}
```

`replacesSectionKey` is the `SectionKey` on the generated `<mj-collapsible-panel>` (camelCase of the section name). Must name a concrete `entity`, not `'*'`.

`contributionKey` defaults to `related:${relatedEntity}:${joinField}` for related claims. Two registrations with the same key collapse; highest ClassFactory `Priority` wins. Discover via `GetAllRegistrationsByMetadata` — do not stuff entity/slot/order into `Key`.

Worked examples (Orders hero, Person tickets, Sales fill-in, competing headers): [Forms Architecture Guide §7c](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md#7c-form-contributions--add-replace-or-fill-in-no-regen).

`<mj-record-form-container>` always hosts `<mj-form-contributions>`, so custom forms that use the container get fill-in grids with no template edit. Put CodeGen slots back on custom templates so claimed panels land in `after-related` instead of falling through to `after-everything`. A form that is not in the container can drop in:

```html
<mj-form-contributions [Record]="record" [FormComponent]="this"></mj-form-contributions>
```

Related section keys use the same camelCase as CodeGen (`FormSectionCamelCase` / `RelatedEntitySectionKey`) so hide-baked and skip-baked hit the right panel.

## Metadata contributions (React form panels)

`BaseFormPanel` is the compiled path. The same slots also accept **rows**: a
`MJ: Entity Form Contributions` row pointing at a `Type='Widget'` Component whose spec declares
`componentRole: 'form-panel'`. No Angular, no build, no deployment.

A row carries the same registration bag this document describes for the compiled metadata object —
`Slot`, `SortKey`, `ContributionKey`, `RelatedEntityID` + `RelatedJoinField`, `ReplacesSectionKey`,
`ReplacesSectionKeys`, `ReplacesFieldNames`, `InSectionKey` + `SectionPosition`, `Inclusion`,
`ChromeGroup`, `Presentation` — plus `Title`, `Icon`, `Precedence`, a free-form `Configuration` JSON
blob handed to the component, and scope (`User` / `Role` / `Global`) with status (`Active` /
`Pending` / `Inactive`).

### What a contribution can stand in for

Five kinds of claim, largest first. A contribution makes at most one of them — the database
enforces that, because replacing a section and one field inside it describes two different panels.

| Claim | Field on the row | What goes | Where the panel draws |
|---|---|---|---|
| A whole rail tab | `ReplacesSectionKey` = a rail key | every panel filed under that tab | as that tab |
| One field section | `ReplacesSectionKey` = a section key | that section's card | where the card was |
| Several field sections | `ReplacesSectionKeys` | those sections' cards | where the first of them was |
| Fields in one section | `ReplacesFieldNames` | those inputs | at the top or bottom of that section |
| A related grid | `RelatedEntityID` (+ `RelatedJoinField`) | the stock grid | as that grid's section |

A contribution can also be **placed inside a section without replacing anything**: `InSectionKey`
names the section and `SectionPosition` (`start` or `end`) says where in it. That counts as its
claim, so it cannot be combined with the five above.

`ReplacesSectionKeys` and `ReplacesFieldNames` are JSON arrays, the same shape as
`FormChromeRule.JoinFields`. Every section in a `ReplacesSectionKeys` list must be in one tab, and
every field in a `ReplacesFieldNames` list must belong to **one** section — the panel has one place
to draw. One section is always stored in `ReplacesSectionKey`, never as a one-item list.

A panel drawn inside a section — a field claim, or one placed with `InSectionKey` — is not the
`Slot` on the row's to position: the section decides. `<mj-collapsible-panel>` hosts two
`<mj-form-field-panel-slot>`s, one above its fields and one below, and each mounts the panels
whose `SectionPosition` matches it (a field claim with no position draws at the start). Claimed
fields stop rendering through `FormContext.claimedFieldNames`.

**You do not need to do anything to support this.** `CollectFormContributionRegistrations` merges
rows and class registrations into one list, and the form collapses that list once per resolve
(`ResolveFormContributionWinners`): one winner per `contributionKey`, which every slot host, the
composer and the rail then read. The higher rank wins — a compiled panel's ClassFactory `Priority`,
a row's `Precedence`. On a tie a compiled registration beats any row, and between two rows the
narrower audience wins: `User`, then `Role`, then `Global` (`FormContributionOutranks` in
`@memberjunction/core-entities`). Wildcard (`'*'`) registrations take part on every form, but a
wildcard's place claim is ignored: one that claims a grid, a section or a tab replaces nothing, and
one that names a section to draw in (`inSectionKey`) draws at its slot. A wildcard field claim
(`replacesFieldNames`) still acts on every form that draws the field.

`ResolveFormContributionWinners` remembers its answer per input array and entity name. The collector
returns the same array until something changes, so the form resolves once. A caller that builds its
own list must pass a new array after any change, and must not change the result it gets back.

What a panel author should know:

- **A compiled panel can make the same claims.** `replacesFieldNames` sits on the registration
  metadata beside `replacesSectionKey`, and the slot host passes the whole bag to the panel as
  `RegistrationMetadata`, which is what `BaseFormPanel.DisplayOrder` reads. Pass that getter as
  `[Order]` on your own `mj-collapsible-panel` or the form draws your panel last whatever slot it
  asked for.
- **Your panel can be replaced by a row**, but only deliberately — the apply flow asks the user
  before writing a row whose precedence exceeds an installed contribution's.
- **`presentation: 'bare'`** is how both sources declare a hero: a strip that draws no collapsible
  chrome and never becomes a rail item. Set it in your metadata bag rather than relying on the slot.
- **A row's panel is React**, hosted by `InteractiveFormPanelComponent`. It receives
  `FormPanelHostProps` — the record snapshot, entity metadata, permissions, and the contribution's
  own key / slot / title / configuration — and reports validation back through the same
  `BaseFormPanel.Validate()` contract your panel implements. A panel can change only the fields it
  claims in `replacesFieldNames`, and only while the form is in edit mode.
- **`Validate()` runs on Save.** `BaseFormComponent.SaveRecord()` awaits every mounted panel's
  `Validate()` (through `ValidateAsync()`) and refuses the save when one fails. `Validate()` may
  return a `ValidationResult` or a Promise of one. Synchronous callers read
  `LastKnownValidation()`, so a panel that validates asynchronously should override it to return
  its last result.
- **A `Validate()` that throws.** A compiled panel whose `Validate()` throws or rejects blocks the
  save, and the user sees an error toast. A React panel whose `Validate()` throws does not block
  it: the host logs the failure and shows it in the panel. A failure that React panel reported
  before through `ValidationChanged` still blocks the save. While the panel shows an error from
  `<mj-react-component>`, a later `Validate()` throw is logged and that error stays.

A generated panel may propose its placement in `formContribution` (slot, a section key, field names,
a related entity, or a section to sit inside). The apply dialog starts only from the proposed claims
it offers on the open form, through the same checks as the user's own choices: field names only when
the form was read and a section on it has fields, and section keys, a tab or a section to sit inside
only when the dialog lists them. It starts from its default for the rest, and the user confirms
placement. A claim the form cannot confirm is dropped, and the summary says so until the user picks
that claim. A field claim writes the chosen field names into `configuration.fields`; `fields` is
reserved for that use on a field panel.
`configuration.fields` is written only when a panel is placed as a field claim, and a later placement
change never removes it: a panel moved off its field claim keeps drawing the fields it was built for,
and the host shows those fields again unless the new placement replaces the section or tab that
draws them. The placement summary says so when the user moves such a panel.

Rows are authored by an OpenApp under `metadata/entity-form-contributions/`, or by an agent through
the `Create` / `Modify` / `Activate Form Contribution Version` actions. The actions change only the
caller's own `User` rows; a `Role` or `Global` row returns `FORBIDDEN`. See
[Forms Architecture §7c Scenario I](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md) for the full
picture.

**Turning rows off.** A kill switch turns every row off and leaves compiled panels as they are. It
has two settings:

- **Explorer:** set the instance configuration `Forms.MetadataContributions.Enabled` to `false`. The
  shell applies it after `InstanceConfigEngine.Config()` has finished and before any form opens, and
  no form draws a row. Another browser host calls
  `InteractiveFormsEngine.ApplyInstanceConfiguration(InstanceConfigEngine.Instance)` at the same
  point. In the browser it can only turn rows off, and when Instance Config fails to load, rows stay
  on.
- **Node hosts** (MJAPI, actions, the CLI): set `MJ_FORMS_METADATA_CONTRIBUTIONS=false`. The engine on
  that process then loads no row.

`Get Form Contributions For Entity` and `Get Form Composition For Entity` list no row when either
setting is off, and say so with `MetadataContributionsEnabled: false`. They read the instance
configuration from the cached `InstanceConfigEngine`, which is refreshed after a save in the same
process or by cross-server cache invalidation, so a change saved elsewhere counts once the cache has
it. The write actions still write rows while the switch is off. The
environment variable does not reach the browser, so with only the Node setting off, Explorer still
draws rows that those two actions leave out.

## Who sees a panel

A contribution row, and a full custom form (`MJ: Entity Form Overrides`), is for one of three
audiences: one user (`Scope='User'`), one role (`Role`), or everyone (`Global`). Compiled panels
have no row, so they are for everyone who has the package installed.

| Who | What they can do |
|---|---|
| Any user | Add and change their own panels through the actions, turn them on or off, and save them as drafts. Remove their own personal items. Hide anything shared with them, for themselves only. |
| Holder of `Manage Form Defaults` | Also publish an item to a role or to everyone, change a shared item's audience, and remove it. |
| Nobody | Write another user's personal item. |

The rule lives in `MJEntityFormContributionEntityServer` and `MJEntityFormOverrideEntityServer`
(`@memberjunction/core-entities-server`), so it holds for every write path: the drawer, Form
Builder, agent actions, `mj sync` and a direct `BaseEntity.Save()`. `UserCanManageFormDefaults`
(`@memberjunction/core-entities`) is the same check, for a UI that wants to hide what the server
would refuse. The grant goes to `Developer` and `Integration` by default. An `Owner` user counts as a holder.

**Publishing moves the row, it does not copy it.** The item that was live for that audience under
the same `contributionKey` is set `Inactive` in the same transaction, so the audience never sees
two. Turning a panel on in the drawer retires that live sibling the same way, and sets the panel's
component status to match the row. Keys are compared ignoring case, as the database's unique index
does. A row with no key has no sibling, so two keyless rows can both be live. Publishing a draft, a panel that is off or a set-aside form turns
it on, and the chooser says so first. A full form has no key, so the form that was live for that
audience is set aside instead. A set-aside (`Inactive`) shared form is retracted: nobody is offered
it and it does not render. A set-aside personal form stays in its owner's form picker.

**Component rights.** A panel's component is an `MJ: Components` row. The stock `UI` role can create
and update that entity, but not delete from it. A form or panel draws the component its row points
at, and a form's spec can also load a component by name, so the server checks three things (the
rules are in `@memberjunction/core-entities`; the server side is `FormComponentGuard` in
`@memberjunction/core-entities-server`). Without `Manage Form Defaults`, each check asks whether the
component is the caller's own (`IsCallersOwnComponent`): used by at least one row and only by the
caller's own personal rows, or used by no row and created by the caller. The creator is read from
the component's `Create` record in `MJ: Record Changes` with `Source` 'Internal'; `MJ: Components`
tracks record changes, so the platform writes one with every component it creates, and
`MJRecordChangeEntityServer` refuses a caller who tries to create an Internal `Create` record change
through the API. A component created by clone or restore carries a `Clone` or `Restore` record
change instead, so it is not its creator's own until a row of theirs uses it.

1. **Changing a component** (`ComponentWriteRefusal`, in `MJComponentEntityServer`). Without
   `Manage Form Defaults`, every update, whatever columns it changes, and every delete is checked.
   With the grant, only a delete or a change to the component's specification, status, name,
   namespace or type is checked. A refusal for a caller without the grant says whether the grant
   would allow the change.

   | The component | Without `Manage Form Defaults` (any update, or a delete) | With it (a delete, or a change to those five columns) |
   |---|---|---|
   | Used only by the caller's own personal rows | Allowed | Allowed |
   | Used by a `Role` or `Global` row | Refused | Allowed |
   | Used by another user's personal row | Refused | Refused |
   | Used by no row, created by the caller | Allowed | Allowed |
   | Used by no row, created by someone else | Refused | Allowed |

2. **Pointing a row at a component** (`FormRowComponentRefusal`, in both form entity subclasses), on
   create or when `ComponentID` changes: without the grant, the component must be the caller's own.
   With the grant, a component another user's personal row uses is still refused (for everyone, an
   Owner included); anything else is allowed. The caller's own rows may share a component.
3. **A component's name** (`ComponentNameCollisionRefusal`): without the grant, a created or renamed
   component may not take a name another component already has, unless every such component is
   the caller's own. Names are compared trimmed and lower-cased, as the server's
   `ComponentMetadataEngineServer.FindComponent` compares them, in any namespace. A holder is not
   restricted.

A create is otherwise not checked, nor is a holder's change to any other column, nor a write with
no caller (a trusted server context). The rows, the stored columns and the creator are read in one
batch as the caller, and the changed columns come from the stored row, not from the values as
loaded; when a read fails, the write is refused. The `Create` record change is written in the same batch as the
component insert, so a row saved after it in the same transaction sees it. So any user can author
their own panel through the actions (a new component, then their own row pointing at it, then
changes to it) and turn it on, off or to a draft in the drawer.

On identity, permission and form-metadata entities (`RESTRICTED_FORM_ENTITIES` in
`@memberjunction/core-entities`, 11 entities) only `User` rows and forms render, whatever wrote the
row.

**Hiding is per user and changes no row.** `panel-hides.ts` keeps the hidden keys in the
`mj.formPanels.hidden.<entity>` user setting, and the collector drops those registrations after
the merge. The full custom form a user picks is kept the same way, in `mj.formVariant.<entity>`. A compiled panel is hidden by its `contributionKey`, or by `class:<Registration.Key>`
when it has none, so give a compiled panel a key if its users may want to hide it. A user's own
personal row is never dropped by a hide; they switch it off instead.

The "Manage this form" drawer (`panel-manager/`) shows all of this in one list, grouped as
yours, shared with you, hidden and fixed.

## Counts and empty sections (`showCount` / `whenEmpty` / `count`)

When a saved record opens, the container fetches the row count of every related section **and**
the tag / attachment / version toolbar badges in **one** `RunViews` call of `count_only` views
(the database provider runs an all-`count_only` batch as a single `UNION ALL`). Badges appear
before any grid loads.

A contribution opts in with three optional keys:

```typescript
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:People:orders',
    metadata: {
        entity: 'MJ_BizApps_Common: People',
        slot: 'after-related',
        contributionKey: 'orders',
        whenEmpty: 'more',              // 'show' (default) | 'hide' | 'more'
        showCount: true,                // default true — badge the count
        count: {                        // omit to derive from relatedEntity / relatedJoinField
            entity: 'MJ_BizApps_Orders: Order Headers',
            joinFields: ['BillToPersonID', 'ShipToPersonID'],   // ORed
        },
    },
})
```

- `whenEmpty: 'hide'` — hidden while it has 0 rows. `'more'` — moved into the More folder while
  empty, back to its normal place once it has rows. The "show empty fields" toolbar toggle reveals
  everything.
- A section that had rows this session is never hidden when it empties (no yank), and the open
  rail item is never hidden.
- If the panel's `<mj-collapsible-panel SectionKey>` differs from its `contributionKey` (or the
  key derived from `relatedEntity`), set `sectionKey` so counts land on the section the user sees.
- A contribution with no count source (`count: false`, no `relatedEntity`) can still report
  `this.FormComponent.SetSectionRowCount(sectionKey, n)` after it loads; hide/more then applies.
- Relationships use the same verbs in `EntityRelationship.Configuration.UI` (`whenEmpty`,
  `showCount`); an entity-wide default lives in `Entity.Configuration.UI.Form`
  (`RelatedWhenEmpty`, `ShowRelatedCounts`).

## Implementation files

| File                                                                                  | Role                                                          |
|---------------------------------------------------------------------------------------|---------------------------------------------------------------|
| `base-form-panel.ts`                                                                  | `BaseFormPanel` abstract class + `FormPanelSlot` type union + `FormPanelRegistrationMetadata` shape. |
| `form-contribution.ts`                                                                | Pure composer: last-wins, related claims, baked-section keys. |
| `form-contributions.component.ts`                                                     | `<mj-form-contributions>` — mounts stock grids the template did not bake. |
| `related-entity-grid-panel.component.ts`                                              | Stock related-entity grid (mirrors the CodeGen EntityDataGrid template). |
| `form-panel-slot.component.ts`                                                        | `<mj-form-panel-slot>` host — discovery, sorting, dynamic mount, fallback resolution. |
| `form-slot-coordinator.service.ts`                                                    | `FormSlotCoordinator` — per-container registry of which slots are physically present. `FORM_SLOT_CHAIN` constant. |
| `record-form-container.component.{ts,html}`                                           | Provides `FormSlotCoordinator` + fill-in contributions + the always-on `after-everything` slot. |
| `base-contribution-panel.ts`                                                          | `BaseContributionPanel` (internal) — the chrome a panel drawing one contribution reads (title, icon, bare strip, variant). |
| `../interactive-form/interactive-form-panel.component.ts`                             | Hosts a metadata row's React panel. |
| `../apply/form-placement.ts`, `form-placement-text.ts`, `form-placement-order.ts`      | The placement dialog's rules: the state and decision, the sentences that describe it, and the order within one position. |
| `../panel-manager/`                                                                   | The "Manage this form" drawer, its inventory and the service it writes through. |
| `packages/CodeGenLib/src/Angular/angular-codegen.ts` (`innerCollapsiblePanelsHTML`)   | Emits the four primary slot markers into every generated form template. Related grids stay baked. |
