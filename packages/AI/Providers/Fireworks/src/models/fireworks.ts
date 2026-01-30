import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, GetUserMessageFromChatParams, ModelUsage, SummarizeParams, SummarizeResult } from "@memberjunction/ai";
import { OpenAI } from "openai";
import { RegisterClass } from '@memberjunction/global';
import { ChatCompletionAssistantMessageParam, ChatCompletionMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources";

/**
 * Fireworks.ai implementation of the BaseLLM class
 * Fireworks.ai provides an OpenAI-compatible API, so we use the OpenAI SDK with a custom baseURL
 */
@RegisterClass(BaseLLM, 'FireworksLLM')
export class FireworksLLM extends BaseLLM {
    private _client: OpenAI;
    private static readonly DEFAULT_BASE_URL = 'https://api.fireworks.ai/inference/v1';

    constructor(apiKey: string, baseURL?: string) {
        super(apiKey);

        // Create the OpenAI-compatible client instance with Fireworks.ai endpoint
        this._client = new OpenAI({
            apiKey,
            baseURL: baseURL || FireworksLLM.DEFAULT_BASE_URL
        });
    }

    /**
     * Read-only getter method to get the client instance
     */
    public get Client(): OpenAI {
        return this._client;
    }

    /**
     * Fireworks.ai supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Implementation of non-streaming chat completion for Fireworks.ai
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const formattedMessages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const startTime = new Date();
        const fireworksParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: formattedMessages,
            temperature: params.temperature,
            max_completion_tokens: params.maxOutputTokens,
        };

        // Add sampling and generation parameters
        if (params.topP != null) {
            fireworksParams.top_p = params.topP;
        }
        if (params.frequencyPenalty != null) {
            fireworksParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            fireworksParams.presence_penalty = params.presencePenalty;
        }
        if (params.seed != null) {
            fireworksParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            fireworksParams.stop = params.stopSequences;
        }

        // Fireworks.ai supports topK via their extended API
        if (params.topK != null) {
            // Add topK as additional setting if supported
            (fireworksParams as unknown as Record<string, unknown>).top_k = params.topK;
        }

        // Handle response format
        switch (params.responseFormat) {
            case 'Any':
            case 'Text':
            case 'Markdown':
                break;
            case 'JSON':
                fireworksParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                fireworksParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        const result = await this.Client.chat.completions.create(fireworksParams);
        const endTime = new Date();
        const timeElapsed = endTime.getTime() - startTime.getTime();

        // Create ModelUsage with token information
        const usage = new ModelUsage(result.usage.prompt_tokens, result.usage.completion_tokens);

        const chatResult: ChatResult = {
            data: {
                choices: result.choices.map((c: unknown) => {
                    const choice = c as {
                        message: { content: string; role: string };
                        finish_reason: string;
                        index: number;
                    };

                    return {
                        message: {
                            role: ChatMessageRole.assistant,
                            content: choice.message.content,
                        },
                        finish_reason: choice.finish_reason,
                        index: choice.index,
                    }
                }),
                usage: usage
            },
            success: !!result,
            statusText: 'success',
            startTime: startTime,
            endTime: endTime,
            timeElapsed: timeElapsed,
            errorMessage: null,
            exception: null
        } as ChatResult;

        // Add model-specific response details
        chatResult.modelSpecificResponseDetails = {
            provider: 'fireworks',
            model: result.model,
            systemFingerprint: result.system_fingerprint,
            created: result.created,
            id: result.id,
            object: result.object,
        };

        return chatResult;
    }

    /**
     * Create a streaming request for Fireworks.ai
     */
    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
        const formattedMessages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const fireworksParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: params.model,
            messages: formattedMessages,
            temperature: params.temperature,
            max_tokens: params.maxOutputTokens,
            stream: true,
        };

        // Add sampling and generation parameters
        if (params.topP != null) {
            fireworksParams.top_p = params.topP;
        }
        if (params.frequencyPenalty != null) {
            fireworksParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            fireworksParams.presence_penalty = params.presencePenalty;
        }
        if (params.seed != null) {
            fireworksParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            fireworksParams.stop = params.stopSequences;
        }

        // Fireworks.ai supports topK
        if (params.topK != null) {
            (fireworksParams as unknown as Record<string, unknown>).top_k = params.topK;
        }

        // Set response format if specified
        switch (params.responseFormat) {
            case 'JSON':
                fireworksParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                fireworksParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        return this.Client.chat.completions.create(fireworksParams);
    }

    /**
     * Process a streaming chunk from Fireworks.ai
     */
    protected processStreamingChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): {
        content: string;
        finishReason?: string;
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    } {
        const content = chunk?.choices?.[0]?.delta?.content || '';
        const usage = chunk?.usage;

        return {
            content,
            finishReason: chunk?.choices?.[0]?.finish_reason,
            usage: usage ? {
                promptTokens: usage.prompt_tokens || 0,
                completionTokens: usage.completion_tokens || 0,
                totalTokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
            } : undefined
        };
    }

    /**
     * Create the final response from streaming results for Fireworks.ai
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: OpenAI.Chat.Completions.ChatCompletionChunk | null | undefined,
        usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null | undefined
    ): ChatResult {
        const content = accumulatedContent || '';
        const promptTokens = usage?.promptTokens || 0;
        const completionTokens = usage?.completionTokens || 0;

        // Create dates (will be overridden by base class)
        const now = new Date();

        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);

        // Set all properties
        result.data = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: content,
                },
                finish_reason: lastChunk?.choices?.[0]?.finish_reason || 'stop',
                index: 0
            }],
            usage: new ModelUsage(promptTokens, completionTokens)
        };

        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;

        return result;
    }

    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const startTime = new Date();
        const result = await this.Client.chat.completions.create({
            model: params.model,
            messages: messages
        });
        const endTime = new Date();

        const success = result && result.choices && result.choices.length > 0;
        let summaryText = null;
        if (success)
            summaryText = result.choices[0].message.content;

        return new SummarizeResult(GetUserMessageFromChatParams(params), summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    public ConvertMJToOpenAIChatMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
        return messages.map(m => {
            const role = this.ConvertMJToOpenAIRole(m.role);
            let content: unknown = m.content;

            // Process content if it's an array
            if (Array.isArray(content)) {
                // Filter out unsupported types and convert to OpenAI's expected format
                const contentParts = content
                    .map(c => {
                        // For text type
                        if (c.type === 'text') {
                            return {
                                type: 'text' as const,
                                text: c.content
                            };
                        }
                        // For image_url type
                        else if (c.type === 'image_url') {
                            return {
                                type: 'image_url' as const,
                                image_url: { url: c.content }
                            };
                        }
                        // Warn about unsupported types
                        else {
                            console.warn(`Unsupported content type for Fireworks.ai API: ${c.type}. This content will be skipped.`);
                            return null;
                        }
                    })
                    .filter(part => part !== null);

                content = contentParts;
            }

            // Create the appropriate message type based on role
            switch (role) {
                case 'system':
                    return {
                        role: 'system' as const,
                        content
                    } as ChatCompletionSystemMessageParam;

                case 'user':
                    return {
                        role: 'user' as const,
                        content
                    } as ChatCompletionUserMessageParam;

                case 'assistant':
                    return {
                        role: 'assistant' as const,
                        content
                    } as ChatCompletionAssistantMessageParam;

                default:
                    throw new Error(`Unknown role ${m.role}`);
            }
        });
    }

    /**
     * Utility method to map a MemberJunction role to OpenAI role
     */
    public ConvertMJToOpenAIRole(role: string): 'system' | 'user' | 'assistant' {
        switch (role.trim().toLowerCase()) {
            case 'system':
                return 'system';
            case 'user':
                return 'user';
            case 'assistant':
                return 'assistant';
            default:
                throw new Error(`Unknown role ${role}`)
        }
    }
}

export function LoadFireworksLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}
