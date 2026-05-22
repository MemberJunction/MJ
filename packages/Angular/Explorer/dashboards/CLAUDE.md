# Dashboards Package Development Guide

## 🚨 Page Chrome — Always Use the Shared Trio 🚨

Every new dashboard in this package must use **`<mj-page-layout>`** + **`<mj-page-header>`** + **`<mj-page-body>`** from `@memberjunction/ng-ui-components`. Do not roll bespoke headers, gradients, or sidebars — those were consolidated in the chrome migration and the per-section CSS has been deleted.

```html
<mj-page-layout>
  <mj-page-header Title="..." Icon="fa-solid fa-..." Subtitle="...">
    <div meta>     <!-- State the user can't get by glancing at the list below.
                        See the §2 [meta] decision rule in conventions doc -
                        four passing patterns: status-callout-with-variant,
                        X-of-Y filtered count, non-trivially-derived metric,
                        single hero metric. NEVER buttons. -->
      <mj-stat-badge [Count]="filteredItems.length" [Total]="items.length" Label="items" />
    </div>
    <div actions>  <!-- Verbs, ordered left → right: state controls
                        (filter-popover, view-toggle) → secondary buttons
                        (Refresh, Export) → primary CTA (rightmost).
                        Cap: 4 items. Tab-nav goes in [toolbar], not here. -->
      <mj-refresh-button [Loading]="isLoading" (Clicked)="loadData()" />
      <button mjButton variant="primary" size="sm" (click)="create()">+ New</button>
    </div>
    <div toolbar>  <!-- Secondary row: search, filter chips, tab-nav. -->
      <mj-page-search [Value]="searchTerm" (ValueChange)="onSearch($event)" />
    </div>
  </mj-page-header>
  <mj-page-body>
    <!-- card grid / table / panels -->
  </mj-page-body>
</mj-page-layout>
```

> **Don't drop a plain `<mj-stat-badge [Count]="items.length" Label="items">` into `[meta]`** —
> that's the row-count anti-pattern (mirrors what the list below already shows).
> Either use the X-of-Y form above (`[Count] + [Total]` tells the user how the
> filter is narrowing the data, signal at any scale), drop `[meta]` entirely if
> there's nothing signal-bearing to show, or use a conditional status pill with
> a non-default `Variant` (the canonical good case — see App Roles' "Unsaved
> changes" pill).

**For pages with a section rail** (multi-section dashboards like AI Analytics, Knowledge Hub Configuration / Analytics / Tags / Classify): use **`<mj-left-nav>`** + **`<mj-left-nav-content>`** inside the body, and render a per-section **`<mj-page-header-interior>`** for section identity + section-specific controls. The outer chrome stays still as the user switches sections; only the inner card rebuilds. `<mj-left-nav>` supports both flat sections and trees (Testing Explorer is the canonical tree consumer).

**Full reference:**
- [/guides/DASHBOARD_BEST_PRACTICES.md#page-chrome](/guides/DASHBOARD_BEST_PRACTICES.md#page-chrome) — overview + shared component list
- [/plans/explorer-chrome-conventions.md](/plans/explorer-chrome-conventions.md) — the canonical rulebook with slot rules, filter UI decision tree, exception list
- [/plans/chrome-slot-discipline-audit.md](/plans/chrome-slot-discipline-audit.md) — Tasks A/B/C audit log; per-page record of what was changed and why
- [/plans/list-page-standardization.md](/plans/list-page-standardization.md) — forward-looking proposal for standardizing the list-page control set (not yet implemented)

### Exception: dynamically-loaded sub-pages of a left-nav shell

If your component is loaded **into** another resource's left-nav shell (Admin's `admin-container` loading the explorer-settings sub-pages, Admin → Developer Tools loading the 7 inspectors, Admin → Monitoring loading SystemDiagnostics / SQL Logging, Admin → Data & Schema loading Database Designer, etc.), do NOT wrap it in the chrome trio — the parent owns the page identity.

Instead, use **`<mj-page-header-interior>`** at the top of the body (Section 10 of the conventions doc): a two-row card with `[Title]` / `[Subtitle]` inputs and `[meta]` / `[actions]` / `[toolbar]` slots — same slot conventions as `<mj-page-header>`, different visual shape. Primary row holds identity + meta + actions; toolbar row holds search / tab-nav / filter chips and collapses entirely when there's nothing to render. Same shared primitives as the exterior chrome (`<mj-page-search>`, `<mj-filter-popover>` + `<mj-filter-panel>`, `<mj-filter-chip>`, `<mj-refresh-button>`, `mjButton`) — one mental model, no doubled-header.

Reference implementations cover all four Admin shells (~15 sub-pages) — copy any of them. Canonical filter-card shape: `UserManagementComponent` (`packages/Angular/Explorer/explorer-settings/src/lib/user-management/`). Action-only chrome (no toolbar): the Dev Tools inspectors. Pattern X with internal tab nav: `SystemDiagnosticsComponent`, `APIKeysResourceComponent`.

---

## 🚨 CRITICAL: NotifyLoadComplete() is MANDATORY 🚨

Every resource component in this package extends `BaseResourceComponent`. You **MUST** call `this.NotifyLoadComplete()` when initialization is complete. Without it, the app loading screen hangs forever on direct URL navigation (e.g., `/app/knowledge-hub/Search`).

### For BaseDashboard Subclasses
`BaseDashboard.ngOnInit()` calls `NotifyLoadComplete()` automatically after `loadData()` completes. No action needed — just implement `initDashboard()` and `loadData()` as usual.

### For Direct BaseResourceComponent Subclasses
You MUST call `this.NotifyLoadComplete()` yourself:

```typescript
@RegisterClass(BaseResourceComponent, 'MyResource')
@Component({ ... })
export class MyResourceComponent extends BaseResourceComponent implements AfterViewInit {
    ngAfterViewInit(): void {
        this.loadMyData();
        this.NotifyLoadComplete(); // REQUIRED
    }
}
```

### Where to Place the Call
- If your init is **synchronous** or fires-and-forgets async work: call at the end of `ngOnInit()` / `ngAfterViewInit()`
- If your init **awaits** data loading: call after the await completes
- The call signals "component is rendered and ready" — it does NOT need to wait for all data to finish loading, just for the component to be interactive

### What Happens Without It
The shell component waits for `onFirstResourceLoadComplete()` before hiding the loading screen. That event is driven by `NotifyLoadComplete()`. If no resource component calls it, the user sees the loading animation indefinitely with only a "Reset" button (which clears all local data) as recovery.

## Agent Context & Client Tools

Every Knowledge Hub dashboard reports its state to the AI agent and registers tools the agent can invoke. This is done via `NavigationService` in `ngAfterViewInit()`.

**Required for all KH resource components:**
1. Call `this.navigationService.SetAgentContext(this, {...})` — report dashboard state on init and on every meaningful state change
2. Call `this.navigationService.SetAgentClientTools(this, [...])` — register tools on init

**Currently implemented dashboards:**

| Dashboard | Context Fields | Tools |
|-----------|---------------|-------|
| Search | CurrentQuery, ResultCount, ShowFilters, MinScoreThreshold, TopResults | RunKnowledgeSearch, ClearKnowledgeSearch, ToggleSearchFilters |
| Classify | ActiveTab, SourceCount, ContentItemCount, TagCount, PipelineStatus | SwitchClassifyTab, RunClassificationPipeline, SearchClassifyTags |
| Analytics | ActiveTab, DateRange, EntityFilter, KPIs | SwitchAnalyticsTab, SetAnalyticsDateRange, ExportAnalyticsCSV |
| Clusters | IsVisualizationLoaded, ClusterCount, TotalPoints | (context only) |
| Duplicates | DetectionStatus, PendingCount, ApprovedCount, RejectedCount | (context only) |
| Vectors | TotalVectors, KPICount | (context only) |
| Config | ActiveSection | (context only) |

See **[packages/AI/Agents/AGENT_CONTEXT_GUIDE.md](/packages/AI/Agents/AGENT_CONTEXT_GUIDE.md)** for the full architecture guide.
