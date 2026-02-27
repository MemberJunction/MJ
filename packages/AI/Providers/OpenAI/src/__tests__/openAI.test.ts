import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables
const mockCreate = vi.hoisted(() => vi.fn());
const MockOpenAI = vi.hoisted(() => vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.chat = {
        completions: {
            create: mockCreate
        }
    };
}));

// Mock the openai SDK
vi.mock('openai', () => ({
    OpenAI: MockOpenAI
}));

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target
}));

// Mock @memberjunction/ai - provide the classes and constants the provider imports
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
        protected extractThinkingFromContent(content: string): { content: string; thinking: string | undefined } {
            if (content.startsWith('<think>') && content.includes('</think>')) {
                const thinkStart = content.indexOf('<think>') + '<think>'.length;
                const thinkEnd = content.indexOf('</think>');
                return {
                    thinking: content.substring(thinkStart, thinkEnd).trim(),
                    content: content.substring(thinkEnd + '</think>'.length).trim()
                };
            }
            return { content, thinking: undefined };
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
        SummarizeParams: ChatParams,
        SummarizeResult,
        ClassifyParams: ChatParams,
        ClassifyResult: class {},
        StreamingChatCallbacks: {} as unknown,
        ErrorAnalyzer: { analyzeError: vi.fn() },
        GetUserMessageFromChatParams: (p: { messages: Array<{ role: string; content: unknown }> }) =>
            p.messages.find((m: { role: string }) => m.role === 'user')?.content,
        parseBase64DataUrl: vi.fn()
    };
});

import { OpenAILLM } from '../models/openAI';
import { ChatMessageRole } from '@memberjunction/ai';

describe('OpenAILLM', () => {
    let instance: OpenAILLM;

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new OpenAILLM('test-api-key');
    });

    describe('Constructor', () => {
        it('should create an instance with an apiKey', () => {
            expect(instance).toBeInstanceOf(OpenAILLM);
            expect(MockOpenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
        });

        it('should accept an optional baseURL', () => {
            vi.clearAllMocks();
            const customInstance = new OpenAILLM('test-key', 'https://custom.openai.com/v1');
            expect(customInstance).toBeInstanceOf(OpenAILLM);
            expect(MockOpenAI).toHaveBeenCalledWith({
                apiKey: 'test-key',
                baseURL: 'https://custom.openai.com/v1'
            });
        });

        it('should not pass baseURL when it is an empty string', () => {
            vi.clearAllMocks();
            new OpenAILLM('test-key', '');
            expect(MockOpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
        });

        it('should expose the OpenAI client via getter', () => {
            expect(instance.OpenAI).toBeDefined();
            expect(instance.OpenAI.chat).toBeDefined();
        });
    });

    describe('SupportsStreaming', () => {
        it('should return true', () => {
            expect(instance.SupportsStreaming).toBe(true);
        });
    });

    describe('supportsReasoningViaSystemPrompt', () => {
        const callMethod = (modelName: string): boolean => {
            return (instance as ReturnType<typeof Object.create>)['supportsReasoningViaSystemPrompt'](modelName);
        };

        it('should return true for gpt-oss models', () => {
            expect(callMethod('gpt-oss-v1')).toBe(true);
        });

        it('should return true for gptoss models (no hyphen)', () => {
            expect(callMethod('gptoss-large')).toBe(true);
        });

        it('should return true for GPT-OSS models (case insensitive)', () => {
            expect(callMethod('GPT-OSS-2025')).toBe(true);
        });

        it('should return false for non-gpt-oss models', () => {
            expect(callMethod('gpt-4')).toBe(false);
        });

        it('should return false for claude models', () => {
            expect(callMethod('claude-3-sonnet')).toBe(false);
        });
    });

    describe('getReasoningLevel', () => {
        const callMethod = (effortLevel: string): 'low' | 'medium' | 'high' => {
            return (instance as ReturnType<typeof Object.create>)['getReasoningLevel'](effortLevel);
        };

        it('should pass through string "low"', () => {
            expect(callMethod('low')).toBe('low');
        });

        it('should pass through string "medium"', () => {
            expect(callMethod('medium')).toBe('medium');
        });

        it('should pass through string "high"', () => {
            expect(callMethod('high')).toBe('high');
        });

        it('should handle case-insensitive string values', () => {
            expect(callMethod('LOW')).toBe('low');
            expect(callMethod('Medium')).toBe('medium');
            expect(callMethod('HIGH')).toBe('high');
        });

        it('should map numeric value 0 to "low"', () => {
            expect(callMethod('0')).toBe('low');
        });

        it('should map numeric value 33 to "low"', () => {
            expect(callMethod('33')).toBe('low');
        });

        it('should map numeric value 34 to "medium"', () => {
            expect(callMethod('34')).toBe('medium');
        });

        it('should map numeric value 66 to "medium"', () => {
            expect(callMethod('66')).toBe('medium');
        });

        it('should map numeric value 67 to "high"', () => {
            expect(callMethod('67')).toBe('high');
        });

        it('should map numeric value 100 to "high"', () => {
            expect(callMethod('100')).toBe('high');
        });

        it('should throw for invalid string values', () => {
            expect(() => callMethod('extreme')).toThrow('Invalid effortLevel: extreme');
        });
    });

    describe('ConvertMJToOpenAIRole', () => {
        it('should map "system" to "system"', () => {
            expect(instance.ConvertMJToOpenAIRole('system')).toBe('system');
        });

        it('should map "user" to "user"', () => {
            expect(instance.ConvertMJToOpenAIRole('user')).toBe('user');
        });

        it('should map "assistant" to "assistant"', () => {
            expect(instance.ConvertMJToOpenAIRole('assistant')).toBe('assistant');
        });

        it('should handle roles with whitespace', () => {
            expect(instance.ConvertMJToOpenAIRole('  system  ')).toBe('system');
        });

        it('should handle roles case-insensitively', () => {
            expect(instance.ConvertMJToOpenAIRole('SYSTEM')).toBe('system');
            expect(instance.ConvertMJToOpenAIRole('User')).toBe('user');
            expect(instance.ConvertMJToOpenAIRole('Assistant')).toBe('assistant');
        });

        it('should throw for unknown roles', () => {
            expect(() => instance.ConvertMJToOpenAIRole('unknown')).toThrow('Unknown role unknown');
        });
    });

    describe('ConvertMJToOpenAIChatMessages', () => {
        it('should convert a simple string message array', () => {
            const messages = [
                { role: ChatMessageRole.system, content: 'You are helpful' },
                { role: ChatMessageRole.user, content: 'Hello' },
                { role: ChatMessageRole.assistant, content: 'Hi there!' }
            ];
            const result = instance.ConvertMJToOpenAIChatMessages(messages);
            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({ role: 'system', content: 'You are helpful' });
            expect(result[1]).toEqual({ role: 'user', content: 'Hello' });
            expect(result[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
        });

        it('should convert multimodal content with text blocks', () => {
            const messages = [
                {
                    role: ChatMessageRole.user,
                    content: [
                        { type: 'text' as const, content: 'Describe this image' }
                    ]
                }
            ];
            const result = instance.ConvertMJToOpenAIChatMessages(messages);
            expect(result).toHaveLength(1);
            expect(Array.isArray(result[0].content)).toBe(true);
            const contentArray = result[0].content as Array<{ type: string; text?: string }>;
            expect(contentArray[0]).toEqual({ type: 'text', text: 'Describe this image' });
        });

        it('should convert multimodal content with image_url blocks', () => {
            const messages = [
                {
                    role: ChatMessageRole.user,
                    content: [
                        { type: 'text' as const, content: 'What is this?' },
                        { type: 'image_url' as const, content: 'https://example.com/img.png' }
                    ]
                }
            ];
            const result = instance.ConvertMJToOpenAIChatMessages(messages);
            expect(result).toHaveLength(1);
            const contentArray = result[0].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
            expect(contentArray).toHaveLength(2);
            expect(contentArray[0]).toEqual({ type: 'text', text: 'What is this?' });
            expect(contentArray[1]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/img.png' } });
        });

        it('should filter out unsupported content types', () => {
            const messages = [
                {
                    role: ChatMessageRole.user,
                    content: [
                        { type: 'text' as const, content: 'Hello' },
                        { type: 'video_url' as const, content: 'https://example.com/vid.mp4' }
                    ]
                }
            ];
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = instance.ConvertMJToOpenAIChatMessages(messages);
            const contentArray = result[0].content as Array<{ type: string }>;
            expect(contentArray).toHaveLength(1);
            expect(contentArray[0].type).toBe('text');
            consoleSpy.mockRestore();
        });

        it('should throw for unknown message roles', () => {
            const messages = [
                { role: 'unknown_role' as 'system', content: 'test' }
            ];
            expect(() => instance.ConvertMJToOpenAIChatMessages(messages)).toThrow();
        });
    });

    describe('resetStreamingState', () => {
        it('should reset all streaming state fields', () => {
            // Access private method
            const resetMethod = (instance as ReturnType<typeof Object.create>)['resetStreamingState'].bind(instance);
            const getState = () => (instance as ReturnType<typeof Object.create>)['_streamingState'];

            // Modify the state first
            const state = getState();
            state.accumulatedThinking = 'some thinking';
            state.inThinkingBlock = true;
            state.pendingContent = 'some content';
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
});
