# Skip Form Contributions Implementation Plan

**Goal:** Let a database row plus a React `componentRole: 'form-panel'` component act as a form contribution, peer to compiled `BaseFormPanel`s, so Skip (and any OpenApp without Angular) can add, replace, or claim one piece of an entity form without replacing the form.

**Architecture:** A second registration source (`MJ: Entity Form Contributions`, cached by `InteractiveFormsEngine`) is merged with `ClassFactory` registrations by one collector. The unchanged composer and chrome resolver consume the merged list. A generic `InteractiveFormPanelComponent extends BaseFormPanel` renders metadata winners through `<mj-react-component>` with `FormPanelHostProps`. Apply actions mirror the interactive-form action family. A client-built composition snapshot travels to Skip through the existing app-context conduit.

**Tech Stack:** TypeScript, Angular (non-standalone module `BaseFormsModule`), React runtime (`@memberjunction/ng-react`), MJ Actions, Skyway T-SQL migrations + CodeGen, `mj sync`, Vitest (node + jsdom presets), Skip-Brain prompts (Nunjucks includes) and `@RegisterClass` gates.

**Spec:** [design.md](design.md) (this plan argues from it; read both).

## Global Constraints

- **Repos:** `MJ` (`/Users/…/PROJ2/MJ`, branch off `next`), `Skip-Brain`, `Skip-Client-Open-App`. Each repo gets its own feature branch named `skip-form-contributions`, pushed with `git push -u origin skip-form-contributions` and verified with `git branch -vv` (MJ rule 3).
- **No commits without the user's explicit approval** (MJ `CLAUDE.md` rule 1). Every task ends with `git add` of the listed files only. The user commits. Never `git checkout --`/`git restore` a file.
- **Strong typing.** No `any`, no `as any`, no `unknown` as a shortcut, no `.Get()`/`.Set()` where a generated property exists. The one sanctioned `Record.Set(fieldName, value)` use is the panel host applying a *dynamic* React field diff to the parent record — the same pattern `InteractiveFormComponent.handleBeforeSave` uses today.
- **Entity names carry the `MJ: ` prefix.** New entity: `MJ: Entity Form Contributions`. Generated class: `MJEntityFormContributionEntity` in `packages/MJCoreEntities/src/generated/entities/__mj.ts`.
- **pnpm workspace.** `pnpm install` only at repo root. Build a single package with `cd packages/<pkg> && pnpm run build`. Never `npm install`.
- **Migration:** T-SQL only, in `migrations/v6/`, filename `V<date +"%Y%m%d%H%M">__v6.1.x__Entity_Form_Contributions.sql`. No `__mj_*` columns, no indexes CodeGen owns, no EntityField inserts by hand. Run `mj sync push` before `mj codegen`. One database per agent. PG counterpart is release-engineer work; say so in the PR.
- **Metadata JSON:** new records carry a `primaryKey.ID` from `uuidgen | tr '[:lower:]' '[:upper:]'`; never author `sync` blocks; use `@lookup:` references; JSON-typed columns are nested objects, not strings.
- **Changeset:** this branch touches a migration and `metadata/`, so the changeset is `minor` (MJ `.claude/rules/changesets.md`).
- **Definition of done per package:** `pnpm test` green in every touched package; `pnpm run build` clean; at the end of Phase A and Phase B run `pnpm run test:integration` from the MJ root after migrate + codegen.
- **Design tokens:** no hard-coded colors in any new SCSS/CSS; use `--mj-*` tokens.
- **Skip shared types:** `@askskip/types` lives in Skip-Client-Open-App and is consumed by Skip-Brain at a pinned version. Phase C4 needs the Phase D2 type change published (or `yalc`-linked per Skip-Brain `USING_YALC.md`) before it compiles.

---

## File structure

### MJ — `packages/InteractiveComponents` (`@memberjunction/interactive-component-types`)
- Modify `src/component-spec.ts` — `ComponentRole` gains `'form-panel'`; `ComponentSpec` gains `entityName?` and `formContribution?`.
- Create `src/forms/form-contribution-spec.ts` — `FormContributionSlot`, `FormContributionSpec`, `isFormPanelRole`, `getDeclaredFormContribution`.
- Create `src/forms/form-panel-host-props.ts` — `FormPanelHostProps` and sub-shapes.
- Create `src/forms/form-panel-events.ts` — `FormPanelEventNames`, `FormPanelMethodNames`, arg types.
- Modify `src/forms/index.ts` — export the three new modules.
- Test `src/__tests__/form-contribution-spec.test.ts`.

### MJ — database and metadata
- Create `migrations/v6/V<ts>__v6.1.x__Entity_Form_Contributions.sql`.
- Create `metadata/entity-form-contributions/.mj-sync.json`, `metadata/entity-form-contributions/.entity-form-contributions.json` (empty array).
- Modify `metadata/.mj-sync.json` — add `entity-form-contributions` after `entity-form-overrides` in `directoryOrder`.
- Create `metadata/actions/.form-contributions-actions.json`.
- Generated (by `mj codegen`, do not hand-edit): `packages/MJCoreEntities/src/generated/**`, `packages/MJAPI/src/generated/**`, `packages/GeneratedEntities/**`.

### MJ — `packages/MJCoreEntities` (`@memberjunction/core-entities`)
- Modify `src/engines/interactive-forms.ts` — load contributions; `Contributions`, `Contributions$`, `GetApplicableContributions`; widen Components filter.
- Test `src/__tests__/InteractiveFormsEngine.test.ts`.

### MJ — `packages/Angular/Generic/base-forms` (`@memberjunction/ng-base-forms`)
- Modify `src/lib/panel-slot/base-form-panel.ts` — `presentation?` on `FormPanelRegistrationMetadata`.
- Modify `src/lib/panel-slot/form-contribution.ts` — `FormContributionRegistration` source fields; tie-break; exported `FormContributionEntityMatches`.
- Create `src/lib/panel-slot/collect-form-contribution-registrations.ts` — merged, memoized collector.
- Modify `src/lib/panel-slot/collect-form-panel-registrations.ts` — becomes a class-only wrapper (kept for back-compat).
- Modify `src/lib/panel-slot/form-panel-slot.component.ts` — merged discovery, strict matching, metadata mount, panel registration with the form.
- Create `src/lib/panel-slot/merge-panel-validation.ts` — pure merge of panel `validate()` results.
- Create `src/lib/interactive-form/form-panel-host-props.builder.ts` — `BuildFormPanelHostProps`.
- Create `src/lib/interactive-form/interactive-form-panel.component.ts` + `.html`.
- Modify `src/lib/interactive-form/interactive-form.component.html` — emit slots.
- Create `src/lib/chrome/form-composition-snapshot.ts` — snapshot types + `BuildFormCompositionSnapshot`.
- Modify `src/lib/container/record-form-container.component.ts` — merged registrations, `bare` exclusion, snapshot publication, `PresentSlots`.
- Modify `src/lib/panel-slot/form-slot-coordinator.service.ts` — `PresentSlots` getter.
- Modify `src/lib/base-form-component.ts` — memoized collector, panel registry, `Validate()` merge, `CompositionSnapshot`, `CompositionChanged`.
- Modify `src/lib/panel-slot/form-contributions.component.ts` — merged collector.
- Modify `src/module.ts`, `src/public-api.ts`.
- Tests: `src/lib/panel-slot/__tests__/form-contribution.test.ts` (extend), `src/lib/panel-slot/__tests__/collect-form-contribution-registrations.test.ts`, `src/lib/panel-slot/__tests__/merge-panel-validation.test.ts`, `src/lib/chrome/__tests__/form-composition-snapshot.test.ts`, `src/lib/interactive-form/interactive-form-panel.component.dom.test.ts`, `src/lib/panel-slot/form-panel-slot.component.dom.test.ts` (extend).

### MJ — `packages/Actions/CoreActions`
- Modify `src/custom/interactive-forms/_shared.ts` — `lintFormPanelSpec`, `loadContribution`, `insertContribution`, `checkScopedOwnership`.
- Create `src/custom/interactive-forms/create-form-contribution.action.ts`, `modify-form-contribution.action.ts`, `activate-form-contribution-version.action.ts`, `get-form-contributions-for-entity.action.ts`, `get-form-composition-for-entity.action.ts`.
- Modify `src/custom/interactive-forms/index.ts`.
- Tests `src/__tests__/create-form-contribution.action.test.ts`, `src/__tests__/get-form-composition-for-entity.action.test.ts`.

### MJ — `packages/Angular/Generic/artifacts`
- Modify `src/lib/components/plugins/component-artifact-viewer.component.ts` + `.html` — panel detection, preview, button label.
- Modify `src/lib/services/interactive-form-apply.service.ts` — `ApplyContribution` branch.
- Test `src/lib/__tests__/interactive-form-apply.service.test.ts` (extend).

### MJ — `packages/Angular/Generic/conversations`, `packages/Angular/Explorer/explorer-core`
- Modify `conversations/src/lib/components/conversation/conversation-chat-area.component.ts` — pass the snapshot to apply.
- Modify `explorer-core/src/lib/resource-wrappers/artifact-resource.component.ts` — pass the snapshot to apply.
- Modify `explorer-core/src/lib/single-record/single-record.component.ts` + `.html` — `compositionChanged` output.
- Modify `explorer-core/src/lib/resource-wrappers/record-resource.component.ts` — `SetAgentContext(this, { Form })`.

### MJ — docs
- Modify `guides/FORMS_ARCHITECTURE_GUIDE.md` (§7c addendum), `packages/Angular/Generic/base-forms/PANELS.md`, `packages/Angular/CLAUDE.md`.
- Create `.changeset/skip-form-contributions.md`.

### Skip-Client-Open-App
- Create `packages/types/src/form-context-types.ts` — `SkipFormContext`.
- Modify `packages/types/src/api-types.ts` — `formContext?`; `packages/types/src/index.ts` — export.
- Modify `packages/server/src/skip-sdk.ts` — `SkipCallOptions.formContext`, request assembly.
- Modify `packages/server/src/skip-agent.ts` — read `params.data.appContext.AdditionalContext.Form`.
- Test `packages/server/test/unit/skip-agent.form-context.test.ts`.

### Skip-Brain
- Create `metadata/prompts/templates/shared/form-panel-role-contract.md`.
- Modify `metadata/prompts/templates/code-generation/unified-code-generator.md`, `software-architect-v2.md`, `metadata/prompts/templates/requirements-expert-agent.md`.
- Modify `apps/API/src/services/workflow/WorkflowService.ts` — `applyFormRoleCommitment` panel branch.
- Create `apps/API/src/services/mentions/FormContextMarker.ts`; modify `apps/API/src/services/workflow/RequestRouter.ts`.
- Create `packages/component-engine/src/gates/FormPanelNoSaveGate.ts`, `FormPanelUsesHostPropsGate.ts`, `FormPanelNoFixedHeightGate.ts`; modify `FormLintParityGate.ts`, `gate-runner.ts`, `index.ts`.
- Tests `apps/API/test/unit/services/mentions/FormContextMarker.test.ts`, `apps/API/test/unit/services/workflow/WorkflowService.test.ts` (extend), `packages/component-engine/src/__tests__/form-panel-gates.test.ts`.

---

# Phase A — Contract and runtime substrate (MJ)

### Task A1: `form-panel` role and `FormContributionSpec` in interactive-component-types

**Files:**
- Modify: `packages/InteractiveComponents/src/component-spec.ts:11` (the `ComponentRole` union) and the `ComponentSpec` interface body near line 239.
- Create: `packages/InteractiveComponents/src/forms/form-contribution-spec.ts`
- Create: `packages/InteractiveComponents/src/forms/form-panel-host-props.ts`
- Create: `packages/InteractiveComponents/src/forms/form-panel-events.ts`
- Modify: `packages/InteractiveComponents/src/forms/index.ts`
- Test: `packages/InteractiveComponents/src/__tests__/form-contribution-spec.test.ts`

**Interfaces:**
- Produces: `ComponentRole` includes `'form-panel'`; `ComponentSpec.entityName?: string`; `ComponentSpec.formContribution?: FormContributionSpec`; `FormContributionSlot`, `FormContributionPresentation`, `FormContributionSpec`, `isFormPanelRole(spec)`, `getDeclaredFormContribution(spec)`, `DEFAULT_FORM_CONTRIBUTION_SLOT`, `FormPanelHostProps`, `FormPanelContributionContext`, `FormPanelRelatedContext`, `FormPanelEventNames`, `FormPanelMethodNames`, `FormPanelRowCountChangedArgs`, `FormPanelValidateResult`, `FormPanelSetEditModeArgs`. Every later task imports these from `@memberjunction/interactive-component-types` (spec fields) or `…/forms` (the rest).

- [ ] **Step 1: Write the failing test**

```ts
// packages/InteractiveComponents/src/__tests__/form-contribution-spec.test.ts
import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '../component-spec';
import {
    DEFAULT_FORM_CONTRIBUTION_SLOT,
    getDeclaredFormContribution,
    isFormPanelRole,
} from '../forms/form-contribution-spec';

function spec(over: Partial<ComponentSpec>): ComponentSpec {
    return over as unknown as ComponentSpec;
}

describe('isFormPanelRole', () => {
    it('is true only for componentRole form-panel', () => {
        expect(isFormPanelRole(spec({ componentRole: 'form-panel' }))).toBe(true);
        expect(isFormPanelRole(spec({ componentRole: 'form' }))).toBe(false);
        expect(isFormPanelRole(spec({}))).toBe(false);
    });
});

describe('getDeclaredFormContribution', () => {
    it('returns null when the spec is not a form panel', () => {
        expect(getDeclaredFormContribution(spec({ componentRole: 'form', formContribution: { title: 'x', slot: 'after-fields', presentation: 'panel' } }))).toBeNull();
    });

    it('fills slot and presentation defaults and trims the title', () => {
        const c = getDeclaredFormContribution(spec({
            componentRole: 'form-panel',
            title: 'Lifetime value',
            formContribution: { title: '  LTV strip  ' } as never,
        }));
        expect(c).toEqual({
            slot: DEFAULT_FORM_CONTRIBUTION_SLOT,
            presentation: 'panel',
            title: 'LTV strip',
            configuration: {},
        });
    });

    it('falls back to spec.title when the block has no title, and rejects unknown slots', () => {
        const noTitle = getDeclaredFormContribution(spec({ componentRole: 'form-panel', title: 'Renewals' }));
        expect(noTitle?.title).toBe('Renewals');
        expect(noTitle?.slot).toBe('after-fields');
        const badSlot = getDeclaredFormContribution(spec({
            componentRole: 'form-panel', title: 'x',
            formContribution: { title: 'x', slot: 'sidebar' } as never,
        }));
        expect(badSlot?.slot).toBe('after-fields');
    });

    it('passes through claims, inclusion, chrome group, icon, sortKey and configuration', () => {
        const c = getDeclaredFormContribution(spec({
            componentRole: 'form-panel',
            formContribution: {
                title: 'Tickets', slot: 'after-related', presentation: 'panel', sortKey: 80,
                contributionKey: 'related:tickets', relatedEntity: 'MJ_BizApps_Orders: Event Order Lines',
                relatedJoinField: 'PersonID', replacesSectionKey: undefined, inclusion: 'Primary',
                chromeGroup: 'more', icon: 'fa-solid fa-ticket', configuration: { pageSize: 25 },
            },
        }));
        expect(c).toMatchObject({
            slot: 'after-related', sortKey: 80, contributionKey: 'related:tickets',
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID',
            inclusion: 'Primary', chromeGroup: 'more', icon: 'fa-solid fa-ticket',
            configuration: { pageSize: 25 },
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/InteractiveComponents && pnpm vitest run src/__tests__/form-contribution-spec.test.ts`
Expected: FAIL — `Cannot find module '../forms/form-contribution-spec'`.

- [ ] **Step 3: Add the role and spec fields**

In `packages/InteractiveComponents/src/component-spec.ts` change line 11 and add two optional fields to `ComponentSpec` immediately after `componentRole?: ComponentRole;`:

```ts
import type { FormContributionSpec } from './forms/form-contribution-spec';

export type ComponentRole = 'form' | 'form-panel' | 'dashboard' | 'widget' | 'report' | 'detail-pane';
```

```ts
    componentRole?: ComponentRole;

    /**
     * Canonical entity name a `form` or `form-panel` component binds to. Hosts resolve
     * the entity from this first, then `dataRequirements.entities[0].name`.
     */
    entityName?: string;

    /**
     * Registration intent for `componentRole: 'form-panel'` — where the panel mounts and
     * what it claims. Consumers (Skip apply flow, Form Builder, `mj sync`) turn this into a
     * `MJ: Entity Form Contributions` row. Never carries priority; that is a host decision.
     */
    formContribution?: FormContributionSpec;
```

Also update the `componentRole` docblock bullet list with:
```ts
     * - `form-panel`: one contribution on an entity form (hero, pane, related-grid claim). Implements
     *   `FormPanelHostProps` + `FormPanelEventNames` / `FormPanelMethodNames`; hosted by
     *   `InteractiveFormPanelComponent` inside `<mj-form-panel-slot>`.
```

- [ ] **Step 4: Create `form-contribution-spec.ts`**

```ts
// packages/InteractiveComponents/src/forms/form-contribution-spec.ts
import type { ComponentSpec } from '../component-spec';

/** Slot names — byte-identical to `FormPanelSlot` in @memberjunction/ng-base-forms. */
export type FormContributionSlot = 'top-area' | 'before-fields' | 'after-fields' | 'after-related' | 'after-everything';
export type FormContributionPresentation = 'panel' | 'bare';
export type FormContributionInclusion = 'Primary' | 'More' | 'None';
export type FormContributionChromeGroup = 'details' | 'more';

export const DEFAULT_FORM_CONTRIBUTION_SLOT: FormContributionSlot = 'after-fields';
export const FORM_CONTRIBUTION_SLOTS: readonly FormContributionSlot[] =
    ['top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything'];

/**
 * Registration intent carried on `ComponentSpec.formContribution`. Mirrors
 * `MJ: Entity Form Contributions` columns one-to-one, minus scope and priority
 * (host decisions) and minus identity (`Name` / `ComponentID`).
 */
export interface FormContributionSpec {
    slot: FormContributionSlot;
    sortKey?: number;
    contributionKey?: string;
    relatedEntity?: string;
    relatedJoinField?: string;
    replacesSectionKey?: string;
    inclusion?: FormContributionInclusion;
    chromeGroup?: FormContributionChromeGroup;
    presentation: FormContributionPresentation;
    title: string;
    icon?: string;
    configuration?: Record<string, unknown>;
}

/** True iff the spec commits to the form-panel contract. */
export function isFormPanelRole(spec: Pick<ComponentSpec, 'componentRole'>): boolean {
    return spec.componentRole === 'form-panel';
}

function isSlot(value: unknown): value is FormContributionSlot {
    return typeof value === 'string' && (FORM_CONTRIBUTION_SLOTS as readonly string[]).includes(value);
}

function cleanString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalized registration intent for a form-panel spec, or `null` when the spec
 * is not a form panel. Fills defaults (`slot`, `presentation`, `configuration`),
 * trims strings, drops unknown slot / inclusion / chromeGroup values, and falls
 * back to `spec.title` when the block has no title.
 */
export function getDeclaredFormContribution(
    spec: Pick<ComponentSpec, 'componentRole' | 'title' | 'formContribution'> | null | undefined,
): FormContributionSpec | null {
    if (!spec || !isFormPanelRole(spec)) return null;
    const raw: Partial<FormContributionSpec> = spec.formContribution ?? {};
    const title = cleanString(raw.title) ?? cleanString(spec.title) ?? 'Panel';
    const out: FormContributionSpec = {
        slot: isSlot(raw.slot) ? raw.slot : DEFAULT_FORM_CONTRIBUTION_SLOT,
        presentation: raw.presentation === 'bare' ? 'bare' : 'panel',
        title,
        configuration: raw.configuration && typeof raw.configuration === 'object' ? { ...raw.configuration } : {},
    };
    if (typeof raw.sortKey === 'number' && Number.isFinite(raw.sortKey)) out.sortKey = raw.sortKey;
    const key = cleanString(raw.contributionKey);
    if (key) out.contributionKey = key;
    const related = cleanString(raw.relatedEntity);
    if (related) out.relatedEntity = related;
    const join = cleanString(raw.relatedJoinField);
    if (join) out.relatedJoinField = join;
    const replaces = cleanString(raw.replacesSectionKey);
    if (replaces) out.replacesSectionKey = replaces;
    if (raw.inclusion === 'Primary' || raw.inclusion === 'More' || raw.inclusion === 'None') out.inclusion = raw.inclusion;
    if (raw.chromeGroup === 'details' || raw.chromeGroup === 'more') out.chromeGroup = raw.chromeGroup;
    const icon = cleanString(raw.icon);
    if (icon) out.icon = icon;
    return out;
}
```

- [ ] **Step 5: Create `form-panel-host-props.ts` and `form-panel-events.ts`**

```ts
// packages/InteractiveComponents/src/forms/form-panel-host-props.ts
import type { FormHostProps } from './form-host-props';
import type { FormContributionPresentation, FormContributionSlot } from './form-contribution-spec';

/** Identity + configuration of the contribution this panel instance renders. */
export interface FormPanelContributionContext {
    key: string;
    slot: FormContributionSlot;
    title: string;
    presentation: FormContributionPresentation;
    configuration: Record<string, unknown>;
}

/** Present only when the panel claims a related-entity grid. */
export interface FormPanelRelatedContext {
    entityName: string;
    joinField?: string;
    /** Prebuilt by the host from BaseFormComponent.BuildRelationshipViewParamsByEntityName — includes join.any OR filters. */
    viewParams: { EntityName: string; ExtraFilter: string; OrderBy?: string };
    /** From BaseFormComponent.NewRecordValues so a "New" action pre-links the child to this record. */
    newRecordValues: Record<string, unknown>;
}

/**
 * Props the host (`InteractiveFormPanelComponent`) passes to a `componentRole: 'form-panel'`
 * component. Extends the whole-form props: the panel sees the same record snapshot,
 * metadata, mode and permissions, plus its own registration context.
 */
export interface FormPanelHostProps extends FormHostProps {
    contribution: FormPanelContributionContext;
    related?: FormPanelRelatedContext;
    /** Section expanded state (accordion) or "is the active rail group" (left-nav). Defer loads while false. */
    isExpanded: boolean;
    layout: 'accordion' | 'left-nav';
}
```

```ts
// packages/InteractiveComponents/src/forms/form-panel-events.ts
import type { BaseEventArgs } from '../component-events';
import { FormEventNames } from './form-event-names';

/** Events a form-panel component emits via `callbacks.NotifyEvent`. */
export const FormPanelEventNames = {
    /** Related-row count for the rail badge. */
    RowCountChanged: 'RowCountChanged',
    /** Reused from the whole-form contract: proposes one field value on the PARENT record. */
    FieldChanged: FormEventNames.FieldChanged,
    /** Reused from the whole-form contract. */
    ValidationChanged: FormEventNames.ValidationChanged,
} as const;
export type FormPanelEventName = typeof FormPanelEventNames[keyof typeof FormPanelEventNames];

export interface FormPanelRowCountChangedArgs extends BaseEventArgs {
    count: number;
}

/** Methods a form-panel component may register via `callbacks.RegisterMethod`. All optional. */
export const FormPanelMethodNames = {
    /** Parent record was reloaded from the database. */
    OnRecordRefreshed: 'OnRecordRefreshed',
    /** Host toolbar entered or left edit mode. */
    SetEditMode: 'SetEditMode',
    /** Host is about to save the parent record; return validity. */
    Validate: 'Validate',
} as const;
export type FormPanelMethodName = typeof FormPanelMethodNames[keyof typeof FormPanelMethodNames];

export type FormPanelSetEditModeArgs = { mode: 'view' | 'edit' };
export interface FormPanelValidateResult { isValid: boolean; errors: string[] }
```

Append to `packages/InteractiveComponents/src/forms/index.ts`:

```ts
export * from './form-contribution-spec';
export * from './form-panel-host-props';
export * from './form-panel-events';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/InteractiveComponents && pnpm test && pnpm run build`
Expected: all tests PASS (existing `form-spec-info.test.ts` and `default-form-scaffold.test.ts` still green); `tsc` clean.

- [ ] **Step 7: Stage for review**

```bash
git add packages/InteractiveComponents/src/component-spec.ts packages/InteractiveComponents/src/forms/
git add packages/InteractiveComponents/src/__tests__/form-contribution-spec.test.ts
```

---

### Task A2: `EntityFormContribution` migration, CodeGen, and `mj sync` directory

**Files:**
- Create: `migrations/v6/V<ts>__v6.1.x__Entity_Form_Contributions.sql`
- Create: `metadata/entity-form-contributions/.mj-sync.json`, `metadata/entity-form-contributions/.entity-form-contributions.json`
- Modify: `metadata/.mj-sync.json` (`directoryOrder`, after `"entity-form-overrides"` at line 74)
- Generated: `packages/MJCoreEntities/src/generated/entities/__mj.ts` and siblings (via `mj codegen`)

**Interfaces:**
- Produces: table `${schema}.EntityFormContribution`; entity `MJ: Entity Form Contributions`; generated class `MJEntityFormContributionEntity` with properties `ID, EntityID, ComponentID, Name, Description, Slot, SortKey, ContributionKey, RelatedEntityID, RelatedJoinField, ReplacesSectionKey, Inclusion, ChromeGroup, Presentation, Title, Icon, Scope, UserID, RoleID, Priority, Status, Configuration, Notes` plus the view joins `Entity, Component, RelatedEntity, User, Role`.

- [ ] **Step 1: Confirm nobody else is on your database, then write the migration**

Run: `date +"%Y%m%d%H%M"` and name the file with that stamp. Confirm `DB_DATABASE` in your `mj.config.cjs` is yours alone.

```sql
/* ============================================================================
   MJ: Entity Form Contributions — metadata-registered form contributions

   One row mounts a `componentRole: 'form-panel'` Component (Type='Widget') on a
   parent entity's form at a slot, optionally claiming a related grid or replacing
   a baked field panel. Peer of compiled BaseFormPanel registrations: the same
   composer, chrome layers and MJ: Form Chrome Rules apply.

   CodeGen handles automatically (intentionally omitted):
     - __mj_CreatedAt / __mj_UpdatedAt columns + triggers
     - Foreign-key indexes (IDX_AUTO_MJ_FKEY_*)
     - Entity / EntityField metadata ("MJ: Entity Form Contributions")
   ============================================================================ */

CREATE TABLE ${flyway:defaultSchema}.EntityFormContribution (
    ID                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID           UNIQUEIDENTIFIER NOT NULL,
    ComponentID        UNIQUEIDENTIFIER NOT NULL,
    Name               NVARCHAR(255)    NOT NULL,
    Description        NVARCHAR(MAX)    NULL,
    Slot               NVARCHAR(30)     NOT NULL DEFAULT 'after-fields',
    SortKey            INT              NOT NULL DEFAULT 0,
    ContributionKey    NVARCHAR(256)    NULL,
    RelatedEntityID    UNIQUEIDENTIFIER NULL,
    RelatedJoinField   NVARCHAR(255)    NULL,
    ReplacesSectionKey NVARCHAR(255)    NULL,
    Inclusion          NVARCHAR(10)     NULL,
    ChromeGroup        NVARCHAR(10)     NULL,
    Presentation       NVARCHAR(10)     NOT NULL DEFAULT 'panel',
    Title              NVARCHAR(255)    NULL,
    Icon               NVARCHAR(100)    NULL,
    Scope              NVARCHAR(20)     NOT NULL DEFAULT 'User',
    UserID             UNIQUEIDENTIFIER NULL,
    RoleID             UNIQUEIDENTIFIER NULL,
    Priority           INT              NOT NULL DEFAULT 0,
    Status             NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
    Configuration      NVARCHAR(MAX)    NULL,
    Notes              NVARCHAR(MAX)    NULL,

    CONSTRAINT PK_EntityFormContribution PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFormContribution_Entity
        FOREIGN KEY (EntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_EntityFormContribution_Component
        FOREIGN KEY (ComponentID) REFERENCES ${flyway:defaultSchema}.Component(ID),
    CONSTRAINT FK_EntityFormContribution_RelatedEntity
        FOREIGN KEY (RelatedEntityID) REFERENCES ${flyway:defaultSchema}.Entity(ID),
    CONSTRAINT FK_EntityFormContribution_User
        FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_EntityFormContribution_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT CK_EntityFormContribution_Slot
        CHECK (Slot IN ('top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything')),
    CONSTRAINT CK_EntityFormContribution_Inclusion
        CHECK (Inclusion IS NULL OR Inclusion IN ('Primary', 'More', 'None')),
    CONSTRAINT CK_EntityFormContribution_ChromeGroup
        CHECK (ChromeGroup IS NULL OR ChromeGroup IN ('details', 'more')),
    CONSTRAINT CK_EntityFormContribution_Presentation
        CHECK (Presentation IN ('panel', 'bare')),
    CONSTRAINT CK_EntityFormContribution_Scope
        CHECK (Scope IN ('User', 'Role', 'Global')),
    CONSTRAINT CK_EntityFormContribution_ScopeShape
        CHECK (
            (Scope = 'User'   AND UserID IS NOT NULL AND RoleID IS NULL) OR
            (Scope = 'Role'   AND RoleID IS NOT NULL AND UserID IS NULL) OR
            (Scope = 'Global' AND UserID IS NULL     AND RoleID IS NULL)
        ),
    CONSTRAINT CK_EntityFormContribution_Status
        CHECK (Status IN ('Active', 'Inactive', 'Pending'))
);

CREATE UNIQUE INDEX UQ_EntityFormContribution_Key
    ON ${flyway:defaultSchema}.EntityFormContribution (EntityID, ContributionKey, Scope, UserID, RoleID)
    WHERE ContributionKey IS NOT NULL AND Status = 'Active';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Metadata-registered form contribution: mounts a form-panel Component on a parent entity''s form at a slot, optionally claiming a related grid or replacing a baked field panel. Peer of compiled BaseFormPanel registrations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFormContribution';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Parent form entity the panel mounts on.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'EntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MJ: Components row (Type=Widget) whose Specification declares componentRole=form-panel.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ComponentID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Slot inside the generated form: top-area, before-fields, after-fields, after-related, after-everything.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Slot';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Higher renders earlier within the slot.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'SortKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Last-wins identity shared with compiled registrations and MJ: Form Chrome Rules. Null derives related:<entity>:<join> for related claims, otherwise the row never collapses.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ContributionKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When set, this panel replaces the related-entity grid for that relationship on the parent form.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'RelatedEntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Disambiguates two FKs to the same related entity (BillToPersonID vs ShipToPersonID).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'RelatedJoinField';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'CodeGen SectionKey of a baked field panel this contribution hides (hero pattern).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ReplacesSectionKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'L1 chrome inclusion: Primary (own rail item), More (folder), None (hidden). Null = default rail behavior.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Inclusion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Pin to the details or more chrome bucket instead of an own rail item.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'ChromeGroup';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'panel = wrapped in a collapsible section with header; bare = hero strip with no chrome and no rail item.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Presentation';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Section header and rail label. Null falls back to Name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Font Awesome class for the section header and rail item.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Icon';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Who sees the contribution: User (UserID), Role (RoleID) or Global.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Scope';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Last-wins priority against compiled registrations sharing ContributionKey. Ties go to the compiled registration; a row wins only when strictly higher.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Priority';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Active rows render. Pending rows are drafts awaiting activation. Inactive rows are history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON passed to the component as contribution.configuration so one component can serve several rows.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Configuration';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Free-form authoring notes; agents append an iteration log here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityFormContribution', @level2type = N'COLUMN', @level2name = N'Notes';
```

- [ ] **Step 2: Create the `mj sync` directory**

`metadata/entity-form-contributions/.mj-sync.json`:

```json
{
  "entity": "MJ: Entity Form Contributions",
  "filePattern": "**/.*.json",
  "defaults": {},
  "pull": {
    "createNewFileIfNotFound": true,
    "newFileName": ".entity-form-contributions.json",
    "appendRecordsToExistingFile": true,
    "updateExistingRecords": true,
    "preserveFields": [],
    "excludeFields": [],
    "mergeStrategy": "merge",
    "backupBeforeUpdate": true,
    "backupDirectory": ".backups",
    "filter": "",
    "externalizeFields": [],
    "ignoreNullFields": true,
    "ignoreVirtualFields": true,
    "lookupFields": {
      "EntityID": { "entity": "MJ: Entities", "field": "Name" },
      "ComponentID": { "entity": "MJ: Components", "field": "Name" },
      "RelatedEntityID": { "entity": "MJ: Entities", "field": "Name" },
      "UserID": { "entity": "MJ: Users", "field": "Email" },
      "RoleID": { "entity": "MJ: Roles", "field": "Name" }
    },
    "relatedEntities": {}
  }
}
```

`metadata/entity-form-contributions/.entity-form-contributions.json`: `[]`

In `metadata/.mj-sync.json`, insert `"entity-form-contributions",` on the line after `"entity-form-overrides",` (currently line 74). Components sync before both, so `@lookup:MJ: Components.Name=…` resolves.

- [ ] **Step 3: Migrate, sync, codegen**

```bash
pnpm mj migrate
pnpm mj sync push --dir=metadata
pnpm mj codegen
```

Expected: codegen reports `MJ: Entity Form Contributions` created; `packages/MJCoreEntities/src/generated/entities/__mj.ts` contains `export class MJEntityFormContributionEntity` with a `Slot` getter typed `'after-everything' | 'after-fields' | 'after-related' | 'before-fields' | 'top-area'`, `Presentation: 'bare' | 'panel'`, `Scope: 'Global' | 'Role' | 'User'`, `Status: 'Active' | 'Inactive' | 'Pending'`.

Verify: `grep -n "class MJEntityFormContributionEntity" packages/MJCoreEntities/src/generated/entities/__mj.ts`.

- [ ] **Step 4: Append the CodeGen output to the migration**

Move the contents of the produced `CodeGen_Run_*.sql` beneath the hand DDL with the required separator (≥ 50 blank lines, then the "generated by CodeGen — do not edit" comment block), then delete the standalone `CodeGen_Run_*.sql`. Confirm every `EntityField` insert uses `(SELECT COALESCE(MAX([Sequence]), 0) FROM … WHERE [EntityID] = '…') + <ordinal>` — never a literal `Sequence`. Run `.github/scripts/check-migration-entityfield-sequence.sh` if present.

- [ ] **Step 5: Build the generated packages**

```bash
cd packages/MJCoreEntities && pnpm run build && pnpm test
```

Expected: build clean; existing engine tests green.

- [ ] **Step 6: Stage for review**

```bash
git add migrations/v6/V*__v6.1.x__Entity_Form_Contributions.sql metadata/entity-form-contributions metadata/.mj-sync.json
git add packages/MJCoreEntities/src/generated
```

Do **not** stage `packages/GeneratedEntities/**`, `packages/MJAPI/src/generated/**`, or `mj.config.cjs` (local host artifacts).

---

### Task A3: `InteractiveFormsEngine` loads contributions

**Files:**
- Modify: `packages/MJCoreEntities/src/engines/interactive-forms.ts`
- Test: `packages/MJCoreEntities/src/__tests__/InteractiveFormsEngine.test.ts`

**Interfaces:**
- Consumes: `MJEntityFormContributionEntity` (Task A2).
- Produces: `InteractiveFormsEngine.Contributions: MJEntityFormContributionEntity[]`, `Contributions$: Observable<MJEntityFormContributionEntity[]>`, `GetApplicableContributions(entityID: string, userID: string, roleIDs: ReadonlyArray<string>): MJEntityFormContributionEntity[]` (Active + scope match, sorted `Priority` DESC then `SortKey` DESC), `FindComponentByID(id)` (alias of `FindFormByID` now that `Forms` includes widgets).

- [ ] **Step 1: Write the failing test**

```ts
// packages/MJCoreEntities/src/__tests__/InteractiveFormsEngine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

let backing: Record<string, unknown[]> = {};

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } },
    };
});

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class MockBaseEngine {
        static getInstance<T>(): T {
            const ctor = this as unknown as { _testInstance?: T; new (): T };
            if (!ctor._testInstance) ctor._testInstance = new ctor();
            return ctor._testInstance;
        }
        async Load(): Promise<void> { /* no-op */ }
        GetConfigData<T>(prop: string): T[] { return (backing[prop] ?? []) as T[]; }
        ObserveProperty<T>(prop: string) { return { prop }; }
    },
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    UserInfo: class {},
}));

import { InteractiveFormsEngine } from '../engines/interactive-forms';

const USER = '11111111-1111-1111-1111-111111111111';
const ROLE = '22222222-2222-2222-2222-222222222222';
const ENTITY = '33333333-3333-3333-3333-333333333333';

function row(over: Record<string, unknown>) {
    return {
        ID: 'r', EntityID: ENTITY, Scope: 'Global', UserID: null, RoleID: null,
        Status: 'Active', Priority: 0, SortKey: 0, ...over,
    };
}

describe('InteractiveFormsEngine.GetApplicableContributions', () => {
    beforeEach(() => { backing = {}; });

    it('returns Active rows whose scope matches, highest Priority then SortKey first', () => {
        backing._contributions = [
            row({ ID: 'global', Priority: 0, SortKey: 10 }),
            row({ ID: 'mine', Scope: 'User', UserID: USER, Priority: 5 }),
            row({ ID: 'other-user', Scope: 'User', UserID: 'someone-else' }),
            row({ ID: 'role', Scope: 'Role', RoleID: ROLE, Priority: 1 }),
            row({ ID: 'pending', Status: 'Pending', Priority: 99 }),
            row({ ID: 'other-entity', EntityID: 'zzz', Priority: 99 }),
        ];
        const ids = InteractiveFormsEngine.Instance
            .GetApplicableContributions(ENTITY, USER, [ROLE]).map(r => r.ID);
        expect(ids).toEqual(['mine', 'role', 'global']);
    });

    it('returns an empty array for a blank entity id', () => {
        backing._contributions = [row({ ID: 'global' })];
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions('', USER, [])).toEqual([]);
    });

    it('compares ids case-insensitively', () => {
        backing._contributions = [row({ ID: 'g', EntityID: ENTITY.toUpperCase() })];
        expect(InteractiveFormsEngine.Instance.GetApplicableContributions(ENTITY.toLowerCase(), USER, [])).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/MJCoreEntities && pnpm vitest run src/__tests__/InteractiveFormsEngine.test.ts`
Expected: FAIL — `GetApplicableContributions is not a function`.

- [ ] **Step 3: Implement**

In `packages/MJCoreEntities/src/engines/interactive-forms.ts`:

```ts
import type { MJComponentEntity, MJEntityFormContributionEntity, MJEntityFormOverrideEntity } from "../generated/entity_subclasses";
```

Add the field and config entry, widen the Components filter:

```ts
    private _forms: MJComponentEntity[] = [];
    private _overrides: MJEntityFormOverrideEntity[] = [];
    private _contributions: MJEntityFormContributionEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const c: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Components',
                PropertyName: '_forms',
                // Whole forms are Type='Form'; form-panel contributions are Type='Widget'.
                Filter: "Type IN ('Form','Widget')",
                CacheLocal: true,
            },
            { Type: 'entity', EntityName: 'MJ: Entity Form Overrides', PropertyName: '_overrides', CacheLocal: true },
            { Type: 'entity', EntityName: 'MJ: Entity Form Contributions', PropertyName: '_contributions', CacheLocal: true },
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }
```

Add accessors next to `Overrides` / `Overrides$`:

```ts
    /** All cached EntityFormContribution rows (all scopes, all statuses — callers filter). */
    public get Contributions(): MJEntityFormContributionEntity[] {
        return this.GetConfigData<MJEntityFormContributionEntity>('_contributions');
    }

    /** Emits on every save / delete / remote-invalidate that touches `MJ: Entity Form Contributions`. */
    public get Contributions$(): Observable<MJEntityFormContributionEntity[]> {
        return this.ObserveProperty<MJEntityFormContributionEntity>('_contributions');
    }

    /**
     * Active contribution rows that apply to (entity, user, roles): User rows for this
     * user, Role rows for any of the user's roles, and Global rows. Sorted by
     * `Priority` DESC then `SortKey` DESC. Last-wins collapse against compiled
     * registrations happens in ng-base-forms, not here.
     */
    public GetApplicableContributions(
        entityID: string,
        userID: string,
        roleIDs: ReadonlyArray<string>,
    ): MJEntityFormContributionEntity[] {
        if (!entityID) return [];
        const rows = this.Contributions.filter(c =>
            c.EntityID && UUIDsEqual(c.EntityID, entityID)
            && c.Status === 'Active'
            && (
                (c.Scope === 'User'   && !!c.UserID && !!userID && UUIDsEqual(c.UserID, userID)) ||
                (c.Scope === 'Role'   && !!c.RoleID && roleIDs.some(r => UUIDsEqual(r, c.RoleID as string))) ||
                (c.Scope === 'Global')
            ),
        );
        return rows.sort((a, b) => {
            const p = (b.Priority ?? 0) - (a.Priority ?? 0);
            if (p !== 0) return p;
            return (b.SortKey ?? 0) - (a.SortKey ?? 0);
        });
    }

    /** Find any cached form or widget Component by ID. `FindFormByID` remains as an alias. */
    public FindComponentByID(id: string): MJComponentEntity | undefined {
        return this.FindFormByID(id);
    }
```

Update the class docblock's first paragraph to mention contributions and `Type IN ('Form','Widget')`.

- [ ] **Step 4: Run tests and build**

Run: `cd packages/MJCoreEntities && pnpm test && pnpm run build`
Expected: PASS.

- [ ] **Step 5: Stage for review**

```bash
git add packages/MJCoreEntities/src/engines/interactive-forms.ts packages/MJCoreEntities/src/__tests__/InteractiveFormsEngine.test.ts
```

---

### Task A4: Merged registration model, tie-break, and strict entity matching

**Files:**
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/base-form-panel.ts` (the `FormPanelRegistrationMetadata` interface)
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/form-contribution.ts`
- Test: `packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/form-contribution.test.ts` (append)

**Interfaces:**
- Produces: `FormPanelRegistrationMetadata.presentation?: 'panel' | 'bare'`; `FormContributionRegistrationSource = 'class' | 'metadata'`; `FormContributionRegistration` gains `Source?`, `ComponentID?`, `Configuration?`, `Title?`, `Icon?`, `Presentation?`, `RowID?`; `CollapseFormPanelRegistrations` prefers `'class'` on equal priority; exported `FormContributionEntityMatches(registeredEntity, formEntity): boolean` (strict, `'*'` wildcard).

- [ ] **Step 1: Write the failing tests (append to `form-contribution.test.ts`)**

```ts
import { FormContributionEntityMatches } from '../form-contribution';

describe('CollapseFormPanelRegistrations — source tie-break', () => {
    const meta = { entity: PEOPLE, slot: 'before-fields' as FormPanelSlot, contributionKey: 'header' };

    it('keeps the compiled registration when a metadata row ties on priority', () => {
        const compiled = { Priority: 0, Metadata: meta, Source: 'class' as const };
        const row = { Priority: 0, Metadata: meta, Source: 'metadata' as const, ComponentID: 'c1' };
        expect(CollapseFormPanelRegistrations([row, compiled])).toEqual([compiled]);
        expect(CollapseFormPanelRegistrations([compiled, row])).toEqual([compiled]);
    });

    it('lets a metadata row win only with strictly higher priority', () => {
        const compiled = { Priority: 0, Metadata: meta, Source: 'class' as const };
        const row = { Priority: 1, Metadata: meta, Source: 'metadata' as const, ComponentID: 'c1' };
        expect(CollapseFormPanelRegistrations([compiled, row])).toEqual([row]);
    });

    it('treats a registration with no Source as compiled', () => {
        const legacy = { Priority: 0, Metadata: meta };
        const row = { Priority: 0, Metadata: meta, Source: 'metadata' as const, ComponentID: 'c1' };
        expect(CollapseFormPanelRegistrations([row, legacy])).toEqual([legacy]);
    });
});

describe('FormContributionEntityMatches', () => {
    it('is exact, case-sensitive equality or the wildcard', () => {
        expect(FormContributionEntityMatches(PEOPLE, PEOPLE)).toBe(true);
        expect(FormContributionEntityMatches('*', PEOPLE)).toBe(true);
        expect(FormContributionEntityMatches('People', PEOPLE)).toBe(false);
        expect(FormContributionEntityMatches(PEOPLE.toLowerCase(), PEOPLE)).toBe(false);
        expect(FormContributionEntityMatches('', PEOPLE)).toBe(false);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (node)" src/lib/panel-slot/__tests__/form-contribution.test.ts`
Expected: FAIL — `FormContributionEntityMatches` is not exported; tie-break test fails because the row currently wins when listed first.

- [ ] **Step 3: Implement**

`base-form-panel.ts` — add to `FormPanelRegistrationMetadata` after `inclusion?`:

```ts
    /**
     * `'bare'` = a hero strip that draws no collapsible chrome and is never a rail item.
     * `'panel'` (default) = a normal collapsible section. Replaces the old
     * `contributionKey === 'header'` convention, which is still honored.
     */
    presentation?: 'panel' | 'bare';
```

`form-contribution.ts` — extend the registration shape and the collapse:

```ts
export type FormContributionRegistrationSource = 'class' | 'metadata';

export interface FormContributionRegistration {
    Priority: number;
    Metadata: FormPanelRegistrationMetadata;
    /** Omitted = compiled (`ClassFactory`). `'metadata'` = a `MJ: Entity Form Contributions` row. */
    Source?: FormContributionRegistrationSource;
    /** `MJ: Components.ID` for metadata rows. */
    ComponentID?: string;
    /** Parsed `Configuration` JSON for metadata rows. */
    Configuration?: Record<string, unknown>;
    Title?: string;
    Icon?: string;
    Presentation?: 'panel' | 'bare';
    /** `MJ: Entity Form Contributions.ID` for metadata rows. */
    RowID?: string;
}

/** Strict entity match shared by the composer and the slot host. `'*'` matches every form. */
export function FormContributionEntityMatches(registeredEntity: string | null | undefined, formEntity: string): boolean {
    if (!registeredEntity) return false;
    return registeredEntity === '*' || registeredEntity === formEntity;
}

function sourceRank(source: FormContributionRegistrationSource | undefined): number {
    // Compiled registrations win ties (design decision 1). A row must be strictly higher.
    return source === 'metadata' ? 0 : 1;
}

export function CollapseFormPanelRegistrations<T extends { Priority: number; Metadata: FormPanelRegistrationMetadata; Source?: FormContributionRegistrationSource }>(
    registrations: readonly T[],
): T[] {
    const winners = new Map<string, T>();
    let uniqueIndex = 0;
    for (const reg of registrations) {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${uniqueIndex++}`;
        const incumbent = winners.get(key);
        const beats = !incumbent
            || reg.Priority > incumbent.Priority
            || (reg.Priority === incumbent.Priority && sourceRank(reg.Source) > sourceRank(incumbent.Source));
        if (beats) winners.set(key, reg);
    }
    return [...winners.values()];
}
```

Replace the private `entityMatches` in the same file with a call to `FormContributionEntityMatches`. Extend `registeredWinner` to copy `Source`, `ComponentID`, `Title`, `Presentation` onto `FormContributionWinner` (add those optional fields to the `FormContributionWinner` interface).

- [ ] **Step 4: Run tests**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (node)"`
Expected: PASS, including the pre-existing collapse tests (they never relied on row-first ordering).

- [ ] **Step 5: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/panel-slot/base-form-panel.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/form-contribution.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/form-contribution.test.ts
```

---

### Task A5: Merged, memoized registration collector

**Files:**
- Create: `packages/Angular/Generic/base-forms/src/lib/panel-slot/collect-form-contribution-registrations.ts`
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/collect-form-panel-registrations.ts` (becomes a wrapper)
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/form-contribution.ts` (`FormContributionRegistration.Registration?: ClassRegistration`)
- Modify: `packages/Angular/Generic/base-forms/src/public-api.ts`
- Test: `packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/collect-form-contribution-registrations.test.ts`

**Interfaces:**
- Consumes: `InteractiveFormsEngine.Instance.{Loaded, Config, Contributions$, GetApplicableContributions}` (A3); `MJEntityFormContributionEntity` (A2); `FormContributionRegistration` (A4).
- Produces: `CollectClassFormPanelRegistrations(): FormContributionRegistration[]` (class only, carries `Registration`); `MetadataContributionToRegistration(row: MJEntityFormContributionEntity): FormContributionRegistration`; `CollectFormContributionRegistrations(entity: EntityInfo | null | undefined, provider: IMetadataProvider | null | undefined): FormContributionRegistration[]` (merged, memoized); `InvalidateFormContributionRegistrationCache(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/collect-form-contribution-registrations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const engine = {
    Loaded: true,
    Config: vi.fn(async () => {}),
    subscribers: [] as Array<() => void>,
    rows: [] as unknown[],
    get Contributions$() { return { subscribe: (fn: () => void) => { engine.subscribers.push(fn); return { unsubscribe() {} }; } }; },
    GetApplicableContributions: vi.fn(() => engine.rows),
};
let classRegs: unknown[] = [];

vi.mock('@memberjunction/core-entities', () => ({ InteractiveFormsEngine: { get Instance() { return engine; } } }));
vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));
vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: {
        GetAllRegistrationsByMetadata: () => classRegs,
        GetAllRegistrations: () => classRegs,
    } } },
    SafeJSONParse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
    UUIDsEqual: (a: string, b: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
}));
vi.mock('../base-form-panel', () => ({ BaseFormPanel: class BaseFormPanel {} }));

import {
    CollectFormContributionRegistrations,
    InvalidateFormContributionRegistrationCache,
    MetadataContributionToRegistration,
} from '../collect-form-contribution-registrations';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';

const entity = { ID: 'ent-1', Name: 'MJ_BizApps_Common: People' } as unknown as EntityInfo;
const provider = { CurrentUser: { ID: 'user-1', UserRoles: [{ RoleID: 'role-1' }] } } as unknown as IMetadataProvider;

function row(over: Record<string, unknown>) {
    return {
        ID: 'row-1', Entity: 'MJ_BizApps_Common: People', ComponentID: 'comp-1', Name: 'LTV strip', Title: null, Icon: null,
        Slot: 'before-fields', SortKey: 90, ContributionKey: 'skip:person-ltv', RelatedEntity: null, RelatedJoinField: null,
        ReplacesSectionKey: null, Inclusion: null, ChromeGroup: null, Presentation: 'bare', Priority: 0,
        Configuration: '{"metric":"ltv"}', ...over,
    };
}

beforeEach(() => {
    InvalidateFormContributionRegistrationCache();
    engine.rows = [];
    engine.subscribers = [];
    engine.Loaded = true;
    engine.Config.mockClear();
    engine.GetApplicableContributions.mockClear();
    classRegs = [{ Priority: 0, Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-fields' }, SubClass: class {} }];
});

describe('MetadataContributionToRegistration', () => {
    it('maps a row onto the compiled metadata shape with Source metadata', () => {
        const reg = MetadataContributionToRegistration(row({}) as never);
        expect(reg).toMatchObject({
            Priority: 0, Source: 'metadata', ComponentID: 'comp-1', RowID: 'row-1', Title: 'LTV strip',
            Presentation: 'bare', Configuration: { metric: 'ltv' },
            Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'before-fields', sortKey: 90, contributionKey: 'skip:person-ltv', presentation: 'bare' },
        });
        expect(reg.Metadata.relatedEntity).toBeUndefined();
    });

    it('carries related claims, replace keys, inclusion and chrome group', () => {
        const reg = MetadataContributionToRegistration(row({
            RelatedEntity: 'MJ_BizApps_Orders: Event Order Lines', RelatedJoinField: 'PersonID',
            ReplacesSectionKey: 'details', Inclusion: 'More', ChromeGroup: 'more', Configuration: null,
        }) as never);
        expect(reg.Metadata).toMatchObject({
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID',
            replacesSectionKey: 'details', inclusion: 'More', chromeGroup: 'more',
        });
        expect(reg.Configuration).toEqual({});
    });
});

describe('CollectFormContributionRegistrations', () => {
    it('returns class registrations first, then applicable rows', () => {
        engine.rows = [row({})];
        const merged = CollectFormContributionRegistrations(entity, provider);
        expect(merged.map(r => r.Source ?? 'class')).toEqual(['class', 'metadata']);
        expect(engine.GetApplicableContributions).toHaveBeenCalledWith('ent-1', 'user-1', ['role-1']);
    });

    it('memoizes per entity + user until the engine emits', () => {
        engine.rows = [row({})];
        CollectFormContributionRegistrations(entity, provider);
        CollectFormContributionRegistrations(entity, provider);
        expect(engine.GetApplicableContributions).toHaveBeenCalledTimes(1);
        engine.subscribers.forEach(fn => fn());
        CollectFormContributionRegistrations(entity, provider);
        expect(engine.GetApplicableContributions).toHaveBeenCalledTimes(2);
    });

    it('recomputes when a compiled registration appears later (lazy-loaded module)', () => {
        CollectFormContributionRegistrations(entity, provider);
        classRegs = [...classRegs, { Priority: 0, Metadata: { entity: '*', slot: 'after-fields' }, SubClass: class {} }];
        expect(CollectFormContributionRegistrations(entity, provider)).toHaveLength(2);
    });

    it('kicks Config and returns class registrations when the engine is not loaded', () => {
        engine.Loaded = false;
        engine.rows = [row({})];
        const merged = CollectFormContributionRegistrations(entity, provider);
        expect(merged.every(r => (r.Source ?? 'class') === 'class')).toBe(true);
        expect(engine.Config).toHaveBeenCalledTimes(1);
    });

    it('returns class registrations only when entity or provider is missing', () => {
        expect(CollectFormContributionRegistrations(null, provider)).toHaveLength(1);
        expect(CollectFormContributionRegistrations(entity, null)).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (node)" src/lib/panel-slot/__tests__/collect-form-contribution-registrations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `Registration?` to the registration shape**

In `form-contribution.ts` add to `FormContributionRegistration`:

```ts
import type { ClassRegistration } from '@memberjunction/global';
    /** The ClassFactory registration for compiled panels — carries the component constructor. */
    Registration?: ClassRegistration;
```

- [ ] **Step 4: Create the collector**

```ts
// packages/Angular/Generic/base-forms/src/lib/panel-slot/collect-form-contribution-registrations.ts
import { LogError, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { InteractiveFormsEngine, type MJEntityFormContributionEntity } from '@memberjunction/core-entities';
import { MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { BaseFormPanel, type FormPanelRegistrationMetadata, type FormPanelSlot } from './base-form-panel';
import type { FormContributionRegistration } from './form-contribution';

/**
 * One list of form contributions from two sources:
 *   - compiled `BaseFormPanel` registrations in the ClassFactory (`Source: 'class'`)
 *   - Active, scope-matching `MJ: Entity Form Contributions` rows (`Source: 'metadata'`)
 *
 * Memoized per (entity, user). The memo key also folds in the ClassFactory
 * registration count (lazy-loaded OpenApp modules register late) and an engine
 * version that bumps on every `Contributions$` emission. The whole-form host
 * awaits the resolver — which Configs the engine — before the form mounts, so
 * slots normally see rows on first render; when the engine is cold this kicks a
 * `Config` and returns class registrations, and the emission re-fills the memo.
 */

const MAX_CACHE_ENTRIES = 16;
const cache = new Map<string, FormContributionRegistration[]>();
let engineVersion = 0;
let engineSubscribed = false;

function ensureEngineSubscription(): void {
    if (engineSubscribed) return;
    engineSubscribed = true;
    try {
        InteractiveFormsEngine.Instance.Contributions$.subscribe(() => {
            engineVersion++;
            cache.clear();
        });
    } catch (err) {
        engineSubscribed = false;
        LogError(`CollectFormContributionRegistrations: could not subscribe to Contributions$: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Test seam and escape hatch — drops every memoized list. */
export function InvalidateFormContributionRegistrationCache(): void {
    cache.clear();
}

/** Compiled `BaseFormPanel` registrations that declare an `entity`. */
export function CollectClassFormPanelRegistrations(): FormContributionRegistration[] {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrationsByMetadata(
        BaseFormPanel,
        (metadata) => {
            if (!metadata) return false;
            const entity = (metadata as Partial<FormPanelRegistrationMetadata>).entity;
            return typeof entity === 'string' && entity.length > 0;
        },
    ).map((reg) => ({
        Priority: reg.Priority,
        Metadata: reg.Metadata as FormPanelRegistrationMetadata,
        Source: 'class' as const,
        Registration: reg,
    }));
}

/** Project one `MJ: Entity Form Contributions` row onto the compiled metadata shape. */
export function MetadataContributionToRegistration(row: MJEntityFormContributionEntity): FormContributionRegistration {
    const metadata: FormPanelRegistrationMetadata = {
        entity: row.Entity,
        slot: row.Slot as FormPanelSlot,
        sortKey: row.SortKey ?? 0,
        presentation: row.Presentation,
    };
    if (row.ContributionKey) metadata.contributionKey = row.ContributionKey;
    if (row.RelatedEntity) metadata.relatedEntity = row.RelatedEntity;
    if (row.RelatedJoinField) metadata.relatedJoinField = row.RelatedJoinField;
    if (row.ReplacesSectionKey) metadata.replacesSectionKey = row.ReplacesSectionKey;
    if (row.Inclusion) metadata.inclusion = row.Inclusion;
    if (row.ChromeGroup) metadata.chromeGroup = row.ChromeGroup;
    return {
        Priority: row.Priority ?? 0,
        Metadata: metadata,
        Source: 'metadata',
        ComponentID: row.ComponentID,
        RowID: row.ID,
        Title: row.Title ?? row.Name,
        Icon: row.Icon ?? undefined,
        Presentation: row.Presentation,
        Configuration: SafeJSONParse<Record<string, unknown>>(row.Configuration ?? '', false) ?? {},
    };
}

/**
 * Class registrations plus the rows that apply to (entity, current user).
 * Falls back to class-only when there is no entity or provider (standalone
 * panel composition outside a form).
 */
export function CollectFormContributionRegistrations(
    entity: EntityInfo | null | undefined,
    provider: IMetadataProvider | null | undefined,
): FormContributionRegistration[] {
    const classRegs = CollectClassFormPanelRegistrations();
    if (!entity || !provider) return classRegs;

    ensureEngineSubscription();
    const user = provider.CurrentUser;
    const userID = user?.ID ?? '';
    const roleIDs = (user?.UserRoles ?? []).map((r) => r.RoleID).filter((id): id is string => !!id);
    const classCount = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseFormPanel).length;
    const key = `${entity.Name}::${userID}::${classCount}::${engineVersion}`;
    const hit = cache.get(key);
    if (hit) return hit;

    let rows: MJEntityFormContributionEntity[] = [];
    try {
        const engine = InteractiveFormsEngine.Instance;
        if (engine.Loaded) {
            rows = engine.GetApplicableContributions(entity.ID, userID, roleIDs);
        } else {
            void engine.Config(false, user ?? undefined, provider);
        }
    } catch (err) {
        LogError(`CollectFormContributionRegistrations: engine read failed for ${entity.Name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const merged = [...classRegs, ...rows.map(MetadataContributionToRegistration)];
    if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, merged);
    return merged;
}
```

Replace the body of `collect-form-panel-registrations.ts` with a wrapper so nothing else breaks:

```ts
import { CollectClassFormPanelRegistrations } from './collect-form-contribution-registrations';
import type { FormContributionRegistration } from './form-contribution';

/**
 * @deprecated Compiled registrations only. Use {@link CollectFormContributionRegistrations}
 * (which also includes `MJ: Entity Form Contributions` rows) everywhere a form is in scope.
 */
export function CollectFormPanelRegistrations(): FormContributionRegistration[] {
    return CollectClassFormPanelRegistrations();
}
```

Add `export * from './lib/panel-slot/collect-form-contribution-registrations';` to `public-api.ts` under the panel-slot block.

Verify the generated getter names used above (`Entity`, `RelatedEntity`, `Slot`, `Presentation`, `Inclusion`, `ChromeGroup`) against `packages/MJCoreEntities/src/generated/entities/__mj.ts`. CodeGen names the FK display column after the FK column minus `ID`; if `RelatedEntityID` produced a differently named getter, use that name.

- [ ] **Step 5: Run tests**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (node)"`
Expected: PASS.

- [ ] **Step 6: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/panel-slot/collect-form-contribution-registrations.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/collect-form-panel-registrations.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/form-contribution.ts packages/Angular/Generic/base-forms/src/public-api.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/collect-form-contribution-registrations.test.ts
```

---

### Task A6: `InteractiveFormPanelComponent` — the React panel host

**Files:**
- Create: `packages/Angular/Generic/base-forms/src/lib/interactive-form/form-panel-host-props.builder.ts`
- Create: `packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form-panel.component.ts`
- Create: `packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form-panel.component.html`
- Modify: `packages/Angular/Generic/base-forms/src/module.ts`, `packages/Angular/Generic/base-forms/src/public-api.ts`
- Test: `packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form-panel.component.dom.test.ts`

**Interfaces:**
- Consumes: `FormPanelHostProps`, `FormPanelEventNames`, `FormPanelMethodNames`, `FormPanelValidateResult`, `isFormPanelRole` (A1); `FormContributionRegistration` (A4/A5); `InteractiveFormsEngine.FindComponentByID` (A3); `ResolveContributionKey` (existing).
- Produces: `BuildFormPanelHostProps(input: BuildFormPanelHostPropsInput): FormPanelHostProps`; `InteractiveFormPanelComponent extends BaseFormPanel` with `@Input() Contribution!: FormContributionRegistration`, `SectionKey`, `Title`, `Icon`, `IsBare`, `Variant`, `OnReactComponentEvent`, `OnOpenEntityRecord`, `OnRecordRefreshed`, `validate()`, `RebuildHostProps()`; selector `mj-interactive-form-panel`.

- [ ] **Step 1: Write the failing DOM test**

```ts
// packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form-panel.component.dom.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { BaseEntity } from '@memberjunction/core';
import { ReactBridgeService } from '@memberjunction/ng-react';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { InteractiveFormPanelComponent } from './interactive-form-panel.component';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import type { BaseFormComponent } from '../base-form-component';

/**
 * DOM coverage for <mj-interactive-form-panel> — the generic BaseFormPanel that renders a
 * metadata contribution's React component. Spec loading (engine + React bridge) lives in
 * ngOnInit and is stubbed; these cover the host's own chrome decisions: bare vs panel wrapping,
 * loading / error / mounted states, and the section identity handed to the collapsible panel.
 */

@Component({ standalone: true, selector: 'mj-react-component', template: '<div class="react-stub"></div>' })
class ReactStub { @Input() component: unknown; @Input() componentProps: unknown;
  @Output() componentEvent = new EventEmitter<unknown>(); @Output() openEntityRecord = new EventEmitter<unknown>(); }
@Component({ standalone: true, selector: 'mj-alert', template: '<ng-content></ng-content>' })
class AlertStub { @Input() Variant = ''; }
@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<section class="panel-stub" [attr.data-key]="SectionKey" [attr.data-name]="SectionName"><ng-content></ng-content></section>' })
class PanelStub { @Input() SectionKey = ''; @Input() SectionName = ''; @Input() Icon = ''; @Input() Variant = ''; @Input() Form: unknown; @Input() FormContext: unknown; @Input() DefaultExpanded: unknown; }

const RECORD = { EntityInfo: { Name: 'MJ_BizApps_Common: People' }, Fields: [], GetAll: () => ({}), PrimaryKey: { HasValue: false } } as unknown as BaseEntity;
const FORM = { EditMode: false, UserCanEdit: true, UserCanDelete: false, UserCanCreate: false, IsSectionExpanded: () => true, SetSectionRowCount: vi.fn(), formContext: {} } as unknown as BaseFormComponent;

function contribution(over: Partial<FormContributionRegistration> = {}): FormContributionRegistration {
  return {
    Priority: 0, Source: 'metadata', ComponentID: 'comp-1', RowID: 'row-1', Title: 'Lifetime value', Presentation: 'panel',
    Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-fields', contributionKey: 'skip:person-ltv' },
    ...over,
  };
}

interface State { loadError?: string | null; componentSpec?: unknown; hostProps?: unknown }
type OnInitProto = { ngOnInit: () => Promise<void> };
function render(c: FormContributionRegistration, state: State = {}) {
  vi.spyOn(InteractiveFormPanelComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
  return renderComponentFixture(InteractiveFormPanelComponent, {
    imports: [ReactStub, AlertStub, PanelStub],
    declarations: [InteractiveFormPanelComponent],
    providers: [{ provide: ReactBridgeService, useValue: {} }],
    inputs: { Contribution: c, Record: RECORD, FormComponent: FORM },
    setup: (inst) => {
      if (state.loadError !== undefined) inst.loadError = state.loadError;
      if (state.componentSpec !== undefined) inst.componentSpec = state.componentSpec as never;
      if (state.hostProps !== undefined) inst.hostProps = state.hostProps as never;
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('InteractiveFormPanelComponent (DOM)', () => {
  it('wraps a panel-presentation contribution in a collapsible panel keyed by the contribution key', () => {
    const f = render(contribution());
    const panel = query(f, '.panel-stub');
    expect(panel?.getAttribute('data-key')).toBe('skip:person-ltv');
    expect(panel?.getAttribute('data-name')).toBe('Lifetime value');
  });

  it('renders a bare contribution with no collapsible panel', () => {
    const f = render(contribution({ Presentation: 'bare' }));
    expect(query(f, '.panel-stub')).toBeNull();
    expect(query(f, '.mj-loading-state')).not.toBeNull();
  });

  it('shows the loading state until spec and props exist, then mounts the React component', () => {
    expect(query(render(contribution()), '.react-stub')).toBeNull();
    const mounted = render(contribution(), { componentSpec: { name: 'X' }, hostProps: { record: {} } });
    expect(query(mounted, '.react-stub')).not.toBeNull();
    expect(query(mounted, '.mj-loading-state')).toBeNull();
  });

  it('shows the load error instead of the React component', () => {
    const f = render(contribution(), { loadError: 'Component comp-1 not found.' });
    expect(text(f, 'mj-alert')).toContain('Component comp-1 not found.');
    expect(query(f, '.react-stub')).toBeNull();
  });

  it('uses the related-entity variant when the contribution claims a grid', () => {
    const f = render(contribution({ Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-related', relatedEntity: 'MJ_BizApps_Orders: Event Order Lines' } }));
    expect(f.componentInstance.Variant).toBe('related-entity');
    expect(f.componentInstance.SectionKey).toBe('related:MJ_BizApps_Orders: Event Order Lines:');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (dom)" src/lib/interactive-form/interactive-form-panel.component.dom.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the props builder**

```ts
// packages/Angular/Generic/base-forms/src/lib/interactive-form/form-panel-host-props.builder.ts
import type { BaseEntity, CompositeKey } from '@memberjunction/core';
import { SimpleEntityFieldInfo } from '@memberjunction/interactive-component-types';
import type { FormPanelHostProps } from '@memberjunction/interactive-component-types/forms';
import type { BaseFormComponent } from '../base-form-component';
import type { FormContributionRegistration } from '../panel-slot/form-contribution';
import { StripJoinFieldBrackets } from '../panel-slot/form-contribution';

export interface BuildFormPanelHostPropsInput {
    Record: BaseEntity;
    /** Null when previewing outside a form (artifact viewer). Permissions then read false. */
    FormComponent: BaseFormComponent | null;
    Contribution: FormContributionRegistration;
    SectionKey: string;
    Layout: 'accordion' | 'left-nav';
    IsExpanded: boolean;
}

function primaryKeyToPlain(pk: CompositeKey | null | undefined): Record<string, unknown> | null {
    if (!pk || !pk.HasValue) return null;
    const out: Record<string, unknown> = {};
    for (const kvp of pk.KeyValuePairs ?? []) out[kvp.FieldName] = kvp.Value;
    return out;
}

/**
 * Build `FormPanelHostProps` for a metadata contribution. Same record snapshot the
 * whole-form host builds, plus the contribution context and — for related claims —
 * prebuilt view params so the panel never hand-writes an FK filter.
 */
export function BuildFormPanelHostProps(input: BuildFormPanelHostPropsInput): FormPanelHostProps {
    const { Record: record, FormComponent: form, Contribution: contribution } = input;
    const meta = contribution.Metadata;
    const pk = record.PrimaryKey;
    const primaryKey = primaryKeyToPlain(pk);
    const mode: FormPanelHostProps['mode'] = form?.EditMode ? 'edit' : (primaryKey ? 'view' : 'create');

    const props: FormPanelHostProps = {
        entityName: record.EntityInfo.Name,
        primaryKey,
        record: record.GetAll(),
        entityMetadata: {
            fields: record.Fields.map((f) => SimpleEntityFieldInfo.FromEntityFieldInfo(f.EntityFieldInfo)),
            displayName: record.EntityInfo.DisplayName ?? record.EntityInfo.Name,
            nameField: record.EntityInfo.NameField?.Name,
        },
        mode,
        canEdit: form?.UserCanEdit ?? false,
        canDelete: form?.UserCanDelete ?? false,
        canCreate: form?.UserCanCreate ?? false,
        contribution: {
            key: input.SectionKey,
            slot: meta.slot,
            title: contribution.Title ?? meta.contributionKey ?? input.SectionKey,
            presentation: contribution.Presentation ?? meta.presentation ?? 'panel',
            configuration: contribution.Configuration ?? {},
        },
        isExpanded: input.IsExpanded,
        layout: input.Layout,
    };

    const related = meta.relatedEntity?.trim();
    if (related && form) {
        const join = StripJoinFieldBrackets(meta.relatedJoinField) || undefined;
        const viewParams = form.BuildRelationshipViewParamsByEntityName(related, join);
        props.related = {
            entityName: related,
            joinField: join,
            viewParams: {
                EntityName: viewParams.EntityName ?? related,
                ExtraFilter: viewParams.ExtraFilter ?? '',
                OrderBy: viewParams.OrderBy,
            },
            newRecordValues: form.NewRecordValues(related, join),
        };
    }
    return props;
}
```

- [ ] **Step 4: Create the component**

```ts
// packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form-panel.component.ts
import { ChangeDetectorRef, Component, DoCheck, Input, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { LogError, ValidationResult, type BaseEntity, type CompositeKey } from '@memberjunction/core';
import { ValidationErrorInfo } from '@memberjunction/global';
import { InteractiveFormsEngine } from '@memberjunction/core-entities';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
    FormPanelEventNames,
    FormPanelMethodNames,
    isFormPanelRole,
    type FormPanelHostProps,
    type FormPanelRowCountChangedArgs,
    type FormPanelValidateResult,
    type FormFieldChangedArgs,
    type FormValidationChangedArgs,
} from '@memberjunction/interactive-component-types/forms';
import { MJReactComponent, ReactBridgeService, type ReactComponentEvent } from '@memberjunction/ng-react';
import { BaseFormPanel } from '../panel-slot/base-form-panel';
import { ResolveContributionKey, type FormContributionRegistration } from '../panel-slot/form-contribution';
import { BuildFormPanelHostProps } from './form-panel-host-props.builder';

/**
 * Generic host for a metadata form contribution (`MJ: Entity Form Contributions` row →
 * `componentRole: 'form-panel'` React component). Mounted by `<mj-form-panel-slot>` for
 * `Source: 'metadata'` winners exactly where a compiled BaseFormPanel would mount.
 *
 * Layering: the React component never touches BaseEntity. This host owns the
 * `FormPanelHostProps` snapshot, applies `FieldChanged` to the PARENT record (the
 * parent form's Save persists it), forwards `RowCountChanged` to the rail badge, and
 * surfaces `Validate` through `BaseFormPanel.validate()`.
 */
@Component({
    standalone: false,
    selector: 'mj-interactive-form-panel',
    templateUrl: './interactive-form-panel.component.html',
})
export class InteractiveFormPanelComponent extends BaseFormPanel implements OnInit, DoCheck, OnDestroy {
    @Input() Contribution!: FormContributionRegistration;

    @ViewChild('reactComponent') public reactComponent?: MJReactComponent;

    public componentSpec: ComponentSpec | null = null;
    public hostProps: FormPanelHostProps | null = null;
    public loadError: string | null = null;

    private lastValidation: FormPanelValidateResult | null = null;
    private lastEditMode: boolean | null = null;
    private lastExpanded: boolean | null = null;
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly reactBridge = inject(ReactBridgeService);

    /** Section identity — the contribution key, or a unique fallback for keyless rows. */
    public get SectionKey(): string {
        const key = ResolveContributionKey(this.Contribution.Metadata);
        return key || `contribution:${this.Contribution.RowID ?? this.Contribution.ComponentID ?? 'unknown'}`;
    }

    public get Title(): string {
        return this.Contribution.Title ?? this.Contribution.Metadata.contributionKey ?? this.SectionKey;
    }

    public get Icon(): string {
        return this.Contribution.Icon ?? 'fa-solid fa-puzzle-piece';
    }

    public get IsBare(): boolean {
        return (this.Contribution.Presentation ?? this.Contribution.Metadata.presentation) === 'bare';
    }

    public get IsRelatedClaim(): boolean {
        return !!this.Contribution.Metadata.relatedEntity?.trim();
    }

    public get Variant(): 'default' | 'related-entity' {
        return this.IsRelatedClaim ? 'related-entity' : 'default';
    }

    public async ngOnInit(): Promise<void> {
        try {
            await this.reactBridge.getReactContext();
        } catch (err) {
            LogError(`InteractiveFormPanelComponent: React bridge bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
            this.loadError = 'React runtime failed to load. Try a hard refresh.';
            return;
        }
        await this.loadSpec();
        this.RebuildHostProps();
    }

    /** Edit mode and expanded state are not inputs; detect their transitions cheaply. */
    public ngDoCheck(): void {
        const edit = this.FormComponent?.EditMode ?? false;
        const expanded = this.isExpanded();
        if (edit !== this.lastEditMode || expanded !== this.lastExpanded) {
            const modeChanged = this.lastEditMode !== null && edit !== this.lastEditMode;
            this.lastEditMode = edit;
            this.lastExpanded = expanded;
            if (this.hostProps) this.RebuildHostProps();
            if (modeChanged) this.invokeIfRegistered(FormPanelMethodNames.SetEditMode, { mode: edit ? 'edit' : 'view' });
        }
    }

    public ngOnDestroy(): void {
        this.hostProps = null;
    }

    public RebuildHostProps(): void {
        if (!this.Record) { this.hostProps = null; return; }
        this.hostProps = BuildFormPanelHostProps({
            Record: this.Record,
            FormComponent: this.FormComponent ?? null,
            Contribution: this.Contribution,
            SectionKey: this.SectionKey,
            Layout: this.FormComponent?.ChromeLayout ?? 'accordion',
            IsExpanded: this.isExpanded(),
        });
        this.cdr.markForCheck();
    }

    public async OnReactComponentEvent(event: ReactComponentEvent): Promise<void> {
        switch (event.type) {
            case FormPanelEventNames.RowCountChanged: {
                const args = event.payload as FormPanelRowCountChangedArgs;
                if (typeof args?.count === 'number') this.FormComponent?.SetSectionRowCount(this.SectionKey, args.count);
                break;
            }
            case FormPanelEventNames.FieldChanged: {
                const args = event.payload as FormFieldChangedArgs;
                this.applyFieldChange(args?.fieldName, args?.newValue);
                break;
            }
            case FormPanelEventNames.ValidationChanged: {
                const args = event.payload as FormValidationChangedArgs;
                this.lastValidation = { isValid: !!args?.isValid, errors: args?.errors ?? [] };
                break;
            }
        }
    }

    public OnOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
        this.FormComponent?.OnFormNavigate({ Kind: 'record', EntityName: event.entityName, PrimaryKey: event.key });
    }

    public override OnRecordRefreshed(record: BaseEntity): void {
        this.Record = record;
        this.RebuildHostProps();
        this.invokeIfRegistered(FormPanelMethodNames.OnRecordRefreshed);
    }

    /** Surface the panel's last reported validity to the parent form's Save. */
    public override validate(): ValidationResult {
        const live = this.invokeIfRegistered<FormPanelValidateResult>(FormPanelMethodNames.Validate);
        const state = live && typeof live === 'object' && 'isValid' in live ? live : this.lastValidation;
        const result = new ValidationResult();
        result.Success = state ? state.isValid : true;
        result.Errors = (state?.errors ?? []).map((message) => new ValidationErrorInfo(this.SectionKey, message, null));
        return result;
    }

    private isExpanded(): boolean {
        return this.FormComponent?.IsSectionExpanded(this.SectionKey, !this.IsRelatedClaim) ?? true;
    }

    private applyFieldChange(fieldName: string | undefined, value: unknown): void {
        if (!fieldName || !this.Record) return;
        const field = this.Record.Fields.find((f) => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
        if (!field) {
            LogError(`InteractiveFormPanelComponent: unknown field "${fieldName}" on ${this.Record.EntityInfo.Name}; change ignored.`);
            return;
        }
        // Dynamic field name from the React side — the same sanctioned Set() path the whole-form host uses.
        this.Record.Set(field.Name, value);
    }

    private invokeIfRegistered<T = unknown>(method: string, ...args: unknown[]): T | undefined {
        if (!this.reactComponent?.hasMethod?.(method)) return undefined;
        try {
            return this.reactComponent.invokeMethod(method, ...args) as T;
        } catch (err) {
            LogError(`InteractiveFormPanelComponent.${method}: ${err instanceof Error ? err.message : String(err)}`);
            return undefined;
        }
    }

    private async loadSpec(): Promise<void> {
        const id = this.Contribution?.ComponentID;
        if (!id) { this.loadError = 'Contribution has no ComponentID.'; return; }
        const provider = this.FormComponent?.ProviderToUse;
        try {
            if (provider) await InteractiveFormsEngine.Instance.Config(false, provider.CurrentUser, provider);
        } catch (err) {
            LogError(`InteractiveFormPanelComponent: engine Config failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        const component = InteractiveFormsEngine.Instance.FindComponentByID(id);
        if (!component) { this.loadError = `Component ${id} not found.`; return; }
        try {
            this.componentSpec = JSON.parse(component.Specification ?? 'null') as ComponentSpec;
        } catch (err) {
            this.loadError = `Component ${component.Name} has invalid Specification JSON: ${err instanceof Error ? err.message : String(err)}`;
            return;
        }
        if (!this.componentSpec) { this.loadError = `Component ${component.Name} has an empty Specification.`; return; }
        if (!isFormPanelRole(this.componentSpec)) {
            this.loadError = `Component ${component.Name} does not declare componentRole='form-panel'.`;
            this.componentSpec = null;
        }
        this.cdr.markForCheck();
    }
}

/** Tree-shaking guard, mirrors LoadInteractiveFormComponent. */
export function LoadInteractiveFormPanelComponent(): void {
    if (false as boolean) {
        const _: unknown = InteractiveFormPanelComponent;
    }
}
```

`BaseFormComponent.ChromeLayout` does not exist yet — Task A8 adds `public ChromeLayout: 'accordion' | 'left-nav' = 'accordion'` (set by the container). Until A8 lands, keep `Layout: 'accordion'`.

Template:

```html
<!-- packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form-panel.component.html -->
@if (Contribution) {
  @if (IsBare) {
    <ng-container *ngTemplateOutlet="body"></ng-container>
  } @else {
    <mj-collapsible-panel
      [SectionKey]="SectionKey"
      [SectionName]="Title"
      [Icon]="Icon"
      [Variant]="Variant"
      [Form]="FormComponent"
      [FormContext]="FormContext"
      [DefaultExpanded]="!IsRelatedClaim">
      <ng-container *ngTemplateOutlet="body"></ng-container>
    </mj-collapsible-panel>
  }
}

<ng-template #body>
  @if (loadError) {
    <mj-alert Variant="error">{{ loadError }}</mj-alert>
  } @else if (componentSpec && hostProps) {
    <mj-react-component
      #reactComponent
      [component]="componentSpec"
      [componentProps]="hostProps"
      (componentEvent)="OnReactComponentEvent($event)"
      (openEntityRecord)="OnOpenEntityRecord($event)">
    </mj-react-component>
  } @else {
    <div class="mj-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>Loading panel…</span>
    </div>
  }
</ng-template>
```

Register in `module.ts` (`declarations` and `exports`, next to `InteractiveFormComponent`) and export from `public-api.ts`:

```ts
export * from './lib/interactive-form/interactive-form-panel.component';
export * from './lib/interactive-form/form-panel-host-props.builder';
```

- [ ] **Step 5: Run tests and build**

Run: `cd packages/Angular/Generic/base-forms && pnpm test && pnpm run build`
Expected: PASS; build clean (`NgTemplateOutlet` comes from `CommonModule`, already imported).

- [ ] **Step 6: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/interactive-form/ packages/Angular/Generic/base-forms/src/module.ts packages/Angular/Generic/base-forms/src/public-api.ts
```

---

### Task A7: Slot host mounts metadata contributions and registers panels with the form

**Files:**
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/form-panel-slot.component.ts`
- Test: `packages/Angular/Generic/base-forms/src/lib/panel-slot/form-panel-slot.component.dom.test.ts` (append)

**Interfaces:**
- Consumes: `CollectFormContributionRegistrations` (A5), `FormContributionEntityMatches` (A4), `InteractiveFormPanelComponent` (A6), `BaseFormComponent.RegisterFormPanel/UnregisterFormPanel` (A8 — add no-op-safe optional calls now: `this.FormComponent.RegisterFormPanel?.(instance)`).
- Produces: metadata winners mount as `InteractiveFormPanelComponent`; strict entity matching with a one-time warning for loose-only matches.

- [ ] **Step 1: Write the failing DOM test (append)**

```ts
// append to form-panel-slot.component.dom.test.ts
import { InteractiveFormPanelComponent } from '../interactive-form/interactive-form-panel.component';
import { InvalidateFormContributionRegistrationCache } from './collect-form-contribution-registrations';

const engineState = { Loaded: true, rows: [] as unknown[] };
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    InteractiveFormsEngine: { get Instance() { return {
      Loaded: engineState.Loaded,
      Config: async () => {},
      Contributions$: { subscribe: () => ({ unsubscribe() {} }) },
      GetApplicableContributions: () => engineState.rows,
    }; } },
  };
});

const METADATA_ENTITY = 'ZZZ_MetadataSlotEntity';
const RECORD_WITH_ENTITY = { Get: () => null, EntityInfo: { ID: 'ent-zzz', Name: METADATA_ENTITY } } as unknown as BaseEntity;
const FORM_WITH_PROVIDER = {
  ProviderToUse: { CurrentUser: { ID: 'u1', UserRoles: [] } },
  RegisterFormPanel: vi.fn(), UnregisterFormPanel: vi.fn(),
} as unknown as BaseFormComponent;

describe('FormPanelSlotComponent (DOM) — metadata contributions', () => {
  it('mounts an InteractiveFormPanelComponent for a metadata row registered for this entity + slot', () => {
    InvalidateFormContributionRegistrationCache();
    engineState.rows = [{
      ID: 'row-1', Entity: METADATA_ENTITY, ComponentID: 'comp-1', Name: 'Row panel', Title: null, Icon: null,
      Slot: 'after-fields', SortKey: 0, ContributionKey: 'row:one', RelatedEntity: null, RelatedJoinField: null,
      ReplacesSectionKey: null, Inclusion: null, ChromeGroup: null, Presentation: 'panel', Priority: 0, Configuration: null,
    }];
    vi.spyOn(InteractiveFormPanelComponent.prototype as unknown as { ngOnInit: () => Promise<void> }, 'ngOnInit').mockResolvedValue(undefined);
    const f = renderComponentFixture(FormPanelSlotComponent, {
      declarations: [FormPanelSlotComponent, InteractiveFormPanelComponent],
      inputs: { Entity: METADATA_ENTITY, Slot: 'after-fields', Record: RECORD_WITH_ENTITY, FormComponent: FORM_WITH_PROVIDER },
    });
    f.componentRef.setInput('FormContext', {});
    f.detectChanges();
    const mounted = f.debugElement.query(By.directive(InteractiveFormPanelComponent))?.componentInstance as InteractiveFormPanelComponent | undefined;
    expect(mounted).toBeDefined();
    expect(mounted?.Contribution.ComponentID).toBe('comp-1');
    expect((FORM_WITH_PROVIDER as unknown as { RegisterFormPanel: ReturnType<typeof vi.fn> }).RegisterFormPanel).toHaveBeenCalledWith(mounted);
  });

  it('does not mount a compiled panel registered for a loosely-matching entity name', () => {
    const f = render('MJ: ZZZ_SlotTestEntity');   // differs only by prefix from TEST_ENTITY
    expect(query(f, '.fake-slot')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (dom)" src/lib/panel-slot/form-panel-slot.component.dom.test.ts`
Expected: the first new test FAILS (no metadata mount); the second FAILS today because loose matching mounts the panel.

- [ ] **Step 3: Rewrite discovery and mounting in `form-panel-slot.component.ts`**

Replace the imports of `ClassRegistration`/`MJGlobal` usage and the `findRegistrations` / `findOrphans` / `entityMatches` / mount loop with:

```ts
import { CollectFormContributionRegistrations } from './collect-form-contribution-registrations';
import { CollapseFormPanelRegistrations, FormContributionEntityMatches, type FormContributionRegistration } from './form-contribution';
import { InteractiveFormPanelComponent } from '../interactive-form/interactive-form-panel.component';
```

```ts
    private warnedLooseEntities = new Set<string>();

    private allForEntity(): FormContributionRegistration[] {
        const entity = this.Record?.EntityInfo ?? null;
        const provider = this.FormComponent?.ProviderToUse ?? null;
        const all = CollectFormContributionRegistrations(entity, provider);
        const strict = all.filter((reg) => FormContributionEntityMatches(reg.Metadata.entity, this.Entity));
        if (strict.length === 0) this.warnIfLooseOnly(all);
        return strict;
    }

    /** Diagnostic for the old prefix-insensitive match — a loosely named registration never mounts and never hides its baked grid. */
    private warnIfLooseOnly(all: readonly FormContributionRegistration[]): void {
        if (this.warnedLooseEntities.has(this.Entity)) return;
        const strip = (s: string) => s.replace(/^mj[:_\s]+/i, '').replace(/[\s_]+/g, '').toLowerCase();
        const loose = all.filter((reg) => reg.Metadata.entity !== '*' && strip(reg.Metadata.entity) === strip(this.Entity));
        if (loose.length > 0) {
            this.warnedLooseEntities.add(this.Entity);
            console.warn(`[mj-form-panel-slot] ${loose.length} BaseFormPanel registration(s) name "${loose[0].Metadata.entity}" but the form entity is "${this.Entity}". Entity names must match exactly; these panels will not mount.`);
        }
    }

    private findRegistrations(slot: FormPanelSlot): FormContributionRegistration[] {
        return this.allForEntity().filter((reg) => reg.Metadata.slot === slot);
    }

    private findOrphans(): FormContributionRegistration[] {
        if (!this.coordinator) return [];
        return this.allForEntity().filter((reg) => {
            const slot = reg.Metadata.slot;
            return slot != null && slot !== this.Slot && this.coordinator!.resolveSlot(slot) === this.Slot;
        });
    }
```

and in `remount()`:

```ts
        const all = CollapseFormPanelRegistrations([...direct, ...orphans]);
        if (all.length === 0) { this.remountDepth--; return; }
        all.sort((a, b) => {
            const aSort = a.Metadata.sortKey ?? 0;
            const bSort = b.Metadata.sortKey ?? 0;
            if (aSort !== bSort) return bSort - aSort;
            return b.Priority - a.Priority;
        });

        for (const reg of all) {
            try {
                const ref = reg.Source === 'metadata'
                    ? this.mountMetadata(reg)
                    : this.mountClass(reg);
                if (!ref) continue;
                ref.instance.Record = this.Record;
                ref.instance.FormComponent = this.FormComponent;
                if (this.FormContext) ref.instance.FormContext = this.FormContext;
                const host = ref.location.nativeElement as HTMLElement | null;
                if (host) host.style.display = 'contents';
                this.FormComponent.RegisterFormPanel?.(ref.instance);
                this.mounted.push(ref);
            } catch (e) {
                LogError(`[mj-form-panel-slot] Failed to mount panel for ${this.Entity}:${this.Slot}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
```

```ts
    private mountClass(reg: FormContributionRegistration): ComponentRef<BaseFormPanel> | null {
        const ctor = reg.Registration?.SubClass as Type<BaseFormPanel> | undefined;
        if (!ctor) {
            LogError(`[mj-form-panel-slot] compiled registration for ${reg.Metadata.entity}:${reg.Metadata.slot} has no constructor`);
            return null;
        }
        return this.anchor.createComponent(ctor);
    }

    private mountMetadata(reg: FormContributionRegistration): ComponentRef<BaseFormPanel> {
        const ref = this.anchor.createComponent(InteractiveFormPanelComponent);
        ref.instance.Contribution = reg;
        return ref;
    }

    private unmountAll(): void {
        for (const ref of this.mounted) this.FormComponent?.UnregisterFormPanel?.(ref.instance);
        this.anchor.clear();
        this.mounted = [];
    }
```

Remove the now-unused `MJGlobal` / `ClassRegistration` imports. Until Task A8 adds `RegisterFormPanel` / `UnregisterFormPanel` to `BaseFormComponent`, declare them on a local structural type: `type PanelRegistry = { RegisterFormPanel?(p: BaseFormPanel): void; UnregisterFormPanel?(p: BaseFormPanel): void }` and call through `(this.FormComponent as BaseFormComponent & PanelRegistry)`.

- [ ] **Step 4: Run tests**

Run: `cd packages/Angular/Generic/base-forms && pnpm test`
Expected: PASS, including the pre-existing slot tests (exact entity names).

- [ ] **Step 5: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/panel-slot/form-panel-slot.component.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/form-panel-slot.component.dom.test.ts
```

---

### Task A8: `BaseFormComponent` — panel registry, merged validation, memoized hidden keys, snapshot surface

**Files:**
- Create: `packages/Angular/Generic/base-forms/src/lib/panel-slot/merge-panel-validation.ts`
- Modify: `packages/Angular/Generic/base-forms/src/lib/base-form-component.ts` (imports at top; `formContext` block near line 952; `Validate()` near line 409; new members)
- Modify: `packages/Angular/Generic/base-forms/src/public-api.ts`
- Test: `packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/merge-panel-validation.test.ts`

**Interfaces:**
- Consumes: `CollectFormContributionRegistrations` (A5); `FormCompositionSnapshot` (A9 — declare the import now; A9 creates the file next, so land A8 and A9 in the same review or create the type file first).
- Produces: `MergePanelValidation(base: ValidationResult, panels: readonly ValidationResult[]): ValidationResult`; on `BaseFormComponent`: `RegisterFormPanel(panel: BaseFormPanel): void`, `UnregisterFormPanel(panel: BaseFormPanel): void`, `ChromeLayout: 'accordion' | 'left-nav'`, `CompositionSnapshot: FormCompositionSnapshot | null`, `@Output() CompositionChanged: EventEmitter<FormCompositionSnapshot>`; `Validate()` includes panel results; `contributionHiddenSectionKeys()` uses the merged collector.

- [ ] **Step 1: Write the failing test**

```ts
// packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/merge-panel-validation.test.ts
import { describe, it, expect } from 'vitest';
import { ValidationErrorInfo, ValidationResult } from '@memberjunction/global';
import { MergePanelValidation } from '../merge-panel-validation';

function result(success: boolean, ...messages: string[]): ValidationResult {
    const r = new ValidationResult();
    r.Success = success;
    r.Errors = messages.map((m) => new ValidationErrorInfo('panel', m, null));
    return r;
}

describe('MergePanelValidation', () => {
    it('returns the base result untouched when there are no panels', () => {
        const base = result(true);
        expect(MergePanelValidation(base, [])).toBe(base);
    });

    it('fails when any panel fails and concatenates errors in order', () => {
        const merged = MergePanelValidation(result(true), [result(true), result(false, 'Amount required')]);
        expect(merged.Success).toBe(false);
        expect(merged.Errors.map((e) => e.Message)).toEqual(['Amount required']);
    });

    it('keeps base errors first', () => {
        const merged = MergePanelValidation(result(false, 'Name required'), [result(false, 'Amount required')]);
        expect(merged.Errors.map((e) => e.Message)).toEqual(['Name required', 'Amount required']);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (node)" src/lib/panel-slot/__tests__/merge-panel-validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the merge helper**

```ts
// packages/Angular/Generic/base-forms/src/lib/panel-slot/merge-panel-validation.ts
import { ValidationResult } from '@memberjunction/global';

/**
 * Fold slot-mounted panels' `validate()` results into the record's own validation.
 * Base errors stay first so field-level messages keep their position.
 */
export function MergePanelValidation(base: ValidationResult, panels: readonly ValidationResult[]): ValidationResult {
    if (panels.length === 0) return base;
    const merged = new ValidationResult();
    merged.Success = base.Success && panels.every((p) => p.Success);
    merged.Errors = [...base.Errors, ...panels.flatMap((p) => p.Errors)];
    return merged;
}
```

Export from `public-api.ts`: `export * from './lib/panel-slot/merge-panel-validation';`

- [ ] **Step 4: Wire `BaseFormComponent`**

Imports:

```ts
import type { BaseFormPanel } from './panel-slot/base-form-panel';
import { CollectFormContributionRegistrations } from './panel-slot/collect-form-contribution-registrations';
import { MergePanelValidation } from './panel-slot/merge-panel-validation';
import type { FormCompositionSnapshot } from './chrome/form-composition-snapshot';
```

Remove the `CollectFormPanelRegistrations` import. New members (place after the existing `@Output()` block around line 259):

```ts
  /** Layout the container resolved for this form. Set by `<mj-record-form-container>`; read by panel hosts. */
  public ChromeLayout: 'accordion' | 'left-nav' = 'accordion';

  /** Last composition snapshot the container published. Consumers: agent context, Form Studio. */
  public CompositionSnapshot: FormCompositionSnapshot | null = null;
  @Output() CompositionChanged = new EventEmitter<FormCompositionSnapshot>();

  private readonly _formPanels = new Set<BaseFormPanel>();

  /** Slot hosts register every mounted panel so `Validate()` can include panel-owned validation. */
  public RegisterFormPanel(panel: BaseFormPanel): void {
    this._formPanels.add(panel);
  }

  public UnregisterFormPanel(panel: BaseFormPanel): void {
    this._formPanels.delete(panel);
  }
```

`Validate()` (currently `const valResults = (<BaseEntity>this.record).Validate();` … ) becomes:

```ts
  public Validate(): ValidationResult {
    const base = (<BaseEntity>this.record).Validate();
    const panelResults = [...this._formPanels].map((panel) => panel.validate());
    const valResults = MergePanelValidation(base, panelResults);
    // ...existing handling of valResults continues unchanged...
```

`contributionHiddenSectionKeys()` becomes:

```ts
  private contributionHiddenSectionKeys(): string[] {
    const entity = this.record?.EntityInfo;
    if (!entity) return [];
    return ContributionHiddenSectionKeys(
      entity.Name,
      entity.RelatedEntities,
      entity.ChildEntities.map((child) => child.ID),
      CollectFormContributionRegistrations(entity, this.ProviderToUse),
    );
  }
```

The collector is memoized (A5), so the per-change-detection `formContext` getter no longer rescans the ClassFactory.

- [ ] **Step 5: Run tests and build**

Run: `cd packages/Angular/Generic/base-forms && pnpm test && pnpm run build`
Expected: PASS. (Build requires A9's `form-composition-snapshot.ts` to exist; create it first if landing A8 alone.)

- [ ] **Step 6: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/panel-slot/merge-panel-validation.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/__tests__/merge-panel-validation.test.ts packages/Angular/Generic/base-forms/src/lib/base-form-component.ts packages/Angular/Generic/base-forms/src/public-api.ts
```

---

### Task A9: Container — merged registrations, `bare` exclusion, replace-key diagnostic, composition snapshot

**Files:**
- Create: `packages/Angular/Generic/base-forms/src/lib/chrome/form-composition-snapshot.ts`
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/form-slot-coordinator.service.ts` (`PresentSlots` getter)
- Modify: `packages/Angular/Generic/base-forms/src/lib/container/record-form-container.component.ts` (`contributionRegistrations`, `contributionHiddenSectionKeys`, `hiddenChromeSectionKeys`, `ResolveChrome`)
- Modify: `packages/Angular/Generic/base-forms/src/lib/panel-slot/form-contributions.component.ts`
- Modify: `packages/Angular/Generic/base-forms/src/public-api.ts`
- Test: `packages/Angular/Generic/base-forms/src/lib/chrome/__tests__/form-composition-snapshot.test.ts`

**Interfaces:**
- Consumes: `CollectFormContributionRegistrations` (A5); `ResolveFormContributions`, `RelatedEntitySectionKey`, `ResolveContributionKey`, `CollapseFormPanelRegistrations` (existing/A4); `FormChromeGroup`, `FormChromePanelSnapshot`, `FormRole`.
- Produces: `FormCompositionSnapshot` and sub-types; `BuildFormCompositionSnapshot(input: BuildFormCompositionSnapshotInput): FormCompositionSnapshot`; `FormSlotCoordinator.PresentSlots: FormPanelSlot[]`; container sets `fc.ChromeLayout`, `fc.CompositionSnapshot` and emits `fc.CompositionChanged` after every chrome resolve.

- [ ] **Step 1: Write the failing test**

```ts
// packages/Angular/Generic/base-forms/src/lib/chrome/__tests__/form-composition-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { BuildFormCompositionSnapshot } from '../form-composition-snapshot';
import type { FormContributionRegistration, FormContributionRelationship } from '../../panel-slot/form-contribution';

const PEOPLE = 'MJ_BizApps_Common: People';
const TICKETS = 'MJ_BizApps_Orders: Event Order Lines';
const ADDR = 'MJ_BizApps_Common: Addresses';

const rel = (related: string, id: string, join: string, seq: number): FormContributionRelationship =>
    ({ RelatedEntity: related, RelatedEntityID: id, RelatedEntityJoinField: join, DisplayInForm: true, Sequence: seq });

const tickets = rel(TICKETS, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PersonID', 1);
const addresses = rel(ADDR, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'RecordID', 2);

const regs: FormContributionRegistration[] = [
    { Priority: 0, Source: 'class', Metadata: { entity: PEOPLE, slot: 'before-fields', contributionKey: 'header', presentation: 'bare' } },
    { Priority: 0, Source: 'metadata', ComponentID: 'c1', Title: 'Tickets as cards', Presentation: 'panel',
      Metadata: { entity: PEOPLE, slot: 'after-related', relatedEntity: TICKETS, relatedJoinField: 'PersonID' } },
];

describe('BuildFormCompositionSnapshot', () => {
    const snapshot = BuildFormCompositionSnapshot({
        EntityName: PEOPLE,
        Layout: 'left-nav',
        Groups: [{ Key: 'details', Title: 'Details', Icon: '', SectionKeys: ['details', 'personalIdentity'], IsMore: false }],
        Panels: [
            { SectionKey: 'details', SectionName: 'Details', Variant: 'default' },
            { SectionKey: 'personalIdentity', SectionName: 'Personal Identity', Variant: 'default' },
            { SectionKey: 'mJBizAppsCommonAddresses', SectionName: 'Addresses', Variant: 'related-entity' },
        ],
        HiddenSectionKeys: new Set(['personalIdentity']),
        RelatedEntities: [tickets, addresses],
        IsaChildEntityIDs: [],
        BakedSectionKeys: ['mJBizAppsCommonAddresses'],
        Registrations: regs,
        RelatedRoles: new Map([['mJBizAppsCommonAddresses', 'Primary']]),
        HiddenContributionKeys: new Set(),
        SlotsPresent: ['before-fields', 'after-fields', 'after-everything'],
        ChromeRuleCount: 2,
    });

    it('lists sections with their rail group and hidden flag', () => {
        expect(snapshot.Sections).toEqual([
            { Key: 'details', Title: 'Details', Variant: 'default', Group: 'details', Hidden: false },
            { Key: 'personalIdentity', Title: 'Personal Identity', Variant: 'default', Group: 'details', Hidden: true },
            { Key: 'mJBizAppsCommonAddresses', Title: 'Addresses', Variant: 'related-entity', Group: null, Hidden: false },
        ]);
    });

    it('classifies related grids as baked / stock / claimed with their inclusion', () => {
        expect(snapshot.Related).toEqual([
            { Entity: TICKETS, JoinField: 'PersonID', SectionKey: 'mJBizAppsOrdersEventOrderLines', Inclusion: 'Auto', Source: 'claimed' },
            { Entity: ADDR, JoinField: 'RecordID', SectionKey: 'mJBizAppsCommonAddresses', Inclusion: 'Primary', Source: 'baked' },
        ]);
    });

    it('lists collapsed contributions with source and presentation', () => {
        expect(snapshot.Contributions).toEqual([
            { Key: 'header', Slot: 'before-fields', Source: 'class', Title: 'header', Presentation: 'bare', Hidden: false, Priority: 0 },
            { Key: `related:${TICKETS}:PersonID`, Slot: 'after-related', Source: 'metadata', Title: 'Tickets as cards', Presentation: 'panel', Hidden: false, Priority: 0 },
        ]);
    });

    it('carries entity, layout, slots and rule count', () => {
        expect(snapshot).toMatchObject({ Entity: PEOPLE, Layout: 'left-nav', SlotsPresent: ['before-fields', 'after-fields', 'after-everything'], ChromeRuleCount: 2 });
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (node)" src/lib/chrome/__tests__/form-composition-snapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the snapshot module**

```ts
// packages/Angular/Generic/base-forms/src/lib/chrome/form-composition-snapshot.ts
import type { FormInclusion, FormRole } from '@memberjunction/core';
import type { FormPanelSlot } from '../panel-slot/base-form-panel';
import {
    CollapseFormPanelRegistrations,
    RelatedContributionKey,
    RelatedEntitySectionKey,
    ResolveContributionKey,
    ResolveFormContributions,
    StripJoinFieldBrackets,
    type FormContributionRegistration,
    type FormContributionRelationship,
} from '../panel-slot/form-contribution';
import type { FormChromeGroup, FormChromePanelSnapshot } from './form-chrome';

/**
 * What is on this form right now — the input an agent needs to add or replace one piece.
 * Built by the container after every chrome resolve; published through
 * `BaseFormComponent.CompositionChanged`, then `NavigationService.SetAgentContext`.
 * Shape is mirrored by `SkipFormContext` in @askskip/types; keep field names stable.
 */
export interface FormCompositionSection {
    Key: string;
    Title: string;
    Variant: string;
    /** Rail group key, or null when the section is not in any first-class group. */
    Group: string | null;
    Hidden: boolean;
}

export interface FormCompositionRelated {
    Entity: string;
    JoinField: string;
    SectionKey: string;
    Inclusion: FormInclusion | 'Auto';
    /** baked = in the template; stock = container fill-in; claimed = a contribution replaced it. */
    Source: 'baked' | 'stock' | 'claimed';
}

export interface FormCompositionContribution {
    Key: string;
    Slot: FormPanelSlot;
    Source: 'class' | 'metadata';
    Title: string;
    Presentation: 'panel' | 'bare';
    /** Suppressed by an L3 rule or inclusion None. */
    Hidden: boolean;
    /** Last-wins rank; the apply flow uses incumbent + 1 to replace a compiled piece. */
    Priority: number;
}

export interface FormCompositionSnapshot {
    Entity: string;
    Layout: 'accordion' | 'left-nav';
    Sections: FormCompositionSection[];
    Related: FormCompositionRelated[];
    Contributions: FormCompositionContribution[];
    SlotsPresent: FormPanelSlot[];
    ChromeRuleCount: number;
}

export interface BuildFormCompositionSnapshotInput {
    EntityName: string;
    Layout: 'accordion' | 'left-nav';
    Groups: readonly FormChromeGroup[];
    Panels: readonly FormChromePanelSnapshot[];
    HiddenSectionKeys: ReadonlySet<string>;
    RelatedEntities: readonly FormContributionRelationship[];
    IsaChildEntityIDs: readonly string[];
    BakedSectionKeys: readonly string[];
    Registrations: readonly FormContributionRegistration[];
    /** SectionKey → resolved role for related grids (Primary | Detail). Detail reads as More. */
    RelatedRoles: ReadonlyMap<string, FormRole>;
    HiddenContributionKeys: ReadonlySet<string>;
    SlotsPresent: readonly FormPanelSlot[];
    ChromeRuleCount: number;
}

function groupOf(groups: readonly FormChromeGroup[], sectionKey: string): string | null {
    return groups.find((g) => !g.IsMore && g.SectionKeys.includes(sectionKey))?.Key ?? null;
}

function presentationOf(reg: FormContributionRegistration): 'panel' | 'bare' {
    return reg.Presentation ?? reg.Metadata.presentation ?? (reg.Metadata.contributionKey === 'header' ? 'bare' : 'panel');
}

export function BuildFormCompositionSnapshot(input: BuildFormCompositionSnapshotInput): FormCompositionSnapshot {
    const resolved = ResolveFormContributions({
        EntityName: input.EntityName,
        RelatedEntities: input.RelatedEntities,
        IsaChildEntityIDs: input.IsaChildEntityIDs,
        Registrations: input.Registrations,
        BakedSectionKeys: input.BakedSectionKeys,
        ShowRelatedEntities: true,
    });
    const stockKeys = new Set(resolved.StockGrids.map((g) => g.ContributionKey));
    const claimedKeys = new Set(
        resolved.Winners.filter((w) => w.Kind === 'registered' && w.RelatedEntity)
            .map((w) => RelatedContributionKey(w.RelatedEntity as string, w.RelatedJoinField)),
    );

    const visibleRelated = input.RelatedEntities
        .filter((rel) => rel.DisplayInForm && !input.IsaChildEntityIDs.some((id) => id.toLowerCase() === rel.RelatedEntityID.toLowerCase()))
        .sort((a, b) => (a.Sequence ?? 999999) - (b.Sequence ?? 999999) || a.RelatedEntity.localeCompare(b.RelatedEntity));

    const related: FormCompositionRelated[] = visibleRelated.map((rel) => {
        const join = StripJoinFieldBrackets(rel.RelatedEntityJoinField);
        const key = RelatedContributionKey(rel.RelatedEntity, join);
        const sectionKey = RelatedEntitySectionKey(rel, visibleRelated);
        const role = input.RelatedRoles.get(sectionKey);
        return {
            Entity: rel.RelatedEntity,
            JoinField: join,
            SectionKey: sectionKey,
            Inclusion: role === 'Primary' ? 'Primary' : role === 'Detail' ? 'More' : 'Auto',
            Source: claimedKeys.has(key) ? 'claimed' : stockKeys.has(key) ? 'stock' : 'baked',
        };
    });

    const applicable = input.Registrations.filter((reg) => reg.Metadata.entity === '*' || reg.Metadata.entity === input.EntityName);
    let unique = 0;
    const contributions: FormCompositionContribution[] = CollapseFormPanelRegistrations(applicable).map((reg) => {
        const key = ResolveContributionKey(reg.Metadata) || `__unique:${unique++}`;
        return {
            Key: key,
            Slot: reg.Metadata.slot,
            Source: reg.Source ?? 'class',
            Title: reg.Title ?? reg.Metadata.contributionKey ?? key,
            Presentation: presentationOf(reg),
            Hidden: input.HiddenContributionKeys.has(key),
            Priority: reg.Priority,
        };
    });

    return {
        Entity: input.EntityName,
        Layout: input.Layout,
        Sections: input.Panels.map((p) => ({
            Key: p.SectionKey,
            Title: p.SectionName,
            Variant: p.Variant,
            Group: groupOf(input.Groups, p.SectionKey),
            Hidden: input.HiddenSectionKeys.has(p.SectionKey),
        })),
        Related: related,
        Contributions: contributions,
        SlotsPresent: [...input.SlotsPresent],
        ChromeRuleCount: input.ChromeRuleCount,
    };
}
```

`FormSlotCoordinator` — add:

```ts
    /** Slots physically present in this form, in document order. */
    public get PresentSlots(): FormPanelSlot[] {
        return FORM_SLOT_CHAIN.filter((slot) => this.presentSlots.has(slot));
    }
```

- [ ] **Step 4: Wire the container**

Imports: replace `CollectFormPanelRegistrations` with `CollectFormContributionRegistrations` from `'../panel-slot/collect-form-contribution-registrations'`; add `import { BuildFormCompositionSnapshot } from '../chrome/form-composition-snapshot';`.

`contributionRegistrations()` — swap the source and the hero exclusion:

```ts
    const regs = [...CollectFormContributionRegistrations(this.EffectiveEntityInfo, this.ProviderToUse)]
      .sort((a, b) => (a.Priority ?? 0) - (b.Priority ?? 0));
    for (const reg of regs) {
      const meta = reg.Metadata;
      if (!meta || meta.entity !== entityName) continue;
      // Heroes are not rail sections. `presentation: 'bare'` is the contract; 'header' is the legacy convention.
      if (meta.contributionKey === 'header' || meta.presentation === 'bare' || reg.Presentation === 'bare') continue;
```

`contributionHiddenSectionKeys()` and `hiddenChromeSectionKeys()` — pass `CollectFormContributionRegistrations(entity, this.ProviderToUse)` instead of `CollectFormPanelRegistrations()`.

`ResolveChrome()` — after `this.chrome.Apply(result.Spec);` add:

```ts
    if (this.fc) this.fc.ChromeLayout = result.Spec.Layout;
    this.warnUnmatchedReplaceKeys();
    this.publishCompositionSnapshot(result.Spec);
```

New private members:

```ts
  private warnedReplaceKeys = new Set<string>();

  /**
   * Decision 4 render-time diagnostic: a `replacesSectionKey` that matches no panel hides
   * nothing and the hero mounts beside the section it meant to replace.
   */
  private warnUnmatchedReplaceKeys(): void {
    const entity = this.EffectiveEntityInfo;
    if (!entity) return;
    const present = new Set([...this.allChromePanels().map((p) => p.SectionKey), ...this.domPanelSnapshots().map((p) => p.SectionKey)]);
    for (const reg of CollectFormContributionRegistrations(entity, this.ProviderToUse)) {
      const key = reg.Metadata.replacesSectionKey?.trim();
      if (!key || reg.Metadata.entity !== entity.Name || present.has(key) || this.warnedReplaceKeys.has(key)) continue;
      this.warnedReplaceKeys.add(key);
      console.warn(`[mj-record-form-container] contribution ${ResolveContributionKey(reg.Metadata) || reg.RowID || 'unknown'} replaces section "${key}", but the ${entity.Name} form has no section with that key. Nothing was hidden.`);
    }
  }

  private publishCompositionSnapshot(spec: FormChromeSpec): void {
    const entity = this.EffectiveEntityInfo;
    const form = this.fc;
    if (!entity || !form) return;
    const hiddenContributionKeys = new Set(
      this.contributionRegistrations().filter((c) => c.Inclusion === 'None').map((c) => c.Key),
    );
    const snapshot = BuildFormCompositionSnapshot({
      EntityName: entity.Name,
      Layout: spec.Layout,
      Groups: spec.Groups,
      Panels: this.chromePanelSnapshots(),
      HiddenSectionKeys: this.contributionHiddenSectionKeys(),
      RelatedEntities: entity.RelatedEntities ?? [],
      IsaChildEntityIDs: (entity.ChildEntities ?? []).map((c) => c.ID),
      BakedSectionKeys: this.BakedRelatedSectionKeys,
      Registrations: CollectFormContributionRegistrations(entity, this.ProviderToUse),
      RelatedRoles: spec.RelatedRoles,
      HiddenContributionKeys: hiddenContributionKeys,
      SlotsPresent: this.slots.PresentSlots,
      ChromeRuleCount: this.chromeRules.length,
    });
    form.CompositionSnapshot = snapshot;
    form.CompositionChanged.emit(snapshot);
  }
```

`ResolveContributionKey` is already imported into the container from `'../panel-slot/form-contribution'`; add it if not. `FormChromeSpec` is imported from `'../chrome/form-chrome'`.

`form-contributions.component.ts` — replace `CollectFormPanelRegistrations()` with `CollectFormContributionRegistrations(entity, this.FormComponent.ProviderToUse)` and update the import.

Export from `public-api.ts`: `export * from './lib/chrome/form-composition-snapshot';`

- [ ] **Step 5: Run tests and build**

Run: `cd packages/Angular/Generic/base-forms && pnpm test && pnpm run build`
Expected: PASS; the container DOM test and `resolve-form-chrome.test.ts` still green.

- [ ] **Step 6: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/chrome/form-composition-snapshot.ts packages/Angular/Generic/base-forms/src/lib/chrome/__tests__/form-composition-snapshot.test.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/form-slot-coordinator.service.ts packages/Angular/Generic/base-forms/src/lib/container/record-form-container.component.ts packages/Angular/Generic/base-forms/src/lib/panel-slot/form-contributions.component.ts packages/Angular/Generic/base-forms/src/public-api.ts
```

---

### Task A10: Interactive whole-form emits slots; Phase A verification

**Files:**
- Modify: `packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form.component.html`
- Test: `packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form.component.dom.test.ts` (append)

**Interfaces:**
- Produces: `<mj-form-panel-slot>` for `top-area`, `before-fields`, `after-fields`, `after-related` inside the interactive form's container branch, so compiled and metadata contributions land in position instead of `after-everything`.

- [ ] **Step 1: Write the failing DOM test (append)**

```ts
@Component({ standalone: true, selector: 'mj-form-panel-slot', template: '<i class="slot-stub" [attr.data-slot]="Slot"></i>' })
class SlotStub { @Input() Entity = ''; @Input() Slot = ''; @Input() Record: unknown; @Input() FormComponent: unknown; @Input() FormContext: unknown; }
@Component({ standalone: true, selector: 'mj-record-form-container', template: '<ng-content></ng-content>' })
class ContainerStub { @Input() Record: unknown; @Input() FormComponent: unknown; }

describe('InteractiveFormComponent (DOM) — slots', () => {
  it('emits the four CodeGen slots around the React root when not in preview mode', () => {
    vi.spyOn(InteractiveFormComponent.prototype as unknown as OnInitProto, 'ngOnInit').mockResolvedValue(undefined);
    const f = renderComponentFixture(InteractiveFormComponent, {
      imports: [ReactStub, AlertStub, SlotStub, ContainerStub],
      declarations: [InteractiveFormComponent],
      providers: [{ provide: ReactBridgeService, useValue: {} }],
      inputs: { previewMode: false },
      setup: (c) => {
        (c as unknown as { record: BaseEntity }).record = REC;
        (c as unknown as { componentSpec: unknown }).componentSpec = { name: 'Form' };
        (c as unknown as { formHostProps: unknown }).formHostProps = { record: {} };
      },
    });
    const slots = Array.from(f.nativeElement.querySelectorAll('.slot-stub')).map((el) => (el as HTMLElement).getAttribute('data-slot'));
    expect(slots).toEqual(['top-area', 'before-fields', 'after-fields', 'after-related']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/base-forms && pnpm vitest run --project "base-forms (dom)" src/lib/interactive-form/interactive-form.component.dom.test.ts`
Expected: FAIL — zero slots found.

- [ ] **Step 3: Edit the template**

Inside the `<mj-record-form-container …>` branch of `interactive-form.component.html`, wrap the existing body:

```html
<mj-record-form-container
    [Record]="record"
    [FormComponent]="this"
    (Navigate)="OnFormNavigate($event)"
    (DeleteRequested)="OnDeleteRequested()"
    (FavoriteToggled)="OnFavoriteToggled()"
    (HistoryRequested)="OnHistoryRequested()"
    (ListManagementRequested)="OnListManagementRequested()">

    <!-- CodeGen slots so compiled + metadata contributions land in position (Forms Guide §7c). -->
    <mj-form-panel-slot [Entity]="record.EntityInfo.Name" Slot="top-area" [Record]="record" [FormComponent]="this" [FormContext]="formContext"></mj-form-panel-slot>
    <mj-form-panel-slot [Entity]="record.EntityInfo.Name" Slot="before-fields" [Record]="record" [FormComponent]="this" [FormContext]="formContext"></mj-form-panel-slot>

    @if (loadError) {
        <mj-alert Variant="error">{{ loadError }}</mj-alert>
    } @else if (componentSpec && formHostProps) {
        <mj-react-component
            #reactComponent
            [component]="componentSpec"
            [componentProps]="formHostProps"
            (componentEvent)="OnReactComponentEvent($event)"
            (openEntityRecord)="OnOpenEntityRecord($event)">
        </mj-react-component>
    } @else {
        <div class="mj-loading-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Loading form…</span>
        </div>
    }

    <mj-form-panel-slot [Entity]="record.EntityInfo.Name" Slot="after-fields" [Record]="record" [FormComponent]="this" [FormContext]="formContext"></mj-form-panel-slot>
    <mj-form-panel-slot [Entity]="record.EntityInfo.Name" Slot="after-related" [Record]="record" [FormComponent]="this" [FormContext]="formContext"></mj-form-panel-slot>

</mj-record-form-container>
```

The preview-mode branch stays slot-free (the cockpit previews the React body only).

- [ ] **Step 4: Run the package tests, build, and Phase A verification**

```bash
cd packages/Angular/Generic/base-forms && pnpm test && pnpm run build
cd ../../../MJCoreEntities && pnpm test
cd ../InteractiveComponents && pnpm test
cd ../../ && pnpm run build:explorer 2>/dev/null || (cd packages/MJExplorer && pnpm run build)
pnpm run test:integration
```

Expected: all green. Manual check in Explorer: open any record with a compiled panel (e.g. `MJ: Content Sources`) — panels still mount; open a record with an interactive override — slots render (empty) and the form still saves.

- [ ] **Step 5: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form.component.html packages/Angular/Generic/base-forms/src/lib/interactive-form/interactive-form.component.dom.test.ts
```

---

# Phase B — Apply path (MJ)

### Task B1: Shared helpers and `Create Form Contribution`

**Files:**
- Modify: `packages/Actions/CoreActions/src/custom/interactive-forms/_shared.ts`
- Create: `packages/Actions/CoreActions/src/custom/interactive-forms/create-form-contribution.action.ts`
- Modify: `packages/Actions/CoreActions/src/custom/interactive-forms/index.ts`
- Test: `packages/Actions/CoreActions/src/__tests__/create-form-contribution.action.test.ts`

**Interfaces:**
- Consumes: `isFormPanelRole`, `getDeclaredFormContribution`, `FormContributionSpec` (A1); `MJEntityFormContributionEntity` (A2).
- Produces in `_shared.ts`: `lintFormPanelSpec(spec, user)`, `loadContribution(provider, user, id)`, `insertContribution(opts)`, `checkScopedOwnership(row, user, label)`; `insertComponent` gains `componentType?: 'Form' | 'Widget'`. Action `Create Form Contribution` (`__CreateFormContribution`): inputs `EntityName`, `Name`, `Spec`, `Description?`, `Notes?`, `Priority?`; outputs `ContributionID`, `ComponentID`, `Version`; result codes `SUCCESS`, `MISSING_PARAMETER`, `ENTITY_NOT_FOUND`, `RELATED_ENTITY_NOT_FOUND`, `LINT_FAILED`, `ALREADY_EXISTS`, `PERSIST_FAILED`, `NO_PROVIDER`, `NO_USER`, `UNEXPECTED_ERROR`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/Actions/CoreActions/src/__tests__/create-form-contribution.action.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        entities: [] as Array<{ entityName: string; fields: Record<string, unknown>; saveOutcome: boolean; ID: string }>,
        dupRows: [] as Array<{ ID: string; Status: string }>,
        lintViolations: [] as Array<{ severity: string; rule: string; message: string }>,
    },
}));

function makeEntity(entityName: string) {
    const target = { entityName, fields: {} as Record<string, unknown>, saveOutcome: true, ID: `${entityName}-id`, NewRecord() {}, async Save() { return this.saveOutcome; }, LatestResult: { CompleteMessage: 'mock' } };
    hoisted.entities.push(target);
    return new Proxy(target, {
        set(t, prop, value) { if (typeof prop === 'string' && !(prop in t)) { t.fields[prop] = value; return true; } (t as Record<string | symbol, unknown>)[prop] = value; return true; },
        get(t, prop) { if (typeof prop === 'string' && prop in t.fields) return t.fields[prop]; return (t as Record<string | symbol, unknown>)[prop]; },
    });
}

const provider = {
    EntityByName: (name: string) => ({
        'mj_bizapps_common: people': { ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People' },
        'mj_bizapps_orders: event order lines': { ID: 'ENT-TICKETS', Name: 'MJ_BizApps_Orders: Event Order Lines' },
    }[name.toLowerCase()]),
    GetEntityObject: async (entityName: string) => makeEntity(entityName),
};

vi.mock('@memberjunction/core', () => ({
    Metadata: { Provider: provider },
    LogError: vi.fn(),
    RunView: { FromMetadataProvider: () => ({ RunView: async () => ({ Success: true, Results: hoisted.dupRows }) }) },
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/react-linter', () => ({
    ComponentLinter: { lintComponent: async () => ({ violations: hoisted.lintViolations }) },
}));

import { CreateFormContributionAction } from '../custom/interactive-forms/create-form-contribution.action';

const user = { ID: 'USER-1', Name: 'Test User', UserRoles: [] };
const panelSpec = {
    name: 'PersonLtvStrip', title: 'Lifetime value', location: 'embedded', componentRole: 'form-panel',
    code: 'function PersonLtvStrip(props) { return null; }',
    formContribution: { slot: 'before-fields', presentation: 'bare', title: 'Lifetime value', contributionKey: 'skip:person-ltv', configuration: { metric: 'ltv' } },
};

function params(over: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = { EntityName: 'MJ_BizApps_Common: People', Name: 'LTV strip', Spec: panelSpec, ...over };
    return {
        Params: Object.entries(values).filter(([, v]) => v !== undefined).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: user,
        Provider: provider,
    } as unknown as RunActionParams;
}

async function run(p: RunActionParams): Promise<ActionResultSimple> {
    const action = new CreateFormContributionAction();
    return (action as unknown as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> }).InternalRunAction(p);
}

beforeEach(() => { hoisted.entities = []; hoisted.dupRows = []; hoisted.lintViolations = []; });

describe('CreateFormContributionAction', () => {
    it('inserts a Widget component and a Pending User-scope contribution row from the spec block', async () => {
        const result = await run(params());
        expect(result.Success).toBe(true);
        const component = hoisted.entities.find(e => e.entityName === 'MJ: Components')!;
        const row = hoisted.entities.find(e => e.entityName === 'MJ: Entity Form Contributions')!;
        expect(component.fields).toMatchObject({ Type: 'Widget', Status: 'Draft', Version: '1.0.0', Name: 'PersonLtvStrip' });
        expect(row.fields).toMatchObject({
            EntityID: 'ENT-PEOPLE', ComponentID: component.ID, Name: 'LTV strip', Slot: 'before-fields', Presentation: 'bare',
            ContributionKey: 'skip:person-ltv', Scope: 'User', UserID: 'USER-1', RoleID: null, Priority: 0, Status: 'Pending',
            Configuration: JSON.stringify({ metric: 'ltv' }), Title: 'Lifetime value',
        });
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ ContributionID: row.ID, ComponentID: component.ID, Version: '1.0.0' });
    });

    it('resolves a related-entity claim to RelatedEntityID', async () => {
        const spec = { ...panelSpec, formContribution: { ...panelSpec.formContribution, relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID' } };
        await run(params({ Spec: spec }));
        const row = hoisted.entities.find(e => e.entityName === 'MJ: Entity Form Contributions')!;
        expect(row.fields).toMatchObject({ RelatedEntityID: 'ENT-TICKETS', RelatedJoinField: 'PersonID' });
    });

    it('rejects an unknown related entity', async () => {
        const spec = { ...panelSpec, formContribution: { ...panelSpec.formContribution, relatedEntity: 'Nope' } };
        expect((await run(params({ Spec: spec }))).ResultCode).toBe('RELATED_ENTITY_NOT_FOUND');
    });

    it('honors an explicit Priority', async () => {
        await run(params({ Priority: '7' }));
        expect(hoisted.entities.find(e => e.entityName === 'MJ: Entity Form Contributions')!.fields.Priority).toBe(7);
    });

    it('refuses a spec that is not a form panel', async () => {
        const result = await run(params({ Spec: { ...panelSpec, componentRole: 'form' } }));
        expect(result.ResultCode).toBe('LINT_FAILED');
        expect(hoisted.entities).toHaveLength(0);
    });

    it('returns ALREADY_EXISTS when an Active or Pending row shares the key', async () => {
        hoisted.dupRows = [{ ID: 'ROW-1', Status: 'Pending' }];
        expect((await run(params())).ResultCode).toBe('ALREADY_EXISTS');
    });

    it('surfaces blocking lint violations', async () => {
        hoisted.lintViolations = [{ severity: 'high', rule: 'no-window', message: 'window access' }];
        expect((await run(params())).ResultCode).toBe('LINT_FAILED');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Actions/CoreActions && pnpm vitest run src/__tests__/create-form-contribution.action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Extend `_shared.ts`**

```ts
import { MJComponentEntity, MJEntityFormContributionEntity, MJEntityFormOverrideEntity } from "@memberjunction/core-entities";
import { isFormPanelRole, isFormRole, type FormContributionSpec } from "@memberjunction/interactive-component-types/forms";

const ROLE_SUPPRESSED_RULES = new Set([
    "component-props-validation",
    "callback-event-validation",
    "useeffect-unstable-dependencies",
]);

/** Shared lint body for both roles. `roleCheck` decides which role the spec must declare. */
async function lintRoleSpec(
    spec: ComponentSpec,
    contextUser: UserInfo,
    roleCheck: (s: ComponentSpec) => boolean,
    roleLabel: string,
): Promise<ActionResultSimple | null> {
    if (!roleCheck(spec)) {
        return failure("LINT_FAILED", `Spec must declare componentRole='${roleLabel}'. Got '${spec.componentRole ?? "(unset)"}'.`);
    }
    if (!spec.name || spec.name.trim().length === 0) return failure("LINT_FAILED", "Spec.name is required.");
    if (typeof spec.code !== "string" || spec.code.trim().length === 0) return failure("LINT_FAILED", "Spec.code must be a non-empty JSX string.");
    if (!spec.location) return failure("LINT_FAILED", "Spec.location is required (use 'embedded' for inline JSX or 'registry' to reference a published component).");
    try {
        const result = await ComponentLinter.lintComponent(spec.code, spec.name, spec, true, contextUser);
        const blocking = (result.violations ?? []).filter(v =>
            (v.severity === "critical" || v.severity === "high") && !(v.rule && ROLE_SUPPRESSED_RULES.has(v.rule)));
        if (blocking.length > 0) {
            const messages = blocking.slice(0, 5)
                .map(v => `  [${v.severity}] ${v.rule ?? "lint"}: ${v.message}${v.line ? ` (line ${v.line})` : ""}`).join("\n");
            return failure("LINT_FAILED", `Spec code failed linting:\n${messages}${blocking.length > 5 ? `\n  (+${blocking.length - 5} more)` : ""}`);
        }
    } catch (err) {
        return failure("LINT_FAILED", `Linter could not parse spec code: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
}

/** Existing entry point — now delegates. Behavior unchanged for whole forms. */
export async function lintFormSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return lintRoleSpec(spec, contextUser, isFormRole, 'form');
}

/** Same rules as `lintFormSpec`, for `componentRole: 'form-panel'`. */
export async function lintFormPanelSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return lintRoleSpec(spec, contextUser, isFormPanelRole, 'form-panel');
}

export async function loadContribution(
    provider: IMetadataProvider, user: UserInfo, contributionID: string,
): Promise<MJEntityFormContributionEntity | null> {
    const c = await provider.GetEntityObject<MJEntityFormContributionEntity>("MJ: Entity Form Contributions", user);
    const loaded = await c.Load(contributionID);
    return loaded ? c : null;
}

/** Row shape both override and contribution ownership checks read. */
export interface ScopedRow { ID: string; Scope: 'User' | 'Role' | 'Global'; UserID: string | null; RoleID: string | null }

/**
 * Ownership rules shared by every mutation action:
 *   User → owning user; Role → member; Global → Owner-type user.
 */
export function checkScopedOwnership(row: ScopedRow, user: UserInfo, label: string): ActionResultSimple | null {
    switch (row.Scope) {
        case 'User':
            return UUIDsEqual(row.UserID, user.ID) ? null
                : failure("FORBIDDEN", `${label} ${row.ID} is User-scoped to a different user. Only the owning user can mutate it.`);
        case 'Role': {
            const roleIds = ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? []).map(r => r.RoleID).filter((x): x is string => !!x);
            return row.RoleID && roleIds.includes(row.RoleID) ? null
                : failure("FORBIDDEN", `${label} ${row.ID} is Role-scoped (${row.RoleID}). Only members of that role can mutate it.`);
        }
        case 'Global': {
            const isOwner = ((user as { Type?: string }).Type ?? '').toLowerCase() === 'owner';
            return isOwner ? null
                : failure("FORBIDDEN", `${label} ${row.ID} is Global. Only Owner-type users can mutate Global rows.`);
        }
        default:
            return failure("FORBIDDEN", `${label} ${row.ID} has an unrecognized Scope ('${row.Scope}').`);
    }
}

/** Existing entry point — now delegates. */
export function checkOverrideOwnership(
    override: Pick<MJEntityFormOverrideEntity, 'ID' | 'Scope' | 'UserID' | 'RoleID'>,
    user: UserInfo,
): ActionResultSimple | null {
    return checkScopedOwnership(override, user, 'Override');
}
```

Change `insertComponent` to accept a type:

```ts
export async function insertComponent(opts: {
    provider: IMetadataProvider; user: UserInfo; spec: ComponentSpec; fallbackName: string; description: string | null;
    version: string; versionSequence: number; componentStatus: FormLifecycle;
    /** 'Form' for whole forms (default), 'Widget' for form panels. */
    componentType?: 'Form' | 'Widget';
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    // ...unchanged body except:
    component.Type = opts.componentType ?? "Form";
```

Add the contribution insert:

```ts
export async function insertContribution(opts: {
    provider: IMetadataProvider;
    user: UserInfo;
    entityID: string;
    componentID: string;
    name: string;
    description: string | null;
    notes?: string | null;
    contribution: FormContributionSpec;
    relatedEntityID: string | null;
    status: 'Active' | 'Pending';
    priority: number;
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    const { provider, user, entityID, componentID, name, description, notes, contribution, relatedEntityID, status, priority } = opts;
    const row = await provider.GetEntityObject<MJEntityFormContributionEntity>("MJ: Entity Form Contributions", user);
    row.NewRecord();
    row.EntityID = entityID;
    row.ComponentID = componentID;
    row.Name = name;
    row.Description = description;
    row.Notes = notes ?? null;
    row.Slot = contribution.slot;
    row.SortKey = contribution.sortKey ?? 0;
    row.ContributionKey = contribution.contributionKey ?? null;
    row.RelatedEntityID = relatedEntityID;
    row.RelatedJoinField = contribution.relatedJoinField ?? null;
    row.ReplacesSectionKey = contribution.replacesSectionKey ?? null;
    row.Inclusion = contribution.inclusion ?? null;
    row.ChromeGroup = contribution.chromeGroup ?? null;
    row.Presentation = contribution.presentation;
    row.Title = contribution.title;
    row.Icon = contribution.icon ?? null;
    row.Configuration = contribution.configuration && Object.keys(contribution.configuration).length > 0
        ? JSON.stringify(contribution.configuration) : null;
    // Security clamp: agents write User scope only. Promotion is a human act.
    row.Scope = "User";
    row.UserID = user.ID;
    row.RoleID = null;
    row.Priority = priority;
    row.Status = status;
    const saved = await row.Save();
    if (!saved) {
        return { error: failure("PERSIST_FAILED", `Contribution insert failed: ${row.LatestResult?.CompleteMessage ?? "unknown error"}`) };
    }
    return { id: row.ID };
}
```

- [ ] **Step 4: Create the action**

```ts
// packages/Actions/CoreActions/src/custom/interactive-forms/create-form-contribution.action.ts
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import { getDeclaredFormContribution } from "@memberjunction/interactive-component-types/forms";
import {
    addOutput, failure, getNumberParam, getStringParam, insertComponent, insertContribution,
    lintFormPanelSpec, parseSpecParam,
} from "./_shared";

/**
 * Create a net-new form contribution for the requesting user.
 *
 * Reads the registration intent from `spec.formContribution` (slot, key, claims,
 * presentation, title). Writes a `MJ: Components` row (Type='Widget', v1.0.0,
 * Draft) and a `MJ: Entity Form Contributions` row (Scope='User', Status='Pending').
 * Activation is a separate step (`Activate Form Contribution Version`), which the
 * "Add to my form" apply flow runs immediately after Create.
 *
 * `Priority` is honored when supplied (the apply flow passes `incumbent + 1` after
 * the user confirms replacing a compiled contribution). It only ever affects the
 * calling user's own form, so it is not clamped.
 */
@RegisterClass(BaseAction, "__CreateFormContribution")
export class CreateFormContributionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const inputs = this.extractInputs(params);
            if ('error' in inputs) return inputs.error;

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser to clamp contribution scope.");

            const entityInfo = provider.EntityByName(inputs.EntityName);
            if (!entityInfo) return failure("ENTITY_NOT_FOUND", `Entity '${inputs.EntityName}' is not registered with the active metadata provider.`);

            const lintFail = await lintFormPanelSpec(inputs.Spec, user);
            if (lintFail) return lintFail;

            const contribution = getDeclaredFormContribution(inputs.Spec);
            if (!contribution) return failure("LINT_FAILED", "Spec.formContribution could not be read.");

            let relatedEntityID: string | null = null;
            if (contribution.relatedEntity) {
                const related = provider.EntityByName(contribution.relatedEntity);
                if (!related) return failure("RELATED_ENTITY_NOT_FOUND", `Related entity '${contribution.relatedEntity}' is not registered.`);
                relatedEntityID = related.ID;
                contribution.relatedEntity = related.Name;
            }

            if (contribution.contributionKey) {
                const rv = RunView.FromMetadataProvider(provider);
                const dup = await rv.RunView<{ ID: string; Status: string }>({
                    EntityName: "MJ: Entity Form Contributions",
                    ExtraFilter: `EntityID='${entityInfo.ID}' AND Scope='User' AND UserID='${user.ID}' AND ContributionKey='${contribution.contributionKey.replace(/'/g, "''")}' AND Status IN ('Active','Pending')`,
                    Fields: ['ID', 'Status'], ResultType: 'simple', MaxRows: 1,
                }, user);
                if (dup.Success && (dup.Results ?? []).length > 0) {
                    const existing = dup.Results![0];
                    return failure("ALREADY_EXISTS",
                        `A ${existing.Status} User-scope contribution '${contribution.contributionKey}' already exists on '${inputs.EntityName}' (ContributionID=${existing.ID}). Use 'Modify Form Contribution' on it.`);
                }
            }

            const componentInsert = await insertComponent({
                provider, user, spec: inputs.Spec, fallbackName: inputs.Name, description: inputs.Description,
                version: "1.0.0", versionSequence: 1, componentStatus: 'Pending', componentType: 'Widget',
            });
            if ('error' in componentInsert) return componentInsert.error;

            const rowInsert = await insertContribution({
                provider, user, entityID: entityInfo.ID, componentID: componentInsert.id,
                name: inputs.Name, description: inputs.Description, notes: inputs.Notes,
                contribution, relatedEntityID, status: 'Pending', priority: inputs.Priority,
            });
            if ('error' in rowInsert) {
                return failure("PERSIST_FAILED", `${rowInsert.error.Message} (Component ${componentInsert.id} was persisted but has no contribution row yet.)`);
            }

            addOutput(params, "ContributionID", rowInsert.id);
            addOutput(params, "ComponentID", componentInsert.id);
            addOutput(params, "Version", "1.0.0");
            return {
                Success: true, ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    ContributionID: rowInsert.id, ComponentID: componentInsert.id, EntityName: entityInfo.Name,
                    ContributionKey: contribution.contributionKey ?? null, Slot: contribution.slot,
                    Scope: "User", Status: "Pending", Version: "1.0.0",
                }),
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`CreateFormContributionAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    private extractInputs(params: RunActionParams):
        | { EntityName: string; Spec: ComponentSpec; Name: string; Description: string | null; Notes: string | null; Priority: number }
        | { error: ActionResultSimple }
    {
        const entityName = getStringParam(params, "EntityName");
        if (!entityName) return { error: failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.") };
        const name = getStringParam(params, "Name");
        if (!name) return { error: failure("MISSING_PARAMETER", "Parameter 'Name' is required.") };
        const specRaw = params.Params.find(x => x.Name?.trim().toLowerCase() === "spec")?.Value;
        if (specRaw == null) return { error: failure("MISSING_PARAMETER", "Parameter 'Spec' is required.") };
        const parsed = parseSpecParam(specRaw);
        if ('error' in parsed) return { error: failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`) };
        const priority = getNumberParam(params, "Priority");
        return {
            EntityName: entityName, Spec: parsed, Name: name,
            Description: getStringParam(params, "Description"), Notes: getStringParam(params, "Notes"),
            Priority: priority != null && priority >= 0 ? Math.floor(priority) : 0,
        };
    }
}

export function LoadCreateFormContributionAction(): void {
    if (false as boolean) { const _: unknown = CreateFormContributionAction; }
}
```

Add `export * from './create-form-contribution.action';` to `index.ts`.

- [ ] **Step 5: Run tests and build**

Run: `cd packages/Actions/CoreActions && pnpm test && pnpm run build`
Expected: PASS, including the existing `create-interactive-form.action.test.ts` (the lint refactor keeps behavior).

- [ ] **Step 6: Stage for review**

```bash
git add packages/Actions/CoreActions/src/custom/interactive-forms/_shared.ts packages/Actions/CoreActions/src/custom/interactive-forms/create-form-contribution.action.ts packages/Actions/CoreActions/src/custom/interactive-forms/index.ts packages/Actions/CoreActions/src/__tests__/create-form-contribution.action.test.ts
```

---

### Task B2: `Modify Form Contribution` and `Activate Form Contribution Version`

**Files:**
- Create: `packages/Actions/CoreActions/src/custom/interactive-forms/modify-form-contribution.action.ts`
- Create: `packages/Actions/CoreActions/src/custom/interactive-forms/activate-form-contribution-version.action.ts`
- Modify: `packages/Actions/CoreActions/src/custom/interactive-forms/index.ts`
- Test: `packages/Actions/CoreActions/src/__tests__/modify-form-contribution.action.test.ts`

**Interfaces:**
- Consumes: `loadContribution`, `loadComponent`, `checkScopedOwnership`, `lintFormPanelSpec`, `insertComponent`, `bumpVersion`, `parseVersionBumpKind`, `mapToComponentStatus` (`_shared.ts`).
- Produces: `Modify Form Contribution` (`__ModifyFormContribution`): inputs `ContributionID`, `Spec`, `Notes?`, `VersionBumpKind?`; outputs `ContributionID`, `ComponentID`, `Version`, `Mode` (`in-place` | `new-version`). `Activate Form Contribution Version` (`__ActivateFormContributionVersion`): input `ContributionID`; outputs `ContributionID`, `ComponentID`, `PreviousActiveContributionID`.

Behavior table (identical to `Modify Interactive Form`):

| Source Status | `VersionBumpKind` | Behavior |
|---|---|---|
| Pending | `in-place` (default) | Overwrite the source Component's `Specification`, `Title`, `Description`; refresh the row's registration fields from the new `formContribution`; append Notes |
| Pending | `patch`/`minor`/`major` | Demote source row + component to Inactive; insert new Pending component + row |
| Active | `in-place` | `INVALID_BUMP_FOR_STATUS` |
| Active | bump (default `minor`) | New Pending component + row; Active untouched |
| Inactive | `in-place` | `INVALID_BUMP_FOR_STATUS` |
| Inactive | bump (default `patch`) | Branch from historical: new Pending component + row |

- [ ] **Step 1: Write the failing test**

```ts
// packages/Actions/CoreActions/src/__tests__/modify-form-contribution.action.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        created: [] as Array<{ entityName: string; fields: Record<string, unknown>; ID: string }>,
        row: {} as Record<string, unknown>,
        component: {} as Record<string, unknown>,
    },
}));

function loadedEntity(entityName: string, seed: Record<string, unknown>) {
    const target = { entityName, ID: seed.ID as string, saved: false, LatestResult: { CompleteMessage: 'mock' }, ...seed,
        async Load() { return true; }, async Save() { this.saved = true; return true; }, NewRecord() {} };
    return target;
}
function newEntity(entityName: string) {
    const target = { entityName, fields: {} as Record<string, unknown>, ID: `${entityName}-new-${hoisted.created.length}`, LatestResult: { CompleteMessage: 'mock' }, NewRecord() {}, async Save() { return true; } };
    hoisted.created.push(target);
    return new Proxy(target, {
        set(t, prop, value) { if (typeof prop === 'string' && !(prop in t)) { t.fields[prop] = value; return true; } (t as Record<string | symbol, unknown>)[prop] = value; return true; },
        get(t, prop) { if (typeof prop === 'string' && prop in t.fields) return t.fields[prop]; return (t as Record<string | symbol, unknown>)[prop]; },
    });
}

let loadedRow: ReturnType<typeof loadedEntity>;
let loadedComponent: ReturnType<typeof loadedEntity>;
const provider = {
    EntityByName: (name: string) => (name.toLowerCase() === 'mj_bizapps_common: people' ? { ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People' } : undefined),
    GetEntityObject: async (entityName: string) => {
        if (entityName === 'MJ: Entity Form Contributions' && !loadedRow.saved && hoisted.created.every(c => c.entityName !== entityName)) {
            return loadedRow;
        }
        if (entityName === 'MJ: Components' && !loadedComponent.saved && hoisted.created.every(c => c.entityName !== entityName)) {
            return loadedComponent;
        }
        return newEntity(entityName);
    },
};

vi.mock('@memberjunction/core', () => ({ Metadata: { Provider: provider }, LogError: vi.fn(), RunView: { FromMetadataProvider: () => ({ RunView: async () => ({ Success: true, Results: [] }) }) } }));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/react-linter', () => ({ ComponentLinter: { lintComponent: async () => ({ violations: [] }) } }));

import { ModifyFormContributionAction } from '../custom/interactive-forms/modify-form-contribution.action';

const user = { ID: 'USER-1', UserRoles: [] };
const spec = {
    name: 'PersonLtvStrip', title: 'Lifetime value v2', location: 'embedded', componentRole: 'form-panel',
    code: 'function PersonLtvStrip(props) { return null; }',
    formContribution: { slot: 'before-fields', presentation: 'bare', title: 'LTV v2', contributionKey: 'skip:person-ltv' },
};

function params(over: Record<string, unknown> = {}): RunActionParams {
    const values: Record<string, unknown> = { ContributionID: 'ROW-1', Spec: spec, ...over };
    return { Params: Object.entries(values).filter(([, v]) => v !== undefined).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })), ContextUser: user, Provider: provider } as unknown as RunActionParams;
}
async function run(p: RunActionParams): Promise<ActionResultSimple> {
    return (new ModifyFormContributionAction() as unknown as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> }).InternalRunAction(p);
}

beforeEach(() => {
    hoisted.created = [];
    loadedRow = loadedEntity('MJ: Entity Form Contributions', { ID: 'ROW-1', EntityID: 'ENT-PEOPLE', ComponentID: 'COMP-1', Name: 'LTV strip', Description: null, Notes: null,
        Slot: 'before-fields', SortKey: 0, ContributionKey: 'skip:person-ltv', RelatedEntityID: null, RelatedJoinField: null, ReplacesSectionKey: null,
        Inclusion: null, ChromeGroup: null, Presentation: 'bare', Title: 'LTV', Icon: null, Scope: 'User', UserID: 'USER-1', RoleID: null, Priority: 0, Status: 'Pending', Configuration: null });
    loadedComponent = loadedEntity('MJ: Components', { ID: 'COMP-1', Name: 'PersonLtvStrip', Version: '1.0.0', VersionSequence: 1, Status: 'Draft', Specification: '{}' });
});

describe('ModifyFormContributionAction', () => {
    it('overwrites a Pending source in place by default', async () => {
        const result = await run(params());
        expect(result.Success).toBe(true);
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ Mode: 'in-place', ContributionID: 'ROW-1', ComponentID: 'COMP-1', Version: '1.0.0' });
        expect(loadedComponent.saved).toBe(true);
        expect(JSON.parse(loadedComponent.Specification as string).formContribution.title).toBe('LTV v2');
        expect(loadedRow.Title).toBe('LTV v2');
        expect(hoisted.created).toHaveLength(0);
    });

    it('creates a new Pending version when the source is Active', async () => {
        loadedRow.Status = 'Active'; loadedComponent.Status = 'Published';
        const result = await run(params());
        expect(JSON.parse(result.Message ?? '{}')).toMatchObject({ Mode: 'new-version', Version: '1.1.0' });
        const newComponent = hoisted.created.find(c => c.entityName === 'MJ: Components')!;
        const newRow = hoisted.created.find(c => c.entityName === 'MJ: Entity Form Contributions')!;
        expect(newComponent.fields).toMatchObject({ Type: 'Widget', Version: '1.1.0', VersionSequence: 2, Status: 'Draft' });
        expect(newRow.fields).toMatchObject({ Status: 'Pending', Scope: 'User', UserID: 'USER-1', ContributionKey: 'skip:person-ltv', Priority: 0 });
        expect(loadedRow.saved).toBe(false);
    });

    it('rejects in-place on an Active source', async () => {
        loadedRow.Status = 'Active';
        expect((await run(params({ VersionBumpKind: 'in-place' }))).ResultCode).toBe('INVALID_BUMP_FOR_STATUS');
    });

    it('refuses to mutate another user\'s row', async () => {
        loadedRow.UserID = 'SOMEONE-ELSE';
        expect((await run(params())).ResultCode).toBe('FORBIDDEN');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Actions/CoreActions && pnpm vitest run src/__tests__/modify-form-contribution.action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the Modify action**

```ts
// packages/Actions/CoreActions/src/custom/interactive-forms/modify-form-contribution.action.ts
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import { getDeclaredFormContribution, type FormContributionSpec } from "@memberjunction/interactive-component-types/forms";
import {
    addOutput, bumpVersion, checkScopedOwnership, failure, getStringParam, insertComponent, lintFormPanelSpec,
    loadComponent, loadContribution, mapToComponentStatus, parseSpecParam, parseVersionBumpKind, type VersionBumpKind,
} from "./_shared";

/**
 * Modify an existing form contribution. Same version table as `Modify Interactive Form`
 * (see the behavior table in implementation.md §B2). Always writes User scope for any
 * new row — the security clamp — and refreshes the row's registration fields from the
 * spec's `formContribution` block so a moved slot or a renamed title lands with the code.
 */
@RegisterClass(BaseAction, "__ModifyFormContribution")
export class ModifyFormContributionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contributionID = getStringParam(params, "ContributionID");
            if (!contributionID) return failure("MISSING_PARAMETER", "Parameter 'ContributionID' is required.");
            const specRaw = params.Params.find(x => x.Name?.trim().toLowerCase() === "spec")?.Value;
            if (specRaw == null) return failure("MISSING_PARAMETER", "Parameter 'Spec' is required.");
            const parsed = parseSpecParam(specRaw);
            if ('error' in parsed) return failure("LINT_FAILED", `Spec is not valid JSON: ${parsed.error}`);
            const spec: ComponentSpec = parsed;
            const notes = getStringParam(params, "Notes");
            const bumpRaw = getStringParam(params, "VersionBumpKind");
            const requestedBump = bumpRaw ? parseVersionBumpKind(bumpRaw) : null;
            if (bumpRaw && !requestedBump) return failure("INVALID_PARAMETER", `VersionBumpKind '${bumpRaw}' is not one of in-place | patch | minor | major.`);

            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const source = await loadContribution(provider, user, contributionID);
            if (!source) return failure("CONTRIBUTION_NOT_FOUND", `Contribution '${contributionID}' not found.`);
            const forbidden = checkScopedOwnership(source, user, 'Contribution');
            if (forbidden) return forbidden;

            const lintFail = await lintFormPanelSpec(spec, user);
            if (lintFail) return lintFail;
            const contribution = getDeclaredFormContribution(spec);
            if (!contribution) return failure("LINT_FAILED", "Spec.formContribution could not be read.");

            let relatedEntityID: string | null = null;
            if (contribution.relatedEntity) {
                const related = provider.EntityByName(contribution.relatedEntity);
                if (!related) return failure("RELATED_ENTITY_NOT_FOUND", `Related entity '${contribution.relatedEntity}' is not registered.`);
                relatedEntityID = related.ID;
            }

            const sourceComponent = await loadComponent(provider, user, source.ComponentID);
            if (!sourceComponent) return failure("COMPONENT_NOT_FOUND", `Contribution ${contributionID} points at Component ${source.ComponentID} which no longer exists.`);

            const bump: VersionBumpKind = requestedBump
                ?? (source.Status === 'Pending' ? 'in-place' : source.Status === 'Active' ? 'minor' : 'patch');
            if (bump === 'in-place' && source.Status !== 'Pending') {
                return failure("INVALID_BUMP_FOR_STATUS", `In-place modification is only valid for a Pending contribution; ${contributionID} is ${source.Status}. Supply VersionBumpKind patch | minor | major.`);
            }

            if (bump === 'in-place') {
                sourceComponent.Specification = JSON.stringify(spec);
                sourceComponent.Title = spec.title ?? sourceComponent.Title;
                sourceComponent.Description = spec.description ?? sourceComponent.Description;
                if (!(await sourceComponent.Save())) {
                    return failure("PERSIST_FAILED", `Component update failed: ${sourceComponent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
                this.applyRegistration(source, contribution, relatedEntityID);
                if (notes) source.Notes = `${source.Notes ? source.Notes + "\n" : ""}${notes}`;
                if (!(await source.Save())) {
                    return failure("PERSIST_FAILED", `Contribution update failed: ${source.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
                return this.success(params, { ContributionID: source.ID, ComponentID: source.ComponentID, Version: sourceComponent.Version, Mode: 'in-place', BumpKind: bump });
            }

            const nextVersion = bumpVersion(sourceComponent.Version, bump);
            const componentInsert = await insertComponent({
                provider, user, spec, fallbackName: sourceComponent.Name, description: spec.description ?? sourceComponent.Description,
                version: nextVersion, versionSequence: (sourceComponent.VersionSequence ?? 0) + 1,
                componentStatus: 'Pending', componentType: 'Widget',
            });
            if ('error' in componentInsert) return componentInsert.error;

            const row = await provider.GetEntityObject<MJEntityFormContributionEntity>("MJ: Entity Form Contributions", user);
            row.NewRecord();
            row.EntityID = source.EntityID;
            row.ComponentID = componentInsert.id;
            row.Name = source.Name;
            row.Description = spec.description ?? source.Description;
            row.Notes = notes ?? null;
            this.applyRegistration(row, contribution, relatedEntityID);
            row.Scope = "User";
            row.UserID = user.ID;
            row.RoleID = null;
            row.Priority = source.Priority ?? 0;
            row.Status = 'Pending';
            if (!(await row.Save())) {
                return failure("PERSIST_FAILED", `Contribution insert failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'} (Component ${componentInsert.id} persisted).`);
            }

            if (source.Status === 'Pending') {
                // Bumping from a Pending draft supersedes it.
                source.Status = 'Inactive';
                await source.Save();
                sourceComponent.Status = mapToComponentStatus('Inactive');
                await sourceComponent.Save();
            }
            return this.success(params, { ContributionID: row.ID, ComponentID: componentInsert.id, Version: nextVersion, Mode: 'new-version', BumpKind: bump });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ModifyFormContributionAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    private applyRegistration(row: MJEntityFormContributionEntity, c: FormContributionSpec, relatedEntityID: string | null): void {
        row.Slot = c.slot;
        row.SortKey = c.sortKey ?? 0;
        row.ContributionKey = c.contributionKey ?? null;
        row.RelatedEntityID = relatedEntityID;
        row.RelatedJoinField = c.relatedJoinField ?? null;
        row.ReplacesSectionKey = c.replacesSectionKey ?? null;
        row.Inclusion = c.inclusion ?? null;
        row.ChromeGroup = c.chromeGroup ?? null;
        row.Presentation = c.presentation;
        row.Title = c.title;
        row.Icon = c.icon ?? null;
        row.Configuration = c.configuration && Object.keys(c.configuration).length > 0 ? JSON.stringify(c.configuration) : null;
    }

    private success(params: RunActionParams, payload: { ContributionID: string; ComponentID: string; Version: string; Mode: 'in-place' | 'new-version'; BumpKind: VersionBumpKind }): ActionResultSimple {
        addOutput(params, "ContributionID", payload.ContributionID);
        addOutput(params, "ComponentID", payload.ComponentID);
        addOutput(params, "Version", payload.Version);
        addOutput(params, "Mode", payload.Mode);
        return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
    }
}

export function LoadModifyFormContributionAction(): void {
    if (false as boolean) { const _: unknown = ModifyFormContributionAction; }
}
```

- [ ] **Step 4: Create the Activate action**

```ts
// packages/Actions/CoreActions/src/custom/interactive-forms/activate-form-contribution-version.action.ts
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { addOutput, checkScopedOwnership, failure, getStringParam, loadComponent, loadContribution, mapToComponentStatus } from "./_shared";

/**
 * Promote a Pending contribution to Active and demote the sibling that shares its
 * (EntityID, ContributionKey, scope tuple). Rows with no ContributionKey are unique
 * and have no sibling. Idempotent on an Active target; `NOT_PENDING` on Inactive.
 */
@RegisterClass(BaseAction, "__ActivateFormContributionVersion")
export class ActivateFormContributionVersionAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contributionID = getStringParam(params, "ContributionID");
            if (!contributionID) return failure("MISSING_PARAMETER", "Parameter 'ContributionID' is required.");
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");

            const target = await loadContribution(provider, user, contributionID);
            if (!target) return failure("CONTRIBUTION_NOT_FOUND", `Contribution '${contributionID}' not found.`);
            const forbidden = checkScopedOwnership(target, user, 'Contribution');
            if (forbidden) return forbidden;

            if (target.Status === 'Active') {
                addOutput(params, "ContributionID", target.ID);
                addOutput(params, "ComponentID", target.ComponentID);
                addOutput(params, "PreviousActiveContributionID", null);
                return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify({ noop: true, ContributionID: target.ID, ComponentID: target.ComponentID }) };
            }
            if (target.Status === 'Inactive') {
                return failure("NOT_PENDING", `Contribution ${contributionID} is Inactive. Modify it with a version bump to branch a new Pending version first.`);
            }

            let priors: Array<{ ID: string; ComponentID: string }> = [];
            if (target.ContributionKey) {
                const scopeClause = target.Scope === 'User' ? `Scope='User' AND UserID='${target.UserID}'`
                    : target.Scope === 'Role' ? `Scope='Role' AND RoleID='${target.RoleID}'`
                    : `Scope='Global' AND UserID IS NULL AND RoleID IS NULL`;
                const rv = RunView.FromMetadataProvider(provider);
                const result = await rv.RunView<{ ID: string; ComponentID: string }>({
                    EntityName: "MJ: Entity Form Contributions",
                    ExtraFilter: `EntityID='${target.EntityID}' AND ContributionKey='${target.ContributionKey.replace(/'/g, "''")}' AND ${scopeClause} AND Status='Active' AND ID <> '${target.ID}'`,
                    Fields: ['ID', 'ComponentID'], ResultType: 'simple',
                }, user);
                if (!result.Success) return failure("QUERY_FAILED", `Prior-active lookup failed: ${result.ErrorMessage ?? 'unknown error'}`);
                priors = result.Results ?? [];
            }

            const component = await loadComponent(provider, user, target.ComponentID);
            if (!component) return failure("COMPONENT_NOT_FOUND", `Contribution ${contributionID} points at Component ${target.ComponentID} which no longer exists.`);
            component.Status = mapToComponentStatus('Active');
            if (!(await component.Save())) return failure("PERSIST_FAILED", `Could not flip Component to Published: ${component.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            target.Status = 'Active';
            if (!(await target.Save())) return failure("PERSIST_FAILED", `Could not flip Contribution to Active: ${target.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            let firstPriorID: string | null = null;
            for (const prior of priors) {
                firstPriorID ??= prior.ID;
                const priorRow = await loadContribution(provider, user, prior.ID);
                const priorComponent = await loadComponent(provider, user, prior.ComponentID);
                if (priorRow) { priorRow.Status = 'Inactive'; await priorRow.Save(); }
                if (priorComponent) { priorComponent.Status = mapToComponentStatus('Inactive'); await priorComponent.Save(); }
            }

            addOutput(params, "ContributionID", target.ID);
            addOutput(params, "ComponentID", target.ComponentID);
            addOutput(params, "PreviousActiveContributionID", firstPriorID);
            return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify({ ContributionID: target.ID, ComponentID: target.ComponentID, PreviousActiveContributionID: firstPriorID, DemotedCount: priors.length }) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`ActivateFormContributionVersionAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }
}

export function LoadActivateFormContributionVersionAction(): void {
    if (false as boolean) { const _: unknown = ActivateFormContributionVersionAction; }
}
```

Add both exports to `index.ts`.

- [ ] **Step 5: Run tests and build**

Run: `cd packages/Actions/CoreActions && pnpm test && pnpm run build`
Expected: PASS.

- [ ] **Step 6: Stage for review**

```bash
git add packages/Actions/CoreActions/src/custom/interactive-forms/modify-form-contribution.action.ts packages/Actions/CoreActions/src/custom/interactive-forms/activate-form-contribution-version.action.ts packages/Actions/CoreActions/src/custom/interactive-forms/index.ts packages/Actions/CoreActions/src/__tests__/modify-form-contribution.action.test.ts
```

---

### Task B3: `Get Form Contributions For Entity` and action metadata

**Files:**
- Create: `packages/Actions/CoreActions/src/custom/interactive-forms/get-form-contributions-for-entity.action.ts`
- Modify: `packages/Actions/CoreActions/src/custom/interactive-forms/index.ts`
- Create: `metadata/actions/.form-contributions-actions.json`

**Interfaces:**
- Produces: `Get Form Contributions For Entity` (`__GetFormContributionsForEntity`): input `EntityName`; output `Result` JSON `{ EntityName, Contributions: Array<{ ContributionID, ComponentID, ComponentName, ComponentVersion, Name, Scope, Status, Priority, Slot, ContributionKey, RelatedEntity, RelatedJoinField, ReplacesSectionKey, Inclusion, Presentation, Title }> }` — every row applicable to the caller (User/Role/Global) in every status, sorted Active first then Pending then Inactive, then Priority DESC. Metadata rows for all four B-phase actions plus the D3 action.

- [ ] **Step 1: Create the action**

```ts
// packages/Actions/CoreActions/src/custom/interactive-forms/get-form-contributions-for-entity.action.ts
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import type { MJEntityFormContributionEntity } from "@memberjunction/core-entities";
import { addOutput, failure, getStringParam } from "./_shared";

export interface FormContributionSummary {
    ContributionID: string; ComponentID: string; ComponentName: string | null; ComponentVersion: string | null;
    Name: string; Scope: string; Status: string; Priority: number; Slot: string; ContributionKey: string | null;
    RelatedEntity: string | null; RelatedJoinField: string | null; ReplacesSectionKey: string | null;
    Inclusion: string | null; Presentation: string; Title: string | null;
}

/**
 * Read-only: every `MJ: Entity Form Contributions` row that applies to (entity, caller),
 * in every status, so an apply flow or agent can decide Create vs Modify and see what
 * already exists. Companion of `Get Active Form For Entity`.
 */
@RegisterClass(BaseAction, "__GetFormContributionsForEntity")
export class GetFormContributionsForEntityAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = getStringParam(params, "EntityName");
            if (!entityName) return failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.");
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");
            const entity = provider.EntityByName(entityName);
            if (!entity) return failure("ENTITY_NOT_FOUND", `Entity '${entityName}' is not registered.`);

            const roleIDs = ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? []).map(r => r.RoleID).filter((x): x is string => !!x);
            const roleClause = roleIDs.length > 0 ? `(Scope='Role' AND RoleID IN (${roleIDs.map(id => `'${id}'`).join(',')}))` : `(1=0)`;
            const rv = RunView.FromMetadataProvider(provider);
            const rows = await rv.RunView<MJEntityFormContributionEntity>({
                EntityName: "MJ: Entity Form Contributions",
                ExtraFilter: `EntityID='${entity.ID}' AND ((Scope='User' AND UserID='${user.ID}') OR ${roleClause} OR Scope='Global')`,
                OrderBy: "Priority DESC, SortKey DESC",
                ResultType: 'entity_object',
            }, user);
            if (!rows.Success) return failure("QUERY_FAILED", rows.ErrorMessage ?? 'Contribution lookup failed.');

            const componentIDs = [...new Set((rows.Results ?? []).map(r => r.ComponentID))];
            const components = new Map<string, { Name: string; Version: string }>();
            if (componentIDs.length > 0) {
                const comps = await rv.RunView<{ ID: string; Name: string; Version: string }>({
                    EntityName: "MJ: Components",
                    ExtraFilter: `ID IN (${componentIDs.map(id => `'${id}'`).join(',')})`,
                    Fields: ['ID', 'Name', 'Version'], ResultType: 'simple',
                }, user);
                for (const c of comps.Results ?? []) components.set(c.ID.toLowerCase(), { Name: c.Name, Version: c.Version });
            }

            const statusRank = (s: string) => (s === 'Active' ? 0 : s === 'Pending' ? 1 : 2);
            const summaries: FormContributionSummary[] = (rows.Results ?? [])
                .sort((a, b) => statusRank(a.Status) - statusRank(b.Status) || (b.Priority ?? 0) - (a.Priority ?? 0))
                .map(r => ({
                    ContributionID: r.ID, ComponentID: r.ComponentID,
                    ComponentName: components.get(r.ComponentID.toLowerCase())?.Name ?? null,
                    ComponentVersion: components.get(r.ComponentID.toLowerCase())?.Version ?? null,
                    Name: r.Name, Scope: r.Scope, Status: r.Status, Priority: r.Priority ?? 0, Slot: r.Slot,
                    ContributionKey: r.ContributionKey, RelatedEntity: r.RelatedEntity ?? null, RelatedJoinField: r.RelatedJoinField,
                    ReplacesSectionKey: r.ReplacesSectionKey, Inclusion: r.Inclusion, Presentation: r.Presentation, Title: r.Title,
                }));

            const payload = { EntityName: entity.Name, Contributions: summaries };
            addOutput(params, "Result", payload);
            return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetFormContributionsForEntityAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }
}

export function LoadGetFormContributionsForEntityAction(): void {
    if (false as boolean) { const _: unknown = GetFormContributionsForEntityAction; }
}
```

Add the export to `index.ts`.

- [ ] **Step 2: Write the action metadata**

Generate one UUID per record with `uuidgen | tr '[:lower:]' '[:upper:]'` and replace every `<uuidgen>` below. Do not add `sync` blocks.

```json
[
  {
    "fields": {
      "Name": "Create Form Contribution",
      "Description": "Persists a net-new form contribution: lints the ComponentSpec (must declare componentRole='form-panel' and a formContribution block), inserts a Type='Widget' Component v1.0.0, and creates a Pending, User-scoped MJ: Entity Form Contributions row at the declared slot with any related-grid claim or replacesSectionKey. Returns ALREADY_EXISTS when the caller already has an Active or Pending row with the same ContributionKey — use 'Modify Form Contribution' then. Scope is always clamped to User.",
      "DriverClass": "__CreateFormContribution",
      "Type": "Custom",
      "Status": "Active",
      "IconClass": "fa-solid fa-puzzle-piece",
      "CategoryID": "@lookup:MJ: Action Categories.Name=Utilities"
    },
    "relatedEntities": {
      "MJ: Action Params": [
        { "fields": { "ActionID": "@parent:ID", "Name": "EntityName", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Parent form entity, e.g. 'MJ_BizApps_Common: People'.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Name", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Human label for the contribution row (version lineage label).", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Spec", "Type": "Input", "ValueType": "Other", "IsArray": false, "Description": "ComponentSpec with componentRole='form-panel', location='embedded', code, and a formContribution block { slot, presentation, title, contributionKey?, relatedEntity?, relatedJoinField?, replacesSectionKey?, inclusion?, chromeGroup?, sortKey?, icon?, configuration? }.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Description", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Optional description.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Notes", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Optional authoring notes.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Priority", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Optional last-wins priority against a compiled contribution with the same key. The apply flow passes incumbent + 1 after the user confirms. Default 0.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "ContributionID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "New MJ: Entity Form Contributions row ID.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "ComponentID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "New MJ: Components row ID.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Version", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Always 1.0.0 for Create.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } }
      ],
      "MJ: Action Result Codes": [
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "SUCCESS", "Description": "Component and contribution row created (Pending)." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "MISSING_PARAMETER", "Description": "EntityName, Name or Spec missing." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "ENTITY_NOT_FOUND", "Description": "EntityName is not registered." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "RELATED_ENTITY_NOT_FOUND", "Description": "formContribution.relatedEntity is not registered." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "LINT_FAILED", "Description": "Spec is not a form panel or its code failed linting; message carries the violations." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "ALREADY_EXISTS", "Description": "An Active or Pending User-scope row with this ContributionKey exists; use Modify." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "PERSIST_FAILED", "Description": "Component or contribution insert failed." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_PROVIDER", "Description": "No metadata provider configured." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_USER", "Description": "No ContextUser." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "UNEXPECTED_ERROR", "Description": "Unhandled exception." }, "primaryKey": { "ID": "<uuidgen>" } }
      ]
    },
    "primaryKey": { "ID": "<uuidgen>" }
  },
  {
    "fields": {
      "Name": "Modify Form Contribution",
      "Description": "Refines an existing form contribution. Pending source + in-place (default) overwrites the draft; Active source (default minor) or any explicit patch/minor/major bump inserts a new Pending Component + row and leaves the source alone (a Pending source being bumped is demoted to Inactive). Refreshes the row's slot/key/claims/title from the spec's formContribution block. Always writes User scope. Caller must own the source row.",
      "DriverClass": "__ModifyFormContribution",
      "Type": "Custom",
      "Status": "Active",
      "IconClass": "fa-solid fa-pen-to-square",
      "CategoryID": "@lookup:MJ: Action Categories.Name=Utilities"
    },
    "relatedEntities": {
      "MJ: Action Params": [
        { "fields": { "ActionID": "@parent:ID", "Name": "ContributionID", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "MJ: Entity Form Contributions row to modify.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Spec", "Type": "Input", "ValueType": "Other", "IsArray": false, "Description": "The new form-panel ComponentSpec.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Notes", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Appended to the row's Notes.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "VersionBumpKind", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "in-place | patch | minor | major. Default: Pending→in-place, Active→minor, Inactive→patch.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "ContributionID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Row that now holds the spec (source for in-place, new row otherwise).", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "ComponentID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Component that now holds the spec.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Version", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Resulting component version.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Mode", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "in-place | new-version.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } }
      ],
      "MJ: Action Result Codes": [
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "SUCCESS", "Description": "Modified." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "MISSING_PARAMETER", "Description": "ContributionID or Spec missing." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "INVALID_PARAMETER", "Description": "VersionBumpKind not recognized." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "CONTRIBUTION_NOT_FOUND", "Description": "No such row." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "COMPONENT_NOT_FOUND", "Description": "Row points at a missing Component." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "RELATED_ENTITY_NOT_FOUND", "Description": "formContribution.relatedEntity is not registered." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "FORBIDDEN", "Description": "Caller does not own the row." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "INVALID_BUMP_FOR_STATUS", "Description": "in-place requested on a non-Pending row." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "LINT_FAILED", "Description": "Spec failed the form-panel lint." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "PERSIST_FAILED", "Description": "A save failed." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_PROVIDER", "Description": "No metadata provider configured." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_USER", "Description": "No ContextUser." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "UNEXPECTED_ERROR", "Description": "Unhandled exception." }, "primaryKey": { "ID": "<uuidgen>" } }
      ]
    },
    "primaryKey": { "ID": "<uuidgen>" }
  },
  {
    "fields": {
      "Name": "Activate Form Contribution Version",
      "Description": "Promotes a Pending form contribution to Active and demotes the Active sibling sharing its EntityID, ContributionKey and scope tuple (Component statuses follow: Published / Deprecated). Idempotent on an Active row; NOT_PENDING on an Inactive row. Caller must own the row.",
      "DriverClass": "__ActivateFormContributionVersion",
      "Type": "Custom",
      "Status": "Active",
      "IconClass": "fa-solid fa-toggle-on",
      "CategoryID": "@lookup:MJ: Action Categories.Name=Utilities"
    },
    "relatedEntities": {
      "MJ: Action Params": [
        { "fields": { "ActionID": "@parent:ID", "Name": "ContributionID", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Pending row to activate.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "ContributionID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Echoed.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "ComponentID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Component now Published.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "PreviousActiveContributionID", "Type": "Output", "ValueType": "Scalar", "IsArray": false, "Description": "Demoted sibling, or null.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } }
      ],
      "MJ: Action Result Codes": [
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "SUCCESS", "Description": "Activated (or already Active)." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "MISSING_PARAMETER", "Description": "ContributionID missing." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "CONTRIBUTION_NOT_FOUND", "Description": "No such row." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "COMPONENT_NOT_FOUND", "Description": "Row points at a missing Component." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NOT_PENDING", "Description": "Row is Inactive." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "FORBIDDEN", "Description": "Caller does not own the row." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "QUERY_FAILED", "Description": "Sibling lookup failed." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "PERSIST_FAILED", "Description": "A save failed." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_PROVIDER", "Description": "No metadata provider configured." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_USER", "Description": "No ContextUser." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "UNEXPECTED_ERROR", "Description": "Unhandled exception." }, "primaryKey": { "ID": "<uuidgen>" } }
      ]
    },
    "primaryKey": { "ID": "<uuidgen>" }
  },
  {
    "fields": {
      "Name": "Get Form Contributions For Entity",
      "Description": "Read-only. Every MJ: Entity Form Contributions row applicable to the caller (User / Role / Global) for an entity, in every status, with component name and version. Apply flows use it to decide Create vs Modify; agents use it to see what already exists.",
      "DriverClass": "__GetFormContributionsForEntity",
      "Type": "Custom",
      "Status": "Active",
      "IconClass": "fa-solid fa-list-check",
      "CategoryID": "@lookup:MJ: Action Categories.Name=Utilities"
    },
    "relatedEntities": {
      "MJ: Action Params": [
        { "fields": { "ActionID": "@parent:ID", "Name": "EntityName", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Parent form entity.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Result", "Type": "Output", "ValueType": "Other", "IsArray": false, "Description": "{ EntityName, Contributions: [{ ContributionID, ComponentID, ComponentName, ComponentVersion, Name, Scope, Status, Priority, Slot, ContributionKey, RelatedEntity, RelatedJoinField, ReplacesSectionKey, Inclusion, Presentation, Title }] }", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } }
      ],
      "MJ: Action Result Codes": [
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "SUCCESS", "Description": "Rows returned (possibly empty)." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "MISSING_PARAMETER", "Description": "EntityName missing." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "ENTITY_NOT_FOUND", "Description": "EntityName is not registered." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "QUERY_FAILED", "Description": "RunView failed." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_PROVIDER", "Description": "No metadata provider configured." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_USER", "Description": "No ContextUser." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "UNEXPECTED_ERROR", "Description": "Unhandled exception." }, "primaryKey": { "ID": "<uuidgen>" } }
      ]
    },
    "primaryKey": { "ID": "<uuidgen>" }
  }
]
```

Task D3 appends the fifth action (`Get Form Composition For Entity`) to this same file.

- [ ] **Step 3: Push metadata, build, smoke-test**

```bash
pnpm mj sync push --dir=metadata --include=actions
cd packages/Actions/CoreActions && pnpm run build && pnpm test
```

Expected: four new `MJ: Actions` rows; build clean. Then, with MJAPI running, invoke `Get Form Contributions For Entity` from the Actions dashboard with `EntityName = MJ: Applications` and confirm `{ "EntityName": "MJ: Applications", "Contributions": [] }`.

- [ ] **Step 4: Stage for review**

```bash
git add packages/Actions/CoreActions/src/custom/interactive-forms/get-form-contributions-for-entity.action.ts packages/Actions/CoreActions/src/custom/interactive-forms/index.ts metadata/actions/.form-contributions-actions.json
```

---

### Task B4: Artifact viewer detection and preview; `ApplyContribution`

**Files:**
- Modify: `packages/Angular/Generic/base-forms/src/lib/interactive-form/form-panel-host-props.builder.ts` (add `ContributionSpecToRegistration`)
- Modify: `packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts` (form detection near line 400; new preview props)
- Modify: `packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.html` (button label near line 59; preview branch)
- Modify: `packages/Angular/Generic/artifacts/src/lib/services/interactive-form-apply.service.ts`
- Modify: `packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts:1144`
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/artifact-resource.component.ts:54`
- Test: `packages/Angular/Generic/artifacts/src/lib/__tests__/interactive-form-apply.service.test.ts` (append)

**Interfaces:**
- Consumes: `isFormPanelRole`, `getDeclaredFormContribution`, `FormContributionSpec` (A1); `BuildFormPanelHostProps`, `FormCompositionSnapshot` (A6/A9); actions from B1–B3 by name.
- Produces: `ContributionSpecToRegistration(entityName: string, contribution: FormContributionSpec, componentID?: string): FormContributionRegistration`; `InteractiveFormApplyService.ConfirmAndApply(spec, entityName, provider?, snapshot?: FormCompositionSnapshot | null)` routes panels to `ApplyContribution`; `InteractiveFormApplyResult.Kind: 'form' | 'contribution'`; artifact viewer shows **Add to my form** and previews the panel.

- [ ] **Step 1: Write the failing tests (append to the apply-service test)**

```ts
describe('ConfirmAndApply — form-panel specs', () => {
    const panelSpec = {
        name: 'PersonLtvStrip', title: 'Lifetime value', componentRole: 'form-panel', location: 'embedded', code: 'function PersonLtvStrip(){return null;}',
        formContribution: { slot: 'before-fields', presentation: 'bare', title: 'Lifetime value', contributionKey: 'header', replacesSectionKey: 'details' },
    } as unknown as ComponentSpec;

    beforeEach(() => {
        hoisted.actionCalls = [];
        hoisted.actionResponses.set('Get Form Contributions For Entity', { Success: true, Message: JSON.stringify({ EntityName: 'MJ_BizApps_Common: People', Contributions: [] }) });
        hoisted.actionResponses.set('Create Form Contribution', { Success: true, Message: JSON.stringify({ ContributionID: 'ROW-1', ComponentID: 'COMP-1', Version: '1.0.0' }) });
        hoisted.actionResponses.set('Activate Form Contribution Version', { Success: true, Message: JSON.stringify({ ContributionID: 'ROW-1' }) });
    });

    it('routes to Create Form Contribution then Activate, and reports Kind contribution', async () => {
        const result = await service.ConfirmAndApply(panelSpec, 'MJ_BizApps_Common: People', provider, null);
        expect(result.Success).toBe(true);
        expect(result.Kind).toBe('contribution');
        expect(hoisted.actionCalls.map(c => c.id)).toEqual(['Get Form Contributions For Entity', 'Create Form Contribution', 'Activate Form Contribution Version']);
    });

    it('passes incumbent + 1 as Priority when the snapshot shows a compiled contribution with the same key', async () => {
        const snapshot = { Entity: 'MJ_BizApps_Common: People', Layout: 'accordion', Sections: [{ Key: 'details', Title: 'Details', Variant: 'default', Group: null, Hidden: false }],
            Related: [], Contributions: [{ Key: 'header', Slot: 'before-fields', Source: 'class', Title: 'Header', Presentation: 'bare', Hidden: false, Priority: 3 }],
            SlotsPresent: ['before-fields'], ChromeRuleCount: 0 };
        await service.ConfirmAndApply(panelSpec, 'MJ_BizApps_Common: People', provider, snapshot as never);
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const priority = (create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Priority');
        expect(priority?.Value).toBe('4');
    });

    it('drops replacesSectionKey when the snapshot has no such section and the user picks the extra-pane fallback', async () => {
        const snapshot = { Entity: 'MJ_BizApps_Common: People', Layout: 'accordion', Sections: [{ Key: 'summary', Title: 'Summary', Variant: 'default', Group: null, Hidden: false }],
            Related: [], Contributions: [], SlotsPresent: ['before-fields'], ChromeRuleCount: 0 };
        await service.ConfirmAndApply(panelSpec, 'MJ_BizApps_Common: People', provider, snapshot as never);
        const create = hoisted.actionCalls.find(c => c.id === 'Create Form Contribution')!;
        const sent = JSON.parse((create.params as Array<{ Name: string; Value: string }>).find(p => p.Name === 'Spec')!.Value) as { formContribution: { replacesSectionKey?: string } };
        expect(sent.formContribution.replacesSectionKey).toBeUndefined();
    });

    it('routes to Modify when the caller already has a Pending row with the same key', async () => {
        hoisted.actionResponses.set('Get Form Contributions For Entity', { Success: true, Message: JSON.stringify({ EntityName: 'x', Contributions: [{ ContributionID: 'ROW-9', ContributionKey: 'header', Status: 'Pending', ComponentName: 'OldName' }] }) });
        hoisted.actionResponses.set('Modify Form Contribution', { Success: true, Message: JSON.stringify({ ContributionID: 'ROW-9', ComponentID: 'COMP-9', Version: '1.0.0', Mode: 'in-place' }) });
        await service.ConfirmAndApply(panelSpec, 'MJ_BizApps_Common: People', provider, null);
        expect(hoisted.actionCalls.map(c => c.id)).toContain('Modify Form Contribution');
        expect(hoisted.actionCalls.map(c => c.id)).not.toContain('Create Form Contribution');
    });
});
```

The existing test file's mock dialog always answers the primary action; that is the path exercised here (primary = "Add" / "Replace" / "Add as extra pane"). The snapshot fixture's `Priority` field comes from `FormCompositionContribution` (A9).

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Generic/artifacts && pnpm vitest run src/lib/__tests__/interactive-form-apply.service.test.ts`
Expected: the new cases FAIL (`Kind` undefined; the service runs the form actions).

- [ ] **Step 3: Add `ContributionSpecToRegistration` to the builder (ng-base-forms)**

```ts
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';

/** A registration for a spec that has not been persisted yet (artifact preview). */
export function ContributionSpecToRegistration(entityName: string, contribution: FormContributionSpec, componentID?: string): FormContributionRegistration {
    return {
        Priority: 0,
        Source: 'metadata',
        ComponentID: componentID,
        Title: contribution.title,
        Icon: contribution.icon,
        Presentation: contribution.presentation,
        Configuration: contribution.configuration ?? {},
        Metadata: {
            entity: entityName,
            slot: contribution.slot,
            sortKey: contribution.sortKey ?? 0,
            contributionKey: contribution.contributionKey,
            relatedEntity: contribution.relatedEntity,
            relatedJoinField: contribution.relatedJoinField,
            replacesSectionKey: contribution.replacesSectionKey,
            inclusion: contribution.inclusion,
            chromeGroup: contribution.chromeGroup,
            presentation: contribution.presentation,
        },
    };
}
```

Rebuild `ng-base-forms`.

- [ ] **Step 4: Artifact viewer**

In `component-artifact-viewer.component.ts`:

```ts
import { isFormRole, isFormPanelRole, getDeclaredFormContribution, getDeclaredFormEntityName, type FormPanelHostProps } from '@memberjunction/interactive-component-types/forms';
import { BuildFormPanelHostProps, ContributionSpecToRegistration, ResolveContributionKey } from '@memberjunction/ng-base-forms';

  public isFormPanelArtifact = false;
  public panelPreviewProps: FormPanelHostProps | null = null;
```

In `detectAndInitFormArtifact()` change the guard and add the panel preview props after the record resolves:

```ts
    const spec = this.component;
    if (!spec || (!isFormRole(spec) && !isFormPanelRole(spec))) return;
    this.isFormArtifact = true;
    this.isFormPanelArtifact = isFormPanelRole(spec);
    // ...existing entity + record resolution unchanged...
    this.rebuildPanelPreviewProps();
    this.cdr.detectChanges();
```

```ts
  /** Preview props for a form-panel artifact: no host form, so permissions read false and no related view params. */
  private rebuildPanelPreviewProps(): void {
    this.panelPreviewProps = null;
    if (!this.isFormPanelArtifact || !this.formRecord || !this.formEntityInfo || !this.component) return;
    const contribution = getDeclaredFormContribution(this.component);
    if (!contribution) return;
    const registration = ContributionSpecToRegistration(this.formEntityInfo.Name, contribution);
    this.panelPreviewProps = BuildFormPanelHostProps({
      Record: this.formRecord,
      FormComponent: null,
      Contribution: registration,
      SectionKey: ResolveContributionKey(registration.Metadata) || `preview:${this.component.name}`,
      Layout: 'accordion',
      IsExpanded: true,
    });
  }
```

Call `rebuildPanelPreviewProps()` wherever the record picker swaps `formRecord`.

Template — button label and the preview branch:

```html
          <button type="button" class="form-artifact-apply-btn" (click)="onApplyClicked()">
            <i class="fa-solid" [class.fa-circle-check]="!isFormPanelArtifact" [class.fa-puzzle-piece]="isFormPanelArtifact"></i>
            {{ isFormPanelArtifact ? 'Add to my form' : 'Apply to my form' }}
          </button>
```

Where the form-aware branch renders `<mj-interactive-form … previewMode>`, add the panel alternative:

```html
@if (isFormPanelArtifact) {
  @if (panelPreviewProps) {
    <div class="form-artifact-panel-preview">
      <mj-react-component [component]="component" [componentProps]="panelPreviewProps"></mj-react-component>
    </div>
  } @else {
    <div class="mj-loading-state"><i class="fa-solid fa-spinner fa-spin"></i><span>Binding a record…</span></div>
  }
} @else {
  <!-- existing <mj-interactive-form previewMode> block -->
}
```

- [ ] **Step 5: `InteractiveFormApplyService`**

```ts
import { isFormPanelRole, getDeclaredFormContribution, type FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import type { FormCompositionSnapshot } from '@memberjunction/ng-base-forms';

export interface InteractiveFormApplyResult {
    Success: boolean;
    /** 'form' for whole-form overrides, 'contribution' for form panels. */
    Kind?: 'form' | 'contribution';
    Mode?: 'create' | 'modify-new-version' | 'modify-in-place';
    OverrideID?: string;
    ContributionID?: string;
    ComponentID?: string;
    Version?: string;
    Message?: string;
}
```

At the top of `ConfirmAndApply`, after the provider/entity/user checks, before the GraphQL client guard:

```ts
    public async ConfirmAndApply(
        spec: ComponentSpec,
        entityName: string,
        provider?: IMetadataProvider,
        snapshot: FormCompositionSnapshot | null = null,
    ): Promise<InteractiveFormApplyResult> {
        // ...existing provider / entity / user resolution...
        const client = new GraphQLActionClient(gqlProvider);
        if (isFormPanelRole(spec)) {
            return this.applyContribution(spec, entity.Name, client, p, snapshot);
        }
        // ...existing whole-form path, unchanged, but return { ...result, Kind: 'form' } from summarize...
```

New private method:

```ts
    private async applyContribution(
        spec: ComponentSpec,
        entityName: string,
        client: GraphQLActionClient,
        provider: IMetadataProvider,
        snapshot: FormCompositionSnapshot | null,
    ): Promise<InteractiveFormApplyResult> {
        const contribution = getDeclaredFormContribution(spec);
        if (!contribution) return this.fail('This component declares componentRole form-panel but has no readable formContribution block.');
        const sameEntity = snapshot && snapshot.Entity === entityName ? snapshot : null;

        // Decision 4: validate replacesSectionKey against the live form; offer the extra-pane fallback.
        if (contribution.replacesSectionKey && sameEntity && !sameEntity.Sections.some(s => s.Key === contribution.replacesSectionKey)) {
            const mountAsPane = await this.ask(
                'Section not found',
                `The current "${entityName}" form has no section "${contribution.replacesSectionKey}", so nothing would be replaced. Add this as an extra pane instead?`,
                'Add as extra pane',
            );
            if (!mountAsPane) return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };
            delete contribution.replacesSectionKey;
        }

        // Decision 1: compiled wins ties; replacing a compiled contribution is an explicit choice.
        const key = contribution.contributionKey
            ?? (contribution.relatedEntity ? `related:${contribution.relatedEntity}:${contribution.relatedJoinField ?? ''}` : null);
        let priority = 0;
        const incumbent = key ? sameEntity?.Contributions.find(c => c.Key === key && c.Source === 'class') : undefined;
        if (incumbent) {
            const replace = await this.ask(
                'Replace an installed contribution?',
                `An installed app already provides "${incumbent.Title}" on this form. Replace it with this panel for your user?`,
                'Replace',
            );
            if (!replace) return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };
            priority = incumbent.Priority + 1;
        }

        const existingResult = await this.runActionByName(client, 'Get Form Contributions For Entity', [
            { Name: 'EntityName', Value: entityName, Type: 'Input' },
        ], provider);
        if (!existingResult.Success) return this.fail(`Could not check existing contributions: ${existingResult.Message ?? 'unknown error'}`);
        const existing = this.parseContributions(existingResult.Message)
            .find(c => key && c.ContributionKey === key && (c.Status === 'Active' || c.Status === 'Pending') && c.Scope === 'User');

        const proceed = await this.ask(
            'Add this to your form?',
            existing
                ? `You already have "${existing.Name ?? key}" on "${entityName}". Applying creates a new version and makes it active for your user.`
                : `This adds "${contribution.title}" to the "${entityName}" form at ${contribution.slot}, for your user only.`,
            'Add',
        );
        if (!proceed) return { Success: false, Kind: 'contribution', Message: 'Cancelled by user.' };

        const specToSend: ComponentSpec = { ...spec, formContribution: contribution };
        let result: { Success: boolean; Message?: string; ResultCode?: string };
        let mode: InteractiveFormApplyResult['Mode'];
        if (existing) {
            if (existing.ComponentName) this.alignSpecToLineage(specToSend, existing.ComponentName);
            result = await this.runActionByName(client, 'Modify Form Contribution', [
                { Name: 'ContributionID', Value: existing.ContributionID, Type: 'Input' },
                { Name: 'Spec', Value: JSON.stringify(specToSend), Type: 'Input' },
                { Name: 'Notes', Value: `Applied from chat artifact at ${new Date().toISOString()}`, Type: 'Input' },
                { Name: 'VersionBumpKind', Value: existing.Status === 'Pending' ? 'in-place' : 'minor', Type: 'Input' },
            ], provider);
            mode = existing.Status === 'Pending' ? 'modify-in-place' : 'modify-new-version';
        } else {
            result = await this.runActionByName(client, 'Create Form Contribution', [
                { Name: 'EntityName', Value: entityName, Type: 'Input' },
                { Name: 'Name', Value: contribution.title, Type: 'Input' },
                { Name: 'Spec', Value: JSON.stringify(specToSend), Type: 'Input' },
                { Name: 'Priority', Value: String(priority), Type: 'Input' },
            ], provider);
            mode = 'create';
        }
        if (!result.Success) {
            this.notifications.CreateSimpleNotification(`Add failed: ${result.Message ?? result.ResultCode ?? 'unknown error'}`, 'error', 5000);
            return { Success: false, Kind: 'contribution', Message: result.Message };
        }

        let payload: { ContributionID?: string; ComponentID?: string; Version?: string } = {};
        try { payload = JSON.parse(result.Message ?? '{}'); } catch { /* best effort */ }
        let activated = false;
        if (payload.ContributionID) {
            const act = await this.runActionByName(client, 'Activate Form Contribution Version', [
                { Name: 'ContributionID', Value: payload.ContributionID, Type: 'Input' },
            ], provider);
            activated = act.Success;
            if (!activated) LogError(`InteractiveFormApplyService: contribution ${payload.ContributionID} created but activation failed: ${act.Message ?? 'unknown error'}`);
        }
        this.notifications.CreateSimpleNotification(
            activated ? `"${contribution.title}" is now on your ${entityName} form.` : `"${contribution.title}" was saved as a Pending draft. Activate it from Form Studio.`,
            'success', 4000,
        );
        return { Success: true, Kind: 'contribution', Mode: mode, ContributionID: payload.ContributionID, ComponentID: payload.ComponentID, Version: payload.Version, Message: result.Message };
    }

    private parseContributions(message: string | undefined): Array<{ ContributionID: string; ContributionKey: string | null; Status: string; Scope: string; Name?: string; ComponentName?: string | null }> {
        if (!message) return [];
        try { return (JSON.parse(message) as { Contributions?: Array<{ ContributionID: string; ContributionKey: string | null; Status: string; Scope: string; Name?: string; ComponentName?: string | null }> }).Contributions ?? []; }
        catch { return []; }
    }

    /** Two-button confirm; resolves true on the primary action. */
    private async ask(title: string, content: string, primaryText: string): Promise<boolean> {
        const ref = this.dialog.Open({
            title, content, width: 540,
            actions: [{ text: primaryText, primary: true, themeColor: 'primary' }, { text: 'Cancel' }],
        });
        return new Promise<boolean>(resolve => {
            ref.Result.subscribe((res: unknown) => resolve((res as { primary?: boolean })?.primary === true));
        });
    }
```

Refactor the existing `confirm()` to call `ask()` so both paths share one dialog helper. The whole-form `summarize()` gains `Kind: 'form'` in its return.

- [ ] **Step 6: Pass the snapshot from both hosts**

`conversation-chat-area.component.ts` (line 1144):

```ts
  async OnApplyFormRequested(event: { spec: unknown; entityName: string }): Promise<void> {
    const additional = (this.appContext?.['AdditionalContext'] ?? null) as { Form?: FormCompositionSnapshot } | null;
    await this.interactiveFormApplyService.ConfirmAndApply(
      event.spec as ComponentSpec,
      event.entityName,
      this.ProviderToUse,
      additional?.Form ?? null,
    );
  }
```

`artifact-resource.component.ts` (line 54):

```ts
  async onApplyFormRequested(event: { spec: unknown; entityName: string }): Promise<void> {
    const additional = (this.navigationService.AppContextSnapshot$.value?.AdditionalContext ?? null) as { Form?: FormCompositionSnapshot } | null;
    await this.applyService.ConfirmAndApply(event.spec as ComponentSpec, event.entityName, this.ProviderToUse, additional?.Form ?? null);
  }
```

Both files import `FormCompositionSnapshot` from `@memberjunction/ng-base-forms` (already a dependency of both packages via the artifact viewer / single record).

- [ ] **Step 7: Run tests and build**

```bash
cd packages/Angular/Generic/base-forms && pnpm run build
cd ../artifacts && pnpm test && pnpm run build
cd ../conversations && pnpm run build
cd ../../Explorer/explorer-core && pnpm run build
```

Expected: PASS; builds clean. Manual check: in a conversation, ask Skip (or paste a saved artifact) for a form-panel spec and confirm the **Add to my form** button, the preview against a real record, and the resulting row via `Get Form Contributions For Entity`.

- [ ] **Step 8: Stage for review**

```bash
git add packages/Angular/Generic/base-forms/src/lib/interactive-form/form-panel-host-props.builder.ts packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.html packages/Angular/Generic/artifacts/src/lib/services/interactive-form-apply.service.ts packages/Angular/Generic/artifacts/src/lib/__tests__/interactive-form-apply.service.test.ts packages/Angular/Generic/conversations/src/lib/components/conversation/conversation-chat-area.component.ts packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/artifact-resource.component.ts
```

Phase B done-when: `pnpm run test:integration` green from the MJ root after migrate + codegen; a form-panel artifact applies, activates, and mounts on the next open of the record.

---

# Phase C — Skip-Brain

Skip-Brain consumes `@memberjunction/interactive-component-types` (A1) and `@askskip/types` (D2). Land A1 and D2 (published, or `yalc`-linked per `USING_YALC.md`) before C2–C4 compile. C1 is prompt text and has no build dependency.

### Task C1: Panel contract prompt and intent routing

**Files:**
- Create: `metadata/prompts/templates/shared/form-panel-role-contract.md`
- Modify: `metadata/prompts/templates/code-generation/unified-code-generator.md` (the `{% if _CURRENT_PAYLOAD.type == 'form' … %}` block near line 470)
- Modify: `metadata/prompts/templates/code-generation/software-architect-v2.md` (the same block near line 776)
- Modify: `metadata/prompts/templates/requirements-expert-agent.md` (the `#` target section near line 236)
- Modify: `apps/API/src/services/mentions/EntityMentionResolver.ts` (`buildTargetMarker`)
- Test: `apps/API/test/unit/services/mentions/EntityMentionResolver.test.ts` (append)

**Interfaces:**
- Produces: PRD `type: 'form-panel'`; prompt include `form-panel-role-contract.md`; `[TARGET ENTITY]` marker steers additive requests to a panel.

- [ ] **Step 1: Write the failing test (append)**

```ts
describe('applyToRequest — target marker wording', () => {
    it('tells downstream agents to prefer a form panel for additive requests', () => {
        const req = request(`${TOKEN} add a lifetime value strip to the top of the form`);
        EntityMentionResolver.applyToRequest(req, EntityMentionResolver.parse(req));
        const content = req.messages[0].content as string;
        expect(content).toContain('[TARGET ENTITY:');
        expect(content).toContain('form panel');
        expect(content).toContain('"form-panel"');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/API && pnpm vitest run test/unit/services/mentions/EntityMentionResolver.test.ts`
Expected: FAIL on the two new `toContain` assertions.

- [ ] **Step 3: Update the marker**

```ts
    private static buildTargetMarker(mentions: ResolvedEntityMention[]): string {
        const names = mentions.map(m => `"${m.name}"`).join(', ');
        const plural = mentions.length > 1 ? 'entities' : 'entity';
        return (
            `\n\n[TARGET ENTITY: The user explicitly selected the following ${plural} for this request ` +
            `via the entity picker — treat as the authoritative target: ${names}. ` +
            `If the request is form- or single-record-view shaped, produce a form (PRD type "form") bound to this entity. ` +
            `If the request ADDS, REPLACES, or RESTYLES one piece of that entity's form — a header strip, a KPI pane, ` +
            `one related-record section, one field group — produce a form panel (PRD type "form-panel") instead of a whole form.]`
        );
    }
```

- [ ] **Step 4: Write the shared contract include**

`metadata/prompts/templates/shared/form-panel-role-contract.md`:

````markdown
## Form-Panel Components (one contribution on an entity form)

Apply this section **only when building a form panel** — the PRD/spec `type` is `"form-panel"`. A form-panel component is **one piece** of MemberJunction's entity form: a hero strip, a KPI pane, a chart, a card list that replaces one related-record grid, or a richer replacement for one baked field section. It mounts inside the generated form next to everything else on that form. It does **not** replace the form. (For a whole-form replacement, use the form-role contract instead. For reports and dashboards, ignore this section.)

### The commitment

- Set **`componentRole: "form-panel"`** on the spec (required — it is what lets the panel mount on the form surface).
- Set **`entityName`** to the canonical parent entity name (e.g. `"MJ_BizApps_Common: People"`) and make it `dataRequirements.entities[0]`.
- Declare **`formContribution`** on the spec — where the panel goes and what it claims:

```json
"formContribution": {
  "slot": "before-fields | after-fields | after-related | top-area | after-everything",
  "presentation": "panel | bare",
  "title": "Section title shown in the header and left rail",
  "icon": "fa-solid fa-chart-line",
  "sortKey": 50,
  "contributionKey": "skip:person-ltv",
  "relatedEntity": "MJ_BizApps_Orders: Event Order Lines",
  "relatedJoinField": "PersonID",
  "replacesSectionKey": "details",
  "inclusion": "Primary | More | None",
  "configuration": { "metric": "ltv" }
}
```

- `slot` — `before-fields` is the top of the form (heroes); `after-fields` is the common place for extra panes; `after-related` sits with related grids. Default `after-fields`.
- `presentation` — `panel` (default) means the host wraps you in a collapsible section **with its own header**; do not draw a title bar. `bare` means you render a hero strip with no chrome; you own the header.
- `contributionKey` — a stable identity, `skip:<entity-ish>-<purpose>`. Reuse the same key when refining the same panel.
- `relatedEntity` (+ `relatedJoinField` when two FKs point at the same entity) — claims the related-record grid for that relationship; the stock grid hides and your panel is that section. The host passes `related.viewParams` and `related.newRecordValues`; use them.
- `replacesSectionKey` — hides one baked field section (e.g. `details`, `personalIdentity`). **Use only a key that appears in `[FORM CONTEXT]`.** Never invent one.
- `inclusion` — `Primary` for an own rail item, `More` to park it in the More folder, omit for the default.
- Never set a priority. The host decides that.

### Props the host passes

Your **root** component receives **FormPanelHostProps** (a superset of the whole-form props) plus the six standard props:

```ts
{@include ../../../../node_modules/@memberjunction/interactive-component-types/dist/forms/form-panel-host-props.d.ts}
```

```jsx
function PersonLtvStrip({
  entityName, primaryKey, record, entityMetadata, mode, canEdit, canDelete, canCreate,   // FormHostProps
  contribution, related, isExpanded, layout,                                              // FormPanelHostProps
  utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings,        // standard props
}) { /* ... */ }
```

### Hard rules

1. **Read the bound record from `record`. Never re-fetch it.** Related data comes from `utilities.rv.RunView` — when `related` is present, spread `related.viewParams` into the call (it already carries the correct FK filter, including Bill-To OR Ship-To joins).
2. **Never save, delete, or render Edit / Save / Cancel / Delete buttons.** The parent form's toolbar owns the record lifecycle. To propose a field value on the parent record, emit `callbacks.NotifyEvent('FieldChanged', { fieldName, oldValue, newValue, timestamp: new Date() })`; the host applies it and the parent's Save persists it.
3. **Report counts for the rail badge** when you render a list: `callbacks.NotifyEvent('RowCountChanged', { count, timestamp: new Date() })` after load.
4. **Defer expensive loads while `isExpanded` is false**, and do not refetch on every render.
5. **No fixed heights on the root.** Render `display: block; width: 100%`; in `layout === 'left-nav'` the host gives you the leftover column height. No `height: 600px`, no `100vh`.
6. **No header of your own when `presentation === 'panel'`.** The collapsible section already shows `contribution.title`.
7. **Make related rows drillable** with `callbacks.OpenEntityRecord(relatedEntityName, keyPairs)` using the related row's full primary key.
8. **Optional methods** — register with `callbacks.RegisterMethod` once in a `useEffect([])`: `'OnRecordRefreshed'` (reload your related data), `'SetEditMode'` (`{ mode }`), `'Validate'` (return `{ isValid, errors: string[] }` if you gate the parent save).
9. All standard JSX rules apply: no top-level imports, `React` is a global, `MaxRows` not `Limit`, only fields that exist on the entity, no `window.*`.
10. **Use `[FORM CONTEXT]` when present.** It lists the form's sections, related grids, existing contributions, and slots. Pick a `slot` that exists, a `replacesSectionKey` that exists, and a `contributionKey` that does not collide with an existing `class` contribution unless the user asked to replace it.

### Canonical pattern

{% raw %}
```jsx
function PersonLtvStrip({ record, primaryKey, contribution, related, isExpanded, layout, utilities, styles, callbacks }) {
  const [rows, setRows] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!isExpanded || loaded || !related) return;
    let cancelled = false;
    utilities.rv.RunView({ ...related.viewParams, MaxRows: 200 }).then((res) => {
      if (cancelled) return;
      const list = res?.Results ?? [];
      setRows(list); setLoaded(true);
      callbacks?.NotifyEvent?.('RowCountChanged', { count: list.length, timestamp: new Date() });
    });
    return () => { cancelled = true; };
  }, [isExpanded, loaded, primaryKey && JSON.stringify(primaryKey)]);

  React.useEffect(() => {
    callbacks?.RegisterMethod?.('OnRecordRefreshed', () => setLoaded(false));
  }, []);

  return (
    <div style={{ display: 'block', width: '100%' }}>
      {rows.map((r) => (
        <div key={r.ID} style={{ cursor: 'pointer' }} onClick={() => callbacks?.OpenEntityRecord?.(related.entityName, [{ FieldName: 'ID', Value: r.ID }])}>
          {r.Name}
        </div>
      ))}
    </div>
  );
}
```
{% endraw %}
````

- [ ] **Step 5: Include it where the form contract is included**

`unified-code-generator.md` — directly after the existing form block:

```
{% if _CURRENT_PAYLOAD.type == 'form-panel' or _CURRENT_PAYLOAD.componentRole == 'form-panel' %}
### Form-Panel Components

When you are generating a **form panel** (`type: "form-panel"` / `componentRole: "form-panel"`), the **root** component receives **FormPanelHostProps**, mounts inside the entity form next to the generated sections, and must never save the record or draw toolbar buttons. Set **`componentRole: "form-panel"`**, **`entityName`**, and a **`formContribution`** block on the spec.

{@include ../shared/form-panel-role-contract.md}
{% endif %}
```

`software-architect-v2.md` — after the form include:

```
{% if _CURRENT_PAYLOAD.type == 'form-panel' or _CURRENT_PAYLOAD.componentRole == 'form-panel' %}
{@include ../shared/form-panel-role-contract.md}
{% endif %}
```

`requirements-expert-agent.md` — add a third bullet to the `#` target section:

```
- **Form panel (one contribution on the entity's form).** When the request **adds, replaces, or restyles one piece** of the target entity's form — "add a lifetime-value strip at the top", "replace the Details panel with a money summary", "show tickets as cards instead of the grid", "put a renewal forecast in More" — set the PRD component `type` to `"form-panel"`, NOT `"form"`. The PRD must name: the **slot** (top of form = `before-fields`; extra pane = `after-fields`; with related grids = `after-related`), whether it is a **bare hero** or a **titled panel**, the **title**, and — when it replaces something — the exact **section key** or **related entity + join field** taken from `[FORM CONTEXT]`. Editable fields are NOT the core of a panel PRD; a panel never saves the record. If `[FORM CONTEXT]` is present, quote the section keys, slots, and existing contribution keys you rely on. Downstream agents build it against the **form-panel contract** (`componentRole: "form-panel"`, `FormPanelHostProps`, `formContribution`).
```

- [ ] **Step 6: Run the test; render-check the templates**

Run: `cd apps/API && pnpm vitest run test/unit/services/mentions/EntityMentionResolver.test.ts`
Expected: PASS. Then run the prompt template validation the repo uses for `{@include}` resolution (`pnpm --filter @skip-brain/agents test` or the template lint script in `scripts/`) and confirm no unresolved include.

- [ ] **Step 7: Stage for review**

```bash
git add metadata/prompts/templates/shared/form-panel-role-contract.md metadata/prompts/templates/code-generation/unified-code-generator.md metadata/prompts/templates/code-generation/software-architect-v2.md metadata/prompts/templates/requirements-expert-agent.md apps/API/src/services/mentions/EntityMentionResolver.ts apps/API/test/unit/services/mentions/EntityMentionResolver.test.ts
```

---

### Task C2: `applyFormRoleCommitment` handles panels

**Files:**
- Modify: `apps/API/src/services/workflow/WorkflowService.ts:1017` (`applyFormRoleCommitment`)
- Test: `apps/API/test/unit/services/workflow/WorkflowService.test.ts` (append)

**Interfaces:**
- Consumes: `ComponentSpec.formContribution`, `DEFAULT_FORM_CONTRIBUTION_SLOT` (A1).
- Produces: for `type === 'form-panel'` the spec leaves the workflow with `componentRole: 'form-panel'`, `entityName`, and a `formContribution` whose `slot`, `presentation`, and `title` are populated.

- [ ] **Step 1: Write the failing test (append)**

```ts
import { WorkflowService } from '../../../../src/services/workflow/WorkflowService.js';
import type { ComponentSpecExtended } from '@skip-brain/types';

type Commit = { applyFormRoleCommitment(spec: ComponentSpecExtended): void };
const commit = (spec: ComponentSpecExtended) =>
    (Object.create(WorkflowService.prototype) as unknown as Commit).applyFormRoleCommitment(spec);

describe('applyFormRoleCommitment — form panels', () => {
    it('stamps componentRole, entityName and formContribution defaults for type form-panel', () => {
        const spec = {
            name: 'PersonLtvStrip', title: 'Lifetime value', type: 'form-panel', code: '',
            dataRequirements: { mode: 'views', entities: [{ name: 'MJ_BizApps_Common: People' }] },
        } as unknown as ComponentSpecExtended;
        commit(spec);
        expect(spec.componentRole).toBe('form-panel');
        expect(spec.entityName).toBe('MJ_BizApps_Common: People');
        expect(spec.formContribution).toEqual({ slot: 'after-fields', presentation: 'panel', title: 'Lifetime value' });
    });

    it('keeps an architect-supplied formContribution and only fills the gaps', () => {
        const spec = {
            name: 'X', title: 'Hero', type: 'form-panel', code: '', entityName: 'MJ_BizApps_Common: People',
            formContribution: { slot: 'before-fields', presentation: 'bare', contributionKey: 'skip:hero' },
        } as unknown as ComponentSpecExtended;
        commit(spec);
        expect(spec.formContribution).toEqual({ slot: 'before-fields', presentation: 'bare', contributionKey: 'skip:hero', title: 'Hero' });
    });

    it('leaves whole forms and reports alone', () => {
        const form = { type: 'form', title: 'F', dataRequirements: { entities: [{ name: 'MJ: Users' }] } } as unknown as ComponentSpecExtended;
        commit(form);
        expect(form.componentRole).toBe('form');
        expect(form.formContribution).toBeUndefined();
        const report = { type: 'report', title: 'R' } as unknown as ComponentSpecExtended;
        commit(report);
        expect(report.componentRole).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/API && pnpm vitest run test/unit/services/workflow/WorkflowService.test.ts`
Expected: FAIL — `componentRole` is undefined for `form-panel`.

- [ ] **Step 3: Implement**

```ts
    /**
     * Stamp role commitment on the spec.
     *
     * `type` is descriptive; `componentRole` is the binding commitment the MJ host reads.
     * Generation agents reliably produce the code but inconsistently emit these
     * spec-level fields, so we set them deterministically before persistence.
     *   - type 'form'       → componentRole 'form', entityName
     *   - type 'form-panel' → componentRole 'form-panel', entityName, formContribution defaults
     */
    private applyFormRoleCommitment(spec: ComponentSpecExtended): void {
        const type = typeof spec.type === 'string' ? spec.type.toLowerCase() : '';
        if (type !== 'form' && type !== 'form-panel') return;

        if (!spec.componentRole) {
            spec.componentRole = type === 'form-panel' ? 'form-panel' : 'form';
        }
        if (!spec.entityName) {
            const boundEntity = spec.dataRequirements?.entities?.[0]?.name;
            if (boundEntity) spec.entityName = boundEntity;
        }
        if (type === 'form-panel') {
            const block = spec.formContribution ?? {};
            spec.formContribution = {
                ...block,
                slot: block.slot ?? 'after-fields',
                presentation: block.presentation === 'bare' ? 'bare' : 'panel',
                title: (block.title && block.title.trim().length > 0 ? block.title.trim() : spec.title) ?? spec.name,
            };
        }
    }
```

`ComponentSpecExtended` inherits `formContribution` from MJ's `ComponentSpec` (A1); no change to `@skip-brain/types`.

- [ ] **Step 4: Run tests and build**

Run: `cd apps/API && pnpm test && pnpm run build`
Expected: PASS.

- [ ] **Step 5: Stage for review**

```bash
git add apps/API/src/services/workflow/WorkflowService.ts apps/API/test/unit/services/workflow/WorkflowService.test.ts
```

---

### Task C3: Panel gates

**Files:**
- Create: `packages/component-engine/src/gates/FormPanelNoSaveGate.ts`, `FormPanelUsesHostPropsGate.ts`, `FormPanelNoFixedHeightGate.ts`
- Modify: `packages/component-engine/src/gates/FormLintParityGate.ts` (`appliesTo`)
- Modify: `packages/component-engine/src/gates/gate-runner.ts` (add `isFormPanelRoleSpec`)
- Modify: `packages/component-engine/src/gates/index.ts`
- Test: `packages/component-engine/src/__tests__/form-panel-gates.test.ts`

**Interfaces:**
- Produces: gates registered as `form-panel-no-save`, `form-panel-uses-host-props`, `form-panel-no-fixed-height`; `isFormPanelRoleSpec(spec): boolean`. Form-only gates (`form-not-editable`, `form-edit-lifecycle`, `form-must-use-mjformfields`, `form-view-not-input-like`) keep `appliesTo = ['form']` and never run for panels.

- [ ] **Step 1: Write the failing test**

```ts
// packages/component-engine/src/__tests__/form-panel-gates.test.ts
import { describe, it, expect } from 'vitest';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { FormPanelNoSaveGate } from '../gates/FormPanelNoSaveGate.js';
import { FormPanelUsesHostPropsGate } from '../gates/FormPanelUsesHostPropsGate.js';
import { FormPanelNoFixedHeightGate } from '../gates/FormPanelNoFixedHeightGate.js';
import { isFormPanelRoleSpec, isFormRoleSpec } from '../gates/gate-runner.js';

const ctx = { contextUser: {}, isUpdateMode: false };
const spec = (code: string): ComponentSpec => ({ name: 'P', title: 'P', type: 'form-panel', componentRole: 'form-panel', code } as unknown as ComponentSpec);

const GOOD = `function P({ record, contribution, related, isExpanded, utilities, callbacks }) {
  React.useEffect(() => { callbacks?.NotifyEvent?.('RowCountChanged', { count: 0, timestamp: new Date() }); }, []);
  return <div style={{ display: 'block', width: '100%' }}>{record?.Name}</div>;
}`;

describe('FormPanelNoSaveGate', () => {
    it('passes a panel that never saves', async () => {
        expect(await new FormPanelNoSaveGate().Validate(spec(GOOD), ctx)).toEqual([]);
    });
    it('flags BeforeSave, RequestSave, Save() and toolbar buttons', async () => {
        const bad = GOOD.replace('return', `callbacks.RegisterMethod('RequestSave', () => callbacks.NotifyEvent('BeforeSave', {})); await entity.Save(); return`);
        const v = await new FormPanelNoSaveGate().Validate(spec(bad), ctx);
        expect(v).toHaveLength(1);
        expect(v[0].message).toMatch(/RequestSave/);
        expect(v[0].message).toMatch(/BeforeSave/);
        expect(v[0].message).toMatch(/\.Save\(\)/);
    });
});

describe('FormPanelUsesHostPropsGate', () => {
    it('passes when the root destructures record and contribution', async () => {
        expect(await new FormPanelUsesHostPropsGate().Validate(spec(GOOD), ctx)).toEqual([]);
    });
    it('flags a root that ignores the panel props', async () => {
        const v = await new FormPanelUsesHostPropsGate().Validate(spec(`function P({ utilities, styles }) { return <div/>; }`), ctx);
        expect(v).toHaveLength(1);
    });
});

describe('FormPanelNoFixedHeightGate', () => {
    it('passes fluid roots', async () => {
        expect(await new FormPanelNoFixedHeightGate().Validate(spec(GOOD), ctx)).toEqual([]);
    });
    it('flags pixel and viewport heights', async () => {
        const v = await new FormPanelNoFixedHeightGate().Validate(spec(GOOD.replace("width: '100%'", "height: '600px', minHeight: '100vh'")), ctx);
        expect(v).toHaveLength(1);
        expect(v[0].message).toMatch(/600px/);
    });
});

describe('role predicates', () => {
    it('distinguishes forms from panels', () => {
        expect(isFormPanelRoleSpec(spec(GOOD))).toBe(true);
        expect(isFormRoleSpec(spec(GOOD))).toBe(false);
        expect(isFormPanelRoleSpec({ type: 'form-panel' } as unknown as ComponentSpec)).toBe(true);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/component-engine && pnpm vitest run src/__tests__/form-panel-gates.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the gates**

```ts
// packages/component-engine/src/gates/FormPanelNoSaveGate.ts
import { RegisterClass } from '@memberjunction/global';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { Violation } from '@memberjunction/react-linter';
import { BaseValidationGate, ValidationGateContext } from './BaseValidationGate.js';

/**
 * A form panel is one piece of the parent form. The parent's toolbar owns the record
 * lifecycle, so a panel must not wire save/delete or draw its own Save / Cancel / Delete.
 */
@RegisterClass(BaseValidationGate, 'form-panel-no-save')
export class FormPanelNoSaveGate extends BaseValidationGate {
    readonly appliesTo = ['form-panel'];
    readonly name = 'form-panel-no-save';
    readonly description = 'Form panel must not save, delete, or render record lifecycle buttons';

    async Validate(spec: ComponentSpec, _context: ValidationGateContext): Promise<Violation[]> {
        if (typeof spec.code !== 'string' || spec.code.trim().length === 0) return [];
        const code = spec.code;
        const offenders = [
            [/RegisterMethod\s*(?:\?\.)?\s*\(\s*['"`]RequestSave['"`]/, "RegisterMethod('RequestSave')"],
            [/NotifyEvent\s*(?:\?\.)?\s*\(\s*['"`]BeforeSave['"`]/, "NotifyEvent('BeforeSave')"],
            [/NotifyEvent\s*(?:\?\.)?\s*\(\s*['"`]BeforeDelete['"`]/, "NotifyEvent('BeforeDelete')"],
            [/\.Save\s*\(\s*\)/, '.Save()'],
            [/\.Delete\s*\(\s*\)/, '.Delete()'],
            [/GetEntityObject\s*\(/, 'utilities.md.GetEntityObject(...)'],
            [/>\s*(Save|Cancel|Delete)\s*<\//i, 'a Save / Cancel / Delete button'],
        ] as const;
        const hits = offenders.filter(([re]) => re.test(code)).map(([, label]) => label);
        if (hits.length === 0) return [];
        return [{
            rule: 'form-panel-no-save', severity: 'high', line: 0, column: 0,
            message: `Form panel must not own the record lifecycle. Remove ${hits.join(', ')}. Propose field values with NotifyEvent('FieldChanged', …); the parent form's toolbar saves.`,
        }];
    }
}
```

```ts
// packages/component-engine/src/gates/FormPanelUsesHostPropsGate.ts
import { RegisterClass } from '@memberjunction/global';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { Violation } from '@memberjunction/react-linter';
import { BaseValidationGate, ValidationGateContext } from './BaseValidationGate.js';

/** The root must accept FormPanelHostProps — at least `record` and `contribution`. */
@RegisterClass(BaseValidationGate, 'form-panel-uses-host-props')
export class FormPanelUsesHostPropsGate extends BaseValidationGate {
    readonly appliesTo = ['form-panel'];
    readonly name = 'form-panel-uses-host-props';
    readonly description = 'Form panel root must destructure record and contribution from FormPanelHostProps';

    async Validate(spec: ComponentSpec, _context: ValidationGateContext): Promise<Violation[]> {
        if (typeof spec.code !== 'string' || spec.code.trim().length === 0) return [];
        const rootName = spec.name?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? '[A-Za-z_$][\\w$]*';
        const root = new RegExp(`function\\s+${rootName}\\s*\\(\\s*\\{([^}]*)\\}`).exec(spec.code);
        const params = root?.[1] ?? '';
        const hasRecord = /\brecord\b/.test(params);
        const hasContribution = /\bcontribution\b/.test(params);
        if (hasRecord && hasContribution) return [];
        return [{
            rule: 'form-panel-uses-host-props', severity: 'high', line: 0, column: 0,
            message: `Form panel root must destructure FormPanelHostProps — missing ${[!hasRecord && 'record', !hasContribution && 'contribution'].filter(Boolean).join(' and ')}. Signature: function ${spec.name}({ entityName, primaryKey, record, entityMetadata, mode, canEdit, canDelete, canCreate, contribution, related, isExpanded, layout, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }).`,
        }];
    }
}
```

```ts
// packages/component-engine/src/gates/FormPanelNoFixedHeightGate.ts
import { RegisterClass } from '@memberjunction/global';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { Violation } from '@memberjunction/react-linter';
import { BaseValidationGate, ValidationGateContext } from './BaseValidationGate.js';

/** Left-nav gives a panel the leftover column height; fixed heights fight the host layout. */
@RegisterClass(BaseValidationGate, 'form-panel-no-fixed-height')
export class FormPanelNoFixedHeightGate extends BaseValidationGate {
    readonly appliesTo = ['form-panel'];
    readonly name = 'form-panel-no-fixed-height';
    readonly description = 'Form panel must not set pixel or viewport heights on its layout';

    async Validate(spec: ComponentSpec, _context: ValidationGateContext): Promise<Violation[]> {
        if (typeof spec.code !== 'string' || spec.code.trim().length === 0) return [];
        const matches = [...spec.code.matchAll(/\b(?:min)?[hH]eight\s*:\s*['"`]?(\d+px|\d+vh)['"`]?/g)].map((m) => m[1]);
        if (matches.length === 0) return [];
        return [{
            rule: 'form-panel-no-fixed-height', severity: 'high', line: 0, column: 0,
            message: `Form panel sets fixed heights (${[...new Set(matches)].join(', ')}). Use display:block; width:100% and let the host size the section; cap inner scroll areas with maxHeight only if unavoidable.`,
        }];
    }
}
```

`FormLintParityGate.ts`: `readonly appliesTo = ['form', 'form-panel'];` and widen the description to "Form or form panel…".

`gate-runner.ts` — add beside `isFormRoleSpec`:

```ts
/** A spec is form-panel-role when its `componentRole` OR `type` is 'form-panel'. */
export function isFormPanelRoleSpec(spec: ComponentSpec): boolean {
    const type = typeof spec.type === 'string' ? spec.type.toLowerCase() : '';
    return spec.componentRole === 'form-panel' || type === 'form-panel';
}
```

`index.ts` — export the three gates and `isFormPanelRoleSpec`.

- [ ] **Step 4: Run tests and build**

Run: `cd packages/component-engine && pnpm test && pnpm run build`
Expected: PASS.

- [ ] **Step 5: Stage for review**

```bash
git add packages/component-engine/src/gates/FormPanelNoSaveGate.ts packages/component-engine/src/gates/FormPanelUsesHostPropsGate.ts packages/component-engine/src/gates/FormPanelNoFixedHeightGate.ts packages/component-engine/src/gates/FormLintParityGate.ts packages/component-engine/src/gates/gate-runner.ts packages/component-engine/src/gates/index.ts packages/component-engine/src/__tests__/form-panel-gates.test.ts
```

---

### Task C4: `[FORM CONTEXT]` intake

**Files:**
- Create: `apps/API/src/services/mentions/FormContextMarker.ts`
- Modify: `apps/API/src/services/workflow/RequestRouter.ts:116` (after the mention block)
- Test: `apps/API/test/unit/services/mentions/FormContextMarker.test.ts`

**Interfaces:**
- Consumes: `SkipAPIRequest.formContext?: SkipFormContext` (D2 — bump `@askskip/types` in `apps/API/package.json` and the four `packages/*/package.json` that pin it).
- Produces: `FormContextMarker.applyToRequest(request): boolean`, `FormContextMarker.build(ctx: SkipFormContext): string`; the last user message gains a `[FORM CONTEXT: …]` block after `[TARGET ENTITY]`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/API/test/unit/services/mentions/FormContextMarker.test.ts
import { describe, it, expect } from 'vitest';
import type { SkipAPIRequest, SkipFormContext } from '@askskip/types';
import { FormContextMarker } from '../../../../src/services/mentions/FormContextMarker.js';

const ctx: SkipFormContext = {
    Entity: 'MJ_BizApps_Common: People', Layout: 'left-nav',
    Sections: [
        { Key: 'details', Title: 'Details', Variant: 'default', Group: 'details', Hidden: false },
        { Key: 'personalIdentity', Title: 'Personal Identity', Variant: 'default', Group: 'details', Hidden: true },
    ],
    Related: [{ Entity: 'MJ_BizApps_Orders: Order Headers', JoinField: 'BillToPersonID', SectionKey: 'orders', Inclusion: 'Primary', Source: 'baked' }],
    Contributions: [{ Key: 'header', Slot: 'before-fields', Source: 'class', Title: 'Person header', Presentation: 'bare', Hidden: false, Priority: 0 }],
    SlotsPresent: ['before-fields', 'after-fields', 'after-everything'],
    ChromeRuleCount: 1,
};
const request = (content: string, formContext?: SkipFormContext): SkipAPIRequest =>
    ({ messages: [{ role: 'user', content }], entities: [], formContext } as unknown as SkipAPIRequest);

describe('FormContextMarker', () => {
    it('does nothing without formContext', () => {
        const req = request('hi');
        expect(FormContextMarker.applyToRequest(req)).toBe(false);
        expect(req.messages[0].content).toBe('hi');
    });

    it('appends a marker listing sections, related grids, contributions and slots', () => {
        const req = request('add an LTV strip', ctx);
        expect(FormContextMarker.applyToRequest(req)).toBe(true);
        const text = req.messages[0].content as string;
        expect(text.startsWith('add an LTV strip')).toBe(true);
        expect(text).toContain('[FORM CONTEXT:');
        expect(text).toContain('details (Details)');
        expect(text).toContain('personalIdentity (Personal Identity) [hidden]');
        expect(text).toContain('MJ_BizApps_Orders: Order Headers via BillToPersonID → orders [Primary, baked]');
        expect(text).toContain('header @before-fields (class, bare)');
        expect(text).toContain('Slots: before-fields, after-fields, after-everything');
    });

    it('is idempotent on resend', () => {
        const req = request('add an LTV strip', ctx);
        FormContextMarker.applyToRequest(req);
        const once = req.messages[0].content;
        expect(FormContextMarker.applyToRequest(req)).toBe(false);
        expect(req.messages[0].content).toBe(once);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/API && pnpm vitest run test/unit/services/mentions/FormContextMarker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/API/src/services/mentions/FormContextMarker.ts
import type { SkipAPIRequest, SkipFormContext, SkipMessage } from '@askskip/types';

/**
 * Renders `request.formContext` (the MJ form composition snapshot) into a compact,
 * authoritative marker on the latest user message, after `[TARGET ENTITY]`. The
 * Requirements Expert and the architect read it to choose a real slot, a real
 * `replacesSectionKey`, and a non-colliding `contributionKey`. Text, not JSON —
 * roughly half the tokens and the LLM reads it natively.
 */
export class FormContextMarker {
    static readonly MARKER_PREFIX = '[FORM CONTEXT:';

    static applyToRequest(request: SkipAPIRequest): boolean {
        const ctx = request.formContext;
        if (!ctx) return false;
        const message = this.lastUserMessage(request);
        if (!message || typeof message.content !== 'string') return false;
        if (message.content.includes(this.MARKER_PREFIX)) return false;   // resend / retry
        message.content = `${message.content}\n\n${this.build(ctx)}`;
        return true;
    }

    static build(ctx: SkipFormContext): string {
        const sections = ctx.Sections.map(s => `${s.Key} (${s.Title})${s.Hidden ? ' [hidden]' : ''}`).join('; ');
        const related = ctx.Related.map(r => `${r.Entity} via ${r.JoinField} → ${r.SectionKey} [${r.Inclusion}, ${r.Source}]`).join('; ');
        const contributions = ctx.Contributions.map(c => `${c.Key} @${c.Slot} (${c.Source}, ${c.Presentation})${c.Hidden ? ' [hidden]' : ''}`).join('; ');
        return [
            `${this.MARKER_PREFIX} The user is looking at the "${ctx.Entity}" form (${ctx.Layout} layout).`,
            `Sections: ${sections || 'none'}.`,
            `Related grids: ${related || 'none'}.`,
            `Existing contributions: ${contributions || 'none'}.`,
            `Slots: ${ctx.SlotsPresent.join(', ')}.`,
            `Rules: for a form panel, choose a slot from the list; set replacesSectionKey only to one of the section keys above; ` +
            `do not reuse an existing contribution key whose source is "class" unless the user asked to replace that piece.]`,
        ].join(' ');
    }

    private static lastUserMessage(request: SkipAPIRequest): SkipMessage | undefined {
        const messages = request.messages ?? [];
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user') return messages[i];
        }
        return undefined;
    }
}
```

`RequestRouter.Route` — after the mention block:

```ts
        // Step 0b: Render the MJ form composition snapshot (if the client sent one) so the
        // Requirements Expert can target a real slot / section key for form panels.
        if (FormContextMarker.applyToRequest(context.request)) {
            console.log(`[Router] Form context attached for ${context.request.formContext?.Entity}`);
        }
```

with `import { FormContextMarker } from '../mentions/FormContextMarker.js';`.

- [ ] **Step 4: Run tests and build**

Run: `cd apps/API && pnpm test && pnpm run build`
Expected: PASS.

- [ ] **Step 5: Stage for review**

```bash
git add apps/API/src/services/mentions/FormContextMarker.ts apps/API/src/services/workflow/RequestRouter.ts apps/API/test/unit/services/mentions/FormContextMarker.test.ts apps/API/package.json packages/*/package.json
```

---

# Phase D — Context

### Task D1: Record tab publishes the composition snapshot

**Files:**
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.ts` and `.html`
- Modify: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/record-resource.component.ts`
- Test: `packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.dom.test.ts`

**Interfaces:**
- Consumes: `MjEntityFormHostComponent.FormCreated` (existing), `BaseFormComponent.CompositionChanged` / `CompositionSnapshot` (A8/A9), `NavigationService.SetAgentContext(caller: BaseResourceComponent, context)` (existing).
- Produces: `SingleRecordComponent.compositionChanged: EventEmitter<FormCompositionSnapshot>`; `EntityRecordResource` publishes `{ Form: snapshot }` as `AdditionalContext`.

- [ ] **Step 1: Write the failing DOM test**

```ts
// packages/Angular/Explorer/explorer-core/src/lib/single-record/single-record.component.dom.test.ts
import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJFormPresenterService } from '@memberjunction/ng-base-forms';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { SingleRecordComponent } from './single-record.component';

@Component({ standalone: true, selector: 'mj-entity-form-host', template: '' })
class HostStub {
  @Input() EntityName: unknown; @Input() PrimaryKey: unknown; @Input() NewRecordValues: unknown; @Input() Provider: unknown;
  @Output() LoadComplete = new EventEmitter<void>(); @Output() LoadError = new EventEmitter<unknown>(); @Output() RecordReady = new EventEmitter<unknown>();
  @Output() Saved = new EventEmitter<unknown>(); @Output() Navigate = new EventEmitter<unknown>(); @Output() Notification = new EventEmitter<unknown>();
  @Output() Dismissed = new EventEmitter<void>(); @Output() FormCreated = new EventEmitter<unknown>();
}

describe('SingleRecordComponent (DOM) — composition snapshot', () => {
  it('re-emits the form\'s CompositionChanged as compositionChanged', () => {
    const f = renderComponentFixture(SingleRecordComponent, {
      imports: [HostStub],
      declarations: [SingleRecordComponent],
      providers: [
        { provide: NavigationService, useValue: {} }, { provide: SharedService, useValue: {} }, { provide: MJFormPresenterService, useValue: {} },
      ],
      inputs: { entityName: 'MJ: Users' },
    });
    const emitted: unknown[] = [];
    f.componentInstance.compositionChanged.subscribe((s) => emitted.push(s));
    const fakeForm = { CompositionChanged: new EventEmitter<unknown>(), CompositionSnapshot: null };
    const host = f.debugElement.children[0].componentInstance as HostStub;
    host.FormCreated.emit(fakeForm);
    const snapshot = { Entity: 'MJ: Users', Layout: 'accordion', Sections: [], Related: [], Contributions: [], SlotsPresent: [], ChromeRuleCount: 0 };
    fakeForm.CompositionChanged.emit(snapshot);
    expect(emitted).toEqual([snapshot]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm vitest run --project "explorer-core (dom)" src/lib/single-record/single-record.component.dom.test.ts` (use the package's DOM project name from its `vitest.config.ts`; if the package has no DOM preset yet, add one mirroring `base-forms/vitest.config.ts`).
Expected: FAIL — `compositionChanged` undefined.

- [ ] **Step 3: Implement**

`single-record.component.html` — add `(FormCreated)="onFormCreated($event)"` to `<mj-entity-form-host>`.

`single-record.component.ts`:

```ts
import { Subscription } from 'rxjs';
import type { BaseFormComponent, FormCompositionSnapshot } from '@memberjunction/ng-base-forms';

  /** The live form's composition (sections, related grids, contributions, slots). Re-emitted on every chrome resolve. */
  @Output() public compositionChanged: EventEmitter<FormCompositionSnapshot> = new EventEmitter<FormCompositionSnapshot>();

  private compositionSub: Subscription | null = null;

  onFormCreated(form: BaseFormComponent): void {
    this.compositionSub?.unsubscribe();
    this.compositionSub = form.CompositionChanged.subscribe((snapshot) => this.compositionChanged.emit(snapshot));
    if (form.CompositionSnapshot) this.compositionChanged.emit(form.CompositionSnapshot);
  }

  ngOnDestroy(): void {
    this.compositionSub?.unsubscribe();
  }
```

(Add `OnDestroy` to the class's implemented interfaces.)

`record-resource.component.ts` template — add `(compositionChanged)="OnCompositionChanged($event)"` to `<mj-single-record>`; class:

```ts
import type { FormCompositionSnapshot } from '@memberjunction/ng-base-forms';

    /**
     * Publish the form's composition to the agent context. The shell folds this into
     * `AppContextSnapshot.AdditionalContext`, which reaches async agents as
     * `params.data.appContext` — the Skip proxy forwards `AdditionalContext.Form`.
     */
    public OnCompositionChanged(snapshot: FormCompositionSnapshot): void {
        this.navigationService.SetAgentContext(this, { Form: snapshot });
    }
```

`navigationService` is already a protected member of `BaseResourceComponent`. Add `@memberjunction/ng-base-forms` to `explorer-core/package.json` dependencies if it is not already declared (it is a dependency today via `SingleRecordComponent` imports).

- [ ] **Step 4: Run tests and build**

Run: `cd packages/Angular/Explorer/explorer-core && pnpm test && pnpm run build`
Expected: PASS. Manual check: open a record, open the floating chat, and confirm in the agent-context inspector (or a `console.log` in `handleAgentContextUpdate`) that `AdditionalContext.Form.Entity` names the record's entity.

- [ ] **Step 5: Stage for review**

```bash
git add packages/Angular/Explorer/explorer-core/src/lib/single-record/ packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/record-resource.component.ts
```

---

### Task D2: Skip Client Open App forwards `formContext`

**Files (Skip-Client-Open-App):**
- Create: `packages/types/src/form-context-types.ts`
- Modify: `packages/types/src/api-types.ts` (`SkipAPIRequest`), `packages/types/src/index.ts`
- Modify: `packages/server/src/skip-sdk.ts` (`SkipCallOptions`, `buildSkipRequest`)
- Modify: `packages/server/src/skip-agent.ts` (`executeAgentInternal`)
- Test: `packages/server/test/unit/skip-agent.form-context.test.ts`
- Changeset: `.changeset/form-context.md` (`@askskip/types`, `@askskip/server`, `@askskip/core`: `minor`)

**Interfaces:**
- Produces: `SkipFormContext` (structural mirror of `FormCompositionSnapshot`); `SkipAPIRequest.formContext?: SkipFormContext`; `SkipCallOptions.formContext?: SkipFormContext`; exported `ExtractFormContext(data: Record<string, unknown> | undefined): SkipFormContext | null` in `skip-agent.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/server/test/unit/skip-agent.form-context.test.ts
import { describe, it, expect } from 'vitest';
import { ExtractFormContext } from '../../src/skip-agent.js';

const form = { Entity: 'MJ: Users', Layout: 'accordion', Sections: [], Related: [], Contributions: [], SlotsPresent: ['after-everything'], ChromeRuleCount: 0 };

describe('ExtractFormContext', () => {
    it('reads AdditionalContext.Form from the app context snapshot', () => {
        expect(ExtractFormContext({ appContext: { App: { Name: 'Explorer' }, AdditionalContext: { Form: form } } })).toEqual(form);
    });
    it('returns null when there is no snapshot, no AdditionalContext, or no Form', () => {
        expect(ExtractFormContext(undefined)).toBeNull();
        expect(ExtractFormContext({})).toBeNull();
        expect(ExtractFormContext({ appContext: { App: { Name: 'x' } } })).toBeNull();
        expect(ExtractFormContext({ appContext: { AdditionalContext: { Form: { Entity: 'x' } } } })).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/server && npx vitest run test/unit/skip-agent.form-context.test.ts`
Expected: FAIL — `ExtractFormContext` is not exported.

- [ ] **Step 3: Types**

```ts
// packages/types/src/form-context-types.ts
/**
 * The MJ form composition snapshot — what is on the entity form the user is looking at.
 * Structural mirror of `FormCompositionSnapshot` in @memberjunction/ng-base-forms; kept
 * independent so this package stays free of Angular dependencies. Field names must match.
 */
export type SkipFormContextSlot = 'top-area' | 'before-fields' | 'after-fields' | 'after-related' | 'after-everything';

export interface SkipFormContextSection { Key: string; Title: string; Variant: string; Group: string | null; Hidden: boolean }
export interface SkipFormContextRelated {
    Entity: string; JoinField: string; SectionKey: string;
    Inclusion: 'Primary' | 'More' | 'None' | 'Auto';
    Source: 'baked' | 'stock' | 'claimed';
}
export interface SkipFormContextContribution {
    Key: string; Slot: SkipFormContextSlot; Source: 'class' | 'metadata'; Title: string;
    Presentation: 'panel' | 'bare'; Hidden: boolean; Priority: number;
}
export interface SkipFormContext {
    Entity: string;
    Layout: 'accordion' | 'left-nav';
    Sections: SkipFormContextSection[];
    Related: SkipFormContextRelated[];
    Contributions: SkipFormContextContribution[];
    SlotsPresent: SkipFormContextSlot[];
    ChromeRuleCount: number;
}
```

`api-types.ts` — add to `SkipAPIRequest` after `databasePlatform`:

```ts
    /**
     * Optional composition of the MJ entity form the user is currently viewing (sections,
     * related grids, existing contributions, slots). Sent on every message when available.
     * Skip renders it into a [FORM CONTEXT] marker so form-panel requests target real slots
     * and section keys.
     */
    formContext?: SkipFormContext;
```

with `import type { SkipFormContext } from './form-context-types.js';` and `export * from './form-context-types.js';` in `index.ts`.

- [ ] **Step 4: SDK and agent**

`skip-sdk.ts` — `SkipCallOptions` gains `formContext?: SkipFormContext;`; in `buildSkipRequest` destructure `formContext` from `options` and set `formContext,` on the request object.

`skip-agent.ts`:

```ts
import type { SkipFormContext } from '@askskip/types';

/**
 * Pull the MJ form composition snapshot out of the agent run's app context.
 * `params.data.appContext` is the `AppContextSnapshot` the Explorer shell publishes;
 * the record tab puts its snapshot under `AdditionalContext.Form`.
 */
export function ExtractFormContext(data: Record<string, unknown> | undefined): SkipFormContext | null {
    const appContext = data?.appContext as { AdditionalContext?: Record<string, unknown> } | undefined;
    const form = appContext?.AdditionalContext?.Form as Partial<SkipFormContext> | undefined;
    if (!form || typeof form.Entity !== 'string' || !Array.isArray(form.Sections) || !Array.isArray(form.Contributions)) return null;
    return form as SkipFormContext;
}
```

and in `executeAgentInternal`, when building `skipOptions`:

```ts
            formContext: ExtractFormContext(params.data) ?? undefined,
```

- [ ] **Step 5: Run tests, build, publish**

```bash
npm run build && cd packages/server && npx vitest run
```

Expected: PASS. Add the changeset (`npm run change` → `minor` for all three packages). Publish (or `yalc publish` from `packages/types` and `yalc add @askskip/types` in Skip-Brain) so C4 compiles.

- [ ] **Step 6: Stage for review**

```bash
git add packages/types/src/form-context-types.ts packages/types/src/api-types.ts packages/types/src/index.ts packages/server/src/skip-sdk.ts packages/server/src/skip-agent.ts packages/server/test/unit/skip-agent.form-context.test.ts .changeset/form-context.md
```

---

### Task D3: `Get Form Composition For Entity` (server-side fallback)

**Files (MJ):**
- Create: `packages/Actions/CoreActions/src/custom/interactive-forms/get-form-composition-for-entity.action.ts`
- Modify: `packages/Actions/CoreActions/src/custom/interactive-forms/index.ts`
- Modify: `metadata/actions/.form-contributions-actions.json` (append the fifth action)
- Test: `packages/Actions/CoreActions/src/__tests__/get-form-composition-for-entity.action.test.ts`

**Interfaces:**
- Consumes: `ReadRelationshipInclusion` (`@memberjunction/core`), `MJ: Form Chrome Rules`, `MJ: Entity Form Contributions`.
- Produces: `Get Form Composition For Entity` (`__GetFormCompositionForEntity`): input `EntityName`; output `Result` = `SkipFormContext`-shaped JSON with `Sections` **derived from CodeGen rules** (field `Category` / `GeneratedFormSectionType`), `Related` from `DisplayInForm` relationships with L1 inclusion, `Contributions` from Active metadata rows (compiled panels are browser-only and are declared absent in a `Note` field), `SlotsPresent` = all five, `ChromeRuleCount`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/Actions/CoreActions/src/__tests__/get-form-composition-for-entity.action.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const entity = {
    ID: 'ENT-PEOPLE', Name: 'MJ_BizApps_Common: People',
    Fields: [
        { Name: 'ID', Category: null, GeneratedFormSectionType: 'Details', IsVirtual: false },
        { Name: 'FirstName', Category: 'Personal Identity', GeneratedFormSectionType: 'Category', IsVirtual: false },
        { Name: 'Notes', Category: null, GeneratedFormSectionType: 'Details', IsVirtual: false },
        { Name: '__mj_CreatedAt', Category: null, GeneratedFormSectionType: 'Details', IsVirtual: false },
    ],
    RelatedEntities: [
        { RelatedEntity: 'MJ_BizApps_Orders: Order Headers', RelatedEntityID: 'ENT-ORD', RelatedEntityJoinField: 'BillToPersonID', DisplayInForm: true, Sequence: 1, Configuration: JSON.stringify({ UI: { inclusion: 'Primary' } }) },
        { RelatedEntity: 'MJ_BizApps_Tasks: Task Comments', RelatedEntityID: 'ENT-TC', RelatedEntityJoinField: 'PersonID', DisplayInForm: true, Sequence: 2, Configuration: null },
        { RelatedEntity: 'Hidden', RelatedEntityID: 'ENT-H', RelatedEntityJoinField: 'X', DisplayInForm: false, Sequence: 3, Configuration: null },
    ],
    ChildEntities: [],
    ConfigurationObject: { UI: { Form: { Layout: 'left-nav' } } },
};
const provider = { EntityByName: (n: string) => (n === entity.Name ? entity : undefined) };
const runViewResults: Record<string, unknown[]> = {
    'MJ: Form Chrome Rules': [{ ID: 'r1' }],
    'MJ: Entity Form Contributions': [{ ID: 'c1', ContributionKey: 'skip:ltv', Slot: 'before-fields', Title: 'LTV', Presentation: 'bare', Priority: 0, Inclusion: null }],
};
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return {
        ...actual,
        Metadata: { Provider: provider },
        LogError: vi.fn(),
        RunView: { FromMetadataProvider: () => ({ RunView: async (p: { EntityName: string }) => ({ Success: true, Results: runViewResults[p.EntityName] ?? [] }) }) },
    };
});
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));

import { GetFormCompositionForEntityAction } from '../custom/interactive-forms/get-form-composition-for-entity.action';

async function run(): Promise<ActionResultSimple> {
    const params = { Params: [{ Name: 'EntityName', Value: entity.Name, Type: 'Input' }], ContextUser: { ID: 'U1', UserRoles: [] }, Provider: provider } as unknown as RunActionParams;
    return (new GetFormCompositionForEntityAction() as unknown as { InternalRunAction(p: RunActionParams): Promise<ActionResultSimple> }).InternalRunAction(params);
}

describe('GetFormCompositionForEntityAction', () => {
    it('derives sections from field categories, related grids with L1 inclusion, and metadata contributions', async () => {
        const result = await run();
        expect(result.Success).toBe(true);
        const payload = JSON.parse(result.Message ?? '{}');
        expect(payload.Entity).toBe(entity.Name);
        expect(payload.Layout).toBe('left-nav');
        expect(payload.Sections.map((s: { Key: string }) => s.Key)).toEqual(['details', 'personalIdentity', 'systemMetadata']);
        expect(payload.Related).toEqual([
            { Entity: 'MJ_BizApps_Orders: Order Headers', JoinField: 'BillToPersonID', SectionKey: 'mJBizAppsOrdersOrderHeaders', Inclusion: 'Primary', Source: 'baked' },
            { Entity: 'MJ_BizApps_Tasks: Task Comments', JoinField: 'PersonID', SectionKey: 'mJBizAppsTasksTaskComments', Inclusion: 'Auto', Source: 'baked' },
        ]);
        expect(payload.Contributions).toEqual([{ Key: 'skip:ltv', Slot: 'before-fields', Source: 'metadata', Title: 'LTV', Presentation: 'bare', Hidden: false, Priority: 0 }]);
        expect(payload.ChromeRuleCount).toBe(1);
        expect(payload.Note).toMatch(/compiled/i);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/Actions/CoreActions && pnpm vitest run src/__tests__/get-form-composition-for-entity.action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// packages/Actions/CoreActions/src/custom/interactive-forms/get-form-composition-for-entity.action.ts
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, LogError, RunView, ReadRelationshipInclusion, type EntityInfo, type EntityRelationshipInfo } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { addOutput, failure, getStringParam } from "./_shared";

/** Byte-compatible with CodeGenLib `angular-codegen.ts` camelCase and ng-base-forms FormSectionCamelCase. Do not "improve". */
function sectionCamelCase(str: string): string {
    const sanitized = str.replace(/[^a-zA-Z0-9\s]/g, ' ');
    let result = sanitized.replace(/\s(.)/g, (_m, c: string) => c.toUpperCase()).replace(/\s/g, '').replace(/^(.)/, (_m, c: string) => c.toLowerCase());
    if (/^\d/.test(result)) result = '_' + result;
    return result.length === 0 ? 'section' : result;
}

function stripBrackets(join: string | null | undefined): string {
    return (join ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * Server-side fallback for agents that have no browser snapshot. Reproduces the
 * metadata-derivable part of the form composition: field sections by CodeGen rule,
 * DisplayInForm related grids with L1 inclusion, active metadata contributions, and
 * the L3 rule count. Compiled BaseFormPanel registrations live only in the browser
 * and are NOT included — the `Note` says so. Prefer the client snapshot when present.
 */
@RegisterClass(BaseAction, "__GetFormCompositionForEntity")
export class GetFormCompositionForEntityAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityName = getStringParam(params, "EntityName");
            if (!entityName) return failure("MISSING_PARAMETER", "Parameter 'EntityName' is required.");
            const provider = params.Provider ?? Metadata.Provider;
            if (!provider) return failure("NO_PROVIDER", "No metadata provider available.");
            const user = params.ContextUser;
            if (!user) return failure("NO_USER", "Action requires a ContextUser.");
            const entity = provider.EntityByName(entityName);
            if (!entity) return failure("ENTITY_NOT_FOUND", `Entity '${entityName}' is not registered.`);

            const rv = RunView.FromMetadataProvider(provider);
            const roleIDs = ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? []).map(r => r.RoleID).filter((x): x is string => !!x);
            const roleClause = roleIDs.length > 0 ? `(Scope='Role' AND RoleID IN (${roleIDs.map(id => `'${id}'`).join(',')}))` : `(1=0)`;

            const [rules, rows] = await Promise.all([
                rv.RunView<{ ID: string }>({ EntityName: "MJ: Form Chrome Rules", ExtraFilter: `EntityID='${entity.ID}'`, Fields: ['ID'], ResultType: 'simple' }, user),
                rv.RunView<{ ID: string; ContributionKey: string | null; Slot: string; Title: string | null; Name?: string; Presentation: string; Priority: number; Inclusion: string | null }>({
                    EntityName: "MJ: Entity Form Contributions",
                    ExtraFilter: `EntityID='${entity.ID}' AND Status='Active' AND ((Scope='User' AND UserID='${user.ID}') OR ${roleClause} OR Scope='Global')`,
                    Fields: ['ID', 'ContributionKey', 'Slot', 'Title', 'Name', 'Presentation', 'Priority', 'Inclusion'], ResultType: 'simple',
                }, user),
            ]);

            const payload = {
                Entity: entity.Name,
                Layout: entity.ConfigurationObject?.UI?.Form?.Layout === 'left-nav' ? 'left-nav' : 'accordion',
                Sections: this.deriveSections(entity),
                Related: this.deriveRelated(entity),
                Contributions: (rows.Results ?? []).map(r => ({
                    Key: r.ContributionKey ?? `contribution:${r.ID}`, Slot: r.Slot, Source: 'metadata', Title: r.Title ?? r.Name ?? r.ID,
                    Presentation: r.Presentation, Hidden: r.Inclusion === 'None', Priority: r.Priority ?? 0,
                })),
                SlotsPresent: ['top-area', 'before-fields', 'after-fields', 'after-related', 'after-everything'],
                ChromeRuleCount: (rules.Results ?? []).length,
                Note: 'Derived from metadata on the server. Compiled BaseFormPanel contributions exist only in the browser and are not listed; the client snapshot (AppContext.AdditionalContext.Form) is authoritative when present.',
            };
            addOutput(params, "Result", payload);
            return { Success: true, ResultCode: "SUCCESS", Message: JSON.stringify(payload) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`GetFormCompositionForEntityAction: ${message}`);
            return failure("UNEXPECTED_ERROR", message);
        }
    }

    /** CodeGen rule: 'Category' fields group by Category; everything else is Details; audit/PK fields are System Metadata (always last). */
    private deriveSections(entity: EntityInfo): Array<{ Key: string; Title: string; Variant: string; Group: null; Hidden: false }> {
        const titles: string[] = [];
        let hasDetails = false;
        for (const f of entity.Fields) {
            if (f.Name.startsWith('__mj_') || f.Name === 'ID') continue;
            const category = (f as { Category?: string | null }).Category?.trim();
            const type = (f as { GeneratedFormSectionType?: string | null }).GeneratedFormSectionType;
            if (type === 'Category' && category) { if (!titles.includes(category)) titles.push(category); }
            else hasDetails = true;
        }
        const ordered = [...(hasDetails ? ['Details'] : []), ...titles.filter(t => t !== 'Details'), 'System Metadata'];
        return ordered.map(title => ({ Key: sectionCamelCase(title), Title: title, Variant: 'default', Group: null, Hidden: false }));
    }

    private deriveRelated(entity: EntityInfo): Array<{ Entity: string; JoinField: string; SectionKey: string; Inclusion: string; Source: 'baked' }> {
        const isaChildren = (entity.ChildEntities ?? []).map(c => c.ID);
        const visible = entity.RelatedEntities
            .filter(r => r.DisplayInForm && !isaChildren.some(id => UUIDsEqual(id, r.RelatedEntityID)))
            .sort((a, b) => (a.Sequence ?? 999999) - (b.Sequence ?? 999999) || a.RelatedEntity.localeCompare(b.RelatedEntity));
        return visible.map(r => ({
            Entity: r.RelatedEntity,
            JoinField: stripBrackets(r.RelatedEntityJoinField),
            SectionKey: this.relatedSectionKey(r, visible),
            Inclusion: ReadRelationshipInclusion((r as { Configuration?: string | null }).Configuration ?? null) ?? 'Auto',
            Source: 'baked',
        }));
    }

    private relatedSectionKey(rel: EntityRelationshipInfo, peers: readonly EntityRelationshipInfo[]): string {
        const sameEntity = peers.filter(p => UUIDsEqual(p.RelatedEntityID, rel.RelatedEntityID));
        return sameEntity.length > 1
            ? sectionCamelCase(`${rel.RelatedEntity} ${stripBrackets(rel.RelatedEntityJoinField)}`)
            : sectionCamelCase(rel.RelatedEntity);
    }
}

export function LoadGetFormCompositionForEntityAction(): void {
    if (false as boolean) { const _: unknown = GetFormCompositionForEntityAction; }
}
```

Export from `index.ts`. Append to `.form-contributions-actions.json`:

```json
  {
    "fields": {
      "Name": "Get Form Composition For Entity",
      "Description": "Read-only server-side fallback for agents with no browser snapshot. Returns the metadata-derivable composition of an entity's form: field sections by CodeGen rule, DisplayInForm related grids with L1 inclusion, Active metadata contributions, and the L3 rule count. Compiled BaseFormPanel contributions are browser-only and are NOT included; prefer the client snapshot (AppContext.AdditionalContext.Form) when present.",
      "DriverClass": "__GetFormCompositionForEntity",
      "Type": "Custom",
      "Status": "Active",
      "IconClass": "fa-solid fa-table-cells-large",
      "CategoryID": "@lookup:MJ: Action Categories.Name=Utilities"
    },
    "relatedEntities": {
      "MJ: Action Params": [
        { "fields": { "ActionID": "@parent:ID", "Name": "EntityName", "Type": "Input", "ValueType": "Scalar", "IsArray": false, "Description": "Parent form entity.", "IsRequired": true }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "Name": "Result", "Type": "Output", "ValueType": "Other", "IsArray": false, "Description": "{ Entity, Layout, Sections[], Related[], Contributions[], SlotsPresent[], ChromeRuleCount, Note } — the SkipFormContext shape.", "IsRequired": false }, "primaryKey": { "ID": "<uuidgen>" } }
      ],
      "MJ: Action Result Codes": [
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "SUCCESS", "Description": "Composition returned." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "MISSING_PARAMETER", "Description": "EntityName missing." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "ENTITY_NOT_FOUND", "Description": "EntityName is not registered." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_PROVIDER", "Description": "No metadata provider configured." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "NO_USER", "Description": "No ContextUser." }, "primaryKey": { "ID": "<uuidgen>" } },
        { "fields": { "ActionID": "@parent:ID", "ResultCode": "UNEXPECTED_ERROR", "Description": "Unhandled exception." }, "primaryKey": { "ID": "<uuidgen>" } }
      ]
    },
    "primaryKey": { "ID": "<uuidgen>" }
  }
```

Confirm `ReadRelationshipInclusion` is exported from `@memberjunction/core` (`packages/MJCore/src/generic/entityConfiguration.ts:188`); if the index does not re-export it, add the export there.

- [ ] **Step 4: Run tests, push metadata, build**

```bash
cd packages/Actions/CoreActions && pnpm test && pnpm run build
cd ../../.. && pnpm mj sync push --dir=metadata --include=actions
```

Expected: PASS; five `MJ: Actions` rows exist.

- [ ] **Step 5: Stage for review**

```bash
git add packages/Actions/CoreActions/src/custom/interactive-forms/get-form-composition-for-entity.action.ts packages/Actions/CoreActions/src/custom/interactive-forms/index.ts packages/Actions/CoreActions/src/__tests__/get-form-composition-for-entity.action.test.ts metadata/actions/.form-contributions-actions.json
```

---

# Phase E — Parity (separate plan)

Form Builder `Intent.Kind: 'form' | 'form-panel'`, a Form Studio contributions list under each entity's overrides, and a Component Studio "New form panel" scaffold are parity work that depends on Phase B and touches `packages/AI/FormBuilder`, `packages/Angular/Explorer/dashboards/src/FormBuilder`, and `ComponentStudio`. They get their own plan after B ships; nothing in A–D depends on them.

---

# Task F: Documentation and changeset (MJ)

**Files:**
- Modify: `guides/FORMS_ARCHITECTURE_GUIDE.md` (after Scenario H in §7c)
- Modify: `packages/Angular/Generic/base-forms/PANELS.md` (after "Form contributions")
- Modify: `packages/Angular/CLAUDE.md` (Pattern 1 paragraph, line ~609)
- Create: `.changeset/skip-form-contributions.md`

- [ ] **Step 1: Forms guide — add a scenario block after Scenario H**

```markdown
#### Scenario I — A contribution that is a database row (Skip, or an OpenApp with no Angular)

A contribution does not have to be compiled. A `MJ: Entity Form Contributions` row points a
parent entity at a `MJ: Components` row (`Type='Widget'`, spec `componentRole: 'form-panel'`)
and carries the same registration bag as `@RegisterClassEx` — `Slot`, `SortKey`,
`ContributionKey`, `RelatedEntityID` + `RelatedJoinField`, `ReplacesSectionKey`, `Inclusion`,
`ChromeGroup` — plus `Presentation` (`panel` | `bare`), `Title`, `Icon`, `Configuration`, and
User / Role / Global scope with `Active` / `Pending` / `Inactive` status.

`CollectFormContributionRegistrations(entity, provider)` merges these rows (from
`InteractiveFormsEngine`) with the ClassFactory registrations. The composer, slot hosts, and
chrome layers see one list. `<mj-form-panel-slot>` mounts a row through
`InteractiveFormPanelComponent`, which renders the React component with `FormPanelHostProps`
inside a collapsible panel (or bare, for heroes), forwards `RowCountChanged` to the rail badge,
applies `FieldChanged` to the parent record, and surfaces `Validate` through
`BaseFormPanel.validate()`.

**Precedence.** Rows and compiled registrations collapse on `contributionKey`. Highest
`Priority` wins; **on a tie the compiled registration wins**. The "Add to my form" apply flow
sets `Priority = incumbent + 1` only after the user confirms replacing an installed piece.

**Authoring.** Skip returns a `componentRole: 'form-panel'` spec with a `formContribution`
block; the artifact viewer's **Add to my form** runs `Create` / `Modify Form Contribution` and
`Activate Form Contribution Version`. OpenApps without Angular ship rows under
`metadata/entity-form-contributions/`. L3 `MJ: Form Chrome Rules` can still suppress any of
them by `ContributionKey`.

**Context.** The container publishes a `FormCompositionSnapshot` (sections, related grids with
inclusion, contributions, slots) after every chrome resolve. The record tab forwards it to the
agent context as `AdditionalContext.Form`; the Skip proxy sends it as `formContext`, and Skip
renders it as a `[FORM CONTEXT]` marker so a panel targets a real slot and section key.
```

Also update the "Decision guide" table with a row: `Add a piece to a form from an agent or without Angular | MJ: Entity Form Contributions row + form-panel component — §7c Scenario I`.

- [ ] **Step 2: PANELS.md — add a section after "Form contributions"**

```markdown
## Metadata contributions (React form panels)

`BaseFormPanel` is the compiled path. The same slots also accept **rows**: `MJ: Entity Form
Contributions` → a `Type='Widget'` Component whose spec declares `componentRole: 'form-panel'`.
The generic host `InteractiveFormPanelComponent` mounts them; you never write Angular for one.

| Row column | Same as registration metadata |
|---|---|
| `Slot`, `SortKey`, `ContributionKey`, `RelatedEntityID` + `RelatedJoinField`, `ReplacesSectionKey`, `Inclusion`, `ChromeGroup` | `slot`, `sortKey`, `contributionKey`, `relatedEntity` + `relatedJoinField`, `replacesSectionKey`, `inclusion`, `chromeGroup` |
| `Presentation` (`panel` / `bare`) | `presentation` (new; `bare` = hero, never a rail item) |
| `Title`, `Icon`, `Configuration` | Section header, icon, and `contribution.configuration` passed to the component |
| `Scope` / `UserID` / `RoleID`, `Priority`, `Status` | Who sees it, last-wins rank, `Active` / `Pending` / `Inactive` |

**Ties go to compiled registrations.** A row replaces a `BaseFormPanel` with the same key only
with strictly higher `Priority`.

**Contract for the React side:** `FormPanelHostProps` from
`@memberjunction/interactive-component-types/forms` — the whole-form props plus
`contribution`, `related` (prebuilt `viewParams` + `newRecordValues` for grid claims),
`isExpanded`, `layout`. Events `RowCountChanged`, `FieldChanged`, `ValidationChanged`; methods
`OnRecordRefreshed`, `SetEditMode`, `Validate`. A panel never saves.

**Authoring paths:** Skip / Form Builder agent → `Create Form Contribution` action; OpenApp →
`metadata/entity-form-contributions/*.json` via `mj sync push`. Design and plan:
[`plans/skip-form-contributions/`](../../../../plans/skip-form-contributions/design.md).
```

- [ ] **Step 3: Angular/CLAUDE.md — extend Pattern 1**

Append to the Pattern 1 paragraph: "A contribution can also be a **row** — `MJ: Entity Form Contributions` pointing at a `componentRole: 'form-panel'` React component — mounted by `InteractiveFormPanelComponent` through the same slots and chrome. Compiled registrations win priority ties. See [PANELS.md → Metadata contributions](Generic/base-forms/PANELS.md#metadata-contributions-react-form-panels)."

- [ ] **Step 4: Changeset**

```markdown
---
"@memberjunction/interactive-component-types": minor
"@memberjunction/core-entities": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-explorer-core": minor
---

Form contributions from metadata: `MJ: Entity Form Contributions` rows render `componentRole: 'form-panel'` React components as peers of compiled `BaseFormPanel`s (same slots, composer, and chrome). Adds the `form-panel` contract, the `Create/Modify/Activate Form Contribution` and `Get Form Contributions/Composition For Entity` actions, "Add to my form" in the artifact viewer, and a form composition snapshot published to agent context. Migration: `EntityFormContribution` table; metadata: five actions and the `entity-form-contributions` sync directory.
```

Use the exact package names from each `package.json` (`grep '"name"' packages/Actions/CoreActions/package.json` etc.). Run `npm run check:changeset` and `npm run check:claude-md`.

- [ ] **Step 5: Stage for review**

```bash
git add guides/FORMS_ARCHITECTURE_GUIDE.md packages/Angular/Generic/base-forms/PANELS.md packages/Angular/CLAUDE.md .changeset/skip-form-contributions.md
```

---

## Self-review

**Spec coverage** (design.md → tasks): §5 data model → A2; §5.2 component type → A2/A3/B1; §6 runtime rows → A3 (engine), A5 (collector), A7 (slot host), A6 (panel host), A9 (container), A8 (form), A10 (interactive slots); §7 contract → A1; §8 rules 1–2 → A3/A4, rule 3 → A9, rule 4 → B4 (apply-time) + A9 (render-time diagnostic) + C1 (prompt); §9.1 → C1–C4; §9.2 actions → B1–B3 + D3, artifact viewer → B4, `mj sync` → A2, parity → Phase E (deferred by design); §10 snapshot → A9, publication → D1, transport → D2, intake → C4, fallback → D3; §11 scenarios exercised by A9/B4 tests; §14 folded cleanups → A4 (strict matching), A5 (memo), A8 (validate), A9 (`bare` replaces `'header'`), A10 (slots). Form Studio "not found" badge (decision 4) is UI in the Form Builder dashboard and belongs to Phase E; the console diagnostic in A9 is the shipped half.

**Placeholder scan:** the only intentional fill-ins are `<uuidgen>` in metadata JSON (must be generated at execution time per `metadata/CLAUDE.md`) and `V<ts>` in the migration filename (must be `date +"%Y%m%d%H%M"` at execution time).

**Type consistency:** `FormContributionRegistration` fields `Source`, `ComponentID`, `Configuration`, `Title`, `Icon`, `Presentation`, `RowID`, `Registration` are introduced in A4/A5 and read in A6, A7, A9, B4. `FormCompositionContribution.Priority` is introduced in A9 and read in B4 and mirrored in D2 (`SkipFormContextContribution.Priority`). `BaseFormComponent.ChromeLayout`, `RegisterFormPanel`, `UnregisterFormPanel`, `CompositionSnapshot`, `CompositionChanged` are introduced in A8 and read in A6, A7, A9, D1. `FormPanelHostProps` field names match between A1 and the prompt include in C1.
