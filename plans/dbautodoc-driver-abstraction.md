# DBAutoDoc Driver Abstraction Plan

## Status: Draft
## Created: 2026-03-13

## Problem

The three DBAutoDoc drivers (SQLServerDriver, PostgreSQLDriver, MySQLDriver) each implement ~900 lines with massive code duplication. The high-level logic is identical across all three — only the SQL syntax and catalog queries differ. This mirrors the same problem MJ solved with `GenericDatabaseProvider` + platform-specific subclasses.

### Duplication by the Numbers

| Method | Logic Identical? | Only SQL Differs? |
|--------|:---:|:---:|
| `getSchemas()` | **YES** — 100% identical across all 3 | N/A (orchestration only) |
| `getTables()` | **YES** — 100% identical across all 3 | N/A (orchestration only) |
| `getColumnStatistics()` | **YES** — 100% identical across all 3 | N/A (orchestration only) |
| `getDistinctCount()` | YES | Only `escapeIdentifier()` differs |
| `getSampleValues()` | YES | Random function + limit syntax |
| `getValueDistribution()` | YES | TOP vs LIMIT placement |
| `getCardinalityStats()` | YES | Null counting approach + Number() coercion |
| `getNumericStats()` | YES | Cast syntax (`CAST AS FLOAT` vs `::NUMERIC` vs implicit) |
| `getStringStats()` | YES | `LEN()` vs `LENGTH()` |
| `getDateStats()` | **YES** — 100% identical SQL | Fully generic |
| `testValueOverlap()` | YES | Random + limit + Number() coercion |
| `checkColumnCombinationUniqueness()` | YES | TOP vs LIMIT placement + random |
| `parseTableIdentifier()` | **YES** — 100% identical | Fully generic |
| `executeQuery()` | Similar pattern | Driver API (`pool.request().query()` vs `pool.query()` vs `pool.execute()`) |
| `test()` | YES | Version/DB functions only |
| `connect()` / `close()` | Similar pattern | Driver-specific pool creation |
| `isTransientError()` | YES | Different error keywords per driver |
| `getColumns()` | NO — fundamentally different | Different catalog systems |
| `getExistingDescriptions()` | NO — fundamentally different | Different metadata systems |
| `buildTablesQuery()` | NO — different catalogs | sys.tables vs information_schema vs pg_stat |
| `getForeignKeys()` | NO — different catalogs | sys.foreign_keys vs information_schema |
| `getPrimaryKeys()` | NO — different catalogs | sys.indexes vs table_constraints |
| `getColumnInfo()` | NO — different catalogs | sys.columns vs information_schema |

**Conclusion**: ~65% of code is duplicated or near-duplicated. The remaining ~35% (catalog introspection) is genuinely provider-specific.

---

## Proposed Architecture

### New Hierarchy

```
BaseAutoDocDriver (abstract — unchanged interface)
  └─ GenericAutoDocDriver (NEW — shared logic layer)
       ├─ SQLServerDriver (thin — SQL syntax + catalog queries only)
       ├─ PostgreSQLDriver (thin — SQL syntax + catalog queries only)
       └─ MySQLDriver (thin — SQL syntax + catalog queries only)
```

### GenericAutoDocDriver Responsibilities

The new intermediate class implements all shared orchestration and data query logic:

1. **Orchestration methods** (move verbatim — identical across all 3):
   - `getSchemas()` — builds schema map, parallel-loads columns/FKs/PKs per table
   - `getTables()` — delegates to `buildTablesQuery()`, assembles results
   - `getColumnStatistics()` — dispatches to cardinality/numeric/date/string/sample sub-queries
   - `test()` — connects, runs test query, maps result

2. **Data query methods** (use abstract SQL fragment helpers):
   - `getCardinalityStats()` — builds query using `escapeIdentifier()` + abstract `getNullCountExpression()`
   - `getValueDistribution()` — builds query using abstract `buildLimitedQuery()`
   - `getSampleValues()` — builds query using abstract `getRandomFunction()` + `buildLimitedQuery()`
   - `getNumericStats()` — builds query using abstract `getNumericCastExpression()`
   - `getDateStats()` — fully generic (identical SQL across all 3)
   - `getStringStats()` — builds query using abstract `getStringLengthFunction()`
   - `testValueOverlap()` — builds CTE using `getRandomFunction()` + `buildLimitedQuery()`
   - `checkColumnCombinationUniqueness()` — builds CTE using `buildLimitedQuery()`

3. **Connection lifecycle** (template method pattern):
   - `executeQuery()` — retry loop with `isTransientError()`, delegates actual execution to abstract `executeRawQuery()`
   - `connect()` / `close()` — delegates to abstract `createPool()` / `destroyPool()`

4. **Utility methods** (move verbatim):
   - `parseTableIdentifier()`
   - Result coercion helpers (Number() conversions for PG/MySQL string returns)

### New Abstract Methods on GenericAutoDocDriver

These are the **SQL boundary methods** each platform driver must implement:

```typescript
// === SQL Syntax Fragments ===

/** Returns the SQL function for random ordering: NEWID(), RANDOM(), RAND() */
protected abstract getRandomFunction(): string;

/** Returns the SQL function for string length: LEN, LENGTH */
protected abstract getStringLengthFunction(): string;

/** Returns SQL expression for null count.
 *  SQL Server/MySQL: SUM(CASE WHEN col IS NULL THEN 1 ELSE 0 END)
 *  PostgreSQL: COUNT(*) - COUNT(col) */
protected abstract getNullCountExpression(escapedCol: string): string;

/** Returns SQL expression for numeric average cast.
 *  SQL Server: CAST(col AS FLOAT)
 *  PostgreSQL: col::NUMERIC
 *  MySQL: col (implicit) */
protected abstract getNumericCastForAvg(escapedCol: string): string;

/** Returns the standard deviation function name: STDEV (SQL Server) vs STDDEV (PG/MySQL) */
protected abstract getStdDevFunction(): string;

/** Wraps a SELECT query with a row limit + optional random ordering.
 *  SQL Server: SELECT TOP N ... ORDER BY NEWID()
 *  PG/MySQL: SELECT ... ORDER BY RANDOM()/RAND() LIMIT N */
protected abstract buildLimitedRandomQuery(
  selectClause: string,
  fromClause: string,
  whereClause: string,
  limit: number
): string;

/** Provider-specific version/database test query.
 *  SQL Server: @@VERSION, DB_NAME()
 *  PostgreSQL: version(), current_database()
 *  MySQL: VERSION(), DATABASE() */
protected abstract getTestQuery(): string;

/** Provider-specific transient error keywords */
protected abstract getTransientErrorKeywords(): string[];

// === Connection Management ===

/** Create the native connection pool from config */
protected abstract createPool(): Promise<void>;

/** Destroy the native connection pool */
protected abstract destroyPool(): Promise<void>;

/** Execute a raw query against the native pool.
 *  Returns raw rows — the generic layer handles retry and error mapping. */
protected abstract executeRawQuery<T>(
  query: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }>;

// === Catalog Introspection (genuinely provider-specific) ===

/** Build the tables list query for this platform's catalog */
protected abstract buildTablesQuery(
  schemaFilter: AutoDocSchemaFilter,
  tableFilter: AutoDocTableFilter
): string;

/** Get columns for a table from platform catalog */
protected abstract getColumns(
  schemaName: string,
  tableName: string
): Promise<AutoDocColumn[]>;

/** Get existing descriptions/comments from platform metadata */
public abstract getExistingDescriptions(
  schemaName: string,
  tableName: string
): Promise<AutoDocExistingDescription[]>;

/** Get foreign keys from platform catalog */
protected abstract getForeignKeys(
  schemaName: string,
  tableName: string
): Promise<AutoDocForeignKey[]>;

/** Get primary keys from platform catalog */
protected abstract getPrimaryKeys(
  schemaName: string,
  tableName: string
): Promise<AutoDocPrimaryKey[]>;

/** Get column info from platform catalog (for FK detection) */
public abstract getColumnInfo(
  schemaName: string,
  tableName: string,
  columnName: string
): Promise<{ name: string; type: string; nullable: boolean }>;

/** Normalize platform-specific data type to generic name (optional override) */
protected normalizeDataType(dataType: string, udtName?: string): string {
  return dataType; // Default: no normalization. PG overrides this.
}
```

### What Each Platform Driver Becomes

After refactoring, each driver shrinks to ~200-300 lines covering only:

1. **Constructor** — maps `AutoDocConnectionConfig` to native driver config
2. **SQL fragment methods** — ~6 one-liners returning syntax strings
3. **Connection methods** — `createPool()`, `destroyPool()`, `executeRawQuery()`
4. **Catalog queries** — `buildTablesQuery()`, `getColumns()`, `getExistingDescriptions()`, `getForeignKeys()`, `getPrimaryKeys()`, `getColumnInfo()`
5. **PostgreSQL only** — `normalizeDataType()` override

---

## Implementation Phases

### Phase 1: Create GenericAutoDocDriver (non-breaking)

1. Create `src/drivers/GenericAutoDocDriver.ts`
2. Move shared orchestration methods from any driver (they're all identical)
3. Define the abstract SQL boundary methods listed above
4. Add default implementations where possible (e.g., `parseTableIdentifier`, result coercion)

### Phase 2: Migrate SQLServerDriver

1. Change extends from `BaseAutoDocDriver` to `GenericAutoDocDriver`
2. Remove all methods now provided by generic layer
3. Implement the new abstract methods
4. Keep `@RegisterClass(BaseAutoDocDriver, 'SQLServer')` — registration target stays the same
5. **Test**: Run against OrgB database, compare results to pre-refactor

### Phase 3: Migrate PostgreSQLDriver

1. Same as Phase 2 but for PostgreSQL
2. Keep `normalizeDataType()` override
3. Keep Number() coercions in catalog result mapping
4. **Test**: If PG test database available, verify; otherwise compile-only

### Phase 4: Migrate MySQLDriver

1. Same as Phase 2 but for MySQL
2. Handle MySQL's `pool.execute()` vs `pool.query()` difference in `executeRawQuery()`
3. Handle MySQL's `TABLE_COMMENT` / `COLUMN_COMMENT` description pattern
4. **Test**: If MySQL test database available, verify; otherwise compile-only

### Phase 5: Cleanup

1. Remove any dead code
2. Verify all three drivers compile cleanly
3. Run existing unit tests if any exist
4. Run a fresh OrgB analysis to validate end-to-end

---

## Risk Assessment

### Low Risk
- **No API changes**: `BaseAutoDocDriver` interface is unchanged. All consumers see the same public methods.
- **Registration unchanged**: `@RegisterClass(BaseAutoDocDriver, ...)` still works — consumers don't know about the intermediate class.
- **No new dependencies**: GenericAutoDocDriver lives in the same package.

### Medium Risk
- **`executeQuery` signature mismatch**: SQL Server's `executeQuery` takes `(query, maxRetries)` while PG/MySQL take `(query, maxRetries, params?)`. The generic layer needs to support the params variant. Solution: add optional `params` to the base signature (backward compatible).
- **Result type coercions**: PostgreSQL returns COUNT/SUM as strings, SQL Server as numbers, MySQL varies. The generic layer should apply `Number()` coercion uniformly (safe for all platforms).

### Non-Risks
- **No behavioral changes**: Every query stays identical per platform. We're reorganizing code, not changing logic.
- **CTE naming**: Cosmetic difference (capitalized vs lowercase CTE names) — doesn't affect behavior.

---

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| Total driver code | ~2,700 lines (3 × ~900) | ~1,200 lines (400 generic + 3 × ~270) |
| Duplication | ~65% | ~0% |
| Adding a new DB driver | Copy 900 lines, modify SQL | Implement ~12 abstract methods (~270 lines) |
| Bug fix surface | Must fix in 3 places | Fix once in generic layer |

---

## Comparison with MJ's GenericDatabaseProvider Pattern

| Aspect | MJ Data Providers | DBAutoDoc Drivers (proposed) |
|--------|------------------|------------------------------|
| Base class | `DatabaseProviderBase` | `BaseAutoDocDriver` (unchanged) |
| Generic layer | `GenericDatabaseProvider` | `GenericAutoDocDriver` (new) |
| Platform drivers | `SQLServer/PostgreSQLDataProvider` | `SQLServer/PostgreSQL/MySQLDriver` |
| SQL syntax abstraction | `SQLDialect` (separate package) | Inline abstract methods (simpler, sufficient for scope) |
| Abstract method count | 55 | ~12 |

The DBAutoDoc scope is much smaller than MJ's full data provider stack, so a separate `SQLDialect` package would be over-engineered. Inline abstract methods on the generic class are sufficient.
