

// Google Gemini Import
import { GoogleGenAI, Content, Part, Blob} from "@google/genai";

// MJ stuff
import { BaseLLM, ChatMessage, ChatParams, ChatResult, SummarizeParams, SummarizeResult, StreamingChatCallbacks, ChatMessageContent, ModelUsage, ErrorAnalyzer, FileCapabilities } from "@memberjunction/ai";
import { RegisterClass, ToJSONSafe } from "@memberjunction/global";

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
     * Convert MJ effort level (1-100) to Gemini thinkingBudget (0-24576)
     *
     * Mapping strategy:
     * - 1 (minimal): 0 (disabled) on Flash; clamped to ~1024 on Pro
     * - 2-33 (low): 1024-4096 tokens
     * - 34-66 (medium): 4097-12288 tokens
     * - 67-100 (high): 12289-24576 tokens
     * - undefined: No thinkingConfig (Gemini default ~8192)
     *
     * Model-specific behavior:
     * - Gemini 2.5 Flash/Flash-Lite: Can disable thinking with budget=0
     * - Gemini 2.5 Pro: Cannot disable thinking, minimum ~1024
     * - Gemini 3 models: Use thinkingLevel instead (future consideration)
     *
     * @param effortLevel - MJ normalized effort level (1-100) as string or number
     * @param modelName - The Gemini model name to check capabilities
     * @returns thinkingBudget value or undefined for default behavior
     */
    private getThinkingBudget(effortLevel: string | number | undefined, modelName: string): number | undefined {
        if (effortLevel === undefined || effortLevel === null || effortLevel === '') {
            return undefined; // Use Gemini's default behavior (auto, up to ~8192)
        }

        // Parse string to number if needed
        const numericLevel = typeof effortLevel === 'string' ? parseInt(effortLevel, 10) : effortLevel;
        if (isNaN(numericLevel)) {
            return undefined; // Invalid effort level, use default
        }

        // Clamp to valid range
        const level = Math.max(1, Math.min(100, numericLevel));

        // Check model capabilities for thinking
        const lowerModel = modelName.toLowerCase();
        const isFlashModel = lowerModel.includes('flash');
        const isProModel = lowerModel.includes('pro') && !isFlashModel;

        // Minimal effort (1) - disable thinking on Flash models
        if (level === 1 && isFlashModel) {
            return 0; // Disable thinking (only works on Flash/Flash-Lite)
        }

        // For Pro models, minimum effective budget is ~1024
        // For Flash models with effort >= 2, use normal scaling
        if (level <= 33) {
            // Low (2-33): linear scale from 1024 to 4096
            return Math.round(1024 + ((level - 2) / 31) * (4096 - 1024));
        } else if (level <= 66) {
            // Medium: linear scale from 4097 to 12288
            return Math.round(4097 + ((level - 34) / 32) * (12288 - 4097));
        } else {
            // High: linear scale from 12289 to 24576
            return Math.round(12289 + ((level - 67) / 33) * (24576 - 12289));
        }
    }

    /**
     * Check if a model supports thinking configuration
     * Thinking is supported on Gemini 2.5+ models
     */
    private supportsThinking(modelName: string): boolean {
        const lowerModel = modelName.toLowerCase();
        // Gemini 2.5 and later support thinking
        return lowerModel.includes('2.5') ||
               lowerModel.includes('gemini-3') ||
               lowerModel.includes('gemini-exp');
    }
    
    /**
     * Gemini supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    protected geminiMessageSpacing(messages: Content[]): Content[] {
        // This method ensures messages alternate between user and model roles
        // by combining consecutive messages with the same role
        if (messages.length === 0) {
            return [];
        }

        const result: Content[] = [];
        let currentMessage: Content | null = null;

        for (const message of messages) {
            if (currentMessage === null) {
                // First message - start accumulating
                currentMessage = { role: message.role, parts: [...message.parts] };
            } else if (currentMessage.role === message.role) {
                // Same role as current - combine the parts
                currentMessage.parts.push(...message.parts);
            } else {
                // Different role - push current and start new
                result.push(currentMessage);
                currentMessage = { role: message.role, parts: [...message.parts] };
            }
        }

        // Push the last accumulated message
        if (currentMessage !== null) {
            result.push(currentMessage);
        }

        return result;
    }
    
    /**
     * Implementation of non-streaming chat completion for Gemini
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        try {
            // For text-only input, use the gemini-pro model
            const startTime = new Date();
            const modelName = params.model || "gemini-pro";
            
            // Filter out system messages and extract system instruction content
            const noSystemMessages = params.messages.filter(m => m.role !== 'system');
            const sysPrompts = params.messages.filter(m => m.role === 'system');
            const systemInstructionText = sysPrompts.length > 0
                ? sysPrompts.map(m => typeof m.content === 'string' ? m.content : m.content.map(v => v.content).join('\n')).join('\n\n')
                : '';

            // Convert all non-system messages and apply role alternation
            const convertedMessages = noSystemMessages.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m));
            const tempMessages = this.geminiMessageSpacing(convertedMessages);

            // Split: all but last message go in history, last message gets system instructions prepended
            const history = tempMessages.slice(0, -1);
            const lastMessage = tempMessages.length > 0 ? tempMessages[tempMessages.length - 1] : null;

            // The system prompt is passed via systemInstruction (below), NOT bundled into the user
            // message — bundling put the stable prompt AFTER the variable history, defeating Gemini's
            // implicit prompt caching. The final message is just the latest user turn's parts.
            let finalMessageParts: Part[] = [];
            if (lastMessage) {
                finalMessageParts.push(...lastMessage.parts);
            }
            // If no messages at all, send empty
            if (finalMessageParts.length === 0) {
                finalMessageParts = [{ text: '' }];
            }

            // Create the model and then chat
            const modelOptions: Record<string, any> = {
                temperature: params.temperature || 0.5,
            };

            switch (params.responseFormat) {
                case 'JSON':
                    modelOptions.responseMimeType = 'application/json';
                    break;
                case 'ModelSpecific':
                    if (params.modelSpecificResponseFormat) {
                        Object.assign(modelOptions, params.modelSpecificResponseFormat);
                    }
                    break;
            }

            // Add supported parameters
            if (params.topP != null) {
                modelOptions.top_p = params.topP;
            }
            if (params.topK != null) {
                modelOptions.top_k = params.topK;
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

            // Build thinking configuration based on effort level and model capabilities
            const thinkingBudget = this.getThinkingBudget(params.effortLevel, modelName);
            const useThinking = this.supportsThinking(modelName) && thinkingBudget !== undefined;

            // Create chat config - only include thinkingConfig if model supports it and effortLevel is specified
            const chatConfig: Record<string, unknown> = {};
            this.setThinkingConfig(chatConfig, useThinking, params.effortLevel, modelName, thinkingBudget);

            // Ensure Gemini client is initialized
            const client = await this.ensureGeminiClient();

            // Pass the system prompt as systemInstruction (a plain string — a string[] is invalid and
            // was the original reason this was bundled into the message). It becomes the stable,
            // cacheable prefix so Gemini's implicit cache can engage across turns.
            // NOTE: @google/genai's sendMessage `config` REPLACES (not merges) the session config, so
            // systemInstruction must ride in the per-request config (modelOptions) — that's the one
            // that applies. We intentionally do NOT fold chatConfig (thinkingConfig) in here: that
            // preserves the prior thinking behavior exactly (it stays on the session config) and avoids
            // sending a thinking level some models reject.
            const requestConfig: Record<string, unknown> = { ...modelOptions };
            if (systemInstructionText) {
                requestConfig.systemInstruction = systemInstructionText;
            }

            const chat = client.chats.create({
                config: Object.keys(chatConfig).length > 0 ? chatConfig : undefined,
                model: modelName,
                history: history
            });

            const result = await chat.sendMessage({
                message: finalMessageParts,
                config: requestConfig
            });

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

            const rawContent = candidate.content?.parts?.find(part => part.text && !part.thought)?.text || '';
            const thinking = candidate.content?.parts?.find(part => part.thought)?.text || '';

            // Check if we got empty content despite no blocking
            if (!rawContent && !thinking) {
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

            // Gemini's cache convention: `promptTokenCount` INCLUDES cached tokens, reported
            // separately as `cachedContentTokenCount`. Normalize to the uniform ModelUsage contract:
            // promptTokens must be UNCACHED/net-new only, so subtract the cache-read count (clamped at
            // 0) and record it disjointly. Gemini does not report a separate cache-write charge, so
            // cacheWriteTokens stays 0. Full native prompt count = usage.totalInputTokens.
            const geminiCachedTokens = result.usageMetadata?.cachedContentTokenCount ?? 0;
            const geminiNetPromptTokens = Math.max(0, (result.usageMetadata?.promptTokenCount || 0) - geminiCachedTokens);
            const geminiUsage = new ModelUsage(
                geminiNetPromptTokens,
                result.usageMetadata?.candidatesTokenCount || 0
            );
            geminiUsage.cacheReadTokens = geminiCachedTokens;

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
                            thinking: thinkingContent || undefined
                        },
                        finish_reason: finishReason || "completed",
                        index: 0
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

    private setThinkingConfig(chatConfig: any, useThinking: boolean, effortLevel: string | undefined, modelName: string, thinkingBudget: number) {
        // this is a hack, need a cleaner way of doing this
        const gemini3AndAbove: boolean = modelName?.toLowerCase().includes("-3") ||
                                         modelName?.toLowerCase().includes("-4") ||
                                         modelName?.toLowerCase().includes("-5") ||
                                         modelName?.toLowerCase().includes("-6") ||
                                         modelName?.toLowerCase().includes("-7");
                                         
        if (useThinking) {
            if (gemini3AndAbove) {
                // no budget used, we map the effortLevel to 4 buckets
                let geminiLevel = undefined;
                // Parse string to number if needed
                let numericLevel = typeof effortLevel === 'string' ? parseInt(effortLevel, 10) : effortLevel;
                if (isNaN(numericLevel)) {
                    numericLevel = 0;
                }

                if (numericLevel === 1) {
                    geminiLevel = "MINIMAL" // effort 1 is the minimum valid value and maps to minimal thinking on Gemini 3+ models
                }
                else if (numericLevel >= 2 && numericLevel <= 33) {
                    geminiLevel = "LOW"
                }
                else if (numericLevel <= 66) {
                    geminiLevel = "MEDIUM" 
                }
                else {
                    geminiLevel = "HIGH" 
                }

                chatConfig.thinkingConfig = {
                    thinkingLevel: geminiLevel
                }
            }
            else {
                chatConfig.thinkingConfig = {
                    includeThoughts: true,
                    thinkingBudget: thinkingBudget
                };
            }
        }
        else {
            if (gemini3AndAbove) {
                chatConfig.thinkingConfig = {
                    thinkingLevel: "MINIMAL" // if we don't have thinking setup and we're dealing with Gemini 3 series models, set thinking level to minimal
                }
            }
        }
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
            ? sysPrompts.map(m => typeof m.content === 'string' ? m.content : m.content.map(v => v.content).join('\n')).join('\n\n')
            : '';

        // Convert all non-system messages and apply role alternation
        const convertedMessages = noSystemMessages.map(m => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m));
        const tempMessages = this.geminiMessageSpacing(convertedMessages);

        // Split: all but last message go in history, last message gets system instructions prepended
        const history = tempMessages.slice(0, -1);
        const lastMessage = tempMessages.length > 0 ? tempMessages[tempMessages.length - 1] : null;

        // Capture the request's cacheable-prefix info so the final streamed chunk's usage can be
        // logged next to it (GEMINI_CACHE_DEBUG only; processStreamingChunk reads this).
        this._cacheDiagContext = process.env.GEMINI_CACHE_DEBUG
            ? this.buildCacheDiagContext(modelName, systemInstructionText, history.length)
            : null;

        // System prompt is passed via systemInstruction (below), NOT bundled into the user message
        // — bundling defeats Gemini's implicit prompt caching (stable prompt ends up after the
        // variable history). The final message is just the latest user turn's parts.
        let finalMessageParts: Part[] = [];
        if (lastMessage) {
            finalMessageParts.push(...lastMessage.parts);
        }
        // If no messages at all, send empty
        if (finalMessageParts.length === 0) {
            finalMessageParts = [{ text: '' }];
        }

        // Create the model and then chat
        const modelOptions: Record<string, any> = {
            temperature: params.temperature || 0.5,
        };

        switch (params.responseFormat) {
            case 'JSON':
                modelOptions.responseMimeType = 'application/json';
                break;
            case 'ModelSpecific':
                if (params.modelSpecificResponseFormat) {
                    Object.assign(modelOptions, params.modelSpecificResponseFormat);
                }
                break;
        }

        // Add supported parameters
        if (params.topP != null) {
            modelOptions.top_p = params.topP;
        }
        if (params.topK != null) {
            modelOptions.top_k = params.topK;
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

        // Build thinking configuration based on effort level and model capabilities
        const thinkingBudget = this.getThinkingBudget(params.effortLevel, modelName);
        const useThinking = this.supportsThinking(modelName) && thinkingBudget !== undefined;

        // Create chat config - only include thinkingConfig if model supports it and effortLevel is specified
        const chatConfig: Record<string, unknown> = {};
        this.setThinkingConfig(chatConfig, useThinking, params.effortLevel, modelName, thinkingBudget);

        // Ensure Gemini client is initialized
        const client = await this.ensureGeminiClient();

        // systemInstruction (a plain string) is the stable, cacheable prefix. It must ride in the
        // per-request config since @google/genai's sendMessage config REPLACES the session config.
        // We do NOT fold chatConfig (thinkingConfig) in — that preserves prior thinking behavior and
        // avoids sending a thinking level some models reject (see nonStreamingChatCompletion).
        const requestConfig: Record<string, unknown> = { ...modelOptions };
        if (systemInstructionText) {
            requestConfig.systemInstruction = systemInstructionText;
        }

        const chat = client.chats.create({
            config: Object.keys(chatConfig).length > 0 ? chatConfig : undefined,
            model: modelName,
            history: history
        });

        // Send the latest user message (streaming); system prompt rides in requestConfig.
        const streamResult = await chat.sendMessageStream({
            message: finalMessageParts,
            config: requestConfig
        });
        
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

        // Extract usage from chunk if available (appears on final chunk). Normalize to the uniform
        // ModelUsage contract: promptTokenCount INCLUDES cached, so subtract cachedContentTokenCount
        // (clamped at 0) to get UNCACHED/net-new promptTokens; cacheReadTokens holds the disjoint
        // cache-read subset.
        let usage = null;
        if (chunk.usageMetadata) {
            const chunkCachedTokens = chunk.usageMetadata.cachedContentTokenCount ?? 0;
            const chunkNetPromptTokens = Math.max(0, (chunk.usageMetadata.promptTokenCount || 0) - chunkCachedTokens);
            usage = new ModelUsage(
                chunkNetPromptTokens,
                chunk.usageMetadata.candidatesTokenCount || 0
            );
            usage.cacheReadTokens = chunkCachedTokens;

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

    public static MapMJContentToGeminiParts(content: ChatMessageContent): Array<Part> {
        const parts: Array<Part> = [];
        if (Array.isArray(content)) {
            for (const part of content) {
                if (part.type === 'text') {
                    parts.push({text: part.content});
                }
                else {
                    // Strip data-URL prefix if present — Gemini expects raw base64
                    let rawBase64 = part.content;
                    let detectedMime: string | undefined;
                    const dataUrlMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
                    if (dataUrlMatch) {
                        detectedMime = dataUrlMatch[1];
                        rawBase64 = dataUrlMatch[2];
                    }

                    // Guard: if content isn't valid base64, fall back to a text part.
                    // This handles placeholder strings (e.g. "[File: ... — accessible via artifact tools]")
                    // that were tagged as file_url content blocks.
                    if (!dataUrlMatch && !/^[A-Za-z0-9+/\r\n]+=*$/.test(rawBase64.substring(0, 100))) {
                        parts.push({text: part.content});
                        continue;
                    }

                    // Use the inlineData property which expects a Blob with data and mimeType.
                    // Prefer the explicit mimeType from the content block; fall back to
                    // data-URL detected mime, then type-based defaults.
                    const blob: Blob = {
                        data: rawBase64,
                        mimeType: part.mimeType || detectedMime || (
                            part.type === 'image_url' ? 'image/jpeg' :
                            part.type === 'audio_url' ? 'audio/mpeg' :
                            part.type === 'video_url' ? 'video/mp4' :
                            'application/octet-stream'
                        ),
                    }
                    parts.push({inlineData: blob});
                }
            }
        }
        else {
            // we know that message.content is a string
            parts.push({text: content});
        }
        return parts;
    }

    public static MapMJMessageToGeminiHistoryEntry(message: ChatMessage): Content {
        return {
            role: message.role === 'assistant' ? 'model' : 'user', // google calls all messages other than the replies from the model 'user' which would include the system prompt
            parts: GeminiLLM.MapMJContentToGeminiParts(message.content)
        }
    }
}
 

// Export image generation
export * from './geminiImage';

// Export realtime (Gemini Live) driver
export * from './geminiRealtime';

// Export multimodal embeddings
export * from './geminiEmbedding2';