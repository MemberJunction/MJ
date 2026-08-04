# Angular Explorer Development Guide

## 🚨 CRITICAL: BaseResourceComponent.NotifyLoadComplete() 🚨

**Every** class extending `BaseResourceComponent` MUST call `this.NotifyLoadComplete()` when its initial load completes. This is required for the shell loading screen to clear when users navigate directly to a URL (e.g., `/app/knowledge-hub/Search`).

- `BaseDashboard` subclasses get this automatically (base class calls it after `loadData()`)
- All other `BaseResourceComponent` subclasses must call it explicitly in `ngOnInit()` or `ngAfterViewInit()`

See [packages/Angular/CLAUDE.md](../CLAUDE.md) for the full pattern and examples.

## 🚨 CRITICAL: Routing — NavigationService Only 🚨

Explorer components **MUST** use `NavigationService` for all routing operations. **NEVER** import `Router`, `ActivatedRoute`, or `NavigationEnd` directly.

**Allowed exceptions:** Shell component, app-routing module, AuthGuard, OAuth callback, NavigationService itself.

### Query Param Sub-Navigation Pattern

For components that need URL-synced state (e.g., selected entity, active tab), use the framework's query param lifecycle instead of subscribing to Router events:

```typescript
// 1. Read initial params
async initDashboard() {
    const params = this.GetQueryParams();
    if (params['entity']) this.selectEntity(params['entity']);
}

// 2. React to back/forward
protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    this.applyParams(params);
}

// 3. Push state changes to URL
onEntitySelected(entity: EntityInfo): void {
    this.UpdateQueryParams({ entity: entity.Name, record: null });
}
```

**NEVER** subscribe to `Router.events` / `NavigationEnd` in resource components. The shell handles all URL synchronization.

### super.ngOnInit() / super.ngOnDestroy() Required

`BaseResourceComponent` now has `ngOnInit` (sets up query param subscription) and `ngOnDestroy` (completes destroy$ Subject). **All subclasses that override these MUST call `super.ngOnInit()` / `super.ngOnDestroy()`** as the first line.

## Agent Context & Client Tools

Resource components can report their state to the AI agent and register tools the agent can invoke. See **[packages/AI/Agents/AGENT_CONTEXT_GUIDE.md](../../AI/Agents/AGENT_CONTEXT_GUIDE.md)** for the full guide.

Quick reference:
```typescript
// Report dashboard state to the agent
this.navigationService.SetAgentContext(this, { ActiveTab: this.ActiveTab, ItemCount: 42 });

// Register tools the agent can invoke
this.navigationService.SetAgentClientTools(this, [
    { Name: 'SwitchTab', Description: '...', ParameterSchema: {...}, Handler: async (params) => { ... } }
]);
```

## 🚨 Explorer Surfaces Are Layer 3 — Keep Them Thin 🚨

An Explorer surface resolves its data, hands it to a widget, and translates the widget's
events into `NavigationService` calls and notifications. It holds **no domain logic and no
markup a widget should own**. If a form's template is 200 lines of table markup, that markup
belongs in a `Generic/**` (or app widgets) package; if the class computes totals, that math
belongs in a pure-TS package.

Packages here declare `{ "mjUILayer": "surface" }` and are checked by `npm run check:ui-layers`,
which bans `Router` / `ActivatedRoute` / `NavigationEnd` bindings. (`RouterModule` for
declarative `routerLink` chrome is fine — what breaks the shell is imperative navigation.)

Read **[/guides/UI_LAYERING_GUIDE.md](../../../guides/UI_LAYERING_GUIDE.md)** for the full
four-layer model and the `Before*`/`After*` event contract that connects the layers.

## Navigation & Routing Guide

See **[/guides/NAVIGATION_AND_ROUTING_GUIDE.md](../../../guides/NAVIGATION_AND_ROUTING_GUIDE.md)** for comprehensive documentation of how navigation, URL sync, and back/forward work in MJ Explorer.

## Package Structure

- **base-application/** — ApplicationManager, TabService, WorkspaceStateManager
- **explorer-app/** — Branded entry point component
- **explorer-core/** — Shell, routing, ResourceResolver, tab container, navigation
- **dashboards/** — All admin/feature dashboard resource components (see [dashboards/CLAUDE.md](dashboards/CLAUDE.md))
- **explorer-settings/** — Settings panel components
- **core-entity-forms/** — Generated + custom entity forms
- **shared/** — BaseResourceComponent, BaseDashboard, NavigationService, SharedService
- **auth-services/** — Authentication providers (Auth0, MSAL, Okta)
