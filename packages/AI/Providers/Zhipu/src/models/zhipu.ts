import { BaseLLM } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const ___url: string = 'https://api.z.ai/api/paas/v4'

/**
 * ZhipuLLM implementation is a sub-class of OpenAILLM that overrides the base URL
 * to point to Z.AI's OpenAI-compatible API endpoint.
 *
 * Z.AI (Zhipu AI) develops the GLM (General Language Model) series including:
 * - GLM 4.6, GLM 4.7, GLM 5
 *
 * The API is fully OpenAI-compatible, supporting chat completions, streaming,
 * and structured outputs.
 */
@RegisterClass(BaseLLM, 'ZhipuLLM')
export class ZhipuLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, ___url);
    }
}
