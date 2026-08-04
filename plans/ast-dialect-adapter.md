# AST Dialect Adapter — Implementation Plan

## Problem

PR #2692 introduced five typed AST primitives on `SQLParser` (`GetStatementKind`, `GetOuterCap`, `SetOuterCap`, `ClearOuterCap`, `HasUnwrappableTrailingClause`) that centralize `node-sql-parser` AST shape knowledge. This is a significant improvement over the raw AST poking that was in `queryPagingEngine` before.

However, the public types and internal implementation still leak dialect-specific AST details:

1. **`SQLOuterCap`** uses `kind: 'top' | 'limit'` — a discriminated union that names SQL Server and PostgreSQL syntax. Adding Oracle (`FETCH FIRST N ROWS ONLY`) would require a third variant, and every consumer's pattern match would need updating.

2. **`GetOuterCap`** takes no dialect parameter but sniffs both `root.top` and `root.limit` on every call — fragile if a future dialect uses overlapping field names.

3. **`SetOuterCap`** uses a private `isSQLServerDialect()` probe that infers dialect identity from `QuoteIdentifier` output, rather than routing through the dialect directly.

4. **`ClearOuterCap`** nullifies both `root.top` and `root.limit` unconditionally — correct but couples the method to knowledge of all possible cap fields across all dialects.

The `@memberjunction/sql-dialect` package already has `LimitClause()` for SQL generation and `PlatformKey` for identity — but `SQLParser` can't use these because the minimal `SQLParserDialect` interface doesn't expose them, and the dialect package shouldn't take a dependency on `node-sql-parser`.

## Research Findings

An exhaustive inventory of all dialect-specific AST field accesses across `sql-parser` and `GenericDatabaseProvider` reveals:

| AST Field | Same shape across dialects? | Dialect-specific manipulation? |
|---|---|---|
| `root.top` | N/A (SQL Server only) | **Yes** — Read + Write in row-cap path |
| `root.limit` | N/A (PostgreSQL/MySQL only) | **Yes** — Read + Write in row-cap path |
| `root.with` (CTEs) | Yes — same array structure | No — quoting handled by `dialect.QuoteIdentifier()` |
| `root._next` (UNION chain) | Yes | No |
| `root.set_op` | Yes | No |
| `root.into` (SELECT INTO) | Yes | No |
| `root.for` (FOR JSON/XML) | Yes | No |
| `root.orderby` | Yes | No |
| `root.type` | Yes | No |

**Key finding**: The row-cap form (`root.top` vs `root.limit`) is the **only** AST field that genuinely varies by dialect. All other dialect challenges (CTE bracket-quoted names breaking the parser, ORDER BY legality in CTEs, RECURSIVE keyword) are either parser limitations (addressed by preprocessing) or semantic rules (already on `SQLParserDialect` properties).

**Consumer analysis**: `GetOuterCap`, `SetOuterCap`, `GetStatementKind`, and `ClearOuterCap` are new in PR #2692 — no external consumers exist yet. The types can be redesigned without breaking anything.

## Design

### Core Idea

Introduce an internal **`ASTDialectAdapter`** interface inside `@memberjunction/sql-parser` that encapsulates dialect-specific AST field shapes. Each adapter knows how its dialect represents concepts in the AST that differ structurally between platforms. The adapter is **not exported** — consumers see only dialect-neutral types (`RowCapInfo`, `SQLStatementKind`).

The `sql-dialect` package remains dependency-free. The adapter classes live entirely within `sql-parser` and are keyed by `ParserDialect` — the string already on `SQLParserDialect` that we pass to `node-sql-parser`. This is the natural key: it identifies exactly which AST shape the parser will produce.

### Layer Diagram

```
Consumer layer (queryPagingEngine, buildCountSQLViaAST, etc.)
  Sees: RowCapInfo, SQLStatementKind
  Never touches AST fields directly
       │
       ▼
SQLParser public API (sql-parser.ts)
  GetOuterCap(ast, dialect)  → RowCapInfo
  SetOuterCap(ast, cap, dialect)
  ClearOuterCap(ast, dialect)
  GetStatementKind(ast)      → SQLStatementKind  ← dialect-universal, no adapter
  ExtractCTEs(sql, dialect)                       ← dialect-universal, no adapter
       │
       ▼
ASTDialectAdapter (internal to sql-parser)
  TransactSQLAdapter    — reads/writes root.top
  LimitOffsetAdapter    — reads/writes root.limit
  (future: FetchFirstAdapter for Oracle, etc.)
       │
       ▼
node-sql-parser (AST source)
  Dialect-specific AST field names and shapes

SQLParserDialect (from sql-dialect package, no node-sql-parser dependency)
  Semantic rules: AllowsOrderByInCTE, RecursiveCTESyntax,
  QuoteIdentifier, DefaultPagingOrderBy, LimitClause
```

### New Internal Interface

```typescript
// File: packages/SQLParser/src/ASTDialectAdapter.ts (new file)

/**
 * Encapsulates dialect-specific node-sql-parser AST field shapes.
 *
 * Each adapter knows how its dialect represents concepts that differ
 * structurally between platforms. Concepts with identical AST shapes
 * across dialects (CTEs, set-ops, ORDER BY, etc.) are handled directly
 * by SQLParser — no adapter needed.
 *
 * Internal to @memberjunction/sql-parser. Not exported.
 * Consumers see only dialect-neutral return types (RowCapInfo, etc.).
 */
interface ASTDialectAdapter {
    /** Read the outermost row cap from an AST root node. */
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null;

    /** Write a numeric row cap onto an AST root node. */
    WriteRowCap(root: Record<string, unknown>, cap: number): void;

    /** Remove the row cap from an AST root node. */
    ClearRowCap(root: Record<string, unknown>): void;

    // Future method groups are added here as new dialect-specific
    // AST shape differences are discovered. Each group follows
    // the same Read/Write/Clear pattern for one semantic concept.
}
```

### Concrete Adapters

```typescript
// Same file: packages/SQLParser/src/ASTDialectAdapter.ts

/**
 * SQL Server: row caps use root.top = { value, percent }.
 */
class TransactSQLAdapter implements ASTDialectAdapter {
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null {
        const top = root.top as { value?: unknown; percent?: unknown } | null | undefined;
        if (top == null) return null;
        if (top.percent) return { isPercent: true };
        const v = typeof top.value === 'number' ? top.value : Number(top.value);
        if (!Number.isFinite(v)) return { isNonNumeric: true };
        return { value: v, offset: null };
    }

    WriteRowCap(root: Record<string, unknown>, cap: number): void {
        root.top = { value: cap, percent: null };
    }

    ClearRowCap(root: Record<string, unknown>): void {
        root.top = null;
    }
}

/**
 * PostgreSQL / MySQL: row caps use root.limit = { seperator, value: [{ value }] }.
 *
 * node-sql-parser shape:
 *   LIMIT N          → value=[{value:N}],           seperator=''
 *   LIMIT N OFFSET M → value=[{value:N}, {value:M}], seperator='offset'
 */
class LimitOffsetAdapter implements ASTDialectAdapter {
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null {
        const limit = root.limit as
            | { value?: { value: unknown }[]; seperator?: string }
            | null | undefined;
        if (limit == null || !Array.isArray(limit.value) || limit.value.length === 0) {
            return null;
        }
        const limitNode = limit.value[0];
        const v = typeof limitNode.value === 'number'
            ? limitNode.value
            : Number(limitNode.value);
        if (!Number.isFinite(v)) return { isNonNumeric: true };

        let offset: number | null = null;
        if (limit.value.length > 1) {
            const offsetNode = limit.value[1];
            const o = typeof offsetNode.value === 'number'
                ? offsetNode.value
                : Number(offsetNode.value);
            offset = Number.isFinite(o) ? o : null;
        }
        return { value: v, offset };
    }

    WriteRowCap(root: Record<string, unknown>, cap: number): void {
        const existing = root.limit as
            | { value?: { value: unknown }[] }
            | null | undefined;
        const offsetNode = existing?.value && existing.value.length > 1
            ? existing.value[1]
            : null;
        if (offsetNode) {
            root.limit = {
                seperator: 'offset',
                value: [{ type: 'number', value: cap }, offsetNode],
            };
        } else {
            root.limit = {
                seperator: '',
                value: [{ type: 'number', value: cap }],
            };
        }
    }

    ClearRowCap(root: Record<string, unknown>): void {
        root.limit = null;
    }
}
```

### Adapter Registry

```typescript
// Same file: packages/SQLParser/src/ASTDialectAdapter.ts

/**
 * Maps node-sql-parser dialect strings to their ASTDialectAdapter.
 *
 * Keyed by ParserDialect (the string passed to node-sql-parser).
 * This is the right key because it identifies exactly which AST
 * shape the parser will produce.
 *
 * Static map, not MJGlobal ClassFactory — these adapters are internal
 * to sql-parser, tightly coupled to node-sql-parser AST internals,
 * and cannot be meaningfully overridden by external consumers.
 * Adding a new dialect requires modifying sql-parser regardless.
 */
const ADAPTERS = new Map<string, ASTDialectAdapter>([
    ['TransactSQL',  new TransactSQLAdapter()],
    ['PostgresQL',   new LimitOffsetAdapter()],
    ['MySQL',        new LimitOffsetAdapter()],
]);

/**
 * Resolves the adapter for a given dialect.
 * Throws if no adapter is registered — this is a developer error
 * (added a dialect to sql-dialect but forgot the adapter in sql-parser).
 */
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

### New Public Type: `RowCapInfo` (replaces `SQLOuterCap`)

```typescript
// File: packages/SQLParser/src/sql-parser.ts (replaces SQLOuterCap)

/**
 * Dialect-neutral description of a row cap found on a SELECT statement.
 *
 * No `kind` field — consumers don't need to know whether the cap
 * was expressed as TOP, LIMIT, or FETCH FIRST. They only need to
 * know: "is this a numeric value I can compare against?"
 */
export type RowCapInfo =
    /** Numeric cap — can be compared against a requested row limit */
    | { value: number; offset: number | null }
    /** Percentage-based cap (e.g., SQL Server TOP N PERCENT) — not a row count */
    | { isPercent: true }
    /** Non-numeric expression (e.g., TOP (@var), LIMIT $1) — not statically known */
    | { isNonNumeric: true };
```

### `SQLStatementKind` — No Change

```typescript
// Stays exactly as-is. Already dialect-neutral (ANSI SQL categories).
export type SQLStatementKind =
    | 'select'
    | 'select-into'
    | 'set-op'
    | 'mutation'
    | 'other';
```

## Code Changes

### File: `packages/SQLParser/src/ASTDialectAdapter.ts` (new)

~120 lines. Contains:
- `ASTDialectAdapter` interface
- `TransactSQLAdapter` class
- `LimitOffsetAdapter` class
- `ADAPTERS` map
- `getASTDialectAdapter()` resolver function
- `RowCapInfo` type export

### File: `packages/SQLParser/src/sql-parser.ts` (modify)

**Remove:**
- `SQLOuterCap` type definition (lines 158-168)
- `isSQLServerDialect()` private method (lines 381-383)
- All AST field access in `GetOuterCap` (lines 314-338)
- All AST field access in `SetOuterCap` (lines 355-373)
- All AST field access in `ClearOuterCap` (lines 389-393)

**Add:**
- Import `getASTDialectAdapter` and `RowCapInfo` from `./ASTDialectAdapter.js`

**Modify signatures:**

| Method | Before | After |
|---|---|---|
| `GetOuterCap` | `(ast): SQLOuterCap \| null` | `(ast, dialect): RowCapInfo \| null` |
| `SetOuterCap` | `(ast, cap, dialect): void` | No signature change (already takes dialect) |
| `ClearOuterCap` | `(ast): void` | `(ast, dialect): void` |

**New method bodies** (delegate to adapter):

```typescript
static GetOuterCap(
    ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null,
    dialect: SQLParserDialect,
): RowCapInfo | null {
    const root = SQLParser.unwrapRoot(ast);
    if (!root || root.type !== 'select') return null;
    return getASTDialectAdapter(dialect).ReadRowCap(
        root as unknown as Record<string, unknown>
    );
}

static SetOuterCap(
    ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null,
    cap: number,
    dialect: SQLParserDialect,
): void {
    const root = SQLParser.unwrapRoot(ast);
    if (!root || root.type !== 'select') return;
    getASTDialectAdapter(dialect).WriteRowCap(
        root as unknown as Record<string, unknown>,
        cap,
    );
}

static ClearOuterCap(
    ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null,
    dialect: SQLParserDialect,
): void {
    const root = SQLParser.unwrapRoot(ast);
    if (!root || root.type !== 'select') return;
    getASTDialectAdapter(dialect).ClearRowCap(
        root as unknown as Record<string, unknown>
    );
}
```

### File: `packages/SQLParser/src/index.ts` (modify)

```diff
- SQLOuterCap,
+ RowCapInfo,
```

Also export `RowCapInfo` from `ASTDialectAdapter.ts` (or re-export through `sql-parser.ts`).

### File: `packages/GenericDatabaseProvider/src/queryPagingEngine.ts` (modify)

**`applyMaxRowsViaAST`** (line 176):

```diff
- const existing = SQLParser.GetOuterCap(ast);
+ const existing = SQLParser.GetOuterCap(ast, dialect);
```

The `'isPercent' in existing` and `'isNonNumeric' in existing` checks on line 180 still work — `RowCapInfo` uses the same field names as `SQLOuterCap` for these variants. The `existing.value` access on line 186 also works. No other changes needed in this method.

**`buildCountSQLViaAST`** (line 287):

```diff
  if (stmt.top) stmt.top = null;
```

This direct AST access in `buildCountSQLViaAST` is a separate concern — it's clearing a TOP before wrapping in a count CTE. Two options:

1. Use `SQLParser.ClearOuterCap(ast, dialect)` before extracting CTEs (preferred — eliminates the last direct AST poke in the consumer).
2. Leave it as-is for now — it's a single line and `buildCountSQLViaAST` already works with the raw AST object.

Recommend option 1 for consistency with the PR's stated goal of removing all direct AST field access from consumers.

**`outerWrap`** (lines 137-140):

```typescript
if (dialect.PlatformKey === 'sqlserver') {
    return `SELECT TOP ${cap} * FROM (...) AS _mj_capped`;
}
return `SELECT * FROM (...) AS _mj_capped LIMIT ${cap}`;
```

This is string construction, not AST manipulation — it doesn't touch `node-sql-parser` at all. It could use `dialect.LimitClause(cap)` for full abstraction:

```typescript
private static outerWrap(sql: string, cap: number, dialect: SQLDialect): string {
    const lc = dialect.LimitClause(cap);
    return `SELECT ${lc.prefix ? lc.prefix + ' ' : ''}* FROM (\n${sql}\n) AS _mj_capped${lc.suffix ? '\n' + lc.suffix : ''}`;
}
```

This removes the last `PlatformKey === 'sqlserver'` check from the row-cap path. Optional but recommended.

### File: `packages/SQLParser/src/__tests__/sql-parser.astPrimitives.test.ts` (modify)

Update all `GetOuterCap` calls to pass the dialect parameter:

```diff
- expect(SQLParser.GetOuterCap(ast)).toEqual({ kind: 'top', value: 5 });
+ expect(SQLParser.GetOuterCap(ast, tsql)).toEqual({ value: 5, offset: null });
```

```diff
- expect(SQLParser.GetOuterCap(ast)).toEqual({ kind: 'limit', value: 5, offset: null });
+ expect(SQLParser.GetOuterCap(ast, pg)).toEqual({ value: 5, offset: null });
```

Update all `ClearOuterCap` calls to pass the dialect parameter:

```diff
- SQLParser.ClearOuterCap(ast);
+ SQLParser.ClearOuterCap(ast, tsql);
```

Remove all assertions on `kind` field — it no longer exists.

Remove the `isPercent` test's `kind: 'top'` check:

```diff
- expect(cap).toMatchObject({ kind: 'top', isPercent: true });
+ expect(cap).toMatchObject({ isPercent: true });
```

### File: `packages/SQLParser/src/__tests__/ASTDialectAdapter.test.ts` (new)

~80 lines. Unit tests for the adapter classes directly:

**TransactSQLAdapter tests:**
- `ReadRowCap` returns `{ value: N, offset: null }` for numeric TOP
- `ReadRowCap` returns `{ isPercent: true }` for TOP PERCENT
- `ReadRowCap` returns `{ isNonNumeric: true }` for non-numeric TOP
- `ReadRowCap` returns `null` when no `top` field
- `WriteRowCap` sets `root.top = { value: N, percent: null }`
- `ClearRowCap` nullifies `root.top`

**LimitOffsetAdapter tests:**
- `ReadRowCap` returns `{ value: N, offset: null }` for LIMIT N
- `ReadRowCap` returns `{ value: N, offset: M }` for LIMIT N OFFSET M
- `ReadRowCap` returns `{ isNonNumeric: true }` for non-numeric LIMIT
- `ReadRowCap` returns `null` when no `limit` field
- `WriteRowCap` sets `root.limit` with correct shape
- `WriteRowCap` preserves existing OFFSET node
- `ClearRowCap` nullifies `root.limit`

**Registry tests:**
- `getASTDialectAdapter('TransactSQL')` returns `TransactSQLAdapter`
- `getASTDialectAdapter('PostgresQL')` returns `LimitOffsetAdapter`
- `getASTDialectAdapter('MySQL')` returns `LimitOffsetAdapter`
- `getASTDialectAdapter('Unknown')` throws with actionable error message

## What Does NOT Change

These areas were evaluated and confirmed to not need the adapter pattern:

| Concern | Why no adapter needed |
|---|---|
| **CTE extraction** (`root.with`) | Same AST structure across all dialects. Challenges are parser limitations (bracket-quoted names) addressed by preprocessing, not AST shape. |
| **Set operations** (`root._next`, `root.set_op`) | Same chaining structure across dialects. |
| **SELECT INTO** (`root.into`) | Same shape. SQL Server feature but detection is universal. |
| **FOR JSON/XML** (`root.for`) | Same shape. SQL Server feature but detection is universal. |
| **ORDER BY** (`root.orderby`) | Same shape. Semantic rules (CTE legality) handled by `SQLParserDialect.AllowsOrderByInCTE`. |
| **Statement type** (`root.type`) | Same values across dialects (`'select'`, `'insert'`, etc.). |
| **`HasUnwrappableTrailingClause`** | Token scanning, not AST manipulation. Uses `QuoteIdentifier` probe for quoting style — correct abstraction (asks about capability, not identity). |
| **`GetStatementKind`** | Reads `root.type`, `root.into`, `root.set_op` — all dialect-universal shapes. |

## Extensibility

### Adding a new dialect (e.g., Oracle)

1. In `sql-dialect`: Create `OracleDialect extends SQLDialect` with `ParserDialect = 'Oracle'` (or whatever string `node-sql-parser` expects)
2. In `sql-parser/src/ASTDialectAdapter.ts`: Create `FetchFirstAdapter implements ASTDialectAdapter` that reads/writes whatever AST field `node-sql-parser` uses for `FETCH FIRST N ROWS ONLY`
3. Register: `ADAPTERS.set('Oracle', new FetchFirstAdapter())`
4. **Zero changes to `SQLParser`'s public methods, zero changes to `queryPagingEngine`**

### Adding a new adapter method group

When a future `node-sql-parser` version (or new dialect) introduces a new AST shape difference:

1. Add the method group to `ASTDialectAdapter` interface
2. Implement in each concrete adapter
3. Add a new `SQLParser` public method that delegates to the adapter

The bar for adding a new group: **does `node-sql-parser` use a different AST field name or structure for the same semantic concept on different dialects?** If yes, adapter. If the AST shape is the same and the difference is a semantic rule, it belongs on `SQLParserDialect`.

## Why Static Map, Not MJGlobal ClassFactory

The `ASTDialectAdapter` uses a plain `Map` registry, not `@RegisterClass` / `MJGlobal.ClassFactory`. Rationale:

- **Internal implementation detail** — adapters are not exported, not visible to consumers
- **Tightly coupled to `node-sql-parser` internals** — an external consumer couldn't meaningfully write one without deep knowledge of undocumented AST field shapes
- **Closed set** — adding a dialect always requires modifying `sql-parser` anyway (parser support, `SqlifyAST` quoting, tests)
- **Fail-loud on missing adapter** — `getASTDialectAdapter` throws with an actionable error message pointing to the exact file to modify

ClassFactory adds indirection (global store lookup, priority ordering, decorator registration) for a registration that will always happen in the same package, in the same file, with zero external consumers.

## Test Strategy

### Unit tests (per adapter, in `ASTDialectAdapter.test.ts`)

- Each Read/Write/Clear method tested with representative AST node shapes
- Edge cases: null fields, non-numeric values, PERCENT flag, OFFSET preservation
- Registry: correct adapter returned for each dialect string, error on unknown

### Integration tests (updated `sql-parser.astPrimitives.test.ts`)

- All existing tests updated for new signatures (`dialect` param on `GetOuterCap`, `ClearOuterCap`)
- All `kind` field assertions removed
- Same behavioral coverage — just dialect-neutral assertions

### Consumer tests (existing `queryPagingEngine` test suite)

- No behavioral changes — same SQL inputs produce same SQL outputs
- The 758 existing tests in GenericDatabaseProvider should pass without modification (the `applyMaxRowsViaAST` change is internal)

## File Summary

| File | Change | LOC |
|---|---|---|
| `packages/SQLParser/src/ASTDialectAdapter.ts` | New — interface, adapters, registry | ~120 |
| `packages/SQLParser/src/sql-parser.ts` | Modify — delegate to adapters, rename type | ~-60 / +20 |
| `packages/SQLParser/src/index.ts` | Modify — export `RowCapInfo` instead of `SQLOuterCap` | ~2 |
| `packages/SQLParser/src/__tests__/ASTDialectAdapter.test.ts` | New — adapter unit tests | ~80 |
| `packages/SQLParser/src/__tests__/sql-parser.astPrimitives.test.ts` | Modify — update signatures and assertions | ~20 changed |
| `packages/GenericDatabaseProvider/src/queryPagingEngine.ts` | Modify — pass dialect to `GetOuterCap`/`ClearOuterCap` | ~5 |

Net: ~+200 LOC new code/tests, ~-60 LOC removed from `sql-parser.ts`. Same external behavior, cleaner internal boundary, forward-compatible with new dialects.
