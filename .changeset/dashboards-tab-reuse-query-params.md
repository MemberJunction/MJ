---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-dashboards": patch
---

A tab's query params now reach only the resource the tab shows. A cached component that stays bound to a reused tab's ID no longer receives the next resource's params: a Home pin no longer opens its dashboard in the Dashboards app after a visit to the Dashboards app, and Back no longer loops. Adds `NavigationService.IsTabShowingResource` and an optional `owner` argument to `ObserveTabQueryParams`. The dashboard editor no longer shows the edit-mode note above the panels, and the Home dashboard title no longer cuts off the end of the dashboard's name.
