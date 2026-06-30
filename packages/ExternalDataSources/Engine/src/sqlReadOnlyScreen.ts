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
 *     but it CREATES a table as a side effect, so it's caught here via `StatementKind`.
 *
 * Known limitations — defense-in-depth, NOT a substitute for a least-privilege source credential:
 *   - A side-effecting routine invoked from a read shape (`SELECT writing_func()`,
 *     `SELECT nextval('s')`) is indistinguishable from a pure read in the AST and is NOT blocked.
 *   - `GRANT`/`REVOKE` are not reliably surfaced as their own statement type by the underlying parser
 *     for every dialect and may pass; they require privileges a read-only source credential lacks.
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
