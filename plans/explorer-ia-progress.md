# MJ Explorer · IA Standardization Progress

> **Branch:** `information-architecture` · **Status:** Phase 2.3 in progress · **Last update:** 2026-05-08
>
> Companion doc to [`plans/explorer-layout-templates.md`](explorer-layout-templates.md) (the layout inventory) and [`plans/phase-2-kendo-removal.md`](phase-2-kendo-removal.md) (the parent plan).

## TL;DR

We're consolidating the dashboard header chrome of MJ Explorer into a small set of shared components in `@memberjunction/ng-ui-components`, then migrating each dashboard to use them. Per-page CSS for the header strip is being deleted as we go — the goal is that future drift is impossible because the styles live in exactly one place.

So far: **6 shared components** built, **6 dashboards** fully migrated (MCP + 5 AI sub-pages), Analytics also migrated with a proof-of-concept popover for filter density. **~13 dashboards still use bespoke headers**.

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

## Pages NOT yet migrated

Per [`plans/explorer-layout-templates.md`](explorer-layout-templates.md):

- **Template A** (sidebar + content): APIKeys, Communication, Credentials, Scheduling, Settings, Testing
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

## Known gotchas

### Vite dev server caching (recurring this session)
MJExplorer's running Vite dev server caches compiled bundles in memory. When you build a workspace dependency (`ng-ui-components` or `ng-dashboards`), the new dist is on disk but **HMR doesn't reliably pick up changes from symlinked workspace packages**. A browser hard-refresh re-fetches from Vite, which still serves the stale cached JS.

**Workaround:** kill and restart MJExplorer after rebuilding `ng-ui-components` or `ng-dashboards`. Hard-refresh alone is not enough.

### Component encapsulation + projected wrappers
`mj-page-header` projects content into `[meta]` / `[actions]` / `[toolbar]` slots. Sections that wrap projected content in their own `<div meta>` or `<div actions>` should set `display: contents` on those wrappers so they don't add layout boxes (the page-header already handles flex). Pattern used in MCP/Agents/Prompts/etc.

### Component cards should not double as section cards
The `app-analytics-filter-bar` originally had its own wrapper card styling (border, background, radius). When projected into `mj-page-header`'s actions slot, it became a card-on-card. **Fix:** strip the wrapper styling from any component you intend to project into `mj-page-header`. Now the filter-bar is just a flex group of controls; the page-header provides the surface.

### ExpressionChangedAfterItHasBeenCheckedError risk
Inputs with default values that are objects (e.g., `Filters: GlobalFilterState = { Models: [], ... }`) and bound to component getters (e.g., `[ActiveCount]="ActiveFilterCount"`) can occasionally fire the dreaded `ExpressionChangedAfterItHasBeenCheckedError` if the getter is read during change-detection AND the input is mutated. Not seen yet in this work, but worth watching.

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
