// Inworld Realtime API — realtime (voice) driver.
//
// Inworld's Realtime API is a single-WebSocket, full-duplex speech-to-speech stack. A session is
// configured with a `session.update` frame (model selection, instructions, audio settings, STT/TTS
// config, tools, and turn-taking with semantic-VAD eagerness); components are swappable mid-session
// without reconnect. Input is streamed audio (the server runs STT with voice profiling); output is
// synthesized speech (Realtime TTS-2) that supports inline steering tags such as `[laugh]`. Inworld
// brokers many underlying LLMs, selected via `modelId` (e.g. `anthropic/claude-sonnet-4-6`).
//
// ── WIRE-FORMAT BINDING POINTS ──
// We cannot live-test against an Inworld endpoint, so every place where the EXACT wire framing of a
// message is not fully nailed down from public docs is implemented against the documented protocol
// SHAPE (session.update init / full-duplex base64 audio / fluent tool calling / semantic VAD) and
// isolated in a single clearly-named private helper carrying a `@remarks Wire-format binding point`
// JSDoc note. Each such helper is the one place to adjust when validating against a live endpoint.
// The helpers are:
//   - {@link InworldRealtimeSession.buildSessionUpdateFrame}  (session.update payload shape)
//   - {@link InworldRealtimeSession.buildAudioAppendFrame}    (input audio-append frame)
//   - {@link InworldRealtimeSession.buildToolResultFrame}     (tool-result frame + name/keys)
//   - {@link InworldRealtimeSession.buildResponseCreateFrame} (instructed one-off response)
//   - {@link InworldRealtimeSession.buildContextItemFrame}    (non-interrupting context item)
//   - {@link InworldRealtimeSession.classifyServerEvent}      (inbound type → semantic kind)

import {
    BaseRealtimeModel,
    type IRealtimeSession,
    type RealtimeSessionParams,
    type RealtimeToolDefinition,
    type RealtimeTranscript,
    type RealtimeToolCall,
    type RealtimeUsage,
    type RealtimeSessionError,
    type JSONObject,
    type JSONValue,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** The Inworld Realtime API WebSocket endpoint. Auth rides as a `?token=` query parameter. */
export const INWORLD_REALTIME_WS_URL = 'wss://api.inworld.ai/v1/realtime';

/**
 * Default underlying LLM Inworld brokers when {@link RealtimeSessionParams.Model} is empty. Inworld
 * selects the reasoning model via `modelId` (e.g. `anthropic/claude-sonnet-4-6`); the STT engine and
 * TTS voice are configured independently in the audio block.
 */
export const INWORLD_DEFAULT_MODEL_ID = 'anthropic/claude-sonnet-4-6';

/**
 * Default semantic-VAD eagerness applied to turn-taking when the caller supplies none. Inworld's
 * turn detection is semantic VAD with adjustable eagerness; `medium` balances responsiveness against
 * premature turn-ends. Overridable via `Config.turn_detection.eagerness` (or the whole block).
 */
export const INWORLD_DEFAULT_VAD_EAGERNESS = 'medium';

/**
 * A parsed inbound Inworld Realtime WebSocket frame.
 *
 * The Inworld protocol multiplexes server events on a `type` discriminator (mirroring the
 * `session.update` request shape it accepts), so a single interface carries every inbound field the
 * driver reads. Fields are optional because which ones are present depends on `type`.
 *
 * @remarks Wire-format binding point — the precise inbound `type` strings and field names are mapped
 * to the documented protocol shape and centralized in {@link InworldRealtimeSession.classifyServerEvent};
 * verify the exact discriminators against a live Inworld endpoint.
 */
export interface InworldServerEvent {
    /** The event discriminator (e.g. `session.updated`, `output_audio.delta`, `response.done`). */
    type?: string;
    /** Provider-assigned session id, surfaced on the session-ready frame. */
    session_id?: string;
    /** A base64-encoded chunk of synthesized output audio (Realtime TTS-2). */
    audio?: string;
    /** Transcribed text for a transcript frame (user STT or assistant TTS transcript). */
    text?: string;
    /** A correlation id for a tool call, echoed back on the tool result. */
    call_id?: string;
    /** The tool name on a tool-call frame. */
    name?: string;
    /**
     * Tool-call arguments. Inworld may emit these either pre-parsed (object) or as a JSON string; the
     * driver normalizes both to the Core contract's JSON-string `Arguments` shape.
     */
    arguments?: JSONValue;
    /** Provider error code on an error frame. */
    code?: string;
    /** Human-readable message on an error frame. */
    message?: string;
    /** Whether the provider classified an error frame as fatal (transport/credential death). */
    fatal?: boolean;
    /** Incremental input-token count on a usage frame. */
    input_tokens?: number;
    /** Incremental output-token count on a usage frame. */
    output_tokens?: number;
}

/** The minimal outbound surface of the realtime WebSocket the session depends on. */
export interface InworldRealtimeSocket {
    /** Sends one JSON-serialized client frame. */
    send(data: string): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Arguments handed to {@link InworldRealtime.connectRealtimeSocket}: the authenticated URL plus the
 * lifecycle callbacks. The seam owns the entire WebSocket dance so tests substitute it wholesale with
 * an in-memory fake — no network, no real socket.
 */
export interface InworldConnectArgs {
    /** The full `wss://…?token=…` URL. */
    Url: string;
    /** Invoked with each parsed inbound frame. */
    OnMessage: (event: InworldServerEvent) => void;
    /** Invoked on a WebSocket-level error (fatal — the session is unusable). */
    OnError: (message: string) => void;
    /** Invoked when the WebSocket closes. */
    OnClose: (code?: number, reason?: string) => void;
}

/**
 * Structural subset of the global `WebSocket` constructor used by the production
 * {@link InworldRealtime.connectRealtimeSocket} seam (global in browsers and Node 22+; typed
 * structurally so the package compiles without DOM lib types).
 */
interface NativeWebSocketLike {
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onerror: (() => void) | null;
    onclose: ((event: { code?: number; reason?: string }) => void) | null;
    send(data: string): void;
    close(): void;
}

/**
 * Real-time, full-duplex driver for the **Inworld Realtime API**, implementing the Core
 * {@link BaseRealtimeModel} primitive. Registers as `InworldRealtime` and is resolved for
 * `MJ: AI Models` typed `Realtime` (API-key env alias: `AI_VENDOR_API_KEY__InworldRealtime`).
 *
 * **What the provider is:** a single-WebSocket speech-to-speech stack. Sessions initialize with a
 * `session.update` frame carrying model selection, instructions, audio settings, STT/TTS config, and
 * tools; components are swappable mid-session without reconnect. Input is streamed audio (server-side
 * STT with voice profiling); output is synthesized speech (Realtime TTS-2) supporting inline steering
 * tags like `[laugh]`. Turn-taking is semantic VAD with adjustable eagerness, handling barge-in.
 *
 * **Model resolution:** Inworld brokers hundreds of LLMs; the reasoning model is selected via
 * `modelId` (e.g. `anthropic/claude-sonnet-4-6`) carried from {@link RealtimeSessionParams.Model}
 * (falling back to {@link INWORLD_DEFAULT_MODEL_ID}). STT engine and TTS voice are configured
 * independently via `Config`.
 *
 * **Topology:** server-bridged only ({@link StartSession}) — the driver opens the WebSocket, sends the
 * session config, and resolves only once the provider confirms the config is applied (driver
 * obligation #7). Inworld does not expose a documented ephemeral-token mint for browser-direct
 * sessions, so {@link SupportsClientDirect} stays `false` (inherited).
 *
 * **Tool calling:** "fluent tool calling" — functions declared at startup (or added mid-session via
 * {@link IRealtimeSession.RegisterTools}) and executed mid-conversation; results fed back via
 * {@link IRealtimeSession.SendToolResult} complete the loop.
 */
@RegisterClass(BaseRealtimeModel, 'InworldRealtime')
export class InworldRealtime extends BaseRealtimeModel {
    /**
     * Opens a server-bridged session: connects the realtime WebSocket authenticated with the API
     * key, sends the full session config as the FIRST frame (`session.update` — model, instructions,
     * audio/STT/TTS, tools, semantic-VAD turn-taking), and resolves only once the provider's
     * session-ready confirmation arrives (driver obligation #7 — "ready only after the config is
     * applied"). Mic frames sent before that would be dropped by the provider, and `StartSession`
     * not resolving until ready makes that unrepresentable for consumers.
     *
     * @param params Session configuration (model, system prompt, tools, initial context, config bag).
     * @returns A promise resolving to the live {@link IRealtimeSession} handle, post-ready.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const session = new InworldRealtimeSession(params);
        const socket = await this.connectRealtimeSocket({
            Url: this.buildConnectUrl(),
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
     * Builds the authenticated WebSocket URL. Auth rides as a `?token=` query parameter (the
     * server-side API key for the server-bridged topology).
     *
     * @returns The full `wss://…?token=…` connect URL.
     * @remarks Wire-format binding point — confirm the auth query-parameter name (`token`) against a
     * live Inworld endpoint; some deployments authenticate via an `Authorization` header instead.
     */
    protected buildConnectUrl(): string {
        return `${INWORLD_REALTIME_WS_URL}?token=${encodeURIComponent(this.apiKey)}`;
    }

    /**
     * Transport seam for the realtime WebSocket. Production speaks the raw Inworld Realtime protocol
     * over the platform-global `WebSocket` (browsers / Node 22+) and resolves once the socket is
     * OPEN. Unit tests override this to return an in-memory fake — no network.
     *
     * @param args The authenticated URL plus inbound-message / error / close callbacks.
     * @returns A promise resolving to the connected {@link InworldRealtimeSocket} once open.
     */
    protected async connectRealtimeSocket(args: InworldConnectArgs): Promise<InworldRealtimeSocket> {
        const WS = (globalThis as unknown as { WebSocket?: new (url: string) => NativeWebSocketLike }).WebSocket;
        if (!WS) {
            throw new Error('InworldRealtime.StartSession requires a global WebSocket (Node 22+ or a browser runtime).');
        }
        return new Promise<InworldRealtimeSocket>((resolve, reject) => {
            const ws = new WS(args.Url);
            let opened = false;
            ws.onopen = () => {
                opened = true;
                resolve({ send: (data) => ws.send(data), close: () => ws.close() });
            };
            ws.onmessage = (event) => {
                try {
                    args.OnMessage(JSON.parse(String(event.data)) as InworldServerEvent);
                } catch {
                    /* non-JSON frame — ignore */
                }
            };
            ws.onerror = () => {
                args.OnError('Inworld realtime websocket error');
                if (!opened) {
                    reject(new Error('Inworld realtime websocket failed to open'));
                }
            };
            ws.onclose = (event) => {
                args.OnClose(event.code, event.reason);
                if (!opened) {
                    reject(new Error('Inworld realtime websocket closed before opening'));
                }
            };
        });
    }

    /**
     * Maps a Core {@link RealtimeToolDefinition} up to an Inworld realtime `function` tool schema —
     * the shape Inworld's "fluent tool calling" `tools[]` slot accepts. Shared by the initial
     * `session.update` and by mid-session {@link IRealtimeSession.RegisterTools} so both expose
     * byte-for-byte identical tool schemas.
     *
     * @param tool The Core tool definition to map.
     * @returns The Inworld realtime function-tool object.
     */
    public static MapToolToFunction(tool: RealtimeToolDefinition): JSONObject {
        return {
            type: 'function',
            name: tool.Name,
            description: tool.Description,
            // The Core ParametersSchema is a JSON-schema object — the same shape Inworld's
            // `tools[].parameters` slot accepts.
            parameters: tool.ParametersSchema,
        };
    }

    /**
     * Canonical, order-insensitive fingerprint of a tool set (same scheme as the OpenAI / Gemini /
     * AssemblyAI realtime drivers) — used by {@link InworldRealtimeSession.RegisterTools} to no-op
     * identical re-registrations per the contract's idempotency rule.
     *
     * @param tools The tool set to fingerprint.
     * @returns A stable string fingerprint independent of tool ordering.
     */
    public static ToolSetFingerprint(tools: RealtimeToolDefinition[]): string {
        return JSON.stringify(
            [...tools]
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map((t) => ({ Name: t.Name, Description: t.Description, ParametersSchema: t.ParametersSchema }))
        );
    }
}

/**
 * Concrete {@link IRealtimeSession} backed by a raw Inworld Realtime WebSocket.
 *
 * Owns the inbound translation (Inworld wire events → Core events) and the outbound translation
 * (Core calls → wire frames). Created by {@link InworldRealtime.StartSession}; never instantiated
 * directly by consumers.
 *
 * Provider-behavior notes (the contract deltas a consumer should know):
 * - **`session.update` is the universal config channel.** Model, instructions, audio/STT/TTS, tools,
 *   and turn-taking are all carried by `session.update` — at connect time AND mid-session. Components
 *   are swappable without reconnect, so {@link RegisterTools} and {@link SendContextNote} are native
 *   config writes (never interrupting generation).
 * - **Semantic VAD owns turn detection / barge-in.** A raw "speech started" is NOT an interruption;
 *   the provider's true-barge-in signal (it tracks its own output emission) is surfaced only when it
 *   cuts off an ACTIVE response, gated on {@link responseActive} per the base contract.
 * - **Output supports inline steering tags** (e.g. `[laugh]`) — passed through verbatim in
 *   instructions; the driver does not parse or strip them.
 * - **Tool results must reach the model.** `SendToolResult` is sent immediately (the provider owns the
 *   spoken continuation) and marks a response active eagerly so a queued narration can't slip ahead.
 * - **{@link RequestSpokenUpdate} queues behind an in-flight response** per the collision rule; a
 *   `tool.call` clears the busy flag WITHOUT draining the queue (deadlock guard, obligation #2).
 */
export class InworldRealtimeSession implements IRealtimeSession {
    private socket: InworldRealtimeSocket | null = null;

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private usageHandler: ((u: RealtimeUsage) => void) | null = null;
    private errorHandler: ((error: RealtimeSessionError) => void) | null = null;
    private closeHandler: (() => void) | null = null;
    /** True once {@link Close} ran — an expected close must not surface as a fatal error. */
    private closedByConsumer = false;

    /** Resolves when the session-ready frame arrives; rejects on transport death. */
    private readyPromise: Promise<void>;
    private resolveReady: (() => void) | null = null;
    private rejectReady: ((error: Error) => void) | null = null;
    private readyReceived = false;

    /** The session params the connect-time `session.update` is built from. */
    private params: RealtimeSessionParams;
    /** The base system prompt (with InitialContext folded in) — context notes append to it. */
    private basePrompt: string;
    /** Accumulated {@link SendContextNote} texts, re-sent with the full prompt each time. */
    private contextNotes: string[] = [];

    /**
     * Whether a model response is currently in flight. Set when output audio / a response-started
     * frame arrives (and eagerly when this session triggers its own response); cleared on a
     * response-done frame; a tool-call clears it WITHOUT draining (deadlock guard). Consumed by
     * {@link enqueueOrRun} so a native {@link RequestSpokenUpdate} never collides with an active
     * response, and by {@link handleSpeechStarted} to gate true-barge-in.
     */
    private responseActive = false;

    /** Sends deferred while a response is in flight; drained in order at the next boundary. */
    private queuedSends: Array<() => void> = [];

    /**
     * Fingerprint of the tool set currently declared on the session; {@link RegisterTools} compares
     * against it to no-op identical re-registrations.
     */
    private currentToolsFingerprint: string;

    /**
     * @param params The session parameters (model, system prompt, tools, initial context, config bag).
     */
    constructor(params: RealtimeSessionParams) {
        this.params = params;
        this.basePrompt = InworldRealtimeSession.composeSystemPrompt(params.SystemPrompt, params.InitialContext);
        this.currentToolsFingerprint = InworldRealtime.ToolSetFingerprint(params.Tools ?? []);
        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        // The promise is always consumed by WaitForReady before any rejection can fire (StartSession
        // awaits it immediately), but guard against unhandled-rejection noise if a transport error
        // lands between construction and the await.
        this.readyPromise.catch(() => undefined);
    }

    /** Binds the underlying socket. Called by the driver once the WebSocket is open. */
    public AttachSocket(socket: InworldRealtimeSocket): void {
        this.socket = socket;
    }

    /**
     * Sends the initial `session.update` frame carrying the full server-authored session config
     * (model, instructions, audio/STT/TTS, tools, semantic-VAD turn-taking). Always the FIRST client
     * frame — the provider drops audio sent before the session is configured.
     */
    public SendSessionUpdate(): void {
        this.sendFrame(this.buildSessionUpdateFrame(this.params.Tools ?? []));
    }

    /**
     * Resolves once the provider's session-ready confirmation arrives (its acknowledgment that the
     * session config is applied); rejects if the transport dies first. Awaited by
     * {@link InworldRealtime.StartSession} so the session is never handed to a consumer before it is
     * actually configured (driver obligation #7).
     *
     * @returns A promise resolving on session-ready and rejecting on pre-ready transport death.
     */
    public WaitForReady(): Promise<void> {
        return this.readyPromise;
    }

    // ── IRealtimeSession outbound ──

    /** @inheritdoc — streams one client media frame as a base64 input audio-append frame. */
    public SendInput(chunk: ArrayBuffer): void {
        this.sendFrame(this.buildAudioAppendFrame(chunk));
    }

    /**
     * @inheritdoc
     *
     * Inworld's `tools` are a MUTABLE `session.update` field (components are swappable mid-session
     * without reconnect), so re-declaration is native: an identical set (order-insensitively) is a
     * silent no-op per the contract's idempotency rule; a genuinely different set is applied to the
     * live session immediately.
     *
     * @param tools The tools to expose to the model.
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        const fingerprint = InworldRealtime.ToolSetFingerprint(tools);
        if (fingerprint === this.currentToolsFingerprint) {
            return; // identical to the declared set — silent no-op (idempotency rule)
        }
        this.currentToolsFingerprint = fingerprint;
        this.sendFrame(this.buildToolsUpdateFrame(tools));
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

    /**
     * @inheritdoc
     *
     * Completes the tool-call loop: sends a tool-result frame correlated by `call_id`. Sent
     * IMMEDIATELY (never queued) — the provider asked for it and owns the spoken continuation. The
     * busy flag is set eagerly so a queued narration can't slip in before the spoken result (driver
     * obligation #5 — the result must EVENTUALLY be voiced and never be dropped).
     *
     * @param callID The `CallID` from the originating {@link RealtimeToolCall}.
     * @param output The tool's result as a JSON-stringified string.
     */
    public async SendToolResult(callID: string, output: string): Promise<void> {
        this.sendFrame(this.buildToolResultFrame(callID, output));
        this.responseActive = true; // the result's spoken continuation is imminent
    }

    /**
     * @inheritdoc
     *
     * EMULATED via the mutable system prompt: Inworld has no purpose-built non-interrupting context
     * channel, but `session.update` may rewrite instructions mid-session WITHOUT triggering
     * generation. The note is appended under a "Background updates" heading and the full prompt is
     * re-sent — a config write, so it never interrupts and is sent immediately even mid-response. The
     * model sees the notes the next time it speaks.
     *
     * @param text The context note to append to the conversation.
     */
    public SendContextNote(text: string): void {
        this.contextNotes.push(text);
        this.sendFrame(this.buildContextItemFrame(this.composePromptWithNotes()));
    }

    /**
     * @inheritdoc
     *
     * Triggers ONE short spoken update via a response-create frame carrying per-response
     * instructions. **Collision behavior: queue.** A response-create sent mid-response would collide
     * with the in-flight generation (the provider rejects overlapping triggers), so the send is
     * deferred until the active response completes and drained at the next boundary.
     *
     * @param instructions Instructions for the single spoken update.
     */
    public RequestSpokenUpdate(instructions: string): void {
        this.enqueueOrRun(() => {
            this.responseActive = true; // the instructed response is now in flight
            this.sendFrame(this.buildResponseCreateFrame(instructions));
        });
    }

    /**
     * @inheritdoc
     *
     * Closes the session: sends a session-close frame BEFORE closing the socket so the provider
     * tears the session down promptly rather than holding it, then releases the socket and drops all
     * handlers so no stale callback fires afterward.
     */
    public async Close(): Promise<void> {
        this.closedByConsumer = true;
        this.failReadyWait('session closed by consumer before the session was ready');
        if (this.socket) {
            try {
                this.sendFrame(this.buildSessionCloseFrame());
            } catch {
                /* socket already dead — closing anyway */
            }
        }
        this.socket?.close();
        this.socket = null;
        this.clearHandlers();
    }

    // ── Inbound event translation ──

    /**
     * Entry point for an inbound WebSocket frame. Classifies the raw frame to a semantic kind via
     * {@link classifyServerEvent}, then routes to a focused per-concern handler so each translation
     * unit stays small and testable.
     *
     * @param event The parsed Inworld server event.
     */
    public HandleServerEvent(event: InworldServerEvent): void {
        switch (this.classifyServerEvent(event)) {
            case 'ready':
                return this.handleReady();
            case 'config-applied':
                return; // mid-session config-apply confirmation — nothing to surface
            case 'output-audio':
                return this.handleOutputAudio(event.audio);
            case 'transcript-user-delta':
                return this.emitTranscript('user', event.text, false);
            case 'transcript-user-final':
                return this.emitTranscript('user', event.text, true);
            case 'transcript-assistant-delta':
                return this.emitTranscript('assistant', event.text, false);
            case 'transcript-assistant-final':
                return this.emitTranscript('assistant', event.text, true);
            case 'response-started':
                this.responseActive = true;
                return;
            case 'response-done':
                return this.completeResponse();
            case 'tool-call':
                return this.handleToolCall(event);
            case 'speech-started':
                return this.handleSpeechStarted();
            case 'interruption':
                return this.handleInterruption();
            case 'usage':
                return this.handleUsage(event);
            case 'error':
                return this.handleProviderError(event);
            case 'ignore':
                return;
        }
    }

    /** Resolves the ready wait so {@link InworldRealtime.StartSession} can hand back the session. */
    private handleReady(): void {
        this.readyReceived = true;
        this.resolveReady?.();
    }

    /** Decodes one base64 output-audio frame, marks a response active, and forwards the raw bytes. */
    private handleOutputAudio(audioBase64: string | undefined): void {
        if (!audioBase64) {
            return;
        }
        this.responseActive = true;
        this.outputHandler?.(InworldRealtimeSession.base64ToArrayBuffer(audioBase64));
    }

    /**
     * Surfaces a `tool.call` to the consumer. The model has yielded the floor pending the result, so
     * the busy flag is cleared (deadlock guard — driver obligation #2) WITHOUT draining the queue (a
     * queued narration must not trigger a response between the tool call and its result; it drains at
     * the next real response boundary). Inworld may emit `arguments` pre-parsed or as a JSON string;
     * {@link normalizeToolArguments} normalizes both to the Core contract's JSON-string shape.
     *
     * @param event The inbound tool-call frame.
     */
    private handleToolCall(event: InworldServerEvent): void {
        this.responseActive = false;
        this.toolCallHandler?.({
            CallID: event.call_id ?? '',
            ToolName: event.name ?? '',
            Arguments: InworldRealtimeSession.normalizeToolArguments(event.arguments),
        });
    }

    /**
     * A raw "speech started" frame. Per the base contract this is NOT itself an interruption — a user
     * taking their normal turn while the model is idle must not be reported. It is surfaced as a
     * true barge-in only when a model response is actually in flight (semantic VAD owns turn
     * detection; {@link responseActive} is the server-bridged proxy for "model output in flight").
     */
    private handleSpeechStarted(): void {
        if (!this.responseActive) {
            return;
        }
        this.handleInterruption();
    }

    /**
     * Surfaces a TRUE barge-in: user speech that cut off active model output. Fires the interruption
     * handler, then releases the floor and drains queued sends. (Reached either from an explicit
     * provider interruption frame or from a `responseActive`-gated speech-started.)
     */
    private handleInterruption(): void {
        this.interruptionHandler?.();
        this.completeResponse();
    }

    /** Translates an incremental usage frame into a {@link RealtimeUsage} update. */
    private handleUsage(event: InworldServerEvent): void {
        this.usageHandler?.({
            InputTokens: event.input_tokens ?? 0,
            OutputTokens: event.output_tokens ?? 0,
        });
    }

    /**
     * Classifies a provider error frame's fatality and forwards it. The provider's own `fatal` flag
     * (when present) is authoritative — a fatal frame means credential/transport death (driver
     * obligation #6) and the consumer should finalize; otherwise it is a recoverable error frame and
     * the session stays open (`Fatal: false`).
     *
     * @param event The inbound error frame.
     */
    private handleProviderError(event: InworldServerEvent): void {
        this.errorHandler?.({
            Message: event.message ?? 'Inworld realtime session error',
            Code: event.code,
            Fatal: event.fatal === true,
        });
    }

    // ── Transport lifecycle ──

    /**
     * Surfaces a WebSocket-level failure as a FATAL session error — the transport is gone, so the
     * consumer should finalize cleanly instead of idling on a dead socket (driver obligation #6).
     *
     * @param message The transport error message.
     */
    public HandleTransportError(message: string): void {
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
    }

    /**
     * Surfaces an UNEXPECTED socket close as a fatal error (expected closes — the consumer called
     * {@link Close} — are silent). The provider hard-closes at token expiry and when it ends the
     * session itself, so this is also how credential / session death reaches the consumer. The close
     * handler fires after the error so consumers driving finalization from either signal converge.
     *
     * @param code Optional WebSocket close code.
     * @param reason Optional WebSocket close reason.
     */
    public HandleTransportClose(code?: number, reason?: string): void {
        if (this.closedByConsumer) {
            return;
        }
        const detail = [code != null ? `code ${code}` : null, reason || null].filter(Boolean).join(' — ');
        const message = `Inworld realtime session closed unexpectedly${detail ? ` (${detail})` : ''}`;
        this.failReadyWait(message);
        this.errorHandler?.({ Message: message, Fatal: true });
        this.closeHandler?.();
    }

    // ── Wire-format binding points (the one place to adjust per the live Inworld protocol) ──

    /**
     * Builds the initial `session.update` frame: model selection, instructions, audio settings, STT
     * engine, TTS voice, tools, and semantic-VAD turn-taking with adjustable eagerness. Recognized
     * `Config` keys pass through to their wire slots; the whole `Config` bag also spreads onto the
     * session so a per-conversation override can replace any block.
     *
     * @param tools The tools to declare at connect time.
     * @returns The `session.update` client frame.
     * @remarks Wire-format binding point — the `session.update` envelope and the exact key names for
     * `model` / `instructions` / `audio` / `voice` / `stt` / `turn_detection.eagerness` are mapped to
     * Inworld's documented protocol shape; verify each key against a live Inworld endpoint.
     */
    private buildSessionUpdateFrame(tools: RealtimeToolDefinition[]): JSONObject {
        const config = this.params.Config ?? {};
        const session: JSONObject = {
            model: this.resolveModelId(),
            instructions: this.composePromptWithNotes(),
            // Inworld runs server-side STT (with voice profiling) on input and TTS-2 on output; the
            // audio block configures both halves. Recognized Config keys map to their wire slots.
            audio: this.buildAudioConfig(config),
            turn_detection: this.buildTurnDetection(config),
        };
        if (tools.length > 0) {
            session['tools'] = tools.map((tool) => InworldRealtime.MapToolToFunction(tool));
        }
        // Spread any caller-supplied raw overrides last so a per-conversation Config can replace a
        // block above (e.g. a fully-specified `audio` object). Known shorthand keys consumed by
        // buildAudioConfig/buildTurnDetection are stripped so they don't double-write.
        this.applyRawConfigOverrides(session, config);
        return { type: 'session.update', session };
    }

    /**
     * Builds the audio block (input STT + output TTS voice). Recognized shorthand `Config` keys:
     * `voice` → `output.voice`, `stt` → `input.model`, `language` → `input.language`.
     *
     * @param config The caller's config bag.
     * @returns The wire `audio` config object.
     * @remarks Wire-format binding point — the `audio.{input,output}` sub-shape is mapped to the
     * documented STT-in / TTS-2-out description; verify exact key names against a live endpoint.
     */
    private buildAudioConfig(config: JSONObject): JSONObject {
        const input: JSONObject = {};
        if (typeof config['stt'] === 'string') {
            input['model'] = config['stt'];
        }
        if (typeof config['language'] === 'string') {
            input['language'] = config['language'];
        }
        const output: JSONObject = {};
        if (typeof config['voice'] === 'string') {
            output['voice'] = config['voice'];
        }
        const audio: JSONObject = {};
        if (Object.keys(input).length > 0) {
            audio['input'] = input;
        }
        if (Object.keys(output).length > 0) {
            audio['output'] = output;
        }
        return audio;
    }

    /**
     * Builds the semantic-VAD turn-detection block. If the caller supplies a full `turn_detection`
     * object it is used verbatim; otherwise an `eagerness` shorthand (or the default) is applied.
     *
     * @param config The caller's config bag.
     * @returns The wire `turn_detection` object.
     * @remarks Wire-format binding point — `turn_detection.type = 'semantic_vad'` and the `eagerness`
     * field are mapped to the documented "semantic VAD with adjustable eagerness"; verify exact key
     * names / allowed values against a live endpoint.
     */
    private buildTurnDetection(config: JSONObject): JSONObject {
        const supplied = config['turn_detection'];
        if (supplied !== null && typeof supplied === 'object' && !Array.isArray(supplied)) {
            return supplied;
        }
        const eagerness = typeof config['eagerness'] === 'string' ? config['eagerness'] : INWORLD_DEFAULT_VAD_EAGERNESS;
        return { type: 'semantic_vad', eagerness };
    }

    /**
     * Spreads caller-supplied raw `Config` overrides onto the session object, skipping the shorthand
     * keys already consumed by {@link buildAudioConfig} / {@link buildTurnDetection} so they don't
     * double-write. Lets a per-conversation config replace a whole block (e.g. a fully-specified
     * `audio` object) while shorthands stay convenient.
     *
     * @param session The session object being built (mutated in place).
     * @param config The caller's config bag.
     */
    private applyRawConfigOverrides(session: JSONObject, config: JSONObject): void {
        const consumedShorthands = new Set(['voice', 'stt', 'language', 'eagerness']);
        for (const [key, value] of Object.entries(config)) {
            if (consumedShorthands.has(key)) {
                continue;
            }
            session[key] = value;
        }
    }

    /**
     * Builds an input audio-append frame from a raw media chunk (base64-encoded over the single WS,
     * full-duplex).
     *
     * @param chunk The raw media frame.
     * @returns The audio-append client frame.
     * @remarks Wire-format binding point — the `input_audio.append` type and the `audio` base64 key
     * are mapped to the documented full-duplex streamed-audio input; verify against a live endpoint.
     */
    private buildAudioAppendFrame(chunk: ArrayBuffer): JSONObject {
        return { type: 'input_audio.append', audio: Buffer.from(new Uint8Array(chunk)).toString('base64') };
    }

    /**
     * Builds a mid-session `session.update` frame that re-declares only the tools (components are
     * swappable without reconnect).
     *
     * @param tools The new tool set to declare.
     * @returns The tools-only `session.update` client frame.
     * @remarks Wire-format binding point — re-declaring tools via a partial `session.update` follows
     * the documented "components swappable mid-session" model; verify the partial-update semantics
     * against a live endpoint.
     */
    private buildToolsUpdateFrame(tools: RealtimeToolDefinition[]): JSONObject {
        return {
            type: 'session.update',
            session: { tools: tools.map((tool) => InworldRealtime.MapToolToFunction(tool)) },
        };
    }

    /**
     * Builds a tool-result frame correlated by `call_id`. The Core contract's `output` is already a
     * JSON string, which is passed through verbatim in the `result` slot.
     *
     * @param callID The originating call id.
     * @param output The tool result as a JSON string.
     * @returns The tool-result client frame.
     * @remarks Wire-format binding point — the `tool.result` type and the `call_id` / `result` keys
     * are mapped to the documented fluent-tool-calling result flow; verify against a live endpoint.
     */
    private buildToolResultFrame(callID: string, output: string): JSONObject {
        return { type: 'tool.result', call_id: callID, result: output };
    }

    /**
     * Builds a response-create frame carrying one-off per-response instructions (the instructed
     * spoken update). Output supports inline steering tags like `[laugh]`, which pass through in the
     * instructions verbatim.
     *
     * @param instructions Instructions for the single spoken response.
     * @returns The response-create client frame.
     * @remarks Wire-format binding point — the `response.create` type and the `instructions` key are
     * mapped to the documented instructed-response capability; verify against a live endpoint.
     */
    private buildResponseCreateFrame(instructions: string): JSONObject {
        return { type: 'response.create', instructions };
    }

    /**
     * Builds the non-interrupting context-item frame. Emulated via the mutable instructions: the full
     * prompt (base + accumulated notes) is re-sent via `session.update`, which never triggers
     * generation.
     *
     * @param fullPrompt The full instructions (base prompt + background-update notes).
     * @returns The context-item client frame (a `session.update` that rewrites instructions).
     * @remarks Wire-format binding point — using a partial `session.update` of `instructions` as the
     * non-interrupting context channel follows the documented "components swappable mid-session"
     * model; verify against a live endpoint.
     */
    private buildContextItemFrame(fullPrompt: string): JSONObject {
        return { type: 'session.update', session: { instructions: fullPrompt } };
    }

    /**
     * Builds the session-close frame sent before the socket is torn down.
     *
     * @returns The session-close client frame.
     * @remarks Wire-format binding point — the `session.close` type is mapped to a graceful teardown;
     * verify against a live endpoint (some deployments rely on the socket close alone).
     */
    private buildSessionCloseFrame(): JSONObject {
        return { type: 'session.close' };
    }

    /**
     * Classifies a raw inbound frame to a semantic kind the dispatcher routes on. Centralizing the
     * `type`-string mapping here keeps {@link HandleServerEvent} stable even if the precise wire
     * discriminators differ from the assumed shape.
     *
     * @param event The parsed inbound frame.
     * @returns The semantic kind for {@link HandleServerEvent}.
     * @remarks Wire-format binding point — the inbound `type` strings (e.g. `session.updated`,
     * `output_audio.delta`, `input_audio_transcription.delta`, `response.done`, `tool.call`,
     * `input_audio.speech_started`, `interrupted`, `usage`, `error`) are mapped to the documented
     * protocol shape; verify the exact discriminators against a live Inworld endpoint.
     */
    private classifyServerEvent(event: InworldServerEvent): InworldEventKind {
        switch (event.type) {
            case 'session.created':
            case 'session.ready':
                return 'ready';
            case 'session.updated':
                return 'config-applied';
            case 'output_audio.delta':
                return 'output-audio';
            case 'input_audio_transcription.delta':
                return 'transcript-user-delta';
            case 'input_audio_transcription.completed':
                return 'transcript-user-final';
            case 'output_audio_transcript.delta':
                return 'transcript-assistant-delta';
            case 'output_audio_transcript.done':
                return 'transcript-assistant-final';
            case 'response.created':
                return 'response-started';
            case 'response.done':
                return 'response-done';
            case 'tool.call':
                return 'tool-call';
            case 'input_audio.speech_started':
                return 'speech-started';
            case 'interrupted':
                return 'interruption';
            case 'usage':
                return 'usage';
            case 'error':
                return 'error';
            default:
                return 'ignore';
        }
    }

    // ── Shared helpers ──

    /** Resolves the underlying LLM id Inworld brokers (param model, falling back to the default). */
    private resolveModelId(): string {
        return this.params.Model && this.params.Model.length > 0 ? this.params.Model : INWORLD_DEFAULT_MODEL_ID;
    }

    /** Emits a transcript event (drops empty/whitespace-only text so no blank turns are persisted). */
    private emitTranscript(role: 'user' | 'assistant', text: string | undefined, isFinal: boolean): void {
        if (!this.transcriptHandler || !text || text.trim().length === 0) {
            return;
        }
        this.transcriptHandler({ Role: role, Text: text, IsFinal: isFinal });
    }

    /** Response boundary: releases the busy flag and drains queued sends in order. */
    private completeResponse(): void {
        this.responseActive = false;
        while (!this.responseActive && this.queuedSends.length > 0) {
            const send = this.queuedSends.shift();
            send?.();
        }
    }

    /** Runs a send immediately when idle; otherwise queues it for the next response boundary. */
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
            throw new Error('Inworld realtime session is not open (no socket attached or it was closed).');
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

    /** Drops all registered handlers + queued sends so a closed session can't fire stale callbacks. */
    private clearHandlers(): void {
        this.outputHandler = null;
        this.transcriptHandler = null;
        this.toolCallHandler = null;
        this.interruptionHandler = null;
        this.usageHandler = null;
        this.queuedSends = [];
        this.responseActive = false;
    }

    /** Folds optional prior context into the system prompt (Inworld has no separate history channel). */
    private static composeSystemPrompt(systemPrompt: string, initialContext?: string): string {
        const context = initialContext?.trim();
        return context ? `${systemPrompt}\n\n## Prior context\n${context}` : systemPrompt;
    }

    /**
     * Normalizes tool-call arguments to the Core contract's JSON-string shape. Inworld may emit them
     * pre-parsed (object) or already as a JSON string; both are coerced to a JSON string so consumers
     * always parse the same shape.
     */
    private static normalizeToolArguments(args: JSONValue | undefined): string {
        if (args == null) {
            return '{}';
        }
        if (typeof args === 'string') {
            return args;
        }
        return JSON.stringify(args);
    }

    /** Decodes a base64 audio payload into a freshly-allocated `ArrayBuffer`. */
    private static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}

/** The semantic kinds {@link InworldRealtimeSession.HandleServerEvent} routes inbound frames to. */
type InworldEventKind =
    | 'ready'
    | 'config-applied'
    | 'output-audio'
    | 'transcript-user-delta'
    | 'transcript-user-final'
    | 'transcript-assistant-delta'
    | 'transcript-assistant-final'
    | 'response-started'
    | 'response-done'
    | 'tool-call'
    | 'speech-started'
    | 'interruption'
    | 'usage'
    | 'error'
    | 'ignore';
