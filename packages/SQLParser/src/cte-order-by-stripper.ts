import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import type { SQLDialect } from '@memberjunction/sql-dialect';

/**
 * Strips a trailing ORDER BY clause from SQL that will be wrapped in a CTE.
 *
 * SQL Server disallows ORDER BY inside CTEs unless TOP, OFFSET, or FOR XML is also present.
 * PostgreSQL allows ORDER BY in CTEs, so no stripping is needed there.
 *
 * Uses a 3-tier strategy:
 * 1. Fast exit — no ORDER keyword at all, or dialect allows ORDER BY in CTEs
 * 2. AST path — parse, check if ORDER BY is legal (TOP/OFFSET/FOR XML via AST nodes),
 *    null out orderby if not, regenerate. Handles window functions, STRING_AGG, etc.
 * 3. Regex fallback — paren-depth heuristic for SQL the parser can't handle (e.g. Nunjucks templates)
 *
 * @param sql The SQL statement to strip ORDER BY from
 * @param dialect The SQLDialect for the target database platform
 * @returns The SQL with trailing ORDER BY removed (if applicable)
 */
export function stripOrderByForCTE(sql: string, dialect: SQLDialect): string {
    if (!sql) return sql;

    // Tier 1: Fast exit — no ORDER keyword at all
    const trimmed = sql.trimEnd();
    if (!/ORDER/i.test(trimmed)) return sql;

    // Tier 1b: Dialect check — platform allows ORDER BY in CTEs (e.g. PostgreSQL)
    if (dialect.AllowsOrderByInCTE) return sql;

    // Tier 2: AST-based stripping (handles window functions, TOP/OFFSET/FOR XML, string literals)
    const astResult = stripOrderByViaAST(trimmed);
    if (astResult !== null) return astResult;

    // Tier 3: Regex fallback for SQL the AST parser can't handle (Nunjucks templates, exotic syntax)
    return stripOrderByViaRegex(trimmed);
}

/**
 * Attempts to strip the top-level ORDER BY clause using AST parsing.
 * Checks AST nodes for TOP, OFFSET/FETCH, and FOR XML to determine if ORDER BY is legal.
 * Returns null if the parser cannot handle the SQL (caller should fall back to regex).
 */
function stripOrderByViaAST(sql: string): string | null {
    try {
        const parser = new Parser();
        const ast = parser.astify(sql, { database: 'TransactSQL' });
        const stmt = Array.isArray(ast) ? ast[0] : ast;

        if (!stmt) return sql;

        const stmtRecord = stmt as unknown as Record<string, unknown>;

        // If the AST has no orderby node, nothing to strip
        if (!stmtRecord.orderby) return sql;

        // Check if ORDER BY is legal via AST structure (not regex):
        // - TOP present (e.g. SELECT TOP 10 ... ORDER BY)
        // - OFFSET/FETCH present (e.g. ORDER BY ... OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY)
        // - FOR XML present (e.g. ORDER BY ... FOR XML PATH)
        if (isOrderByLegalInCTE(stmtRecord)) return sql;

        // Remove the orderby node and regenerate SQL
        stmtRecord.orderby = null;
        const regenerated = parser.sqlify(Array.isArray(ast) ? ast : [stmt], { database: 'TransactSQL' });

        return regenerated;
    } catch {
        // AST parsing failed — signal fallback to regex
        return null;
    }
}

/**
 * Checks AST properties to determine if ORDER BY is legal in a CTE context.
 * SQL Server allows ORDER BY in CTEs when TOP, OFFSET/FETCH, or FOR XML is present.
 */
function isOrderByLegalInCTE(stmt: Record<string, unknown>): boolean {
    // TOP clause present (SELECT TOP N ... ORDER BY)
    if (stmt.top) return true;

    // OFFSET/FETCH clause present (ORDER BY ... OFFSET N ROWS FETCH NEXT M ROWS ONLY)
    if (stmt.limit) return true;

    // FOR XML clause present (ORDER BY ... FOR XML PATH/RAW/AUTO)
    const forClause = stmt.for as Record<string, unknown> | null | undefined;
    if (forClause && typeof forClause === 'object' && forClause.type &&
        String(forClause.type).toLowerCase().includes('xml')) {
        return true;
    }

    return false;
}

/**
 * Regex-based fallback for stripping trailing ORDER BY.
 * Uses parenthesis depth counting to avoid stripping ORDER BY inside subqueries.
 * Less precise than AST (can't distinguish window functions at the end of SELECT lists)
 * but handles SQL the parser can't parse (e.g. Nunjucks template syntax).
 */
function stripOrderByViaRegex(sql: string): string {
    const orderByMatch = sql.match(/\bORDER\s+BY\s+[\s\S]+$/i);
    if (!orderByMatch) return sql;

    // Only strip if the ORDER BY is at the outermost level (paren depth = 0)
    const beforeOrderBy = sql.substring(0, orderByMatch.index);
    let parenDepth = 0;
    for (const ch of beforeOrderBy) {
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
    }

    if (parenDepth !== 0) return sql;

    return sql.substring(0, orderByMatch.index).trimEnd();
}
