import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    RunView,
    type IMetadataProvider,
    type MJLimitsBudgetsConfig,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import {
    BuildLimitsDiagnosticsSnapshot,
    type RunawayCheckpointState,
} from '@memberjunction/ai-core-plus';
import {
    BudgetEnforcementGuard,
    ComputeActiveWallClockOverlapMs,
    ComputeDayBoundaryWindow,
    ComputeHistoricalRowDailyAttribution,
    ComputeTotalPausedMs,
    type AgentRunBudgetLedgerRow,
} from '../BudgetEnforcementGuard';
import { RunawayCheckpointManager } from '../RunawayCheckpointManager';

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
                UserView: {} as RunViewResult<AgentRunBudgetLedgerRow>['UserView'],
            };
        });
    });

    const providerStub: Partial<IMetadataProvider> & {
        RunViews: typeof runViewsSpy;
        RunView: ReturnType<typeof vi.fn>;
    } = {
        RunViews: runViewsSpy,
        RunView: vi.fn(),
    };
    return {
        Provider: providerStub as IMetadataProvider,
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

    it('fails closed (LedgerUnavailable pause verdict) when RunViews returns Success=false, missing batch results, or throws (CR-6)', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 10.0, MaxWallClockMs: 600_000, MaxTokens: null },
            PerRoutine: { MaxCostUsd: 5.0, MaxWallClockMs: null },
            PerUserPerDay: { MaxCostUsd: 5.0, MaxWallClockMs: null, DayBoundaryTimezone: 'UTC' },
        });
        const nowMs = Date.UTC(2026, 10, 21, 15, 0, 0);

        // 1) Success === false
        const failedProvider = {
            RunViews: vi.fn(async () => [
                { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: 'SQL timeout', UserView: {} as RunViewResult<AgentRunBudgetLedgerRow>['UserView'] },
                { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '', UserView: {} as RunViewResult<AgentRunBudgetLedgerRow>['UserView'] },
            ]),
        } as Partial<IMetadataProvider> as IMetadataProvider;
        const failRes = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.05,
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider: failedProvider,
        });
        expect(failRes.Exceeded).toBe(true);
        expect(failRes.LedgerUnavailable).toBe(true);
        expect(failRes.LedgerError).toContain('SQL timeout');

        // 2) Missing batch result (incomplete array)
        const incompleteProvider = {
            RunViews: vi.fn(async () => [
                { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '', UserView: {} as RunViewResult<AgentRunBudgetLedgerRow>['UserView'] },
            ]),
        } as Partial<IMetadataProvider> as IMetadataProvider;
        const incompleteRes = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.05,
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider: incompleteProvider,
        });
        expect(incompleteRes.Exceeded).toBe(true);
        expect(incompleteRes.LedgerUnavailable).toBe(true);
        expect(incompleteRes.LedgerError).toContain('incomplete batch');

        // 3) Thrown exception from RunViews
        const throwingProvider = {
            RunViews: vi.fn(async () => {
                throw new Error('DB connection dropped');
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider;
        const throwRes = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.05,
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider: throwingProvider,
        });
        expect(throwRes.Exceeded).toBe(true);
        expect(throwRes.LedgerUnavailable).toBe(true);
        expect(throwRes.LedgerError).toContain('DB connection dropped');
    });

    it('prevents ancestor/descendant double-counting across PerRoutine and PerUserPerDay parent/child hierarchies (CR-9)', async () => {
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 10.0, MaxWallClockMs: 600_000, MaxTokens: null },
            PerRoutine: { MaxCostUsd: 4.5, MaxWallClockMs: null },
            PerUserPerDay: { MaxCostUsd: 4.5, MaxWallClockMs: null, DayBoundaryTimezone: 'UTC' },
        });
        const nowMs = Date.UTC(2026, 10, 21, 16, 0, 0);
        const parentRunId = '10000000-0000-4000-8000-000000000001';
        const childRunId = '10000000-0000-4000-8000-000000000002';
        const grandChildId = '10000000-0000-4000-8000-000000000003';

        // Prior parent tree: parent direct=1.00, child direct=1.50, grandchild direct=0.50 -> total tree rollup = 3.00
        // If naively summing TotalCostRollup across all rows: 3.00 + 2.00 + 0.50 = 5.50 (false breach of $4.50)!
        // With deduplication, tree cost = 3.00; plus active run 0.50 = 3.50 (< 4.50, NOT exceeded).
        // Plus active run's own child (if present in DB while parent active is evaluated) must be excluded.
        const hierarchyRows: AgentRunBudgetLedgerRow[] = [
            {
                ID: parentRunId,
                ParentRunID: null,
                UserID: USER_ID,
                TotalCost: 1.0,
                TotalCostRollup: 3.0,
                StartedAt: new Date(Date.UTC(2026, 10, 21, 10, 0, 0)),
                CompletedAt: new Date(Date.UTC(2026, 10, 21, 10, 1, 0)),
                ScheduledJobRunID: ROUTINE_ID,
                Status: 'Completed',
                Data: null,
            },
            {
                ID: childRunId,
                ParentRunID: parentRunId,
                UserID: USER_ID,
                TotalCost: 1.5,
                TotalCostRollup: 2.0,
                StartedAt: new Date(Date.UTC(2026, 10, 21, 10, 0, 10)),
                CompletedAt: new Date(Date.UTC(2026, 10, 21, 10, 0, 40)),
                ScheduledJobRunID: ROUTINE_ID,
                Status: 'Completed',
                Data: null,
            },
            {
                ID: grandChildId,
                ParentRunID: childRunId,
                UserID: USER_ID,
                TotalCost: 0.5,
                TotalCostRollup: 0.5,
                StartedAt: new Date(Date.UTC(2026, 10, 21, 10, 0, 20)),
                CompletedAt: new Date(Date.UTC(2026, 10, 21, 10, 0, 35)),
                ScheduledJobRunID: ROUTINE_ID,
                Status: 'Completed',
                Data: null,
            },
            {
                ID: '99999999-0000-4000-8000-000000000001',
                ParentRunID: ACTIVE_RUN_ID,
                UserID: USER_ID,
                TotalCost: 0.4,
                TotalCostRollup: 0.4,
                StartedAt: new Date(nowMs - 500),
                CompletedAt: null,
                ScheduledJobRunID: ROUTINE_ID,
                Status: 'Running',
                Data: null,
            },
        ];

        const { Provider } = createMockRunViewsProvider(hierarchyRows, hierarchyRows);
        const result = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.5,
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider,
        });

        expect(result.Exceeded).toBe(false);
        expect(result.Ledger.RoutineCostUsd).toBeCloseTo(3.5, 5);
        expect(result.Ledger.UserDailyCostUsd).toBeCloseTo(3.5, 5);
    });

    it('computes accurate 23h spring-forward and 25h fall-back IANA timezone day boundaries across DST transitions (CR-11)', () => {
        // America/New_York 2026-03-08 (Spring forward: clocks jump 02:00 EST -> 03:00 EDT; 23-hour local day)
        const springForwardNoonUtc = Date.UTC(2026, 2, 8, 17, 0, 0);
        const springWin = ComputeDayBoundaryWindow(springForwardNoonUtc, 'America/New_York');
        expect(springWin.DayBucketUTC).toBe('2026-03-08');
        expect(springWin.DayStartISO).toBe('2026-03-08T05:00:00.000Z');
        expect(springWin.DayEndISO).toBe('2026-03-09T04:00:00.000Z');
        expect(Date.parse(springWin.DayEndISO) - Date.parse(springWin.DayStartISO)).toBe(23 * 3_600_000);

        const nowFallback = Date.UTC(2026, 10, 1, 17, 0, 0);
        const fallWin = ComputeDayBoundaryWindow(nowFallback, 'America/New_York');
        expect(fallWin.DayBucketUTC).toBe('2026-11-01');
        expect(fallWin.DayStartISO).toBe('2026-11-01T04:00:00.000Z');
        expect(fallWin.DayEndISO).toBe('2026-11-02T05:00:00.000Z');
        expect(Date.parse(fallWin.DayEndISO) - Date.parse(fallWin.DayStartISO)).toBe(25 * 3_600_000);
    });

    it('attributes only today day-bucket cost and active wall-clock delta for concurrent overnight runs and pause/resume across midnight (CR-20)', async () => {
        const guard = new BudgetEnforcementGuard();
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 50, MaxWallClockMs: 10_000_000, MaxTokens: null },
            PerUserPerDay: { MaxCostUsd: 3.0, MaxWallClockMs: 1_800_000, DayBoundaryTimezone: 'UTC' },
        });

        const dayStartMs = Date.UTC(2026, 10, 21, 0, 0, 0);
        const dayEndMs = Date.UTC(2026, 10, 22, 0, 0, 0);
        const nowMs = Date.UTC(2026, 10, 21, 0, 15, 0); // 00:15 UTC today (900_000 ms into today)

        // Concurrent overnight run #1 started 23:30 UTC yesterday, checkpointed $2.00 before midnight at 23:55 UTC,
        // resumed at 00:05 UTC today, and spent $0.75 more today ($2.75 cumulative). Only $0.75 + 10 min active belongs to today!
        const concurrentOvernightCheckpoint = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-overnight-1',
            AgentRunID: '20000000-0000-4000-8000-000000000001',
            AgentID: 'agent-1',
            AgentName: 'OvernightAgent',
            UserID: USER_ID,
            RoutineID: null,
            PausedAtISO: new Date(Date.UTC(2026, 10, 20, 23, 55, 0)).toISOString(),
            PausedAtMs: Date.UTC(2026, 10, 20, 23, 55, 0),
            PauseReason: 'BudgetExceeded',
            Summary: 'Overnight pause before midnight',
            CompletedStepCount: 4,
            CompletedStepIDs: [],
            CompletedPromptTurns: 2,
            CompletedNodeIDs: [],
            ConversationMessages: [],
            InFlightPayload: null,
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: null,
            Evidence: {},
            CumulativeLedger: {
                RunCostUsd: 2.0,
                RunWallClockMs: 1_500_000,
                RunTokens: 1000,
                RoutineCostUsd: 0,
                RoutineWallClockMs: 0,
                UserDailyCostUsd: 2.0,
                UserDailyWallClockMs: 1_500_000,
                PausedWallClockMs: 600_000,
                PausedIntervals: [
                    {
                        PausedAtMs: Date.UTC(2026, 10, 20, 23, 55, 0),
                        ResumedAtMs: Date.UTC(2026, 10, 21, 0, 5, 0),
                    },
                ],
                DayBucketUTC: '2026-11-20',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date(Date.UTC(2026, 10, 20, 23, 55, 0)).toISOString(),
            },
            HumanApproval: { Status: 'Approved' },
        };

        // Run #2 finished BEFORE midnight yesterday (must contribute 0 today even if mock returns it)
        const yesterdayFinishedRow: AgentRunBudgetLedgerRow = {
            ID: '20000000-0000-4000-8000-000000000002',
            ParentRunID: null,
            UserID: USER_ID,
            TotalCost: 20.0,
            TotalCostRollup: 20.0,
            StartedAt: new Date(Date.UTC(2026, 10, 20, 12, 0, 0)),
            CompletedAt: new Date(Date.UTC(2026, 10, 20, 13, 0, 0)),
            __mj_UpdatedAt: new Date(Date.UTC(2026, 10, 20, 13, 0, 0)),
            ScheduledJobRunID: null,
            Status: 'Completed',
            Data: null,
        };

        const concurrentOvernightRow: AgentRunBudgetLedgerRow = {
            ID: '20000000-0000-4000-8000-000000000001',
            ParentRunID: null,
            UserID: USER_ID,
            TotalCost: 2.75,
            TotalCostRollup: 2.75,
            StartedAt: new Date(Date.UTC(2026, 10, 20, 23, 30, 0)),
            CompletedAt: null,
            __mj_UpdatedAt: new Date(nowMs),
            ScheduledJobRunID: null,
            Status: 'Running',
            Data: JSON.stringify({ __runawayCheckpoint: concurrentOvernightCheckpoint }),
        };

        // Also test active run pausing before midnight and resuming today via RunawayCheckpointManager
        let capturedUserDailyFilter = '';
        const rvMock = {
            RunViews: vi.fn(async (queries: Array<{ ExtraFilter?: string }>) => {
                capturedUserDailyFilter = queries[0]?.ExtraFilter ?? '';
                return [{ Success: true, Results: [yesterdayFinishedRow, concurrentOvernightRow] }];
            }),
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvMock as Partial<RunView> as RunView);
        const provider = { Entities: [] } as Partial<IMetadataProvider> as IMetadataProvider;

        // Current active run started 23:40 UTC yesterday, paused at 23:50 UTC ($4.00 spent pre-midnight), resumed 00:05 UTC today, and spent $0.50 today ($4.50 total)
        const pausedIntervals = [
            {
                PausedAtMs: Date.UTC(2026, 10, 20, 23, 50, 0),
                ResumedAtMs: Date.UTC(2026, 10, 21, 0, 5, 0),
            },
        ];
        const resBeforeBreach = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 4.5,
            CurrentRunStartedAtMs: Date.UTC(2026, 10, 20, 23, 40, 0),
            PriorDayCostBaselineUsd: 4.0,
            PausedIntervals: pausedIntervals,
            NowMs: nowMs,
            Provider: provider,
        });

        // SQL filter queries overlapping runs (StartedAt < DayEnd AND (CompletedAt IS NULL OR CompletedAt >= DayStart OR __mj_UpdatedAt >= DayStart))
        expect(capturedUserDailyFilter).toContain(`StartedAt < '${new Date(dayEndMs).toISOString()}'`);
        expect(capturedUserDailyFilter).toContain('CompletedAt IS NULL');
        expect(capturedUserDailyFilter).toContain(`CompletedAt >= '${new Date(dayStartMs).toISOString()}'`);

        // Today's cost = concurrent $0.75 + active today $0.50 = $1.25 (< $3.00 daily limit, NOT $26.75!)
        // Today's active wall-clock = concurrent 10 min (600_000 ms) + active 10 min (600_000 ms) = 1_200_000 ms (< 1_800_000 ms, pre-midnight & paused time excluded!)
        expect(resBeforeBreach.Exceeded).toBe(false);
        expect(resBeforeBreach.Ledger.UserDailyCostUsd).toBeCloseTo(1.25, 4);
        expect(resBeforeBreach.Ledger.UserDailyWallClockMs).toBe(1_200_000);
        // Meanwhile PerRun wall-clock still tracks full active time (10 min pre-midnight + 10 min today = 1_200_000 ms) and full cost ($4.50)
        expect(resBeforeBreach.Ledger.RunCostUsd).toBeCloseTo(4.5, 4);
        expect(resBeforeBreach.Ledger.RunWallClockMs).toBe(1_200_000);

        // Now verify wall-clock daily limit breach when today's active time reaches 1_800_001ms across concurrent + active run
        const laterMs = Date.UTC(2026, 10, 21, 0, 25, 1);
        const resWallBreach = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 4.5,
            CurrentRunStartedAtMs: Date.UTC(2026, 10, 20, 23, 40, 0),
            PriorDayCostBaselineUsd: 4.0,
            PausedIntervals: pausedIntervals,
            NowMs: laterMs,
            Provider: provider,
        });
        expect(resWallBreach.Exceeded).toBe(true);
        expect(resWallBreach.Breach?.Scope).toBe('PerUserPerDay');
        expect(resWallBreach.Breach?.Dimension).toBe('WallClockMs');

        // Verify ComputeActiveWallClockOverlapMs + ComputeHistoricalRowDailyAttribution directly and PrepareResumeFromCheckpoint across midnight
        expect(
            ComputeActiveWallClockOverlapMs(
                Date.UTC(2026, 10, 20, 23, 40, 0),
                nowMs,
                dayStartMs,
                dayEndMs,
                pausedIntervals,
                false,
            ),
        ).toBe(600_000);
        expect(ComputeHistoricalRowDailyAttribution(yesterdayFinishedRow, 20, dayStartMs, dayEndMs, nowMs, false)).toEqual({
            CostUsd: 0,
            WallClockMs: 0,
        });

        const cpManager = new RunawayCheckpointManager();
        const savedRun = {
            ID: '30000000-0000-4000-8000-000000000003',
            Status: 'Paused',
            CompletedAt: null,
            ErrorMessage: null,
            Data: JSON.stringify({ __runawayCheckpoint: concurrentOvernightCheckpoint }),
            get RunawayCheckpoint() {
                return null;
            },
            set RunawayCheckpoint(_val: RunawayCheckpointState | null) {},
            LatestResult: { CompleteMessage: '' },
            Save: vi.fn(async () => true),
        };
        const restored = await cpManager.PrepareResumeFromCheckpoint({
            AgentRun: savedRun as Parameters<RunawayCheckpointManager['PrepareResumeFromCheckpoint']>[0]['AgentRun'],
            BaseBudgets: budgets,
            NowMs: Date.UTC(2026, 10, 21, 0, 5, 0),
        });
        expect(restored.PriorDayCostBaselineUsd).toBe(2.0);
        expect(restored.PriorDayWallClockBaselineMs).toBe(1_500_000);
    });

    it('CR-20: never prorates USD spend by wall-clock duration for asymmetric overnight spend (60m pre-midnight / 1m post-midnight)', async () => {
        const guard = new BudgetEnforcementGuard();
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 500, MaxWallClockMs: 10_000_000, MaxTokens: null },
            PerUserPerDay: { MaxCostUsd: 50, MaxWallClockMs: null, DayBoundaryTimezone: 'UTC' },
        });

        const startedBeforeMidnightMs = Date.UTC(2026, 10, 20, 23, 0, 0); // 23:00 UTC (60m before midnight)
        const dayStartMs = Date.UTC(2026, 10, 21, 0, 0, 0);              // 00:00 UTC
        const dayEndMs = Date.UTC(2026, 10, 22, 0, 0, 0);
        const nowMs = Date.UTC(2026, 10, 21, 0, 1, 0);                   // 00:01 UTC (1m after midnight)

        const { Provider: emptyProvider } = createMockRunViewsProvider([], []);

        // (a) Active 60m before midnight ($0) and 1m after midnight ($100) -> MUST charge $100 to today (NOT ~$1.64!)
        const postMidnightSpendEvents = [
            { TimestampMs: Date.UTC(2026, 10, 20, 23, 30, 0), CostUsd: 0 },
            { TimestampMs: Date.UTC(2026, 10, 21, 0, 0, 30), CostUsd: 100 },
        ];
        const evalPostMidnight = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 100,
            CurrentRunStartedAtMs: startedBeforeMidnightMs,
            CostEvents: postMidnightSpendEvents,
            NowMs: nowMs,
            Provider: emptyProvider,
        });
        expect(evalPostMidnight.Ledger.UserDailyCostUsd).toBe(100);
        expect(evalPostMidnight.Exceeded).toBe(true);
        expect(evalPostMidnight.Breach?.Scope).toBe('PerUserPerDay');
        expect(evalPostMidnight.Breach?.Dimension).toBe('CostUsd');

        const historicalPostMidnight = ComputeHistoricalRowDailyAttribution(
            {
                StartedAt: new Date(startedBeforeMidnightMs),
                CompletedAt: new Date(nowMs),
                Status: 'Completed',
                Data: JSON.stringify({ __budgetCostEvents: postMidnightSpendEvents }),
            },
            100,
            dayStartMs,
            dayEndMs,
            nowMs,
            false,
        );
        expect(historicalPostMidnight.CostUsd).toBe(100);
        expect(historicalPostMidnight.WallClockMs).toBe(60_000);

        // (b) Active 60m before midnight ($100) and 1m after midnight ($0) -> MUST charge $0 to today!
        const preMidnightSpendEvents = [
            { TimestampMs: Date.UTC(2026, 10, 20, 23, 15, 0), CostUsd: 100 },
            { TimestampMs: Date.UTC(2026, 10, 21, 0, 0, 30), CostUsd: 0 },
        ];
        const evalPreMidnight = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 100,
            CurrentRunStartedAtMs: startedBeforeMidnightMs,
            CostEvents: preMidnightSpendEvents,
            NowMs: nowMs,
            Provider: emptyProvider,
        });
        expect(evalPreMidnight.Ledger.UserDailyCostUsd).toBe(0);
        expect(evalPreMidnight.Exceeded).toBe(false);

        const historicalPreMidnight = ComputeHistoricalRowDailyAttribution(
            {
                StartedAt: new Date(startedBeforeMidnightMs),
                CompletedAt: new Date(nowMs),
                Status: 'Completed',
                Data: JSON.stringify({ __budgetCostEvents: preMidnightSpendEvents }),
            },
            100,
            dayStartMs,
            dayEndMs,
            nowMs,
            false,
        );
        expect(historicalPreMidnight.CostUsd).toBe(0);
        expect(historicalPreMidnight.WallClockMs).toBe(60_000);

        // (c) No timestamped events or baseline on an overlapping overnight run: conservative fail-safe (charges $100, never $1.64 proration)
        const unattributed = ComputeHistoricalRowDailyAttribution(
            {
                StartedAt: new Date(startedBeforeMidnightMs),
                CompletedAt: new Date(nowMs),
                Status: 'Completed',
                Data: null,
            },
            100,
            dayStartMs,
            dayEndMs,
            nowMs,
            false,
        );
        expect(unattributed.CostUsd).toBe(100);
    });

    it('CR-ROUTINE-RESUMED-TIME: tracks additional post-resume active time on Status="Running" rows and honors CountPausedTimeTowardsWallClock on Paused rows', async () => {
        const guard = new BudgetEnforcementGuard();
        const t0 = Date.UTC(2026, 10, 21, 12, 0, 0);
        const pausedAtMs = t0 + 10_000;  // active 10s before pause
        const resumedAtMs = t0 + 50_000; // paused for 40s
        const nowMs = t0 + 70_000;       // active 20s after resume -> 30s total active, 70s total wall

        const resumedCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-routine-resumed-1',
            AgentRunID: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
            AgentID: '11111111-1111-4111-8111-111111111119',
            AgentName: 'RoutineRunA',
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            PausedAtISO: new Date(pausedAtMs).toISOString(),
            PausedAtMs: pausedAtMs,
            PauseReason: 'BudgetExceeded',
            Summary: 'Paused after 10s',
            CompletedStepCount: 1,
            CompletedStepIDs: ['s1'],
            CompletedPromptTurns: 1,
            CompletedNodeIDs: [],
            ConversationMessages: [],
            InFlightPayload: {},
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: 'Retry',
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 0.1,
                RunWallClockMs: 10_000,
                RunTokens: 100,
                RoutineCostUsd: 0.1,
                RoutineWallClockMs: 10_000,
                UserDailyCostUsd: 0.1,
                UserDailyWallClockMs: 10_000,
                PausedWallClockMs: 40_000,
                PausedIntervals: [{ PausedAtMs: pausedAtMs, ResumedAtMs: resumedAtMs }],
                DayBucketUTC: '2026-11-21',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date(resumedAtMs).toISOString(),
            },
            HumanApproval: { Status: 'Approved' },
        };

        const runARunningRow: AgentRunBudgetLedgerRow = {
            ID: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
            UserID: USER_ID,
            TotalCost: 0.1,
            TotalCostRollup: 0.1,
            StartedAt: new Date(t0),
            CompletedAt: null,
            ScheduledJobRunID: ROUTINE_ID,
            Status: 'Running',
            Data: JSON.stringify({ __runawayCheckpoint: resumedCheckpoint }),
        };

        // 1) Status='Running' after resume with CountPausedTimeTowardsWallClock=false:
        //    Run A active time = 10,000 + 20,000 = 30,000ms (NOT frozen at 10,000ms!); Run B = 6,000ms -> 36,000ms >= 35,000ms limit
        const { Provider: provRunning } = createMockRunViewsProvider([runARunningRow], []);
        const excludePausedBudgets = createBudgets({
            PerRun: { MaxCostUsd: 10, MaxWallClockMs: 600_000, MaxTokens: null },
            PerRoutine: { MaxCostUsd: null, MaxWallClockMs: 35_000 },
            CountPausedTimeTowardsWallClock: false,
        });
        const resExcludePaused = await guard.Evaluate({
            Budgets: excludePausedBudgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.05,
            CurrentRunStartedAtMs: nowMs - 6_000,
            NowMs: nowMs,
            Provider: provRunning,
        });
        expect(resExcludePaused.Exceeded).toBe(true);
        expect(resExcludePaused.Breach?.Scope).toBe('PerRoutine');
        expect(resExcludePaused.Breach?.Dimension).toBe('WallClockMs');
        expect(resExcludePaused.Ledger.RoutineWallClockMs).toBe(36_000);

        // 2) Status='Paused' honors CountPausedTimeTowardsWallClock=true (uses nowMs -> 70,000ms) vs false (uses PausedAtMs -> 10,000ms)
        const pausedOnlyCheckpoint: RunawayCheckpointState = {
            ...resumedCheckpoint,
            CumulativeLedger: {
                ...resumedCheckpoint.CumulativeLedger,
                PausedIntervals: [{ PausedAtMs: pausedAtMs, ResumedAtMs: null }],
            },
            HumanApproval: { Status: 'Pending' },
        };
        const runAPausedRow: AgentRunBudgetLedgerRow = {
            ...runARunningRow,
            Status: 'Paused',
            Data: JSON.stringify({ __runawayCheckpoint: pausedOnlyCheckpoint }),
        };
        const { Provider: provPaused } = createMockRunViewsProvider([runAPausedRow], []);

        const resPausedExcluded = await guard.Evaluate({
            Budgets: createBudgets({
                PerRoutine: { MaxCostUsd: null, MaxWallClockMs: 50_000 },
                CountPausedTimeTowardsWallClock: false,
            }),
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.01,
            CurrentRunStartedAtMs: nowMs - 5_000,
            NowMs: nowMs,
            Provider: provPaused,
        });
        expect(resPausedExcluded.Exceeded).toBe(false);
        expect(resPausedExcluded.Ledger.RoutineWallClockMs).toBe(15_000); // 10,000 paused row + 5,000 active

        const resPausedIncluded = await guard.Evaluate({
            Budgets: createBudgets({
                PerRoutine: { MaxCostUsd: null, MaxWallClockMs: 50_000 },
                CountPausedTimeTowardsWallClock: true,
            }),
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            RoutineID: ROUTINE_ID,
            CurrentRunCostUsd: 0.01,
            CurrentRunStartedAtMs: nowMs - 5_000,
            NowMs: nowMs,
            Provider: provPaused,
        });
        expect(resPausedIncluded.Exceeded).toBe(true);
        expect(resPausedIncluded.Ledger.RoutineWallClockMs).toBe(75_000); // 70,000 total wall + 5,000 active
    });

    it('uses configured DayBoundaryTimezone bucket for DayCostBaselines lookups inside batched RunViews ledger', async () => {
        const guard = new BudgetEnforcementGuard();
        // 2026-11-21T02:00:00Z is 2026-11-20 21:00:00 in America/New_York (local day bucket '2026-11-20')
        const nowMs = Date.UTC(2026, 10, 21, 2, 0, 0);
        const budgets = createBudgets({
            PerRun: { MaxCostUsd: 50, MaxWallClockMs: 600_000, MaxTokens: null },
            PerUserPerDay: { MaxCostUsd: 1.0, MaxWallClockMs: null, DayBoundaryTimezone: 'America/New_York' },
        });

        // Historical run started on 2026-11-19 local NY time, had $4.00 cumulative cost at start of local day '2026-11-20',
        // and currently has TotalCost=$4.60 -> only $0.60 belongs to local day '2026-11-20'
        const historicalRow: AgentRunBudgetLedgerRow = {
            ID: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
            ParentRunID: null,
            UserID: USER_ID,
            TotalCost: 4.6,
            TotalCostRollup: 4.6,
            StartedAt: new Date(Date.UTC(2026, 10, 19, 18, 0, 0)),
            CompletedAt: null,
            __mj_UpdatedAt: new Date(nowMs),
            ScheduledJobRunID: null,
            Status: 'Running',
            Data: JSON.stringify({
                __budgetDayBaselines: {
                    '2026-11-20': 4.0,
                    '2026-11-21': 4.55,
                },
            }),
        };

        const { Provider } = createMockRunViewsProvider([], [historicalRow]);

        const within = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.25, // 0.60 + 0.25 = 0.85 < 1.00
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider,
        });
        expect(within.Exceeded).toBe(false);
        expect(within.Ledger.DayBucketUTC).toBe('2026-11-20');
        expect(within.Ledger.UserDailyCostUsd).toBeCloseTo(0.85, 5);

        const breached = await guard.Evaluate({
            Budgets: budgets,
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 0.45, // 0.60 + 0.45 = 1.05 >= 1.00
            CurrentRunStartedAtMs: nowMs - 1_000,
            NowMs: nowMs,
            Provider,
        });
        expect(breached.Exceeded).toBe(true);
        expect(breached.Breach?.Scope).toBe('PerUserPerDay');
        expect(breached.Ledger.UserDailyCostUsd).toBeCloseTo(1.05, 5);
    });

    it('CR-OVERNIGHT-PAUSED-DAILY-ATTRIBUTION: includes post-midnight cost events and honors CountPausedTimeTowardsWallClock on overnight Paused runs', async () => {
        const guard = new BudgetEnforcementGuard();
        const startedAtMs = Date.UTC(2026, 10, 20, 23, 0, 0);   // 23:00 UTC day 1
        const pausedAtMs = Date.UTC(2026, 10, 20, 23, 59, 0);   // 23:59 UTC day 1 (pre-midnight pause)
        const dayStartMs = Date.UTC(2026, 10, 21, 0, 0, 0);     // 00:00 UTC day 2
        const lateChargeMs = Date.UTC(2026, 10, 21, 0, 1, 0);   // 00:01 UTC day 2 (post-midnight judge charge)
        const nowMs = Date.UTC(2026, 10, 21, 0, 3, 0);          // 00:03 UTC day 2 (3 minutes into day 2)
        const dayEndMs = Date.UTC(2026, 10, 22, 0, 0, 0);

        const overnightPausedCheckpoint: RunawayCheckpointState = {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: 'cp-overnight-paused-1',
            AgentRunID: '99999999-9999-4999-8999-999999999991',
            AgentID: '11111111-1111-4111-8111-111111111119',
            AgentName: 'OvernightPausedAgent',
            UserID: USER_ID,
            RoutineID: null,
            PausedAtISO: new Date(pausedAtMs).toISOString(),
            PausedAtMs: pausedAtMs,
            PauseReason: 'FastJudgeStalled',
            Summary: 'Paused before midnight',
            CompletedStepCount: 4,
            CompletedStepIDs: ['s1', 's2', 's3', 's4'],
            CompletedPromptTurns: 2,
            CompletedNodeIDs: [],
            ConversationMessages: [],
            InFlightPayload: {},
            Scratchpad: { notes: '', tasks: [] },
            NextStepSummary: 'Await human',
            Evidence: { RecentStepSummaries: [] },
            CumulativeLedger: {
                RunCostUsd: 50.0,
                RunWallClockMs: 3_540_000,
                RunTokens: 12_000,
                RoutineCostUsd: 0,
                RoutineWallClockMs: 0,
                UserDailyCostUsd: 50.0,
                UserDailyWallClockMs: 3_540_000,
                PausedWallClockMs: 0,
                PausedIntervals: [{ PausedAtMs: pausedAtMs, ResumedAtMs: null }],
                CostEvents: [{ TimestampMs: Date.UTC(2026, 10, 20, 23, 30, 0), CostUsd: 50.0 }],
                DayBucketUTC: '2026-11-20',
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date(pausedAtMs).toISOString(),
            },
            HumanApproval: { Status: 'Pending' },
        };

        const overnightPausedRow: AgentRunBudgetLedgerRow = {
            ID: '99999999-9999-4999-8999-999999999991',
            ParentRunID: null,
            UserID: USER_ID,
            TotalCost: 62.5,
            TotalCostRollup: 62.5,
            StartedAt: new Date(startedAtMs),
            CompletedAt: null,
            __mj_UpdatedAt: new Date(lateChargeMs),
            ScheduledJobRunID: null,
            Status: 'Paused',
            Data: JSON.stringify({
                __runawayCheckpoint: overnightPausedCheckpoint,
                __budgetCostEvents: [
                    { TimestampMs: Date.UTC(2026, 10, 20, 23, 30, 0), CostUsd: 50.0 },
                    { TimestampMs: lateChargeMs, CostUsd: 12.5 },
                ],
            }),
        };

        // Direct attribution checks: late post-midnight charge ($12.50) is ALWAYS included;
        // paused wall clock today is 0 when CountPausedTimeTowardsWallClock=false and 180,000ms (3m) when true.
        const attrExcluded = ComputeHistoricalRowDailyAttribution(
            overnightPausedRow,
            62.5,
            dayStartMs,
            dayEndMs,
            nowMs,
            false,
            '2026-11-21',
        );
        expect(attrExcluded.CostUsd).toBeCloseTo(12.5, 5);
        expect(attrExcluded.WallClockMs).toBe(0);

        const attrIncluded = ComputeHistoricalRowDailyAttribution(
            overnightPausedRow,
            62.5,
            dayStartMs,
            dayEndMs,
            nowMs,
            true,
            '2026-11-21',
        );
        expect(attrIncluded.CostUsd).toBeCloseTo(12.5, 5);
        expect(attrIncluded.WallClockMs).toBe(180_000);

        // Concurrent/subsequent run enforcement via shared daily ledger:
        // (1) CountPausedTimeTowardsWallClock=false -> sees $12.50 prior today spend (breaches $15 cap with $3 live cost), 0ms paused wall clock
        const { Provider } = createMockRunViewsProvider([], [overnightPausedRow]);
        const evalCostBreach = await guard.Evaluate({
            Budgets: createBudgets({
                PerRun: { MaxCostUsd: 100, MaxWallClockMs: 600_000, MaxTokens: null },
                PerUserPerDay: { MaxCostUsd: 15.0, MaxWallClockMs: 120_000, DayBoundaryTimezone: 'UTC' },
                CountPausedTimeTowardsWallClock: false,
            }),
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 3.0,
            CurrentRunStartedAtMs: nowMs - 10_000,
            NowMs: nowMs,
            Provider,
        });
        expect(evalCostBreach.Exceeded).toBe(true);
        expect(evalCostBreach.Breach?.Scope).toBe('PerUserPerDay');
        expect(evalCostBreach.Breach?.Dimension).toBe('CostUsd');
        expect(evalCostBreach.Ledger.UserDailyCostUsd).toBeCloseTo(15.5, 5);
        expect(evalCostBreach.Ledger.UserDailyWallClockMs).toBe(10_000);

        // (2) CountPausedTimeTowardsWallClock=true -> includes today's 180,000ms paused wall clock + 10,000ms active -> breaches 120,000ms daily wall clock
        const evalWallBreach = await guard.Evaluate({
            Budgets: createBudgets({
                PerRun: { MaxCostUsd: 100, MaxWallClockMs: 600_000, MaxTokens: null },
                PerUserPerDay: { MaxCostUsd: 100.0, MaxWallClockMs: 120_000, DayBoundaryTimezone: 'UTC' },
                CountPausedTimeTowardsWallClock: true,
            }),
            AgentRunID: ACTIVE_RUN_ID,
            UserID: USER_ID,
            CurrentRunCostUsd: 1.0,
            CurrentRunStartedAtMs: nowMs - 10_000,
            NowMs: nowMs,
            Provider,
        });
        expect(evalWallBreach.Exceeded).toBe(true);
        expect(evalWallBreach.Breach?.Scope).toBe('PerUserPerDay');
        expect(evalWallBreach.Breach?.Dimension).toBe('WallClockMs');
        expect(evalWallBreach.Ledger.UserDailyCostUsd).toBeCloseTo(13.5, 5);
        expect(evalWallBreach.Ledger.UserDailyWallClockMs).toBe(190_000);
    });
});
