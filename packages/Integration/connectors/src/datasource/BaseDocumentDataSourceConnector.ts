import { BaseExternalDataSourceConnector, type ExternalDataSourceFilterDialect } from './BaseExternalDataSourceConnector.js';

/**
 * Document / NoSQL family of the EDS-consuming ingestion connector (MongoDB today). The heart's ingestion
 * flow applies unchanged — the MongoDB EDS driver's `RunView` accepts the SAME SQL-WHERE `filter` (via its
 * built-in translator) and `field [ASC|DESC]` `orderBy` as the SQL drivers — so this family supplies only
 * the two document-specific differences:
 *
 *  1. **Identifier quoting** — none. Mongo field names are used verbatim (case-sensitive, unquoted) in the
 *     SQL-WHERE the driver translates and in the order-by field list.
 *  2. **Non-authoritative discovery** — document introspection SAMPLES documents (a bounded scan), so it
 *     does NOT enumerate the full field gamut; a field absent from a refresh proves nothing and must NOT
 *     drive deactivation. `DiscoveryIsAuthoritative` stays false (§7).
 *
 * Incremental sync on a document store depends on the collection carrying a conventional "last changed"
 * field (name-detected by the heart); a collection without one syncs full, not incremental.
 *
 * Still abstract: a thin per-engine leaf (`MongoConnector`) registers it via `@RegisterClass`.
 */
export abstract class BaseDocumentDataSourceConnector extends BaseExternalDataSourceConnector {
    /** Sampled introspection is not a full enumeration — never deactivate on absence. */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    /** Document field names are used verbatim (no quoting) in the translated filter + order-by. */
    protected QuoteIdent(name: string, _dialect: ExternalDataSourceFilterDialect): string {
        return name;
    }
}
