# @memberjunction/ng-entity-viewer

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
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-filter-builder@5.40.0
  - @memberjunction/ng-list-management@5.40.0
  - @memberjunction/ng-map-view@5.40.0
  - @memberjunction/ng-record-changes@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-timeline@5.40.0
  - @memberjunction/ng-export-service@5.40.0
  - @memberjunction/ng-pagination@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/export-engine@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- 3b29882: feat: render any entity form as a tab, dialog, or slide-in (Generic, no regeneration)

  Adds a presentation-agnostic form stack to `@memberjunction/ng-base-forms`:
  - **`MjEntityFormHostComponent`** — headless host that resolves the form
    (generated / custom / interactive override + variants), loads the record,
    dynamically creates + binds the form, re-emits its events, and tears down.
    Extracted from Explorer's `SingleRecordComponent`, which is now a thin wrapper.
  - **`MjFormDialogComponent` / `MjFormSlideInComponent`** + **`MJFormPresenterService`**
    — declarative and imperative ways to open any entity form as a modal dialog or
    slide-in panel.
  - **`EntityFormConfig`** + presets — per-instance control over toolbar visibility,
    related-entity sections, section collapsibility, width, and in-form navigation.
    Applied via the form reference so existing generated forms honor it **without
    regeneration**.
  - **`FormResolverService`** moved from `ng-explorer-core` into `ng-base-forms`
    (it had no Explorer/Router coupling), making the interactive-form + variant
    pathway first-class on every surface.
  - **`MjSlidePanelComponent`** relocated from `ng-versions` into `ng-ui-components`
    as a first-class shared primitive; `ng-versions` and the other consumers
    (record-changes, record-tags, entity-viewer, dashboards, core-entity-forms) now
    import it from there.

  Phase-1 consumer migrations: the Query Categories create flow now uses
  `<mj-form-dialog>`, and editing the selected category uses `MJFormPresenterService`
  slide-in — replacing the bespoke `query-category-dialog`.

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [bd95e83]
- Updated dependencies [1b69c68]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [3b29882]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-map-view@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/ng-record-changes@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-filter-builder@5.39.0
  - @memberjunction/ng-timeline@5.39.0
  - @memberjunction/ng-export-service@5.39.0
  - @memberjunction/ng-pagination@5.39.0
  - @memberjunction/export-engine@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-filter-builder@5.38.0
  - @memberjunction/ng-map-view@5.38.0
  - @memberjunction/ng-record-changes@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-timeline@5.38.0
  - @memberjunction/ng-versions@5.38.0
  - @memberjunction/ng-export-service@5.38.0
  - @memberjunction/ng-pagination@5.38.0
  - @memberjunction/export-engine@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-versions@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-filter-builder@5.37.0
  - @memberjunction/ng-map-view@5.37.0
  - @memberjunction/ng-record-changes@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-timeline@5.37.0
  - @memberjunction/ng-export-service@5.37.0
  - @memberjunction/ng-pagination@5.37.0
  - @memberjunction/export-engine@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- e215af2: Stop related-entity grid panels in generated forms from fetching data on form open, and decouple panel-height persistence from expansion state.
  - `IsSectionExpanded()` now honors the collapsed default seeded by `initSections()` instead of falling back to the global expanded default, and the entity data grid defers its auto-load decision one microtask so a later `[AllowLoad]="false"` binding is applied before the load check runs.
  - Fixed the underlying bug where persisting a panel's height silently marked the section expanded: a `ResizeObserver` fired on initial measurement and `updateSectionState` merged `DEFAULT_SECTION_STATE` (`isExpanded: true`) into a height-only write, so on the next form open that persisted value won over the seeded collapsed default. `FormSectionState.isExpanded` is now optional (`undefined` = no explicit user choice), `updateSectionState` no longer seeds the default, and the `ResizeObserver` skips its initial fire and only persists while expanded.
  - Related-entity grids now lazy-load via an `IntersectionObserver` in `ExplorerEntityDataGridComponent`: a grid fetches only once its host scrolls into view, so off-screen and collapsed panels never fire a `RunView` on form open.
  - CodeGen now seeds all field panels expanded by default (except System Metadata), with related-entity grids collapsed. **Visible UX change:** generated forms that previously opened with related-entity sections expanded will now show those sections collapsed. Regenerate forms to pick up the new defaults.

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-versions@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-map-view@5.36.0
  - @memberjunction/ng-record-changes@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-filter-builder@5.36.0
  - @memberjunction/ng-timeline@5.36.0
  - @memberjunction/ng-export-service@5.36.0
  - @memberjunction/ng-pagination@5.36.0
  - @memberjunction/export-engine@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-filter-builder@5.35.0
  - @memberjunction/ng-map-view@5.35.0
  - @memberjunction/ng-record-changes@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-timeline@5.35.0
  - @memberjunction/ng-versions@5.35.0
  - @memberjunction/ng-export-service@5.35.0
  - @memberjunction/ng-pagination@5.35.0
  - @memberjunction/export-engine@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-filter-builder@5.34.1
  - @memberjunction/ng-map-view@5.34.1
  - @memberjunction/ng-record-changes@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-timeline@5.34.1
  - @memberjunction/ng-versions@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-export-service@5.34.1
  - @memberjunction/ng-pagination@5.34.1
  - @memberjunction/export-engine@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-pagination@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-export-service@5.34.0
  - @memberjunction/ng-filter-builder@5.34.0
  - @memberjunction/ng-map-view@5.34.0
  - @memberjunction/ng-record-changes@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-timeline@5.34.0
  - @memberjunction/ng-versions@5.34.0
  - @memberjunction/export-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- 3e84676: Fix map-view regressions in Regions and Boundary modes, drop text-based location guessing in favor of pre-geocoded coordinates only, and auto-resolve lat/lng field names from EntityField.ExtendedType so entities like MJ: Countries / State Provinces use their direct Latitude/Longitude columns. Hides the Boundary toolbar button on entities without per-record GeoJSON, tears the map engine down on Entity change to fix blank-map regressions, and reloads data when crossing the grid ↔ map boundary.
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-map-view@5.33.0
  - @memberjunction/ng-versions@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-filter-builder@5.33.0
  - @memberjunction/ng-record-changes@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-timeline@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ng-export-service@5.33.0
  - @memberjunction/ng-pagination@5.33.0
  - @memberjunction/export-engine@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-filter-builder@5.32.0
  - @memberjunction/ng-map-view@5.32.0
  - @memberjunction/ng-record-changes@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-timeline@5.32.0
  - @memberjunction/ng-versions@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-export-service@5.32.0
  - @memberjunction/ng-pagination@5.32.0
  - @memberjunction/export-engine@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-export-service@5.31.0
  - @memberjunction/ng-filter-builder@5.31.0
  - @memberjunction/ng-map-view@5.31.0
  - @memberjunction/ng-pagination@5.31.0
  - @memberjunction/ng-record-changes@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-timeline@5.31.0
  - @memberjunction/ng-versions@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/export-engine@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-export-service@5.30.1
- @memberjunction/ng-filter-builder@5.30.1
- @memberjunction/ng-map-view@5.30.1
- @memberjunction/ng-pagination@5.30.1
- @memberjunction/ng-record-changes@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-timeline@5.30.1
- @memberjunction/ng-versions@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/export-engine@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [00b5c26]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ng-map-view@5.30.0
  - @memberjunction/ng-record-changes@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-versions@5.30.0
  - @memberjunction/ng-filter-builder@5.30.0
  - @memberjunction/ng-timeline@5.30.0
  - @memberjunction/ng-export-service@5.30.0
  - @memberjunction/ng-pagination@5.30.0
  - @memberjunction/export-engine@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-filter-builder@5.29.0
  - @memberjunction/ng-map-view@5.29.0
  - @memberjunction/ng-record-changes@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-timeline@5.29.0
  - @memberjunction/ng-versions@5.29.0
  - @memberjunction/ng-export-service@5.29.0
  - @memberjunction/ng-pagination@5.29.0
  - @memberjunction/export-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-filter-builder@5.28.0
  - @memberjunction/ng-map-view@5.28.0
  - @memberjunction/ng-record-changes@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-timeline@5.28.0
  - @memberjunction/ng-versions@5.28.0
  - @memberjunction/ng-export-service@5.28.0
  - @memberjunction/ng-pagination@5.28.0
  - @memberjunction/export-engine@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-map-view@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/ng-filter-builder@5.27.1
  - @memberjunction/ng-timeline@5.27.1
  - @memberjunction/ng-export-service@5.27.1
  - @memberjunction/ng-pagination@5.27.1
  - @memberjunction/export-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-export-service@5.27.0
- @memberjunction/ng-filter-builder@5.27.0
- @memberjunction/ng-map-view@5.27.0
- @memberjunction/ng-pagination@5.27.0
- @memberjunction/ng-shared-generic@5.27.0
- @memberjunction/ng-timeline@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/export-engine@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-map-view@5.26.0
  - @memberjunction/ng-filter-builder@5.26.0
  - @memberjunction/ng-timeline@5.26.0
  - @memberjunction/ng-export-service@5.26.0
  - @memberjunction/ng-pagination@5.26.0
  - @memberjunction/export-engine@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- 1eb9f6e: no migration/metadata
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ng-map-view@5.25.0
  - @memberjunction/ng-filter-builder@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-timeline@5.25.0
  - @memberjunction/ng-export-service@5.25.0
  - @memberjunction/ng-pagination@5.25.0
  - @memberjunction/export-engine@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-filter-builder@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-timeline@5.24.0
  - @memberjunction/ng-export-service@5.24.0
  - @memberjunction/ng-pagination@5.24.0
  - @memberjunction/export-engine@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-filter-builder@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-timeline@5.23.0
  - @memberjunction/ng-export-service@5.23.0
  - @memberjunction/ng-pagination@5.23.0
  - @memberjunction/export-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-filter-builder@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/ng-timeline@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ng-export-service@5.22.0
  - @memberjunction/ng-pagination@5.22.0
  - @memberjunction/export-engine@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-filter-builder@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-timeline@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-export-service@5.21.0
  - @memberjunction/ng-pagination@5.21.0
  - @memberjunction/export-engine@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-filter-builder@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-timeline@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-export-service@5.20.0
  - @memberjunction/ng-pagination@5.20.0
  - @memberjunction/export-engine@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-export-service@5.19.0
- @memberjunction/ng-filter-builder@5.19.0
- @memberjunction/ng-pagination@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-timeline@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/export-engine@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ng-export-service@5.18.0
- @memberjunction/ng-filter-builder@5.18.0
- @memberjunction/ng-pagination@5.18.0
- @memberjunction/ng-shared-generic@5.18.0
- @memberjunction/ng-timeline@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/export-engine@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-filter-builder@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-timeline@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-export-service@5.17.0
  - @memberjunction/ng-pagination@5.17.0
  - @memberjunction/export-engine@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-filter-builder@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-timeline@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-export-service@5.16.0
  - @memberjunction/ng-pagination@5.16.0
  - @memberjunction/export-engine@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-filter-builder@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-timeline@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-export-service@5.15.0
  - @memberjunction/ng-pagination@5.15.0
  - @memberjunction/export-engine@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-filter-builder@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-timeline@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-export-service@5.14.0
  - @memberjunction/ng-pagination@5.14.0
  - @memberjunction/export-engine@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-filter-builder@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-timeline@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ng-export-service@5.13.0
  - @memberjunction/ng-pagination@5.13.0
  - @memberjunction/export-engine@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-pagination@5.12.0
  - @memberjunction/ng-export-service@5.12.0
  - @memberjunction/ng-filter-builder@5.12.0
  - @memberjunction/ng-timeline@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/export-engine@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-filter-builder@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-timeline@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ng-export-service@5.11.0
  - @memberjunction/export-engine@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-export-service@5.10.1
- @memberjunction/ng-filter-builder@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-timeline@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/export-engine@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-filter-builder@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-timeline@5.10.0
  - @memberjunction/ng-export-service@5.10.0
  - @memberjunction/export-engine@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [89b6abe]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/ng-filter-builder@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-timeline@5.9.0
  - @memberjunction/ng-export-service@5.9.0
  - @memberjunction/export-engine@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-filter-builder@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/ng-timeline@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ng-export-service@5.8.0
  - @memberjunction/export-engine@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-filter-builder@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-timeline@5.7.0
  - @memberjunction/ng-export-service@5.7.0
  - @memberjunction/export-engine@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-filter-builder@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-timeline@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ng-export-service@5.6.0
  - @memberjunction/export-engine@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-export-service@5.5.0
  - @memberjunction/ng-filter-builder@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-timeline@5.5.0
  - @memberjunction/export-engine@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-export-service@5.4.1
- @memberjunction/ng-filter-builder@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/ng-timeline@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/export-engine@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-export-service@5.4.0
  - @memberjunction/ng-filter-builder@5.4.0
  - @memberjunction/ng-timeline@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/export-engine@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-export-service@5.3.1
- @memberjunction/ng-filter-builder@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-timeline@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/export-engine@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- 1692c53: Viewing System fixes for sorting and filtering. Memory manager SQL fix.
- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-export-service@5.3.0
  - @memberjunction/ng-filter-builder@5.3.0
  - @memberjunction/ng-timeline@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/export-engine@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- 4618227: Fix Angular 21/zone.js 0.15 change detection regressions, improve conversation caching performance, and resolve blank tabs in artifacts and entity viewer
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-filter-builder@5.2.0
  - @memberjunction/ng-timeline@5.2.0
  - @memberjunction/ng-export-service@5.2.0
  - @memberjunction/export-engine@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/ng-filter-builder@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-timeline@5.1.0
  - @memberjunction/ng-export-service@5.1.0
  - @memberjunction/export-engine@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 3cca644: no migration
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-export-service@5.0.0
  - @memberjunction/ng-filter-builder@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/ng-timeline@5.0.0
  - @memberjunction/export-engine@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-filter-builder@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/ng-timeline@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ng-export-service@4.4.0
  - @memberjunction/export-engine@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-export-service@4.3.1
- @memberjunction/ng-filter-builder@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/ng-timeline@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/export-engine@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-filter-builder@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/ng-timeline@4.3.0
  - @memberjunction/ng-export-service@4.3.0
  - @memberjunction/export-engine@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-export-service@4.2.0
- @memberjunction/ng-filter-builder@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/ng-timeline@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/export-engine@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/export-engine@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-filter-builder@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-timeline@4.1.0
  - @memberjunction/ng-export-service@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [b503400]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-export-service@4.0.0
  - @memberjunction/ng-filter-builder@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/ng-timeline@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/export-engine@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/ng-filter-builder@3.4.0
  - @memberjunction/ng-timeline@3.4.0
  - @memberjunction/ng-export-service@3.4.0
  - @memberjunction/export-engine@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Minor Changes

- 27a65b9: migration from metadata updates

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-export-service@3.3.0
  - @memberjunction/ng-filter-builder@3.3.0
  - @memberjunction/ng-timeline@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/export-engine@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-export-service@3.2.0
  - @memberjunction/ng-filter-builder@3.2.0
  - @memberjunction/ng-timeline@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/export-engine@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-export-service@3.1.1
- @memberjunction/ng-filter-builder@3.1.1
- @memberjunction/ng-shared-generic@3.1.1
- @memberjunction/ng-timeline@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/export-engine@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ng-export-service@3.0.0
- @memberjunction/ng-filter-builder@3.0.0
- @memberjunction/ng-shared-generic@3.0.0
- @memberjunction/ng-timeline@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/export-engine@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Minor Changes

- 43df8f4: migration

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ng-filter-builder@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/ng-timeline@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/ng-export-service@2.133.0
  - @memberjunction/export-engine@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/ng-timeline@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/ng-timeline@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ng-shared-generic@2.130.1
- @memberjunction/ng-timeline@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/ng-timeline@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c7e38aa: migration

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/ng-timeline@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-shared-generic@2.128.0
  - @memberjunction/ng-timeline@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ng-shared-generic@2.127.0
  - @memberjunction/ng-timeline@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ng-shared-generic@2.126.1
- @memberjunction/ng-timeline@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/ng-shared-generic@2.126.0
  - @memberjunction/ng-timeline@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ng-shared-generic@2.125.0
  - @memberjunction/ng-timeline@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ng-shared-generic@2.124.0
  - @memberjunction/ng-timeline@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ng-shared-generic@2.123.1
- @memberjunction/ng-timeline@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Minor Changes

- 0944f59: migrations

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ng-timeline@2.123.0
  - @memberjunction/ng-shared-generic@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-shared-generic@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ng-shared-generic@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ng-shared-generic@2.122.0
  - @memberjunction/global@2.122.0
