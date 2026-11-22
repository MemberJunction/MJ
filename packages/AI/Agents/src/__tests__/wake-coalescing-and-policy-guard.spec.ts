import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
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
    EventWakeCoalescer,
    WakeStartupGuard,
} from '../index';

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

const systemUser = {
    ID: SYSTEM_USER_ID,
    Name: 'System',
    Email: 'system@mj.local',
    Type: 'Owner',
    IsActive: true,
    UserRoles: [],
} as unknown as UserInfo;

const aliceUser = {
    ID: USER_ALICE_ID,
    Name: 'Alice',
    Email: 'alice@example.com',
    Type: 'User',
    IsActive: true,
    UserRoles: [],
} as unknown as UserInfo;

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
        RunView: {
            FromMetadataProvider: () => ({ RunView: runViewMock }),
        },
    };
});

interface MockRoutineRow {
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
    LastRunAt: Date | null;
    WakeConfiguration: string | null;
    WakeConfigurationObject: MJUserRoutineEntity_IRoutineWakeConfiguration | null;
    AgentConfigurationID: string | null;
    LatestResult: { CompleteMessage: string };
    NewRecord: () => void;
    Save: () => Promise<boolean>;
}

function createInMemoryRoutineStore() {
    const routinesByID = new Map<string, MockRoutineRow>();
    const saveCalls: MockRoutineRow[] = [];
    let seq = 0;

    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Agent Channels') {
                return {
                    ID: 'chan-guard-1',
                    Topic: 'Cross-org sync',
                    ChannelStatus: 'Open',
                    ConsecutiveAgentTurns: 0,
                    MaxConsecutiveAgentTurns: 5,
                    HourlyWakeCount: 0,
                    MaxHourlyWakes: 10,
                    HourlyWindowStartedAt: null,
                    Save: vi.fn().mockResolvedValue(true),
                    Load: vi.fn().mockResolvedValue(true),
                } as unknown as MJAgentChannelEntity;
            }
            const routine: MockRoutineRow = {
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
                LastRunAt: null,
                WakeConfiguration: null,
                WakeConfigurationObject: null,
                AgentConfigurationID: null,
                LatestResult: { CompleteMessage: '' },
                NewRecord: vi.fn(),
                Save: vi.fn(async () => {
                    routinesByID.set(routine.ID, routine);
                    saveCalls.push(routine);
                    return true;
                }),
            };
            return routine;
        }),
    } as unknown as IMetadataProvider;

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
                            { AgentChannelID: 'chan-guard-1', UserID: USER_ALICE_ID, AgentID: COS_AGENT_ID, Status: 'Active' },
                            { AgentChannelID: 'chan-guard-1', UserID: USER_BOB_ID, AgentID: COS_AGENT_ID, Status: 'Active' },
                        ] as unknown as MJAgentChannelParticipantEntity[],
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
            const approvalReq = {
                ID: 'req-1',
                AgentID: COS_AGENT_ID,
                RequestForUserID: USER_ALICE_ID,
                Status: 'Approved',
                Request: 'Send note',
                RespondedAt: FIXED_NOW,
                OriginatingAgentRunID: null,
                OriginatingTaskID: null,
                Comments: null,
            } as unknown as MJAIAgentRequestEntity;
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
            AgentUserPolicyEngine.Instance.SetCachedPolicy({
                ID: 'pol-paused',
                AgentID: COS_AGENT_ID,
                UserID: USER_ALICE_ID,
                Status: 'Paused',
                AllowInterAgentCoordination: true,
                EmailChannelMode: 'DraftOnly',
            } as unknown as MJAIAgentUserPolicyEntity);
            const mailboxPaused = await AgentWakeTriggerService.Instance.RouteInboundUtilityMailboxWake({
                toAddress: 'cos@company.com',
                fromAddress: 'alice@example.com',
                subject: 'Morning',
                bodyPreview: 'Checking in',
                identities: [
                    {
                        ID: 'id-mail-1',
                        AgentID: COS_AGENT_ID,
                        IdentityType: 'Email',
                        IdentityValue: 'cos@company.com',
                        IsActive: true,
                        Configuration: null,
                    } as unknown as MJAIBridgeAgentIdentityEntity,
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

            expect(saveCalls).toHaveLength(20);
            // All 20 assignments resolved onto the exact SAME routine ID and app workstream key
            expect(routinesByID.size).toBe(1);
            const singleRoutine = Array.from(routinesByID.values())[0];
            expect(singleRoutine.Status).toBe('Active');
            expect(singleRoutine.WakeConfigurationObject?.workstreamKey).toBe(expectedWorkstreamKey);

            const pending = singleRoutine.WakeConfigurationObject?.resumeState?.['pendingEvents'] as Array<Record<string, unknown>>;
            expect(pending).toHaveLength(20);
            expect(pending[0]['taskID']).toBe('task-1');
            expect(pending[19]['taskID']).toBe('task-20');

            const lastResult = taskResults[taskResults.length - 1];
            expect(lastResult.triggered).toBe(true);
            expect(lastResult.routineID).toBe(singleRoutine.ID);
            expect(lastResult.coalesced).toBe(true);
            expect(lastResult.coalescedCount).toBe(20);
            expect(lastResult.coalesceKey).toBe(expectedCoalesceKey);
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
            const resumeState = singleRoutine.WakeConfigurationObject?.resumeState as Record<string, unknown>;
            const pending = resumeState['pendingEvents'] as Array<Record<string, unknown>>;
            expect(pending).toHaveLength(25);
            expect(pending[24]['taskID']).toBe('burst-60');
            expect(resumeState['coalescedEventCount']).toBe(60);
            expect(resumeState['overflowEventCount']).toBe(35);
            expect(typeof resumeState['coalescedSummary']).toBe('string');
            expect(lastResult?.coalescedCount).toBe(60);
        });

        it('keeps separate applications distinct and defers post-dispatch bursts within the 60s window', async () => {
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
                wakeReason: 'Tasks app event',
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

            // Simulate App A routine being claimed/dispatched at T0+5s
            const dispatchedAt = new Date(FIXED_NOW.getTime() + 5_000);
            const routineA = routinesByID.get(resAppA.routineID!)!;
            routineA.Status = 'Disabled';
            routineA.NextRunAt = null;
            routineA.LastRunAt = dispatchedAt;
            EventWakeCoalescer.Instance.RecordWakeDispatched(USER_ALICE_ID, APP_TASKS_ID, dispatchedAt);

            // A new event for App A arriving at T0+15s (within 60s window of T0+5s) defers to T0+65s
            const followUpAt = new Date(FIXED_NOW.getTime() + 15_000);
            const expectedDeferredAt = new Date(dispatchedAt.getTime() + 60_000);
            const resFollowUp = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: USER_ALICE_ID,
                targetAgentID: COS_AGENT_ID,
                workstreamKey: 'task:a2',
                applicationID: APP_TASKS_ID,
                wakeReason: 'Second wave task',
                resumeState: { triggerType: 'TaskAssigned', taskID: 'a2' },
                contextUser: systemUser,
                metadataProvider: provider,
                now: followUpAt,
            });

            expect(resFollowUp.triggered).toBe(true);
            expect(resFollowUp.nextRunAtISO).toBe(expectedDeferredAt.toISOString());

            // Cleanup after window expires frees memory
            const cleaned = EventWakeCoalescer.Instance.CleanupExpiredEntries(
                new Date(FIXED_NOW.getTime() + 500_000)
            );
            expect(cleaned).toBeGreaterThanOrEqual(2);
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
