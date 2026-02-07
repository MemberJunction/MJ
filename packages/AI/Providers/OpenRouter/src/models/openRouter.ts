import { BaseLLM } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const __openRouterURL: string = 'https://openrouter.ai/api/v1'

/**
 * OpenRouter implementation is just a sub-class of the OpenAILLM that overrides the base url
 */
@RegisterClass(BaseLLM, 'OpenRouterLLM')
export class OpenRouterLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, __openRouterURL);
    }
}