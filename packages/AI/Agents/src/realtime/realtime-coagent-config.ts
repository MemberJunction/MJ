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

/**
 * Turn-taking configuration for a multi-agent realtime room — how an agent participates, and (room-wide)
 * which **turn moderator** decides who speaks each turn. See the "Turn moderator" sections of the Realtime
 * Co-Agents / Bridges guides.
 *
 * Informally this is the multi-agent meeting's **moderator** — and note it does NOT merely restrain agents
 * (that would be "nanny mode"); its larger job is to *bring the right agents in* so a multi-party voice room
 * feels like a real panel discussion: route a question to Sage AND Skip when both are relevant, let a
 * productive agent↔agent exchange run, and only go quiet when nobody should speak or a loop turns unproductive.
 *
 * Two layers of the effective-config cascade carry different parts:
 * - **Per target agent** (the voiced agent's `TypeConfiguration`): {@link RealtimeTurnTakingConfig.mode}.
 * - **Room-wide** (the Realtime agent TYPE's `DefaultConfiguration`): {@link RealtimeTurnTakingConfig.moderator}.
 */
export interface RealtimeTurnTakingConfig {
    /**
     * This agent's participation style in a MULTI-agent room:
     * - `'proactive'` (default): may jump in unaddressed when the moderator judges it relevant.
     * - `'addressed-only'`: speaks only when directly addressed by name.
     * Single-agent rooms ignore this entirely (a lone agent is a normal 1:1 voice with auto-response).
     */
    mode?: 'proactive' | 'addressed-only';
    /**
     * The room-level **turn moderator**: a fast LLM that — once per turn — decides which agent(s) (0+) should
     * speak next, routes to all of them (spoken serially via the floor so they never overlap), respects each
     * agent's {@link RealtimeTurnTakingConfig.mode}, and lets a *productive* agent↔agent discussion continue
     * while suppressing unproductive ping-pong. It runs as a PROMPT (not an agent run) tied to the co-agent's
     * `AIAgentRun` for observability. Configured ONCE on the Realtime agent type's default configuration — a
     * room has one moderator brain.
     */
    moderator?: RealtimeModeratorConfig;
}

/** The room-wide turn-moderator settings (see {@link RealtimeTurnTakingConfig.moderator}). Absent fields fall back to {@link REALTIME_MODERATOR_DEFAULTS}. */
export interface RealtimeModeratorConfig {
    /** The moderator AI Prompt — an `MJ: AI Prompts` **ID** (authored as `@lookup:` in metadata, stored as the resolved ID). */
    promptId?: string;
    /** How many recent diarized turns the moderator sees. Default 30; clamped to ≤ 50. */
    contextWindowTurns?: number;
    /** Each lookback turn is clipped to this many characters (token savings + a stable, cacheable prompt prefix). Default 240. */
    maxCharsPerTurn?: number;
    /**
     * OPTIONAL hard backstop on consecutive agent-only turns (no human turn between) before the room goes
     * quiet. `null`/absent (default) = **no cap** — rely on the moderator's own progress assessment to end
     * unproductive loops, so genuine agent↔agent discussion is never gated by a counter.
     */
    maxConsecutiveAgentOnlyTurns?: number | null;
    /** Moderator call budget in ms; exceeding it triggers {@link RealtimeModeratorConfig.onError}. Default 800. */
    timeoutMs?: number;
    /** Behavior when the moderator errors/times out: `'silent'` (no one speaks — never spiral) or `'addressed-only'` (cheap name-contains fallback). Default `'silent'`. */
    onError?: 'silent' | 'addressed-only';
    /**
     * When `true` (default), run the NEXT moderator decision DURING the current agent's audio playback — the
     * model emits its full response text seconds before the user finishes hearing it, so the agent→agent
     * hand-off pays ~zero added latency. A human barge-in discards the pre-staged decision.
     */
    prestageOnAgentSpeech?: boolean;
}

/** Default moderator settings, applied per-field when a {@link RealtimeModeratorConfig} omits a value. */
export const REALTIME_MODERATOR_DEFAULTS = {
    contextWindowTurns: 30,
    maxCharsPerTurn: 240,
    maxConsecutiveAgentOnlyTurns: null as number | null,
    timeoutMs: 800,
    onError: 'silent' as 'silent' | 'addressed-only',
    prestageOnAgentSpeech: true,
} as const;

/**
 * How the co-agent narrates pulling in a colleague agent (a delegation handoff):
 * - `'mention'` (default): names the handoff out loud ("Let me bring in Skip for that…").
 * - `'silent'`: absorbs the colleague's result and speaks it as its own — delegation is invisible.
 * - `'hand-voice'`: heavier handoff where the colleague takes the mic (reserved; not yet implemented).
 */
export type RealtimeDisclosurePolicy = 'silent' | 'mention' | 'hand-voice';

/**
 * A delegation target the lead co-agent may invoke via `invoke_agent`. Allowed targets are
 * **union-accumulated** across cascade layers (type, co-agent, target, app) plus dynamic
 * (channel-registered) additions — NOT array-replaced — by {@link accumulateAllowedAgents}.
 */
export interface RealtimeAllowedAgent {
    /** The target agent's `MJ: AI Agents` ID (loop or flow — transparent to the co-agent). */
    agentId: string;
    /** Friendly label used in the manifest / disclosure narration ("Skip", "Query Builder"). */
    label?: string;
    /** Per-target disclosure override; falls back to the effective default disclosure. */
    disclosure?: RealtimeDisclosurePolicy;
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
    /** Multi-agent turn-taking: this agent's participation {@link RealtimeTurnTakingConfig.mode} + the room-wide moderator. */
    turnTaking?: RealtimeTurnTakingConfig;
    /**
     * Default delegation disclosure for this co-agent (scalar — follows the per-key cascade override).
     * Absent ⇒ {@link GetEffectiveDisclosure} returns `'mention'`.
     */
    disclosure?: RealtimeDisclosurePolicy;
    /**
     * Delegation targets the lead co-agent may invoke. UNION-accumulated across layers + dynamic
     * (see {@link accumulateAllowedAgents}); {@link ResolveEffectiveRealtimeConfig} populates this
     * with the accumulated union rather than the array-replaced top layer.
     */
    allowedAgents?: RealtimeAllowedAgent[];
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
 * Resolves the EFFECTIVE realtime configuration from the layers of the contract by tolerantly parsing
 * each (see {@link ParseRealtimeTypeConfiguration}), deep-merging them (later wins per key, see
 * {@link DeepMergeConfigs}), and normalizing into the typed {@link RealtimeCoAgentConfig} shape
 * (wrong-typed fields dropped, never thrown on).
 *
 * **Precedence (lowest → highest):**
 * `AIAgentType.DefaultConfiguration` < **co-agent** `AIAgent.TypeConfiguration` < **target agent**
 * `AIAgent.TypeConfiguration` < runtime override. This is the single, surface-agnostic precedence cascade
 * for model + voice + persona across EVERY realtime host (native chat, LiveKit, future Zoom/Teams) — see
 * `plans/realtime/realtime-core-host-convergence.md`. The **target** layer is what lets a voiced agent
 * (Sage, Marketing Agent, …) carry its own persisted voice/model that the shared co-agent then speaks with;
 * it wins over the co-agent's defaults but yields to an explicit per-session runtime override.
 *
 * @param typeDefaultJson The agent TYPE's `DefaultConfiguration` JSON (base layer).
 * @param agentJson The CO-AGENT's `TypeConfiguration` JSON (shared per-co-agent layer).
 * @param overridesJson Runtime overrides JSON (per-session layer; already authorization-gated by the caller).
 * @param targetAgentJson Optional TARGET agent's `TypeConfiguration` JSON (per-voiced-agent layer). Merged
 *   ABOVE the co-agent and BELOW the app/runtime-override layers regardless of argument position. Omit when
 *   there is no distinct target (e.g. the co-agent voicing itself).
 * @param appSettingsJson Optional APP layer — `Application.AgentSettings.Realtime` translated into the
 *   canonical `{"realtime":{…}}` shape (use {@link BuildAppRealtimeOverridesJson}). Merged ABOVE the target
 *   and BELOW the runtime override. Omit when no app context is known.
 * @param dynamicAllowedAgents Optional channel-registered delegation targets added at runtime (Move 3b),
 *   union-accumulated on top of the layer-sourced `allowedAgents`.
 * @returns The normalized effective configuration. `realtime` is absent when no layer supplied a usable section.
 */
export function ResolveEffectiveRealtimeConfig(
    typeDefaultJson: string | null | undefined,
    agentJson: string | null | undefined,
    overridesJson: string | null | undefined,
    targetAgentJson?: string | null | undefined,
    appSettingsJson?: string | null | undefined,
    dynamicAllowedAgents?: RealtimeAllowedAgent[]
): RealtimeCoAgentConfig {
    // Parse each layer once — reused for both the scalar deep-merge and the allowedAgents union.
    const typeLayer = ParseRealtimeTypeConfiguration(typeDefaultJson);
    const agentLayer = ParseRealtimeTypeConfiguration(agentJson);
    const targetLayer = ParseRealtimeTypeConfiguration(targetAgentJson);
    const appLayer = ParseRealtimeTypeConfiguration(appSettingsJson);
    const overrideLayer = ParseRealtimeTypeConfiguration(overridesJson);

    // Scalar fields: merge order = precedence (later wins):
    //   type-default < co-agent < target < app < runtime-override.
    const merged = DeepMergeConfigs(typeLayer, agentLayer, targetLayer, appLayer, overrideLayer);
    const config = normalizeConfig(merged);

    // allowedAgents: union-accumulate across all layers (+ dynamic), since DeepMergeConfigs
    // array-replaces. Later layers win per-entry fields; deduped by agentId.
    const allowed = accumulateAllowedAgents(
        [typeLayer, agentLayer, targetLayer, appLayer, overrideLayer],
        dynamicAllowedAgents
    );
    if (allowed.length > 0) {
        config.realtime = config.realtime ?? {};
        config.realtime.allowedAgents = allowed;
    }

    return config;
}

/**
 * Normalizes a single raw `allowedAgents` entry; returns `null` when it lacks a usable `agentId`.
 * Omits absent optional fields so per-entry field-merge in {@link accumulateAllowedAgents} is clean.
 */
function normalizeAllowedAgent(raw: unknown): RealtimeAllowedAgent | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const agentId = raw['agentId'];
    if (typeof agentId !== 'string' || agentId.trim().length === 0) {
        return null;
    }
    const entry: RealtimeAllowedAgent = { agentId: agentId.trim() };
    if (typeof raw['label'] === 'string' && raw['label'].trim().length > 0) {
        entry.label = raw['label'].trim();
    }
    const disclosure = raw['disclosure'];
    if (disclosure === 'silent' || disclosure === 'mention' || disclosure === 'hand-voice') {
        entry.disclosure = disclosure;
    }
    return entry;
}

/**
 * UNION-accumulates `realtime.allowedAgents` across cascade layers (base first) plus optional
 * dynamic additions. Deduped by `agentId` (case/whitespace-insensitive); later sources win per
 * **field** (a later layer that only sets `disclosure` keeps an earlier layer's `label`).
 *
 * This is the deliberate exception to the array-replace merge rule — the lead co-agent should
 * *accumulate* colleagues as layers add them, not have the top layer clobber the set.
 *
 * @param layers Parsed config layers (each a `{realtime:{allowedAgents:[…]}}` blob or null), base first.
 * @param dynamic Optional runtime/channel-registered targets, accumulated last (highest precedence).
 * @returns The deduped, accumulated allowed-agent list (empty when none configured).
 */
export function accumulateAllowedAgents(
    layers: Array<JSONObjectLike | null | undefined>,
    dynamic?: RealtimeAllowedAgent[]
): RealtimeAllowedAgent[] {
    const map = new Map<string, RealtimeAllowedAgent>();
    const ingest = (list: unknown): void => {
        if (!Array.isArray(list)) {
            return;
        }
        for (const raw of list) {
            const entry = normalizeAllowedAgent(raw);
            if (!entry) {
                continue;
            }
            const key = entry.agentId.trim().toLowerCase();
            const existing = map.get(key);
            map.set(key, existing ? { ...existing, ...entry } : entry);
        }
    };
    for (const layer of layers) {
        if (isPlainObject(layer)) {
            const rt = layer['realtime'];
            if (isPlainObject(rt)) {
                ingest(rt['allowedAgents']);
            }
        }
    }
    ingest(dynamic);
    return Array.from(map.values());
}

/**
 * The effective DEFAULT delegation disclosure for the co-agent (scalar cascade result),
 * defaulting to `'mention'` when no layer set one.
 */
export function GetEffectiveDisclosure(
    config: RealtimeCoAgentConfig | null | undefined
): RealtimeDisclosurePolicy {
    return config?.realtime?.disclosure ?? 'mention';
}

/**
 * The effective disclosure for a SPECIFIC delegation target: the target's per-entry override
 * when present, else the co-agent's effective default ({@link GetEffectiveDisclosure}).
 *
 * @param config The normalized effective configuration.
 * @param agentId The target agent's ID.
 */
export function GetDisclosureForTarget(
    config: RealtimeCoAgentConfig | null | undefined,
    agentId: string | null | undefined
): RealtimeDisclosurePolicy {
    const target = config?.realtime?.allowedAgents?.find((a) => idsEqual(a.agentId, agentId));
    return target?.disclosure ?? GetEffectiveDisclosure(config);
}

/**
 * Maps an app's `Application.AgentSettings.Realtime` block (+ optional `RelevantAgents`) into the
 * canonical `{"realtime":{…}}` JSON the cascade consumes as its **app layer**. Pure mapper so the
 * call site (which reads `AgentSettingsObject`) stays thin and this module stays canonical.
 *
 * @param appRealtime The `AgentSettings.Realtime` overrides (Disclosure / Persona / ModelPreference).
 * @param relevantAgents The app's `AgentSettings.RelevantAgents` mapped to allowed-agent entries.
 * @returns Canonical app-layer JSON string, or `null` when nothing was supplied (keeps the cascade lower).
 */
export function BuildAppRealtimeOverridesJson(
    appRealtime?: {
        Disclosure?: RealtimeDisclosurePolicy | null;
        Persona?: { Tone?: string | null; SpeakingStyle?: string | null } | null;
        ModelPreference?: string | null;
    } | null,
    relevantAgents?: RealtimeAllowedAgent[] | null
): string | null {
    const realtime: RealtimeConfigSection = {};

    const disclosure = appRealtime?.Disclosure;
    if (disclosure === 'silent' || disclosure === 'mention' || disclosure === 'hand-voice') {
        realtime.disclosure = disclosure;
    }
    const tone = appRealtime?.Persona?.Tone?.trim();
    const style = appRealtime?.Persona?.SpeakingStyle?.trim();
    if (tone || style) {
        realtime.voice = { default: {} };
        if (tone) {
            realtime.voice.default!.tone = tone;
        }
        if (style) {
            realtime.voice.default!.speakingStyle = style;
        }
    }
    const model = appRealtime?.ModelPreference?.trim();
    if (model) {
        realtime.modelPreference = model;
    }
    if (relevantAgents && relevantAgents.length > 0) {
        realtime.allowedAgents = relevantAgents;
    }

    return Object.keys(realtime).length > 0 ? JSON.stringify({ realtime }) : null;
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

    const disclosure = rawRealtime['disclosure'];
    if (disclosure === 'silent' || disclosure === 'mention' || disclosure === 'hand-voice') {
        section.disclosure = disclosure;
    }
    // NOTE: `allowedAgents` is intentionally NOT normalized here — it is union-accumulated across
    // ALL layers by ResolveEffectiveRealtimeConfig (the merged blob only carries the array-replaced
    // top layer, which would be wrong as a union).

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

    const turnTaking = normalizeTurnTaking(rawRealtime['turnTaking']);
    if (turnTaking) {
        section.turnTaking = turnTaking;
    }

    return Object.keys(section).length > 0 ? { realtime: section } : { realtime: {} };
}

/** Normalizes the `turnTaking` block (participation mode + room moderator); returns `null` when nothing usable survives. */
function normalizeTurnTaking(raw: unknown): RealtimeTurnTakingConfig | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const tt: RealtimeTurnTakingConfig = {};

    const mode = raw['mode'];
    if (mode === 'proactive' || mode === 'addressed-only') {
        tt.mode = mode;
    }

    const moderator = normalizeModerator(raw['moderator']);
    if (moderator) {
        tt.moderator = moderator;
    }

    return Object.keys(tt).length > 0 ? tt : null;
}

/** Normalizes the `moderator` block; returns `null` when nothing usable survives. The window is clamped to ≤ 50. */
function normalizeModerator(raw: unknown): RealtimeModeratorConfig | null {
    if (!isPlainObject(raw)) {
        return null;
    }
    const m: RealtimeModeratorConfig = {};

    if (typeof raw['promptId'] === 'string' && raw['promptId'].trim().length > 0) {
        m.promptId = raw['promptId'].trim();
    }
    const window = raw['contextWindowTurns'];
    if (typeof window === 'number' && Number.isFinite(window) && window > 0) {
        m.contextWindowTurns = Math.min(50, Math.floor(window));
    }
    const clip = raw['maxCharsPerTurn'];
    if (typeof clip === 'number' && Number.isFinite(clip) && clip > 0) {
        m.maxCharsPerTurn = Math.floor(clip);
    }
    const cap = raw['maxConsecutiveAgentOnlyTurns'];
    if (cap === null) {
        m.maxConsecutiveAgentOnlyTurns = null; // explicit "no cap"
    } else if (typeof cap === 'number' && Number.isFinite(cap) && cap > 0) {
        m.maxConsecutiveAgentOnlyTurns = Math.floor(cap);
    }
    const timeout = raw['timeoutMs'];
    if (typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0) {
        m.timeoutMs = Math.floor(timeout);
    }
    if (raw['onError'] === 'silent' || raw['onError'] === 'addressed-only') {
        m.onError = raw['onError'];
    }
    if (typeof raw['prestageOnAgentSpeech'] === 'boolean') {
        m.prestageOnAgentSpeech = raw['prestageOnAgentSpeech'];
    }

    return Object.keys(m).length > 0 ? m : null;
}

/**
 * Reads the effective {@link RealtimeModeratorConfig} from a resolved config, filling absent fields from
 * {@link REALTIME_MODERATOR_DEFAULTS}. Returns `null` when no moderator is configured at all (e.g. no
 * `promptId`), which the engine treats as "no moderator — fall back to per-agent matchers".
 *
 * @param config The normalized effective configuration.
 * @returns The fully-defaulted moderator settings, or `null` when none is configured.
 */
export function GetEffectiveModeratorConfig(
    config: RealtimeCoAgentConfig | null | undefined
): Required<RealtimeModeratorConfig> | null {
    const m = config?.realtime?.turnTaking?.moderator;
    if (!m || !m.promptId) {
        return null;
    }
    return {
        promptId: m.promptId,
        contextWindowTurns: m.contextWindowTurns ?? REALTIME_MODERATOR_DEFAULTS.contextWindowTurns,
        maxCharsPerTurn: m.maxCharsPerTurn ?? REALTIME_MODERATOR_DEFAULTS.maxCharsPerTurn,
        maxConsecutiveAgentOnlyTurns:
            m.maxConsecutiveAgentOnlyTurns === undefined
                ? REALTIME_MODERATOR_DEFAULTS.maxConsecutiveAgentOnlyTurns
                : m.maxConsecutiveAgentOnlyTurns,
        timeoutMs: m.timeoutMs ?? REALTIME_MODERATOR_DEFAULTS.timeoutMs,
        onError: m.onError ?? REALTIME_MODERATOR_DEFAULTS.onError,
        prestageOnAgentSpeech: m.prestageOnAgentSpeech ?? REALTIME_MODERATOR_DEFAULTS.prestageOnAgentSpeech,
    };
}

/** The per-target-agent participation mode from a resolved config (default `'proactive'`). */
export function GetEffectiveTurnMode(
    config: RealtimeCoAgentConfig | null | undefined
): 'proactive' | 'addressed-only' {
    return config?.realtime?.turnTaking?.mode ?? 'proactive';
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
 * Builds the runtime-override `ConfigOverridesJson` envelope (the highest-precedence cascade layer) from a
 * per-session model and/or voice choice — the **single, surface-agnostic** shape every realtime host uses
 * to carry a dev's pick into {@link ResolveEffectiveRealtimeConfig}. The native-chat picker produces the
 * same shape client-side (`BuildRealtimeConfigOverridesJson` in `@memberjunction/ng-conversations`); the
 * server-bridged hosts (LiveKit, Zoom/Teams) build it here so both funnel into the one override slot.
 *
 * Envelope: `{"realtime":{"modelPreference":"<id>","voice":{"providers":{"openai":{"voice":"<v>"}}}}}`.
 * `openai` is the realtime provider today; add providers here when others ship realtime voices.
 *
 * @param modelId The `MJ: AI Models` Name or ID to prefer, or null/empty for none.
 * @param voice The provider-native voice id (e.g. `echo`), or null/empty for none.
 * @returns The JSON string, or `null` when nothing was overridden (keeps the cascade at its lower layers).
 */
export function BuildRealtimeOverridesJson(
    modelId?: string | null,
    voice?: string | null
): string | null {
    const m = modelId?.trim() ?? '';
    const v = voice?.trim() ?? '';
    if (m.length === 0 && v.length === 0) {
        return null;
    }
    const realtime: { modelPreference?: string; voice?: { providers: Record<string, { voice: string }> } } = {};
    if (m.length > 0) {
        realtime.modelPreference = m;
    }
    if (v.length > 0) {
        realtime.voice = { providers: { openai: { voice: v } } };
    }
    return JSON.stringify({ realtime });
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
