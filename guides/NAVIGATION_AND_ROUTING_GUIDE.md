# MJ Explorer Navigation and Routing Guide

This guide documents the navigation and URL management architecture in MJ Explorer. It is a developer reference for the implemented system — covering how the shell owns URL state, how back/forward navigation works, and how to add URL-synced sub-navigation to a new component.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How URL Sync Works](#how-url-sync-works)
3. [How Back/Forward Works](#how-backforward-works)
4. [URL Structure Reference](#url-structure-reference)
5. [How to Add Query Param Sub-Navigation to a New Component](#how-to-add-query-param-sub-navigation-to-a-new-component)
6. [Rules for Generic vs Explorer Components](#rules-for-generic-vs-explorer-components)
7. [Multi-Tab Isolation](#multi-tab-isolation)
8. [Deep Link Behavior](#deep-link-behavior)
9. [super.ngOnInit() and super.ngOnDestroy() Are Required](#superonginit-and-superngondestroy-are-required)
10. [Common Pitfalls](#common-pitfalls)
11. [Key Files](#key-files)

---

## Architecture Overview

The shell component (`ShellComponent`) is the single owner of all URL ↔ workspace synchronization. No resource component, dashboard, or feature module ever calls `Router.navigate()` directly.

The workspace state is the source of truth for what tabs are open and which is active. The URL is a *reflection* of that state, not a driver of it. This one-way authority prevents feedback loops and makes the system predictable.

```
User click → NavigationService method
          → WorkspaceStateManager.OpenTab / SetActiveTab / UpdateTabConfiguration
          → configuration$ BehaviorSubject emits
          → Shell's subscription fires syncUrlWithWorkspace()
          → Router.navigateByUrl(resourceUrl)
```

The reverse path (browser back/forward):

```
Browser popstate → Angular Router fires NavigationEnd
                → Shell's syncWorkspaceWithUrl()
                → WorkspaceStateManager.SetActiveTab / UpdateTabConfiguration
                → NavigationService.NotifyQueryParamsChanged()
                → BaseResourceComponent.OnQueryParamsChanged()
```

**Key rule:** Components never touch the Router. The shell is the only component that imports `Router`, `ActivatedRoute`, or `NavigationEnd` (plus the infrastructure-only files: `AppRoutingModule`, `AuthGuard`, `OAuthCallbackComponent`, `ResourceResolver`, `NavigationService` itself).

---

## How URL Sync Works

### Workspace → URL (`syncUrlWithWorkspace`)

The shell subscribes to `WorkspaceStateManager.Configuration` (a `BehaviorSubject<WorkspaceConfiguration | null>`). Every time the workspace changes — a tab opens, closes, is activated, or has its configuration updated — the BehaviorSubject emits and the shell calls `syncUrlWithWorkspace()`.

```typescript
this.workspaceManager.Configuration.subscribe(async config => {
    if (config && this.initialized) {
        await this.syncActiveAppWithTab(config);
        this.syncUrlWithWorkspace(config);
        this.updateBrowserTitle(config);
    }
});
```

`syncUrlWithWorkspace()` finds the active tab, calls `buildResourceUrl()` to generate the canonical URL for that tab's resource, compares it to the current `Router.url`, and if they differ, calls `router.navigateByUrl()`. Before navigating it calls `tabService.SuppressNextResolve()` so the `ResourceResolver` knows this navigation is a URL sync, not a user-initiated deep link.

The first time this sync fires after initialization it uses `replaceUrl: true` so the initial page load does not create an extra browser history entry. All subsequent syncs use the default `pushState` behavior.

The `urlBasedNavigation` flag short-circuits `syncUrlWithWorkspace()` during deep link initialization and back/forward handling to prevent the shell from fighting itself.

### URL → Workspace (`syncWorkspaceWithUrl`)

The shell also subscribes to `Router.events` filtered for `NavigationEnd`. Every `NavigationEnd` that fires while `initialized` is true calls `syncWorkspaceWithUrl()`.

```typescript
this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd)
).subscribe(event => {
    if (this.initialized) {
        this.syncWorkspaceWithUrl(event.urlAfterRedirects || event.url);
    }
});
```

`syncWorkspaceWithUrl()` searches all open tabs for one whose resource matches the incoming URL. If a different tab matches, `WorkspaceStateManager.SetActiveTab()` is called. If the same tab is already active but the query params differ (e.g., back/forward within a nav item), the tab's configuration is updated and `NavigationService.NotifyQueryParamsChanged()` is called so the component inside that tab can react.

### `buildResourceUrl` and the `appendQP` Helper

`buildResourceUrl(tab)` takes a `WorkspaceTab` and returns the canonical URL string for that resource. The output format depends on the resource type:

| Resource Type | URL Pattern |
|---|---|
| Nav item (static) | `/app/:appPath/:navItemName` |
| App default (no nav items) | `/app/:appPath` |
| Entity record | `/app/:appPath/record/:entityName/:recordId` |
| Saved view | `/app/:appPath/view/:viewId` |
| Dynamic view | `/app/:appPath/view/dynamic/:entityName?ExtraFilter=...` |
| Dashboard | `/app/:appPath/dashboard/:dashboardId` |
| Artifact | `/app/:appPath/artifact/:artifactId` |
| Query | `/app/:appPath/query/:queryId` |
| Report | `/app/:appPath/report/:reportId` |
| Search results | `/app/:appPath/search/:searchInput` |

The `appendQP` helper is a closure inside `buildResourceUrl` that appends the tab's stored `queryParams` to any URL:

```typescript
const appendQP = (url: string): string => {
    if (!queryParams || Object.keys(queryParams).length === 0) return url;
    const separator = url.includes('?') ? '&' : '?';
    const params = new URLSearchParams(queryParams);
    return `${url}${separator}${params.toString()}`;
};
```

This ensures sub-navigation state (e.g., selected entity, active tab) is preserved in the URL whenever the workspace changes.

### Deep Link Initialization Sequence

When the user lands on a deep link URL (e.g., `/app/knowledge-hub/Search?entity=Companies`):

1. The `MJEventType.LoggedIn` event fires after metadata loads.
2. The shell waits for `NavigationEnd` to ensure the Router URL is set, then calls `initializeShell()`.
3. `urlBasedNavigation` is set to `true` (detected because the URL contains `/app/` or `/resource/`).
4. `ResourceResolver` has already run (it runs before the shell initializes) and queued a `TabRequest` in `TabService`.
5. The shell processes queued `TabRequest`s from `TabService.GetQueuedRequests()`, calling `WorkspaceStateManager.OpenTab()` for each.
6. After processing queued requests, `urlBasedNavigation` is cleared.
7. The workspace → URL subscription fires for subsequent changes normally.

---

## How Back/Forward Works

### `shouldReuseRoute` Compares Only Path Params, Not Query Params

`CustomReuseStrategy` implements Angular's `RouteReuseStrategy`. Its `shouldReuseRoute` method intentionally excludes query params:

```typescript
shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig &&
           this.objectContentsEqual(future.params, curr.params);
}
```

This means when the user presses back/forward and only query params change (e.g., going from `/app/home/Search?entity=Companies` back to `/app/home/Search`), Angular considers this the *same route* and does not re-run the `ResourceResolver`. The shell's `NavigationEnd` subscription detects the query param delta and handles it entirely in `syncWorkspaceWithUrl()`.

If `shouldReuseRoute` included query params, back/forward on query param changes would re-trigger the `ResourceResolver`, which would race against `syncWorkspaceWithUrl()` and potentially open a duplicate tab.

### The `urlBasedNavigation` Flag Prevents Loops

When `syncWorkspaceWithUrl()` updates a tab's configuration (updating `queryParams` stored in the tab), that write triggers the `configuration$` BehaviorSubject to emit, which would normally call `syncUrlWithWorkspace()` — which would then re-navigate the Router — creating an infinite loop.

This is prevented by setting `urlBasedNavigation = true` before updating the tab configuration and clearing it in a `finally` block:

```typescript
this.urlBasedNavigation = true;
try {
    this.workspaceManager.UpdateTabConfiguration(matchingTab.id, {
        queryParams: Object.keys(urlParams).length > 0 ? urlParams : undefined
    });
    this.navigationService.NotifyQueryParamsChanged(matchingTab.id, urlParams);
} finally {
    this.urlBasedNavigation = false;
}
```

`syncUrlWithWorkspace()` checks this flag and returns early when it is true. This works reliably because `UpdateTabConfiguration` triggers the BehaviorSubject synchronously (within the same call stack), so `syncUrlWithWorkspace()` sees the flag set when it runs.

### `_suppressQueryParamSync` Prevents Component → URL Loops

When `NavigationService.NotifyQueryParamsChanged()` fires, `BaseResourceComponent`'s subscription calls `OnQueryParamsChanged()`. If the component calls `UpdateQueryParams()` inside `OnQueryParamsChanged()` (e.g., to normalize a value), that would push a change back to the URL, triggering another `NavigationEnd`, triggering `NotifyQueryParamsChanged()` again.

`BaseResourceComponent` uses `_suppressQueryParamSync` to break this loop:

```typescript
this._suppressQueryParamSync = true;
try {
    this.OnQueryParamsChanged(event.Params, 'popstate');
} finally {
    this._suppressQueryParamSync = false;
}
```

And `UpdateQueryParams()` respects it:

```typescript
protected UpdateQueryParams(params: Record<string, string | null>): void {
    if (this._suppressQueryParamSync) return;
    this.navigationService.UpdateActiveTabQueryParams(params);
}
```

---

## URL Structure Reference

### App-Scoped URLs (Primary Pattern)

```
/app/:appPath                                    App default (no nav items)
/app/:appPath/:navItemName                       Named nav item
/app/:appPath/record/:entityName/:recordId       Entity record
/app/:appPath/view/:viewId                       Saved view
/app/:appPath/view/dynamic/:entityName           Dynamic view
/app/:appPath/dashboard/:dashboardId             Dashboard
/app/:appPath/artifact/:artifactId               Artifact
/app/:appPath/query/:queryId                     Query
/app/:appPath/report/:reportId                   Report
/app/:appPath/search/:searchInput                Search results
```

`:appPath` uses `Application.Path` (URL-safe slug) and falls back to `Application.Name` for backward compatibility.

### Legacy Resource URLs (Backward Compatible)

```
/resource/record/:entityName/:recordId
/resource/view/:viewId
/resource/view/dynamic/:entityName
/resource/dashboard/:dashboardId
/resource/artifact/:artifactId
/resource/query/:queryId
/resource/search/:searchInput
```

Legacy URLs continue to work. They are not redirected to app-scoped URLs automatically, but newly created tabs always use the app-scoped pattern.

### Query Params on Nav Item URLs

Sub-navigation state is appended directly to the nav item URL:

```
/app/knowledge-hub/Search?entity=Companies
/app/data-explorer/Entity%20Browser?entity=Users&record=abc-123
```

These params are stored in `tab.configuration.queryParams` by the `WorkspaceStateManager` and serialized into the URL by `buildResourceUrl` via `appendQP`.

---

## How to Add Query Param Sub-Navigation to a New Component

Use this pattern for any resource component that needs URL-synced sub-navigation (selected items, active tabs, filter state, etc.).

### Step 1: Read Initial Params in `ngOnInit` or `loadData`

```typescript
async ngOnInit(): Promise<void> {
    await super.ngOnInit(); // REQUIRED — sets up query param subscription

    const params = this.GetQueryParams();
    if (params['entity']) {
        await this.selectEntity(params['entity']);
    }
    if (params['record']) {
        await this.loadRecord(params['record']);
    }

    this.NotifyLoadComplete(); // Required for shell loading screen
}
```

`GetQueryParams()` reads `this.Data.Configuration['queryParams']` which is pre-populated from the URL when the tab is created by `ResourceResolver`.

### Step 2: Override `OnQueryParamsChanged` for Back/Forward

```typescript
protected override OnQueryParamsChanged(
    params: Record<string, string>,
    source: 'popstate' | 'deeplink'
): void {
    // Called by BaseResourceComponent when back/forward changes query params
    // on this component's tab. _suppressQueryParamSync is active, so
    // UpdateQueryParams() calls here are safely ignored.
    this.applyParams(params);
}

private applyParams(params: Record<string, string>): void {
    const entity = params['entity'] || null;
    const record = params['record'] || null;
    this.selectEntity(entity);
    if (record) this.loadRecord(record);
}
```

The `source` parameter distinguishes browser back/forward (`'popstate'`) from an external URL the user navigated to directly (`'deeplink'`). In practice both cases apply the same URL state; the distinction is available if different loading behavior is needed.

### Step 3: Push State Changes to URL on User Interaction

```typescript
onEntitySelected(entity: EntityInfo): void {
    this.selectedEntity = entity;
    this.selectedRecord = null;

    // Push to URL — creates a browser history entry
    // null values remove the param from the URL
    this.UpdateQueryParams({
        entity: entity.Name,
        record: null   // remove 'record' param when entity changes
    });
}

onRecordSelected(recordId: string): void {
    this.selectedRecordId = recordId;
    this.UpdateQueryParams({ record: recordId });
}
```

`UpdateQueryParams()` calls `NavigationService.UpdateActiveTabQueryParams()`, which merges the new params into the tab's `configuration.queryParams`, triggering the workspace `configuration$` BehaviorSubject to emit, which causes `syncUrlWithWorkspace()` to push the updated URL into the browser history.

### Complete Example

```typescript
@RegisterClass(BaseResourceComponent, 'MyDashboard')
@Component({ selector: 'mj-my-dashboard', ... })
export class MyDashboardComponent extends BaseResourceComponent implements OnInit, OnDestroy {

    SelectedEntity: string | null = null;
    SelectedRecordId: string | null = null;

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit(); // Sets up query param subscription — MUST be first

        const params = this.GetQueryParams();
        await this.applyParams(params);

        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy(); // Completes destroy$ Subject
    }

    protected override OnQueryParamsChanged(
        params: Record<string, string>,
        source: 'popstate' | 'deeplink'
    ): void {
        this.applyParams(params);
    }

    private async applyParams(params: Record<string, string>): Promise<void> {
        if (params['entity']) {
            this.SelectedEntity = params['entity'];
        }
        if (params['record']) {
            this.SelectedRecordId = params['record'];
        }
    }

    OnEntityClicked(entityName: string): void {
        this.SelectedEntity = entityName;
        this.SelectedRecordId = null;
        this.UpdateQueryParams({ entity: entityName, record: null });
    }

    OnRecordClicked(recordId: string): void {
        this.SelectedRecordId = recordId;
        this.UpdateQueryParams({ record: recordId });
    }

    // Required by BaseResourceComponent
    async GetResourceDisplayName(data: ResourceData): Promise<string> { return 'My Dashboard'; }
    async GetResourceIconClass(data: ResourceData): Promise<string> { return 'fa-solid fa-chart-bar'; }
}
```

---

## Rules for Generic vs Explorer Components

### Generic Components (`packages/Angular/Generic/`)

Generic components are designed to be reusable outside MJ Explorer in any Angular application. They **must not** import anything from `@angular/router`.

```typescript
// ❌ BAD — Router in a generic component
import { Router } from '@angular/router';

// ✅ GOOD — accept state via @Input, emit events via @Output
@Component({ ... })
export class MyGenericListComponent {
    @Input() SelectedId: string | null = null;
    @Output() ItemSelected = new EventEmitter<string>();
}
```

The parent Explorer component owns routing; generic components receive derived state via inputs and surface user intent via outputs.

### Explorer Components (`packages/Angular/Explorer/`)

Resource components and dashboards in `packages/Angular/Explorer/` **must** use `NavigationService` for all navigation. Never inject `Router` or `ActivatedRoute` in these components.

```typescript
// ❌ BAD
import { Router } from '@angular/router';
export class MyDashboard {
    private router = inject(Router);
    onItemClick(id: string) { this.router.navigate(['/app/home/record/Entity', id]); }
}

// ✅ GOOD
export class MyDashboard extends BaseResourceComponent {
    // navigationService is injected by BaseResourceComponent
    onEntityRecordClick(entityName: string, pkey: CompositeKey) {
        this.navigationService.OpenEntityRecord(entityName, pkey);
    }
    onDashboardClick(id: string, name: string) {
        this.navigationService.OpenDashboard(id, name);
    }
}
```

### Allowed Exceptions (Router Access Permitted)

The following infrastructure files may import `Router`, `ActivatedRoute`, or `NavigationEnd` directly:

| File | Reason |
|---|---|
| `shell.component.ts` | Owns URL ↔ workspace synchronization |
| `app-routing.module.ts` | Defines all routes and `CustomReuseStrategy` |
| `AuthGuardService` | Route guard that must check authentication |
| `OAuthCallbackComponent` | Handles OAuth redirect, must read the current URL |
| `NavigationService` | Wraps all navigation for the rest of the app |
| `ResourceResolver` | Angular route resolver that creates tabs from URLs |

---

## Multi-Tab Isolation

MJ Explorer is a multi-tab workspace. Multiple resource components can be alive in the DOM simultaneously, each in its own Golden Layout panel. The query param notification system must not let tab A's back/forward navigation affect tab B's component.

Isolation is achieved by scoping every `QueryParamChangeEvent` to a tab ID:

```typescript
export interface QueryParamChangeEvent {
    TabId: string;
    Params: Record<string, string>;
}
```

`NavigationService.NotifyQueryParamsChanged(tabId, params)` emits this event only for the specific tab whose query params changed.

`BaseResourceComponent.setupQueryParamSubscription()` filters the stream using the component's own tab ID:

```typescript
private setupQueryParamSubscription(): void {
    this.navigationService.QueryParamChanged$
        .pipe(
            filter(event => event.TabId === this.getTabId()),
            takeUntil(this.destroy$)
        )
        .subscribe(event => { ... });
}

private getTabId(): string {
    return this.Data?.Configuration?.['tabId'] as string || '';
}
```

The tab ID is stamped into `Data.Configuration['tabId']` by `WorkspaceStateManager` when the component is loaded into its panel. Components receive this through their `ResourceData.Configuration` (not injected separately).

---

## Deep Link Behavior

When a user navigates directly to a URL (bookmark, shared link, browser reload):

1. The `ResourceResolver` runs synchronously during route resolution — before the shell has initialized.
2. `ResourceResolver` queues a `TabRequest` in `TabService` (it cannot open tabs directly because the `WorkspaceStateManager` is not yet ready).
3. The shell initializes, calls `tabService.GetQueuedRequests()`, and processes each request by calling `WorkspaceStateManager.OpenTab()`.
4. Because a tab is being created fresh (not reused from a prior navigation), `shouldReuseRoute` is never consulted — there is no existing route to reuse. The `ResourceResolver` is the only path to tab creation for deep links.
5. `ResourceResolver` also copies the URL's query params into the tab's `configuration.queryParams`. This is how the component receives `GetQueryParams()` values matching the deep link URL.

The URL is therefore always authoritative on first load. Persisted workspace state from a prior session does not override the URL — the tab created by `ResourceResolver` has precedence.

---

## `super.ngOnInit()` and `super.ngOnDestroy()` Are Required

`BaseResourceComponent` uses `ngOnInit` and `ngOnDestroy` for framework infrastructure:

- `ngOnInit()` calls `setupQueryParamSubscription()`, which subscribes to `NavigationService.QueryParamChanged$` filtered by tab ID.
- `ngOnDestroy()` completes the `destroy$` Subject, which unsubscribes all `takeUntil(this.destroy$)` streams.

If a subclass overrides these without calling `super`, the query param subscription is never created, back/forward navigation silently does nothing, and subscriptions leak.

```typescript
// ❌ WRONG — subscription never set up
export class MyDashboard extends BaseResourceComponent implements OnInit {
    async ngOnInit(): Promise<void> {
        await this.loadData(); // super.ngOnInit() was skipped
    }
}

// ✅ CORRECT — always call super first
export class MyDashboard extends BaseResourceComponent implements OnInit, OnDestroy {
    async ngOnInit(): Promise<void> {
        await super.ngOnInit(); // sets up query param subscription
        await this.loadData();
        this.NotifyLoadComplete();
    }

    override ngOnDestroy(): void {
        super.ngOnDestroy(); // completes destroy$, tears down subscriptions
        // add any component-specific cleanup here
    }
}
```

---

## Common Pitfalls

### Forgetting `super.ngOnInit()`

Symptom: `OnQueryParamsChanged` is never called. Back/forward within a nav item appears to do nothing.

Fix: Add `await super.ngOnInit()` as the first line of every overriding `ngOnInit()`.

### Importing Router Directly in a Resource Component

Symptom: Navigation works but breaks URL sync, or double history entries appear.

Fix: Remove the `Router` import and replace calls with the appropriate `NavigationService` method (`OpenEntityRecord`, `OpenDashboard`, `UpdateActiveTabQueryParams`, etc.).

### Declaring `private destroy$` in a Subclass

`BaseResourceComponent` already declares `protected destroy$`. If a subclass declares a new `private destroy$`, the base class's teardown wires to the base-class field, the subclass's operators (likely using `takeUntil(this.destroy$)`) wire to the private field, and neither tears down the other.

```typescript
// ❌ WRONG — shadows base class destroy$
export class MyDashboard extends BaseResourceComponent {
    private destroy$ = new Subject<void>(); // conflicts
}

// ✅ CORRECT — use inherited destroy$
export class MyDashboard extends BaseResourceComponent {
    // No destroy$ declaration — use the inherited protected one
    someObs$.pipe(takeUntil(this.destroy$)).subscribe(...);
}
```

### Declaring `private navigationService` in a Subclass

`BaseResourceComponent` already injects `protected navigationService`. Declaring it again in a subclass causes Angular to inject a second instance and the two fields shadow each other.

```typescript
// ❌ WRONG
export class MyDashboard extends BaseResourceComponent {
    private navigationService = inject(NavigationService); // conflicts
}

// ✅ CORRECT — use inherited navigationService
export class MyDashboard extends BaseResourceComponent {
    onItemClick(id: string): void {
        this.navigationService.OpenDashboard(id, 'My Dashboard');
    }
}
```

### Calling `UpdateQueryParams` Outside a User Action

Calling `UpdateQueryParams()` programmatically during data loading (not in response to a user gesture) produces spurious history entries. The URL reflects what the user chose to navigate to, not intermediate loading states.

```typescript
// ❌ BAD — creates history entry on every data load
async loadData(): Promise<void> {
    const records = await this.fetchRecords();
    if (records.length > 0) {
        this.UpdateQueryParams({ record: records[0].ID }); // spurious entry
    }
}

// ✅ GOOD — only update on explicit user selection
onRecordSelected(id: string): void {
    this.selectedRecord = id;
    this.UpdateQueryParams({ record: id }); // intentional history entry
}
```

### Forgetting `NotifyLoadComplete()`

Symptom: When navigating directly to a deep link URL, the shell loading screen never clears.

Fix: Call `this.NotifyLoadComplete()` at the end of `ngOnInit()` (or after `loadData()` completes for `BaseDashboard` subclasses, which handle this automatically).

---

## Key Files

| File | Package | Description |
|---|---|---|
| `shell.component.ts` | `@memberjunction/ng-explorer-core` | Owns URL ↔ workspace sync. Contains `syncUrlWithWorkspace`, `syncWorkspaceWithUrl`, `buildResourceUrl`, `urlBasedNavigation` flag. |
| `app-routing.module.ts` | `@memberjunction/ng-explorer-core` | Defines all routes. Contains `CustomReuseStrategy` (excludes query params from `shouldReuseRoute`) and `ResourceResolver` (creates tabs from deep link URLs). |
| `navigation.service.ts` | `@memberjunction/ng-shared` | Central navigation API for resource components. Contains all `Open*` methods, `UpdateActiveTabQueryParams`, `NotifyQueryParamsChanged`, and `QueryParamChanged$` observable. |
| `navigation.interfaces.ts` | `@memberjunction/ng-shared` | `NavigationOptions` type used by all `Open*` methods. |
| `base-resource-component.ts` | `@memberjunction/ng-shared` | Base class for all resource components. Contains `setupQueryParamSubscription`, `GetQueryParams`, `UpdateQueryParams`, `OnQueryParamsChanged`, `_suppressQueryParamSync`, `destroy$`, `NotifyLoadComplete`. |
| `base-navigation-component.ts` | `@memberjunction/ng-shared` | Thin base class above `BaseResourceComponent` that extends `BaseAngularComponent`. |
| `workspace-state-manager.ts` | `@memberjunction/ng-base-application` | Manages workspace state (tabs, active tab, configuration). `Configuration` is the `BehaviorSubject<WorkspaceConfiguration | null>` the shell subscribes to. `UpdateTabConfiguration` merges partial config updates into a tab and triggers emission. |
| `tab.service.ts` | `@memberjunction/ng-base-application` | Queues `TabRequest`s from `ResourceResolver` for the shell to process. `SuppressNextResolve` / `ShouldSuppressResolve` prevent double-processing when the shell syncs the URL. |
