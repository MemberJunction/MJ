/**
 * Regression tests for TaskGraphService internal persistence user resolution:
 * - Non-Owner UI users deliberately hold read-only permissions on `MJ: Task Types`,
 *   `MJ: Tasks`, and `MJ: Task Dependencies` (workflows are persisted only through
 *   TaskGraphService/TaskGraphDispatcher, never via direct client CRUD).
 * - Internal writes (`ensureTaskType`, `persistParent`, `persistChildren`,
 *   `persistDependencies`, `seedBreakpoints`, `RetryTask`) must therefore bind their
 *   entity objects to `UserCache.GetSystemUser()` when available, while caller
 *   authorization (`resolveAgents`, etc.) and row attribution (`submittedByUserID`,
 *   `Human` step `UserID`, `ServerOperationScopeManager` `userId`) stay strictly
 *   bound to `context.ContextUser`.
 * - Falls back cleanly to `context.ContextUser` when no `UserCache` is loaded.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';
import { TASK_GRAPH_RUNTIME_SECURITY_OPERATION } from '@memberjunction/ai-core-plus';
import { ServerOperationScopeManager, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';

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
        HasPermission: vi.fn(() => true),
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

import { ParseTaskGraphParentMetadata, TaskGraphService } from '../TaskGraphService';

interface RecordedEntityCall {
    EntityName: string;
    User: UserInfo | undefined;
    ID: string;
    Name?: string;
    ParentID?: string | null;
    UserID?: string | null;
    InputPayload?: string | null;
    Status?: string;
    Saved: boolean;
}

const UI_USER = {
    ID: '11111111-1111-4111-8111-111111111111',
    Name: 'UI Caller',
    Type: 'User',
    UserRoles: [{ Role: 'UI' }],
} as unknown as UserInfo;

const SYSTEM_USER = {
    ID: 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    Name: 'System',
    Type: 'Owner',
    UserRoles: [{ Role: 'Administrator' }],
} as unknown as UserInfo;

const AGENT_ID = '22222222-2222-4222-8222-222222222222';

function createProviderHarness(existingRows?: Map<string, Partial<RecordedEntityCall>>) {
    const calls: RecordedEntityCall[] = [];
    let nextId = 1;

    const getEntityObject = vi.fn(async (entityName: string, contextUser?: UserInfo) => {
        const entry: RecordedEntityCall = {
            EntityName: entityName,
            User: contextUser,
            ID: `${entityName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${nextId++}`,
            Saved: false,
        };
        calls.push(entry);

        const entityObj: Record<string, unknown> = {
            get ID(): string {
                return entry.ID;
            },
            set ID(v: string) {
                entry.ID = v;
            },
            get Name(): string | undefined {
                return entry.Name;
            },
            set Name(v: string | undefined) {
                entry.Name = v;
            },
            get ParentID(): string | null | undefined {
                return entry.ParentID;
            },
            set ParentID(v: string | null | undefined) {
                entry.ParentID = v;
            },
            get UserID(): string | null | undefined {
                return entry.UserID;
            },
            set UserID(v: string | null | undefined) {
                entry.UserID = v;
            },
            get InputPayload(): string | null | undefined {
                return entry.InputPayload;
            },
            set InputPayload(v: string | null | undefined) {
                entry.InputPayload = v;
            },
            get Status(): string | undefined {
                return entry.Status;
            },
            set Status(v: string | undefined) {
                entry.Status = v;
            },
            NewRecord: vi.fn(),
            Load: vi.fn(async (id: string) => {
                entry.ID = id;
                const seed = existingRows?.get(id);
                if (seed) {
                    if (seed.Name !== undefined) entry.Name = seed.Name;
                    if (seed.ParentID !== undefined) entry.ParentID = seed.ParentID;
                    if (seed.InputPayload !== undefined) entry.InputPayload = seed.InputPayload;
                    if (seed.Status !== undefined) entry.Status = seed.Status;
                }
                return true;
            }),
            Save: vi.fn(async () => {
                // Simulate real MJ permissions: non-Owner UI user cannot write MJ: Task Types / Tasks / Task Dependencies
                if (contextUser?.Type !== 'Owner') {
                    entityObj.LatestResult = {
                        CompleteMessage: `User: ${contextUser?.Name} Does NOT have permission to Create/Update ${entityName} records.`,
                    };
                    return false;
                }
                // Simulate real MJTaskEntityServer / MJTaskDependencyEntityServer inDispatcherScope() check:
                // the authority frame's userId MUST match the row's ContextCurrentUser
                if (entityName === 'MJ: Tasks' || entityName === 'MJ: Task Dependencies') {
                    const inScope = ServerOperationScopeManager.Instance.IsOperationActive(
                        [TASK_GRAPH_RUNTIME_SECURITY_OPERATION],
                        entityName,
                        contextUser,
                    );
                    if (!inScope) {
                        entityObj.LatestResult = {
                            CompleteMessage: `Only the task-graph service creates/updates ${entityName} rows.`,
                        };
                        return false;
                    }
                }
                entry.Saved = true;
                return true;
            }),
            LatestResult: undefined,
        };
        return entityObj;
    });

    return {
        provider: { GetEntityObject: getEntityObject } as unknown as IMetadataProvider,
        calls,
        getEntityObject,
    };
}

describe('TaskGraphService internal persistence user resolution', () => {
    const store = GetGlobalObjectStore() as { ___SINGLETON__UserCache?: { GetSystemUser?: () => UserInfo | undefined } };
    let previousUserCache: { GetSystemUser?: () => UserInfo | undefined } | undefined;

    beforeEach(() => {
        previousUserCache = store.___SINGLETON__UserCache;
        mockRunView.mockReset();
        mockFilterRunnableAgents.mockReset();
    });

    afterEach(() => {
        if (previousUserCache === undefined) {
            delete store.___SINGLETON__UserCache;
        } else {
            store.___SINGLETON__UserCache = previousUserCache;
        }
    });

    it('uses System User for TaskType, Task, Dependency, and breakpoint writes while keeping authorization & attribution bound to UI caller', async () => {
        store.___SINGLETON__UserCache = {
            GetSystemUser: () => SYSTEM_USER,
        };

        const runViewUsersByEntity: Array<{ entityName: string; user: UserInfo | undefined }> = [];
        mockRunView.mockImplementation(async (params: { EntityName: string }, user?: UserInfo) => {
            runViewUsersByEntity.push({ entityName: params.EntityName, user });
            if (params.EntityName === 'MJ: AI Agents') {
                return { Success: true, Results: [{ ID: AGENT_ID, Name: 'Research Agent', Status: 'Active' }] };
            }
            if (params.EntityName === 'MJ: Task Types') {
                // Simulate fresh DB where 'AI Workflow' does not yet exist
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });
        mockFilterRunnableAgents.mockImplementation(async (agents: unknown[]) => agents);

        const harness = createProviderHarness();
        const spec: TaskGraphSpec = {
            workflowName: 'UI Submitted Durable Graph',
            tasks: [
                {
                    tempId: 'step1',
                    name: 'Run Research',
                    description: 'Agent step',
                    kind: 'Agent',
                    configuration: { agentName: 'Research Agent' },
                    dependsOn: [],
                },
                {
                    tempId: 'step2',
                    name: 'Approve Research',
                    description: 'Human approval step',
                    kind: 'Human',
                    configuration: { instructions: 'Review and approve' },
                    dependsOn: ['step1'],
                },
            ],
        };

        const result = await new TaskGraphService().Submit(spec, {
            EnvironmentID: 'env-1',
            Provider: harness.provider,
            ContextUser: UI_USER,
            Debug: { paused: true, breakpointStepIDs: ['step2'] },
        });

        expect(result.Success).toBe(true);
        expect(result.ParentTaskID).toBeTruthy();

        // Authorization lookups MUST remain strictly bound to the UI caller
        const agentQuery = runViewUsersByEntity.find((r) => r.entityName === 'MJ: AI Agents');
        expect(agentQuery?.user?.ID).toBe(UI_USER.ID);
        expect(mockFilterRunnableAgents).toHaveBeenCalledWith(expect.anything(), UI_USER);

        // Internal engine writes (Task Types, parent Task, child Tasks, Task Dependencies, breakpoint update)
        // MUST use SYSTEM_USER so non-Owner UI callers succeed without needing direct CRUD rights
        const taskTypeCall = harness.calls.find((c) => c.EntityName === 'MJ: Task Types');
        expect(taskTypeCall?.User?.ID).toBe(SYSTEM_USER.ID);
        expect(taskTypeCall?.Saved).toBe(true);

        const taskCalls = harness.calls.filter((c) => c.EntityName === 'MJ: Tasks');
        expect(taskCalls.length).toBeGreaterThanOrEqual(4); // parent + 2 children + seedBreakpoints reload
        for (const call of taskCalls) {
            expect(call.User?.ID).toBe(SYSTEM_USER.ID);
            expect(call.Saved).toBe(true);
        }

        const depCalls = harness.calls.filter((c) => c.EntityName === 'MJ: Task Dependencies');
        expect(depCalls).toHaveLength(1);
        expect(depCalls[0].User?.ID).toBe(SYSTEM_USER.ID);
        expect(depCalls[0].Saved).toBe(true);

        // Attribution MUST remain bound to UI_USER (never SYSTEM_USER)
        const parentCreate = taskCalls.find((c) => c.Name === 'UI Submitted Durable Graph');
        const parentMeta = ParseTaskGraphParentMetadata(parentCreate?.InputPayload);
        expect(parentMeta.submittedByUserID).toBe(UI_USER.ID);

        const humanChild = taskCalls.find((c) => c.Name === 'Approve Research');
        expect(humanChild?.UserID).toBe(UI_USER.ID);
    });

    it('uses System User in RetryTask when reloading and updating failed tasks and blocked siblings', async () => {
        store.___SINGLETON__UserCache = {
            GetSystemUser: () => SYSTEM_USER,
        };

        const parentId = '33333333-3333-4333-8333-333333333333';
        const failedTaskId = '44444444-4444-4444-8444-444444444444';
        const siblingSaved = vi.fn(async () => true);

        const siblingEntity = {
            ID: '55555555-5555-4555-8555-555555555555',
            ParentID: parentId,
            Status: 'Blocked',
            Configuration: null,
            Save: siblingSaved,
        };

        const runViewCalls: Array<{ entityName: string; user: UserInfo | undefined }> = [];
        mockRunView.mockImplementation(async (params: { EntityName: string }, user?: UserInfo) => {
            runViewCalls.push({ entityName: params.EntityName, user });
            if (params.EntityName === 'MJ: Task Types') {
                return { Success: true, Results: [{ ID: 'type-1' }] };
            }
            if (params.EntityName === 'MJ: Tasks') {
                return { Success: true, Results: [siblingEntity] };
            }
            return { Success: true, Results: [] };
        });

        const existing = new Map<string, Partial<RecordedEntityCall>>([
            [failedTaskId, { ID: failedTaskId, ParentID: parentId, Status: 'Failed', InputPayload: '{}' }],
            [parentId, { ID: parentId, ParentID: null, Status: 'In Progress', InputPayload: '{}' }],
        ]);
        const harness = createProviderHarness(existing);

        const outcome = await new TaskGraphService().RetryTask(failedTaskId, {
            EnvironmentID: '',
            Provider: harness.provider,
            ContextUser: UI_USER,
        });

        expect(outcome.Success).toBe(true);
        const retriedLoad = harness.calls.find((c) => c.ID === failedTaskId);
        expect(retriedLoad?.User?.ID).toBe(SYSTEM_USER.ID);
        expect(retriedLoad?.Saved).toBe(true);
        expect(siblingEntity.Status).toBe('Pending');
        expect(siblingSaved).toHaveBeenCalledTimes(1);

        const siblingsRead = runViewCalls.find((c) => c.entityName === 'MJ: Tasks');
        expect(siblingsRead?.user?.ID).toBe(SYSTEM_USER.ID);
    });

    it('falls back cleanly to context.ContextUser when UserCache is not loaded', async () => {
        delete store.___SINGLETON__UserCache;

        mockRunView.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Task Types') {
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        const ownerUser = {
            ID: '99999999-9999-4999-8999-999999999999',
            Name: 'Direct Owner',
            Type: 'Owner',
        } as unknown as UserInfo;

        const harness = createProviderHarness();
        const spec: TaskGraphSpec = {
            workflowName: 'Fallback Graph',
            tasks: [
                {
                    tempId: 'only',
                    name: 'Human Review',
                    description: 'Approve',
                    kind: 'Human',
                    configuration: { instructions: 'Approve' },
                    dependsOn: [],
                },
            ],
        };

        const result = await new TaskGraphService().Submit(spec, {
            EnvironmentID: 'env-1',
            Provider: harness.provider,
            ContextUser: ownerUser,
        });

        expect(result.Success).toBe(true);
        for (const call of harness.calls) {
            expect(call.User?.ID).toBe(ownerUser.ID);
            expect(call.Saved).toBe(true);
        }
    });
});
