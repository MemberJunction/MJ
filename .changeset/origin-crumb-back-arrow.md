---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-shared": patch
---

A record page's origin crumb now has a labeled "Back" button, separated from the breadcrumb by a divider. Back goes to the last place you were: the most recently used other tab (new `NavigationService.GetPreviousTab` / `ReturnToPreviousTab`), or, with no other tab open, where the record was opened. Its tooltip names the destination, e.g. "Back to Dashboards". The breadcrumb segments still restore the page the record was opened from. The old back arrow was a decorative icon, so clicking it did nothing.
