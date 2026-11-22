/**
 * @fileoverview Server implementations of `Limits.*` `BaseRemotableOperation` classes
 * (`Limits.GetDiagnostics`, `Limits.ResumePausedRun`, `Limits.PauseRun`) for inspecting
 * the 5-tier limits hierarchy, approved backstops, budget utilization, deterministic
 * progress & fast-judge diagnostics, and executing non-destructive pause/resume actions.
 *
 * @module @memberjunction/ai-agents
 */

import { randomUUID } from 'node:crypto';
import {
    AuthorizationEvaluator,
    BaseRemotableOperation,
    CODE_FALLBACK_LIMITS,
    CanUserRaiseEnforcedLimitsCeilings,
    LIMITS_KEY_PATHS,
    LIMITS_TIER_PRECEDENCE,
    RunView,
    type IMetadataProvider,
    type LimitsKeyPath,
    type LimitsKeyProvenance,
    type LimitsSourceTier,
    type MJLimitsBudgetsConfig,
    type MJLimitsConfig,
    type RemoteOpServerContext,
    type UserInfo,
} from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentRunEntity, MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import {
    AttachCooperativePauseRequestToRunData,
    ExtractLimitsDiagnosticsFromAgentRun,
    ExtractLimitsDiagnosticsFromRunData,
    ExtractProgressDiagnosticsFromRunData,
    ExtractRunawayCheckpointFromAgentRun,
    ExtractRunawayCheckpointFromRunData,
    LIMITS_GET_DIAGNOSTICS_OPERATION_KEY,
    LIMITS_PAUSE_RUN_OPERATION_KEY,
    LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY,
    LimitsGetDiagnosticsOperation,
    LimitsPauseRunOperation,
    LimitsResumePausedRunOperation,
    ResolveAgentRunLimits,
    type LimitsActiveRunDiagnosticSummary,
    type LimitsBackstopDescriptor,
    type LimitsBudgetScopeUtilization,
    type LimitsBudgetUtilizationSummary,
    type LimitsGetDiagnosticsInput,
    type LimitsGetDiagnosticsOutput,
    type LimitsPauseRunInput,
    type LimitsPauseRunOutput,
    type LimitsResumePausedRunInput,
    type LimitsResumePausedRunOutput,
    type LimitsTierSummary,
    type MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { EscapeSQLString, IsValidUUID, RegisterClass } from '@memberjunction/global';
import { ActiveRunGovernanceRegistry, type ResumeContinuationDispatchResult } from '../ActiveRunGovernanceRegistry';
import { InstallDefaultResumeContinuationDispatcher } from '../DefaultResumeContinuationDispatcher';
import { ComputeActiveWallClockOverlapMs, ComputeDayBoundaryWindow } from '../BudgetEnforcementGuard';
import {
    RunawayCheckpointManager,
    type RunawayResumePreparation,
} from '../RunawayCheckpointManager';

const DEFAULT_INSPECTED_RUNS_LIMIT = 25; // Tuning: default page size for admin limits diagnostics inspection
const MAX_INSPECTED_RUNS_LIMIT = 100; // Tuning: upper bound for admin limits diagnostics query

type ProjectedAgentRunRow = Pick<
    MJAIAgentRunEntity,
    | 'ID'
    | 'AgentID'
    | 'Agent'
    | 'UserID'
    | 'User'
    | 'Status'
    | 'StartedAt'
    | 'CompletedAt'
    | 'TotalCost'
    | 'TotalCostRollup'
    | 'TotalTokensUsed'
    | 'TotalPromptIterations'
    | 'Data'
    | 'Message'
>;

const TIER_DESCRIPTIONS: Record<LimitsSourceTier, string> = {
    CodeFallback: 'Built-in approved code backstops and defaults in @memberjunction/core',
    MjConfig: 'Host deployment overrides loaded from mj.config.cjs limits section',
    AgentOrWorkflowMetadata: 'Per-agent columns, TypeConfiguration.limits, or workflow metadata',
    UserAgentPolicy: 'Per-user active MJ: AI Agent User Policies overrides (can enforce ceilings)',
    RunOverride: 'Per-execution overrides passed via ExecuteAgentParams or limitsOverride',
};

const LIMITS_READ_AUTHORIZATIONS: ReadonlySet<string> = new Set([
    'system administrator',
    'diagnostics: run sessions',
    'ai: manage agents',
]);

function authorizeLimitsRead(user?: UserInfo, provider?: IMetadataProvider): boolean {
    if (!user) {
        return false;
    }
    const userType = typeof user.Type === 'string' ? user.Type.trim().toLowerCase() : '';
    if (userType === 'owner') {
        return true;
    }
    const authorizations = provider?.Authorizations ?? [];
    const evaluator = new AuthorizationEvaluator();
    for (const auth of authorizations) {
        const name = auth.Name?.trim().toLowerCase();
        if (name && LIMITS_READ_AUTHORIZATIONS.has(name) && evaluator.UserCanExecuteWithAncestors(auth, user, authorizations)) {
            return true;
        }
    }
    return false;
}

function authorizeLimitsWrite(user?: UserInfo, provider?: IMetadataProvider): boolean {
    return CanUserRaiseEnforcedLimitsCeilings(user, provider);
}

function buildApprovedBackstops(
    limits: MJLimitsConfig,
    provenance: Record<LimitsKeyPath, LimitsKeyProvenance>,
): LimitsBackstopDescriptor[] {
    const specs: Array<{
        Key: LimitsKeyPath;
        Label: string;
        Category: 'Backstops' | 'Briefing';
        Unit: LimitsBackstopDescriptor['Unit'];
        EffectiveValue: number;
        ApprovedDefaultValue: number;
        Description: string;
    }> = [
        {
            Key: 'AgentChannelConsecutiveTurns',
            Label: 'Agent Channel Consecutive Turns',
            Category: 'Backstops',
            Unit: 'turns',
            EffectiveValue: limits.AgentChannelConsecutiveTurns,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.AgentChannelConsecutiveTurns,
            Description: 'Maximum consecutive peer agent turns in an Agent Channel before pausing for human input.',
        },
        {
            Key: 'AgentChannelWakesPerHour',
            Label: 'Agent Channel Wakes / Hour',
            Category: 'Backstops',
            Unit: 'wakes/hr',
            EffectiveValue: limits.AgentChannelWakesPerHour,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.AgentChannelWakesPerHour,
            Description: 'Maximum peer-agent wakes permitted per hour in an Agent Channel.',
        },
        {
            Key: 'AgentAbsoluteIterations',
            Label: 'Agent Absolute Iterations',
            Category: 'Backstops',
            Unit: 'iterations',
            EffectiveValue: limits.AgentAbsoluteIterations,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.AgentAbsoluteIterations,
            Description: 'System-wide safety net on prompt iterations per agent run.',
        },
        {
            Key: 'MaxTasksPerAgentGraph',
            Label: 'Max Tasks Per Agent Graph',
            Category: 'Backstops',
            Unit: 'nodes',
            EffectiveValue: limits.MaxTasksPerAgentGraph,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.MaxTasksPerAgentGraph,
            Description: 'Maximum nodes permitted in a model-authored task graph.',
        },
        {
            Key: 'WhileLoopMaxIterations',
            Label: 'While Loop Max Iterations',
            Category: 'Backstops',
            Unit: 'iterations',
            EffectiveValue: limits.WhileLoopMaxIterations,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.WhileLoopMaxIterations,
            Description: 'Default iteration ceiling for While loop task-graph nodes.',
        },
        {
            Key: 'ForEachMaxIterations',
            Label: 'ForEach Loop Max Iterations',
            Category: 'Backstops',
            Unit: 'iterations',
            EffectiveValue: limits.ForEachMaxIterations,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.ForEachMaxIterations,
            Description: 'Default iteration ceiling for ForEach loop task-graph nodes.',
        },
        {
            Key: 'MaxTasksPerGraph',
            Label: 'Max Tasks Per Workflow Graph',
            Category: 'Backstops',
            Unit: 'nodes',
            EffectiveValue: limits.MaxTasksPerGraph,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.MaxTasksPerGraph,
            Description: 'Blast-radius ceiling on nodes in any submitted workflow or task graph.',
        },
        {
            Key: 'BriefingContributorTimeoutMs',
            Label: 'Briefing Contributor Timeout',
            Category: 'Briefing',
            Unit: 'ms',
            EffectiveValue: limits.BriefingContributorTimeoutMs,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.BriefingContributorTimeoutMs,
            Description: 'Timeout in milliseconds per briefing skill contributor execution.',
        },
        {
            Key: 'BriefingMaxContributorChars',
            Label: 'Briefing Max Contributor Chars',
            Category: 'Briefing',
            Unit: 'chars',
            EffectiveValue: limits.BriefingMaxContributorChars,
            ApprovedDefaultValue: CODE_FALLBACK_LIMITS.BriefingMaxContributorChars,
            Description: 'Maximum serialized character length retained per briefing contributor.',
        },
    ];

    return specs.map((spec) => {
        const prov = provenance[spec.Key];
        return {
            ...spec,
            SourceTier: prov.SourceTier,
            IsOverridden: prov.IsOverridden,
        };
    });
}

function buildTierSummaries(
    provenance: Record<LimitsKeyPath, LimitsKeyProvenance>,
): LimitsTierSummary[] {
    return LIMITS_TIER_PRECEDENCE.map((tier, index) => {
        let winningCount = 0;
        let suppliedCount = 0;
        for (const key of LIMITS_KEY_PATHS) {
            const prov = provenance[key];
            if (prov.SourceTier === tier) {
                winningCount++;
            }
            if (prov.TierValues[tier] !== undefined) {
                suppliedCount++;
            }
        }
        return {
            Tier: tier,
            Rank: index + 1,
            Description: TIER_DESCRIPTIONS[tier],
            WinningKeyCount: winningCount,
            SuppliedKeyCount: suppliedCount,
        };
    });
}

function toRunSummary(row: ProjectedAgentRunRow): LimitsActiveRunDiagnosticSummary {
    const snapshot = ExtractLimitsDiagnosticsFromRunData(row.Data);
    const progress = ExtractProgressDiagnosticsFromRunData(row.Data);
    const checkpoint = ExtractRunawayCheckpointFromRunData(row.Data);
    const costUsd = typeof row.TotalCostRollup === 'number' && row.TotalCostRollup > 0
        ? row.TotalCostRollup
        : (typeof row.TotalCost === 'number' ? row.TotalCost : 0);

    return {
        AgentRunID: row.ID,
        AgentID: row.AgentID ?? null,
        AgentName: row.Agent ?? checkpoint?.AgentName ?? 'Unknown Agent',
        UserID: row.UserID ?? null,
        UserName: row.User ?? 'Unknown User',
        Status: row.Status ?? 'Unknown',
        StartedAtISO: row.StartedAt ? new Date(row.StartedAt).toISOString() : null,
        CompletedAtISO: row.CompletedAt ? new Date(row.CompletedAt).toISOString() : null,
        TotalCostUsd: costUsd,
        TotalTokensUsed: typeof row.TotalTokensUsed === 'number' ? row.TotalTokensUsed : 0,
        TotalPromptIterations: typeof row.TotalPromptIterations === 'number' ? row.TotalPromptIterations : 0,
        HasLimitsSnapshot: snapshot !== null,
        OverriddenKeyCount: snapshot?.OverriddenKeys.length ?? 0,
        ClampedKeyCount: snapshot?.ClampedKeys.length ?? 0,
        Snapshot: snapshot,
        ProgressClassification: progress?.LastClassification ?? null,
        ProgressScore: progress?.LastScore ?? null,
        ProgressReason: progress?.LastReason ?? null,
        FastJudgeEntries: progress?.FastJudgeEntries ?? [],
        IsPausedWithCheckpoint: row.Status === 'Paused' && checkpoint !== null,
        CheckpointID: checkpoint?.CheckpointID ?? null,
        PauseReason: checkpoint?.PauseReason ?? null,
        PausedAtISO: checkpoint?.PausedAtISO ?? null,
        PauseSummary: checkpoint?.Summary ?? row.Message ?? null,
        CompletedStepCount: checkpoint?.CompletedStepCount ?? 0,
        CompletedPromptTurns: checkpoint?.CompletedPromptTurns ?? 0,
        HumanApprovalStatus: checkpoint?.HumanApproval.Status ?? null,
        CumulativeRunCostUsd: checkpoint?.CumulativeLedger.RunCostUsd ?? costUsd,
        CumulativeRunWallClockMs: checkpoint?.CumulativeLedger.RunWallClockMs ?? 0,
    };
}

function pctOf(observed: number, ceiling: number | null): number | null {
    if (ceiling === null || ceiling <= 0) {
        return null;
    }
    return Math.min(100, Math.round((observed / ceiling) * 1000) / 10);
}

function buildBudgetUtilization(
    limits: MJLimitsConfig,
    runs: readonly LimitsActiveRunDiagnosticSummary[],
    nowMs: number,
): LimitsBudgetUtilizationSummary {
    const activeRuns = runs.filter((r) => r.Status === 'Running');
    const pausedRuns = runs.filter((r) => r.Status === 'Paused');
    const totalCost = runs.reduce((acc, r) => acc + r.TotalCostUsd, 0);
    const totalTokens = runs.reduce((acc, r) => acc + r.TotalTokensUsed, 0);

    const highestRunCost = runs.reduce((max, r) => Math.max(max, r.CumulativeRunCostUsd), 0);
    const highestRunWall = runs.reduce((max, r) => {
        if (r.CumulativeRunWallClockMs > 0) {
            return Math.max(max, r.CumulativeRunWallClockMs);
        }
        if (r.StartedAtISO) {
            const start = Date.parse(r.StartedAtISO);
            const end = r.CompletedAtISO ? Date.parse(r.CompletedAtISO) : nowMs;
            if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
                return Math.max(max, end - start);
            }
        }
        return max;
    }, 0);

    const dayWindow = ComputeDayBoundaryWindow(nowMs, limits.Budgets.PerUserPerDay.DayBoundaryTimezone);
    const dayStartMs = Date.parse(dayWindow.DayStartISO);
    const dayEndMs = Date.parse(dayWindow.DayEndISO);
    let todayCost = 0;
    let todayWall = 0;
    let todayOverlapCount = 0;
    for (const r of runs) {
        if (!r.StartedAtISO) {
            continue;
        }
        const started = Date.parse(r.StartedAtISO);
        if (!Number.isFinite(started) || started >= dayEndMs) {
            continue;
        }
        const ended = r.CompletedAtISO ? Date.parse(r.CompletedAtISO) : nowMs;
        if (!Number.isFinite(ended) || ended <= dayStartMs) {
            continue;
        }
        todayOverlapCount++;
        const overlapWall = ComputeActiveWallClockOverlapMs(
            started,
            ended,
            dayStartMs,
            Math.min(nowMs, dayEndMs),
            undefined,
            limits.Budgets.CountPausedTimeTowardsWallClock,
        );
        todayWall += overlapWall;
        if (started >= dayStartMs) {
            todayCost += r.TotalCostUsd;
        } else if (ended > started) {
            todayCost += r.TotalCostUsd * Math.min(1, overlapWall / (ended - started));
        }
    }

    const routineRuns = runs.filter((r) => Boolean(r.Snapshot?.Context.RoutineID));
    const routineCost = routineRuns.reduce((acc, r) => acc + r.TotalCostUsd, 0);
    const routineWall = routineRuns.reduce((acc, r) => acc + r.CumulativeRunWallClockMs, 0);

    const scopes: LimitsBudgetScopeUtilization[] = [
        {
            Scope: 'PerRun',
            Label: 'Per-Run Ceiling (Peak Inspected Run)',
            MaxCostUsd: limits.Budgets.PerRun.MaxCostUsd,
            ObservedCostUsd: highestRunCost,
            CostUtilizationPct: pctOf(highestRunCost, limits.Budgets.PerRun.MaxCostUsd),
            MaxWallClockMs: limits.Budgets.PerRun.MaxWallClockMs,
            ObservedWallClockMs: highestRunWall,
            WallClockUtilizationPct: pctOf(highestRunWall, limits.Budgets.PerRun.MaxWallClockMs),
            Note: limits.Budgets.PerRun.MaxTokens != null
                ? `Token ceiling: ${limits.Budgets.PerRun.MaxTokens.toLocaleString()} tokens`
                : 'No per-run dollar/token ceiling unless configured per tier.',
        },
        {
            Scope: 'PerRoutine',
            Label: 'Per-Routine Ceiling',
            MaxCostUsd: limits.Budgets.PerRoutine.MaxCostUsd,
            ObservedCostUsd: routineCost,
            CostUtilizationPct: pctOf(routineCost, limits.Budgets.PerRoutine.MaxCostUsd),
            MaxWallClockMs: limits.Budgets.PerRoutine.MaxWallClockMs,
            ObservedWallClockMs: routineWall,
            WallClockUtilizationPct: pctOf(routineWall, limits.Budgets.PerRoutine.MaxWallClockMs),
            Note: `${routineRuns.length} routine-attributed run(s) in recent window.`,
        },
        {
            Scope: 'PerUserPerDay',
            Label: `Per-User Daily Ceiling (${dayWindow.DayBucketUTC} ${limits.Budgets.PerUserPerDay.DayBoundaryTimezone})`,
            MaxCostUsd: limits.Budgets.PerUserPerDay.MaxCostUsd,
            ObservedCostUsd: todayCost,
            CostUtilizationPct: pctOf(todayCost, limits.Budgets.PerUserPerDay.MaxCostUsd),
            MaxWallClockMs: limits.Budgets.PerUserPerDay.MaxWallClockMs,
            ObservedWallClockMs: todayWall,
            WallClockUtilizationPct: pctOf(todayWall, limits.Budgets.PerUserPerDay.MaxWallClockMs),
            Note: `${todayOverlapCount} run(s) overlapping ${limits.Budgets.PerUserPerDay.DayBoundaryTimezone} day bucket.`,
        },
    ];

    return {
        ActiveRunCount: activeRuns.length,
        PausedRunCount: pausedRuns.length,
        InspectedRunCount: runs.length,
        TotalObservedCostUsd: totalCost,
        TotalObservedTokens: totalTokens,
        CountPausedTimeTowardsWallClock: limits.Budgets.CountPausedTimeTowardsWallClock,
        AllowedInFlightOvershootUsd: limits.Budgets.AllowedInFlightOvershootUsd,
        AllowedInFlightOvershootMs: limits.Budgets.AllowedInFlightOvershootMs,
        DayBoundaryTimezone: limits.Budgets.PerUserPerDay.DayBoundaryTimezone,
        Scopes: scopes,
    };
}

/**
 * `Limits.GetDiagnostics` — resolves the active 5-tier limits configuration, per-key
 * provenance, approved backstops, multi-scope budget utilization, deterministic progress
 * diagnostics, fast-judge reasons, and paused runs awaiting approval/resume.
 */
@RegisterClass(BaseRemotableOperation, LIMITS_GET_DIAGNOSTICS_OPERATION_KEY)
export class LimitsGetDiagnosticsServerOperation extends LimitsGetDiagnosticsOperation {
    protected override async Authorize(
        _input: LimitsGetDiagnosticsInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        return authorizeLimitsRead(user, context?.provider);
    }

    protected override async InternalExecute(
        input: LimitsGetDiagnosticsInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<LimitsGetDiagnosticsOutput> {
        const rv = RunView.FromMetadataProvider(provider);
        await ActiveRunGovernanceRegistry.Instance.FlushAllPendingCheckpointsForScope(provider);
        const maxRuns = Math.min(
            MAX_INSPECTED_RUNS_LIMIT,
            Math.max(1, Math.trunc(input?.MaxRuns ?? DEFAULT_INSPECTED_RUNS_LIMIT)),
        );

        let agentEntity: MJAIAgentEntity | null = null;
        if (input?.AgentID && IsValidUUID(input.AgentID)) {
            const agentRes = await rv.RunView<MJAIAgentEntity>(
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `ID='${EscapeSQLString(input.AgentID)}'`,
                    ResultType: 'entity_object',
                    MaxRows: 1,
                },
                user,
            );
            if (agentRes.Success && agentRes.Results.length > 0) {
                agentEntity = agentRes.Results[0];
            }
        }

        let userPolicyEntity: MJAIAgentUserPolicyEntity | null = null;
        if (input?.UserID && IsValidUUID(input.UserID)) {
            const agentClause = input.AgentID && IsValidUUID(input.AgentID)
                ? ` AND AgentID='${EscapeSQLString(input.AgentID)}'`
                : '';
            const policyRes = await rv.RunView<MJAIAgentUserPolicyEntity>(
                {
                    EntityName: 'MJ: AI Agent User Policies',
                    ExtraFilter: `UserID='${EscapeSQLString(input.UserID)}' AND Status='Active'${agentClause}`,
                    ResultType: 'entity_object',
                    MaxRows: 1,
                },
                user,
            );
            if (policyRes.Success && policyRes.Results.length > 0) {
                userPolicyEntity = policyRes.Results[0];
            }
        }

        const resolution = ResolveAgentRunLimits({
            Agent: agentEntity,
            UserPolicy: userPolicyEntity,
            RunOverride: input?.RunOverride ?? null,
            Options: {
                EnforceUserPolicyAsCeiling: Boolean(userPolicyEntity),
            },
        });

        const runFilters: string[] = [];
        if (input?.AgentID && IsValidUUID(input.AgentID)) {
            runFilters.push(`AgentID='${EscapeSQLString(input.AgentID)}'`);
        }
        if (input?.UserID && IsValidUUID(input.UserID)) {
            runFilters.push(`UserID='${EscapeSQLString(input.UserID)}'`);
        }

        const [recentRunsRes, pausedRunsRes] = await rv.RunViews<ProjectedAgentRunRow>(
            [
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: runFilters.join(' AND '),
                    Fields: [
                        'ID',
                        'AgentID',
                        'Agent',
                        'UserID',
                        'User',
                        'Status',
                        'StartedAt',
                        'CompletedAt',
                        'TotalCost',
                        'TotalCostRollup',
                        'TotalTokensUsed',
                        'TotalPromptIterations',
                        'Data',
                        'Message',
                    ],
                    OrderBy: 'StartedAt DESC',
                    MaxRows: maxRuns,
                    ResultType: 'simple',
                },
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: [...runFilters, `Status='Paused'`].join(' AND '),
                    Fields: [
                        'ID',
                        'AgentID',
                        'Agent',
                        'UserID',
                        'User',
                        'Status',
                        'StartedAt',
                        'CompletedAt',
                        'TotalCost',
                        'TotalCostRollup',
                        'TotalTokensUsed',
                        'TotalPromptIterations',
                        'Data',
                        'Message',
                    ],
                    OrderBy: 'StartedAt DESC',
                    MaxRows: maxRuns,
                    ResultType: 'simple',
                },
            ],
            user,
        );

        const seenIds = new Set<string>();
        const combinedRows: ProjectedAgentRunRow[] = [];
        for (const row of [...(pausedRunsRes?.Results ?? []), ...(recentRunsRes?.Results ?? [])]) {
            if (!row?.ID) continue;
            const norm = row.ID.trim().toLowerCase();
            if (seenIds.has(norm)) continue;
            seenIds.add(norm);
            combinedRows.push(row);
        }

        const runSummaries = combinedRows.map(toRunSummary);
        const pendingEntries = ActiveRunGovernanceRegistry.Instance.ListPendingCheckpointPersistenceForScope(provider);
        for (const pending of pendingEntries) {
            const normPendingId = pending.AgentRunID.trim().toLowerCase();
            const existingSummary = runSummaries.find((r) => r.AgentRunID.trim().toLowerCase() === normPendingId);
            if (existingSummary) {
                existingSummary.Status = 'PausePersistencePending';
                existingSummary.CheckpointID = pending.Checkpoint.CheckpointID;
                existingSummary.PauseReason = pending.Checkpoint.PauseReason;
                existingSummary.PausedAtISO = pending.Checkpoint.PausedAtISO;
                existingSummary.PauseSummary = pending.Checkpoint.Summary;
                existingSummary.CompletedStepCount = pending.Checkpoint.CompletedStepCount;
                existingSummary.CompletedPromptTurns = pending.Checkpoint.CompletedPromptTurns;
                existingSummary.HumanApprovalStatus = pending.Checkpoint.HumanApproval.Status;
                existingSummary.CumulativeRunCostUsd = pending.Checkpoint.CumulativeLedger.RunCostUsd;
                existingSummary.CumulativeRunWallClockMs = pending.Checkpoint.CumulativeLedger.RunWallClockMs;
            } else {
                runSummaries.unshift({
                    AgentRunID: pending.AgentRunID,
                    AgentID: pending.Checkpoint.AgentID,
                    AgentName: pending.Checkpoint.AgentName,
                    UserID: pending.Checkpoint.UserID,
                    UserName: 'Unknown User',
                    Status: 'PausePersistencePending',
                    StartedAtISO: null,
                    CompletedAtISO: null,
                    TotalCostUsd: pending.Checkpoint.CumulativeLedger.RunCostUsd,
                    TotalTokensUsed: pending.Checkpoint.CumulativeLedger.RunTokens,
                    TotalPromptIterations: pending.Checkpoint.CompletedPromptTurns,
                    HasLimitsSnapshot: false,
                    OverriddenKeyCount: 0,
                    ClampedKeyCount: 0,
                    Snapshot: null,
                    ProgressClassification: pending.Checkpoint.Evidence.ProgressEvaluation?.Classification ?? null,
                    ProgressScore: pending.Checkpoint.Evidence.ProgressEvaluation?.ProgressScore ?? null,
                    ProgressReason: pending.Checkpoint.Evidence.ProgressEvaluation?.Reason ?? null,
                    FastJudgeEntries: [],
                    IsPausedWithCheckpoint: false,
                    CheckpointID: pending.Checkpoint.CheckpointID,
                    PauseReason: pending.Checkpoint.PauseReason,
                    PausedAtISO: pending.Checkpoint.PausedAtISO,
                    PauseSummary: pending.Checkpoint.Summary,
                    CompletedStepCount: pending.Checkpoint.CompletedStepCount,
                    CompletedPromptTurns: pending.Checkpoint.CompletedPromptTurns,
                    HumanApprovalStatus: pending.Checkpoint.HumanApproval.Status,
                    CumulativeRunCostUsd: pending.Checkpoint.CumulativeLedger.RunCostUsd,
                    CumulativeRunWallClockMs: pending.Checkpoint.CumulativeLedger.RunWallClockMs,
                });
            }
        }
        const pausedRuns = runSummaries.filter((r) => r.Status === 'Paused');

        return {
            ResolvedAtISO: resolution.ResolvedAtISO,
            TierPrecedence: LIMITS_TIER_PRECEDENCE,
            TierSummaries: buildTierSummaries(resolution.Provenance),
            ResolvedLimits: resolution.Limits,
            Provenance: resolution.Provenance,
            OverriddenKeys: [...resolution.OverriddenKeys],
            ClampedKeys: [...resolution.ClampedKeys],
            ApprovedBackstops: buildApprovedBackstops(resolution.Limits, resolution.Provenance),
            BudgetUtilization: buildBudgetUtilization(resolution.Limits, runSummaries, Date.now()),
            ActiveAndRecentRuns: runSummaries,
            PausedRuns: pausedRuns,
        };
    }
}

/**
 * `Limits.ResumePausedRun` — records human approval and optional budget extension on a paused
 * `MJ: AI Agent Runs` checkpoint, then transitions the run cleanly back to `Running` while
 * preserving completed steps, payload, scratchpad, and cumulative USD/wall-clock accounting.
 */
@RegisterClass(BaseRemotableOperation, LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY)
export class LimitsResumePausedRunServerOperation extends LimitsResumePausedRunOperation {
    protected override async Authorize(
        _input: LimitsResumePausedRunInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        return authorizeLimitsWrite(user, context?.provider);
    }

    protected override async InternalExecute(
        input: LimitsResumePausedRunInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<LimitsResumePausedRunOutput> {
        const runId = input?.AgentRunID?.trim();
        if (!runId) {
            throw new Error('AgentRunID is required to resume a paused run');
        }

        const pendingFlush = await ActiveRunGovernanceRegistry.Instance.FlushPendingCheckpointPersistence(
            runId,
            provider,
        );
        if (pendingFlush && !pendingFlush.Saved) {
            return {
                Success: false,
                AgentRunID: runId,
                Status: 'PausePersistencePending',
                CheckpointID: pendingFlush.Checkpoint.CheckpointID,
                ApprovalStatus: pendingFlush.Checkpoint.HumanApproval.Status,
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: pendingFlush.Checkpoint.CumulativeLedger.RunCostUsd,
                PriorCumulativeActiveWallClockMs: pendingFlush.Checkpoint.CumulativeLedger.RunWallClockMs,
                StartingStepCount: pendingFlush.Checkpoint.CompletedStepCount,
                StartingPromptTurns: pendingFlush.Checkpoint.CompletedPromptTurns,
                Message:
                    `Cannot resume run ${runId}: safe-point checkpoint persistence is still pending ` +
                    `(${pendingFlush.SaveError ?? 'storage unavailable'}).`,
            };
        }

        const agentRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', user);
        const loaded = await agentRun.Load(runId);
        if (!loaded) {
            throw new Error(`Could not load paused MJ: AI Agent Runs record '${runId}'`);
        }

        const checkpointManager = new RunawayCheckpointManager();
        const existingCheckpoint = ExtractRunawayCheckpointFromAgentRun(agentRun);
        const priorStatus = agentRun.Status;
        const priorData = agentRun.Data;
        const priorMessage = agentRun.Message;
        const priorCompletedAt = agentRun.CompletedAt;
        const priorSuccess = agentRun.Success;
        const priorErrorMessage = agentRun.ErrorMessage;

        const alreadyApproved = existingCheckpoint?.HumanApproval.Status === 'Approved';
        const isAlreadyActivelyRunning =
            agentRun.Status === 'Running' &&
            alreadyApproved &&
            (Boolean(ActiveRunGovernanceRegistry.Instance.GetActiveRun(runId, provider)) ||
                existingCheckpoint?.HumanApproval.ResumeClaim?.Status === 'Started');
        const hasNewApprovalInputs =
            input.BudgetExtension !== undefined ||
            (typeof input.DecisionNotes === 'string' && input.DecisionNotes.trim().length > 0);

        if (input.PrepareResume === false) {
            const approvedCheckpoint = alreadyApproved && !hasNewApprovalInputs
                ? existingCheckpoint!
                : await checkpointManager.ApproveCheckpoint({
                    AgentRun: agentRun,
                    ApprovedByUserID: user.ID,
                    BudgetExtension: input.BudgetExtension,
                    DecisionNotes: input.DecisionNotes ?? null,
                    Provider: provider,
                    ContextUser: user,
                });
            return {
                Success: true,
                AgentRunID: runId,
                Status: 'Paused',
                CheckpointID: approvedCheckpoint.CheckpointID,
                ApprovalStatus: approvedCheckpoint.HumanApproval.Status,
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: approvedCheckpoint.CumulativeLedger.RunCostUsd,
                PriorCumulativeActiveWallClockMs: approvedCheckpoint.CumulativeLedger.RunWallClockMs,
                StartingStepCount: approvedCheckpoint.CompletedStepCount,
                StartingPromptTurns: approvedCheckpoint.CompletedPromptTurns,
                Message: `Checkpoint ${approvedCheckpoint.CheckpointID} approved for run ${runId}.`,
            };
        }

        if (!ActiveRunGovernanceRegistry.Instance.HasContinuationDispatcher()) {
            return {
                Success: false,
                AgentRunID: runId,
                Status: priorStatus,
                CheckpointID: existingCheckpoint?.CheckpointID ?? null,
                ApprovalStatus: existingCheckpoint?.HumanApproval.Status ?? 'Pending',
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: existingCheckpoint?.CumulativeLedger.RunCostUsd ?? 0,
                PriorCumulativeActiveWallClockMs: existingCheckpoint?.CumulativeLedger.RunWallClockMs ?? 0,
                StartingStepCount: existingCheckpoint?.CompletedStepCount ?? 0,
                StartingPromptTurns: existingCheckpoint?.CompletedPromptTurns ?? 0,
                Message: `Cannot resume run ${runId}: no continuation dispatcher is available; run remains ${priorStatus}.`,
            };
        }

        const baseBudgets = await this.resolvePausedRunBaseBudgets(agentRun, provider, user);
        const needPersistApproval =
            agentRun.Status === 'Paused' && (!alreadyApproved || hasNewApprovalInputs);
        const approvedCheckpoint = needPersistApproval
            ? await checkpointManager.ApproveCheckpoint({
                AgentRun: agentRun,
                ApprovedByUserID: user.ID,
                BudgetExtension: input.BudgetExtension,
                DecisionNotes: input.DecisionNotes ?? null,
                Provider: provider,
                ContextUser: user,
            })
            : existingCheckpoint;

        if (!approvedCheckpoint || approvedCheckpoint.HumanApproval.Status !== 'Approved') {
            throw new Error(
                `Cannot resume run ${runId}: no approved RunawayCheckpoint is persisted on status '${agentRun.Status}'.`,
            );
        }

        // CR-14: Build preparation WITHOUT mutating agentRun.Status to 'Running' or calling Save().
        // Persisted Status remains 'Paused' (unless already in crash-recovery on an unstarted 'Running' claim)
        // throughout DispatchContinuation until the dispatcher explicitly accepts ownership.
        const preparation: RunawayResumePreparation = await checkpointManager.BuildResumePreparation({
            AgentRun: agentRun,
            BaseBudgets: baseBudgets,
            Provider: provider,
            ContextUser: user,
        });

        let dispatchResult: ResumeContinuationDispatchResult | null = null;
        let dispatchError: string | null = null;
        try {
            dispatchResult = await ActiveRunGovernanceRegistry.Instance.DispatchContinuation({
                AgentRunID: runId,
                AgentID: preparation.Checkpoint.AgentID || agentRun.AgentID,
                UserID: preparation.Checkpoint.UserID ?? agentRun.UserID ?? null,
                RoutineID: preparation.Checkpoint.RoutineID,
                CheckpointID: approvedCheckpoint.CheckpointID,
                RestoredContext: preparation,
                Provider: provider,
                ContextUser: user,
            });
        } catch (err) {
            dispatchError = err instanceof Error ? err.message : String(err);
        }

        if (dispatchError || !dispatchResult || !dispatchResult.Dispatched) {
            const reason = dispatchError ?? dispatchResult?.Message ?? 'Continuation dispatcher declined execution.';
            if (needPersistApproval || agentRun.Status !== priorStatus || agentRun.Data !== priorData) {
                agentRun.Status = priorStatus;
                agentRun.Data = priorData;
                agentRun.Message = priorMessage;
                agentRun.CompletedAt = priorCompletedAt;
                agentRun.Success = priorSuccess;
                agentRun.ErrorMessage = priorErrorMessage;
                let rollbackSaved = false;
                let rollbackErr: string | null = null;
                try {
                    rollbackSaved = await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
                    if (!rollbackSaved) {
                        rollbackErr = agentRun.LatestResult?.CompleteMessage || 'agentRun.Save() returned false';
                    }
                } catch (saveErr) {
                    rollbackErr = saveErr instanceof Error ? saveErr.message : String(saveErr);
                }
                if (!rollbackSaved) {
                    return {
                        Success: false,
                        AgentRunID: runId,
                        Status: agentRun.Status,
                        CheckpointID: approvedCheckpoint.CheckpointID,
                        ApprovalStatus: existingCheckpoint?.HumanApproval.Status ?? approvedCheckpoint.HumanApproval.Status,
                        ExtendedBudgets: null,
                        PriorCumulativeCostUsd: preparation.PriorCumulativeCostUsd,
                        PriorCumulativeActiveWallClockMs: preparation.PriorCumulativeActiveWallClockMs,
                        StartingStepCount: preparation.StartingStepCount,
                        StartingPromptTurns: preparation.StartingPromptTurns,
                        Message: `Failed closed resuming run ${runId}: ${reason} Rollback persistence failed (${rollbackErr ?? 'unknown error'}).`,
                    };
                }
            }
            return {
                Success: false,
                AgentRunID: runId,
                Status: agentRun.Status,
                CheckpointID: approvedCheckpoint.CheckpointID,
                ApprovalStatus: existingCheckpoint?.HumanApproval.Status ?? approvedCheckpoint.HumanApproval.Status,
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: preparation.PriorCumulativeCostUsd,
                PriorCumulativeActiveWallClockMs: preparation.PriorCumulativeActiveWallClockMs,
                StartingStepCount: preparation.StartingStepCount,
                StartingPromptTurns: preparation.StartingPromptTurns,
                Message: `Failed to resume run ${runId}: ${reason} Run remains ${agentRun.Status}.`,
            };
        }

        // Only commit 'Running' after DispatchContinuation accepted ownership (and did not already complete synchronously).
        if (!isAlreadyActivelyRunning && !dispatchResult.Completed && agentRun.Status === 'Paused') {
            await checkpointManager.CommitResumeRunningState({
                AgentRun: agentRun,
                Preparation: preparation,
            });
        }

        const effectiveStatus = dispatchResult.Status ?? agentRun.Status;
        const dispatchSuffix = dispatchResult.Message ? ` ${dispatchResult.Message}` : '';
        return {
            Success: true,
            AgentRunID: runId,
            Status: effectiveStatus,
            CheckpointID: preparation.Checkpoint.CheckpointID,
            ApprovalStatus: preparation.Checkpoint.HumanApproval.Status,
            ExtendedBudgets: preparation.ExtendedBudgets,
            PriorCumulativeCostUsd: preparation.PriorCumulativeCostUsd,
            PriorCumulativeActiveWallClockMs: preparation.PriorCumulativeActiveWallClockMs,
            StartingStepCount: preparation.StartingStepCount,
            StartingPromptTurns: preparation.StartingPromptTurns,
            Message:
                `Run ${runId} approved and transitioned back to ${effectiveStatus} preserving ${preparation.StartingStepCount} completed step(s).` +
                dispatchSuffix,
        };
    }

    /**
     * Recovers approved-but-unstarted checkpoint resumes after a process crash/restart (CR-14).
     * Scans `Paused` and `Running` runs whose persisted checkpoint carries `HumanApproval.Status === 'Approved'`
     * without `ResumeClaim.Status === 'Started'` (and with no live in-process run handle).
     */
    public static async RecoverApprovedUnstartedResumes(input: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        MaxRuns?: number;
    }): Promise<LimitsResumePausedRunOutput[]> {
        if (!ActiveRunGovernanceRegistry.Instance.HasContinuationDispatcher()) {
            return [];
        }
        const rv = RunView.FromMetadataProvider(input.Provider);
        const res = await rv.RunView<Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'Data'>>(
            {
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `Status IN ('Paused', 'Running') AND Data LIKE '%__runawayCheckpoint%'`,
                Fields: ['ID', 'Status', 'Data'],
                MaxRows: input.MaxRuns ?? 50,
                ResultType: 'simple',
            },
            input.ContextUser,
        );
        if (!res?.Success || !Array.isArray(res.Results)) {
            return [];
        }

        const operation = new LimitsResumePausedRunServerOperation();
        const recovered: LimitsResumePausedRunOutput[] = [];
        for (const row of res.Results) {
            if (!row?.ID) continue;
            const cp = ExtractRunawayCheckpointFromRunData(row.Data);
            if (!cp || cp.HumanApproval.Status !== 'Approved') continue;
            if (cp.HumanApproval.ResumeClaim?.Status === 'Started') continue;
            if (ActiveRunGovernanceRegistry.Instance.GetActiveRun(row.ID, input.Provider)) continue;

            const outcome = await operation.InternalExecute(
                { AgentRunID: row.ID, PrepareResume: true },
                input.Provider,
                input.ContextUser,
            );
            recovered.push(outcome);
        }
        return recovered;
    }

    private async resolvePausedRunBaseBudgets(
        agentRun: MJAIAgentRunEntityExtended,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<MJLimitsBudgetsConfig> {
        const snapshot = ExtractLimitsDiagnosticsFromAgentRun(agentRun);
        if (snapshot) {
            return snapshot.ResolvedLimits.Budgets;
        }

        let agentEntity: MJAIAgentEntity | null = null;
        let userPolicyEntity: MJAIAgentUserPolicyEntity | null = null;
        try {
            const rv = RunView.FromMetadataProvider(provider);
            if (agentRun.AgentID && IsValidUUID(agentRun.AgentID)) {
                const agentRes = await rv.RunView<MJAIAgentEntity>(
                    {
                        EntityName: 'MJ: AI Agents',
                        ExtraFilter: `ID='${EscapeSQLString(agentRun.AgentID)}'`,
                        ResultType: 'entity_object',
                        MaxRows: 1,
                    },
                    user,
                );
                if (agentRes?.Success && agentRes.Results.length > 0) {
                    agentEntity = agentRes.Results[0];
                }
            }
            if (agentRun.UserID && IsValidUUID(agentRun.UserID)) {
                const agentClause = agentRun.AgentID && IsValidUUID(agentRun.AgentID)
                    ? ` AND AgentID='${EscapeSQLString(agentRun.AgentID)}'`
                    : '';
                const policyRes = await rv.RunView<MJAIAgentUserPolicyEntity>(
                    {
                        EntityName: 'MJ: AI Agent User Policies',
                        ExtraFilter: `UserID='${EscapeSQLString(agentRun.UserID)}' AND Status='Active'${agentClause}`,
                        ResultType: 'entity_object',
                        MaxRows: 1,
                    },
                    user,
                );
                if (policyRes?.Success && policyRes.Results.length > 0) {
                    userPolicyEntity = policyRes.Results[0];
                }
            }
        } catch {
            // Fall back to ResolveAgentRunLimits defaults when metadata RunView is unavailable in offline harnesses
        }

        return ResolveAgentRunLimits({
            Agent: agentEntity,
            UserPolicy: userPolicyEntity,
            Options: { EnforceUserPolicyAsCeiling: Boolean(userPolicyEntity) },
        }).Limits.Budgets;
    }
}

/**
 * `Limits.PauseRun` — non-destructively pauses an active `Running` agent run with a persisted
 * checkpoint so administrators can halt runaway work without discarding completed steps or state.
 */
@RegisterClass(BaseRemotableOperation, LIMITS_PAUSE_RUN_OPERATION_KEY)
export class LimitsPauseRunServerOperation extends LimitsPauseRunOperation {
    protected override async Authorize(
        _input: LimitsPauseRunInput,
        user: UserInfo,
        context?: RemoteOpServerContext,
    ): Promise<boolean> {
        return authorizeLimitsWrite(user, context?.provider);
    }

    protected override async InternalExecute(
        input: LimitsPauseRunInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<LimitsPauseRunOutput> {
        const runId = input?.AgentRunID?.trim();
        if (!runId) {
            throw new Error('AgentRunID is required to pause a run');
        }

        const pendingFlush = await ActiveRunGovernanceRegistry.Instance.FlushPendingCheckpointPersistence(
            runId,
            provider,
        );
        if (pendingFlush) {
            if (pendingFlush.Saved) {
                return {
                    Success: true,
                    Pending: false,
                    AgentRunID: runId,
                    Status: 'Paused',
                    CheckpointID: pendingFlush.Checkpoint.CheckpointID,
                    Message: `Flushed pending safe-point checkpoint ${pendingFlush.Checkpoint.CheckpointID} for run ${runId}; run is now Paused.`,
                };
            }
            return {
                Success: false,
                Pending: true,
                AgentRunID: runId,
                Status: 'PausePersistencePending',
                CheckpointID: pendingFlush.Checkpoint.CheckpointID,
                Message:
                    `Safe-point checkpoint ${pendingFlush.Checkpoint.CheckpointID} for run ${runId} remains in memory ` +
                    `awaiting storage recovery (${pendingFlush.SaveError ?? 'Save() failed'}).`,
            };
        }

        const agentRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', user);
        const loaded = await agentRun.Load(runId);
        if (!loaded) {
            throw new Error(`Could not load MJ: AI Agent Runs record '${runId}'`);
        }
        if (agentRun.Status !== 'Running') {
            throw new Error(`Cannot pause run '${runId}': status is '${agentRun.Status}', expected 'Running'`);
        }

        const requestedSummary = input.Summary?.trim() || `Manually paused by administrator ${user.Name || user.Email || user.ID}`;
        const cooperativeResult = await ActiveRunGovernanceRegistry.Instance.RequestCooperativePause(
            runId,
            requestedSummary,
            provider,
        );
        if (cooperativeResult) {
            if (cooperativeResult.Paused) {
                return {
                    Success: true,
                    Pending: false,
                    AgentRunID: runId,
                    Status: cooperativeResult.Status,
                    CheckpointID: cooperativeResult.CheckpointID,
                    Message: `Run ${runId} cooperatively paused at safe boundary (checkpoint ${cooperativeResult.CheckpointID ?? 'n/a'}).`,
                };
            }
            return {
                Success: false,
                Pending: false,
                AgentRunID: runId,
                Status: cooperativeResult.Status,
                CheckpointID: cooperativeResult.CheckpointID,
                Message: cooperativeResult.Summary || `Run ${runId} failed to persist cooperative pause checkpoint.`,
            };
        }

        // No in-process worker handle on this server: persist a durable cooperative pause signal
        // for the owning remote worker to pick up at its next safe boundary rather than fabricating
        // an incomplete checkpoint while the remote worker is still running.
        agentRun.Data = AttachCooperativePauseRequestToRunData(agentRun.Data, {
            RequestID: randomUUID(),
            RequestedAtISO: new Date().toISOString(),
            RequestedByUserID: user.ID ?? null,
            Summary: requestedSummary,
        });
        const signalSaved = await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
        if (!signalSaved) {
            const errDetail = agentRun.LatestResult?.CompleteMessage || 'agentRun.Save() returned false';
            return {
                Success: false,
                Pending: false,
                AgentRunID: runId,
                Status: agentRun.Status,
                CheckpointID: null,
                Message: `Failed to persist cooperative pause signal for remote run ${runId}: ${errDetail}.`,
            };
        }

        return {
            Success: false,
            Pending: true,
            AgentRunID: runId,
            Status: agentRun.Status,
            CheckpointID: null,
            Message:
                `Cooperative pause request persisted for remote worker on run ${runId}; ` +
                `awaiting owning worker safe-point checkpoint acknowledgment.`,
        };
    }
}

/** Retains `Limits.*` `BaseRemotableOperation` registrations against bundler tree-shaking. */
export function LoadLimitsOperations(): void {
    InstallDefaultResumeContinuationDispatcher();
    void LimitsGetDiagnosticsServerOperation;
    void LimitsResumePausedRunServerOperation;
    void LimitsPauseRunServerOperation;
}
