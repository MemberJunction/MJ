/**
 * Unit tests for VS-CON-7 TaskGraph preset support:
 * 1. `BuildStepConfiguration` and `ProjectTaskRowsToSpec` round-trip `presetName` on Agent nodes.
 * 2. `TaskGraphService.Submit` rejects unknown presets and lists every bad (node, preset) pair in one message.
 * 3. `TaskGraphDispatcher` (`runAgentNode`) reads `presetName` from the task's configuration and passes
 *    `ConfigurationPresetName` to `agentRunner.RunAgentForTask`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    ProjectTaskRowsToSpec,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type TaskRunRow,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';

const mockRunView = vi.fn();
const mockGetAgentConfigurationPresets = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: {
            FromMetadataProvider: () => ({
                RunView: mockRunView,
            }),
        },
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        FilterRunnableAgents: vi.fn(async <T>(agents: T[]) => agents),
        HasPermission: vi.fn(async () => true),
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
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

import { BuildStepConfiguration, TaskGraphService } from '../TaskGraphService';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import type { TaskAgentRunParams, TaskAgentRunner } from '../types';

describe('VS-CON-7: TaskGraph Agent node presets', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('1. BuildStepConfiguration and ProjectTaskRowsToSpec round-trip', () => {
        it('persists presetName in BuildStepConfiguration and reads it back via ProjectTaskRowsToSpec', () => {
            const node: TaskGraphSpecNode = {
                tempId: 'step_1',
                name: 'Storyboard Artist',
                description: 'Generate storyboard frames',
                kind: 'Agent',
                configuration: {
                    agentName: 'Storyboard Artist',
                    message: 'Sketch scene 1',
                    templateParameters: { sceneNumber: '1' },
                    presetName: 'Draft',
                },
                dependsOn: [],
            };

            const stepConfig = BuildStepConfiguration(node);
            expect(stepConfig?.agent).toEqual({
                message: 'Sketch scene 1',
                templateParameters: { sceneNumber: '1' },
                presetName: 'Draft',
            });

            const childRow: TaskRunRow = {
                ID: 'child-task-1',
                Name: 'Storyboard Artist',
                Description: 'Generate storyboard frames',
                Status: 'Pending',
                StepType: 'Agent',
                AgentID: 'agent-sb-1',
                Agent: 'Storyboard Artist',
                Configuration: JSON.stringify(stepConfig),
            };

            const roundTripped = ProjectTaskRowsToSpec('Video Pipeline', [childRow], []);
            expect(roundTripped.Spec.tasks).toHaveLength(1);
            expect(roundTripped.Spec.tasks[0].kind).toBe('Agent');
            expect(roundTripped.Spec.tasks[0].configuration).toEqual({
                agentName: 'Storyboard Artist',
                message: 'Sketch scene 1',
                presetName: 'Draft',
            });
        });
    });

    describe('2. TaskGraphService.Submit preset validation', () => {
        const contextUser = { ID: 'user-1', Name: 'Tester' } as unknown as UserInfo;
        const provider = {} as unknown as IMetadataProvider;

        it('rejects a graph when Agent nodes reference unknown presets, listing all bad (node, preset) pairs', async () => {
            mockRunView.mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'agent-1', Name: 'Storyboard Artist', Status: 'Active' },
                    { ID: 'agent-2', Name: 'Script Writer', Status: 'Active' },
                ],
            });
            mockGetAgentConfigurationPresets.mockImplementation((agentId: string) => {
                if (agentId === 'agent-1') {
                    return [{ ID: 'p-1', Name: 'Draft', DisplayName: 'Draft Mode', Status: 'Active' }];
                }
                return [];
            });

            const spec: TaskGraphSpec = {
                workflowName: 'Scene Production',
                tasks: [
                    {
                        tempId: 'n1',
                        name: 'Valid Draft Frame',
                        description: 'Frame 1',
                        kind: 'Agent',
                        configuration: {
                            agentName: 'Storyboard Artist',
                            message: 'Frame 1',
                            presetName: 'draft mode',
                        },
                        dependsOn: [],
                    },
                    {
                        tempId: 'n2',
                        name: 'Invalid Frame Preset',
                        description: 'Frame 2',
                        kind: 'Agent',
                        configuration: {
                            agentName: 'Storyboard Artist',
                            message: 'Frame 2',
                            presetName: 'Ultra8K',
                        },
                        dependsOn: ['n1'],
                    },
                    {
                        tempId: 'n3',
                        name: 'Invalid Script Preset',
                        description: 'Polish dialogue',
                        kind: 'Agent',
                        configuration: {
                            agentName: 'Script Writer',
                            message: 'Polish dialogue',
                            presetName: 'Fast',
                        },
                        dependsOn: ['n1'],
                    },
                ],
            };

            const service = new TaskGraphService();
            const result = await service.Submit(spec, {
                EnvironmentID: 'env-1',
                Provider: provider,
                ContextUser: contextUser,
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('references 2 unknown agent preset(s)');
            expect(result.ErrorMessage).toContain('"Invalid Frame Preset" (agent "Storyboard Artist", preset "Ultra8K")');
            expect(result.ErrorMessage).toContain('"Invalid Script Preset" (agent "Script Writer", preset "Fast")');
        });
    });

    describe('3. TaskGraphDispatcher.runAgentNode passes ConfigurationPresetName', () => {
        it('extracts presetName from task.ConfigurationObject and passes ConfigurationPresetName to agentRunner', async () => {
            const runAgentForTask = vi.fn().mockResolvedValue({
                Success: true,
                Output: { ok: true },
                AgentRunID: 'run-123',
            });
            const agentRunner: TaskAgentRunner = {
                RunAgentForTask: runAgentForTask,
            };

            const dispatcher = new TaskGraphDispatcher(
                async () => ({}) as unknown as IMetadataProvider,
                agentRunner,
                { ID: 'user-1' } as unknown as UserInfo,
                { InstanceID: 'inst-1' },
            );

            const internals = dispatcher as unknown as {
                graphContext: () => Promise<{
                    Depth: number;
                    SubmittingAgentRunID: string | null;
                    ParentAgentHierarchy?: string[];
                }>;
                runAgentNode: (
                    task: MJTaskEntity,
                    provider: IMetadataProvider,
                    effectiveInput: unknown,
                    dependencyOutputs: Map<string, unknown>,
                ) => Promise<unknown>;
            };
            vi.spyOn(internals, 'graphContext').mockResolvedValue({
                Depth: 1,
                SubmittingAgentRunID: 'parent-run-1',
                ParentAgentHierarchy: ['RootAgent', 'ParentAgent'],
            });

            const task = {
                ID: 'task-1',
                AgentID: 'agent-sb-1',
                ConfigurationObject: {
                    agent: {
                        message: 'Draw frame',
                        presetName: 'High',
                    },
                },
            } as unknown as MJTaskEntity;

            await internals.runAgentNode(
                task,
                {} as unknown as IMetadataProvider,
                { input: 1 },
                new Map(),
            );

            expect(runAgentForTask).toHaveBeenCalledTimes(1);
            const passedParams: TaskAgentRunParams = runAgentForTask.mock.calls[0][0];
            expect(passedParams.ConfigurationPresetName).toBe('High');
            expect(passedParams.SubmittingAgentRunID).toBe('parent-run-1');
            expect(passedParams.ParentAgentHierarchy).toEqual(['RootAgent', 'ParentAgent']);
        });
    });
});
