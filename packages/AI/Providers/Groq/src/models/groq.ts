import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, StreamingChatCallbacks } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import Groq from 'groq-sdk';
import { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming } from 'groq-sdk/resources/chat/completions';

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

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        // Check if streaming is requested and if we support it
        if (params.streaming && params.streamingCallbacks && this.SupportsStreaming) {
            return this.HandleStreamingChatCompletion(params);
        }
        
        const startTime = new Date();

        const groqParams: ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: params.messages, 
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature
        };
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
            const res: ChatResultChoice = {
                message: {
                    role: 'assistant',
                    content: choice.message.content
                },
                finish_reason: choice.finish_reason,
                index: choice.index
            };
            return res;
        });
        
        return {
            success: true,
            statusText: "OK",
            startTime: startTime,
            endTime: endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            data: {
                choices: choices,
                usage: {
                    totalTokens: chatResponse.usage.total_tokens,
                    promptTokens: chatResponse.usage.prompt_tokens,
                    completionTokens: chatResponse.usage.completion_tokens
                }
            },
            errorMessage: "",
            exception: null,
        }
    }
    
    /**
     * Handle streaming chat completion with Groq
     * Private method used internally by ChatCompletion
     */
    private async HandleStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        
        return new Promise<ChatResult>((resolve, reject) => {
            (async () => {
                try {
                    const groqParams: ChatCompletionCreateParamsStreaming = {
                        model: params.model,
                        messages: params.messages,
                        max_tokens: params.maxOutputTokens,
                        temperature: params.temperature,
                        stream: true
                    };
                    
                    // Set response format if specified
                    switch (params.responseFormat) {
                        case 'JSON':
                            groqParams.response_format = { type: "json_object" };
                            break;
                        case 'ModelSpecific':
                            groqParams.response_format = params.modelSpecificResponseFormat;
                            break;
                    }
                    
                    // Create streaming completion
                    const stream = await this.client.chat.completions.create(groqParams);
                    
                    // Track accumulated response for final result
                    let accumulatedContent = '';
                    let finishReason = '';
                    let promptTokens = 0;
                    let completionTokens = 0;
                    
                    // Process each chunk
                    for await (const chunk of stream) {
                        if (chunk.choices && chunk.choices.length > 0) {
                            const choice = chunk.choices[0];
                            
                            if (choice.delta?.content) {
                                const content = choice.delta.content;
                                accumulatedContent += content;
                                
                                if (params.streamingCallbacks?.OnContent) {
                                    params.streamingCallbacks.OnContent(content, false);
                                }
                            }
                            
                            if (choice.finish_reason) {
                                finishReason = choice.finish_reason;
                            }
                        }
                        
                        // Groq doesn't provide usage in streaming chunks
                        // We'll estimate usage at the end
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
                                finish_reason: finishReason || 'stop',
                                index: 0
                            }],
                            usage: {
                                promptTokens: promptTokens,
                                completionTokens: completionTokens,
                                totalTokens: promptTokens + completionTokens
                            }
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
                    
                    const endTime = new Date();
                    reject({
                        data: {
                            choices: [],
                            usage: {
                                promptTokens: 0,
                                completionTokens: 0,
                                totalTokens: 0
                            }
                        },
                        success: false,
                        statusText: 'error',
                        startTime,
                        endTime,
                        timeElapsed: endTime.getTime() - startTime.getTime(),
                        errorMessage: error?.message,
                        exception: {exception: error}
                    });
                }
            })();
        });
    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}
 
export function LoadGroqLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}