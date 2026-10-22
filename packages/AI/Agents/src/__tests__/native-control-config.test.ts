/**
 * Per-agent native control configuration (`TypeConfiguration.NativeControl`).
 *
 * An agent can turn off `payload_change_request` and `ask_user`, end its run in plain text
 * instead of a forced `complete_task`, and declare `complete_task`'s payload as an object. Before
 * this, every control tool was always declared: turning the payload instructions off through
 * prompt params removed the text but left the schemas advertised. Agents with no configuration
 * keep exactly the old tool set and the old final turn.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { BuildActionToolSet } from '../native-tools/action-tool-builder';
import {
    ASK_USER_TOOL, COMPLETE_TASK_TOOL, PAYLOAD_CHANGE_TOOL, BuildNativeToolSet, type NativeToolBinding
} from '../native-tools/control-tools';
import { DEFAULT_NATIVE_CONTROL_CONFIG, ResolveNativeControlConfig, type NativeControlConfig } from '../native-tools/native-control-config';
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import type { ChatResult, ChatToolChoice } from '@memberjunction/ai';
import type { AIPromptRunResult, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';

const typeConfig = (nativeControl: Record<string, unknown>): string => JSON.stringify({ NativeControl: nativeControl });

describe('ResolveNativeControlConfig', () => {
    it('returns the defaults when the agent has no TypeConfiguration', () => {
        expect(ResolveNativeControlConfig(null)).toEqual({ Config: DEFAULT_NATIVE_CONTROL_CONFIG, Problems: [] });
        expect(ResolveNativeControlConfig('')).toEqual({ Config: DEFAULT_NATIVE_CONTROL_CONFIG, Problems: [] });
    });

    it('returns the defaults when TypeConfiguration has no NativeControl block', () => {
        expect(ResolveNativeControlConfig(JSON.stringify({ realtime: { voice: 'x' } })).Config).toEqual(DEFAULT_NATIVE_CONTROL_CONFIG);
    });

    it('reads every field', () => {
        const { Config, Problems } = ResolveNativeControlConfig(
            typeConfig({ PayloadChangeTool: false, AskUser: false, Terminal: 'text', CompleteTaskPayload: 'object', NativeOnly: true, CompactToolArguments: true, RelaxedTurnShapes: true }));

        expect(Config).toEqual({ PayloadChangeTool: false, AskUser: false, Terminal: 'text', CompleteTaskPayload: 'object', NativeOnly: true, CompactToolArguments: true, RelaxedTurnShapes: true });
        expect(Problems).toEqual([]);
    });

    it('keeps the defaults for fields left out', () => {
        expect(ResolveNativeControlConfig(typeConfig({ Terminal: 'text' })).Config)
            .toEqual({ ...DEFAULT_NATIVE_CONTROL_CONFIG, Terminal: 'text' });
    });

    it('ignores an unusable field, reports it, and keeps the others', () => {
        const { Config, Problems } = ResolveNativeControlConfig(typeConfig({ PayloadChangeTool: 'no', Terminal: 'plain', AskUser: false }));

        expect(Config).toEqual({ ...DEFAULT_NATIVE_CONTROL_CONFIG, AskUser: false });
        expect(Problems).toEqual([
            'NativeControl.PayloadChangeTool must be true or false; ignored',
            "NativeControl.Terminal must be one of 'tool', 'text'; ignored"
        ]);
    });

    it('falls back to the defaults on unparseable JSON, and says so', () => {
        const { Config, Problems } = ResolveNativeControlConfig('{ NativeControl: ');

        expect(Config).toEqual(DEFAULT_NATIVE_CONTROL_CONFIG);
        expect(Problems[0]).toMatch(/^TypeConfiguration is not valid JSON/);
    });

    it('rejects a NativeControl that is not an object', () => {
        expect(ResolveNativeControlConfig(JSON.stringify({ NativeControl: true })).Problems).toEqual(['NativeControl must be an object; ignored']);
    });
});

describe('BuildNativeToolSet with a control configuration', () => {
    const action = (Name: string) => ({ ID: Name, Name, Description: 'd', Params: { Items: [] } } as unknown as MJActionEntityExtended);
    const actions = BuildActionToolSet([action('Write Section')], new Map([['Write Section', []]]));
    const build = (overrides: Partial<NativeControlConfig>) => BuildNativeToolSet(actions, [], { ...DEFAULT_NATIVE_CONTROL_CONFIG, ...overrides });
    const names = (overrides: Partial<NativeControlConfig>) => build(overrides).tools.map((t) => t.name);
    const completeProps = (overrides: Partial<NativeControlConfig>) =>
        build(overrides).tools.find((t) => t.name === COMPLETE_TASK_TOOL)?.inputSchema.properties as Record<string, { type: string; properties?: Record<string, unknown> }>;

    it('declares all three control tools by default, as before', () => {
        expect(names({})).toEqual(['write_section', PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL, COMPLETE_TASK_TOOL]);
        expect(BuildNativeToolSet(actions, []).tools.map((t) => t.name)).toEqual(names({}));
    });

    it('drops payload_change_request, and complete_task\'s payload parameter, when PayloadChangeTool is off', () => {
        expect(names({ PayloadChangeTool: false })).toEqual(['write_section', ASK_USER_TOOL, COMPLETE_TASK_TOOL]);
        expect(Object.keys(completeProps({ PayloadChangeTool: false }))).toEqual(['message']);
    });

    it('drops ask_user when AskUser is off', () => {
        expect(names({ AskUser: false })).toEqual(['write_section', PAYLOAD_CHANGE_TOOL, COMPLETE_TASK_TOOL]);
    });

    it('drops complete_task under a text terminal', () => {
        const set = build({ Terminal: 'text' });

        expect(set.tools.map((t) => t.name)).toEqual(['write_section', PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL]);
        expect(set.byToolName.has(COMPLETE_TASK_TOOL)).toBe(false);
        expect(set.controlToolNames).toEqual([PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL]);
    });

    it('declares complete_task.payloadChangeRequest as a JSON string by default, an object on request', () => {
        expect(completeProps({}).payloadChangeRequest.type).toBe('string');
        const object = completeProps({ CompleteTaskPayload: 'object' }).payloadChangeRequest;
        expect(object.type).toBe('object');
        expect(Object.keys(object.properties ?? {}).sort()).toEqual(['newElements', 'removeElements', 'replaceElements', 'updateElements']);
    });

    it('still rejects an Action whose name clashes with a control tool that is turned off', () => {
        const clash = BuildActionToolSet([action('Payload Change Request')], new Map([['Payload Change Request', []]]));

        expect(() => BuildNativeToolSet(clash, [], { ...DEFAULT_NATIVE_CONTROL_CONFIG, PayloadChangeTool: false })).toThrow(/reserved control-tool name/);
    });
});

describe('the final permitted turn under a text terminal', () => {
    class Probe extends BaseAgent {
        constructor(iterations: number) {
            super();
            (this as unknown as { _agentRun: unknown })._agentRun = { TotalPromptIterations: iterations };
        }
        public Choice(params: ExecuteAgentParams): ChatToolChoice {
            return this.resolveToolChoiceForTurn(params);
        }
    }
    const params = (typeConfiguration: string | null): ExecuteAgentParams =>
        ({ agent: { Name: 'Writer', MaxIterationsPerRun: 10, TypeConfiguration: typeConfiguration } } as unknown as ExecuteAgentParams);

    it('asks for a plain-text answer instead of forcing complete_task', () => {
        expect(new Probe(10).Choice(params(typeConfig({ Terminal: 'text' })))).toBe('none');
    });

    it('still forces complete_task for an agent with no configuration', () => {
        expect(new Probe(10).Choice(params(null))).toEqual({ name: COMPLETE_TASK_TOOL });
    });

    it('leaves ordinary turns on auto', () => {
        expect(new Probe(3).Choice(params(typeConfig({ Terminal: 'text' })))).toBe('auto');
    });
});

describe('a payload-only turn tells the model how this agent finishes', () => {
    class Probe extends LoopAgentType {
        public Call(result: AIPromptRunResult, bindings: ReadonlyMap<string, NativeToolBinding>): BaseAgentNextStep | null {
            return this.nextStepFromNativeToolCalls(result, bindings);
        }
    }
    const payloadCall = (): AIPromptRunResult => {
        const message = { content: '', toolCalls: [{ id: 'call_0', name: PAYLOAD_CHANGE_TOOL, arguments: { newElements: { a: 1 } } }] };
        const chatResult = { data: { choices: [{ message }] } } as unknown as ChatResult;
        RecordToolCallingDecision(chatResult, { useNativeTools: true, mode: 'NativeImplicit', controlFlow: 'implicit', toolResults: true });
        return { success: true, promptRun: { ToolCallingMode: 'NativeImplicit' }, chatResult } as unknown as AIPromptRunResult;
    };
    const bindingsFor = (control: Partial<NativeControlConfig>) =>
        BuildNativeToolSet(BuildActionToolSet([], new Map()), [], { ...DEFAULT_NATIVE_CONTROL_CONFIG, ...control }).byToolName;

    it('names complete_task when the agent declares it', () => {
        expect(new Probe().Call(payloadCall(), bindingsFor({}))?.retryInstructions).toContain('call complete_task');
    });

    it('says to reply in plain text under a text terminal', () => {
        const step = new Probe().Call(payloadCall(), bindingsFor({ Terminal: 'text' }));

        expect(step?.retryInstructions).toContain('reply in plain text');
        expect(step?.retryInstructions).not.toContain('complete_task');
    });
});
