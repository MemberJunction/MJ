import { ChatParams, ChatResult } from "../generic/chat.types";
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { AI_PROMPT, Anthropic, HUMAN_PROMPT } from "@anthropic-ai/sdk";
import { BaseLLM } from '../generic/baseLLM';
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, null, 0)
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
${params.systemPrompt}
${AI_PROMPT} OK
${HUMAN_PROMPT} the following is the user message to process
${params.userMessage}`
        
        const startTime = new Date();            
        const sample = await AnthropicLLM._anthropic
        .complete({
          prompt: sPrompt,
          stop_sequences: [HUMAN_PROMPT],
          max_tokens_to_sample: 2000,
          model: "claude-v1",
        })        
        const endTime = new Date();

        const success = sample && sample.completion;
        let summaryText = null;
        if (success)
            summaryText = sample.completion;

        return new SummarizeResult(params.userMessage, summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

}
