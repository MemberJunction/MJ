/**
 * @fileoverview Shared index metadata types for the unified Knowledge Hub vector index.
 *
 * All vectorized content (entity records, content items, file attachments, autotagged
 * content) stored in a single shared index carries these metadata fields to enable
 * filtered retrieval across heterogeneous sources.
 *
 * @module @memberjunction/ai-vectors
 */

/**
 * Classification of how the vectorized content originated.
 */
export type VectorSourceType = 'entity' | 'content-item' | 'file' | 'web-page';

/**
 * Metadata stored alongside every vector in the shared index.
 * Used for post-hoc filtering and provenance tracking.
 */
export interface SharedVectorMetadata {
    /** The MJ entity the vector came from (e.g., "Contacts", "Content Items") */
    EntityName: string;
    /** Origin classification */
    SourceType: VectorSourceType;
    /** MIME-like content category (e.g., "text/plain", "text/html", "application/pdf") */
    ContentType: string;
    /** Human-readable tags produced by the autotagging pipeline */
    Tags: string[];
    /** Composite key serialized string pointing back to the source record */
    RecordID: string;
    /** The Entity Document template used for vectorization */
    EntityDocumentID: string;
    /** Integer for multi-chunk documents */
    ChunkIndex: number;
    /** ISO date when this vector was indexed */
    IndexedAt: string;
}

/**
 * Filter options for querying the shared vector index.
 * All fields are optional -- omitted fields mean "no filter on this dimension".
 */
export interface SharedIndexFilterOptions {
    /** Restrict to specific entity names */
    EntityNames?: string[];
    /** Restrict to specific source types */
    SourceTypes?: VectorSourceType[];
    /** Restrict to specific MIME content types */
    ContentTypes?: string[];
    /** Require all specified tags to be present */
    Tags?: string[];
    /** Restrict to specific Entity Document IDs */
    EntityDocumentIDs?: string[];
}
