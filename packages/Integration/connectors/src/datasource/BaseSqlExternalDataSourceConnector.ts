import { BaseExternalDataSourceConnector, type ExternalDataSourceFilterDialect } from './BaseExternalDataSourceConnector.js';

/**
 * Relational (SQL) family of the EDS-consuming ingestion connector. Covers every SQL engine EDS drives
 * (SQL Server, Postgres, MySQL, Oracle, Snowflake). The heart already provides the whole ingestion flow
 * (connect / introspect / incremental `FetchChanges` via `driver.RunView` with a SQL-WHERE watermark
 * predicate); this family supplies only the two things that are genuinely SQL-specific:
 *
 *  1. **Identifier quoting** — per the source type's declared `FilterDialect` (T-SQL brackets, MySQL
 *     backticks, standard double-quotes for ANSI/Postgres/Oracle/Snowflake).
 *  2. **Authoritative discovery** — SQL introspection reads `INFORMATION_SCHEMA` / catalog views, which
 *     enumerate the FULL column set, so an object/field absent from a refresh genuinely means the source
 *     dropped it and it may be deactivated (§7).
 *
 * Still abstract: a thin per-engine leaf (`SQLServerConnector`, `PostgresConnector`, …) registers it via
 * `@RegisterClass` and names the connector — no logic.
 */
export abstract class BaseSqlExternalDataSourceConnector extends BaseExternalDataSourceConnector {
    /** INFORMATION_SCHEMA / catalog introspection enumerates the full column set → safe to deactivate on absence. */
    public override get DiscoveryIsAuthoritative(): boolean {
        return true;
    }

    /** Quote a SQL identifier per the source's declared dialect (bracket / backtick / double-quote). */
    protected QuoteIdent(name: string, dialect: ExternalDataSourceFilterDialect): string {
        switch (dialect) {
            case 'tsql':
                return `[${name.replace(/]/g, ']]')}]`;
            case 'mysql':
                return `\`${name.replace(/`/g, '``')}\``;
            // ansi / pgsql / oracle all use standard double-quoted identifiers.
            default:
                return `"${name.replace(/"/g, '""')}"`;
        }
    }
}
