/**
 * @fileoverview Shared native-tool-calling conformance suite for `BaseLLM` drivers.
 *
 * WHY THIS IS SEPARATE FROM `llm-conformance.ts`: that suite drives the streaming / cancellation /
 * failure template method, and adopting it requires scripting a vendor mock for all of those paths.
 * The tool-calling contract is independent of them and much cheaper to adopt, so it ships as its own
 * entry point — a driver can conform on tools without first conforming on streaming. Run both when
 * a provider has configs for both; they register separate `describe` blocks and do not interact.
 *
 * WHAT THIS ASSERTS — the parts of the tool contract that are the SAME for every provider, because
 * they live in `BaseLLM` and in the normalized `ChatResult` shape rather than in any SDK mapping:
 *
 *  - `SupportsTools` reports the driver's real capability (a CODE-level fact: "has the mapping been
 *    written?", distinct from the metadata capability flag `LLM.SupportsNativeToolCalling`).
 *  - A tool-call turn normalizes to `ChatCompletionMessage.toolCalls` with **parsed** arguments —
 *    never a JSON string, whatever the wire format was.
 *  - Such a turn reports `finish_reason === 'tool_calls'`.
 *  - Text and tool calls coexist: a turn carrying both surfaces both, and a turn carrying only
 *    calls is a SUCCESS with empty content — not a "no output from model" failure.
 *  - An ordinary turn is untouched: no `toolCalls`, and the driver's own finish reason preserved.
 *  - Streaming plus tools takes the non-streaming path and flags `streamingSuppressedForTools`
 *    (native tool calling is non-streaming only).
 *  - An orphaned tool result — one whose call was never declared by an earlier assistant turn —
 *    is rejected at the MJ boundary rather than at the provider.
 *
 * Provider-SPECIFIC request mapping (Anthropic `input_schema` vs OpenAI `parameters` vs Gemini
 * `parametersJsonSchema`; `tool_choice` vocabularies; how results are shaped into the history) stays
 * in each driver's own test file — there is no shared truth to assert about it.
 *
 * A driver that does NOT implement tools passes `SupportsTools: false` and gets the negative
 * contract asserted instead: it declares false, and declaring tools to it is harmless.
 *
 * HOW A PROVIDER PACKAGE USES IT:
 * ```ts
 * import { RunLLMToolCallingConformanceSuite } from '@memberjunction/unit-testing';
 *
 * RunLLMToolCallingConformanceSuite({
 *     ProviderName: 'MyProvider',
 *     CreateLLM: () => buildLLMWithMockedVendorClient(),
 *     SupportsTools: true,
 *     ScriptToolCallResponse: (calls, text) => { ... },
 *     ScriptTextResponse: (text) => { ... },
 *     OrdinaryFinishReason: 'stop',
 * });
 * ```
 *
 * Same rules as the streaming suite: do NOT `vi.mock('@memberjunction/ai')` in a file that runs
 * this — the point is to drive the REAL `BaseLLM` and the REAL normalized result types. Mock only
 * the vendor SDK seam.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { BaseLLM, ChatMessage, ChatResult, ChatTool, ChatToolCall } from '@memberjunction/ai';
import { ChatParams, ChatMessageRole } from '@memberjunction/ai';

/** One tool call a scripted vendor response should report. */
export interface ScriptedToolCall {
    /** Provider call id. Drivers that synthesize ids (Gemini) may ignore this. */
    Id: string;
    /** Tool name — matches a declared {@link ChatTool.name}. */
    Name: string;
    /** Arguments as a structured object; the mock renders them in its own wire format. */
    Arguments: Record<string, unknown>;
}

export interface LLMToolConformanceSuiteConfig {
    /** Human-readable provider name, used in describe() labels. */
    ProviderName: string;

    /**
     * Construct a fresh driver instance wired to the scriptable vendor mock. Called in beforeEach,
     * so every test gets a clean instance.
     */
    CreateLLM: () => BaseLLM;

    /** Whether the driver implements the tool mapping (asserted against `SupportsTools`). */
    SupportsTools: boolean;

    /**
     * Program the vendor mock: the next call returns these tool calls, plus `text` when the
     * provider is also emitting prose on the same turn. Required when `SupportsTools` is true.
     *
     * The mock must render the calls the way its SDK really does — OpenAI's JSON-STRING arguments,
     * Anthropic's parsed `input`, Gemini's `functionCall` parts — because turning that back into
     * parsed arguments is exactly what the suite is checking.
     */
    ScriptToolCallResponse?: (calls: ScriptedToolCall[], text?: string) => void;

    /** Program the vendor mock: the next call returns an ordinary text answer, no tool calls. */
    ScriptTextResponse?: (text: string) => void;

    /**
     * The `finish_reason` this driver reports on an ordinary (non-tool) turn — `'stop'` for the
     * OpenAI family, `'completed'` for Anthropic, `'STOP'` for Gemini.
     *
     * That these differ at all is a known gap: `finish_reason` is typed as a bare `string` and has
     * never been normalized across drivers. Native tool calling adds the FIRST normalized value
     * (`'tool_calls'`); the rest is captured here rather than papered over, so the inconsistency is
     * visible in one place.
     *
     * Tracked in MemberJunction/MJ#4335. When that lands, every driver reports the same value here
     * and this knob should be deleted rather than updated.
     */
    OrdinaryFinishReason?: string;
}

/** The tool every scripted case declares — shape is irrelevant to the assertions, so keep it small. */
const WEATHER_TOOL: ChatTool = {
    name: 'get_weather',
    description: 'Call this when the user asks about the weather.',
    inputSchema: {
        type: 'object',
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city']
    }
};

const TOOL_CALL: ScriptedToolCall = { Id: 'call_conformance_1', Name: 'get_weather', Arguments: { city: 'NYC' } };

function buildToolParams(overrides: Partial<ChatParams> = {}): ChatParams {
    const params = new ChatParams();
    params.model = 'conformance-test-model';
    params.messages = [{ role: ChatMessageRole.user, content: 'What is the weather in NYC?' }];
    params.tools = [WEATHER_TOOL];
    Object.assign(params, overrides);
    return params;
}

/** The single choice of a result, asserting the shape on the way. */
function firstChoice(result: ChatResult) {
    expect(result.data.choices.length).toBeGreaterThanOrEqual(1);
    return result.data.choices[0];
}

/**
 * Run the shared native-tool-calling conformance suite against one provider driver. Registers a
 * full `describe` block — call it at the top level of a provider test file.
 */
export function RunLLMToolCallingConformanceSuite(config: LLMToolConformanceSuiteConfig): void {
    if (config.SupportsTools && (!config.ScriptToolCallResponse || !config.ScriptTextResponse)) {
        throw new Error(
            `${config.ProviderName}: ScriptToolCallResponse and ScriptTextResponse are required when SupportsTools is true.`
        );
    }

    describe(`${config.ProviderName} — BaseLLM native tool-calling conformance`, () => {
        let llm: BaseLLM;

        beforeEach(() => {
            llm = config.CreateLLM();
        });

        describe('capability declaration', () => {
            it(`declares SupportsTools = ${config.SupportsTools}`, () => {
                expect(llm.SupportsTools).toBe(config.SupportsTools);
            });
        });

        if (!config.SupportsTools) {
            describe('driver without the tool mapping', () => {
                it('ignores declared tools rather than failing the request', async () => {
                    config.ScriptTextResponse?.('plain answer');

                    const result = await llm.ChatCompletion(buildToolParams());

                    expect(result.success).toBe(true);
                    expect(firstChoice(result).message.toolCalls).toBeUndefined();
                });
            });
            return;
        }

        describe('response normalization', () => {
            it('normalizes a tool call, with arguments PARSED rather than left as a JSON string', async () => {
                config.ScriptToolCallResponse!([TOOL_CALL]);

                const result = await llm.ChatCompletion(buildToolParams());

                expect(result.success).toBe(true);
                const calls = firstChoice(result).message.toolCalls as ChatToolCall[];
                expect(calls).toHaveLength(1);
                expect(calls[0].name).toBe('get_weather');
                expect(calls[0].arguments).toEqual({ city: 'NYC' });
                expect(typeof calls[0].id).toBe('string');
                expect(calls[0].id.length).toBeGreaterThan(0);
            });

            it("reports finish_reason 'tool_calls' on a tool-call turn", async () => {
                config.ScriptToolCallResponse!([TOOL_CALL]);

                const result = await llm.ChatCompletion(buildToolParams());

                expect(firstChoice(result).finish_reason).toBe('tool_calls');
            });

            it('treats a text-free tool call as SUCCESS — a call is output, not a missing answer', async () => {
                config.ScriptToolCallResponse!([TOOL_CALL]);

                const result = await llm.ChatCompletion(buildToolParams());

                expect(result.success).toBe(true);
                expect(result.errorMessage ?? '').not.toContain('No output received');
            });

            it('surfaces text AND tool calls together when the model emits both', async () => {
                config.ScriptToolCallResponse!([TOOL_CALL], 'Let me check that for you.');

                const result = await llm.ChatCompletion(buildToolParams());

                const choice = firstChoice(result);
                expect(choice.message.content).toContain('Let me check that for you.');
                expect(choice.message.toolCalls).toHaveLength(1);
            });

            it('normalizes several calls made in one turn, preserving order', async () => {
                config.ScriptToolCallResponse!([
                    TOOL_CALL,
                    { Id: 'call_conformance_2', Name: 'get_weather', Arguments: { city: 'Boston' } }
                ]);

                const result = await llm.ChatCompletion(buildToolParams());

                const calls = firstChoice(result).message.toolCalls as ChatToolCall[];
                expect(calls).toHaveLength(2);
                expect(calls.map(c => c.arguments.city)).toEqual(['NYC', 'Boston']);
            });

            it('leaves an ordinary turn untouched — no toolCalls, own finish reason preserved', async () => {
                config.ScriptTextResponse!('The weather is fine.');

                const params = buildToolParams();
                params.tools = undefined;
                const result = await llm.ChatCompletion(params);

                const choice = firstChoice(result);
                expect(choice.message.toolCalls).toBeUndefined();
                if (config.OrdinaryFinishReason !== undefined) {
                    expect(choice.finish_reason).toBe(config.OrdinaryFinishReason);
                }
                expect(choice.finish_reason).not.toBe('tool_calls');
            });
        });

        describe('streaming is suppressed while tools are declared (non-streaming only)', () => {
            it('takes the non-streaming path and flags the downgrade', async () => {
                config.ScriptToolCallResponse!([TOOL_CALL]);
                const onContent = [] as string[];

                const result = await llm.ChatCompletion(buildToolParams({
                    streaming: true,
                    streamingCallbacks: {
                        OnContent: (chunk: string) => { onContent.push(chunk); },
                        OnComplete: () => undefined,
                        OnError: () => undefined
                    }
                }));

                expect(result.modelSpecificResponseDetails?.streamingSuppressedForTools).toBe(true);
                expect(onContent).toHaveLength(0);
                expect(firstChoice(result).message.toolCalls).toHaveLength(1);
            });

            it('does not flag the downgrade when no tools are declared', async () => {
                config.ScriptTextResponse!('plain answer');

                const params = buildToolParams();
                params.tools = undefined;
                const result = await llm.ChatCompletion(params);

                expect(result.modelSpecificResponseDetails?.streamingSuppressedForTools).toBeUndefined();
            });
        });

        describe('conversation validity guard', () => {
            /** A history whose tool result answers a call no assistant turn ever declared. */
            const orphanedHistory = (): ChatMessage[] => ([
                { role: ChatMessageRole.user, content: 'What is the weather in NYC?' },
                // The assistant turn is missing its `toolCalls` — the mistake this guard exists for.
                { role: ChatMessageRole.assistant, content: '' },
                {
                    role: ChatMessageRole.tool,
                    content: [{ type: 'tool_result', content: '72F', toolCallId: 'call_conformance_1' }]
                }
            ]);

            it('rejects a tool result whose call was never declared, naming the id', async () => {
                config.ScriptToolCallResponse!([TOOL_CALL]);
                const params = buildToolParams();
                params.messages = orphanedHistory();

                await expect(llm.ChatCompletion(params)).rejects.toThrow(/call_conformance_1/);
            });

            it('accepts the same history once the assistant turn carries its toolCalls', async () => {
                config.ScriptTextResponse!('It is 72F in NYC.');
                const params = buildToolParams();
                const history = orphanedHistory();
                history[1].toolCalls = [{ id: 'call_conformance_1', name: 'get_weather', arguments: { city: 'NYC' } }];
                params.messages = history;

                const result = await llm.ChatCompletion(params);

                expect(result.success).toBe(true);
            });
        });
    });
}
