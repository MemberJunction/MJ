---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
---

Fix cross-tab URL corruption: a dashboard in a background tab could rewrite the URL of the tab the user was actually viewing.

`BaseResourceComponent.UpdateQueryParams` fell back to `NavigationService.UpdateActiveTabQueryParams` whenever the component had no tab id, so its query-param writes landed in whichever tab happened to be active. Code dashboards resolved through `ClassFactory` (Open App dashboards, `MCPDashboard`, `DataExplorer`) are exactly the components that have no tab id, so a background dashboard finishing an async load silently replaced the visible tab's deep link with its own params.

- `BaseResourceComponent.UpdateQueryParams` no longer has an active-tab fallback. A component that cannot identify its own tab drops the write and logs which component did it and what was dropped.
- `DashboardResource` and `BaseAdminContainer` now pass their tab id to the child dashboards they instantiate (`ParentTabId`), so those dashboards keep working — scoped to their own tab.
- `NavigationService.UpdateActiveTabQueryParams` is deprecated; components must use `UpdateTabQueryParams` with their own tab id.
