/**
 * The node-sql-parser plumbing behind the frozen, AST-typed `SQLParser` members (`Astify`,
 * `ParseSQL`, `SqlifyAST`, `ExprToSQL`, the instance API). The code is kept exactly as those
 * members have always run it, so their output cannot drift: the FOR XML directive workaround,
 * the rejection of statements misread as variable assignments, the niladic user-function retry
 * and the `(MAX)` serialization fix. Nothing new should be built on it.
 */
import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { IsKeyword, LexSQL, SignificantTokens } from '../sqlLexer.js';

/** Lexing rules for FOR XML, which only SQL Server has. */
const SQL_SERVER_LEXING: SQLParserDialect = new SQLServerDialect();

/** Lexing rules for PostgreSQL fallback token scans. */
const POSTGRES_LEXING: SQLParserDialect = new PostgreSQLDialect();

/**
 * Standard SQL niladic user functions written without parentheses in T-SQL and PostgreSQL
 * (`SELECT CURRENT_USER`, `SELECT SESSION_USER`, `SELECT SYSTEM_USER`). node-sql-parser's
 * T-SQL and PostgreSQL grammars require `()` on these three keywords even though the
 * databases themselves reject `()`.
 */
const NILADIC_USER_FUNCTIONS: ReadonlySet<string> = new Set([
    'CURRENT_USER',
    'SESSION_USER',
    'SYSTEM_USER',
]);

/** The FOR XML modes node-sql-parser knows. */
const FOR_XML_DIRECTIVES = ['PATH', 'RAW', 'AUTO', 'EXPLICIT'];

/**
 * Fixes a known node-sql-parser bug where CAST(x AS NVARCHAR(MAX)) is
 * serialized as CAST(x AS NVARCHARmax). Applies to NVARCHAR, VARCHAR,
 * and VARBINARY — all SQL Server types that accept (MAX).
 */
export function FixMaxTypeSerialization(sql: string): string {
    return sql.replace(/\b(N?VARCHAR|VARBINARY)max\b/gi, '$1(MAX)');
}

/**
 * Parse SQL safely, returning null on failure.
 *
 * Includes a workaround for node-sql-parser's inability to handle multi-directive
 * FOR XML clauses (e.g., `FOR XML PATH('M'), ROOT('R')`). The parser handles
 * `FOR XML PATH('M')` fine but chokes on the comma-separated directives.
 * We strip the extra directives before parsing and restore them on the AST's `for` property.
 */

export function NodeSqlParse(sql: string, dialect: string): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
    try {
        return NodeSqlAstifyChecked(sql, dialect);
    } catch {
        // If direct parse fails, try with FOR XML workaround
        const forXmlResult = stripForXmlDirectives(sql);
        if (forXmlResult) {
            try {
                const ast = NodeSqlAstifyChecked(forXmlResult.cleanedSQL, dialect);
                // Restore the original FOR XML clause on the AST
                restoreForXmlOnAST(ast, forXmlResult.originalForXml);
                return ast;
            } catch {
                return null;
            }
        }
        return null;
    }
}

/**
 * Parses with node-sql-parser and throws when the result is not a real reading of the SQL.
 *
 * The T-SQL grammar accepts some statements it cannot parse — notably a CTE with a
 * bracket-quoted name, `WITH [x] AS (…) SELECT …` — as a run of bare `name = value`
 * assignments (`WITH = [x]`, `AS = (…)`, `SELECT = …`). No real statement has that shape, so
 * such a result is treated as a parse failure and callers take their fallback paths instead
 * of reading a meaningless tree.
 */
export function NodeSqlAstifyChecked(sql: string, dialect: string): NodeSqlParser.AST | NodeSqlParser.AST[] {
    try {
        const ast = new Parser().astify(sql, { database: dialect });
        if (isMisreadAsAssignments(ast)) {
            throw new Error('SQLParser: the statement was read as variable assignments, not as SQL');
        }
        return ast;
    } catch (err) {
        const niladic = parenthesizeNiladicUserFunctions(sql, dialect);
        if (niladic.rewrittenNames.size === 0) throw err;
        const ast = new Parser().astify(niladic.rewritten, { database: dialect });
        if (isMisreadAsAssignments(ast)) {
            throw new Error('SQLParser: the statement was read as variable assignments, not as SQL');
        }
        stripNiladicUserFunctionArgs(ast, niladic.rewrittenNames);
        return ast;
    }
}

/**
 * Rewrites bare `CURRENT_USER`, `SESSION_USER`, and `SYSTEM_USER` keywords (outside strings,
 * comments, and quoted identifiers) to `CURRENT_USER()` / `SESSION_USER()` / `SYSTEM_USER()`
 * so node-sql-parser's T-SQL and PostgreSQL grammars accept them. Qualified column references
 * (`t.current_user`), aliases (`AS current_user`), and calls that already carry `()` are left
 * untouched.
 */
function parenthesizeNiladicUserFunctions(
    sql: string,
    parserDialect: string,
): { rewritten: string; rewrittenNames: Set<string> } {
    const rewrittenNames = new Set<string>();
    const lexDialect = /postgres/i.test(parserDialect) ? POSTGRES_LEXING : SQL_SERVER_LEXING;
    const tokens = SignificantTokens(LexSQL(sql, lexDialect));
    let out = '';
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const upper = t.Kind === 'word' ? t.Text.toUpperCase() : '';
        if (
            upper &&
            NILADIC_USER_FUNCTIONS.has(upper) &&
            tokens[i - 1]?.Kind !== 'dot' &&
            tokens[i + 1]?.Kind !== 'dot' &&
            tokens[i + 1]?.Kind !== 'open' &&
            !IsKeyword(tokens[i - 1], 'AS')
        ) {
            out += sql.substring(cursor, t.End) + '()';
            cursor = t.End;
            rewrittenNames.add(upper);
        }
    }
    if (rewrittenNames.size === 0) return { rewritten: sql, rewrittenNames };
    return { rewritten: out + sql.substring(cursor), rewrittenNames };
}

/**
 * Removes empty `args` from `CURRENT_USER` / `SESSION_USER` / `SYSTEM_USER` function AST nodes
 * produced by {@link parenthesizeNiladicUserFunctions}, matching the AST shape node-sql-parser
 * produces for `CURRENT_TIMESTAMP` so `SqlifyAST` emits the standard niladic form without `()`.
 */
function stripNiladicUserFunctionArgs(node: unknown, rewrittenNames: ReadonlySet<string>): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const item of node) stripNiladicUserFunctionArgs(item, rewrittenNames);
        return;
    }
    const obj = node as Record<string, unknown>;
    if (obj.type === 'function') {
        const fnName = extractFunctionNodeName(obj);
        const args = obj.args as { value?: unknown } | null | undefined;
        if (
            fnName &&
            rewrittenNames.has(fnName.toUpperCase()) &&
            args &&
            Array.isArray(args.value) &&
            args.value.length === 0
        ) {
            delete obj.args;
        }
    }
    for (const value of Object.values(obj)) {
        stripNiladicUserFunctionArgs(value, rewrittenNames);
    }
}

/** Extracts the simple function name from a node-sql-parser `function` AST node. */
function extractFunctionNodeName(fnNode: Record<string, unknown>): string | null {
    const rawName = fnNode.name;
    if (typeof rawName === 'string') return rawName;
    if (rawName && typeof rawName === 'object') {
        const inner = (rawName as Record<string, unknown>).name;
        if (typeof inner === 'string') return inner;
        if (Array.isArray(inner) && inner.length === 1) {
            const first = inner[0];
            if (typeof first === 'string') return first;
            if (first && typeof first === 'object' && typeof (first as Record<string, unknown>).value === 'string') {
                return (first as Record<string, unknown>).value as string;
            }
        }
    }
    return null;
}

/** Whether any top-level node is a bare assignment wrapper rather than a statement. */
function isMisreadAsAssignments(ast: NodeSqlParser.AST | NodeSqlParser.AST[]): boolean {
    const statements = Array.isArray(ast) ? ast : [ast];
    return statements.some(statement => {
        const node = statement as unknown as { type?: unknown; stmt?: { type?: unknown } } | null;
        return !node || (typeof node.type !== 'string' && node.stmt?.type === 'assign');
    });
}

/**
 * Detects FOR XML clauses that node-sql-parser can't handle and simplifies them.
 *
 * node-sql-parser handles: FOR XML PATH, FOR XML PATH('arg'), FOR XML RAW, FOR XML AUTO
 * node-sql-parser fails on: FOR XML RAW('arg'), and any comma-separated directives
 *
 * Simplifies to a form the parser accepts, preserving the original for restoration.
 * Returns null if no problematic FOR XML pattern is found.
 */
function stripForXmlDirectives(sql: string): { cleanedSQL: string; originalForXml: string } | null {
    // Read from tokens, not a regex: a trailing-clause regex backtracks polynomially on long
    // whitespace runs, and tokens also keep a FOR XML inside a subquery or string out of it.
    const tokens = SignificantTokens(LexSQL(sql, SQL_SERVER_LEXING));
    const forAt = tokens.findIndex((t, i) =>
        t.Depth === 0 && IsKeyword(t, 'FOR') && IsKeyword(tokens[i + 1], 'XML') &&
        FOR_XML_DIRECTIVES.some(d => IsKeyword(tokens[i + 2], d)));
    if (forAt === -1) return null;

    const directive = tokens[forAt + 2].Text.toUpperCase(); // PATH, RAW, etc.
    let next = forAt + 3;
    let quotedArg: string | null = null;
    if (tokens[next]?.Kind === 'open' && tokens[next + 1]?.Kind === 'string' && tokens[next + 2]?.Kind === 'close') {
        quotedArg = sql.substring(tokens[next].Start, tokens[next + 2].End);
        next += 3;
    }
    const rest = tokens.slice(next);
    // The clause must run to the end of the statement: nothing may follow it except
    // comma-separated directives, and no statement may follow a semicolon.
    if (rest.some(t => t.Kind === 'semicolon')) return null;
    const hasExtraDirectives = rest.length > 0 && rest[0].Kind === 'comma';
    if (rest.length > 0 && !hasExtraDirectives) return null;

    // Only needs workaround if there are extra comma-separated directives
    // OR if it's RAW/EXPLICIT with a quoted arg (parser can't handle those)
    const needsWorkaround = hasExtraDirectives ||
        (quotedArg !== null && (directive === 'RAW' || directive === 'EXPLICIT'));
    if (!needsWorkaround) return null;

    // Simplify to a form the parser accepts:
    // PATH('arg') → PATH('arg')  (parser handles this)
    // RAW('arg')  → RAW          (parser can't handle quoted arg on RAW)
    // Any + comma extras → strip extras
    const simplifiedDirective = directive === 'PATH' && quotedArg !== null
        ? `FOR XML PATH${quotedArg}`
        : `FOR XML ${directive}`;
    const clauseStart = tokens[forAt].Start;
    return { cleanedSQL: sql.substring(0, clauseStart) + simplifiedDirective, originalForXml: sql.substring(clauseStart) };
}

/**
 * Restores the original FOR XML clause text on the AST's `for` property.
 * This ensures that when the AST is inspected (e.g., for isOrderByLegalInCTE checks),
 * the FOR XML presence is correctly detected.
 */
function restoreForXmlOnAST(ast: NodeSqlParser.AST | NodeSqlParser.AST[], originalForXml: string): void {
    const stmt = (Array.isArray(ast) ? ast[0] : ast) as unknown as Record<string, unknown>;
    if (!stmt) return;

    // Walk the _next chain (UNION) to find the statement with the FOR clause
    let current: Record<string, unknown> | null = stmt;
    while (current) {
        if (current.for && typeof current.for === 'object') {
            // Attach the original text so downstream code can reconstruct it
            (current.for as Record<string, unknown>).__originalForXml = originalForXml;
            return;
        }
        current = current._next as Record<string, unknown> | null;
    }
}
