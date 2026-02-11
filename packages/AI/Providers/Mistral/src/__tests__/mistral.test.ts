import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables
const mockComplete = vi.hoisted(() => vi.fn());
const mockStream = vi.hoisted(() => vi.fn());
const MockMistral = vi.hoisted(() => vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.chat = {
        complete: mockComplete,
        stream: mockStream
    };
}));

// Mock the Mistral SDK
vi.mock('@mistralai/mistralai', () => ({
    Mistral: MockMistral
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
        ErrorAnalyzer: { analyzeError: vi.fn() }
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
    });

    describe('SupportsStreaming', () => {
        it('should return true', () => {
            expect(instance.SupportsStreaming).toBe(true);
        });
    });

    describe('resetStreamingState', () => {
        it('should reset all streaming state fields', () => {
            const resetMethod = (instance as ReturnType<typeof Object.create>)['resetStreamingState'].bind(instance);
            const getState = () => (instance as ReturnType<typeof Object.create>)['_streamingState'];

            // Modify state first
            const state = getState();
            state.accumulatedThinking = 'deep thoughts';
            state.inThinkingBlock = true;
            state.pendingContent = 'pending stuff';
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

    describe('processThinkingInStreamingContent', () => {
        const callMethod = (): string => {
            return (instance as ReturnType<typeof Object.create>)['processThinkingInStreamingContent']();
        };
        const getState = () => (instance as ReturnType<typeof Object.create>)['_streamingState'];
        const resetState = () => (instance as ReturnType<typeof Object.create>)['resetStreamingState']();

        it('should pass through content when thinking is already complete', () => {
            resetState();
            const state = getState();
            state.thinkingComplete = true;
            state.pendingContent = 'Hello world';

            const result = callMethod();
            expect(result).toBe('Hello world');
            expect(getState().pendingContent).toBe('');
        });

        it('should detect and enter thinking block', () => {
            resetState();
            const state = getState();
            state.pendingContent = '<think>starting to think';

            const result = callMethod();
            expect(result).toBe('');
            expect(getState().inThinkingBlock).toBe(true);
            expect(getState().accumulatedThinking).toBe('starting to think');
        });

        it('should accumulate thinking and extract content after close tag', () => {
            resetState();
            const state = getState();
            state.inThinkingBlock = true;
            state.pendingContent = 'more thinking</think>actual output';

            const result = callMethod();
            expect(result).toBe('actual output');
            expect(getState().accumulatedThinking).toBe('more thinking');
            expect(getState().thinkingComplete).toBe(true);
            expect(getState().inThinkingBlock).toBe(false);
        });

        it('should continue accumulating when still in thinking block with no close tag', () => {
            resetState();
            const state = getState();
            state.inThinkingBlock = true;
            state.pendingContent = 'still thinking about it';

            const result = callMethod();
            expect(result).toBe('');
            expect(getState().accumulatedThinking).toBe('still thinking about it');
            expect(getState().pendingContent).toBe('');
        });

        it('should output regular content when no thinking tags found', () => {
            resetState();
            const state = getState();
            state.pendingContent = 'regular content here';

            const result = callMethod();
            expect(result).toBe('regular content here');
            expect(getState().pendingContent).toBe('');
        });

        it('should hold back content that might be a partial tag', () => {
            resetState();
            const state = getState();
            state.pendingContent = 'some content<';

            const result = callMethod();
            expect(result).toBe('some content');
            expect(getState().pendingContent).toBe('<');
        });

        it('should hold back partial <thin tag', () => {
            resetState();
            const state = getState();
            state.pendingContent = 'hello<thin';

            const result = callMethod();
            expect(result).toBe('hello');
            expect(getState().pendingContent).toBe('<thin');
        });
    });

    describe('MapMJMessagesToMistral', () => {
        const callMethod = (messages: Array<{ role: string; content: unknown }>): unknown[] => {
            return (instance as ReturnType<typeof Object.create>)['MapMJMessagesToMistral'](messages);
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
    });

    describe('processStreamingChunk', () => {
        const callMethod = (chunk: unknown): { content: string; finishReason?: string; usage: unknown } => {
            return (instance as ReturnType<typeof Object.create>)['processStreamingChunk'](chunk);
        };

        it('should extract content from streaming chunk', () => {
            // Reset streaming state and set thinkingComplete
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
            const state = (instance as ReturnType<typeof Object.create>)['_streamingState'];
            state.thinkingComplete = true;

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
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
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
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
            const result = callMethod(null);
            expect(result.content).toBe('');
        });

        it('should extract usage information when present', () => {
            (instance as ReturnType<typeof Object.create>)['resetStreamingState']();
            const state = (instance as ReturnType<typeof Object.create>)['_streamingState'];
            state.thinkingComplete = true;

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
});
