/**
 * @fileoverview PURE configuration module for Realtime co-agent type configuration —
 * the deep-merge + parse + normalize pipeline behind the effective-configuration contract:
 *
 * ```
 * AIAgentType.DefaultConfiguration  ←  AIAgent.TypeConfiguration  ←  runtime overrides
 * (base layer)                          (per-agent layer)             (per-session layer)
 * ```
 *
 * Later layers win **per key**: plain objects deep-merge, while arrays and primitives
 * replace wholesale. The merged result is normalized into the typed
 * {@link RealtimeCoAgentConfig} shape (wrong-typed fields are dropped, never thrown on).
 *
 * This module is deliberately **framework-free**: no DB, no metadata provider, no logging
 * imports — every function is a pure transformation so it can be exercised exhaustively in
 * unit tests and reused verbatim by the session service (`realtime-client-session-service.ts`),
 * the server-bridged path (`base-agent.ts`), and the MJServer resolver
 * (`RealtimeClientSessionResolver.ts`).
 *
 * The canonical JSON shape (the Realtime agent type's `ConfigSchema` is seeded to this):
 * ```jsonc
 * { "realtime": {
 *     "modelPreference": "<AI Model name or ID>",
 *     "voice": { "default": { "tone": "…", "speakingStyle": "…" },
 *                "providers": { "openai": { "voice": "alloy" },
 *                               "elevenlabs": { "voiceId": "…" },
 *                               "gemini": { "voice": "…" },
 *                               "assemblyai": { "voice": "…" } } },
 *     "allowUserModelOverride": true,
 *     "narration": { "paceMs": 8000 } } }
 * ```
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

/**
 * The MJ Authorization name that gates RUNTIME overrides on realtime session start:
 * `configOverridesJson` and explicit realtime-model selection that deviates from the
 * co-agent's metadata-configured preference. Seeded in `metadata/authorizations/.realtime.json`.
 */
export const REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION = 'Realtime: Advanced Session Controls';

/** A plain JSON object (string-keyed bag of JSON values). */
export type JSONObjectLike = Record<string, unknown>;

/** The default voice persona — folded into the session system prompt at mint. */
export interface RealtimeVoicePersona {
    /** Overall vocal tone (e.g. "warm and upbeat"). */
    tone?: string;
    /** Speaking style guidance (e.g. "concise sentences, no filler words"). */
    speakingStyle?: string;
}

/** Voice configuration: a persona plus per-provider native voice settings. */
export interface RealtimeVoiceConfig {
    /** The provider-agnostic persona (tone / speaking style), prompt-level. */
    default?: RealtimeVoicePersona;
    /**
     * Provider-specific voice settings keyed by provider (e.g. `openai`, `elevenlabs`,
     * `gemini`, `assemblyai`). Each value is an OPAQUE settings object merged into the matching
     * driver's open `Config` bag — the shape is a private pact with that driver.
     */
    providers?: Record<string, JSONObjectLike>;
}

/** Progress-narration tuning. */
export interface RealtimeNarrationConfig {
    /** Minimum gap (ms) between spoken progress updates. Must be a positive finite number. */
    paceMs?: number;
}

/**
 * Video configuration: whether the realtime session carries a synced VIDEO track (a talking-head /
 * avatar out, and the camera in) alongside audio. Absent / `enabled !== true` ⇒ audio-only (today's
 * behavior). The video track reuses the entire realtime contract — this just opts a co-agent into it
 * and names the avatar to use.
 */
export interface RealtimeVideoConfig {
    /**
     * Whether the session should carry video. Default (absent / non-boolean): `false`. When `true`,
     * resolution prefers a video-capable model and the client captures the camera + renders the
     * model/avatar video; degrades to audio-only when no video-capable model resolves.
     */
    enabled?: boolean;
    /**
     * Preferred video model/avatar provider — an `MJ: AI Models` Name OR ID of a video-capable realtime
     * model (e.g. a Runway avatar). Optional; absent ⇒ the default video-capable model is resolved.
     */
    provider?: string;
    /**
     * Provider-specific avatar/character identifier (e.g. a Runway preset or custom avatar id). OPAQUE
     * — passed through to the matching video driver (its shape is a private pact with that driver).
     */
    avatarId?: string;
    /**
     * Per-provider native video settings keyed by provider, merged into the matching driver's open
     * config bag — an OPAQUE private pact with that driver (mirrors {@link RealtimeVoiceConfig.providers}).
     */
    providers?: Record<string, JSONObjectLike>;
}

/** The `realtime` section of a co-agent's effective configuration. */
export interface RealtimeConfigSection {
    /** Preferred realtime model — an `MJ: AI Models` Name OR ID. Degrades gracefully when unsatisfiable. */
    modelPreference?: string;
    /** Voice persona + per-provider voice settings. */
    voice?: RealtimeVoiceConfig;
    /** Video/avatar configuration — opt a co-agent into a synced video track. Absent ⇒ audio-only. */
    video?: RealtimeVideoConfig;
    /**
     * Whether an (authorized) caller may override the realtime model per session.
     * `false` blocks explicit model overrides even for callers holding the
     * {@link REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION} authorization.
     * Default (absent / non-boolean): `true`.
     */
    allowUserModelOverride?: boolean;
    /** Progress-narration tuning. */
    narration?: RealtimeNarrationConfig;
}

/** The fully-normalized effective configuration for a Realtime co-agent. */
export interface RealtimeCoAgentConfig {
    /** The realtime section; absent when no layer supplied one. */
    realtime?: RealtimeConfigSection;
}

/** Input to {@link EvaluateRuntimeOverrideAuthorization}. */
export interface RuntimeOverrideAuthorizationInput {
    /** True when the caller supplied `configOverridesJson`. */
    HasConfigOverrides: boolean;
    /** The caller's explicit runtime model id (`preferredModelId`), when supplied. */
    RequestedModelID?: string | null;
    /**
     * The `MJ: AI Models.ID` the co-agent's METADATA configuration resolves to
     * (`realtime.modelPreference` resolved to an id), or `null` when no metadata preference is
     * configured/resolvable. A requested model equal to this id is NOT a deviation and needs no gate.
     */
    MetadataPreferredModelID?: string | null;
    /** The effective `realtime.allowUserModelOverride` policy (absent = allowed). */
    AllowUserModelOverride?: boolean;
    /** Whether the caller holds the {@link REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION} authorization. */
    CallerHasAdvancedControls: boolean;
}

/** Outcome of {@link EvaluateRuntimeOverrideAuthorization}. */
export interface RuntimeOverrideAuthorizationDecision {
    /** True when the requested overrides may proceed. */
    Allowed: boolean;
    /** Human-readable, caller-safe denial reason. Present when {@link Allowed} is false. */
    DenialReason?: string;
}

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is JSONObjectLike {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Case/whitespace-insensitive id/name equality (UUIDs differ only by case across DB platforms). */
function idsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) {
        return false;
    }
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Deep-merges configuration layers, EARLIEST first — later layers win per key.
 *
 * Merge rules (per key):
 * - plain object vs plain object → recursive deep merge;
 * - anything else (arrays, strings, numbers, booleans, `null`) → the later value REPLACES;
 * - `null` is a real JSON value and replaces like any primitive;
 * - `undefined` values in a later layer are skipped (they cannot exist in parsed JSON anyway).
 *
 * `null`/`undefined` LAYERS are skipped entirely. The inputs are never mutated; the result is a
 * fresh object graph.
 *
 * @param layers The configuration layers, base first, most-specific last.
 * @returns The merged configuration object (empty object when every layer is absent).
 */
export function DeepMergeConfigs(...layers: Array<JSONObjectLike | null | undefined>): JSONObjectLike {
    const result: JSONObjectLike = {};
    for (const layer of layers) {
        if (!isPlainObject(layer)) {
            continue;
        }
        mergeInto(result, layer);
    }
    return result;
}

/** Recursive worker for {@link DeepMergeConfigs} — merges `source` into `target` in place. */
function mergeInto(target: JSONObjectLike, source: JSONObjectLike): void {
    for (const key of Object.keys(source)) {
        const incoming = source[key];
        if (incoming === undefined) {
            continue;
        }
        const existing = target[key];
        if (isPlainObject(existing) && isPlainObject(incoming)) {
            mergeInto(existing, incoming);
        } else if (isPlainObject(incoming)) {
            const copy: JSONObjectLike = {};
            mergeInto(copy, incoming);
            target[key] = copy;
        } else if (Array.isArray(incoming)) {
            target[key] = incoming.slice();
        } else {
            target[key] = incoming;
        }
    }
}

/**
 * TOLERANTLY parses one configuration layer (a `TypeConfiguration` / `DefaultConfiguration` /
 * runtime-overrides JSON string). Returns `null` — never throws — for absent, blank, malformed,
 * or non-object payloads (arrays and scalars are not valid configuration layers).
 *
 * @param json The raw JSON string, or `null`/`undefined`.
 * @returns The parsed plain object, or `null` when the layer contributes nothing.
 */
export function ParseRealtimeTypeConfiguration(json: string | null | undefined): JSONObjectLike | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(json);
        return isPlainObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Resolves the EFFECTIVE realtime configuration from the three layers of the contract —
 * `AIAgentType.DefaultConfiguration` ← `AIAgent.TypeConfiguration` ← runtime overrides — by
 * tolerantly parsing each (see {@link ParseRealtimeTypeConfiguration}), deep-merging them
 * (later wins per key, see {@link DeepMergeConfigs}), and normalizing the result into the typed
 * {@link RealtimeCoAgentConfig} shape (wrong-typed fields dropped, never thrown on).
 *
 * @param typeDefaultJson The agent TYPE's `DefaultConfiguration` JSON (base layer).
 * @param agentJson The agent's `TypeConfiguration` JSON (per-agent layer).
 * @param overridesJson Runtime overrides JSON (per-session layer; already authorization-gated by the caller).
 * @returns The normalized effective configuration. `realtime` is absent when no layer supplied a usable section.
 */
export function ResolveEffectiveRealtimeConfig(
    typeDefaultJson: string | null | undefined,
    agentJson: string | null | undefined,
    overridesJson: string | null | undefined
): RealtimeCoAgentConfig {
    const merged = DeepMergeConfigs(
        ParseRealtimeTypeConfiguration(typeDefaultJson),
        ParseRealtimeTypeConfiguration(agentJson),
        ParseRealtimeTypeConfiguration(overridesJson)
    );
    return normalizeConfig(merged);
}

/** Normalizes a merged raw config object into the typed, sanity-checked shape. */
function normalizeConfig(merged: JSONObjectLike): RealtimeCoAgentConfig {
    const rawRealtime = merged['realtime'];
    if (!isPlainObject(rawRealtime)) {
        return {};
    }
    const section: RealtimeConfigSection = {};

    const modelPreference = rawRealtime['modelPreference'];
    if (typeof modelPreference === 'string' && modelPreference.trim().length > 0) {
        section.modelPreference = modelPreference.trim();
    }

    if (typeof rawRealtime['allowUserModelOverride'] === 'boolean') {
        section.allowUserModelOverride = rawRealtime['allowUserModelOverride'];
    }

    const voice = normalizeVoice(rawRealtime['voice']);
    if (voice) {
        section.voice = voice;
    }

    const narration = normalizeNarration(rawRealtime['narration']);
    if (narration) {
        section.narration = narration;
    }

    const video = normalizeVideo(rawRealtime['video']);
    if (video) {
        section.video = video;
    }

    return Object.keys(section).length > 0 ? { realtime: section } : { realtime: {} };
}

/** Normalizes the `video` block; returns `null` when nothing usable survives. */
function normalizeVideo(raw: unknown): RealtimeVideoConfig | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const video: RealtimeVideoConfig = {};

    if (typeof raw['enabled'] === 'boolean') {
        video.enabled = raw['enabled'];
    }
    if (typeof raw['provider'] === 'string' && raw['provider'].trim().length > 0) {
        video.provider = raw['provider'].trim();
    }
    if (typeof raw['avatarId'] === 'string' && raw['avatarId'].trim().length > 0) {
        video.avatarId = raw['avatarId'].trim();
    }

    const rawProviders = raw['providers'];
    if (isPlainObject(rawProviders)) {
        const providers: Record<string, JSONObjectLike> = {};
        for (const key of Object.keys(rawProviders)) {
            const settings = rawProviders[key];
            if (isPlainObject(settings) && key.trim().length > 0) {
                providers[key] = settings;
            }
        }
        if (Object.keys(providers).length > 0) {
            video.providers = providers;
        }
    }

    return Object.keys(video).length > 0 ? video : null;
}

/** Normalizes the `voice` block; returns `null` when nothing usable survives. */
function normalizeVoice(raw: unknown): RealtimeVoiceConfig | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const voice: RealtimeVoiceConfig = {};

    const rawDefault = raw['default'];
    if (isPlainObject(rawDefault)) {
        const persona: RealtimeVoicePersona = {};
        if (typeof rawDefault['tone'] === 'string' && rawDefault['tone'].trim().length > 0) {
            persona.tone = rawDefault['tone'].trim();
        }
        if (typeof rawDefault['speakingStyle'] === 'string' && rawDefault['speakingStyle'].trim().length > 0) {
            persona.speakingStyle = rawDefault['speakingStyle'].trim();
        }
        if (Object.keys(persona).length > 0) {
            voice.default = persona;
        }
    }

    const rawProviders = raw['providers'];
    if (isPlainObject(rawProviders)) {
        const providers: Record<string, JSONObjectLike> = {};
        for (const key of Object.keys(rawProviders)) {
            const settings = rawProviders[key];
            if (isPlainObject(settings) && key.trim().length > 0) {
                providers[key] = settings;
            }
        }
        if (Object.keys(providers).length > 0) {
            voice.providers = providers;
        }
    }

    return Object.keys(voice).length > 0 ? voice : null;
}

/** Normalizes the `narration` block; returns `null` when nothing usable survives. */
function normalizeNarration(raw: unknown): RealtimeNarrationConfig | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const paceMs = raw['paceMs'];
    if (typeof paceMs === 'number' && Number.isFinite(paceMs) && paceMs > 0) {
        return { paceMs: Math.floor(paceMs) };
    }
    return null;
}

/** Normalizes a provider key / driver class for matching: lowercase, alphanumerics only. */
function normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Picks the provider-specific voice settings for a resolved realtime driver.
 *
 * Provider keys (`openai`, `elevenlabs`, `gemini`, `assemblyai`, …) are matched against the
 * vendor `DriverClass` (e.g. `OpenAIRealtime`, `ElevenLabsRealtime`) by normalized-prefix:
 * both sides are lowercased and stripped of non-alphanumerics, then the driver class must START
 * WITH the provider key (`openairealtime`.startsWith(`openai`)). A bare provider name (e.g.
 * `'openai'` from `ClientRealtimeSessionConfig.Provider`) matches the same way. The LONGEST
 * matching key wins when several match.
 *
 * @param config The effective configuration.
 * @param driverClassOrProvider The vendor `DriverClass` or the provider key itself.
 * @returns The matched settings object (opaque driver pact), or `null` when none match.
 */
export function GetProviderVoiceSettings(
    config: RealtimeCoAgentConfig | null | undefined,
    driverClassOrProvider: string | null | undefined
): JSONObjectLike | null {
    const providers = config?.realtime?.voice?.providers;
    if (!providers || !driverClassOrProvider) {
        return null;
    }
    const normalizedDriver = normalizeKey(driverClassOrProvider);
    if (normalizedDriver.length === 0) {
        return null;
    }
    let best: { key: string; settings: JSONObjectLike } | null = null;
    for (const key of Object.keys(providers)) {
        const normalizedKey = normalizeKey(key);
        if (normalizedKey.length === 0 || !normalizedDriver.startsWith(normalizedKey)) {
            continue;
        }
        if (!best || normalizedKey.length > normalizeKey(best.key).length) {
            best = { key, settings: providers[key] };
        }
    }
    return best?.settings ?? null;
}

/**
 * Builds the "Voice & manner" system-prompt section from the effective voice persona —
 * appended to the server-built companion system prompt at mint. Returns an empty string when
 * neither `tone` nor `speakingStyle` is configured (the section simply doesn't appear).
 *
 * @param config The effective configuration.
 * @returns The prompt section text, or `''`.
 */
export function BuildVoiceMannerSection(config: RealtimeCoAgentConfig | null | undefined): string {
    const persona = config?.realtime?.voice?.default;
    if (!persona) {
        return '';
    }
    const lines: string[] = [];
    if (persona.tone) {
        lines.push(`Tone: ${persona.tone}`);
    }
    if (persona.speakingStyle) {
        lines.push(`Speaking style: ${persona.speakingStyle}`);
    }
    if (lines.length === 0) {
        return '';
    }
    return `Voice & manner:\n${lines.join('\n')}`;
}

/**
 * Reads the effective narration pace (minimum gap in ms between spoken progress updates), or
 * `null` when not configured. Already sanity-checked by normalization (positive finite integer).
 *
 * @param config The effective configuration.
 * @returns The pace in ms, or `null`.
 */
export function GetNarrationPaceMs(config: RealtimeCoAgentConfig | null | undefined): number | null {
    return config?.realtime?.narration?.paceMs ?? null;
}

/**
 * PURE authorization-policy decision for runtime overrides on a realtime session start.
 *
 * Rules (Amith-approved product contract):
 * 1. No overrides requested → allowed (the everyday flow is never gated here — `CanRun` on the
 *    target agent remains the only gate for plain session starts and for target selection).
 * 2. `configOverridesJson` present → caller MUST hold the
 *    {@link REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION} authorization.
 * 3. An explicit runtime model that EQUALS the metadata-configured preference is not a
 *    deviation → no gate.
 * 4. A DEVIATING explicit runtime model → caller must hold the authorization AND the effective
 *    `allowUserModelOverride` must not be `false` (the policy blocks even authorized callers).
 *
 * The check is deliberately a structured REJECTION (the caller throws the `DenialReason`), never
 * a silent ignore — a caller who asked for something specific must learn it was refused.
 *
 * @param input The override request + caller authorization + effective policy.
 * @returns The decision.
 */
export function EvaluateRuntimeOverrideAuthorization(
    input: RuntimeOverrideAuthorizationInput
): RuntimeOverrideAuthorizationDecision {
    const requestedModel = input.RequestedModelID?.trim() ? input.RequestedModelID.trim() : null;
    const modelDeviates = requestedModel !== null && !idsEqual(requestedModel, input.MetadataPreferredModelID);

    if (!input.HasConfigOverrides && !modelDeviates) {
        return { Allowed: true };
    }

    if (input.HasConfigOverrides && !input.CallerHasAdvancedControls) {
        return {
            Allowed: false,
            DenialReason:
                `Runtime configuration overrides (configOverridesJson) require the ` +
                `'${REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION}' authorization. The session can be ` +
                `started without overrides to use the co-agent's configured defaults.`
        };
    }

    if (modelDeviates) {
        if (!input.CallerHasAdvancedControls) {
            return {
                Allowed: false,
                DenialReason:
                    `Explicit realtime model selection requires the ` +
                    `'${REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION}' authorization. Omit preferredModelId ` +
                    `to use the co-agent's configured model.`
            };
        }
        if (input.AllowUserModelOverride === false) {
            return {
                Allowed: false,
                DenialReason:
                    `This co-agent's configuration sets realtime.allowUserModelOverride=false — per-session ` +
                    `model overrides are disabled by policy, even for authorized callers. Omit preferredModelId ` +
                    `to use the configured model.`
            };
        }
    }

    return { Allowed: true };
}
