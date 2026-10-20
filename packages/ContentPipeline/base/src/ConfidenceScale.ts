/**
 * @fileoverview Every confidence score the framework proposes. Only the ordering matters; they are
 * constants, not configuration, so persisted `FieldConfidence` values stay comparable.
 *
 * @module @memberjunction/content-pipeline-base
 */

/** The scale, ordered by how much each kind of evidence deserves to be believed. */
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

    // A listing says what a source claims it has, so each of these loses to the extractor.
    /** A title from a source listing. */
    DiscoveredTitle: 4,
    /** A date from a source listing. */
    DiscoveredDate: 4,
    /** A file type from a source listing, before any bytes were seen. */
    DiscoveredFileType: 3,
} as const;

/** The name of one entry on the scale. */
export type ConfidenceScaleKey = keyof typeof ConfidenceScale;

/** Which scale entry each kind of file-type evidence draws its confidence from. */
export const FileTypeEvidenceConfidenceKey = {
    Declared: 'FileTypeDeclared',
    ByteCorrection: 'FileTypeByteCorrection',
    Signature: 'FileTypeSignature',
    Extension: 'FileTypeExtension',
    SourceDefault: 'FileTypeSourceDefault',
} as const satisfies Record<string, ConfidenceScaleKey>;
