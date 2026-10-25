import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJAIBridgeAgentIdentityEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AgentWakeTriggerService } from '../AgentWakeTriggerService';

const runViewMock = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

interface MockRoutineEntity {
    ID: string;
    UserID: string;
    Name: string;
    Description: string | null;
    Status: MJUserRoutineEntity['Status'];
    RoutineType: MJUserRoutineEntity['RoutineType'];
    ScheduleMode: MJUserRoutineEntity['ScheduleMode'];
    TargetType: MJUserRoutineEntity['TargetType'];
    TargetID: string;
    CronExpression: string | null;
    Timezone: string | null;
    InitialMessage: string | null;
    StartingPayload: string | null;
    NextRunAt: Date | null;
    WakeConfiguration: string | null;
    WakeConfigurationObject: MJUserRoutineEntity_IRoutineWakeConfiguration | null;
    LatestResult: { CompleteMessage: string };
    NewRecord: () => void;
    Save: () => Promise<boolean>;
}

const COS_AGENT_ID = '00000000-0000-0000-0000-00000000C051';
const USER_ALICE_ID = '00000000-0000-0000-0000-00000000A11C';
const USER_BOB_ID = '00000000-0000-0000-0000-00000000B0B2';
const FIXED_NOW = new Date('2026-10-25T14:30:00.000Z');

function createUser(id: string, name: string, email: string): UserInfo {
    return {
        ID: id,
        Name: name,
        Email: email,
        IsActive: true,
        UserRoles: [],
    } as unknown as UserInfo;
}

function createPolicy(overrides: Partial<MJAIAgentUserPolicyEntity>): MJAIAgentUserPolicyEntity {
    return {
        ID: 'policy-1',
        AgentID: COS_AGENT_ID,
        UserID: USER_ALICE_ID,
        Status: 'Active',
        DefaultDataAccessMode: 'Allow',
        AllowInterAgentCoordination: true,
        EmailChannelMode: 'DraftWithApproval',
        CalendarChannelMode: 'ProposeWithApproval',
        PhoneChannelMode: 'OutboundWithApproval',
        ...overrides,
    } as unknown as MJAIAgentUserPolicyEntity;
}

function createMockMetadataProvider(): {
    provider: IMetadataProvider;
    savedRoutines: MockRoutineEntity[];
    capturedContextUsers: UserInfo[];
} {
    const savedRoutines: MockRoutineEntity[] = [];
    const capturedContextUsers: UserInfo[] = [];
    let seq = 0;

    const provider = {
        GetEntityObject: vi.fn(async (_entityName: string, contextUser: UserInfo) => {
            capturedContextUsers.push(contextUser);
            const routine: MockRoutineEntity = {
                ID: `routine-${++seq}`,
                UserID: '',
                Name: '',
                Description: null,
                Status: 'Active',
                RoutineType: 'AgentWake',
                ScheduleMode: 'OneShot',
                TargetType: 'Agent',
                TargetID: '',
                CronExpression: null,
                Timezone: 'UTC',
                InitialMessage: null,
                StartingPayload: null,
                NextRunAt: null,
                WakeConfiguration: null,
                WakeConfigurationObject: null,
                LatestResult: { CompleteMessage: '' },
                NewRecord: vi.fn(),
                Save: vi.fn(async () => {
                    savedRoutines.push(routine);
                    return true;
                }),
            };
            return routine;
        }),
    } as unknown as IMetadataProvider;

    return { provider, savedRoutines, capturedContextUsers };
}

describe('AgentWakeTriggerService (Stage 5 Deliverable 2 — Event-Driven Wake Triggers)', () => {
    const aliceUser = createUser(USER_ALICE_ID, 'Alice Executive', 'alice@company.com');
    const bobUser = createUser(USER_BOB_ID, 'Bob Peer', 'bob@company.com');
    const serviceUser = createUser('00000000-0000-0000-0000-000000005E7C', 'System Bridge', 'system@company.com');

    beforeEach(() => {
        runViewMock.mockReset();
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    describe('1. Approval & Inter-Agent Resolution / Arrival Wake', () => {
        it('wakes the request owner Chief of Staff when an action-created approval request transitions to Approved', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({ AgentID: COS_AGENT_ID, UserID: USER_ALICE_ID, Status: 'Active' })
            );
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });

            const approvalRequest = {
                ID: 'req-calendar-approval-1',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_ALICE_ID,
                OriginatingAgentRunID: null,
                OriginatingTaskID: null,
                ResumingAgentRunID: null,
                Status: 'Approved',
                Request: '[Calendar Approval Required] Create board sync meeting',
                Response: 'Approved, go ahead and send the invite.',
                ResponseData: JSON.stringify({ confirmedSlot: '2026-10-26T15:00:00Z' }),
                ResponseByUserID: USER_ALICE_ID,
                RespondedAt: FIXED_NOW,
                Comments: JSON.stringify({ operation: 'CreateDraftEvent', subject: 'Board Sync' }),
            } as unknown as MJAIAgentRequestEntity;

            const result = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvalRequest,
                aliceUser,
                provider,
                FIXED_NOW
            );

            expect(result.triggered).toBe(true);
            expect(result.resultCode).toBe('WAKE_SCHEDULED');
            expect(result.targetUserID).toBe(USER_ALICE_ID);
            expect(result.targetAgentID).toBe(COS_AGENT_ID);
            expect(result.workstreamKey).toBe('approval-resolution');
            expect(savedRoutines).toHaveLength(1);

            const savedRoutine = savedRoutines[0];
            expect(savedRoutine.UserID).toBe(USER_ALICE_ID);
            expect(savedRoutine.TargetID).toBe(COS_AGENT_ID);
            expect(savedRoutine.NextRunAt?.toISOString()).toBe(FIXED_NOW.toISOString());
            expect(savedRoutine.WakeConfigurationObject?.resumeState).toMatchObject({
                triggerType: 'AgentRequestResolution',
                requestID: 'req-calendar-approval-1',
                status: 'Approved',
                response: 'Approved, go ahead and send the invite.',
                workstreamKey: 'approval-resolution',
            });
        });

        it('wakes the target user Chief of Staff on incoming InterAgentCoS request and wakes sender Chief of Staff on resolution', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({
                    AgentID: COS_AGENT_ID,
                    UserID: USER_ALICE_ID,
                    Status: 'Active',
                    AllowInterAgentCoordination: true,
                })
            );
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({
                    AgentID: COS_AGENT_ID,
                    UserID: USER_BOB_ID,
                    Status: 'Active',
                    AllowInterAgentCoordination: true,
                })
            );
            runViewMock.mockResolvedValue({ Success: true, Results: [] });

            const interAgentEnvelope = {
                interAgentCoordination: true,
                envelopeVersion: '1.0',
                senderUserID: USER_ALICE_ID,
                senderUserName: 'Alice Executive',
                senderAgentID: COS_AGENT_ID,
                targetUserID: USER_BOB_ID,
                targetUserName: 'Bob Peer',
                deliveryMode: 'InterAgentCoS',
                subject: 'Confirm Q4 Launch Dependencies',
                messageBody: 'Can Bob confirm engineering readiness by Friday?',
                workstreamKey: 'q4-launch-sync',
            };

            // Step A: Newly created InterAgentCoS request wakes Bob's Chief of Staff
            const incomingReq = {
                ID: 'req-inter-agent-1',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_BOB_ID,
                OriginatingAgentRunID: null,
                OriginatingTaskID: null,
                Status: 'Requested',
                Request: '[Inter-Agent Coordination Request from Alice Executive]',
                Comments: JSON.stringify(interAgentEnvelope),
            } as unknown as MJAIAgentRequestEntity;

            const arrivalResult = await AgentWakeTriggerService.Instance.TriggerWakeOnIncomingInterAgentRequest(
                incomingReq,
                aliceUser,
                provider,
                FIXED_NOW
            );

            expect(arrivalResult.triggered).toBe(true);
            expect(arrivalResult.targetUserID).toBe(USER_BOB_ID);
            expect(arrivalResult.workstreamKey).toBe('q4-launch-sync');
            expect(savedRoutines[0].WakeConfigurationObject?.resumeState).toMatchObject({
                triggerType: 'InterAgentRequestReceived',
                requestID: 'req-inter-agent-1',
                senderUserID: USER_ALICE_ID,
                subject: 'Confirm Q4 Launch Dependencies',
            });

            // Step B: Resolved InterAgentCoS request wakes Alice's (sender's) Chief of Staff
            const resolvedReq = {
                ...incomingReq,
                Status: 'Responded',
                Response: 'Confirmed — engineering is ready for Friday.',
                ResponseByUserID: USER_BOB_ID,
                RespondedAt: FIXED_NOW,
            } as unknown as MJAIAgentRequestEntity;

            const resolutionResult = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                resolvedReq,
                bobUser,
                provider,
                FIXED_NOW
            );

            expect(resolutionResult.triggered).toBe(true);
            expect(resolutionResult.targetUserID).toBe(USER_ALICE_ID);
            expect(resolutionResult.workstreamKey).toBe('q4-launch-sync');
            expect(savedRoutines[1].UserID).toBe(USER_ALICE_ID);
            expect(savedRoutines[1].WakeConfigurationObject?.resumeState).toMatchObject({
                triggerType: 'InterAgentRequestResolved',
                requestID: 'req-inter-agent-1',
                status: 'Responded',
                response: 'Confirmed — engineering is ready for Friday.',
                targetUserID: USER_BOB_ID,
            });
        });
    });

    describe('2. Inbound Utility Mailbox Wake (MJ: AI Bridge Agent Identities)', () => {
        const utilityIdentity = {
            ID: 'identity-cos-email',
            AgentID: COS_AGENT_ID,
            ProviderID: 'provider-msgraph',
            IdentityType: 'Email',
            IdentityValue: 'cos@company.com',
            DisplayName: 'Chief of Staff Mailbox',
            IsActive: true,
            Configuration: null,
        } as unknown as MJAIBridgeAgentIdentityEntity;

        it('wakes the verified internal sender Chief of Staff in sender contextUser scope when emailing cos@company.com', async () => {
            const { provider, savedRoutines, capturedContextUsers } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({ AgentID: COS_AGENT_ID, UserID: USER_ALICE_ID, Status: 'Active' })
            );
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });

            const result = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'CoS@Company.com',
                fromAddress: 'ALICE@company.com',
                subject: 'Prep briefing notes for tomorrow board call',
                bodyPreview: 'Please pull the latest Q4 metrics and draft a 3-bullet summary.',
                messageID: 'msg-991',
                receivedAtISO: FIXED_NOW.toISOString(),
                systemContextUser: serviceUser,
                metadataProvider: provider,
                identities: [utilityIdentity],
                users: [aliceUser, bobUser],
                now: FIXED_NOW,
            });

            expect(result.triggered).toBe(true);
            expect(result.resultCode).toBe('WAKE_SCHEDULED');
            expect(result.targetUserID).toBe(USER_ALICE_ID);
            expect(result.targetAgentID).toBe(COS_AGENT_ID);
            expect(result.workstreamKey).toBe('inbound-utility-mailbox');

            // Verify the routine entity was instantiated and saved under aliceUser's contextUser scope, NOT serviceUser!
            expect(capturedContextUsers).toHaveLength(1);
            expect(capturedContextUsers[0].ID).toBe(USER_ALICE_ID);
            expect(savedRoutines[0].UserID).toBe(USER_ALICE_ID);
            expect(savedRoutines[0].WakeConfigurationObject?.resumeState).toMatchObject({
                triggerType: 'InboundUtilityMailboxEmail',
                utilityMailboxAddress: 'cos@company.com',
                senderUserID: USER_ALICE_ID,
                senderEmail: 'alice@company.com',
                subject: 'Prep briefing notes for tomorrow board call',
            });
        });

        it('rejects inbound utility mailbox emails from unverified external senders', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();

            const result = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'cos@company.com',
                fromAddress: 'attacker@external-domain.org',
                subject: 'Urgent wire transfer',
                bodyPreview: 'Please approve this invoice immediately.',
                systemContextUser: serviceUser,
                metadataProvider: provider,
                identities: [utilityIdentity],
                users: [aliceUser, bobUser],
                now: FIXED_NOW,
            });

            expect(result.triggered).toBe(false);
            expect(result.resultCode).toBe('UNVERIFIED_EXTERNAL_SENDER');
            expect(savedRoutines).toHaveLength(0);
        });

        it('rejects inbound utility mailbox emails when sender policy has EmailChannelMode="Disabled"', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({
                    AgentID: COS_AGENT_ID,
                    UserID: USER_ALICE_ID,
                    Status: 'Active',
                    EmailChannelMode: 'Disabled',
                })
            );

            const result = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'cos@company.com',
                fromAddress: 'alice@company.com',
                subject: 'Draft follow-up',
                systemContextUser: serviceUser,
                metadataProvider: provider,
                identities: [utilityIdentity],
                users: [aliceUser],
                now: FIXED_NOW,
            });

            expect(result.triggered).toBe(false);
            expect(result.resultCode).toBe('POLICY_DENIED');
            expect(savedRoutines).toHaveLength(0);
        });
    });
});
