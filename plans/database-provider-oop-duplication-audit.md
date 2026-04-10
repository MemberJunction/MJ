# Provider Class Hierarchy Audit Report

**Date:** 2026-03-11
**Scope:** SQL Server Data Provider (SSDP) vs PostgreSQL Data Provider (PGDP) — duplicative code and abstraction opportunities
**Goal:** Identify logic that lives in concrete providers but belongs in a higher-level base class

---

## 1. Class Hierarchy Overview

```
ProviderBase (MJCore)
  └─ DatabaseProviderBase (MJCore)  — adds DB-specific abstract signatures
       └─ GenericDatabaseProvider (separate package)  — shared RunView, RunViews, CRUD orchestration
            ├─ SQLServerDataProvider (SSDP)   — mssql driver, SQL Server dialect
            └─ PostgreSQLDataProvider (PGDP)  — pg driver, PostgreSQL dialect
```

### What each layer provides today

| Layer | Responsibility |
|-------|---------------|
| **ProviderBase** | Metadata cache, RunQuery pre/post hooks, `ResolveQueryComposition()`, config data loading |
| **DatabaseProviderBase** | Abstract method signatures for DB-specific ops (ExecuteSQL, transactions, etc.) |
| **GenericDatabaseProvider** | `resolveQueryInfo()`, `ValidateQueryForExecution()`, `findQueryInEngine()`, `refreshQueryInfoFromEntity()`, `resolveCategoryPath()`, `getBatchedQueryCacheStatus()`, RunView/RunViews orchestration, CRUD orchestration |
| **SSDP / PGDP** | `InternalRunQuery()`, `ExecuteSQL()`, CRUD SQL generation, transactions, dialect-specific transforms |

---

## 2. InternalRunQuery — Side-by-Side Comparison

This is the highest-impact duplication. Both providers implement the same logical pipeline but with different feature completeness.

### SSDP (lines 558-617) — Full-featured

```
1. Route ad-hoc SQL → ExecuteAdhocSQL()     ← SSDP-only
2. findAndValidateQuery()                    ← wrapper around findQuery + ValidateQueryForExecution
3. processQueryParameters()                  ← composition + Nunjucks + warnings
4. checkQueryCache()                         ← query-level caching
5. executeQueryWithTiming()                  ← timed ExecuteSQL
6. applyQueryPagination()                    ← in-memory StartRow/MaxRows
7. auditQueryExecution()                     ← fire-and-forget audit log
8. cacheQueryResults()                       ← store in QueryCache
9. Return full RunQueryResult with CacheHit, AppliedParameters
```

### PGDP (lines 308-368) — Minimal

```
1. resolveQueryInfo()                        ← same intent as SSDP's findQuery
2. ValidateQueryForExecution()               ← inherited from GenericDatabaseProvider
3. GetPlatformSQL() + ResolveQueryComposition()
4. Nunjucks template processing              ← inline, no helper method
5. ExecuteSQL()                              ← no timing wrapper
6. Return basic RunQueryResult               ← no caching, no pagination, no audit
```

### Gap Analysis

| Feature | SSDP | PGDP | Platform-Specific? |
|---------|------|------|--------------------|
| Ad-hoc SQL routing | Yes | **No** | No — generic |
| Query resolution | `findQuery()` (local) | `resolveQueryInfo()` (inherited) | No — already in GenericDP |
| Permission validation | Yes | Yes | No — already in GenericDP |
| GetPlatformSQL | Yes | Yes | No — generic |
| Composition resolution | Yes | Yes | No — already in ProviderBase |
| Nunjucks template processing | Via helper method | Inline | No — generic |
| Query-level caching | Yes (`QueryCache`) | **No** | No — generic |
| Execution timing | Yes (helper) | Manual `Date.now()` | No — generic |
| In-memory pagination | Yes (helper) | **No** | No — generic |
| Audit logging | Yes (fire-and-forget) | **No** | No — generic |
| Result caching | Yes (helper) | **No** | No — generic |
| Error details | Detailed `ErrorMessage` | Basic message | No — generic |
| `AppliedParameters` in result | Yes | **No** | No — generic |
| `CacheHit` in result | Yes | **No** | No — generic |

**Conclusion:** PGDP is missing 6 features that SSDP implements. None of them are SQL Server-specific. The entire `InternalRunQuery` pipeline should live in `GenericDatabaseProvider`, with concrete providers only supplying `ExecuteSQL()`.

---

## 3. Duplicative Helper Methods in SSDP (candidates for lifting)

These methods are defined in SSDP but contain zero SQL Server-specific logic:

### 3.1 `findAndValidateQuery()` (SSDP lines 676-697)
- Calls `findQuery()` → error formatting → `ValidateQueryForExecution()`
- **Duplication with:** PGDP's inline `resolveQueryInfo()` + `ValidateQueryForExecution()` calls
- **Recommendation:** Lift to GenericDatabaseProvider, replacing both SSDP's `findQuery` and the inherited `resolveQueryInfo` with a single `findAndValidateQuery()`

### 3.2 `processQueryParameters()` (SSDP lines 702-725)
- Step 1: `ResolveQueryComposition()` (already on ProviderBase)
- Step 2: `QueryParameterProcessor.processQueryTemplate()` (already a static util)
- Step 3: Warning for unused parameters
- **Duplication with:** PGDP's inline composition + template processing (lines 341-351)
- **Recommendation:** Lift to GenericDatabaseProvider verbatim

### 3.3 `checkQueryCache()` (SSDP lines 730-761)
- Checks `QueryCache` for existing results, applies pagination to cached data
- **Missing from PGDP entirely**
- **Recommendation:** Lift to GenericDatabaseProvider (QueryCache is platform-agnostic)

### 3.4 `executeQueryWithTiming()` (SSDP lines 766-779)
- Wraps `ExecuteSQL()` with `Date.now()` timing
- **Duplication with:** PGDP's inline `Date.now()` timing
- **Recommendation:** Lift to GenericDatabaseProvider

### 3.5 `applyQueryPagination()` (SSDP lines 784-797)
- In-memory `slice()` for StartRow/MaxRows
- **Missing from PGDP entirely** — PGDP returns all rows regardless of pagination params
- **Recommendation:** Lift to GenericDatabaseProvider

### 3.6 `auditQueryExecution()` (SSDP lines 802-839)
- Fire-and-forget `CreateAuditLogRecord()` call
- **Missing from PGDP entirely**
- **Recommendation:** Lift to GenericDatabaseProvider (CreateAuditLogRecord is a base class method)

### 3.7 `cacheQueryResults()` (SSDP lines 844-853)
- Stores full result set in QueryCache
- **Missing from PGDP entirely**
- **Recommendation:** Lift to GenericDatabaseProvider

### 3.8 `ExecuteAdhocSQL()` (SSDP lines 623-669)
- Validates SQL security via `SQLExpressionValidator`
- Executes with timing and pagination
- **Missing from PGDP entirely**
- **Recommendation:** Lift to GenericDatabaseProvider

### 3.9 `InternalRunQueries()` (both providers)
- Both are identical: `Promise.all(params.map(p => this.InternalRunQuery(p, contextUser)))`
- **Recommendation:** Lift to GenericDatabaseProvider (or even ProviderBase since it's trivial)

---

## 4. Query Resolution Duplication

SSDP and PGDP both resolve queries from params, but via different code paths:

| Aspect | SSDP | PGDP |
|--------|------|------|
| Primary method | `findQuery()` (local, lines 511-553) | `resolveQueryInfo()` (inherited from GenericDP) |
| Engine lookup | `findQueryInEngine()` (inherited) | `findQueryInEngine()` (inherited) |
| Cache refresh fallback | `refreshMetadataIfNotFound` → `this.Refresh()` | No auto-refresh |
| Category path resolution | `resolveCategoryPath()` (inherited) | `resolveCategoryPath()` (inherited) |
| UUID comparison | Mix of manual `.toLowerCase()` and `UUIDsEqual()` | Uses `UUIDsEqual()` consistently |

**Issue:** SSDP has its own `findQuery()` that duplicates most of `resolveQueryInfo()` from GenericDatabaseProvider, but adds the `refreshMetadataIfNotFound` feature. This should be consolidated.

**Recommendation:** Merge SSDP's `findQuery()` auto-refresh logic into GenericDatabaseProvider's `resolveQueryInfo()`, then remove the SSDP-local method.

---

## 5. QueryCache Class

`QueryCache` is defined in SSDP's package (`packages/SQLServerDataProvider/src/QueryCache.ts`) but contains zero SQL Server-specific code. It's a simple in-memory TTL cache using Map.

**Recommendation:** Move `QueryCache` to `GenericDatabaseProvider` package (or even `MJCore`) so both SSDP and PGDP can use it.

---

## 6. Non-Query Duplicative Patterns

### 6.1 Transaction Management
Both providers implement `BeginTransaction`, `CommitTransaction`, `RollbackTransaction` with identical logic flow:
1. Acquire client/connection
2. Execute BEGIN
3. Execute COMMIT/ROLLBACK in try/finally with client release

The only difference is the driver API (`mssql.Transaction` vs `pg.PoolClient`). A template method pattern in GenericDatabaseProvider could reduce this.

### 6.2 CRUD SQL Generation
Both providers generate Create/Update/Delete SQL with:
- Field filtering (writable, non-virtual, non-timestamp)
- Record change tracking via CTE wrapping
- Primary key handling

The SQL dialects differ (`EXEC sp...` vs `SELECT * FROM sp...(named => params)`) but the orchestration logic is duplicated.

### 6.3 Record Change Tracking
Both providers:
1. Check `shouldTrackRecordChanges()`
2. Compute diff between old/new data
3. Build JSON change description
4. Generate INSERT into RecordChange table

Only the SQL syntax differs. The diff computation, JSON building, and decision logic are identical.

### 6.4 Identifier Quoting / SQL Transformation
- SSDP: Uses `[bracket]` notation natively
- PGDP: `quoteIdentifiersInSQL()` converts `[bracket]` → `"double-quote"`
- Both: `TransformExternalSQLClause()` for user-provided filter/orderby expressions

The logic differs but could share a common interface via a `SQLDialect` abstraction (which PGDP already partially has as `PostgreSQLDialect`).

---

## 7. Proposed Refactoring — Priority Order

### Priority 1: Lift InternalRunQuery Pipeline to GenericDatabaseProvider

**Impact:** Eliminates the largest block of duplication and gives PGDP feature parity (caching, pagination, audit logging) for free.

```typescript
// GenericDatabaseProvider
protected async InternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
    if (params.SQL) return this.ExecuteAdhocSQL(params, contextUser);

    const query = this.findAndValidateQuery(params, contextUser);
    const { finalSQL, appliedParameters } = this.processQueryParameters(query, params.Parameters, contextUser);

    const cachedResult = this.checkQueryCache(query, params, appliedParameters);
    if (cachedResult) return cachedResult;

    const { result, executionTime } = await this.executeQueryWithTiming(finalSQL, contextUser);
    const { paginatedResult, totalRowCount } = this.applyQueryPagination(result, params);

    this.auditQueryExecution(query, params, finalSQL, paginatedResult.length, totalRowCount, executionTime, contextUser);
    this.cacheQueryResults(query, params.Parameters || {}, result);

    return { Success: true, QueryID: query.ID, QueryName: query.Name, Results: paginatedResult,
             RowCount: paginatedResult.length, TotalRowCount: totalRowCount, ExecutionTime: executionTime,
             ErrorMessage: '', AppliedParameters: appliedParameters, CacheHit: false };
}
```

Concrete providers only need to implement `ExecuteSQL()` — which they already do.

**Effort:** Medium
**Risk:** Low — behavioral change for PGDP (gains features), no change for SSDP

### Priority 2: Move QueryCache to GenericDatabaseProvider

**Impact:** Enables PGDP query caching immediately after Priority 1.

**Effort:** Low (move file, update imports)
**Risk:** Very low

### Priority 3: Consolidate findQuery / resolveQueryInfo

**Impact:** Single query resolution path with auto-refresh support for all providers.

**Effort:** Low-Medium
**Risk:** Low — `resolveQueryInfo` already exists in GenericDP; just add SSDP's refresh fallback

### Priority 4: Lift InternalRunQueries

**Impact:** Trivial duplication but worth cleaning up.

**Effort:** Trivial
**Risk:** None

### Priority 5: Template Method for Transaction Management

**Impact:** Reduces transaction boilerplate in both providers.

**Effort:** Medium
**Risk:** Low — well-understood pattern

### Priority 6: Abstract CRUD Orchestration

**Impact:** Significant code reduction but higher complexity due to dialect differences.

**Effort:** High
**Risk:** Medium — CRUD SQL generation is tightly coupled to dialect specifics

### Priority 7: Unify Record Change Tracking Logic

**Impact:** The diff computation and JSON building are identical; only the final SQL differs.

**Effort:** Medium
**Risk:** Low

---

## 8. Feature Parity Summary

Features PGDP would gain from lifting code to GenericDatabaseProvider:

| Feature | User Impact |
|---------|------------|
| Query-level caching | Faster repeated query execution |
| In-memory pagination | StartRow/MaxRows support for RunQuery |
| Audit logging | Compliance and debugging for query runs |
| Ad-hoc SQL execution | Direct SQL from UI/API with security validation |
| Applied parameters in results | Better debugging/transparency |
| Auto-refresh on query not found | Handles race conditions with newly created queries |
| Detailed error messages | Better diagnostics for query failures |

---

## 9. Files Affected by Proposed Changes

| File | Change Type |
|------|------------|
| `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` | Add `InternalRunQuery` pipeline, helpers, `QueryCache` integration |
| `packages/SQLServerDataProvider/src/SQLServerDataProvider.ts` | Remove lifted methods, keep only `ExecuteSQL` and dialect-specific code |
| `packages/SQLServerDataProvider/src/QueryCache.ts` | Move to GenericDatabaseProvider package |
| `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts` | Remove `InternalRunQuery` override (inherit from GenericDP) |
| `packages/MJCore/src/generic/providerBase.ts` | Potentially move `InternalRunQueries` if trivial enough |

---

## 10. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| PGDP behavior changes (gains caching, pagination, audit) | These are additive features with sensible defaults (cache disabled by default, pagination only if params provided) |
| SSDP regression | Extracted methods are moved verbatim; unit tests cover existing behavior |
| Build order changes | GenericDatabaseProvider already depends on MJCore; no new circular deps |
| QueryCache in shared location | It has no provider-specific imports today |

---

## Appendix A: Method Inventory

### Methods in SSDP that are NOT SQL Server-specific

| Method | Lines | Description |
|--------|-------|-------------|
| `findAndValidateQuery` | 676-697 | Query lookup + permission check |
| `processQueryParameters` | 702-725 | Composition + Nunjucks + warnings |
| `checkQueryCache` | 730-761 | TTL cache lookup with pagination |
| `executeQueryWithTiming` | 766-779 | Timed `ExecuteSQL` wrapper |
| `applyQueryPagination` | 784-797 | In-memory slice for StartRow/MaxRows |
| `auditQueryExecution` | 802-839 | Fire-and-forget audit log |
| `cacheQueryResults` | 844-853 | Store results in QueryCache |
| `ExecuteAdhocSQL` | 623-669 | Security validation + execution |
| `InternalRunQueries` | 862-867 | Parallel `Promise.all` |
| `InternalRunQuery` (orchestration) | 558-617 | Full pipeline orchestration |
| `findQuery` | 511-553 | Query resolution with refresh |
| `getBatchedQueryCacheStatus` | 872-918 | Batch cache validation |

**Total: 12 methods / ~400 lines of non-platform-specific code in SSDP**

### Methods in PGDP that duplicate SSDP logic

| Method | Lines | SSDP Equivalent |
|--------|-------|-----------------|
| `InternalRunQuery` | 308-368 | `InternalRunQuery` (subset) |
| `InternalRunQueries` | 370-375 | `InternalRunQueries` (identical) |

**Total: 2 methods / ~70 lines — but missing ~330 lines of features that SSDP has**
