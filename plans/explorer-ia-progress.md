# MJ Explorer · IA Standardization Progress

> **Branch:** `information-architecture` · **Status:** Phase 2.3 in progress · **Last update:** 2026-05-11

> Companion doc to [`plans/explorer-layout-templates.md`](explorer-layout-templates.md) (the layout inventory) and [`plans/phase-2-kendo-removal.md`](phase-2-kendo-removal.md) (the parent plan).

## TL;DR

We're consolidating the dashboard header chrome of MJ Explorer into a small set of shared components in `@memberjunction/ng-ui-components`, then migrating each dashboard to use them. Per-page CSS for the header strip is being deleted as we go — the goal is that future drift is impossible because the styles live in exactly one place.

So far: **6 shared components** built, **28 dashboards** fully migrated (MCP, 6 AI sub-pages, 3 Lists pages, all 5 Communication pages, Scheduling + 3 Scheduling resources, all 5 Credentials pages, File Browser, all 4 Version History pages). **Remaining bespoke headers** in Template A: APIKeys, Settings, Testing + the Template B group.

## Shared components (lives in `@memberjunction/ng-ui-components`)

| Component | Selector | Purpose |
|---|---|---|
| `MJPageLayoutComponent` | `mj-page-layout` | Outer flex-column shell. `--mj-bg-page` background, `overflow: hidden`, full-height. Replaces every dashboard's bespoke `.{name}-container` wrapper. |
| `MJPageHeaderComponent` | `mj-page-header` | Canonical title row. Typed inputs `Title`, `Icon`, `Subtitle`. Three projection slots: `[meta]` (next to title), `[actions]` (right side), `[toolbar]` (secondary row inside same card). Icon uses `--mj-brand-primary` (NOT `--mj-app-accent`) so color is unified across apps. |
| `MJFilterToggleComponent` | `mj-filter-toggle` | Show/hide filters button. Inputs `Active`, `ShowLabel`, `HideLabel`, `Icon`. Output `Toggled`. Replaces 5 different bespoke `.filter-toggle-btn` rules across the codebase. |
| `MJResultCountComponent` | `mj-result-count` | Pill: "X label" or "X of Y label". Inputs `Count`, `Total`, `Label`. Replaces `.item-count`, `.config-count`, etc. |
| `MJFilterPopoverComponent` | `mj-filter-popover` | Trigger button (filter icon + label + active count badge) that opens a CDK Overlay popover. Inputs `Label`, `Icon`, `ActiveCount`, `ShowClearAll`. Output `ClearAllRequested`. Content projected via `<ng-content>`. **Prototype** for the unified-filter-placement direction. |

All 5 are standalone, design-token-only, PascalCase API.

## Pages migrated

| Page | Layout shell | Header | Filter button | Count pill | Filter popover | Notes |
|---|---|---|---|---|---|---|
| MCP | ✅ | ✅ | ✅ | ✅ | n/a (uses tabs) | Tabs + per-tab actions in `[actions]` slot. Action buttons set `size="sm"` to align with tab strip. |
| Agents | ✅ | ✅ | ✅ | ✅ | ❌ (sidebar still) | Filter panel still in left sidebar via `as-split`. Eligible for popover migration. |
| Agent Requests | ✅ | ✅ | n/a | n/a | n/a | Header has search input + pending-count badge in `[actions]`. |
| Prompts | ✅ | ✅ | ✅ | ✅ | ❌ (sidebar still) | Same sidebar pattern as Agents. |
| Models | ✅ | ✅ | ✅ | ✅ | ❌ (sidebar still) | Same sidebar pattern. |
| AI Configuration | ✅ | ✅ | ✅ | ✅ | ❌ (sidebar still) | Same sidebar pattern. |
| Analytics | ✅ | ✅ | n/a | n/a | ✅ (prototype) | Shell owns filter-bar in `[actions]`; `FilterBarConfig` getter switches Show flags per `ActiveSection`. ExportClicked / CompareToggled forwarded to active section via `@ViewChild`. Model Performance keeps its custom inline filter-bar (`ShowSharedFilterBar = false` carve-out). |
| Lists — Browse | ✅ | ✅ | ✅ | ✅ | ✅ | Config-driven `<mj-filter-panel>` (Category dropdown + Status chip group); `<mj-view-toggle>` for grid/list; mjButton "New List" in `[actions]`. Body container restored to `flex: 1; min-height: 0; padding: 0 24px 24px`. |
| Lists — Operations | ✅ | ✅ | n/a | n/a | n/a | Header only; KPI grid + tables in body. |
| Lists — Categories | ✅ | ✅ | n/a | n/a | n/a | Header only; tree/table content in body. |
| Communication — Logs | ✅ | ✅ | ✅ | ✅ | ✅ | Earlier session — popover with date range + status chips. |
| Communication — Templates | ✅ | ✅ | n/a | n/a | n/a | Earlier session — card grid + search. |
| Communication — Monitor | ✅ | ✅ | n/a | n/a | n/a | KPI strip + content grids; `loadData()` refresh button in `[actions]`. |
| Communication — Providers | ✅ | ✅ | n/a | n/a | n/a | Provider card grid; "Add Provider" primary action. |
| Communication — Runs | ✅ | ✅ | n/a | n/a | n/a | Summary stat trio + run timeline; Refresh button. |
| Scheduling (parent dashboard) | ✅ | ✅ | n/a | n/a | n/a | Sidebar dropped — converted to `<mj-tab-nav>` in `[actions]` slot like MCP. Healthy/Alerts pill in `[meta]`. Jobs tab badge bound to `ActiveJobCount`. |
| Scheduling — Overview (resource) | ✅ | ✅ | n/a | n/a | n/a | Deep-link resource wrapper around `<app-scheduling-overview>`. |
| Scheduling — Jobs (resource) | ✅ | ✅ | n/a | n/a | n/a | Deep-link resource wrapper around `<app-scheduling-jobs>`. |
| Scheduling — Activity (resource) | ✅ | ✅ | n/a | n/a | n/a | Deep-link resource wrapper around `<app-scheduling-activity>`. |
| Credentials — Overview | ✅ | ✅ | n/a | n/a | n/a | Refresh + "New Credential" in `[actions]`. No filters. |
| Credentials — List | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Type + Status; view-toggle (grid/list); result-count + expiring/expired pills in `[meta]`. |
| Credentials — Types | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Category (filterable); result-count + neutral pills (categories / credentials) in `[meta]`. |
| Credentials — Categories | ✅ | ✅ | n/a | n/a | n/a | Expand/Collapse + Refresh + "New Category" in `[actions]`. Search in `[toolbar]`. |
| Credentials — Audit Log | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Status + Operation + DateRange; view-toggle (timeline/table); Export + Refresh in `[actions]`. |
| File Browser | ✅ | ✅ | n/a | n/a | n/a | Generic-package wrapper (`@memberjunction/ng-file-storage`). Resource component adds page-header chrome; inner `<mj-file-browser>` keeps its bespoke 2-panel layout + grid toolbar (shared with `file-browser-demo`). |
| Version History — Labels | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Scope + Status; view-toggle (card/list); result-count in `[meta]`; Create Label + Refresh in `[actions]`. |
| Version History — Diff Viewer | ✅ | ✅ | n/a | n/a | n/a | Minimal chrome — page is a configurator (mode selector + label dropdowns + Compare button), with results toolbar that lives in the body. |
| Version History — Restore History | ✅ | ✅ | ✅ | n/a | n/a | result-count in `[meta]`; quick-filter chips (Complete / Error / Partial) in `[toolbar]`; Refresh in `[actions]`. |
| Version History — Dependency Graph | ✅ | ✅ | n/a | n/a | n/a | Three stat badges (entities / with dependents / relationships) in `[meta]`; Refresh in `[actions]`. Entity list panel keeps its own search + schema chips since they scope to the panel. |

## Pages NOT yet migrated

Per [`plans/explorer-layout-templates.md`](explorer-layout-templates.md):

- **Template A** (sidebar + content): APIKeys, Settings, Testing
- **Template B** (no sidebar): ApplicationRoles, DashboardBrowser, DatabaseDesigner, EntityAdmin, Permissions
- **Documented exceptions** (will NOT be migrated as-is): Home (right-sidebar dashboard), Component Studio (toolbar-driven authoring shell), Data Explorer (workspace), Query Browser (resizable left panel)

The 4 AI exceptions inside the AI app:
- **AI Overview** — hero-section landing layout (large icon + hero typography + stats strip + card grid). Decision to keep deliberate; not a horizontal-bar header.
- **Model Performance** — has its own custom inline filter-bar (sort-by + leaderboard controls), not the shared `app-analytics-filter-bar`.

## Architecture decisions

### 1. `--mj-brand-primary`, not `--mj-app-accent`, for the page-header icon
The `--mj-app-accent` token still exists as a per-app theming hook (not deleted). But every dashboard's icon and active-state highlights resolve against `--mj-brand-primary` directly inside the shared components, so a per-app accent override won't cause icon-color drift. Aligned with the "kill the rainbow" direction in `feedback_unified_brand_color.md`.

### 2. `--mj-bg-page` for the outer shell
Pre-migration, 4 pages used `--mj-bg-surface-card` and 2 used `--mj-bg-page` for their outermost container. We picked `--mj-bg-page` since it's semantically correct for "the page itself"; cards/sections sit on top of it. `<mj-page-layout>` enforces this.

### 3. The `[toolbar]` slot on `mj-page-header`
A second projection slot below the title row, inside the same header card, separated by a subtle border. Hidden when empty. **Use `[actions]` for inline content when there's room; use `[toolbar]` when you need a dedicated row for dense controls.** Currently unused — Analytics' filter-bar lives in `[actions]` because the popover keeps it compact.

### 4. Filter density → popover, not sidebar
Open question we landed on in the prototype: where should filters live? Options were left-sidebar (current Agents/Prompts/Models/Config), top-right inline (Analytics pre-popover), or top-right with progressive disclosure. The prototype demonstrates option 3: a single trigger button + active-count badge + popover panel. Linear/Notion/GitHub convention. Lets dense filter pages live in the same header chrome as light filter pages.

### 5. Shell-owns-filter-bar for sub-section dashboards
For Analytics (a dashboard with internal sub-sections that share filter state): the **shell** renders the filter-bar once with a config getter that switches per active section. Sub-sections become pure presentational components that receive `[TimeRange]` / `[Filters]` as inputs. Section-specific events (`CompareToggled`, `ExportClicked`) forwarded via `@ViewChild`. Pattern is reusable for any multi-section dashboard.

### 6. Slot assignments — what goes where
The three projection slots on `<mj-page-header>` are not interchangeable. Consistent placement across pages is what makes the chrome feel unified.

| Slot | What goes there | What does NOT |
|---|---|---|
| `[meta]` (next to title) | **Status badges**, **result counts** (`X of Y items`), pending-count pills, "Healthy" / "X Alerts" indicators — anything that describes the *state* of the page | Verbs / actions |
| `[actions]` (right of header) | **Verbs**: Refresh, New X, primary CTAs, filter-popover trigger, view-toggle, tab-nav | Result counts / status badges (they belong in `[meta]`) |
| `[toolbar]` (secondary row below title) | **Search input** + **quick-filter chips** that operate on the page's primary dataset. Chips sit *immediately adjacent* to search — they're the same logical control group | Dropdown filters (those belong in the filter popover) |

**Anti-patterns observed mid-migration:**
- Putting `<mj-result-count>` in `[actions]` next to Refresh — count is metadata, not a verb. Move to `[meta]`.
- Pushing time-range chips to the far right of the toolbar with a `flex: 1` spacer — implies they're independent of search. Drop the spacer; let them flow naturally next to the search input.
- Rendering `<select class="mj-input">` dropdowns directly in the toolbar — dense filter UI should live inside `<mj-filter-popover>` + `<mj-filter-panel>`, not flat on the toolbar row.

## Known gotchas

### Vite dev server caching (recurring this session)
MJExplorer's running Vite dev server caches compiled bundles in memory. When you build a workspace dependency (`ng-ui-components` or `ng-dashboards`), the new dist is on disk but **HMR doesn't reliably pick up changes from symlinked workspace packages**. A browser hard-refresh re-fetches from Vite, which still serves the stale cached JS.

**Workaround:** kill and restart MJExplorer after rebuilding `ng-ui-components` or `ng-dashboards`. Hard-refresh alone is not enough.

### Projected-slot wrappers need `display: contents`
This bites every page migration. `mj-page-header`'s `[meta]` / `[actions]` / `[toolbar]` slots each apply `display: flex; gap: var(--mj-space-3)` so the projected children sit side by side with proper spacing. But if you wrap your projection in a `<div meta>` / `<div actions>` / `<div toolbar>` for code organization, that wrapper becomes the SINGLE flex child of the slot — the gap is consumed by the wrapper itself, not the buttons/popover/inputs inside it. They render squished together.

**Fix:** every wrapper div used as a slot marker must have `display: contents` so it disappears from the box tree and its children become direct flex children of the slot:

```css
.ai-header-actions,
.lists-header-actions,
.mcp-header-actions {
  display: contents;
}
```

Pattern used in MCP / Agents / Prompts / Lists / etc. **Always add this CSS when introducing a new wrapped projection.**

### Old per-page header padding doesn't carry forward
The old bespoke `.X-header` divs typically carried `padding: 16px 24px`, giving the page horizontal breathing room. `<mj-page-header>` only pads ITS OWN card — content below the header has no padding by default. After removing the old header, content (cards, empty states, lists) ends up flush against the viewport edges.

**Fix:** absorb the old header's side+bottom padding into the body container's own padding:

```css
.X-body-container {
  flex: 1;
  min-height: 0;
  padding: 0 24px 24px;  /* restored from the deleted .X-header padding */
}
```

Also switch `height: 100%` → `flex: 1; min-height: 0` so the container fills the remaining flex-column space below the header instead of fighting it.

### Component cards should not double as section cards
The `app-analytics-filter-bar` originally had its own wrapper card styling (border, background, radius). When projected into `mj-page-header`'s actions slot, it became a card-on-card. **Fix:** strip the wrapper styling from any component you intend to project into `mj-page-header`. Now the filter-bar is just a flex group of controls; the page-header provides the surface.

### Tree-dropdown inside CDK Overlay loses positioning
`mj-tree-dropdown` uses `position: fixed` for its panel. CDK Overlay applies `transform` to its overlay-pane when `offsetY` / `offsetX` is set, which creates a containing block for `position: fixed` descendants. Result: the tree-dropdown panel renders relative to the popover, not the viewport — often ~800px off-screen. **Fix:** keep `offsetY` off the popover positions and provide spacing via CSS `margin-top` on the panel.

### ExpressionChangedAfterItHasBeenCheckedError risk
Inputs with default values that are objects (e.g., `Filters: GlobalFilterState = { Models: [], ... }`) and bound to component getters (e.g., `[ActiveCount]="ActiveFilterCount"`) can occasionally fire the dreaded `ExpressionChangedAfterItHasBeenCheckedError` if the getter is read during change-detection AND the input is mutated. Not seen yet in this work, but worth watching.

## Per-page migration checklist

Run this against every page you migrate. Items 1–4 are the structural swap; 5–9 are the gotchas above that always trip migrations.

1. **Inventory** — find any existing `mj-{x}-filter-panel` component for this page. If present, delete it; we use the centralized `<mj-filter-panel>` config-driven approach now.
2. **Wrap the outer container** in `<mj-page-layout>`.
3. **Add `<mj-page-header>`** at top with `Title` / `Icon` / optional `Subtitle`. Slot assignment (see Gotcha #6 for the full rules):
   - `[meta]` → result-count, status/health badges, pending-count pills — **state of the page**
   - `[actions]` → Refresh, primary CTA, filter-popover trigger, view-toggle, tab-nav — **verbs / interactive controls**. Refresh buttons use `mjButton variant="secondary" size="sm"` so they read as visible affordances against the white header (variant="flat" disappears on white).
   - `[toolbar]` → `<mj-page-search>` + quick-filter chips **adjacent to search** (no `flex: 1` spacer between them — chips share the search's logical scope)
   - Dense dropdown filters live in `<mj-filter-popover>` in `[actions]`, NOT flat in `[toolbar]`
4. **Config-driven filter panel** — define `xxxFilterFields: FilterFieldConfig[]`, `xxxFilterValues: Record<string, unknown>`, `onFilterValuesChange(values)`, `resetPopoverFilters()`, and `ActiveFilterCount` getter (excluding searchTerm). For custom widgets (tree-dropdown, range inputs), use projected `<mj-filter-field>` as escape hatch.
5. **`display: contents`** on every wrapper div used as a slot marker (`.xxx-header-actions`, `.xxx-header-meta`, `.xxx-header-toolbar`). Without this, gap between projected children is consumed by the wrapper.
6. **Body container needs padding restored.** Add `padding: 0 24px 24px` (or the equivalent) to absorb what the old `.x-header` used to carry. Change `height: 100%` → `flex: 1; min-height: 0` so it fills remaining flex space.
7. **Module imports** — add the shared components to the dashboards module's `imports:` array. Common omissions: `MJButtonDirective`, `MJPageSearchComponent`, `MJFilterPanelComponent`, `MJFilterFieldComponent`, `MJViewToggleComponent`.
8. **Delete orphan CSS** — bespoke `.X-header`, `.filter-toggle-btn`, `.item-count`, `.view-toggle`, `.view-btn`, `.tab-nav`, `.tab-btn`, `.search-box`, `.search-input-wrapper`, `.filter-chip`, `.filter-bar`, `.filter-group`, `.filter-select` rules should all go.
9. **MJExplorer restart required** after each rebuild of `ng-ui-components` — Vite HMR doesn't pick up symlinked workspace package changes. Hard-refresh alone is not enough.

## Next steps (priority order)

### A. Roll out popover to high-filter pages
Currently Agents / Prompts / Models / Configuration use a left-sidebar filter panel via `as-split`. The popover prototype proves the alternative pattern works. **Decision needed**: do we replace those sidebars, or keep sidebars for those pages and use popover only where it fits naturally? If replacing:
1. Build a generic filter-form component or use the existing `mj-{x}-filter-panel` components inside `mj-filter-popover`
2. Remove the `as-split` sidebar layout from each page
3. Wire active count + clear-all

### B. Remaining Template A/B dashboards
6 Template A + 5 Template B dashboards still use bespoke headers. Mechanical migration:
1. Wrap outer container in `<mj-page-layout>`
2. Replace bespoke header with `<mj-page-header>`
3. Replace any filter-toggle / item-count usages
4. Delete orphaned per-page CSS

### C. Resolve Overview + Model Performance exceptions
- **Overview**: hero-section → `<mj-page-header>` is a redesign, not a swap. Confirm with user before doing it.
- **Model Performance**: its custom sort/leaderboard filter is fundamentally different from the shared analytics-filter-bar. Probably leave alone or build a separate "leaderboard-filter" component.

### D. Phase 2.2 carry-overs (from `plans/phase-2-kendo-removal.md`)
Not part of header chrome, but adjacent:
- `<mj-empty-state>` component (61 ad-hoc empty-state implementations)
- `<mj-confirm-dialog>` consolidation
- `SelectorDialog<T>` base class
- Card CSS consolidation (61 → `.mj-card`)

### E. Verification
- Visual / UAT pass on every migrated page (after MJExplorer restart so Vite picks up the new bundles)
- Make sure dark mode still works for all the new components
- Test responsive behavior at 768px and below (page-header has a media query that switches title row to column)

## File map (this session's changes)

### New
- `packages/Angular/Generic/ui-components/src/lib/page-header/` — `page-header.component.ts`, `page-header.scss`
- `packages/Angular/Generic/ui-components/src/lib/page-layout/page-layout.component.ts`
- `packages/Angular/Generic/ui-components/src/lib/filter-toggle/filter-toggle.component.ts`
- `packages/Angular/Generic/ui-components/src/lib/result-count/result-count.component.ts`
- `packages/Angular/Generic/ui-components/src/lib/filter-popover/filter-popover.component.ts`

### Modified
- `packages/Angular/Generic/ui-components/src/public-api.ts` — exports added
- `packages/Angular/Generic/ui-components/package.json` — copy-assets includes `page-header.scss`
- `packages/Angular/Explorer/dashboards/src/MCP/` — `mcp.module.ts`, `mcp-dashboard.component.{html,css}`
- `packages/Angular/Explorer/dashboards/src/ai-dashboards.module.ts` — added 5 new component imports
- `packages/Angular/Explorer/dashboards/src/AI/components/agents/agent-configuration.component.{html,css}`
- `packages/Angular/Explorer/dashboards/src/AI/components/requests/agent-requests-resource.component.{html,css}`
- `packages/Angular/Explorer/dashboards/src/AI/components/prompts/prompt-management.component.{html,css}`
- `packages/Angular/Explorer/dashboards/src/AI/components/models/model-management.component.{html,css}`
- `packages/Angular/Explorer/dashboards/src/AI/components/system/system-configuration.component.{html,css}`
- `packages/Angular/Explorer/dashboards/src/AI/components/analytics/ai-analytics-resource.component.ts` — page-layout/header migration + shell-owns-filter-bar
- `packages/Angular/Explorer/dashboards/src/AI/components/analytics/analytics-filter-bar.component.ts` — popover refactor
- 6 Analytics sub-section components (executive-summary / prompt-runs / agent-runs / cost-budget / error-analysis / usage-patterns) — removed inline `<app-analytics-filter-bar>` block

## References

- [`plans/phase-2-kendo-removal.md`](phase-2-kendo-removal.md) — parent plan; this work is Phase 2.3
- [`plans/explorer-layout-templates.md`](explorer-layout-templates.md) — layout inventory (Templates A/B + 4 documented exceptions)
- [`plans/complete/design-mockups/`](complete/design-mockups/) — canonical design system reference
