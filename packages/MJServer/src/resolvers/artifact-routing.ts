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
    typeDefault: ArtifactDeliveryMode;
    /** Per-instance opt-out — `true` forces tools regardless of typeDefault. */
    forceToolsOnly: boolean;
    /** MIME type of the artifact content (e.g. 'image/png'). */
    mimeType: string;
    /** Size of the content in bytes. */
    sizeBytes: number;
    /** Maximum inline size in bytes; over this, even Inline-default artifacts go to tools. */
    inlineSizeCap: number;
    /** Predicate: does the active model driver support the given MIME modality inline? */
    modelSupportsModality: (mimeType: string) => boolean;
    /** Model name used in error messages — never used to make decisions. */
    modelName: string;
    /** Artifact type name used in error messages. */
    artifactTypeName: string;
}

export type ArtifactRoutingDecision =
    | { delivery: 'inline' }
    | { delivery: 'tools'; annotation?: string }
    | { delivery: 'error'; message: string };

export function RouteArtifact(input: ArtifactRoutingInput): ArtifactRoutingDecision {
    const {
        typeDefault,
        forceToolsOnly,
        mimeType,
        sizeBytes,
        inlineSizeCap,
        modelSupportsModality,
        modelName,
        artifactTypeName,
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
            annotation: `Artifact type "${artifactTypeName}" is configured for Inline delivery but content size (${sizeBytes} bytes) exceeds the inline cap (${inlineSizeCap} bytes); delivered via tools instead.`,
        };
    }

    // Path 4: Inline, modality supported, under cap — emit inline content block.
    return { delivery: 'inline' };
}
