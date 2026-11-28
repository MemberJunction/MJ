import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actualChatTypes from '../../../../Core/src/generic/chat.types';
import { ThinkingStreamExtractor } from '../../../../Core/src/generic/thinkingStreamExtractor';

// Hoisted mock variables
const mockComplete = vi.hoisted(() => vi.fn());
const mockStream = vi.hoisted(() => vi.fn());
const mockCustomFetch = vi.hoisted(
    () => vi.fn<() => ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined>(() => undefined)
);
const MockMistral = vi.hoisted(() => vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.chat = {
        complete: mockComplete,
        stream: mockStream
    };
}));

// Mock the Mistral SDK
vi.mock('@mistralai/mistralai', () => ({
    Mistral: MockMistral,
    HTTPClient: class MockHTTPClient {
        public options: unknown;
        constructor(options?: unknown) {
            this.options = options;
        }
    },
}));

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
    ToJSONSafe: (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v)))
}));

// Mock @memberjunction/ai
vi.mock('@memberjunction/ai', () => {
    class BaseModel {
        protected _apiKey: string;
        protected _additionalSettings: Record<string, unknown> = {};
        constructor(apiKey: string) {
            this._apiKey = apiKey;
        }
        protected get CustomFetch() {
            return mockCustomFetch();
        }
        protected BuildTransportClientOptions() {
            const customFetch = this.CustomFetch;
            return customFetch ? { fetch: customFetch } : {};
        }
    }
    class BaseLLM extends BaseModel {
        protected _thinkingExtractor: ThinkingStreamExtractor | null = null;
        public get SupportsStreaming(): boolean { return false; }
        protected getThinkingTagFormat(): { open: string; close: string } {
            return { open: '<think>', close: '</think>' };
        }
        protected CreateThinkingStreamExtractor(tags?: { open: string; close: string }): ThinkingStreamExtractor {
            return new ThinkingStreamExtractor(tags ?? this.getThinkingTagFormat());
        }
        protected get thinkingStreamState() {
            if (!this._thinkingExtractor) return null;
            return {
                accumulatedThinking: this._thinkingExtractor.AccumulatedThinking,
                inThinkingBlock: this._thinkingExtractor.InThinkingBlock,
                pendingContent: this._thinkingExtractor.PendingContent,
                thinkingComplete: this._thinkingExtractor.ThinkingComplete,
            };
        }
        protected initializeThinkingStreamState(): void {
            this._thinkingExtractor = this.CreateThinkingStreamExtractor();
        }
        protected resetThinkingStreamState(): void {
            this._thinkingExtractor?.Reset();
            this._thinkingExtractor = null;
        }
        protected resetStreamingState(): void {
            this.resetThinkingStreamState();
        }
        protected processStreamChunkWithThinking(rawContent: string): string {
            return this._thinkingExtractor ? this._thinkingExtractor.ProcessChunk(rawContent).contentDelta : rawContent;
        }
        protected extractThinkingFromContent(content: string): { content: string; thinking: string | undefined } {
            const trimmed = content.trim();
            if (trimmed.startsWith('<think>') && trimmed.includes('</think>')) {
                const thinkEnd = trimmed.indexOf('</think>');
                return {
                    thinking: trimmed.substring('<think>'.length, thinkEnd).trim(),
                    content: trimmed.substring(thinkEnd + '</think>'.length).trim()
                };
            }
            return { content: trimmed, thinking: undefined };
        }
    }
    class ModelUsage {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        constructor(promptTokens: number, completionTokens: number) {
            this.promptTokens = promptTokens;
            this.completionTokens = completionTokens;
            this.totalTokens = promptTokens + completionTokens;
        }
    }
    class ChatResult {
        success: boolean;
        startTime: Date;
        endTime: Date;
        data: unknown;
        statusText: string | null = null;
        errorMessage: string | null = null;
        exception: unknown = null;
        modelSpecificResponseDetails: unknown = null;
        constructor(success: boolean, startTime: Date, endTime: Date) {
            this.success = success;
            this.startTime = startTime;
            this.endTime = endTime;
        }
    }
    const ChatMessageRole = {
        system: 'system' as const,
        user: 'user' as const,
        assistant: 'assistant' as const
    };
    class ChatParams {
        messages: Array<{ role: string; content: unknown }> = [];
        streaming?: boolean = false;
        effortLevel?: string;
        model: string = '';
    }
    return {
        BaseLLM,
        ModelUsage,
        ChatResult,
        ChatMessageRole,
        ChatParams,
        ChatResultChoice: {} as unknown,
        ChatMessage: {} as unknown,
        SummarizeParams: ChatParams,
        SummarizeResult: class {},
        ClassifyParams: ChatParams,
        ClassifyResult: class {},
        ErrorAnalyzer: { analyzeError: vi.fn() },
        NormalizeFinishReason: actualChatTypes.NormalizeFinishReason
    };
});

import { MistralLLM } from '../models/mistral';
import { ChatMessageRole } from '@memberjunction/ai';

describe('MistralLLM', () => {
    let instance: MistralLLM;

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new MistralLLM('test-api-key');
    });

    describe('Constructor', () => {
        it('should create an instance with an apiKey', () => {
            expect(instance).toBeInstanceOf(MistralLLM);
            expect(MockMistral).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
        });

        it('should expose the Mistral client via getter', () => {
            expect(instance.Client).toBeDefined();
            expect(instance.Client.chat).toBeDefined();
        });

        it('should forward BaseModel.CustomFetch via HTTPClient when configured (R2-9)', () => {
            const scopedFetch = vi.fn<() => Promise<Response>>();
            mockCustomFetch.mockReturnValueOnce(scopedFetch);
            MockMistral.mockClear();

            new MistralLLM('scoped-key');
            expect(MockMistral).toHaveBeenCalledTimes(1);
            const opts = MockMistral.mock.calls[0][0] as { apiKey: string; httpClient?: unknown };
            expect(opts.apiKey).toBe('scoped-key');
            expect(opts.httpClient).toBeDefined();
        });
    });

    describe('SupportsStreaming', () => {
        it('should return true', () => {
            expect(instance.SupportsStreaming).toBe(true);
        });
    });

    describe('resetStreamingState', () => {
        it('should reset ThinkingStreamExtractor state cleanly', () => {
            const initMethod = (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState'].bind(instance);
            const processChunk = (instance as ReturnType<typeof Object.create>)['processStreamingChunk'].bind(instance);
            const resetMethod = (instance as ReturnType<typeof Object.create>)['resetStreamingState'].bind(instance);
            const getState = () => (instance as ReturnType<typeof Object.create>)['thinkingStreamState'];

            initMethod();
            processChunk({ data: { choices: [{ delta: { content: '<think>deep thoughts' } }] } });
            expect(getState().accumulatedThinking).toBe('deep thoughts');
            expect(getState().inThinkingBlock).toBe(true);

            resetMethod();
            expect(getState()).toBeNull();
        });
    });

    describe('Thinking extraction from <think> tags', () => {
        // Test the inline thinking extraction logic used in nonStreamingChatCompletion
        it('should extract thinking content from <think> tags', () => {
            const rawContent = '<think>Let me reason about this carefully</think>Here is the actual answer';
            let content = rawContent.trim();
            let thinkingContent: string | undefined = undefined;

            if (content.startsWith('<think>') && content.includes('</think>')) {
                const thinkStart = content.indexOf('<think>') + '<think>'.length;
                const thinkEnd = content.indexOf('</think>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                content = content.substring(thinkEnd + '</think>'.length).trim();
            }

            expect(thinkingContent).toBe('Let me reason about this carefully');
            expect(content).toBe('Here is the actual answer');
        });

        it('should handle content without thinking tags', () => {
            const rawContent = 'Just a plain response with no thinking';
            let content = rawContent.trim();
            let thinkingContent: string | undefined = undefined;

            if (content.startsWith('<think>') && content.includes('</think>')) {
                const thinkStart = content.indexOf('<think>') + '<think>'.length;
                const thinkEnd = content.indexOf('</think>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                content = content.substring(thinkEnd + '</think>'.length).trim();
            }

            expect(thinkingContent).toBeUndefined();
            expect(content).toBe('Just a plain response with no thinking');
        });

        it('should handle empty thinking tags', () => {
            const rawContent = '<think></think>The response';
            let content = rawContent.trim();
            let thinkingContent: string | undefined = undefined;

            if (content.startsWith('<think>') && content.includes('</think>')) {
                const thinkStart = content.indexOf('<think>') + '<think>'.length;
                const thinkEnd = content.indexOf('</think>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                content = content.substring(thinkEnd + '</think>'.length).trim();
            }

            expect(thinkingContent).toBe('');
            expect(content).toBe('The response');
        });
    });

    describe('streaming thinking extraction via BaseLLM ThinkingStreamExtractor', () => {
        const callChunk = (rawText: string): string => {
            const res = (instance as ReturnType<typeof Object.create>)['processStreamingChunk']({
                data: { choices: [{ delta: { content: rawText } }] }
            });
            return res.content;
        };
        const getState = () => (instance as ReturnType<typeof Object.create>)['thinkingStreamState'];
        const initState = () => (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();

        it('should pass through content when thinking is already complete', () => {
            initState();
            callChunk('<think>plan</think>');
            const result = callChunk('Hello world');
            expect(result).toBe('Hello world');
            expect(getState().thinkingComplete).toBe(true);
        });

        it('should detect and enter thinking block', () => {
            initState();
            const result = callChunk('<think>starting to think');
            expect(result).toBe('');
            expect(getState().inThinkingBlock).toBe(true);
            expect(getState().accumulatedThinking).toBe('starting to think');
        });

        it('should accumulate thinking and extract content after close tag', () => {
            initState();
            callChunk('<think>more thinking');
            const result = callChunk('</think>actual output');
            expect(result).toBe('actual output');
            expect(getState().accumulatedThinking).toBe('more thinking');
            expect(getState().thinkingComplete).toBe(true);
            expect(getState().inThinkingBlock).toBe(false);
        });

        it('should continue accumulating when still in thinking block with no close tag', () => {
            initState();
            callChunk('<think>');
            const result = callChunk('still thinking about it');
            expect(result).toBe('');
            expect(getState().accumulatedThinking).toBe('still thinking about it');
        });

        it('should output regular content when no thinking tags found', () => {
            initState();
            const result = callChunk('regular content here');
            expect(result).toBe('regular content here');
            expect(getState().pendingContent).toBe('');
        });

        it('should hold back content that might be a partial tag', () => {
            initState();
            const result = callChunk('some content<');
            expect(result).toBe('some content');
            expect(getState().pendingContent).toBe('<');
        });

        it('should hold back partial <thin tag', () => {
            initState();
            const result = callChunk('hello<thin');
            expect(result).toBe('hello');
            expect(getState().pendingContent).toBe('<thin');
        });
    });

    describe('MapMJMessagesToMistral', () => {
        const callMethod = (messages: Array<{ role: string; content: unknown }>, prefill?: string): unknown[] => {
            return (instance as ReturnType<typeof Object.create>)['MapMJMessagesToMistral'](messages, prefill);
        };

        it('should convert simple string messages', () => {
            const messages = [
                { role: 'system', content: 'You are helpful' },
                { role: 'user', content: 'Hello' }
            ];
            const result = callMethod(messages);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ role: 'system', content: 'You are helpful' });
            expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
        });

        it('should append a user message if last message is not a user message', () => {
            const messages = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ];
            const result = callMethod(messages) as Array<{ role: string; content: string }>;
            expect(result).toHaveLength(3);
            expect(result[2]).toEqual({ role: 'user', content: 'ok' });
        });

        it('should not append a user message if last message is a user message', () => {
            const messages = [
                { role: 'system', content: 'Be helpful' },
                { role: 'user', content: 'What is 1+1?' }
            ];
            const result = callMethod(messages);
            expect(result).toHaveLength(2);
        });

        it('should convert multimodal content blocks', () => {
            const messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', content: 'Describe this' },
                        { type: 'image_url', content: 'https://example.com/img.png' }
                    ]
                }
            ];
            const result = callMethod(messages) as Array<{ role: string; content: unknown }>;
            expect(result).toHaveLength(1);
            const content = result[0].content as Array<{ type: string; content: string }>;
            expect(content).toHaveLength(2);
        });

        it('should handle empty message array', () => {
            const result = callMethod([]);
            expect(result).toHaveLength(0);
        });

        describe('assistantPrefill', () => {
            it('should append an assistant message with prefix: true when prefill is provided', () => {
                const messages = [
                    { role: 'system', content: 'You are helpful' },
                    { role: 'user', content: 'Write JSON' }
                ];
                const result = callMethod(messages, '{"result":') as Array<Record<string, unknown>>;
                expect(result).toHaveLength(3);
                expect(result[2]).toEqual({
                    role: 'assistant',
                    content: '{"result":',
                    prefix: true
                });
            });

            it('should NOT append the dummy "ok" user message when prefill is provided', () => {
                const messages = [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' }
                ];
                const result = callMethod(messages, 'Sure, here is') as Array<Record<string, unknown>>;
                // Should have original 2 messages + 1 prefill assistant message, but NOT an extra 'ok' user message
                expect(result).toHaveLength(3);
                expect(result[2]).toEqual({
                    role: 'assistant',
                    content: 'Sure, here is',
                    prefix: true
                });
                // Verify no 'ok' user message was inserted
                const userOkMessages = result.filter(m => m.role === 'user' && m.content === 'ok');
                expect(userOkMessages).toHaveLength(0);
            });

            it('should still append dummy "ok" user message when prefill is NOT provided and last message is assistant', () => {
                const messages = [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi!' }
                ];
                const result = callMethod(messages) as Array<Record<string, unknown>>;
                expect(result).toHaveLength(3);
                expect(result[2]).toEqual({ role: 'user', content: 'ok' });
            });

            it('should still append dummy "ok" user message when prefill is undefined and last message is assistant', () => {
                const messages = [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi!' }
                ];
                const result = callMethod(messages, undefined) as Array<Record<string, unknown>>;
                expect(result).toHaveLength(3);
                expect(result[2]).toEqual({ role: 'user', content: 'ok' });
            });

            it('should not append dummy "ok" when prefill is empty string (falsy)', () => {
                const messages = [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi!' }
                ];
                // Empty string is falsy, so prefill branch should NOT activate; dummy 'ok' should be appended
                const result = callMethod(messages, '') as Array<Record<string, unknown>>;
                expect(result).toHaveLength(3);
                expect(result[2]).toEqual({ role: 'user', content: 'ok' });
            });

            it('should work with prefill when last message is already a user message', () => {
                const messages = [
                    { role: 'system', content: 'Be helpful' },
                    { role: 'user', content: 'Give me JSON' }
                ];
                const result = callMethod(messages, '{') as Array<Record<string, unknown>>;
                // Original 2 messages + 1 prefill assistant message
                expect(result).toHaveLength(3);
                expect(result[2]).toEqual({
                    role: 'assistant',
                    content: '{',
                    prefix: true
                });
            });

            it('should preserve all original messages when prefill is provided', () => {
                const messages = [
                    { role: 'system', content: 'System prompt' },
                    { role: 'user', content: 'User message' },
                    { role: 'assistant', content: 'Assistant reply' },
                    { role: 'user', content: 'Follow-up' }
                ];
                const result = callMethod(messages, 'Here is my response:') as Array<Record<string, unknown>>;
                expect(result).toHaveLength(5);
                // First 4 should be the originals
                expect(result[0]).toEqual({ role: 'system', content: 'System prompt' });
                expect(result[1]).toEqual({ role: 'user', content: 'User message' });
                expect(result[2]).toEqual({ role: 'assistant', content: 'Assistant reply' });
                expect(result[3]).toEqual({ role: 'user', content: 'Follow-up' });
                // Last should be the prefill
                expect(result[4]).toEqual({
                    role: 'assistant',
                    content: 'Here is my response:',
                    prefix: true
                });
            });
        });
    });

    describe('processStreamingChunk', () => {
        const callMethod = (chunk: unknown): { content: string; finishReason?: string; usage: unknown } => {
            return (instance as ReturnType<typeof Object.create>)['processStreamingChunk'](chunk);
        };

        it('should extract content from streaming chunk', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();

            const chunk = {
                data: {
                    choices: [{
                        delta: { content: 'Hello' },
                        finishReason: null
                    }]
                }
            };
            const result = callMethod(chunk);
            expect(result.content).toBe('Hello');
        });

        it('should detect finish reason', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();
            const chunk = {
                data: {
                    choices: [{
                        delta: {},
                        finishReason: 'stop'
                    }]
                }
            };
            const result = callMethod(chunk);
            expect(result.finishReason).toBe('stop');
        });

        it('should return empty content for null chunk', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();
            const result = callMethod(null);
            expect(result.content).toBe('');
        });

        it('should extract usage information when present', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();

            const chunk = {
                data: {
                    choices: [{
                        delta: { content: 'hi' }
                    }],
                    usage: {
                        promptTokens: 10,
                        completionTokens: 5
                    }
                }
            };
            const result = callMethod(chunk);
            expect(result.usage).toBeDefined();
        });
    });

    describe('cancellation (ChatParams.cancellationToken)', () => {
        type ChatResultLike = { success: boolean; statusText: string | null; exception: unknown };

        const okResponse = {
            id: 'x',
            object: 'chat.completion',
            model: 'mistral-small',
            created: 1,
            choices: [{ message: { content: 'hi' }, finishReason: 'stop', index: 0 }],
            usage: { promptTokens: 5, completionTokens: 3 }
        };

        const buildParams = (token?: AbortSignal) => ({
            model: 'mistral-small',
            messages: [{ role: 'user', content: 'hello' }],
            cancellationToken: token
        });

        const callNonStreaming = (token?: AbortSignal): Promise<ChatResultLike> =>
            (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion'](buildParams(token));

        const callCreateStream = (token?: AbortSignal): Promise<unknown> =>
            (instance as ReturnType<typeof Object.create>)['createStreamingRequest'](buildParams(token));

        it('passes the token to the SDK as the fetch signal (non-streaming)', async () => {
            const controller = new AbortController();
            mockComplete.mockResolvedValue(okResponse);

            await callNonStreaming(controller.signal);

            expect(mockComplete.mock.calls[0][1]).toEqual({ signal: controller.signal });
        });

        it('passes no request options when there is no token', async () => {
            mockComplete.mockResolvedValue(okResponse);

            await callNonStreaming(undefined);

            expect(mockComplete.mock.calls[0][1]).toBeUndefined();
        });

        it('passes the token to the SDK as the fetch signal (streaming)', async () => {
            const controller = new AbortController();
            mockStream.mockResolvedValue({});

            await callCreateStream(controller.signal);

            expect(mockStream.mock.calls[0][1]).toEqual({ signal: controller.signal });
        });

        it('rethrows an SDK abort for BaseLLM to report as a cancellation', async () => {
            const abortError = new Error('Request aborted by client');
            abortError.name = 'RequestAbortedError';
            mockComplete.mockRejectedValue(abortError);

            await expect(callNonStreaming(new AbortController().signal)).rejects.toBe(abortError);
        });

        it('still throws non-cancellation errors (unchanged behavior)', async () => {
            mockComplete.mockRejectedValue(new Error('boom'));

            await expect(callNonStreaming(undefined)).rejects.toThrow('boom');
        });
    });
});
