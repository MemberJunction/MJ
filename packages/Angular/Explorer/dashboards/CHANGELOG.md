# @memberjunction/ng-dashboards

## 5.40.2

### Patch Changes

- da2ee38: Fix duplicate detection defects: drop stale "ghost" vector matches to deleted/re-seeded records (the apparent record-matching-itself), guard against recursive re-triggering that exploded detail rows, skip auto-merge for merge-disallowed entities instead of failing the run, and sort the Record Duplicates UI groups and per-card matches by match probability descending.
  - @memberjunction/ng-conversations@5.40.2
  - @memberjunction/ng-dashboard-viewer@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/tag-engine-base@5.40.2
  - @memberjunction/api-keys-base@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/ng-base-application@5.40.2
  - @memberjunction/ng-core-entity-forms@5.40.2
  - @memberjunction/ng-explorer-settings@5.40.2
  - @memberjunction/ng-shared@5.40.2
  - @memberjunction/ng-testing@5.40.2
  - @memberjunction/ng-action-gallery@5.40.2
  - @memberjunction/ng-actions@5.40.2
  - @memberjunction/ng-agent-requests@5.40.2
  - @memberjunction/ng-agents@5.40.2
  - @memberjunction/ng-ai-test-harness@5.40.2
  - @memberjunction/ng-archive-manager@5.40.2
  - @memberjunction/ng-base-forms@5.40.2
  - @memberjunction/ng-base-types@5.40.2
  - @memberjunction/ng-clustering@5.40.2
  - @memberjunction/ng-code-editor@5.40.2
  - @memberjunction/ng-container-directives@5.40.2
  - @memberjunction/ng-credentials@5.40.2
  - @memberjunction/ng-entity-relationship-diagram@5.40.2
  - @memberjunction/ng-entity-viewer@5.40.2
  - @memberjunction/ng-export-service@5.40.2
  - @memberjunction/ng-filter-builder@5.40.2
  - @memberjunction/ng-list-management@5.40.2
  - @memberjunction/ng-markdown@5.40.2
  - @memberjunction/ng-map-view@5.40.2
  - @memberjunction/ng-notifications@5.40.2
  - @memberjunction/ng-query-viewer@5.40.2
  - @memberjunction/ng-react@5.40.2
  - @memberjunction/ng-resource-permissions@5.40.2
  - @memberjunction/ng-scheduling@5.40.2
  - @memberjunction/ng-search@5.40.2
  - @memberjunction/ng-shared-generic@5.40.2
  - @memberjunction/ng-trees@5.40.2
  - @memberjunction/ng-ui-components@5.40.2
  - @memberjunction/ng-versions@5.40.2
  - @memberjunction/ng-word-cloud@5.40.2
  - @memberjunction/credentials@5.40.2
  - @memberjunction/graphql-dataprovider@5.40.2
  - @memberjunction/integration-engine-base@5.40.2
  - @memberjunction/interactive-component-types@5.40.2
  - @memberjunction/lists-base@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/export-engine@5.40.2
  - @memberjunction/global@5.40.2
  - @memberjunction/skip-types@5.40.2
  - @memberjunction/templates-base-types@5.40.2
  - @memberjunction/testing-engine-base@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/tag-engine-base@5.40.1
  - @memberjunction/api-keys-base@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/ng-base-application@5.40.1
  - @memberjunction/ng-core-entity-forms@5.40.1
  - @memberjunction/ng-explorer-settings@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-testing@5.40.1
  - @memberjunction/ng-action-gallery@5.40.1
  - @memberjunction/ng-actions@5.40.1
  - @memberjunction/ng-agent-requests@5.40.1
  - @memberjunction/ng-agents@5.40.1
  - @memberjunction/ng-ai-test-harness@5.40.1
  - @memberjunction/ng-archive-manager@5.40.1
  - @memberjunction/ng-base-forms@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-clustering@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-container-directives@5.40.1
  - @memberjunction/ng-conversations@5.40.1
  - @memberjunction/ng-credentials@5.40.1
  - @memberjunction/ng-dashboard-viewer@5.40.1
  - @memberjunction/ng-entity-relationship-diagram@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/ng-filter-builder@5.40.1
  - @memberjunction/ng-list-management@5.40.1
  - @memberjunction/ng-map-view@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-query-viewer@5.40.1
  - @memberjunction/ng-react@5.40.1
  - @memberjunction/ng-resource-permissions@5.40.1
  - @memberjunction/ng-scheduling@5.40.1
  - @memberjunction/ng-search@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/ng-trees@5.40.1
  - @memberjunction/ng-versions@5.40.1
  - @memberjunction/credentials@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/integration-engine-base@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/skip-types@5.40.1
  - @memberjunction/templates-base-types@5.40.1
  - @memberjunction/testing-engine-base@5.40.1
  - @memberjunction/ng-export-service@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-ui-components@5.40.1
  - @memberjunction/ng-word-cloud@5.40.1
  - @memberjunction/lists-base@5.40.1
  - @memberjunction/export-engine@5.40.1
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
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [40e90fa]
- Updated dependencies [6957711]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-clustering@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/ng-core-entity-forms@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/tag-engine-base@5.40.0
  - @memberjunction/ng-conversations@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/api-keys-base@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/ng-base-application@5.40.0
  - @memberjunction/ng-explorer-settings@5.40.0
  - @memberjunction/ng-testing@5.40.0
  - @memberjunction/ng-action-gallery@5.40.0
  - @memberjunction/ng-actions@5.40.0
  - @memberjunction/ng-agent-requests@5.40.0
  - @memberjunction/ng-agents@5.40.0
  - @memberjunction/ng-ai-test-harness@5.40.0
  - @memberjunction/ng-archive-manager@5.40.0
  - @memberjunction/ng-base-forms@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-container-directives@5.40.0
  - @memberjunction/ng-credentials@5.40.0
  - @memberjunction/ng-dashboard-viewer@5.40.0
  - @memberjunction/ng-entity-relationship-diagram@5.40.0
  - @memberjunction/ng-filter-builder@5.40.0
  - @memberjunction/ng-list-management@5.40.0
  - @memberjunction/ng-map-view@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-query-viewer@5.40.0
  - @memberjunction/ng-react@5.40.0
  - @memberjunction/ng-resource-permissions@5.40.0
  - @memberjunction/ng-scheduling@5.40.0
  - @memberjunction/ng-search@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-trees@5.40.0
  - @memberjunction/ng-versions@5.40.0
  - @memberjunction/credentials@5.40.0
  - @memberjunction/integration-engine-base@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/skip-types@5.40.0
  - @memberjunction/templates-base-types@5.40.0
  - @memberjunction/testing-engine-base@5.40.0
  - @memberjunction/ng-export-service@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/ng-word-cloud@5.40.0
  - @memberjunction/lists-base@5.40.0
  - @memberjunction/export-engine@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- bd95e83: feat(explorer): concise-chrome filter model + mobile chrome overhaul

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

- 0f9acba: feat(knowledge-hub): Classify sub-app decomposition + new classification features

  Decompose the Classify (content autotagging) dashboard from a single ~5,150-line component into a thin host shell plus 6 self-contained tab sub-page components and 4 dialog components, with a shared pure helper layer. Cacheable metadata reuses the existing `KnowledgeHubMetadataEngine` / `TagEngineBase` / `AIEngineBase`; high-volume rows stay on `RunView`.

  Surfaces backend capabilities that previously had no UI:
  - **Suggestions Inbox** — human-in-the-loop review queue over `MJ: Tag Suggestions` (approve / merge / reject).
  - **Tag Health** — real merge-candidate / low-usage / wide-node signals, replacing the prior heuristic.
  - **Governance / Synonyms / Scope** editors on the Taxonomy tag panel (typed `MJTag` flags, synonym approval workflow, tag scope).
  - **Config parity** — full `IContentSourceConfiguration` (taxonomy mode, thresholds, tag root, budgets, toggles, effective-values) inline in the source form, which is now sectioned and a resizable, width-remembering slide-in.
  - **Dry-run preview** — in-memory disposition preview of a source's tags under its current mode + thresholds (no LLM call, nothing persisted).

  Adds `TagSynonym.Status` (`Active`/`Pending`/`Rejected`, default `Active`) for the synonym approval workflow — additive and backward-compatible — with the regenerated entity, server, and form code. `ng-bootstrap`'s class manifest + allow-list pick up `TagEngineBase`.

- 34fe6d1: Capture and surface AI prompt-cache cost across providers — OpenRouter provider-reported cost passthrough; per-model cache read/write pricing on AI Model Costs with cache-aware cost calculation; cache-token rollups on AI Prompt Runs and Agent Runs; and cache hit-rate + dollar-savings analytics across the AI dashboards (Cost & Budget, Model Performance, Prompt Runs, Usage Patterns, Executive Summary) and the prompt-run / agent-run detail views. Includes a migration adding cache columns — run CodeGen after applying.

### Patch Changes

- 1b69c68: fix(data-explorer): stop body view content from painting over header dropdowns

  After #2701 lowered the Data Explorer `.content-header` to `z-index: 2` (to keep
  it below the shell header), body view content that leaks a higher z-index began
  painting over the header's own dropdowns. The map view was the visible symptom —
  its Leaflet panes/toolbar (z-index up to ~1000) covered the view-selector "new
  view" dropdown — and the entity grid's option menu (z-index 1000) is the same
  latent class.

  Two complementary fixes, both pure containment (no z-index values changed):
  - **`@memberjunction/ng-map-view`** — add `isolation: isolate` to the component
    `:host` so Leaflet's z-indices stay contained in the map's own stacking
    context. Generic hygiene that protects the map in any consumer.
  - **`@memberjunction/ng-dashboards`** — add `isolation: isolate` to the Data
    Explorer `.content-body` so all body view content (grid menus, map, cards,
    timeline, future view modes) is contained beneath the header in one stacking
    context. Safe because modals and the record detail panel render at the
    dashboard root, outside `.content-body`, so they still overlay everything.

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
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [1b69c68]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [3b29882]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [5b4102c]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-explorer-settings@5.39.0
  - @memberjunction/ng-map-view@5.39.0
  - @memberjunction/ng-base-forms@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/ng-versions@5.39.0
  - @memberjunction/ng-entity-viewer@5.39.0
  - @memberjunction/ng-core-entity-forms@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/tag-engine-base@5.39.0
  - @memberjunction/api-keys-base@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/ng-base-application@5.39.0
  - @memberjunction/ng-shared@5.39.0
  - @memberjunction/ng-testing@5.39.0
  - @memberjunction/ng-action-gallery@5.39.0
  - @memberjunction/ng-actions@5.39.0
  - @memberjunction/ng-agent-requests@5.39.0
  - @memberjunction/ng-agents@5.39.0
  - @memberjunction/ng-ai-test-harness@5.39.0
  - @memberjunction/ng-archive-manager@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-container-directives@5.39.0
  - @memberjunction/ng-conversations@5.39.0
  - @memberjunction/ng-credentials@5.39.0
  - @memberjunction/ng-dashboard-viewer@5.39.0
  - @memberjunction/ng-entity-relationship-diagram@5.39.0
  - @memberjunction/ng-filter-builder@5.39.0
  - @memberjunction/ng-list-management@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-query-viewer@5.39.0
  - @memberjunction/ng-react@5.39.0
  - @memberjunction/ng-resource-permissions@5.39.0
  - @memberjunction/ng-scheduling@5.39.0
  - @memberjunction/ng-search@5.39.0
  - @memberjunction/ng-trees@5.39.0
  - @memberjunction/credentials@5.39.0
  - @memberjunction/integration-engine-base@5.39.0
  - @memberjunction/interactive-component-types@5.39.0
  - @memberjunction/skip-types@5.39.0
  - @memberjunction/templates-base-types@5.39.0
  - @memberjunction/testing-engine-base@5.39.0
  - @memberjunction/ng-clustering@5.39.0
  - @memberjunction/ng-export-service@5.39.0
  - @memberjunction/ng-word-cloud@5.39.0
  - @memberjunction/lists-base@5.39.0
  - @memberjunction/export-engine@5.39.0

## 5.38.0

### Minor Changes

- 30f598d: Two intertwined deliverables in one PR: the autotag-website overhaul, plus a new dynamic forms-extension architecture (`BaseFormPanel` slot system) that lets consumers extend generated entity forms without the heavyweight custom-form override pattern.

  ## Autotag website crawler overhaul

  Fixes the long-standing "only crawls the seed page" symptom and adds first-class run budgets, a streaming pipeline, and per-source UI knobs.

  **Fixes**
  - `AutotagWebsite` now respects `MaxDepth` out of the box — the recursive crawler was previously gated on a flag that defaulted to falsy, so most sources only ever scraped the start URL. Class-level defaults are now `MaxDepth=2`, `CrawlSitesInLowerLevelDomain=true`, `CrawlOtherSitesInTopLevelDomain=false`.
  - Change-detection (the "is this page changed?" short-circuit) was rewritten to fetch each URL once instead of two or three times, hash the **extracted body text** (not raw HTML — eliminates spurious "changed" verdicts from CSRF tokens / build hashes / server timestamps), and scope the dedup query to the current `ContentSourceID` (a 404 boilerplate from one site no longer masks real pages on another).
  - `visitedURLs` state is now reset per content source — was leaking across sources and silently deduping legitimate URLs.
  - Conservative URL normalization (strip fragment, collapse trailing slash, sort query params; path case preserved per RFC 3986) so common variants dedupe correctly.
  - Several smaller bugs: `URLPattern` regex now applied in the shallow path too, `Number.isFinite` guard prevents NaN-cascade in the depth check.

  **Features**
  - **Streaming pipeline.** `ExtractTextAndProcessWithLLM` now accepts `AsyncIterable<MJContentItemEntity>` in addition to arrays. The website crawler streams items into the LLM batcher as they pass change-detection — total wall-clock is `~max(crawl, classify)` instead of `crawl + classify`. Backwards-compatible: existing array callers (AutotagEntity, tests) are unchanged.
  - **`MaxItemsPerRun` run budget.** Most intuitive "do at most N this run, do the rest next time" cap. Wired into `AutotagWebsite` (which had no budget integration before) and `AutotagEntity` (which already had the other RunBudget knobs). Pause is graceful via the existing CancellationRequested machinery; next run picks up where it left off (change-detection skips already-tagged items).
  - **Per-source Website crawler UI.** New "Website Crawler Settings" section on the Content Source form (conditional on Website source type) with structured inputs for MaxDepth, RootURL, URLPattern (live regex validation), and toggles for the recursion + sibling-fan-out flags. The Tag Pipeline section gets a promoted "Max items / run" primary row.

  **Storage**
  - `IContentSourceConfiguration` extended with a typed `MaxItemsPerRun?: number` and `Website?: IContentSourceWebsiteConfiguration` sub-object. The new `MJContentSourceEntity_IContentSourceWebsiteConfiguration` interface is now exported from `@memberjunction/core-entities`.
  - `AutotagWebsite` reads website knobs from the typed `Configuration.Website` first, then overlays `ContentSourceParam` rows as a sharper-per-instance override (legacy sources configured the old way keep working).
  - Per-key coercion at the param-overlay boundary fixes a latent bug where DB-stored strings were silently stuffed into number/boolean-typed instance fields.

  **Tests**

  162 tests pass (up from 119). New coverage spans URL normalization, fetch-once / extracted-text hashing, the streaming engine path (AsyncIterable batching, partial-batch flush, resume), `MaxItemsPerRun` budget enforcement, and the `Configuration.Website` overlay.

  **Docs**

  `packages/ContentAutotagging/README.md` documents the new streaming diagram, the Website Crawl Settings table, the Run Budgets table with priority order, and the resume semantics.

  **Known follow-ups** (not in this PR)
  - True crawl-side resume that persists discovered URLs so re-runs skip the HTTP re-discovery — today's resume is "functional via change-detection dedup."
  - `ETag` / `If-Modified-Since` conditional GETs on re-crawls (needs new columns on `MJContentItem`).

  ## `BaseFormPanel` slot system (`@memberjunction/ng-base-forms`)

  Generated entity forms can now be extended **without** replacing them via a `*Extended` custom-form override. Author a standalone Angular component extending `BaseFormPanel`, decorate with `@RegisterClassEx(BaseFormPanel, { metadata: { entity, slot, sortKey } })`, declare in any module. `<mj-form-panel-slot>` hosts in the generated form discover matching panels at runtime and dynamically mount them.

  **Slot positions** (top → bottom): `top-area`, `before-fields`, `after-fields`, `after-related`, `after-everything`.

  **Fallback chain** via `FormSlotCoordinator`: if the registered slot is missing because CodeGen hasn't been rerun against the new template emitter, the panel walks forward in the chain until it finds an existing slot. `MjRecordFormContainer` ALWAYS emits `after-everything` in its template, so panels never dead-end — pre-CodeGen-regen forms display every panel (at the bottom); post-regen forms display them in the preferred position.

  New public exports from `@memberjunction/ng-base-forms`:
  - `BaseFormPanel<TRecord>` abstract directive
  - `FormPanelSlot` type union
  - `FormPanelRegistrationMetadata` interface
  - `<mj-form-panel-slot>` component
  - `FormSlotCoordinator` service
  - `FORM_SLOT_CHAIN` constant

  Custom `*Extended` forms (e.g. `AIAgentFormComponentExtended`) remain a first-class pattern for truly bespoke layouts where the generated form is the wrong starting point entirely.

  Full authoring guide in `packages/Angular/Generic/base-forms/PANELS.md`.

  ## `@RegisterClassEx` + ClassFactory metadata (`@memberjunction/global`)

  Existing `@RegisterClass` keeps its exact positional signature (zero breaking changes) but also accepts an optional 6th `metadata` arg for parity. New `@RegisterClassEx(baseClass, options)` is the modern form when you have anything beyond `(baseClass, key, priority)` to specify — options-bag avoids positional-boolean noise and is the right place to attach `metadata`.

  New public exports from `@memberjunction/global`:
  - `RegisterClassEx` decorator
  - `RegisterClassOptions` interface
  - `ClassRegistration.Metadata` field (optional, additive)
  - `ClassFactory.GetAllRegistrationsByKeyPrefix(base, prefix)` — common structured-key case (case-insensitive, trimmed)
  - `ClassFactory.GetAllRegistrationsByKeyPattern(base, regex)` — nuanced key matching
  - `ClassFactory.GetAllRegistrationsByMetadata(base, predicate)` — recommended for structured discriminators

  The `Ex` suffix follows MJ's existing `Foo`/`FooAsync`/`FooEx` convention. Not a true TS overload — JS overloads are hacky compared to true OOP, and sibling decorators give cleaner IntelliSense + a clean deprecation path if we ever consolidate.

  MJGlobal README adds a "Structured registration" section documenting both decorators + all three lookup helpers.

  ## Knowledge Hub dashboard quick-edit (`@memberjunction/ng-dashboards`)

  The AI > Autotagging Pipeline dashboard's "Edit Content Source" slide-in is intentionally a **quick-edit surface**, not a full form. Added the most-useful subset of the new knobs:
  - `MaxItemsPerRun` (always shown — most-asked-for budget cap)
  - `MaxDepth` + 2 crawl toggles (Website-source-conditional)
  - **"Open advanced settings →"** link that calls `NavigationService.OpenEntityRecord('MJ: Content Sources', id)` to land in the full entity form, where every panel is available via the slot system.

  ## Documentation
  - `packages/Angular/Generic/base-forms/PANELS.md` (NEW) — comprehensive BaseFormPanel authoring guide.
  - `packages/Angular/CLAUDE.md` — restructured "Extending Entity Forms" section. Both patterns first-class.
  - `packages/Angular/Explorer/core-entity-forms/README.md` — new "Two Patterns" section above the existing custom-form guide.
  - `guides/CONTENT_AUTOTAGGING_GUIDE.md` — extended config table (all budget caps + `Website` sub-object) + UI section pointing at PANELS.md.
  - `packages/MJGlobal/README.md` — new "Structured registration: `@RegisterClassEx` + metadata" section.
  - Root `CLAUDE.md` — new "Nested CLAUDE.md Index" pointing at every sub-directory CLAUDE.md.

  ## Follow-ups (not in this PR)
  - Promote source-type-specific form sections to a registered class extension point when the count grows past 2-3 (e.g., RSS, Cloud Storage). Today's `IsWebsiteSourceType` template gate works fine for 1-2 source types.

- 918d663: Interactive Forms — runtime authoring loop is now closed end-to-end.

  **Versioning lifecycle (server-side actions).** The single `Create Interactive Form` action has been split into a versioning-aware family:
  - `Create Interactive Form` — net-new only; returns `ALREADY_EXISTS` if the user already has an Active override for the entity.
  - `Modify Interactive Form` — branches on the pointed-to Component's status: Pending → modify the row in place (no version proliferation during chat refinement); Active → insert a new Component v(N+1) with `Status='Pending'` and a sibling Pending Override, leaving the live form untouched.
  - `Activate Interactive Form Version` — flips a Pending override to Active and atomically demotes the prior Active to Inactive.
  - `Revert Interactive Form` — re-points an Active override at an older Component in the same Name lineage. Pure UPDATE; old rows preserved.
  - `Get Active Form For Entity` — read-only; returns the resolved override + the full applicable-variants list.
  - `Get Default Form Scaffold For Entity` — new read-only action that produces a working `ComponentSpec` mirroring the CodeGen Angular default layout. Replaces "write JSX from scratch" as the agent's baseline.

  **Form-aware artifact viewer.** When a component artifact's spec declares `componentRole: 'form'`, the viewer auto-loads a Top-1 record from the declared entity, mounts via `<mj-interactive-form>` (with `componentSpec` + `record` now `@Input()`s), and exposes a search-as-you-type record picker plus an **Apply to my form** action. Falls back to a synthetic `NewRecord()` when the entity has no rows yet.

  **Variant switcher.** `FormResolverService` now returns the full applicable-variants list alongside the resolved override. `<mj-record-form-container>` renders a compact "Form: \<name\> ▾" picker between the toolbar and the form body when more than one variant applies; selection is persisted per-user per-entity in localStorage.

  **Cockpit reshape.** Form Builder dashboard is no longer canvas-first: 4-pane layout with a forms list + versions rail on the left, a Preview/Code/Layout tabbed center, and a Form Builder AI pane on the right. Both side rails collapse to a strip with state persisted in localStorage.

  **Shared fixture.** `buildFixtureFormHostProps` promoted from Component Studio to `@memberjunction/interactive-component-types/forms` so the artifact viewer and Studio share one implementation.

  **Migration.** `EntityFormOverride.Notes` column (NVARCHAR(MAX), nullable) for human commentary on overrides. Validator audited against the CHECK constraint — no patch required.

  **Agent prompt.** `form-builder.template.md` rewritten around the new action toolbox; teaches the agent to call `Get Active Form For Entity` first and branch between Create / Modify (new-version) / Modify (in-place). Sage's prompt gets a one-line routing rule to delegate form requests to Form Builder.

### Patch Changes

- 4d2881d: Fix z-index issue where Data Explorer content-header rendered above shell dropdowns (app-switcher, user menu, search)
- 60947be: Fix several entity-record save flow issues in MJ Explorer: re-key the tab and component cache when a "Create New Record" form transitions to a saved record so subsequent new-record clicks open a blank form; correct the URL-segment format used by ResourceRecordSaved so the form no longer fails to reload after save with a doubled-prefix key; wire up the previously no-op tab title refresh after save (including refreshing the Home app's dynamic nav-item label) so the user sees the latest entity name without navigating away.
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [b2e6782]
- Updated dependencies [d5a51b3]
- Updated dependencies [a529993]
- Updated dependencies [b26d0ee]
- Updated dependencies [60947be]
- Updated dependencies [2ee14f1]
- Updated dependencies [3d739a3]
- Updated dependencies [48dc77a]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/ng-base-application@5.38.0
  - @memberjunction/testing-engine-base@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/ng-core-entity-forms@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-base-forms@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/ng-react@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/ng-conversations@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/skip-types@5.38.0
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ng-query-viewer@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ng-agent-requests@5.38.0
  - @memberjunction/ng-agents@5.38.0
  - @memberjunction/ng-ai-test-harness@5.38.0
  - @memberjunction/ng-explorer-settings@5.38.0
  - @memberjunction/ng-testing@5.38.0
  - @memberjunction/api-keys-base@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/ng-action-gallery@5.38.0
  - @memberjunction/ng-actions@5.38.0
  - @memberjunction/ng-archive-manager@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-container-directives@5.38.0
  - @memberjunction/ng-credentials@5.38.0
  - @memberjunction/ng-dashboard-viewer@5.38.0
  - @memberjunction/ng-entity-relationship-diagram@5.38.0
  - @memberjunction/ng-entity-viewer@5.38.0
  - @memberjunction/ng-filter-builder@5.38.0
  - @memberjunction/ng-list-management@5.38.0
  - @memberjunction/ng-map-view@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-resource-permissions@5.38.0
  - @memberjunction/ng-scheduling@5.38.0
  - @memberjunction/ng-search@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-trees@5.38.0
  - @memberjunction/ng-versions@5.38.0
  - @memberjunction/credentials@5.38.0
  - @memberjunction/integration-engine-base@5.38.0
  - @memberjunction/templates-base-types@5.38.0
  - @memberjunction/ng-clustering@5.38.0
  - @memberjunction/ng-export-service@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-ui-components@5.38.0
  - @memberjunction/ng-word-cloud@5.38.0
  - @memberjunction/lists-base@5.38.0
  - @memberjunction/export-engine@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [86a9d0e]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/ng-conversations@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-core-entity-forms@5.37.0
  - @memberjunction/ng-explorer-settings@5.37.0
  - @memberjunction/ng-shared@5.37.0
  - @memberjunction/ng-testing@5.37.0
  - @memberjunction/ng-actions@5.37.0
  - @memberjunction/ng-ai-test-harness@5.37.0
  - @memberjunction/ng-list-management@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-react@5.37.0
  - @memberjunction/ng-search@5.37.0
  - @memberjunction/ng-versions@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ng-agent-requests@5.37.0
  - @memberjunction/ng-agents@5.37.0
  - @memberjunction/skip-types@5.37.0
  - @memberjunction/api-keys-base@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/ng-base-application@5.37.0
  - @memberjunction/ng-action-gallery@5.37.0
  - @memberjunction/ng-archive-manager@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-container-directives@5.37.0
  - @memberjunction/ng-credentials@5.37.0
  - @memberjunction/ng-dashboard-viewer@5.37.0
  - @memberjunction/ng-entity-relationship-diagram@5.37.0
  - @memberjunction/ng-entity-viewer@5.37.0
  - @memberjunction/ng-filter-builder@5.37.0
  - @memberjunction/ng-map-view@5.37.0
  - @memberjunction/ng-query-viewer@5.37.0
  - @memberjunction/ng-resource-permissions@5.37.0
  - @memberjunction/ng-scheduling@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-trees@5.37.0
  - @memberjunction/credentials@5.37.0
  - @memberjunction/integration-engine-base@5.37.0
  - @memberjunction/interactive-component-types@5.37.0
  - @memberjunction/templates-base-types@5.37.0
  - @memberjunction/testing-engine-base@5.37.0
  - @memberjunction/ng-clustering@5.37.0
  - @memberjunction/ng-export-service@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-ui-components@5.37.0
  - @memberjunction/ng-word-cloud@5.37.0
  - @memberjunction/lists-base@5.37.0
  - @memberjunction/export-engine@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- 1c0fce9: Section 10 interior chrome pattern applied to every MJ Explorer left-rail shell (Admin × 4, AI Analytics, Knowledge Hub × 4, Testing Explorer, Database Designer, SQL Logging, Dev Tools inspectors, API Keys, App Roles). New shared primitives — `<mj-left-nav>` with optional tree support, two-row `<mj-page-header-interior>`, paired `<mj-page-body-interior>` — replace bespoke per-shell sidebar and chrome implementations across ~25 sub-pages. Chrome slot discipline audit standardizes tab-nav placement, `[meta]` badge content, and `[actions]` ordering across ~65 dashboards; two pre-existing bugs fixed along the way (nested `:has()` SyntaxError that silently hid the interior toolbar row, and an invisible page-header drop shadow).
- 91036ee: Refreshable, shareable, taggable Lists with an agent-callable Actions surface.
  - New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
  - `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
  - GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
  - 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
  - UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.

- Updated dependencies [f29b7c0]
- Updated dependencies [1c0fce9]
- Updated dependencies [e215af2]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/ng-ui-components@5.36.0
  - @memberjunction/ng-explorer-settings@5.36.0
  - @memberjunction/ng-entity-viewer@5.36.0
  - @memberjunction/lists-base@5.36.0
  - @memberjunction/ng-list-management@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/ng-core-entity-forms@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-shared@5.36.0
  - @memberjunction/ng-testing@5.36.0
  - @memberjunction/ng-actions@5.36.0
  - @memberjunction/ng-ai-test-harness@5.36.0
  - @memberjunction/ng-conversations@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-react@5.36.0
  - @memberjunction/ng-search@5.36.0
  - @memberjunction/ng-versions@5.36.0
  - @memberjunction/ng-action-gallery@5.36.0
  - @memberjunction/ng-entity-relationship-diagram@5.36.0
  - @memberjunction/ng-resource-permissions@5.36.0
  - @memberjunction/ng-scheduling@5.36.0
  - @memberjunction/ng-dashboard-viewer@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/api-keys-base@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/ng-base-application@5.36.0
  - @memberjunction/ng-agent-requests@5.36.0
  - @memberjunction/ng-agents@5.36.0
  - @memberjunction/ng-archive-manager@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-credentials@5.36.0
  - @memberjunction/ng-map-view@5.36.0
  - @memberjunction/ng-query-viewer@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-trees@5.36.0
  - @memberjunction/credentials@5.36.0
  - @memberjunction/integration-engine-base@5.36.0
  - @memberjunction/templates-base-types@5.36.0
  - @memberjunction/testing-engine-base@5.36.0
  - @memberjunction/ng-container-directives@5.36.0
  - @memberjunction/ng-filter-builder@5.36.0
  - @memberjunction/interactive-component-types@5.36.0
  - @memberjunction/skip-types@5.36.0
  - @memberjunction/ng-clustering@5.36.0
  - @memberjunction/ng-export-service@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/ng-word-cloud@5.36.0
  - @memberjunction/export-engine@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- ee380f7: Consolidate MJ Explorer's page header chrome onto a shared component library: ~50 dashboards across 14 sections (AI, Knowledge Hub, Admin, Actions, Scheduling, Testing, MCP, Lists, Communication, Credentials, Version History, File Browser, Integrations, Archive) migrated to `<mj-page-layout>` + `<mj-page-header>` + `<mj-page-body>` with design-token-driven styling, replacing ~200 lines of bespoke per-section CSS (including hardcoded brand gradients). Adds the shared chrome components used throughout the migration: `mj-stat-badge`, `mj-refresh-button`, `mj-page-search`, `mj-filter-popover`, `mj-filter-panel`, `mj-filter-field`, `mj-filter-chip`, `mj-tab-nav`, `mj-view-toggle`. Removes two redundant/unused exports from `@memberjunction/ng-ui-components`: `MJFilterToggleComponent` (zero template usages — replaced by `<mj-filter-popover>`) and `MJResultCountComponent` (merged into `<mj-stat-badge>` — pass the optional `[Total]` input for the "X of Y" rendering). External consumers using either removed export must migrate to the noted replacement. Conventions documented in `plans/explorer-chrome-conventions.md`.
- c1f1cad: Add pluggable geocoding provider abstraction with Google, Geocod.io, and HERE implementations (expands GeoCodeSource enum and adds provider registry). Polish the Home dashboard pin empty state with a dismissible "Don't show this again" preference persisted via UserInfoEngine, and speed up the Add Pin panel by reading from cached DashboardEngine, UserViewEngine, QueryEngine, and ActionEngineBase singletons instead of firing fresh RunViews on every open, with background pre-warm on home load.
- 383784c: Fix query-param state so it round-trips for deep links, Home pins, and browser back/forward — resource components now restore sub-state when params change after initial load (e.g. clicking a second conversation pin no longer reopens the already-cached chat). Also fixes the "Pinning..." overlay hanging when pinning from the Data Explorer by backgrounding the thumbnail capture and skipping it for very large DOM trees.
- ac4b9a5: **Multi-tenant switching** (`@memberjunction/global`, `@memberjunction/ng-explorer-core`): Add `TenantChanged` event type to `MJEventType`. Add `clearCacheByPredicate()` on `ComponentCacheManager` for selective tenant-scoped cache clearing. Add `ClearComponentCache()` and `ReloadAllTabs()` on `TabContainerComponent` — destroys cached components and reloads the active tab immediately (inactive tabs reload lazily). Shell subscribes to `TenantChanged` with two-phase protocol: `TenantChanging` shows the loading screen, `TenantChanged` reloads tabs and hides it. Loading screen CSS made `position: fixed` with `z-index: 99999` to fully cover viewport during switches.

  **Open App fixes** (`@memberjunction/open-app-engine`): Make `mj app upgrade` idempotent when already at target version. Allow mixed-case schema names in Open App manifest validation.

  **CodeGen fix** (`@memberjunction/codegen-lib`): Emit `override` modifier on generated `Save()` method to satisfy strict TypeScript when entity subclasses override the base `Save()`.

  **AI Agents dashboard** (`@memberjunction/ng-dashboards`): Fix category filter not filtering results, make category filter extraction defensive, fix Reset Filters button. Rename Actions `ExecutionMonitoringComponent` to avoid name collision with dashboards package.

  **Scheduling** (`@memberjunction/server`): Warn loudly when a scheduled job is configured to run more often than every 5 minutes.

  **Palette** (`@memberjunction/ng-ui-components`): Add ARIA labels to icon-only buttons in dialogs and slides for accessibility compliance.

- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [2c905e3]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [eb54def]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [383784c]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-ui-components@5.35.0
  - @memberjunction/ng-conversations@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ng-core-entity-forms@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ng-shared@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/api-keys-base@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/ng-base-application@5.35.0
  - @memberjunction/ng-explorer-settings@5.35.0
  - @memberjunction/ng-testing@5.35.0
  - @memberjunction/ng-action-gallery@5.35.0
  - @memberjunction/ng-actions@5.35.0
  - @memberjunction/ng-agent-requests@5.35.0
  - @memberjunction/ng-agents@5.35.0
  - @memberjunction/ng-ai-test-harness@5.35.0
  - @memberjunction/ng-archive-manager@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-container-directives@5.35.0
  - @memberjunction/ng-credentials@5.35.0
  - @memberjunction/ng-dashboard-viewer@5.35.0
  - @memberjunction/ng-entity-relationship-diagram@5.35.0
  - @memberjunction/ng-entity-viewer@5.35.0
  - @memberjunction/ng-filter-builder@5.35.0
  - @memberjunction/ng-list-management@5.35.0
  - @memberjunction/ng-map-view@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-query-viewer@5.35.0
  - @memberjunction/ng-react@5.35.0
  - @memberjunction/ng-resource-permissions@5.35.0
  - @memberjunction/ng-scheduling@5.35.0
  - @memberjunction/ng-search@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-trees@5.35.0
  - @memberjunction/ng-versions@5.35.0
  - @memberjunction/credentials@5.35.0
  - @memberjunction/integration-engine-base@5.35.0
  - @memberjunction/interactive-component-types@5.35.0
  - @memberjunction/skip-types@5.35.0
  - @memberjunction/templates-base-types@5.35.0
  - @memberjunction/testing-engine-base@5.35.0
  - @memberjunction/ng-clustering@5.35.0
  - @memberjunction/ng-export-service@5.35.0
  - @memberjunction/ng-markdown@5.35.0
  - @memberjunction/ng-word-cloud@5.35.0
  - @memberjunction/export-engine@5.35.0

## 5.34.1

### Patch Changes

- 3a35358: Surface engine load health in System Diagnostics with per-property success/failure status and error messages, add recovery telemetry to ApplicationManager, cache architecture fixes including schema hash staleness detection, empty result timestamp handling, and timestamp precision tolerance
- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-application@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/api-keys-base@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/ng-core-entity-forms@5.34.1
  - @memberjunction/ng-explorer-settings@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-testing@5.34.1
  - @memberjunction/ng-action-gallery@5.34.1
  - @memberjunction/ng-actions@5.34.1
  - @memberjunction/ng-agent-requests@5.34.1
  - @memberjunction/ng-agents@5.34.1
  - @memberjunction/ng-ai-test-harness@5.34.1
  - @memberjunction/ng-archive-manager@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-container-directives@5.34.1
  - @memberjunction/ng-conversations@5.34.1
  - @memberjunction/ng-credentials@5.34.1
  - @memberjunction/ng-dashboard-viewer@5.34.1
  - @memberjunction/ng-entity-relationship-diagram@5.34.1
  - @memberjunction/ng-entity-viewer@5.34.1
  - @memberjunction/ng-filter-builder@5.34.1
  - @memberjunction/ng-list-management@5.34.1
  - @memberjunction/ng-map-view@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-query-viewer@5.34.1
  - @memberjunction/ng-react@5.34.1
  - @memberjunction/ng-resource-permissions@5.34.1
  - @memberjunction/ng-scheduling@5.34.1
  - @memberjunction/ng-search@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-trees@5.34.1
  - @memberjunction/ng-versions@5.34.1
  - @memberjunction/credentials@5.34.1
  - @memberjunction/integration-engine-base@5.34.1
  - @memberjunction/interactive-component-types@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/skip-types@5.34.1
  - @memberjunction/templates-base-types@5.34.1
  - @memberjunction/testing-engine-base@5.34.1
  - @memberjunction/ng-clustering@5.34.1
  - @memberjunction/ng-export-service@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-ui-components@5.34.1
  - @memberjunction/ng-word-cloud@5.34.1
  - @memberjunction/export-engine@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

- 72cb92e: Optimize component loading pipeline: remove 163 MB MJ: Components bulk load from ComponentMetadataEngine, add ComponentMetadataEngineServer for server-only use, add generic cache API to LocalCacheManager with server-side registry caching (page refresh component load reduced from 12-20s to ~70ms), add hash-based 304 support for registry fetches, remove proprietary spec caching to client database, and optimize Component Studio to load lightweight summaries on demand.
- e13dd99: Fix Data Explorer navigation panel duplicate trackBy keys and relative-timestamp NG0100 errors.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [a6a16fa]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-core-entity-forms@5.34.0
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ng-scheduling@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/api-keys-base@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/ng-base-application@5.34.0
  - @memberjunction/ng-explorer-settings@5.34.0
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-testing@5.34.0
  - @memberjunction/ng-action-gallery@5.34.0
  - @memberjunction/ng-actions@5.34.0
  - @memberjunction/ng-agent-requests@5.34.0
  - @memberjunction/ng-agents@5.34.0
  - @memberjunction/ng-ai-test-harness@5.34.0
  - @memberjunction/ng-archive-manager@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-clustering@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-container-directives@5.34.0
  - @memberjunction/ng-conversations@5.34.0
  - @memberjunction/ng-credentials@5.34.0
  - @memberjunction/ng-dashboard-viewer@5.34.0
  - @memberjunction/ng-entity-relationship-diagram@5.34.0
  - @memberjunction/ng-entity-viewer@5.34.0
  - @memberjunction/ng-export-service@5.34.0
  - @memberjunction/ng-filter-builder@5.34.0
  - @memberjunction/ng-list-management@5.34.0
  - @memberjunction/ng-map-view@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-query-viewer@5.34.0
  - @memberjunction/ng-react@5.34.0
  - @memberjunction/ng-resource-permissions@5.34.0
  - @memberjunction/ng-search@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-trees@5.34.0
  - @memberjunction/ng-ui-components@5.34.0
  - @memberjunction/ng-versions@5.34.0
  - @memberjunction/ng-word-cloud@5.34.0
  - @memberjunction/credentials@5.34.0
  - @memberjunction/integration-engine-base@5.34.0
  - @memberjunction/interactive-component-types@5.34.0
  - @memberjunction/export-engine@5.34.0
  - @memberjunction/skip-types@5.34.0
  - @memberjunction/templates-base-types@5.34.0
  - @memberjunction/testing-engine-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Minor Changes

- 97ed790: feat(explorer): Identity Card profile dialog + Admin app reorganization + Developer Tools suite

  **Profile dialog (replaces legacy Settings)** — A focused single-pane Identity Card with slide-in panels for photo and theme editing, functional notification channel toggles (saved via UserInfoEngine), role chips, account info, and sign-out. Drops the redundant Apps tab and the dead Appearance placeholder.

  **About MemberJunction dialog** — Added to the avatar menu's System group. Shows the framework version, three quick stats (entities/applications/queries), the connected user, a "Connected to <host>" line, and an expandable diagnostics section with a copy-to-clipboard helper. A small "MemberJunction · v<version>" line is also shown on the loading screen.

  **User-menu cleanup** — Removed the Toggle Developer Mode / Log Layout (Debug) / Inspect App State items. The two debug items had richer replacements as full dashboards in Admin → Developer Tools. `DeveloperModeService` itself remains for future per-record dev affordances.

  **Admin app reorganization (10 → 4 top-nav)** — Each top-nav item is now a container resource that owns its own left-nav of sub-sections via dynamic component instantiation, with URL deep-linking through NavigationService (`?section=<id>`). Containers detach + reattach sub-component views instead of destroying them, so Event Monitor's capture, GraphQL Console history, scroll positions, and search inputs persist across switches.
  - **Identity & Access**: Users · Roles · Apps · App Roles · Permissions · API Keys
  - **Data & Schema**: ERD · Query Browser · Database Designer
  - **Monitoring**: Diagnostics · SQL Logging
  - **Developer Tools**: GraphQL Console · Event Monitor · Class Registry · Lazy Loading · Settings Explorer · App State · Layout

  **Developer Tools suite (7 inspectors)**:
  - **GraphQL Console** with `mj-code-editor` (graphql + json syntax highlighting), three-tab sidebar (History · Entities · Schema), introspection-driven Schema explorer that detects introspection-disabled and renders a clean lock-icon panel instead of a stack trace, Entities tab listing every `Metadata.Provider.Entities` with metadata-driven CRUD/RunView template generation (uses `getGraphQLTypeNameBase` + `FieldMapper.MapFieldName` so `__mj_*` columns are correctly emitted as `_mj__*` with inline comments), query history with favorites and copy-as-cURL, resizable vertical + horizontal splitters, default replace / shift-click append insertion behavior, Cmd/Ctrl+Enter to run.
  - **Event Monitor** with replay-enabled live tail (`GetEventListener(true)`), sortable column headers, distinct-attribute dropdown filters (Type / Component / Code), pulse indicator, pause/resume/clear, empty-payload-aware expansion.
  - **Class Registry** browser grouped by base class with priority + winner/shadowed badges to surface override conflicts at a glance.
  - **Lazy Loading** chunk inspector with progress bar, filter chips, expandable cards listing the registrations a chunk brings in, and a Force Load button to preload a chunk on demand.
  - **Settings Explorer** for `MJ: User Settings` + `MJ: Instance Configurations` with type detection, JSON-aware previews, and a split detail pane.
  - **App State Inspector** + **Layout Inspector** — read-only JSON viewers using `mj-code-editor` with refresh / copy / download actions.

  All Developer Tools preferences persist per-user via `UserInfoEngine` under the `MJ.DevTools.<scope>` key prefix — search inputs, dropdown selections, sort order, expanded groups, splitter sizes, GraphQL query history, and active sub-sections.

  **Other**:
  - Re-exported `PACKAGE_VERSION` from `@memberjunction/graphql-dataprovider`'s public API for use in About + loading screen.
  - Extended `LazyModuleRegistry` with public `GetSnapshot()` + `ForceLoad()` methods + globalThis publish so diagnostic tools in `ng-dashboards` can introspect lazy state without creating a hard package dependency on `ng-explorer-core`.
  - Added Dialog Button Placement convention to `packages/Angular/CLAUDE.md` (Save / Submit on the LEFT, Cancel on the RIGHT — opposite of the Windows convention).
  - Admin app metadata (`.admin-application.json`) updated to the new 4-item top-nav structure.

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-map-view@5.33.0
  - @memberjunction/ng-entity-viewer@5.33.0
  - @memberjunction/ng-react@5.33.0
  - @memberjunction/interactive-component-types@5.33.0
  - @memberjunction/ng-core-entity-forms@5.33.0
  - @memberjunction/ng-explorer-settings@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-testing@5.33.0
  - @memberjunction/ng-actions@5.33.0
  - @memberjunction/ng-ai-test-harness@5.33.0
  - @memberjunction/ng-conversations@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-search@5.33.0
  - @memberjunction/ng-versions@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/api-keys-base@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/ng-base-application@5.33.0
  - @memberjunction/ng-action-gallery@5.33.0
  - @memberjunction/ng-agent-requests@5.33.0
  - @memberjunction/ng-agents@5.33.0
  - @memberjunction/ng-archive-manager@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-container-directives@5.33.0
  - @memberjunction/ng-credentials@5.33.0
  - @memberjunction/ng-dashboard-viewer@5.33.0
  - @memberjunction/ng-entity-relationship-diagram@5.33.0
  - @memberjunction/ng-filter-builder@5.33.0
  - @memberjunction/ng-list-management@5.33.0
  - @memberjunction/ng-query-viewer@5.33.0
  - @memberjunction/ng-resource-permissions@5.33.0
  - @memberjunction/ng-scheduling@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-trees@5.33.0
  - @memberjunction/credentials@5.33.0
  - @memberjunction/integration-engine-base@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/skip-types@5.33.0
  - @memberjunction/templates-base-types@5.33.0
  - @memberjunction/testing-engine-base@5.33.0
  - @memberjunction/ng-clustering@5.33.0
  - @memberjunction/ng-export-service@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-ui-components@5.33.0
  - @memberjunction/ng-word-cloud@5.33.0
  - @memberjunction/export-engine@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/api-keys-base@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/ng-base-application@5.32.0
  - @memberjunction/ng-core-entity-forms@5.32.0
  - @memberjunction/ng-explorer-settings@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-testing@5.32.0
  - @memberjunction/ng-action-gallery@5.32.0
  - @memberjunction/ng-actions@5.32.0
  - @memberjunction/ng-agent-requests@5.32.0
  - @memberjunction/ng-agents@5.32.0
  - @memberjunction/ng-ai-test-harness@5.32.0
  - @memberjunction/ng-archive-manager@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-container-directives@5.32.0
  - @memberjunction/ng-conversations@5.32.0
  - @memberjunction/ng-credentials@5.32.0
  - @memberjunction/ng-dashboard-viewer@5.32.0
  - @memberjunction/ng-entity-relationship-diagram@5.32.0
  - @memberjunction/ng-entity-viewer@5.32.0
  - @memberjunction/ng-filter-builder@5.32.0
  - @memberjunction/ng-list-management@5.32.0
  - @memberjunction/ng-map-view@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-query-viewer@5.32.0
  - @memberjunction/ng-react@5.32.0
  - @memberjunction/ng-resource-permissions@5.32.0
  - @memberjunction/ng-scheduling@5.32.0
  - @memberjunction/ng-search@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-trees@5.32.0
  - @memberjunction/ng-versions@5.32.0
  - @memberjunction/credentials@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/integration-engine-base@5.32.0
  - @memberjunction/interactive-component-types@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/skip-types@5.32.0
  - @memberjunction/templates-base-types@5.32.0
  - @memberjunction/testing-engine-base@5.32.0
  - @memberjunction/ng-clustering@5.32.0
  - @memberjunction/ng-export-service@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-ui-components@5.32.0
  - @memberjunction/ng-word-cloud@5.32.0
  - @memberjunction/export-engine@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- fc8b9b8: Autotagger scope & governance — per-tenant tag scoping, per-tag governance, persisted embeddings, suggestion queue, Tag Health, and a unified Tag Governance dashboard with full UI.

  **Schema (one additive migration `V202605010846`)** — 9 new columns on `__mj.Tag` (governance + persisted embedding cache), three new tables (`__mj.TagScope` polymorphic M2M, `__mj.TagSynonym`, `__mj.TagSuggestion` review queue). Existing rows default to `IsGlobal=1` so behavior is unchanged out of the box. `IContentSourceConfiguration` JSON type extended with five net-new optional knobs (`SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun`) — CodeGen emits the typed accessor.

  **Engine (`tag-engine` / `tag-engine-base` / `core-entities-server`)** — `MJTagEntityServer` + new `MJTagScopeEntityServer` enforce the `IsGlobal ⊕ TagScope` invariant via `ValidateAsync` (no DB triggers); persisted-embedding `Save()` hook + cold-start hydrate path replace the every-startup recompute. `TagEngineBase` eagerly loads scope + synonyms in `Config()` and exposes `GetVisibleTags / GetTagBySynonym / GetTagByName(name, ctx) / GetTaxonomyTree(rootID, ctx)`. New `TagScopeFilterBuilder` (`BaseSingleton`) produces SQL fragments + in-memory predicates + child-scope subset validator. `TagEngine.ResolveTag` widened with a `'hybrid'` mode and a `ResolveTagOptions` parameter — new 4+1-tier pipeline (synonym → exact → fuzzy → semantic with tiered confidence routing → governance-gated `handleNoMatch`). `SuggestThreshold` band routes to the suggestion queue; `createAndEmbedTag` snapshots parent scope onto new children when parent is non-global. `TagGovernanceEngine` adds `ValidateAutoGrow / EnqueueSuggestion / PromoteSuggestion / RejectSuggestion`; `MergeTags` carries source synonyms (`Source='Merged'`). New `TagHealthJob` with three idempotent emitters (merge / low-usage / wide-node), gated by `MJ_AUTOTAG_RUN_TAG_HEALTH=1` env or invokable on demand. New `TagEngine.RebuildTagEmbeddings(contextUser)` utility for post-model-change rebuilds.

  **Autotag pipeline (`content-autotagging`)** — `ScopeContextResolver` derives per-source scope from `TagRootID`, `RunBudget` enforces per-run + per-item caps, new `OnAfterBatch` hook on `AutotagBaseEngine` gracefully pauses runs via the existing `CancellationRequested` machinery. `BridgeContentItemTagToTaxonomy` threads `scopeContext`, `SuggestThreshold`, source traceability, and an `onTagCreated` callback into `ResolveTag`. Per-item budget exhaustion collapses the effective mode to `hybrid` so further new tags route to suggestions instead of being auto-created.

  **Server (`server` / `graphql-dataprovider`)** — new `TagGovernanceResolver` exposes `PromoteTagSuggestion` / `RejectTagSuggestion` / `RebuildTagEmbeddings` / `RunTagHealth` mutations so suggestion dispositions run transactionally on the server. Matching `GraphQLAIClient` methods + result interfaces.

  **UI (`ng-dashboards` / `ng-core-entity-forms`)** — new `TagGovernanceResourceComponent` (registered as `'TagGovernance'`) — single dashboard with **left-nav** (top nav stays with the MJExplorer shell). Three sections built to the picked mockup options: Taxonomy (Option A — tree + governance/scope/synonyms detail-form, scope dialog with parent-subset validation), Suggestions (Option C — table + drawer with bulk actions and "if approved" preview), Tag Health (Option A — three summary cards + threshold tuning + run history + Rebuild stale embeddings). `MJContentSourceFormComponentExtended` gains a "Tag Pipeline Configuration" panel (Option B dense form) with mode picker cards, threshold sliders that auto-keep `SuggestThreshold < MatchThreshold`, scope+root, and budget fields — the existing JSON code editor stays available collapsed below as the advanced override. Multi-provider safe + UUID-compliant throughout.

  **Tests** — 271 tests across the impacted packages, all green. New: 12 `TagScopeFilterBuilder`, 8 `ValidateAutoGrow`, 4 `TagHealthJob`, 7 `RunBudget`, 8 `ScopeContextResolver`, 18 `TagGovernanceResolver`, 18 `TagGovernance` dashboard, 23 `ContentSource` form (vitest newly enabled in `ng-core-entity-forms`).

  **Documentation** — `guides/TAXONOMY_TAGGING_GUIDE.md` (~730 lines, 7 Mermaid diagrams) covers the entity model, autotag pipeline, 4+1-tier resolver, taxonomy modes, governance gates, scope inheritance, suggestion lifecycle, worked implementation guides, seeding patterns, and ops guidance. `guides/BASE_ENTITY_SERVER_PATTERNS.md` captures the persisted-embedding + `ValidateAsync` invariant + FK-cleanup-before-delete patterns this PR introduces so future agents lift the recipe rather than re-discover it. `mockups/knowledge-hub-classify-redesign/` ships 12 polished HTML mockups (3 options each across the 3 high-priority surfaces) that drove the UX direction.

  Migration ordering: apply the SQL migration → run CodeGen → `mj sync push` for the JSON-type interface → build. The migration is additive and idempotent against `IsGlobal=1` defaults; existing customers see no behavior change until they opt in by setting per-tag governance flags or moving sources off the default `auto-grow` mode.

- 17b8087: no migration but marking as minor due to cache bump stuff added here, good practice, but we're on a minor bump anyway

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
- c8b6f8a: Component Studio: React runtime now keys cached components by content fingerprint so artifact versions sharing `(name, namespace, version)` but differing in code coexist as separate cache entries — fixes the conversation panel's version dropdown showing stale compiled code when toggling between Skip-authored registry-reference stubs and Studio-authored inline-code exports of the same component. Adds change-detection fixes to the artifact-load and artifact-selection dialogs, wires the React bridge's `(initialized)` event into `UpdateWithResolvedSpec` so registry-resolved code populates the code editor on first load, and unwraps Skip's `componentOptions` envelope when reading from the artifact `Content` field.
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ng-core-entity-forms@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/api-keys-base@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/ng-base-application@5.31.0
  - @memberjunction/ng-explorer-settings@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-testing@5.31.0
  - @memberjunction/ng-action-gallery@5.31.0
  - @memberjunction/ng-actions@5.31.0
  - @memberjunction/ng-agent-requests@5.31.0
  - @memberjunction/ng-agents@5.31.0
  - @memberjunction/ng-ai-test-harness@5.31.0
  - @memberjunction/ng-archive-manager@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-clustering@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-container-directives@5.31.0
  - @memberjunction/ng-conversations@5.31.0
  - @memberjunction/ng-credentials@5.31.0
  - @memberjunction/ng-dashboard-viewer@5.31.0
  - @memberjunction/ng-entity-relationship-diagram@5.31.0
  - @memberjunction/ng-entity-viewer@5.31.0
  - @memberjunction/ng-export-service@5.31.0
  - @memberjunction/ng-filter-builder@5.31.0
  - @memberjunction/ng-list-management@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-map-view@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-query-viewer@5.31.0
  - @memberjunction/ng-react@5.31.0
  - @memberjunction/ng-resource-permissions@5.31.0
  - @memberjunction/ng-scheduling@5.31.0
  - @memberjunction/ng-search@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-trees@5.31.0
  - @memberjunction/ng-ui-components@5.31.0
  - @memberjunction/ng-versions@5.31.0
  - @memberjunction/ng-word-cloud@5.31.0
  - @memberjunction/credentials@5.31.0
  - @memberjunction/integration-engine-base@5.31.0
  - @memberjunction/interactive-component-types@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/export-engine@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/skip-types@5.31.0
  - @memberjunction/templates-base-types@5.31.0
  - @memberjunction/testing-engine-base@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/api-keys-base@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/ng-base-application@5.30.1
- @memberjunction/ng-core-entity-forms@5.30.1
- @memberjunction/ng-explorer-settings@5.30.1
- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-testing@5.30.1
- @memberjunction/ng-action-gallery@5.30.1
- @memberjunction/ng-actions@5.30.1
- @memberjunction/ng-agent-requests@5.30.1
- @memberjunction/ng-agents@5.30.1
- @memberjunction/ng-ai-test-harness@5.30.1
- @memberjunction/ng-archive-manager@5.30.1
- @memberjunction/ng-clustering@5.30.1
- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-container-directives@5.30.1
- @memberjunction/ng-conversations@5.30.1
- @memberjunction/ng-credentials@5.30.1
- @memberjunction/ng-dashboard-viewer@5.30.1
- @memberjunction/ng-entity-relationship-diagram@5.30.1
- @memberjunction/ng-entity-viewer@5.30.1
- @memberjunction/ng-export-service@5.30.1
- @memberjunction/ng-filter-builder@5.30.1
- @memberjunction/ng-list-management@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-map-view@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-query-viewer@5.30.1
- @memberjunction/ng-react@5.30.1
- @memberjunction/ng-resource-permissions@5.30.1
- @memberjunction/ng-scheduling@5.30.1
- @memberjunction/ng-search@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-trees@5.30.1
- @memberjunction/ng-ui-components@5.30.1
- @memberjunction/ng-versions@5.30.1
- @memberjunction/ng-word-cloud@5.30.1
- @memberjunction/credentials@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/integration-engine-base@5.30.1
- @memberjunction/interactive-component-types@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/export-engine@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/skip-types@5.30.1
- @memberjunction/templates-base-types@5.30.1
- @memberjunction/testing-engine-base@5.30.1

## 5.30.0

### Patch Changes

- 735a618: Component linter bug fixes and new rules: fix false positives on multi-component tree query delegation, SQL injection detection, datagrid computed fields, and optional chaining; consolidate duplicated utilities into shared lint-utils; add event-parameter-validation rule that catches wrong event property access (e.g., e.data vs e.record); replace substring SQL keyword matching with structural pattern detection.
- 11df18d: Add `aria-label` attributes to icon-only close/back/drill-open buttons in the autotagging pipeline slide-over panels, Knowledge Hub analytics drill-down dialogs, and the dashboard-viewer add-panel dialog so screen readers announce their purpose ("Close form", "Close item detail", "Close source detail", "Close warning", "Close drill-down", "Open record", "Close dialog", "Go back").
- 9154ac7: feat(integration): Salesforce + Sage Intacct pipeline hardening

  **This is in-progress work — not ready to merge.** PR is open for incremental review and discussion.

  ### Sage Intacct connector
  - Range-chunked walk over `RECORDNO` for numeric-PK objects, replacing the previous PK-cursor strategy that silently dropped records when SI's natural scan order wasn't PK-ascending.
  - Upper-bound discovery via exponential probe so termination is exact (not heuristic).
  - Sub-range verification on every completed chunk (independent count of two halves must sum to the parent's count) to catch SI inconsistencies that would otherwise silently undercount.
  - Discovery-probe retry with backoff for transport-only errors; immediate fail-stop on SI API errors (permissions, schema, syntax).
  - `WHENMODIFIED` filter values normalized to SI's `MM/DD/YYYY HH:mm:ss` format — the engine sometimes passes ISO 8601 which SI rejects with `DL02000001`.
  - Bumped `DEFAULT_PAGE_SIZE` from 100 to 1000 (proven safe via probing); legacy single-pull path now hard-fails on full-page-no-resultId instead of silently dropping records via PK-cursor.

  ### Salesforce connector
  - Removed dead `queryLocator` member field. `if (this.queryLocator && ctx.CurrentCursor)` was always false (member never assigned), so every "next batch" call re-executed the original SOQL and returned the same first page until the engine's duplicate-batch guard aborted the entity. Continuation now uses `ctx.CurrentCursor` directly via `FetchNextPage`.
  - Per-batch dedup by `Id` for system metadata sObjects (TabDefinition, FormulaFunctionAllowedType) where SF returns multiple records sharing the placeholder Id `000000000000000AAA`. Drops are logged once per object instead of producing N per-record `UQ_<table>_PK` constraint violations.
  - Removed the over-aggressive `!obj.createable` filter on `isUserRelevantSObject`. Many SF objects are flagged non-createable but carry real customer data (rollups, attachment-link junctions, history-style records).
  - `BuildSOQLQuery` no longer emits `LIMIT batchSize` — that was silently capping every full result set at the page size. Pagination is via SF's native `done` / `nextRecordsUrl`.
  - Watermark comparison uses `>=` instead of `>` so records modified at exactly the watermark instant aren't dropped on the next sync.

  ### IntegrationEngine
  - New typed `SchemaNotGeneratedError` (and `detectSchemaNotGenerated` helper) — `CreateRecord`/`UpdateRecord` now detect the SQL Server `Could not find stored procedure` pattern, throw the typed error, and `ProcessPullSync` fail-stops the entire EntityMap with one `[CONFIGURATION_ERROR]` log line + remaining records marked skipped. Previously every record produced an identical per-record error, drowning sync reports in O(records) duplicates.

  ### Picker → ApplyAll resolver fixes (`IntegrationDiscoveryResolver`)
  - New `resolveSourceObjectsToNames` per-item ID/Name fallback resolver. The old `resolveSourceObjectNames` only honored the IDs path and silently discarded any selection that arrived with `SourceObjectName` only (typical for newly-discovered objects with no IntegrationObject row yet). Real-world impact: 1,156 picker selections were collapsing to 420 IntegrationObjects to 181 generated tables. `LogError` now fires on truly unresolvable selections.
  - `buildTargetConfigs` collects every silent skip into three buckets (`notInSchema`, `noFields`, `noPK`) and emits a single summary line per call: `[buildTargetConfigs summary] requested=X, accepted=Y, dropped=Z (...)`. Lossy stages in the pipeline are now greppable.

  ### SchemaEngine RSU pipeline
  - `executeMigration` chunks oversized migration SQL (>32KB) into batches of 25 statements per `ExecuteSQL` call. Salesforce-class schemas (1100+ tables) produce migrations with 17K+ ALTER TABLE statements as a single batch, which exceeded mssql's client request timeout (30s). Each chunk now resets the timeout clock.

  ### Other
  - `IntegrationSchemaSync` and `IntegrationApplyAllBatch` plumbing for filtered IntrospectSchema flow (Salesforce-only path that describes selected objects rather than a full-org probe).
  - Integration dashboard UI tweaks (connections page rendering for high-FK supertype entities).

- a00af98: no migration/metadata
- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- 216ddc3: Wrap sequential Save/Delete looops in atomic transcatoins (TransactionGroup client-side BeginTransaction/Commit/Rollback server-side)
- Updated dependencies [901e81b]
- Updated dependencies [8980b38]
- Updated dependencies [c2c5892]
- Updated dependencies [11df18d]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [00b5c26]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/ng-search@5.30.0
  - @memberjunction/ng-core-entity-forms@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/ng-dashboard-viewer@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ng-map-view@5.30.0
  - @memberjunction/ng-react@5.30.0
  - @memberjunction/interactive-component-types@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-conversations@5.30.0
  - @memberjunction/ng-resource-permissions@5.30.0
  - @memberjunction/ng-explorer-settings@5.30.0
  - @memberjunction/api-keys-base@5.30.0
  - @memberjunction/ng-base-application@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-testing@5.30.0
  - @memberjunction/ng-action-gallery@5.30.0
  - @memberjunction/ng-actions@5.30.0
  - @memberjunction/ng-agent-requests@5.30.0
  - @memberjunction/ng-agents@5.30.0
  - @memberjunction/ng-ai-test-harness@5.30.0
  - @memberjunction/ng-archive-manager@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-credentials@5.30.0
  - @memberjunction/ng-entity-viewer@5.30.0
  - @memberjunction/ng-list-management@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-query-viewer@5.30.0
  - @memberjunction/ng-scheduling@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-trees@5.30.0
  - @memberjunction/ng-versions@5.30.0
  - @memberjunction/credentials@5.30.0
  - @memberjunction/integration-engine-base@5.30.0
  - @memberjunction/templates-base-types@5.30.0
  - @memberjunction/testing-engine-base@5.30.0
  - @memberjunction/ng-container-directives@5.30.0
  - @memberjunction/ng-entity-relationship-diagram@5.30.0
  - @memberjunction/ng-filter-builder@5.30.0
  - @memberjunction/skip-types@5.30.0
  - @memberjunction/ng-clustering@5.30.0
  - @memberjunction/ng-export-service@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-ui-components@5.30.0
  - @memberjunction/ng-word-cloud@5.30.0
  - @memberjunction/export-engine@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Minor Changes

- 90a0fec: MCP Dashboard: add tool favorites (per-user pinning), bidirectional Zapier
  integration polish, and a self-contained `v5.28` migration for the new
  `MCPToolFavorite` entity (table DDL + extended properties + appended CodeGen
  output so reset-and-rebuild stays a single step).

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- 7006276: Extend MCPEngine with a cached `Favorites` property (`MJ: MCP Tool Favorites`) backed by BaseEngine's `CacheLocal` + event-driven cache sync. Adds `GetFavoritesByUser(userId)` and `GetFavoriteByUserAndTool(userId, toolId)` helpers. MCP Dashboard's `loadFavorites` and `toggleFavorite` paths now read the engine cache instead of issuing per-call RunViews against `MJ: MCP Tool Favorites`; Save/Delete on the favorite entity still flows through BaseEntity so the cache stays consistent across tabs via auto-invalidation.
- Updated dependencies [e77233c]
- Updated dependencies [1b0e04f]
- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
- Updated dependencies [98bad3a]
  - @memberjunction/ng-ai-test-harness@5.29.0
  - @memberjunction/ng-archive-manager@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-core-entity-forms@5.29.0
  - @memberjunction/ng-trees@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-conversations@5.29.0
  - @memberjunction/ng-action-gallery@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/api-keys-base@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/ng-base-application@5.29.0
  - @memberjunction/ng-explorer-settings@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-testing@5.29.0
  - @memberjunction/ng-actions@5.29.0
  - @memberjunction/ng-agent-requests@5.29.0
  - @memberjunction/ng-agents@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-container-directives@5.29.0
  - @memberjunction/ng-credentials@5.29.0
  - @memberjunction/ng-dashboard-viewer@5.29.0
  - @memberjunction/ng-entity-relationship-diagram@5.29.0
  - @memberjunction/ng-entity-viewer@5.29.0
  - @memberjunction/ng-filter-builder@5.29.0
  - @memberjunction/ng-list-management@5.29.0
  - @memberjunction/ng-map-view@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-query-viewer@5.29.0
  - @memberjunction/ng-react@5.29.0
  - @memberjunction/ng-scheduling@5.29.0
  - @memberjunction/ng-search@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-versions@5.29.0
  - @memberjunction/credentials@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/integration-engine-base@5.29.0
  - @memberjunction/interactive-component-types@5.29.0
  - @memberjunction/skip-types@5.29.0
  - @memberjunction/templates-base-types@5.29.0
  - @memberjunction/testing-engine-base@5.29.0
  - @memberjunction/ng-clustering@5.29.0
  - @memberjunction/ng-export-service@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-ui-components@5.29.0
  - @memberjunction/ng-word-cloud@5.29.0
  - @memberjunction/export-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- 2542615: Pin Actions as quick-launch cards on the Home dashboard with a configurable title, accent color, FA icon, preset parameter values, and a list of parameters to prompt for at runtime. Adds Configure and Runner dialogs and extends HomeAppPinService with an 'Actions' ResourceType dedup case.
- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-core-entity-forms@5.28.0
  - @memberjunction/ng-explorer-settings@5.28.0
  - @memberjunction/ng-testing@5.28.0
  - @memberjunction/ng-agents@5.28.0
  - @memberjunction/ng-ai-test-harness@5.28.0
  - @memberjunction/ng-list-management@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/api-keys-base@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/ng-base-application@5.28.0
  - @memberjunction/ng-action-gallery@5.28.0
  - @memberjunction/ng-actions@5.28.0
  - @memberjunction/ng-agent-requests@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-container-directives@5.28.0
  - @memberjunction/ng-conversations@5.28.0
  - @memberjunction/ng-credentials@5.28.0
  - @memberjunction/ng-dashboard-viewer@5.28.0
  - @memberjunction/ng-entity-relationship-diagram@5.28.0
  - @memberjunction/ng-entity-viewer@5.28.0
  - @memberjunction/ng-filter-builder@5.28.0
  - @memberjunction/ng-map-view@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-query-viewer@5.28.0
  - @memberjunction/ng-react@5.28.0
  - @memberjunction/ng-scheduling@5.28.0
  - @memberjunction/ng-search@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-trees@5.28.0
  - @memberjunction/ng-versions@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/integration-engine-base@5.28.0
  - @memberjunction/interactive-component-types@5.28.0
  - @memberjunction/skip-types@5.28.0
  - @memberjunction/templates-base-types@5.28.0
  - @memberjunction/testing-engine-base@5.28.0
  - @memberjunction/ng-clustering@5.28.0
  - @memberjunction/ng-export-service@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-ui-components@5.28.0
  - @memberjunction/ng-word-cloud@5.28.0
  - @memberjunction/export-engine@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-search@5.27.1
  - @memberjunction/ng-dashboard-viewer@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/api-keys-base@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/ng-base-application@5.27.1
  - @memberjunction/ng-core-entity-forms@5.27.1
  - @memberjunction/ng-explorer-settings@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-testing@5.27.1
  - @memberjunction/ng-action-gallery@5.27.1
  - @memberjunction/ng-actions@5.27.1
  - @memberjunction/ng-agent-requests@5.27.1
  - @memberjunction/ng-agents@5.27.1
  - @memberjunction/ng-ai-test-harness@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-container-directives@5.27.1
  - @memberjunction/ng-conversations@5.27.1
  - @memberjunction/ng-credentials@5.27.1
  - @memberjunction/ng-entity-relationship-diagram@5.27.1
  - @memberjunction/ng-entity-viewer@5.27.1
  - @memberjunction/ng-list-management@5.27.1
  - @memberjunction/ng-map-view@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-query-viewer@5.27.1
  - @memberjunction/ng-react@5.27.1
  - @memberjunction/ng-scheduling@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/ng-trees@5.27.1
  - @memberjunction/ng-versions@5.27.1
  - @memberjunction/integration-engine-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/skip-types@5.27.1
  - @memberjunction/templates-base-types@5.27.1
  - @memberjunction/testing-engine-base@5.27.1
  - @memberjunction/ng-clustering@5.27.1
  - @memberjunction/interactive-component-types@5.27.1
  - @memberjunction/ng-filter-builder@5.27.1
  - @memberjunction/ng-export-service@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-ui-components@5.27.1
  - @memberjunction/ng-word-cloud@5.27.1
  - @memberjunction/export-engine@5.27.1

## 5.27.0

### Minor Changes

- 348decb: metadata bump so minor

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
- 6fd2886: Add server connectivity heartbeat service with warning banner that alerts users when the API connection is lost.
- Updated dependencies [35cf7d4]
- Updated dependencies [a642e3f]
- Updated dependencies [4357090]
  - @memberjunction/ng-trees@5.27.0
  - @memberjunction/ng-search@5.27.0
  - @memberjunction/ng-conversations@5.27.0
  - @memberjunction/ng-core-entity-forms@5.27.0
  - @memberjunction/ng-dashboard-viewer@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/api-keys-base@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/ng-base-application@5.27.0
  - @memberjunction/ng-explorer-settings@5.27.0
  - @memberjunction/ng-shared@5.27.0
  - @memberjunction/ng-testing@5.27.0
  - @memberjunction/ng-action-gallery@5.27.0
  - @memberjunction/ng-actions@5.27.0
  - @memberjunction/ng-agent-requests@5.27.0
  - @memberjunction/ng-agents@5.27.0
  - @memberjunction/ng-ai-test-harness@5.27.0
  - @memberjunction/ng-clustering@5.27.0
  - @memberjunction/ng-code-editor@5.27.0
  - @memberjunction/ng-container-directives@5.27.0
  - @memberjunction/ng-credentials@5.27.0
  - @memberjunction/ng-entity-relationship-diagram@5.27.0
  - @memberjunction/ng-entity-viewer@5.27.0
  - @memberjunction/ng-export-service@5.27.0
  - @memberjunction/ng-filter-builder@5.27.0
  - @memberjunction/ng-list-management@5.27.0
  - @memberjunction/ng-markdown@5.27.0
  - @memberjunction/ng-map-view@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/ng-query-viewer@5.27.0
  - @memberjunction/ng-react@5.27.0
  - @memberjunction/ng-scheduling@5.27.0
  - @memberjunction/ng-shared-generic@5.27.0
  - @memberjunction/ng-ui-components@5.27.0
  - @memberjunction/ng-versions@5.27.0
  - @memberjunction/ng-word-cloud@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/integration-engine-base@5.27.0
  - @memberjunction/interactive-component-types@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/export-engine@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/skip-types@5.27.0
  - @memberjunction/templates-base-types@5.27.0
  - @memberjunction/testing-engine-base@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-action-gallery@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-core-entity-forms@5.26.0
  - @memberjunction/ng-dashboard-viewer@5.26.0
  - @memberjunction/ng-entity-relationship-diagram@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/ng-ui-components@5.26.0
  - @memberjunction/skip-types@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/api-keys-base@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/ng-base-application@5.26.0
  - @memberjunction/ng-explorer-settings@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-testing@5.26.0
  - @memberjunction/ng-actions@5.26.0
  - @memberjunction/ng-agent-requests@5.26.0
  - @memberjunction/ng-agents@5.26.0
  - @memberjunction/ng-ai-test-harness@5.26.0
  - @memberjunction/ng-conversations@5.26.0
  - @memberjunction/ng-credentials@5.26.0
  - @memberjunction/ng-entity-viewer@5.26.0
  - @memberjunction/ng-list-management@5.26.0
  - @memberjunction/ng-map-view@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-query-viewer@5.26.0
  - @memberjunction/ng-react@5.26.0
  - @memberjunction/ng-scheduling@5.26.0
  - @memberjunction/ng-search@5.26.0
  - @memberjunction/ng-trees@5.26.0
  - @memberjunction/ng-versions@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/integration-engine-base@5.26.0
  - @memberjunction/templates-base-types@5.26.0
  - @memberjunction/testing-engine-base@5.26.0
  - @memberjunction/ng-container-directives@5.26.0
  - @memberjunction/ng-filter-builder@5.26.0
  - @memberjunction/interactive-component-types@5.26.0
  - @memberjunction/ng-clustering@5.26.0
  - @memberjunction/ng-export-service@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/ng-word-cloud@5.26.0
  - @memberjunction/export-engine@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- a24ff53: no metadata/migration
- 5e2a64f: no migration
- 1eb9f6e: no migration/metadata
- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [e96f683]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
- Updated dependencies [c5426c5]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/interactive-component-types@5.25.0
  - @memberjunction/ng-conversations@5.25.0
  - @memberjunction/ng-core-entity-forms@5.25.0
  - @memberjunction/ng-query-viewer@5.25.0
  - @memberjunction/skip-types@5.25.0
  - @memberjunction/ng-ai-test-harness@5.25.0
  - @memberjunction/ng-dashboard-viewer@5.25.0
  - @memberjunction/ng-search@5.25.0
  - @memberjunction/ng-entity-viewer@5.25.0
  - @memberjunction/ng-trees@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/api-keys-base@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ng-base-application@5.25.0
  - @memberjunction/ng-explorer-settings@5.25.0
  - @memberjunction/ng-shared@5.25.0
  - @memberjunction/ng-testing@5.25.0
  - @memberjunction/ng-action-gallery@5.25.0
  - @memberjunction/ng-actions@5.25.0
  - @memberjunction/ng-agent-requests@5.25.0
  - @memberjunction/ng-agents@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-container-directives@5.25.0
  - @memberjunction/ng-credentials@5.25.0
  - @memberjunction/ng-entity-relationship-diagram@5.25.0
  - @memberjunction/ng-filter-builder@5.25.0
  - @memberjunction/ng-list-management@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-react@5.25.0
  - @memberjunction/ng-scheduling@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-versions@5.25.0
  - @memberjunction/integration-engine-base@5.25.0
  - @memberjunction/templates-base-types@5.25.0
  - @memberjunction/testing-engine-base@5.25.0
  - @memberjunction/ng-clustering@5.25.0
  - @memberjunction/ng-export-service@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-ui-components@5.25.0
  - @memberjunction/ng-word-cloud@5.25.0
  - @memberjunction/export-engine@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [f9792d1]
- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ng-react@5.24.0
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ng-agents@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-core-entity-forms@5.24.0
  - @memberjunction/ng-agent-requests@5.24.0
  - @memberjunction/ng-ai-test-harness@5.24.0
  - @memberjunction/ng-conversations@5.24.0
  - @memberjunction/skip-types@5.24.0
  - @memberjunction/ng-clustering@5.24.0
  - @memberjunction/interactive-component-types@5.24.0
  - @memberjunction/ng-explorer-settings@5.24.0
  - @memberjunction/ng-shared@5.24.0
  - @memberjunction/ng-testing@5.24.0
  - @memberjunction/ng-actions@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-versions@5.24.0
  - @memberjunction/api-keys-base@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ng-base-application@5.24.0
  - @memberjunction/ng-action-gallery@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-container-directives@5.24.0
  - @memberjunction/ng-credentials@5.24.0
  - @memberjunction/ng-dashboard-viewer@5.24.0
  - @memberjunction/ng-entity-relationship-diagram@5.24.0
  - @memberjunction/ng-entity-viewer@5.24.0
  - @memberjunction/ng-filter-builder@5.24.0
  - @memberjunction/ng-list-management@5.24.0
  - @memberjunction/ng-query-viewer@5.24.0
  - @memberjunction/ng-scheduling@5.24.0
  - @memberjunction/ng-search@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-trees@5.24.0
  - @memberjunction/integration-engine-base@5.24.0
  - @memberjunction/templates-base-types@5.24.0
  - @memberjunction/testing-engine-base@5.24.0
  - @memberjunction/ng-export-service@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-ui-components@5.24.0
  - @memberjunction/ng-word-cloud@5.24.0
  - @memberjunction/export-engine@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- 1d1e02e: Knowledge Hub Phase 2: autotagging pipeline, duplicate detection dashboards, and client tool invocation system.

  Autotagging: Run Pipeline button with real-time progress, direct vectorization of content items (bypasses entity documents), pipeline stage visualization, Gemini 3 Flash tagging.

  Duplicate Detection: Run Detection button with entity document picker, progress via PubSub, Kanban approve/reject with persistence.

  Client Tools: New 'ClientTools' step type in BaseAgent enabling browser-side tool invocation (navigation, UI display, tab switching) during agent execution. Includes ClientToolRequestManager server singleton, GraphQL subscription transport, runtime tool decoration, three-level timeout, loop agent integration, and 646-line documentation guide.

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ng-base-application@5.23.0
  - @memberjunction/ng-dashboard-viewer@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-ui-components@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ng-react@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/api-keys-base@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/ng-core-entity-forms@5.23.0
  - @memberjunction/ng-explorer-settings@5.23.0
  - @memberjunction/ng-shared@5.23.0
  - @memberjunction/ng-testing@5.23.0
  - @memberjunction/ng-action-gallery@5.23.0
  - @memberjunction/ng-actions@5.23.0
  - @memberjunction/ng-agent-requests@5.23.0
  - @memberjunction/ng-agents@5.23.0
  - @memberjunction/ng-ai-test-harness@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-container-directives@5.23.0
  - @memberjunction/ng-conversations@5.23.0
  - @memberjunction/ng-credentials@5.23.0
  - @memberjunction/ng-entity-relationship-diagram@5.23.0
  - @memberjunction/ng-entity-viewer@5.23.0
  - @memberjunction/ng-filter-builder@5.23.0
  - @memberjunction/ng-list-management@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-query-viewer@5.23.0
  - @memberjunction/ng-scheduling@5.23.0
  - @memberjunction/ng-search@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-trees@5.23.0
  - @memberjunction/ng-versions@5.23.0
  - @memberjunction/integration-engine-base@5.23.0
  - @memberjunction/interactive-component-types@5.23.0
  - @memberjunction/skip-types@5.23.0
  - @memberjunction/templates-base-types@5.23.0
  - @memberjunction/testing-engine-base@5.23.0
  - @memberjunction/ng-clustering@5.23.0
  - @memberjunction/ng-export-service@5.23.0
  - @memberjunction/ng-markdown@5.23.0
  - @memberjunction/export-engine@5.23.0

## 5.22.0

### Patch Changes

- cf91278: Fix NVARCHAR(MAX) mangling in SQL parser, resolve Invalid string length error in AI monitoring dashboard, add unit tests for AI agent components, and add replaceElements guidance for loop agent prompts
- e123e4b: bug fixes for RunView cache, Data Explorer, and MCP OAuth scopes
- e89c3bc: no migratiin
- f2a6bec: Universal lazy loading via ClassFactory async API. Fixes HomeApplication being tree-shaken by moving lazy loading from consumer-specific retry patterns into ClassFactory itself with RegisterLazyLoader, CreateInstanceAsync, and GetRegistrationAsync. Lazy config now uses compound keys (BaseClassName::Key) to support any base class. Adds coverage audit to codegen to detect gaps.
- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ng-conversations@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-agent-requests@5.22.0
  - @memberjunction/ng-agents@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-base-application@5.22.0
  - @memberjunction/ng-dashboard-viewer@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-core-entity-forms@5.22.0
  - @memberjunction/ng-ai-test-harness@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/skip-types@5.22.0
  - @memberjunction/api-keys-base@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/ng-explorer-settings@5.22.0
  - @memberjunction/ng-shared@5.22.0
  - @memberjunction/ng-testing@5.22.0
  - @memberjunction/ng-action-gallery@5.22.0
  - @memberjunction/ng-actions@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-container-directives@5.22.0
  - @memberjunction/ng-credentials@5.22.0
  - @memberjunction/ng-entity-relationship-diagram@5.22.0
  - @memberjunction/ng-entity-viewer@5.22.0
  - @memberjunction/ng-filter-builder@5.22.0
  - @memberjunction/ng-list-management@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-query-viewer@5.22.0
  - @memberjunction/ng-react@5.22.0
  - @memberjunction/ng-scheduling@5.22.0
  - @memberjunction/ng-search@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/ng-trees@5.22.0
  - @memberjunction/ng-versions@5.22.0
  - @memberjunction/integration-engine-base@5.22.0
  - @memberjunction/interactive-component-types@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/templates-base-types@5.22.0
  - @memberjunction/testing-engine-base@5.22.0
  - @memberjunction/ng-export-service@5.22.0
  - @memberjunction/ng-markdown@5.22.0
  - @memberjunction/export-engine@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ng-react@5.21.0
  - @memberjunction/interactive-component-types@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/api-keys-base@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/ng-base-application@5.21.0
  - @memberjunction/ng-core-entity-forms@5.21.0
  - @memberjunction/ng-explorer-settings@5.21.0
  - @memberjunction/ng-shared@5.21.0
  - @memberjunction/ng-testing@5.21.0
  - @memberjunction/ng-action-gallery@5.21.0
  - @memberjunction/ng-actions@5.21.0
  - @memberjunction/ng-agent-requests@5.21.0
  - @memberjunction/ng-agents@5.21.0
  - @memberjunction/ng-ai-test-harness@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-container-directives@5.21.0
  - @memberjunction/ng-credentials@5.21.0
  - @memberjunction/ng-dashboard-viewer@5.21.0
  - @memberjunction/ng-entity-relationship-diagram@5.21.0
  - @memberjunction/ng-entity-viewer@5.21.0
  - @memberjunction/ng-filter-builder@5.21.0
  - @memberjunction/ng-list-management@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-query-viewer@5.21.0
  - @memberjunction/ng-scheduling@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-trees@5.21.0
  - @memberjunction/ng-versions@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/integration-engine-base@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/skip-types@5.21.0
  - @memberjunction/templates-base-types@5.21.0
  - @memberjunction/testing-engine-base@5.21.0
  - @memberjunction/ng-export-service@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/export-engine@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/api-keys-base@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/ng-base-application@5.20.0
  - @memberjunction/ng-core-entity-forms@5.20.0
  - @memberjunction/ng-explorer-settings@5.20.0
  - @memberjunction/ng-shared@5.20.0
  - @memberjunction/ng-testing@5.20.0
  - @memberjunction/ng-action-gallery@5.20.0
  - @memberjunction/ng-actions@5.20.0
  - @memberjunction/ng-agent-requests@5.20.0
  - @memberjunction/ng-agents@5.20.0
  - @memberjunction/ng-ai-test-harness@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-container-directives@5.20.0
  - @memberjunction/ng-credentials@5.20.0
  - @memberjunction/ng-dashboard-viewer@5.20.0
  - @memberjunction/ng-entity-relationship-diagram@5.20.0
  - @memberjunction/ng-entity-viewer@5.20.0
  - @memberjunction/ng-filter-builder@5.20.0
  - @memberjunction/ng-list-management@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-query-viewer@5.20.0
  - @memberjunction/ng-react@5.20.0
  - @memberjunction/ng-scheduling@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-trees@5.20.0
  - @memberjunction/ng-versions@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/integration-engine-base@5.20.0
  - @memberjunction/interactive-component-types@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/skip-types@5.20.0
  - @memberjunction/templates-base-types@5.20.0
  - @memberjunction/testing-engine-base@5.20.0
  - @memberjunction/ng-export-service@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/export-engine@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/api-keys-base@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/ng-base-application@5.19.0
- @memberjunction/ng-core-entity-forms@5.19.0
- @memberjunction/ng-explorer-settings@5.19.0
- @memberjunction/ng-shared@5.19.0
- @memberjunction/ng-testing@5.19.0
- @memberjunction/ng-action-gallery@5.19.0
- @memberjunction/ng-actions@5.19.0
- @memberjunction/ng-agent-requests@5.19.0
- @memberjunction/ng-agents@5.19.0
- @memberjunction/ng-ai-test-harness@5.19.0
- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-container-directives@5.19.0
- @memberjunction/ng-credentials@5.19.0
- @memberjunction/ng-dashboard-viewer@5.19.0
- @memberjunction/ng-entity-relationship-diagram@5.19.0
- @memberjunction/ng-entity-viewer@5.19.0
- @memberjunction/ng-export-service@5.19.0
- @memberjunction/ng-filter-builder@5.19.0
- @memberjunction/ng-list-management@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-query-viewer@5.19.0
- @memberjunction/ng-react@5.19.0
- @memberjunction/ng-scheduling@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-trees@5.19.0
- @memberjunction/ng-versions@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/integration-engine-base@5.19.0
- @memberjunction/interactive-component-types@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/export-engine@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/skip-types@5.19.0
- @memberjunction/templates-base-types@5.19.0
- @memberjunction/testing-engine-base@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [d2c4e54]
- Updated dependencies [ee4bf94]
- Updated dependencies [de310bc]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-core-entity-forms@5.18.0
  - @memberjunction/integration-engine-base@5.18.0
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-agent-requests@5.18.0
  - @memberjunction/ng-agents@5.18.0
  - @memberjunction/ng-ai-test-harness@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/skip-types@5.18.0
  - @memberjunction/ng-query-viewer@5.18.0
  - @memberjunction/ng-shared@5.18.0
  - @memberjunction/ng-action-gallery@5.18.0
  - @memberjunction/ng-explorer-settings@5.18.0
  - @memberjunction/ng-testing@5.18.0
  - @memberjunction/ng-actions@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ng-react@5.18.0
  - @memberjunction/ng-versions@5.18.0
  - @memberjunction/ng-dashboard-viewer@5.18.0
  - @memberjunction/ng-list-management@5.18.0
  - @memberjunction/ng-credentials@5.18.0
  - @memberjunction/ng-scheduling@5.18.0
  - @memberjunction/api-keys-base@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/ng-base-application@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-container-directives@5.18.0
  - @memberjunction/ng-entity-relationship-diagram@5.18.0
  - @memberjunction/ng-entity-viewer@5.18.0
  - @memberjunction/ng-export-service@5.18.0
  - @memberjunction/ng-filter-builder@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/ng-trees@5.18.0
  - @memberjunction/interactive-component-types@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/export-engine@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/templates-base-types@5.18.0
  - @memberjunction/testing-engine-base@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [001fd3e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/ng-core-entity-forms@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-explorer-settings@5.17.0
  - @memberjunction/ng-shared@5.17.0
  - @memberjunction/ng-testing@5.17.0
  - @memberjunction/ng-actions@5.17.0
  - @memberjunction/ng-ai-test-harness@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ng-react@5.17.0
  - @memberjunction/ng-versions@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/api-keys-base@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/ng-base-application@5.17.0
  - @memberjunction/ng-action-gallery@5.17.0
  - @memberjunction/ng-agent-requests@5.17.0
  - @memberjunction/ng-agents@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-container-directives@5.17.0
  - @memberjunction/ng-credentials@5.17.0
  - @memberjunction/ng-dashboard-viewer@5.17.0
  - @memberjunction/ng-entity-relationship-diagram@5.17.0
  - @memberjunction/ng-entity-viewer@5.17.0
  - @memberjunction/ng-filter-builder@5.17.0
  - @memberjunction/ng-list-management@5.17.0
  - @memberjunction/ng-query-viewer@5.17.0
  - @memberjunction/ng-scheduling@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-trees@5.17.0
  - @memberjunction/integration-engine-base@5.17.0
  - @memberjunction/interactive-component-types@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/skip-types@5.17.0
  - @memberjunction/templates-base-types@5.17.0
  - @memberjunction/testing-engine-base@5.17.0
  - @memberjunction/ng-export-service@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/export-engine@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/api-keys-base@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/ng-base-application@5.16.0
  - @memberjunction/ng-core-entity-forms@5.16.0
  - @memberjunction/ng-explorer-settings@5.16.0
  - @memberjunction/ng-shared@5.16.0
  - @memberjunction/ng-testing@5.16.0
  - @memberjunction/ng-action-gallery@5.16.0
  - @memberjunction/ng-actions@5.16.0
  - @memberjunction/ng-agent-requests@5.16.0
  - @memberjunction/ng-agents@5.16.0
  - @memberjunction/ng-ai-test-harness@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-container-directives@5.16.0
  - @memberjunction/ng-credentials@5.16.0
  - @memberjunction/ng-dashboard-viewer@5.16.0
  - @memberjunction/ng-entity-relationship-diagram@5.16.0
  - @memberjunction/ng-entity-viewer@5.16.0
  - @memberjunction/ng-filter-builder@5.16.0
  - @memberjunction/ng-list-management@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-query-viewer@5.16.0
  - @memberjunction/ng-react@5.16.0
  - @memberjunction/ng-scheduling@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-trees@5.16.0
  - @memberjunction/ng-versions@5.16.0
  - @memberjunction/integration-engine-base@5.16.0
  - @memberjunction/interactive-component-types@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/skip-types@5.16.0
  - @memberjunction/templates-base-types@5.16.0
  - @memberjunction/testing-engine-base@5.16.0
  - @memberjunction/ng-export-service@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/export-engine@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/ng-core-entity-forms@5.15.0
  - @memberjunction/core@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/api-keys-base@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/ng-base-application@5.15.0
  - @memberjunction/ng-explorer-settings@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-testing@5.15.0
  - @memberjunction/ng-action-gallery@5.15.0
  - @memberjunction/ng-actions@5.15.0
  - @memberjunction/ng-agent-requests@5.15.0
  - @memberjunction/ng-agents@5.15.0
  - @memberjunction/ng-ai-test-harness@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-container-directives@5.15.0
  - @memberjunction/ng-credentials@5.15.0
  - @memberjunction/ng-dashboard-viewer@5.15.0
  - @memberjunction/ng-entity-relationship-diagram@5.15.0
  - @memberjunction/ng-entity-viewer@5.15.0
  - @memberjunction/ng-filter-builder@5.15.0
  - @memberjunction/ng-list-management@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-query-viewer@5.15.0
  - @memberjunction/ng-react@5.15.0
  - @memberjunction/ng-scheduling@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-trees@5.15.0
  - @memberjunction/ng-versions@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/integration-engine-base@5.15.0
  - @memberjunction/interactive-component-types@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/skip-types@5.15.0
  - @memberjunction/templates-base-types@5.15.0
  - @memberjunction/testing-engine-base@5.15.0
  - @memberjunction/ng-export-service@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/export-engine@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/skip-types@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/integration-engine-base@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/api-keys-base@5.14.0
  - @memberjunction/ng-base-application@5.14.0
  - @memberjunction/ng-core-entity-forms@5.14.0
  - @memberjunction/ng-explorer-settings@5.14.0
  - @memberjunction/ng-shared@5.14.0
  - @memberjunction/ng-testing@5.14.0
  - @memberjunction/ng-action-gallery@5.14.0
  - @memberjunction/ng-actions@5.14.0
  - @memberjunction/ng-agent-requests@5.14.0
  - @memberjunction/ng-agents@5.14.0
  - @memberjunction/ng-ai-test-harness@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-container-directives@5.14.0
  - @memberjunction/ng-credentials@5.14.0
  - @memberjunction/ng-dashboard-viewer@5.14.0
  - @memberjunction/ng-entity-relationship-diagram@5.14.0
  - @memberjunction/ng-entity-viewer@5.14.0
  - @memberjunction/ng-filter-builder@5.14.0
  - @memberjunction/ng-list-management@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-query-viewer@5.14.0
  - @memberjunction/ng-react@5.14.0
  - @memberjunction/ng-scheduling@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-trees@5.14.0
  - @memberjunction/ng-versions@5.14.0
  - @memberjunction/interactive-component-types@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/templates-base-types@5.14.0
  - @memberjunction/testing-engine-base@5.14.0
  - @memberjunction/ng-export-service@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/export-engine@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- 1bb9b86: Entity Form scrollbars and List fixes
- Updated dependencies [f72b538]
- Updated dependencies [1bb9b86]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-core-entity-forms@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/api-keys-base@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/ng-base-application@5.13.0
  - @memberjunction/ng-explorer-settings@5.13.0
  - @memberjunction/ng-shared@5.13.0
  - @memberjunction/ng-testing@5.13.0
  - @memberjunction/ng-action-gallery@5.13.0
  - @memberjunction/ng-actions@5.13.0
  - @memberjunction/ng-agent-requests@5.13.0
  - @memberjunction/ng-agents@5.13.0
  - @memberjunction/ng-ai-test-harness@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-container-directives@5.13.0
  - @memberjunction/ng-credentials@5.13.0
  - @memberjunction/ng-dashboard-viewer@5.13.0
  - @memberjunction/ng-entity-relationship-diagram@5.13.0
  - @memberjunction/ng-entity-viewer@5.13.0
  - @memberjunction/ng-filter-builder@5.13.0
  - @memberjunction/ng-list-management@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-query-viewer@5.13.0
  - @memberjunction/ng-react@5.13.0
  - @memberjunction/ng-scheduling@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-trees@5.13.0
  - @memberjunction/ng-versions@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/integration-engine-base@5.13.0
  - @memberjunction/interactive-component-types@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/skip-types@5.13.0
  - @memberjunction/templates-base-types@5.13.0
  - @memberjunction/testing-engine-base@5.13.0
  - @memberjunction/ng-export-service@5.13.0
  - @memberjunction/ng-markdown@5.13.0
  - @memberjunction/export-engine@5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/integration-engine-base@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/skip-types@5.12.0
  - @memberjunction/ng-query-viewer@5.12.0
  - @memberjunction/ng-entity-viewer@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-base-application@5.12.0
  - @memberjunction/ng-core-entity-forms@5.12.0
  - @memberjunction/ng-explorer-settings@5.12.0
  - @memberjunction/ng-testing@5.12.0
  - @memberjunction/ng-actions@5.12.0
  - @memberjunction/ng-agents@5.12.0
  - @memberjunction/ng-ai-test-harness@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-credentials@5.12.0
  - @memberjunction/ng-dashboard-viewer@5.12.0
  - @memberjunction/ng-entity-relationship-diagram@5.12.0
  - @memberjunction/ng-export-service@5.12.0
  - @memberjunction/ng-filter-builder@5.12.0
  - @memberjunction/ng-list-management@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/ng-trees@5.12.0
  - @memberjunction/ng-versions@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/api-keys-base@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/ng-shared@5.12.0
  - @memberjunction/ng-action-gallery@5.12.0
  - @memberjunction/ng-agent-requests@5.12.0
  - @memberjunction/ng-container-directives@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/ng-react@5.12.0
  - @memberjunction/ng-scheduling@5.12.0
  - @memberjunction/interactive-component-types@5.12.0
  - @memberjunction/templates-base-types@5.12.0
  - @memberjunction/testing-engine-base@5.12.0
  - @memberjunction/export-engine@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- 457afcf: Add create/edit query drawer to Query Browser; fix full record toolbar; suppress duplicate empty state in query grid
- Updated dependencies [a4c3c81]
- Updated dependencies [457afcf]
  - @memberjunction/ng-query-viewer@5.11.0
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-core-entity-forms@5.11.0
  - @memberjunction/ng-dashboard-viewer@5.11.0
  - @memberjunction/ng-explorer-settings@5.11.0
  - @memberjunction/ng-shared@5.11.0
  - @memberjunction/ng-testing@5.11.0
  - @memberjunction/ng-actions@5.11.0
  - @memberjunction/ng-ai-test-harness@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ng-react@5.11.0
  - @memberjunction/ng-versions@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/api-keys-base@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/ng-base-application@5.11.0
  - @memberjunction/ng-action-gallery@5.11.0
  - @memberjunction/ng-agents@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-container-directives@5.11.0
  - @memberjunction/ng-credentials@5.11.0
  - @memberjunction/ng-entity-relationship-diagram@5.11.0
  - @memberjunction/ng-entity-viewer@5.11.0
  - @memberjunction/ng-filter-builder@5.11.0
  - @memberjunction/ng-list-management@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-trees@5.11.0
  - @memberjunction/integration-engine-base@5.11.0
  - @memberjunction/interactive-component-types@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/skip-types@5.11.0
  - @memberjunction/templates-base-types@5.11.0
  - @memberjunction/testing-engine-base@5.11.0
  - @memberjunction/ng-export-service@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/export-engine@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/api-keys-base@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/ng-base-application@5.10.1
- @memberjunction/ng-core-entity-forms@5.10.1
- @memberjunction/ng-explorer-settings@5.10.1
- @memberjunction/ng-shared@5.10.1
- @memberjunction/ng-testing@5.10.1
- @memberjunction/ng-action-gallery@5.10.1
- @memberjunction/ng-actions@5.10.1
- @memberjunction/ng-agents@5.10.1
- @memberjunction/ng-ai-test-harness@5.10.1
- @memberjunction/ng-code-editor@5.10.1
- @memberjunction/ng-container-directives@5.10.1
- @memberjunction/ng-credentials@5.10.1
- @memberjunction/ng-dashboard-viewer@5.10.1
- @memberjunction/ng-entity-relationship-diagram@5.10.1
- @memberjunction/ng-entity-viewer@5.10.1
- @memberjunction/ng-export-service@5.10.1
- @memberjunction/ng-filter-builder@5.10.1
- @memberjunction/ng-list-management@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-query-viewer@5.10.1
- @memberjunction/ng-react@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-trees@5.10.1
- @memberjunction/ng-versions@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/integration-engine-base@5.10.1
- @memberjunction/interactive-component-types@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/export-engine@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/skip-types@5.10.1
- @memberjunction/templates-base-types@5.10.1
- @memberjunction/testing-engine-base@5.10.1

## 5.10.0

### Patch Changes

- 3df5e4b: no migration
- Updated dependencies [f2df653]
- Updated dependencies [3df5e4b]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/skip-types@5.10.0
  - @memberjunction/ng-core-entity-forms@5.10.0
  - @memberjunction/ng-query-viewer@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/api-keys-base@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/ng-base-application@5.10.0
  - @memberjunction/ng-explorer-settings@5.10.0
  - @memberjunction/ng-shared@5.10.0
  - @memberjunction/ng-testing@5.10.0
  - @memberjunction/ng-action-gallery@5.10.0
  - @memberjunction/ng-actions@5.10.0
  - @memberjunction/ng-agents@5.10.0
  - @memberjunction/ng-ai-test-harness@5.10.0
  - @memberjunction/ng-code-editor@5.10.0
  - @memberjunction/ng-container-directives@5.10.0
  - @memberjunction/ng-credentials@5.10.0
  - @memberjunction/ng-dashboard-viewer@5.10.0
  - @memberjunction/ng-entity-relationship-diagram@5.10.0
  - @memberjunction/ng-entity-viewer@5.10.0
  - @memberjunction/ng-filter-builder@5.10.0
  - @memberjunction/ng-list-management@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-react@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-trees@5.10.0
  - @memberjunction/ng-versions@5.10.0
  - @memberjunction/integration-engine-base@5.10.0
  - @memberjunction/interactive-component-types@5.10.0
  - @memberjunction/templates-base-types@5.10.0
  - @memberjunction/testing-engine-base@5.10.0
  - @memberjunction/ng-export-service@5.10.0
  - @memberjunction/ng-markdown@5.10.0
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
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/api-keys-base@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/ng-base-application@5.9.0
  - @memberjunction/ng-core-entity-forms@5.9.0
  - @memberjunction/ng-explorer-settings@5.9.0
  - @memberjunction/ng-shared@5.9.0
  - @memberjunction/ng-testing@5.9.0
  - @memberjunction/ng-action-gallery@5.9.0
  - @memberjunction/ng-actions@5.9.0
  - @memberjunction/ng-agents@5.9.0
  - @memberjunction/ng-ai-test-harness@5.9.0
  - @memberjunction/ng-code-editor@5.9.0
  - @memberjunction/ng-credentials@5.9.0
  - @memberjunction/ng-dashboard-viewer@5.9.0
  - @memberjunction/ng-entity-viewer@5.9.0
  - @memberjunction/ng-list-management@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-query-viewer@5.9.0
  - @memberjunction/ng-react@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-trees@5.9.0
  - @memberjunction/ng-versions@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/integration-engine-base@5.9.0
  - @memberjunction/templates-base-types@5.9.0
  - @memberjunction/testing-engine-base@5.9.0
  - @memberjunction/ng-container-directives@5.9.0
  - @memberjunction/ng-entity-relationship-diagram@5.9.0
  - @memberjunction/interactive-component-types@5.9.0
  - @memberjunction/skip-types@5.9.0
  - @memberjunction/ng-export-service@5.9.0
  - @memberjunction/ng-markdown@5.9.0
  - @memberjunction/export-engine@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-core-entity-forms@5.8.0
  - @memberjunction/ng-explorer-settings@5.8.0
  - @memberjunction/ng-shared@5.8.0
  - @memberjunction/ng-testing@5.8.0
  - @memberjunction/ng-actions@5.8.0
  - @memberjunction/ng-ai-test-harness@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ng-react@5.8.0
  - @memberjunction/ng-versions@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/api-keys-base@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/ng-base-application@5.8.0
  - @memberjunction/ng-action-gallery@5.8.0
  - @memberjunction/ng-agents@5.8.0
  - @memberjunction/ng-code-editor@5.8.0
  - @memberjunction/ng-container-directives@5.8.0
  - @memberjunction/ng-credentials@5.8.0
  - @memberjunction/ng-dashboard-viewer@5.8.0
  - @memberjunction/ng-entity-relationship-diagram@5.8.0
  - @memberjunction/ng-entity-viewer@5.8.0
  - @memberjunction/ng-filter-builder@5.8.0
  - @memberjunction/ng-list-management@5.8.0
  - @memberjunction/ng-query-viewer@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/interactive-component-types@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/skip-types@5.8.0
  - @memberjunction/templates-base-types@5.8.0
  - @memberjunction/testing-engine-base@5.8.0
  - @memberjunction/ng-export-service@5.8.0
  - @memberjunction/ng-markdown@5.8.0
  - @memberjunction/export-engine@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/ng-core-entity-forms@5.7.0
  - @memberjunction/ng-ai-test-harness@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-dashboard-viewer@5.7.0
  - @memberjunction/api-keys-base@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/ng-base-application@5.7.0
  - @memberjunction/ng-explorer-settings@5.7.0
  - @memberjunction/ng-shared@5.7.0
  - @memberjunction/ng-testing@5.7.0
  - @memberjunction/ng-action-gallery@5.7.0
  - @memberjunction/ng-actions@5.7.0
  - @memberjunction/ng-agents@5.7.0
  - @memberjunction/ng-code-editor@5.7.0
  - @memberjunction/ng-container-directives@5.7.0
  - @memberjunction/ng-credentials@5.7.0
  - @memberjunction/ng-entity-relationship-diagram@5.7.0
  - @memberjunction/ng-entity-viewer@5.7.0
  - @memberjunction/ng-filter-builder@5.7.0
  - @memberjunction/ng-list-management@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-query-viewer@5.7.0
  - @memberjunction/ng-react@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-versions@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0
  - @memberjunction/interactive-component-types@5.7.0
  - @memberjunction/skip-types@5.7.0
  - @memberjunction/templates-base-types@5.7.0
  - @memberjunction/testing-engine-base@5.7.0
  - @memberjunction/ng-export-service@5.7.0
  - @memberjunction/ng-markdown@5.7.0
  - @memberjunction/export-engine@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- d24a7ff: Implement Search and improve View Filter
- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/api-keys-base@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/ng-base-application@5.6.0
  - @memberjunction/ng-core-entity-forms@5.6.0
  - @memberjunction/ng-explorer-settings@5.6.0
  - @memberjunction/ng-shared@5.6.0
  - @memberjunction/ng-testing@5.6.0
  - @memberjunction/ng-action-gallery@5.6.0
  - @memberjunction/ng-actions@5.6.0
  - @memberjunction/ng-agents@5.6.0
  - @memberjunction/ng-ai-test-harness@5.6.0
  - @memberjunction/ng-code-editor@5.6.0
  - @memberjunction/ng-container-directives@5.6.0
  - @memberjunction/ng-credentials@5.6.0
  - @memberjunction/ng-dashboard-viewer@5.6.0
  - @memberjunction/ng-entity-relationship-diagram@5.6.0
  - @memberjunction/ng-entity-viewer@5.6.0
  - @memberjunction/ng-filter-builder@5.6.0
  - @memberjunction/ng-list-management@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-query-viewer@5.6.0
  - @memberjunction/ng-react@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-versions@5.6.0
  - @memberjunction/interactive-component-types@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/skip-types@5.6.0
  - @memberjunction/templates-base-types@5.6.0
  - @memberjunction/testing-engine-base@5.6.0
  - @memberjunction/ng-export-service@5.6.0
  - @memberjunction/ng-markdown@5.6.0
  - @memberjunction/export-engine@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [2973c64]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
- Updated dependencies [6421543]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/ng-react@5.5.0
  - @memberjunction/ng-core-entity-forms@5.5.0
  - @memberjunction/ng-entity-viewer@5.5.0
  - @memberjunction/ng-agents@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/api-keys-base@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/ng-base-application@5.5.0
  - @memberjunction/ng-explorer-settings@5.5.0
  - @memberjunction/ng-shared@5.5.0
  - @memberjunction/ng-testing@5.5.0
  - @memberjunction/ng-action-gallery@5.5.0
  - @memberjunction/ng-actions@5.5.0
  - @memberjunction/ng-ai-test-harness@5.5.0
  - @memberjunction/ng-code-editor@5.5.0
  - @memberjunction/ng-container-directives@5.5.0
  - @memberjunction/ng-credentials@5.5.0
  - @memberjunction/ng-dashboard-viewer@5.5.0
  - @memberjunction/ng-entity-relationship-diagram@5.5.0
  - @memberjunction/ng-export-service@5.5.0
  - @memberjunction/ng-filter-builder@5.5.0
  - @memberjunction/ng-list-management@5.5.0
  - @memberjunction/ng-markdown@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-query-viewer@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-versions@5.5.0
  - @memberjunction/interactive-component-types@5.5.0
  - @memberjunction/export-engine@5.5.0
  - @memberjunction/skip-types@5.5.0
  - @memberjunction/templates-base-types@5.5.0
  - @memberjunction/testing-engine-base@5.5.0

## 5.4.1

### Patch Changes

- Updated dependencies [8789e86]
  - @memberjunction/ng-shared@5.4.1
  - @memberjunction/ng-core-entity-forms@5.4.1
  - @memberjunction/ng-explorer-settings@5.4.1
  - @memberjunction/ng-testing@5.4.1
  - @memberjunction/ng-agents@5.4.1
  - @memberjunction/ng-ai-test-harness@5.4.1
  - @memberjunction/ng-list-management@5.4.1
  - @memberjunction/ng-action-gallery@5.4.1
  - @memberjunction/ai-engine-base@5.4.1
  - @memberjunction/ai-core-plus@5.4.1
  - @memberjunction/api-keys-base@5.4.1
  - @memberjunction/actions-base@5.4.1
  - @memberjunction/ng-base-application@5.4.1
  - @memberjunction/ng-actions@5.4.1
  - @memberjunction/ng-code-editor@5.4.1
  - @memberjunction/ng-container-directives@5.4.1
  - @memberjunction/ng-credentials@5.4.1
  - @memberjunction/ng-dashboard-viewer@5.4.1
  - @memberjunction/ng-entity-relationship-diagram@5.4.1
  - @memberjunction/ng-entity-viewer@5.4.1
  - @memberjunction/ng-export-service@5.4.1
  - @memberjunction/ng-filter-builder@5.4.1
  - @memberjunction/ng-markdown@5.4.1
  - @memberjunction/ng-notifications@5.4.1
  - @memberjunction/ng-query-viewer@5.4.1
  - @memberjunction/ng-react@5.4.1
  - @memberjunction/ng-shared-generic@5.4.1
  - @memberjunction/ng-versions@5.4.1
  - @memberjunction/graphql-dataprovider@5.4.1
  - @memberjunction/interactive-component-types@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1
  - @memberjunction/export-engine@5.4.1
  - @memberjunction/global@5.4.1
  - @memberjunction/skip-types@5.4.1
  - @memberjunction/templates-base-types@5.4.1
  - @memberjunction/testing-engine-base@5.4.1

## 5.4.0

### Patch Changes

- 439129c: no migration
- 6bcfa1c: unified design tokens
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
- Updated dependencies [081d657]
- Updated dependencies [6bcfa1c]
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/ng-core-entity-forms@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-explorer-settings@5.4.0
  - @memberjunction/ng-shared@5.4.0
  - @memberjunction/ng-entity-relationship-diagram@5.4.0
  - @memberjunction/ng-testing@5.4.0
  - @memberjunction/ng-actions@5.4.0
  - @memberjunction/ng-ai-test-harness@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ng-react@5.4.0
  - @memberjunction/ng-versions@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/api-keys-base@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/ng-base-application@5.4.0
  - @memberjunction/ng-action-gallery@5.4.0
  - @memberjunction/ng-agents@5.4.0
  - @memberjunction/ng-code-editor@5.4.0
  - @memberjunction/ng-credentials@5.4.0
  - @memberjunction/ng-dashboard-viewer@5.4.0
  - @memberjunction/ng-entity-viewer@5.4.0
  - @memberjunction/ng-list-management@5.4.0
  - @memberjunction/ng-query-viewer@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/templates-base-types@5.4.0
  - @memberjunction/testing-engine-base@5.4.0
  - @memberjunction/skip-types@5.4.0
  - @memberjunction/ng-container-directives@5.4.0
  - @memberjunction/ng-export-service@5.4.0
  - @memberjunction/ng-filter-builder@5.4.0
  - @memberjunction/ng-markdown@5.4.0
  - @memberjunction/interactive-component-types@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/export-engine@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/api-keys-base@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/ng-base-application@5.3.1
- @memberjunction/ng-core-entity-forms@5.3.1
- @memberjunction/ng-explorer-settings@5.3.1
- @memberjunction/ng-shared@5.3.1
- @memberjunction/ng-testing@5.3.1
- @memberjunction/ng-action-gallery@5.3.1
- @memberjunction/ng-actions@5.3.1
- @memberjunction/ng-agents@5.3.1
- @memberjunction/ng-ai-test-harness@5.3.1
- @memberjunction/ng-code-editor@5.3.1
- @memberjunction/ng-container-directives@5.3.1
- @memberjunction/ng-credentials@5.3.1
- @memberjunction/ng-dashboard-viewer@5.3.1
- @memberjunction/ng-entity-relationship-diagram@5.3.1
- @memberjunction/ng-entity-viewer@5.3.1
- @memberjunction/ng-export-service@5.3.1
- @memberjunction/ng-filter-builder@5.3.1
- @memberjunction/ng-list-management@5.3.1
- @memberjunction/ng-markdown@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-query-viewer@5.3.1
- @memberjunction/ng-react@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-versions@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/interactive-component-types@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/export-engine@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/skip-types@5.3.1
- @memberjunction/templates-base-types@5.3.1
- @memberjunction/testing-engine-base@5.3.1

## 5.3.0

### Patch Changes

- 1692c53: Viewing System fixes for sorting and filtering. Memory manager SQL fix.
- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/ng-entity-viewer@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-core-entity-forms@5.3.0
  - @memberjunction/ng-explorer-settings@5.3.0
  - @memberjunction/ng-shared@5.3.0
  - @memberjunction/ng-testing@5.3.0
  - @memberjunction/ng-actions@5.3.0
  - @memberjunction/ng-ai-test-harness@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ng-react@5.3.0
  - @memberjunction/ng-versions@5.3.0
  - @memberjunction/ng-dashboard-viewer@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/api-keys-base@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/ng-base-application@5.3.0
  - @memberjunction/ng-action-gallery@5.3.0
  - @memberjunction/ng-agents@5.3.0
  - @memberjunction/ng-code-editor@5.3.0
  - @memberjunction/ng-credentials@5.3.0
  - @memberjunction/ng-list-management@5.3.0
  - @memberjunction/ng-query-viewer@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/templates-base-types@5.3.0
  - @memberjunction/testing-engine-base@5.3.0
  - @memberjunction/skip-types@5.3.0
  - @memberjunction/ng-container-directives@5.3.0
  - @memberjunction/ng-entity-relationship-diagram@5.3.0
  - @memberjunction/ng-export-service@5.3.0
  - @memberjunction/ng-filter-builder@5.3.0
  - @memberjunction/ng-markdown@5.3.0
  - @memberjunction/interactive-component-types@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/export-engine@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/ng-core-entity-forms@5.2.0
  - @memberjunction/ng-explorer-settings@5.2.0
  - @memberjunction/ng-shared@5.2.0
  - @memberjunction/ng-agents@5.2.0
  - @memberjunction/ng-ai-test-harness@5.2.0
  - @memberjunction/ng-dashboard-viewer@5.2.0
  - @memberjunction/ng-entity-viewer@5.2.0
  - @memberjunction/templates-base-types@5.2.0
  - @memberjunction/ng-query-viewer@5.2.0
  - @memberjunction/ng-react@5.2.0
  - @memberjunction/ng-testing@5.2.0
  - @memberjunction/api-keys-base@5.2.0
  - @memberjunction/ng-base-application@5.2.0
  - @memberjunction/ng-action-gallery@5.2.0
  - @memberjunction/ng-actions@5.2.0
  - @memberjunction/ng-code-editor@5.2.0
  - @memberjunction/ng-credentials@5.2.0
  - @memberjunction/ng-list-management@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-versions@5.2.0
  - @memberjunction/testing-engine-base@5.2.0
  - @memberjunction/ng-container-directives@5.2.0
  - @memberjunction/ng-entity-relationship-diagram@5.2.0
  - @memberjunction/ng-filter-builder@5.2.0
  - @memberjunction/interactive-component-types@5.2.0
  - @memberjunction/skip-types@5.2.0
  - @memberjunction/ng-export-service@5.2.0
  - @memberjunction/ng-markdown@5.2.0
  - @memberjunction/export-engine@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/api-keys-base@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/ng-base-application@5.1.0
  - @memberjunction/ng-core-entity-forms@5.1.0
  - @memberjunction/ng-explorer-settings@5.1.0
  - @memberjunction/ng-shared@5.1.0
  - @memberjunction/ng-testing@5.1.0
  - @memberjunction/ng-actions@5.1.0
  - @memberjunction/ng-agents@5.1.0
  - @memberjunction/ng-ai-test-harness@5.1.0
  - @memberjunction/ng-code-editor@5.1.0
  - @memberjunction/ng-container-directives@5.1.0
  - @memberjunction/ng-credentials@5.1.0
  - @memberjunction/ng-dashboard-viewer@5.1.0
  - @memberjunction/ng-entity-viewer@5.1.0
  - @memberjunction/ng-list-management@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/ng-query-viewer@5.1.0
  - @memberjunction/ng-react@5.1.0
  - @memberjunction/ng-versions@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/templates-base-types@5.1.0
  - @memberjunction/testing-engine-base@5.1.0
  - @memberjunction/skip-types@5.1.0
  - @memberjunction/interactive-component-types@5.1.0
  - @memberjunction/ng-action-gallery@5.1.0
  - @memberjunction/ng-entity-relationship-diagram@5.1.0
  - @memberjunction/ng-filter-builder@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-export-service@5.1.0
  - @memberjunction/ng-markdown@5.1.0
  - @memberjunction/export-engine@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 3cca644: no migration
- Updated dependencies [3cca644]
- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
- Updated dependencies [90bfa37]
  - @memberjunction/ng-entity-viewer@5.0.0
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/interactive-component-types@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/api-keys-base@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/ng-base-application@5.0.0
  - @memberjunction/ng-core-entity-forms@5.0.0
  - @memberjunction/ng-explorer-settings@5.0.0
  - @memberjunction/ng-shared@5.0.0
  - @memberjunction/ng-testing@5.0.0
  - @memberjunction/ng-action-gallery@5.0.0
  - @memberjunction/ng-actions@5.0.0
  - @memberjunction/ng-agents@5.0.0
  - @memberjunction/ng-ai-test-harness@5.0.0
  - @memberjunction/ng-code-editor@5.0.0
  - @memberjunction/ng-container-directives@5.0.0
  - @memberjunction/ng-credentials@5.0.0
  - @memberjunction/ng-dashboard-viewer@5.0.0
  - @memberjunction/ng-entity-relationship-diagram@5.0.0
  - @memberjunction/ng-export-service@5.0.0
  - @memberjunction/ng-filter-builder@5.0.0
  - @memberjunction/ng-list-management@5.0.0
  - @memberjunction/ng-markdown@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-query-viewer@5.0.0
  - @memberjunction/ng-react@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/ng-versions@5.0.0
  - @memberjunction/export-engine@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/skip-types@5.0.0
  - @memberjunction/templates-base-types@5.0.0
  - @memberjunction/testing-engine-base@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/api-keys-base@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/ng-base-application@4.4.0
  - @memberjunction/ng-core-entity-forms@4.4.0
  - @memberjunction/ng-explorer-settings@4.4.0
  - @memberjunction/ng-shared@4.4.0
  - @memberjunction/ng-testing@4.4.0
  - @memberjunction/ng-action-gallery@4.4.0
  - @memberjunction/ng-actions@4.4.0
  - @memberjunction/ng-agents@4.4.0
  - @memberjunction/ng-ai-test-harness@4.4.0
  - @memberjunction/ng-code-editor@4.4.0
  - @memberjunction/ng-container-directives@4.4.0
  - @memberjunction/ng-credentials@4.4.0
  - @memberjunction/ng-dashboard-viewer@4.4.0
  - @memberjunction/ng-entity-relationship-diagram@4.4.0
  - @memberjunction/ng-entity-viewer@4.4.0
  - @memberjunction/ng-filter-builder@4.4.0
  - @memberjunction/ng-list-management@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-query-viewer@4.4.0
  - @memberjunction/ng-react@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/ng-versions@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/interactive-component-types@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/skip-types@4.4.0
  - @memberjunction/templates-base-types@4.4.0
  - @memberjunction/testing-engine-base@4.4.0
  - @memberjunction/ng-export-service@4.4.0
  - @memberjunction/ng-markdown@4.4.0
  - @memberjunction/export-engine@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-core-entity-forms@4.3.1
- @memberjunction/ng-explorer-settings@4.3.1
- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/api-keys-base@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/ng-base-application@4.3.1
- @memberjunction/ng-shared@4.3.1
- @memberjunction/ng-testing@4.3.1
- @memberjunction/ng-action-gallery@4.3.1
- @memberjunction/ng-actions@4.3.1
- @memberjunction/ng-agents@4.3.1
- @memberjunction/ng-ai-test-harness@4.3.1
- @memberjunction/ng-code-editor@4.3.1
- @memberjunction/ng-container-directives@4.3.1
- @memberjunction/ng-credentials@4.3.1
- @memberjunction/ng-dashboard-viewer@4.3.1
- @memberjunction/ng-entity-relationship-diagram@4.3.1
- @memberjunction/ng-entity-viewer@4.3.1
- @memberjunction/ng-export-service@4.3.1
- @memberjunction/ng-filter-builder@4.3.1
- @memberjunction/ng-list-management@4.3.1
- @memberjunction/ng-markdown@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-query-viewer@4.3.1
- @memberjunction/ng-react@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/ng-versions@4.3.1
- @memberjunction/graphql-dataprovider@4.3.1
- @memberjunction/interactive-component-types@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/export-engine@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/skip-types@4.3.1
- @memberjunction/templates-base-types@4.3.1
- @memberjunction/testing-engine-base@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-core-entity-forms@4.3.0
  - @memberjunction/ng-explorer-settings@4.3.0
  - @memberjunction/ng-shared@4.3.0
  - @memberjunction/ng-testing@4.3.0
  - @memberjunction/ng-actions@4.3.0
  - @memberjunction/ng-ai-test-harness@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ng-react@4.3.0
  - @memberjunction/ng-versions@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/api-keys-base@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/ng-base-application@4.3.0
  - @memberjunction/ng-action-gallery@4.3.0
  - @memberjunction/ng-agents@4.3.0
  - @memberjunction/ng-code-editor@4.3.0
  - @memberjunction/ng-container-directives@4.3.0
  - @memberjunction/ng-credentials@4.3.0
  - @memberjunction/ng-dashboard-viewer@4.3.0
  - @memberjunction/ng-entity-relationship-diagram@4.3.0
  - @memberjunction/ng-entity-viewer@4.3.0
  - @memberjunction/ng-filter-builder@4.3.0
  - @memberjunction/ng-list-management@4.3.0
  - @memberjunction/ng-query-viewer@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/interactive-component-types@4.3.0
  - @memberjunction/skip-types@4.3.0
  - @memberjunction/templates-base-types@4.3.0
  - @memberjunction/testing-engine-base@4.3.0
  - @memberjunction/ng-export-service@4.3.0
  - @memberjunction/ng-markdown@4.3.0
  - @memberjunction/export-engine@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/api-keys-base@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/ng-base-application@4.2.0
- @memberjunction/ng-core-entity-forms@4.2.0
- @memberjunction/ng-explorer-settings@4.2.0
- @memberjunction/ng-shared@4.2.0
- @memberjunction/ng-testing@4.2.0
- @memberjunction/ng-action-gallery@4.2.0
- @memberjunction/ng-actions@4.2.0
- @memberjunction/ng-agents@4.2.0
- @memberjunction/ng-ai-test-harness@4.2.0
- @memberjunction/ng-code-editor@4.2.0
- @memberjunction/ng-container-directives@4.2.0
- @memberjunction/ng-credentials@4.2.0
- @memberjunction/ng-dashboard-viewer@4.2.0
- @memberjunction/ng-entity-relationship-diagram@4.2.0
- @memberjunction/ng-entity-viewer@4.2.0
- @memberjunction/ng-export-service@4.2.0
- @memberjunction/ng-filter-builder@4.2.0
- @memberjunction/ng-list-management@4.2.0
- @memberjunction/ng-markdown@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-query-viewer@4.2.0
- @memberjunction/ng-react@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/ng-versions@4.2.0
- @memberjunction/graphql-dataprovider@4.2.0
- @memberjunction/interactive-component-types@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/export-engine@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/skip-types@4.2.0
- @memberjunction/templates-base-types@4.2.0
- @memberjunction/testing-engine-base@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/export-engine@4.1.0
  - @memberjunction/ng-base-application@4.1.0
  - @memberjunction/ng-core-entity-forms@4.1.0
  - @memberjunction/ng-explorer-settings@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/api-keys-base@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/ng-shared@4.1.0
  - @memberjunction/ng-testing@4.1.0
  - @memberjunction/ng-action-gallery@4.1.0
  - @memberjunction/ng-actions@4.1.0
  - @memberjunction/ng-agents@4.1.0
  - @memberjunction/ng-ai-test-harness@4.1.0
  - @memberjunction/ng-code-editor@4.1.0
  - @memberjunction/ng-container-directives@4.1.0
  - @memberjunction/ng-credentials@4.1.0
  - @memberjunction/ng-dashboard-viewer@4.1.0
  - @memberjunction/ng-entity-relationship-diagram@4.1.0
  - @memberjunction/ng-entity-viewer@4.1.0
  - @memberjunction/ng-filter-builder@4.1.0
  - @memberjunction/ng-list-management@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-query-viewer@4.1.0
  - @memberjunction/ng-react@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-versions@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0
  - @memberjunction/interactive-component-types@4.1.0
  - @memberjunction/skip-types@4.1.0
  - @memberjunction/templates-base-types@4.1.0
  - @memberjunction/testing-engine-base@4.1.0
  - @memberjunction/ng-export-service@4.1.0
  - @memberjunction/ng-markdown@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- 65b4274: migration
- e06f81c: changed SO much!

### Patch Changes

- 2f86270: no migration
- 4723079: no migration
- 0a0cda1: no migration
- Updated dependencies [4723079]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [b503400]
- Updated dependencies [fe73344]
- Updated dependencies [0a0cda1]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-core-entity-forms@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/api-keys-base@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/ng-base-application@4.0.0
  - @memberjunction/ng-explorer-settings@4.0.0
  - @memberjunction/ng-shared@4.0.0
  - @memberjunction/ng-testing@4.0.0
  - @memberjunction/ng-action-gallery@4.0.0
  - @memberjunction/ng-actions@4.0.0
  - @memberjunction/ng-agents@4.0.0
  - @memberjunction/ng-ai-test-harness@4.0.0
  - @memberjunction/ng-code-editor@4.0.0
  - @memberjunction/ng-container-directives@4.0.0
  - @memberjunction/ng-credentials@4.0.0
  - @memberjunction/ng-dashboard-viewer@4.0.0
  - @memberjunction/ng-entity-relationship-diagram@4.0.0
  - @memberjunction/ng-entity-viewer@4.0.0
  - @memberjunction/ng-export-service@4.0.0
  - @memberjunction/ng-filter-builder@4.0.0
  - @memberjunction/ng-list-management@4.0.0
  - @memberjunction/ng-markdown@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-query-viewer@4.0.0
  - @memberjunction/ng-react@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/ng-versions@4.0.0
  - @memberjunction/interactive-component-types@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/export-engine@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/skip-types@4.0.0
  - @memberjunction/templates-base-types@4.0.0
  - @memberjunction/testing-engine-base@4.0.0

## 3.4.0

### Minor Changes

- ef7acd8: migration
- 079dd6f: metadata change -> migration file

### Patch Changes

- a7db1cc: no migration
- 18b4e65: Add field-level encryption for credential values with automatic decryption, Box.com OAuth credential type, comprehensive JSON Schema validation, and fix credential editor to prevent "undefined" text in fields
- Updated dependencies [252794e]
- Updated dependencies [18b4e65]
- Updated dependencies [079dd6f]
- Updated dependencies [a3961d5]
  - @memberjunction/ng-explorer-settings@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/ng-actions@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/api-keys-base@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/ng-base-application@3.4.0
  - @memberjunction/ng-core-entity-forms@3.4.0
  - @memberjunction/ng-shared@3.4.0
  - @memberjunction/ng-testing@3.4.0
  - @memberjunction/ng-action-gallery@3.4.0
  - @memberjunction/ng-ai-test-harness@3.4.0
  - @memberjunction/ng-code-editor@3.4.0
  - @memberjunction/ng-credentials@3.4.0
  - @memberjunction/ng-dashboard-viewer@3.4.0
  - @memberjunction/ng-entity-viewer@3.4.0
  - @memberjunction/ng-list-management@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-query-viewer@3.4.0
  - @memberjunction/ng-react@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/templates-base-types@3.4.0
  - @memberjunction/testing-engine-base@3.4.0
  - @memberjunction/ng-container-directives@3.4.0
  - @memberjunction/ng-entity-relationship-diagram@3.4.0
  - @memberjunction/ng-filter-builder@3.4.0
  - @memberjunction/interactive-component-types@3.4.0
  - @memberjunction/skip-types@3.4.0
  - @memberjunction/ng-export-service@3.4.0
  - @memberjunction/ng-markdown@3.4.0
  - @memberjunction/export-engine@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Minor Changes

- 3f17579: migration

### Patch Changes

- ca551dd: no migration
- 2183cbb: No migration
- 823192a: no migration
- Updated dependencies [27a65b9]
- Updated dependencies [ca551dd]
- Updated dependencies [36714eb]
- Updated dependencies [2183cbb]
- Updated dependencies [83d75a1]
  - @memberjunction/ng-entity-viewer@3.3.0
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-explorer-settings@3.3.0
  - @memberjunction/ng-entity-relationship-diagram@3.3.0
  - @memberjunction/ng-core-entity-forms@3.3.0
  - @memberjunction/ng-dashboard-viewer@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/ng-base-application@3.3.0
  - @memberjunction/ng-shared@3.3.0
  - @memberjunction/ng-user-view-grid@3.3.0
  - @memberjunction/ng-testing@3.3.0
  - @memberjunction/ng-action-gallery@3.3.0
  - @memberjunction/ng-ai-test-harness@3.3.0
  - @memberjunction/ng-code-editor@3.3.0
  - @memberjunction/ng-list-management@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-query-viewer@3.3.0
  - @memberjunction/ng-react@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/graphql-dataprovider@3.3.0
  - @memberjunction/templates-base-types@3.3.0
  - @memberjunction/testing-engine-base@3.3.0
  - @memberjunction/skip-types@3.3.0
  - @memberjunction/ng-container-directives@3.3.0
  - @memberjunction/ng-export-service@3.3.0
  - @memberjunction/ng-filter-builder@3.3.0
  - @memberjunction/interactive-component-types@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/export-engine@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Minor Changes

- 582ca0c: Added unified notification system with email/SMS delivery, user notification preferences, and agent completion notifications

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/ng-core-entity-forms@3.2.0
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/interactive-component-types@3.2.0
  - @memberjunction/skip-types@3.2.0
  - @memberjunction/ng-explorer-settings@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/ng-base-application@3.2.0
  - @memberjunction/ng-shared@3.2.0
  - @memberjunction/ng-user-view-grid@3.2.0
  - @memberjunction/ng-testing@3.2.0
  - @memberjunction/ng-action-gallery@3.2.0
  - @memberjunction/ng-ai-test-harness@3.2.0
  - @memberjunction/ng-code-editor@3.2.0
  - @memberjunction/ng-dashboard-viewer@3.2.0
  - @memberjunction/ng-entity-viewer@3.2.0
  - @memberjunction/ng-list-management@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-query-viewer@3.2.0
  - @memberjunction/ng-react@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/templates-base-types@3.2.0
  - @memberjunction/testing-engine-base@3.2.0
  - @memberjunction/ng-container-directives@3.2.0
  - @memberjunction/ng-entity-relationship-diagram@3.2.0
  - @memberjunction/ng-export-service@3.2.0
  - @memberjunction/ng-filter-builder@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/export-engine@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-core-entity-forms@3.1.1
  - @memberjunction/ng-explorer-settings@3.1.1
  - @memberjunction/ng-shared@3.1.1
  - @memberjunction/ng-user-view-grid@3.1.1
  - @memberjunction/ng-testing@3.1.1
  - @memberjunction/ng-ai-test-harness@3.1.1
  - @memberjunction/ng-notifications@3.1.1
  - @memberjunction/ng-react@3.1.1
  - @memberjunction/ng-list-management@3.1.1
  - @memberjunction/ng-action-gallery@3.1.1
  - @memberjunction/ng-query-viewer@3.1.1
  - @memberjunction/ng-dashboard-viewer@3.1.1
  - @memberjunction/ai-engine-base@3.1.1
  - @memberjunction/ai-core-plus@3.1.1
  - @memberjunction/ng-base-application@3.1.1
  - @memberjunction/ng-code-editor@3.1.1
  - @memberjunction/ng-container-directives@3.1.1
  - @memberjunction/ng-entity-relationship-diagram@3.1.1
  - @memberjunction/ng-entity-viewer@3.1.1
  - @memberjunction/ng-export-service@3.1.1
  - @memberjunction/ng-filter-builder@3.1.1
  - @memberjunction/ng-shared-generic@3.1.1
  - @memberjunction/interactive-component-types@3.1.1
  - @memberjunction/core@3.1.1
  - @memberjunction/core-entities@3.1.1
  - @memberjunction/export-engine@3.1.1
  - @memberjunction/global@3.1.1
  - @memberjunction/skip-types@3.1.1
  - @memberjunction/templates-base-types@3.1.1
  - @memberjunction/testing-engine-base@3.1.1

## 3.0.0

### Patch Changes

- 906a21b: no migration
- 528041e: no migration
- Updated dependencies [528041e]
  - @memberjunction/ng-list-management@3.0.0
  - @memberjunction/ng-core-entity-forms@3.0.0
  - @memberjunction/ng-user-view-grid@3.0.0
  - @memberjunction/ng-explorer-settings@3.0.0
  - @memberjunction/ai-engine-base@3.0.0
  - @memberjunction/ai-core-plus@3.0.0
  - @memberjunction/ng-base-application@3.0.0
  - @memberjunction/ng-shared@3.0.0
  - @memberjunction/ng-testing@3.0.0
  - @memberjunction/ng-action-gallery@3.0.0
  - @memberjunction/ng-ai-test-harness@3.0.0
  - @memberjunction/ng-code-editor@3.0.0
  - @memberjunction/ng-container-directives@3.0.0
  - @memberjunction/ng-entity-relationship-diagram@3.0.0
  - @memberjunction/ng-entity-viewer@3.0.0
  - @memberjunction/ng-export-service@3.0.0
  - @memberjunction/ng-filter-builder@3.0.0
  - @memberjunction/ng-notifications@3.0.0
  - @memberjunction/ng-react@3.0.0
  - @memberjunction/ng-shared-generic@3.0.0
  - @memberjunction/graphql-dataprovider@3.0.0
  - @memberjunction/interactive-component-types@3.0.0
  - @memberjunction/core@3.0.0
  - @memberjunction/core-entities@3.0.0
  - @memberjunction/export-engine@3.0.0
  - @memberjunction/global@3.0.0
  - @memberjunction/skip-types@3.0.0
  - @memberjunction/templates-base-types@3.0.0
  - @memberjunction/testing-engine-base@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [43df8f4]
- Updated dependencies [c00bd13]
  - @memberjunction/ng-entity-viewer@2.133.0
  - @memberjunction/ng-list-management@2.133.0
  - @memberjunction/core@2.133.0
  - @memberjunction/ng-core-entity-forms@2.133.0
  - @memberjunction/ng-user-view-grid@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/ng-base-application@2.133.0
  - @memberjunction/ng-explorer-settings@2.133.0
  - @memberjunction/ng-shared@2.133.0
  - @memberjunction/ng-testing@2.133.0
  - @memberjunction/ng-action-gallery@2.133.0
  - @memberjunction/ng-ai-test-harness@2.133.0
  - @memberjunction/ng-code-editor@2.133.0
  - @memberjunction/ng-container-directives@2.133.0
  - @memberjunction/ng-entity-relationship-diagram@2.133.0
  - @memberjunction/ng-filter-builder@2.133.0
  - @memberjunction/ng-notifications@2.133.0
  - @memberjunction/ng-react@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/graphql-dataprovider@2.133.0
  - @memberjunction/interactive-component-types@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/skip-types@2.133.0
  - @memberjunction/templates-base-types@2.133.0
  - @memberjunction/testing-engine-base@2.133.0
  - @memberjunction/ng-export-service@2.133.0
  - @memberjunction/export-engine@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/ng-base-application@2.132.0
  - @memberjunction/ng-core-entity-forms@2.132.0
  - @memberjunction/ng-explorer-settings@2.132.0
  - @memberjunction/ng-shared@2.132.0
  - @memberjunction/ng-user-view-grid@2.132.0
  - @memberjunction/ng-testing@2.132.0
  - @memberjunction/ng-action-gallery@2.132.0
  - @memberjunction/ng-ai-test-harness@2.132.0
  - @memberjunction/ng-code-editor@2.132.0
  - @memberjunction/ng-container-directives@2.132.0
  - @memberjunction/ng-entity-relationship-diagram@2.132.0
  - @memberjunction/ng-entity-viewer@2.132.0
  - @memberjunction/ng-filter-builder@2.132.0
  - @memberjunction/ng-notifications@2.132.0
  - @memberjunction/ng-react@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/graphql-dataprovider@2.132.0
  - @memberjunction/interactive-component-types@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/skip-types@2.132.0
  - @memberjunction/templates-base-types@2.132.0
  - @memberjunction/testing-engine-base@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/ng-base-application@2.131.0
  - @memberjunction/ng-core-entity-forms@2.131.0
  - @memberjunction/ng-explorer-settings@2.131.0
  - @memberjunction/ng-shared@2.131.0
  - @memberjunction/ng-user-view-grid@2.131.0
  - @memberjunction/ng-testing@2.131.0
  - @memberjunction/ng-action-gallery@2.131.0
  - @memberjunction/ng-ai-test-harness@2.131.0
  - @memberjunction/ng-code-editor@2.131.0
  - @memberjunction/ng-container-directives@2.131.0
  - @memberjunction/ng-entity-relationship-diagram@2.131.0
  - @memberjunction/ng-entity-viewer@2.131.0
  - @memberjunction/ng-filter-builder@2.131.0
  - @memberjunction/ng-notifications@2.131.0
  - @memberjunction/ng-react@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/graphql-dataprovider@2.131.0
  - @memberjunction/interactive-component-types@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/skip-types@2.131.0
  - @memberjunction/templates-base-types@2.131.0
  - @memberjunction/testing-engine-base@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- Updated dependencies [8884553]
  - @memberjunction/ng-core-entity-forms@2.130.1
  - @memberjunction/ng-testing@2.130.1
  - @memberjunction/ng-explorer-settings@2.130.1
  - @memberjunction/ng-user-view-grid@2.130.1
  - @memberjunction/ai-engine-base@2.130.1
  - @memberjunction/ai-core-plus@2.130.1
  - @memberjunction/ng-base-application@2.130.1
  - @memberjunction/ng-shared@2.130.1
  - @memberjunction/ng-action-gallery@2.130.1
  - @memberjunction/ng-ai-test-harness@2.130.1
  - @memberjunction/ng-code-editor@2.130.1
  - @memberjunction/ng-container-directives@2.130.1
  - @memberjunction/ng-entity-relationship-diagram@2.130.1
  - @memberjunction/ng-entity-viewer@2.130.1
  - @memberjunction/ng-filter-builder@2.130.1
  - @memberjunction/ng-notifications@2.130.1
  - @memberjunction/ng-react@2.130.1
  - @memberjunction/ng-shared-generic@2.130.1
  - @memberjunction/graphql-dataprovider@2.130.1
  - @memberjunction/interactive-component-types@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/global@2.130.1
  - @memberjunction/skip-types@2.130.1
  - @memberjunction/templates-base-types@2.130.1
  - @memberjunction/testing-engine-base@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
- Updated dependencies [c23d2b7]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/graphql-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ng-base-application@2.130.0
  - @memberjunction/ng-core-entity-forms@2.130.0
  - @memberjunction/ng-shared@2.130.0
  - @memberjunction/ng-ai-test-harness@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/skip-types@2.130.0
  - @memberjunction/ng-explorer-settings@2.130.0
  - @memberjunction/ng-user-view-grid@2.130.0
  - @memberjunction/ng-testing@2.130.0
  - @memberjunction/ng-notifications@2.130.0
  - @memberjunction/ng-react@2.130.0
  - @memberjunction/ng-action-gallery@2.130.0
  - @memberjunction/ng-code-editor@2.130.0
  - @memberjunction/ng-container-directives@2.130.0
  - @memberjunction/ng-entity-relationship-diagram@2.130.0
  - @memberjunction/ng-entity-viewer@2.130.0
  - @memberjunction/ng-filter-builder@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/interactive-component-types@2.130.0
  - @memberjunction/templates-base-types@2.130.0
  - @memberjunction/testing-engine-base@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [f7267c3]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/ng-react@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ng-entity-relationship-diagram@2.129.0
  - @memberjunction/graphql-dataprovider@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/ng-core-entity-forms@2.129.0
  - @memberjunction/ng-entity-viewer@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ng-base-application@2.129.0
  - @memberjunction/ng-explorer-settings@2.129.0
  - @memberjunction/ng-shared@2.129.0
  - @memberjunction/ng-user-view-grid@2.129.0
  - @memberjunction/ng-testing@2.129.0
  - @memberjunction/ng-action-gallery@2.129.0
  - @memberjunction/ng-ai-test-harness@2.129.0
  - @memberjunction/ng-code-editor@2.129.0
  - @memberjunction/ng-container-directives@2.129.0
  - @memberjunction/ng-filter-builder@2.129.0
  - @memberjunction/ng-notifications@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/interactive-component-types@2.129.0
  - @memberjunction/skip-types@2.129.0
  - @memberjunction/templates-base-types@2.129.0
  - @memberjunction/testing-engine-base@2.129.0

## 2.128.0

### Patch Changes

- 3dde14d: Shell, Viewing System and Dashboard fixes and improvements
- Updated dependencies [f407abe]
- Updated dependencies [3dde14d]
  - @memberjunction/core@2.128.0
  - @memberjunction/ng-core-entity-forms@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-notifications@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ng-base-application@2.128.0
  - @memberjunction/ng-explorer-settings@2.128.0
  - @memberjunction/ng-shared@2.128.0
  - @memberjunction/ng-user-view-grid@2.128.0
  - @memberjunction/ng-testing@2.128.0
  - @memberjunction/ng-action-gallery@2.128.0
  - @memberjunction/ng-ai-test-harness@2.128.0
  - @memberjunction/ng-code-editor@2.128.0
  - @memberjunction/ng-container-directives@2.128.0
  - @memberjunction/ng-entity-viewer@2.128.0
  - @memberjunction/ng-filter-builder@2.128.0
  - @memberjunction/ng-react@2.128.0
  - @memberjunction/ng-shared-generic@2.128.0
  - @memberjunction/graphql-dataprovider@2.128.0
  - @memberjunction/interactive-component-types@2.128.0
  - @memberjunction/skip-types@2.128.0
  - @memberjunction/templates-base-types@2.128.0
  - @memberjunction/testing-engine-base@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/interactive-component-types@2.127.0
  - @memberjunction/skip-types@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/ng-react@2.127.0
  - @memberjunction/graphql-dataprovider@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ng-core-entity-forms@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/ng-base-application@2.127.0
  - @memberjunction/ng-explorer-settings@2.127.0
  - @memberjunction/ng-shared@2.127.0
  - @memberjunction/ng-user-view-grid@2.127.0
  - @memberjunction/ng-testing@2.127.0
  - @memberjunction/ng-action-gallery@2.127.0
  - @memberjunction/ng-ai-test-harness@2.127.0
  - @memberjunction/ng-code-editor@2.127.0
  - @memberjunction/ng-container-directives@2.127.0
  - @memberjunction/ng-entity-viewer@2.127.0
  - @memberjunction/ng-filter-builder@2.127.0
  - @memberjunction/ng-notifications@2.127.0
  - @memberjunction/ng-shared-generic@2.127.0
  - @memberjunction/templates-base-types@2.127.0
  - @memberjunction/testing-engine-base@2.127.0

## 2.126.1

### Patch Changes

- Updated dependencies [d6ae2a0]
  - @memberjunction/graphql-dataprovider@2.126.1
  - @memberjunction/ng-core-entity-forms@2.126.1
  - @memberjunction/ng-explorer-settings@2.126.1
  - @memberjunction/ng-shared@2.126.1
  - @memberjunction/ng-user-view-grid@2.126.1
  - @memberjunction/ng-testing@2.126.1
  - @memberjunction/ng-ai-test-harness@2.126.1
  - @memberjunction/ng-notifications@2.126.1
  - @memberjunction/ng-react@2.126.1
  - @memberjunction/ng-action-gallery@2.126.1
  - @memberjunction/ai-engine-base@2.126.1
  - @memberjunction/ng-base-application@2.126.1
  - @memberjunction/ng-code-editor@2.126.1
  - @memberjunction/ng-container-directives@2.126.1
  - @memberjunction/ng-entity-viewer@2.126.1
  - @memberjunction/ng-filter-builder@2.126.1
  - @memberjunction/ng-shared-generic@2.126.1
  - @memberjunction/interactive-component-types@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/global@2.126.1
  - @memberjunction/skip-types@2.126.1
  - @memberjunction/templates-base-types@2.126.1
  - @memberjunction/testing-engine-base@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [d424fce]
- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/skip-types@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ng-core-entity-forms@2.126.0
  - @memberjunction/ng-explorer-settings@2.126.0
  - @memberjunction/ng-user-view-grid@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ng-base-application@2.126.0
  - @memberjunction/ng-shared@2.126.0
  - @memberjunction/ng-testing@2.126.0
  - @memberjunction/ng-action-gallery@2.126.0
  - @memberjunction/ng-ai-test-harness@2.126.0
  - @memberjunction/ng-code-editor@2.126.0
  - @memberjunction/ng-container-directives@2.126.0
  - @memberjunction/ng-entity-viewer@2.126.0
  - @memberjunction/ng-filter-builder@2.126.0
  - @memberjunction/ng-notifications@2.126.0
  - @memberjunction/ng-react@2.126.0
  - @memberjunction/ng-shared-generic@2.126.0
  - @memberjunction/graphql-dataprovider@2.126.0
  - @memberjunction/interactive-component-types@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/templates-base-types@2.126.0
  - @memberjunction/testing-engine-base@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [1115143]
- Updated dependencies [bd4aa3d]
  - @memberjunction/interactive-component-types@2.125.0
  - @memberjunction/core@2.125.0
  - @memberjunction/ng-react@2.125.0
  - @memberjunction/graphql-dataprovider@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/skip-types@2.125.0
  - @memberjunction/ng-user-view-grid@2.125.0
  - @memberjunction/ai-engine-base@2.125.0
  - @memberjunction/ng-base-application@2.125.0
  - @memberjunction/ng-core-entity-forms@2.125.0
  - @memberjunction/ng-explorer-settings@2.125.0
  - @memberjunction/ng-shared@2.125.0
  - @memberjunction/ng-testing@2.125.0
  - @memberjunction/ng-action-gallery@2.125.0
  - @memberjunction/ng-ai-test-harness@2.125.0
  - @memberjunction/ng-code-editor@2.125.0
  - @memberjunction/ng-container-directives@2.125.0
  - @memberjunction/ng-entity-viewer@2.125.0
  - @memberjunction/ng-filter-builder@2.125.0
  - @memberjunction/ng-notifications@2.125.0
  - @memberjunction/ng-shared-generic@2.125.0
  - @memberjunction/templates-base-types@2.125.0
  - @memberjunction/testing-engine-base@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- 5033612: Restore Import and improve performance
- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/ng-base-application@2.124.0
  - @memberjunction/ng-core-entity-forms@2.124.0
  - @memberjunction/ng-explorer-settings@2.124.0
  - @memberjunction/ng-shared@2.124.0
  - @memberjunction/ng-user-view-grid@2.124.0
  - @memberjunction/ng-testing@2.124.0
  - @memberjunction/ng-action-gallery@2.124.0
  - @memberjunction/ng-ai-test-harness@2.124.0
  - @memberjunction/ng-code-editor@2.124.0
  - @memberjunction/ng-container-directives@2.124.0
  - @memberjunction/ng-entity-viewer@2.124.0
  - @memberjunction/ng-filter-builder@2.124.0
  - @memberjunction/ng-notifications@2.124.0
  - @memberjunction/ng-react@2.124.0
  - @memberjunction/ng-shared-generic@2.124.0
  - @memberjunction/graphql-dataprovider@2.124.0
  - @memberjunction/interactive-component-types@2.124.0
  - @memberjunction/skip-types@2.124.0
  - @memberjunction/templates-base-types@2.124.0
  - @memberjunction/testing-engine-base@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- Updated dependencies [26c3e8a]
  - @memberjunction/ng-filter-builder@2.123.1
  - @memberjunction/ai-engine-base@2.123.1
  - @memberjunction/ng-base-application@2.123.1
  - @memberjunction/ng-core-entity-forms@2.123.1
  - @memberjunction/ng-explorer-settings@2.123.1
  - @memberjunction/ng-shared@2.123.1
  - @memberjunction/ng-user-view-grid@2.123.1
  - @memberjunction/ng-testing@2.123.1
  - @memberjunction/ng-action-gallery@2.123.1
  - @memberjunction/ng-ai-test-harness@2.123.1
  - @memberjunction/ng-code-editor@2.123.1
  - @memberjunction/ng-container-directives@2.123.1
  - @memberjunction/ng-entity-viewer@2.123.1
  - @memberjunction/ng-notifications@2.123.1
  - @memberjunction/ng-react@2.123.1
  - @memberjunction/ng-shared-generic@2.123.1
  - @memberjunction/graphql-dataprovider@2.123.1
  - @memberjunction/interactive-component-types@2.123.1
  - @memberjunction/core@2.123.1
  - @memberjunction/core-entities@2.123.1
  - @memberjunction/global@2.123.1
  - @memberjunction/skip-types@2.123.1
  - @memberjunction/templates-base-types@2.123.1
  - @memberjunction/testing-engine-base@2.123.1

## 2.123.0

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ng-core-entity-forms@2.123.0
  - @memberjunction/ng-entity-viewer@2.123.0
  - @memberjunction/ng-filter-builder@2.123.0
  - @memberjunction/graphql-dataprovider@2.123.0
  - @memberjunction/ng-explorer-settings@2.123.0
  - @memberjunction/ng-shared@2.123.0
  - @memberjunction/ng-user-view-grid@2.123.0
  - @memberjunction/ng-testing@2.123.0
  - @memberjunction/ng-ai-test-harness@2.123.0
  - @memberjunction/ng-notifications@2.123.0
  - @memberjunction/ng-react@2.123.0
  - @memberjunction/ng-action-gallery@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ng-base-application@2.123.0
  - @memberjunction/ng-shared-generic@2.123.0
  - @memberjunction/ng-code-editor@2.123.0
  - @memberjunction/ng-container-directives@2.123.0
  - @memberjunction/interactive-component-types@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/skip-types@2.123.0
  - @memberjunction/templates-base-types@2.123.0
  - @memberjunction/testing-engine-base@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [3d763e9]
- Updated dependencies [81f0c44]
  - @memberjunction/graphql-dataprovider@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-ai-test-harness@2.122.2
  - @memberjunction/ng-code-editor@2.122.2
  - @memberjunction/ng-container-directives@2.122.2
  - @memberjunction/ng-core-entity-forms@2.122.2
  - @memberjunction/ng-explorer-settings@2.122.2
  - @memberjunction/ng-shared@2.122.2
  - @memberjunction/ng-user-view-grid@2.122.2
  - @memberjunction/ng-testing@2.122.2
  - @memberjunction/ng-notifications@2.122.2
  - @memberjunction/ng-react@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ng-base-application@2.122.2
  - @memberjunction/ng-action-gallery@2.122.2
  - @memberjunction/ng-entity-viewer@2.122.2
  - @memberjunction/ng-shared-generic@2.122.2
  - @memberjunction/templates-base-types@2.122.2
  - @memberjunction/testing-engine-base@2.122.2
  - @memberjunction/skip-types@2.122.2
  - @memberjunction/interactive-component-types@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- 699a480: Fix missing @memberjunction dependencies in 24 Angular packages
- Updated dependencies [699a480]
  - @memberjunction/ng-action-gallery@2.122.1
  - @memberjunction/ng-ai-test-harness@2.122.1
  - @memberjunction/ng-core-entity-forms@2.122.1
  - @memberjunction/ng-explorer-settings@2.122.1
  - @memberjunction/ng-react@2.122.1
  - @memberjunction/ng-shared@2.122.1
  - @memberjunction/ng-testing@2.122.1
  - @memberjunction/ng-user-view-grid@2.122.1
  - @memberjunction/ai-engine-base@2.122.1
  - @memberjunction/ng-base-application@2.122.1
  - @memberjunction/ng-code-editor@2.122.1
  - @memberjunction/ng-container-directives@2.122.1
  - @memberjunction/ng-entity-viewer@2.122.1
  - @memberjunction/ng-notifications@2.122.1
  - @memberjunction/ng-shared-generic@2.122.1
  - @memberjunction/graphql-dataprovider@2.122.1
  - @memberjunction/interactive-component-types@2.122.1
  - @memberjunction/core@2.122.1
  - @memberjunction/core-entities@2.122.1
  - @memberjunction/global@2.122.1
  - @memberjunction/skip-types@2.122.1
  - @memberjunction/templates-base-types@2.122.1
  - @memberjunction/testing-engine-base@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/graphql-dataprovider@2.122.0
  - @memberjunction/ng-core-entity-forms@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ng-shared@2.122.0
  - @memberjunction/ng-testing@2.122.0
  - @memberjunction/ng-action-gallery@2.122.0
  - @memberjunction/ng-ai-test-harness@2.122.0
  - @memberjunction/ng-container-directives@2.122.0
  - @memberjunction/ng-entity-viewer@2.122.0
  - @memberjunction/ng-notifications@2.122.0
  - @memberjunction/ng-shared-generic@2.122.0
  - @memberjunction/templates-base-types@2.122.0
  - @memberjunction/testing-engine-base@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ng-core-entity-forms@2.121.0
  - @memberjunction/ng-shared@2.121.0
  - @memberjunction/ng-testing@2.121.0
  - @memberjunction/ng-action-gallery@2.121.0
  - @memberjunction/ng-ai-test-harness@2.121.0
  - @memberjunction/ng-container-directives@2.121.0
  - @memberjunction/ng-notifications@2.121.0
  - @memberjunction/graphql-dataprovider@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/templates-base-types@2.121.0
  - @memberjunction/testing-engine-base@2.121.0

## 2.120.0

### Patch Changes

- 60a1831: Fix WebSocket subscription lifecycle management in GraphQL data provider, add Gemini 3 Pro model with 1M token context window, enhance component linter to detect invalid property access on RunQuery/RunView results, and fix testing dashboard dialog rendering issues
- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ng-core-entity-forms@2.120.0
  - @memberjunction/graphql-dataprovider@2.120.0
  - @memberjunction/ng-shared@2.120.0
  - @memberjunction/ng-testing@2.120.0
  - @memberjunction/ng-action-gallery@2.120.0
  - @memberjunction/ng-ai-test-harness@2.120.0
  - @memberjunction/ng-container-directives@2.120.0
  - @memberjunction/ng-notifications@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/templates-base-types@2.120.0
  - @memberjunction/testing-engine-base@2.120.0

## 2.119.0

### Minor Changes

- 62790f4: migration

### Patch Changes

- Updated dependencies [7dd7cca]
- Updated dependencies [62790f4]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/ng-core-entity-forms@2.119.0
  - @memberjunction/ng-testing@2.119.0
  - @memberjunction/ng-shared@2.119.0
  - @memberjunction/ng-action-gallery@2.119.0
  - @memberjunction/ng-ai-test-harness@2.119.0
  - @memberjunction/ng-container-directives@2.119.0
  - @memberjunction/ng-notifications@2.119.0
  - @memberjunction/graphql-dataprovider@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/templates-base-types@2.119.0
  - @memberjunction/testing-engine-base@2.119.0

## 2.118.0

### Minor Changes

- 096ece6: migration

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [a49a7a8]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/ng-core-entity-forms@2.118.0
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/testing-engine-base@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ng-shared@2.118.0
  - @memberjunction/ng-action-gallery@2.118.0
  - @memberjunction/ng-ai-test-harness@2.118.0
  - @memberjunction/ng-notifications@2.118.0
  - @memberjunction/graphql-dataprovider@2.118.0
  - @memberjunction/templates-base-types@2.118.0
  - @memberjunction/ng-container-directives@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
- Updated dependencies [d21eadd]
  - @memberjunction/core@2.117.0
  - @memberjunction/ng-core-entity-forms@2.117.0
  - @memberjunction/ng-shared@2.117.0
  - @memberjunction/ng-action-gallery@2.117.0
  - @memberjunction/ng-ai-test-harness@2.117.0
  - @memberjunction/ng-container-directives@2.117.0
  - @memberjunction/ng-notifications@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/templates-base-types@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [cff85c7]
  - @memberjunction/core@2.116.0
  - @memberjunction/ng-core-entity-forms@2.116.0
  - @memberjunction/ng-shared@2.116.0
  - @memberjunction/ng-action-gallery@2.116.0
  - @memberjunction/ng-ai-test-harness@2.116.0
  - @memberjunction/ng-container-directives@2.116.0
  - @memberjunction/ng-notifications@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/templates-base-types@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.115.0
- @memberjunction/ng-shared@2.115.0
- @memberjunction/ng-action-gallery@2.115.0
- @memberjunction/ng-ai-test-harness@2.115.0
- @memberjunction/ng-container-directives@2.115.0
- @memberjunction/ng-notifications@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/templates-base-types@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.114.0
- @memberjunction/ng-shared@2.114.0
- @memberjunction/ng-action-gallery@2.114.0
- @memberjunction/ng-ai-test-harness@2.114.0
- @memberjunction/ng-container-directives@2.114.0
- @memberjunction/ng-notifications@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/templates-base-types@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ng-core-entity-forms@2.113.2
  - @memberjunction/ng-shared@2.113.2
  - @memberjunction/ng-action-gallery@2.113.2
  - @memberjunction/ng-ai-test-harness@2.113.2
  - @memberjunction/ng-container-directives@2.113.2
  - @memberjunction/ng-notifications@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/templates-base-types@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [2ac2120]
  - @memberjunction/ng-core-entity-forms@2.112.0
  - @memberjunction/ng-container-directives@2.112.0
  - @memberjunction/ng-notifications@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/templates-base-types@2.112.0
  - @memberjunction/ng-shared@2.112.0
  - @memberjunction/ng-ai-test-harness@2.112.0
  - @memberjunction/ng-action-gallery@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.110.1
- @memberjunction/ng-shared@2.110.1
- @memberjunction/ng-action-gallery@2.110.1
- @memberjunction/ng-ai-test-harness@2.110.1
- @memberjunction/ng-container-directives@2.110.1
- @memberjunction/ng-notifications@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/templates-base-types@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ng-core-entity-forms@2.110.0
  - @memberjunction/ng-shared@2.110.0
  - @memberjunction/ng-action-gallery@2.110.0
  - @memberjunction/ng-ai-test-harness@2.110.0
  - @memberjunction/ng-notifications@2.110.0
  - @memberjunction/templates-base-types@2.110.0
  - @memberjunction/ng-container-directives@2.110.0
  - @memberjunction/core@2.110.0

## 2.109.0

### Minor Changes

- 6e45c17: migration

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ng-core-entity-forms@2.109.0
  - @memberjunction/ng-shared@2.109.0
  - @memberjunction/ng-action-gallery@2.109.0
  - @memberjunction/ng-ai-test-harness@2.109.0
  - @memberjunction/ng-notifications@2.109.0
  - @memberjunction/templates-base-types@2.109.0
  - @memberjunction/ng-container-directives@2.109.0
  - @memberjunction/core@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [56dc09f]
- Updated dependencies [656d86c]
  - @memberjunction/ng-core-entity-forms@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ng-shared@2.108.0
  - @memberjunction/ng-action-gallery@2.108.0
  - @memberjunction/ng-ai-test-harness@2.108.0
  - @memberjunction/ng-notifications@2.108.0
  - @memberjunction/templates-base-types@2.108.0
  - @memberjunction/ng-container-directives@2.108.0
  - @memberjunction/core@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.107.0
- @memberjunction/ng-shared@2.107.0
- @memberjunction/ng-action-gallery@2.107.0
- @memberjunction/ng-ai-test-harness@2.107.0
- @memberjunction/ng-container-directives@2.107.0
- @memberjunction/ng-notifications@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/templates-base-types@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.106.0
- @memberjunction/ng-shared@2.106.0
- @memberjunction/ng-action-gallery@2.106.0
- @memberjunction/ng-ai-test-harness@2.106.0
- @memberjunction/ng-container-directives@2.106.0
- @memberjunction/ng-notifications@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/templates-base-types@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [d66070e]
- Updated dependencies [9b67e0c]
- Updated dependencies [1c3a1b6]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ng-core-entity-forms@2.105.0
  - @memberjunction/templates-base-types@2.105.0
  - @memberjunction/ng-shared@2.105.0
  - @memberjunction/ng-action-gallery@2.105.0
  - @memberjunction/ng-ai-test-harness@2.105.0
  - @memberjunction/ng-notifications@2.105.0
  - @memberjunction/ng-container-directives@2.105.0
  - @memberjunction/core@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [9ad6353]
- Updated dependencies [8f2a4fa]
- Updated dependencies [7980171]
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/ng-ai-test-harness@2.104.0
  - @memberjunction/ng-core-entity-forms@2.104.0
  - @memberjunction/ng-container-directives@2.104.0
  - @memberjunction/ng-notifications@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/templates-base-types@2.104.0
  - @memberjunction/ng-shared@2.104.0
  - @memberjunction/ng-action-gallery@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- 1c82fc0: By default, filter out deprecated components in Component Studio Dashboard.
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
- Updated dependencies [239ae00]
  - @memberjunction/core@2.103.0
  - @memberjunction/ng-container-directives@2.103.0
  - @memberjunction/ng-core-entity-forms@2.103.0
  - @memberjunction/ng-ai-test-harness@2.103.0
  - @memberjunction/ng-action-gallery@2.103.0
  - @memberjunction/ng-notifications@2.103.0
  - @memberjunction/ng-shared@2.103.0
  - @memberjunction/templates-base-types@2.103.0
  - @memberjunction/core-entities@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/ng-core-entity-forms@2.100.3
- @memberjunction/ng-shared@2.100.3
- @memberjunction/ng-action-gallery@2.100.3
- @memberjunction/ng-ai-test-harness@2.100.3
- @memberjunction/ng-notifications@2.100.3
- @memberjunction/templates-base-types@2.100.3
- @memberjunction/ng-container-directives@2.100.3
- @memberjunction/core@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.100.2
- @memberjunction/ng-shared@2.100.2
- @memberjunction/ng-action-gallery@2.100.2
- @memberjunction/ng-ai-test-harness@2.100.2
- @memberjunction/ng-container-directives@2.100.2
- @memberjunction/ng-notifications@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/templates-base-types@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.100.1
- @memberjunction/ng-shared@2.100.1
- @memberjunction/ng-action-gallery@2.100.1
- @memberjunction/ng-ai-test-harness@2.100.1
- @memberjunction/ng-container-directives@2.100.1
- @memberjunction/ng-notifications@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/templates-base-types@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ng-core-entity-forms@2.100.0
  - @memberjunction/ng-shared@2.100.0
  - @memberjunction/ng-action-gallery@2.100.0
  - @memberjunction/ng-ai-test-harness@2.100.0
  - @memberjunction/ng-container-directives@2.100.0
  - @memberjunction/ng-notifications@2.100.0
  - @memberjunction/templates-base-types@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/ng-core-entity-forms@2.99.0
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ng-shared@2.99.0
  - @memberjunction/ng-action-gallery@2.99.0
  - @memberjunction/ng-ai-test-harness@2.99.0
  - @memberjunction/ng-notifications@2.99.0
  - @memberjunction/templates-base-types@2.99.0
  - @memberjunction/ng-container-directives@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.98.0
- @memberjunction/ng-shared@2.98.0
- @memberjunction/ng-action-gallery@2.98.0
- @memberjunction/ng-ai-test-harness@2.98.0
- @memberjunction/ng-container-directives@2.98.0
- @memberjunction/ng-notifications@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/templates-base-types@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/ng-core-entity-forms@2.97.0
- @memberjunction/ng-shared@2.97.0
- @memberjunction/ng-action-gallery@2.97.0
- @memberjunction/ng-ai-test-harness@2.97.0
- @memberjunction/ng-notifications@2.97.0
- @memberjunction/templates-base-types@2.97.0
- @memberjunction/ng-container-directives@2.97.0
- @memberjunction/core@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
- Updated dependencies [ae3c0e2]
  - @memberjunction/core@2.96.0
  - @memberjunction/ng-core-entity-forms@2.96.0
  - @memberjunction/ng-shared@2.96.0
  - @memberjunction/ng-action-gallery@2.96.0
  - @memberjunction/ng-ai-test-harness@2.96.0
  - @memberjunction/ng-container-directives@2.96.0
  - @memberjunction/ng-notifications@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/templates-base-types@2.96.0

## 2.95.0

### Patch Changes

- 95e6360: Component Studio!
- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/ng-core-entity-forms@2.95.0
  - @memberjunction/ng-shared@2.95.0
  - @memberjunction/ng-action-gallery@2.95.0
  - @memberjunction/ng-ai-test-harness@2.95.0
  - @memberjunction/ng-container-directives@2.95.0
  - @memberjunction/ng-notifications@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/templates-base-types@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/ng-core-entity-forms@2.94.0
- @memberjunction/ng-shared@2.94.0
- @memberjunction/ng-action-gallery@2.94.0
- @memberjunction/ng-ai-test-harness@2.94.0
- @memberjunction/ng-notifications@2.94.0
- @memberjunction/templates-base-types@2.94.0
- @memberjunction/ng-container-directives@2.94.0
- @memberjunction/core@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [bfcd737]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/ng-ai-test-harness@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ng-core-entity-forms@2.93.0
  - @memberjunction/ng-shared@2.93.0
  - @memberjunction/ng-action-gallery@2.93.0
  - @memberjunction/ng-container-directives@2.93.0
  - @memberjunction/ng-notifications@2.93.0
  - @memberjunction/templates-base-types@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [b303b84]
- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/ng-core-entity-forms@2.92.0
  - @memberjunction/ng-ai-test-harness@2.92.0
  - @memberjunction/core@2.92.0
  - @memberjunction/ng-action-gallery@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/ng-shared@2.92.0
  - @memberjunction/ng-container-directives@2.92.0
  - @memberjunction/ng-notifications@2.92.0
  - @memberjunction/templates-base-types@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
- Updated dependencies [6b77f80]
  - @memberjunction/core@2.91.0
  - @memberjunction/ng-core-entity-forms@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/ng-shared@2.91.0
  - @memberjunction/ng-action-gallery@2.91.0
  - @memberjunction/ng-ai-test-harness@2.91.0
  - @memberjunction/ng-container-directives@2.91.0
  - @memberjunction/ng-notifications@2.91.0
  - @memberjunction/templates-base-types@2.91.0

## 2.90.0

### Patch Changes

- 2cb05a1: various tweaks
- Updated dependencies [146ebcc]
- Updated dependencies [2cb05a1]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/ng-core-entity-forms@2.90.0
  - @memberjunction/ng-shared@2.90.0
  - @memberjunction/ng-action-gallery@2.90.0
  - @memberjunction/ng-ai-test-harness@2.90.0
  - @memberjunction/ng-container-directives@2.90.0
  - @memberjunction/ng-notifications@2.90.0
  - @memberjunction/templates-base-types@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/ng-core-entity-forms@2.89.0
  - @memberjunction/ng-shared@2.89.0
  - @memberjunction/ng-action-gallery@2.89.0
  - @memberjunction/ng-ai-test-harness@2.89.0
  - @memberjunction/ng-notifications@2.89.0
  - @memberjunction/templates-base-types@2.89.0
  - @memberjunction/ng-container-directives@2.89.0
  - @memberjunction/core@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/ng-shared@2.88.0
  - @memberjunction/ng-ai-test-harness@2.88.0
  - @memberjunction/ng-notifications@2.88.0
  - @memberjunction/ng-core-entity-forms@2.88.0
  - @memberjunction/ng-action-gallery@2.88.0
  - @memberjunction/templates-base-types@2.88.0
  - @memberjunction/ng-container-directives@2.88.0
  - @memberjunction/core@2.88.0

## 2.87.0

### Minor Changes

- fa4132a: 2.87 bump

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/ng-core-entity-forms@2.87.0
  - @memberjunction/ng-shared@2.87.0
  - @memberjunction/ng-action-gallery@2.87.0
  - @memberjunction/ng-ai-test-harness@2.87.0
  - @memberjunction/ng-container-directives@2.87.0
  - @memberjunction/ng-notifications@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/templates-base-types@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/ng-core-entity-forms@2.86.0
  - @memberjunction/ng-shared@2.86.0
  - @memberjunction/ng-action-gallery@2.86.0
  - @memberjunction/ng-ai-test-harness@2.86.0
  - @memberjunction/ng-notifications@2.86.0
  - @memberjunction/templates-base-types@2.86.0
  - @memberjunction/ng-container-directives@2.86.0
  - @memberjunction/core@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/ng-core-entity-forms@2.85.0
  - @memberjunction/ng-shared@2.85.0
  - @memberjunction/ng-action-gallery@2.85.0
  - @memberjunction/ng-ai-test-harness@2.85.0
  - @memberjunction/ng-notifications@2.85.0
  - @memberjunction/templates-base-types@2.85.0
  - @memberjunction/ng-container-directives@2.85.0
  - @memberjunction/core@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/ng-shared@2.84.0
  - @memberjunction/ng-ai-test-harness@2.84.0
  - @memberjunction/ng-notifications@2.84.0
  - @memberjunction/ng-core-entity-forms@2.84.0
  - @memberjunction/ng-action-gallery@2.84.0
  - @memberjunction/ng-container-directives@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/templates-base-types@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/ng-core-entity-forms@2.83.0
  - @memberjunction/ng-shared@2.83.0
  - @memberjunction/ng-action-gallery@2.83.0
  - @memberjunction/ng-ai-test-harness@2.83.0
  - @memberjunction/ng-container-directives@2.83.0
  - @memberjunction/ng-notifications@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/templates-base-types@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/ng-core-entity-forms@2.82.0
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/ng-shared@2.82.0
  - @memberjunction/ng-ai-test-harness@2.82.0
  - @memberjunction/ng-notifications@2.82.0
  - @memberjunction/ng-action-gallery@2.82.0
  - @memberjunction/templates-base-types@2.82.0
  - @memberjunction/ng-container-directives@2.82.0
  - @memberjunction/core@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [95491fa]
- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/ng-core-entity-forms@2.81.0
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/ng-shared@2.81.0
  - @memberjunction/ng-action-gallery@2.81.0
  - @memberjunction/ng-ai-test-harness@2.81.0
  - @memberjunction/ng-container-directives@2.81.0
  - @memberjunction/ng-notifications@2.81.0
  - @memberjunction/templates-base-types@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.80.1
- @memberjunction/ng-shared@2.80.1
- @memberjunction/ng-action-gallery@2.80.1
- @memberjunction/ng-ai-test-harness@2.80.1
- @memberjunction/ng-container-directives@2.80.1
- @memberjunction/ng-notifications@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/templates-base-types@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
- Updated dependencies [536ad6e]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/ng-core-entity-forms@2.80.0
  - @memberjunction/ng-shared@2.80.0
  - @memberjunction/ng-ai-test-harness@2.80.0
  - @memberjunction/ng-notifications@2.80.0
  - @memberjunction/ng-action-gallery@2.80.0
  - @memberjunction/ng-container-directives@2.80.0
  - @memberjunction/templates-base-types@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
  - @memberjunction/ng-core-entity-forms@2.79.0
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/ng-shared@2.79.0
  - @memberjunction/ng-action-gallery@2.79.0
  - @memberjunction/ng-ai-test-harness@2.79.0
  - @memberjunction/ng-notifications@2.79.0
  - @memberjunction/templates-base-types@2.79.0
  - @memberjunction/ng-container-directives@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ng-core-entity-forms@2.78.0
  - @memberjunction/ng-shared@2.78.0
  - @memberjunction/ng-action-gallery@2.78.0
  - @memberjunction/ng-ai-test-harness@2.78.0
  - @memberjunction/ng-notifications@2.78.0
  - @memberjunction/templates-base-types@2.78.0
  - @memberjunction/ng-container-directives@2.78.0
  - @memberjunction/core@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/ng-core-entity-forms@2.77.0
  - @memberjunction/ng-shared@2.77.0
  - @memberjunction/ng-action-gallery@2.77.0
  - @memberjunction/ng-ai-test-harness@2.77.0
  - @memberjunction/ng-container-directives@2.77.0
  - @memberjunction/ng-notifications@2.77.0
  - @memberjunction/templates-base-types@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [2da81b3]
- Updated dependencies [ffda243]
  - @memberjunction/ng-core-entity-forms@2.76.0
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/ng-shared@2.76.0
  - @memberjunction/ng-ai-test-harness@2.76.0
  - @memberjunction/ng-notifications@2.76.0
  - @memberjunction/ng-action-gallery@2.76.0
  - @memberjunction/templates-base-types@2.76.0
  - @memberjunction/ng-container-directives@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [9ccd145]
- Updated dependencies [6a65fad]
- Updated dependencies [b403003]
  - @memberjunction/ng-ai-test-harness@2.75.0
  - @memberjunction/ng-core-entity-forms@2.75.0
  - @memberjunction/ng-container-directives@2.75.0
  - @memberjunction/ng-action-gallery@2.75.0
  - @memberjunction/ng-shared@2.75.0
  - @memberjunction/ng-notifications@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/templates-base-types@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ng-core-entity-forms@2.74.0
  - @memberjunction/ng-shared@2.74.0
  - @memberjunction/ng-action-gallery@2.74.0
  - @memberjunction/ng-ai-test-harness@2.74.0
  - @memberjunction/ng-notifications@2.74.0
  - @memberjunction/templates-base-types@2.74.0
  - @memberjunction/ng-container-directives@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/ng-core-entity-forms@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ng-shared@2.73.0
  - @memberjunction/ng-action-gallery@2.73.0
  - @memberjunction/ng-ai-test-harness@2.73.0
  - @memberjunction/ng-notifications@2.73.0
  - @memberjunction/templates-base-types@2.73.0
  - @memberjunction/ng-container-directives@2.73.0
  - @memberjunction/core@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/ng-core-entity-forms@2.72.0
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ng-shared@2.72.0
  - @memberjunction/ng-action-gallery@2.72.0
  - @memberjunction/ng-ai-test-harness@2.72.0
  - @memberjunction/ng-notifications@2.72.0
  - @memberjunction/templates-base-types@2.72.0
  - @memberjunction/ng-container-directives@2.72.0
  - @memberjunction/core@2.72.0

## 2.71.0

### Patch Changes

- e75f0a4: Major AI Agent and AI Prompt Management Enhancements
  - **AI Agent Forms**: Complete redesign with comprehensive sub-agent creation, advanced settings management, and transaction-based persistence
  - **AI Prompt Forms**: Implemented atomic "Create New Prompt" feature with template linking and proper MemberJunction navigation
  - **User Permissions**: Added comprehensive user permission reflection across AI forms and dashboards
  - **UX Improvements**: Enhanced prompt selector with visual indicators for already linked prompts, proper cancel/revert functionality
  - **Template Management**: Resolved template management issues with improved template editor and selector dialogs
  - **Sub-Agent System**: Full implementation of sub-agent selector with deferred transactions and database constraint compliance
  - **Advanced Settings**: New dialogs for AI Agent prompts, sub-agents, and actions with modern UI components
  - **CLI**: Fixed AUTH0 environment variable casing in install command

  This release significantly improves the AI management experience with better transaction handling, user permissions, and modern UI components.

- 5a127bb: Remove status badge dots
- Updated dependencies [e75f0a4]
- Updated dependencies [5a127bb]
  - @memberjunction/ng-core-entity-forms@2.71.0
  - @memberjunction/ng-shared@2.71.0
  - @memberjunction/ng-action-gallery@2.71.0
  - @memberjunction/ng-ai-test-harness@2.71.0
  - @memberjunction/ng-container-directives@2.71.0
  - @memberjunction/ng-notifications@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/templates-base-types@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [c9d86cd]
  - @memberjunction/ng-core-entity-forms@2.70.0
  - @memberjunction/ng-container-directives@2.70.0
  - @memberjunction/ng-notifications@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/templates-base-types@2.70.0
  - @memberjunction/ng-shared@2.70.0
  - @memberjunction/ng-ai-test-harness@2.70.0
  - @memberjunction/ng-action-gallery@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ng-core-entity-forms@2.69.1
  - @memberjunction/ng-shared@2.69.1
  - @memberjunction/ng-action-gallery@2.69.1
  - @memberjunction/ng-ai-test-harness@2.69.1
  - @memberjunction/ng-container-directives@2.69.1
  - @memberjunction/ng-notifications@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/templates-base-types@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/ng-core-entity-forms@2.69.0
  - @memberjunction/ng-shared@2.69.0
  - @memberjunction/ng-action-gallery@2.69.0
  - @memberjunction/ng-ai-test-harness@2.69.0
  - @memberjunction/ng-container-directives@2.69.0
  - @memberjunction/ng-notifications@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/templates-base-types@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/ng-core-entity-forms@2.68.0
  - @memberjunction/ng-shared@2.68.0
  - @memberjunction/ng-action-gallery@2.68.0
  - @memberjunction/ng-ai-test-harness@2.68.0
  - @memberjunction/ng-container-directives@2.68.0
  - @memberjunction/ng-notifications@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/templates-base-types@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.67.0
- @memberjunction/ng-shared@2.67.0
- @memberjunction/ng-action-gallery@2.67.0
- @memberjunction/ng-ai-test-harness@2.67.0
- @memberjunction/ng-container-directives@2.67.0
- @memberjunction/ng-notifications@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/templates-base-types@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.66.0
- @memberjunction/ng-shared@2.66.0
- @memberjunction/ng-ai-test-harness@2.66.0
- @memberjunction/ng-notifications@2.66.0
- @memberjunction/ng-action-gallery@2.66.0
- @memberjunction/ng-container-directives@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/templates-base-types@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [b029c5d]
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/ng-core-entity-forms@2.65.0
  - @memberjunction/ng-container-directives@2.65.0
  - @memberjunction/ng-notifications@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/templates-base-types@2.65.0
  - @memberjunction/ng-shared@2.65.0
  - @memberjunction/ng-action-gallery@2.65.0
  - @memberjunction/ng-ai-test-harness@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/ng-core-entity-forms@2.64.0
  - @memberjunction/ng-shared@2.64.0
  - @memberjunction/ng-action-gallery@2.64.0
  - @memberjunction/ng-ai-test-harness@2.64.0
  - @memberjunction/ng-notifications@2.64.0
  - @memberjunction/templates-base-types@2.64.0
  - @memberjunction/ng-container-directives@2.64.0
  - @memberjunction/core@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [2f18672]
  - @memberjunction/ng-core-entity-forms@2.63.1
  - @memberjunction/ng-container-directives@2.63.1
  - @memberjunction/ng-notifications@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/templates-base-types@2.63.1
  - @memberjunction/ng-shared@2.63.1
  - @memberjunction/ng-ai-test-harness@2.63.1
  - @memberjunction/ng-action-gallery@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
- Updated dependencies [bd3540d]
  - @memberjunction/ng-core-entity-forms@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/ng-shared@2.63.0
  - @memberjunction/ng-action-gallery@2.63.0
  - @memberjunction/ng-ai-test-harness@2.63.0
  - @memberjunction/ng-notifications@2.63.0
  - @memberjunction/templates-base-types@2.63.0
  - @memberjunction/ng-container-directives@2.63.0
  - @memberjunction/core@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/ng-core-entity-forms@2.62.0
  - @memberjunction/ng-shared@2.62.0
  - @memberjunction/ng-action-gallery@2.62.0
  - @memberjunction/ng-ai-test-harness@2.62.0
  - @memberjunction/ng-notifications@2.62.0
  - @memberjunction/templates-base-types@2.62.0
  - @memberjunction/ng-container-directives@2.62.0
  - @memberjunction/core@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/ng-core-entity-forms@2.61.0
- @memberjunction/ng-shared@2.61.0
- @memberjunction/ng-action-gallery@2.61.0
- @memberjunction/ng-ai-test-harness@2.61.0
- @memberjunction/ng-container-directives@2.61.0
- @memberjunction/ng-notifications@2.61.0
- @memberjunction/core@2.61.0
- @memberjunction/core-entities@2.61.0
- @memberjunction/templates-base-types@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [dc95bed]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/ng-core-entity-forms@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/ng-ai-test-harness@2.60.0
  - @memberjunction/ng-shared@2.60.0
  - @memberjunction/ng-action-gallery@2.60.0
  - @memberjunction/ng-container-directives@2.60.0
  - @memberjunction/ng-notifications@2.60.0
  - @memberjunction/templates-base-types@2.60.0

## 2.59.0

### Patch Changes

- Updated dependencies [4af40cb]
  - @memberjunction/ng-ai-test-harness@2.59.0
  - @memberjunction/ng-core-entity-forms@2.59.0
  - @memberjunction/ng-action-gallery@2.59.0
  - @memberjunction/ng-shared@2.59.0
  - @memberjunction/ng-container-directives@2.59.0
  - @memberjunction/ng-notifications@2.59.0
  - @memberjunction/core@2.59.0
  - @memberjunction/core-entities@2.59.0
  - @memberjunction/templates-base-types@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/ng-core-entity-forms@2.58.0
  - @memberjunction/ng-shared@2.58.0
  - @memberjunction/ng-action-gallery@2.58.0
  - @memberjunction/ng-ai-test-harness@2.58.0
  - @memberjunction/ng-container-directives@2.58.0
  - @memberjunction/ng-notifications@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/templates-base-types@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [67a2bec]
- Updated dependencies [0ba485f]
  - @memberjunction/ng-core-entity-forms@2.57.0
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/ng-shared@2.57.0
  - @memberjunction/ng-action-gallery@2.57.0
  - @memberjunction/ng-ai-test-harness@2.57.0
  - @memberjunction/ng-container-directives@2.57.0
  - @memberjunction/ng-notifications@2.57.0
  - @memberjunction/templates-base-types@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/ng-core-entity-forms@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/ng-shared@2.56.0
  - @memberjunction/ng-action-gallery@2.56.0
  - @memberjunction/ng-ai-test-harness@2.56.0
  - @memberjunction/ng-notifications@2.56.0
  - @memberjunction/templates-base-types@2.56.0
  - @memberjunction/ng-container-directives@2.56.0
  - @memberjunction/core@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [659f892]
  - @memberjunction/ng-core-entity-forms@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ng-shared@2.55.0
  - @memberjunction/ng-action-gallery@2.55.0
  - @memberjunction/ng-ai-test-harness@2.55.0
  - @memberjunction/ng-notifications@2.55.0
  - @memberjunction/templates-base-types@2.55.0
  - @memberjunction/ng-container-directives@2.55.0
  - @memberjunction/core@2.55.0

## 2.54.0

### Patch Changes

- b21ba9e: This PR addresses multiple UI issues and improvements across the MemberJunction Explorer and Angular components, enhancing user experience and visual consistency throughout the platform.
- Updated dependencies [20f424d]
  - @memberjunction/core@2.54.0
  - @memberjunction/ng-shared@2.54.0
  - @memberjunction/ng-container-directives@2.54.0
  - @memberjunction/ng-notifications@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/templates-base-types@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [51fe03b]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/ng-container-directives@2.53.0
  - @memberjunction/ng-shared@2.53.0
  - @memberjunction/ng-notifications@2.53.0
  - @memberjunction/templates-base-types@2.53.0

## 2.52.0

### Patch Changes

- d6f88c1: actions dashboard export
- Updated dependencies [e926106]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/ng-shared@2.52.0
  - @memberjunction/ng-container-directives@2.52.0
  - @memberjunction/ng-notifications@2.52.0
  - @memberjunction/templates-base-types@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/ng-shared@2.51.0
  - @memberjunction/ng-container-directives@2.51.0
  - @memberjunction/ng-notifications@2.51.0
  - @memberjunction/templates-base-types@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ng-container-directives@2.50.0
- @memberjunction/ng-notifications@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/templates-base-types@2.50.0

## 2.49.0

### Minor Changes

- b5d9fbd: Actions system improvements/metadata
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/ng-container-directives@2.49.0
  - @memberjunction/ng-notifications@2.49.0
  - @memberjunction/templates-base-types@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/ng-container-directives@2.48.0
  - @memberjunction/ng-notifications@2.48.0
  - @memberjunction/templates-base-types@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/ng-container-directives@2.47.0
- @memberjunction/ng-notifications@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0
- @memberjunction/templates-base-types@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ng-container-directives@2.46.0
- @memberjunction/ng-notifications@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/templates-base-types@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [556ee8d]
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ng-notifications@2.45.0
  - @memberjunction/templates-base-types@2.45.0
  - @memberjunction/ng-container-directives@2.45.0
  - @memberjunction/core@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [fbc30dc]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/templates-base-types@2.44.0
  - @memberjunction/ng-container-directives@2.44.0
  - @memberjunction/ng-notifications@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/ng-container-directives@2.43.0
  - @memberjunction/ng-notifications@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/templates-base-types@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ng-container-directives@2.42.1
- @memberjunction/ng-notifications@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/templates-base-types@2.42.1

## 2.42.0

### Minor Changes

- d49f25c: Key Areas Addressed:

### Patch Changes

- @memberjunction/ng-container-directives@2.42.0
- @memberjunction/ng-notifications@2.42.0
- @memberjunction/core@2.42.0
- @memberjunction/core-entities@2.42.0
- @memberjunction/templates-base-types@2.42.0
