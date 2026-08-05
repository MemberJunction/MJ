import { BaseExternalDataSourceConnector } from './BaseExternalDataSourceConnector.js';

/**
 * Document / NoSQL family of the EDS-consuming ingestion connector (MongoDB today). The heart's ingestion
 * flow applies unchanged — the MongoDB EDS driver's `RunView` accepts the same structured `incrementalSince`
 * bound + ordering columns as the SQL drivers (rendering them to a Mongo query, coercing the watermark to a
 * `Date`, itself) — so this family supplies only the one document-specific difference:
 *
 *  - **Non-authoritative discovery** — document introspection SAMPLES documents (a bounded scan), so it
 *    does NOT enumerate the full field gamut; a field absent from a refresh proves nothing and must NOT
 *    drive deactivation. `DiscoveryIsAuthoritative` stays false (§7).
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
}
