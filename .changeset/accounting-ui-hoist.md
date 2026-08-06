---
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-entity-viewer": minor
---

UI capabilities hoisted from the BizApps accounting app (battle-tested there against live data):

- **`mj-left-nav` desktop collapse (opt-in):** `[Collapsible]` + two-way `[(Collapsed)]` + `CollapsedWidth` render a locked-position double-angle toggle chip and an icons-only collapsed strip — labels visually hidden but kept in the a11y tree, section labels folded to divider lines, badges docked on the icon corner, per-item tooltips auto-enabled (`IconOnly` also available standalone for externally-narrowed rails). Consumer owns/persists the state; deliberately no hover-to-peek. Richer rail content is handled rather than assumed away: tree sections fold to their top level while collapsed (with a top-level item standing in as active — `aria-current="true"` — for an active descendant, and `ExpandedIds` untouched so the tree returns intact on expand), icon-less items render a label monogram instead of collapsing to a blank hit-target, and the whole collapsed behavior is viewport-gated to match its ≥701px styling, so a persisted `Collapsed` never follows the user into the ≤700px drawer.
- **New `mj-workspace-card` + `mj-workspace-tab-strip` + `MJWorkspaceTabStore`:** the workspace pattern — browser-style draft tabs (open/switch/drag-reorder/close, dirty-dot, rejected/complete states) over a pure, exhaustively unit-tested tab state machine, wrapped in a slotted card frame (identity band, scrolling body, opt-in standardized confirm/draft/discard footer). Plus `mjTip`, a delayed non-interactive truncation tooltip.
- **`mj-entity-data-grid`:** new `[FillWidth]` input appends an inert trailing filler column so row banding reaches the container edge without stretching real columns; `width: 'auto'` + `maxWidth` column configs now actually map to AG Grid flex sizing (previously silently ignored) and survive saved-grid-state restores; `computeFieldsList` exported from `record.util`.
