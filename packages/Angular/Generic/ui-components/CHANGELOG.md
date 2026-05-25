# @memberjunction/ng-ui-components

## 5.37.0

## 5.36.0

### Patch Changes

- 1c0fce9: Section 10 interior chrome pattern applied to every MJ Explorer left-rail shell (Admin × 4, AI Analytics, Knowledge Hub × 4, Testing Explorer, Database Designer, SQL Logging, Dev Tools inspectors, API Keys, App Roles). New shared primitives — `<mj-left-nav>` with optional tree support, two-row `<mj-page-header-interior>`, paired `<mj-page-body-interior>` — replace bespoke per-shell sidebar and chrome implementations across ~25 sub-pages. Chrome slot discipline audit standardizes tab-nav placement, `[meta]` badge content, and `[actions]` ordering across ~65 dashboards; two pre-existing bugs fixed along the way (nested `:has()` SyntaxError that silently hid the interior toolbar row, and an invisible page-header drop shadow).

## 5.35.0

### Patch Changes

- ee380f7: Consolidate MJ Explorer's page header chrome onto a shared component library: ~50 dashboards across 14 sections (AI, Knowledge Hub, Admin, Actions, Scheduling, Testing, MCP, Lists, Communication, Credentials, Version History, File Browser, Integrations, Archive) migrated to `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` with design-token-driven styling, replacing ~200 lines of bespoke per-section CSS (including hardcoded brand gradients). Adds the shared chrome components used throughout the migration: `mj-stat-badge`, `mj-refresh-button`, `mj-page-search`, `mj-filter-popover`, `mj-filter-panel`, `mj-filter-field`, `mj-filter-chip`, `mj-tab-nav`, `mj-view-toggle`. Removes two redundant/unused exports from `@memberjunction/ng-ui-components`: `MJFilterToggleComponent` (zero template usages — replaced by `<mj-filter-popover>`) and `MJResultCountComponent` (merged into `<mj-stat-badge>` — pass the optional `[Total]` input for the "X of Y" rendering). External consumers using either removed export must migrate to the noted replacement. Conventions documented in `plans/explorer-chrome-conventions.md`.
- ac4b9a5: **Multi-tenant switching** (`@memberjunction/global`, `@memberjunction/ng-explorer-core`): Add `TenantChanged` event type to `MJEventType`. Add `clearCacheByPredicate()` on `ComponentCacheManager` for selective tenant-scoped cache clearing. Add `ClearComponentCache()` and `ReloadAllTabs()` on `TabContainerComponent` — destroys cached components and reloads the active tab immediately (inactive tabs reload lazily). Shell subscribes to `TenantChanged` with two-phase protocol: `TenantChanging` shows the loading screen, `TenantChanged` reloads tabs and hides it. Loading screen CSS made `position: fixed` with `z-index: 99999` to fully cover viewport during switches.

  **Open App fixes** (`@memberjunction/open-app-engine`): Make `mj app upgrade` idempotent when already at target version. Allow mixed-case schema names in Open App manifest validation.

  **CodeGen fix** (`@memberjunction/codegen-lib`): Emit `override` modifier on generated `Save()` method to satisfy strict TypeScript when entity subclasses override the base `Save()`.

  **AI Agents dashboard** (`@memberjunction/ng-dashboards`): Fix category filter not filtering results, make category filter extraction defensive, fix Reset Filters button. Rename Actions `ExecutionMonitoringComponent` to avoid name collision with dashboards package.

  **Scheduling** (`@memberjunction/server`): Warn loudly when a scheduled job is configured to run more often than every 5 minutes.

  **Palette** (`@memberjunction/ng-ui-components`): Add ARIA labels to icon-only buttons in dialogs and slides for accessibility compliance.

## 5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

## 5.33.0

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.

## 5.25.0

## 5.24.0

## 5.23.0

### Patch Changes

- 58af481: Remove all remaining Kendo references — fix 3 templates, clean 19 CSS files, remove @progress deps from MJExplorer
- fb0c69f: Phase 2.1: Complete Kendo UI removal — replace all @progress/kendo-\* dependencies with custom MJ components, AG Grid, and angular-split
