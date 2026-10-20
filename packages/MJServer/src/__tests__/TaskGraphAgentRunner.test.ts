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
const mockRunView = vi.fn();
const mockLogError = vi.fn();

const MOCK_AGENT = {
    ID: 'agent-1',
    Name: 'Storyboard Artist',
};

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mockLogError(...args),
        RunView: class {
            static FromMetadataProvider = () => ({ RunView: mockRunView });
            RunView = mockRunView;
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: mockEngineConfig,
                Agents: [MOCK_AGENT],
                GetAgentConfigurationPresets: mockGetAgentConfigurationPresets,
                FindActiveAgentConfigurationPreset: (agentId: string, presetName: string) => {
                    const target = presetName.trim().toLowerCase();
                    if (!target) return undefined;
                    const presets = (mockGetAgentConfigurationPresets(agentId, true) ?? []) as Array<{
                        Name?: string;
                        DisplayName?: string;
                    }>;
                    return presets.find((p) => p.Name?.trim().toLowerCase() === target)
                        ?? presets.find((p) => p.DisplayName?.trim().toLowerCase() === target);
                },
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

interface SubmittingRunOverrides {
    ID?: string;
    ConfigurationID?: string | null;
    Agent?: string | null;
    AgentID?: string | null;
    ParentRunID?: string | null;
    LoadSuccess?: boolean;
}

function makeParams(
    overrides: Partial<TaskAgentRunParams> = {},
    parentConfigurationID: string | null = 'parent-cfg-1',
    submittingRunOverrides: SubmittingRunOverrides = {},
): TaskAgentRunParams {
    const loadSuccess = submittingRunOverrides.LoadSuccess ?? true;
    const provider = {
        GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
            if (entityName === 'MJ: AI Agents') {
                return {
                    Load: vi.fn().mockResolvedValue(true),
                    ID: overrides.AgentID ?? 'agent-1',
                    Name: 'Storyboard Artist',
                };
            }
            return {
                Load: vi.fn().mockResolvedValue(loadSuccess),
                ID: submittingRunOverrides.ID ?? 'submitting-run-1',
                ConfigurationID:
                    'ConfigurationID' in submittingRunOverrides
                        ? submittingRunOverrides.ConfigurationID
                        : parentConfigurationID,
                Agent: submittingRunOverrides.Agent ?? null,
                AgentID: submittingRunOverrides.AgentID ?? null,
                ParentRunID: submittingRunOverrides.ParentRunID ?? null,
            };
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
            "Agent 'Storyboard Artist' has no active preset 'DeletedPreset'. Available: Draft."
        );
        expect(mockRunAgent).not.toHaveBeenCalled();
    });
});

describe('VS-INV-2b / VS-QA-3 #9: TaskGraphAgentRunner parentAgentHierarchy from submitted task', () => {
    const RUN_B_ID = '22222222-2222-4222-8222-222222222222';
    const RUN_C_ID = '33333333-3333-4333-8333-333333333333';

    beforeEach(() => {
        vi.clearAllMocks();
        mockEngineConfig.mockResolvedValue(undefined);
        mockRunAgent.mockResolvedValue({
            success: true,
            agentRun: { ID: 'child-run-1', Message: 'Done' },
            payload: { result: 'ok' },
        });
    });

    it('reads root-first ParentAgentHierarchy carried from the submitted task without running RunView in a loop (VS-QA-3 #9)', async () => {
        const runner = new TaskGraphAgentRunner();
        const params = makeParams(
            {
                SubmittingAgentRunID: RUN_C_ID,
                ParentAgentHierarchy: ['A', 'B', 'C'],
            },
            'parent-cfg-1',
            { ID: RUN_C_ID, Agent: 'C', ParentRunID: RUN_B_ID },
        );

        const result = await runner.RunAgentForTask(params);

        expect(result.Success).toBe(true);
        expect(mockRunView).not.toHaveBeenCalled();
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect(mockRunAgent.mock.calls[0][0].parentAgentHierarchy).toEqual(['A', 'B', 'C']);
    });

    it('falls back to the loaded parentRun agent name when ParentAgentHierarchy is omitted, with zero RunView calls', async () => {
        const runner = new TaskGraphAgentRunner();
        const params = makeParams(
            { SubmittingAgentRunID: RUN_C_ID },
            'parent-cfg-1',
            { ID: RUN_C_ID, Agent: 'C', ParentRunID: RUN_B_ID },
        );

        const result = await runner.RunAgentForTask(params);

        expect(result.Success).toBe(true);
        expect(mockRunView).not.toHaveBeenCalled();
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect(mockRunAgent.mock.calls[0][0].parentAgentHierarchy).toEqual(['C']);
    });

    it('passes undefined parentAgentHierarchy and performs no RunView reads when there is no parentRun and no ParentAgentHierarchy', async () => {
        const runner = new TaskGraphAgentRunner();
        const result = await runner.RunAgentForTask(
            makeParams({ SubmittingAgentRunID: undefined }),
        );

        expect(result.Success).toBe(true);
        expect(mockRunView).not.toHaveBeenCalled();
        expect(mockRunAgent).toHaveBeenCalledTimes(1);
        expect(mockRunAgent.mock.calls[0][0].parentAgentHierarchy).toBeUndefined();
    });
});

