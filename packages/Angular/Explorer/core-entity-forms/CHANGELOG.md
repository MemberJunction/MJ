# Change Log - @memberjunction/ng-core-entity-forms

## 5.40.2

### Patch Changes

- @memberjunction/ai-engine-base@5.40.2
- @memberjunction/ai@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/actions-base@5.40.2
- @memberjunction/ng-base-application@5.40.2
- @memberjunction/ng-link-directives@5.40.2
- @memberjunction/ng-shared@5.40.2
- @memberjunction/ng-testing@5.40.2
- @memberjunction/ng-action-gallery@5.40.2
- @memberjunction/ng-actions@5.40.2
- @memberjunction/ng-agents@5.40.2
- @memberjunction/ng-ai-test-harness@5.40.2
- @memberjunction/ng-base-forms@5.40.2
- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-code-editor@5.40.2
- @memberjunction/ng-deep-diff@5.40.2
- @memberjunction/ng-entity-relationship-diagram@5.40.2
- @memberjunction/ng-entity-viewer@5.40.2
- @memberjunction/ng-flow-editor@5.40.2
- @memberjunction/ng-join-grid@5.40.2
- @memberjunction/ng-list-management@5.40.2
- @memberjunction/ng-markdown@5.40.2
- @memberjunction/ng-notifications@5.40.2
- @memberjunction/ng-search@5.40.2
- @memberjunction/ng-shared-generic@5.40.2
- @memberjunction/ng-tabstrip@5.40.2
- @memberjunction/ng-timeline@5.40.2
- @memberjunction/ng-trees@5.40.2
- @memberjunction/ng-ui-components@5.40.2
- @memberjunction/ng-versions@5.40.2
- @memberjunction/graphql-dataprovider@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/templates-base-types@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/ng-base-application@5.40.1
  - @memberjunction/ng-link-directives@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-testing@5.40.1
  - @memberjunction/ng-action-gallery@5.40.1
  - @memberjunction/ng-actions@5.40.1
  - @memberjunction/ng-agents@5.40.1
  - @memberjunction/ng-ai-test-harness@5.40.1
  - @memberjunction/ng-base-forms@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-deep-diff@5.40.1
  - @memberjunction/ng-entity-relationship-diagram@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/ng-flow-editor@5.40.1
  - @memberjunction/ng-join-grid@5.40.1
  - @memberjunction/ng-list-management@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-search@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/ng-timeline@5.40.1
  - @memberjunction/ng-trees@5.40.1
  - @memberjunction/ng-versions@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/templates-base-types@5.40.1
  - @memberjunction/ng-tabstrip@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-ui-components@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Minor Changes

- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

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

- 73bb233: Add KeyPrefix column to APIKey table for visual key identification. Stores the configured prefix plus 4 characters of the random body (e.g., "mj_sk_a1b2") at creation time so administrators can differentiate API keys without exposing the full key.
- f2cca15: Fix research-agent reports being dropped from chat, add pluggable inline artifact previews, and correct Prompt Run token display.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/ng-base-application@5.40.0
  - @memberjunction/ng-link-directives@5.40.0
  - @memberjunction/ng-testing@5.40.0
  - @memberjunction/ng-action-gallery@5.40.0
  - @memberjunction/ng-actions@5.40.0
  - @memberjunction/ng-agents@5.40.0
  - @memberjunction/ng-ai-test-harness@5.40.0
  - @memberjunction/ng-base-forms@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-deep-diff@5.40.0
  - @memberjunction/ng-entity-relationship-diagram@5.40.0
  - @memberjunction/ng-flow-editor@5.40.0
  - @memberjunction/ng-join-grid@5.40.0
  - @memberjunction/ng-list-management@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-search@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-timeline@5.40.0
  - @memberjunction/ng-trees@5.40.0
  - @memberjunction/ng-versions@5.40.0
  - @memberjunction/templates-base-types@5.40.0
  - @memberjunction/ng-tabstrip@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- db4addf: feat(integration): Integration Framework Expansion — schema + metadata-driven CRUD base class, generated layer, cross-dialect hardening, and field-mapping cache

  End-to-end increment expanding the integration framework: new per-operation write metadata on the schema, a generic metadata-driven CRUD base class, the regenerated entity/GraphQL/form layers that expose it, plus the cross-dialect (PostgreSQL + SQL Server) bug fixes and a field-mapping performance cache found while proving it live.

  **Schema (v5.39.x migration)**
  - `IntegrationObject`: explicit per-operation write columns — `CreateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `UpdateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `DeleteAPIPath`/`DeleteIDLocation`. The legacy `WriteAPIPath`/`WriteMethod` are kept one release as deprecated aliases.
  - `IntegrationObject`: `IncrementalWatermarkField` — vendor cursor/timestamp field name driving the incremental sync filter.
  - `IntegrationObject` + `IntegrationObjectField`: `MetadataSource` enum `{Declared, Discovered, Custom}` — provenance for merge precedence in `IntegrationSchemaSync`.

  All schema changes are additive (new nullable fields + a new enum field) — no existing field is removed, renamed, or narrowed — so the bumps are **minor**.

  **Engine / base class (`@memberjunction/integration-engine`)**
  - `ExternalFieldSchema`: add `IsPrimaryKey` (distinct from `IsUniqueKey`). Fixes an `IntrospectSchema` bug where `IsPrimaryKey` was incorrectly mapped from `IsUniqueKey` — an object can have multiple unique fields but only one primary key.
  - `BaseRESTIntegrationConnector`: new `TransformRecord` hook — optional per-record customization seam between `NormalizeResponse` and `ToExternalRecord` (default identity); override for vendor-specific record-level shape changes.
  - `BaseRESTIntegrationConnector`: generic metadata-driven CRUD — `CreateRecord`/`UpdateRecord`/`DeleteRecord`/`GetRecord` read the per-operation columns and execute generically. Concrete connectors override only when an API is genuinely idiosyncratic. Replaces the hand-rolled write logic previously duplicated across every concrete connector.
  - `FieldMappingEngine`: cache compiled `custom`-transform expressions instead of recompiling `new Function` once per field per record. A batch of N records sharing an expression compiles it once and executes the cached function N times, dropping per-record cost from `O(compile + execute)` to `O(execute)`. The cache stores a typed `CompiledExpression = (value, fields) => unknown` (no weak typing), caches compile failures too (a malformed expression is compiled once and the resulting `Error` re-thrown from cache per record, leaving `OnError` `Fail`/`Null`/`Skip` semantics unchanged), and is bounded by `MJLruCache` (1000-entry default) since the owning `IntegrationEngine` is a process-lifetime singleton.

  **Generated layer (CodeGen for the v5.39.x migration)**
  - `@memberjunction/core-entities` — `IntegrationObjectEntity` / `IntegrationObjectFieldEntity` gain strongly-typed accessors for the per-operation write columns, `IncrementalWatermarkField`, and the `MetadataSource` enum (`'Declared' | 'Discovered' | 'Custom'`).
  - `@memberjunction/server` — regenerated resolvers / GraphQL types expose the new fields.
  - `@memberjunction/ng-core-entity-forms` — regenerated `MJ: Integration Objects` / `MJ: Integration Object Fields` forms render the new fields.

  **Cross-dialect hardening (PostgreSQL + SQL Server)**

  Bugs found and fixed while proving the framework end-to-end on both dialects with live generated actions:
  - `@memberjunction/codegen-lib` — PostgreSQL CRUD generation emitted the primary-key column twice for composite-PK entities, so association/junction tables never synced on PG; `PostgreSQLCodeGenProvider` now treats a multi-column PK as strategy-handled. Soft-PK/FK application uses dialect-aware identifier quoting and boolean literals (`this.dialect.QuoteIdentifier` / `BooleanLiteral`) so the pass runs correctly on PostgreSQL.
  - `@memberjunction/server` — wired the PostgreSQL branch of the in-process CodeGen runner (`RuntimeSchemaManager.SetCodeGenRunner`) that previously existed only for SQL Server, so runtime schema sync no longer falls back to a hang-prone child process on PG. `IntegrationDiscoveryResolver` entity/field-map creation is now create-or-reuse (idempotent on re-apply), and its idempotency + operational list reads use `BypassCache` so create-vs-update decisions read committed state.
  - `@memberjunction/integration-engine` — `MatchEngine.FindRecordMapEntry` and the bulk record-map load now read committed state (`BypassCache`), fixing duplicate-create after a direct-DB change; watermark save/load is idempotent to avoid a transaction-abort on retry. `LoadRunConfiguration` and every remaining operational decision-read — the upsert-by-identity record-map lookup, field-maps, the full-vs-incremental gate, write-back external-id lookup, orphan-sweep, and orphaned-run resume — now also `BypassCache`. This closes a Postgres-only gap where a freshly-toggled entity-map `Configuration` (e.g. enabling partition/Merkle reconcile) was read stale → the ChangeToken rollup was silently never written on PG, and removes the broader read-stale-then-decide bug class so the read-your-own-writes pipeline always decides from committed state on both dialects.
  - `@memberjunction/core-actions` — the generated integration-action executor used stale entity names (`'Integrations'`, `'Company Integrations'`); corrected to `'MJ: Integrations'` / `'MJ: Company Integrations'` so `List`/`Get` invoke successfully.
  - `@memberjunction/core-entities-server` — declares its previously-undeclared `@memberjunction/integration-pk-classifier` dependency (used by the server-side LLM PK-detection callback), fixing the missing-dependency check; covers the integration server-entity behavior (`MJCompanyIntegrationEntityServer`, `IntegrationLLMPKCallback`).
  - Multi-provider safety — the post-pipeline metadata `Refresh()` calls in `IntegrationDiscoveryResolver` and `MJCompanyIntegrationEntityServer` now refresh the request's own provider (`provider ?? new Metadata()`) instead of the global default, satisfying the `MultiProviderCompliance` gate and refreshing the correct cache under a non-default provider.
  - Dialect layer (`@memberjunction/sql-dialect`) — statement splitting for runtime schema migrations is now a dialect concern: `SplitStatements` (naive `;`-split on the base, dollar-quote-aware override on PostgreSQL so `DO $$…$$` blocks stay intact) instead of living in the schema-engine runtime.

- 0f9acba: feat(knowledge-hub): Classify sub-app decomposition + new classification features

  Decompose the Classify (content autotagging) dashboard from a single ~5,150-line component into a thin host shell plus 6 self-contained tab sub-page components and 4 dialog components, with a shared pure helper layer. Cacheable metadata reuses the existing `KnowledgeHubMetadataEngine` / `TagEngineBase` / `AIEngineBase`; high-volume rows stay on `RunView`.

  Surfaces backend capabilities that previously had no UI:
  - **Suggestions Inbox** — human-in-the-loop review queue over `MJ: Tag Suggestions` (approve / merge / reject).
  - **Tag Health** — real merge-candidate / low-usage / wide-node signals, replacing the prior heuristic.
  - **Governance / Synonyms / Scope** editors on the Taxonomy tag panel (typed `MJTag` flags, synonym approval workflow, tag scope).
  - **Config parity** — full `IContentSourceConfiguration` (taxonomy mode, thresholds, tag root, budgets, toggles, effective-values) inline in the source form, which is now sectioned and a resizable, width-remembering slide-in.
  - **Dry-run preview** — in-memory disposition preview of a source's tags under its current mode + thresholds (no LLM call, nothing persisted).

  Adds `TagSynonym.Status` (`Active`/`Pending`/`Rejected`, default `Active`) for the synonym approval workflow — additive and backward-compatible — with the regenerated entity, server, and form code. `ng-bootstrap`'s class manifest + allow-list pick up `TagEngineBase`.

- 1b0f355: Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown
- 34fe6d1: Capture and surface AI prompt-cache cost across providers — OpenRouter provider-reported cost passthrough; per-model cache read/write pricing on AI Model Costs with cache-aware cost calculation; cache-token rollups on AI Prompt Runs and Agent Runs; and cache hit-rate + dollar-savings analytics across the AI dashboards (Cost & Budget, Model Performance, Prompt Runs, Usage Patterns, Executive Summary) and the prompt-run / agent-run detail views. Includes a migration adding cache columns — run CodeGen after applying.

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
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
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
  - @memberjunction/ng-base-forms@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/ng-versions@5.39.0
  - @memberjunction/ng-entity-viewer@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/ng-base-application@5.39.0
  - @memberjunction/ng-link-directives@5.39.0
  - @memberjunction/ng-shared@5.39.0
  - @memberjunction/ng-testing@5.39.0
  - @memberjunction/ng-action-gallery@5.39.0
  - @memberjunction/ng-actions@5.39.0
  - @memberjunction/ng-agents@5.39.0
  - @memberjunction/ng-ai-test-harness@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-deep-diff@5.39.0
  - @memberjunction/ng-entity-relationship-diagram@5.39.0
  - @memberjunction/ng-flow-editor@5.39.0
  - @memberjunction/ng-join-grid@5.39.0
  - @memberjunction/ng-list-management@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-search@5.39.0
  - @memberjunction/ng-timeline@5.39.0
  - @memberjunction/ng-trees@5.39.0
  - @memberjunction/templates-base-types@5.39.0
  - @memberjunction/ng-tabstrip@5.39.0

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

### Patch Changes

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
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [60947be]
- Updated dependencies [2ee14f1]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/ng-base-application@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-base-forms@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ng-agents@5.38.0
  - @memberjunction/ng-ai-test-harness@5.38.0
  - @memberjunction/ng-testing@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/ng-link-directives@5.38.0
  - @memberjunction/ng-action-gallery@5.38.0
  - @memberjunction/ng-actions@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-deep-diff@5.38.0
  - @memberjunction/ng-entity-relationship-diagram@5.38.0
  - @memberjunction/ng-entity-viewer@5.38.0
  - @memberjunction/ng-flow-editor@5.38.0
  - @memberjunction/ng-join-grid@5.38.0
  - @memberjunction/ng-list-management@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-search@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-timeline@5.38.0
  - @memberjunction/ng-trees@5.38.0
  - @memberjunction/ng-versions@5.38.0
  - @memberjunction/templates-base-types@5.38.0
  - @memberjunction/ai@5.38.0
  - @memberjunction/ng-tabstrip@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-ui-components@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [0102dc6]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/ng-base-forms@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-shared@5.37.0
  - @memberjunction/ng-testing@5.37.0
  - @memberjunction/ng-actions@5.37.0
  - @memberjunction/ng-ai-test-harness@5.37.0
  - @memberjunction/ng-list-management@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-search@5.37.0
  - @memberjunction/ng-versions@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ng-agents@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/ng-base-application@5.37.0
  - @memberjunction/ng-link-directives@5.37.0
  - @memberjunction/ng-action-gallery@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-deep-diff@5.37.0
  - @memberjunction/ng-entity-relationship-diagram@5.37.0
  - @memberjunction/ng-entity-viewer@5.37.0
  - @memberjunction/ng-flow-editor@5.37.0
  - @memberjunction/ng-join-grid@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-timeline@5.37.0
  - @memberjunction/ng-trees@5.37.0
  - @memberjunction/templates-base-types@5.37.0
  - @memberjunction/ng-tabstrip@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-ui-components@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

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
  - @memberjunction/ng-base-forms@5.36.0
  - @memberjunction/ng-entity-viewer@5.36.0
  - @memberjunction/ng-list-management@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-shared@5.36.0
  - @memberjunction/ng-testing@5.36.0
  - @memberjunction/ng-actions@5.36.0
  - @memberjunction/ng-ai-test-harness@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-search@5.36.0
  - @memberjunction/ng-versions@5.36.0
  - @memberjunction/ng-action-gallery@5.36.0
  - @memberjunction/ng-entity-relationship-diagram@5.36.0
  - @memberjunction/ng-join-grid@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/ng-base-application@5.36.0
  - @memberjunction/ng-agents@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-flow-editor@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-trees@5.36.0
  - @memberjunction/templates-base-types@5.36.0
  - @memberjunction/ng-link-directives@5.36.0
  - @memberjunction/ng-deep-diff@5.36.0
  - @memberjunction/ng-timeline@5.36.0
  - @memberjunction/ng-tabstrip@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- eb54def: Add an inline save/edit experience to the custom Test and Test Suite forms: editable Name, Description, Status, Parent Suite / Test Type, and tag-chip editor, plus a sticky save bar that slides up from the bottom whenever the record is dirty (Save/Discard, ⌘S shortcut, beforeunload guard, success/error toasts). Test Suite forms also gain in-place membership management — a searchable picker dialog for bulk-adding tests, hover-revealed remove with inline confirm, and drag-to-reorder via CDK with sequence persistence.
- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [383784c]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-ui-components@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ng-shared@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/ng-base-application@5.35.0
  - @memberjunction/ng-link-directives@5.35.0
  - @memberjunction/ng-testing@5.35.0
  - @memberjunction/ng-action-gallery@5.35.0
  - @memberjunction/ng-actions@5.35.0
  - @memberjunction/ng-agents@5.35.0
  - @memberjunction/ng-ai-test-harness@5.35.0
  - @memberjunction/ng-base-forms@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-deep-diff@5.35.0
  - @memberjunction/ng-entity-relationship-diagram@5.35.0
  - @memberjunction/ng-entity-viewer@5.35.0
  - @memberjunction/ng-flow-editor@5.35.0
  - @memberjunction/ng-join-grid@5.35.0
  - @memberjunction/ng-list-management@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-search@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-timeline@5.35.0
  - @memberjunction/ng-trees@5.35.0
  - @memberjunction/ng-versions@5.35.0
  - @memberjunction/templates-base-types@5.35.0
  - @memberjunction/ai@5.35.0
  - @memberjunction/ng-tabstrip@5.35.0
  - @memberjunction/ng-markdown@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-application@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/ng-link-directives@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-testing@5.34.1
  - @memberjunction/ng-action-gallery@5.34.1
  - @memberjunction/ng-actions@5.34.1
  - @memberjunction/ng-agents@5.34.1
  - @memberjunction/ng-ai-test-harness@5.34.1
  - @memberjunction/ng-base-forms@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-deep-diff@5.34.1
  - @memberjunction/ng-entity-relationship-diagram@5.34.1
  - @memberjunction/ng-entity-viewer@5.34.1
  - @memberjunction/ng-flow-editor@5.34.1
  - @memberjunction/ng-join-grid@5.34.1
  - @memberjunction/ng-list-management@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-search@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-timeline@5.34.1
  - @memberjunction/ng-trees@5.34.1
  - @memberjunction/ng-versions@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/templates-base-types@5.34.1
  - @memberjunction/ng-tabstrip@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-ui-components@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Minor Changes

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

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
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
  - @memberjunction/ng-flow-editor@5.34.0
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/ng-base-application@5.34.0
  - @memberjunction/ng-link-directives@5.34.0
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-testing@5.34.0
  - @memberjunction/ng-action-gallery@5.34.0
  - @memberjunction/ng-actions@5.34.0
  - @memberjunction/ng-agents@5.34.0
  - @memberjunction/ng-ai-test-harness@5.34.0
  - @memberjunction/ng-base-forms@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-deep-diff@5.34.0
  - @memberjunction/ng-entity-relationship-diagram@5.34.0
  - @memberjunction/ng-entity-viewer@5.34.0
  - @memberjunction/ng-join-grid@5.34.0
  - @memberjunction/ng-list-management@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-search@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-tabstrip@5.34.0
  - @memberjunction/ng-timeline@5.34.0
  - @memberjunction/ng-trees@5.34.0
  - @memberjunction/ng-ui-components@5.34.0
  - @memberjunction/ng-versions@5.34.0
  - @memberjunction/templates-base-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

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
  - @memberjunction/ng-entity-viewer@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-testing@5.33.0
  - @memberjunction/ng-actions@5.33.0
  - @memberjunction/ng-ai-test-harness@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-versions@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/ng-base-application@5.33.0
  - @memberjunction/ng-link-directives@5.33.0
  - @memberjunction/ng-action-gallery@5.33.0
  - @memberjunction/ng-agents@5.33.0
  - @memberjunction/ng-base-forms@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-deep-diff@5.33.0
  - @memberjunction/ng-entity-relationship-diagram@5.33.0
  - @memberjunction/ng-flow-editor@5.33.0
  - @memberjunction/ng-join-grid@5.33.0
  - @memberjunction/ng-list-management@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-timeline@5.33.0
  - @memberjunction/ng-trees@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/templates-base-types@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ng-tabstrip@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-ui-components@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/ng-base-application@5.32.0
  - @memberjunction/ng-link-directives@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-testing@5.32.0
  - @memberjunction/ng-action-gallery@5.32.0
  - @memberjunction/ng-actions@5.32.0
  - @memberjunction/ng-agents@5.32.0
  - @memberjunction/ng-ai-test-harness@5.32.0
  - @memberjunction/ng-base-forms@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-deep-diff@5.32.0
  - @memberjunction/ng-entity-relationship-diagram@5.32.0
  - @memberjunction/ng-entity-viewer@5.32.0
  - @memberjunction/ng-flow-editor@5.32.0
  - @memberjunction/ng-join-grid@5.32.0
  - @memberjunction/ng-list-management@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-timeline@5.32.0
  - @memberjunction/ng-trees@5.32.0
  - @memberjunction/ng-versions@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/templates-base-types@5.32.0
  - @memberjunction/ng-tabstrip@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-ui-components@5.32.0
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

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
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
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/ng-base-application@5.31.0
  - @memberjunction/ng-link-directives@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-testing@5.31.0
  - @memberjunction/ng-action-gallery@5.31.0
  - @memberjunction/ng-actions@5.31.0
  - @memberjunction/ng-agents@5.31.0
  - @memberjunction/ng-ai-test-harness@5.31.0
  - @memberjunction/ng-base-forms@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-deep-diff@5.31.0
  - @memberjunction/ng-entity-relationship-diagram@5.31.0
  - @memberjunction/ng-entity-viewer@5.31.0
  - @memberjunction/ng-flow-editor@5.31.0
  - @memberjunction/ng-join-grid@5.31.0
  - @memberjunction/ng-list-management@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-tabstrip@5.31.0
  - @memberjunction/ng-timeline@5.31.0
  - @memberjunction/ng-trees@5.31.0
  - @memberjunction/ng-ui-components@5.31.0
  - @memberjunction/ng-versions@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/templates-base-types@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/ng-base-application@5.30.1
- @memberjunction/ng-link-directives@5.30.1
- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-testing@5.30.1
- @memberjunction/ng-action-gallery@5.30.1
- @memberjunction/ng-actions@5.30.1
- @memberjunction/ng-agents@5.30.1
- @memberjunction/ng-ai-test-harness@5.30.1
- @memberjunction/ng-base-forms@5.30.1
- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-deep-diff@5.30.1
- @memberjunction/ng-entity-relationship-diagram@5.30.1
- @memberjunction/ng-entity-viewer@5.30.1
- @memberjunction/ng-flow-editor@5.30.1
- @memberjunction/ng-join-grid@5.30.1
- @memberjunction/ng-list-management@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-tabstrip@5.30.1
- @memberjunction/ng-timeline@5.30.1
- @memberjunction/ng-trees@5.30.1
- @memberjunction/ng-ui-components@5.30.1
- @memberjunction/ng-versions@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/templates-base-types@5.30.1

## 5.30.0

### Minor Changes

- c2c5892: Activate Memory Manager consolidation pipeline with drift prevention, entity-attribute contradiction detection, Ebbinghaus decay-based archival, protection tiers, and composite importance scoring. Adds the `AIAgentNote` consolidation schema (`ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, `ImportanceScore`) and enforces the vector-store Status invariant write-side in `MJAIAgentNoteEntityServer.Save()` / `.Delete()` so revoked notes are removed from retrieval without an MJAPI restart. Expands Memory Manager observability with per-phase run-step payloads: `scoreDistribution`, `entityTriplesExtracted`, `decayScoreDistribution`, `protectedPreserved`, `ephemeralAccelerated`, consolidation `triggerType` (forced/time/event/count), a new `Verify Consolidation Output` phase-level run step, and per-cluster `Process Consolidation Cluster` child steps. Adds 95th-percentile uniqueness outlier auto-protection in importance scoring. Deprecates the Memory Cleanup Agent in favor of the unified Memory Manager pipeline.
- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.

### Patch Changes

- 8980b38: fix(codegen): native geo-field detection ignores virtual fields; relax strictTemplates on generated forms
  1. **Native geo-field detection now excludes virtual fields.** The view-introspection pass synthesizes virtual `__mj_Latitude`/`__mj_Longitude` EntityField rows that an in-file UPDATE intentionally tags with `ExtendedType=GeoLatitude/Longitude` (so downstream consumers can introspect them as geo data — by design). Without this fix, the native-vs-JOIN view-shape detector mistook those tags for real native table columns on the next CodeGen run, switched to native-path DDL, and tried to `SELECT e.__mj_Longitude FROM dbo.<Table> e` — column doesn't exist on the table, view CREATE fails. Because CodeGen drops the existing view before recreating, the failed CREATE left the entity with no view at all, cascading into broken stored procs. Detection now enforces the precondition the native path requires: `ExtendedType=Geo*` AND `IsVirtual=false`. Virtual rows stay tagged for downstream consumers; they just no longer mislead the table-vs-JOIN switch, so geo-eligible entities correctly fall through to the LEFT JOIN against `vwRecordGeoCodes`.
  2. **`strictTemplates: false` on `@memberjunction/ng-core-entity-forms`.** Forms in that package are emitted by CodeGen, one per entity. Supertype entities with many inbound FKs (Salesforce User, Account, Contact frequently exceed 1000) generate a single template with one `<mj-collapsible-panel>` per related entity. With `strictTemplates: true`, Angular generates a Type Check Block representing the whole template as one TypeScript expression — at ~150+ panels the TCB exceeds TypeScript's expression-complexity limit (TS2563 "Excessive complexity in this expression"), failing the build. Type safety on these templates is guaranteed by CodeGen construction (bindings come from the same metadata that generates the component class), so the trade is acceptable to remove the form-generator's hard scale ceiling. Runtime behavior, render perf, and bundle size are unchanged.

- 68bf87f: Archive entity CodeGen migration with updated views/SPs, field display name corrections, and RuntimeActionConfiguration type fix
- 216ddc3: Wrap sequential Save/Delete looops in atomic transcatoins (TransactionGroup client-side BeginTransaction/Commit/Rollback server-side)
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-flow-editor@5.30.0
  - @memberjunction/ng-base-application@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-testing@5.30.0
  - @memberjunction/ng-action-gallery@5.30.0
  - @memberjunction/ng-actions@5.30.0
  - @memberjunction/ng-agents@5.30.0
  - @memberjunction/ng-ai-test-harness@5.30.0
  - @memberjunction/ng-base-forms@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-entity-viewer@5.30.0
  - @memberjunction/ng-join-grid@5.30.0
  - @memberjunction/ng-list-management@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-trees@5.30.0
  - @memberjunction/ng-versions@5.30.0
  - @memberjunction/templates-base-types@5.30.0
  - @memberjunction/ng-link-directives@5.30.0
  - @memberjunction/ng-deep-diff@5.30.0
  - @memberjunction/ng-entity-relationship-diagram@5.30.0
  - @memberjunction/ng-timeline@5.30.0
  - @memberjunction/ng-tabstrip@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-ui-components@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- Updated dependencies [e77233c]
- Updated dependencies [e02e24e]
- Updated dependencies [914a6ad]
- Updated dependencies [7006276]
  - @memberjunction/ng-ai-test-harness@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-trees@5.29.0
  - @memberjunction/ng-deep-diff@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-action-gallery@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/ng-base-application@5.29.0
  - @memberjunction/ng-link-directives@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-testing@5.29.0
  - @memberjunction/ng-actions@5.29.0
  - @memberjunction/ng-agents@5.29.0
  - @memberjunction/ng-base-forms@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-entity-relationship-diagram@5.29.0
  - @memberjunction/ng-entity-viewer@5.29.0
  - @memberjunction/ng-flow-editor@5.29.0
  - @memberjunction/ng-join-grid@5.29.0
  - @memberjunction/ng-list-management@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-timeline@5.29.0
  - @memberjunction/ng-versions@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/templates-base-types@5.29.0
  - @memberjunction/ng-tabstrip@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-ui-components@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-link-directives@5.28.0
  - @memberjunction/ng-testing@5.28.0
  - @memberjunction/ng-agents@5.28.0
  - @memberjunction/ng-ai-test-harness@5.28.0
  - @memberjunction/ng-join-grid@5.28.0
  - @memberjunction/ng-list-management@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/ng-base-application@5.28.0
  - @memberjunction/ng-action-gallery@5.28.0
  - @memberjunction/ng-actions@5.28.0
  - @memberjunction/ng-base-forms@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-deep-diff@5.28.0
  - @memberjunction/ng-entity-relationship-diagram@5.28.0
  - @memberjunction/ng-entity-viewer@5.28.0
  - @memberjunction/ng-flow-editor@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-timeline@5.28.0
  - @memberjunction/ng-trees@5.28.0
  - @memberjunction/ng-versions@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/templates-base-types@5.28.0
  - @memberjunction/ng-tabstrip@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-ui-components@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/ng-base-application@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-testing@5.27.1
  - @memberjunction/ng-action-gallery@5.27.1
  - @memberjunction/ng-actions@5.27.1
  - @memberjunction/ng-agents@5.27.1
  - @memberjunction/ng-ai-test-harness@5.27.1
  - @memberjunction/ng-base-forms@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-deep-diff@5.27.1
  - @memberjunction/ng-entity-relationship-diagram@5.27.1
  - @memberjunction/ng-entity-viewer@5.27.1
  - @memberjunction/ng-flow-editor@5.27.1
  - @memberjunction/ng-join-grid@5.27.1
  - @memberjunction/ng-list-management@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/ng-trees@5.27.1
  - @memberjunction/ng-versions@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/templates-base-types@5.27.1
  - @memberjunction/ng-link-directives@5.27.1
  - @memberjunction/ng-tabstrip@5.27.1
  - @memberjunction/ng-timeline@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-ui-components@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [35cf7d4]
  - @memberjunction/ng-trees@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/ng-base-application@5.27.0
  - @memberjunction/ng-link-directives@5.27.0
  - @memberjunction/ng-shared@5.27.0
  - @memberjunction/ng-testing@5.27.0
  - @memberjunction/ng-action-gallery@5.27.0
  - @memberjunction/ng-actions@5.27.0
  - @memberjunction/ng-agents@5.27.0
  - @memberjunction/ng-ai-test-harness@5.27.0
  - @memberjunction/ng-base-forms@5.27.0
  - @memberjunction/ng-code-editor@5.27.0
  - @memberjunction/ng-deep-diff@5.27.0
  - @memberjunction/ng-entity-relationship-diagram@5.27.0
  - @memberjunction/ng-entity-viewer@5.27.0
  - @memberjunction/ng-flow-editor@5.27.0
  - @memberjunction/ng-join-grid@5.27.0
  - @memberjunction/ng-list-management@5.27.0
  - @memberjunction/ng-markdown@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/ng-shared-generic@5.27.0
  - @memberjunction/ng-tabstrip@5.27.0
  - @memberjunction/ng-timeline@5.27.0
  - @memberjunction/ng-ui-components@5.27.0
  - @memberjunction/ng-versions@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/templates-base-types@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- a1002f4: - Entities now expose AllowCaching as the runtime source of truth for
- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-action-gallery@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-entity-relationship-diagram@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/ng-ui-components@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/ng-base-application@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-testing@5.26.0
  - @memberjunction/ng-actions@5.26.0
  - @memberjunction/ng-agents@5.26.0
  - @memberjunction/ng-ai-test-harness@5.26.0
  - @memberjunction/ng-base-forms@5.26.0
  - @memberjunction/ng-entity-viewer@5.26.0
  - @memberjunction/ng-flow-editor@5.26.0
  - @memberjunction/ng-join-grid@5.26.0
  - @memberjunction/ng-list-management@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-trees@5.26.0
  - @memberjunction/ng-versions@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/templates-base-types@5.26.0
  - @memberjunction/ng-link-directives@5.26.0
  - @memberjunction/ng-deep-diff@5.26.0
  - @memberjunction/ng-timeline@5.26.0
  - @memberjunction/ng-tabstrip@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/ng-ai-test-harness@5.25.0
  - @memberjunction/ng-entity-viewer@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ng-base-application@5.25.0
  - @memberjunction/ng-link-directives@5.25.0
  - @memberjunction/ng-shared@5.25.0
  - @memberjunction/ng-testing@5.25.0
  - @memberjunction/ng-action-gallery@5.25.0
  - @memberjunction/ng-actions@5.25.0
  - @memberjunction/ng-agents@5.25.0
  - @memberjunction/ng-base-forms@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-deep-diff@5.25.0
  - @memberjunction/ng-entity-relationship-diagram@5.25.0
  - @memberjunction/ng-flow-editor@5.25.0
  - @memberjunction/ng-join-grid@5.25.0
  - @memberjunction/ng-list-management@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-timeline@5.25.0
  - @memberjunction/templates-base-types@5.25.0
  - @memberjunction/ng-tabstrip@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-ui-components@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ng-agents@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-ai-test-harness@5.24.0
  - @memberjunction/ng-base-forms@5.24.0
  - @memberjunction/ng-shared@5.24.0
  - @memberjunction/ng-testing@5.24.0
  - @memberjunction/ng-actions@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ng-base-application@5.24.0
  - @memberjunction/ng-link-directives@5.24.0
  - @memberjunction/ng-action-gallery@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-deep-diff@5.24.0
  - @memberjunction/ng-entity-relationship-diagram@5.24.0
  - @memberjunction/ng-entity-viewer@5.24.0
  - @memberjunction/ng-flow-editor@5.24.0
  - @memberjunction/ng-join-grid@5.24.0
  - @memberjunction/ng-list-management@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-timeline@5.24.0
  - @memberjunction/templates-base-types@5.24.0
  - @memberjunction/ng-tabstrip@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-ui-components@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [37dc301]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ng-base-application@5.23.0
  - @memberjunction/ng-base-forms@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-ui-components@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/ng-link-directives@5.23.0
  - @memberjunction/ng-shared@5.23.0
  - @memberjunction/ng-testing@5.23.0
  - @memberjunction/ng-action-gallery@5.23.0
  - @memberjunction/ng-actions@5.23.0
  - @memberjunction/ng-agents@5.23.0
  - @memberjunction/ng-ai-test-harness@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-deep-diff@5.23.0
  - @memberjunction/ng-entity-relationship-diagram@5.23.0
  - @memberjunction/ng-entity-viewer@5.23.0
  - @memberjunction/ng-flow-editor@5.23.0
  - @memberjunction/ng-join-grid@5.23.0
  - @memberjunction/ng-list-management@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-timeline@5.23.0
  - @memberjunction/templates-base-types@5.23.0
  - @memberjunction/ai@5.23.0
  - @memberjunction/ng-tabstrip@5.23.0
  - @memberjunction/ng-markdown@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-agents@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-base-application@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-ai-test-harness@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/ng-link-directives@5.22.0
  - @memberjunction/ng-shared@5.22.0
  - @memberjunction/ng-testing@5.22.0
  - @memberjunction/ng-action-gallery@5.22.0
  - @memberjunction/ng-actions@5.22.0
  - @memberjunction/ng-base-forms@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-deep-diff@5.22.0
  - @memberjunction/ng-entity-relationship-diagram@5.22.0
  - @memberjunction/ng-entity-viewer@5.22.0
  - @memberjunction/ng-flow-editor@5.22.0
  - @memberjunction/ng-join-grid@5.22.0
  - @memberjunction/ng-list-management@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/ng-timeline@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/templates-base-types@5.22.0
  - @memberjunction/ai@5.22.0
  - @memberjunction/ng-tabstrip@5.22.0
  - @memberjunction/ng-markdown@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/ng-base-application@5.21.0
  - @memberjunction/ng-link-directives@5.21.0
  - @memberjunction/ng-shared@5.21.0
  - @memberjunction/ng-testing@5.21.0
  - @memberjunction/ng-action-gallery@5.21.0
  - @memberjunction/ng-actions@5.21.0
  - @memberjunction/ng-agents@5.21.0
  - @memberjunction/ng-ai-test-harness@5.21.0
  - @memberjunction/ng-base-forms@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-deep-diff@5.21.0
  - @memberjunction/ng-entity-relationship-diagram@5.21.0
  - @memberjunction/ng-entity-viewer@5.21.0
  - @memberjunction/ng-flow-editor@5.21.0
  - @memberjunction/ng-join-grid@5.21.0
  - @memberjunction/ng-list-management@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-timeline@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/templates-base-types@5.21.0
  - @memberjunction/ng-tabstrip@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/ng-base-application@5.20.0
  - @memberjunction/ng-link-directives@5.20.0
  - @memberjunction/ng-shared@5.20.0
  - @memberjunction/ng-testing@5.20.0
  - @memberjunction/ng-action-gallery@5.20.0
  - @memberjunction/ng-actions@5.20.0
  - @memberjunction/ng-agents@5.20.0
  - @memberjunction/ng-ai-test-harness@5.20.0
  - @memberjunction/ng-base-forms@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-deep-diff@5.20.0
  - @memberjunction/ng-entity-relationship-diagram@5.20.0
  - @memberjunction/ng-entity-viewer@5.20.0
  - @memberjunction/ng-flow-editor@5.20.0
  - @memberjunction/ng-join-grid@5.20.0
  - @memberjunction/ng-list-management@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-timeline@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/templates-base-types@5.20.0
  - @memberjunction/ng-tabstrip@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/ng-base-application@5.19.0
- @memberjunction/ng-link-directives@5.19.0
- @memberjunction/ng-shared@5.19.0
- @memberjunction/ng-testing@5.19.0
- @memberjunction/ng-action-gallery@5.19.0
- @memberjunction/ng-actions@5.19.0
- @memberjunction/ng-agents@5.19.0
- @memberjunction/ng-ai-test-harness@5.19.0
- @memberjunction/ng-base-forms@5.19.0
- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-deep-diff@5.19.0
- @memberjunction/ng-entity-relationship-diagram@5.19.0
- @memberjunction/ng-entity-viewer@5.19.0
- @memberjunction/ng-flow-editor@5.19.0
- @memberjunction/ng-join-grid@5.19.0
- @memberjunction/ng-list-management@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-tabstrip@5.19.0
- @memberjunction/ng-timeline@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/templates-base-types@5.19.0

## 5.18.0

### Minor Changes

- 322dac6: metadata update

### Patch Changes

- ee4bf94: no migration
- Updated dependencies [322dac6]
- Updated dependencies [de310bc]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-agents@5.18.0
  - @memberjunction/ng-ai-test-harness@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-shared@5.18.0
  - @memberjunction/ng-action-gallery@5.18.0
  - @memberjunction/ng-testing@5.18.0
  - @memberjunction/ng-actions@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ng-link-directives@5.18.0
  - @memberjunction/ng-join-grid@5.18.0
  - @memberjunction/ng-list-management@5.18.0
  - @memberjunction/ng-base-forms@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/ng-base-application@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-deep-diff@5.18.0
  - @memberjunction/ng-entity-relationship-diagram@5.18.0
  - @memberjunction/ng-entity-viewer@5.18.0
  - @memberjunction/ng-flow-editor@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/ng-tabstrip@5.18.0
  - @memberjunction/ng-timeline@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/templates-base-types@5.18.0

## 5.17.0

### Patch Changes

- 001fd3e: no migration
- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-shared@5.17.0
  - @memberjunction/ng-testing@5.17.0
  - @memberjunction/ng-actions@5.17.0
  - @memberjunction/ng-ai-test-harness@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/ng-base-application@5.17.0
  - @memberjunction/ng-link-directives@5.17.0
  - @memberjunction/ng-action-gallery@5.17.0
  - @memberjunction/ng-agents@5.17.0
  - @memberjunction/ng-base-forms@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-deep-diff@5.17.0
  - @memberjunction/ng-entity-relationship-diagram@5.17.0
  - @memberjunction/ng-entity-viewer@5.17.0
  - @memberjunction/ng-flow-editor@5.17.0
  - @memberjunction/ng-join-grid@5.17.0
  - @memberjunction/ng-list-management@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-timeline@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/templates-base-types@5.17.0
  - @memberjunction/ng-tabstrip@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/ng-markdown@5.17.0
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
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/ng-base-application@5.16.0
  - @memberjunction/ng-link-directives@5.16.0
  - @memberjunction/ng-shared@5.16.0
  - @memberjunction/ng-testing@5.16.0
  - @memberjunction/ng-action-gallery@5.16.0
  - @memberjunction/ng-actions@5.16.0
  - @memberjunction/ng-agents@5.16.0
  - @memberjunction/ng-ai-test-harness@5.16.0
  - @memberjunction/ng-base-forms@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-deep-diff@5.16.0
  - @memberjunction/ng-entity-relationship-diagram@5.16.0
  - @memberjunction/ng-entity-viewer@5.16.0
  - @memberjunction/ng-flow-editor@5.16.0
  - @memberjunction/ng-join-grid@5.16.0
  - @memberjunction/ng-list-management@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-timeline@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/templates-base-types@5.16.0
  - @memberjunction/ng-tabstrip@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- 662d56b: migration + metadata

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/ng-base-application@5.15.0
  - @memberjunction/ng-link-directives@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-testing@5.15.0
  - @memberjunction/ng-action-gallery@5.15.0
  - @memberjunction/ng-actions@5.15.0
  - @memberjunction/ng-agents@5.15.0
  - @memberjunction/ng-ai-test-harness@5.15.0
  - @memberjunction/ng-base-forms@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-deep-diff@5.15.0
  - @memberjunction/ng-entity-relationship-diagram@5.15.0
  - @memberjunction/ng-entity-viewer@5.15.0
  - @memberjunction/ng-flow-editor@5.15.0
  - @memberjunction/ng-join-grid@5.15.0
  - @memberjunction/ng-list-management@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-timeline@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/templates-base-types@5.15.0
  - @memberjunction/ng-tabstrip@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ng-base-application@5.14.0
  - @memberjunction/ng-link-directives@5.14.0
  - @memberjunction/ng-shared@5.14.0
  - @memberjunction/ng-testing@5.14.0
  - @memberjunction/ng-action-gallery@5.14.0
  - @memberjunction/ng-actions@5.14.0
  - @memberjunction/ng-agents@5.14.0
  - @memberjunction/ng-ai-test-harness@5.14.0
  - @memberjunction/ng-base-forms@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-deep-diff@5.14.0
  - @memberjunction/ng-entity-relationship-diagram@5.14.0
  - @memberjunction/ng-entity-viewer@5.14.0
  - @memberjunction/ng-flow-editor@5.14.0
  - @memberjunction/ng-join-grid@5.14.0
  - @memberjunction/ng-list-management@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-timeline@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/templates-base-types@5.14.0
  - @memberjunction/ng-tabstrip@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- 1bb9b86: Entity Form scrollbars and List fixes
- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/ng-base-application@5.13.0
  - @memberjunction/ng-link-directives@5.13.0
  - @memberjunction/ng-shared@5.13.0
  - @memberjunction/ng-testing@5.13.0
  - @memberjunction/ng-action-gallery@5.13.0
  - @memberjunction/ng-actions@5.13.0
  - @memberjunction/ng-agents@5.13.0
  - @memberjunction/ng-ai-test-harness@5.13.0
  - @memberjunction/ng-base-forms@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-deep-diff@5.13.0
  - @memberjunction/ng-entity-relationship-diagram@5.13.0
  - @memberjunction/ng-entity-viewer@5.13.0
  - @memberjunction/ng-flow-editor@5.13.0
  - @memberjunction/ng-join-grid@5.13.0
  - @memberjunction/ng-list-management@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-timeline@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/templates-base-types@5.13.0
  - @memberjunction/ai@5.13.0
  - @memberjunction/ng-tabstrip@5.13.0
  - @memberjunction/ng-markdown@5.13.0

## 5.12.0

### Minor Changes

- d92502e: migration/metadata

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-entity-viewer@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-base-application@5.12.0
  - @memberjunction/ng-testing@5.12.0
  - @memberjunction/ng-actions@5.12.0
  - @memberjunction/ng-agents@5.12.0
  - @memberjunction/ng-ai-test-harness@5.12.0
  - @memberjunction/ng-base-forms@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-deep-diff@5.12.0
  - @memberjunction/ng-entity-relationship-diagram@5.12.0
  - @memberjunction/ng-flow-editor@5.12.0
  - @memberjunction/ng-join-grid@5.12.0
  - @memberjunction/ng-list-management@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/ng-tabstrip@5.12.0
  - @memberjunction/ng-timeline@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/ng-link-directives@5.12.0
  - @memberjunction/ng-shared@5.12.0
  - @memberjunction/ng-action-gallery@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/templates-base-types@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- 457afcf: Add create/edit query drawer to Query Browser; fix full record toolbar; suppress duplicate empty state in query grid
- Updated dependencies [a4c3c81]
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-shared@5.11.0
  - @memberjunction/ng-testing@5.11.0
  - @memberjunction/ng-actions@5.11.0
  - @memberjunction/ng-ai-test-harness@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/ng-base-application@5.11.0
  - @memberjunction/ng-link-directives@5.11.0
  - @memberjunction/ng-action-gallery@5.11.0
  - @memberjunction/ng-agents@5.11.0
  - @memberjunction/ng-base-forms@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-deep-diff@5.11.0
  - @memberjunction/ng-entity-relationship-diagram@5.11.0
  - @memberjunction/ng-entity-viewer@5.11.0
  - @memberjunction/ng-flow-editor@5.11.0
  - @memberjunction/ng-join-grid@5.11.0
  - @memberjunction/ng-list-management@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-timeline@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/templates-base-types@5.11.0
  - @memberjunction/ng-tabstrip@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/ng-base-application@5.10.1
- @memberjunction/ng-link-directives@5.10.1
- @memberjunction/ng-shared@5.10.1
- @memberjunction/ng-testing@5.10.1
- @memberjunction/ng-action-gallery@5.10.1
- @memberjunction/ng-actions@5.10.1
- @memberjunction/ng-agents@5.10.1
- @memberjunction/ng-ai-test-harness@5.10.1
- @memberjunction/ng-base-forms@5.10.1
- @memberjunction/ng-code-editor@5.10.1
- @memberjunction/ng-deep-diff@5.10.1
- @memberjunction/ng-entity-relationship-diagram@5.10.1
- @memberjunction/ng-entity-viewer@5.10.1
- @memberjunction/ng-flow-editor@5.10.1
- @memberjunction/ng-join-grid@5.10.1
- @memberjunction/ng-list-management@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-tabstrip@5.10.1
- @memberjunction/ng-timeline@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/templates-base-types@5.10.1

## 5.10.0

### Patch Changes

- f2df653: Add ExternalReferenceID column to AIAgentRun for cross-system run correlation and wire it through Skip proxy. Fix CodeGen validator duplicate generation and cleanup existing duplicates.
- Updated dependencies [f2df653]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/ng-base-application@5.10.0
  - @memberjunction/ng-link-directives@5.10.0
  - @memberjunction/ng-shared@5.10.0
  - @memberjunction/ng-testing@5.10.0
  - @memberjunction/ng-action-gallery@5.10.0
  - @memberjunction/ng-actions@5.10.0
  - @memberjunction/ng-agents@5.10.0
  - @memberjunction/ng-ai-test-harness@5.10.0
  - @memberjunction/ng-base-forms@5.10.0
  - @memberjunction/ng-code-editor@5.10.0
  - @memberjunction/ng-deep-diff@5.10.0
  - @memberjunction/ng-entity-relationship-diagram@5.10.0
  - @memberjunction/ng-entity-viewer@5.10.0
  - @memberjunction/ng-flow-editor@5.10.0
  - @memberjunction/ng-join-grid@5.10.0
  - @memberjunction/ng-list-management@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-timeline@5.10.0
  - @memberjunction/templates-base-types@5.10.0
  - @memberjunction/ng-tabstrip@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/ng-markdown@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/ng-base-application@5.9.0
  - @memberjunction/ng-shared@5.9.0
  - @memberjunction/ng-testing@5.9.0
  - @memberjunction/ng-action-gallery@5.9.0
  - @memberjunction/ng-actions@5.9.0
  - @memberjunction/ng-agents@5.9.0
  - @memberjunction/ng-ai-test-harness@5.9.0
  - @memberjunction/ng-base-forms@5.9.0
  - @memberjunction/ng-code-editor@5.9.0
  - @memberjunction/ng-entity-viewer@5.9.0
  - @memberjunction/ng-flow-editor@5.9.0
  - @memberjunction/ng-join-grid@5.9.0
  - @memberjunction/ng-list-management@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/templates-base-types@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/ng-deep-diff@5.9.0
  - @memberjunction/ng-link-directives@5.9.0
  - @memberjunction/ng-entity-relationship-diagram@5.9.0
  - @memberjunction/ng-timeline@5.9.0
  - @memberjunction/ng-tabstrip@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-shared@5.8.0
  - @memberjunction/ng-testing@5.8.0
  - @memberjunction/ng-actions@5.8.0
  - @memberjunction/ng-ai-test-harness@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/ng-base-application@5.8.0
  - @memberjunction/ng-link-directives@5.8.0
  - @memberjunction/ng-action-gallery@5.8.0
  - @memberjunction/ng-agents@5.8.0
  - @memberjunction/ng-base-forms@5.8.0
  - @memberjunction/ng-code-editor@5.8.0
  - @memberjunction/ng-deep-diff@5.8.0
  - @memberjunction/ng-entity-relationship-diagram@5.8.0
  - @memberjunction/ng-entity-viewer@5.8.0
  - @memberjunction/ng-flow-editor@5.8.0
  - @memberjunction/ng-join-grid@5.8.0
  - @memberjunction/ng-list-management@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/ng-timeline@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/templates-base-types@5.8.0
  - @memberjunction/ng-tabstrip@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
- Updated dependencies [7641cd2]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ng-base-forms@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/ng-ai-test-harness@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/ng-base-application@5.7.0
  - @memberjunction/ng-link-directives@5.7.0
  - @memberjunction/ng-shared@5.7.0
  - @memberjunction/ng-testing@5.7.0
  - @memberjunction/ng-action-gallery@5.7.0
  - @memberjunction/ng-actions@5.7.0
  - @memberjunction/ng-agents@5.7.0
  - @memberjunction/ng-code-editor@5.7.0
  - @memberjunction/ng-deep-diff@5.7.0
  - @memberjunction/ng-entity-relationship-diagram@5.7.0
  - @memberjunction/ng-entity-viewer@5.7.0
  - @memberjunction/ng-flow-editor@5.7.0
  - @memberjunction/ng-join-grid@5.7.0
  - @memberjunction/ng-list-management@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-timeline@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0
  - @memberjunction/templates-base-types@5.7.0
  - @memberjunction/ng-tabstrip@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/ng-base-application@5.6.0
  - @memberjunction/ng-link-directives@5.6.0
  - @memberjunction/ng-shared@5.6.0
  - @memberjunction/ng-testing@5.6.0
  - @memberjunction/ng-action-gallery@5.6.0
  - @memberjunction/ng-actions@5.6.0
  - @memberjunction/ng-agents@5.6.0
  - @memberjunction/ng-ai-test-harness@5.6.0
  - @memberjunction/ng-base-forms@5.6.0
  - @memberjunction/ng-code-editor@5.6.0
  - @memberjunction/ng-deep-diff@5.6.0
  - @memberjunction/ng-entity-relationship-diagram@5.6.0
  - @memberjunction/ng-entity-viewer@5.6.0
  - @memberjunction/ng-flow-editor@5.6.0
  - @memberjunction/ng-join-grid@5.6.0
  - @memberjunction/ng-list-management@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-timeline@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/templates-base-types@5.6.0
  - @memberjunction/ng-tabstrip@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Minor Changes

- 6421543: migration

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [2973c64]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/ng-entity-viewer@5.5.0
  - @memberjunction/ng-agents@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/ng-base-application@5.5.0
  - @memberjunction/ng-link-directives@5.5.0
  - @memberjunction/ng-shared@5.5.0
  - @memberjunction/ng-testing@5.5.0
  - @memberjunction/ng-action-gallery@5.5.0
  - @memberjunction/ng-actions@5.5.0
  - @memberjunction/ng-ai-test-harness@5.5.0
  - @memberjunction/ng-base-forms@5.5.0
  - @memberjunction/ng-code-editor@5.5.0
  - @memberjunction/ng-deep-diff@5.5.0
  - @memberjunction/ng-entity-relationship-diagram@5.5.0
  - @memberjunction/ng-flow-editor@5.5.0
  - @memberjunction/ng-join-grid@5.5.0
  - @memberjunction/ng-list-management@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-tabstrip@5.5.0
  - @memberjunction/ng-timeline@5.5.0
  - @memberjunction/templates-base-types@5.5.0

## 5.4.1

### Patch Changes

- Updated dependencies [c28af42]
- Updated dependencies [8789e86]
  - @memberjunction/ng-base-forms@5.4.1
  - @memberjunction/ng-shared@5.4.1
  - @memberjunction/ng-link-directives@5.4.1
  - @memberjunction/ng-testing@5.4.1
  - @memberjunction/ng-agents@5.4.1
  - @memberjunction/ng-ai-test-harness@5.4.1
  - @memberjunction/ng-join-grid@5.4.1
  - @memberjunction/ng-list-management@5.4.1
  - @memberjunction/ng-action-gallery@5.4.1
  - @memberjunction/ai-engine-base@5.4.1
  - @memberjunction/ai@5.4.1
  - @memberjunction/ai-core-plus@5.4.1
  - @memberjunction/actions-base@5.4.1
  - @memberjunction/ng-base-application@5.4.1
  - @memberjunction/ng-actions@5.4.1
  - @memberjunction/ng-code-editor@5.4.1
  - @memberjunction/ng-deep-diff@5.4.1
  - @memberjunction/ng-entity-relationship-diagram@5.4.1
  - @memberjunction/ng-entity-viewer@5.4.1
  - @memberjunction/ng-flow-editor@5.4.1
  - @memberjunction/ng-notifications@5.4.1
  - @memberjunction/ng-shared-generic@5.4.1
  - @memberjunction/ng-tabstrip@5.4.1
  - @memberjunction/ng-timeline@5.4.1
  - @memberjunction/graphql-dataprovider@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1
  - @memberjunction/global@5.4.1
  - @memberjunction/templates-base-types@5.4.1

## 5.4.0

### Patch Changes

- c9a760c: no migration
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
- Updated dependencies [6bcfa1c]
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-shared@5.4.0
  - @memberjunction/ng-entity-relationship-diagram@5.4.0
  - @memberjunction/ng-testing@5.4.0
  - @memberjunction/ng-actions@5.4.0
  - @memberjunction/ng-ai-test-harness@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/ng-base-application@5.4.0
  - @memberjunction/ng-action-gallery@5.4.0
  - @memberjunction/ng-agents@5.4.0
  - @memberjunction/ng-base-forms@5.4.0
  - @memberjunction/ng-code-editor@5.4.0
  - @memberjunction/ng-entity-viewer@5.4.0
  - @memberjunction/ng-flow-editor@5.4.0
  - @memberjunction/ng-join-grid@5.4.0
  - @memberjunction/ng-list-management@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/templates-base-types@5.4.0
  - @memberjunction/ng-link-directives@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/ng-deep-diff@5.4.0
  - @memberjunction/ng-tabstrip@5.4.0
  - @memberjunction/ng-timeline@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/ng-base-application@5.3.1
- @memberjunction/ng-link-directives@5.3.1
- @memberjunction/ng-shared@5.3.1
- @memberjunction/ng-testing@5.3.1
- @memberjunction/ng-action-gallery@5.3.1
- @memberjunction/ng-actions@5.3.1
- @memberjunction/ng-agents@5.3.1
- @memberjunction/ng-ai-test-harness@5.3.1
- @memberjunction/ng-base-forms@5.3.1
- @memberjunction/ng-code-editor@5.3.1
- @memberjunction/ng-deep-diff@5.3.1
- @memberjunction/ng-entity-relationship-diagram@5.3.1
- @memberjunction/ng-entity-viewer@5.3.1
- @memberjunction/ng-flow-editor@5.3.1
- @memberjunction/ng-join-grid@5.3.1
- @memberjunction/ng-list-management@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-tabstrip@5.3.1
- @memberjunction/ng-timeline@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/templates-base-types@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/ng-entity-viewer@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-shared@5.3.0
  - @memberjunction/ng-testing@5.3.0
  - @memberjunction/ng-actions@5.3.0
  - @memberjunction/ng-ai-test-harness@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ng-base-forms@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/ng-base-application@5.3.0
  - @memberjunction/ng-action-gallery@5.3.0
  - @memberjunction/ng-agents@5.3.0
  - @memberjunction/ng-code-editor@5.3.0
  - @memberjunction/ng-flow-editor@5.3.0
  - @memberjunction/ng-join-grid@5.3.0
  - @memberjunction/ng-list-management@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/templates-base-types@5.3.0
  - @memberjunction/ng-link-directives@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/ng-deep-diff@5.3.0
  - @memberjunction/ng-entity-relationship-diagram@5.3.0
  - @memberjunction/ng-tabstrip@5.3.0
  - @memberjunction/ng-timeline@5.3.0
  - @memberjunction/core@5.3.0
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
  - @memberjunction/ng-shared@5.2.0
  - @memberjunction/ng-agents@5.2.0
  - @memberjunction/ng-ai-test-harness@5.2.0
  - @memberjunction/ng-entity-viewer@5.2.0
  - @memberjunction/templates-base-types@5.2.0
  - @memberjunction/ng-testing@5.2.0
  - @memberjunction/ng-base-application@5.2.0
  - @memberjunction/ng-action-gallery@5.2.0
  - @memberjunction/ng-actions@5.2.0
  - @memberjunction/ng-base-forms@5.2.0
  - @memberjunction/ng-code-editor@5.2.0
  - @memberjunction/ng-flow-editor@5.2.0
  - @memberjunction/ng-join-grid@5.2.0
  - @memberjunction/ng-list-management@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-link-directives@5.2.0
  - @memberjunction/ng-deep-diff@5.2.0
  - @memberjunction/ng-entity-relationship-diagram@5.2.0
  - @memberjunction/ng-timeline@5.2.0
  - @memberjunction/ng-tabstrip@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/ng-base-application@5.1.0
  - @memberjunction/ng-shared@5.1.0
  - @memberjunction/ng-testing@5.1.0
  - @memberjunction/ng-actions@5.1.0
  - @memberjunction/ng-agents@5.1.0
  - @memberjunction/ng-ai-test-harness@5.1.0
  - @memberjunction/ng-base-forms@5.1.0
  - @memberjunction/ng-code-editor@5.1.0
  - @memberjunction/ng-deep-diff@5.1.0
  - @memberjunction/ng-entity-viewer@5.1.0
  - @memberjunction/ng-flow-editor@5.1.0
  - @memberjunction/ng-join-grid@5.1.0
  - @memberjunction/ng-list-management@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/templates-base-types@5.1.0
  - @memberjunction/ng-link-directives@5.1.0
  - @memberjunction/ng-action-gallery@5.1.0
  - @memberjunction/ng-tabstrip@5.1.0
  - @memberjunction/ng-entity-relationship-diagram@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-timeline@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [3cca644]
- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
- Updated dependencies [90bfa37]
  - @memberjunction/ng-entity-viewer@5.0.0
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/ng-base-application@5.0.0
  - @memberjunction/ng-link-directives@5.0.0
  - @memberjunction/ng-shared@5.0.0
  - @memberjunction/ng-testing@5.0.0
  - @memberjunction/ng-action-gallery@5.0.0
  - @memberjunction/ng-actions@5.0.0
  - @memberjunction/ng-agents@5.0.0
  - @memberjunction/ng-ai-test-harness@5.0.0
  - @memberjunction/ng-base-forms@5.0.0
  - @memberjunction/ng-code-editor@5.0.0
  - @memberjunction/ng-deep-diff@5.0.0
  - @memberjunction/ng-entity-relationship-diagram@5.0.0
  - @memberjunction/ng-flow-editor@5.0.0
  - @memberjunction/ng-join-grid@5.0.0
  - @memberjunction/ng-list-management@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/ng-tabstrip@5.0.0
  - @memberjunction/ng-timeline@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/templates-base-types@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/ng-base-application@4.4.0
  - @memberjunction/ng-link-directives@4.4.0
  - @memberjunction/ng-shared@4.4.0
  - @memberjunction/ng-testing@4.4.0
  - @memberjunction/ng-action-gallery@4.4.0
  - @memberjunction/ng-actions@4.4.0
  - @memberjunction/ng-agents@4.4.0
  - @memberjunction/ng-ai-test-harness@4.4.0
  - @memberjunction/ng-base-forms@4.4.0
  - @memberjunction/ng-code-editor@4.4.0
  - @memberjunction/ng-container-directives@4.4.0
  - @memberjunction/ng-deep-diff@4.4.0
  - @memberjunction/ng-entity-relationship-diagram@4.4.0
  - @memberjunction/ng-entity-viewer@4.4.0
  - @memberjunction/ng-flow-editor@4.4.0
  - @memberjunction/ng-join-grid@4.4.0
  - @memberjunction/ng-list-management@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/ng-timeline@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/templates-base-types@4.4.0
  - @memberjunction/ng-tabstrip@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-base-forms@4.3.1
- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/ng-base-application@4.3.1
- @memberjunction/ng-link-directives@4.3.1
- @memberjunction/ng-shared@4.3.1
- @memberjunction/ng-testing@4.3.1
- @memberjunction/ng-action-gallery@4.3.1
- @memberjunction/ng-actions@4.3.1
- @memberjunction/ng-agents@4.3.1
- @memberjunction/ng-ai-test-harness@4.3.1
- @memberjunction/ng-code-editor@4.3.1
- @memberjunction/ng-container-directives@4.3.1
- @memberjunction/ng-deep-diff@4.3.1
- @memberjunction/ng-entity-relationship-diagram@4.3.1
- @memberjunction/ng-entity-viewer@4.3.1
- @memberjunction/ng-flow-editor@4.3.1
- @memberjunction/ng-join-grid@4.3.1
- @memberjunction/ng-list-management@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/ng-tabstrip@4.3.1
- @memberjunction/ng-timeline@4.3.1
- @memberjunction/graphql-dataprovider@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/templates-base-types@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-shared@4.3.0
  - @memberjunction/ng-testing@4.3.0
  - @memberjunction/ng-actions@4.3.0
  - @memberjunction/ng-ai-test-harness@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/ng-base-application@4.3.0
  - @memberjunction/ng-link-directives@4.3.0
  - @memberjunction/ng-action-gallery@4.3.0
  - @memberjunction/ng-agents@4.3.0
  - @memberjunction/ng-base-forms@4.3.0
  - @memberjunction/ng-code-editor@4.3.0
  - @memberjunction/ng-container-directives@4.3.0
  - @memberjunction/ng-deep-diff@4.3.0
  - @memberjunction/ng-entity-relationship-diagram@4.3.0
  - @memberjunction/ng-entity-viewer@4.3.0
  - @memberjunction/ng-flow-editor@4.3.0
  - @memberjunction/ng-join-grid@4.3.0
  - @memberjunction/ng-list-management@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/ng-timeline@4.3.0
  - @memberjunction/templates-base-types@4.3.0
  - @memberjunction/ng-tabstrip@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/ng-base-application@4.2.0
- @memberjunction/ng-link-directives@4.2.0
- @memberjunction/ng-shared@4.2.0
- @memberjunction/ng-testing@4.2.0
- @memberjunction/ng-action-gallery@4.2.0
- @memberjunction/ng-actions@4.2.0
- @memberjunction/ng-agents@4.2.0
- @memberjunction/ng-ai-test-harness@4.2.0
- @memberjunction/ng-base-forms@4.2.0
- @memberjunction/ng-code-editor@4.2.0
- @memberjunction/ng-container-directives@4.2.0
- @memberjunction/ng-deep-diff@4.2.0
- @memberjunction/ng-entity-relationship-diagram@4.2.0
- @memberjunction/ng-entity-viewer@4.2.0
- @memberjunction/ng-flow-editor@4.2.0
- @memberjunction/ng-join-grid@4.2.0
- @memberjunction/ng-list-management@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/ng-tabstrip@4.2.0
- @memberjunction/ng-timeline@4.2.0
- @memberjunction/graphql-dataprovider@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/templates-base-types@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/ng-base-application@4.1.0
  - @memberjunction/ng-base-forms@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/ng-link-directives@4.1.0
  - @memberjunction/ng-shared@4.1.0
  - @memberjunction/ng-testing@4.1.0
  - @memberjunction/ng-action-gallery@4.1.0
  - @memberjunction/ng-actions@4.1.0
  - @memberjunction/ng-agents@4.1.0
  - @memberjunction/ng-ai-test-harness@4.1.0
  - @memberjunction/ng-code-editor@4.1.0
  - @memberjunction/ng-container-directives@4.1.0
  - @memberjunction/ng-deep-diff@4.1.0
  - @memberjunction/ng-entity-relationship-diagram@4.1.0
  - @memberjunction/ng-entity-viewer@4.1.0
  - @memberjunction/ng-flow-editor@4.1.0
  - @memberjunction/ng-join-grid@4.1.0
  - @memberjunction/ng-list-management@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-timeline@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0
  - @memberjunction/templates-base-types@4.1.0
  - @memberjunction/ng-tabstrip@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- 4723079: no migration
- 0a0cda1: no migration
- Updated dependencies [4723079]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [0a0cda1]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-flow-editor@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/ng-base-application@4.0.0
  - @memberjunction/ng-base-forms@4.0.0
  - @memberjunction/ng-form-toolbar@4.0.0
  - @memberjunction/ng-link-directives@4.0.0
  - @memberjunction/ng-shared@4.0.0
  - @memberjunction/ng-testing@4.0.0
  - @memberjunction/ng-action-gallery@4.0.0
  - @memberjunction/ng-actions@4.0.0
  - @memberjunction/ng-agents@4.0.0
  - @memberjunction/ng-ai-test-harness@4.0.0
  - @memberjunction/ng-code-editor@4.0.0
  - @memberjunction/ng-container-directives@4.0.0
  - @memberjunction/ng-deep-diff@4.0.0
  - @memberjunction/ng-entity-relationship-diagram@4.0.0
  - @memberjunction/ng-entity-viewer@4.0.0
  - @memberjunction/ng-join-grid@4.0.0
  - @memberjunction/ng-list-management@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/ng-tabstrip@4.0.0
  - @memberjunction/ng-timeline@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/templates-base-types@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [079dd6f]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/ng-actions@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/ng-base-application@3.4.0
  - @memberjunction/ng-base-forms@3.4.0
  - @memberjunction/ng-form-toolbar@3.4.0
  - @memberjunction/ng-shared@3.4.0
  - @memberjunction/ng-testing@3.4.0
  - @memberjunction/ng-action-gallery@3.4.0
  - @memberjunction/ng-ai-test-harness@3.4.0
  - @memberjunction/ng-code-editor@3.4.0
  - @memberjunction/ng-entity-viewer@3.4.0
  - @memberjunction/ng-join-grid@3.4.0
  - @memberjunction/ng-list-management@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/templates-base-types@3.4.0
  - @memberjunction/ng-link-directives@3.4.0
  - @memberjunction/ng-container-directives@3.4.0
  - @memberjunction/ng-deep-diff@3.4.0
  - @memberjunction/ng-entity-relationship-diagram@3.4.0
  - @memberjunction/ng-timeline@3.4.0
  - @memberjunction/ng-tabstrip@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [27a65b9]
- Updated dependencies [ca551dd]
- Updated dependencies [2183cbb]
  - @memberjunction/ng-entity-viewer@3.3.0
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-entity-relationship-diagram@3.3.0
  - @memberjunction/ng-base-forms@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/actions-base@3.3.0
  - @memberjunction/ng-base-application@3.3.0
  - @memberjunction/ng-form-toolbar@3.3.0
  - @memberjunction/ng-shared@3.3.0
  - @memberjunction/ng-user-view-grid@3.3.0
  - @memberjunction/ng-testing@3.3.0
  - @memberjunction/ng-action-gallery@3.3.0
  - @memberjunction/ng-ai-test-harness@3.3.0
  - @memberjunction/ng-code-editor@3.3.0
  - @memberjunction/ng-join-grid@3.3.0
  - @memberjunction/ng-list-management@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/graphql-dataprovider@3.3.0
  - @memberjunction/templates-base-types@3.3.0
  - @memberjunction/ng-link-directives@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/ng-container-directives@3.3.0
  - @memberjunction/ng-deep-diff@3.3.0
  - @memberjunction/ng-tabstrip@3.3.0
  - @memberjunction/ng-timeline@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Minor Changes

- 039983c: migration

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/actions-base@3.2.0
  - @memberjunction/ng-base-application@3.2.0
  - @memberjunction/ng-base-forms@3.2.0
  - @memberjunction/ng-form-toolbar@3.2.0
  - @memberjunction/ng-shared@3.2.0
  - @memberjunction/ng-user-view-grid@3.2.0
  - @memberjunction/ng-testing@3.2.0
  - @memberjunction/ng-action-gallery@3.2.0
  - @memberjunction/ng-ai-test-harness@3.2.0
  - @memberjunction/ng-code-editor@3.2.0
  - @memberjunction/ng-entity-viewer@3.2.0
  - @memberjunction/ng-join-grid@3.2.0
  - @memberjunction/ng-list-management@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/templates-base-types@3.2.0
  - @memberjunction/ng-link-directives@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/ng-container-directives@3.2.0
  - @memberjunction/ng-deep-diff@3.2.0
  - @memberjunction/ng-entity-relationship-diagram@3.2.0
  - @memberjunction/ng-tabstrip@3.2.0
  - @memberjunction/ng-timeline@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-shared@3.1.1
  - @memberjunction/ng-user-view-grid@3.1.1
  - @memberjunction/ng-testing@3.1.1
  - @memberjunction/ng-ai-test-harness@3.1.1
  - @memberjunction/ng-notifications@3.1.1
  - @memberjunction/ng-base-forms@3.1.1
  - @memberjunction/ng-form-toolbar@3.1.1
  - @memberjunction/ng-link-directives@3.1.1
  - @memberjunction/ng-join-grid@3.1.1
  - @memberjunction/ng-list-management@3.1.1
  - @memberjunction/ng-action-gallery@3.1.1
  - @memberjunction/ai-engine-base@3.1.1
  - @memberjunction/ai@3.1.1
  - @memberjunction/ai-core-plus@3.1.1
  - @memberjunction/actions-base@3.1.1
  - @memberjunction/ng-base-application@3.1.1
  - @memberjunction/ng-code-editor@3.1.1
  - @memberjunction/ng-container-directives@3.1.1
  - @memberjunction/ng-deep-diff@3.1.1
  - @memberjunction/ng-entity-relationship-diagram@3.1.1
  - @memberjunction/ng-entity-viewer@3.1.1
  - @memberjunction/ng-shared-generic@3.1.1
  - @memberjunction/ng-tabstrip@3.1.1
  - @memberjunction/ng-timeline@3.1.1
  - @memberjunction/core@3.1.1
  - @memberjunction/core-entities@3.1.1
  - @memberjunction/global@3.1.1
  - @memberjunction/templates-base-types@3.1.1

## 3.0.0

### Patch Changes

- Updated dependencies [528041e]
  - @memberjunction/ng-list-management@3.0.0
  - @memberjunction/ng-form-toolbar@3.0.0
  - @memberjunction/ng-user-view-grid@3.0.0
  - @memberjunction/ai-engine-base@3.0.0
  - @memberjunction/ai@3.0.0
  - @memberjunction/ai-core-plus@3.0.0
  - @memberjunction/actions-base@3.0.0
  - @memberjunction/ng-base-application@3.0.0
  - @memberjunction/ng-base-forms@3.0.0
  - @memberjunction/ng-link-directives@3.0.0
  - @memberjunction/ng-shared@3.0.0
  - @memberjunction/ng-testing@3.0.0
  - @memberjunction/ng-action-gallery@3.0.0
  - @memberjunction/ng-ai-test-harness@3.0.0
  - @memberjunction/ng-code-editor@3.0.0
  - @memberjunction/ng-container-directives@3.0.0
  - @memberjunction/ng-deep-diff@3.0.0
  - @memberjunction/ng-entity-relationship-diagram@3.0.0
  - @memberjunction/ng-entity-viewer@3.0.0
  - @memberjunction/ng-join-grid@3.0.0
  - @memberjunction/ng-notifications@3.0.0
  - @memberjunction/ng-shared-generic@3.0.0
  - @memberjunction/ng-tabstrip@3.0.0
  - @memberjunction/ng-timeline@3.0.0
  - @memberjunction/graphql-dataprovider@3.0.0
  - @memberjunction/core@3.0.0
  - @memberjunction/core-entities@3.0.0
  - @memberjunction/global@3.0.0
  - @memberjunction/templates-base-types@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [43df8f4]
- Updated dependencies [c00bd13]
  - @memberjunction/ng-entity-viewer@2.133.0
  - @memberjunction/core@2.133.0
  - @memberjunction/ng-base-forms@2.133.0
  - @memberjunction/ng-form-toolbar@2.133.0
  - @memberjunction/ng-user-view-grid@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/actions-base@2.133.0
  - @memberjunction/ng-base-application@2.133.0
  - @memberjunction/ng-link-directives@2.133.0
  - @memberjunction/ng-shared@2.133.0
  - @memberjunction/ng-testing@2.133.0
  - @memberjunction/ng-action-gallery@2.133.0
  - @memberjunction/ng-ai-test-harness@2.133.0
  - @memberjunction/ng-code-editor@2.133.0
  - @memberjunction/ng-container-directives@2.133.0
  - @memberjunction/ng-deep-diff@2.133.0
  - @memberjunction/ng-entity-relationship-diagram@2.133.0
  - @memberjunction/ng-join-grid@2.133.0
  - @memberjunction/ng-notifications@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/ng-timeline@2.133.0
  - @memberjunction/graphql-dataprovider@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/templates-base-types@2.133.0
  - @memberjunction/ng-tabstrip@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/actions-base@2.132.0
  - @memberjunction/ng-base-application@2.132.0
  - @memberjunction/ng-base-forms@2.132.0
  - @memberjunction/ng-form-toolbar@2.132.0
  - @memberjunction/ng-link-directives@2.132.0
  - @memberjunction/ng-shared@2.132.0
  - @memberjunction/ng-user-view-grid@2.132.0
  - @memberjunction/ng-testing@2.132.0
  - @memberjunction/ng-action-gallery@2.132.0
  - @memberjunction/ng-ai-test-harness@2.132.0
  - @memberjunction/ng-code-editor@2.132.0
  - @memberjunction/ng-container-directives@2.132.0
  - @memberjunction/ng-deep-diff@2.132.0
  - @memberjunction/ng-entity-relationship-diagram@2.132.0
  - @memberjunction/ng-join-grid@2.132.0
  - @memberjunction/ng-notifications@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/ng-timeline@2.132.0
  - @memberjunction/graphql-dataprovider@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/templates-base-types@2.132.0
  - @memberjunction/ng-tabstrip@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/actions-base@2.131.0
  - @memberjunction/ng-base-application@2.131.0
  - @memberjunction/ng-base-forms@2.131.0
  - @memberjunction/ng-form-toolbar@2.131.0
  - @memberjunction/ng-link-directives@2.131.0
  - @memberjunction/ng-shared@2.131.0
  - @memberjunction/ng-user-view-grid@2.131.0
  - @memberjunction/ng-testing@2.131.0
  - @memberjunction/ng-action-gallery@2.131.0
  - @memberjunction/ng-ai-test-harness@2.131.0
  - @memberjunction/ng-code-editor@2.131.0
  - @memberjunction/ng-container-directives@2.131.0
  - @memberjunction/ng-deep-diff@2.131.0
  - @memberjunction/ng-entity-relationship-diagram@2.131.0
  - @memberjunction/ng-join-grid@2.131.0
  - @memberjunction/ng-notifications@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/ng-timeline@2.131.0
  - @memberjunction/graphql-dataprovider@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/templates-base-types@2.131.0
  - @memberjunction/ng-tabstrip@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- 8884553: Complete v3.0 auth abstraction with MSAL token refresh, add Vertex AI support to DBAutoDoc, and fix Run Suite button in tab mode
- Updated dependencies [8884553]
  - @memberjunction/ng-testing@2.130.1
  - @memberjunction/ng-base-forms@2.130.1
  - @memberjunction/ng-form-toolbar@2.130.1
  - @memberjunction/ng-user-view-grid@2.130.1
  - @memberjunction/ai-engine-base@2.130.1
  - @memberjunction/ai@2.130.1
  - @memberjunction/ai-core-plus@2.130.1
  - @memberjunction/actions-base@2.130.1
  - @memberjunction/ng-base-application@2.130.1
  - @memberjunction/ng-link-directives@2.130.1
  - @memberjunction/ng-shared@2.130.1
  - @memberjunction/ng-action-gallery@2.130.1
  - @memberjunction/ng-ai-test-harness@2.130.1
  - @memberjunction/ng-code-editor@2.130.1
  - @memberjunction/ng-container-directives@2.130.1
  - @memberjunction/ng-deep-diff@2.130.1
  - @memberjunction/ng-entity-relationship-diagram@2.130.1
  - @memberjunction/ng-join-grid@2.130.1
  - @memberjunction/ng-notifications@2.130.1
  - @memberjunction/ng-shared-generic@2.130.1
  - @memberjunction/ng-tabstrip@2.130.1
  - @memberjunction/ng-timeline@2.130.1
  - @memberjunction/graphql-dataprovider@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/global@2.130.1
  - @memberjunction/templates-base-types@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
- Updated dependencies [c23d2b7]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/graphql-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ng-base-application@2.130.0
  - @memberjunction/ng-base-forms@2.130.0
  - @memberjunction/ng-shared@2.130.0
  - @memberjunction/ng-ai-test-harness@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/ng-user-view-grid@2.130.0
  - @memberjunction/ng-testing@2.130.0
  - @memberjunction/ng-notifications@2.130.0
  - @memberjunction/actions-base@2.130.0
  - @memberjunction/ng-form-toolbar@2.130.0
  - @memberjunction/ng-link-directives@2.130.0
  - @memberjunction/ng-action-gallery@2.130.0
  - @memberjunction/ng-code-editor@2.130.0
  - @memberjunction/ng-container-directives@2.130.0
  - @memberjunction/ng-deep-diff@2.130.0
  - @memberjunction/ng-entity-relationship-diagram@2.130.0
  - @memberjunction/ng-join-grid@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/ng-timeline@2.130.0
  - @memberjunction/templates-base-types@2.130.0
  - @memberjunction/ng-tabstrip@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c7e38aa: migration

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ng-entity-relationship-diagram@2.129.0
  - @memberjunction/graphql-dataprovider@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/actions-base@2.129.0
  - @memberjunction/ng-base-forms@2.129.0
  - @memberjunction/ng-form-toolbar@2.129.0
  - @memberjunction/ng-link-directives@2.129.0
  - @memberjunction/ng-shared@2.129.0
  - @memberjunction/ng-user-view-grid@2.129.0
  - @memberjunction/ng-testing@2.129.0
  - @memberjunction/ng-action-gallery@2.129.0
  - @memberjunction/ng-ai-test-harness@2.129.0
  - @memberjunction/ng-code-editor@2.129.0
  - @memberjunction/ng-container-directives@2.129.0
  - @memberjunction/ng-deep-diff@2.129.0
  - @memberjunction/ng-join-grid@2.129.0
  - @memberjunction/ng-notifications@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/ng-timeline@2.129.0
  - @memberjunction/templates-base-types@2.129.0
  - @memberjunction/ai@2.129.0
  - @memberjunction/ng-tabstrip@2.129.0

## 2.128.0

### Patch Changes

- f407abe: Add EffortLevel support to AIPromptModel with priority hierarchy and fix GPT 5.2 naming convention to align with standards
- Updated dependencies [f407abe]
- Updated dependencies [3dde14d]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-notifications@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/actions-base@2.128.0
  - @memberjunction/ng-base-forms@2.128.0
  - @memberjunction/ng-form-toolbar@2.128.0
  - @memberjunction/ng-link-directives@2.128.0
  - @memberjunction/ng-shared@2.128.0
  - @memberjunction/ng-user-view-grid@2.128.0
  - @memberjunction/ng-testing@2.128.0
  - @memberjunction/ng-action-gallery@2.128.0
  - @memberjunction/ng-ai-test-harness@2.128.0
  - @memberjunction/ng-code-editor@2.128.0
  - @memberjunction/ng-container-directives@2.128.0
  - @memberjunction/ng-deep-diff@2.128.0
  - @memberjunction/ng-join-grid@2.128.0
  - @memberjunction/ng-timeline@2.128.0
  - @memberjunction/graphql-dataprovider@2.128.0
  - @memberjunction/templates-base-types@2.128.0
  - @memberjunction/ng-tabstrip@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/graphql-dataprovider@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/actions-base@2.127.0
  - @memberjunction/ng-base-forms@2.127.0
  - @memberjunction/ng-form-toolbar@2.127.0
  - @memberjunction/ng-link-directives@2.127.0
  - @memberjunction/ng-shared@2.127.0
  - @memberjunction/ng-user-view-grid@2.127.0
  - @memberjunction/ng-testing@2.127.0
  - @memberjunction/ng-action-gallery@2.127.0
  - @memberjunction/ng-ai-test-harness@2.127.0
  - @memberjunction/ng-code-editor@2.127.0
  - @memberjunction/ng-container-directives@2.127.0
  - @memberjunction/ng-deep-diff@2.127.0
  - @memberjunction/ng-join-grid@2.127.0
  - @memberjunction/ng-notifications@2.127.0
  - @memberjunction/ng-timeline@2.127.0
  - @memberjunction/templates-base-types@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/ng-tabstrip@2.127.0

## 2.126.1

### Patch Changes

- Updated dependencies [d6ae2a0]
  - @memberjunction/graphql-dataprovider@2.126.1
  - @memberjunction/ng-shared@2.126.1
  - @memberjunction/ng-user-view-grid@2.126.1
  - @memberjunction/ng-testing@2.126.1
  - @memberjunction/ng-ai-test-harness@2.126.1
  - @memberjunction/ng-notifications@2.126.1
  - @memberjunction/ng-base-forms@2.126.1
  - @memberjunction/ng-form-toolbar@2.126.1
  - @memberjunction/ng-link-directives@2.126.1
  - @memberjunction/ng-join-grid@2.126.1
  - @memberjunction/ng-action-gallery@2.126.1
  - @memberjunction/ai-engine-base@2.126.1
  - @memberjunction/ai@2.126.1
  - @memberjunction/ai-core-plus@2.126.1
  - @memberjunction/actions-base@2.126.1
  - @memberjunction/ng-code-editor@2.126.1
  - @memberjunction/ng-container-directives@2.126.1
  - @memberjunction/ng-deep-diff@2.126.1
  - @memberjunction/ng-tabstrip@2.126.1
  - @memberjunction/ng-timeline@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/global@2.126.1
  - @memberjunction/templates-base-types@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/ng-base-forms@2.126.0
  - @memberjunction/ng-form-toolbar@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ng-user-view-grid@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/actions-base@2.126.0
  - @memberjunction/ng-link-directives@2.126.0
  - @memberjunction/ng-shared@2.126.0
  - @memberjunction/ng-testing@2.126.0
  - @memberjunction/ng-action-gallery@2.126.0
  - @memberjunction/ng-ai-test-harness@2.126.0
  - @memberjunction/ng-code-editor@2.126.0
  - @memberjunction/ng-container-directives@2.126.0
  - @memberjunction/ng-deep-diff@2.126.0
  - @memberjunction/ng-join-grid@2.126.0
  - @memberjunction/ng-notifications@2.126.0
  - @memberjunction/ng-timeline@2.126.0
  - @memberjunction/graphql-dataprovider@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/templates-base-types@2.126.0
  - @memberjunction/ng-tabstrip@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/graphql-dataprovider@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ng-user-view-grid@2.125.0
  - @memberjunction/ai-engine-base@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/actions-base@2.125.0
  - @memberjunction/ng-base-forms@2.125.0
  - @memberjunction/ng-form-toolbar@2.125.0
  - @memberjunction/ng-link-directives@2.125.0
  - @memberjunction/ng-shared@2.125.0
  - @memberjunction/ng-testing@2.125.0
  - @memberjunction/ng-action-gallery@2.125.0
  - @memberjunction/ng-ai-test-harness@2.125.0
  - @memberjunction/ng-code-editor@2.125.0
  - @memberjunction/ng-container-directives@2.125.0
  - @memberjunction/ng-deep-diff@2.125.0
  - @memberjunction/ng-join-grid@2.125.0
  - @memberjunction/ng-notifications@2.125.0
  - @memberjunction/ng-timeline@2.125.0
  - @memberjunction/templates-base-types@2.125.0
  - @memberjunction/ng-tabstrip@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [cabe329]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/actions-base@2.124.0
  - @memberjunction/ng-base-forms@2.124.0
  - @memberjunction/ng-form-toolbar@2.124.0
  - @memberjunction/ng-link-directives@2.124.0
  - @memberjunction/ng-shared@2.124.0
  - @memberjunction/ng-user-view-grid@2.124.0
  - @memberjunction/ng-testing@2.124.0
  - @memberjunction/ng-action-gallery@2.124.0
  - @memberjunction/ng-ai-test-harness@2.124.0
  - @memberjunction/ng-code-editor@2.124.0
  - @memberjunction/ng-container-directives@2.124.0
  - @memberjunction/ng-deep-diff@2.124.0
  - @memberjunction/ng-join-grid@2.124.0
  - @memberjunction/ng-notifications@2.124.0
  - @memberjunction/ng-timeline@2.124.0
  - @memberjunction/graphql-dataprovider@2.124.0
  - @memberjunction/templates-base-types@2.124.0
  - @memberjunction/ng-tabstrip@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-engine-base@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/actions-base@2.123.1
- @memberjunction/ng-base-forms@2.123.1
- @memberjunction/ng-form-toolbar@2.123.1
- @memberjunction/ng-link-directives@2.123.1
- @memberjunction/ng-shared@2.123.1
- @memberjunction/ng-user-view-grid@2.123.1
- @memberjunction/ng-testing@2.123.1
- @memberjunction/ng-action-gallery@2.123.1
- @memberjunction/ng-ai-test-harness@2.123.1
- @memberjunction/ng-code-editor@2.123.1
- @memberjunction/ng-container-directives@2.123.1
- @memberjunction/ng-deep-diff@2.123.1
- @memberjunction/ng-join-grid@2.123.1
- @memberjunction/ng-notifications@2.123.1
- @memberjunction/ng-tabstrip@2.123.1
- @memberjunction/ng-timeline@2.123.1
- @memberjunction/graphql-dataprovider@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/templates-base-types@2.123.1

## 2.123.0

### Minor Changes

- 0944f59: migrations

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/ng-timeline@2.123.0
  - @memberjunction/graphql-dataprovider@2.123.0
  - @memberjunction/ng-shared@2.123.0
  - @memberjunction/ng-user-view-grid@2.123.0
  - @memberjunction/ng-testing@2.123.0
  - @memberjunction/ng-ai-test-harness@2.123.0
  - @memberjunction/ng-notifications@2.123.0
  - @memberjunction/ng-form-toolbar@2.123.0
  - @memberjunction/ng-base-forms@2.123.0
  - @memberjunction/ng-link-directives@2.123.0
  - @memberjunction/ng-join-grid@2.123.0
  - @memberjunction/ng-action-gallery@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/actions-base@2.123.0
  - @memberjunction/ng-code-editor@2.123.0
  - @memberjunction/ng-container-directives@2.123.0
  - @memberjunction/ng-deep-diff@2.123.0
  - @memberjunction/ng-tabstrip@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/templates-base-types@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [3d763e9]
- Updated dependencies [81f0c44]
  - @memberjunction/graphql-dataprovider@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-ai-test-harness@2.122.2
  - @memberjunction/ng-base-forms@2.122.2
  - @memberjunction/ng-code-editor@2.122.2
  - @memberjunction/ng-container-directives@2.122.2
  - @memberjunction/ng-deep-diff@2.122.2
  - @memberjunction/ng-form-toolbar@2.122.2
  - @memberjunction/ng-join-grid@2.122.2
  - @memberjunction/ng-shared@2.122.2
  - @memberjunction/ng-timeline@2.122.2
  - @memberjunction/ng-user-view-grid@2.122.2
  - @memberjunction/ng-testing@2.122.2
  - @memberjunction/ng-notifications@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/actions-base@2.122.2
  - @memberjunction/ng-action-gallery@2.122.2
  - @memberjunction/templates-base-types@2.122.2
  - @memberjunction/ng-tabstrip@2.122.2
  - @memberjunction/ng-link-directives@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- 699a480: Fix missing @memberjunction dependencies in 24 Angular packages
- Updated dependencies [699a480]
  - @memberjunction/ng-action-gallery@2.122.1
  - @memberjunction/ng-ai-test-harness@2.122.1
  - @memberjunction/ng-base-forms@2.122.1
  - @memberjunction/ng-form-toolbar@2.122.1
  - @memberjunction/ng-join-grid@2.122.1
  - @memberjunction/ng-shared@2.122.1
  - @memberjunction/ng-testing@2.122.1
  - @memberjunction/ng-user-view-grid@2.122.1
  - @memberjunction/ng-link-directives@2.122.1
  - @memberjunction/ng-timeline@2.122.1
  - @memberjunction/ai-engine-base@2.122.1
  - @memberjunction/ai@2.122.1
  - @memberjunction/ai-core-plus@2.122.1
  - @memberjunction/actions-base@2.122.1
  - @memberjunction/ng-code-editor@2.122.1
  - @memberjunction/ng-container-directives@2.122.1
  - @memberjunction/ng-deep-diff@2.122.1
  - @memberjunction/ng-notifications@2.122.1
  - @memberjunction/ng-tabstrip@2.122.1
  - @memberjunction/graphql-dataprovider@2.122.1
  - @memberjunction/core@2.122.1
  - @memberjunction/core-entities@2.122.1
  - @memberjunction/global@2.122.1
  - @memberjunction/templates-base-types@2.122.1

## 2.122.0

### Minor Changes

- c989c45: migration

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-engine-base@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/actions-base@2.122.0
  - @memberjunction/ng-base-forms@2.122.0
  - @memberjunction/ng-form-toolbar@2.122.0
  - @memberjunction/ng-testing@2.122.0
  - @memberjunction/ng-action-gallery@2.122.0
  - @memberjunction/ng-ai-test-harness@2.122.0
  - @memberjunction/ng-code-editor@2.122.0
  - @memberjunction/ng-container-directives@2.122.0
  - @memberjunction/ng-deep-diff@2.122.0
  - @memberjunction/ng-join-grid@2.122.0
  - @memberjunction/ng-timeline@2.122.0
  - @memberjunction/ng-tabstrip@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai-engine-base@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/actions-base@2.121.0
  - @memberjunction/ng-base-forms@2.121.0
  - @memberjunction/ng-form-toolbar@2.121.0
  - @memberjunction/ng-testing@2.121.0
  - @memberjunction/ng-action-gallery@2.121.0
  - @memberjunction/ng-ai-test-harness@2.121.0
  - @memberjunction/ng-code-editor@2.121.0
  - @memberjunction/ng-container-directives@2.121.0
  - @memberjunction/ng-deep-diff@2.121.0
  - @memberjunction/ng-join-grid@2.121.0
  - @memberjunction/ng-timeline@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/ng-tabstrip@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- 3074b66: Add agent run auditing and debugging tools, enhance AI agent execution history with search and pagination, improve query parameter extraction and validation, and add linter validation for missing query names
- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-engine-base@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/actions-base@2.120.0
  - @memberjunction/ng-base-forms@2.120.0
  - @memberjunction/ng-form-toolbar@2.120.0
  - @memberjunction/ng-testing@2.120.0
  - @memberjunction/ng-action-gallery@2.120.0
  - @memberjunction/ng-ai-test-harness@2.120.0
  - @memberjunction/ng-code-editor@2.120.0
  - @memberjunction/ng-container-directives@2.120.0
  - @memberjunction/ng-deep-diff@2.120.0
  - @memberjunction/ng-join-grid@2.120.0
  - @memberjunction/ng-timeline@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/ng-tabstrip@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Minor Changes

- 62790f4: migration

### Patch Changes

- Updated dependencies [7dd7cca]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/ng-testing@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-engine-base@2.119.0
  - @memberjunction/actions-base@2.119.0
  - @memberjunction/ng-base-forms@2.119.0
  - @memberjunction/ng-form-toolbar@2.119.0
  - @memberjunction/ng-action-gallery@2.119.0
  - @memberjunction/ng-ai-test-harness@2.119.0
  - @memberjunction/ng-code-editor@2.119.0
  - @memberjunction/ng-container-directives@2.119.0
  - @memberjunction/ng-deep-diff@2.119.0
  - @memberjunction/ng-join-grid@2.119.0
  - @memberjunction/ng-timeline@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/ng-tabstrip@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 264c57a: migration
- 096ece6: migration

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ai-engine-base@2.118.0
  - @memberjunction/actions-base@2.118.0
  - @memberjunction/ng-action-gallery@2.118.0
  - @memberjunction/ng-ai-test-harness@2.118.0
  - @memberjunction/ng-code-editor@2.118.0
  - @memberjunction/ng-join-grid@2.118.0
  - @memberjunction/ng-timeline@2.118.0
  - @memberjunction/ng-base-forms@2.118.0
  - @memberjunction/ng-form-toolbar@2.118.0
  - @memberjunction/ng-container-directives@2.118.0
  - @memberjunction/ng-deep-diff@2.118.0
  - @memberjunction/ng-tabstrip@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- d21eadd: tweaking codegen for better and cleaner UX
- Updated dependencies [8c092ec]
- Updated dependencies [d21eadd]
  - @memberjunction/core@2.117.0
  - @memberjunction/ng-form-toolbar@2.117.0
  - @memberjunction/ai-engine-base@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/actions-base@2.117.0
  - @memberjunction/ng-base-forms@2.117.0
  - @memberjunction/ng-action-gallery@2.117.0
  - @memberjunction/ng-ai-test-harness@2.117.0
  - @memberjunction/ng-code-editor@2.117.0
  - @memberjunction/ng-container-directives@2.117.0
  - @memberjunction/ng-deep-diff@2.117.0
  - @memberjunction/ng-join-grid@2.117.0
  - @memberjunction/ng-timeline@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/ng-tabstrip@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Minor Changes

- cff85c7: migration

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [88f60e7]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/actions-base@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-engine-base@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/ng-base-forms@2.116.0
  - @memberjunction/ng-form-toolbar@2.116.0
  - @memberjunction/ng-action-gallery@2.116.0
  - @memberjunction/ng-ai-test-harness@2.116.0
  - @memberjunction/ng-code-editor@2.116.0
  - @memberjunction/ng-container-directives@2.116.0
  - @memberjunction/ng-deep-diff@2.116.0
  - @memberjunction/ng-join-grid@2.116.0
  - @memberjunction/ng-timeline@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/ng-tabstrip@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ai-engine-base@2.115.0
- @memberjunction/ai-core-plus@2.115.0
- @memberjunction/actions-base@2.115.0
- @memberjunction/ng-base-forms@2.115.0
- @memberjunction/ng-form-toolbar@2.115.0
- @memberjunction/ng-action-gallery@2.115.0
- @memberjunction/ng-ai-test-harness@2.115.0
- @memberjunction/ng-code-editor@2.115.0
- @memberjunction/ng-container-directives@2.115.0
- @memberjunction/ng-deep-diff@2.115.0
- @memberjunction/ng-join-grid@2.115.0
- @memberjunction/ng-tabstrip@2.115.0
- @memberjunction/ng-timeline@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai-engine-base@2.114.0
- @memberjunction/ai-core-plus@2.114.0
- @memberjunction/actions-base@2.114.0
- @memberjunction/ng-base-forms@2.114.0
- @memberjunction/ng-form-toolbar@2.114.0
- @memberjunction/ng-action-gallery@2.114.0
- @memberjunction/ng-ai-test-harness@2.114.0
- @memberjunction/ng-code-editor@2.114.0
- @memberjunction/ng-container-directives@2.114.0
- @memberjunction/ng-deep-diff@2.114.0
- @memberjunction/ng-join-grid@2.114.0
- @memberjunction/ng-tabstrip@2.114.0
- @memberjunction/ng-timeline@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-engine-base@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/actions-base@2.113.2
  - @memberjunction/ng-base-forms@2.113.2
  - @memberjunction/ng-form-toolbar@2.113.2
  - @memberjunction/ng-action-gallery@2.113.2
  - @memberjunction/ng-ai-test-harness@2.113.2
  - @memberjunction/ng-code-editor@2.113.2
  - @memberjunction/ng-container-directives@2.113.2
  - @memberjunction/ng-deep-diff@2.113.2
  - @memberjunction/ng-join-grid@2.113.2
  - @memberjunction/ng-timeline@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/ng-tabstrip@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Minor Changes

- 2ac2120: migration

### Patch Changes

- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/ai-engine-base@2.112.0
  - @memberjunction/actions-base@2.112.0
  - @memberjunction/ng-base-forms@2.112.0
  - @memberjunction/ng-form-toolbar@2.112.0
  - @memberjunction/ng-code-editor@2.112.0
  - @memberjunction/ng-container-directives@2.112.0
  - @memberjunction/ng-deep-diff@2.112.0
  - @memberjunction/ng-join-grid@2.112.0
  - @memberjunction/ng-timeline@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ng-ai-test-harness@2.112.0
  - @memberjunction/ng-action-gallery@2.112.0
  - @memberjunction/ng-tabstrip@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-engine-base@2.110.1
- @memberjunction/ai-core-plus@2.110.1
- @memberjunction/actions-base@2.110.1
- @memberjunction/ng-base-forms@2.110.1
- @memberjunction/ng-form-toolbar@2.110.1
- @memberjunction/ng-action-gallery@2.110.1
- @memberjunction/ng-ai-test-harness@2.110.1
- @memberjunction/ng-code-editor@2.110.1
- @memberjunction/ng-container-directives@2.110.1
- @memberjunction/ng-deep-diff@2.110.1
- @memberjunction/ng-join-grid@2.110.1
- @memberjunction/ng-tabstrip@2.110.1
- @memberjunction/ng-timeline@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- d2d7ab9: migration

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/ai-engine-base@2.110.0
  - @memberjunction/actions-base@2.110.0
  - @memberjunction/ng-action-gallery@2.110.0
  - @memberjunction/ng-ai-test-harness@2.110.0
  - @memberjunction/ng-code-editor@2.110.0
  - @memberjunction/ng-join-grid@2.110.0
  - @memberjunction/ng-timeline@2.110.0
  - @memberjunction/ng-base-forms@2.110.0
  - @memberjunction/ng-form-toolbar@2.110.0
  - @memberjunction/ng-container-directives@2.110.0
  - @memberjunction/ng-deep-diff@2.110.0
  - @memberjunction/ng-tabstrip@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/ng-form-toolbar@2.109.0
  - @memberjunction/ai-engine-base@2.109.0
  - @memberjunction/actions-base@2.109.0
  - @memberjunction/ng-action-gallery@2.109.0
  - @memberjunction/ng-ai-test-harness@2.109.0
  - @memberjunction/ng-code-editor@2.109.0
  - @memberjunction/ng-join-grid@2.109.0
  - @memberjunction/ng-timeline@2.109.0
  - @memberjunction/ng-base-forms@2.109.0
  - @memberjunction/ng-container-directives@2.109.0
  - @memberjunction/ng-deep-diff@2.109.0
  - @memberjunction/ng-tabstrip@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- 56dc09f: Artifact Collection UI + Collection Permission Migration
- 656d86c: Migration

### Patch Changes

- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/actions-base@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ai-engine-base@2.108.0
  - @memberjunction/ng-action-gallery@2.108.0
  - @memberjunction/ng-ai-test-harness@2.108.0
  - @memberjunction/ng-code-editor@2.108.0
  - @memberjunction/ng-join-grid@2.108.0
  - @memberjunction/ng-timeline@2.108.0
  - @memberjunction/ng-form-toolbar@2.108.0
  - @memberjunction/ng-base-forms@2.108.0
  - @memberjunction/ng-container-directives@2.108.0
  - @memberjunction/ng-deep-diff@2.108.0
  - @memberjunction/ng-tabstrip@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai-engine-base@2.107.0
- @memberjunction/ai-core-plus@2.107.0
- @memberjunction/actions-base@2.107.0
- @memberjunction/ng-base-forms@2.107.0
- @memberjunction/ng-form-toolbar@2.107.0
- @memberjunction/ng-action-gallery@2.107.0
- @memberjunction/ng-ai-test-harness@2.107.0
- @memberjunction/ng-code-editor@2.107.0
- @memberjunction/ng-container-directives@2.107.0
- @memberjunction/ng-deep-diff@2.107.0
- @memberjunction/ng-join-grid@2.107.0
- @memberjunction/ng-tabstrip@2.107.0
- @memberjunction/ng-timeline@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ng-form-toolbar@2.106.0
- @memberjunction/ai-engine-base@2.106.0
- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/actions-base@2.106.0
- @memberjunction/ng-base-forms@2.106.0
- @memberjunction/ng-action-gallery@2.106.0
- @memberjunction/ng-ai-test-harness@2.106.0
- @memberjunction/ng-code-editor@2.106.0
- @memberjunction/ng-container-directives@2.106.0
- @memberjunction/ng-deep-diff@2.106.0
- @memberjunction/ng-join-grid@2.106.0
- @memberjunction/ng-tabstrip@2.106.0
- @memberjunction/ng-timeline@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 1c3a1b6: migration

### Patch Changes

- d66070e: migration
- Updated dependencies [4807f35]
- Updated dependencies [1d7a841]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai-engine-base@2.105.0
  - @memberjunction/actions-base@2.105.0
  - @memberjunction/ng-action-gallery@2.105.0
  - @memberjunction/ng-ai-test-harness@2.105.0
  - @memberjunction/ng-code-editor@2.105.0
  - @memberjunction/ng-join-grid@2.105.0
  - @memberjunction/ng-timeline@2.105.0
  - @memberjunction/ng-form-toolbar@2.105.0
  - @memberjunction/ng-base-forms@2.105.0
  - @memberjunction/ng-container-directives@2.105.0
  - @memberjunction/ng-deep-diff@2.105.0
  - @memberjunction/ng-tabstrip@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- 7980171: entity name corrections

  ### Features
  - **Resizable & Draggable Dialogs**: Converted all AI Agent dialog
    types from DialogService to WindowService
    - Added corner resizing and drag-and-drop movement capabilities for
      all 7 dialog types
    - Fixed z-index layering issues to render above MJExplorer banner
    - Improved dialog styling with enhanced CSS and layout fixes
  - **Enhanced AI Agent Form**: Major improvements to
    ai-agent-form.component with expanded HTML layout and comprehensive
    styling

  ### Bug Fixes
  - **Critical Entity Name Corrections**: Fixed entity references to use
    proper "MJ: " prefix for newer core entities
    - Fixed 'AI Agent Prompts' → 'MJ: AI Agent Prompts' (3 occurrences)
    - Fixed 'AI Agent Runs' → 'MJ: AI Agent Runs' (4 occurrences)
    - Ensures all entity references work correctly with the
      MemberJunction framework and prevents runtime errors

  ### Documentation
  - Updated CLAUDE.md with comprehensive entity naming guidelines
  - Added complete list of all 23 core entities requiring "MJ: " prefix
  - Added warning section with code examples to prevent future entity
    naming issues

  ### Impact
  - **Enhanced User Experience**: All AI Agent dialogs now provide
    modern, resizable, and draggable interfaces
  - **Database Compatibility**: Ensures proper entity schema compliance
    across all AI services
  - **Developer Guidance**: Comprehensive documentation prevents future
    entity naming conflicts

- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
- Updated dependencies [8f2a4fa]
  - @memberjunction/global@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/ng-ai-test-harness@2.104.0
  - @memberjunction/ai-engine-base@2.104.0
  - @memberjunction/actions-base@2.104.0
  - @memberjunction/ng-base-forms@2.104.0
  - @memberjunction/ng-form-toolbar@2.104.0
  - @memberjunction/ng-code-editor@2.104.0
  - @memberjunction/ng-container-directives@2.104.0
  - @memberjunction/ng-deep-diff@2.104.0
  - @memberjunction/ng-join-grid@2.104.0
  - @memberjunction/ng-timeline@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/ng-action-gallery@2.104.0
  - @memberjunction/ng-tabstrip@2.104.0

## 2.103.0

### Minor Changes

- 3ba01de: migration

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
- Updated dependencies [239ae00]
  - @memberjunction/core@2.103.0
  - @memberjunction/ng-container-directives@2.103.0
  - @memberjunction/ng-ai-test-harness@2.103.0
  - @memberjunction/ng-action-gallery@2.103.0
  - @memberjunction/ng-form-toolbar@2.103.0
  - @memberjunction/ng-base-forms@2.103.0
  - @memberjunction/ng-code-editor@2.103.0
  - @memberjunction/ng-deep-diff@2.103.0
  - @memberjunction/ng-join-grid@2.103.0
  - @memberjunction/ng-tabstrip@2.103.0
  - @memberjunction/ng-timeline@2.103.0
  - @memberjunction/ai-engine-base@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/actions-base@2.103.0
  - @memberjunction/ai-core-plus@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/ai-engine-base@2.100.3
- @memberjunction/ai-core-plus@2.100.3
- @memberjunction/actions-base@2.100.3
- @memberjunction/ng-action-gallery@2.100.3
- @memberjunction/ng-ai-test-harness@2.100.3
- @memberjunction/ng-code-editor@2.100.3
- @memberjunction/ng-join-grid@2.100.3
- @memberjunction/ng-timeline@2.100.3
- @memberjunction/ng-form-toolbar@2.100.3
- @memberjunction/ng-base-forms@2.100.3
- @memberjunction/ng-container-directives@2.100.3
- @memberjunction/ng-deep-diff@2.100.3
- @memberjunction/ng-tabstrip@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai-engine-base@2.100.2
- @memberjunction/ai-core-plus@2.100.2
- @memberjunction/actions-base@2.100.2
- @memberjunction/ng-base-forms@2.100.2
- @memberjunction/ng-form-toolbar@2.100.2
- @memberjunction/ng-action-gallery@2.100.2
- @memberjunction/ng-ai-test-harness@2.100.2
- @memberjunction/ng-code-editor@2.100.2
- @memberjunction/ng-container-directives@2.100.2
- @memberjunction/ng-deep-diff@2.100.2
- @memberjunction/ng-join-grid@2.100.2
- @memberjunction/ng-tabstrip@2.100.2
- @memberjunction/ng-timeline@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai-engine-base@2.100.1
- @memberjunction/ai-core-plus@2.100.1
- @memberjunction/actions-base@2.100.1
- @memberjunction/ng-base-forms@2.100.1
- @memberjunction/ng-form-toolbar@2.100.1
- @memberjunction/ng-action-gallery@2.100.1
- @memberjunction/ng-ai-test-harness@2.100.1
- @memberjunction/ng-code-editor@2.100.1
- @memberjunction/ng-container-directives@2.100.1
- @memberjunction/ng-deep-diff@2.100.1
- @memberjunction/ng-join-grid@2.100.1
- @memberjunction/ng-tabstrip@2.100.1
- @memberjunction/ng-timeline@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ai-engine-base@2.100.0
  - @memberjunction/ai-core-plus@2.100.0
  - @memberjunction/actions-base@2.100.0
  - @memberjunction/ng-base-forms@2.100.0
  - @memberjunction/ng-form-toolbar@2.100.0
  - @memberjunction/ng-action-gallery@2.100.0
  - @memberjunction/ng-ai-test-harness@2.100.0
  - @memberjunction/ng-code-editor@2.100.0
  - @memberjunction/ng-container-directives@2.100.0
  - @memberjunction/ng-deep-diff@2.100.0
  - @memberjunction/ng-join-grid@2.100.0
  - @memberjunction/ng-timeline@2.100.0
  - @memberjunction/ng-tabstrip@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Minor Changes

- eb7677d: feat(ai-agents): Add ChatHandlingOption for flexible Chat step
  handling
  - Add ChatHandlingOption field to AIAgent table with values:
    Success, Failed, Retry
  - Implement Chat step remapping in
    BaseAgent.validateChatNextStep() based on agent configuration
  - Fix executeChatStep to mark Chat steps as successful
    (they're valid terminal states for user interaction)
  - Remove complex sub-agent Chat handling from FlowAgentType in
    favor of agent-level configuration
  - Enables agents like Requirements Expert to request user
    clarification without breaking parent flows
  - Parent agents can control whether Chat steps should continue
    (Success), fail (Failed), or retry (Retry)

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ai-engine-base@2.99.0
  - @memberjunction/ai-core-plus@2.99.0
  - @memberjunction/actions-base@2.99.0
  - @memberjunction/ng-action-gallery@2.99.0
  - @memberjunction/ng-ai-test-harness@2.99.0
  - @memberjunction/ng-code-editor@2.99.0
  - @memberjunction/ng-join-grid@2.99.0
  - @memberjunction/ng-timeline@2.99.0
  - @memberjunction/ng-base-forms@2.99.0
  - @memberjunction/ng-form-toolbar@2.99.0
  - @memberjunction/ng-container-directives@2.99.0
  - @memberjunction/ng-deep-diff@2.99.0
  - @memberjunction/ng-tabstrip@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ng-form-toolbar@2.98.0
- @memberjunction/ai-engine-base@2.98.0
- @memberjunction/ai-core-plus@2.98.0
- @memberjunction/actions-base@2.98.0
- @memberjunction/ng-base-forms@2.98.0
- @memberjunction/ng-action-gallery@2.98.0
- @memberjunction/ng-ai-test-harness@2.98.0
- @memberjunction/ng-code-editor@2.98.0
- @memberjunction/ng-container-directives@2.98.0
- @memberjunction/ng-deep-diff@2.98.0
- @memberjunction/ng-join-grid@2.98.0
- @memberjunction/ng-tabstrip@2.98.0
- @memberjunction/ng-timeline@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/ai-engine-base@2.97.0
- @memberjunction/ai-core-plus@2.97.0
- @memberjunction/actions-base@2.97.0
- @memberjunction/ng-action-gallery@2.97.0
- @memberjunction/ng-ai-test-harness@2.97.0
- @memberjunction/ng-code-editor@2.97.0
- @memberjunction/ng-join-grid@2.97.0
- @memberjunction/ng-timeline@2.97.0
- @memberjunction/ng-form-toolbar@2.97.0
- @memberjunction/ng-base-forms@2.97.0
- @memberjunction/ng-container-directives@2.97.0
- @memberjunction/ng-deep-diff@2.97.0
- @memberjunction/ng-tabstrip@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- ae3c0e2: optimize agent form
- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/ai-engine-base@2.96.0
  - @memberjunction/ai-core-plus@2.96.0
  - @memberjunction/actions-base@2.96.0
  - @memberjunction/ng-base-forms@2.96.0
  - @memberjunction/ng-form-toolbar@2.96.0
  - @memberjunction/ng-action-gallery@2.96.0
  - @memberjunction/ng-ai-test-harness@2.96.0
  - @memberjunction/ng-code-editor@2.96.0
  - @memberjunction/ng-container-directives@2.96.0
  - @memberjunction/ng-deep-diff@2.96.0
  - @memberjunction/ng-join-grid@2.96.0
  - @memberjunction/ng-timeline@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/ng-tabstrip@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/ai-engine-base@2.95.0
  - @memberjunction/ai-core-plus@2.95.0
  - @memberjunction/ng-base-forms@2.95.0
  - @memberjunction/ng-form-toolbar@2.95.0
  - @memberjunction/ng-action-gallery@2.95.0
  - @memberjunction/ng-ai-test-harness@2.95.0
  - @memberjunction/ng-code-editor@2.95.0
  - @memberjunction/ng-container-directives@2.95.0
  - @memberjunction/ng-deep-diff@2.95.0
  - @memberjunction/ng-join-grid@2.95.0
  - @memberjunction/ng-timeline@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/ng-tabstrip@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/ai-engine-base@2.94.0
- @memberjunction/ai-core-plus@2.94.0
- @memberjunction/ng-action-gallery@2.94.0
- @memberjunction/ng-ai-test-harness@2.94.0
- @memberjunction/ng-code-editor@2.94.0
- @memberjunction/ng-join-grid@2.94.0
- @memberjunction/ng-timeline@2.94.0
- @memberjunction/ng-form-toolbar@2.94.0
- @memberjunction/ng-base-forms@2.94.0
- @memberjunction/ng-container-directives@2.94.0
- @memberjunction/ng-deep-diff@2.94.0
- @memberjunction/ng-tabstrip@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [bfcd737]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/ng-ai-test-harness@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ai-engine-base@2.93.0
  - @memberjunction/ai-core-plus@2.93.0
  - @memberjunction/ng-base-forms@2.93.0
  - @memberjunction/ng-form-toolbar@2.93.0
  - @memberjunction/ng-action-gallery@2.93.0
  - @memberjunction/ng-code-editor@2.93.0
  - @memberjunction/ng-container-directives@2.93.0
  - @memberjunction/ng-deep-diff@2.93.0
  - @memberjunction/ng-join-grid@2.93.0
  - @memberjunction/ng-timeline@2.93.0
  - @memberjunction/ng-tabstrip@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Minor Changes

- b303b84: migrations

### Patch Changes

- Updated dependencies [b303b84]
- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/ng-ai-test-harness@2.92.0
  - @memberjunction/ng-code-editor@2.92.0
  - @memberjunction/core@2.92.0
  - @memberjunction/ng-action-gallery@2.92.0
  - @memberjunction/ng-base-forms@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/ai-engine-base@2.92.0
  - @memberjunction/ai-core-plus@2.92.0
  - @memberjunction/ng-form-toolbar@2.92.0
  - @memberjunction/ng-container-directives@2.92.0
  - @memberjunction/ng-deep-diff@2.92.0
  - @memberjunction/ng-join-grid@2.92.0
  - @memberjunction/ng-timeline@2.92.0
  - @memberjunction/ng-tabstrip@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Minor Changes

- 6476d74: migrations

### Patch Changes

- 6b77f80: Summary:
  feat: Add Action Result Codes management to Action form

  Detailed Description:
  Added complete CRUD functionality for managing Action Result Codes directly within the Action form component. Users can now add, edit, and
  delete result codes that define possible execution outcomes for Actions.

  Key Changes:
  - Created ActionResultCodeDialogComponent for adding/editing result codes with fields for code, description, and success status
  - Added interactive UI with hover effects, edit/delete buttons, and visual indicators for success/failure codes
  - Implemented proper transaction support using InternalSaveRecord pattern to save Action, Params, and Result Codes atomically
  - Fixed critical issue where loadResultCodes() was missing ResultType: 'entity_object', causing entity operations to fail
  - Updated PopulatePendingRecords to track Result Codes alongside Action Params for proper save/delete operations
  - Added Result Code management methods (addResultCode, editResultCode, deleteResultCode) following the same pattern as Action Params

  Impact:
  This enhancement allows developers to define and manage all possible result codes for their Actions directly in the UI, improving the Action
  development workflow and ensuring proper error handling patterns are documented.

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/ng-code-editor@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/ai-engine-base@2.91.0
  - @memberjunction/ai-core-plus@2.91.0
  - @memberjunction/ng-base-forms@2.91.0
  - @memberjunction/ng-form-toolbar@2.91.0
  - @memberjunction/ng-action-gallery@2.91.0
  - @memberjunction/ng-ai-test-harness@2.91.0
  - @memberjunction/ng-container-directives@2.91.0
  - @memberjunction/ng-deep-diff@2.91.0
  - @memberjunction/ng-join-grid@2.91.0
  - @memberjunction/ng-timeline@2.91.0
  - @memberjunction/ng-tabstrip@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Minor Changes

- d5d26d7: migration

### Patch Changes

- 2cb05a1: various tweaks
- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/ai-engine-base@2.90.0
  - @memberjunction/ai-core-plus@2.90.0
  - @memberjunction/ng-base-forms@2.90.0
  - @memberjunction/ng-form-toolbar@2.90.0
  - @memberjunction/ng-action-gallery@2.90.0
  - @memberjunction/ng-ai-test-harness@2.90.0
  - @memberjunction/ng-code-editor@2.90.0
  - @memberjunction/ng-container-directives@2.90.0
  - @memberjunction/ng-deep-diff@2.90.0
  - @memberjunction/ng-join-grid@2.90.0
  - @memberjunction/ng-timeline@2.90.0
  - @memberjunction/ng-tabstrip@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/ai-core-plus@2.89.0
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/ai-engine-base@2.89.0
  - @memberjunction/ng-action-gallery@2.89.0
  - @memberjunction/ng-ai-test-harness@2.89.0
  - @memberjunction/ng-code-editor@2.89.0
  - @memberjunction/ng-join-grid@2.89.0
  - @memberjunction/ng-timeline@2.89.0
  - @memberjunction/ng-form-toolbar@2.89.0
  - @memberjunction/ng-base-forms@2.89.0
  - @memberjunction/ng-container-directives@2.89.0
  - @memberjunction/ng-deep-diff@2.89.0
  - @memberjunction/ng-tabstrip@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/ng-ai-test-harness@2.88.0
  - @memberjunction/ai-engine-base@2.88.0
  - @memberjunction/ai-core-plus@2.88.0
  - @memberjunction/ng-action-gallery@2.88.0
  - @memberjunction/ng-code-editor@2.88.0
  - @memberjunction/ng-join-grid@2.88.0
  - @memberjunction/ng-timeline@2.88.0
  - @memberjunction/ng-form-toolbar@2.88.0
  - @memberjunction/ng-base-forms@2.88.0
  - @memberjunction/ng-container-directives@2.88.0
  - @memberjunction/ng-deep-diff@2.88.0
  - @memberjunction/ng-tabstrip@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/ai-engine-base@2.87.0
  - @memberjunction/ai-core-plus@2.87.0
  - @memberjunction/ng-base-forms@2.87.0
  - @memberjunction/ng-form-toolbar@2.87.0
  - @memberjunction/ng-action-gallery@2.87.0
  - @memberjunction/ng-ai-test-harness@2.87.0
  - @memberjunction/ng-code-editor@2.87.0
  - @memberjunction/ng-container-directives@2.87.0
  - @memberjunction/ng-deep-diff@2.87.0
  - @memberjunction/ng-join-grid@2.87.0
  - @memberjunction/ng-timeline@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/ng-tabstrip@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/ai-engine-base@2.86.0
  - @memberjunction/ai-core-plus@2.86.0
  - @memberjunction/ng-action-gallery@2.86.0
  - @memberjunction/ng-ai-test-harness@2.86.0
  - @memberjunction/ng-code-editor@2.86.0
  - @memberjunction/ng-join-grid@2.86.0
  - @memberjunction/ng-timeline@2.86.0
  - @memberjunction/ng-form-toolbar@2.86.0
  - @memberjunction/ng-base-forms@2.86.0
  - @memberjunction/ng-container-directives@2.86.0
  - @memberjunction/ng-deep-diff@2.86.0
  - @memberjunction/ng-tabstrip@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/ai-engine-base@2.85.0
  - @memberjunction/ai-core-plus@2.85.0
  - @memberjunction/ng-action-gallery@2.85.0
  - @memberjunction/ng-ai-test-harness@2.85.0
  - @memberjunction/ng-code-editor@2.85.0
  - @memberjunction/ng-join-grid@2.85.0
  - @memberjunction/ng-timeline@2.85.0
  - @memberjunction/ng-form-toolbar@2.85.0
  - @memberjunction/ng-base-forms@2.85.0
  - @memberjunction/ng-container-directives@2.85.0
  - @memberjunction/ng-deep-diff@2.85.0
  - @memberjunction/ng-tabstrip@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/ng-ai-test-harness@2.84.0
  - @memberjunction/ai-engine-base@2.84.0
  - @memberjunction/ai-core-plus@2.84.0
  - @memberjunction/ng-base-forms@2.84.0
  - @memberjunction/ng-form-toolbar@2.84.0
  - @memberjunction/ng-action-gallery@2.84.0
  - @memberjunction/ng-code-editor@2.84.0
  - @memberjunction/ng-container-directives@2.84.0
  - @memberjunction/ng-deep-diff@2.84.0
  - @memberjunction/ng-join-grid@2.84.0
  - @memberjunction/ng-timeline@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/ng-tabstrip@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
  - @memberjunction/core@2.83.0
  - @memberjunction/ai-engine-base@2.83.0
  - @memberjunction/ai-core-plus@2.83.0
  - @memberjunction/ng-base-forms@2.83.0
  - @memberjunction/ng-form-toolbar@2.83.0
  - @memberjunction/ng-action-gallery@2.83.0
  - @memberjunction/ng-ai-test-harness@2.83.0
  - @memberjunction/ng-code-editor@2.83.0
  - @memberjunction/ng-container-directives@2.83.0
  - @memberjunction/ng-deep-diff@2.83.0
  - @memberjunction/ng-join-grid@2.83.0
  - @memberjunction/ng-timeline@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/ng-tabstrip@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Minor Changes

- 2186d7b: migration file for effort level stuff
- 975e8d1: migration

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/ai-core-plus@2.82.0
  - @memberjunction/ng-ai-test-harness@2.82.0
  - @memberjunction/ai-engine-base@2.82.0
  - @memberjunction/ng-action-gallery@2.82.0
  - @memberjunction/ng-code-editor@2.82.0
  - @memberjunction/ng-join-grid@2.82.0
  - @memberjunction/ng-timeline@2.82.0
  - @memberjunction/ng-form-toolbar@2.82.0
  - @memberjunction/ng-base-forms@2.82.0
  - @memberjunction/ng-container-directives@2.82.0
  - @memberjunction/ng-deep-diff@2.82.0
  - @memberjunction/ng-tabstrip@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Minor Changes

- e623f99: added DisplayName to Entities entity

### Patch Changes

- 95491fa: bug fixes
- 6d2d478: feat: AI Agent UI improvements and server-side context fixes
  - Enhanced AI Agent dialogs with resizable and draggable functionality
    using Kendo UI Window component
  - Improved dialog positioning with consistent center placement and proper
    container context
  - Fixed prompt selector in AI Agent form for better user experience
  - Added missing contextUser parameter to GetEntityObject calls in
    BaseResolver for proper multi-user isolation
  - Fixed createRecordAccessAuditLogRecord calls in generated resolvers to
    include provider argument
  - Added JSDoc documentation to ViewInfo class properties for better code
    documentation
  - Applied consistent dialog styling across all AI Agent management
    components

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/ai-engine-base@2.81.0
  - @memberjunction/ai-core-plus@2.81.0
  - @memberjunction/ng-base-forms@2.81.0
  - @memberjunction/ng-form-toolbar@2.81.0
  - @memberjunction/ng-action-gallery@2.81.0
  - @memberjunction/ng-ai-test-harness@2.81.0
  - @memberjunction/ng-code-editor@2.81.0
  - @memberjunction/ng-container-directives@2.81.0
  - @memberjunction/ng-deep-diff@2.81.0
  - @memberjunction/ng-join-grid@2.81.0
  - @memberjunction/ng-timeline@2.81.0
  - @memberjunction/ng-tabstrip@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai-engine-base@2.80.1
- @memberjunction/ai-core-plus@2.80.1
- @memberjunction/ng-base-forms@2.80.1
- @memberjunction/ng-form-toolbar@2.80.1
- @memberjunction/ng-action-gallery@2.80.1
- @memberjunction/ng-ai-test-harness@2.80.1
- @memberjunction/ng-code-editor@2.80.1
- @memberjunction/ng-container-directives@2.80.1
- @memberjunction/ng-deep-diff@2.80.1
- @memberjunction/ng-join-grid@2.80.1
- @memberjunction/ng-tabstrip@2.80.1
- @memberjunction/ng-timeline@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- 536ad6e: form improvements for AI Agents form
- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/ng-ai-test-harness@2.80.0
  - @memberjunction/ai-engine-base@2.80.0
  - @memberjunction/ai-core-plus@2.80.0
  - @memberjunction/ng-base-forms@2.80.0
  - @memberjunction/ng-form-toolbar@2.80.0
  - @memberjunction/ng-action-gallery@2.80.0
  - @memberjunction/ng-code-editor@2.80.0
  - @memberjunction/ng-container-directives@2.80.0
  - @memberjunction/ng-deep-diff@2.80.0
  - @memberjunction/ng-join-grid@2.80.0
  - @memberjunction/ng-timeline@2.80.0
  - @memberjunction/ng-tabstrip@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- 4bf2634: migrations

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai-core-plus@2.79.0
  - @memberjunction/ai-engine-base@2.79.0
  - @memberjunction/ng-action-gallery@2.79.0
  - @memberjunction/ng-ai-test-harness@2.79.0
  - @memberjunction/ng-code-editor@2.79.0
  - @memberjunction/ng-join-grid@2.79.0
  - @memberjunction/ng-timeline@2.79.0
  - @memberjunction/ng-base-forms@2.79.0
  - @memberjunction/ng-form-toolbar@2.79.0
  - @memberjunction/ng-container-directives@2.79.0
  - @memberjunction/ng-deep-diff@2.79.0
  - @memberjunction/core@2.79.0
  - @memberjunction/ng-tabstrip@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-engine-base@2.78.0
  - @memberjunction/ai-core-plus@2.78.0
  - @memberjunction/ng-action-gallery@2.78.0
  - @memberjunction/ng-ai-test-harness@2.78.0
  - @memberjunction/ng-code-editor@2.78.0
  - @memberjunction/ng-join-grid@2.78.0
  - @memberjunction/ng-timeline@2.78.0
  - @memberjunction/ng-form-toolbar@2.78.0
  - @memberjunction/ng-base-forms@2.78.0
  - @memberjunction/ng-container-directives@2.78.0
  - @memberjunction/ng-deep-diff@2.78.0
  - @memberjunction/ng-tabstrip@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/ai-engine-base@2.77.0
  - @memberjunction/ai-core-plus@2.77.0
  - @memberjunction/ng-base-forms@2.77.0
  - @memberjunction/ng-form-toolbar@2.77.0
  - @memberjunction/ng-action-gallery@2.77.0
  - @memberjunction/ng-ai-test-harness@2.77.0
  - @memberjunction/ng-code-editor@2.77.0
  - @memberjunction/ng-container-directives@2.77.0
  - @memberjunction/ng-deep-diff@2.77.0
  - @memberjunction/ng-join-grid@2.77.0
  - @memberjunction/ng-timeline@2.77.0
  - @memberjunction/ng-tabstrip@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Minor Changes

- 4b27b3c: migration file so minor bump

### Patch Changes

- 7dabb22: feat: add hierarchical CategoryName support for query lookup

  Adds support for hierarchical category paths in query lookup operations.
  The CategoryName parameter now accepts filesystem-like paths (e.g.,
  "/MJ/AI/Agents/") that walk through the QueryCategory parent-child
  relationships.

  ### New Features
  - **Hierarchical Path Resolution**: CategoryName now supports paths like
    "/MJ/AI/Agents/" that are parsed by splitting on "/" and walking down the
    category hierarchy using ParentID relationships
  - **CategoryPath Property**: Added CategoryPath getter to QueryInfo class
    that returns the full hierarchical path for any query
  - **Backward Compatibility**: Existing simple CategoryName usage (e.g.,
    "Agents") continues to work unchanged

- 2da81b3: Fix to Action Test Harness empty optional parameters
- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/ng-ai-test-harness@2.76.0
  - @memberjunction/ai-engine-base@2.76.0
  - @memberjunction/ai-core-plus@2.76.0
  - @memberjunction/ng-action-gallery@2.76.0
  - @memberjunction/ng-code-editor@2.76.0
  - @memberjunction/ng-join-grid@2.76.0
  - @memberjunction/ng-timeline@2.76.0
  - @memberjunction/ng-base-forms@2.76.0
  - @memberjunction/ng-form-toolbar@2.76.0
  - @memberjunction/ng-container-directives@2.76.0
  - @memberjunction/ng-deep-diff@2.76.0
  - @memberjunction/ng-tabstrip@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- 6a65fad: feat: Add AI Agent Run cost calculation with high-performance templated
  queries
  - Add AIAgentRunCostService with intelligent caching and single-query
    performance optimization
  - Implement CalculateAIAgentRunCost templated query using recursive CTE for
    hierarchical cost calculation
  - Fix GraphQL scalar type error (JSON → JSONObject) in RunQuery operations
  - Update AI Agent Run components to display consistent cost metrics in both
    top banner and analytics tab
  - Fix analytics component data loading to use proper entity relationships
    via AI Agent Run Steps
  - Add comprehensive metadata structure for AI queries with
    cross-environment schema compatibility
  - Remove debugging console statements for clean production output

  This enhancement provides accurate, performant cost tracking for AI Agent
  Runs including all nested sub-agent hierarchies up to 20 levels deep,
  replacing inefficient multiple database calls with a single optimized
  query.

- Updated dependencies [9ccd145]
- Updated dependencies [b403003]
  - @memberjunction/ng-ai-test-harness@2.75.0
  - @memberjunction/ng-container-directives@2.75.0
  - @memberjunction/ng-action-gallery@2.75.0
  - @memberjunction/ng-form-toolbar@2.75.0
  - @memberjunction/ng-base-forms@2.75.0
  - @memberjunction/ng-code-editor@2.75.0
  - @memberjunction/ng-join-grid@2.75.0
  - @memberjunction/ng-tabstrip@2.75.0
  - @memberjunction/ng-timeline@2.75.0
  - @memberjunction/ai-engine-base@2.75.0
  - @memberjunction/ai-core-plus@2.75.0
  - @memberjunction/ng-deep-diff@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ai-engine-base@2.74.0
  - @memberjunction/ai-core-plus@2.74.0
  - @memberjunction/ng-action-gallery@2.74.0
  - @memberjunction/ng-ai-test-harness@2.74.0
  - @memberjunction/ng-code-editor@2.74.0
  - @memberjunction/ng-join-grid@2.74.0
  - @memberjunction/ng-timeline@2.74.0
  - @memberjunction/ng-base-forms@2.74.0
  - @memberjunction/ng-form-toolbar@2.74.0
  - @memberjunction/ng-container-directives@2.74.0
  - @memberjunction/ng-deep-diff@2.74.0
  - @memberjunction/ng-tabstrip@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- e99336f: UI tweaks
- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai-engine-base@2.73.0
  - @memberjunction/ai-core-plus@2.73.0
  - @memberjunction/ng-action-gallery@2.73.0
  - @memberjunction/ng-ai-test-harness@2.73.0
  - @memberjunction/ng-code-editor@2.73.0
  - @memberjunction/ng-join-grid@2.73.0
  - @memberjunction/ng-timeline@2.73.0
  - @memberjunction/ng-form-toolbar@2.73.0
  - @memberjunction/ng-base-forms@2.73.0
  - @memberjunction/ng-container-directives@2.73.0
  - @memberjunction/ng-deep-diff@2.73.0
  - @memberjunction/ng-tabstrip@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Minor Changes

- 636b6ee: migration

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ai-engine-base@2.72.0
  - @memberjunction/ai-core-plus@2.72.0
  - @memberjunction/ng-action-gallery@2.72.0
  - @memberjunction/ng-ai-test-harness@2.72.0
  - @memberjunction/ng-code-editor@2.72.0
  - @memberjunction/ng-join-grid@2.72.0
  - @memberjunction/ng-timeline@2.72.0
  - @memberjunction/ng-form-toolbar@2.72.0
  - @memberjunction/ng-base-forms@2.72.0
  - @memberjunction/ng-container-directives@2.72.0
  - @memberjunction/ng-deep-diff@2.72.0
  - @memberjunction/ng-tabstrip@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

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
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai-engine-base@2.71.0
  - @memberjunction/ai-core-plus@2.71.0
  - @memberjunction/ng-base-forms@2.71.0
  - @memberjunction/ng-form-toolbar@2.71.0
  - @memberjunction/ng-action-gallery@2.71.0
  - @memberjunction/ng-ai-test-harness@2.71.0
  - @memberjunction/ng-code-editor@2.71.0
  - @memberjunction/ng-container-directives@2.71.0
  - @memberjunction/ng-deep-diff@2.71.0
  - @memberjunction/ng-join-grid@2.71.0
  - @memberjunction/ng-tabstrip@2.71.0
  - @memberjunction/ng-timeline@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0

## 2.70.0

### Minor Changes

- c9d86cd: migration

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai-core-plus@2.70.0
  - @memberjunction/ai-engine-base@2.70.0
  - @memberjunction/ng-base-forms@2.70.0
  - @memberjunction/ng-form-toolbar@2.70.0
  - @memberjunction/ng-code-editor@2.70.0
  - @memberjunction/ng-container-directives@2.70.0
  - @memberjunction/ng-deep-diff@2.70.0
  - @memberjunction/ng-join-grid@2.70.0
  - @memberjunction/ng-timeline@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/ng-ai-test-harness@2.70.0
  - @memberjunction/ng-action-gallery@2.70.0
  - @memberjunction/ng-tabstrip@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ai-engine-base@2.69.1
  - @memberjunction/ai-core-plus@2.69.1
  - @memberjunction/ng-base-forms@2.69.1
  - @memberjunction/ng-form-toolbar@2.69.1
  - @memberjunction/ng-action-gallery@2.69.1
  - @memberjunction/ng-ai-test-harness@2.69.1
  - @memberjunction/ng-code-editor@2.69.1
  - @memberjunction/ng-container-directives@2.69.1
  - @memberjunction/ng-deep-diff@2.69.1
  - @memberjunction/ng-join-grid@2.69.1
  - @memberjunction/ng-timeline@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/ng-tabstrip@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/ai-engine-base@2.69.0
  - @memberjunction/ai-core-plus@2.69.0
  - @memberjunction/ng-base-forms@2.69.0
  - @memberjunction/ng-form-toolbar@2.69.0
  - @memberjunction/ng-action-gallery@2.69.0
  - @memberjunction/ng-ai-test-harness@2.69.0
  - @memberjunction/ng-code-editor@2.69.0
  - @memberjunction/ng-container-directives@2.69.0
  - @memberjunction/ng-deep-diff@2.69.0
  - @memberjunction/ng-join-grid@2.69.0
  - @memberjunction/ng-timeline@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/ng-tabstrip@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/ai-engine-base@2.68.0
  - @memberjunction/ai-core-plus@2.68.0
  - @memberjunction/ng-base-forms@2.68.0
  - @memberjunction/ng-form-toolbar@2.68.0
  - @memberjunction/ng-action-gallery@2.68.0
  - @memberjunction/ng-ai-test-harness@2.68.0
  - @memberjunction/ng-code-editor@2.68.0
  - @memberjunction/ng-container-directives@2.68.0
  - @memberjunction/ng-deep-diff@2.68.0
  - @memberjunction/ng-join-grid@2.68.0
  - @memberjunction/ng-timeline@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/ng-tabstrip@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai-engine-base@2.67.0
- @memberjunction/ai-core-plus@2.67.0
- @memberjunction/ng-base-forms@2.67.0
- @memberjunction/ng-form-toolbar@2.67.0
- @memberjunction/ng-action-gallery@2.67.0
- @memberjunction/ng-ai-test-harness@2.67.0
- @memberjunction/ng-code-editor@2.67.0
- @memberjunction/ng-container-directives@2.67.0
- @memberjunction/ng-deep-diff@2.67.0
- @memberjunction/ng-join-grid@2.67.0
- @memberjunction/ng-tabstrip@2.67.0
- @memberjunction/ng-timeline@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ai-core-plus@2.66.0
- @memberjunction/ng-ai-test-harness@2.66.0
- @memberjunction/ng-form-toolbar@2.66.0
- @memberjunction/ng-base-forms@2.66.0
- @memberjunction/ng-join-grid@2.66.0
- @memberjunction/ng-timeline@2.66.0
- @memberjunction/ng-action-gallery@2.66.0
- @memberjunction/ai-engine-base@2.66.0
- @memberjunction/ng-code-editor@2.66.0
- @memberjunction/ng-container-directives@2.66.0
- @memberjunction/ng-deep-diff@2.66.0
- @memberjunction/ng-tabstrip@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai-core-plus@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/ai-engine-base@2.65.0
  - @memberjunction/ng-base-forms@2.65.0
  - @memberjunction/ng-form-toolbar@2.65.0
  - @memberjunction/ng-code-editor@2.65.0
  - @memberjunction/ng-container-directives@2.65.0
  - @memberjunction/ng-deep-diff@2.65.0
  - @memberjunction/ng-join-grid@2.65.0
  - @memberjunction/ng-timeline@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/ng-action-gallery@2.65.0
  - @memberjunction/ng-ai-test-harness@2.65.0
  - @memberjunction/ng-tabstrip@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/ai-engine-base@2.64.0
  - @memberjunction/ai-core-plus@2.64.0
  - @memberjunction/ng-action-gallery@2.64.0
  - @memberjunction/ng-ai-test-harness@2.64.0
  - @memberjunction/ng-code-editor@2.64.0
  - @memberjunction/ng-join-grid@2.64.0
  - @memberjunction/ng-timeline@2.64.0
  - @memberjunction/ng-form-toolbar@2.64.0
  - @memberjunction/ng-base-forms@2.64.0
  - @memberjunction/ng-container-directives@2.64.0
  - @memberjunction/ng-deep-diff@2.64.0
  - @memberjunction/ng-tabstrip@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- 2f18672: Added dep for @memberjunction/ng-deep-diff to core-entity-forms
- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai-engine-base@2.63.1
  - @memberjunction/ai-core-plus@2.63.1
  - @memberjunction/ng-base-forms@2.63.1
  - @memberjunction/ng-form-toolbar@2.63.1
  - @memberjunction/ng-code-editor@2.63.1
  - @memberjunction/ng-container-directives@2.63.1
  - @memberjunction/ng-deep-diff@2.63.1
  - @memberjunction/ng-join-grid@2.63.1
  - @memberjunction/ng-timeline@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/ng-ai-test-harness@2.63.1
  - @memberjunction/ng-action-gallery@2.63.1
  - @memberjunction/ng-tabstrip@2.63.1

## 2.63.0

### Minor Changes

- 28e8a85: Migration included to modify the AIAgentRun table, so minor bump

### Patch Changes

- bd3540d: UI Tweaks
- Updated dependencies [28e8a85]
  - @memberjunction/ai-core-plus@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/ai-engine-base@2.63.0
  - @memberjunction/ng-action-gallery@2.63.0
  - @memberjunction/ng-ai-test-harness@2.63.0
  - @memberjunction/ng-code-editor@2.63.0
  - @memberjunction/ng-join-grid@2.63.0
  - @memberjunction/ng-timeline@2.63.0
  - @memberjunction/ng-form-toolbar@2.63.0
  - @memberjunction/ng-base-forms@2.63.0
  - @memberjunction/ng-container-directives@2.63.0
  - @memberjunction/ng-tabstrip@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai-core-plus@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/ai-engine-base@2.62.0
  - @memberjunction/ng-action-gallery@2.62.0
  - @memberjunction/ng-ai-test-harness@2.62.0
  - @memberjunction/ng-code-editor@2.62.0
  - @memberjunction/ng-join-grid@2.62.0
  - @memberjunction/ng-timeline@2.62.0
  - @memberjunction/ng-form-toolbar@2.62.0
  - @memberjunction/ng-base-forms@2.62.0
  - @memberjunction/ng-container-directives@2.62.0
  - @memberjunction/ng-tabstrip@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/ai-core-plus@2.61.0
  - @memberjunction/ai-engine-base@2.61.0
  - @memberjunction/ng-base-forms@2.61.0
  - @memberjunction/ng-form-toolbar@2.61.0
  - @memberjunction/ng-action-gallery@2.61.0
  - @memberjunction/ng-ai-test-harness@2.61.0
  - @memberjunction/ng-code-editor@2.61.0
  - @memberjunction/ng-container-directives@2.61.0
  - @memberjunction/ng-join-grid@2.61.0
  - @memberjunction/ng-tabstrip@2.61.0
  - @memberjunction/ng-timeline@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0

## 2.60.0

### Minor Changes

- e30ee12: migrations

### Patch Changes

- Updated dependencies [bb46c63]
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [dc95bed]
- Updated dependencies [e512e4e]
  - @memberjunction/ai-core-plus@2.60.0
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/ng-ai-test-harness@2.60.0
  - @memberjunction/ai-engine-base@2.60.0
  - @memberjunction/ng-base-forms@2.60.0
  - @memberjunction/ng-form-toolbar@2.60.0
  - @memberjunction/ng-action-gallery@2.60.0
  - @memberjunction/ng-code-editor@2.60.0
  - @memberjunction/ng-container-directives@2.60.0
  - @memberjunction/ng-join-grid@2.60.0
  - @memberjunction/ng-timeline@2.60.0
  - @memberjunction/ng-tabstrip@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- Updated dependencies [4af40cb]
  - @memberjunction/ng-ai-test-harness@2.59.0
  - @memberjunction/ng-action-gallery@2.59.0
  - @memberjunction/ai-engine-base@2.59.0
  - @memberjunction/ai-core-plus@2.59.0
  - @memberjunction/ng-base-forms@2.59.0
  - @memberjunction/ng-form-toolbar@2.59.0
  - @memberjunction/ng-code-editor@2.59.0
  - @memberjunction/ng-container-directives@2.59.0
  - @memberjunction/ng-join-grid@2.59.0
  - @memberjunction/ng-tabstrip@2.59.0
  - @memberjunction/ng-timeline@2.59.0
  - @memberjunction/core@2.59.0
  - @memberjunction/core-entities@2.59.0
  - @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai-core-plus@2.58.0
  - @memberjunction/ai-engine-base@2.58.0
  - @memberjunction/ng-base-forms@2.58.0
  - @memberjunction/ng-form-toolbar@2.58.0
  - @memberjunction/ng-action-gallery@2.58.0
  - @memberjunction/ng-ai-test-harness@2.58.0
  - @memberjunction/ng-code-editor@2.58.0
  - @memberjunction/ng-container-directives@2.58.0
  - @memberjunction/ng-join-grid@2.58.0
  - @memberjunction/ng-timeline@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/ng-tabstrip@2.58.0

## 2.57.0

### Patch Changes

- 67a2bec: feat(ai-agent-form): Add Model Selection Mode control and reorganize panels
  - Added Model Selection Mode dropdown in the Prompts section for better space utilization
  - Reordered panels to show Actions first, then Sub-Agents, then Prompts for better workflow
  - Fixed Kendo dropdown to properly bind primitive string values using valuePrimitive="true"
  - Styled with blue accent to highlight this important configuration option
  - Control appears in both edit and read-only modes for transparency

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/ai-engine-base@2.57.0
  - @memberjunction/ng-base-forms@2.57.0
  - @memberjunction/ng-form-toolbar@2.57.0
  - @memberjunction/ng-action-gallery@2.57.0
  - @memberjunction/ng-ai-test-harness@2.57.0
  - @memberjunction/ng-code-editor@2.57.0
  - @memberjunction/ng-container-directives@2.57.0
  - @memberjunction/ng-join-grid@2.57.0
  - @memberjunction/ng-timeline@2.57.0
  - @memberjunction/ng-tabstrip@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/ai-engine-base@2.56.0
  - @memberjunction/ng-action-gallery@2.56.0
  - @memberjunction/ng-ai-test-harness@2.56.0
  - @memberjunction/ng-code-editor@2.56.0
  - @memberjunction/ng-join-grid@2.56.0
  - @memberjunction/ng-timeline@2.56.0
  - @memberjunction/ng-form-toolbar@2.56.0
  - @memberjunction/ng-base-forms@2.56.0
  - @memberjunction/ng-container-directives@2.56.0
  - @memberjunction/ng-tabstrip@2.56.0
  - @memberjunction/core@2.56.0

## 2.55.0

### Minor Changes

- 659f892: Various

### Patch Changes

- Updated dependencies [659f892]
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-engine-base@2.55.0
  - @memberjunction/ng-action-gallery@2.55.0
  - @memberjunction/ng-ai-test-harness@2.55.0
  - @memberjunction/ng-code-editor@2.55.0
  - @memberjunction/ng-join-grid@2.55.0
  - @memberjunction/ng-timeline@2.55.0
  - @memberjunction/ng-form-toolbar@2.55.0
  - @memberjunction/ng-base-forms@2.55.0
  - @memberjunction/ng-container-directives@2.55.0
  - @memberjunction/ng-tabstrip@2.55.0
  - @memberjunction/core@2.55.0

## 2.54.0

### Patch Changes

- b21ba9e: This PR addresses multiple UI issues and improvements across the MemberJunction Explorer and Angular components, enhancing user experience and visual consistency throughout the platform.
- cc9daf7: tweaks to UI
- Updated dependencies [20f424d]
- Updated dependencies [b21ba9e]
- Updated dependencies [cc9daf7]
  - @memberjunction/core@2.54.0
  - @memberjunction/ng-tabstrip@2.54.0
  - @memberjunction/ng-explorer-core@2.54.0
  - @memberjunction/ai-engine-base@2.54.0
  - @memberjunction/ng-base-forms@2.54.0
  - @memberjunction/ng-form-toolbar@2.54.0
  - @memberjunction/ng-code-editor@2.54.0
  - @memberjunction/ng-container-directives@2.54.0
  - @memberjunction/ng-join-grid@2.54.0
  - @memberjunction/ng-timeline@2.54.0
  - @memberjunction/core-entities@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [51fe03b]
- Updated dependencies [e00127a]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/ng-explorer-core@2.53.0
  - @memberjunction/ng-container-directives@2.53.0
  - @memberjunction/ng-tabstrip@2.53.0
  - @memberjunction/ai-engine-base@2.53.0
  - @memberjunction/ng-base-forms@2.53.0
  - @memberjunction/ng-form-toolbar@2.53.0
  - @memberjunction/ng-code-editor@2.53.0
  - @memberjunction/ng-join-grid@2.53.0
  - @memberjunction/ng-timeline@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai-engine-base@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/ng-base-forms@2.52.0
  - @memberjunction/ng-explorer-core@2.52.0
  - @memberjunction/ng-form-toolbar@2.52.0
  - @memberjunction/ng-code-editor@2.52.0
  - @memberjunction/ng-container-directives@2.52.0
  - @memberjunction/ng-join-grid@2.52.0
  - @memberjunction/ng-timeline@2.52.0
  - @memberjunction/ng-tabstrip@2.52.0

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements
- 53f8167: AI Agent Infra - bump to 2.51.0
- 0ddb438: various

### Patch Changes

- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/ng-explorer-core@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/ai-engine-base@2.51.0
  - @memberjunction/ng-base-forms@2.51.0
  - @memberjunction/ng-form-toolbar@2.51.0
  - @memberjunction/ng-code-editor@2.51.0
  - @memberjunction/ng-container-directives@2.51.0
  - @memberjunction/ng-join-grid@2.51.0
  - @memberjunction/ng-timeline@2.51.0
  - @memberjunction/ng-tabstrip@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ng-base-forms@2.50.0
- @memberjunction/ng-explorer-core@2.50.0
- @memberjunction/ng-form-toolbar@2.50.0
- @memberjunction/ng-code-editor@2.50.0
- @memberjunction/ng-container-directives@2.50.0
- @memberjunction/ng-join-grid@2.50.0
- @memberjunction/ng-tabstrip@2.50.0
- @memberjunction/ng-timeline@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [b5d9fbd]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/ng-explorer-core@2.49.0
  - @memberjunction/ng-base-forms@2.49.0
  - @memberjunction/ng-form-toolbar@2.49.0
  - @memberjunction/ng-code-editor@2.49.0
  - @memberjunction/ng-container-directives@2.49.0
  - @memberjunction/ng-join-grid@2.49.0
  - @memberjunction/ng-tabstrip@2.49.0
  - @memberjunction/ng-timeline@2.49.0

## 2.48.0

### Minor Changes

- 031e724: Implement agent architecture separation of concerns
  - **NEW**: Add BaseAgent class for domain-specific prompt execution
  - **NEW**: Add ConductorAgent for autonomous orchestration decisions and action planning
  - **NEW**: Add AgentRunner class to coordinate BaseAgent + ConductorAgent interactions
  - **NEW**: Add AgentFactory with `GetConductorAgent()` and `GetAgentRunner()` methods using MJGlobal
    class factory
  - **NEW**: Add comprehensive execution tracking with AIAgentRun and AIAgentRunStep entities
  - **NEW**: Support parallel and sequential action execution with proper ordering
  - **NEW**: Structured JSON response format for deterministic decision parsing
  - **NEW**: Database persistence for execution history and step tracking
  - **NEW**: Cancellation and progress monitoring support
  - **NEW**: Context compression for long conversations
  - **NEW**: Template rendering with data context

  This implements clean separation of concerns:
  - BaseAgent: Domain-specific execution only (~500 lines)
  - ConductorAgent: Orchestration decisions with structured responses
  - AgentRunner: Coordination layer providing unified user interface

  Includes comprehensive TypeScript typing and MemberJunction framework integration.

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/ng-explorer-core@2.48.0
  - @memberjunction/ng-form-toolbar@2.48.0
  - @memberjunction/ng-base-forms@2.48.0
  - @memberjunction/ng-code-editor@2.48.0
  - @memberjunction/ng-container-directives@2.48.0
  - @memberjunction/ng-join-grid@2.48.0
  - @memberjunction/ng-timeline@2.48.0
  - @memberjunction/ng-tabstrip@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/ng-base-forms@2.47.0
- @memberjunction/ng-explorer-core@2.47.0
- @memberjunction/ng-form-toolbar@2.47.0
- @memberjunction/ng-code-editor@2.47.0
- @memberjunction/ng-container-directives@2.47.0
- @memberjunction/ng-join-grid@2.47.0
- @memberjunction/ng-tabstrip@2.47.0
- @memberjunction/ng-timeline@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ng-base-forms@2.46.0
- @memberjunction/ng-explorer-core@2.46.0
- @memberjunction/ng-form-toolbar@2.46.0
- @memberjunction/ng-code-editor@2.46.0
- @memberjunction/ng-container-directives@2.46.0
- @memberjunction/ng-join-grid@2.46.0
- @memberjunction/ng-tabstrip@2.46.0
- @memberjunction/ng-timeline@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0

## 2.45.0

### Minor Changes

- 556ee8d: Add AI Agent framework database entities and enhanced agent execution support

  New entity classes generated for AIAgentType, AIAgentRun, and AIAgentRunStep tables. Enhanced AIAgent and AIPromptRun entities with new foreign key relationships. Updated DataContextItem entity with CodeName property for improved code generation. These changes provide the foundational data layer for the AI Agent execution framework with hierarchical agent support, execution tracking, and pause/resume capabilities.

### Patch Changes

- Updated dependencies [556ee8d]
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ng-explorer-core@2.45.0
  - @memberjunction/ng-code-editor@2.45.0
  - @memberjunction/ng-join-grid@2.45.0
  - @memberjunction/ng-timeline@2.45.0
  - @memberjunction/ng-form-toolbar@2.45.0
  - @memberjunction/ng-base-forms@2.45.0
  - @memberjunction/ng-container-directives@2.45.0
  - @memberjunction/ng-tabstrip@2.45.0
  - @memberjunction/core@2.45.0

## 2.44.0

### Patch Changes

- fbc30dc: Documentation
- 9f02cd8: Various improvements
- 99b27c5: various updates
- Updated dependencies [fbc30dc]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/ng-explorer-core@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/ng-base-forms@2.44.0
  - @memberjunction/ng-form-toolbar@2.44.0
  - @memberjunction/ng-code-editor@2.44.0
  - @memberjunction/ng-container-directives@2.44.0
  - @memberjunction/ng-join-grid@2.44.0
  - @memberjunction/ng-timeline@2.44.0
  - @memberjunction/ng-tabstrip@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/ng-base-forms@2.43.0
  - @memberjunction/ng-explorer-core@2.43.0
  - @memberjunction/ng-form-toolbar@2.43.0
  - @memberjunction/ng-code-editor@2.43.0
  - @memberjunction/ng-container-directives@2.43.0
  - @memberjunction/ng-join-grid@2.43.0
  - @memberjunction/ng-timeline@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/ng-tabstrip@2.43.0

## 2.42.1

### Patch Changes

- Updated dependencies [bd36dce]
  - @memberjunction/ng-explorer-core@2.42.1
  - @memberjunction/ng-base-forms@2.42.1
  - @memberjunction/ng-form-toolbar@2.42.1
  - @memberjunction/ng-timeline@2.42.1
  - @memberjunction/ng-code-editor@2.42.1
  - @memberjunction/ng-container-directives@2.42.1
  - @memberjunction/ng-join-grid@2.42.1
  - @memberjunction/ng-tabstrip@2.42.1
  - @memberjunction/core@2.42.1
  - @memberjunction/core-entities@2.42.1

## 2.42.0

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ng-explorer-core@2.42.0
  - @memberjunction/ng-form-toolbar@2.42.0
  - @memberjunction/ng-base-forms@2.42.0
  - @memberjunction/ng-code-editor@2.42.0
  - @memberjunction/ng-container-directives@2.42.0
  - @memberjunction/ng-join-grid@2.42.0
  - @memberjunction/ng-tabstrip@2.42.0
  - @memberjunction/ng-timeline@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/ng-base-forms@2.41.0
  - @memberjunction/ng-explorer-core@2.41.0
  - @memberjunction/ng-form-toolbar@2.41.0
  - @memberjunction/ng-code-editor@2.41.0
  - @memberjunction/ng-container-directives@2.41.0
  - @memberjunction/ng-join-grid@2.41.0
  - @memberjunction/ng-timeline@2.41.0
  - @memberjunction/ng-tabstrip@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/ng-explorer-core@2.40.0
- @memberjunction/ng-form-toolbar@2.40.0
- @memberjunction/ng-base-forms@2.40.0
- @memberjunction/ng-code-editor@2.40.0
- @memberjunction/ng-container-directives@2.40.0
- @memberjunction/ng-join-grid@2.40.0
- @memberjunction/ng-tabstrip@2.40.0
- @memberjunction/ng-timeline@2.40.0
- @memberjunction/core@2.40.0
- @memberjunction/core-entities@2.40.0

## 2.39.0

### Patch Changes

- c9ccc36: Added SupportsEffortLevel to AIModels entity - generated artifacts to suit...
- Updated dependencies [c9ccc36]
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ng-explorer-core@2.39.0
  - @memberjunction/ng-form-toolbar@2.39.0
  - @memberjunction/ng-code-editor@2.39.0
  - @memberjunction/ng-join-grid@2.39.0
  - @memberjunction/ng-timeline@2.39.0
  - @memberjunction/ng-base-forms@2.39.0
  - @memberjunction/ng-container-directives@2.39.0
  - @memberjunction/ng-tabstrip@2.39.0
  - @memberjunction/core@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/ng-explorer-core@2.38.0
  - @memberjunction/ng-code-editor@2.38.0
  - @memberjunction/ng-join-grid@2.38.0
  - @memberjunction/ng-timeline@2.38.0
  - @memberjunction/ng-form-toolbar@2.38.0
  - @memberjunction/ng-base-forms@2.38.0
  - @memberjunction/ng-container-directives@2.38.0
  - @memberjunction/ng-tabstrip@2.38.0
  - @memberjunction/core@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ng-explorer-core@2.37.1
- @memberjunction/ng-form-toolbar@2.37.1
- @memberjunction/ng-base-forms@2.37.1
- @memberjunction/ng-code-editor@2.37.1
- @memberjunction/ng-container-directives@2.37.1
- @memberjunction/ng-join-grid@2.37.1
- @memberjunction/ng-tabstrip@2.37.1
- @memberjunction/ng-timeline@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1

## 2.37.0

### Minor Changes

- 1418b71: Added ArtifactID/ArtifactVersionID as optional fkeys to ConversationDetail

### Patch Changes

- Updated dependencies [1418b71]
- Updated dependencies [6a75f8d]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/ng-container-directives@2.37.0
  - @memberjunction/ng-explorer-core@2.37.0
  - @memberjunction/ng-code-editor@2.37.0
  - @memberjunction/ng-join-grid@2.37.0
  - @memberjunction/ng-timeline@2.37.0
  - @memberjunction/ng-base-forms@2.37.0
  - @memberjunction/ng-form-toolbar@2.37.0
  - @memberjunction/ng-tabstrip@2.37.0
  - @memberjunction/core@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [9d709e2]
  - @memberjunction/core@2.36.1
  - @memberjunction/ng-base-forms@2.36.1
  - @memberjunction/ng-explorer-core@2.36.1
  - @memberjunction/ng-form-toolbar@2.36.1
  - @memberjunction/ng-code-editor@2.36.1
  - @memberjunction/ng-container-directives@2.36.1
  - @memberjunction/ng-join-grid@2.36.1
  - @memberjunction/ng-timeline@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/ng-tabstrip@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ng-container-directives@2.36.0
  - @memberjunction/ng-explorer-core@2.36.0
  - @memberjunction/ng-form-toolbar@2.36.0
  - @memberjunction/ng-base-forms@2.36.0
  - @memberjunction/ng-code-editor@2.36.0
  - @memberjunction/ng-join-grid@2.36.0
  - @memberjunction/ng-tabstrip@2.36.0
  - @memberjunction/ng-timeline@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/ng-base-forms@2.35.1
  - @memberjunction/ng-explorer-core@2.35.1
  - @memberjunction/ng-form-toolbar@2.35.1
  - @memberjunction/ng-code-editor@2.35.1
  - @memberjunction/ng-container-directives@2.35.1
  - @memberjunction/ng-join-grid@2.35.1
  - @memberjunction/ng-timeline@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/ng-tabstrip@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/ng-explorer-core@2.35.0
- @memberjunction/ng-form-toolbar@2.35.0
- @memberjunction/ng-base-forms@2.35.0
- @memberjunction/ng-code-editor@2.35.0
- @memberjunction/ng-container-directives@2.35.0
- @memberjunction/ng-join-grid@2.35.0
- @memberjunction/ng-tabstrip@2.35.0
- @memberjunction/ng-timeline@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ng-base-forms@2.34.2
- @memberjunction/ng-explorer-core@2.34.2
- @memberjunction/ng-form-toolbar@2.34.2
- @memberjunction/ng-code-editor@2.34.2
- @memberjunction/ng-container-directives@2.34.2
- @memberjunction/ng-join-grid@2.34.2
- @memberjunction/ng-tabstrip@2.34.2
- @memberjunction/ng-timeline@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ng-base-forms@2.34.1
- @memberjunction/ng-explorer-core@2.34.1
- @memberjunction/ng-form-toolbar@2.34.1
- @memberjunction/ng-code-editor@2.34.1
- @memberjunction/ng-container-directives@2.34.1
- @memberjunction/ng-join-grid@2.34.1
- @memberjunction/ng-tabstrip@2.34.1
- @memberjunction/ng-timeline@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1

## 2.34.0

### Minor Changes

- e60f326: More support for HTML Reports in Skip, Additional Entities and CodeGen and SkipTypes for Artifacts Support

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
- Updated dependencies [54ac86c]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ng-explorer-core@2.34.0
  - @memberjunction/ng-form-toolbar@2.34.0
  - @memberjunction/ng-code-editor@2.34.0
  - @memberjunction/ng-join-grid@2.34.0
  - @memberjunction/ng-timeline@2.34.0
  - @memberjunction/ng-base-forms@2.34.0
  - @memberjunction/ng-container-directives@2.34.0
  - @memberjunction/ng-tabstrip@2.34.0

## 2.33.0

### Patch Changes

- Updated dependencies [42b7deb]
  - @memberjunction/ng-base-forms@2.33.0
  - @memberjunction/ng-explorer-core@2.33.0
  - @memberjunction/ng-form-toolbar@2.33.0
  - @memberjunction/ng-join-grid@2.33.0
  - @memberjunction/ng-timeline@2.33.0
  - @memberjunction/ng-code-editor@2.33.0
  - @memberjunction/ng-container-directives@2.33.0
  - @memberjunction/ng-tabstrip@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ng-base-forms@2.32.2
- @memberjunction/ng-explorer-core@2.32.2
- @memberjunction/ng-form-toolbar@2.32.2
- @memberjunction/ng-code-editor@2.32.2
- @memberjunction/ng-container-directives@2.32.2
- @memberjunction/ng-join-grid@2.32.2
- @memberjunction/ng-tabstrip@2.32.2
- @memberjunction/ng-timeline@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ng-base-forms@2.32.1
- @memberjunction/ng-explorer-core@2.32.1
- @memberjunction/ng-form-toolbar@2.32.1
- @memberjunction/ng-code-editor@2.32.1
- @memberjunction/ng-container-directives@2.32.1
- @memberjunction/ng-join-grid@2.32.1
- @memberjunction/ng-tabstrip@2.32.1
- @memberjunction/ng-timeline@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ng-base-forms@2.32.0
- @memberjunction/ng-explorer-core@2.32.0
- @memberjunction/ng-form-toolbar@2.32.0
- @memberjunction/ng-code-editor@2.32.0
- @memberjunction/ng-container-directives@2.32.0
- @memberjunction/ng-join-grid@2.32.0
- @memberjunction/ng-tabstrip@2.32.0
- @memberjunction/ng-timeline@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/ng-explorer-core@2.31.0
- @memberjunction/ng-form-toolbar@2.31.0
- @memberjunction/ng-base-forms@2.31.0
- @memberjunction/ng-join-grid@2.31.0
- @memberjunction/ng-timeline@2.31.0
- @memberjunction/ng-code-editor@2.31.0
- @memberjunction/ng-container-directives@2.31.0
- @memberjunction/ng-tabstrip@2.31.0
- @memberjunction/core@2.31.0
- @memberjunction/core-entities@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/ng-explorer-core@2.30.0
  - @memberjunction/ng-code-editor@2.30.0
  - @memberjunction/ng-join-grid@2.30.0
  - @memberjunction/ng-timeline@2.30.0
  - @memberjunction/ng-base-forms@2.30.0
  - @memberjunction/ng-form-toolbar@2.30.0
  - @memberjunction/ng-container-directives@2.30.0
  - @memberjunction/core@2.30.0
  - @memberjunction/ng-tabstrip@2.30.0

## 2.29.2

### Patch Changes

- 07bde92: New CodeGen Advanced Generation Functionality and supporting metadata schema changes
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/ng-explorer-core@2.29.2
  - @memberjunction/ng-base-forms@2.29.2
  - @memberjunction/ng-form-toolbar@2.29.2
  - @memberjunction/ng-code-editor@2.29.2
  - @memberjunction/ng-container-directives@2.29.2
  - @memberjunction/ng-join-grid@2.29.2
  - @memberjunction/ng-timeline@2.29.2
  - @memberjunction/ng-tabstrip@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/ng-base-forms@2.28.0
  - @memberjunction/ng-explorer-core@2.28.0
  - @memberjunction/ng-form-toolbar@2.28.0
  - @memberjunction/ng-code-editor@2.28.0
  - @memberjunction/ng-container-directives@2.28.0
  - @memberjunction/ng-join-grid@2.28.0
  - @memberjunction/ng-timeline@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/ng-tabstrip@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ng-explorer-core@2.27.1
- @memberjunction/ng-form-toolbar@2.27.1
- @memberjunction/ng-base-forms@2.27.1
- @memberjunction/ng-code-editor@2.27.1
- @memberjunction/ng-container-directives@2.27.1
- @memberjunction/ng-join-grid@2.27.1
- @memberjunction/ng-tabstrip@2.27.1
- @memberjunction/ng-timeline@2.27.1
- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1

## 2.27.0

### Patch Changes

- 5a81451: Added a UserID column to the Conversation Details Entity for the future extensibility of multi-user conversations with Skip.
- Updated dependencies [54ab868]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/ng-base-forms@2.27.0
  - @memberjunction/ng-explorer-core@2.27.0
  - @memberjunction/ng-form-toolbar@2.27.0
  - @memberjunction/ng-code-editor@2.27.0
  - @memberjunction/ng-container-directives@2.27.0
  - @memberjunction/ng-join-grid@2.27.0
  - @memberjunction/ng-timeline@2.27.0
  - @memberjunction/ng-tabstrip@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ng-explorer-core@2.26.1
- @memberjunction/ng-form-toolbar@2.26.1
- @memberjunction/ng-base-forms@2.26.1
- @memberjunction/ng-code-editor@2.26.1
- @memberjunction/ng-container-directives@2.26.1
- @memberjunction/ng-join-grid@2.26.1
- @memberjunction/ng-tabstrip@2.26.1
- @memberjunction/ng-timeline@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/ng-base-forms@2.26.0
  - @memberjunction/ng-explorer-core@2.26.0
  - @memberjunction/ng-form-toolbar@2.26.0
  - @memberjunction/ng-code-editor@2.26.0
  - @memberjunction/ng-container-directives@2.26.0
  - @memberjunction/ng-join-grid@2.26.0
  - @memberjunction/ng-timeline@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/ng-tabstrip@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/ng-explorer-core@2.25.0
  - @memberjunction/ng-base-forms@2.25.0
  - @memberjunction/ng-form-toolbar@2.25.0
  - @memberjunction/ng-code-editor@2.25.0
  - @memberjunction/ng-container-directives@2.25.0
  - @memberjunction/ng-join-grid@2.25.0
  - @memberjunction/ng-timeline@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/ng-tabstrip@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ng-base-forms@2.24.1
- @memberjunction/ng-explorer-core@2.24.1
- @memberjunction/ng-form-toolbar@2.24.1
- @memberjunction/ng-code-editor@2.24.1
- @memberjunction/ng-container-directives@2.24.1
- @memberjunction/ng-join-grid@2.24.1
- @memberjunction/ng-tabstrip@2.24.1
- @memberjunction/ng-timeline@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [7c6ff41]
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/ng-base-forms@2.24.0
  - @memberjunction/ng-explorer-core@2.24.0
  - @memberjunction/ng-form-toolbar@2.24.0
  - @memberjunction/ng-code-editor@2.24.0
  - @memberjunction/ng-container-directives@2.24.0
  - @memberjunction/ng-join-grid@2.24.0
  - @memberjunction/ng-timeline@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/ng-tabstrip@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ng-base-forms@2.23.2
- @memberjunction/ng-explorer-core@2.23.2
- @memberjunction/ng-form-toolbar@2.23.2
- @memberjunction/ng-code-editor@2.23.2
- @memberjunction/ng-container-directives@2.23.2
- @memberjunction/ng-join-grid@2.23.2
- @memberjunction/ng-tabstrip@2.23.2
- @memberjunction/ng-timeline@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ng-base-forms@2.23.1
- @memberjunction/ng-explorer-core@2.23.1
- @memberjunction/ng-form-toolbar@2.23.1
- @memberjunction/ng-code-editor@2.23.1
- @memberjunction/ng-container-directives@2.23.1
- @memberjunction/ng-join-grid@2.23.1
- @memberjunction/ng-tabstrip@2.23.1
- @memberjunction/ng-timeline@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1

## 2.23.0

### Patch Changes

- @memberjunction/ng-base-forms@2.23.0
- @memberjunction/ng-explorer-core@2.23.0
- @memberjunction/ng-form-toolbar@2.23.0
- @memberjunction/ng-code-editor@2.23.0
- @memberjunction/ng-container-directives@2.23.0
- @memberjunction/ng-join-grid@2.23.0
- @memberjunction/ng-timeline@2.23.0
- @memberjunction/core@2.23.0
- @memberjunction/core-entities@2.23.0
- @memberjunction/ng-tabstrip@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/ng-base-forms@2.22.2
  - @memberjunction/ng-explorer-core@2.22.2
  - @memberjunction/ng-form-toolbar@2.22.2
  - @memberjunction/ng-code-editor@2.22.2
  - @memberjunction/ng-container-directives@2.22.2
  - @memberjunction/ng-join-grid@2.22.2
  - @memberjunction/ng-timeline@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/ng-tabstrip@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ng-base-forms@2.22.1
- @memberjunction/ng-explorer-core@2.22.1
- @memberjunction/ng-form-toolbar@2.22.1
- @memberjunction/ng-code-editor@2.22.1
- @memberjunction/ng-container-directives@2.22.1
- @memberjunction/ng-join-grid@2.22.1
- @memberjunction/ng-tabstrip@2.22.1
- @memberjunction/ng-timeline@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
  - @memberjunction/core@2.22.0
  - @memberjunction/ng-base-forms@2.22.0
  - @memberjunction/ng-explorer-core@2.22.0
  - @memberjunction/ng-form-toolbar@2.22.0
  - @memberjunction/ng-code-editor@2.22.0
  - @memberjunction/ng-container-directives@2.22.0
  - @memberjunction/ng-join-grid@2.22.0
  - @memberjunction/ng-timeline@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/ng-tabstrip@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/ng-explorer-core to v2.21.0
- Bump @memberjunction/ng-base-forms to v2.21.0
- Bump @memberjunction/ng-form-toolbar to v2.21.0
- Bump @memberjunction/ng-tabstrip to v2.21.0
- Bump @memberjunction/ng-container-directives to v2.21.0
- Bump @memberjunction/ng-code-editor to v2.21.0
- Bump @memberjunction/ng-timeline to v2.21.0
- Bump @memberjunction/ng-join-grid to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/ng-explorer-core to v2.20.3
- Bump @memberjunction/ng-base-forms to v2.20.3
- Bump @memberjunction/ng-form-toolbar to v2.20.3
- Bump @memberjunction/ng-tabstrip to v2.20.3
- Bump @memberjunction/ng-container-directives to v2.20.3
- Bump @memberjunction/ng-code-editor to v2.20.3
- Bump @memberjunction/ng-timeline to v2.20.3
- Bump @memberjunction/ng-join-grid to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/ng-explorer-core to v2.20.2
- Bump @memberjunction/ng-base-forms to v2.20.2
- Bump @memberjunction/ng-form-toolbar to v2.20.2
- Bump @memberjunction/ng-tabstrip to v2.20.2
- Bump @memberjunction/ng-container-directives to v2.20.2
- Bump @memberjunction/ng-code-editor to v2.20.2
- Bump @memberjunction/ng-timeline to v2.20.2
- Bump @memberjunction/ng-join-grid to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/ng-explorer-core to v2.20.1
- Bump @memberjunction/ng-base-forms to v2.20.1
- Bump @memberjunction/ng-form-toolbar to v2.20.1
- Bump @memberjunction/ng-tabstrip to v2.20.1
- Bump @memberjunction/ng-container-directives to v2.20.1
- Bump @memberjunction/ng-code-editor to v2.20.1
- Bump @memberjunction/ng-timeline to v2.20.1
- Bump @memberjunction/ng-join-grid to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/ng-explorer-core to v2.20.0
- Bump @memberjunction/ng-base-forms to v2.20.0
- Bump @memberjunction/ng-form-toolbar to v2.20.0
- Bump @memberjunction/ng-tabstrip to v2.20.0
- Bump @memberjunction/ng-container-directives to v2.20.0
- Bump @memberjunction/ng-code-editor to v2.20.0
- Bump @memberjunction/ng-timeline to v2.20.0
- Bump @memberjunction/ng-join-grid to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/ng-explorer-core to v2.19.5
- Bump @memberjunction/ng-base-forms to v2.19.5
- Bump @memberjunction/ng-form-toolbar to v2.19.5
- Bump @memberjunction/ng-tabstrip to v2.19.5
- Bump @memberjunction/ng-container-directives to v2.19.5
- Bump @memberjunction/ng-code-editor to v2.19.5
- Bump @memberjunction/ng-timeline to v2.19.5
- Bump @memberjunction/ng-join-grid to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/ng-explorer-core to v2.19.4
- Bump @memberjunction/ng-base-forms to v2.19.4
- Bump @memberjunction/ng-form-toolbar to v2.19.4
- Bump @memberjunction/ng-tabstrip to v2.19.4
- Bump @memberjunction/ng-container-directives to v2.19.4
- Bump @memberjunction/ng-code-editor to v2.19.4
- Bump @memberjunction/ng-timeline to v2.19.4
- Bump @memberjunction/ng-join-grid to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/ng-explorer-core to v2.19.3
- Bump @memberjunction/ng-base-forms to v2.19.3
- Bump @memberjunction/ng-form-toolbar to v2.19.3
- Bump @memberjunction/ng-tabstrip to v2.19.3
- Bump @memberjunction/ng-container-directives to v2.19.3
- Bump @memberjunction/ng-code-editor to v2.19.3
- Bump @memberjunction/ng-timeline to v2.19.3
- Bump @memberjunction/ng-join-grid to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/ng-explorer-core to v2.19.2
- Bump @memberjunction/ng-base-forms to v2.19.2
- Bump @memberjunction/ng-form-toolbar to v2.19.2
- Bump @memberjunction/ng-tabstrip to v2.19.2
- Bump @memberjunction/ng-container-directives to v2.19.2
- Bump @memberjunction/ng-code-editor to v2.19.2
- Bump @memberjunction/ng-timeline to v2.19.2
- Bump @memberjunction/ng-join-grid to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/ng-explorer-core to v2.19.1
- Bump @memberjunction/ng-base-forms to v2.19.1
- Bump @memberjunction/ng-form-toolbar to v2.19.1
- Bump @memberjunction/ng-tabstrip to v2.19.1
- Bump @memberjunction/ng-container-directives to v2.19.1
- Bump @memberjunction/ng-code-editor to v2.19.1
- Bump @memberjunction/ng-timeline to v2.19.1
- Bump @memberjunction/ng-join-grid to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/ng-explorer-core to v2.19.0
- Bump @memberjunction/ng-base-forms to v2.19.0
- Bump @memberjunction/ng-form-toolbar to v2.19.0
- Bump @memberjunction/ng-tabstrip to v2.19.0
- Bump @memberjunction/ng-container-directives to v2.19.0
- Bump @memberjunction/ng-code-editor to v2.19.0
- Bump @memberjunction/ng-timeline to v2.19.0
- Bump @memberjunction/ng-join-grid to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/ng-explorer-core to v2.18.3
- Bump @memberjunction/ng-base-forms to v2.18.3
- Bump @memberjunction/ng-form-toolbar to v2.18.3
- Bump @memberjunction/ng-tabstrip to v2.18.3
- Bump @memberjunction/ng-container-directives to v2.18.3
- Bump @memberjunction/ng-code-editor to v2.18.3
- Bump @memberjunction/ng-timeline to v2.18.3
- Bump @memberjunction/ng-join-grid to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/ng-explorer-core to v2.18.2
- Bump @memberjunction/ng-base-forms to v2.18.2
- Bump @memberjunction/ng-form-toolbar to v2.18.2
- Bump @memberjunction/ng-tabstrip to v2.18.2
- Bump @memberjunction/ng-container-directives to v2.18.2
- Bump @memberjunction/ng-code-editor to v2.18.2
- Bump @memberjunction/ng-timeline to v2.18.2
- Bump @memberjunction/ng-join-grid to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/ng-explorer-core to v2.18.1
- Bump @memberjunction/ng-base-forms to v2.18.1
- Bump @memberjunction/ng-form-toolbar to v2.18.1
- Bump @memberjunction/ng-tabstrip to v2.18.1
- Bump @memberjunction/ng-container-directives to v2.18.1
- Bump @memberjunction/ng-code-editor to v2.18.1
- Bump @memberjunction/ng-timeline to v2.18.1
- Bump @memberjunction/ng-join-grid to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/ng-explorer-core to v2.18.0
- Bump @memberjunction/ng-base-forms to v2.18.0
- Bump @memberjunction/ng-form-toolbar to v2.18.0
- Bump @memberjunction/ng-tabstrip to v2.18.0
- Bump @memberjunction/ng-container-directives to v2.18.0
- Bump @memberjunction/ng-code-editor to v2.18.0
- Bump @memberjunction/ng-timeline to v2.18.0
- Bump @memberjunction/ng-join-grid to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/ng-explorer-core to v2.17.0
- Bump @memberjunction/ng-base-forms to v2.17.0
- Bump @memberjunction/ng-form-toolbar to v2.17.0
- Bump @memberjunction/ng-tabstrip to v2.17.0
- Bump @memberjunction/ng-container-directives to v2.17.0
- Bump @memberjunction/ng-code-editor to v2.17.0
- Bump @memberjunction/ng-timeline to v2.17.0
- Bump @memberjunction/ng-join-grid to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/ng-explorer-core to v2.16.1
- Bump @memberjunction/ng-base-forms to v2.16.1
- Bump @memberjunction/ng-form-toolbar to v2.16.1
- Bump @memberjunction/ng-tabstrip to v2.16.1
- Bump @memberjunction/ng-container-directives to v2.16.1
- Bump @memberjunction/ng-code-editor to v2.16.1
- Bump @memberjunction/ng-timeline to v2.16.1
- Bump @memberjunction/ng-join-grid to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/ng-explorer-core to v2.16.0
- Bump @memberjunction/ng-base-forms to v2.16.0
- Bump @memberjunction/ng-form-toolbar to v2.16.0
- Bump @memberjunction/ng-tabstrip to v2.16.0
- Bump @memberjunction/ng-container-directives to v2.16.0
- Bump @memberjunction/ng-code-editor to v2.16.0
- Bump @memberjunction/ng-timeline to v2.16.0
- Bump @memberjunction/ng-join-grid to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/ng-explorer-core to v2.15.2
- Bump @memberjunction/ng-base-forms to v2.15.2
- Bump @memberjunction/ng-form-toolbar to v2.15.2
- Bump @memberjunction/ng-tabstrip to v2.15.2
- Bump @memberjunction/ng-container-directives to v2.15.2
- Bump @memberjunction/ng-code-editor to v2.15.2
- Bump @memberjunction/ng-timeline to v2.15.2
- Bump @memberjunction/ng-join-grid to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/ng-explorer-core to v2.14.0
- Bump @memberjunction/ng-base-forms to v2.14.0
- Bump @memberjunction/ng-form-toolbar to v2.14.0
- Bump @memberjunction/ng-tabstrip to v2.14.0
- Bump @memberjunction/ng-container-directives to v2.14.0
- Bump @memberjunction/ng-code-editor to v2.14.0
- Bump @memberjunction/ng-timeline to v2.14.0
- Bump @memberjunction/ng-join-grid to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/ng-explorer-core to v2.13.4
- Bump @memberjunction/ng-base-forms to v2.13.4
- Bump @memberjunction/ng-form-toolbar to v2.13.4
- Bump @memberjunction/ng-tabstrip to v2.13.4
- Bump @memberjunction/ng-container-directives to v2.13.4
- Bump @memberjunction/ng-code-editor to v2.13.4
- Bump @memberjunction/ng-timeline to v2.13.4
- Bump @memberjunction/ng-join-grid to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/ng-explorer-core to v2.13.3
- Bump @memberjunction/ng-base-forms to v2.13.3
- Bump @memberjunction/ng-form-toolbar to v2.13.3
- Bump @memberjunction/ng-tabstrip to v2.13.3
- Bump @memberjunction/ng-container-directives to v2.13.3
- Bump @memberjunction/ng-code-editor to v2.13.3
- Bump @memberjunction/ng-timeline to v2.13.3
- Bump @memberjunction/ng-join-grid to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/ng-explorer-core to v2.13.2
- Bump @memberjunction/ng-base-forms to v2.13.2
- Bump @memberjunction/ng-form-toolbar to v2.13.2
- Bump @memberjunction/ng-tabstrip to v2.13.2
- Bump @memberjunction/ng-container-directives to v2.13.2
- Bump @memberjunction/ng-code-editor to v2.13.2
- Bump @memberjunction/ng-timeline to v2.13.2
- Bump @memberjunction/ng-join-grid to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/ng-explorer-core to v2.13.1
- Bump @memberjunction/ng-base-forms to v2.13.1
- Bump @memberjunction/ng-form-toolbar to v2.13.1
- Bump @memberjunction/ng-tabstrip to v2.13.1
- Bump @memberjunction/ng-container-directives to v2.13.1
- Bump @memberjunction/ng-code-editor to v2.13.1
- Bump @memberjunction/ng-timeline to v2.13.1
- Bump @memberjunction/ng-join-grid to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/ng-explorer-core to v2.13.0
- Bump @memberjunction/ng-base-forms to v2.13.0
- Bump @memberjunction/ng-form-toolbar to v2.13.0
- Bump @memberjunction/ng-tabstrip to v2.13.0
- Bump @memberjunction/ng-container-directives to v2.13.0
- Bump @memberjunction/ng-code-editor to v2.13.0
- Bump @memberjunction/ng-timeline to v2.13.0
- Bump @memberjunction/ng-join-grid to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/ng-explorer-core to v2.12.0
- Bump @memberjunction/ng-base-forms to v2.12.0
- Bump @memberjunction/ng-form-toolbar to v2.12.0
- Bump @memberjunction/ng-tabstrip to v2.12.0
- Bump @memberjunction/ng-container-directives to v2.12.0
- Bump @memberjunction/ng-code-editor to v2.12.0
- Bump @memberjunction/ng-timeline to v2.12.0
- Bump @memberjunction/ng-join-grid to v2.12.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/ng-explorer-core to v2.11.0
- Bump @memberjunction/ng-base-forms to v2.11.0
- Bump @memberjunction/ng-form-toolbar to v2.11.0
- Bump @memberjunction/ng-tabstrip to v2.11.0
- Bump @memberjunction/ng-container-directives to v2.11.0
- Bump @memberjunction/ng-code-editor to v2.11.0
- Bump @memberjunction/ng-timeline to v2.11.0
- Bump @memberjunction/ng-join-grid to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/ng-explorer-core to v2.10.0
- Bump @memberjunction/ng-base-forms to v2.10.0
- Bump @memberjunction/ng-form-toolbar to v2.10.0
- Bump @memberjunction/ng-tabstrip to v2.10.0
- Bump @memberjunction/ng-container-directives to v2.10.0
- Bump @memberjunction/ng-code-editor to v2.10.0
- Bump @memberjunction/ng-timeline to v2.10.0
- Bump @memberjunction/ng-join-grid to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/ng-explorer-core to v2.9.0
- Bump @memberjunction/ng-base-forms to v2.9.0
- Bump @memberjunction/ng-form-toolbar to v2.9.0
- Bump @memberjunction/ng-tabstrip to v2.9.0
- Bump @memberjunction/ng-container-directives to v2.9.0
- Bump @memberjunction/ng-code-editor to v2.9.0
- Bump @memberjunction/ng-timeline to v2.9.0
- Bump @memberjunction/ng-join-grid to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/ng-explorer-core to v2.8.0
- Bump @memberjunction/ng-base-forms to v2.8.0
- Bump @memberjunction/ng-form-toolbar to v2.8.0
- Bump @memberjunction/ng-tabstrip to v2.8.0
- Bump @memberjunction/ng-container-directives to v2.8.0
- Bump @memberjunction/ng-code-editor to v2.8.0
- Bump @memberjunction/ng-timeline to v2.8.0
- Bump @memberjunction/ng-join-grid to v2.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/ng-explorer-core to v2.7.1
- Bump @memberjunction/ng-base-forms to v2.7.1
- Bump @memberjunction/ng-form-toolbar to v2.7.1
- Bump @memberjunction/ng-tabstrip to v2.7.1
- Bump @memberjunction/ng-container-directives to v2.7.1
- Bump @memberjunction/ng-code-editor to v2.7.1
- Bump @memberjunction/ng-timeline to v2.7.1
- Bump @memberjunction/ng-join-grid to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/ng-explorer-core to v2.7.0
- Bump @memberjunction/ng-base-forms to v2.7.0
- Bump @memberjunction/ng-form-toolbar to v2.7.0
- Bump @memberjunction/ng-tabstrip to v2.7.0
- Bump @memberjunction/ng-container-directives to v2.7.0
- Bump @memberjunction/ng-code-editor to v2.7.0
- Bump @memberjunction/ng-timeline to v2.7.0
- Bump @memberjunction/ng-join-grid to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/ng-explorer-core to v2.6.1
- Bump @memberjunction/ng-base-forms to v2.6.1
- Bump @memberjunction/ng-form-toolbar to v2.6.1
- Bump @memberjunction/ng-tabstrip to v2.6.1
- Bump @memberjunction/ng-container-directives to v2.6.1
- Bump @memberjunction/ng-code-editor to v2.6.1
- Bump @memberjunction/ng-timeline to v2.6.1
- Bump @memberjunction/ng-join-grid to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/ng-explorer-core to v2.6.0
- Bump @memberjunction/ng-base-forms to v2.6.0
- Bump @memberjunction/ng-form-toolbar to v2.6.0
- Bump @memberjunction/ng-tabstrip to v2.6.0
- Bump @memberjunction/ng-container-directives to v2.6.0
- Bump @memberjunction/ng-code-editor to v2.6.0
- Bump @memberjunction/ng-timeline to v2.6.0
- Bump @memberjunction/ng-join-grid to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/ng-explorer-core to v2.5.2
- Bump @memberjunction/ng-base-forms to v2.5.2
- Bump @memberjunction/ng-form-toolbar to v2.5.2
- Bump @memberjunction/ng-tabstrip to v2.5.2
- Bump @memberjunction/ng-container-directives to v2.5.2
- Bump @memberjunction/ng-code-editor to v2.5.2
- Bump @memberjunction/ng-timeline to v2.5.2
- Bump @memberjunction/ng-join-grid to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/ng-explorer-core to v2.5.1
- Bump @memberjunction/ng-base-forms to v2.5.1
- Bump @memberjunction/ng-form-toolbar to v2.5.1
- Bump @memberjunction/ng-tabstrip to v2.5.1
- Bump @memberjunction/ng-container-directives to v2.5.1
- Bump @memberjunction/ng-code-editor to v2.5.1
- Bump @memberjunction/ng-timeline to v2.5.1
- Bump @memberjunction/ng-join-grid to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/ng-explorer-core to v2.5.0
- Bump @memberjunction/ng-base-forms to v2.5.0
- Bump @memberjunction/ng-form-toolbar to v2.5.0
- Bump @memberjunction/ng-tabstrip to v2.5.0
- Bump @memberjunction/ng-container-directives to v2.5.0
- Bump @memberjunction/ng-code-editor to v2.5.0
- Bump @memberjunction/ng-timeline to v2.5.0
- Bump @memberjunction/ng-join-grid to v2.5.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/ng-explorer-core to v2.4.1
- Bump @memberjunction/ng-base-forms to v2.4.1
- Bump @memberjunction/ng-form-toolbar to v2.4.1
- Bump @memberjunction/ng-tabstrip to v2.4.1
- Bump @memberjunction/ng-container-directives to v2.4.1
- Bump @memberjunction/ng-code-editor to v2.4.1
- Bump @memberjunction/ng-timeline to v2.4.1
- Bump @memberjunction/ng-join-grid to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/ng-explorer-core to v2.4.0
- Bump @memberjunction/ng-base-forms to v2.4.0
- Bump @memberjunction/ng-form-toolbar to v2.4.0
- Bump @memberjunction/ng-tabstrip to v2.4.0
- Bump @memberjunction/ng-container-directives to v2.4.0
- Bump @memberjunction/ng-code-editor to v2.4.0
- Bump @memberjunction/ng-timeline to v2.4.0
- Bump @memberjunction/ng-join-grid to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Minor changes

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/ng-explorer-core to v2.3.3
- Bump @memberjunction/ng-base-forms to v2.3.3
- Bump @memberjunction/ng-form-toolbar to v2.3.3
- Bump @memberjunction/ng-tabstrip to v2.3.3
- Bump @memberjunction/ng-container-directives to v2.3.3
- Bump @memberjunction/ng-code-editor to v2.3.3
- Bump @memberjunction/ng-timeline to v2.3.3
- Bump @memberjunction/ng-join-grid to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/ng-explorer-core to v2.3.2
- Bump @memberjunction/ng-base-forms to v2.3.2
- Bump @memberjunction/ng-form-toolbar to v2.3.2
- Bump @memberjunction/ng-tabstrip to v2.3.2
- Bump @memberjunction/ng-container-directives to v2.3.2
- Bump @memberjunction/ng-code-editor to v2.3.2
- Bump @memberjunction/ng-timeline to v2.3.2
- Bump @memberjunction/ng-join-grid to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/ng-explorer-core to v2.3.1
- Bump @memberjunction/ng-base-forms to v2.3.1
- Bump @memberjunction/ng-form-toolbar to v2.3.1
- Bump @memberjunction/ng-tabstrip to v2.3.1
- Bump @memberjunction/ng-container-directives to v2.3.1
- Bump @memberjunction/ng-code-editor to v2.3.1
- Bump @memberjunction/ng-timeline to v2.3.1
- Bump @memberjunction/ng-join-grid to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/ng-explorer-core to v2.3.0
- Bump @memberjunction/ng-base-forms to v2.3.0
- Bump @memberjunction/ng-form-toolbar to v2.3.0
- Bump @memberjunction/ng-tabstrip to v2.3.0
- Bump @memberjunction/ng-container-directives to v2.3.0
- Bump @memberjunction/ng-code-editor to v2.3.0
- Bump @memberjunction/ng-timeline to v2.3.0
- Bump @memberjunction/ng-join-grid to v2.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/ng-explorer-core to v2.2.1
- Bump @memberjunction/ng-base-forms to v2.2.1
- Bump @memberjunction/ng-form-toolbar to v2.2.1
- Bump @memberjunction/ng-tabstrip to v2.2.1
- Bump @memberjunction/ng-container-directives to v2.2.1
- Bump @memberjunction/ng-code-editor to v2.2.1
- Bump @memberjunction/ng-timeline to v2.2.1
- Bump @memberjunction/ng-join-grid to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/ng-explorer-core to v2.2.0
- Bump @memberjunction/ng-base-forms to v2.2.0
- Bump @memberjunction/ng-form-toolbar to v2.2.0
- Bump @memberjunction/ng-tabstrip to v2.2.0
- Bump @memberjunction/ng-container-directives to v2.2.0
- Bump @memberjunction/ng-code-editor to v2.2.0
- Bump @memberjunction/ng-timeline to v2.2.0
- Bump @memberjunction/ng-join-grid to v2.2.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/ng-explorer-core to v2.1.5
- Bump @memberjunction/ng-base-forms to v2.1.5
- Bump @memberjunction/ng-form-toolbar to v2.1.5
- Bump @memberjunction/ng-tabstrip to v2.1.5
- Bump @memberjunction/ng-container-directives to v2.1.5
- Bump @memberjunction/ng-code-editor to v2.1.5
- Bump @memberjunction/ng-timeline to v2.1.5
- Bump @memberjunction/ng-join-grid to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/ng-explorer-core to v2.1.4
- Bump @memberjunction/ng-base-forms to v2.1.4
- Bump @memberjunction/ng-form-toolbar to v2.1.4
- Bump @memberjunction/ng-tabstrip to v2.1.4
- Bump @memberjunction/ng-container-directives to v2.1.4
- Bump @memberjunction/ng-code-editor to v2.1.4
- Bump @memberjunction/ng-timeline to v2.1.4
- Bump @memberjunction/ng-join-grid to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/ng-explorer-core to v2.1.3
- Bump @memberjunction/ng-base-forms to v2.1.3
- Bump @memberjunction/ng-form-toolbar to v2.1.3
- Bump @memberjunction/ng-tabstrip to v2.1.3
- Bump @memberjunction/ng-container-directives to v2.1.3
- Bump @memberjunction/ng-code-editor to v2.1.3
- Bump @memberjunction/ng-timeline to v2.1.3
- Bump @memberjunction/ng-join-grid to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/ng-explorer-core to v2.1.2
- Bump @memberjunction/ng-base-forms to v2.1.2
- Bump @memberjunction/ng-form-toolbar to v2.1.2
- Bump @memberjunction/ng-tabstrip to v2.1.2
- Bump @memberjunction/ng-container-directives to v2.1.2
- Bump @memberjunction/ng-code-editor to v2.1.2
- Bump @memberjunction/ng-timeline to v2.1.2
- Bump @memberjunction/ng-join-grid to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/ng-explorer-core to v2.1.1
- Bump @memberjunction/ng-base-forms to v2.1.1
- Bump @memberjunction/ng-form-toolbar to v2.1.1
- Bump @memberjunction/ng-tabstrip to v2.1.1
- Bump @memberjunction/ng-container-directives to v2.1.1
- Bump @memberjunction/ng-code-editor to v2.1.1
- Bump @memberjunction/ng-timeline to v2.1.1
- Bump @memberjunction/ng-join-grid to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:27 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/ng-explorer-core to v1.8.1
- Bump @memberjunction/ng-base-forms to v1.8.1
- Bump @memberjunction/ng-form-toolbar to v1.8.1
- Bump @memberjunction/ng-tabstrip to v1.8.1
- Bump @memberjunction/ng-container-directives to v1.8.1
- Bump @memberjunction/ng-code-editor to v1.8.1
- Bump @memberjunction/ng-timeline to v1.8.1
- Bump @memberjunction/ng-join-grid to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (jonathan.stfelix@bluecypress.io)
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/ng-explorer-core to v1.8.0
- Bump @memberjunction/ng-base-forms to v1.8.0
- Bump @memberjunction/ng-form-toolbar to v1.8.0
- Bump @memberjunction/ng-tabstrip to v1.8.0
- Bump @memberjunction/ng-container-directives to v1.8.0
- Bump @memberjunction/ng-code-editor to v1.8.0
- Bump @memberjunction/ng-timeline to v1.8.0
- Bump @memberjunction/ng-join-grid to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/ng-explorer-core to v1.7.1
- Bump @memberjunction/ng-base-forms to v1.7.1
- Bump @memberjunction/ng-form-toolbar to v1.7.1
- Bump @memberjunction/ng-tabstrip to v1.7.1
- Bump @memberjunction/ng-container-directives to v1.7.1
- Bump @memberjunction/ng-code-editor to v1.7.1
- Bump @memberjunction/ng-timeline to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/ng-explorer-core to v1.7.0
- Bump @memberjunction/ng-base-forms to v1.7.0
- Bump @memberjunction/ng-form-toolbar to v1.7.0
- Bump @memberjunction/ng-tabstrip to v1.7.0
- Bump @memberjunction/ng-container-directives to v1.7.0
- Bump @memberjunction/ng-code-editor to v1.7.0
- Bump @memberjunction/ng-timeline to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/ng-explorer-core to v1.6.1
- Bump @memberjunction/ng-base-forms to v1.6.1
- Bump @memberjunction/ng-form-toolbar to v1.6.1
- Bump @memberjunction/ng-tabstrip to v1.6.1
- Bump @memberjunction/ng-container-directives to v1.6.1
- Bump @memberjunction/ng-code-editor to v1.6.1
- Bump @memberjunction/ng-timeline to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/ng-explorer-core to v1.6.0
- Bump @memberjunction/ng-base-forms to v1.6.0
- Bump @memberjunction/ng-form-toolbar to v1.6.0
- Bump @memberjunction/ng-tabstrip to v1.6.0
- Bump @memberjunction/ng-container-directives to v1.6.0
- Bump @memberjunction/ng-code-editor to v1.6.0
- Bump @memberjunction/ng-timeline to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/ng-explorer-core to v1.5.3
- Bump @memberjunction/ng-base-forms to v1.5.3
- Bump @memberjunction/ng-form-toolbar to v1.5.3
- Bump @memberjunction/ng-tabstrip to v1.5.3
- Bump @memberjunction/ng-container-directives to v1.5.3
- Bump @memberjunction/ng-code-editor to v1.5.3
- Bump @memberjunction/ng-timeline to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/ng-explorer-core to v1.5.2
- Bump @memberjunction/ng-base-forms to v1.5.2
- Bump @memberjunction/ng-form-toolbar to v1.5.2
- Bump @memberjunction/ng-tabstrip to v1.5.2
- Bump @memberjunction/ng-container-directives to v1.5.2
- Bump @memberjunction/ng-code-editor to v1.5.2
- Bump @memberjunction/ng-timeline to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/ng-explorer-core to v1.5.1
- Bump @memberjunction/ng-base-forms to v1.5.1
- Bump @memberjunction/ng-form-toolbar to v1.5.1
- Bump @memberjunction/ng-tabstrip to v1.5.1
- Bump @memberjunction/ng-container-directives to v1.5.1
- Bump @memberjunction/ng-code-editor to v1.5.1
- Bump @memberjunction/ng-timeline to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/ng-explorer-core to v1.5.0
- Bump @memberjunction/ng-base-forms to v1.5.0
- Bump @memberjunction/ng-form-toolbar to v1.5.0
- Bump @memberjunction/ng-tabstrip to v1.5.0
- Bump @memberjunction/ng-container-directives to v1.5.0
- Bump @memberjunction/ng-code-editor to v1.5.0
- Bump @memberjunction/ng-timeline to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:54 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/ng-explorer-core to v1.4.1
- Bump @memberjunction/ng-base-forms to v1.4.1
- Bump @memberjunction/ng-form-toolbar to v1.4.1
- Bump @memberjunction/ng-tabstrip to v1.4.1
- Bump @memberjunction/ng-container-directives to v1.4.1
- Bump @memberjunction/ng-code-editor to v1.4.1
- Bump @memberjunction/ng-timeline to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/ng-explorer-core to v1.4.0
- Bump @memberjunction/ng-base-forms to v1.4.0
- Bump @memberjunction/ng-tabstrip to v1.4.0
- Bump @memberjunction/ng-container-directives to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/ng-explorer-core to v1.3.3
- Bump @memberjunction/ng-base-forms to v1.3.3
- Bump @memberjunction/ng-tabstrip to v1.3.3
- Bump @memberjunction/ng-container-directives to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/ng-explorer-core to v1.3.2
- Bump @memberjunction/ng-base-forms to v1.3.2
- Bump @memberjunction/ng-tabstrip to v1.3.2
- Bump @memberjunction/ng-container-directives to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/ng-explorer-core to v1.3.1
- Bump @memberjunction/ng-base-forms to v1.3.1
- Bump @memberjunction/ng-tabstrip to v1.3.1
- Bump @memberjunction/ng-container-directives to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/ng-explorer-core to v1.3.0
- Bump @memberjunction/ng-base-forms to v1.3.0
- Bump @memberjunction/ng-tabstrip to v1.3.0
- Bump @memberjunction/ng-container-directives to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/ng-explorer-core to v1.2.2
- Bump @memberjunction/ng-base-forms to v1.2.2
- Bump @memberjunction/ng-tabstrip to v1.2.2
- Bump @memberjunction/ng-container-directives to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/ng-explorer-core to v1.2.1
- Bump @memberjunction/ng-base-forms to v1.2.1
- Bump @memberjunction/ng-tabstrip to v1.2.1
- Bump @memberjunction/ng-container-directives to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/ng-explorer-core to v1.2.0
- Bump @memberjunction/ng-base-forms to v1.2.0
- Bump @memberjunction/ng-tabstrip to v1.2.0
- Bump @memberjunction/ng-container-directives to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/ng-explorer-core to v1.1.3
- Bump @memberjunction/ng-base-forms to v1.1.3
- Bump @memberjunction/ng-tabstrip to v1.1.3
- Bump @memberjunction/ng-container-directives to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/ng-explorer-core to v1.1.2
- Bump @memberjunction/ng-base-forms to v1.1.2
- Bump @memberjunction/ng-tabstrip to v1.1.2
- Bump @memberjunction/ng-container-directives to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/ng-explorer-core to v1.1.1
- Bump @memberjunction/ng-base-forms to v1.1.1
- Bump @memberjunction/ng-tabstrip to v1.1.1
- Bump @memberjunction/ng-container-directives to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/ng-explorer-core to v1.1.0
- Bump @memberjunction/ng-base-forms to v1.1.0
- Bump @memberjunction/ng-tabstrip to v1.1.0
- Bump @memberjunction/ng-container-directives to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- - Created mj-form-field component in the ng-base-forms package which is a higher order way of binding to a given field on an entity and it dynamically selects the needed control. Provides several advantages including the ability to easily upgrade functionality on forms and to conditionally render fields in their entirety only when needed (e.g. not show them at all when read only field and new record). _ Updated CodeGenLib to emit this new style of Angular Code _ Ran Code Gen (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/ng-explorer-core to v1.0.11
- Bump @memberjunction/ng-base-forms to v1.0.11
- Bump @memberjunction/ng-tabstrip to v1.0.11
- Bump @memberjunction/ng-container-directives to v1.0.11

## 1.0.10

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/ng-explorer-core to v1.0.10
- Bump @memberjunction/ng-base-forms to v1.0.9
- Bump @memberjunction/ng-tabstrip to v1.0.9
- Bump @memberjunction/ng-container-directives to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/ng-explorer-core to v1.0.8
- Bump @memberjunction/ng-base-forms to v1.0.8
- Bump @memberjunction/ng-tabstrip to v1.0.8
- Bump @memberjunction/ng-container-directives to v1.0.8
