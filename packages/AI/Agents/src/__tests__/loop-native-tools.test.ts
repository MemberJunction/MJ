import { describe, it, expect } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import type { ActionToolBinding } from '../native-tools/action-tool-builder';
import type { NativeToolBinding } from '../native-tools/control-tools';
import { RecordToolCallingDecision, type ToolCallingMode } from '@memberjunction/ai-prompts';
import { CHAT_FINISH_REASON_MALFORMED_TOOL_CALL, type ChatResult } from '@memberjunction/ai';
import type { AIPromptRunResult, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

/** Reaches the protected helper without executing a loop. */
class Probe extends LoopAgentType {
    public Call(result: AIPromptRunResult, bindings?: ReadonlyMap<string, NativeToolBinding>): BaseAgentNextStep | null {
        return this.nextStepFromNativeToolCalls(result, bindings);
    }
}

const resultWithCalls = (calls: Array<{ name: string; arguments?: Record<string, unknown> }> | undefined): AIPromptRunResult =>
    ({ success: true, chatResult: { data: { choices: [{ message: { toolCalls: calls } }] } } } as unknown as AIPromptRunResult);

const binding = (toolName: string, actionName: string): ActionToolBinding =>
    ({ kind: 'action', toolName, action: { Name: actionName }, tool: { name: toolName, inputSchema: {} } } as unknown as ActionToolBinding);

const bindings = new Map([['run_ad_hoc_query', binding('run_ad_hoc_query', 'Run Ad-hoc Query')]]);

describe('LoopAgentType — native tool calls as an Actions step (plan §8.1)', () => {
    it('returns null when the turn had no tool calls, so the envelope path runs', () => {
        expect(new Probe().Call(resultWithCalls(undefined), bindings)).toBeNull();
        expect(new Probe().Call(resultWithCalls([]), bindings)).toBeNull();
    });

    it('maps a tool call to an Actions step under the ACTION name, not the tool name', () => {
        // Downstream dispatch resolves by Action name; handing back 'run_ad_hoc_query' would
        // resolve to nothing.
        const step = new Probe().Call(
            resultWithCalls([{ name: 'run_ad_hoc_query', arguments: { Query: 'SELECT 1' } }]), bindings);
        expect(step?.step).toBe('Actions');
        expect(step?.terminate).toBe(false);
        expect(step?.actions).toEqual([{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } }]);
    });

    it('carries several calls from one turn', () => {
        const two = new Map(bindings);
        two.set('get_weather', binding('get_weather', 'Get Weather'));
        const step = new Probe().Call(resultWithCalls([
            { name: 'run_ad_hoc_query', arguments: {} }, { name: 'get_weather', arguments: { city: 'Paris' } }
        ]), two);
        expect(step?.actions?.map((a) => a.name)).toEqual(['Run Ad-hoc Query', 'Get Weather']);
    });

    it('defaults missing arguments to an empty params object', () => {
        const step = new Probe().Call(resultWithCalls([{ name: 'run_ad_hoc_query' }]), bindings);
        expect(step?.actions?.[0].params).toEqual({});
    });

    it('retries — never silently drops — a call naming an undeclared tool', () => {
        // Cerebras is documented to do this; measurement put it at ~1 forced call in 6 naming a
        // different tool. Silence would look like a hang.
        const step = new Probe().Call(resultWithCalls([{ name: 'not_a_tool' }]), bindings);
        expect(step?.step).toBe('Retry');
        // createRetryStep carries corrective feedback in errorMessage, as the envelope-parse retry does.
        expect(step?.errorMessage).toContain('not_a_tool');
    });

    it('retries when tool calls arrive on a turn that declared no tools', () => {
        const step = new Probe().Call(resultWithCalls([{ name: 'anything' }]), undefined);
        expect(step?.step).toBe('Retry');
    });
});

// ---------------------------------------------------------------------------------------------
// Implicit control flow — one test per row of the turn-reading table.
// ---------------------------------------------------------------------------------------------
const resultWith = (calls: Array<{ name: string; arguments?: Record<string, unknown> }> | undefined, mode: string = 'Native', text = '', opts: { toolResults?: boolean } = {}): AIPromptRunResult => {
    const withIds = calls?.map((c, i) => ({ id: `call_${i}`, ...c }));
    const chatResult = { data: { choices: [{ message: { toolCalls: withIds, content: text } }] } } as unknown as ChatResult;
    // The runner tags the chat result with its decision; the loop reads `toolResults` back from it.
    RecordToolCallingDecision(chatResult, { useNativeTools: mode !== 'Envelope', mode: mode as ToolCallingMode, controlFlow: mode === 'NativeImplicit' ? 'implicit' : 'envelope', toolResults: opts.toolResults === true });
    return { success: true, result: text, rawResult: text, promptRun: { ToolCallingMode: mode }, chatResult } as unknown as AIPromptRunResult;
};
const actionBinding = (toolName: string, actionName: string): NativeToolBinding =>
    ({ kind: 'action', toolName, action: { Name: actionName }, tool: { name: toolName, inputSchema: {} } } as unknown as NativeToolBinding);
const subAgentBinding = (toolName: string, agentName: string): NativeToolBinding =>
    ({ kind: 'subAgent', toolName, agent: { Name: agentName }, tool: { name: toolName, inputSchema: {} } } as unknown as NativeToolBinding);
const full = new Map<string, NativeToolBinding>([
    ['run_ad_hoc_query', actionBinding('run_ad_hoc_query', 'Run Ad-hoc Query')],
    ['delegate_to_query_strategist', subAgentBinding('delegate_to_query_strategist', 'Query Strategist')],
    ['delegate_to_editor_agent', subAgentBinding('delegate_to_editor_agent', 'Editor Agent')],
    ['payload_change_request', { kind: 'payloadChange', toolName: 'payload_change_request', tool: { name: 'payload_change_request', inputSchema: {} } } as NativeToolBinding],
    ['ask_user', { kind: 'askUser', toolName: 'ask_user', tool: { name: 'ask_user', inputSchema: {} } } as NativeToolBinding]
]);

describe('LoopAgentType — implicit control flow routing (spec §2.1)', () => {
    const P = () => new Probe();
    it('ask_user alone → Chat, terminate, with the message', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'Which entity?' } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Chat', terminate: true, message: 'Which entity?' });
    });
    it('ask_user with a responseForm → Chat carrying the form (results §16.7)', () => {
        const form = { title: 'Next step', questions: [{ id: 'nextAction', label: 'What next?', type: { type: 'buttongroup', options: [{ value: 'a', label: 'A' }] } }] };
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'Pick one', responseForm: form } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Chat', terminate: true, message: 'Pick one', responseForm: form });
    });
    it('ask_user with a malformed responseForm (no questions) → Retry naming the rule', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'Pick one', responseForm: { title: 'x' } } }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/responseForm/);
    });
    it('ask_user without a message → Retry', () => {
        expect(P().Call(resultWith([{ name: 'ask_user', arguments: {} }], 'NativeImplicit'), full)?.step).toBe('Retry');
    });
    it('ask_user with any other call → Retry naming the rule', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/ask_user must be the only call/);
    });
    it('one sub-agent tool → Sub-Agent step with subAgent, terminateAfter defaulting false', () => {
        const step = P().Call(resultWith([{ name: 'delegate_to_query_strategist', arguments: { message: 'Plan it' } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Sub-Agent', terminate: false, subAgent: { name: 'Query Strategist', message: 'Plan it', terminateAfter: false } });
        expect(step?.subAgents).toBeUndefined();
    });
    it('several sub-agent tools → parallel subAgents[]', () => {
        const step = P().Call(resultWith([
            { name: 'delegate_to_query_strategist', arguments: { message: 'a', terminateAfter: true } },
            { name: 'delegate_to_editor_agent', arguments: { message: 'b' } }], 'NativeImplicit'), full);
        expect(step?.subAgents?.map((s) => [s.name, s.terminateAfter])).toEqual([['Query Strategist', true], ['Editor Agent', false]]);
    });
    it('sub-agent + action in one turn → Retry', () => {
        const step = P().Call(resultWith([{ name: 'delegate_to_editor_agent', arguments: { message: 'b' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/delegate or act/i);
    });
    it('payload_change_request alone → non-terminal Retry carrying the change and an instruction to continue', () => {
        const change = { newElements: { findings: [{ content: 'x' }] } };
        const step = P().Call(resultWith([{ name: 'payload_change_request', arguments: change }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Retry', terminate: false, payloadChangeRequest: change });
        expect(step?.retryInstructions).toMatch(/applied/i);
        expect(step?.errorMessage).toBeUndefined();
    });
    it('action + payload_change_request → Actions step with the change attached (mixed-decision turn)', () => {
        const change = { updateElements: { iterations: 2 } };
        const step = P().Call(resultWith([{ name: 'run_ad_hoc_query', arguments: { Query: 'SELECT 1' } }, { name: 'payload_change_request', arguments: change }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Actions', actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'SELECT 1' } }], payloadChangeRequest: change });
    });
    it('two payload_change_request calls in one turn → Retry', () => {
        const step = P().Call(resultWith([{ name: 'payload_change_request', arguments: {} }, { name: 'payload_change_request', arguments: {} }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
    });
    it('under the HYBRID mode a control-tool call is an undeclared tool → Retry (it was stripped from the request)', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }], 'Native'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/not a tool/);
    });
});

describe('LoopAgentType — plain text completes under implicit control flow', () => {
    const probe = new (class extends LoopAgentType {
        public Decide(result: AIPromptRunResult) { return this.DetermineNextStep(result, { agent: { Name: 'T' } } as never, {}, {}, full); }
    })();
    it('prose with no call → Success with the prose as the message (NativeImplicit)', async () => {
        const step = await probe.Decide(resultWith(undefined, 'NativeImplicit', 'Here is the report: revenue grew 12%.'));
        expect(step).toMatchObject({ step: 'Success', terminate: true, message: 'Here is the report: revenue grew 12%.' });
    });
    it('prose with no call under the hybrid → the existing JSON-only Retry', async () => {
        const step = await probe.Decide(resultWith(undefined, 'Native', 'Here is the report.'));
        expect(step.step).toBe('Retry');
    });
    it('a valid envelope under implicit is still honoured (fallback row)', async () => {
        const step = await probe.Decide(resultWith(undefined, 'NativeImplicit', '{"taskComplete":false,"nextStep":{"type":"Retry","reason":"x"}}'));
        expect(step.step).toBe('Retry');
    });
    it('empty text and no call → the pre-existing Failed step ("Prompt execution failed"), even under implicit', async () => {
        const step = await probe.Decide(resultWith(undefined, 'NativeImplicit', ''));
        expect(step.step).toBe('Failed');
    });
});

describe('native turn threading', () => {
    it('an Actions step carries nativeTurn and each action its toolCallId', () => {
        const r = resultWith([{ name: 'run_ad_hoc_query', arguments: { Query: 'q' } }], 'NativeImplicit', 'checking', { toolResults: true });
        const step = new Probe().Call(r, full)!;
        expect(step.nativeTurn).toMatchObject({ text: 'checking', sendResultsNatively: true });
        expect(step.nativeTurn?.toolCalls.map((c) => c.id)).toEqual(['call_0']);
        expect(step.actions?.[0].toolCallId).toBe('call_0');
    });
    it('sub-agent requests carry their call ids; the payload-only retry carries payloadToolCallId', () => {
        const s1 = new Probe().Call(resultWith([{ name: 'delegate_to_query_strategist', arguments: { message: 'x' } }], 'NativeImplicit'), full)!;
        expect(s1.subAgent?.toolCallId).toBe('call_0');
        const s2 = new Probe().Call(resultWith([{ name: 'payload_change_request', arguments: { newElements: { a: 1 } } }], 'NativeImplicit'), full)!;
        expect(s2.payloadToolCallId).toBe('call_0');
        expect(s2.nativeTurn?.toolCalls).toHaveLength(1);
    });
    it('sendResultsNatively is false when the catalog did not ask', () => {
        const step = new Probe().Call(resultWith([{ name: 'run_ad_hoc_query', arguments: {} }], 'Native'), full)!;
        expect(step.nativeTurn?.sendResultsNatively).toBe(false);
    });
    it('a Retry for an unknown tool still carries the turn, so it too can be replayed', () => {
        const step = new Probe().Call(resultWith([{ name: 'nonexistent_tool', arguments: {} }], 'NativeImplicit'), full)!;
        expect(step.step).toBe('Retry');
        expect(step.nativeTurn?.toolCalls[0].name).toBe('nonexistent_tool');
    });
});

describe('LoopAgentType — a malformed native tool call is a corrective Retry (results §16.7)', () => {
    const malformed = (text: string, mode: string): AIPromptRunResult => {
        const r = resultWith(undefined, mode, text);
        (r.chatResult as unknown as { data: { choices: Array<{ finish_reason?: string }> } }).data.choices[0].finish_reason = CHAT_FINISH_REASON_MALFORMED_TOOL_CALL;
        return r;
    };
    it('under implicit, the leftover narration is NOT read as a completion', async () => {
        const step = await new LoopAgentType().DetermineNextStep(malformed('Let me write the payload with payload_change_request wi', 'NativeImplicit'), {} as never, {}, undefined, full);
        expect(step.step).toBe('Retry');
        expect(step.errorMessage).toMatch(/malformed function call/i);
    });
    it('under the hybrid, the same marker is a Retry too (not the generic JSON-only corrective)', async () => {
        const step = await new LoopAgentType().DetermineNextStep(malformed('some narration', 'Native'), {} as never, {}, undefined, full);
        expect(step.step).toBe('Retry');
        expect(step.errorMessage).toMatch(/malformed function call/i);
    });
});
