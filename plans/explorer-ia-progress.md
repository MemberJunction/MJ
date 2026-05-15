# MJ Explorer · IA Standardization Progress

> **Branch:** `explorer-header-consolidation` (active) · **Status:** Phase 2.3 mostly complete · **Last update:** 2026-05-15

> Companion doc to [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) (the rules) and [`plans/phase-2-kendo-removal.md`](phase-2-kendo-removal.md) (the parent plan).

## TL;DR

We're consolidating the dashboard header chrome of MJ Explorer into a small set of shared components in `@memberjunction/ng-ui-components`, then migrating each dashboard to use them. Per-page CSS for the header strip is deleted as we go — the goal is that future drift is impossible because the styles live in exactly one place.

So far: **14 shared chrome components** built (page-layout, page-header, page-body, page-search, tab-nav, view-toggle, filter-popover, filter-panel, filter-field, filter-chip, filter-toggle, result-count, stat-badge, refresh-button) — all in `@memberjunction/ng-ui-components`. **~65 dashboards** fully migrated. **Remaining unmigrated pages are documented exceptions** — see Section 9 of [chrome-conventions.md](explorer-chrome-conventions.md) for the canonical list (single-page exceptions like Home / Component Studio / Data Explorer / Query Browser / AI Overview, plus shell-with-left-nav sub-pages — the 5 explorer-settings components, `ApplicationRolesResource`, `SystemDiagnosticsResource`, and APIKeys' internal tabs — which are deferred pending the Section 10 decision).

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
| MCP | ✅ | ✅ | ✅ | ✅ | n/a (uses tabs) | Tabs + per-tab actions in `[actions]`. Body: `<mj-page-body [Flex]="true">` is sole wrapper; old `.main-content` / `.content-area` / `.content-body` and `.filter-panel-container` / `.resize-handle` CSS removed. Scale-mode toggle (Tools tab) hoisted from body to `[actions]`. |
| Agents | ✅ | ✅ | ✅ | ✅ | ✅ | `[actions]`: filter-popover → view-toggle → New Agent (state→primary). Body: `<mj-page-body [Flex]="true">`; old `.main-content` + `.agents-content` wrappers and CSS removed. |
| Agent Requests | ✅ | ✅ | n/a | n/a | n/a | filter-popover in `[actions]`, search in `[toolbar]`, pending-count pill in `[meta]`. Wrapped content in `<mj-page-body>` (previously had no body wrapper at all). |
| Prompts | ✅ | ✅ | ✅ | ✅ | ✅ | `[actions]`: filter-popover → view-toggle → New Prompt (conditional). Body: `<mj-page-body [Flex]="true">`; `.main-content` + `.prompts-content` removed. |
| Models | ✅ | ✅ | ✅ | ✅ | ✅ | `[actions]`: filter-popover → view-toggle → New Model. Body: `<mj-page-body [Flex]="true">`; `.main-content` + `.content-area` removed. |
| AI Configuration | ✅ | ✅ | ✅ | ✅ | ✅ | `[actions]`: filter-popover → view-toggle. Body: `<mj-page-body [Flex]="true">`; `.main-content` + `.configurations-content` removed. |
| Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | Shell owns filter-bar in `[actions]`; `FilterBarConfig` getter switches Show flags per `ActiveSection` — every section including Model Performance (which contributes SortBy + Vendor filters) goes through the shared chrome now. NG8011 warnings fixed. Body wrapped in `<mj-page-body [Padding]="false" class="analytics-shell">` for flush sidebar layout (TBD on row-direction `mj-page-body`). |
| Lists — Browse | ✅ | ✅ | ✅ | ✅ | ✅ | Config-driven `<mj-filter-panel>` (Category dropdown + Status chip group); `<mj-view-toggle>` for grid/list; mjButton "New List" in `[actions]`. Body: `<mj-page-body>`; removed `.lists-browse-container` wrapper + dead `.result-count` rule (count already lives in `[meta]`). Sort dropdown kept in body (sort UI is TBD in conventions). |
| Lists — Operations | ✅ | ✅ | n/a | n/a | n/a | Conditional Clear button in `[actions]`. Body: `<mj-page-body>`; removed `.operations-container` wrapper. Inner split-pane (selection + result panels) preserved. |
| Lists — Categories | ✅ | ✅ | n/a | n/a | n/a | "New Category" primary in `[actions]`. Body: `<mj-page-body>`; removed `.lists-categories-container` wrapper. Tree + detail-panel split inside body unchanged. |
| Communication — Logs | ✅ | ✅ | ✅ | ✅ | ✅ | Popover with date range + status chips. Body: `<mj-page-body [Flex]="true">` with inner `.logs-card` wrapper (renamed from `.logs-body`) so the table sits in a tinted card and fills available height. |
| Communication — Templates | ✅ | ✅ | n/a | n/a | n/a | Card grid + search. Body: `<mj-page-body>`. |
| Communication — Monitor | ✅ | ✅ | n/a | n/a | n/a | KPI strip + content grids; `loadData()` refresh button in `[actions]`. Body: `<mj-page-body>`. |
| Communication — Providers | ✅ | ✅ | n/a | n/a | n/a | Provider card grid; "Add Provider" primary action. Body: `<mj-page-body>`. |
| Communication — Runs | ✅ | ✅ | n/a | n/a | n/a | Summary stat trio + run timeline; Refresh button. Body: `<mj-page-body>`. |
| Scheduling (parent dashboard) | ✅ | ✅ | n/a | n/a | n/a | Sidebar dropped — converted to `<mj-tab-nav>` in `[actions]` slot like MCP. Healthy/Alerts pill in `[meta]`. Jobs tab badge bound to `ActiveJobCount`. |
| Scheduling — Overview (resource) | ✅ | ✅ | n/a | n/a | n/a | **Inner-owns-chrome.** `<app-scheduling-overview>` renders its own `<mj-page-layout>` + `<mj-page-header>` when standalone, gated by `@if (HideToolbar)`. Refresh + Auto-refresh toggle in `[actions]`. Resource wrapper is a thin shim. |
| Scheduling — Jobs (resource) | ✅ | ✅ | ✅ | ✅ | n/a | **Inner-owns-chrome.** Full chrome owned by `<app-scheduling-jobs>`: result-count in `[meta]`, Refresh + "New Job" in `[actions]`, search + 2 dropdowns (Status / Type) in `[toolbar]`. Resource wrapper is a thin shim. |
| Scheduling — Activity (resource) | ✅ | ✅ | ✅ | ✅ | n/a | **Inner-owns-chrome.** Full chrome owned by `<app-scheduling-activity>`: Refresh in `[actions]`; search + Status + Job dropdowns + time-range `<mj-filter-chip>` group in `[toolbar]`. Resource wrapper is a thin shim. |
| Credentials — Overview | ✅ | ✅ | n/a | n/a | n/a | Refresh + "New Credential" in `[actions]`. No filters. Body: `<mj-page-body>`. |
| Credentials — List | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Type + Status; view-toggle (grid/list); result-count + expiring/expired pills in `[meta]`. Body: `<mj-page-body>`. |
| Credentials — Types | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Category (filterable); result-count + neutral pills in `[meta]`. Body: `<mj-page-body [Flex]="true">` — the inner `.types-layout` grid uses `flex: 1` to fill height, so needs flex-column parent. |
| Credentials — Categories | ✅ | ✅ | n/a | n/a | n/a | Expand/Collapse + Refresh + "New Category" in `[actions]`. Search in `[toolbar]`. Body: `<mj-page-body>`. |
| Credentials — Audit Log | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Status + Operation + DateRange; view-toggle (timeline/table); Export + Refresh in `[actions]`. Body: `<mj-page-body>`. |
| File Browser | ✅ | ✅ | n/a | n/a | n/a | Generic-package wrapper (`@memberjunction/ng-file-storage`). Resource component adds page-header chrome; inner `<mj-file-browser>` keeps its bespoke 2-panel layout + grid toolbar (shared with `file-browser-demo`). |
| Version History — Labels | ✅ | ✅ | ✅ | ✅ | ✅ | Popover for Scope + Status; view-toggle (card/list); result-count in `[meta]`; Create Label + Refresh in `[actions]`. Body: `<mj-page-body>`. |
| Version History — Diff Viewer | ✅ | ✅ | n/a | n/a | n/a | Minimal chrome — page is a configurator (mode selector + label dropdowns + Compare button), with results toolbar that lives in the body. Body: `<mj-page-body>`. |
| Version History — Restore History | ✅ | ✅ | ✅ | n/a | n/a | result-count in `[meta]`; quick-filter chips (Complete / Error / Partial) in `[toolbar]`; Refresh in `[actions]`. Body: `<mj-page-body>`. |
| Version History — Dependency Graph | ✅ | ✅ | ✅ | ✅ | n/a | Three stat badges in `[meta]`; Refresh in `[actions]`; entity-list search + per-schema filter chips hoisted into `[toolbar]`. Body: `<mj-page-body [Flex]="true">` — inner `.graph-layout` grid uses `flex: 1` to fill height. |
| Knowledge Hub — Configuration | ✅ | ✅ | n/a | n/a | n/a | "Unsaved changes" pill in `[meta]`; Reset + Save in `[actions]` (only when dirty). Internal left config-nav kept (settings pattern). Body: `<mj-page-body [Flex]="true">`. |
| Knowledge Hub — Duplicates | ✅ | ✅ | n/a | n/a | n/a | Entity-document selector + "Run Detection" in `[actions]`. Body: `<mj-page-body [Flex]="true">`. |
| Knowledge Hub — Tags | ✅ | ✅ | n/a | n/a | n/a | "Run Tag Health" in `[actions]`. Internal tab-nav left-rail kept (multi-section page with per-tab sub-page header + body). Body: `<mj-page-body [Flex]="true" [Padding]="false">` wrapping `.at-dashboard` sidebar+content flex-row. |
| Knowledge Hub — Classify | ✅ | ✅ | n/a | n/a | n/a | "Run Pipeline" in `[actions]`. Internal tab-nav left-rail kept. Body: `<mj-page-body [Flex]="true" [Padding]="false">` wrapping `.at-dashboard` sidebar+content. |
| Knowledge Hub — Vectors | ✅ | ✅ | n/a | n/a | n/a | View-toggle (Index / Operations) in `[actions]` — only rendered when `!HideToolbar`; shared via `*ngTemplateOutlet` so embedded usage skips the page-header wrapper. Body: `<mj-page-body [Flex]="true">`. |
| Knowledge Hub — Clusters | ✅ | ✅ | n/a | n/a | n/a | "New Analysis" in `[actions]`. Internal Saved-Clusters sidebar kept (selection-of-context pattern). Body: `<mj-page-body [Flex]="true" [Padding]="false">` wrapping `.cluster-viz-container` sidebar+content. |
| Knowledge Hub — Analytics | ✅ | ✅ | n/a | n/a | n/a | Pipeline health pill in `[meta]`. Internal left-nav kept (multi-section page). Body: `<mj-page-body [Flex]="true" [Padding]="false">` wrapping `.analytics-layout` sidebar+content. |
| Knowledge Hub — Pipelines (Scheduling) | ✅ | ✅ | ✅ | ✅ | n/a | Active/paused counts in `[meta]`; "New Schedule" in `[actions]`; search + status dropdown in `[toolbar]`. Body: `<mj-page-body>` (lost max-width: 1200px centering constraint — content now full-width like other migrated pages). **Adds `@Input() HideToolbar`**: KH Configuration's "Scheduling" section embeds this resource; when `HideToolbar=true`, the full `<mj-page-layout>` + `<mj-page-header>` chrome is skipped and an inline controls row (search + status filter + New Schedule) renders above the cards grid. Same pattern as `vector-management-resource`. Fixes a nested-mj-page-layout click-trap bug. |
| Actions — Overview | ✅ | ✅ | ✅ | ✅ | ✅ | Result count in `[meta]`; popover for Status + Type; search in `[toolbar]`. Body: `<mj-page-body>`. |
| Actions — Monitor | ✅ | ✅ | ✅ | ✅ | ✅ | Result count in `[meta]`; popover for Time range + Result + Action (filterable); Refresh in `[actions]`; search in `[toolbar]`. Body: `<mj-page-body>`. |
| Actions — Explorer | ✅ | ✅ | ✅ | ✅ | ✅ | **FULLY HOISTED.** Page-header owns search + active-filter chips in `[toolbar]`, filter-popover + sort dropdown + view-toggle + Refresh + New Action in `[actions]`, result-count in `[meta]`. Body: `<mj-page-body [Flex]="true" [Padding]="false">` — inner `.action-explorer` is a full-bleed sidebar+content flex layout. Sort dropdown + active-filter chips kept bespoke (no shared equivalents yet). |
| Testing (parent dashboard) | ✅ | ✅ | n/a | n/a | n/a | Sidebar dropped — converted to `<mj-tab-nav>` in `[actions]` like Scheduling/MCP. Active-runs pill in `[meta]` when there are running tests; Runs tab gets a warning-variant badge with the active count. Inner components rendered with `[HideToolbar]="true"` so their bespoke headers are gated off (no double-header). |
| Testing — Overview (resource) | ✅ | ✅ | n/a | n/a | n/a | **Inner-owns-chrome.** `<app-testing-dashboard-tab>` renders its own `<mj-page-layout>` + `<mj-page-header>` when standalone (`@if (HideToolbar)` gate); Refresh in `[actions]`. Resource wrapper is a thin shim. |
| Testing — Explorer (resource) | ✅ | ✅ | ✅ | ✅ | n/a | **Inner-owns-chrome.** Full chrome owned by `<app-testing-explorer>`: search in `[toolbar]`; status chips + view-toggle (card/list) + "New Suite" + "New Test" in `[actions]`; result-count in `[meta]`. Display-mode toggle (All / Suites / Tests) and sort indicator kept in body — they're sub-view controls, not page-level chrome. Resource wrapper is a thin shim. |
| Testing — Runs (resource) | ✅ | ✅ | n/a | n/a | n/a | **Inner-owns-chrome.** `<app-testing-runs>` renders its own page-header; Refresh + "Run Test" primary in `[actions]`. Resource wrapper is a thin shim. |
| Testing — Analytics (resource) | ✅ | ✅ | ✅ | n/a | n/a | **Inner-owns-chrome.** `<app-testing-analytics>` renders its own page-header; time-range `<mj-filter-chip>` group + Refresh in `[actions]`. Resource wrapper is a thin shim. |
| Testing — Review (resource) | ✅ | ✅ | n/a | n/a | n/a | **Inner-owns-chrome.** `<app-testing-review>` renders its own page-header; pending-count warning pill in `[meta]`, Refresh in `[actions]`. Resource wrapper is a thin shim. |
| Admin — Identity & Access | ✅ | ✅ | n/a | n/a | n/a | All 4 admin pages share one template (`admin-container.component.html`) via `BaseAdminContainerComponent`. Single template migration ripples to all 4. Body: `<mj-page-body [Flex]="true" [Padding]="false">` wrapping a sidebar+content layout. Deleted bespoke `.admin-container__header*` CSS including a hardcoded `linear-gradient(135deg, #264FAF 0%, #0076b6 100%)` design-token violation. |
| Admin — Data & Schema | ✅ | ✅ | n/a | n/a | n/a | Same shared template as Identity & Access. |
| Admin — Monitoring | ✅ | ✅ | n/a | n/a | n/a | Same shared template as Identity & Access. |
| Admin — Developer Tools | ✅ | ✅ | n/a | n/a | n/a | Same shared template as Identity & Access. |
| Integration — Overview | ✅ | ✅ | ✅ | n/a | n/a | KPI metrics dashboard. Total-integrations pill in `[meta]`; Refresh in `[actions]`. Body: `<mj-page-body>`, kept `max-width: 1440px` on the inner `.overview` for wide-monitor comfort. |
| Integration — Connections (Integrations) | ✅ | ✅ | n/a | n/a | n/a | Refresh in `[actions]`. Body: `<mj-page-body [Flex]="true" [Padding]="false">` — connections grid + detail panel + wizard own their own internal layout. |
| Integration — Schedules | ✅ | ✅ | ✅ | n/a | n/a | Refresh in `[actions]`. Body: `<mj-page-body>`. Removed the duplicated bespoke `.section-header` row that had its own title + Refresh; kept the stat row (counts + locked badge) as `.section-stats` since it's contextual sub-info. |
| Integration — Pipelines | ✅ | ✅ | ✅ | ✅ | ✅ | Pipeline + entity-map counts in `[meta]`; Expand All / Collapse All / Refresh in `[actions]`; `<mj-page-search>` in `[toolbar]`. Body: `<mj-page-body [Flex]="true" [Padding]="false">`. Bespoke `.pipelines-toolbar` row deleted; bridge method `OnGlobalSearchValue(value: string)` added for the `<mj-page-search>` string signal. |
| Integration — Mapping Workspace | ✅ | ✅ | n/a | n/a | n/a | Title + subtitle only (no controls in chrome — all interactions live in the workspace). Body: `<mj-page-body [Flex]="true" [Padding]="false">`. |
| Integration — Activity | ✅ | ✅ | ✅ | ✅ | ✅ | Full chrome: 4 stat badges in `[meta]` (Total / Succeeded / Failed / Records) with success/error color variants. `[actions]`: `<mj-filter-popover>` (Integration filter dropdown) + Refresh. `[toolbar]`: `<mj-page-search>` + StatusFilter chips + visual divider + DateFilter chips (all single-select segmented, both with `All` first). Body: `<mj-page-body [Flex]="true">`. Deleted bespoke `.filter-bar` + `.summary-strip` rows + their CSS. Added bridge `OnSearchValueChange(value: string)` for `<mj-page-search>` and filter-popover helpers. |
| Archive — Configuration | ✅ | ✅ | n/a | n/a | n/a | Resource wrapper migration only — wrapped `<mj-archive-config-admin>` (generic component from `@memberjunction/ng-archive-manager`) in shared chrome. Title="Archive Configuration", Icon="fa-sliders". Generic component left untouched so it stays reusable outside MJ Explorer. |
| Archive — Run History | ✅ | ✅ | n/a | n/a | n/a | Resource wrapper migration only — wrapped `<mj-archive-run-viewer>` (generic component) in shared chrome. Title="Archive Run History", Icon="fa-clock-rotate-left". Generic component left untouched. |

## Pages NOT yet migrated

See **[chrome-conventions.md Section 9](explorer-chrome-conventions.md#9-documented-exceptions)** for the canonical exception list. In summary:

- **Single-page exceptions** (deliberately different chrome — will NOT be migrated as-is): AI Overview (hero-landing layout), Home (right-sidebar dashboard), Component Studio (toolbar-driven authoring shell), Data Explorer (workspace), Query Browser (resizable left panel), AI Analytics' Model Performance section (custom leaderboard filter, not shared).
- **Shell-with-left-nav sub-pages** (deferred pending Section 10 decision): the 5 explorer-settings components (Users / Roles / Apps / Permissions / SQL Logging), `ApplicationRolesResource`, `SystemDiagnosticsResource`, and the APIKeys app's internal tabs (Keys / Applications / Scopes / Usage Analytics). All use the bespoke `.sticky-header` pattern. Migrating these piecemeal would produce doubled headers; they will be migrated together once Section 10 picks a pattern.

Everything else with a `BaseResourceComponent` registration is migrated.

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

### ~~Projected-slot wrappers need `display: contents`~~ (resolved — built into `mj-page-header`)
This used to bite every migration. The fix shipped as a built-in slot-passthrough rule in `page-header.scss`:

```scss
:host ::ng-deep [meta], [actions], [toolbar] {
  display: contents;
}
```

The selector matches by `meta` / `actions` / `toolbar` attribute, regardless of class name — so any `<div meta>` (or any element projected with one of those attributes) automatically becomes a transparent wrapper. **No bespoke `.X-header-meta { display: contents }` rule is needed; if you find one in an old page, delete it.** Migrations across Integration / Scheduling / Testing / AI / etc. have already deleted these.

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
5. ~~`display: contents` on slot wrappers~~ — no longer needed; `<mj-page-header>` has built-in slot-passthrough via attribute selectors. Drop any pre-existing `.X-header-meta/actions/toolbar { display: contents }` rules when you encounter them.
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
- [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) — chrome rules + canonical exception list
- [`plans/explorer-sitemap.md`](explorer-sitemap.md) — app + nav-item inventory
- ~~[`plans/explorer-layout-templates.md`](explorer-layout-templates.md)~~ — RETIRED. Superseded by chrome-conventions.md
- [`plans/complete/design-mockups/`](complete/design-mockups/) — canonical design system reference
