/**
 * Provider-specific configuration JSON for a persona-to-vendor binding.
 *
 * Stored as JSON in `MJ: AI Persona Vendors.VendorSettings`. CodeGen emits a typed
 * `VendorSettingsObject` accessor on `MJAIPersonaVendorEntity` returning `IAIPersonaVendorSettings | null`.
 *
 * Contains vendor-native voice/avatar tuning parameters (e.g., ElevenLabs voice settings)
 * moved out of generic base classes into their concrete vendor binding.
 */
export interface IElevenLabsVoiceSettings {
    /** Stability slider (0.0 to 1.0) controlling voice consistency vs variability. */
    stability?: number;
    /** Similarity boost (0.0 to 1.0) controlling adherence to the original voice sample. */
    similarityBoost?: number;
    /** Style exaggeration (0.0 to 1.0) amplifying stylistic inflections. */
    style?: number;
    /** Speaker boost enhancement toggle. */
    useSpeakerBoost?: boolean | number;
}

export interface IAIPersonaVendorSettings {
    /** ElevenLabs tuning settings at top level for flat vendor configuration. */
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean | number;

    /** Namespaced ElevenLabs tuning settings. */
    ElevenLabs?: IElevenLabsVoiceSettings;

    /** Open extension point for other vendor-specific settings (e.g., HeyGen avatar configs). */
    [key: string]: unknown;
}
