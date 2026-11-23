import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type {
    MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import type {
    MJScheduledJobEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
    MJUserRoutineRunEntity,
} from '@memberjunction/core-entities';

interface MockRunViewHandler {
    (params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<object>>;
}

const { runViewMock, agentRunInConvMock, agentRunMock, activeRunRows } = vi.hoisted(() => ({
    runViewMock: vi.fn<MockRunViewHandler>(),
    agentRunInConvMock: vi.fn(),
    agentRunMock: vi.fn(),
    activeRunRows: [] as Array<{ ID: string; Status: string }>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => <T>(target: T): T => target,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatusEx: vi.fn(),
        RunView: class MockRunView extends actual.RunView {
            public override RunView = runViewMock as actual.RunView['RunView'];
            public static override FromMetadataProvider(): MockRunView {
                return new MockRunView();
            }
        },
        Metadata: class MockMetadata extends actual.Metadata {
            public override async GetEntityObject<T extends actual.BaseEntity>(entityName: string): Promise<T> {
                if (entityName === 'MJ: AI Agents') {
                    const agentStub: Pick<MJAIAgentEntityExtended, 'ID' | 'Name' | 'Load'> = {
                        ID: 'AGENT-1',
                        Name: 'Chief of Staff',
                        Load: vi.fn(async () => true),
                    };
                    return agentStub as T;
                }
                const runRow: Partial<MJUserRoutineRunEntity> = {
                    ID: `URUN-${activeRunRows.length + 1}`,
                    RoutineID: '',
                    Status: 'Running',
                    StartedAt: new Date(),
                    CompletedAt: null,
                    ResultSummary: null,
                    ResultHash: null,
                    ErrorMessage: null,
                    AgentRunID: null,
                    PromptRunID: null,
                    ActionExecutionLogID: null,
                    NotificationSent: false,
                    NewRecord: vi.fn(() => true),
                    GetFieldByName: vi.fn(() => undefined),
                    Save: vi.fn(async () => true),
                };
                activeRunRows.push({ ID: runRow.ID ?? 'URUN', Status: runRow.Status ?? 'Running' });
                return runRow as T;
            }
        },
    };
});

vi.mock('@memberjunction/ai-agents', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-agents')>();
    return {
        ...actual,
        AgentRunner: class MockAgentRunner {
            public RunAgentInConversation = agentRunInConvMock;
            public RunAgent = agentRunMock;
        },
    };
});

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-prompts')>();
    return {
        ...actual,
        AIPromptRunner: class MockAIPromptRunner {},
    };
});

vi.mock('@memberjunction/actions', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/actions')>();
    return {
        ...actual,
        ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } },
    };
});

import { EntityInfo, UserInfo } from '@memberjunction/core';
import {
    AgentWakeTriggerService,
    BuildUserAppWakeKey,
    EventWakeCoalescer,
    ResolveAgentConfigurationIDInput,
    ResolveSeededRoutineAgentConfigurationID,
    WakeStartupGuard,
} from '@memberjunction/ai-agents';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';

const SYSTEM = new UserInfo(null, {
    ID: 'SYS-1',
    Name: 'System',
    Email: 'system@mj.local',
    Type: 'Owner',
    IsActive: true,
});
const PAST = new Date('2026-11-22T11:59:30.000Z');
const BASE_NOW = new Date('2026-11-22T12:00:00.000Z');

class InMemoryRoutineEntity {
    public ID: string;
    public Name: string;
    public Description: string | null = null;
    public UserID: string;
    public RoutineType: MJUserRoutineEntity['RoutineType'];
    public ScheduleMode: MJUserRoutineEntity['ScheduleMode'];
    public TargetType: MJUserRoutineEntity['TargetType'];
    public TargetID: string;
    public Status: MJUserRoutineEntity['Status'];
    public CronExpression: string | null = null;
    public Timezone: string | null = 'UTC';
    public InitialMessage: string | null = null;
    public NextRunAt: Date | null;
    public LastRunAt: Date | null = null;
    public LastCheckedAt: Date | null = null;
    public LastRunStatus: MJUserRoutineEntity['LastRunStatus'] = null;
    public LastResultHash: string | null = null;
    public NotifyCondition: MJUserRoutineEntity['NotifyCondition'] = 'Never';
    public NotifyViaInApp = false;
    public NotifyViaEmail = false;
    public StartingPayload: string | null;
    public WakeConfiguration: string | null;
    public WakeConfigurationObject: MJUserRoutineEntity_IRoutineWakeConfiguration | null;
    public AgentConfigurationID: string | null = null;
    public ConversationID: string | null = null;
    public RequestedSkillIDs: string | null = null;
    public LatestResult = { CompleteMessage: '' };
    private readonly onSave?: (routine: InMemoryRoutineEntity) => void;

    public constructor(
        overrides: Partial<InMemoryRoutineEntity> = {},
        onSave?: (routine: InMemoryRoutineEntity) => void
    ) {
        this.ID = overrides.ID ?? 'R-DEFAULT';
        this.Name = overrides.Name ?? 'Routine';
        this.UserID = overrides.UserID ?? 'U-1';
        this.RoutineType = overrides.RoutineType ?? 'AgentWake';
        this.ScheduleMode = overrides.ScheduleMode ?? 'OneShot';
        this.TargetType = overrides.TargetType ?? 'Agent';
        this.TargetID = overrides.TargetID ?? 'AGENT-1';
        this.Status = overrides.Status ?? 'Active';
        this.NextRunAt = overrides.NextRunAt !== undefined ? overrides.NextRunAt : PAST;
        this.LastRunAt = overrides.LastRunAt ?? null;
        this.StartingPayload = overrides.StartingPayload ?? JSON.stringify({ applicationID: 'app-tasks' });
        this.WakeConfigurationObject = overrides.WakeConfigurationObject ?? {
            workstreamKey: 'app:app-tasks',
            resumeState: { applicationID: 'app-tasks', pendingEvents: [{ taskID: 't-1' }] },
        };
        this.WakeConfiguration = overrides.WakeConfiguration ?? JSON.stringify(this.WakeConfigurationObject);
        this.AgentConfigurationID = overrides.AgentConfigurationID ?? null;
        this.onSave = onSave;
    }

    public NewRecord(): boolean {
        return true;
    }

    public async Load(id: string): Promise<boolean> {
        return id === this.ID;
    }

    public async Save(): Promise<boolean> {
        if (this.WakeConfigurationObject) {
            this.WakeConfiguration = JSON.stringify(this.WakeConfigurationObject);
        }
        this.onSave?.(this);
        return true;
    }
}

function makeRoutine(overrides: Partial<InMemoryRoutineEntity> = {}): MJUserRoutineEntity {
    return new InMemoryRoutineEntity(overrides) as Partial<MJUserRoutineEntity> as MJUserRoutineEntity;
}

describe('UserRoutineDispatcherDriver — Active Policy Gating, Coalescing Recovery & Startup Guard', () => {
    let driver: UserRoutineDispatcherDriver;
    const globalRef = globalThis as {
        ___SINGLETON__UserCache?: {
            Users: UserInfo[];
            FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
            GetSystemUser?(): UserInfo | undefined;
        };
    };
    let prevCache: typeof globalRef.___SINGLETON__UserCache;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(BASE_NOW);
        activeRunRows.length = 0;
        WakeStartupGuard.Instance.Reset();
        EventWakeCoalescer.Instance.Reset();
        UserRoutineDispatcherDriver.ClearOwnerResolveFailures();
        prevCache = globalRef.___SINGLETON__UserCache;
        const users = [
            new UserInfo(null, { ID: 'U-ACTIVE', IsActive: true, Name: 'Active User', Email: 'a@test.com', Type: 'User' }),
            new UserInfo(null, { ID: 'U-ACTIVE-2', IsActive: true, Name: 'Active User 2', Email: 'a2@test.com', Type: 'User' }),
            new UserInfo(null, { ID: 'U-PAUSED', IsActive: true, Name: 'Paused User', Email: 'p@test.com', Type: 'User' }),
            new UserInfo(null, { ID: 'U-NONE', IsActive: true, Name: 'No Policy User', Email: 'n@test.com', Type: 'User' }),
        ];
        globalRef.___SINGLETON__UserCache = {
            Users: users,
            FindUser: async ({ ID, Email }) =>
                users.find((u) => (ID && u.ID === ID) || (Email && u.Email.toLowerCase() === Email.toLowerCase())),
            GetSystemUser: () => SYSTEM,
        };
        driver = new UserRoutineDispatcherDriver();
        agentRunInConvMock.mockResolvedValue({
            agentResult: {
                success: true,
                agentRun: { ID: 'ARUN-1', Message: 'Done' },
                payload: { ok: true },
            },
        });
        agentRunMock.mockResolvedValue({
            success: true,
            agentRun: { ID: 'ARUN-1', Message: 'Done' },
            payload: { ok: true },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        globalRef.___SINGLETON__UserCache = prevCache;
        WakeStartupGuard.Instance.Reset();
        EventWakeCoalescer.Instance.Reset();
    });

    function buildContext(configuration: string = '{}'): ScheduledJobExecutionContext {
        const schedule: Pick<MJScheduledJobEntity, 'ID' | 'Name' | 'Configuration'> = {
            ID: 'SCHED-1',
            Name: 'User Routine Dispatcher',
            Configuration: configuration,
        };
        return {
            Schedule: schedule as MJScheduledJobEntity,
            Run: { ID: 'JRUN-1' },
            ContextUser: SYSTEM,
        } as ScheduledJobExecutionContext;
    }

    it('batch-checks MJ: AI Agent User Policies via ResultType: "simple" and executes ONLY active-policy users', async () => {
        const activeRoutine = makeRoutine({ ID: 'R-ACTIVE', UserID: 'U-ACTIVE', Name: 'Active Wake' });
        const pausedRoutine = makeRoutine({ ID: 'R-PAUSED', UserID: 'U-PAUSED', Name: 'Paused Wake' });
        const noPolicyRoutine = makeRoutine({ ID: 'R-NONE', UserID: 'U-NONE', Name: 'Unonboarded Wake' });

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [activeRoutine, pausedRoutine, noPolicyRoutine], TotalRowCount: 3, RowCount: 3, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                expect(params.ResultType).toBe('simple');
                const filter = params.ExtraFilter ?? '';
                const rows = [];
                if (filter.includes('U-ACTIVE')) {
                    rows.push({
                        ID: 'POL-ACTIVE',
                        AgentID: 'AGENT-1',
                        UserID: 'U-ACTIVE',
                        Status: 'Active',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    });
                }
                if (filter.includes('U-PAUSED')) {
                    rows.push({
                        ID: 'POL-PAUSED',
                        AgentID: 'AGENT-1',
                        UserID: 'U-PAUSED',
                        Status: 'Paused',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    });
                }
                return { Success: true, Results: rows, TotalRowCount: rows.length, RowCount: rows.length, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const result = await driver.Execute(buildContext());

        expect(result.Success).toBe(true);
        expect(result.Details?.RoutinesEvaluated).toBe(3);
        expect(result.Details?.RoutinesRun).toBe(1);
        expect(agentRunMock).toHaveBeenCalledTimes(1);
        expect(agentRunMock.mock.calls[0][0].contextUser.ID).toBe('U-ACTIVE');

        // First policy query is a single batched RunView across all 3 routines' policies (no N+1 at sweep start)
        const policyQueries = runViewMock.mock.calls.filter(
            (c) => c[0].EntityName === 'MJ: AI Agent User Policies'
        );
        expect(policyQueries.length).toBeGreaterThanOrEqual(1);
        expect(policyQueries[0][0].ExtraFilter).toContain('U-ACTIVE');
        expect(policyQueries[0][0].ExtraFilter).toContain('U-PAUSED');
        expect(policyQueries[0][0].ExtraFilter).toContain('U-NONE');
    });

    it('revalidates policy before queued execution starts: deactivating user 2 policy while routine 1 blocks yields 0 runs for user 2 (CR-3)', async () => {
        const routine1 = makeRoutine({ ID: 'R-USER-1', UserID: 'U-ACTIVE', Name: 'User 1 Wake' });
        const routine2 = makeRoutine({ ID: 'R-USER-2', UserID: 'U-ACTIVE-2', Name: 'User 2 Wake' });

        let user2PolicyStatus: 'Active' | 'Paused' = 'Active';
        let releaseRoutine1!: () => void;
        let markRoutine1Started!: () => void;
        const routine1Started = new Promise<void>((resolve) => {
            markRoutine1Started = resolve;
        });
        const routine1Gate = new Promise<void>((resolve) => {
            releaseRoutine1 = resolve;
        });

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [routine1, routine2], TotalRowCount: 2, RowCount: 2, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                const filter = params.ExtraFilter ?? '';
                const rows = [];
                if (filter.includes('U-ACTIVE\'')) {
                    rows.push({
                        ID: 'POL-1',
                        AgentID: 'AGENT-1',
                        UserID: 'U-ACTIVE',
                        Status: 'Active',
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    });
                }
                if (filter.includes('U-ACTIVE-2')) {
                    rows.push({
                        ID: 'POL-2',
                        AgentID: 'AGENT-1',
                        UserID: 'U-ACTIVE-2',
                        Status: user2PolicyStatus,
                        AllowInterAgentCoordination: true,
                        EmailChannelMode: 'DraftOnly',
                        Agent: 'Chief of Staff',
                    });
                }
                return { Success: true, Results: rows, TotalRowCount: rows.length, RowCount: rows.length, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        agentRunMock.mockImplementation(async (params: { contextUser: UserInfo }) => {
            if (params.contextUser.ID === 'U-ACTIVE') {
                markRoutine1Started();
                await routine1Gate;
            }
            return {
                success: true,
                agentRun: { ID: `ARUN-${params.contextUser.ID}`, Message: 'Completed' },
                payload: { ok: true },
            };
        });

        const sweepPromise = driver.Execute(buildContext(JSON.stringify({ MaxConcurrentRoutines: 1 })));
        await routine1Started;

        // While routine 1 is executing and routine 2 waits in the concurrency queue, pause user 2's policy
        user2PolicyStatus = 'Paused';
        releaseRoutine1();

        const sweepResult = await sweepPromise;
        expect(sweepResult.Success).toBe(true);
        expect(sweepResult.Details?.RoutinesRun).toBe(1);
        expect(sweepResult.Details?.Succeeded).toBe(1);
        // Only U-ACTIVE executed; U-ACTIVE-2 was aborted on slot entry with 0 target runs
        expect(agentRunMock).toHaveBeenCalledTimes(1);
        expect(agentRunMock.mock.calls[0][0].contextUser.ID).toBe('U-ACTIVE');
    });

    it('blocks queued wakes when a policy was deactivated after enqueueing or when RunView fails (fail-closed)', async () => {
        const queuedRoutine = makeRoutine({ ID: 'R-DEACTIVATED', UserID: 'U-ACTIVE', Name: 'Queued Wake' });

        // First: policy lookup returns Disabled -> zero runs
        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [queuedRoutine], TotalRowCount: 1, RowCount: 1, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-DISABLED',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Disabled',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const disabledRes = await driver.Execute(buildContext());
        expect(disabledRes.Details?.RoutinesRun).toBe(0);

        // Second: RunView fails for policy check -> fail-closed zero runs
        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [queuedRoutine], TotalRowCount: 1, RowCount: 1, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return { Success: false, ErrorMessage: 'DB unavailable', Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0 };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const errorRes = await driver.Execute(buildContext());
        expect(errorRes.Details?.RoutinesRun).toBe(0);

        // Third: direct RunRoutineNow also enforces live policy check
        const runNowSummary = await driver.RunRoutineNow(queuedRoutine, SYSTEM);
        expect(runNowSummary.RunStatus).toBe('Skipped');
    });

    it('suppresses sweeps while WakeStartupGuard is initializing, then recovers pre-existing pending coalesced wakes once ready', async () => {
        const pendingCoalescedRoutine = makeRoutine({
            ID: 'R-RECOVER',
            UserID: 'U-ACTIVE',
            Name: 'Recovered Coalesced Wake',
        });

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [pendingCoalescedRoutine], TotalRowCount: 1, RowCount: 1, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-ACTIVE',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        // During AIDP startup initialization, Execute returns early with zero DB reads or runs
        WakeStartupGuard.Instance.BeginStartupInitialization('AIDP Rolling Deploy');
        const duringBoot = await driver.Execute(buildContext());
        expect(duringBoot.Success).toBe(true);
        expect(duringBoot.Details?.RoutinesRun).toBe(0);
        expect(duringBoot.Details?.StartupSuppressed).toBe(true);
        expect(runViewMock).not.toHaveBeenCalled();

        // Once server reaches Ready state, pre-existing pending coalesced wake runs cleanly
        WakeStartupGuard.Instance.CompleteStartupInitialization();

        const afterReady = await driver.Execute(buildContext());
        expect(afterReady.Details?.RoutinesRun).toBe(1);
        expect(afterReady.Details?.Succeeded).toBe(1);
        // Dispatch window was recorded on EventWakeCoalescer for the recovered app wake
        const windowEntry = EventWakeCoalescer.Instance.GetWindowEntry('U-ACTIVE', 'app-tasks');
        expect(windowEntry?.LastDispatchedAtMs).not.toBeNull();
    });

    it('executes exactly ONE wake for 20 burst events even with interleaved dispatcher sweeps, then starts a fresh batch during cooldown (CR-1 & CR-2)', async () => {
        const routinesByID = new Map<string, InMemoryRoutineEntity>();
        let seq = 0;

        const provider = {
            GetEntityObject: vi.fn(async () => {
                const routine = new InMemoryRoutineEntity(
                    { ID: `R-BURST-${++seq}`, NextRunAt: null },
                    (saved) => {
                        routinesByID.set(saved.ID, saved);
                    }
                );
                return routine;
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return {
                    Success: true,
                    Results: Array.from(routinesByID.values()),
                    TotalRowCount: routinesByID.size,
                    RowCount: routinesByID.size,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-ACTIVE',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: Users') {
                return { Success: true, Results: [{ ID: 'U-ACTIVE', IsActive: true }], TotalRowCount: 1, RowCount: 1, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agents') {
                return { Success: true, Results: [{ ID: 'AGENT-1', Name: 'Chief of Staff' }], TotalRowCount: 1, RowCount: 1, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        // Interleave 20 events over 47.5 seconds with dispatcher sweeps every 4 events
        for (let i = 1; i <= 20; i++) {
            const eventAt = new Date(BASE_NOW.getTime() + (i - 1) * 2_500);
            vi.setSystemTime(eventAt);
            await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: 'U-ACTIVE',
                targetAgentID: 'AGENT-1',
                workstreamKey: `task:burst-${i}`,
                applicationID: 'app-tasks',
                wakeReason: `Assigned task #${i}`,
                resumeState: { triggerType: 'TaskAssigned', taskID: `burst-${i}` },
                contextUser: SYSTEM,
                metadataProvider: provider,
                now: eventAt,
            });
            if (i % 4 === 0) {
                await driver.Execute(buildContext());
            }
        }

        // During the 60s collection window, ZERO wakes executed despite 5 interleaved sweeps
        expect(agentRunMock).toHaveBeenCalledTimes(0);

        // Advance past the 60s window deadline (BASE_NOW + 61s) and sweep once
        vi.setSystemTime(new Date(BASE_NOW.getTime() + 61_000));
        const finalSweep = await driver.Execute(buildContext());
        expect(finalSweep.Details?.RoutinesRun).toBe(1);
        expect(agentRunMock).toHaveBeenCalledTimes(1);

        const wakePayload = agentRunMock.mock.calls[0][0].payload as {
            _wakeContext?: { resumeState?: { pendingEvents?: Array<{ taskID?: string }> } };
        };
        const deliveredIDs = wakePayload._wakeContext?.resumeState?.pendingEvents?.map((e) => e.taskID) ?? [];
        expect(deliveredIDs).toHaveLength(20);
        expect(deliveredIDs[0]).toBe('burst-1');
        expect(deliveredIDs[19]).toBe('burst-20');

        // Trigger event B during cooldown (BASE_NOW + 75s) -> deferred to BASE_NOW + 121s, batch contains ONLY B
        const eventBAt = new Date(BASE_NOW.getTime() + 75_000);
        vi.setSystemTime(eventBAt);
        const resB = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
            targetUserID: 'U-ACTIVE',
            targetAgentID: 'AGENT-1',
            workstreamKey: 'task:follow-up-B',
            applicationID: 'app-tasks',
            wakeReason: 'Follow-up task B',
            resumeState: { triggerType: 'TaskAssigned', taskID: 'follow-up-B' },
            contextUser: SYSTEM,
            metadataProvider: provider,
            now: eventBAt,
        });
        expect(resB.triggered).toBe(true);
        expect(resB.coalescedCount).toBe(1);

        const singleRoutine = Array.from(routinesByID.values())[0];
        expect(singleRoutine.WakeConfigurationObject?.resumeState?.['coalescedEventCount']).toBe(1);
        expect(singleRoutine.WakeConfigurationObject?.resumeState?.['pendingEvents']).toHaveLength(1);
    });

    it('releases and restores a one-shot claim when slot-entry policy recheck hits a transient lookup error, then succeeds on next sweep (CR-POLICY-RECHECK-LOSES-CLAIM)', async () => {
        const scheduledAt = new Date(PAST.getTime());
        const oneShotRoutine = makeRoutine({
            ID: 'R-TRANSIENT-CLAIM',
            UserID: 'U-ACTIVE',
            Name: 'Transient Policy Recheck Wake',
            ScheduleMode: 'OneShot',
            Status: 'Active',
            NextRunAt: scheduledAt,
            WakeConfigurationObject: {
                workstreamKey: 'app:app-tasks',
                resumeState: {
                    applicationID: 'app-tasks',
                    pendingEvents: [
                        { triggerType: 'TaskAssigned', taskID: 't-keep-1' },
                        { triggerType: 'TaskAssigned', taskID: 't-keep-2' },
                    ],
                },
            },
        });

        let policyQueryCount = 0;
        let transientFailureActive = true;

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return {
                    Success: true,
                    Results: oneShotRoutine.Status === 'Active' ? [oneShotRoutine] : [],
                    TotalRowCount: oneShotRoutine.Status === 'Active' ? 1 : 0,
                    RowCount: oneShotRoutine.Status === 'Active' ? 1 : 0,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                policyQueryCount++;
                // First call is the sweep batch check (succeeds so claimRoutine runs and nulls NextRunAt).
                // Second call is the slot-entry recheck (fails transiently with DB error).
                if (transientFailureActive && policyQueryCount === 2) {
                    return {
                        Success: false,
                        ErrorMessage: 'Transient SQL timeout on slot-entry policy recheck',
                        Results: [],
                        TotalRowCount: 0,
                        RowCount: 0,
                        UserViewID: '',
                        ExecutionTime: 0,
                    };
                }
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-ACTIVE',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const firstSweep = await driver.Execute(buildContext());
        expect(firstSweep.Success).toBe(true);
        expect(firstSweep.Details?.RoutinesRun).toBe(0);
        expect(agentRunMock).toHaveBeenCalledTimes(0);

        // Claim must be released/restored so routine is NOT orphaned with NextRunAt=null
        expect(oneShotRoutine.Status).toBe('Active');
        expect(oneShotRoutine.NextRunAt?.toISOString()).toBe(scheduledAt.toISOString());
        expect(oneShotRoutine.WakeConfigurationObject?.resumeState?.['pendingEvents']).toHaveLength(2);

        // Next sweep after DB recovery executes the restored routine with all pending events intact
        transientFailureActive = false;
        const recoverySweep = await driver.Execute(buildContext());
        expect(recoverySweep.Success).toBe(true);
        expect(recoverySweep.Details?.RoutinesRun).toBe(1);
        expect(recoverySweep.Details?.Succeeded).toBe(1);
        expect(agentRunMock).toHaveBeenCalledTimes(1);

        const wakePayload = agentRunMock.mock.calls[0][0].payload as {
            _wakeContext?: { resumeState?: { pendingEvents?: Array<{ taskID?: string }> } };
        };
        expect(wakePayload._wakeContext?.resumeState?.pendingEvents?.map((e) => e.taskID)).toEqual([
            't-keep-1',
            't-keep-2',
        ]);
    });

    it('cleanly disables a claimed one-shot routine when slot-entry recheck detects genuine policy deactivation (CR-POLICY-RECHECK-LOSES-CLAIM)', async () => {
        const queuedRoutine = makeRoutine({
            ID: 'R-GENUINE-PAUSE',
            UserID: 'U-ACTIVE',
            Name: 'Genuine Policy Deactivation Wake',
            ScheduleMode: 'OneShot',
            Status: 'Active',
            NextRunAt: PAST,
        });

        let policyCall = 0;
        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [queuedRoutine], TotalRowCount: 1, RowCount: 1, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                policyCall++;
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-ACTIVE',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: policyCall === 1 ? 'Active' : 'Paused',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const sweep = await driver.Execute(buildContext());
        expect(sweep.Details?.RoutinesRun).toBe(0);
        expect(agentRunMock).toHaveBeenCalledTimes(0);
        expect(queuedRoutine.Status).toBe('Disabled');
        expect(queuedRoutine.LastRunStatus).toBe('Skipped');
        expect(queuedRoutine.NextRunAt).toBeNull();
    });

    it('coalesces duplicate pending bucket routines for the same (UserID, ApplicationID) during a dispatcher sweep into ONE execution (CR-COALESCE-ATOMICITY)', async () => {
        const dupRoutine1 = makeRoutine({
            ID: '00000000-0000-0000-0000-000000000001',
            UserID: 'U-ACTIVE',
            Name: 'Chief of Staff — Wake (app:app-tasks)',
            NextRunAt: PAST,
            WakeConfigurationObject: {
                workstreamKey: 'app:app-tasks',
                resumeState: {
                    applicationID: 'app-tasks',
                    coalesceRevision: 1,
                    coalescedEventCount: 1,
                    pendingEvents: [{ triggerType: 'TaskAssigned', taskID: 'dup-1' }],
                },
            },
        });
        const dupRoutine2 = makeRoutine({
            ID: '00000000-0000-0000-0000-000000000002',
            UserID: 'U-ACTIVE',
            Name: 'Chief of Staff — Wake (app:app-tasks)',
            NextRunAt: PAST,
            WakeConfigurationObject: {
                workstreamKey: 'app:app-tasks',
                resumeState: {
                    applicationID: 'app-tasks',
                    coalesceRevision: 1,
                    coalescedEventCount: 1,
                    pendingEvents: [{ triggerType: 'TaskAssigned', taskID: 'dup-2' }],
                },
            },
        });

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return {
                    Success: true,
                    Results: [dupRoutine2, dupRoutine1],
                    TotalRowCount: 2,
                    RowCount: 2,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-ACTIVE',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const sweep = await driver.Execute(buildContext());
        expect(sweep.Success).toBe(true);
        expect(sweep.Details?.RoutinesRun).toBe(1);
        expect(agentRunMock).toHaveBeenCalledTimes(1);
        expect(dupRoutine2.Status).toBe('Disabled');
        expect(dupRoutine2.NextRunAt).toBeNull();

        const wakePayload = agentRunMock.mock.calls[0][0].payload as {
            _wakeContext?: { resumeState?: { pendingEvents?: Array<{ taskID?: string }> } };
        };
        expect(wakePayload._wakeContext?.resumeState?.pendingEvents?.map((e) => e.taskID)).toEqual([
            'dup-1',
            'dup-2',
        ]);
    });

    it('AT-1 (dispatcher boundary): Two users on the same rhythm (Draft vs High) execute AgentRunner with their respective tier configurationId', async () => {
        const fastConfigID = '3A1C5A15-8DAA-44E5-A098-F20085E6C93F';
        const highPowerConfigID = 'B6B9D780-52B2-431B-93AB-AC83FEF78553';
        const dailyCalTemplateID = 'F0294D16-F2B7-4DA2-897F-B9FB27FD5BF5';

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: AI Configurations' && params.ExtraFilter?.includes("Name='High Power'")) {
                return {
                    Success: true,
                    Results: [{ ID: highPowerConfigID, Name: 'High Power', Status: 'Active' }],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const highTierInput = await ResolveAgentConfigurationIDInput({
            modelTier: 'High',
            contextUser: SYSTEM,
        });
        expect(highTierInput).toEqual({ Provided: true, ConfigurationID: highPowerConfigID });

        // User 1 uses template default (Draft -> Fast, AgentConfigurationID = null falling back to template)
        const aliceRoutine = makeRoutine({
            ID: 'R-TIER-ALICE',
            UserID: 'U-ACTIVE',
            TargetID: 'AGENT-1',
            RoutineType: 'Scheduled',
            ScheduleMode: 'OneShot',
            NextRunAt: PAST,
            AgentConfigurationID: null,
            WakeConfigurationObject: {
                workstreamKey: 'calendar-daily-review',
                resumeState: { rhythmTemplateID: dailyCalTemplateID },
            },
        });

        // User 2 customizes the same rhythm to High (High Power)
        const bobRoutine = makeRoutine({
            ID: 'R-TIER-BOB',
            UserID: 'U-ACTIVE-2',
            TargetID: 'AGENT-1',
            RoutineType: 'Scheduled',
            ScheduleMode: 'OneShot',
            NextRunAt: PAST,
            AgentConfigurationID: ResolveSeededRoutineAgentConfigurationID({
                explicitAgentConfigurationID: highTierInput.ConfigurationID,
                templateDefaultAgentConfigurationID: fastConfigID,
            }),
            WakeConfigurationObject: {
                workstreamKey: 'calendar-daily-review',
                resumeState: { rhythmTemplateID: dailyCalTemplateID },
            },
        });

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: User Routines') {
                return {
                    Success: true,
                    Results: [aliceRoutine, bobRoutine],
                    TotalRowCount: 2,
                    RowCount: 2,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-A',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                        {
                            ID: 'POL-B',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE-2',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 2,
                    RowCount: 2,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: AI Agent Rhythm Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: dailyCalTemplateID,
                            AgentID: 'AGENT-1',
                            WorkstreamKey: 'calendar-daily-review',
                            DefaultAgentConfigurationID: fastConfigID,
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        const sweep = await driver.Execute(buildContext());
        expect(sweep.Success).toBe(true);
        expect(sweep.Details?.RoutinesRun).toBe(2);
        expect(agentRunMock).toHaveBeenCalledTimes(2);

        const capturedConfigs = agentRunMock.mock.calls.map((call) => ({
            userId: (call[0] as { contextUser: UserInfo; configurationId?: string }).contextUser.ID,
            configurationId: (call[0] as { contextUser: UserInfo; configurationId?: string }).configurationId,
        }));
        expect(capturedConfigs).toEqual(
            expect.arrayContaining([
                { userId: 'U-ACTIVE', configurationId: fastConfigID },
                { userId: 'U-ACTIVE-2', configurationId: highPowerConfigID },
            ])
        );
    });

    it('AT-2 (dispatcher boundary): Assigning 20 tasks within one minute with interleaved dispatcher sweeps executes ONE wake with all 20 events', async () => {
        const routinesByID = new Map<string, MJUserRoutineEntity>();
        let seq = 0;

        const provider = {
            GetEntityObject: vi.fn(async () => {
                const routine = makeRoutine({
                    ID: `R-BURST-${++seq}`,
                    UserID: 'U-ACTIVE',
                    TargetID: 'AGENT-1',
                    RoutineType: 'AgentWake',
                    ScheduleMode: 'OneShot',
                });
                const origSave = routine.Save.bind(routine);
                routine.Save = async () => {
                    const ok = await origSave();
                    if (ok) {
                        routinesByID.set(routine.ID, routine);
                    }
                    return ok;
                };
                return routine;
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;

        runViewMock.mockImplementation(async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'POL-A',
                            AgentID: 'AGENT-1',
                            UserID: 'U-ACTIVE',
                            Status: 'Active',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: Users') {
                return {
                    Success: true,
                    Results: [{ ID: 'U-ACTIVE', IsActive: true }],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: AI Agents') {
                return {
                    Success: true,
                    Results: [{ ID: 'AGENT-1', Name: 'Chief of Staff', Status: 'Active' }],
                    TotalRowCount: 1,
                    RowCount: 1,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            if (params.EntityName === 'MJ: User Routines') {
                const allRoutines = Array.from(routinesByID.values());
                return {
                    Success: true,
                    Results: allRoutines,
                    TotalRowCount: allRoutines.length,
                    RowCount: allRoutines.length,
                    UserViewID: '',
                    ExecutionTime: 0,
                    ErrorMessage: '',
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0, RowCount: 0, UserViewID: '', ExecutionTime: 0, ErrorMessage: '' };
        });

        for (let i = 1; i <= 20; i++) {
            const eventAt = new Date(BASE_NOW.getTime() + (i - 1) * 2_500);
            vi.setSystemTime(eventAt);
            const triggerResult = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: 'U-ACTIVE',
                targetAgentID: 'AGENT-1',
                workstreamKey: `task:epic3-${i}`,
                applicationID: 'app-tasks',
                wakeReason: `Assigned task #${i}`,
                resumeState: {
                    triggerType: 'TaskAssigned',
                    taskID: `epic3-${i}`,
                    subject: `Task #${i}`,
                },
                contextUser: SYSTEM,
                metadataProvider: provider,
                now: eventAt,
            });
            expect(triggerResult.triggered).toBe(true);
            if (i % 4 === 0) {
                await driver.Execute(buildContext());
            }
        }

        expect(routinesByID.size).toBe(1);
        expect(agentRunMock).toHaveBeenCalledTimes(0);

        const singleRoutine = Array.from(routinesByID.values())[0];
        const resumeState = singleRoutine.WakeConfigurationObject?.resumeState as {
            coalesceKey?: string;
            pendingEvents?: Array<{ taskID?: string }>;
        } | undefined;
        expect(resumeState?.coalesceKey).toBe(BuildUserAppWakeKey('U-ACTIVE', 'app-tasks'));
        expect(resumeState?.pendingEvents).toHaveLength(20);

        // Advance past 60s collection window -> dispatcher executes ONE wake with all 20 events
        vi.setSystemTime(new Date(BASE_NOW.getTime() + 61_000));
        const finalSweep = await driver.Execute(buildContext());
        expect(finalSweep.Success).toBe(true);
        expect(finalSweep.Details?.RoutinesRun).toBe(1);
        expect(agentRunMock).toHaveBeenCalledTimes(1);

        const deliveredPayload = agentRunMock.mock.calls[0][0].payload as {
            _wakeContext?: { resumeState?: { pendingEvents?: Array<{ taskID?: string }> } };
        };
        const deliveredEvents = deliveredPayload._wakeContext?.resumeState?.pendingEvents ?? [];
        expect(deliveredEvents).toHaveLength(20);
        expect(deliveredEvents[0].taskID).toBe('epic3-1');
        expect(deliveredEvents[19].taskID).toBe('epic3-20');
    });
});
