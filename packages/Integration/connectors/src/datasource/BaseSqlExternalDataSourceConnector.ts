import { BaseExternalDataSourceConnector } from './BaseExternalDataSourceConnector.js';

/**
 * Relational (SQL) family of the EDS-consuming ingestion connector. Covers every SQL engine EDS drives
 * (SQL Server, Postgres, MySQL, Oracle, Snowflake). The heart provides the entire ingestion flow
 * (connect / introspect / incremental `FetchChanges`); the EDS driver renders all dialect SQL — identifier
 * quoting, the watermark predicate, and literal formatting. So this family supplies only the one thing that
 * is genuinely SQL-specific at the connector layer:
 *
 *  - **Authoritative discovery** — SQL introspection reads `INFORMATION_SCHEMA` / catalog views, which
 *    enumerate the FULL column set, so an object/field absent from a refresh genuinely means the source
 *    dropped it and it may be deactivated (§7).
 *
 * Still abstract: a thin per-engine leaf (`SQLServerConnector`, `PostgresConnector`, …) registers it via
 * `@RegisterClass` and names the connector — no logic.
 */
export abstract class BaseSqlExternalDataSourceConnector extends BaseExternalDataSourceConnector {
    /** INFORMATION_SCHEMA / catalog introspection enumerates the full column set → safe to deactivate on absence. */
    public override get DiscoveryIsAuthoritative(): boolean {
        return true;
    }
}
