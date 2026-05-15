# @memberjunction/ng-base-forms

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-entity-viewer@5.34.1
  - @memberjunction/ng-list-management@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-record-changes@5.34.1
  - @memberjunction/ng-record-tags@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- 389d356: Fix XSS vulnerability in search-result highlighters across form-field labels, collapsible-panel section names, and conversation search snippets. Extracted shared `HighlightSearchMatches` helper in `@memberjunction/global` that escapes each text segment individually after a literal-string match, so HTML in the source can never leak into `[innerHTML]` as live markup. Also restored multi-match highlighting that had regressed to single-match.
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

- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-entity-viewer@5.34.0
  - @memberjunction/ng-list-management@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-record-changes@5.34.0
  - @memberjunction/ng-record-tags@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-entity-viewer@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-record-tags@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-list-management@5.33.0
  - @memberjunction/ng-record-changes@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-entity-viewer@5.32.0
  - @memberjunction/ng-list-management@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-record-changes@5.32.0
  - @memberjunction/ng-record-tags@5.32.0
  - @memberjunction/core-entities@5.32.0
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
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-entity-viewer@5.31.0
  - @memberjunction/ng-list-management@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-record-changes@5.31.0
  - @memberjunction/ng-record-tags@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-base-types@5.30.1
- @memberjunction/ng-entity-viewer@5.30.1
- @memberjunction/ng-list-management@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-record-changes@5.30.1
- @memberjunction/ng-record-tags@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ng-base-types@5.30.0
  - @memberjunction/ng-entity-viewer@5.30.0
  - @memberjunction/ng-list-management@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-record-changes@5.30.0
  - @memberjunction/ng-record-tags@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-base-types@5.29.0
  - @memberjunction/ng-entity-viewer@5.29.0
  - @memberjunction/ng-list-management@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-record-changes@5.29.0
  - @memberjunction/ng-record-tags@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-list-management@5.28.0
  - @memberjunction/ng-base-types@5.28.0
  - @memberjunction/ng-entity-viewer@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-record-changes@5.28.0
  - @memberjunction/ng-record-tags@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-base-types@5.27.1
  - @memberjunction/ng-entity-viewer@5.27.1
  - @memberjunction/ng-list-management@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-record-changes@5.27.1
  - @memberjunction/ng-record-tags@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-base-types@5.27.0
- @memberjunction/ng-entity-viewer@5.27.0
- @memberjunction/ng-list-management@5.27.0
- @memberjunction/ng-notifications@5.27.0
- @memberjunction/ng-record-changes@5.27.0
- @memberjunction/ng-record-tags@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-base-types@5.26.0
  - @memberjunction/ng-entity-viewer@5.26.0
  - @memberjunction/ng-list-management@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-record-changes@5.26.0
  - @memberjunction/ng-record-tags@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ng-entity-viewer@5.25.0
  - @memberjunction/ng-base-types@5.25.0
  - @memberjunction/ng-list-management@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-record-changes@5.25.0
  - @memberjunction/ng-record-tags@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ng-record-tags@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-base-types@5.24.0
  - @memberjunction/ng-entity-viewer@5.24.0
  - @memberjunction/ng-list-management@5.24.0
  - @memberjunction/ng-record-changes@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 37dc301: Remove Kendo LayoutModule from CodeGen Angular form template, replace with angular-split
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-base-types@5.23.0
  - @memberjunction/ng-entity-viewer@5.23.0
  - @memberjunction/ng-list-management@5.23.0
  - @memberjunction/ng-record-changes@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-base-types@5.22.0
  - @memberjunction/ng-entity-viewer@5.22.0
  - @memberjunction/ng-list-management@5.22.0
  - @memberjunction/ng-record-changes@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-base-types@5.21.0
  - @memberjunction/ng-entity-viewer@5.21.0
  - @memberjunction/ng-list-management@5.21.0
  - @memberjunction/ng-record-changes@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-base-types@5.20.0
  - @memberjunction/ng-entity-viewer@5.20.0
  - @memberjunction/ng-list-management@5.20.0
  - @memberjunction/ng-record-changes@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-base-types@5.19.0
- @memberjunction/ng-entity-viewer@5.19.0
- @memberjunction/ng-list-management@5.19.0
- @memberjunction/ng-record-changes@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ng-list-management@5.18.0
- @memberjunction/ng-record-changes@5.18.0
- @memberjunction/ng-base-types@5.18.0
- @memberjunction/ng-entity-viewer@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-base-types@5.17.0
  - @memberjunction/ng-entity-viewer@5.17.0
  - @memberjunction/ng-list-management@5.17.0
  - @memberjunction/ng-record-changes@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-base-types@5.16.0
  - @memberjunction/ng-entity-viewer@5.16.0
  - @memberjunction/ng-list-management@5.16.0
  - @memberjunction/ng-record-changes@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-base-types@5.15.0
  - @memberjunction/ng-entity-viewer@5.15.0
  - @memberjunction/ng-list-management@5.15.0
  - @memberjunction/ng-record-changes@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-base-types@5.14.0
  - @memberjunction/ng-entity-viewer@5.14.0
  - @memberjunction/ng-list-management@5.14.0
  - @memberjunction/ng-record-changes@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-base-types@5.13.0
  - @memberjunction/ng-entity-viewer@5.13.0
  - @memberjunction/ng-list-management@5.13.0
  - @memberjunction/ng-record-changes@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

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
  - @memberjunction/ng-entity-viewer@5.12.0
  - @memberjunction/ng-list-management@5.12.0
  - @memberjunction/ng-record-changes@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-base-types@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-base-types@5.11.0
  - @memberjunction/ng-entity-viewer@5.11.0
  - @memberjunction/ng-list-management@5.11.0
  - @memberjunction/ng-record-changes@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-base-types@5.10.1
- @memberjunction/ng-entity-viewer@5.10.1
- @memberjunction/ng-list-management@5.10.1
- @memberjunction/ng-record-changes@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-base-types@5.10.0
  - @memberjunction/ng-entity-viewer@5.10.0
  - @memberjunction/ng-list-management@5.10.0
  - @memberjunction/ng-record-changes@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-base-types@5.9.0
  - @memberjunction/ng-entity-viewer@5.9.0
  - @memberjunction/ng-list-management@5.9.0
  - @memberjunction/ng-record-changes@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-base-types@5.8.0
  - @memberjunction/ng-entity-viewer@5.8.0
  - @memberjunction/ng-list-management@5.8.0
  - @memberjunction/ng-record-changes@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- 7641cd2: Fix form field autocomplete to fall back to ID field
- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-base-types@5.7.0
  - @memberjunction/ng-entity-viewer@5.7.0
  - @memberjunction/ng-list-management@5.7.0
  - @memberjunction/ng-record-changes@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-base-types@5.6.0
  - @memberjunction/ng-entity-viewer@5.6.0
  - @memberjunction/ng-list-management@5.6.0
  - @memberjunction/ng-record-changes@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ng-entity-viewer@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-base-types@5.5.0
  - @memberjunction/ng-list-management@5.5.0
  - @memberjunction/ng-record-changes@5.5.0

## 5.4.1

### Patch Changes

- c28af42: base forms dep fix
  - @memberjunction/ng-list-management@5.4.1
  - @memberjunction/ng-base-types@5.4.1
  - @memberjunction/ng-entity-viewer@5.4.1
  - @memberjunction/ng-record-changes@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1
  - @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-base-types@5.4.0
  - @memberjunction/ng-entity-viewer@5.4.0
  - @memberjunction/ng-list-management@5.4.0
  - @memberjunction/ng-record-changes@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-base-types@5.3.1
- @memberjunction/ng-entity-viewer@5.3.1
- @memberjunction/ng-list-management@5.3.1
- @memberjunction/ng-record-changes@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/ng-entity-viewer@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-base-types@5.3.0
  - @memberjunction/ng-list-management@5.3.0
  - @memberjunction/ng-record-changes@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-entity-viewer@5.2.0
  - @memberjunction/ng-base-types@5.2.0
  - @memberjunction/ng-list-management@5.2.0
  - @memberjunction/ng-record-changes@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-base-types@5.1.0
  - @memberjunction/ng-entity-viewer@5.1.0
  - @memberjunction/ng-list-management@5.1.0
  - @memberjunction/ng-record-changes@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [3cca644]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
- Updated dependencies [90bfa37]
  - @memberjunction/ng-entity-viewer@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-base-types@5.0.0
  - @memberjunction/ng-list-management@5.0.0
  - @memberjunction/ng-record-changes@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-base-types@4.4.0
  - @memberjunction/ng-entity-viewer@4.4.0
  - @memberjunction/ng-list-management@4.4.0
  - @memberjunction/ng-record-changes@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- Updated dependencies [318c578]
  - @memberjunction/ng-record-changes@4.3.1
  - @memberjunction/ng-base-types@4.3.1
  - @memberjunction/ng-entity-viewer@4.3.1
  - @memberjunction/ng-list-management@4.3.1
  - @memberjunction/core@4.3.1
  - @memberjunction/core-entities@4.3.1
  - @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-base-types@4.3.0
  - @memberjunction/ng-entity-viewer@4.3.0
  - @memberjunction/ng-list-management@4.3.0
  - @memberjunction/ng-record-changes@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-base-types@4.2.0
- @memberjunction/ng-entity-viewer@4.2.0
- @memberjunction/ng-list-management@4.2.0
- @memberjunction/ng-record-changes@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/ng-record-changes@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-base-types@4.1.0
  - @memberjunction/ng-entity-viewer@4.1.0
  - @memberjunction/ng-list-management@4.1.0
  - @memberjunction/global@4.1.0
