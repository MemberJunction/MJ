/**
 * Pure routing function: decides whether an artifact reaches the LLM via an
 * inline content block (image_url, audio_url, file_url) or via the artifact
 * tool dispatch path. Has no entity-type or framework dependency — operates
 * on plain inputs and returns a discriminated result. Lives next to the
 * resolver but is independently testable.
 *
 * See plans/artifact-attachment-unification.md §4 for the contract.
 */

export type ArtifactDeliveryMode = 'Inline' | 'ToolsOnly';

export interface ArtifactRoutingInput {
    /** The Artifact Type's DefaultDeliveryMode. */
    TypeDefault: ArtifactDeliveryMode;
    /** Per-instance opt-out — `true` forces tools regardless of typeDefault. */
    ForceToolsOnly: boolean;
    /** MIME type of the artifact content (e.g. 'image/png'). */
    mimeType: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Size of the content in bytes. */
    SizeBytes: number;
    /** Maximum inline size in bytes; over this, even Inline-default artifacts go to tools. */
    InlineSizeCap: number;
    /** Predicate: does the active model driver support the given MIME modality inline? */
    ModelSupportsModality: (mimeType: string) => boolean;
    /** Model name used in error messages — never used to make decisions. */
    ModelName: string;
    /** Artifact type name used in error messages. */
    ArtifactTypeName: string;
}

export type ArtifactRoutingDecision =
    | { delivery: 'inline' }  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    | { delivery: 'tools'; Annotation?: string }  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    | { delivery: 'error'; message: string };  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined

export function RouteArtifact(input: ArtifactRoutingInput): ArtifactRoutingDecision {
    const {
        TypeDefault: typeDefault,
        ForceToolsOnly: forceToolsOnly,
        mimeType,
        SizeBytes: sizeBytes,
        InlineSizeCap: inlineSizeCap,
        ModelSupportsModality: modelSupportsModality,
        ModelName: modelName,
        ArtifactTypeName: artifactTypeName,
    } = input;

    // Path 1: ToolsOnly default or per-instance opt-out — always tools.
    if (typeDefault === 'ToolsOnly' || forceToolsOnly) {
        return { delivery: 'tools' };
    }

    // Path 2: Inline default + modality mismatch — hard error.
    // The admin / user has paired an Inline-default type with a model that does
    // not support the modality. There is no defensible runtime fix, so surface
    // it with a remediable message rather than silently falling back to tools.
    if (!modelSupportsModality(mimeType)) {
        return {
            delivery: 'error',
            message:
                `Artifact type "${artifactTypeName}" is configured for Inline delivery but model "${modelName}" does not support modality "${mimeType}". ` +
                `Either configure the type as ToolsOnly, set ForceToolsOnly on this instance, or switch to a model that supports this modality.`,
        };
    }

    // Path 3: Inline default + over size cap — documented, annotated fallback.
    // Not silent: the manifest entry carries a visible note and the caller is
    // expected to log at WARN. Both the LLM and the operator can see it
    // happened, so this isn't the same as the silent-fallback antipattern.
    if (sizeBytes >= inlineSizeCap) {
        return {
            delivery: 'tools',
            Annotation: `Artifact type "${artifactTypeName}" is configured for Inline delivery but content size (${sizeBytes} bytes) exceeds the inline cap (${inlineSizeCap} bytes); delivered via tools instead.`,
        };
    }

    // Path 4: Inline, modality supported, under cap — emit inline content block.
    return { delivery: 'inline' };
}
