import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runViewMock, agentRunInConvMock } = vi.hoisted(() => ({
    runViewMock: vi.fn(),
    agentRunInConvMock: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal() as Record<string, unknown>),
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatusEx: vi.fn(),
        RunView: class MockRunView {
            public RunView(...args: unknown[]): Promise<unknown> {
                return runViewMock(...args);
            }
            public static FromMetadataProvider(): MockRunView {
                return new MockRunView();
            }
        },
        Metadata: class {
            public Provider = {};
            public GetEntityObject = vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'AGENT-1', Name: 'Chief of Staff', Load: vi.fn(async () => true) };
                }
                return {
                    ID: 'NEW-ID',
                    NewRecord: vi.fn(),
                    Save: vi.fn(async () => true),
                    GetFieldByName: vi.fn(() => ({ OldValue: 'Running' })),
                };
            });
        },
    };
});

vi.mock('@memberjunction/ai-agents', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-agents')>()),
    AgentRunner: class {
        public RunAgentInConversation = agentRunInConvMock;
        public RunAgent = vi.fn();
    },
}));

vi.mock('@memberjunction/ai-prompts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-prompts')>()),
    AIPromptRunner: class {},
}));
vi.mock('@memberjunction/actions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/actions')>()),
    ActionEngineServer: { Instance: { Config: vi.fn(), RunAction: vi.fn() } },
}));

import { UserInfo } from '@memberjunction/core';
import type { MJScheduledJobEntity, MJUserRoutineEntity } from '@memberjunction/core-entities';
import { EventWakeCoalescer, WakeStartupGuard } from '@memberjunction/ai-agents';
import { UserRoutineDispatcherDriver } from '../drivers/UserRoutineDispatcherDriver';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';

const SYSTEM = { ID: 'SYS-1', Name: 'System', Type: 'Owner', IsActive: true } as unknown as UserInfo;
const PAST = new Date(Date.now() - 30_000);

function makeRoutine(overrides: Record<string, unknown>): MJUserRoutineEntity {
    const routine: Record<string, unknown> = {
        ID: 'R-DEFAULT',
        Name: 'Routine',
        UserID: 'U-1',
        RoutineType: 'AgentWake',
        ScheduleMode: 'OneShot',
        TargetType: 'Agent',
        TargetID: 'AGENT-1',
        Status: 'Active',
        NextRunAt: PAST,
        LastRunAt: null,
        LastRunStatus: null,
        LastResultHash: null,
        NotifyViaInApp: false,
        NotifyViaEmail: false,
        StartingPayload: JSON.stringify({ applicationID: 'app-tasks' }),
        WakeConfiguration: JSON.stringify({
            workstreamKey: 'app:app-tasks',
            resumeState: { applicationID: 'app-tasks', pendingEvents: [{ taskID: 't-1' }] },
        }),
        WakeConfigurationObject: {
            workstreamKey: 'app:app-tasks',
            resumeState: { applicationID: 'app-tasks', pendingEvents: [{ taskID: 't-1' }] },
        },
        Load: vi.fn(async () => true),
        Save: vi.fn(async () => true),
        ...overrides,
    };
    return routine as unknown as MJUserRoutineEntity;
}

describe('UserRoutineDispatcherDriver — Active Policy Gating, Coalescing Recovery & Startup Guard', () => {
    let driver: UserRoutineDispatcherDriver;
    const globalRef = globalThis as {
        ___SINGLETON__UserCache?: {
            Users: Array<{ ID: string; IsActive?: boolean }>;
            FindUser(criteria: { ID?: string }): Promise<{ ID: string; IsActive?: boolean } | undefined>;
        };
    };
    let prevCache: typeof globalRef.___SINGLETON__UserCache;

    beforeEach(() => {
        vi.clearAllMocks();
        WakeStartupGuard.Instance.Reset();
        EventWakeCoalescer.Instance.Reset();
        UserRoutineDispatcherDriver.ClearOwnerResolveFailures();
        prevCache = globalRef.___SINGLETON__UserCache;
        const users = [
            { ID: 'U-ACTIVE', IsActive: true, Name: 'Active User', Email: 'a@test.com', Type: 'User' },
            { ID: 'U-PAUSED', IsActive: true, Name: 'Paused User', Email: 'p@test.com', Type: 'User' },
            { ID: 'U-NONE', IsActive: true, Name: 'No Policy User', Email: 'n@test.com', Type: 'User' },
        ];
        globalRef.___SINGLETON__UserCache = {
            Users: users,
            FindUser: async ({ ID }) => users.find((u) => u.ID === ID),
        };
        driver = new UserRoutineDispatcherDriver();
        agentRunInConvMock.mockResolvedValue({
            success: true,
            agentRun: { ID: 'ARUN-1' },
            payload: { ok: true },
        });
    });

    afterEach(() => {
        globalRef.___SINGLETON__UserCache = prevCache;
        WakeStartupGuard.Instance.Reset();
        EventWakeCoalescer.Instance.Reset();
    });

    function buildContext(): ScheduledJobExecutionContext {
        return {
            Schedule: { ID: 'SCHED-1', Configuration: '{}' } as unknown as MJScheduledJobEntity,
            Run: { ID: 'JRUN-1' },
            ContextUser: SYSTEM,
        } as unknown as ScheduledJobExecutionContext;
    }

    it('batch-checks MJ: AI Agent User Policies via ResultType: "simple" and executes ONLY active-policy users', async () => {
        const activeRoutine = makeRoutine({ ID: 'R-ACTIVE', UserID: 'U-ACTIVE', Name: 'Active Wake' });
        const pausedRoutine = makeRoutine({ ID: 'R-PAUSED', UserID: 'U-PAUSED', Name: 'Paused Wake' });
        const noPolicyRoutine = makeRoutine({ ID: 'R-NONE', UserID: 'U-NONE', Name: 'Unonboarded Wake' });

        runViewMock.mockImplementation(async (params: { EntityName: string; ResultType?: string }) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [activeRoutine, pausedRoutine, noPolicyRoutine] };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                expect(params.ResultType).toBe('simple');
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
                        {
                            ID: 'POL-PAUSED',
                            AgentID: 'AGENT-1',
                            UserID: 'U-PAUSED',
                            Status: 'Paused',
                            AllowInterAgentCoordination: true,
                            EmailChannelMode: 'DraftOnly',
                            Agent: 'Chief of Staff',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const createRunRowSpy = vi.spyOn(
            driver as unknown as { createRunRow: (r: unknown, u: unknown) => Promise<unknown> },
            'createRunRow'
        ).mockResolvedValue({
            ID: 'URUN-1',
            Status: 'Running',
            StartedAt: new Date(),
            CompletedAt: new Date(),
            GetFieldByName: () => ({ OldValue: 'Running' }),
            Save: vi.fn(async () => true),
        });
        vi.spyOn(
            driver as unknown as { runAndRecord: () => Promise<unknown> },
            'runAndRecord'
        ).mockImplementation(async () => ({
            RoutineID: 'R-ACTIVE',
            RunStatus: 'Success',
            Notified: false,
        }));

        const result = await driver.Execute(buildContext());

        expect(result.Success).toBe(true);
        expect(result.Details?.RoutinesEvaluated).toBe(3);
        expect(result.Details?.RoutinesRun).toBe(1);
        expect(createRunRowSpy).toHaveBeenCalledTimes(1);
        expect((createRunRowSpy.mock.calls[0][0] as { ID: string }).ID).toBe('R-ACTIVE');

        // Single batched RunView query for all 3 routines' policies (zero N+1 queries)
        const policyQueries = runViewMock.mock.calls.filter(
            (c) => (c[0] as { EntityName: string }).EntityName === 'MJ: AI Agent User Policies'
        );
        expect(policyQueries).toHaveLength(1);
    });

    it('blocks queued wakes when a policy was deactivated after enqueueing or when RunView fails (fail-closed)', async () => {
        const queuedRoutine = makeRoutine({ ID: 'R-DEACTIVATED', UserID: 'U-ACTIVE', Name: 'Queued Wake' });

        // First: policy lookup returns Disabled -> zero runs
        runViewMock.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [queuedRoutine] };
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
                };
            }
            return { Success: true, Results: [] };
        });

        const disabledRes = await driver.Execute(buildContext());
        expect(disabledRes.Details?.RoutinesRun).toBe(0);

        // Second: RunView fails for policy check -> fail-closed zero runs
        runViewMock.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [queuedRoutine] };
            }
            if (params.EntityName === 'MJ: AI Agent User Policies') {
                return { Success: false, ErrorMessage: 'DB unavailable', Results: [] };
            }
            return { Success: true, Results: [] };
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

        runViewMock.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: User Routines') {
                return { Success: true, Results: [pendingCoalescedRoutine] };
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
                };
            }
            return { Success: true, Results: [] };
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
        vi.spyOn(
            driver as unknown as { createRunRow: () => Promise<unknown> },
            'createRunRow'
        ).mockResolvedValue({
            ID: 'URUN-REC',
            Status: 'Running',
            StartedAt: new Date('2026-11-22T12:05:00.000Z'),
            CompletedAt: new Date('2026-11-22T12:05:01.000Z'),
            GetFieldByName: () => ({ OldValue: 'Running' }),
            Save: vi.fn(async () => true),
        });
        vi.spyOn(
            driver as unknown as { runAndRecord: () => Promise<unknown> },
            'runAndRecord'
        ).mockResolvedValue({
            RoutineID: 'R-RECOVER',
            RunStatus: 'Success',
            Notified: false,
        });

        const afterReady = await driver.Execute(buildContext());
        expect(afterReady.Details?.RoutinesRun).toBe(1);
        expect(afterReady.Details?.Succeeded).toBe(1);
        // Dispatch window was recorded on EventWakeCoalescer for the recovered app wake
        const windowEntry = EventWakeCoalescer.Instance.GetWindowEntry('U-ACTIVE', 'app-tasks');
        expect(windowEntry?.LastDispatchedAtMs).not.toBeNull();
    });
});
