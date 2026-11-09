/**
 * Provider-specific configuration JSON for a persona-to-vendor binding.
 *
 * Stored as JSON in `MJ: AI Persona Vendors.VendorSettings`. CodeGen emits a typed
 * `VendorSettingsObject` accessor on `MJAIPersonaVendorEntity` returning `IAIPersonaVendorSettings | null`.
 *
 * Contains vendor-native voice/avatar tuning parameters (e.g., ElevenLabs voice settings)
 * moved out of generic base classes into their concrete vendor binding.
 *
 * A binding whose Modality is Video is the persona's avatar on that vendor: its `APIName` is the vendor's avatar id,
 * and {@link IAIPersonaVendorSettings.Avatar} tunes it.
 */

export interface IAIPersonaVendorSettings {
    /** Vendor-native tuning, keyed by the vendor on AIPersonaVendor.VendorID.
     *  Typed members are those common enough to be worth compile-time checking. */
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
    speed?: number;
    /**
     * The avatar's settings, on a binding whose Modality is Video. Vendor-neutral names: each realtime driver maps what
     * its vendor supports and ignores the rest.
     */
    Avatar?: {
        /**
         * 'preset': the binding's APIName is an avatar from the vendor's catalog. 'custom': an avatar made from a
         * reference image, which some vendors allow only to approved accounts. Custom likenesses stay behind a feature
         * flag until who may create one, and with what consent, is decided.
         */
        Kind?: 'preset' | 'custom';
        /** The MJ Storage file id of the reference image, when Kind is 'custom'. */
        ReferenceImageFileID?: string;
        /** The preferred video resolution; a driver uses the nearest its vendor offers. */
        Resolution?: 'low' | 'standard' | 'high';
        /** What shows behind the avatar, when the vendor can change it: a named treatment, or an image from MJ Storage. */
        Background?: 'default' | 'transparent' | 'blur' | { ImageFileID: string };
    };
    [key: string]: unknown;
}
