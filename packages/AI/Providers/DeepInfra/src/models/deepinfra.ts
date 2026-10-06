import { BaseLLM, ChatParams } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const ___url: string = 'https://api.deepinfra.com/v1/openai';

/**
 * DeepInfra implementation is a sub-class of OpenAILLM that overrides the base URL to point at
 * DeepInfra's OpenAI-compatible chat-completions endpoint. DeepInfra hosts open-weight models
 * (GLM, Qwen, DeepSeek, Kimi, ...) as serverless inference, addressed by their Hugging Face-style
 * id (e.g. `zai-org/GLM-5.3-Flash`).
 * @see https://docs.deepinfra.com/chat/overview
 */
@RegisterClass(BaseLLM, 'DeepInfraLLM')
export class DeepInfraLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, ___url);
    }

    /**
     * OpenAILLM sends the output cap as `max_completion_tokens`, but DeepInfra documents only
     * `max_tokens`. In a live check (2026-09-29, GLM-5.3-Flash) DeepInfra honored either one;
     * mirroring the cap onto the documented parameter keeps that from depending on undocumented
     * behavior. SiliconFlow, the same shape of provider, does ignore `max_completion_tokens`.
     */
    protected override getProviderRequestExtras(params: ChatParams): Record<string, unknown> {
        return params.maxOutputTokens != null ? { max_tokens: params.maxOutputTokens } : {};
    }
}
