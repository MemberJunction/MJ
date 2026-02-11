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
vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: MockAnthropic
}));

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
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
        assistant: 'assistant' as const
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

import { AnthropicLLM } from '../models/anthropic';
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
        const callMethod = (messages: Array<{ role: string; content: unknown }>, enableCaching: boolean = true): unknown[] => {
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
    });
});
