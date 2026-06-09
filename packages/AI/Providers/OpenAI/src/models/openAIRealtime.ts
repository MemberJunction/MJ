import { RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeModel,
    IRealtimeSession,
    RealtimeSessionParams,
    RealtimeToolDefinition,
    RealtimeTranscript,
    RealtimeToolCall,
    RealtimeUsage,
    JSONObject,
} from '@memberjunction/ai';
import { OpenAI } from 'openai';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type {
    RealtimeClientEvent,
    RealtimeServerEvent,
    RealtimeFunctionTool,
    RealtimeConversationItemFunctionCallOutput,
    RealtimeConversationItemUserMessage,
    RealtimeSessionCreateRequest,
} from 'openai/resources/realtime/realtime';

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
    /** Removes a previously-registered listener. See {@link IOpenAIRealtimeConnection.on} re: return type. */
    off(event: 'event', listener: (event: RealtimeServerEvent) => void): void;
    /** Sends a client event to the realtime API. */
    send(event: RealtimeClientEvent): void;
    /** Closes the underlying socket. */
    close(props?: { code: number; reason: string }): void;
}

/**
 * OpenAI implementation of the {@link BaseRealtimeModel} primitive, backed by OpenAI's
 * Realtime API over a WebSocket (`OpenAIRealtimeWebSocket` from the `openai` SDK, v6.18.0).
 *
 * The driver opens a duplex session, configures it (system prompt + tools + optional initial
 * context), and translates the provider's server-event stream into the modality-agnostic
 * {@link IRealtimeSession} contract.
 *
 * **Tool results** are not part of the Core `IRealtimeSession` contract (which only models the
 * inbound tool-call request). The returned session therefore exposes an additional
 * {@link OpenAIRealtimeSession.SubmitToolResult} method that the agent layer calls to feed a tool
 * result back to the model. See that method's docs and the package notes for details.
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
    private eventListener: (event: RealtimeServerEvent) => void;

    constructor(connection: IOpenAIRealtimeConnection) {
        this.connection = connection;
        this.eventListener = (event: RealtimeServerEvent) => this.dispatch(event);
        this.connection.on('event', this.eventListener);
    }

    /**
     * Applies the initial session config: system prompt + tools via `session.update`, optional
     * initial context as a user message. Called once by {@link OpenAIRealtime.StartSession}.
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

    /** @inheritdoc */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        this.connection.send({
            type: 'session.update',
            session: { type: 'realtime', tools: this.mapTools(tools) },
        });
    }

    /**
     * Submits a tool result back to the model and requests a new response.
     *
     * **Contract note:** the Core `IRealtimeSession` interface intentionally models only the
     * *inbound* tool-call request ({@link IRealtimeSession.OnToolCall}); it has no explicit method
     * for returning the result. This method is the provider-specific completion of that loop — the
     * agent layer (which holds the typed session) calls it after executing the tool. It sends a
     * `conversation.item.create` with a `function_call_output` item, then a `response.create` so
     * the model continues the turn with the result in context.
     *
     * @param callId The `CallID` from the {@link RealtimeToolCall}.
     * @param output The tool's output as a string (JSON or free text).
     */
    public SubmitToolResult(callId: string, output: string): void {
        const item: RealtimeConversationItemFunctionCallOutput = {
            type: 'function_call_output',
            call_id: callId,
            output,
        };
        this.connection.send({ type: 'conversation.item.create', item });
        this.connection.send({ type: 'response.create' });
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
    public async Close(): Promise<void> {
        this.connection.off('event', this.eventListener);
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
            case 'response.done':
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

    /** Notifies the interruption handler of provider-detected barge-in. */
    private handleInterruption(): void {
        this.interruptionHandler?.();
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

    /** Sends the `session.update` that establishes instructions and tools. */
    private sendSessionUpdate(systemPrompt: string, tools?: RealtimeToolDefinition[], config?: JSONObject): void {
        const session: RealtimeSessionCreateRequest = {
            type: 'realtime',
            instructions: systemPrompt,
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

    /** Maps Core tool definitions up to OpenAI's native function-tool schema. */
    private mapTools(tools: RealtimeToolDefinition[]): RealtimeFunctionTool[] {
        return tools.map((tool) => ({
            type: 'function',
            name: tool.Name,
            description: tool.Description,
            parameters: tool.ParametersSchema,
        }));
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
