# MJ Explorer · IA Standardization Progress

> **Branch:** `explorer-shell-subpage-chrome` (active) · **Status:** Section 10 interior chrome shipped to all Admin shells; `<mj-left-nav>` gained optional tree support; Testing Explorer migrated · **Last update:** 2026-05-20

> Companion doc to [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) (the rules) and [`plans/phase-2-kendo-removal.md`](phase-2-kendo-removal.md) (the parent plan).

## TL;DR

Standardizing MJ Explorer's chrome — both the page-level header band (every dashboard) and the body-level chrome for sub-pages inside a left-nav shell (Admin / KH Config / AI Analytics / etc.). Per-page bespoke CSS is deleted as we go; styles live in exactly one place.

**Page-level chrome** (the original Phase 2.3 work): every standalone dashboard uses `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>`. ~65 dashboards migrated. Remaining unmigrated pages are documented Section 9 exceptions (Home / Component Studio / Data Explorer / Query Browser / AI Overview / Model Performance).

**Interior chrome** (Section 10, landed 2026-05-19): sub-pages dynamically loaded into a parent left-nav shell use a body-level `<mj-page-header-interior>` card instead of their own page-level header. The parent shell owns the page identity; the rail's active-item is the section indicator. Same slot conventions (`[meta]` / `[actions]` / `[toolbar]`) as `<mj-page-header>`, similar visual shape — a **two-row card** with identity + actions on the primary row and toolbar content (search, tab-nav, filter chips) on a separate row that collapses when empty.

**Interior chrome coverage** as of 2026-05-19: all four Admin shells (Identity & Access, Data & Schema, Monitoring, Dev Tools) — ~15 sub-pages. The 7 Dev Tools inspectors share a single `.mj-inspector` body wrapper and were migrated as a batch. API Keys' chrome (page-level) is done; its 3 inner panels (Applications/Scopes/Usage) retain bespoke headers pending the L3 chrome convention decision (see `project_l3_chrome_convention_tbd` memory note).

**Inline-tab shell rails** (Tier 1 / 2 / 3): the 5 user-facing inline-tab shells (AI Analytics, Knowledge Hub Analytics / Config / Tags / Classify) all migrated to `<mj-left-nav>` + `<mj-left-nav-content>`. The 2 originally documented as Tier 3 (Communication, Credentials) turned out to be orphan parent dashboards — their apps' `DefaultNavItems` navigate directly to the leaf resources, never through the dashboard wrapper. No user-facing migration needed.

**Testing Explorer** (migrated 2026-05-20): the first hybrid-rail consumer. `<mj-left-nav>` got optional tree support (`MJLeftNavItem.children` + `[ExpandedIds]` + `(ItemToggled)`) — backward compatible: items without `children` render exactly as before. Reference for any future tree-rail need.

## Shared components (lives in `@memberjunction/ng-ui-components`)

### Page-level chrome (top-level dashboards)

| Component | Selector | Purpose |
|---|---|---|
| `MJPageLayoutComponent` | `mj-page-layout` | Outer flex-column shell. `--mj-bg-page` background, `overflow: hidden`, full-height. Replaces every dashboard's bespoke `.{name}-container` wrapper. |
| `MJPageHeaderComponent` | `mj-page-header` | Canonical title row. Typed inputs `Title`, `Icon`, `Subtitle`. Three projection slots: `[meta]` (next to title), `[actions]` (right side), `[toolbar]` (secondary row inside same card). Icon uses `--mj-brand-primary` (NOT `--mj-app-accent`) so color is unified across apps. |
| `MJPageBodyComponent` | `mj-page-body` | Body region with optional padding + flex mode. **`Direction` input** (added 2026-05-19) — `'row'` switches the flex direction when `[Flex]="true"`, replacing the bespoke `.{name}-container__body` wrapper that left-rail shells used to declare. |

### Interior chrome (sub-pages inside a left-nav shell)

| Component | Selector | Purpose |
|---|---|---|
| `MJLeftNavComponent` | `mj-left-nav` | Canonical left rail. `[Sections]: MJLeftNavSection[]` + `[ActiveId]`; emits `(ItemClicked)`. Supports items with description / badge, section labels, optional `[header]` / `[footer]` slots. Responsive collapse-to-row at <700px. **Tree support** (added 2026-05-20) — `MJLeftNavItem.children` (optional) opts an item into tree rendering: chevron toggle when `children.length > 0`, equal-width placeholder when empty, depth-based padding-left on the row. Consumer owns expansion state via `[ExpandedIds]` input + `(ItemToggled)` output. Items without `children` (most existing consumers) render exactly as before — full backward compat. |
| `MJLeftNavContentComponent` | `mj-left-nav-content` | Content pane paired with `<mj-left-nav>`. Built-in `[Loading]` / `[Error]` states; projected content auto-hides when busy (cached components stay attached). Replaces the `applyHostSizing()` inline-style hack. |
| `MJPageHeaderInteriorComponent` | `mj-page-header-interior` | Body-level sibling of `<mj-page-header>` for sub-page interior chrome. **Two-row card** — primary row (Title + Subtitle + meta + actions), toolbar row (search / tab-nav / filter chips). Toolbar row collapses (`:empty`) when no projected content. Inputs: `Title`, `Subtitle` (both optional but recommended), `AriaLabel`, `Role` (default `'search'`). Same `[meta]` / `[actions]` / `[toolbar]` slot conventions as `<mj-page-header>`. Typography uses `--mj-text-lg` (title) / `--mj-text-xs` (subtitle) tokens. |

### Shared chrome primitives (used in both page-level and interior chrome)

| Component | Selector | Purpose |
|---|---|---|
| `MJStatBadgeComponent` | `mj-stat-badge` | Pill: "Count Label" or "Count of Total Label" or "Icon Label" (variants for status). Inputs `Count`, `Total`, `Label`, `Icon`, `Variant`. **Absorbed `mj-result-count`** in the organizational refactor. |
| `MJPageSearchComponent` | `mj-page-search` | Search input for `[toolbar]` slot. `[Placeholder]` + `[Value]`, emits `(ValueChange)`. |
| `MJFilterPopoverComponent` | `mj-filter-popover` | Trigger button (filter icon + label + active count badge) that opens a CDK Overlay popover. Inputs `Label`, `Icon`, `ActiveCount`, `ShowClearAll`. Output `ClearAllRequested`. |
| `MJFilterPanelComponent` | `mj-filter-panel` | Config-driven panel inside the popover. `[Fields]: FilterFieldConfig[]` + `[Values]: Record<string, unknown>`. Field types: `'text'`, `'dropdown'`, `'chips'`. Field icons supported. |
| `MJFilterFieldComponent` | `mj-filter-field` | Labeled wrapper for a custom widget inside `<mj-filter-panel>`. Used as an escape hatch when the built-in field types don't fit. |
| `MJFilterChipComponent` | `mj-filter-chip` | Toggle chip for quick-filter groups (status, time range). `[Label]` + `[Active]`, emits `(Clicked)`. |
| `MJTabNavComponent` | `mj-tab-nav` | Tab navigation for parent dashboards with sub-sections (Scheduling / MCP / Testing). |
| `MJViewToggleComponent` | `mj-view-toggle` | Compact icon-only segmented control for view modes (list / grid / tree). Icon-only convention: `title` for tooltip + aria-label; `label` for the rare visible-text case. |
| `MJRefreshButtonComponent` | `mj-refresh-button` | Refresh button. `[Loading]` drives both spinner and disabled state. |

All standalone, design-token-only, PascalCase API. `MJFilterToggleComponent` (was `mj-filter-toggle`) was deleted in the organizational refactor — zero template usages, fully replaced by the popover pattern.

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
| Testing — Explorer (resource) | ✅ | ✅ | ✅ | ✅ | n/a | **Inner-owns-chrome.** Full chrome owned by `<app-testing-explorer>`: search in `[toolbar]`; status chips + view-toggle (card/list) + "New Suite" + "New Test" in `[actions]`; result-count in `[meta]`. Display-mode toggle (All / Suites / Tests) and sort indicator kept in body — they're sub-view controls, not page-level chrome. Resource wrapper is a thin shim. **Internal left rail** (migrated 2026-05-20) now uses `<mj-left-nav>` + `<mj-left-nav-content>`. The rail mixes flat sections (Browse, Test Types) with a hierarchical suite tree — the first consumer of `<mj-left-nav>`'s new tree support. Composite ids (`'all'` / `'standalone'` / `'suite:{ID}'` / `'testType:{ID}'`) translate to/from the typed `SelectedSidebar` state via thin adapters. Collapse toggle dropped in favor of the rail's built-in <700px responsive collapse. Bespoke `.sidebar*` / `.sidebar-item*` / `.suite-tree-item` / `.tree-toggle` CSS (~165 lines) retired. |
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

## Interior chrome migrations (left-nav shell sub-pages)

Section 10 of chrome-conventions resolved 2026-05-19 with the **interior filter card** pattern: sub-pages dynamically loaded into a parent shell render `<mj-page-header-interior>` at the top of their body (no page-level `<mj-page-header>`). Parent shell owns the page identity. See [chrome-conventions.md Section 10](explorer-chrome-conventions.md) for the full contract.

### Admin → Identity & Access sub-pages

All 6 sub-pages now use the **full interior chrome pattern**: `<mj-page-header-interior>` (with Title + Subtitle + meta stat-badges) + `<mj-page-body-interior>` for the scrollable region. The legacy `<div class="mj-grid-4">` KPI card sandwich (4 large stat cards between chrome and body) has been collapsed into compact `<mj-stat-badge>` instances in the chrome's `[meta]` slot.

| Sub-page | Component (package) | Chrome | Body | Notes |
|---|---|---|---|---|
| Users | `UserManagementComponent` (explorer-settings) | ✅ | ✅ | Reference implementation. Title="Users". Meta: 3 plain count badges (total / active / owners). Toolbar: search + Status chips. Actions: filter-popover (Role) + refresh + Export + + Add User. |
| Roles | `RoleManagementComponent` (explorer-settings) | ✅ | ✅ | Title="Roles". Meta: 3 plain count badges (total / system / custom). Toolbar: search + Type chips. Actions: refresh + + Add Role. |
| Apps | `ApplicationManagementComponent` (explorer-settings) | ✅ | ✅ | Title="Applications". Meta: 3 plain count badges (apps / entities / public). Twin of Users structurally. |
| App Roles | `ApplicationRolesResource` (dashboards) | ✅ | ✅ | Title="Application Roles". Action-band shape (no search/filter). `Role="toolbar"`. Meta: HasUnsavedChanges badge (variant="warning" — genuine state). Actions: Discard / Save / refresh. |
| Permissions | `EntityPermissionsComponent` (explorer-settings) | ✅ | ✅ | Title="Entity Permissions". Meta: 4 plain count badges (entities / public / restricted / permissions). Toolbar: search + Access Level chips. Actions: filter-popover (Role) + `<mj-view-toggle>` + refresh. |
| API Keys | `APIKeysResource` (dashboards) | ✅ (outer) / ⏸️ (inner) | ✅ | Outer chrome + body migrated. Per-tab dynamic `[Title]` / `[Subtitle]` getters; `<mj-tab-nav>` in `[toolbar]` for the 4 sections; per-tab `[actions]` gated by MainTab. Body: `<mj-page-body-interior>` (the bespoke `.content-wrapper` padding div also dropped — body-interior owns padding). **Inner panels** (Applications/Scopes/Usage) retain bespoke `.panel-header` blocks — deferred to L3 chrome convention. |

All Identity & Access sub-pages also dropped their bespoke `.{name}-container` / `.scrollable-content` wrappers, removed `onSearchChange()` methods (mj-page-search handles it directly), and apply filter changes immediately (chip clicks + popover dropdowns bypass the 300ms search-text debounce for snappy UX).

### Other shell sub-pages

| Sub-page | Component (package) | Chrome | Body | Notes |
|---|---|---|---|---|
| SystemDiagnostics | `dashboards/SystemDiagnostics` | ✅ | ✅ | Title="System Diagnostics". Meta: 3 stat-badges (engines / memory / redundant with conditional `Variant="warning"`) — replaced the body-level collapsible KPI card section (`.overview-cards-container` + mini-bar) and dropped `kpiCardsCollapsed` state + `toggleKpiCards()` + URL param + persisted preference. `<mj-tab-nav>` in `[toolbar]` for the 4 L2 sections; auto-refresh toggle + refresh in `[actions]`. Body: `<mj-page-body-interior [Padding]="false">`. L3 perf-tabs strip inside Performance section stays bespoke. |
| SQL Logging | `SqlLoggingComponent` (explorer-settings) | ✅ | ✅ | Title="SQL Logging". Action-band only (no `[toolbar]` content — bottom row collapses). Body: `<mj-page-body-interior>` with default padding. Actions: refresh + Start New Session (conditional on Owner role). Migrated all 9 legacy `.btn-*` instances to `mjButton`. |
| Database Designer | `DatabaseDesignerDashboard` + `EntityListComponent` (dashboards) | ✅ | ✅ | Title="Database Designer". Thin parent wrapper around `<mj-database-entity-list>`. Body: `<mj-page-body-interior [Padding]="false">` (inner elements own their margins). Toolbar: search + schema filter. Actions: refresh + + New Entity. Meta: entity count badge. |
| Admin → Data & Schema → ERD | `EntityRelationshipDiagramDashboard` (dashboards) | ⏸️ | ⏸️ | Complex two-pane (filter panel + diagram canvas). Needs design thought on where chrome lives. |
| Admin → Data & Schema → Query Browser | `QueryBrowserResource` (dashboards) | ⏸️ | ⏸️ | Two-pane (category tree + query detail). Same. |
| Admin → Dev Tools (7 inspectors) | `dashboards/DevTools/*` | ✅ | n/a | All 7 inspectors migrated. Each carries its original descriptive subtitle. Action-only chromes — bottom row collapses. **Bodies intentionally do NOT use `<mj-page-body-interior>`** — they share an `.mj-inspector__content` flex shell from `inspector-shared.css` that hosts a section header + `<mj-code-editor>` filling the remaining height. The editor owns its own scroll; body-interior's `overflow-y: auto` would be redundant. Documented as the Section 10 exception for "purpose-built flex bodies hosting a non-scrolling primary widget." |

### Inline-tab shells (Pattern Y — parent owns chrome)

These shells render sub-sections inline via `@switch` (or `@if`) instead of dynamic component loading. The parent's `<mj-page-header>` already owns the page chrome and the shared filter bar is fine where it is — no `<mj-page-header-interior>` needed.

What's **NOT** standardized in this group is the **internal left rail**. Each of these shells has its own bespoke `<nav>` / `<aside>` with `.nav-item` styling, when `<mj-left-nav>` + `<mj-left-nav-content>` would fit cleanly. Future migration candidates:

| Shell | Page chrome | Internal rail | Migration shape |
|---|---|---|---|
| AI Analytics | ✅ shell-owns-filter-bar via `FilterBarConfig` | ✅ `<mj-left-nav>` + `<mj-left-nav-content>`. NavItems with a `{ Key: 'divider' }` entry expand into two `MJLeftNavSection`s via the `navSections` getter — the rail's natural section break replaces the bespoke `.nav-divider` line. Inline styles for `.analytics-nav` / `.nav-item` / `.nav-divider` stripped; responsive collapse-to-row now owned by the primitive. |
| Knowledge Hub Analytics | ✅ parent header owns chrome (Title="Knowledge Hub Analytics" + pipeline status badge) | ✅ `<mj-left-nav>` + `<mj-left-nav-content>`. Trending-tags widget projects into the rail's `[footer]` slot; `.trending-section` / `.tag-cloud` / `.no-trending` styles stay (projected content, not chrome). Dropped `.analytics-sidebar` / `.sidebar-nav` / `.nav-item` / `.sidebar-divider` CSS. |
| Knowledge Hub Configuration | ✅ parent header owns chrome | ✅ `<mj-left-nav>` + `<mj-left-nav-content>`. 9 sections (pipeline / vectordb / fulltext / embedding / thresholds / search-scopes / search-analytics / search-permissions / scheduling) mapped via `navSections` getter. Dropped `.config-nav` / `.config-nav-header` / `.config-nav-item` / `.config-nav-item-active` CSS. |
| Knowledge Hub Tags | ✅ parent header owns chrome | ✅ `<mj-left-nav>` + `<mj-left-nav-content>`. NavItems mapped via `navSections` getter (Tab/Icon/Label/BadgeText → id/icon/label/badge). Nested `.at-tag-lib-sidebar` right rail inside the Tag Library tab and `.at-tax-tab-strip` horizontal sub-tabs stay bespoke — they're contextual content / sub-views, not section navigation. ~95 lines of `.at-left-nav*` / `.at-nav-item*` / `.at-nav-badge*` / `.at-nav-divider` CSS retired. |
| Knowledge Hub Classify (Autotagging Pipeline) | ✅ parent header owns chrome | ✅ `<mj-left-nav>` + `<mj-left-nav-content>`. Same structure as Tags but with a hardcoded "Run History" item below the divider; expressed as a second `MJLeftNavSection` in the `navSections` getter. The `.at-tax-tab-strip` horizontal sub-tab strip inside the Taxonomy section stays bespoke. |
| Communication | ✅ parent header owns chrome | ⏸️ bespoke `.sidebar` with section labels ("Dashboard" / "Configuration" / "Operations") grouping nav items | `<mj-left-nav>` with `MJLeftNavSection[]` (section.label maps to the uppercase headers) |
| Credentials | ✅ parent header owns chrome | ⏸️ bespoke `.sidebar` with section labels (same pattern as Communication) | `<mj-left-nav>` with `MJLeftNavSection[]` |

**Intentional exception** — not a migration candidate:

| Shell | Why excluded |
|---|---|
| Knowledge Hub Clusters | The `.sidebar` is a saved-clusters list (selection-of-context, not section navigation). User picks a cluster; the right pane shows that cluster's visualization. That's a list-detail pattern, not a section-nav shell — `<mj-left-nav>` would be the wrong fit. Stays bespoke. |

## Pages NOT yet migrated (page-level chrome)

See **[chrome-conventions.md Section 9](explorer-chrome-conventions.md#9-documented-exceptions)** for the canonical exception list. In summary:

- **Single-page exceptions** (deliberately different chrome — will NOT be migrated as-is): AI Overview (hero-landing layout), Home (right-sidebar dashboard), Component Studio (toolbar-driven authoring shell), Data Explorer (workspace), Query Browser (resizable left panel), AI Analytics' Model Performance section (custom leaderboard filter, not shared).

Everything else with a `BaseResourceComponent` registration is migrated at the page level.

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
- Putting `<mj-stat-badge [Total]>` (a count) in `[actions]` next to Refresh — count is metadata, not a verb. Move to `[meta]`.
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

### A. Finish the remaining left-nav shell sub-pages
The Section 10 pattern is proven on 5 pages and the migration recipe is mechanical. Remaining:

**Quick wins** (similar shape to Users / Roles, ~1-2 hours each):
1. **SystemDiagnosticsResource** — migrate to `<mj-page-header-interior>`. Used by both Admin → Monitoring → Diagnostics and as a standalone resource.
2. **SqlLoggingComponent** — action band only, two-pane working area in body. Should be a quick chrome swap.
3. **Admin → Dev Tools inspectors (7)** — GraphQL Console / Event Monitor / Class Registry / Lazy Loading / Settings Explorer / App State / Layout Inspector. Simple inspector pages.

**Needs design thought** (complex two-pane workspaces, ~design pass each):
4. **Admin → Data & Schema → ERD** — filter panel + diagram canvas. Where does the chrome go when the body is already split-pane?
5. **Admin → Data & Schema → Query Browser** — category tree + query detail. Same problem.
6. **Admin → Data & Schema → Database Designer** — multi-pane workspace. Probably its own Section 9a exception.

**Different architecture** (nested IA, ~separate design pass):
7. **APIKeys** — has internal Keys / Applications / Scopes / Usage tabs. Pattern Y nested in Pattern X. Needs a design pass to decide whether to use `<mj-left-nav>` + `<mj-left-nav-content>` for the inner nav or keep the existing tab pattern.

### B. Roll the inline-tab shells onto shared `<mj-left-nav>` (optional)

7 inline-tab shells have bespoke internal left rails that could adopt `<mj-left-nav>` + `<mj-left-nav-content>`. Page-level chrome is already correct on all of them — this is purely about deleting bespoke nav CSS and consolidating onto the shared primitives. See the "Inline-tab shells" table above for the per-shell migration shape.

Tiered by closeness to the shared component's default contract:

**Tier 1 — direct mapping** (single section, no headers):
1. AI Analytics — NavItems + divider (two implicit sections)
2. Knowledge Hub Analytics — NavItems + trending-tags widget in `[footer]` slot
3. Knowledge Hub Configuration — NavItems for settings sections

**Tier 2 — primary rail clean, secondary content stays bespoke**:
4. Knowledge Hub Tags — primary rail standard; nested right rail (tag cloud) stays bespoke
5. Knowledge Hub Classify — primary rail standard; nested sub-tab strip stays bespoke

**Tier 3 — section labels (uppercase group headers)**:
6. Communication — uses `MJLeftNavSection.label` for "Dashboard" / "Configuration" / "Operations" groupings
7. Credentials — same shape as Communication

Lower priority than (A) — these chromes work today, they just have ~150 lines of bespoke nav CSS per page that could go away.

### C. Resolve Section 9a exceptions
- **AI Overview**: hero-section → page-header is a redesign, not a swap. Needs user confirmation.
- **Model Performance**: its custom sort/leaderboard filter is fundamentally different from the shared analytics-filter-bar. Leave alone or build a separate leaderboard-filter component.

### D. Push branch + open PR for what's done

Current branch `explorer-shell-subpage-chrome` has 8 commits of chrome work — ready for review. PR scope: the interior-chrome pattern + 5 sub-page migrations + the legacy `.mj-btn` removal.

### E. Phase 2.2 carry-overs (from `plans/phase-2-kendo-removal.md`)
Not part of header chrome, but adjacent:
- `<mj-empty-state>` component (61 ad-hoc empty-state implementations)
- `<mj-confirm-dialog>` consolidation
- `SelectorDialog<T>` base class
- Card CSS consolidation (61 → `.mj-card`)

### F. Verification
- Visual / UAT pass on every migrated page (after MJExplorer restart so Vite picks up the new bundles)
- Make sure dark mode still works for all the new components
- Test responsive behavior at 768px and below (page-header has a media query that switches title row to column)

## Commit history

This doc tracks ongoing work; commits are the canonical record. Notable branches and their phases:

### `explorer-header-consolidation` (Phase 2.3, original)
Built the page-level chrome (`<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>`) and migrated ~65 standalone dashboards. Original "Pages migrated" table above.

### `explorer-shell-subpage-chrome` (Section 10, this branch — 2026-05-19)
Resolved Section 10 with the interior chrome pattern. 8 commits to date — `git log explorer-shell-subpage-chrome` shows the full sequence. Key milestones:

- `02a12462d9` — `<mj-page-body>` Direction prop; drop bespoke `.{shell}-container__body` wrappers
- `77b4bc073c` — new `<mj-left-nav>` + `<mj-left-nav-content>` shell primitives; Admin shells migrated to use them
- `dea2fed0ba` — new `<mj-page-header-interior>` component; UserManagement migrated as reference
- `edee123e05` — RoleManagement migrated; legacy MJ Button System rules deleted from `_admin-patterns.css`
- `3964656b10` — ApplicationManagement + ApplicationRolesResource + EntityPermissions migrated; filter debounce lag fix

## References

- [`plans/phase-2-kendo-removal.md`](phase-2-kendo-removal.md) — parent plan; this work is Phase 2.3
- [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) — chrome rules + canonical exception list
- [`plans/explorer-sitemap.md`](explorer-sitemap.md) — app + nav-item inventory
- ~~[`plans/explorer-layout-templates.md`](explorer-layout-templates.md)~~ — RETIRED. Superseded by chrome-conventions.md
- [`plans/complete/design-mockups/`](complete/design-mockups/) — canonical design system reference
