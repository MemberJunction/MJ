// HuggingFace speech-to-speech — self-hosted realtime (voice) driver.
//
// HuggingFace's open-source speech-to-speech stack (https://github.com/huggingface/speech-to-speech)
// is a cascaded VAD → STT → LLM → TTS pipeline that can expose an **OpenAI-Realtime-compatible**
// websocket endpoint (`/v1/realtime`). Because the endpoint speaks OpenAI's literal GA wire frames,
// this driver **subclasses the shared `OpenAIRealtime` protocol implementation** — supplying a
// provider profile plus a raw-WebSocket connection adapter — instead of maintaining a clone of the
// event loop. Self-hosted specifics (deployment-config endpoint, keyless-auth sentinels, the MJAPI
// realtime-proxy client-direct topology, 16 kHz PCM plane) stay here.
//
// Because the endpoint is self-hosted (same box as MJAPI or another server the deployment owns), the
// client-direct topology is implemented through MJAPI's **realtime proxy**: `CreateClientSession`
// mints a one-time proxy ticket pointing at the internal endpoint and hands the browser a
// `wss://<mjapi-public>/realtime-proxy?ticket=…` URL. The internal endpoint + any auth NEVER reach the
// browser, and the HuggingFace box needs no browser-facing ingress — MJAPI stays the single ingress.

import {
    BaseRealtimeModel,
    RealtimeProxyRegistry,
    REALTIME_PROXY_PATH,
    type ClientRealtimeSessionConfig,
    type IRealtimeSession,
    type RealtimeSessionParams,
    type RealtimeToolDefinition,
    type RealtimeVoiceOption,
    type JSONObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import {
    OpenAIRealtime,
    OpenAIRealtimeSession,
    OpenAIRealtimeProfile,
    IOpenAIRealtimeConnection,
    MapEffortLevelToOpenAIRealtime,
    RawRealtimeWebSocketConnection,
} from '@memberjunction/ai-openai';
import type { RealtimeServerEvent } from 'openai/resources/realtime/realtime';

/**
 * Default upstream endpoint for a locally-run HuggingFace speech-to-speech server in OpenAI-compatible
 * realtime mode. Overridden per deployment via the `HUGGINGFACE_REALTIME_URL` env var or a
 * `params.Config.endpoint` value.
 */
export const HUGGINGFACE_DEFAULT_REALTIME_URL = 'ws://localhost:8000/v1/realtime';

/**
 * Default PCM16 sample rate (mono) for the audio plane, both directions. HuggingFace's speech-to-speech
 * cascade runs natively at **16 kHz** (fixed int16 mono), so that is the correct default here — the reused
 * PCM plane must capture AND play out at the endpoint's rate or audio is pitch/speed-distorted. Surfaced in
 * the client pact so a deployment whose pipeline runs at a different rate can override via `params.Config.sampleRate`.
 */
export const HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE = 16000;

/** Connect-window TTL for the one-time proxy ticket minted for a browser-direct session. */
export const HUGGINGFACE_PROXY_TICKET_TTL_SECONDS = 300;

/**
 * The HuggingFace provider profile — the per-provider knobs the shared {@link OpenAIRealtime}
 * protocol implementation runs with when driving a self-hosted speech-to-speech endpoint:
 *
 * - **No default input-transcription model**: the cascade's STT stage transcribes the user
 *   natively; a transcription block is only sent when the Config bag supplies
 *   `inputTranscriptionModel` (and only names a model if the compat layer supports selecting one).
 * - **Config deferred to `session.created`** — the endpoint validates `session.update` against the
 *   GA shape once the session exists; the readiness gate below rides the same frame.
 * - **`InitialContext` folds into the system prompt** under a "Prior context" heading — the compat
 *   protocol has no guaranteed history-seeding channel.
 * - **GA feature gates OFF**: self-hosted stacks lag the GA reasoning/MCP surface; feature keys in
 *   a shared co-agent config are scrubbed, never sent raw. Flipping a gate here is all it takes
 *   once the compat layer supports one.
 */
export const HUGGINGFACE_REALTIME_PROFILE: OpenAIRealtimeProfile = {
    providerKey: 'huggingface',
    inputTranscriptionModel: undefined,
    deferInitialConfigUntilSessionCreated: true,
    foldInitialContextIntoPrompt: true,
    supportsReasoningEffort: false,
    supportsParallelToolCalls: false,
    supportsMcpTools: false,
    supportsVoiceOutput: true,
    unexpectedCloseMessage: 'HuggingFace realtime session closed unexpectedly',
    // No turn-detection override — the cascade's own VAD stage governs turn taking; meeting-mode
    // create_response gating is not supported by the compat layer, so the flag only suppresses it
    // being sent raw (the bridge still gates spoken updates itself).
    buildTurnDetection: () => undefined,
    // Not consulted while supportsReasoningEffort is false; OpenAI's mapping is the natural default
    // for an OpenAI-compatible endpoint if the gate is ever flipped.
    mapEffortLevel: MapEffortLevelToOpenAIRealtime,
};

/**
 * Real-time, full-duplex driver for a **self-hosted HuggingFace speech-to-speech** server running in
 * OpenAI-Realtime-compatible mode. Registers as `HuggingFaceRealtime` and is resolved for `MJ: AI Models`
 * typed `Realtime` (API-key env alias: `AI_VENDOR_API_KEY__HuggingFaceRealtime` — optional; many
 * self-hosted endpoints are unauthenticated).
 *
 * **Topologies:**
 * - Server-bridged ({@link StartSession}): the driver opens a raw websocket to the internal endpoint
 *   through {@link RawRealtimeWebSocketConnection} and runs the SHARED OpenAI-protocol session over
 *   it. Unlike the base driver, `StartSession` resolves only after the session config has been
 *   applied (the endpoint's `session.created` → `session.update` handshake) so the runner never
 *   streams audio against an unconfigured model (obligation #7).
 * - Client-direct ({@link CreateClientSession}): the driver mints a one-time **proxy ticket** and returns
 *   a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL. The browser opens its socket to MJAPI's proxy,
 *   which tunnels transparently to the internal endpoint (injecting any auth server-side). The internal
 *   endpoint never reaches the browser and needs no browser-facing ingress.
 *
 * **No managed server object** and **no usage billing**: the entire session config (prompt, tools,
 * voice) is supplied per session; there is no token-usage meter, so `OnUsage` fires only if the
 * compat endpoint happens to report a `response.done` usage block.
 */
@RegisterClass(BaseRealtimeModel, 'HuggingFaceRealtime')
export class HuggingFaceRealtime extends OpenAIRealtime {
    /**
     * @param apiKey The upstream key, or a keyless sentinel (`none` / `self-hosted` / `local` / `n/a`)
     * for unauthenticated self-hosted endpoints. The inherited SDK client is never used for the
     * socket (the raw-WS adapter is), so the sentinel is harmless there too.
     */
    constructor(apiKey: string) {
        super(apiKey);
    }

    /** The HuggingFace knobs + GA feature gates the shared protocol implementation runs with. */
    protected override get Profile(): OpenAIRealtimeProfile {
        return HUGGINGFACE_REALTIME_PROFILE;
    }

    /**
     * The compat layer's TTS stage has no OpenAI-style selectable voice catalog, so the dev voice
     * picker gets none — overriding away the OpenAI voice list this class would otherwise inherit.
     * (A `voice` Config value still passes through to `audio.output.voice` for stacks that honor it.)
     */
    public override get SupportedVoices(): RealtimeVoiceOption[] {
        return [];
    }

    /**
     * Opens a server-bridged session over the raw-WS adapter and — unlike the base — resolves only
     * after the initial config has been APPLIED (the endpoint's `session.created` handshake), so the
     * model is configured before any audio streams. Transport death during startup rejects.
     */
    public override async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const connection = this.createRawConnection(this.resolveUpstreamUrl(params));
        const session = new HuggingFaceRealtimeSession(connection);
        session.SetConnectTimeTools(params.Tools ?? []);
        session.applyInitialConfig(params);
        await session.WaitForConfigApplied();
        return session;
    }

    /**
     * Builds the raw-WS connection for the upstream endpoint. Overridable seam for testing — unit
     * tests return an in-memory fake implementing {@link IOpenAIRealtimeConnection}, so no network.
     *
     * NOTE: the platform-global `WebSocket` cannot send an `Authorization` header; upstream auth is
     * enforced by the endpoint itself or injected server-side by the MJAPI realtime proxy
     * ({@link resolveUpstreamAuthHeader} feeds the proxy ticket, not this socket).
     *
     * @param url The resolved `ws(s)://…/v1/realtime` endpoint URL.
     * @returns The connection the shared session runs over.
     */
    protected createRawConnection(url: string): IOpenAIRealtimeConnection {
        return new RawRealtimeWebSocketConnection(url);
    }

    /** HuggingFace supports client-direct via MJAPI's realtime proxy. */
    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /**
     * Mints the client-direct config: a one-time **proxy ticket** pointing at the internal endpoint, and
     * the private-pact `SessionConfig` the same-keyed `'huggingface'` client driver consumes:
     * `{ session, sampleRate }`, where `session` is the OpenAI-Realtime `session.update` payload
     * (server-authored prompt/tools/voice) and `sampleRate` drives the client's PCM audio plane.
     * `EphemeralToken` is the browser-facing `wss://<mjapi-public>/realtime-proxy?ticket=…` URL.
     *
     * Fully overrides the base's SDK client-secret mint — a self-hosted endpoint has no
     * `/realtime/client_secrets` API, and the proxy keeps MJAPI the single ingress.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const ticket = RealtimeProxyRegistry.Instance.Issue({
            UpstreamUrl: this.resolveUpstreamUrl(params),
            UpstreamAuthHeader: this.resolveUpstreamAuthHeader(),
            TTLSeconds: HUGGINGFACE_PROXY_TICKET_TTL_SECONDS,
        });
        const proxyUrl = `${this.resolveProxyBaseWsUrl(params)}${REALTIME_PROXY_PATH}?ticket=${encodeURIComponent(ticket.ID)}`;
        return {
            Provider: 'huggingface',
            Model: params.Model,
            EphemeralToken: proxyUrl,
            ExpiresAt: ticket.ExpiresAt,
            SessionConfig: {
                session: HuggingFaceRealtime.BuildSessionObject(params),
                sampleRate: HuggingFaceRealtime.ResolveSampleRate(params),
            },
        };
    }

    // ── Session-object construction for the CLIENT pact ──
    // (The server-bridged path uses the shared base builder; this static builds the same-shaped
    // session object for the `{ session, sampleRate }` client pact the 'huggingface' client applies.)

    /**
     * Builds the OpenAI-Realtime `session` object from the Core params:
     * - `instructions`: the system prompt, with `InitialContext` folded in under a "Prior context"
     *   heading (the compat protocol has no guaranteed history-seeding channel).
     * - `tools`: the Core tool set mapped to the OpenAI `{ type: 'function', … }` schema.
     * - `audio.output.voice`: from `params.Config.voice`, when supplied.
     * - `audio.input.transcription.model`: from `params.Config.inputTranscriptionModel`, when supplied
     *   (the pipeline's STT stage transcribes the user natively; this only names a specific model if the
     *   compat layer supports selecting one).
     */
    public static BuildSessionObject(params: RealtimeSessionParams): JSONObject {
        const session: JSONObject = {
            // GA OpenAI-Realtime requires the session object to be discriminated by `type: 'realtime'`;
            // HuggingFace's `/v1/realtime` validates `session.update` against that GA shape and rejects a
            // session object without it ("Unknown or invalid event: session.update"), which would silently
            // drop the prompt AND the tools (breaking tool delegation). Verified against speech-to-speech v0.2.10.
            type: 'realtime',
            instructions: HuggingFaceRealtime.ComposeSystemPrompt(params.SystemPrompt, params.InitialContext),
        };
        const tools = params.Tools ?? [];
        if (tools.length > 0) {
            session['tools'] = tools.map((tool) => HuggingFaceRealtime.MapToolToFunction(tool));
        }
        const audio = HuggingFaceRealtime.BuildAudioConfig(params.Config ?? {});
        if (Object.keys(audio).length > 0) {
            session['audio'] = audio;
        }
        return session;
    }

    /** Assembles the OpenAI-Realtime `audio` sub-object (output voice + optional input transcription). */
    private static BuildAudioConfig(config: JSONObject): JSONObject {
        const audio: JSONObject = {};
        const voice = config['voice'];
        if (typeof voice === 'string' && voice.trim().length > 0) {
            audio['output'] = { voice: voice.trim() };
        }
        const itModel = config['inputTranscriptionModel'];
        if (typeof itModel === 'string' && itModel.trim().length > 0) {
            audio['input'] = { transcription: { model: itModel.trim() } };
        }
        return audio;
    }

    /** Folds optional prior context into the system prompt (no guaranteed history channel). */
    public static ComposeSystemPrompt(systemPrompt: string, initialContext?: string): string {
        const context = initialContext?.trim();
        return context ? `${systemPrompt}\n\n## Prior context\n${context}` : systemPrompt;
    }

    /** Maps a Core tool definition to an OpenAI-Realtime `function` tool schema. */
    public static MapToolToFunction(tool: RealtimeToolDefinition): JSONObject {
        return {
            type: 'function',
            name: tool.Name,
            description: tool.Description,
            parameters: tool.ParametersSchema,
        };
    }

    /**
     * Canonical, order-insensitive fingerprint of a tool set (same scheme as the AssemblyAI / Gemini /
     * ElevenLabs realtime drivers) — used to no-op identical live re-registrations.
     */
    public static ToolSetFingerprint(tools: RealtimeToolDefinition[]): string {
        return JSON.stringify(
            [...tools]
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map((t) => ({ Name: t.Name, Description: t.Description, ParametersSchema: t.ParametersSchema }))
        );
    }

    /** Resolves the PCM sample rate: `params.Config.sampleRate` override, else the HF-native 16 kHz default. */
    public static ResolveSampleRate(params: RealtimeSessionParams): number {
        const raw = params.Config?.['sampleRate'];
        return typeof raw === 'number' && raw > 0 ? raw : HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE;
    }

    // ── Endpoint / proxy-URL resolution seams (overridable for tests) ──

    /**
     * Resolves the internal upstream endpoint: `params.Config.endpoint` override → `HUGGINGFACE_REALTIME_URL`
     * env var → the local default. Self-hosted, so this is deployment config, not a hardcoded provider URL.
     */
    protected resolveUpstreamUrl(params: RealtimeSessionParams): string {
        const cfg = params.Config?.['endpoint'];
        if (typeof cfg === 'string' && cfg.trim().length > 0) {
            return cfg.trim();
        }
        const env = HuggingFaceRealtime.readEnv('HUGGINGFACE_REALTIME_URL');
        return env && env.trim().length > 0 ? env.trim() : HUGGINGFACE_DEFAULT_REALTIME_URL;
    }

    /**
     * Builds the upstream `Authorization` header from the API key, or `undefined` when the endpoint is
     * unauthenticated. Because the realtime resolver requires a *resolvable* API key for a model to be
     * selectable, a keyless self-hosted deployment sets a sentinel value (`none` / `self-hosted` / `local`
     * / `n/a`) for `AI_VENDOR_API_KEY__HuggingFaceRealtime` — treated here as "no auth" so no bogus header
     * is ever sent upstream (consumed by the MJAPI realtime proxy; the raw browser/Node socket cannot
     * carry headers at all).
     */
    protected resolveUpstreamAuthHeader(): string | undefined {
        const key = this.apiKey?.trim();
        if (!key || HuggingFaceRealtime.NO_AUTH_SENTINELS.has(key.toLowerCase())) {
            return undefined;
        }
        return `Bearer ${key}`;
    }

    /** API-key values that mean "this self-hosted endpoint has no auth" (see {@link resolveUpstreamAuthHeader}). */
    private static readonly NO_AUTH_SENTINELS: ReadonlySet<string> = new Set(['none', 'self-hosted', 'local', 'n/a']);

    /**
     * Resolves the browser-facing proxy ORIGIN as a `ws(s)://host[:port]` string. Precedence:
     * `params.Config.proxyBaseUrl` override → `MJAPI_PUBLIC_URL` → `GRAPHQL_BASE_URL` + `GRAPHQL_PORT`
     * (the same env vars MJAPI derives its public URL from). Any path on the source URL is dropped — only
     * the origin is used, and {@link REALTIME_PROXY_PATH} is appended by the caller.
     */
    protected resolveProxyBaseWsUrl(params: RealtimeSessionParams): string {
        const override = params.Config?.['proxyBaseUrl'];
        const source =
            (typeof override === 'string' && override.trim().length > 0 ? override.trim() : '') ||
            HuggingFaceRealtime.readEnv('MJAPI_PUBLIC_URL') ||
            `${HuggingFaceRealtime.readEnv('GRAPHQL_BASE_URL') ?? 'http://localhost'}:${HuggingFaceRealtime.readEnv('GRAPHQL_PORT') ?? '4000'}`;
        return HuggingFaceRealtime.HttpOriginToWs(source);
    }

    /** Converts an http(s) URL (or origin) into a `ws(s)://host[:port]` origin, dropping any path. */
    public static HttpOriginToWs(source: string): string {
        try {
            const url = new URL(source);
            const wsScheme = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss' : 'ws';
            return `${wsScheme}://${url.host}`;
        } catch {
            // Not a parseable absolute URL — best-effort scheme swap, strip any trailing slash.
            const trimmed = source.replace(/\/+$/, '');
            if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
                return trimmed;
            }
            return trimmed.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
        }
    }

    /** Reads a process env var (indirected so tests can stub it and non-Node runtimes don't throw). */
    protected static readEnv(name: string): string | undefined {
        const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
        return env ? env[name] : undefined;
    }
}

/**
 * Live realtime session for a self-hosted HuggingFace endpoint — the shared
 * {@link OpenAIRealtimeSession} protocol implementation bound to {@link HUGGINGFACE_REALTIME_PROFILE},
 * with three compat-endpoint accommodations layered on top:
 *
 * - **Beta event aliases**: older speech-to-speech builds emit pre-GA names
 *   (`response.audio.delta`, `response.audio_transcript.*`); these are translated to their GA
 *   equivalents before the shared dispatcher runs, so both generations of the stack work.
 * - **Response-active robustness**: the flag is set on the first audio delta (compat stacks don't
 *   always emit `response.created`) and released when a tool call yields the floor (deadlock
 *   guard — the stack may not emit `response.done` after a function call).
 * - **Tool-set fingerprinting**: {@link RegisterTools} no-ops an order-insensitively identical
 *   re-registration instead of re-declaring the same schemas on the live session.
 */
export class HuggingFaceRealtimeSession extends OpenAIRealtimeSession {
    /** Fingerprint of the currently-declared tool set; {@link RegisterTools} no-ops identical re-declares. */
    private currentToolsFingerprint = HuggingFaceRealtime.ToolSetFingerprint([]);

    /** Beta (pre-GA) event names older speech-to-speech builds emit, mapped to their GA equivalents. */
    private static readonly BETA_EVENT_ALIASES: Readonly<Record<string, string>> = {
        'response.audio.delta': 'response.output_audio.delta',
        'response.audio_transcript.delta': 'response.output_audio_transcript.delta',
        'response.audio_transcript.done': 'response.output_audio_transcript.done',
    };

    /**
     * @param connection The raw-WS adapter (or an in-memory fake in tests) speaking OpenAI frames.
     */
    constructor(connection: IOpenAIRealtimeConnection) {
        super(connection, HUGGINGFACE_REALTIME_PROFILE);
    }

    /** Records the tool set declared at connect time. Called by {@link HuggingFaceRealtime.StartSession}. */
    public SetConnectTimeTools(tools: RealtimeToolDefinition[]): void {
        this.currentToolsFingerprint = HuggingFaceRealtime.ToolSetFingerprint(tools);
    }

    /**
     * @inheritdoc — an identical set (order-insensitively) is a silent no-op per the idempotency
     * rule; a different set is applied to the live session through the shared implementation.
     */
    public override async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        const fingerprint = HuggingFaceRealtime.ToolSetFingerprint(tools);
        if (fingerprint === this.currentToolsFingerprint) {
            return;
        }
        this.currentToolsFingerprint = fingerprint;
        await super.RegisterTools(tools);
    }

    /**
     * Pre-translates beta event aliases to their GA names and applies the compat robustness tweaks
     * (see class docs) before delegating to the shared dispatcher.
     */
    protected override dispatch(event: RealtimeServerEvent): void {
        const alias = HuggingFaceRealtimeSession.BETA_EVENT_ALIASES[event.type as string];
        // Structured clone with the GA discriminator — the beta names are outside the SDK's typed
        // union, so the re-typed frame requires an explicit cast (narrow, alias-table-driven).
        const effective = alias ? ({ ...event, type: alias } as unknown as RealtimeServerEvent) : event;
        switch (effective.type) {
            case 'response.output_audio.delta':
                // Compat stacks don't always emit response.created — treat audio as proof of an
                // active response so barge-in gating still works.
                this.responseActive = true;
                break;
            case 'response.function_call_arguments.done':
                // The model yielded the floor pending the tool result; release the busy flag so an
                // interim spoken update can't deadlock if the stack skips response.done here.
                this.responseActive = false;
                break;
            default:
                break;
        }
        super.dispatch(effective);
    }
}
