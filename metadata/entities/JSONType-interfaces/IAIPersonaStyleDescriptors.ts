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
    /** Open extension point until the first typed knob lands. */
    [key: string]: unknown;
}
