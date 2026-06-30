/**
 * ASTDialectAdapter — dialect-specific node-sql-parser AST field shapes.
 *
 * The only AST field that genuinely varies in shape between dialects is the
 * row cap: SQL Server uses `root.top`, PostgreSQL / MySQL use `root.limit`.
 * Each adapter encapsulates the read/write/clear logic for its dialect's row
 * cap. Everything else (CTEs, set-ops, ORDER BY, SELECT INTO, FOR JSON/XML)
 * has an identical AST shape across dialects and is handled directly by
 * SQLParser — no adapter needed.
 *
 * Internal to @memberjunction/sql-parser. The adapters themselves are NOT
 * exported; consumers see only the dialect-neutral {@link RowCapInfo} return
 * type and the resolver. This keeps node-sql-parser's AST shape knowledge
 * confined to this one file.
 */

import type { SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Dialect-neutral description of a row cap found on a SELECT statement.
 *
 * There is deliberately no TOP/LIMIT naming — consumers don't need to know
 * which syntax form produced the cap. The explicit `form` discriminant keeps
 * narrowing robust: a future variant cannot silently break an `in`-based guard.
 */
export type RowCapInfo =
    /** Numeric cap — comparable against a requested row limit. */
    | { form: 'numeric'; value: number; offset: number | null }
    /** Percentage cap (SQL Server `TOP N PERCENT`) — a fraction, not a row count. */
    | { form: 'percent' }
    /** Non-numeric expression (`TOP (@var)`, `LIMIT $1`) — not statically known. */
    | { form: 'opaque' };

/**
 * Encapsulates one dialect's row-cap AST field shape. An instance of SQLParser
 * binds exactly one dialect and therefore one adapter, so a TOP-form AST is
 * never read/written through a LIMIT-form adapter (and vice versa).
 */
export interface ASTDialectAdapter {
    /** Read the outermost row cap from an AST root node, or null when none. */
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null;
    /** Write a numeric row cap onto an AST root node (preserving any OFFSET). */
    WriteRowCap(root: Record<string, unknown>, cap: number): void;
    /** Remove the row cap from an AST root node. */
    ClearRowCap(root: Record<string, unknown>): void;
}

/**
 * SQL Server: row caps live on `root.top = { value, percent }`.
 */
class TransactSQLAdapter implements ASTDialectAdapter {
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null {
        const top = root.top as { value?: unknown; percent?: unknown } | null | undefined;
        if (top == null) return null;
        if (top.percent) return { form: 'percent' };
        const v = typeof top.value === 'number' ? top.value : Number(top.value);
        if (!Number.isFinite(v)) return { form: 'opaque' };
        return { form: 'numeric', value: v, offset: null };
    }

    WriteRowCap(root: Record<string, unknown>, cap: number): void {
        root.top = { value: cap, percent: null };
    }

    ClearRowCap(root: Record<string, unknown>): void {
        root.top = null;
    }
}

/**
 * PostgreSQL / MySQL: row caps live on `root.limit`.
 *
 * node-sql-parser shape:
 *   LIMIT N          → value=[{value:N}],            seperator=''
 *   LIMIT N OFFSET M → value=[{value:N}, {value:M}], seperator='offset'
 * The LIMIT value is always at index 0 in these dialects.
 */
class LimitOffsetAdapter implements ASTDialectAdapter {
    ReadRowCap(root: Record<string, unknown>): RowCapInfo | null {
        const limit = root.limit as
            | { value?: { value: unknown }[]; seperator?: string }
            | null
            | undefined;
        if (limit == null || !Array.isArray(limit.value) || limit.value.length === 0) {
            return null;
        }
        const limitNode = limit.value[0];
        const v = typeof limitNode.value === 'number' ? limitNode.value : Number(limitNode.value);
        if (!Number.isFinite(v)) return { form: 'opaque' };

        let offset: number | null = null;
        if (limit.value.length > 1) {
            const offsetNode = limit.value[1];
            const o = typeof offsetNode.value === 'number' ? offsetNode.value : Number(offsetNode.value);
            offset = Number.isFinite(o) ? o : null;
        }
        return { form: 'numeric', value: v, offset };
    }

    WriteRowCap(root: Record<string, unknown>, cap: number): void {
        const existing = root.limit as { value?: { value: unknown }[] } | null | undefined;
        const offsetNode = existing?.value && existing.value.length > 1 ? existing.value[1] : null;
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

/**
 * Maps node-sql-parser dialect strings (the value passed to node-sql-parser,
 * exposed as `SQLParserDialect.ParserDialect`) to their adapter. This is the
 * correct key because it identifies exactly which AST shape the parser
 * produces.
 *
 * A plain Map, not MJGlobal.ClassFactory: these adapters are internal, tightly
 * coupled to undocumented node-sql-parser internals, form a closed set (adding
 * a dialect always touches this file anyway), and cannot be meaningfully
 * overridden by an external consumer.
 */
const ADAPTERS = new Map<string, ASTDialectAdapter>([
    ['TransactSQL', new TransactSQLAdapter()],
    ['PostgresQL', new LimitOffsetAdapter()],
    ['MySQL', new LimitOffsetAdapter()],
]);

/**
 * Resolves the AST adapter for a dialect. Throws when none is registered —
 * a developer error (a dialect was added to sql-dialect without a matching
 * adapter here).
 */
export function getASTDialectAdapter(dialect: SQLParserDialect): ASTDialectAdapter {
    const adapter = ADAPTERS.get(dialect.ParserDialect);
    if (!adapter) {
        throw new Error(
            `No ASTDialectAdapter registered for ParserDialect "${dialect.ParserDialect}". ` +
            `Register one in packages/SQLParser/src/ASTDialectAdapter.ts when adding a new dialect.`,
        );
    }
    return adapter;
}
