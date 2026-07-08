import { SQLParser } from "@memberjunction/sql-parser";
import { SQLServerDialect, PostgreSQLDialect, type SQLParserDialect } from "@memberjunction/sql-dialect";

/**
 * Which parser dialect a SQL driver uses to screen native-query text. SQL Server needs the T-SQL
 * grammar (brackets, `TOP`, `@vars`); every other relational dialect (PostgreSQL, MySQL, Oracle,
 * Snowflake) is screened with the ANSI-standard PostgreSQL grammar — write/DDL detection is
 * dialect-agnostic, and a vendor-specific read that the ANSI grammar can't parse fails closed
 * (refused) rather than running unscreened, per the EDS "refuse under uncertainty" posture.
 */
export type SqlDialectKey = "sqlserver" | "ansi";

function dialectFor(key: SqlDialectKey): SQLParserDialect {
    return key === "sqlserver" ? new SQLServerDialect() : new PostgreSQLDialect();
}

/**
 * AST node `type` values that represent a write / DDL / DCL statement. Mirrors the parser's own write
 * set; used to catch writes the parser reports only at the TOP level (see {@link astContainsWriteNode}).
 */
const WRITE_NODE_TYPES = new Set<string>([
    "insert", "update", "delete", "merge", "replace", "drop", "create", "alter", "truncate",
    "rename", "call", "exec", "execute", "grant", "revoke", "use", "load", "copy", "do",
]);

/**
 * Deep-walk a node-sql-parser AST and report whether ANY node is a write/DDL statement. `HasWriteStatement`
 * only inspects TOP-level statement types, so a write hidden in a CTE body — e.g.
 * `WITH x AS (INSERT ... RETURNING *) SELECT * FROM x`, which parses as a top-level `select` — evades it.
 * Walking every node catches writes nested anywhere (CTE, subquery). Identifiers can't false-positive:
 * this matches the node `type`, and a column/table literally named `update` is an identifier node, not
 * an `update` node.
 */
function astContainsWriteNode(node: unknown): boolean {
    if (!node || typeof node !== "object") {
        return false;
    }
    if (Array.isArray(node)) {
        return node.some(astContainsWriteNode);
    }
    const obj = node as Record<string, unknown>;
    const type = obj.type;
    if (typeof type === "string" && WRITE_NODE_TYPES.has(type.toLowerCase())) {
        return true;
    }
    return Object.values(obj).some(astContainsWriteNode);
}

/**
 * True only when the parsed AST is a SINGLE statement carrying a recognized (string) `type`. A native
 * read must be exactly one statement; node-sql-parser mis-parses some write forms (notably T-SQL
 * `WITH ... INSERT`) into an ARRAY of `type: null` nodes that slip past the type-based checks — so
 * anything that isn't a single, typed statement is refused under uncertainty.
 */
function isSingleTypedStatement(ast: unknown): boolean {
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1) {
        return false;
    }
    const stmt = statements[0];
    return !!stmt && typeof stmt === "object" && typeof (stmt as Record<string, unknown>).type === "string";
}

/**
 * Read-only enforcement for the native-query path (`RunNativeQuery`).
 *
 * External Data Sources are read-only by contract, but a stored Query's fully-rendered SQL is
 * executed verbatim on a read/write connection. The provider-layer write backstop and
 * `ReadOnlyExternalBaseEntity` only cover `Save`/`Delete` — they do NOT see this path — so the
 * guarantee is enforced HERE, at the driver/engine boundary, not delegated to a caller.
 *
 * Fail-closed. Throws when the SQL:
 *   - contains multiple/stacked statements (injection / smuggled write),
 *   - cannot be parsed/validated in its dialect (can't prove it's read-only → refuse),
 *   - contains any write/DDL statement (INSERT/UPDATE/DELETE/MERGE/DROP/EXEC/CALL/… —
 *     `HasWriteStatement`; unparseable data-modifying CTEs are refused by the parse gate above), or
 *   - is a `SELECT ... INTO <newtable>` — it parses as a `select` (so `HasWriteStatement` is false),
 *     but it CREATES a table as a side effect, so it's caught here via `StatementKind`, or
 *   - starts with a DCL verb (`GRANT`/`REVOKE`/`DENY`), after leading comments/whitespace are stripped —
 *     a backstop because the underlying parser doesn't reliably surface these as a write type per-dialect.
 *
 * Known limitation — defense-in-depth, NOT a substitute for a least-privilege source credential:
 *   - A side-effecting routine invoked from a read shape (`SELECT writing_func()`,
 *     `SELECT nextval('s')`) is indistinguishable from a pure read in the AST and is NOT blocked.
 * Configure External Data Sources with a read-only/least-privilege credential as the real authority;
 * this screen is the app-level backstop against the common write/DDL/injection vectors.
 */
export function assertReadOnlyNativeQuery(sql: string, dialectKey: SqlDialectKey): void {
    const dialect = dialectFor(dialectKey);
    if (SQLParser.HasStackedStatements(sql, dialect)) {
        throw new Error(
            "External native query rejected: multiple statements are not allowed against a read-only external data source.",
        );
    }
    // DCL backstop: node-sql-parser doesn't reliably surface GRANT/REVOKE/DENY as their own write
    // statement type for every dialect (T-SQL parses them as untyped `assign` nodes), so
    // HasWriteStatement may miss them. A native query is a single statement (stacked already rejected
    // above), so checking the leading verb is exact. Strip any leading SQL comments/whitespace FIRST so
    // a comment prefix (`/* c */ GRANT ...`, `-- x\nGRANT ...`) can't slip a DCL statement past the
    // anchor — this can't false-positive on a `grant`/`revoke` identifier appearing mid-statement.
    const leadingTrimmed = sql.replace(/^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)+/, "");
    if (/^(grant|revoke|deny)\b/i.test(leadingTrimmed)) {
        throw new Error(
            "External native query rejected: permission (GRANT/REVOKE/DENY) statements are not permitted — External Data Sources are read-only.",
        );
    }
    const parser = new SQLParser(sql, dialect);
    if (!parser.IsValid) {
        throw new Error(
            "External native query rejected: SQL could not be parsed/validated as read-only — refusing under uncertainty (External Data Sources are read-only).",
        );
    }
    if (parser.HasWriteStatement) {
        throw new Error(
            "External native query rejected: write/DDL statements are not permitted — External Data Sources are read-only.",
        );
    }
    // `SELECT ... INTO <newtable>` parses as a `select`, so HasWriteStatement misses it — but it
    // creates a table. The parser exposes it distinctly as StatementKind 'select-into'.
    if (parser.StatementKind === "select-into") {
        throw new Error(
            "External native query rejected: SELECT ... INTO creates a table — External Data Sources are read-only.",
        );
    }
    // Fail-closed AST checks — the type-based checks above only see the TOP-level statement, so they miss
    // (a) a write hidden inside a CTE body (`WITH x AS (INSERT/UPDATE ... RETURNING) SELECT ...`, which
    // parses as a top-level `select`), and (b) forms the parser mis-parses to untyped nodes (T-SQL
    // `WITH ... INSERT` → an array of `type: null` nodes). Deep-walk for any write node, then require a
    // single, typed statement.
    const ast = parser.AST;
    if (astContainsWriteNode(ast)) {
        throw new Error(
            "External native query rejected: a write/DDL statement nested in a CTE or subquery is not permitted — External Data Sources are read-only.",
        );
    }
    if (!isSingleTypedStatement(ast)) {
        throw new Error(
            "External native query rejected: only a single, well-formed read statement is allowed — refusing under uncertainty (External Data Sources are read-only).",
        );
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
 * This re-screens at the boundary. Fail-closed; throws when the fragment:
 *   - contains a comment marker (`--`, `/* *​/`) — can truncate the rest of the generated query, or
 *   - contains a statement separator (`;`), or
 *   - does not parse as a single read-only statement once wrapped (break-out / smuggled write/DDL).
 *
 * Note: this blocks statement-stacking, comment truncation, and smuggled writes/DDL — it does NOT
 * attempt to block every read-side resource-abuse function (e.g. `pg_sleep`, `UTL_HTTP`); the data
 * source connects under its own (ideally least-privilege, read-only) credential for that surface.
 */
export function assertReadOnlyClause(clause: string, dialectKey: SqlDialectKey, kind: "where" | "orderby"): void {
    // Reject any comment marker. NOTE: this also rejects the (rare) legitimate clause that contains
    // `--`/`/*`/`*/` inside a string literal (e.g. `Note = 'a--b'`). That's an accepted false-positive:
    // per the fail-closed / refuse-under-uncertainty posture, over-rejecting a filter is preferable to
    // risking comment-based truncation of the generated query. Callers can pass such values as bound
    // parameters instead of inlining them into the filter.
    if (/--|\/\*|\*\//.test(clause)) {
        throw new Error(`External ${kind} clause rejected: SQL comment markers are not allowed.`);
    }
    if (/;/.test(clause)) {
        throw new Error(`External ${kind} clause rejected: statement separators are not allowed.`);
    }
    // Structural validation: wrap the fragment as a single plain SELECT and parse it. A clean
    // fragment keeps the top-level statement a `select`; a break-out (e.g. `1=1) UNION SELECT
    // secret ...`) turns the top level into a set-op, and a smuggled write turns it into a mutation.
    // Requiring `StatementKind === 'select'` rejects both the UNION-exfiltration break-out and writes,
    // while still permitting a UNION nested *inside* a subquery (which stays a top-level select).
    // Anything that doesn't parse is refused (fail-closed). The table name is a throwaway placeholder.
    const wrapped =
        kind === "where"
            ? `SELECT 1 FROM __mj_clause_screen WHERE (${clause})`
            : `SELECT 1 FROM __mj_clause_screen ORDER BY ${clause}`;
    const dialect = dialectFor(dialectKey);
    const parser = new SQLParser(wrapped, dialect);
    if (!parser.IsValid || parser.HasWriteStatement || parser.StatementKind !== "select") {
        throw new Error(
            `External ${kind} clause rejected: not a safe read-only ${kind} fragment — refusing under uncertainty.`,
        );
    }
}
