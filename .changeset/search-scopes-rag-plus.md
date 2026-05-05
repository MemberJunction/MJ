---
"@memberjunction/search-engine": minor
"@memberjunction/ai-vectors-memory": minor
"@memberjunction/ai-vectordb": minor
"@memberjunction/ai-vectors-pinecone": patch
"@memberjunction/ai-vectors-pgvector": patch
"@memberjunction/ai-vectors-qdrant": patch
"@memberjunction/ai-agents": minor
"@memberjunction/core-actions": minor
"@memberjunction/server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-search": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
---

Search Scopes & RAG+ — multi-phase ship

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
- `V202605051200__v5.33.x__Search_Scopes_And_RAG_Plus.sql` —
  consolidated. Contains six DDL sections (Phase 1 baseline,
  `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
  `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
  fix) followed by five CodeGen runs that regenerate the entity
  metadata, sprocs, views, and permission grants for all of the
  above.

**Test suite**
- 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
  driving real LLM tool-calls (Sage agent) against the SearchEngine
  + multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
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
