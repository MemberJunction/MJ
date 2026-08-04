# Base Forms as Dialogs & Slide-Ins — Implementation Plan

**Branch:** `claude/base-forms-dialog-slideins-fRDmJ`
**Status:** Plan (pre-build)
**Author:** Architecture study + design, 2026-06-02

---

## 1. Vision

Make **any** MemberJunction entity form — generated *or* custom *or* interactive-override — instantly usable as a **full-page tab**, a **modal dialog**, or a **slide-in panel**, with:

- **The least possible consumer code** (one imperative call, or one declarative tag).
- **World-class UX** consistent across all three surfaces (validation display, dark-mode tokens, history/tags, variants).
- **Zero regeneration** of CodeGen'd forms.
- **Per-instance control** over toolbar, related-entity sections, collapsibility, section reorder, width, and in-form navigation.

This eliminates a large body of bespoke dialog/slide-in code (~19K lines of "pure entity editors", ~35K lines across all entity-adjacent dialogs — see §9) and replaces it with one consistent capability.

### Why this is mostly extraction, not invention

`@memberjunction/ng-base-forms` is already a Generic, Explorer-free, event-driven package:

- `BaseFormComponent` binds to `record: BaseEntity` and emits `Navigate`, `Notification`, `RecordSaved`, `RecordDeleted`, `RecordSaveFailed`, `ValidationFailed`, `RecordReady`; exposes `SaveRecord()`, `CancelEdit()`, `Validate()`.
- `MjRecordFormContainerComponent` already has an explicit **two-mode** design (FormComponent-driven *or* standalone) and bridges *all* state through the `FormComponent` reference via `Effective*` getters.
- `FormToolbarConfig` already toggles every toolbar element (incl. `AllowSectionReorder`, `ShowSectionManager`, `ShowSectionControls`).
- The panel-slot system (`BaseFormPanel` + `<mj-form-panel-slot>`) extends forms without touching generated code.

The missing pieces: (a) the resolve→load→create→wire→cleanup **host** logic currently lives only in Explorer's `SingleRecordComponent`; (b) a couple of config knobs; (c) presentation shells + an imperative service.

---

## 2. Confirmed Decisions

| # | Decision |
|---|---|
| D1 | **No routing in Generic.** Host emits `Navigate`; the consumer decides. Only `Angular/Explorer/**` touches `NavigationService`. Dialog/slide-in default `Config.EnableRecordLinks = false` (links inert) to avoid teleporting out of a modal; prop available to flip on. |
| D2 | **Interactive forms are first-class on all surfaces.** `InteractiveFormsEngine` lives in `@memberjunction/core-entities`; `FormResolverService` is Explorer-coupling-free and **moves into `base-forms`**. No resolver abstraction. |
| D3 | **Slide-in primitive relocates** from `@memberjunction/ng-versions` → `@memberjunction/ng-ui-components`; `versions` refactored to consume it. (Use Matt's generic slide-in instead if/when located.) |
| D4 | **No regeneration** of CodeGen forms — config is bridged through the `FormComponent` reference. Holds permanently for this feature. |
| D5 | **`Config` property** (not `FormConfig`) on `BaseFormComponent`, typed `EntityFormConfig`, exported from `base-forms`. |
| D6 | **Dialog & slide-in hide the toolbar by default**; full-page tab keeps it. Toolbar presence is a `Config` knob. |
| D7 | **Imperative (`MJFormPresenterService.Open()`) + declarative (`<mj-form-dialog>` / `<mj-form-slide-in>`)** consumer APIs both ship. |
| D8 | **D1 default = inert links** in dialog/slide-in (`Config.EnableRecordLinks=false`); prop flips them live. |
| D9 | **Shells + presenter service live IN `base-forms`** (not a separate package); `base-forms` adds a dependency on `@memberjunction/ng-ui-components` for dialog/window/slide-in chrome. |
| D10 | **Relocate `versions/slide-panel` → `ui-components`** now (Matt's generic slide-in not present on this branch). |
| D11 | **Phase 1 test candidates:** dialog = MJ: Query Categories (`query-category-dialog`); slide-in = MJ: Credentials (`credential-dialog`). |

---

## 3. Layered Architecture

```
┌─ Layer 4 (Generic):  MJFormPresenterService.Open({...}) → MJFormRef     (imperative)
│                      <mj-form-dialog> / <mj-form-slide-in>              (declarative)
├─ Layer 3 (Generic):  Presentation shells — dialog / slide-in / window
│                      own chrome + footer Save/Cancel + title; bubble events
├─ Layer 2 (Generic):  ★ MjEntityFormHostComponent ★  (NEW, headless)
│                      resolve (FormResolverService) → load record →
│                      createComponent → set record/EditMode/Config →
│                      re-emit form events → teardown.  Renders into mjContainer.
├─ Layer 1 (Generic):  BaseFormComponent + MjRecordFormContainerComponent (EXISTS)
│                      + FormResolverService (MOVED DOWN from Explorer)
└─ Explorer:           SingleRecordComponent = thin wrapper around Layer 2/3
                       (maps Navigate→NavigationService, Notification→SharedService)
```

All of Layers 1–4 are in `packages/Angular/Generic/**`, import no `Explorer` package, and perform zero routing.

---

## 4. The `EntityFormConfig` Interface (new)

Lives in `packages/Angular/Generic/base-forms/src/lib/types/entity-form-config.ts`, exported via `public-api.ts`. Every field optional; omitted fields fall back to the surface preset.

```typescript
import { FormToolbarConfig } from './toolbar-config';
import { FormWidthMode } from './form-types';

/**
 * Per-instance configuration for an MJ entity form, independent of how it is
 * presented (full-page tab, modal dialog, or slide-in panel).
 *
 * Set on `BaseFormComponent.Config`; the record-form container and collapsible
 * panels read it through the FormComponent reference, so it takes effect
 * WITHOUT regenerating the CodeGen'd form template.
 *
 * Designed to grow: add new optional fields over time; consumers and presets
 * remain forward-compatible.
 */
export interface EntityFormConfig {
  /**
   * Toolbar configuration.
   * - `undefined` → surface default (full toolbar for tabs).
   * - `null`      → render NO toolbar (default for dialog & slide-in).
   * - `Partial<FormToolbarConfig>` → merged over the surface default.
   */
  Toolbar?: Partial<FormToolbarConfig> | null;

  /** Show related-entity grid sections. Default: true (tab), false (dialog/slide-in). */
  ShowRelatedEntities?: boolean;

  /** Allow section headers to collapse. When false, sections render always-expanded, no chevron. Default: true. */
  CollapsibleSections?: boolean;

  /** Hide specific sections by sectionKey (field or related-entity). */
  HiddenSectionKeys?: string[];

  /** Allow-list: render ONLY these sectionKeys. Mutually exclusive with HiddenSectionKeys. */
  VisibleSectionKeys?: string[];

  /** Initial width mode. Default: 'centered' (tab), 'full-width' (slide-in body). */
  WidthMode?: FormWidthMode;

  /**
   * Whether in-form record links emit `Navigate` events. The host NEVER routes;
   * it only emits. Default: true (tab), false (dialog/slide-in — links inert so a
   * modal context doesn't teleport the user away).
   */
  EnableRecordLinks?: boolean;

  /** Start in edit mode. Default: true for new records, false for existing. */
  StartInEditMode?: boolean;
}
```

Three presets exported alongside it: `TAB_FORM_CONFIG` (full toolbar, everything on), `DIALOG_FORM_CONFIG` (`Toolbar: null`, `ShowRelatedEntities: false`, `EnableRecordLinks: false`), `SLIDEIN_FORM_CONFIG` (same as dialog + `WidthMode: 'full-width'`).

---

## 5. The No-Regeneration Config Bridge

Generated form templates hardcode `<mj-record-form-container [Record]="record" [FormComponent]="this" …>`. We never touch them. Instead:

1. **`BaseFormComponent`** gains `public Config: EntityFormConfig | null = null;` (set by the host after `createComponent`).
2. **`MjRecordFormContainerComponent`** adds `Effective*` getters that consult `fc.Config` (same pattern it already uses for `EffectiveWidthMode`, `EffectiveVariants`):
   - `EffectiveShowToolbar` → `fc?.Config?.toolbar !== null` → template wraps the toolbar in `@if (EffectiveShowToolbar)`.
   - `EffectiveToolbarConfig` → `{ ...preset, ...(fc?.Config?.toolbar ?? {}) }`.
   - **Related-entity hide / section allow-list:** in `ngAfterContentInit` + on `Panels.changes`, iterate `@ContentChildren(MjCollapsiblePanelComponent)` and set `IsVisible=false` on panels failing the `showRelatedEntities` / `hiddenSectionKeys` / `visibleSectionKeys` rules. Reuses the exact `IsVisible` mechanism already used for search filtering — pure container logic, no template change.
3. **`FormContext`** gains `collapsibleSections?: boolean`; `MjCollapsiblePanelComponent` makes `Toggle()` a no-op and hides the chevron (always-expanded) when false.

Net effect: **every existing generated form honors `Config` with zero regeneration.**

---

## 6. Component-by-Component Work

### 6.1 `base-forms` (Layer 1 changes)
- **NEW** `types/entity-form-config.ts` — `EntityFormConfig` + 3 presets. Export from `public-api.ts`.
- **MOVE IN** `form-resolver.service.ts` (+ its `FormResolution`, `EntityFormOverrideRow` types) from `explorer-core/services/`. Adjust the `BaseFormComponent` import to a local path. Keep the `MJ: User Settings` variant-persistence logic intact.
- `base-form-component.ts`: add `public Config: EntityFormConfig | null = null;` with JSDoc.
- `container/record-form-container.component.{ts,html}`: add `EffectiveShowToolbar`, fold `Config.toolbar` into `EffectiveToolbarConfig`, add section-visibility filtering driven by `Config`. Wrap toolbar render in `@if`.
- `panel/collapsible-panel.component.{ts,html}`: honor `FormContext.collapsibleSections === false` (no toggle, no chevron, force expanded).
- `types/form-types.ts`: add `collapsibleSections?` to `FormContext`.
- Tests: extend `base-forms.test.ts`; new tests for config bridging + section filtering. Move `form-resolver.service.test.ts` in.

### 6.2 `ui-components` (Layer 3 primitive)
- **MOVE IN** `slide-panel.component.*` from `versions/src/lib/panel/` → `ui-components/src/lib/slide-panel/`. Export from `public-api.ts`. (Or adopt Matt's generic slide-in if located — then skip the move and target that component instead.)
- `versions` package: depend on `ng-ui-components`, delete its local copy, re-point internal usage. (NOT a re-export — `versions` imports the moved component for its own use only.)

### 6.3 `base-forms` (Layer 2 — the host) — **NEW**
- **NEW** `host/entity-form-host.component.ts` — `MjEntityFormHostComponent extends BaseAngularComponent`.
  - Inputs: `EntityName`, `PrimaryKey?`/`RecordID?`, `Record?` (pre-loaded), `NewRecordValues?`, `EditMode?`, `Config?`, `Provider` (inherited).
  - Internals: inject `FormResolverService`; `ProviderToUse.GetEntityObject(name, ProviderToUse.CurrentUser)`; `InnerLoad`/`NewRecord`; `viewContainerRef.createComponent` (interactive vs class, mirroring `SingleRecordComponent.LoadForm`); set `record`/`EditMode`/`Config`/`Variants`/`OnVariantChanged`; subscribe to the form's `@Output`s and **re-emit** them as the host's own outputs; full teardown (`destroy()`, unsubscribe, `clear()`).
  - Methods exposed to shells: `Save()`, `Cancel()`, `get Dirty()`, `get IsSaving()`, `get form()` (live instance), cancellable `BeforeSave`.
  - Outputs: `Navigate`, `Notification`, `RecordSaved`, `RecordDeleted`, `RecordSaveFailed`, `ValidationFailed`, `RecordReady`, `Dismissed`.
  - Template: `<mj-loading>` until `RecordReady`, then `<ng-template mjContainer>`.

### 6.4 Layer 3 shells — **NEW**, in `base-forms` (D9)
> Shells live in `base-forms`; `base-forms` gains a dependency on `@memberjunction/ng-ui-components` (dialog/window) and on the relocated slide-in.
- `MjFormDialogComponent` — `mj-dialog` + `mj-entity-form-host`; default `DIALOG_FORM_CONFIG`; footer Save/Cancel call `host.Save()/Cancel()`; `RecordSaved`→auto-close; `Dismissed`→close; bubbles all host events. Two-way `Visible`.
- `MjFormSlideInComponent` — relocated slide-in + host; default `SLIDEIN_FORM_CONFIG`; same wiring.

### 6.5 Layer 4 — service + ref — **NEW**, in `base-forms`
- `MJFormPresenterService` (extends `BaseSingleton`? No — Angular `@Injectable({providedIn:'root'})`) with `Open(options): MJFormRef`. Mounts the chosen shell programmatically (technique mirrors `MJDialogService`).
- `MJFormRef` — `AfterSaved(): Promise<BaseEntity | null>`, `AfterClosed(): Promise<'save'|'cancel'>`, `Close()`, `get Form()`.
- `MJFormPresenterOptions` — `{ EntityName, RecordId?|Record?, NewRecordValues?, Presentation: 'dialog'|'slide-in'|'window', Config?, Provider? }`.

### 6.6 Explorer — thin wrapper
- `single-record.component.ts`: delete the inline resolve/load/create/wire/teardown; render `<mj-entity-form-host>` and subscribe to its outputs, mapping `Navigate`→`NavigationService`, `Notification`→`SharedService`, `Dismissed`→close, plus `recentAccessService.logAccess`. Import `FormResolverService` from `@memberjunction/ng-base-forms`.
- Update `explorer-core` `form-resolver.service.test.ts` import path; update `dashboards/ComponentStudio/services/entity-form-override.service.ts` import.
- **`entity-form-dialog` retirement — capability gap CLOSED; migration deferred.** The new host now supports **section mode** (`SectionName`), which was the only capability keeping `entity-form-dialog` around. What remains is purely a migration of its sole consumer (`simple-record-list`) onto `<mj-form-dialog [SectionName]>`. Its README is now marked deprecated-for-new-code; the consumer migration is a small follow-up (kept out of this PR to bound the diff).

### 6.7 Audit
- `packages/Actions/CoreActions/.../get-active-form-for-entity.action.ts` references resolution — verify it's an independent server-side path (it can't import the Angular service). No change expected; confirm.

---

## 7. Consumer Experience

**Imperative (one line from anywhere):**
```typescript
const ref = this.formPresenter.Open({
  EntityName: 'MJ: AI Agents',
  RecordId: agentId,                 // omit → new record
  Presentation: 'slide-in',          // 'dialog' | 'slide-in' | 'window'
  Config: { ShowRelatedEntities: false, CollapsibleSections: false, Toolbar: { ShowDeleteButton: false } },
});
const saved = await ref.AfterSaved(); // BaseEntity on save, null on cancel
```

**Declarative:**
```html
<mj-form-dialog [EntityName]="'Users'" [RecordID]="id" [(Visible)]="show" (Saved)="onSaved($event)"></mj-form-dialog>
<mj-form-slide-in [EntityName]="'MJ: Credentials'" [Record]="cred" [(Visible)]="open" (Saved)="refresh()"></mj-form-slide-in>
```

**Pre-loaded entity (bind a BaseEntity you already have):**
```html
<mj-form-dialog [Record]="myAgentEntity" [(Visible)]="show"></mj-form-dialog>
```

---

## 8. Phasing

### Phase 1 — Prove the full stack (tab + 1 dialog + 1 slide-in)  ✅ DONE
1. `EntityFormConfig` + presets; `Config` on `BaseFormComponent`; container/panel bridge; `collapsibleSections`.
2. Move `FormResolverService` → `base-forms`; fix imports + tests.
3. Build `MjEntityFormHostComponent`.
4. Relocate slide-in to `ui-components`.
5. Build `MjFormDialogComponent` + `MjFormSlideInComponent` + `MJFormPresenterService`/`MJFormRef` (new `ng-form-overlays` package).
6. Refactor Explorer `SingleRecordComponent` → thin wrapper (validates the **tab pathway**).
7. **Dialog test candidate:** replace **`Queries/query-category-dialog`** (MJ: Query Categories — minimal, create+edit, no cascade).
8. **Slide-in test candidate:** replace **`credentials/credential-dialog`** content (MJ: Credentials — single record, real, moderate), presented as a slide-in.
   - *(Both candidates are swappable; chosen for low custom-logic so the test exercises the stack, not bespoke flows.)*
9. Build all touched packages; run unit tests; Playwright smoke of tab + dialog + slide-in (create, edit, validate, save, cancel-revert, variant switch).

### Phase 2 — Hardening & ergonomics  ✅ (core items done)
- ✅ `enableRecordLinks` now renders FK/record links inert (plain text) in dialog/slide-in via `FormContext.enableRecordLinks` → `MjFormFieldComponent.RecordLinksEnabled`.
- ✅ Slide-in width persisted per-entity via `UserInfoEngine` (`mj.formSlideIn.width.<entity>`), restored on init.
- ✅ Loading + error states owned by `MjEntityFormHostComponent`.
- ✅ `window` presentation — `MjFormWindowComponent` (`<mj-form-window>`, non-modal floating, draggable/resizable) + presenter `'window'`.
- ✅ Section mode — `SectionName` on the host + all shells + presenter renders a single registered `BaseFormSectionComponent` standalone (closes the gap that blocked `entity-form-dialog` retirement).
- ✅ Config-driven section visibility now flows through `FormContext` to **every** panel, including slot-injected `BaseFormPanel`s (e.g. Content Sources) — not just `@ContentChildren`.
- ✅ Nested-navigation wiring documented (enable links + handle `Navigate` to open a nested overlay).
- **Deferred** (not needed for the core vision): deep focus-trapping a11y beyond what `mj-dialog` / `mj-window` / `mj-slide-panel` already provide (backdrop + Escape + drag).

### Phase 3 — Replacement waves (see §9)
- Wave A: thin Generic wrappers (`scheduling`, `agent-requests`, `credentials` full, `agents` create dialog/slide-in).
- Wave B: `explorer-settings` admin dialogs (Users, Roles, Permissions, Applications).
- Wave C: dashboard editors (MCP, API Keys) where they reduce to a generated form.
- Bespoke flows (AI Agent flow editor, sub-agent cascades) stay custom but may **compose** `BaseFormPanel`s.

### Phase 4 — Docs alignment (repo-wide)
- Grep **every** `.md` and `guides/**` for: `entity-form-dialog`, `EntityFormDialogComponent`, `FormResolverService`, `record-form-container`, `BaseFormComponent`, "slide-in/slidein/drawer", "custom dialog". Reconcile with the new capability.
- Update: root `CLAUDE.md` (forms guidance), `packages/Angular/CLAUDE.md` (custom-form vs. dialog-host decision tree, toolbar pattern), `base-forms/PANELS.md` (cross-link), `guides/DASHBOARD_BEST_PRACTICES.md`, any explorer-chrome docs.
- **NEW** doc: `base-forms/FORMS_AS_OVERLAYS.md` — the consumer guide (imperative + declarative + `EntityFormConfig` reference).
- Add a `CHANGELOG`/changeset entry per affected package.

---

## 9. Replacement Candidates (rationale)

"Candidate" = a component whose primary job is create/edit one entity record in an overlay, where a generated/custom form + `Config` would cover it. Bespoke multi-entity/visual flows are **not** candidates (keep custom; optionally compose panels).

| Component | Entity | ~LOC | Why a candidate |
|---|---|---|---|
| `Queries/query-category-dialog` | MJ: Query Categories | 237 | Minimal create+edit; **Phase 1 dialog test** |
| `credentials/credential-dialog` (+edit panel) | MJ: Credentials | ~210+ | Single record; **Phase 1 slide-in test** |
| `scheduling/scheduled-job-*` | MJ: Scheduled Jobs | ~767 | Slide-in editor; some custom (cron/params) → compose a `BaseFormPanel` |
| `agent-requests/agent-request-dialog` | MJ: Agent Requests | 114 | Thin wrapper |
| `agents/create-agent-dialog` + `create-agent-slidein` | MJ: AI Agents | ~485 | Dialog+slide-in variants of one editor — exactly the dual-surface story |
| `explorer-settings/user-management/user-dialog` | MJ: Users (+roles) | ~1270 | Admin editor; roles via a composed panel/related section |
| `explorer-settings/role-management/role-dialog` | MJ: Roles | ~983 | Admin editor |
| `explorer-settings/entity-permissions/permission-dialog` | MJ: Entity Permissions | ~1199 | Admin editor |
| `explorer-settings/application-management/application-dialog` | MJ: Applications | ~2051 | Largest; big win, later wave |
| `dashboards/MCP/mcp-connection-dialog`, `mcp-server-dialog` | MJ: MCP Server(Connection)s | ~1311 | Config editors |
| `dashboards/APIKeys/api-key-create-dialog` | MJ: API Keys | ~1277 | Has key-gen → keep a small custom panel |

**Not candidates (keep custom):** AI Agent flow editor, sub-agent cascade dialogs, MCP test-tool harness, visual/integration editor, selectors/pickers, test-run harnesses.

Estimated net reduction: **~50–60%** of custom dialog code, with consistency (variants, history, tags, validation, dark mode) gained for free.

---

## 10. Testing Strategy
- **Unit (Vitest):** `EntityFormConfig` merge/preset logic; container section-visibility filtering; `collapsibleSections` behavior; `FormResolverService` post-move (existing tests); host resolve/create/teardown with mocked provider + ClassFactory.
- **Playwright:** Phase 1 candidates — open dialog & slide-in, create + edit + validation-fail + save + cancel-revert + variant switch + (slide-in) resize/persist. Tab pathway regression via existing entity forms.
- **Per CLAUDE.md:** run each touched package's `npm run test`; report pass/fail counts.

---

## 11. Risks & Open Items
- **R1 — Matt's slide-in:** RESOLVED → relocate `versions/slide-panel` (D10).
- **R2 — D1 navigation default:** RESOLVED → inert links by default (D8).
- **R3 — Shell package:** RESOLVED → fold into `base-forms` + add `ng-ui-components` dep (D9).
- **R4 — Resolver move blast radius:** small (`single-record`, its test, ComponentStudio service). CoreActions path is server-side/independent — verify.
- **R5 — Container `watchRecordChanges()` uses a 200ms `setInterval`** for dirty polling; acceptable but note for the overlay context (ensure cleared on destroy — it is).
- **R6 — Manifest/tree-shaking:** new components need `@RegisterClass`/loader + manifest regen per the manifest guide; new package needs subpath exports if lazy-loaded.

---

## 12. Definition of Done (Phase 1)
- All Layers 1–4 in Generic, no Explorer imports, no Router.
- `SingleRecordComponent` is a thin wrapper; tab pathway unchanged for users.
- One dialog + one slide-in candidate migrated and passing Playwright.
- All touched packages build; unit tests green; results reported.
- Plan's later phases scheduled; docs-alignment phase queued.
