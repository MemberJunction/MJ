/**
 * @fileoverview Every confidence score the framework proposes, in one place — and overridable per
 * source or per run.
 *
 * Only the ORDERING is load-bearing; the absolute numbers are arbitrary. Confidence is only ever
 * compared between proposals for the same item, and an item belongs to one source, so per-source
 * overrides never conflict across sources. Whatever value is used is recorded in `FieldConfidence`
 * alongside the stage that set it.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** The default scale, ordered by how much each kind of evidence deserves to be believed. */
export const ConfidenceScale = {
    /** Byte evidence that unambiguously contradicts a declaration. */
    FileTypeByteCorrection: 9,
    /** A type declared for this item. Authoritative unless bytes prove otherwise. */
    FileTypeDeclared: 7,
    /** A byte signature, where nothing was declared. */
    FileTypeSignature: 5,
    /** A filename extension. */
    FileTypeExtension: 2,
    /** The source's default file type — describes the source, not the item. */
    FileTypeSourceDefault: 1,

    /** A content type recognised from the document's own structure. */
    ContentTypeStructural: 7,

    /** Text from an extractor that understands the format. */
    ExtractorText: 6,
    /** A title an extractor found in the document itself. */
    ExtractorTitle: 6,
    /** Text from the last-resort plain-text read — loses to any real extractor. */
    FallbackText: 2,

    /** A chunk's text, a verbatim slice of its parent's. */
    SegmentText: 6,
    /** A modality detected from a recognised non-text format. */
    Modality: 6,

    // A listing says what a source claims it has, so each of these loses to the extractor by default.
    /** A title from a source listing. */
    DiscoveredTitle: 4,
    /** A date from a source listing. */
    DiscoveredDate: 4,
    /** A file type from a source listing, before any bytes were seen. */
    DiscoveredFileType: 3,
    /** A content type a source listing declared. */
    DiscoveredContentType: 3,
} as const;

/** The name of one entry on the scale. */
export type ConfidenceScaleKey = keyof typeof ConfidenceScale;

/** A resolved confidence scale with any source or run overrides applied. */
export type ResolvedConfidenceScale = Record<ConfidenceScaleKey, number>;

/**
 * Resolve the confidence scale, applying overrides from each configuration in order (e.g. Content
 * Source Type → Content Source → Record Process run `Options`).
 *
 * @example
 * ```json
 * { "Confidence": { "DiscoveredTitle": 8, "ExtractorTitle": 6 } }
 * ```
 *
 * Non-finite override values are ignored in favour of the previous value.
 */
export function ResolveConfidence(
    ...configurations: Array<Readonly<Record<string, unknown>> | undefined>
): ResolvedConfidenceScale {
    const resolved = { ...ConfidenceScale } as ResolvedConfidenceScale;
    for (const configuration of configurations) {
        if (!configuration) {
            continue;
        }
        const optionsObj = configuration.Options as Record<string, unknown> | undefined;
        const overrides = (configuration.Confidence ?? optionsObj?.Confidence ?? configuration) as Partial<
            Record<ConfidenceScaleKey, unknown>
        >;
        for (const key of Object.keys(ConfidenceScale) as ConfidenceScaleKey[]) {
            const value = overrides[key];
            if (typeof value === 'number' && Number.isFinite(value)) {
                resolved[key] = value;
            }
        }
    }
    return resolved;
}

/** Which scale entry each kind of file-type evidence draws its confidence from. */
export const FileTypeEvidenceConfidenceKey = {
    Declared: 'FileTypeDeclared',
    ByteCorrection: 'FileTypeByteCorrection',
    Signature: 'FileTypeSignature',
    Extension: 'FileTypeExtension',
    SourceDefault: 'FileTypeSourceDefault',
} as const satisfies Record<string, ConfidenceScaleKey>;
