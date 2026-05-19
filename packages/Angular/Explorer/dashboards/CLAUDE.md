# Dashboards Package Development Guide

## 🚨 Page Chrome — Always Use the Shared Trio 🚨

Every new dashboard in this package must use **`<mj-page-layout>`** + **`<mj-page-header>`** + **`<mj-page-body>`** from `@memberjunction/ng-ui-components`. Do not roll bespoke headers, gradients, or sidebars — those were consolidated in the chrome migration and the per-section CSS has been deleted.

```html
<mj-page-layout>
  <mj-page-header Title="..." Icon="fa-solid fa-..." Subtitle="...">
    <div meta>     <!-- state: stat-badges, status pills (NO buttons) -->
      <mj-stat-badge [Count]="items.length" Label="items" />
    </div>
    <div actions>  <!-- verbs: refresh, filter-popover, + New button (rightmost) -->
      <mj-refresh-button [Loading]="isLoading" (Clicked)="loadData()" />
      <button mjButton variant="primary" size="sm" (click)="create()">+ New</button>
    </div>
    <div toolbar>  <!-- secondary row: search, filter chips -->
      <mj-page-search [Value]="searchTerm" (ValueChange)="onSearch($event)" />
    </div>
  </mj-page-header>
  <mj-page-body>
    <!-- card grid / table / panels -->
  </mj-page-body>
</mj-page-layout>
```

**Full reference:**
- [/guides/DASHBOARD_BEST_PRACTICES.md#page-chrome](/guides/DASHBOARD_BEST_PRACTICES.md#page-chrome) — overview + shared component list
- [/plans/explorer-chrome-conventions.md](/plans/explorer-chrome-conventions.md) — the canonical rulebook with slot rules, filter UI decision tree, exception list

### Exception: dynamically-loaded sub-pages of a left-nav shell

If your component is loaded **into** another resource's left-nav shell (e.g. Admin's `admin-container` loading the explorer-settings sub-pages, or `ApplicationRolesResource` / `SystemDiagnosticsResource` inside Admin shells), do NOT wrap it in the chrome trio — the parent owns the chrome.

Instead, use the **interior filter card pattern** (Section 10 of the conventions doc): one white card at the top of the body holding the sub-page's `<mj-page-search>` + visible `<mj-filter-chip>`s + `<mj-filter-popover>`/`<mj-filter-panel>` + `<mj-refresh-button>` + action buttons. Same shared primitives as the exterior chrome — one mental model, no doubled-header.

Reference implementation: `packages/Angular/Explorer/explorer-settings/src/lib/user-management/`. Sub-pages that haven't been migrated yet still use the older `.sticky-header` pattern; they'll be moved to the filter card pattern in subsequent passes.

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
