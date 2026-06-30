---
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboard-viewer": patch
---

Fix dashboard panels stuck on "Loading…" after navigating Back from a record opened inside a pinned dashboard. The dashboard viewer now defers Golden Layout initialization until its container has a non-zero size and exposes a deterministic `waitForLayoutReady()` signal (replacing a fragile fixed-delay load-complete in the dashboard resource wrapper). The dashboard browser also moves its query-param round-trip onto the framework's `OnQueryParamsChanged` contract so back/forward, deep links, and Home pins reliably restore the open dashboard.
