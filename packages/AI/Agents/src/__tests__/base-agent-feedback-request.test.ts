/**
 * BaseAgent's feedback-request wrapper: `createFeedbackRequest` hands the run's params, step, decision, agent run and
 * provider to `AgentFeedbackCoordinator.CreateFeedbackRequest` and keeps the new request's ID in `_feedbackRequestId`
 * (returned as `ExecuteAgentResult.feedbackRequestId`).
 *
 * The coordinator and BaseAgent are real; RunView, the AI engine and the provider's entity factory are the boundaries.
 * The coordinator's own behaviour (strategy chain, List modes, who saves the row) is in AgentFeedbackCoordinator.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentCategoryEntity, MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

/** BaseAgent's private feedback-request members, reached the way the other BaseAgent suites reach private members. */
interface FeedbackRequestInternals {
    createFeedbackRequest(params: ExecuteAgentParams, step: MJAIAgentRunStepEntityExtended, decision: BaseAgentNextStep): Promise<void>;
    _feedbackRequestId: string | null;
    _agentRun: MJAIAgentRunEntityExtended | null;
}

class TestFeedbackBaseAgent extends BaseAgent {
    public async InvokeCreateFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        decision: BaseAgentNextStep,
        agentRun?: MJAIAgentRunEntityExtended
    ): Promise<string | null> {
        const internals = this as unknown as FeedbackRequestInternals;
        internals._agentRun = agentRun ?? null;
        await internals.createFeedbackRequest(params, stepEntity, decision);
        return internals._feedbackRequestId;
    }
}

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
const mockResolveAgentRequestTypeID = vi.fn<(name: 'Approval' | 'Information', contextUser?: UserInfo) => Promise<string | null>>();

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                get AgentTypes(): MJAIAgentTypeEntity[] {
                    return mockAgentTypes;
                },
                get AgentCategories(): MJAIAgentCategoryEntity[] {
                    return [];
                },
                get AgentRequestTypes(): MJAIAgentRequestTypeEntity[] {
                    return [];
                },
                ResolveAgentRequestTypeID: (name: 'Approval' | 'Information', contextUser?: UserInfo) =>
                    mockResolveAgentRequestTypeID(name, contextUser),
            };
        },
    },
}));

const USER_1 = '11111111-1111-4111-8111-000000000001';
const USER_2 = '22222222-2222-4222-8222-000000000002';
const CALLER_ID = '55555555-5555-4555-8555-000000000005';
const LIST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const AGENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const AGENT_TYPE_ID = 'eeeeeeee-eeee-4eee-8eee-000000000099';

function makeViewResult<T>(results: T[]): RunViewResult<T> {
    return {
        Success: true,
        Results: results,
        RowCount: results.length,
        TotalRowCount: results.length,
        ExecutionTime: 1,
        ErrorMessage: '',
        UserViewRunID: '',
    };
}

describe('BaseAgent.createFeedbackRequest', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockAgentTypes.length = 0;
    });

    it('should drive BaseAgent.createFeedbackRequest end to end with a List (RoundRobin) strategy through the real BaseAgent wrapper', async () => {
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
                makeViewResult([
                    {
                        ID: 'req-prev',
                        AgentID: AGENT_ID,
                        RequestForUserID: USER_1,
                        RequestedAt: '2026-11-05T10:00:00Z',
                    },
                ]),
            ]);

        const savedRecord: Partial<MJAIAgentRequestEntity> & {
            Save: () => Promise<boolean>;
            NewRecord: () => boolean;
        } = {
            ID: 'eeeeeeee-eeee-4eee-8eee-000000000002',
            NewRecord: () => true,
            Save: vi.fn(async () => true),
        };
        mockGetEntityObject.mockResolvedValueOnce(savedRecord as MJAIAgentRequestEntity);
        mockResolveAgentRequestTypeID.mockResolvedValueOnce('dddddddd-dddd-4ddd-8ddd-000000000001');

        const providerStub: Partial<IMetadataProvider> = {
            GetEntityObject: providerGetEntityObject,
        };

        const agent: Partial<MJAIAgentEntityExtended> = { ID: AGENT_ID, Name: 'WrapperTestAgent', TypeID: AGENT_TYPE_ID, CategoryID: null };
        const caller: Partial<UserInfo> = { ID: CALLER_ID, Name: 'Caller User' };
        const params: ExecuteAgentParams = {
            agent: agent as MJAIAgentEntityExtended,
            conversationMessages: [],
            contextUser: caller as UserInfo,
            provider: providerStub as IMetadataProvider,
            assignmentStrategy: {
                type: 'List',
                listID: LIST_ID,
                listStrategy: 'RoundRobin',
                priority: 75,
            },
        };
        const agentRun: Partial<MJAIAgentRunEntityExtended> = {
            ID: 'ffffffff-ffff-4fff-8fff-000000000002',
        };
        const step: Partial<MJAIAgentRunStepEntityExtended> = {
            ID: '99999999-9999-4999-8999-000000000002',
        };
        const decision: BaseAgentNextStep = {
            step: 'Chat',
            terminate: true,
            message: 'Please review the findings.',
        };

        const feedbackRequestId = await new TestFeedbackBaseAgent().InvokeCreateFeedbackRequest(
            params,
            step as MJAIAgentRunStepEntityExtended,
            decision,
            agentRun as MJAIAgentRunEntityExtended
        );

        expect(feedbackRequestId).toBe('eeeeeeee-eeee-4eee-8eee-000000000002');
        expect(savedRecord.RequestForUserID).toBe(USER_2);
        expect(savedRecord.Priority).toBe(75);
        expect(savedRecord.OriginatingAgentRunID).toBe('ffffffff-ffff-4fff-8fff-000000000002');
        expect(savedRecord.OriginatingAgentRunStepID).toBe('99999999-9999-4999-8999-000000000002');
        expect(savedRecord.Save).toHaveBeenCalledOnce();
    });
});
