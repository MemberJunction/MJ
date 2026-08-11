/**
 * The per-modality model-configuration bag, stored as JSON in the `ModelConfiguration` column of
 * THREE catalog entities — the same type at every level, forming an inherit-with-override cascade
 * resolved base-first (deep-merged per key by `ResolveEffectiveModelConfiguration` in
 * `@memberjunction/ai`):
 *
 * ```
 * MJ: AI Model Types . ModelConfiguration     (type-wide default — e.g. every Realtime model)
 *   < MJ: AI Models . ModelConfiguration      (per-model)
 *     < MJ: AI Model Vendors . ModelConfiguration   (per model-on-this-provider — the winner)
 * ```
 *
 * CodeGen emits a strongly-typed `ModelConfigurationObject` accessor on all three generated
 * entities from this definition.
 *
 * **Lockstep contract**: this file is the JSONType SOURCE; its package-side mirror is
 * `AIModelConfiguration` in `@memberjunction/ai` (`packages/AI/Core/src/generic/modelConfiguration.ts`),
 * which runtime code compiles against. Keep the two in step when adding a section or property —
 * the same pact `IAgentSettings` follows with `@memberjunction/ai-core-plus`.
 *
 * **Boundary rule**: anything the engine filters, sorts, or joins on stays a COLUMN
 * (`PowerRank`, `IsActive`, `Priority`, `Status` — SQL cannot cheaply predicate into this bag);
 * anything a driver consumes at session/call time belongs HERE. New capability knobs go in this
 * bag — do not add a new capability column per knob.
 */
export interface IAIModelConfiguration {
    /**
     * Text-generation knobs. Reserved — no consumers yet. Candidate contents: per-model
     * effort-level defaults, response-format quirks, tool-calling behavior flags. Existing
     * capability COLUMNS (`SupportsEffortLevel`, `SupportsStreaming`, …) are NOT migrating here —
     * new knobs only.
     */
    LLM?: Record<string, unknown> | null;

    /** Realtime (speech-to-speech) knobs — the first live section. */
    Realtime?: {
        /**
         * Catalog-level turn-detection default for this model. Folded into the realtime session
         * Config bag as the `turnDetection` key BELOW the agent/app config cascade
         * (`realtime.session.turnDetection`) and the runtime override — the catalog supplies the
         * default, agents/apps/callers refine it. Provider profiles translate the normalized
         * vocabulary to their native wire block; an unsupported Mode is diag-logged and falls back
         * to the profile default (never rejects a session).
         */
        TurnDetection?: {
            /**
             * - 'default' — let the provider profile decide (today's behavior).
             * - 'serverVad' — classic silence-based server VAD.
             * - 'semanticVad' — semantic end-of-utterance detection (OpenAI `semantic_vad`).
             * - 'native' — this model's smartest documented turn/duplex mode, whatever the profile
             *   maps it to; the forward slot for full-duplex reasoning voice models (e.g. the
             *   Grok Voice Think Fast family).
             */
            Mode?: 'default' | 'serverVad' | 'semanticVad' | 'native' | null;
            /** Semantic-VAD aggressiveness (OpenAI `eagerness`); ignored without a mapping. */
            Eagerness?: 'low' | 'auto' | 'high' | null;
            /** Server-VAD activation threshold (0–1); ignored without a mapping. */
            Threshold?: number | null;
            /** Server-VAD trailing-silence duration in ms; ignored without a mapping. */
            SilenceDurationMs?: number | null;
        } | null;
    } | null;

    /** Vision knobs. Reserved. */
    Vision?: Record<string, unknown> | null;

    /** Audio (TTS/STT) knobs. Reserved. */
    Audio?: Record<string, unknown> | null;
}
