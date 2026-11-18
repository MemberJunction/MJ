/**
 * The row cap on a node-sql-parser AST root, for the frozen `SQLParser` instance API
 * (`OuterCap`, `SetOuterCap`, `ClearOuterCap`).
 *
 * The cap is the one AST field whose shape differs between grammars: TransactSQL keeps it on
 * `root.top = { value, percent }`; PostgresQL, MySQL, Snowflake and Hive keep it on
 * `root.limit = { seperator, value: [limitNode, offsetNode?] }` (`seperator` is node-sql-parser's
 * spelling).
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

/** Where a grammar's AST keeps the row cap. */
export type RowCapField = 'top' | 'limit';

const ROW_CAP_FIELDS: ReadonlyMap<string, RowCapField> = new Map<string, RowCapField>([
    ['TransactSQL', 'top'],
    ['PostgresQL', 'limit'],
    ['MySQL', 'limit'],
    ['Snowflake', 'limit'],
    ['Hive', 'limit'],
]);

/**
 * The AST field the dialect's grammar keeps the row cap on. Throws for a grammar this module does not
 * know, so a new dialect is noticed when its first `SQLParser` is built rather than misread later.
 */
export function RowCapFieldFor(dialect: SQLParserDialect): RowCapField {
    const field = ROW_CAP_FIELDS.get(dialect.ParserDialect);
    if (!field) {
        throw new Error(
            `No row-cap form registered for ParserDialect "${dialect.ParserDialect}". ` +
            `Register it in packages/SQLParser/src/legacy/nodeSqlRowCap.ts when adding a new dialect.`,
        );
    }
    return field;
}

/** A node value as a finite number, or NaN. */
function numericValue(value: unknown): number {
    return typeof value === 'number' ? value : Number(value);
}

function readTop(root: Record<string, unknown>): RowCapInfo | null {
    const top = root.top as { value?: unknown; percent?: unknown } | null | undefined;
    if (top == null) return null;
    if (top.percent) return { form: 'percent' };
    const v = numericValue(top.value);
    return Number.isFinite(v) ? { form: 'numeric', value: v, offset: null } : { form: 'opaque' };
}

function readLimit(root: Record<string, unknown>): RowCapInfo | null {
    const limit = root.limit as { value?: { value: unknown }[]; seperator?: string } | null | undefined;
    if (limit == null || !Array.isArray(limit.value) || limit.value.length === 0) return null;
    const v = numericValue(limit.value[0].value);
    if (!Number.isFinite(v)) return { form: 'opaque' };
    const o = limit.value.length > 1 ? numericValue(limit.value[1].value) : NaN;
    return { form: 'numeric', value: v, offset: Number.isFinite(o) ? o : null };
}

/** The outermost row cap on an AST root, or null when none. */
export function ReadRowCap(root: Record<string, unknown>, field: RowCapField): RowCapInfo | null {
    return field === 'top' ? readTop(root) : readLimit(root);
}

/** Writes a numeric row cap onto an AST root, keeping any OFFSET. */
export function WriteRowCap(root: Record<string, unknown>, field: RowCapField, cap: number): void {
    if (field === 'top') {
        root.top = { value: cap, percent: null };
        return;
    }
    const existing = root.limit as { value?: { value: unknown }[] } | null | undefined;
    const offsetNode = existing?.value && existing.value.length > 1 ? existing.value[1] : null;
    root.limit = offsetNode
        ? { seperator: 'offset', value: [{ type: 'number', value: cap }, offsetNode] }
        : { seperator: '', value: [{ type: 'number', value: cap }] };
}

/** Removes the row cap from an AST root. */
export function ClearRowCap(root: Record<string, unknown>, field: RowCapField): void {
    root[field] = null;
}
