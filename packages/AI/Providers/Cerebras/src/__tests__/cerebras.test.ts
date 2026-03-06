import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables
const mockCreate = vi.hoisted(() => vi.fn());
const MockCerebras = vi.hoisted(() => vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.chat = {
        completions: {
            create: mockCreate
        }
    };
}));

// Mock the Cerebras SDK
vi.mock('@cerebras/cerebras_cloud_sdk', () => ({
    Cerebras: MockCerebras
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
        SummarizeParams: ChatParams,
        SummarizeResult: class {},
        ClassifyParams: ChatParams,
        ClassifyResult: class {}
    };
});

import { CerebrasLLM } from '../models/cerebras';

describe('CerebrasLLM', () => {
    let instance: CerebrasLLM;

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new CerebrasLLM('test-api-key');
    });

    describe('Constructor', () => {
        it('should create an instance with an apiKey', () => {
            expect(instance).toBeInstanceOf(CerebrasLLM);
            expect(MockCerebras).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
        });

        it('should expose the Cerebras client via getters', () => {
            expect(instance.CerebrasClient).toBeDefined();
            expect(instance.client).toBeDefined();
            expect(instance.client).toBe(instance.CerebrasClient);
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

    describe('setCerebrasParamsEffortLevel', () => {
        const callMethod = (cerebrasParams: Record<string, unknown>, params: { effortLevel?: string; model: string }): void => {
            (instance as ReturnType<typeof Object.create>)['setCerebrasParamsEffortLevel'](cerebrasParams, params);
        };

        describe('GPT-OSS models', () => {
            it('should map numeric 0 to "low"', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '0', model: 'gpt-oss-v1' });
                expect(params.reasoning_effort).toBe('low');
            });

            it('should map numeric 33 to "low"', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '33', model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBe('low');
            });

            it('should map numeric 34 to "medium"', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '34', model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBe('medium');
            });

            it('should map numeric 66 to "medium"', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '66', model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBe('medium');
            });

            it('should map numeric 67 to "high"', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '67', model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBe('high');
            });

            it('should map numeric 100 to "high"', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '100', model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBe('high');
            });

            it('should pass through string effort levels for GPT-OSS', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: 'high', model: 'gpt-oss-model' });
                expect(params.reasoning_effort).toBe('high');
            });
        });

        describe('Non-GPT-OSS models', () => {
            it('should not set reasoning_effort for llama models', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '50', model: 'llama-3.3-70b' });
                expect(params.reasoning_effort).toBeUndefined();
            });

            it('should not set reasoning_effort for other models', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: 'high', model: 'deepseek-r1' });
                expect(params.reasoning_effort).toBeUndefined();
            });
        });

        describe('No effort level', () => {
            it('should not set reasoning_effort when effortLevel is undefined', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: undefined, model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBeUndefined();
            });

            it('should not set reasoning_effort when effortLevel is empty string', () => {
                const params: Record<string, unknown> = {};
                callMethod(params, { effortLevel: '', model: 'gpt-oss-large' });
                expect(params.reasoning_effort).toBeUndefined();
            });
        });
    });

    describe('Thinking extraction logic', () => {
        // This tests the extractThinkingFromContent base class method
        // used by Cerebras in nonStreamingChatCompletion

        it('should extract thinking from <think> tags', () => {
            const extractMethod = (instance as ReturnType<typeof Object.create>)['extractThinkingFromContent'].bind(instance);
            const result = extractMethod('<think>Let me analyze this</think>The actual response');
            expect(result.thinking).toBe('Let me analyze this');
            expect(result.content).toBe('The actual response');
        });

        it('should return content unchanged when no thinking tags', () => {
            const extractMethod = (instance as ReturnType<typeof Object.create>)['extractThinkingFromContent'].bind(instance);
            const result = extractMethod('Just a regular response');
            expect(result.thinking).toBeUndefined();
            expect(result.content).toBe('Just a regular response');
        });

        it('should handle empty content between think tags', () => {
            const extractMethod = (instance as ReturnType<typeof Object.create>)['extractThinkingFromContent'].bind(instance);
            const result = extractMethod('<think></think>Response here');
            expect(result.thinking).toBe('');
            expect(result.content).toBe('Response here');
        });

        it('should handle multiline thinking content', () => {
            const extractMethod = (instance as ReturnType<typeof Object.create>)['extractThinkingFromContent'].bind(instance);
            const result = extractMethod('<think>Line 1\nLine 2\nLine 3</think>Final answer');
            expect(result.thinking).toBe('Line 1\nLine 2\nLine 3');
            expect(result.content).toBe('Final answer');
        });
    });

    describe('processStreamingChunk', () => {
        const callMethod = (chunk: unknown): { content: string; finishReason?: string; usage: unknown } => {
            return (instance as ReturnType<typeof Object.create>)['processStreamingChunk'](chunk);
        };

        beforeEach(() => {
            // Initialize thinking stream state since supportsThinkingModels returns true
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();
        });

        it('should extract content from streaming chunk', () => {
            const chunk = {
                choices: [{
                    delta: { content: 'Hello from Cerebras' },
                    finish_reason: null
                }]
            };
            const result = callMethod(chunk);
            expect(result.content).toBe('Hello from Cerebras');
        });

        it('should detect finish reason', () => {
            const chunk = {
                choices: [{
                    delta: {},
                    finish_reason: 'stop'
                }]
            };
            const result = callMethod(chunk);
            expect(result.finishReason).toBe('stop');
        });

        it('should extract usage from final chunk', () => {
            const chunk = {
                choices: [{
                    delta: {},
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: 15,
                    completion_tokens: 25
                }
            };
            const result = callMethod(chunk);
            expect(result.usage).toBeDefined();
        });

        it('should return empty content for null chunk', () => {
            const result = callMethod(null);
            expect(result.content).toBe('');
        });

        it('should return empty content for chunk with no choices', () => {
            const result = callMethod({ choices: [] });
            expect(result.content).toBe('');
        });
    });

    describe('finalizeStreamingResponse', () => {
        const callMethod = (
            content: string | null | undefined,
            lastChunk: unknown,
            usage: unknown
        ): unknown => {
            return (instance as ReturnType<typeof Object.create>)['finalizeStreamingResponse'](content, lastChunk, usage);
        };

        it('should create a ChatResult with accumulated content', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();
            const result = callMethod('Final response text', null, null) as {
                data: { choices: Array<{ message: { content: string } }> };
                statusText: string;
            };
            expect(result.data.choices).toHaveLength(1);
            expect(result.data.choices[0].message.content).toBe('Final response text');
            expect(result.statusText).toBe('success');
        });

        it('should handle null content gracefully', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();
            const result = callMethod(null, null, null) as {
                data: { choices: Array<{ message: { content: string } }> };
            };
            expect(result.data.choices[0].message.content).toBe('');
        });

        it('should extract finish reason from lastChunk', () => {
            (instance as ReturnType<typeof Object.create>)['initializeThinkingStreamState']();
            const lastChunk = {
                choices: [{ finish_reason: 'length' }]
            };
            const result = callMethod('text', lastChunk, null) as {
                data: { choices: Array<{ finish_reason: string }> };
            };
            expect(result.data.choices[0].finish_reason).toBe('length');
        });
    });
});
