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
import { ClearRowCap, ReadRowCap, RowCapFieldFor, WriteRowCap, type RowCapField, type RowCapInfo } from './legacy/nodeSqlRowCap.js';
import { IsKeyword, LexSQL, SignificantTokens } from './sqlLexer.js';
import type { LexDialect } from './sqlLexer.js';
import { FixMaxTypeSerialization, NodeSqlParse } from './legacy/nodeSqlParserCore.js';
import {
    LegacyCTEExtraction, LegacyColumnReferencesChecked, LegacyParse, LegacySelectColumnsChecked, LegacyTableReferences,
} from './legacy/legacyExtractors.js';
import type { CheckedColumnReferences, CheckedSelectColumns } from './legacy/legacyExtractors.js';
import {
    LegacyCompositionRefs, LegacyConditionalBlocks, LegacyParameterInfo, LegacyTemplateExpressions, RebuildLegacyTemplateExpr,
    ReplaceLegacyTemplateVariable,
} from './legacy/legacyTemplateExtractors.js';
import {
    MJToken,
    MJTemplateExpr,
    MJCompositionRef,
    MJConditionalBlock,
    MJFilter,
    MJTemplateExprContent,
    MJCompositionRefContent,
    PlaceholderEntry,
    PlaceholderSubstitutionResult,
    MJParseResult,
    SQLClauseContext,
    MJASTAnnotation,
    MJASTWalkResult,
} from './mj-ast-types.js';

export type { CheckedColumnReferences, CheckedSelectColumns } from './legacy/legacyExtractors.js';

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
 * Defined in `legacy/nodeSqlRowCap`; re-exported here so consumers can
 * import it from `@memberjunction/sql-parser`.
 * Returned by {@link SQLParser.OuterCap}.
 */
export type { RowCapInfo } from './legacy/nodeSqlRowCap.js';

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
    /** The AST field the dialect's grammar keeps the row cap on. */
    private readonly _rowCapField: RowCapField;
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
     * (`[Active People]`, `[my-cte]`, bracket-quoted CTE names) — so a wider
     * class of SQL becomes AST-addressable. {@link ToSQL}
     * transparently restores both transforms.
     *
     * Never throws on unparseable SQL — check {@link IsValid}.
     * @deprecated Use `SqlDocument.Parse(sql, dialect)` to read a statement, and `StrictFragmentValidator` to screen untrusted SQL.
     */
    constructor(sql: string, dialect: SQLParserDialect) {
        this._sql = sql;
        this._dialect = dialect;
        this._rowCapField = RowCapFieldFor(dialect);

        // Fast path: direct parse (matches the old static ParseSQL contract).
        const direct = NodeSqlParse(sql, dialect.ParserDialect);
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

    /**
     * Whether the SQL parsed into an AST (directly or via preprocessing).
     * @deprecated Use `SqlDocument.Parse(sql, dialect).IsComplete`, or `StrictFragmentValidator` to screen untrusted SQL.
     */
    get IsValid(): boolean {
        return this._ast !== null;
    }

    /**
     * The raw AST. Prefer the typed accessors; this is an escape hatch.
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    get AST(): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        return this._ast;
    }

    /**
     * The bracket identifiers the fallback parse renamed, as the name in {@link AST} mapped to the
     * original bracketed text (for example `[My CTE]`). Null when the direct parse succeeded, so
     * every identifier in the tree is as written. A name in this map is in the tree only where the
     * fallback put it: no such name occurs in the SQL, and none runs into the text next to it.
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    get IdentifierAliases(): ReadonlyMap<string, string> | null {
        return this._aliasMap;
    }

    /**
     * True when `name` has the form of a name the fallback parse gives a renamed bracket
     * identifier ({@link IdentifierAliases}), ignoring case: `_mjid_<n>`, or `_mjid<k>_<n>` when
     * the SQL already contains `_mjid_`.
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    static IsIdentifierAliasName(name: string): boolean {
        return SQLParser.ALIAS_NAME.test(name);
    }

    /**
     * The dialect supplied at construction.
     * @deprecated Use `SqlDocument.Dialect`.
     */
    get Dialect(): SQLParserDialect {
        return this._dialect;
    }

    /**
     * The SQL supplied at construction, as written.
     * @deprecated Use `SqlDocument.Text()`.
     */
    get SQL(): string {
        return this._sql;
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
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    static Astify(sql: string, dialect: SQLParserDialect): MJAstifyResult {
        const parserDialect = dialect.ParserDialect;
        const mjParse = MJLexer.Parse(sql);

        if (!mjParse.hasMJExtensions) {
            const ast = NodeSqlParse(sql, parserDialect);
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
        const ast = NodeSqlParse(cleanSQL, parserDialect);

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
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    static Sqlify(result: MJAstifyResult): string {
        if (!result.mjParse.hasMJExtensions && result.ast) {
            const parser = new Parser();
            const astToSqlify = Array.isArray(result.ast) ? result.ast[0] : result.ast;
            const sql = parser.sqlify(astToSqlify, { database: result.dialect });
            return FixMaxTypeSerialization(sql);
        }

        return result.mjParse.tokens.map(t => t.raw).join('');
    }

    // ─── Raw SQL Parsing ────────────────────────────────

    /**
     * Parse plain SQL into a node-sql-parser AST.
     * Handles FOR XML multi-directive workaround automatically.
     * Returns null if parsing fails.
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`. To refuse unparseable caller SQL, use `StrictFragmentValidator`.
     */
    static ParseSQL(sql: string, dialect: SQLParserDialect): NodeSqlParser.AST | NodeSqlParser.AST[] | null {
        return NodeSqlParse(sql, dialect.ParserDialect);
    }

    /**
     * Convert a node-sql-parser AST (or array of ASTs) back to a SQL string.
     * This is a thin wrapper around node-sql-parser's sqlify.
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    static SqlifyAST(ast: NodeSqlParser.AST | NodeSqlParser.AST[], dialect: SQLParserDialect): string {
        const parser = new Parser();
        const sql = parser.sqlify(Array.isArray(ast) ? ast[0] : ast, { database: dialect.ParserDialect });
        return FixMaxTypeSerialization(sql);
    }

    // ─── AST primitives (instance) ──────────────────────
    //
    // These operate on the instance's parsed AST and hide node-sql-parser's
    // shape behind typed, dialect-neutral accessors. The shape of `top`,
    // `limit`, `into`, `set_op`, etc. is confined to this region and to
    // legacy/nodeSqlRowCap — the only places that track those details.
    //
    // All inspect the FIRST statement only (matching SqlifyAST, which
    // serializes only the first); MJ query SQL is single-statement.

    /**
     * High-level classification of the parsed statement:
     * `'select'` | `'select-into'` | `'set-op'` | `'mutation'` | `'other'`.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).StatementKinds()`.
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
     * node-sql-parser statement `type` values that write/modify rather than read.
     * Used by {@link HasWriteStatement} to reject such statements anywhere in a
     * rendered read query (including a stacked injection payload).
     */
    private static readonly WRITE_STATEMENT_TYPES = new Set<string>([
        'insert', 'update', 'delete', 'merge', 'replace',        // DML
        'drop', 'create', 'alter', 'truncate', 'rename',         // DDL
        'call', 'exec', 'execute', 'grant', 'revoke', 'use',     // exec / DCL / context
    ]);

    /**
     * Whether ANY top-level statement is a write — a DML mutation
     * (INSERT/UPDATE/DELETE/MERGE/REPLACE), DDL (DROP/CREATE/ALTER/TRUNCATE/
     * RENAME), or EXEC/CALL/GRANT/REVOKE/USE.
     *
     * Unlike {@link StatementKind} (which classifies only the first statement),
     * this inspects EVERY top-level statement, so a stacked payload such as
     * `SELECT 1; DROP TABLE x` is detected. Benign session prefixes (`SET`,
     * `DECLARE`) and SELECTs are not writes. Matching is on the AST statement
     * type, so the `REPLACE()` string function inside a SELECT is never
     * mistaken for a `REPLACE` statement.
     * @deprecated Must not be used to decide whether SQL is safe to run: it returns false whenever node-sql-parser cannot parse the SQL, so a write it cannot read passes. Use `SqlDocument.Parse(sql, dialect).IsReadOnly()` (fails closed) or `StrictFragmentValidator.ValidateReadOnlyStatement`.
     */
    get HasWriteStatement(): boolean {
        if (!this._ast) return false;
        const statements = Array.isArray(this._ast) ? this._ast : [this._ast];
        for (const stmt of statements) {
            const type = (stmt as unknown as Record<string, unknown>).type;
            if (typeof type === 'string' && SQLParser.WRITE_STATEMENT_TYPES.has(type.toLowerCase())) {
                return true;
            }
        }
        return false;
    }

    /**
     * The outermost row cap on the parsed SELECT, dialect-neutral, or `null`
     * when none is present. Read from the AST field the dialect's grammar uses, so the
     * caller never needs to know whether the cap was a `TOP` or `LIMIT`.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).RowCaps()` or `AnalyzePagingShape`.
     */
    get OuterCap(): RowCapInfo | null {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root || root.type !== 'select') return null;
        return ReadRowCap(root, this._rowCapField);
    }

    /**
     * Sets the outermost row cap, in the dialect's form
     * (`TOP N` on SQL Server, `LIMIT N` elsewhere), preserving any existing
     * OFFSET. No-op when the root isn't a SELECT.
     * @deprecated Use the `SetRowCap` transform, which edits the SQL text as written.
     */
    SetOuterCap(cap: number): void {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root || root.type !== 'select') return;
        WriteRowCap(root, this._rowCapField, cap);
    }

    /**
     * Removes the outermost row cap (TOP on SQL Server, LIMIT on PostgreSQL)
     * from the parsed SELECT. No-op when the root isn't a SELECT.
     *
     * Used by the count-SQL builder (`queryPagingEngine.stripCountBody`) so a
     * paged query's count reflects the full set rather than the capped subset.
     * It clears both forms, so a PostgreSQL count drops an explicit `LIMIT` —
     * consistent with how SQL Server's `TOP` is dropped.
     * @deprecated Use the `SetRowCap` / `ReplaceSelectList` transforms, which edit the SQL text as written.
     */
    ClearOuterCap(): void {
        const root = SQLParser.unwrapRoot(this._ast);
        if (!root || root.type !== 'select') return;
        ClearRowCap(root, this._rowCapField);
    }

    /**
     * Removes the top-level ORDER BY from the parsed statement, following the
     * set-op (`UNION` / `INTERSECT` / `EXCEPT`) chain so an ORDER BY on any
     * branch is cleared. No-op when there is none. Dialect-universal — the
     * `orderby` field has the same shape across dialects.
     *
     * Used by the count-SQL builder: ORDER BY is irrelevant for a COUNT and is
     * illegal inside a SQL Server CTE without TOP.
     * @deprecated Use the `StripOrderBy` transform, which removes exactly the ORDER BY span.
     */
    ClearOrderBy(): void {
        let node = SQLParser.unwrapRoot(this._ast);
        while (node) {
            if (node.orderby) node.orderby = null;
            node = (node._next as Record<string, unknown> | null) ?? null;
        }
    }

    /**
     * Serialize the (possibly mutated) AST back to SQL, restoring any
     * preprocessing transforms applied at construction (bracket-identifier
     * aliases, then the trailing `OPTION (...)` clause).
     *
     * Throws if the SQL was not parseable (check {@link IsValid} first).
     * @deprecated Use `EditSet.Apply()` on the original text; this regenerates the SQL from the node-sql-parser tree.
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
     * Whether the statement ends in a clause that cannot legally appear inside a derived table,
     * so wrapping it in `SELECT ... FROM (<sql>) AS t` would produce invalid SQL:
     *   - `FOR JSON …` / `FOR XML …` at the top level
     *   - a trailing query-hint clause ({@link SQLParserDialect.QueryHintKeyword}, `OPTION (…)` on SQL Server)
     *
     * Only the top level of the statement counts. The same words inside a subquery (a correlated
     * `(SELECT … FOR JSON PATH)` column), a string literal, a quoted identifier or a comment do
     * not stop a wrap.
     * @deprecated Use `SqlDocument.Parse(sql, dialect)`: its top-level query exposes the `For` and `Option` tail clauses.
     */
    static HasUnwrappableTrailingClause(sql: string, dialect: SQLParserDialect): boolean {
        const top = SignificantTokens(LexSQL(sql, dialect)).filter(t => t.Depth === 0);
        const hintKeyword = dialect.QueryHintKeyword?.toUpperCase();
        return top.some((t, i) =>
            (IsKeyword(t, 'FOR') && (IsKeyword(top[i + 1], 'JSON') || IsKeyword(top[i + 1], 'XML'))) ||
            (hintKeyword !== undefined && IsKeyword(t, hintKeyword) && top[i + 1]?.Kind === 'open'));
    }

    /**
     * Token-aware detection of stacked statements: a statement-separating
     * semicolon that has real content after it (outside string literals,
     * quoted identifiers, and comments). A single trailing semicolon — or a run
     * of them followed only by whitespace/comments — is allowed.
     *
     * Reads the tokens {@link LexSQL} produces for the dialect, so every quoted
     * form the database recognizes hides its contents: `[…]` identifiers on SQL
     * Server, `E'…'` strings with backslash escapes and dollar-quoted strings on
     * PostgreSQL, and nested block comments on both.
     *
     * Unlike an AST check, this fires even when the trailing payload makes the
     * SQL unparseable (`SELECT 1; EXEC xp_cmdshell '…'`, `SELECT 1; WAITFOR
     * DELAY '…'`), which is exactly the stacked-injection class an AST scan
     * misses (the whole string fails to parse, so the AST is null). A rendered
     * read query must be a single statement, so any internal `;` is rejected.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).HasStackedStatements()`.
     */
    static HasStackedStatements(sql: string, dialect: LexDialect): boolean {
        let sawSemicolon = false;
        // A semicolon before any content (the `;WITH` idiom) separates nothing.
        let sawContent = false;
        for (const token of SignificantTokens(LexSQL(sql, dialect))) {
            if (token.Kind === 'semicolon') {
                if (sawContent) sawSemicolon = true;
                continue;
            }
            // Real content after a separating semicolon is a second statement.
            if (sawSemicolon) return true;
            sawContent = true;
        }
        return false;
    }

    /**
     * Strip line and block comments from SQL, preserving content inside string literals and
     * quoted identifiers. Block comments nest. A block comment is replaced by a space, so two
     * tokens it separated with no whitespace stay apart; a line comment's ending newline is kept.
     *
     * The dialect determines which literal and identifier forms are recognized: SQL Server
     * `[…]`, PostgreSQL `E'…'` and dollar-quoted strings (`$$…$$`, `$tag$…$tag$`), MySQL
     * `` `…` ``. Double-quoted identifiers are honored on every dialect.
     * @deprecated Use `SqlTokens.Lex(sql, dialect)` and keep the tokens that are not comments.
     */
    static StripComments(sql: string, dialect: LexDialect): string {
        return LexSQL(sql, dialect)
            .map(t => t.Kind !== 'comment' ? t.Text : t.Text.startsWith('/*') ? ' ' : '')
            .join('');
    }

    /**
     * Convert a single AST expression node to a SQL string.
     * Useful for extracting ORDER BY terms, column expressions, etc.
     *
     * node-sql-parser's exprToSQL always produces backtick-quoted identifiers
     * regardless of dialect. This method converts backticks to the dialect's
     * native identifier quoting via `dialect.QuoteIdentifier()`.
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`.
     */
    static ExprToSQL(expr: unknown, dialect: SQLParserDialect): string {
        const parser = new Parser();
        let sql = parser.exprToSQL(expr);
        sql = FixMaxTypeSerialization(sql);

        // node-sql-parser emits `backtick` quoting; convert to dialect-native quoting
        return sql.replace(/`([^`]+)`/g, (_match, name: string) => dialect.QuoteIdentifier(name));
    }

    // ─── Tokenization ──────────────────────────────────

    /**
     * Tokenize MJ SQL into an ordered list of tokens.
     * Returns MJ tokens (template expressions, composition refs, block tags, comments)
     * interleaved with SQL_TEXT tokens for the plain SQL segments.
     * @deprecated Kept unchanged for callers that splice by its offsets; it reports tags inside SQL comments too. Use `QueryTemplate.Parse(sql, dialect)` (its `Nodes` and `Tokens`).
     */
    static Tokenize(sql: string): MJToken[] {
        return MJLexer.Tokenize(sql);
    }

    /**
     * Tokenize and return a summary with boolean flags.
     * Useful for quick checks like "does this SQL have MJ extensions?"
     * @deprecated Kept unchanged, paired with `Substitute`. Use `SqlTokens.Lex(sql, dialect).HasTemplate` and `QueryTemplate.Parse(sql, dialect)`.
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
     * @deprecated Kept unchanged, paired with `Astify`. Read templates with `QueryTemplate.Parse(sql, dialect)`.
     */
    static Substitute(sql: string): PlaceholderSubstitutionResult {
        return MJPlaceholderSubstitution.Substitute(sql);
    }

    // ─── Extractors (deprecated) ─────────────────────────
    // Reimplemented on the MJ Query lexer, the template tree and SqlDocument. Their result shapes
    // are unchanged; their values are what a full structural read gives: CTE names are not tables,
    // nothing is read from a comment or string, CTE text is the author's own, and statements
    // node-sql-parser cannot read are extracted too.

    /**
     * Parses SQL and extracts its table and column references. A template is read branch by
     * branch: the result is the union of every branch's references.
     *
     * - `Tables`: as {@link ExtractTableRefs}.
     * - `Columns`: as {@link ExtractColumnRefs} (empty when the SQL could not be read completely).
     * - `UsedASTParsing`: true when every reading of the SQL parsed completely.
     *
     * @param options Parse options, or just a SQL string
     * @param dialect The dialect, when `options` is a string; SQL Server when omitted
     * @deprecated Use `SqlDocument.Parse(sql, dialect)` and its `TableReferences()` and
     * `ColumnReferences()`, with `QueryTemplate` for templated SQL.
     */
    static Parse(options: SQLParseOptions | string, dialect?: SQLParserDialect): SQLParseResult {
        const sql = typeof options === 'string' ? options : options?.sql;
        return LegacyParse(sql, typeof options === 'string' ? dialect : options?.dialect);
    }

    /**
     * The same as {@link Parse}, which reads templates itself.
     *
     * @param options Parse options, or just a SQL string
     * @param dialect The dialect, when `options` is a string; SQL Server when omitted
     * @deprecated Use `SqlDocument.Parse(sql, dialect)`, with `QueryTemplate` for templated SQL.
     */
    static ParseWithTemplatePreprocessing(options: SQLParseOptions | string, dialect?: SQLParserDialect): SQLParseResult {
        return SQLParser.Parse(options, dialect);
    }

    // ─── Table & Column Extraction ─────────────────────

    /**
     * Extract all table/view references from this instance's SQL.
     * Convenience delegate to the static overload.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).TableReferences()`.
     */
    ExtractTableRefs(): SQLTableReference[] {
        return SQLParser.ExtractTableRefs(this._sql, this._dialect);
    }

    /**
     * The tables and views the SQL reads, anywhere in the statement (subqueries and CTE bodies
     * included), one entry per schema and table:
     *
     * - a CTE reference, a table-valued function and a derived table are not tables;
     * - names inside comments and string literals are never read, nor are the `FROM` words of
     *   `EXTRACT(… FROM …)`, `TRIM(… FROM …)` and `IS DISTINCT FROM`;
     * - an unqualified name gets the dialect's default schema (`dbo` on SQL Server, `public` on
     *   PostgreSQL), so `SchemaName` is always set;
     * - a template is read branch by branch, and the tables of every branch are reported; a
     *   `{{query:"…"}}` composition is not a table.
     *
     * @deprecated Use `SqlDocument.Parse(sql, dialect).TableReferences()`, which returns `null`
     * for an unwritten schema and marks CTE and function references by `Kind`.
     */
    static ExtractTableRefs(sql: string, dialect: SQLParserDialect): SQLTableReference[] {
        return LegacyTableReferences(sql, dialect);
    }

    /**
     * Extract all column references from this instance's SQL.
     * Convenience delegate to the static overload.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).ColumnReferences()`.
     */
    ExtractColumnRefs(): SQLColumnReference[] {
        return SQLParser.ExtractColumnRefs(this._sql, this._dialect);
    }

    /**
     * Every identifier path that can be a column, in every clause (select list, joins, WHERE,
     * GROUP BY, HAVING, ORDER BY, window and `WITHIN GROUP` clauses, subqueries), as
     * `{ ColumnName, TableQualifier }`, one entry per written `qualifier.column`. A template is
     * read branch by branch. Returns `[]` when the SQL cannot be read completely; use
     * {@link ExtractColumnRefsChecked} to tell that apart from SQL with no column references.
     *
     * @deprecated Use `SqlDocument.Parse(sql, dialect).ColumnReferences()`, which also binds each
     * reference to its source.
     */
    static ExtractColumnRefs(sql: string, dialect: SQLParserDialect): SQLColumnReference[] {
        return LegacyColumnReferencesChecked(sql, dialect).Columns;
    }

    /**
     * {@link ExtractColumnRefs}, with whether the SQL could be read completely: `Complete: false`
     * (and no columns) means the parse failed, not that the SQL names no column.
     */
    static ExtractColumnRefsChecked(sql: string, dialect: SQLParserDialect): CheckedColumnReferences {
        return LegacyColumnReferencesChecked(sql, dialect);
    }

    // ─── SELECT Column Extraction ─────────────────────────

    /**
     * Extract SELECT clause columns from this instance's SQL.
     * Convenience delegate to the static overload.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).OutputItems()`.
     */
    ExtractSelectColumns(): SQLSelectColumn[] {
        return SQLParser.ExtractSelectColumns(this._sql, this._dialect);
    }

    /**
     * Extracts the first statement's SELECT columns with their output names, source columns, and
     * table qualifiers (for a set operation, the first branch's):
     *   - Simple columns: `u.Name` → { OutputName: "Name", SourceColumn: "Name", TableQualifier: "u" }
     *   - Aliases (`AS a`, `a = expr` on SQL Server): `e.Name AS EntityName` → { OutputName: "EntityName", SourceColumn: "Name", TableQualifier: "e" }
     *   - Expressions: `COUNT(*)` → { OutputName: "COUNT(...)", SourceColumn: "COUNT(...)", IsExpression: true }; other unnamed expressions are `EXPR`
     *   - Stars: `*` and `t.*` → OutputName `*`, with `t` as the qualifier
     *
     * A template is read through its base render (every first branch). Returns `[]` when the SQL
     * cannot be read completely; use {@link ExtractSelectColumnsChecked} to tell that apart from a
     * statement with no select list.
     *
     * @deprecated Use `SqlDocument.Parse(sql, dialect).OutputItems()`.
     */
    static ExtractSelectColumns(sql: string, dialect: SQLParserDialect): SQLSelectColumn[] {
        return LegacySelectColumnsChecked(sql, dialect).Columns;
    }

    /**
     * {@link ExtractSelectColumns}, with whether the SQL could be read completely: `Complete:
     * false` (and no columns) means the parse failed, not that the statement has no select list.
     */
    static ExtractSelectColumnsChecked(sql: string, dialect: SQLParserDialect): CheckedSelectColumns {
        return LegacySelectColumnsChecked(sql, dialect);
    }

    // ─── CTE Extraction ────────────────────────────────

    /**
     * Extract CTE definitions from this instance's SQL.
     * Convenience delegate to the static overload.
     * @deprecated Use `SqlDocument.Parse(sql, dialect).CTEs()` or `SplitLeadingCTEs`.
     */
    ExtractCTEs(): SQLCTEExtraction | null {
        return SQLParser.ExtractCTEs(this._sql, this._dialect);
    }

    /**
     * Splits a statement that starts with a WITH clause (after any leading comments) into its CTE
     * definitions and the main statement, as written.
     *
     * Given: `WITH A AS (SELECT 1), B AS (SELECT 2) SELECT A.x, B.y FROM A, B`
     * Returns: CTEDefinitions: ["A AS (SELECT 1)", "B AS (SELECT 2)"], MainStatement: "SELECT A.x, B.y FROM A, B"
     *
     * Each definition is the exact text of `name [(columns)] AS (body)`, quoting included. The
     * main statement is the rest of the text, trimmed. `UsedASTParsing` is true when the
     * statement parsed completely. Returns `null` when the SQL does not start with WITH.
     *
     * @deprecated Use `SqlDocument.Parse(sql, dialect).CTEs()` or `SplitLeadingCTEs`.
     */
    static ExtractCTEs(sql: string, dialect: SQLParserDialect): SQLCTEExtraction | null {
        return LegacyCTEExtraction(sql, dialect);
    }

    // ─── MJ Template Extraction ────────────────────────

    /**
     * Renames a template variable throughout the SQL: in every `{{ variable | filters }}`
     * expression, preserving the filter chain, and in every read of it inside `{% if %}`,
     * `{% elif %}`, `{% for %}` and `{% set %}` tags.
     *
     * Example: `RenameTemplateVariable("WHERE x = {{ region | sqlString }}", "region", "userRegion")`
     *   → `"WHERE x = {{userRegion | sqlString}}"`
     *
     * @deprecated Rename through the `QueryTemplate` tree (`Parameters()` gives every use's span)
     * and an `EditSet`.
     */
    static RenameTemplateVariable(sql: string, oldName: string, newName: string): string {
        return ReplaceLegacyTemplateVariable(sql, oldName, filters => RebuildLegacyTemplateExpr(newName, filters), newName);
    }

    /**
     * Substitutes a template variable with a literal value in all `{{ variable | filters }}` expressions.
     * The entire expression (including filters) is replaced with the literal value, since filters
     * are irrelevant when injecting a concrete value.
     *
     * Example: `SubstituteTemplateVariable("WHERE x = {{ region | sqlString }}", "region", "'West'")`
     *   → `"WHERE x = 'West'"`
     *
     * When `tagLiteral` is given, reads of the variable inside `{% if %}`, `{% elif %}`,
     * `{% for %}` and `{% set %}` tags are replaced with it too, so conditions see the value.
     * It must be a template-language literal (`"West"`, `42`), not a SQL one.
     *
     * @deprecated Substitute through the `QueryTemplate` tree (`Parameters()` gives every use's
     * span) and an `EditSet`.
     */
    static SubstituteTemplateVariable(sql: string, variableName: string, literalValue: string, tagLiteral?: string): string {
        return ReplaceLegacyTemplateVariable(sql, variableName, () => literalValue, tagLiteral);
    }

    /**
     * Every `{{ variable | filter }}` expression, with its variable name and filter chain. A tag
     * inside a SQL comment is inert and is not reported.
     *
     * @deprecated Use `QueryTemplate.Parse(sql, dialect)`: its `Nodes` hold every expression, and
     * `Parameters()` the names they read.
     */
    static ExtractTemplateExpressions(sql: string): MJTemplateExpr[] {
        return LegacyTemplateExpressions(sql);
    }

    /**
     * Every `{{query:"…"}}` composition reference, with its category path, query name and
     * parameters. A reference inside a SQL comment is inert and is not reported.
     *
     * @deprecated Use `QueryTemplate.Parse(sql, dialect).CompositionReferences()`.
     */
    static ExtractCompositionRefs(sql: string): MJCompositionRef[] {
        return LegacyCompositionRefs(sql);
    }

    /**
     * The `{% if %}` blocks, each with its if/elif/else branches: the condition text and the
     * branch body's exact source text. A tag inside a SQL comment is inert.
     *
     * @deprecated Use `QueryTemplate.Parse(sql, dialect)`: its `If` nodes hold every branch.
     */
    static ExtractConditionalBlocks(sql: string): MJConditionalBlock[] {
        return LegacyConditionalBlocks(sql);
    }

    /**
     * The parameters a template reads, with the type its SQL filters imply, whether it is
     * required, its default and its filters:
     *
     * - required when at least one use sits outside every `{% if %}` block and has no
     *   `default(…)`; a name used only inside conditional blocks, or only in `{% if %}`
     *   conditions, is optional;
     * - the iterable of a `{% for %}` is an `array` parameter; the loop variable, `loop.*`,
     *   `{% set %}` names and `Context.*` tokens are not parameters;
     * - the type comes from the last SQL filter (`sqlString` → string, `sqlNumber` → number, …);
     *   a name read only by conditions is a `string`;
     * - the default comes from a `default(…)` filter, or else from a `{% else %}` branch that
     *   compares with a single literal.
     *
     * @deprecated Use `QueryTemplate.Parse(sql, dialect).Parameters()`.
     */
    static ExtractParameterInfo(sql: string): MJParameterInfo[] {
        return LegacyParameterInfo(sql);
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
     * @deprecated Kept unchanged, node-sql-parser AST included, for callers that walk that tree; new code reads SQL with `SqlDocument.Parse(sql, dialect)`. Template positions come from `QueryTemplate.Parse(sql, dialect)`.
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
    // Private: Parse Preprocessing (fallback + restoration)
    // ═══════════════════════════════════════════════════

    /**
     * Last-resort parse used when a direct parse fails. Rewrites SQL into a
     * form node-sql-parser accepts:
     *   1. Split a trailing `OPTION (...)` query hint (SQL Server).
     *   2. Alias bracket-quoted identifiers (`[Active People]`, `[my-cte]`,
     *      bracket-quoted CTE names).
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

        const ast = NodeSqlParse(work, dialect.ParserDialect);
        if (!ast) return noResult;
        return { ast, aliasMap, trailingOption };
    }

    /**
     * Finds a trailing query-hint clause (the dialect's {@link SQLParserDialect.QueryHintKeyword},
     * `OPTION (...)` on SQL Server) at the top level of the statement, outside string literals,
     * quoted identifiers and comments. Returns the SQL without the clause plus the clause text, or
     * `null` when the dialect has no hint clause or the statement does not end in one (only a
     * semicolon may follow it).
     */
    private static splitTrailingOption(
        sql: string,
        dialect: SQLParserDialect,
    ): { sqlWithoutOption: string; optionClause: string } | null {
        const keyword = dialect.QueryHintKeyword?.toUpperCase();
        if (!keyword) return null;
        const tokens = SignificantTokens(LexSQL(sql, dialect));
        let open = -1;
        for (let i = 0; i < tokens.length - 1; i++) {
            if (tokens[i].Depth === 0 && IsKeyword(tokens[i], keyword) && tokens[i + 1].Kind === 'open') open = i;
        }
        if (open === -1) return null;
        const close = tokens.findIndex((t, k) => k > open + 1 && t.Kind === 'close' && t.Depth === 0);
        if (close === -1) return null; // unbalanced — leave alone
        if (tokens.slice(close + 1).some(t => t.Kind !== 'semicolon')) return null; // not trailing
        return {
            sqlWithoutOption: sql.substring(0, tokens[open].Start).trimEnd(),
            optionClause: sql.substring(tokens[open].Start, tokens[close].End).trim(),
        };
    }

    /** The start of every alias name the fallback gives a bracket identifier. */
    private static readonly BRACKET_ALIAS_STEM = '_mjid';

    /** Every alias name {@link aliasPrefixFor} and {@link aliasBracketIdentifiers} can produce. */
    private static readonly ALIAS_NAME = /^_mjid\d*_\d+$/i;

    /**
     * An alias prefix in lower-case text, with its digits captured. The lookahead leaves the
     * closing `_` unread, so a prefix that starts on that `_` is found too (`_mjid_mjid1_`).
     */
    private static readonly ALIAS_PREFIX_IN_TEXT = /_mjid(\d*)(?=_)/g;

    /** A character that would join an alias written next to it into one longer name. */
    private static readonly NAME_CHAR = /[\w@#$\u0080-\uffff]/;

    /**
     * Token-aware scan that aliases every bracket-quoted identifier. node-sql-parser
     * cannot handle brackets around some identifiers at all — interiors with spaces
     * or punctuation (`[Active People]`, `[my-cte]`, `[dbo.table]`), and CTE names of
     * any kind (`WITH [x] AS …`). Applies only to bracket-quoting dialects (SQL Server).
     *
     * Each alias is `<prefix><seq>`, with a prefix that does not occur in the SQL
     * ({@link aliasPrefixFor}). A space keeps an alias apart from a name character or
     * bracket written right next to the brackets, as SQL Server keeps them apart. So
     * an alias name appears in the rewritten SQL only where this scan put it.
     *
     * Returns the rewritten SQL plus a forward map (original interior → alias).
     */
    private static aliasBracketIdentifiers(
        sql: string,
        dialect: SQLParserDialect,
    ): { rewritten: string; forward: Map<string, string> } {
        const forward = new Map<string, string>();
        if (!dialect.QuoteIdentifier('x').startsWith('[')) return { rewritten: sql, forward };

        const prefix = SQLParser.aliasPrefixFor(sql);
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
                if (interior.length > 0) {
                    let alias = forward.get(interior);
                    if (!alias) { alias = `${prefix}${seq++}`; forward.set(interior, alias); }
                    // Emit a BARE identifier — node-sql-parser rejects bracket-quoted
                    // CTE names entirely, so the alias must be unbracketed. sqlify
                    // re-quotes it ([_mjid_0]); restoreAliases handles every form.
                    // The character before the brackets comes from `sql`. A read from `out`, which
                    // grows by `+=`, copies all of `out` each time.
                    const before = i > 0 && SQLParser.NAME_CHAR.test(sql[i - 1]) ? ' ' : '';
                    const after = j < n && (SQLParser.NAME_CHAR.test(sql[j]) || sql[j] === '[') ? ' ' : '';
                    out += `${before}${alias}${after}`;
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
     * The alias prefix for one SQL text: the first of `_mjid_`, `_mjid1_`, `_mjid2_`, … that does
     * not occur in it, ignoring case. No name the SQL writes can then equal or contain an alias.
     * One scan of the text collects the digits of every prefix it contains.
     */
    private static aliasPrefixFor(sql: string): string {
        const used = new Set<string>();
        for (const match of sql.toLowerCase().matchAll(SQLParser.ALIAS_PREFIX_IN_TEXT)) used.add(match[1]);
        let digits = '';
        for (let k = 1; used.has(digits); k++) digits = String(k);
        return `${SQLParser.BRACKET_ALIAS_STEM}${digits}_`;
    }

    /**
     * Reverses bracket-identifier aliasing on a sqlify result. node-sql-parser
     * may emit the alias bare, bracketed, or backticked; all three forms are
     * restored to the original bracketed identifier. No alias occurs in the
     * caller's SQL ({@link aliasPrefixFor}), so replacement is unambiguous.
     */
    private static restoreAliases(sql: string, aliasMap: Map<string, string>): string {
        let out = sql;
        for (const [alias, originalBracketed] of aliasMap) {
            out = out.split(`[${alias}]`).join(originalBracketed);
            out = out.split('`' + alias + '`').join(originalBracketed);
            // Function replacement, not a string. `originalBracketed` is the caller's
            // own identifier, and the aliasing path above fires precisely BECAUSE it
            // contains a non-word character — `$` being one. As a string replacement
            // `$$`/`$&`/`` $` ``/`$'` in it were expanded rather than inserted, so
            // `[a$'b]` spliced the surrounding SQL into the identifier. The two
            // `split`/`join` branches above were already immune. See issue #3171.
            out = out.replace(new RegExp(`\\b${alias}\\b`, 'g'), () => originalBracketed);
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
}
