# @memberjunction/ng-clustering

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/ai-vectors-memory@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-entity-card@5.46.0
  - @memberjunction/ng-entity-viewer@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/ng-ui-components@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai-engine-base@5.45.1
- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/ng-entity-viewer@5.45.1
- @memberjunction/ai-vectors-memory@5.45.1
- @memberjunction/ng-base-types@5.45.1
- @memberjunction/ng-entity-card@5.45.1
- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-vectors-memory@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-entity-card@5.45.0
  - @memberjunction/ng-entity-viewer@5.45.0

## 5.44.0

### Patch Changes

- f8be8a0: Consolidate collapsible/disclosure UI onto the canonical `<mj-accordion-panel>` across MJ Explorer, and level up the accordion component itself.

  **`@memberjunction/ng-ui-components` (the component):**
  - New **`MJAccordionModule`** — bundles the panel + all three slot directives (`mjAccordionTitle`, `mjAccordionActions`, `mjAccordionBody`) so consumers import one symbol instead of four (works in both NgModule and standalone `imports`). An NgModule is used because AOT can't expand a value-array across a compiled-package boundary (NG1010) and an `as const` tuple is rejected by the `imports` type (TS2322).
  - New lazy **`[mjAccordionBody]`** slot — heavy bodies (code editors, grids, charts) instantiate on first expand and stay alive for animated re-toggle, so consumers don't have to reason about content weight or hand-write `@if (expanded)`.
  - Hardening: `--sm`/`--disabled`/`--muted-icon` modifiers scoped to child combinators (no nested-panel style bleed); `hasBeenExpanded` made non-public per naming conventions; added a DOM test proving the module exposes every declarable.

  **~50 disclosure surfaces migrated** from bespoke `<div (click)>`-header + `@if` markup to `<mj-accordion-panel>` across 20 Angular packages — dashboard-viewer config panels, DevTools Class Registry, Version History diff/snapshot groups, the test-run dialog, Explorer section toggles (about-dialog, sql-logging, SystemDiagnostics, App Roles, Home add-pin, Integration activity, Actions/Permissions/Credentials/Testing/ComponentStudio), and Generic components (agents, clustering, conversations, search, entity-viewer, filter-builder, record-tags, resource-permissions, core-entity-forms). Each replaces a non-focusable `<div (click)>` header with a real `<button [attr.aria-expanded]>` — a genuine accessibility improvement, not cosmetic — and deletes the per-consumer collapse chrome CSS. Card-based collapsibles, trees, and fill-panes are intentionally out of scope (they route to their own primitives).

  No public API changes in the consumer packages (internal refactor). Verified: all affected package test suites pass, CI UI gates green (design tokens + button overrides), and a full audit confirmed side-effects preserved with two visual regressions caught and fixed (SystemDiagnostics severity tint restored with semantic tokens; cluster-scatter members list scroll-confined via `[Fill]`).
  </content>

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [e84c85b]
- Updated dependencies [f8be8a0]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [1e5e449]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [0476455]
- Updated dependencies [9f96357]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-entity-viewer@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ai-vectors-memory@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/ng-entity-card@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/ai-vectors-memory@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/ng-entity-card@5.43.0
  - @memberjunction/ng-entity-viewer@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [0c6bf61]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [ccaf49b]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/ai-vectors-memory@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/ng-entity-viewer@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ng-base-types@5.42.0
  - @memberjunction/ng-entity-card@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-entity-card@5.41.0
  - @memberjunction/ng-entity-viewer@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-engine-base@5.40.2
- @memberjunction/ai-vectors-memory@5.40.2
- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-entity-card@5.40.2
- @memberjunction/ng-entity-viewer@5.40.2
- @memberjunction/graphql-dataprovider@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-entity-card@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Minor Changes

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- 804f9f6: Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-entity-card@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.39.0
- @memberjunction/ng-entity-card@5.39.0

## 5.38.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.38.0
- @memberjunction/ng-entity-card@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.37.0
- @memberjunction/ng-entity-card@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.36.0
- @memberjunction/ng-entity-card@5.36.0

## 5.35.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.35.0
- @memberjunction/ng-entity-card@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ai-vectors-memory@5.34.1
- @memberjunction/ng-entity-card@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [ae5cfbd]
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/ng-entity-card@5.34.0

## 5.33.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.33.0
- @memberjunction/ng-entity-card@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.32.0
- @memberjunction/ng-entity-card@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai-vectors-memory@5.31.0
  - @memberjunction/ng-entity-card@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-vectors-memory@5.30.1
- @memberjunction/ng-entity-card@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.30.0
- @memberjunction/ng-entity-card@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.29.0
- @memberjunction/ng-entity-card@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.28.0
- @memberjunction/ng-entity-card@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/ai-vectors-memory@5.27.1
- @memberjunction/ng-entity-card@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.27.0
- @memberjunction/ng-entity-card@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.26.0
- @memberjunction/ng-entity-card@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ai-vectors-memory@5.25.0
- @memberjunction/ng-entity-card@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
  - @memberjunction/ai-vectors-memory@5.24.0
  - @memberjunction/ng-entity-card@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [513b20c]
  - @memberjunction/ai-vectors-memory@5.23.0
