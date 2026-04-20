import { BaseLLM } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const ___url: string = 'https://api.minimax.io/v1'

/**
 * MiniMax implementation is a sub-class of the OpenAILLM that overrides the base url.
 * MiniMax provides an OpenAI-compatible API for the M-series models (M2.5, M2.5-highspeed, etc.).
 */
@RegisterClass(BaseLLM, 'MiniMaxLLM')
export class MiniMaxLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, ___url);
    }
}
