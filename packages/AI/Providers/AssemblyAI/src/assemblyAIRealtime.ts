// AssemblyAI Voice Agent API — realtime (voice) driver.

// MemberJunction AI core contract
import {
    BaseRealtimeModel,
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

/** The single Voice Agent websocket endpoint (auth rides as a `?token=` query parameter). */
export const ASSEMBLYAI_AGENT_WS_URL = 'wss://agents.assemblyai.com/v1/ws';

/** REST endpoint that mints one-time, short-lived client tokens for browser-direct sessions. */
export const ASSEMBLYAI_TOKEN_URL = 'https://agents.assemblyai.com/v1/token';

/**
 * Lifetime requested for the one-time client token minted by {@link AssemblyAIRealtime.CreateClientSession}.
 * The token is single-use: it authenticates ONE websocket open within this window; an
 * already-open session continues past it.
 */
export const ASSEMBLYAI_TOKEN_TTL_SECONDS = 300;

/**
 * The Voice Agent wire format: 16-bit signed little-endian PCM, mono, 24 kHz, base64-encoded,
 * in BOTH directions (`input.audio` up, `reply.audio` down).
 */
export const ASSEMBLYAI_PCM_SAMPLE_RATE = 24000;

// ── Wire-event shapes (snake_case, exactly as the Voice Agent websocket emits/accepts) ──
// The protocol is a FLAT envelope multiplexed on `type` (unlike ElevenLabs' nested
// per-type sub-objects), so one interface carries every inbound field.

/** A parsed inbound websocket frame. The Voice Agent protocol multiplexes on `type`. */
export interface AssemblyAIServerEvent {
    type?: string;
    /** `session.ready` — the provider-assigned session id (also used by `session.resume`). */
    session_id?: string;
    /** `transcript.user[.delta]` / `transcript.agent` — the transcribed text. */
    text?: string;
    /** `transcript.*` — provider conversation-item id. */
    item_id?: string;
    /** `reply.started` / `transcript.agent` — id of the reply the frame belongs to. */
    reply_id?: string;
    /** `transcript.agent` — true when the turn was cut off by a barge-in. */
    interrupted?: boolean;
    /** `reply.audio` — one base64 PCM16 chunk of the agent's spoken output. */
    data?: string;
    /** `reply.done` — `'interrupted'` when the user barged in mid-reply; absent otherwise. */
    status?: string;
    /** `tool.call` — correlation id the result must echo. */
    call_id?: string;
    /** `tool.call` — the tool name. */
    name?: string;
    /** `tool.call` — the arguments, ALREADY PARSED into an object by the provider. */
    arguments?: JSONObject;
    /** `session.error` — provider error code. */
    code?: string;
    /** `session.error` — human-readable error message. */
    message?: string;
    /** `session.error` — the offending parameter, when applicable. */
    param?: string;
    /** `session.updated` — echo of the applied session object. */
    session?: JSONObject;
    /** `session.ended` — total billable session seconds. */
    session_duration_seconds?: number;
}

// ── Transport / REST seams (typed subsets — fakes in tests, raw WS / fetch in prod) ──

/**
 * The minimal outbound surface of the agent websocket the session depends on. Declaring the
 * seam as an interface lets unit tests inject a fully in-memory fake that captures outbound
 * frames and drives {@link AssemblyAIRealtimeSession.HandleServerEvent} with provider-shaped
 * events — no websocket, no network.
 */
export interface AssemblyAIRealtimeSocket {
    /** Sends one JSON-serialized client frame. */
    send(data: string): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Arguments handed to {@link AssemblyAIRealtime.connectAgentSocket}: the authenticated URL
 * plus the lifecycle callbacks, so the seam owns the entire websocket dance and tests
 * substitute it wholesale.
 */
export interface AssemblyAIConnectArgs {
    /** The full `wss://…?token=…` URL (API key for server-bridged, temp token for client-direct). */
    Url: string;
    /** Invoked with each parsed inbound frame. */
    OnMessage: (event: AssemblyAIServerEvent) => void;
    /** Invoked on a websocket-level error (fatal — the session is unusable). */
    OnError: (message: string) => void;
    /** Invoked when the websocket closes. */
    OnClose: (code?: number, reason?: string) => void;
}

/**
 * Structural subset of the global `WebSocket` constructor used by the production
 * {@link AssemblyAIRealtime.connectAgentSocket} seam (global in browsers and Node 22+;
 * typed structurally so the package compiles without DOM lib types).
 */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null;
    send(data: string): void;
    close(): void;
}

/** Structural subset of the global `fetch` used by the token-mint seam. */
type FetchLike = (
    url: string,
    init: { method: string; headers: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Real-time, full-duplex driver for the **AssemblyAI Voice Agent API** (launched April 2026),
 * implementing the Core {@link BaseRealtimeModel} primitive. Registers as `AssemblyAIRealtime`
 * and is resolved for `MJ: AI Models` typed `Realtime` (API-key env alias:
 * `AI_VENDOR_API_KEY__AssemblyAIRealtime`).
 *
 * **What the provider is:** a single-websocket speech-to-speech stack — Universal-3 Pro
 * streaming ASR, server-side turn detection / barge-in, LLM reasoning, JSON-Schema tool
 * calling, and conversational TTS — billed flat per session-hour. Unlike ElevenLabs there is
 * no server-side agent object to manage: the ENTIRE session config (prompt, tools, voice,
 * turn detection) is supplied per-session via the first `session.update` frame, so MJ's
 * prompt/tool authority is native here, with no managed-agent ensure flow.
 *
 * **Model resolution:** the Voice Agent API exposes ONE endpoint and no model selection;
 * `params.Model` is carried through to {@link ClientRealtimeSessionConfig.Model} for
 * bookkeeping but plays no wire role.
 *
 * **Topologies:**
 * - Server-bridged ({@link StartSession}): the driver opens the websocket itself
 *   (`?token=<api key>`), sends the session config, and resolves only after `session.ready`.
 * - Client-direct ({@link CreateClientSession}): the driver mints a ONE-TIME, short-lived
 *   client token (`GET /v1/token`) — the browser opens its own socket with it (no API key
 *   ever leaves the server) and applies the server-built session object from the
 *   `SessionConfig` pact.
 *
 * **No usage events:** billing is a flat hourly session rate; the websocket reports no token
 * usage, so sessions never emit {@link IRealtimeSession.OnUsage}. (The terminal
 * `session.ended` frame carries duration seconds, but by then the consumer has typically
 * closed — duration accounting lives in the provider dashboard.)
 */
@RegisterClass(BaseRealtimeModel, 'AssemblyAIRealtime')
export class AssemblyAIRealtime extends BaseRealtimeModel {
    /**
     * Opens a server-bridged session: connects the agent websocket authenticated with the
     * API key, sends the full session config as the FIRST frame (`session.update` — prompt,
     * tools, voice, turn detection), and resolves only once the server's `session.ready`
     * confirms the config is applied (driver obligation #7 — "ready only after the config is
     * applied"). Mic frames sent before that would be dropped by the provider, and
     * `StartSession` not resolving until ready makes that unrepresentable for consumers.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const session = new AssemblyAIRealtimeSession(AssemblyAIRealtime.BuildSessionObject(params));
        session.SetConnectTimeTools(params.Tools ?? []);
        const socket = await this.connectAgentSocket({
            Url: `${ASSEMBLYAI_AGENT_WS_URL}?token=${encodeURIComponent(this.apiKey)}`,
            OnMessage: (event) => session.HandleServerEvent(event),
            OnError: (message) => session.HandleTransportError(message),
            OnClose: (code, reason) => session.HandleTransportClose(code, reason),
        });
        session.AttachSocket(socket);
        session.SendSessionUpdate();
        await session.WaitForReady();
        return session;
    }

    /**
     * AssemblyAI supports the client-direct topology natively: a one-time temp token minted
     * server-side authenticates the browser's own websocket.
     */
    public override get SupportsClientDirect(): boolean {
        return true;
    }

    /**
     * Mints the client-direct config: a ONE-TIME client token (connect window
     * {@link ASSEMBLYAI_TOKEN_TTL_SECONDS}s) plus the **private pact** `SessionConfig` the
     * same-keyed `'assemblyai'` client driver consumes: `{ session, config }`, where
     * `session` is the wire-shaped `session.update` payload (server-authored system prompt,
     * tools, voice, turn detection) and `config` passes `params.Config` through opaquely.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const token = await this.mintClientToken(ASSEMBLYAI_TOKEN_TTL_SECONDS);
        return {
            Provider: 'assemblyai',
            Model: params.Model,
            EphemeralToken: token,
            ExpiresAt: new Date(Date.now() + ASSEMBLYAI_TOKEN_TTL_SECONDS * 1000).toISOString(),
            SessionConfig: {
                session: AssemblyAIRealtime.BuildSessionObject(params),
                config: params.Config ?? {},
            },
        };
    }

    // ── Session-object construction (the wire-shaped `session.update` payload) ──

    /**
     * Builds the `session` object for the `session.update` frame from the Core params:
     * - `system_prompt`: the session system prompt, with `InitialContext` folded in under a
     *   "Prior context" heading — the protocol has no history-seeding channel, so prior
     *   conversation context rides the prompt.
     * - `tools`: the Core tool set mapped to the provider's `{ type: 'function', … }` schema.
     * - Recognized `params.Config` keys pass through to their wire slots: `voice` →
     *   `output.voice`, `greeting` (spoken on connect; omitted = no auto-greeting),
     *   `turn_detection` → `input.turn_detection`, `keyterms` → `input.keyterms`.
     */
    public static BuildSessionObject(params: RealtimeSessionParams): JSONObject {
        const session: JSONObject = {
            system_prompt: AssemblyAIRealtime.ComposeSystemPrompt(params.SystemPrompt, params.InitialContext),
        };
        const tools = params.Tools ?? [];
        if (tools.length > 0) {
            session['tools'] = tools.map((tool) => AssemblyAIRealtime.MapToolToFunction(tool));
        }
        const config = params.Config ?? {};
        if (typeof config['greeting'] === 'string') {
            session['greeting'] = config['greeting'];
        }
        if (typeof config['voice'] === 'string') {
            session['output'] = { voice: config['voice'] };
        }
        const input: JSONObject = {};
        if (config['turn_detection'] !== null && typeof config['turn_detection'] === 'object' && !Array.isArray(config['turn_detection'])) {
            input['turn_detection'] = config['turn_detection'];
        }
        if (Array.isArray(config['keyterms'])) {
            input['keyterms'] = config['keyterms'];
        }
        if (Object.keys(input).length > 0) {
            session['input'] = input;
        }
        return session;
    }

    /** Folds optional prior context into the system prompt (no history channel exists). */
    public static ComposeSystemPrompt(systemPrompt: string, initialContext?: string): string {
        const context = initialContext?.trim();
        return context ? `${systemPrompt}\n\n## Prior context\n${context}` : systemPrompt;
    }

    /** Maps a Core tool definition up to a Voice Agent `function` tool schema. */
    public static MapToolToFunction(tool: RealtimeToolDefinition): JSONObject {
        return {
            type: 'function',
            name: tool.Name,
            description: tool.Description,
            // The Core ParametersSchema is a JSON-schema object — the same shape the Voice
            // Agent's `tools[].parameters` slot accepts.
            parameters: tool.ParametersSchema,
        };
    }

    /**
     * Canonical, order-insensitive fingerprint of a tool set (same scheme as the Gemini and
     * ElevenLabs realtime drivers) — used by {@link AssemblyAIRealtimeSession.RegisterTools}
     * to no-op identical re-registrations.
     */
    public static ToolSetFingerprint(tools: RealtimeToolDefinition[]): string {
        return JSON.stringify(
            [...tools]
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map((t) => ({ Name: t.Name, Description: t.Description, ParametersSchema: t.ParametersSchema }))
        );
    }

    // ── Overridable REST / transport seams (tests inject fakes — no network) ──

    /**
     * REST seam: mints a ONE-TIME client token for a browser-direct session
     * (`GET /v1/token?expires_in_seconds=…` with `Authorization: Bearer <api key>`).
     */
    protected async mintClientToken(expiresInSeconds: number): Promise<string> {
        const fetchFn = (globalThis as unknown as { fetch?: FetchLike }).fetch;
        if (!fetchFn) {
            throw new Error('AssemblyAIRealtime.CreateClientSession requires a global fetch (Node 18+ or a browser runtime).');
        }
        const response = await fetchFn(`${ASSEMBLYAI_TOKEN_URL}?expires_in_seconds=${expiresInSeconds}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!response.ok) {
            throw new Error(`AssemblyAI token mint failed with HTTP ${response.status}`);
        }
        const body = (await response.json()) as { token?: string };
        if (!body.token) {
            throw new Error('AssemblyAI token mint returned no token');
        }
        return body.token;
    }

    /**
     * Transport seam for the server-bridged agent websocket. Production speaks the raw Voice
     * Agent protocol over the platform-global `WebSocket` (browsers / Node 22+). Resolves
     * once the socket is OPEN; unit tests override this to return an in-memory fake.
     */
    protected async connectAgentSocket(args: AssemblyAIConnectArgs): Promise<AssemblyAIRealtimeSocket> {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('AssemblyAIRealtime.StartSession requires a global WebSocket (Node 22+ or a browser runtime).');
        }
        return new Promise<AssemblyAIRealtimeSocket>((resolve, reject) => {
            const ws = new WS(args.Url);
            let opened = false;
            ws.onopen = () => {
                opened = true;
                resolve({ send: (data) => ws.send(data), close: () => ws.close() });
            };
            ws.onmessage = (event) => {
                try {
                    args.OnMessage(JSON.parse(String(event.data)) as AssemblyAIServerEvent);
                } catch {
                    /* non-JSON frame — ignore */
                }
            };
            ws.onerror = () => {
                args.OnError('AssemblyAI agent websocket error');
                if (!opened) {
                    reject(new Error('AssemblyAI agent websocket failed to open'));
                }
            };
            ws.onclose = (event) => {
                args.OnClose(event.code, event.reason);
                if (!opened) {
                    reject(new Error('AssemblyAI agent websocket closed before opening'));
                }
            };
        });
    }
}

/**
 * Concrete {@link IRealtimeSession} backed by a raw AssemblyAI Voice Agent websocket.
 *
 * Owns the inbound translation (flat snake_case wire events → Core events) and the outbound
 * translation (Core calls → wire frames). Created by {@link AssemblyAIRealtime.StartSession};
 * never instantiated directly by consumers.
 *
 * Provider-behavior notes (the contract deltas a consumer should know):
 * - **User transcripts have DELTAS, agent transcripts are FINAL-only.** The socket emits
 *   `transcript.user.delta` fragments followed by a final `transcript.user`; agent turns
 *   arrive as one final `transcript.agent` (carrying `interrupted: true` after a barge-in,
 *   in which case the text reflects the truncated turn — already the authoritative record,
 *   no ElevenLabs-style correction event follows).
 * - **Interruption signal is `reply.done` with `status: 'interrupted'`** — the provider owns
 *   turn detection AND tracks its own audio emission, so this is the authoritative "user
 *   speech cut off active model output" signal (raw `input.speech.started` fires on EVERY
 *   user utterance and is NOT an interruption per the base contract; the server bridge also
 *   cannot see host-side playback, so it defers to the provider's verdict).
 * - **No usage events** — see the driver-level note.
 * - **{@link RequestSpokenUpdate} is NATIVE** (`reply.create` carries per-response
 *   instructions — no ElevenLabs-style user-turn emulation, no fidelity caveat), queued
 *   behind any in-flight response per the contract's collision rule.
 * - **{@link SendContextNote} is EMULATED via the mutable `system_prompt`**: the protocol
 *   has no non-interrupting context channel, but `session.update` may rewrite the prompt
 *   mid-session without triggering generation — notes are appended under a "Background
 *   updates" heading and the full prompt is re-sent. Never interrupts; the model sees the
 *   notes the next time it speaks.
 * - **{@link RegisterTools} re-declares NATIVELY**: `tools` is a mutable `session.update`
 *   field, so (unlike ElevenLabs) a genuinely different post-start set is applied to the
 *   live session; an identical set is a silent no-op per the idempotency rule.
 */
export class AssemblyAIRealtimeSession implements IRealtimeSession {
    private socket: AssemblyAIRealtimeSocket | null = null;

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private errorHandler: ((error: RealtimeSessionError) => void) | null = null;
    /** True once Close() ran — an expected close must not surface as a fatal error. */
    private closedByConsumer = false;

    /** Resolves when `session.ready` arrives; rejects on transport death. */
    private readyPromise: Promise<void>;
    private resolveReady: (() => void) | null = null;
    private rejectReady: ((error: Error) => void) | null = null;
    private readyReceived = false;

    /** The wire-shaped `session` object sent in the initial `session.update`. */
    private sessionObject: JSONObject;
    /** The base system prompt (with InitialContext folded in) — context notes append to it. */
    private basePrompt: string;
    /** Accumulated {@link SendContextNote} texts, re-sent with the full prompt each time. */
    private contextNotes: string[] = [];

    /**
     * Whether an agent reply is currently in flight (`reply.started` / first `reply.audio`
     * sets it; `reply.done` clears it; a `tool.call` clears it WITHOUT draining — deadlock
     * guard). Consumed by {@link enqueueOrRun} so the native {@link RequestSpokenUpdate}
     * never triggers a `reply.create` into — and thereby collides with — an active reply.
     */
    private responseActive = false;

    /** Sends deferred while a reply is in flight; drained in order at the next boundary. */
    private queuedSends: Array<() => void> = [];

    /**
     * Fingerprint of the tool set currently declared on the session;
     * {@link RegisterTools} compares against it to no-op identical re-registrations.
     */
    private currentToolsFingerprint = AssemblyAIRealtime.ToolSetFingerprint([]);

    constructor(sessionObject: JSONObject) {
        this.sessionObject = sessionObject;
        this.basePrompt = typeof sessionObject['system_prompt'] === 'string' ? sessionObject['system_prompt'] : '';
        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        // The promise is always consumed by WaitForReady before any rejection can fire
        // (StartSession awaits it immediately), but guard against unhandled-rejection noise
        // if a transport error lands between construction and the await.
        this.readyPromise.catch(() => undefined);
    }

    /** Binds the underlying socket. Called by the driver once the websocket is open. */
    public AttachSocket(socket: AssemblyAIRealtimeSocket): void {
        this.socket = socket;
    }

    /**
     * Sends the initial `session.update` frame carrying the full server-authored session
     * config (prompt, tools, voice, turn detection). Always the FIRST client frame — the
     * provider drops audio sent before the session is configured and ready.
     */
    public SendSessionUpdate(): void {
        this.sendFrame({ type: 'session.update', session: this.sessionObject });
    }

    /**
     * Resolves once the server's `session.ready` arrives (the provider's confirmation that
     * the session config is applied); rejects if the transport dies first. Awaited by
     * {@link AssemblyAIRealtime.StartSession} so the session is never handed to a consumer
     * before it is actually configured.
     */
    public WaitForReady(): Promise<void> {
        return this.readyPromise;
    }

    /** @inheritdoc — streams one PCM16 (24 kHz mono) frame as a base64 `input.audio` chunk. */
    public SendInput(chunk: ArrayBuffer): void {
        this.sendFrame({ type: 'input.audio', audio: Buffer.from(new Uint8Array(chunk)).toString('base64') });
    }

    /**
     * @inheritdoc
     *
     * `tools` is a MUTABLE `session.update` field on this provider, so re-declaration is
     * native: an identical set (order-insensitively) is a silent no-op per the contract's
     * idempotency rule; a different set is applied to the live session immediately.
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        const fingerprint = AssemblyAIRealtime.ToolSetFingerprint(tools);
        if (fingerprint === this.currentToolsFingerprint) {
            return; // identical to the declared set — silent no-op
        }
        this.currentToolsFingerprint = fingerprint;
        this.sendFrame({
            type: 'session.update',
            session: { tools: tools.map((tool) => AssemblyAIRealtime.MapToolToFunction(tool)) },
        });
    }

    /** Records the tool set declared at connect time. Called by {@link AssemblyAIRealtime.StartSession}. */
    public SetConnectTimeTools(tools: RealtimeToolDefinition[]): void {
        this.currentToolsFingerprint = AssemblyAIRealtime.ToolSetFingerprint(tools);
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

    /**
     * @inheritdoc
     *
     * Never fires: the Voice Agent websocket reports no token usage — billing is a flat
     * hourly session rate (see the driver-level note).
     */
    public OnUsage(_handler: (u: RealtimeUsage) => void): void {
        // intentionally unbound — no usage events exist on this provider surface
    }

    /** @inheritdoc */
    public OnError(handler: (error: RealtimeSessionError) => void): void {
        this.errorHandler = handler;
    }

    /**
     * Surfaces a websocket-level failure as a FATAL session error — the transport is gone,
     * so the consumer should finalize cleanly instead of idling (driver obligation #6).
     */
    public HandleTransportError(message: string): void {
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * Surfaces an UNEXPECTED socket close as a fatal error (expected closes — the consumer
     * called {@link Close} — are silent). The provider hard-closes at token expiry and when
     * it ends the session itself, so this is also how credential / session death reaches the
     * consumer.
     */
    public HandleTransportClose(code?: number, reason?: string): void {
        if (this.closedByConsumer) {
            return;
        }
        const detail = [code != null ? `code ${code}` : null, reason || null].filter(Boolean).join(' — ');
        const message = `AssemblyAI agent session closed unexpectedly${detail ? ` (${detail})` : ''}`;
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * @inheritdoc
     *
     * Sends `tool.result` correlated by `call_id`. Sent IMMEDIATELY (never queued): the
     * provider's own guidance is "send it the moment your tool returns — no buffering, no
     * waiting on reply.done"; it owns the continuation and speaks the result as soon as the
     * floor allows. The wire `result` slot expects a JSON-STRING (not an object), which is
     * exactly the contract's `output` shape — it passes through verbatim. The reply flag is
     * set eagerly so a queued narration can't slip in before the spoken result.
     */
    public async SendToolResult(callID: string, output: string): Promise<void> {
        this.sendFrame({ type: 'tool.result', call_id: callID, result: output });
        this.responseActive = true; // the result's spoken continuation is imminent
    }

    /**
     * @inheritdoc
     *
     * EMULATED via the mutable `system_prompt` (the protocol has no purpose-built context
     * channel): the note is appended under a "Background updates" heading and the FULL
     * prompt is re-sent via `session.update` — a config write, so it never triggers or
     * disturbs generation and is sent immediately even mid-reply. The model has the notes
     * available the next time it speaks.
     */
    public SendContextNote(text: string): void {
        this.contextNotes.push(text);
        this.sendFrame({ type: 'session.update', session: { system_prompt: this.composePromptWithNotes() } });
    }

    /**
     * @inheritdoc
     *
     * NATIVE on this provider: `reply.create` carries one-off per-response instructions.
     * **Collision behavior: queue.** A `reply.create` sent mid-reply would collide with the
     * in-flight generation, so the send is deferred until the active reply completes.
     */
    public RequestSpokenUpdate(instructions: string): void {
        this.enqueueOrRun(() => {
            this.responseActive = true; // the instructed reply is now in flight
            this.sendFrame({ type: 'reply.create', instructions });
        });
    }

    /**
     * @inheritdoc
     *
     * Sends `session.end` BEFORE closing the socket — without it the provider holds the
     * session (billable) for a 30-second resume window.
     */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        this.failReadyWait('session closed by consumer before session.ready arrived');
        if (this.socket) {
            try {
                this.sendFrame({ type: 'session.end' });
            } catch {
                /* socket already dead — closing anyway */
            }
        }
        this.socket?.close();
        this.socket = null;
        this.clearHandlers();
    }

    /**
     * Entry point for an inbound websocket frame. Multiplexes on `type` to focused
     * per-concern handlers so each translation unit stays small and testable.
     */
    public HandleServerEvent(event: AssemblyAIServerEvent): void {
        switch (event.type) {
            case 'session.ready':
                this.readyReceived = true;
                this.resolveReady?.();
                break;
            case 'session.updated':
                break; // config-apply confirmation — nothing to surface
            case 'reply.started':
                this.responseActive = true;
                break;
            case 'reply.audio':
                this.handleReplyAudio(event.data);
                break;
            case 'transcript.user.delta':
                this.emitTranscript('user', event.text, false);
                break;
            case 'transcript.user':
                this.emitTranscript('user', event.text, true);
                break;
            case 'transcript.agent':
                this.emitTranscript('assistant', event.text, true);
                break;
            case 'reply.done':
                this.handleReplyDone(event.status);
                break;
            case 'tool.call':
                this.handleToolCall(event);
                break;
            case 'input.speech.started':
            case 'input.speech.stopped':
                break; // raw VAD telemetry — NOT an interruption signal (see the class note)
            case 'session.error':
                this.errorHandler?.({
                    Message: event.message ?? 'AssemblyAI session error',
                    Code: event.code,
                    Fatal: false,
                });
                break;
            case 'session.ended':
                this.handleSessionEnded();
                break;
            default:
                break; // unknown / future frame types are ignored
        }
    }

    /** Decodes one base64 reply-audio frame and forwards it as a raw `ArrayBuffer`. */
    private handleReplyAudio(audioBase64: string | undefined): void {
        if (!audioBase64) {
            return;
        }
        this.responseActive = true;
        this.outputHandler?.(AssemblyAIRealtimeSession.Base64ToArrayBuffer(audioBase64));
    }

    /**
     * Reply boundary. `status: 'interrupted'` is the provider's authoritative true-barge-in
     * verdict (user speech cut off active output — see the class note) and is surfaced via
     * {@link OnInterruption} BEFORE the boundary releases the floor and drains queued sends.
     */
    private handleReplyDone(status: string | undefined): void {
        if (status === 'interrupted') {
            this.interruptionHandler?.();
        }
        this.completeResponse();
    }

    /**
     * Surfaces a `tool.call` to the consumer. The model has yielded the floor pending the
     * result, so the busy flag is cleared (deadlock guard — driver obligation #2) WITHOUT
     * draining the queue (a queued narration must not trigger a reply between the tool call
     * and its result; it drains at the next real reply boundary). The provider emits
     * `arguments` ALREADY PARSED, so it is re-stringified to honor the Core contract's
     * JSON-string `Arguments` shape.
     */
    private handleToolCall(event: AssemblyAIServerEvent): void {
        this.responseActive = false;
        this.toolCallHandler?.({
            CallID: event.call_id ?? '',
            ToolName: event.name ?? '',
            Arguments: JSON.stringify(event.arguments ?? {}),
        });
    }

    /**
     * The provider ended the session itself. After a consumer {@link Close} (which sends
     * `session.end`) this is the expected acknowledgment and stays silent; otherwise it is
     * surfaced as FATAL so the consumer finalizes instead of idling on a dying socket.
     */
    private handleSessionEnded(): void {
        if (this.closedByConsumer) {
            return;
        }
        const message = 'AssemblyAI agent session ended by the provider';
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /** Reply boundary: releases the busy flag and drains queued sends in order. */
    private completeResponse(): void {
        this.responseActive = false;
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /** Emits a transcript event (user turns have deltas; agent turns are final-only). */
    private emitTranscript(role: 'user' | 'assistant', text: string | undefined, isFinal: boolean): void {
        if (!this.transcriptHandler || !text || text.trim().length === 0) {
            return;
        }
        this.transcriptHandler({ Role: role, Text: text, IsFinal: isFinal });
    }

    /** Runs a send immediately when idle; otherwise queues it for the next reply boundary. */
    private enqueueOrRun(send: () => void): void {
        if (this.responseActive) {
            this.queuedSends.push(send);
            return;
        }
        send();
    }

    /** The base prompt plus every accumulated context note under a "Background updates" heading. */
    private composePromptWithNotes(): string {
        if (this.contextNotes.length === 0) {
            return this.basePrompt;
        }
        return `${this.basePrompt}\n\n## Background updates\n${this.contextNotes.map((n) => `- ${n}`).join('\n')}`;
    }

    /** JSON-serializes and sends one client frame (throws if the socket was never attached). */
    private sendFrame(frame: JSONObject): void {
        if (!this.socket) {
            throw new Error('AssemblyAI realtime session is not open (no socket attached or it was closed).');
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
        this.queuedSends = [];
        this.responseActive = false;
    }

    /** Decodes a base64 audio payload into a freshly-allocated `ArrayBuffer`. */
    private static Base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}
