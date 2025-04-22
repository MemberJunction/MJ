import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, StreamingChatCallbacks } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Mistral } from "@mistralai/mistralai";
import { ChatCompletionChoice, ResponseFormat, CompletionEvent, CompletionResponseStreamChoice } from '@mistralai/mistralai/models/components';

@RegisterClass(BaseLLM, "MistralLLM")
export class MistralLLM extends BaseLLM {
    private _client: Mistral;

    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Mistral({
            apiKey: apiKey
        });
    }

    public get Client(): Mistral {return this._client;}
    
    /**
     * Mistral supports streaming
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

        let responseFormat: ResponseFormat | undefined = undefined;
        if (params.responseFormat) {
            if(params.responseFormat === 'JSON') {
                responseFormat = { type: "json_object" };
            }
        }

        const chatResponse = await this.Client.chat.complete({
            model: params.model,
            messages: params.messages, 
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat
        });

        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: ChatCompletionChoice) => {
            let content: string = "";

            if(choice.message.content && typeof choice.message.content === 'string') {
                content = choice.message.content;
            }
            else if(choice.message.content && Array.isArray(choice.message.content)) {
                content = choice.message.content.join(' ');
            }

            const res: ChatResultChoice = {
                message: {
                    role: 'assistant',
                    content: content
                },
                finish_reason: choice.finishReason,
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
                    totalTokens: chatResponse.usage.totalTokens,
                    promptTokens: chatResponse.usage.promptTokens,
                    completionTokens: chatResponse.usage.completionTokens
                }
            },
            errorMessage: "",
            exception: null,
        }
    }
    
    /**
     * Handle streaming chat completion with Mistral
     * Private method used internally by ChatCompletion
     */
    private async HandleStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        
        return new Promise<ChatResult>((resolve, reject) => {
            (async () => {
                try {
                    let responseFormat: ResponseFormat | undefined = undefined;
                    if (params.responseFormat === 'JSON') {
                        responseFormat = { type: "json_object" };
                    }
                    
                    // Create streaming completion
                    const stream = await this.Client.chat.stream({
                        model: params.model,
                        messages: params.messages,
                        maxTokens: params.maxOutputTokens,
                        responseFormat: responseFormat
                    });
                    
                    // Track accumulated response for final result
                    let accumulatedContent = '';
                    let lastChoice: any = null;
                    let usageInfo = {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0
                    };
                    
                    // Process each chunk
                    for await (const chunk of stream) {
                        if (chunk.data && chunk.data.choices && chunk.data.choices.length > 0) {
                            const choice = chunk.data.choices[0];
                            
                            // Extract content from the choice delta
                            if (choice.delta && choice.delta.content) {
                                let content = '';
                                
                                if (typeof choice.delta.content === 'string') {
                                    content = choice.delta.content;
                                } else if (Array.isArray(choice.delta.content)) {
                                    content = choice.delta.content.join('');
                                }
                                
                                accumulatedContent += content;
                                
                                if (params.streamingCallbacks?.OnContent) {
                                    params.streamingCallbacks.OnContent(content, false);
                                }
                            }
                            
                            // Keep track of the last choice for finish reason
                            lastChoice = choice;
                        }
                        
                        // Save usage information if available
                        if (chunk.data && chunk.data.usage) {
                            usageInfo = {
                                promptTokens: chunk.data.usage.promptTokens,
                                completionTokens: chunk.data.usage.completionTokens,
                                totalTokens: chunk.data.usage.totalTokens
                            };
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
                                finish_reason: lastChoice?.finishReason || 'stop',
                                index: 0
                            }],
                            usage: usageInfo
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

export function LoadMistralLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}