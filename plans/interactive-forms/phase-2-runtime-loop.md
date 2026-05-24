# Interactive Forms — Runtime Loop Phase

Supplementary plan to [plan.md](plan.md). Captures the next-cut work: closing the runtime loop so AI-authored forms can be created, refined, previewed, applied, versioned, and reverted entirely from inside the product. **This is a single phase. Every sub-task below must ship for the work to be considered done.**

## TL;DR

`EntityFormOverride` already correctly points at a specific `Component` row, and `Component` already supports versioning (new row per version sharing `Name`, incrementing `VersionSequence`). The substrate is right. What this phase fixes:

1. **The action layer doesn't use the versioning model.** Today every "create or modify" inserts a brand-new `v1.0.0` Component with no link to its predecessor. We replace the single action with a small, versioning-aware family: Create / Modify / Revert / Get-Active / Get-Default-Scaffold.
2. **The agent has no scaffold to start from.** The Form Builder agent writes JSX from scratch every time, leading to inconsistent quality vs. the CodeGen Angular default. We expose a `Get Default Form Scaffold For Entity` action that synthesizes CodeGen-equivalent JSX from existing metadata. Agent's job becomes "modify a known-good baseline," not "build from zero."
3. **The cockpit (Form Builder dashboard) and the chat overlay aren't wired together as a loop.** The pieces exist (chat overlay, `ActiveForm` context, artifact rendering, fixture FormHostProps). They need to be connected so dashboard → chat → preview → apply works as one motion.
4. **Form artifacts in regular chat don't render usefully.** Skip will soon emit form-role interactive components in normal conversations. The artifact viewer must detect `componentRole === 'form'`, load a real record from the declared entity (Top 1 by default, with a search/picker for swapping), and render the form against it. This phase ships the smart viewer **and** an end-to-end test path through it.
5. **Users can't switch between available form variants.** When an entity has multiple resolvable overrides (e.g. a User-scope custom + a Role-scope variant + the Global default), today only the highest-priority wins. We add a variant switcher on the form toolbar so users can pick.

## What "done" looks like

You are sitting in Form Builder. You pick the `MJ: Applications` entity. The cockpit opens with the CodeGen-equivalent JSX already scaffolded, a live preview rendering against a real top-1 record, and the version rail on the left showing `1.0.0 — Active`. You click **Refine with AI**, the chat overlay opens with the form context pre-seated. You type "add a chart of the most-viewed applications below the description and split system fields into a separate tab." The Form Builder agent responds with a refined ComponentSpec rendered as an artifact card in the conversation — the preview inside the card is bound to a real `MJ: Applications` record with a record-picker to swap. You click **Apply to my form**. The version rail now shows `1.0.0 — Active` and `1.1.0 — Pending`. You preview `1.1.0`, click **Activate** — `1.1.0` becomes Active, `1.0.0` is preserved as history (one-click revert).

Separately, in a regular Skip conversation: Skip emits an interactive component artifact whose spec declares `componentRole: 'form'` against an entity. The artifact card auto-loads a real record from that entity and renders the form correctly against it, with a search box to pick a different record. The "Apply to my form" affordance is present and behaves identically to the cockpit flow.

That whole loop ships together. Half of it isn't useful.

## Non-goals (still)

- Replacing CodeGen Angular forms. They remain the default fallback for any entity without an active override.
- Replacing `@RegisterClass` custom Angular forms.
- A rich component library expansion (`<RelatedRecordsList>`, `<MetricCard>`, charts, etc.) — that's the next phase. This phase teaches Skip & the Form Builder agent how to emit valid form-role components; what they have available *inside* those components is constrained to whatever the harness already exposes.
- Dashboards / non-form interactive components.
- Per-application scope. Still User > Role > Global.

## Architecture changes (small)

### Versioning lifecycle

Today the action hardcodes `Version="1.0.0"`, `VersionSequence=1` for every insert. The new behavior:

| Trigger | Existing Component status | New behavior |
|---|---|---|
| Agent: "create a form for X" (no override yet) | n/a | Insert `Component` v1.0.0 + Override (Status=Active per security clamp) |
| Agent: "modify my form" | Current Component is **Active** | Insert a new `Component` row with same `Name`, `Version` bumped to next semver minor (`1.0.0` → `1.1.0`), `VersionSequence + 1`. Override.ComponentID **stays pointing at the Active row**. Mark the new Component row Status='Pending'. Add a new Override row pointing at it with `Status='Pending'`. **User must explicitly Activate.** Two overrides coexist briefly: one Active, one Pending. |
| Agent: "modify my form" | Current Component is **Pending** | Modify the **same row in place** — overwrite `Specification`, bump `__mj_UpdatedAt`. No new Component, no new Override. Avoids "100 untouched draft versions" during back-and-forth iteration. |
| User clicks **Activate** on a Pending Override | n/a | Flip Pending Override to Active, flip prior Active Override to Inactive. Both Component rows persist forever as version history. |
| User clicks **Revert to v1.0.0** | n/a | Pure Override update: re-point the Active Override's `ComponentID` at the older Component row, flip the current Active to Inactive. Component rows never deleted. |

### Multi-variant resolution + switcher

`FormResolverService.lookupActiveOverride()` keeps its current "highest priority wins" semantics by default, but is extended to also return **the full list** of overrides applicable to the current user. The list goes into a new "Available Form Variants" picker on the form's toolbar (rendered by `<mj-record-form-container>` when more than one variant exists for the entity).

User selection of a non-default variant is **session-local** (sticky in localStorage keyed by entity name). A user-preference write to make a non-default variant the persistent default for that user creates a small `EntityFormVariantPreference` row — but that's optional and gated behind explicit user action; the default behavior is just session memory.

> Decision needed in mockups: do we materialize "user's variant choice" as a database row (`UserPreference`-style) or keep it purely localStorage? See mockup 08 for options.

### Artifact viewer smarts

`component-artifact-viewer.component.ts` (or its rendering plugin) gains a form-role branch:

```
when ComponentSpec.componentRole === 'form':
    entity = spec.entityName ?? spec.dataRequirements?.primaryEntity
    if entity is resolvable:
        topRecord = await RunView({EntityName: entity, MaxRows: 1, ResultType: 'entity_object'})
        if found: bind real record as FormHostProps.record
        else: fall back to buildFixtureFormHostProps(entity)
    else:
        warn + fall back to fixture mode
    render <mj-react-component> with FormHostProps
    expose record-picker chip (search box → re-binds to chosen record)
    expose "Apply to my form" affordance (calls Create-or-Modify Interactive Form action)
```

This is the same code path whether the artifact came from Form Builder agent, Sage, or Skip. **It's a single integration point that all form-role components flow through.**

## Sub-tasks — all must ship

### Migration & metadata

1. **`Notes` column on `EntityFormOverride`** — folded into the original [V202605221100__v5.37.x__Interactive_Forms.sql](../../migrations/v5/V202605221100__v5.37.x__Interactive_Forms.sql) (combined ahead of LTS baseline collapse). Optional human commentary. Validator audited against the CHECK constraint; matches exactly, no patch needed.
2. **Run codegen** so `EntityFormOverrideEntity` exposes a typed `Notes` property.

### Agent actions (Server, `@memberjunction/core-actions`)

3. **`Get Default Form Scaffold For Entity`** — new action. Reads the same metadata CodeGen reads (`EntityField` Category/Sequence/GeneratedFormSectionType/value lists, FK relationships, `RelatedEntities[].DisplayInForm`, `EntitySetting.FieldCategoryInfo` for icons) and returns a working ComponentSpec whose JSX mirrors the Angular default layout. Pure metadata read; no LLM. Deterministic.
4. **`Get Active Form For Entity`** — new action. Returns the currently-resolved Override + Component spec for the (entity, user) pair, plus a list of all applicable variants. Lets the agent reason about whether to Create or Modify.
5. **Refactor `Create Interactive Form`** — splits into:
    - `Create Interactive Form` — only for net-new (no existing Active override for this entity+user). Inserts Component v1.0.0 + Active Override. Security clamp preserved (User scope only from agent invocation).
    - `Modify Interactive Form` — input: target `OverrideID` + new `ComponentSpec`. Branch on the current Component's `Status`: Active → insert v(N+1) + new Pending Override (don't touch the live one); Pending → overwrite the Pending row in place.
    - `Activate Interactive Form Version` — flips a Pending Override to Active and the prior Active to Inactive. Atomic. Callable from the cockpit and from "Apply to my form" on artifacts.
    - `Revert Interactive Form` — input: Active OverrideID + target VersionSequence. Pure Override re-point.

### Agent prompt update (`metadata/prompts/templates/sage/form-builder.template.md`)

6. **Rewrite the agent prompt** to use the new toolbox. New workflow:
    - Always call `Get Active Form For Entity` first.
    - If no active override → call `Get Default Form Scaffold For Entity` → modify the scaffold per user requirements → `Create Interactive Form`.
    - If active override exists → read its spec → modify per requirements → `Modify Interactive Form` (action handles Active-vs-Pending semantics internally).
    - Critical invariant retained: never touch `BaseEntity` / `Metadata` / `RunView` for the record being edited from within the form's React code (delegates through wrapper events).
7. **Confirm Sage prompt routes form-shaped requests to Form Builder agent when `ActiveForm` context is present** in `AppContext`. One-line addition to Sage's delegation rules.

### Resolver (Angular, `@memberjunction/ng-base-forms`)

8. **Extend `FormResolverService`** to return both the resolved override and the full applicable-variants list. Existing callers keep working (they ignore the new list).
9. **Honor session-local variant selection** — if user has chosen a non-default variant for this entity (read from localStorage), resolver returns that variant instead of highest-priority default.

### Form artifact viewer — make the interactive-component type viewer form-aware

The existing chat-artifact rendering infrastructure already handles interactive components correctly — we don't need a new artifact card chrome, "Apply" button styling, etc. **We are only making the interactive-component type viewer form-aware**: when the spec being rendered declares `componentRole === 'form'`, the viewer's behavior changes; everything else (artifact card, header, actions area, chat embedding) is unchanged.

10. **Add a form-role branch inside the interactive-component artifact viewer plugin** ([component-artifact-viewer.component.ts](../../packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts) or its renderer):
    - Detect `spec.componentRole === 'form'`.
    - Resolve the declared entity name (`spec.entityName` / `spec.dataRequirements?.primaryEntity`).
    - Load Top-1 record via `RunView({ EntityName, MaxRows: 1, ResultType: 'entity_object' })`.
    - Build `FormHostProps` from that record and mount the React component with them.
    - If no entity declared or RunView empty → fall back to `buildFixtureFormHostProps()`, render with a small "Mock data" indicator.
    - Provide a record-picker affordance (search box on the artifact's existing toolbar) so the user can swap records.
11. **Promote `buildFixtureFormHostProps()`** (currently in Component Studio services) to a shared package so both Component Studio preview and the artifact viewer consume it.
12. **"Apply to my form" wiring** — extend the existing artifact actions area to include an Apply action when `componentRole === 'form'`. Action emits an event consumed by either (a) Form Builder dashboard if the chat is launched from there (applies to the active form context), or (b) a confirmation dialog showing entity + scope + version → calls Create or Modify Interactive Form. **No new artifact card chrome** — uses the existing actions slot.

### Cockpit reshape (Angular, `dashboards/src/FormBuilder/`)

13. **Replace the resource component's center-pane canvas-first layout** with a **4-pane cockpit** (locked in from mockup 01 review):
    - **Left: version rail** — lists all Component versions for the active form, with Status badges. **Collapsible** (collapse button in pane header; collapsed state renders a narrow strip with the version count badge that re-expands on click). Persistence: collapsed/expanded state saved per-user in localStorage.
    - **Center-left: Monaco code editor** — JSX, with intellisense over FormHostProps and registered components.
    - **Center-right: live preview** against the active record (with record picker).
    - **Right: embedded chat with Form Builder agent** — always visible by default as part of the cockpit UX (not an overlay). **Collapsible** to a narrow strip (button avatar) that re-expands on click. Same persistence pattern as the version rail.
    - The existing drag-drop canvas becomes a "Layout" tab inside the code editor pane, available but not default.
    - **No floating overlay variant** for the cockpit chat — the in-cockpit chat is part of the layout. (The app-root chat overlay still exists for non-Form-Builder contexts.)
14. **Version rail interactions** — click version → preview it; "Make this Active" button if not current; "Diff vs. Active" button opens diff view.
15. **"Refine with AI" button** — calls `navigationService.SetAgentContext({ ActiveForm: {...} })` (already implemented) and opens the chat overlay with a starter message. Sage routes it.

### Form variant switcher (Angular, `@memberjunction/ng-base-forms`)

16. **Add variant picker to `<mj-record-form-container>` toolbar.** Visible only when more than one variant is applicable. Persists selection in localStorage. Emits a `VariantChanged` event that resolver picks up.

### Tests (all packages above)

17. **Action tests** — Create / Modify (Active→new version) / Modify (Pending→in-place) / Revert / Activate. Verify version chain integrity (same Name, sequential VersionSequence, history preserved).
18. **Resolver tests** — variant listing, session-override resolution, multi-tier precedence still correct when no override selected.
19. **Form artifact viewer tests** — form-role detection, Top-1 binding, fixture fallback when entity unresolvable, record picker swap, Apply button calls correct action.
20. **End-to-end agent test** — Form Builder agent produces a form-role ComponentSpec; the spec passes the linter; it persists correctly; rendering the resulting Component as an artifact in a fixture conversation produces a usable preview.

### Docs & changeset

21. **Update [plan.md](plan.md)** to mark Phase A/B complete and point at this doc for Phase C.
22. **Changeset** describing the runtime loop and the agent surface area.

## End-to-end test path through the artifact viewer

This is the key acceptance test for "the agent emits valid form-role components." It exercises the entire runtime loop in one shot:

1. Open a Form Builder agent chat (either from cockpit or from Sage with `ActiveForm` context).
2. Ask "build me a compact form for MJ: Applications that hides system fields and shows the description prominently."
3. Verify the agent's response is an artifact card.
4. Verify the artifact card auto-loaded a real `MJ: Applications` record (Top 1).
5. Verify the form renders against that record with no errors.
6. Click the record-picker chip → search for a different application → verify the form rebinds.
7. Click "Apply to my form" → confirm scope/version → verify Active Override now points at the new Component.
8. Reload the entity in Explorer → verify the new form is what renders.
9. Return to chat, ask "make the description even bigger" → verify a Pending Override + new Component version is created (not in-place; the prior Active stays untouched).
10. In the cockpit version rail: see v1.0.0 Active + v1.1.0 Pending → click Activate on v1.1.0 → verify the swap.
11. Revert: click Activate on v1.0.0 → verify roll-back works.

All 11 steps must work for this phase to be done.

## Files I expect to touch

| Area | Files (representative, not exhaustive) |
|---|---|
| Migration | [migrations/v5/V202605221100__v5.37.x__Interactive_Forms.sql](../../migrations/v5/V202605221100__v5.37.x__Interactive_Forms.sql) — Notes column folded in ✅ |
| Actions | [packages/Actions/CoreActions/src/custom/interactive-forms/](../../packages/Actions/CoreActions/src/custom/interactive-forms/) — split `create-interactive-form.action.ts` into 5 actions; add `get-default-form-scaffold.action.ts`, `get-active-form.action.ts`, `modify-interactive-form.action.ts`, `activate-form-version.action.ts`, `revert-interactive-form.action.ts` |
| Actions metadata | [metadata/actions/.interactive-forms-actions.json](../../metadata/actions/.interactive-forms-actions.json) |
| Agent prompt | [metadata/prompts/templates/sage/form-builder.template.md](../../metadata/prompts/templates/sage/form-builder.template.md) |
| Resolver | [packages/Angular/Generic/base-forms/src/lib/](../../packages/Angular/Generic/base-forms/src/lib/) — `FormResolverService` extension |
| Artifact viewer | [packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts](../../packages/Angular/Generic/artifacts/src/lib/components/plugins/component-artifact-viewer.component.ts) |
| Fixture builder | [packages/Angular/Explorer/dashboards/src/ComponentStudio/services/form-host-props-fixture.ts](../../packages/Angular/Explorer/dashboards/src/ComponentStudio/services/form-host-props-fixture.ts) → promote to a shared package |
| Cockpit | [packages/Angular/Explorer/dashboards/src/FormBuilder/](../../packages/Angular/Explorer/dashboards/src/FormBuilder/) |
| Variant switcher | [packages/Angular/Generic/base-forms/src/lib/single-record-component/](../../packages/Angular/Generic/base-forms/src/lib/) — `<mj-record-form-container>` toolbar |
| Sage prompt | [metadata/prompts/templates/sage/sage.template.md](../../metadata/prompts/templates/sage/sage.template.md) — add form-context routing line |

## Mockups

Full-resolution HTML mockups live in [mockups/](mockups/). Open [mockups/index.html](mockups/index.html) for the catalog.

**Three foundational mockups built and reviewed.** The cockpit + version rail visual language is locked. Remaining flows reuse the same style and primitives when their production code is built — additional mockups will be drawn on demand only if a flow's UX warrants it; default is to build straight from the established cockpit style.

| # | Flow | Status | Decision |
|---|---|---|---|
| 01 | Form Builder cockpit layout | ✅ Built + decided | **Option A** — 4-pane cockpit with embedded chat on the right (always visible; collapsible to a strip). Chat is part of the cockpit UX, not an overlay. |
| 02 | Version rail | ✅ Built + decided | **Option A** — persistent left pane. Collapsible (state persisted per-user in localStorage). |
| 06 | Form artifact in chat | ✅ Built + decided | **Reuse existing chat-artifact rendering.** The interactive-component type viewer plugin becomes form-aware (detects `componentRole === 'form'`, binds Top-1 record, exposes record picker, surfaces Apply action). No new artifact card chrome. |
| 03, 04, 05, 07, 08, 09, 10, 11, 12 | Other flows | Not mocked | Build straight from established cockpit style when implementing. Mock on demand only if UX warrants it. |

## Open questions resolved this round

- **Modify-on-collision** (was Q1): branch on Component.Status — Active → new version + Pending Override; Pending → in-place overwrite.
- **Skip / agent → override authority** (was Q2): agents never mutate overrides directly. They emit interactive component artifacts. The artifact viewer is smart enough to render form-role components with real or mock data and exposes "Apply to my form" as the user's explicit consent step.
- **Multi-variant surfacing** (was Q3): resolver returns the full applicable list; variant switcher on the form toolbar lets users pick; selection is session-local by default with optional explicit "make this my default" promotion.

## Retrospective fixes (in-flight follow-up)

After the initial implementation landed, a candid critique surfaced 13 real holes — three security, three integration gaps, four UX polish issues, and three coverage gaps — plus a follow-up retrospective task. **All 14 items must close for the phase to be considered done.** Tracked here as the canonical working list.

### Security (must fix before merge)

1. **Ownership checks on Modify / Activate / Revert.** `Create` correctly self-scopes to the calling user. The three mutation actions all take an `OverrideID` from the caller and operate on it without verifying ownership — a user could mutate someone else's User-scope override by guessing the ID. Add explicit guards:
   - `Scope='User'` → require `override.UserID === ctx.user.ID`
   - `Scope='Role'` → require caller is a member of `override.RoleID`
   - `Scope='Global'` → require caller has admin privilege (`IsAdminUser` / Owner role on app — verify which marker MJ uses)
   - Surface as `FORBIDDEN` result code on all three actions.

2. **"Apply to my form" button has no consumer.** The artifact viewer's form-aware branch emits `applyFormRequested`; nothing listens. Wire it through `<mj-artifact-message-card>` → confirmation dialog → `Create Interactive Form` (or `Modify Interactive Form` when an Active override already exists for this entity+user). Without this the user-facing button is a broken promise.

3. **Modify action docstring lies.** Claims "uses the SAME scope as the existing override"; implementation hard-clamps to `Scope='User'` via the shared helper. The clamp is correct (security boundary); the doc misleads downstream readers. Rewrite to match: "Modify *always* writes a User-scope Pending Override, regardless of the original override's scope — scope promotion is a separate, deliberate human action."

### Integration gaps the plan called for but didn't deliver

4. **`Get Default Form Scaffold For Entity` not wired into the dashboard's New Form flow.** The agent can call it; the dashboard's manual-create still produces an empty canvas. The plan literally promised the dashboard would use it as a baseline. Fix: in `OnNewForm`, after entity pick, call `buildDefaultFormScaffold(entityName, provider)` and seed `EditableCode` + canvas from the result.

5. **Preview spec is reconstructed from `EditableCode` only.** `PreviewSpec` getter builds `{ name, componentRole, location, code, title }` and drops `dataRequirements`, `description`, `functionalRequirements`, `technicalDesign` from the saved spec. Forms whose data-fetching hooks rely on `dataRequirements` render in Preview without their data context. Fix: merge `EditableCode` over the saved spec rather than rebuilding from scratch.

6. **Layout tab and Code tab can silently diverge.** Canvas-to-code is one-way; if a user edits Code then opens Layout, the canvas is stale. Fix: when `parseCanvasFromCode(EditableCode)` would lose information (existing code path detects this with a warning), surface an inline banner inside the canvas pane: "Code has hand-authored content the canvas can't display — saving here will overwrite it." User can still proceed but is warned.

### UX polish — visible-to-end-user gaps

7. **Top-1 record load is non-deterministic.** `RunView({ MaxRows: 1 })` with no `OrderBy` returns physical-order rows; different users open the same artifact and see different records bound. Fix: `OrderBy` = entity's NameField when available, otherwise `__mj_CreatedAt DESC`.

8. **Variant switcher has no "(default)" affordance.** The picker shows all variants equally; users can't tell which is the CodeGen fallback. Fix: visually distinguish the "Default form" row (label + lighter weight + "(CodeGen fallback)" subtitle).

9. **Version rail "Activate" overloaded.** Same button label for Pending → Active (`activateVersion`) and Inactive → Active (`revertToComponent`). Different audit semantics. Fix: button on a Pending row says "Activate"; button on an Inactive row says "Restore".

10. **No error boundary on the Preview pane.** Bad JSX in EditableCode throws inside `<mj-react-component>`; cockpit shows a blank preview without context. Fix: wrap the preview mount in a small error-state component that catches the render error and shows "Preview failed: \<message\>. Switch to Code to fix."

### Coverage gaps

11. **No end-to-end test of artifact → apply flow.** Each link is unit-tested in isolation but the chain isn't. Caught the "no consumer" bug (#2) too late. Fix: integration test that wires a form-role artifact into a fake message card, simulates the Apply click, asserts the action call happens.

12. **No test of cockpit Version rail data loading.** `loadVersionsForActiveForm()` does a Components-by-Name + Overrides-by-ComponentID-IN + client-side-join dance. Untested. Fix: mock RunView with the two-call sequence and assert the resulting `Versions[]` shape (including IsActive / IsPending flags).

13. **No test of Modify scope-preservation contract.** Given the docstring/implementation mismatch in #3, a regression test asserting "Modify on a Role-scope override produces a User-scope Pending" would pin the actual contract. Fix: add to the existing modify-interactive-form.action.test.ts.

### Retrospective

14. **Re-run the retrospective after the 13 fixes land.** Audit for new gaps introduced during the fix work + confirm all 13 are genuinely closed. Document any newly-identified issues with the same severity ranking (security / integration / UX / coverage).

## Still open — defer to implementation

These are small UX details that don't block the architecture and can be decided when each piece is built:

- **Variant switcher control style** — dropdown vs segmented vs settings-cog on `<mj-record-form-container>` toolbar. Default: dropdown (least visually intrusive). Revisit if usability testing surfaces a problem.
- **Variant preference persistence** — session-only (localStorage) vs materialized user preference row. Default: localStorage for v1. Materialize later if users ask for cross-device portability.
- **Pending version surfacing inside the cockpit** — the version rail already shows Pending vs Active clearly. Whether we add a secondary banner above the preview pane when a Pending version exists is a small flourish; default is no banner (rail is sufficient).
- **Record picker on form artifacts** — picker control sits on the existing artifact toolbar/header (reusing chat-artifact infrastructure). Style follows whatever the existing artifact viewer already does for its action area.

## Resolved this round

- **Cockpit chat**: Option A — embedded right pane, always visible by default, collapsible to a strip. Part of the cockpit, not a floating overlay.
- **Version rail**: Option A — persistent left pane, collapsible.
- **Form artifact viewing approach**: Reuse the existing chat artifact rendering pipeline. Make the interactive-component type viewer form-aware. No new artifact UI primitives.
