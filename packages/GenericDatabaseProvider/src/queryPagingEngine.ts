import { DatabasePlatform } from '@memberjunction/core';
import { SQLParser, AnalyzeTopLevelOrderBy } from '@memberjunction/sql-parser';
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
 * **Data SQL** — appends OFFSET/FETCH (SQL Server) or LIMIT/OFFSET (PostgreSQL)
 * directly to the original SQL. The query is not wrapped in a CTE, so all column
 * scopes, ORDER BY references, and table aliases remain valid. TOP is stripped on
 * SQL Server since it conflicts with OFFSET.
 *
 * **Count SQL** — wraps the original SQL (minus ORDER BY) in a CTE and produces
 * `SELECT COUNT(*) AS TotalRowCount FROM [__count]`. ORDER BY is irrelevant for
 * counting and must be removed since SQL Server forbids it in CTEs without TOP.
 *
 * This approach eliminates the need for ORDER BY remapping (mapping column
 * references from the inner query scope to the outer CTE scope), which was the
 * primary source of paging bugs.
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
        const cleanedSQL = resolvedSQL.trimEnd().replace(/;\s*$/, '');
        const dialect = QueryPagingEngine.getDialect(platform);

        const dataSQL = QueryPagingEngine.buildDataSQL(cleanedSQL, startRow, maxRows, dialect);
        const countSQL = QueryPagingEngine.buildCountSQL(cleanedSQL, dialect);

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
                return QueryPagingEngine.buildDataSQL(cleanedSQL, 0, cap, dialect);
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
     */
    private static outerWrap(sql: string, cap: number, dialect: SQLDialect): string {
        // Route the cap form through the dialect's LimitClause so there is a
        // single source of truth for "TOP vs LIMIT" — no PlatformKey probe here.
        const lc = dialect.LimitClause(cap);
        const prefix = lc.prefix ? `${lc.prefix} ` : '';   // 'TOP N ' (SQL Server) or ''
        const suffix = lc.suffix ? ` ${lc.suffix}` : '';   // ' LIMIT N' (PostgreSQL) or ''
        return `SELECT ${prefix}* FROM (\n${sql}\n) AS _mj_capped${suffix}`;
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

        // No cap (or a looser one) — inject/replace.
        parsed.SetOuterCap(cap);
        try {
            return { outcome: 'capped', sql: parsed.ToSQL() };
        } catch {
            return { outcome: 'unparseable' };
        }
    }

    /**
     * Determines whether the given params indicate paging should be applied.
     */
    static ShouldPage(startRow: number | undefined, maxRows: number | undefined): boolean {
        return maxRows != null && maxRows > 0 && startRow != null && startRow >= 0;
    }

    // ════════════════════════════════════════════════════════════════════
    // Data SQL — append paging clause directly to original SQL
    // ════════════════════════════════════════════════════════════════════

    private static buildDataSQL(
        sql: string,
        startRow: number,
        maxRows: number,
        dialect: SQLDialect,
    ): string {
        let dataSQL = sql;

        // Strip TOP clause on SQL Server — it conflicts with OFFSET/FETCH.
        if (dialect.PlatformKey === 'sqlserver') {
            dataSQL = QueryPagingEngine.stripTopFromMainSelect(dataSQL, dialect);
        }

        // Ensure there's an ORDER BY — required for OFFSET/FETCH on SQL Server,
        // and strongly recommended for deterministic LIMIT/OFFSET on PostgreSQL.
        const hasOrderBy = AnalyzeTopLevelOrderBy(dataSQL, dialect).Positions.length > 0;
        if (!hasOrderBy) {
            dataSQL = `${dataSQL}\nORDER BY ${dialect.DefaultPagingOrderBy}`;
        }

        // Append paging clause via dialect
        const limitResult = dialect.LimitClause(maxRows, startRow);
        return `${dataSQL}\n${limitResult.suffix}`;
    }

    /**
     * Strips a TOP clause from the outermost SELECT statement.
     * Handles `TOP N` and `TOP (N)`, with or without DISTINCT.
     * Does not affect TOP in subqueries or CTEs.
     */
    private static stripTopFromMainSelect(sql: string, dialect: SQLDialect): string {
        const extraction = SQLParser.ExtractCTEs(sql, dialect);

        if (extraction) {
            const { sql: cleanMain, topRemoved } = QueryPagingEngine.stripTopClause(extraction.MainStatement);
            if (topRemoved) {
                const ctePrefix = sql.substring(0, sql.length - extraction.MainStatement.length).trimEnd();
                return `${ctePrefix}\n${cleanMain}`;
            }
            return sql;
        }

        const { sql: cleanSQL } = QueryPagingEngine.stripTopClause(sql);
        return cleanSQL;
    }

    // ════════════════════════════════════════════════════════════════════
    // Count SQL — wrap in CTE, strip ORDER BY, SELECT COUNT(*)
    // ════════════════════════════════════════════════════════════════════

    /**
     * Builds count SQL that wraps the (cap-free, ORDER-BY-free) query in a
     * `[__count]` CTE and selects `COUNT(*)`. A single instance-API path:
     *   1. `ExtractCTEs` hoists any user CTEs as siblings (a CTE body can't
     *      contain its own WITH) — AST parse first, paren-depth regex fallback.
     *   2. `stripCountBody` removes the top-level ORDER BY (irrelevant for a
     *      count, and illegal in a SQL Server CTE without TOP) and any outer
     *      TOP / LIMIT (so the count reflects the full set, consistent with the
     *      paged data query).
     */
    private static buildCountSQL(sql: string, dialect: SQLDialect): string {
        const countCTEName = dialect.QuoteIdentifier('__count');

        const extraction = SQLParser.ExtractCTEs(sql, dialect);
        const mainStatement = extraction ? extraction.MainStatement : sql;
        const cteDefs = extraction
            ? extraction.CTEDefinitions.map(def => QueryPagingEngine.quoteCteName(def, dialect))
            : [];

        const countBody = QueryPagingEngine.stripCountBody(mainStatement, dialect);

        const allCTEs = [...cteDefs, `${countCTEName} AS (\n${countBody}\n)`];
        return `WITH ${allCTEs.join(',\n')}\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
    }

    /**
     * Strips the ORDER BY and any outer row cap (TOP on SQL Server, LIMIT on
     * PostgreSQL) from the statement being counted, via a single parser
     * round-trip — so the count reflects the full set rather than the capped
     * subset. Falls back to a string-based ORDER BY strip when the statement
     * can't be parsed (e.g. TRY_CAST, unresolved templates); the cap can't be
     * reliably removed without a parse, matching the prior regex behavior.
     */
    private static stripCountBody(sql: string, dialect: SQLDialect): string {
        const parser = new SQLParser(sql, dialect);
        if (parser.IsValid) {
            parser.ClearOuterCap();
            parser.ClearOrderBy();
            try {
                return parser.ToSQL();
            } catch {
                // fall through to the string-based fallback
            }
        }
        return QueryPagingEngine.extractOrderBy(sql, dialect).sqlWithoutOrder;
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

    /**
     * ExtractCTEs returns CTE definitions with unquoted names (e.g. `myName AS (...)`).
     * Apply dialect-specific identifier quoting to the CTE name.
     */
    private static quoteCteName(cteDefinition: string, dialect: SQLDialect): string {
        const match = cteDefinition.match(/^(\[([^\]]+)\]|"([^"]+)"|([A-Za-z_]\w*))\s+AS\s*\(/i);
        if (!match) return cteDefinition;

        const bareName = match[2] ?? match[3] ?? match[4];
        if (!bareName) return cteDefinition;

        const quotedName = dialect.QuoteIdentifier(bareName);
        return quotedName + cteDefinition.substring(match[1].length);
    }

    // ════════════════════════════════════════════════════════════════════
    // Dialect resolution
    // ════════════════════════════════════════════════════════════════════

    private static getDialect(platform: DatabasePlatform): SQLDialect {
        return GetDialect(platform);
    }
}
