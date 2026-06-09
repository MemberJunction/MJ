// Google Gemini Live API imports
import {
    GoogleGenAI,
    Modality,
    type LiveServerMessage,
    type LiveServerContent,
    type LiveConnectConfig,
    type FunctionDeclaration,
    type FunctionCall,
    type FunctionResponse,
    type Content,
    type Part,
    type Blob as GeminiBlob,
} from '@google/genai';

// MemberJunction AI core contract
import {
    BaseRealtimeModel,
    type IRealtimeSession,
    type RealtimeSessionParams,
    type RealtimeToolDefinition,
    type RealtimeTranscript,
    type RealtimeToolCall,
    type RealtimeUsage,
    type JSONObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * MIME type Gemini Live expects for client-streamed audio: 16-bit signed PCM at 16 kHz, mono.
 * Output audio from the model is 24 kHz PCM; the driver passes output frames through untouched as
 * raw `ArrayBuffer` and leaves resampling/playback to the consumer.
 */
const GEMINI_INPUT_AUDIO_MIME_TYPE = 'audio/pcm;rate=16000';

/**
 * The minimal subset of `@google/genai`'s `Session` that the realtime driver depends on. Declaring
 * the seam as an interface (rather than the concrete SDK `Session`) lets unit tests inject a fully
 * in-memory fake that drives the registered callbacks with Gemini-shaped messages and captures
 * outbound calls — no websocket, no network.
 */
export interface GeminiLiveSession {
    /** Streams a realtime media frame (audio now) to the model. */
    sendRealtimeInput(params: { audio?: GeminiBlob; media?: GeminiBlob }): void;
    /** Appends client content (used to seed initial context) to the conversation. */
    sendClientContent(params: { turns?: Content[]; turnComplete?: boolean }): void;
    /** Replies to a server tool call with one or more function responses. */
    sendToolResponse(params: { functionResponses: FunctionResponse[] | FunctionResponse }): void;
    /** Terminates the underlying connection. */
    close(): void;
}

/**
 * Concrete arguments handed to {@link GeminiRealtime.connectLiveSession}. Bundles the resolved
 * connect config (system instruction, tools, modalities, transcription) and the message callback so
 * the seam owns the entire `ai.live.connect` call and tests can substitute it wholesale.
 */
export interface GeminiConnectArgs {
    /** The Gemini Live model id to open the session against. */
    Model: string;
    /** The fully-built connect config (system instruction, tools, modalities, transcription, plus the open config bag). */
    Config: LiveConnectConfig;
    /** Invoked for every {@link LiveServerMessage} the server emits over the session. */
    OnMessage: (message: LiveServerMessage) => void;
}

/**
 * Real-time, full-duplex driver for Google's **Gemini Live API**, implementing the Core
 * {@link BaseRealtimeModel} primitive.
 *
 * The driver opens a bidirectional Gemini Live session, streams client audio in, and translates the
 * provider's {@link LiveServerMessage} frames into the modality-agnostic Core events
 * ({@link RealtimeTranscript}, {@link RealtimeToolCall}, {@link RealtimeUsage}, output media, and
 * interruption). It registers via the MemberJunction class factory as `GeminiRealtime` and is
 * resolved for `MJ: AI Models` typed `Realtime`.
 *
 * **Testability:** the live-session creation is isolated behind the overridable
 * {@link connectLiveSession} seam, so unit tests inject a fake {@link GeminiLiveSession} and exercise
 * the full message→event translation with no network.
 */
@RegisterClass(BaseRealtimeModel, 'GeminiRealtime')
export class GeminiRealtime extends BaseRealtimeModel {
    private geminiClient: GoogleGenAI | null = null;

    constructor(apiKey: string) {
        super(apiKey);
        // Client is created lazily in connectLiveSession so subclasses (and tests overriding the
        // seam) never trigger an unused live client construction.
    }

    /**
     * Opens a Gemini Live session and returns the Core session handle that translates between the
     * provider's frames and the MemberJunction realtime contract.
     */
    public async StartSession(params: RealtimeSessionParams): Promise<IRealtimeSession> {
        const session = new GeminiRealtimeSession();
        const config = this.buildConnectConfig(params);
        const live = await this.connectLiveSession({
            Model: params.Model,
            Config: config,
            OnMessage: (message) => session.HandleServerMessage(message),
        });
        session.AttachLiveSession(live);
        // If the caller provided initial context, seed it as client content (without completing the
        // turn) so the model starts with the same history a loop agent would assemble.
        if (params.InitialContext && params.InitialContext.trim().length > 0) {
            session.SeedInitialContext(params.InitialContext);
        }
        return session;
    }

    /**
     * Creation seam for the underlying Gemini Live session.
     *
     * Production code routes through `ai.live.connect`; unit tests override this method to inject a
     * fake {@link GeminiLiveSession}. Kept as a thin, single-responsibility method so the network
     * boundary is the *only* thing tests need to replace.
     *
     * @param args Resolved model, connect config, and the server-message callback.
     * @returns A promise resolving to the live session handle.
     */
    protected async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        const client = this.ensureClient();
        return client.live.connect({
            model: args.Model,
            config: args.Config,
            callbacks: {
                onmessage: args.OnMessage,
            },
        });
    }

    /**
     * Lazily constructs the `GoogleGenAI` client from the driver's API key.
     */
    private ensureClient(): GoogleGenAI {
        if (!this.geminiClient) {
            this.geminiClient = new GoogleGenAI({ apiKey: this.apiKey });
        }
        return this.geminiClient;
    }

    /**
     * Builds the {@link LiveConnectConfig} from the Core session params: audio response modality,
     * input/output transcription, system instruction, mapped tools, plus any provider-specific
     * overrides from the open config bag.
     */
    private buildConnectConfig(params: RealtimeSessionParams): LiveConnectConfig {
        const config: LiveConnectConfig = {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: params.SystemPrompt,
        };
        if (params.Tools && params.Tools.length > 0) {
            config.tools = [{ functionDeclarations: GeminiRealtime.MapToolsToFunctionDeclarations(params.Tools) }];
        }
        // The open config bag is merged last so per-conversation overrides (voice, language,
        // turn-taking) win over the defaults above. Cast through the shared JSON object shape.
        if (params.Config) {
            Object.assign(config, params.Config as Partial<LiveConnectConfig>);
        }
        return config;
    }

    /**
     * Maps Core {@link RealtimeToolDefinition}s up to Gemini {@link FunctionDeclaration}s.
     *
     * The Core `ParametersSchema` is a JSON-schema object, so it rides in `parametersJsonSchema`
     * (the SDK's JSON-schema slot) rather than the OpenAPI-style `parameters` slot.
     */
    public static MapToolsToFunctionDeclarations(tools: RealtimeToolDefinition[]): FunctionDeclaration[] {
        return tools.map((tool) => ({
            name: tool.Name,
            description: tool.Description,
            parametersJsonSchema: tool.ParametersSchema,
        }));
    }
}

/**
 * Concrete {@link IRealtimeSession} backed by a Gemini Live {@link GeminiLiveSession}.
 *
 * Owns the inbound translation (Gemini {@link LiveServerMessage} → Core events) and the outbound
 * translation (Core calls → Gemini send methods). It is created by {@link GeminiRealtime.StartSession}
 * and never instantiated directly by consumers.
 */
class GeminiRealtimeSession implements IRealtimeSession {
    private live: GeminiLiveSession | null = null;

    private outputHandler: ((chunk: ArrayBuffer) => void) | null = null;
    private transcriptHandler: ((t: RealtimeTranscript) => void) | null = null;
    private toolCallHandler: ((call: RealtimeToolCall) => void) | null = null;
    private interruptionHandler: (() => void) | null = null;
    private usageHandler: ((u: RealtimeUsage) => void) | null = null;

    /**
     * Binds the underlying live session. Called by the driver once `connect` resolves.
     */
    public AttachLiveSession(live: GeminiLiveSession): void {
        this.live = live;
    }

    /**
     * Seeds the conversation with prior context as a client-content turn (not turn-complete), so the
     * model has the same starting history a loop agent would assemble.
     */
    public SeedInitialContext(context: string): void {
        const turns: Content[] = [{ role: 'user', parts: [{ text: context }] }];
        this.requireLive().sendClientContent({ turns, turnComplete: false });
    }

    /** @inheritdoc */
    public SendInput(chunk: ArrayBuffer): void {
        const audio: GeminiBlob = {
            data: GeminiRealtimeSession.ArrayBufferToBase64(chunk),
            mimeType: GEMINI_INPUT_AUDIO_MIME_TYPE,
        };
        this.requireLive().sendRealtimeInput({ audio });
    }

    /**
     * @inheritdoc
     *
     * Gemini Live binds its tool set at connect time via {@link LiveConnectConfig.tools}. The
     * provider does not support re-declaring arbitrary tool schemas on an already-open session, so
     * the canonical path is to pass `params.Tools` to `StartSession`. This post-start call maps and
     * resends the declarations as client content for parity, but the *callable* tool set the model
     * may invoke is the one established at connect time.
     */
    public async RegisterTools(tools: RealtimeToolDefinition[]): Promise<void> {
        const declarations = GeminiRealtime.MapToolsToFunctionDeclarations(tools);
        const turns: Content[] = [{
            role: 'user',
            parts: declarations.map((d): Part => ({ text: JSON.stringify(d) })),
        }];
        this.requireLive().sendClientContent({ turns, turnComplete: false });
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

    /**
     * Sends a tool result back to the model.
     *
     * The Core {@link IRealtimeSession} contract intentionally has no explicit "send tool result"
     * method — tool execution and result-feeding are owned by the agent layer above this primitive.
     * This driver-specific method is the seam through which that layer feeds results back; it is not
     * part of the cross-provider contract, so the contract is left unchanged. The `CallID` is matched
     * to the originating {@link RealtimeToolCall} via the function-response `id`.
     *
     * @param callId The originating tool call's id.
     * @param toolName The tool name the result is for.
     * @param result The tool's structured result.
     */
    public SendToolResult(callId: string, toolName: string, result: JSONObject): void {
        const functionResponse: FunctionResponse = {
            id: callId,
            name: toolName,
            response: result,
        };
        this.requireLive().sendToolResponse({ functionResponses: [functionResponse] });
    }

    /** @inheritdoc */
    public async Close(): Promise<void> {
        this.live?.close();
        this.live = null;
        this.clearHandlers();
    }

    /**
     * Entry point for an inbound {@link LiveServerMessage}. Fans the message out to the focused
     * per-concern handlers so each translation unit stays small and testable.
     */
    public HandleServerMessage(message: LiveServerMessage): void {
        if (message.serverContent) {
            this.handleServerContent(message.serverContent);
        }
        if (message.toolCall) {
            this.handleToolCall(message.toolCall.functionCalls);
        }
        if (message.usageMetadata) {
            this.handleUsage(message.usageMetadata.promptTokenCount, message.usageMetadata.responseTokenCount);
        }
    }

    /**
     * Translates a {@link LiveServerContent} frame: model audio output, input/output transcription,
     * and interruption.
     */
    private handleServerContent(content: LiveServerContent): void {
        if (content.interrupted) {
            this.interruptionHandler?.();
        }
        if (content.modelTurn) {
            this.emitAudioOutput(content.modelTurn);
        }
        if (content.inputTranscription) {
            this.emitTranscript('user', content.inputTranscription.text, content.inputTranscription.finished);
        }
        if (content.outputTranscription) {
            this.emitTranscript('assistant', content.outputTranscription.text, content.outputTranscription.finished);
        }
    }

    /**
     * Extracts inline audio parts from the model turn and forwards each as a raw `ArrayBuffer`.
     */
    private emitAudioOutput(modelTurn: Content): void {
        if (!this.outputHandler || !modelTurn.parts) {
            return;
        }
        for (const part of modelTurn.parts) {
            const data = part.inlineData?.data;
            if (data) {
                this.outputHandler(GeminiRealtimeSession.Base64ToArrayBuffer(data));
            }
        }
    }

    /**
     * Emits a transcript event, defaulting missing text to empty and `finished` to a partial update.
     */
    private emitTranscript(role: 'user' | 'assistant', text: string | undefined, finished: boolean | undefined): void {
        if (!this.transcriptHandler) {
            return;
        }
        this.transcriptHandler({ Role: role, Text: text ?? '', IsFinal: finished ?? false });
    }

    /**
     * Translates Gemini {@link FunctionCall}s into Core {@link RealtimeToolCall}s, serializing the
     * arguments object to the JSON-string form the contract specifies.
     */
    private handleToolCall(functionCalls: FunctionCall[] | undefined): void {
        if (!this.toolCallHandler || !functionCalls) {
            return;
        }
        for (const call of functionCalls) {
            this.toolCallHandler({
                CallID: call.id ?? '',
                ToolName: call.name ?? '',
                Arguments: JSON.stringify(call.args ?? {}),
            });
        }
    }

    /**
     * Emits an incremental usage update, defaulting missing token counts to zero.
     */
    private handleUsage(promptTokens: number | undefined, responseTokens: number | undefined): void {
        this.usageHandler?.({ InputTokens: promptTokens ?? 0, OutputTokens: responseTokens ?? 0 });
    }

    /** Drops all registered handlers so a closed session can't fire stale callbacks. */
    private clearHandlers(): void {
        this.outputHandler = null;
        this.transcriptHandler = null;
        this.toolCallHandler = null;
        this.interruptionHandler = null;
        this.usageHandler = null;
    }

    /** Returns the bound live session or throws if it was never attached / already closed. */
    private requireLive(): GeminiLiveSession {
        if (!this.live) {
            throw new Error('Gemini realtime session is not open (no live session attached or it was closed).');
        }
        return this.live;
    }

    /** Encodes an `ArrayBuffer` of raw bytes to a base64 string for Gemini's `Blob.data`. */
    private static ArrayBufferToBase64(buffer: ArrayBuffer): string {
        return Buffer.from(new Uint8Array(buffer)).toString('base64');
    }

    /** Decodes a base64 `Blob.data` string from Gemini into a raw `ArrayBuffer`. */
    private static Base64ToArrayBuffer(base64: string): ArrayBuffer {
        const bytes = Buffer.from(base64, 'base64');
        // Copy into a freshly-allocated ArrayBuffer so we never leak the surrounding Node pool buffer
        // (and so the result is a plain ArrayBuffer, not ArrayBufferLike).
        const out = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(out).set(bytes);
        return out;
    }
}
