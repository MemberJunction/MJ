import { AI_PROMPT, Anthropic, HUMAN_PROMPT } from "@anthropic-ai/sdk";
import { BaseLLM, ChatParams, ChatResult, ClassifyParams, ClassifyResult, 
    EmbedParams, 
    EmbedResult, 
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams, 
    SummarizeResult } from '@memberjunction/ai';
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, 'AnthropicLLM')
export class AnthropicLLM extends BaseLLM {
    static _anthropic; 


    constructor(apiKey: string) {
        super(apiKey);
        if (!AnthropicLLM._anthropic) 
            AnthropicLLM._anthropic = new Anthropic({apiKey});
    }

    public async ChatCompletion(params: ChatParams): Promise<ChatResult>{
        throw new Error("Method not implemented."); 
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
          model: "claude-2.1",
        })        
        const endTime = new Date();

        const success = sample && sample.completion;
        let summaryText = null;
        if (success)
            summaryText = sample.completion;

        return new SummarizeResult(GetUserMessageFromChatParams(params), summaryText, success, startTime, endTime);
    }

    ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    public async EmbedText(params: EmbedParams): Promise<EmbedResult> {
        throw new Error("Method not implemented.");
    }

}

export function LoadAnthropicLLM() {
    // does nothing, avoid tree shaking that will get rid of this class since there is no static link to this class in the code base as it is loaded dynamically
}