/**
 * The AI stack's per-modality configuration bags — ONE source of truth for every layer.
 *
 * Two kinds of type live here, and the distinction is the whole point of the file:
 *
 * 1. **Shared modality sections** (`LLMConfigurationSettings`, `RealtimeConfigurationSettings`,
 *    `VisionConfigurationSettings`, `AudioConfigurationSettings`, `DecisionConfigurationSettings`,
 *    `PrivacyConfigurationSettings`) —
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
 * six entities emits the full (prefixed) set, including outer types it does not use.
 *
 * **Lockstep contract**: this file is the JSONType SOURCE; its package-side mirror is
 * `packages/AI/Core/src/generic/modelConfiguration.ts` in `@memberjunction/ai`, which runtime code
 * compiles against (the track types mirror its `realtimeTracks.ts`). Keep the two in step when
 * adding a section or property — the same pact `IAgentSettings` follows with
 * `@memberjunction/ai-core-plus`. Core's `modelConfiguration.test.ts` fails when they differ.
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
 * MJ-normalized turn-detection mode, provider-neutral so a shared catalog is safe on every provider:
 * - `'default'` — let the provider profile decide (today's behavior).
 * - `'serverVad'` — classic silence-based server VAD.
 * - `'semanticVad'` — semantic end-of-utterance detection (OpenAI `semantic_vad`).
 * - `'native'` — this model's smartest documented turn/duplex mode, whatever the profile maps it
 *   to; the forward slot for full-duplex reasoning voice models.
 */
export type RealtimeTurnDetectionMode = 'default' | 'serverVad' | 'semanticVad' | 'native';

/**
 * What a turn's input may include (distinct from detection, which decides when a turn ends):
 * - `'audioActivityOnly'` — audio activity only; video frames are sent deliberately.
 * - `'audioActivityAndAllVideo'` — audio activity plus every video frame (Gemini 3.8 Live's default).
 */
export type RealtimeTurnCoverage = 'audioActivityOnly' | 'audioActivityAndAllVideo';

/**
 * MJ-normalized turn-detection settings for realtime (speech-to-speech) models. Every field is
 * optional; absent fields contribute nothing. Provider profiles translate this vocabulary to their
 * native wire block, and an unsupported value is diagnostic-logged and falls back to the profile
 * default — a wrong inherited value degrades safely, it never rejects a session.
 */
export interface RealtimeTurnDetectionSettings {
    /** The normalized mode; absent = `'default'`. */
    Mode?: RealtimeTurnDetectionMode;
    /** Semantic-VAD aggressiveness (OpenAI `eagerness`); ignored without a mapping. */
    Eagerness?: 'low' | 'auto' | 'high';
    /** Server-VAD activation threshold (0–1); ignored without a mapping. */
    Threshold?: number;
    /** Server-VAD trailing-silence duration in ms; ignored without a mapping. */
    SilenceDurationMs?: number;
    /**
     * What a turn's input may include. Declaring it keeps Gemini 3.8 Live's every-frame default (billed,
     * and consuming context) a decision rather than an inherited cost. Ignored without a mapping.
     */
    Coverage?: RealtimeTurnCoverage;
}

/** Which plane handles reasoning: `'local'` (the application/agent loop, the default) or `'remote'`. */
export type RealtimeReasoningPlane = 'local' | 'remote';

/** A reasoning effort in MJ's neutral vocabulary; each provider profile maps the values its model accepts. */
export type RealtimeReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** The remote reasoning target, used when `Plane` is `'remote'`. */
export interface RealtimeRemoteReasoning {
    /** What the reference denotes: `'model'` (Live, Inworld) or `'hostedAgent'` (ElevenLabs). */
    Kind?: 'model' | 'hostedAgent';
    /** The target, e.g. `'gpt-5.6-terra'`, `'anthropic/claude-sonnet-4-6'`, `'MJ Realtime Co-Agent'`. */
    Ref?: string;
    /** The target's reasoning effort, for models that support one. */
    Effort?: RealtimeReasoningEffort;
    /** The most output tokens for the remote reasoning pass. */
    MaxOutputTokens?: number;
}

/** Reasoning-plane settings for realtime models — dual delegation configuration. */
export interface RealtimeReasoningSettings {
    /** Absent = `'local'`. Fixed when the session is created. */
    Plane?: RealtimeReasoningPlane;
    /** The remote target when `Plane` is `'remote'`. */
    Remote?: RealtimeRemoteReasoning;
    /**
     * How hard the model itself reasons (Gemini `thinkingConfig.thinkingLevel`). A profile that cannot
     * honour the value logs a warning and uses its own default.
     */
    Level?: RealtimeReasoningEffort;
    /**
     * Ask the model for human-readable summaries of its own reasoning (Gemini `includeThoughts`). They
     * are progress narration, not assistant speech. Absent = off.
     */
    IncludeThoughtSummaries?: boolean;
}

/** Which way samples flow on a track, relative to the model. */
export type RealtimeTrackDirection = 'inbound' | 'outbound';

/** The modalities MJ itself reasons about (cost, consent, transcripts). */
export type RealtimeWellKnownModality = 'audio' | 'video' | 'image' | 'text';

/** A modality key: one of the well-known values, or any registered string. */
export type RealtimeModalityKey = RealtimeWellKnownModality | (string & {});

/** How a track's usage is metered. */
export type RealtimeTrackUsageBasis = 'tokens' | 'seconds' | 'frames' | 'bytes';

/**
 * One directional stream of one modality, as {@link RealtimeConfigurationSettings.RequestedTracks}
 * requests it. Mirrors the track descriptor in `@memberjunction/ai` (`realtimeTracks.ts`).
 */
export interface RealtimeTrackDescriptor {
    /** The modality this track carries. */
    Modality: RealtimeModalityKey;
    /** Which way samples flow, relative to the model. */
    Direction: RealtimeTrackDirection;
    /** Wire encoding, e.g. `'audio/pcm;rate=16000'` or `'image/jpeg'`; absent = the profile's default. */
    Encoding?: string;
    /** Sample or frame cadence: fps for video, Hz for audio. */
    Rate?: number;
    /** How this track is metered; absent = the session's own basis. */
    UsageBasis?: readonly RealtimeTrackUsageBasis[];
    /** Whether establishing this track needs an explicit human grant (camera, screen, microphone). */
    RequiresConsent?: boolean;
    /** Whether the session needs this track (`true`) or treats it as best-effort (`false`). */
    Required?: boolean;
    /** Which source feeds this track, when several streams of one modality and direction can exist. */
    SourceID?: string;
    /** A human-readable name for that source ("Whiteboard", "Camera"). */
    Label?: string;
}

/**
 * Which server signal means "the session has gone idle and deferred work may be flushed":
 * `'turnComplete'` (the default) or `'interactionStatus'`, for models with asynchronous reasoning
 * whose `turnComplete` arrives while they still reason and call tools.
 */
export type RealtimeIdleSignal = 'turnComplete' | 'interactionStatus';

/** Tool-execution semantics a model permits. Capability declarations, not requests. */
export interface RealtimeToolingSettings {
    /**
     * Whether synchronous blocking tool execution is legal. Absent = permitted. `false` on models that
     * reject blocking mode outright (Gemini 3.8 Live Extended Thinking).
     */
    SupportsBlockingExecution?: boolean;
    /**
     * Whether per-function scheduling hints are legal (Gemini `SILENT` / `WHEN_IDLE` / `INTERRUPTED`).
     * Absent = not supported.
     */
    SupportsScheduling?: boolean;
    /** Preferred function-calling behavior. */
    Behavior?: 'BLOCKING' | 'NON_BLOCKING';
}

/**
 * One price for a quantity a realtime session produces, in one currency. It applies only when all
 * three fields are set; a partial price, or a unit or currency the reader does not handle, counts
 * as no price.
 */
export interface RealtimeUnitPrice {
    /** The amount charged per {@link RealtimeUnitPrice.Unit}. Never negative. */
    Price?: number | null;
    /**
     * The billing unit, named as in `MJ: AI Model Price Unit Types`. `'Per Minute'`: one minute.
     * `'Per 1M Tokens'`: one million tokens.
     */
    Unit?: 'Per Minute' | 'Per 1M Tokens' | null;
    /** ISO 4217 currency code, uppercase (e.g. `USD`), as on `MJ: AI Model Costs`. */
    Currency?: string | null;
}

/**
 * Prices for realtime output that the model's cost rows (`MJ: AI Model Costs`) do not price on
 * their own; the cost rows stay the authority for token prices. A price belongs to the host that
 * charges it, so set this on the model-vendor row: a price on the model or the model type would
 * reach every vendor that serves the model.
 */
export interface RealtimePricingSettings {
    /**
     * The price of avatar video output, charged on top of the session's token cost. `'Per Minute'`
     * prices the seconds of avatar video the model generates; `'Per 1M Tokens'` prices the output
     * tokens the provider counts as video. Set the price and its unit together: the cascade merges
     * per key, so a layer that sets only one of them keeps the other from the layer below.
     *
     * Unverified until checked against Google's bill (#5312): Gemini 3.8 Live on Vertex AI is
     * seeded at $0.37152 per minute, derived from Google's $1.00 per 1M avatar video output tokens
     * at 6,192 tokens per second.
     */
    AvatarVideoOutput?: RealtimeUnitPrice | null;
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
    Reasoning?: RealtimeReasoningSettings;

    /**
     * Whether this realtime model natively supports full-duplex conversational audio
     * (simultaneous speaking and listening with natural interruptions).
     *
     * When true, full-duplex models do not receive turn-taking tools or an energy-VAD floor gate,
     * allowing the provider's native full-duplex model to handle natural turn transitions.
     * Cascades AIModelType -> Vendor ModelDefaults -> AIModel -> AIModelVendor.
     */
    FullDuplex?: boolean | null;

    /** Tool-execution semantics this model permits. Absent = the profile's own defaults. */
    Tooling?: RealtimeToolingSettings;

    /**
     * Media tracks a session asks the model to establish beyond audio. Absent or empty establishes
     * audio only, so a video track exists only because something asked for it and never arrives as an
     * inherited cost. Requests are intersected with what the model supports.
     */
    RequestedTracks?: readonly RealtimeTrackDescriptor[];

    /** Which server signal means the session has gone idle. Absent = `'turnComplete'`. */
    IdleSignal?: RealtimeIdleSignal;

    /**
     * Prices for output the token cost rows do not cover, such as avatar video. Set it on the
     * model-vendor row.
     */
    Pricing?: RealtimePricingSettings | null;
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
 * Privacy posture of the model deployment this configuration describes. Set it on the catalog layers
 * (`MJ: AI Models`, `MJ: AI Model Vendors`, a vendor's `ModelDefaults`): data retention is a property of
 * how a model is SERVED, so the vendor row is usually where it is true.
 */
export interface PrivacyConfigurationSettings {
    /**
     * Whether this model is served under a zero-data-retention agreement: the provider does not store
     * prompts, audio, images or outputs beyond serving the request. `true` is a positive claim that
     * somebody verified; absent, `null` and `false` all mean "not declared", never "retained", because
     * an undeclared model is not known to be bad. It is read by realtime channel exposure policy:
     * an agent that requires zero data retention for a channel's `'state'` or `'pixels'` exposure has
     * that exposure lowered on any model that does not declare `true` here.
     */
    ZeroDataRetention?: boolean | null;
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
    /** Privacy posture of the model deployment. Honored at the catalog layers. */
    Privacy?: PrivacyConfigurationSettings | null;
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
    /** Privacy posture. Reserved at this layer. */
    Privacy?: PrivacyConfigurationSettings | null;
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
    /** Privacy posture. Reserved at this layer. */
    Privacy?: PrivacyConfigurationSettings | null;
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
