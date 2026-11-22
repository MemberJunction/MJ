import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    type IMetadataProvider,
    type MJLimitsBudgetsConfig,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import { BuildLimitsDiagnosticsSnapshot } from '@memberjunction/ai-core-plus';
import {
    BudgetEnforcementGuard,
    ComputeDayBoundaryWindow,
    ComputeTotalPausedMs,
    type AgentRunBudgetLedgerRow,
} from '../BudgetEnforcementGuard';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

function createBudgets(overrides: Partial<MJLimitsBudgetsConfig> = {}): MJLimitsBudgetsConfig {
    return {
        PerRun: {
            ...CODE_FALLBACK_LIMITS.Budgets.PerRun,
            ...(overrides.PerRun ?? {}),
        },
        PerRoutine: {
            ...CODE_FALLBACK_LIMITS.Budgets.PerRoutine,
            ...(overrides.PerRoutine ?? {}),
        },
        PerUserPerDay: {
            ...CODE_FALLBACK_LIMITS.Budgets.PerUserPerDay,
            ...(overrides.PerUserPerDay ?? {}),
        },
        CountPausedTimeTowardsWallClock:
            overrides.CountPausedTimeTowardsWallClock ?? CODE_FALLBACK_LIMITS.Budgets.CountPausedTimeTowardsWallClock,
        AllowedInFlightOvershootUsd:
            overrides.AllowedInFlightOvershootUsd ?? CODE_FALLBACK_LIMITS.Budgets.AllowedInFlightOvershootUsd,
        AllowedInFlightOvershootMs:
            overrides.AllowedInFlightOvershootMs ?? CODE_FALLBACK_LIMITS.Budgets.AllowedInFlightOvershootMs,
    };
}

interface MockProviderWithRunViews {
    Provider: IMetadataProvider;
    RunViewsSpy: ReturnType<typeof vi.fn>;
}

function createMockRunViewsProvider(
    routineRows: AgentRunBudgetLedgerRow[],
    userDailyRows: AgentRunBudgetLedgerRow[],
): MockProviderWithRunViews {
    const runViewsSpy = vi.fn(async (paramsList: RunViewParams[]): Promise<RunViewResult<AgentRunBudgetLedgerRow>[]> => {
        return paramsList.map((p) => {
            const filter = p.ExtraFilter ?? '';
            const isRoutine = filter.includes('ScheduledJobRunID') || filter.includes('RoutineID');
            const rows = isRoutine ? routineRows : userDailyRows;
            return {
                Success: true,
                Results: rows,
                RowCount: rows.length,
                TotalRowCount: rows.length,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserView: null as unknown as RunViewResult<AgentRunBudgetLedgerRow>['UserView'],
            };
        });
    });

    const providerStub = {
        RunViews: runViewsSpy,
        RunView: vi.fn(),
    };
    return {
        Provider: providerStub as unknown as IMetadataProvider,
        RunViewsSpy: runViewsSpy,
    };
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROUTINE_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_RUN_ID = '33333333-3333-4333-8333-333333333333';

describe('BudgetEnforcementGuard — all 6 scope x dimension combinations', () => {
    let guard: BudgetEnforcementGuard;

    beforeEach(() => {
        vi.clearAllMocks();
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
        guard = new BudgetEnforcementGuard();
    });

    afterEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('1/6 enforces PerRun dollar (CostUsd) exhaustion', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 0.50, MaxWallClockMs: 60_000, MaxTokens: null },
        });
        const nowMs = Date.UTC(2026, 10, 21, 12, 0, 0);

        const within = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.49,
            CurrentRunStartedAtMs: nowMs - 1000,
            NowMs: nowMs,
        });
        expect(within.Exceeded).toBe(false);
        expect(within.ScopeStatuses.PerRun.CostExceeded).toBe(false);

        const breached = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.52,
            CurrentRunStartedAtMs: nowMs - 1000,
            NowMs: nowMs,
        });
        expect(breached.Exceeded).toBe(true);
        expect(breached.Breach?.Scope).toBe('PerRun');
        expect(breached.Breach?.Dimension).toBe('CostUsd');
        expect(breached.Breach?.Limit).toBe(0.50);
        expect(breached.Breach?.Current).toBeCloseTo(0.52, 5);
        expect(breached.ScopeStatuses.PerRun.CostExceeded).toBe(true);
    });

    it('2/6 enforces PerRun wall-clock time (WallClockMs) exhaustion', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 5.00, MaxWallClockMs: 10_000, MaxTokens: null },
        });
        const startMs = Date.UTC(2026, 10, 21, 12, 0, 0);

        const within = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.10,
            CurrentRunStartedAtMs: startMs,
            NowMs: startMs + 9_500,
        });
        expect(within.Exceeded).toBe(false);

        const breached = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.10,
            CurrentRunStartedAtMs: startMs,
            NowMs: startMs + 10_500,
        });
        expect(breached.Exceeded).toBe(true);
        expect(breached.Breach?.Scope).toBe('PerRun');
        expect(breached.Breach?.Dimension).toBe('WallClockMs');
        expect(breached.Breach?.Current).toBe(10_500);
        expect(breached.ScopeStatuses.PerRun.WallClockExceeded).toBe(true);
    });

    it('3/6 enforces PerRoutine dollar (CostUsd) exhaustion using batched RunViews ledger', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 5.00, MaxWallClockMs: 60_000, MaxTokens: null },
            PerRoutine: { MaxCostUsd: 1.00, MaxWallClockMs: null },
        });
        const nowMs = Date.UTC(2026, 10, 21, 14, 0, 0);
        const { Provider, RunViewsSpy } = createMockRunViewsProvider(
            [
                {
                    ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
                    UserID: USER_ID,
                    TotalCost: 0.45,
                    TotalCostRollup: 0.45,
                    StartedAt: new Date(nowMs - 120_000),
                    CompletedAt: new Date(nowMs - 110_000),
                    ScheduledJobRunID: ROUTINE_ID,
                    Status: 'Completed',
                    Data: null,
                },
                {
                    ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
                    UserID: USER_ID,
                    TotalCost: 0.40,
                    TotalCostRollup: 0.40,
                    StartedAt: new Date(nowMs - 60_000),
                    CompletedAt: new Date(nowMs - 55_000),
                    ScheduledJobRunID: null,
                    Status: 'Completed',
                    Data: JSON.stringify({
                        __limitsDiagnostics: BuildLimitsDiagnosticsSnapshot(
                            LimitsConfigResolver.Resolve(),
                            { RoutineID: ROUTINE_ID },
                        ),
                    }),
                },
                // Same ID as active run must be deduplicated (never double counted)
                {
                    ID: ACTIVE_RUN_ID.toUpperCase(),
                    UserID: USER_ID,
                    TotalCost: 0.25,
                    TotalCostRollup: 0.25,
                    StartedAt: new Date(nowMs - 2_000),
                    CompletedAt: null,
                    ScheduledJobRunID: ROUTINE_ID,
                    Status: 'Running',
                    Data: null,
                },
            ],
            [],
        );

        const result = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.25,
            CurrentRunStartedAtMs: nowMs - 2_000,
            NowMs: nowMs,
            Provider,
            ContextUser: { ID: USER_ID } as UserInfo,
        });

        expect(RunViewsSpy).toHaveBeenCalledTimes(1);
        expect(result.Exceeded).toBe(true);
        expect(result.Breach?.Scope).toBe('PerRoutine');
        expect(result.Breach?.Dimension).toBe('CostUsd');
        expect(result.Ledger.RoutineCostUsd).toBeCloseTo(1.10, 5);
        expect(result.ScopeStatuses.PerRoutine.CostExceeded).toBe(true);
    });

    it('4/6 enforces PerRoutine wall-clock time (WallClockMs) exhaustion', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 10, MaxWallClockMs: 60_000, MaxTokens: null },
            PerRoutine: { MaxCostUsd: null, MaxWallClockMs: 25_000 },
        });
        const nowMs = Date.UTC(2026, 10, 21, 14, 0, 0);
        const { Provider } = createMockRunViewsProvider(
            [
                {
                    ID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
                    UserID: USER_ID,
                    TotalCost: 0.05,
                    TotalCostRollup: 0.05,
                    StartedAt: new Date(nowMs - 100_000),
                    CompletedAt: new Date(nowMs - 80_000), // 20,000ms
                    ScheduledJobRunID: ROUTINE_ID,
                    Status: 'Completed',
                    Data: null,
                },
            ],
            [],
        );

        const result = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.02,
            CurrentRunStartedAtMs: nowMs - 6_000, // +6,000ms => 26,000ms >= 25,000ms
            NowMs: nowMs,
            Provider,
        });

        expect(result.Exceeded).toBe(true);
        expect(result.Breach?.Scope).toBe('PerRoutine');
        expect(result.Breach?.Dimension).toBe('WallClockMs');
        expect(result.Ledger.RoutineWallClockMs).toBe(26_000);
        expect(result.ScopeStatuses.PerRoutine.WallClockExceeded).toBe(true);
    });

    it('5/6 enforces PerUserPerDay dollar (CostUsd) exhaustion with batched RunViews', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 5.0, MaxWallClockMs: 60_000, MaxTokens: null },
            PerRoutine: { MaxCostUsd: 5.0, MaxWallClockMs: 60_000 },
            PerUserPerDay: { MaxCostUsd: 2.00, MaxWallClockMs: null, DayBoundaryTimezone: 'UTC' },
        });
        const nowMs = Date.UTC(2026, 10, 21, 18, 30, 0);
        const { Provider, RunViewsSpy } = createMockRunViewsProvider(
            [],
            [
                {
                    ID: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
                    UserID: USER_ID,
                    TotalCost: 1.75,
                    TotalCostRollup: 1.75,
                    StartedAt: new Date(Date.UTC(2026, 10, 21, 2, 0, 0)),
                    CompletedAt: new Date(Date.UTC(2026, 10, 21, 2, 1, 0)),
                    ScheduledJobRunID: null,
                    Status: 'Completed',
                    Data: null,
                },
            ],
        );

        const result = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.30, // 1.75 + 0.30 = 2.05 >= 2.00
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider,
        });

        // Both PerRoutine and PerUserPerDay are fetched in ONE batched RunViews call
        expect(RunViewsSpy).toHaveBeenCalledTimes(1);
        expect(RunViewsSpy.mock.calls[0][0]).toHaveLength(2);
        expect(RunViewsSpy.mock.calls[0][0][1].ExtraFilter).toContain('2026-11-21T00:00:00.000Z');
        expect(RunViewsSpy.mock.calls[0][0][1].ExtraFilter).toContain('2026-11-22T00:00:00.000Z');

        expect(result.Exceeded).toBe(true);
        expect(result.Breach?.Scope).toBe('PerUserPerDay');
        expect(result.Breach?.Dimension).toBe('CostUsd');
        expect(result.Ledger.UserDailyCostUsd).toBeCloseTo(2.05, 5);
        expect(result.Ledger.DayBucketUTC).toBe('2026-11-21');
        expect(result.ScopeStatuses.PerUserPerDay.CostExceeded).toBe(true);
    });

    it('6/6 enforces PerUserPerDay wall-clock time (WallClockMs) exhaustion', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 5.0, MaxWallClockMs: 60_000, MaxTokens: null },
            PerUserPerDay: { MaxCostUsd: null, MaxWallClockMs: 45_000, DayBoundaryTimezone: 'UTC' },
        });
        const nowMs = Date.UTC(2026, 10, 21, 18, 30, 0);
        const { Provider } = createMockRunViewsProvider(
            [],
            [
                {
                    ID: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
                    UserID: USER_ID,
                    TotalCost: 0.1,
                    TotalCostRollup: 0.1,
                    StartedAt: new Date(Date.UTC(2026, 10, 21, 9, 0, 0)),
                    CompletedAt: new Date(Date.UTC(2026, 10, 21, 9, 0, 40)), // 40,000ms
                    ScheduledJobRunID: null,
                    Status: 'Completed',
                    Data: null,
                },
            ],
        );

        const result = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.05,
            CurrentRunStartedAtMs: nowMs - 6_000, // 40,000 + 6,000 = 46,000 >= 45,000
            NowMs: nowMs,
            Provider,
        });

        expect(result.Exceeded).toBe(true);
        expect(result.Breach?.Scope).toBe('PerUserPerDay');
        expect(result.Breach?.Dimension).toBe('WallClockMs');
        expect(result.Ledger.UserDailyWallClockMs).toBe(46_000);
        expect(result.ScopeStatuses.PerUserPerDay.WallClockExceeded).toBe(true);
    });

    it('respects CountPausedTimeTowardsWallClock and AllowedInFlightOvershoot tolerances', async () => {
        const startMs = Date.UTC(2026, 10, 21, 10, 0, 0);
        const pausedIntervals = [{ PausedAtMs: startMs + 500, ResumedAtMs: startMs + 60_500 }];
        const nowMs = startMs + 61_000; // 61,000ms raw, 1,000ms active

        expect(ComputeTotalPausedMs(pausedIntervals, nowMs)).toBe(60_000);

        const excludePausedBudgets = createBudgets({
            PerRun: { MaxCostUsd: 1.0, MaxWallClockMs: 5_000, MaxTokens: null },
            CountPausedTimeTowardsWallClock: false,
            AllowedInFlightOvershootUsd: 0.10,
            AllowedInFlightOvershootMs: 500,
        });

        const activeOnly = await guard.Evaluate({
            Budgets: excludePausedBudgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 1.05, // within 1.00 + 0.10 overshoot
            CurrentRunStartedAtMs: startMs,
            PausedIntervals: pausedIntervals,
            NowMs: nowMs,
        });
        expect(activeOnly.Exceeded).toBe(false);
        expect(activeOnly.Ledger.RunWallClockMs).toBe(1_000);
        expect(activeOnly.Ledger.PausedWallClockMs).toBe(60_000);

        const includePausedBudgets = createBudgets({
            PerRun: { MaxCostUsd: 1.0, MaxWallClockMs: 5_000, MaxTokens: null },
            CountPausedTimeTowardsWallClock: true,
        });
        const rawTotal = await guard.Evaluate({
            Budgets: includePausedBudgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.5,
            CurrentRunStartedAtMs: startMs,
            PausedIntervals: pausedIntervals,
            NowMs: nowMs,
        });
        expect(rawTotal.Exceeded).toBe(true);
        expect(rawTotal.Breach?.Scope).toBe('PerRun');
        expect(rawTotal.Breach?.Dimension).toBe('WallClockMs');
        expect(rawTotal.Ledger.RunWallClockMs).toBe(61_000);

        const window = ComputeDayBoundaryWindow(Date.UTC(2026, 10, 21, 15, 0, 0), 'UTC');
        expect(window.DayBucketUTC).toBe('2026-11-21');
    });
});
