import { BaseLLM, ChatParams } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";
import { OpenAI } from "openai";

/**
 * Fireworks.ai implementation of {@link BaseLLM}.
 *
 * Fireworks.ai exposes an OpenAI-compatible Chat Completions API, so this driver extends
 * {@link OpenAILLM} directly — inheriting long-running HTTP transport (`BaseModel.CustomFetch`),
 * streaming & usage normalization, cancellation forwarding, native tool calling, and multimodal
 * message conversion — while configuring Fireworks' default endpoint and `top_k` sampling extension.
 */
@RegisterClass(BaseLLM, 'FireworksLLM')
export class FireworksLLM extends OpenAILLM {
    private static readonly DEFAULT_BASE_URL = 'https://api.fireworks.ai/inference/v1';

    constructor(apiKey: string, baseURL?: string) {
        super(apiKey, baseURL || FireworksLLM.DEFAULT_BASE_URL);
    }

    /**
     * Read-only getter returning the underlying OpenAI-compatible client instance
     * (backwards-compatible alias for {@link OpenAILLM.OpenAI}).
     */
    public get Client(): OpenAI {
        return this.OpenAI;
    }

    /**
     * Fireworks.ai supports `top_k` sampling on Chat Completions requests.
     */
    protected override get SupportsTopK(): boolean {
        return true;
    }

    /**
     * Forwards Fireworks-specific `top_k` extension onto both streaming and non-streaming requests.
     */
    protected override getProviderRequestExtras(params: ChatParams): Record<string, unknown> {
        return params.topK != null ? { top_k: params.topK } : {};
    }
}
