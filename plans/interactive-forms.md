# Interactive Forms

**Status:** Proposal — for team review
**Date:** 2026-05-15
**Branch:** `an-interactive-forms-plan`
**Supersedes:** PR #1564 (closed)

---

## TL;DR

Let MJ entity forms be backed by an Interactive Component, in addition to today's CodeGen-generated and `@RegisterClass` code-based forms. The component is just a regular MJ Component — same authoring tools, same versioning, same permissions, same registry. A small metadata bridge (`EntityFormOverride`) lets us point any entity at a component with user / role / global scope and priority-based resolution.

This is forms only. Dashboards already have this capability via the artifact part in `dashboard-viewer`; we are not duplicating that.

PR #1564 attempted the same idea but conflated forms and dashboards, duplicated artifact/component infrastructure, and introduced typing/layering violations. This plan is a cleaner, smaller cut.

---

## Why now

### Business problem

Today, the only ways to customize an MJ entity form are:

1. Let CodeGen generate it from metadata (no real customization).
2. Hand-write an Angular component, register it with `@RegisterClass`, and ship a build.

Option 2 is the only path to a non-default UI, and it has a high bar: TypeScript, Angular, build pipeline, deployment. Non-developers cannot do it. AI agents cannot do it (no schema they can write into). Per-customer or per-role variants require code branches or feature flags.

What customers actually want, and what MJ apps built on top of MJ would benefit from:

- **Per-role variants.** A CSR's Customer form is not a sales rep's Customer form. Today this requires runtime conditional rendering inside one monolithic form.
- **Per-customer overrides without forks.** Acme's "Tax Return" entity needs three custom panels Beta Corp does not. Today: branched code or feature flags.
- **Citizen development.** A power user wants to add a section, reorder fields, embed a chart. No path today.
- **AI-generated forms.** "Build me a form for entity X that highlights overdue invoices." No metadata target exists.

### Why this approach

MJ already has the substrate. Interactive Components (`@memberjunction/interactivecomponents`) are mature: spec definition, compilation, runtime, registry, libraries, permissions, Component Studio. Components ship as artifacts with versioning. The React renderer (`mj-react-component`) is in production.

The missing piece is a thin contract that says "here is how a Component plays the form role," plus a resolver that picks one for a given entity + user + role.

---

## Goals

1. **Make a Component swappable into the form slot** for any entity, without code changes to the host app.
2. **Per-user, per-role, per-global scope** with priority-based resolution, transparent to callers.
3. **No behavior change** for entities that have no override — `@RegisterClass` and CodeGen paths continue exactly as today.
4. **One contract** that hand-written, Studio-built, and agent-generated form components all target.
5. **Reuse Component / Artifact infrastructure** — no parallel content store for form definitions.

## Non-goals

- Replacing CodeGen-generated forms. They remain the default and the fallback.
- Replacing `@RegisterClass` custom forms. They continue to work unchanged.
- Anything dashboard-related. `dashboard-viewer` + `ArtifactPanelRenderer` already covers that surface.
- A new permission model. We reuse Component / Artifact permissions.

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

Three ways to produce a form component, all interoperable, all targeting the same contract:

### 1. mj-sync (metadata-file authoring) — v1

Hand-author a Component spec in a `.json` next to a `.tsx` code file under `metadata/components/`. `mj sync push` creates the `Component` row. A second metadata file under `metadata/entity-form-overrides/` creates the `EntityFormOverride` row pointing at it.

Smallest path to ship. Used internally for dogfooding and for migrating any existing "custom form" needs that today require Angular code.

### 2. Component Studio with a "Form" mode — v1

Extend the existing Component Studio with form-aware affordances:

- "New Form Component" entry point that pre-fills `componentRole: 'form'`, scaffolds `FormHostProps` usage, and lists the entity's fields as draggable primitives.
- A field-binding inspector so dropping `<TextInput>` onto the canvas pre-wires it to `record[fieldName]` with the right type.
- Save → creates/updates the underlying Component **and** offers to create/update the EntityFormOverride row.
- Preview pane renders the component against a real record (using the same `InteractiveFormComponent` wrapper) so what you build is what users see.

This is the citizen-developer story.

### 3. Form Manager agent — v1 stretch

An agent that reads:

- Entity schema (fields, types, FKs, value lists, descriptions).
- Optional natural-language requirements ("emphasize the renewal date, hide internal fields, group financials").
- Optional existing component (when modifying rather than creating).

…and produces a `ComponentSpec` satisfying the form contract, plus an `EntityFormOverride` row. Symmetric with Studio: components produced by the agent can be opened in Studio for further editing, and Studio-built components can be modified by the agent.

This is straightforward once the contract is locked because the contract is the API.

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
| **A. Contract** | `componentRole` on `ComponentSpec`; `FormHostProps`, event/method name constants, helper builders in `@memberjunction/interactivecomponents/forms`; documented. | 1–2 days. Foundation. |
| **B. Plumbing** | Migration + CodeGen run; `InteractiveFormComponent` wrapper; resolver in `SingleRecordComponent.LoadForm`; mj-sync metadata directory + worked example for one entity. | ~1 week. Feature lights up end-to-end. |
| **C. Form Studio** | Component Studio "form mode": entity-aware scaffolding, field-binding inspector, live preview, override row creation. | Separate PR after B. |
| **D. Form Manager agent** | Agent that creates or modifies a form component + override row from entity schema + NL requirements. | Separate PR after B; can overlap with C. |

This branch / PR is **Phase A + Phase B**. C and D follow in their own PRs and can run in parallel after B merges.

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

- Component Studio form mode (Phase C).
- Form Manager agent (Phase D).
- Per-application scope.
- A migration tool to import existing `@RegisterClass` forms into Interactive forms. They keep working as-is.
- Any change to dashboards.

---

## Open questions for the team

1. Branch name `an-interactive-forms-plan` is fine for the plan PR. Implementation work will move to `an-interactive-forms` after plan approval — preference?
2. Does "Interactive Forms" overload the term too much (since "Interactive Components" is already a thing)? Alternatives: "Component-backed Forms," "Component Forms," "Form Components." Naming feedback welcome.
3. Should override authoring require an "Owner" / approval workflow (like RecordChanges has audit), or rely on Component / Artifact permissions only?
4. Anything we should prove out before locking the contract — particular entities, particular form patterns we want this to handle on day one?
