/**
 * Declaring an agent's own tools beside its Actions.
 *
 * Agent tools are dispatchable in every native mode, like Actions — a hybrid model, which never
 * sees the control tools, can still call them — so they are not control tools. Their names must
 * already be valid tool names and may not take a control tool's name or the sub-agent prefix.
 */
import { describe, it, expect } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { BuildActionToolSet } from '../native-tools/action-tool-builder';
import { BuildNativeToolSet, type NativeToolBinding } from '../native-tools/control-tools';
import { DEFAULT_NATIVE_CONTROL_CONFIG } from '../native-tools/native-control-config';
import type { AgentToolDefinition } from '../native-tools/agent-tools';
import { RecordToolCallingDecision, type ToolCallingMode } from '@memberjunction/ai-prompts';
import type { ChatResult } from '@memberjunction/ai';
import type { AIPromptRunResult, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJAIAgentEntityExtended } from '@memberjunction/core-entities';

const tool = (Name: string, Description = 'Call this to write the document.'): AgentToolDefinition => ({
    Name, Description, InputSchema: { type: 'object', properties: {} }, Execute: async () => ({ Content: 'ok', IsError: false })
});
const action = (Name: string) => ({ ID: Name, Name, Description: 'd', Params: { Items: [] } } as unknown as MJActionEntityExtended);
const actionSet = (...names: string[]) => BuildActionToolSet(names.map(action), new Map(names.map((n) => [n, []])));
const build = (tools: AgentToolDefinition[], actions = actionSet()) => BuildNativeToolSet(actions, [], DEFAULT_NATIVE_CONTROL_CONFIG, tools);

describe('BuildNativeToolSet — agent tools', () => {
    it('declares them after the Actions and before the control tools, and not as control tools', () => {
        const set = build([tool('write_doc')], actionSet('Search Web'));

        expect(set.tools.map((t) => t.name)).toEqual(['search_web', 'write_doc', 'payload_change_request', 'ask_user', 'complete_task']);
        expect(set.byToolName.get('write_doc')?.kind).toBe('agentTool');
        expect(set.controlToolNames).not.toContain('write_doc');
    });

    it('rejects a name that is not already a valid tool name', () => {
        expect(() => build([tool('Write Doc')])).toThrow(/not a valid tool name.*'write_doc'/);
    });

    it('rejects a control-tool name or the sub-agent prefix', () => {
        expect(() => build([tool('complete_task')])).toThrow(/reserved/);
        expect(() => build([tool('delegate_to_writer')])).toThrow(/reserved/);
    });

    it('rejects a name an Action or a sub-agent already declares', () => {
        expect(() => build([tool('search_web')], actionSet('Search Web'))).toThrow(/collision.*agent tool 'search_web' and Action 'Search Web'/);
        const writer = { ID: 'w', Name: 'Writer', Description: 'Writes.' } as unknown as MJAIAgentEntityExtended;
        expect(() => BuildNativeToolSet(actionSet(), [writer], DEFAULT_NATIVE_CONTROL_CONFIG, [tool('delegate_to_writer')])).toThrow(/reserved/);
    });

    it('rejects two agent tools with the same name', () => {
        expect(() => build([tool('write_doc'), tool('write_doc')])).toThrow(/collision/);
    });

    it('rejects a description over the provider limit', () => {
        expect(() => build([tool('write_doc', 'x'.repeat(1025))])).toThrow(/over 1024 characters/);
    });
});

describe('LoopAgentType — routing agent-tool calls', () => {
    class Probe extends LoopAgentType {
        public Call(result: AIPromptRunResult, bindings: ReadonlyMap<string, NativeToolBinding>): BaseAgentNextStep | null {
            return this.nextStepFromNativeToolCalls(result, bindings);
        }
    }
    const turn = (calls: Array<{ name: string; arguments?: Record<string, unknown> }>, mode: ToolCallingMode = 'Native'): AIPromptRunResult => {
        const message = { content: '', toolCalls: calls.map((c, i) => ({ id: `call_${i}`, arguments: {}, ...c })) };
        const chatResult = { data: { choices: [{ message }] } } as unknown as ChatResult;
        RecordToolCallingDecision(chatResult, { useNativeTools: true, mode, controlFlow: mode === 'NativeImplicit' ? 'implicit' : 'envelope', toolResults: true });
        return { success: true, promptRun: { ToolCallingMode: mode }, chatResult } as unknown as AIPromptRunResult;
    };
    const bindings = build([tool('write_doc'), tool('edit_doc')], actionSet('Search Web')).byToolName;

    it('carries the calls, in order, on a non-terminal step with nothing else to add', () => {
        const step = new Probe().Call(turn([{ name: 'write_doc', arguments: { content: 'a' } }, { name: 'edit_doc' }]), bindings);

        expect(step?.step).toBe('Retry');
        expect(step?.terminate).toBe(false);
        expect(step?.retryInstructions).toBeUndefined();
        expect(step?.agentToolCalls).toEqual([
            { toolCallId: 'call_0', toolName: 'write_doc', arguments: { content: 'a' } },
            { toolCallId: 'call_1', toolName: 'edit_doc', arguments: {} }
        ]);
    });

    it('is dispatchable for a hybrid model, which reads no control tool from a call', () => {
        expect(new Probe().Call(turn([{ name: 'write_doc' }], 'Native'), bindings)?.agentToolCalls).toHaveLength(1);
    });

    it('rides along with an Actions step from the same turn', () => {
        const step = new Probe().Call(turn([{ name: 'search_web' }, { name: 'write_doc' }]), bindings);

        expect(step?.step).toBe('Actions');
        expect(step?.actions?.map((a) => a.name)).toEqual(['Search Web']);
        expect(step?.agentToolCalls?.map((c) => c.toolName)).toEqual(['write_doc']);
    });
});
