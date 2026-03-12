# Composable Queries — Next Steps

## Table of Contents

1. [Status Summary](#1-status-summary)
2. [What's Complete](#2-whats-complete)
3. [Sub-Phase B: Server-Side Paging for Queries](#3-sub-phase-b-server-side-paging-for-queries)
4. [Sub-Phase C: Query Caching with TTL](#4-sub-phase-c-query-caching-with-ttl)
5. [Sub-Phase D: PostgreSQL Query Variants](#5-sub-phase-d-postgresql-query-variants)
6. [Future Phase: View-Query Bridge](#6-future-phase-view-query-bridge)
7. [Cross-Cutting Concerns](#7-cross-cutting-concerns)
8. [File Inventory](#8-file-inventory)
9. [Remaining Task List](#9-remaining-task-list)

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

## 3. Sub-Phase B: Server-Side Paging for Queries

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

## 4. Sub-Phase C: Query Caching with TTL

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

## 5. Sub-Phase D: PostgreSQL Query Variants

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

## 6. Future Phase: View-Query Bridge

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

## 7. Cross-Cutting Concerns

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

## 8. File Inventory

### 8.1 Files Created in Sub-Phase A (COMPLETE)

| File | Purpose |
|------|---------|
| `migrations/v5/V202603111200__v5.11.x__QueryComposition.sql` | Schema: Reusable, QueryDependency, SQLDialect, QuerySQL tables |
| `migrations/v5/V202603111802__v5.11.x__Add_Query_Metadata_Dataset_Items.sql` | DatasetItems for metadata loading |
| `packages/MJCore/src/generic/queryCompositionEngine.ts` | Composition resolution engine |
| `packages/MJCore/src/__tests__/queryCompositionEngine.test.ts` | Unit tests for composition |

### 8.2 Files Modified in Sub-Phase A (COMPLETE)

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

### 8.3 New Files for Remaining Sub-Phases

| File | Sub-Phase | Purpose |
|------|-----------|---------|
| `packages/MJCore/src/generic/queryPagingEngine.ts` | B | CTE-wrap paging engine |
| `packages/MJCore/src/__tests__/queryPagingEngine.test.ts` | B | Unit tests for paging |

### 8.4 Files to Modify for Remaining Sub-Phases

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

## 9. Remaining Task List

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
1. **B.1-B.5** — Paging engine core (can start immediately)
2. **B.6-B.8** — API/GraphQL changes (parallel with B.1)
3. **B.9-B.10** — Provider integration (after B.1 + B.6)
4. **B.11-B.13** — Angular pager component (can start in parallel with B.1)
5. **B.14-B.17** — Prompt updates, tests, entity-data-grid migration
6. **C.1-C.8** — Caching enhancements (after B complete, or C.1-C.2 + C.4-C.5 can start in parallel)
7. **D.3-D.5** — PG integration testing (after B + C)
