import { BaseLLM } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

/**
 * Default base URL for a stock `llama-server` process. llama.cpp's HTTP server
 * listens on port 8080 and exposes an OpenAI-compatible API under `/v1`.
 */
export const DEFAULT_LLAMA_CPP_URL: string = 'http://localhost:8080/v1';

/**
 * Placeholder API key used when the caller doesn't provide one.
 * llama.cpp's server typically runs unauthenticated, but the OpenAI SDK requires
 * a non-empty string. If `llama-server` is started with `--api-key`, the caller
 * should pass the real key to the constructor.
 */
const PLACEHOLDER_API_KEY = 'llama-cpp-no-auth';

/**
 * llama.cpp implementation is just a sub-class of OpenAILLM that points at a
 * locally running `llama-server` instance. llama.cpp's HTTP server exposes an
 * OpenAI-compatible `/v1/chat/completions` endpoint, so all request/streaming
 * behaviour is inherited.
 */
@RegisterClass(BaseLLM, 'LlamaCppLLM')
export class LlamaCppLLM extends OpenAILLM {
    constructor(apiKey?: string, baseUrl?: string) {
        const effectiveKey = apiKey && apiKey.length > 0 ? apiKey : PLACEHOLDER_API_KEY;
        const effectiveUrl = baseUrl && baseUrl.length > 0 ? baseUrl : DEFAULT_LLAMA_CPP_URL;
        super(effectiveKey, effectiveUrl);
    }
}
