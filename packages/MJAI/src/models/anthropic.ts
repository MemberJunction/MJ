import dotenv from 'dotenv';
dotenv.config();

import { BaseLLM, BaseModel, ModelUsage } from "../generic/baseModel";
import { ChatParams, ChatResult, IChat } from "../generic/IChat";
import { ISummarize, SummarizeParams, SummarizeResult } from '../generic/ISummarize';
import { ClassifyParams, ClassifyResult, IClassify } from '../generic/IClassify';
import { AI_PROMPT, Anthropic, HUMAN_PROMPT } from "@anthropic-ai/sdk";
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(BaseModel, 'LLM' , 0)
export class AnthropicLLM extends BaseLLM implements IChat, ISummarize, IClassify {
    static _anthropic;//: OpenAIApi;


    constructor() {
        super();
        if (!AnthropicLLM._anthropic) {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
              throw new Error("The ANTHROPIC_API_KEY environment variable must be set");
            }
            
            AnthropicLLM._anthropic = new Anthropic({apiKey});
        }
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
