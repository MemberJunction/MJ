import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables
const mockCreate = vi.hoisted(() => vi.fn());
const MockGroq = vi.hoisted(() => vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.chat = {
        completions: {
            create: mockCreate
        }
    };
}));

// Mock the groq-sdk
vi.mock('groq-sdk', () => ({
    default: MockGroq
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
        protected thinkingStreamState: {
            accumulatedThinking: string;
            inThinkingBlock: boolean;
            pendingContent: string;
            thinkingComplete: boolean;
        } | null = null;
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
        protected initializeThinkingStreamState(): void {
            this.thinkingStreamState = {
                accumulatedThinking: '',
                inThinkingBlock: false,
                pendingContent: '',
                thinkingComplete: false
            };
        }
        protected processStreamChunkWithThinking(rawContent: string): string {
            if (!this.thinkingStreamState) return rawContent;
            return rawContent;
        }
        protected addThinkingToMessage(
            message: { role: string; content: string },
            thinking: string | undefined
        ): { role: string; content: string; thinking?: string } {
            if (thinking) {
                return { ...message, thinking };
            }
            return message;
        }
    }
    class ModelUsage {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        queueTime?: number;
        promptTime?: number;
        completionTime?: number;
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
        ChatMessageContentBlock: {} as unknown,
        SummarizeParams: ChatParams,
        SummarizeResult: class {},
        ClassifyParams: ChatParams,
        ClassifyResult: class {},
        ErrorAnalyzer: { analyzeError: vi.fn() }
    };
});

import { GroqLLM } from '../models/groq';
import { ChatMessageRole } from '@memberjunction/ai';

describe('GroqLLM', () => {
    let instance: GroqLLM;

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new GroqLLM('test-api-key');
    });

    describe('Constructor', () => {
        it('should create an instance with an apiKey', () => {
            expect(instance).toBeInstanceOf(GroqLLM);
            expect(MockGroq).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
        });

        it('should expose the Groq client via getters', () => {
            expect(instance.GroqClient).toBeDefined();
            expect(instance.client).toBeDefined();
            expect(instance.client).toBe(instance.GroqClient);
        });
    });

    describe('SupportsStreaming', () => {
        it('should return true', () => {
            expect(instance.SupportsStreaming).toBe(true);
        });
    });

    describe('supportsThinkingModels', () => {
        it('should return true', () => {
            const result = (instance as ReturnType<typeof Object.create>)['supportsThinkingModels']();
            expect(result).toBe(true);
        });
    });

    describe('setGroqParamsEffortLevel', () => {
        const callMethod = (groqParams: Record<string, unknown>, params: { effortLevel?: string; model: string }): void => {
            (instance as ReturnType<typeof Object.create>)['setGroqParamsEffortLevel'](groqParams, params);
        };

        describe('GPT-OSS models', () => {
            it('should map numeric 0 to "low"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '0', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBe('low');
            });

            it('should map numeric 33 to "low"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '33', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBe('low');
            });

            it('should map numeric 34 to "medium"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '34', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBe('medium');
            });

            it('should map numeric 66 to "medium"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '66', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBe('medium');
            });

            it('should map numeric 67 to "high"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '67', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBe('high');
            });

            it('should map numeric 100 to "high"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '100', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBe('high');
            });

            it('should pass through string effort levels for GPT-OSS', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: 'medium', model: 'gpt-oss-model' });
                expect(groqParams.reasoning_effort).toBe('medium');
            });
        });

        describe('Qwen models', () => {
            it('should map numeric 0 to "none"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '0', model: 'qwen-2.5-72b' });
                expect(groqParams.reasoning_effort).toBe('none');
            });

            it('should map non-zero numeric to "default"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '50', model: 'qwen-model' });
                expect(groqParams.reasoning_effort).toBe('default');
            });

            it('should keep "default" string value as "default"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: 'default', model: 'qwen-large' });
                expect(groqParams.reasoning_effort).toBe('default');
            });

            it('should map non-numeric, non-default string to "none"', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: 'low', model: 'qwen-7b' });
                expect(groqParams.reasoning_effort).toBe('none');
            });
        });

        describe('Other models', () => {
            it('should not set reasoning_effort for non-GPT-OSS and non-Qwen models', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '50', model: 'llama-3.1-70b' });
                expect(groqParams.reasoning_effort).toBeUndefined();
            });

            it('should not set reasoning_effort for mixtral models', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: 'high', model: 'mixtral-8x7b' });
                expect(groqParams.reasoning_effort).toBeUndefined();
            });
        });

        describe('No effort level', () => {
            it('should not set reasoning_effort when effortLevel is undefined', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: undefined, model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBeUndefined();
            });

            it('should not set reasoning_effort when effortLevel is empty string', () => {
                const groqParams: Record<string, unknown> = {};
                callMethod(groqParams, { effortLevel: '', model: 'gpt-oss-large' });
                expect(groqParams.reasoning_effort).toBeUndefined();
            });
        });
    });

    describe('convertToGroqMessages', () => {
        const callMethod = (messages: Array<{ role: string; content: unknown }>): unknown[] => {
            return (instance as ReturnType<typeof Object.create>)['convertToGroqMessages'](messages);
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

        it('should convert multimodal content blocks', () => {
            const messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', content: 'What is this?' },
                        { type: 'image_url', content: 'https://example.com/img.png' }
                    ]
                }
            ];
            const result = callMethod(messages) as Array<{ role: string; content: unknown }>;
            expect(result).toHaveLength(1);
            const content = result[0].content as Array<{ type: string }>;
            expect(content).toHaveLength(2);
            expect(content[0]).toEqual({ type: 'text', text: 'What is this?' });
            expect(content[1]).toEqual({ type: 'image_url', image_url: { url: 'https://example.com/img.png' } });
        });
    });
});
