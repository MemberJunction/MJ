import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, 
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams, 
    SummarizeResult, ModelUsage } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, 'AnthropicLLM')
export class AnthropicLLM extends BaseLLM {
    private _anthropic: Anthropic;

    constructor(apiKey: string) {
        super(apiKey);
        this._anthropic = new Anthropic({apiKey});
    }

    /**
     * Read only getter method to get the Anthropic client instance
     */
    public get AnthropicClient(): Anthropic {
        return this._anthropic;
    }
    
    /**
     * Anthropic supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Format a text message with optional caching
     * @param content The message content (string or content blocks)
     * @param enableCaching Whether to enable caching
     * @returns Formatted content object
     */
    private formatContentWithCaching(content: any, enableCaching: boolean = true): any {
        let text: string;
        
        // Convert content to string if it's an array of content blocks
        if (typeof content === 'string') {
            text = content;
        } else if (Array.isArray(content)) {
            // Process array of content blocks - for now only text is supported
            text = content
                .filter(block => block.type === 'text')
                .map(block => block.content)
                .join('\n\n');
        } else {
            // Fallback for any other type
            text = String(content);
        }
        
        const formattedContent: any = {
            type: "text",
            text: text
        };
        
        // Add cache_control if caching is enabled (default to true)
        if (enableCaching) {
            formattedContent.cache_control = { type: "ephemeral" };
        }
        
        return formattedContent;
    }

    /**
     * Format messages for Anthropic API with caching support
     * @param messages Messages to format
     * @param enableCaching Whether to enable caching
     * @returns Formatted messages
     */
    protected formatMessagesWithCaching(messages: ChatMessage[], enableCaching: boolean = true): any[] {
        const result: any[] = [];
        let lastRole = "assistant";
        
        for (let i = 0; i < messages.length; i++) {
            // If we have two messages with the same role back-to-back, insert an assistant message
            if (messages[i].role === lastRole) {
                result.push({
                    role: "assistant",
                    content: [{ type: "text", text: "OK" }]
                });
            }
            
            const formattedMsg: any = {
                content: [],
                role: this.ConvertMJToAnthropicRole(messages[i].role)
            };
            
            // Apply caching only to the last message
            const isLastMessage = i === (messages.length - 1);
            
            // Format the content with or without caching based on message position
            // Add caching to the last message
            formattedMsg.content.push(
                this.formatContentWithCaching(messages[i].content, enableCaching && isLastMessage)
            );
            
            result.push(formattedMsg);

            lastRole = messages[i].role;
        }
        
        return result;
    }


    /**
     * Format messages for Anthropic API with caching support
     * @param messages Messages to format
     * @param enableCaching Whether to enable caching
     * @returns Formatted messages
     */
    protected formatSystemMessagesWithCaching(messages: ChatMessage[], enableCaching: boolean = true): any[] {
        const result: any[] = [];
        
        for (let i = 0; i < messages.length; i++) {
            // Apply caching only to the last message
            const isLastMessage = i === (messages.length - 1);
            
            // Format the content with or without caching based on message position
            // Add caching to the last message
            result.push(this.formatContentWithCaching(messages[i].content, enableCaching && isLastMessage));
        }
        
        return result;
    }

     
    /**
     * Utility method to map a MemberJunction role to OpenAI role
     *  - user maps to user
     *  - assistant maps to assistant
     *  - anything else maps to user
     * While the above is a direct 1:1 mapping, it is possible that OpenAI may have more roles in the future and this method will need to be updated for flexibility
     * @param role 
     * @returns 
     */
    public ConvertMJToAnthropicRole(role: ChatMessageRole): 'assistant' | 'user' { 
        switch (role) {
            case 'assistant':
                return 'assistant';
            default:
                return 'user'; // default is user
        }
    }

    /**
     * Non-streaming implementation for Anthropic
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        let result: any = null;
        try {
            // Find system message and non-system messages
            const systemMsgs = params.messages.filter(m => m.role === "system");
            const nonSystemMsgs = params.messages.filter(m => m.role !== "system");
            
            // Create the request parameters
            const createParams: any = {
                model: params.model,
                max_tokens: params.maxOutputTokens || 64000, // large default for max_tokens if not provided
                stream: true // even for non-streaming, we set stream to true as Anthropic prefers it for any decent sized response
            };
 
            // Add system message(s), if present
            if (systemMsgs) {
                createParams.system = this.formatSystemMessagesWithCaching(
                    systemMsgs, 
                    params.enableCaching || true
                );
            }
            
            // Add messages with caching applied to the last user message
            createParams.messages = this.formatMessagesWithCaching(
                nonSystemMsgs, 
                params.enableCaching || true
            );
            
            // Add thinking parameter if effort level is set
            // Note: Requires minimum 1 tokens or not budget set
            if (params.effortLevel && (params.reasoningBudgetTokens >= 1 || params.reasoningBudgetTokens === undefined || params.reasoningBudgetTokens === null)) {
                createParams.thinking = {
                    type: "enabled" as const
                };
                if (params.reasoningBudgetTokens) {
                    createParams.thinking.budget_tokens = params.reasoningBudgetTokens;
                }
            }
            
            const stream = this.AnthropicClient.messages.stream(createParams).on('text', (chunk: any) => {
                // too noisy to log this -- console.log('stream chunk', chunk);
            });;
            result = await stream.finalMessage();
            const endTime = new Date();
            
            const chatResult: ChatResult = {
                data: {
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: result.content[0].text
                            },
                            finish_reason: "completed",
                            index: 0
                        }
                    ],
                    usage: new ModelUsage(result.usage.input_tokens, result.usage.output_tokens)
                },
                success: true,
                statusText: 'success',
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                errorMessage: '',
                exception: ''
            };
            
            // Add cache metadata if available
            if (result.usage.cached_tokens !== undefined) {
                chatResult.cacheInfo = {
                    cacheHit: result.usage.cached_tokens > 0,
                    cachedTokenCount: result.usage.cached_tokens
                };
            }
            
            return chatResult;   
        }
        catch (e) {
            const endTime = new Date();
            return {
                data: {
                    choices: [],
                    usage: new ModelUsage(0, 0)
                },
                success: false,
                statusText: 'error',
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                errorMessage: e?.message,
                exception: {exception: e, llmResult: result}
            };
        }
    }
    
    /**
     * Create a streaming request for Anthropic
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Find system message and non-system messages
        const systemMsg = params.messages.find(m => m.role === "system");
        const nonSystemMsgs = params.messages.filter(m => m.role !== "system");
        
        // Create the request parameters
        const createParams: any = {
            model: params.model,
            max_tokens: params.maxOutputTokens,
            stream: true as const
        };
        
        // Add system with caching if present
        if (systemMsg) {
            createParams.system = this.formatContentWithCaching(
                systemMsg.content, 
                params.enableCaching
            );
        }
        
        // Add messages with caching applied
        createParams.messages = this.formatMessagesWithCaching(
            nonSystemMsgs, 
            params.enableCaching
        );
        
        // Add thinking parameter if effort level is set
        // Note: Requires minimum 1024 tokens and must be less than max_tokens
        if (params.effortLevel && params.reasoningBudgetTokens >= 1024) {
            createParams.thinking = {
                type: "enabled" as const,
                budget_tokens: params.reasoningBudgetTokens
            };
        }
        
        return this.AnthropicClient.messages.create(createParams);
    }
    
    /**
     * Process a streaming chunk from Anthropic
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        if (chunk && chunk.type === 'content_block_delta' && chunk.delta && 'text' in chunk.delta) {
            content = chunk.delta.text || '';
        }
        
        // Anthropic doesn't provide usage info in the stream
        return {
            content,
            finishReason: chunk && chunk.type === 'message_stop' ? 'stop' : undefined,
            usage: null
        };
    }
    
    /**
     * Create the final response from streaming results for Anthropic
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Handle possible null/undefined values
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
                    content: content
                },
                finish_reason: 'stop',
                index: 0
            }],
            usage: new ModelUsage(promptTokens, completionTokens)
        };
        
        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;
        
        // Add cache info if available
        if (usage?.cached_tokens !== undefined || lastChunk?.usage?.cached_tokens !== undefined) {
            const cachedTokens = usage?.cached_tokens || lastChunk?.usage?.cached_tokens || 0;
            result.cacheInfo = {
                cacheHit: cachedTokens > 0,
                cachedTokenCount: cachedTokens
            };
        }
        
        return result;
    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        // Define constants here since they are no longer exported from the SDK
        const HUMAN_PROMPT = "\n\nHuman: ";
        const AI_PROMPT = "\n\nAssistant: ";
        
        const sPrompt: string = `${HUMAN_PROMPT} the following is a SYSTEM prompt that is important to comply with at all times 
${GetSystemPromptFromChatParams(params)}
${AI_PROMPT} OK
${HUMAN_PROMPT} the following is the user message to process
${GetUserMessageFromChatParams(params)}`
        
        const startTime = new Date();            
        const sample = await this.AnthropicClient.completions 
        .create({
          prompt: sPrompt,
          stop_sequences: [HUMAN_PROMPT],
          max_tokens_to_sample: 2000,
          temperature: params.temperature,
          model: params.model ? params.model : "claude-2.1",
        })        
        const endTime = new Date();

        const success: boolean = sample && sample.completion?.length > 0;
        let summaryText = null;
        if (success)
            summaryText = sample.completion;

        return new SummarizeResult(GetUserMessageFromChatParams(params), summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}

export function LoadAnthropicLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}