*Created: 2026-04-11 08:17 CDT*

# Framework-Level Back/Forward Navigation for Query Params Within Nav Items

## Problem Statement

MJ Explorer correctly handles back/forward for **nav item switching** (path changes like `/app/kh/Search` → `/app/kh/Classify`), but **not** for query param changes within a single nav item (like `/app/data-explorer/Data?entity=Members` → `?entity=Products`).

Multiple interacting bugs prevent this from working:
1. The shell does nothing when the active tab matches the URL (ignores query param differences)
2. `shouldReuseRoute` returns `false` for query-param-only changes, causing the ResourceResolver to race with the shell
3. `buildResourceUrl()` drops query params for most resource types (records, views, dashboards, etc.)
4. Components must implement ~80-200 lines of boilerplate to handle sub-navigation themselves
5. Several components in `packages/Angular/Generic/` violate the encapsulation rule by importing Router directly
6. Several components in `packages/Angular/Explorer/` bypass NavigationService and use Router directly

## Architecture Rules

### Generic Components (`packages/Angular/Generic/`)
- **MUST NOT** import `Router`, `ActivatedRoute`, `NavigationEnd`, or any `@angular/router` types
- **MUST** use `@Input()` / `@Output()` / method contracts for all state
- These components must work in ANY Angular app, not just MJ Explorer
- A `CLAUDE.md` must be added/updated in `packages/Angular/Generic/` to enforce this rule

### Explorer Components (`packages/Angular/Explorer/`)
- **MUST** use `NavigationService` for all routing operations
- **MUST NOT** import `Router` or `ActivatedRoute` directly (with documented exceptions below)
- **Allowed exceptions**: Shell component, app-routing module, AuthGuard, OAuth callback, NavigationService itself

---

## Architecture Gap Analysis

### Gap 1: Shell ignores query param changes on active tab
In `shell.component.ts` `syncWorkspaceWithUrl()`:
```typescript
if (matchingTab && matchingTab.id !== config.activeTabId) {
    this.workspaceManager.SetActiveTab(matchingTab.id);
} else if (!matchingTab) {
    await this.handleMissingTabForUrl(url);
}
// ❌ MISSING: matchingTab === activeTab → query params may have changed
```

### Gap 2: shouldReuseRoute triggers resolver on query param changes
In `app-routing.module.ts` line 73-75, `shouldReuseRoute` compares BOTH path params AND query params. When back/forward changes only query params, it returns `false`, causing the ResourceResolver to run and race with the shell.

### Gap 3: buildResourceUrl drops query params on resource routes
Query params from `tab.configuration.queryParams` are only appended for nav item URLs and search URLs. Missing from: records, saved views, dashboards, artifacts, queries, reports (both app-scoped and legacy paths).

### Gap 4: No base class support for sub-navigation
Each component independently implements Router event subscriptions, URL parsing, skip flags, and state tracking — ~80-200 lines of identical boilerplate per component.

---

## Full Router Usage Audit

### VIOLATIONS IN `packages/Angular/Generic/` (Must Fix — No Router Allowed)

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| G1 | `Generic/ai-test-harness/src/lib/ai-test-harness.component.ts` | 2, 163 | `import { Router }`, constructor injection `private router: Router` | Remove — appears unused/legacy |

### VIOLATIONS IN `packages/Angular/Explorer/` (Must Migrate to NavigationService)

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| E1 | `dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` | 2, 682-684, 2524, 2680, 2700 | `Router`, `NavigationEnd`, `router.events` subscription, `router.url` reads | Replace with framework `OnQueryParamsChanged` + `UpdateQueryParams` |
| E2 | `dashboards/src/QueryBrowser/query-browser-resource.component.ts` | 3, 126-128, 778, 807-808 | `Router`, `NavigationEnd`, `router.events` subscription, `router.url` reads | Same pattern as E1 — migrate to framework |
| E3 | `dashboards/src/MCP/mcp-dashboard.component.ts` | 13, 337, 344, 379-381, 519, 1506, 1525 | `Router`, `ActivatedRoute`, `NavigationEnd`, `router.events`, `router.navigate()`, `router.url` | Migrate to `UpdateQueryParams` + `OnQueryParamsChanged` |
| E4 | `dashboards/src/Actions/components/explorer/action-explorer.component.ts` | 9, 108-110, 121, 272 | `Router`, `NavigationEnd`, `router.events` subscription, `router.url` | Migrate to framework |
| E5 | `explorer-core/src/lib/user-notifications/user-notifications.component.ts` | 5, 363, 366 | `Router`, `router.navigateByUrl()`, `router.navigate()` | Migrate to `NavigationService.OpenEntityRecord()` or similar |
| E6 | `explorer-core/src/lib/single-dashboard/single-dashboard.component.ts` | 8 | `import { ActivatedRoute, Router }` — appears unused | Remove unused imports |
| E7 | `simple-record-list/src/lib/simple-record-list/simple-record-list.component.ts` | 4 | `import { Router }` — appears unused | Remove unused import |
| E8 | `explorer-core/src/lib/resource-wrappers/chat-tasks-resource.component.ts` | (various) | Custom URL tracking, `skipUrlUpdate`, manual URL building | Migrate to framework `OnQueryParamsChanged` + `UpdateQueryParams` |
| E9 | `explorer-core/src/lib/resource-wrappers/chat-collections-resource.component.ts` | (various) | Custom URL tracking, `skipUrlUpdate`, manual URL building | Migrate to framework `OnQueryParamsChanged` + `UpdateQueryParams` |

### ALLOWED Router Usage (No Changes Needed)

| File | Reason |
|------|--------|
| `explorer-core/src/lib/shell/shell.component.ts` | Top-level shell — orchestrates all routing |
| `explorer-core/src/app-routing.module.ts` | Route definitions and `CustomReuseStrategy` |
| `explorer-core/src/lib/guards/auth-guard.service.ts` | Route guard — standard Angular pattern |
| `explorer-core/src/lib/oauth/oauth-callback.component.ts` | OAuth callback redirect — special flow |
| `shared/src/lib/navigation.service.ts` | The NavigationService itself — wraps Router |
| `explorer-app/src/lib/explorer-app.component.ts` | Top-level app component (partial — chat overlay NavigationEnd could move to NavigationService) |

---

## Solution Design

### Principle
The shell owns ALL URL ↔ workspace synchronization, including query param changes on the active tab. Components never subscribe to Router events. The framework provides:
1. A way to **push** query param changes (`UpdateQueryParams`)
2. A way to **receive** query param changes from back/forward (`OnQueryParamsChanged`)
3. URL generation that **preserves** query params across all resource types

### Layer 0: Fix shouldReuseRoute (Eliminate Race Condition)
**File:** `packages/Angular/Explorer/explorer-core/src/app-routing.module.ts`

Change `shouldReuseRoute` to return `true` when only query params change. Query param changes are handled by the shell's sub-navigation system, not by re-running the resolver:

```typescript
shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig &&
           this.objectContentsEqual(future.params, curr.params);
    // Query params intentionally excluded — shell handles sub-navigation
}
```

**Deep link safety note:** When a user pastes a URL with query params and no tab exists, `shouldReuseRoute` is NOT called (there is no `curr` route to compare — Angular creates a fresh route). The ResourceResolver runs normally, `handleMissingTabForUrl` creates the tab, and query params are passed through `TabRequest.Configuration`. This path is unaffected by this change. **Must verify with test case:** paste `?entity=Members` into address bar with no open tab.

### Layer 1: Shell detects query param changes on active tab
**File:** `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`

Add the missing `else if` branch in `syncWorkspaceWithUrl()`:

```typescript
if (matchingTab && matchingTab.id !== config.activeTabId) {
    this.workspaceManager.SetActiveTab(matchingTab.id);
} else if (matchingTab && matchingTab.id === config.activeTabId) {
    // Same tab, but query params may have changed (back/forward within nav item)
    const urlParams = this.extractQueryParamsFromUrl(url);
    const tabParams = (matchingTab.configuration?.queryParams || {}) as Record<string, string>;
    if (!this.queryParamsEqual(urlParams, tabParams)) {
        // URL is source of truth during back/forward — update tab config to match
        // NOTE: urlBasedNavigation flag works here because UpdateTabConfiguration triggers
        // configuration$.next() which is a BehaviorSubject — synchronous emission.
        // The shell's syncUrlWithWorkspace subscription fires synchronously in the same
        // call stack, sees urlBasedNavigation=true, and returns early. The finally block
        // then clears the flag. If this ever becomes async (e.g., debounced), this
        // pattern would break and need revisiting.
        this.urlBasedNavigation = true;  // Prevent syncUrlWithWorkspace from re-navigating
        try {
            this.workspaceManager.UpdateTabConfiguration(matchingTab.id, {
                queryParams: Object.keys(urlParams).length > 0 ? urlParams : undefined
            });
            this.navigationService.NotifyQueryParamsChanged(matchingTab.id, urlParams);
        } finally {
            this.urlBasedNavigation = false;
        }
    }
} else if (!matchingTab) {
    await this.handleMissingTabForUrl(url);
}
```

Add helper methods:
```typescript
private extractQueryParamsFromUrl(url: string): Record<string, string> {
    // Strip fragment (#hash) before parsing — URLSearchParams would include it in the last value
    const fragmentIndex = url.indexOf('#');
    const cleanUrl = fragmentIndex !== -1 ? url.substring(0, fragmentIndex) : url;
    const queryIndex = cleanUrl.indexOf('?');
    if (queryIndex === -1) return {};
    const params = new URLSearchParams(cleanUrl.substring(queryIndex + 1));
    const result: Record<string, string> = {};
    params.forEach((value, key) => { result[key] = value; });
    return result;
}

private queryParamsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    // Normalize with decodeURIComponent to handle + vs %20 encoding differences
    // (URLSearchParams encodes spaces as +, Angular Router uses %20)
    return keysA.every(key =>
        decodeURIComponent(a[key]?.replace(/\+/g, ' ') || '') ===
        decodeURIComponent(b[key]?.replace(/\+/g, ' ') || '')
    );
}
```

### Layer 2: NavigationService notification channel
**File:** `packages/Angular/Explorer/shared/src/lib/navigation.service.ts`

Add a new observable for query param change notifications. Note that `UpdateActiveTabQueryParams()` already exists (lines 804-851) and handles merging params, null-as-deletion, and calling `WorkspaceStateManager.UpdateTabConfiguration`. No changes needed to that method — we only add the notification channel.

**CRITICAL: Tab-scoped notifications.** The notification must include the tab ID so that only the component in the affected tab reacts. Without this, all subscribed components across all tabs would receive every notification — a correctness bug in multi-tab scenarios (e.g., two Data Explorer instances in different apps).

```typescript
export interface QueryParamChangeEvent {
    TabId: string;
    Params: Record<string, string>;
}

private queryParamChanged$ = new Subject<QueryParamChangeEvent>();
public QueryParamChanged$ = this.queryParamChanged$.asObservable();

public NotifyQueryParamsChanged(tabId: string, params: Record<string, string>): void {
    this.queryParamChanged$.next({ TabId: tabId, Params: params });
}
```

### Layer 3: BaseResourceComponent query param lifecycle
**File:** `packages/Angular/Explorer/shared/src/lib/base-resource-component.ts`

```typescript
private _suppressQueryParamSync = false;

/**
 * Called by the framework when query params change from an external source
 * (browser back/forward, deep link navigation).
 * Override in subclasses to react to query param changes.
 * @param params The new query params from the URL
 * @param source 'popstate' for back/forward, 'deeplink' for external URL entry
 */
protected OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    // Default no-op — override in subclasses
}

/**
 * Push query param changes to the URL. Creates a browser history entry.
 * Safe to call during OnQueryParamsChanged — auto-suppressed to prevent loops.
 */
protected UpdateQueryParams(params: Record<string, string | null>): void {
    if (this._suppressQueryParamSync) return;
    this.navigationService.UpdateActiveTabQueryParams(params);
}

/**
 * Read current query params from tab configuration.
 * Use in initDashboard() / ngOnInit() to get initial URL state.
 */
protected GetQueryParams(): Record<string, string> {
    return (this.Data?.Configuration?.['queryParams'] as Record<string, string>) || {};
}
```

**Subscription setup — called automatically from BaseResourceComponent.ngOnInit()**, not left to subclasses. If a subclass forgets to call super.ngOnInit(), back/forward silently won't work — document this requirement.

```typescript
// In BaseResourceComponent.ngOnInit() (or constructor if lifecycle allows)
private setupQueryParamSubscription(): void {
    this.navigationService.QueryParamChanged$
        .pipe(
            // CRITICAL: Filter to only this component's tab — prevents cross-tab leakage
            filter(event => event.TabId === this.getTabId()),
            takeUntil(this.destroy$)
        )
        .subscribe(event => {
            // try/finally ensures suppression flag is always cleared,
            // even if OnQueryParamsChanged throws
            this._suppressQueryParamSync = true;
            try {
                this.OnQueryParamsChanged(event.Params, 'popstate');
            } finally {
                this._suppressQueryParamSync = false;
            }
        });
}

/**
 * Get this component's tab ID from its ResourceData.
 * Used to filter query param notifications to only this tab.
 */
private getTabId(): string {
    return this.Data?.TabId || '';
}
```

**PREREQUISITE — ResourceData.TabId:** `ResourceData` must carry the tab ID so the component knows which tab it belongs to. If `ResourceData` doesn't currently have a `TabId` field, the tab container must set it when assigning `component.Data = resourceData`. **This must be verified and implemented BEFORE Phase 1 starts** — if `getTabId()` returns `''`, the tab-scoping filter matches nothing and back/forward silently breaks for every component.

### Layer 4: buildResourceUrl includes query params on ALL resource types
**File:** `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts`

Extract a shared helper:

```typescript
private appendQueryParams(url: string, queryParams: Record<string, string> | undefined): string {
    if (!queryParams || Object.keys(queryParams).length === 0) return url;
    const separator = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams(queryParams);
    return `${url}${separator}${params.toString()}`;
}
```

Apply to ALL `buildResourceUrl()` return statements for these resource types:
- **Records**: `/app/:appPath/record/:entity/:recordId` (line ~1136)
- **Saved views**: `/app/:appPath/view/:viewId` (line ~1153)
- **Dashboards**: `/app/:appPath/dashboard/:dashboardId` (line ~1160)
- **Artifacts**: `/app/:appPath/artifact/:artifactId` (line ~1168)
- **Queries**: `/app/:appPath/query/:queryId` (line ~1174)
- **Reports**: `/app/:appPath/report/:reportId` (line ~1181)
- **Legacy routes**: Same treatment for `/resource/record/...`, `/resource/view/...`, etc. (lines ~1210-1248)

Example change:
```typescript
// Before
case 'records':
    if (entityName && recordId) {
        return `/app/${encodeURIComponent(appPath)}/record/${encodeURIComponent(entityName)}/${recordId}`;
    }

// After
case 'records':
    if (entityName && recordId) {
        return this.appendQueryParams(
            `/app/${encodeURIComponent(appPath)}/record/${encodeURIComponent(entityName)}/${recordId}`,
            queryParams
        );
    }
```

### Layer 5: Add CLAUDE.md to packages/Angular/Generic/
**File:** `packages/Angular/Generic/CLAUDE.md` (new file)

Document the encapsulation rules for Generic components:
- No `Router`, `ActivatedRoute`, `NavigationEnd`, or any `@angular/router` imports
- No `Location` from `@angular/common` for navigation purposes
- All external state via `@Input()` / `@Output()` / method contracts
- Components must be reusable in any Angular application
- Update `packages/Angular/Generic/README.md` with same rules

### Layer 6: Fix Generic Router Violations

| # | File | Action |
|---|------|--------|
| G1 | `Generic/ai-test-harness/src/lib/ai-test-harness.component.ts` | Remove `import { Router }` (line 2) and `private router: Router` from constructor (line 163) — appears unused |

### Layer 7: Migrate Explorer Dashboard Components

Each of these components currently implements its own NavigationEnd subscription, URL parsing, lastNavigatedUrl tracking, and skipUrlUpdates flag. All of that boilerplate gets replaced with the framework pattern.

#### E1: Data Explorer Dashboard
**File:** `dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`

**Remove (~200 lines):**
- `import { Router, NavigationEnd } from '@angular/router'` (line 2)
- `private router: Router` constructor injection
- `lastNavigatedUrl` property (line 171) and all references
- `skipUrlUpdates` flag (line 168) and all references
- `router.events` / `NavigationEnd` subscription (lines 681-698)
- `onExternalNavigation()` method (lines 2682-2713)
- `parseUrlState()` method (lines 2519-2544)
- `parseUrlFromString()` method (lines 2718-2745)
- `updateUrl()` method (lines 2643-2676)

**Replace with (~30 lines):**
```typescript
async initDashboard() {
    await this.loadEntities();
    const params = this.GetQueryParams();
    if (Object.keys(params).length > 0) this.applyParams(params);
}

protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    this.applyParams(params);
}

private onEntitySelected(entity: EntityInfo): void {
    this.selectedEntity = entity;
    this.stateService.selectEntity(entity.Name);
    this.UpdateQueryParams({ entity: entity.Name, record: null, filter: null });
}

private applyParams(params: Record<string, string>): void {
    const entityName = params['entity'];
    const record = params['record'];
    const filter = params['filter'];
    const view = params['view'] as DataExplorerViewMode | undefined;
    if (view) this.stateService.setViewMode(view);
    if (entityName) {
        const entity = this.entities.find(e => e.Name.toLowerCase() === entityName.toLowerCase());
        if (entity) {
            this.selectedEntity = entity;
            this.stateService.selectEntity(entity.Name);
            if (filter) this.stateService.setSmartFilterPrompt(filter);
            if (record) this.pendingRecordSelection = record;
        }
    } else {
        this.selectedEntity = null;
        this.stateService.selectEntity(null);
        this.stateService.closeDetailPanel();
    }
}
```

Also update all state change handlers (entity selection, filter change, view mode change, record selection) to call `this.UpdateQueryParams(...)` instead of `this.updateUrl()`.

#### E2: Query Browser Resource
**File:** `dashboards/src/QueryBrowser/query-browser-resource.component.ts`

**Remove:** `Router`, `NavigationEnd` import, `router.events` subscription (line 126-128), `router.url` reads (lines 778, 807-808), custom URL parsing/tracking boilerplate.

**Replace:** Override `OnQueryParamsChanged()` for back/forward, call `UpdateQueryParams()` on state changes.

#### E3: MCP Dashboard
**File:** `dashboards/src/MCP/mcp-dashboard.component.ts`

**Remove:** `Router`, `ActivatedRoute`, `NavigationEnd` imports (line 13), `router.events` subscription (lines 379-381), `router.navigate()` calls (lines 1506, 1525), `router.url` reads (lines 337, 344, 519), `lastNavigatedUrl` tracking.

**Replace:** Override `OnQueryParamsChanged()`, call `UpdateQueryParams()`.

#### E4: Action Explorer
**File:** `dashboards/src/Actions/components/explorer/action-explorer.component.ts`

**Remove:** `Router`, `NavigationEnd` import (line 9), `router.events` subscription (lines 108-110), `router.url` reads (lines 121, 272).

**Replace:** Override `OnQueryParamsChanged()`, call `UpdateQueryParams()`.

#### E5: User Notifications (Different Category — Cross-Tab Navigation, Not Query Param Sub-Navigation)
**File:** `explorer-core/src/lib/user-notifications/user-notifications.component.ts`

**Note:** This component is NOT doing query param sub-navigation. It uses Router to navigate to entirely different resources (opening records/views from notification clicks). The fix is to use NavigationService's existing navigation methods, NOT the `OnQueryParamsChanged` pattern.

**Remove:** `import { Router }` (line 5), `router.navigateByUrl()` (line 363), `router.navigate()` (line 366).

**Replace:** Use `NavigationService.OpenEntityRecord()`, `NavigationService.OpenView()`, or `NavigationService.OpenDashboard()` for notification click handlers. The notification data should contain enough info (entity name, record ID, view ID) to call the appropriate NavigationService method.

#### E6: Single Dashboard (unused import)
**File:** `explorer-core/src/lib/single-dashboard/single-dashboard.component.ts`

**Remove:** `import { ActivatedRoute, Router }` (line 8) — appears unused.

#### E7: Simple Record List (unused import)
**File:** `simple-record-list/src/lib/simple-record-list/simple-record-list.component.ts`

**Remove:** `import { Router }` (line 4) — appears unused.

### Layer 8: Migrate Chat Resource Components

#### E8: Chat Tasks Resource
**File:** `explorer-core/src/lib/resource-wrappers/chat-tasks-resource.component.ts`

**Remove:** `skipUrlUpdate` flag, custom `updateUrl()` method, manual URL building.

**Replace:** Override `OnQueryParamsChanged()`, call `UpdateQueryParams({ taskId: ... })`.

#### E9: Chat Collections Resource
**File:** `explorer-core/src/lib/resource-wrappers/chat-collections-resource.component.ts`

**Remove:** `skipUrlUpdate` flag, custom `updateUrl()` method, manual URL building.

**Replace:** Override `OnQueryParamsChanged()`, call `UpdateQueryParams({ collectionId: ..., artifactId: ... })`.

---

## Flow Diagrams

### Forward Navigation (user selects entity)
```
Component.onEntitySelected()
  → this.UpdateQueryParams({ entity: 'Members' })
    → NavigationService.UpdateActiveTabQueryParams()
      → WorkspaceStateManager.UpdateTabConfiguration()
        → BehaviorSubject emits
          → Shell.syncUrlWithWorkspace()
            → buildResourceUrl() includes ?entity=Members via appendQueryParams()
            → router.navigateByUrl('/app/.../Data?entity=Members')
              → Creates browser history entry ✓
              → shouldReuseRoute → true (same path params) → resolver skipped ✓
              → NavigationEnd fires
                → Shell.syncWorkspaceWithUrl()
                  → findTabForUrl() → same tab, same params → no action ✓
```

### Back/Forward Navigation
```
User clicks Back
  → Browser URL changes to ?entity=Members (from ?entity=Products)
    → shouldReuseRoute → true (same path params) → resolver NOT triggered ✓
    → NavigationEnd fires
      → Shell.syncWorkspaceWithUrl()
        → findTabForUrl() → same tab already active
        → extractQueryParamsFromUrl → { entity: 'Members' }
        → tab config has → { entity: 'Products' }
        → DIFFER → urlBasedNavigation = true
        → UpdateTabConfiguration({ queryParams: { entity: 'Members' } })
        → NavigationService.NotifyQueryParamsChanged(tabId, { entity: 'Members' })
          → BaseResourceComponent subscription fires (filtered by TabId match)
            → _suppressQueryParamSync = true
            → Component.OnQueryParamsChanged({ entity: 'Members' }, 'popstate')
              → applyParams() → selects Members entity
              → State changes would normally trigger UpdateQueryParams()
              → But _suppressQueryParamSync = true → skipped ✓
            → _suppressQueryParamSync = false
        → urlBasedNavigation = false
```

---

## Implementation Order

Phases 1-5 are committed work in this plan — none are optional. Phase 6 (declarative adapter) is a separate follow-up plan. Each phase includes writing unit tests for every change made in that phase (see Testing Requirements above).

### Phase 1: Framework Foundation (prerequisite for all migrations)
1. **Layer 0**: Fix `shouldReuseRoute` — eliminate race condition + unit tests
2. **Layer 1**: Shell `syncWorkspaceWithUrl` — detect query param changes on active tab + unit tests for extractQueryParamsFromUrl, queryParamsEqual, and the new branch logic
3. **Layer 2**: NavigationService — add `QueryParamChanged$` observable + unit tests
4. **Layer 3**: BaseResourceComponent — add `OnQueryParamsChanged`, `UpdateQueryParams`, `GetQueryParams` + unit tests for suppression, lifecycle, edge cases
5. **Layer 4**: `buildResourceUrl` — add `appendQueryParams` helper, apply to all resource types + unit tests for every resource type URL

### Phase 2: Enforcement & Documentation
6. **Layer 5**: Add `CLAUDE.md` to `packages/Angular/Generic/` with no-Router rule
7. Update `packages/Angular/Generic/README.md` with encapsulation rules
8. Update `packages/Angular/Explorer/CLAUDE.md` with NavigationService-only rule + `OnQueryParamsChanged` / `UpdateQueryParams` pattern and examples
9. Update `guides/DASHBOARD_BEST_PRACTICES.md` with query param sub-navigation pattern

### Phase 3: Component Migrations + Per-Component Tests
**⚠️ PREREQUISITE: Phase 1 must be complete and building cleanly before starting Phase 3.** Phase 1 changes are load-bearing for every navigation path — they must be stable before components are migrated to depend on them.

Once Phase 1 is complete, these migrations are independent and can be parallelized. **Each migration includes unit tests** for `OnQueryParamsChanged`, `UpdateQueryParams`, and `applyParams` logic in that component.

**Query param sub-navigation migrations** (use `OnQueryParamsChanged` + `UpdateQueryParams`):
10. **E1**: Migrate Data Explorer Dashboard + tests
11. **E2**: Migrate Query Browser Resource + tests
12. **E3**: Migrate MCP Dashboard + tests
13. **E4**: Migrate Action Explorer + tests
14. **E8**: Migrate Chat Tasks Resource + tests
15. **E9**: Migrate Chat Collections Resource + tests

**Cross-tab navigation migration** (different pattern — use NavigationService navigation methods):
16. **E5**: Migrate User Notifications — replace `router.navigateByUrl()` / `router.navigate()` with `NavigationService.OpenEntityRecord()` etc. + tests

**Dead import cleanup** (trivial — just remove unused imports, verify build):
17. **G1**: Fix `ai-test-harness.component.ts` — remove unused Router import
18. **E6**: Clean up Single Dashboard — remove unused Router/ActivatedRoute import
19. **E7**: Clean up Simple Record List — remove unused Router import

### Phase 4: Integration Verification & End-to-End Tests
20. Build all affected packages — verify zero compilation errors
21. Run full unit test suite — verify all new + existing tests pass
22. Manual integration tests (see full list in Testing Requirements above):
    - Back/forward with query param changes (golden path)
    - Deep link paste with no open tab
    - Deep link reload
    - Nav item switching regression
    - Tab switching regression
    - Record/view/dashboard opening
    - App switching regression
    - Rapid navigation (5 entities, back 5 times)
    - Query param + nav item combo history
    - Forward after back
    - Multiple query params preserved across back/forward

### Phase 5: Comprehensive Navigation Guide
After Phases 1-4 are complete and verified, write a permanent developer guide documenting how navigation, routing, URL management, and back/forward work in MJ Explorer. Most content derives from this plan, rewritten to reflect the implemented architecture rather than planned changes.

23. **Create guide:** `packages/Angular/Explorer/docs/NAVIGATION_AND_ROUTING_GUIDE.md` (or `guides/NAVIGATION_AND_ROUTING_GUIDE.md` if preferred at repo root alongside existing guides)
24. **Link from README:** Add reference to the guide from `packages/Angular/Explorer/README.md`
25. **Link from CLAUDE.md files:** Reference the guide from `packages/Angular/Explorer/CLAUDE.md` and `packages/Angular/Generic/CLAUDE.md`

**Guide contents (derived from this plan):**

- **Architecture overview**: Shell owns all URL ↔ workspace sync. Components never touch Router directly.
- **How URL sync works**: `syncUrlWithWorkspace` (workspace → URL) and `syncWorkspaceWithUrl` (URL → workspace, including query param detection on active tab). Include the flow diagrams from this plan.
- **How back/forward works**: `shouldReuseRoute` skips resolver for query-param-only changes, shell detects query param diff, notifies component via `NavigationService.QueryParamChanged$` (tab-scoped).
- **How to add query param sub-navigation to a new component**: Step-by-step with code examples:
  1. Override `OnQueryParamsChanged(params, source)` to react to back/forward
  2. Call `this.UpdateQueryParams(...)` when internal state changes
  3. Call `this.GetQueryParams()` in `initDashboard()` for initial URL state
  4. That's it — no Router imports, no NavigationEnd subscriptions, no URL parsing
- **How `buildResourceUrl` preserves query params**: The `appendQueryParams` helper and which resource types support it (all of them).
- **Rules for Generic vs Explorer components**: No Router in Generic (use @Input/@Output), NavigationService-only in Explorer.
- **Allowed Router exceptions**: Shell, app-routing, AuthGuard, OAuth callback, NavigationService.
- **Multi-tab isolation**: How `QueryParamChangeEvent.TabId` scoping prevents cross-tab leakage.
- **Common pitfalls**: Forgetting `super.ngOnInit()` (breaks subscription setup), calling Router directly instead of `UpdateQueryParams`, not using try/finally around suppression flags.
- **Deep link behavior**: URL always wins over persisted state when present. How ResourceResolver handles fresh deep links vs back/forward.


---

## Testing Requirements

**Every layer of this plan requires unit tests.** This is not optional. The navigation system is the most load-bearing part of the Explorer — a regression here affects every user on every click. Tests must cover the golden path, edge cases, and race conditions.

### Phase 1 Unit Tests (Framework Foundation)

**Layer 0: shouldReuseRoute**
- Same route config, same path params, different query params → returns `true`
- Same route config, different path params → returns `false`
- Different route config → returns `false`
- Same everything → returns `true`
- Null/undefined params edge cases

**Layer 1: Shell syncWorkspaceWithUrl query param detection**
- Active tab with matching path, different query params → updates tab config + notifies
- Active tab with matching path, same query params → no action
- Active tab with matching path, URL has no query params, tab has params → clears params + notifies
- Active tab with matching path, URL has params, tab has none → sets params + notifies
- `urlBasedNavigation` flag prevents `syncUrlWithWorkspace` from firing during update
- Different tab matches → activates that tab (existing behavior, regression test)
- No tab matches → calls `handleMissingTabForUrl` (existing behavior, regression test)

**Layer 1: extractQueryParamsFromUrl**
- URL with query params → returns correct Record
- URL without query params → returns empty Record
- URL with encoded values (`%20`, `+`) → decodes correctly
- URL with empty values (`?key=`) → handles correctly
- URL with fragment (`#hash`) → ignores fragment

**Layer 1: queryParamsEqual**
- Same keys and values → returns `true`
- Different values → returns `false`
- Different number of keys → returns `false`
- Both empty → returns `true`
- One empty, one not → returns `false`

**Layer 2: NavigationService.NotifyQueryParamsChanged**
- Emitting on `QueryParamChanged$` delivers to subscribers filtered by TabId
- Multiple subscribers all receive notification for their tab only
- Notification for tab A does NOT reach component in tab B (multi-tab isolation)
- No subscribers → no error

**Layer 3: BaseResourceComponent**
- `UpdateQueryParams` calls `NavigationService.UpdateActiveTabQueryParams` when not suppressed
- `UpdateQueryParams` is a no-op when `_suppressQueryParamSync` is `true`
- `GetQueryParams` returns params from `Data.Configuration.queryParams`
- `GetQueryParams` returns empty Record when no params set
- `OnQueryParamsChanged` subscription sets `_suppressQueryParamSync` before calling override
- `OnQueryParamsChanged` subscription clears `_suppressQueryParamSync` after override (even if override throws)

**Layer 4: appendQueryParams helper**
- URL without existing params + query params → `url?key=value`
- URL with existing params + query params → `url?existing=x&key=value`
- URL + empty/undefined query params → returns URL unchanged
- URL + params with special characters → properly encoded

**Layer 4: buildResourceUrl query param coverage**
- Each resource type (records, views, dashboards, artifacts, queries, reports) includes query params in output URL
- Each legacy route includes query params in output URL
- Nav item URLs still include query params (regression)
- Search URLs still include query params (regression)

### Phase 3 Unit Tests (Component Migrations)

Each migrated component needs tests for:
- `OnQueryParamsChanged` correctly applies state from params
- `OnQueryParamsChanged` with empty params resets to default state
- `OnQueryParamsChanged` with partial params applies what's present
- `UpdateQueryParams` is called with correct params on user interaction
- `GetQueryParams` returns correct initial params on init
- State changes during `OnQueryParamsChanged` do NOT trigger `UpdateQueryParams` (suppression works)

### Phase 4 Integration / Manual Test Cases

These verify the full end-to-end flow across layers:

1. **Back/forward with query param changes** — select entities in Data Explorer, verify back/forward restores correct entity
2. **Deep link paste** — paste URL with `?entity=Members` into address bar with no open tab, verify tab is created with correct state
3. **Deep link reload** — reload browser on URL with query params, verify correct state is restored
4. **Nav item switching regression** — switch between Knowledge Hub tabs, verify back/forward still works
5. **Tab switching regression** — switch between pinned tabs, verify correct tab activates
6. **Record opening** — open a record from Data Explorer grid, verify it opens correctly
7. **App switching regression** — switch between Data Explorer and Knowledge Hub, verify correct app activates
8. **Rapid navigation** — quickly select 5 entities in sequence, then back 5 times — each state should restore in order
9. **Query param + nav item combo** — navigate between nav items AND change query params, verify full history is correct
10. **Forward after back** — go back 3 steps, then forward 2 steps, verify correct state
11. **Multiple query params** — entity + filter + view mode all in URL, back/forward preserves all three
12. **Multi-tab isolation** — open two Data Explorer instances in different apps (pinned tabs), back/forward in one does NOT affect the other


---

## Risk Assessment & Rollback

### Highest Risk: Layer 0 (`shouldReuseRoute`) + Layer 1 (shell `syncWorkspaceWithUrl`)
These changes are load-bearing for every navigation path in the application. A bug here could break all tab switching, not just query param back/forward.

**Mitigation:**
- Phase 1 should be tested extensively in isolation before any Phase 3 work begins
- The shell's new `else if` branch could be gated behind a check (e.g., only activate when the URL actually has query params) to minimize blast radius
- If Phase 1 introduces a regression, the `else if` branch can be commented out to restore current behavior (back/forward within tabs stays broken, but nothing else regresses)

### Required Manual Test Cases for Phase 1 Sign-Off
1. **Back/forward with query param changes** — select entities in Data Explorer, verify back/forward works
2. **Deep link paste** — paste `?entity=Members` into address bar with no open tab, verify tab is created correctly
3. **Nav item switching** — switch between Knowledge Hub tabs (Search, Classify, Analytics), verify back/forward still works
4. **Tab switching** — switch between pinned tabs, verify correct tab activates
5. **Record opening** — open a record from within Data Explorer, verify it opens in new tab/replaces temp tab correctly
6. **App switching** — switch between Data Explorer and Knowledge Hub apps, verify correct app activates
7. **Fresh page load** — reload browser on a URL with query params, verify correct state is restored

---


---

## Files Touched (Complete List)

| File | Phase | Change |
|------|-------|--------|
| `explorer-core/src/app-routing.module.ts` | 1 | Fix `shouldReuseRoute` to ignore query params |
| `explorer-core/src/lib/shell/shell.component.ts` | 1 | Add query param detection in `syncWorkspaceWithUrl` + `appendQueryParams` helper in `buildResourceUrl` |
| `shared/src/lib/navigation.service.ts` | 1 | Add `QueryParamChanged$` observable + `NotifyQueryParamsChanged` |
| `shared/src/lib/base-resource-component.ts` | 1 | Add `OnQueryParamsChanged`, `UpdateQueryParams`, `GetQueryParams`, `setupQueryParamSubscription` |
| `packages/Angular/Generic/README.md` | 2 | Update with encapsulation rules |
| `guides/DASHBOARD_BEST_PRACTICES.md` | 2 | Document `OnQueryParamsChanged` pattern |
| `Generic/ai-test-harness/src/lib/ai-test-harness.component.ts` | 3 | Remove unused Router import + constructor param |
| `dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` | 3 | Remove ~200 lines boilerplate, use framework |
| `dashboards/src/QueryBrowser/query-browser-resource.component.ts` | 3 | Remove boilerplate, use framework |
| `dashboards/src/MCP/mcp-dashboard.component.ts` | 3 | Remove boilerplate, use framework |
| `dashboards/src/Actions/components/explorer/action-explorer.component.ts` | 3 | Remove boilerplate, use framework |
| `explorer-core/src/lib/user-notifications/user-notifications.component.ts` | 3 | Replace Router with NavigationService methods |
| `explorer-core/src/lib/single-dashboard/single-dashboard.component.ts` | 3 | Remove unused Router/ActivatedRoute import |
| `simple-record-list/src/lib/simple-record-list/simple-record-list.component.ts` | 3 | Remove unused Router import |
| `explorer-core/src/lib/resource-wrappers/chat-tasks-resource.component.ts` | 3 | Remove boilerplate, use framework |
| `explorer-core/src/lib/resource-wrappers/chat-collections-resource.component.ts` | 3 | Remove boilerplate, use framework |
| `packages/Angular/Explorer/docs/NAVIGATION_AND_ROUTING_GUIDE.md` | 5 | New file — comprehensive navigation/routing/back-forward developer guide |
| `packages/Angular/Explorer/README.md` | 5 | Link to new navigation guide |
| `packages/Angular/Explorer/CLAUDE.md` | 2, 5 | Phase 2: add NavigationService-only rule. Phase 5: add link to navigation guide |
| `packages/Angular/Generic/CLAUDE.md` | 2, 5 | Phase 2: add no-Router rule. Phase 5: add link to navigation guide |
