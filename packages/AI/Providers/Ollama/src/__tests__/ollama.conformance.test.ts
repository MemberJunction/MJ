/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to OllamaLLM.
 *
 * Unlike OllamaLLM.test.ts (which mocks @memberjunction/ai to unit-test driver internals), this
 * file runs the REAL BaseLLM template method end-to-end and mocks ONLY the vendor seam: the
 * `ollama` module's client class. A module mock (rather than instance injection) is required here
 * because OllamaLLM constructs a NEW Ollama client per request whenever a cancellation token is
 * supplied (clientForRequest builds one whose fetch carries the caller's signal) — every
 * constructed client must share the same scriptable `chat` function.
 */
import { describe, it, expect, vi } from 'vitest';
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';
import {
    ExpectedUsageCounts,
    FailureSite,
    RunLLMConformanceSuite
} from '@memberjunction/unit-testing';

const mockChat = vi.hoisted(() => vi.fn());

vi.mock('ollama', () => ({
    Ollama: class MockOllama {
        chat = mockChat;
        constructor(_options?: Record<string, unknown>) {}
    },
    // The driver's import list also names these; they are type-only usages, but providing them
    // keeps the mock robust regardless of how the transformer treats the import statement.
    ChatRequest: class {},
    ChatResponse: class {},
    GenerateRequest: class {},
    GenerateResponse: class {},
    Message: class {}
}));

import { OllamaLLM } from '../models/ollama-llm';

/** The request subset the seam dispatches on. */
interface OllamaChatRequestPayload {
    model?: string;
    stream?: boolean;
}

/** Ollama non-streaming / final-chunk payload (the subset OllamaLLM consumes). */
interface OllamaChatResponsePayload {
    model?: string;
    message: { role: 'assistant'; content: string };
    done: boolean;
    prompt_eval_count?: number;
    eval_count?: number;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_duration?: number;
    eval_duration?: number;
}

function abortErrorLike(): Error {
    const error = new Error('This operation was aborted');
    error.name = 'AbortError';
    return error;
}

function contentChunk(model: string | undefined, content: string): OllamaChatResponsePayload {
    return { model, message: { role: 'assistant', content }, done: false };
}

function finalChunk(model: string | undefined, usage: ExpectedUsageCounts): OllamaChatResponsePayload {
    return {
        model,
        message: { role: 'assistant', content: '' },
        done: true,
        prompt_eval_count: usage.PromptTokens,
        eval_count: usage.CompletionTokens,
        total_duration: 42,
        load_duration: 1,
        prompt_eval_duration: 2,
        eval_duration: 3
    };
}

RunLLMConformanceSuite({
    ProviderName: 'Ollama',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'failedResult',
    CreateLLM: () => new OllamaLLM('conformance-test-key'),
    ScriptNonStreamingSuccess: (content: string, usage: ExpectedUsageCounts): void => {
        mockChat.mockImplementation(async (request: OllamaChatRequestPayload): Promise<OllamaChatResponsePayload> => {
            if (request.stream) {
                throw new Error('Ollama seam: non-streaming success scripted but a streaming call arrived');
            }
            return {
                model: request.model,
                message: { role: 'assistant', content },
                done: true,
                prompt_eval_count: usage.PromptTokens,
                eval_count: usage.CompletionTokens,
                total_duration: 42,
                load_duration: 1,
                prompt_eval_duration: 2,
                eval_duration: 3
            };
        });
    },
    ScriptStreamingSuccess: (chunks: string[], usage: ExpectedUsageCounts): void => {
        mockChat.mockImplementation(async (request: OllamaChatRequestPayload): Promise<AsyncGenerator<OllamaChatResponsePayload>> => {
            if (!request.stream) {
                throw new Error('Ollama seam: streaming success scripted but a non-streaming call arrived');
            }
            return (async function* (): AsyncGenerator<OllamaChatResponsePayload> {
                for (const chunk of chunks) {
                    yield contentChunk(request.model, chunk);
                }
                yield finalChunk(request.model, usage);
            })();
        });
    },
    ScriptFailure: (error: Error, at: FailureSite, options?: { ChunkBeforeError?: string }): void => {
        if (at === 'midStream') {
            const chunkBeforeError = options?.ChunkBeforeError;
            mockChat.mockImplementation(async (request: OllamaChatRequestPayload): Promise<AsyncGenerator<OllamaChatResponsePayload>> => {
                return (async function* (): AsyncGenerator<OllamaChatResponsePayload> {
                    if (chunkBeforeError) {
                        yield contentChunk(request.model, chunkBeforeError);
                    }
                    throw error;
                })();
            });
            return;
        }
        // 'nonStreaming' and 'streamStart' both fail the client call itself.
        mockChat.mockRejectedValue(error);
    },
    ScriptStreamingCancellation: (chunksBeforeAbort: string[], controller: AbortController): void => {
        mockChat.mockImplementation(async (request: OllamaChatRequestPayload): Promise<AsyncGenerator<OllamaChatResponsePayload>> => {
            return (async function* (): AsyncGenerator<OllamaChatResponsePayload> {
                for (const chunk of chunksBeforeAbort) {
                    yield contentChunk(request.model, chunk);
                }
                // The caller aborts while the stream is open; the aborted fetch then surfaces as
                // the DOM-standard AbortError from the stream iterator.
                controller.abort();
                throw abortErrorLike();
            })();
        });
    },
    KnownDeviations: [
        {
            Kind: 'FailedResultLacksErrorInfo',
            Reason:
                "OllamaLLM.nonStreamingChatCompletion's generic catch block builds the failed ChatResult " +
                'without calling ErrorAnalyzer.analyzeError (only its cancellation path populates errorInfo), ' +
                'so retry/failover layers get no structured classification for genuine Ollama failures.'
        }
    ]
});

describe('Ollama — fetch abort classification', () => {
    function namedError(name: string, message: string): Error {
        const error = new Error(message);
        error.name = name;
        return error;
    }

    function chatParams(signal?: AbortSignal): ChatParams {
        const params = new ChatParams();
        params.model = 'conformance-test-model';
        params.messages = [{ role: ChatMessageRole.user, content: 'hello' }];
        params.cancellationToken = signal;
        return params;
    }

    async function completeWith(error: Error, signal?: AbortSignal): Promise<ChatResult> {
        mockChat.mockRejectedValue(error);
        return new OllamaLLM('conformance-test-key').ChatCompletion(chatParams(signal));
    }

    it('reports an AbortError from fetch as Cancelled even before the signal reads aborted', async () => {
        const abortError = namedError('AbortError', 'The operation was aborted');

        const result = await completeWith(abortError, new AbortController().signal);

        expect(result.success).toBe(false);
        expect(result.statusText).toBe('cancelled');
        expect(result.exception).toBe(abortError);
        expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled' });
    });

    it('does not report a TimeoutError as a cancellation', async () => {
        const result = await completeWith(namedError('TimeoutError', 'The operation timed out'));

        expect(result.success).toBe(false);
        expect(result.statusText).toBe('Error');
        expect(result.errorInfo?.errorType).not.toBe('Cancelled');
    });
});
