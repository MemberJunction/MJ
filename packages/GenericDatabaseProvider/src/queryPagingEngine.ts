import { DatabasePlatform } from '@memberjunction/core';
import { AnalyzeTopLevelOrderBy, AnalyzePagingShape, IsReadOnlyQuery } from '@memberjunction/sql-parser';
import type { OwnRowCap, PagingShape } from '@memberjunction/sql-parser';
import { GetDialect, SQLServerDialect, type SQLDialect } from '@memberjunction/sql-dialect';

/**
 * Result of wrapping SQL with paging directives.
 */
export interface PagingWrappedSQL {
    /** SQL that returns the paged data rows */
    DataSQL: string;
    /** SQL that returns the total row count (without paging) */
    CountSQL: string;
    /** The computed offset (same as startRow input) */
    Offset: number;
    /** The page size (same as maxRows input) */
    PageSize: number;
}

/**
 * How a requested row cap was applied.
 *
 * - `top` / `limit` / `fetch`: a `TOP n`, `LIMIT n`, or `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY`
 *   clause in the statement itself.
 * - `own-cap`: the statement's own cap was already as tight or tighter, so it was left as is.
 * - `derived-table`: the statement was capped as a derived table.
 * - `none`: no cap was applied; {@link RowCapOutcome.Reason} says why.
 */
export type RowCapMethod = 'top' | 'limit' | 'fetch' | 'own-cap' | 'derived-table' | 'none';

/** Whether a requested row cap holds for the rendered SQL, and how. */
export interface RowCapOutcome {
    /** True when the rendered SQL returns at most the requested number of rows. */
    Applied: boolean;
    Method: RowCapMethod;
    /** Why no cap was applied; `null` when one was. */
    Reason: string | null;
}

/** The capped SQL and the outcome, from {@link QueryPagingEngine.ApplyMaxRows}. */
export interface RowCapResult {
    SQL: string;
    Outcome: RowCapOutcome;
}

function capped(sql: string, method: Exclude<RowCapMethod, 'none'>): RowCapResult {
    return { SQL: sql, Outcome: { Applied: true, Method: method, Reason: null } };
}

function notCapped(sql: string, reason: string): RowCapResult {
    return { SQL: sql, Outcome: { Applied: false, Method: 'none', Reason: reason } };
}

/**
 * Handles server-side pagination for query SQL by applying platform-specific
 * paging clauses.
 *
 * The statement is read from tokens ({@link AnalyzePagingShape}), so paging works the same way
 * on SQL the AST parser cannot read, and the query's own text is kept as written: nothing is
 * re-emitted from a syntax tree.
 *
 * **The query's own row cap is part of what it means.** `StartRow` and `MaxRows` page within the
 * capped result, so the smaller of the query's cap and `MaxRows` wins, and the total row count is
 * the size of the capped result. A numeric cap (`TOP n`, `LIMIT n [OFFSET k]`, `OFFSET k … FETCH
 * NEXT n`) is replaced by the page's own clause with the arithmetic folded in; a page past the
 * cap is an empty result. Any other cap (`TOP … PERCENT`, `WITH TIES`, an expression) is kept, and
 * the query is paged as a derived table.
 *
 * **Data SQL** — appends OFFSET/FETCH (SQL Server) or LIMIT/OFFSET (PostgreSQL) to the
 * statement, after its ORDER BY (a default one is added when it has none) and before any clause
 * that must stay last (`OPTION (…)`, `FOR UPDATE`). Column scopes, ORDER BY references and table
 * aliases stay valid because the query is not wrapped.
 *
 * **Count SQL** — puts the query (without its ORDER BY, unless its own cap needs it) in a
 * `[__count]` CTE beside the query's own CTEs and selects `COUNT(*) AS TotalRowCount`.
 *
 * A query that ends in `FOR JSON` / `FOR XML` returns a document, not rows, and cannot be paged;
 * asking to page one is an error.
 */
export class QueryPagingEngine {

    /**
     * Produces paged DataSQL and CountSQL from resolved query SQL.
     *
     * @param resolvedSQL  The fully-resolved SQL (after composition + Nunjucks)
     * @param startRow     0-based row offset
     * @param maxRows      Maximum rows to return (page size)
     * @param platform     Target database platform
     * @returns DataSQL for paged results and CountSQL for total row count
     */
    static WrapWithPaging(
        resolvedSQL: string,
        startRow: number,
        maxRows: number,
        platform: DatabasePlatform,
    ): PagingWrappedSQL {
        const cleanedSQL = QueryPagingEngine.stripTrailingSemicolons(resolvedSQL);
        const dialect = QueryPagingEngine.getDialect(platform);
        const shape = AnalyzePagingShape(cleanedSQL, dialect);
        if (shape.ReturnsDocument) {
            throw new Error(
                `QueryPagingEngine: this query ends in FOR ${shape.ReturnsDocument.toUpperCase()}, so it returns a document ` +
                'rather than rows and cannot be paged. Run it without StartRow / MaxRows.'
            );
        }

        const dataSQL = QueryPagingEngine.buildDataSQL(shape, startRow, maxRows, dialect);
        const countSQL = QueryPagingEngine.buildCountSQL(shape, dialect);

        return { DataSQL: dataSQL, CountSQL: countSQL, Offset: startRow, PageSize: maxRows };
    }

    /**
     * Applies a row cap to the outermost SELECT: the result returns at most `maxRows` rows.
     *
     * The statement is edited in place, from tokens, so the caller's SQL is kept exactly as
     * written apart from the cap, and SQL the AST parser cannot read is capped the same way:
     *   - No cap of its own: `TOP n` goes after `SELECT [ALL | DISTINCT]` on SQL Server, and
     *     `LIMIT n` at the end on PostgreSQL. A SQL Server set operation (which has no single
     *     SELECT to put TOP on) gets `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` after its ORDER BY.
     *   - A numeric cap of its own: the tighter of the two wins.
     *   - Any other cap of its own (`TOP … PERCENT`, `WITH TIES`, an expression, caps on more than
     *     one branch): the statement is capped as a derived table.
     * Clauses that must stay last (`OPTION (…)`, `FOR UPDATE`) stay last.
     *
     * A statement that ends in `FOR JSON` / `FOR XML` returns one document built from its rows;
     * it is capped in place (bounding the rows the document is built from) and left unchanged
     * where only a derived table or a set-operation clause could cap it. Anything that is not a
     * single read query (a write, `SELECT … INTO`) is left unchanged; the render pipeline refuses
     * those before this point anyway.
     *
     * Non-positive, non-finite, or fractional `maxRows` are sanitized (`<= 0` and non-finite are
     * no-ops; fractional values are floored).
     */
    static WrapWithMaxRows(
        resolvedSQL: string,
        maxRows: number,
        platform: DatabasePlatform,
    ): string {
        return QueryPagingEngine.ApplyMaxRows(resolvedSQL, maxRows, platform).SQL;
    }

    /**
     * Applies a row cap exactly as {@link WrapWithMaxRows} does, and also reports whether the cap
     * holds and how, so a caller that asked for a cap can tell whether it got one.
     */
    static ApplyMaxRows(resolvedSQL: string, maxRows: number, platform: DatabasePlatform): RowCapResult {
        const cleanedSQL = QueryPagingEngine.stripTrailingSemicolons(resolvedSQL);
        if (!Number.isFinite(maxRows) || maxRows <= 0) return notCapped(cleanedSQL, 'MaxRows is not a positive number');
        if (cleanedSQL.trim().length === 0) return notCapped(cleanedSQL, 'the statement is empty');
        const cap = Math.floor(maxRows);
        const dialect = QueryPagingEngine.getDialect(platform);
        const readCheck = IsReadOnlyQuery(cleanedSQL, dialect);
        if (!readCheck.IsReadOnly) return notCapped(cleanedSQL, `the statement is not a single read query: ${readCheck.Reason}`);

        const shape = AnalyzePagingShape(cleanedSQL, dialect);
        const caps = shape.OwnCaps;
        if (caps.length === 0) return QueryPagingEngine.addCap(shape, cap, dialect);
        if (caps.length === 1 && caps[0].Numeric) return QueryPagingEngine.tightenCap(shape, caps[0], cap, dialect);
        return QueryPagingEngine.capAsDerivedTable(shape, cap, dialect);
    }

    /** Caps a statement that has no cap of its own. */
    private static addCap(shape: PagingShape, cap: number, dialect: SQLDialect): RowCapResult {
        const limit = dialect.LimitClause(cap);
        if (limit.prefix) {
            if (shape.IsSetOperation && shape.ReturnsDocument) {
                return notCapped(shape.Statement, `a set operation that ends in FOR ${shape.ReturnsDocument.toUpperCase()} returns one document and has no single SELECT to cap`);
            }
            if (shape.IsSetOperation) return capped(QueryPagingEngine.appendPage(shape, QueryPagingEngine.head(shape), 0, cap, dialect), 'fetch');
            if (shape.SelectListStart === null) return QueryPagingEngine.capAsDerivedTable(shape, cap, dialect);
            const at = shape.SelectListStart;
            return capped(`${shape.Statement.substring(0, at)} ${limit.prefix}${shape.Statement.substring(at)}`, 'top');
        }
        return capped(`${QueryPagingEngine.head(shape)}\n${limit.suffix}${QueryPagingEngine.tail(shape)}`, 'limit');
    }

    /** Lowers a numeric cap of the query's own to `cap`, or leaves it when it is already tighter. */
    private static tightenCap(shape: PagingShape, own: OwnRowCap, cap: number, dialect: SQLDialect): RowCapResult {
        if (own.Rows !== null && own.Rows <= cap) return capped(shape.Statement, 'own-cap');
        const statement = shape.Statement;
        if (own.Form === 'top') {
            return capped(`${statement.substring(0, own.Start)}${dialect.LimitClause(cap).prefix}${statement.substring(own.End)}`, 'top');
        }
        const limit = dialect.LimitClause(cap, own.Skip);
        return capped(`${statement.substring(0, own.Start)}${limit.suffix}${QueryPagingEngine.tail(shape)}`, QueryPagingEngine.suffixMethod(limit.suffix));
    }

    /** How a row-limit suffix from the dialect's `LimitClause` caps rows: `FETCH` or `LIMIT`. */
    private static suffixMethod(suffix: string): 'fetch' | 'limit' {
        return /\bFETCH\b/i.test(suffix) ? 'fetch' : 'limit';
    }

    /**
     * Caps the statement as a derived table, for shapes that cannot be capped in place. The
     * query's CTEs stay in front and its trailing clause stays last. Its ORDER BY stays inside,
     * where SQL Server allows it beside the query's own TOP; a set operation's ORDER BY, which
     * names output columns, moves outside.
     */
    private static capAsDerivedTable(shape: PagingShape, cap: number, dialect: SQLDialect): RowCapResult {
        const statement = shape.Statement;
        if (shape.ReturnsDocument) {
            return notCapped(statement, `the statement ends in FOR ${shape.ReturnsDocument.toUpperCase()}, which cannot appear inside a derived table`);
        }
        const prefix = statement.substring(0, shape.MainStart);
        const moveOrderBy = shape.IsSetOperation && shape.OrderBy !== null;
        const inner = statement.substring(shape.MainStart, moveOrderBy ? shape.OrderBy!.Start : shape.TailStart).trim();
        const orderBy = moveOrderBy ? `\n${statement.substring(shape.OrderBy!.Start, shape.OrderBy!.End).trim()}` : '';
        const limit = dialect.LimitClause(cap);
        const top = limit.prefix ? `${limit.prefix} ` : '';
        const suffix = limit.suffix ? `\n${limit.suffix}` : '';
        const sql = `${prefix}SELECT ${top}* FROM (\n${inner}\n) AS ${dialect.QuoteIdentifier('_mj_capped')}${orderBy}${suffix}${QueryPagingEngine.tail(shape)}`;
        return capped(sql, 'derived-table');
    }

    /**
     * Determines whether the given params indicate paging should be applied.
     *
     * A `MaxRows` on its own is enough — a caller asking only to cap a result, rather than
     * to walk pages, still gets the ceiling applied in SQL. Without that, such a call falls
     * through to the provider's full-fetch-then-slice path, where the database returns every
     * row and the whole set crosses the network before being trimmed.
     *
     * Matches how RunView decides the same question (`BuildTotalRowCountSQL` treats rows as
     * limited when `usingPagination || maxRowsForQuery > 0`).
     *
     * An absent `StartRow` means page zero; see {@link ResolveStartRow}. A negative one is
     * rejected.
     */
    static ShouldPage(startRow: number | undefined, maxRows: number | undefined): boolean {
        return maxRows != null && maxRows > 0 && (startRow == null || startRow >= 0);
    }

    /**
     * The offset to page from: the caller's `StartRow`, or 0 when they named none.
     *
     * Kept beside {@link ShouldPage} so the two cannot drift — every site acting on a true
     * `ShouldPage` needs a concrete offset, and `StartRow` is not guaranteed to be set.
     */
    static ResolveStartRow(startRow: number | undefined): number {
        return startRow != null && startRow >= 0 ? startRow : 0;
    }

    // ════════════════════════════════════════════════════════════════════
    // Data SQL
    // ════════════════════════════════════════════════════════════════════

    /** Removes trailing semicolons and whitespace; a statement-ending `;` cannot precede a paging clause. */
    private static stripTrailingSemicolons(sql: string): string {
        // A loop from the end rather than a `[\s;]+$` regex, which backtracks on long whitespace runs.
        let end = sql.length;
        while (end > 0 && (sql[end - 1] === ';' || /\s/.test(sql[end - 1]))) end--;
        return sql.substring(0, end);
    }

    /**
     * Builds the SQL for one page. A query without a cap of its own gets the paging clause
     * appended; a single numeric cap is replaced by the page's clause with the arithmetic folded
     * in; anything else is paged as a derived table.
     */
    private static buildDataSQL(shape: PagingShape, startRow: number, maxRows: number, dialect: SQLDialect): string {
        const caps = shape.OwnCaps;
        if (caps.length === 0) {
            return QueryPagingEngine.appendPage(shape, QueryPagingEngine.head(shape), startRow, maxRows, dialect);
        }
        if (caps.length === 1 && caps[0].Numeric) {
            return QueryPagingEngine.pageWithinCap(shape, caps[0], startRow, maxRows, dialect);
        }
        return QueryPagingEngine.wrapAndPage(shape, startRow, maxRows, dialect);
    }

    /** The statement up to the clause that must stay last. */
    private static head(shape: PagingShape): string {
        return shape.Statement.substring(0, shape.TailStart).trimEnd();
    }

    /** The clause that must stay last (`OPTION (…)`, `FOR UPDATE`), with its leading newline, or ''. */
    private static tail(shape: PagingShape): string {
        const tail = shape.Statement.substring(shape.TailStart).trim();
        return tail ? `\n${tail}` : '';
    }

    /** Appends ORDER BY (when the statement has none), the paging clause and the trailing clause. */
    private static appendPage(shape: PagingShape, head: string, offset: number, rows: number, dialect: SQLDialect): string {
        const orderBy = shape.OrderBy ? '' : `\nORDER BY ${QueryPagingEngine.defaultOrderBy(shape, dialect)}`;
        const limit = dialect.LimitClause(rows, offset);
        return `${head}${orderBy}\n${limit.suffix}${QueryPagingEngine.tail(shape)}`;
    }

    /**
     * The ORDER BY to page by when the statement has none: the dialect's
     * {@link SQLDialect.SelectListPagingOrderBy} for a set operation or SELECT DISTINCT when it
     * has one (a platform that only accepts select-list items there), otherwise its
     * {@link SQLDialect.DefaultPagingOrderBy}.
     */
    private static defaultOrderBy(shape: PagingShape, dialect: SQLDialect): string {
        const selectListOrderBy = dialect.SelectListPagingOrderBy;
        if (selectListOrderBy !== null && (shape.IsSetOperation || shape.IsDistinct)) return selectListOrderBy;
        return dialect.DefaultPagingOrderBy;
    }

    /**
     * Pages within a numeric cap of the query's own: the page starts `startRow` rows into the
     * capped result and stops at the cap. A page that starts at or past the cap is empty.
     */
    private static pageWithinCap(shape: PagingShape, cap: OwnRowCap, startRow: number, maxRows: number, dialect: SQLDialect): string {
        const remaining = cap.Rows === null ? maxRows : cap.Rows - startRow;
        const rows = Math.min(maxRows, remaining);
        if (rows <= 0) return QueryPagingEngine.emptyResultSQL(dialect);
        const statement = shape.Statement;
        const capEnd = cap.Form === 'top' ? cap.End : shape.TailStart;
        const head = (statement.substring(0, cap.Start) + statement.substring(capEnd, shape.TailStart)).trimEnd();
        return QueryPagingEngine.appendPage(shape, head, cap.Skip + startRow, rows, dialect);
    }

    /**
     * Pages a query whose own cap cannot be reasoned about as a row count (`TOP … PERCENT`, `WITH
     * TIES`, an expression, or a cap on more than one branch of a set operation) by selecting the
     * page from it as a derived table. Its CTEs stay in front, its trailing clause stays last, and
     * the ORDER BY of a set operation moves outside, where it is legal.
     */
    private static wrapAndPage(shape: PagingShape, startRow: number, maxRows: number, dialect: SQLDialect): string {
        const statement = shape.Statement;
        const prefix = statement.substring(0, shape.MainStart);
        const moveOrderBy = shape.IsSetOperation && shape.OrderBy !== null;
        const innerEnd = moveOrderBy ? shape.OrderBy!.Start : shape.TailStart;
        const inner = statement.substring(shape.MainStart, innerEnd).trim();
        const orderBy = moveOrderBy
            ? statement.substring(shape.OrderBy!.Start, shape.OrderBy!.End).trim()
            : dialect.PagingRequiresOrderBy ? `ORDER BY ${dialect.DefaultPagingOrderBy}` : '';
        const limit = dialect.LimitClause(maxRows, startRow);
        const page = `SELECT * FROM (\n${inner}\n) AS ${dialect.QuoteIdentifier('__mj_page')}${orderBy ? `\n${orderBy}` : ''}\n${limit.suffix}`;
        return `${prefix}${page}${QueryPagingEngine.tail(shape)}`;
    }

    /** A statement that returns no rows, for a page that starts past the query's own cap. */
    private static emptyResultSQL(dialect: SQLDialect): string {
        return `SELECT NULL AS ${dialect.QuoteIdentifier('__mj_empty')} WHERE 1 = 0`;
    }

    // ════════════════════════════════════════════════════════════════════
    // Count SQL
    // ════════════════════════════════════════════════════════════════════

    /**
     * Builds the count query: the main statement in a `[__count]` CTE placed after the query's
     * own CTEs (a CTE body cannot contain its own WITH), and `SELECT COUNT(*) AS TotalRowCount`.
     * The ORDER BY is removed — it does not change a count, and SQL Server forbids it in a CTE —
     * unless the query's own cap needs it to choose its rows. A trailing `OPTION (…)` stays last.
     */
    private static buildCountSQL(shape: PagingShape, dialect: SQLDialect): string {
        const countCTEName = dialect.QuoteIdentifier('__count');
        const body = QueryPagingEngine.countBody(shape);
        const ownCTEs = shape.CTEs ? shape.CTEs.Definitions.map(d => d.Text) : [];
        const recursive = shape.CTEs?.Recursive ? 'RECURSIVE ' : '';
        const allCTEs = [...ownCTEs, `${countCTEName} AS (\n${body}\n)`];
        const hint = /^OPTION\b/i.test(shape.Statement.substring(shape.TailStart).trim()) ? QueryPagingEngine.tail(shape) : '';
        return `WITH ${recursive}${allCTEs.join(',\n')}\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}${hint}`;
    }

    /**
     * The main statement as the count query sees it. With a cap of its own the statement is kept
     * whole (its ORDER BY picks the capped rows, and is legal in a CTE beside TOP or OFFSET),
     * except that a set operation's trailing ORDER BY is dropped; otherwise the ORDER BY is cut.
     */
    private static countBody(shape: PagingShape): string {
        const statement = shape.Statement;
        const capped = shape.OwnCaps.length > 0;
        const keepsOrderBy = capped && !(shape.IsSetOperation && shape.OwnCaps.every(c => c.Form === 'top'));
        const end = shape.OrderBy && !keepsOrderBy ? shape.OrderBy.Start : shape.TailStart;
        const body = statement.substring(shape.MainStart, end).trim();
        if (shape.OrderBy && !keepsOrderBy && shape.OrderBy.End < shape.TailStart) {
            // The query's own LIMIT / OFFSET clause follows the ORDER BY being cut; keep it.
            return `${body} ${statement.substring(shape.OrderBy.End, shape.TailStart).trim()}`.trim();
        }
        return body;
    }

    // ════════════════════════════════════════════════════════════════════
    // SQL analysis helpers — delegate to shared orderByAnalyzer
    // ════════════════════════════════════════════════════════════════════

    /**
     * Extracts the top-level ORDER BY clause from SQL, ignoring ORDER BY
     * inside subqueries, block comments, line comments, single-quoted strings,
     * and bracket/double-quoted identifiers.
     *
     * Preserves the public static API for existing callers and tests.
     */
    static extractOrderBy(
        sql: string,
        dialect: SQLDialect | string = new SQLServerDialect()
    ): { sqlWithoutOrder: string; orderByClause: string | null } {
        const resolvedDialect = typeof dialect === 'string'
            ? QueryPagingEngine.getDialect(dialect as DatabasePlatform)
            : dialect;
        const analysis = AnalyzeTopLevelOrderBy(sql, resolvedDialect);
        return {
            sqlWithoutOrder: analysis.SqlWithoutOrderBy,
            orderByClause: analysis.OrderByClause,
        };
    }


    /**
     * Strips a TOP N or TOP (N) clause from the beginning of a SELECT statement.
     */
    static stripTopClause(sql: string): { sql: string; topRemoved: boolean } {
        const topRegex = /^(SELECT\s+(?:DISTINCT\s+)?)TOP\s+(?:\(\s*\d+\s*\)|\d+)\s+/i;
        const match = sql.match(topRegex);
        if (!match) return { sql, topRemoved: false };
        return { sql: match[1] + sql.substring(match[0].length), topRemoved: true };
    }


    // ════════════════════════════════════════════════════════════════════
    // Dialect resolution
    // ════════════════════════════════════════════════════════════════════

    private static getDialect(platform: DatabasePlatform): SQLDialect {
        return GetDialect(platform);
    }
}
