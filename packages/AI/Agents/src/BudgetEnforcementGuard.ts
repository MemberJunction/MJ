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
    ExtractLimitsDiagnosticsFromRunData,
    ExtractRunawayCheckpointFromRunData,
    type BudgetBreachDetail,
    type BudgetEnforcementResult,
    type BudgetExtensionGrant,
    type BudgetPausedInterval,
    type BudgetScope,
    type BudgetScopeStatus,
    type CumulativeBudgetLedger,
} from '@memberjunction/ai-core-plus';
import { EscapeSQLString, IsPlainObject, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';

/** Narrow projected row returned from `MJ: AI Agent Runs` for budget ledger aggregation. */
export type AgentRunBudgetLedgerRow = Pick<
    MJAIAgentRunEntity,
    | 'ID'
    | 'UserID'
    | 'TotalCost'
    | 'TotalCostRollup'
    | 'StartedAt'
    | 'CompletedAt'
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
    PausedIntervals?: readonly BudgetPausedInterval[];
    NowMs?: number;
    Provider?: IMetadataProvider;
    ContextUser?: UserInfo;
    LedgerReader?: BudgetLedgerReader;
}

const AGENT_RUN_ENTITY = 'MJ: AI Agent Runs';

/**
 * Computes the UTC day window `[DayStartISO, DayEndISO)` and canonical `YYYY-MM-DD` bucket
 * for a given epoch timestamp and timezone.
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
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const localDate = formatter.format(date);
        const offsetMinutes = computeTimezoneOffsetMinutes(date, timezone);
        const startUtcMs = Date.parse(`${localDate}T00:00:00.000Z`) - offsetMinutes * 60_000;
        const endUtcMs = startUtcMs + 86_400_000;
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

function computeTimezoneOffsetMinutes(date: Date, timezone: string): number {
    const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzString = date.toLocaleString('en-US', { timeZone: timezone });
    const utcMs = new Date(utcString).getTime();
    const tzMs = new Date(tzString).getTime();
    return Math.round((tzMs - utcMs) / 60_000);
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
        const scopedHistorical = await this.loadHistoricalScopeUsage(input, dayWindow.DayStartISO, dayWindow.DayEndISO, nowMs);

        const routineCostUsd = scopedHistorical.Routine.CostUsd + runCostUsd;
        const routineWallClockMs = scopedHistorical.Routine.WallClockMs + runWallClockMs;
        const userDailyCostUsd = scopedHistorical.UserDaily.CostUsd + runCostUsd;
        const userDailyWallClockMs = scopedHistorical.UserDaily.WallClockMs + runWallClockMs;

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
            AsOfISO: new Date(nowMs).toISOString(),
        };

        return this.buildEnforcementResult(input.Budgets, ledger, input.RoutineID ?? null, input.UserID ?? null);
    }

    private async loadHistoricalScopeUsage(
        input: BudgetEnforcementInput,
        dayStartISO: string,
        dayEndISO: string,
        nowMs: number,
    ): Promise<{ Routine: ScopeHistoricalUsage; UserDaily: ScopeHistoricalUsage }> {
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
            return input.LedgerReader.ReadScopedUsage({
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
        }

        return this.queryLedgerViaBatchedRunViews({
            Provider: input.Provider,
            ContextUser: input.ContextUser,
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
    }

    private async queryLedgerViaBatchedRunViews(args: {
        Provider?: IMetadataProvider;
        ContextUser?: UserInfo;
        RoutineID: string | null;
        UserID: string | null;
        ExcludeRunID: string | null;
        DayStartISO: string;
        DayEndISO: string;
        NeedRoutine: boolean;
        NeedUserDaily: boolean;
        CountPausedTimeTowardsWallClock: boolean;
        NowMs: number;
    }): Promise<{ Routine: ScopeHistoricalUsage; UserDaily: ScopeHistoricalUsage }> {
        const queries: RunViewParams[] = [];
        const queryKinds: Array<'routine' | 'userDaily'> = [];
        const fields = ['ID', 'UserID', 'TotalCost', 'TotalCostRollup', 'StartedAt', 'CompletedAt', 'ScheduledJobRunID', 'Status', 'Data'];

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
            queries.push({
                EntityName: AGENT_RUN_ENTITY,
                ExtraFilter: `UserID='${EscapeSQLString(args.UserID)}' AND StartedAt >= '${EscapeSQLString(args.DayStartISO)}' AND StartedAt < '${EscapeSQLString(args.DayEndISO)}'`,
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            queryKinds.push('userDaily');
        }

        let routineRows: AgentRunBudgetLedgerRow[] = [];
        let userDailyRows: AgentRunBudgetLedgerRow[] = [];

        try {
            const rv = args.Provider ? RunView.FromMetadataProvider(args.Provider) : new RunView();
            const results = await rv.RunViews<AgentRunBudgetLedgerRow>(queries, args.ContextUser);
            for (let i = 0; i < queryKinds.length; i++) {
                const res = results[i];
                if (!res?.Success) {
                    LogError(`BudgetEnforcementGuard: RunViews failed for ${queryKinds[i]}: ${res?.ErrorMessage ?? 'unknown error'}`);
                    continue;
                }
                const rows = Array.isArray(res.Results) ? res.Results : [];
                if (queryKinds[i] === 'routine') {
                    routineRows = rows.filter((r) => this.rowMatchesRoutine(r, args.RoutineID!));
                } else {
                    userDailyRows = rows;
                }
            }
        } catch (err) {
            LogError(`BudgetEnforcementGuard: RunViews error: ${err instanceof Error ? err.message : String(err)}`);
        }

        return {
            Routine: this.aggregateLedgerRows(routineRows, args.ExcludeRunID, args.CountPausedTimeTowardsWallClock, args.NowMs),
            UserDaily: this.aggregateLedgerRows(userDailyRows, args.ExcludeRunID, args.CountPausedTimeTowardsWallClock, args.NowMs),
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
            const parsed = SafeJSONParse<Record<string, unknown>>(row.Data);
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
    ): ScopeHistoricalUsage {
        let costUsd = 0;
        let wallClockMs = 0;
        const seenRunIds = new Set<string>();

        for (const row of rows) {
            if (!row?.ID || UUIDsEqual(row.ID, excludeRunId)) {
                continue;
            }
            const normId = row.ID.trim().toLowerCase();
            if (seenRunIds.has(normId)) {
                continue;
            }
            seenRunIds.add(normId);

            const rowCost = typeof row.TotalCostRollup === 'number' && row.TotalCostRollup > 0
                ? row.TotalCostRollup
                : (typeof row.TotalCost === 'number' ? row.TotalCost : 0);
            costUsd += Math.max(0, rowCost);
            wallClockMs += this.computeHistoricalRowWallClockMs(row, countPausedTime, nowMs);
        }

        return { CostUsd: costUsd, WallClockMs: wallClockMs };
    }

    private computeHistoricalRowWallClockMs(
        row: AgentRunBudgetLedgerRow,
        countPausedTime: boolean,
        nowMs: number,
    ): number {
        const checkpoint = ExtractRunawayCheckpointFromRunData(row.Data);
        if (checkpoint && checkpoint.CumulativeLedger.RunWallClockMs > 0 && row.Status === 'Paused') {
            return checkpoint.CumulativeLedger.RunWallClockMs;
        }
        if (!row.StartedAt) {
            return 0;
        }
        const startMs = new Date(row.StartedAt).getTime();
        const endMs = row.CompletedAt
            ? new Date(row.CompletedAt).getTime()
            : (checkpoint?.PausedAtMs ?? nowMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            return 0;
        }
        const rawMs = endMs - startMs;
        if (countPausedTime || !checkpoint) {
            return rawMs;
        }
        const pausedMs = ComputeTotalPausedMs(checkpoint.CumulativeLedger.PausedIntervals, endMs);
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
