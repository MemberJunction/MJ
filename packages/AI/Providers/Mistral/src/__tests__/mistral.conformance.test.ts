/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to MistralLLM.
 *
 * Unlike mistral.test.ts (which mocks @memberjunction/ai to unit-test driver internals), this
 * file runs the REAL BaseLLM template method end-to-end and mocks ONLY the vendor seam: the
 * Mistral SDK client is replaced with a scriptable fake at the exact surface the driver calls
 * (`client.chat.complete(params, { signal })` / `client.chat.stream(params, { signal })`),
 * speaking Mistral's camelCase wire shapes (`finishReason`, `usage.promptTokens`, chunks nested
 * under `chunk.data`). Cancellation is surfaced with the SDK's own error name
 * ('RequestAbortedError'), which isMistralCancellationError recognizes.
 */
import {
    ExpectedUsageCounts,
    FailureSite,
    RunLLMConformanceSuite
} from '@memberjunction/ai/dist/test-support/llm-conformance.js';
import { MistralLLM } from '../models/mistral';

/** Mistral non-streaming completion payload (the subset MistralLLM consumes). */
interface MistralResponsePayload {
    id: string;
    object: string;
    model: string;
    created: number;
    choices: Array<{
        message: { content: string };
        finishReason: string;
        index: number;
    }>;
    usage: { promptTokens: number; completionTokens: number };
}

/** Mistral streaming CompletionEvent payload (the subset MistralLLM consumes). */
interface MistralChunkPayload {
    data: {
        choices: Array<{
            delta: { content?: string };
            finishReason: string | null;
            index: number;
        }>;
        usage?: { promptTokens: number; completionTokens: number };
    };
}

interface MistralRequestOptions {
    signal?: AbortSignal;
}

/** The client surface MistralLLM calls. */
interface MistralSeamClient {
    chat: {
        complete: (params: Record<string, unknown>, options?: MistralRequestOptions) => Promise<MistralResponsePayload>;
        stream: (params: Record<string, unknown>, options?: MistralRequestOptions) => Promise<AsyncGenerator<MistralChunkPayload>>;
    };
}

type ScriptedBehavior =
    | { Kind: 'nonStreamingSuccess'; Content: string; Usage: ExpectedUsageCounts }
    | { Kind: 'streamingSuccess'; Chunks: string[]; Usage: ExpectedUsageCounts }
    | { Kind: 'failure'; Error: Error; At: FailureSite; ChunkBeforeError?: string }
    | { Kind: 'streamingCancellation'; Chunks: string[]; Controller: AbortController };

let behavior: ScriptedBehavior | null = null;

/** The abort error shape the Mistral SDK normalizes a fired AbortSignal into. */
function requestAbortedError(): Error {
    const error = new Error('Request aborted.');
    error.name = 'RequestAbortedError';
    return error;
}

function contentChunk(content: string): MistralChunkPayload {
    return { data: { choices: [{ delta: { content }, finishReason: null, index: 0 }] } };
}

function finalChunk(usage: ExpectedUsageCounts): MistralChunkPayload {
    return {
        data: {
            choices: [{ delta: {}, finishReason: 'stop', index: 0 }],
            usage: { promptTokens: usage.PromptTokens, completionTokens: usage.CompletionTokens }
        }
    };
}

async function* streamFor(current: ScriptedBehavior): AsyncGenerator<MistralChunkPayload> {
    switch (current.Kind) {
        case 'streamingSuccess':
            for (const chunk of current.Chunks) {
                yield contentChunk(chunk);
            }
            yield finalChunk(current.Usage);
            return;
        case 'streamingCancellation':
            for (const chunk of current.Chunks) {
                yield contentChunk(chunk);
            }
            current.Controller.abort();
            throw requestAbortedError();
        case 'failure':
            if (current.ChunkBeforeError) {
                yield contentChunk(current.ChunkBeforeError);
            }
            throw current.Error;
        default:
            throw new Error(`Mistral seam: '${current.Kind}' scripted but a stream was requested`);
    }
}

const seamClient: MistralSeamClient = {
    chat: {
        complete: async (_params: Record<string, unknown>, options?: MistralRequestOptions): Promise<MistralResponsePayload> => {
            // SDK-faithful: an already-aborted signal never dials out.
            if (options?.signal?.aborted) {
                throw requestAbortedError();
            }
            if (!behavior) {
                throw new Error('Mistral seam: no behavior scripted');
            }
            if (behavior.Kind === 'failure' && behavior.At === 'nonStreaming') {
                throw behavior.Error;
            }
            if (behavior.Kind !== 'nonStreamingSuccess') {
                throw new Error(`Mistral seam: '${behavior.Kind}' scripted but a non-streaming call arrived`);
            }
            return {
                id: 'mistral-conformance',
                object: 'chat.completion',
                model: 'conformance-test-model',
                created: 0,
                choices: [{ message: { content: behavior.Content }, finishReason: 'stop', index: 0 }],
                usage: { promptTokens: behavior.Usage.PromptTokens, completionTokens: behavior.Usage.CompletionTokens }
            };
        },
        stream: async (_params: Record<string, unknown>, options?: MistralRequestOptions): Promise<AsyncGenerator<MistralChunkPayload>> => {
            if (options?.signal?.aborted) {
                throw requestAbortedError();
            }
            if (!behavior) {
                throw new Error('Mistral seam: no behavior scripted');
            }
            if (behavior.Kind === 'failure' && behavior.At === 'streamStart') {
                throw behavior.Error;
            }
            return streamFor(behavior);
        }
    }
};

RunLLMConformanceSuite({
    ProviderName: 'Mistral',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'throws',
    PreAbortedStreamingBehavior: 'rejectsErrorResult',
    CreateLLM: () => {
        const llm = new MistralLLM('conformance-test-key');
        // Swap the private SDK client for the scriptable seam (same boundary the SDK owns).
        (llm as unknown as { _client: MistralSeamClient })._client = seamClient;
        return llm;
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
});
