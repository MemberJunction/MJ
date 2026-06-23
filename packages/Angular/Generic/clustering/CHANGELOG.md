# @memberjunction/ng-clustering

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
