/**
 * Unit tests for VS-CON-7 `TaskGraphAgentRunner` preset resolution:
 * 1. Named preset -> resolves the target agent's active preset -> passes `configurationId` to `AgentRunner.RunAgent`.
 * 2. Named preset with NULL `AIConfigurationID` -> passes `configurationId: undefined` even when the submitting run has a `ConfigurationID`.
 * 3. No preset -> inherits the submitting run's `ConfigurationID`.
 * 4. Unknown preset at run time (e.g. deleted after submit) -> fails the task with a clear error message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskAgentRunParams } from '@memberjunction/task-graph';

const mockRunAgent = vi.fn();
const mockGetAgentConfigurationPresets = vi.fn();
const mockEngineConfig = vi.fn();

const MOCK_AGENT = {
    ID: 'agent-1',
    Name: 'Storyboard Artist',
};

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: mockEngineConfig,
                Agents: [MOCK_AGENT],
                GetAgentConfigurationPresets: mockGetAgentConfigurationPresets,
            };
        },
    },
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = mockRunAgent;
    },
}));

import { TaskGraphAgentRunner } from '../services/TaskGraphAgentRunner';

function makeParams(overrides: Partial<TaskAgentRunParams> = {}, parentConfigurationID: string | null = 'parent-cfg-1'): TaskAgentRunParams {
    const provider = {
        GetEntityObject: vi.fn().mockResolvedValue({
            Load: vi.fn().mockResolvedValue(true),
            ID: 'submitting-run-1',
            ConfigurationID: parentConfigurationID,
        }),
    } as unknown as IMetadataProvider;

    return {
        TaskID: 'task-1',
        AgentID: 'agent-1',
        InputPayload: 'Draw the opening shot',
        DependencyOutputs: new Map(),
        SubmittingAgentRunID: 'submitting-run-1',
        Provider: provider,
        ContextUser: { ID: 'user-1' } as unknown as UserInfo,
        ...overrides,
    };
}

describe('VS-CON-7: TaskGraphAgentRunner preset resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEngineConfig.mockResolvedValue(undefined);
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: 'child-run-1', Message: 'Done' },
            payload: { result: 'ok' },
        });
    });

    it('resolves ConfigurationPresetName to the matching preset AIConfigurationID', async () => {
        mockGetAgentConfigurationPresets.mockReturnValue([
            {
                ID: 'preset-draft',
                Name: 'Draft',
                DisplayName: 'Draft Mode',
                AIConfigurationID: 'cfg-draft-1',
                Status: 'Active',
            },
            {
                ID: 'preset-high',
                Name: 'High',
                DisplayName: 'High Fidelity',
                AIConfigurationID: 'cfg-high-1',
                Status: 'Active',
            },
        ]);

        const runner = new TaskGraphAgentRunner();
        const result = await runner.RunAgentForTask(
            makeParams({ ConfigurationPresetName: 'high fidelity' })
        );

        expect(result.Success).toBe(true);
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect(mockRunAgent.mock.calls[0][0].configurationId).toBe('cfg-high-1');
    });

    it('passes configurationId: undefined when the matched preset has NULL AIConfigurationID, even if the submitting run has a ConfigurationID', async () => {
        mockGetAgentConfigurationPresets.mockReturnValue([
            {
                ID: 'preset-default',
                Name: 'SystemDefault',
                DisplayName: 'System Default',
                AIConfigurationID: null,
                Status: 'Active',
            },
        ]);

        const runner = new TaskGraphAgentRunner();
        const result = await runner.RunAgentForTask(
            makeParams({ ConfigurationPresetName: 'SystemDefault' }, 'parent-cfg-1')
        );

        expect(result.Success).toBe(true);
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect(mockRunAgent.mock.calls[0][0].configurationId).toBeUndefined();
    });

    it('falls back to the submitting run ConfigurationID when ConfigurationPresetName is not specified', async () => {
        const runner = new TaskGraphAgentRunner();
        const result = await runner.RunAgentForTask(makeParams({}, 'parent-cfg-99'));

        expect(result.Success).toBe(true);
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect(mockRunAgent.mock.calls[0][0].configurationId).toBe('parent-cfg-99');
    });

    it('fails the task with a clear message when ConfigurationPresetName does not match any active preset at run time', async () => {
        mockGetAgentConfigurationPresets.mockReturnValue([
            {
                ID: 'preset-draft',
                Name: 'Draft',
                DisplayName: 'Draft Mode',
                AIConfigurationID: 'cfg-draft-1',
                Status: 'Active',
            },
        ]);

        const runner = new TaskGraphAgentRunner();
        const result = await runner.RunAgentForTask(
            makeParams({ ConfigurationPresetName: 'DeletedPreset' })
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe(
            "Agent 'agent-1' has no active preset 'DeletedPreset'. Available: Draft."
        );
        expect(mockRunAgent).not.toHaveBeenCalled();
    });
});
