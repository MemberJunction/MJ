/**
 * Declaration is controlled per agent and per agent-action, on the SUPPLY
 * side — mirroring the agent-type gate that already lives in applyNativeActionTools. Decision 3:
 * a native step whose turn also carried a parseable envelope is recorded, never silently dropped.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The declaration path reads AIEngine.Instance.AgentActions for the per-action opt-out; give it an
// empty catalog so the tests below exercise the tool set without a database.
vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, AIEngine: { Instance: { AgentActions: [] } } };
});
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { looksLikeLoopEnvelope } from '../native-tools/dual-channel';
import type { AIPromptParams, AIPromptRunResult, ExecuteAgentParams, MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';

class Probe extends BaseAgent {
    public saved: Array<Record<string, unknown>> = [];
    constructor() {
        super();
        (this as unknown as { _agentTypeInstance: unknown })._agentTypeInstance = new LoopAgentType();
    }
    public Apply(promptParams: AIPromptParams, params: ExecuteAgentParams): void {
        this.applyNativeTools(promptParams, params);
    }
    public Record(step: MJAIAgentRunStepEntityExtended, result: AIPromptRunResult): void {
        this.recordToolCallingInstrumentation(step, result);
    }
    // The real implementation persists through the run's save queue; the probe just captures the mutation.
    protected override queueStepSave(stepEntity: MJAIAgentRunStepEntityExtended, applyMutation?: (s: MJAIAgentRunStepEntityExtended) => void): void {
        const snapshot: Record<string, unknown> = {};
        applyMutation?.(snapshot as unknown as MJAIAgentRunStepEntityExtended);
        this.saved.push(snapshot);
    }
}

describe('applyNativeTools — agent-level opt-out (DeclareActionsAsNativeTools = false)', () => {
    it('declares nothing for an agent that opted out, before consulting the action catalog', () => {
        const promptParams = {} as AIPromptParams;
        // No engine is configured: reaching the catalog would throw. Returning cleanly proves the
        // agent gate runs first, exactly like the agent-type gate above it.
        new Probe().Apply(promptParams, { agent: { ID: 'x', Name: 'Coordinator', DeclareActionsAsNativeTools: false } } as unknown as ExecuteAgentParams);
        expect(promptParams.tools).toBeUndefined();
        expect(promptParams.toolChoice).toBeUndefined();
    });
});

describe('looksLikeLoopEnvelope', () => {
    it('recognises a Loop envelope by its top-level keys, fenced or not', () => {
        expect(looksLikeLoopEnvelope('{"taskComplete":false,"nextStep":{"type":"Sub-Agent"}}')).toBe(true);
        expect(looksLikeLoopEnvelope('```json\n{"taskComplete":true}\n```')).toBe(true);
        expect(looksLikeLoopEnvelope('{"payloadChangeRequest":{"newElements":{}}}')).toBe(true);
    });
    it('rejects prose, non-envelope JSON, arrays, and empty content', () => {
        expect(looksLikeLoopEnvelope('Calling the tool now.')).toBe(false);
        expect(looksLikeLoopEnvelope('{"foo":1}')).toBe(false);
        expect(looksLikeLoopEnvelope('[1,2]')).toBe(false);
        expect(looksLikeLoopEnvelope(null)).toBe(false);
        expect(looksLikeLoopEnvelope('')).toBe(false);
    });
    it('reads text blocks when content arrives as an array', () => {
        expect(looksLikeLoopEnvelope([{ type: 'text', content: '{"taskComplete":true}' }])).toBe(true);
    });
});

describe('recordToolCallingInstrumentation — NativeDualChannel', () => {
    const result = (mode: string, toolCalls: unknown[] | undefined, content: string | null): AIPromptRunResult =>
        ({ promptRun: { ToolCallingMode: mode }, chatResult: { data: { choices: [{ message: { toolCalls, content } }] } } } as unknown as AIPromptRunResult);
    const step = () => ({} as unknown as MJAIAgentRunStepEntityExtended);

    it('marks 1 when a native turn carried tool calls AND a parseable envelope', () => {
        const s = step(); new Probe().Record(s, result('Native', [{ name: 'search_query_catalog' }], '{"taskComplete":false,"nextStep":{"type":"Sub-Agent"}}'));
        expect(s.NativeToolCallCount).toBe(1);
        expect(s.NativeDualChannel).toBe(true);
    });
    it('marks 0 when tool calls came alone', () => {
        const s = step(); new Probe().Record(s, result('Native', [{ name: 'x' }], null));
        expect(s.NativeDualChannel).toBe(false);
    });
    it('leaves it NULL on a native turn with no tool calls, and on the envelope path', () => {
        const a = step(); new Probe().Record(a, result('Native', [], '{"taskComplete":true}'));
        expect(a.NativeToolCallCount).toBe(0);
        expect(a.NativeDualChannel).toBeNull();
        const b = step(); new Probe().Record(b, result('Envelope', undefined, '{"taskComplete":true}'));
        expect(b.NativeDualChannel).toBeUndefined();
    });
    it('carries the flag into the queued save', () => {
        const p = new Probe(); const s = step();
        p.Record(s, result('Native', [{ name: 'x' }], '{"taskComplete":true}'));
        expect(p.saved[0]).toMatchObject({ NativeDualChannel: true, NativeToolCallCount: 1 });
    });
});

class DeclaringProbe extends Probe {
    constructor(private readonly actions: unknown[], private readonly subAgents: unknown[]) { super(); }
    protected override getEffectiveActionsForValidation(): never[] { return this.actions as never[]; }
    protected override getEffectiveSubAgentsForValidation(): never[] { return this.subAgents as never[]; }
}
const anAction = { ID: 'a1', Name: 'Run Ad-hoc Query', Description: 'd', Params: { Items: [] } };
const aSubAgent = { ID: 's1', Name: 'Query Strategist', Description: 'Plans SQL.' };
const agentParams = { agent: { ID: 'agent-1', Name: 'Query Builder' } } as unknown as ExecuteAgentParams;

describe('applyNativeTools — actions plus control tools', () => {
    beforeEach(() => { /* module mock above supplies AIEngine.Instance.AgentActions = [] */ });

    it('declares actions, one tool per sub-agent, payload_change_request and ask_user, and names the control ones', () => {
        const promptParams = {} as AIPromptParams;
        new DeclaringProbe([anAction], [aSubAgent]).Apply(promptParams, agentParams);
        expect(promptParams.tools?.map((t) => t.name)).toEqual(['run_ad_hoc_query', 'delegate_to_query_strategist', 'payload_change_request', 'ask_user']);
        expect(promptParams.controlFlowToolNames).toEqual(['delegate_to_query_strategist', 'payload_change_request', 'ask_user']);
        expect(promptParams.toolChoice).toBe('auto');
    });

    it('declares for an agent with sub-agents but no actions (pure orchestrator)', () => {
        const promptParams = {} as AIPromptParams;
        new DeclaringProbe([], [aSubAgent]).Apply(promptParams, agentParams);
        expect(promptParams.tools?.map((t) => t.name)).toEqual(['delegate_to_query_strategist', 'payload_change_request', 'ask_user']);
    });

    it('declares nothing for an agent with neither', () => {
        const promptParams = {} as AIPromptParams;
        new DeclaringProbe([], []).Apply(promptParams, agentParams);
        expect(promptParams.tools).toBeUndefined();
    });
});

describe('recordToolCallingInstrumentation — NativeImplicit counts like Native', () => {
    it('records the call count and dual-channel flag on a NativeImplicit step', () => {
        const probe = new Probe();
        const step = {} as MJAIAgentRunStepEntityExtended;
        probe.Record(step, {
            promptRun: { ToolCallingMode: 'NativeImplicit' },
            chatResult: { data: { choices: [{ message: { toolCalls: [{ name: 'ask_user', arguments: { message: 'Which?' } }], content: 'Which one?' } }] } }
        } as unknown as AIPromptRunResult);
        expect(step.ToolCallingMode).toBe('NativeImplicit');
        expect(step.NativeToolCallCount).toBe(1);
        expect(step.NativeDualChannel).toBe(false);
    });
});

// ---------------------------------------------------------------------------------------------
// Results go back as native tool-result turns when the turn asked for it.
// ---------------------------------------------------------------------------------------------
class ResultsProbe extends Probe {
    public Assistant(params: ExecuteAgentParams, step: BaseAgentNextStep): void { this.appendNativeAssistantTurn(params, step); }
    public Results(params: ExecuteAgentParams, summaries: unknown[], message: string, step: BaseAgentNextStep): void {
        this.appendActionResults(params, summaries as never, message, { turnAdded: 1, messageType: 'action-result' }, step);
    }
}
const nativeStep = (sendResultsNatively: boolean): BaseAgentNextStep => ({
    step: 'Actions', terminate: false,
    actions: [{ name: 'Run Ad-hoc Query', params: { Query: 'q' }, toolCallId: 'call_0' }, { name: 'Get Weather', params: {}, toolCallId: 'call_1' }],
    nativeTurn: { text: 'On it.', toolCalls: [{ id: 'call_0', name: 'run_ad_hoc_query', arguments: { Query: 'q' } }, { id: 'call_1', name: 'get_weather', arguments: {} }], sendResultsNatively }
});
const summaries = [
    { actionName: 'Run Ad-hoc Query', success: true, params: [], resultCode: 'SUCCESS', message: 'ok' },
    { actionName: 'Get Weather', success: false, params: [], resultCode: 'ERROR', message: 'no such city' }
];

describe('appendNativeAssistantTurn / appendActionResults', () => {
    it('appends the assistant call turn once, then one tool turn with a block per action, errors flagged', () => {
        const params = { conversationMessages: [] as unknown[] } as unknown as ExecuteAgentParams;
        const probe = new ResultsProbe();
        const step = nativeStep(true);
        probe.Assistant(params, step);
        probe.Assistant(params, step); // same turn again — must not duplicate
        probe.Results(params, summaries, 'Action results:\n…', step);
        const msgs = params.conversationMessages as Array<{ role: string; content: unknown; toolCalls?: unknown[]; metadata?: { messageType?: string } }>;
        expect(msgs.map((m) => m.role)).toEqual(['assistant', 'tool']);
        expect(msgs[0].toolCalls).toHaveLength(2);
        const blocks = msgs[1].content as Array<{ toolCallId: string; isError: boolean; content: string }>;
        expect(blocks.map((b) => [b.toolCallId, b.isError])).toEqual([['call_0', false], ['call_1', true]]);
        expect(blocks[1].content).toContain('no such city');
        expect(msgs[1].metadata?.messageType).toBe('action-result');
    });
    it('falls back to the markdown user message when the turn does not send results natively', () => {
        const params = { conversationMessages: [] as unknown[] } as unknown as ExecuteAgentParams;
        const probe = new ResultsProbe();
        const step = nativeStep(false);
        probe.Assistant(params, step);
        probe.Results(params, summaries, 'Action results:\n…', step);
        const msgs = params.conversationMessages as Array<{ role: string; content: unknown }>;
        expect(msgs.map((m) => m.role)).toEqual(['user']);
        expect(msgs[0].content).toBe('Action results:\n…');
    });
    it('an action without a call id gets the markdown message; the paired ones still go natively', () => {
        const params = { conversationMessages: [] as unknown[] } as unknown as ExecuteAgentParams;
        const step = nativeStep(true);
        step.actions![1].toolCallId = undefined;
        new ResultsProbe().Results(params, summaries, 'Action results:\n…', step);
        const msgs = params.conversationMessages as Array<{ role: string }>;
        expect(msgs.map((m) => m.role)).toEqual(['tool', 'user']);
    });
});
