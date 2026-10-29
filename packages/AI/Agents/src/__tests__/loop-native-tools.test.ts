import { describe, it, expect } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import type { ActionToolBinding } from '../native-tools/action-tool-builder';
import type { NativeToolBinding } from '../native-tools/control-tools';
import { RecordToolCallingDecision, type ToolCallingMode } from '@memberjunction/ai-prompts';
import { CHAT_FINISH_REASON_MALFORMED_TOOL_CALL, type ChatResult } from '@memberjunction/ai';
import type { AIPromptRunResult, BaseAgentNextStep } from '@memberjunction/ai-core-plus';

/** Reaches the protected helper without executing a loop. */
class Probe extends LoopAgentType {
    public Call(result: AIPromptRunResult, bindings?: ReadonlyMap<string, NativeToolBinding>, relaxedTurnShapes = false): BaseAgentNextStep | null {
        return this.nextStepFromNativeToolCalls(result, bindings, relaxedTurnShapes);
    }
}

const resultWithCalls = (calls: Array<{ name: string; arguments?: Record<string, unknown> }> | undefined): AIPromptRunResult =>
    ({ success: true, chatResult: { data: { choices: [{ message: { toolCalls: calls } }] } } } as unknown as AIPromptRunResult);

const binding = (toolName: string, actionName: string): ActionToolBinding =>
    ({ kind: 'action', toolName, action: { Name: actionName }, tool: { name: toolName, inputSchema: {} }, params: [] } as unknown as ActionToolBinding);

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

    it('decodes a Simple Object argument the model sent as a JSON string before the Action sees it', () => {
        const withObjectParam = new Map([['test_sql_statement', {
            kind: 'action', toolName: 'test_sql_statement', action: { Name: 'Test SQL Statement' },
            tool: { name: 'test_sql_statement', inputSchema: {} },
            params: [{ Name: 'Parameters', ValueType: 'Simple Object', IsArray: false }]
        } as unknown as ActionToolBinding]]);
        const step = new Probe().Call(
            resultWithCalls([{ name: 'test_sql_statement', arguments: { SQL: 'SELECT 1', Parameters: '{"TopCount": 10}' } }]), withObjectParam);
        expect(step?.actions?.[0].params).toEqual({ SQL: 'SELECT 1', Parameters: { TopCount: 10 } });
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
    ({ kind: 'action', toolName, action: { Name: actionName }, tool: { name: toolName, inputSchema: {} }, params: [] } as unknown as NativeToolBinding);
const subAgentBinding = (toolName: string, agentName: string): NativeToolBinding =>
    ({ kind: 'subAgent', toolName, agent: { Name: agentName }, tool: { name: toolName, inputSchema: {} } } as unknown as NativeToolBinding);
const full = new Map<string, NativeToolBinding>([
    ['run_ad_hoc_query', actionBinding('run_ad_hoc_query', 'Run Ad-hoc Query')],
    ['delegate_to_query_strategist', subAgentBinding('delegate_to_query_strategist', 'Query Strategist')],
    ['delegate_to_editor_agent', subAgentBinding('delegate_to_editor_agent', 'Editor Agent')],
    ['payload_change_request', { kind: 'payloadChange', toolName: 'payload_change_request', tool: { name: 'payload_change_request', inputSchema: {} } } as NativeToolBinding],
    ['ask_user', { kind: 'askUser', toolName: 'ask_user', tool: { name: 'ask_user', inputSchema: {} } } as NativeToolBinding],
    ['complete_task', { kind: 'complete', toolName: 'complete_task', tool: { name: 'complete_task', inputSchema: {} } } as NativeToolBinding]
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
    it('ask_user with an Action → Retry: ask_user must be the only call on its turn', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/ask_user must be the only call/);
        expect(step?.actions).toBeUndefined();
    });
    it('ask_user with a payload write → Retry, and the write is not applied', () => {
        const step = P().Call(resultWith([{ name: 'payload_change_request', arguments: { newElements: { a: 1 } } }, { name: 'ask_user', arguments: { message: 'x' } }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/ask_user must be the only call/);
        expect(step?.payloadChangeRequest).toBeUndefined();
        expect(step?.agentToolCalls).toBeUndefined();
    });
    it('two ask_user calls → Retry', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }, { name: 'ask_user', arguments: { message: 'y' } }], 'NativeImplicit'), full);
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
    it('sub-agent + action in one turn → Retry: delegate or act', () => {
        const step = P().Call(resultWith([{ name: 'delegate_to_editor_agent', arguments: { message: 'b' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/Delegate or act/);
    });
    it('several payload_change_request calls → Retry asking for one combined call', () => {
        const step = P().Call(resultWith([
            { name: 'payload_change_request', arguments: { newElements: { a: 1 } } },
            { name: 'payload_change_request', arguments: { updateElements: { a: 2 } } }
        ], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/at most once per turn; combine/);
        expect(step?.agentToolCalls).toBeUndefined();
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
    it('complete_task → terminal Success carrying its payload change, message and call id (one turn, not two)', () => {
        const change = { updateElements: { query: { sql: 'SELECT 1' } } };
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'Done.', payloadChangeRequest: change } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Success', terminate: true, message: 'Done.', payloadChangeRequest: change, payloadToolCallId: 'call_0' });
    });
    it('complete_task without a payload change → Success with no payloadChangeRequest', () => {
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'Answered.' } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Success', message: 'Answered.' });
        expect(step?.payloadChangeRequest).toBeUndefined();
    });
    it('complete_task accepts a payloadChangeRequest the model JSON-encoded', () => {
        const change = { newElements: { a: 1 } };
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'x', payloadChangeRequest: JSON.stringify(change) } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Success', payloadChangeRequest: change });
    });
    it('complete_task repairs a payloadChangeRequest whose layout the model wrote as escapes', () => {
        // Gemini 3.8 Flash on a forced final turn: after a long SQL value the closing braces came
        // as `\n    }\n  }\n}` escapes. Rejecting it turned a finished answer into a failed run.
        const encoded = '{\n  "updateElements": {\n    "query": {\n      "sql": "SELECT 1\\nORDER BY 1"\\n    }\\n  }\\n}';
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'Done.', payloadChangeRequest: encoded } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Success', payloadChangeRequest: { updateElements: { query: { sql: 'SELECT 1\nORDER BY 1' } } } });
    });
    it('complete_task with an unparseable payloadChangeRequest → Retry quoting the parse error', () => {
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'x', payloadChangeRequest: '{"updateElements": {"query": }}' } }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/payloadChangeRequest must be an object.*Problem: .*JSON/);
    });
    it.each(['', '   ', 'null'])('complete_task with payloadChangeRequest %j → Success, as if it were omitted', (value) => {
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'Done.', payloadChangeRequest: value } }], 'NativeImplicit'), full);
        expect(step).toMatchObject({ step: 'Success', message: 'Done.' });
        expect(step?.payloadChangeRequest).toBeUndefined();
    });
    it('complete_task with an unusable payloadChangeRequest → Retry naming the rule', () => {
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'x', payloadChangeRequest: 'not json' } }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/payloadChangeRequest must be an object/);
    });
    it('complete_task with an Action → Retry: complete_task must be the only call on its turn', () => {
        const step = P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'x' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/complete_task must be the only call/);
    });
    it('complete_task after a payload write → Retry, and the write is not applied', () => {
        const step = P().Call(resultWith([
            { name: 'payload_change_request', arguments: { newElements: { a: 1 } } },
            { name: 'complete_task', arguments: { message: 'done' } }
        ], 'NativeImplicit'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/complete_task must be the only call/);
        expect(step?.payloadChangeRequest).toBeUndefined();
    });
    it('under the HYBRID mode complete_task is an undeclared tool → Retry', () => {
        expect(P().Call(resultWith([{ name: 'complete_task', arguments: { message: 'x' } }], 'Native'), full)?.step).toBe('Retry');
    });
    it('under the HYBRID mode a control-tool call is an undeclared tool → Retry (it was stripped from the request)', () => {
        const step = P().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }], 'Native'), full);
        expect(step?.step).toBe('Retry');
        expect(step?.errorMessage).toMatch(/not a tool/);
    });
});

describe('LoopAgentType — relaxed turn shapes (NativeControl.RelaxedTurnShapes)', () => {
    const R = () => new Probe();
    it('ask_user with an Action → the Action runs, and ask_user is answered as not run', () => {
        const step = R().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full, true);
        expect(step?.step).toBe('Actions');
        expect(step?.actions?.map((a) => a.name)).toEqual(['Run Ad-hoc Query']);
        expect(step?.declinedToolCalls).toEqual([expect.objectContaining({ toolCallId: 'call_0', toolName: 'ask_user' })]);
    });
    it('ask_user with a payload write → the write is ordered with the question, answered on its own', () => {
        const step = R().Call(resultWith([{ name: 'payload_change_request', arguments: { newElements: { a: 1 } } }, { name: 'ask_user', arguments: { message: 'x' } }], 'NativeImplicit'), full, true);
        expect(step).toMatchObject({ step: 'Chat', message: 'x' });
        expect(step?.payloadChangeRequest).toBeUndefined();
        expect(step?.agentToolCalls).toEqual([{ toolCallId: 'call_0', toolName: 'payload_change_request', arguments: { newElements: { a: 1 } } }]);
    });
    it('two ask_user calls → Retry', () => {
        const step = R().Call(resultWith([{ name: 'ask_user', arguments: { message: 'x' } }, { name: 'ask_user', arguments: { message: 'y' } }], 'NativeImplicit'), full, true);
        expect(step?.errorMessage).toMatch(/at most once per turn/);
    });
    it('sub-agent + action in one turn → the Action runs, and the delegation is answered as not run', () => {
        const step = R().Call(resultWith([{ name: 'delegate_to_editor_agent', arguments: { message: 'b' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full, true);
        expect(step?.step).toBe('Actions');
        expect(step?.subAgent).toBeUndefined();
        expect(step?.declinedToolCalls).toEqual([expect.objectContaining({ toolCallId: 'call_0', toolName: 'delegate_to_editor_agent' })]);
    });
    it('several payload_change_request calls → each one an ordered write, none on the step\'s own channel', () => {
        const step = R().Call(resultWith([
            { name: 'payload_change_request', arguments: { newElements: { a: 1 } } },
            { name: 'payload_change_request', arguments: { updateElements: { a: 2 } } }
        ], 'NativeImplicit'), full, true);
        expect(step?.step).toBe('Retry');
        expect(step?.payloadChangeRequest).toBeUndefined();
        expect(step?.agentToolCalls?.map((c) => [c.toolCallId, c.arguments])).toEqual([['call_0', { newElements: { a: 1 } }], ['call_1', { updateElements: { a: 2 } }]]);
    });
    it('complete_task with an Action → the Action runs, and complete_task is answered as not run', () => {
        const step = R().Call(resultWith([{ name: 'complete_task', arguments: { message: 'x' } }, { name: 'run_ad_hoc_query', arguments: {} }], 'NativeImplicit'), full, true);
        expect(step?.step).toBe('Actions');
        expect(step?.declinedToolCalls).toEqual([expect.objectContaining({ toolCallId: 'call_0', toolName: 'complete_task' })]);
        expect(step?.declinedToolCalls?.[0].reason).toMatch(/read their results/);
    });
    it('complete_task after payload writes → the writes run in order, then the task completes', () => {
        const step = R().Call(resultWith([
            { name: 'payload_change_request', arguments: { newElements: { a: 1 } } },
            { name: 'complete_task', arguments: { message: 'done' } }
        ], 'NativeImplicit'), full, true);
        expect(step).toMatchObject({ step: 'Success', message: 'done', payloadToolCallId: 'call_1' });
        expect(step?.agentToolCalls?.map((c) => c.toolName)).toEqual(['payload_change_request']);
    });
    it('complete_task carrying its own payload change after other writes → declined, so the writes keep their order', () => {
        const step = R().Call(resultWith([
            { name: 'payload_change_request', arguments: { newElements: { a: 1 } } },
            { name: 'complete_task', arguments: { message: 'done', payloadChangeRequest: { updateElements: { a: 2 } } } }
        ], 'NativeImplicit'), full, true);
        expect(step?.step).toBe('Retry');
        expect(step?.declinedToolCalls?.[0].reason).toMatch(/call complete_task again/);
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
    it('unreadable JSON under implicit → Retry pointing at complete_task, never a completion that drops its payload', async () => {
        // Text that fails the envelope parse must not be accepted as the final answer, or its payload is lost.
        const step = await probe.Decide(resultWith(undefined, 'NativeImplicit', '{ "reasoning": "Tested the query", "payloadChangeRequest": { "updateElements": '));
        expect(step.step).toBe('Retry');
        expect(step.errorMessage).toMatch(/complete_task/);
    });
    it.each(['```sql\nSELECT 1\n```', '{curly} braces open this sentence.'])('prose that merely starts with a fence or a brace still completes (%j)', async (text) => {
        const step = await probe.Decide(resultWith(undefined, 'NativeImplicit', text));
        expect(step).toMatchObject({ step: 'Success', message: text });
    });
    it('a fenced JSON block that cannot be read under implicit → the same Retry', async () => {
        const step = await probe.Decide(resultWith(undefined, 'NativeImplicit', '```json\n{ "reasoning": "x"'));
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

describe('LoopAgentType — a tool call the provider rejected', () => {
    class RejectProbe extends LoopAgentType {
        public async Determine(result: AIPromptRunResult, bindings?: ReadonlyMap<string, NativeToolBinding>): Promise<BaseAgentNextStep> {
            return this.DetermineNextStep(result, { agent: { Name: 'Probe' } } as never, {}, {}, bindings);
        }
    }
    const rejected = (finish_reason: string, finishMessage?: string): AIPromptRunResult =>
        ({ success: true, result: '', chatResult: { data: { choices: [{ message: { content: '' }, finish_reason, finishMessage }] } } } as unknown as AIPromptRunResult);

    it('retries an unexpected call, naming the tools that are available and what the provider received', async () => {
        const step = await new RejectProbe().Determine(rejected('unexpected_tool_call', 'Unexpected tool call: delete_everything'), bindings);

        expect(step.step).toBe('Retry');
        expect(step.errorMessage).toContain('not available on this turn');
        expect(step.errorMessage).toContain('run_ad_hoc_query');
        expect(step.errorMessage).toContain('Unexpected tool call: delete_everything');
    });

    it('retries a malformed call, quoting what the provider received', async () => {
        const step = await new RejectProbe().Determine(rejected(CHAT_FINISH_REASON_MALFORMED_TOOL_CALL, 'The arguments of search_web were not a JSON object: {"q'), bindings);

        expect(step.errorMessage).toContain('malformed function call');
        expect(step.errorMessage).toContain('{"q');
    });
});

describe('LoopAgentType — corrective retries say only what this agent can do', () => {
    const withoutComplete = new Map([...full].filter(([name]) => name !== 'complete_task'));
    const decide = (result: AIPromptRunResult, bindings: ReadonlyMap<string, NativeToolBinding>, typeConfiguration: string | null = null) =>
        new (class extends LoopAgentType {
            public Decide() { return this.DetermineNextStep(result, { agent: { Name: 'T', TypeConfiguration: typeConfiguration } } as never, {}, {}, bindings); }
        })().Decide();
    const unexpected = (mode: string): AIPromptRunResult => {
        const result = resultWith(undefined, mode);
        const choice = result.chatResult!.data.choices[0] as unknown as { finish_reason: string };
        choice.finish_reason = 'unexpected_tool_call';
        return result;
    };

    it('an unknown tool under implicit control flow names complete_task, not the envelope', () => {
        const step = new Probe().Call(resultWith([{ name: 'not_a_tool' }], 'NativeImplicit'), full);
        expect(step?.errorMessage).toMatch(/call complete_task when the task is done/);
        expect(step?.errorMessage).not.toMatch(/JSON envelope/);
    });

    it('an unknown tool for a text-terminal agent says to reply in plain text', () => {
        const step = new Probe().Call(resultWith([{ name: 'not_a_tool' }], 'NativeImplicit'), withoutComplete);
        expect(step?.errorMessage).toMatch(/reply in plain text when the task is done/);
    });

    it('an unknown tool on a hybrid turn still points at the envelope', () => {
        const step = new Probe().Call(resultWith([{ name: 'not_a_tool' }], 'Native'), full);
        expect(step?.errorMessage).toMatch(/JSON envelope/);
    });

    it('unreadable JSON on a native-only, text-terminal turn names neither complete_task nor the envelope step types', async () => {
        const step = await decide(resultWith(undefined, 'NativeImplicit', '{"taskComplete": tru'), withoutComplete, JSON.stringify({ NativeControl: { NativeOnly: true, Terminal: 'text' } }));
        expect(step.step).toBe('Retry');
        expect(step.errorMessage).toMatch(/reply with your answer in plain text/);
        expect(step.errorMessage).toMatch(/do not write JSON/);
        expect(step.errorMessage).not.toMatch(/complete_task|nextStep/);
    });

    it('an unexpected-tool rejection on a hybrid turn lists only the tools that request carried', async () => {
        const step = await decide(unexpected('Native'), full);
        expect(step.errorMessage).toMatch(/available on this turn are: run_ad_hoc_query\./);
        expect(step.errorMessage).not.toMatch(/complete_task|ask_user|payload_change_request|delegate_to/);
        expect(step.errorMessage).toMatch(/respond with the JSON envelope/);
    });

    it('an unexpected-tool rejection under implicit control flow lists the control tools too', async () => {
        const step = await decide(unexpected('NativeImplicit'), full);
        expect(step.errorMessage).toMatch(/complete_task/);
        expect(step.errorMessage).toMatch(/reply in plain text/);
    });
});

describe('LoopAgentType — which turn shape the runner recorded', () => {
    const framework = new Map<string, NativeToolBinding>([...full, ['scratchpad_write', { kind: 'agentTool', toolName: 'scratchpad_write', tool: { name: 'scratchpad_write', inputSchema: {} } } as unknown as NativeToolBinding]]);

    it('a framework tool on a hybrid turn is an undeclared tool: the request did not carry it', () => {
        const step = new Probe().Call(resultWith([{ name: 'scratchpad_write', arguments: { notes: 'x' } }], 'Native'), framework);
        expect(step?.step).toBe('Retry');
        expect(step?.agentToolCalls).toBeUndefined();
        expect(step?.errorMessage).toMatch(/not a tool/);
    });

    it('reads the mode from the chat result, not the prompt-run record a late reload can reset', () => {
        const result = resultWith([{ name: 'ask_user', arguments: { message: 'Which entity?' } }], 'NativeImplicit');
        (result.promptRun as unknown as { ToolCallingMode: string | null }).ToolCallingMode = null;
        expect(new Probe().Call(result, full)).toMatchObject({ step: 'Chat', message: 'Which entity?' });
    });
});
