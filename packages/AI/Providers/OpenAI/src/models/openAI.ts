import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, GetUserMessageFromChatParams, ModelUsage, SummarizeParams, SummarizeResult, StreamingChatCallbacks } from "@memberjunction/ai";
import { OpenAI } from "openai";
import { RegisterClass } from '@memberjunction/global';
import { ChatCompletionMessageParam } from "openai/resources";

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

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        // Check if streaming is requested and if we support it
        if (params.streaming && params.streamingCallbacks && this.SupportsStreaming) {
            return this.HandleStreamingChatCompletion(params);
        }

        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);

        const startTime = new Date();
        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: messages,
            temperature: params.temperature,
            max_tokens: params.maxOutputTokens
        };

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
     * Handle streaming chat completion with OpenAI
     * Private method used internally by ChatCompletion
     */
    private async HandleStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);
        const startTime = new Date();
        
        return new Promise<ChatResult>((resolve, reject) => {
            (async () => {
                try {
                    const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
                        model: params.model,
                        messages: messages,
                        temperature: params.temperature,
                        max_tokens: params.maxOutputTokens,
                        stream: true
                    };
                    
                    // Set response format if specified
                    switch (params.responseFormat) {
                        case 'JSON':
                            openAIParams.response_format = { type: "json_object" };
                            break;
                        case 'ModelSpecific':
                            openAIParams.response_format = params.modelSpecificResponseFormat;
                            break;
                    }
                    
                    // Create streaming completion
                    const stream = await this.OpenAI.chat.completions.create(openAIParams);
                    
                    // Track accumulated response for final result
                    let accumulatedContent = '';
                    let finalChoice = null;
                    let finalUsage = null;
                    
                    // Process each chunk
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || '';
                        accumulatedContent += content;
                        
                        if (params.streamingCallbacks?.OnContent) {
                            params.streamingCallbacks.OnContent(content, false);
                        }
                        
                        // Save info for final result
                        finalChoice = chunk.choices[0];
                        if (chunk.usage) {
                            finalUsage = chunk.usage;
                        }
                    }
                    
                    // Stream complete, call OnContent one last time with isComplete=true
                    if (params.streamingCallbacks?.OnContent) {
                        params.streamingCallbacks.OnContent('', true);
                    }
                    
                    // Create final result object
                    const endTime = new Date();
                    const result: ChatResult = {
                        data: {
                            choices: [{
                                message: {
                                    role: 'assistant',
                                    content: accumulatedContent
                                },
                                finish_reason: finalChoice?.finish_reason || 'stop',
                                index: 0
                            }],
                            usage: finalUsage ? 
                                new ModelUsage(finalUsage.prompt_tokens, finalUsage.completion_tokens) :
                                new ModelUsage(0, 0)
                        },
                        success: true,
                        statusText: 'success',
                        startTime,
                        endTime,
                        timeElapsed: endTime.getTime() - startTime.getTime(),
                        errorMessage: null,
                        exception: null
                    };
                    
                    // Call OnComplete with final result
                    if (params.streamingCallbacks?.OnComplete) {
                        params.streamingCallbacks.OnComplete(result);
                    }
                    
                    resolve(result);
                } catch (error) {
                    if (params.streamingCallbacks?.OnError) {
                        params.streamingCallbacks.OnError(error);
                    }
                    reject(error);
                }
            })();
        });
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
        // add user messages - using types OpenAI likes
        return messages.map(m => {
            return {
                role: this.ConvertMJToOpenAIRole(m.role), 
                content: m.content
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
    public ConvertMJToOpenAIRole(role: string) {//}: ChatCompletionRequestMessageRoleEnum {
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