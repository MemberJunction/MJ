/**
 * eval-core.test.ts — the unit tier for the framework-free evaluation core (test plan §5).
 *
 * These functions ARE the measuring instrument for every eval arm. If the normalizer reads a
 * decision wrong, or a matcher is too strict, every rate the harness reports is wrong in a way no
 * amount of live-model repetition would reveal — it would just look like model behavior. So the
 * instrument is pinned here, against canned data, on every PR, for zero tokens.
 */
import { describe, expect, it } from 'vitest';
import { NormalizeDecision, StripJsonFence } from '../eval/decision';
import { ApplyMatcher, MatchParams } from '../eval/matchers';
import { EvaluateDecision } from '../eval/expectation';
import { EvaluateWellFormed } from '../eval/wellFormed';
import { EvaluateSubAgentTrace } from '../eval/subAgentTrace';
import { EvaluateCorpusExpectation, ParseCorpusCase, ToParamMatcher } from '../eval/corpus';

const envelope = (body: unknown): string => JSON.stringify(body);

describe('normalizeDecision — envelope encoding', () => {
    it('names two concatenated envelopes as such, rather than as a generic parse error', () => {
        // Also GPT 5.6-luna at effort none: two complete envelopes back to back, with a stray token
        // between them. Still malformed — but a distinct class worth counting.
        const two = envelope({ taskComplete: false, nextStep: { type: 'Sub-Agent', subAgent: { name: 'A' } } })
            + 'ಾಗಿದೆ\n' + envelope({ taskComplete: false, nextStep: { type: 'Sub-Agent', subAgent: { name: 'A' } } });
        const decision = NormalizeDecision({ text: two });
        expect(decision.kind).toBe('unparseable');
        expect(decision.diagnostic).toMatch(/2 complete JSON objects were concatenated/);
    });

    it('reads an Actions step as an action decision with params', () => {
        const decision = NormalizeDecision({ text: envelope({
            taskComplete: false,
            nextStep: { type: 'Actions', actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } }] }
        }) });
        expect(decision).toMatchObject({ kind: 'action', encoding: 'envelope', envelopeParsed: true });
        expect(decision.actions).toEqual([{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } }]);
    });

    it('reads a Chat step, and takes the message from the TOP level where the runtime reads it', () => {
        const decision = NormalizeDecision({ text: envelope({
            taskComplete: false, message: 'Which region?', nextStep: { type: 'Chat' }
        }) });
        expect(decision.kind).toBe('chat');
        expect(decision.message).toBe('Which region?');
    });

    it('honors a Chat step even when taskComplete is true, matching DetermineNextStep', () => {
        // The runtime checks Chat BEFORE taskComplete; scoring against a different precedence
        // would measure the harness rather than the agent.
        const decision = NormalizeDecision({ text: envelope({ taskComplete: true, message: 'hi', nextStep: { type: 'Chat' } }) });
        expect(decision.kind).toBe('chat');
    });

    it('reads sub-agent dispatch from both the singular and plural fields', () => {
        const single = NormalizeDecision({ text: envelope({ nextStep: { type: 'Sub-Agent', subAgent: { name: 'Web Research Agent', message: 'go' } } }) });
        expect(single).toMatchObject({ kind: 'subAgent' });
        expect(single.subAgents).toEqual([{ name: 'Web Research Agent', message: 'go' }]);

        const many = NormalizeDecision({ text: envelope({ nextStep: { type: 'Sub-Agent', subAgents: [{ name: 'A' }, { name: 'B' }] } }) });
        expect(many.subAgents.map((s) => s.name)).toEqual(['A', 'B']);
    });

    it('infers the kind when the model omits nextStep.type, as the validator does', () => {
        const actions = NormalizeDecision({ text: envelope({ nextStep: { actions: [{ name: 'X', params: {} }] } }) });
        expect(actions.kind).toBe('action');
        const sub = NormalizeDecision({ text: envelope({ nextStep: { subAgent: { name: 'Y' } } }) });
        expect(sub.kind).toBe('subAgent');
    });

    it('reads completion and payload-change decisions', () => {
        expect(NormalizeDecision({ text: envelope({ taskComplete: true }) }).kind).toBe('taskComplete');
        expect(NormalizeDecision({ text: envelope({ payloadChangeRequest: { newElements: { a: 1 } } }) }).kind).toBe('payloadChange');
    });

    it('tolerates a markdown fence, which the loop parser also tolerates', () => {
        const decision = NormalizeDecision({ text: '```json\n' + envelope({ taskComplete: true }) + '\n```' });
        expect(decision).toMatchObject({ kind: 'taskComplete', envelopeParsed: true });
        expect(StripJsonFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('classifies unreadable output as unparseable, with a diagnostic, and never throws', () => {
        const prose = NormalizeDecision({ text: 'Sure! Let me look that up for you.' });
        expect(prose.kind).toBe('unparseable');
        expect(prose.diagnostic).toContain('did not parse');
        expect(NormalizeDecision({ text: '[1,2,3]' }).kind).toBe('unparseable');
    });

    it('classifies no output as empty rather than unparseable — a different failure', () => {
        expect(NormalizeDecision({ text: '' })).toMatchObject({ kind: 'empty', encoding: 'none' });
        expect(NormalizeDecision({})).toMatchObject({ kind: 'empty' });
    });
});

describe('normalizeDecision — native encoding', () => {
    it('flags a turn that answered on both channels, and records what the envelope would have decided', () => {
        // GPT 5.6-luna, querybuilder-dispatch-strategist-01, run C2: a search_query_catalog call
        // AND a complete Sub-Agent envelope in one turn. Tool call wins; the discard is recorded.
        const decision = NormalizeDecision({
            toolCalls: [{ name: 'search_query_catalog', arguments: {} }],
            text: envelope({ taskComplete: false, nextStep: { type: 'Sub-Agent', subAgent: { name: 'Query Strategist' } } })
        });
        expect(decision).toMatchObject({ kind: 'action', encoding: 'native', dualChannel: true, shadowEnvelopeKind: 'subAgent' });
    });

    it('does not flag narration alongside a call as dual-channel', () => {
        const decision = NormalizeDecision({ toolCalls: [{ name: 'x' }], text: 'Searching the catalog first.' });
        expect(decision.dualChannel).toBe(false);
        expect(decision.shadowEnvelopeKind).toBeUndefined();
    });

    it('reads tool calls as an action decision', () => {
        const decision = NormalizeDecision({ toolCalls: [{ name: 'run_ad_hoc_query', arguments: { Query: 'SELECT 1' } }] });
        expect(decision).toMatchObject({ kind: 'action', encoding: 'native', envelopeParsed: null });
        expect(decision.actions[0].params).toEqual({ Query: 'SELECT 1' });
    });

    it('prefers the native call when a model answers through both channels', () => {
        // Measured: Gemini 3.7 Flash under JSON mode answers natively and drops the
        // envelope entirely. The decision is native; the text is at most narration.
        const decision = NormalizeDecision({
            text: envelope({ taskComplete: false, nextStep: { type: 'Actions', actions: [{ name: 'other', params: {} }] } }),
            toolCalls: [{ name: 'run_ad_hoc_query', arguments: {} }]
        });
        expect(decision.encoding).toBe('native');
        expect(decision.actions.map((a) => a.name)).toEqual(['run_ad_hoc_query']);
    });

    it('scores the SAME expectation across both encodings — the whole point of §1', () => {
        const expectation = { kind: 'action' as const, actions: [{ name: 'get_weather', params: [{ param: 'city', matcher: { kind: 'containsIgnoreCase' as const, value: 'paris' } }] }] };
        const viaEnvelope = EvaluateDecision(expectation, NormalizeDecision({
            text: envelope({ nextStep: { type: 'Actions', actions: [{ name: 'get_weather', params: { city: 'Paris' } }] } })
        }));
        const viaNative = EvaluateDecision(expectation, NormalizeDecision({ toolCalls: [{ name: 'get_weather', arguments: { city: 'Paris' } }] }));
        expect(viaEnvelope.passed).toBe(true);
        expect(viaNative.passed).toBe(true);
        expect(viaEnvelope.score).toBe(viaNative.score);
    });
});

describe('matchers', () => {
    it('exact uses deep equality, order-insensitively for object keys', () => {
        expect(ApplyMatcher({ kind: 'exact', value: { a: 1, b: 2 } }, { b: 2, a: 1 }).passed).toBe(true);
        expect(ApplyMatcher({ kind: 'exact', value: 5 }, '5').passed).toBe(false);
    });

    it('nonEmptyString rejects blanks and non-strings', () => {
        expect(ApplyMatcher({ kind: 'nonEmptyString' }, 'SELECT 1').passed).toBe(true);
        expect(ApplyMatcher({ kind: 'nonEmptyString' }, '   ').passed).toBe(false);
        expect(ApplyMatcher({ kind: 'nonEmptyString' }, {}).passed).toBe(false);
    });

    it('containsIgnoreCase is the right tool for LLM-authored free text', () => {
        expect(ApplyMatcher({ kind: 'containsIgnoreCase', value: 'paris' }, 'Paris, France').passed).toBe(true);
    });

    it('oneOf, numberRange, typeOf and absent behave as documented', () => {
        expect(ApplyMatcher({ kind: 'oneOf', values: ['csv', 'json'] }, 'json').passed).toBe(true);
        expect(ApplyMatcher({ kind: 'oneOf', values: ['csv'] }, 'CSV').passed).toBe(false);
        expect(ApplyMatcher({ kind: 'numberRange', min: 1, max: 100 }, 50).passed).toBe(true);
        expect(ApplyMatcher({ kind: 'numberRange', max: 10 }, 11).passed).toBe(false);
        expect(ApplyMatcher({ kind: 'typeOf', type: 'array' }, [1]).passed).toBe(true);
        expect(ApplyMatcher({ kind: 'typeOf', type: 'object' }, [1]).passed).toBe(false);
        expect(ApplyMatcher({ kind: 'absent' }, undefined).passed).toBe(true);
        expect(ApplyMatcher({ kind: 'absent' }, 0).passed).toBe(false);
    });

    it('reports an invalid regex as an authoring bug, not a failed match', () => {
        const result = ApplyMatcher({ kind: 'regex', pattern: '([' }, 'anything');
        expect(result.passed).toBe(false);
        expect(result.detail).toContain('invalid regex in expectation');
    });

    it('explains WHY a matcher failed, so a report names the parameter and the value', () => {
        const [result] = MatchParams([{ param: 'Query', matcher: { kind: 'nonEmptyString' } }], { Query: {} });
        expect(result).toMatchObject({ param: 'Query', passed: false });
        expect(result.detail).toContain('expected a non-empty string');
    });
});

describe('evaluateDecision — component decomposition', () => {
    const observed = NormalizeDecision({ text: envelope({
        nextStep: { type: 'Actions', actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1', MaxRows: 5000 } }] }
    }) });

    it('separates decision kind, action accuracy and param fidelity so §6.1 aggregates', () => {
        const evaluation = EvaluateDecision({
            kind: 'action',
            actions: [{ name: 'Run Ad-hoc Query', params: [
                { param: 'Query', matcher: { kind: 'nonEmptyString' } },
                { param: 'MaxRows', matcher: { kind: 'numberRange', max: 1000 } }
            ] }]
        }, observed);
        expect(evaluation.decisionKindMatch).toBe(true);
        expect(evaluation.actionAccuracy).toBe(1);
        expect(evaluation.paramFidelity).toBe(0.5);
        expect(evaluation.passed).toBe(false);
    });

    it('reports null — not zero — for components the case does not exercise', () => {
        // Counting an absent component as 0 would make chat cases incomparable with action cases,
        // which is exactly what a corpus-wide average needs them to be.
        const chat = EvaluateDecision({ kind: 'chat' }, NormalizeDecision({ text: envelope({ message: 'hi', nextStep: { type: 'Chat' } }) }));
        expect(chat.actionAccuracy).toBeNull();
        expect(chat.paramFidelity).toBeNull();
        expect(chat.passed).toBe(true);
        expect(chat.score).toBe(1);
    });

    it('matches action sets order-insensitively unless the case asks otherwise', () => {
        const parallel = NormalizeDecision({ toolCalls: [{ name: 'b' }, { name: 'a' }] });
        expect(EvaluateDecision({ kind: 'action', actions: [{ name: 'a' }, { name: 'b' }] }, parallel).actionAccuracy).toBe(1);
        expect(EvaluateDecision({ kind: 'action', actions: [{ name: 'a' }, { name: 'b' }], ordered: true }, parallel).actionAccuracy).toBe(0);
    });

    it('flags a forbidden invocation — the coherence probe', () => {
        const reached = NormalizeDecision({ toolCalls: [{ name: 'get_weather' }] });
        const evaluation = EvaluateDecision({ kind: 'chat', forbiddenActions: ['get_weather'] }, reached);
        expect(evaluation.forbiddenViolations).toEqual(['get_weather']);
        expect(evaluation.passed).toBe(false);
    });

    it('charges a missing action once, at the name level, not again per parameter check', () => {
        const wrong = NormalizeDecision({ toolCalls: [{ name: 'other' }] });
        const evaluation = EvaluateDecision({ kind: 'action', actions: [{ name: 'wanted', params: [{ param: 'x', matcher: { kind: 'nonEmptyString' } }] }] }, wrong);
        expect(evaluation.actionAccuracy).toBe(0);
        expect(evaluation.paramResults[0].detail).toContain("was not invoked");
    });
});

describe('evaluateWellFormed', () => {
    const good = NormalizeDecision({ text: envelope({ taskComplete: true }) });

    it('passes a readable turn and fails an unreadable one', () => {
        expect(EvaluateWellFormed({ decision: good }).passed).toBe(true);
        expect(EvaluateWellFormed({ decision: NormalizeDecision({ text: 'prose' }) }).passed).toBe(false);
        expect(EvaluateWellFormed({ decision: NormalizeDecision({ text: '' }) }).message).toContain('no output');
    });

    it('fails on a truncating or refusing finish reason, case-insensitively', () => {
        expect(EvaluateWellFormed({ decision: good, finishReason: 'MALFORMED_FUNCTION_CALL' }).passed).toBe(false);
        expect(EvaluateWellFormed({ decision: good, finishReason: 'length' }).passed).toBe(false);
        expect(EvaluateWellFormed({ decision: good, finishReason: 'STOP' }).passed).toBe(true);
    });

    it('an execution error outranks everything — there is no output to judge', () => {
        const result = EvaluateWellFormed({ decision: good, executionError: '429 rate limited' });
        expect(result.passed).toBe(false);
        expect(result.message).toContain('execution failed');
    });

    it('does not require an envelope by default, so a text-free native call still passes', () => {
        // On Google, text NEVER accompanies a tool call. Requiring an envelope
        // unconditionally would fail every correct native turn.
        const native = NormalizeDecision({ toolCalls: [{ name: 'x' }] });
        expect(EvaluateWellFormed({ decision: native }).passed).toBe(true);
        expect(EvaluateWellFormed({ decision: native }, { requireEnvelope: true }).passed).toBe(false);
    });
});

describe('evaluateSubAgentTrace (T1)', () => {
    const facts = { dispatchedAgents: ['Web Research Agent', 'Database Research Agent'], iterations: 3 };

    it('passes when every required sub-agent ran', () => {
        const result = EvaluateSubAgentTrace(facts, { requiredAgents: ['Database Research Agent', 'Web Research Agent'], minIterations: 1 });
        expect(result.passed).toBe(true);
        expect(result.score).toBe(1);
    });

    it('compares names case-insensitively — casing is never the failure anyone means', () => {
        expect(EvaluateSubAgentTrace(facts, { requiredAgents: ['web research agent'] }).passed).toBe(true);
    });

    it('names what was missing, forbidden, or short', () => {
        const missing = EvaluateSubAgentTrace(facts, { requiredAgents: ['File Research Agent'] });
        expect(missing.message).toContain('never dispatched required sub-agent(s): File Research Agent');
        const forbidden = EvaluateSubAgentTrace(facts, { forbiddenAgents: ['Web Research Agent'] });
        expect(forbidden.message).toContain('dispatched forbidden');
        const short = EvaluateSubAgentTrace(facts, { minIterations: 5 });
        expect(short.message).toContain('expected at least 5 iteration(s), saw 3');
    });

    it('gives partial credit across the configured checks', () => {
        // Two of three checks clean should not score the same as none of three.
        const result = EvaluateSubAgentTrace(facts, {
            requiredAgents: ['Web Research Agent'], forbiddenAgents: ['Nobody'], minIterations: 99
        });
        expect(result.passed).toBe(false);
        expect(result.score).toBeCloseTo(2 / 3);
    });

    it('passes a run with no sub-agents when none were required', () => {
        expect(EvaluateSubAgentTrace({ dispatchedAgents: [], iterations: 1 }, {}).passed).toBe(true);
    });
});

describe('corpus golden-file format (T4)', () => {
    const wellFormedCase = {
        id: 'research-db-adhoc-query-01',
        agent: 'Database Research Agent',
        description: 'Mid-loop: prior search found the entity; next step must run the ad-hoc query',
        input: { payload: { databaseResearch: { entitiesFound: ['Members'] } } },
        expect: {
            kind: 'action',
            actions: [{
                name: 'Run Ad-hoc Query',
                params: {
                    Query: { matcher: 'regex', pattern: 'SELECT[\\s\\S]+FROM', flags: 'i' },
                    ResultFormat: { matcher: 'exact', value: 'json', optional: true }
                }
            }],
            allowAdditionalActions: false
        }
    };

    it('accepts the format the plan specifies, verbatim', () => {
        const parsed = ParseCorpusCase(wellFormedCase);
        expect(parsed.id).toBe('research-db-adhoc-query-01');
        expect(parsed.agent).toBe('Database Research Agent');
    });

    it('translates every on-disk matcher name into the internal union', () => {
        const id = 'c';
        expect(ToParamMatcher(id, 'p', { matcher: 'nonEmpty' })).toEqual({ kind: 'nonEmpty' });
        expect(ToParamMatcher(id, 'p', { matcher: 'contains', value: 'x' })).toEqual({ kind: 'containsIgnoreCase', value: 'x' });
        expect(ToParamMatcher(id, 'p', { matcher: 'numericTolerance', value: 100, tolerance: 5 })).toEqual({ kind: 'numberRange', min: 95, max: 105 });
        expect(ToParamMatcher(id, 'p', { matcher: 'absent' })).toEqual({ kind: 'absent' });
    });

    it('rejects a malformed matcher AT LOAD, naming the case and param', () => {
        // A matcher that silently never matches would look exactly like a model failure.
        expect(() => ToParamMatcher('c1', 'Query', { matcher: 'regex' })).toThrow(/Query.*requires a 'pattern'/);
        expect(() => ToParamMatcher('c1', 'Query', { matcher: 'regex', pattern: '([' })).toThrow(/invalid regex/);
        expect(() => ToParamMatcher('c1', 'F', { matcher: 'oneOf', values: [] })).toThrow(/non-empty 'values'/);
        expect(() => ToParamMatcher('c1', 'F', { matcher: 'nope' } as never)).toThrow(/unknown matcher/);
    });

    it('rejects structurally invalid cases', () => {
        expect(() => ParseCorpusCase({ agent: 'A', expect: { kind: 'chat' } })).toThrow(/non-empty 'id'/);
        expect(() => ParseCorpusCase({ id: 'x', expect: { kind: 'chat' } })).toThrow(/must name the 'agent'/);
        expect(() => ParseCorpusCase({ id: 'x', agent: 'A' })).toThrow(/must declare an 'expect'/);
        expect(() => ParseCorpusCase({ id: 'x', agent: 'A', expect: { kind: 'nope' } })).toThrow(/unknown expectation kind/);
        expect(() => ParseCorpusCase({ id: 'x', agent: 'A', expect: { kind: 'action' } })).toThrow(/requires at least one expected action/);
        expect(() => ParseCorpusCase({ id: 'x', agent: 'A', expect: { kind: 'anyOf' } })).toThrow(/requires a non-empty 'anyOf'/);
    });

    it('honors the optional flag: absent passes, present is still checked', () => {
        const parsed = ParseCorpusCase(wellFormedCase);
        const withoutFormat = NormalizeDecision({ toolCalls: [{ name: 'Run Ad-hoc Query', arguments: { Query: 'SELECT 1 FROM T' } }] });
        expect(EvaluateCorpusExpectation(parsed.id, parsed.expect, withoutFormat).passed).toBe(true);

        const wrongFormat = NormalizeDecision({ toolCalls: [{ name: 'Run Ad-hoc Query', arguments: { Query: 'SELECT 1 FROM T', ResultFormat: 'csv' } }] });
        expect(EvaluateCorpusExpectation(parsed.id, parsed.expect, wrongFormat).passed).toBe(false);
    });

    it('rejects extra actions by default, and tolerates them when the case says so', () => {
        const parsed = ParseCorpusCase(wellFormedCase);
        const extra = NormalizeDecision({ toolCalls: [
            { name: 'Run Ad-hoc Query', arguments: { Query: 'SELECT 1 FROM T' } },
            { name: 'Speculative Extra', arguments: {} }
        ] });
        expect(EvaluateCorpusExpectation(parsed.id, parsed.expect, extra).passed).toBe(false);

        const permissive = ParseCorpusCase({ ...wellFormedCase, expect: { ...wellFormedCase.expect, allowAdditionalActions: true } });
        expect(EvaluateCorpusExpectation(permissive.id, permissive.expect, extra).passed).toBe(true);
    });

    it('resolves anyOf, and on total failure reports the closest branch', () => {
        const ambiguous = ParseCorpusCase({
            id: 'ambiguous-01', agent: 'Sage', description: 'clarify or search — both defensible',
            input: {},
            expect: { kind: 'anyOf', anyOf: [{ kind: 'chat' }, { kind: 'action', actions: [{ name: 'Search' }] }] }
        });
        expect(EvaluateCorpusExpectation('ambiguous-01', ambiguous.expect,
            NormalizeDecision({ text: JSON.stringify({ message: 'which region?', nextStep: { type: 'Chat' } }) })).passed).toBe(true);
        expect(EvaluateCorpusExpectation('ambiguous-01', ambiguous.expect,
            NormalizeDecision({ toolCalls: [{ name: 'Search' }] })).passed).toBe(true);

        const missed = EvaluateCorpusExpectation('ambiguous-01', ambiguous.expect, NormalizeDecision({ text: 'prose' }));
        expect(missed.passed).toBe(false);
        expect(missed.score).toBeGreaterThanOrEqual(0);
    });
});

describe('responseForm and undispatchable turns', () => {
    // Both behaviours were wrong in the first baseline run and each skewed a headline metric.
    it('classifies a responseForm turn as chat', () => {
        // How an MJ agent actually asks a structured question — a chat decision, not 'other'.
        const d = NormalizeDecision({ text: JSON.stringify({
            taskComplete: false,
            message: 'Which entity should I clean up?',
            responseForm: { questions: [{ id: 'entity', title: 'Which entity?', type: { type: 'text' } }] }
        }) });
        expect(d.kind).toBe('chat');
        expect(EvaluateWellFormed({ decision: d }).passed).toBe(true);
    });

    it('lets an explicit nextStep outrank a responseForm', () => {
        const d = NormalizeDecision({ text: JSON.stringify({
            taskComplete: false,
            nextStep: { type: 'Actions', actions: [{ name: 'Get Weather', params: {} }] },
            responseForm: { questions: [] }
        }) });
        expect(d.kind).toBe('action');
    });

    it('marks parsed JSON that is not a LoopAgentResponse as NOT well-formed', () => {
        // The exact shape Cerebras returned in a baseline run. It parses, so it used to
        // score as a "usable envelope response" — but the loop has nothing to dispatch and would
        // force a Retry, which is precisely the malformed cost this suite reports.
        const d = NormalizeDecision({ text: JSON.stringify({ weather: 'unavailable', AAPL_price: 'unavailable' }) });
        expect(d.kind).toBe('other');
        const wf = EvaluateWellFormed({ decision: d });
        expect(wf.passed).toBe(false);
        expect(wf.message).toContain('not a LoopAgentResponse');
    });

    it('still accepts a dispatchable-but-contentless step type', () => {
        // 'Retry' yields no actions or sub-agents, so it classifies as 'other' — but the dispatcher
        // understands it, so it must not be counted malformed.
        const d = NormalizeDecision({ text: JSON.stringify({ taskComplete: false, nextStep: { type: 'Retry' } }) });
        expect(d.kind).toBe('other');
        expect(EvaluateWellFormed({ decision: d }).passed).toBe(true);
    });
});

/**
 * Native tool names are sanitized on the way out (`Execute Code` → `execute_code`), so the
 * normalizer has to un-sanitize before anything is compared — otherwise every correct native call
 * scores as the wrong action and the comparison measures the sanitizer instead of the model.
 */
describe('normalizeDecision — tool name mapping', () => {
    it('reports the Action name, not the wire name', () => {
        const decision = NormalizeDecision({
            toolCalls: [{ name: 'execute_code', arguments: { code: 'print(1)' } }],
            toolNameMap: { execute_code: 'Execute Code' }
        });

        expect(decision.actions).toEqual([{ name: 'Execute Code', params: { code: 'print(1)' } }]);
        expect(decision.encoding).toBe('native');
    });

    it('passes an unmapped name through so an invented tool is still visible', () => {
        const decision = NormalizeDecision({
            toolCalls: [{ name: 'summon_kraken' }],
            toolNameMap: { execute_code: 'Execute Code' }
        });

        expect(decision.actions[0].name).toBe('summon_kraken');
    });

    it('is unchanged when no map is supplied', () => {
        expect(NormalizeDecision({ toolCalls: [{ name: 'execute_code' }] }).actions[0].name).toBe('execute_code');
    });
});
