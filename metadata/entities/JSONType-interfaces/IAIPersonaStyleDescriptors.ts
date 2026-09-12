/**
 * Nuanced style and presentation descriptors for an AI Persona.
 *
 * Stored as JSON in `MJ: AI Personas.StyleDescriptors`. CodeGen emits a typed
 * `StyleDescriptorsObject` accessor on `MJAIPersonaEntity` returning `IAIPersonaStyleDescriptors | null`.
 *
 * Reserved extension point for fine-grained style descriptors (e.g. cadence, emphasis, prosody quirks)
 * beyond the primary Tone and SpeakingStyle scalar columns.
 */
export interface IAIPersonaStyleDescriptors {
    /** Prose for GPT-Live's `Interruption policy:` prompt block (gpt-live-1.md §1). */
    interruptionPolicy?: string;
    /** Prose for GPT-Live's `Backchannel policy:` prompt block. */
    backchannelPolicy?: string;
    /** Open extension point for additional fine-grained style descriptors. */
    [key: string]: unknown;
}
