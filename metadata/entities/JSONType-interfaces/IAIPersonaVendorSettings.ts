/**
 * Provider-specific configuration JSON for a persona-to-vendor binding.
 *
 * Stored as JSON in `MJ: AI Persona Vendors.VendorSettings`. CodeGen emits a typed
 * `VendorSettingsObject` accessor on `MJAIPersonaVendorEntity` returning `IAIPersonaVendorSettings | null`.
 *
 * Contains vendor-native voice/avatar tuning parameters (e.g., ElevenLabs voice settings)
 * moved out of generic base classes into their concrete vendor binding.
 */

export interface IAIPersonaVendorSettings {
    /** Vendor-native tuning, keyed by the vendor on AIPersonaVendor.VendorID.
     *  Typed members are those common enough to be worth compile-time checking. */
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    speed?: number;
    [key: string]: unknown;
}
