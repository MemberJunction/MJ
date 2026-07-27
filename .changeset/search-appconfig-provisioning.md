---
"@memberjunction/search-engine": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-explorer-core": patch
---

Fix three client-reported issues (search coverage, Configure App dialog, default-app provisioning):

- **C3 — Search coverage:** decouple the per-entity fetch depth from the global `topK` budget in both `EntitySearchProvider` and `FullTextSearchProvider` (new tunable `PerEntityFetchDepth`, default 15), so multi-entity searches no longer starve individual entities of results. Also lower `MIN_TERM_LENGTH` from 3 to 2 across the engine and both providers so short queries (e.g. "US", "AI") are searchable.
- **F1 — Configure App dialog glitch:** the `[(ShowDialog)]` setter now emits `ShowDialogChange`, so the app-switcher's flag round-trips correctly; the dialog resets its app lists on open/close and reloads the user's applications on a deferred microtask (avoids `ExpressionChangedAfterItHasBeenCheckedError`). Removed the redundant double-drive in the app switcher.
- **F2 — Default-app provisioning (`Status = 'Active'` filter):** the JWT new-user provisioning path selected default applications with `DefaultForNewUser` but **without** the `Status = 'Active'` check that the client self-heal path already applied, so an inactive app flagged `DefaultForNewUser` could be provisioned onto new users there. Both paths now use a single shared selector, `UserInfoEngine.GetDefaultApplicationsForNewUser`, which filters to Active + `DefaultForNewUser` in `DefaultSequence` order — eliminating the drift.
