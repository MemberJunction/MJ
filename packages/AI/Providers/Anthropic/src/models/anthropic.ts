import { AI_PROMPT, Anthropic, HUMAN_PROMPT } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources";
import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, 
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams, 
    SummarizeResult, StreamingChatCallbacks } from "@memberjunction/ai";
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

    protected anthropicMessageFormatting(messages: ChatMessage[]): MessageParam[] {
        // this method is simple, it makes sure that we alternate messages between user and assistant, otherwise Anthropic will
        // have a problem. If we find two user messages in a row, we insert an assistant message between them with just "OK"
        const result: MessageParam[] = [];
        let lastRole = "assistant";
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === lastRole) {
                result.push({
                    role: "assistant",
                    content: "OK"
                });
            }
            result.push({
                role: this.ConvertMJToAnthropicRole(messages[i].role),
                content: messages[i].content
            });
            lastRole = messages[i].role;
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
            result = await this.AnthropicClient.messages.create({
                model: params.model,
                max_tokens: params.maxOutputTokens, 
                system: params.messages.find(m => m.role === "system").content,
                messages: this.anthropicMessageFormatting(params.messages.filter(m => m.role !== "system"))
            });
            const endTime = new Date();
            return {
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
                    usage: {
                        promptTokens: result.usage.input_tokens,
                        completionTokens: result.usage.output_tokens,
                        totalTokens: result.usage.input_tokens + result.usage.output_tokens
                    }
                },
                success: true,
                statusText: 'success',
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                errorMessage: '',
                exception: ''
            };    
        }
        catch (e) {
            const endTime = new Date();
            return {
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
        const systemMessage = params.messages.find(m => m.role === "system")?.content || "";
        const nonSystemMessages = this.anthropicMessageFormatting(params.messages.filter(m => m.role !== "system"));
        
        return this.AnthropicClient.messages.create({
            model: params.model,
            max_tokens: params.maxOutputTokens,
            system: systemMessage,
            messages: nonSystemMessages,
            stream: true
        });
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
            usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens
            }
        };
        
        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;
        
        return result;
    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
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