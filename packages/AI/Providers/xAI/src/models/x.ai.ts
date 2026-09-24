import { BaseLLM } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const ___url: string = 'https://api.x.ai/v1'

/**
 * xAI implementation is just a sub-class of the OpenAILLM that overrides the base url
 */
@RegisterClass(BaseLLM, 'xAILLM')
export class xAILLM extends OpenAILLM {  // case-violation-ok-legacy-back-compat: the vendor spells its own name "xAI"; this identifier is also the class-factory registration key
    constructor(apiKey: string) {
        super(apiKey, ___url);
    }
}