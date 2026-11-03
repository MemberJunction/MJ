

// Google Gemini Import
import { GoogleGenAI, ApiError, Content, Part, Blob, FileData, FunctionDeclaration, FunctionCallingConfigMode, ToolConfig, ToolListUnion, GenerateContentResponseUsageMetadata, ThinkingConfig } from "@google/genai";

// MJ stuff
import { BaseLLM, ChatMessage, ChatParams, ChatResult, SummarizeParams, SummarizeResult, StreamingChatCallbacks, ChatMessageContent, ChatMessageContentBlock, ModelUsage, ErrorAnalyzer, FileCapabilities, ChatToolCall, ChatReasoningBlock, CHAT_FINISH_REASON_TOOL_CALLS, CHAT_FINISH_REASON_MALFORMED_TOOL_CALL, CHAT_FINISH_REASON_UNEXPECTED_TOOL_CALL } from "@memberjunction/ai";
import { RegisterClass, ToJSONSafe } from "@memberjunction/global";
import { AcceptsCustomSampling } from "./geminiSampling";
import { GeminiThinkingFallback, ResolveGeminiThinkingConfig } from "./geminiThinking";

/**
 * Snapshot of a request's cacheable-prefix info, captured so the GEMINI_CACHE_DEBUG diagnostics
 * can report it next to the provider's reported cache usage. The hash lets you compare two
 * "identical" runs: if the systemInstruction hash differs, the prefix is NOT byte-stable (e.g. a
 * timestamp/date is embedded in the system prompt), which silently defeats Gemini's implicit cache.
 */
type GeminiCacheDiagContext = {
    model: string;
    systemInstructionChars: number;
    systemInstructionHash: string;
    historyLength: number;
};

/** Minimal shape of the fields we read off Gemini's usageMetadata for diagnostics. */
type GeminiUsageMetadataLike = {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
};

/**
 * Gemini 3 requires a `thoughtSignature` on every replayed `functionCall` part. Calls the model made
 * carry their own (kept on `ChatToolCall.providerMetadata`); calls constructed outside the model —
 * a corpus history, a conversation transferred from another provider — use this documented
 * placeholder, which tells Gemini to skip signature validation for that part.
 */
const GEMINI_INJECTED_CALL_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

/**
 * Where a thought signature was minted: serving endpoint plus model. A signature only validates where
 * it came from — after a failover from Google AI Studio to Vertex AI (or the reverse), or onto another
 * Gemini model, replaying it is a hard 400 "Corrupted thought signature." Recorded beside the signature
 * on capture, compared on replay, and a foreign signature is replaced with the placeholder.
 */
const THOUGHT_SIGNATURE_ORIGIN_KEY = 'thoughtSignatureOrigin';

/** The `provider` this driver (and Vertex, which extends it) stamps on its {@link ChatReasoningBlock}s. */
const GEMINI_REASONING_PROVIDER = 'gemini';

/**
 * The user turn Gemini is given when a conversation would otherwise open with a model turn.
 *
 * Gemini requires `contents` to begin with a user turn, and enforces it hard for tool calls: a
 * `functionCall` turn is valid only "immediately after a user turn or after a function response
 * turn" (400 INVALID_ARGUMENT otherwise). An agent whose whole task lives in the system
 * instruction — Skip's agents send no user message at all — reaches its tool-result turn with
 * `[model(functionCall…), user(functionResponse…)]` and is rejected; the same agent on the envelope
 * path was tolerated only because a leading model TEXT turn is. The text names where the task is,
 * so the model reads it as the opening request rather than as noise.
 */
export const GEMINI_LEADING_USER_TURN_TEXT = 'Proceed with the task described in the system instructions.';

/**
 * The user turn Gemini is given when a conversation would otherwise end with a model turn.
 *
 * Gemini answers a request whose last turn is the user's; one ending with a model turn is a 400
 * ("Requests ending with a model turn are not supported"). The driver sends the last turn as the
 * new message, and the SDK always sends that message as a user turn, so a trailing model turn would
 * otherwise go out with its own parts relabelled as the user's. It stays a model turn in the
 * history instead, and this turn asks the model to go on. Gemini models here take no assistant
 * prefill, so no caller means a trailing model turn as one.
 */
export const GEMINI_TRAILING_USER_TURN_TEXT = 'Continue with the task.';

@RegisterClass(BaseLLM, "GeminiLLM")
export class GeminiLLM extends BaseLLM {
    protected _gemini: GoogleGenAI | null = null;
    private _geminiPromise: Promise<GoogleGenAI> | null = null;

    // State tracking for streaming thinking extraction
    private _streamingState: {
        accumulatedThinking: string;
        inThinkingBlock: boolean;
        pendingContent: string;
        thinkingComplete: boolean;
    } = {
        accumulatedThinking: '',
        inThinkingBlock: false,
        pendingContent: '',
        thinkingComplete: false
    };

    // Diagnostic context for the in-flight streaming request, used only by the GEMINI_CACHE_DEBUG
    // logging path so the final chunk's usage can be reported alongside the request's prefix info.
    private _cacheDiagContext: GeminiCacheDiagContext | null = null;

    constructor(apiKey: string) {
        super(apiKey);
        // Note: We don't initialize the client here to allow subclasses to set up first
        // Initialization happens lazily on first use via ensureGeminiClient()
    }

    /**
     * Factory method to create the GoogleGenAI client instance
     * Subclasses can override this to provide custom configuration
     *
     * @returns Promise that resolves to a configured GoogleGenAI client
     */
    protected async createClient(): Promise<GoogleGenAI> {
        return new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * Ensure the Gemini client is initialized before use
     * This method should be called at the start of any method that uses the client
     */
    private async ensureGeminiClient(): Promise<GoogleGenAI> {
        if (this._gemini) {
            return this._gemini;
        }

        if (!this._geminiPromise) {
            this._geminiPromise = this.createClient();
        }

        this._gemini = await this._geminiPromise;
        return this._gemini;
    }

    /**
     * Gemini supports a wide range of file types natively, including via the Files API.
     */
    public override GetFileCapabilities(): FileCapabilities | null {
        return {
            SupportedMimeTypes: [
                'application/pdf',
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'audio/mp3', 'audio/wav', 'audio/ogg',
                'video/mp4', 'video/webm',
                'text/plain', 'text/csv', 'text/html',
            ],
            MaxFileSize: 20 * 1024 * 1024,
            MaxFilesPerRequest: 10,
            HasFileAPI: true,
        };
    }

    /**
     * Read only getter method to get the Gemini client instance
     * Note: This is async now because the client may not be initialized yet
     */
    public get GeminiClient(): GoogleGenAI {
        if (!this._gemini) {
            throw new Error('Gemini client not initialized. Ensure async initialization is complete before accessing GeminiClient.');
        }
        return this._gemini;
    }

    /**
     * Gemini supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Gemini natively supports tool calling (`functionDeclarations` / `functionCall` /
     * `functionResponse` parts).
     */
    public override get SupportsTools(): boolean {
        return true;
    }

    /**
     * Shapes converted messages into the alternating `contents` Gemini accepts: consecutive turns of
     * one role are combined, and the conversation opens with a user turn (see
     * {@link GEMINI_LEADING_USER_TURN_TEXT}).
     *
     * Two exceptions to combining:
     * - A model turn with nothing in it (an assistant message with no text, no calls and no
     *   reasoning) is dropped. It carries nothing, and Gemini rejects an empty turn.
     * - A user turn that follows a function-response turn is kept as a turn of its own. Vertex AI
     *   rejects a turn whose function responses are followed by text with "Requests ending with a
     *   model turn are not supported", although the turn is the user's. Google AI Studio accepts both
     *   shapes. The agent loop sends exactly this: a tool turn, then its per-turn runtime-state message.
     */
    protected geminiMessageSpacing(messages: Content[]): Content[] {
        const result: Content[] = [];
        for (const message of messages) {
            if (GeminiLLM.isEmptyModelTurn(message)) {
                continue;
            }
            const current = result[result.length - 1];
            if (current && current.role === message.role && !GeminiLLM.endsFunctionResponseTurn(current, message)) {
                current.parts = [...(current.parts ?? []), ...(message.parts ?? [])];
            } else {
                result.push({ role: message.role, parts: [...(message.parts ?? [])] });
            }
        }
        if (result.length > 0 && result[0].role === 'model') {
            result.unshift({ role: 'user', parts: [{ text: GEMINI_LEADING_USER_TURN_TEXT }] });
        }
        return result;
    }

    /** Whether a turn is a model turn with nothing in it: no parts, or only empty text with no signature. */
    private static isEmptyModelTurn(content: Content): boolean {
        return content.role === 'model'
            && (content.parts ?? []).every((p) => p.text === '' && !p.thoughtSignature && !p.thought && Object.keys(p).length === 1);
    }

    /** Whether `next` is a user turn of other parts after a function-response turn, and so must stay separate. */
    private static endsFunctionResponseTurn(current: Content, next: Content): boolean {
        const hasResponses = (c: Content) => (c.parts ?? []).some((p) => !!p.functionResponse);
        return current.role === 'user' && hasResponses(current) && !(next.parts ?? []).every((p) => !!p.functionResponse);
    }

    /**
     * Splits shaped `contents` into the chat history and the message to send. The SDK sends the
     * message as a user turn, so only a user turn is taken off the end. A conversation that ends
     * with a model turn keeps it in the history and sends {@link GEMINI_TRAILING_USER_TURN_TEXT};
     * one with no turns at all sends {@link GEMINI_LEADING_USER_TURN_TEXT}, since Vertex AI rejects
     * an empty message ("Model input cannot be empty").
     */
    protected SplitForSend(contents: Content[]): { history: Content[]; message: Part[] } {
        const last = contents[contents.length - 1];
        if (!last) {
            return { history: [], message: [{ text: GEMINI_LEADING_USER_TURN_TEXT }] };
        }
        if (last.role === 'model') {
            return { history: contents, message: [{ text: GEMINI_TRAILING_USER_TURN_TEXT }] };
        }
        return { history: contents.slice(0, -1), message: last.parts?.length ? last.parts : [{ text: GEMINI_LEADING_USER_TURN_TEXT }] };
    }

    /**
     * Implementation of non-streaming chat completion for Gemini
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        try {
            // For text-only input, use the gemini-pro model
            const modelName = params.model || "gemini-pro";
            
            // Filter out system messages and extract system instruction content
            const noSystemMessages = params.messages.filter(m => m.role !== 'system');
            const sysPrompts = params.messages.filter(m => m.role === 'system');
            const systemInstructionText = sysPrompts.length > 0
                ? sysPrompts.map(m => GeminiLLM.mjContentToSystemInstructionText(m.content)).join('\n\n')
                : '';

            // Convert all non-system messages and apply role alternation
            const signatureOrigin = this.thoughtSignatureOrigin(modelName);
            const convertedMessages = noSystemMessages.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m, signatureOrigin));
            const tempMessages = this.geminiMessageSpacing(convertedMessages);

            // All but the last user turn go in the history; that turn is the message sent. The system
            // prompt is passed via systemInstruction (below), NOT bundled into the user message —
            // bundling put the stable prompt AFTER the variable history, defeating Gemini's implicit
            // prompt caching.
            const { history, message: finalMessageParts } = this.SplitForSend(tempMessages);

            // Sampling + response-format options, shaped for the model's version (see buildGenerationOptions)
            const modelOptions = this.buildGenerationOptions(params, modelName);

            // Ensure Gemini client is initialized
            const client = await this.ensureGeminiClient();

            // Pass the system prompt as systemInstruction (a plain string — a string[] is invalid and
            // was the original reason this was bundled into the message). It becomes the stable,
            // cacheable prefix so Gemini's implicit cache can engage across turns.
            // NOTE: @google/genai's sendMessage `config` REPLACES (not merges) the session config, so
            // systemInstruction must ride in the per-request config (modelOptions) — that's the one
            // that applies, and the session config is never sent. The same holds for thinkingConfig.
            const requestConfig: Record<string, unknown> = { ...modelOptions };
            if (systemInstructionText) {
                requestConfig.systemInstruction = systemInstructionText;
            }
            this.applyToolParams(requestConfig, params);
            this.applyThinkingConfig(requestConfig, modelName, params.effortLevel);
            this.applyCancellationToken(requestConfig, params.cancellationToken);

            const result = await this.sendWithThinkingFallback(modelName, requestConfig, params.cancellationToken, config =>
                client.chats.create({ model: modelName, history }).sendMessage({ message: finalMessageParts, config })
            );

            // Check for blocked response or empty candidates
            if (!result.candidates || result.candidates.length === 0) {
                // Response was blocked or failed - check promptFeedback for details
                const blockReason = (result as any).promptFeedback?.blockReason;
                const safetyRatings = (result as any).promptFeedback?.safetyRatings;

                let errorMessage = 'No output received from model';
                if (blockReason) {
                    errorMessage += `: Blocked (${blockReason})`;
                    if (safetyRatings && safetyRatings.length > 0) {
                        const blockedCategories = safetyRatings
                            .filter((r: any) => r.blocked)
                            .map((r: any) => r.category)
                            .join(', ');
                        if (blockedCategories) {
                            errorMessage += ` - Categories: ${blockedCategories}`;
                        }
                    }
                } else if (result.usageMetadata?.candidatesTokenCount === 0) {
                    errorMessage += ': Model returned 0 completion tokens (possible timeout or internal error)';
                }

                throw new Error(errorMessage);
            }

            // Check finishReason for blocking or errors
            const candidate = result.candidates[0];
            const finishReason = (candidate as any).finishReason;

            // Detect problematic finishReasons that indicate the response should not be used
            if (finishReason && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'MODEL_ARMOR'].includes(finishReason)) {
                const safetyRatings = (candidate as any).safetyRatings || [];
                const blockedCategories = safetyRatings
                    .filter((r: any) => r.blocked || (r.probability && ['HIGH', 'MEDIUM'].includes(r.probability)))
                    .map((r: any) => `${r.category}(${r.probability})`)
                    .join(', ');

                throw new Error(`Content blocked by model: ${finishReason}${blockedCategories ? ` - ${blockedCategories}` : ''}`);
            }

            // Every visible text part, not only the first: a turn can split its answer across parts.
            const rawContent = (candidate.content?.parts ?? []).filter(part => part.text && !part.thought).map(part => part.text).join('');
            const thinking = (candidate.content?.parts ?? []).filter(part => part.thought && part.text).map(part => part.text).join('');
            const toolCalls = this.extractToolCalls(candidate.content?.parts, this.thoughtSignatureOrigin(modelName));
            const reasoning = GeminiLLM.extractReasoning(candidate.content?.parts, this.thoughtSignatureOrigin(modelName));

            // Check if we got empty content despite no blocking. A native tool call IS output, and a
            // forced/clean tool-call turn legitimately carries no text at all — so tool calls
            // satisfy this check just as text does.
            // A rejected tool call is an answer the tool loop must correct, not missing output — but
            // only for a request that declared tools. Without any, no tool loop can correct it, and
            // the empty turn stays the error it always was, so failover can try another model.
            const rejectedCall = params.tools?.length ? GeminiLLM.rejectedToolCallReason(finishReason) : undefined;
            if (!rawContent && !thinking && !toolCalls && !rejectedCall) {
                const usage = result.usageMetadata;
                throw new Error(
                    `No output received from model (finishReason: ${finishReason || 'none'}, ` +
                    `promptTokens: ${usage?.promptTokenCount || 0}, ` +
                    `completionTokens: ${usage?.candidatesTokenCount || 0})`
                );
            }

            // Extract thinking content if present
            let content: string = rawContent.trim();
            let thinkingContent: string | undefined = undefined;
            if (content.startsWith('<think>') && content.includes('</think>')) {
                // extract thinking content
                const thinkStart = content.indexOf('<think>') + '<think>'.length;
                const thinkEnd = content.indexOf('</think>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                // remove thinking content from main content
                content = content.substring(thinkEnd + '</think>'.length).trim();
            }
            else {
                thinkingContent = thinking;
            }

            const endTime = new Date();

            const geminiUsage = GeminiLLM.usageFromMetadata(result.usageMetadata);
            const geminiCachedTokens = geminiUsage.cacheReadTokens ?? 0;

            this.logCacheDiagnostics(
                'non-streaming',
                this.buildCacheDiagContext(modelName, systemInstructionText, history.length),
                result.usageMetadata
            );

            return {
                success: true,
                statusText: "OK",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                cacheInfo: {
                    cacheHit: geminiCachedTokens > 0,
                    cachedTokenCount: geminiCachedTokens
                },
                data: {
                    choices: [{
                        message: {
                            role: 'assistant',
                            content: content,
                            thinking: thinkingContent || undefined,
                            toolCalls: toolCalls,
                            ...(reasoning ? { reasoning } : {})
                        },
                        // Normalize the tool-call case and Gemini's "tried to call a tool but the call was
                        // unreadable" case; every other reason keeps Gemini's own value.
                        finish_reason: toolCalls ? CHAT_FINISH_REASON_TOOL_CALLS : (rejectedCall ?? (finishReason || "completed")),
                        index: 0,
                        ...(rejectedCall && candidate.finishMessage ? { finishMessage: candidate.finishMessage } : {})
                    }],
                    usage: geminiUsage
                },
                // Full native Gemini response (circular-safe) for review/audit — includes
                // usageMetadata (cachedContentTokenCount etc.) and candidate/safety details.
                modelSpecificResponseDetails: {
                    provider: 'google',
                    model: modelName,
                    raw: ToJSONSafe(result)
                },
                errorMessage: "",
                exception: null,
            }
        }
        catch (e) {
            // Node's fetch, which @google/genai uses, rejects with an AbortError when the signal fires.
            if (this.IsCancellationError(e, params.cancellationToken)) {
                return this.BuildCancelledChatResult(startTime, { error: e, signal: params.cancellationToken });
            }
            return {
                success: false,
                statusText: e && e.message ? e.message : "Error",
                startTime: new Date(),
                endTime: new Date(),
                timeElapsed: 0,
                data: {
                    choices: [],
                    usage: new ModelUsage(0, 0) // Gemini doesn't provide detailed token usage
                },
                errorMessage: e.message,
                exception: e,
                errorInfo: ErrorAnalyzer.analyzeError(e, 'Gemini')
            }
        }
    }

    /**
     * Maps the neutral {@link ChatParams.tools} onto Gemini's `tools` / `toolConfig` request fields.
     *
     * Uses `parametersJsonSchema` rather than `parameters`: the neutral surface already speaks JSON
     * Schema, and `parameters` is Gemini's older OpenAPI-subset shape (the two are mutually
     * exclusive). Gemini spells "must call something" as `ANY` and has no per-request parallelism
     * switch, so {@link ChatParams.parallelToolCalls} has no mapping here.
     *
     * @param requestConfig The request config being assembled (mutated in place)
     * @param params The chat params for this request
     */
    private applyToolParams(requestConfig: Record<string, unknown>, params: ChatParams): void {
        if (!params.tools || params.tools.length === 0) {
            return;
        }

        const functionDeclarations: FunctionDeclaration[] = params.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parametersJsonSchema: tool.inputSchema
        }));
        const tools: ToolListUnion = [{ functionDeclarations }];
        requestConfig.tools = tools;

        if (params.toolChoice !== undefined) {
            const toolConfig: ToolConfig = { functionCallingConfig: this.mapToolChoice(params.toolChoice) };
            requestConfig.toolConfig = toolConfig;
        }

        // Gemini always allows parallel calls, so only a request to turn them off goes unmet.
        if (params.parallelToolCalls === false) {
            console.warn('Gemini provider does not support turning parallel tool calls off, ignoring parallelToolCalls=false');
        }
    }

    /**
     * Translates a neutral tool choice into Gemini's `functionCallingConfig`.
     *
     * @param choice The neutral tool choice
     * @returns Gemini's function-calling config
     */
    private mapToolChoice(choice: NonNullable<ChatParams['toolChoice']>): { mode: FunctionCallingConfigMode; allowedFunctionNames?: string[] } {
        if (choice === 'none') {
            return { mode: FunctionCallingConfigMode.NONE };
        }
        if (choice === 'required') {
            return { mode: FunctionCallingConfigMode.ANY };
        }
        if (choice === 'auto') {
            return { mode: FunctionCallingConfigMode.AUTO };
        }
        // Named tool: Gemini forces a call and restricts the candidate set to that one name.
        return { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [choice.name] };
    }

    /**
     * The serving endpoint a thought signature from this driver is valid on. Vertex overrides it.
     */
    protected get ThoughtSignatureEndpoint(): string {
        return 'gemini-api';
    }

    /** Endpoint plus model — the scope a thought signature validates in. */
    protected thoughtSignatureOrigin(modelName: string): string {
        return `${this.ThoughtSignatureEndpoint}:${modelName}`;
    }

    /**
     * The normalized finish reason for a tool call Gemini rejected — `MALFORMED_FUNCTION_CALL` (the
     * call could not be read) or `UNEXPECTED_TOOL_CALL` (a call to a tool the request did not offer)
     * — or undefined for any other finish reason.
     */
    private static rejectedToolCallReason(finishReason: string | undefined): string | undefined {
        switch (finishReason) {
            case 'MALFORMED_FUNCTION_CALL': return CHAT_FINISH_REASON_MALFORMED_TOOL_CALL;
            case 'UNEXPECTED_TOOL_CALL': return CHAT_FINISH_REASON_UNEXPECTED_TOOL_CALL;
            default: return undefined;
        }
    }

    /**
     * Pulls `functionCall` parts out of a Gemini candidate and normalizes them.
     *
     * Gemini does not always populate a call `id`, so one is synthesized from the tool name and the
     * call's position in the turn. It must be stable, because it is what the matching
     * `functionResponse` echoes back.
     *
     * @param parts The candidate's content parts
     * @param signatureOrigin Where this response's thought signatures validate (see {@link thoughtSignatureOrigin})
     * @returns The normalized calls, or undefined when the model called nothing
     */
    private extractToolCalls(parts: Part[] | undefined, signatureOrigin: string): ChatToolCall[] | undefined {
        const calls: ChatToolCall[] = [];
        for (const part of parts ?? []) {
            const call = part.functionCall;
            if (!call?.name) {
                continue;
            }
            calls.push({
                id: call.id || `${call.name}_${calls.length}`,
                name: call.name,
                arguments: call.args ?? {},
                // Gemini 3 signs each function-call part; a replayed call without its signature is
                // rejected (HTTP 400). Keep it so history round-trips.
                ...(part.thoughtSignature
                    ? { providerMetadata: { thoughtSignature: part.thoughtSignature, [THOUGHT_SIGNATURE_ORIGIN_KEY]: signatureOrigin } }
                    : {})
            });
        }
        return calls.length > 0 ? calls : undefined;
    }

    /**
     * Attach the caller's cancellation token to a Gemini per-request config. @google/genai reads
     * `GenerateContentConfig.abortSignal` and forwards it to the underlying `fetch` call, so an
     * abort tears down the HTTP socket instead of merely abandoning the promise.
     */
    private applyCancellationToken(requestConfig: Record<string, unknown>, token: AbortSignal | undefined): void {
        if (token) {
            requestConfig.abortSignal = token;
        }
    }

    /**
     * Model + field pairs already warned about, so a prompt that sets `temperature` on every call
     * logs once per process instead of once per request.
     */
    private static readonly _warnedUnsupportedSampling = new Set<string>();

    /**
     * Builds the per-request generation options: sampling, stop sequences, seed, response format.
     *
     * Sampling fields depend on the model's version. Models before Gemini 3.6 keep the original
     * shape (`temperature` defaulting to 0.5, `topP`, `topK`) because they still honor it. Every
     * other model gets none of the three: Google ignores them since Gemini 3.6 Flash and upcoming
     * models reject them with a 400, so a caller-supplied value is dropped with a one-time warning.
     *
     * A `ModelSpecific` response format is merged in after this gate, so it can still set these
     * fields explicitly; that is the caller's deliberate override.
     */
    private buildGenerationOptions(params: ChatParams, modelName: string): Record<string, unknown> {
        const modelOptions: Record<string, unknown> = {};

        if (AcceptsCustomSampling(modelName)) {
            modelOptions.temperature = params.temperature ?? 0.5;
            if (params.topP != null) {
                modelOptions.topP = params.topP;
            }
            if (params.topK != null) {
                modelOptions.topK = params.topK;
            }
        } else {
            this.warnUnsupportedSampling(modelName, 'temperature', params.temperature);
            this.warnUnsupportedSampling(modelName, 'topP', params.topP);
            this.warnUnsupportedSampling(modelName, 'topK', params.topK);
        }

        // Provider options (e.g. a thinkingConfig) ride along with JSON too, not only ModelSpecific.
        if (params.modelSpecificResponseFormat && (params.responseFormat === 'ModelSpecific' || params.responseFormat === 'JSON')) {
            Object.assign(modelOptions, params.modelSpecificResponseFormat);
        }
        if (params.responseFormat === 'JSON') {
            modelOptions.responseMimeType = 'application/json';
        }

        if (params.stopSequences != null && params.stopSequences.length > 0) {
            modelOptions.stopSequences = params.stopSequences;
        }
        if (params.seed != null) {
            modelOptions.seed = params.seed;
        }

        // Gemini doesn't support these parameters - warn if provided
        if (params.frequencyPenalty != null) {
            console.warn('Gemini provider does not support frequencyPenalty parameter, ignoring');
        }
        if (params.presencePenalty != null) {
            console.warn('Gemini provider does not support presencePenalty parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Gemini provider does not support minP parameter, ignoring');
        }

        return modelOptions;
    }

    private warnUnsupportedSampling(modelName: string, field: 'temperature' | 'topP' | 'topK', value: number | undefined): void {
        if (value == null) {
            return;
        }
        const key = `${modelName}:${field}`;
        if (GeminiLLM._warnedUnsupportedSampling.has(key)) {
            return;
        }
        GeminiLLM._warnedUnsupportedSampling.add(key);
        console.warn(`Gemini model ${modelName} does not accept a custom ${field}; omitting it so the model uses its default sampling.`);
    }

    /**
     * Thinking settings a model rejected in this process, mapped to what was sent instead (`null`
     * for no setting). Keyed by driver, model and setting, so a rejected `MINIMAL` does not stop
     * `HIGH` being sent, and a rejection through one driver does not affect another.
     */
    private static readonly _thinkingReplacements = new Map<string, ThinkingConfig | null>();
    /** Thinking warnings already logged, so each is logged once per process. */
    private static readonly _warnedThinking = new Set<string>();

    private thinkingReplacementKey(modelName: string, config: ThinkingConfig): string {
        // Sorted keys, so the same setting with its keys in another order hits the same memo.
        return `${this.constructor.name}|${modelName}|${JSON.stringify(config, Object.keys(config).sort())}`;
    }

    /**
     * Puts the `thinkingConfig` for `effortLevel` on the request (see {@link ResolveGeminiThinkingConfig}),
     * or what replaced it after the model rejected it earlier in this process. With no usable effort, a
     * `thinkingConfig` already on the request (from `modelSpecificResponseFormat`) gets the same
     * replacement, so a rejected setting is not re-sent on every call. An effort that cannot be used is
     * reported once.
     */
    private applyThinkingConfig(requestConfig: Record<string, unknown>, modelName: string, effortLevel: string | undefined): void {
        const resolution = ResolveGeminiThinkingConfig(modelName, effortLevel);
        if (resolution.Ignored) {
            this.warnThinkingOnce(`${modelName}:${resolution.Ignored}`, `Gemini: ${resolution.Ignored}; sending no thinking setting, so the model thinks at its default.`);
        }
        const supplied = requestConfig.thinkingConfig as ThinkingConfig | undefined;
        const wanted = resolution.Config ?? supplied;
        if (!wanted) {
            return;
        }
        const key = this.thinkingReplacementKey(modelName, wanted);
        const config = GeminiLLM._thinkingReplacements.has(key) ? GeminiLLM._thinkingReplacements.get(key) : wanted;
        if (config) {
            requestConfig.thinkingConfig = config;
        } else if (!supplied || wanted === supplied) {
            delete requestConfig.thinkingConfig;
        }
        // Otherwise the effort's own setting was rejected with nothing to fall back to, and the caller's
        // `thinkingConfig` stays, as it would have with no effort level.
    }

    /**
     * Sends a request, and when it carried a thinking setting and Google answered 400, sends it once
     * more with the setting's fallback (see {@link GeminiThinkingFallback}: `LOW` for a rejected
     * `MINIMAL`, otherwise none). Which levels a model accepts varies (Gemini 3.8 Flash rejects
     * `MINIMAL`), so an unsupported level must not fail the request. When the retry succeeds, the
     * rejected setting is replaced for this driver and model for the rest of the process; when it also
     * fails, the 400 had another cause, so the original error is thrown and nothing is remembered.
     */
    private async sendWithThinkingFallback<T>(
        modelName: string,
        requestConfig: Record<string, unknown>,
        cancellationToken: AbortSignal | undefined,
        send: (config: Record<string, unknown>) => Promise<T>
    ): Promise<T> {
        try {
            return await send(requestConfig);
        } catch (error) {
            const { thinkingConfig, ...withoutThinking } = requestConfig as Record<string, unknown> & { thinkingConfig?: ThinkingConfig };
            if (!thinkingConfig || !(error instanceof ApiError) || error.status !== 400 || cancellationToken?.aborted) {
                throw error;
            }
            const fallback = GeminiThinkingFallback(thinkingConfig);
            let result: T;
            try {
                result = await send(fallback ? { ...withoutThinking, thinkingConfig: fallback } : withoutThinking);
            } catch {
                throw error;
            }
            GeminiLLM._thinkingReplacements.set(this.thinkingReplacementKey(modelName, thinkingConfig), fallback ?? null);
            this.warnThinkingOnce(this.thinkingReplacementKey(modelName, thinkingConfig),
                `Gemini model ${modelName} rejected thinking setting ${JSON.stringify(thinkingConfig)} (${error.message}); ` +
                `sending ${fallback ? JSON.stringify(fallback) : 'no thinking setting'} instead for the rest of the process.`);
            return result;
        }
    }

    private warnThinkingOnce(key: string, message: string): void {
        if (GeminiLLM._warnedThinking.has(key)) {
            return;
        }
        GeminiLLM._warnedThinking.add(key);
        console.warn(message);
    }

    /**
     * Normalizes Gemini usage to the {@link ModelUsage} contract.
     *
     * - `promptTokenCount` includes cached tokens, reported separately as `cachedContentTokenCount`,
     *   so the cached count is subtracted (clamped at 0) and recorded as `cacheReadTokens`. Gemini
     *   reports no separate cache-write charge.
     * - `candidatesTokenCount` leaves out thinking, which Google counts in `thoughtsTokenCount` and
     *   bills as output, so completion tokens are the sum of the two.
     */
    private static usageFromMetadata(metadata: GenerateContentResponseUsageMetadata | undefined): ModelUsage {
        const cached = metadata?.cachedContentTokenCount ?? 0;
        const usage = new ModelUsage(
            Math.max(0, (metadata?.promptTokenCount ?? 0) - cached),
            (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0)
        );
        usage.cacheReadTokens = cached;
        return usage;
    }

    /**
     * Reset streaming state for a new request
     */
    protected resetStreamingState(): void {
        this._streamingState = {
            accumulatedThinking: '',
            inThinkingBlock: false,
            pendingContent: '',
            thinkingComplete: false
        };
    }

    /**
     * Create a streaming request for Gemini
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Reset streaming state for new request
        this.resetStreamingState();
        const modelName = params.model || "gemini-pro";

        // Filter out system messages and extract system instruction content
        const noSystemMessages = params.messages.filter(m => m.role !== 'system');
        const sysPrompts = params.messages.filter(m => m.role === 'system');
        const systemInstructionText = sysPrompts.length > 0
            ? sysPrompts.map(m => GeminiLLM.mjContentToSystemInstructionText(m.content)).join('\n\n')
            : '';

        // Convert all non-system messages and apply role alternation
        const signatureOrigin = this.thoughtSignatureOrigin(modelName);
        const convertedMessages = noSystemMessages.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m, signatureOrigin));
        const tempMessages = this.geminiMessageSpacing(convertedMessages);

        // All but the last user turn go in the history; that turn is the message sent (see SplitForSend).
        const { history, message: finalMessageParts } = this.SplitForSend(tempMessages);

        // Capture the request's cacheable-prefix info so the final streamed chunk's usage can be
        // logged next to it (GEMINI_CACHE_DEBUG only; processStreamingChunk reads this).
        this._cacheDiagContext = process.env.GEMINI_CACHE_DEBUG
            ? this.buildCacheDiagContext(modelName, systemInstructionText, history.length)
            : null;

        // System prompt is passed via systemInstruction (below), NOT bundled into the user message
        // — bundling defeats Gemini's implicit prompt caching (stable prompt ends up after the
        // variable history).

        // Sampling + response-format options, shaped for the model's version (see buildGenerationOptions)
        const modelOptions = this.buildGenerationOptions(params, modelName);

        // Ensure Gemini client is initialized
        const client = await this.ensureGeminiClient();

        // systemInstruction (a plain string) is the stable, cacheable prefix. It must ride in the
        // per-request config since @google/genai's sendMessage config REPLACES the session config;
        // so must thinkingConfig.
        const requestConfig: Record<string, unknown> = { ...modelOptions };
        if (systemInstructionText) {
            requestConfig.systemInstruction = systemInstructionText;
        }
        this.applyThinkingConfig(requestConfig, modelName, params.effortLevel);
        this.applyCancellationToken(requestConfig, params.cancellationToken);

        // Send the latest user message (streaming); system prompt rides in requestConfig. A rejected
        // request throws here, before any chunk, so the thinking fallback works as it does above.
        const streamResult = await this.sendWithThinkingFallback(modelName, requestConfig, params.cancellationToken, config =>
            client.chats.create({ model: modelName, history }).sendMessageStream({ message: finalMessageParts, config })
        );
        
        // Return the stream for the for-await loop to work
        return streamResult;
    }
    
    /**
     * Process a streaming chunk from Gemini
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;

        // @google/genai shapes Candidate.content as a Content OBJECT (`{ parts: Part[] }`),
        // not an array as the legacy @google/generative-ai SDK did. The old `content[0].parts`
        // access always resolved to undefined on the new SDK, so the guard failed on every
        // chunk and no text was ever appended -- that's why streaming appeared dead.
        //
        // A single chunk's `parts` array can also mix reasoning ({thought:true, text}) and
        // answer ({text}) parts. Split them the same way the non-streaming path does, so
        // the reasoning summary never leaks into the user-visible stream.
        const parts: Array<{ text?: string; thought?: boolean }> | undefined =
            chunk?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
            let visibleTextAdded = false;
            for (const part of parts) {
                if (!part?.text) continue;
                if (part.thought) {
                    this._streamingState.accumulatedThinking += part.text;
                } else {
                    this._streamingState.pendingContent += part.text;
                    visibleTextAdded = true;
                }
            }
            if (visibleTextAdded) {
                content = this.processThinkingInStreamingContent();
            }
        }

        // Check for finish reason if available
        if (chunk?.candidates?.[0]?.finishReason) {
            finishReason = chunk.candidates[0].finishReason;
        }

        // Extract usage from chunk if available (appears on final chunk).
        let usage = null;
        if (chunk.usageMetadata) {
            usage = GeminiLLM.usageFromMetadata(chunk.usageMetadata);

            // Usage only appears on the final chunk — log the cache diagnostic once here.
            this.logCacheDiagnostics('streaming', this._cacheDiagContext, chunk.usageMetadata);
        }

        return {
            content,
            finishReason,
            usage
        };
    }

    /**
     * Builds a {@link GeminiCacheDiagContext} snapshot for the current request. Cheap (one djb2
     * pass over the system prompt); only called when GEMINI_CACHE_DEBUG is set.
     */
    private buildCacheDiagContext(modelName: string, systemInstructionText: string, historyLength: number): GeminiCacheDiagContext {
        return {
            model: modelName,
            systemInstructionChars: systemInstructionText?.length ?? 0,
            systemInstructionHash: this.stableHash(systemInstructionText ?? ''),
            historyLength
        };
    }

    /**
     * Emits a one-line prompt-cache diagnostic for a Gemini call, gated behind the
     * GEMINI_CACHE_DEBUG env var so it is silent in normal operation. Surfaces exactly what we need
     * to explain a cache miss: whether a stable systemInstruction prefix was sent (chars + hash so
     * two runs can be compared), the history depth, the provider's native token split
     * (prompt/cached/net/completion), and whether a cache hit occurred. Warns when the input is
     * below Gemini's implicit-cache minimum or when no systemInstruction was sent at all.
     */
    private logCacheDiagnostics(
        context: 'non-streaming' | 'streaming',
        diag: GeminiCacheDiagContext | null,
        usageMetadata: GeminiUsageMetadataLike | null | undefined
    ): void {
        if (!process.env.GEMINI_CACHE_DEBUG || !diag) {
            return;
        }
        const promptTokens = usageMetadata?.promptTokenCount ?? 0;
        const cachedTokens = usageMetadata?.cachedContentTokenCount ?? 0;
        const completion = usageMetadata?.candidatesTokenCount ?? 0;
        const netPrompt = Math.max(0, promptTokens - cachedTokens);
        const cacheHit = cachedTokens > 0;
        // Implicit caching has a per-model minimum prefix (~1,024 tokens for Gemini 2.5 Flash, more
        // for Pro). Below that floor a cache can never form, which is the most common silent cause.
        const belowImplicitFloor = promptTokens < 1024;
        const warnings = [
            belowImplicitFloor ? 'prompt<1024 (below implicit-cache minimum)' : '',
            diag.systemInstructionChars === 0 ? 'no-systemInstruction (no stable cacheable prefix)' : ''
        ].filter(Boolean).join('; ');
        console.log(
            `[Gemini cache] ${context} model=${diag.model} ` +
            `systemInstruction{chars=${diag.systemInstructionChars}, hash=${diag.systemInstructionHash}} ` +
            `history=${diag.historyLength} ` +
            `tokens{prompt=${promptTokens}, cached=${cachedTokens}, net=${netPrompt}, completion=${completion}} ` +
            `cacheHit=${cacheHit}` +
            (warnings ? ` WARN=${warnings}` : '')
        );
    }

    /**
     * djb2 string hash → 8-char hex. Non-cryptographic; used only to compare whether the system
     * prompt prefix is byte-identical across two runs (a changing hash means the prefix is unstable
     * and implicit caching cannot engage). Dependency-free on purpose to keep this provider-local.
     */
    private stableHash(s: string): string {
        let h = 5381;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }
    
    /**
     * Process pending content to extract thinking blocks
     * Returns content that should be emitted to the user
     */
    private processThinkingInStreamingContent(): string {
        const state = this._streamingState;
        let outputContent = '';
        
        // If thinking is already complete, just pass through content
        if (state.thinkingComplete) {
            outputContent = state.pendingContent;
            state.pendingContent = '';
            return outputContent;
        }
        
        // Check if we're currently in a thinking block
        if (state.inThinkingBlock) {
            // Look for end of thinking block
            const endIndex = state.pendingContent.indexOf('</think>');
            
            if (endIndex !== -1) {
                // Found end of thinking block
                state.accumulatedThinking += state.pendingContent.substring(0, endIndex);
                state.inThinkingBlock = false;
                state.thinkingComplete = true;
                
                // Keep remaining content after </think> for output
                state.pendingContent = state.pendingContent.substring(endIndex + '</think>'.length);
                outputContent = state.pendingContent.trim();
                state.pendingContent = '';
            } else {
                // Still in thinking block, accumulate all content
                state.accumulatedThinking += state.pendingContent;
                state.pendingContent = '';
            }
        } else {
            // Not in thinking block, check if one is starting
            const startIndex = state.pendingContent.indexOf('<think>');
            
            if (startIndex !== -1) {
                // Found start of thinking block
                if (startIndex === 0) {
                    // Thinking starts at beginning
                    state.inThinkingBlock = true;
                    state.pendingContent = state.pendingContent.substring('<think>'.length);
                    
                    // Process again to check for end tag in same chunk
                    return this.processThinkingInStreamingContent();
                } else {
                    // There's content before thinking block - this shouldn't happen
                    // with Gemini models, but handle it just in case
                    outputContent = state.pendingContent.substring(0, startIndex);
                    state.pendingContent = state.pendingContent.substring(startIndex);
                    state.inThinkingBlock = true;
                    state.pendingContent = state.pendingContent.substring('<think>'.length);
                }
            } else {
                // No thinking block found
                // Check if we might be at the start of a partial tag
                if (state.pendingContent.endsWith('<') || 
                    state.pendingContent.endsWith('<t') ||
                    state.pendingContent.endsWith('<th') ||
                    state.pendingContent.endsWith('<thi') ||
                    state.pendingContent.endsWith('<thin')) {
                    // Hold back content that might be start of tag
                    const lastOpenBracket = state.pendingContent.lastIndexOf('<');
                    outputContent = state.pendingContent.substring(0, lastOpenBracket);
                    state.pendingContent = state.pendingContent.substring(lastOpenBracket);
                } else {
                    // No thinking block and no partial tag, output all content
                    outputContent = state.pendingContent;
                    state.pendingContent = '';
                }
            }
        }
        
        return outputContent;
    }
    
    /**
     * Create the final response from streaming results for Gemini
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Extract finish reason from last chunk if available
        let finishReason = 'stop';
        if (lastChunk?.candidates && lastChunk.candidates.length > 0 && lastChunk.candidates[0].finishReason) {
            finishReason = lastChunk.candidates[0].finishReason;
        }

        // Get thinking content from streaming state
        const thinkingContent = this._streamingState.accumulatedThinking.trim();
        const hasContent = (accumulatedContent && accumulatedContent.trim().length > 0) || thinkingContent.length > 0;

        // Check for problematic finishReasons in streaming responses
        if (finishReason && ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'MODEL_ARMOR'].includes(finishReason)) {
            const safetyRatings = lastChunk?.candidates?.[0]?.safetyRatings || [];
            const blockedCategories = safetyRatings
                .filter((r: any) => r.blocked || (r.probability && ['HIGH', 'MEDIUM'].includes(r.probability)))
                .map((r: any) => `${r.category}(${r.probability})`)
                .join(', ');

            // Create error result for blocked content
            const now = new Date();
            const errorResult = new ChatResult(false, now, now);
            errorResult.statusText = 'Content blocked';
            errorResult.errorMessage = `Content blocked by model: ${finishReason}${blockedCategories ? ` - ${blockedCategories}` : ''}`;
            errorResult.exception = new Error(errorResult.errorMessage);
            errorResult.errorInfo = ErrorAnalyzer.analyzeError(errorResult.exception, 'Gemini');
            errorResult.data = {
                choices: [],
                usage: usage || new ModelUsage(0, 0)
            };
            return errorResult;
        }

        // Check for empty response (no content received)
        if (!hasContent) {
            const now = new Date();
            const errorResult = new ChatResult(false, now, now);
            const usageMetadata = usage || lastChunk?.usageMetadata;
            errorResult.statusText = 'No output received';
            errorResult.errorMessage = `No output received from model in streaming response (finishReason: ${finishReason || 'none'}, ` +
                `promptTokens: ${usageMetadata?.promptTokenCount || 0}, ` +
                `completionTokens: ${usageMetadata?.candidatesTokenCount || 0})`;
            errorResult.exception = new Error(errorResult.errorMessage);
            errorResult.errorInfo = ErrorAnalyzer.analyzeError(errorResult.exception, 'Gemini');
            errorResult.data = {
                choices: [],
                usage: usage || new ModelUsage(0, 0)
            };
            return errorResult;
        }

        // Create dates (will be overridden by base class)
        const now = new Date();

        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);

        // Set all properties
        result.data = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: accumulatedContent ? accumulatedContent : '',
                    thinking: thinkingContent || undefined
                },
                finish_reason: finishReason,
                index: 0
            }],
            usage: usage || new ModelUsage(0, 0)
        };

        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;
        const streamCachedTokens = usage?.cacheReadTokens || 0;
        result.cacheInfo = {
            cacheHit: streamCachedTokens > 0,
            cachedTokenCount: streamCachedTokens
        };

        return result;
    }
    SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }
    ClassifyText(params: any): Promise<any> {
        throw new Error("Method not implemented.");   
    }

    /**
     * The default mimeType to assume for a media content block when neither an explicit
     * `mimeType` nor a data-URL-embedded mime is available. Keyed by MJ content-block type.
     */
    private static geminiDefaultMimeForBlockType(type: string): string {
        switch (type) {
            case 'image_url': return 'image/png';
            case 'audio_url': return 'audio/mpeg';
            case 'video_url': return 'video/mp4';
            default: return 'application/octet-stream';
        }
    }

    /**
     * Convert a single MJ content block into the matching Gemini {@link Part}. This is the one
     * type-aware mapping site so that text-only behavior stays byte-identical and every media
     * block (image/audio/video/file) becomes a real Gemini media part instead of a text blob of
     * its data URL.
     *
     * - `text` → `{ text }` (unchanged).
     * - any media block whose `content` is a `data:<mime>;base64,<b64>` data URL →
     *   `{ inlineData: { mimeType, data } }` carrying the raw base64 (prefix stripped).
     * - any media block whose `content` is an http(s) URL → `{ fileData: { mimeType, fileUri } }`,
     *   Gemini's remote-file part (mirrors how geminiImage.ts reads fileData.fileUri).
     * - a media block whose `content` is bare base64 (no data-URL prefix, but valid base64) →
     *   `{ inlineData }`, preserving the prior behavior.
     * - anything else (e.g. placeholder strings tagged onto a file_url block) → `{ text }` fallback.
     */
    private static mjContentBlockToGeminiPart(block: ChatMessageContentBlock): Part {
        if (block.type === 'text') {
            return { text: block.content };
        }

        // Tool results ride as `functionResponse` parts. Gemini wants a JSON object, and reads the
        // `output` / `error` keys by convention — so a failed call stays distinguishable from a
        // successful one that merely returned error-looking text.
        if (block.type === 'tool_result') {
            return {
                functionResponse: {
                    id: block.toolCallId,
                    name: block.toolName,
                    response: block.isError ? { error: block.content } : { output: block.content }
                }
            };
        }

        // Remote http(s) URL → Gemini fileData part (no inlining of remote bytes).
        if (/^https?:\/\//i.test(block.content)) {
            const fileData: FileData = {
                fileUri: block.content,
                mimeType: block.mimeType || GeminiLLM.geminiDefaultMimeForBlockType(block.type),
            };
            return { fileData };
        }

        // Strip data-URL prefix if present — Gemini expects raw base64.
        let rawBase64 = block.content;
        let detectedMime: string | undefined;
        const dataUrlMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
        if (dataUrlMatch) {
            detectedMime = dataUrlMatch[1];
            rawBase64 = dataUrlMatch[2];
        }

        // Guard: if content isn't a data URL and isn't valid base64, fall back to a text part.
        // This handles placeholder strings (e.g. "[File: ... — accessible via artifact tools]")
        // that were tagged as file_url content blocks.
        if (!dataUrlMatch && !/^[A-Za-z0-9+/\r\n]+=*$/.test(rawBase64.substring(0, 100))) {
            return { text: block.content };
        }

        // Use the inlineData property which expects a Blob with data and mimeType.
        // Prefer the explicit mimeType from the content block; fall back to the data-URL
        // detected mime, then type-based defaults.
        const blob: Blob = {
            data: rawBase64,
            mimeType: block.mimeType || detectedMime || GeminiLLM.geminiDefaultMimeForBlockType(block.type),
        };
        return { inlineData: blob };
    }

    public static MapMJContentToGeminiParts(content: ChatMessageContent): Array<Part> {
        if (Array.isArray(content)) {
            return content.map(block => GeminiLLM.mjContentBlockToGeminiPart(block));
        }
        // we know that message.content is a string
        return [{ text: content }];
    }

    /**
     * The signature to replay on a call: its own when it was minted where this request is going,
     * otherwise the documented placeholder. A signature with no recorded origin is replayed as-is.
     */
    private static signatureForReplay(call: NonNullable<ChatMessage['toolCalls']>[number], signatureOrigin: string | undefined): string {
        const metadata = call.providerMetadata;
        const signature = metadata?.thoughtSignature;
        if (typeof signature !== 'string') {
            return GEMINI_INJECTED_CALL_THOUGHT_SIGNATURE;
        }
        const origin = metadata?.[THOUGHT_SIGNATURE_ORIGIN_KEY];
        const foreign = signatureOrigin !== undefined && typeof origin === 'string' && origin !== signatureOrigin;
        return foreign ? GEMINI_INJECTED_CALL_THOUGHT_SIGNATURE : signature;
    }

    /**
     * A turn's thought parts and signed text parts, as replayable reasoning.
     *
     * Thought parts are kept with their signature when they have one. Text parts are kept only when
     * at least one of them is signed, and then all of them, in order — the replay rebuilds the
     * turn's text from these blocks, so each signature lands back on the text it was minted for.
     * Function-call signatures travel on the calls themselves (see {@link extractToolCalls}).
     *
     * @param parts The candidate's content parts
     * @param signatureOrigin Where this response's signatures validate (see {@link thoughtSignatureOrigin})
     * @returns The blocks, or undefined when the turn had nothing to replay
     */
    private static extractReasoning(parts: Part[] | undefined, signatureOrigin: string): ChatReasoningBlock[] | undefined {
        const all = parts ?? [];
        const signature = (part: Part) => (part.thoughtSignature ? { signature: part.thoughtSignature } : {});
        const blocks: ChatReasoningBlock[] = all
            .filter((part) => part.thought && part.text)
            .map((part) => ({ provider: GEMINI_REASONING_PROVIDER, kind: 'thought', text: part.text, ...signature(part), origin: signatureOrigin }));
        // Gemini can put a turn's signature on a trailing part with empty text; it has to come back too.
        const textParts = all.filter((part) => typeof part.text === 'string' && !part.thought && !part.functionCall
            && (part.text.length > 0 || !!part.thoughtSignature));
        if (textParts.some((part) => part.thoughtSignature)) {
            blocks.push(...textParts.map((part): ChatReasoningBlock =>
                ({ provider: GEMINI_REASONING_PROVIDER, kind: 'signed_text', text: part.text, ...signature(part), origin: signatureOrigin })));
        }
        return blocks.length > 0 ? blocks : undefined;
    }

    /**
     * The parts that replay a model turn's own reasoning: its thought parts, and — when its text
     * parts were signed and the message text is still exactly theirs — those text parts with their
     * signatures. `text` is undefined when the message's content should be mapped as usual: no
     * signed text, or text that was changed after the turn (compaction), which a signature would
     * no longer match. Blocks from another provider, or signed where this request is not going,
     * are dropped — a foreign signature is a hard 400.
     */
    private static reasoningPartsForReplay(message: ChatMessage, signatureOrigin: string | undefined): { thoughts: Part[]; text?: Part[] } {
        const usable = (message.reasoning ?? []).filter((block) =>
            block.provider === GEMINI_REASONING_PROVIDER
            && !(signatureOrigin !== undefined && block.origin !== undefined && block.origin !== signatureOrigin));
        const toPart = (block: ChatReasoningBlock, thought: boolean): Part =>
            ({ text: block.text ?? '', ...(thought ? { thought: true } : {}), ...(block.signature ? { thoughtSignature: block.signature } : {}) });
        const thoughts = usable.filter((block) => block.kind === 'thought').map((block) => toPart(block, true));
        const signedText = usable.filter((block) => block.kind === 'signed_text');
        const textMatches = typeof message.content === 'string'
            && signedText.length > 0
            && signedText.map((block) => block.text ?? '').join('').trim() === message.content.trim();
        return { thoughts, text: textMatches ? signedText.map((block) => toPart(block, false)) : undefined };
    }

    /**
     * Maps one MJ message to a Gemini history entry.
     *
     * @param message The message to map
     * @param signatureOrigin Where this request is going (endpoint + model). When given, a replayed
     *   call's thought signature from anywhere else is swapped for the placeholder.
     */
    public static MapMJMessageToGeminiHistoryEntry(message: ChatMessage, signatureOrigin?: string): Content {
        // A model turn replays its own thoughts first, then its text, then its calls — the order
        // Gemini produced them in.
        const replay = message.role === 'assistant' ? GeminiLLM.reasoningPartsForReplay(message, signatureOrigin) : { thoughts: [] };
        const parts = [...replay.thoughts, ...(replay.text ?? GeminiLLM.MapMJContentToGeminiParts(message.content))];

        // An assistant turn that called tools must replay those calls as `functionCall` parts so the
        // `functionResponse` parts that follow have something to pair with.
        if (message.toolCalls?.length) {
            for (const call of message.toolCalls) {
                // Replay the signature the model gave us when it is valid here; a call this process
                // synthesized, or one signed by another endpoint or model, gets the placeholder.
                const signature = GeminiLLM.signatureForReplay(call, signatureOrigin);
                parts.push({ functionCall: { id: call.id, name: call.name, args: call.arguments ?? {} }, thoughtSignature: signature });
            }
        }

        // Gemini rejects an empty part list, and a pure tool-call turn has no prose — drop the empty
        // text part that content mapping produces once real parts are carrying the turn. An empty
        // part that carries a signature is the model's own, and stays.
        const meaningfulParts = parts.length > 1 ? parts.filter(p => p.text !== '' || !!p.thoughtSignature) : parts;

        return {
            role: message.role === 'assistant' ? 'model' : 'user', // google calls all messages other than the replies from the model 'user' which would include the system prompt
            parts: meaningfulParts.length > 0 ? meaningfulParts : [{ text: '' }]
        }
    }

    /**
     * Flatten an MJ message's content to a plain-text string for the Gemini systemInstruction.
     * Images and other media MUST NOT ride in the system instruction — emitting a giant base64
     * data URL there would both blow the cacheable prefix and fail to be interpreted as an image.
     * So we keep only `text` blocks here; a pure-string content stays as-is.
     */
    private static mjContentToSystemInstructionText(content: ChatMessageContent): string {
        if (typeof content === 'string') {
            return content;
        }
        return content
            .filter(block => block.type === 'text')
            .map(block => block.content)
            .join('\n');
    }
}
 

// Export image generation
export * from './geminiImage';

// Export realtime (Gemini Live) driver
export * from './geminiRealtime';
export { GEMINI_LIVE_MODEL_ALIASES_ENV, type GeminiLiveEndpoint } from './geminiLiveProfiles';

// Export the avatar video bitrate setting (MJ_GEMINI_AVATAR_VIDEO_BITRATE_BPS)
export { GEMINI_AVATAR_VIDEO_BITRATE_ENV, GEMINI_AVATAR_VIDEO_BITRATE_BPS_DEFAULT, ResolveGeminiAvatarVideoBitrateBps } from './geminiAvatarVideoBitrate';

// Export the Gemini Live setup writer and the relay policy (MJAPI's realtime relay)
export { BuildGeminiLiveSetup, BuildGeminiLiveModelPath, type GeminiLiveSetupTarget } from './geminiLiveSetup';
export { GeminiLiveRelayPolicy, type GeminiLiveRelayPolicyOptions } from './geminiLiveRelayPolicy';

// Export multimodal embeddings
export * from './geminiEmbedding';