import { SQLParser } from './sql-parser.js';
import type { SQLParserDialect } from '@memberjunction/sql-dialect';

/**
 * Result of analyzing a SQL string for top-level ORDER BY clauses.
 */
export interface OrderByAnalysis {
    /** Character positions of all top-level ORDER BY keywords in the original SQL */
    Positions: number[];
    /** SQL with the last top-level ORDER BY clause stripped (or original if none found) */
    SqlWithoutOrderBy: string;
    /** The extracted ORDER BY clause text (everything after "ORDER BY "), or null if none */
    OrderByClause: string | null;
    /** Whether the ORDER BY is legal in CTE context (TOP, OFFSET, or FOR XML present) */
    IsLegalInCTE: boolean;
}

/**
 * Shared ORDER BY analysis for both the composition engine and the paging engine.
 *
 * Uses a two-tier strategy:
 *   **Tier 1**: `node-sql-parser` AST parsing (with Nunjucks placeholder preprocessing
 *   if MJ tokens are detected). Most accurate; handles UNION/EXCEPT chains, window
 *   functions, and CTE-internal ORDER BYs via the AST.
 *
 *   **Tier 2**: `MJLexer.Tokenize` → scan `SQL_TEXT` tokens with **carried**
 *   `inString` / `inBlockComment` / `inLineComment` state across MJ token boundaries.
 *   Fixes Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection).
 *
 * This utility is the single implementation of ORDER BY analysis shared by both
 * `queryCompositionEngine.ts` and `queryPagingEngine.ts`. Both engines delegate
 * here instead of maintaining separate scanners.
 */

// ════════════════════════════════════════════════════════════════════
// Public API
// ════════════════════════════════════════════════════════════════════

/**
 * Analyzes SQL for top-level ORDER BY clauses, handling both SQL+Nunjucks
 * (composition engine's input) and clean SQL (paging engine's input).
 *
 * @param sql - SQL to analyze (may contain MJ template tokens)
 * @param parserDialect - node-sql-parser dialect ('TransactSQL' or 'PostgresQL')
 * @returns Full analysis including positions, stripped SQL, and CTE legality
 */
export function AnalyzeTopLevelOrderBy(
    sql: string,
    dialect: SQLParserDialect
): OrderByAnalysis {
    if (!sql || sql.trim().length === 0) {
        return { Positions: [], SqlWithoutOrderBy: sql, OrderByClause: null, IsLegalInCTE: false };
    }

    const trimmed = sql.trimEnd();

    // Fast exit: no ORDER keyword anywhere → no ORDER BY to analyze
    if (!/ORDER/i.test(trimmed)) {
        return { Positions: [], SqlWithoutOrderBy: sql, OrderByClause: null, IsLegalInCTE: false };
    }

    // Tier 1: AST-based analysis
    const astResult = analyzeViaAST(trimmed, dialect);
    if (astResult !== null) return astResult;

    // Tier 2: MJLexer-based scanner (handles SQL+Nunjucks, carries state across token boundaries)
    return analyzeViaScanner(trimmed, sql);
}

/**
 * Checks whether the given SQL has any top-level ORDER BY clause.
 * Convenience wrapper around {@link AnalyzeTopLevelOrderBy}.
 */
export function HasTopLevelOrderBy(sql: string, dialect: SQLParserDialect): boolean {
    return AnalyzeTopLevelOrderBy(sql, dialect).Positions.length > 0;
}

/**
 * Extracts the ORDER BY clause and returns SQL without it.
 * Convenience wrapper around {@link AnalyzeTopLevelOrderBy}.
 */
export function ExtractOrderBy(
    sql: string,
    dialect: SQLParserDialect
): { sqlWithoutOrder: string; orderByClause: string | null } {
    const analysis = AnalyzeTopLevelOrderBy(sql, dialect);
    return { sqlWithoutOrder: analysis.SqlWithoutOrderBy, orderByClause: analysis.OrderByClause };
}

// ════════════════════════════════════════════════════════════════════
// Tier 1: AST-based analysis
// ════════════════════════════════════════════════════════════════════

/**
 * Attempts to analyze ORDER BY via node-sql-parser AST.
 * Returns null if parsing fails (caller should fall back to Tier 2).
 */
function analyzeViaAST(sql: string, dialect: SQLParserDialect): OrderByAnalysis | null {
    // Try direct parsing first
    const directResult = tryDirectAST(sql, dialect);
    if (directResult !== null) return directResult;

    // If MJ extensions detected, try with Nunjucks preprocessing
    const mjParse = SQLParser.Analyze(sql);
    if (mjParse.hasMJExtensions) {
        return tryNunjucksAwareAST(sql, dialect);
    }

    return null;
}

/**
 * Direct AST parsing attempt — works for clean SQL without MJ tokens.
 */
function tryDirectAST(sql: string, dialect: SQLParserDialect): OrderByAnalysis | null {
    try {
        const ast = SQLParser.ParseSQL(sql, dialect);
        if (!ast) return null;

        const stmt = Array.isArray(ast) ? ast[0] : ast;
        if (!stmt) return buildNoOrderByResult(sql);

        return buildASTAnalysis(stmt as unknown as Record<string, unknown>, sql);
    } catch {
        return null;
    }
}

/**
 * Nunjucks-preprocessed AST parsing — substitutes MJ tokens with safe
 * placeholders, parses the resulting clean SQL, then maps results back.
 */
function tryNunjucksAwareAST(sql: string, dialect: SQLParserDialect): OrderByAnalysis | null {
    const preprocessed = SQLParser.Substitute(sql).cleanSQL;

    try {
        const ast = SQLParser.ParseSQL(preprocessed, dialect);
        if (!ast) return null;

        const stmt = Array.isArray(ast) ? ast[0] : ast;
        if (!stmt) return buildNoOrderByResult(sql);

        const stmtRecord = stmt as unknown as Record<string, unknown>;
        const orderByStmt = findOrderByStatement(stmtRecord);
        if (!orderByStmt) return buildNoOrderByResult(sql);

        const isLegal = isOrderByLegalInCTE(orderByStmt);
        if (isLegal) {
            // ORDER BY is legal — find positions via scanner for completeness
            const positions = findTopLevelOrderByPositions(sql);
            return {
                Positions: positions,
                SqlWithoutOrderBy: sql,
                OrderByClause: extractOrderByClauseText(sql, positions),
                IsLegalInCTE: true,
            };
        }

        // ORDER BY should be stripped — use scanner to find exact position
        const positions = findTopLevelOrderByPositions(sql);
        if (positions.length === 0) {
            // AST says ORDER BY exists, scanner can't find it — inconsistency
            // Fall back to no-op to avoid data loss
            return null;
        }

        return buildStrippedResult(sql, positions);
    } catch {
        return null;
    }
}

/**
 * Builds the analysis result from an AST statement.
 *
 * Uses AST only for detection (does ORDER BY exist? is it legal in CTE?).
 * Always uses position-based stripping to preserve original SQL formatting —
 * AST regeneration via `SqlifyAST` changes formatting (e.g., adds bracket
 * quoting, normalizes whitespace) which breaks callers that expect the
 * original SQL text to be preserved.
 */
function buildASTAnalysis(
    stmt: Record<string, unknown>,
    sql: string,
): OrderByAnalysis {
    const orderByStmt = findOrderByStatement(stmt);
    if (!orderByStmt) return buildNoOrderByResult(sql);

    const isLegal = isOrderByLegalInCTE(orderByStmt);

    // Use scanner for precise character positions
    const positions = findTopLevelOrderByPositions(sql);

    if (isLegal || positions.length === 0) {
        return {
            Positions: positions,
            SqlWithoutOrderBy: sql,
            OrderByClause: extractOrderByClauseText(sql, positions),
            IsLegalInCTE: isLegal,
        };
    }

    // Always use position-based stripping to preserve original formatting
    return buildStrippedResult(sql, positions);
}

// ════════════════════════════════════════════════════════════════════
// Tier 2: MJLexer-based scanner
// ════════════════════════════════════════════════════════════════════

/**
 * Scans SQL using MJLexer tokens with carried lexical state across MJ token
 * boundaries. This is the Bug D fix: `inString`, `inBlockComment`, and
 * `inLineComment` persist across SQL_TEXT token boundaries so that patterns
 * like `'{{ MembershipType }}'` (Nunjucks inside a SQL string literal) don't
 * break ORDER BY detection.
 */
function analyzeViaScanner(trimmed: string, originalSQL: string): OrderByAnalysis {
    const positions = findTopLevelOrderByPositions(trimmed);

    if (positions.length === 0) {
        return { Positions: [], SqlWithoutOrderBy: originalSQL, OrderByClause: null, IsLegalInCTE: false };
    }

    return buildStrippedResult(trimmed, positions);
}

/**
 * Finds character positions of all top-level ORDER BY keywords.
 *
 * Uses MJLexer to tokenize the SQL, then scans SQL_TEXT tokens while carrying
 * `inString`, `inBlockComment`, `inLineComment`, and `parenDepth` state
 * across MJ token boundaries.
 */
function findTopLevelOrderByPositions(sql: string): number[] {
    const tokens = SQLParser.Tokenize(sql);
    const positions: number[] = [];
    let parenDepth = 0;
    let inString = false;
    let inBlockComment = false;
    let inLineComment = false;

    for (const token of tokens) {
        if (token.type !== 'SQL_TEXT') {
            // MJ tokens reset line comment state (an MJ token can't be inside a line comment)
            inLineComment = false;
            continue;
        }

        const text = token.raw;
        let i = 0;

        while (i < text.length) {
            const ch = text[i];

            if (inBlockComment) {
                if (ch === '*' && i + 1 < text.length && text[i + 1] === '/') {
                    inBlockComment = false;
                    i += 2;
                } else {
                    i++;
                }
                continue;
            }

            if (inLineComment) {
                if (ch === '\n') { inLineComment = false; }
                i++;
                continue;
            }

            if (inString) {
                if (ch === "'" && i + 1 < text.length && text[i + 1] === "'") { i += 2; }
                else if (ch === "'") { inString = false; i++; }
                else { i++; }
                continue;
            }

            if (ch === "'") { inString = true; i++; continue; }

            // Skip bracket-quoted identifiers: [Order By Description] etc.
            // These don't carry across MJ token boundaries in practice.
            if (ch === '[') {
                i++;
                while (i < text.length && text[i] !== ']') i++;
                if (i < text.length) i++;
                continue;
            }
            // Skip double-quoted identifiers: "Order" etc.
            if (ch === '"') {
                i++;
                while (i < text.length && text[i] !== '"') i++;
                if (i < text.length) i++;
                continue;
            }

            if (ch === '-' && i + 1 < text.length && text[i + 1] === '-') {
                inLineComment = true;
                i += 2;
                continue;
            }
            if (ch === '/' && i + 1 < text.length && text[i + 1] === '*') {
                inBlockComment = true;
                i += 2;
                continue;
            }

            if (ch === '(') { parenDepth++; i++; continue; }
            if (ch === ')') { parenDepth--; i++; continue; }

            if (parenDepth === 0 && /^ORDER\s+BY\b/i.test(text.substring(i))) {
                const absPos = token.start + i;
                if (absPos === 0 || /[\s,;()\n]/.test(sql[absPos - 1])) {
                    positions.push(absPos);
                }
            }
            i++;
        }
    }

    return positions;
}

// ════════════════════════════════════════════════════════════════════
// AST helpers (shared between composition and paging engines)
// ════════════════════════════════════════════════════════════════════

/**
 * Walks the `_next` chain (UNION/EXCEPT/INTERSECT) to find the statement
 * that carries the ORDER BY clause. This is the single shared implementation
 * replacing the duplicated versions in both engines.
 */
export function findOrderByStatement(stmt: Record<string, unknown>): Record<string, unknown> | null {
    if (stmt.orderby) return stmt;
    if (stmt._next) return findOrderByStatement(stmt._next as Record<string, unknown>);
    return null;
}

/**
 * Checks AST properties to determine if ORDER BY is legal in a CTE context.
 * TOP, OFFSET/LIMIT, or FOR XML make ORDER BY legal inside a CTE.
 */
export function isOrderByLegalInCTE(stmt: Record<string, unknown>): boolean {
    if (stmt.top) return true;
    if (stmt.limit) return true;
    if (stmt.offset) return true;

    const forClause = stmt.for as Record<string, unknown> | null | undefined;
    if (forClause && typeof forClause === 'object' && forClause.type &&
        String(forClause.type).toLowerCase().includes('xml')) {
        return true;
    }

    return false;
}

// ════════════════════════════════════════════════════════════════════
// Result builders
// ════════════════════════════════════════════════════════════════════

function buildNoOrderByResult(sql: string): OrderByAnalysis {
    return { Positions: [], SqlWithoutOrderBy: sql, OrderByClause: null, IsLegalInCTE: false };
}

function buildStrippedResult(sql: string, positions: number[]): OrderByAnalysis {
    const lastPos = positions[positions.length - 1];
    return {
        Positions: positions,
        SqlWithoutOrderBy: sql.substring(0, lastPos).trimEnd(),
        OrderByClause: extractOrderByClauseText(sql, positions),
        IsLegalInCTE: false,
    };
}

function extractOrderByClauseText(sql: string, positions: number[]): string | null {
    if (positions.length === 0) return null;
    const lastPos = positions[positions.length - 1];
    // Skip past "ORDER BY " (8 chars for "ORDER BY" + whitespace)
    const afterKeyword = sql.substring(lastPos).replace(/^ORDER\s+BY\s+/i, '');
    return afterKeyword.trim() || null;
}
