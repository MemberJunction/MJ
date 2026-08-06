---
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-tabstrip": minor
"@memberjunction/ng-core-entity-forms": patch
---

One look and one keyboard contract for MJ's tab strips.

- **`ng-ui-components`** ships the shared `.mj-tabs*` tab chrome as a global stylesheet (`dist/lib/tabs/tabs.scss`) and `mjTabList`, the ARIA tabs keyboard directive: roving tabindex (one Tab stop per strip), Arrow/Home/End navigation with focus-follows-selection, Enter/Space activation, Delete/Backspace close, hidden-tab skipping, and editable-content passthrough. `mj-workspace-tab-strip` now renders the shared chrome, puts `role="tab"` on the focusable element, and folds unsaved/rejected state into each tab's accessible name. An active tab's border and top accent line follow its STATUS color (brand primary for an ordinary tab, warning when rejected, success when complete) via the `--mj-tab-accent` custom property, overridable per host. **Standalone hosts (anything not running inside MJ Explorer's `explorer-app` shell — e.g. the BizApps apps) must add `@import '@memberjunction/ng-ui-components/dist/lib/tabs/tabs';` to their global stylesheet or tab strips render unstyled.**
- **`ng-tabstrip`** adopts the same chrome and directive (new dependency on `ng-ui-components`): tokens replace the legacy `--gray-*` styling that never adapted to dark mode, tabs gain full keyboard support plus `aria-controls`/`tabpanel` linkage, and the close button is Font Awesome. **Behavioral change:** the strip and its tab bodies now size to content instead of hardcoding viewport height (`calc(100vh - …)`) — hosts that relied on the old fixed-height, internally-scrolling body should set a height on their own container. Overflow scrolling is native (`scrollLeft`) rather than the old offset animation. `FillWidth`/`FillHeight` inputs are deprecated no-ops. The package's stale "DEPRECATED — use Kendo" notice is gone.
- **`ng-core-entity-forms`**: the Entity Actions form's Filters grid gets an explicit `[Height]` now that its tab body no longer imposes viewport height.
