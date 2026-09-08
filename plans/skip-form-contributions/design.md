# Skip Form Contributions — Design

**Status:** Approved design (team review 2026-09-08); implementation plan in [implementation.md](implementation.md)
**Date:** 2026-09-08
**Foundations:** [`../form-contributions.md`](../form-contributions.md) · [`../form-chrome-layering.md`](../form-chrome-layering.md) · [`../interactive-forms/plan.md`](../interactive-forms/plan.md) · [Forms Architecture Guide §7c–7d](../../guides/FORMS_ARCHITECTURE_GUIDE.md) · [PANELS.md](../../packages/Angular/Generic/base-forms/PANELS.md)
**Repos:** MemberJunction (`MJ`), Skip-Brain, Skip-Client-Open-App

---

## 1. Summary

MemberJunction composes an entity form at runtime from **contributions**: baked field panels, related grids, heroes, and widgets, arranged by five chrome layers (L0 CodeGen → L1 app inclusions → L2 ranker → L3 admin rules → L4 user). Today a contribution can only be a compiled Angular `BaseFormPanel`. Skip ships no Angular, so the only thing Skip can put on the form surface is a **whole-form replacement**, which is opaque to that composition.

This design adds a **second source of contributions, a database row, and a second renderer, a React component with `componentRole: 'form-panel'`**. The existing composer, slot hosts, last-wins collapse, and chrome layers treat the two sources as peers. Skip writes rows, not code. A Skip hero on Person, a revenue waterfall on Subscription, or a card view that replaces the Orders grid is the same kind of object an installed OpenApp contributes, and it keeps composing correctly as other apps install.

Whole-form replacement stays and becomes the escalation path.

## 2. Background

### 2.1 Compiled contributions

`@RegisterClassEx(BaseFormPanel, { metadata })` registers a panel. The metadata bag carries `entity`, `slot`, `sortKey`, `contributionKey`, `relatedEntity` + `relatedJoinField`, `replacesSectionKey`, `inclusion`, and `chromeGroup`. `ResolveFormContributions` (pure) collapses registrations by key, decides which baked sections to hide, and lists stock grids to fill in. `<mj-form-panel-slot>` mounts winners with a forward fallback chain; `<mj-record-form-container>` always hosts `<mj-form-contributions>` and an `after-everything` slot. Chrome reads inclusion, sort key, and chrome group from the same registrations; `MJ: Form Chrome Rules` (L3) can suppress a contribution by key.

Discovery is `ClassFactory.GetAllRegistrationsByMetadata`. That is the one input to the "metadata forms framework" that is not metadata.

### 2.2 Interactive whole-form replacement

`MJ: Entity Form Overrides` binds an entity to a `MJ: Components` row (`Type='Form'`, `componentRole: 'form'`) at User, Role, or Global scope. `InteractiveFormComponent extends BaseFormComponent` owns the `BaseEntity`, renders `<mj-react-component>` inside the container, and bridges `FormHostProps` in and `BeforeSave` out. `InteractiveFormsEngine` caches forms and overrides with event-driven invalidation. Authoring paths: the Form Builder agent, Form Studio, Component Studio, `mj sync`, and the artifact viewer's **Apply to my form** button.

### 2.3 How Skip authors a form

The `#` picker emits an entity token; Skip's `EntityMentionResolver` turns it into a `[TARGET ENTITY]` marker. The Requirements Expert sets PRD `type: 'form'`; `form-role-contract.md` is included into the architect and code-generator prompts; five form gates enforce the contract; `WorkflowService.applyFormRoleCommitment` stamps `componentRole` and `entityName`; the spec returns as a conversation artifact; **Apply to my form** runs `Create` or `Modify Interactive Form`.

### 2.4 The gap (verified in code)

- **No sections, no chrome.** `BakedRelatedSectionKeys` is derived from projected `<mj-collapsible-panel>` children. A React whole-form projects none.
- **Duplicated related data.** With nothing baked, `<mj-form-contributions>` appends a stock grid for every `DisplayInForm` relationship, while the prompt tells Skip to draw related tables in view mode.
- **Inert claims.** A compiled `replacesSectionKey: 'details'` hero hides nothing on a React form; compiled panels fall to `after-everything`.
- **Frozen composition.** Hand-drawn related tables are a schema snapshot; a downstream app installed later is invisible to them.
- **All-or-nothing.** "Add a KPI strip" means regenerating the whole form and losing every compiled contribution's position.

## 3. Goals and non-goals

**Goals**

1. Skip produces a single contribution (hero, extra pane, related-grid takeover, field-panel replacement) that mounts through the existing slot, composer, and chrome machinery.
2. Metadata and compiled contributions are peers: same `contributionKey` collapse, same L1 verbs, same L3 suppression, same L4 arrangement, same `HiddenSectionKeys` propagation.
3. Whole-form replacement is unchanged in behavior and becomes composable (slots).
4. One row format for every author: Skip, the Form Builder agent, Form Studio, `mj sync`.
5. Skip sees the form it is extending before it designs the change.

**Non-goals**

- Changing CodeGen output.
- Replacing compiled `BaseFormPanel`. Panels that need Angular services or typed entity subclasses keep using it.
- Toolbar verbs from React contributions (host hooks exist; deferred until a real request).
- Per-application scope (same punt as `EntityFormOverride`; a nullable `ApplicationID` column can be added later).

## 4. Architecture

```
  Registrations                                             Renderers
  ─────────────                                             ─────────
  ClassFactory (compiled BaseFormPanel)  ── Source 'class' ──┐        ┌── registered Angular ctor
                                                             ├─▶ Collapse ─▶ Resolve ─▶ <mj-form-panel-slot> ─┤
  MJ: Entity Form Contributions rows     ── Source 'metadata'┘   (unchanged pure logic)                        └── InteractiveFormPanelComponent
  (InteractiveFormsEngine cache)                                                                                    └── <mj-react-component>
                                                                                                                        componentRole 'form-panel'
  <mj-record-form-container> reads the SAME merged list for chrome (inclusion / sortKey / chromeGroup) and hidden keys.
```

The only new runtime pieces are the merged collector, one generic host panel, and the engine load. The composer, slot coordinator, chrome resolver, and L3 rules are untouched.

## 5. Data model

### 5.1 `MJ: Entity Form Contributions` (new table `EntityFormContribution`)

Mirrors `FormPanelRegistrationMetadata` one-to-one; borrows scoping and lifecycle from `EntityFormOverride`.

| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier | PK |
| `EntityID` | FK `Entity` | Parent form |
| `ComponentID` | FK `Component` | `Type='Widget'` row whose spec declares `componentRole: 'form-panel'` |
| `Name`, `Description` | nvarchar | `Name` is the version lineage label |
| `Slot` | nvarchar(30) | `top-area` · `before-fields` · `after-fields` · `after-related` · `after-everything` |
| `SortKey` | int, default 0 | Higher renders first within the slot |
| `ContributionKey` | nvarchar(256) NULL | Last-wins identity; NULL derives `related:<entity>:<join>` or stays unique |
| `RelatedEntityID` | FK `Entity` NULL | Related-grid claim |
| `RelatedJoinField` | nvarchar(255) NULL | Bill-To vs Ship-To |
| `ReplacesSectionKey` | nvarchar(255) NULL | Hides a baked field panel (hero pattern) |
| `Inclusion` | nvarchar(10) NULL | `Primary` / `More` / `None` |
| `ChromeGroup` | nvarchar(10) NULL | `details` / `more` |
| `Presentation` | nvarchar(10), default `panel` | `panel` wraps in `<mj-collapsible-panel>`; `bare` renders a hero strip with no chrome and no rail item |
| `Title`, `Icon` | nvarchar NULL | Section header / rail label and icon |
| `Scope`, `UserID`, `RoleID` | as `EntityFormOverride` | Same CHECK shape |
| `Priority` | int, default 0 | Last-wins against compiled registrations (see §8) |
| `Status` | nvarchar(20) | `Active` / `Pending` / `Inactive` |
| `Configuration` | nvarchar(MAX) NULL | JSON passed to the component as `contribution.configuration`; one component, many rows |
| `Notes` | nvarchar(MAX) NULL | Agent iteration log |

Filtered unique index on `(EntityID, ContributionKey, Scope, UserID, RoleID) WHERE ContributionKey IS NOT NULL`.

### 5.2 Component rows

Panel components are `MJ: Components` rows with `Type='Widget'` (decision 2). `InteractiveFormsEngine` widens its filter to `Type IN ('Form','Widget')`. Whole forms stay `Type='Form'`.

### 5.3 Rejected alternatives

- A `Kind` column on `EntityFormOverride`: wrong cardinality, mostly-NULL columns, wrong "first active wins" semantics.
- Rows inside `Entity.Configuration`: no per-user scope, no lifecycle, and the admin-versus-app-sync collision L3 exists to solve.
- Reusing `EntityRelationship.DisplayComponentID`: a CodeGen-time selector for Angular generators; cannot express heroes or extra panes.

## 6. Runtime

| Piece | Change |
|---|---|
| `InteractiveFormsEngine` (`core-entities`) | Loads `MJ: Entity Form Contributions`; exposes `Contributions`, `Contributions$`, `GetApplicableContributions(entityID, userID, roleIDs)`; Components filter `Type IN ('Form','Widget')` |
| Collector (`ng-base-forms`) | New `CollectFormContributionRegistrations(entity, provider)` merges class registrations with Active, scope-matching rows into `FormContributionRegistration[]` (`Source`, `ComponentID`, `Configuration`, `Title`, `Icon`, `Presentation` added). Memoized per (entity, user); invalidated on `Contributions$` and when the ClassFactory registration count changes. The old `CollectFormPanelRegistrations()` becomes a class-only wrapper |
| `FormPanelSlotComponent` | Consumes the merged list; mounts `InteractiveFormPanelComponent` for `Source: 'metadata'` winners; uses the composer's strict entity predicate (fixes the loose/strict mismatch) |
| `InteractiveFormPanelComponent` (new) | `extends BaseFormPanel`. Loads the spec through the engine, wraps in `<mj-collapsible-panel>` when `Presentation='panel'` (`SectionKey = ContributionKey`, `Variant = related ? 'related-entity' : 'default'`), renders bare otherwise. Bridges `FormPanelHostProps` in; `RowCountChanged` → `SetSectionRowCount`; `FieldChanged` → `Record.Set` on the parent record; `Validate` → `validate()`; `OpenEntityRecord` → `OnFormNavigate`; record refresh → props rebuild |
| Container | Reads the merged list for chrome and hidden keys; excludes `Presentation='bare'` from the rail (replaces the `contributionKey === 'header'` magic string); publishes a **composition snapshot** (§10) after each chrome resolve |
| `BaseFormComponent` | `RegisterFormPanel` / `UnregisterFormPanel`; `Validate()` merges mounted panels' `validate()` (wires a documented but unimplemented hook); `CompositionSnapshot` + `CompositionChanged` |
| Interactive whole-form template | Emits the four CodeGen slots around the React root so compiled and metadata contributions land in position instead of `after-everything` |

## 7. Contract — `componentRole: 'form-panel'`

Added to `@memberjunction/interactive-component-types` (`forms/` subpath).

```ts
export type ComponentRole = 'form' | 'form-panel' | 'dashboard' | 'widget' | 'report' | 'detail-pane';

export interface FormContributionSpec {           // carried on ComponentSpec.formContribution
    slot: FormContributionSlot;                   // default 'after-fields'
    sortKey?: number;
    contributionKey?: string;
    relatedEntity?: string;
    relatedJoinField?: string;
    replacesSectionKey?: string;
    inclusion?: 'Primary' | 'More' | 'None';
    chromeGroup?: 'details' | 'more';
    presentation: 'panel' | 'bare';               // default 'panel'
    title: string;
    icon?: string;
    configuration?: Record<string, unknown>;
}

export interface FormPanelHostProps extends FormHostProps {
    contribution: { key: string; slot: FormContributionSlot; title: string; presentation: 'panel' | 'bare'; configuration: Record<string, unknown> };
    related?: {                                   // present only for related-grid claims
        entityName: string;
        joinField?: string;
        viewParams: { EntityName: string; ExtraFilter: string; OrderBy?: string };   // prebuilt; includes join.any
        newRecordValues: Record<string, unknown>;
    };
    isExpanded: boolean;
    layout: 'accordion' | 'left-nav';
}
```

| Direction | Name | Payload | Host action |
|---|---|---|---|
| event | `RowCountChanged` | `{ count }` | `SetSectionRowCount(key, count)` — rail badge |
| event | `FieldChanged` (reused) | `{ fieldName, newValue }` | `Record.Set` on the parent; the parent's Save persists |
| event | `ValidationChanged` (reused) | `{ isValid, errors }` | cached; surfaced through `validate()` |
| method | `OnRecordRefreshed` | none | after parent reload |
| method | `SetEditMode` | `{ mode }` | on toolbar edit / cancel |
| method | `Validate` | none → `{ isValid, errors }` | before parent save |

Invariants a panel must hold: never save or delete, never render toolbar buttons, never fetch the bound record, fetch related data through `utilities.rv.RunView` using `related.viewParams` when present, no fixed heights (left-nav gives the panel the leftover column), and a `panel` presentation draws no header of its own.

The spec block carries the registration intent so any consumer (Skip, Form Builder, Studio) can turn a spec into a row without a second prompt. It never carries `priority`.

## 8. Resolution rules

1. **Scope filter.** Rows apply when `Status='Active'` and scope matches (User by `UserID`, Role by membership, Global). Same predicate as the override resolver.
2. **Last-wins by `contributionKey`.** Highest `Priority` wins. **On a tie, compiled wins** (decision 1). A row outranks a compiled contribution only with strictly higher `Priority`; the apply flow sets `incumbent + 1` after the user confirms the replacement.
3. **Chrome.** Winning rows feed L1 `inclusion`, `sortKey`, `chromeGroup` exactly as compiled ones. L3 rules keyed by `ContributionKey` still win. L4 rearranges. `Presentation='bare'` never becomes a rail item.
4. **Claims.** `RelatedEntityID` (+ `RelatedJoinField`) hides the baked or stock grid; `ReplacesSectionKey` hides that baked panel. Both are set-membership operations and cannot fail loudly, so they are **validated, not restricted** (decision 4): the apply flow checks the key against the composition snapshot and offers "extra pane" or "pick a key" on a miss; the container logs when a hidden key matches no panel and Form Studio shows a "not found" badge; the panel prompt limits Skip to keys present in `[FORM CONTEXT]`.

## 9. Authoring and apply

### 9.1 Skip-Brain

- **Intent.** Requirements Expert emits PRD `type: 'form-panel'` for additive or replacing requests against a form ("add a … to the form", "replace the Details panel", "show tickets as cards") and whenever `[FORM CONTEXT]` is present with such a verb. `[TARGET ENTITY]` gains one sentence steering additive requests to a panel.
- **Prompt.** `shared/form-panel-role-contract.md`, a sibling of `form-role-contract.md`, included by the architect and code generator when `type == 'form-panel'`.
- **Commitment.** `applyFormRoleCommitment` stamps `componentRole: 'form-panel'`, `entityName`, and defaults `formContribution.slot` / `presentation`.
- **Gates.** `FormPanelNoSaveGate`, `FormPanelUsesHostPropsGate`, `FormPanelNoFixedHeightGate`; `FormLintParityGate` applies to both roles. Form-only gates skip panels.
- **Context intake.** `SkipAPIRequest.formContext` is serialized into a `[FORM CONTEXT: …]` marker on the last user message, after the entity marker.

### 9.2 MemberJunction

- **Actions** (`CoreActions/custom/interactive-forms/`): `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity`, `Get Form Composition For Entity`. Same security clamp as forms: agents write User scope only; `Global` and `Role` are human acts.
- **Artifact viewer.** Detects `componentRole === 'form-panel'`, previews the panel against a real record, and shows **Add to my form**. `InteractiveFormApplyService` routes panel specs to `ApplyContribution`, which validates against the snapshot, handles incumbent priority, and runs Create or Modify then Activate.
- **`mj sync`.** `metadata/entity-form-contributions/` beside `entity-form-overrides/`. OpenApps without Angular ship `Scope='Global'` rows with no promotion gate (decision 3); L3 can still suppress per site.
- **Parity (trailing).** Form Builder `Intent.Kind: 'form' | 'form-panel'`; Form Studio lists contributions; Component Studio scaffolds a panel.

## 10. Context — the form composition snapshot

Compiled registrations exist only in the browser, so the snapshot is built client-side and travels with the request. The **full snapshot goes on every message** (decision 5); it is a few kilobytes.

```ts
interface FormCompositionSnapshot {
    Entity: string;
    Layout: 'accordion' | 'left-nav';
    Sections: Array<{ Key: string; Title: string; Variant: string; Group: string | null; Hidden: boolean }>;
    Related: Array<{ Entity: string; JoinField: string; SectionKey: string; Inclusion: 'Primary' | 'More' | 'None' | 'Auto'; Source: 'baked' | 'stock' | 'claimed' }>;
    Contributions: Array<{ Key: string; Slot: FormContributionSlot; Source: 'class' | 'metadata'; Title: string; Presentation: 'panel' | 'bare'; Hidden: boolean; Priority: number }>;
    SlotsPresent: FormContributionSlot[];
    ChromeRuleCount: number;
}
```

Transport, end to end, with no new server plumbing in MJ:

```
<mj-record-form-container>.ResolveChrome()  →  form.CompositionSnapshot / CompositionChanged
  → SingleRecordComponent (compositionChanged) → EntityRecordResource.SetAgentContext(this, { Form })
  → explorer-app.handleAgentContextUpdate → AppContextSnapshot.AdditionalContext.Form   (already published)
  → agent run data.appContext (already sent)  →  SkipProxyAgent reads params.data.appContext.AdditionalContext.Form
  → SkipAPIRequest.formContext  →  Skip RequestRouter appends [FORM CONTEXT: …]
```

Fallback for agents with no browser snapshot: `Get Form Composition For Entity` returns the metadata-derivable subset (relationships with L1 inclusion, L3 rules, active metadata contributions). It cannot see compiled panels and says so in its output.

## 11. Worked scenarios

| Ask | Row | Result |
|---|---|---|
| "Add a lifetime-value strip to the top of the Person form" | `Slot: before-fields`, `Presentation: bare`, `ContributionKey: skip:person-ltv`, `SortKey: 90` | Hero above Personal Identity; generated form untouched; Sales installs later and its Deals grid appears below with no regen |
| "Replace the Details panel on Order Headers with a money summary" | `Slot: before-fields`, `ReplacesSectionKey: details`, `ContributionKey: header` | Details hides. If Orders ships a compiled `header`, it keeps the slot until the user confirms and the row gets `Priority = incumbent + 1` |
| "Show my tickets as cards instead of a grid" on Person | `RelatedEntityID: Event Order Lines`, `RelatedJoinField: PersonID`, `Slot: after-related` | Baked grid hides; cards mount; rail badge from `RowCountChanged` |
| "Put a renewal forecast on Subscriptions, in More" | `Slot: after-fields`, `Inclusion: More`, `ContributionKey: skip:renewal-forecast` | Lives in More; an L3 rule keyed `skip:renewal-forecast` can pin or suppress it |
| "Redesign the whole Applications form" | `EntityFormOverride` as today | Whole-form path, now with slots so other contributions still land in position |

## 12. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Equal-priority tie between a row and a compiled panel with the same key | Compiled wins. Rows outrank only with strictly higher `Priority`; the apply flow sets `incumbent + 1` on confirmation. Skip never sets priority |
| 2 | `MJ: Components.Type` for panel components | `Widget` with `componentRole: 'form-panel'`. Whole forms stay `Form`. Engine filter `Type IN ('Form','Widget')` |
| 3 | OpenApps shipping `Scope='Global'` React contributions via `mj sync` without a promotion gate | Acceptable. Installing the package is the gate, as for compiled panels. L3 can suppress per site |
| 4 | `replacesSectionKey` against custom forms whose section keys are not CodeGen's | Validate, do not restrict: apply-time snapshot check with an extra-pane fallback, render-time diagnostic and Form Studio badge, prompt limited to `[FORM CONTEXT]` keys |
| 5 | Snapshot transport to Skip | Full composition on every message |

## 13. Phasing

| Phase | Delivers | Depends on |
|---|---|---|
| **A. Contract + runtime** | `'form-panel'` role and types; `EntityFormContribution` migration + CodeGen; engine load; merged collector with memo and tie-break; `InteractiveFormPanelComponent`; slot host mount; container wiring; composition snapshot; panel validation; interactive-form slots | — |
| **B. Apply path** | Action family; artifact-viewer detection, preview, and button; `ApplyContribution`; `mj sync` directory | A |
| **C. Skip-Brain** | Intent branch; panel contract prompt; commitment; gates; `[FORM CONTEXT]` intake | A (contract only) |
| **D. Context** | Snapshot publication from the record tab; `SkipProxyAgent` → `formContext`; fallback action | A |
| **E. Parity** | Form Builder `Intent.Kind`; Form Studio contributions list; Component Studio scaffold | B |

A and C proceed in parallel once the contract types land. D ships before the feature is turned on for users; without it Skip's output lands in a plausible place rather than the right one. E gets its own implementation plan after B.

## 14. Cleanups folded in and deferred

From the architecture audit that preceded this design:

**Folded into Phase A** — strict entity matching shared by slot host and composer; memoized registration collection (the `formContext` getter currently rescans `ClassFactory` on every change-detection pass); `BaseFormPanel.validate()` actually called on save; the `contributionKey === 'header'` magic string replaced by `Presentation`; interactive whole-form emits slots.

**Deferred (separate PRs)** — `EntityFormOverride.Configuration` carrying `EntityFormConfig` so a whole-form can opt out of fill-in grids; `form-role-contract.md` telling Skip not to hand-draw related tables; unified priority helper replacing the ascending sort in `InteractiveFormsEngine.GetActiveOverrideForEntity`; docblock drift in `CreateInteractiveFormAction` and `FormResolverService`; lazy `Specification` loading in the engine; `ApplicationID` scope.

## 15. Risks

- **Registration cache correctness.** The memo must invalidate on engine emissions and on late compiled registrations (lazy-loaded OpenApp modules). Key the cache on the ClassFactory registration count as well as the engine version.
- **Engine readiness.** The collector is synchronous; the engine loads asynchronously. The form host already awaits the resolver (which configures the engine) before creating the form, so slots mount after load. The collector still kicks a `Config(false)` and invalidates when rows arrive, so a cold path renders class contributions first and rows a tick later.
- **Prompt drift.** Two role contracts now share rules. Keep the shared invariants in one include (`form-shared-invariants.md`) if they diverge more than once.
- **Snapshot staleness.** The snapshot reflects the last chrome resolve. A Skip request sent during a form's first render may carry the previous tab's snapshot; `EntityRecordResource` publishes on every `CompositionChanged`, including the first.
