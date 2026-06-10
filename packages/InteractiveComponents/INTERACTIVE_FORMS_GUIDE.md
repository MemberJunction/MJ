# Interactive Forms Guide

How MemberJunction renders **runtime-authored entity forms** — forms created, modified,
versioned, and activated without an Angular build — and the **form-role contract** in this
package that every such form targets.

> **Scope of this guide:** the component-side contract (the `/forms` subpath of
> `@memberjunction/interactive-component-types`) plus the runtime substrate built on it
> (override resolution, versioning lifecycle, agent actions, authoring surfaces).
> For how forms render across MJ surfaces in general — tabs, dialogs, slide-ins,
> `EntityFormConfig`, custom `*Extended` forms — read the repo-level
> **[Forms Architecture Guide](../../guides/FORMS_ARCHITECTURE_GUIDE.md)** first.

---

## 1. The big picture

MJ has three kinds of entity forms, resolved in priority order by
`FormResolverService.ResolveFormForEntity()` (in `@memberjunction/ng-base-forms`):

| Kind | What it is | When it wins |
|---|---|---|
| **interactive** | A runtime `Component` (React) bound through an `EntityFormOverride` row | An **Active**, User/Role/Global-scoped override exists for the entity |
| **class** | The CodeGen-generated Angular form, or a custom `*Extended` form via `@RegisterClass` | No active override |
| **none** | Nothing registered | Host shows an error |

An *interactive form* is just an MJ Component whose spec declares `componentRole: 'form'`.
Because Components are already runtime artifacts — versioned, permissioned, AI-authorable —
this gives MJ runtime form creation for free:

- **No deploy.** A new form exists the moment a `Component` + `EntityFormOverride` row are written.
- **AI authoring.** The Form Builder agent (a Sage sub-agent) and Skip can emit form-role
  ComponentSpecs; users apply them with one click.
- **Per-user / per-role / per-org variants.** Same entity, different forms, resolved by scope and priority.
- **Versioning + one-click revert.** Every modification is a new `Component` version; history is never deleted.

CodeGen forms remain the default and the fallback — entities without an override behave exactly as before.

---

## 2. The form-role contract (`/forms` subpath)

```typescript
import {
    FormHostProps, FormMode, FormEntityMetadata,
    FormEventNames, FormMethodNames,
    isFormRole, getDeclaredFormEntityName,
    buildCuratedFormSchema, buildDefaultFormScaffold, buildFixtureFormHostProps,
} from '@memberjunction/interactive-component-types/forms';
```

Hand-written, Form Builder-built, and agent-generated form components all target this one
contract — every authoring path produces interoperable artifacts.

### 2.1 The layering invariant (the most important rule)

**The React component never touches `BaseEntity`, `Metadata`, or `RunView` for the record
being edited.** It operates against a plain snapshot (`FormHostProps.record`). When it wants
to commit, it fires `BeforeSave` with a dirty-field diff; the Angular host applies the diff
to the real `BaseEntity` and calls `record.Save()`. This keeps the React contract portable
and avoids the stringly-typed `.Set()` trap.

The React layer is *not* locked out of MJ data generally — it can `RunView` related records,
populate dropdowns, call AI tools via `ComponentUtilities`. It just doesn't own the lifecycle
of the record being edited.

| Concern | Angular host (`InteractiveFormComponent`) | React component |
|---|---|---|
| `BaseEntity` instance, `Save()` / `Delete()` | ✅ | never |
| Toolbar / History / Tags / variant picker | ✅ (via `<mj-record-form-container>`) | not visible |
| Field rendering, layout, local state, validation UX | — | ✅ |
| Related data, dropdowns, charts, AI calls | — | ✅ (`SimpleRunView`, `SimpleAITools`, …) |

### 2.2 `FormHostProps` — what the host passes the component

```typescript
interface FormHostProps {
    entityName: string;
    /** Composite-key field values as a plain object, or null for new records. */
    primaryKey: Record<string, unknown> | null;
    /** Plain snapshot of the record (BaseEntity.GetAll() result). */
    record: Record<string, unknown>;
    entityMetadata: FormEntityMetadata;   // { fields, displayName, nameField? }
    mode: 'view' | 'edit' | 'create';     // FormMode
    canEdit: boolean;
    canDelete: boolean;
    canCreate: boolean;
}
```

Plain data only — `primaryKey` is a serialized object, not a `CompositeKey` instance; the
Angular wrapper reconstructs one when it needs to load or save.

### 2.3 Standard events (component → host, via `callbacks.NotifyEvent`)

All names exported as `FormEventNames.*` constants; typed args interfaces accompany each.

| Event | Cancelable | Args |
|---|---|---|
| `BeforeSave` | yes (pairs with `AfterSave`) | `{ dirtyFields: Record<string, unknown> }` |
| `AfterSave` | no | `AfterEventArgs` + optional post-save `record` snapshot |
| `BeforeDelete` | yes (pairs with `AfterDelete`) | cancel flag only |
| `AfterDelete` | no | `AfterEventArgs` |
| `EditModeChangeRequested` | yes | `{ requestedMode: 'view' \| 'edit' }` |
| `FieldChanged` | no | `{ fieldName, oldValue, newValue }` |
| `DirtyStateChanged` | no | `{ isDirty, dirtyFieldCount }` |
| `ValidationChanged` | no | `{ isValid, errors? }` |

### 2.4 Standard methods (host → component, registered via `callbacks.RegisterMethod`)

`RequestSave` and `RequestCancel` are the minimum useful set.

| Method (`FormMethodNames.*`) | Purpose |
|---|---|
| `RequestSave` | Toolbar asks the form to start its save flow → form fires `BeforeSave` |
| `RequestCancel` | Discard edits → form fires `EditModeChangeRequested` → `'view'` |
| `SetEditMode` | Host pushes a mode change |
| `GetFieldValue` / `SetFieldValue` | Host pulls/pushes a single field (sidebars, related panels) |

`validate()` and `isDirty()` already exist on `ComponentObject` — reused, not duplicated.

### 2.5 Schema + scaffold + fixture helpers

| Export | Purpose |
|---|---|
| `buildCuratedFormSchema(entityName, provider)` / `curateFromEntityInfo(entity, provider)` | LLM-friendly, curated view of an entity's schema: FK references resolved to `{entity, displayField}`, value lists normalized to `allowedValues`, audit/virtual/computed fields stripped, types narrowed to six buckets (`string`, `number`, `boolean`, `datetime`, `enum`, `foreign-key`). Served to the Form Builder agent by the `Get Entity Schema For Form` action. |
| `buildDefaultFormScaffold(entityName, provider)` / `buildScaffoldFromEntityInfo(...)` | Deterministic (no LLM) `ComponentSpec` whose JSX mirrors the CodeGen Angular default layout — sections from `EntityField.Category` + `GeneratedFormSectionType`, 2-column grid, System section collapsed. The baseline both the agent and Form Builder's "New form" flow start from: *modify a known-good baseline, never build from zero*. |
| `buildFixtureFormHostProps(schema, mode?)` | Synthesizes stable, type-appropriate fixture values so a form can live-preview with no real record (Component Studio preview; artifact-viewer fallback when an entity is unresolvable or empty). |
| `getDeclaredFormEntityName(spec)` | The one rule for "which entity does this form bind to": `spec.entityName`, else `spec.dataRequirements.entities[0].name`, else `null`. Used by every form-role consumer so they all agree. |
| `isFormRole(spec)` | Type-guard for `componentRole === 'form'`. |

---

## 3. The runtime substrate

### 3.1 `EntityFormOverride` (entity name: **`MJ: Entity Form Overrides`**)

One bridge table (migration `migrations/v5/V202605242025__v5.38.x__Interactive_Forms.sql`)
pointing an entity at a `Component`:

- `EntityID`, `ComponentID`, `Name`, `Description`, `Notes`
- `Scope`: `'User' | 'Role' | 'Global'` with a CHECK enforcing `UserID`/`RoleID` consistency
- `Priority`: higher wins within a scope
- `Status`: `'Active' | 'Inactive' | 'Pending'`

Resolution precedence: **User > Role > Global**, then `Priority DESC`, then `__mj_CreatedAt DESC`.
There is no `ComponentSpec` column — the spec lives on the `Component` row, so versioning,
permissions, and Form Builder editing are all the existing Component machinery.

Overrides are cached in memory by `InteractiveFormsEngine` (`@memberjunction/core-entities`)
with event-driven invalidation, so resolution is an in-memory filter, not a per-open DB query.

### 3.2 Versioning lifecycle

Components version by sharing a `Name` and incrementing `VersionSequence` (semver minor bump:
`1.0.0` → `1.1.0`). The lifecycle:

| Trigger | State | Behavior |
|---|---|---|
| Create (no override yet) | n/a | Insert `Component` v1.0.0 + **Active** override |
| Modify | current Component **Active** | Insert new `Component` version + a **Pending** override pointing at it. The live Active override is untouched — user must explicitly Activate. |
| Modify | current Component **Pending** | Overwrite the Pending row **in place** (avoids piling up draft versions during chat iteration) |
| Activate | Pending exists | Atomically flip Pending → Active, prior Active → Inactive |
| Revert / Restore | n/a | Pure override `UPDATE` — re-point `ComponentID` at an older Component version. Component rows are never deleted, so revert is always reversible. |

### 3.3 The action family (`@memberjunction/core-actions`)

Seven actions in `packages/Actions/CoreActions/src/custom/interactive-forms/`, metadata in
`metadata/actions/.interactive-forms-actions.json`:

| Action | Purpose |
|---|---|
| `Get Entity Schema For Form` | Curated schema (read-only) for the agent |
| `Get Default Form Scaffold For Entity` | CodeGen-equivalent baseline spec (deterministic, no LLM) |
| `Get Active Form For Entity` | Currently-resolved override + spec + all applicable variants — lets the agent decide Create vs Modify |
| `Create Interactive Form` | Net-new only: Component v1.0.0 + Active override |
| `Modify Interactive Form` | Active → new version + Pending override; Pending → in-place overwrite |
| `Activate Interactive Form Version` | Pending → Active flip (atomic) |
| `Revert Interactive Form` | Re-point Active override at an older version |

**Security model:**

- **Scope clamp:** agent-invoked Create/Modify always write **User-scope** overrides,
  regardless of the original override's scope. Scope promotion (Role/Global) is a separate,
  deliberate human action.
- **Ownership checks** (`checkOverrideOwnership` in `_shared.ts`): Modify/Activate/Revert
  verify the caller owns the override — `User` scope requires `UserID` match, `Role` scope
  requires role membership, `Global` scope requires the Owner user type. Violations return
  `FORBIDDEN`.
- **Explicit consent:** agents never silently mutate the form a user sees. They emit
  artifacts; "Apply to my form" + "Activate" are the user's consent steps.
- Specs are linted server-side before persisting (`LINT_FAILED` result on bad specs).

### 3.4 Resolution + variants (`FormResolverService`, `@memberjunction/ng-base-forms`)

`packages/Angular/Generic/base-forms/src/lib/resolver/form-resolver.service.ts`:

- `ResolveFormForEntity()` returns the winning form **and** the full list of applicable
  variants; `<mj-record-form-container>` shows a variant picker on the toolbar when more
  than one applies (the CodeGen fallback appears as a visually-distinct "Default form" row).
- The user's variant choice persists via **`UserInfoEngine`** under the key
  `mj.formVariant.<entityname-lowercased>` — server-side, so it follows the user across
  browsers and devices. (The original plan said localStorage; the implementation deliberately
  upgraded to `MJ: User Settings` per the repo-wide preference-persistence rule.)
- Picking "Default form" stores an explicit sentinel so the CodeGen form stays reachable
  even when overrides exist.

### 3.5 The Angular wrapper

`InteractiveFormComponent` (`mj-interactive-form`, in
`packages/Angular/Generic/base-forms/src/lib/interactive-form/`) extends `BaseFormComponent`
and renders `<mj-react-component>` inside `<mj-record-form-container>` — so the toolbar,
History/Tags/Lists drawers, and variant picker all work identically to generated forms.
It owns the `BaseEntity`, translates `BeforeSave`/`BeforeDelete` events into entity
operations, surfaces save failures via `LatestResult.CompleteMessage`, and exposes load
errors to hosts (the Form Builder preview pane shows them instead of a blank panel).

---

## 4. Authoring surfaces

### 4.1 Form Builder cockpit (Explorer dashboard)

`packages/Angular/Explorer/dashboards/src/FormBuilder/` — a 4-pane cockpit:

1. **Version rail** (left, collapsible) — all Component versions with Status badges;
   "Activate" on Pending rows, "Restore" on Inactive rows, diff vs. Active.
2. **Code editor** (center-left) — JSX editing; a Layout (canvas) tab with a divergence
   banner when hand-authored code can't round-trip.
3. **Live preview** (center-right) — renders against a real record (Top-1 by name field,
   with a record picker), error-bounded.
4. **Embedded Form Builder agent chat** (right, collapsible) — refine the form
   conversationally; "New form" seeds from `buildDefaultFormScaffold`.

### 4.2 Chat artifacts (any conversation — Form Builder agent, Sage, Skip)

The interactive-component artifact viewer
(`packages/Angular/Generic/artifacts/.../component-artifact-viewer.component.ts`) is
**form-aware**: when a spec declares `componentRole: 'form'`, it resolves the declared
entity (`getDeclaredFormEntityName`), loads a Top-1 record (ordered by the entity's name
field for determinism), binds it as `FormHostProps`, falls back to fixture data with a
"Mock data" indicator when needed, and exposes a record picker plus an **"Apply to my
form"** action. Apply flows through `InteractiveFormApplyService` → confirmation dialog →
`Create Interactive Form` or `Modify Interactive Form`. This is the single integration
point all form-role artifacts flow through, regardless of which agent produced them.

### 4.3 mj-sync (metadata files)

Hand-author a Component spec under `metadata/components/` and an override under
`metadata/entity-form-overrides/`; `mj sync push` writes the rows. Used for dogfooding,
forms shipped with MJ itself, and test fixtures.

---

## 5. Reference map

| Piece | Location |
|---|---|
| Form-role contract types + helpers | `packages/InteractiveComponents/src/forms/` (this package, `/forms` subpath) |
| Migration | `migrations/v5/V202605242025__v5.38.x__Interactive_Forms.sql` |
| Entity | `EntityFormOverrideEntity` — entity name `MJ: Entity Form Overrides` |
| Actions | `packages/Actions/CoreActions/src/custom/interactive-forms/` |
| Actions metadata | `metadata/actions/.interactive-forms-actions.json` |
| Agent prompt | `metadata/prompts/templates/sage/form-builder.template.md` |
| Resolver + wrapper + variant picker | `packages/Angular/Generic/base-forms/src/lib/` (`resolver/`, `interactive-form/`, `container/`) |
| Override cache | `InteractiveFormsEngine` in `@memberjunction/core-entities` |
| Artifact viewer (form-aware) | `packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts` |
| Apply service | `packages/Angular/Generic/artifacts/src/lib/services/interactive-form-apply.service.ts` |
| Form Builder cockpit | `packages/Angular/Explorer/dashboards/src/FormBuilder/` |
| Rendering architecture (all form kinds) | [guides/FORMS_ARCHITECTURE_GUIDE.md](../../guides/FORMS_ARCHITECTURE_GUIDE.md) |

## 6. History

The feature was designed and shipped through two plan documents, now archived:
[plans/complete/interactive-forms/plan.md](../../plans/complete/interactive-forms/plan.md)
(contract + substrate + initial AI authoring) and
[plans/complete/interactive-forms/phase-2-runtime-loop.md](../../plans/complete/interactive-forms/phase-2-runtime-loop.md)
(versioning lifecycle, action family, cockpit, form-aware artifacts, variant switcher,
security hardening). Where this guide and the plans disagree, **this guide reflects the
implementation** — e.g. variant persistence uses `UserInfoEngine`, not localStorage as the
phase-2 plan originally specified.
