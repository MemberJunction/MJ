# MJ Explorer UI Consistency — Program Catalog

> **Part of the UI consistency program.** Current commitments live in [`ui-consistency-okrs.md`](ui-consistency-okrs.md) (the master OKR doc). This catalog is the *backlog* — every component, layout pattern, CI gate, and visual-identity item that's known to need work, sized in person-days. Quarterly KRs are picked from here.
>
> **Status: working catalog.** Drafted 2026-05-22 after supervisor agreement to restructure away from the original four-KR quarterly OKR.
>
> **What this is.** A complete inventory of the work needed to drive cross-app UI consistency in MJ Explorer. Each item has a sized contract (baseline, target, definition of done, effort estimate, risks). **No date commitments here.** Sequencing happens at quarterly planning, not in this document.
>
> **Why this shape.** The Q2 OKR failed because it framed open-ended goals as quarterly commitments. This catalog separates *what needs to happen* (this doc) from *when each chunk gets committed* (quarterly planning). Same work, lower fragility.
>
> **Living document.** The catalog grows as discovery surfaces new items. Audits, PR reviews, and engineering conversations all feed in. No item is ever removed without explicit closure (shipped, deferred, or cancelled with rationale).

---

## Operating principles

Apply to every item in the catalog:

1. **Definition of "done" is consolidation, not invention.** Shipping a component is not done. Done means: component shipped + named consumers migrated + **displaced bespoke code deleted** + light/dark theme validated + tests pass + documentation updated. Shipping `<mj-x>` without deleting `.bespoke-x` markup just adds a 13th implementation.
2. **Effort is sized in person-days, not in calendar windows.** Each item's effort estimate is the total of (a) design / survey, (b) component build, (c) consumer migration, (d) cleanup / QA / docs. Calendar mapping happens at quarterly planning, accounting for capacity, partnerships, and competing work.
3. **Discovery has a reserve.** Quarterly planning reserves ~20% of estimated capacity for items the prior quarter's work surfaces. Don't over-pack quarters.
4. **At-risk protocol.** Any committed item that falls below 50% complete at midpoint, or runs >25% over its effort estimate, triggers an explicit go/no-go: continue with revised plan, reduce target, defer, or cut. Silent slip past the deadline is the failure mode this protocol exists to prevent.
5. **Re-measurement is automated where possible.** Any percentage or count metric requires a script that produces it on demand. "We'll figure out how to measure later" is how baselines drift.
6. **Catalog before commitment.** Adding work to a quarterly OKR requires it to first exist in this catalog with a sized contract. Stops impulse-scoping.

---

## How to read this catalog

Each item below is one of three statuses:

- **Sized** — we have a baseline number, a target, a contract, and an effort estimate. Ready to commit at next quarterly planning.
- **Partial** — we know it exists and roughly what's needed, but the baseline / scope hasn't been measured.
- **Discovery** — known area of work that hasn't been audited at all. Effort is "TBD pending audit."

Sections A–F are sized + partial items. Section G is discovery scope (the work that still needs to be inventoried before it can be sized).

---

# CATALOG

## Section A — Body components (audited from dashboards)

These are components surfaced by the April 15 baseline audit and the May 21 wide audit. All are sized.

### A1 — `<mj-empty-state>`

- **Status**: Sized
- **Purpose**: Standardized "nothing to show" display for empty lists, no-results states, and uninitialized sections.
- **Replaces**: 102 inline empty-state patterns across 77 files.
- **Baseline → Target**: 102 → 0 inline instances. Re-measured via grep for `class="empty-state"` / `class="no-data"` / `class="no-results"` / similar.
- **Contract**:
  - Selector: `mj-empty-state`
  - Inputs: `Icon` (FA class), `Title`, `Message`, `ActionText` (optional), `Variant` (`'empty' | 'no-results' | 'error'`)
  - Output: `Action: EventEmitter<void>`
  - Slot: `[actions]` for multi-CTA cases
- **Effort**: ~6 days total (½ design + 1 build + 4 migrate-all + ½ QA). Can be split into reference-set (½ + 1 + 1 + ½ = ~3 days) and full migration (~3 days).
- **DoD**: Component shipped; all 102 instances migrated; displaced markup deleted; light/dark validated; tests pass; docs in CLAUDE.md.
- **Risks**: Variant set may need a 4th shape (e.g., compact-in-card) once 102 instances surveyed. Some instances may actually be loading skeletons mis-categorized.
- **Tier**: 1 (highest priority — biggest instance count, smallest component scope, most visible consistency win per hour)

### A2 — `<mj-detail-drawer>`

- **Status**: Sized
- **Purpose**: Right-side slide-in panel for record detail. Closes the drawer-vs-modal UX inconsistency documented in chrome-conventions Section 11.
- **Replaces**: 12 bespoke right-side detail panels.
- **Baseline → Target**: 12 → 0 bespoke `.detail-panel-*` implementations. ~1,000+ lines of bespoke CSS to be deleted (worst single offender: agent-configuration at 470+ lines).
- **Contract**: Defined in `plans/explorer-chrome-conventions.md` Section 11. Selector `mj-detail-drawer`; built on CDK Overlay; focus-trap + scroll-lock + aria-modal.
- **Effort**: ~9 days total (½ design + 2 build + 5 migrate-all + 1½ QA). Reference-pair subset (~4 days): ½ + 2 + 1 + ½.
- **DoD**: Component shipped; all 12 panels migrated; displaced CSS deleted; ESC/backdrop dismiss tested; focus management verified; light/dark validated.
- **Risks**: agent-configuration has tabs inside the drawer with sticky footer + nested scrolling — needs prototyping. CDK Overlay interactions with Kendo/third-party widgets in some panels.
- **Tier**: 1 (high-leverage, closes UX gap, deletes most CSS debt of any single item)

### A3 — `<mj-confirm-dialog>`

- **Status**: Sized
- **Purpose**: Standardized confirmation modal.
- **Replaces**: 3 bespoke confirm-dialog implementations + inline confirm patterns scattered across custom forms.
- **Baseline → Target**: 3 bespoke impls + ~8 inline confirm calls → 0 bespoke; all using canonical.
- **Contract**:
  - Selector: `mj-confirm-dialog`
  - Inputs: `Visible` (two-way), `Title`, `Message`, `Type` (`'default' | 'danger'`), `ConfirmText`, `CancelText`
  - Outputs: `Confirmed`, `Cancelled`
  - Built on `<mj-dialog>` primitives. Enforces MJ button-placement (primary LEFT, Cancel RIGHT).
- **Effort**: ~3 days.
- **DoD**: Component shipped; 3 bespoke impls deleted; inline confirms replaced; light/dark validated.
- **Risks**: Low — well-defined.
- **Tier**: 2

### A4 — `<mj-status-indicator>`

- **Status**: Sized
- **Purpose**: Unified status display (dot + label or pill) for active/pending/error/success/etc.
- **Replaces**: 6+ bespoke status patterns — AI agent-configuration's status badges (~36 lines CSS), conversations message-status dots, archive-status indicators, scheduling activity status, action-execution status, integration status.
- **Baseline → Target**: 6+ bespoke patterns → 0; single component with semantic status taxonomy.
- **Contract**:
  - Selector: `mj-status-indicator`
  - Inputs: `Status` (`'active' | 'pending' | 'error' | 'success' | 'disabled' | 'running'`), `Label`, `Variant` (`'dot' | 'pill'`)
  - Tokens drive color mapping (no hex)
- **Effort**: ~4 days.
- **DoD**: Component shipped; all 6 bespoke patterns replaced; displaced CSS deleted; status taxonomy documented; light/dark validated.
- **Risks**: Status vocabularies don't map cleanly across domains ("running" vs "active" vs "live"). Need normalized vocabulary doc.
- **Tier**: 2

### A5 — `<mj-badge>` (general purpose)

- **Status**: Sized
- **Purpose**: General-purpose badge (separate from `<mj-stat-badge>` which stays for chrome counts).
- **Replaces**: ~79 badge/pill instances across 5+ implementations — `mj-pill`, `mj-notification-badge`, inline `.status-badge` across 71 files (370 CSS declarations).
- **Baseline → Target**: 79 instances + 370 CSS decls → 0 bespoke (≤30 legitimate one-off uses).
- **Contract**:
  - Selector: `mj-badge`
  - Inputs: `Text`, `Type` (`'default' | 'success' | 'warning' | 'danger' | 'info'`), `Size` (`'sm' | 'md'`), `Variant` (`'solid' | 'subtle'`)
- **Effort**: ~5 days.
- **DoD**: Component shipped; `mj-pill` and `mj-notification-badge` consumers migrated; inline `.status-badge` CSS replaced; original packages deprecated or deleted.
- **Risks**: Some consumers may need a 6th color or special variant. Mitigation: add variants to the canonical, don't fork.
- **Tier**: 2

### A6 — `<mj-alert>` / inline banner

- **Status**: Sized
- **Purpose**: Inline persistent alert/banner (paired with `<mj-toast>` for transient notifications).
- **Replaces**: 5+ distinct patterns — query-error with hardcoded Bootstrap red (`#f8d7da`), home-dashboard edit-mode banner, scheduling health banner, validation errors, generic inline alerts.
- **Baseline → Target**: 5+ patterns → 0; all using `<mj-alert>` (persistent) or `<mj-toast>` (transient).
- **Contract**:
  - Selector: `mj-alert`
  - Inputs: `Type` (`'info' | 'success' | 'warning' | 'error'`), `Title`, `Message`, `Dismissable`, `Icon` (optional override)
  - Outputs: `Dismissed`
- **Effort**: ~5 days.
- **DoD**: Component shipped; 5 bespoke patterns migrated; hardcoded Bootstrap-red etc. deleted; light/dark validated.
- **Tier**: 2

### A7 — `<mj-collapsible-section>`

- **Status**: Sized
- **Purpose**: Generic collapsible section container (broader than the minimal `<mj-accordion-panel>`).
- **Replaces**: 29+ files copying the bespoke `.section-header` + chevron + content + expand-animation pattern.
- **Baseline → Target**: 29+ files → 0 bespoke; all using canonical or `<mj-accordion-panel>` where appropriate.
- **Contract**:
  - Selector: `mj-collapsible-section`
  - Inputs: `Title`, `Subtitle`, `Icon`, `Expanded` (two-way), `Disabled`
  - Slots: `[meta]` (right side of header), default (content)
  - Output: `ExpandedChange`
  - Accessibility: `aria-expanded`, keyboard toggle
- **Effort**: ~7 days (high migration count).
- **DoD**: Component shipped; 29 files migrated (or documented exceptions); bespoke CSS deleted; light/dark validated on ≥10 consumers.
- **Risks**: Some files may have nested collapsibles or non-standard animations. Mitigation: survey + categorize before locking variants.
- **Tier**: 2

### A8 — `<mj-toast>` relocation

- **Status**: Sized
- **Purpose**: Move `<mj-toast>` from `@memberjunction/ng-conversations` into `@memberjunction/ng-ui-components`.
- **Replaces**: Cross-package dependency where unrelated apps import from `ng-conversations`.
- **Baseline → Target**: `mj-toast` lives in conversations → lives in ui-components; ng-conversations re-exports with deprecation.
- **Effort**: ~2 days (mechanical).
- **DoD**: Component moved with no behavioral changes; all consumers updated; deprecation re-export in place; both packages build clean.
- **Tier**: 2 (cheap, frees up the conversations package)

### A9 — `<mj-stat-tile>` / `<mj-kpi-card>`

- **Status**: Sized
- **Purpose**: Standardized KPI / metric tile for dashboard "Overview" pages.
- **Replaces**: Every "Overview" page reinventing `.stat-item` / `.stat-label` / `.stat-value` markup. ~10 dashboards.
- **Baseline → Target**: ~10 bespoke stat-tile implementations → 0; all using canonical.
- **Contract** (proposed; finalize in design step):
  - Selector: `mj-stat-tile`
  - Inputs: `Label`, `Value`, `Unit` (optional), `Icon` (optional), `Trend` (`'up' | 'down' | 'flat' | null`), `TrendValue`, `Variant` (`'default' | 'success' | 'warning' | 'danger'`)
  - Slot: `[content]` for non-standard tile content
- **Effort**: ~5 days.
- **DoD**: Component shipped; ≥5 Overview pages migrated; displaced markup deleted.
- **Risks**: Variants may diverge significantly across dashboards (e.g., charts inside the tile). Mitigation: design slot to handle escape-hatch content.
- **Tier**: 2

### A10 — `<mj-form-section>`

- **Status**: Sized
- **Purpose**: Layout primitive wrapping `.form-section > .form-field > label + input` so consumers don't copy markup.
- **Replaces**: 29+ files manually constructing this markup.
- **Baseline → Target**: 29+ files → 0 manual `.form-section` markup.
- **Contract**:
  - Selector: `mj-form-section`
  - Inputs: `Title`, `Description` (optional), `Layout` (`'single' | 'two-column'`)
  - Slot: default (form fields)
- **Effort**: ~6 days.
- **DoD**: Component shipped; 29 files migrated; bespoke markup deleted; light/dark validated.
- **Risks**: Some forms may have unusual layouts that don't fit a generic section wrapper. Mitigation: identify exceptions during survey; allow opt-out.
- **Tier**: 2

### A11 — `<mj-skeleton>`

- **Status**: Partial
- **Purpose**: Skeleton/shimmer placeholder for list-page initial load (distinct from `<mj-loading>` spinner).
- **Replaces**: Mixed inline patterns — `.sidebar-loading`, `.content-skeleton`, etc. (~15–20 ad-hoc CSS implementations).
- **Baseline**: Roughly known (~15–20 ad-hoc), needs survey before locking.
- **Contract** (proposed):
  - Selector: `mj-skeleton`
  - Inputs: `Shape` (`'text' | 'rect' | 'circle' | 'list-row' | 'card'`), `Width`, `Height`, `Count` (for repeating shapes), `Animated` (default true)
- **Effort**: ~3 days for component; migration scope sized after survey.
- **DoD**: Component shipped; ≥3 list pages use it for initial-load skeletons.
- **Tier**: 3

### A12 — `<mj-card>` (general purpose)

- **Status**: Sized — but heaviest design surface in the catalog
- **Purpose**: Generic card container.
- **Replaces**: ~40 distinct card implementations (`kpi-card`, `action-card`, `integration-card`, `settings-card`, `artifact-message-card`, `isa-related-card`, `collection-artifact-card`, `entity-card`, etc.). ~850 inline `.card` class references across dashboards.
- **Baseline → Target**: 40+ bespoke implementations → 0 (or ≤5 legitimately-specialized variants).
- **Contract** (to be designed — this is the work):
  - Selector: `mj-card`
  - Inputs: `Title`, `Icon`, `Variant` (TBD), `Elevation`, `Clickable`
  - Slots: `[header]`, default (body), `[footer]`, `[meta]`, `[actions]`
- **Effort**: ~10 days for component + initial migration of 5 reference consumers. Full migration of 40+ implementations: ~15 additional days.
- **DoD**: Component shipped; slot contracts documented; ≥5 reference migrations; full migration path planned but not necessarily completed in one quarter.
- **Risks**: HIGH — slot contracts may not satisfy all 40 implementations. Mitigation: catalog the 40 implementations BEFORE designing; identify common shapes; design slots to cover ≥80%; document exceptions explicitly.
- **Tier**: 3 (high-leverage but design-heavy; should not start until Tier 1+2 patterns settled)

### A13 — `<mj-selector-dialog>`

- **Status**: Sized — design-heavy
- **Purpose**: Standardized "pick a record / template / entity / sub-agent / project" picker.
- **Replaces**: 9 bespoke selector dialogs across `core-entity-forms/custom/` and dashboards. Plus `record-selector` exists in its own package and is under-adopted.
- **Baseline → Target**: 9 bespoke + 1 underused → 0 bespoke; all using canonical.
- **Contract** (to be designed):
  - Selector: `mj-selector-dialog`
  - Inputs: `EntityName`, `Filter`, `Multiple` (bool), `InitialSelection`, `Title`, etc.
  - Outputs: `Selected`, `Cancelled`
- **Effort**: ~8 days.
- **DoD**: Component shipped; 9 bespoke + record-selector consumers migrated; bespoke code deleted.
- **Risks**: HIGH — selectors have very different needs (some need tree views, some need filters, some need multi-select with chips, some have pre-filtering by relationship). Mitigation: survey + categorize before design; possibly need 2 components, not 1.
- **Tier**: 3

### A14 — `<mj-breadcrumb>`

- **Status**: Sized
- **Purpose**: Hierarchical navigation breadcrumb.
- **Replaces**: 2 bespoke impls (`dashboard-viewer/breadcrumb`, `Actions/action-breadcrumb`).
- **Baseline → Target**: 2 → 0; canonical breadcrumb in ui-components.
- **Effort**: ~2 days.
- **DoD**: Component shipped; 2 impls migrated; bespoke code deleted.
- **Tier**: 4 (low priority — only 2 consumers)

### A15 — Form field wrapper unification

- **Status**: Partial
- **Purpose**: Single form-field contract (label + input + validation + help text + required marker).
- **Replaces**: Two competing implementations — `base-forms/form-field` and `dynamic-forms/dynamic-form-field` — plus inline patterns.
- **Baseline**: Needs survey.
- **Effort**: TBD — architectural change touching both packages.
- **Tier**: 4 (architectural; needs design discussion with form system owners)

---

## Section B — Form / input primitives (partially audited)

Existing primitives with adoption gaps. Mostly Q1 work that didn't fully roll out.

### B1 — Button adoption push (`mjButton`)

- **Status**: Sized
- **Baseline (April 15)**: 24% adoption (~512 of ~2,152 buttons).
- **Target**: ≥80% adoption.
- **Effort**: ~5 days (migrating ~1,300+ buttons; mechanical but high volume).
- **DoD**: ≥80% via re-measurement script; exceptions documented (icon-only buttons that legitimately don't need the directive).
- **Tier**: 1 (foundational; biggest raw count from April audit)

### B2 — Switch adoption push (`<mj-switch>`)

- **Status**: Sized
- **Baseline**: 5% adoption (~5 of ~97).
- **Target**: ≥80%.
- **Effort**: ~3 days.
- **DoD**: ≥80% via re-measurement.
- **Tier**: 2

### B3 — Loading adoption push (`<mj-loading>` vs `fa-spinner`)

- **Status**: Sized
- **Baseline**: 49% (~198 `mj-loading` vs ~205 `fa-spinner`).
- **Target**: ≥80% (close to 100% — fa-spinner inline is almost always a regression).
- **Effort**: ~3 days.
- **DoD**: ≥80% via re-measurement; remaining `fa-spinner` instances documented as intentional.
- **Tier**: 1

### B4 — `.mj-input` styling adoption

- **Status**: Sized
- **Baseline**: 36% (~86 of ~238 text inputs).
- **Target**: ≥80%.
- **Effort**: ~2 days.
- **Tier**: 2

### B5 — `.mj-textarea` styling adoption

- **Status**: Sized
- **Baseline**: 38% (~32 of ~85).
- **Target**: ≥80%.
- **Effort**: ~1 day.
- **Tier**: 2

### B6 — `.mj-checkbox` styling adoption

- **Status**: Sized
- **Baseline**: 17% (~27 of ~156).
- **Target**: ≥80%.
- **Effort**: ~2 days.
- **Tier**: 2

### B7 — Numeric input adoption (`<mj-numeric-input>`)

- **Status**: Sized
- **Baseline**: 50%.
- **Target**: ≥80%.
- **Effort**: ~1 day.
- **Tier**: 3

### B8 — Datepicker adoption (`<mj-datepicker>`)

- **Status**: Sized
- **Baseline**: 58%.
- **Target**: ≥80%.
- **Effort**: ~1 day.
- **Tier**: 3

### B9 — Native `<select>` → `<mj-dropdown>`

- **Status**: Partial
- **Baseline**: ~150 native selects remaining (April 15).
- **Target**: TBD — open decision whether to migrate all, or create `.mj-select` CSS class for simple cases.
- **Effort**: TBD pending decision.
- **Tier**: 3

---

## Section C — Picker / chooser components

### C1 — Selector dialogs — covered by A13.

### C2 — `<mj-record-selector>` adoption

- **Status**: Partial
- **Existing in package**: `@memberjunction/ng-record-selector`.
- **Issue**: Under-adopted; many entity-form custom selectors don't use it.
- **Work**: Either fold into A13's `<mj-selector-dialog>` or push adoption.
- **Tier**: 3 (decision pending A13's design)

### C3 — Tree views (beyond `<mj-left-nav>`)

- **Status**: Discovery
- **Purpose**: Generic tree component for hierarchies (entity relationships, file trees, taxonomy navigation).
- **Existing**: `ng-trees` package (`mj-tree`, `mj-tree-dropdown`).
- **Work**: Audit scattered consumers; relocate into `ng-ui-components` if appropriate.
- **Effort**: TBD pending audit.
- **Tier**: 3

---

## Section D — Display / visualization components

### D1 — Charts / metric visualizations

- **Status**: Discovery
- **Purpose**: Time-series, heatmap, gauge, bar, line, pie, distribution.
- **Existing**: `time-series-chart` (AI dashboard only), `performance-heatmap` (AI dashboard only), `mj-timeline`, `mj-gantt-chart`, `kanban-board`.
- **Issue**: Scattered. No unified chart library. Some dashboards build custom (VersionHistory graph, KH cluster viz, AI agent-run viz).
- **Work**: Audit scope, propose shared chart primitives or recommend a library choice.
- **Effort**: TBD pending audit + library decision.
- **Tier**: 4 (heavy; library choice has implications)

### D2 — Code editor wrapper

- **Status**: Partial
- **Existing**: `ng-code-editor` (wraps CodeMirror or Monaco — verify).
- **Issue**: Possibly multiple wrappers; backgrounds intentionally dark (preserved hex per design-token migration).
- **Work**: Audit consumers; consolidate if multiple wrappers exist.
- **Tier**: 3

### D3 — Markdown viewer / editor

- **Status**: Discovery
- **Purpose**: Render and/or edit markdown.
- **Existing**: Likely scattered implementations across artifacts viewer, comments, etc.
- **Work**: Audit consumers, propose canonical.
- **Tier**: 3

### D4 — JSON viewer / editor

- **Status**: Discovery
- **Purpose**: Display and edit JSON (entity JSON fields, agent params, etc.).
- **Existing**: Inline implementations in dev-tools dashboards, agent forms, etc.
- **Work**: Audit + canonical.
- **Tier**: 3

### D5 — File / media browsers

- **Status**: Partial
- **Existing**: `mj-file-browser` in `ng-file-storage`.
- **Issue**: Specialized per-type viewers (data-requirements-viewer, archive-run-viewer); unclear if consolidation valuable.
- **Tier**: 4

### D6 — Diff viewer

- **Status**: Discovery
- **Purpose**: Show diffs (record changes, version compare, JSON diffs).
- **Existing**: Record-changes display (likely inline).
- **Work**: Audit; possibly leverage existing library.
- **Tier**: 4

### D7 — Activity feed / log viewer

- **Status**: Discovery
- **Existing**: Multiple — execution logs, audit logs, integration activity, agent run traces.
- **Tier**: 4

### D8 — Avatar / user display

- **Status**: Consolidated (single `<mj-user-avatar>`)
- **Note**: Consider adding a multi-user avatar-group (e.g., for collaborator lists).
- **Tier**: 4

---

## Section E — Layout patterns

### E1 — Master-detail layout adoption

- **Status**: Partial
- **Canonical**: `<mj-list-detail-grid>` exists.
- **Issue**: 6–8 dashboards build custom master-detail (Actions explorer, Integration mapping, Database Designer, AI Agents, Flow editor, etc.) instead of using it.
- **Work**: Audit each custom impl; migrate where feasible; document exceptions.
- **Effort**: ~6 days for audit + migration of 6–8 consumers.
- **Tier**: 3

### E2 — Section / panel container shape

- **Status**: Sized — covered by A7 (`<mj-collapsible-section>`).

### E3 — Form layout grid

- **Status**: Sized — covered by A10 (`<mj-form-section>`).

### E4 — Sticky header patterns (non-chrome)

- **Status**: Partial
- **Issue**: 13 files have bespoke `.sticky-header` CSS with subtly different styling.
- **Work**: Either consolidate to a CSS mixin in `_admin-patterns.scss` (and import universally), or absorb into chrome where applicable.
- **Effort**: ~2 days.
- **Tier**: 3

---

## Section F — Process, CI gates, tooling

### F1 — Re-measurement script

- **Status**: Sized
- **Purpose**: Repeatable script that produces current numbers for all baseline metrics (button %, switch %, hex count, bespoke detail-panel count, etc.).
- **Baseline → Target**: 0 → committed script that runs in <30 seconds and outputs to a known file.
- **Effort**: ~½ day for initial; ongoing tweaks as new metrics added.
- **DoD**: Script at `scripts/measure-ui-adoption.sh`; output at `plans/adoption-metrics.md`; methodology documented; ideally wired to a monthly cron / workflow.
- **Tier**: 1 (foundational — every other percentage KR depends on this)

### F2 — CI gate: hex color enforcement

- **Status**: Sized
- **Purpose**: Fail PRs that introduce hardcoded hex values in component CSS outside the documented allowlist.
- **Effort**: ~1.5 days.
- **DoD**: Workflow at `.github/workflows/ci-ui-tokens.yml`; allowlist at `scripts/ci/hex-allowlist.txt`; actionable error messages; tested on passing + failing PR.
- **Tier**: 1 (moat — prevents regression while new work ships)

### F3 — CI gate: chrome trio enforcement

- **Status**: Sized
- **Purpose**: Flag PRs that introduce a new resource component without using `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` (outside exception list).
- **Effort**: ~3 days.
- **DoD**: Workflow committed; exception list referenced from chrome-conventions Section 9; tested.
- **Tier**: 2

### F4 — CI gate: `.mj-btn` override prevention

- **Status**: Sized
- **Purpose**: Fail PRs introducing component-scoped `.mj-btn{}` overrides (which silently fork button styling per the rule documented in CLAUDE.md).
- **Effort**: ~2 days.
- **Tier**: 2

### F5 — CI gate: bespoke detail-panel detection

- **Status**: Sized (dependent on A2 shipping)
- **Purpose**: Once `<mj-detail-drawer>` exists, fail PRs that introduce new `.detail-panel-*` CSS.
- **Effort**: ~1 day.
- **Tier**: 3

### F6 — CI gate: net-new component name flag

- **Status**: Partial
- **Purpose**: Flag (not fail) PRs that introduce a new `*-{dialog,modal,card,picker,panel}.component.ts` outside `ng-ui-components`. Provides peripheral vision for new bespoke patterns without blocking work.
- **Effort**: ~2 days.
- **Tier**: 3

### F7 — ESLint rule: primitive vs semantic tokens

- **Status**: Discovery
- **Purpose**: Flag use of primitive tokens (`--mj-color-neutral-*`) in component CSS (semantic tokens should be preferred per CLAUDE.md).
- **Effort**: TBD; depends on whether stylelint or custom regex is the right tool.
- **Tier**: 4

### F8 — Claude Skill: dashboard scaffolding

- **Status**: Sized
- **Purpose**: One skill that scaffolds an MJ Explorer dashboard with correct chrome trio, slot population, tokens, `BaseResourceComponent` extension, `@RegisterClass`.
- **Effort**: ~1 day.
- **DoD**: Skill at `.claude/skills/scaffold-mj-dashboard.md`; tested end-to-end; generated scaffold passes CI gates.
- **Tier**: 1 (encodes patterns from Tier 1 work)

### F9 — Claude Skill: form scaffolding

- **Status**: Sized (after A15 settles)
- **Purpose**: Scaffold an entity form using the correct toolbar pattern (`<mj-record-form-container>`), tab structure, form-section primitives.
- **Effort**: ~1 day.
- **Tier**: 3

### F10 — Claude Skill: shared-component generation

- **Status**: Discovery
- **Purpose**: Skill that helps engineers build a new shared component with the right structure (selector, inputs, outputs, slots, tokens, tests).
- **Effort**: TBD.
- **Tier**: 3

### F11 — PR-level review trigger

- **Status**: Partial
- **Purpose**: CODEOWNERS configuration so I am notified on PRs touching `packages/Angular/**`. Peripheral vision without manual tracking.
- **Effort**: ~½ day.
- **Tier**: 2 (cheap, high leverage)

---

## Section G — Cross-app visual identity

These are the "make every app feel similar" items beyond components.

### G1 — Unified brand color verification

- **Status**: Partial
- **Context**: Existing rule (per feedback memory) is brand-blue across all apps, no per-app accents. `--mj-app-accent` exists as a theming hook but should resolve to brand-primary by default.
- **Work**: Verify every app actually does this. Audit for any per-app overrides that snuck in.
- **Effort**: ~2 days.
- **Tier**: 2

### G2 — Icon vocabulary audit

- **Status**: Partial
- **Context**: Font Awesome is canonical. Kendo icons removed (Q1). Semantic icon names preferred.
- **Work**: Audit for inconsistencies — same concept rendered with different icons across apps (e.g., refresh = fa-sync vs fa-refresh, settings = fa-cog vs fa-gear).
- **Effort**: ~2 days.
- **Tier**: 3

### G3 — Typography scale audit

- **Status**: Partial — open TODO
- **Context**: Per memory: `ui-components` components contain hardcoded font-size/font-weight px values that should reference `--mj-text-*` and `--mj-font-*` tokens.
- **Work**: Audit every component under `ui-components`; migrate hardcoded typography to tokens.
- **Effort**: ~3 days.
- **Tier**: 2

### G4 — Spacing rhythm audit

- **Status**: Partial
- **Context**: April 15 audit found 71% of SCSS files have hardcoded spacing (px) instead of using `--mj-space-*` tokens.
- **Work**: Migrate hardcoded spacing values to tokens.
- **Effort**: ~5 days (high volume).
- **Tier**: 2

### G5 — Loading screen / splash unification

- **Status**: Discovery
- **Purpose**: One loading-screen pattern across apps (initial app load, route transitions, auth states).
- **Work**: Audit current patterns; design canonical.
- **Tier**: 3

### G6 — 404 / error page unification

- **Status**: Discovery
- **Tier**: 4

### G7 — Welcome / first-run states

- **Status**: Discovery
- **Purpose**: When a user first opens an app with no data, what do they see? Today this varies.
- **Tier**: 4

### G8 — Dark-mode parity audit per app

- **Status**: Discovery
- **Purpose**: Every app should look as correct in dark mode as in light. Spot-check audit per app.
- **Effort**: ~1 day per app × 11+ apps = ~11 days, or one batch ~5 day pass with screenshots.
- **Tier**: 3

---

## Section H — Architectural / launch-path items

### H1 — Entity-forms launch path: `mode: 'drawer' | 'modal' | 'tab'`

- **Status**: Sized — architectural
- **Purpose**: Add a launch-mode parameter to `MJDialogService.open(form, ...)` so existing custom forms can be hosted in `<mj-detail-drawer>`, a modal, or a tab without rewriting them.
- **Replaces**: The implicit "modal-for-everything" default, which is one half of the drawer-vs-modal UX inconsistency.
- **Effort**: ~8–10 days (touches the entity-forms launch path, every form's container assumption).
- **DoD**: New parameter shipped; default behavior preserved; can switch one custom form to drawer mode as proof; documentation updated.
- **Risks**: HIGH — entity-forms is a core system; behavior changes risk regressions across all forms.
- **Tier**: 4 (architectural; requires `<mj-detail-drawer>` battle-tested first)

### H2 — `<mj-record-form-container>` adoption

- **Status**: Partial
- **Context**: Per CLAUDE.md, every entity form MUST wrap in `<mj-record-form-container>` (not raw `<mj-form-toolbar>`). Some legacy forms may not comply.
- **Work**: Audit existing custom forms; migrate non-compliant.
- **Effort**: ~3 days.
- **Tier**: 3

---

## Section I — Discovery scope (known unknowns)

These are areas of work that exist but **have not been audited yet**. They will produce many new catalog items once surveyed. Effort here is for the audit itself; sized work emerges from the audit outputs.

### I1 — Workspace pages

- **Pages**: Component Studio, Flow Editor, AI Test Harness, Database Designer, Query Browser, Integration mapping workspace, Conversations, Data Explorer, Entity Relationship Diagram, AI Agent Run Visualization, Kanban board, Gantt chart (12+ pages).
- **Shared needs likely**: Canvas + palette + properties-inspector layouts, save-state indicators, zoom/pan controls, undo/redo, selection state, multi-select operations, drag-and-drop primitives, properties inspectors, status bars, keyboard-shortcut overlays.
- **Audit effort**: ~2 days for a thorough pass.
- **Output**: New catalog section with sized contracts per identified pattern. Likely 10–20 new items.
- **Approach**: Pair with engineers who own each page (don't audit solo).
- **Tier**: 2 (the audit itself; sized items it produces tier individually)

### I2 — Record-detail pages (entity forms)

- **Pages**: Generated entity forms (CodeGen output) + 7+ custom forms (AIAgent, AIPrompt, Action, Template, Test, Test Suite, Test Run, Entity).
- **Shared needs likely**: Record toolbar (Save/Delete/History/Favorite/Tags/Lists), tab sets for field groupings, related-records grids, dirty/save state, validation summary, lookup pickers, inline edit modes, add-to-list panel, tag panel, record-changes diff viewer, resource permissions panel.
- **Audit effort**: ~2 days.
- **Output**: Likely 10–15 new items.
- **Tier**: 2 (the audit; downstream items tier individually)

### I3 — Modal / wizard flows

- **Pages**: New-agent wizard, share dialogs, multi-step creation flows, confirmation wizards.
- **Shared needs likely**: Stepper / progress indicator, validation per step, "next/back" navigation, summary screens, confirmation patterns.
- **Audit effort**: ~1 day.
- **Tier**: 3

### I4 — Embedded / preview modes

- **Context**: MJ Explorer components can be embedded in third-party apps via the `HideToolbar` input pattern. Embedded contexts have different chrome needs.
- **Work**: Audit which components support embedded mode; standardize the input contract.
- **Effort**: ~1 day.
- **Tier**: 4

### I5 — Long tail of unaudited primitives

These exist somewhere in the codebase but haven't been counted:

- Tooltips (variation across the app)
- Popovers (bespoke implementations)
- Context menus (post-Kendo)
- Split buttons (button-with-menu)
- Tag inputs / multi-value inputs
- Sliders / range inputs
- File upload widgets
- Stepper / multi-step progress
- Typeahead / autocomplete (beyond `<mj-page-search>`)
- Time picker (beyond datepicker)
- Duration picker
- Date range picker
- Color picker
- Toggle group / segmented control (beyond `<mj-view-toggle>`)
- Comment thread
- Reaction picker (if used in conversations)
- Compare-side-by-side panels
- Validation summary panels
- Inline help / tour tooltips
- Keyboard shortcut hints overlay
- Schedule / cron picker
- Permission editor / role picker
- Calendar / date range picker
- Notification preferences UI

**Approach**: Add to catalog as discovery surfaces them. No proactive audit; let PR review + repeatable audit scripts identify duplications as they're introduced.

---

## Tier summary

| Tier | What it means | Items |
|---|---|---|
| **1** | Highest priority. Small effort or foundational. Should be next quarterly commitment. | A1, A2, B1, B3, F1, F2, F8 |
| **2** | Medium priority. Lined up after Tier 1. Most of the body-component work. | A3–A10, A8, B2, B4–B6, F3, F4, F11, G1, G3, G4, I1, I2 |
| **3** | Lower priority or heavier design. Some require Tier 1–2 patterns to settle. | A11, A12, A13, B7–B9, C2, C3, D2–D4, E1, E4, F5, F6, F9, F10, G2, G5, G8, H2, I3 |
| **4** | Future / nice-to-have / architectural. | A14, A15, D1, D5–D8, F7, G6, G7, H1, I4 |

---

## Effort summary

| Section | Sized effort (days) | Notes |
|---|---|---|
| A — Body components (A1–A15) | ~80 days | Excludes A12/A13 second-half migrations; partial sizing on A11, A15 |
| B — Form/input primitives (B1–B9) | ~18 days | B9 TBD pending decision |
| C — Pickers | covered by A13 | C2/C3 TBD |
| D — Display/viz | TBD | mostly discovery |
| E — Layout patterns | ~8 days | partial |
| F — Process + CI + Skills | ~12 days | foundational |
| G — Visual identity | ~22 days | high — typography + spacing audits are big |
| H — Architectural | ~10 days | high risk |
| I — Discovery audits | ~6 days for I1+I2+I3 | downstream sizing emerges |

**Catalog total (sized + partial):** ~150–180 person-days of identified work, **before** discovery scope is added.

**Capacity per quarter** (solo, ~80% utilization): ~45 days. So the catalog is roughly a **3–4 quarter program at solo pace**, longer if discovery (Section I) expands scope as expected (likely 30–60+ more days surfaces).

---

## What this catalog is and isn't

**Is:**
- A working contract for what consolidation entails
- A sized estimate of total program effort
- A priority-tiered backlog
- Input to quarterly OKR planning
- A living document that grows with discovery

**Is not:**
- A schedule (no dates here)
- A quarterly plan (that happens elsewhere, drawing from this)
- A finished inventory (Section I will produce more items)
- A solo commitment (engineering partnership is required for I1, I2, A12, A13, H1)

---

## How this feeds the next quarterly OKR

When the next quarter is planned:

1. Confirm available capacity (account for non-program work, vacations, meetings).
2. Apply the 80% rule — commit no more than 80% of capacity; reserve 20% for discovery / overrun.
3. Pick Tier 1 items first; fill remaining committed capacity from Tier 2.
4. Stretch items come from Tier 2/3 — only triggered if committed work is on track at midpoint.
5. Each committed item carries its catalog entry's contract verbatim — same DoD, same risk notes, same effort estimate.
6. End-of-quarter: actual vs. estimated effort feeds back into this catalog's calibration.

---

## Appendix: source artifacts

- `plans/phase-2-kendo-removal.md` — April 15 baseline audit (on `component-standardization-buttons` branch)
- `plans/explorer-chrome-conventions.md` — 993 lines + Section 11 detail-surfaces
- `plans/explorer-ia-progress.md` — per-page chrome migration status
- `packages/Angular/Generic/ui-components/src/lib/` — existing shared component directory
- May 21 wide audit findings (in conversation; to be promoted to a standalone artifact)
