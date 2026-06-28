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
    <div actions>  <!-- Secondary buttons (Refresh, Export) → the one primary
                        CTA (rightmost). Filter + view-toggle live in the
                        [toolbar] control bar (§3 concise model), NOT here. -->
      <mj-refresh-button [Loading]="isLoading" (Clicked)="loadData()" />
      <button mjButton variant="primary" size="sm" (click)="create()">+ New</button>
    </div>
    <div toolbar>  <!-- Control bar: search · Filter · view. ALL filters live
                        behind the ONE Filter button (§3 concise model) — no
                        inline quick-filter chips, no applied-filter chip row. -->
      <mj-page-search [Value]="searchTerm" (ValueChange)="onSearch($event)" />
      <mj-filter-popover Label="Filters" Icon="fa-solid fa-filter"
          [ActiveCount]="activeFilterCount" [ShowClearAll]="activeFilterCount > 0"
          (ClearAllRequested)="resetFilters()">
        <mj-filter-panel [Fields]="filterFields" [Values]="filterValues"
          (ValuesChange)="onFilterValuesChange($event)" (Reset)="resetFilters()" />
      </mj-filter-popover>
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
- [/guides/DASHBOARD_BEST_PRACTICES.md#page-chrome](../../../../guides/DASHBOARD_BEST_PRACTICES.md#page-chrome) — overview + shared component list
- [/plans/explorer-chrome-conventions.md](../../../../plans/explorer-chrome-conventions.md) — the canonical rulebook with slot rules, the **§3 concise filter model** (one Filter button; no inline chips / applied-chip row), exception list
- [/plans/concise-chrome-rollout.md](../../../../plans/concise-chrome-rollout.md) — per-page checklist for migrating filter chrome to the concise model
- [/plans/chrome-slot-discipline-audit.md](../../../../plans/chrome-slot-discipline-audit.md) — Tasks A/B/C audit log; per-page record of what was changed and why
- [/plans/list-page-standardization.md](../../../../plans/list-page-standardization.md) — forward-looking proposal for standardizing the list-page control set (not yet implemented)

### Exception: dynamically-loaded sub-pages of a left-nav shell

If your component is loaded **into** another resource's left-nav shell (Admin's `admin-container` loading the explorer-settings sub-pages, Admin → Developer Tools loading the 7 inspectors, Admin → Monitoring loading SystemDiagnostics / SQL Logging, Admin → Data & Schema loading Database Designer, etc.), do NOT wrap it in the chrome trio — the parent owns the page identity.

Instead, use **`<mj-page-header-interior>`** at the top of the body (Section 10 of the conventions doc): a two-row card with `[Title]` / `[Subtitle]` inputs and `[meta]` / `[actions]` / `[toolbar]` slots — same slot conventions as `<mj-page-header>`, different visual shape. Primary row holds identity + meta + actions; toolbar row holds the control bar (search · Filter · view per the §3 concise model) / tab-nav and collapses entirely when there's nothing to render. Same shared primitives as the exterior chrome (`<mj-page-search>`, `<mj-filter-popover>` + `<mj-filter-panel>`, `<mj-refresh-button>`, `mjButton`) — one mental model, no doubled-header.

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

## 🚨 Agent Context & Client Tools — REQUIRED FOR EVERY DASHBOARD 🚨

**This is the baseline for ALL MJ Explorer dashboards, not just Knowledge Hub.** Every `BaseResourceComponent` / `BaseDashboard` subclass MUST report its state to the agent and register the operations the agent can invoke. A surface that skips this leaves the agent — the conversational chat agent **and** the realtime co-agent — blind to what the user is doing and unable to act in it.

**Required for every resource component** (in `ngAfterViewInit()` and on every meaningful state change):
1. `this.navigationService.SetAgentContext(this, {...})` — report surface state (active selection, filters, mode, metrics). Keep it to ~15 salient fields; send deltas. This feeds the shared `AppContextSnapshot` (`@memberjunction/ai-core-plus`) — its `AdditionalContext`, plus where relevant `View` (what's on screen / selected) and `Capabilities` (the live tool/agent manifest). **One call lights the surface up for the async chat agent (system-prompt `appContext`) AND the realtime co-agent (mint-time injection + streaming).**
2. `this.navigationService.SetAgentClientTools(this, [...])` — register the surface's agent-actionable operations (tab switches, record selection, mutations, exports). These resolve through the **one unified client-tool resolver** (`ResolveClientTools` in `@memberjunction/ai-core-plus`; precedence override > session > app > static).

**Do NOT add a parallel mechanism.** `SetAgentContext`/`SetAgentClientTools` are the single surface API — they already flow to async agents and the realtime co-agent consumes the same snapshot + resolved tools. Wire them in from the start when scaffolding a new dashboard.

**Living registry of wired surfaces** (keep current as surfaces are wired — gaps are visible here):

**Knowledge Hub / AI**
| Dashboard | Context Fields | Tools |
|-----------|---------------|-------|
| Search | CurrentQuery, ResultCount, ShowFilters, MinScoreThreshold, TopResults | RunKnowledgeSearch, ClearKnowledgeSearch, ToggleSearchFilters |
| Classify | ActiveTab, SourceCount, ContentItemCount, TagCount, PipelineStatus, PipelineProgress | SwitchClassifyTab, RunClassificationPipeline, SearchClassifyTags |
| Analytics | ActiveTab, DateRange, EntityFilter, KPIs | SwitchAnalyticsTab, SetAnalyticsDateRange, ExportAnalyticsCSV |
| Visualize | ActiveVisualizationMode | SwitchVisualizationMode |
| Clusters | IsVisualizationLoaded, ClusterCount, TotalPoints | RegenerateClusters, ResetClusterAnalysis |
| Config | ActiveSection, ActiveSectionLabel, SectionCount, SearchScopeCount | SwitchConfigSection, ReloadConfiguration |
| Scheduling | job counts (Active/Paused/Disabled), StatusFilter | RefreshSchedules, FilterSchedulesByStatus, OpenSchedulingApp |
| Duplicates | DetectionStatus, DetectionProgress, Pending/Approved/Rejected, DisplayMode, EntityFilter | RunDuplicateDetection, RefreshDuplicateDetection |
| Vectors | TotalVectors, EntityDocumentCount, SyncingCount, per-entity breakdown | RefreshVectors, SyncVectorsForEntity |
| Feature Pipelines | counts, SearchQuery, Pipelines[] | RunFeaturePipeline, SearchFeaturePipelines |

**Data Explorer** (entity grid + record detail + home)
| Surface | Context Fields | Tools |
|---------|---------------|-------|
| Data Explorer | SelectedEntityName, ViewMode, ActiveViewId, FilterText, Total/FilteredRecordCount, SelectedRecordName, DetailPanelOpen, Home: HomeViewMode/EntitySearchText/VisibleEntityCount | OpenEntityData, FilterRecords, ClearRecordFilter, SetViewMode, SelectView, OpenRecord, CreateNewRecord, NavigateToRelated |

**Admin** (🔒 **read-only / navigational tools only — no mutations exposed to the agent**)
| Surface | Context Fields | Tools (all read-only) |
|---------|---------------|-------|
| System Diagnostics | ActiveSection, PerfTab, EngineCount, memory/cache/slow-query metrics | SwitchDiagnosticsSection, SwitchPerformanceTab, RefreshDiagnostics, FilterTelemetryByCategory, SetSlowQueryThreshold |
| Users | counts (Total/Filtered/Active), CurrentFilterStatus/Role, SelectedUserId | SwitchUserStatusFilter, FilterUsersByRole, SearchUsers, ClearAllFilters, RefreshUserList, ExportUsers |
| Roles | counts (Total/Filtered/System/Custom), CurrentFilterType | FilterRolesByType, SearchRoles, ClearRoleFilters, RefreshRoles |
| API Keys | key counts, MainTab, SelectedKeyId (never secrets) | SwitchAPIKeysTab, FilterAPIKeysByStatus, SearchAPIKeys, RefreshAPIKeyData |
| Query Browser | SelectedQueryId/Name, SearchText, SelectedCategory, QueryCount (never SQL/results) | SearchQueries, FilterQueriesByStatus, SelectQuery, RefreshQueries |

> **Admin safety rule:** Admin surfaces expose ONLY navigational / filter / search / export / read-only-diagnostic tools to the agent. **Never** wire create/edit/delete (users/roles/keys), schema mutations, GraphQL execution, query-run-with-arbitrary-params, or secret/token values into agent context or tools. Each Admin component carries a documented SAFETY BOUNDARY comment.

**Actions** (🔒 find/filter/navigate only — **action execution NOT exposed** to the agent)
| Surface | Context Fields | Tools (read-only) |
|---------|---------------|-------|
| Overview | action counts, success rate, current search/status/type filters | SearchActions, FilterActionsByStatus/ByType, ClearAllFilters, OpenActionDetail, OpenExecutionDetail, RefreshOverviewData |
| Explorer | view mode, sort, selected category, total/filtered counts, filters | SwitchViewMode, SortActionsByField, SearchActions, ClearExplorerSearch, SelectCategory, ToggleStatus/TypeFilter, ClearExplorerFilters, OpenActionRecord, RefreshExplorerData |
| Monitor | execution metrics (total/failed/running), success rate, filters | SearchExecutions, FilterExecutionsByResult/ByTimeRange/ByAction, ClearMonitorFilters, OpenExecutionLog, RefreshMonitorData |

> **Actions safety:** `RunAction` / any execute path is intentionally NOT exposed (side effects + agent-supplied params). The agent finds/filters/navigates; the user runs from the UI dialog.

**Lists**
| Surface | Context Fields | Tools |
|---------|---------------|-------|
| Browse | search, view mode, list counts, sort, active filters | OpenList, SearchLists, FilterLists, ClearFilters, SetViewMode, SortBy, **CreateList** (bounded) |
| Categories | selected category, counts | SelectCategory, ExpandCategory, **CreateCategory** (bounded) |
| Operations (Venn) | operand counts, locked entity, compose op, region selection | AddListOperand, RemoveListOperand, FilterOperandsByEntity, PerformUnion/Intersection/SymmetricDifference, SelectVennRegion, **CreateListFromRegion**/**AddRegionToList** (append-only) |

> **Lists safety:** create/append (dialog-validated) exposed; **Edit/Delete/Share/Duplicate/ToggleFavorite/ComposeAndSave NOT exposed** (destructive or user-confirm-driven).

**Bulk Operations** (🔒 **dry-run preview only — real apply NOT exposed**)
| Surface | Context Fields | Tools |
|---------|---------------|-------|
| Operations | mode, process counts, search, editing process, isRunning | RefreshProcessList, SearchProcesses, CreateNewProcess, EditProcess, BackToList, **PreviewProcessChanges (dry-run)** |
| Run History | viewing-detail, run count, open-run status + DryRun flag | RefreshRunHistory, ViewRunDetails, BackToRunList |

> **Bulk Ops safety:** the only "run" capability is `PreviewProcessChanges` (opens the runner, which always dry-runs first and requires a manual user Apply). **No tool performs a real (non-dry-run) apply**, and `SaveProcess` is not exposed.

### Phase-5 full rollout — remaining apps (all wired with context + tools)

Every app below publishes context (re-emitted on state change) + registers tools via the inherited `this.navigationService` (never re-inject it — that shadows the base and breaks the build). Per-surface specifics live in each component's `SAFETY BOUNDARY` comment; this is the index.

| App | Context (highlights) | Safe tools | 🔒 Excluded / gated |
|-----|----------------------|------------|---------------------|
| **Communication** | active tab + child counts (logs/providers/templates/runs/sent/failed) | SwitchCommunicationTab, RefreshCommunicationData, FilterLogsBy | **SendMessage / compose**, template/provider edit, test-send |
| **Integration** | KPIs (integrations, syncs, error rate, pipelines, schedules) per surface | SwitchIntegrationSurface, RefreshIntegrationData, FilterActivityByStatus, SearchActivity | **RunSync** (live external sync), edit mappings/schedules/creds |
| **Scheduling** | active tab, job counts by status, alerts, success rate | SwitchSchedulingTab, RefreshSchedulingData, FilterJobsByStatus, SearchJobs, GetJobDetails | pause/resume (updateJobStatus), delete, create-job |
| **Testing** | active tab, run/pass/fail counts, cost, pending-review | SwitchTestingTab, RefreshTestingData, FilterTestsByStatus/ByTimeRange, SearchTests, GetTestRunDetails, **SubmitTestFeedback** | **StartNewTest / RerunTest** (execute) |
| **EntityAdmin** | entity counts, selected entity, filter-panel state | SelectEntity, ToggleFilterPanel, ClearEntitySelection, RefreshERD | any entity-metadata edit/create/delete |
| **DashboardBrowser** | mode, selected dashboard, counts, category, view mode | SearchDashboards, FilterByCategory, OpenDashboard, SwitchViewMode, RefreshDashboardList, BackToList | create/delete/save/share/move |
| **MCP** | active tab, server/connection/tool/exec counts, search (no secrets) | SwitchMCPTab, SearchMCPTools, FilterMCPToolsByServer, ToggleMCPToolFavorite, RefreshMCPData, SetToolsViewMode, ClearMCPFilters | create/delete servers+connections, **tool execution**, credentials/OAuth |
| **Form Builder / Component Studio** | active form, canvas, selected element/section, dirty flag, pane mode, field names | **canvas-edit suite**: AddField, RemoveField, SetFieldLabel, ToggleFieldRequired, SetFieldSpan, ReorderFields, AddSection, RemoveSection, SetSectionTitle, PreviewForm, ViewFormCode/Layout (+ wholesale UpdateForm) | Save/Publish/persist, delete-whole-form, override-activation |
| **Home** | app/pin/group/notification/recent counts, edit + add-panel state | OpenApp, OpenPin, SearchAddPinPanel, OpenAddPinPanel/Close, ToggleSidebar, TogglePinEditMode | pin create/delete/rename, group mutation, reorder |
| **RealtimeRecordings** | session count, selected session (agent/convo/media/duration), turn count | SelectSession, DeselectSession, RefreshSessionList, SearchSessions | mutate/delete/export (read-only playback) |
| **VersionHistory** | Restore: restore counts + filter · Graph: selected entity, entity/relationship counts, search, schema filter | FilterRestoresByStatus, RefreshRestoreHistory, GetRestoreStats · SelectEntityForDependencyView, FilterEntitiesBySchema, SearchEntities | **Restore/rollback**, label mutation, schema edits |
| **ApplicationRoles** | app-group + assignment counts, unsaved flag, expanded groups | ToggleApplicationGroup, GetRoleCountForApplication, RefreshApplicationRoleData | toggle-access/admin, add/remove role, save/discard |
| **Archiving** | Config: policy/entity counts · Runs: run counts by status, filter, selected run | RefreshArchiveConfig · FilterArchiveRunsByStatus, RefreshArchiveRunHistory, ViewArchiveRunDetail | **run archive / purge**, modify policy, cancel/retry run |
| **DatabaseDesigner** (🔒 read-only schema browse) | entity count, search, selected entity, modify-panel state | SearchEntities, SelectEntity (view), RefreshEntityList | **all schema mutation** — create/modify/add-field/delete/apply/pipeline |
| **Credentials** (🔒 metadata-only) | active tab, credential/type counts (never secrets) | SwitchCredentialsTab, RefreshCredentialCounts | secret values, create/edit/delete/reveal, type/category mutation |
| **Permissions** (🔒 read-only) | resource/user lookup state, audit filters, counts | LookupResourcePermissions, ChangeDomain, SelectUserForPermissionReview, TogglePermissionDomainGroup, RunAuditTimelineQuery, ResetAuditFilters | **grant/revoke**, domain mutation, impersonation, audit-record edit |
| **DevTools** | per-inspector (see below) | EventMonitor (pause/resume/clear/filter/sort), ClassRegistry (search/filter/clear), LazyModules (search/refresh), Layout (inspect/refresh) | — |

> **DevTools safety tiers:** EventMonitor / ClassRegistry / LazyModules / Layout = safe (context + tools). **AppState / SettingsExplorer = metadata-only** (counts/keys, **never values** — may hold tokens/secrets; no value-returning tools). **GraphQL Console = intentionally UNWIRED** (no context, no tools — arbitrary query execution is an injection vector).

See **[packages/AI/Agents/AGENT_CONTEXT_GUIDE.md](../../../AI/Agents/AGENT_CONTEXT_GUIDE.md)** for the full architecture guide.
