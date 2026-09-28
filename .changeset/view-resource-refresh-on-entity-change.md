---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-entity-viewer": patch
---

A view resource now reloads when rows of its entity change: a local save or delete, or a server-side write announced as `remote-invalidate` (for example a record clone). Bursts of changes are debounced into a single reload, which keeps the user's page, sort and filters (new `EntityViewerComponent.RefreshInPlace()`; `Refresh()` still starts at page 1).

Cost: every open view tab of that entity reloads, background tabs included, so a user with several tabs on a busy entity sends one reload per tab per burst of changes.
