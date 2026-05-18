---
"@memberjunction/core": minor
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-ui-components": patch
---

Consolidate MJ Explorer's page header chrome onto a shared component library: ~50 dashboards across 14 sections (AI, Knowledge Hub, Admin, Actions, Scheduling, Testing, MCP, Lists, Communication, Credentials, Version History, File Browser, Integrations, Archive) migrated to `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` with design-token-driven styling, replacing ~200 lines of bespoke per-section CSS (including hardcoded brand gradients). Adds the shared chrome components used throughout the migration: `mj-stat-badge`, `mj-refresh-button`, `mj-page-search`, `mj-filter-popover`, `mj-filter-panel`, `mj-filter-field`, `mj-filter-chip`, `mj-tab-nav`, `mj-view-toggle`. Removes two redundant/unused exports from `@memberjunction/ng-ui-components`: `MJFilterToggleComponent` (zero template usages — replaced by `<mj-filter-popover>`) and `MJResultCountComponent` (merged into `<mj-stat-badge>` — pass the optional `[Total]` input for the "X of Y" rendering). External consumers using either removed export must migrate to the noted replacement. Conventions documented in `plans/explorer-chrome-conventions.md`.
