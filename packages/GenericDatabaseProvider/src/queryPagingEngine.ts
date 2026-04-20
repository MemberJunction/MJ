import { DatabasePlatform } from '@memberjunction/core';
import { SQLParser } from '@memberjunction/sql-parser';
import { AnalyzeTopLevelOrderBy, findOrderByStatement as sharedFindOrderByStatement } from './orderByAnalyzer.js';

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
        // Strip trailing semicolons — they break OFFSET/FETCH and CTE wrapping
        const cleanedSQL = resolvedSQL.trimEnd().replace(/;\s*$/, '');

        const dataSQL = QueryPagingEngine.buildDataSQL(cleanedSQL, startRow, maxRows, platform);
        const countSQL = QueryPagingEngine.buildCountSQL(cleanedSQL, platform);

        return { DataSQL: dataSQL, CountSQL: countSQL, Offset: startRow, PageSize: maxRows };
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

    /**
     * Builds the paged data SQL by appending OFFSET/FETCH or LIMIT/OFFSET
     * directly to the original SQL.
     *
     * - Strips TOP on SQL Server (TOP and OFFSET are mutually exclusive)
     * - Ensures ORDER BY exists (SQL Server requires it for OFFSET/FETCH;
     *   PostgreSQL requires it for deterministic LIMIT/OFFSET)
     * - Appends the platform-specific paging clause
     */
    private static buildDataSQL(
        sql: string,
        startRow: number,
        maxRows: number,
        platform: DatabasePlatform,
    ): string {
        let dataSQL = sql;

        // Strip TOP clause on SQL Server — it conflicts with OFFSET/FETCH.
        // Must operate on the main SELECT, not on subqueries or CTEs.
        if (platform === 'sqlserver') {
            dataSQL = QueryPagingEngine.stripTopFromMainSelect(dataSQL);
        }

        // Ensure there's an ORDER BY — required for OFFSET/FETCH on SQL Server,
        // and strongly recommended for deterministic LIMIT/OFFSET on PostgreSQL.
        if (!QueryPagingEngine.hasTopLevelOrderBy(dataSQL, platform)) {
            const defaultOrder = QueryPagingEngine.defaultOrderBy(platform);
            dataSQL = `${dataSQL}\nORDER BY ${defaultOrder}`;
        }

        // Append paging clause
        const pagingClause = QueryPagingEngine.buildPagingClause(startRow, maxRows, platform);
        return `${dataSQL}\n${pagingClause}`;
    }

    /**
     * Strips a TOP clause from the outermost SELECT statement.
     * Handles `TOP N` and `TOP (N)`, with or without DISTINCT.
     * Does not affect TOP in subqueries or CTEs.
     */
    private static stripTopFromMainSelect(sql: string): string {
        // Find the main SELECT — it's either the first token, or follows the
        // last CTE closing paren. Use ExtractCTEs to find the main statement.
        const parserDialect = 'TransactSQL';
        const extraction = SQLParser.ExtractCTEs(sql, parserDialect);

        if (extraction) {
            // SQL has CTEs — strip TOP only from the main statement
            const { sql: cleanMain, topRemoved } = QueryPagingEngine.stripTopClause(extraction.MainStatement);
            if (topRemoved) {
                // Reassemble: WITH ... <CTEs> ... <cleanMain>
                const ctePrefix = sql.substring(0, sql.length - extraction.MainStatement.length).trimEnd();
                return `${ctePrefix}\n${cleanMain}`;
            }
            return sql;
        }

        // No CTEs — strip TOP from the SQL directly
        const { sql: cleanSQL } = QueryPagingEngine.stripTopClause(sql);
        return cleanSQL;
    }

    // ════════════════════════════════════════════════════════════════════
    // Count SQL — wrap in CTE, strip ORDER BY, SELECT COUNT(*)
    // ════════════════════════════════════════════════════════════════════

    /**
     * Builds the count SQL by wrapping the original query (minus ORDER BY)
     * in a CTE and selecting COUNT(*).
     *
     * Uses a two-tier approach:
     *   1. **AST path** — parse SQL, strip ORDER BY via AST, reconstruct
     *   2. **Regex fallback** — use SQLParser.ExtractCTEs + regex ORDER BY removal
     */
    private static buildCountSQL(sql: string, platform: DatabasePlatform): string {
        // Tier 1: Try full AST — cleanest approach
        const astResult = QueryPagingEngine.buildCountSQLViaAST(sql, platform);
        if (astResult) return astResult;

        // Tier 2: Hybrid — SQLParser.ExtractCTEs + regex ORDER BY stripping
        return QueryPagingEngine.buildCountSQLViaRegex(sql, platform);
    }

    /**
     * AST-based count SQL: parse entire SQL, extract CTEs, strip ORDER BY and
     * TOP from the main SELECT, then assemble all CTEs + __count as siblings
     * in a flat WITH chain.
     */
    private static buildCountSQLViaAST(sql: string, platform: DatabasePlatform): string | null {
        const parserDialect = platform === 'postgresql' ? 'PostgresQL' : 'TransactSQL';
        try {
            const ast = SQLParser.ParseSQL(sql, parserDialect);
            if (!ast) return null;

            const stmt = (Array.isArray(ast) ? ast[0] : ast) as unknown as Record<string, unknown>;
            if (!stmt) return null;

            // Extract existing CTEs as sibling definitions
            const existingCTEDefs = QueryPagingEngine.extractCTEsFromAST(stmt, parserDialect, platform);

            // Strip ORDER BY (not needed for counting, illegal in CTEs without TOP)
            const orderByStmt = QueryPagingEngine.findOrderByStatement(stmt);
            if (orderByStmt?.orderby) {
                orderByStmt.orderby = null;
            }

            // Strip TOP — we want the full count
            if (stmt.top) stmt.top = null;

            // Reconstruct only the main SELECT (without CTEs)
            stmt.with = null;
            const mainSelectSQL = SQLParser.SqlifyAST(
                stmt as unknown as Parameters<typeof SQLParser.SqlifyAST>[0], parserDialect
            );

            // Assemble: all existing CTEs + __count as siblings in a single WITH
            const countCTEName = QueryPagingEngine.quoteIdentifier('__count', platform);
            const allCTEs = [...existingCTEDefs, `${countCTEName} AS (\n${mainSelectSQL}\n)`];
            return `WITH ${allCTEs.join(',\n')}\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
        } catch {
            return null;
        }
    }

    /**
     * Extracts CTE definitions from an AST statement, producing quoted
     * `[name] AS (...)` strings for each CTE.
     */
    private static extractCTEsFromAST(
        stmt: Record<string, unknown>,
        parserDialect: string,
        platform: DatabasePlatform
    ): string[] {
        const ctes = (stmt.with as unknown[] | null) || [];
        return ctes.map(cte => {
            const cteRecord = cte as { name: { value: string }; stmt: { ast: unknown } };
            const quotedName = QueryPagingEngine.quoteIdentifier(cteRecord.name.value, platform);
            const bodySQL = SQLParser.SqlifyAST(cteRecord.stmt.ast as Parameters<typeof SQLParser.SqlifyAST>[0], parserDialect);
            return `${quotedName} AS (\n${bodySQL}\n)`;
        });
    }

    /**
     * Regex-based count SQL: use SQLParser.ExtractCTEs for robust CTE splitting,
     * then regex to strip ORDER BY from the main SELECT, wrap in count CTE.
     */
    private static buildCountSQLViaRegex(sql: string, platform: DatabasePlatform): string {
        const parserDialect = platform === 'postgresql' ? 'PostgresQL' : 'TransactSQL';
        const extraction = SQLParser.ExtractCTEs(sql, parserDialect);

        if (extraction) {
            // Strip ORDER BY from the main SELECT only
            const { sqlWithoutOrder } = QueryPagingEngine.extractOrderBy(extraction.MainStatement, parserDialect);
            const quotedCTEDefs = extraction.CTEDefinitions.map(def =>
                QueryPagingEngine.quoteCteName(def, platform)
            );
            const countCTEName = QueryPagingEngine.quoteIdentifier('__count', platform);
            const allCTEs = [...quotedCTEDefs, `${countCTEName} AS (\n${sqlWithoutOrder}\n)`];
            return `WITH ${allCTEs.join(',\n')}\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
        }

        // No CTEs — strip ORDER BY and wrap the whole SQL
        const { sqlWithoutOrder } = QueryPagingEngine.extractOrderBy(sql, parserDialect);
        return QueryPagingEngine.assembleCountSQL(sqlWithoutOrder, platform);
    }

    /**
     * Wraps cleaned SQL (no ORDER BY) in a CTE for counting.
     */
    private static assembleCountSQL(cleanSQL: string, platform: DatabasePlatform): string {
        const countCTEName = QueryPagingEngine.quoteIdentifier('__count', platform);
        return `WITH ${countCTEName} AS (\n${cleanSQL}\n)\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
    }

    // ════════════════════════════════════════════════════════════════════
    // AST helpers — delegate to shared orderByAnalyzer
    // ════════════════════════════════════════════════════════════════════

    private static findOrderByStatement(stmt: Record<string, unknown>): Record<string, unknown> | null {
        return sharedFindOrderByStatement(stmt);
    }

    // ════════════════════════════════════════════════════════════════════
    // SQL analysis helpers — delegate to shared orderByAnalyzer
    // ════════════════════════════════════════════════════════════════════

    /**
     * Checks if the SQL has a top-level ORDER BY clause (not inside subqueries,
     * CTEs, window functions, comments, or string/identifier literals).
     *
     * Delegates to the shared `AnalyzeTopLevelOrderBy` utility which handles
     * both SQL+Nunjucks (composition) and clean SQL (paging) through AST parsing
     * with MJLexer scanner fallback.
     */
    private static hasTopLevelOrderBy(sql: string, platform: DatabasePlatform): boolean {
        const parserDialect = platform === 'postgresql' ? 'PostgresQL' : 'TransactSQL';
        return AnalyzeTopLevelOrderBy(sql, parserDialect).Positions.length > 0;
    }

    /**
     * Extracts the top-level ORDER BY clause from SQL, ignoring ORDER BY
     * inside subqueries, block comments, line comments, single-quoted strings,
     * and bracket/double-quoted identifiers.
     *
     * Delegates to the shared `AnalyzeTopLevelOrderBy` utility. Preserves the
     * public static API for existing callers and tests.
     */
    static extractOrderBy(
        sql: string,
        parserDialect: string = 'TransactSQL'
    ): { sqlWithoutOrder: string; orderByClause: string | null } {
        const analysis = AnalyzeTopLevelOrderBy(sql, parserDialect);
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
     * We need to apply platform-specific identifier quoting to the CTE name.
     */
    private static quoteCteName(cteDefinition: string, platform: DatabasePlatform): string {
        const match = cteDefinition.match(/^(\[([^\]]+)\]|"([^"]+)"|([A-Za-z_]\w*))\s+AS\s*\(/i);
        if (!match) return cteDefinition;

        const bareName = match[2] ?? match[3] ?? match[4];
        if (!bareName) return cteDefinition;

        const quotedName = QueryPagingEngine.quoteIdentifier(bareName, platform);
        return quotedName + cteDefinition.substring(match[1].length);
    }

    // ════════════════════════════════════════════════════════════════════
    // Platform helpers
    // ════════════════════════════════════════════════════════════════════

    private static quoteIdentifier(name: string, platform: DatabasePlatform): string {
        return platform === 'postgresql' ? `"${name}"` : `[${name}]`;
    }

    private static buildPagingClause(startRow: number, maxRows: number, platform: DatabasePlatform): string {
        return platform === 'postgresql'
            ? `LIMIT ${maxRows} OFFSET ${startRow}`
            : `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    private static defaultOrderBy(platform: DatabasePlatform): string {
        return platform === 'postgresql' ? '1' : '(SELECT NULL)';
    }
}
