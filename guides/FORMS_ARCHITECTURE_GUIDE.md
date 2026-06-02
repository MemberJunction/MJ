# MemberJunction Forms Architecture Guide

How MJ renders and edits entity records — as full-page tabs, modal dialogs, or
slide-in panels — from **one** set of forms, with **no per-surface code** and
**no regeneration**.

> **TL;DR** — Every entity has a form (generated, custom, or interactive). The
> Generic **`MjEntityFormHostComponent`** turns "an entity + a record" into a
> live, bound form on any surface. Wrap it in `<mj-form-dialog>` /
> `<mj-form-slide-in>`, or open it imperatively with `MJFormPresenterService`.
> Control toolbar / sections / width / navigation per-instance via
> **`EntityFormConfig`** — which the form container reads through the form
> reference, so generated templates never change.

---

## 1. The big picture

```
┌─ Layer 4  MJFormPresenterService.open({...}) → MJFormRef      (imperative, 1 call)
│           <mj-form-dialog> / <mj-form-slide-in>               (declarative)
├─ Layer 3  Presentation shells — dialog / slide-in chrome
│           (own the title + Save/Cancel; bubble events; proxy inputs)
├─ Layer 2  MjEntityFormHostComponent  (headless, presentation-agnostic)
│           resolve form → load record → create component →
│           bind record/EditMode/Config/variants → re-emit events → teardown
└─ Layer 1  BaseFormComponent + MjRecordFormContainerComponent  (the form itself)
            + FormResolverService (class / custom / interactive + variants)
```

Every layer lives in **`@memberjunction/ng-base-forms`** (package dir
`packages/Angular/Generic/base-forms`). None of it imports Angular Router or any
`@memberjunction/ng-explorer-*` package — it is reusable in any MJ Angular app.
Routing is never performed inside these components; they **emit events** and the
host application (e.g. MJ Explorer) decides what to do.

---

## 2. The three kinds of forms (and how they coexist)

When you ask to render entity `X`, `FormResolverService.ResolveFormForEntity()`
picks one of three, in priority order:

| Kind | What it is | How it's chosen |
|------|------------|-----------------|
| **interactive** | A runtime `EntityFormOverride` (a Component authored in Form Builder / by an AI agent) | A User/Role/Global-scoped, **Active** override exists for the entity |
| **class** | The CodeGen-generated form, or a custom `*Extended` form, registered via `@RegisterClass(BaseFormComponent, 'X')` | No active override — fall back to the registered class |
| **none** | No form is registered | Neither of the above — the host shows an error |

**Variants.** When multiple overrides apply, the resolver returns the whole list
so the toolbar's variant picker can offer alternates. The user's choice persists
per-entity via `UserInfoEngine` (`mj.formVariant.<entity>`), so it follows them
across browsers and devices. Picking "Default form" stores an explicit sentinel
so the CodeGen form stays reachable. **All of this works identically on tabs,
dialogs, and slide-ins** — the resolver is Generic and the host always uses it.

The overrides are cached in memory by `InteractiveFormsEngine` (in
`@memberjunction/core-entities`) with event-driven invalidation, so resolution is
a sub-millisecond in-memory filter, not a per-open DB round-trip.

---

## 3. Layer 1 — the form and its container

A generated form is a `BaseFormComponent` subclass whose template wraps
everything in **`<mj-record-form-container [Record]="record" [FormComponent]="this">`**.
The container owns the toolbar, the History / Tags / Lists drawers, the variant
picker, section search / expand-all / width-toggle, and the panel slots. Field
sections and related-entity grids are `<mj-collapsible-panel>`s.

You rarely touch Layer 1 directly. Two things you should know:

- **Extending a form without replacing it:** register a `BaseFormPanel` against a
  slot — see [base-forms/PANELS.md](../packages/Angular/Generic/base-forms/PANELS.md).
- **Replacing a form entirely:** a custom `*Extended` class — see the "Extending
  Entity Forms" section of [packages/Angular/CLAUDE.md](../packages/Angular/CLAUDE.md).

---

## 4. Layer 2 — `MjEntityFormHostComponent`

The keystone. Give it an entity + a record (or a key to load), and it does the
whole dance: resolve → load → dynamically create the form → bind it → wire its
outputs → tear down on destroy. It renders the form into an internal anchor and
shows a loading state until the record is ready (and an error state on failure).

```html
<mj-entity-form-host
  [EntityName]="'Users'"
  [PrimaryKey]="pk"          <!-- omit/empty → new record -->
  [Record]="preloaded"        <!-- OR bind an already-loaded BaseEntity -->
  [NewRecordValues]="defaults"
  [EditMode]="null"           <!-- null = new→edit, existing→read -->
  [Config]="myConfig"
  [Provider]="Provider"
  (Saved)="onSaved($event)"
  (Navigate)="onNavigate($event)"
  (Notification)="onNotify($event)"
  (RecordReady)="onReady($event)"
  (Dismissed)="close()"
  (LoadComplete)="unblock()"
  (LoadError)="showError($event)"
  (FormCreated)="grabInstance($event)">
</mj-entity-form-host>
```

It exposes `Save()`, `Cancel()`, `Dirty`, and `form` (the live instance) so chrome
can drive it. **It never routes** — `Navigate` is emitted for the consumer to
handle.

**MJ Explorer's `SingleRecordComponent` is now just a thin wrapper** around this
host: it maps `Navigate` → `NavigationService`, `Notification` → `SharedService`,
and record loads → `RecentAccessService`. That's the only Explorer-specific glue;
all mechanics are Generic.

---

## 5. Layers 3 + 4 — dialogs, slide-ins, and the presenter

### Declarative

```html
<!-- Modal dialog -->
<mj-form-dialog [EntityName]="'MJ: Query Categories'"
  [(Visible)]="show" Title="New Category" (Saved)="onCreated($event)"></mj-form-dialog>

<!-- Right-edge slide-in (resizable) -->
<mj-form-slide-in [EntityName]="'MJ: Credentials'" [RecordID]="id"
  [(Visible)]="open" (Saved)="refresh()"></mj-form-slide-in>

<!-- Bind a record you already have -->
<mj-form-dialog [Record]="myEntity" [(Visible)]="show"></mj-form-dialog>

<!-- Floating, non-modal, draggable window (compare/reference while editing) -->
<mj-form-window [EntityName]="'Accounts'" [RecordID]="id" [(Visible)]="show"></mj-form-window>
```

Three shells ship: **`<mj-form-dialog>`** (modal), **`<mj-form-slide-in>`**
(right-edge, resizable, width persisted per-entity), and **`<mj-form-window>`**
(floating, non-modal, draggable + resizable — good for keeping a record open
while you work elsewhere). All three share the same inputs/outputs (they extend
`BaseFormOverlay`) and the same `MJFormPresenterService` imperative path.

Both shells are **standalone** components — import them directly:
`import { MjFormDialogComponent, MjFormSlideInComponent } from '@memberjunction/ng-base-forms';`
and add to your component/module `imports`.

### Imperative — one call from anywhere

```typescript
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';

constructor(private forms: MJFormPresenterService) {}

async edit(id: string) {
  const ref = this.forms.open({
    entityName: 'MJ: AI Agents',
    recordId: id,                     // omit for a new record
    presentation: 'slide-in',         // 'dialog' | 'slide-in' | 'window'
    config: { showRelatedEntities: false },
    provider: this.ProviderToUse,     // multi-provider apps
  });
  const saved = await ref.afterSaved();   // BaseEntity | null
  if (saved) { /* refresh */ }
}
```

`MJFormRef` gives you `afterSaved()`, `afterClosed()`, `close()`, and `form`. The
presenter mounts the shell on `document.body` and tears it down after close — no
template wiring, no module registration.

---

## 6. `EntityFormConfig` — per-instance control (no regeneration)

The single knob object. Set it on the host / shell / presenter; the
`MjRecordFormContainerComponent` reads it back **through the form reference**, so
it takes effect on every existing generated form **without re-running CodeGen**.

```typescript
export interface EntityFormConfig {
  toolbar?: Partial<FormToolbarConfig> | null; // null = no toolbar (dialog/slide-in default)
  showRelatedEntities?: boolean;               // hide related-entity grids
  collapsibleSections?: boolean;               // false = sections locked open, no chevron
  hiddenSectionKeys?: string[];                // hide specific sections
  visibleSectionKeys?: string[];               // allow-list (wins over hidden)
  widthMode?: 'centered' | 'full-width';
  enableRecordLinks?: boolean;                 // false = in-form links inert (modal default)
  startInEditMode?: boolean;
}
```

Presets: **`TAB_FORM_CONFIG`** (full toolbar, everything on), **`DIALOG_FORM_CONFIG`**
(no toolbar, related hidden, links inert), **`SLIDEIN_FORM_CONFIG`** (dialog + full-width).
The dialog/slide-in shells default to their presets; spread and override:

```typescript
config: { ...DIALOG_FORM_CONFIG, collapsibleSections: false, toolbar: { ShowDeleteButton: false } }
```

### Why no regeneration?

Generated templates hardcode `<mj-record-form-container [FormComponent]="this">`.
The container already derives state from that `this` reference (width mode,
variants, dirty state…). Config rides the same channel: the host sets
`form.Config`; the container reads toolbar config from it
(`EffectiveToolbarConfig` / `EffectiveShowToolbar`), and section-visibility +
collapsibility + link rules flow onto `form.formContext`, which **every** panel
receives — including slot-injected `BaseFormPanel`s — so they apply uniformly.
The pure resolution helpers (`resolveFormShowToolbar`, `resolveFormToolbarConfig`,
`isFormSectionHidden` in `entity-form-config.ts`) are unit-tested.

---

## 7. Custom sections — injected into a form, or rendered standalone

There are two complementary ways to work with **sections** (units smaller than a
whole form):

### 7a. Inject a custom section into a generated form (`BaseFormPanel` slot)

Add a panel to an existing generated form **without replacing it** — register a
`BaseFormPanel` against a slot and it mounts at runtime. The canonical real
example is **`MJ: Content Sources`**, which has two injected sections in
`packages/Angular/Explorer/core-entity-forms/src/lib/panels/content-sources/`:

```typescript
// website-crawler-settings.panel.ts — a typed-config section injected into the
// generated MJ: Content Sources form, self-gating on ContentSourceType.
@RegisterClassEx(BaseFormPanel, {
  key: 'content-sources:website-crawler-settings',
  skipNullKeyWarning: true,
  metadata: { entity: 'MJ: Content Sources', slot: 'after-fields', sortKey: 80 },
})
@Component({ standalone: false, selector: 'mj-website-crawler-settings-panel', templateUrl: './website-crawler-settings.panel.html' })
export class WebsiteCrawlerSettingsPanel extends BaseFormPanel<MJContentSourceEntity> {
  public get IsWebsiteSourceType(): boolean { /* gate in template */ }
}
```

It renders alongside the broadly-applicable `TagPipelineConfigurationPanel`
(`sortKey: 100`) in the same `after-fields` slot — higher sortKey first. Neither
required touching the generated form. Full authoring contract:
[base-forms/PANELS.md](../packages/Angular/Generic/base-forms/PANELS.md).

> **These injected sections are controllable from the stack.** Because every
> panel — generated, custom, OR slot-injected — receives `FormContext`, the
> `EntityFormConfig` visibility rules (`hiddenSectionKeys` / `visibleSectionKeys`
> / `showRelatedEntities`) apply uniformly. So a dialog can open the Content
> Sources form and hide the crawler section with
> `config: { hiddenSectionKeys: ['websiteCrawlerSettings'] }` — no per-panel code.

### 7b. Render a single section standalone (`SectionName`)

To render just **one** registered `BaseFormSectionComponent` (`@RegisterClass(BaseFormSectionComponent, '<Entity>.<Section>')`) — e.g. a compact quick-edit — pass `SectionName`:

```html
<mj-form-dialog [EntityName]="'My Entity'" [RecordID]="id"
  SectionName="QuickEdit" Title="Quick edit" [(Visible)]="show"></mj-form-dialog>
```

```typescript
this.forms.open({ entityName: 'My Entity', recordId: id, sectionName: 'QuickEdit', presentation: 'slide-in' });
```

Section mode bypasses the full-form resolver/toolbar/container — the section
renders its own fields and the host saves the record directly. (This is the
capability the legacy `EntityFormDialogComponent` exposed; the new host now
supports it on every surface.)

---

## 8. Navigation from inside a dialog / slide-in

In a modal context, in-form record links are **inert by default**
(`enableRecordLinks: false`) so clicking one doesn't teleport the user out of the
overlay. **Generic code never routes** — only Explorer-layer code touches
`NavigationService`.

To make links live and decide what happens, set `enableRecordLinks: true` and
handle the bubbled `Navigate` event yourself — e.g. open the target in a **nested
overlay**:

```typescript
const ref = this.forms.open({ entityName: 'Accounts', recordId: id, presentation: 'dialog' });
// ...but with config.enableRecordLinks = true, or via the declarative shell:
```

```html
<mj-form-dialog [EntityName]="'Accounts'" [RecordID]="id" [(Visible)]="show"
  [Config]="{ enableRecordLinks: true }"
  (Navigate)="onNavigate($event)"></mj-form-dialog>
```

```typescript
onNavigate(e: FormNavigationEvent) {
  if (e.Kind === 'record') {
    // open the related record in a nested dialog (overlay stays open)
    this.forms.open({ entityName: e.EntityName, primaryKey: e.PrimaryKey, presentation: 'dialog' });
  }
  // or, in an Explorer-layer component, route via NavigationService instead
}
```

The host never decides — it emits, you choose (nested overlay, route, ignore).
That keeps the Generic stack routing-free and lets each consumer pick the UX.

---

## 9. Decision guide

| You want to… | Use |
|--------------|-----|
| Show/edit a record in the main tab area | `SingleRecordComponent` (Explorer) — already host-backed |
| Quick-create/edit a record in a modal | `<mj-form-dialog>` or `forms.open({presentation:'dialog'})` |
| Edit a record in a side panel without leaving the page | `<mj-form-slide-in>` or `forms.open({presentation:'slide-in'})` |
| Keep a record open (non-modal) while working elsewhere | `<mj-form-window>` or `forms.open({presentation:'window'})` |
| Edit just one section of a record in an overlay | `SectionName` on any shell / `forms.open({sectionName})` |
| Add a custom section into a generated form | `BaseFormPanel` + slot — [PANELS.md](../packages/Angular/Generic/base-forms/PANELS.md) (Content Sources is the example) |
| Replace a form's whole layout | Custom `*Extended` form — [Angular/CLAUDE.md](../packages/Angular/CLAUDE.md) |
| Build a brand-new bespoke editor dialog | **Stop** — first check if a `<mj-form-dialog>` covers it |

---

## 10. Reference

- **Package:** `@memberjunction/ng-base-forms` (`packages/Angular/Generic/base-forms`)
- **Host:** `host/entity-form-host.component.ts`
- **Shells + presenter:** `overlays/*`
- **Config:** `types/entity-form-config.ts`
- **Resolver:** `resolver/form-resolver.service.ts`
- **Container:** `container/record-form-container.component.ts`
- **Panels:** [PANELS.md](../packages/Angular/Generic/base-forms/PANELS.md)
- **Custom forms + toolbar pattern:** [packages/Angular/CLAUDE.md](../packages/Angular/CLAUDE.md)
- **Slide-in primitive:** `MjSlidePanelComponent` in `@memberjunction/ng-ui-components`
