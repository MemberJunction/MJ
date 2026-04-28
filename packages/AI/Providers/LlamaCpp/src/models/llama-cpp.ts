import { BaseLLM } from "@memberjunction/ai";
import { RegisterClass } from '@memberjunction/global';
import { OpenAILLM } from "@memberjunction/ai-openai";

/**
 * Default host for a stock `llama-server` process.
 */
export const DEFAULT_LLAMA_CPP_HOST = 'localhost';

/**
 * Default port for a stock `llama-server` process.
 */
export const DEFAULT_LLAMA_CPP_PORT = '8080';

/**
 * Default base URL for a stock `llama-server` process. llama.cpp's HTTP server
 * listens on port 8080 and exposes an OpenAI-compatible API under `/v1`.
 */
export const DEFAULT_LLAMA_CPP_URL: string = `http://${DEFAULT_LLAMA_CPP_HOST}:${DEFAULT_LLAMA_CPP_PORT}/v1`;

/**
 * Placeholder API key used when neither the caller nor the environment provides one.
 * llama.cpp's server typically runs unauthenticated, but the OpenAI SDK requires
 * a non-empty string. If `llama-server` is started with `--api-key`, set
 * `LLAMACPP_API_KEY` or pass the key to the constructor.
 */
const PLACEHOLDER_API_KEY = 'llama-cpp-no-auth';

/**
 * Resolve the base URL at construction time. Precedence:
 *   1. `LLAMACPP_BASE_URL` (full URL, wins if set)
 *   2. `LLAMACPP_HOST` + `LLAMACPP_PORT` (either can be overridden independently)
 *   3. hardcoded defaults (localhost:8080)
 */
function resolveBaseUrlFromEnv(): string {
    const explicit = process.env.LLAMACPP_BASE_URL;
    if (explicit && explicit.length > 0) {
        return explicit;
    }
    const host = process.env.LLAMACPP_HOST && process.env.LLAMACPP_HOST.length > 0
        ? process.env.LLAMACPP_HOST
        : DEFAULT_LLAMA_CPP_HOST;
    const port = process.env.LLAMACPP_PORT && process.env.LLAMACPP_PORT.length > 0
        ? process.env.LLAMACPP_PORT
        : DEFAULT_LLAMA_CPP_PORT;
    return `http://${host}:${port}/v1`;
}

/**
 * Resolve the API key at construction time. Precedence:
 *   1. explicit constructor argument
 *   2. `LLAMACPP_API_KEY` env var (for `llama-server --api-key` setups)
 *   3. placeholder (unauthenticated local server)
 */
function resolveApiKey(explicit?: string): string {
    if (explicit && explicit.length > 0) return explicit;
    const fromEnv = process.env.LLAMACPP_API_KEY;
    if (fromEnv && fromEnv.length > 0) return fromEnv;
    return PLACEHOLDER_API_KEY;
}

/**
 * llama.cpp implementation is just a sub-class of OpenAILLM that points at a
 * locally running `llama-server` instance. llama.cpp's HTTP server exposes an
 * OpenAI-compatible `/v1/chat/completions` endpoint, so all request/streaming
 * behaviour is inherited.
 *
 * The endpoint defaults to `http://localhost:8080/v1` but can be overridden
 * (in order of precedence):
 *   - constructor argument
 *   - `LLAMACPP_BASE_URL` env var (full URL)
 *   - `LLAMACPP_HOST` / `LLAMACPP_PORT` env vars (components)
 */
@RegisterClass(BaseLLM, 'LlamaCppLLM')
export class LlamaCppLLM extends OpenAILLM {
    constructor(apiKey?: string, baseUrl?: string) {
        const effectiveKey = resolveApiKey(apiKey);
        const effectiveUrl = baseUrl && baseUrl.length > 0 ? baseUrl : resolveBaseUrlFromEnv();
        super(effectiveKey, effectiveUrl);
    }
}
