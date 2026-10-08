/**
 * @fileoverview The Gemini Live `setup` message, written by MJ from a {@link LiveConnectConfig}.
 *
 * MJAPI's relay sends this setup on every upstream connection of a relayed session and discards the browser's (see
 * `GeminiLiveRelayPolicy`), so the agent's model, instructions, tools, voice, modalities and avatar come only from the
 * server. `@google/genai` turns a config into this wire form inside `live.connect`, with converters it does not export,
 * so this module maps a config the same way, for both endpoints:
 *
 * | Config key | Developer API | Gemini Enterprise |
 * |---|---|---|
 * | model | `models/<id>` | `projects/<p>/locations/<l>/publishers/google/models/<id>` |
 * | modalities, temperature, topP, topK, maxOutputTokens, mediaResolution, seed, speechConfig, thinkingConfig, enableAffectiveDialog | under `generationConfig` | the same; modalities default to AUDIO |
 * | `translationConfig` | under `generationConfig` | left out |
 * | `systemInstruction` | a Content (text parts) | the same |
 * | `tools` | as given | as given |
 * | realtimeInputConfig, contextWindowCompression, proactivity, avatarConfig | top level, as given | the same |
 * | `sessionResumption` | top level, `handle` only | top level, as given |
 * | input/output transcription | top level, `{}` | top level, as given |
 * | `safetySettings` | top level, `category` and `threshold` | top level, as given |
 * | `explicitVadSignal` | left out | top level |
 *
 * Where the SDK would refuse a key on an endpoint (it throws), the setup leaves it out instead; every key left out is
 * named in one log line. A parity test runs the installed SDK's `live.connect` against a local socket in both modes and
 * compares, which is what catches a mapping the SDK changes on an upgrade.
 *
 * @module @memberjunction/ai-gemini
 * @author MemberJunction.com
 */

import {
    Modality,
    type Content,
    type ContentUnion,
    type GenerationConfig,
    type LiveClientSetup,
    type LiveConnectConfig,
    type Part,
    type PartUnion,
    type SpeechConfig,
    type ToolListUnion,
    type TranslationConfig,
} from '@google/genai';
import type { GeminiLiveEndpoint } from './geminiLiveProfiles';

/** Where a Live setup is sent: the endpoint, the model and, on Gemini Enterprise, the Google Cloud project and location. */
export interface GeminiLiveSetupTarget {
    /** The endpoint the setup is written for. It decides the model path and which keys the setup may carry. */
    Endpoint: GeminiLiveEndpoint;
    /** The model id (`gemini-3.8-live`), or a resource name, which is used as given when it already has the endpoint's prefix. */
    Model: string;
    /** The Google Cloud project. Required on Gemini Enterprise unless `Model` is a full `projects/…` resource name. */
    Project?: string;
    /** The Google Cloud location (`us-central1`, `us`, `eu`, `global`). Required with `Project`. */
    Location?: string;
}

/** Config keys that go under `generationConfig` on both endpoints. */
const GENERATION_KEYS = [
    'responseModalities',
    'temperature',
    'topP',
    'topK',
    'maxOutputTokens',
    'mediaResolution',
    'seed',
    'speechConfig',
    'thinkingConfig',
    'enableAffectiveDialog',
] as const;

/** Config keys copied to the top level of the setup (the Developer API's narrower forms are applied after). */
const SETUP_KEYS = [
    'realtimeInputConfig',
    'sessionResumption',
    'contextWindowCompression',
    'inputAudioTranscription',
    'outputAudioTranscription',
    'proactivity',
    'explicitVadSignal',
    'avatarConfig',
    'safetySettings',
] as const;

/** Every config key the builder maps; any other key is left out of the setup and logged. */
const MAPPED_KEYS: ReadonlySet<string> = new Set<string>([...GENERATION_KEYS, ...SETUP_KEYS, 'systemInstruction', 'tools', 'translationConfig']);

/** The endpoints' names in log lines. */
const ENDPOINT_NAMES: Readonly<Record<GeminiLiveEndpoint, string>> = { developer: 'the Gemini Developer API', enterprise: 'Gemini Enterprise' };

type SetupKey = (typeof SETUP_KEYS)[number];

/** The setup's top-level fields as the config holds them. */
type SetupFields = Partial<Pick<LiveConnectConfig, SetupKey>>;

/** `generationConfig` as the Developer API takes it in a Live setup: the SDK's type plus the translation config. */
type LiveGenerationConfig = GenerationConfig & { translationConfig?: TranslationConfig };

/**
 * Writes the Live `setup` message for a connect config, the way `@google/genai` 2.8 writes it inside `live.connect` for
 * the target's endpoint (see the module's table). The result is plain JSON that shares nothing with `config`.
 *
 * @param target The endpoint, the model and, on Gemini Enterprise, the project and location.
 * @param config The connect config, as `GeminiRealtime.BuildConnectConfig` builds it.
 * @returns The `setup` message's body.
 * @throws When the model id is empty or malformed, or a Gemini Enterprise target has no project or location.
 */
export function BuildGeminiLiveSetup(target: GeminiLiveSetupTarget, config: LiveConnectConfig): LiveClientSetup {
    const leftOut: string[] = [];
    const setup: LiveClientSetup = { model: liveModelPath(target) };
    const generation = buildGenerationConfig(config, target.Endpoint, leftOut);
    if (Object.keys(generation).length > 0) {
        setup.generationConfig = generation;
    }
    const instruction = systemInstructionContent(config.systemInstruction, leftOut);
    if (instruction) {
        setup.systemInstruction = instruction;
    }
    if (config.tools != null) {
        setup.tools = config.tools;
        warnRawSchemas(config.tools, target.Model);
    }
    Object.assign(setup, buildSetupFields(config, target.Endpoint, leftOut));
    leftOut.push(...Object.keys(config).filter((key) => !MAPPED_KEYS.has(key)));
    if (leftOut.length > 0) {
        console.warn(
            `[GeminiLiveSetup] Left out of the setup for ${target.Model} on ${ENDPOINT_NAMES[target.Endpoint]}: ` +
                `${[...new Set(leftOut)].join(', ')}. These are not Live setup fields there.`
        );
    }
    return cloneJson(setup);
}

/**
 * The setup a session opens with when the browser asked for audio only: the same setup without video output (AUDIO
 * modality, no `avatarConfig`). A setup that asks for no video comes back unchanged, so a browser can lower what the
 * server minted and never raise it.
 *
 * @param setup A setup from {@link BuildGeminiLiveSetup}.
 * @returns A copy, with video output removed when there was any.
 */
export function BuildGeminiLiveAudioOnlySetup(setup: LiveClientSetup): LiveClientSetup {
    const copy = cloneJson(setup);
    const modalities = copy.generationConfig?.responseModalities ?? [];
    if (!modalities.includes(Modality.VIDEO) && copy.avatarConfig === undefined) {
        return copy;
    }
    delete copy.avatarConfig;
    copy.generationConfig = { ...copy.generationConfig, responseModalities: [Modality.AUDIO] };
    return copy;
}

// ── Model path ──────────────────────────────────────────────────────────────────────────────────────

/** The model's resource name on the target's endpoint (the SDK's `tModel`, plus the project prefix on Enterprise). */
function liveModelPath(target: GeminiLiveSetupTarget): string {
    const model = target.Model;
    if (typeof model !== 'string' || model.length === 0 || model.includes('..') || model.includes('?') || model.includes('&')) {
        throw new Error(`Gemini Live setup: the model id "${String(model)}" is empty or malformed.`);
    }
    if (target.Endpoint === 'developer') {
        return model.startsWith('models/') || model.startsWith('tunedModels/') ? model : `models/${model}`;
    }
    const path = publisherModelPath(model);
    if (!path.startsWith('publishers/')) {
        return path; // already a projects/… (or models/…) name
    }
    if (!target.Project || !target.Location) {
        throw new Error(`Gemini Live setup: ${model} on Gemini Enterprise needs a Google Cloud project and location.`);
    }
    return `projects/${target.Project}/locations/${target.Location}/${path}`;
}

/** A Gemini Enterprise model name before the project prefix: `publishers/<publisher>/models/<id>`, or as given. */
function publisherModelPath(model: string): string {
    if (model.startsWith('publishers/') || model.startsWith('projects/') || model.startsWith('models/')) {
        return model;
    }
    if (model.includes('/')) {
        const [publisher, id] = model.split('/', 2);
        return `publishers/${publisher}/models/${id}`;
    }
    return `publishers/google/models/${model}`;
}

// ── generationConfig ────────────────────────────────────────────────────────────────────────────────

/** The setup's `generationConfig`: the generation keys, the endpoint's translation rule, and Enterprise's AUDIO default. */
function buildGenerationConfig(config: LiveConnectConfig, endpoint: GeminiLiveEndpoint, leftOut: string[]): LiveGenerationConfig {
    const generation: LiveGenerationConfig = pickDefined(config, GENERATION_KEYS);
    if (generation.speechConfig) {
        generation.speechConfig = liveSpeechConfig(generation.speechConfig, leftOut);
    }
    if (endpoint === 'enterprise') {
        if (config.responseModalities === undefined) {
            generation.responseModalities = [Modality.AUDIO]; // the SDK's default in Enterprise mode
        }
        if (config.translationConfig != null) {
            leftOut.push('translationConfig');
        }
    } else if (config.translationConfig != null) {
        generation.translationConfig = config.translationConfig;
    }
    return generation;
}

/** The speech config without `multiSpeakerVoiceConfig`, which the Live API refuses on both endpoints. */
function liveSpeechConfig(speech: SpeechConfig, leftOut: string[]): SpeechConfig {
    if (typeof speech !== 'object' || !('multiSpeakerVoiceConfig' in speech)) {
        return speech;
    }
    const rest: SpeechConfig = { ...speech };
    delete rest.multiSpeakerVoiceConfig;
    leftOut.push('speechConfig.multiSpeakerVoiceConfig');
    return rest;
}

// ── systemInstruction and tools ─────────────────────────────────────────────────────────────────────

/**
 * The system instruction as a Content with text parts: a string or parts become a `user` Content (the SDK's
 * `tContent`); a Content keeps its role. Parts other than text are left out (Google: "only text should be used").
 */
function systemInstructionContent(value: ContentUnion | null | undefined, leftOut: string[]): Content | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    const content: Content = isContent(value) ? value : { role: 'user', parts: toParts(value) };
    const parts = content.parts ?? [];
    const textParts: Part[] = parts.flatMap((part) => (isTextPart(part) ? [{ text: part.text }] : []));
    if (textParts.length !== parts.length || parts.some((part) => Object.keys(part).length > 1)) {
        leftOut.push('systemInstruction.parts (other than text)');
    }
    return content.role != null ? { parts: textParts, role: content.role } : { parts: textParts };
}

/** Whether a system instruction is already a Content (an object with a `parts` array). */
function isContent(value: ContentUnion): value is Content {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && 'parts' in value && Array.isArray(value.parts);
}

/** Whether a part is an object carrying text. */
function isTextPart(part: Part): part is Part & { text: string } {
    return typeof part === 'object' && part !== null && typeof part.text === 'string';
}

/** A part list from parts or strings (the SDK's `tParts`). */
function toParts(value: PartUnion[] | PartUnion): Part[] {
    const items = Array.isArray(value) ? value : [value];
    return items.map((item) => (typeof item === 'string' ? { text: item } : item));
}

/**
 * Tools go as given. The SDK rewrites a JSON schema in a declaration's `parameters` (`processJsonSchema`); the setup
 * does not, so one line names the declarations that use `parameters` instead of `parametersJsonSchema`.
 */
function warnRawSchemas(tools: ToolListUnion, model: string): void {
    const names = (Array.isArray(tools) ? tools : [])
        .flatMap((tool) =>
            typeof tool === 'object' && tool !== null && 'functionDeclarations' in tool && Array.isArray(tool.functionDeclarations) ? tool.functionDeclarations : []
        )
        .filter((declaration) => typeof declaration === 'object' && declaration !== null && declaration.parameters !== undefined)
        .map((declaration) => declaration.name ?? '(unnamed)');
    if (names.length > 0) {
        console.warn(
            `[GeminiLiveSetup] Tool(s) ${names.join(', ')} for ${model} declare \`parameters\`, which the setup sends as given ` +
                '(the SDK would rewrite a JSON schema there). Declare `parametersJsonSchema` instead.'
        );
    }
}

// ── Top-level fields ────────────────────────────────────────────────────────────────────────────────

/** The setup's top-level fields, narrowed to what the Developer API takes when that is the endpoint. */
function buildSetupFields(config: LiveConnectConfig, endpoint: GeminiLiveEndpoint, leftOut: string[]): SetupFields {
    const fields: SetupFields = pickDefined(config, SETUP_KEYS);
    if (endpoint === 'developer') {
        narrowForDeveloper(fields, leftOut);
    }
    return fields;
}

/** The Developer API's forms: no explicit VAD signal, a bare resumption handle, empty transcription configs, plain safety settings. */
function narrowForDeveloper(fields: SetupFields, leftOut: string[]): void {
    if (fields.explicitVadSignal !== undefined) {
        delete fields.explicitVadSignal;
        leftOut.push('explicitVadSignal');
    }
    if (fields.sessionResumption) {
        fields.sessionResumption = keepFields(fields.sessionResumption, ['handle'], 'sessionResumption', leftOut);
    }
    if (fields.inputAudioTranscription) {
        fields.inputAudioTranscription = keepFields(fields.inputAudioTranscription, [], 'inputAudioTranscription', leftOut);
    }
    if (fields.outputAudioTranscription) {
        fields.outputAudioTranscription = keepFields(fields.outputAudioTranscription, [], 'outputAudioTranscription', leftOut);
    }
    if (Array.isArray(fields.safetySettings)) {
        fields.safetySettings = fields.safetySettings.map((setting) => keepFields(setting, ['category', 'threshold'], 'safetySettings', leftOut));
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────

/** The listed keys of `value` that hold something other than `null` or `undefined` (the SDK's `!= null` test). */
function pickDefined<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Partial<Pick<T, K>> {
    const picked: Partial<Pick<T, K>> = {};
    for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null) {
            picked[key] = value;
        }
    }
    return picked;
}

/** `value` with only `keys` kept; every other key is named in `leftOut` under `path`. A non-object becomes `{}`. */
function keepFields<T extends object, K extends keyof T>(value: T, keys: readonly K[], path: string, leftOut: string[]): Partial<Pick<T, K>> {
    if (typeof value !== 'object' || value === null) {
        leftOut.push(path);
        return {};
    }
    const allowed: readonly PropertyKey[] = keys;
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) {
            leftOut.push(`${path}.${key}`);
        }
    }
    return pickDefined(value, keys);
}

/** A deep copy through JSON, which is also what the wire carries (no `undefined`, no functions). */
function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
