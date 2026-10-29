/**
 * The framework's capabilities as native tools (native-only control plane).
 *
 * Each capability is declared only when the agent has it, and each tool checks its arguments
 * before reaching the capability, so a malformed call comes back to the model as an error result
 * instead of a partial write.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    ARTIFACT_TOOL, BuildFrameworkTools, CONVERSATION_TOOL, DECISION_TOOL, MEMORY_WRITE_TOOL, SCRATCHPAD_TOOL,
    type FrameworkToolAvailability, type FrameworkToolHost
} from '../native-tools/framework-tools';
import { BuildActionToolSet } from '../native-tools/action-tool-builder';
import { BuildNativeToolSet } from '../native-tools/control-tools';
import { DEFAULT_NATIVE_CONTROL_CONFIG } from '../native-tools/native-control-config';
import type { AgentToolContext, AgentToolDefinition } from '../native-tools/agent-tools';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';

const all: FrameworkToolAvailability = { Scratchpad: true, MemoryWrites: true, ArtifactTools: true, ConversationTools: true, Decisions: true };
const none: FrameworkToolAvailability = { Scratchpad: false, MemoryWrites: false, ArtifactTools: false, ConversationTools: false, Decisions: false };

function fakeHost(): FrameworkToolHost {
    return {
        ApplyScratchpad: vi.fn(() => 'Scratchpad updated.'),
        WriteMemory: vi.fn(async () => ({ Content: 'created', IsError: false })),
        RunArtifactTool: vi.fn(async () => ({ Content: 'artifact data', IsError: false })),
        RunConversationTool: vi.fn(async () => ({ Content: 'messages', IsError: false })),
        RunDecisions: vi.fn(async () => ({ Content: '[]', IsError: false }))
    };
}

const context = { CurrentPayload: { a: 1 } } as unknown as AgentToolContext;
const toolNamed = (tools: AgentToolDefinition[], name: string): AgentToolDefinition => {
    const tool = tools.find((t) => t.Name === name);
    expect(tool, name).toBeDefined();
    return tool as AgentToolDefinition;
};

describe('BuildFrameworkTools', () => {
    it('declares one tool per enabled capability, in a fixed order', () => {
        expect(BuildFrameworkTools(fakeHost(), all).map((t) => t.Name)).toEqual([SCRATCHPAD_TOOL, MEMORY_WRITE_TOOL, ARTIFACT_TOOL, CONVERSATION_TOOL, DECISION_TOOL]);
        expect(BuildFrameworkTools(fakeHost(), none)).toEqual([]);
        expect(BuildFrameworkTools(fakeHost(), { ...none, MemoryWrites: true }).map((t) => t.Name)).toEqual([MEMORY_WRITE_TOOL]);
    });

    it('scratchpad_write passes valid changes through and rejects a task with no status', async () => {
        const host = fakeHost();
        const tool = toolNamed(BuildFrameworkTools(host, all), SCRATCHPAD_TOOL);

        const ok = await tool.Execute({ notes: 'n', taskList: { upsert: [{ id: 't1', title: 'Do it', status: 'pending' }], remove: ['t0'] } }, context);
        expect(ok.IsError).toBe(false);
        expect(host.ApplyScratchpad).toHaveBeenCalledWith({ notes: 'n', taskList: { upsert: [{ id: 't1', title: 'Do it', status: 'pending' }], remove: ['t0'] } });

        const bad = await tool.Execute({ taskList: { upsert: [{ id: 't1', title: 'Do it' }] } }, context);
        expect(bad.IsError).toBe(true);
        expect(host.ApplyScratchpad).toHaveBeenCalledTimes(1);
    });

    it('memory_write requires a note and a known type', async () => {
        const host = fakeHost();
        const tool = toolNamed(BuildFrameworkTools(host, all), MEMORY_WRITE_TOOL);

        expect((await tool.Execute({ note: 'User prefers bar charts.', type: 'Preference', scopeHint: 'agent' }, context)).IsError).toBe(false);
        expect(host.WriteMemory).toHaveBeenCalledWith('User prefers bar charts.', 'Preference', 'agent');
        expect((await tool.Execute({ note: 'x', type: 'Rule' }, context)).IsError).toBe(true);
        expect((await tool.Execute({ note: '  ', type: 'Context' }, context)).IsError).toBe(true);
        expect(host.WriteMemory).toHaveBeenCalledTimes(1);
    });

    it('artifact_tool and conversation_tool pass their call through, with an empty input when none was sent', async () => {
        const host = fakeHost();
        const tools = BuildFrameworkTools(host, all);

        await toolNamed(tools, ARTIFACT_TOOL).Execute({ artifactId: 'A', tool: 'get_full' }, context);
        expect(host.RunArtifactTool).toHaveBeenCalledWith('A', 'get_full', {});
        await toolNamed(tools, CONVERSATION_TOOL).Execute({ tool: 'getMessageBySequence', input: { sequence: 4 } }, context);
        expect(host.RunConversationTool).toHaveBeenCalledWith('getMessageBySequence', { sequence: 4 });
        expect((await toolNamed(tools, ARTIFACT_TOOL).Execute({ tool: 'get_full' }, context)).IsError).toBe(true);
    });

    it('ask_decisions hands the decisions and the current payload to the host', async () => {
        const host = fakeHost();
        const tool = toolNamed(BuildFrameworkTools(host, all), DECISION_TOOL);
        const decisions = [{ id: 'd1', questions: {} }];

        await tool.Execute({ decisions }, context);
        expect(host.RunDecisions).toHaveBeenCalledWith(decisions, { a: 1 });
        expect((await tool.Execute({ decisions: [] }, context)).IsError).toBe(true);
    });
});

describe('framework tools in the native tool set', () => {
    it('are control tools, so the runner strips them for a hybrid model', () => {
        const set = BuildNativeToolSet(BuildActionToolSet([], new Map()), [], DEFAULT_NATIVE_CONTROL_CONFIG, [], BuildFrameworkTools(fakeHost(), all));

        expect(set.controlToolNames).toEqual(expect.arrayContaining([SCRATCHPAD_TOOL, MEMORY_WRITE_TOOL, ARTIFACT_TOOL, CONVERSATION_TOOL, DECISION_TOOL]));
        expect(set.byToolName.get(SCRATCHPAD_TOOL)?.kind).toBe('agentTool');
    });

    it('reserve their names against an agent tool that would take one', () => {
        const clash: AgentToolDefinition = { Name: MEMORY_WRITE_TOOL, Description: 'd', InputSchema: {}, Execute: async () => ({ Content: '', IsError: false }) };

        expect(() => BuildNativeToolSet(BuildActionToolSet([], new Map()), [], DEFAULT_NATIVE_CONTROL_CONFIG, [clash])).toThrow(/reserved/);
    });
});

describe('framework tools against the agent\'s Actions', () => {
    const action = (Name: string) => ({ ID: Name, Name, Description: 'd', Params: { Items: [] } } as unknown as MJActionEntityExtended);

    it('names the Action and the fix when an Action takes a declared framework tool\'s name', () => {
        const actions = BuildActionToolSet([action('Memory Write')], new Map([['Memory Write', []]]));
        expect(() => BuildNativeToolSet(actions, [], DEFAULT_NATIVE_CONTROL_CONFIG, [], BuildFrameworkTools(fakeHost(), all)))
            .toThrow(/Action 'Memory Write' sanitizes to 'memory_write'.*NativeOnly off/);
    });

    it('leaves an agent without native-only alone, whatever its Actions are called', () => {
        const actions = BuildActionToolSet([action('Memory Write')], new Map([['Memory Write', []]]));
        expect(BuildNativeToolSet(actions, [], DEFAULT_NATIVE_CONTROL_CONFIG).byToolName.get('memory_write')?.kind).toBe('action');
    });
});
