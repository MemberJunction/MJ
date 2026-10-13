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

// Mirror of the SDK's typed abort error (thrown when a request's AbortSignal fires)
const MockAPIUserAbortError = vi.hoisted(() => class APIUserAbortError extends Error {
    constructor(message: string = 'Request was aborted.') {
        super(message);
        this.name = 'APIUserAbortError';
    }
});

// Mock the openai SDK
vi.mock('openai', () => ({
    OpenAI: MockOpenAI,
    APIUserAbortError: MockAPIUserAbortError
}));

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
    ToJSONSafe: (value: unknown) => value
}));

// Mock @memberjunction/ai - provide the classes and constants the provider imports
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
        ChatParams,
        ChatMessage: {} as unknown,
        ChatToolCall: {} as unknown,
        CHAT_FINISH_REASON_TOOL_CALLS: 'tool_calls',
        getToolResultBlocks: (content: unknown) =>
            Array.isArray(content) ? content.filter((b: { type: string }) => b.type === 'tool_result') : [],
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
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';

/**
 * Typed view of the protected members exercised by the cancellation tests — avoids `any`
 * while still reaching the driver's internals.
 */
type OpenAILLMInternals = {
    buildRequestOptions(params: ChatParams): { signal?: AbortSignal };
    isCancellationError(error: unknown, cancellationToken?: AbortSignal): boolean;
    nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult>;
    createStreamingRequest(params: ChatParams): Promise<unknown>;
    finalizeStreamingResponse(content: string | null, lastChunk: unknown, usage: unknown): ChatResult;
};

/** Build a minimal ChatParams, optionally carrying a cancellation token. */
function buildChatParams(cancellationToken?: AbortSignal): ChatParams {
    const params = new ChatParams();
    params.model = 'gpt-4o';
    params.messages = [{ role: ChatMessageRole.user, content: 'hello' }];
    params.cancellationToken = cancellationToken;
    return params;
}

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

    describe('getProviderRequestExtras', () => {
        const callMethod = (): Record<string, unknown> =>
            (instance as ReturnType<typeof Object.create>)['getProviderRequestExtras']({});

        it('returns no extras for plain OpenAI (subclasses override to add provider params)', () => {
            expect(callMethod()).toEqual({});
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
        const callMethod = (effortLevel: string): string => {
            return (instance as ReturnType<typeof Object.create>)['getReasoningLevel'](effortLevel);
        };
        const clamp = (level: string): string => {
            return (instance as ReturnType<typeof Object.create>)['clampToSystemPromptLevel'](level);
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

        // 'xhigh' and 'none' are real OpenAI values that used to throw here. They are reachable
        // ONLY by name: the numeric 1-100 scale is a cross-provider convention shared with the
        // Groq and Cerebras drivers, so its bands stay put and these two sit outside them.
        it('should pass through "xhigh" — above the numeric scale', () => {
            expect(callMethod('xhigh')).toBe('xhigh');
            expect(callMethod('XHigh')).toBe('xhigh');
        });

        it('should pass through "none" — below the numeric scale', () => {
            expect(callMethod('none')).toBe('none');
        });

        it('should NOT reach xhigh from any numeric value', () => {
            // Re-banding 1-100 to make room for xhigh would silently reclassify every documented
            // `effortLevel: 85`, and would mean something different on each provider.
            for (const n of ['67', '85', '99', '100']) {
                expect(callMethod(n)).toBe('high');
            }
        });

        it('should name the accepted values when rejecting', () => {
            expect(() => callMethod('extreme')).toThrow(/none, low, medium, high, xhigh/);
        });

        // The GPT-OSS path writes `Reasoning: <level>` into the system prompt; harmony defines
        // only three levels, so the two outside them must collapse to the nearest real one.
        it('should clamp xhigh/none for the GPT-OSS system-prompt channel', () => {
            expect(clamp('xhigh')).toBe('high');
            expect(clamp('none')).toBe('low');
            expect(clamp('medium')).toBe('medium');
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

    describe('cancellation (ChatParams.cancellationToken)', () => {
        let internals: OpenAILLMInternals;

        beforeEach(() => {
            internals = instance as unknown as OpenAILLMInternals;
        });

        it('buildRequestOptions returns an empty object when no token is supplied', () => {
            expect(internals.buildRequestOptions(buildChatParams())).toEqual({});
        });

        it('buildRequestOptions forwards the token as the SDK `signal` request option', () => {
            const controller = new AbortController();
            expect(internals.buildRequestOptions(buildChatParams(controller.signal))).toEqual({
                signal: controller.signal
            });
        });

        it('passes the signal to the SDK on the non-streaming path', async () => {
            const controller = new AbortController();
            mockCreate.mockResolvedValueOnce({
                choices: [{ message: { content: 'hi' }, finish_reason: 'stop', index: 0 }],
                usage: { prompt_tokens: 5, completion_tokens: 2 },
                model: 'gpt-4o'
            });

            await internals.nonStreamingChatCompletion(buildChatParams(controller.signal));

            expect(mockCreate).toHaveBeenCalledWith(expect.anything(), { signal: controller.signal });
        });

        it('passes the signal to the SDK on the streaming path', async () => {
            const controller = new AbortController();
            mockCreate.mockResolvedValueOnce({});

            await internals.createStreamingRequest(buildChatParams(controller.signal));

            expect(mockCreate).toHaveBeenCalledWith(expect.anything(), { signal: controller.signal });
        });

        it('returns a clean, non-failover-able failure when the non-streaming request is aborted', async () => {
            const controller = new AbortController();
            mockCreate.mockRejectedValueOnce(new MockAPIUserAbortError());
            controller.abort();

            const result = await internals.nonStreamingChatCompletion(buildChatParams(controller.signal));

            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
            expect(result.errorMessage).toBe('Request was aborted.');
            expect(result.errorInfo?.severity).toBe('Fatal');
            expect(result.errorInfo?.canFailover).toBe(false);
            expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
        });

        it('rethrows non-cancellation errors from the non-streaming path', async () => {
            mockCreate.mockRejectedValueOnce(new Error('boom'));
            await expect(internals.nonStreamingChatCompletion(buildChatParams())).rejects.toThrow('boom');
        });

        it('identifies SDK abort errors and already-aborted tokens as cancellations', () => {
            const controller = new AbortController();
            controller.abort();
            expect(internals.isCancellationError(new MockAPIUserAbortError())).toBe(true);
            expect(internals.isCancellationError(new Error('nope'), controller.signal)).toBe(true);
            expect(internals.isCancellationError(new Error('nope'))).toBe(false);
        });

        it('finalizes an aborted stream as a cancelled result rather than a truncated success', async () => {
            const controller = new AbortController();
            mockCreate.mockResolvedValueOnce({});

            await internals.createStreamingRequest(buildChatParams(controller.signal));
            controller.abort();

            const result = internals.finalizeStreamingResponse('partial content', null, null);
            expect(result.success).toBe(false);
            expect(result.statusText).toBe('cancelled');
            expect(result.errorInfo?.canFailover).toBe(false);
        });

        it('finalizes a normal stream as a success', async () => {
            mockCreate.mockResolvedValueOnce({});
            await internals.createStreamingRequest(buildChatParams());

            const result = internals.finalizeStreamingResponse('all done', null, null);
            expect(result.success).toBe(true);
            expect(result.statusText).toBe('success');
        });
    });
});

// =============================================================================
// Native tool calling — request mapping + response normalization (plan §5)
// =============================================================================

describe('OpenAILLM — native tool calling', () => {
    let instance: OpenAILLM;

    /** Points the mocked SDK at one canned completion, REPLACING any previous stub. */
    const stubResponse = (choice: Record<string, unknown>): void => {
        mockCreate.mockResolvedValue({
            choices: [{ index: 0, finish_reason: 'stop', ...choice }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
            model: 'gpt-4o'
        });
    };

    /** Invokes the protected driver entry point the way the base class would. */
    const run = async (params: Record<string, unknown>): Promise<Record<string, unknown>> =>
        (instance as ReturnType<typeof Object.create>)['nonStreamingChatCompletion']({
            model: 'gpt-4o',
            ...params
        });

    /** The request body the driver handed the SDK. */
    const sentRequest = (): Record<string, unknown> => mockCreate.mock.calls[0][0];

    const WEATHER_TOOL = {
        name: 'get_weather',
        description: 'Call this when the user asks about weather.',
        inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        instance = new OpenAILLM('test-api-key');
        stubResponse({ message: { role: 'assistant', content: 'hello' } });
    });

    it('declares SupportsTools', () => {
        expect(instance.SupportsTools).toBe(true);
    });

    describe('request mapping', () => {
        it("maps tool declarations onto OpenAI's function-tool shape", async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'weather?' }], tools: [WEATHER_TOOL] });

            expect(sentRequest().tools).toEqual([{
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Call this when the user asks about weather.',
                    parameters: WEATHER_TOOL.inputSchema
                }
            }]);
        });

        it('sends no tool fields when the caller declares none', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'hi' }] });

            expect(sentRequest().tools).toBeUndefined();
            expect(sentRequest().tool_choice).toBeUndefined();
        });

        it.each(['auto', 'none', 'required'])("passes the string toolChoice '%s' straight through", async (choice) => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], toolChoice: choice });

            expect(sentRequest().tool_choice).toBe(choice);
        });

        it('reshapes a named tool choice into the function form', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], toolChoice: { name: 'get_weather' } });

            expect(sentRequest().tool_choice).toEqual({ type: 'function', function: { name: 'get_weather' } });
        });

        it('maps parallelToolCalls onto the top-level request field', async () => {
            await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL], parallelToolCalls: false });

            expect(sentRequest().parallel_tool_calls).toBe(false);
        });
    });

    describe('conversation round-tripping (§5.3)', () => {
        it('replays a prior assistant turn with tool_calls, stringifying the arguments', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.user, content: 'weather?' },
                    { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: { city: 'NYC' } }] },
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: '72F', toolCallId: 'call_1' }] }
                ],
                tools: [WEATHER_TOOL]
            });

            const messages = sentRequest().messages as Array<Record<string, unknown>>;
            expect(messages[1]).toMatchObject({
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }]
            });
        });

        it('expands one tool turn into one OpenAI tool message per result', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'call_1', name: 'a', arguments: {} }, { id: 'call_2', name: 'b', arguments: {} }] },
                    {
                        role: ChatMessageRole.tool,
                        content: [
                            { type: 'tool_result', content: '72F', toolCallId: 'call_1' },
                            { type: 'tool_result', content: '10:30', toolCallId: 'call_2' }
                        ]
                    }
                ],
                tools: [WEATHER_TOOL]
            });

            const messages = sentRequest().messages as Array<Record<string, unknown>>;
            expect(messages).toHaveLength(3);
            expect(messages[1]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '72F' });
            expect(messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_2', content: '10:30' });
        });

        it('marks a failed result in the text, since OpenAI has no error flag', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: 'boom', toolCallId: 'call_1', isError: true }] }
                ]
            });

            const messages = sentRequest().messages as Array<Record<string, unknown>>;
            expect(messages[0].content).toBe('ERROR: boom');
        });

        it('keeps assistant prose alongside tool_calls when the model produced both', async () => {
            await run({
                messages: [
                    { role: ChatMessageRole.assistant, content: 'Let me check.', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {} }] }
                ]
            });

            const messages = sentRequest().messages as Array<Record<string, unknown>>;
            expect(messages[0].content).toBe('Let me check.');
            expect(messages[0].tool_calls).toHaveLength(1);
        });
    });

    describe('response normalization (§5.2)', () => {
        it('parses the JSON-string arguments into an object', async () => {
            stubResponse({
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } }]
                },
                finish_reason: 'tool_calls'
            });

            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL] });

            expect(result.data.choices[0].message.toolCalls).toEqual([
                { id: 'call_1', name: 'get_weather', arguments: { city: 'NYC' } }
            ]);
            expect(result.data.choices[0].finish_reason).toBe('tool_calls');
        });

        it('surfaces a call with malformed arguments rather than dropping it', async () => {
            stubResponse({
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{not json' } }]
                },
                finish_reason: 'tool_calls'
            });

            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }], tools: [WEATHER_TOOL] });

            expect(result.data.choices[0].message.toolCalls).toEqual([
                { id: 'call_1', name: 'get_weather', arguments: {} }
            ]);
        });

        it('leaves toolCalls undefined and finish_reason untouched on an ordinary turn', async () => {
            const result = await run({ messages: [{ role: ChatMessageRole.user, content: 'x' }] });

            expect(result.data.choices[0].message.toolCalls).toBeUndefined();
            expect(result.data.choices[0].finish_reason).toBe('stop');
        });
    });
});
