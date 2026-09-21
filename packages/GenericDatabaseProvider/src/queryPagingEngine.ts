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
 * scopes, ORDER BY references, and table aliases remain valid. An outer row cap the
 * query already carries is stripped first, since it conflicts with the appended paging
 * clause — `TOP` on SQL Server, a statement-closing `LIMIT` on PostgreSQL — and the
 * tighter of (that cap, the page size) is what gets applied.
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
        let effectiveMaxRows = maxRows;

        // Strip TOP clause on SQL Server — it conflicts with OFFSET/FETCH.
        if (dialect.PlatformKey === 'sqlserver') {
            dataSQL = QueryPagingEngine.stripTopFromMainSelect(dataSQL, dialect);
        } else if (dialect.PlatformKey === 'postgresql') {
            // The PostgreSQL mirror of the SQL Server strip above, which had no counterpart. A
            // query that already carries its own `LIMIT` was handed a SECOND one — the trailing
            // `LIMIT n OFFSET m` is appended unconditionally below — producing
            // `… LIMIT 20 LIMIT 100 OFFSET 0`, which PostgreSQL rejects as a parse error. Agent
            // and Skip queries routinely ship with their own `LIMIT`, so those queries could not
            // be paged at all.
            const stripped = QueryPagingEngine.stripOuterLimitOffset(dataSQL);
            dataSQL = stripped.sql;
            // Keep the TIGHTER of the two caps. The query's own LIMIT is an author-stated ceiling
            // on the result set, so a page size larger than it must not widen it. `LIMIT ALL`
            // states no numeric ceiling, so it comes back null and the page size stands.
            if (stripped.limitRemoved !== null) {
                effectiveMaxRows = Math.min(stripped.limitRemoved, maxRows);
            }
        }

        // Ensure there's an ORDER BY — required for OFFSET/FETCH on SQL Server,
        // and strongly recommended for deterministic LIMIT/OFFSET on PostgreSQL.
        const hasOrderBy = AnalyzeTopLevelOrderBy(dataSQL, dialect).Positions.length > 0;
        if (!hasOrderBy) {
            dataSQL = `${dataSQL}\nORDER BY ${dialect.DefaultPagingOrderBy}`;
        }

        // Append paging clause via dialect
        const limitResult = dialect.LimitClause(effectiveMaxRows, startRow);
        return `${dataSQL}\n${limitResult.suffix}`;
    }

    /**
     * Matches a `LIMIT` (with its optional `OFFSET`) that closes the STATEMENT — end-anchored,
     * and that anchoring is the whole safety argument. A `LIMIT` inside a CTE body or a subquery
     * is part of that subquery's meaning, not an outer row cap, and removing it would silently
     * change which rows the query returns; end-of-statement is the one position where a `LIMIT`
     * is provably the outer cap this method is entitled to replace.
     *
     * `LIMIT ALL` is matched too: it is equally illegal to follow with a second `LIMIT`, and it
     * states no numeric ceiling, so it is stripped and reported as no cap.
     *
     * Deliberately narrow. A trailing `FOR UPDATE` / `FETCH` after the `LIMIT` blocks the match,
     * so this abstains and the pre-existing behaviour stands — abstaining is always safe here,
     * because it is exactly what shipped before.
     */
    private static readonly OUTER_LIMIT_OFFSET = /\s+LIMIT\s+(ALL|\d+)(?:\s+OFFSET\s+\d+)?\s*$/i;

    /**
     * How much of a statement's tail the end-anchored clause matchers above are run against.
     *
     * Generous next to what they match — `LIMIT 18446744073709551615 OFFSET 18446744073709551615`
     * is under 60 characters — and it exists only so the match cost cannot grow with the size of
     * the statement in front of it.
     */
    private static readonly OUTER_CLAUSE_TAIL = 512;

    /**
     * Removes a statement-closing `LIMIT [OFFSET]` so a paging clause can be appended without
     * colliding with it.
     *
     * Returns the SQL with that clause removed and the numeric limit that was removed, or `null`
     * for `limitRemoved` when nothing matched or the removed clause was `LIMIT ALL` (no numeric
     * ceiling). Any `LIMIT` that is not at end-of-statement — in a CTE, in a subquery — is left
     * exactly where it is; see {@link OUTER_LIMIT_OFFSET}.
     *
     * The query's own `OFFSET` goes with its `LIMIT` rather than being composed with the caller's:
     * a paging request states the window it wants, and the same is already true of the SQL Server
     * `TOP` strip above and of `stripCountBody`'s `ClearOuterCap`.
     */
    static stripOuterLimitOffset(sql: string): { sql: string; limitRemoved: number | null } {
        // MATCHED AGAINST A BOUNDED TAIL, not the whole statement. The pattern opens with `\s+`
        // and ends at `$`, so running it over the full SQL lets the engine retry from every index
        // inside a long whitespace run and give the run back one character at a time — quadratic
        // in the length of that run, which is the ReDoS CodeQL flags here. The clause this matches
        // closes the statement, so only the tail can ever contain it.
        //
        // Slicing cannot invent a match: the slice is a suffix of `sql`, and an end-anchored match
        // on a suffix is a match on the whole string. It can only shorten the leading whitespace
        // the match claims, which leaves a space at the end of the stripped SQL and changes
        // nothing about its meaning. A clause longer than the window makes this abstain, which is
        // the pre-existing behaviour and is documented above as always safe.
        const tail = sql.length > QueryPagingEngine.OUTER_CLAUSE_TAIL
            ? sql.slice(sql.length - QueryPagingEngine.OUTER_CLAUSE_TAIL)
            : sql;
        const match = tail.match(QueryPagingEngine.OUTER_LIMIT_OFFSET);
        if (!match) return { sql, limitRemoved: null };

        const strippedSQL = sql.substring(0, sql.length - match[0].length);
        const limitToken = match[1];
        const limitRemoved = /^\d+$/.test(limitToken) ? Number(limitToken) : null;
        return { sql: strippedSQL, limitRemoved };
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
