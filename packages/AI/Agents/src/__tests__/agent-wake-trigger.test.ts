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
const SYSTEM_USER_ID = '00000000-0000-0000-0000-0000000005E5';
const systemUser = { ID: SYSTEM_USER_ID, Name: 'System', Email: 'system@mj.local', Type: 'Owner', IsActive: true, UserRoles: [] } as unknown as UserInfo;
const findUserMock = vi.fn();
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Instance: { GetSystemUser: () => systemUser, FindUser: (criteria: { ID?: string; Email?: string }) => findUserMock(criteria) } },
}));
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
        findUserMock.mockReset();
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

        it('names a new wake routine after the agent, like the routines Schedule Next Agent Wake creates', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({ AgentID: COS_AGENT_ID, UserID: USER_ALICE_ID, Status: 'Active', Agent: 'Chief of Staff' })
            );
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });

            const approvalRequest = {
                ID: 'req-name-1', AgentID: COS_AGENT_ID, RequestForUserID: USER_ALICE_ID,
                Status: 'Approved', Request: 'Send the update', Response: null, ResponseData: null,
                ResponseByUserID: USER_ALICE_ID, RespondedAt: FIXED_NOW, Comments: null,
            } as unknown as MJAIAgentRequestEntity;

            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(approvalRequest, aliceUser, provider, FIXED_NOW);

            expect(savedRoutines[0].Name).toBe('Chief of Staff — Wake (approval-resolution)');
        });

        it('falls back to "AgentWake (<key>)" when no policy names the agent', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            runViewMock.mockResolvedValue({ Success: true, Results: [] });

            const approvalRequest = {
                ID: 'req-name-2', AgentID: COS_AGENT_ID, RequestForUserID: USER_ALICE_ID,
                Status: 'Approved', Request: 'Send the update', Response: null, ResponseData: null,
                ResponseByUserID: USER_ALICE_ID, RespondedAt: FIXED_NOW, Comments: null,
            } as unknown as MJAIAgentRequestEntity;

            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(approvalRequest, aliceUser, provider, FIXED_NOW);

            expect(savedRoutines[0].Name).toBe('AgentWake (approval-resolution)');
        });

        it('wakes the target user Chief of Staff on incoming InterAgent request and wakes sender Chief of Staff on resolution', async () => {
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
                protocolVersion: '1.0',
                senderUserID: USER_ALICE_ID,
                senderUserName: 'Alice Executive',
                senderAgentID: COS_AGENT_ID,
                targetUserID: USER_BOB_ID,
                targetUserName: 'Bob Peer',
                deliveryMode: 'InterAgent',
                subject: 'Confirm Q4 Launch Dependencies',
                message: 'Can Bob confirm engineering readiness by Friday?',
                workstreamKey: 'q4-launch-sync',
            };

            // Step A: Newly created InterAgent request wakes Bob's Chief of Staff
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
                messageBody: 'Can Bob confirm engineering readiness by Friday?',
            });

            // Step B: Resolved InterAgent request wakes Alice's (sender's) Chief of Staff
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

    describe('1a. Legacy envelope values', () => {
        it('still wakes the target Chief of Staff for an in-flight envelope written with the pre-rename InterAgentCoS delivery mode', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_BOB_ID }));
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });

            const legacyRequest = {
                ID: 'req-legacy-1',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_BOB_ID,
                Status: 'Requested',
                Request: 'Legacy coordination request',
                Comments: JSON.stringify({
                    interAgentCoordination: true,
                    deliveryMode: 'InterAgentCoS',
                    senderUserID: USER_ALICE_ID,
                    senderAgentID: COS_AGENT_ID,
                    targetUserID: USER_BOB_ID,
                    subject: 'Legacy',
                }),
            } as unknown as MJAIAgentRequestEntity;

            const result = await AgentWakeTriggerService.Instance.TriggerWakeOnIncomingInterAgentRequest(
                legacyRequest, aliceUser, provider, FIXED_NOW);

            expect(result.triggered).toBe(true);
            expect(savedRoutines[0].UserID).toBe(USER_BOB_ID);
        });
    });

    describe('1b. Routine save context (ownership gate on MJ: User Routines)', () => {
        const interAgentEnvelope = {
            interAgentCoordination: true,
            protocolVersion: '1.0',
            senderUserID: USER_ALICE_ID,
            senderUserName: 'Alice Executive',
            senderAgentID: COS_AGENT_ID,
            targetUserID: USER_BOB_ID,
            subject: 'Cross-user wake',
            message: 'Please confirm.',
            workstreamKey: 'cross-user',
        };

        it('saves a wake routine for another user as the system user, not as the requester', async () => {
            const { provider, savedRoutines, capturedContextUsers } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_BOB_ID }));
            runViewMock.mockResolvedValue({ Success: true, Results: [] });

            const incomingReq = {
                ID: 'req-cross-user',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_BOB_ID,
                Status: 'Requested',
                Request: 'x',
                Comments: JSON.stringify(interAgentEnvelope),
            } as unknown as MJAIAgentRequestEntity;

            const result = await AgentWakeTriggerService.Instance.TriggerWakeOnIncomingInterAgentRequest(
                incomingReq,
                aliceUser,
                provider,
                FIXED_NOW
            );

            expect(result.triggered).toBe(true);
            expect(savedRoutines[0].UserID).toBe(USER_BOB_ID);
            expect(capturedContextUsers[0].ID).toBe(SYSTEM_USER_ID);
            // the existing-routine lookup must also run with a user that can see Bob's routines
            const lookupCall = runViewMock.mock.calls.find((c) => String(c[0]?.EntityName) === 'MJ: User Routines');
            expect(lookupCall?.[1]?.ID).toBe(SYSTEM_USER_ID);
        });

        it('saves a wake routine for the requester themselves as the requester', async () => {
            const { provider, savedRoutines, capturedContextUsers } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_ALICE_ID }));
            runViewMock.mockResolvedValue({ Success: true, Results: [] });

            const ownReq = {
                ID: 'req-own',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_ALICE_ID,
                Status: 'Approved',
                Request: 'Approve draft',
                Comments: null,
                ResponseByUserID: USER_ALICE_ID,
            } as unknown as MJAIAgentRequestEntity;

            const result = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                ownReq,
                aliceUser,
                provider,
                FIXED_NOW
            );

            expect(result.triggered).toBe(true);
            expect(savedRoutines[0].UserID).toBe(USER_ALICE_ID);
            expect(capturedContextUsers[0].ID).toBe(USER_ALICE_ID);
        });
    });

    describe('1c. Coalesced wakes carry every event since the last dispatcher claim', () => {
        function approvedRequest(id: string, text: string): MJAIAgentRequestEntity {
            return {
                ID: id,
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_ALICE_ID,
                Status: 'Approved',
                Request: text,
                Comments: null,
                ResponseByUserID: USER_ALICE_ID,
            } as unknown as MJAIAgentRequestEntity;
        }

        /** Second and later lookups return the routine the first call created, as the database would. */
        function serveExistingRoutines(savedRoutines: MockRoutineEntity[]): void {
            runViewMock.mockImplementation(async (params: { EntityName: string }) => ({
                Success: true,
                Results: params.EntityName === 'MJ: User Routines' ? [...new Set(savedRoutines)] : [],
            }));
        }

        it('appends a second approval to an unclaimed pending wake instead of overwriting it', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_ALICE_ID }));
            serveExistingRoutines(savedRoutines);

            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvedRequest('req-A', 'Send partner announcement email'), aliceUser, provider, FIXED_NOW);
            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvedRequest('req-B', 'Confirm Friday vendor meeting'), aliceUser, provider, new Date(FIXED_NOW.getTime() + 15_000));

            expect(new Set(savedRoutines).size).toBe(1);
            const routine = savedRoutines[0];
            const pending = routine.WakeConfigurationObject?.resumeState?.['pendingEvents'] as Array<Record<string, unknown>>;
            expect(pending.map((e) => e['requestID'])).toEqual(['req-A', 'req-B']);
            // latest event stays at the top level for consumers that predate the queue
            expect(routine.WakeConfigurationObject?.resumeState?.['requestID']).toBe('req-B');
            expect(routine.InitialMessage).toContain('2 events');
            expect(JSON.parse(routine.StartingPayload ?? '{}').resumeState.pendingEvents).toHaveLength(2);
        });

        it('starts a fresh event list once the dispatcher has claimed the previous wake', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_ALICE_ID }));
            serveExistingRoutines(savedRoutines);

            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvedRequest('req-A', 'A'), aliceUser, provider, FIXED_NOW);
            // the dispatcher's claim nulls NextRunAt; after the run the row is Disabled
            savedRoutines[0].NextRunAt = null;
            savedRoutines[0].Status = 'Disabled';
            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvedRequest('req-B', 'B'), aliceUser, provider, new Date(FIXED_NOW.getTime() + 120_000));

            const pending = savedRoutines[0].WakeConfigurationObject?.resumeState?.['pendingEvents'] as Array<Record<string, unknown>>;
            expect(pending.map((e) => e['requestID'])).toEqual(['req-B']);
            expect(savedRoutines[0].Status).toBe('Active');
        });

        it('serializes concurrent triggers for the same user, agent and workstream into one routine', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_ALICE_ID }));
            serveExistingRoutines(savedRoutines);

            // Both triggers start before either lookup resolves — the in-process race the write lock must close.
            await Promise.all([
                AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                    approvedRequest('req-A', 'A'), aliceUser, provider, FIXED_NOW),
                AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                    approvedRequest('req-B', 'B'), aliceUser, provider, new Date(FIXED_NOW.getTime() + 1_000)),
            ]);

            expect(new Set(savedRoutines.map((r) => r.ID)).size).toBe(1);
            const pending = savedRoutines[0].WakeConfigurationObject?.resumeState?.['pendingEvents'] as Array<Record<string, unknown>>;
            expect(pending.map((e) => e['requestID'])).toEqual(['req-A', 'req-B']);
        });

        it('does not queue the same request and status twice', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(createPolicy({ UserID: USER_ALICE_ID }));
            serveExistingRoutines(savedRoutines);

            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvedRequest('req-A', 'A'), aliceUser, provider, FIXED_NOW);
            await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvedRequest('req-A', 'A'), aliceUser, provider, new Date(FIXED_NOW.getTime() + 1_000));

            const pending = savedRoutines[0].WakeConfigurationObject?.resumeState?.['pendingEvents'] as Array<Record<string, unknown>>;
            expect(pending).toHaveLength(1);
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

        it('resolves a sender that is not injected through UserCache so the save user carries roles', async () => {
            const { provider, savedRoutines, capturedContextUsers } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({ AgentID: COS_AGENT_ID, UserID: USER_ALICE_ID, Status: 'Active' })
            );
            const cachedAlice = {
                ...createUser(USER_ALICE_ID, 'Alice Executive', 'alice@company.com'),
                UserRoles: [{ RoleName: 'Developer' }],
            } as unknown as UserInfo;
            findUserMock.mockResolvedValue(cachedAlice);
            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });

            const result = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'cos@company.com',
                fromAddress: 'ALICE@company.com',
                subject: 'Weekly check-in',
                systemContextUser: serviceUser,
                metadataProvider: provider,
                identities: [utilityIdentity],
                now: FIXED_NOW,
            });

            expect(result.triggered).toBe(true);
            expect(findUserMock).toHaveBeenCalledWith({ Email: 'alice@company.com' });
            // No raw MJ: Users query — the cache (which loads roles) is the lookup.
            expect(runViewMock.mock.calls.some((c) => (c[0] as { EntityName: string }).EntityName === 'MJ: Users')).toBe(false);
            expect(capturedContextUsers[0].ID).toBe(USER_ALICE_ID);
            expect(capturedContextUsers[0].UserRoles).toHaveLength(1);
            expect(savedRoutines[0].UserID).toBe(USER_ALICE_ID);
        });

        it('rejects a non-injected sender that UserCache cannot resolve', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            findUserMock.mockResolvedValue(undefined);

            const result = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'cos@company.com',
                fromAddress: 'stranger@elsewhere.com',
                subject: 'hello',
                systemContextUser: serviceUser,
                metadataProvider: provider,
                identities: [utilityIdentity],
                now: FIXED_NOW,
            });

            expect(result.triggered).toBe(false);
            expect(result.resultCode).toBe('UNVERIFIED_EXTERNAL_SENDER');
            expect(savedRoutines).toHaveLength(0);
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

    describe('3. Generic Workstream Wake (TriggerWakeForWorkstream)', () => {
        const FACTORY_AGENT_ID = '00000000-0000-0000-0000-0000FAC70711';

        it('schedules an immediate AgentWake routine for a named non-Chief-of-Staff agent (Software Factory) and workstream when called by system/Owner user', async () => {
            const { provider, savedRoutines, capturedContextUsers } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({
                    AgentID: FACTORY_AGENT_ID,
                    UserID: USER_ALICE_ID,
                    Agent: 'Software Factory',
                    Status: 'Active',
                })
            );
            findUserMock.mockResolvedValue(aliceUser);
            runViewMock
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [{ ID: FACTORY_AGENT_ID, Name: 'Software Factory' }],
                })
                .mockResolvedValueOnce({
                    Success: true,
                    Results: [],
                });

            const result = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentName: 'Software Factory',
                workstreamKey: 'task:task-42',
                wakeReason: 'Factory task moved to Ready for Build',
                resumeState: {
                    triggerType: 'TaskStatusChanged',
                    recordID: 'task-42',
                    status: 'Ready for Build',
                    workstreamKey: 'spoofed-workstream',
                    wakeReason: 'spoofed-reason',
                },
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });

            expect(result.triggered).toBe(true);
            expect(result.resultCode).toBe('WAKE_SCHEDULED');
            expect(result.targetAgentID).toBe(FACTORY_AGENT_ID);
            expect(result.targetUserID).toBe(USER_ALICE_ID);
            expect(result.workstreamKey).toBe('task:task-42');
            expect(savedRoutines).toHaveLength(1);
            expect(savedRoutines[0].TargetID).toBe(FACTORY_AGENT_ID);
            expect(savedRoutines[0].UserID).toBe(USER_ALICE_ID);
            expect(savedRoutines[0].Name).toContain('Software Factory');
            expect(capturedContextUsers[0]).toBe(systemUser);
            // Canonical wake envelope fields must never be overwritten by caller resumeState
            expect(savedRoutines[0].WakeConfigurationObject?.resumeState?.['workstreamKey']).toBe('task:task-42');
            expect(savedRoutines[0].WakeConfigurationObject?.resumeState?.['wakeReason']).toBe(
                'Factory task moved to Ready for Build'
            );
        });

        it('rejects cross-user TriggerWakeForWorkstream from non-Owner callers, inactive target users, and policy lookup errors', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({
                    AgentID: FACTORY_AGENT_ID,
                    UserID: USER_ALICE_ID,
                    Agent: 'Software Factory',
                    Status: 'Active',
                })
            );

            // 1. Non-system, non-Owner caller (bobUser / serviceUser) attempting cross-user wake is rejected
            const unauthorizedCrossUser = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-42',
                wakeReason: 'Cross-user spoof',
                contextUser: bobUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(unauthorizedCrossUser.triggered).toBe(false);
            expect(unauthorizedCrossUser.resultCode).toBe('POLICY_DENIED');

            // 2. Inactive target user is rejected even for systemUser
            findUserMock.mockResolvedValue({ ...aliceUser, IsActive: false } as UserInfo);
            const inactiveTarget = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-42',
                wakeReason: 'Wake inactive user',
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(inactiveTarget.triggered).toBe(false);
            expect(inactiveTarget.resultCode).toBe('POLICY_DENIED');

            // 3. Policy lookup failure (Success: false) fails closed instead of defaulting to allowed
            AgentUserPolicyEngine.Instance.ClearCache();
            runViewMock.mockResolvedValueOnce({
                Success: false,
                Results: [],
                ErrorMessage: 'Transient SQL timeout',
            });
            const lookupFailed = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-42',
                wakeReason: 'Self wake during DB blip',
                contextUser: aliceUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(lookupFailed.triggered).toBe(false);
            expect(lookupFailed.resultCode).toBe('POLICY_DENIED');
            expect(savedRoutines).toHaveLength(0);
        });

        it('coalesces two rapid external events for the same workstream into pendingEvents without dropping either', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({ AgentID: FACTORY_AGENT_ID, UserID: USER_ALICE_ID, Agent: 'Software Factory', Status: 'Active' })
            );

            runViewMock.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: FACTORY_AGENT_ID, Name: 'Software Factory' }] };
                }
                return { Success: true, Results: savedRoutines };
            });

            await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-99',
                wakeReason: 'GitHub CI check suite succeeded',
                resumeState: { triggerType: 'GitHubWebhook', eventID: 'gh-evt-1' },
                contextUser: aliceUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-99',
                wakeReason: 'GitHub PR approved by reviewer',
                resumeState: { triggerType: 'GitHubWebhook', eventID: 'gh-evt-2' },
                contextUser: aliceUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });

            expect(new Set(savedRoutines).size).toBe(1);
            const pending = (savedRoutines[0].WakeConfigurationObject?.resumeState?.['pendingEvents'] ?? []) as Array<Record<string, unknown>>;
            expect(pending).toHaveLength(2);
            expect(pending.map((p) => p['eventID'])).toEqual(['gh-evt-1', 'gh-evt-2']);
        });

        it('suppresses workstream wake when target user policy is Paused or Disabled, and rejects unknown agent names', async () => {
            const { provider, savedRoutines } = createMockMetadataProvider();
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                createPolicy({ AgentID: FACTORY_AGENT_ID, UserID: USER_ALICE_ID, Status: 'Paused' })
            );
            runViewMock.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: FACTORY_AGENT_ID, Name: 'Software Factory' }],
            });

            const paused = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-1',
                wakeReason: 'Task created',
                contextUser: aliceUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(paused.triggered).toBe(false);
            expect(paused.resultCode).toBe('POLICY_DENIED');

            runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });
            const missing = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentName: 'Nonexistent Agent',
                workstreamKey: 'task:task-1',
                wakeReason: 'Task created',
                contextUser: aliceUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(missing.triggered).toBe(false);
            expect(missing.resultCode).toBe('AGENT_NOT_FOUND');

            const invalid = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: '',
                targetAgentID: FACTORY_AGENT_ID,
                workstreamKey: 'task:task-1',
                wakeReason: 'Task created',
                contextUser: aliceUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(invalid.triggered).toBe(false);
            expect(invalid.resultCode).toBe('MISSING_REQUIRED_INPUT');
            expect(savedRoutines).toHaveLength(0);
        });
    });
});
