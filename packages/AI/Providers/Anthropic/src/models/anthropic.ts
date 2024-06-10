import { AI_PROMPT, Anthropic, HUMAN_PROMPT } from "@anthropic-ai/sdk";
import { BaseLLM, ChatMessage, ChatParams, ChatResult, ClassifyParams, ClassifyResult, 
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams, 
    SummarizeResult } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, 'AnthropicLLM')
export class AnthropicLLM extends BaseLLM {
    static _anthropic; 


    constructor(apiKey: string) {
        super(apiKey);
        if (!AnthropicLLM._anthropic) 
            AnthropicLLM._anthropic = new Anthropic({apiKey});
    }

    protected anthropicMessageFormatting(messages: ChatMessage[]): ChatMessage[] {
        // this method is simple, it makes sure that we alternate messages between user and assistant, otherwise Anthropic will
        // have a problem. If we find two user messages in a row, we insert an assistant message between them with just "OK"
        const result: ChatMessage[] = [];
        let lastRole = "assistant";
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === lastRole) {
                result.push({
                    role: "assistant",
                    content: "OK"
                });
            }
            result.push(messages[i]);
            lastRole = messages[i].role;
        }
        return result;
    }

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        const startTime = new Date();
        let result: any = null;
        try {
            result = await AnthropicLLM._anthropic.messages.create({
                model: params.model,
                max_tokens: 4096, // max claude output tokens
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
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        const sPrompt: string = `${HUMAN_PROMPT} the following is a SYSTEM prompt that is important to comply with at all times 
${GetSystemPromptFromChatParams(params)}
${AI_PROMPT} OK
${HUMAN_PROMPT} the following is the user message to process
${GetUserMessageFromChatParams(params)}`
        
        const startTime = new Date();            
        const sample = await AnthropicLLM._anthropic
        .complete({
          prompt: sPrompt,
          stop_sequences: [HUMAN_PROMPT],
          max_tokens_to_sample: 2000,
          temperature: params.temperature,
          model: params.model ? params.model : "claude-2.1",
        })        
        const endTime = new Date();

        const success = sample && sample.completion;
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