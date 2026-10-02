/**
 * Layer 3/4 wiring on the REAL AIPromptRunner: does the gate's decision actually reach the outgoing
 * `ChatParams`, is the mode recorded for the prompt run, and does a tools-specific failure — and
 * only a tools-specific failure — trigger the single envelope retry?
 *
 * The gate's own decision table is covered in nativeToolCallingGate.test.ts. This file covers the
 * seams the gate cannot: reading the model/vendor catalog through AIEngine, resolving the model
 * VENDOR ROW from the vendor id the runner threads around, and classifying provider failures.
 *
 * Only the AIEngine catalog boundary is mocked; the runner's own methods are the real ones.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIModelConfiguration, ChatParams, ChatResult } from '@memberjunction/ai';

/** The catalog configuration the mocked engine will return, swapped per test. */
const engineState: {
    configuration: AIModelConfiguration | null;
    lastCall?: { modelID: string; vendorRowID?: string };
} = { configuration: null };

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                // Keyed on TypeID, as AIEngineBase does. Referenced lazily from inside the method
                // body, so the constants below are initialized by the time a test calls it.
                IsInferenceProvider(mv: { TypeID?: string }) {
                    return mv?.TypeID === INFERENCE_TYPE_ID;
                },
                GetEffectiveModelConfiguration(modelID: string, vendorRowID?: string) {
                    engineState.lastCall = { modelID, vendorRowID };
                    return engineState.configuration;
                }
            }
        }
    };
});

import { AIPromptRunner } from '../AIPromptRunner';
import { GetToolCallingMode, GetToolCallingDecision } from '../nativeToolCallingGate';

const VENDOR_ID = 'A1111111-1111-1111-1111-111111111111';
const VENDOR_ROW_ID = 'B2222222-2222-2222-2222-222222222222';
const DEVELOPER_ROW_ID = 'D4444444-4444-4444-4444-444444444444';
const INFERENCE_TYPE_ID = 'E5555555-5555-5555-5555-555555555555';
const DEVELOPER_TYPE_ID = 'F6666666-6666-6666-6666-666666666666';

type RunnerInternals = {
    applyNativeToolCalling(
        chatParams: ChatParams,
        prompt: unknown,
        params: unknown,
        model: unknown,
        vendorId: string | null,
        promptModelConfiguration?: unknown
    ): void;
    isToolSpecificFailure(result: ChatResult): boolean;
    isToolSpecificFailureText(text: string): boolean;
};
const priv = (r: AIPromptRunner): RunnerInternals => r as unknown as RunnerInternals;

const model = () => ({
    ID: 'C3333333-3333-3333-3333-333333333333',
    Name: 'Test Model',
    // Mirrors the real catalog: 148 of 193 shipped models carry TWO rows for the same VendorID,
    // with the Model Developer row listed FIRST. ModelVendors has no guaranteed order, so the gate
    // has to select the Inference Provider row rather than trusting position.
    ModelVendors: [
        { ID: DEVELOPER_ROW_ID, VendorID: VENDOR_ID, Status: 'Active', TypeID: DEVELOPER_TYPE_ID },
        { ID: VENDOR_ROW_ID, VendorID: VENDOR_ID, Status: 'Active', TypeID: INFERENCE_TYPE_ID }
    ]
});

const prompt = (useNative?: boolean) => ({
    Name: 'Test Prompt',
    PromptConfigurationObject: useNative === undefined ? null : { LLM: { UseNativeToolCalling: useNative } }
});

const WEATHER_TOOL = { name: 'get_weather', inputSchema: { type: 'object' } };

const failedResult = (errorMessage: string): ChatResult => {
    const r = new ChatResult(false, new Date(), new Date());
    r.data = { choices: [], usage: undefined as never };
    r.statusText = 'error';
    r.errorMessage = errorMessage;
    return r;
};

let runner: AIPromptRunner;
beforeEach(() => {
    runner = new AIPromptRunner();
    engineState.configuration = null;
    engineState.lastCall = undefined;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('applyNativeToolCalling — filling the outgoing request', () => {
    it('copies tools, choice and parallelism onto ChatParams when the gate opens', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true } };
        const chatParams = new ChatParams();

        priv(runner).applyNativeToolCalling(
            chatParams,
            prompt(true),
            { tools: [WEATHER_TOOL], toolChoice: 'required', parallelToolCalls: false },
            model(),
            VENDOR_ID
        );

        expect(chatParams.tools).toEqual([WEATHER_TOOL]);
        expect(chatParams.toolChoice).toBe('required');
        expect(chatParams.parallelToolCalls).toBe(false);
        expect(GetToolCallingMode(chatParams)).toBe('Native');
    });

    it('keeps control tools and records NativeImplicit when the catalog asks for implicit control flow', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true, NativeControlFlow: 'implicit' } };
        const chatParams = new ChatParams();
        const tools = [{ name: 'run_ad_hoc_query', description: 'x', inputSchema: { type: 'object' } }, { name: 'ask_user', description: 'y', inputSchema: { type: 'object' } }];
        priv(runner).applyNativeToolCalling(chatParams, prompt(), { tools, controlFlowToolNames: ['ask_user'] }, model(), VENDOR_ID);
        expect(chatParams.tools?.map((t) => t.name)).toEqual(['run_ad_hoc_query', 'ask_user']);
        expect(GetToolCallingMode(chatParams)).toBe('NativeImplicit');
    });

    it('records toolResults from the catalog alongside the mode', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true, NativeToolResults: true } };
        const chatParams = new ChatParams();
        priv(runner).applyNativeToolCalling(chatParams, prompt(), { tools: [WEATHER_TOOL] }, model(), VENDOR_ID);
        expect(GetToolCallingDecision(chatParams)).toMatchObject({ mode: 'Native', toolResults: true });
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true } };
        const again = new ChatParams();
        priv(runner).applyNativeToolCalling(again, prompt(), { tools: [WEATHER_TOOL] }, model(), VENDOR_ID);
        expect(GetToolCallingDecision(again)?.toolResults).toBe(false);
    });

    it('strips control tools and records Native for a hybrid model', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true } };
        const chatParams = new ChatParams();
        const tools = [{ name: 'run_ad_hoc_query', description: 'x', inputSchema: { type: 'object' } }, { name: 'ask_user', description: 'y', inputSchema: { type: 'object' } }];
        priv(runner).applyNativeToolCalling(chatParams, prompt(), { tools, controlFlowToolNames: ['ask_user'] }, model(), VENDOR_ID);
        expect(chatParams.tools?.map((t) => t.name)).toEqual(['run_ad_hoc_query']);
        expect(GetToolCallingMode(chatParams)).toBe('Native');
    });

    it('an orchestrator with only control tools sends nothing on a hybrid model (Envelope)', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true } };
        const chatParams = new ChatParams();
        const tools = [{ name: 'delegate_to_copywriter_agent', description: 'x', inputSchema: { type: 'object' } }, { name: 'ask_user', description: 'y', inputSchema: { type: 'object' } }];
        priv(runner).applyNativeToolCalling(chatParams, prompt(), { tools, controlFlowToolNames: tools.map((t) => t.name) }, model(), VENDOR_ID);
        expect(chatParams.tools).toBeUndefined();
        expect(GetToolCallingMode(chatParams)).toBe('Envelope');
    });

    it('leaves the request untouched when capability refuses, and records Envelope', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: false } };
        const chatParams = new ChatParams();

        priv(runner).applyNativeToolCalling(
            chatParams, prompt(true), { tools: [WEATHER_TOOL] }, model(), VENDOR_ID
        );

        expect(chatParams.tools).toBeUndefined();
        expect(GetToolCallingMode(chatParams)).toBe('Envelope');
        expect(console.warn).toHaveBeenCalled();
    });

    it('records Envelope and sends nothing when the prompt never opts in', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true } };
        const chatParams = new ChatParams();

        priv(runner).applyNativeToolCalling(
            chatParams, prompt(), { tools: [WEATHER_TOOL] }, model(), VENDOR_ID
        );

        expect(chatParams.tools).toBeUndefined();
        expect(GetToolCallingMode(chatParams)).toBe('Envelope');
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('resolves the model VENDOR ROW id, not the vendor id, for the catalog lookup', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true } };

        priv(runner).applyNativeToolCalling(
            new ChatParams(), prompt(true), { tools: [WEATHER_TOOL] }, model(), VENDOR_ID
        );

        expect(engineState.lastCall?.vendorRowID).toBe(VENDOR_ROW_ID);
        // Never the Model Developer row that precedes it — that row carries no ModelConfiguration,
        // so resolving it would silently drop every per-serving-path LLM.* knob, including the
        // SupportsNativeToolCalling kill switch the rollout depends on.
        expect(engineState.lastCall?.vendorRowID).not.toBe(DEVELOPER_ROW_ID);
    });

    it('ignores an inactive inference-provider row', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true } };
        const deactivated = {
            ...model(),
            ModelVendors: [{ ID: VENDOR_ROW_ID, VendorID: VENDOR_ID, Status: 'Inactive', TypeID: INFERENCE_TYPE_ID }]
        };

        priv(runner).applyNativeToolCalling(
            new ChatParams(), prompt(true), { tools: [WEATHER_TOOL] }, deactivated, VENDOR_ID
        );

        // No usable vendor row: the vendor layer is omitted rather than merged from a dead row.
        expect(engineState.lastCall?.vendorRowID).toBeUndefined();
    });

    it('omits the vendor layer entirely when no vendor was selected', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true } };

        priv(runner).applyNativeToolCalling(
            new ChatParams(), prompt(true), { tools: [WEATHER_TOOL] }, model(), null
        );

        expect(engineState.lastCall?.vendorRowID).toBeUndefined();
    });

    it('lets a prompt-model bag override the prompt bag', () => {
        engineState.configuration = { LLM: { SupportsNativeToolCalling: true } };
        const chatParams = new ChatParams();

        priv(runner).applyNativeToolCalling(
            chatParams,
            prompt(true),
            { tools: [WEATHER_TOOL] },
            model(),
            VENDOR_ID,
            { LLM: { UseNativeToolCalling: false } }
        );

        expect(chatParams.tools).toBeUndefined();
        expect(GetToolCallingMode(chatParams)).toBe('Envelope');
    });

    it('degrades to the envelope path instead of throwing when the catalog cannot be read', () => {
        // A run that would otherwise succeed must never be failed by the gate.
        const brokenModel = { ID: 'x', Name: 'Broken', get ModelVendors(): never { throw new Error('engine not loaded'); } };
        const chatParams = new ChatParams();

        expect(() => priv(runner).applyNativeToolCalling(
            chatParams, prompt(true), { tools: [WEATHER_TOOL] }, brokenModel, VENDOR_ID
        )).not.toThrow();

        expect(chatParams.tools).toBeUndefined();
        expect(GetToolCallingMode(chatParams)).toBe('Envelope');
    });
});

describe('isToolSpecificFailure — what earns the one envelope retry', () => {
    it('ignores a successful result', () => {
        const ok = new ChatResult(true, new Date(), new Date());
        expect(priv(runner).isToolSpecificFailure(ok)).toBe(false);
    });

    it.each([
        ['tools payload rejected', 'Invalid request: unexpected field `tools`'],
        ['tool_choice rejected', 'tool_choice: unsupported value'],
        ['Gemini malformed call', 'finishReason: MALFORMED_FUNCTION_CALL'],
        ['Anthropic schema rejection', 'tools.0.input_schema: invalid JSON Schema'],
        ['function-call wording', 'The model attempted a function call that could not be parsed']
    ])('retries on a tool-specific failure: %s', (_name, message) => {
        expect(priv(runner).isToolSpecificFailure(failedResult(message))).toBe(true);
    });

    it.each([
        ['rate limit', '429 Too Many Requests — rate limit exceeded'],
        ['context length', 'This model supports at most 8192 tokens'],
        ['network', 'socket hang up'],
        ['auth', '401 Unauthorized: invalid api key']
    ])('does NOT retry on an unrelated failure: %s', (_name, message) => {
        expect(priv(runner).isToolSpecificFailure(failedResult(message))).toBe(false);
    });

    it('never treats a cancellation as a tool failure', () => {
        const cancelled = failedResult('Request was aborted');
        cancelled.errorInfo = {
            errorType: 'Unknown',
            severity: 'Fatal',
            canFailover: false,
            providerErrorCode: 'request_cancelled',
            context: {},
            error: new Error('aborted')
        };
        expect(priv(runner).isToolSpecificFailure(cancelled)).toBe(false);
    });
});

/**
 * Not every provider reports a rejected tools payload as a failed result. OpenAI's SDK RAISES the
 * 400, so the returned-result check never runs and a native call that should degrade to the
 * envelope hard-fails the whole prompt instead. Observed on gpt-5.6-luna at xhigh:
 * `Function tools with reasoning_effort are not supported ... in /v1/chat/completions`.
 */
describe('isToolSpecificFailureText — the thrown-rejection path', () => {
    it.each([
        ['OpenAI tools+reasoning rejection', 'Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions.'],
        ['Cerebras format conflict', '"tools" is incompatible with "response_format"'],
        ['bare tools rejection', 'Unrecognized request argument supplied: tools']
    ])('recognizes %s', (_name, message) => {
        expect(priv(runner).isToolSpecificFailureText(message)).toBe(true);
    });

    it.each([
        ['rate limit', '429 Too Many Requests'],
        ['abort', 'Request was aborted.'],
        ['auth', '401 Incorrect API key provided']
    ])('leaves %s to the existing retry/failover machinery', (_name, message) => {
        expect(priv(runner).isToolSpecificFailureText(message)).toBe(false);
    });
});

/**
 * The envelope retry stripped the declarations but kept
 * the functionCall / tool_result turns, so the provider refused the retry for a second reason and
 * the loop burned its remaining attempts on the same request. The retry must see the history the
 * envelope path has always seen.
 */
describe('retryWithToolsStripped — the retry sees an envelope-shaped history', () => {
    type RetryInternals = {
        retryWithToolsStripped(
            llm: unknown,
            chatParams: ChatParams,
            bound: { Signal?: AbortSignal; TimeoutMS?: number; TimedOut: () => boolean; Dispose: () => void },
            model: unknown,
            vendorId: string | null,
            prompt: unknown,
            reason: string
        ): Promise<ChatResult>;
    };
    it('re-encodes tool turns as text, strips the declarations, and records the NativeFallback mode', async () => {
        const runner = new AIPromptRunner();
        let seen: ChatParams | undefined;
        const ok = new ChatResult(true, new Date(), new Date());
        ok.data = { choices: [{ message: { role: 'assistant', content: '{"taskComplete": true}' }, finish_reason: 'stop', index: 0 }], usage: undefined as never };
        const llm = { ChatCompletion: async (p: ChatParams) => { seen = p; return ok; } };
        const chatParams = new ChatParams();
        chatParams.messages = [
            { role: 'system', content: 'The whole task is in here.' },
            { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_entity_details', arguments: { entityName: 'Members' } }] },
            { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'call_1', toolName: 'get_entity_details', isError: false, content: '# Members' }] }
        ];
        chatParams.tools = [WEATHER_TOOL];
        chatParams.toolChoice = 'auto';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await (runner as unknown as RetryInternals).retryWithToolsStripped(
            llm, chatParams, { TimedOut: () => false, Dispose: () => undefined }, model(), VENDOR_ID, prompt(true), 'provider said no'
        );
        warn.mockRestore();
        expect(result).toBe(ok);
        expect(GetToolCallingMode(result)).toBe('NativeFallback');
        expect(seen?.tools).toBeUndefined();
        expect(seen?.toolChoice).toBeUndefined();
        expect(seen?.messages.map((m) => m.role)).toEqual(['system', 'user']);
        expect(seen?.messages[1].content).toBe('[Action Result] get_entity_details succeeded. # Members');
        expect(seen?.messages.some((m) => m.toolCalls || m.role === 'tool')).toBe(false);
    });
});
