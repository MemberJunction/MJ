/**
 * MJSQLParser — Unified parser for MemberJunction's SQL superset
 *
 * Parses SQL that may contain Nunjucks templates ({{ }}, {% %}), composition
 * tokens ({{query:"..."}}), and standard SQL into a structured AST.
 *
 * Three-pass pipeline:
 *   1. MJLexer tokenizes MJ extensions with position tracking
 *   2. MJPlaceholderSubstitution replaces tokens with SQL-safe placeholders
 *   3. node-sql-parser produces the standard SQL AST
 *
 * The result contains both the SQL AST and the MJ token structure,
 * enabling SQL-level analysis and faithful MJ SQL reconstruction.
 */

import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;
import { MJLexer } from './mj-lexer.js';
import { MJPlaceholderSubstitution } from './mj-placeholder.js';
import {
    MJToken,
    MJTemplateExpr,
    MJCompositionRef,
    MJConditionalBlock,
    MJBranch,
    MJFilter,
    MJTemplateExprContent,
    MJCompositionRefContent,
    MJBlockTagContent,
    PlaceholderEntry,
    PlaceholderSubstitutionResult,
    MJParseResult,
} from './mj-ast-types.js';

// ═══════════════════════════════════════════════════
// Result types
// ═══════════════════════════════════════════════════

/** Result of Astify — the full parsed representation of MJ SQL */
export interface MJAstifyResult {
    /** The node-sql-parser AST of the placeholder-substituted SQL (null if parsing failed) */
    ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null;
    /** MJ token analysis with boolean flags */
    mjParse: MJParseResult;
    /** Map from placeholder string → original MJ token */
    positionMap: Map<string, PlaceholderEntry>;
    /** Tokens that were stripped (block tags, comments) */
    strippedTokens: MJToken[];
    /** The clean SQL that was parsed (for debugging) */
    cleanSQL: string;
    /** Whether AST parsing succeeded */
    astParsed: boolean;
    /** The SQL dialect used */
    dialect: string;
}

/** A table/view reference extracted from SQL */
export interface SQLTableReference {
    /** The table or view name as it appears in SQL */
    TableName: string;
    /** The schema name, defaults to 'dbo' if unspecified */
    SchemaName: string;
    /** The alias used in the query, or the table name if no alias */
    Alias: string;
}

/** A column reference extracted from SQL */
export interface SQLColumnReference {
    /** Column name */
    ColumnName: string;
    /** Table alias or name prefix (e.g., "t" in "t.Name"), or null if unqualified */
    TableQualifier: string | null;
}

/** Result of extracting CTE definitions from a WITH clause */
export interface SQLCTEExtraction {
    /** Individual CTE definitions as "name AS (...)" strings, in declaration order */
    CTEDefinitions: string[];
    /** The main statement after all CTE definitions */
    MainStatement: string;
    /** Whether AST parsing was used (true) or regex fallback (false) */
    UsedASTParsing: boolean;
}

/** Deterministic parameter info extracted from template expressions */
export interface MJParameterInfo {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'unknown';
    isRequired: boolean;
    defaultValue: string | number | null;
    filters: MJFilter[];
    usageLocations: string[];
}

// ═══════════════════════════════════════════════════
// MJSQLParser class
// ═══════════════════════════════════════════════════

/**
 * Unified parser for MemberJunction's SQL superset.
 *
 * Handles standard SQL, Nunjucks template expressions (`{{ var | filter }}`),
 * Nunjucks block tags (`{% if %}...{% endif %}`), composition tokens
 * (`{{query:"Path/Name(params)"}}`), and template comments (`{# ... #}`).
 *
 * All methods are static — no instance state is needed.
 */
export class MJSQLParser {
    // ─── Core Pipeline ─────────────────────────────────

    /**
     * Parse MJ SQL into an extended AST.
     *
     * Pipeline:
     * 1. MJLexer tokenizes MJ extensions
     * 2. MJPlaceholder replaces tokens with SQL-safe placeholders
     * 3. node-sql-parser produces the SQL AST
     *
     * @param sql The MJ SQL string to parse
     * @param dialect SQL dialect ('TransactSQL' | 'PostgresQL', default: 'TransactSQL')
     */
    static Astify(sql: string, dialect: string = 'TransactSQL'): MJAstifyResult {
        const mjParse = MJLexer.Parse(sql);

        if (!mjParse.hasMJExtensions) {
            const ast = MJSQLParser.parseSQL(sql, dialect);
            return {
                ast,
                mjParse,
                positionMap: new Map(),
                strippedTokens: [],
                cleanSQL: sql,
                astParsed: ast !== null,
                dialect,
            };
        }

        const { cleanSQL, positionMap, strippedTokens } = MJPlaceholderSubstitution.Substitute(sql);
        const ast = MJSQLParser.parseSQL(cleanSQL, dialect);

        return {
            ast,
            mjParse,
            positionMap,
            strippedTokens,
            cleanSQL,
            astParsed: ast !== null,
            dialect,
        };
    }

    /**
     * Reconstruct MJ SQL from an Astify result.
     *
     * For plain SQL: uses node-sql-parser's sqlify for normalized output.
     * For MJ SQL: reconstructs from tokens, preserving all Nunjucks and composition syntax verbatim.
     */
    static Sqlify(result: MJAstifyResult): string {
        if (!result.mjParse.hasMJExtensions && result.ast) {
            const parser = new Parser();
            const astToSqlify = Array.isArray(result.ast) ? result.ast[0] : result.ast;
            return parser.sqlify(astToSqlify, { database: result.dialect });
        }

        return result.mjParse.tokens.map(t => t.raw).join('');
    }

    // ─── Raw SQL Parsing ────────────────────────────────

    /**
     * Parse plain SQL into a node-sql-parser AST.
     * Handles FOR XML multi-directive workaround automatically.
     * Returns null if parsing fails.
     */
    static ParseSQL(sql: string, dialect: string = 'TransactSQL'): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        return MJSQLParser.parseSQL(sql, dialect);
    }

    /**
     * Convert a node-sql-parser AST (or array of ASTs) back to a SQL string.
     * This is a thin wrapper around node-sql-parser's sqlify.
     */
    static SqlifyAST(ast: NodeSqlParser.AST | NodeSqlParser.AST[], dialect: string = 'TransactSQL'): string {
        const parser = new Parser();
        return parser.sqlify(Array.isArray(ast) ? ast[0] : ast, { database: dialect });
    }

    /**
     * Convert a single AST expression node to a SQL string.
     * Useful for extracting ORDER BY terms, column expressions, etc.
     */
    static ExprToSQL(expr: unknown): string {
        const parser = new Parser();
        return parser.exprToSQL(expr);
    }

    // ─── Tokenization ──────────────────────────────────

    /**
     * Tokenize MJ SQL into an ordered list of tokens.
     * Returns MJ tokens (template expressions, composition refs, block tags, comments)
     * interleaved with SQL_TEXT tokens for the plain SQL segments.
     */
    static Tokenize(sql: string): MJToken[] {
        return MJLexer.Tokenize(sql);
    }

    /**
     * Tokenize and return a summary with boolean flags.
     * Useful for quick checks like "does this SQL have MJ extensions?"
     */
    static Analyze(sql: string): MJParseResult {
        return MJLexer.Parse(sql);
    }

    // ─── Placeholder Substitution ──────────────────────

    /**
     * Replace MJ tokens with SQL-safe placeholders.
     *
     * Context-aware: `sqlString` → string literal, `sqlNumber` → numeric literal,
     * `sqlIdentifier` → bare identifier. Block tags and comments are stripped.
     * Returns a position map for reversing the substitution.
     */
    static Substitute(sql: string): PlaceholderSubstitutionResult {
        return MJPlaceholderSubstitution.Substitute(sql);
    }

    // ─── Table & Column Extraction ─────────────────────

    /**
     * Extract all table/view references from SQL.
     * Handles Nunjucks templates via placeholder substitution before AST parsing.
     */
    static ExtractTableRefs(sql: string, dialect: string = 'TransactSQL'): SQLTableReference[] {
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = MJSQLParser.getCleanSQL(sql);
        const astResult = MJSQLParser.extractTablesViaAST(cleanSQL, dialect);
        if (astResult) return astResult;

        return MJSQLParser.extractTablesViaRegex(cleanSQL);
    }

    /**
     * Extract all column references from SQL.
     * Handles Nunjucks templates via placeholder substitution before AST parsing.
     */
    static ExtractColumnRefs(sql: string, dialect: string = 'TransactSQL'): SQLColumnReference[] {
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = MJSQLParser.getCleanSQL(sql);
        const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
        const columnRefs = new Set<string>();

        try {
            const parser = new Parser();
            const ast = parser.astify(cleanSQL, { database: dialect });
            const statements = Array.isArray(ast) ? ast : [ast];
            for (const statement of statements) {
                MJSQLParser.walkAST(statement as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
            }
            return MJSQLParser.buildColumnRefs(columnRefs);
        } catch {
            return [];
        }
    }

    // ─── CTE Extraction ────────────────────────────────

    /**
     * Extract CTE definitions from SQL starting with a WITH clause.
     *
     * Given: `WITH A AS (SELECT 1), B AS (SELECT 2) SELECT A.x, B.y FROM A, B`
     * Returns: CTEDefinitions: ["A AS (...)", "B AS (...)"], MainStatement: "SELECT ..."
     *
     * Uses AST parsing first (produces bracket-quoted identifiers for SQL Server),
     * falls back to paren-depth scanning if AST fails (e.g., Nunjucks-templated SQL).
     */
    static ExtractCTEs(sql: string, dialect: string = 'TransactSQL'): SQLCTEExtraction | null {
        const trimmed = sql.trimStart();
        if (!/^WITH\s/i.test(trimmed)) return null;

        const astResult = MJSQLParser.extractCTEsViaAST(trimmed, dialect);
        if (astResult) return astResult;

        return MJSQLParser.extractCTEsViaRegex(trimmed);
    }

    // ─── MJ Template Extraction ────────────────────────

    /**
     * Extract all {{ variable | filter }} expressions from SQL.
     * Returns structured info for each expression including variable name and filter chain.
     */
    static ExtractTemplateExpressions(sql: string): MJTemplateExpr[] {
        const tokens = MJLexer.Tokenize(sql);
        const exprs: MJTemplateExpr[] = [];

        for (const token of tokens) {
            if (token.type === 'MJ_TEMPLATE_EXPR') {
                const parsed = token.parsed as MJTemplateExprContent;
                exprs.push({
                    type: 'mj_template_expr',
                    variable: parsed.variable,
                    filters: parsed.filters,
                    raw: token.raw,
                });
            }
        }

        return exprs;
    }

    /**
     * Extract all {{query:"..."}} composition references from SQL.
     * Returns structured info including category path, query name, and parsed parameters.
     */
    static ExtractCompositionRefs(sql: string): MJCompositionRef[] {
        const tokens = MJLexer.Tokenize(sql);
        const refs: MJCompositionRef[] = [];

        for (const token of tokens) {
            if (token.type === 'MJ_COMPOSITION_REF') {
                const parsed = token.parsed as MJCompositionRefContent;
                refs.push({
                    type: 'mj_composition_ref',
                    categoryPath: parsed.categoryPath,
                    queryName: parsed.queryName,
                    parameters: parsed.parameters,
                    raw: token.raw,
                });
            }
        }

        return refs;
    }

    /**
     * Extract conditional blocks, pairing if/elif/else/endif into structured trees.
     */
    static ExtractConditionalBlocks(sql: string): MJConditionalBlock[] {
        const tokens = MJLexer.Tokenize(sql);
        const blocks: MJConditionalBlock[] = [];
        const stack: { branches: MJBranch[]; raw: string }[] = [];

        for (const token of tokens) {
            switch (token.type) {
                case 'MJ_IF_OPEN': {
                    const parsed = token.parsed as MJBlockTagContent;
                    stack.push({
                        branches: [{ condition: parsed.expression, body: { raw: '', nodes: [] } }],
                        raw: token.raw,
                    });
                    break;
                }
                case 'MJ_ELIF': {
                    const parsed = token.parsed as MJBlockTagContent;
                    const current = stack[stack.length - 1];
                    if (current) {
                        current.raw += token.raw;
                        current.branches.push({ condition: parsed.expression, body: { raw: '', nodes: [] } });
                    }
                    break;
                }
                case 'MJ_ELSE': {
                    const current = stack[stack.length - 1];
                    if (current) {
                        current.raw += token.raw;
                        current.branches.push({ condition: null, body: { raw: '', nodes: [] } });
                    }
                    break;
                }
                case 'MJ_ENDIF': {
                    const completed = stack.pop();
                    if (completed) {
                        completed.raw += token.raw;
                        blocks.push({ type: 'mj_conditional', branches: completed.branches, raw: completed.raw });
                    }
                    break;
                }
                default: {
                    const current = stack[stack.length - 1];
                    if (current && current.branches.length > 0) {
                        const lastBranch = current.branches[current.branches.length - 1];
                        lastBranch.body.raw += token.raw;
                        MJSQLParser.addNodeToFragment(token, lastBranch);
                        current.raw += token.raw;
                    }
                }
            }
        }

        return blocks;
    }

    /**
     * Extract parameter metadata from template expressions.
     * Infers type from filters, isRequired from conditional block context.
     */
    static ExtractParameterInfo(sql: string): MJParameterInfo[] {
        const tokens = MJLexer.Tokenize(sql);
        const paramMap = new Map<string, MJParameterInfo>();

        for (const token of tokens) {
            if (token.type === 'MJ_TEMPLATE_EXPR') {
                const parsed = token.parsed as MJTemplateExprContent;
                const varName = parsed.variable;

                if (!paramMap.has(varName)) {
                    paramMap.set(varName, {
                        name: varName,
                        type: MJSQLParser.inferTypeFromFilters(parsed.filters),
                        isRequired: true,
                        defaultValue: MJSQLParser.extractDefaultValue(parsed.filters),
                        filters: parsed.filters,
                        usageLocations: [],
                    });
                }

                paramMap.get(varName)!.usageLocations.push(token.raw);
            }
        }

        const conditionalVars = MJSQLParser.findConditionalVariables(tokens);
        for (const [varName, param] of paramMap) {
            if (conditionalVars.onlyInConditional.has(varName)) {
                param.isRequired = false;
            }
        }

        return Array.from(paramMap.values());
    }

    // ═══════════════════════════════════════════════════
    // Private: SQL Parsing
    // ═══════════════════════════════════════════════════

    /**
     * Parse SQL safely, returning null on failure.
     *
     * Includes a workaround for node-sql-parser's inability to handle multi-directive
     * FOR XML clauses (e.g., `FOR XML PATH('M'), ROOT('R')`). The parser handles
     * `FOR XML PATH('M')` fine but chokes on the comma-separated directives.
     * We strip the extra directives before parsing and restore them on the AST's `for` property.
     */
    private static parseSQL(sql: string, dialect: string): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        try {
            const parser = new Parser();
            return parser.astify(sql, { database: dialect });
        } catch {
            // If direct parse fails, try with FOR XML workaround
            const forXmlResult = MJSQLParser.stripForXmlDirectives(sql);
            if (forXmlResult) {
                try {
                    const parser = new Parser();
                    const ast = parser.astify(forXmlResult.cleanedSQL, { database: dialect });
                    // Restore the original FOR XML clause on the AST
                    MJSQLParser.restoreForXmlOnAST(ast, forXmlResult.originalForXml);
                    return ast;
                } catch {
                    return null;
                }
            }
            return null;
        }
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
    private static stripForXmlDirectives(sql: string): { cleanedSQL: string; originalForXml: string } | null {
        // Match FOR XML <directive> with optional quoted arg and optional comma-separated extras
        const forXmlRegex = /\bFOR\s+XML\s+(PATH|RAW|AUTO|EXPLICIT)(\s*\('[^']*'\))?(\s*,\s*[^;]*)?$/i;
        const match = sql.match(forXmlRegex);
        if (!match) return null;

        const fullForXml = match[0];
        const directive = match[1].toUpperCase(); // PATH, RAW, etc.
        const hasQuotedArg = !!match[2];
        const hasExtraDirectives = !!match[3];

        // Only needs workaround if there are extra comma-separated directives
        // OR if it's RAW/EXPLICIT with a quoted arg (parser can't handle those)
        const needsWorkaround = hasExtraDirectives ||
            (hasQuotedArg && (directive === 'RAW' || directive === 'EXPLICIT'));

        if (!needsWorkaround) return null;

        // Simplify to a form the parser accepts:
        // PATH('arg') → PATH('arg')  (parser handles this)
        // RAW('arg')  → RAW          (parser can't handle quoted arg on RAW)
        // Any + comma extras → strip extras
        let simplifiedDirective: string;
        if (directive === 'PATH' && hasQuotedArg) {
            simplifiedDirective = `FOR XML PATH${match[2]}`;
        } else {
            simplifiedDirective = `FOR XML ${directive}`;
        }

        const cleanedSQL = sql.substring(0, match.index!) + simplifiedDirective;
        return { cleanedSQL, originalForXml: fullForXml };
    }

    /**
     * Restores the original FOR XML clause text on the AST's `for` property.
     * This ensures that when the AST is inspected (e.g., for isOrderByLegalInCTE checks),
     * the FOR XML presence is correctly detected.
     */
    private static restoreForXmlOnAST(ast: NodeSqlParser.AST | NodeSqlParser.AST[], originalForXml: string): void {
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

    /** Get clean SQL (MJ tokens replaced with placeholders) for AST parsing */
    private static getCleanSQL(sql: string): string {
        const analysis = MJLexer.Parse(sql);
        if (!analysis.hasMJExtensions) return sql;
        return MJPlaceholderSubstitution.Substitute(sql).cleanSQL;
    }

    // ═══════════════════════════════════════════════════
    // Private: Table Extraction
    // ═══════════════════════════════════════════════════

    private static extractTablesViaAST(sql: string, dialect: string): SQLTableReference[] | null {
        try {
            const parser = new Parser();
            const ast = parser.astify(sql, { database: dialect });
            const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
            const columnRefs = new Set<string>();

            const statements = Array.isArray(ast) ? ast : [ast];
            for (const statement of statements) {
                MJSQLParser.walkAST(statement as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
            }

            return MJSQLParser.deduplicateTables(tableAliasMap);
        } catch {
            return null;
        }
    }

    private static extractTablesViaRegex(sql: string): SQLTableReference[] {
        const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
        const tablePattern = /(?:FROM|JOIN|INTO)\s+(?:\[?(\w+)\]?\.)?\[?(\w+)\]?(?:\s+(?:AS\s+)?(\w+))?/gi;
        const matches = [...sql.matchAll(tablePattern)];

        for (const match of matches) {
            const schemaName = match[1] || 'dbo';
            const tableName = match[2];
            const alias = match[3] || tableName;
            if (!tableAliasMap.has(alias)) {
                tableAliasMap.set(alias, { schemaName, tableName });
            }
        }

        return MJSQLParser.deduplicateTables(tableAliasMap);
    }

    private static deduplicateTables(
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>
    ): SQLTableReference[] {
        const seen = new Set<string>();
        const tables: SQLTableReference[] = [];

        for (const [alias, info] of tableAliasMap) {
            const key = `${info.schemaName.toLowerCase()}.${info.tableName.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                tables.push({ TableName: info.tableName, SchemaName: info.schemaName, Alias: alias });
            }
        }

        return tables;
    }

    private static buildColumnRefs(columnRefs: Set<string>): SQLColumnReference[] {
        const columns: SQLColumnReference[] = [];
        for (const ref of columnRefs) {
            const dotIndex = ref.lastIndexOf('.');
            if (dotIndex >= 0) {
                columns.push({ ColumnName: ref.substring(dotIndex + 1), TableQualifier: ref.substring(0, dotIndex) });
            } else {
                columns.push({ ColumnName: ref, TableQualifier: null });
            }
        }
        return columns;
    }

    // ═══════════════════════════════════════════════════
    // Private: CTE Extraction
    // ═══════════════════════════════════════════════════

    private static extractCTEsViaAST(sql: string, dialect: string): SQLCTEExtraction | null {
        try {
            const parser = new Parser();
            const ast = parser.astify(sql, { database: dialect });
            const singleAst = (Array.isArray(ast) ? ast[0] : ast) as unknown as Record<string, unknown>;

            if (!singleAst.with || !Array.isArray(singleAst.with) || singleAst.with.length === 0) {
                return null;
            }

            const cteDefinitions: string[] = [];
            for (const cte of singleAst.with as unknown[]) {
                const cteRecord = cte as { name: { value: string }; stmt: { ast: unknown } };
                const cteName = cteRecord.name.value;
                const bodySQL = parser.sqlify(cteRecord.stmt.ast as NodeSqlParser.AST, { database: dialect });
                cteDefinitions.push(`${cteName} AS (\n${bodySQL}\n)`);
            }

            const mainAst = { ...singleAst, with: null } as unknown as NodeSqlParser.AST;
            const mainStatement = parser.sqlify(mainAst, { database: dialect });

            return { CTEDefinitions: cteDefinitions, MainStatement: mainStatement, UsedASTParsing: true };
        } catch {
            return null;
        }
    }

    private static extractCTEsViaRegex(sql: string): SQLCTEExtraction {
        const withStripped = sql.trimStart().replace(/^WITH\s+/i, '');
        const cteDefinitions: string[] = [];
        let pos = 0;
        const len = withStripped.length;

        while (pos < len) {
            pos = MJSQLParser.skipWhitespace(withStripped, pos);
            if (pos >= len) break;

            const remaining = withStripped.substring(pos);
            const cteHeaderMatch = remaining.match(/^(\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s+AS\s*\(/i);
            if (!cteHeaderMatch) break;

            const cteName = cteHeaderMatch[1];
            pos += cteHeaderMatch[0].length;

            const bodyStart = pos;
            pos = MJSQLParser.findMatchingCloseParen(withStripped, pos);
            const cteBody = withStripped.substring(bodyStart, pos);
            cteDefinitions.push(`${cteName} AS (\n${cteBody}\n)`);
            pos++;

            pos = MJSQLParser.skipWhitespace(withStripped, pos);
            if (pos < len && withStripped[pos] === ',') pos++;
        }

        const mainStatement = withStripped.substring(pos).trim();
        return { CTEDefinitions: cteDefinitions, MainStatement: mainStatement, UsedASTParsing: false };
    }

    private static skipWhitespace(sql: string, pos: number): number {
        while (pos < sql.length && /\s/.test(sql[pos])) pos++;
        return pos;
    }

    private static findMatchingCloseParen(sql: string, pos: number): number {
        let depth = 1;
        const len = sql.length;

        while (pos < len && depth > 0) {
            const ch = sql[pos];
            if (ch === "'") {
                pos++;
                while (pos < len) {
                    if (sql[pos] === "'") {
                        if (pos + 1 < len && sql[pos + 1] === "'") { pos += 2; continue; }
                        break;
                    }
                    pos++;
                }
            } else if (ch === '-' && pos + 1 < len && sql[pos + 1] === '-') {
                pos += 2;
                while (pos < len && sql[pos] !== '\n') pos++;
            } else if (ch === '/' && pos + 1 < len && sql[pos + 1] === '*') {
                pos += 2;
                while (pos < len && !(sql[pos] === '*' && pos + 1 < len && sql[pos + 1] === '/')) pos++;
                if (pos < len) pos++;
            } else if (ch === '(') {
                depth++;
            } else if (ch === ')') {
                depth--;
                if (depth === 0) return pos;
            }
            pos++;
        }

        return pos;
    }

    // ═══════════════════════════════════════════════════
    // Private: AST Walking (table/column extraction)
    // ═══════════════════════════════════════════════════

    private static walkAST(
        node: Record<string, unknown>,
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>,
        columnRefs: Set<string>
    ): void {
        if (!node || typeof node !== 'object') return;

        if (node.with) {
            const ctes = Array.isArray(node.with) ? node.with : [node.with];
            for (const cte of ctes) {
                const cteRecord = cte as Record<string, unknown>;
                if (cteRecord.stmt) {
                    const stmtRecord = cteRecord.stmt as Record<string, unknown>;
                    const cteAst = (stmtRecord.ast || stmtRecord) as Record<string, unknown>;
                    MJSQLParser.walkAST(cteAst, tableAliasMap, columnRefs);
                }
            }
        }

        if (node.from) {
            const fromItems = Array.isArray(node.from) ? node.from : [node.from];
            for (const fromItem of fromItems) {
                MJSQLParser.walkFromItem(fromItem as Record<string, unknown>, tableAliasMap, columnRefs);
            }
        }

        if (node.columns) {
            const cols = Array.isArray(node.columns) ? node.columns : [node.columns];
            for (const col of cols) {
                if (col === '*') continue;
                const colRecord = col as Record<string, unknown>;
                if (colRecord.expr) {
                    MJSQLParser.walkExpression(colRecord.expr as Record<string, unknown>, columnRefs, tableAliasMap);
                }
            }
        }

        if (node.where) {
            MJSQLParser.walkExpression(node.where as Record<string, unknown>, columnRefs, tableAliasMap);
        }

        if (node.groupby) {
            const groupbyRecord = node.groupby as Record<string, unknown>;
            const groupItems = groupbyRecord.columns || node.groupby;
            const items = Array.isArray(groupItems) ? groupItems : [groupItems];
            for (const group of items) {
                MJSQLParser.walkExpression(group as Record<string, unknown>, columnRefs, tableAliasMap);
            }
        }

        if (node.orderby) {
            const orders = Array.isArray(node.orderby) ? node.orderby : [node.orderby];
            for (const order of orders) {
                const orderRecord = order as Record<string, unknown>;
                MJSQLParser.walkExpression((orderRecord.expr || orderRecord) as Record<string, unknown>, columnRefs, tableAliasMap);
            }
        }

        if (node._next) {
            MJSQLParser.walkAST(node._next as Record<string, unknown>, tableAliasMap, columnRefs);
        }
    }

    private static walkFromItem(
        fromItem: Record<string, unknown>,
        tableAliasMap: Map<string, { schemaName: string; tableName: string }>,
        columnRefs: Set<string>
    ): void {
        if (!fromItem) return;

        if (fromItem.table) {
            const alias = (fromItem.as || fromItem.table) as string;
            tableAliasMap.set(alias, {
                schemaName: (fromItem.db as string) || 'dbo',
                tableName: fromItem.table as string,
            });
        }

        if (fromItem.expr) {
            const exprRecord = fromItem.expr as Record<string, unknown>;
            const subqueryAst = (exprRecord.ast || exprRecord) as Record<string, unknown>;
            MJSQLParser.walkAST(subqueryAst, tableAliasMap, columnRefs);
        }

        if (fromItem.on) {
            MJSQLParser.walkExpression(fromItem.on as Record<string, unknown>, columnRefs, tableAliasMap);
        }

        if (fromItem.using) {
            const usings = Array.isArray(fromItem.using) ? fromItem.using : [fromItem.using];
            for (const col of usings) {
                if (typeof col === 'string') {
                    columnRefs.add(col);
                } else if (col && typeof col === 'object' && 'column' in col) {
                    columnRefs.add((col as Record<string, string>).column);
                }
            }
        }
    }

    private static walkExpression(
        expr: Record<string, unknown>,
        columnRefs: Set<string>,
        tableAliasMap?: Map<string, { schemaName: string; tableName: string }>
    ): void {
        if (!expr || typeof expr !== 'object') return;

        if (expr.type === 'column_ref') {
            const colName = expr.table ? `${expr.table}.${expr.column}` : expr.column as string;
            columnRefs.add(colName);
        }

        if (expr.ast && tableAliasMap) {
            MJSQLParser.walkAST(expr.ast as Record<string, unknown>, tableAliasMap, columnRefs);
        }

        if (expr.left) MJSQLParser.walkExpression(expr.left as Record<string, unknown>, columnRefs, tableAliasMap);
        if (expr.right) MJSQLParser.walkExpression(expr.right as Record<string, unknown>, columnRefs, tableAliasMap);
        if (expr.args) {
            const argsRecord = expr.args as Record<string, unknown>;
            const args = argsRecord.value || expr.args;
            const argList = Array.isArray(args) ? args : [args];
            for (const arg of argList) {
                MJSQLParser.walkExpression(arg as Record<string, unknown>, columnRefs, tableAliasMap);
            }
        }
        if (expr.expr) MJSQLParser.walkExpression(expr.expr as Record<string, unknown>, columnRefs, tableAliasMap);
    }

    // ═══════════════════════════════════════════════════
    // Private: Parameter Analysis
    // ═══════════════════════════════════════════════════

    private static inferTypeFromFilters(filters: MJFilter[]): MJParameterInfo['type'] {
        const filterTypeMap: Record<string, MJParameterInfo['type']> = {
            'sqlString': 'string',
            'sqlNumber': 'number',
            'sqlDate': 'date',
            'sqlBoolean': 'boolean',
            'sqlIn': 'array',
            'sqlIdentifier': 'string',
            'sqlNoKeywordsExpression': 'string',
        };

        for (let i = filters.length - 1; i >= 0; i--) {
            const mapped = filterTypeMap[filters[i].name];
            if (mapped) return mapped;
        }

        return 'unknown';
    }

    private static extractDefaultValue(filters: MJFilter[]): string | number | null {
        for (const filter of filters) {
            if (filter.name === 'default' && filter.args.length > 0) {
                return filter.args[0];
            }
        }
        return null;
    }

    private static findConditionalVariables(tokens: MJToken[]): {
        onlyInConditional: Set<string>;
        outsideConditional: Set<string>;
    } {
        const insideConditional = new Set<string>();
        const outsideConditional = new Set<string>();
        let conditionalDepth = 0;

        for (const token of tokens) {
            switch (token.type) {
                case 'MJ_IF_OPEN':
                    conditionalDepth++;
                    MJSQLParser.addConditionVariables(token, insideConditional);
                    break;
                case 'MJ_ELIF':
                    MJSQLParser.addConditionVariables(token, insideConditional);
                    break;
                case 'MJ_ENDIF':
                    conditionalDepth = Math.max(0, conditionalDepth - 1);
                    break;
                case 'MJ_TEMPLATE_EXPR': {
                    const parsed = token.parsed as MJTemplateExprContent;
                    if (conditionalDepth > 0) {
                        insideConditional.add(parsed.variable);
                    } else {
                        outsideConditional.add(parsed.variable);
                    }
                    break;
                }
            }
        }

        const onlyInConditional = new Set<string>();
        for (const v of insideConditional) {
            if (!outsideConditional.has(v)) onlyInConditional.add(v);
        }

        return { onlyInConditional, outsideConditional };
    }

    private static addConditionVariables(token: MJToken, varSet: Set<string>): void {
        const parsed = token.parsed as MJBlockTagContent;
        if (parsed.expression) {
            const words = parsed.expression.split(/\s+(?:and|or|not)\s+|\s+/i);
            for (const word of words) {
                const trimmed = word.replace(/[!=<>'"()]/g, '').trim();
                if (trimmed && /^[A-Za-z_]\w*$/.test(trimmed)) {
                    varSet.add(trimmed);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // Private: Conditional Block Helpers
    // ═══════════════════════════════════════════════════

    private static addNodeToFragment(token: MJToken, branch: MJBranch): void {
        if (token.type === 'MJ_TEMPLATE_EXPR') {
            const parsed = token.parsed as MJTemplateExprContent;
            branch.body.nodes.push({
                type: 'mj_template_expr',
                variable: parsed.variable,
                filters: parsed.filters,
                raw: token.raw,
            });
        } else if (token.type === 'MJ_COMPOSITION_REF') {
            const parsed = token.parsed as MJCompositionRefContent;
            branch.body.nodes.push({
                type: 'mj_composition_ref',
                categoryPath: parsed.categoryPath,
                queryName: parsed.queryName,
                parameters: parsed.parameters,
                raw: token.raw,
            });
        }
    }
}
