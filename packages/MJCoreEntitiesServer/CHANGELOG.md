# @memberjunction/core-entities-server

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/tag-engine@5.40.1
  - @memberjunction/ai-prompts@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/ai-vector-dupe@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/doc-utils@5.40.1
  - @memberjunction/generic-database-provider@5.40.1
  - @memberjunction/integration-engine@5.40.1
  - @memberjunction/integration-pk-classifier@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/sqlserver-dataprovider@5.40.1
  - @memberjunction/skip-types@5.40.1
  - @memberjunction/ai-provider-bundle@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-converter@5.40.1
  - @memberjunction/sql-dialect@5.40.1
  - @memberjunction/sql-parser@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [9233802]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/generic-database-provider@5.40.0
  - @memberjunction/sqlserver-dataprovider@5.40.0
  - @memberjunction/tag-engine@5.40.0
  - @memberjunction/sql-converter@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-prompts@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/ai-vector-dupe@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/doc-utils@5.40.0
  - @memberjunction/integration-engine@5.40.0
  - @memberjunction/integration-pk-classifier@5.40.0
  - @memberjunction/skip-types@5.40.0
  - @memberjunction/ai-provider-bundle@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0
  - @memberjunction/sql-parser@5.40.0

## 5.39.0

### Minor Changes

- 1b0f355: Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown
- 34fe6d1: Capture and surface AI prompt-cache cost across providers — OpenRouter provider-reported cost passthrough; per-model cache read/write pricing on AI Model Costs with cache-aware cost calculation; cache-token rollups on AI Prompt Runs and Agent Runs; and cache hit-rate + dollar-savings analytics across the AI dashboards (Cost & Budget, Model Performance, Prompt Runs, Usage Patterns, Executive Summary) and the prompt-run / agent-run detail views. Includes a migration adding cache columns — run CodeGen after applying.

### Patch Changes

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

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [a1e2776]
- Updated dependencies [eaee99f]
- Updated dependencies [2d1b4e1]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/sqlserver-dataprovider@5.39.0
  - @memberjunction/integration-engine@5.39.0
  - @memberjunction/generic-database-provider@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-prompts@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/tag-engine@5.39.0
  - @memberjunction/ai-vector-dupe@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/doc-utils@5.39.0
  - @memberjunction/integration-pk-classifier@5.39.0
  - @memberjunction/skip-types@5.39.0
  - @memberjunction/ai-provider-bundle@5.39.0
  - @memberjunction/sql-converter@5.39.0
  - @memberjunction/sql-dialect@5.39.0
  - @memberjunction/sql-parser@5.39.0

## 5.38.0

### Patch Changes

- 3d739a3: refactor(sql-parser): instance-based parser with dialect adapters, parse-preprocessing, instance-based count SQL, and a render-pipeline write-statement guard
  - **`SQLParser` is now instance-based** (`new SQLParser(sql, dialect)`). AST inspection/mutation (`IsValid`, `StatementKind`, `HasWriteStatement`, `OuterCap`, `SetOuterCap`, `ClearOuterCap`, `ClearOrderBy`, `ToSQL`) and extraction (`ExtractCTEs`, `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`) are instance members; pure string/token utilities (`ParseSQL`, `SqlifyAST`, `StripComments`, `Tokenize`, `Analyze`, `HasUnwrappableTrailingClause`, `HasStackedStatements`, the MJ-template helpers, …) remain static.
  - **Dialect-neutral row caps via an internal `ASTDialectAdapter`** (keyed by `ParserDialect`). The exported `SQLOuterCap` (with its `kind: 'top' | 'limit'`) is replaced by `RowCapInfo` with an explicit `form: 'numeric' | 'percent' | 'opaque'` discriminant. The `isSQLServerDialect()` quote-probe and the `dialect.PlatformKey === 'sqlserver'` branch in the row-cap path are gone (`outerWrap` now uses `dialect.LimitClause()`).
  - **Parse-preprocessing fallback** in the constructor: on a direct-parse failure it aliases bracket-quoted identifiers with parser-defeating characters (`[Active People]`, `[my-cte]`) and splits a trailing `OPTION (...)` clause, then restores both on `ToSQL`. This lets Skip-style CTE queries and `OPTION` queries reach the precise AST row-cap path (`TOP N` / `LIMIT N`) instead of the OFFSET/FETCH or outer-wrap fallback.
  - **Instance-based count SQL**: `QueryPagingEngine`'s count builder is unified onto the instance API (`ExtractCTEs` + `ClearOuterCap` + `ClearOrderBy` + `ToSQL`), removing the last `as unknown as Record<string, unknown>` cast and raw AST field pokes from the engine. The count now strips the outer cap on **both** dialects, so a paged query's `COUNT(*)` reflects the full set — fixing a PostgreSQL inconsistency where an explicit `LIMIT` previously yielded a capped count (SQL Server already stripped `TOP`).
  - **Render-pipeline safety guard** (`RenderPipeline.Run`): a rendered query must be a single read statement, enforced by two complementary checks. (1) `SQLParser.HasWriteStatement` (AST) rejects a write _type_ anywhere — DML (INSERT/UPDATE/DELETE/MERGE/REPLACE), DDL (DROP/CREATE/ALTER/TRUNCATE/RENAME), or EXEC/CALL/GRANT/REVOKE/USE — catching single writes and parseable stacked writes (`SELECT 1; DROP TABLE x`). (2) `SQLParser.HasStackedStatements` (token scan) rejects any internal statement-separating `;`, catching stacked payloads that don't parse (`SELECT 1; EXEC xp_cmdshell '…'`, `SELECT 1; WAITFOR DELAY '…'`) — the class an AST scan misses because the whole string fails to parse. Both are precise: the `REPLACE()` string function and parenthesized SELECTs pass, and a single trailing `;` is fine; only genuine multi-statement inputs (including `SET` / `DECLARE` prefixes) are rejected. (The broad dangerous-keyword scan stays on the ad-hoc execution path, where input is untrusted free text.)
  - **`SQLExpressionValidator`**: `FOR` is now allowed in `full_query` context so `FOR JSON` / `FOR XML` queries aren't wrongly rejected (`FOR UPDATE` remains blocked via the independent `UPDATE` keyword).

  No behavior change for already-valid read queries; preprocessing only widens AST coverage, the count fix only affects paged queries that carried an explicit cap, and the guard only rejects writes/stacked statements. All consumers (`queryPagingEngine`, `queryCompositionEngine`, `query-extraction`, `manage-metadata`, `structuralParser`) migrated to the instance API.

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/generic-database-provider@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sql-parser@5.38.0
  - @memberjunction/sqlserver-dataprovider@5.38.0
  - @memberjunction/skip-types@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/tag-engine@5.38.0
  - @memberjunction/ai-vector-dupe@5.38.0
  - @memberjunction/ai-vectordb@5.38.0
  - @memberjunction/ai-vectors-memory@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/doc-utils@5.38.0
  - @memberjunction/ai@5.38.0
  - @memberjunction/sql-converter@5.38.0
  - @memberjunction/ai-provider-bundle@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/sql-parser@5.37.0
  - @memberjunction/generic-database-provider@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-prompts@5.37.0
  - @memberjunction/skip-types@5.37.0
  - @memberjunction/sqlserver-dataprovider@5.37.0
  - @memberjunction/tag-engine@5.37.0
  - @memberjunction/ai-vectordb@5.37.0
  - @memberjunction/ai-vector-dupe@5.37.0
  - @memberjunction/ai-vectors-memory@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/doc-utils@5.37.0
  - @memberjunction/ai-provider-bundle@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-converter@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/tag-engine@5.36.0
  - @memberjunction/ai-prompts@5.36.0
  - @memberjunction/ai-vector-dupe@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/doc-utils@5.36.0
  - @memberjunction/generic-database-provider@5.36.0
  - @memberjunction/sqlserver-dataprovider@5.36.0
  - @memberjunction/ai-vectordb@5.36.0
  - @memberjunction/ai-vectors-memory@5.36.0
  - @memberjunction/skip-types@5.36.0
  - @memberjunction/ai-provider-bundle@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-converter@5.36.0
  - @memberjunction/sql-dialect@5.36.0
  - @memberjunction/sql-parser@5.36.0

## 5.35.0

### Patch Changes

- 32c4a02: Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [6f083dd]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/generic-database-provider@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ai-prompts@5.35.0
  - @memberjunction/sqlserver-dataprovider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/tag-engine@5.35.0
  - @memberjunction/ai-vectordb@5.35.0
  - @memberjunction/ai-vector-dupe@5.35.0
  - @memberjunction/ai-vectors-memory@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/doc-utils@5.35.0
  - @memberjunction/skip-types@5.35.0
  - @memberjunction/ai-provider-bundle@5.35.0
  - @memberjunction/ai@5.35.0
  - @memberjunction/sql-converter@5.35.0
  - @memberjunction/sql-dialect@5.35.0
  - @memberjunction/sql-parser@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/generic-database-provider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/tag-engine@5.34.1
  - @memberjunction/ai-prompts@5.34.1
  - @memberjunction/ai-vectordb@5.34.1
  - @memberjunction/ai-vector-dupe@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/doc-utils@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/sqlserver-dataprovider@5.34.1
  - @memberjunction/skip-types@5.34.1
  - @memberjunction/ai-provider-bundle@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-converter@5.34.1
  - @memberjunction/sql-dialect@5.34.1
  - @memberjunction/sql-parser@5.34.1

## 5.34.0

### Patch Changes

- 4b8d9ed: Fix deterministic QueryField extraction for explicit SELECT columns — previously relied solely on LLM fallback which silently failed, leaving queries with 0 fields. Also prevents destructive deletion of existing fields when extraction returns null.
- e999e0d: Add cross-server cache invalidation via shared storage provider, fix "No Applications Available" after browser refresh, use cacheSettings.verboseLogging for Redis provider, add ParameterHints to override LLM-generated sampleValues, and thread forceRefresh as BypassCache through BaseEngine config loading
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
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/tag-engine@5.34.0
  - @memberjunction/ai-prompts@5.34.0
  - @memberjunction/ai-provider-bundle@5.34.0
  - @memberjunction/ai-vectordb@5.34.0
  - @memberjunction/ai-vector-dupe@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/doc-utils@5.34.0
  - @memberjunction/generic-database-provider@5.34.0
  - @memberjunction/sql-converter@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sql-parser@5.34.0
  - @memberjunction/sqlserver-dataprovider@5.34.0
  - @memberjunction/skip-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- 5cc5326: PostgreSQL end-to-end support — first MJ release where a fresh PG database can be migrated, codegen'd against, signed into, and synced from `mj sync push` without manual intervention. Plus a structural cleanup pass over how the stack handles the database-platform vocabulary and dialect-aware SQL.

  ### PG fresh-install path
  - **`@memberjunction/postgresql-dataprovider`** — replaces the `Nested transactions are not yet supported` throw with full SAVEPOINT-based nesting (mirrors SQL Server's depth/savepoint model). Adds the missing `ValidateDeleteResult` override that the Phase-2 Save/Delete refactor introduced for SS but skipped for PG, so `BaseEntity.Delete()` correctly recognizes successful deletes on PG. RDS-compatible startup wrapper (no `pg_catalog` writes, rejected by managed PG). Per-connection transaction mutex prevents interleaved BEGIN on shared connections during `mj sync` fan-out.
  - **`@memberjunction/sql-converter`** — new `ConditionalDDLRule` handlers for SS-only patterns that previously survived into PG output untranslated: `IF NOT EXISTS (sys.schemas …) EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`, and `sp_addextendedproperty` schema descriptions → `COMMENT ON SCHEMA "X" IS '...'`. Function-output now emits a `DROP FUNCTION IF EXISTS` guard before recreate so re-runs don't trip "function … is not unique." `ADD COLUMN IF NOT EXISTS` for idempotent column-add migrations. `bit`-parameter body coercion + tagged dollar-quoting on `DO` blocks containing nested `$$`.
  - **`@memberjunction/codegen-lib`** — PG `CodeGenProvider` emits `spCreate*` / `spUpdate*` / `spDelete*` matching the SS-ported baseline (was `fn_create_<snake>`). `pgDialect.ParameterRef` produces `p_<flat lowercase>` matching baseline + runtime `buildCRUDParams`. Without these, every `Save()` against PG failed with `function does not exist`. Pre-pass in `spUpdateExistingEntityFieldsFromSchema` reseats stale negative `Sequence` values from prior interrupted runs at the tail of each entity's positive range, eliminating `UQ_EntityField_EntityID_Sequence` collisions on re-runs. PG-output statement termination — `;` after `INSERT`, `ALTER`, etc. so generated `CodeGen_Run_*.pg.sql` replays cleanly.
  - **`@memberjunction/cli`** (`mj migrate`) — fresh-PG-install blockers: now reads `DB_PLATFORM` from env to select dialect (was config-only); auto-defaults `dbPort` to 5432/1433 based on inferred platform; defaults `BaselineVersion` to `'1'` (Skyway sentinel meaning "auto-select highest-versioned `B__` baseline file"). Without these, `mj migrate` against a PG `.env` silently constructed a `SqlServerProvider`.

  ### Single source of truth for database-platform vocabulary

  Addresses code-review feedback that the stack had three parallel definitions of the same concept and a normalizer in the middle "translating" between them.
  - **`@memberjunction/global`** — new canonical `DatabasePlatform` type (`'sqlserver' | 'postgresql'`) and `resolveDbPlatformFromEnv()` helper that reads from `DB_PLATFORM`. STRICT — only the canonical pair is recognized; legacy aliases (`mssql`, `postgres`, `pg`) are no longer honored, and unrecognized non-empty values **throw** rather than silently falling back to `'sqlserver'`. The earlier dev-only `DB_TYPE` env var is no longer consulted.
  - **`@memberjunction/core`** and **`@memberjunction/sql-dialect`** — both packages re-export `DatabasePlatform` from global instead of defining their own copies.
  - **`@memberjunction/codegen-lib`** — config schema drops `dbType` entirely. `dbPlatform` is the only field. The `dbType()` exported helper is renamed to `dbPlatform()`. `normalizeDbPlatformAndType()` and its tests are deleted.
  - **`@memberjunction/cli`** and **`@memberjunction/server`** — drop their local `resolveDbPlatformFromEnv` copies in favor of the global helper. MJServer's `getDbType()` is now a 1-line wrapper.

  ### SQLDialect as the single source of truth for SQL type ↔ category mapping

  Replaces 5+ hand-coded SQL type-name lists scattered across the codebase ("when you see this pattern repeat, alarm bells").
  - **`@memberjunction/sql-dialect`** — each dialect now exposes 11 typed getters listing the SQL type names IT uses for each conceptual category: `BooleanTypeNames`, `StringTypeNames`, `DateTypeNames`, `IntegerTypeNames`, `FloatTypeNames`, `UuidTypeNames`, `BinaryTypeNames`, `JsonTypeNames`, `CurrencyTypeNames`, `IntervalTypeNames`, `NetworkTypeNames`. New `typeClassification.ts` module unions both dialects into cross-platform predicates (`IsBooleanSQLType`, `IsStringSQLType`, …, plus `IsNumericSQLType` aggregate). New `LowerCase(expr)` method on the base dialect (default `LOWER(${expr})`, ANSI-portable) replaces hardcoded `LOWER(...)` strings in callers. New `BooleanParameterType()` returns `'bit'` on SS, `'boolean'` on PG — used by codegen to emit dialect-correct tolerant-SP `_Clear` parameter declarations. Adding a future dialect = implementing the getters; no other site changes.
  - **`@memberjunction/core`** — `DatabaseProviderBase` gains a `Dialect: SQLDialect` getter, lazily resolved from `PlatformKey`. Server-side code can now write `provider.Dialect.BooleanLiteral(true)` etc. without independently importing `GetDialect`. `util.ts` `TypeScriptTypeFromSQLType` and `FormatValueInternal` rewritten over the predicates — ~70 lines of hardcoded switches collapse to ~25 lines of dispatches. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/codegen-lib`** — `getTypeGraphQLFieldString` 50-line switch replaced with predicate dispatch. `createNewUser.ts` boolean filter that previously avoided dialect-specific SQL via client-side `.filter()` post-pass now uses `dialect.BooleanLiteral(true)` and filters server-side.
  - **`@memberjunction/metadata-sync`** — `sync-engine.ts` lookup-filter type detection uses `IsUuidSQLType` / `IsDateSQLType` instead of a hand-maintained `!== 'uuid' && !== 'datetime' && …` chain. `LOWER()` wrapping goes through `dialect.LowerCase()`. `PushService.ts:isTextLikeColumn` is now a one-liner over `IsStringSQLType`. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/server`** — `auth/newUsers.ts` and `resolvers/IntegrationDiscoveryResolver.ts` boolean filters that previously loaded all rows + filtered client-side now run server-side via `provider.Dialect.BooleanLiteral(true)`.
  - **`@memberjunction/core-entities-server`** — `MJApplicationEntityServer.server.ts` IsActive filter on Users moved server-side via `provider.Dialect.BooleanLiteral(true)`. `MJTemplateContentEntityServer.server.ts` AI enrichment now wrapped in a SAVEPOINT so failures don't poison the outer Save tx (PG's whole-tx-aborts-on-stmt-error policy made this fatal where SS treated it as a per-stmt skip).

  ### Cross-dialect runtime fixes
  - **`@memberjunction/sql-dialect`** — `pgDialect.ParameterRef` flat-lowercase contract; PG type → GraphQL `String` mapping for `character`, `varchar`, `citext`. `sqlDialect.ts` runtime SQL emission: `INTEGER`, `DOUBLE`, `PRECISION`, `BYTEA`, `OID`, `REGCLASS`, `REGPROC`, `NAME` added to `autoQuoteIdentifiers` keyword set so casts in hand-written SQL (`CAST(x AS INTEGER)`) stop being quoted as user-defined types. New `coerceBooleanLiteralsInSQL` pass rewrites SS bit literals (`Bool = 1` / `= 0` / `!= 1` / `<> 0`) to `TRUE`/`FALSE` for fields whose `TSType` is Boolean — fixes `operator does not exist: boolean = integer` for `ExtraFilter` clauses across engines, agents, and dashboards.
  - **`@memberjunction/codegen-lib`** — `applyPermissions` inner catch was binding `e` and shadowing the outer `EntityInfo` loop variable, producing `Error executing permissions file ... for entity undefined` log lines. Renamed to `sqlError` with `instanceof Error` typed message extraction.
  - **`@memberjunction/metadata-sync`** — `mj sync push` tolerates UUID case mismatches (PG returns lowercase, SS returns uppercase) on lookup resolution. `@file:` JSON references serialize to `jsonb` correctly on PG (was double-stringifying via the SS path).
  - **`@memberjunction/core`** (`baseEntity.ts`) — string default values now strip PG's typed-literal wrapper (`'Single'::character varying` → `Single`) before assignment so `MaxLength` validation doesn't fail on the wrapper length.
  - **`@memberjunction/core`** (`entityInfo.ts`) — multi-`IsNameField` resolution rule: when more than one field is marked, prefer the one literally named `Name`. Without this rule the pick depended on insertion order (PG returns DisplayName first, SS returns Name first), producing wrong codegen view aliases on PG.

  ### Breaking changes (for direct config consumers)
  - Any user `mj.config.cjs` with `dbType: 'mssql'` or `dbType: 'postgresql'` must rename to `dbPlatform: 'sqlserver'` or `dbPlatform: 'postgresql'`. The `dbType` field is removed.
  - Any user `.env` with `DB_TYPE=...` must rename it to `DB_PLATFORM=...`. The legacy `DB_TYPE` env var is no longer consulted at all (no fallback). `DB_PLATFORM` accepts only `sqlserver` or `postgresql` (case-insensitive); legacy aliases (`mssql`, `postgres`, `pg`) and any other non-empty value throw a clear "Invalid DB_PLATFORM value" error at startup rather than silently routing the wrong provider.
  - Both `dbType`/`DB_TYPE` were dev-only additions during PG support development (Feb 2026, first appeared in v5.30.0). They were never documented as customer-facing and never exposed a stable contract.

  ### Validation
  - 2,536 unit tests passing across the 8 affected packages (`@memberjunction/global` 381, `@memberjunction/core` 1099, `@memberjunction/sql-dialect` 213, `@memberjunction/codegen-lib` 435, `@memberjunction/metadata-sync` 220, `@memberjunction/server` 188), 0 failed.
  - Fresh-DB PostgreSQL replay clean: `DROP SCHEMA __mj CASCADE` → `mj migrate` applies 127/127 migrations, produces 316 `spCreate*` + 319 `spUpdate*` functions, with 0 `EntityField` rows in the staging-band Sequence range.

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [f94ebd6]
- Updated dependencies [7add405]
- Updated dependencies [b0329f6]
- Updated dependencies [7716c98]
- Updated dependencies [fad046c]
  - @memberjunction/core@5.33.0
  - @memberjunction/generic-database-provider@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/sql-converter@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/sqlserver-dataprovider@5.33.0
  - @memberjunction/ai-prompts@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/tag-engine@5.33.0
  - @memberjunction/ai-vectordb@5.33.0
  - @memberjunction/ai-vector-dupe@5.33.0
  - @memberjunction/ai-vectors-memory@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/doc-utils@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/skip-types@5.33.0
  - @memberjunction/sql-parser@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ai-provider-bundle@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/tag-engine@5.32.0
  - @memberjunction/ai-prompts@5.32.0
  - @memberjunction/ai-vectordb@5.32.0
  - @memberjunction/ai-vector-dupe@5.32.0
  - @memberjunction/ai-vectors-memory@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/doc-utils@5.32.0
  - @memberjunction/generic-database-provider@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/skip-types@5.32.0
  - @memberjunction/ai-provider-bundle@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-converter@5.32.0
  - @memberjunction/sql-dialect@5.32.0
  - @memberjunction/sql-parser@5.32.0

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
- 18be074: Fix boundary wildcard stripping in sqlLike filters, fix QueryProcessor default value handling for array-typed parameters, add Chart.js canvas container and no-unwrap-utility-libs lint rules to react-test-harness, and fix SimpleChart label leak through onDataPointClick
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [3c5176f]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/tag-engine@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-prompts@5.31.0
  - @memberjunction/ai-provider-bundle@5.31.0
  - @memberjunction/ai-vectordb@5.31.0
  - @memberjunction/ai-vector-dupe@5.31.0
  - @memberjunction/ai-vectors-memory@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/doc-utils@5.31.0
  - @memberjunction/generic-database-provider@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/sql-converter@5.31.0
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sql-parser@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0
  - @memberjunction/skip-types@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/tag-engine@5.30.1
- @memberjunction/ai-prompts@5.30.1
- @memberjunction/ai-provider-bundle@5.30.1
- @memberjunction/ai-vectordb@5.30.1
- @memberjunction/ai-vector-dupe@5.30.1
- @memberjunction/ai-vectors-memory@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/doc-utils@5.30.1
- @memberjunction/generic-database-provider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/sql-converter@5.30.1
- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sql-parser@5.30.1
- @memberjunction/sqlserver-dataprovider@5.30.1
- @memberjunction/skip-types@5.30.1

## 5.30.0

### Minor Changes

- c2c5892: Activate Memory Manager consolidation pipeline with drift prevention, entity-attribute contradiction detection, Ebbinghaus decay-based archival, protection tiers, and composite importance scoring. Adds the `AIAgentNote` consolidation schema (`ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, `ImportanceScore`) and enforces the vector-store Status invariant write-side in `MJAIAgentNoteEntityServer.Save()` / `.Delete()` so revoked notes are removed from retrieval without an MJAPI restart. Expands Memory Manager observability with per-phase run-step payloads: `scoreDistribution`, `entityTriplesExtracted`, `decayScoreDistribution`, `protectedPreserved`, `ephemeralAccelerated`, consolidation `triggerType` (forced/time/event/count), a new `Verify Consolidation Output` phase-level run step, and per-cluster `Process Consolidation Cluster` child steps. Adds 95th-percentile uniqueness outlier auto-protection in importance scoring. Deprecates the Memory Cleanup Agent in favor of the unified Memory Manager pipeline.

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [70c054d]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [4e2da93]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-provider-bundle@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/tag-engine@5.30.0
  - @memberjunction/ai-prompts@5.30.0
  - @memberjunction/ai-vector-dupe@5.30.0
  - @memberjunction/generic-database-provider@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/doc-utils@5.30.0
  - @memberjunction/ai-vectordb@5.30.0
  - @memberjunction/ai-vectors-memory@5.30.0
  - @memberjunction/skip-types@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-converter@5.30.0
  - @memberjunction/sql-dialect@5.30.0
  - @memberjunction/sql-parser@5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- 98bad3a: Auto-populate ContentSizeBytes on artifact version saves; redesign non-image attachement tiles with type badge and restore click-to-open/download behavior
- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/sql-parser@5.29.0
  - @memberjunction/generic-database-provider@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/tag-engine@5.29.0
  - @memberjunction/ai-prompts@5.29.0
  - @memberjunction/ai-vectordb@5.29.0
  - @memberjunction/ai-vector-dupe@5.29.0
  - @memberjunction/ai-vectors-memory@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/doc-utils@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/skip-types@5.29.0
  - @memberjunction/sql-converter@5.29.0
  - @memberjunction/ai-provider-bundle@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [fdab4bb]
- Updated dependencies [115e4da]
  - @memberjunction/ai-prompts@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/tag-engine@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vectordb@5.28.0
  - @memberjunction/ai-vector-dupe@5.28.0
  - @memberjunction/ai-vectors-memory@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/doc-utils@5.28.0
  - @memberjunction/generic-database-provider@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/skip-types@5.28.0
  - @memberjunction/ai-provider-bundle@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-converter@5.28.0
  - @memberjunction/sql-parser@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/tag-engine@5.27.1
  - @memberjunction/ai-prompts@5.27.1
  - @memberjunction/ai-vectordb@5.27.1
  - @memberjunction/ai-vector-dupe@5.27.1
  - @memberjunction/ai-vectors-memory@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/doc-utils@5.27.1
  - @memberjunction/generic-database-provider@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/sqlserver-dataprovider@5.27.1
  - @memberjunction/skip-types@5.27.1
  - @memberjunction/ai-provider-bundle@5.27.1
  - @memberjunction/sql-converter@5.27.1
  - @memberjunction/sql-parser@5.27.1

## 5.27.0

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
- Updated dependencies [4357090]
  - @memberjunction/generic-database-provider@5.27.0
  - @memberjunction/sql-parser@5.27.0
  - @memberjunction/sqlserver-dataprovider@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/aiengine@5.27.0
  - @memberjunction/tag-engine@5.27.0
  - @memberjunction/ai-prompts@5.27.0
  - @memberjunction/ai-provider-bundle@5.27.0
  - @memberjunction/ai-vectordb@5.27.0
  - @memberjunction/ai-vector-dupe@5.27.0
  - @memberjunction/ai-vectors-memory@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/doc-utils@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/sql-converter@5.27.0
  - @memberjunction/skip-types@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/skip-types@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/tag-engine@5.26.0
  - @memberjunction/ai-prompts@5.26.0
  - @memberjunction/ai-vector-dupe@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/doc-utils@5.26.0
  - @memberjunction/generic-database-provider@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/ai-vectordb@5.26.0
  - @memberjunction/ai-vectors-memory@5.26.0
  - @memberjunction/ai-provider-bundle@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-converter@5.26.0
  - @memberjunction/sql-parser@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/generic-database-provider@5.25.0
  - @memberjunction/skip-types@5.25.0
  - @memberjunction/sql-parser@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/tag-engine@5.25.0
  - @memberjunction/ai-prompts@5.25.0
  - @memberjunction/ai-vectordb@5.25.0
  - @memberjunction/ai-vector-dupe@5.25.0
  - @memberjunction/ai-vectors-memory@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/doc-utils@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/ai-provider-bundle@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-converter@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/tag-engine@5.24.0
  - @memberjunction/ai-prompts@5.24.0
  - @memberjunction/ai-vectordb@5.24.0
  - @memberjunction/ai-vector-dupe@5.24.0
  - @memberjunction/ai-vectors-memory@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/skip-types@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/ai-provider-bundle@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/doc-utils@5.24.0
  - @memberjunction/generic-database-provider@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-converter@5.24.0
  - @memberjunction/sql-parser@5.24.0

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
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/generic-database-provider@5.23.0
  - @memberjunction/ai-prompts@5.23.0
  - @memberjunction/sqlserver-dataprovider@5.23.0
  - @memberjunction/ai-vectordb@5.23.0
  - @memberjunction/ai-vector-dupe@5.23.0
  - @memberjunction/ai-vectors-memory@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/doc-utils@5.23.0
  - @memberjunction/skip-types@5.23.0
  - @memberjunction/ai@5.23.0
  - @memberjunction/ai-provider-bundle@5.23.0
  - @memberjunction/sql-converter@5.23.0
  - @memberjunction/sql-parser@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-prompts@5.22.0
  - @memberjunction/sql-parser@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ai-vectordb@5.22.0
  - @memberjunction/ai-vector-dupe@5.22.0
  - @memberjunction/ai-vectors-memory@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/skip-types@5.22.0
  - @memberjunction/generic-database-provider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/doc-utils@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/ai-provider-bundle@5.22.0
  - @memberjunction/ai@5.22.0
  - @memberjunction/sql-converter@5.22.0

## 5.21.0

### Patch Changes

- c7dfb20: no migration/metadata changes (yet)
- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
- Updated dependencies [845c980]
  - @memberjunction/ai-vector-dupe@5.21.0
  - @memberjunction/ai-vectors-memory@5.21.0
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-prompts@5.21.0
  - @memberjunction/ai-provider-bundle@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/doc-utils@5.21.0
  - @memberjunction/generic-database-provider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/skip-types@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-converter@5.21.0
  - @memberjunction/sql-parser@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [cc954e1]
- Updated dependencies [2298f8a]
  - @memberjunction/generic-database-provider@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-prompts@5.20.0
  - @memberjunction/ai-vector-dupe@5.20.0
  - @memberjunction/ai-vectors-memory@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/doc-utils@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/skip-types@5.20.0
  - @memberjunction/ai-provider-bundle@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-converter@5.20.0
  - @memberjunction/sql-parser@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/ai-prompts@5.19.0
- @memberjunction/ai-provider-bundle@5.19.0
- @memberjunction/ai-vector-dupe@5.19.0
- @memberjunction/ai-vectors-memory@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/doc-utils@5.19.0
- @memberjunction/generic-database-provider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/sql-converter@5.19.0
- @memberjunction/sql-parser@5.19.0
- @memberjunction/sqlserver-dataprovider@5.19.0
- @memberjunction/skip-types@5.19.0

## 5.18.0

### Patch Changes

- 931740a: Fix SQLParser to extract parameters from Jinja2 control flow conditions ({% if %}/{% elif %}) and remove hardcoded golden-queries reusability check from QueryEntityServer.
- Updated dependencies [322dac6]
- Updated dependencies [931740a]
- Updated dependencies [48f7296]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/sql-parser@5.18.0
  - @memberjunction/ai-prompts@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/skip-types@5.18.0
  - @memberjunction/generic-database-provider@5.18.0
  - @memberjunction/ai-vector-dupe@5.18.0
  - @memberjunction/sqlserver-dataprovider@5.18.0
  - @memberjunction/ai-provider-bundle@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/ai-vectors-memory@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/doc-utils@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/sql-converter@5.18.0

## 5.17.0

### Patch Changes

- 4b6fd2a: Add composable query passthrough parameter bubbling, deterministic field type resolution from dependency queries and entity metadata, MJLexer-based template variable manipulation, and refactor MJQueryEntityServer into a 5-stage extraction pipeline
- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/sql-parser@5.17.0
  - @memberjunction/generic-database-provider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-prompts@5.17.0
  - @memberjunction/ai-vector-dupe@5.17.0
  - @memberjunction/ai-vectors-memory@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/doc-utils@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/skip-types@5.17.0
  - @memberjunction/ai-provider-bundle@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-converter@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/ai-prompts@5.16.0
  - @memberjunction/ai-vector-dupe@5.16.0
  - @memberjunction/ai-vectors-memory@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/doc-utils@5.16.0
  - @memberjunction/generic-database-provider@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/sqlserver-dataprovider@5.16.0
  - @memberjunction/skip-types@5.16.0
  - @memberjunction/ai-provider-bundle@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-converter@5.16.0
  - @memberjunction/sql-parser@5.16.0

## 5.15.0

### Patch Changes

- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/generic-database-provider@5.15.0
  - @memberjunction/sql-parser@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-prompts@5.15.0
  - @memberjunction/ai-provider-bundle@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/ai-vector-dupe@5.15.0
  - @memberjunction/ai-vectors-memory@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/doc-utils@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/sqlserver-dataprovider@5.15.0
  - @memberjunction/skip-types@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-converter@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/generic-database-provider@5.14.0
  - @memberjunction/skip-types@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-prompts@5.14.0
  - @memberjunction/ai-vector-dupe@5.14.0
  - @memberjunction/ai-vectors-memory@5.14.0
  - @memberjunction/doc-utils@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/sqlserver-dataprovider@5.14.0
  - @memberjunction/ai-provider-bundle@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-converter@5.14.0
  - @memberjunction/sql-parser@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/ai-prompts@5.13.0
  - @memberjunction/ai-vector-dupe@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/doc-utils@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/sqlserver-dataprovider@5.13.0
  - @memberjunction/skip-types@5.13.0
  - @memberjunction/ai@5.13.0
  - @memberjunction/ai-provider-bundle@5.13.0
  - @memberjunction/sql-converter@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.
- 1567293: migration

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/skip-types@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ai-prompts@5.12.0
  - @memberjunction/ai-vector-dupe@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/doc-utils@5.12.0
  - @memberjunction/sqlserver-dataprovider@5.12.0
  - @memberjunction/ai-provider-bundle@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0
  - @memberjunction/sql-converter@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/sql-converter@5.11.0
  - @memberjunction/sqlserver-dataprovider@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-prompts@5.11.0
  - @memberjunction/ai-vector-dupe@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/doc-utils@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/skip-types@5.11.0
  - @memberjunction/ai-provider-bundle@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-prompts@5.10.1
- @memberjunction/ai-provider-bundle@5.10.1
- @memberjunction/ai-vector-dupe@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/doc-utils@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/sql-converter@5.10.1
- @memberjunction/sqlserver-dataprovider@5.10.1
- @memberjunction/skip-types@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/skip-types@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/ai-prompts@5.10.0
  - @memberjunction/ai-vector-dupe@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/doc-utils@5.10.0
  - @memberjunction/sqlserver-dataprovider@5.10.0
  - @memberjunction/ai-provider-bundle@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0
  - @memberjunction/sql-converter@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/sqlserver-dataprovider@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/ai-prompts@5.9.0
  - @memberjunction/ai-vector-dupe@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/doc-utils@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/skip-types@5.9.0
  - @memberjunction/ai-provider-bundle@5.9.0
  - @memberjunction/sql-converter@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/sqlserver-dataprovider@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-prompts@5.8.0
  - @memberjunction/ai-vector-dupe@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/doc-utils@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/skip-types@5.8.0
  - @memberjunction/ai-provider-bundle@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0
  - @memberjunction/sql-converter@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ai-prompts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/ai-vector-dupe@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/sqlserver-dataprovider@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/doc-utils@5.7.0
  - @memberjunction/skip-types@5.7.0
  - @memberjunction/ai-provider-bundle@5.7.0
  - @memberjunction/global@5.7.0
  - @memberjunction/sql-converter@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-prompts@5.6.0
  - @memberjunction/ai-vector-dupe@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/doc-utils@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/sqlserver-dataprovider@5.6.0
  - @memberjunction/skip-types@5.6.0
  - @memberjunction/ai-provider-bundle@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0
  - @memberjunction/sql-converter@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ai-provider-bundle@5.5.0
  - @memberjunction/sqlserver-dataprovider@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/sql-converter@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/ai-prompts@5.5.0
  - @memberjunction/ai-vector-dupe@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/doc-utils@5.5.0
  - @memberjunction/skip-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-engine-base@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-prompts@5.4.1
- @memberjunction/ai-provider-bundle@5.4.1
- @memberjunction/ai-vector-dupe@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/doc-utils@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/sqlserver-dataprovider@5.4.1
- @memberjunction/skip-types@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-prompts@5.4.0
  - @memberjunction/ai-vector-dupe@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/doc-utils@5.4.0
  - @memberjunction/sqlserver-dataprovider@5.4.0
  - @memberjunction/skip-types@5.4.0
  - @memberjunction/ai-provider-bundle@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/ai-prompts@5.3.1
- @memberjunction/ai-provider-bundle@5.3.1
- @memberjunction/ai-vector-dupe@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/doc-utils@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/sqlserver-dataprovider@5.3.1
- @memberjunction/skip-types@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-prompts@5.3.0
  - @memberjunction/ai-vector-dupe@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/doc-utils@5.3.0
  - @memberjunction/sqlserver-dataprovider@5.3.0
  - @memberjunction/skip-types@5.3.0
  - @memberjunction/ai-provider-bundle@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/sqlserver-dataprovider@5.2.0
  - @memberjunction/doc-utils@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/aiengine@5.2.0
  - @memberjunction/ai-prompts@5.2.0
  - @memberjunction/ai-vector-dupe@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/skip-types@5.2.0
  - @memberjunction/ai-provider-bundle@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/aiengine@5.1.0
  - @memberjunction/ai-prompts@5.1.0
  - @memberjunction/ai-vector-dupe@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/doc-utils@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/sqlserver-dataprovider@5.1.0
  - @memberjunction/skip-types@5.1.0
  - @memberjunction/ai-provider-bundle@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/sqlserver-dataprovider@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/aiengine@5.0.0
  - @memberjunction/ai-prompts@5.0.0
  - @memberjunction/ai-provider-bundle@5.0.0
  - @memberjunction/ai-vector-dupe@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/doc-utils@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/skip-types@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
- Updated dependencies [3bab2cd]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-provider-bundle@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/ai-prompts@4.4.0
  - @memberjunction/ai-vector-dupe@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/doc-utils@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/sqlserver-dataprovider@4.4.0
  - @memberjunction/skip-types@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-prompts@4.3.1
- @memberjunction/ai-provider-bundle@4.3.1
- @memberjunction/ai-vector-dupe@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/doc-utils@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/sqlserver-dataprovider@4.3.1
- @memberjunction/skip-types@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-prompts@4.3.0
  - @memberjunction/ai-vector-dupe@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/doc-utils@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/skip-types@4.3.0
  - @memberjunction/ai-provider-bundle@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/ai-prompts@4.2.0
- @memberjunction/ai-provider-bundle@4.2.0
- @memberjunction/ai-vector-dupe@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/doc-utils@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/sqlserver-dataprovider@4.2.0
- @memberjunction/skip-types@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- 9fab8ca: ESM Compatibility
- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/sqlserver-dataprovider@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-prompts@4.1.0
  - @memberjunction/ai-vector-dupe@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/doc-utils@4.1.0
  - @memberjunction/skip-types@4.1.0
  - @memberjunction/ai-provider-bundle@4.1.0
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

- 2f86270: no migration
- Updated dependencies [2f86270]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ai-prompts@4.0.0
  - @memberjunction/ai-provider-bundle@4.0.0
  - @memberjunction/ai-vector-dupe@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/doc-utils@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/skip-types@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [d596467]
- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/ai-provider-bundle@3.4.0
  - @memberjunction/ai-prompts@3.4.0
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/ai-vector-dupe@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/doc-utils@3.4.0
  - @memberjunction/skip-types@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
- Updated dependencies [d844955]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/doc-utils@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/ai-prompts@3.3.0
  - @memberjunction/ai-vector-dupe@3.3.0
  - @memberjunction/actions-base@3.3.0
  - @memberjunction/sqlserver-dataprovider@3.3.0
  - @memberjunction/skip-types@3.3.0
  - @memberjunction/ai-provider-bundle@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/skip-types@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/ai-prompts@3.2.0
  - @memberjunction/ai-vector-dupe@3.2.0
  - @memberjunction/actions-base@3.2.0
  - @memberjunction/doc-utils@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/ai-provider-bundle@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai-engine-base@3.1.1
- @memberjunction/ai@3.1.1
- @memberjunction/ai-core-plus@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/ai-prompts@3.1.1
- @memberjunction/ai-provider-bundle@3.1.1
- @memberjunction/ai-vector-dupe@3.1.1
- @memberjunction/actions-base@3.1.1
- @memberjunction/doc-utils@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/sqlserver-dataprovider@3.1.1
- @memberjunction/skip-types@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-engine-base@3.0.0
- @memberjunction/ai@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/ai-prompts@3.0.0
- @memberjunction/ai-provider-bundle@3.0.0
- @memberjunction/ai-vector-dupe@3.0.0
- @memberjunction/actions-base@3.0.0
- @memberjunction/doc-utils@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/sqlserver-dataprovider@3.0.0
- @memberjunction/skip-types@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-prompts@2.133.0
  - @memberjunction/ai-vector-dupe@2.133.0
  - @memberjunction/actions-base@2.133.0
  - @memberjunction/doc-utils@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/skip-types@2.133.0
  - @memberjunction/ai-provider-bundle@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-prompts@2.132.0
  - @memberjunction/ai-vector-dupe@2.132.0
  - @memberjunction/actions-base@2.132.0
  - @memberjunction/doc-utils@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/skip-types@2.132.0
  - @memberjunction/ai-provider-bundle@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-prompts@2.131.0
  - @memberjunction/ai-vector-dupe@2.131.0
  - @memberjunction/actions-base@2.131.0
  - @memberjunction/doc-utils@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/skip-types@2.131.0
  - @memberjunction/ai-provider-bundle@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-engine-base@2.130.1
- @memberjunction/ai@2.130.1
- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-prompts@2.130.1
- @memberjunction/ai-provider-bundle@2.130.1
- @memberjunction/ai-vector-dupe@2.130.1
- @memberjunction/actions-base@2.130.1
- @memberjunction/doc-utils@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/sqlserver-dataprovider@2.130.1
- @memberjunction/skip-types@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/ai-prompts@2.130.0
  - @memberjunction/ai-provider-bundle@2.130.0
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ai-vector-dupe@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/skip-types@2.130.0
  - @memberjunction/actions-base@2.130.0
  - @memberjunction/doc-utils@2.130.0
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
  - @memberjunction/sqlserver-dataprovider@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ai-prompts@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/ai-provider-bundle@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ai-vector-dupe@2.129.0
  - @memberjunction/actions-base@2.129.0
  - @memberjunction/doc-utils@2.129.0
  - @memberjunction/skip-types@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
- Updated dependencies [5f70858]
  - @memberjunction/core@2.128.0
  - @memberjunction/ai-prompts@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-provider-bundle@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/ai-vector-dupe@2.128.0
  - @memberjunction/actions-base@2.128.0
  - @memberjunction/doc-utils@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/skip-types@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/skip-types@2.127.0
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-prompts@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/ai-vector-dupe@2.127.0
  - @memberjunction/actions-base@2.127.0
  - @memberjunction/doc-utils@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/ai-provider-bundle@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai-engine-base@2.126.1
- @memberjunction/ai@2.126.1
- @memberjunction/ai-core-plus@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/ai-prompts@2.126.1
- @memberjunction/ai-provider-bundle@2.126.1
- @memberjunction/ai-vector-dupe@2.126.1
- @memberjunction/actions-base@2.126.1
- @memberjunction/doc-utils@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/sqlserver-dataprovider@2.126.1
- @memberjunction/skip-types@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [d424fce]
- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/skip-types@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-prompts@2.126.0
  - @memberjunction/ai-vector-dupe@2.126.0
  - @memberjunction/actions-base@2.126.0
  - @memberjunction/doc-utils@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/ai-provider-bundle@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/skip-types@2.125.0
  - @memberjunction/ai-engine-base@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/ai-prompts@2.125.0
  - @memberjunction/ai-vector-dupe@2.125.0
  - @memberjunction/actions-base@2.125.0
  - @memberjunction/doc-utils@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/ai-provider-bundle@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [cabe329]
- Updated dependencies [629cf5a]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-prompts@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/ai-vector-dupe@2.124.0
  - @memberjunction/actions-base@2.124.0
  - @memberjunction/doc-utils@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/skip-types@2.124.0
  - @memberjunction/ai-provider-bundle@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-engine-base@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-prompts@2.123.1
- @memberjunction/ai-provider-bundle@2.123.1
- @memberjunction/ai-vector-dupe@2.123.1
- @memberjunction/actions-base@2.123.1
- @memberjunction/doc-utils@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1
- @memberjunction/skip-types@2.123.1

## 2.123.0

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/aiengine@2.123.0
  - @memberjunction/ai-prompts@2.123.0
  - @memberjunction/ai-vector-dupe@2.123.0
  - @memberjunction/sqlserver-dataprovider@2.123.0
  - @memberjunction/ai-provider-bundle@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/actions-base@2.123.0
  - @memberjunction/doc-utils@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/skip-types@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/ai-prompts@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/ai-provider-bundle@2.122.2
  - @memberjunction/ai-vector-dupe@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/actions-base@2.122.2
  - @memberjunction/doc-utils@2.122.2
  - @memberjunction/skip-types@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai-core-plus@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/ai-prompts@2.122.1
- @memberjunction/ai-provider-bundle@2.122.1
- @memberjunction/ai-vector-dupe@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1
- @memberjunction/skip-types@2.122.1

## 2.122.0

### Minor Changes

- c989c45: migration

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/skip-types@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/ai-prompts@2.122.0
  - @memberjunction/ai-vector-dupe@2.122.0
  - @memberjunction/ai-provider-bundle@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai-prompts@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/ai-vector-dupe@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/sqlserver-dataprovider@2.121.0
  - @memberjunction/skip-types@2.121.0
  - @memberjunction/ai-provider-bundle@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/ai-prompts@2.120.0
  - @memberjunction/ai-vector-dupe@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/sqlserver-dataprovider@2.120.0
  - @memberjunction/skip-types@2.120.0
  - @memberjunction/ai-provider-bundle@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
- Updated dependencies [0a133df]
- Updated dependencies [efc6451]
  - @memberjunction/core@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-prompts@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/ai-vector-dupe@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/skip-types@2.119.0
  - @memberjunction/ai-provider-bundle@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 096ece6: migration

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/ai-prompts@2.118.0
  - @memberjunction/ai-vector-dupe@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0
  - @memberjunction/skip-types@2.118.0
  - @memberjunction/ai-provider-bundle@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/aiengine@2.117.0
  - @memberjunction/ai-prompts@2.117.0
  - @memberjunction/ai-vector-dupe@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/sqlserver-dataprovider@2.117.0
  - @memberjunction/skip-types@2.117.0
  - @memberjunction/ai-provider-bundle@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/aiengine@2.116.0
  - @memberjunction/ai-prompts@2.116.0
  - @memberjunction/ai-vector-dupe@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/sqlserver-dataprovider@2.116.0
  - @memberjunction/skip-types@2.116.0
  - @memberjunction/ai-provider-bundle@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [2e0fe8b]
  - @memberjunction/aiengine@2.115.0
  - @memberjunction/ai-prompts@2.115.0
  - @memberjunction/ai-vector-dupe@2.115.0
  - @memberjunction/sqlserver-dataprovider@2.115.0
  - @memberjunction/ai-core-plus@2.115.0
  - @memberjunction/ai-provider-bundle@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0
  - @memberjunction/skip-types@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai-core-plus@2.114.0
- @memberjunction/aiengine@2.114.0
- @memberjunction/ai-prompts@2.114.0
- @memberjunction/ai-provider-bundle@2.114.0
- @memberjunction/ai-vector-dupe@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/sqlserver-dataprovider@2.114.0
- @memberjunction/skip-types@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/aiengine@2.113.2
  - @memberjunction/ai-prompts@2.113.2
  - @memberjunction/ai-vector-dupe@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/sqlserver-dataprovider@2.113.2
  - @memberjunction/skip-types@2.113.2
  - @memberjunction/ai-provider-bundle@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/aiengine@2.112.0
  - @memberjunction/skip-types@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/ai-prompts@2.112.0
  - @memberjunction/ai-vector-dupe@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ai-provider-bundle@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-core-plus@2.110.1
- @memberjunction/aiengine@2.110.1
- @memberjunction/ai-prompts@2.110.1
- @memberjunction/ai-provider-bundle@2.110.1
- @memberjunction/ai-vector-dupe@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/sqlserver-dataprovider@2.110.1
- @memberjunction/skip-types@2.110.1

## 2.110.0

### Minor Changes

- d2d7ab9: migration

### Patch Changes

- 02d72ff: - Sort Zod schema entity field values by sequence in CodeGen for consistent ordering
  - Add unique constraints to QueryCategory and Query tables to prevent duplicates
  - Improve concurrent query creation handling in CreateQueryResolver
  - Fix metadata provider usage in entity server classes
  - Remove automatic error logging from SQLServerDataProvider
- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/aiengine@2.110.0
  - @memberjunction/ai-prompts@2.110.0
  - @memberjunction/ai-vector-dupe@2.110.0
  - @memberjunction/skip-types@2.110.0
  - @memberjunction/ai-provider-bundle@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/aiengine@2.109.0
  - @memberjunction/ai-prompts@2.109.0
  - @memberjunction/ai-vector-dupe@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/skip-types@2.109.0
  - @memberjunction/ai-provider-bundle@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [687e2ae]
- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/aiengine@2.108.0
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ai-prompts@2.108.0
  - @memberjunction/ai-vector-dupe@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0
  - @memberjunction/ai-provider-bundle@2.108.0
  - @memberjunction/skip-types@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai-core-plus@2.107.0
- @memberjunction/aiengine@2.107.0
- @memberjunction/ai-prompts@2.107.0
- @memberjunction/ai-provider-bundle@2.107.0
- @memberjunction/ai-vector-dupe@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/sqlserver-dataprovider@2.107.0
- @memberjunction/skip-types@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/aiengine@2.106.0
- @memberjunction/ai-prompts@2.106.0
- @memberjunction/ai-provider-bundle@2.106.0
- @memberjunction/ai-vector-dupe@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/sqlserver-dataprovider@2.106.0
- @memberjunction/skip-types@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/aiengine@2.105.0
  - @memberjunction/ai-prompts@2.105.0
  - @memberjunction/ai-provider-bundle@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
  - @memberjunction/ai-vector-dupe@2.105.0
  - @memberjunction/skip-types@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Minor Changes

- 9ad6353: migrations

### Patch Changes

- 4567af3: **Component Feedback System (Registry-Agnostic)**

  Implement comprehensive component feedback system that works across any component registry (Skip, MJ Central, etc.) with support for custom feedback handlers.
  - Add skip-component-feedback-panel component with sliding panel UI (444 lines CSS, 161 lines HTML, 274 lines TS)
  - Add star ratings (0-5 scale), comments, and component hierarchy visualization
  - Add FeedbackHandler interface for customizable feedback logic per registry
  - Add ComponentFeedbackParams and ComponentFeedbackResponse types with full parameter set
  - Add POST /api/v1/feedback endpoint to ComponentRegistryAPIServer
  - Add submitFeedback() method to ComponentRegistryClient SDK
  - Add SendComponentFeedback mutation to ComponentRegistryResolver (replaces AskSkipResolver implementation)
  - Use ComponentRegistryClient SDK with REGISTRY*URI_OVERRIDE*_ and REGISTRY*API_KEY*_ support
  - Update skip-artifact-viewer to use GraphQLComponentRegistryClient for feedback submission
  - Extract registry name from component spec with fallback to 'Skip'
  - Update dynamic-ui-component and linear-report with component hierarchy tracking
  - Pass conversationID and authenticated user email for contact resolution

  **React Runtime Debug Logging Enhancements**

  Restore debug logging with production guards for better debugging capabilities.
  - Restore 12 debug console.log statements throughout React runtime (prop-builder, component-hierarchy)
  - Wrap all debug logs with LogStatus/GetProductionStatus checks
  - Add comprehensive README.md documentation (95 lines) for debug configuration
  - Logs only execute when not in production mode
  - Update ReactDebugConfig with enhanced environment variable support

  **AI Prompt Error Handling Improvements**

  Replace hardcoded error truncation with configurable maxErrorLength parameter.
  - Add maxErrorLength?: number property to AIPromptParams class
  - Update AIPromptRunner.logError() to accept maxErrorLength in options
  - Thread maxErrorLength through 18 logError calls throughout AIPromptRunner
  - Remove hardcoded MAX_ERROR_LENGTH constant (500 chars)
  - When undefined (default), errors are returned in full for debugging
  - When set, errors are truncated with "... [truncated]" suffix

  **Bug Fixes**
  - Fix AI parameter extraction edge cases in AIPromptRunner and QueryEntity
  - Fix mj.config.cjs configuration
  - Fix component hierarchy tracking in dynamic reports

  Addresses PR #1426 comments #5, #7, and #8

- Updated dependencies [aafa827]
- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
- Updated dependencies [6e7f14a]
  - @memberjunction/ai-prompts@2.104.0
  - @memberjunction/global@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/sqlserver-dataprovider@2.104.0
  - @memberjunction/aiengine@2.104.0
  - @memberjunction/ai-local-embeddings@2.104.0
  - @memberjunction/ai-vector-dupe@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/skip-types@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/ai-local-embeddings@2.103.0
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/ai-vector-dupe@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/ai-core-plus@2.103.0
  - @memberjunction/ai-prompts@2.103.0
  - @memberjunction/aiengine@2.103.0
  - @memberjunction/skip-types@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/skip-types@2.100.3
- @memberjunction/ai-core-plus@2.100.3
- @memberjunction/aiengine@2.100.3
- @memberjunction/ai-prompts@2.100.3
- @memberjunction/ai-vector-dupe@2.100.3
- @memberjunction/sqlserver-dataprovider@2.100.3
- @memberjunction/ai-local-embeddings@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai-core-plus@2.100.2
- @memberjunction/aiengine@2.100.2
- @memberjunction/ai-prompts@2.100.2
- @memberjunction/ai-local-embeddings@2.100.2
- @memberjunction/ai-vector-dupe@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2
- @memberjunction/sqlserver-dataprovider@2.100.2
- @memberjunction/skip-types@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai-core-plus@2.100.1
- @memberjunction/aiengine@2.100.1
- @memberjunction/ai-prompts@2.100.1
- @memberjunction/ai-local-embeddings@2.100.1
- @memberjunction/ai-vector-dupe@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1
- @memberjunction/skip-types@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ai-core-plus@2.100.0
  - @memberjunction/aiengine@2.100.0
  - @memberjunction/ai-prompts@2.100.0
  - @memberjunction/ai-vector-dupe@2.100.0
  - @memberjunction/sqlserver-dataprovider@2.100.0
  - @memberjunction/skip-types@2.100.0
  - @memberjunction/ai-local-embeddings@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ai-core-plus@2.99.0
  - @memberjunction/aiengine@2.99.0
  - @memberjunction/ai-prompts@2.99.0
  - @memberjunction/ai-vector-dupe@2.99.0
  - @memberjunction/sqlserver-dataprovider@2.99.0
  - @memberjunction/skip-types@2.99.0
  - @memberjunction/ai-local-embeddings@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai-core-plus@2.98.0
- @memberjunction/aiengine@2.98.0
- @memberjunction/ai-prompts@2.98.0
- @memberjunction/ai-local-embeddings@2.98.0
- @memberjunction/ai-vector-dupe@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/sqlserver-dataprovider@2.98.0
- @memberjunction/skip-types@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/skip-types@2.97.0
- @memberjunction/ai-core-plus@2.97.0
- @memberjunction/aiengine@2.97.0
- @memberjunction/ai-prompts@2.97.0
- @memberjunction/ai-vector-dupe@2.97.0
- @memberjunction/sqlserver-dataprovider@2.97.0
- @memberjunction/ai-local-embeddings@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
- Updated dependencies [8f34e55]
  - @memberjunction/core@2.96.0
  - @memberjunction/ai-prompts@2.96.0
  - @memberjunction/ai-core-plus@2.96.0
  - @memberjunction/aiengine@2.96.0
  - @memberjunction/ai-vector-dupe@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/sqlserver-dataprovider@2.96.0
  - @memberjunction/skip-types@2.96.0
  - @memberjunction/ai-local-embeddings@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/ai-core-plus@2.95.0
  - @memberjunction/aiengine@2.95.0
  - @memberjunction/ai-prompts@2.95.0
  - @memberjunction/ai-vector-dupe@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/sqlserver-dataprovider@2.95.0
  - @memberjunction/skip-types@2.95.0
  - @memberjunction/ai-local-embeddings@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/skip-types@2.94.0
- @memberjunction/ai-core-plus@2.94.0
- @memberjunction/aiengine@2.94.0
- @memberjunction/ai-prompts@2.94.0
- @memberjunction/ai-vector-dupe@2.94.0
- @memberjunction/sqlserver-dataprovider@2.94.0
- @memberjunction/ai-local-embeddings@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/sqlserver-dataprovider@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ai-core-plus@2.93.0
  - @memberjunction/aiengine@2.93.0
  - @memberjunction/ai-prompts@2.93.0
  - @memberjunction/ai-vector-dupe@2.93.0
  - @memberjunction/skip-types@2.93.0
  - @memberjunction/ai-local-embeddings@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [5161d9f]
- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/ai-local-embeddings@2.92.0
  - @memberjunction/core@2.92.0
  - @memberjunction/sqlserver-dataprovider@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/skip-types@2.92.0
  - @memberjunction/ai-core-plus@2.92.0
  - @memberjunction/aiengine@2.92.0
  - @memberjunction/ai-prompts@2.92.0
  - @memberjunction/ai-vector-dupe@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Minor Changes

- 6476d74: migrations

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/ai-local-embeddings@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/ai-core-plus@2.91.0
  - @memberjunction/aiengine@2.91.0
  - @memberjunction/ai-prompts@2.91.0
  - @memberjunction/ai-vector-dupe@2.91.0
  - @memberjunction/sqlserver-dataprovider@2.91.0
  - @memberjunction/skip-types@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Minor Changes

- 146ebcc: migration
- d5d26d7: migration

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/aiengine@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/skip-types@2.90.0
  - @memberjunction/ai-prompts@2.90.0
  - @memberjunction/ai-vector-dupe@2.90.0
  - @memberjunction/sqlserver-dataprovider@2.90.0
  - @memberjunction/ai-core-plus@2.90.0
  - @memberjunction/ai-local-embeddings@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
- Updated dependencies [34d456e]
  - @memberjunction/ai-core-plus@2.89.0
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/sqlserver-dataprovider@2.89.0
  - @memberjunction/aiengine@2.89.0
  - @memberjunction/ai-prompts@2.89.0
  - @memberjunction/ai-vector-dupe@2.89.0
  - @memberjunction/skip-types@2.89.0
  - @memberjunction/ai-local-embeddings@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [56257ed]
- Updated dependencies [df4031f]
  - @memberjunction/sqlserver-dataprovider@2.88.0
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/ai-core-plus@2.88.0
  - @memberjunction/aiengine@2.88.0
  - @memberjunction/ai-prompts@2.88.0
  - @memberjunction/ai-vector-dupe@2.88.0
  - @memberjunction/skip-types@2.88.0
  - @memberjunction/ai-local-embeddings@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/ai-core-plus@2.87.0
  - @memberjunction/aiengine@2.87.0
  - @memberjunction/ai-prompts@2.87.0
  - @memberjunction/ai-vector-dupe@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/sqlserver-dataprovider@2.87.0
  - @memberjunction/skip-types@2.87.0
  - @memberjunction/ai-local-embeddings@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [8846ccc]
- Updated dependencies [7dd2409]
  - @memberjunction/skip-types@2.86.0
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/ai-core-plus@2.86.0
  - @memberjunction/aiengine@2.86.0
  - @memberjunction/ai-prompts@2.86.0
  - @memberjunction/ai-vector-dupe@2.86.0
  - @memberjunction/sqlserver-dataprovider@2.86.0
  - @memberjunction/ai-local-embeddings@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/skip-types@2.85.0
  - @memberjunction/ai-core-plus@2.85.0
  - @memberjunction/aiengine@2.85.0
  - @memberjunction/ai-prompts@2.85.0
  - @memberjunction/ai-local-embeddings@2.85.0
  - @memberjunction/ai-vector-dupe@2.85.0
  - @memberjunction/sqlserver-dataprovider@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/sqlserver-dataprovider@2.84.0
  - @memberjunction/ai-core-plus@2.84.0
  - @memberjunction/aiengine@2.84.0
  - @memberjunction/ai-prompts@2.84.0
  - @memberjunction/ai-vector-dupe@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/skip-types@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
  - @memberjunction/core@2.83.0
  - @memberjunction/aiengine@2.83.0
  - @memberjunction/ai-core-plus@2.83.0
  - @memberjunction/ai-prompts@2.83.0
  - @memberjunction/ai-vector-dupe@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/sqlserver-dataprovider@2.83.0
  - @memberjunction/skip-types@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Minor Changes

- 975e8d1: migration

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/ai-core-plus@2.82.0
  - @memberjunction/ai-prompts@2.82.0
  - @memberjunction/aiengine@2.82.0
  - @memberjunction/ai-vector-dupe@2.82.0
  - @memberjunction/sqlserver-dataprovider@2.82.0
  - @memberjunction/skip-types@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Minor Changes

- e623f99: added DisplayName to Entities entity

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/sqlserver-dataprovider@2.81.0
  - @memberjunction/ai-core-plus@2.81.0
  - @memberjunction/aiengine@2.81.0
  - @memberjunction/ai-prompts@2.81.0
  - @memberjunction/ai-vector-dupe@2.81.0
  - @memberjunction/skip-types@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai-core-plus@2.80.1
- @memberjunction/aiengine@2.80.1
- @memberjunction/ai-prompts@2.80.1
- @memberjunction/ai-vector-dupe@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/sqlserver-dataprovider@2.80.1
- @memberjunction/skip-types@2.80.1

## 2.80.0

### Minor Changes

- 3073dc3: migration

### Patch Changes

- 7c5f844: Bug fixes for SQLServerDataProvider and fix ability to use other providers for MD refreshes up and down the stack
- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/sqlserver-dataprovider@2.80.0
  - @memberjunction/ai-core-plus@2.80.0
  - @memberjunction/aiengine@2.80.0
  - @memberjunction/ai-prompts@2.80.0
  - @memberjunction/ai-vector-dupe@2.80.0
  - @memberjunction/skip-types@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- 4bf2634: migrations

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/ai-prompts@2.79.0
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai-core-plus@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/ai-vector-dupe@2.79.0
  - @memberjunction/sqlserver-dataprovider@2.79.0
  - @memberjunction/core@2.79.0
  - @memberjunction/skip-types@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai-prompts@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-core-plus@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/ai-vector-dupe@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
  - @memberjunction/skip-types@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [476a458]
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/sqlserver-dataprovider@2.77.0
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/ai-core-plus@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/ai-prompts@2.77.0
  - @memberjunction/ai-vector-dupe@2.77.0
  - @memberjunction/skip-types@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Minor Changes

- 4b27b3c: migration file so minor bump

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/sqlserver-dataprovider@2.76.0
  - @memberjunction/ai-core-plus@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/ai-prompts@2.76.0
  - @memberjunction/ai-vector-dupe@2.76.0
  - @memberjunction/skip-types@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [9ccd145]
- Updated dependencies [0da7b51]
  - @memberjunction/ai-prompts@2.75.0
  - @memberjunction/skip-types@2.75.0
  - @memberjunction/sqlserver-dataprovider@2.75.0
  - @memberjunction/ai-core-plus@2.75.0
  - @memberjunction/aiengine@2.75.0
  - @memberjunction/ai-vector-dupe@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/global@2.75.0

## 2.74.0

### Minor Changes

- b70301e: migrations

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [9ff358d]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/ai-prompts@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ai-core-plus@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/ai-vector-dupe@2.74.0
  - @memberjunction/sqlserver-dataprovider@2.74.0
  - @memberjunction/skip-types@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [26c2b03]
- Updated dependencies [eab6a48]
- Updated dependencies [e99336f]
- Updated dependencies [9801456]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/ai-prompts@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai-vector-dupe@2.73.0
  - @memberjunction/sqlserver-dataprovider@2.73.0
  - @memberjunction/ai-core-plus@2.73.0
  - @memberjunction/skip-types@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ai-core-plus@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/ai-prompts@2.72.0
  - @memberjunction/ai-vector-dupe@2.72.0
  - @memberjunction/sqlserver-dataprovider@2.72.0
  - @memberjunction/skip-types@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
- Updated dependencies [91188ab]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai-core-plus@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/ai-prompts@2.71.0
  - @memberjunction/ai-vector-dupe@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/sqlserver-dataprovider@2.71.0
  - @memberjunction/skip-types@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai-core-plus@2.70.0
  - @memberjunction/ai-prompts@2.70.0
  - @memberjunction/skip-types@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/ai-vector-dupe@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/sqlserver-dataprovider@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ai-core-plus@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/ai-prompts@2.69.1
  - @memberjunction/ai-vector-dupe@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/sqlserver-dataprovider@2.69.1
  - @memberjunction/skip-types@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/ai-prompts@2.69.0
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/ai-core-plus@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/ai-vector-dupe@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/sqlserver-dataprovider@2.69.0
  - @memberjunction/skip-types@2.69.0

## 2.68.0

### Patch Changes

- 0f38a61: fix template param parsing
- Updated dependencies [a6b43d0]
- Updated dependencies [6fa0b2d]
- Updated dependencies [b10b7e6]
- Updated dependencies [a0ed038]
  - @memberjunction/sqlserver-dataprovider@2.68.0
  - @memberjunction/ai-prompts@2.68.0
  - @memberjunction/core@2.68.0
  - @memberjunction/skip-types@2.68.0
  - @memberjunction/ai-core-plus@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/ai-vector-dupe@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- Updated dependencies [1fbfc26]
  - @memberjunction/sqlserver-dataprovider@2.67.0
  - @memberjunction/ai-core-plus@2.67.0
  - @memberjunction/aiengine@2.67.0
  - @memberjunction/ai-prompts@2.67.0
  - @memberjunction/ai-vector-dupe@2.67.0
  - @memberjunction/core@2.67.0
  - @memberjunction/core-entities@2.67.0
  - @memberjunction/global@2.67.0
  - @memberjunction/skip-types@2.67.0

## 2.66.0

### Minor Changes

- 7e22e3e: Child Generated Actions - completed implementation!

### Patch Changes

- Updated dependencies [22c1340]
  - @memberjunction/skip-types@2.66.0
  - @memberjunction/ai-core-plus@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/sqlserver-dataprovider@2.66.0
  - @memberjunction/ai-prompts@2.66.0
  - @memberjunction/ai-vector-dupe@2.66.0
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
  - @memberjunction/sqlserver-dataprovider@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-prompts@2.65.0
  - @memberjunction/ai-vector-dupe@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/skip-types@2.65.0

## 2.64.0

### Minor Changes

- e775f2b: Found bug in metadata extraction from SQL Server, fixed and migration to capture changes for 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/skip-types@2.64.0
  - @memberjunction/ai-core-plus@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-prompts@2.64.0
  - @memberjunction/ai-vector-dupe@2.64.0
  - @memberjunction/sqlserver-dataprovider@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai-core-plus@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-prompts@2.63.1
  - @memberjunction/ai-vector-dupe@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/sqlserver-dataprovider@2.63.1
  - @memberjunction/skip-types@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/ai-core-plus@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/ai-prompts@2.63.0
  - @memberjunction/ai-vector-dupe@2.63.0
  - @memberjunction/sqlserver-dataprovider@2.63.0
  - @memberjunction/skip-types@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [4a4b488]
- Updated dependencies [c995603]
  - @memberjunction/ai-prompts@2.62.0
  - @memberjunction/ai-core-plus@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-vector-dupe@2.62.0
  - @memberjunction/sqlserver-dataprovider@2.62.0
  - @memberjunction/skip-types@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/ai-core-plus@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-prompts@2.61.0
  - @memberjunction/sqlserver-dataprovider@2.61.0
  - @memberjunction/ai-vector-dupe@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0
  - @memberjunction/skip-types@2.61.0

## 2.60.0

### Minor Changes

- e30ee12: migrations

### Patch Changes

- Updated dependencies [bb46c63]
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/ai-core-plus@2.60.0
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/ai-prompts@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/ai-vector-dupe@2.60.0
  - @memberjunction/sqlserver-dataprovider@2.60.0
  - @memberjunction/skip-types@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai-core-plus@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-prompts@2.59.0
- @memberjunction/ai-vector-dupe@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/sqlserver-dataprovider@2.59.0
- @memberjunction/skip-types@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/ai-core-plus@2.58.0
  - @memberjunction/ai-prompts@2.58.0
  - @memberjunction/skip-types@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vector-dupe@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-vector-dupe@2.57.0
  - @memberjunction/skip-types@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-vector-dupe@2.56.0
  - @memberjunction/skip-types@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/sqlserver-dataprovider@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-vector-dupe@2.55.0
  - @memberjunction/skip-types@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [dfca664]
- Updated dependencies [0f6e995]
- Updated dependencies [1273b07]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/sqlserver-dataprovider@2.54.0
  - @memberjunction/ai-vector-dupe@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/skip-types@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-vector-dupe@2.53.0
  - @memberjunction/sqlserver-dataprovider@2.53.0
  - @memberjunction/skip-types@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-vector-dupe@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/skip-types@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements

### Patch Changes

- 4a79606: **Breaking circular dependency between AI packages**

  Resolves a circular dependency that was preventing `@memberjunction/core-entities-server` and other packages from
  building during `npm install`.

  **Root Cause:**
  - `@memberjunction/aiengine` imported `AIPromptRunResult` from `@memberjunction/ai-prompts`
  - `@memberjunction/ai-prompts` depended on `@memberjunction/aiengine` in package.json
  - This circular dependency blocked the build chain

  **Solution:**
  - Moved `AIPromptRunResult` and related types to `@memberjunction/ai` as shared types
  - Updated all packages to import from the shared location instead of creating circular references
  - Added comprehensive build failure debugging guide to development documentation

  **Packages Fixed:**
  - `@memberjunction/core-entities-server` now builds successfully
  - All AI packages (`aiengine`, `ai-prompts`, `ai-agents`) build without circular dependency issues
  - Build order now resolves properly in the monorepo

- Updated dependencies [4a79606]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/ai-vector-dupe@2.51.0
  - @memberjunction/skip-types@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-vector-dupe@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/skip-types@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-vector-dupe@2.49.0
  - @memberjunction/skip-types@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [e49a91a]
- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
- Updated dependencies [5c72641]
  - @memberjunction/skip-types@2.48.0
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vector-dupe@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/aiengine@2.47.0
- @memberjunction/ai-vector-dupe@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0
- @memberjunction/global@2.47.0
- @memberjunction/skip-types@2.47.0

## 2.46.0

### Minor Changes

- fa98215: Migration to fix issues in Sequences + new package

### Patch Changes

- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-vector-dupe@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/skip-types@2.46.0
