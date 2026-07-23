import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLLM } from '../generic/baseLLM';
import { ChatParams, ChatResult, ChatResultData } from '../generic/chat.types';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';

// Concrete test implementation of BaseLLM
class TestLLM extends BaseLLM {
    public mockChatResult: ChatResult;

    constructor(apiKey: string = 'test-key') {
        super(apiKey);
        const start = new Date();
        const end = new Date();
        this.mockChatResult = new ChatResult(true, start, end);
        this.mockChatResult.data = {
            choices: [{ message: { role: 'assistant', content: 'test response' }, finish_reason: 'stop', index: 0 }],
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } as never
        };
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        return this.mockChatResult;
    }

    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<string>> {
        return {
            async *[Symbol.asyncIterator]() {
                yield 'chunk1';
                yield 'chunk2';
            }
        };
    }

    protected processStreamingChunk(chunk: string): { content: string; finishReason?: string; usage?: null } {
        return { content: chunk, finishReason: undefined, usage: null };
    }

    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: string | null | undefined,
        usage: Record<string, number> | null | undefined
    ): ChatResult {
        const result = new ChatResult(true, new Date(), new Date());
        result.data = {
            choices: [{ message: { role: 'assistant', content: accumulatedContent || '' }, finish_reason: 'stop', index: 0 }],
            usage: usage as never
        };
        return result;
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error('Not implemented');
    }

    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error('Not implemented');
    }
}

describe('BaseLLM', () => {
    let llm: TestLLM;

    beforeEach(() => {
        llm = new TestLLM();
    });

    describe('AdditionalSettings', () => {
        it('should start with empty additional settings', () => {
            expect(llm.AdditionalSettings).toEqual({});
        });

        it('should merge additional settings', () => {
            llm.SetAdditionalSettings({ key1: 'value1' });
            llm.SetAdditionalSettings({ key2: 'value2' });

            expect(llm.AdditionalSettings).toEqual({ key1: 'value1', key2: 'value2' });
        });

        it('should override existing settings with same key', () => {
            llm.SetAdditionalSettings({ key1: 'value1' });
            llm.SetAdditionalSettings({ key1: 'new-value' });

            expect(llm.AdditionalSettings.key1).toBe('new-value');
        });

        it('should clear all settings', () => {
            llm.SetAdditionalSettings({ key1: 'value1', key2: 'value2' });
            llm.ClearAdditionalSettings();

            expect(llm.AdditionalSettings).toEqual({});
        });
    });

    describe('SupportsStreaming', () => {
        it('should default to false', () => {
            expect(llm.SupportsStreaming).toBe(false);
        });
    });

    describe('ChatCompletion', () => {
        it('should complete a non-streaming chat request', async () => {
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            const result = await llm.ChatCompletion(params);

            expect(result.success).toBe(true);
            expect(result.data.choices[0].message.content).toBe('test response');
        });

        it('should default enableCaching to true', async () => {
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            await llm.ChatCompletion(params);

            expect(params.enableCaching).toBe(true);
        });

        it('should respect explicit enableCaching=false', async () => {
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];
            params.enableCaching = false;

            await llm.ChatCompletion(params);

            expect(params.enableCaching).toBe(false);
        });
    });

    describe('ChatCompletions (parallel)', () => {
        it('should return empty array for empty input', async () => {
            const results = await llm.ChatCompletions([]);

            expect(results).toEqual([]);
        });

        it('should return empty array for null input', async () => {
            const results = await llm.ChatCompletions(null as unknown as ChatParams[]);

            expect(results).toEqual([]);
        });

        it('should process multiple requests in parallel', async () => {
            const params1 = new ChatParams();
            params1.model = 'test-model';
            params1.messages = [{ role: 'user', content: 'Hello 1' }];

            const params2 = new ChatParams();
            params2.model = 'test-model';
            params2.messages = [{ role: 'user', content: 'Hello 2' }];

            const results = await llm.ChatCompletions([params1, params2]);

            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);
        });

        it('should call OnCompletion callback for each result', async () => {
            const onCompletion = vi.fn();
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            await llm.ChatCompletions([params], { OnCompletion: onCompletion });

            expect(onCompletion).toHaveBeenCalledTimes(1);
            expect(onCompletion).toHaveBeenCalledWith(expect.objectContaining({ success: true }), 0);
        });

        it('should call OnAllCompleted callback', async () => {
            const onAllCompleted = vi.fn();
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'Hello' }];

            await llm.ChatCompletions([params], { OnAllCompleted: onAllCompleted });

            expect(onAllCompleted).toHaveBeenCalledTimes(1);
            expect(onAllCompleted).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ success: true })]));
        });
    });

    describe('Thinking model support', () => {
        it('should default supportsThinkingModels to false', () => {
            // Access through casting since it's protected
            expect((llm as Record<string, unknown>)['supportsThinkingModels']()).toBe(false);
        });

        it('should return default thinking tag format', () => {
            const tags = (llm as Record<string, unknown>)['getThinkingTagFormat']() as { open: string; close: string };

            expect(tags.open).toBe('<think>');
            expect(tags.close).toBe('</think>');
        });

        it('should extract thinking content from non-streaming content', () => {
            const result = (llm as Record<string, unknown>)['extractThinkingFromContent'](
                '<think>My reasoning here</think>Actual response'
            ) as { content: string; thinking?: string };

            expect(result.thinking).toBe('My reasoning here');
            expect(result.content).toBe('Actual response');
        });

        it('should handle content without thinking tags', () => {
            const result = (llm as Record<string, unknown>)['extractThinkingFromContent'](
                'Just a normal response'
            ) as { content: string; thinking?: string };

            expect(result.thinking).toBeUndefined();
            expect(result.content).toBe('Just a normal response');
        });

        it('should handle null/empty content in extractThinkingFromContent', () => {
            const result = (llm as Record<string, unknown>)['extractThinkingFromContent'](
                ''
            ) as { content: string; thinking?: string };

            expect(result.content).toBe('');
            expect(result.thinking).toBeUndefined();
        });

        it('should add thinking to a message', () => {
            const message = { role: 'assistant' as const, content: 'response' };
            const result = (llm as Record<string, unknown>)['addThinkingToMessage'](
                message,
                'My thinking'
            ) as { role: string; content: string; thinking?: string };

            expect(result.thinking).toBe('My thinking');
        });
    });

    describe('Streaming thinking-tag boundary handling (bug A5)', () => {
        // Helper: feed a sequence of chunks through processStreamChunkWithThinking and
        // return the concatenated user-visible emission + the captured thinking.
        function stream(instance: TestLLM, chunks: string[]): { emitted: string; thinking: string } {
            const obj = instance as unknown as Record<string, (arg?: unknown) => unknown>;
            obj['initializeThinkingStreamState']();
            let emitted = '';
            for (const c of chunks) {
                emitted += obj['processStreamChunkWithThinking'](c) as string;
            }
            // Mirror the orchestrator's end-of-stream flush: any content held back waiting for more
            // chunks (a trailing partial-tag fragment that turned out to be real content) is emitted.
            emitted += obj['flushThinkingStreamRemainder']() as string;
            const state = (instance as unknown as { thinkingStreamState: { accumulatedThinking: string } }).thinkingStreamState;
            return { emitted, thinking: state.accumulatedThinking };
        }

        it('does not leak a partial open tag split across chunk boundaries', () => {
            // "<think>" arrives split as "Hello <thi" | "nk>reasoning</think> World"
            const { emitted, thinking } = stream(llm, ['Hello <thi', 'nk>reasoning</think> World']);
            expect(emitted).not.toContain('<thi');
            expect(emitted).not.toContain('<think');
            expect(emitted).toBe('Hello  World');
            expect(thinking).toBe('reasoning');
        });

        it('does not leak a partial close tag split across chunk boundaries', () => {
            // "</think>" arrives split as "...text</thi" | "nk>answer"
            const { emitted, thinking } = stream(llm, ['<think>reasoning</thi', 'nk>answer']);
            expect(emitted).toBe('answer');
            expect(thinking).toBe('reasoning');
        });

        it('emits normal content that merely contains a lone "<" without holding it forever', () => {
            const { emitted } = stream(llm, ['a < b and c ', '> d']);
            expect(emitted).toBe('a < b and c > d');
        });

        it('passes through content unchanged when there is no thinking block', () => {
            const { emitted, thinking } = stream(llm, ['plain ', 'streamed ', 'text']);
            expect(emitted).toBe('plain streamed text');
            expect(thinking).toBe('');
        });

        it('flushes a trailing partial open-tag fragment as real content at end of stream (bug A5 tail)', () => {
            // The stream ENDS on "answer <". Mid-stream the "<" is held back (it could begin "<think>"),
            // but with no further chunk it is real content and must be emitted — not silently dropped.
            const { emitted, thinking } = stream(llm, ['answer <']);
            expect(emitted).toBe('answer <');
            expect(thinking).toBe('');
        });

        it('flushes a longer trailing tag-prefix fragment split across chunks at end of stream', () => {
            // "<thi" spans the chunk boundary and never completes into "<think>" — it is the real tail.
            const { emitted } = stream(llm, ['done ', '<thi']);
            expect(emitted).toBe('done <thi');
        });

        it('does not surface an unterminated thinking block as visible content', () => {
            // An open "<think>" with no closing tag before the stream ends: the buffered text is
            // reasoning, so it stays as thinking and is NOT flushed to the user-visible output.
            const { emitted, thinking } = stream(llm, ['<think>still thinking']);
            expect(emitted).toBe('');
            expect(thinking).toBe('still thinking');
        });
    });

    describe('Streaming state reset (memory-leak fix R2-C5)', () => {
        // Subclass that tracks resetStreamingState calls + accumulates buffer
        // so we can assert the base orchestrator resets it on success AND error.
        class StateTrackingLLM extends TestLLM {
            public resetCallCount = 0;
            public bufferAtFinalize: string | null = null;
            public buffer = '';
            public throwOnStream = false;

            public override get SupportsStreaming(): boolean {
                return true;
            }

            constructor() {
                super('test-key');
            }

            protected resetStreamingState(): void {
                this.resetCallCount++;
                this.buffer = '';
            }

            protected processStreamingChunk(chunk: string): { content: string } {
                this.buffer += chunk;
                return { content: chunk };
            }

            protected async createStreamingRequest(): Promise<AsyncIterable<string>> {
                if (this.throwOnStream) {
                    throw new Error('boom');
                }
                const self = this;
                return {
                    async *[Symbol.asyncIterator]() {
                        yield 'a';
                        yield 'b';
                    }
                };
            }

            protected finalizeStreamingResponse(
                accumulatedContent: string | null | undefined,
                _lastChunk: string | null | undefined,
                _usage: Record<string, number> | null | undefined
            ): ChatResult {
                // Capture the accumulated buffer BEFORE the finally clears it.
                this.bufferAtFinalize = this.buffer;
                const r = new ChatResult(true, new Date(), new Date());
                r.data = {
                    choices: [{ message: { role: 'assistant', content: accumulatedContent || '' }, finish_reason: 'stop', index: 0 }],
                    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as never
                };
                return r;
            }
        }

        it('resets state at start AND in finally on success', async () => {
            const trackingLlm = new StateTrackingLLM();
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'hi' }];
            params.streaming = true;
            params.streamingCallbacks = { OnContent: () => {} };

            await trackingLlm.ChatCompletion(params);

            // Two resets: one at the start, one in finally.
            expect(trackingLlm.resetCallCount).toBe(2);
            // finalizeStreamingResponse saw the accumulated buffer before the reset.
            expect(trackingLlm.bufferAtFinalize).toBe('ab');
            // After the request, the buffer is cleared.
            expect(trackingLlm.buffer).toBe('');
        });

        it('resets state in finally even when the stream throws', async () => {
            const trackingLlm = new StateTrackingLLM();
            trackingLlm.throwOnStream = true;
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'hi' }];
            params.streaming = true;
            params.streamingCallbacks = { OnContent: () => {}, OnError: () => {} };

            // handleStreamingChatCompletion rejects with a ChatResult on stream errors.
            const result = await trackingLlm.ChatCompletion(params).catch((r: ChatResult) => r);

            expect(result.success).toBe(false);
            // Reset called both at start (before throw) and in finally.
            expect(trackingLlm.resetCallCount).toBe(2);
            expect(trackingLlm.buffer).toBe('');
        });

        it('does NOT bleed state across consecutive requests on the same instance', async () => {
            const trackingLlm = new StateTrackingLLM();
            const params = new ChatParams();
            params.model = 'test-model';
            params.messages = [{ role: 'user', content: 'hi' }];
            params.streaming = true;
            params.streamingCallbacks = { OnContent: () => {} };

            await trackingLlm.ChatCompletion(params);
            const bufferAfterFirst = trackingLlm.buffer;
            await trackingLlm.ChatCompletion(params);

            // Buffer was cleared between requests by the finally block.
            expect(bufferAfterFirst).toBe('');
            expect(trackingLlm.buffer).toBe('');
            // 4 total resets across 2 requests (start + finally each).
            expect(trackingLlm.resetCallCount).toBe(4);
        });

        it('default base-class resetStreamingState is a no-op', () => {
            // Calling reset on a vanilla TestLLM doesn't throw and has no observable effect.
            expect(() => (llm as unknown as { resetStreamingState(): void }).resetStreamingState()).not.toThrow();
        });
    });
});
