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

// Stand-in for the SDK's abort error class
const MockAPIUserAbortError = vi.hoisted(() => class MockAPIUserAbortError extends Error {
    constructor() {
        super('Request was aborted.');
        this.name = 'APIUserAbortError';
    }
});

// Mock the Cerebras SDK
vi.mock('@cerebras/cerebras_cloud_sdk', () => ({
    Cerebras: MockCerebras,
    APIUserAbortError: MockAPIUserAbortError
}));

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
    ToJSONSafe: (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v)))
}));

// Mock @memberjunction/ai
// Imported by PATH rather than through the package barrel: the barrel pulls in the whole AI
// surface (and @memberjunction/global, which is mocked here), while this module depends only
// on chat.types. The helpers are pure functions, so the real ones are what the driver should
// be tested against — a mocked copy would be the second implementation the shared module exists to prevent.
import * as actualToolMapping from '../../../../Core/src/generic/openAICompatibleTools';

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
        assistant: 'assistant' as const,
        tool: 'tool' as const
    };
    const toClassicChatMessageRole = (role: string): string => (role === 'tool' ? 'user' : role);
    class ChatParams {
        messages: Array<{ role: string; content: unknown }> = [];
        streaming?: boolean = false;
        effortLevel?: string;
        model: string = '';
    }
    return {
        // The OpenAI-shaped tool mapping is pure functions over plain data, and it lives in
        // @memberjunction/ai precisely so there is ONE implementation. Re-mocking it here would
        // recreate the drift the shared module exists to prevent, so use the real thing.
        buildOpenAICompatibleTools: actualToolMapping.buildOpenAICompatibleTools,
        buildOpenAICompatibleToolChoice: actualToolMapping.buildOpenAICompatibleToolChoice,
        buildOpenAICompatibleToolCalls: actualToolMapping.buildOpenAICompatibleToolCalls,
        buildOpenAICompatibleToolResults: actualToolMapping.buildOpenAICompatibleToolResults,
        extractOpenAICompatibleToolCalls: actualToolMapping.extractOpenAICompatibleToolCalls,
        BaseLLM,
        ModelUsage,
        ChatResult,
        ChatMessageRole,
        toClassicChatMessageRole,
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

    /**
     * The `tools` × `response_format` conflict: Cerebras answers
     * 400 `"tools" is incompatible with "response_format"`.
     * Native tool calling on GPT-OSS-120B/Cerebras is unusable without this, and the failure is
     * silent in unit terms — the request looks perfectly well formed right up to the API.
     */
    describe('response_format vs tools', () => {
        const callNonStreaming = (params: Record<string, unknown>): Promise<unknown> => {
            return (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']
                .bind(instance)(params) as Promise<unknown>;
        };
        const callCreateStream = (params: Record<string, unknown>): Promise<unknown> => {
            return (instance as ReturnType<typeof Object.create>)['createStreamingRequest']
                .bind(instance)(params) as Promise<unknown>;
        };
        const sentBody = (): Record<string, unknown> => mockCreate.mock.calls[0][0] as Record<string, unknown>;

        const tool = {
            name: 'get_weather',
            description: 'Look up the weather',
            parametersSchema: { type: 'object', properties: {} }
        };

        beforeEach(() => {
            mockCreate.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'stop', index: 0 }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
            });
        });

        it('sends response_format when no tools are declared', async () => {
            await callNonStreaming({ model: 'gpt-oss-120b', messages: [], responseFormat: 'JSON' });
            expect(sentBody().response_format).toEqual({ type: 'json_object' });
        });

        it('drops response_format when tools are declared', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await callNonStreaming({ model: 'gpt-oss-120b', messages: [], responseFormat: 'JSON', tools: [tool] });

            expect(sentBody().response_format).toBeUndefined();
            expect(sentBody().tools).toBeDefined();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('response_format'));
            warn.mockRestore();
        });

        it('drops a ModelSpecific response_format too', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await callNonStreaming({
                model: 'gpt-oss-120b',
                messages: [],
                responseFormat: 'ModelSpecific',
                modelSpecificResponseFormat: { type: 'json_schema' },
                tools: [tool]
            });

            expect(sentBody().response_format).toBeUndefined();
            warn.mockRestore();
        });

        it('applies the same rule on the streaming path', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await callCreateStream({ model: 'gpt-oss-120b', messages: [], responseFormat: 'JSON', tools: [tool] });

            expect(sentBody().response_format).toBeUndefined();
            expect(sentBody().tools).toBeDefined();
            warn.mockRestore();
        });

        it('stays silent for a format that was never going to be sent', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

            await callNonStreaming({ model: 'gpt-oss-120b', messages: [], responseFormat: 'Text', tools: [tool] });

            expect(sentBody().response_format).toBeUndefined();
            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        });
    });

    describe('cancellationToken', () => {
        type CancellableResult = { success: boolean; statusText: string | null };

        const callNonStreaming = (params: Record<string, unknown>): Promise<CancellableResult> => {
            return (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']
                .bind(instance)(params) as Promise<CancellableResult>;
        };
        const callCreateStream = (params: Record<string, unknown>): Promise<AsyncIterable<unknown>> => {
            return (instance as ReturnType<typeof Object.create>)['createStreamingRequest']
                .bind(instance)(params) as Promise<AsyncIterable<unknown>>;
        };
        const callFinalize = (content: string): CancellableResult => {
            return (instance as ReturnType<typeof Object.create>)['finalizeStreamingResponse']
                .bind(instance)(content, null, null) as CancellableResult;
        };

        const baseParams = (signal: AbortSignal) => ({
            model: 'llama3.1-8b',
            messages: [{ role: 'user', content: 'Hello' }],
            cancellationToken: signal
        });

        it('should forward the cancellation token to the SDK on the non-streaming path', async () => {
            mockCreate.mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop', index: 0 }],
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

        it('should report a mid-stream abort as a cancellation', async () => {
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
