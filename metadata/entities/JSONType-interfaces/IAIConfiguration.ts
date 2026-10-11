/**
 * The AI stack's per-modality configuration bags — ONE source of truth for every layer.
 *
 * Two kinds of type live here, and the distinction is the whole point of the file:
 *
 * 1. **Shared modality sections** (`LLMConfigurationSettings`, `RealtimeConfigurationSettings`,
 *    `VisionConfigurationSettings`, `AudioConfigurationSettings`, `DecisionConfigurationSettings`) —
 *    what "the LLM configuration"
 *    MEANS, defined once and reused by every layer that carries a configuration bag.
 * 2. **Per-table outer types** (`IAIModelConfiguration`, `IAIPromptConfiguration`,
 *    `IAIPromptModelConfiguration`) — one per `JSONType`, so each table names its own type even
 *    though they compose the same sections.
 *
 * ```
 * MJ: AI Model Types . ModelConfiguration     (type-wide default — e.g. every Realtime model)
 *   < MJ: AI Models . ModelConfiguration      (per-model)
 *     < MJ: AI Vendors . Configuration.ModelDefaults   (host-wide default for every model this vendor serves)
 *       < MJ: AI Model Vendors . ModelConfiguration   (per model-on-this-provider — the tie-breaker, wins)
 *
 * MJ: AI Prompts . PromptConfiguration        (per-prompt)
 *   < MJ: AI Prompt Models . PromptConfiguration  (per prompt-on-this-model — the winner)
 * ```
 *
 * The catalog cascade is resolved base-first with per-key deep merge by
 * `ResolveEffectiveModelConfiguration` in `@memberjunction/ai`; the prompt cascade is resolved by
 * the prompt runner, which layers the prompt bags ON TOP of the catalog result.
 *
 * **Why one file**: `EntityField.JSONTypeDefinition` stores this text VERBATIM, and CodeGen emits
 * it inline above each entity class with every top-level name prefixed (`MJAIModelEntity_…`). It
 * therefore has to be self-contained — a definition cannot `import` a sibling, and `@file:`
 * substitutes a whole file rather than splicing one into another. Keeping every AI configuration
 * type in ONE file is what makes a shared section possible at all; the cost is that each of the
 * five entities emits the full (prefixed) set, including outer types it does not use.
 *
 * **Lockstep contract**: this file is the JSONType SOURCE; its package-side mirror is
 * `packages/AI/Core/src/generic/modelConfiguration.ts` in `@memberjunction/ai`, which runtime code
 * compiles against. Keep the two in step when adding a section or property — the same pact
 * `IAgentSettings` follows with `@memberjunction/ai-core-plus`.
 *
 * **Boundary rule**: anything the engine filters, sorts, or joins on stays a COLUMN (`PowerRank`,
 * `IsActive`, `Priority`, `Status` — SQL cannot cheaply predicate into this bag); anything a driver
 * or runner consumes at call time belongs HERE. New capability knobs go in the bag — do not add a
 * capability column per knob. A knob graduates to a real column when it needs a foreign key or
 * becomes a first-class thing the platform reasons about.
 */

// =============================================================================
// Shared modality sections — defined once, composed by every outer type below
// =============================================================================

/**
 * Text-generation knobs, consumed by the LLM drivers and the prompt runner at call time.
 *
 * Every flag is TRI-STATE (`boolean | null | absent`) and the three differ: the cascade REPLACES on
 * any explicit value (including `null`) and only skips a layer that OMITS the property. So absent
 * means "inherit", while an explicit value at a higher layer overrides a lower one even when false.
 *
 * Properties are marked with the layers that HONOR them. A property set at a layer that does not
 * honor it is inert, not an error — that tolerance is deliberate, so a knob can move between layers
 * without a schema change.
 */
export interface LLMConfigurationSettings {
    /**
     * **Catalog layers only** (model type / model / model vendor). Whether this model — or this
     * vendor's serving of it — supports native tool/function calling.
     *
     * CAPABILITY flag, and a hard gate: no policy or preference at any layer can force tools onto a
     * (model, vendor) whose resolved value is not true. Set `false` only for a model or serving path
     * verified NOT to support tools; leave absent when support is unknown, because absent is the
     * honest value and it inherits.
     */
    SupportsNativeToolCalling?: boolean | null;

    /**
     * **Catalog layers only.** Whether prompts run against this model default to native tool calling
     * when they express no preference of their own. POLICY flag — subordinate to
     * {@link LLMConfigurationSettings.SupportsNativeToolCalling}.
     */
    DefaultToNativeToolCalling?: boolean | null;

    /**
     * **Prompt layers only** (prompt / prompt model). Whether THIS prompt asks for native tool
     * calling. PREFERENCE — it outranks the catalog's `DefaultToNativeToolCalling`, and is still
     * subordinate to the capability gate. Absent means "no preference; fall through to the model's
     * default".
     */
    UseNativeToolCalling?: boolean | null;

    /**
     * **Catalog layers only.** How control flow is expressed when a request resolves to native tool
     * calling. `'envelope'` (the default when absent) is the hybrid: Actions are tools, everything
     * else — completion, chat, delegation, payload changes — is the JSON envelope. `'implicit'` is the
     * implicit protocol: sub-agents, `payload_change_request` and `ask_user` are tools too, a tool call
     * continues the loop, and plain text with no call ends the turn as task completion. Consulted only
     * when the gate resolves native; subordinate to {@link LLMConfigurationSettings.SupportsNativeToolCalling}.
     */
    NativeControlFlow?: 'envelope' | 'implicit' | null;

    /**
     * **Catalog layers only.** Whether action results are returned to the model as native tool-result
     * turns instead of a markdown "Action results" user message. Absent means `false`. Consulted
     * only when the gate resolves native.
     */
    NativeToolResults?: boolean | null;

    /**
     * **Catalog layers only.** Whether this model accepts a forced tool choice — a named tool or
     * `'required'`. Absent means it does. When `false`, the prompt runner sends `'auto'` in place of a
     * forced choice, and the agent's prompt is what steers the model to the tool.
     */
    SupportsForcedToolChoice?: boolean | null;

    /**
     * **Catalog layers only.** Whether this serving path's prompt cache is an exact BYTE-PREFIX match:
     * it reuses a prior request only when that request's entire prompt is a prefix of the new one
     * (OpenAI's automatic cache, xAI), so per-iteration framework state must be appended, never
     * replaced. Absent or `false` means a block or segment cache (Anthropic breakpoints, Gemini
     * implicit cache, Cerebras sliding cache), where a trailing per-iteration message can be replaced
     * in place — the safe default. Set `true` under `Configuration.ModelDefaults` on the VENDOR row of a prefix-cache provider so
     * every model it serves inherits it (the vendor default beats the model's own bag); a MODEL-VENDOR
     * row overrides it for one model on that host.
     * Consumed by the loop agent's trailing runtime-state layout.
     */
    PrefixPromptCache?: boolean | null;
}

/**
 * MJ-normalized turn-detection settings for realtime (speech-to-speech) models. Every field is
 * optional; absent fields contribute nothing. Provider profiles translate this vocabulary to their
 * native wire block, and an unsupported value is diagnostic-logged and falls back to the profile
 * default — a wrong inherited value degrades safely, it never rejects a session.
 */
export interface RealtimeTurnDetectionSettings {
    /**
     * - `'default'` — let the provider profile decide (today's behavior).
     * - `'serverVad'` — classic silence-based server VAD.
     * - `'semanticVad'` — semantic end-of-utterance detection (OpenAI `semantic_vad`).
     * - `'native'` — this model's smartest documented turn/duplex mode, whatever the profile maps it
     *   to; the forward slot for full-duplex reasoning voice models.
     */
    Mode?: 'default' | 'serverVad' | 'semanticVad' | 'native' | null;
    /** Semantic-VAD aggressiveness (OpenAI `eagerness`); ignored without a mapping. */
    Eagerness?: 'low' | 'auto' | 'high' | null;
    /** Server-VAD activation threshold (0–1); ignored without a mapping. */
    Threshold?: number | null;
    /** Server-VAD trailing-silence duration in ms; ignored without a mapping. */
    SilenceDurationMs?: number | null;
}

/**
 * Reasoning-plane settings for realtime models — dual delegation configuration. Absent defaults to
 * `'local'`.
 */
export interface RealtimeReasoningSettings {
    /**
     * Which plane handles reasoning:
     * - `'local'` — application/agent loop (default).
     * - `'remote'` — delegated to remote model or hosted agent.
     */
    Plane?: 'local' | 'remote' | null;
    /** Remote reasoning target configuration. */
    Remote?: {
        Kind?: 'model' | 'hostedAgent' | null;
        Ref?: string | null;
        Effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | null;
        MaxOutputTokens?: number | null;
    } | null;
}

/** Realtime (speech-to-speech) knobs. */
export interface RealtimeConfigurationSettings {
    /**
     * Catalog-level turn-detection default for this model. Folded into the realtime session Config
     * bag as the `turnDetection` key BELOW the agent/app config cascade
     * (`realtime.session.turnDetection`) and the runtime override — the catalog supplies the
     * default, agents/apps/callers refine it.
     */
    TurnDetection?: RealtimeTurnDetectionSettings | null;

    /**
     * Reasoning plane settings — dual delegation configuration. Absent defaults to `'local'`.
     */
    Reasoning?: RealtimeReasoningSettings | null;

    /**
     * Whether this realtime model natively supports full-duplex conversational audio
     * (simultaneous speaking and listening with natural interruptions).
     *
     * When true, full-duplex models do not receive turn-taking tools or an energy-VAD floor gate,
     * allowing the provider's native full-duplex model to handle natural turn transitions.
     * Cascades AIModelType -> Vendor ModelDefaults -> AIModel -> AIModelVendor.
     */
    FullDuplex?: boolean | null;
}

/** Vision knobs. Reserved — no consumers yet. */
export interface VisionConfigurationSettings {
    [key: string]: unknown;
}

/** Audio (TTS/STT) knobs. Reserved — no consumers yet. */
export interface AudioConfigurationSettings {
    [key: string]: unknown;
}

/**
 * Typed-decision knobs, consumed at call time by the decision runner. They declare what a decision
 * model accepts, so an oversized request can be refused with a clear message before the call,
 * instead of being truncated or rejected by the provider. Each is a limit of the model itself: set
 * it on the catalog layers (`MJ: AI Models`, `MJ: AI Model Vendors`). Absent means no limit is
 * declared. A decision always needs at least two Choice options or Score levels; that minimum
 * belongs to `BaseDecision`, not to this bag.
 */
export interface DecisionConfigurationSettings {
    /** The most questions one call may carry. */
    MaxQuestionsPerCall?: number | null;
    /** The most options one Choice question may list. */
    MaxChoiceOptions?: number | null;
    /** The most levels one Score question may list. */
    MaxScoreLevels?: number | null;
    /** The largest state the model reads, in tokens. */
    MaxStateTokens?: number | null;
}

// =============================================================================
// Per-table outer types — one per JSONType, composing the sections above
// =============================================================================

/**
 * The `ModelConfiguration` column on the three MODEL-CATALOG entities (`MJ: AI Model Types`,
 * `MJ: AI Models`, `MJ: AI Model Vendors`), which form an inherit-with-override cascade. Sections
 * are per-modality so one catalog row can configure everything its model does.
 */
export interface IAIModelConfiguration {
    /** Text-generation knobs. Honors the catalog-layer properties. */
    LLM?: LLMConfigurationSettings | null;
    /** Realtime (speech-to-speech) knobs. */
    Realtime?: RealtimeConfigurationSettings | null;
    /** Vision knobs. Reserved. */
    Vision?: VisionConfigurationSettings | null;
    /** Audio (TTS/STT) knobs. Reserved. */
    Audio?: AudioConfigurationSettings | null;
    /** Typed-decision limits. Honored at the catalog layers. */
    Decision?: DecisionConfigurationSettings | null;
}

/**
 * The `PromptConfiguration` column on `MJ: AI Prompts` — per-prompt call-time knobs, layered ON TOP of the
 * resolved model-catalog configuration by the prompt runner.
 *
 * The same anti-widening argument that produced `ModelConfiguration` applies here with more force:
 * `AIPrompt` already carries fifty-odd columns. New per-prompt call-time knobs land here.
 */
export interface IAIPromptConfiguration {
    /** Text-generation knobs. Honors the prompt-layer properties. */
    LLM?: LLMConfigurationSettings | null;
    /** Realtime knobs. Reserved at this layer. */
    Realtime?: RealtimeConfigurationSettings | null;
    /** Vision knobs. Reserved. */
    Vision?: VisionConfigurationSettings | null;
    /** Audio knobs. Reserved. */
    Audio?: AudioConfigurationSettings | null;
    /** Typed-decision limits. Reserved at this layer. */
    Decision?: DecisionConfigurationSettings | null;
}

/**
 * The `PromptConfiguration` column on `MJ: AI Prompt Models` — the most specific layer, overriding both
 * the prompt's own bag and the model catalog for this one (prompt, model) pairing.
 */
export interface IAIPromptModelConfiguration {
    /** Text-generation knobs. Honors the prompt-layer properties. */
    LLM?: LLMConfigurationSettings | null;
    /** Realtime knobs. Reserved at this layer. */
    Realtime?: RealtimeConfigurationSettings | null;
    /** Vision knobs. Reserved. */
    Vision?: VisionConfigurationSettings | null;
    /** Audio knobs. Reserved. */
    Audio?: AudioConfigurationSettings | null;
    /** Typed-decision limits. Reserved at this layer. */
    Decision?: DecisionConfigurationSettings | null;
}

/**
 * `MJ: AI Vendors . Configuration` — the vendor's own configuration bag. General-purpose: a vendor
 * row carries settings that describe how this host serves models, of which the first key is
 * `ModelDefaults`. Add further vendor-level sections here as they arise; do not add capability
 * columns to AIVendor per knob.
 */
export interface IAIVendorConfiguration {
    /**
     * The default model configuration for EVERY model this vendor serves — the vendor layer of the
     * model-configuration cascade. Resolved ABOVE the model's own bag and BELOW the model-vendor row:
     * a host's statement about how it serves models beats the model's generic description, and the
     * model-vendor row is the tie-breaker where a host diverges for one model. The merge is per key,
     * so a default here only touches the keys it actually sets. First use: `LLM.PrefixPromptCache`
     * on OpenAI and x.ai, inherited by every model they serve.
     */
    ModelDefaults?: IAIModelConfiguration | null;
}
