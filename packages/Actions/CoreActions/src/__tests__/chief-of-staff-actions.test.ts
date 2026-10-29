import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';

const {
    agentsList,
    canUserRunAgentMock,
    runViewMock,
    getEntityObjectMock,
    getPolicyMock,
    setCachedPolicyMock,
    buildSummaryMock,
} = vi.hoisted(() => ({
    agentsList: [] as Array<{ ID: string; Name: string }>,
    canUserRunAgentMock: vi.fn(),
    runViewMock: vi.fn(),
    getEntityObjectMock: vi.fn(),
    getPolicyMock: vi.fn(),
    setCachedPolicyMock: vi.fn(),
    buildSummaryMock: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: object) => target,
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) =>
        (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase(),
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name = '';
        Type = '';
        Value: unknown = null;
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    Metadata: class {
        GetEntityObject = (...args: unknown[]) => getEntityObjectMock(...args);
    },
    RunView: class {
        RunView = (...args: unknown[]) => runViewMock(...args);
    },
}));

const resolveRequestTypeMock = vi.fn(async (name: string) => (name === 'Approval' ? 'approval-type-id' : null));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Agents() {
                return agentsList;
            },
            CanUserRunAgent: (...args: unknown[]) => canUserRunAgentMock(...args),
            ResolveAgentRequestTypeID: (name: string, user: unknown) => resolveRequestTypeMock(name, user),
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AgentUserPolicyEngine: {
        Instance: {
            GetPolicyForAgentAndUser: (...args: unknown[]) => getPolicyMock(...args),
            SetCachedPolicy: (...args: unknown[]) => setCachedPolicyMock(...args),
            BuildPromptPolicyContextBlock: (...args: unknown[]) => buildSummaryMock(...args),
        },
    },
}));

import { ScheduleNextAgentWakeAction } from '../custom/ai/schedule-next-agent-wake.action';
import { ConfigureAgentUserPolicyAction } from '../custom/ai/configure-agent-user-policy.action';
import { SendInterAgentRequestAction } from '../custom/ai/send-inter-agent-request.action';
import {
    PrepareOutboundCallBriefAction,
    OutboundCallBrief,
} from '../custom/ai/prepare-outbound-call-brief.action';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

interface TestableAction {
    InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>;
}

function invokeAction(action: object, params: RunActionParams): Promise<ActionResultSimple> {
    return (action as TestableAction).InternalRunAction(params);
}

function makeUser(id = 'user-111', name = 'Alice Executive'): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Name = name;
    user.Email = 'alice@example.com';
    user.IsActive = true;
    return user;
}

describe('Chief of Staff Actions Suite', () => {
    beforeEach(() => {
        agentsList.length = 0;
        agentsList.push({ ID: 'cos-agent-id', Name: 'Chief of Staff' });
        canUserRunAgentMock.mockReset().mockReturnValue(true);
        runViewMock.mockReset().mockResolvedValue({ Success: true, Results: [] });
        getEntityObjectMock.mockReset();
        getPolicyMock.mockReset().mockResolvedValue(null);
        setCachedPolicyMock.mockReset();
        buildSummaryMock.mockReset().mockReturnValue('## User Policy Summary');
    });

    describe('ScheduleNextAgentWakeAction', () => {
        it('creates an Adaptive AgentWake routine row scoped to ContextUser.ID with wakeConfig', async () => {
            const routineStub = {
                ID: 'routine-999',
                UserID: '',
                Name: '',
                Description: null as string | null,
                Status: 'Active' as MJUserRoutineEntity['Status'],
                RoutineType: 'Standard' as MJUserRoutineEntity['RoutineType'],
                ScheduleMode: 'Recurring' as MJUserRoutineEntity['ScheduleMode'],
                TargetType: 'Agent' as MJUserRoutineEntity['TargetType'],
                TargetID: '',
                Timezone: 'UTC',
                CronExpression: null as string | null,
                InitialMessage: null as string | null,
                StartingPayload: null as string | null,
                WakeConfigurationObject: null as MJUserRoutineEntity['WakeConfigurationObject'],
                NextRunAt: null as Date | null,
                ConversationID: null as string | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            getEntityObjectMock.mockResolvedValue(routineStub);

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-abc'),
                Filters: [],
                Params: [
                    { Name: 'AgentName', Type: 'Input', Value: 'Chief of Staff' },
                    { Name: 'WorkstreamKey', Type: 'Input', Value: 'q4-okr-rollup' },
                    { Name: 'ScheduleMode', Type: 'Input', Value: 'Adaptive' },
                    { Name: 'WakeInMinutes', Type: 'Input', Value: 30 },
                    { Name: 'WakeReason', Type: 'Input', Value: 'Check Q4 key result check-ins' },
                    {
                        Name: 'WatchedEntities',
                        Type: 'Input',
                        Value: [{ entityName: 'MJ_BizApps_Tasks: Tasks', alias: 'tasks' }],
                    },
                    {
                        Name: 'WakeGate',
                        Type: 'Input',
                        Value: { skipIfUnchanged: true, tier1Expression: 'totalChangedCount > 0' },
                    },
                ],
            };

            const res = await invokeAction(new ScheduleNextAgentWakeAction(), params);
            expect(res.Success).toBe(true);
            expect(routineStub.UserID).toBe('user-abc');
            expect(routineStub.RoutineType).toBe('AgentWake');
            expect(routineStub.ScheduleMode).toBe('Adaptive');
            expect(routineStub.WakeConfigurationObject?.workstreamKey).toBe('q4-okr-rollup');
            expect(routineStub.WakeConfigurationObject?.watchedEntities?.[0].entityName).toBe(
                'MJ_BizApps_Tasks: Tasks'
            );
            expect(params.Params.find((p: ActionParam) => p.Name === 'RoutineID')?.Value).toBe('routine-999');
        });

        it('rejects OneShot routines without WakeAtISO or WakeInMinutes', async () => {
            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser(),
                Filters: [],
                Params: [
                    { Name: 'AgentName', Type: 'Input', Value: 'Chief of Staff' },
                    { Name: 'ScheduleMode', Type: 'Input', Value: 'OneShot' },
                ],
            };

            const res = await invokeAction(new ScheduleNextAgentWakeAction(), params);
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('VALIDATION_ERROR');
        });

        it('rejects when CanUserRunAgent is false', async () => {
            canUserRunAgentMock.mockReturnValue(false);
            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser(),
                Filters: [],
                Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Chief of Staff' }],
            };

            const res = await invokeAction(new ScheduleNextAgentWakeAction(), params);
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('PERMISSION_DENIED');
        });

        it('prefers AgentName/default Chief of Staff when a hallucinated AgentID is passed and accepts ScheduleMode=Scheduled alias', async () => {
            const routineStub = {
                ID: 'routine-888',
                UserID: '',
                Name: '',
                Description: null as string | null,
                Status: 'Active' as MJUserRoutineEntity['Status'],
                RoutineType: 'Standard' as MJUserRoutineEntity['RoutineType'],
                ScheduleMode: 'OneShot' as MJUserRoutineEntity['ScheduleMode'],
                TargetType: 'Agent' as MJUserRoutineEntity['TargetType'],
                TargetID: '',
                Timezone: 'UTC',
                CronExpression: null as string | null,
                InitialMessage: null as string | null,
                StartingPayload: null as string | null,
                WakeConfigurationObject: null as MJUserRoutineEntity['WakeConfigurationObject'],
                NextRunAt: null as Date | null,
                ConversationID: null as string | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            getEntityObjectMock.mockResolvedValue(routineStub);

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-abc'),
                Filters: [],
                Params: [
                    { Name: 'AgentID', Type: 'Input', Value: 'hallucinated-uuid-not-in-db' },
                    { Name: 'ScheduleMode', Type: 'Input', Value: 'Scheduled' },
                    { Name: 'CronExpression', Type: 'Input', Value: '0 8 * * 1-5' },
                    { Name: 'WakeReason', Type: 'Input', Value: 'Morning weekday check-in' },
                ],
            };

            const res = await invokeAction(new ScheduleNextAgentWakeAction(), params);
            expect(res.Success).toBe(true);
            expect(routineStub.TargetID).toBe('cos-agent-id');
            expect(routineStub.ScheduleMode).toBe('Recurring');
            expect(routineStub.CronExpression).toBe('0 8 * * 1-5');
        });
    });

    describe('ConfigureAgentUserPolicyAction', () => {
        it('upserts the caller policy, stamps OnboardedAt, and refreshes AgentUserPolicyEngine cache', async () => {
            const policyStub = {
                ID: 'policy-123',
                AgentID: '',
                UserID: '',
                DisplayNameOverride: null as string | null,
                Status: 'Active' as MJAIAgentUserPolicyEntity['Status'],
                OnboardingStatus: 'NotStarted' as MJAIAgentUserPolicyEntity['OnboardingStatus'],
                OnboardedAt: null as Date | null,
                CoordinationMode: 'Observer' as MJAIAgentUserPolicyEntity['CoordinationMode'],
                AllowInterAgentCoordination: true,
                EmailChannelMode: 'DraftOnly' as MJAIAgentUserPolicyEntity['EmailChannelMode'],
                PhoneChannelMode: 'OutboundWithApproval' as MJAIAgentUserPolicyEntity['PhoneChannelMode'],
                MessagingChannelMode: 'Enabled' as MJAIAgentUserPolicyEntity['MessagingChannelMode'],
                DefaultDataAccessMode: 'UserCeiling' as MJAIAgentUserPolicyEntity['DefaultDataAccessMode'],
                RequireApprovalForExternalComms: true,
                RequireApprovalForFinancials: true,
                RequireApprovalForDestructiveActions: true,
                AutoApproveAmountThreshold: null as number | null,
                EntityAccessRulesObject: null as MJAIAgentUserPolicyEntity['EntityAccessRulesObject'],
                ActionPolicyRulesObject: null as MJAIAgentUserPolicyEntity['ActionPolicyRulesObject'],
                InstructionsOverride: null as string | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            getEntityObjectMock.mockResolvedValue(policyStub);

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-777'),
                Filters: [],
                Params: [
                    { Name: 'AgentID', Type: 'Input', Value: 'hallucinated-uuid-not-in-db' },
                    { Name: 'DisplayNameOverride', Type: 'Input', Value: 'Athena' },
                    { Name: 'OnboardingStatus', Type: 'Input', Value: 'Completed' },
                    { Name: 'CoordinationMode', Type: 'Input', Value: 'Coordinator' },
                    { Name: 'EmailChannelMode', Type: 'Input', Value: 'SendAsAgent' },
                    { Name: 'AutoApproveAmountThreshold', Type: 'Input', Value: 250 },
                ],
            };

            const res = await invokeAction(new ConfigureAgentUserPolicyAction(), params);
            expect(res.Success).toBe(true);
            expect(policyStub.AgentID).toBe('cos-agent-id');
            expect(policyStub.UserID).toBe('user-777');
            expect(policyStub.DisplayNameOverride).toBe('Athena');
            expect(policyStub.OnboardingStatus).toBe('Completed');
            expect(policyStub.OnboardedAt).toBeInstanceOf(Date);
            expect(policyStub.CoordinationMode).toBe('Coordinator');
            expect(policyStub.EmailChannelMode).toBe('SendAsAgent');
            expect(setCachedPolicyMock).toHaveBeenCalledWith(policyStub);
        });
    });

    describe('SendInterAgentRequestAction', () => {
        it('refuses when sender policy has CoordinationMode=Observer', async () => {
            getPolicyMock.mockResolvedValueOnce({
                Status: 'Active',
                AllowInterAgentCoordination: true,
                CoordinationMode: 'Observer',
            });

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-sender'),
                Filters: [],
                Params: [
                    { Name: 'TargetUserID', Type: 'Input', Value: 'user-target' },
                    { Name: 'Subject', Type: 'Input', Value: 'Q4 OKR Check-in' },
                    { Name: 'Message', Type: 'Input', Value: 'Please share current metric for KR-2.' },
                ],
            };

            const res = await invokeAction(new SendInterAgentRequestAction(), params);
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('POLICY_APPROVAL_REQUIRED');
        });

        it('creates an MJAIAgentRequestEntity with InterAgent delivery mode when target user has an active CoS policy', async () => {
            // 1st call: sender policy; 2nd call: target policy
            getPolicyMock
                .mockResolvedValueOnce({
                    Status: 'Active',
                    AllowInterAgentCoordination: true,
                    CoordinationMode: 'Coordinator',
                })
                .mockResolvedValueOnce({
                    Status: 'Active',
                    AllowInterAgentCoordination: true,
                    CoordinationMode: 'Coordinator',
                });

            const requestStub = {
                ID: 'req-555',
                AgentID: '',
                RequestTypeID: null as string | null,
                RequestedAt: null as Date | null,
                RequestForUserID: null as string | null,
                Status: 'Requested' as MJAIAgentRequestEntity['Status'],
                Priority: 50,
                Request: '',
                Comments: null as string | null,
                ExpiresAt: null as Date | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            getEntityObjectMock.mockResolvedValue(requestStub);

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-sender', 'Alice Executive'),
                Filters: [],
                Params: [
                    { Name: 'TargetUserID', Type: 'Input', Value: 'user-target' },
                    { Name: 'Subject', Type: 'Input', Value: 'Q4 OKR Check-in' },
                    { Name: 'Message', Type: 'Input', Value: 'Please share current metric for KR-2.' },
                    { Name: 'TaskID', Type: 'Input', Value: 'task-kr-2' },
                ],
            };

            const res = await invokeAction(new SendInterAgentRequestAction(), params);
            expect(res.Success).toBe(true);
            expect(requestStub.RequestForUserID).toBe('user-target');
            // The Approval request type is resolved by name through the AI engine cache, never hardcoded.
            expect(requestStub.RequestTypeID).toBe('approval-type-id');
            expect(resolveRequestTypeMock).toHaveBeenCalledWith('Approval', params.ContextUser);
            expect(params.Params.find((p: ActionParam) => p.Name === 'DeliveryMode')?.Value).toBe('InterAgent');
            expect(params.Params.find((p: ActionParam) => p.Name === 'AgentRequestID')?.Value).toBe('req-555');
        });

        it('fails with REQUEST_TYPE_NOT_FOUND instead of saving when the Approval request type is not in metadata', async () => {
            getPolicyMock
                .mockResolvedValueOnce({ Status: 'Active', AllowInterAgentCoordination: true, CoordinationMode: 'Coordinator' })
                .mockResolvedValueOnce({ Status: 'Active', AllowInterAgentCoordination: true, CoordinationMode: 'Coordinator' });
            resolveRequestTypeMock.mockResolvedValueOnce(null);
            const save = vi.fn().mockResolvedValue(true);
            getEntityObjectMock.mockResolvedValue({ ID: 'req-556', Save: save });

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-sender', 'Alice Executive'),
                Filters: [],
                Params: [
                    { Name: 'TargetUserID', Type: 'Input', Value: 'user-target' },
                    { Name: 'Subject', Type: 'Input', Value: 'Q4 OKR Check-in' },
                    { Name: 'Message', Type: 'Input', Value: 'Please share current metric for KR-2.' },
                ],
            };

            const res = await invokeAction(new SendInterAgentRequestAction(), params);
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('REQUEST_TYPE_NOT_FOUND');
            expect(save).not.toHaveBeenCalled();
        });
    });

    describe('PrepareOutboundCallBriefAction', () => {
        it('blocks outbound calls when PhoneChannelMode is InboundOnly', async () => {
            getPolicyMock.mockResolvedValueOnce({
                Status: 'Active',
                PhoneChannelMode: 'InboundOnly',
            });

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser(),
                Filters: [],
                Params: [
                    { Name: 'TargetPhoneNumber', Type: 'Input', Value: '+15551234567' },
                    { Name: 'TargetRecipientName', Type: 'Input', Value: 'Bistro Luma' },
                    { Name: 'Objective', Type: 'Input', Value: 'Book dinner for 4 at 7:00 PM on Friday' },
                ],
            };

            const res = await invokeAction(new PrepareOutboundCallBriefAction(), params);
            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('POLICY_DENIED');
        });

        it('queues an approval request and stamps mandatory upfront AI disclosure when PhoneChannelMode is OutboundWithApproval', async () => {
            getPolicyMock.mockResolvedValueOnce({
                Status: 'Active',
                DisplayNameOverride: 'Jarvis',
                PhoneChannelMode: 'OutboundWithApproval',
                RequireApprovalForExternalComms: true,
            });
            const reqStub = {
                ID: 'call-req-1',
                AgentID: '',
                RequestTypeID: null as string | null,
                RequestedAt: null as Date | null,
                RequestForUserID: null as string | null,
                Status: 'Requested' as MJAIAgentRequestEntity['Status'],
                Priority: 75,
                Request: '',
                Comments: null as string | null,
                Save: vi.fn().mockResolvedValue(true),
            };
            getEntityObjectMock.mockResolvedValue(reqStub);

            const params: RunActionParams = {
                Action: {} as RunActionParams['Action'],
                ContextUser: makeUser('user-1', 'Alice Executive'),
                Filters: [],
                Params: [
                    { Name: 'TargetPhoneNumber', Type: 'Input', Value: '+15551234567' },
                    { Name: 'TargetRecipientName', Type: 'Input', Value: 'Bistro Luma' },
                    { Name: 'Objective', Type: 'Input', Value: 'Book dinner for 4 at 7:00 PM on Friday' },
                    { Name: 'AuthorizedBounds', Type: 'Input', Value: ['Accept 6:30 PM to 7:30 PM window'] },
                ],
            };

            const res = await invokeAction(new PrepareOutboundCallBriefAction(), params);
            expect(res.Success).toBe(true);
            expect(res.ResultCode).toBe('APPROVAL_REQUIRED');
            const brief = params.Params.find((p: ActionParam) => p.Name === 'CallBrief')
                ?.Value as OutboundCallBrief;
            expect(brief.requireUpfrontAiDisclosure).toBe(true);
            expect(brief.mandatoryUpfrontDisclosure).toContain(
                'I am Jarvis, an AI assistant calling on behalf of Alice Executive'
            );
            expect(params.Params.find((p: ActionParam) => p.Name === 'Status')?.Value).toBe('PENDING_APPROVAL');
            expect(params.Params.find((p: ActionParam) => p.Name === 'AgentRequestID')?.Value).toBe('call-req-1');
            expect(reqStub.RequestTypeID).toBe('approval-type-id');
        });
    });
});
