import { LexSQL, SignificantTokens, SQLParser, StrictFragmentValidator, type SQLLexToken } from "@memberjunction/sql-parser";
import {
    GetQueryDialect,
    QueryDialect,
    SQLDialect,
    type DialectKey,
    type ParserDialect,
    type SQLParserDialect,
} from "@memberjunction/sql-dialect";

/**
 * The dialect a SQL driver's native-query text and clause fragments are screened in. Each key
 * names a dialect registered in `@memberjunction/sql-dialect`, whose lexical rules decide where
 * strings, quoted identifiers and comments begin and end, and whose node-sql-parser grammar (when
 * it has one) checks the statement's structure.
 *
 * `'ansi'` is the former catch-all for every non-T-SQL source and screens with the PostgreSQL
 * dialect; pass the source's own key instead.
 */
export type SqlDialectKey = "sqlserver" | "postgresql" | "mysql" | "oracle" | "snowflake" | "databricks" | "ansi";

/** The dialect `'ansi'` screens with. */
const ANSI_ALIAS_DIALECT: DialectKey = "postgresql";

/**
 * The grammar a clause fragment's structure is checked with when the source's dialect has no
 * node-sql-parser grammar (Oracle). The fragment is still lexed with the source's own rules.
 */
const FALLBACK_CLAUSE_DIALECT: DialectKey = "postgresql";

/**
 * node-sql-parser grammars that cannot read names with more than this many dot-separated parts.
 * Hive (used for Databricks) rejects `catalog.schema.table`, so longer names are shortened for
 * the structure check only.
 */
const GRAMMAR_NAME_PART_LIMITS: Readonly<Record<string, number>> = { Hive: 2 };

/** Statement keywords a lexically screened read (no grammar) may not contain anywhere. */
const LEXICAL_SCREEN_EXTRA_FORBIDDEN_WORDS: readonly string[] = ["INTO", "FUNCTION", "PROCEDURE"];

/**
 * Resolves a screen key to its dialect. `'ansi'` is the PostgreSQL dialect.
 */
export function GetScreenDialect(key: SqlDialectKey): QueryDialect {
    return GetQueryDialect(key === "ansi" ? ANSI_ALIAS_DIALECT : key);
}

/**
 * The dialect object handed to the strict parser (`StrictFragmentValidator`): a platform dialect
 * as itself, otherwise an object carrying the query dialect's facets plus the members the
 * parser's older interface reads.
 */
function parserDialectFor(dialect: QueryDialect, grammar: string): SQLParserDialect & ParserDialect {
    if (dialect instanceof SQLDialect && dialect.Grammar.ParserGrammar === grammar) {
        return dialect;
    }
    const lexical = dialect.Lexical;
    return {
        Key: dialect.Key,
        Lexical: lexical,
        Grammar: dialect.Grammar,
        ParserDialect: grammar,
        QuoteIdentifier: (name: string) => dialect.Writer.QuoteIdentifier(name),
        AllowsOrderByInCTE: dialect.Grammar.AllowsOrderByInCTE,
        DefaultPagingOrderBy: dialect.Grammar.DefaultPagingOrderBy,
        SupportsEscapeStringLiterals: lexical.StringLiterals.some(f => f.BackslashEscape && f.Prefixes.some(p => p.toUpperCase() === "E")),
        SupportsDollarQuotedStrings: lexical.DollarQuotedStrings !== "none",
        QueryHintKeyword: dialect.Grammar.QueryHintKeyword,
        CallerSQLForbiddenFunctions: dialect.Grammar.CallerSQLForbiddenFunctions,
    };
}

/**
 * Refuses text the dialect's own rules make ambiguous to read: a comment whose content the
 * database runs (MySQL `/*! … *\/`), and, where a server setting decides whether backslash
 * escapes exist, a string literal containing a backslash (its end then depends on that setting).
 */
function assertLexicallyUnambiguous(tokens: SQLLexToken[], dialect: QueryDialect, subject: string): void {
    const executable = dialect.Lexical.BlockComments.ExecutableOpeners;
    if (tokens.some(t => t.Kind === "comment" && executable.some(opener => t.Text.startsWith(opener)))) {
        throw new Error(
            `${subject} rejected: a comment whose content the database runs or interprets is not allowed — refusing under uncertainty (External Data Sources are read-only).`,
        );
    }
    if (dialect.Lexical.BackslashEscapesDependOnServerSettings && tokens.some(t => t.Kind === "string" && t.Text.includes("\\"))) {
        throw new Error(
            `${subject} rejected: a string literal containing a backslash ends in a place that depends on server settings — refusing under uncertainty (External Data Sources are read-only).`,
        );
    }
}

/**
 * The text the grammar checks: the statement as the dialect's lexer reads it, with every comment
 * replaced by a space and a space wherever two adjacent tokens would otherwise spell a comment
 * marker (`--`, `/*`, `*\/`, `//`). node-sql-parser's grammars do not share every dialect's comment
 * rules (MySQL's `--` needs whitespace after it, so `--1` is not a comment there), and this keeps
 * the grammar from reading as a comment what the database runs. Names with more parts than the
 * grammar reads are shortened (see {@link GRAMMAR_NAME_PART_LIMITS}).
 */
function grammarText(tokens: SQLLexToken[], grammar: string): string {
    const limit = GRAMMAR_NAME_PART_LIMITS[grammar];
    const source = limit === undefined ? tokens : shortenQualifiedNames(tokens, limit);
    let out = "";
    for (const token of source) {
        const text = token.Kind === "comment" ? " " : token.Text;
        if (text.length > 0 && COMMENT_MARKERS.has(out.slice(-1) + text[0])) {
            out += " ";
        }
        out += text;
    }
    return out;
}

/** Two-character sequences that open or close a comment in some grammar. */
const COMMENT_MARKERS: ReadonlySet<string> = new Set(["--", "/*", "*/", "//"]);

/** Whether a token can be one part of a dotted name. */
function isNamePart(token: SQLLexToken | undefined): boolean {
    return token !== undefined && (token.Kind === "word" || token.Kind === "identifier");
}

/** The index past the dotted name starting at `start` (adjacent tokens, no whitespace), and its part count. */
function dottedNameAt(tokens: SQLLexToken[], start: number): { End: number; Parts: number } {
    let end = start + 1;
    let parts = 1;
    while (tokens[end]?.Kind === "dot" && isNamePart(tokens[end + 1])) {
        end += 2;
        parts++;
    }
    return { End: end, Parts: parts };
}

/**
 * Replaces the leading parts of every dotted name longer than `limit` parts with one placeholder
 * word, keeping its last `limit - 1` parts: `cat.sch.tbl` becomes `__mj_name_0.tbl` for a limit of 2.
 * Structure only; the original text is what runs.
 */
function shortenQualifiedNames(tokens: SQLLexToken[], limit: number): SQLLexToken[] {
    const out: SQLLexToken[] = [];
    let i = 0;
    let count = 0;
    while (i < tokens.length) {
        const name = isNamePart(tokens[i]) && tokens[i - 1]?.Kind !== "dot" ? dottedNameAt(tokens, i) : null;
        if (!name || name.Parts <= limit) {
            out.push(tokens[i]);
            i++;
            continue;
        }
        const keepFrom = name.End - (limit - 1) * 2;
        // tokens[keepFrom] is the dot before the parts that are kept.
        out.push({ ...tokens[i], Kind: "word", Text: `__mj_name_${count++}` }, ...tokens.slice(keepFrom, name.End));
        i = name.End;
    }
    return out;
}

/** Throws when the statement's first significant token is a GRANT / REVOKE / DENY. */
function assertNotPermissionStatement(significant: SQLLexToken[]): void {
    const first = significant[0];
    if (first?.Kind === "word" && /^(grant|revoke|deny)$/i.test(first.Text)) {
        throw new Error(
            "External native query rejected: permission (GRANT/REVOKE/DENY) statements are not permitted — External Data Sources are read-only.",
        );
    }
}

/**
 * Screens a native query for a dialect node-sql-parser has no grammar for, from its tokens alone.
 * Fails closed: the statement must start with SELECT or WITH and contain no write-statement
 * keyword (nor INTO, FUNCTION or PROCEDURE) as a bare word anywhere.
 */
function assertLexicalRead(significant: SQLLexToken[], dialect: QueryDialect): void {
    const first = significant[0];
    if (first?.Kind !== "word" || !/^(select|with)$/i.test(first.Text)) {
        throw new Error(
            "External native query rejected: only a single SELECT or WITH statement is allowed for this source — refusing under uncertainty (External Data Sources are read-only).",
        );
    }
    const forbidden = new Set([...dialect.Grammar.WriteStatementKeywords, ...LEXICAL_SCREEN_EXTRA_FORBIDDEN_WORDS]);
    const hit = significant.find(t => t.Kind === "word" && forbidden.has(t.Text.toUpperCase()));
    if (hit) {
        throw new Error(
            `External native query rejected: "${hit.Text}" is not allowed in a read — refusing under uncertainty (External Data Sources are read-only).`,
        );
    }
}

/**
 * Parses the statement with the dialect's grammar ({@link StrictFragmentValidator}) and throws
 * unless it is one read: parseable, no write statement at any depth, no SELECT … INTO, exactly
 * one typed statement.
 */
function assertParsedRead(text: string, parserDialect: SQLParserDialect): void {
    const parsed = StrictFragmentValidator.ValidateReadOnlyStatement(text, parserDialect);
    if (!parsed.Parsed) {
        throw new Error(
            "External native query rejected: SQL could not be parsed/validated as read-only — refusing under uncertainty (External Data Sources are read-only).",
        );
    }
    if (parsed.HasWriteStatement) {
        throw new Error(
            "External native query rejected: write/DDL statements are not permitted — External Data Sources are read-only.",
        );
    }
    // `SELECT ... INTO <newtable>` (and MySQL's `INTO OUTFILE`) parses as a `select`, so
    // HasWriteStatement misses it; the parser reports it as StatementKind 'select-into'.
    if (parsed.StatementKind === "select-into") {
        throw new Error(
            "External native query rejected: SELECT ... INTO creates a table — External Data Sources are read-only.",
        );
    }
    assertSingleRead(parsed.ContainsNestedWrite, parsed.IsSingleTypedStatement);
}

/**
 * Fail-closed checks over the whole parse. The type-based checks only see the TOP-level
 * statement, so they miss a write hidden inside a CTE body and forms the parser mis-parses to
 * untyped nodes (T-SQL `WITH ... INSERT` reads as several untyped statements).
 */
function assertSingleRead(containsNestedWrite: boolean, isSingleTypedStatement: boolean): void {
    if (containsNestedWrite) {
        throw new Error(
            "External native query rejected: a write/DDL statement nested in a CTE or subquery is not permitted — External Data Sources are read-only.",
        );
    }
    if (!isSingleTypedStatement) {
        throw new Error(
            "External native query rejected: only a single, well-formed read statement is allowed — refusing under uncertainty (External Data Sources are read-only).",
        );
    }
}

/**
 * Read-only enforcement for the native-query path (`RunNativeQuery`).
 *
 * External Data Sources are read-only by contract, but a stored Query's fully-rendered SQL is
 * executed verbatim on a read/write connection. The provider-layer write backstop and
 * `ReadOnlyExternalBaseEntity` only cover `Save`/`Delete` — they do NOT see this path — so the
 * guarantee is enforced HERE, at the driver/engine boundary, not delegated to a caller.
 *
 * The text is read with the source dialect's own lexical rules (MySQL `#` comments and its
 * `--`-needs-whitespace rule, backticks, backslash escapes, Snowflake `$$` strings and `//`
 * comments, Oracle `q'…'` literals, …). Fail-closed. Throws when the SQL:
 *   - contains a comment the database runs (MySQL `/*! … *\/`), or a backslash in a string
 *     literal on a dialect where a server setting decides what a backslash means,
 *   - contains multiple/stacked statements (injection / smuggled write),
 *   - starts with a DCL verb (`GRANT`/`REVOKE`/`DENY`) after any leading comments,
 *   - cannot be parsed in the dialect's node-sql-parser grammar, contains any write/DDL statement
 *     at any depth, is a `SELECT ... INTO`, or is not exactly one typed statement; or, for a dialect
 *     without a grammar (Oracle), is not a single SELECT/WITH free of write keywords.
 *
 * Known limitation — defense-in-depth, NOT a substitute for a least-privilege source credential:
 *   - A side-effecting routine invoked from a read shape (`SELECT writing_func()`,
 *     `SELECT nextval('s')`) is indistinguishable from a pure read in the AST and is NOT blocked.
 * Configure External Data Sources with a read-only/least-privilege credential as the real authority;
 * this screen is the app-level backstop against the common write/DDL/injection vectors.
 */
export function AssertReadOnlyNativeQuery(sql: string, dialectKey: SqlDialectKey): void {
    const dialect = GetScreenDialect(dialectKey);
    const tokens = LexSQL(sql, dialect);
    assertLexicallyUnambiguous(tokens, dialect, "External native query");
    if (SQLParser.HasStackedStatements(sql, dialect)) {
        throw new Error(
            "External native query rejected: multiple statements are not allowed against a read-only external data source.",
        );
    }
    const significant = SignificantTokens(tokens);
    assertNotPermissionStatement(significant);
    const grammar = dialect.Grammar.ParserGrammar;
    if (grammar === null) {
        assertLexicalRead(significant, dialect);
        return;
    }
    assertParsedRead(grammarText(tokens, grammar), parserDialectFor(dialect, grammar));
}

/** @deprecated Use {@link AssertReadOnlyNativeQuery}. */
export function assertReadOnlyNativeQuery(sql: string, dialectKey: SqlDialectKey): void {
    return AssertReadOnlyNativeQuery(sql, dialectKey);
}

/**
 * Throws when a clause fragment contains a comment (in any form the dialect has, or any `--`,
 * `/*`, `*\/` marker even inside a literal), a statement separator, or text the dialect makes
 * ambiguous to read.
 */
function assertClauseLexicallySafe(clause: string, tokens: SQLLexToken[], dialect: QueryDialect, kind: "where" | "orderby"): void {
    // Rejecting every raw marker also rejects the (rare) legitimate clause with `--`/`/*`/`*/` inside a
    // string literal (e.g. `Note = 'a--b'`). That's an accepted false-positive: over-rejecting a filter is
    // preferable to risking comment-based truncation of the generated query. Callers can pass such values
    // as bound parameters instead of inlining them into the filter.
    if (/--|\/\*|\*\//.test(clause) || tokens.some(t => t.Kind === "comment")) {
        throw new Error(`External ${kind} clause rejected: SQL comment markers are not allowed.`);
    }
    if (/;/.test(clause)) {
        throw new Error(`External ${kind} clause rejected: statement separators are not allowed.`);
    }
    assertLexicallyUnambiguous(tokens, dialect, `External ${kind} clause`);
}

/**
 * Throws when a clause's parentheses close one it did not open, or are left unclosed, as the
 * dialect's lexer counts them.
 */
function assertBalancedParentheses(tokens: SQLLexToken[], kind: "where" | "orderby"): void {
    let depth = 0;
    for (const token of tokens) {
        if (token.Kind === "open") depth++;
        if (token.Kind === "close" && --depth < 0) break;
    }
    if (depth !== 0) {
        throw new Error(`External ${kind} clause rejected: unbalanced parentheses — refusing under uncertainty.`);
    }
}

/**
 * Defense-in-depth screen for a caller-supplied WHERE-body / ORDER-BY-body fragment before it is
 * interpolated into a driver SELECT (see `BaseSqlExternalDataSourceDriver.buildSelectSql`).
 *
 * The clause contract is the same as MJ RunView's `ExtraFilter`/`OrderBy` — a trusted dialect
 * fragment the provider screens (`ValidateUserProvidedSQLClause`). But the engine is the security
 * boundary for the drivers, so it must NOT rely on a specific caller having screened: any consumer
 * (a different provider, a direct caller, a test harness) reaches the raw interpolation otherwise.
 * This re-screens at the boundary, reading the fragment with the source dialect's lexical rules.
 * Fail-closed; throws when the fragment:
 *   - contains a comment (`--`, `/* *​/`, and the dialect's own forms such as MySQL `#` or Snowflake
 *     `//`) — can truncate the rest of the generated query, or
 *   - contains a statement separator (`;`), or unbalanced parentheses, or
 *   - does not parse as a single read-only statement once wrapped (break-out / smuggled write/DDL).
 *     A dialect without a node-sql-parser grammar (Oracle) is checked with the PostgreSQL grammar.
 *
 * Note: this blocks statement-stacking, comment truncation, and smuggled writes/DDL — it does NOT
 * attempt to block every read-side resource-abuse function (e.g. `pg_sleep`, `UTL_HTTP`); the data
 * source connects under its own (ideally least-privilege, read-only) credential for that surface.
 */
export function AssertReadOnlyClause(clause: string, dialectKey: SqlDialectKey, kind: "where" | "orderby"): void {
    const dialect = GetScreenDialect(dialectKey);
    const tokens = LexSQL(clause, dialect);
    assertClauseLexicallySafe(clause, tokens, dialect, kind);
    assertBalancedParentheses(tokens, kind);
    // Structural validation: wrap the fragment as a single plain SELECT and parse it. A clean
    // fragment keeps the top-level statement a `select`; a break-out (e.g. `1=1) UNION SELECT
    // secret ...`) turns the top level into a set-op, and a smuggled write turns it into a mutation.
    // Requiring `StatementKind === 'select'` rejects both the UNION-exfiltration break-out and writes,
    // while still permitting a UNION nested *inside* a subquery (which stays a top-level select).
    // Anything that doesn't parse is refused (fail-closed). The table name is a throwaway placeholder.
    const structureDialect = dialect.Grammar.ParserGrammar === null ? GetQueryDialect(FALLBACK_CLAUSE_DIALECT) : dialect;
    const grammar = structureDialect.Grammar.ParserGrammar ?? "";
    const body = grammarText(tokens, grammar);
    const parsed =
        kind === "where"
            ? StrictFragmentValidator.ValidateFilter(body, parserDialectFor(structureDialect, grammar))
            : StrictFragmentValidator.ValidateOrderBy(body, parserDialectFor(structureDialect, grammar));
    if (!parsed.Parsed || parsed.HasWriteStatement || parsed.StatementKind !== "select") {
        throw new Error(
            `External ${kind} clause rejected: not a safe read-only ${kind} fragment — refusing under uncertainty.`,
        );
    }
}

/** @deprecated Use {@link AssertReadOnlyClause}. */
export function assertReadOnlyClause(clause: string, dialectKey: SqlDialectKey, kind: "where" | "orderby"): void {
    return AssertReadOnlyClause(clause, dialectKey, kind);
}
