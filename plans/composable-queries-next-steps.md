# Composable Queries — Next Steps

## Table of Contents

1. [Status Summary](#1-status-summary)
2. [What's Complete](#2-whats-complete)
3. [Sub-Phase E: Agent Query Awareness](#3-sub-phase-e-agent-query-awareness) **(NEXT)**
4. [Sub-Phase B: Server-Side Paging for Queries](#4-sub-phase-b-server-side-paging-for-queries)
5. [Sub-Phase C: Query Caching with TTL](#5-sub-phase-c-query-caching-with-ttl)
6. [Sub-Phase D: PostgreSQL Query Variants](#6-sub-phase-d-postgresql-query-variants)
7. [Future Phase: View-Query Bridge](#7-future-phase-view-query-bridge)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns)
9. [File Inventory](#9-file-inventory)
10. [Remaining Task List](#10-remaining-task-list)

---

## 1. Status Summary

This plan tracks remaining work for the Composable Queries feature set. It supersedes the original `nested-queries-paging-caching-plan.md`.

### Prior Work (COMPLETE)

| Phase | Status | Notes |
|-------|--------|-------|
| **Data Artifact Type** | **COMPLETE** | `metadata/artifact-types/.data-artifact-type.json`, full Angular viewer in `artifacts` package |
| **Query Builder Agent** | **COMPLETE** | Agent + Query Strategist sub-agent, prompts, data sources, payload validation |

### Current Sub-Phases

| Sub-Phase | Status | Notes |
|-----------|--------|-------|
| **A — Composable Query Engine** | **COMPLETE** | Schema, engine, dependency sync, UI, metadata dataset fix — all 21 tasks done |
| **E — Agent Query Awareness** | **NOT STARTED** | Teach Query Builder + Database Research agents about composable queries, existing query catalog, and RunQuery |
| **B — Server-Side Paging** | **NOT STARTED** | CTE-wrapped `OFFSET/FETCH` paging for all query execution |
| **C — Query Caching with TTL** | **PARTIALLY DONE** | QueryCache infrastructure exists; needs PG integration, dependency-graph invalidation, page-aware keys |
| **D — PostgreSQL Variants** | **WIRED UP** | `GetPlatformSQL()` wired through composition chain; PG provider has `PlatformKey` override; needs integration testing |

### Future Phase (Design Only)

| Phase | Status | Notes |
|-------|--------|-------|
| **View-Query Bridge** | **DESIGN ONLY** | Queries that back entity views, with entity/PK column mapping metadata |

---

## 2. What's Complete

### 2.1 Sub-Phase A: Composable Query Engine (ALL TASKS COMPLETE)

**Database Schema:**
- `Reusable` BIT column on Query table
- `QueryDependency` table tracking query-to-query references
- `SQLDialect` table for multi-platform SQL support
- `QuerySQL` table for per-dialect SQL variants
- Migration: `V202603111200__v5.11.x__QueryComposition.sql`

**Composition Engine:** `packages/MJCore/src/generic/queryCompositionEngine.ts`
- `{{query:"Category/Name(params)"}}` macro syntax
- Recursive CTE resolution with cycle detection (max depth 10)
- Static + pass-through parameter modes
- CTE deduplication for same query+params
- Platform-aware CTE name quoting (brackets vs double-quotes)
- Full provenance tracking via `CompositionResult`

**Dependency Sync:** `packages/MJCoreEntitiesServer/src/custom/MJQueryEntityServer.server.ts`
- `syncQueryDependencies()` — auto-extracts and syncs QueryDependency records on query save
- `removeAllQueryDependencies()` — cleanup when query no longer has references
- Cycle detection in save pipeline (warns, doesn't fail save)

**Provider Integration:**
- `GenericDatabaseProvider.processQueryParameters()` calls composition engine before Nunjucks
- Both SQL Server and PostgreSQL providers integrated via `ResolveQueryComposition()`
- Platform-aware SQL resolution via `query.GetPlatformSQL(this.PlatformKey)`

**Metadata Loading:**
- DatasetItem records added for SQLDialects, QuerySQLs, QueryDependencies in MJ_Metadata dataset
- Migration: `V202603111802__v5.11.x__Add_Query_Metadata_Dataset_Items.sql`
- Client-side metadata cache now receives all composition-related data at startup

**MJCore Types:**
- `QueryInfo` — `Reusable`, `SQLDialects`, `QuerySQLs`, `Dependents`, `DependsOn` properties
- `QueryDependencyInfo`, `QuerySQLInfo`, `SQLDialectInfo` info classes
- `GetPlatformSQL(platform)` — 3-tier resolution: QuerySQL child table → PlatformVariants JSON → base SQL

**Angular UI (Query Form):**
- Dependent Queries panel with badge count, expandable details
- Hover tooltips showing dependency paths, aliases, parameter mappings
- Bidirectional: shows both "depends on" and "depended on by"
- Accordion headers shortened: Parameters, Fields, Entities, Details, Permissions

**Unit Tests:** `packages/MJCore/src/__tests__/queryCompositionEngine.test.ts`
- Parser, cycle detection, CTE generation, parameter handling, deduplication

### 2.2 Existing Query Infrastructure

**Already in place:**
- `RunQueryParams` has `StartRow` and `MaxRows` fields (not yet wired for CTE paging)
- `QueryCache` class with LRU + TTL support (`packages/MJCore/src/generic/QueryCache.ts`)
- `QueryCacheConfig` interface with `enabled`, `ttlMinutes`, `maxCacheSize`, `cacheKey` strategy
- PostgreSQL data provider with `InternalRunQuery` and `RunQuerySQLFilterManager` platform detection
- SQL parser utility with CTE support (`packages/MJCoreEntitiesServer/src/custom/sql-parser.ts`)
- Smart cache validation via fingerprint (`maxUpdatedAt` + `rowCount`)
- GraphQL resolvers: `QueryResolver` (saved queries) + `AdhocQueryResolver` (raw SQL)

---

## 3. Sub-Phase E: Agent Query Awareness

**Status: NOT STARTED — Recommended Next Phase**

### 3.1 Overview

Now that the composable query engine is built, our AI agents need to know about it. Two agents need updates with different scopes:

- **Query Builder Agent + Query Strategist**: Full composer — can create new queries that reference existing ones via `{{query:"..."}}` syntax, search the query catalog semantically, understand the full query lifecycle (Reusable, Status, Dependencies), and leverage composition for modular SQL design.
- **Database Research Agent**: Consumer — gains knowledge of the existing query catalog and the ability to run saved queries via RunQuery (instead of always writing ad-hoc SQL), but does NOT create or save new queries.

### 3.2 Query Builder Agent Changes

#### 3.2.1 Enhanced ALL_QUERIES Data Source

The existing `ALL_QUERIES` data source provides basic query metadata (ID, Name, Description, CategoryID, Status). It needs enrichment:

**Add fields:**
- `Reusable` — so the agent knows which queries can be composed
- `SQL` — so the agent can inspect what a reusable query does (needed for composition planning)
- `Parameters` — JSON summary of query parameters (name, type, default) so the agent knows what params to pass
- `Fields` — JSON summary of query output fields (name, type) so the agent knows what columns a composed CTE will expose
- `DependencyCount` — number of queries this one depends on (indicates composition depth)

**Filter to useful queries:** Consider filtering to `Status = 'Approved'` to avoid showing the agent pending/rejected queries that can't be composed.

#### 3.2.2 New Data Source: REUSABLE_QUERIES

A focused data source specifically for composition candidates:

```
Entity: Queries
Filter: Reusable = 1 AND Status = 'Approved'
Fields: ID, Name, Description, CategoryPath, SQL, Parameters (summary), Fields (summary)
```

This gives the Query Strategist a clean catalog of building blocks. The category path enables the `{{query:"Category/Name"}}` reference syntax.

#### 3.2.3 Query Strategist Prompt Updates

The Query Strategist prompt (`templates/query-builder/query-strategist-prompt.md`) needs significant additions:

**New section: "Composable Query Architecture"**
- Explain `{{query:"Category/SubCat/Name(params)"}}` syntax
- Explain that referenced queries resolve to CTEs at execution time
- Explain parameter modes: static (`param='value'`) vs pass-through (`param=paramName`)
- Explain that only `Reusable = true` + `Status = 'Approved'` queries can be referenced
- Explain deduplication: same query+params referenced multiple times → one CTE

**New section: "When to Compose vs Write Fresh"**
- Compose when: an existing reusable query already captures the business logic needed (e.g., "Active Customers", "Revenue By Region")
- Write fresh when: the needed logic is unique to this query and unlikely to be reused
- Compose for layered analysis: e.g., "Top Spenders" = compose "Active Customers" + join with orders
- Don't over-compose: if the existing query is trivially simple (single table, simple filter), just write the SQL inline

**New section: "Searching the Query Catalog"**
- Before writing SQL from scratch, check REUSABLE_QUERIES for existing building blocks
- Match by business concept, not just name (e.g., user asks about "customer churn" → check for "Active Customers", "Customer Retention", "Churned Accounts")
- When composing, always verify the referenced query's output fields match what you need

**New section: "Composition Examples"**
```sql
-- Simple composition: reuse Active Customers
SELECT ac.Name, ac.Email, SUM(o.Total) as TotalSpend
FROM {{query:"Sales/Customers/Active Customers"}} ac
JOIN [__mj].[vwOrders] o ON o.CustomerID = ac.ID
GROUP BY ac.Name, ac.Email
ORDER BY TotalSpend DESC

-- Parameterized composition: pass region through
SELECT r.*, p.ProductName
FROM {{query:"Analytics/Revenue By Region(region=region)"}} r
JOIN [__mj].[vwProducts] p ON p.ID = r.TopProductID
WHERE r.Total > {{minRevenue}}

-- Multi-composition: combine two reusable queries
SELECT ac.Name, rev.TotalRevenue, rev.OrderCount
FROM {{query:"Sales/Active Customers"}} ac
JOIN {{query:"Analytics/Revenue By Customer(year='2024')"}} rev ON rev.CustomerID = ac.ID
WHERE rev.TotalRevenue > 10000
```

**Update existing SQL generation rules:**
- After Step 1 (Explore Schema), add Step 1b: "Search Query Catalog" — check REUSABLE_QUERIES for relevant building blocks before writing SQL
- In Step 3 (Write SQL), add composition as a first-class option alongside direct entity queries

**New guidance: "Making Queries Reusable"**
- When creating a query that captures a broadly useful business concept, suggest setting `Reusable = true`
- Good reusable candidates: filtered entity sets ("Active Customers"), computed metrics ("Monthly Revenue"), complex joins that multiple analyses would need
- Poor reusable candidates: one-off exploratory queries, highly parameterized ad-hoc filters

#### 3.2.4 Query Builder Orchestrator Prompt Updates

The Query Builder orchestrator prompt (`templates/query-builder/system-prompt.md`) needs lighter-touch updates:

- Add awareness that the Strategist can now compose queries from existing reusable queries
- When presenting results to user, mention if composition was used (e.g., "This query builds on your existing 'Active Customers' query")
- Add a `responseForm` option: "Would you like to mark this query as reusable for future composition?"
- When user asks about existing queries, the agent can reference the catalog and suggest running or composing from them

#### 3.2.5 RunQuery Action for Query Builder

Currently the Query Builder tests queries via `Execute Research Query` (ad-hoc SQL). Add the ability to run saved queries by ID:

- Add a new action or extend existing: **Run Saved Query** — executes a saved query by ID with parameter values
- This lets the Strategist test a composed query end-to-end (composition engine resolves `{{query:"..."}}` server-side)
- Parameters: `QueryID` (required), `Parameters` (optional key-value map), `MaxRows` (default 10)

### 3.3 Database Research Agent Changes

#### 3.3.1 New Data Source: AVAILABLE_QUERIES

Add a data source to the Database Research agent providing the query catalog:

```
Entity: Queries
Filter: Status = 'Approved'
Fields: ID, Name, Description, CategoryPath, Parameters (summary), Fields (summary)
```

Unlike the Query Builder, the Research Agent does NOT need the SQL — it treats queries as black boxes it can run and get results from.

#### 3.3.2 New Action: Run Saved Query

Give the Database Research Agent the ability to execute saved queries:

- Action: **Run Saved Query** — executes a query by ID, returns results in the same format as Execute Research Query
- Parameters: `QueryID`, `Parameters` (key-value map), `MaxRows`, `DataFormat` ('csv' or 'json'), `AnalysisRequest`, `ReturnType`
- The agent chooses between ad-hoc SQL and saved queries based on what's available

#### 3.3.3 Database Research Agent Prompt Updates

The Database Research prompt (`templates/research-agent/database-research-agent.md`) needs additions:

**New section: "Available Saved Queries"**
- Before writing ad-hoc SQL, check AVAILABLE_QUERIES for pre-built queries that answer the research question
- Saved queries are pre-validated, optimized, and may use composition (referencing other queries)
- Running a saved query is preferred over writing ad-hoc SQL when a good match exists

**New decision tree addition (before Step 3: Write SQL):**
```
Step 2b: Check Query Catalog
- Review AVAILABLE_QUERIES for relevant saved queries
- If a saved query matches the research need:
  → Use Run Saved Query action instead of writing ad-hoc SQL
  → Pass appropriate parameter values
- If no good match:
  → Proceed to Step 3 (Write SQL) as before
```

**When to use saved queries vs ad-hoc SQL:**
- Use saved query when: it directly answers the research question, or answers a significant part of it
- Use ad-hoc SQL when: no saved query matches, or the research needs a unique perspective on the data
- Can mix: run a saved query for the core data, then write ad-hoc SQL for additional context

**Context efficiency benefit:**
- Saved queries are often well-optimized with proper joins and filters
- Using them reduces the chance of schema errors (wrong field names, missing joins)
- The agent doesn't need to explore entity structure for data already captured by a saved query

### 3.4 Semantic Query Search

#### 3.4.1 Overview

Both agents need to find relevant queries by business concept, not just exact name match. This requires semantic search over the query catalog.

#### 3.4.2 Approach Options

**Option A: LLM-based matching (simpler, immediate)**
- Include full REUSABLE_QUERIES / AVAILABLE_QUERIES in agent context
- Let the LLM's own reasoning match user intent to query descriptions
- Pro: No infrastructure needed, works with existing agent architecture
- Con: Scales poorly beyond ~200 queries (context window pressure)

**Option B: Vector search action (scalable, future)**
- Create a **Search Query Catalog** action that uses MJ's vector/embedding infrastructure
- Input: natural language description of what data is needed
- Output: ranked list of matching queries with relevance scores
- Pro: Scales to thousands of queries, precise matching
- Con: Requires vector embeddings on queries (setup work)

**Recommendation:** Start with Option A (LLM matching via data sources). Move to Option B when query catalogs exceed ~100 reusable queries per organization.

### 3.5 Implementation Considerations

#### 3.5.1 Data Source Enrichment

The ALL_QUERIES and new REUSABLE_QUERIES data sources need query parameters and fields as inline summaries. Two approaches:

**Approach A: Denormalized in data source query**
- JOIN QueryParameter and QueryField into the data source SQL
- Aggregate as JSON arrays per query
- Pro: Single data source load, no extra round-trips
- Con: Large payload if many queries with many params/fields

**Approach B: On-demand via Get Query Details action**
- Keep data sources lightweight (ID, Name, Description, Category)
- Add a **Get Query Details** action that returns full metadata for a specific query
- Pro: Only loads details for queries the agent is interested in
- Con: Extra action call per query investigated

**Recommendation:** Approach A for REUSABLE_QUERIES (typically small catalog), Approach B as a supplemental action for deep inspection.

#### 3.5.2 Run Saved Query Action Implementation

The Run Saved Query action wraps the existing `RunQuery` server-side pipeline:

```typescript
// Simplified action implementation
const result = await provider.RunQuery({
    QueryID: params.QueryID,
    Parameters: params.Parameters,
    MaxRows: params.MaxRows ?? 1000
}, contextUser);
```

This automatically invokes the composition engine, parameter resolution, Nunjucks templating, caching, and audit logging — the agent gets all of that for free.

#### 3.5.3 Category Path for Composition References

The `{{query:"Category/Name"}}` syntax requires the full category path. The REUSABLE_QUERIES data source should include a computed `CategoryPath` field that concatenates the category hierarchy:

```sql
-- Example: "Sales/Customers/Active Customers"
SELECT q.ID, q.Name,
       dbo.fn_GetQueryCategoryPath(q.CategoryID) + '/' + q.Name AS CategoryPath,
       ...
FROM __mj.vwQueries q
WHERE q.Reusable = 1 AND q.Status = 'Approved'
```

This gives the Query Strategist the exact string to use in `{{query:"..."}}` tokens.

---

## 4. Sub-Phase B: Server-Side Paging for Queries

**Status: NOT STARTED**

### 3.1 Overview

Replace the `TOP 100` hack in agent-generated SQL with proper server-side pagination. Wrap the fully-resolved SQL into a CTE and apply `OFFSET/FETCH` paging, with a parallel `COUNT(*)` for total row count.

### 3.2 SQL Wrapping Strategy

#### SQL Server
```sql
WITH QueryCTE AS (
    SELECT col1, col2 FROM ... WHERE ...
)
SELECT *
FROM QueryCTE
ORDER BY <original order by, or default ordering>
OFFSET @offset ROWS
FETCH NEXT @pageSize ROWS ONLY;

-- Parallel COUNT(*)
WITH QueryCTE AS (
    SELECT col1, col2 FROM ... WHERE ...
)
SELECT COUNT(*) AS TotalCount FROM QueryCTE;
```

#### PostgreSQL
```sql
WITH QueryCTE AS (
    SELECT col1, col2 FROM ... WHERE ...
)
SELECT *
FROM QueryCTE
ORDER BY <original order by>
LIMIT @pageSize OFFSET @offset;
```

### 3.3 Paging Engine

**File:** `packages/MJCore/src/generic/queryPagingEngine.ts`

Platform-agnostic logic with platform-specific SQL generation:

```typescript
export class QueryPagingEngine {
    WrapWithPaging(
        resolvedSQL: string,
        platformKey: DatabasePlatform,
        pageNumber: number,   // 1-based
        pageSize: number      // default 100
    ): { dataSQL: string; countSQL: string; offset: number }

    private extractOrderBy(sql: string): { sqlWithoutOrder: string; orderByClause: string | null }
    private stripTopClause(sql: string): string
}
```

### 3.4 API Changes

- Add `TotalRowCount`, `PageNumber`, `PageSize` to `RunQueryResult` in `interfaces.ts`
- Add paging fields to `RunQueryResultType` GraphQL type in `QueryResolver.ts` and `AdhocQueryResolver.ts`

### 3.5 Shared Data Pager Component

Extract reusable `DataPagerComponent` from entity-data-grid into `@memberjunction/ng-shared-generic`.

Wire into:
- `mj-query-data-grid`
- `DataArtifactViewer`

### 3.6 Agent Prompt Updates

Remove `TOP 100` requirement from Query Builder and Query Strategist prompts. Server handles paging transparently.

---

## 5. Sub-Phase C: Query Caching with TTL

**Status: PARTIALLY DONE**

### 4.1 What Exists

| Component | Status | Location |
|-----------|--------|----------|
| `QueryCache` class (LRU + TTL) | **Exists** | `packages/MJCore/src/generic/QueryCache.ts` |
| `QueryCacheConfig` interface | **Exists** | `packages/MJCore/src/generic/QueryCacheConfig.ts` |
| `CachedRunQueryResult` type | **Exists** | `packages/MJCore/src/generic/QueryCacheConfig.ts` |
| `checkQueryCache()` method | **Exists in SSDP** | `SQLServerDataProvider.ts` |
| `QueryInfo.CacheConfig` property | **Exists** | `queryInfo.ts` |
| Client-side smart cache validation | **Exists** | Via `RunQueryWithCacheCheckParams` |
| Cache integrated in `GenericDatabaseProvider` | **Exists** | `InternalRunQuery` checks cache |

### 4.2 What Needs to Be Done

1. **PG provider cache integration** — add cache check/store to `PostgreSQLDataProvider.InternalRunQuery()`
2. **Dependency-graph cache invalidation** — when a query's cache is invalidated, also invalidate caches of all queries that depend on it (using `QueryDependency` data from Sub-Phase A)
3. **Page-aware cache keys** — cache key must include page number and page size when paging is active
4. **Ad-hoc SQL cache key generation** — hash-based keys for queries without a saved queryId
5. **Separate `TotalRowCount` caching** — avoid re-executing count on every page
6. **Cache config UI** — expose TTL and cache settings on the Query form

---

## 6. Sub-Phase D: PostgreSQL Query Variants

**Status: WIRED UP — Needs Integration Testing**

### 5.1 What's Done

- `GetPlatformSQL(platformKey)` resolves correct SQL variant in composition chain
- `QueryCompositionEngine` accepts `platformKey` and uses platform-aware CTE quoting
- `PostgreSQLDataProvider` has `PlatformKey` override returning `'postgresql'`
- `SQLDialect` and `QuerySQL` entities created and wired into metadata

### 5.2 What Remains

- **Integration testing**: Verify end-to-end composition + execution on PostgreSQL
- **PG-specific migration for new tables**: QueryDependency etc. may need PG-syntax migration (follow dual-platform migration patterns)
- **Platform-specific differences to validate**:

| Feature | SQL Server | PostgreSQL |
|---------|-----------|------------|
| CTE syntax | `WITH [Name] AS (...)` | `WITH "Name" AS (...)` |
| Identifier quoting | `[brackets]` | `"double quotes"` |
| Paging | `OFFSET n ROWS FETCH NEXT m ROWS ONLY` | `LIMIT m OFFSET n` |
| Boolean literals | `1`/`0` | `true`/`false` |
| TOP clause | `SELECT TOP 100 ...` | `SELECT ... LIMIT 100` |

---

## 7. Future Phase: View-Query Bridge

> **This section is design-only — not part of the current implementation.**

### 6.1 Concept

Allow a User View to be backed by a Query's logic instead of a simple entity + WHERE clause.

**Required metadata on Query table:**
```sql
ALTER TABLE ${flyway:defaultSchema}.Query
    ADD EntityID UNIQUEIDENTIFIER NULL,
    ADD PrimaryKeyColumnMapping NVARCHAR(500) NULL;
```

### 6.2 How It Would Work

1. `RunView` checks `view.QueryID`
2. If set, delegates to QueryBridge
3. QueryBridge maps view filters → query params, view sort → ORDER BY
4. Executes query with mapped params
5. Maps query columns → entity fields
6. Returns mapped results

### 6.3 Key Design Considerations

- **Entity coupling**: `EntityID` identifies which entity's records the query returns
- **PK mapping**: Maps query output columns to entity primary keys for CRUD actions
- **Filter translation**: Translate entity field filters into query WHERE clauses
- **Permissions**: Reconcile query permissions with entity permissions
- **Performance**: CTEs from composition can't be indexed; may be slower for large datasets

### 6.4 Virtual Entities from Queries

Further extension: wrap a query as a SQL view and register as a read-only MJ entity.
- Query with `Status=Approved` + `Reusable=true` can be "promoted"
- CodeGen creates SQL view from query SQL
- Entity fields derived from `QueryField` metadata
- Read-only — no CRUD

---

## 8. Cross-Cutting Concerns

### 7.1 Security

| Concern | Mitigation |
|---------|------------|
| SQL injection in composed queries | Composition resolves to CTEs with pre-validated SQL from approved queries. Params go through Nunjucks escaping. |
| Unauthorized query access | `UserCanRun()` check on every referenced query in composition chain |
| Agent creating malicious queries | Agent only saves as Pending — human approval required |
| Data exposure through artifacts | Data artifacts execute with current user's permissions |
| Cache poisoning | Cache key includes user context where relevant |

### 7.2 Performance

| Concern | Mitigation |
|---------|------------|
| Deep composition chains | Max depth 10 (configurable) |
| Large CTE chains | SQL Server/PG handle CTEs efficiently; monitor execution plans |
| Cache invalidation cascades | QueryDependency graph enables targeted invalidation |
| Duplicate CTE references | Deduplicate — same query+params → one CTE |
| Count query overhead | Run count in parallel with data query; cache separately |
| High-offset paging | OFFSET/FETCH is fine for interactive use; keyset pagination future option |

### 7.3 Error Handling

| Scenario | Behavior |
|----------|----------|
| Referenced query not found | `"Query 'Sales/Active Customers' not found"` |
| Referenced query not approved | `"Query 'X' is not approved (status: Pending)"` |
| Referenced query not reusable | `"Query 'X' is not marked as reusable"` |
| Circular dependency | Error listing cycle path |
| Parameter mismatch | `"Parameter 'region' expected by 'X' but not provided"` |
| Composition depth exceeded | `"Composition depth limit (10) exceeded"` |
| Paging with no ORDER BY | Apply default ordering by first column |

---

## 9. File Inventory

### 9.1 Files Created in Sub-Phase A (COMPLETE)

| File | Purpose |
|------|---------|
| `migrations/v5/V202603111200__v5.11.x__QueryComposition.sql` | Schema: Reusable, QueryDependency, SQLDialect, QuerySQL tables |
| `migrations/v5/V202603111802__v5.11.x__Add_Query_Metadata_Dataset_Items.sql` | DatasetItems for metadata loading |
| `packages/MJCore/src/generic/queryCompositionEngine.ts` | Composition resolution engine |
| `packages/MJCore/src/__tests__/queryCompositionEngine.test.ts` | Unit tests for composition |

### 9.2 Files Modified in Sub-Phase A (COMPLETE)

| File | Changes |
|------|---------|
| `packages/MJCore/src/generic/queryInfo.ts` | `Reusable`, `SQLDialects`, `QuerySQLs`, `Dependents`, `DependsOn`, `GetPlatformSQL()` |
| `packages/MJCore/src/generic/interfaces.ts` | `QueryDependencyInfo`, `QuerySQLInfo`, `SQLDialectInfo` |
| `packages/MJCore/src/generic/providerBase.ts` | AllMetadataArrays for new info classes |
| `packages/MJCore/src/index.ts` | Export new modules |
| `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` | `ResolveQueryComposition()` integration |
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | Platform-aware composition |
| `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts` | Platform-aware composition |
| `packages/MJCoreEntitiesServer/src/custom/MJQueryEntityServer.server.ts` | Dependency extraction/sync |
| `packages/Angular/Explorer/core-entity-forms/.../query-form.component.ts` | Dependent Queries panel, accordion headers |
| `packages/Angular/Explorer/core-entity-forms/.../query-form.component.html` | UI for dependency display |

### 9.3 Files for Sub-Phase E (Agent Query Awareness)

| File | Purpose |
|------|---------|
| `metadata/agents/.query-builder-agent.json` | Add REUSABLE_QUERIES data source, Run Saved Query action |
| `metadata/agents/.research-agent.json` | Add AVAILABLE_QUERIES data source, Run Saved Query action to DB Research sub-agent |
| `metadata/prompts/templates/query-builder/query-strategist-prompt.md` | Composition syntax, catalog search, when-to-compose, examples |
| `metadata/prompts/templates/query-builder/system-prompt.md` | Composition awareness, reusable suggestion in responseForm |
| `metadata/prompts/templates/research-agent/database-research-agent.md` | Query catalog check, Run Saved Query guidance |
| `metadata/actions/.run-saved-query.json` (NEW) | Action definition for running saved queries by ID |

### 9.4 New Files for Remaining Sub-Phases

| File | Sub-Phase | Purpose |
|------|-----------|---------|
| `packages/MJCore/src/generic/queryPagingEngine.ts` | B | CTE-wrap paging engine |
| `packages/MJCore/src/__tests__/queryPagingEngine.test.ts` | B | Unit tests for paging |

### 9.5 Files to Modify for Remaining Sub-Phases

| File | Sub-Phase | Changes |
|------|-----------|---------|
| `packages/MJCore/src/generic/interfaces.ts` | B | Add `TotalRowCount`, `PageNumber`, `PageSize` to `RunQueryResult` |
| `packages/MJCore/src/generic/QueryCache.ts` | C | Page-aware cache keys, dependency-graph invalidation |
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | B, C | Paging + enhanced caching |
| `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts` | B, C, D | Paging + caching + PG variants |
| `packages/MJServer/src/resolvers/QueryResolver.ts` | B | Paging fields in GraphQL |
| `packages/MJServer/src/resolvers/AdhocQueryResolver.ts` | B | Paging fields in GraphQL |
| `packages/Angular/Generic/shared-generic/src/lib/` | B | `DataPagerComponent` |
| `packages/Angular/Generic/query-viewer/src/lib/` | B | Wire pager into QueryDataGrid |
| `packages/Angular/Generic/artifacts/src/lib/components/plugins/` | B | Wire pager into artifact viewer |
| Agent prompt templates | B | Remove TOP 100 requirement |

---

## 10. Remaining Task List

### Sub-Phase E: Agent Query Awareness (NEXT — 14 tasks)

| # | Task | Files | Depends On | Complexity |
|---|------|-------|------------|------------|
| E.1 | Enrich ALL_QUERIES data source with Reusable, Parameters summary, Fields summary | `.query-builder-agent.json` data sources | — | Medium |
| E.2 | Create REUSABLE_QUERIES data source with CategoryPath, SQL, Params, Fields | `.query-builder-agent.json` data sources | E.1 | Medium |
| E.3 | Create AVAILABLE_QUERIES data source for Database Research Agent | `.research-agent.json` data sources | — | Low |
| E.4 | Create/extend Run Saved Query action (wraps RunQuery pipeline) | `metadata/actions/` | — | Medium |
| E.5 | Add Run Saved Query action to Query Builder agent config | `.query-builder-agent.json` | E.4 | Low |
| E.6 | Add Run Saved Query action to Database Research agent config | `.research-agent.json` | E.4 | Low |
| E.7 | Update Query Strategist prompt: Composable Query Architecture section | `query-strategist-prompt.md` | E.2 | High |
| E.8 | Update Query Strategist prompt: "Search Query Catalog" step before writing SQL | `query-strategist-prompt.md` | E.7 | Medium |
| E.9 | Update Query Strategist prompt: composition examples and when-to-compose guidance | `query-strategist-prompt.md` | E.7 | Medium |
| E.10 | Update Query Strategist prompt: "Making Queries Reusable" guidance | `query-strategist-prompt.md` | E.7 | Low |
| E.11 | Update Query Builder orchestrator prompt: composition awareness, reusable suggestion | `system-prompt.md` | E.7 | Low |
| E.12 | Update Database Research Agent prompt: query catalog check before ad-hoc SQL | `database-research-agent.md` | E.3, E.6 | Medium |
| E.13 | Compute CategoryPath for queries (SQL function or view-level computation) | Migration or view update | — | Medium |
| E.14 | End-to-end testing: Query Builder composes from existing, Research Agent runs saved queries | Manual testing | E.1-E.12 | High |

### Sub-Phase B: Server-Side Paging (17 tasks)

| # | Task | Files | Depends On | Complexity |
|---|------|-------|------------|------------|
| B.1 | Create `QueryPagingEngine` class | `queryPagingEngine.ts` | — | Medium |
| B.2 | Implement ORDER BY extraction / TOP stripping | Inside B.1 | B.1 | Medium |
| B.3 | Implement MSSQL `OFFSET/FETCH` wrapping | Inside B.1 | B.1 | Low |
| B.4 | Implement PG `LIMIT/OFFSET` wrapping | Inside B.1 | B.1 | Low |
| B.5 | Implement parallel COUNT(*) query generation | Inside B.1 | B.1 | Low |
| B.6 | Add `TotalRowCount`, `PageNumber`, `PageSize` to `RunQueryResult` | `interfaces.ts` | — | Low |
| B.7 | Add paging fields to `RunQueryResultType` GraphQL type | `QueryResolver.ts` | B.6 | Low |
| B.8 | Add paging fields to `AdhocQueryResolver` GraphQL type | `AdhocQueryResolver.ts` | B.6 | Low |
| B.9 | Wire paging engine into `SQLServerDataProvider.InternalRunQuery()` | `SQLServerDataProvider.ts` | B.1, B.6 | Medium |
| B.10 | Wire paging engine into `PostgreSQLDataProvider.InternalRunQuery()` | `PostgreSQLDataProvider.ts` | B.1, B.6 | Medium |
| B.11 | Create `DataPagerComponent` (extract from entity-data-grid) | `ng-shared-generic` | — | Medium |
| B.12 | Wire pager into `mj-query-data-grid` | `query-viewer` package | B.11, B.6 | Medium |
| B.13 | Wire pager into `DataArtifactViewer` | `artifacts` package | B.11, B.12 | Low |
| B.14 | Update Query Builder agent prompt: remove TOP 100 | Prompt template | B.9 | Low |
| B.15 | Update Query Strategist prompt: remove TOP 100, mention paging | Prompt template | B.9 | Low |
| B.16 | Write unit tests for paging engine | `queryPagingEngine.test.ts` | B.1-B.5 | Medium |
| B.17 | Migrate `entity-data-grid` to use shared `DataPagerComponent` | `entity-data-grid` package | B.11 | Medium |

### Sub-Phase C: Query Caching with TTL (8 tasks)

| # | Task | Files | Depends On | Complexity |
|---|------|-------|------------|------------|
| C.1 | Verify/fix cache integration in `SQLServerDataProvider.InternalRunQuery()` | `SQLServerDataProvider.ts` | — | Low |
| C.2 | Add cache check/store to `PostgreSQLDataProvider.InternalRunQuery()` | `PostgreSQLDataProvider.ts` | — | Medium |
| C.3 | Add page-aware cache keys to `QueryCache` | `QueryCache.ts` | B.1 | Low |
| C.4 | Add ad-hoc SQL cache key generation (hash-based) | `QueryCache.ts` | — | Low |
| C.5 | Implement dependency-graph cache invalidation | `QueryCache.ts` | — | Medium |
| C.6 | Cache `TotalRowCount` separately from data pages | `QueryCache.ts` | B.1, C.3 | Low |
| C.7 | Add cache config UI fields to Query form | Angular form component | — | Low |
| C.8 | Write unit tests for cache with paging and invalidation | `QueryCache.test.ts` | C.1-C.6 | Medium |

### Sub-Phase D: PostgreSQL Variants (3 remaining tasks)

| # | Task | Files | Depends On | Complexity |
|---|------|-------|------------|------------|
| D.3 | Write PG-variant migration for QueryDependency | `migrations/v5/V...` | — | Low |
| D.4 | Verify `GetPlatformSQL()` returns correct variant in composition chain | Integration test | — | Medium |
| D.5 | Integration tests: compose + page + cache on PG | Test files | B, C | Medium |

*D.1 (PG identifier quoting) and D.2 (PG LIMIT/OFFSET) are already addressed by the composition engine's platform-aware quoting and will be covered in B.4.*

### Execution Order

Recommended implementation sequence:
1. **E.1-E.4** — Data sources + Run Saved Query action (start here)
2. **E.5-E.6** — Wire action into both agent configs (after E.4)
3. **E.7-E.12** — Prompt updates for all three prompts (after E.1-E.6, can parallelize across agents)
4. **E.13** — CategoryPath computation (can start in parallel with E.1)
5. **E.14** — End-to-end testing (after all E tasks)
6. **B.1-B.5** — Paging engine core
7. **B.6-B.8** — API/GraphQL changes (parallel with B.1)
8. **B.9-B.10** — Provider integration (after B.1 + B.6)
9. **B.11-B.13** — Angular pager component (can start in parallel with B.1)
10. **B.14-B.17** — Prompt updates, tests, entity-data-grid migration
11. **C.1-C.8** — Caching enhancements (after B complete, or C.1-C.2 + C.4-C.5 can start in parallel)
12. **D.3-D.5** — PG integration testing (after B + C)
