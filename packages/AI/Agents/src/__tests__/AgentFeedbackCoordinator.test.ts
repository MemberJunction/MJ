import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentFeedbackCoordinator } from '../AgentFeedbackCoordinator';
import {
    ParseAssignmentStrategy,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type MJAIAgentTypeEntityExtended,
} from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentCategoryEntity,
    MJAIAgentRequestEntity,
    MJAIAgentRequestTypeEntity,
} from '@memberjunction/core-entities';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

const mockRunViews = vi.fn<(views: RunViewParams[], contextUser?: UserInfo) => Promise<RunViewResult[]>>();
const mockGetEntityObject = vi.fn<(entityName: string, contextUser?: UserInfo) => Promise<MJAIAgentRequestEntity>>();

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

const mockAgentTypes: MJAIAgentTypeEntityExtended[] = [];
const mockAgentCategories: MJAIAgentCategoryEntity[] = [];
const mockAgentRequestTypes: MJAIAgentRequestTypeEntity[] = [];
const mockResolveAgentRequestTypeID = vi.fn<(name: 'Approval' | 'Information', contextUser?: UserInfo) => Promise<string | null>>();

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                get AgentTypes(): MJAIAgentTypeEntityExtended[] {
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
            const agentTypeStub: Partial<MJAIAgentTypeEntityExtended> = {
                ID: AGENT_TYPE_ID,
                AssignmentStrategy: JSON.stringify({ type: 'RunUser' }),
            };
            mockAgentTypes.push(agentTypeStub as MJAIAgentTypeEntityExtended);
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
            expect(firstBatchViews[1].ExtraFilter).toBe(
                `ListID = '${LIST_ID}' AND (Status IS NULL OR Status NOT IN ('Disabled', 'Error', 'Rejected'))`
            );
            const secondBatchViews = mockRunViews.mock.calls[1][0];
            expect(secondBatchViews[0].ExtraFilter).toBe(
                `ID IN ('${USER_1}', '${USER_2}', '${USER_3}', '${user4}', '${user5}') AND IsActive = 1`
            );
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
                ]);

            const picked = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'LeastBusy' },
                createParamsStub()
            );
            expect(picked).toBe(USER_3);
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
                    // USER_2 is inactive (excluded from query result), so active users are [USER_1, USER_3]
                    makeViewResult([
                        { ID: USER_1, IsActive: true },
                        { ID: USER_3, IsActive: true },
                    ]),
                ]);

            const picked = await deterministicCoordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'Random' },
                createParamsStub()
            );
            // Index 1 of [USER_1, USER_3] is USER_3
            expect(picked).toBe(USER_3);
        });

        it('should fall back to contextUser.ID or null (SharedInbox) when list has zero active users or is not an MJ: Users list', async () => {
            // Non-Users list
            mockRunViews.mockResolvedValueOnce([
                makeViewResult([{ ID: LIST_ID, EntityID: 'e-contacts', Entity: 'MJ: Contacts' }]),
                makeViewResult([{ ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' }]),
            ]);

            const fallbackCaller = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub()
            );
            expect(fallbackCaller).toBe(CALLER_ID);

            // Zero active users and no contextUser -> null (SharedInbox)
            mockRunViews
                .mockResolvedValueOnce([
                    makeViewResult([{ ID: LIST_ID, EntityID: 'e-users', Entity: 'MJ: Users' }]),
                    makeViewResult([{ ID: 'ld-1', RecordID: USER_1, Sequence: 1, Status: 'Pending' }]),
                ])
                .mockResolvedValueOnce([makeViewResult([])]);

            const fallbackSharedInbox = await coordinator.ResolveAssigneeUserID(
                { type: 'List', listID: LIST_ID, listStrategy: 'RoundRobin' },
                createParamsStub({ contextUser: undefined })
            );
            expect(fallbackSharedInbox).toBeNull();
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
                GetEntityObject: async <T>(entityName: string, contextUser?: UserInfo): Promise<T> =>
                    (await mockGetEntityObject(entityName, contextUser)) as T,
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
});
