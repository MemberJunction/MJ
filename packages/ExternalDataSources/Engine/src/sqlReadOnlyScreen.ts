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
 *   - cannot be parsed/validated in its dialect (can't prove it's read-only → refuse), or
 *   - contains any write/DDL statement (INSERT/UPDATE/DELETE/MERGE/DROP/… — `HasWriteStatement`
 *     also catches data-modifying CTEs such as `WITH x AS (...) DELETE ...`).
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
}
