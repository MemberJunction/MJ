/**
 * @fileoverview Every confidence score the framework proposes, in one place — and overridable per
 * run.
 *
 * A confidence score is a claim about how much a kind of evidence deserves to be believed. The
 * defaults here encode one reasonable view of that, but a deployment knows things the framework
 * cannot: that its sources declare file types carelessly, or that its HTML extractor finds better
 * titles than its listing pages do. Those are legitimate reasons to disagree, and disagreeing should
 * not require a release.
 *
 * **What stays honest regardless of where a number came from:** whatever value is actually used is
 * recorded in `FieldConfidence` alongside the stage that used it, so the provenance still describes
 * what really happened. Overriding changes which proposal wins; it does not change the record of
 * which one did.
 *
 * Only the ORDERING is load-bearing. The absolute numbers are arbitrary, which is also why
 * overriding one in isolation is usually a mistake — raise a extractor's text confidence above a
 * declaration's and you have changed a precedence rule, not a dial.
 *
 * @module @memberjunction/content-pipeline-base
 */

/**
 * The default scale, ordered by how much the evidence deserves to be believed.
 *
 * What matters is that a extractor that parsed the document beats a listing page that guessed, and that
 * a last-resort plain-text read loses to anything that actually understood the format.
 */
export const ConfidenceScale = {
    /** Byte evidence that unambiguously contradicts a declaration. The strongest signal available. */
    FileTypeByteCorrection: 9,
    /** A type the source declared at discovery. Authoritative unless bytes prove otherwise. */
    FileTypeDeclared: 7,
    /** A byte signature, where nothing was declared. */
    FileTypeSignature: 5,
    /** A filename extension — the weakest, last-resort signal. */
    FileTypeExtension: 2,

    /** A content type recognised from the document's own structure. */
    ContentTypeStructural: 7,

    /** Text produced by a extractor that understands the format. */
    ReaderText: 6,
    /** A title a extractor found in the document's own structure. */
    ReaderTitle: 6,
    /** Text from the last-resort plain-text read — loses to any real extractor that runs later. */
    FallbackText: 2,

    /** A chunk's text, a verbatim slice of its parent's. */
    SegmentText: 6,
    /** A modality detected from a recognised non-text signature. */
    Modality: 6,
} as const;

/** The name of one entry on the scale. */
export type ConfidenceScaleKey = keyof typeof ConfidenceScale;

/** The name of one entry on the scale. */
export type ResolvedConfidenceScale = Record<ConfidenceScaleKey, number>;

/**
 * Resolve the scale for a run, applying any overrides from its configuration.
 *
 * @example
 * ```json
 * { "Confidence": { "ReaderTitle": 9, "FileTypeDeclared": 4 } }
 * ```
 *
 * An override that is not a finite number is ignored in favour of the default: a typo should not
 * silently reorder the precedence rules a pipeline depends on.
 */
export function ResolveConfidence(
    configuration: Readonly<Record<string, unknown>> | undefined,
): ResolvedConfidenceScale {
    const overrides = (configuration?.Confidence ?? {}) as Partial<Record<ConfidenceScaleKey, unknown>>;
    const resolved = { ...ConfidenceScale } as ResolvedConfidenceScale;
    for (const key of Object.keys(ConfidenceScale) as ConfidenceScaleKey[]) {
        const value = overrides[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            resolved[key] = value;
        }
    }
    return resolved;
}

/** Which scale entry a kind of file-type evidence draws its confidence from. */
export const FileTypeEvidenceConfidenceKey = {
    Declared: 'FileTypeDeclared',
    ByteCorrection: 'FileTypeByteCorrection',
    Signature: 'FileTypeSignature',
    Extension: 'FileTypeExtension',
} as const satisfies Record<string, ConfidenceScaleKey>;
