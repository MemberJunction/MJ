---
'@memberjunction/server': patch
'@memberjunction/ai-prompts': patch
'@memberjunction/ng-explorer-core': patch
'@memberjunction/ng-dashboards': patch
'@memberjunction/ng-bootstrap': patch
'@memberjunction/ng-clustering': patch
'@memberjunction/ng-entity-viewer': patch
'@memberjunction/ng-file-storage': patch
'@memberjunction/ng-whiteboard': patch
---

Fix process-wide server cache corruption plus nine other defects surfaced by the Explorer
regression suite.

**Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
names onto the data provider's own result rows, which the server cache holds *by reference*.
Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
`_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
cache is process-wide, so a single response poisoned every subsequent request across all
workers. Fixed by mapping onto copies.

Also fixed:

- **`file-upload`** stopped requesting `_mj__*` transport aliases in its GraphQL document —
  those are wire names, not entity fields, and the response goes straight to `LoadFromData`.
- **shell + whiteboard-host** each declared two `@HostListener`s for the same event. Angular
  keys host bindings by event name, so the second silently replaced the first — killing the
  Ctrl+/ command-palette shortcut and the Sees dropdown's outside-click dismissal.
- **tab-container** memoizes display-name provider resolution per driver class (promise-level,
  so concurrent tab restores dedupe). Uncached, drivers that can't be built outside a view
  threw NG0201 on every tab add and reload — 50k console errors in one suite run.
- **omnibar palette** no longer lets keyboard selection target recent rows that aren't on
  screen, and a failed provider fetch no longer leaves the palette stuck loading.
- **`FeaturePipelinesResourceComponent`** is exported from `ng-dashboards`' public API, so the
  eager class-registration manifest picks it up and its tab resolves.
- **AIPromptRunner** only logs a failover banner once a previous candidate has actually
  failed; credential-skipped candidates no longer read as retries.
- **Accessibility/layout:** keyboard-operable query-browser splitter and Integration
  entity-map rows, row actions revealed on `:focus-within`, and `flex-shrink: 0` on
  ps-catalog cards (the compressed guide card overflowed behind sibling cards and made filter
  chips unclickable).
