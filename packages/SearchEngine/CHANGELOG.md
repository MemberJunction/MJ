# @memberjunction/search-engine

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/ai-vectordb@5.43.0
  - @memberjunction/storage@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vectordb@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/storage@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-vectordb@5.41.0
  - @memberjunction/storage@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-vectordb@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/storage@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/storage@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/storage@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/storage@5.39.0

## 5.38.0

### Patch Changes

- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
- Updated dependencies [6b6c321]
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
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-vectordb@5.38.0
  - @memberjunction/storage@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-vectordb@5.37.0
  - @memberjunction/storage@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/storage@5.36.0
  - @memberjunction/ai-vectordb@5.36.0
  - @memberjunction/ai@5.36.0
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
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-vectordb@5.35.0
  - @memberjunction/storage@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-vectordb@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/storage@5.34.1
  - @memberjunction/ai@5.34.1
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

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-vectordb@5.34.0
  - @memberjunction/storage@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Minor Changes

- 7e4957d: Universal search performance + correctness fix: honor `EntityField.UserSearchPredicateAPI`, escape LIKE metacharacters, add resilience layer, and stop CodeGen from re-introducing invalid search flags.

  **Why:** `LIKE '%term%'` was the only SQL the data provider ever generated for non-FTX entities, regardless of the configured predicate. CodeGen has been populating `UserSearchPredicateAPI` (Exact / BeginsWith / EndsWith / Contains) for months, but the runtime was discarding it. Combined with primary keys, non-text columns, and `nvarchar(MAX)` columns being auto-flagged as searchable, every keystroke against the global search box produced unindexed scans across tables of arbitrary size.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.createViewUserSearchSQL` now:
  - Honors `UserSearchPredicateAPI`: `Exact` emits `= N'term'` (index-seekable), `BeginsWith` emits `LIKE N'term%' ESCAPE '\'` (index-seekable), `EndsWith` emits `LIKE N'%term' ESCAPE '\'`, and the default `Contains` emits `LIKE N'%term%' ESCAPE '\'`. `UserSearchParamFormatAPI` still wins when set.
  - Escapes LIKE metacharacters (`%`, `_`, `[`, `]`, `\`) in user input with `ESCAPE '\'`. Previously a query of `50%` was treated as a wildcard.
  - Skips fields that aren't sensible text-search targets (non-text types; unbounded text on non-FTX entities) so an OR'd OR-predicate isn't built around an implicit per-row CONVERT.
  - Emits `N''` Unicode literals throughout to avoid collation surprises.

  **`@memberjunction/core`** — adds `EntityFieldInfo.UserSearchPredicateAPI: string` so consumers see the value the runtime now honors. Default `'Contains'`.

  **`@memberjunction/search-engine`** — Resilience layer:
  - `EntitySearchProvider`, `FullTextSearchProvider`, and `SearchEngine.Search` reject queries shorter than 3 characters early — these always fan out to full-database scans across every searchable entity.
  - `EntitySearchProvider` wraps each per-entity RunView in a 5-second hard timeout. A slow entity no longer holds up the whole fan-out; the other entities' results still land for the user. The underlying SQL keeps running on the server until it finishes (Request cancellation is a follow-up).
  - `SearchEngine.Search` has an in-process LRU result cache keyed by `(userID, query, MaxResults, MinScore, Filters)` with a 30s TTL and 500-entry cap. Preview-mode searches skip the cache. New `ClearResultCache()` admin/test hook.

  **`@memberjunction/codegen-lib`** — CodeGen guardrails so the metadata stays clean:
  - `applySearchableFieldUpdates` now refuses to set `IncludeInUserSearchAPI = 1` on primary keys, non-text columns, or unbounded text columns whose parent entity has `FullTextSearchEnabled = 0`. The LLM can still propose them; CodeGen drops the proposal silently.
  - `applyEntitySearchConfig` refuses to flip `AllowUserSearchAPI` from `0` to `1` on entities whose names match log/audit/run-history patterns (`*Logs`, `*Audit*`, `*Record Changes`, `*Runs`, `*Run Steps/Messages/History`, `*Execution Logs`). It still allows the LLM to _disable_ search on any entity.

  **Migrations (run via Flyway in the same release):**
  - `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` — disables `AllowUserSearchAPI` on 40 `__mj` log / audit / run-history / snapshot entities (Record Changes, Audit Logs, AI Agent + Prompt Runs, Company Integration Runs/Details/API Logs, Error Logs, Action Execution Logs, Test/Workflow/Recommendation/Scheduled/Duplicate Runs, User View Runs/Details, Report Snapshots, Archive Runs/Details, etc.) and clears `IncludeInUserSearchAPI` on PKs, non-text columns, and non-FTX unbounded text columns system-wide. Freezes the corresponding `AutoUpdate*` flags so CodeGen doesn't re-promote any of these silently.
  - `migrations/v5/V202605041300__v5.33.x__EntityField_UserSearchPredicateAPI_Check_Constraint.sql` — adds a trusted CHECK constraint enforcing the four documented values. Defensively normalizes any out-of-band rows to `'Contains'` first.

  **Behavior change to call out:** any caller that previously relied on `%` or `_` in a `UserSearchString` being interpreted as a SQL wildcard will now match those characters literally. There were no such known callers in the MJ ecosystem; this aligns the runtime with the documented contract.

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-vectordb@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/storage@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-vectordb@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/storage@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-vectordb@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/storage@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-vectordb@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/storage@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/storage@5.30.0
  - @memberjunction/ai-vectordb@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-vectordb@5.29.0
  - @memberjunction/storage@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vectordb@5.28.0
  - @memberjunction/storage@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-vectordb@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/storage@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-vectordb@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/storage@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/storage@5.26.0
  - @memberjunction/ai-vectordb@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- e96f683: migration/metadata

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-vectordb@5.25.0
  - @memberjunction/storage@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0
