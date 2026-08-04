# SQL Parser Instance Redesign — Implementation Plan

**Status:** Proposed
**Supersedes:** `plans/ast-dialect-adapter.md` (adapter pattern only), `plans/sql-ast-preprocessing.md` (preprocessing only)
**PR:** To be implemented on `CB-sql-pipeline-refactor` (PR #2692)

## Problem

The current `SQLParser` is a static utility class — every method is `static`, there is no instance state. This design created three compounding problems as the parser grew:

1. **Dialect-specific AST leakage.** PR #2692 added typed AST primitives (`GetOuterCap`, `SetOuterCap`, etc.) that centralize `node-sql-parser` shape knowledge. But the public type `SQLOuterCap` uses `kind: 'top' | 'limit'` — a discriminated union naming SQL Server and PostgreSQL syntax. The implementation uses `isSQLServerDialect()` which probes `QuoteIdentifier` output to infer dialect identity. Adding a new dialect (Oracle, MySQL) forces changes to every consumer's pattern match.

2. **Preprocessing state has nowhere to live.** The preprocessing plan (`plans/sql-ast-preprocessing.md`) proposes aliasing bracket-quoted identifiers to widen `node-sql-parser` coverage. This requires storing an alias map between `ParseSQL` and `SqlifyAST` calls. With static methods, we considered `WeakMap` (hidden coupling), closure-threading (`ParseWithPreprocessing` returning `{ ast, restore }`), or property injection on third-party objects. All are workarounds for the lack of instance state.

3. **Repetitive parameter threading.** Every AST method requires passing `ast` and `dialect` — values that are fixed for a given parse session. Consumers repeat `SQLParser.Foo(ast, dialect)` on every call, with the same arguments each time.

An instance-based parser naturally solves all three: the dialect, AST, adapter, and preprocessing state are captured at construction and used internally by every method.

## Research Summary

### Dialect-specific AST inventory

An exhaustive audit of all AST field accesses across `sql-parser` and `GenericDatabaseProvider` found that **row caps are the only AST field that varies by dialect**:

| AST Field | Same shape across dialects? | Adapter needed? |
|---|---|---|
| `root.top` (SQL Server) | N/A | **Yes** — row-cap read/write |
| `root.limit` (PostgreSQL/MySQL) | N/A | **Yes** — row-cap read/write |
| `root.with` (CTEs) | Yes | No |
| `root._next`, `root.set_op` | Yes | No |
| `root.into`, `root.for`, `root.orderby`, `root.type` | Yes | No |

CTE challenges (bracket-quoted names, ORDER BY legality, RECURSIVE keyword) are parser limitations or semantic rules — not AST shape differences.

### Consumer call site inventory

15 files import from `@memberjunction/sql-parser` across 4 packages. All are internal to the MJ monorepo — no external consumers.

**Production code (9 files):**

| File | Package | Methods Used |
|---|---|---|
| `queryPagingEngine.ts` | GenericDatabaseProvider | `ParseSQL`, `SqlifyAST`, `GetStatementKind`, `GetOuterCap`, `SetOuterCap`, `HasUnwrappableTrailingClause`, `ExtractCTEs` |
| `queryCompositionEngine.ts` | GenericDatabaseProvider | `Tokenize`, `ExtractCompositionRefs`, `ExtractCTEs`, `RenameTemplateVariable`, `SubstituteTemplateVariable` |
| `renderPipeline.ts` | GenericDatabaseProvider | `StripComments` |
| `resolve.ts` | MJCoreEntitiesServer | `ExtractCompositionRefs`, `ExtractColumnRefs`, `ExtractCTEs` |
| `parse.ts` | MJCoreEntitiesServer | `Analyze`, `ExtractParameterInfo`, `ExtractTableRefs`, `ExtractSelectColumns` |
| `enrich.ts` | MJCoreEntitiesServer | Type imports only |
| `types.ts` | MJCoreEntitiesServer | Type imports only |
| `manage-metadata.ts` | CodeGenLib | `ExtractTableRefs` |
| `sql-where-clause-validator.ts` | React/test-harness | `ParseSQL` |
| `index.ts` | GenericDatabaseProvider | Re-exports (`AnalyzeTopLevelOrderBy`, `ParseToIR`, `RenderIR`) |

**Test code (6 files):**

| File | Package | Methods Used |
|---|---|---|
| `renderPipeline.test.ts` | GenericDatabaseProvider | Pipeline integration tests |
| `structural-parser.test.ts` | GenericDatabaseProvider | `ParseToIR`, `RenderIR` |
| `query-field-extraction.test.ts` | MJCoreEntitiesServer | `ExtractSelectColumns` |
| `MJQueryEntityServer.test.ts` | MJCoreEntitiesServer | `ExtractParameterInfo` |
| `manage-metadata-sql-parsing.test.ts` | CodeGenLib | `ExtractTableRefs` |

### Existing test suite baseline

| Package | Test files | Test cases | Key files for this refactor |
|---|---|---|---|
| SQLParser | 10 | ~462 | `sql-parser.test.ts` (62 — tests AST primitives), `sql-parser.astPrimitives.test.ts` (41) |
| GenericDatabaseProvider | 16 | ~830 | `queryPagingEngine.test.ts` (63), `renderPipeline.test.ts` (186) |
| **Total** | **26** | **~1,292** | |

Every existing test must continue to pass after the refactor.

## Design

### Core Idea

Replace the all-static `SQLParser` class with an instance-based design:

- **Construction** accepts SQL + dialect, parses (with preprocessing fallback), resolves the dialect adapter, and stores all state internally.
- **Instance methods** operate on the internal AST — no `ast` or `dialect` parameters needed.
- **Static utility methods** remain for pure string operations that don't need parsed state.

The `ASTDialectAdapter` pattern (from `plans/ast-dialect-adapter.md`) is incorporated as an internal implementation detail resolved at construction time.

### Layer Diagram

```
Consumer layer (queryPagingEngine, queryCompositionEngine, etc.)
  Constructs: new SQLParser(sql, dialect)
  Sees: RowCapInfo, SQLStatementKind
  Never touches AST fields directly
       |
       v
SQLParser instance (sql-parser.ts)
  Internal state: AST, dialect, adapter, alias map
  Instance methods: StatementKind, OuterCap, SetOuterCap(), ToSQL(), ExtractCTEs()
  Static utilities: StripComments(), Tokenize(), Analyze(), etc.
       |
       v
ASTDialectAdapter (internal to sql-parser)
  TransactSQLAdapter    -- reads/writes root.top
  LimitOffsetAdapter    -- reads/writes root.limit
  (future: FetchFirstAdapter for Oracle, etc.)
       |
       v
node-sql-parser (AST source)

SQLParserDialect (from sql-dialect package, no node-sql-parser dependency)
  Semantic rules: AllowsOrderByInCTE, RecursiveCTESyntax,
  QuoteIdentifier, DefaultPagingOrderBy, LimitClause
```

### Public API — Instance Methods

```typescript
export class SQLParser {
    /**
     * Parse SQL into an instance that exposes typed, dialect-neutral
     * accessors for AST inspection and mutation. Automatically applies
     * preprocessing (bracket-identifier aliasing, etc.) when direct
     * parsing fails, and transparently restores original identifiers
     * on ToSQL().
     */
    constructor(sql: string, dialect: SQLParserDialect);

    // ---- Parse state ------------------------------------------------

    /** Whether the SQL was successfully parsed into an AST. */
    get IsValid(): boolean;

    /** The raw AST. Consumers should prefer typed accessors over direct access. */
    get AST(): NodeSqlParser.AST | NodeSqlParser.AST[] | null;

    /** The dialect passed at construction. */
    get Dialect(): SQLParserDialect;

    // ---- Statement classification (dialect-universal) ----------------

    /** High-level classification: 'select' | 'select-into' | 'set-op' | 'mutation' | 'other' */
    get StatementKind(): SQLStatementKind;

    // ---- Row cap (dialect-neutral, backed by ASTDialectAdapter) ------

    /** The outermost row cap, or null if none. Dialect-neutral. */
    get OuterCap(): RowCapInfo | null;

    /** Set the outermost row cap. Dialect adapter handles TOP vs LIMIT vs FETCH FIRST. */
    SetOuterCap(cap: number): void;

    /** Remove the outermost row cap. */
    ClearOuterCap(): void;

    // ---- SQL emission -----------------------------------------------

    /**
     * Serialize the (possibly mutated) AST back to SQL.
     * Automatically applies preprocessing restoration (alias -> original names).
     */
    ToSQL(): string;

    // ---- Extraction (returns restored strings, never aliased names) --

    /** Extract CTE definitions and main statement. */
    ExtractCTEs(): SQLCTEExtraction | null;

    /** Extract table references from the SQL. */
    ExtractTableRefs(): SQLTableReference[];

    /** Extract column references from the SQL. */
    ExtractColumnRefs(): SQLColumnReference[];

    /** Extract SELECT clause columns. */
    ExtractSelectColumns(): SQLSelectColumn[];

    // ---- Static utilities (no parsed state needed) -------------------

    /** Strip SQL comments, preserving string literals and quoted identifiers. */
    static StripComments(sql: string, dialect: SQLParserDialect): string;

    /** Tokenize MJ SQL into ordered token stream. */
    static Tokenize(sql: string): MJToken[];

    /** Analyze SQL for MJ extensions (boolean flags). */
    static Analyze(sql: string): MJParseResult;

    /** Extract {{query:"..."}} composition references. */
    static ExtractCompositionRefs(sql: string): MJCompositionRef[];

    /** Extract {{ var | filter }} template expressions. */
    static ExtractTemplateExpressions(sql: string): MJTemplateExpr[];

    /** Extract deterministic parameter metadata. */
    static ExtractParameterInfo(sql: string): MJParameterInfo[];

    /** Rename a template variable in all expressions. */
    static RenameTemplateVariable(sql: string, oldName: string, newName: string): string;

    /** Substitute a template variable with a literal value. */
    static SubstituteTemplateVariable(sql: string, variableName: string, literalValue: string): string;

    /** Token-aware scan for FOR JSON / FOR XML / OPTION clauses. */
    static HasUnwrappableTrailingClause(sql: string, dialect: SQLParserDialect): boolean;
}
```

### `RowCapInfo` (replaces `SQLOuterCap`)

```typescript
/**
 * Dialect-neutral description of a row cap on a SELECT statement.
 * No 'kind' field -- consumers don't need to know whether the cap
 * was TOP, LIMIT, or FETCH FIRST. They only ask: "is this a numeric
 * value I can compare against?"
 */
export type RowCapInfo =
    | { value: number; offset: number | null }   // numeric, reducible
    | { isPercent: true }                         // TOP N PERCENT -- not a row count
    | { isNonNumeric: true };                     // TOP (@var), LIMIT $1 -- not static
```

### `SQLStatementKind` — No Change

```typescript
// Already dialect-neutral (ANSI SQL categories)
export type SQLStatementKind = 'select' | 'select-into' | 'set-op' | 'mutation' | 'other';
```

### ASTDialectAdapter (internal)

```typescript
// File: packages/SQLParser/src/ASTDialectAdapter.ts (not exported)

interface ASTDialectAdapter {
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null;
    WriteRowCap(root: Record<string, unknown>, cap: number): void;
    ClearRowCap(root: Record<string, unknown>): void;
}

class TransactSQLAdapter implements ASTDialectAdapter { /* root.top shapes */ }
class LimitOffsetAdapter implements ASTDialectAdapter { /* root.limit shapes */ }

// Keyed by ParserDialect string -- the value passed to node-sql-parser
const ADAPTERS = new Map<string, ASTDialectAdapter>([
    ['TransactSQL', new TransactSQLAdapter()],
    ['PostgresQL',  new LimitOffsetAdapter()],
    ['MySQL',       new LimitOffsetAdapter()],
]);

export function getASTDialectAdapter(dialect: SQLParserDialect): ASTDialectAdapter {
    const adapter = ADAPTERS.get(dialect.ParserDialect);
    if (!adapter) {
        throw new Error(
            `No ASTDialectAdapter registered for ParserDialect "${dialect.ParserDialect}". ` +
            `Register one in packages/SQLParser/src/ASTDialectAdapter.ts when adding a new dialect.`
        );
    }
    return adapter;
}
```

Static `Map`, not MJGlobal ClassFactory — adapters are internal, tightly coupled to `node-sql-parser` AST internals, and cannot be meaningfully overridden by external consumers.

### Construction — Parse with Preprocessing Fallback

```typescript
constructor(sql: string, dialect: SQLParserDialect) {
    this._sql = sql;
    this._dialect = dialect;
    this._adapter = getASTDialectAdapter(dialect);
    this._aliasMap = null;

    // Fast path -- try direct parse first
    this._ast = SQLParser.parseSQL(sql, dialect.ParserDialect);

    if (!this._ast) {
        // Direct parse failed -- try with bracket-identifier aliasing
        const preprocessed = preprocessBracketIdentifiers(sql);
        if (preprocessed.aliasMap.size > 0) {
            this._ast = SQLParser.parseSQL(preprocessed.rewritten, dialect.ParserDialect);
            if (this._ast) {
                this._aliasMap = preprocessed.aliasMap;
            }
        }
    }
}
```

Preprocessing is invisible to consumers. `ToSQL()` automatically applies restoration:

```typescript
ToSQL(): string {
    if (!this._ast) throw new Error('Cannot serialize: SQL was not parseable');
    const raw = SQLParser.sqlifyAST(this._ast, this._dialect);
    return this._aliasMap
        ? restoreBracketIdentifiers(raw, this._aliasMap)
        : raw;
}
```

### What `applyMaxRowsViaAST` Becomes

```typescript
private static applyMaxRowsViaAST(sql: string, cap: number, dialect: SQLDialect) {
    const parsed = new SQLParser(sql, dialect);
    if (!parsed.IsValid) return { outcome: 'unparseable' as const };

    const kind = parsed.StatementKind;
    if (kind === 'mutation' || kind === 'select-into') return { outcome: 'pass-through' as const };
    if (kind === 'set-op') return { outcome: 'unparseable' as const };
    if (kind !== 'select') return { outcome: 'pass-through' as const };

    const existing = parsed.OuterCap;

    // PERCENT and non-numeric caps can't be reasoned about as row counts
    if (existing && ('isPercent' in existing || 'isNonNumeric' in existing)) {
        return { outcome: 'wrap' as const };
    }

    // Existing numeric cap -- only modify when the requested cap is tighter
    if (existing && existing.value <= cap) {
        return { outcome: 'capped' as const, sql };
    }

    parsed.SetOuterCap(cap);
    try {
        return { outcome: 'capped' as const, sql: parsed.ToSQL() };
    } catch {
        return { outcome: 'unparseable' as const };
    }
}
```

No AST passing, no dialect passing, no restore threading. Clean and readable.

## Migration Guide

### Instance method consumers

These files switch from static to instance calls. The migration is mechanical: replace `SQLParser.Foo(ast, dialect)` with `parsed.Foo()` where a `new SQLParser(sql, dialect)` is constructed.

| File | Current Pattern | New Pattern |
|---|---|---|
| `queryPagingEngine.ts` | `SQLParser.ParseSQL` + `GetStatementKind` + `GetOuterCap` + `SetOuterCap` + `SqlifyAST` | `new SQLParser(sql, dialect)` + `.StatementKind` + `.OuterCap` + `.SetOuterCap(cap)` + `.ToSQL()` |
| `queryPagingEngine.ts` (`buildCountSQLViaAST`) | `SQLParser.ParseSQL` + `SqlifyAST` + direct `stmt.top = null` | `new SQLParser(sql, dialect)` + `.ClearOuterCap()` + `.ToSQL()` |
| `resolve.ts` | `SQLParser.ExtractCTEs(sql, dialect)` | `new SQLParser(sql, dialect).ExtractCTEs()` |
| `parse.ts` | `SQLParser.ExtractTableRefs(sql)` + `ExtractSelectColumns(sql, dialect)` | `new SQLParser(sql, dialect)` then `.ExtractTableRefs()` + `.ExtractSelectColumns()` |
| `sql-where-clause-validator.ts` | `SQLParser.ParseSQL(sql, dialect)` | `new SQLParser(sql, dialect).IsValid` (or `.AST` if raw access needed) |
| `manage-metadata.ts` | `SQLParser.ExtractTableRefs(sql)` | `new SQLParser(sql, dialect).ExtractTableRefs()` |

### Static utility consumers — NO CHANGES

These files call static methods that remain static. Zero migration needed:

| File | Methods Used |
|---|---|
| `renderPipeline.ts` | `SQLParser.StripComments()` |
| `queryCompositionEngine.ts` | `SQLParser.Tokenize()`, `ExtractCompositionRefs()`, `RenameTemplateVariable()`, `SubstituteTemplateVariable()` |
| `queryCompositionEngine.ts` | `SQLParser.ExtractCTEs()` — NOTE: this one switches to instance |

### Re-exports (barrel files)

`GenericDatabaseProvider/src/index.ts` re-exports `AnalyzeTopLevelOrderBy`, `HasTopLevelOrderBy`, `ExtractOrderBy`, `ParseToIR`, `RenderIR`. These are standalone functions, not `SQLParser` methods — no changes needed.

### Exported type changes

```diff
// packages/SQLParser/src/index.ts
- SQLOuterCap,
+ RowCapInfo,
```

`SQLStatementKind` export stays unchanged.

## Code Changes

### New Files

| File | Contents | LOC |
|---|---|---|
| `packages/SQLParser/src/ASTDialectAdapter.ts` | `ASTDialectAdapter` interface, `TransactSQLAdapter`, `LimitOffsetAdapter`, `ADAPTERS` map, `getASTDialectAdapter()` | ~120 |
| `packages/SQLParser/src/__tests__/ASTDialectAdapter.test.ts` | Adapter unit tests (see Test Strategy) | ~100 |

### Modified Files

| File | Change | LOC delta |
|---|---|---|
| `packages/SQLParser/src/sql-parser.ts` | Convert AST methods to instance, add constructor with preprocessing, keep static utilities. Remove `SQLOuterCap`, `isSQLServerDialect()`, all direct AST field access in public methods | ~-100 / +150 |
| `packages/SQLParser/src/index.ts` | Export `RowCapInfo` instead of `SQLOuterCap` | ~2 |
| `packages/GenericDatabaseProvider/src/queryPagingEngine.ts` | Migrate to instance-based API | ~-30 / +25 |
| `packages/MJCoreEntitiesServer/src/custom/query-extraction/resolve.ts` | Migrate `ExtractCTEs` call | ~5 |
| `packages/MJCoreEntitiesServer/src/custom/query-extraction/parse.ts` | Migrate extraction calls | ~8 |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Migrate `ExtractTableRefs` call | ~3 |
| `packages/React/test-harness/src/lib/.../sql-where-clause-validator.ts` | Migrate `ParseSQL` call | ~3 |

### Test Files — Updates Required

| File | Tests | What Changes |
|---|---|---|
| `packages/SQLParser/src/__tests__/sql-parser.test.ts` | 62 | Migrate `GetStatementKind`, `GetOuterCap`, `SetOuterCap`, `ClearOuterCap` tests from static to instance. Remove all `kind: 'top'` / `kind: 'limit'` assertions. Add `dialect` to construction. |
| `packages/SQLParser/src/__tests__/sql-parser.astPrimitives.test.ts` | 41 | Migrate `ExtractCTEs`, `ParseSQL`, `ExtractTableRefs`, `ExtractColumnRefs` tests to instance. |
| `packages/GenericDatabaseProvider/src/__tests__/queryPagingEngine.test.ts` | 63 | No changes expected — tests call `WrapWithMaxRows` / `WrapWithPaging` which are the public entry points. Internal refactor is invisible. |
| `packages/GenericDatabaseProvider/src/__tests__/renderPipeline.test.ts` | 186 | No changes expected — tests call the pipeline, not SQLParser directly. |

### Test Files — New Tests Required

See the Test Strategy section below.

## Test Strategy

### Principle

**Every SQL mutation must produce valid, executable SQL.** For row-cap operations specifically, the output must contain the correct dialect-specific syntax (`TOP N` on SQL Server, `LIMIT N` on PostgreSQL) in the correct position. Tests assert on the final SQL string, not on internal AST state.

### 1. ASTDialectAdapter unit tests (new file)

`packages/SQLParser/src/__tests__/ASTDialectAdapter.test.ts`

**TransactSQLAdapter:**
- `ReadRowCap` returns `{ value: 5, offset: null }` for `SELECT TOP 5 * FROM t`
- `ReadRowCap` returns `{ isPercent: true }` for `SELECT TOP 25 PERCENT * FROM t`
- `ReadRowCap` returns `{ isNonNumeric: true }` for `TOP (@n)` AST shape
- `ReadRowCap` returns `null` when no `top` field present
- `WriteRowCap` followed by sqlify produces `SELECT TOP 50 ...` (valid SQL)
- `WriteRowCap` replaces existing TOP: `TOP 500` -> `TOP 100` (valid SQL)
- `ClearRowCap` followed by sqlify produces SQL with no TOP clause

**LimitOffsetAdapter:**
- `ReadRowCap` returns `{ value: 5, offset: null }` for `SELECT * FROM t LIMIT 5`
- `ReadRowCap` returns `{ value: 5, offset: 10 }` for `LIMIT 5 OFFSET 10`
- `ReadRowCap` returns `{ isNonNumeric: true }` for `LIMIT $1` AST shape
- `ReadRowCap` returns `null` when no `limit` field present
- `WriteRowCap` followed by sqlify produces `... LIMIT 50` (valid SQL)
- `WriteRowCap` replaces existing LIMIT: `LIMIT 500` -> `LIMIT 100` (valid SQL)
- `WriteRowCap` preserves OFFSET: `LIMIT 500 OFFSET 25` -> `LIMIT 100 OFFSET 25`
- `ClearRowCap` followed by sqlify produces SQL with no LIMIT clause

**Adapter registry:**
- `getASTDialectAdapter` with `ParserDialect='TransactSQL'` returns `TransactSQLAdapter`
- `getASTDialectAdapter` with `ParserDialect='PostgresQL'` returns `LimitOffsetAdapter`
- `getASTDialectAdapter` with `ParserDialect='MySQL'` returns `LimitOffsetAdapter`
- `getASTDialectAdapter` with unknown dialect throws with actionable error message

### 2. SQLParser instance tests (updated existing + new)

`packages/SQLParser/src/__tests__/sql-parser.test.ts` — update existing 62 tests:

**Construction + IsValid:**
- Valid SELECT: `IsValid` is `true`
- Invalid SQL: `IsValid` is `false`
- Empty string: `IsValid` is `false`

**StatementKind (migrated from static GetStatementKind tests):**
- Plain SELECT -> `'select'`
- CTE-headed SELECT -> `'select'`
- UNION -> `'set-op'`
- SELECT INTO #temp -> `'select-into'`
- UPDATE, DELETE, INSERT -> `'mutation'`

**OuterCap + SetOuterCap (migrated, assertions updated):**

SQL Server dialect:
- `SELECT TOP 5 * FROM Users` -> `OuterCap` is `{ value: 5, offset: null }`
- `SELECT TOP 25 PERCENT * FROM Users` -> `OuterCap` is `{ isPercent: true }`
- `SELECT * FROM Users` (no cap) -> `OuterCap` is `null`
- `SetOuterCap(50)` then `ToSQL()` -> output contains `TOP 50` (valid SQL, correct position)
- `SetOuterCap(100)` on existing `TOP 500` -> `ToSQL()` contains `TOP 100`, not `TOP 500`

PostgreSQL dialect:
- `SELECT * FROM users LIMIT 5` -> `OuterCap` is `{ value: 5, offset: null }`
- `SELECT * FROM users LIMIT 5 OFFSET 10` -> `OuterCap` is `{ value: 5, offset: 10 }`
- `SELECT * FROM users` (no cap) -> `OuterCap` is `null`
- `SetOuterCap(50)` then `ToSQL()` -> output contains `LIMIT 50` (valid SQL)
- `SetOuterCap(100)` on existing `LIMIT 500` -> `ToSQL()` contains `LIMIT 100`
- `SetOuterCap(100)` on `LIMIT 500 OFFSET 25` -> `ToSQL()` contains `LIMIT 100` AND `OFFSET 25`

**ClearOuterCap:**
- SQL Server: removes TOP, `ToSQL()` produces valid SQL without TOP
- PostgreSQL: removes LIMIT, `ToSQL()` produces valid SQL without LIMIT
- No-op when no cap present

**ToSQL round-trip fidelity (new):**
- Parse then `ToSQL()` without mutations produces semantically equivalent SQL
- Mutate cap then `ToSQL()` produces valid, parseable SQL (re-parse succeeds)

### 3. End-to-end paging tests (existing — must all pass)

`packages/GenericDatabaseProvider/src/__tests__/queryPagingEngine.test.ts` (63 tests)

These test `WrapWithMaxRows` and `WrapWithPaging` — the public API that consumers actually call. The internal refactor to instance-based SQLParser must be invisible to these tests. **All 63 must pass without modification.**

Key assertions to verify are intact:
- `WrapWithMaxRows` on plain SELECT produces `SELECT TOP N ...` (SQL Server) / `... LIMIT N` (PostgreSQL)
- `WrapWithMaxRows` on SELECT with existing TOP reduces to `min(existing, requested)`
- `WrapWithMaxRows` on UNION/set-op falls back to outer wrap
- `WrapWithMaxRows` on SELECT INTO returns input unchanged
- `WrapWithMaxRows` on mutations returns input unchanged
- Count SQL wraps in CTE with `SELECT COUNT(*)`

### 4. Render pipeline tests (existing — must all pass)

`packages/GenericDatabaseProvider/src/__tests__/renderPipeline.test.ts` (186 tests)

The full pipeline (composition -> templates -> paging). All 186 must pass. These are the ultimate integration tests that prove the refactored paging path produces valid SQL end-to-end.

### 5. SQL validity edge cases (new — add to sql-parser.test.ts)

These tests parse SQL, mutate the cap, call `ToSQL()`, and **re-parse the output** to prove the result is valid SQL:

**SQL Server:**
- `SELECT * FROM Users` + `SetOuterCap(100)` -> re-parse succeeds, has TOP 100
- `SELECT TOP 500 * FROM Users WHERE Active = 1` + `SetOuterCap(100)` -> re-parse succeeds, has TOP 100
- `SELECT DISTINCT TOP 50 Name FROM Users` + `SetOuterCap(25)` -> re-parse succeeds, DISTINCT preserved, TOP 25
- `WITH cte AS (SELECT 1 AS a) SELECT * FROM cte` + `SetOuterCap(10)` -> re-parse succeeds, CTE intact, TOP 10
- `SELECT TOP 10 * FROM Users ORDER BY Name` + `SetOuterCap(5)` -> re-parse succeeds, ORDER BY preserved

**PostgreSQL:**
- `SELECT * FROM users` + `SetOuterCap(100)` -> re-parse succeeds, has LIMIT 100
- `SELECT * FROM users LIMIT 500` + `SetOuterCap(100)` -> re-parse succeeds, has LIMIT 100
- `SELECT * FROM users LIMIT 500 OFFSET 25` + `SetOuterCap(100)` -> re-parse succeeds, LIMIT 100, OFFSET 25
- `SELECT DISTINCT name FROM users` + `SetOuterCap(25)` -> re-parse succeeds, DISTINCT preserved
- `WITH cte AS (SELECT 1 AS a) SELECT * FROM cte` + `SetOuterCap(10)` -> re-parse succeeds, CTE intact, LIMIT 10

**Cross-dialect validation pattern:**
```typescript
function assertValidCapInjection(sql: string, cap: number, dialect: SQLParserDialect) {
    const parsed = new SQLParser(sql, dialect);
    expect(parsed.IsValid).toBe(true);

    parsed.SetOuterCap(cap);
    const output = parsed.ToSQL();

    // Re-parse to prove validity
    const reparsed = new SQLParser(output, dialect);
    expect(reparsed.IsValid).toBe(true);

    // Verify the cap was applied
    const appliedCap = reparsed.OuterCap;
    expect(appliedCap).toBeDefined();
    expect(appliedCap).not.toBeNull();
    expect('value' in appliedCap!).toBe(true);
    expect((appliedCap as { value: number }).value).toBe(cap);
}
```

### 6. Preprocessing tests (new — when preprocessing is implemented)

Bracket-identifier aliasing tests for the constructor's fallback path:

- `WITH [Active People] AS (...) SELECT * FROM [Active People]` -> `IsValid` is `true`
- Same query + `SetOuterCap(100)` + `ToSQL()` -> output contains original `[Active People]`, not aliases
- `WITH [my-cte] AS (...) SELECT * FROM [my-cte]` -> `IsValid` is `true`, `ToSQL()` preserves `[my-cte]`
- SQL with no problematic identifiers -> fast path (no preprocessing), `IsValid` matches direct parse
- `[ActivePeople]` (no special chars) -> NOT preprocessed
- Bracket inside string literal -> NOT aliased

### 7. Regression suite (all existing tests — must pass)

Run the full test suites for both packages:

```bash
cd packages/SQLParser && npm run test           # ~462 tests
cd packages/GenericDatabaseProvider && npm run test  # ~830 tests
```

**Every test must pass.** The refactor changes internal structure, not external behavior.

## Sequencing

This work can be split into two PRs if scope is a concern, or delivered as one:

### Option A: Single PR (recommended)

One PR that:
1. Adds `ASTDialectAdapter.ts` with adapters and registry
2. Converts `SQLParser` to instance-based (AST methods) + static (utilities)
3. Replaces `SQLOuterCap` with `RowCapInfo`
4. Migrates all consumers
5. Updates all existing tests, adds new tests
6. Incorporates preprocessing fallback in the constructor

**Why single PR**: The AST primitives from PR #2692 have zero consumers yet. Better to ship the correct design once than iterate through an intermediate static-adapter step.

### Option B: Two PRs

**PR 1**: Adapter + `RowCapInfo` type (keep static methods, add dialect param to `GetOuterCap`/`ClearOuterCap`)
**PR 2**: Instance redesign + preprocessing

Lower risk per PR, but two migration passes for test files.

## What Does NOT Change

| Concern | Why unchanged |
|---|---|
| **Static utility methods** | `StripComments`, `Tokenize`, `Analyze`, `ExtractCompositionRefs`, `ExtractTemplateExpressions`, `ExtractParameterInfo`, `RenameTemplateVariable`, `SubstituteTemplateVariable`, `HasUnwrappableTrailingClause` — all pure string operations with no parsed state |
| **`SQLStatementKind` type** | Already dialect-neutral |
| **`SQLParserDialect` interface** | No changes to the dialect package |
| **`sql-dialect` package** | Remains dependency-free, no `node-sql-parser` knowledge |
| **Re-exported functions** | `AnalyzeTopLevelOrderBy`, `HasTopLevelOrderBy`, `ExtractOrderBy`, `ParseToIR`, `RenderIR` — standalone functions, not `SQLParser` methods |
| **MJ AST types** | `MJAstifyResult`, `MJToken`, `MJCompositionRef`, etc. — unchanged |

## Acceptance Criteria

1. All existing tests pass (~1,292 across both packages) with no behavioral regressions
2. New adapter tests cover Read/Write/Clear for both dialect families with valid SQL assertions
3. New SQL validity tests prove that `SetOuterCap` + `ToSQL` produces re-parseable SQL with correct `TOP N` / `LIMIT N` syntax
4. `SQLOuterCap` type is replaced by dialect-neutral `RowCapInfo` — no `kind: 'top' | 'limit'` in any exported type
5. No `isSQLServerDialect()` probe or `dialect.PlatformKey === 'sqlserver'` check in the row-cap path
6. No direct AST field access (`root.top`, `root.limit`) outside of `ASTDialectAdapter` implementations
7. No `as unknown as Record<string, unknown>` casts in any consumer — all AST manipulation flows through the instance API
8. Both `packages/SQLParser` and `packages/GenericDatabaseProvider` build cleanly with `npm run build`
