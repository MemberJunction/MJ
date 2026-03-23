import { DatabasePlatform } from '@memberjunction/core';
import { SQLParser } from '@memberjunction/sql-parser';

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
 * Uses a two-tier strategy:
 *   1. **AST path** — parse SQL via node-sql-parser, extract ORDER BY and TOP from
 *      the AST, reconstruct clean SQL via sqlify. Handles CTEs, subqueries, UNION,
 *      and complex expressions correctly without string heuristics.
 *   2. **Regex fallback** — for SQL that node-sql-parser cannot handle (e.g.,
 *      STRING_AGG WITHIN GROUP, certain FOR XML patterns), falls back to the
 *      original string-based approach with paren-depth tracking.
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

        // Tier 1: AST-based paging (robust, handles CTEs/subqueries/UNION correctly)
        const astResult = QueryPagingEngine.wrapViaAST(cleanedSQL, startRow, maxRows, platform);
        if (astResult) return astResult;

        // Tier 2: Regex-based fallback for SQL the parser can't handle
        return QueryPagingEngine.wrapViaRegex(cleanedSQL, startRow, maxRows, platform);
    }

    /**
     * Determines whether the given params indicate paging should be applied.
     */
    static ShouldPage(startRow: number | undefined, maxRows: number | undefined): boolean {
        return maxRows != null && maxRows > 0 && startRow != null && startRow >= 0;
    }

    // ════════════════════════════════════════════════════════════════════
    // AST-based paging (primary path)
    // ════════════════════════════════════════════════════════════════════

    private static wrapViaAST(
        sql: string,
        startRow: number,
        maxRows: number,
        platform: DatabasePlatform,
    ): PagingWrappedSQL | null {
        const parserDialect = platform === 'postgresql' ? 'PostgresQL' : 'TransactSQL';
        try {
            const ast = SQLParser.ParseSQL(sql, parserDialect);
            if (!ast) return null;

            const stmt = (Array.isArray(ast) ? ast[0] : ast) as unknown as Record<string, unknown>;
            if (!stmt) return null;

            // Extract CTEs via AST
            const cteDefs = QueryPagingEngine.extractCTEsFromAST(stmt, parserDialect, platform);

            // Extract ORDER BY and remap to projected column names via AST.
            // The outer query is SELECT * FROM [__paged], so table aliases from the
            // inner query don't exist. We match ORDER BY expressions against SELECT
            // columns to find the projected name (AS alias or bare column name).
            const orderByStmt = QueryPagingEngine.findOrderByStatement(stmt);
            const selectColumns = (stmt.columns && Array.isArray(stmt.columns))
                ? stmt.columns as Array<{ expr: Record<string, unknown>; as: string | null }>
                : [];
            const remappedOrderBy = QueryPagingEngine.remapOrderByViaAST(
                orderByStmt, selectColumns, parserDialect
            );
            if (orderByStmt?.orderby) {
                orderByStmt.orderby = null;
            }

            // Strip TOP
            if (stmt.top) stmt.top = null;

            // Get main SELECT without CTEs or ORDER BY
            stmt.with = null;
            const mainSelectSQL = SQLParser.SqlifyAST(stmt as unknown as Parameters<typeof SQLParser.SqlifyAST>[0], parserDialect);

            // Assemble paged query (skip string-based remapping — already done via AST)
            const pagingCTEName = QueryPagingEngine.quoteIdentifier('__paged', platform);
            const allCTEs = [...cteDefs, `${pagingCTEName} AS (\n${mainSelectSQL}\n)`];
            const cteChain = `WITH ${allCTEs.join(',\n')}`;

            const outerOrderBy = remappedOrderBy || QueryPagingEngine.defaultOrderBy(platform);
            const pagingClause = QueryPagingEngine.buildPagingClause(startRow, maxRows, platform);
            const dataSQL = `${cteChain}\nSELECT * FROM ${pagingCTEName}\nORDER BY ${outerOrderBy}\n${pagingClause}`;
            const countSQL = `${cteChain}\nSELECT COUNT(*) AS TotalRowCount FROM ${pagingCTEName}`;

            return { DataSQL: dataSQL, CountSQL: countSQL, Offset: startRow, PageSize: maxRows };
        } catch {
            return null;
        }
    }

    /**
     * Remaps ORDER BY terms to projected column names using AST comparison.
     *
     * For each ORDER BY expression, checks the SELECT column list for a match:
     * 1. If the SELECT column has an AS alias, use the alias
     * 2. If the SELECT column is a bare column_ref, use the column name
     * 3. If the ORDER BY is a simple column_ref, strip the table qualifier
     *
     * This is more robust than string-based remapping because it works directly
     * with the parsed AST structure — no regex needed for quoting or prefix stripping.
     */
    private static remapOrderByViaAST(
        orderByStmt: Record<string, unknown> | null,
        selectColumns: Array<{ expr: Record<string, unknown>; as: string | null }>,
        parserDialect: string
    ): string | null {
        if (!orderByStmt?.orderby || !Array.isArray(orderByStmt.orderby)) return null;

        const orderByTerms = orderByStmt.orderby as Array<{ expr: Record<string, unknown>; type: string }>;

        const remappedTerms = orderByTerms.map(orderTerm => {
            const direction = orderTerm.type === 'DESC' ? ' DESC' : '';
            const projectedName = QueryPagingEngine.resolveOrderByExpr(orderTerm.expr, selectColumns);

            if (projectedName) {
                return projectedName + direction;
            }

            // Fallback: if it's a simple column_ref, strip the table qualifier
            if (orderTerm.expr.type === 'column_ref') {
                return (orderTerm.expr.column as string) + direction;
            }

            // Last resort: convert via ExprToSQL (will have correct quoting at least)
            return SQLParser.ExprToSQL(orderTerm.expr, parserDialect) + direction;
        });

        return remappedTerms.join(', ');
    }

    /**
     * Resolves an ORDER BY expression to its projected column name by matching
     * against the SELECT column list at the AST level.
     */
    private static resolveOrderByExpr(
        orderExpr: Record<string, unknown>,
        selectColumns: Array<{ expr: Record<string, unknown>; as: string | null }>
    ): string | null {
        for (const col of selectColumns) {
            if (!col.expr) continue;

            // Check if the ORDER BY expression matches this SELECT column's expression
            if (QueryPagingEngine.astExprsMatch(orderExpr, col.expr)) {
                // If the column has an AS alias, use it
                if (col.as) return col.as;
                // If it's a bare column_ref, use the column name
                if (col.expr.type === 'column_ref') return col.expr.column as string;
            }

            // Also check: ORDER BY references a column by name that matches an AS alias
            if (orderExpr.type === 'column_ref' && col.as) {
                const orderCol = orderExpr.column as string;
                if (orderCol.toLowerCase() === col.as.toLowerCase()) {
                    return col.as;
                }
            }
        }

        return null;
    }

    /**
     * Compares two AST expression nodes for structural equality.
     * Handles column_ref (with table qualifier matching), aggregates, and functions.
     */
    private static astExprsMatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
        if (!a || !b) return false;
        if (a.type !== b.type) return false;

        // column_ref: match by column name (ignore table qualifier — the whole point
        // of remapping is that table qualifiers don't exist in the outer query)
        if (a.type === 'column_ref') {
            return (a.column as string)?.toLowerCase() === (b.column as string)?.toLowerCase() &&
                   (a.table as string | null)?.toLowerCase() === (b.table as string | null)?.toLowerCase();
        }

        // For aggregate functions (COUNT, SUM, etc.), compare name and args
        if (a.type === 'aggr_func') {
            if (a.name !== b.name) return false;
            return JSON.stringify(a.args) === JSON.stringify(b.args);
        }

        // For regular functions, compare name and args
        if (a.type === 'function') {
            return JSON.stringify(a.name) === JSON.stringify(b.name) &&
                   JSON.stringify(a.args) === JSON.stringify(b.args);
        }

        // Generic fallback: JSON deep equality (works for simple expressions)
        return JSON.stringify(a) === JSON.stringify(b);
    }

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

    private static findOrderByStatement(stmt: Record<string, unknown>): Record<string, unknown> | null {
        if (stmt.orderby) return stmt;
        if (stmt._next) return QueryPagingEngine.findOrderByStatement(stmt._next as Record<string, unknown>);
        return null;
    }

    // ════════════════════════════════════════════════════════════════════
    // Regex-based paging (fallback)
    // ════════════════════════════════════════════════════════════════════

    private static wrapViaRegex(
        sql: string,
        startRow: number,
        maxRows: number,
        platform: DatabasePlatform,
    ): PagingWrappedSQL {
        const { ctePrefix, mainSelect } = QueryPagingEngine.splitCTEAndSelect(sql);
        const { sqlWithoutOrder, orderByClause } = QueryPagingEngine.extractOrderBy(mainSelect);
        const { sql: cleanSelect } = QueryPagingEngine.stripTopClause(sqlWithoutOrder);

        const pagingCTEName = QueryPagingEngine.quoteIdentifier('__paged', platform);
        const existingCTEs = ctePrefix ? ctePrefix + ',\n' : 'WITH ';
        const cteChain = `${existingCTEs}${pagingCTEName} AS (\n${cleanSelect}\n)`;

        const rawOrderBy = orderByClause || QueryPagingEngine.defaultOrderBy(platform);
        const outerOrderBy = orderByClause
            ? QueryPagingEngine.remapOrderByToProjectedNames(rawOrderBy, cleanSelect)
            : rawOrderBy;

        const pagingClause = QueryPagingEngine.buildPagingClause(startRow, maxRows, platform);
        const dataSQL = `${cteChain}\nSELECT * FROM ${pagingCTEName}\nORDER BY ${outerOrderBy}\n${pagingClause}`;
        const countSQL = `${cteChain}\nSELECT COUNT(*) AS TotalRowCount FROM ${pagingCTEName}`;

        return { DataSQL: dataSQL, CountSQL: countSQL, Offset: startRow, PageSize: maxRows };
    }

    // ════════════════════════════════════════════════════════════════════
    // Regex helpers (used by fallback path)
    // ════════════════════════════════════════════════════════════════════

    static splitCTEAndSelect(sql: string): { ctePrefix: string; mainSelect: string } {
        const trimmed = sql.trim();
        if (!/^WITH\s/i.test(trimmed)) {
            return { ctePrefix: '', mainSelect: trimmed };
        }

        let depth = 0;
        let lastCTEEnd = -1;
        let i = 0;
        const withMatch = trimmed.match(/^WITH\s+/i);
        if (!withMatch) return { ctePrefix: '', mainSelect: trimmed };
        i = withMatch[0].length;

        while (i < trimmed.length) {
            const ch = trimmed[i];
            if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    lastCTEEnd = i;
                    const rest = trimmed.substring(i + 1).trimStart();
                    if (rest.startsWith(',')) {
                        i = trimmed.indexOf(',', i + 1) + 1;
                        continue;
                    }
                    break;
                }
            } else if (ch === "'" && depth > 0) {
                i++;
                while (i < trimmed.length && trimmed[i] !== "'") {
                    if (trimmed[i] === "'" && i + 1 < trimmed.length && trimmed[i + 1] === "'") {
                        i += 2;
                    } else {
                        i++;
                    }
                }
            }
            i++;
        }

        if (lastCTEEnd === -1) return { ctePrefix: '', mainSelect: trimmed };
        return {
            ctePrefix: trimmed.substring(0, lastCTEEnd + 1).trim(),
            mainSelect: trimmed.substring(lastCTEEnd + 1).trim(),
        };
    }

    static extractOrderBy(sql: string): { sqlWithoutOrder: string; orderByClause: string | null } {
        const upperSQL = sql.toUpperCase();
        let depth = 0;
        let lastOrderByPos = -1;

        for (let i = 0; i < sql.length; i++) {
            const ch = sql[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (depth === 0 && i + 8 <= sql.length) {
                if (upperSQL.substring(i, i + 8) === 'ORDER BY') {
                    if (i === 0 || /\s/.test(sql[i - 1])) {
                        lastOrderByPos = i;
                    }
                }
            }
        }

        if (lastOrderByPos === -1) {
            return { sqlWithoutOrder: sql, orderByClause: null };
        }

        return {
            orderByClause: sql.substring(lastOrderByPos + 9).trim(),
            sqlWithoutOrder: sql.substring(0, lastOrderByPos).trim(),
        };
    }

    static stripTopClause(sql: string): { sql: string; topRemoved: boolean } {
        const topRegex = /^(SELECT\s+(?:DISTINCT\s+)?)TOP\s+(?:\(\s*\d+\s*\)|\d+)\s+/i;
        const match = sql.match(topRegex);
        if (!match) return { sql, topRemoved: false };
        return { sql: match[1] + sql.substring(match[0].length), topRemoved: true };
    }

    // ════════════════════════════════════════════════════════════════════
    // Shared helpers
    // ════════════════════════════════════════════════════════════════════

    private static quoteIdentifier(name: string, platform: DatabasePlatform): string {
        return platform === 'postgresql' ? `"${name}"` : `[${name}]`;
    }

    private static buildPagingClause(startRow: number, maxRows: number, platform: DatabasePlatform): string {
        return platform === 'postgresql'
            ? `LIMIT ${maxRows} OFFSET ${startRow}`
            : `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }

    static remapOrderByToProjectedNames(orderByClause: string, selectSQL: string): string {
        const aliasMap = QueryPagingEngine.buildSelectAliasMap(selectSQL);
        const terms = QueryPagingEngine.splitAtTopLevelCommas(orderByClause);

        const remapped = terms.map(term => {
            const trimmed = term.trim();
            const dirMatch = trimmed.match(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?\s*$/i);
            const expr = dirMatch ? trimmed.substring(0, dirMatch.index!).trim() : trimmed;
            const direction = dirMatch ? dirMatch[0] : '';

            // Strip bracket/backtick/double-quote quoting for normalized matching.
            // The AST path produces [bracket]-quoted identifiers, while the alias map
            // may use either quoted or unquoted forms.
            const unquoted = expr.replace(/\[([^\]]+)\]/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/"([^"]+)"/g, '$1');
            const normalizedExpr = unquoted.replace(/\s+/g, ' ').trim();

            // 1. Try exact match against SELECT expressions
            const exactMatch = aliasMap.get(normalizedExpr.toUpperCase());
            if (exactMatch) return exactMatch + direction;

            // 2. Strip table alias prefixes (handles both quoted and unquoted)
            const stripped = normalizedExpr.replace(/\b[a-zA-Z_]\w*\./g, '');
            const strippedMatch = aliasMap.get(stripped.toUpperCase());
            if (strippedMatch) return strippedMatch + direction;

            // 3. Simple table.column — return just the column name
            const dotMatch = normalizedExpr.match(/^[a-zA-Z_]\w*\.([a-zA-Z_]\w*)$/);
            if (dotMatch) return dotMatch[1] + direction;

            // 4. Fallback: return stripped expression
            return stripped + direction;
        });

        return remapped.join(', ');
    }

    private static buildSelectAliasMap(selectSQL: string): Map<string, string> {
        const map = new Map<string, string>();
        const stripped = selectSQL.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/i, '');
        const selectMatch = stripped.match(/^SELECT\s+(?:DISTINCT\s+)?/i);
        if (!selectMatch) return map;

        const afterSelect = stripped.substring(selectMatch[0].length);
        const upperAfter = afterSelect.toUpperCase();
        let depth = 0;
        let fromPos = -1;
        for (let i = 0; i < afterSelect.length; i++) {
            const ch = afterSelect[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (depth === 0 && i + 5 <= afterSelect.length) {
                if (upperAfter.substring(i, i + 5) === 'FROM ' || upperAfter.substring(i, i + 5) === 'FROM\n' || upperAfter.substring(i, i + 5) === 'FROM\t') {
                    if (i === 0 || /\s/.test(afterSelect[i - 1])) { fromPos = i; break; }
                }
            }
        }

        const columnList = fromPos === -1 ? afterSelect : afterSelect.substring(0, fromPos);
        for (const item of QueryPagingEngine.splitAtTopLevelCommas(columnList)) {
            const trimmedItem = item.trim();
            if (!trimmedItem) continue;
            const asMatch = trimmedItem.match(/\s+AS\s+(\[?\w+\]?)\s*$/i);
            if (asMatch) {
                const exprPart = trimmedItem.substring(0, asMatch.index!).trim();
                const alias = asMatch[1].replace(/[[\]]/g, '');
                const normalizedExpr = exprPart.replace(/\s+/g, ' ').toUpperCase();
                map.set(normalizedExpr, alias);
                const strippedExpr = normalizedExpr.replace(/\b[A-Z_]\w*\./g, '');
                if (strippedExpr !== normalizedExpr) map.set(strippedExpr, alias);
            }
        }
        return map;
    }

    private static splitAtTopLevelCommas(sql: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < sql.length; i++) {
            const ch = sql[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) { parts.push(sql.substring(start, i)); start = i + 1; }
        }
        parts.push(sql.substring(start));
        return parts;
    }

    private static defaultOrderBy(platform: DatabasePlatform): string {
        return platform === 'postgresql' ? '1' : '(SELECT NULL)';
    }
}
