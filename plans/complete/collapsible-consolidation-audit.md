# Collapsible / Expand-Collapse Consolidation — Backlog

Goal: migrate every genuine "click a header to reveal a content-sized body" surface in
`packages/Angular/**` onto the canonical **`<mj-accordion-panel>`** (`@memberjunction/ng-ui-components`).
This is the actionable, **per-instance** backlog behind that goal.

> **Status (2026-06-30):** The OKR (11 named sections → accordion) is **DONE** and shipped, along
> with the `MJAccordionModule` consolidation + `[mjAccordionBody]` lazy-body sweep. This doc is the
> *forward* backlog — everything else that could move onto the component now that it's feature-complete.

## What changed since the first audit
The original audit (same file, prior version) listed "feature gaps to close" before the bulk
migration could happen. **Those gaps are now all shipped**, which unblocks most of the backlog:

| Gap (then) | Now |
|---|---|
| `[headerActions]` slot | ✅ `<ng-template mjAccordionActions>` |
| `[FlushBody]` | ✅ shipped |
| `[Size]` (sm/md) | ✅ shipped |
| heavy-body deferral | ✅ `<ng-template mjAccordionBody>` (lazy on first expand, kept alive for animation) |
| rail "owns leftover height" | ✅ `[Fill]` |
| badge / muted icon / variant | ✅ `.mj-accordion-badge`, `[TitleIconMuted]`, `[Variant]` |

So the component can now absorb the header-action, code-editor-body, and fill-pane-section cases
the first pass had to defer.

## Method
Behavior-based re-scan (not class-name): files containing a chevron/caret icon
(`fa-chevron|fa-caret|fa-angle`) **AND** an expand/collapse signal (`(click)` toggle, `[class.expanded|collapsed]`,
`isExpanded`, `*SectionExpanded`, `expandedSections`), minus files already on `mj-accordion-panel`.
**143 candidate files → 13 already on the accordion → 130 bespoke**, classified per-instance by 5 parallel
read-only agents.

## Headline tally (instance-level)
| Bucket | ~Instances | Target | In this backlog? |
|---|---|---|---|
| **ACCORDION** (header → content body) | **~79** | `mj-accordion-panel` | ✅ YES — the work |
| **TREE** (recursive node expanders) | ~23 | `mj-tree` (exists) | ❌ out of scope |
| **FILL-PANE / RAIL** (pane/sidebar collapse, flex-fill) | ~17 | layout primitive / `angular-split` | ❌ out of scope* |
| **`mj-collapsible-panel`** (form-coupled disclosure) | 1 component + ~13 consumers | converge → `mj-accordion-panel` | ✅ separate track |
| **FALSE-POSITIVE** (dropdown/menu/popover/tab/sort-caret/expand-all/`<tr>`-detail/splitter/show-more/edit-swap) | ~50 | route to existing primitives, or N/A | ❌ leave alone |

\* Exception: a *single section inside a rail* that owns leftover height IS an accordion with `[Fill]`
(that's exactly what unblocked OKR #1/#11). A *whole pane/sidebar* collapsing to a strip is layout.

## Method validation (chevron cross-check)
The 3-stage filter could in principle drop a genuine collapsible whose toggle is named differently than the
stage-2 regex. We cross-checked against the **chevron** idiom (the disclosure tell) to rule that out:

- **Chevron is already the dominant signal:** of the 130 candidates, **124 use `fa-chevron`**; only 6 are
  `fa-caret`-only, 0 `fa-angle`-only. Narrowing the scan to chevron-only would change the list by ≤6 — caret/angle
  were not inflating it.
- **A raw `fa-chevron` grep returns 169 files** — but ~45 of those chevrons are *non-disclosure* idioms, which is
  exactly why the stage-2 state-signal filter is required (chevron alone over-counts by ~36%).
- **We triaged all 33 chevron files the state-filter dropped** (169 − 124 in-set − 12 already-canonical). Every
  one is a correct exclusion: reorder arrows (`chevron-up/down` = MoveUp/MoveDown), breadcrumb separators, a sort
  caret, diff-chunk nav, dropdown/combobox/popover open-states, trees, whole-panel collapse, and a dead mockup.
  **Zero false-negatives** — so the ~79-target backlog is complete from the chevron angle.

> Reusable lesson: don't migrate on a bare `fa-chevron` grep — pair the icon with a real expand/collapse **state
> signal** and subtract reorder/sort/breadcrumb/dropdown/tree idioms, or you'll over-count by a third.

---

# The ACCORDION migration backlog (~79 instances)

Ranked by leverage. Effort: **S** = drop-in clean accordion · **M** = needs a feature slot or CSS cleanup · **L** = structural/risky.

## ⭐ Batch clusters (highest leverage — identical pattern repeated)
Migrate these as a single PR each; one pattern, many files.

### B1 — Settings list-page cards (4 files + 1 reusable base) · M
Identical bespoke `*-header (click)="toggle*Expansion"` + `@if(is*Expanded)` body with edit/delete actions
and a status/access badge in the header. All need `mjAccordionActions` + `badge`.
- `explorer-settings/src/lib/shared/settings-card.component.ts` (7–22) — **the reusable base; do this first (S)**; converging it ripples to every `<mj-settings-card>` consumer.
- `explorer-settings/src/lib/application-management/application-management.component.html` (77–116)
- `explorer-settings/src/lib/entity-permissions/entity-permissions.component.html` (89–141)
- `explorer-settings/src/lib/role-management/role-management.component.html` (85–134)
- `explorer-settings/src/lib/user-management/user-management.component.html` (140–209)

### B2 — APIKeys scope-category lists (3 files) · M
Identical scope-category collapsible with an in-header "All" checkbox (`mjAccordionActions`) + count `badge`.
- `dashboards/src/APIKeys/api-applications-panel.component.html` (258–329)
- `dashboards/src/APIKeys/api-key-create-dialog.component.html` (116–156)
- `dashboards/src/APIKeys/api-key-edit-panel.component.html` (242–290)

### B3 — dashboard-viewer config panels (3 files) · S/M
"Display Options" / "Advanced Filtering" collapsibles — the cleanest drop-ins in the codebase.
- `dashboard-viewer/src/lib/config-panels/artifact-config-panel.component.html` (96–142) · S
- `dashboard-viewer/src/lib/config-panels/query-config-panel.component.html` (55–159) · S
- `dashboard-viewer/src/lib/config-panels/view-config-panel.component.html` (74–223, 225–261) · M (`mjAccordionBody`)

### B4 — DevTools group/entity disclosures (3 files) · M
Click a group/entity header → reveal a table / payload / code editor. Need `mjAccordionBody` + `Size=sm` + `badge`.
- `dashboards/src/DevTools/class-registry.component.html` (57–114)
- `dashboards/src/DevTools/event-monitor.component.html` (159–186) — + `mjAccordionActions` (copy)
- `dashboards/src/DevTools/graphql-console.component.html` (131–188, 319–336) — CodeMirror body

### B5 — VersionHistory diff / snapshot groups (2 files) · M
Entity-group header → diff/snapshot items; `badge` (added/removed/modified counts) + `mjAccordionBody`.
- `dashboards/src/VersionHistory/components/diff-resource.component.html` (159–185, 190–241)
- `versions/src/lib/label-detail/label-detail.component.html` (346–388, 501–545)

### B6 — "Advanced Options" form toggles (1 file, 3 instances) · M
- `Testing/src/lib/components/test-run-dialog.component.ts` (100–155, 158–262, 378–482) — clean + badge + Size=sm

## Single drop-ins — S (do anytime)
- `dashboards/src/AI/components/autotagging/components/classify-org-context-editor.component.html` (1–33) — badge (dirty pill)

## Single targets — M
- `explorer-core/src/lib/about/about-dialog.component.ts` (92–130) — clean + `mjAccordionBody` (diag panel)
- `explorer-settings/src/lib/sql-logging/sql-logging.component.html` (36–110) — Statistics grid
- `explorer-settings/src/lib/user-app-config/user-app-config.component.html` (49–95, 98–186) — badge
- `core-entity-forms/.../AIPromptRuns/chat-message-viewer.component.html` (49–79, 96–112) — mjAccordionActions + Size=sm + badge
- `core-entity-forms/.../Entities/entity-form.component.html` (237–241 clean; 437–443 badge + Size=sm)
- `core-entity-forms/.../Tests/test-suite-form.component.html` (500–516) — Analytics "Filters"
- `dashboards/src/AI/components/analytics/error-analysis/error-analysis.component.ts` (110–159) — badge (collapsed-preview wrinkle)
- `dashboards/src/AI/components/autotagging/tabs/pipeline-tab.component.html` (252–318) — `FlushBody`
- `dashboards/src/AI/components/execution-monitoring.component.ts` (365–466) — `mjAccordionBody` (charts)
- `dashboards/src/APIKeys/api-applications-panel.component.html` (37–110) — badge + mjAccordionActions
- `dashboards/src/Actions/components/actions-overview.component.html` (181–222) — `mjAccordionBody` (params editor)
- `dashboards/src/ApplicationRoles/application-roles-resource.component.html` (60–145) — badge
- `dashboards/src/ComponentStudio/components/artifact-load-dialog.component.html` (285–302) — `mjAccordionBody` (code)
- `dashboards/src/ComponentStudio/components/browser/component-browser.component.html` (148–273) — mjAccordionActions + badge
- `dashboards/src/Credentials/components/credentials-audit-resource.component.html` (144–230) — `<div>` timeline rows, Size=sm
- `dashboards/src/Home/home-dashboard.component.html` (358–524) — Add-Pin sections, badge + Size=sm
- `dashboards/src/Integration/components/activity/activity.component.html` (112–169) — `<div>` rows, `mjAccordionBody`
- `dashboards/src/Integration/components/widgets/run-history-panel.component.ts` (90–101) — Error Details, nested
- `dashboards/src/Permissions/user-access-resource.component.html` (56–107) — badge + `mjAccordionBody`
- `dashboards/src/SystemDiagnostics/system-diagnostics.component.ts` (837–868 Variant/severity; 1244–1263 Size=sm)
- `dashboards/src/Testing/components/testing-review.component.ts` (134–225) — mjAccordionActions + `mjAccordionBody`
- `dashboards/src/Testing/components/widgets/test-run-detail-panel.component.ts` (66–82) — JSON viewer body
- `dashboards/src/VersionHistory/components/restore-resource.component.html` (82–164) — mjAccordionActions (progress)
- `agents/src/lib/components/create-agent-panel.component.html` (134–227) — Advanced Configuration
- `artifacts/.../data-requirements-viewer.component.html` (60–137, 151–270) — entity/query cards, mjAccordionActions
- `clustering/src/lib/cluster-config-panel.component.html` (48–67) — Size=sm; cluster-scatter (240–263)
- `data-context/src/lib/ng-data-context.component.html` (64–169) — mjAccordionActions + badge + FlushBody
- `entity-viewer/src/lib/aggregate-panel/aggregate-panel.component.html` (8–67) — Size=sm + mjAccordionActions (spinner)
- `filter-builder/src/lib/filter-builder/filter-builder.component.html` (65–80) — badge + mjAccordionBody
- `record-tags/src/lib/record-tags.component.html` (66–120) — Related Records, badge + mjAccordionBody
- `resource-permissions/src/lib/user-sharing-center.component.html` (44–65, 79–108) — domain groups
- `search/src/lib/search-filter.component.html` (18–72) — mjAccordionActions + mjAccordionBody
- `search/src/lib/search-results.component.html` (51–74) — results group, badge + mjAccordionBody
- `conversations/.../active-tasks/active-tasks-panel.component.ts` (15–34) — badge
- `conversations/.../realtime/realtime-delegation-card.component.html` (34–96) — clean + mjAccordionActions + badge

## Structural — L (need a design decision before touching)
**Card-grid expanders** — header-click reveals a supplementary detail section while the rest of the card stays
visible in a responsive grid. Genuine disclosures, but a full-width `mj-accordion-panel` row would destroy the
grid. **Decide: an "expandable-card" convention (accordion in `[Bare]` mode inside the card) vs. leave as-is.**
- `dashboards/src/AI/components/agents/agent-configuration.component.html` (81–144)
- `dashboards/src/AI/components/models/model-management.component.html` (86–172)
- `dashboards/src/AI/components/prompts/prompt-management.component.html` (72–155)
- `dashboards/src/AI/components/system/system-configuration.component.html` (71–225)
- `dashboards/src/Actions/components/explorer/action-card.component.html` (56–58, 78–130)
- `dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.html` (492–528, 592–628)

**Embedded in drag / virtual-scroll / parent-owned-body contexts:**
- `core-entity-forms/.../Tests/test-suite-run-form.component.html` (530–581) — inline feedback in card
- `dashboards/src/Integration/components/widgets/integration-card.component.ts` (75–78) — body lives in parent
- `conversations/.../agent/agent-process-panel.component.ts` (36–90) — fixed-position chrome
- `conversations/.../conversation/conversation-list.component.ts` (79–158) — sidebar sections in custom chrome
- `clustering/src/lib/cluster-config-panel.component.html` (7–21) — draggable header + FlushBody
- `record-changes/src/lib/ng-record-changes.component.html` (182–328) — timeline cards (virtual scroll)
- `search/src/lib/search-results.component.html` (81–192) — result card detail
- `timeline/src/lib/component/timeline.component.html` (56–98) — time-segment header

---

# Separate track: `mj-collapsible-panel` → `mj-accordion-panel` convergence
`mj-collapsible-panel` (`base-forms/src/lib/panel/collapsible-panel.component.html`) is the form-coupled
disclosure component with **weaker a11y** (`<div role=button>`, no `aria-expanded`). It has **~13 consumers**
(the core-entity-forms that correctly use it today). Converging it onto `mj-accordion-panel` is a single
a11y win across every form section — but it's a coordinated change (API shim or sweep), so it's its own track,
not part of the per-instance backlog above.

---

# Out of scope (do NOT make these accordions)

### TREE → `mj-tree` (~23)
Recursive/nested node expanders. Examples: APIKeys scope tree, Actions category trees (list-view, tree-panel),
Credentials categories, Lists category trees (browse/categories/my-lists), QueryBrowser query tree, Testing
suite-tree, Duplicates dep-entity→records, conversations collection-tree / folder-tree / collection-picker,
deep-diff items, file-storage category-tree, action-gallery categories, ai-test-harness execution tree,
ai-agent-run-step-node, component-feedback tree, left-nav nav-tree, label-detail dependency tree, `mj-tree` itself.

### FILL-PANE / RAIL → layout primitive / `angular-split` (~17)
Whole pane/sidebar/overlay collapses (not content disclosure). Examples: ComponentStudio dashboard panes,
FormBuilder rails/cockpit, action-tree-panel rail, both ComponentStudio artifact-dialog filter strips,
agent-configuration slide-in, execution-monitoring split, Home Quick-Access sidebar, chat-overlay,
realtime-activity-rail, realtime-surface-tabs, collections-full-view navigator, agent-process-panel minimize,
cluster-scatter detail slide-in, left-nav mobile drawer.

### FALSE-POSITIVE (~50) — route elsewhere or leave
Dropdown/combobox/menu/popover triggers (→ `mj-dropdown`/`mj-combobox`/`mj-filter-popover`), "Expand/Collapse ALL"
buttons, sort carets, `<tr>` master-detail row expanders (run-history, scheduling-activity), splitter handles,
edit-mode swaps, wizard step nav, tab/segment strips, "Show N more"/read-more text-truncation toggles,
view-mode toggles, and each UI primitive's own trigger chevron (datepicker, dropdown, filter-popover). Plus the
dead `slack-style-agent-chat-v22.html` prototype.

---

# Suggested sequencing
1. **B3** (dashboard-viewer config panels) — cleanest drop-ins, proves the pattern. ½ day.
2. **B1** (settings-card base + 4 list pages) — one reusable component change ripples widest. ~1 day.
3. **B2 / B4 / B5 / B6** — the other batch clusters, one PR each.
4. Sweep the **single M targets** by area (group by package to share module/import edits + screenshot runs).
5. **Decide the expandable-card convention**, then do the L card-grids together.
6. Separately: **`mj-collapsible-panel` convergence** (a11y win, coordinated change).
7. Leave trees on `mj-tree`; route dropdowns/popovers to existing primitives; build a rail/splitter primitive
   for the fill-pane set if/when that becomes its own initiative.

> Per-instance source tables for all 130 files are preserved in the audit run; the backlog above is the
> deduplicated, ranked view. Re-run the discovery scan in the repo root to refresh counts:
> `grep -rlE 'fa-chevron|fa-caret|fa-angle' packages/Angular --include="*.html" --include="*.ts" | grep -v /dist/`
</content>
</invoke>
