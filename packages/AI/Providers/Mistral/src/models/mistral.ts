import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ChatMessage } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Mistral } from "@mistralai/mistralai";
import { ChatCompletionChoice, ResponseFormat, CompletionEvent, CompletionResponseStreamChoice, ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components';

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

        // Convert messages to format expected by Mistral
        const messages = this.MapMJMessagesToMistral(params.messages);
        // Create params object
        const params_obj: any = {
            model: params.model,
            messages: messages, 
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat
        };

        // Add temperature if specified
        if (params.temperature != null) {
            params_obj.temperature = params.temperature;
        }

        // Add supported parameters
        if (params.topP != null) {
            params_obj.topP = params.topP;
        }
        if (params.topK != null) {
            params_obj.topK = params.topK;
        }
        if (params.seed != null) {
            params_obj.randomSeed = params.seed; // Mistral uses randomSeed instead of seed
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            params_obj.stop = params.stopSequences;
        }

        // Mistral doesn't support these parameters - warn if provided
        if (params.frequencyPenalty != null) {
            console.warn('Mistral provider does not support frequencyPenalty parameter, ignoring');
        }
        if (params.presencePenalty != null) {
            console.warn('Mistral provider does not support presencePenalty parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Mistral provider does not support minP parameter, ignoring');
        }
        
        // Note: Mistral doesn't have a direct equivalent to effortLevel/reasoning_effort as of current API version
        // If/when Mistral adds this functionality, it should be added here

        const chatResponse = await this.Client.chat.complete(params_obj);

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
                    role: ChatMessageRole.assistant,
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
                usage: new ModelUsage(chatResponse.usage.promptTokens, chatResponse.usage.completionTokens)
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
        
        // Convert messages to format expected by Mistral
        const messages = this.MapMJMessagesToMistral(params.messages);
        
        // Create params object
        const params_obj: ChatCompletionStreamRequest = {
            model: params.model,
            messages: messages,
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat,
        };

        // Add temperature if specified
        if (params.temperature != null) {
            (params_obj as any).temperature = params.temperature;
        }

        // Add supported parameters
        if (params.topP != null) {
            (params_obj as any).topP = params.topP;
        }
        if (params.topK != null) {
            (params_obj as any).topK = params.topK;
        }
        if (params.seed != null) {
            (params_obj as any).randomSeed = params.seed; // Mistral uses randomSeed instead of seed
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            (params_obj as any).stop = params.stopSequences;
        }

        // Mistral doesn't support these parameters - warn if provided
        if (params.frequencyPenalty != null) {
            console.warn('Mistral provider does not support frequencyPenalty parameter, ignoring');
        }
        if (params.presencePenalty != null) {
            console.warn('Mistral provider does not support presencePenalty parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Mistral provider does not support minP parameter, ignoring');
        }
        
        // Note: Mistral doesn't have a direct equivalent to effortLevel/reasoning_effort as of current API version
        // If/when Mistral adds this functionality, it should be added here
        
        return this.Client.chat.stream(params_obj);
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
                usage = new ModelUsage(
                    chunk.data.usage.promptTokens || 0,
                    chunk.data.usage.completionTokens || 0
                );
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
                    role: ChatMessageRole.assistant,
                    content: accumulatedContent ? accumulatedContent : ''
                },
                finish_reason: lastChunk?.data?.choices?.[0]?.finishReason || 'stop',
                index: 0
            }],
            usage: usage || new ModelUsage(0, 0)
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

    protected MapMJMessagesToMistral(messages: ChatMessage[]): Array<any> {
        const returnMessages = messages.map(m => {
            if (typeof m.content === 'string') {
                return {
                    role: m.role,
                    content: m.content
                };
            } else {
                return { 
                    role: m.role,
                    content: m.content.map(block => {
                        let mistralType = undefined;
                        switch (block.type) {
                            case 'text':
                                mistralType = 'text';
                                break;
                            case 'image_url':
                                mistralType = 'image_url';
                                break;
                            case 'file_url':
                                mistralType = 'document_url';
                                break;
                            default:
                                console.warn(`${block.type} type is not supported in Mistral`);
                                break;
                        }
                        return {
                            type: block.type,
                            content: block.content
                        }
                    }).filter(block => block.type !== undefined)
                }
            }
        });
        
        // Mistral expects the last message to either be a user message or a tool message
        if (returnMessages.length > 0) {
            const lastMessage = returnMessages[returnMessages.length - 1];
            if (lastMessage.role !== 'user' /*&& lastMessage.role !== 'tool' -- in future if BaseLLM supports tool messages*/) {
                returnMessages.push({
                    role: 'user',
                    content: 'ok' // Placeholder message to satisfy Mistral's requirement
                })
            }
        }
        return returnMessages;
    }
}

export function LoadMistralLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}