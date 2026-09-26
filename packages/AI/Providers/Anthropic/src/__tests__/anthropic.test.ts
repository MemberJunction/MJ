import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables
const mockStream = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockCompletionsCreate = vi.hoisted(() => vi.fn());
const MockAnthropic = vi.hoisted(() => vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.messages = {
        stream: mockStream,
        create: mockCreate
    };
    this.completions = {
        create: mockCompletionsCreate
    };
}));

// Mock the Anthropic SDK
/** Stand-in for the SDK's abort error — the driver uses `instanceof` on it to detect cancellation. */
const MockAPIUserAbortError = vi.hoisted(() => class MockAPIUserAbortError extends Error {
    constructor() {
        super('Request was aborted.');
        this.name = 'APIUserAbortError';
    }
});

vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: MockAnthropic,
    APIUserAbortError: MockAPIUserAbortError
}));

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
    // The driver stamps the full native response onto modelSpecificResponseDetails; without this the
    // success path throws and every result-shape assertion silently sees the error result instead.
    ToJSONSafe: (value: unknown) => value
}));

// Mock @memberjunction/ai
vi.mock('@memberjunction/ai', () => {
    class BaseModel {
        protected _apiKey: string;
        constructor(apiKey: string) {
            this._apiKey = apiKey;
        }
    }
    class BaseLLM extends BaseModel {
        protected _additionalSettings: Record<string, unknown> = {};
        public get SupportsStreaming(): boolean { return false; }
        // The trailing volatile-state seam, mirroring @memberjunction/ai's BaseLLM: the base test is
        // the metadata flag alone; AnthropicLLM's override adds its tag-literal fallback on top.
        protected IsVolatileStateMessage(message?: { metadata?: { volatileState?: boolean } }): boolean {
            return message?.metadata?.volatileState === true;
        }
        protected TrailingVolatileStateIndex(messages: Array<{ role: string; content: unknown }>): number {
            const last = messages.length - 1;
            if (last >= 1 && this.IsVolatileStateMessage(messages[last])) { return last; }
            if (last >= 2 && messages[last].role === 'assistant' && this.IsVolatileStateMessage(messages[last - 1])) { return last - 1; }
            return -1;
        }
        protected SplitTrailingVolatileState(messages: Array<{ role: string; content: unknown }>): { head: unknown[]; tail: unknown[] } | null {
            const index = this.TrailingVolatileStateIndex(messages);
            return index < 1 ? null : { head: messages.slice(0, index), tail: messages.slice(index) };
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
        cacheInfo: unknown = null;
        constructor(success: boolean, startTime: Date, endTime: Date) {
            this.success = success;
            this.startTime = startTime;
            this.endTime = endTime;
        }
    }
    const ChatMessageRole = {
        system: 'system' as const,
        user: 'user' as const,
        assistant: 'assistant' as const,
        tool: 'tool' as const
    };
    class ChatParams {
        messages: Array<{ role: string; content: unknown }> = [];
        streaming?: boolean = false;
        effortLevel?: string;
        enableCaching?: boolean = true;
    }
    class SummarizeResult {
        constructor(
            public userMessage: unknown,
            public summaryText: string | null,
            public success: boolean,
            public startTime: Date,
            public endTime: Date
        ) {}
    }
    return {
        BaseLLM,
        ModelUsage,
        ChatResult,
        ChatMessageRole,
        ChatParams,
        ChatMessage: {} as unknown,
        ChatMessageContent: {} as unknown,
        ChatMessageContentBlock: {} as unknown,
        ChatToolCall: {} as unknown,
        CHAT_FINISH_REASON_TOOL_CALLS: 'tool_calls',
        SummarizeParams: ChatParams,
        SummarizeResult,
        ClassifyParams: ChatParams,
        ClassifyResult: class {},
        StreamingChatCallbacks: {} as unknown,
        ErrorAnalyzer: { analyzeError: vi.fn() },
        GetUserMessageFromChatParams: (p: { messages: Array<{ role: string; content: unknown }> }) =>
            p.messages.find((m: { role: string }) => m.role === 'user')?.content,
        GetSystemPromptFromChatParams: (p: { messages: Array<{ role: string; content: unknown }> }) =>
            p.messages.find((m: { role: string }) => m.role === 'system')?.content,
        parseBase64DataUrl: (dataUrl: string) => {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                return { mediaType: match[1], data: match[2] };
            }
            return null;
        }
    };
});

import { AnthropicLLM, ANTHROPIC_CACHE_BREAKPOINT } from '../models/anthropic';
import { ChatMessageRole } from '@memberjunction/ai';

describe('AnthropicLLM', () => {
    let instance: AnthropicLLM;

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new AnthropicLLM('test-api-key');
    });

    describe('Constructor', () => {
        it('should create an instance with an apiKey', () => {
            expect(instance).toBeInstanceOf(AnthropicLLM);
            expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
        });

        it('should expose the Anthropic client via getter', () => {
            expect(instance.AnthropicClient).toBeDefined();
            expect(instance.AnthropicClient.messages).toBeDefined();
        });
    });

    describe('SupportsStreaming', () => {
        it('should return true', () => {
            expect(instance.SupportsStreaming).toBe(true);
        });
    });

    describe('ConvertMJToAnthropicRole', () => {
        it('should map "assistant" to "assistant"', () => {
            expect(instance.ConvertMJToAnthropicRole('assistant')).toBe('assistant');
        });

        it('should map "user" to "user"', () => {
            expect(instance.ConvertMJToAnthropicRole('user')).toBe('user');
        });

        it('should map "system" to "user" (default)', () => {
            expect(instance.ConvertMJToAnthropicRole('system')).toBe('user');
        });

        it('should map unknown roles to "user" (default)', () => {
            expect(instance.ConvertMJToAnthropicRole('unknown' as 'user')).toBe('user');
        });
    });

    describe('formatContentWithCaching', () => {
        const callMethod = (content: unknown, enableCaching: boolean = true): unknown[] => {
            return (instance as ReturnType<typeof Object.create>)['formatContentWithCaching'](content, enableCaching);
        };

        it('should wrap string content in a text block with cache_control', () => {
            const result = callMethod('Hello world');
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: 'text',
                text: 'Hello world',
                cache_control: { type: 'ephemeral' }
            });
        });

        it('should wrap string content without cache_control when caching disabled', () => {
            const result = callMethod('Hello world', false);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: 'text',
                text: 'Hello world'
            });
        });

        it('should process array content and only add cache_control to last block', () => {
            const content = [
                { type: 'text', content: 'First block' },
                { type: 'text', content: 'Second block' }
            ];
            const result = callMethod(content);
            expect(result).toHaveLength(2);
            // First block should NOT have cache_control
            expect(result[0]).toEqual({ type: 'text', text: 'First block' });
            // Last block should have cache_control
            expect(result[1]).toEqual({
                type: 'text',
                text: 'Second block',
                cache_control: { type: 'ephemeral' }
            });
        });

        it('should process array with single text block and add cache_control', () => {
            const content = [
                { type: 'text', content: 'Only block' }
            ];
            const result = callMethod(content);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: 'text',
                text: 'Only block',
                cache_control: { type: 'ephemeral' }
            });
        });

        it('should handle image_url blocks in array content', () => {
            const content = [
                { type: 'text', content: 'Describe this' },
                { type: 'image_url', content: 'https://example.com/image.jpg' }
            ];
            const result = callMethod(content);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ type: 'text', text: 'Describe this' });
            // Image block should be formatted by formatImageBlock
            expect(result[1]).toBeDefined();
            expect(result[1].type).toBe('image');
        });

        it('should handle non-string, non-array content as fallback', () => {
            const result = callMethod(12345);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                type: 'text',
                text: '12345',
                cache_control: { type: 'ephemeral' }
            });
        });

        it('should not add cache_control to array items when caching is disabled', () => {
            const content = [
                { type: 'text', content: 'First' },
                { type: 'text', content: 'Last' }
            ];
            const result = callMethod(content, false);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ type: 'text', text: 'First' });
            expect(result[1]).toEqual({ type: 'text', text: 'Last' });
        });

        it('should split a string on a cache-breakpoint marker, caching the stable prefix only', () => {
            const result = callMethod(`STABLE PREFIX${ANTHROPIC_CACHE_BREAKPOINT}VOLATILE TAIL`) as Array<Record<string, unknown>>;
            expect(result).toHaveLength(2);
            // Stable prefix gets the breakpoint; marker text is removed.
            expect(result[0]).toEqual({ type: 'text', text: 'STABLE PREFIX', cache_control: { type: 'ephemeral' } });
            // Volatile tail is left uncached so it never poisons the cached prefix.
            expect(result[1]).toEqual({ type: 'text', text: 'VOLATILE TAIL' });
        });

        it('should strip the marker (no breakpoints) when caching is disabled', () => {
            const result = callMethod(`STABLE${ANTHROPIC_CACHE_BREAKPOINT}VOLATILE`, false) as Array<Record<string, unknown>>;
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ type: 'text', text: 'STABLE' });
            expect(result[1]).toEqual({ type: 'text', text: 'VOLATILE' });
            expect(result.some((b) => 'cache_control' in b)).toBe(false);
        });

        it('should cap cache_control breakpoints at 4 even with many markers', () => {
            const text = ['a', 'b', 'c', 'd', 'e', 'f'].join(ANTHROPIC_CACHE_BREAKPOINT);
            const result = callMethod(text) as Array<Record<string, unknown>>;
            const breakpoints = result.filter((b) => 'cache_control' in b).length;
            expect(breakpoints).toBeLessThanOrEqual(4);
            // Marker text must not leak into any block.
            expect(result.every((b) => !(b.text as string).includes(ANTHROPIC_CACHE_BREAKPOINT))).toBe(true);
        });
    });

    describe('resetStreamingState (private)', () => {
        it('should reset all state fields', () => {
            const resetMethod = (instance as ReturnType<typeof Object.create>)['resetStreamingState'].bind(instance);
            const getState = () => (instance as ReturnType<typeof Object.create>)['_streamingState'];

            // Modify the state first
            const state = getState();
            state.accumulatedThinking = 'some thinking';
            state.inThinkingBlock = true;
            state.pendingContent = 'pending';
            state.thinkingComplete = true;

            // Reset and verify
            resetMethod();
            const resetState = getState();
            expect(resetState.accumulatedThinking).toBe('');
            expect(resetState.inThinkingBlock).toBe(false);
            expect(resetState.pendingContent).toBe('');
            expect(resetState.thinkingComplete).toBe(false);
        });
    });

    describe('extractThinkingContent (via nonStreamingChatCompletion content processing)', () => {
        // Since the actual thinking extraction happens inline in nonStreamingChatCompletion,
        // we test the logic by simulating the response content block processing.

        it('should extract thinking from thinking-type content blocks', () => {
            // Simulates what the nonStreamingChatCompletion does when iterating content blocks
            const contentBlocks = [
                { type: 'thinking', thinking: 'I need to analyze this carefully' },
                { type: 'text', text: 'Here is my answer' }
            ];

            let content = '';
            let thinkingContent: string | undefined = undefined;

            for (const block of contentBlocks) {
                if (block.type === 'thinking') {
                    thinkingContent = (block as { type: string; thinking: string }).thinking;
                } else if (block.type === 'text') {
                    content += (block as { type: string; text: string }).text;
                }
            }

            expect(thinkingContent).toBe('I need to analyze this carefully');
            expect(content).toBe('Here is my answer');
        });

        it('should handle content with only text blocks (no thinking)', () => {
            const contentBlocks = [
                { type: 'text', text: 'Just a regular response' }
            ];

            let content = '';
            let thinkingContent: string | undefined = undefined;

            for (const block of contentBlocks) {
                if (block.type === 'thinking') {
                    thinkingContent = (block as { type: string; thinking: string }).thinking;
                } else if (block.type === 'text') {
                    content += (block as { type: string; text: string }).text;
                }
            }

            expect(thinkingContent).toBeUndefined();
            expect(content).toBe('Just a regular response');
        });

        it('should handle fallback thinking tags in content', () => {
            // This tests the fallback logic when thinking is embedded as tags in text content
            let content = '<thinking>Let me think about this</thinking>The actual response';
            let thinkingContent: string | undefined = undefined;

            if (!thinkingContent && content.startsWith('<thinking>') && content.includes('</thinking>')) {
                const thinkStart = content.indexOf('<thinking>') + '<thinking>'.length;
                const thinkEnd = content.indexOf('</thinking>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                content = content.substring(0, content.indexOf('<thinking>')) +
                         content.substring(thinkEnd + '</thinking>'.length);
                content = content.trim();
            }

            expect(thinkingContent).toBe('Let me think about this');
            expect(content).toBe('The actual response');
        });

        it('should handle multiple text blocks concatenation', () => {
            const contentBlocks = [
                { type: 'text', text: 'Part 1 ' },
                { type: 'text', text: 'Part 2' }
            ];

            let content = '';
            for (const block of contentBlocks) {
                if (block.type === 'text') {
                    content += (block as { type: string; text: string }).text;
                }
            }

            expect(content).toBe('Part 1 Part 2');
        });
    });

    describe('processStreamingChunk', () => {
        const callMethod = (chunk: unknown): { content: string; finishReason?: string; usage: unknown } => {
            return (instance as ReturnType<typeof Object.create>)['processStreamingChunk'](chunk);
        };

        it('should handle thinking_delta chunks by accumulating thinking content', () => {
            // Reset streaming state first
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();

            const chunk = {
                type: 'thinking_delta',
                delta: { text: 'Thinking about it...' }
            };
            const result = callMethod(chunk);
            expect(result.content).toBe('');
            expect(result.usage).toBeNull();

            const state = (instance as ReturnType<typeof Object.create>)['_streamingState'];
            expect(state.accumulatedThinking).toBe('Thinking about it...');
        });

        it('should handle content_block_delta chunks with text', () => {
            // Reset streaming state
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
            // Set thinkingComplete to true so content passes through
            const state = (instance as ReturnType<typeof Object.create>)['_streamingState'];
            state.thinkingComplete = true;

            const chunk = {
                type: 'content_block_delta',
                delta: { text: 'Hello world' }
            };
            const result = callMethod(chunk);
            expect(result.content).toBe('Hello world');
        });

        it('should handle message_stop chunks', () => {
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
            const chunk = { type: 'message_stop' };
            const result = callMethod(chunk);
            expect(result.finishReason).toBe('stop');
        });

        it('should return empty content for null/undefined chunks', () => {
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
            const result = callMethod(null);
            expect(result.content).toBe('');
        });
    });

    describe('formatMessagesWithCaching', () => {
        interface FormattedBlock { type: string; text?: string; cache_control?: { type: string } }
        interface FormattedMessage { role: string; content: FormattedBlock[] }
        const callMethod = (messages: Array<{ role: string; content: unknown; metadata?: { volatileState?: boolean } }>, enableCaching: boolean = true): FormattedMessage[] => {
            return (instance as ReturnType<typeof Object.create>)['formatMessagesWithCaching'](messages, enableCaching);
        };

        it('should format a single user message', () => {
            const messages = [
                { role: 'user' as const, content: 'Hello' }
            ];
            const result = callMethod(messages);
            expect(result).toHaveLength(1);
            expect(result[0].role).toBe('user');
        });

        it('should insert assistant filler when same roles appear back-to-back', () => {
            const messages = [
                { role: 'user' as const, content: 'First question' },
                { role: 'user' as const, content: 'Second question' }
            ];
            const result = callMethod(messages);
            // Should have inserted an assistant message between the two user messages
            expect(result).toHaveLength(3);
            expect(result[1].role).toBe('assistant');
            expect(result[1].content).toEqual([{ type: 'text', text: 'OK' }]);
        });

        it('should place cache_control on penultimate message when trailing message is volatileState fragment', () => {
            const messages = [
                { role: 'user' as const, content: 'User instruction' },
                { role: 'assistant' as const, content: 'Assistant response' },
                { role: 'user' as const, content: '<mj-runtime-state>\nDate: 2026-09-21\n</mj-runtime-state>', metadata: { volatileState: true } }
            ];
            const result = callMethod(messages, true);
            // Roles: user -> assistant -> user (no filler needed between assistant and user)
            expect(result).toHaveLength(3);
            // Penultimate message (assistant response) should have cache_control
            expect(result[1].content).toEqual([
                { type: 'text', text: 'Assistant response', cache_control: { type: 'ephemeral' } }
            ]);
            // Final message (volatile state) should NOT have cache_control
            expect(result[2].content).toEqual([
                { type: 'text', text: '<mj-runtime-state>\nDate: 2026-09-21\n</mj-runtime-state>' }
            ]);
        });

        it('should preserve role alternation with OK filler when last real message and volatile fragment are both user turns', () => {
            const messages = [
                { role: 'user' as const, content: 'Initial user turn' },
                { role: 'user' as const, content: '<mj-runtime-state>\nDate: 2026-09-21\n</mj-runtime-state>', metadata: { volatileState: true } }
            ];
            const result = callMethod(messages, true);
            // user -> assistant OK -> user fragment
            expect(result).toHaveLength(3);
            expect(result[0].role).toBe('user');
            expect(result[0].content).toEqual([
                { type: 'text', text: 'Initial user turn', cache_control: { type: 'ephemeral' } }
            ]);
            expect(result[1].role).toBe('assistant');
            expect(result[1].content).toEqual([{ type: 'text', text: 'OK' }]);
            expect(result[2].role).toBe('user');
            expect(result[2].content).toEqual([
                { type: 'text', text: '<mj-runtime-state>\nDate: 2026-09-21\n</mj-runtime-state>' }
            ]);
        });

        it('should recognize <mj-runtime-state> text prefix without explicit metadata flag', () => {
            const messages = [
                { role: 'user' as const, content: 'Initial user turn' },
                { role: 'user' as const, content: '<mj-runtime-state>\nSome state\n</mj-runtime-state>' }
            ];
            const result = callMethod(messages, true);
            expect(result).toHaveLength(3);
            expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
            expect(result[2].content[0].cache_control).toBeUndefined();
        });

        it('should recognize <mj-runtime-state> inside content block array without explicit metadata flag', () => {
            const messages = [
                { role: 'user' as const, content: 'Initial user turn' },
                { role: 'user' as const, content: [{ type: 'text', content: '<mj-runtime-state>\nSome state\n</mj-runtime-state>' }] }
            ];
            const result = callMethod(messages, true);
            expect(result).toHaveLength(3);
            expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
            expect(result[2].content[0].cache_control).toBeUndefined();
        });

        it('should keep the breakpoint before the volatile fragment when an assistant prefill follows it', () => {
            const messages = [
                { role: 'user' as const, content: 'User instruction' },
                { role: 'assistant' as const, content: 'Assistant response' },
                { role: 'user' as const, content: '<mj-runtime-state>\nDate: 2026-09-21\n</mj-runtime-state>', metadata: { volatileState: true } },
                { role: 'assistant' as const, content: '```json' }
            ];
            const result = callMethod(messages, true);
            // user -> assistant -> user fragment -> assistant prefill: no fillers needed
            expect(result).toHaveLength(4);
            expect(result[1].content).toEqual([
                { type: 'text', text: 'Assistant response', cache_control: { type: 'ephemeral' } }
            ]);
            expect(result[2].content[0].cache_control).toBeUndefined();
            expect(result[3].role).toBe('assistant');
            expect(result[3].content).toEqual([{ type: 'text', text: '```json' }]);
        });

        it('should still insert the OK filler before the fragment when a prefill follows and the last real turn is a user turn', () => {
            const messages = [
                { role: 'user' as const, content: 'Initial user turn' },
                { role: 'user' as const, content: '<mj-runtime-state>\nSome state\n</mj-runtime-state>', metadata: { volatileState: true } },
                { role: 'assistant' as const, content: '{' }
            ];
            const result = callMethod(messages, true);
            // user (cached) -> assistant OK -> user fragment -> assistant prefill
            expect(result.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
            expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
            expect(result[1].content).toEqual([{ type: 'text', text: 'OK' }]);
            expect(result[2].content[0].cache_control).toBeUndefined();
            expect(result[3].content[0].cache_control).toBeUndefined();
        });

        it('should not add cache_control when enableCaching is false even with volatile state fragment', () => {
            const messages = [
                { role: 'user' as const, content: 'Initial user turn' },
                { role: 'user' as const, content: '<mj-runtime-state>\nSome state\n</mj-runtime-state>', metadata: { volatileState: true } }
            ];
            const result = callMethod(messages, false);
            expect(result[0].content[0].cache_control).toBeUndefined();
            expect(result[result.length - 1].content[0].cache_control).toBeUndefined();
        });
    });

    describe('assistantPrefill', () => {
        describe('appendPrefillMessage (private)', () => {
            const callMethod = (messages: Array<{ role: string; content: unknown }>, prefill: string | undefined): Array<{ role: string; content: unknown }> => {
                return (instance as ReturnType<typeof Object.create>)['appendPrefillMessage'](messages, prefill);
            };

            it('should return the original messages array when prefill is undefined', () => {
                const messages = [
                    { role: ChatMessageRole.user, content: 'Hello' }
                ];
                const result = callMethod(messages, undefined);
                expect(result).toBe(messages); // same reference, not a copy
                expect(result).toHaveLength(1);
            });

            it('should return the original messages array when prefill is empty string', () => {
                const messages = [
                    { role: ChatMessageRole.user, content: 'Hello' }
                ];
                const result = callMethod(messages, '');
                expect(result).toBe(messages); // same reference, not a copy
                expect(result).toHaveLength(1);
            });

            it('should append an assistant message when prefill is provided', () => {
                const messages = [
                    { role: ChatMessageRole.user, content: 'Hello' }
                ];
                const result = callMethod(messages, '{"result":');
                expect(result).toHaveLength(2);
                expect(result[0]).toEqual({ role: ChatMessageRole.user, content: 'Hello' });
                expect(result[1]).toEqual({ role: ChatMessageRole.assistant, content: '{"result":' });
            });

            it('should not mutate the original messages array', () => {
                const messages = [
                    { role: ChatMessageRole.user, content: 'Hello' }
                ];
                const result = callMethod(messages, 'prefill text');
                expect(messages).toHaveLength(1); // original unchanged
                expect(result).toHaveLength(2); // new array has the prefill
            });
        });

        describe('nonStreamingChatCompletion with assistantPrefill', () => {
            it('should include prefill in messages sent to the Anthropic API', async () => {
                // Set up the mock to return a valid stream-like object
                const mockFinalMessage = vi.fn().mockResolvedValue({
                    content: [{ type: 'text', text: 'completed response' }],
                    usage: { input_tokens: 10, output_tokens: 5 },
                    stop_reason: 'end_turn'
                });
                const mockOn = vi.fn().mockReturnValue({ finalMessage: mockFinalMessage });
                mockStream.mockReturnValue({ on: mockOn });

                const params = {
                    messages: [
                        { role: ChatMessageRole.user, content: 'Generate JSON' }
                    ],
                    model: 'claude-sonnet-4-20250514',
                    maxOutputTokens: 1024,
                    assistantPrefill: '{"data":',
                    enableCaching: false
                };

                await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion'](params);

                // Verify mockStream (messages.stream) was called
                expect(mockStream).toHaveBeenCalledTimes(1);
                const callArgs = mockStream.mock.calls[0][0];

                // The messages passed to the API should include the prefill as the last message
                const apiMessages = callArgs.messages;
                const lastMessage = apiMessages[apiMessages.length - 1];
                expect(lastMessage.role).toBe('assistant');
                // The content is formatted through formatMessagesWithCaching, so check for the prefill text
                expect(lastMessage.content).toEqual([{ type: 'text', text: '{"data":', cache_control: { type: 'ephemeral' } }]);
            });

            it('should not add prefill message when assistantPrefill is not set', async () => {
                const mockFinalMessage = vi.fn().mockResolvedValue({
                    content: [{ type: 'text', text: 'response' }],
                    usage: { input_tokens: 10, output_tokens: 5 },
                    stop_reason: 'end_turn'
                });
                const mockOn = vi.fn().mockReturnValue({ finalMessage: mockFinalMessage });
                mockStream.mockReturnValue({ on: mockOn });

                const params = {
                    messages: [
                        { role: ChatMessageRole.user, content: 'Hello' }
                    ],
                    model: 'claude-sonnet-4-20250514',
                    maxOutputTokens: 1024,
                    enableCaching: false
                };

                await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion'](params);

                expect(mockStream).toHaveBeenCalledTimes(1);
                const callArgs = mockStream.mock.calls[0][0];
                const apiMessages = callArgs.messages;

                // Should only have the user message, no assistant prefill
                expect(apiMessages).toHaveLength(1);
                expect(apiMessages[0].role).toBe('user');
            });
        });
    });

    describe('cancellationToken', () => {
        const baseParams = {
            messages: [{ role: ChatMessageRole.user, content: 'Hello' }],
            model: 'claude-sonnet-4-20250514',
            maxOutputTokens: 1024,
            enableCaching: false
        };

        const mockOkStream = () => {
            const finalMessage = vi.fn().mockResolvedValue({
                content: [{ type: 'text', text: 'response' }],
                usage: { input_tokens: 10, output_tokens: 5 },
                stop_reason: 'end_turn'
            });
            mockStream.mockReturnValue({ on: vi.fn().mockReturnValue({ finalMessage }) });
        };

        it('should forward the token to messages.stream as the `signal` request option', async () => {
            mockOkStream();
            const controller = new AbortController();

            await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({
                ...baseParams,
                cancellationToken: controller.signal
            });

            expect(mockStream.mock.calls[0][1]).toEqual({ signal: controller.signal });
        });

        it('should forward the token to messages.create as the `signal` request option (streaming)', async () => {
            mockCreate.mockResolvedValue({});
            const controller = new AbortController();

            await (instance as ReturnType<typeof Object.create>)['createStreamingRequest']({
                ...baseParams,
                cancellationToken: controller.signal
            });

            expect(mockCreate.mock.calls[0][1]).toEqual({ signal: controller.signal });
        });

        it('should short-circuit without calling the API when already aborted', async () => {
            mockOkStream();
            const controller = new AbortController();
            controller.abort();

            const result = await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({
                ...baseParams,
                cancellationToken: controller.signal
            });

            expect(mockStream).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
            expect(result.errorMessage).toBe('Anthropic request was cancelled');
        });

        it('should report an APIUserAbortError from the SDK as a cancelled result', async () => {
            const finalMessage = vi.fn().mockRejectedValue(new MockAPIUserAbortError());
            mockStream.mockReturnValue({ on: vi.fn().mockReturnValue({ finalMessage }) });

            const result = await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion'](baseParams);

            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
        });

        it('should report a cancelled stream as a failure, not a truncated success', async () => {
            mockCreate.mockResolvedValue({});
            const controller = new AbortController();

            await (instance as ReturnType<typeof Object.create>)['createStreamingRequest']({
                ...baseParams,
                cancellationToken: controller.signal
            });

            // Caller cancels mid-stream; the SDK's Stream ends silently rather than throwing.
            controller.abort();

            const result = (instance as ReturnType<typeof Object.create>)['finalizeStreamingResponse']('partial', null, null);

            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
        });
    });
});

// =============================================================================
// Native tool calling — request mapping + response normalization (plan §5)
// =============================================================================

describe('AnthropicLLM — native tool calling', () => {
    let instance: AnthropicLLM;

    /** Points the mocked SDK at one canned response and hands back the stream spy. */
    const stubResponse = (response: Record<string, unknown>): void => {
        const finalMessage = vi.fn().mockResolvedValue({
            usage: { input_tokens: 10, output_tokens: 5 },
            stop_reason: 'end_turn',
            ...response
        });
        mockStream.mockReturnValue({ on: vi.fn().mockReturnValue({ finalMessage }) });
    };

    /** Invokes the protected driver entry point the way the base class would. */
    const run = async (params: Record<string, unknown>): Promise<Record<string, unknown>> =>
        (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({
            model: 'claude-sonnet-4-20250514',
            enableCaching: false,
            ...params
        });

    const WEATHER_TOOL = {
        name: 'get_weather',
        description: 'Call this when the user asks about weather.',
        inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new AnthropicLLM('test-api-key');
        stubResponse({ content: [{ type: 'text', text: 'hello' }] });
    });

    it('declares SupportsTools', () => {
        expect(instance.SupportsTools).toBe(true);
    });

    describe('request mapping', () => {
        it('maps tool declarations onto Anthropic input_schema', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'weather?' }], tools: [WEATHER_TOOL] });

            expect(mockStream.mock.calls[0][0].tools).toEqual([{
                name: 'get_weather',
                description: 'Call this when the user asks about weather.',
                input_schema: WEATHER_TOOL.inputSchema
            }]);
        });

        it('sends no tool fields at all when the caller declares none', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'hi' }] });

            const request = mockStream.mock.calls[0][0];
            expect(request.tools).toBeUndefined();
            expect(request.tool_choice).toBeUndefined();
        });

        it.each([
            ['auto', { type: 'auto' }],
            ['none', { type: 'none' }],
            ['required', { type: 'any' }]
        ])("maps toolChoice '%s' onto Anthropic's vocabulary", async (choice, expected) => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], toolChoice: choice });

            expect(mockStream.mock.calls[0][0].tool_choice).toEqual(expected);
        });

        it('maps a named tool choice onto the tool form', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], toolChoice: { name: 'get_weather' } });

            expect(mockStream.mock.calls[0][0].tool_choice).toEqual({ type: 'tool', name: 'get_weather' });
        });

        it('expresses parallelToolCalls=false as disable_parallel_tool_use, synthesizing the auto choice', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], parallelToolCalls: false });

            expect(mockStream.mock.calls[0][0].tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true });
        });

        it("never hangs the parallelism flag on a 'none' choice — there are no calls to serialize", async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], toolChoice: 'none', parallelToolCalls: false });

            expect(mockStream.mock.calls[0][0].tool_choice).toEqual({ type: 'none' });
        });
    });

    describe('conversation round-tripping (§5.3)', () => {
        it('replays a prior assistant turn as tool_use blocks', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.user, content: 'weather?' },
                    { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: { city: 'NYC' } }] },
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: '72F', toolCallId: 'toolu_1' }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const messages = mockStream.mock.calls[0][0].messages;
            expect(messages[1].role).toBe('assistant');
            expect(messages[1].content).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'NYC' } }]);
        });

        it('sends tool results as tool_result blocks in a user turn', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.user, content: 'weather?' },
                    { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: {} }] },
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: '72F', toolCallId: 'toolu_1' }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const messages = mockStream.mock.calls[0][0].messages;
            expect(messages[2].role).toBe('user');
            expect(messages[2].content).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', content: '72F' }]);
        });

        it('marks a failed result with is_error', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: {} }] },
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: 'boom', toolCallId: 'toolu_1', isError: true }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const messages = mockStream.mock.calls[0][0].messages;
            expect(messages[messages.length - 1].content[0]).toMatchObject({ is_error: true });
        });

        it('coalesces consecutive tool turns into ONE user turn, with no filler between them', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.user, content: 'both please' },
                    {
                        role: ChatMessageRole.assistant,
                        content: '',
                        toolCalls: [
                            { id: 'toolu_1', name: 'get_weather', arguments: {} },
                            { id: 'toolu_2', name: 'get_time', arguments: {} }
                        ]
                    },
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: '72F', toolCallId: 'toolu_1' }] },
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: '10:30', toolCallId: 'toolu_2' }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const messages = mockStream.mock.calls[0][0].messages;
            // user, assistant(tool_use x2), user(tool_result x2) — and crucially no "OK" filler.
            expect(messages).toHaveLength(3);
            expect(messages[2].content.map((b: { tool_use_id: string }) => b.tool_use_id)).toEqual(['toolu_1', 'toolu_2']);
            expect(JSON.stringify(messages)).not.toContain('"OK"');
        });

        it('drops the empty text block on a tool-call turn — Anthropic rejects those', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.user, content: 'weather?' },
                    { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: {} }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const assistantTurn = mockStream.mock.calls[0][0].messages[1];
            expect(assistantTurn.content.every((b: { type: string }) => b.type !== 'text')).toBe(true);
        });

        it('keeps prose alongside tool_use when the model produced both', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.user, content: 'weather?' },
                    { role: ChatMessageRole.assistant, content: 'Let me check.', toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: {} }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const assistantTurn = mockStream.mock.calls[0][0].messages[1];
            expect(assistantTurn.content).toHaveLength(2);
            expect(assistantTurn.content[0]).toMatchObject({ type: 'text', text: 'Let me check.' });
        });
    });

    describe('response normalization (§5.2)', () => {
        it('normalizes tool_use blocks into toolCalls with parsed arguments', async () => {
            stubResponse({
                content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'NYC' } }],
                stop_reason: 'tool_use'
            });

            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'weather?' }], tools: [WEATHER_TOOL] });

            expect(result.data.choices[0].message.toolCalls).toEqual([
                { id: 'toolu_1', name: 'get_weather', arguments: { city: 'NYC' } }
            ]);
        });

        it("reports finish_reason 'tool_calls' on a tool-call turn", async () => {
            stubResponse({
                content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} }],
                stop_reason: 'tool_use'
            });

            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL] });

            expect(result.data.choices[0].finish_reason).toBe('tool_calls');
        });

        it('surfaces text AND tool calls together — never either/or', async () => {
            stubResponse({
                content: [
                    { type: 'text', text: 'Let me check.' },
                    { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} }
                ],
                stop_reason: 'tool_use'
            });

            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL] });

            expect(result.data.choices[0].message.content).toBe('Let me check.');
            expect(result.data.choices[0].message.toolCalls).toHaveLength(1);
        });

        it('leaves toolCalls undefined and finish_reason untouched on an ordinary turn', async () => {
            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }] });

            expect(result.data.choices[0].message.toolCalls).toBeUndefined();
            expect(result.data.choices[0].finish_reason).toBe('completed');
        });

        it('normalizes a malformed tool_use input to an empty argument set rather than passing a non-object', async () => {
            stubResponse({
                content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: 'not-an-object' }],
                stop_reason: 'tool_use'
            });

            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL] });

            expect(result.data.choices[0].message.toolCalls[0].arguments).toEqual({});
        });
    });

    /**
     * Regression: every Claude 5 request that carried an effort level was rejected
     * with HTTP 400 `"thinking.type.enabled" is not supported for this model` because the driver
     * only knew the budget form of thinking. Claude 4.5 (Haiku) accepted the budget form, which is
     * why the defect surfaced as an 80% infrastructure loss on one model and nothing on the other.
     */
    describe('thinking form per model family (adaptive vs budget)', () => {
        let instance: AnthropicLLM;
        const okStream = () => {
            const finalMessage = vi.fn().mockResolvedValue({
                content: [{ type: 'text', text: 'response' }],
                usage: { input_tokens: 10, output_tokens: 5 },
                stop_reason: 'end_turn'
            });
            mockStream.mockReturnValue({ on: vi.fn().mockReturnValue({ finalMessage }) });
        };
        const base = { messages: [{ role: ChatMessageRole.user, content: 'Hello' }], maxOutputTokens: 1024, enableCaching: false };

        beforeEach(() => {
            vi.clearAllMocks();
            instance = new AnthropicLLM('test-api-key');
        });

        it('Claude 5 + effort level → adaptive thinking with output_config.effort and no budget_tokens (non-streaming)', async () => {
            okStream();
            await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({ ...base, model: 'claude-sonnet-5', effortLevel: '1' });

            const sent = mockStream.mock.calls[0][0];
            expect(sent.thinking).toEqual({ type: 'adaptive' });
            expect(sent.output_config).toEqual({ effort: 'low' });
            expect(JSON.stringify(sent)).not.toContain('budget_tokens');
            // No budget, so no max_tokens bump either.
            expect(sent.max_tokens).toBe(1024);
        });

        it('Claude 4.5 + effort level → budget-form thinking with the default budget and a max_tokens bump (non-streaming)', async () => {
            okStream();
            await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({ ...base, model: 'claude-haiku-4-5-20251001', effortLevel: '1' });

            const sent = mockStream.mock.calls[0][0];
            expect(sent.thinking).toEqual({ type: 'enabled', budget_tokens: 31000 });
            expect(sent.output_config).toBeUndefined();
            expect(sent.max_tokens).toBe(32000);
        });

        it('Claude 5 without an effort level → no thinking fields at all (non-streaming)', async () => {
            okStream();
            await (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({ ...base, model: 'claude-sonnet-5' });

            const sent = mockStream.mock.calls[0][0];
            expect(sent.thinking).toBeUndefined();
            expect(sent.output_config).toBeUndefined();
        });

        it('Claude 5 + effort level → adaptive thinking on the streaming path too', async () => {
            mockCreate.mockResolvedValue({});
            await (instance as ReturnType<typeof Object.create>)['createStreamingRequest']({ ...base, model: 'claude-sonnet-5', effortLevel: '50', reasoningBudgetTokens: 4096 });

            const sent = mockCreate.mock.calls[0][0];
            expect(sent.thinking).toEqual({ type: 'adaptive' });
            expect(sent.output_config).toEqual({ effort: 'medium' });
            expect(JSON.stringify(sent)).not.toContain('budget_tokens');
        });

        it('Claude 4.5 + effort level + budget → budget-form thinking on the streaming path (unchanged)', async () => {
            mockCreate.mockResolvedValue({});
            await (instance as ReturnType<typeof Object.create>)['createStreamingRequest']({ ...base, model: 'claude-haiku-4-5-20251001', effortLevel: '50', reasoningBudgetTokens: 4096 });

            const sent = mockCreate.mock.calls[0][0];
            expect(sent.thinking).toEqual({ type: 'enabled', budget_tokens: 4096 });
            expect(sent.output_config).toBeUndefined();
        });
    });
});
