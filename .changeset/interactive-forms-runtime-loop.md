---
"@memberjunction/interactive-component-types": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-dashboards": minor
---

Interactive Forms — runtime authoring loop is now closed end-to-end.

**Versioning lifecycle (server-side actions).** The single `Create Interactive Form` action has been split into a versioning-aware family:
- `Create Interactive Form` — net-new only; returns `ALREADY_EXISTS` if the user already has an Active override for the entity.
- `Modify Interactive Form` — branches on the pointed-to Component's status: Pending → modify the row in place (no version proliferation during chat refinement); Active → insert a new Component v(N+1) with `Status='Pending'` and a sibling Pending Override, leaving the live form untouched.
- `Activate Interactive Form Version` — flips a Pending override to Active and atomically demotes the prior Active to Inactive.
- `Revert Interactive Form` — re-points an Active override at an older Component in the same Name lineage. Pure UPDATE; old rows preserved.
- `Get Active Form For Entity` — read-only; returns the resolved override + the full applicable-variants list.
- `Get Default Form Scaffold For Entity` — new read-only action that produces a working `ComponentSpec` mirroring the CodeGen Angular default layout. Replaces "write JSX from scratch" as the agent's baseline.

**Form-aware artifact viewer.** When a component artifact's spec declares `componentRole: 'form'`, the viewer auto-loads a Top-1 record from the declared entity, mounts via `<mj-interactive-form>` (with `componentSpec` + `record` now `@Input()`s), and exposes a search-as-you-type record picker plus an **Apply to my form** action. Falls back to a synthetic `NewRecord()` when the entity has no rows yet.

**Variant switcher.** `FormResolverService` now returns the full applicable-variants list alongside the resolved override. `<mj-record-form-container>` renders a compact "Form: \<name\> ▾" picker between the toolbar and the form body when more than one variant applies; selection is persisted per-user per-entity in localStorage.

**Cockpit reshape.** Form Builder dashboard is no longer canvas-first: 4-pane layout with a forms list + versions rail on the left, a Preview/Code/Layout tabbed center, and a Form Builder AI pane on the right. Both side rails collapse to a strip with state persisted in localStorage.

**Shared fixture.** `buildFixtureFormHostProps` promoted from Component Studio to `@memberjunction/interactive-component-types/forms` so the artifact viewer and Studio share one implementation.

**Migration.** `EntityFormOverride.Notes` column (NVARCHAR(MAX), nullable) for human commentary on overrides. Validator audited against the CHECK constraint — no patch required.

**Agent prompt.** `form-builder.template.md` rewritten around the new action toolbox; teaches the agent to call `Get Active Form For Entity` first and branch between Create / Modify (new-version) / Modify (in-place). Sage's prompt gets a one-line routing rule to delegate form requests to Form Builder.
