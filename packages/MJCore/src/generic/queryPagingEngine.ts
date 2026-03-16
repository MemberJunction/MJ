import { DatabasePlatform } from './platformSQL';

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
 * Handles server-side pagination for query SQL by wrapping resolved SQL in CTEs
 * and applying platform-specific OFFSET/FETCH or LIMIT/OFFSET clauses.
 *
 * Works with arbitrary SQL including pre-existing CTEs from the composition engine.
 * The approach:
 *   1. Parse the SQL to separate CTE prefix from the main SELECT
 *   2. Extract and remove any ORDER BY from the main SELECT
 *   3. Strip any TOP N clause from the main SELECT
 *   4. Wrap the main SELECT as a new CTE (`__paged`)
 *   5. Emit a data query with ORDER BY + platform paging
 *   6. Emit a count query over the same CTE
 */
export class QueryPagingEngine {

    /**
     * Wraps resolved SQL with CTE-based paging for server-side pagination.
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
        // Parse the SQL into CTE prefix + main SELECT
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(resolvedSQL);

        // Extract ORDER BY from the main SELECT
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(mainSelect);

        // Strip TOP clause from the main SELECT (SQL Server habit)
        const { sql: cleanSelect } = QueryPagingEngine.stripTopClause(sqlWithoutOrder);

        // Build the CTE chain: existing CTEs + __paged
        const pagingCTEName = QueryPagingEngine.quoteIdentifier('__paged', platform);
        const existingCTEs = ctePrefix ? ctePrefix + ',\n' : 'WITH ';
        const cteChain = `${existingCTEs}${pagingCTEName} AS (\n${cleanSelect}\n)`;

        // Determine ORDER BY for the outer query
        const outerOrderBy = orderByClause || QueryPagingEngine.defaultOrderBy(platform);

        // Build platform-specific data query
        const pagingClause = QueryPagingEngine.buildPagingClause(startRow, maxRows, platform);
        const dataSQL = `${cteChain}\nSELECT * FROM ${pagingCTEName}\nORDER BY ${outerOrderBy}\n${pagingClause}`;

        // Build count query (no ORDER BY needed)
        const countSQL = `${cteChain}\nSELECT COUNT(*) AS TotalRowCount FROM ${pagingCTEName}`;

        return {
            DataSQL: dataSQL,
            CountSQL: countSQL,
            Offset: startRow,
            PageSize: maxRows,
        };
    }

    /**
     * Determines whether the given params indicate paging should be applied.
     * Paging is active when both StartRow is defined (>= 0) and MaxRows > 0.
     */
    static ShouldPage(startRow: number | undefined, maxRows: number | undefined): boolean {
        return maxRows != null && maxRows > 0 && startRow != null && startRow >= 0;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Splits SQL into a CTE prefix (everything in the WITH chain) and the main
     * SELECT statement. Handles nested parentheses to avoid splitting inside CTEs.
     *
     * Returns `ctePrefix` as the full `WITH ... AS (...)` chain (no trailing comma),
     * and `mainSelect` as the final SELECT.
     */
    static splitCTEAndSelect(sql: string): { ctePrefix: string; mainSelect: string } {
        const trimmed = sql.trim();

        // Check if SQL starts with WITH (case-insensitive)
        if (!/^WITH\s/i.test(trimmed)) {
            return { ctePrefix: '', mainSelect: trimmed };
        }

        // Walk through the SQL tracking parenthesis depth to find where CTEs end
        // and the final SELECT begins. CTEs are: WITH name AS (...), name AS (...)
        // The final SELECT is the statement after the last CTE closing paren + optional comma.
        let depth = 0;
        let lastCTEEnd = -1;
        let i = 0;

        // Skip past "WITH "
        const withMatch = trimmed.match(/^WITH\s+/i);
        if (!withMatch) {
            return { ctePrefix: '', mainSelect: trimmed };
        }
        i = withMatch[0].length;

        while (i < trimmed.length) {
            const ch = trimmed[i];

            if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    lastCTEEnd = i;
                    // Look ahead: is there a comma (another CTE) or the final SELECT?
                    const rest = trimmed.substring(i + 1).trimStart();
                    if (rest.startsWith(',')) {
                        // More CTEs — advance past the comma
                        i = trimmed.indexOf(',', i + 1) + 1;
                        continue;
                    }
                    // This is the end of the CTE chain
                    break;
                }
            } else if (ch === "'" && depth > 0) {
                // Skip string literals inside CTEs
                i++;
                while (i < trimmed.length && trimmed[i] !== "'") {
                    if (trimmed[i] === "'" && i + 1 < trimmed.length && trimmed[i + 1] === "'") {
                        i += 2; // escaped quote
                    } else {
                        i++;
                    }
                }
            }
            i++;
        }

        if (lastCTEEnd === -1) {
            // Couldn't parse CTEs — treat entire thing as mainSelect
            return { ctePrefix: '', mainSelect: trimmed };
        }

        const ctePrefix = trimmed.substring(0, lastCTEEnd + 1).trim();
        const mainSelect = trimmed.substring(lastCTEEnd + 1).trim();

        return { ctePrefix, mainSelect };
    }

    /**
     * Extracts the ORDER BY clause from the end of a SQL statement.
     * Only matches ORDER BY that is NOT inside parentheses (i.e., top-level).
     */
    static extractOrderBy(sql: string): { sqlWithoutOrder: string; orderByClause: string | null } {
        // Find the last top-level ORDER BY
        const upperSQL = sql.toUpperCase();
        let depth = 0;
        let lastOrderByPos = -1;

        for (let i = 0; i < sql.length; i++) {
            const ch = sql[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (depth === 0 && i + 8 <= sql.length) {
                const slice = upperSQL.substring(i, i + 8);
                if (slice === 'ORDER BY') {
                    // Verify it's a word boundary (preceded by whitespace or start)
                    if (i === 0 || /\s/.test(sql[i - 1])) {
                        lastOrderByPos = i;
                    }
                }
            }
        }

        if (lastOrderByPos === -1) {
            return { sqlWithoutOrder: sql, orderByClause: null };
        }

        const orderByClause = sql.substring(lastOrderByPos + 9).trim(); // 9 = "ORDER BY ".length
        const sqlWithoutOrder = sql.substring(0, lastOrderByPos).trim();

        return { sqlWithoutOrder, orderByClause };
    }

    /**
     * Strips a TOP N clause from a SELECT statement.
     * Handles `SELECT TOP N`, `SELECT TOP (N)`, and `SELECT DISTINCT TOP N`.
     */
    static stripTopClause(sql: string): { sql: string; topRemoved: boolean } {
        // Match SELECT [DISTINCT] TOP (N) or TOP N
        const topRegex = /^(SELECT\s+(?:DISTINCT\s+)?)TOP\s+(?:\(\s*\d+\s*\)|\d+)\s+/i;
        const match = sql.match(topRegex);

        if (!match) {
            return { sql, topRemoved: false };
        }

        // Replace TOP clause, keeping SELECT [DISTINCT]
        const cleaned = match[1] + sql.substring(match[0].length);
        return { sql: cleaned, topRemoved: true };
    }

    /**
     * Quotes an identifier for the target platform.
     */
    private static quoteIdentifier(name: string, platform: DatabasePlatform): string {
        if (platform === 'postgresql') {
            return `"${name}"`;
        }
        return `[${name}]`;
    }

    /**
     * Builds the platform-specific paging clause.
     */
    private static buildPagingClause(startRow: number, maxRows: number, platform: DatabasePlatform): string {
        if (platform === 'postgresql') {
            return `LIMIT ${maxRows} OFFSET ${startRow}`;
        }
        // SQL Server
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    /**
     * Default ORDER BY when the original SQL has none.
     * SQL Server requires ORDER BY for OFFSET/FETCH. We use (SELECT NULL) as a
     * neutral ordering that satisfies the syntax without imposing any sort.
     */
    private static defaultOrderBy(platform: DatabasePlatform): string {
        if (platform === 'postgresql') {
            // PostgreSQL allows LIMIT/OFFSET without ORDER BY, but for consistency
            // we still add a neutral order
            return '1';
        }
        return '(SELECT NULL)';
    }
}
