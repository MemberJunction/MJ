/**
 * native-tool-matrix.test.ts — unit tier for the provider tool-calling matrix.
 *
 * The rig calls live models, so nothing about ITS results is deterministic. The evaluator is a
 * different matter: given a canned `ChatResult` it must produce exactly one observation, and that
 * is what this file pins. The point is the split the test plan draws — "the deterministic tier
 * means the measurement instrument is verified on every PR without spending a model token; live
 * runs then only carry measurement noise, not harness bugs."
 */
import { describe, expect, it } from 'vitest';
import { ChatResult } from '@memberjunction/ai';
import type { ChatResultChoice, ChatToolCall } from '@memberjunction/ai';
import { EvaluateToolChoice, MatchArgument, ObserveChatResult, ReadEnvelope, ScoreCalls, StripJsonFence } from '../native-tool-matrix/observe';
import { BuildManifest, CellId, DEFAULT_MATRIX_SPEC, ExpandMatrix } from '../native-tool-matrix/matrix';
import { BuildUserPrompt, GetScenario, JSON_MODE_PROMPT_SUFFIX, PROBE_SCENARIOS } from '../native-tool-matrix/scenarios';
import { RenderScorecard, SummarizeCells } from '../native-tool-matrix/report';
import { AUTH_FAILURE_MARKERS, IsAuthFailure } from '../native-tool-matrix/credentials';
import { ACTION_FIXTURES, BuildToolFromAction, GetActionFixture, SanitizeToolName } from '../native-tool-matrix/actionTools';
import type { ProbeRecord } from '../native-tool-matrix/report';

/** Builds a successful ChatResult with the given assistant turn — the shape a driver returns. */
function chatResult(options: { content?: string; toolCalls?: ChatToolCall[]; finishReason?: string; promptTokens?: number }): ChatResult {
    const result = new ChatResult(true, new Date(0), new Date(1000));
    const choice: ChatResultChoice = {
        message: { role: 'assistant', content: options.content ?? '', toolCalls: options.toolCalls },
        finish_reason: options.finishReason ?? 'stop',
        index: 0
    };
    result.data = { choices: [choice], usage: { promptTokens: options.promptTokens ?? 100, completionTokens: 20 } };
    return result;
}

function failedResult(message: string): ChatResult {
    const result = new ChatResult(false, new Date(0), new Date(1000));
    result.errorMessage = message;
    return result;
}

const weatherCall: ChatToolCall = { id: 'call_1', name: 'get_weather', arguments: { location: 'Paris' } };
const timeCall: ChatToolCall = { id: 'call_2', name: 'get_time', arguments: { timezone: 'Asia/Tokyo' } };

describe('matchArgument', () => {
    it('accepts a non-empty string and rejects blank or missing', () => {
        expect(MatchArgument({ kind: 'nonEmptyString', parameter: 'sql' }, { sql: 'SELECT 1' })).toBe(true);
        expect(MatchArgument({ kind: 'nonEmptyString', parameter: 'sql' }, { sql: '   ' })).toBe(false);
        expect(MatchArgument({ kind: 'nonEmptyString', parameter: 'sql' }, {})).toBe(false);
    });

    it('compares case-insensitively for free text — an LLM writing "paris, france" is still right', () => {
        expect(MatchArgument({ kind: 'containsIgnoreCase', parameter: 'location', value: 'paris' }, { location: 'Paris, France' })).toBe(true);
        expect(MatchArgument({ kind: 'containsIgnoreCase', parameter: 'location', value: 'paris' }, { location: 'Lyon' })).toBe(false);
    });

    it('enforces enums exactly', () => {
        const matcher = { kind: 'oneOf' as const, parameter: 'unit', values: ['celsius', 'fahrenheit'] };
        expect(MatchArgument(matcher, { unit: 'celsius' })).toBe(true);
        expect(MatchArgument(matcher, { unit: 'Celsius' })).toBe(false);
    });
});

describe('stripJsonFence', () => {
    it('unwraps a fenced object, with or without a language tag', () => {
        expect(StripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
        expect(StripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('leaves unfenced text alone', () => {
        expect(StripJsonFence('  {"a":1}  ')).toBe('{"a":1}');
    });
});

describe('readEnvelope', () => {
    it('accepts a terminal envelope carrying only taskComplete', () => {
        const read = ReadEnvelope('{"taskComplete": true, "message": "Paris is the capital."}');
        expect(read).toMatchObject({ parsed: true, valid: true });
    });

    it('requires a continuing envelope to name its next step', () => {
        expect(ReadEnvelope('{"taskComplete": false}')).toMatchObject({ parsed: true, valid: false });
        expect(ReadEnvelope('{"taskComplete": false, "nextStep": {"type": "Actions"}}')).toMatchObject({ parsed: true, valid: true });
    });

    it('reports prose and arrays as unparsed rather than throwing', () => {
        expect(ReadEnvelope('Sure! Let me look that up.')).toMatchObject({ parsed: false, valid: false });
        expect(ReadEnvelope('[1,2,3]')).toMatchObject({ parsed: false, valid: false });
        expect(ReadEnvelope('')).toMatchObject({ parsed: false, valid: false });
    });
});

describe('scoreCalls', () => {
    const expected = [
        { toolName: 'get_weather', arguments: [{ kind: 'containsIgnoreCase' as const, parameter: 'location', value: 'paris' }] },
        { toolName: 'get_time', arguments: [{ kind: 'containsIgnoreCase' as const, parameter: 'timezone', value: 'tokyo' }] }
    ];

    it('matches names in any order', () => {
        const observed = [
            { name: 'get_time', arguments: { timezone: 'Asia/Tokyo' }, channel: 'tool-call' as const },
            { name: 'get_weather', arguments: { location: 'Paris' }, channel: 'tool-call' as const }
        ];
        expect(ScoreCalls(expected, observed)).toEqual({ namesMatch: true, argumentMatchRate: 1 });
    });

    it('reports partial argument fidelity when a call is right but its arguments are not', () => {
        const observed = [
            { name: 'get_weather', arguments: { location: 'Paris' }, channel: 'tool-call' as const },
            { name: 'get_time', arguments: { timezone: 'UTC' }, channel: 'tool-call' as const }
        ];
        expect(ScoreCalls(expected, observed)).toEqual({ namesMatch: true, argumentMatchRate: 0.5 });
    });

    it('reports null argument fidelity when no matchers apply', () => {
        expect(ScoreCalls([], []).argumentMatchRate).toBeNull();
    });
});

describe('evaluateToolChoice', () => {
    it("holds 'none' to zero calls and 'required' to at least one", () => {
        expect(EvaluateToolChoice('none', undefined, [])).toBe(true);
        expect(EvaluateToolChoice('none', undefined, [weatherCall])).toBe(false);
        expect(EvaluateToolChoice('required', undefined, [weatherCall])).toBe(true);
        expect(EvaluateToolChoice('required', undefined, [])).toBe(false);
    });

    it("holds a named choice to that tool alone", () => {
        expect(EvaluateToolChoice('named', 'get_weather', [weatherCall])).toBe(true);
        expect(EvaluateToolChoice('named', 'get_weather', [weatherCall, timeCall])).toBe(false);
        expect(EvaluateToolChoice('named', 'get_weather', [])).toBe(false);
    });

    it('reports null for the modes that force nothing, rather than a vacuous pass', () => {
        expect(EvaluateToolChoice('auto', undefined, [])).toBeNull();
        expect(EvaluateToolChoice('no-tools', undefined, [])).toBeNull();
    });
});

describe('observeChatResult', () => {
    const singleCall = GetScenario('single-call');
    const noCallNeeded = GetScenario('no-call-needed');
    const envelope = GetScenario('envelope');

    it('scores a clean, text-free tool call as correct — the case Gemini used to report as no output', () => {
        const observation = ObserveChatResult(chatResult({ toolCalls: [weatherCall], finishReason: 'tool_calls' }), singleCall, 'auto', true);
        expect(observation).toMatchObject({
            driverSucceeded: true, textPresent: false, nativeToolCallCount: 1,
            nativeCallsWellFormed: true, channel: 'tool-call', decisionCorrect: true, argumentMatchRate: 1
        });
    });

    it('records text and calls arriving together without treating either as an error', () => {
        const observation = ObserveChatResult(chatResult({ content: 'Let me check.', toolCalls: [weatherCall] }), singleCall, 'auto', true);
        expect(observation.TextAndCallsTogether).toBe(true);
        expect(observation.decisionCorrect).toBe(true);
    });

    it('captures the arguments the model sent, so a fidelity failure can be diagnosed', () => {
        const observation = ObserveChatResult(chatResult({ toolCalls: [weatherCall] }), singleCall, 'auto', true);
        expect(observation.ObservedArguments).toEqual([{ location: 'Paris' }]);
    });

    it('truncates a runaway argument value rather than storing it whole', () => {
        const huge: ChatToolCall = { id: 'x', name: 'get_weather', arguments: { location: 'x'.repeat(1000) } };
        const observation = ObserveChatResult(chatResult({ toolCalls: [huge] }), singleCall, 'auto', true);
        const stored = String(observation.ObservedArguments[0].location);
        expect(stored.length).toBeLessThan(1000);
        expect(stored.endsWith('…[truncated]')).toBe(true);
    });

    it('flags a call to a tool that was never declared', () => {
        const rogue: ChatToolCall = { id: 'x', name: 'delete_everything', arguments: {} };
        const observation = ObserveChatResult(chatResult({ toolCalls: [rogue] }), singleCall, 'auto', true);
        expect(observation.nativeCallsWellFormed).toBe(false);
        expect(observation.UndeclaredToolNames).toEqual(['delete_everything']);
        expect(observation.decisionCorrect).toBe(false);
    });

    it('counts a spurious call as the failure it is when no call was warranted', () => {
        const answered = ObserveChatResult(chatResult({ content: 'Paris.' }), noCallNeeded, 'auto', true);
        expect(answered.decisionCorrect).toBe(true);
        const reached = ObserveChatResult(chatResult({ toolCalls: [weatherCall] }), noCallNeeded, 'auto', true);
        expect(reached.decisionCorrect).toBe(false);
    });

    it('reads an envelope decision through the same expectation as a native call', () => {
        const body = JSON.stringify({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'get_weather', params: { location: 'Paris' } }] } });
        const observation = ObserveChatResult(chatResult({ content: body }), envelope, 'no-tools', false);
        expect(observation).toMatchObject({ channel: 'envelope', envelopeParsed: true, envelopeValid: true, decisionCorrect: true, argumentMatchRate: 1 });
    });

    it('prefers the native call when a model answers through both channels', () => {
        const body = JSON.stringify({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'run_query', params: { sql: 'SELECT 1' } }] } });
        const observation = ObserveChatResult(chatResult({ content: body, toolCalls: [weatherCall] }), envelope, 'auto', true);
        expect(observation.channel).toBe('tool-call');
        expect(observation.ObservedCallNames).toEqual(['get_weather']);
    });

    it('leaves envelope fields null on scenarios that never asked for one', () => {
        const observation = ObserveChatResult(chatResult({ content: 'Paris.' }), noCallNeeded, 'auto', true);
        expect(observation.envelopeParsed).toBeNull();
        expect(observation.envelopeValid).toBeNull();
    });

    it('turns a provider failure into a row rather than a gap', () => {
        const observation = ObserveChatResult(failedResult('400 function calling is not enabled for models with response mime type'), singleCall, 'auto', true);
        expect(observation).toMatchObject({ driverSucceeded: false, channel: 'error', decisionCorrect: false });
        expect(observation.errorMessage).toContain('function calling is not enabled');
    });

    it('does not flag envelope actions as undeclared in a no-tools cell', () => {
        const body = JSON.stringify({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'get_weather', params: { location: 'Paris' } }] } });
        const observation = ObserveChatResult(chatResult({ content: body }), envelope, 'no-tools', false);
        expect(observation.UndeclaredToolNames).toEqual([]);
    });
});

describe('scenarios', () => {
    it('offers a distractor tool that is never the right answer, so name accuracy is separable', () => {
        const expectedNames = new Set(PROBE_SCENARIOS.flatMap((s) => s.Expectation.calls.map((c) => c.toolName)));
        expect(expectedNames.has('run_query')).toBe(false);
        expect(PROBE_SCENARIOS.every((s) => s.Tools.some((t) => t.name === 'run_query'))).toBe(true);
    });

    it("appends the JSON-mode suffix only in JSON cells — OpenAI's json_object rejects a prompt without it", () => {
        const scenario = GetScenario('single-call');
        expect(BuildUserPrompt(scenario, 'Any')).toBe(scenario.UserPrompt);
        expect(BuildUserPrompt(scenario, 'JSON')).toBe(scenario.UserPrompt + JSON_MODE_PROMPT_SUFFIX);
    });

    it('keeps every tool schema inside the cross-provider common subset Gemini accepts', () => {
        const allowed = new Set(['type', 'description', 'enum', 'items', 'properties', 'required']);
        for (const tool of PROBE_SCENARIOS.flatMap((s) => s.Tools)) {
            expect(Object.keys(tool.inputSchema).every((k) => allowed.has(k))).toBe(true);
            const properties = tool.inputSchema.properties as Record<string, Record<string, unknown>>;
            for (const property of Object.values(properties)) {
                expect(Object.keys(property).every((k) => allowed.has(k))).toBe(true);
            }
        }
    });

    it('throws on an unknown scenario id rather than silently running nothing', () => {
        expect(() => GetScenario('nope')).toThrow(/Unknown probe scenario/);
    });
});

describe('expandMatrix', () => {
    it('drops only vacuous combinations, and says why for each', () => {
        const expanded = ExpandMatrix(DEFAULT_MATRIX_SPEC);
        expect(expanded.Cells.length).toBeGreaterThan(0);
        expect(expanded.Skipped.length).toBeGreaterThan(0);
        expect(expanded.Skipped.every((s) => s.Reason.length > 0)).toBe(true);
    });

    it("never runs a call-warranting scenario with no tools declared and no envelope to read", () => {
        const expanded = ExpandMatrix(DEFAULT_MATRIX_SPEC);
        const bad = expanded.Cells.filter((c) => c.ToolMode === 'no-tools' && c.ScenarioId === 'single-call');
        expect(bad).toEqual([]);
    });

    it('never forces a named tool on the parallel-call scenario', () => {
        const expanded = ExpandMatrix(DEFAULT_MATRIX_SPEC);
        expect(expanded.Cells.filter((c) => c.ToolMode === 'named' && c.ScenarioId === 'parallel-call')).toEqual([]);
    });

    it('sweeps the thinking axis only on the models that declare effort levels', () => {
        const expanded = ExpandMatrix(DEFAULT_MATRIX_SPEC);
        const thinking = expanded.Cells.filter((c) => c.EffortLevel !== null);
        expect(thinking.length).toBeGreaterThan(0);
        expect(thinking.every((c) => c.ToolMode === 'auto' && c.ResponseFormat === 'Any')).toBe(true);
        expect(thinking.every((c) => (c.Model.EffortLevels ?? []).includes(c.EffortLevel))).toBe(true);
    });

    it('gives every cell a unique id', () => {
        const expanded = ExpandMatrix(DEFAULT_MATRIX_SPEC);
        expect(new Set(expanded.Cells.map((c) => c.Id)).size).toBe(expanded.Cells.length);
    });

    it('sizes the manifest off the real prompts, and scales with reps', () => {
        const expanded = ExpandMatrix(DEFAULT_MATRIX_SPEC);
        const one = BuildManifest(expanded, 1);
        const three = BuildManifest(expanded, 3);
        expect(one.CallCount).toBe(expanded.Cells.length);
        expect(three.CallCount).toBe(one.CallCount * 3);
        expect(three.EstimatedPromptTokens).toBe(one.EstimatedPromptTokens * 3);
        expect(one.PerModel.length).toBe(DEFAULT_MATRIX_SPEC.Models.length);
    });
});

describe('summarizeCells and renderScorecard', () => {
    const model = DEFAULT_MATRIX_SPEC.Models[0];
    const id = CellId(model, 'single-call', 'auto', 'Any', null);

    function record(rep: number, decisionCorrect: boolean, calls: number): ProbeRecord {
        return {
            Label: 'unit', Timestamp: new Date(0).toISOString(), CellId: id,
            ModelLabel: model.Label, ApiName: model.ApiName, Developer: model.Developer,
            Generation: model.Generation, DriverClass: model.DriverClass,
            ScenarioId: 'single-call', ToolMode: 'auto', ResponseFormat: 'Any', EffortLevel: null,
            Rep: rep, LatencyMs: 1000,
            Observation: {
                driverSucceeded: true, errorMessage: null, FinishReason: 'tool_calls', StreamingSuppressedForTools: false,
                textPresent: false, TextLength: 0, nativeToolCallCount: calls, TextAndCallsTogether: false,
                nativeCallsWellFormed: true, UndeclaredToolNames: [], envelopeParsed: null, envelopeValid: null,
                channel: 'tool-call', ObservedCallNames: ['get_weather'], ObservedArguments: [{ location: 'Paris' }], decisionCorrect, argumentMatchRate: 1,
                ToolChoiceHonored: null, PromptTokens: 120, CompletionTokens: 20
            }
        };
    }

    it('turns repetitions into rates rather than a pass/fail', () => {
        const summaries = SummarizeCells([record(1, true, 1), record(2, false, 1), record(3, true, 2)]);
        expect(summaries).toHaveLength(1);
        expect(summaries[0]).toMatchObject({ reps: 3, errorCount: 0, nativeCallRate: 1, parallelRate: 1 / 3 });
        expect(summaries[0].DecisionCorrectRate).toBeCloseTo(2 / 3);
        expect(summaries[0].FinishReasons).toEqual({ tool_calls: 3 });
    });

    it('reports success-conditioned metrics as null, not zero, when every repetition errored', () => {
        const errored = { ...record(1, false, 0) };
        errored.Observation = { ...errored.Observation, driverSucceeded: false, errorMessage: '400 unsupported', channel: 'error', FinishReason: null };
        const [summary] = SummarizeCells([errored, { ...errored, Rep: 2 }]);
        // A cell where every call was rejected must not read as "the model chose not to call a tool".
        expect(summary.nativeCallRate).toBeNull();
        expect(summary.MeanNativeCalls).toBeNull();
        expect(summary.parallelRate).toBeNull();
        // Decision accuracy still counts the error — a rejected request is a wrong answer to the caller.
        expect(summary.DecisionCorrectRate).toBe(0);
        expect(summary.errorCount).toBe(2);
    });

    it('orders model rows deterministically, since models run in parallel and record order does not', () => {
        const second = DEFAULT_MATRIX_SPEC.Models.find((m) => m.Developer !== model.Developer);
        expect(second).toBeDefined();
        const other: ProbeRecord = { ...record(1, true, 1), ModelLabel: second!.Label, ApiName: second!.ApiName, Developer: second!.Developer, CellId: 'other' };
        const forward = RenderScorecard(SummarizeCells([record(1, true, 1), other]), { Label: 'u', StartedAt: 'a', FinishedAt: 'b', reps: 1, CellCount: 2, SkippedCount: null, CallCount: 2 });
        const reversed = RenderScorecard(SummarizeCells([other, record(1, true, 1)]), { Label: 'u', StartedAt: 'a', FinishedAt: 'b', reps: 1, CellCount: 2, SkippedCount: null, CallCount: 2 });
        expect(forward).toBe(reversed);
    });

    it('renders every question section, and says so plainly when nothing failed', () => {
        const markdown = RenderScorecard(SummarizeCells([record(1, true, 1)]), {
            Label: 'unit', StartedAt: 'a', FinishedAt: 'b', reps: 1, CellCount: 1, SkippedCount: 0, CallCount: 1
        });
        for (const heading of ['Forcing semantics', 'responseFormat: JSON', 'Parallel calls', 'Coherence', 'envelope under declared tools', 'Call shape', 'Finish-reason', 'Cost profile']) {
            expect(markdown).toContain(heading);
        }
        expect(markdown).toContain('None — every cell returned a successful result');
        expect(markdown).toContain(model.Label);
    });
});

describe('isAuthFailure', () => {
    // Verbatim from the tool-capable providers. These are the messages the rig must act on.
    it.each([
        ['Anthropic', '401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."},"request_id":null}'],
        ['OpenAI', '401 Incorrect API key provided: sk-proj-****. You can find your API key at https://platform.openai.com/account/api-keys.'],
        ['Gemini', '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}'],
        ['generic 403', 'Error: 403 Forbidden'],
        ['permission denied', '{"error":{"code":403,"status":"PERMISSION_DENIED"}}']
    ])('treats a %s credential rejection as an auth failure', (_provider, message) => {
        expect(IsAuthFailure(message)).toBe(true);
    });

    // A false positive abandons a model that would have produced data, so these must NOT match.
    it.each([
        ['rate limit', '429 Too Many Requests — rate limit exceeded, please retry after 20s'],
        ['quota', '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'],
        ['unknown model', '404 The model `gpt-9` does not exist or you do not have access to it.'],
        ['server error', '500 Internal Server Error'],
        ['overloaded', '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'],
        ['the JSON-mode finding', "{\"error\":{\"code\":400,\"message\":\"Forced function calling (ANY mode) with a response mime type: 'application/json' is unsupported\"}}"],
        ['a token count that contains 401', 'Request failed: prompt was 1401 tokens, over the limit'],
        ['a request id that contains 403', 'Request req_88403912 failed after 3 retries']
    ])('does not mistake a %s for an auth failure', (_kind, message) => {
        expect(IsAuthFailure(message)).toBe(false);
    });

    it('handles absent messages rather than throwing', () => {
        expect(IsAuthFailure(null)).toBe(false);
        expect(IsAuthFailure(undefined)).toBe(false);
        expect(IsAuthFailure('')).toBe(false);
    });

    it('matches case-insensitively, since providers do not agree on casing', () => {
        expect(IsAuthFailure('UNAUTHORIZED')).toBe(true);
        expect(IsAuthFailure('Authentication_Error')).toBe(true);
    });

    it('keeps every marker lower-cased, or the case-insensitive compare silently never fires', () => {
        expect(AUTH_FAILURE_MARKERS.filter((m) => m !== m.toLowerCase())).toEqual([]);
    });
});

describe('buildToolFromAction — the §8.2 Action→ChatTool mapping', () => {
    const calc = GetActionFixture('Calculate Expression');
    const query = GetActionFixture('Run Ad-hoc Query');

    it('sanitizes Action names to the provider-legal form §8.2 specifies', () => {
        expect(SanitizeToolName('Run Ad-hoc Query')).toBe('run_ad_hoc_query');
        expect(SanitizeToolName('Get Entity Details')).toBe('get_entity_details');
        // Providers allow [a-zA-Z0-9_-] only, ≤64 chars.
        for (const name of ACTION_FIXTURES.map((a) => a.Name)) {
            const sanitized = SanitizeToolName(name);
            expect(sanitized).toMatch(/^[a-z0-9_]+$/);
            expect(sanitized.length).toBeLessThanOrEqual(64);
        }
    });

    it('names collide-free across the fixture set, which §8.2 makes a hard error', () => {
        const names = ACTION_FIXTURES.map((a) => SanitizeToolName(a.Name));
        expect(new Set(names).size).toBe(names.length);
    });

    it('puts required params in required[] and leaves optional ones out', () => {
        const tool = BuildToolFromAction(query, 'string');
        // Run Ad-hoc Query has exactly one required input: Query.
        expect(tool.inputSchema.required).toEqual(['Query']);
        expect(Object.keys(tool.inputSchema.properties as Record<string, unknown>).length).toBe(query.Params.length);
    });

    it('emits the plan\'s literal union type for Scalar under the union strategy', () => {
        const props = BuildToolFromAction(calc, 'union').inputSchema.properties as Record<string, Record<string, unknown>>;
        expect(props.Expression.type).toEqual(['string', 'number', 'boolean']);
    });

    it('emits a plain string type for Scalar under the conservative strategy', () => {
        const props = BuildToolFromAction(calc, 'string').inputSchema.properties as Record<string, Record<string, unknown>>;
        expect(props.Expression.type).toBe('string');
    });

    it("types a ValueType 'Other' param per the opaque strategy — the measured 60%-vs-100% choice", () => {
        const asObject = BuildToolFromAction(query, 'string', 'object').inputSchema.properties as Record<string, Record<string, unknown>>;
        const asString = BuildToolFromAction(query, 'string', 'string').inputSchema.properties as Record<string, Record<string, unknown>>;
        expect(asObject.Query.type).toBe('object');
        expect(asString.Query.type).toBe('string');
    });

    it('folds DefaultValue into the description, since the permissive mapping has nowhere else', () => {
        const withDefault = query.Params.find((p) => p.DefaultValue);
        expect(withDefault, 'fixture should contain a param with a DefaultValue').toBeDefined();
        const props = BuildToolFromAction(query, 'string').inputSchema.properties as Record<string, Record<string, unknown>>;
        expect(String(props[withDefault!.Name].description)).toContain(`Default: ${withDefault!.DefaultValue}`);
    });

    it('phrases the tool description prescriptively, which §8.2 says improves should-call rates', () => {
        expect(BuildToolFromAction(calc, 'string').description).toMatch(/^Call this when/);
    });

    it('keeps every emitted schema inside the cross-provider common subset', () => {
        const allowed = new Set(['type', 'description', 'enum', 'items', 'properties', 'required']);
        for (const action of ACTION_FIXTURES) {
            for (const scalar of ['union', 'string'] as const) {
                const schema = BuildToolFromAction(action, scalar).inputSchema;
                expect(Object.keys(schema).every((k) => allowed.has(k))).toBe(true);
                for (const prop of Object.values(schema.properties as Record<string, Record<string, unknown>>)) {
                    expect(Object.keys(prop).every((k) => allowed.has(k))).toBe(true);
                }
            }
        }
    });

    it('throws on an unknown Action rather than building an empty tool', () => {
        expect(() => GetActionFixture('No Such Action')).toThrow(/No action fixture named/);
    });
});
