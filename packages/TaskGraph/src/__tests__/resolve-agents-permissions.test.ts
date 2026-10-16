/**
 * Unit tests for VS-SAGE-4 `TaskGraphService.resolveAgents` status and permission enforcement:
 * - an inactive agent → refused (`unknown or inactive`)
 * - an agent without run permission → refused (`not runnable by you`)
 * - both reported in one message
 * - nothing written on refusal (`GetEntityObject` / `Save` not called)
 * - a runnable active agent → resolved and persisted on the child task
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';

const mockRunView = vi.fn();
const mockFilterRunnableAgents = vi.fn();

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
        FilterRunnableAgents: (...args: unknown[]) => mockFilterRunnableAgents(...args),
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                GetAgentConfigurationPresets: () => [],
                FindActiveAgentConfigurationPreset: () => undefined,
            };
        },
    },
}));

import { TaskGraphService } from '../TaskGraphService';

interface SavedEntityRecord {
    EntityName: string;
    ID: string;
    Name?: string;
    AgentID?: string | null;
    StepType?: string | null;
}

function createHarness() {
    const savedRecords: SavedEntityRecord[] = [];
    let nextId = 1;
    const getEntityObject = vi.fn(async (entityName: string) => {
        const record: SavedEntityRecord & {
            NewRecord: () => void;
            Save: () => Promise<boolean>;
            [key: string]: unknown;
        } = {
            EntityName: entityName,
            ID: `${entityName.replace(/\s+/g, '-').toLowerCase()}-${nextId++}`,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => {
                savedRecords.push({
                    EntityName: record.EntityName,
                    ID: record.ID,
                    Name: record.Name,
                    AgentID: record.AgentID,
                    StepType: record.StepType,
                });
                return true;
            }),
        };
        return record as unknown as MJTaskEntity;
    });

    const provider = {
        GetEntityObject: getEntityObject,
    } as unknown as IMetadataProvider;

    const contextUser = { ID: 'user-1', Name: 'Test User' } as unknown as UserInfo;

    return {
        service: new TaskGraphService(),
        context: {
            EnvironmentID: 'env-1',
            Provider: provider,
            ContextUser: contextUser,
        },
        getEntityObject,
        savedRecords,
        contextUser,
    };
}

describe('VS-SAGE-4: TaskGraphService.resolveAgents status + permission enforcement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('refuses an inactive agent ("unknown or inactive") and writes nothing', async () => {
        const { service, context, getEntityObject, savedRecords } = createHarness();

        mockRunView.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                expect(params.ExtraFilter).toContain("Status = 'Active'");
                // Simulate DB returning nothing (or an accidentally returned non-Active row)
                return {
                    Success: true,
                    Results: [{ ID: 'agent-disabled-1', Name: 'Disabled Agent', Status: 'Disabled' }],
                };
            }
            return { Success: true, Results: [] };
        });

        const spec: TaskGraphSpec = {
            workflowName: 'Inactive Agent Workflow',
            reasoning: 'Test inactive refusal',
            tasks: [
                {
                    tempId: 'step_1',
                    name: 'Run Disabled Agent',
                    description: 'Should fail before write',
                    kind: 'Agent',
                    configuration: {
                        agentName: 'Disabled Agent',
                        message: 'Run step',
                    },
                    dependsOn: [],
                },
            ],
        };

        const result = await service.Submit(spec, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('1 unknown or inactive agent(s): Disabled Agent');
        expect(mockFilterRunnableAgents).not.toHaveBeenCalled();
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(savedRecords).toHaveLength(0);
    });

    it('refuses an active agent without run permission ("not runnable by you") and writes nothing', async () => {
        const { service, context, getEntityObject, savedRecords, contextUser } = createHarness();

        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                return {
                    Success: true,
                    Results: [{ ID: 'agent-restricted-1', Name: 'Restricted Agent', Status: 'Active' }],
                };
            }
            return { Success: true, Results: [] };
        });
        mockFilterRunnableAgents.mockResolvedValue([]);

        const spec: TaskGraphSpec = {
            workflowName: 'Restricted Agent Workflow',
            reasoning: 'Test permission refusal',
            tasks: [
                {
                    tempId: 'step_1',
                    name: 'Run Restricted Agent',
                    description: 'Should fail before write',
                    kind: 'Agent',
                    configuration: {
                        agentName: 'Restricted Agent',
                        message: 'Run step',
                    },
                    dependsOn: [],
                },
            ],
        };

        const result = await service.Submit(spec, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('1 agent(s) not runnable by you: Restricted Agent');
        expect(mockFilterRunnableAgents).toHaveBeenCalledWith(
            [{ ID: 'agent-restricted-1', Name: 'Restricted Agent', Status: 'Active' }],
            contextUser,
        );
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(savedRecords).toHaveLength(0);
    });

    it('reports both unknown/inactive and non-runnable agents in a single error message and writes nothing', async () => {
        const { service, context, getEntityObject, savedRecords } = createHarness();

        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                // 'Ghost Agent' is missing/inactive; 'Locked Agent' and 'Allowed Agent' are Active
                return {
                    Success: true,
                    Results: [
                        { ID: 'agent-locked-1', Name: 'Locked Agent', Status: 'Active' },
                        { ID: 'agent-allowed-1', Name: 'Allowed Agent', Status: 'Active' },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });
        // Only 'Allowed Agent' passes permission filtering
        mockFilterRunnableAgents.mockResolvedValue([
            { ID: 'agent-allowed-1', Name: 'Allowed Agent', Status: 'Active' },
        ]);

        const spec: TaskGraphSpec = {
            workflowName: 'Mixed Refusal Workflow',
            reasoning: 'Test combined refusal reporting',
            tasks: [
                {
                    tempId: 'step_1',
                    name: 'Missing step',
                    description: 'References unknown/inactive agent',
                    kind: 'Agent',
                    configuration: { agentName: 'Ghost Agent', message: 'Step 1' },
                    dependsOn: [],
                },
                {
                    tempId: 'step_2',
                    name: 'Locked step',
                    description: 'References non-runnable agent',
                    kind: 'Agent',
                    configuration: { agentName: 'Locked Agent', message: 'Step 2' },
                    dependsOn: ['step_1'],
                },
                {
                    tempId: 'step_3',
                    name: 'Allowed step',
                    description: 'References runnable agent',
                    kind: 'Agent',
                    configuration: { agentName: 'Allowed Agent', message: 'Step 3' },
                    dependsOn: ['step_2'],
                },
            ],
        };

        const result = await service.Submit(spec, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(
            'Task graph "Mixed Refusal Workflow" references 1 unknown or inactive agent(s): Ghost Agent; 1 agent(s) not runnable by you: Locked Agent.',
        );
        expect(getEntityObject).not.toHaveBeenCalled();
        expect(savedRecords).toHaveLength(0);
    });

    it('resolves a runnable active agent and persists the graph', async () => {
        const { service, context, savedRecords, contextUser } = createHarness();

        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                return {
                    Success: true,
                    Results: [{ ID: 'agent-marketing-1', Name: 'Marketing Agent', Status: 'Active' }],
                };
            }
            if (params.EntityName === 'MJ: Task Types') {
                return {
                    Success: true,
                    Results: [{ ID: 'task-type-ai-workflow' }],
                };
            }
            return { Success: true, Results: [] };
        });
        mockFilterRunnableAgents.mockImplementation(async <T>(agents: T[]) => agents);

        const spec: TaskGraphSpec = {
            workflowName: 'Runnable Agent Workflow',
            reasoning: 'Test happy path resolution',
            tasks: [
                {
                    tempId: 'step_1',
                    name: 'Draft Campaign',
                    description: 'Run Marketing Agent',
                    kind: 'Agent',
                    configuration: {
                        agentName: 'Marketing Agent',
                        message: 'Create launch copy',
                    },
                    dependsOn: [],
                },
            ],
        };

        const result = await service.Submit(spec, context);

        expect(result.Success).toBe(true);
        expect(mockFilterRunnableAgents).toHaveBeenCalledWith(
            [{ ID: 'agent-marketing-1', Name: 'Marketing Agent', Status: 'Active' }],
            contextUser,
        );
        expect(savedRecords).toHaveLength(2); // parent + 1 child
        const childTask = savedRecords.find((r) => r.Name === 'Draft Campaign');
        expect(childTask?.AgentID).toBe('agent-marketing-1');
    });
});
