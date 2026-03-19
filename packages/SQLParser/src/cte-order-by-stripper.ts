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
 * 2. AST path — parse (with Nunjucks preprocessing if needed), check if ORDER BY is legal
 *    (TOP/OFFSET/FOR XML via AST nodes), null out orderby if not, regenerate.
 *    Handles window functions, UNION/EXCEPT, subqueries, string literals, and Nunjucks templates.
 * 3. Regex fallback — paren-depth heuristic for SQL the parser still can't handle
 *    (e.g. STRING_AGG WITHIN GROUP)
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

    // Tier 2: AST-based stripping (handles window functions, UNION, TOP/OFFSET/FOR XML, string literals)
    const astResult = stripOrderByViaAST(trimmed);
    if (astResult !== null) return astResult;

    // Tier 3: Regex fallback for SQL the AST parser still can't handle
    // (e.g. STRING_AGG WITHIN GROUP syntax that node-sql-parser doesn't support)
    return stripOrderByViaRegex(trimmed);
}

// ─────────────────────────────────────────────────────────────────
// Tier 2: AST-based ORDER BY stripping
// ─────────────────────────────────────────────────────────────────

/**
 * Attempts to strip the top-level ORDER BY clause using AST parsing.
 * Tries direct parsing first, then Nunjucks-preprocessed parsing if the SQL
 * contains template syntax. Handles UNION/EXCEPT by walking the _next chain.
 * Returns null if the parser cannot handle the SQL (caller should fall back to regex).
 */
function stripOrderByViaAST(sql: string): string | null {
    // Attempt 1: Parse the SQL directly
    const directResult = tryASTStrip(sql);
    if (directResult !== null) return directResult;

    // Attempt 2: If SQL contains Nunjucks-like syntax, preprocess templates
    // and use AST analysis on the preprocessed SQL to guide stripping on the original
    if (containsNunjucksSyntax(sql)) {
        return tryNunjucksAwareStrip(sql);
    }

    return null;
}

/**
 * Core AST stripping: parse, analyze, and regenerate SQL without ORDER BY.
 * Returns null if parsing fails.
 */
function tryASTStrip(sql: string): string | null {
    try {
        const parser = new Parser();
        const ast = parser.astify(sql, { database: 'TransactSQL' });
        const stmt = Array.isArray(ast) ? ast[0] : ast;

        if (!stmt) return sql;

        const stmtRecord = stmt as unknown as Record<string, unknown>;

        // For UNION/EXCEPT/INTERSECT queries, ORDER BY lives on the last statement in the _next chain
        const orderByStmt = findOrderByStatement(stmtRecord);

        // If no statement in the chain has orderby, nothing to strip
        if (!orderByStmt) return sql;

        // Check if ORDER BY is legal via AST structure
        if (isOrderByLegalInCTE(orderByStmt)) return sql;

        // Remove the orderby node and regenerate SQL
        orderByStmt.orderby = null;
        const regenerated = parser.sqlify(Array.isArray(ast) ? ast : [stmt], { database: 'TransactSQL' });

        return regenerated;
    } catch {
        return null;
    }
}

/**
 * Walks the _next chain (UNION/EXCEPT/INTERSECT) to find the statement
 * that carries the ORDER BY clause. In standard SQL, ORDER BY on a set
 * operation applies to the entire result and lives on the last statement.
 * Returns null if no statement has orderby.
 */
function findOrderByStatement(stmt: Record<string, unknown>): Record<string, unknown> | null {
    // Check the current statement first
    if (stmt.orderby) return stmt;

    // Walk UNION/EXCEPT/INTERSECT chain
    if (stmt._next) {
        return findOrderByStatement(stmt._next as Record<string, unknown>);
    }

    return null;
}

/**
 * Nunjucks-aware ORDER BY stripping for template SQL.
 *
 * Strategy: preprocess Nunjucks templates into valid SQL placeholders, parse
 * the preprocessed SQL to determine if a top-level ORDER BY exists and whether
 * it's legal. If stripping is needed, use a targeted regex on the original SQL
 * (preserving template syntax) guided by AST knowledge.
 *
 * This avoids the blind greedy regex that can't distinguish window function
 * ORDER BY from trailing ORDER BY.
 */
function tryNunjucksAwareStrip(sql: string): string | null {
    const preprocessed = preprocessNunjucks(sql);

    try {
        const parser = new Parser();
        const ast = parser.astify(preprocessed, { database: 'TransactSQL' });
        const stmt = Array.isArray(ast) ? ast[0] : ast;
        if (!stmt) return sql;

        const stmtRecord = stmt as unknown as Record<string, unknown>;
        const orderByStmt = findOrderByStatement(stmtRecord);

        // No ORDER BY in the preprocessed AST → original is fine
        if (!orderByStmt) return sql;

        // ORDER BY is legal (TOP/OFFSET/FOR XML) → keep it
        if (isOrderByLegalInCTE(orderByStmt)) return sql;

        // AST confirms there's an illegal top-level ORDER BY.
        // Use the AST's orderby position info to strip from the original SQL.
        // The orderby array tells us the column expressions used; we find the
        // last top-level ORDER BY in the original and strip from there.
        return stripLastTopLevelOrderBy(sql);
    } catch {
        // Preprocessed SQL still can't be parsed — fall through to regex
        return null;
    }
}

/**
 * Strips the last top-level ORDER BY clause from SQL using position-aware scanning.
 * Unlike the simple greedy regex, this scans backwards from the end to find the last
 * ORDER BY that is at paren depth 0 and outside string literals/comments.
 */
function stripLastTopLevelOrderBy(sql: string): string {
    // Scan the SQL to find all top-level ORDER BY positions
    const positions = findTopLevelOrderByPositions(sql);
    if (positions.length === 0) return sql;

    // Strip from the last top-level ORDER BY position
    const lastPos = positions[positions.length - 1];
    return sql.substring(0, lastPos).trimEnd();
}

/**
 * Finds the character positions of all ORDER BY keywords that are at the
 * outermost level (paren depth 0, not inside strings or comments).
 */
function findTopLevelOrderByPositions(sql: string): number[] {
    const positions: number[] = [];
    let i = 0;
    let parenDepth = 0;

    while (i < sql.length) {
        // Skip single-quoted string literals
        if (sql[i] === "'") {
            i++;
            while (i < sql.length) {
                if (sql[i] === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
                    i += 2; // escaped quote
                } else if (sql[i] === "'") {
                    i++;
                    break;
                } else {
                    i++;
                }
            }
            continue;
        }

        // Skip single-line comments
        if (sql[i] === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') i++;
            continue;
        }

        // Skip block comments
        if (sql[i] === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
            i += 2;
            while (i < sql.length) {
                if (sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        // Skip Nunjucks block tags {% ... %}
        if (sql[i] === '{' && i + 1 < sql.length && sql[i + 1] === '%') {
            i += 2;
            while (i < sql.length) {
                if (sql[i] === '%' && i + 1 < sql.length && sql[i + 1] === '}') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        // Skip Nunjucks expression tags {{ ... }}
        if (sql[i] === '{' && i + 1 < sql.length && sql[i + 1] === '{') {
            i += 2;
            while (i < sql.length) {
                if (sql[i] === '}' && i + 1 < sql.length && sql[i + 1] === '}') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }

        // Track parenthesis depth
        if (sql[i] === '(') { parenDepth++; i++; continue; }
        if (sql[i] === ')') { parenDepth--; i++; continue; }

        // Check for ORDER BY keyword at paren depth 0
        if (parenDepth === 0 && /^ORDER\s+BY\b/i.test(sql.substring(i))) {
            // Verify it's a word boundary before ORDER (not part of another word)
            if (i === 0 || /[\s,;()\n]/.test(sql[i - 1])) {
                positions.push(i);
            }
        }

        i++;
    }

    return positions;
}

// ─────────────────────────────────────────────────────────────────
// Nunjucks preprocessing
// ─────────────────────────────────────────────────────────────────

/** Quick check for Nunjucks-like syntax in SQL */
function containsNunjucksSyntax(sql: string): boolean {
    return /\{[%{#]/.test(sql);
}

/**
 * Preprocesses Nunjucks templates into valid SQL for AST parsing.
 * Replaces {{ var }}, {{ var | filter }}, {% if %}, {% endif %}, etc.
 * with safe placeholder values.
 */
function preprocessNunjucks(sql: string): string {
    let processed = sql;

    // Replace {{ variable | filter }} patterns with appropriate placeholders
    processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlString\s*\}\}/g, "'placeholder'");
    processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlNumber\s*\}\}/g, '0');
    processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlDate\s*\}\}/g, "'2000-01-01'");
    processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlIn\s*\}\}/g, "('placeholder')");
    processed = processed.replace(/\{\{\s*[\w.]+\s*\|\s*sqlIdentifier\s*\}\}/g, 'placeholder');
    // Generic {{ var }} or {{ var | unknownFilter }}
    processed = processed.replace(/\{\{\s*[\w.]+\s*(?:\|[^}]*)?\}\}/g, "'placeholder'");

    // Remove block tags but keep content between them
    processed = processed.replace(/\{%[-\s]*if\s+[^%]*[-\s]*%\}/g, '');
    processed = processed.replace(/\{%[-\s]*endif[-\s]*%\}/g, '');
    processed = processed.replace(/\{%[-\s]*else[-\s]*%\}/g, '');
    processed = processed.replace(/\{%[-\s]*elif\s+[^%]*[-\s]*%\}/g, '');
    processed = processed.replace(/\{%[-\s]*for\s+[^%]*[-\s]*%\}/g, '');
    processed = processed.replace(/\{%[-\s]*endfor[-\s]*%\}/g, '');
    processed = processed.replace(/\{%[-\s]*set\s+[^%]*[-\s]*%\}/g, '');
    processed = processed.replace(/\{#[^#]*#\}/g, ''); // Nunjucks comments

    return processed;
}

// ─────────────────────────────────────────────────────────────────
// AST analysis helpers
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// Tier 3: Regex fallback
// ─────────────────────────────────────────────────────────────────

/**
 * Regex-based fallback for stripping trailing ORDER BY.
 * Uses parenthesis depth counting to avoid stripping ORDER BY inside subqueries.
 * Less precise than AST (can't distinguish window functions at the end of SELECT lists)
 * but handles SQL the parser can't parse (e.g. STRING_AGG WITHIN GROUP syntax).
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
