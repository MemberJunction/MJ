import { BaseLLM, ChatParams } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

const ___url: string = 'https://api.siliconflow.com/v1';

/**
 * SiliconFlow implementation is a sub-class of OpenAILLM that overrides the base URL to point at
 * SiliconFlow's OpenAI-compatible chat-completions endpoint. SiliconFlow hosts open-weight models
 * (GLM, Qwen, DeepSeek, Kimi, ...) as serverless inference, addressed by their Hugging Face-style
 * id (e.g. `zai-org/GLM-5.3-Flash`).
 * @see https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions
 */
@RegisterClass(BaseLLM, 'SiliconFlowLLM')
export class SiliconFlowLLM extends OpenAILLM {
    constructor(apiKey: string) {
        super(apiKey, ___url);
    }

    /**
     * OpenAILLM sends the output cap as `max_completion_tokens`, which SiliconFlow silently
     * ignores — it documents only `max_tokens`. Verified live 2026-09-29 on GLM-5.3-Flash: a
     * 20-token cap sent as `max_completion_tokens` alone produced 5,901 tokens. Mirroring the cap
     * onto `max_tokens` is what makes it bind.
     */
    protected override getProviderRequestExtras(params: ChatParams): Record<string, unknown> {
        return params.maxOutputTokens != null ? { max_tokens: params.maxOutputTokens } : {};
    }
}
