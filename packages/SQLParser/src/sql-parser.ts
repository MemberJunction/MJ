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
import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { getASTDialectAdapter, type ASTDialectAdapter, type RowCapInfo } from './ASTDialectAdapter.js';
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

/** A column in the SELECT clause with its output alias and source info */
export interface SQLSelectColumn {
    /** The output column name (the AS alias if present, otherwise the source column name) */
    OutputName: string;
    /** The source column name (before AS alias) */
    SourceColumn: string;
    /** Table alias or name qualifier (e.g., "u" in "u.Name"), or null if unqualified */
    TableQualifier: string | null;
    /** Whether this column uses an expression (not a simple column ref) */
    IsExpression: boolean;
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
    /** SQL dialect for parsing and identifier quoting */
    dialect?: SQLParserDialect;
}

/**
 * High-level classification of the statement at the root of a parsed AST.
 *
 * Callers that need to decide whether a statement can be safely modified
 * (row caps, paging, etc.) use this in preference to inspecting AST shapes
 * directly.
 */
export type SQLStatementKind =
    /** Plain SELECT */
    | 'select'
    /** SELECT … INTO #tmp FROM … — a write disguised as a SELECT */
    | 'select-into'
    /** UNION / INTERSECT / EXCEPT */
    | 'set-op'
    /** INSERT / UPDATE / DELETE / MERGE / etc. */
    | 'mutation'
    /** Anything else or an unrecognized shape */
    | 'other';

/**
 * Dialect-neutral description of the outermost row cap on a parsed SELECT.
 * Defined in {@link ./ASTDialectAdapter}; re-exported here so consumers can
 * import it from `@memberjunction/sql-parser` without referencing the adapter.
 * Returned by {@link SQLParser.OuterCap}.
 */
export type { RowCapInfo } from './ASTDialectAdapter.js';

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
 * Two-tier API:
 *   - **Instance** (`new SQLParser(sql, dialect)`) — parses once (with a
 *     preprocessing fallback) and exposes typed, dialect-neutral AST
 *     inspection/mutation (`StatementKind`, `OuterCap`, `SetOuterCap`,
 *     `ToSQL`) plus extraction helpers (`ExtractCTEs`, `ExtractTableRefs`,
 *     `ExtractColumnRefs`, `ExtractSelectColumns`).
 *   - **Static utilities** — pure string/token operations that need no parsed
 *     state (`StripComments`, `Tokenize`, `Analyze`, `ParseSQL`, `SqlifyAST`,
 *     `HasUnwrappableTrailingClause`, the MJ-template helpers, etc.).
 */
export class SQLParser {
    // ─── Instance state ────────────────────────────────
    private readonly _sql: string;
    private readonly _dialect: SQLParserDialect;
    private readonly _adapter: ASTDialectAdapter;
    private readonly _ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null;
    /** alias → original bracketed identifier; set when bracket preprocessing was applied */
    private readonly _aliasMap: Map<string, string> | null;
    /** trailing `OPTION (...)` clause split off during preprocessing; re-appended on ToSQL */
    private readonly _trailingOption: string | null;

    /**
     * Parse SQL into an instance exposing dialect-neutral AST inspection,
     * mutation, and extraction.
     *
     * On a direct-parse failure, applies preprocessing fallbacks — splitting a
     * trailing `OPTION (...)` clause and aliasing bracket-quoted identifiers
     * whose interior contains parser-defeating characters (`[Active People]`,
     * `[my-cte]`) — so a wider class of SQL becomes AST-addressable. {@link ToSQL}
     * transparently restores both transforms.
     *
     * Never throws on unparseable SQL — check {@link IsValid}.
     */
    constructor(sql: string, dialect: SQLParserDialect) {
        this._sql = sql;
        this._dialect = dialect;
        this._adapter = getASTDialectAdapter(dialect);

        // Fast path: direct parse (matches the old static ParseSQL contract).
        const direct = SQLParser.parseSQL(sql, dialect.ParserDialect);
        if (direct) {
            this._ast = direct;
            this._aliasMap = null;
            this._trailingOption = null;
            return;
        }

        // Fallback: preprocess (OPTION split, then bracket aliasing) and retry.
        const pre = SQLParser.preprocessForParse(sql, dialect);
        this._ast = pre.ast;
        this._aliasMap = pre.aliasMap;
        this._trailingOption = pre.trailingOption;
    }

    /** Whether the SQL parsed into an AST (directly or via preprocessing). */
    get IsValid(): boolean {
        return this._ast !== null;
    }

    /** The raw AST. Prefer the typed accessors; this is an escape hatch. */
    get AST(): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        return this._ast;
    }

    /** The dialect supplied at construction. */
    get Dialect(): SQLParserDialect {
        return this._dialect;
    }

    /**
     * Fixes a known node-sql-parser bug where CAST(x AS NVARCHAR(MAX)) is
     * serialized as CAST(x AS NVARCHARmax). Applies to NVARCHAR, VARCHAR,
     * and VARBINARY — all SQL Server types that accept (MAX).
     */
    private static fixMaxTypeSerialization(sql: string): string {
        return sql.replace(/\b(N?VARCHAR|VARBINARY)max\b/gi, '$1(MAX)');
    }

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
    static Astify(sql: string, dialect: SQLParserDialect): MJAstifyResult {
        const parserDialect = dialect.ParserDialect;
        const mjParse = MJLexer.Parse(sql);

        if (!mjParse.hasMJExtensions) {
            const ast = SQLParser.parseSQL(sql, parserDialect);
            return {
                ast,
                mjParse,
                positionMap: new Map(),
                strippedTokens: [],
                cleanSQL: sql,
                astParsed: ast !== null,
                dialect: parserDialect,
            };
        }

        const { cleanSQL, positionMap, strippedTokens } = MJPlaceholderSubstitution.Substitute(sql);
        const ast = SQLParser.parseSQL(cleanSQL, parserDialect);

        return {
            ast,
            mjParse,
            positionMap,
            strippedTokens,
            cleanSQL,
            astParsed: ast !== null,
            dialect: parserDialect,
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
            const sql = parser.sqlify(astToSqlify, { database: result.dialect });
            return SQLParser.fixMaxTypeSerialization(sql);
        }

        return result.mjParse.tokens.map(t => t.raw).join('');
    }

    // ─── Raw SQL Parsing ────────────────────────────────

    /**
     * Parse plain SQL into a node-sql-parser AST.
     * Handles FOR XML multi-directive workaround automatically.
     * Returns null if parsing fails.
     */
    static ParseSQL(sql: string, dialect: SQLParserDialect): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        return SQLParser.parseSQL(sql, dialect.ParserDialect);
    }

    /**
     * Convert a node-sql-parser AST (or array of ASTs) back to a SQL string.
     * This is a thin wrapper around node-sql-parser's sqlify.
     */
    static SqlifyAST(ast: NodeSqlParser.AST | NodeSqlParser.AST[], dialect: SQLParserDialect): string {
        const parser = new Parser();
        const sql = parser.sqlify(Array.isArray(ast) ? ast[0] : ast, { database: dialect.ParserDialect });
        return SQLParser.fixMaxTypeSerialization(sql);
    }

    // ─── AST primitives (instance) ──────────────────────
    //
    // These operate on the instance's parsed AST and hide node-sql-parser's
    // shape behind typed, dialect-neutral accessors. The shape of `top`,
    // `limit`, `into`, `set_op`, etc. is confined to this region and to
    // ASTDialectAdapter — the only places that track those details.
    //
    // All inspect the FIRST statement only (matching SqlifyAST, which
    // serializes only the first); MJ query SQL is single-statement.

    /**
     * High-level classification of the parsed statement:
     * `'select'` | `'select-into'` | `'set-op'` | `'mutation'` | `'other'`.
     */
    get StatementKind(): SQLStatementKind {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root) return 'other';
        const type = root.type;
        if (type !== 'select') {
            if (type === 'insert' || type === 'update' || type === 'delete' || type === 'merge') {
                return 'mutation';
            }
            return 'other';
        }
        const into = root.into as { position?: unknown } | undefined;
        if (into && into.position) return 'select-into';
        if (root.set_op) return 'set-op';
        return 'select';
    }

    /**
     * The outermost row cap on the parsed SELECT, dialect-neutral, or `null`
     * when none is present. Backed by the dialect's ASTDialectAdapter, so the
     * caller never needs to know whether the cap was a `TOP` or `LIMIT`.
     */
    get OuterCap(): RowCapInfo | null {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root || root.type !== 'select') return null;
        return this._adapter.ReadRowCap(root);
    }

    /**
     * Sets the outermost row cap. The adapter writes the dialect's form
     * (`TOP N` on SQL Server, `LIMIT N` elsewhere), preserving any existing
     * OFFSET. No-op when the root isn't a SELECT.
     */
    SetOuterCap(cap: number): void {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root || root.type !== 'select') return;
        this._adapter.WriteRowCap(root, cap);
    }

    /**
     * Removes the outermost row cap from the parsed SELECT. No-op when the
     * root isn't a SELECT.
     *
     * SEEDED: retained for the count-SQL path migration (`buildCountSQLViaAST`)
     * tracked in plans/sql-parser-pipeline-implementation-plan.md. Has no
     * production caller yet by design — wiring it into the count path is a
     * deliberate, separately-tested behavior change (it would also strip
     * `LIMIT` on PostgreSQL count queries).
     */
    ClearOuterCap(): void {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root || root.type !== 'select') return;
        this._adapter.ClearRowCap(root);
    }

    /**
     * Serialize the (possibly mutated) AST back to SQL, restoring any
     * preprocessing transforms applied at construction (bracket-identifier
     * aliases, then the trailing `OPTION (...)` clause).
     *
     * Throws if the SQL was not parseable (check {@link IsValid} first).
     */
    ToSQL(): string {
        if (!this._ast) throw new Error('SQLParser.ToSQL: SQL was not parseable');
        let sql = SQLParser.SqlifyAST(this._ast, this._dialect);
        if (this._aliasMap) sql = SQLParser.restoreAliases(sql, this._aliasMap);
        if (this._trailingOption) sql = `${sql} ${this._trailingOption}`;
        return sql;
    }

    /**
     * Internal helper: unwrap the root statement from an AST (or AST array)
     * and present it as a mutable record. Returns `null` if the input is null
     * or empty.
     */
    private static unwrapRoot(
        ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null,
    ): Record<string, unknown> | null {
        if (!ast) return null;
        const root = Array.isArray(ast) ? ast[0] : ast;
        if (!root) return null;
        return root as unknown as Record<string, unknown>;
    }

    /**
     * Token-aware scan for SQL clauses that cannot legally appear inside a
     * derived table — wrapping a query that contains one of these in
     * `SELECT ... FROM (<sql>) AS t` would produce invalid SQL.
     *
     * Detects (case-insensitive, outside string literals and quoted
     * identifiers):
     *   - `FOR JSON …`
     *   - `FOR XML …`
     *   - `OPTION (…)`
     *
     * The dialect determines which identifier quoting styles are recognized
     * (`[…]` for SQL Server, `` `…` `` for MySQL, `"…"` always).
     */
    static HasUnwrappableTrailingClause(sql: string, dialect: SQLParserDialect): boolean {
        const quoteSample = dialect.QuoteIdentifier('x');
        const recognizeBrackets = quoteSample.startsWith('[');
        const recognizeBackticks = quoteSample.startsWith('`');

        const len = sql.length;
        let i = 0;

        const isWordChar = (ch: string): boolean =>
            (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
            (ch >= '0' && ch <= '9') || ch === '_';

        const isWS = (ch: string): boolean =>
            ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

        const matchWord = (start: number, word: string): boolean => {
            if (start + word.length > len) return false;
            if (sql.substring(start, start + word.length).toUpperCase() !== word) return false;
            const after = start + word.length;
            return after === len || !isWordChar(sql[after]);
        };

        const skipQuoted = (close: string): void => {
            i++;
            while (i < len) {
                if (sql[i] === close) {
                    if (i + 1 < len && sql[i + 1] === close) { i += 2; continue; }
                    i++; break;
                }
                i++;
            }
        };

        while (i < len) {
            const c = sql[i];

            if (c === "'") { skipQuoted("'"); continue; }
            if (recognizeBrackets && c === '[') { skipQuoted(']'); continue; }
            if (c === '"') { skipQuoted('"'); continue; }
            if (recognizeBackticks && c === '`') { skipQuoted('`'); continue; }

            const prevIsWord = i > 0 && isWordChar(sql[i - 1]);
            if (!prevIsWord) {
                if (matchWord(i, 'FOR')) {
                    let j = i + 3;
                    while (j < len && isWS(sql[j])) j++;
                    if (matchWord(j, 'JSON') || matchWord(j, 'XML')) return true;
                }
                if (matchWord(i, 'OPTION')) {
                    let j = i + 6;
                    while (j < len && isWS(sql[j])) j++;
                    if (j < len && sql[j] === '(') return true;
                }
            }

            i++;
        }

        return false;
    }

    /**
     * Strip line and block comments from SQL, preserving content inside
     * string literals and quoted identifiers. Block comments support nesting.
     *
     * The dialect determines which identifier quoting styles are recognized:
     * SQL Server uses `[…]`, PostgreSQL uses `"…"`, MySQL uses `` `…` ``.
     * Double-quoted identifiers are honored on every dialect.
     */
    static StripComments(sql: string, dialect: SQLParserDialect): string {
        const quoteSample = dialect.QuoteIdentifier('x');
        const recognizeBrackets = quoteSample.startsWith('[');
        const recognizeBackticks = quoteSample.startsWith('`');

        let out = '';
        let i = 0;
        const n = sql.length;

        while (i < n) {
            const ch = sql[i];
            const next = i + 1 < n ? sql[i + 1] : '';

            if (ch === '-' && next === '-') {
                while (i < n && sql[i] !== '\n') i++;
                continue;
            }

            if (ch === '/' && next === '*') {
                i += 2;
                let depth = 1;
                while (i < n && depth > 0) {
                    if (i + 1 < n && sql[i] === '/' && sql[i + 1] === '*') {
                        depth++;
                        i += 2;
                    } else if (i + 1 < n && sql[i] === '*' && sql[i + 1] === '/') {
                        depth--;
                        i += 2;
                    } else {
                        i++;
                    }
                }
                continue;
            }

            if (ch === "'") {
                out += ch;
                i++;
                while (i < n) {
                    if (sql[i] === "'") {
                        if (i + 1 < n && sql[i + 1] === "'") {
                            out += "''";
                            i += 2;
                        } else {
                            out += "'";
                            i++;
                            break;
                        }
                    } else {
                        out += sql[i];
                        i++;
                    }
                }
                continue;
            }

            if (recognizeBrackets && ch === '[') {
                out += ch;
                i++;
                while (i < n) {
                    if (sql[i] === ']') {
                        if (i + 1 < n && sql[i + 1] === ']') {
                            out += ']]';
                            i += 2;
                        } else {
                            out += ']';
                            i++;
                            break;
                        }
                    } else {
                        out += sql[i];
                        i++;
                    }
                }
                continue;
            }

            if (ch === '"') {
                out += ch;
                i++;
                while (i < n) {
                    if (sql[i] === '"') {
                        if (i + 1 < n && sql[i + 1] === '"') {
                            out += '""';
                            i += 2;
                        } else {
                            out += '"';
                            i++;
                            break;
                        }
                    } else {
                        out += sql[i];
                        i++;
                    }
                }
                continue;
            }

            if (recognizeBackticks && ch === '`') {
                out += ch;
                i++;
                while (i < n) {
                    if (sql[i] === '`') {
                        if (i + 1 < n && sql[i + 1] === '`') {
                            out += '``';
                            i += 2;
                        } else {
                            out += '`';
                            i++;
                            break;
                        }
                    } else {
                        out += sql[i];
                        i++;
                    }
                }
                continue;
            }

            out += ch;
            i++;
        }

        return out;
    }

    /**
     * Convert a single AST expression node to a SQL string.
     * Useful for extracting ORDER BY terms, column expressions, etc.
     *
     * node-sql-parser's exprToSQL always produces backtick-quoted identifiers
     * regardless of dialect. This method converts backticks to the dialect's
     * native identifier quoting via `dialect.QuoteIdentifier()`.
     */
    static ExprToSQL(expr: unknown, dialect: SQLParserDialect): string {
        const parser = new Parser();
        let sql = parser.exprToSQL(expr);
        sql = SQLParser.fixMaxTypeSerialization(sql);

        // node-sql-parser emits `backtick` quoting; convert to dialect-native quoting
        return sql.replace(/`([^`]+)`/g, (_match, name: string) => dialect.QuoteIdentifier(name));
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
    static Parse(options: SQLParseOptions | string, dialect?: SQLParserDialect): SQLParseResult {
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
    static ParseWithTemplatePreprocessing(options: SQLParseOptions | string, dialect?: SQLParserDialect): SQLParseResult {
        return SQLParser.Parse(options, dialect);
    }

    // ─── Table & Column Extraction ─────────────────────

    /**
     * Extract all table/view references from this instance's SQL.
     * Handles Nunjucks templates via placeholder substitution before AST parsing.
     */
    ExtractTableRefs(): SQLTableReference[] {
        const sql = this._sql;
        const dialect = this._dialect;
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = SQLParser.getCleanSQL(sql);
        const parserDialect = dialect?.ParserDialect || 'TransactSQL';
        const astResult = SQLParser.extractTablesViaAST(cleanSQL, parserDialect);
        if (astResult) return astResult;

        return SQLParser.extractTablesViaRegex(cleanSQL);
    }

    /**
     * Extract all column references from this instance's SQL.
     * Handles Nunjucks templates via placeholder substitution before AST parsing.
     */
    ExtractColumnRefs(): SQLColumnReference[] {
        const sql = this._sql;
        const dialect = this._dialect;
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = SQLParser.getCleanSQL(sql);
        const parserDialect = dialect?.ParserDialect || 'TransactSQL';
        const tableAliasMap = new Map<string, { schemaName: string; tableName: string }>();
        const columnRefs = new Set<string>();

        try {
            const parser = new Parser();
            const ast = parser.astify(cleanSQL, { database: parserDialect });
            const statements = Array.isArray(ast) ? ast : [ast];
            for (const statement of statements) {
                SQLParser.walkAST(statement as unknown as Record<string, unknown>, tableAliasMap, columnRefs);
            }
            return SQLParser.buildColumnRefs(columnRefs);
        } catch {
            return [];
        }
    }

    // ─── SELECT Column Extraction ─────────────────────────

    /**
     * Extracts the SELECT clause columns with their output names, source columns, and table qualifiers.
     *
     * Handles:
     *   - Simple columns: `u.Name` → { OutputName: "Name", SourceColumn: "Name", TableQualifier: "u" }
     *   - AS aliases: `e.Name AS EntityName` → { OutputName: "EntityName", SourceColumn: "Name", TableQualifier: "e" }
     *   - Expressions: `COUNT(*)` → { OutputName: "COUNT(*)", SourceColumn: "COUNT(*)", IsExpression: true }
     *   - MJ template tokens are replaced with placeholders before AST parsing.
     */
    ExtractSelectColumns(): SQLSelectColumn[] {
        const sql = this._sql;
        const dialect = this._dialect;
        if (!sql || sql.trim().length === 0) return [];

        const cleanSQL = SQLParser.getCleanSQL(sql);

        try {
            const parser = new Parser();
            const ast = parser.astify(cleanSQL, { database: dialect.ParserDialect });
            const statements = Array.isArray(ast) ? ast : [ast];
            const columns: SQLSelectColumn[] = [];

            for (const statement of statements) {
                const selectColumns = SQLParser.extractSelectColumnsFromAST(statement);
                columns.push(...selectColumns);
            }

            return columns;
        } catch {
            return [];
        }
    }

    /**
     * Walks an AST statement node to extract SELECT clause column definitions.
     */
    private static extractSelectColumnsFromAST(node: unknown): SQLSelectColumn[] {
        const columns: SQLSelectColumn[] = [];
        if (!node || typeof node !== 'object') return columns;

        const stmt = node as Record<string, unknown>;

        // node-sql-parser SELECT statements have a `columns` array
        const cols = stmt['columns'];
        if (!Array.isArray(cols)) return columns;

        for (const col of cols) {
            if (col === '*') {
                columns.push({
                    OutputName: '*',
                    SourceColumn: '*',
                    TableQualifier: null,
                    IsExpression: false,
                });
                continue;
            }

            if (!col || typeof col !== 'object') continue;
            const colNode = col as Record<string, unknown>;

            // The output alias (AS name), or null
            const asAlias = colNode['as'] as string | null | undefined;

            // The expression node
            const expr = colNode['expr'] as Record<string, unknown> | undefined;
            if (!expr) continue;

            const exprType = expr['type'] as string | undefined;

            if (exprType === 'column_ref') {
                const columnName = expr['column'] as string;
                const table = expr['table'] as string | null;

                columns.push({
                    OutputName: asAlias ?? columnName,
                    SourceColumn: columnName,
                    TableQualifier: table ?? null,
                    IsExpression: false,
                });
            } else {
                // Expression (aggregate, function, etc.)
                const outputName = asAlias ?? SQLParser.exprToString(expr);
                columns.push({
                    OutputName: outputName,
                    SourceColumn: outputName,
                    TableQualifier: null,
                    IsExpression: true,
                });
            }
        }

        return columns;
    }

    /**
     * Best-effort string representation of an AST expression node (for expression columns).
     */
    private static exprToString(expr: Record<string, unknown>): string {
        const type = expr['type'] as string | undefined;
        if (type === 'aggr_func') {
            const name = expr['name'] as string ?? 'EXPR';
            return `${name}(...)`;
        }
        if (type === 'function') {
            const name = (expr['name'] as Record<string, unknown>)?.['name'] as string ?? 'FUNC';
            return `${name}(...)`;
        }
        return 'EXPR';
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
    ExtractCTEs(): SQLCTEExtraction | null {
        const sql = this._sql;
        const dialect = this._dialect;
        // Strip leading whitespace + SQL comments (/* */ and --) so that
        // queries with a descriptive header block are recognized as CTEs.
        // The AST parser handles comments natively, but when it fails
        // (e.g. TRY_CAST, Nunjucks templates) the regex fallback needs
        // the comments gone to see the WITH keyword.
        const stripped = SQLParser.skipLeadingCommentsAndWhitespace(sql);
        if (!/^WITH\s/i.test(stripped)) return null;

        const astResult = SQLParser.extractCTEsViaAST(stripped, dialect.ParserDialect);
        if (astResult) return astResult;

        return SQLParser.extractCTEsViaRegex(stripped);
    }

    /**
     * Strips leading whitespace AND SQL comments from a string.
     * Handles block comments and line comments (-- ...).
     * Returns the remainder starting at the first non-whitespace, non-comment character.
     */
    private static skipLeadingCommentsAndWhitespace(sql: string): string {
        let i = 0;
        const len = sql.length;
        while (i < len) {
            const ch = sql[i];
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
            if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
                i += 2;
                while (i < len - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
                if (i < len - 1) i += 2; else i = len;
                continue;
            }
            if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
                i += 2;
                while (i < len && sql[i] !== '\n') i++;
                continue;
            }
            break;
        }
        return sql.substring(i);
    }

    // ─── MJ Template Extraction ────────────────────────

    /**
     * Renames a template variable in all `{{ variable | filters }}` expressions throughout the SQL.
     * Preserves the filter chain and whitespace formatting.
     *
     * Example: `RenameTemplateVariable("WHERE x = {{ region | sqlString }}", "region", "userRegion")`
     *   → `"WHERE x = {{ userRegion | sqlString }}"`
     *
     * Uses MJLexer for deterministic token identification — no regex guessing.
     */
    static RenameTemplateVariable(sql: string, oldName: string, newName: string): string {
        const tokens = MJLexer.Tokenize(sql);
        const oldNameLower = oldName.toLowerCase();

        // Collect matching tokens in reverse order so positional replacements don't shift offsets
        const matches = tokens
            .filter(t =>
                t.type === 'MJ_TEMPLATE_EXPR' &&
                (t.parsed as MJTemplateExprContent).variable.toLowerCase() === oldNameLower
            )
            .sort((a, b) => b.start - a.start); // reverse order

        let result = sql;
        for (const token of matches) {
            const rebuilt = SQLParser.rebuildTemplateExpr(newName, (token.parsed as MJTemplateExprContent).filters);
            result = result.substring(0, token.start) + rebuilt + result.substring(token.end);
        }

        return result;
    }

    /**
     * Substitutes a template variable with a literal value in all `{{ variable | filters }}` expressions.
     * The entire expression (including filters) is replaced with the literal value, since filters
     * are irrelevant when injecting a concrete value.
     *
     * Example: `SubstituteTemplateVariable("WHERE x = {{ region | sqlString }}", "region", "'West'")`
     *   → `"WHERE x = 'West'"`
     *
     * Uses MJLexer for deterministic token identification — no regex guessing.
     */
    static SubstituteTemplateVariable(sql: string, variableName: string, literalValue: string): string {
        const tokens = MJLexer.Tokenize(sql);
        const varNameLower = variableName.toLowerCase();

        // Collect matching tokens in reverse order
        const matches = tokens
            .filter(t =>
                t.type === 'MJ_TEMPLATE_EXPR' &&
                (t.parsed as MJTemplateExprContent).variable.toLowerCase() === varNameLower
            )
            .sort((a, b) => b.start - a.start);

        let result = sql;
        for (const token of matches) {
            result = result.substring(0, token.start) + literalValue + result.substring(token.end);
        }

        return result;
    }

    /**
     * Rebuilds a `{{ variable | filter1 | filter2(args) }}` template expression string
     * from a variable name and filter chain.
     */
    private static rebuildTemplateExpr(variable: string, filters: MJFilter[]): string {
        if (filters.length === 0) return `{{${variable}}}`;

        const filterChain = filters.map(f => {
            if (f.args.length === 0) return f.name;
            const args = f.args.map(a => typeof a === 'string' ? `'${a}'` : String(a)).join(', ');
            return `${f.name}(${args})`;
        }).join(' | ');

        return `{{${variable} | ${filterChain}}}`;
    }

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
     *
     * Walks tokens with a lexical-scope stack so that loop-local variables
     * introduced by `{% for X in Y %}` blocks are NOT registered as query
     * parameters (they're rebound on each iteration; callers can't supply
     * them). The iterable side of `{% for %}` (`Y`) IS registered as a
     * parameter — typically `array` and required, unless wrapped in
     * `{% if Y %}` which makes it optional.
     *
     * Skip-Brain Bug B: previously this function treated `{{ kw }}` inside
     * `{% for kw in OrgKeywords %}` as a required parameter and failed to
     * register `OrgKeywords` at all. See `__tests__/extract-parameter-info-loops.test.ts`
     * and `SKIP-QUERY-RENDERING-BUGS.md` (Bug B) at the repo root.
     *
     * Infers type from filters, isRequired from conditional block context.
     */
    static ExtractParameterInfo(sql: string): MJParameterInfo[] {
        const tokens = MJLexer.Tokenize(sql);
        const paramMap = new Map<string, MJParameterInfo>();

        // Lexical scope stack: each entry is the set of loop-local variable
        // names introduced by an enclosing {% for %} block.
        const loopScopes: Set<string>[] = [];
        // Set of every loop-local identifier ever introduced during the walk
        // (across all scopes). Used to filter out names that
        // `findConditionalVariables` may have picked up from {% if %} guards
        // surrounding a {{ loopLocal }} expression.
        const everSeenLoopLocals = new Set<string>();
        const isLoopLocal = (variable: string): boolean => {
            // Match the root identifier (e.g. `kw` in `kw.foo`, `kw` in `kw|filter`).
            const root = variable.split(/[.\s|]/, 1)[0];
            for (const scope of loopScopes) {
                if (scope.has(root)) return true;
            }
            return false;
        };

        // Track which iterables appear in {% for X in Y %} so we can register
        // them as array parameters even if Y is never used in a {{ }} expression.
        // Maps iterable name → whether it appears outside a containing {% if %}
        // block (used only to differentiate required vs optional later).
        const loopIterables = new Map<string, { isRequired: boolean }>();
        let conditionalDepth = 0;

        for (const token of tokens) {
            switch (token.type) {
                case 'MJ_FOR_OPEN': {
                    const parsed = token.parsed as MJBlockTagContent;
                    loopScopes.push(new Set(parsed.loopVariable ? [parsed.loopVariable] : []));
                    if (parsed.loopVariable) {
                        everSeenLoopLocals.add(parsed.loopVariable);
                    }
                    if (parsed.loopIterable) {
                        // Iterable identifier — strip filters/whitespace so
                        // `tags | sort` becomes `tags`.
                        const iterableName = parsed.loopIterable.split(/[.\s|]/, 1)[0];
                        if (iterableName && !SQLParser.JINJA_KEYWORDS.has(iterableName.toLowerCase())) {
                            const existing = loopIterables.get(iterableName);
                            // Required only when the for tag is at the top level
                            // (not wrapped in any {% if %}). If wrapped, the iterable
                            // becomes optional — same convention as condition-only vars.
                            const isRequired = existing
                                ? existing.isRequired || conditionalDepth === 0
                                : conditionalDepth === 0;
                            loopIterables.set(iterableName, { isRequired });
                        }
                    }
                    break;
                }
                case 'MJ_ENDFOR':
                    loopScopes.pop();
                    break;
                case 'MJ_IF_OPEN':
                    conditionalDepth++;
                    break;
                case 'MJ_ENDIF':
                    conditionalDepth = Math.max(0, conditionalDepth - 1);
                    break;
                case 'MJ_TEMPLATE_EXPR': {
                    const parsed = token.parsed as MJTemplateExprContent;
                    const varName = parsed.variable;

                    // Skip if the variable's root is a loop local, or if the
                    // variable is a Nunjucks built-in (loop, loop.last, etc.).
                    if (isLoopLocal(varName)) break;
                    const root = varName.split(/[.\s]/, 1)[0];
                    if (root.toLowerCase() === 'loop') break;

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
                    break;
                }
            }
        }

        // Predicates used to filter out names that look like parameters but
        // are actually loop locals or Nunjucks built-ins.
        const isLoopBuiltin = (varName: string): boolean => {
            const root = varName.split(/[.\s]/, 1)[0].toLowerCase();
            // `loop` is the Nunjucks-provided namespace inside {% for %} blocks
            // (`loop.last`, `loop.first`, `loop.index`, etc.). Members of the
            // namespace get extracted as bare identifiers (`last`, `first`,
            // `index`) by addConditionVariables's regex split.
            return root === 'loop'
                || root === 'last' || root === 'first'
                || root === 'index' || root === 'index0'
                || root === 'revindex' || root === 'revindex0'
                || root === 'length' || root === 'cycle';
        };

        const conditionalVars = SQLParser.findConditionalVariables(tokens);
        for (const [varName, param] of paramMap) {
            if (conditionalVars.onlyInConditional.has(varName)) {
                param.isRequired = false;
            }
        }

        // Variables that appear only in {% if %}/{% elif %} condition expressions
        // (never in a {{ }} template expression) still need to be surfaced as
        // optional parameters so callers can supply them at runtime.
        // EXCEPT: loop locals (introduced by {% for %}), Nunjucks loop built-ins
        // (loop, loop.last, etc.), and identifiers we've already classified as
        // loop iterables.
        for (const varName of conditionalVars.onlyInConditional) {
            if (paramMap.has(varName)) continue;
            const root = varName.split(/[.\s]/, 1)[0];
            if (everSeenLoopLocals.has(root)) continue;
            if (isLoopBuiltin(varName)) continue;
            if (loopIterables.has(varName)) continue;
            paramMap.set(varName, {
                name: varName,
                type: 'string',
                isRequired: false,
                defaultValue: null,
                filters: [],
                usageLocations: [],
            });
        }

        // Register loop iterables that aren't already in the param map.
        // If the iterable is also referenced as a {{ }} expression elsewhere
        // (already in paramMap), keep its existing entry but ensure it's marked
        // as array type — the {% for %} usage is a stronger type signal.
        for (const [iterableName, { isRequired }] of loopIterables) {
            const existing = paramMap.get(iterableName);
            if (existing) {
                existing.type = 'array';
                // If the iterable also appears inside an {% if %} guard, keep
                // it optional; if it's at top level somewhere, mark required.
                if (!conditionalVars.onlyInConditional.has(iterableName)) {
                    existing.isRequired = existing.isRequired && isRequired;
                }
            } else {
                paramMap.set(iterableName, {
                    name: iterableName,
                    type: 'array',
                    isRequired,
                    defaultValue: null,
                    filters: [],
                    usageLocations: [],
                });
            }
        }

        // Enrich parameters with default values extracted from {% else %} blocks.
        // Pattern: {% if Var %} ... {{ Var | sqlFilter }} ... {% else %} ... = 'literal' ... {% endif %}
        // The literal in the else branch is the semantic default for the parameter.
        SQLParser.enrichDefaultsFromElseBranches(sql, paramMap);

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
        dialect?: SQLParserDialect
    ): { sql: string; parserDialect: string } {
        if (typeof options === 'string') {
            return { sql: options, parserDialect: dialect?.ParserDialect || 'TransactSQL' };
        }
        return { sql: options.sql, parserDialect: options.dialect?.ParserDialect || 'TransactSQL' };
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

    // ═══════════════════════════════════════════════════
    // Private: Parse Preprocessing (fallback + restoration)
    // ═══════════════════════════════════════════════════

    /**
     * Last-resort parse used when a direct parse fails. Rewrites SQL into a
     * form node-sql-parser accepts:
     *   1. Split a trailing `OPTION (...)` query hint (SQL Server).
     *   2. Alias bracket-quoted identifiers whose interior contains
     *      parser-defeating characters (`[Active People]`, `[my-cte]`).
     *
     * Returns the AST plus the data needed to restore the original SQL on
     * {@link ToSQL}. `ast` is `null` when even the rewritten SQL is unparseable
     * (or when no transform applied — nothing new to try).
     */
    private static preprocessForParse(
        sql: string,
        dialect: SQLParserDialect,
    ): {
        ast: NodeSqlParser.AST | NodeSqlParser.AST[] | null;
        aliasMap: Map<string, string> | null;
        trailingOption: string | null;
    } {
        const noResult = { ast: null, aliasMap: null, trailingOption: null };
        let work = sql;

        // 1. Trailing OPTION (...) — always at the outermost level.
        const optionSplit = SQLParser.splitTrailingOption(work, dialect);
        const trailingOption = optionSplit ? optionSplit.optionClause : null;
        if (optionSplit) work = optionSplit.sqlWithoutOption;

        // 2. Bracket-identifier aliasing (SQL Server bracket quoting only).
        const aliased = SQLParser.aliasBracketIdentifiers(work, dialect);
        if (aliased.forward.size > 0) work = aliased.rewritten;
        const aliasMap = aliased.forward.size > 0
            ? new Map<string, string>(
                Array.from(aliased.forward, ([interior, alias]) => [alias, `[${interior}]`]),
              )
            : null;

        // No transform applied → re-parsing the same SQL would just fail again.
        if (work === sql) return noResult;

        const ast = SQLParser.parseSQL(work, dialect.ParserDialect);
        if (!ast) return noResult;
        return { ast, aliasMap, trailingOption };
    }

    /**
     * Token-aware scan for a trailing `OPTION (...)` query hint at the
     * outermost level (outside string literals, quoted identifiers, and
     * comments). Returns the SQL without the clause plus the clause text, or
     * `null` when there is no trailing OPTION.
     */
    private static splitTrailingOption(
        sql: string,
        dialect: SQLParserDialect,
    ): { sqlWithoutOption: string; optionClause: string } | null {
        const quoteSample = dialect.QuoteIdentifier('x');
        const recognizeBrackets = quoteSample.startsWith('[');
        const recognizeBackticks = quoteSample.startsWith('`');
        const n = sql.length;
        const isWordChar = (ch: string): boolean =>
            (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
            (ch >= '0' && ch <= '9') || ch === '_';

        let i = 0;
        let optionStart = -1;
        while (i < n) {
            const ch = sql[i];
            if (ch === "'") { i = SQLParser.skipQuotedFrom(sql, i, "'"); continue; }
            if (ch === '"') { i = SQLParser.skipQuotedFrom(sql, i, '"'); continue; }
            if (recognizeBrackets && ch === '[') { i = SQLParser.skipQuotedFrom(sql, i, ']'); continue; }
            if (recognizeBackticks && ch === '`') { i = SQLParser.skipQuotedFrom(sql, i, '`'); continue; }
            if (ch === '-' && i + 1 < n && sql[i + 1] === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
            if (ch === '/' && i + 1 < n && sql[i + 1] === '*') {
                i += 2;
                while (i < n && !(sql[i] === '*' && i + 1 < n && sql[i + 1] === '/')) i++;
                if (i < n) i += 2;
                continue;
            }

            const prevIsWord = i > 0 && isWordChar(sql[i - 1]);
            if (!prevIsWord && i + 6 <= n && sql.substring(i, i + 6).toUpperCase() === 'OPTION' &&
                (i + 6 === n || !isWordChar(sql[i + 6]))) {
                let j = i + 6;
                while (j < n && /\s/.test(sql[j])) j++;
                if (j < n && sql[j] === '(') {
                    optionStart = i; // remember the last top-level OPTION (
                    i = j;
                    continue;
                }
            }
            i++;
        }

        if (optionStart === -1) return null;

        // Match the balanced paren group following OPTION.
        let k = optionStart + 6;
        while (k < n && /\s/.test(sql[k])) k++;
        let depth = 0;
        for (; k < n; k++) {
            const ch = sql[k];
            if (ch === "'") { k = SQLParser.skipQuotedFrom(sql, k, "'") - 1; continue; }
            if (ch === '(') depth++;
            else if (ch === ')') { depth--; if (depth === 0) { k++; break; } }
        }
        if (depth !== 0) return null; // unbalanced — leave alone

        const rest = sql.substring(k).trim();
        if (rest !== '' && rest !== ';') return null; // not a trailing OPTION

        return {
            sqlWithoutOption: sql.substring(0, optionStart).trimEnd(),
            optionClause: sql.substring(optionStart, k).trim(),
        };
    }

    /**
     * Token-aware scan that aliases bracket-quoted identifiers whose interior
     * contains characters node-sql-parser can't handle (`[Active People]`,
     * `[my-cte]`, `[dbo.table]`). Aliases are stable, collision-safe tokens
     * (`_mjid_<seq>`). Applies only to bracket-quoting dialects (SQL Server).
     *
     * Returns the rewritten SQL plus a forward map (original interior → alias).
     */
    private static aliasBracketIdentifiers(
        sql: string,
        dialect: SQLParserDialect,
    ): { rewritten: string; forward: Map<string, string> } {
        const forward = new Map<string, string>();
        if (!dialect.QuoteIdentifier('x').startsWith('[')) return { rewritten: sql, forward };

        const n = sql.length;
        let out = '';
        let i = 0;
        let seq = 0;
        while (i < n) {
            const ch = sql[i];
            if (ch === '-' && i + 1 < n && sql[i + 1] === '-') {
                while (i < n && sql[i] !== '\n') { out += sql[i]; i++; }
                continue;
            }
            if (ch === '/' && i + 1 < n && sql[i + 1] === '*') {
                out += '/*'; i += 2;
                while (i < n && !(sql[i] === '*' && i + 1 < n && sql[i + 1] === '/')) { out += sql[i]; i++; }
                if (i < n) { out += '*/'; i += 2; }
                continue;
            }
            if (ch === "'" || ch === '"' || ch === '`') {
                const close = ch;
                const end = SQLParser.skipQuotedFrom(sql, i, close);
                out += sql.substring(i, end);
                i = end;
                continue;
            }
            if (ch === '[') {
                // Read the interior, honoring the ]] escape for a literal ].
                let j = i + 1;
                let interior = '';
                while (j < n) {
                    if (sql[j] === ']') {
                        if (j + 1 < n && sql[j + 1] === ']') { interior += ']'; j += 2; continue; }
                        j++; break;
                    }
                    interior += sql[j]; j++;
                }
                if (interior.length > 0 && /[^A-Za-z0-9_]/.test(interior)) {
                    let alias = forward.get(interior);
                    if (!alias) { alias = `_mjid_${seq++}`; forward.set(interior, alias); }
                    // Emit a BARE identifier — node-sql-parser rejects bracket-quoted
                    // CTE names entirely, so the alias must be unbracketed. sqlify
                    // re-quotes it ([_mjid_0]); restoreAliases handles every form.
                    out += alias;
                } else {
                    out += sql.substring(i, j); // leave non-problematic identifiers untouched
                }
                i = j;
                continue;
            }
            out += ch; i++;
        }
        return { rewritten: out, forward };
    }

    /**
     * Reverses bracket-identifier aliasing on a sqlify result. node-sql-parser
     * may emit the alias bare, bracketed, or backticked; all three forms are
     * restored to the original bracketed identifier. Aliases are unique
     * `_mjid_<seq>` tokens, so replacement is unambiguous.
     */
    private static restoreAliases(sql: string, aliasMap: Map<string, string>): string {
        let out = sql;
        for (const [alias, originalBracketed] of aliasMap) {
            out = out.split(`[${alias}]`).join(originalBracketed);
            out = out.split('`' + alias + '`').join(originalBracketed);
            out = out.replace(new RegExp(`\\b${alias}\\b`, 'g'), originalBracketed);
        }
        return out;
    }

    /**
     * Advances past a quoted span starting at `start` (whose opening char is
     * `sql[start]`), honoring the doubled-delimiter escape (`''`, `]]`, `""`,
     * `` `` ``). Returns the index just past the closing delimiter.
     */
    private static skipQuotedFrom(sql: string, start: number, close: string): number {
        const n = sql.length;
        let i = start + 1;
        while (i < n) {
            if (sql[i] === close) {
                if (i + 1 < n && sql[i + 1] === close) { i += 2; continue; }
                return i + 1;
            }
            i++;
        }
        return n;
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
                const bodySQL = SQLParser.fixMaxTypeSerialization(
                    parser.sqlify(cteRecord.stmt.ast as NodeSqlParser.AST, { database: dialect })
                );
                cteDefinitions.push(`${cteName} AS (\n${bodySQL}\n)`);
            }

            const mainAst = { ...singleAst, with: null } as unknown as NodeSqlParser.AST;
            const mainStatement = SQLParser.fixMaxTypeSerialization(
                parser.sqlify(mainAst, { database: dialect })
            );

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

    /**
     * Extracts the primary variable name from an {% if %} condition expression.
     * Handles patterns like:
     *   "Status"                         → "Status"
     *   "Status and Status.length > 0"   → "Status"
     *   "StartDate and StartDate.length" → "StartDate"
     */
    private static extractConditionVariable(condition: string): string | null {
        const match = condition.match(/^\s*([A-Za-z_]\w*)/);
        return match ? match[1] : null;
    }

    /**
     * Extracts a SQL literal value from an {% else %} branch body.
     * Looks for patterns like:
     *   `= 'Attended'`    → "Attended"
     *   `= 42`            → 42
     *   `= 3.14`          → 3.14
     *
     * Only returns a value when exactly one literal is found, to avoid
     * ambiguity from complex else bodies with multiple conditions.
     */
    private static extractLiteralFromElseBody(body: string): string | number | null {
        // Match string literals: = 'value' (SQL single-quoted strings)
        const stringMatches = [...body.matchAll(/=\s*'([^']+)'/g)];
        if (stringMatches.length === 1) {
            return stringMatches[0][1];
        }

        // Match numeric literals: = 42 or = 3.14 (but not parts of column names)
        const numericMatches = [...body.matchAll(/=\s*(-?\d+(?:\.\d+)?)\b/g)];
        if (numericMatches.length === 1 && stringMatches.length === 0) {
            const num = Number(numericMatches[0][1]);
            return isNaN(num) ? null : num;
        }

        return null;
    }

    /**
     * Enriches parameters that lack default values by inspecting {% else %} branches
     * of conditional blocks. When a block guards a parameter with {% if Var %} and
     * the else branch contains a single literal value (e.g., `= 'Attended'`), that
     * literal is assigned as the parameter's default.
     *
     * Only sets defaults on parameters that don't already have one (from a `| default()` filter).
     */
    private static enrichDefaultsFromElseBranches(
        sql: string,
        paramMap: Map<string, MJParameterInfo>
    ): void {
        const blocks = SQLParser.ExtractConditionalBlocks(sql);

        for (const block of blocks) {
            // Need at least 2 branches (if + else) and last branch must be else (condition === null)
            if (block.branches.length < 2) continue;
            const elseBranch = block.branches[block.branches.length - 1];
            if (elseBranch.condition !== null) continue;

            // Extract the variable from the if-condition
            const ifCondition = block.branches[0].condition;
            if (!ifCondition) continue;

            const varName = SQLParser.extractConditionVariable(ifCondition);
            if (!varName) continue;

            // Only enrich parameters that exist and don't already have a default
            const param = paramMap.get(varName);
            if (!param || param.defaultValue !== null) continue;

            const literal = SQLParser.extractLiteralFromElseBody(elseBranch.body.raw);
            if (literal !== null) {
                param.defaultValue = literal;
            }
        }
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

    /** Jinja2 keywords that should never be treated as user-defined variables. */
    private static readonly JINJA_KEYWORDS = new Set([
        'and', 'or', 'not', 'in', 'is', 'true', 'false', 'none', 'null', 'undefined',
        'if', 'elif', 'else', 'endif', 'for', 'endfor',
    ]);

    private static addConditionVariables(token: MJToken, varSet: Set<string>): void {
        const parsed = token.parsed as MJBlockTagContent;
        if (parsed.expression) {
            // Strip quoted string literals first so 'Year', "active", etc. don't
            // get mistaken for variable identifiers.
            const withoutStrings = parsed.expression.replace(/'[^']*'|"[^"]*"/g, '');
            const identifiers = withoutStrings.match(/\b[A-Za-z_]\w*\b/g) || [];
            for (const id of identifiers) {
                if (!SQLParser.JINJA_KEYWORDS.has(id.toLowerCase())) {
                    varSet.add(id);
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
