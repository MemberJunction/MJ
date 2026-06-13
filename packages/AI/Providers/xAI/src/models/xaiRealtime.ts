import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    RealtimeSessionError,
    JSONObject,
} from '@memberjunction/ai';
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
} from 'openai/resources/realtime/realtime';

/**
 * xAI's Grok Voice Agent API is OpenAI-Realtime-API compatible. Pointing the `openai` SDK's
 * client at this base URL makes its realtime WebSocket builder (`buildRealtimeURL`) derive the
 * provider socket — `wss://api.x.ai/v1/realtime?model=…` — directly from `client.baseURL`, so the
 * driver inherits the SDK's entire battle-tested OpenAI-realtime event protocol for free.
 */
const XAI_BASE_URL = 'https://api.x.ai/v1';

/**
 * The ASR model used to transcribe the USER's audio input. Grok Voice (like OpenAI Realtime)
 * accepts audio natively, so input transcription is a separate, opt-in pass — without it only the
 * assistant-side transcripts flow. Opting in server-bridged keeps the {@link IRealtimeSession}
 * contract's promise of BOTH-role transcripts. The value mirrors OpenAI's input-transcription
 * model name because the Grok Voice API is OpenAI-Realtime-compatible and accepts the same
 * `audio.input.transcription.model` field; deployments may override it via the session
 * {@link RealtimeSessionParams.Config} bag.
 */
const XAI_INPUT_TRANSCRIPTION_MODEL = 'whisper-1';

/**
 * Maps Core {@link RealtimeToolDefinition}s up to the OpenAI-realtime native function-tool schema
 * that Grok Voice consumes verbatim.
 *
 * @param tools The Core tool definitions to map.
 * @returns The realtime function-tool array.
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
 * Minimal connection surface the {@link xAIRealtime} driver depends on.
 *
 * This is the **injectable seam** for testing. It is a structural subset of the SDK's
 * `OpenAIRealtimeWebSocket` (which extends `OpenAIRealtimeEmitter`): the driver only ever uses
 * `on`, `off`, `send`, and `close`. Because the driver creates its connection through the
 * overridable {@link xAIRealtime.createConnection} method, unit tests subclass the driver and
 * return a fake connection implementing this interface — no network and no real WebSocket.
 *
 * The shape is identical to OpenAI's `IOpenAIRealtimeConnection` because Grok Voice speaks the
 * same wire protocol; it is redeclared here (not imported from the OpenAI provider) to keep this
 * package's public surface self-contained and avoid a cross-provider type re-export.
 */
export interface IxAIRealtimeConnection {
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
    /** Removes a previously-registered listener. See {@link IxAIRealtimeConnection.on} re: return type. */
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
 * xAI Grok Voice implementation of the {@link BaseRealtimeModel} primitive.
 *
 * xAI's Grok Voice Agent API is **OpenAI-Realtime-API compatible** (WebSocket endpoint
 * `wss://api.x.ai/v1/realtime`, Base64-encoded PCM16 @ 24 kHz audio, the same client/server event
 * protocol and tool-calling shape). This driver therefore **reuses the `openai` SDK's
 * `OpenAIRealtimeWebSocket`** with the client pointed at xAI's base URL (`https://api.x.ai/v1`),
 * inheriting the SDK's hardened event handling and authentication rather than re-implementing the
 * wire protocol against a bare `ws` socket.
 *
 * The driver opens a server-bridged duplex session, configures it (system prompt + tools + optional
 * initial context), and translates the provider's server-event stream into the modality-agnostic
 * {@link IRealtimeSession} contract.
 *
 * **Tool results** complete the tool-call loop: the returned session implements the Core
 * `IRealtimeSession.SendToolResult` contract method, which the agent layer calls after executing a
 * tool to feed its result back to the model. See {@link xAIRealtimeSession.SendToolResult}.
 *
 * Registered as `GrokRealtime` via `@RegisterClass(BaseRealtimeModel, 'GrokRealtime')`; the
 * associated `MJ: AI Model` is typed with the `Realtime` `AIModelType`.
 */
@RegisterClass(BaseRealtimeModel, 'GrokRealtime')
export class xAIRealtime extends BaseRealtimeModel {
    private _openAI: OpenAI;

    /**
     * @param apiKey The xAI API key used to authenticate the Grok Voice realtime socket.
     */
    constructor(apiKey: string) {
        super(apiKey);
        // Reuse the OpenAI SDK with the base URL redirected to xAI — the SDK's buildRealtimeURL()
        // derives the wss:// realtime endpoint from client.baseURL, so this is all that is needed
        // to target Grok Voice over the OpenAI-realtime-compatible protocol.
        this._openAI = new OpenAI({ apiKey, baseURL: XAI_BASE_URL });
    }

    /** Read-only accessor for the underlying (xAI-pointed) OpenAI SDK client. */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    /**
     * Creates the realtime connection for a model. Overridable seam for testing.
     *
     * Production returns a real `OpenAIRealtimeWebSocket` bound to the xAI-pointed client (so the
     * socket resolves to `wss://api.x.ai/v1/realtime`). Unit tests override this to return a fake
     * {@link IxAIRealtimeConnection} that emits provider-shaped events and captures sends.
     *
     * @param model The provider realtime model id (e.g. `grok-voice`).
     * @returns A connection implementing {@link IxAIRealtimeConnection}.
     */
    protected createConnection(model: string): IxAIRealtimeConnection {
        return new OpenAIRealtimeWebSocket({ model }, this._openAI);
    }

    /**
     * Opens a duplex realtime session, applies the session config, and returns the live handle.
     *
     * @param params Session configuration (model, system prompt, tools, initial context, config bag).
     * @returns A promise resolving to the {@link IRealtimeSession} handle.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const connection = this.createConnection(params.Model);
        const session = new xAIRealtimeSession(connection);
        session.applyInitialConfig(params);
        return session;
    }
}

/**
 * Live {@link IRealtimeSession} backed by an {@link IxAIRealtimeConnection}.
 *
 * Holds the registered handlers and the single `'event'` listener that fans the provider's
 * server-event stream out to the contract handlers via {@link xAIRealtimeSession.dispatch}.
 */
export class xAIRealtimeSession implements IRealtimeSession {
    private connection: IxAIRealtimeConnection;
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

    /**
     * Whether a model response is currently in flight. Minimal response tracking that mirrors the
     * OpenAI driver's state machine: set on `response.created` (and eagerly whenever this session
     * sends its own `response.create`, so back-to-back local triggers can't race the server event),
     * cleared on `response.done` — which the API emits for every terminal status, including
     * `cancelled` after barge-in, so the flag can never stick. Consumed by
     * {@link xAIRealtimeSession.handleInterruption} to gate TRUE barge-in (driver obligation #3) and
     * by {@link xAIRealtimeSession.RequestSpokenUpdate} to skip (not collide with) an active
     * response, since the API rejects overlapping `response.create` requests.
     */
    private responseActive = false;

    /**
     * @param connection The injectable provider-connection seam (a real `OpenAIRealtimeWebSocket`
     * in production, a fake in tests).
     */
    constructor(connection: IxAIRealtimeConnection) {
        this.connection = connection;
        this.eventListener = (event: RealtimeServerEvent) => this.dispatch(event);
        this.connection.on('event', this.eventListener);
        this.errorListener = (error: OpenAIRealtimeError) => this.handleConnectionError(error);
        this.connection.on('error', this.errorListener);
        // The SDK emitter has no close event; detect unexpected closure from the raw socket when
        // the connection exposes it (the real OpenAIRealtimeWebSocket does; fakes may omit it).
        this.connection.socket?.addEventListener('close', () => this.handleSocketClose());
    }

    /**
     * Applies the initial session config: system prompt + tools via `session.update`, optional
     * initial context as a user message. Called once by {@link xAIRealtime.StartSession}.
     *
     * Sending the full session config up front before reporting the session live honors driver
     * obligation #7 ("Ready" only after the session config is applied): the system prompt and tools
     * are on the socket before any turn can run.
     *
     * @param params The session parameters.
     */
    public applyInitialConfig(params: RealtimeSessionParams): void {
        this.sendSessionUpdate(params.SystemPrompt, params.Tools, params.Config);
        if (params.InitialContext && params.InitialContext.length > 0) {
            this.sendInitialContext(params.InitialContext);
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

    /**
     * @inheritdoc
     *
     * Grok Voice accepts arbitrary tool schemas on an open session via `session.update`, so a
     * post-start registration is sent straight through. A registration IDENTICAL to the set supplied
     * at connect time is harmless (the provider re-declares the same schemas), satisfying the
     * contract's idempotency rule.
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        this.connection.send({
            type: 'session.update',
            session: { type: 'realtime', tools: this.mapTools(tools) },
        });
    }

    /**
     * @inheritdoc
     *
     * Completes the tool-call loop for Grok Voice: sends a `conversation.item.create` with a
     * `function_call_output` item carrying the tool output, then a `response.create` so the model
     * continues the turn with the result in context. The result is always voiced and never dropped
     * (driver obligation #5).
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
     * on the next time it speaks, WITHOUT a `response.create` — so no spoken reply is forced. Item
     * creation is always safe mid-response, so no collision guard is needed here (unlike
     * {@link xAIRealtimeSession.RequestSpokenUpdate}).
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
     * **Collision behavior: skip.** The realtime API rejects a `response.create` while another
     * response is active, so when {@link responseActive} is set the request is dropped — interim
     * updates are disposable by contract (the next update or the final result supersedes them).
     * When sent, the flag is set eagerly (before the server's `response.created` echo) so two
     * back-to-back local triggers can't both fire.
     *
     * @param instructions Instructions for the single spoken update.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (this.responseActive) {
            return;
        }
        this.responseActive = true;
        this.connection.send({ type: 'response.create', response: { instructions } });
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
        this.connection.off('event', this.eventListener);
        this.connection.off('error', this.errorListener);
        this.connection.close();
    }

    // ---- Inbound event translation ----

    /**
     * Routes a provider server event to the matching contract handler. Each branch delegates to a
     * small, single-purpose handler to keep this dispatcher flat.
     *
     * @param event The Grok Voice (OpenAI-realtime-compatible) server event.
     */
    private dispatch(event: RealtimeServerEvent): void {
        switch (event.type) {
            case 'response.output_audio.delta':
                return this.handleAudioDelta(event.delta);
            case 'response.output_audio_transcript.delta':
                return this.emitTranscript('assistant', event.delta, false);
            case 'response.output_audio_transcript.done':
                return this.emitTranscript('assistant', event.transcript, true);
            case 'conversation.item.input_audio_transcription.delta':
                return this.emitTranscript('user', event.delta ?? '', false);
            case 'conversation.item.input_audio_transcription.completed':
                return this.emitTranscript('user', event.transcript, true);
            case 'response.function_call_arguments.done':
                return this.handleFunctionCall(event.call_id, event.name, event.arguments);
            case 'input_audio_buffer.speech_started':
                return this.handleInterruption();
            case 'response.created':
                // A response is in flight (whether server-VAD-triggered or locally triggered).
                this.responseActive = true;
                return;
            case 'response.done':
                // Emitted for every terminal status (completed, cancelled, failed) — always clears.
                this.responseActive = false;
                return this.handleResponseDone(event.response.usage);
            default:
                return;
        }
    }

    /** Decodes a base64 PCM16 audio delta and forwards it to the output handler. */
    private handleAudioDelta(deltaBase64: string): void {
        this.outputHandler?.(this.decodeBase64(deltaBase64));
    }

    /** Emits a transcript event to the transcript handler. */
    private emitTranscript(role: 'user' | 'assistant', text: string, isFinal: boolean): void {
        this.transcriptHandler?.({ Role: role, Text: text, IsFinal: isFinal });
    }

    /** Forwards a completed function call to the tool-call handler. */
    private handleFunctionCall(callId: string, name: string, args: string): void {
        this.toolCallHandler?.({ CallID: callId, ToolName: name, Arguments: args });
    }

    /**
     * Notifies the interruption handler of TRUE barge-in only: user speech that cut off an ACTIVE
     * model response. A `speech_started` while the model is idle is just the user taking their
     * normal turn — the {@link IRealtimeSession.OnInterruption} contract explicitly excludes it, so
     * the raw frame is gated on {@link responseActive} (the server-bridged topology's proxy for
     * "model output in flight"). The provider cancels its own turn and emits a terminal
     * `response.done`, which clears the flag.
     */
    private handleInterruption(): void {
        if (!this.responseActive) {
            return;
        }
        this.interruptionHandler?.();
    }

    /**
     * Classifies an SDK connection error and forwards it to the error handler. The SDK routes BOTH
     * kinds through its `'error'` emitter: provider `error` server frames carry a payload in
     * `error.error` (recoverable — the session stays open, `Fatal: false`) while transport-level
     * failures (socket error, unparseable frame, failed send) have no payload (`Fatal: true` —
     * including the credential/token-expiry case, which surfaces as a transport teardown, honoring
     * driver obligation #6).
     */
    private handleConnectionError(error: OpenAIRealtimeError): void {
        const isProviderFrame = error.error != null;
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
        this.errorHandler?.({ Message: 'xAI Grok Voice realtime connection closed unexpectedly', Fatal: true });
        this.closeHandler?.();
    }

    /** Translates a response's usage block into a {@link RealtimeUsage} update. */
    private handleResponseDone(usage: { input_tokens?: number; output_tokens?: number } | undefined): void {
        if (!usage) {
            return;
        }
        this.usageHandler?.({
            InputTokens: usage.input_tokens ?? 0,
            OutputTokens: usage.output_tokens ?? 0,
        });
    }

    // ---- Config helpers ----

    /** Sends the `session.update` that establishes instructions, input transcription, and tools. */
    private sendSessionUpdate(systemPrompt: string, tools?: RealtimeToolDefinition[], config?: JSONObject): void {
        const session: RealtimeSessionCreateRequest = {
            type: 'realtime',
            instructions: systemPrompt,
            // Opt into USER input transcription so user-role transcripts flow server-bridged too
            // (the contract promises BOTH roles). The config bag spreads after this so a
            // per-conversation override can still replace the audio block.
            audio: { input: { transcription: { model: XAI_INPUT_TRANSCRIPTION_MODEL } } },
            ...config,
        };
        if (tools && tools.length > 0) {
            session.tools = this.mapTools(tools);
        }
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

    /** Maps Core tool definitions up to the native function-tool schema (shared mapping). */
    private mapTools(tools: RealtimeToolDefinition[]): RealtimeFunctionTool[] {
        return mapRealtimeTools(tools);
    }

    // ---- Encoding helpers ----

    /** Encodes a raw PCM16 media frame as base64 for the provider's append event. */
    private encodeBase64(chunk: ArrayBuffer): string {
        return Buffer.from(chunk).toString('base64');
    }

    /** Decodes a base64 PCM16 audio delta into a freshly-allocated `ArrayBuffer`. */
    private decodeBase64(data: string): ArrayBuffer {
        const buffer = Buffer.from(data, 'base64');
        const out = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(out).set(buffer);
        return out;
    }
}
