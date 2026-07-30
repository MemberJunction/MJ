/**
 * @fileoverview Shared field mapping for external search indexes.
 *
 * @module @memberjunction/search-engine
 */

/** A document returned by an external search index. */
export type ExternalSearchDocument = Record<string, unknown>;

/**
 * Chunk-level provenance recovered from an external index document.
 *
 * External indexes are populated outside MemberJunction, so these fields are present only
 * when the indexing pipeline chose to emit them. Every field is optional by construction.
 */
export interface ExternalChunkProvenance {
    /** `MJ: Content Item Chunks` row id, when the indexed unit is a chunk rather than a whole item. */
    ChunkID?: string;
    /** Parent `MJ: Content Items` id. */
    ContentItemID?: string;
    /** Chunk modality — text, image, audio, video, or multimodal. */
    Modality?: string;
    /** Start of the chunk's time window, in ms, for audio/video. */
    StartMs?: number;
    /** End of the chunk's time window, in ms. */
    EndMs?: number;
    /** One-based page number for paginated sources. */
    PageNumber?: number;
}

/**
 * Field names checked, in order, when looking for a document's readable body.
 *
 * `transcript` and `description` matter for multimodal corpora: a media chunk carries no
 * body text of its own, and these are the columns that make it findable and readable. They
 * sit after `content` so a conventional text document is unaffected.
 */
const SNIPPET_FIELDS = ['content', 'body', 'text', 'description', 'transcript', 'summary'];

/** Field names checked, in order, when looking for a document's title. */
const TITLE_FIELDS = ['title', 'name', 'Name', 'segmentTitle', 'SegmentTitle', 'heading'];

/** Field names checked, in order, when looking for a document's id. */
const ID_FIELDS = ['id', 'Id', 'ID', 'recordId', 'RecordID'];

/**
 * Resolve a document's snippet text, preferring an explicitly configured field.
 *
 * @param doc - the raw hit document
 * @param preferredField - deployment-configured field name, checked before the defaults
 */
export function ResolveHitSnippet(doc: ExternalSearchDocument, preferredField?: string): string {
    const candidates = preferredField ? [preferredField, ...SNIPPET_FIELDS] : SNIPPET_FIELDS;
    return firstString(doc, candidates) ?? '';
}

/** Resolve a document's title, falling back to the supplied default. */
export function ResolveHitTitle(doc: ExternalSearchDocument, fallback: string, preferredField?: string): string {
    const candidates = preferredField ? [preferredField, ...TITLE_FIELDS] : TITLE_FIELDS;
    return firstString(doc, candidates) ?? fallback;
}

/** Resolve a document's identifier, falling back to the supplied default. */
export function ResolveHitID(doc: ExternalSearchDocument, fallback: string): string {
    return firstString(doc, ID_FIELDS) ?? fallback;
}

/**
 * Extract chunk provenance from a hit.
 *
 * This is what lets a search result deep-link to a moment in a recording or a page in a
 * PDF rather than just naming the asset. Absent fields are simply omitted.
 */
export function ExtractChunkProvenance(doc: ExternalSearchDocument): ExternalChunkProvenance {
    const provenance: ExternalChunkProvenance = {};
    assignString(provenance, 'ChunkID', doc, ['chunkId', 'ChunkID', 'chunk_id']);
    assignString(provenance, 'ContentItemID', doc, ['contentItemId', 'ContentItemID', 'content_item_id']);
    assignString(provenance, 'Modality', doc, ['modality', 'Modality']);
    assignNumber(provenance, 'StartMs', doc, ['startMs', 'StartMs', 'start_ms']);
    assignNumber(provenance, 'EndMs', doc, ['endMs', 'EndMs', 'end_ms']);
    assignNumber(provenance, 'PageNumber', doc, ['pageNumber', 'PageNumber', 'page_number']);
    return provenance;
}

/** True when any provenance field was found. */
export function HasChunkProvenance(provenance: ExternalChunkProvenance): boolean {
    return Object.keys(provenance).length > 0;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** First non-empty string value among the candidate keys. */
function firstString(doc: ExternalSearchDocument, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = doc[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
    }
    return undefined;
}

/** Copy the first matching string field onto the provenance object. */
function assignString(
    target: ExternalChunkProvenance,
    field: 'ChunkID' | 'ContentItemID' | 'Modality',
    doc: ExternalSearchDocument,
    keys: string[],
): void {
    const value = firstString(doc, keys);
    if (value !== undefined) {
        target[field] = value;
    }
}

/** Copy the first matching numeric field onto the provenance object. */
function assignNumber(
    target: ExternalChunkProvenance,
    field: 'StartMs' | 'EndMs' | 'PageNumber',
    doc: ExternalSearchDocument,
    keys: string[],
): void {
    for (const key of keys) {
        const value = doc[key];
        const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
        if (Number.isFinite(numeric)) {
            target[field] = numeric;
            return;
        }
    }
}
