/**
 * @fileoverview Scriptable OpenAI-compatible chat-completions seam mock for the LLM conformance
 * suite ({@link RunLLMConformanceSuite} in ./llm-conformance).
 *
 * Several MJ providers speak the OpenAI wire shape at the exact same seam —
 * `client.chat.completions.create(body, { signal })` — either through the `openai` SDK itself
 * (OpenAILLM and its subclasses MiniMax, Zhipu, OpenRouter, ...) or through OpenAI-compatible
 * SDKs with the same surface (`groq-sdk`, `@cerebras/cerebras_cloud_sdk`). This factory builds a
 * purely structural fake of that seam (no dependency on any vendor SDK) whose `Script*` functions
 * plug straight into the conformance-suite config.
 *
 * A provider test file injects `Client` in place of the driver's private SDK client:
 * ```ts
 * const seam = CreateOpenAICompatibleSeamMock();
 * const llm = new MiniMaxLLM('test-key');
 * (llm as unknown as { _openAI: OpenAICompatibleChatClient })._openAI = seam.Client;
 * ```
 *
 * SDK-faithful behaviors this fake reproduces:
 *  - A call whose request options carry an ALREADY-aborted `AbortSignal` fails with an
 *    `AbortError`-named error instead of responding (the stainless SDKs check the signal before
 *    dialing; the DOM-standard name keeps every driver's `error.name === 'AbortError'` fallback
 *    working without importing any vendor error class).
 *  - Streaming responses are async iterables of `chat.completion.chunk`-shaped objects; the final
 *    chunk carries `finish_reason: 'stop'` plus usage (both at `chunk.usage`, OpenAI-style, and at
 *    `chunk.x_groq.usage`, Groq's native placement — so a driver that drops stream usage is
 *    provably dropping data the vendor sent).
 *
 * Exported from `@memberjunction/unit-testing` alongside ./llm-conformance — see that file's
 * header. Test-code only; never import from runtime code.
 */
import { ExpectedUsageCounts, FailureSite } from './llm-conformance';

/** OpenAI-wire usage payload. */
export interface OpenAICompatibleUsagePayload {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

/** OpenAI-wire non-streaming completion payload (the subset MJ drivers consume). */
export interface OpenAICompatibleResponsePayload {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        message: { role: 'assistant'; content: string };
        finish_reason: string;
        index: number;
    }>;
    usage: OpenAICompatibleUsagePayload;
}

/** OpenAI-wire streaming chunk payload (the subset MJ drivers consume). */
export interface OpenAICompatibleChunkPayload {
    id: string;
    object: 'chat.completion.chunk';
    model: string;
    choices: Array<{
        delta: { content?: string };
        finish_reason: string | null;
        index: number;
    }>;
    usage?: OpenAICompatibleUsagePayload;
    x_groq?: { usage: OpenAICompatibleUsagePayload };
}

/** The request body subset the seam dispatches on. */
export interface OpenAICompatibleRequestBody {
    model?: string;
    stream?: boolean;
}

/** Per-call request options (the stainless SDKs' second argument). */
export interface OpenAICompatibleRequestOptions {
    signal?: AbortSignal;
}

/** The client surface MJ drivers call: `client.chat.completions.create(body, options)`. */
export interface OpenAICompatibleChatClient {
    chat: {
        completions: {
            create: (
                body: OpenAICompatibleRequestBody,
                options?: OpenAICompatibleRequestOptions
            ) => Promise<OpenAICompatibleResponsePayload | AsyncGenerator<OpenAICompatibleChunkPayload>>;
        };
    };
}

/** The scriptable seam handed to a provider conformance test file. */
export interface OpenAICompatibleSeam {
    /** Inject this in place of the driver's private SDK client. */
    Client: OpenAICompatibleChatClient;
    /** Conformance-config hook: next non-streaming call succeeds. */
    ScriptNonStreamingSuccess: (content: string, usage: ExpectedUsageCounts) => void;
    /** Conformance-config hook: next streaming call emits these chunks then completes. */
    ScriptStreamingSuccess: (chunks: string[], usage: ExpectedUsageCounts) => void;
    /** Conformance-config hook: next call fails at the given site. */
    ScriptFailure: (error: Error, at: FailureSite, options?: { ChunkBeforeError?: string }) => void;
    /** Conformance-config hook: next streaming call emits chunks, aborts the controller, then dies like an aborted SDK stream. */
    ScriptStreamingCancellation: (chunksBeforeAbort: string[], controller: AbortController) => void;
}

type ScriptedBehavior =
    | { Kind: 'nonStreamingSuccess'; Content: string; Usage: ExpectedUsageCounts }
    | { Kind: 'streamingSuccess'; Chunks: string[]; Usage: ExpectedUsageCounts }
    | { Kind: 'failure'; Error: Error; At: FailureSite; ChunkBeforeError?: string }
    | { Kind: 'streamingCancellation'; Chunks: string[]; Controller: AbortController };

function abortErrorLike(): Error {
    const error = new Error('Request was aborted.');
    error.name = 'AbortError';
    return error;
}

function usagePayload(usage: ExpectedUsageCounts): OpenAICompatibleUsagePayload {
    return {
        prompt_tokens: usage.PromptTokens,
        completion_tokens: usage.CompletionTokens,
        total_tokens: usage.PromptTokens + usage.CompletionTokens
    };
}

function contentChunk(model: string, content: string): OpenAICompatibleChunkPayload {
    return {
        id: 'chatcmpl-conformance',
        object: 'chat.completion.chunk',
        model,
        choices: [{ delta: { content }, finish_reason: null, index: 0 }]
    };
}

function finalChunk(model: string, usage: ExpectedUsageCounts): OpenAICompatibleChunkPayload {
    return {
        id: 'chatcmpl-conformance',
        object: 'chat.completion.chunk',
        model,
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        usage: usagePayload(usage),
        x_groq: { usage: usagePayload(usage) }
    };
}

/**
 * Build a fresh scriptable OpenAI-compatible seam. One seam instance can be shared across the
 * whole conformance run — each `Script*` call replaces the pending behavior, and the conformance
 * suite scripts before every request.
 */
export function CreateOpenAICompatibleSeamMock(): OpenAICompatibleSeam {
    let behavior: ScriptedBehavior | null = null;

    async function* streamOfChunks(model: string, chunks: string[], usage: ExpectedUsageCounts): AsyncGenerator<OpenAICompatibleChunkPayload> {
        for (const chunk of chunks) {
            yield contentChunk(model, chunk);
        }
        yield finalChunk(model, usage);
    }

    async function* streamFailingMidway(model: string, error: Error, chunkBeforeError?: string): AsyncGenerator<OpenAICompatibleChunkPayload> {
        if (chunkBeforeError) {
            yield contentChunk(model, chunkBeforeError);
        }
        throw error;
    }

    async function* streamAbortedMidway(model: string, chunks: string[], controller: AbortController): AsyncGenerator<OpenAICompatibleChunkPayload> {
        for (const chunk of chunks) {
            yield contentChunk(model, chunk);
        }
        // The caller (or a timeout layer) aborts while the stream is still open; the SDK then
        // surfaces the abort as an error from the stream iterator.
        controller.abort();
        throw abortErrorLike();
    }

    const create = async (
        body: OpenAICompatibleRequestBody,
        options?: OpenAICompatibleRequestOptions
    ): Promise<OpenAICompatibleResponsePayload | AsyncGenerator<OpenAICompatibleChunkPayload>> => {
        // SDK-faithful: an already-aborted signal never dials out.
        if (options?.signal?.aborted) {
            throw abortErrorLike();
        }
        if (!behavior) {
            throw new Error('OpenAI-compatible seam: no behavior scripted — call a Script* function first');
        }
        const model = body.model ?? 'conformance-test-model';

        if (body.stream === true) {
            switch (behavior.Kind) {
                case 'streamingSuccess':
                    return streamOfChunks(model, behavior.Chunks, behavior.Usage);
                case 'streamingCancellation':
                    return streamAbortedMidway(model, behavior.Chunks, behavior.Controller);
                case 'failure':
                    if (behavior.At === 'streamStart') {
                        throw behavior.Error;
                    }
                    if (behavior.At === 'midStream') {
                        return streamFailingMidway(model, behavior.Error, behavior.ChunkBeforeError);
                    }
                    throw new Error(`OpenAI-compatible seam: failure scripted at '${behavior.At}' but a streaming call arrived`);
                default:
                    throw new Error(`OpenAI-compatible seam: '${behavior.Kind}' scripted but a streaming call arrived`);
            }
        }

        switch (behavior.Kind) {
            case 'nonStreamingSuccess':
                return {
                    id: 'chatcmpl-conformance',
                    object: 'chat.completion',
                    created: 0,
                    model,
                    choices: [
                        {
                            message: { role: 'assistant', content: behavior.Content },
                            finish_reason: 'stop',
                            index: 0
                        }
                    ],
                    usage: usagePayload(behavior.Usage)
                };
            case 'failure':
                if (behavior.At === 'nonStreaming') {
                    throw behavior.Error;
                }
                throw new Error(`OpenAI-compatible seam: failure scripted at '${behavior.At}' but a non-streaming call arrived`);
            default:
                throw new Error(`OpenAI-compatible seam: '${behavior.Kind}' scripted but a non-streaming call arrived`);
        }
    };

    return {
        Client: {
            chat: {
                completions: { create }
            }
        },
        ScriptNonStreamingSuccess: (content: string, usage: ExpectedUsageCounts): void => {
            behavior = { Kind: 'nonStreamingSuccess', Content: content, Usage: usage };
        },
        ScriptStreamingSuccess: (chunks: string[], usage: ExpectedUsageCounts): void => {
            behavior = { Kind: 'streamingSuccess', Chunks: chunks, Usage: usage };
        },
        ScriptFailure: (error: Error, at: FailureSite, options?: { ChunkBeforeError?: string }): void => {
            behavior = { Kind: 'failure', Error: error, At: at, ChunkBeforeError: options?.ChunkBeforeError };
        },
        ScriptStreamingCancellation: (chunksBeforeAbort: string[], controller: AbortController): void => {
            behavior = { Kind: 'streamingCancellation', Chunks: chunksBeforeAbort, Controller: controller };
        }
    };
}
