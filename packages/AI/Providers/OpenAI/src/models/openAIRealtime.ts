import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionCapabilities,
    RealtimeReconfigureParams,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
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
 * **Tool results** complete the tool-call loop: the returned session implements the Core
 * `IRealtimeSession.SendToolResult` contract method, which the agent layer calls after executing a
 * tool to feed its result back to the model. See {@link OpenAIRealtimeSession.SendToolResult}.
 */
@RegisterClass(BaseRealtimeModel, 'OpenAIRealtime')
export class OpenAIRealtime extends BaseRealtimeModel {
    private _openAI: OpenAI;

    constructor(apiKey: string) {
        super(apiKey);
        this._openAI = new OpenAI({ apiKey });
    }

    /** Read-only accessor for the underlying OpenAI SDK client. */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    /**
     * Creates the realtime connection for a model. Overridable seam for testing.
     *
     * Production returns a real `OpenAIRealtimeWebSocket`. Unit tests override this to return a
     * fake {@link IOpenAIRealtimeConnection} that emits OpenAI-shaped events and captures sends.
     *
     * @param model The provider realtime model id (e.g. `gpt-realtime`).
     * @returns A connection implementing {@link IOpenAIRealtimeConnection}.
     */
    protected createConnection(model: string): IOpenAIRealtimeConnection {
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
        const session = new OpenAIRealtimeSession(connection);
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
     * Mints the ephemeral client secret via OpenAI's Realtime client-secrets API. Overridable
     * seam for testing — unit tests return a fake response so no network call is made.
     *
     * @param body The client-secret create request (carries the realtime session config).
     * @returns The OpenAI client-secret create response (token value + expiry + echoed session).
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
     * @param params Session configuration (model, system prompt, tools).
     * @returns The minted {@link ClientRealtimeSessionConfig} the browser authenticates + applies.
     */
    public override async CreateClientSession(params: RealtimeSessionParams): Promise<ClientRealtimeSessionConfig> {
        const session: RealtimeSessionCreateRequest = {
            type: 'realtime',
            model: params.Model,
            instructions: params.SystemPrompt,
        };
        if (params.Tools && params.Tools.length > 0) {
            session.tools = mapRealtimeTools(params.Tools);
        }
        // Enable transcription of the user's mic input so BOTH sides of the conversation are
        // captured (live captions + persisted ConversationDetail turns). Realtime models accept
        // audio natively, so input transcription is a separate ASR pass that must be opted into.
        // The OUTPUT voice comes from the effective config's per-provider voice (`params.Config.voice`,
        // shaped by GetProviderVoiceSettings) — this is what lets a co-agent's configured voice OR a
        // per-session override actually take effect in the client-direct topology.
        const voice = (params.Config as { voice?: string } | undefined)?.voice;
        session.audio = {
            input: { transcription: { model: OPENAI_INPUT_TRANSCRIPTION_MODEL } },
            ...(voice && voice.trim().length > 0 ? { output: { voice: voice.trim() } } : {}),
        };
        const response = await this.mintClientSecret({ session });
        return {
            Provider: 'openai',
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
 */
export class OpenAIRealtimeSession implements IRealtimeSession {
    private connection: IOpenAIRealtimeConnection;
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
     * client driver's state machine: set on `response.created` (and eagerly whenever this session
     * sends its own `response.create`, so back-to-back local triggers can't race the server event),
     * cleared on `response.done` — which the API emits for every terminal status, including
     * `cancelled` after barge-in, so the flag can never stick. Consumed by
     * {@link OpenAIRealtimeSession.RequestSpokenUpdate} to skip (not collide with) an active
     * response, since the API rejects overlapping `response.create` requests.
     */
    private responseActive = false;

    constructor(connection: IOpenAIRealtimeConnection) {
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
     * Applies the initial session config: system prompt + tools via `session.update`, optional initial
     * context as a user message. Called once by {@link OpenAIRealtime.StartSession}.
     *
     * **Deferred to `session.created`.** When `StartSession` returns, the realtime WebSocket is NOT open yet
     * — sending `session.update` synchronously races the handshake and the instructions (the **system
     * prompt + tools**) are silently dropped, so the model runs with NO prompt (no identity, no companion
     * framing). We therefore wait for the server's `session.created` frame — the first event once the socket
     * is open and the session exists, and the canonical moment to configure a realtime session — exactly the
     * point the browser/client-direct path applies its config. Idempotent (a re-emitted `session.created`
     * can't double-apply); the listener removes itself once it fires.
     *
     * @param params The session parameters.
     */
    public applyInitialConfig(params: RealtimeSessionParams): void {
        let applied = false;
        const applyWhenReady = (event: RealtimeServerEvent): void => {
            if (applied || event.type !== 'session.created') {
                return;
            }
            applied = true;
            this.connection.off('event', applyWhenReady);
            this.sendSessionUpdate(params.SystemPrompt, params.Tools, params.Config);
            if (params.InitialContext && params.InitialContext.length > 0) {
                this.sendInitialContext(params.InitialContext);
            }
        };
        this.connection.on('event', applyWhenReady);
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
     * @param instructions Instructions for the single spoken update.
     */
    public RequestSpokenUpdate(instructions: string): void {
        if (this.responseActive) {
            return;
        }
        this.responseActive = true;
        this.connection.send({ type: 'response.create', response: { instructions } });
    }

    /** @inheritdoc — OpenAI's `session.update` is runtime-mutable, so a live turn-mode change is supported. */
    public get Capabilities(): RealtimeSessionCapabilities {
        return { CanReconfigureTurnMode: true };
    }

    /**
     * @inheritdoc
     *
     * Live turn-mode change via a partial `session.update` — flips server-VAD auto-response on/off without
     * reconnecting (e.g. re-gate a 1:1 agent to meeting mode when its room becomes multi-agent). The input
     * transcription block is re-sent alongside so the partial update can't drop it.
     */
    public Reconfigure(params: RealtimeReconfigureParams): void {
        const disable = params.DisableAutoResponse === true;
        const turnDetection: RealtimeAudioInputTurnDetection = {
            type: 'server_vad',
            create_response: !disable,
            interrupt_response: true,
        };
        this.connection.send({
            type: 'session.update',
            session: {
                type: 'realtime',
                audio: { input: { transcription: { model: OPENAI_INPUT_TRANSCRIPTION_MODEL }, turn_detection: turnDetection } },
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
        this.connection.off('event', this.eventListener);
        this.connection.off('error', this.errorListener);
        this.connection.close();
    }

    // ---- Inbound event translation ----

    /**
     * Routes a provider server event to the matching contract handler. Each branch delegates to a
     * small, single-purpose handler to keep this dispatcher flat.
     *
     * @param event The OpenAI realtime server event.
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

    /** Decodes a base64 audio delta and forwards it to the output handler. */
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
        this.errorHandler?.({ Message: 'OpenAI realtime connection closed unexpectedly', Fatal: true });
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
        // Pull the host-neutral meeting flag OUT of the open Config bag so it is never sent raw to the API.
        // In a multi-agent meeting the BRIDGE (after its turn policy gates on addressing), not the model,
        // decides WHEN to speak — so we disable server-VAD auto-response while KEEPING detection so input
        // transcription and barge-in still work. A 1:1 call (flag absent) keeps the default auto-response.
        const cfg = { ...(config ?? {}) } as JSONObject & { disableAutoResponse?: boolean };
        const disableAutoResponse = cfg.disableAutoResponse === true;
        delete cfg.disableAutoResponse;

        const turnDetection: RealtimeAudioInputTurnDetection | undefined = disableAutoResponse
            ? { type: 'server_vad', create_response: false, interrupt_response: true }
            : undefined;

        const session: RealtimeSessionCreateRequest = {
            type: 'realtime',
            instructions: systemPrompt,
            // Opt into USER input transcription — the same opt-in CreateClientSession applies for
            // the client-direct topology — so user-role transcripts flow server-bridged too (the
            // contract promises BOTH roles). The config bag spreads after this so a
            // per-conversation override can still replace the audio block.
            audio: { input: { transcription: { model: OPENAI_INPUT_TRANSCRIPTION_MODEL }, ...(turnDetection ? { turn_detection: turnDetection } : {}) } },
            ...cfg,
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
