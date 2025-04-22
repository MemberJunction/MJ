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

    /**
     * Implementation of non-streaming chat completion for Mistral
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
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
     * Create a streaming request for Mistral
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        let responseFormat: ResponseFormat | undefined = undefined;
        if (params.responseFormat === 'JSON') {
            responseFormat = { type: "json_object" };
        }
        
        return this.Client.chat.stream({
            model: params.model,
            messages: params.messages,
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat
        });
    }
    
    /**
     * Process a streaming chunk from Mistral
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let usage = null;
        
        if (chunk?.data?.choices && chunk.data.choices.length > 0) {
            const choice = chunk.data.choices[0];
            
            // Extract content from the choice delta
            if (choice?.delta?.content) {
                if (typeof choice.delta.content === 'string') {
                    content = choice.delta.content;
                } else if (Array.isArray(choice.delta.content)) {
                    content = choice.delta.content.join('');
                }
            }
            
            // Save usage information if available
            if (chunk?.data?.usage) {
                usage = {
                    promptTokens: chunk.data.usage.promptTokens || 0,
                    completionTokens: chunk.data.usage.completionTokens || 0,
                    totalTokens: chunk.data.usage.totalTokens || 0
                };
            }
        }
        
        return {
            content,
            finishReason: chunk?.data?.choices?.[0]?.finishReason,
            usage
        };
    }
    
    /**
     * Create the final response from streaming results for Mistral
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Create dates (will be overridden by base class)
        const now = new Date();
        
        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);
        
        // Set all properties
        result.data = {
            choices: [{
                message: {
                    role: 'assistant',
                    content: accumulatedContent ? accumulatedContent : ''
                },
                finish_reason: lastChunk?.data?.choices?.[0]?.finishReason || 'stop',
                index: 0
            }],
            usage: usage || {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            }
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

export function LoadMistralLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}