# Run-Time / Interactive Forms

**Status:** Proposal — for team review
**Date:** 2026-05-15
**Branch:** `an-interactive-forms-plan`
**Supersedes:** PR #1564 (closed)

---

## TL;DR

**Make MJ entity forms something that can be spun up, modified, and replaced at runtime — by users, by in-app AI, and by external agents like Skip — without an Angular build.**

Today every form is either CodeGen-generated or hand-coded Angular shipped in a build. We add a third type: an MJ Component renders the form. Because Components are already runtime artifacts (versioned, permissioned, registry-aware, AI-authorable), this immediately gives us:

- **Runtime form creation** — a new form for an entity exists the moment a row is written, no deploy.
- **In-app AI authoring** — a user inside MJ Explorer says "build me a Tax Return form that highlights overdue items" and gets one.
- **Agent-generated forms** — Skip (or any MJ agent) generates a form for an end user as part of a task, the same way it generates reports and dashboards today.
- **Per-user / per-role / per-org variants** — same entity, different forms, resolved at view time by scope and priority.

Mechanically: one new bridge table (`EntityFormOverride`) pointing at an existing `Component`, a resolver wedge in `SingleRecordComponent.LoadForm`, an Angular wrapper that owns BaseEntity lifecycle, and a thin "form-role contract" added to `@memberjunction/interactivecomponents` so any component knows how to act like a form.

Forms only. Dashboards already cover this surface via `dashboard-viewer`'s `ArtifactPanelRenderer`. Not duplicating.

PR #1564 attempted similar ground but conflated forms and dashboards, duplicated artifact/component infrastructure, and broke the React/Angular layering. This plan is a smaller, runtime/AI-first cut.

---

## Why now

### The business goal

Forms are the highest-traffic UI surface in any MJ app, and they are currently the *least* dynamic thing in the platform. We can already spin up:

- Reports at runtime (Skip generates them on demand).
- Dashboards at runtime (artifacts hosted in `dashboard-viewer`).
- Queries, views, components, agents — all runtime artifacts.

Forms are the holdout. Every form requires either CodeGen or an Angular build. That is:

- **A blocker for in-app AI features.** An MJ app cannot ship "click here to AI-generate a better form for this entity" because there is no runtime form substrate to write to.
- **A blocker for Skip and similar agents.** Skip can give a user a report or a dashboard in a chat exchange. It cannot give them a form, because forms only exist as compiled Angular.
- **A blocker for per-customer / per-role customization.** Every variant today is either a runtime conditional inside one Angular form or a code branch. Both rot fast.
- **A blocker for citizen development.** A power user with a clear idea of how their team's Customer form should look has no path to ship it short of asking engineering.

### What unlocks once forms are runtime artifacts

- An MJ app can include an "improve this form" button on any entity, backed by an in-app agent that writes a new `Component` and an `EntityFormOverride` row scoped to the user or their role.
- Skip, in a chat: *"I noticed you've been entering refund reasons manually. Want a quicker version of this form?"* → generates a Component, drops an override, the user's next visit to that entity uses it.
- An app vendor ships "stock" forms via CodeGen. A specific customer's team lead spins up their own variants without forking the codebase.
- A/B'ing form layouts becomes a metadata change, not a deploy.

### Why this approach now

The substrate exists. Interactive Components (`@memberjunction/interactivecomponents`) are mature: spec definition, compilation, runtime, registry, libraries, permissions, Component Studio, AI generation paths Skip already uses for components. The React renderer (`mj-react-component`) is in production.

The missing pieces are small and clearly bounded:

1. A **form-role contract** so any Component knows what props/events/methods to implement to act as a form.
2. A **resolver** that picks a form for `(entity, user, roles)` at runtime.
3. An **Angular wrapper** that owns the `BaseEntity` lifecycle so the React component stays pure.

That's it. Once those exist, every authoring path — manual, in-app AI, external agent — is the same code path.

---

## Goals

1. **Forms can be created, modified, and swapped at runtime.** No build, no deploy. New form = new `Component` row + new `EntityFormOverride` row.
2. **AI agents (in-app and external like Skip) can author and modify forms** by writing to a documented, narrow metadata target.
3. **Per-user, per-role, per-global scope** with priority-based resolution, transparent to callers.
4. **One contract** that hand-written, Studio-built, and agent-generated form components all target — every authoring path produces interoperable artifacts.
5. **Reuse existing Component / Artifact infrastructure** — no parallel content store, no parallel permission system.
6. **No behavior change** for entities that have no override — `@RegisterClass` and CodeGen paths continue exactly as today.

## Non-goals

- Replacing CodeGen-generated forms. They remain the default and the fallback for any entity without an override.
- Replacing `@RegisterClass` custom forms. They continue to work unchanged.
- Anything dashboard-related. `dashboard-viewer` + `ArtifactPanelRenderer` already covers that surface.
- A new permission model. We reuse Component / Artifact permissions.
- Migrating existing custom Angular forms to Interactive Forms. They keep working as-is.

---

## Architecture

### Resolution

`SingleRecordComponent.LoadForm(primaryKey, entityName)` today does one thing:

```ts
const formReg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entityName);
```

After: same call, with an override check inserted before the `ClassFactory` step.

```
1. Lookup EntityFormOverride rows for (entity, currentUser, userRoles).
   Order: scope (User > Role > Global), then Priority DESC.
   If a row resolves → instantiate InteractiveFormComponent wrapper
   with the linked ComponentID. Done.

2. Otherwise → ClassFactory.GetRegistration(BaseFormComponent, entityName).
   Code-based form wins by priority over generated form (today's behavior).
```

No change to anyone not using overrides. No change to the BaseFormComponent class hierarchy.

### Database

One new table. No changes to existing tables.

```sql
CREATE TABLE __mj.EntityFormOverride (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,        -- FK Entity
    ComponentID UNIQUEIDENTIFIER NOT NULL,     -- FK Component (existing entity)
    Name NVARCHAR(255) NOT NULL,               -- human label, e.g. "CSR Customer Form"
    Description NVARCHAR(MAX) NULL,
    Scope NVARCHAR(20) NOT NULL DEFAULT 'Global',  -- 'User' | 'Role' | 'Global'
    UserID UNIQUEIDENTIFIER NULL,              -- FK User, required iff Scope='User'
    RoleID UNIQUEIDENTIFIER NULL,              -- FK Role, required iff Scope='Role'
    Priority INT NOT NULL DEFAULT 0,           -- higher wins within a scope
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
    CONSTRAINT CK_EFO_Scope CHECK (Scope IN ('User','Role','Global')),
    CONSTRAINT CK_EFO_Scope_Consistency CHECK (
        (Scope = 'User'   AND UserID IS NOT NULL AND RoleID IS NULL) OR
        (Scope = 'Role'   AND RoleID IS NOT NULL AND UserID IS NULL) OR
        (Scope = 'Global' AND UserID IS NULL     AND RoleID IS NULL)
    ),
    CONSTRAINT CK_EFO_Status CHECK (Status IN ('Active','Inactive'))
);
```

Notes vs. the old PR's `EntityForm` table:

- **No `ComponentSpec NVARCHAR(MAX)` column.** Components live in the existing `Component` entity. We point at one, we don't duplicate it.
- **No `IsDefault`.** Within a scope, highest `Priority` wins. Ties broken by `__mj_CreatedAt DESC`.
- Per migration rules (`migrations/CLAUDE.md`): timestamp columns and FK indexes are emitted by CodeGen, not by the migration.

### The form contract (additions to `@memberjunction/interactivecomponents`)

The IC package already provides: `ComponentSpec`, `ComponentCallbacks` (`OpenEntityRecord`, `CreateSimpleNotification`, `RegisterMethod`, `NotifyEvent`), `ComponentObject` return shape (`validate`, `isDirty`, `reset`, `getCurrentDataState`, `setDataState`, `focus`, `invokeMethod`), cancelable/paired event infrastructure, `ComponentStyles`, `DataSnapshot`, `CompositeKey`.

We add a thin **form-role contract**:

**1. Role declaration on `ComponentSpec`**

```ts
componentRole?: 'form' | 'dashboard' | 'widget' | 'report' | 'detail-pane';
```

Lets the resolver validate compatibility and lets agents target the right shape.

**2. `FormHostProps` — what the host passes to a form component**

```ts
interface FormHostProps {
    entityName: string;
    primaryKey: CompositeKey | null;  // null = new record
    record: Record<string, unknown>;  // plain snapshot from BaseEntity.GetAll()
    entityMetadata: {
        fields: FieldMetadata[];
        displayName: string;
        nameField?: string;
    };
    mode: 'view' | 'edit' | 'create';
    canEdit: boolean;
    canDelete: boolean;
    canCreate: boolean;
}
```

**3. Standard event names** (declared as `ComponentEvent` entries, using existing cancelable/paired infrastructure)

| Event | Cancelable | Pair | Args |
|---|---|---|---|
| `BeforeSave` | yes | `AfterSave` | `{ dirtyFields: Record<string, unknown> }` |
| `AfterSave` | no | — | `{ success, errorMessage?, durationMs }` |
| `BeforeDelete` | yes | `AfterDelete` | `{}` |
| `AfterDelete` | no | — | `{ success, errorMessage?, durationMs }` |
| `EditModeChangeRequested` | yes | — | `{ requestedMode: 'view' \| 'edit' }` |
| `FieldChanged` | no | — | `{ fieldName, oldValue, newValue }` |
| `DirtyStateChanged` | no | — | `{ isDirty, dirtyFieldCount }` |
| `ValidationChanged` | no | — | `{ isValid, errors }` |

**4. Standard host-callable methods** (component registers via `RegisterMethod`)

| Method | Purpose |
|---|---|
| `RequestSave()` | Host (toolbar) asks the form to start its save flow. Form fires `BeforeSave`. |
| `RequestCancel()` | Discard edits. Form fires `EditModeChangeRequested` → 'view'. |
| `SetEditMode(mode)` | Host pushes a mode change (e.g. after entering edit via the toolbar). |
| `GetFieldValue(name)` / `SetFieldValue(name, value)` | Host pushes a field update from a sidebar / related panel. |

`validate()` and `isDirty()` already exist on `ComponentObject` — reused, not duplicated.

**5. A `forms` subpath export**

```ts
import {
    FormHostProps, FormEvents, FormMethods,
    isFormRole, buildFormHostProps,
} from '@memberjunction/interactivecomponents/forms';
```

Keeps the generic IC package clean; gives form authors and the agent one import.

### Angular: `InteractiveFormComponent`

A wrapper that **extends `BaseFormComponent`** and renders an `<mj-react-component>` inside.

**Owns:**

- The `BaseEntity` for the record.
- Loading via `Metadata.GetEntityObject + InnerLoad` (delegated to BaseFormComponent's standard flow).
- Translating IC events into entity operations:
    - `BeforeSave` → apply dirty-field diff to the BaseEntity → `await record.Save()` → emit `AfterSave` with `success` + `LatestResult?.CompleteMessage`.
    - `BeforeDelete` → `await record.Delete()` → emit `AfterDelete`.
    - `EditModeChangeRequested` → calls inherited `StartEditMode` / `EndEditMode`, fires the After leg.
- Mounting inside `<mj-record-form-container>` (per the Angular guide) so toolbar / history / tags / add-to-list panels work.
- Surfacing the entity record snapshot + metadata as `FormHostProps`.

**Does not own:**

- The React component's internal state (dirty tracking, validation UI, layout).
- Any "form business logic" — that's in the component.

### Layering — what's in React vs Angular

| Concern | Angular (`InteractiveFormComponent`) | React (the IC) |
|---|---|---|
| `BaseEntity` instance | yes | never |
| `record.Save()` / `.Delete()` | yes | never |
| Routing & navigation | yes (via `OpenEntityRecord` callback + router) | requests only |
| Toolbar / history / tags panels | yes (via `mj-record-form-container`) | not visible |
| Field rendering & layout | no | yes |
| Local form state, input control | no | yes |
| Validation (UX) | no | yes |
| Reading related data, dropdowns, charts | n/a | yes (`SimpleRunView`, `SimpleMetadata`, etc.) |
| AI tool calls | n/a | yes (`SimpleAITools`) |
| Recent-access logging, cache invalidation | yes (inherited from BaseFormComponent) | no |

The React layer is **not** locked out of MJ data. It can `RunView`, fetch related records, call AI tools, render charts. It just does not own the lifecycle of the record being edited — same separation as React Hook Form or Formik vs the persistence layer underneath.

---

## Authoring paths

Three ways to produce a form, all interoperable, all targeting the same contract. The headline value is #1 and #2 — those are what make this a runtime feature rather than just "another way to write forms." Manual authoring (#3) is mostly the dogfooding path that proves the contract.

### 1. AI agents — the primary use case

**In-app AI authoring.** An MJ app surfaces "improve this form" / "generate a form for this entity" UI on any entity. Backed by an agent (running inside MJAPI or as a tool call) that:

- Reads the entity schema (fields, types, FKs, value lists, descriptions, related entities).
- Optionally takes natural-language requirements ("highlight overdue invoices, group financial fields, hide internal-only fields").
- Optionally reads the user's existing variants (modification flow).
- Emits a `ComponentSpec` that satisfies the form contract.
- Writes the `Component` row + a scoped `EntityFormOverride`.
- The user's next visit to that entity renders the new form.

**External agents (Skip and similar).** Skip already generates components, reports, and dashboards as part of conversational tasks. Once the form contract and override table exist, generating a form is the same shape of operation: produce a `ComponentSpec` with `componentRole: 'form'`, write the rows, point the user at the entity. No new integration surface on Skip's side beyond "write a `Component` and an `EntityFormOverride`."

**Symmetry across agents.** Because all agents write through the same contract, a form generated by Skip can be modified by an in-app agent or edited in Studio, and vice versa. There is no "Skip form" vs "MJ form" — they're all just Components.

### 2. Component Studio with a "Form" mode — citizen development

Extend the existing Component Studio with form-aware affordances:

- "New Form Component" entry point that pre-fills `componentRole: 'form'`, scaffolds `FormHostProps` usage, and lists the entity's fields as draggable primitives.
- A field-binding inspector so dropping `<TextInput>` onto the canvas pre-wires it to `record[fieldName]` with the right type.
- Save → creates/updates the underlying `Component` **and** offers to create/update the `EntityFormOverride` row.
- Live preview pane renders the component against a real record (using the same `InteractiveFormComponent` wrapper) so what you build is what users see.
- "Open in chat" → hands the current Component to an in-app agent for AI-driven modification.

This is the citizen-developer / power-user path, and the human override / fix-up path when an AI-generated form needs adjustment.

### 3. mj-sync (metadata-file authoring) — for development and bootstrapping

Hand-author a Component spec in `.json` next to a `.tsx` code file under `metadata/components/`. `mj sync push` creates the `Component` row. A second metadata file under `metadata/entity-form-overrides/` creates the override.

Smallest possible authoring surface — used internally for dogfooding the contract, for any forms shipped with MJ itself, and for tests/fixtures.

---

## Resolver pseudocode

```ts
async function resolveFormForEntity(
    entity: EntityInfo,
    user: UserInfo,
    provider: IMetadataProvider,
): Promise<FormResolution> {
    const rv = new RunView();
    const userRoleIds = user.UserRoles?.map(r => r.RoleID) ?? [];

    const { Success, Results } = await rv.RunView<EntityFormOverrideEntity>({
        EntityName: 'Entity Form Overrides',
        ExtraFilter: `
            EntityID='${entity.ID}' AND Status='Active' AND (
                (Scope='User'   AND UserID='${user.ID}') OR
                (Scope='Role'   AND RoleID IN (${userRoleIds.map(id => `'${id}'`).join(',') || "''"})) OR
                (Scope='Global')
            )`.trim(),
        OrderBy: `
            CASE Scope WHEN 'User' THEN 1 WHEN 'Role' THEN 2 ELSE 3 END,
            Priority DESC,
            __mj_CreatedAt DESC`.trim(),
        ResultType: 'entity_object',
    }, user);

    if (Success && Results?.length) {
        return { kind: 'interactive', override: Results[0] };
    }

    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(BaseFormComponent, entity.Name);
    return reg
        ? { kind: 'class', subClass: reg.SubClass }
        : { kind: 'none' };
}
```

Notes:

- We use `EntityByName` via `provider`, not `md.Entities.find()`.
- UUID-only string interpolation; no user-supplied content reaches `ExtraFilter`. Acceptable security posture for an internal admin-scoped query — but we should still consider a parameterized query helper as a follow-up.
- Results cap and ordering let us early-exit on the first match.

---

## Migration

Single migration in `migrations/v5/`:

- Create `EntityFormOverride` table per the schema above.
- Extended-property descriptions on table and each column.
- **No** index creation, **no** `__mj_*` timestamp columns — CodeGen handles those.

CodeGen run afterwards produces:

- `EntityFormOverrideEntity` typed class.
- View, sp_Create/Update/Delete, EntityField metadata.

No data seeded in the migration. EntityFormOverride rows are authored via `mj-sync` (Studio later).

---

## Phasing

| Phase | What ships | Approx scope |
|---|---|---|
| **A. Form contract** | `componentRole` on `ComponentSpec`; `FormHostProps`, event/method name constants, helper builders in `@memberjunction/interactivecomponents/forms`; documented. | 1–2 days. Foundation — every authoring path targets this. |
| **B. Runtime substrate** | `EntityFormOverride` migration + CodeGen run; `InteractiveFormComponent` wrapper (owns BaseEntity lifecycle); resolver in `SingleRecordComponent.LoadForm`; mj-sync metadata + worked example for one entity. | ~1 week. Forms become runtime artifacts. |
| **C. AI authoring** | In-app Form Manager agent (creates / modifies a form Component + override from entity schema + NL requirements). Skip integration — Skip emits the same artifact shape. Shared prompt + contract definitions so in-app and external agents agree. | Separate PR(s) after B. **This is where the headline business value lands.** |
| **D. Form Studio** | Component Studio "form mode" — entity-aware scaffolding, field-binding inspector, live preview, override row creation, "open in chat" handoff to the agent. | Separate PR after B; can overlap with C. |

This branch / PR is **Phase A + Phase B** — the runtime substrate. C is the AI authoring story (in-app + Skip), D is the citizen-developer authoring story. C and D can run in parallel once B merges.

The contract (Phase A) is the deliberate pivot point: lock the shape of `FormHostProps` + events + methods early so C, D, and any future authoring tool are all writing to the same target.

---

## Risks and decisions

### Decided

- **One override table, not extending `EntitySettings`.** Cleaner, scoped queries, no schema-shoehorning. (Q1 → option 1)
- **Scope precedence: User > Role > Global, then Priority DESC, then CreatedAt DESC.** Matches `DashboardUserPreference` mental model. (Q2 → option 1)
- **No `IsDefault`.** Highest Priority wins. Simpler.
- **No `ComponentSpec` column on the override table.** Point at a `Component`. Avoids duplicating versioning, sharing, and the Studio editing surface.
- **Layering: React never touches `BaseEntity`.** Saves go through `BeforeSave` → wrapper → entity ops. Keeps the React contract portable and avoids the `.Set()` stringly-typed trap.
- **Dashboards are out of scope.** `dashboard-viewer` + `ArtifactPanelRenderer` already gives us interactive dashboards.

### Open / for team review

1. **Per-application scope.** Q2 mentioned a possible `App` scope layer (same entity, different form inside App A vs App B). Punted for v1. Add when there's demand; the table can grow an `ApplicationID NULL` column and the resolver can grow a tier without breaking existing rows.
2. **Tie-breaker policy.** Two Global overrides at Priority 100. Currently we fall back to `__mj_CreatedAt DESC`. Acceptable, but worth confirming.
3. **Cross-tenant components.** If a Component is registry-hosted at `@MJ/...`, the override row points at a local Component that wraps/imports it. We're not changing component loading semantics.
4. **Conflict between an override and a `@RegisterClass` custom form.** Override wins (resolution order above). This is intentional — overrides are explicit, code-based registrations are implicit. Worth a doc callout so app developers aren't surprised.
5. **Performance.** Resolver fires one RunView per `LoadForm` call. For an active user it'll be cached. If we see contention we can pre-load the user's effective override set at login (similar to permissions).
6. **AI-component code review.** Agent-generated form code lands in the `Component` table without human review. Studio preview helps. A "Pending" status on `EntityFormOverride` that requires explicit activation would address this — already in the `Status` enum (`Active`/`Inactive`); we could add `Pending` if it matters.

---

## Files this PR will add or touch (Phase A + B)

### New

- `migrations/v5/V<timestamp>__v<version>_Interactive_Forms.sql`
- `packages/InteractiveComponents/src/forms/index.ts` (subpath export)
- `packages/InteractiveComponents/src/forms/form-host-props.ts`
- `packages/InteractiveComponents/src/forms/form-event-names.ts`
- `packages/InteractiveComponents/src/forms/form-method-names.ts`
- `packages/Angular/Explorer/base-forms/src/lib/interactive-form/interactive-form.component.ts`
- `packages/Angular/Explorer/explorer-core/src/lib/services/form-resolver.service.ts`
- `metadata/components/<example-form>/...` (one worked example)
- `metadata/entity-form-overrides/.mj-sync.json` and one example override

### Modified

- `packages/InteractiveComponents/src/component-spec.ts` — add `componentRole`.
- `packages/InteractiveComponents/src/index.ts` — re-export role enum (not the `forms/*` subpath, which stays explicit).
- `packages/InteractiveComponents/package.json` — declare `./forms` subpath export.
- `packages/Angular/Explorer/base-forms/src/module.ts` — register `InteractiveFormComponent`.
- `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.ts` — call resolver before falling through to `ClassFactory`.

### Tests

- Resolver: scope precedence, role membership, priority tie-breaks, missing override falls through.
- Wrapper: BeforeSave applies diff, Save failure surfaces `CompleteMessage`, mode transitions, delete confirmation, cancelable events honor `cancel`.
- Contract: a fixture component conforming to `FormHostProps` mounts and round-trips a save.

---

## What's not in this PR

- AI authoring — in-app Form Manager agent and Skip integration (Phase C).
- Form Studio with drag-and-drop (Phase D).
- Per-application scope.
- A migration tool to import existing `@RegisterClass` forms into Interactive Forms. They keep working as-is.
- Any change to dashboards.

---

## Open questions for the team

1. **Naming.** "Run-Time / Interactive Forms" is the working title. Does "Interactive Forms" overload the IC term too much? Alternatives: "Runtime Forms," "Component-backed Forms," "Dynamic Forms."
2. **Skip integration boundary.** Skip already produces Components. Once the form contract exists, Skip writing a form is "produce a `Component` + write an `EntityFormOverride`." Is that the right integration shape, or does Skip want a higher-level "create form for entity X" tool that wraps both writes?
3. **Approval workflow for AI-generated forms.** Should overrides start in a `Pending` status (require human activation) when authored by an agent, vs `Active` immediately when authored by a human in Studio? Or always `Active` and rely on scope (only the requesting user sees their own variant until they explicitly broaden scope)?
4. **Day-one entities to prove out.** What 2–3 entities and form patterns should we target with the example form(s) shipped in Phase B, so the contract is exercised against realistic shapes before Phase C agents start writing to it?
5. **Implementation branch.** Plan PR is `an-interactive-forms-plan`. Implementation will move to `an-interactive-forms` — preferences?
