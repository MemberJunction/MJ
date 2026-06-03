---
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-explorer-settings": minor
---

feat(explorer): concise-chrome filter model + mobile chrome overhaul

Reworked MJ Explorer's shared page chrome for mobile and rolled out the
"concise filter model" across every filter-bearing dashboard.

**Concise filter model** — one Filter button holds all filters (popover on
desktop, bottom sheet on mobile); search is persistent. Inline quick-filter
chips and the applied-filter chip row are gone. The control bar reads
`search · Filter · view` and lives in the header `[toolbar]` slot, right-aligned
on desktop and left-aligned on mobile (where search grows to fill). Sections
converted: Identity & Access, Lists, Testing, AI, Actions (Action Explorer
folds Sort into the popover), Scheduling, Integration, Credentials, Version
History, MCP, and Communication — with categorical/time-range chips folded
into the single Filter popover.

**Mobile chrome** — shared primitives now carry the mobile behaviors so pages
get them for free: `mj-left-nav` off-canvas drawer, `mj-filter-popover` bottom
sheet, icon-only action buttons and refresh, `mj-page-body` row→column reflow,
and `mj-page-header`/`-interior` compaction. `mj-filter-panel` gains
multi-select fields.

**Shell fixes** — keep the header right-edge cluster (chat/nav-bar app icons +
avatar) on one row at mobile widths instead of stacking, and anchor the mobile
nav drawer's notification badge to the Notifications button instead of the
drawer corner.
