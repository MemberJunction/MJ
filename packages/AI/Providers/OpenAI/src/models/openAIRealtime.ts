import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    RealtimeDiagLog,
    IRealtimeSession,
    RealtimeSessionCapabilities,
    RealtimeReconfigureParams,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeUsageModalityDetail,
    RealtimeSessionError,
    RealtimeVoiceOption,
    JSONObject,
} from '@memberjunction/ai';
import { ClientRealtimeSessionConfig } from '@memberjunction/ai';
import { OpenAI } from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
// NOTE: the bare 'openai/realtime' directory subpath is not exported by the SDK's package
// exports map — only './realtime/*' file segments are — so the explicit /index is required.
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type {
    RealtimeClientEvent,
    RealtimeServerEvent,
    RealtimeFunctionTool,
    RealtimeConversationItemFunctionCallOutput,
    RealtimeConversationItemSystemMessage,
    RealtimeConversationItemUserMessage,
    RealtimeSessionCreateRequest,
    RealtimeAudioInputTurnDetection,
    RealtimeToolsConfigUnion,
} from 'openai/resources/realtime/realtime';
import type {
    ClientSecretCreateParams,
    ClientSecretCreateResponse,
} from 'openai/resources/realtime/client-secrets';

/**
 * The ASR model used to transcribe the USER's audio input. Realtime models accept audio
 * natively, so input transcription is a separate pass that must be opted into — without it only
 * assistant-side transcripts flow. Shared by BOTH topologies ({@link OpenAIRealtime.CreateClientSession}
 * for client-direct and {@link OpenAIRealtimeSession.applyInitialConfig} for server-bridged) so the
 * contract's promise of both-role transcripts holds everywhere.
 */
const OPENAI_INPUT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

/**
 * The reasoning effort levels the GA Realtime API accepts for reasoning-capable realtime models
 * (gpt-realtime-2 / gpt-realtime-2.1 line). `low` is the provider default — it keeps latency down
 * for voice; raise only when task complexity justifies the added latency and reasoning tokens.
 */
export type RealtimeReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Runtime validation set for {@link RealtimeReasoningEffort} values arriving via the untyped Config bag. */
const REALTIME_REASONING_EFFORTS: ReadonlySet<string> = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);

/**
 * Maps MJ's NORMALIZED effort level (the same `ChatParams.effortLevel` vocabulary the LLM drivers
 * consume: a numeric 1–100 value, or a named level) onto OpenAI's realtime
 * {@link RealtimeReasoningEffort} union. This is the OpenAI implementation of the
 * {@link OpenAIRealtimeProfile.mapEffortLevel} seam — providers with a DIFFERENT effort vocabulary
 * override the profile function rather than the protocol code.
 *
 * Numeric mapping is quintile-based across OpenAI's five levels: ≤20 → `minimal`, ≤40 → `low`,
 * ≤60 → `medium`, ≤80 → `high`, >80 → `xhigh`. Named values already in the union pass through.
 * Unmappable values return `undefined` (dropped with a diag log — never sent raw).
 *
 * @param effortLevel The MJ-normalized effort level (numeric string/number 1–100 or named level).
 * @returns The provider effort literal, or `undefined` when the value cannot be mapped.
 */
export function MapEffortLevelToOpenAIRealtime(effortLevel: string): RealtimeReasoningEffort | undefined {
    const named = effortLevel.trim().toLowerCase();
    if (REALTIME_REASONING_EFFORTS.has(named)) {
        return named as RealtimeReasoningEffort;
    }
    const numValue = Number.parseInt(named, 10);
    // A non-numeric OR non-positive value is nonsensical for a 1–100 scale — drop it (no override)
    // rather than silently flooring 0/negatives to a real 'minimal' reasoning setting.
    if (Number.isNaN(numValue) || numValue <= 0) {
        return undefined;
    }
    if (numValue <= 20) return 'minimal';
    if (numValue <= 40) return 'low';
    if (numValue <= 60) return 'medium';
    if (numValue <= 80) return 'high';
    return 'xhigh';
}

/**
 * GA Realtime API session fields that the pinned `openai` SDK's `RealtimeSessionCreateRequest`
 * typings do not yet declare. The wire protocol accepts them (documented for the GA API and the
 * gpt-realtime-2/2.1 reasoning models); this typed extension lets the driver send them without
 * weakening types. Remove once the SDK typings catch up.
 *
 * `reasoning.effort` is typed `string` (not the OpenAI union) because the value is produced by
 * the per-provider {@link OpenAIRealtimeProfile.mapEffortLevel} seam — an OpenAI-compatible
 * provider may legally emit a different level vocabulary.
 */
interface RealtimeSessionGAFields {
    /** Session-level reasoning effort for reasoning realtime models (`reasoning.effort`). */
    reasoning?: { effort: string };
    /** Whether the model may call multiple tools in one turn (GA default: true). */
    parallel_tool_calls?: boolean;
}

/** The SDK session-create request widened with the GA fields the SDK typings don't declare yet. */
type GARealtimeSessionCreateRequest = RealtimeSessionCreateRequest & RealtimeSessionGAFields;

/** The GA `response.done` usage payload fields this driver reads (totals + per-modality detail). */
interface GARealtimeResponseUsage {
    input_tokens?: number;
    output_tokens?: number;
    input_token_details?: GARealtimeUsageDetail;
    output_token_details?: GARealtimeUsageDetail;
}

/** Wire shape of a per-modality usage-detail block on the GA API. */
interface GARealtimeUsageDetail {
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
    cached_tokens?: number;
}

/**
 * Maps a GA per-modality usage-detail block onto the Core {@link RealtimeUsageModalityDetail}
 * shape. Returns `undefined` when the provider reported no detail block (totals-only flows).
 */
export function MapUsageModalityDetail(detail: GARealtimeUsageDetail | undefined): RealtimeUsageModalityDetail | undefined {
    if (!detail) {
        return undefined;
    }
    const mapped: RealtimeUsageModalityDetail = {};
    if (typeof detail.text_tokens === 'number') mapped.TextTokens = detail.text_tokens;
    if (typeof detail.audio_tokens === 'number') mapped.AudioTokens = detail.audio_tokens;
    if (typeof detail.image_tokens === 'number') mapped.ImageTokens = detail.image_tokens;
    if (typeof detail.cached_tokens === 'number') mapped.CachedTokens = detail.cached_tokens;
    return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/**
 * Provider profile for the OpenAI-Realtime-protocol driver family.
 *
 * `OpenAIRealtime` implements the full OpenAI Realtime wire protocol once; OpenAI-compatible
 * providers (e.g. xAI Grok Voice) subclass it and supply their own profile instead of cloning the
 * driver. The profile carries the per-provider knobs — transcription model, turn detection, GA
 * feature gates — so protocol/feature work lands here once and flows to every compatible provider,
 * while providers that have NOT confirmed a GA feature keep it gated off (a one-line flip later).
 */
export interface OpenAIRealtimeProfile {
    /** The {@link ClientRealtimeSessionConfig.Provider} key the browser uses to pick its client driver. */
    providerKey: string;
    /**
     * The ASR model for USER input transcription (opt-in pass; see {@link OPENAI_INPUT_TRANSCRIPTION_MODEL}).
     * `undefined` means the provider transcribes natively (e.g. a cascaded STT stage) and no
     * transcription block is sent unless the Config bag supplies `inputTranscriptionModel`.
     */
    inputTranscriptionModel?: string;
    /**
     * Whether the initial `session.update` must wait for the server's `session.created` frame.
     * OpenAI's socket drops config sent during the handshake; xAI's accepts it immediately.
     */
    deferInitialConfigUntilSessionCreated: boolean;
    /**
     * When true, `InitialContext` is folded into the system prompt under a "Prior context" heading
     * instead of being seeded as a separate user conversation item — for compat endpoints with no
     * guaranteed history-seeding channel (HuggingFace speech-to-speech).
     */
    foldInitialContextIntoPrompt: boolean;
    /** Whether the provider accepts the GA `reasoning.effort` session field. */
    supportsReasoningEffort: boolean;
    /** Whether the provider accepts the GA `parallel_tool_calls` session field. */
    supportsParallelToolCalls: boolean;
    /** Whether the provider accepts remote MCP server tools (`type: "mcp"`) in `session.tools`. */
    supportsMcpTools: boolean;
    /** Whether the provider accepts an output voice at `audio.output.voice`. */
    supportsVoiceOutput: boolean;
    /**
     * Whether the provider supports LIVE turn-mode reconfiguration via a partial `session.update`
     * (drives both the session's `Capabilities.CanReconfigureTurnMode` and whether `Reconfigure`
     * emits anything). Compat endpoints without `create_response` gating set false.
     */
    supportsLiveReconfigure: boolean;
    /** The fatal-error message surfaced when the socket closes unexpectedly. */
    unexpectedCloseMessage: string;
    /**
     * Builds the `audio.input.turn_detection` block. `disableAutoResponse` comes from the Config
     * bag (meeting mode: the bridge, not server VAD, decides when the model speaks). Return
     * `undefined` to omit the block and accept the provider default.
     */
    buildTurnDetection(disableAutoResponse: boolean): RealtimeAudioInputTurnDetection | undefined;
    /**
     * Maps MJ's NORMALIZED effort level (numeric 1–100 or named — the same vocabulary as
     * `ChatParams.effortLevel`) onto THIS provider's realtime effort literals. Providers whose
     * endpoint uses a different level set override this seam; return `undefined` to drop an
     * unmappable value (it is never sent raw). Only consulted when `supportsReasoningEffort` is on.
     */
    mapEffortLevel(effortLevel: string): string | undefined;
}

/** The OpenAI provider profile — the defaults every OpenAI-compatible subclass overrides from. */
export const OPENAI_REALTIME_PROFILE: OpenAIRealtimeProfile = {
    providerKey: 'openai',
    inputTranscriptionModel: OPENAI_INPUT_TRANSCRIPTION_MODEL,
    deferInitialConfigUntilSessionCreated: true,
    foldInitialContextIntoPrompt: false,
    supportsReasoningEffort: true,
    supportsParallelToolCalls: true,
    supportsMcpTools: true,
    supportsVoiceOutput: true,
    supportsLiveReconfigure: true,
    unexpectedCloseMessage: 'OpenAI realtime connection closed unexpectedly',
    // OpenAI's default turn detection (server VAD with auto-response) is correct for 1:1 calls, so
    // the block is only sent when meeting mode needs create_response disabled.
    buildTurnDetection: (disableAutoResponse) =>
        disableAutoResponse ? { type: 'server_vad', create_response: false, interrupt_response: true } : undefined,
    mapEffortLevel: MapEffortLevelToOpenAIRealtime,
};

/**
 * The realtime feature values extracted (and removed) from the open {@link RealtimeSessionParams.Config}
 * bag before the remainder is spread into the provider session payload.
 */
interface ExtractedRealtimeFeatures {
    /**
     * The raw effort value awaiting the profile's `mapEffortLevel` translation. Sourced from the
     * provider-native `reasoningEffort` bag key when present (explicit override), else from the
     * MJ-normalized `effortLevel` key (numeric 1–100 or named — `ChatParams.effortLevel` vocabulary).
     */
    effortLevel?: string;
    /** `parallelToolCalls` bag value, if present. */
    parallelToolCalls?: boolean;
    /** Remote MCP server tool declarations from the `mcpTools` bag value, if present. */
    mcpTools?: RealtimeToolsConfigUnion.Mcp[];
    /** Trimmed `voice` bag value, if present and non-blank. */
    voice?: string;
    /** The host-neutral meeting flag (`disableAutoResponse`) — never sent raw to a provider. */
    disableAutoResponse: boolean;
    /** Per-session input-transcription model override (`inputTranscriptionModel` bag key). */
    inputTranscriptionModel?: string;
    /**
     * MJ-side transport settings (`endpoint`, `sampleRate`, `proxyBaseUrl` bag keys) consumed by
     * self-hosted/proxied drivers — ALWAYS scrubbed so they never leak into a provider payload.
     */
    endpoint?: string;
    /** See {@link ExtractedRealtimeFeatures.endpoint}. */
    sampleRate?: number;
    /** See {@link ExtractedRealtimeFeatures.endpoint}. */
    proxyBaseUrl?: string;
    /** The remaining bag entries, safe to spread into the session payload. */
    rest: JSONObject;
}

/**
 * Pulls the MJ-idiomatic feature keys OUT of the open Config bag so they are (a) translated to
 * their provider-native session fields only when the profile confirms support, and (b) NEVER
 * leaked raw into a provider payload that would reject unknown fields.
 *
 * Recognized bag keys: `effortLevel` (MJ-normalized: numeric 1–100 or named), `reasoningEffort`
 * (provider-native literal — wins over `effortLevel` when both are present), `parallelToolCalls`,
 * `mcpTools`, `voice`, `disableAutoResponse`. Everything else passes through in `rest`
 * (provider-native keys like `tool_choice` or `output_modalities` can be set directly by config
 * authors).
 *
 * @param config The open session Config bag (may be undefined).
 * @returns The extracted features plus the residual bag.
 */
export function ExtractRealtimeFeatures(config: JSONObject | undefined): ExtractedRealtimeFeatures {
    const rest = { ...(config ?? {}) } as JSONObject & {
        effortLevel?: unknown;
        reasoningEffort?: unknown;
        parallelToolCalls?: unknown;
        mcpTools?: unknown;
        voice?: unknown;
        disableAutoResponse?: unknown;
    };

    // The provider-native key is an explicit override; the normalized key is the standard channel.
    // Both are scrubbed either way so neither ever leaks raw into a provider payload. Numbers are
    // accepted on effortLevel (ChatParams.effortLevel is a string, but config authors write JSON).
    const rawNative = rest.reasoningEffort;
    delete rest.reasoningEffort;
    const rawNormalized = rest.effortLevel;
    delete rest.effortLevel;
    let effortLevel: string | undefined;
    if (typeof rawNative === 'string' && rawNative.trim().length > 0) {
        effortLevel = rawNative.trim();
    }
    else if (typeof rawNormalized === 'string' && rawNormalized.trim().length > 0) {
        effortLevel = rawNormalized.trim();
    }
    else if (typeof rawNormalized === 'number' && Number.isFinite(rawNormalized)) {
        effortLevel = String(rawNormalized);
    }

    const rawParallel = rest.parallelToolCalls;
    delete rest.parallelToolCalls;
    const parallelToolCalls = typeof rawParallel === 'boolean' ? rawParallel : undefined;

    const rawMcp = rest.mcpTools;
    delete rest.mcpTools;
    const mcpTools = Array.isArray(rawMcp) && rawMcp.length > 0 ? (rawMcp as RealtimeToolsConfigUnion.Mcp[]) : undefined;

    const rawVoice = rest.voice;
    delete rest.voice;
    const trimmedVoice = typeof rawVoice === 'string' ? rawVoice.trim() : '';
    const voice = trimmedVoice.length > 0 ? trimmedVoice : undefined;

    const disableAutoResponse = rest.disableAutoResponse === true;
    delete rest.disableAutoResponse;

    // PROTECTED WIRE FIELDS — never overridable through the open bag. `type` is the GA session
    // discriminator (a clobbered value makes strict endpoints reject the WHOLE session.update,
    // silently dropping the prompt AND tools); `instructions` is the server-authored co-agent
    // identity; `tools` is the server-authored tool authority. `audio` remains an intentional,
    // documented override channel.
    const protectedBag = rest as JSONObject & { type?: unknown; instructions?: unknown; tools?: unknown; model?: unknown };
    if (protectedBag.type !== undefined || protectedBag.instructions !== undefined || protectedBag.tools !== undefined || protectedBag.model !== undefined) {
        RealtimeDiagLog('[OpenAIRealtime][diag] Scrubbing protected wire field(s) (type/instructions/tools/model) from the session Config bag — these are server-authored and cannot be overridden per session');
    }
    delete protectedBag.type;
    delete protectedBag.instructions;
    delete protectedBag.tools;
    // `model` is server-authoritative on the client-direct minted session (set from params.Model) —
    // a bag override would let a browser pin a different model in the ephemeral pact.
    delete protectedBag.model;

    // Per-session transcription-model override + MJ-side transport settings. All scrubbed
    // unconditionally — none of these are wire fields on ANY provider in the family.
    const bag = rest as JSONObject & { inputTranscriptionModel?: unknown; endpoint?: unknown; sampleRate?: unknown; proxyBaseUrl?: unknown };
    const rawItm = bag.inputTranscriptionModel;
    delete bag.inputTranscriptionModel;
    const inputTranscriptionModel = typeof rawItm === 'string' && rawItm.trim().length > 0 ? rawItm.trim() : undefined;
    const rawEndpoint = bag.endpoint;
    delete bag.endpoint;
    const endpoint = typeof rawEndpoint === 'string' && rawEndpoint.trim().length > 0 ? rawEndpoint.trim() : undefined;
    const rawRate = bag.sampleRate;
    delete bag.sampleRate;
    const sampleRate = typeof rawRate === 'number' && rawRate > 0 ? rawRate : undefined;
    const rawProxy = bag.proxyBaseUrl;
    delete bag.proxyBaseUrl;
    const proxyBaseUrl = typeof rawProxy === 'string' && rawProxy.trim().length > 0 ? rawProxy.trim() : undefined;

    return { effortLevel, parallelToolCalls, mcpTools, voice, disableAutoResponse, inputTranscriptionModel, endpoint, sampleRate, proxyBaseUrl, rest };
}

/**
 * Applies the profile-gated GA features onto a session payload. Features a provider has not
 * confirmed are silently dropped (already scrubbed from the bag by {@link ExtractRealtimeFeatures})
 * rather than sent and rejected. Effort levels run through the profile's `mapEffortLevel` seam so
 * each provider translates MJ's normalized vocabulary to its own literals.
 *
 * @param session The session payload under construction.
 * @param features The features extracted from the Config bag.
 * @param profile The provider profile gating each feature.
 */
function applyGAFeatures(
    session: GARealtimeSessionCreateRequest,
    features: ExtractedRealtimeFeatures,
    profile: OpenAIRealtimeProfile,
): void {
    if (profile.supportsReasoningEffort && features.effortLevel) {
        const mapped = profile.mapEffortLevel(features.effortLevel);
        if (mapped) {
            session.reasoning = { effort: mapped };
        }
        else {
            RealtimeDiagLog(`[${profile.providerKey}Realtime][diag] Ignoring unmappable effort level '${features.effortLevel}'`);
        }
    }
    if (profile.supportsParallelToolCalls && features.parallelToolCalls !== undefined) {
        session.parallel_tool_calls = features.parallelToolCalls;
    }
    if (profile.supportsMcpTools && features.mcpTools && features.mcpTools.length > 0) {
        // MCP server tools ride ALONGSIDE the function tools — the GA tools array is a union of both.
        // NOTE: the driver has no MCP approval UX yet, so config authors should declare servers with
        // `require_approval: 'never'`; an mcp_approval_request arriving mid-session is surfaced as a
        // recoverable session error (see OpenAIRealtimeSession.dispatch) rather than silently stalling.
        session.tools = [...(session.tools ?? []), ...features.mcpTools];
    }
}

/**
 * Assembles the session `audio` block from the profile + extracted features, or `undefined` when
 * every part is empty (compat endpoints reject/ignore hollow blocks). The transcription model is
 * the per-session bag override when present, else the profile's default (which may be undefined
 * for natively-transcribing providers).
 *
 * @param profile The provider profile.
 * @param features The extracted Config-bag features.
 * @param turnDetection The already-built turn-detection block, if any.
 * @returns The audio block, or `undefined` to omit it.
 */
function BuildAudioBlock(
    profile: OpenAIRealtimeProfile,
    features: ReturnType<typeof ExtractRealtimeFeatures>,
    turnDetection: RealtimeAudioInputTurnDetection | undefined,
): RealtimeSessionCreateRequest['audio'] | undefined {
    const transcriptionModel = features.inputTranscriptionModel ?? profile.inputTranscriptionModel;
    const input = {
        ...(transcriptionModel ? { transcription: { model: transcriptionModel } } : {}),
        ...(turnDetection ? { turn_detection: turnDetection } : {}),
    };
    const output = profile.supportsVoiceOutput && features.voice ? { voice: features.voice } : undefined;
    if (Object.keys(input).length === 0 && !output) {
        return undefined;
    }
    return {
        ...(Object.keys(input).length > 0 ? { input } : {}),
        ...(output ? { output } : {}),
    };
}

/**
 * Maps Core {@link RealtimeToolDefinition}s up to OpenAI's native function-tool schema.
 *
 * The single mapping used everywhere a tool set is sent to the Realtime API: the live
 * `session.update` path ({@link OpenAIRealtimeSession.mapTools}) and the client-direct
 * ephemeral-secret path ({@link OpenAIRealtime.CreateClientSession}) both call this so the two
 * topologies expose byte-for-byte identical tool schemas.
 *
 * @param tools The Core tool definitions to map.
 * @returns The OpenAI realtime function-tool array.
 */
function mapRealtimeTools(tools: RealtimeToolDefinition[]): RealtimeFunctionTool[] {
    return tools.map((tool) => ({
        type: 'function',
        name: tool.Name,
        description: tool.Description,
        parameters: tool.ParametersSchema,
    }));
}

/**
 * Minimal connection surface the {@link OpenAIRealtime} driver depends on.
 *
 * This is the **injectable seam** for testing. It is a structural subset of the SDK's
 * `OpenAIRealtimeWebSocket` (which extends `OpenAIRealtimeEmitter`): the driver only ever
 * uses `on`, `off`, `send`, and `close`. Because the driver creates its connection through the
 * overridable {@link OpenAIRealtime.createConnection} method, unit tests subclass the driver and
 * return a fake connection implementing this interface — no network and no real WebSocket.
 */
export interface IOpenAIRealtimeConnection {
    /**
     * Registers a listener for a server event type (`'event'` for the catch-all firehose).
     *
     * Return type is `void` because the driver never uses the chained return value, even though the
     * SDK's `EventEmitter` returns `this` for chaining. A void-returning method is assignable from a
     * value-returning one, so a real `OpenAIRealtimeWebSocket` still satisfies this interface.
     */
    on(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    /**
     * Registers a listener for connection errors. The SDK routes BOTH transport-level failures
     * (socket error, unparseable frame, failed send — `error.error` is undefined) and provider
     * `error` server frames (`error.error` carries the payload) through this channel; the driver
     * classifies fatality from that distinction.
     */
    on(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    /** Removes a previously-registered listener. See {@link IOpenAIRealtimeConnection.on} re: return type. */
    off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    /** Removes a previously-registered error listener. */
    off(event: 'error', listener: (error: OpenAIRealtimeError) => void): void;
    /** Sends a client event to the realtime API. */
    send(event: RealtimeClientEvent): void;
    /** Closes the underlying socket. */
    close(props?: { code: number; reason: string }): void;
    /**
     * Optional raw WebSocket surface (present on the real `OpenAIRealtimeWebSocket`, which exposes
     * its underlying `socket`). Used solely to detect UNEXPECTED closure — the SDK emitter has no
     * close event of its own. The driver feature-detects; fakes may omit it.
     */
    socket?: { addEventListener(type: 'close', listener: () => void): void };
}

/**
 * OpenAI implementation of the {@link BaseRealtimeModel} primitive, backed by OpenAI's
 * Realtime API over a WebSocket (`OpenAIRealtimeWebSocket` from the `openai` SDK, v6.18.0).
 *
 * The driver opens a duplex session, configures it (system prompt + tools + optional initial
 * context), and translates the provider's server-event stream into the modality-agnostic
 * {@link IRealtimeSession} contract.
 *
 * **This class is also the shared implementation for OpenAI-Realtime-compatible providers.**
 * Compatible providers (e.g. xAI Grok Voice) subclass it, pass their base URL to the constructor,
 * and override {@link OpenAIRealtime.Profile} — inheriting the whole protocol implementation and
 * every future GA feature (gated per-provider by the profile) instead of maintaining a clone.
 *
 * **GA features** (gpt-realtime-2 / 2.1 era) are driven from the open
 * {@link RealtimeSessionParams.Config} bag with MJ-idiomatic keys, translated to provider-native
 * session fields only when the profile confirms support:
 * - `reasoningEffort: 'minimal'|'low'|'medium'|'high'|'xhigh'` → `reasoning.effort`
 * - `parallelToolCalls: boolean` → `parallel_tool_calls`
 * - `mcpTools: [{ type:'mcp', server_label, server_url|connector_id, ... }]` → appended to `session.tools`
 *
 * **Tool results** complete the tool-call loop: the returned session implements the Core
 * `IRealtimeSession.SendToolResult` contract method, which the agent layer calls after executing a
 * tool to feed its result back to the model. See {@link OpenAIRealtimeSession.SendToolResult}.
 */
@RegisterClass(BaseRealtimeModel, 'OpenAIRealtime')
export class OpenAIRealtime extends BaseRealtimeModel {
    private _openAI: OpenAI;

    /**
     * @param apiKey The provider API key.
     * @param baseURL Optional override for OpenAI-compatible providers (subclasses pass their own
     * endpoint; the SDK's `buildRealtimeURL()` derives the wss:// realtime endpoint from it).
     */
    constructor(apiKey: string, baseURL?: string) {
        super(apiKey);
        this._openAI = baseURL ? new OpenAI({ apiKey, baseURL }) : new OpenAI({ apiKey });
    }

    /** Read-only accessor for the underlying OpenAI SDK client. */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    /**
     * The provider profile driving per-provider knobs and GA feature gates. Subclasses override
     * this single seam instead of re-implementing the protocol.
     */
    protected get Profile(): OpenAIRealtimeProfile {
        return OPENAI_REALTIME_PROFILE;
    }

    /**
     * Creates the realtime connection for a model. Overridable seam for testing.
     *
     * Production returns a real `OpenAIRealtimeWebSocket`. Unit tests override this to return a
     * fake {@link IOpenAIRealtimeConnection} that emits OpenAI-shaped events and captures sends.
     *
     * @param model The provider realtime model id (e.g. `gpt-realtime-2.1`).
     * @returns A connection implementing {@link IOpenAIRealtimeConnection}.
     */
    protected createConnection(model: string): IOpenAIRealtimeConnection {
        return new OpenAIRealtimeWebSocket({ model }, this._openAI);
    }

    /**
     * Creates the session wrapper for a freshly-opened connection. Overridable seam so subclasses
     * can return their own session subclass while {@link StartSession} stays shared.
     *
     * @param connection The open provider connection.
     * @returns The session bound to this driver's {@link Profile}.
     */
    protected createSessionInstance(connection: IOpenAIRealtimeConnection): OpenAIRealtimeSession {
        return new OpenAIRealtimeSession(connection, this.Profile);
    }

    /**
     * Opens a duplex realtime session, applies the session config, and returns the live handle.
     *
     * @param params Session configuration (model, system prompt, tools, initial context, config bag).
     * @returns A promise resolving to the {@link IRealtimeSession} handle.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const connection = this.createConnection(params.Model);
        const session = this.createSessionInstance(connection);
        session.applyInitialConfig(params);
        return session;
    }

    /**
     * OpenAI supports the client-direct topology: the server mints a short-lived ephemeral
     * client secret that the browser uses to open its OWN connection to OpenAI's Realtime API,
     * while the server still controls the system prompt + tools via the returned SessionConfig.
     */
    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /**
     * The voices the OpenAI Realtime API can speak with — used to populate the dev voice picker so two
     * agents in one room can be given distinct voices. Kept in sync with OpenAI's realtime voice set.
     */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return [
            { ID: 'alloy', Name: 'Alloy' },
            { ID: 'ash', Name: 'Ash' },
            { ID: 'ballad', Name: 'Ballad' },
            { ID: 'coral', Name: 'Coral' },
            { ID: 'echo', Name: 'Echo' },
            { ID: 'sage', Name: 'Sage' },
            { ID: 'shimmer', Name: 'Shimmer' },
            { ID: 'verse', Name: 'Verse' },
        ];
    }

    /**
     * Mints the ephemeral client secret via the provider's Realtime client-secrets API (resolved
     * from the SDK client's base URL, so OpenAI-compatible subclasses target their own endpoint).
     * Overridable seam for testing — unit tests return a fake response so no network call is made.
     *
     * @param body The client-secret create request (carries the realtime session config).
     * @returns The client-secret create response (token value + expiry + echoed session).
     */
    protected async mintClientSecret(body: ClientSecretCreateParams): Promise<ClientSecretCreateResponse> {
        return this._openAI.realtime.clientSecrets.create(body);
    }

    /**
     * Mints an ephemeral, server-scoped realtime session credential for a browser to open its
     * own provider connection (client-direct topology). The server builds the session config
     * (system prompt + tools + model) so it retains control of behavior even though the browser
     * owns the socket.
     *
     * The GA features (reasoning effort, parallel tool calls, MCP tools) and the output voice are
     * extracted from the Config bag and applied here exactly as on the server-bridged path, so the
     * two topologies stay behaviorally identical — the browser applies the minted SessionConfig
     * verbatim with no client-side changes needed.
     *
     * @param params Session configuration (model, system prompt, tools).
     * @returns The minted {@link ClientRealtimeSessionConfig} the browser authenticates + applies.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const profile = this.Profile;
        const features = ExtractRealtimeFeatures(params.Config);
        // Enable transcription of the user's mic input so BOTH sides of the conversation are
        // captured (live captions + persisted ConversationDetail turns). Realtime models accept
        // audio natively, so input transcription is a separate ASR pass that must be opted into.
        // The OUTPUT voice comes from the effective config's per-provider voice (`params.Config.voice`,
        // shaped by GetProviderVoiceSettings) — this is what lets a co-agent's configured voice OR a
        // per-session override actually take effect in the client-direct topology.
        const turnDetection = profile.buildTurnDetection(features.disableAutoResponse);
        const audio = BuildAudioBlock(profile, features, turnDetection);
        const session: GARealtimeSessionCreateRequest = {
            type: 'realtime',
            model: params.Model,
            instructions: params.SystemPrompt,
            ...(audio ? { audio } : {}),
            // The residual (feature-scrubbed, wire-field-protected) Config bag applies here EXACTLY
            // as on the server-bridged session.update — same construction ORDER too, so a raw
            // `audio` override behaves identically on both topologies.
            ...features.rest,
        };
        if (params.Tools && params.Tools.length > 0) {
            session.tools = mapRealtimeTools(params.Tools);
        }
        applyGAFeatures(session, features, profile);
        const response = await this.mintClientSecret({ session });
        return {
            Provider: profile.providerKey,
            Model: params.Model,
            EphemeralToken: response.value,
            ExpiresAt: new Date(response.expires_at * 1000).toISOString(),
            // The provider-native session config the browser applies verbatim (plain JSON).
            SessionConfig: JSON.parse(JSON.stringify(session)) as JSONObject,
        };
    }
}

/**
 * Live {@link IRealtimeSession} backed by an {@link IOpenAIRealtimeConnection}.
 *
 * Holds the registered handlers and the single `'event'` listener that fans the provider's
 * server-event stream out to the contract handlers via {@link OpenAIRealtimeSession.dispatch}.
 *
 * The session is profile-parameterized (see {@link OpenAIRealtimeProfile}) so OpenAI-compatible
 * provider subclasses reuse it verbatim with their own knobs.
 */
export class OpenAIRealtimeSession implements IRealtimeSession {
    private connection: IOpenAIRealtimeConnection;
    private profile: OpenAIRealtimeProfile;
    private outputHandler?: (chunk: ArrayBuffer) => void;
    private transcriptHandler?: (t: RealtimeTranscript) => void;
    private toolCallHandler?: (call: RealtimeToolCall) => void;
    private interruptionHandler?: () => void;
    private usageHandler?: (u: RealtimeUsage) => void;
    private errorHandler?: (error: RealtimeSessionError) => void;
    private closeHandler?: () => void;
    private eventListener: (event: RealtimeServerEvent) => void;
    private errorListener: (error: OpenAIRealtimeError) => void;
    /** Set by {@link Close} so a consumer-initiated teardown never reports an "unexpected" close. */
    private closedByConsumer = false;

    /** Backing promise for {@link WaitForConfigApplied}; resolve/reject handles null once settled. */
    private configAppliedPromise: Promise<void>;
    private resolveConfigApplied: (() => void) | null = null;
    private rejectConfigApplied: ((error: Error) => void) | null = null;
    /** The deferred-config listener awaiting `session.created`, tracked so teardown can remove it. */
    private pendingConfigListener: ((event: RealtimeServerEvent) => void) | null = null;
    /** Deadline timer for the deferred-config readiness wait (see {@link configReadinessTimeoutMs}). */
    private configReadinessTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Whether a model response is currently in flight. Minimal response tracking that mirrors the
     * client driver's state machine: set on `response.created` (and eagerly whenever this session
     * sends its own `response.create`, so back-to-back local triggers can't race the server event),
     * cleared on `response.done` — which the API emits for every terminal status, including
     * `cancelled` after barge-in, so the flag can never stick. Consumed by
     * {@link OpenAIRealtimeSession.RequestSpokenUpdate} to skip (not collide with) an active
     * response, since the API rejects overlapping `response.create` requests.
     *
     * Protected (not private) so compat-endpoint session subclasses can apply provider-specific
     * robustness tweaks (e.g. HuggingFace marks a response active on the first audio delta and
     * releases the flag when a tool call yields the floor).
     */
    protected responseActive = false;

    /**
     * Whether the CURRENT user turn has already produced at least one finalized input transcription.
     * Streamed-transcription providers (Grok) emit `input_audio_transcription.completed` REPEATEDLY
     * for one utterance, each carrying the full growing text; without this flag every repeat lands as
     * a fresh non-replacing final and the persistence layer mints a duplicate `ConversationDetail`
     * row per caption. The second-and-later completeds are flagged {@link RealtimeTranscript.ReplacesPrevious}
     * so they REPLACE the turn's row in place — exactly the client-direct driver's behavior, kept in
     * sync here so the two topologies persist identically. Reset on each `speech_started` (new turn).
     * Harmless for single-completed providers (OpenAI): the flag is always false on the one completed.
     */
    private userTurnTranscribed = false;

    /**
     * @param connection The injectable provider-connection seam.
     * @param profile The provider profile (defaults to OpenAI's so existing direct construction keeps working).
     */
    constructor(connection: IOpenAIRealtimeConnection, profile: OpenAIRealtimeProfile = OPENAI_REALTIME_PROFILE) {
        this.connection = connection;
        this.profile = profile;
        this.configAppliedPromise = new Promise<void>((resolve, reject) => {
            this.resolveConfigApplied = resolve;
            this.rejectConfigApplied = reject;
        });
        // Not every consumer awaits WaitForConfigApplied — guard unhandled-rejection noise.
        this.configAppliedPromise.catch(() => undefined);
        this.eventListener = (event: RealtimeServerEvent) => this.dispatch(event);
        this.connection.on('event', this.eventListener);
        this.errorListener = (error: OpenAIRealtimeError) => this.handleConnectionError(error);
        this.connection.on('error', this.errorListener);
        // The SDK emitter has no close event; detect unexpected closure from the raw socket when
        // the connection exposes it (the real OpenAIRealtimeWebSocket does; fakes may omit it).
        this.connection.socket?.addEventListener('close', () => this.handleSocketClose());
    }

    /**
     * Applies the initial session config: system prompt + tools via `session.update`, optional initial
     * context as a user message. Called once by {@link OpenAIRealtime.StartSession}.
     *
     * **Deferral is profile-driven.** On OpenAI the realtime WebSocket is NOT open when `StartSession`
     * returns — sending `session.update` synchronously races the handshake and the instructions (the
     * **system prompt + tools**) are silently dropped, so the model runs with NO prompt (no identity, no
     * companion framing). We therefore wait for the server's `session.created` frame — the first event once
     * the socket is open and the session exists, and the canonical moment to configure a realtime session —
     * exactly the point the browser/client-direct path applies its config. Idempotent (a re-emitted
     * `session.created` can't double-apply); the listener removes itself once it fires. Providers whose
     * socket accepts config immediately (xAI) set the profile flag false and send synchronously.
     *
     * @param params The session parameters.
     */
    public applyInitialConfig(params: RealtimeSessionParams): void {
        // Compat endpoints with no history-seeding channel fold the prior context into the system
        // prompt instead of seeding a separate user message (profile-driven).
        const fold = this.profile.foldInitialContextIntoPrompt;
        const context = params.InitialContext?.trim();
        const systemPrompt = fold && context ? `${params.SystemPrompt}\n\n## Prior context\n${context}` : params.SystemPrompt;
        const applyConfig = (): void => {
            this.sendSessionUpdate(systemPrompt, params.Tools, params.Config);
            if (!fold && context && context.length > 0) {
                this.sendInitialContext(context);
            }
            this.clearConfigReadinessTimer();
            this.resolveConfigApplied?.();
            this.resolveConfigApplied = null;
            this.rejectConfigApplied = null;
        };
        if (!this.profile.deferInitialConfigUntilSessionCreated) {
            applyConfig();
            return;
        }
        let applied = false;
        const applyWhenReady = (event: RealtimeServerEvent): void => {
            if (applied || event.type !== 'session.created') {
                return;
            }
            applied = true;
            this.connection.off('event', applyWhenReady);
            this.pendingConfigListener = null;
            applyConfig();
        };
        this.pendingConfigListener = applyWhenReady;
        this.connection.on('event', applyWhenReady);
        // Readiness deadline: a silent endpoint (socket open, no session.created) must not hang a
        // driver that AWAITS WaitForConfigApplied (HuggingFace) forever. The timeout rejects the
        // WAIT only — the deferred listener stays registered, so a late session.created on a
        // fire-and-forget flow (OpenAI's non-awaiting StartSession) still applies the config.
        this.configReadinessTimer = setTimeout(() => {
            this.configReadinessTimer = null;
            this.failConfigWaitOnly(`session.created not received within ${this.configReadinessTimeoutMs}ms — endpoint silent during startup`);
        }, this.configReadinessTimeoutMs);
        // Node-only nicety: never let a readiness timer keep the process alive (browser bundles
        // of this server package don't exist; unref is feature-detected anyway).
        (this.configReadinessTimer as { unref?: () => void }).unref?.();
    }

    /**
     * Readiness deadline in milliseconds for the deferred-config wait. Only affects consumers of
     * {@link WaitForConfigApplied}; the deferred apply itself is not cancelled. Overridable.
     */
    protected get configReadinessTimeoutMs(): number {
        return 15_000;
    }

    /** Rejects a pending config wait WITHOUT removing the deferred listener (timeout semantics). */
    private failConfigWaitOnly(message: string): void {
        if (this.rejectConfigApplied) {
            const reject = this.rejectConfigApplied;
            this.rejectConfigApplied = null;
            this.resolveConfigApplied = null;
            reject(new Error(message));
        }
    }

    /** Clears the readiness-deadline timer (config applied, or session torn down). */
    private clearConfigReadinessTimer(): void {
        if (this.configReadinessTimer) {
            clearTimeout(this.configReadinessTimer);
            this.configReadinessTimer = null;
        }
    }

    /** Removes a still-pending deferred-config listener (teardown before `session.created`). */
    private clearPendingConfigListener(): void {
        if (this.pendingConfigListener) {
            this.connection.off('event', this.pendingConfigListener);
            this.pendingConfigListener = null;
        }
    }

    /**
     * Resolves once the initial session config has been APPLIED (sent on the socket) — immediately
     * for providers that configure synchronously, or on the server's `session.created` frame for
     * deferring providers. Rejects if the transport dies (fatal error or unexpected close) or the
     * consumer closes the session before the config went out.
     *
     * The base {@link OpenAIRealtime.StartSession} deliberately does NOT await this (OpenAI
     * semantics: the session handle is returned while the handshake completes). Drivers whose
     * contract promises "ready only after config is applied" (HuggingFace) await it in their
     * `StartSession` override.
     */
    public WaitForConfigApplied(): Promise<void> {
        return this.configAppliedPromise;
    }

    /** Rejects a still-pending {@link WaitForConfigApplied} (transport death / early consumer close). */
    private failConfigWait(message: string): void {
        this.clearConfigReadinessTimer();
        this.clearPendingConfigListener();
        if (this.rejectConfigApplied) {
            const reject = this.rejectConfigApplied;
            this.rejectConfigApplied = null;
            this.resolveConfigApplied = null;
            reject(new Error(message));
        }
    }

    // ---- IRealtimeSession outbound ----

    /** @inheritdoc */
    public SendInput(chunk: ArrayBuffer): void {
        this.connection.send({
            type: 'input_audio_buffer.append',
            audio: this.encodeBase64(chunk),
        });
    }

    /** @inheritdoc */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        this.connection.send({
            type: 'session.update',
            session: { type: 'realtime', tools: this.mapTools(tools) },
        });
    }

    /**
     * @inheritdoc
     *
     * Completes the tool-call loop for OpenAI: sends a `conversation.item.create` with a
     * `function_call_output` item carrying the tool output, then a `response.create` so the model
     * continues the turn with the result in context.
     *
     * @param callID The `CallID` from the originating {@link RealtimeToolCall}.
     * @param output The tool's result as a JSON-stringified string.
     */
    public async SendToolResult(callID: string, output: string): Promise<void> {
        const item: RealtimeConversationItemFunctionCallOutput = {
            type: 'function_call_output',
            call_id: callID,
            output,
        };
        this.connection.send({ type: 'conversation.item.create', item });
        this.connection.send({ type: 'response.create' });
        // This deliberately triggers a response — mark it active eagerly so an interim
        // RequestSpokenUpdate arriving before the server's response.created cannot collide.
        this.responseActive = true;
    }

    /**
     * @inheritdoc
     *
     * Injects a **system-role** conversation item (`conversation.item.create`) the model can draw
     * on the next time it speaks, WITHOUT a `response.create` — so no spoken reply is forced.
     *
     * NOTE: the role must be `'system'` — gpt-realtime rejects `'developer'` items ("Developer
     * messages are only supported for quicksilver sessions"); same constraint the client-direct
     * driver hit. Item creation is always safe mid-response on OpenAI, so no collision guard is
     * needed here (unlike {@link OpenAIRealtimeSession.RequestSpokenUpdate}).
     *
     * @param text The context note to append to the conversation.
     */
    public SendContextNote(text: string): void {
        const item: RealtimeConversationItemSystemMessage = {
            type: 'message',
            role: 'system',
            content: [{ type: 'input_text', text }],
        };
        this.connection.send({ type: 'conversation.item.create', item });
    }

    /**
     * @inheritdoc
     *
     * Triggers ONE short spoken update via `response.create` with per-response `instructions`.
     *
     * **Collision behavior: skip.** The Realtime API rejects a `response.create` while another
     * response is active, so when {@link responseActive} is set the request is dropped — interim
     * updates are disposable by contract (the next update or the final result supersedes them).
     * When sent, the flag is set eagerly (before the server's `response.created` echo) so two
     * back-to-back local triggers can't both fire.
     *
     * @param instructions Instructions for the single spoken update. **Blank/empty means "respond now using
     *   the SESSION system prompt"** (the meeting-mode bridge trigger passes `''`); only a non-empty value is
     *   forwarded as a per-response override.
     */
    public RequestSpokenUpdate(instructions: string): boolean {
        if (this.responseActive) {
            RealtimeDiagLog(`[${this.profile.providerKey}Realtime][diag] RequestSpokenUpdate SKIPPED — a response is already active (interim updates are disposable)`);
            return false; // NOT sent — the caller (bridge) releases the floor instead of wedging on it
        }
        this.responseActive = true;
        RealtimeDiagLog(`[${this.profile.providerKey}Realtime][diag] RequestSpokenUpdate → sending response.create (perResponseInstructions=${typeof instructions === 'string' && instructions.trim().length > 0 ? 'yes' : 'none → session prompt governs'})`);
        // CRITICAL: only set per-response `instructions` when the caller actually supplied some. OpenAI's
        // `response.create` treats `response.instructions` as a FULL override of the session system prompt for
        // that response — so forwarding `''` would wipe the co-agent identity framing (incl. the
        // "call invoke-target-agent, don't do the work yourself" directive), and the model would answer
        // directly instead of delegating. A blank value ⇒ plain `response.create` ⇒ the session prompt governs.
        const hasInstructions = typeof instructions === 'string' && instructions.trim().length > 0;
        this.connection.send(
            hasInstructions ? { type: 'response.create', response: { instructions } } : { type: 'response.create' },
        );
        return true; // a response.create was issued — the bridge may hold the floor for this turn
    }

    /** @inheritdoc — profile-gated: only providers whose endpoint honors a live partial `session.update`. */
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: this.profile.supportsLiveReconfigure };
    }

    /**
     * @inheritdoc
     *
     * Live turn-mode change via a partial `session.update` — flips server-VAD auto-response on/off without
     * reconnecting (e.g. re-gate a 1:1 agent to meeting mode when its room becomes multi-agent). The input
     * transcription block is re-sent alongside so the partial update can't drop it.
     */
    public Reconfigure(params: RealtimeReconfigureParams): void {
        if (!this.profile.supportsLiveReconfigure) {
            // The profile declares no live-reconfigure support — advertising Capabilities false is
            // the primary guard; this no-op is defense-in-depth against callers that skip the check.
            RealtimeDiagLog(`[${this.profile.providerKey}Realtime][diag] Reconfigure ignored — profile declares no live turn-mode support`);
            return;
        }
        const disable = params.DisableAutoResponse === true;
        const turnDetection: RealtimeAudioInputTurnDetection = {
            type: 'server_vad',
            create_response: !disable,
            interrupt_response: true,
        };
        // Re-send the transcription block alongside ONLY when this profile transcribes via an
        // opt-in model — a partial update must not fabricate `transcription: { model: undefined }`
        // for natively-transcribing providers.
        const transcription = this.profile.inputTranscriptionModel
            ? { transcription: { model: this.profile.inputTranscriptionModel } }
            : {};
        this.connection.send({
            type: 'session.update',
            session: {
                type: 'realtime',
                audio: { input: { ...transcription, turn_detection: turnDetection } },
            },
        });
    }

    // ---- IRealtimeSession handler registration ----

    /** @inheritdoc */
    public OnOutput(handler: (chunk: ArrayBuffer) => void): void {
        this.outputHandler = handler;
    }

    /** @inheritdoc */
    public OnTranscript(handler: (t: RealtimeTranscript) => void): void {
        this.transcriptHandler = handler;
    }

    /** @inheritdoc */
    public OnToolCall(handler: (call: RealtimeToolCall) => void): void {
        this.toolCallHandler = handler;
    }

    /** @inheritdoc */
    public OnInterruption(handler: () => void): void {
        this.interruptionHandler = handler;
    }

    /** @inheritdoc */
    public OnUsage(handler: (u: RealtimeUsage) => void): void {
        this.usageHandler = handler;
    }

    /** @inheritdoc */
    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this.errorHandler = handler;
    }

    /** @inheritdoc */
    public OnClose(handler: () => void): void {
        this.closeHandler = handler;
    }

    /** @inheritdoc */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        this.failConfigWait('session closed by consumer before the initial config was applied');
        this.clearPendingConfigListener();
        this.connection.off('event', this.eventListener);
        this.connection.off('error', this.errorListener);
        this.connection.close();
    }

    // ---- Inbound event translation ----

    /**
     * Routes a provider server event to the matching contract handler. Each branch delegates to a
     * small, single-purpose handler to keep this dispatcher flat.
     *
     * Protected (not private) so OpenAI-compatible session subclasses can pre-translate legacy /
     * beta frame aliases before delegating here.
     *
     * @param event The OpenAI realtime server event.
     */
    protected dispatch(event: RealtimeServerEvent): void {
        switch (event.type) {
            case 'response.output_audio.delta':
                return this.handleAudioDelta(event.delta);
            case 'response.output_audio_transcript.delta':
                return this.emitTranscript('assistant', event.delta, false);
            case 'response.output_audio_transcript.done':
                return this.emitTranscript('assistant', event.transcript, true);
            case 'conversation.item.input_audio_transcription.delta':
                return this.emitTranscript('user', event.delta ?? '', false);
            case 'conversation.item.input_audio_transcription.completed': {
                // Streamed transcription (Grok): the 2nd+ completed of a turn REPLACES the turn's row
                // in place rather than appending a duplicate. The first completed of the turn is a
                // normal (non-replacing) final. Flag flips here and resets on the next speech_started.
                const replacesPrevious = this.userTurnTranscribed;
                this.userTurnTranscribed = true;
                return this.emitTranscript('user', event.transcript, true, replacesPrevious);
            }
            case 'response.function_call_arguments.done':
                return this.handleFunctionCall(event.call_id, event.name, event.arguments);
            case 'input_audio_buffer.speech_started':
                // A new user turn begins — reset the streamed-transcription flag so its first
                // completed is a fresh (non-replacing) final. Do this UNCONDITIONALLY (not only on
                // true barge-in): handleInterruption gates its handler on responseActive, but the
                // turn boundary is real regardless of whether the model was mid-response.
                this.userTurnTranscribed = false;
                return this.handleInterruption();
            case 'response.created':
                // A response is in flight (whether server-VAD-triggered or locally triggered).
                this.responseActive = true;
                return;
            case 'response.done':
                // Emitted for every terminal status (completed, cancelled, failed) — always clears.
                this.responseActive = false;
                return this.handleResponseDone(event.response.usage as GARealtimeResponseUsage | undefined);
            default:
                return this.dispatchMcpEvent(event);
        }
    }

    /**
     * Handles the MCP slice of the server-event stream. MCP tool calls execute SERVER-SIDE at the
     * provider (no MJ round-trip like function tools), so most lifecycle frames are diag-only. The
     * one that needs action — `mcp_approval_request` — cannot be satisfied yet (no approval UX in
     * the agent layer), so it is surfaced as a RECOVERABLE session error instead of silently
     * stalling the session; config authors should declare MCP servers with `require_approval: 'never'`.
     *
     * The frames are matched by type string because the pinned SDK's `RealtimeServerEvent` union
     * carries them with dedicated interfaces already (`McpListToolsFailed`, `ResponseMcpCallFailed`, etc.).
     *
     * @param event The (possibly MCP-related) server event.
     */
    private dispatchMcpEvent(event: RealtimeServerEvent): void {
        switch (event.type) {
            case 'response.mcp_call.failed':
                RealtimeDiagLog(`[${this.profile.providerKey}Realtime][diag] MCP tool call FAILED`);
                this.errorHandler?.({ Message: 'A remote MCP tool call failed at the provider', Fatal: false });
                return;
            case 'mcp_list_tools.failed':
                RealtimeDiagLog(`[${this.profile.providerKey}Realtime][diag] MCP server tool listing FAILED`);
                this.errorHandler?.({ Message: 'Listing tools from a remote MCP server failed at the provider', Fatal: false });
                return;
            default:
                // mcp_approval_request arrives as a conversation item add — detect it structurally.
                if (event.type === 'conversation.item.added' && event.item?.type === 'mcp_approval_request') {
                    // DEFENSIVE AUTO-DENY: no approval UX exists yet, and the model BLOCKS forever
                    // awaiting an mcp_approval_response — dead air from the user's perspective. A
                    // denial lets the model continue and voice the refusal instead of wedging the
                    // turn. Config authors who want silent MCP flow declare require_approval:'never'.
                    const approvalRequestId = event.item.id;
                    if (approvalRequestId) {
                        this.connection.send({
                            type: 'conversation.item.create',
                            item: {
                                type: 'mcp_approval_response',
                                approval_request_id: approvalRequestId,
                                approve: false,
                            },
                        } as RealtimeClientEvent);
                        RealtimeDiagLog(`[${this.profile.providerKey}Realtime][diag] MCP approval request AUTO-DENIED (no approval UX yet) — request ${approvalRequestId}`);
                    }
                    this.errorHandler?.({
                        Message: "An MCP server requested tool approval; no approval UX exists yet, so it was automatically DENIED (the model continues and voices the refusal). Declare the server with require_approval: 'never' to avoid the round-trip.",
                        Fatal: false,
                    });
                }
                return;
        }
    }

    /** Decodes a base64 audio delta and forwards it to the output handler. */
    private handleAudioDelta(deltaBase64: string): void {
        this.outputHandler?.(this.decodeBase64(deltaBase64));
    }

    /**
     * Emits a transcript event, skipping empty/whitespace text — empty captions are pure noise.
     *
     * @param replacesPrevious When true, this final REPLACES the current turn's persisted row in
     *   place (streamed-transcription providers whose repeated completeds carry the full growing
     *   text) rather than appending a new turn. Defaults to false (append/normal final).
     */
    private emitTranscript(role: 'user' | 'assistant', text: string, isFinal: boolean, replacesPrevious = false): void {
        if (!text || text.trim().length === 0) {
            return;
        }
        this.transcriptHandler?.({ Role: role, Text: text, IsFinal: isFinal, ReplacesPrevious: replacesPrevious });
    }

    /** Forwards a completed function call to the tool-call handler. */
    private handleFunctionCall(callId: string, name: string, args: string): void {
        this.toolCallHandler?.({ CallID: callId, ToolName: name, Arguments: args });
    }

    /**
     * Notifies the interruption handler of TRUE barge-in only: user speech that cut off an
     * ACTIVE model response. A `speech_started` while the model is idle is just the user taking
     * their normal turn — the {@link IRealtimeSession.OnInterruption} contract explicitly excludes
     * it, so the raw frame is gated on {@link responseActive} (the server-bridged topology's proxy
     * for "model output in flight"). The provider cancels its own turn and emits a terminal
     * `response.done`, which clears the flag.
     */
    private handleInterruption(): void {
        if (!this.responseActive) {
            return;
        }
        this.interruptionHandler?.();
    }

    /**
     * Classifies an SDK connection error and forwards it to the error handler. The SDK routes
     * BOTH kinds through its `'error'` emitter: provider `error` server frames carry a payload in
     * `error.error` (recoverable — the session stays open, `Fatal: false`) while transport-level
     * failures (socket error, unparseable frame, failed send) have no payload (`Fatal: true` —
     * including the credential/token-expiry case, which surfaces as a transport teardown).
     */
    private handleConnectionError(error: OpenAIRealtimeError): void {
        const isProviderFrame = error.error != null;
        if (!isProviderFrame) {
            this.failConfigWait(error.message);
        }
        this.errorHandler?.({
            Message: error.message,
            Code: error.error?.code ?? undefined,
            Fatal: !isProviderFrame,
        });
    }

    /**
     * Handles the raw socket closing. A consumer-initiated {@link Close} is expected and silent;
     * anything else (provider hangup, network drop, token death) is surfaced as a FATAL error —
     * so consumers finalize instead of idling on a dead socket — followed by the close handler.
     */
    private handleSocketClose(): void {
        if (this.closedByConsumer) {
            return;
        }
        this.failConfigWait(this.profile.unexpectedCloseMessage);
        this.errorHandler?.({ Message: this.profile.unexpectedCloseMessage, Fatal: true });
        this.closeHandler?.();
    }

    /**
     * Translates a response's usage block into a {@link RealtimeUsage} update, INCLUDING the
     * per-modality token details the GA API reports — realtime cost attribution is impossible
     * without the audio/text/cached split (audio-in bills ~8x text-in on GPT Realtime 2.1).
     */
    private handleResponseDone(usage: GARealtimeResponseUsage | undefined): void {
        if (!usage) {
            return;
        }
        const update: RealtimeUsage = {
            InputTokens: usage.input_tokens ?? 0,
            OutputTokens: usage.output_tokens ?? 0,
        };
        const input = MapUsageModalityDetail(usage.input_token_details);
        if (input) {
            update.InputTokenDetails = input;
        }
        const output = MapUsageModalityDetail(usage.output_token_details);
        if (output) {
            update.OutputTokenDetails = output;
        }
        this.usageHandler?.(update);
    }

    // ---- Config helpers ----

    /** Sends the `session.update` that establishes instructions, input transcription, tools, and GA features. */
    private sendSessionUpdate(systemPrompt: string, tools?: RealtimeToolDefinition[], config?: JSONObject): void {
        // Pull the MJ-idiomatic feature keys OUT of the open Config bag: the host-neutral meeting flag
        // (disableAutoResponse), the output voice, and the GA features (reasoningEffort/parallelToolCalls/
        // mcpTools) — each translated to its provider-native field only when the profile confirms support,
        // and never sent raw to the API. In a multi-agent meeting the BRIDGE (after its turn policy gates
        // on addressing), not the model, decides WHEN to speak — so we disable server-VAD auto-response
        // while KEEPING detection so input transcription and barge-in still work. A 1:1 call (flag absent)
        // keeps the provider's default auto-response.
        const features = ExtractRealtimeFeatures(config);
        const turnDetection = this.profile.buildTurnDetection(features.disableAutoResponse);

        // Opt into USER input transcription — the same opt-in CreateClientSession applies for the
        // client-direct topology — so user-role transcripts flow server-bridged too (the contract
        // promises BOTH roles). Providers that transcribe natively (profile model undefined, no bag
        // override) get no transcription block; an all-empty audio block is omitted entirely. The
        // residual config bag spreads AFTER the built block so a per-conversation raw `audio`
        // override can still replace it wholesale.
        const audio = BuildAudioBlock(this.profile, features, turnDetection);
        const session: GARealtimeSessionCreateRequest = {
            type: 'realtime',
            instructions: systemPrompt,
            ...(audio ? { audio } : {}),
            ...features.rest,
        };
        if (tools && tools.length > 0) {
            session.tools = this.mapTools(tools);
        }
        applyGAFeatures(session, features, this.profile);
        this.connection.send({ type: 'session.update', session });
    }

    /** Seeds the conversation with initial context as a user text message. */
    private sendInitialContext(context: string): void {
        const item: RealtimeConversationItemUserMessage = {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: context }],
        };
        this.connection.send({ type: 'conversation.item.create', item });
    }

    /** Maps Core tool definitions up to OpenAI's native function-tool schema (shared mapping). */
    private mapTools(tools: RealtimeToolDefinition[]): RealtimeFunctionTool[] {
        return mapRealtimeTools(tools);
    }

    // ---- Encoding helpers ----

    /** Encodes a raw media frame as base64 for the provider's append event. */
    private encodeBase64(chunk: ArrayBuffer): string {
        return Buffer.from(chunk).toString('base64');
    }

    /** Decodes a base64 audio delta into a freshly-allocated `ArrayBuffer`. */
    private decodeBase64(data: string): ArrayBuffer {
        const buffer = Buffer.from(data, 'base64');
        const out = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(out).set(buffer);
        return out;
    }
}
