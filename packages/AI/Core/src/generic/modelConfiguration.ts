/**
 * The canonical `ModelConfiguration` shape + the pure cascade resolver.
 *
 * `ModelConfiguration` is a JSONType `nvarchar(max)` column that exists at THREE levels of the
 * model catalog, forming an inherit-with-override cascade (the structured generalization of the
 * scalar `SupportsPrefill` / `PrefillFallbackText` cascade those same three entities already carry):
 *
 * ```
 * MJ: AI Model Types . ModelConfiguration     (type-wide default — e.g. every Realtime model)
 *   < MJ: AI Models . ModelConfiguration      (per-model)
 *     < MJ: AI Model Vendors . ModelConfiguration   (per model-on-this-provider — the winner)
 * ```
 *
 * **Lockstep contract**: this interface is the package-side mirror of
 * `metadata/entities/JSONType-interfaces/IAIModelConfiguration.ts`, which is pushed into
 * `EntityField.JSONTypeDefinition` and drives the CodeGen-generated `ModelConfigurationObject`
 * accessors on the three entities. Keep the two in step when adding a section or property —
 * the same pact `IAgentSettings` follows with `@memberjunction/ai-core-plus`.
 *
 * **Boundary rule** (also documented on the metadata interface): anything the engine filters,
 * sorts, or joins on stays a COLUMN (`PowerRank`, `IsActive`, `Priority`, `Status` — SQL cannot
 * cheaply predicate into this bag); anything a driver consumes at session/call time belongs HERE.
 * New capability knobs go in this bag — do not add a new capability column per knob.
 */

import { JSONObject, JSONValue } from './baseRealtime';

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
}

/** The `Realtime` section of {@link AIModelConfiguration} — knobs the realtime drivers consume. */
export interface RealtimeModelConfigurationSection {
    /**
     * Catalog-level turn-detection default for this model. Folded into the session Config bag as
     * the `turnDetection` key BELOW the agent/app config cascade (`realtime.session.turnDetection`)
     * and the runtime override — the catalog supplies the default, agents/apps/callers refine it.
     */
    TurnDetection?: RealtimeTurnDetectionSettings;
}

/**
 * The `LLM` section of {@link AIModelConfiguration}. Reserved — no consumers yet. Candidate
 * contents: per-model effort-level defaults, response-format quirks, tool-calling behavior flags.
 * Existing capability COLUMNS (`SupportsEffortLevel`, `SupportsStreaming`, …) are NOT migrating
 * here — new knobs only (see the boundary rule in the module docstring).
 */
export interface LLMModelConfigurationSection {
    /** Open extension point until the first typed knob lands. */
    [key: string]: unknown;
}

/**
 * The per-modality model-configuration bag stored (as JSON) in the `ModelConfiguration` column of
 * `MJ: AI Model Types`, `MJ: AI Models`, and `MJ: AI Model Vendors`. Sections are optional and
 * per-modality so one catalog row can configure everything its model does.
 */
export interface AIModelConfiguration {
    /** Text-generation knobs. Reserved. */
    LLM?: LLMModelConfigurationSection;
    /** Realtime (speech-to-speech) knobs — the first live section. */
    Realtime?: RealtimeModelConfigurationSection;
    /** Vision knobs. Reserved. */
    Vision?: JSONObject;
    /** Audio (TTS/STT) knobs. Reserved. */
    Audio?: JSONObject;
}

/** True for a plain JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is JSONObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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
        return isPlainObject(parsed) ? (parsed as AIModelConfiguration) : null;
    } catch {
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
        if (!isPlainObject(layer)) {
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
        if (isPlainObject(existing) && isPlainObject(incoming)) {
            mergeInto(existing, incoming);
        } else if (isPlainObject(incoming)) {
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
