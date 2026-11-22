import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    DatabasePlatform,
    EntityInfo,
    EntitySaveOptions,
    EntityTransactionScope,
    IEntityDataProvider,
    IMetadataProvider,
    ProviderType,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJAIBridgeAgentIdentityEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import {
    AgentWakeTriggerService,
    BuildAppWorkstreamKey,
    BuildPolicyPairKey,
    BuildUserAppWakeKey,
    CheckActivePoliciesForBatch,
    CheckActivePolicyForAgentAndUser,
    CoalescedWakeEventPayload,
    CoalescedWakeResumeState,
    EventWakeCoalescer,
    WakeStartupGuard,
} from '../index';
import { MJUserRoutineEntityServer } from '../../../../MJCoreEntitiesServer/src/custom/MJUserRoutineEntityServer.server';

const runViewMock = vi.fn();
const findUserMock = vi.fn();

const SYSTEM_USER_ID = '00000000-0000-0000-0000-0000000005E5';
const COS_AGENT_ID = '00000000-0000-0000-0000-00000000C051';
const USER_ALICE_ID = '00000000-0000-0000-0000-00000000A11C';
const USER_BOB_ID = '00000000-0000-0000-0000-00000000B0B2';
const USER_CAROL_ID = '00000000-0000-0000-0000-00000000CA03';
const APP_TASKS_ID = '11111111-1111-1111-1111-111111111111';
const APP_CRM_ID = '22222222-2222-2222-2222-222222222222';
const FIXED_NOW = new Date('2026-11-22T12:00:00.000Z');

const ADMIN_ROLE_ID = '11111111-1111-1111-1111-11111111111A';

const systemUser = new UserInfo(null, {
    ID: SYSTEM_USER_ID,
    Name: 'System',
    Email: 'system@mj.local',
    Type: 'Owner',
    IsActive: true,
    UserRoles: [{ ID: 'ur-sys-guard', UserID: SYSTEM_USER_ID, RoleID: ADMIN_ROLE_ID, Role: 'Administrator' }],
});

const aliceUser = new UserInfo(null, {
    ID: USER_ALICE_ID,
    Name: 'Alice',
    Email: 'alice@example.com',
    Type: 'User',
    IsActive: true,
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: {
            GetSystemUser: () => systemUser,
            FindUser: (criteria: { ID?: string; Email?: string }) => findUserMock(criteria),
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class MockRunView extends actual.RunView {
            public static override FromMetadataProvider(): RunView {
                return new MockRunView();
            }
            public override async RunView(params: Parameters<RunView['RunView']>[0], user?: UserInfo) {
                return runViewMock(params, user);
            }
        },
    };
});

class InMemoryRoutineEntity extends MJUserRoutineEntity {
    private backingID: string;
    private backingUserID = '';
    private backingName = '';
    private backingDescription: string | null = null;
    private backingStatus: MJUserRoutineEntity['Status'] = 'Active';
    private backingRoutineType: MJUserRoutineEntity['RoutineType'] = 'AgentWake';
    private backingScheduleMode: MJUserRoutineEntity['ScheduleMode'] = 'OneShot';
    private backingTargetType: MJUserRoutineEntity['TargetType'] = 'Agent';
    private backingTargetID = '';
    private backingCronExpression: string | null = null;
    private backingTimezone: string | null = 'UTC';
    private backingInitialMessage: string | null = null;
    private backingStartingPayload: string | null = null;
    private backingNextRunAt: Date | null = null;
    private backingLastRunAt: Date | null = null;
    private backingWakeConfig: string | null = null;
    private backingWakeConfigObj: MJUserRoutineEntity_IRoutineWakeConfiguration | null = null;
    private backingAgentConfigID: string | null = null;
    private readonly onSave: (entity: InMemoryRoutineEntity) => void;

    public constructor(id: string, onSave: (entity: InMemoryRoutineEntity) => void) {
        super(new EntityInfo({ Name: 'MJ: User Routines', Status: 'Active', Fields: [] }));
        this.backingID = id;
        this.onSave = onSave;
    }

    public override get ID() { return this.backingID; }
    public override set ID(v: string) { this.backingID = v; }
    public override get UserID() { return this.backingUserID; }
    public override set UserID(v: string) { this.backingUserID = v; }
    public override get Name() { return this.backingName; }
    public override set Name(v: string) { this.backingName = v; }
    public override get Description() { return this.backingDescription; }
    public override set Description(v: string | null) { this.backingDescription = v; }
    public override get Status() { return this.backingStatus; }
    public override set Status(v: MJUserRoutineEntity['Status']) { this.backingStatus = v; }
    public override get RoutineType() { return this.backingRoutineType; }
    public override set RoutineType(v: MJUserRoutineEntity['RoutineType']) { this.backingRoutineType = v; }
    public override get ScheduleMode() { return this.backingScheduleMode; }
    public override set ScheduleMode(v: MJUserRoutineEntity['ScheduleMode']) { this.backingScheduleMode = v; }
    public override get TargetType() { return this.backingTargetType; }
    public override set TargetType(v: MJUserRoutineEntity['TargetType']) { this.backingTargetType = v; }
    public override get TargetID() { return this.backingTargetID; }
    public override set TargetID(v: string) { this.backingTargetID = v; }
    public override get CronExpression() { return this.backingCronExpression; }
    public override set CronExpression(v: string | null) { this.backingCronExpression = v; }
    public override get Timezone() { return this.backingTimezone; }
    public override set Timezone(v: string | null) { this.backingTimezone = v; }
    public override get InitialMessage() { return this.backingInitialMessage; }
    public override set InitialMessage(v: string | null) { this.backingInitialMessage = v; }
    public override get StartingPayload() { return this.backingStartingPayload; }
    public override set StartingPayload(v: string | null) { this.backingStartingPayload = v; }
    public override get NextRunAt() { return this.backingNextRunAt; }
    public override set NextRunAt(v: Date | null) { this.backingNextRunAt = v; }
    public override get LastRunAt() { return this.backingLastRunAt; }
    public override set LastRunAt(v: Date | null) { this.backingLastRunAt = v; }
    public override get WakeConfiguration() { return this.backingWakeConfig; }
    public override set WakeConfiguration(v: string | null) { this.backingWakeConfig = v; }
    public override get WakeConfigurationObject() { return this.backingWakeConfigObj; }
    public override set WakeConfigurationObject(v: MJUserRoutineEntity_IRoutineWakeConfiguration | null) {
        this.backingWakeConfigObj = v;
        this.backingWakeConfig = v ? JSON.stringify(v) : null;
    }
    public override get AgentConfigurationID() { return this.backingAgentConfigID; }
    public override set AgentConfigurationID(v: string | null) { this.backingAgentConfigID = v; }

    public override NewRecord(): boolean {
        return true;
    }

    public override async Save(): Promise<boolean> {
        this.onSave(this);
        return true;
    }
}

class InMemoryAgentChannelEntity extends MJAgentChannelEntity {
    private backingID = 'chan-guard-1';
    private backingTopic = 'Cross-org sync';
    private backingStatus: MJAgentChannelEntity['ChannelStatus'] = 'Open';
    private backingTurns = 0;
    private backingMaxTurns = 5;
    private backingHourly = 0;
    private backingMaxHourly = 10;
    private backingHourlyStart: Date | null = null;

    public constructor() {
        super(new EntityInfo({ Name: 'MJ: Agent Channels', Status: 'Active', Fields: [] }));
    }

    public override get ID() { return this.backingID; }
    public override set ID(v: string) { this.backingID = v; }
    public override get Topic() { return this.backingTopic; }
    public override set Topic(v: string) { this.backingTopic = v; }
    public override get ChannelStatus() { return this.backingStatus; }
    public override set ChannelStatus(v: MJAgentChannelEntity['ChannelStatus']) { this.backingStatus = v; }
    public override get ConsecutiveAgentTurns() { return this.backingTurns; }
    public override set ConsecutiveAgentTurns(v: number) { this.backingTurns = v; }
    public override get MaxConsecutiveAgentTurns() { return this.backingMaxTurns; }
    public override set MaxConsecutiveAgentTurns(v: number) { this.backingMaxTurns = v; }
    public override get HourlyWakeCount() { return this.backingHourly; }
    public override set HourlyWakeCount(v: number) { this.backingHourly = v; }
    public override get MaxHourlyWakes() { return this.backingMaxHourly; }
    public override set MaxHourlyWakes(v: number) { this.backingMaxHourly = v; }
    public override get HourlyWakeWindowStart() { return this.backingHourlyStart; }
    public override set HourlyWakeWindowStart(v: Date | null) { this.backingHourlyStart = v; }

    public override async Load(id: string): Promise<boolean> {
        this.backingID = id;
        return true;
    }

    public override async Save(): Promise<boolean> {
        return true;
    }
}

class InMemoryChannelParticipantEntity extends MJAgentChannelParticipantEntity {
    private backingChannelID: string;
    private backingUserID: string;
    private backingAgentID: string;
    private backingStatus: MJAgentChannelParticipantEntity['Status'];

    public constructor(channelID: string, userID: string, agentID: string, status: MJAgentChannelParticipantEntity['Status'] = 'Active') {
        super(new EntityInfo({ Name: 'MJ: Agent Channel Participants', Status: 'Active', Fields: [] }));
        this.backingChannelID = channelID;
        this.backingUserID = userID;
        this.backingAgentID = agentID;
        this.backingStatus = status;
    }

    public override get AgentChannelID() { return this.backingChannelID; }
    public override get UserID() { return this.backingUserID; }
    public override get AgentID() { return this.backingAgentID; }
    public override get Status() { return this.backingStatus; }
}

class InMemoryAgentRequestEntity extends MJAIAgentRequestEntity {
    private backingID: string;
    private backingAgentID: string;
    private backingRequestForUserID: string;
    private backingStatus: MJAIAgentRequestEntity['Status'];
    private backingRequest: string;
    private backingRespondedAt: Date | null;
    private backingOrigRunID: string | null = null;
    private backingOrigTaskID: string | null = null;
    private backingComments: string | null = null;

    public constructor(opts: {
        ID: string;
        AgentID: string;
        RequestForUserID: string;
        Status: MJAIAgentRequestEntity['Status'];
        Request: string;
        RespondedAt: Date | null;
    }) {
        super(new EntityInfo({ Name: 'MJ: AI Agent Requests', Status: 'Active', Fields: [] }));
        this.backingID = opts.ID;
        this.backingAgentID = opts.AgentID;
        this.backingRequestForUserID = opts.RequestForUserID;
        this.backingStatus = opts.Status;
        this.backingRequest = opts.Request;
        this.backingRespondedAt = opts.RespondedAt;
    }

    public override get ID() { return this.backingID; }
    public override get AgentID() { return this.backingAgentID; }
    public override get RequestForUserID() { return this.backingRequestForUserID; }
    public override get Status() { return this.backingStatus; }
    public override get Request() { return this.backingRequest; }
    public override get RespondedAt() { return this.backingRespondedAt; }
    public override get OriginatingAgentRunID() { return this.backingOrigRunID; }
    public override get OriginatingTaskID() { return this.backingOrigTaskID; }
    public override get Comments() { return this.backingComments; }
}

class InMemoryPolicyEntity extends MJAIAgentUserPolicyEntity {
    private backingID: string;
    private backingAgentID: string;
    private backingUserID: string;
    private backingStatus: MJAIAgentUserPolicyEntity['Status'];
    private backingAllowInterAgent: boolean;
    private backingEmailMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];

    public constructor(opts: {
        ID: string;
        AgentID: string;
        UserID: string;
        Status: MJAIAgentUserPolicyEntity['Status'];
        AllowInterAgentCoordination: boolean;
        EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    }) {
        super(new EntityInfo({ Name: 'MJ: AI Agent User Policies', Status: 'Active', Fields: [] }));
        this.backingID = opts.ID;
        this.backingAgentID = opts.AgentID;
        this.backingUserID = opts.UserID;
        this.backingStatus = opts.Status;
        this.backingAllowInterAgent = opts.AllowInterAgentCoordination;
        this.backingEmailMode = opts.EmailChannelMode;
    }

    public override get ID() { return this.backingID; }
    public override get AgentID() { return this.backingAgentID; }
    public override get UserID() { return this.backingUserID; }
    public override get Status() { return this.backingStatus; }
    public override get AllowInterAgentCoordination() { return this.backingAllowInterAgent; }
    public override get EmailChannelMode() { return this.backingEmailMode; }
}

class InMemoryBridgeIdentityEntity extends MJAIBridgeAgentIdentityEntity {
    private backingID: string;
    private backingAgentID: string;
    private backingIdentityType: MJAIBridgeAgentIdentityEntity['IdentityType'];
    private backingIdentityValue: string;
    private backingIsActive: boolean;
    private backingConfig: string | null;

    public constructor(opts: {
        ID: string;
        AgentID: string;
        IdentityType: MJAIBridgeAgentIdentityEntity['IdentityType'];
        IdentityValue: string;
        IsActive: boolean;
        Configuration: string | null;
    }) {
        super(new EntityInfo({ Name: 'MJ: AI Bridge Agent Identities', Status: 'Active', Fields: [] }));
        this.backingID = opts.ID;
        this.backingAgentID = opts.AgentID;
        this.backingIdentityType = opts.IdentityType;
        this.backingIdentityValue = opts.IdentityValue;
        this.backingIsActive = opts.IsActive;
        this.backingConfig = opts.Configuration;
    }

    public override get ID() { return this.backingID; }
    public override get AgentID() { return this.backingAgentID; }
    public override get IdentityType() { return this.backingIdentityType; }
    public override get IdentityValue() { return this.backingIdentityValue; }
    public override get IsActive() { return this.backingIsActive; }
    public override get Configuration() { return this.backingConfig; }
}

function createInMemoryRoutineStore() {
    const routinesByID = new Map<string, InMemoryRoutineEntity>();
    const saveCalls: InMemoryRoutineEntity[] = [];
    let seq = 0;

    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Agent Channels') {
                return new InMemoryAgentChannelEntity();
            }
            const routine = new InMemoryRoutineEntity(`routine-${++seq}`, (saved) => {
                routinesByID.set(saved.ID, saved);
                saveCalls.push(saved);
            });
            return routine;
        }),
    } as Partial<IMetadataProvider> as IMetadataProvider;

    return {
        provider,
        routinesByID,
        saveCalls,
    };
}

describe('Slice 2: Active-Policy Gating, (UserID, ApplicationID) Coalescing, and AIDP Startup Guard', () => {
    const savedEnvAidp = process.env.AIDP_DEPLOYMENT_IN_PROGRESS;
    const savedEnvSkip = process.env.MJ_SKIP_STARTUP_WAKES;

    beforeEach(() => {
        vi.clearAllMocks();
        AgentUserPolicyEngine.Instance.ClearCache();
        EventWakeCoalescer.Instance.Reset();
        WakeStartupGuard.Instance.Reset();
        delete process.env.AIDP_DEPLOYMENT_IN_PROGRESS;
        delete process.env.MJ_SKIP_STARTUP_WAKES;
        findUserMock.mockImplementation((criteria: { ID?: string; Email?: string }) => {
            if (criteria.Email?.toLowerCase() === 'alice@example.com' || criteria.ID === USER_ALICE_ID) {
                return aliceUser;
            }
            return undefined;
        });
    });

    afterEach(() => {
        WakeStartupGuard.Instance.Reset();
        EventWakeCoalescer.Instance.Reset();
        if (savedEnvAidp === undefined) {
            delete process.env.AIDP_DEPLOYMENT_IN_PROGRESS;
        } else {
            process.env.AIDP_DEPLOYMENT_IN_PROGRESS = savedEnvAidp;
        }
        if (savedEnvSkip === undefined) {
            delete process.env.MJ_SKIP_STARTUP_WAKES;
        } else {
            process.env.MJ_SKIP_STARTUP_WAKES = savedEnvSkip;
        }
    });

    describe('S2-AC-1: Active-Policy Wake Gating & Batched RunView (ResultType: simple)', () => {
        it('uses batched RunView with ResultType: "simple" and Fields projection across multiple pairs in one query', async () => {
            const { provider } = createInMemoryRoutineStore();
            runViewMock.mockResolvedValueOnce({
                Success: true,
                Results: [
                    {
                        ID: 'pol-alice',
                        AgentID: COS_AGENT_ID,
                        UserID: USER_ALICE_ID,
                        Status: 'Active',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    },
                    {
                        ID: 'pol-bob',
                        AgentID: COS_AGENT_ID,
                        UserID: USER_BOB_ID,
                        Status: 'Paused',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    },
                ],
            });

            const evalMap = await CheckActivePoliciesForBatch(
                [
                    { AgentID: COS_AGENT_ID, UserID: USER_ALICE_ID },
                    { AgentID: COS_AGENT_ID, UserID: USER_BOB_ID },
                    { AgentID: COS_AGENT_ID, UserID: USER_CAROL_ID },
                ],
                systemUser,
                { provider, bypassCache: true }
            );

            // Exactly 1 batched RunView query, zero N+1 loops
            expect(runViewMock).toHaveBeenCalledTimes(1);
            const rvParams = runViewMock.mock.calls[0][0] as {
                EntityName: string;
                ResultType: string;
                Fields: string[];
                ExtraFilter: string;
            };
            expect(rvParams.EntityName).toBe('MJ: AI Agent User Policies');
            expect(rvParams.ResultType).toBe('simple');
            expect(rvParams.Fields).toEqual(
                expect.arrayContaining(['ID', 'AgentID', 'UserID', 'Status', 'AllowInterAgentCoordination'])
            );
            expect(rvParams.ExtraFilter).toContain(USER_ALICE_ID);
            expect(rvParams.ExtraFilter).toContain(USER_BOB_ID);
            expect(rvParams.ExtraFilter).toContain(USER_CAROL_ID);

            expect(evalMap.get(BuildPolicyPairKey(COS_AGENT_ID, USER_ALICE_ID))?.Allowed).toBe(true);
            expect(evalMap.get(BuildPolicyPairKey(COS_AGENT_ID, USER_BOB_ID))?.Allowed).toBe(false);
            expect(evalMap.get(BuildPolicyPairKey(COS_AGENT_ID, USER_CAROL_ID))?.Allowed).toBe(false);
        });

        it('fails closed when policy RunView query fails or throws', async () => {
            const { provider } = createInMemoryRoutineStore();
            runViewMock.mockResolvedValueOnce({
                Success: false,
                ErrorMessage: 'SQL timeout verifying policies',
                Results: [],
            });

            const failedEval = await CheckActivePolicyForAgentAndUser(COS_AGENT_ID, USER_ALICE_ID, aliceUser, {
                provider,
                bypassCache: true,
            });
            expect(failedEval.Allowed).toBe(false);
            expect(failedEval.LookupStatus).toBe('error');

            runViewMock.mockRejectedValueOnce(new Error('Connection reset'));
            const thrownEval = await CheckActivePolicyForAgentAndUser(COS_AGENT_ID, USER_ALICE_ID, aliceUser, {
                provider,
                bypassCache: true,
            });
            expect(thrownEval.Allowed).toBe(false);
            expect(thrownEval.LookupStatus).toBe('error');
        });

        it('denies workstream, request resolution, utility mailbox, and channel peer wakes when user has no policy or Paused/Disabled policy', async () => {
            const { provider, saveCalls } = createInMemoryRoutineStore();

            // Empty policies in DB
            runViewMock.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
                }
                if (params.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
                }
                if (params.EntityName === 'MJ: Agent Channel Participants') {
                    return {
                        Success: true,
                        Results: [
                            new InMemoryChannelParticipantEntity('chan-guard-1', USER_ALICE_ID, COS_AGENT_ID, 'Active'),
                            new InMemoryChannelParticipantEntity('chan-guard-1', USER_BOB_ID, COS_AGENT_ID, 'Active'),
                        ],
                    };
                }
                return { Success: true, Results: [] };
            });

            // 1. Workstream wake with no policy -> POLICY_DENIED
            const workstreamNoPolicy = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:t-1',
                wakeReason: 'Task assigned',
                applicationID: APP_TASKS_ID,
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(workstreamNoPolicy.triggered).toBe(false);
            expect(workstreamNoPolicy.resultCode).toBe('POLICY_DENIED');

            // 2. Request resolution with no policy -> POLICY_DENIED
            const approvalReq = new InMemoryAgentRequestEntity({
                ID: 'req-1',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_ALICE_ID,
                Status: 'Approved',
                Request: 'Send note',
                RespondedAt: FIXED_NOW,
            });
            const reqNoPolicy = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentRequestResolution(
                approvalReq,
                aliceUser,
                provider,
                FIXED_NOW
            );
            expect(reqNoPolicy.triggered).toBe(false);
            expect(reqNoPolicy.resultCode).toBe('POLICY_DENIED');

            // 3. Channel message: peer Bob has NO policy -> POLICY_DENIED (using batched check)
            const chanOutcome = await AgentWakeTriggerService.Instance.TriggerWakeOnAgentChannelMessage({
                channelID: 'chan-guard-1',
                conversationDetailID: 'detail-1',
                senderUserID: USER_ALICE_ID,
                senderAgentID: null,
                messagePreview: 'Hello peer',
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(chanOutcome.results).toHaveLength(1);
            expect(chanOutcome.results[0].triggered).toBe(false);
            expect(chanOutcome.results[0].resultCode).toBe('POLICY_DENIED');

            // 4. Utility mailbox with Paused policy -> POLICY_DENIED
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                new InMemoryPolicyEntity({
                    ID: 'pol-paused',
                    AgentID: COS_AGENT_ID,
                    UserID: USER_ALICE_ID,
                    Status: 'Paused',
                    AllowInterAgentCoordination: true,
                    EmailChannelMode: 'DraftOnly',
                })
            );
            const mailboxPaused = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'cos@company.com',
                fromAddress: 'alice@example.com',
                subject: 'Morning',
                bodyPreview: 'Checking in',
                identities: [
                    new InMemoryBridgeIdentityEntity({
                        ID: 'id-mail-1',
                        AgentID: COS_AGENT_ID,
                        IdentityType: 'Email',
                        IdentityValue: 'cos@company.com',
                        IsActive: true,
                        Configuration: null,
                    }),
                ],
                users: [aliceUser],
                systemContextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(mailboxPaused.triggered).toBe(false);
            expect(mailboxPaused.resultCode).toBe('POLICY_DENIED');

            // Zero wake routines were saved across all unauthorized paths
            expect(saveCalls).toHaveLength(0);
        });
    });

    describe('S2-AC-2: Per-(UserID, ApplicationID) Coalescing Within Window', () => {
        it('coalesces 20 rapid task assignments for the same (UserID, ApplicationID) inside 60s into ONE wake with aggregated context', async () => {
            const { provider, routinesByID, saveCalls } = createInMemoryRoutineStore();
            const expectedWorkstreamKey = BuildAppWorkstreamKey(APP_TASKS_ID);
            const expectedCoalesceKey = BuildUserAppWakeKey(USER_ALICE_ID, APP_TASKS_ID);

            runViewMock.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice',
                                AgentID: COS_AGENT_ID,
                                UserID: USER_ALICE_ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
                }
                if (params.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
                }
                if (params.EntityName === 'MJ: User Routines') {
                    return { Success: true, Results: Array.from(routinesByID.values()) };
                }
                return { Success: true, Results: [] };
            });

            const taskResults = [];
            for (let i = 1; i <= 20; i++) {
                const res = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                    targetUserID: USER_ALICE_ID,
                    targetAgentID: COS_AGENT_ID,
                    workstreamKey: `task:task-${i}`,
                    applicationID: APP_TASKS_ID,
                    wakeReason: `Assigned task #${i}`,
                    resumeState: {
                        triggerType: 'TaskAssigned',
                        taskID: `task-${i}`,
                        subject: `Task #${i}`,
                    },
                    contextUser: systemUser,
                    metadataProvider: provider,
                    now: new Date(FIXED_NOW.getTime() + i * 1_000),
                });
                taskResults.push(res);
            }

            const expectedDeadlineISO = new Date(FIXED_NOW.getTime() + 1_000 + 60_000).toISOString();
            expect(saveCalls).toHaveLength(20);
            // All 20 assignments resolved onto the exact SAME routine ID and app workstream key
            expect(routinesByID.size).toBe(1);
            const singleRoutine = Array.from(routinesByID.values())[0];
            expect(singleRoutine.Status).toBe('Active');
            expect(singleRoutine.WakeConfigurationObject?.workstreamKey).toBe(expectedWorkstreamKey);
            // Initial event holds NextRunAt at firstEventAt + windowMs so bursts don't dispatch early
            expect(singleRoutine.NextRunAt?.toISOString()).toBe(expectedDeadlineISO);

            const resumeState = singleRoutine.WakeConfigurationObject?.resumeState as CoalescedWakeResumeState | undefined;
            const pending: CoalescedWakeEventPayload[] = resumeState?.pendingEvents ?? [];
            expect(pending).toHaveLength(20);
            expect(pending[0].taskID).toBe('task-1');
            expect(pending[19].taskID).toBe('task-20');

            const lastResult = taskResults[taskResults.length - 1];
            expect(lastResult.triggered).toBe(true);
            expect(lastResult.routineID).toBe(singleRoutine.ID);
            expect(lastResult.coalesced).toBe(true);
            expect(lastResult.coalescedCount).toBe(20);
            expect(lastResult.coalesceKey).toBe(expectedCoalesceKey);
            expect(lastResult.nextRunAtISO).toBe(expectedDeadlineISO);
        });

        it('keeps pendingEvents bounded on massive bursts (500 events) while tracking total counts and overflow summary', async () => {
            const { provider, routinesByID } = createInMemoryRoutineStore();

            runViewMock.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice',
                                AgentID: COS_AGENT_ID,
                                UserID: USER_ALICE_ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
                }
                if (params.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
                }
                if (params.EntityName === 'MJ: User Routines') {
                    return { Success: true, Results: Array.from(routinesByID.values()) };
                }
                return { Success: true, Results: [] };
            });

            let lastResult;
            for (let i = 1; i <= 60; i++) {
                lastResult = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                    targetUserID: USER_ALICE_ID,
                    targetAgentID: COS_AGENT_ID,
                    workstreamKey: `task:burst-${i}`,
                    applicationID: APP_TASKS_ID,
                    wakeReason: `Burst task #${i}`,
                    resumeState: { triggerType: 'TaskAssigned', taskID: `burst-${i}`, subject: `Burst #${i}` },
                    contextUser: systemUser,
                    metadataProvider: provider,
                    now: new Date(FIXED_NOW.getTime() + i * 100),
                });
            }

            expect(routinesByID.size).toBe(1);
            const singleRoutine = Array.from(routinesByID.values())[0];
            const resumeState = singleRoutine.WakeConfigurationObject?.resumeState as CoalescedWakeResumeState;
            const pending: CoalescedWakeEventPayload[] = resumeState.pendingEvents ?? [];
            expect(pending).toHaveLength(25);
            expect(pending[24].taskID).toBe('burst-60');
            expect(resumeState.coalescedEventCount).toBe(60);
            expect(resumeState.overflowEventCount).toBe(35);
            expect(typeof resumeState.coalescedSummary).toBe('string');
            expect(lastResult?.coalescedCount).toBe(60);
        });

        it('keeps separate applications distinct and starts a fresh single-event batch when event B arrives during cooldown after wake A is consumed', async () => {
            const { provider, routinesByID } = createInMemoryRoutineStore();

            runViewMock.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice',
                                AgentID: COS_AGENT_ID,
                                UserID: USER_ALICE_ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
                }
                if (params.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
                }
                if (params.EntityName === 'MJ: User Routines') {
                    return { Success: true, Results: Array.from(routinesByID.values()) };
                }
                return { Success: true, Results: [] };
            });

            const resAppA = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:a1',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Tasks app event A',
                resumeState: { triggerType: 'TaskAssigned', taskID: 'a1' },
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            const resAppB = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'deal:b1',
                applicationID: APP_CRM_ID,
                wakeReason: 'CRM app event',
                resumeState: { triggerType: 'DealUpdated', eventID: 'b1' },
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });

            expect(resAppA.routineID).not.toBe(resAppB.routineID);
            expect(routinesByID.size).toBe(2);

            // Simulate App A routine being claimed/dispatched at T0+60s
            const dispatchedAt = new Date(FIXED_NOW.getTime() + 60_000);
            const routineA = routinesByID.get(resAppA.routineID!)!;
            routineA.Status = 'Disabled';
            routineA.NextRunAt = null;
            routineA.LastRunAt = dispatchedAt;
            EventWakeCoalescer.Instance.RecordWakeDispatched(USER_ALICE_ID, APP_TASKS_ID, dispatchedAt);

            // Event B arrives at T0+75s (15s after dispatch, inside 60s cooldown) -> defers to T0+120s
            // AND starts a fresh batch containing ONLY [B] (never retaining consumed event A)
            const followUpAt = new Date(FIXED_NOW.getTime() + 75_000);
            const expectedDeferredAt = new Date(dispatchedAt.getTime() + 60_000);
            const resFollowUp = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:b2',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Second wave task B',
                resumeState: { triggerType: 'TaskAssigned', taskID: 'b2' },
                contextUser: systemUser,
                metadataProvider: provider,
                now: followUpAt,
            });

            expect(resFollowUp.triggered).toBe(true);
            expect(resFollowUp.nextRunAtISO).toBe(expectedDeferredAt.toISOString());
            expect(resFollowUp.coalescedCount).toBe(1);

            const followUpResume = routineA.WakeConfigurationObject?.resumeState as CoalescedWakeResumeState;
            expect(followUpResume.coalescedEventCount).toBe(1);
            expect(followUpResume.batchConsumed).toBe(false);
            expect(followUpResume.pendingEvents).toHaveLength(1);
            expect(followUpResume.pendingEvents?.[0].taskID).toBe('b2');

            // Cleanup after window expires frees memory
            const cleaned = EventWakeCoalescer.Instance.CleanupExpiredEntries(
                new Date(FIXED_NOW.getTime() + 500_000)
            );
            expect(cleaned).toBeGreaterThanOrEqual(2);
        });

        it('converges 20 concurrent events across independent service instances using real MJUserRoutineEntityServer.Save with zero lost events (CR-COALESCE-ATOMICITY)', async () => {
            const routineEntityInfo = new EntityInfo({
                ID: 'E0000000-0000-0000-0000-000000000002',
                Name: 'MJ: User Routines',
                Status: 'Active',
                SchemaName: '__mj',
                BaseTable: 'UserRoutine',
                BaseView: 'vwUserRoutines',
                AllowCreateAPI: true,
                AllowUpdateAPI: true,
                AllowDeleteAPI: true,
                IncludeInAPI: true,
                EntityPermissions: [
                    {
                        ID: 'ep-admin-guard',
                        EntityID: 'E0000000-0000-0000-0000-000000000002',
                        RoleID: ADMIN_ROLE_ID,
                        RoleName: 'Administrator',
                        CanCreate: true,
                        CanRead: true,
                        CanUpdate: true,
                        CanDelete: true,
                    },
                ],
                EntityFields: [
                    { ID: 'f1', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, DefaultValue: 'newsequentialid()', AllowUpdateAPI: false, Status: 'Active' },
                    { ID: 'f2', Sequence: 2, Name: 'UserID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f3', Sequence: 3, Name: 'Name', Type: 'nvarchar', Length: 255, AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f4', Sequence: 4, Name: 'Description', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f5', Sequence: 5, Name: 'Status', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Active', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f6', Sequence: 6, Name: 'RoutineType', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Scheduled', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f7', Sequence: 7, Name: 'ScheduleMode', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Recurring', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f8', Sequence: 8, Name: 'TargetType', Type: 'nvarchar', Length: 50, AllowsNull: false, DefaultValue: 'Agent', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f9', Sequence: 9, Name: 'TargetID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f10', Sequence: 10, Name: 'CronExpression', Type: 'nvarchar', Length: 100, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f11', Sequence: 11, Name: 'StartAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f12', Sequence: 12, Name: 'EndAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f13', Sequence: 13, Name: 'Timezone', Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultValue: 'UTC', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f14', Sequence: 14, Name: 'InitialMessage', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f15', Sequence: 15, Name: 'StartingPayload', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f16', Sequence: 16, Name: 'NextRunAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f17', Sequence: 17, Name: 'LastRunAt', Type: 'datetimeoffset', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f18', Sequence: 18, Name: 'WakeConfiguration', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f19', Sequence: 19, Name: 'AgentConfigurationID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f20', Sequence: 20, Name: 'NotifyViaInApp', Type: 'bit', AllowsNull: false, DefaultValue: '0', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f21', Sequence: 21, Name: 'NotifyViaEmail', Type: 'bit', AllowsNull: false, DefaultValue: '0', AllowUpdateAPI: true, Status: 'Active' },
                    { ID: 'f22', Sequence: 22, Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultValue: 'getutcdate()', AllowUpdateAPI: false, Status: 'Active' },
                    { ID: 'f23', Sequence: 23, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultValue: 'getutcdate()', AllowUpdateAPI: false, Status: 'Active' },
                ],
            });

            type PlainRow = Record<string, string | number | boolean | Date | object | null | undefined>;
            const persistedStore = new Map<string, PlainRow>();
            let nextID = 0;
            let txChain: Promise<void> = Promise.resolve();

            // Dumb persistence provider with ZERO CAS logic in Save()
            const dumbSqlProvider = {
                ProviderType: ProviderType.Database,
                PlatformKey: 'sqlserver' as DatabasePlatform,
                SupportsEntityTransactions: true,
                ConfigData: { MJCoreSchemaName: '__mj' },
                QuoteIdentifier: (n: string) => `[${n}]`,
                QuoteSchemaAndView: (s: string, o: string) => `[${s}].[${o}]`,
                BuildParameterPlaceholder: (i: number) => `@p${i}`,
                BeginEntityTransaction: async (): Promise<EntityTransactionScope> => {
                    let release!: () => void;
                    const next = new Promise<void>((res) => { release = res; });
                    const prev = txChain;
                    txChain = txChain.then(() => next, () => next);
                    await prev;
                    return { IsNested: false, Commit: async () => { release(); }, Rollback: async () => { release(); } };
                },
                ExecuteSQL: async <T>(sql: string, params?: unknown[]): Promise<Array<T>> => {
                    if (sql.includes('sp_getapplock')) {
                        return [{ LockResult: 0 }] as unknown as Array<T>;
                    }
                    if (sql.includes('WITH (UPDLOCK, ROWLOCK)')) {
                        const id = String(params?.[0] ?? '');
                        const hit = persistedStore.get(id);
                        return (hit ? [{ ...hit }] : []) as unknown as Array<T>;
                    }
                    if (sql.includes('WITH (UPDLOCK, HOLDLOCK)')) {
                        const userId = String(params?.[0] ?? '').toLowerCase();
                        const targetId = String(params?.[1] ?? '').toLowerCase();
                        const matches = Array.from(persistedStore.values()).filter(
                            (r) =>
                                String(r['UserID'] ?? '').toLowerCase() === userId &&
                                r['RoutineType'] === 'AgentWake' &&
                                r['TargetType'] === 'Agent' &&
                                String(r['TargetID'] ?? '').toLowerCase() === targetId &&
                                r['Status'] === 'Active' &&
                                r['NextRunAt'] != null
                        );
                        return matches.map((r) => ({ ...r })) as unknown as Array<T>;
                    }
                    return [] as Array<T>;
                },
                Save: async (entity: BaseEntity, _user: UserInfo, _options: EntitySaveOptions): Promise<PlainRow> => {
                    await Promise.resolve();
                    const all = entity.GetAll() as PlainRow;
                    const id = typeof all['ID'] === 'string' && all['ID'].trim().length > 0
                        ? all['ID']
                        : `00000000-0000-0000-0000-${String(++nextID).padStart(12, '0')}`;
                    const prev = persistedStore.get(id);
                    const createdAt = (prev?.['__mj_CreatedAt'] as Date | undefined) ?? new Date(FIXED_NOW.getTime() + nextID);
                    const persisted: PlainRow = {
                        ...all,
                        ID: id,
                        __mj_CreatedAt: createdAt,
                        __mj_UpdatedAt: new Date(Date.now() + ++nextID),
                    };
                    persistedStore.set(id, persisted);
                    return { ...persisted };
                },
                GetEntityObject: vi.fn(async (entityName: string, user?: UserInfo) => {
                    if (entityName === 'MJ: Agent Channels') {
                        return new InMemoryAgentChannelEntity();
                    }
                    const fresh = new MJUserRoutineEntityServer(routineEntityInfo);
                    fresh.BindProvider(dumbSqlProvider as Partial<IEntityDataProvider> as IEntityDataProvider);
                    fresh.ContextCurrentUser = user ?? systemUser;
                    return fresh;
                }),
            };

            const hydrateServerEntity = async (row: PlainRow): Promise<MJUserRoutineEntityServer> => {
                const entity = new MJUserRoutineEntityServer(routineEntityInfo);
                entity.BindProvider(dumbSqlProvider as Partial<IEntityDataProvider> as IEntityDataProvider);
                entity.ContextCurrentUser = systemUser;
                await entity.LoadFromData({ ...row });
                return entity;
            };

            let initialReadsAtBarrier = 0;
            let releaseInitialBarrier!: () => void;
            const initialBarrier = new Promise<void>((res) => { releaseInitialBarrier = res; });

            const saveSpy = vi.spyOn(MJUserRoutineEntityServer.prototype, 'Save');

            runViewMock.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice',
                                AgentID: COS_AGENT_ID,
                                UserID: USER_ALICE_ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
                }
                if (params.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
                }
                if (params.EntityName === 'MJ: User Routines') {
                    if (persistedStore.size === 0 && initialReadsAtBarrier < 2) {
                        initialReadsAtBarrier++;
                        if (initialReadsAtBarrier === 2) {
                            releaseInitialBarrier();
                        }
                        await initialBarrier;
                    } else {
                        await Promise.resolve();
                    }
                    const hydrated = await Promise.all(
                        Array.from(persistedStore.values()).map((row) => hydrateServerEntity(row))
                    );
                    return { Success: true, Results: hydrated };
                }
                return { Success: true, Results: [] };
            });

            // Two independent service instances (distinct subclasses so BaseSingleton gives separate _wakeWriteChains)
            class ServerPodA extends AgentWakeTriggerService {}
            class ServerPodB extends AgentWakeTriggerService {}
            const serverInstanceA = new ServerPodA();
            const serverInstanceB = new ServerPodB();
            expect(serverInstanceA).not.toBe(serverInstanceB);

            // Fire all 20 events concurrently across both independent instances
            const results = await Promise.all(
                Array.from({ length: 20 }, (_, idx) => {
                    const i = idx + 1;
                    const instance = i % 2 === 1 ? serverInstanceA : serverInstanceB;
                    return instance.TriggerWakeForWorkstream({
                        targetUserID: USER_ALICE_ID,
                        targetAgentID: COS_AGENT_ID,
                        workstreamKey: `task:concurrent-${i}`,
                        applicationID: APP_TASKS_ID,
                        wakeReason: `Concurrent task #${i}`,
                        resumeState: {
                            triggerType: 'TaskAssigned',
                            taskID: `concurrent-${i}`,
                            subject: `Concurrent Task #${i}`,
                        },
                        contextUser: systemUser,
                        metadataProvider: dumbSqlProvider as Partial<IMetadataProvider> as IMetadataProvider,
                        now: new Date(FIXED_NOW.getTime() + i * 500),
                    });
                })
            );

            expect(results.every((r) => r.triggered && r.resultCode === 'WAKE_SCHEDULED')).toBe(true);
            expect(saveSpy).toHaveBeenCalled();
            const saveOutcomes = await Promise.all(saveSpy.mock.results.map((r) => r.value));
            expect(saveOutcomes.some((ok) => ok === false)).toBe(true);

            // Exactly 1 active pending routine remains; any cold-start duplicate rows were deactivated
            const activePending = Array.from(persistedStore.values()).filter(
                (r) => r['Status'] === 'Active' && r['NextRunAt'] != null
            );
            expect(activePending).toHaveLength(1);

            const parsedWakeConfig = JSON.parse(String(activePending[0]['WakeConfiguration'])) as MJUserRoutineEntity_IRoutineWakeConfiguration;
            const canonicalResume = parsedWakeConfig.resumeState as CoalescedWakeResumeState;
            const retainedTaskIDs = new Set((canonicalResume.pendingEvents ?? []).map((e) => e.taskID));
            expect(retainedTaskIDs.size).toBe(20);
            for (let i = 1; i <= 20; i++) {
                expect(retainedTaskIDs.has(`concurrent-${i}`)).toBe(true);
            }
            expect(canonicalResume.coalescedEventCount).toBe(20);
        });
    });

    describe('S2-AC-3: AIDP Deployment / Startup Guard', () => {
        it('suppresses all event-driven wakes during startup initialization and suppresses retroactive timestamps after ready', async () => {
            const { provider, saveCalls } = createInMemoryRoutineStore();
            runViewMock.mockResolvedValue({
                Success: true,
                Results: [
                    {
                        ID: 'pol-alice',
                        AgentID: COS_AGENT_ID,
                        UserID: USER_ALICE_ID,
                        Status: 'Active',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    },
                ],
            });

            const bootStartedAt = new Date('2026-11-22T11:58:00.000Z');
            WakeStartupGuard.Instance.BeginStartupInitialization('AIDP deployment sync', bootStartedAt);
            expect(WakeStartupGuard.Instance.IsStartupInProgress()).toBe(true);

            // During startup initialization, trigger returns SKIPPED_STARTUP_GUARD with zero routine writes
            const duringStartup = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:boot-1',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Boot side-effect',
                contextUser: systemUser,
                metadataProvider: provider,
                now: new Date('2026-11-22T11:58:30.000Z'),
            });
            expect(duringStartup.triggered).toBe(false);
            expect(duringStartup.resultCode).toBe('SKIPPED_STARTUP_GUARD');

            // Complete startup at 11:59:00Z -> records baseline watermark
            const readyAt = new Date('2026-11-22T11:59:00.000Z');
            WakeStartupGuard.Instance.CompleteStartupInitialization(readyAt);
            expect(WakeStartupGuard.Instance.IsStartupInProgress()).toBe(false);

            // Retroactive event dated BEFORE baseline watermark is suppressed
            const retroactive = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:retro-1',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Old pre-deploy event',
                eventTimestamp: new Date('2026-11-22T11:50:00.000Z'),
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(retroactive.triggered).toBe(false);
            expect(retroactive.resultCode).toBe('SKIPPED_STARTUP_GUARD');

            // Sync-origin event after ready is also suppressed
            const syncOrigin = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:sync-1',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Metadata sync hook',
                isStartupOrSyncOrigin: true,
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(syncOrigin.triggered).toBe(false);
            expect(syncOrigin.resultCode).toBe('SKIPPED_STARTUP_GUARD');
            expect(saveCalls).toHaveLength(0);

            // Legitimate post-startup event succeeds!
            runViewMock.mockImplementation(async (p: { EntityName: string }) => {
                if (p.EntityName === 'MJ: AI Agent User Policies') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'pol-alice',
                                AgentID: COS_AGENT_ID,
                                UserID: USER_ALICE_ID,
                                Status: 'Active',
                                AllowInterAgentCoordination: true,
                                EmailChannelMode: 'DraftOnly',
                                Agent: 'Chief of Staff',
                            },
                        ],
                    };
                }
                if (p.EntityName === 'MJ: Users') {
                    return { Success: true, Results: [{ ID: USER_ALICE_ID, IsActive: true }] };
                }
                if (p.EntityName === 'MJ: AI Agents') {
                    return { Success: true, Results: [{ ID: COS_AGENT_ID, Name: 'Chief of Staff', Status: 'Active' }] };
                }
                return { Success: true, Results: [] };
            });

            const legitimate = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:real-1',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Real post-startup assignment',
                eventTimestamp: FIXED_NOW,
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(legitimate.triggered).toBe(true);
            expect(legitimate.resultCode).toBe('WAKE_SCHEDULED');
            expect(saveCalls).toHaveLength(1);
        });

        it('suppresses wakes when AIDP_DEPLOYMENT_IN_PROGRESS env var is set', async () => {
            const { provider } = createInMemoryRoutineStore();
            process.env.AIDP_DEPLOYMENT_IN_PROGRESS = 'true';

            const res = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:deploy-env',
                wakeReason: 'Event during AIDP deploy env flag',
                contextUser: systemUser,
                metadataProvider: provider,
                now: FIXED_NOW,
            });
            expect(res.triggered).toBe(false);
            expect(res.resultCode).toBe('SKIPPED_STARTUP_GUARD');
        });
    });
});
