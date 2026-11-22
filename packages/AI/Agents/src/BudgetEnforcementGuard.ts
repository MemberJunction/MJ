/**
 * @fileoverview Multi-scope dollar (USD) and wall-clock time budget enforcement guard
 * for MemberJunction AI Agents (`@memberjunction/ai-agents`).
 *
 * Enforces BOTH dollar (`CostUsd`) AND wall-clock time (`WallClockMs`) across all three scopes:
 *  - `PerRun` (single agent/workflow run, accumulating across human-approved pause/resume)
 *  - `PerRoutine` (recurring routine / scheduled workstream key)
 *  - `PerUserPerDay` (per user per UTC day or configured IANA timezone day boundary)
 *
 * Uses batched `RunViews` queries for historical routine and daily user ledgers while
 * deduplicating the live in-flight run so active cost and elapsed time are never double-counted.
 *
 * @module @memberjunction/ai-agents
 */

import {
    IMetadataProvider,
    LogError,
    RunView,
    RunViewParams,
    UserInfo,
    type MJLimitsBudgetsConfig,
} from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import {
    AttachBudgetAttributionToRunData,
    ExtractBudgetCostEventsFromRunData,
    ExtractBudgetDayBaselinesFromRunData,
    ExtractLimitsDiagnosticsFromRunData,
    ExtractRunawayCheckpointFromRunData,
    type BudgetBreachDetail,
    type BudgetCostEvent,
    type BudgetEnforcementResult,
    type BudgetExtensionGrant,
    type BudgetPausedInterval,
    type BudgetScope,
    type BudgetScopeStatus,
    type CumulativeBudgetLedger,
    type MJAIAgentRunEntityExtended,
    type RunawayJsonObject,
} from '@memberjunction/ai-core-plus';
import { EscapeSQLString, IsPlainObject, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';

/** Narrow projected row returned from `MJ: AI Agent Runs` for budget ledger aggregation. */
export type AgentRunBudgetLedgerRow = Pick<
    MJAIAgentRunEntity,
    | 'ID'
    | 'ParentRunID'
    | 'UserID'
    | 'TotalCost'
    | 'TotalCostRollup'
    | 'StartedAt'
    | 'CompletedAt'
    | '__mj_UpdatedAt'
    | 'ScheduledJobRunID'
    | 'Status'
    | 'Data'
>;

/** Historical totals returned by a routine or daily user budget ledger query. */
export interface ScopeHistoricalUsage {
    CostUsd: number;
    WallClockMs: number;
}

/** Optional injectable ledger reader for custom stores or deterministic unit tests. */
export interface BudgetLedgerReader {
    ReadScopedUsage(input: {
        RoutineID: string | null;
        UserID: string | null;
        ExcludeRunID: string | null;
        DayStartISO: string;
        DayEndISO: string;
        NeedRoutine: boolean;
        NeedUserDaily: boolean;
        CountPausedTimeTowardsWallClock: boolean;
        NowMs: number;
    }): Promise<{
        Routine: ScopeHistoricalUsage;
        UserDaily: ScopeHistoricalUsage;
        LedgerUnavailable?: boolean;
        LedgerError?: string;
    }>;
}

/** Input parameters for {@link BudgetEnforcementGuard.Evaluate}. */
export interface BudgetEnforcementInput {
    Budgets: MJLimitsBudgetsConfig;
    AgentRunID?: string | null;
    UserID?: string | null;
    RoutineID?: string | null;
    CurrentRunCostUsd: number;
    CurrentRunStartedAtMs: number;
    CurrentRunTokens?: number;
    PriorRunCostUsd?: number;
    PriorRunWallClockMs?: number;
    /** Prior-day cost baseline already spent before today's day boundary (CR-20). */
    PriorDayCostBaselineUsd?: number;
    /** Prior-day active wall-clock baseline already elapsed before today's day boundary (CR-20). */
    PriorDayWallClockBaselineMs?: number;
    /** Timestamped USD spend deltas for exact day-window attribution without wall-clock proration (CR-20). */
    CostEvents?: readonly BudgetCostEvent[];
    /** Per-day cumulative cost baselines keyed by `DayBucketUTC` (CR-20). */
    DayCostBaselines?: Record<string, number>;
    PausedIntervals?: readonly BudgetPausedInterval[];
    NowMs?: number;
    Provider?: IMetadataProvider;
    ContextUser?: UserInfo;
    LedgerReader?: BudgetLedgerReader;
}

const AGENT_RUN_ENTITY = 'MJ: AI Agent Runs';

interface LocalDateParts {
    Year: number;
    Month: number;
    Day: number;
    Hour: number;
    Minute: number;
    Second: number;
}

function formatZonedParts(date: Date, timezone: string): LocalDateParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const readPart = (type: Intl.DateTimeFormatPartTypes): number => {
        const found = parts.find((p) => p.type === type);
        return found ? Number(found.value) : 0;
    };
    const rawHour = readPart('hour');
    return {
        Year: readPart('year'),
        Month: readPart('month'),
        Day: readPart('day'),
        Hour: rawHour === 24 ? 0 : rawHour,
        Minute: readPart('minute'),
        Second: readPart('second'),
    };
}

function computeTimezoneOffsetMinutes(date: Date, timezone: string): number {
    const zoned = formatZonedParts(date, timezone);
    const zonedAsUtcMs = Date.UTC(
        zoned.Year,
        zoned.Month - 1,
        zoned.Day,
        zoned.Hour,
        zoned.Minute,
        zoned.Second,
    );
    const utcTruncatedMs = Math.floor(date.getTime() / 1000) * 1000;
    return Math.round((zonedAsUtcMs - utcTruncatedMs) / 60_000);
}

/**
 * Resolves the exact UTC epoch milliseconds for local midnight `00:00:00` of `(year, month, day)`
 * inside an IANA timezone, accounting for spring-forward (23h) and fall-back (25h) transitions.
 */
function findUtcMsForLocalMidnight(year: number, month: number, day: number, timezone: string): number {
    const naiveUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0);
    const offsetAtNaive = computeTimezoneOffsetMinutes(new Date(naiveUtcMs), timezone);
    let candidateMs = naiveUtcMs - offsetAtNaive * 60_000;
    const offsetAtCandidate = computeTimezoneOffsetMinutes(new Date(candidateMs), timezone);
    if (offsetAtCandidate !== offsetAtNaive) {
        candidateMs = naiveUtcMs - offsetAtCandidate * 60_000;
    }
    return candidateMs;
}

/**
 * Computes the UTC day window `[DayStartISO, DayEndISO)` and canonical `YYYY-MM-DD` bucket
 * for a given epoch timestamp and timezone, resolving start and next-day midnight independently
 * across DST transitions.
 */
export function ComputeDayBoundaryWindow(
    nowMs: number,
    timezone: string = 'UTC',
): { DayBucketUTC: string; DayStartISO: string; DayEndISO: string } {
    const date = new Date(nowMs);
    const utcBucket = date.toISOString().slice(0, 10);
    if (!timezone || timezone.toUpperCase() === 'UTC') {
        const start = new Date(`${utcBucket}T00:00:00.000Z`);
        const end = new Date(start.getTime() + 86_400_000);
        return {
            DayBucketUTC: utcBucket,
            DayStartISO: start.toISOString(),
            DayEndISO: end.toISOString(),
        };
    }

    try {
        const local = formatZonedParts(date, timezone);
        const monthStr = String(local.Month).padStart(2, '0');
        const dayStr = String(local.Day).padStart(2, '0');
        const localDate = `${local.Year}-${monthStr}-${dayStr}`;
        const startUtcMs = findUtcMsForLocalMidnight(local.Year, local.Month, local.Day, timezone);
        const nextDateUtc = new Date(Date.UTC(local.Year, local.Month - 1, local.Day + 1));
        const endUtcMs = findUtcMsForLocalMidnight(
            nextDateUtc.getUTCFullYear(),
            nextDateUtc.getUTCMonth() + 1,
            nextDateUtc.getUTCDate(),
            timezone,
        );
        return {
            DayBucketUTC: localDate,
            DayStartISO: new Date(startUtcMs).toISOString(),
            DayEndISO: new Date(endUtcMs).toISOString(),
        };
    } catch {
        const start = new Date(`${utcBucket}T00:00:00.000Z`);
        const end = new Date(start.getTime() + 86_400_000);
        return {
            DayBucketUTC: utcBucket,
            DayStartISO: start.toISOString(),
            DayEndISO: end.toISOString(),
        };
    }
}

/**
 * Computes active (or total when `countPausedTime` is true) milliseconds that the interval
 * `[startMs, endMs)` overlaps `[windowStartMs, windowEndMs)`, subtracting only the overlap
 * of any pause intervals inside that window (CR-20).
 */
export function ComputeActiveWallClockOverlapMs(
    startMs: number,
    endMs: number,
    windowStartMs: number,
    windowEndMs: number,
    pausedIntervals?: readonly BudgetPausedInterval[],
    countPausedTime: boolean = false,
): number {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) {
        return 0;
    }
    const overlapStart = Math.max(startMs, windowStartMs);
    const overlapEnd = Math.min(endMs, windowEndMs);
    if (overlapEnd <= overlapStart) {
        return 0;
    }
    const rawOverlapMs = overlapEnd - overlapStart;
    if (countPausedTime || !pausedIntervals || pausedIntervals.length === 0) {
        return rawOverlapMs;
    }
    let pausedInWindowMs = 0;
    for (const interval of pausedIntervals) {
        const pStart = Math.max(overlapStart, interval.PausedAtMs);
        const pEnd = Math.min(overlapEnd, interval.ResumedAtMs ?? endMs);
        if (Number.isFinite(pStart) && Number.isFinite(pEnd) && pEnd > pStart) {
            pausedInWindowMs += pEnd - pStart;
        }
    }
    return Math.max(0, rawOverlapMs - pausedInWindowMs);
}

/**
 * Sums USD spend from timestamped {@link BudgetCostEvent} entries strictly inside `[windowStartMs, windowEndMs)`.
 */
export function ComputeCostEventsInWindow(
    events: readonly BudgetCostEvent[] | undefined,
    windowStartMs: number,
    windowEndMs: number,
): number {
    if (!events || events.length === 0) {
        return 0;
    }
    let total = 0;
    for (const ev of events) {
        if (
            Number.isFinite(ev.TimestampMs) &&
            Number.isFinite(ev.CostUsd) &&
            ev.TimestampMs >= windowStartMs &&
            ev.TimestampMs < windowEndMs
        ) {
            total += Math.max(0, ev.CostUsd);
        }
    }
    return total;
}

/**
 * Attributes only the `[dayStartMs, dayEndMs)` day-bucket delta for a historical/concurrent row
 * using exact timestamped cost events or persisted day baselines (never wall-clock proration),
 * defaulting conservatively when an overlapping overnight run has no prior-day baseline (CR-20).
 */
export function ComputeHistoricalRowDailyAttribution(
    row: Pick<AgentRunBudgetLedgerRow, 'StartedAt' | 'CompletedAt' | 'Status' | 'Data'>,
    totalTreeCostUsd: number,
    dayStartMs: number,
    dayEndMs: number,
    nowMs: number,
    countPausedTime: boolean,
    dayBucketUTC?: string,
): { CostUsd: number; WallClockMs: number } {
    if (!row.StartedAt) {
        return { CostUsd: 0, WallClockMs: 0 };
    }
    const startMs = new Date(row.StartedAt).getTime();
    if (!Number.isFinite(startMs) || startMs >= dayEndMs) {
        return { CostUsd: 0, WallClockMs: 0 };
    }

    const checkpoint = ExtractRunawayCheckpointFromRunData(row.Data);
    const pausedIntervals = checkpoint?.CumulativeLedger.PausedIntervals;
    const completedAtMs = row.CompletedAt ? new Date(row.CompletedAt).getTime() : null;
    if (completedAtMs !== null && !Number.isFinite(completedAtMs)) {
        return { CostUsd: 0, WallClockMs: 0 };
    }

    const isPausedOpen = row.Status === 'Paused' && completedAtMs === null;
    const clampedNowEndMs = Math.min(nowMs, dayEndMs);

    let wallClockTodayMs = 0;
    if (completedAtMs !== null) {
        if (completedAtMs > dayStartMs) {
            wallClockTodayMs = ComputeActiveWallClockOverlapMs(
                startMs,
                completedAtMs,
                dayStartMs,
                clampedNowEndMs,
                pausedIntervals,
                countPausedTime,
            );
        }
    } else if (isPausedOpen) {
        const effectivePausedIntervals = checkpoint
            ? [
                ...(pausedIntervals ?? []),
                // Ensure still-open pause at PausedAtMs blocks wall-clock attribution past pause time
                // when CountPausedTimeTowardsWallClock is false.
                ...(pausedIntervals?.some((p) => p.ResumedAtMs == null)
                    ? []
                    : [{ PausedAtMs: checkpoint.PausedAtMs, ResumedAtMs: null }]),
            ]
            : pausedIntervals;
        wallClockTodayMs = ComputeActiveWallClockOverlapMs(
            startMs,
            nowMs,
            dayStartMs,
            clampedNowEndMs,
            effectivePausedIntervals,
            countPausedTime,
        );
    } else {
        wallClockTodayMs = ComputeActiveWallClockOverlapMs(
            startMs,
            nowMs,
            dayStartMs,
            clampedNowEndMs,
            pausedIntervals,
            countPausedTime,
        );
    }

    const safeTotalCost = Math.max(0, totalTreeCostUsd);
    if (startMs >= dayStartMs) {
        // Started within today's window: 100% belongs to today.
        return { CostUsd: safeTotalCost, WallClockMs: wallClockTodayMs };
    }

    // Overnight run started BEFORE today's dayStartMs: evaluate timestamped cost events
    // independently of CompletedAt/PausedAtMs so late-settled charges recorded after midnight
    // on a pre-midnight paused (or finished) run are always attributed to today's bucket.
    const dataEvents = ExtractBudgetCostEventsFromRunData(row.Data);
    const costEvents = dataEvents.length > 0 ? dataEvents : (checkpoint?.CumulativeLedger.CostEvents ?? []);
    if (costEvents.length > 0) {
        return {
            CostUsd: ComputeCostEventsInWindow(costEvents, dayStartMs, dayEndMs),
            WallClockMs: wallClockTodayMs,
        };
    }

    // Completed strictly before today's midnight with no post-midnight cost events: zero cost today.
    if (completedAtMs !== null && completedAtMs <= dayStartMs) {
        return { CostUsd: 0, WallClockMs: wallClockTodayMs };
    }

    const dataDayBaselines = ExtractBudgetDayBaselinesFromRunData(row.Data);
    const dayBaselines = Object.keys(dataDayBaselines).length > 0
        ? dataDayBaselines
        : checkpoint?.CumulativeLedger.DayCostBaselines;
    const resolvedBucket = dayBucketUTC ?? new Date(dayStartMs).toISOString().slice(0, 10);
    if (dayBaselines && typeof dayBaselines[resolvedBucket] === 'number' && Number.isFinite(dayBaselines[resolvedBucket])) {
        return {
            CostUsd: Math.max(0, safeTotalCost - dayBaselines[resolvedBucket]),
            WallClockMs: wallClockTodayMs,
        };
    }

    const priorDayCostBaseline = checkpoint?.CumulativeLedger.PriorDayCostBaselineUsd;
    if (typeof priorDayCostBaseline === 'number' && Number.isFinite(priorDayCostBaseline)) {
        return {
            CostUsd: Math.max(0, safeTotalCost - priorDayCostBaseline),
            WallClockMs: wallClockTodayMs,
        };
    }

    // If checkpoint itself was captured before today's midnight, RunCostUsd at checkpoint is pre-midnight spend.
    if (checkpoint && checkpoint.PausedAtMs < dayStartMs) {
        return {
            CostUsd: Math.max(0, safeTotalCost - Math.max(0, checkpoint.CumulativeLedger.RunCostUsd)),
            WallClockMs: wallClockTodayMs,
        };
    }

    // No timestamped cost events or pre-midnight baseline available: fail-safe conservatively to charging
    // the full unattributed cost rather than prorating USD dollars by wall-clock duration.
    return {
        CostUsd: safeTotalCost,
        WallClockMs: wallClockTodayMs,
    };
}

/**
 * Computes total paused duration in milliseconds across closed and open pause intervals.
 */
export function ComputeTotalPausedMs(
    intervals: readonly BudgetPausedInterval[] | undefined,
    nowMs: number,
): number {
    if (!intervals || intervals.length === 0) {
        return 0;
    }
    let pausedMs = 0;
    for (const interval of intervals) {
        const start = interval.PausedAtMs;
        const end = interval.ResumedAtMs ?? nowMs;
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            pausedMs += end - start;
        }
    }
    return pausedMs;
}

/**
 * Applies a human-approved {@link BudgetExtensionGrant} onto a resolved {@link MJLimitsBudgetsConfig}.
 */
export function ApplyBudgetExtensionToBudgets(
    budgets: MJLimitsBudgetsConfig,
    extension: BudgetExtensionGrant | undefined,
): MJLimitsBudgetsConfig {
    const next: MJLimitsBudgetsConfig = {
        PerRun: { ...budgets.PerRun },
        PerRoutine: { ...budgets.PerRoutine },
        PerUserPerDay: { ...budgets.PerUserPerDay },
        CountPausedTimeTowardsWallClock: budgets.CountPausedTimeTowardsWallClock,
        AllowedInFlightOvershootUsd: budgets.AllowedInFlightOvershootUsd,
        AllowedInFlightOvershootMs: budgets.AllowedInFlightOvershootMs,
    };
    if (!extension) {
        return next;
    }
    applyPerRunExtension(next, extension);
    applyScopeExtensions(next, extension);
    return next;
}

function applyPerRunExtension(next: MJLimitsBudgetsConfig, ext: BudgetExtensionGrant): void {
    if (ext.NewPerRunMaxCostUsd !== undefined) {
        next.PerRun.MaxCostUsd = ext.NewPerRunMaxCostUsd;
    } else if (typeof ext.AdditionalCostUsd === 'number' && ext.AdditionalCostUsd > 0 && next.PerRun.MaxCostUsd !== null) {
        next.PerRun.MaxCostUsd += ext.AdditionalCostUsd;
    }
    if (ext.NewPerRunMaxWallClockMs !== undefined) {
        next.PerRun.MaxWallClockMs = ext.NewPerRunMaxWallClockMs;
    } else if (typeof ext.AdditionalWallClockMs === 'number' && ext.AdditionalWallClockMs > 0 && next.PerRun.MaxWallClockMs !== null) {
        next.PerRun.MaxWallClockMs += ext.AdditionalWallClockMs;
    }
    if (typeof ext.AdditionalTokens === 'number' && ext.AdditionalTokens > 0 && next.PerRun.MaxTokens !== null) {
        next.PerRun.MaxTokens += ext.AdditionalTokens;
    }
}

function applyScopeExtensions(next: MJLimitsBudgetsConfig, ext: BudgetExtensionGrant): void {
    if (ext.NewPerRoutineMaxCostUsd !== undefined) {
        next.PerRoutine.MaxCostUsd = ext.NewPerRoutineMaxCostUsd;
    } else if (typeof ext.AdditionalCostUsd === 'number' && ext.AdditionalCostUsd > 0 && next.PerRoutine.MaxCostUsd !== null) {
        next.PerRoutine.MaxCostUsd += ext.AdditionalCostUsd;
    }
    if (ext.NewPerRoutineMaxWallClockMs !== undefined) {
        next.PerRoutine.MaxWallClockMs = ext.NewPerRoutineMaxWallClockMs;
    } else if (typeof ext.AdditionalWallClockMs === 'number' && ext.AdditionalWallClockMs > 0 && next.PerRoutine.MaxWallClockMs !== null) {
        next.PerRoutine.MaxWallClockMs += ext.AdditionalWallClockMs;
    }
    if (ext.NewPerUserDailyMaxCostUsd !== undefined) {
        next.PerUserPerDay.MaxCostUsd = ext.NewPerUserDailyMaxCostUsd;
    } else if (typeof ext.AdditionalCostUsd === 'number' && ext.AdditionalCostUsd > 0 && next.PerUserPerDay.MaxCostUsd !== null) {
        next.PerUserPerDay.MaxCostUsd += ext.AdditionalCostUsd;
    }
    if (ext.NewPerUserDailyMaxWallClockMs !== undefined) {
        next.PerUserPerDay.MaxWallClockMs = ext.NewPerUserDailyMaxWallClockMs;
    } else if (typeof ext.AdditionalWallClockMs === 'number' && ext.AdditionalWallClockMs > 0 && next.PerUserPerDay.MaxWallClockMs !== null) {
        next.PerUserPerDay.MaxWallClockMs += ext.AdditionalWallClockMs;
    }
}

/**
 * Enforces dollar (USD) and wall-clock time (ms) budgets across `PerRun`, `PerRoutine`,
 * and `PerUserPerDay` scopes.
 */
export class BudgetEnforcementGuard {
    /**
     * Records a billable prompt/judge cost delta (including late-settled timed-out judge calls)
     * onto the active run's timestamped budget cost events and denormalized run totals so
     * subsequent `PerRun`, `PerRoutine`, and `PerUserPerDay` ledger queries reflect the charge.
     */
    public static RecordBatchedPromptCost(args: {
        AgentRun?: Pick<MJAIAgentRunEntityExtended, 'Data' | 'TotalCost' | 'TotalTokensUsed'> | null;
        CostEvents?: BudgetCostEvent[];
        DayCostBaselines?: Record<string, number>;
        CostUsd?: number;
        TokensUsed?: number;
        TimestampMs?: number;
    }): { RecordedCostUsd: number; RecordedTokensUsed: number } {
        const recordedCostUsd = typeof args.CostUsd === 'number' && Number.isFinite(args.CostUsd)
            ? Math.max(0, args.CostUsd)
            : 0;
        const recordedTokensUsed = typeof args.TokensUsed === 'number' && Number.isFinite(args.TokensUsed)
            ? Math.max(0, args.TokensUsed)
            : 0;
        if (recordedCostUsd <= 0 && recordedTokensUsed <= 0) {
            return { RecordedCostUsd: 0, RecordedTokensUsed: 0 };
        }
        const timestampMs = args.TimestampMs ?? Date.now();
        if (args.CostEvents && recordedCostUsd > 0) {
            args.CostEvents.push({ TimestampMs: timestampMs, CostUsd: recordedCostUsd });
        }
        if (args.AgentRun) {
            if (recordedCostUsd > 0) {
                args.AgentRun.TotalCost = Math.max(0, args.AgentRun.TotalCost ?? 0) + recordedCostUsd;
            }
            if (recordedTokensUsed > 0) {
                args.AgentRun.TotalTokensUsed = Math.max(0, args.AgentRun.TotalTokensUsed ?? 0) + recordedTokensUsed;
            }
            if (args.CostEvents || args.DayCostBaselines) {
                args.AgentRun.Data = AttachBudgetAttributionToRunData(args.AgentRun.Data, {
                    CostEvents: args.CostEvents ?? [],
                    DayCostBaselines: args.DayCostBaselines ?? {},
                });
            }
        }
        return { RecordedCostUsd: recordedCostUsd, RecordedTokensUsed: recordedTokensUsed };
    }

    /**
     * Evaluates all configured budget scopes and dimensions against live and historical usage.
     */
    public async Evaluate(input: BudgetEnforcementInput): Promise<BudgetEnforcementResult> {
        const nowMs = input.NowMs ?? Date.now();
        const pausedMs = ComputeTotalPausedMs(input.PausedIntervals, nowMs);
        const rawElapsedMs = Math.max(0, nowMs - input.CurrentRunStartedAtMs);
        const activeElapsedMs = input.Budgets.CountPausedTimeTowardsWallClock
            ? rawElapsedMs
            : Math.max(0, rawElapsedMs - pausedMs);

        const runCostUsd = Math.max(0, input.PriorRunCostUsd ?? 0) + Math.max(0, input.CurrentRunCostUsd);
        const runWallClockMs = Math.max(0, input.PriorRunWallClockMs ?? 0) + activeElapsedMs;
        const runTokens = Math.max(0, input.CurrentRunTokens ?? 0);

        const dayWindow = ComputeDayBoundaryWindow(nowMs, input.Budgets.PerUserPerDay.DayBoundaryTimezone);
        const dayStartMs = Date.parse(dayWindow.DayStartISO);
        const dayEndMs = Date.parse(dayWindow.DayEndISO);
        const scopedHistorical = await this.loadHistoricalScopeUsage(input, dayWindow.DayStartISO, dayWindow.DayEndISO, nowMs);

        // Compute current run's attribution to TODAY'S PerUserPerDay window (CR-20)
        const currentRunTodayWallMs = typeof input.PriorDayWallClockBaselineMs === 'number'
            ? Math.max(0, runWallClockMs - input.PriorDayWallClockBaselineMs)
            : input.CurrentRunStartedAtMs >= dayStartMs && input.CurrentRunStartedAtMs < dayEndMs
                ? runWallClockMs
                : ComputeActiveWallClockOverlapMs(
                    input.CurrentRunStartedAtMs,
                    nowMs,
                    dayStartMs,
                    Math.min(nowMs, dayEndMs),
                    input.PausedIntervals,
                    input.Budgets.CountPausedTimeTowardsWallClock,
                );

        const currentRunTodayCostUsd = this.computeActiveRunTodayCostUsd(
            input,
            runCostUsd,
            dayWindow.DayBucketUTC,
            dayStartMs,
            dayEndMs,
        );

        const routineCostUsd = scopedHistorical.Routine.CostUsd + runCostUsd;
        const routineWallClockMs = scopedHistorical.Routine.WallClockMs + runWallClockMs;
        const userDailyCostUsd = scopedHistorical.UserDaily.CostUsd + currentRunTodayCostUsd;
        const userDailyWallClockMs = scopedHistorical.UserDaily.WallClockMs + currentRunTodayWallMs;

        const ledger: CumulativeBudgetLedger = {
            RunCostUsd: runCostUsd,
            RunWallClockMs: runWallClockMs,
            RunTokens: runTokens,
            RoutineCostUsd: routineCostUsd,
            RoutineWallClockMs: routineWallClockMs,
            UserDailyCostUsd: userDailyCostUsd,
            UserDailyWallClockMs: userDailyWallClockMs,
            PausedWallClockMs: pausedMs,
            PausedIntervals: input.PausedIntervals ? [...input.PausedIntervals] : [],
            DayBucketUTC: dayWindow.DayBucketUTC,
            DayBoundaryTimezone: input.Budgets.PerUserPerDay.DayBoundaryTimezone,
            ...(typeof input.PriorDayCostBaselineUsd === 'number' ? { PriorDayCostBaselineUsd: input.PriorDayCostBaselineUsd } : {}),
            ...(typeof input.PriorDayWallClockBaselineMs === 'number' ? { PriorDayWallClockBaselineMs: input.PriorDayWallClockBaselineMs } : {}),
            ...(input.CostEvents && input.CostEvents.length > 0 ? { CostEvents: [...input.CostEvents] } : {}),
            ...(input.DayCostBaselines && Object.keys(input.DayCostBaselines).length > 0
                ? { DayCostBaselines: { ...input.DayCostBaselines } }
                : {}),
            AsOfISO: new Date(nowMs).toISOString(),
        };

        if (scopedHistorical.LedgerUnavailable) {
            return this.buildLedgerUnavailableResult(
                input.Budgets,
                ledger,
                input.RoutineID ?? null,
                input.UserID ?? null,
                scopedHistorical.LedgerError ?? 'Shared budget ledger unavailable',
            );
        }

        return this.buildEnforcementResult(input.Budgets, ledger, input.RoutineID ?? null, input.UserID ?? null);
    }

    private computeActiveRunTodayCostUsd(
        input: BudgetEnforcementInput,
        runCostUsd: number,
        dayBucketUTC: string,
        dayStartMs: number,
        dayEndMs: number,
    ): number {
        if (input.CostEvents && input.CostEvents.length > 0 && input.CurrentRunStartedAtMs < dayStartMs) {
            return ComputeCostEventsInWindow(input.CostEvents, dayStartMs, dayEndMs);
        }
        if (typeof input.PriorDayCostBaselineUsd === 'number' && Number.isFinite(input.PriorDayCostBaselineUsd)) {
            return Math.max(0, runCostUsd - input.PriorDayCostBaselineUsd);
        }
        if (
            input.DayCostBaselines &&
            typeof input.DayCostBaselines[dayBucketUTC] === 'number' &&
            Number.isFinite(input.DayCostBaselines[dayBucketUTC])
        ) {
            return Math.max(0, runCostUsd - input.DayCostBaselines[dayBucketUTC]);
        }
        if (input.CurrentRunStartedAtMs >= dayStartMs && input.CurrentRunStartedAtMs < dayEndMs) {
            return runCostUsd;
        }
        if (input.CostEvents && input.CostEvents.length > 0) {
            return ComputeCostEventsInWindow(input.CostEvents, dayStartMs, dayEndMs);
        }
        // Conservative fail-safe when an overlapping overnight run has neither cost events nor a prior-day baseline:
        // never prorate USD spend by wall-clock duration.
        return runCostUsd;
    }

    private async loadHistoricalScopeUsage(
        input: BudgetEnforcementInput,
        dayStartISO: string,
        dayEndISO: string,
        nowMs: number,
    ): Promise<{
        Routine: ScopeHistoricalUsage;
        UserDaily: ScopeHistoricalUsage;
        LedgerUnavailable?: boolean;
        LedgerError?: string;
    }> {
        const needRoutine = Boolean(
            input.RoutineID &&
            (input.Budgets.PerRoutine.MaxCostUsd !== null || input.Budgets.PerRoutine.MaxWallClockMs !== null),
        );
        const needUserDaily = Boolean(
            input.UserID &&
            (input.Budgets.PerUserPerDay.MaxCostUsd !== null || input.Budgets.PerUserPerDay.MaxWallClockMs !== null),
        );

        if (!needRoutine && !needUserDaily) {
            return {
                Routine: { CostUsd: 0, WallClockMs: 0 },
                UserDaily: { CostUsd: 0, WallClockMs: 0 },
            };
        }

        if (input.LedgerReader) {
            try {
                return await input.LedgerReader.ReadScopedUsage({
                    RoutineID: input.RoutineID ?? null,
                    UserID: input.UserID ?? null,
                    ExcludeRunID: input.AgentRunID ?? null,
                    DayStartISO: dayStartISO,
                    DayEndISO: dayEndISO,
                    NeedRoutine: needRoutine,
                    NeedUserDaily: needUserDaily,
                    CountPausedTimeTowardsWallClock: input.Budgets.CountPausedTimeTowardsWallClock,
                    NowMs: nowMs,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`BudgetEnforcementGuard: LedgerReader error (fail closed): ${msg}`);
                return {
                    Routine: { CostUsd: 0, WallClockMs: 0 },
                    UserDaily: { CostUsd: 0, WallClockMs: 0 },
                    LedgerUnavailable: true,
                    LedgerError: msg,
                };
            }
        }

        return this.ReadAgentRunScopedUsage({
            Provider: input.Provider,
            ContextUser: input.ContextUser,
            RoutineID: input.RoutineID ?? null,
            UserID: input.UserID ?? null,
            ExcludeRunID: input.AgentRunID ?? null,
            DayStartISO: dayStartISO,
            DayEndISO: dayEndISO,
            DayBoundaryTimezone: input.Budgets.PerUserPerDay.DayBoundaryTimezone,
            NeedRoutine: needRoutine,
            NeedUserDaily: needUserDaily,
            CountPausedTimeTowardsWallClock: input.Budgets.CountPausedTimeTowardsWallClock,
            NowMs: nowMs,
        });
    }

    /**
     * Queries and aggregates historical/concurrent `MJ: AI Agent Runs` usage for `PerRoutine` and
     * `PerUserPerDay` scopes with tree deduplication and day-boundary attribution.
     */
    public async ReadAgentRunScopedUsage(args: {
        Provider?: IMetadataProvider;
        ContextUser?: UserInfo;
        RoutineID: string | null;
        UserID: string | null;
        ExcludeRunID: string | null;
        AdditionalExcludedRunIDs?: ReadonlySet<string>;
        DayStartISO: string;
        DayEndISO: string;
        DayBoundaryTimezone?: string;
        NeedRoutine: boolean;
        NeedUserDaily: boolean;
        CountPausedTimeTowardsWallClock: boolean;
        NowMs: number;
    }): Promise<{
        Routine: ScopeHistoricalUsage;
        UserDaily: ScopeHistoricalUsage;
        LedgerUnavailable?: boolean;
        LedgerError?: string;
    }> {
        const queries: RunViewParams[] = [];
        const queryKinds: Array<'routine' | 'userDaily'> = [];
        const fields = [
            'ID',
            'ParentRunID',
            'UserID',
            'TotalCost',
            'TotalCostRollup',
            'StartedAt',
            'CompletedAt',
            '__mj_UpdatedAt',
            'ScheduledJobRunID',
            'Status',
            'Data',
        ];

        if (args.NeedRoutine && args.RoutineID) {
            queries.push({
                EntityName: AGENT_RUN_ENTITY,
                ExtraFilter: this.buildRoutineFilter(args.RoutineID),
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            queryKinds.push('routine');
        }
        if (args.NeedUserDaily && args.UserID) {
            const safeUserId = EscapeSQLString(args.UserID);
            const safeDayStart = EscapeSQLString(args.DayStartISO);
            const safeDayEnd = EscapeSQLString(args.DayEndISO);
            queries.push({
                EntityName: AGENT_RUN_ENTITY,
                ExtraFilter: `UserID='${safeUserId}' AND StartedAt < '${safeDayEnd}' AND (CompletedAt IS NULL OR CompletedAt >= '${safeDayStart}' OR __mj_UpdatedAt >= '${safeDayStart}')`,
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            queryKinds.push('userDaily');
        }

        if (queries.length === 0) {
            return {
                Routine: { CostUsd: 0, WallClockMs: 0 },
                UserDaily: { CostUsd: 0, WallClockMs: 0 },
            };
        }

        let routineRows: AgentRunBudgetLedgerRow[] = [];
        let userDailyRows: AgentRunBudgetLedgerRow[] = [];
        let ledgerError: string | undefined;

        try {
            const rv = args.Provider ? RunView.FromMetadataProvider(args.Provider) : new RunView();
            const results = await rv.RunViews<AgentRunBudgetLedgerRow>(queries, args.ContextUser);
            if (!Array.isArray(results) || results.length < queryKinds.length) {
                ledgerError = `Shared budget ledger query returned incomplete batch (${Array.isArray(results) ? results.length : 0}/${queryKinds.length} results)`;
                LogError(`BudgetEnforcementGuard: ${ledgerError}`);
            } else {
                for (let i = 0; i < queryKinds.length; i++) {
                    const res = results[i];
                    if (!res || !res.Success) {
                        const errDetail = res?.ErrorMessage ?? `query batch item ${i} unsuccessful`;
                        ledgerError = `RunViews failed for ${queryKinds[i]}: ${errDetail}`;
                        LogError(`BudgetEnforcementGuard: ${ledgerError}`);
                        break;
                    }
                    const rows = Array.isArray(res.Results) ? res.Results : [];
                    if (queryKinds[i] === 'routine') {
                        routineRows = rows.filter((r) => this.rowMatchesRoutine(r, args.RoutineID!));
                    } else {
                        userDailyRows = rows;
                    }
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ledgerError = `RunViews exception: ${msg}`;
            LogError(`BudgetEnforcementGuard: ${ledgerError}`);
        }

        if (ledgerError) {
            return {
                Routine: { CostUsd: 0, WallClockMs: 0 },
                UserDaily: { CostUsd: 0, WallClockMs: 0 },
                LedgerUnavailable: true,
                LedgerError: ledgerError,
            };
        }

        const dayWindow = ComputeDayBoundaryWindow(args.NowMs, args.DayBoundaryTimezone);
        return {
            Routine: this.aggregateLedgerRows(
                routineRows,
                args.ExcludeRunID,
                args.CountPausedTimeTowardsWallClock,
                args.NowMs,
                undefined,
                args.AdditionalExcludedRunIDs,
            ),
            UserDaily: this.aggregateLedgerRows(
                userDailyRows,
                args.ExcludeRunID,
                args.CountPausedTimeTowardsWallClock,
                args.NowMs,
                {
                    DayStartMs: Date.parse(args.DayStartISO),
                    DayEndMs: Date.parse(args.DayEndISO),
                    DayBucketUTC: dayWindow.DayBucketUTC,
                },
                args.AdditionalExcludedRunIDs,
            ),
        };
    }

    private buildRoutineFilter(routineId: string): string {
        const escaped = EscapeSQLString(routineId);
        // Escapes LIKE wildcards when matching JSON-embedded RoutineID values.
        const likeEscaped = escaped.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\[/g, '\\[');
        return `ScheduledJobRunID='${escaped}' OR Data LIKE '%"RoutineID":"${likeEscaped}"%' ESCAPE '\\'`;
    }

    private rowMatchesRoutine(row: AgentRunBudgetLedgerRow, routineId: string): boolean {
        if (UUIDsEqual(row.ScheduledJobRunID, routineId) || row.ScheduledJobRunID === routineId) {
            return true;
        }
        const diag = ExtractLimitsDiagnosticsFromRunData(row.Data);
        if (diag?.Context.RoutineID && (UUIDsEqual(diag.Context.RoutineID, routineId) || diag.Context.RoutineID === routineId)) {
            return true;
        }
        const checkpoint = ExtractRunawayCheckpointFromRunData(row.Data);
        if (checkpoint?.RoutineID && (UUIDsEqual(checkpoint.RoutineID, routineId) || checkpoint.RoutineID === routineId)) {
            return true;
        }
        if (typeof row.Data === 'string' && row.Data.length > 0) {
            const parsed = SafeJSONParse<RunawayJsonObject>(row.Data);
            const rawDiag = IsPlainObject(parsed) ? parsed['__limitsDiagnostics'] : null;
            const rawCtx = IsPlainObject(rawDiag) ? rawDiag['Context'] : null;
            const rawRoutine = IsPlainObject(rawCtx) ? rawCtx['RoutineID'] : null;
            if (typeof rawRoutine === 'string' && (UUIDsEqual(rawRoutine, routineId) || rawRoutine === routineId)) {
                return true;
            }
        }
        return false;
    }

    private aggregateLedgerRows(
        rows: readonly AgentRunBudgetLedgerRow[],
        excludeRunId: string | null,
        countPausedTime: boolean,
        nowMs: number,
        dailyWindow?: { DayStartMs: number; DayEndMs: number; DayBucketUTC?: string },
        additionalExcludedRunIds?: ReadonlySet<string>,
    ): ScopeHistoricalUsage {
        const rowById = new Map<string, AgentRunBudgetLedgerRow>();
        const childrenByParentId = new Map<string, string[]>();

        for (const row of rows) {
            if (!row?.ID) {
                continue;
            }
            const normId = row.ID.trim().toLowerCase();
            if (!normId || rowById.has(normId)) {
                continue;
            }
            rowById.set(normId, row);
            if (typeof row.ParentRunID === 'string' && row.ParentRunID.trim().length > 0) {
                const parentNorm = row.ParentRunID.trim().toLowerCase();
                const list = childrenByParentId.get(parentNorm) ?? [];
                list.push(normId);
                childrenByParentId.set(parentNorm, list);
            }
        }

        // Exclude active run, its descendants, and its ancestors so live in-flight tree costs are never double-counted.
        const excludedIds = this.collectExcludedRunTreeIds(excludeRunId, rowById, childrenByParentId, additionalExcludedRunIds);

        const eligibleById = new Map<string, AgentRunBudgetLedgerRow>();
        for (const [normId, row] of rowById.entries()) {
            if (!excludedIds.has(normId)) {
                eligibleById.set(normId, row);
            }
        }

        // Group eligible rows into trees so each connected tree contributes max(rootRollup, sum(directTotalCost)) once.
        const eligibleChildren = new Map<string, string[]>();
        const treeRoots: AgentRunBudgetLedgerRow[] = [];
        for (const [normId, row] of eligibleById.entries()) {
            const parentNorm = typeof row.ParentRunID === 'string' && row.ParentRunID.trim().length > 0
                ? row.ParentRunID.trim().toLowerCase()
                : null;
            if (parentNorm && eligibleById.has(parentNorm)) {
                const list = eligibleChildren.get(parentNorm) ?? [];
                list.push(normId);
                eligibleChildren.set(parentNorm, list);
            } else {
                treeRoots.push(row);
            }
        }

        let costUsd = 0;
        let wallClockMs = 0;
        const visitedRoots = new Set<string>();

        for (const root of treeRoots) {
            const rootId = root.ID.trim().toLowerCase();
            if (visitedRoots.has(rootId)) {
                continue;
            }
            const subtreeIds = this.collectSubtreeIds(rootId, eligibleChildren);
            for (const id of subtreeIds) {
                visitedRoots.add(id);
            }

            let directSum = 0;
            for (const id of subtreeIds) {
                const nodeRow = eligibleById.get(id);
                if (nodeRow && typeof nodeRow.TotalCost === 'number' && Number.isFinite(nodeRow.TotalCost)) {
                    directSum += Math.max(0, nodeRow.TotalCost);
                }
            }
            const rootRollup = typeof root.TotalCostRollup === 'number' && Number.isFinite(root.TotalCostRollup) && root.TotalCostRollup > 0
                ? root.TotalCostRollup
                : 0;
            const rootDirect = typeof root.TotalCost === 'number' && Number.isFinite(root.TotalCost)
                ? Math.max(0, root.TotalCost)
                : 0;

            const treeTotalCost = Math.max(rootRollup, rootDirect, directSum);
            if (dailyWindow) {
                const dailyAttr = ComputeHistoricalRowDailyAttribution(
                    root,
                    treeTotalCost,
                    dailyWindow.DayStartMs,
                    dailyWindow.DayEndMs,
                    nowMs,
                    countPausedTime,
                    dailyWindow.DayBucketUTC,
                );
                costUsd += dailyAttr.CostUsd;
                wallClockMs += dailyAttr.WallClockMs;
            } else {
                costUsd += treeTotalCost;
                wallClockMs += this.computeHistoricalRowWallClockMs(root, countPausedTime, nowMs);
            }
        }

        return { CostUsd: costUsd, WallClockMs: wallClockMs };
    }

    private collectExcludedRunTreeIds(
        excludeRunId: string | null,
        rowById: ReadonlyMap<string, AgentRunBudgetLedgerRow>,
        childrenByParentId: ReadonlyMap<string, string[]>,
        additionalExcludedRunIds?: ReadonlySet<string>,
    ): Set<string> {
        const excluded = new Set<string>();
        const seeds: string[] = [];
        if (excludeRunId && excludeRunId.trim().length > 0) {
            seeds.push(excludeRunId.trim().toLowerCase());
        }
        if (additionalExcludedRunIds) {
            for (const rawId of additionalExcludedRunIds) {
                const norm = rawId.trim().toLowerCase();
                if (norm) {
                    seeds.push(norm);
                }
            }
        }
        if (seeds.length === 0) {
            return excluded;
        }

        const queue: string[] = [];
        for (const seedNorm of seeds) {
            if (!excluded.has(seedNorm)) {
                excluded.add(seedNorm);
                queue.push(seedNorm);
            }
        }

        while (queue.length > 0) {
            const cur = queue.shift()!;
            const children = childrenByParentId.get(cur) ?? [];
            for (const childId of children) {
                if (!excluded.has(childId)) {
                    excluded.add(childId);
                    queue.push(childId);
                }
            }
        }

        for (const seedNorm of seeds) {
            let cursorId: string | null = seedNorm;
            const visitedAncestors = new Set<string>([seedNorm]);
            while (cursorId) {
                const row = rowById.get(cursorId);
                const parentId = row && typeof row.ParentRunID === 'string' && row.ParentRunID.trim().length > 0
                    ? row.ParentRunID.trim().toLowerCase()
                    : null;
                if (!parentId || visitedAncestors.has(parentId)) {
                    break;
                }
                visitedAncestors.add(parentId);
                excluded.add(parentId);
                cursorId = parentId;
            }
        }

        return excluded;
    }

    private collectSubtreeIds(
        rootId: string,
        childrenByParent: ReadonlyMap<string, string[]>,
    ): string[] {
        const result: string[] = [];
        const visited = new Set<string>();
        const queue: string[] = [rootId];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (visited.has(cur)) {
                continue;
            }
            visited.add(cur);
            result.push(cur);
            const children = childrenByParent.get(cur) ?? [];
            for (const childId of children) {
                if (!visited.has(childId)) {
                    queue.push(childId);
                }
            }
        }
        return result;
    }

    private buildLedgerUnavailableResult(
        budgets: MJLimitsBudgetsConfig,
        ledger: CumulativeBudgetLedger,
        routineId: string | null,
        userId: string | null,
        errorDetail: string,
    ): BudgetEnforcementResult {
        const base = this.buildEnforcementResult(budgets, ledger, routineId, userId);
        const needRoutine = Boolean(
            routineId && (budgets.PerRoutine.MaxCostUsd !== null || budgets.PerRoutine.MaxWallClockMs !== null),
        );
        const breachedScope: BudgetScope = needRoutine ? 'PerRoutine' : 'PerUserPerDay';
        const configuredLimit = breachedScope === 'PerRoutine'
            ? (budgets.PerRoutine.MaxCostUsd ?? budgets.PerRoutine.MaxWallClockMs ?? 0)
            : (budgets.PerUserPerDay.MaxCostUsd ?? budgets.PerUserPerDay.MaxWallClockMs ?? 0);
        const breach: BudgetBreachDetail = base.Breach ?? {
            Scope: breachedScope,
            Dimension: budgets[breachedScope].MaxCostUsd !== null ? 'CostUsd' : 'WallClockMs',
            Limit: configuredLimit,
            OvershootAllowed: 0,
            EffectiveLimit: configuredLimit,
            Current: ledger.RunCostUsd,
            Reason: `Fail-closed pause: shared ${breachedScope} budget ledger unavailable (${errorDetail})`,
        };
        return {
            ...base,
            Exceeded: true,
            LedgerUnavailable: true,
            LedgerError: errorDetail,
            Breach: breach,
        };
    }

    private computeHistoricalRowWallClockMs(
        row: AgentRunBudgetLedgerRow,
        countPausedTime: boolean,
        nowMs: number,
    ): number {
        const checkpoint = ExtractRunawayCheckpointFromRunData(row.Data);
        if (!row.StartedAt) {
            if (checkpoint && checkpoint.CumulativeLedger.RunWallClockMs > 0 && row.Status === 'Paused' && !countPausedTime) {
                return checkpoint.CumulativeLedger.RunWallClockMs;
            }
            return 0;
        }
        const startMs = new Date(row.StartedAt).getTime();
        const endMs = row.CompletedAt
            ? new Date(row.CompletedAt).getTime()
            : row.Status === 'Paused'
                ? (countPausedTime ? nowMs : (checkpoint?.PausedAtMs ?? nowMs))
                : nowMs;
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            return 0;
        }
        const rawMs = endMs - startMs;
        if (countPausedTime || !checkpoint) {
            return rawMs;
        }
        const intervals = checkpoint.CumulativeLedger.PausedIntervals;
        const applicableIntervals = row.Status === 'Running'
            ? intervals.filter((p) => p.ResumedAtMs !== undefined && p.ResumedAtMs !== null)
            : intervals;
        const pausedMs = ComputeTotalPausedMs(applicableIntervals, endMs);
        return Math.max(0, rawMs - pausedMs);
    }

    private buildEnforcementResult(
        budgets: MJLimitsBudgetsConfig,
        ledger: CumulativeBudgetLedger,
        routineId: string | null,
        userId: string | null,
    ): BudgetEnforcementResult {
        const overshootUsd = Math.max(0, budgets.AllowedInFlightOvershootUsd);
        const overshootMs = Math.max(0, budgets.AllowedInFlightOvershootMs);

        const perRunCostBreach = this.checkCostLimit('PerRun', ledger.RunCostUsd, budgets.PerRun.MaxCostUsd, overshootUsd);
        const perRunWallBreach = this.checkWallLimit('PerRun', ledger.RunWallClockMs, budgets.PerRun.MaxWallClockMs, overshootMs);
        const perRoutineCostBreach = routineId
            ? this.checkCostLimit('PerRoutine', ledger.RoutineCostUsd, budgets.PerRoutine.MaxCostUsd, overshootUsd)
            : null;
        const perRoutineWallBreach = routineId
            ? this.checkWallLimit('PerRoutine', ledger.RoutineWallClockMs, budgets.PerRoutine.MaxWallClockMs, overshootMs)
            : null;
        const perUserCostBreach = userId
            ? this.checkCostLimit('PerUserPerDay', ledger.UserDailyCostUsd, budgets.PerUserPerDay.MaxCostUsd, overshootUsd)
            : null;
        const perUserWallBreach = userId
            ? this.checkWallLimit('PerUserPerDay', ledger.UserDailyWallClockMs, budgets.PerUserPerDay.MaxWallClockMs, overshootMs)
            : null;

        const firstBreach =
            perRunCostBreach ??
            perRunWallBreach ??
            perRoutineCostBreach ??
            perRoutineWallBreach ??
            perUserCostBreach ??
            perUserWallBreach ??
            undefined;

        const scopeStatuses: Record<BudgetScope, BudgetScopeStatus> = {
            PerRun: {
                Scope: 'PerRun',
                CostUsd: ledger.RunCostUsd,
                MaxCostUsd: budgets.PerRun.MaxCostUsd,
                CostExceeded: perRunCostBreach !== null,
                WallClockMs: ledger.RunWallClockMs,
                MaxWallClockMs: budgets.PerRun.MaxWallClockMs,
                WallClockExceeded: perRunWallBreach !== null,
            },
            PerRoutine: {
                Scope: 'PerRoutine',
                CostUsd: ledger.RoutineCostUsd,
                MaxCostUsd: budgets.PerRoutine.MaxCostUsd,
                CostExceeded: perRoutineCostBreach !== null,
                WallClockMs: ledger.RoutineWallClockMs,
                MaxWallClockMs: budgets.PerRoutine.MaxWallClockMs,
                WallClockExceeded: perRoutineWallBreach !== null,
            },
            PerUserPerDay: {
                Scope: 'PerUserPerDay',
                CostUsd: ledger.UserDailyCostUsd,
                MaxCostUsd: budgets.PerUserPerDay.MaxCostUsd,
                CostExceeded: perUserCostBreach !== null,
                WallClockMs: ledger.UserDailyWallClockMs,
                MaxWallClockMs: budgets.PerUserPerDay.MaxWallClockMs,
                WallClockExceeded: perUserWallBreach !== null,
            },
        };

        return {
            Exceeded: firstBreach !== undefined,
            ...(firstBreach ? { Breach: firstBreach } : {}),
            Ledger: ledger,
            ScopeStatuses: scopeStatuses,
        };
    }

    private checkCostLimit(
        scope: BudgetScope,
        currentUsd: number,
        maxUsd: number | null,
        overshootUsd: number,
    ): BudgetBreachDetail | null {
        if (maxUsd === null || !Number.isFinite(maxUsd)) {
            return null;
        }
        const effective = maxUsd + overshootUsd;
        if (currentUsd < effective) {
            return null;
        }
        return {
            Scope: scope,
            Dimension: 'CostUsd',
            Limit: maxUsd,
            OvershootAllowed: overshootUsd,
            EffectiveLimit: effective,
            Current: currentUsd,
            Reason: `${scope} dollar budget exceeded ($${currentUsd.toFixed(4)} / $${maxUsd.toFixed(4)})`,
        };
    }

    private checkWallLimit(
        scope: BudgetScope,
        currentMs: number,
        maxMs: number | null,
        overshootMs: number,
    ): BudgetBreachDetail | null {
        if (maxMs === null || !Number.isFinite(maxMs)) {
            return null;
        }
        const effective = maxMs + overshootMs;
        if (currentMs < effective) {
            return null;
        }
        return {
            Scope: scope,
            Dimension: 'WallClockMs',
            Limit: maxMs,
            OvershootAllowed: overshootMs,
            EffectiveLimit: effective,
            Current: currentMs,
            Reason: `${scope} wall-clock time budget exceeded (${Math.round(currentMs)}ms / ${maxMs}ms)`,
        };
    }
}
