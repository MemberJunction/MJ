/**
 * SQLParser — Unified parser for MemberJunction's SQL superset
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
    SQLClauseContext,
    MJASTAnnotation,
    MJASTWalkResult,
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

/**
 * Combined result of parsing SQL for table and column references.
 * This is the original SQLParser.Parse() return type, preserved for backward compatibility.
 */
export interface SQLParseResult {
    /** All table/view references found (FROM, JOIN, subqueries, CTEs) */
    Tables: SQLTableReference[];
    /** All column references found (SELECT, WHERE, JOIN ON, GROUP BY, ORDER BY) */
    Columns: SQLColumnReference[];
    /** Whether parsing succeeded via AST (true) or fell back to regex (false) */
    UsedASTParsing: boolean;
}

/** Options for Parse() and ParseWithTemplatePreprocessing() methods */
export interface SQLParseOptions {
    /** The SQL string to parse */
    sql: string;
    /** SQL dialect (default: 'TransactSQL') */
    dialect?: string;
}

// ═══════════════════════════════════════════════════
// SQLParser class
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
export class SQLParser {
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
            const ast = SQLParser.parseSQL(sql, dialect);
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
        const ast = SQLParser.parseSQL(cleanSQL, dialect);

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
        return SQLParser.parseSQL(sql, dialect);
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
     *
     * node-sql-parser's exprToSQL always produces backtick-quoted identifiers
     * regardless of dialect. This method converts to the appropriate quoting:
     * - TransactSQL: backticks → square brackets
     * - PostgresQL: backticks → double quotes
     */
    static ExprToSQL(expr: unknown, dialect: string = 'TransactSQL'): string {
        const parser = new Parser();
        const sql = parser.exprToSQL(expr);

        if (dialect === 'TransactSQL') {
            return sql.replace(/`([^`]+)`/g, '[$1]');
        }
        if (dialect === 'PostgresQL') {
            return sql.replace(/`([^`]+)`/g, '"$1"');
        }
        return sql;
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

    // ─── Backward-Compatible API ─────────────────────────
    // These methods preserve the original SQLParser interface for downstream
    // consumers (mj-forge, migration toolchain). They delegate to the new
    // extraction methods internally.

    /**
     * Parse SQL and extract table + column references.
     * This is the original SQLParser.Parse() method signature.
     * Automatically handles MJ Nunjucks templates via placeholder substitution.
     *
     * @param options Parse options, or just a SQL string for backward compatibility
     */
    static Parse(options: SQLParseOptions | string, dialect?: string): SQLParseResult {
        const { sql, parserDialect } = SQLParser.resolveParseArgs(options, dialect);
        if (!sql || sql.trim().length === 0) {
            return { Tables: [], Columns: [], UsedASTParsing: false };
        }

        const cleanSQL = SQLParser.getCleanSQL(sql);
        const tables = SQLParser.extractTablesViaAST(cleanSQL, parserDialect);
        const usedAST = tables !== null;

        const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
        const columnRefs = new Set<string>();

        if (usedAST) {
            try {
                const parser = new Parser();
                const ast = parser.astify(cleanSQL, { database: parserDialect });
                const statements = Array.isArray(ast) ? ast : [ast];
                for (const stmt of statements) {
                    SQLParser.walkAST(stmt as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
                }
            } catch { /* columns will be empty */ }
        }

        return {
            Tables: tables || SQLParser.extractTablesViaRegex(cleanSQL),
            Columns: SQLParser.buildColumnRefs(columnRefs),
            UsedASTParsing: usedAST,
        };
    }

    /**
     * Parse SQL with MJ Nunjucks template preprocessing.
     * This is the original SQLParser.ParseWithTemplatePreprocessing() signature.
     * Now equivalent to Parse() since all methods handle templates automatically.
     *
     * @param options Parse options, or just a SQL string for backward compatibility
     */
    static ParseWithTemplatePreprocessing(options: SQLParseOptions | string, dialect?: string): SQLParseResult {
        return SQLParser.Parse(options, dialect);
    }

    // ─── Table & Column Extraction ─────────────────────

    /**
     * Extract all table/view references from SQL.
     * Handles Nunjucks templates via placeholder substitution before AST parsing.
     */
    static ExtractTableRefs(sql: string, dialect: string = 'TransactSQL'): SQLTableReference[] {
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = SQLParser.getCleanSQL(sql);
        const astResult = SQLParser.extractTablesViaAST(cleanSQL, dialect);
        if (astResult) return astResult;

        return SQLParser.extractTablesViaRegex(cleanSQL);
    }

    /**
     * Extract all column references from SQL.
     * Handles Nunjucks templates via placeholder substitution before AST parsing.
     */
    static ExtractColumnRefs(sql: string, dialect: string = 'TransactSQL'): SQLColumnReference[] {
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = SQLParser.getCleanSQL(sql);
        const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
        const columnRefs = new Set<string>();

        try {
            const parser = new Parser();
            const ast = parser.astify(cleanSQL, { database: dialect });
            const statements = Array.isArray(ast) ? ast : [ast];
            for (const statement of statements) {
                SQLParser.walkAST(statement as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
            }
            return SQLParser.buildColumnRefs(columnRefs);
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

        const astResult = SQLParser.extractCTEsViaAST(trimmed, dialect);
        if (astResult) return astResult;

        return SQLParser.extractCTEsViaRegex(trimmed);
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
                        SQLParser.addNodeToFragment(token, lastBranch);
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
                        type: SQLParser.inferTypeFromFilters(parsed.filters),
                        isRequired: true,
                        defaultValue: SQLParser.extractDefaultValue(parsed.filters),
                        filters: parsed.filters,
                        usageLocations: [],
                    });
                }

                paramMap.get(varName)!.usageLocations.push(token.raw);
            }
        }

        const conditionalVars = SQLParser.findConditionalVariables(tokens);
        for (const [varName, param] of paramMap) {
            if (conditionalVars.onlyInConditional.has(varName)) {
                param.isRequired = false;
            }
        }

        return Array.from(paramMap.values());
    }

    // ─── AST Walker ──────────────────────────────────────

    /**
     * Walk the AST from an Astify result and annotate where MJ placeholders appear.
     *
     * Returns an MJASTWalkResult with annotations mapping each placeholder to its
     * SQL clause context (SELECT, WHERE, ORDER BY, etc.) and the resolved MJ node.
     *
     * This enables queries like:
     * - "Which template expressions appear in the WHERE clause?"
     * - "What composition ref is in the FROM clause?"
     * - "Does the ORDER BY reference an MJ token?"
     *
     * @param result The MJAstifyResult from Astify()
     * @returns Walk result with annotations, or empty result if AST parsing failed
     */
    static WalkAST(result: MJAstifyResult): MJASTWalkResult {
        const emptyResult: MJASTWalkResult = {
            annotations: [],
            byClause: new Map(),
            byPlaceholder: new Map(),
            templateExprs: [],
            compositionRefs: [],
        };

        if (!result.astParsed || !result.ast || result.positionMap.size === 0) {
            return emptyResult;
        }

        const annotations: MJASTAnnotation[] = [];
        const stmt = (Array.isArray(result.ast) ? result.ast[0] : result.ast) as unknown as Record<string, unknown>;

        if (stmt) {
            SQLParser.walkASTNode(stmt, '', 'unknown', result.positionMap, annotations);
        }

        return SQLParser.buildWalkResult(annotations);
    }

    // ═══════════════════════════════════════════════════
    // Private: AST Walker
    // ═══════════════════════════════════════════════════

    /**
     * Recursively walks an AST node, checking values against the placeholder map.
     */
    private static walkASTNode(
        node: Record<string, unknown>,
        path: string,
        context: SQLClauseContext,
        positionMap: Map<string, PlaceholderEntry>,
        annotations: MJASTAnnotation[]
    ): void {
        if (!node || typeof node !== 'object') return;

        // Walk standard SQL AST clauses with appropriate context
        if (node.columns) SQLParser.walkASTValue(node.columns, `${path}columns`, 'select', positionMap, annotations, node);
        if (node.from) SQLParser.walkASTValue(node.from, `${path}from`, 'from', positionMap, annotations, node);
        if (node.where) SQLParser.walkASTValue(node.where, `${path}where`, 'where', positionMap, annotations, node);
        if (node.groupby) {
            const groupby = node.groupby as Record<string, unknown>;
            const groupItems = groupby.columns || node.groupby;
            SQLParser.walkASTValue(groupItems, `${path}groupby`, 'group_by', positionMap, annotations, node);
        }
        if (node.having) SQLParser.walkASTValue(node.having, `${path}having`, 'having', positionMap, annotations, node);
        if (node.orderby) SQLParser.walkASTValue(node.orderby, `${path}orderby`, 'order_by', positionMap, annotations, node);

        // Walk CTEs
        if (node.with && Array.isArray(node.with)) {
            for (let i = 0; i < node.with.length; i++) {
                const cte = node.with[i] as Record<string, unknown>;
                if (cte.stmt) {
                    const stmtRecord = cte.stmt as Record<string, unknown>;
                    const cteAst = (stmtRecord.ast || stmtRecord) as Record<string, unknown>;
                    SQLParser.walkASTNode(cteAst, `${path}with[${i}].`, 'cte', positionMap, annotations);
                }
            }
        }

        // Walk JOIN ON conditions
        if (Array.isArray(node.from)) {
            for (let i = 0; i < node.from.length; i++) {
                const fromItem = node.from[i] as Record<string, unknown>;
                if (fromItem?.on) {
                    SQLParser.walkASTValue(fromItem.on, `${path}from[${i}].on`, 'join_on', positionMap, annotations, fromItem);
                }
                // Walk subqueries in FROM
                if (fromItem?.expr) {
                    const exprRecord = fromItem.expr as Record<string, unknown>;
                    const subAst = (exprRecord.ast || exprRecord) as Record<string, unknown>;
                    if (subAst.type === 'select' || subAst.columns) {
                        SQLParser.walkASTNode(subAst, `${path}from[${i}].expr.`, 'subquery', positionMap, annotations);
                    }
                }
            }
        }

        // Walk UNION/EXCEPT chain
        if (node._next) {
            SQLParser.walkASTNode(node._next as Record<string, unknown>, `${path}_next.`, context, positionMap, annotations);
        }
    }

    /**
     * Walks any AST value (node, array, or primitive) checking for placeholder matches.
     */
    private static walkASTValue(
        value: unknown,
        path: string,
        context: SQLClauseContext,
        positionMap: Map<string, PlaceholderEntry>,
        annotations: MJASTAnnotation[],
        parentNode: Record<string, unknown>
    ): void {
        if (value === null || value === undefined) return;

        // Check string values against placeholders
        if (typeof value === 'string') {
            SQLParser.checkPlaceholder(value, path, context, positionMap, annotations, parentNode);
            return;
        }

        // Check number values (sqlNumber placeholders are numeric)
        if (typeof value === 'number') {
            SQLParser.checkPlaceholder(String(value), path, context, positionMap, annotations, parentNode);
            return;
        }

        // Walk arrays
        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                SQLParser.walkASTValue(value[i], `${path}[${i}]`, context, positionMap, annotations, parentNode);
            }
            return;
        }

        // Walk objects recursively
        if (typeof value === 'object') {
            const obj = value as Record<string, unknown>;

            // Check column_ref nodes — the column name or table.column might be a placeholder
            if (obj.type === 'column_ref') {
                const col = obj.column as string;
                if (col) SQLParser.checkPlaceholder(col, `${path}.column`, context, positionMap, annotations, obj);
                if (obj.table) SQLParser.checkPlaceholder(obj.table as string, `${path}.table`, context, positionMap, annotations, obj);
                return;
            }

            // Check string literal values
            if (obj.type === 'single_quote_string' || obj.type === 'string') {
                if (typeof obj.value === 'string') {
                    // String placeholder includes the quotes: '__MJT_001__'
                    SQLParser.checkPlaceholder(`'${obj.value}'`, `${path}.value`, context, positionMap, annotations, obj);
                }
                return;
            }

            // Check number literal values
            if (obj.type === 'number') {
                if (typeof obj.value === 'number') {
                    SQLParser.checkPlaceholder(String(obj.value), `${path}.value`, context, positionMap, annotations, obj);
                }
                return;
            }

            // Recurse into expression nodes
            if (obj.left) SQLParser.walkASTValue(obj.left, `${path}.left`, context, positionMap, annotations, obj);
            if (obj.right) SQLParser.walkASTValue(obj.right, `${path}.right`, context, positionMap, annotations, obj);
            if (obj.expr) SQLParser.walkASTValue(obj.expr, `${path}.expr`, context, positionMap, annotations, obj);
            if (obj.args) {
                const args = (obj.args as Record<string, unknown>).value || obj.args;
                SQLParser.walkASTValue(args, `${path}.args`, context, positionMap, annotations, obj);
            }

            // Walk CASE WHEN
            if (obj.type === 'case' && Array.isArray(obj.args)) {
                for (let i = 0; i < (obj.args as unknown[]).length; i++) {
                    const caseArg = (obj.args as Record<string, unknown>[])[i];
                    if (caseArg.cond) SQLParser.walkASTValue(caseArg.cond, `${path}.args[${i}].cond`, context, positionMap, annotations, obj);
                    if (caseArg.result) SQLParser.walkASTValue(caseArg.result, `${path}.args[${i}].result`, context, positionMap, annotations, obj);
                }
            }

            // Walk subqueries in expressions (EXISTS, IN)
            if (obj.ast) {
                SQLParser.walkASTNode(obj.ast as Record<string, unknown>, `${path}.ast.`, 'subquery', positionMap, annotations);
            }
        }
    }

    /**
     * Checks if a value matches a placeholder and creates an annotation if so.
     */
    private static checkPlaceholder(
        value: string,
        path: string,
        context: SQLClauseContext,
        positionMap: Map<string, PlaceholderEntry>,
        annotations: MJASTAnnotation[],
        astNode: Record<string, unknown>
    ): void {
        const entry = positionMap.get(value);
        if (!entry) return;

        const originalToken = entry.originalToken;
        let templateExpr: MJTemplateExpr | null = null;
        let compositionRef: MJCompositionRef | null = null;

        if (originalToken.type === 'MJ_TEMPLATE_EXPR') {
            const parsed = originalToken.parsed as MJTemplateExprContent;
            templateExpr = {
                type: 'mj_template_expr',
                variable: parsed.variable,
                filters: parsed.filters,
                raw: originalToken.raw,
            };
        } else if (originalToken.type === 'MJ_COMPOSITION_REF') {
            const parsed = originalToken.parsed as MJCompositionRefContent;
            compositionRef = {
                type: 'mj_composition_ref',
                categoryPath: parsed.categoryPath,
                queryName: parsed.queryName,
                parameters: parsed.parameters,
                raw: originalToken.raw,
            };
        }

        annotations.push({
            path,
            placeholder: value,
            clauseContext: context,
            templateExpr,
            compositionRef,
            placeholderContext: entry.context,
            astNode,
        });
    }

    /**
     * Builds the MJASTWalkResult from a flat list of annotations.
     */
    private static buildWalkResult(annotations: MJASTAnnotation[]): MJASTWalkResult {
        // Deduplicate — keep the first (most specific) annotation per placeholder.
        // Subqueries can be reached via multiple AST walk paths, producing duplicates.
        const seen = new Set<string>();
        const deduped = annotations.filter(ann => {
            if (seen.has(ann.placeholder)) return false;
            seen.add(ann.placeholder);
            return true;
        });

        const byClause = new Map<SQLClauseContext, MJASTAnnotation[]>();
        const byPlaceholder = new Map<string, MJASTAnnotation>();
        const templateExprs: MJASTAnnotation[] = [];
        const compositionRefs: MJASTAnnotation[] = [];

        for (const ann of deduped) {
            // Index by clause
            const clauseList = byClause.get(ann.clauseContext) || [];
            clauseList.push(ann);
            byClause.set(ann.clauseContext, clauseList);

            // Index by placeholder
            byPlaceholder.set(ann.placeholder, ann);

            // Categorize
            if (ann.templateExpr) templateExprs.push(ann);
            if (ann.compositionRef) compositionRefs.push(ann);
        }

        return { annotations: deduped, byClause, byPlaceholder, templateExprs, compositionRefs };
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

    /** Resolves overloaded Parse() args: (string, dialect?) or (options) */
    private static resolveParseArgs(
        options: SQLParseOptions | string,
        dialect?: string
    ): { sql: string; parserDialect: string } {
        if (typeof options === 'string') {
            return { sql: options, parserDialect: dialect || 'TransactSQL' };
        }
        return { sql: options.sql, parserDialect: options.dialect || 'TransactSQL' };
    }
    private static parseSQL(sql: string, dialect: string): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        try {
            const parser = new Parser();
            return parser.astify(sql, { database: dialect });
        } catch {
            // If direct parse fails, try with FOR XML workaround
            const forXmlResult = SQLParser.stripForXmlDirectives(sql);
            if (forXmlResult) {
                try {
                    const parser = new Parser();
                    const ast = parser.astify(forXmlResult.cleanedSQL, { database: dialect });
                    // Restore the original FOR XML clause on the AST
                    SQLParser.restoreForXmlOnAST(ast, forXmlResult.originalForXml);
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
                SQLParser.walkAST(statement as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
            }

            return SQLParser.deduplicateTables(tableAliasMap);
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

        return SQLParser.deduplicateTables(tableAliasMap);
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
            pos = SQLParser.skipWhitespace(withStripped, pos);
            if (pos >= len) break;

            const remaining = withStripped.substring(pos);
            const cteHeaderMatch = remaining.match(/^(\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s+AS\s*\(/i);
            if (!cteHeaderMatch) break;

            const cteName = cteHeaderMatch[1];
            pos += cteHeaderMatch[0].length;

            const bodyStart = pos;
            pos = SQLParser.findMatchingCloseParen(withStripped, pos);
            const cteBody = withStripped.substring(bodyStart, pos);
            cteDefinitions.push(`${cteName} AS (\n${cteBody}\n)`);
            pos++;

            pos = SQLParser.skipWhitespace(withStripped, pos);
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
                    SQLParser.walkAST(cteAst, tableAliasMap, columnRefs);
                }
            }
        }

        if (node.from) {
            const fromItems = Array.isArray(node.from) ? node.from : [node.from];
            for (const fromItem of fromItems) {
                SQLParser.walkFromItem(fromItem as Record<string, unknown>, tableAliasMap, columnRefs);
            }
        }

        if (node.columns) {
            const cols = Array.isArray(node.columns) ? node.columns : [node.columns];
            for (const col of cols) {
                if (col === '*') continue;
                const colRecord = col as Record<string, unknown>;
                if (colRecord.expr) {
                    SQLParser.walkExpression(colRecord.expr as Record<string, unknown>, columnRefs, tableAliasMap);
                }
            }
        }

        if (node.where) {
            SQLParser.walkExpression(node.where as Record<string, unknown>, columnRefs, tableAliasMap);
        }

        if (node.groupby) {
            const groupbyRecord = node.groupby as Record<string, unknown>;
            const groupItems = groupbyRecord.columns || node.groupby;
            const items = Array.isArray(groupItems) ? groupItems : [groupItems];
            for (const group of items) {
                SQLParser.walkExpression(group as Record<string, unknown>, columnRefs, tableAliasMap);
            }
        }

        if (node.orderby) {
            const orders = Array.isArray(node.orderby) ? node.orderby : [node.orderby];
            for (const order of orders) {
                const orderRecord = order as Record<string, unknown>;
                SQLParser.walkExpression((orderRecord.expr || orderRecord) as Record<string, unknown>, columnRefs, tableAliasMap);
            }
        }

        if (node._next) {
            SQLParser.walkAST(node._next as Record<string, unknown>, tableAliasMap, columnRefs);
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
            SQLParser.walkAST(subqueryAst, tableAliasMap, columnRefs);
        }

        if (fromItem.on) {
            SQLParser.walkExpression(fromItem.on as Record<string, unknown>, columnRefs, tableAliasMap);
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
            SQLParser.walkAST(expr.ast as Record<string, unknown>, tableAliasMap, columnRefs);
        }

        if (expr.left) SQLParser.walkExpression(expr.left as Record<string, unknown>, columnRefs, tableAliasMap);
        if (expr.right) SQLParser.walkExpression(expr.right as Record<string, unknown>, columnRefs, tableAliasMap);
        if (expr.args) {
            const argsRecord = expr.args as Record<string, unknown>;
            const args = argsRecord.value || expr.args;
            const argList = Array.isArray(args) ? args : [args];
            for (const arg of argList) {
                SQLParser.walkExpression(arg as Record<string, unknown>, columnRefs, tableAliasMap);
            }
        }
        if (expr.expr) SQLParser.walkExpression(expr.expr as Record<string, unknown>, columnRefs, tableAliasMap);
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
                    SQLParser.addConditionVariables(token, insideConditional);
                    break;
                case 'MJ_ELIF':
                    SQLParser.addConditionVariables(token, insideConditional);
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
