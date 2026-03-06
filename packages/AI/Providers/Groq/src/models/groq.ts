import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer, ChatMessage, ChatMessageContentBlock } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import Groq from 'groq-sdk';
import { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam, ChatCompletionContentPart } from 'groq-sdk/resources/chat/completions';

/**
 * Groq implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, "GroqLLM")
export class GroqLLM extends BaseLLM {
    private _client: Groq;
    
    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Groq({ apiKey: apiKey });
    }

    /**
     * Read only getter method to get the Groq client instance
     */
    public get GroqClient(): Groq {
        return this._client;
    }

    /**
     * Read only getter method to get the Groq client instance
     */
    public get client(): Groq {
        return this.GroqClient;
    }
    
    /**
     * Groq supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Check if the provider supports thinking models
     * Groq supports thinking models with <think> blocks
     */
    protected supportsThinkingModels(): boolean {
        return true;
    }

    protected setGroqParamsEffortLevel(groqParams: any, params: ChatParams): void {
        let convertedEffortLevel = params.effortLevel;
        if (convertedEffortLevel) {
            const isGptOSSModel = params.model.toLowerCase().includes("gpt-oss");
            const isQwenModel = params.model.toLowerCase().includes("qwen");
            const numericEffortLevel = Number.isNaN(params.effortLevel) ? null : Number.parseInt(params.effortLevel);
            if (isGptOSSModel) {
                // map our efforts as follows:
                // 0-33 = "low"
                // 34-66 = "medium"
                // 67-100 = "high"
                if (numericEffortLevel !== null) {
                    if (numericEffortLevel >= 0 && numericEffortLevel <= 33) {
                        convertedEffortLevel = "low";
                    } else if (numericEffortLevel > 33 && numericEffortLevel <= 66) {
                        convertedEffortLevel = "medium";
                    } else if (numericEffortLevel > 66 && numericEffortLevel <= 100) {
                        convertedEffortLevel = "high";
                    }
                }
            }
            else if (isQwenModel) {
                // either default or none, map any non numeric value other than default as well as the number 0, to "none" and map anything else to "default"
                if (convertedEffortLevel.trim().toLowerCase() !== "default") {
                    convertedEffortLevel = numericEffortLevel ? "default" : "none";
                }
            }
            if (isGptOSSModel || isQwenModel){
                // right now, Groq only supports reasoning_effort with Qwen and GPT OSS models
                groqParams.reasoning_effort = convertedEffortLevel;
            }
        }
    }

    /**
     * Convert MJ messages to Groq-compatible format with proper multimodal support
     * Groq uses OpenAI-compatible format: { type: "image_url", image_url: { url: "..." } }
     */
    private convertToGroqMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
        const groqMessages: ChatCompletionMessageParam[] = [];

        for (const msg of messages) {
            // Simple string content
            if (typeof msg.content === 'string') {
                groqMessages.push({
                    role: msg.role as 'system' | 'user' | 'assistant',
                    content: msg.content
                });
                continue;
            }

            // Array of content blocks - convert to Groq format
            const contentBlocks = msg.content as ChatMessageContentBlock[];
            const groqContent: ChatCompletionContentPart[] = [];

            for (const block of contentBlocks) {
                if (block.type === 'text') {
                    groqContent.push({
                        type: 'text',
                        text: block.content
                    });
                } else if (block.type === 'image_url') {
                    groqContent.push({
                        type: 'image_url',
                        image_url: {
                            url: block.content
                        }
                    });
                }
                // Note: audio_url, video_url, file_url not yet supported by Groq
            }

            // If we have converted content blocks, use them; otherwise fall back to empty text
            groqMessages.push({
                role: msg.role as 'system' | 'user' | 'assistant',
                content: groqContent.length > 0 ? groqContent : ''
            } as ChatCompletionMessageParam);
        }

        return groqMessages;
    }

    /**
     * Implementation of non-streaming chat completion for Groq
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        // Convert to Groq-compatible message format with proper multimodal support
        const messages = this.convertToGroqMessages(params.messages);

        // Groq requires the last message to be a user message
        if (messages.length > 0 && messages[messages.length - 1].role !== 'user') {
            messages.push({
                role: 'user',
                content: 'OK' // Dummy message to satisfy Groq's requirement
            });
        }

        const groqParams: ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature
        };

        // Add reasoning_effort if supported by the model
        this.setGroqParamsEffortLevel(groqParams, params);

        // Add sampling and generation parameters
        if (params.topP != null) {
            groqParams.top_p = params.topP;
        }
        if (params.seed != null) {
            groqParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            groqParams.stop = params.stopSequences;
        }
        if (params.frequencyPenalty != null) {
            groqParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            groqParams.presence_penalty = params.presencePenalty;
        }
        
        // Groq doesn't support topK - warn if provided
        if (params.topK != null) {
            console.warn('Groq provider does not support topK parameter, ignoring');
        }
         
        switch (params.responseFormat) {
            case 'Any':
            case 'Text':
            case 'Markdown':
                break;
            case 'JSON':
                groqParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                groqParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        const chatResponse = await this.client.chat.completions.create(groqParams);
        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: any) => {
            const rawMessage = choice.message.content;
            // in some cases, Groq models do thinking and return that as the first part 
            // of the message the very first characters will be <think> and it ends with
            // </think> so we need to remove that and put that into a new thinking response element
            // Extract thinking content if present using base class helper
            const extracted = this.extractThinkingFromContent(rawMessage);

            const res: ChatResultChoice = {
                message: {
                    role: ChatMessageRole.assistant,
                    content: extracted.content,
                    thinking: extracted.thinking || choice.message.reasoning               
                },
                finish_reason: choice.finish_reason,
                index: choice.index
            };
            return res;
        });
        
        // Create ModelUsage with timing data if available
        const usage = new ModelUsage(chatResponse.usage.prompt_tokens, chatResponse.usage.completion_tokens);
        
        // Groq provides detailed timing in the usage object
        const groqUsage = chatResponse.usage;
        if (groqUsage.queue_time !== undefined) {
            // Convert from seconds to milliseconds
            usage.queueTime = groqUsage.queue_time * 1000;
        }
        if (groqUsage.prompt_time !== undefined) {
            // Convert from seconds to milliseconds
            usage.promptTime = groqUsage.prompt_time * 1000;
        }
        if (groqUsage.completion_time !== undefined) {
            // Convert from seconds to milliseconds
            usage.completionTime = groqUsage.completion_time * 1000;
        }
        
        const result = {
            success: true,
            statusText: "OK",
            startTime: startTime,
            endTime: endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            data: {
                choices: choices,
                usage: usage
            },
            errorMessage: "",
            exception: null,
        } as ChatResult;
        
        // Add model-specific response details
        result.modelSpecificResponseDetails = {
            provider: 'groq',
            model: chatResponse.model,
            systemFingerprint: (chatResponse as any).system_fingerprint
        };
        
        return result;
    }
    
    /**
     * Create a streaming request for Groq
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Initialize streaming state for thinking extraction if supported
        if (this.supportsThinkingModels()) {
            this.initializeThinkingStreamState();
        }

        // Convert to Groq-compatible message format with proper multimodal support
        const messages = this.convertToGroqMessages(params.messages);

        const groqParams: ChatCompletionCreateParamsStreaming = {
            model: params.model,
            messages: messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature,
            stream: true
        };
        
        // Add reasoning_effort if supported by the model
        this.setGroqParamsEffortLevel(groqParams, params);
        
        // Add sampling and generation parameters
        if (params.topP != null) {
            groqParams.top_p = params.topP;
        }
        if (params.seed != null) {
            groqParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            groqParams.stop = params.stopSequences;
        }
        if (params.frequencyPenalty != null) {
            groqParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            groqParams.presence_penalty = params.presencePenalty;
        }
        
        // Groq doesn't support topK - warn if provided
        if (params.topK != null) {
            console.warn('Groq provider does not support topK parameter, ignoring');
        }
        
        // Set response format if specified
        switch (params.responseFormat) {
            case 'JSON':
                groqParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                groqParams.response_format = params.modelSpecificResponseFormat;
                break;
        }
        
        return this.client.chat.completions.create(groqParams);
    }
    
    /**
     * Process a streaming chunk from Groq
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;
        
        if (chunk?.choices && chunk.choices.length > 0) {
            const choice = chunk.choices[0];
            
            if (choice?.delta?.content) {
                const rawContent = choice.delta.content;
                
                // Process the content with thinking extraction if supported
                content = this.supportsThinkingModels() 
                    ? this.processStreamChunkWithThinking(rawContent)
                    : rawContent;
            }
            
            if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
            }
        }
        
        // Groq doesn't provide usage in streaming chunks
        return {
            content,
            finishReason,
            usage: null
        };
    }
    
    /**
     * Create the final response from streaming results for Groq
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Extract finish reason from last chunk if available
        let finishReason = 'stop';
        if (lastChunk?.choices && lastChunk.choices.length > 0 && lastChunk.choices[0].finish_reason) {
            finishReason = lastChunk.choices[0].finish_reason;
        }
        
        // For Groq, we don't have precise usage metrics from streaming
        // We'll use the accumulated ones or defaults
        const promptTokens = usage?.promptTokens || 0;
        const completionTokens = usage?.completionTokens || 0;
        
        // Create dates (will be overridden by base class)
        const now = new Date();
        
        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);
        
        // Get thinking content from streaming state if available
        const thinkingContent = this.thinkingStreamState?.accumulatedThinking.trim();
        
        // Set all properties
        result.data = {
            choices: [{
                message: this.addThinkingToMessage({
                    role: ChatMessageRole.assistant,
                    content: accumulatedContent ? accumulatedContent : ''
                }, thinkingContent),
                finish_reason: finishReason,
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
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}
