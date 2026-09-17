# Skip Form Contributions — Design

**Status:** Proposed — revised after review on [PR #4311](https://github.com/MemberJunction/MJ/pull/4311); implementation plan in [implementation.md](implementation.md)
**Date:** 2026-09-08 · revised 2026-09-16
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
- Wildcard contributions. A compiled panel may register `entity: '*'` and appear on every form; `EntityFormContribution.EntityID` is `NOT NULL`, so a row targets exactly one entity. The peers claim in goal 2 carries this asterisk deliberately — a cross-entity React panel is a larger blast radius than this feature needs, and a nullable `EntityID` can be added later on the same argument as `ApplicationID`.

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
| `Precedence` | int, default 0 | Last-wins against compiled registrations, **higher wins** (see §8). Named `Precedence`, not `Priority`, because `EntityFormOverride.Priority` is an ascending sort key — the reverse (decision 6) |
| `Status` | nvarchar(20) | `Active` / `Pending` / `Inactive` |
| `Configuration` | nvarchar(MAX) NULL | JSON passed to the component as `contribution.configuration`; one component, many rows |
| `Notes` | nvarchar(MAX) NULL | Agent iteration log |

**Uniqueness.** Two filtered unique indexes, both scoped `WHERE Status='Active'` so inactive version history is still permitted:

- `(EntityID, ContributionKey, Scope, UserID, RoleID) WHERE ContributionKey IS NOT NULL AND Status='Active'`
- `(EntityID, RelatedEntityID, RelatedJoinField, Scope, UserID, RoleID) WHERE ContributionKey IS NULL AND RelatedEntityID IS NOT NULL AND Status='Active'`

The second index closes the keyless related-grid hole: `ResolveContributionKey` *derives* `related:<entity>:<join>` when `ContributionKey` is NULL, so a single `ContributionKey IS NOT NULL` index leaves derived-key rows uncovered. The apply path also derives and persists the key on write (§9.2), so both defenses apply.

**CHECK constraints** beyond the scope shape, each rejecting a combination that has no meaning:

- `Presentation='bare'` requires `Inclusion IS NULL AND ChromeGroup IS NULL` — a bare hero is never a rail item.
- `RelatedJoinField` requires `RelatedEntityID`.
- `ReplacesSectionKey` and `RelatedEntityID` are mutually exclusive — one contribution claims one thing.

`Presentation`, `Inclusion`, and `ChromeGroup` also get `MJ: Entity Field Values` rows rather than bare CHECK constraints alone, so Form Studio (Phase E) gets dropdowns from metadata instead of a hand-maintained list.

### 5.2 Component rows

Panel components are `MJ: Components` rows with `Type='Widget'` (decision 2). Whole forms stay `Type='Form'`.

`InteractiveFormsEngine` does **not** widen to `Type IN ('Form','Widget')`. `Widget` is an open set grown by registry sync and general authoring, unrelated to form-panel adoption, and the engine caches to client local storage on every Explorer boot. The filter instead loads form components plus exactly the components a contribution references (decision 2a):

```sql
Type='Form' OR ID IN (SELECT ComponentID FROM vwEntityFormContributions)
```

The loaded set then scales with contribution adoption, not with unrelated authoring. Subqueries of this shape pass the GraphQL `ExtraFilter` screen — it allows `IN (SELECT … FROM <entity BaseView>)` and rejects base tables and catalog views (PR #4295). The cost is one invalidation link: a write to `MJ: Entity Form Contributions` must refresh the component cache as well as the contribution cache, because a new row can reference a component the cache does not hold.

### 5.3 Rejected alternatives

- A `Kind` column on `EntityFormOverride`: wrong cardinality, mostly-NULL columns, wrong "first active wins" semantics.
- Rows inside `Entity.Configuration`: no per-user scope, no lifecycle, and the admin-versus-app-sync collision L3 exists to solve.
- Reusing `EntityRelationship.DisplayComponentID`: a CodeGen-time selector for Angular generators; cannot express heroes or extra panes.

## 6. Runtime

| Piece | Change |
|---|---|
| `InteractiveFormsEngine` (`core-entities`) | Loads `MJ: Entity Form Contributions`; exposes `Contributions`, `Contributions$`, `GetApplicableContributions(entityID, userID, roleIDs)`, and a `ContributionsReady` flag for first-paint gating; Components filter becomes reference-scoped (§5.2), and a contribution write invalidates both caches |
| Collector (`ng-base-forms`) | New `CollectFormContributionRegistrations(entity, provider)` merges class registrations with Active, scope-matching rows into `FormContributionRegistration[]` (`Source`, `ComponentID`, `Configuration`, `Title`, `Icon`, `Presentation` added). Memoized per (**provider**, entity, user); invalidated on `Contributions$` and when the ClassFactory registration count changes. A restricted role is detected with `IsPermissionConstrained`, not by catching the error. The old `CollectFormPanelRegistrations()` becomes a class-only wrapper |
| `FormPanelSlotComponent` | Consumes the merged list; mounts `InteractiveFormPanelComponent` for `Source: 'metadata'` winners; uses the composer's strict entity predicate (fixes the loose/strict mismatch) — the eleven registrations that only mount today because of the fuzzy matcher are repaired in the same task, and the diagnostic fires per registration rather than only when a slot resolves nothing |
| `InteractiveFormPanelComponent` (new) | `extends BaseFormPanel`. Loads the spec through the engine, wraps in `<mj-collapsible-panel>` when `Presentation='panel'` (`SectionKey = ContributionKey`, `Variant = related ? 'related-entity' : 'default'`), renders bare otherwise. Bridges `FormPanelHostProps` in; `RowCountChanged` → `SetSectionRowCount`; `FieldChanged` → `Record.Set` on the parent record; `Validate` → `validate()` (**awaited** — §7); `OpenEntityRecord` → `OnFormNavigate`; record refresh → props rebuild. A panel that throws during render is caught by the error boundary `<mj-react-component>` already installs; the host renders the panel's failure state and the rest of the form is unaffected |
| Container | Reads the merged list for chrome and hidden keys; excludes `Presentation='bare'` from the rail for **both** sources (replaces the `contributionKey === 'header'` guess); gates first paint on contribution readiness (§15); publishes a **composition snapshot** (§10) after each chrome resolve |
| `BaseFormPanel` metadata bag | Gains `presentation: 'panel' \| 'bare'` so a compiled panel expresses hero-ness the same way a row does. The five `slot: 'header'` panels — a slot that is not in `FormPanelSlot`, so they have never rendered — move to `slot: 'before-fields'`, `presentation: 'bare'`, with real contribution keys (decision 7) |
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
| method | `Validate` | none → `{ isValid, errors }` or a Promise of it | before parent save |

`Validate` is the one method that may be asynchronous: a generated validator that checks anything server-side will be `async`, and a host that tested the returned object synchronously would see a Promise, fall back to the last cached result, and save an invalid record with no error and no log. The host therefore `await`s the result, and `BaseFormPanel.validate()` returns `ValidationResult | Promise<ValidationResult>`. `BaseFormComponent.Validate()` keeps its synchronous signature, since it is published API; `Save()` calls a new `ValidateAsync()` instead. A gate enforces that `Validate` returns the documented shape.

Invariants a panel must hold:

- Never save or delete, never render toolbar buttons, never fetch the bound record.
- Fetch related data through `utilities.rv.RunView`, using `related.viewParams` when present.
- No fixed heights — left-nav gives the panel the leftover column.
- A `panel` presentation draws no header of its own.
- **Theme through `styles`.** Every color, radius, spacing, and font comes from the passed `styles` tokens. A hardcoded background inside themed chrome is a dark-mode defect; SCSS has `npm run check:ui` to catch this and React specs have nothing, so it is a hard rule plus a gate.
- **Accessible by construction.** The panel's title is a heading at the level the host says; interactive elements are real controls with labels; focus order follows visual order; nothing is reachable by mouse only. A bare hero sits outside the rail and therefore outside the rail's keyboard path, so it carries its own landmark.

Slot guidance for authors: the repo emits `before-fields`, `after-fields`, `after-related`, and `after-everything`. `top-area` is in the union but **no** form emits it as a panel slot, while CodeGen does emit a `top-area` *section* — a name collision that invites a wrong choice. The prompt offers the four that exist; the forward fallback chain still rescues a `top-area` row.

The spec block carries the registration intent so any consumer (Skip, Form Builder, Studio) can turn a spec into a row without a second prompt. It never carries `precedence`.


## 8. Resolution rules

1. **Scope filter.** Rows apply when `Status='Active'` and scope matches (User by `UserID`, Role by membership, Global). Same predicate as the override resolver.
2. **Last-wins by `contributionKey`.** Highest `Precedence` wins. **On a tie, compiled wins** (decision 1) — enforced by an explicit source-rank comparator, not by array order. A row outranks a compiled contribution only with strictly higher `Precedence`; the apply flow sets `incumbent + 1` after the user confirms the replacement.
3. **Chrome.** Winning rows feed L1 `inclusion`, `sortKey`, `chromeGroup` exactly as compiled ones. L3 rules keyed by `ContributionKey` still win. L4 rearranges. `Presentation='bare'` never becomes a rail item.
4. **Claims.** `RelatedEntityID` (+ `RelatedJoinField`) hides the baked or stock grid; `ReplacesSectionKey` hides that baked panel. Both are set-membership operations and cannot fail loudly, so they are **validated, not restricted** (decision 4): the apply flow checks the key against the composition snapshot and offers "extra pane" or "pick a key" on a miss; the container logs when a hidden key matches no panel and Form Studio shows a "not found" badge; the panel prompt limits Skip to keys present in `[FORM CONTEXT]`.

## 9. Authoring and apply

### 9.1 Skip-Brain

- **Intent.** Requirements Expert emits PRD `type: 'form-panel'` for additive or replacing requests against a form ("add a … to the form", "replace the Details panel", "show tickets as cards") and whenever `[FORM CONTEXT]` is present with such a verb. `[TARGET ENTITY]` gains one sentence steering additive requests to a panel.
- **Prompt.** `shared/form-panel-role-contract.md`, a sibling of `form-role-contract.md`, included by the architect and code generator when `type == 'form-panel'`.
- **Commitment.** `applyFormRoleCommitment` stamps `componentRole: 'form-panel'`, `entityName`, and defaults `formContribution.slot` / `presentation`.
- **Gates.** `FormPanelNoSaveGate`, `FormPanelUsesHostPropsGate`, `FormPanelNoFixedHeightGate`, `FormPanelThemeTokensGate` (the spec uses `styles`, not hardcoded colors), `FormPanelValidateShapeGate` (a declared `Validate` returns `{ isValid, errors }`, sync or async); `FormLintParityGate` applies to both roles. Form-only gates skip panels.
- **Context intake.** `SkipAPIRequest.formContext` is serialized into a `[FORM CONTEXT: …]` marker on the last user message, after the entity marker.

### 9.2 MemberJunction

- **Actions** (`CoreActions/custom/interactive-forms/`): `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity`, `Get Form Composition For Entity`. Same security clamp as forms: agents write User scope only; `Global` and `Role` are human acts. Two additions over the form family: a contribution key is **derived and persisted** on write when the author supplies none, so the keyless related-grid claim cannot duplicate; and a key is accepted only if it matches `^[A-Za-z0-9:._-]{1,256}$`, which removes the hand-escaping of a model-authored string into a `RunView` `ExtraFilter`.
- **Artifact viewer.** Detects `componentRole === 'form-panel'`, previews the panel against a real record, and shows **Add to my form**. `InteractiveFormApplyService` routes panel specs to `ApplyContribution`, which validates against the snapshot, handles incumbent precedence, and runs Create or Modify then Activate.
- **`mj sync`.** `metadata/entity-form-contributions/` beside `entity-form-overrides/`. OpenApps without Angular ship `Scope='Global'` rows with no promotion gate (decision 3); L3 can still suppress per site, an identity-entity clamp applies to every write path, and an instance kill switch turns the source off entirely (§16).
- **Parity (trailing).** Form Builder `Intent.Kind: 'form' | 'form-panel'`; Form Studio lists contributions; Component Studio scaffolds a panel.

## 10. Context — the form composition snapshot

Compiled registrations exist only in the browser, so the snapshot is built client-side and travels with the request. The **full snapshot goes on every message** (decision 5); it is a few kilobytes.

```ts
interface FormCompositionSnapshot {
    Entity: string;
    RecordPrimaryKey: string;                 // which record this describes; AdditionalContext is app-global
    Layout: 'accordion' | 'left-nav';
    Sections: Array<{ Key: string; Title: string; Variant: string; Group: string | null; Hidden: boolean }>;
    Related: Array<{ Entity: string; JoinField: string; SectionKey: string; Inclusion: 'Primary' | 'More' | 'None' | 'Auto'; Source: 'baked' | 'stock' | 'claimed' }>;
    Contributions: Array<{ Key: string; Slot: FormContributionSlot; Source: 'class' | 'metadata'; Title: string; Presentation: 'panel' | 'bare'; Hidden: boolean; Precedence: number }>;
    SlotsPresent: FormContributionSlot[];
    ChromeRuleCount: number;
}
```

Transport, end to end, with no new server plumbing in MJ:

```
<mj-record-form-container>.ResolveChrome()  →  form.CompositionSnapshot / CompositionChanged
  → SingleRecordComponent (compositionChanged) → EntityRecordResource.SetAgentContext(this, { Form })   (NEW — task D1)
  → explorer-app.handleAgentContextUpdate → AppContextSnapshot.AdditionalContext.Form   (merge, not replace — see below)
  → agent run data.appContext (already sent)  →  SkipProxyAgent reads params.data.appContext.AdditionalContext.Form
  → SkipAPIRequest.formContext  →  Skip RequestRouter appends [FORM CONTEXT: …]
```

Two corrections to what the diagram used to claim. The record tab publishes **no** agent context today — neither `record-resource.component.ts` nor `single-record.component.ts` calls `SetAgentContext`, which is why task D1 exists; only the dashboards, search results, and the settings surfaces publish. And `explorer-app.component.ts:641` assigns `AdditionalContext: update.AgentContext` **wholesale** on an app-global snapshot.

That assignment is left alone — merging would be worse, not better. Wholesale replacement fails safe: when another surface publishes, the `Form` key disappears and Skip simply has no form context. Merging would leave one tab's form description standing while the user works in another. What the snapshot does need is identity and refreshing: it carries the entity name and record ID it was built from, so a consumer can tell which record it describes, and the record tab republishes when its tab becomes active, not only when chrome resolves. The remaining hole — two record tabs, the second never re-resolving — is then visible in the payload rather than silent.

Fallback for agents with no browser snapshot: `Get Form Composition For Entity` returns the metadata-derivable subset (relationships with L1 inclusion, L3 rules, active metadata contributions). It cannot see compiled panels and says so in its output.

## 11. Worked scenarios

| Ask | Row | Result |
|---|---|---|
| "Add a lifetime-value strip to the top of the Person form" | `Slot: before-fields`, `Presentation: bare`, `ContributionKey: skip:person-ltv`, `SortKey: 90` | Hero above Personal Identity; generated form untouched; Sales installs later and its Deals grid appears below with no regen |
| "Replace the Details panel on Order Headers with a money summary" | `Slot: before-fields`, `Presentation: bare`, `ReplacesSectionKey: details`, `ContributionKey: orders:header` | Details hides. If Orders ships a compiled panel keyed `orders:header`, it keeps the slot until the user confirms and the row gets `Precedence = incumbent + 1` |
| "Show my tickets as cards instead of a grid" on Person | `RelatedEntityID: Event Order Lines`, `RelatedJoinField: PersonID`, `Slot: after-related` | Baked grid hides; cards mount; rail badge from `RowCountChanged` |
| "Put a renewal forecast on Subscriptions, in More" | `Slot: after-fields`, `Inclusion: More`, `ContributionKey: skip:renewal-forecast` | Lives in More; an L3 rule keyed `skip:renewal-forecast` can pin or suppress it |
| "Redesign the whole Applications form" | `EntityFormOverride` as today | Whole-form path, now with slots so other contributions still land in position |

## 12. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Equal-precedence tie between a row and a compiled panel with the same key | Compiled wins. Rows outrank only with strictly higher `Precedence`; the apply flow sets `incumbent + 1` on confirmation. Skip never sets precedence |
| 2 | `MJ: Components.Type` for panel components | `Widget` with `componentRole: 'form-panel'`. Whole forms stay `Form` |
| 2a | How the engine scopes its Component load | **Referenced components only**: `Type='Form' OR ID IN (SELECT ComponentID FROM vwEntityFormContributions)`. Not `Type IN ('Form','Widget')` — `Widget` is an open set that grows independently of this feature and is cached to local storage on every boot. Cost: a contribution write invalidates the component cache too |
| 3 | OpenApps shipping `Scope='Global'` React contributions via `mj sync` without a promotion gate | Acceptable, with mechanism. Installing the package is the gate, as for compiled panels; additionally, no write path may place a Global contribution on an identity entity, and an instance-level kill switch disables metadata contributions wholesale. L3 can suppress per site. The argument is written out in §16 rather than asserted |
| 4 | `replacesSectionKey` against custom forms whose section keys are not CodeGen's | Validate, do not restrict: apply-time snapshot check with an extra-pane fallback, render-time diagnostic and Form Studio badge, prompt limited to `[FORM CONTEXT]` keys |
| 5 | Snapshot transport to Skip | Full composition on every message, merged into `AdditionalContext` and stamped with the entity and record it describes |
| 6 | The new last-wins column collides with `EntityFormOverride.Priority`, which sorts ascending | Name it `Precedence` (higher wins). Override semantics are untouched; unifying them stays a deferred PR, so no shipped resolution changes |
| 7 | Five compiled panels register `slot: 'header'`, a slot absent from `FormPanelSlot`, and have never rendered | Add `presentation` to the compiled registration metadata bag and migrate the five to `slot: 'before-fields'`, `presentation: 'bare'`, with real contribution keys. Both sources then express hero-ness identically, which is what replaces the `contributionKey === 'header'` guess. Accepted consequence: five panels that render nothing today begin to appear |
| 8 | `Validate` may be asynchronous | The host awaits it and `BaseFormPanel.validate()` returns `ValidationResult \| Promise<ValidationResult>`. A synchronous-only contract would let an `async` validator's Promise fail an `'isValid' in result` test and save an invalid record silently. `BaseFormComponent.Validate()` keeps its synchronous signature — it is published API — and a new `ValidateAsync()` is what `Save()` calls |
| 9 | First paint on a cold engine | Gate contribution rendering on engine readiness with a bounded wait, rather than accepting a visible pop-in. A `bare` hero with `replacesSectionKey` would otherwise show the baked Details panel and then remove it — the flagship scenario in §11 |

## 13. Phasing

| Phase | Delivers | Depends on |
|---|---|---|
| **A. Contract + runtime** | `'form-panel'` role and types; `EntityFormContribution` migration + CodeGen; engine load; merged collector with memo and tie-break; `InteractiveFormPanelComponent`; slot host mount; container wiring; composition snapshot; panel validation; interactive-form slots; **repair of the eleven loosely-named registrations and the five dead `header` panels**; kill switch | — |
| **B. Apply path** | Action family; artifact-viewer detection, preview, and button; `ApplyContribution`; `mj sync` directory; **the integration bundle** | A |
| **C. Skip-Brain** | Intent branch; panel contract prompt; commitment; gates; `[FORM CONTEXT]` intake | A (contract only) |
| **D. Context** | Snapshot publication from the record tab; `SkipProxyAgent` → `formContext`; fallback action | A |
| **E. Parity** | Form Builder `Intent.Kind`; Form Studio contributions list; Component Studio scaffold | B |

A and C proceed in parallel once the contract types land. D ships before the feature is turned on for users; without it Skip's output lands in a plausible place rather than the right one. The integration bundle and §16 land with D, before the feature is enabled. E gets its own implementation plan after B.

**Blockers before Phase A opens** (from the PR #4311 review): the component-load filter is settled as reference-scoped (decision 2a) and still needs a load-size measurement on a representative database; the eleven loose registrations are repaired in the same task that makes matching strict; and the column ships as `Precedence`, not `Priority`.

## 14. Cleanups folded in and deferred

From the architecture audit that preceded this design:

**Folded into Phase A** — strict entity matching shared by slot host and composer, **with the eleven registrations it would otherwise break repaired in the same task**; memoized registration collection (the `formContext` getter currently rescans `ClassFactory` on every change-detection pass); `BaseFormPanel.validate()` actually called on save; hero-ness expressed by `presentation` on both sources; the five dead `slot: 'header'` panels migrated; interactive whole-form emits slots.

Two corrections to how the audit stated the last item. The convention in the codebase is `slot: 'header'`, not `contributionKey === 'header'` — `'header'` is not a member of `FormPanelSlot`, `FormSlotCoordinator.resolveSlot('header')` returns `null`, and no `Slot="header"` host exists anywhere, so all five `*-header.panel.ts` panels have never rendered. The container's `contributionKey === 'header'` check is a separate guess about which contribution is a hero, and it never fires for those five because they set no contribution key. Both are replaced by `presentation`.

Also corrected: the eleven loosely-named registrations are not only a future problem. The container already matches entity names strictly, so those panels' `inclusion`, `sortKey`, and `chromeGroup` are ignored by the chrome rail **today** while the slot host still mounts them. Repairing the names fixes that live defect as a side effect; it is called out here so it is not mistaken for new behavior introduced by this feature.

**Deferred (separate PRs)** — `EntityFormOverride.Configuration` carrying `EntityFormConfig` so a whole-form can opt out of fill-in grids; `form-role-contract.md` telling Skip not to hand-draw related tables; unifying `EntityFormOverride.Priority`'s ascending sort with the descending `Precedence` semantics; docblock drift in `CreateInteractiveFormAction` and `FormResolverService`; lazy `Specification` loading in the engine; `ApplicationID` scope; a nullable `EntityID` for wildcard rows.

## 15. Risks

- **Registration cache correctness.** The memo must invalidate on engine emissions and on late compiled registrations (lazy-loaded OpenApp modules). Key the cache on the provider, the ClassFactory registration count, and the engine version. Omitting the provider collides across two providers holding the same entity name for the same user.
- **Engine readiness and layout shift.** The collector is synchronous; the engine loads asynchronously. Explorer is covered — `FormResolverService` awaits `InteractiveFormsEngine.Config` before the form is created — but dialogs, slide-ins, and the dashboard quick-edit reuse that `BaseFormPanel` advertises do not all go through the resolver. On those paths a cold render would show class contributions first and rows a tick later; for a `bare` hero with `replacesSectionKey` that means the baked Details panel renders and then disappears. Contribution rendering therefore waits on a readiness flag with a bounded timeout, and falls back to rendering class contributions only if the wait expires (decision 9).
- **Prompt drift.** Two role contracts now share rules. Keep the shared invariants in one include (`form-shared-invariants.md`) if they diverge more than once.
- **Snapshot staleness.** The snapshot reflects the last chrome resolve, and `AdditionalContext` is app-global and replaced wholesale by whichever surface published last. Two record tabs are the exposed case: the second describes itself only when its chrome resolves. The snapshot therefore carries the entity and record ID it was built from, and the record tab republishes on tab activation.
- **Component cache coupling.** Reference-scoped component loading (decision 2a) means the component cache is only correct if a contribution write invalidates it. A missed invalidation renders as "panel spec not found" rather than as stale data, which is at least loud.

## 16. Security

Decision 3 deserves an argument rather than an assertion, because the analogy to compiled panels is weaker than it first appears. A compiled panel is reviewed code inside a package build; a metadata row is JSON that places a runtime-interpreted React spec onto an entity's form, potentially for every user. The action layer has a real clamp — agents write `Scope='User'` only — but `mj sync` bypasses actions entirely, and that is the path an OpenApp uses.

The posture, and what enforces it:

| Concern | Control |
|---|---|
| An installed package silently changes a form for all users | Accepted, and the same trust decision as installing the package's compiled panels. Global rows are listed in Form Studio with their source package, and L3 `MJ: Form Chrome Rules` suppress one per site without touching the package |
| A contribution lands on an identity or authorization surface | Refused at every write path — action family and `mj sync` alike — for `MJ: Users`, `MJ: Roles`, `MJ: User Roles`, `MJ: Authorizations`, and `MJ: Auth*` entities at `Global` or `Role` scope. A user may still place one on their own form at `User` scope |
| An agent escalates its own contribution to everyone | The existing clamp: agents write `User` scope; `Global` and `Role` remain human acts through Form Studio |
| A panel reads or exfiltrates more than it should | Unchanged from the whole-form path — the spec runs in the same React runtime, under the same user's permissions, and a panel that queries anything does so through `utilities.rv.RunView` as that user |
| The feature itself misbehaves in production | The kill switch below |

**Kill switch.** An instance-level configuration flag disables metadata contributions wholesale: the collector returns class registrations only, the engine skips the contribution load, and forms render exactly as they do today. This is the rollback path for a bad engine load, a runaway contribution, or a rendering regression, and it needs no migration to exercise. It is the answer to "what do we turn off at 2am", which the first draft did not have.

Accessibility is a security-adjacent gap that the first draft also missed entirely: the contract's hard rules (§7) now cover headings, labels, focus order, and keyboard reachability, and a bare hero — which sits outside the rail and therefore outside the rail's keyboard path — carries its own landmark.
