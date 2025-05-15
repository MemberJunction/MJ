import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, GetUserMessageFromChatParams, ModelUsage, SummarizeParams, SummarizeResult, StreamingChatCallbacks } from "@memberjunction/ai";
import { OpenAI } from "openai";
import { RegisterClass } from '@memberjunction/global';
import { ChatCompletionAssistantMessageParam, ChatCompletionContentPart, ChatCompletionMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources";

/**
 * OpenAI implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, 'OpenAILLM')
export class OpenAILLM extends BaseLLM {
    private _openAI: OpenAI;

    constructor(apiKey: string) {
        super(apiKey);

        // now create the OpenAI instance
        this._openAI = new OpenAI({
            apiKey: apiKey,
        });
    }

    /**
     * Read only getter method to get the OpenAI instance
     */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    /**
     * OpenAI supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Implementation of non-streaming chat completion for OpenAI
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const startTime = new Date();
        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: messages,
            temperature: params.temperature,
            max_completion_tokens: params.maxOutputTokens
        };
        
        if (params.effortLevel) {
            openAIParams.reasoning_effort = params.effortLevel as OpenAI.Chat.Completions.ChatCompletionReasoningEffort;
        }

        switch (params.responseFormat) {
            case 'Any':
            case 'Text':
            case 'Markdown':
                break;
            case 'JSON':
                openAIParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                openAIParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        const result = await this.OpenAI.chat.completions.create(openAIParams);
        const endTime = new Date();
        const timeElapsed = endTime.getTime() - startTime.getTime();

        return {
            data: {
                choices: result.choices.map((c: { message: { role: string | number; content: any; }; finish_reason: any; index: any; }) => {
                    return {
                        message: {
                            role: <ChatMessageRole>c.message.role,
                            content: c.message.content
                        },
                        finish_reason: c.finish_reason,
                        index: c.index
                    }
                }),
                usage: new ModelUsage(result.usage.prompt_tokens, result.usage.completion_tokens)
            },
            success: !!result,
            statusText: 'success',
            startTime: startTime,
            endTime: endTime,
            timeElapsed: timeElapsed,
            errorMessage: null,
            exception: null
        }
    }

    /**
     * Create a streaming request for OpenAI
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);
        
        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: params.model,
            messages: messages,
            temperature: params.temperature,
            max_tokens: params.maxOutputTokens,
            stream: true
        };
        
        if (params.effortLevel) {
            openAIParams.reasoning_effort = params.effortLevel as OpenAI.Chat.Completions.ChatCompletionReasoningEffort;
        }
        
        // Set response format if specified
        switch (params.responseFormat) {
            case 'JSON':
                openAIParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                openAIParams.response_format = params.modelSpecificResponseFormat;
                break;
        }
        
        return this.OpenAI.chat.completions.create(openAIParams);
    }
    
    /**
     * Process a streaming chunk from OpenAI
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        // Handle potential null/undefined values safely
        const content = chunk?.choices?.[0]?.delta?.content || '';
        const usage = chunk?.usage || null;
        
        return {
            content,
            finishReason: chunk?.choices?.[0]?.finish_reason,
            usage: usage ? {
                promptTokens: usage.prompt_tokens || 0,
                completionTokens: usage.completion_tokens || 0,
                totalTokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
            } : null
        };
    }
    
    /**
     * Create the final response from streaming results for OpenAI
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
        const result = await this.OpenAI.chat.completions.create({
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
            let content: any = m.content;
            
            // Process content if it's an array
            if (content instanceof Array) {
                // Filter out unsupported types and convert to OpenAI's expected format
                const contentParts = content
                    .map(c => {
                        // For text type
                        if (c.type === 'text') {
                            return {
                                type: 'text',
                                text: c.content
                            };
                        } 
                        // For image_url type
                        else if (c.type === 'image_url') {
                            return {
                                type: 'image_url',
                                image_url: { url: c.content }
                            };
                        }
                        // Warn about unsupported types
                        else {
                            console.warn(`Unsupported content type for OpenAI API: ${c.type}. This content will be skipped.`);
                            return null;
                        }
                    })
                    .filter(part => part !== null) as ChatCompletionContentPart[];
                
                content = contentParts;
            }
            
            // Create the appropriate message type based on role
            switch (role) {
                case 'system':
                    return { 
                        role: 'system', 
                        content: content as string | ChatCompletionContentPart[]
                    } as ChatCompletionSystemMessageParam;
                
                case 'user':
                    return { 
                        role: 'user', 
                        content: content as string | ChatCompletionContentPart[]
                    } as ChatCompletionUserMessageParam;
                
                case 'assistant':
                    return { 
                        role: 'assistant', 
                        content: content as string | ChatCompletionContentPart[]
                    } as ChatCompletionAssistantMessageParam;
                
                default:
                    throw new Error(`Unknown role ${m.role}`);
            }
        });
    }    


    /**
     * Utility method to map a MemberJunction role to OpenAI role
     *  - system maps to system
     *  - user maps to user
     *  - assistant maps to assistant
     *  - anything else throws an error
     * While the above is a direct 1:1 mapping, it is possible that OpenAI may have more roles in the future and this method will need to be updated for flexibility
     * @param role 
     * @returns 
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

export function LoadOpenAILLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}