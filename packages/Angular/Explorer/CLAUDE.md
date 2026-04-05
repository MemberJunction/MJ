# Angular Explorer Development Guide

## 🚨 CRITICAL: BaseResourceComponent.NotifyLoadComplete() 🚨

**Every** class extending `BaseResourceComponent` MUST call `this.NotifyLoadComplete()` when its initial load completes. This is required for the shell loading screen to clear when users navigate directly to a URL (e.g., `/app/knowledge-hub/Search`).

- `BaseDashboard` subclasses get this automatically (base class calls it after `loadData()`)
- All other `BaseResourceComponent` subclasses must call it explicitly in `ngOnInit()` or `ngAfterViewInit()`

See the root [CLAUDE.md](../../../CLAUDE.md) for the full pattern and examples.

## Package Structure

- **base-application/** — ApplicationManager, TabService, WorkspaceStateManager
- **explorer-app/** — Branded entry point component
- **explorer-core/** — Shell, routing, ResourceResolver, tab container, navigation
- **dashboards/** — All admin/feature dashboard resource components (see [dashboards/CLAUDE.md](dashboards/CLAUDE.md))
- **explorer-settings/** — Settings panel components
- **core-entity-forms/** — Generated + custom entity forms
- **shared/** — BaseResourceComponent, BaseDashboard, NavigationService, SharedService
- **auth-services/** — Authentication providers (Auth0, MSAL, Okta)
