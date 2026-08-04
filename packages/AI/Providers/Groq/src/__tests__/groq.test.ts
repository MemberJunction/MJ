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

// Stand-in for the SDK's abort error class
const MockAPIUserAbortError = vi.hoisted(() => class MockAPIUserAbortError extends Error {
    constructor() {
        super('Request was aborted.');
        this.name = 'APIUserAbortError';
    }
});

// Mock the groq-sdk
vi.mock('groq-sdk', () => ({
    default: MockGroq,
    APIUserAbortError: MockAPIUserAbortError
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

    describe('assistantPrefill', () => {
        const callNonStreaming = async (params: Record<string, unknown>): Promise<unknown> => {
            return (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion'].bind(instance)(params);
        };

        beforeEach(() => {
            mockCreate.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'response text' } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, queue_time: 0, prompt_time: 0, completion_time: 0 }
            });
        });

        it('should append an assistant message with prefill text when assistantPrefill is set', async () => {
            await callNonStreaming({
                model: 'llama-3.1-70b',
                messages: [
                    { role: ChatMessageRole.system, content: 'You are helpful' },
                    { role: ChatMessageRole.user, content: 'Hello' }
                ],
                assistantPrefill: 'Sure, here is'
            });

            const sentMessages = mockCreate.mock.calls[0][0].messages;
            expect(sentMessages).toHaveLength(3);
            expect(sentMessages[2]).toEqual({ role: 'assistant', content: 'Sure, here is' });
        });

        it('should NOT append a dummy OK user message when assistantPrefill is set and last message is from user', async () => {
            await callNonStreaming({
                model: 'llama-3.1-70b',
                messages: [
                    { role: ChatMessageRole.user, content: 'Hello' }
                ],
                assistantPrefill: 'Let me help'
            });

            const sentMessages = mockCreate.mock.calls[0][0].messages;
            // Should have original user message + assistant prefill, no dummy OK
            expect(sentMessages).toHaveLength(2);
            expect(sentMessages[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(sentMessages[1]).toEqual({ role: 'assistant', content: 'Let me help' });
        });

        it('should NOT append a dummy OK user message when assistantPrefill is set and last message is from assistant', async () => {
            await callNonStreaming({
                model: 'llama-3.1-70b',
                messages: [
                    { role: ChatMessageRole.user, content: 'Hello' },
                    { role: ChatMessageRole.assistant, content: 'Previous reply' }
                ],
                assistantPrefill: 'Continuing from'
            });

            const sentMessages = mockCreate.mock.calls[0][0].messages;
            // Should have original messages + assistant prefill, no dummy OK
            expect(sentMessages).toHaveLength(3);
            expect(sentMessages[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(sentMessages[1]).toEqual({ role: 'assistant', content: 'Previous reply' });
            expect(sentMessages[2]).toEqual({ role: 'assistant', content: 'Continuing from' });
        });

        it('should append dummy OK user message when assistantPrefill is NOT set and last message is not from user', async () => {
            await callNonStreaming({
                model: 'llama-3.1-70b',
                messages: [
                    { role: ChatMessageRole.user, content: 'Hello' },
                    { role: ChatMessageRole.assistant, content: 'Hi there' }
                ]
            });

            const sentMessages = mockCreate.mock.calls[0][0].messages;
            // Should have original messages + dummy OK user message
            expect(sentMessages).toHaveLength(3);
            expect(sentMessages[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(sentMessages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
            expect(sentMessages[2]).toEqual({ role: 'user', content: 'OK' });
        });

        it('should NOT append dummy OK user message when last message is already from user and no prefill', async () => {
            await callNonStreaming({
                model: 'llama-3.1-70b',
                messages: [
                    { role: ChatMessageRole.system, content: 'You are helpful' },
                    { role: ChatMessageRole.user, content: 'Hello' }
                ]
            });

            const sentMessages = mockCreate.mock.calls[0][0].messages;
            // Should have only the original messages, no extras
            expect(sentMessages).toHaveLength(2);
            expect(sentMessages[0]).toEqual({ role: 'system', content: 'You are helpful' });
            expect(sentMessages[1]).toEqual({ role: 'user', content: 'Hello' });
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

    describe('cancellationToken', () => {
        type CancellableResult = { success: boolean; statusText: string | null; errorMessage: string | null };

        const callNonStreaming = async (params: Record<string, unknown>): Promise<CancellableResult> => {
            return (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion'].bind(instance)(params) as Promise<CancellableResult>;
        };
        const callCreateStream = async (params: Record<string, unknown>): Promise<AsyncIterable<unknown>> => {
            return (instance as ReturnType<typeof Object.create>)['createStreamingRequest'].bind(instance)(params) as Promise<AsyncIterable<unknown>>;
        };
        const callFinalize = (content: string): CancellableResult => {
            return (instance as ReturnType<typeof Object.create>)['finalizeStreamingResponse'].bind(instance)(content, null, null) as CancellableResult;
        };

        const baseParams = (signal: AbortSignal) => ({
            model: 'llama-3.1-70b',
            messages: [{ role: ChatMessageRole.user, content: 'Hello' }],
            cancellationToken: signal
        });

        it('should forward the cancellation token to the SDK on the non-streaming path', async () => {
            mockCreate.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'hi' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
            });
            const controller = new AbortController();

            await callNonStreaming(baseParams(controller.signal));

            expect(mockCreate.mock.calls[0][1]).toEqual({ signal: controller.signal });
        });

        it('should return a cancelled result without calling the SDK when already aborted', async () => {
            const controller = new AbortController();
            controller.abort();

            const result = await callNonStreaming(baseParams(controller.signal));

            expect(mockCreate).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
        });

        it('should return a cancelled result when the SDK raises an abort error', async () => {
            mockCreate.mockRejectedValue(new MockAPIUserAbortError());

            const result = await callNonStreaming(baseParams(new AbortController().signal));

            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
        });

        it('should rethrow non-cancellation SDK errors on the non-streaming path', async () => {
            mockCreate.mockRejectedValue(new Error('boom'));

            await expect(callNonStreaming(baseParams(new AbortController().signal))).rejects.toThrow('boom');
        });

        it('should forward the cancellation token on the streaming path and report a mid-stream abort as cancelled', async () => {
            const controller = new AbortController();
            mockCreate.mockResolvedValue({
                async *[Symbol.asyncIterator]() {
                    yield { choices: [{ delta: { content: 'partial' } }] };
                    controller.abort();
                    throw new MockAPIUserAbortError();
                }
            });

            const stream = await callCreateStream(baseParams(controller.signal));
            expect(mockCreate.mock.calls[0][1]).toEqual({ signal: controller.signal });

            const chunks: unknown[] = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            expect(chunks).toHaveLength(1);
            const result = callFinalize('partial');
            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
        });
    });
});
