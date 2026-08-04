# Using base-forms components **outside** the forms architecture

The components in `@memberjunction/ng-base-forms` are normally assembled by the forms
stack (`MjEntityFormHostComponent` → presentation shells → generated/custom forms). But
**they are also general-purpose, data-bindable database controls** — you can drop most of
them into any Angular component, hand them a `BaseEntity` (or a `RunViewParams`), and wire
their inputs/outputs yourself. No form host, no CodeGen, no Explorer required.

This document shows how. For the *forms* architecture itself (tabs/dialogs/slide-ins from
one set of forms), see [/guides/FORMS_ARCHITECTURE_GUIDE.md](../../../guides/FORMS_ARCHITECTURE_GUIDE.md).

---

## 1. The one prerequisite: import `BaseFormsModule`

These components are **NgModule-declared** (not standalone). To use any of them, import
`BaseFormsModule` into your feature module (or into a standalone component's `imports`):

```typescript
import { NgModule } from '@angular/core';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';

@NgModule({
  imports: [BaseFormsModule, /* ... */],
  declarations: [MyWidgetComponent],
})
export class MyFeatureModule {}
```

Importing the module brings the components **and** their template dependencies
(Markdown, Code Editor, Record Changes, etc.) — you don't wire those up yourself.

> **Why not standalone?** By design. The palette ships as a module; you import once and
> get everything. (If you only want a couple of controls and care about bundle size, the
> module still tree-shakes unused *components* at build time.)

---

## 2. The binding contract

Almost everything keys off a **`BaseEntity`**. A `BaseEntity` instance carries its own
`EntityInfo` (field metadata, relationships, validation, value lists), so a control given
a record can render and edit *any* of its fields with zero extra configuration.

Get a record the normal MJ way — never `new SomeEntity()`:

```typescript
import { Metadata, RunView } from '@memberjunction/core';

const md = new Metadata();

// New, empty record:
const user = await md.GetEntityObject<UserEntity>('Users');

// Existing record:
const existing = await md.GetEntityObject<UserEntity>('Users');
await existing.Load('E1A2…');     // primary key

// Or a set, for grids:
const rv = new RunView();
const result = await rv.RunView<UserEntity>({ EntityName: 'Users', ResultType: 'entity_object' });
```

**Multi-provider:** every control extends `BaseAngularComponent`, so pass `[Provider]` if
your component tree talks to a non-default MJ server. Omit it and it uses the global
provider (the common case). See [packages/Angular/CLAUDE.md](../../CLAUDE.md) §Multi-Provider.

---

## 3. `<mj-form-field>` — the single-field control (the workhorse)

Renders/edits **one field** of a record. Read-only mode shows a clean value (with
email/URL/FK hyperlinks); edit mode shows the right input for the field type — text,
number, date, checkbox, custom select, long-text code editor, Markdown/HTML, and a rich
**foreign-key autocomplete** (multi-column grid, sortable headers, per-field search
scope, show/hide columns, all persisted per user).

```html
<!-- Edit a single field, react to changes -->
<mj-form-field
    [Record]="user"
    FieldName="Email"
    [EditMode]="true"
    LinkType="Email"
    (ValueChange)="onFieldChanged($event)"
    (Navigate)="onNavigate($event)">
</mj-form-field>

<!-- A foreign-key field: gives you the full search/grid dropdown automatically -->
<mj-form-field [Record]="category" FieldName="ParentID" [EditMode]="true"></mj-form-field>

<!-- Read-only display (no label, just the value) -->
<mj-form-field [Record]="user" FieldName="CreatedAt" [ShowLabel]="false"></mj-form-field>
```

Key inputs: `[Record]` (required), `FieldName`, `[EditMode]`, `Type`
(`textbox|textarea|number|datepicker|checkbox|select|autocomplete|code`),
`LinkType` (`Email|URL|Record|None`), `[ShowLabel]`, `DisplayNameOverride`,
`[PossibleValuesOverride]`, FK tuning (`[FKHighlightMatches]`, `[FKDropdownMaxWidth]`),
`[Provider]`. Outputs: `(ValueChange)`, `(Navigate)`.

> The control infers the input type, possible-values list, FK relationship, and validation
> from `Record.EntityInfo` — you usually only set `[Record]` + `FieldName` + `[EditMode]`.

---

## 4. `<mj-entity-form-host>` — a whole record's form, headless

Renders the **entire** generated/custom form for a record (all sections + fields), with no
Explorer/Router coupling. Drive it by `EntityName` + `PrimaryKey`, or hand it a `Record`:

```html
<!-- Load by key -->
<mj-entity-form-host
    [EntityName]="'Users'"
    [PrimaryKey]="userKey"
    [EditMode]="true"
    [Config]="formConfig">
</mj-entity-form-host>

<!-- Or bind an already-loaded record -->
<mj-entity-form-host [Record]="user" [EditMode]="false"></mj-entity-form-host>
```

`[Config]` is an `EntityFormConfig` — per-instance control of toolbar, related-entity
sections, width, in-form navigation — applied **without** regenerating the form.
`[SectionName]` renders just one section instead of the whole form.

---

## 5. `<mj-form-dialog>` / `<mj-form-slide-in>` / `<mj-form-window>` — a record in an overlay

Open any record's form as a modal dialog, a slide-in drawer, or a floating window — purely
declaratively, no form host code:

```html
<mj-form-dialog
    [EntityName]="'Users'"
    [RecordID]="selectedUserId"
    [(Visible)]="dialogVisible"
    [Width]="760">
</mj-form-dialog>

<mj-form-slide-in
    [EntityName]="'Users'"
    [RecordID]="selectedUserId"
    [(Visible)]="slideInVisible"
    [WidthPx]="720"
    [Resizable]="true">
</mj-form-slide-in>
```

Imperative equivalent — `MJFormPresenterService.Open({ EntityName, RecordId, Presentation: 'dialog' | 'slide-in' })`.

---

## 6. `<mj-explorer-entity-data-grid>` — a bound data grid

A full AG-Grid bound to a `RunViewParams` — sorting, paging, selection, optional toolbar —
with zero Explorer dependency:

```html
<mj-explorer-entity-data-grid
    [Params]="{ EntityName: 'Users', ExtraFilter: 'IsActive=1', OrderBy: 'Name' }"
    [ShowToolbar]="true"
    [SelectionMode]="'multiple'"
    [Height]="'fit-content'"
    [NavigateOnDoubleClick]="false">
</mj-explorer-entity-data-grid>
```

Key inputs: `[Params]` (a `RunViewParams`), `[AllowLoad]`, `[ShowToolbar]`,
`[ToolbarConfig]`, `[SelectionMode]` (`single|multiple|none`), `[Height]`,
`[DeferLoadUntilVisible]`, `[NavigateOnDoubleClick]`.

---

## 7. `<mj-collapsible-panel>` — a generic collapsible section

The same panel the forms use for sections — usable on its own for any collapsible content:

```html
<mj-collapsible-panel
    SectionKey="advanced"
    SectionName="Advanced Settings"
    Icon="fa-solid fa-sliders"
    [DefaultExpanded]="false"
    [BadgeCount]="3">
  <!-- projected content -->
  <mj-form-field [Record]="user" FieldName="Notes" [EditMode]="true"></mj-form-field>
</mj-collapsible-panel>
```

---

## 8. Putting it together — a minimal bespoke editor

```typescript
@Component({
  selector: 'my-quick-user-editor',
  template: `
    @if (user) {
      <mj-collapsible-panel SectionName="User" Icon="fa-solid fa-user" [DefaultExpanded]="true">
        <mj-form-field [Record]="user" FieldName="Name"  [EditMode]="true"></mj-form-field>
        <mj-form-field [Record]="user" FieldName="Email" [EditMode]="true" LinkType="Email"></mj-form-field>
        <mj-form-field [Record]="user" FieldName="Type"  [EditMode]="true"></mj-form-field>
      </mj-collapsible-panel>
      <button (click)="save()">Save</button>
    }
  `,
})
export class MyQuickUserEditor implements OnInit {
  user: UserEntity | null = null;

  async ngOnInit() {
    const md = new Metadata();
    this.user = await md.GetEntityObject<UserEntity>('Users');
    await this.user.Load('…');
  }

  async save() {
    const ok = await this.user!.Save();
    if (!ok) console.error(this.user!.LatestResult?.CompleteMessage);
  }
}
```

That's three live, validated, metadata-driven field editors with no form definition,
no CodeGen, and no Explorer — just `BaseFormsModule` + a `BaseEntity`.

---

## 9. Practical notes & limits

- **You own persistence.** These controls mutate the `BaseEntity` you pass; call
  `record.Save()` yourself (and check the boolean return + `LatestResult.CompleteMessage`).
- **Styling is form-tuned.** `<mj-form-field>` uses a 2-column label/value grid
  (`:host { display: contents }`). It drops into a form layout cleanly; in a freeform
  layout you may want to wrap it or override the grid.
- **`FormContext` is optional.** It only adds form-level niceties (validation surfacing,
  section search highlight, link-enable). Omit it for standalone use.
- **Design tokens.** All visuals use the shared `--mj-*` semantic tokens, so these controls
  automatically match light/dark and any white-label theme.
- **The module pulls dependencies.** Importing `BaseFormsModule` brings Markdown, Code
  Editor, Record Changes, etc. That's the trade for "import once, get everything."
