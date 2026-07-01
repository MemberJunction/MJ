// HuggingFace speech-to-speech — self-hosted realtime (voice) driver.
//
// HuggingFace's open-source speech-to-speech stack (https://github.com/huggingface/speech-to-speech)
// is a cascaded VAD → STT → LLM → TTS pipeline that can expose an **OpenAI-Realtime-compatible**
// websocket endpoint (`/v1/realtime`). This driver treats that endpoint as a realtime model, so a
// self-hosted, private, cost-free voice stack sits side-by-side with the cloud realtime providers
// (OpenAI, Gemini, ElevenLabs, AssemblyAI) with no host changes.
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
    type RealtimeTranscript,
    type RealtimeToolCall,
    type RealtimeUsage,
    type RealtimeSessionError,
    type JSONObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * Default upstream endpoint for a locally-run HuggingFace speech-to-speech server in OpenAI-compatible
 * realtime mode. Overridden per deployment via the `HUGGINGFACE_REALTIME_URL` env var or a
 * `params.Config.endpoint` value.
 */
export const HUGGINGFACE_DEFAULT_REALTIME_URL = 'ws://localhost:8000/v1/realtime';

/**
 * Default PCM16 sample rate (mono) for the audio plane, both directions. OpenAI-Realtime clients
 * default to 24 kHz; the value is surfaced in the client pact so a deployment whose pipeline runs at a
 * different rate (HuggingFace's cascade is natively 16 kHz) can override via `params.Config.sampleRate`.
 */
export const HUGGINGFACE_DEFAULT_PCM_SAMPLE_RATE = 24000;

/** Connect-window TTL for the one-time proxy ticket minted for a browser-direct session. */
export const HUGGINGFACE_PROXY_TICKET_TTL_SECONDS = 300;

// ── Transport seam (typed subset — a fake in tests, a raw WebSocket in prod) ──

/** The minimal outbound surface of the upstream websocket the server-bridged session depends on. */
export interface HuggingFaceRealtimeSocket {
    /** Sends one JSON-serialized client frame. */
    send(data: string): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/** Arguments handed to {@link HuggingFaceRealtime.connectSocket}: the URL, optional auth, and callbacks. */
export interface HuggingFaceConnectArgs {
    /** The upstream `ws(s)://…/v1/realtime` URL. */
    Url: string;
    /** Optional `Authorization` header value for the upstream socket (self-hosted endpoints are often open). */
    AuthHeader?: string;
    /** Invoked with each parsed inbound frame. */
    OnMessage: (event: HuggingFaceServerEvent) => void;
    /** Invoked on a websocket-level error (fatal — the session is unusable). */
    OnError: (message: string) => void;
    /** Invoked when the websocket closes. */
    OnClose: (code?: number, reason?: string) => void;
}

/** Structural subset of the global `WebSocket` constructor used by the production connect seam. */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null;
    send(data: string): void;
    close(): void;
}

// ── Inbound OpenAI-Realtime wire events (only the fields this driver reads are typed) ──

/** A parsed inbound frame from the OpenAI-Realtime-compatible endpoint (discriminated by `type`). */
export interface HuggingFaceServerEvent {
    type?: string;
    /** `response.output_audio.delta` (GA) / `response.audio.delta` (beta) — one base64 PCM16 chunk. */
    delta?: string;
    /** `*_audio_transcript.done` — the finalized assistant transcript text. */
    transcript?: string;
    /** `response.function_call_arguments.done` — the tool name. */
    name?: string;
    /** `response.function_call_arguments.done` — correlation id the result must echo. */
    call_id?: string;
    /** `response.function_call_arguments.done` — JSON-encoded tool arguments (a STRING per the wire). */
    arguments?: string;
    /** `response.done` — usage payload for the completed response. */
    response?: { usage?: { input_tokens?: number; output_tokens?: number } };
    /** `error` — the provider error payload. */
    error?: { message?: string; code?: string };
}

/**
 * Real-time, full-duplex driver for a **self-hosted HuggingFace speech-to-speech** server running in
 * OpenAI-Realtime-compatible mode. Registers as `HuggingFaceRealtime` and is resolved for `MJ: AI Models`
 * typed `Realtime` (API-key env alias: `AI_VENDOR_API_KEY__HuggingFaceRealtime` — optional; many
 * self-hosted endpoints are unauthenticated).
 *
 * **Topologies:**
 * - Server-bridged ({@link StartSession}): the driver opens the upstream websocket itself (directly to
 *   the internal endpoint) and translates the OpenAI-Realtime wire protocol into the Core
 *   {@link IRealtimeSession} contract.
 * - Client-direct ({@link CreateClientSession}): the driver mints a one-time **proxy ticket** and returns
 *   a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL. The browser opens its socket to MJAPI's proxy,
 *   which tunnels transparently to the internal endpoint (injecting any auth server-side). The internal
 *   endpoint never reaches the browser and needs no browser-facing ingress.
 *
 * **No managed server object** and **no usage billing**: like AssemblyAI, the entire session config
 * (prompt, tools, voice) is supplied per session; unlike the cloud providers there is no token-usage
 * meter, so `OnUsage` fires only if the compat endpoint happens to report a `response.done` usage block.
 */
@RegisterClass(BaseRealtimeModel, 'HuggingFaceRealtime')
export class HuggingFaceRealtime extends BaseRealtimeModel {
    /**
     * Opens a server-bridged session: connects the upstream websocket, and (once the endpoint's
     * `session.created` confirms the socket is live) applies the full session config via `session.update`
     * before resolving — so the runner never streams audio against an unconfigured model (obligation #7).
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const sessionObject = HuggingFaceRealtime.BuildSessionObject(params);
        const session = new HuggingFaceRealtimeSession(sessionObject);
        session.SetConnectTimeTools(params.Tools ?? []);
        const socket = await this.connectSocket({
            Url: this.resolveUpstreamUrl(params),
            AuthHeader: this.resolveUpstreamAuthHeader(),
            OnMessage: (event) => session.HandleServerEvent(event),
            OnError: (message) => session.HandleTransportError(message),
            OnClose: (code, reason) => session.HandleTransportClose(code, reason),
        });
        session.AttachSocket(socket);
        await session.WaitForReady();
        return session;
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

    // ── Session-object construction (the OpenAI-Realtime `session.update` payload) ──

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

    /** Resolves the PCM sample rate: `params.Config.sampleRate` override, else the 24 kHz default. */
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
     * is ever sent upstream.
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

    // ── Overridable transport seam (tests inject a fake — no network) ──

    /**
     * Transport seam for the server-bridged upstream websocket. Production speaks the OpenAI-Realtime
     * protocol over the platform-global `WebSocket` (browsers / Node 22+). Resolves once the socket is
     * OPEN; unit tests override this to return an in-memory fake.
     */
    protected async connectSocket(args: HuggingFaceConnectArgs): Promise<HuggingFaceRealtimeSocket> {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('HuggingFaceRealtime.StartSession requires a global WebSocket (Node 22+ or a browser runtime).');
        }
        return new Promise<HuggingFaceRealtimeSocket>((resolve, reject) => {
            const ws = new WS(args.Url);
            let opened = false;
            ws.onopen = () => {
                opened = true;
                resolve({ send: (data) => ws.send(data), close: () => ws.close() });
            };
            ws.onmessage = (event) => {
                try {
                    args.OnMessage(JSON.parse(String(event.data)) as HuggingFaceServerEvent);
                } catch {
                    /* non-JSON frame — ignore */
                }
            };
            ws.onerror = () => {
                args.OnError('HuggingFace realtime websocket error');
                if (!opened) {
                    reject(new Error('HuggingFace realtime websocket failed to open'));
                }
            };
            ws.onclose = (event) => {
                args.OnClose(event.code, event.reason);
                if (!opened) {
                    reject(new Error('HuggingFace realtime websocket closed before opening'));
                }
            };
        });
    }
}

/**
 * Concrete {@link IRealtimeSession} backed by a raw OpenAI-Realtime-compatible websocket (the
 * server-bridged topology). Owns the inbound translation (OpenAI wire events → Core events) and the
 * outbound translation (Core calls → OpenAI wire frames). Created by {@link HuggingFaceRealtime.StartSession};
 * never instantiated directly by consumers.
 *
 * Provider-behavior notes:
 * - **Readiness is `session.created`** — the first frame once the socket is live and the session exists.
 *   The driver applies the session config (`session.update`) at that point and only then resolves, so the
 *   model is configured before any audio streams.
 * - **`SendContextNote` is NATIVE** — a `system`-role `conversation.item.create` with no `response.create`,
 *   so the note lands without forcing (or interrupting) a spoken reply.
 * - **`RequestSpokenUpdate` is NATIVE** — a `response.create` with per-response instructions; SKIPPED while
 *   a response is in flight (the API rejects overlaps; interim updates are disposable by contract).
 * - **Usage is best-effort** — emitted only if the compat endpoint reports a `response.done` usage block.
 */
export class HuggingFaceRealtimeSession implements IRealtimeSession {
    private socket: HuggingFaceRealtimeSocket | null = null;

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private usageHandler: ((u: RealtimeUsage) => void) | null = null;
    private errorHandler: ((error: RealtimeSessionError) => void) | null = null;
    private closeHandler: (() => void) | null = null;
    /** True once Close() ran — an expected close must not surface as a fatal error. */
    private closedByConsumer = false;

    /** Resolves when `session.created` arrives (config then applied); rejects on transport death. */
    private readyPromise: Promise<void>;
    private resolveReady: (() => void) | null = null;
    private rejectReady: ((error: Error) => void) | null = null;
    private readyReceived = false;

    /** The OpenAI-Realtime `session` object applied via `session.update` on `session.created`. */
    private sessionObject: JSONObject;

    /** Whether a model response is currently in flight (`response.created` set, `response.done` clears). */
    private responseActive = false;

    /** Fingerprint of the currently-declared tool set; {@link RegisterTools} no-ops identical re-declares. */
    private currentToolsFingerprint = HuggingFaceRealtime.ToolSetFingerprint([]);

    constructor(sessionObject: JSONObject) {
        this.sessionObject = sessionObject;
        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        // Always consumed by WaitForReady before any rejection can fire, but guard unhandled-rejection noise.
        this.readyPromise.catch(() => undefined);
    }

    /** Binds the underlying socket. Called by the driver once the websocket is open. */
    public AttachSocket(socket: HuggingFaceRealtimeSocket): void {
        this.socket = socket;
    }

    /** Records the tool set declared at connect time. Called by {@link HuggingFaceRealtime.StartSession}. */
    public SetConnectTimeTools(tools: RealtimeToolDefinition[]): void {
        this.currentToolsFingerprint = HuggingFaceRealtime.ToolSetFingerprint(tools);
    }

    /** Resolves once `session.created` arrives and the config is applied; rejects if transport dies first. */
    public WaitForReady(): Promise<void> {
        return this.readyPromise;
    }

    /** @inheritdoc — streams one PCM16 frame as a base64 `input_audio_buffer.append` chunk. */
    public SendInput(chunk: ArrayBuffer): void {
        this.sendFrame({ type: 'input_audio_buffer.append', audio: HuggingFaceRealtimeSession.ArrayBufferToBase64(chunk) });
    }

    /**
     * @inheritdoc — `tools` is a mutable `session.update` field; an identical set (order-insensitively)
     * is a silent no-op per the idempotency rule, a different set is applied to the live session.
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        const fingerprint = HuggingFaceRealtime.ToolSetFingerprint(tools);
        if (fingerprint === this.currentToolsFingerprint) {
            return;
        }
        this.currentToolsFingerprint = fingerprint;
        this.sendFrame({
            type: 'session.update',
            session: { tools: tools.map((tool) => HuggingFaceRealtime.MapToolToFunction(tool)) },
        });
    }

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

    /** @inheritdoc — best-effort; fires only if the compat endpoint reports a `response.done` usage block. */
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

    /**
     * @inheritdoc — completes the tool-call loop: a `function_call_output` conversation item carrying the
     * result, then a `response.create` so the model continues the turn (flag set eagerly so an interim
     * spoken update can't collide before the result is voiced).
     */
    public async SendToolResult(callID: string, output: string): Promise<void> {
        this.sendFrame({
            type: 'conversation.item.create',
            item: { type: 'function_call_output', call_id: callID, output },
        });
        this.sendFrame({ type: 'response.create' });
        this.responseActive = true;
    }

    /**
     * @inheritdoc — NATIVE: a `system`-role conversation item the model can draw on next time it speaks,
     * with no `response.create`, so it never forces or interrupts a spoken reply.
     */
    public SendContextNote(text: string): void {
        this.sendFrame({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
        });
    }

    /**
     * @inheritdoc — NATIVE: one short spoken update via `response.create` with per-response instructions.
     * SKIPPED while a response is active (the API rejects overlapping responses; interim updates are
     * disposable by contract). Returns whether a `response.create` was issued.
     */
    public RequestSpokenUpdate(instructions: string): boolean {
        if (this.responseActive) {
            return false;
        }
        this.responseActive = true;
        const hasInstructions = typeof instructions === 'string' && instructions.trim().length > 0;
        this.sendFrame(hasInstructions ? { type: 'response.create', response: { instructions } } : { type: 'response.create' });
        return true;
    }

    /** @inheritdoc — closes the upstream socket; a consumer close is silent (never a "fatal" error). */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        this.failReadyWait('session closed by consumer before it was ready');
        this.socket?.close();
        this.socket = null;
        this.clearHandlers();
    }

    /** Surfaces a websocket-level failure as a FATAL session error (obligation #6). */
    public HandleTransportError(message: string): void {
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /** Surfaces an UNEXPECTED socket close as a fatal error (a consumer-initiated close is silent). */
    public HandleTransportClose(code?: number, reason?: string): void {
        if (this.closedByConsumer) {
            return;
        }
        const detail = [code != null ? `code ${code}` : null, reason || null].filter(Boolean).join(' — ');
        const message = `HuggingFace realtime session closed unexpectedly${detail ? ` (${detail})` : ''}`;
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
        this.closeHandler?.();
    }

    /**
     * Entry point for an inbound websocket frame. Multiplexes on `type` (OpenAI-Realtime wire) to focused
     * per-concern handlers. Accepts both GA and beta transcript/audio event names.
     */
    public HandleServerEvent(event: HuggingFaceServerEvent): void {
        switch (event.type) {
            case 'session.created':
                this.handleSessionCreated();
                break;
            case 'response.output_audio.delta':
            case 'response.audio.delta':
                this.handleAudioDelta(event.delta);
                break;
            case 'response.output_audio_transcript.delta':
            case 'response.audio_transcript.delta':
                this.emitTranscript('assistant', event.delta, false);
                break;
            case 'response.output_audio_transcript.done':
            case 'response.audio_transcript.done':
                this.emitTranscript('assistant', event.transcript, true);
                break;
            case 'conversation.item.input_audio_transcription.delta':
                this.emitTranscript('user', event.delta, false);
                break;
            case 'conversation.item.input_audio_transcription.completed':
                this.emitTranscript('user', event.transcript, true);
                break;
            case 'response.function_call_arguments.done':
                this.handleToolCall(event);
                break;
            case 'input_audio_buffer.speech_started':
                this.handleSpeechStarted();
                break;
            case 'response.created':
                this.responseActive = true;
                break;
            case 'response.done':
                this.handleResponseDone(event.response?.usage);
                break;
            case 'error':
                this.errorHandler?.({ Message: event.error?.message ?? 'HuggingFace realtime error', Code: event.error?.code, Fatal: false });
                break;
            default:
                break; // unknown / future frame types are ignored
        }
    }

    /** On `session.created`: apply the session config, then release the readiness gate (obligation #7). */
    private handleSessionCreated(): void {
        if (this.readyReceived) {
            return; // idempotent — a re-emitted session.created can't double-apply
        }
        this.sendFrame({ type: 'session.update', session: this.sessionObject });
        this.readyReceived = true;
        const resolve = this.resolveReady;
        this.resolveReady = null;
        this.rejectReady = null;
        resolve?.();
    }

    /** Decodes one base64 audio delta and forwards it as a raw `ArrayBuffer`. */
    private handleAudioDelta(deltaBase64: string | undefined): void {
        if (!deltaBase64) {
            return;
        }
        this.responseActive = true;
        this.outputHandler?.(HuggingFaceRealtimeSession.Base64ToArrayBuffer(deltaBase64));
    }

    /**
     * True barge-in ONLY: the user started speaking over active model output. A `speech_started` while the
     * model is idle is a normal turn, excluded by the {@link OnInterruption} contract — so it is gated on
     * {@link responseActive} (the server-bridged proxy for "model output in flight").
     */
    private handleSpeechStarted(): void {
        if (this.responseActive) {
            this.interruptionHandler?.();
        }
    }

    /**
     * Surfaces a completed function call. The model has yielded the floor pending the result, so the busy
     * flag is cleared (deadlock guard — obligation #2). `arguments` is already a JSON string on the wire.
     */
    private handleToolCall(event: HuggingFaceServerEvent): void {
        this.responseActive = false;
        this.toolCallHandler?.({
            CallID: event.call_id ?? '',
            ToolName: event.name ?? '',
            Arguments: typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments ?? {}),
        });
    }

    /** Response boundary: releases the busy flag and emits usage when the endpoint reports it. */
    private handleResponseDone(usage: { input_tokens?: number; output_tokens?: number } | undefined): void {
        this.responseActive = false;
        if (usage) {
            this.usageHandler?.({ InputTokens: usage.input_tokens ?? 0, OutputTokens: usage.output_tokens ?? 0 });
        }
    }

    /** Emits a transcript event, skipping empty text. */
    private emitTranscript(role: 'user' | 'assistant', text: string | undefined, isFinal: boolean): void {
        if (!this.transcriptHandler || !text || text.trim().length === 0) {
            return;
        }
        this.transcriptHandler({ Role: role, Text: text, IsFinal: isFinal });
    }

    /** JSON-serializes and sends one client frame (throws if the socket was never attached). */
    private sendFrame(frame: JSONObject): void {
        if (!this.socket) {
            throw new Error('HuggingFace realtime session is not open (no socket attached or it was closed).');
        }
        this.socket.send(JSON.stringify(frame));
    }

    /** Rejects a still-pending ready wait (transport death / consumer close during startup). */
    private failReadyWait(message: string): void {
        if (!this.readyReceived && this.rejectReady) {
            const reject = this.rejectReady;
            this.rejectReady = null;
            this.resolveReady = null;
            this.readyReceived = true; // nothing further can resolve/reject it
            reject(new Error(message));
        }
    }

    /** Drops all registered handlers so a closed session can't fire stale callbacks. */
    private clearHandlers(): void {
        this.outputHandler = null;
        this.transcriptHandler = null;
        this.toolCallHandler = null;
        this.interruptionHandler = null;
        this.usageHandler = null;
        this.responseActive = false;
    }

    /** Base64-encodes a raw audio buffer for the wire. */
    private static ArrayBufferToBase64(chunk: ArrayBuffer): string {
        return Buffer.from(new Uint8Array(chunk)).toString('base64');
    }

    /** Decodes a base64 audio payload into a freshly-allocated `ArrayBuffer`. */
    private static Base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}
