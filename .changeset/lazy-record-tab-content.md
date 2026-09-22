---
"@memberjunction/ng-explorer-core": patch
---

Record tabs restored at boot no longer load their content until the records region is actually shown.

The records Golden Layout initializes eagerly so the strip and the Records pill stay in step with the workspace, and as it builds GL fires `show` for every stack's active tab — while the region is still hidden behind the main surface. The shell loaded content on those shows, so every restored record hydrated at boot. An open AI Agent Run pulled its whole run tree (every prompt run, action log and step: 27 requests, ~7s on a slow API) before the user had looked at it, and client-side RunView coalescing folded the ACTIVE tab's own reads into those same requests, so the surface the user was looking at waited on records they were not. Measured on one deployment as a 24s boot with two records open against 5s with none.

- `TabShown` while `ShowRecordsRegion` is false now PARKS the show (tab id → container) instead of loading.
- Parked shows replay when the region becomes visible, against the LIVE container; a tab closed (or torn down by a breakpoint rebuild) while parked is dropped, and one GL already marked loaded is skipped.
- No change once the region is visible: shows load exactly as before.
