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

The stamp a host puts on a child is a snapshot of where the host was when it created it, so it has to
move when the host does. `tab-container` re-homes a *cached* resource component to a different tab
(`RebindTabId`) without recreating anything inside it, which would otherwise leave the child reading
and writing the tab it was born in from inside a tab it no longer belongs to — the same cross-tab
corruption, arriving by a slower route. `RebindTabId` now calls an `onTabIdRebound` hook, and both
hosts re-home their children through it (the admin container re-homes every cached section, not only
the visible one — a detached section is invisible, still subscribed, and exactly the case that
matters). The re-home clears the stale `ParentTabId` first, because `getTabId()` prefers it and a
rebind that layered over it would be a silent no-op.
