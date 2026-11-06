import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentFeedbackCoordinator } from '../AgentFeedbackCoordinator';
import {
    ParseAssignmentStrategy,
    type AgentRequestAssignmentStrategy,
    type AgentResponseForm,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentCategoryEntity,
    MJAIAgentRequestEntity,
    MJAIAgentRequestTypeEntity,
    MJAIAgentTypeEntity,
} from '@memberjunction/core-entities';
import {
    LogError,
    LogStatus,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';

const mockRunViews = vi.fn<(views: RunViewParams[], contextUser?: UserInfo) => Promise<RunViewResult[]>>();
const mockGetEntityObject = vi.fn<(entityName: string, contextUser?: UserInfo) => Promise<MJAIAgentRequestEntity>>();
/** The provider's entity factory, routed to {@link mockGetEntityObject} with the user it was called with. */
const providerGetEntityObject = ((entityName: string, contextUser?: UserInfo) =>
    mockGetEntityObject(entityName, contextUser)) as IMetadataProvider['GetEntityObject'];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, Object>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
        RunView: class MockRunView {
            public static FromMetadataProvider(_provider: IMetadataProvider): MockRunView {
                return new MockRunView();
            }
            public async RunViews(views: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult[]> {
                return mockRunViews(views, contextUser);
            }
        },
    };
});

const mockAgentTypes: MJAIAgentTypeEntity[] = [];
const mockAgentCategories: MJAIAgentCategoryEntity[] = [];
const mockAgentRequestTypes: MJAIAgentRequestTypeEntity[] = [];
const mockResolveAgentRequestTypeID = vi.fn<(name: 'Approval' | 'Information', contextUser?: UserInfo) => Promise<string | null>>();

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                get AgentTypes(): MJAIAgentTypeEntity[] {
                    return mockAgentTypes;
                },
                get AgentCategories(): MJAIAgentCategoryEntity[] {
                    return mockAgentCategories;
                },
                get AgentRequestTypes(): MJAIAgentRequestTypeEntity[] {
                    return mockAgentRequestTypes;
                },
                ResolveAgentRequestTypeID: (name: 'Approval' | 'Information', contextUser?: UserInfo) =>
                    mockResolveAgentRequestTypeID(name, contextUser),
            };
        },
    },
}));

const USER_1 = '11111111-1111-4111-8111-000000000001';
const USER_2 = '22222222-2222-4222-8222-000000000002';
const USER_3 = '33333333-3333-4333-8333-000000000003';
const OWNER_ID = '44444444-4444-4444-8444-000000000004';
const CALLER_ID = '55555555-5555-4555-8555-000000000005';
const LIST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const AGENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const AGENT_TYPE_ID = 'eeeeeeee-eeee-4eee-8eee-000000000099';

function createAgentStub(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const base: Partial<MJAIAgentEntityExtended> = {
        ID: AGENT_ID,
        Name: 'CoordinatorTestAgent',
        TypeID: AGENT_TYPE_ID,
        OwnerUserID: OWNER_ID,
        CategoryID: null,
        ...overrides,
    };
    return base as MJAIAgentEntityExtended;
}

function createParamsStub(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    const caller: Partial<UserInfo> = { ID: CALLER_ID, Name: 'Caller User' };
    return {
        agent: createAgentStub(),
        conversationMessages: [],
        contextUser: caller as UserInfo,
        ...overrides,
    };
}

function makeViewResult<T>(results: T[], success: boolean = true): RunViewResult<T> {
    return {
        Success: success,
        Results: results,
        RowCount: results.length,
        TotalRowCount: results.length,
        ExecutionTime: 1,
        ErrorMessage: success ? '' : 'Simulated view failure',
        UserViewRunID: '',
    };
}

describe('AgentFeedbackCoordinator', () => {
    let coordinator: AgentFeedbackCoordinator;

    beforeEach(() => {
        vi.resetAllMocks();
        mockAgentTypes.length = 0;
        mockAgentCategories.length = 0;
        mockAgentRequestTypes.length = 0;
        coordinator = new AgentFeedbackCoordinator();
    });

    describe('ParseAssignmentStrategy', () => {
        it('should parse valid JSON strategy and return null for invalid or missing type', () => {
            expect(ParseAssignmentStrategy(null)).toBeNull();
            expect(ParseAssignmentStrategy('not-json')).toBeNull();
            expect(ParseAssignmentStrategy('{"foo":"bar"}')).toBeNull();
            expect(
                ParseAssignmentStrategy(
                    JSON.stringify({
                        type: 'List',
                        listID: LIST_ID,
                        listStrategy: 'LeastBusy',
                        priority: 80,
                    })
                )
            ).toEqual({
                type: 'List',
                listID: LIST_ID,
                listStrategy: 'LeastBusy',
                priority: 80,
            });
        });
    });

    describe('BuildPlanApprovalForm and DetectRequestTypeName', () => {
        it('should build a 3-question editable plan form and detect single-question Approval vs Information forms', () => {
            const planForm = coordinator.BuildPlanApprovalForm('Step 1: Analyze');
            expect(planForm.questions).toHaveLength(3);
            expect(planForm.questions[0].defaultValue).toBe('Step 1: Analyze');
            expect(coordinator.DetectRequestTypeName(planForm)).toBe('Information');

            expect(
                coordinator.DetectRequestTypeName({
                    title: 'Confirm Action',
                    questions: [
                        {
                            id: 'decision',
                            label: 'Decision',
                            type: {
                                type: 'buttongroup',
                                options: [
                                    { value: 'approve', label: 'Approve' },
                                    { value: 'reject', label: 'Reject' },
                                ],
                            },
                        },
                    ],
                })
            ).toBe('Approval');
        });
    });

    describe('ResolveAssignmentStrategy', () => {
        it('should resolve from runtime override first, then AgentType, then Category hierarchy (with cycle guard), then RequestType', async () => {
            const catChild: Partial<MJAIAgentCategoryEntity> = {
                ID: 'cccccccc-cccc-4ccc-8ccc-000000000001',
                ParentID: 'cccccccc-cccc-4ccc-8ccc-000000000002',
                AssignmentStrategy: null,
            };
            const catParent: Partial<MJAIAgentCategoryEntity> = {
                ID: 'cccccccc-cccc-4ccc-8ccc-000000000002',
                ParentID: 'cccccccc-cccc-4ccc-8ccc-000000000001', // cycle back to child
                AssignmentStrategy: JSON.stringify({ type: 'AgentOwner', priority: 60 }),
            };
            mockAgentCategories.push(
                catChild as MJAIAgentCategoryEntity,
                catParent as MJAIAgentCategoryEntity
            );

            const reqType: Partial<MJAIAgentRequestTypeEntity> = {
                ID: 'dddddddd-dddd-4ddd-8ddd-000000000001',
                Name: 'Approval',
                DefaultAssignmentStrategy: JSON.stringify({ type: 'SharedInbox' }),
            };
            mockAgentRequestTypes.push(reqType as MJAIAgentRequestTypeEntity);

            // 1. Category hierarchy resolution (walks child -> parent)
            const catParams = createParamsStub({
                agent: createAgentStub({ CategoryID: 'cccccccc-cccc-4ccc-8ccc-000000000001' }),
            });
            const fromCategory = await coordinator.ResolveAssignmentStrategy(
                catParams,
                'dddddddd-dddd-4ddd-8ddd-000000000001'
            );
            expect(fromCategory).toEqual({ type: 'AgentOwner', priority: 60 });

            // 2. AgentType takes precedence over Category
            const agentTypeStub: Partial<MJAIAgentTypeEntity> = {
                ID: AGENT_TYPE_ID,
                AssignmentStrategy: JSON.stringify({ type: 'RunUser' }),
            };
            mockAgentTypes.push(agentTypeStub as MJAIAgentTypeEntity);
            const fromAgentType = await coordinator.ResolveAssignmentStrategy(
                catParams,
                'dddddddd-dddd-4ddd-8ddd-000000000001'
            );
            expect(fromAgentType).toEqual({ type: 'RunUser' });

            // 3. Runtime override takes precedence over everything
            const overrideParams = createParamsStub({
                assignmentStrategy: { type: 'SpecificUser', userID: USER_1 },
            });
            const fromOverride = await coordinator.ResolveAssignmentStrategy(
                overrideParams,
                'dddddddd-dddd-4ddd-8ddd-000000000001'
            );
            expect(fromOverride).toEqual({ type: 'SpecificUser', userID: USER_1 });
        });
    });

    describe('ResolveAssigneeUserID — List strategy modes', () => {
        it('should include Pending, Active, Complete, Other, and null list detail statuses while excluding Disabled, Error, and Rejected', async () => {
            const user4 = '66666666-6666-4666-8666-000000000006';
            const user5 = '77777777-7777-4777-8777-000000000007';
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-disabled', RecordID: OWNER_ID, Sequence: 1, Status: 'Disabled' },
                        { ID: 'ld-error', RecordID: CALLER_ID, Sequence: 2, Status: 'Error' },
                        { ID: 'ld-rejected', RecordID: '88888888-8888-4888-8888-000000000008', Sequence: 3, Status: 'Rejected' },
                        { ID: 'ld-pending', RecordID: USER_1, Sequence: 4, Status: 'Pending' },
                        { ID: 'ld-active', RecordID: USER_2, Sequence: 5, Status: 'Active' },
                        { ID: 'ld-complete', RecordID: USER_3, Sequence: 6, Status: 'Complete' },
                        { ID: 'ld-other', RecordID: user4, Sequence: 7, Status: 'Other' },
                        { ID: 'ld-null', RecordID: user5, Sequence: 8, Status: null },
                    ]),
                ])
                .mockResolvedValueOnce([
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_2, IsActive: true },
                        { ID: USER_3, IsActive: true },
                        { ID: user4, IsActive: true },
                        { ID: user5, IsActive: true },
                    ]),
                    makeViewResult([]),
                ]);

            const picked = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub()
            );
            expect(picked).toBe(USER_1);
            const firstBatchViews = mockRunViews.mock.calls[0][0];
            expect(firstBatchViews[0].EntityName).toBe('MJ: Lists');
            expect(firstBatchViews[0].ExtraFilter).toBe(`ID = '${LIST_ID}'`);
            expect(firstBatchViews[1].EntityName).toBe('MJ: List Details');
            expect(firstBatchViews[1].ExtraFilter).toBe(
                `ListID = '${LIST_ID}' AND (Status IS NULL OR Status NOT IN ('Disabled', 'Error', 'Rejected'))`
            );
            expect(firstBatchViews[1].OrderBy).toBe('Sequence ASC, ID ASC');
            const secondBatchViews = mockRunViews.mock.calls[1][0];
            expect(secondBatchViews[0].EntityName).toBe('MJ: Users');
            expect(secondBatchViews[0].ExtraFilter).toBe(
                `ID IN ('${USER_1}', '${USER_2}', '${USER_3}', '${user4}', '${user5}') AND IsActive = 1`
            );
            expect(secondBatchViews[1].EntityName).toBe('MJ: AI Agent Requests');
            expect(secondBatchViews[1].OrderBy).toBe('RequestedAt DESC, ID DESC');
            expect(secondBatchViews[1].MaxRows).toBe(1);
        });

        it('should rotate through active list members in RoundRobin order and wrap around', async () => {
            // First call: last assigned was USER_1 -> should pick USER_2 (rows use default 'Pending' status)
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-2', RecordID: USER_2, Sequence: 2, Status: 'Pending' },
                        { ID: 'ld-1', RecordID: USER_1.toUpperCase(), Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-3', RecordID: USER_3, Sequence: 3, Status: 'Pending' },
                    ]),
                ])
                .mockResolvedValueOnce([
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_2, IsActive: true },
                        { ID: USER_3, IsActive: true },
                    ]),
                    makeViewResult([
                        {
                            ID: 'req-prev',
                            AgentID: AGENT_ID,
                            RequestForUserID: USER_1,
                            RequestedAt: '2026-11-01T10:00:00Z',
                        },
                    ]),
                ]);

            const params = createParamsStub();
            const pick1 = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                params
            );
            expect(pick1).toBe(USER_2);

            const roundRobinBatch1 = mockRunViews.mock.calls[0][0];
            expect(roundRobinBatch1[0].ExtraFilter).toBe(`ID = '${LIST_ID}'`);
            expect(roundRobinBatch1[1].ExtraFilter).toBe(
                `ListID = '${LIST_ID}' AND (Status IS NULL OR Status NOT IN ('Disabled', 'Error', 'Rejected'))`
            );
            expect(roundRobinBatch1[1].OrderBy).toBe('Sequence ASC, ID ASC');

            const roundRobinBatch2 = mockRunViews.mock.calls[1][0];
            expect(roundRobinBatch2[0].ExtraFilter).toBe(
                `ID IN ('${USER_1.toUpperCase()}', '${USER_2}', '${USER_3}') AND IsActive = 1`
            );
            expect(roundRobinBatch2[1].ExtraFilter).toBe(
                `AgentID = '${AGENT_ID}' AND RequestForUserID IN ('${USER_1.toUpperCase()}', '${USER_2}', '${USER_3}')`
            );
            expect(roundRobinBatch2[1].OrderBy).toBe('RequestedAt DESC, ID DESC');
            expect(roundRobinBatch2[1].MaxRows).toBe(1);

            // Second call: last assigned was USER_3 (last in sequence) -> wraps around to USER_1
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-2', RecordID: USER_2, Sequence: 2, Status: 'Pending' },
                        { ID: 'ld-3', RecordID: USER_3, Sequence: 3, Status: 'Pending' },
                    ]),
                ])
                .mockResolvedValueOnce([
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_2, IsActive: true },
                        { ID: USER_3, IsActive: true },
                    ]),
                    makeViewResult([
                        {
                            ID: 'req-prev-3',
                            AgentID: AGENT_ID,
                            RequestForUserID: USER_3.toUpperCase(),
                            RequestedAt: '2026-11-01T11:00:00Z',
                        },
                    ]),
                ]);

            const pick2 = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                params
            );
            expect(pick2).toBe(USER_1);
        });

        it('should pick the active member with the fewest open requests in LeastBusy mode and break ties by oldest assignment then list sequence', async () => {
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-2', RecordID: USER_2, Sequence: 2, Status: 'Pending' },
                        { ID: 'ld-3', RecordID: USER_3, Sequence: 3, Status: 'Pending' },
                    ]),
                ])
                .mockResolvedValueOnce([
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_2, IsActive: true },
                        { ID: USER_3, IsActive: true },
                    ]),
                    makeViewResult([
                        // USER_1 has 2 open requests
                        {
                            ID: 'r1',
                            RequestForUserID: USER_1,
                            Status: 'Requested',
                            RequestedAt: '2026-11-02T10:00:00Z',
                        },
                        {
                            ID: 'r2',
                            RequestForUserID: USER_1,
                            Status: 'Requested',
                            RequestedAt: '2026-11-02T11:00:00Z',
                        },
                        // USER_2 and USER_3 both have 1 open request; USER_3's latest assignment is older than USER_2's
                        {
                            ID: 'r3',
                            RequestForUserID: USER_2,
                            Status: 'Requested',
                            RequestedAt: '2026-11-02T12:00:00Z',
                        },
                        {
                            ID: 'r4',
                            RequestForUserID: USER_3,
                            Status: 'Requested',
                            RequestedAt: '2026-11-01T08:00:00Z',
                        },
                        // Responded requests do not count as open
                        {
                            ID: 'r5',
                            RequestForUserID: USER_3,
                            Status: 'Responded',
                            RequestedAt: '2026-10-30T08:00:00Z',
                        },
                    ]),
                    // latest assignments of any status, newest first
                    makeViewResult([
                        { ID: 'r3', RequestForUserID: USER_2, RequestedAt: '2026-11-02T12:00:00Z' },
                        { ID: 'r2', RequestForUserID: USER_1, RequestedAt: '2026-11-02T11:00:00Z' },
                        { ID: 'r1', RequestForUserID: USER_1, RequestedAt: '2026-11-02T10:00:00Z' },
                        { ID: 'r4', RequestForUserID: USER_3, RequestedAt: '2026-11-01T08:00:00Z' },
                        { ID: 'r5', RequestForUserID: USER_3, RequestedAt: '2026-10-30T08:00:00Z' },
                    ]),
                ]);

            const picked = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'LeastBusy' },
                createParamsStub()
            );
            expect(picked).toBe(USER_3);

            const leastBusyBatch2 = mockRunViews.mock.calls[1][0];
            expect(leastBusyBatch2[0].ExtraFilter).toBe(
                `ID IN ('${USER_1}', '${USER_2}', '${USER_3}') AND IsActive = 1`
            );
            expect(leastBusyBatch2[1].ExtraFilter).toBe(
                `RequestForUserID IN ('${USER_1}', '${USER_2}', '${USER_3}') AND Status = 'Requested'`
            );
            expect(leastBusyBatch2[1].OrderBy).toBe('RequestedAt DESC, ID DESC');
            expect(leastBusyBatch2[1].IgnoreMaxRows).toBe(true);
            expect(leastBusyBatch2[1].MaxRows).toBeUndefined();
            expect(leastBusyBatch2[2].ExtraFilter).toBe(`RequestForUserID IN ('${USER_1}', '${USER_2}', '${USER_3}')`);
            expect(leastBusyBatch2[2].OrderBy).toBe('RequestedAt DESC, ID DESC');
            expect(leastBusyBatch2[2].MaxRows).toBe(500);
        });

        it('should break a LeastBusy tie at zero open requests by the oldest last assignment of any status, not list order', async () => {
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-2', RecordID: USER_2, Sequence: 2, Status: 'Pending' },
                    ]),
                ])
                .mockResolvedValueOnce([
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_2, IsActive: true },
                    ]),
                    // neither member has an open request
                    makeViewResult([]),
                    // USER_1 answered a request yesterday; USER_2 was last assigned a week ago
                    makeViewResult([
                        { ID: 'a1', RequestForUserID: USER_1, RequestedAt: '2026-11-05T09:00:00Z' },
                        { ID: 'a2', RequestForUserID: USER_2, RequestedAt: '2026-10-29T09:00:00Z' },
                    ]),
                ]);

            const picked = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'LeastBusy' },
                createParamsStub()
            );
            expect(picked).toBe(USER_2);
        });

        it('should count a user with 10 older open Requested rows beyond 500 newer closed rows in LeastBusy mode', async () => {
            const allRequests = [
                // 1 recent open request for USER_2 (newest row)
                {
                    ID: 'open-user-2',
                    RequestForUserID: USER_2,
                    Status: 'Requested' as const,
                    RequestedAt: '2026-11-06T12:00:00Z',
                },
                // 500 newer Responded requests for USER_1
                ...Array.from({ length: 500 }, (_, i) => ({
                    ID: `closed-${i}`,
                    RequestForUserID: USER_1,
                    Status: 'Responded' as const,
                    RequestedAt: '2026-11-05T12:00:00Z',
                })),
                // 10 older open requests for USER_1 (sit past index 500 if closed rows are not filtered out)
                ...Array.from({ length: 10 }, (_, i) => ({
                    ID: `open-user-1-${i}`,
                    RequestForUserID: USER_1,
                    Status: 'Requested' as const,
                    RequestedAt: '2026-10-01T12:00:00Z',
                })),
            ];

            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-2', RecordID: USER_2, Sequence: 2, Status: 'Pending' },
                    ]),
                ])
                .mockImplementationOnce(async (views: RunViewParams[]) => {
                    const reqView = views[1];
                    const filterStr = String(reqView.ExtraFilter ?? '');
                    const filtered = filterStr.includes("Status = 'Requested'")
                        ? allRequests.filter((r) => r.Status === 'Requested')
                        : allRequests;
                    const capped =
                        reqView.IgnoreMaxRows === true
                            ? filtered
                            : filtered.slice(0, reqView.MaxRows ?? 1000);
                    return [
                        makeViewResult([
                            { ID: USER_1, IsActive: true },
                            { ID: USER_2, IsActive: true },
                        ]),
                        makeViewResult(capped),
                        makeViewResult(allRequests.slice(0, views[2].MaxRows ?? 1000)),
                    ];
                });

            const picked = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'LeastBusy' },
                createParamsStub()
            );
            expect(picked).toBe(USER_2);

            const secondBatchViews = mockRunViews.mock.calls[1][0];
            expect(secondBatchViews[1].ExtraFilter).toBe(
                `RequestForUserID IN ('${USER_1}', '${USER_2}') AND Status = 'Requested'`
            );
            expect(secondBatchViews[1].OrderBy).toBe('RequestedAt DESC, ID DESC');
            expect(secondBatchViews[1].IgnoreMaxRows).toBe(true);
            expect(secondBatchViews[1].MaxRows).toBeUndefined();
        });

        it('should use the injected RandomInt function in Random mode and exclude inactive users', async () => {
            const deterministicCoordinator = new AgentFeedbackCoordinator({
                RandomInt: (_maxExclusive: number) => 1,
            });

            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-2', RecordID: USER_2, Sequence: 2, Status: 'Pending' },
                        { ID: 'ld-3', RecordID: USER_3, Sequence: 3, Status: 'Pending' },
                    ]),
                ])
                .mockResolvedValueOnce([
                    // USER_2 is returned with IsActive: false; in-memory filter must exclude USER_2 so active users are [USER_1, USER_3]
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_2, IsActive: false },
                        { ID: USER_3, IsActive: true },
                    ]),
                ]);

            const picked = await deterministicCoordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'Random' },
                createParamsStub()
            );
            // Index 1 of [USER_1, USER_3] is USER_3 (would be USER_2 if inactive filtering were omitted)
            expect(picked).toBe(USER_3);

            const firstBatchViews = mockRunViews.mock.calls[0][0];
            expect(firstBatchViews[1].ExtraFilter).toBe(
                `ListID = '${LIST_ID}' AND (Status IS NULL OR Status NOT IN ('Disabled', 'Error', 'Rejected'))`
            );
            expect(firstBatchViews[1].OrderBy).toBe('Sequence ASC, ID ASC');

            const secondBatchViews = mockRunViews.mock.calls[1][0];
            expect(secondBatchViews).toHaveLength(1);
            expect(secondBatchViews[0].EntityName).toBe('MJ: Users');
            expect(secondBatchViews[0].ExtraFilter).toBe(
                `ID IN ('${USER_1}', '${USER_2}', '${USER_3}') AND IsActive = 1`
            );
        });

        it('should fall back to contextUser.ID or null (unassigned) when list has no member rows, zero active users, or is not an MJ: Users list', async () => {
            // Non-Users list with contextUser present
            mockRunViews.mockResolvedValueOnce([
                makeViewResult([{ ID: LIST_ID, EntityID: 'e-contacts', Entity: 'MJ: Contacts' }]),
                makeViewResult([{ ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' }]),
            ]);

            const fallbackCaller = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub()
            );
            expect(fallbackCaller).toBe(CALLER_ID);
            expect(LogStatus).toHaveBeenCalledWith(
                `⚠️ List ${LIST_ID} does not exist or does not target 'MJ: Users'; falling back to context user`
            );

            // Empty member rows with contextUser present -> context user
            mockRunViews.mockResolvedValueOnce([
                makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                makeViewResult([{ ID: 'ld-disabled', RecordID: USER_1, Sequence: 1, Status: 'Disabled' }]),
            ]);

            const fallbackEmptyMembers = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub()
            );
            expect(fallbackEmptyMembers).toBe(CALLER_ID);
            expect(LogStatus).toHaveBeenCalledWith(
                `ℹ️ List ${LIST_ID} has no active member rows; falling back to context user`
            );

            // Zero active users and no contextUser -> null (unassigned)
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([{ ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' }]),
                ])
                .mockResolvedValueOnce([makeViewResult([])]);

            const fallbackUnassigned = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub({ contextUser: undefined })
            );
            expect(fallbackUnassigned).toBeNull();
            expect(LogStatus).toHaveBeenCalledWith(
                `ℹ️ List ${LIST_ID} has zero active users; falling back to unassigned (no context user)`
            );
        });

        it('should log an error via LogError and fall back to the first active list member when the RoundRobin or LeastBusy request query fails', async () => {
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([
                        { ID: 'ld-1', RecordID: USER_2, Sequence: 1, Status: 'Pending' },
                        { ID: 'ld-2', RecordID: USER_3, Sequence: 2, Status: 'Pending' },
                    ]),
                ])
                .mockResolvedValueOnce([
                    makeViewResult([
                        { ID: USER_2, IsActive: true },
                        { ID: USER_3, IsActive: true },
                    ]),
                    makeViewResult([], false),
                ]);

            const picked = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub()
            );
            expect(picked).toBe(USER_2);
            expect(LogError).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to load agent requests for list ${LIST_ID} (RoundRobin): Simulated view failure`)
            );
        });
    });

    describe('CreateFeedbackRequest', () => {
        it('should create and save an MJ: AI Agent Requests record with resolved strategy, user, priority, and expiration', async () => {
            const savedRecord: Partial<MJAIAgentRequestEntity> & {
                Save: () => Promise<boolean>;
                NewRecord: () => boolean;
            } = {
                ID: 'eeeeeeee-eeee-4eee-8eee-000000000001',
                NewRecord: () => true,
                Save: vi.fn(async () => true),
            };
            mockGetEntityObject.mockResolvedValueOnce(savedRecord as MJAIAgentRequestEntity);
            mockResolveAgentRequestTypeID.mockResolvedValueOnce('dddddddd-dddd-4ddd-8ddd-000000000001');

            const params = createParamsStub({
                assignmentStrategy: {
                    type: 'SpecificUser',
                    userID: USER_2,
                    priority: 90,
                    expirationMinutes: 30,
                },
            });
            const agentRun: Partial<MJAIAgentRunEntityExtended> = {
                ID: 'ffffffff-ffff-4fff-8fff-000000000001',
            };
            const step: Partial<MJAIAgentRunStepEntityExtended> = {
                ID: '99999999-9999-4999-8999-000000000001',
            };
            const decision: BaseAgentNextStep = {
                step: 'Chat',
                terminate: true,
                message: 'Please approve the plan.',
                responseForm: coordinator.BuildPlanApprovalForm('Step 1: Execute'),
            };
            const providerStub: Partial<IMetadataProvider> = {
                GetEntityObject: providerGetEntityObject,
            };

            const requestId = await coordinator.CreateFeedbackRequest({
                Params: params,
                AgentRun: agentRun as MJAIAgentRunEntityExtended,
                StepEntity: step as MJAIAgentRunStepEntityExtended,
                Decision: decision,
                Provider: providerStub as IMetadataProvider,
            });

            expect(requestId).toBe('eeeeeeee-eeee-4eee-8eee-000000000001');
            expect(savedRecord.OriginatingAgentRunID).toBe('ffffffff-ffff-4fff-8fff-000000000001');
            expect(savedRecord.OriginatingAgentRunStepID).toBe('99999999-9999-4999-8999-000000000001');
            expect(savedRecord.RequestForUserID).toBe(USER_2);
            expect(savedRecord.RequestTypeID).toBe('dddddddd-dddd-4ddd-8ddd-000000000001');
            expect(savedRecord.Priority).toBe(90);
            expect(savedRecord.ExpiresAt).toBeInstanceOf(Date);
            expect(savedRecord.Status).toBe('Requested');
            expect(savedRecord.Save).toHaveBeenCalledOnce();
        });
    });

    describe('ResolveRequestTypeID', () => {
        // The lookup must go through the AI engine (AIEngineBase caches the table during Config and exposes
        // ResolveAgentRequestTypeID), not a private per-run RunView, so the actions, the Chief of Staff app and the
        // agent runner all resolve a type through one source.
        const tester: Partial<UserInfo> = { ID: 'u1', Name: 'Tester' };
        const ctx = tester as UserInfo;

        function engineKnows(types: Array<{ ID: string; Name: string }>): void {
            mockResolveAgentRequestTypeID.mockImplementation(async (name: string) =>
                types.find((t) => t.Name.toLowerCase() === name.trim().toLowerCase())?.ID ?? null
            );
        }

        const approvalForm: AgentResponseForm = {
            questions: [
                {
                    id: 'q1',
                    label: 'Approve this?',
                    type: {
                        type: 'buttongroup',
                        options: [
                            { label: 'Approve', value: 'approve' },
                            { label: 'Reject', value: 'reject' },
                        ],
                    },
                },
            ],
        };

        it('resolves "Information" through the engine cache when there is no response form', async () => {
            engineKnows([{ ID: 'RT-INFO', Name: 'Information' }, { ID: 'RT-APPR', Name: 'Approval' }]);

            const id = await coordinator.ResolveRequestTypeID({ step: 'Chat', terminate: false }, ctx);

            expect(id).toBe('RT-INFO');
            expect(mockResolveAgentRequestTypeID).toHaveBeenCalledWith('Information', ctx);
        });

        it('resolves "Approval" for a two-button approve/reject form', async () => {
            engineKnows([{ ID: 'RT-INFO', Name: 'Information' }, { ID: 'RT-APPR', Name: 'Approval' }]);

            const id = await coordinator.ResolveRequestTypeID({ step: 'Chat', terminate: false, responseForm: approvalForm }, ctx);

            expect(id).toBe('RT-APPR');
            expect(mockResolveAgentRequestTypeID).toHaveBeenCalledWith('Approval', ctx);
        });

        it('returns null when the engine has no matching request type', async () => {
            engineKnows([]);

            const id = await coordinator.ResolveRequestTypeID({ step: 'Chat', terminate: false }, ctx);

            expect(id).toBeNull();
        });

        it('returns null instead of throwing when the engine cannot be configured', async () => {
            mockResolveAgentRequestTypeID.mockRejectedValue(new Error('metadata unavailable'));

            const id = await coordinator.ResolveRequestTypeID({ step: 'Chat', terminate: false }, ctx);

            expect(id).toBeNull();
        });
    });

    describe('assignment resolution chain', () => {
        const USER_A = 'AAAA-1111';
        const USER_B = 'BBBB-2222';
        const USER_C = 'CCCC-3333';

        const AGENT_TYPE_LOOP: Partial<MJAIAgentTypeEntity> = {
            ID: 'type-loop',
            AssignmentStrategy: null,
        };
        const AGENT_TYPE_FLOW: Partial<MJAIAgentTypeEntity> = {
            ID: 'type-flow',
            AssignmentStrategy: JSON.stringify({ type: 'AgentOwner' }),
        };

        const CATEGORIES: Array<Partial<MJAIAgentCategoryEntity>> = [
            { ID: 'cat-root', ParentID: null, AssignmentStrategy: JSON.stringify({ type: 'RunUser', priority: 25 }) },
            { ID: 'cat-assistant', ParentID: 'cat-root', AssignmentStrategy: null },
            { ID: 'cat-research', ParentID: 'cat-root', AssignmentStrategy: JSON.stringify({ type: 'SpecificUser', userID: USER_C }) },
            { ID: 'cat-deep-research', ParentID: 'cat-research', AssignmentStrategy: null },
        ];

        const RT_APPROVAL: Partial<MJAIAgentRequestTypeEntity> = {
            ID: 'rt-approval',
            DefaultAssignmentStrategy: JSON.stringify({ type: 'AgentOwner', priority: 80 }),
        };
        const RT_CHAT: Partial<MJAIAgentRequestTypeEntity> = {
            ID: 'rt-chat',
            DefaultAssignmentStrategy: null,
        };

        function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
            const base: Partial<MJAIAgentEntityExtended> = {
                ID: 'agent-1',
                Name: 'TestAgent',
                OwnerUserID: USER_B,
                TypeID: 'type-loop',
                CategoryID: 'cat-assistant',
                ...overrides,
            };
            return base as MJAIAgentEntityExtended;
        }

        function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
            const caller: Partial<UserInfo> = { ID: USER_A };
            return {
                agent: makeAgent(),
                conversationMessages: [],
                contextUser: caller as UserInfo,
                ...overrides,
            };
        }

        describe('ResolveAssignmentStrategy', () => {
            it('should return per-invocation strategy when provided (highest priority)', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
                mockAgentRequestTypes.push(RT_APPROVAL as MJAIAgentRequestTypeEntity);

                const perInvocation: AgentRequestAssignmentStrategy = { type: 'SpecificUser', userID: USER_C };
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ assignmentStrategy: perInvocation }),
                    'rt-approval'
                );
                expect(result).toEqual(perInvocation);
            });

            it('should return agent type strategy when no per-invocation strategy', async () => {
                mockAgentTypes.push(
                    AGENT_TYPE_LOOP as MJAIAgentTypeEntity,
                    AGENT_TYPE_FLOW as MJAIAgentTypeEntity
                );
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ agent: makeAgent({ TypeID: 'type-flow' }) }),
                    null
                );
                expect(result).toEqual({ type: 'AgentOwner' });
            });

            it('should walk category tree and find strategy on parent', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
                const result = await coordinator.ResolveAssignmentStrategy(makeParams(), null);
                expect(result).toEqual({ type: 'RunUser', priority: 25 });
            });

            it('should find strategy on the direct category (not walk further up)', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'cat-research' }) }),
                    null
                );
                expect(result).toEqual({ type: 'SpecificUser', userID: USER_C });
            });

            it('should walk up from deep-research to research (skip to first strategy)', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: 'cat-deep-research' }) }),
                    null
                );
                expect(result).toEqual({ type: 'SpecificUser', userID: USER_C });
            });

            it('should fall back to request type strategy when category tree is empty', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentRequestTypes.push(RT_APPROVAL as MJAIAgentRequestTypeEntity);
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: null }) }),
                    'rt-approval'
                );
                expect(result).toEqual({ type: 'AgentOwner', priority: 80 });
            });

            it('should return null when no strategy is found anywhere', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentRequestTypes.push(RT_CHAT as MJAIAgentRequestTypeEntity);
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ agent: makeAgent({ CategoryID: null }) }),
                    'rt-chat'
                );
                expect(result).toBeNull();
            });

            it('should return null when all lookups miss (no matching type, no category, no RT)', async () => {
                mockAgentTypes.push(AGENT_TYPE_LOOP as MJAIAgentTypeEntity);
                mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
                mockAgentRequestTypes.push(RT_APPROVAL as MJAIAgentRequestTypeEntity);
                const result = await coordinator.ResolveAssignmentStrategy(
                    makeParams({ agent: makeAgent({ TypeID: 'nonexistent', CategoryID: 'nonexistent' }) }),
                    'nonexistent'
                );
                expect(result).toBeNull();
            });
        });

        describe('ResolveCategoryAssignmentStrategy', () => {
            beforeEach(() => {
                mockAgentCategories.push(...(CATEGORIES as MJAIAgentCategoryEntity[]));
            });

            it('should return null for null categoryId', async () => {
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: null }) })
                    )
                ).toBeNull();
            });

            it('should return null for unknown category', async () => {
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: 'unknown' }) })
                    )
                ).toBeNull();
            });

            it('should return strategy from direct category', async () => {
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: 'cat-root' }) })
                    )
                ).toEqual({
                    type: 'RunUser',
                    priority: 25,
                });
            });

            it('should walk up to parent when direct category has no strategy', async () => {
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: 'cat-assistant' }) })
                    )
                ).toEqual({
                    type: 'RunUser',
                    priority: 25,
                });
            });

            it('should stop at the first non-null strategy in the chain', async () => {
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: 'cat-deep-research' }) })
                    )
                ).toEqual({
                    type: 'SpecificUser',
                    userID: USER_C,
                });
            });

            it('should handle circular ParentID references without infinite loop', async () => {
                mockAgentCategories.length = 0;
                mockAgentCategories.push(
                    { ID: 'a', ParentID: 'b', AssignmentStrategy: null } as MJAIAgentCategoryEntity,
                    { ID: 'b', ParentID: 'a', AssignmentStrategy: null } as MJAIAgentCategoryEntity
                );
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: 'a' }) })
                    )
                ).toBeNull();
            });

            it('should handle self-referencing ParentID', async () => {
                mockAgentCategories.length = 0;
                mockAgentCategories.push({
                    ID: 'self',
                    ParentID: 'self',
                    AssignmentStrategy: null,
                } as MJAIAgentCategoryEntity);
                expect(
                    await coordinator.ResolveCategoryAssignmentStrategy(
                        makeParams({ agent: makeAgent({ CategoryID: 'self' }) })
                    )
                ).toBeNull();
            });
        });

        describe('ResolveAssigneeUserID and ResolveStaticAssigneeUserID', () => {
            const defaultRun: Partial<MJAIAgentRunEntityExtended> = { UserID: USER_C };

            describe('when strategy is null (fallback)', () => {
                it('should return contextUser ID', () => {
                    expect(
                        coordinator.ResolveStaticAssigneeUserID(
                            null,
                            makeParams(),
                            defaultRun as MJAIAgentRunEntityExtended
                        )
                    ).toBe(USER_A);
                });

                it('should return null if no contextUser', () => {
                    expect(
                        coordinator.ResolveStaticAssigneeUserID(
                            null,
                            makeParams({ contextUser: undefined }),
                            null
                        )
                    ).toBeNull();
                });
            });

            describe('RunUser strategy', () => {
                const strategy: AgentRequestAssignmentStrategy = { type: 'RunUser' };

                it('should return contextUser ID', () => {
                    expect(
                        coordinator.ResolveStaticAssigneeUserID(
                            strategy,
                            makeParams(),
                            defaultRun as MJAIAgentRunEntityExtended
                        )
                    ).toBe(USER_A);
                });

                it('should fall back to agentRun UserID when no contextUser', () => {
                    expect(
                        coordinator.ResolveStaticAssigneeUserID(
                            strategy,
                            makeParams({ contextUser: undefined }),
                            defaultRun as MJAIAgentRunEntityExtended
                        )
                    ).toBe(USER_C);
                });

                it('should return null when no contextUser and no agentRun', () => {
                    expect(
                        coordinator.ResolveStaticAssigneeUserID(
                            strategy,
                            makeParams({ contextUser: undefined }),
                            null
                        )
                    ).toBeNull();
                });
            });

            describe('AgentOwner strategy', () => {
                const strategy: AgentRequestAssignmentStrategy = { type: 'AgentOwner' };

                it('should return agent OwnerUserID', () => {
                    expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBe(USER_B);
                });

                it('should return null when agent has no OwnerUserID', () => {
                    expect(
                        coordinator.ResolveStaticAssigneeUserID(
                            strategy,
                            makeParams({ agent: makeAgent({ OwnerUserID: null }) }),
                            null
                        )
                    ).toBeNull();
                });
            });

            describe('SpecificUser strategy', () => {
                it('should return the specified userID', () => {
                    const strategy: AgentRequestAssignmentStrategy = {
                        type: 'SpecificUser',
                        userID: 'specific-user',
                    };
                    expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBe(
                        'specific-user'
                    );
                });

                it('should return null when userID is not set', () => {
                    const strategy: AgentRequestAssignmentStrategy = { type: 'SpecificUser' };
                    expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBeNull();
                });
            });

            describe('List strategy', () => {
                it('should resolve active list member via ResolveAssigneeUserID (RoundRobin)', async () => {
                    mockRunViews
                        .mockResolvedValueOnce([
                            makeViewResult([{ ID: 'some-list', EntityID: 'e-users', Entity: 'MJ: Users' }]),
                            makeViewResult([
                                { ID: 'ld-1', RecordID: USER_B, Sequence: 1, Status: 'Pending' },
                                { ID: 'ld-2', RecordID: USER_C, Sequence: 2, Status: 'Pending' },
                            ]),
                        ])
                        .mockResolvedValueOnce([
                            makeViewResult([
                                { ID: USER_B, IsActive: true },
                                { ID: USER_C, IsActive: true },
                            ]),
                            makeViewResult([]),
                        ]);

                    const strategy: AgentRequestAssignmentStrategy = {
                        type: 'List',
                        listID: 'some-list',
                        listStrategy: 'RoundRobin',
                    };
                    expect(await coordinator.ResolveAssigneeUserID(strategy, makeParams(), null)).toBe(USER_B);
                });

                it('should return null when list has no members and no contextUser is available', async () => {
                    mockRunViews.mockResolvedValueOnce([
                        makeViewResult([{ ID: 'some-list', EntityID: 'e-users', Entity: 'MJ: Users' }]),
                        makeViewResult([]),
                    ]);
                    const strategy: AgentRequestAssignmentStrategy = { type: 'List', listID: 'some-list' };
                    expect(
                        await coordinator.ResolveAssigneeUserID(
                            strategy,
                            makeParams({ contextUser: undefined }),
                            null
                        )
                    ).toBeNull();
                });
            });

            describe('SharedInbox strategy', () => {
                it('should always return null (unassigned)', () => {
                    const strategy: AgentRequestAssignmentStrategy = { type: 'SharedInbox', listID: 'inbox' };
                    expect(coordinator.ResolveStaticAssigneeUserID(strategy, makeParams(), null)).toBeNull();
                });
            });
        });
    });
});
