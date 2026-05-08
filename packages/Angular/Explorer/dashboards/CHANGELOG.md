# @memberjunction/ng-dashboards

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
