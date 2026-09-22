/**
 * Implicit control flow in the eval: control tools map to decision kinds, plain
 * text with no call is task completion, and the two new counters (narration, placeholder calls).
 */
import { describe, expect, it } from 'vitest';
import { normalizeDecision, isPlaceholderCall, type RawTurn, type ObservedDecision } from '../eval/decision';
import { evaluateWellFormed } from '../eval/wellFormed';

const controlToolMap = {
    delegate_to_query_strategist: { kind: 'subAgent' as const, name: 'Query Strategist' },
    payload_change_request: { kind: 'payloadChange' as const },
    ask_user: { kind: 'chat' as const }
};
const toolNameMap = { run_ad_hoc_query: 'Run Ad-hoc Query' };
const turn = (text: string, toolCalls: RawTurn['toolCalls']) => normalizeDecision({ text, toolCalls, toolNameMap, controlToolMap, protocol: 'implicit' });

describe('normalizeDecision — implicit control flow', () => {
    it('ask_user → chat with its message', () => {
        expect(turn('', [{ name: 'ask_user', arguments: { message: 'Which one?' } }])).toMatchObject({ kind: 'chat', encoding: 'native', message: 'Which one?' });
    });
    it('a sub-agent tool → subAgent with the agent name', () => {
        const d = turn('', [{ name: 'delegate_to_query_strategist', arguments: { message: 'x' } }]);
        expect(d.kind).toBe('subAgent');
        expect(d.subAgents.map((s) => s.name)).toEqual(['Query Strategist']);
    });
    it('payload_change_request alone → payloadChange carrying the arguments', () => {
        const d = turn('', [{ name: 'payload_change_request', arguments: { newElements: { findings: [1] } } }]);
        expect(d.kind).toBe('payloadChange');
        expect(d.payloadChange).toEqual({ newElements: { findings: [1] } });
    });
    it('action + payload_change_request → action, with payloadChange populated', () => {
        const d = turn('', [{ name: 'run_ad_hoc_query', arguments: { Query: 'q' } }, { name: 'payload_change_request', arguments: { updateElements: { iterations: 2 } } }]);
        expect(d.kind).toBe('action');
        expect(d.actions.map((a) => a.name)).toEqual(['Run Ad-hoc Query']);
        expect(d.payloadChange).toEqual({ updateElements: { iterations: 2 } });
    });
    it('plain text with no call → taskComplete, encoding text', () => {
        expect(turn('Revenue grew 12%.', null)).toMatchObject({ kind: 'taskComplete', encoding: 'text', taskComplete: true, message: 'Revenue grew 12%.', envelopeParsed: null });
    });
    it('text that parses as an envelope is still read as an envelope', () => {
        expect(turn('{"taskComplete":false,"nextStep":{"type":"Chat"},"message":"hi"}', null).kind).toBe('chat');
    });
    it('under the hybrid protocol plain text is still unparseable', () => {
        expect(normalizeDecision({ text: 'Revenue grew.', toolCalls: null, protocol: 'hybrid' }).kind).toBe('unparseable');
    });
    it('a control tool call under the hybrid protocol (no control map) reads as an action under its wire name', () => {
        const d = normalizeDecision({ text: '', toolCalls: [{ name: 'ask_user', arguments: { message: 'x' } }], toolNameMap, protocol: 'hybrid' });
        expect(d.kind).toBe('action');
        expect(d.actions[0].name).toBe('ask_user');
    });
    it('flags narration alongside calls, and placeholder calls as the subset', () => {
        expect(turn('I will search.', [{ name: 'run_ad_hoc_query', arguments: { Query: 'SELECT 1' } }])).toMatchObject({ narrationWithCalls: true, placeholderCall: false });
        expect(turn("I don't have context for that.", [{ name: 'run_ad_hoc_query', arguments: { Query: 'placeholder' } }])).toMatchObject({ narrationWithCalls: true, placeholderCall: true });
        expect(turn('Clarifying first.', [{ name: 'run_ad_hoc_query', arguments: {} }])).toMatchObject({ placeholderCall: true });
        expect(turn('', [{ name: 'run_ad_hoc_query', arguments: { Query: 'SELECT 1' } }])).toMatchObject({ narrationWithCalls: false, placeholderCall: false });
    });
    it('a dual-channel turn (envelope text beside the call) is not narration', () => {
        const d = turn('{"taskComplete":true}', [{ name: 'run_ad_hoc_query', arguments: { Query: 'SELECT 1' } }]);
        expect(d).toMatchObject({ dualChannel: true, narrationWithCalls: false });
    });
});

describe('isPlaceholderCall', () => {
    it('is false without prose', () => {
        expect(isPlaceholderCall([{ name: 'x', arguments: {} }], '')).toBe(false);
    });
    it('is false when any argument is a real value', () => {
        expect(isPlaceholderCall([{ name: 'x', arguments: { Query: 'placeholder', Limit: 5 } }], 'hi')).toBe(false);
    });
    it('recognises the phrases seen in run 7', () => {
        expect(isPlaceholderCall([{ name: 'x', arguments: { TaskDescription: 'none needed, clarifying first' } }], 'hi')).toBe(true);
    });
});

describe('evaluateWellFormed — a plain-text terminal is usable under implicit', () => {
    it('passes a text-encoded taskComplete', () => {
        const decision: ObservedDecision = { kind: 'taskComplete', encoding: 'text', actions: [], subAgents: [], taskComplete: true, message: 'Done.', envelopeParsed: null };
        const r = evaluateWellFormed({ decision });
        expect(r.passed).toBe(true);
        expect(r.message).toMatch(/usable text response/);
    });
});

import { evaluateDecision } from '../eval/expectation';
import { toDecisionExpectation, parseCorpusCase } from '../eval/corpus';

describe('payloadChange expectations', () => {
    const observedPayload = (kind: 'payloadChange' | 'action', payloadChange: Record<string, unknown>): ObservedDecision => ({
        kind, encoding: 'native', actions: kind === 'action' ? [{ name: 'Execute Code', params: {} }] : [], subAgents: [], taskComplete: false, envelopeParsed: null, payloadChange
    });

    it('kind payloadChange matches a mixed action+payload turn too', () => {
        const e = evaluateDecision({ kind: 'payloadChange' }, observedPayload('action', { updateElements: { iterations: 2 } }));
        expect(e.decisionKindMatch).toBe(true);
    });
    it('payload matchers address dotted paths into the change request', () => {
        const e = evaluateDecision(
            { kind: 'payloadChange', payload: [{ param: 'newElements.findings', matcher: { kind: 'nonEmpty' } }] },
            observedPayload('payloadChange', { newElements: { findings: [{ content: 'x' }] } }));
        expect(e.passed).toBe(true);
        expect(e.paramFidelity).toBe(1);
    });
    it('a missing path fails its matcher and names it', () => {
        const e = evaluateDecision(
            { kind: 'payloadChange', payload: [{ param: 'newElements.findings', matcher: { kind: 'nonEmpty' } }] },
            observedPayload('payloadChange', { updateElements: { iterations: 2 } }));
        expect(e.passed).toBe(false);
        expect(e.messages.join(' ')).toMatch(/payload newElements\.findings/);
    });
    it('forbiddenPayloadPaths fail when written', () => {
        const e = evaluateDecision(
            { kind: 'payloadChange', forbiddenPayloadPaths: ['newElements.brand', 'updateElements.brand'] },
            observedPayload('payloadChange', { updateElements: { brand: { voice: 'x' } } }));
        expect(e.passed).toBe(false);
        expect(e.forbiddenViolations).toEqual(['payload:updateElements.brand']);
    });
    it('the corpus loader accepts payload matchers and forbidden paths', () => {
        const exp = toDecisionExpectation('c', { kind: 'payloadChange', payload: { 'newElements.findings': { matcher: 'nonEmpty' } }, forbiddenPayloadPaths: ['newElements.brand'] });
        expect(exp.payload?.[0].param).toBe('newElements.findings');
        expect(exp.forbiddenPayloadPaths).toEqual(['newElements.brand']);
    });
});

describe('per-case toolChoice (Plan B, Task 1)', () => {
    const base = { id: 'x', agent: 'Sage', description: 'd', input: {}, expect: { kind: 'taskComplete' } };
    it('accepts none/auto/required on input', () => {
        expect(parseCorpusCase({ ...base, input: { toolChoice: 'none' } }).input.toolChoice).toBe('none');
    });
    it('rejects an unknown value at load time, naming the case', () => {
        expect(() => parseCorpusCase({ ...base, input: { toolChoice: 'sometimes' } })).toThrow(/toolChoice/);
    });
});

import { encodeHistoryForArm } from '../eval/history';
describe('encodeHistoryForArm', () => {
    const history = [
        { role: 'user', content: 'Count active agents.' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_0', name: 'run_ad_hoc_query', arguments: { Query: 'SELECT COUNT(*) …' } }] },
        { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'call_0', toolName: 'run_ad_hoc_query', content: '| n |\n| 12 |', isError: false }] }
    ] as never[];
    it('passes tool-form history through for a native-results arm', () => {
        expect(encodeHistoryForArm(history, true)).toEqual(history);
    });
    it('renders the corpus prose form otherwise: the call turn is dropped, each result becomes an [Action Result] user message', () => {
        const out = encodeHistoryForArm(history, false);
        expect(out.map((m) => m.role)).toEqual(['user', 'user']);
        expect(out[1].content).toBe('[Action Result] run_ad_hoc_query succeeded. | n |\n| 12 |');
    });
    it('keeps an assistant turn that carried narration, minus its calls', () => {
        const out = encodeHistoryForArm([{ ...(history[1] as object), content: 'Let me count.' }, history[2]] as never[], false);
        expect(out[0]).toEqual({ role: 'assistant', content: 'Let me count.' });
    });
    it('marks a failed result', () => {
        const failed = [history[1], { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'call_0', toolName: 'run_ad_hoc_query', content: 'Invalid column', isError: true }] }] as never[];
        expect(encodeHistoryForArm(failed, false)[0].content).toBe('[Action Result] run_ad_hoc_query failed. Invalid column');
    });
});
