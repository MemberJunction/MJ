import { DatabasePlatform } from '@memberjunction/core';
import { SQLParser, AnalyzeTopLevelOrderBy, findOrderByStatement as sharedFindOrderByStatement } from '@memberjunction/sql-parser';
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

    private static buildCountSQL(sql: string, dialect: SQLDialect): string {
        const astResult = QueryPagingEngine.buildCountSQLViaAST(sql, dialect);
        if (astResult) return astResult;

        return QueryPagingEngine.buildCountSQLViaRegex(sql, dialect);
    }

    private static buildCountSQLViaAST(sql: string, dialect: SQLDialect): string | null {
        try {
            const ast = SQLParser.ParseSQL(sql, dialect);
            if (!ast) return null;

            const stmt = (Array.isArray(ast) ? ast[0] : ast) as unknown as Record<string, unknown>;
            if (!stmt) return null;

            const existingCTEDefs = QueryPagingEngine.extractCTEsFromAST(stmt, dialect);

            const orderByStmt = QueryPagingEngine.findOrderByStatement(stmt);
            if (orderByStmt?.orderby) {
                orderByStmt.orderby = null;
            }

            if (stmt.top) stmt.top = null;

            stmt.with = null;
            const mainSelectSQL = SQLParser.SqlifyAST(
                stmt as unknown as Parameters<typeof SQLParser.SqlifyAST>[0], dialect
            );

            const countCTEName = dialect.QuoteIdentifier('__count');
            const allCTEs = [...existingCTEDefs, `${countCTEName} AS (\n${mainSelectSQL}\n)`];
            return `WITH ${allCTEs.join(',\n')}\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
        } catch {
            return null;
        }
    }

    private static extractCTEsFromAST(
        stmt: Record<string, unknown>,
        dialect: SQLDialect
    ): string[] {
        const ctes = (stmt.with as unknown[] | null) || [];
        return ctes.map(cte => {
            const cteRecord = cte as { name: { value: string }; stmt: { ast: unknown } };
            const quotedName = dialect.QuoteIdentifier(cteRecord.name.value);
            const bodySQL = SQLParser.SqlifyAST(cteRecord.stmt.ast as Parameters<typeof SQLParser.SqlifyAST>[0], dialect);
            return `${quotedName} AS (\n${bodySQL}\n)`;
        });
    }

    private static buildCountSQLViaRegex(sql: string, dialect: SQLDialect): string {
        const extraction = SQLParser.ExtractCTEs(sql, dialect);

        if (extraction) {
            const { sqlWithoutOrder } = QueryPagingEngine.extractOrderBy(extraction.MainStatement, dialect);
            const quotedCTEDefs = extraction.CTEDefinitions.map(def =>
                QueryPagingEngine.quoteCteName(def, dialect)
            );
            const countCTEName = dialect.QuoteIdentifier('__count');
            const allCTEs = [...quotedCTEDefs, `${countCTEName} AS (\n${sqlWithoutOrder}\n)`];
            return `WITH ${allCTEs.join(',\n')}\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
        }

        const { sqlWithoutOrder } = QueryPagingEngine.extractOrderBy(sql, dialect);
        const countCTEName = dialect.QuoteIdentifier('__count');
        return `WITH ${countCTEName} AS (\n${sqlWithoutOrder}\n)\nSELECT COUNT(*) AS TotalRowCount FROM ${countCTEName}`;
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
