/**
 * Tests for `TaskGraphAgentRunner`:
 * - VS-CON-7 preset resolution (`ConfigurationPresetName`)
 * - VS-INV-2b / VS-QA-3 #9 `parentAgentHierarchy` from submitted task
 * - Specialist agent artifact persistence (`ProcessAgentArtifacts`), `CanUserRunAgent` permission check,
 *   task Name/Description prompt formatting, and output normalization.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskAgentRunParams } from '@memberjunction/task-graph';

const {
    runAgent,
    processAgentArtifacts,
    canUserRunAgent,
    mockEngineAgents,
    mockGetAgentConfigurationPresets,
    mockEngineConfig,
    mockRunView,
    mockLogError,
} = vi.hoisted(() => ({
    runAgent: vi.fn(),
    processAgentArtifacts: vi.fn(),
    canUserRunAgent: vi.fn().mockResolvedValue(true),
    mockEngineAgents: [
        { ID: 'agent-1', Name: 'Storyboard Artist' },
        { ID: 'qb-agent' },
        { ID: 'writer-agent' },
    ] as Array<{ ID: string; Name?: string }>,
    mockGetAgentConfigurationPresets: vi.fn(),
    mockEngineConfig: vi.fn(),
    mockRunView: vi.fn(),
    mockLogError: vi.fn(),
}));

const mockRunAgent = runAgent;

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mockLogError(...args),
        LogStatus: vi.fn(),
        RunView: class {
            static FromMetadataProvider = () => ({ RunView: mockRunView });
            RunView = mockRunView;
        },
    };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: { Users: [] },
        Users: [],
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTaskEntity: class {},
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIAgentEntityExtended: class {},
    MJAIAgentRunEntityExtended: class {},
}));
vi.mock('@memberjunction/ai', () => ({ ChatMessageRole: { user: 'user' } }));

const { mockActions } = vi.hoisted(() => ({
    mockActions: [] as Array<{ ID: string; Config_Object: { disallowWhenTainted?: boolean } | null }>,
}));
vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { Config: vi.fn(), get Actions() { return mockActions; } } },
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = runAgent;
        ProcessAgentArtifacts = processAgentArtifacts;
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: mockEngineConfig,
                Agents: mockEngineAgents,
                CanUserRunAgent: canUserRunAgent,
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

import { UserCache } from '@memberjunction/generic-database-provider';
import { TaintedActionRemovals, TaskGraphAgentRunner } from '../services/TaskGraphAgentRunner';

interface SubmittingRunOverrides {
    ID?: string;
    ConfigurationID?: string | null;
    Agent?: string | null;
    AgentID?: string | null;
    ParentRunID?: string | null;
    UserID?: string | null;
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
            if (entityName === 'MJ: Tasks') {
                return {
                    Load: vi.fn().mockResolvedValue(false),
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
                UserID: submittingRunOverrides.UserID ?? null,
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
        canUserRunAgent.mockResolvedValue(true);
        processAgentArtifacts.mockResolvedValue(undefined);
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
        canUserRunAgent.mockResolvedValue(true);
        processAgentArtifacts.mockResolvedValue(undefined);
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

describe('TaskGraphAgentRunner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canUserRunAgent.mockResolvedValue(true);
        runAgent.mockResolvedValue({
            success: true,
            payload: { queryName: 'Top Users', sql: 'SELECT TOP 10 * FROM Users' },
            agentRun: { ID: 'step-run-1', Message: 'Built Top Users query' },
        });
        processAgentArtifacts.mockResolvedValue(undefined);
    });

    it('resolves ConversationDetailID from the submitting parent run and persists specialist agent artifacts', async () => {
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'qb-agent', Name: 'Query Builder', Load: vi.fn().mockResolvedValue(true) };
                }
                if (entityName === 'MJ: AI Agent Runs') {
                    return {
                        ID: 'parent-run-1',
                        ConversationID: 'conv-1',
                        ConversationDetailID: 'origin-detail-1',
                        Load: vi.fn().mockResolvedValue(true),
                    };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-step-1',
            AgentID: 'qb-agent',
            SubmittingAgentRunID: 'parent-run-1',
            InputPayload: { goal: 'Top 10 users' },
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(outcome.Success).toBe(true);
        expect(outcome.AgentRunID).toBe('step-run-1');
        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].inputArtifacts).toEqual([]);
        expect(processAgentArtifacts).toHaveBeenCalledTimes(1);
        expect(processAgentArtifacts.mock.calls[0][0].artifactDirective?.behavior).toBe('create-new');
        expect(processAgentArtifacts.mock.calls[0][1]).toBe('origin-detail-1');
    });

    it('falls back to resolving ConversationDetailID from the task hierarchy when SubmittingAgentRunID has none', async () => {
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'writer-agent', Name: 'Research Report Writer', Load: vi.fn().mockResolvedValue(true) };
                }
                if (entityName === 'MJ: Tasks') {
                    return {
                        ID: 'task-step-2',
                        ConversationDetailID: 'task-detail-2',
                        ParentID: 'parent-task-1',
                        Load: vi.fn().mockResolvedValue(true),
                    };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-step-2',
            AgentID: 'writer-agent',
            SubmittingAgentRunID: null,
            InputPayload: { topic: 'Executive summary' },
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(outcome.Success).toBe(true);
        expect(processAgentArtifacts).toHaveBeenCalledTimes(1);
        expect(processAgentArtifacts.mock.calls[0][0].artifactDirective?.behavior).toBe('create-new');
        expect(processAgentArtifacts.mock.calls[0][1]).toBe('task-detail-2');
    });

    it('refuses execution when the acting user lacks run permission on the target agent', async () => {
        canUserRunAgent.mockResolvedValue(false);
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'restricted-agent', Name: 'Restricted Agent', Load: vi.fn().mockResolvedValue(true) };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-step-restricted',
            AgentID: 'restricted-agent',
            SubmittingAgentRunID: null,
            InputPayload: {},
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-no-perm' } as UserInfo,
        });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain('User does not have permission to run agent "Restricted Agent"');
        expect(runAgent).not.toHaveBeenCalled();
    });

    it('includes task Name and Description in prompt and preserves agentRun.Message when object payload lacks message/summary', async () => {
        runAgent.mockResolvedValue({
            success: true,
            payload: {},
            agentRun: {
                ID: 'fb-run-1',
                Message: 'Which entity would you like me to customize a form for?',
                FinalStep: 'Chat',
            },
        });
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'qb-agent', Name: 'Form Builder', Load: vi.fn().mockResolvedValue(true) };
                }
                if (entityName === 'MJ: Tasks') {
                    return {
                        ID: 'task-fb-1',
                        Name: 'Customize Orders Form',
                        Description: 'Add a collapsible Customer Details section to the Orders form.',
                        ConversationDetailID: 'detail-fb-1',
                        ParentID: null,
                        Load: vi.fn().mockResolvedValue(true),
                    };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-fb-1',
            AgentID: 'qb-agent',
            SubmittingAgentRunID: null,
            InputPayload: { entityName: 'Orders' },
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(outcome.Success).toBe(true);
        const promptSent = runAgent.mock.calls[0][0].conversationMessages[0].content as string;
        expect(promptSent).toContain('## Task: Customize Orders Form');
        expect(promptSent).toContain('Add a collapsible Customer Details section to the Orders form.');
        expect(outcome.Output).toEqual({
            message: 'Which entity would you like me to customize a form for?',
            finalStep: 'Chat',
        });
    });

    it('normalizes results/result, lifts nested results fields to top level, and populates succeeded on completed agent steps', async () => {
        runAgent.mockResolvedValue({
            success: true,
            payload: {
                code: 'output = { totalSales: 2703745, summary: "Sales exceeded $1M" };',
                results: { totalSales: 2703745, summary: 'Sales exceeded $1M' },
                iterations: 1,
            },
            agentRun: {
                ID: 'cs-run-1',
                Message: 'Calculated total sales across 19 quarters.',
                FinalStep: 'Success',
            },
        });
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'qb-agent', Name: 'Codesmith Agent', Load: vi.fn().mockResolvedValue(true) };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-cs-1',
            AgentID: 'qb-agent',
            SubmittingAgentRunID: null,
            InputPayload: {},
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(outcome.Success).toBe(true);
        expect(outcome.Output).toMatchObject({
            totalSales: 2703745,
            summary: 'Sales exceeded $1M',
            results: { totalSales: 2703745, summary: 'Sales exceeded $1M' },
            result: { totalSales: 2703745, summary: 'Sales exceeded $1M' },
            succeeded: true,
        });
    });
});

describe('TaskGraphAgentRunner security envelope (S1, S2, S7)', () => {
    const EGRESS_ACTION = 'e0000000-0000-4000-8000-000000000001';
    const SAFE_ACTION = 'e0000000-0000-4000-8000-000000000002';
    const SEARCH_SCOPE = 'e0000000-0000-4000-8000-000000000003';
    const READER = 'e0000000-0000-4000-8000-000000000004';

    beforeEach(() => {
        vi.clearAllMocks();
        canUserRunAgent.mockResolvedValue(true);
        mockRunAgent.mockResolvedValue({ success: true, agentRun: { ID: 'child-run-1' }, payload: {} });
        mockActions.length = 0;
        mockActions.push(
            { ID: EGRESS_ACTION, Config_Object: { disallowWhenTainted: true } },
            { ID: SAFE_ACTION, Config_Object: null },
        );
    });

    it('starts the run with the same scope, search scopes, audience, bindings and envelope', async () => {
        const env = {
            Version: 1 as const,
            IsRunTainted: false,
            BoundActionParams: { [SAFE_ACTION]: { OrganizationID: 'org-A' } },
            Audience: { ReaderUserIDs: [READER] },
            RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-A', SecondaryScopes: { Region: 'eu' }, SearchScopeIDs: [SEARCH_SCOPE] },
        };
        await new TaskGraphAgentRunner().RunAgentForTask(makeParams({ SecurityEnvelope: env }));
        const runParams = mockRunAgent.mock.calls[0][0];
        expect(runParams.SecurityEnvelope).toEqual(env);
        expect(runParams.PrimaryScopeEntityName).toBe('Organizations');
        expect(runParams.PrimaryScopeRecordID).toBe('org-A');
        expect(runParams.SecondaryScopes).toEqual({ Region: 'eu' });
        expect(runParams.SearchScopeIDs).toEqual([SEARCH_SCOPE]);
        expect(runParams.Audience).toEqual({ Mode: 'Intersection', UserIDs: [READER] });
        expect(runParams.boundActionParams).toEqual({ [SAFE_ACTION]: { OrganizationID: 'org-A' } });
        expect(runParams.actionChanges).toBeUndefined();
    });

    it('takes the actions a tainted run may not call away from a tainted node, and reports its output tainted', async () => {
        const result = await new TaskGraphAgentRunner().RunAgentForTask(makeParams({ SecurityEnvelope: { Version: 1, IsRunTainted: true } }));
        expect(mockRunAgent.mock.calls[0][0].actionChanges).toEqual([{ scope: 'global', mode: 'remove', actionIds: [EGRESS_ACTION] }]);
        expect(result.IsOutputTainted).toBe(true);
    });

    it('runs as the per-task clone the dispatcher handed it, not the shared cached user', async () => {
        const shared = { ID: 'user-1' } as unknown as UserInfo;
        const cached = UserCache.Instance.Users as UserInfo[];
        cached.push(shared);
        try {
            const clone = { ID: 'user-1', TenantContext: { TenantID: 'org-A', Source: 'header' } } as unknown as UserInfo;
            const params = makeParams(
                { ContextUser: clone, SecurityEnvelope: { Version: 1, IsRunTainted: false, CallerTenantContext: { TenantID: 'org-A', Source: 'header' } } },
                'parent-cfg-1',
                { UserID: 'USER-1' },
            );
            await new TaskGraphAgentRunner().RunAgentForTask(params);
            expect(mockRunAgent.mock.calls[0][0].contextUser).toBe(clone);
        } finally {
            cached.length = 0;
        }
    });

    it('lists no change when no action is gated', () => {
        expect(TaintedActionRemovals([{ ID: SAFE_ACTION, Config_Object: null }])).toEqual([]);
    });
});
