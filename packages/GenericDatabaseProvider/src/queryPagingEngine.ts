import { DatabasePlatform } from '@memberjunction/core';
import { SQLParser, AnalyzeTopLevelOrderBy, AnalyzePagingShape } from '@memberjunction/sql-parser';
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
     * Applies a row cap to the outermost SELECT.
     *
     * `maxRows` is treated as a hard ceiling: the result is guaranteed to
     * return at most `maxRows` rows whenever the SQL shape can be capped
     * without corrupting the query.
     *
     * Strategy:
     *   1. Parse via AST. If the outermost SELECT has no existing cap,
     *      inject `TOP N` (SQL Server) or `LIMIT N` (PostgreSQL).
     *   2. If an existing numeric `TOP`/`LIMIT` is present, reduce it to
     *      `min(existing, maxRows)`. The tighter cap wins.
     *   3. If the AST recognizes the shape but can't inject (`TOP PERCENT`,
     *      non-numeric `TOP`, `UNION`, `WITH TIES`, etc.), wrap with an
     *      outer `SELECT TOP N * FROM (…) AS _mj_capped` (or LIMIT on PG).
     *   4. If the parser can't handle the input but the SQL is CTE-headed,
     *      append `OFFSET 0 ROWS FETCH NEXT N ROWS ONLY` via {@link buildDataSQL}.
     *   5. Shapes that can't legally appear inside a derived table
     *      (`FOR JSON`, `FOR XML`, `OPTION (...)`, `SELECT INTO`,
     *      mutations) are returned unchanged — the cap is moot
     *      (FOR JSON/XML return one row) or the validator should have
     *      rejected them earlier (mutations, SELECT INTO).
     *
     * Non-positive, non-finite, or fractional `maxRows` are sanitized
     * (`<= 0` and non-finite are no-ops; fractional values are floored).
     */
    static WrapWithMaxRows(
        resolvedSQL: string,
        maxRows: number,
        platform: DatabasePlatform,
    ): string {
        const cleanedSQL = resolvedSQL.trimEnd().replace(/;\s*$/, '');

        if (!Number.isFinite(maxRows) || maxRows <= 0) return cleanedSQL;
        if (cleanedSQL.trim().length === 0) return cleanedSQL;
        const cap = Math.floor(maxRows);

        const dialect = QueryPagingEngine.getDialect(platform);

        const astResult = QueryPagingEngine.applyMaxRowsViaAST(cleanedSQL, cap, dialect);
        if (astResult.outcome === 'capped') return astResult.sql;
        if (astResult.outcome === 'pass-through') return cleanedSQL;

        // Both `wrap` and `unparseable` outcomes may try the outer-wrap path.
        // First, check for clauses that cannot legally appear inside a derived
        // table — wrapping such queries would produce invalid SQL.
        const unwrappable = SQLParser.HasUnwrappableTrailingClause(cleanedSQL, dialect);

        if (astResult.outcome === 'wrap') {
            if (unwrappable) return cleanedSQL;
            return QueryPagingEngine.outerWrap(cleanedSQL, cap, dialect);
        }

        // unparseable — try the CTE-fallback path first.
        const isCTE = SQLParser.ExtractCTEs(cleanedSQL, dialect) !== null;
        if (isCTE) {
            try {
                return QueryPagingEngine.buildDataSQL(AnalyzePagingShape(cleanedSQL, dialect), 0, cap, dialect);
            } catch {
                return cleanedSQL;
            }
        }

        if (unwrappable) return cleanedSQL;

        return QueryPagingEngine.outerWrap(cleanedSQL, cap, dialect);
    }

    /**
     * Wraps `sql` in an outer SELECT that enforces the row cap.
     * Used when the AST recognises the shape but cannot inject the cap
     * cleanly, or when the AST can't parse the input but the SQL is known
     * to be wrap-safe (no FOR JSON/FOR XML/OPTION at top level).
     *
     * Strips any top-level ORDER BY before wrapping: ORDER BY is illegal
     * inside a derived table on SQL Server (unless TOP/OFFSET/FOR XML is
     * present), and the outer SELECT doesn't preserve inner ordering anyway.
     * The ORDER BY is moved to the outer SELECT so the final result retains
     * the intended sort order.
     */
    private static outerWrap(sql: string, cap: number, dialect: SQLDialect): string {
        // Route the cap form through the dialect's LimitClause so there is a
        // single source of truth for "TOP vs LIMIT" — no PlatformKey probe here.
        const lc = dialect.LimitClause(cap);
        const prefix = lc.prefix ? `${lc.prefix} ` : '';   // 'TOP N ' (SQL Server) or ''
        const suffix = lc.suffix ? ` ${lc.suffix}` : '';   // ' LIMIT N' (PostgreSQL) or ''

        // Strip top-level ORDER BY from the inner SQL to avoid SQL Server error:
        // "The ORDER BY clause is invalid in views, inline functions, derived tables,
        //  subqueries, and common table expressions, unless TOP, OFFSET or FOR XML
        //  is also specified."
        // Uses the lexer-based Tier 2 scanner which handles unparseable SQL
        // (TRY_CAST, IIF, STRING_AGG, etc.) that the AST path cannot parse.
        const orderByAnalysis = AnalyzeTopLevelOrderBy(sql, dialect);
        const innerSQL = orderByAnalysis.OrderByClause && !orderByAnalysis.IsLegalInCTE
            ? orderByAnalysis.SqlWithoutOrderBy
            : sql;

        const outerOrderBy = orderByAnalysis.OrderByClause && !orderByAnalysis.IsLegalInCTE
            ? `\nORDER BY ${orderByAnalysis.OrderByClause}`
            : '';

        return `SELECT ${prefix}* FROM (\n${innerSQL}\n) AS _mj_capped${suffix}${outerOrderBy}`;
    }

    /**
     * AST-based row-cap injection.
     *   `capped`       — `sql` contains the input with TOP/LIMIT injected
     *                    or reduced to `min(existing, cap)`.
     *   `wrap`         — AST recognized the shape but the cap can't be
     *                    safely injected inline (`TOP PERCENT`, non-numeric
     *                    `TOP`/`LIMIT`); caller should outer-wrap.
     *   `pass-through` — shape can't be capped at all without corrupting
     *                    the query (SELECT INTO, mutation).
     *   `unparseable`  — parser could not handle the input; caller may
     *                    attempt a CTE-fallback or outer wrap.
     *
     * All AST shape inspection is delegated to {@link SQLParser} primitives —
     * this method contains no `node-sql-parser` field knowledge.
     */
    private static applyMaxRowsViaAST(
        sql: string,
        cap: number,
        dialect: SQLDialect,
    ):
        | { outcome: 'capped'; sql: string }
        | { outcome: 'wrap' }
        | { outcome: 'pass-through' }
        | { outcome: 'unparseable' }
    {
        // The instance parser applies preprocessing fallbacks on a direct-parse
        // failure (bracket-identifier aliasing for Skip-style CTE names, trailing
        // OPTION splitting); ToSQL restores them. This widens the set of shapes
        // that reach the precise AST-inject path instead of the outer-wrap path.
        const parsed = new SQLParser(sql, dialect);
        if (!parsed.IsValid) return { outcome: 'unparseable' };

        const kind = parsed.StatementKind;
        if (kind === 'mutation' || kind === 'select-into') return { outcome: 'pass-through' };
        if (kind === 'set-op') return { outcome: 'unparseable' };
        if (kind !== 'select') return { outcome: 'pass-through' };

        const existing = parsed.OuterCap;

        // PERCENT and non-numeric (opaque) caps can't be reasoned about as row
        // counts; let the caller outer-wrap them.
        if (existing && existing.form !== 'numeric') return { outcome: 'wrap' };

        // Existing numeric cap — only modify when the requested cap is tighter.
        if (existing && existing.value <= cap) return { outcome: 'capped', sql };

        // No cap at all, on a dialect that caps with a trailing clause — append it as TEXT.
        //
        // `SetOuterCap` + `ToSQL()` below re-emits the WHOLE statement from the AST, and
        // node-sql-parser normalizes as it generates: keywords come back upper-cased and
        // identifiers re-quoted. Appending one clause should not rewrite the caller's SQL, and
        // on PostgreSQL that rewrite is not cosmetic — it is a correctness bug, because the
        // provider's identifier auto-quoter runs afterwards over an upper-cased statement and
        // quotes any keyword its allowlist is missing. A query written `ORDER BY x ASC nulls
        // last` came back `ASC NULLS LAST`, was quoted to `ASC "NULLS" "LAST"`, and failed with
        // `syntax error at or near ""NULLS""` — SQL the caller never wrote.
        //
        // The append is only taken where it is provably equivalent to the AST injection; every
        // other shape falls through to the existing path, so this can narrow the blast radius
        // but never change a result.
        if (!existing) {
            const appended = QueryPagingEngine.appendTrailingCap(sql, cap, dialect);
            if (appended) return { outcome: 'capped', sql: appended };
        }

        // No cap (or a looser one) — inject/replace.
        parsed.SetOuterCap(cap);
        try {
            return { outcome: 'capped', sql: parsed.ToSQL() };
        } catch {
            return { outcome: 'unparseable' };
        }
    }

    /**
     * Clauses that must come AFTER `LIMIT` in PostgreSQL, so a bare append would be illegal.
     *
     * Matched loosely and deliberately: a false positive (the word inside a string literal, a
     * column alias, or a nested subquery) costs only a fall-through to the AST path, which is
     * the behaviour that shipped before. A false negative would emit invalid SQL, so the test
     * errs heavily toward abstaining.
     */
    private static readonly CLAUSES_THAT_FOLLOW_LIMIT =
        /\b(?:OFFSET|FETCH|FOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE))\b/i;

    /**
     * Returns `sql` with the row cap appended as a trailing clause, or `null` when that is not
     * provably safe and the caller should fall back to AST injection.
     *
     * Applies only to dialects whose cap is a suffix (`LIMIT N`). SQL Server caps with a `TOP N`
     * prefix that has to go between `SELECT` and the select list — a position no append can
     * reach — so it is left to the AST path, where the round-trip is harmless anyway because
     * T-SQL is not case-sensitive about the identifiers involved.
     */
    private static appendTrailingCap(sql: string, cap: number, dialect: SQLDialect): string | null {
        const limit = dialect.LimitClause(cap);
        if (!limit.suffix || limit.prefix) return null;
        if (QueryPagingEngine.CLAUSES_THAT_FOLLOW_LIMIT.test(sql)) return null;
        return `${sql}\n${limit.suffix}`;
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
        return sql.replace(/[\s;]+$/, '');
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
     * The ORDER BY to page by when the statement has none. SQL Server needs one for OFFSET and
     * allows only select-list items with UNION / INTERSECT / EXCEPT and with SELECT DISTINCT, so
     * those shapes are ordered by their first column; anything else uses the dialect's default.
     */
    private static defaultOrderBy(shape: PagingShape, dialect: SQLDialect): string {
        if (dialect.PlatformKey === 'sqlserver' && (shape.IsSetOperation || shape.IsDistinct)) return '1';
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
            : dialect.PlatformKey === 'sqlserver' ? `ORDER BY ${dialect.DefaultPagingOrderBy}` : '';
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
    static ExtractOrderBy(
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

    /** @deprecated Use {@link ExtractOrderBy}. */
    static extractOrderBy(
        sql: string,
        dialect: SQLDialect | string = new SQLServerDialect()
    ): { sqlWithoutOrder: string; orderByClause: string | null } {
        return this.ExtractOrderBy(sql, dialect);
    }

    /**
     * Strips a TOP N or TOP (N) clause from the beginning of a SELECT statement.
     */
    static StripTopClause(sql: string): { sql: string; topRemoved: boolean } {
        const topRegex = /^(SELECT\s+(?:DISTINCT\s+)?)TOP\s+(?:\(\s*\d+\s*\)|\d+)\s+/i;
        const match = sql.match(topRegex);
        if (!match) return { sql, topRemoved: false };
        return { sql: match[1] + sql.substring(match[0].length), topRemoved: true };
    }

    /** @deprecated Use {@link StripTopClause}. */
    static stripTopClause(sql: string): { sql: string; topRemoved: boolean } {
        return this.StripTopClause(sql);
    }

    // ════════════════════════════════════════════════════════════════════
    // Dialect resolution
    // ════════════════════════════════════════════════════════════════════

    private static getDialect(platform: DatabasePlatform): SQLDialect {
        return GetDialect(platform);
    }
}
