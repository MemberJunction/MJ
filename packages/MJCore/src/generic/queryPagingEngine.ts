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
        // Strip trailing semicolons — they break CTE wrapping and OFFSET/FETCH clauses
        const cleanedSQL = resolvedSQL.trimEnd().replace(/;\s*$/, '');

        // Parse the SQL into CTE prefix + main SELECT
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(cleanedSQL);

        // Extract ORDER BY from the main SELECT
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(mainSelect);

        // Strip TOP clause from the main SELECT (SQL Server habit)
        const { sql: cleanSelect } = QueryPagingEngine.stripTopClause(sqlWithoutOrder);

        // Build the CTE chain: existing CTEs + __paged
        const pagingCTEName = QueryPagingEngine.quoteIdentifier('__paged', platform);
        const existingCTEs = ctePrefix ? ctePrefix + ',\n' : 'WITH ';
        const cteChain = `${existingCTEs}${pagingCTEName} AS (\n${cleanSelect}\n)`;

        // Determine ORDER BY for the outer query, remapping table-qualified
        // references to projected column names since the outer query is
        // SELECT * FROM [__paged] where table aliases don't exist.
        const rawOrderBy = orderByClause || QueryPagingEngine.defaultOrderBy(platform);
        const outerOrderBy = orderByClause
            ? QueryPagingEngine.remapOrderByToProjectedNames(rawOrderBy, cleanSelect)
            : rawOrderBy;

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
     * Remaps ORDER BY expressions so they reference the projected column names
     * from the SELECT list rather than table-qualified aliases (e.g. `r.Total`
     * becomes `TotalRevenue` if the SELECT has `r.Total AS TotalRevenue`).
     *
     * This is necessary because the outer query is `SELECT * FROM [__paged]`
     * where the original table aliases no longer exist.
     */
    static remapOrderByToProjectedNames(orderByClause: string, selectSQL: string): string {
        const aliasMap = QueryPagingEngine.buildSelectAliasMap(selectSQL);

        // Split ORDER BY into terms at top-level commas
        const terms = QueryPagingEngine.splitAtTopLevelCommas(orderByClause);

        const remapped = terms.map(term => {
            const trimmed = term.trim();

            // Separate direction suffix (ASC, DESC, NULLS FIRST, NULLS LAST)
            const dirMatch = trimmed.match(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?\s*$/i);
            const expr = dirMatch ? trimmed.substring(0, dirMatch.index!).trim() : trimmed;
            const direction = dirMatch ? dirMatch[0] : '';

            // Normalize whitespace for comparison
            const normalizedExpr = expr.replace(/\s+/g, ' ').trim();

            // 1. Try exact match against SELECT expressions
            const exactMatch = aliasMap.get(normalizedExpr.toUpperCase());
            if (exactMatch) {
                return exactMatch + direction;
            }

            // 2. Try stripping table alias prefixes from the expression
            //    e.g., COALESCE(rc.ChangeCount, 0) → COALESCE(ChangeCount, 0)
            const stripped = normalizedExpr.replace(/\b[a-zA-Z_]\w*\./g, '');
            const strippedMatch = aliasMap.get(stripped.toUpperCase());
            if (strippedMatch) {
                return strippedMatch + direction;
            }

            // 3. If expr itself is a simple table.column, strip the prefix
            //    and check if the bare column is a projected name
            const dotMatch = expr.match(/^[a-zA-Z_]\w*\.([a-zA-Z_]\w*)$/);
            if (dotMatch) {
                return dotMatch[1] + direction;
            }

            // 4. Fallback: strip all table prefixes and hope for the best
            return stripped + direction;
        });

        return remapped.join(', ');
    }

    /**
     * Parses the SELECT list from a SQL statement and builds a map of
     * normalized expression → projected column name.
     *
     * For `SELECT au.Name AS UserName, COALESCE(rc.Count, 0) AS Total`
     * returns Map { "AU.NAME" → "UserName", "COALESCE(RC.COUNT, 0)" → "Total" }
     *
     * Also indexes the stripped (no table prefix) versions:
     * { "COALESCE(COUNT, 0)" → "Total", "NAME" → "UserName" }
     */
    private static buildSelectAliasMap(selectSQL: string): Map<string, string> {
        const map = new Map<string, string>();

        // Strip leading SQL comments (-- line comments and /* block comments */)
        const stripped = selectSQL.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/i, '');

        // Extract the column list between SELECT [DISTINCT] and the first top-level FROM
        const selectMatch = stripped.match(/^SELECT\s+(?:DISTINCT\s+)?/i);
        if (!selectMatch) return map;

        const afterSelect = stripped.substring(selectMatch[0].length);

        // Find top-level FROM
        const upperAfter = afterSelect.toUpperCase();
        let depth = 0;
        let fromPos = -1;
        for (let i = 0; i < afterSelect.length; i++) {
            const ch = afterSelect[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (depth === 0 && i + 5 <= afterSelect.length) {
                if (upperAfter.substring(i, i + 5) === 'FROM ' || upperAfter.substring(i, i + 5) === 'FROM\n' || upperAfter.substring(i, i + 5) === 'FROM\t') {
                    if (i === 0 || /\s/.test(afterSelect[i - 1])) {
                        fromPos = i;
                        break;
                    }
                }
            }
        }

        const columnList = fromPos === -1 ? afterSelect : afterSelect.substring(0, fromPos);
        const items = QueryPagingEngine.splitAtTopLevelCommas(columnList);

        for (const item of items) {
            const trimmed = item.trim();
            if (!trimmed) continue;

            // Check for AS alias (case insensitive, must be word-bounded)
            const asMatch = trimmed.match(/\s+AS\s+(\[?\w+\]?)\s*$/i);
            if (asMatch) {
                const expr = trimmed.substring(0, asMatch.index!).trim();
                const alias = asMatch[1].replace(/[[\]]/g, ''); // strip brackets
                const normalizedExpr = expr.replace(/\s+/g, ' ').toUpperCase();
                map.set(normalizedExpr, alias);

                // Also index the stripped version (no table prefixes)
                const strippedExpr = normalizedExpr.replace(/\b[A-Z_]\w*\./g, '');
                if (strippedExpr !== normalizedExpr) {
                    map.set(strippedExpr, alias);
                }
            }
        }

        return map;
    }

    /**
     * Splits a SQL fragment by commas that are not inside parentheses.
     */
    private static splitAtTopLevelCommas(sql: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let start = 0;

        for (let i = 0; i < sql.length; i++) {
            const ch = sql[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) {
                parts.push(sql.substring(start, i));
                start = i + 1;
            }
        }
        parts.push(sql.substring(start));
        return parts;
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
