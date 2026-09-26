/**
 * The canonical AI configuration shapes + the pure cascade resolvers.
 *
 * The AI stack carries `nvarchar(max)` JSONType configuration bags at five levels, in two cascades.
 * The MODEL CATALOG cascade describes the model:
 *
 * ```
 * MJ: AI Model Types . ModelConfiguration     (type-wide default — e.g. every Realtime model)
 *   < MJ: AI Models . ModelConfiguration      (per-model)
 *     < MJ: AI Model Vendors . ModelConfiguration   (per model-on-this-provider — the winner)
 * ```
 *
 * The PROMPT cascade describes what a given prompt asks for, and layers on top of the catalog:
 *
 * ```
 * MJ: AI Prompts . PromptConfiguration        (per-prompt)
 *   < MJ: AI Prompt Models . PromptConfiguration  (per prompt-on-this-model — the winner)
 * ```
 *
 * Both compose the SAME per-modality section types ({@link LLMConfigurationSettings},
 * {@link RealtimeConfigurationSettings}, …) — one definition of what "the LLM configuration" means,
 * reused at every layer. Only the outer per-table type differs.
 *
 * **Lockstep contract**: these interfaces mirror
 * `metadata/entities/JSONType-interfaces/IAIConfiguration.ts`, which is pushed into
 * `EntityField.JSONTypeDefinition` and drives the CodeGen-generated `ModelConfigurationObject` /
 * `PromptConfigurationObject` accessors on the five entities. Keep the two in step when adding a section
 * or property — the same pact `IAgentSettings` follows with `@memberjunction/ai-core-plus`.
 *
 * **Boundary rule** (also documented on the metadata interface): anything the engine filters,
 * sorts, or joins on stays a COLUMN (`PowerRank`, `IsActive`, `Priority`, `Status` — SQL cannot
 * cheaply predicate into this bag); anything a driver or runner consumes at call time belongs HERE.
 * New capability knobs go in the bag — do not add a capability column per knob. A knob graduates to
 * a real column when it needs a foreign key or becomes a first-class platform concept.
 */

import { IsPlainObject } from '@memberjunction/global';

import { JSONObject, JSONValue } from './baseRealtime';
import type { RealtimeTrackDescriptor } from './realtimeTracks';

/**
 * MJ-normalized turn-detection mode vocabulary — provider-neutral by design so a shared model
 * catalog is safe on every provider:
 *
 * - `'default'` — let the provider profile decide (byte-for-byte today's behavior).
 * - `'serverVad'` — classic silence-based server VAD.
 * - `'semanticVad'` — the provider's semantic end-of-utterance detection (OpenAI `semantic_vad`).
 * - `'native'` — deliberately open-ended: "this model's smartest documented turn/duplex mode,
 *   whatever the profile maps it to." The forward slot for full-duplex reasoning voice models
 *   (e.g. Grok Voice Think Fast) — a profile that maps `'native'` ships the mapping once and the
 *   catalog opts models in via metadata, no driver release per model.
 *
 * A profile that does NOT support a requested mode logs and falls back to its default — a wrong
 * inherited value degrades safely, it never rejects a session.
 */
export type RealtimeTurnDetectionMode = 'default' | 'serverVad' | 'semanticVad' | 'native';

/**
 * Normalized turn-detection settings. Every field optional; absent fields contribute nothing.
 * Profiles translate to their native wire fields and ignore what they have no mapping for.
 */
export interface RealtimeTurnDetectionSettings {
    /** The normalized mode; absent = `'default'`. */
    Mode?: RealtimeTurnDetectionMode;
    /** Semantic-VAD aggressiveness (OpenAI `eagerness`); ignored by profiles without a mapping. */
    Eagerness?: 'low' | 'auto' | 'high';
    /** Server-VAD activation threshold (0–1); ignored by profiles without a mapping. */
    Threshold?: number;
    /** Server-VAD trailing-silence duration in ms; ignored by profiles without a mapping. */
    SilenceDurationMs?: number;

    /**
     * What a turn's input is allowed to include. Distinct from DETECTION (when a turn ends):
     * coverage is WHAT rides in it.
     *
     * Gemini 3.8 Live defaults to `audioActivityAndAllVideo`, which ships every video frame to the
     * model by default — billed and consuming context. Declaring coverage explicitly keeps that a
     * decision rather than an inherited default. Profiles without a mapping ignore it.
     */
    Coverage?: RealtimeTurnCoverage;
}

/**
 * What a turn carries as input.
 *
 * - `'audioActivityOnly'` — audio activity only; video frames are sent deliberately, not by default.
 * - `'audioActivityAndAllVideo'` — audio activity plus every video frame (Gemini 3.8 Live's own
 *   default, `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO`).
 */
export type RealtimeTurnCoverage = 'audioActivityOnly' | 'audioActivityAndAllVideo';

/**
 * Which plane handles reasoning during a realtime session:
 * - `'local'` — the application/agent loop handles reasoning, Actions, and tool results (MJ default).
 * - `'remote'` — the model delegates reasoning to a remote model or hosted agent backend.
 */
export type RealtimeReasoningPlane = 'local' | 'remote';

/**
 * Configuration for remote reasoning delegation.
 */
export interface RealtimeRemoteReasoning {
    /** What the remote reference denotes. `model` = Live/Inworld; `hostedAgent` = ElevenLabs. */
    Kind?: 'model' | 'hostedAgent';
    /** 'gpt-5.6-terra' | 'anthropic/claude-sonnet-4-6' | 'MJ Realtime Co-Agent'. */
    Ref?: string;
    /** Reasoning effort level for supported models. */
    Effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    /** Maximum output tokens for the remote reasoning pass. */
    MaxOutputTokens?: number;
}

/**
 * Realtime reasoning settings controlling dual delegation.
 */
export interface RealtimeReasoningSettings {
    /** Absent = 'local'. Session-creation-time only — NOT runtime-switchable. */
    Plane?: RealtimeReasoningPlane;
    /** Remote reasoning target when Plane is 'remote'. */
    Remote?: RealtimeRemoteReasoning;

    /**
     * Ask the model to emit human-readable summaries of its own reasoning as it works
     * (Gemini `thinkingConfig.includeThoughts`).
     *
     * These are NOT assistant speech — they are progress narration authored by the model, and
     * belong on the narration transcript path rather than the spoken-response path. Absent =
     * off; a profile with no mapping ignores it.
     */
    IncludeThoughtSummaries?: boolean;
}

/** The `Realtime` section — knobs the realtime drivers consume. */
export interface RealtimeConfigurationSettings {
    /**
     * Catalog-level turn-detection default for this model. Folded into the session Config bag as
     * the `turnDetection` key BELOW the agent/app config cascade (`realtime.session.turnDetection`)
     * and the runtime override — the catalog supplies the default, agents/apps/callers refine it.
     */
    TurnDetection?: RealtimeTurnDetectionSettings | null;

    /**
     * Reasoning plane settings — dual delegation configuration.
     * Absent defaults to 'local'.
     */
    Reasoning?: RealtimeReasoningSettings;

    /** Tool-execution semantics this model permits. Absent = the profile's own defaults. */
    Tooling?: RealtimeToolingSettings;

    /**
     * Media tracks this session asks the model to establish, beyond audio.
     *
     * **The request side of negotiation, and the reason "video off by default" is structural rather
     * than a default value someone can forget.** Absent or empty establishes audio only; a video
     * track exists only because something asked for it. That matters concretely: Gemini 3.8 Live's
     * own turn coverage defaults to including every video frame, billed, so a design where omission
     * means "inherit the provider" would ship a silent cost.
     *
     * Requests are intersected with the model's `SupportedInboundTracks` /
     * `SupportedOutboundTracks`; anything unsupported resolves to `'unsupported'` so the caller
     * falls back deliberately.
     */
    RequestedTracks?: readonly RealtimeTrackDescriptor[];

    /**
     * Which server signal means "the session has gone idle and deferred work may be flushed".
     *
     * Absent = `'turnComplete'`, which is every model MJ spoke to before Gemini 3.8 Live
     * Extended Thinking. On a model with asynchronous reasoning, `turnComplete` arrives while the
     * server is STILL reasoning and still issuing tool calls, so treating it as idle drains queued
     * work at the wrong moment; those models report `'interactionStatus'` instead.
     */
    IdleSignal?: RealtimeIdleSignal;
}

/**
 * Which server signal a driver should treat as "idle".
 *
 * - `'turnComplete'` — the turn-terminal frame also means the server is done (the classic case).
 * - `'interactionStatus'` — a separate status field carries idleness because `turnComplete` does
 *   NOT imply it (Gemini `interaction_status`: `IN_PROGRESS` vs `IDLE`).
 */
export type RealtimeIdleSignal = 'turnComplete' | 'interactionStatus';

/**
 * Tool-execution semantics, declared per model because the same Live API permits different
 * combinations per model rather than per provider.
 *
 * Both flags are capability DECLARATIONS, not requests: they say what the model will accept, so a
 * driver can refuse locally with a clear message instead of emitting a frame the server rejects.
 */
export interface RealtimeToolingSettings {
    /**
     * Whether synchronous blocking tool execution is legal.
     *
     * `false` on models that only accept asynchronous execution — Gemini 3.8 Live Extended
     * Thinking returns a HARD ERROR for blocking mode, so this must be caught before the frame is
     * sent. Absent = permitted (the historical default).
     */
    SupportsBlockingExecution?: boolean;

    /**
     * Whether per-function scheduling hints are legal (Gemini `SILENT` / `WHEN_IDLE` /
     * `INTERRUPTED`). Absent = not supported; only declare `true` where the model documents it.
     */
    SupportsScheduling?: boolean;

    /**
     * Preferred function calling behavior ('BLOCKING' | 'NON_BLOCKING').
     */
    Behavior?: 'BLOCKING' | 'NON_BLOCKING';
}

/**
 * The `LLM` section — knobs the LLM drivers and the prompt runner consume at call time.
 *
 * Every flag here is TRI-STATE (`boolean | null | absent`), and the three differ. The cascade
 * REPLACES on any explicit value (including `null`) and only skips a layer that OMITS the property.
 * So absent means "inherit", while an explicit value at a higher layer overrides a lower one even
 * when that value is `false`.
 *
 * Properties are marked with the layers that HONOR them. Setting one at a layer that does not honor
 * it is inert rather than an error — deliberate tolerance, so a knob can move between layers
 * without a schema change.
 *
 * Deliberately NO index signature: this interface must stay structurally identical to the JSONType
 * source, because CodeGen emits per-entity copies of that source and runtime code assigns those
 * generated types straight into this one. An index signature here (and not there) makes the two
 * incompatible. Unknown keys in stored JSON still round-trip fine at runtime — the parse is
 * tolerant; what is lost is only a compile-time affordance nothing needs.
 */
/**
 * How a provider's prompt cache decides whether a new request can reuse an earlier one.
 *
 * - `'prefix'` — the cache reuses a prior request only when that request's ENTIRE prompt is a byte
 *   prefix of the new one (OpenAI's automatic cache, xAI). Anything the framework appends per
 *   iteration must therefore be APPENDED, never replaced, or the reusable prefix ends at the system
 *   prompt.
 * - `'block'` — the cache works on block or segment boundaries inside the prompt (Anthropic's
 *   explicit breakpoints, Gemini's implicit cache, Cerebras's sliding cache), so a trailing
 *   per-iteration message can be replaced in place and the history before it still hits.
 *
 * Consumed by the loop agent's trailing runtime-state layout: see `TrailingStateMode` in
 * `@memberjunction/ai-agents`.
 */
export type PromptCacheStrategy = 'prefix' | 'block';

export interface LLMConfigurationSettings {
    /**
     * **Catalog layers only.** Whether this model — or this vendor's serving of it — supports native
     * tool/function calling. CAPABILITY flag, and a hard gate: no policy or preference at any layer
     * can force tools onto a (model, vendor) whose resolved value is not true.
     *
     * Set `false` only for a model or serving path verified NOT to support tools; leave absent when
     * support is unknown, because absent is the honest value and it inherits.
     */
    SupportsNativeToolCalling?: boolean | null;

    /**
     * **Catalog layers only.** Whether prompts run against this model default to native tool calling
     * when they express no preference of their own. POLICY flag — subordinate to
     * {@link LLMConfigurationSettings.SupportsNativeToolCalling}.
     */
    DefaultToNativeToolCalling?: boolean | null;

    /**
     * **Prompt layers only.** Whether THIS prompt asks for native tool calling. PREFERENCE — it
     * outranks the catalog's `DefaultToNativeToolCalling` and is still subordinate to the capability
     * gate. Absent means "no preference; fall through to the model's default".
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
     * **Catalog layers only.** How this serving path's prompt cache matches a new request against an
     * earlier one — see {@link PromptCacheStrategy}. Absent means `'block'`: the safe default, since a
     * replace-in-place trailing message costs a block-cache provider nothing, whereas append-only on
     * a block-cache provider only grows the context.
     *
     * Set `'prefix'` on the MODEL-VENDOR row of an inference provider whose cache is an exact
     * byte-prefix match (OpenAI, xAI). Model Vendors win over Models and Model Types in the cascade,
     * so a host that serves many models (Fireworks, Cerebras, Azure, Bedrock) can carry a per-model
     * answer that differs from the developer's own serving of the same model.
     */
    PromptCacheStrategy?: PromptCacheStrategy | null;
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
 * The per-modality bag common to every AI configuration column. Sections are optional and
 * per-modality so one row can configure everything the thing it describes does.
 */
export interface AIConfigurationSections {
    /** Text-generation knobs. */
    LLM?: LLMConfigurationSettings | null;
    /** Realtime (speech-to-speech) knobs. */
    Realtime?: RealtimeConfigurationSettings | null;
    /** Vision knobs. Reserved. */
    Vision?: VisionConfigurationSettings | null;
    /** Audio (TTS/STT) knobs. Reserved. */
    Audio?: AudioConfigurationSettings | null;
}

/**
 * The `ModelConfiguration` column on `MJ: AI Model Types`, `MJ: AI Models` and
 * `MJ: AI Model Vendors` — the model-catalog cascade.
 */
export type AIModelConfiguration = AIConfigurationSections;

/**
 * The `PromptConfiguration` column on `MJ: AI Prompts` — per-prompt call-time knobs, layered on top of
 * the resolved model-catalog configuration by the prompt runner.
 */
export type AIPromptConfiguration = AIConfigurationSections;

/**
 * The `PromptConfiguration` column on `MJ: AI Prompt Models` — the most specific layer, overriding both
 * the prompt's own bag and the model catalog for this one (prompt, model) pairing.
 */
export type AIPromptModelConfiguration = AIConfigurationSections;

/** @deprecated Renamed to {@link RealtimeConfigurationSettings}; the sections are shared now. */
export type RealtimeModelConfigurationSection = RealtimeConfigurationSettings;

/** @deprecated Renamed to {@link LLMConfigurationSettings}; the sections are shared now. */
export type LLMModelConfigurationSection = LLMConfigurationSettings;
/**
 * TOLERANTLY parses one `ModelConfiguration` column value. Returns `null` — never throws — for
 * absent, blank, malformed, or non-object payloads, so a bad catalog row contributes nothing to
 * the cascade instead of failing a session (mirrors `ParseRealtimeTypeConfiguration`).
 *
 * @param json The raw column value, or `null`/`undefined`.
 * @returns The parsed configuration, or `null` when the layer contributes nothing.
 */
export function ParseModelConfiguration(json: string | null | undefined): AIModelConfiguration | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(json);
        if (IsPlainObject(parsed)) {
            return parsed as AIModelConfiguration;
        }
        console.warn('[ParseModelConfiguration] Model configuration JSON is not a plain object; skipping layer.');
        return null;
    } catch (err) {
        console.warn('[ParseModelConfiguration] Failed to parse ModelConfiguration JSON; skipping malformed layer:', err);
        return null;
    }
}

/**
 * Resolves the EFFECTIVE model configuration by deep-merging the catalog layers, base first —
 * type default < model < model-vendor. Merge semantics are identical to the realtime config
 * cascade (`DeepMergeConfigs` in `@memberjunction/ai-agents` — duplicated here because package
 * layering runs the other way):
 *
 * - plain object vs plain object → recursive per-key merge (a vendor row overriding ONE
 *   `Realtime.TurnDetection` knob does not wipe the model's other sections);
 * - anything else (arrays, strings, numbers, booleans, `null`) → the later value REPLACES;
 * - `null`/`undefined` LAYERS are skipped entirely; inputs are never mutated.
 *
 * @param layers The catalog layers, base first (type, model, vendor).
 * @returns The merged configuration, or `null` when every layer is absent/empty.
 */
export function ResolveEffectiveModelConfiguration(
    ...layers: Array<AIModelConfiguration | null | undefined>
): AIModelConfiguration | null {
    const result: JSONObject = {};
    for (const layer of layers) {
        if (!IsPlainObject(layer)) {
            continue;
        }
        mergeInto(result, layer as unknown as JSONObject);
    }
    return Object.keys(result).length > 0 ? (result as AIModelConfiguration) : null;
}

/** Recursive worker for {@link ResolveEffectiveModelConfiguration} — merges `source` into `target`. */
function mergeInto(target: JSONObject, source: JSONObject): void {
    for (const key of Object.keys(source)) {
        const incoming = source[key];
        if (incoming === undefined) {
            continue;
        }
        const existing = target[key];
        if (IsPlainObject(existing) && IsPlainObject(incoming)) {
            mergeInto(existing, incoming);
        } else if (IsPlainObject(incoming)) {
            const copy: JSONObject = {};
            mergeInto(copy, incoming);
            target[key] = copy;
        } else if (Array.isArray(incoming)) {
            target[key] = incoming.slice() as JSONValue[];
        } else {
            target[key] = incoming;
        }
    }
}

/**
 * The {@link PromptCacheStrategy} an effective model configuration declares, or `null` when no
 * catalog layer set one. Read through {@link ResolveEffectiveModelConfiguration} (or
 * `AIEngineBase.GetEffectiveModelConfiguration`) so the model-vendor row's answer wins.
 */
export function GetPromptCacheStrategy(config: AIModelConfiguration | null | undefined): PromptCacheStrategy | null {
    const value = config?.LLM?.PromptCacheStrategy;
    return value === 'prefix' || value === 'block' ? value : null;
}
