/**
 * @fileoverview Which artifacts the Data renderer claims.
 *
 * Its own module, free of any React Native import, so the matching rule is testable directly — the
 * same reason the composer's Return rule and the session card's view model live apart from their
 * components. What a renderer CLAIMS is the part that can silently go wrong; what it draws is
 * visible the moment you look at it.
 */

/** Type names the query builder's output is written under. */
const DATA_TYPE_NAMES = new Set(['data', 'data snapshot']);

/** MIME types MJ stamps on that output. */
const DATA_CONTENT_TYPES = new Set(['application/vnd.mj.data', 'application/vnd.mj.data-snapshot']);

/**
 * Whether an artifact is query-builder output.
 *
 * Matches on EITHER the type name or the content type: an artifact written with the MIME type but
 * an unexpected type name still finds its renderer, which is the situation a metadata-driven system
 * produces the moment someone adds a type.
 *
 * @param typeName The artifact type name.
 * @param contentType The version MIME type, when known.
 */
export function IsDataArtifact(typeName: string | null | undefined, contentType?: string | null): boolean {
    const t = (typeName ?? '').trim().toLowerCase();
    const c = (contentType ?? '').trim().toLowerCase();
    return DATA_TYPE_NAMES.has(t) || DATA_CONTENT_TYPES.has(c);
}
