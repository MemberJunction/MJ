/**
 * Shared BaseLLM streaming/ChatResult conformance suite applied to AzureLLM.
 *
 * Like azure.test.ts, this file uses the REAL @memberjunction/ai and module-mocks the Azure SDK
 * boundary: `@azure-rest/ai-inference`'s ModelClient factory (whose client AzureLLM builds inside
 * SetAdditionalSettings) plus the credential classes. The scripted `post` fake speaks Azure's
 * OpenAI-compatible wire shapes and honors `abortSignal` the way the Azure core pipeline does
 * (an already-aborted signal rejects with the DOM-standard AbortError instead of responding).
 */
import { vi } from 'vitest';
import {
    ExpectedUsageCounts,
    FailureSite,
    RunLLMConformanceSuite
} from '@memberjunction/unit-testing';

const mockPost = vi.hoisted(() => vi.fn());
const mockModelClient = vi.hoisted(() => vi.fn());

vi.mock('@azure-rest/ai-inference', () => ({
    default: mockModelClient
}));

vi.mock('@azure/core-auth', () => ({
    AzureKeyCredential: class MockAzureKeyCredential {
        constructor(public readonly key: string) {}
    }
}));

vi.mock('@azure/identity', () => ({
    DefaultAzureCredential: class MockDefaultAzureCredential {}
}));

import { AzureLLM } from '../models/azure';

/** The request the driver posts: body plus the Azure core-client abort option. */
interface AzurePostArgs {
    body: { model?: string; stream?: boolean };
    abortSignal?: AbortSignal;
}

/** Azure chat-completions chunk payload (the subset AzureLLM consumes). */
interface AzureChunkPayload {
    choices: Array<{
        delta: { content?: string };
        finish_reason: string | null;
        index: number;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
}

function abortErrorLike(): Error {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
}

function contentChunk(content: string): AzureChunkPayload {
    return { choices: [{ delta: { content }, finish_reason: null, index: 0 }] };
}

function finalChunk(usage: ExpectedUsageCounts): AzureChunkPayload {
    return {
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
        usage: { prompt_tokens: usage.PromptTokens, completion_tokens: usage.CompletionTokens }
    };
}

/** Wrap a scripted implementation so every scripted call honors abortSignal SDK-faithfully. */
function scriptPost(implementation: (args: AzurePostArgs) => Promise<{ body: unknown }>): void {
    mockPost.mockImplementation(async (args: AzurePostArgs): Promise<{ body: unknown }> => {
        if (args.abortSignal?.aborted) {
            throw abortErrorLike();
        }
        return implementation(args);
    });
}

RunLLMConformanceSuite({
    ProviderName: 'Azure',
    SupportsStreaming: true,
    NonStreamingFailureMode: 'failedResult',
    PreAbortedStreamingBehavior: 'rejectsErrorResult',
    CreateLLM: () => {
        // restoreMocks resets implementations between tests, so re-arm the client factory here.
        mockModelClient.mockReturnValue({
            path: () => ({ post: mockPost })
        });
        const llm = new AzureLLM('conformance-azure-key');
        llm.SetAdditionalSettings({ endpoint: 'https://conformance.example.com' });
        return llm;
    },
    ScriptNonStreamingSuccess: (content: string, usage: ExpectedUsageCounts): void => {
        scriptPost(async (args: AzurePostArgs) => {
            if (args.body.stream) {
                throw new Error('Azure seam: non-streaming success scripted but a streaming call arrived');
            }
            return {
                body: {
                    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }],
                    usage: { prompt_tokens: usage.PromptTokens, completion_tokens: usage.CompletionTokens }
                }
            };
        });
    },
    ScriptStreamingSuccess: (chunks: string[], usage: ExpectedUsageCounts): void => {
        scriptPost(async (args: AzurePostArgs) => {
            if (!args.body.stream) {
                throw new Error('Azure seam: streaming success scripted but a non-streaming call arrived');
            }
            return {
                body: (async function* (): AsyncGenerator<AzureChunkPayload> {
                    for (const chunk of chunks) {
                        yield contentChunk(chunk);
                    }
                    yield finalChunk(usage);
                })()
            };
        });
    },
    ScriptFailure: (error: Error, at: FailureSite, options?: { ChunkBeforeError?: string }): void => {
        if (at === 'midStream') {
            const chunkBeforeError = options?.ChunkBeforeError;
            scriptPost(async () => ({
                body: (async function* (): AsyncGenerator<AzureChunkPayload> {
                    if (chunkBeforeError) {
                        yield contentChunk(chunkBeforeError);
                    }
                    throw error;
                })()
            }));
            return;
        }
        // 'nonStreaming' and 'streamStart' both fail the POST itself.
        scriptPost(async () => {
            throw error;
        });
    },
    ScriptStreamingCancellation: (chunksBeforeAbort: string[], controller: AbortController): void => {
        scriptPost(async () => ({
            body: (async function* (): AsyncGenerator<AzureChunkPayload> {
                for (const chunk of chunksBeforeAbort) {
                    yield contentChunk(chunk);
                }
                // The caller aborts while the SSE stream is open; the pipeline surfaces AbortError.
                controller.abort();
                throw abortErrorLike();
            })()
        }));
    }
});
