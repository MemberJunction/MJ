/**
 * @fileoverview Cohesive internal collaborator handling non-destructive checkpoint pausing,
 * cooperative pause registration/polling, budget ledger snapshots, and durable late-settlement
 * reconciliation for `FastConvergenceJudge` evaluations.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s7`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import {
    AttachBudgetAttributionToRunData,
    type BaseAgentNextStep,
    type BudgetBreachDetail,
    ClearCooperativePauseRequestFromRunData,
    type CooperativePauseRequestSignal,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    ExtractBudgetCostEventsFromRunData,
    ExtractBudgetDayBaselinesFromRunData,
    ExtractCooperativePauseRequestFromRunData,
    type MJAIAgentRunEntityExtended,
    type PendingLoopCursorState,
    type ProgressEvaluationResult,
    type RunawayJsonValue,
    type RunawayPauseReason,
    type RunawaySerializable,
    ToRunawayJsonValue,
} from '@memberjunction/ai-core-plus';
import {
    type IMetadataProvider,
    type IRunViewProvider,
    LogError,
    RunView,
} from '@memberjunction/core';
import { EscapeSQLString, IsPlainObject, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    ActiveRunGovernanceRegistry,
    type CooperativePauseResult,
} from '../../ActiveRunGovernanceRegistry';
import { AgentRunWatchdog } from '../../agent-run-watchdog';
import {
    BudgetEnforcementGuard,
    type BudgetEnforcementInput,
    ComputeDayBoundaryWindow,
} from '../../BudgetEnforcementGuard';
import type { FastJudgeUsageSettlement } from '../../FastConvergenceJudge';
import type {
    PauseRunWithCheckpointInput,
    PauseRunWithCheckpointResult,
    PendingRunawayCheckpointPersistence,
} from '../../RunawayCheckpointManager';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    AgentBudgetLedgerSnapshot,
    GuardrailVerdict,
    PausedRunOutcome,
    PauseNonDestructivelyDetails,
    PendingDurableFastJudgeSettlement,
    RunLateJudgeScope,
} from '../base-agent-types';

const RECONCILED_FAST_JUDGE_IDS_DATA_KEY = '__reconciledFastJudgeIds' as const;

export function ExtractReconciledFastJudgeIdsFromRunData(dataJson: string | null | undefined): Set<string> {
    const ids = new Set<string>();
    if (typeof dataJson !== 'string' || dataJson.trim().length === 0) {
        return ids;
    }
    const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(dataJson);
    if (!IsPlainObject(parsed)) {
        return ids;
    }
    const raw = parsed[RECONCILED_FAST_JUDGE_IDS_DATA_KEY];
    if (!Array.isArray(raw)) {
        return ids;
    }
    for (const item of raw) {
        if (typeof item === 'string' && item.trim().length > 0) {
            ids.add(item);
        }
    }
    return ids;
}

export function AttachReconciledFastJudgeIdToRunData(
    existingDataJson: string | null | undefined,
    invocationId: string
): string {
    let baseData: Record<string, RunawayJsonValue> = {};
    if (typeof existingDataJson === 'string' && existingDataJson.trim().length === 0 === false) {
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(existingDataJson);
        if (IsPlainObject(parsed)) {
            baseData = { ...parsed };
        }
    }
    const existingIds = ExtractReconciledFastJudgeIdsFromRunData(existingDataJson);
    existingIds.add(invocationId);
    baseData[RECONCILED_FAST_JUDGE_IDS_DATA_KEY] = ToRunawayJsonValue(Array.from(existingIds));
    return JSON.stringify(baseData);
}

/**
 * Handles non-destructive checkpoint pausing, cooperative pause coordination, budget
 * ledger snapshots, and `FastConvergenceJudge` late-settlement reconciliation on behalf of
 * {@link AgentLimitsHelper}.
 */
export class AgentCheckpointAndPauseHelper {
    // 2s minimum interval between cross-server DB checks for cooperative pause requests
    private static readonly REMOTE_PAUSE_POLL_INTERVAL_MS = 2_000;

    // --- Pending checkpoint flush ---

    public async FlushPendingCheckpointPersistence(
        ctx: AgentRunContext,
        agentRunId?: string,
        provider?: IMetadataProvider | null
    ): Promise<PauseRunWithCheckpointResult | null> {
        const targetRunId = agentRunId ?? ctx.PendingCheckpointPersistence?.AgentRunID ?? ctx.AgentRun?.ID;
        const targetProvider = provider ?? ctx.PendingCheckpointPersistence?.Provider ?? ctx.ActiveProvider ?? null;
        if (!targetRunId) {
            return null;
        }
        const registryResult = await ActiveRunGovernanceRegistry.Instance.FlushPendingCheckpointPersistence(
            targetRunId,
            targetProvider,
            undefined,
            ctx.CheckpointManager
        );
        if (registryResult) {
            if (registryResult.Saved) {
                this.clearLocalPendingCheckpointIfMatches(ctx, targetRunId, registryResult);
            }
            return registryResult;
        }
        if (
            ctx.PendingCheckpointPersistence &&
            UUIDsEqual(ctx.PendingCheckpointPersistence.AgentRunID, targetRunId)
        ) {
            const localResult = await ctx.CheckpointManager.FlushPendingCheckpointPersistence(
                ctx.PendingCheckpointPersistence
            );
            if (localResult.Saved) {
                this.clearLocalPendingCheckpointIfMatches(ctx, targetRunId, localResult);
            }
            return localResult;
        }
        return null;
    }

    private clearLocalPendingCheckpointIfMatches(
        ctx: AgentRunContext,
        runId: string,
        flushed: PauseRunWithCheckpointResult
    ): void {
        if (ctx.PendingCheckpointPersistence && UUIDsEqual(ctx.PendingCheckpointPersistence.AgentRunID, runId)) {
            ctx.PendingCheckpointPersistence = null;
        }
        if (ctx.PausedRunOutcome && UUIDsEqual(ctx.PausedRunOutcome.PauseResult.Checkpoint.AgentRunID, runId)) {
            ctx.PausedRunOutcome = {
                ...ctx.PausedRunOutcome,
                PauseResult: flushed,
                PausePersistencePending: false,
            };
        }
    }

    // --- Cooperative pause & budget breach triggers ---

    public async CheckAndPauseOnBudgetBreach<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        inFlightPayload: P,
        nextStepToResume: BaseAgentNextStep<P> | null,
        loopCursor?: PendingLoopCursorState | null
    ): Promise<PausedRunOutcome | null> {
        if (!ctx.AgentRun) {
            return null;
        }
        this.DrainPendingFastJudgeUsage(ctx);
        const evalInput = this.BuildBudgetEvaluationInput(ctx, params);
        const result = await ctx.BudgetEnforcementGuard.Evaluate(evalInput);
        this.recordDayBudgetSnapshot(ctx, evalInput, result.Ledger);
        if (!result.Exceeded || !result.Breach) {
            return null;
        }
        const pauseReason: RunawayPauseReason = result.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
        return ctx.Hooks.PauseNonDestructively(params, {
            PauseReason: pauseReason,
            Summary: result.Breach.Reason,
            InFlightPayload: inFlightPayload as RunawaySerializable,
            NextStepToResume: nextStepToResume,
            LoopCursor: loopCursor ?? null,
            BudgetBreach: result.Breach,
            Ledger: result.Ledger,
        });
    }

    public RegisterActiveRunForCooperativePause(ctx: AgentRunContext): void {
        if (!ctx.AgentRun?.ID) {
            return;
        }
        ActiveRunGovernanceRegistry.Instance.RegisterActiveRun(
            {
                AgentRunID: ctx.AgentRun.ID,
                Provider: ctx.ActiveProvider,
                RequestPause: summary => this.RequestCooperativePause(ctx, summary),
            },
            ctx.ActiveProvider
        );
    }

    public RequestCooperativePause(ctx: AgentRunContext, summary?: string): Promise<CooperativePauseResult | null> {
        if (ctx.PausedRunOutcome) {
            return Promise.resolve({
                Paused: true,
                CheckpointID: ctx.PausedRunOutcome.PauseResult.Checkpoint.CheckpointID,
                Status: ctx.AgentRun?.Status ?? 'Paused',
                Summary: ctx.PausedRunOutcome.PauseResult.Checkpoint.Summary,
            });
        }
        if (!ctx.CooperativePauseState) {
            ctx.CooperativePauseState = {
                Requested: true,
                Summary: summary,
                Waiters: [],
            };
        } else {
            ctx.CooperativePauseState.Requested = true;
            if (summary) {
                ctx.CooperativePauseState.Summary = summary;
            }
        }
        return new Promise<CooperativePauseResult | null>(resolve => {
            ctx.CooperativePauseState!.Waiters.push(resolve);
        });
    }

    public async CheckPersistedCooperativePauseRequest(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        allowRemotePoll = true
    ): Promise<CooperativePauseRequestSignal | null> {
        const runId = ctx.AgentRun?.ID;
        if (!runId) {
            return null;
        }
        const localSignal = ExtractCooperativePauseRequestFromRunData(ctx.AgentRun?.Data);
        if (localSignal) {
            return localSignal;
        }
        if (!allowRemotePoll) {
            return null;
        }
        const nowMs = Date.now();
        if (nowMs - ctx.LastRemotePausePollMs < AgentCheckpointAndPauseHelper.REMOTE_PAUSE_POLL_INTERVAL_MS) {
            return null;
        }
        const provider = params.provider || ctx.ActiveProvider;
        if (!provider || typeof (provider as Partial<IRunViewProvider>).RunView !== 'function') {
            return null;
        }
        ctx.LastRemotePausePollMs = nowMs;
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<{ ID: string; Data: string | null }>(
                {
                    EntityName: 'MJ: AI Agent Runs',
                    ExtraFilter: `ID='${EscapeSQLString(runId)}'`,
                    Fields: ['ID', 'Data'],
                    ResultType: 'simple',
                    BypassCache: true,
                    MaxRows: 1,
                },
                params.contextUser
            );
            const row = res?.Success ? res.Results?.[0] : undefined;
            return row ? ExtractCooperativePauseRequestFromRunData(row.Data) : null;
        } catch {
            return null;
        }
    }

    public async CheckAndPauseOnCooperativeRequest<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        inFlightPayload: P,
        nextStepToResume: BaseAgentNextStep<P> | null,
        loopCursor?: PendingLoopCursorState | null,
        allowRemotePoll = true
    ): Promise<PausedRunOutcome | null> {
        let summary: string | null = null;
        if (ctx.CooperativePauseState?.Requested) {
            summary = ctx.CooperativePauseState.Summary?.trim() || 'Paused cooperatively at safe step boundary';
        } else {
            const remoteSignal = await this.CheckPersistedCooperativePauseRequest(ctx, params, allowRemotePoll);
            if (!remoteSignal) {
                return null;
            }
            summary = remoteSignal.Summary.trim() || 'Paused cooperatively at safe step boundary';
        }

        if (ctx.AgentRun) {
            ctx.AgentRun.Data = ClearCooperativePauseRequestFromRunData(ctx.AgentRun.Data);
        }
        const ledger = await this.CaptureCurrentBudgetLedger(ctx, params);
        return ctx.Hooks.PauseNonDestructively(params, {
            PauseReason: 'ManualPause',
            Summary: summary,
            InFlightPayload: inFlightPayload as RunawaySerializable,
            NextStepToResume: nextStepToResume,
            LoopCursor: loopCursor ?? null,
            Ledger: ledger,
        });
    }

    public async PauseGuardrailCostOrTimeBreach<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        guardrailResult: GuardrailVerdict
    ): Promise<PausedRunOutcome | null> {
        const directPause = await this.CheckAndPauseOnBudgetBreach(ctx, params, currentPayload, nextStep);
        if (directPause) {
            return directPause;
        }
        const ledger = await this.CaptureCurrentBudgetLedger(ctx, params);
        const dimension = guardrailResult.type === 'time' ? 'WallClockMs' : 'CostUsd';
        const diag = ctx.TreeBudget?.breachDiagnostic;
        const isMsDiagnostic = diag?.Dimension === 'WallClockMs';
        const limitVal =
            guardrailResult.type === 'time'
                ? isMsDiagnostic
                    ? diag!.Limit
                    : (guardrailResult.limit ?? 0) * 1000
                : guardrailResult.limit ?? 0;
        const currentVal =
            guardrailResult.type === 'time'
                ? isMsDiagnostic
                    ? diag!.CurrentValue
                    : (guardrailResult.current ?? 0) * 1000
                : guardrailResult.current ?? 0;
        const breach: BudgetBreachDetail = {
            Scope: 'PerRun',
            Dimension: dimension,
            Limit: limitVal,
            OvershootAllowed: 0,
            EffectiveLimit: limitVal,
            Current: currentVal,
            Reason: guardrailResult.reason ?? `PerRun ${dimension} budget exceeded`,
        };
        return ctx.Hooks.PauseNonDestructively(params, {
            PauseReason: 'BudgetExceeded',
            Summary: breach.Reason,
            InFlightPayload: currentPayload as RunawaySerializable,
            NextStepToResume: nextStep,
            BudgetBreach: breach,
            Ledger: ledger,
        });
    }

    // --- FastConvergenceJudge late-settlement reconciliation ---

    public InitCurrentLateJudgeScope(ctx: AgentRunContext, params: ExecuteAgentParams): void {
        const scope: RunLateJudgeScope = {
            AgentRun: ctx.AgentRun,
            Provider: ctx.ActiveProvider,
            ContextUser: params.contextUser,
            CostEvents: ctx.BudgetCostEvents,
            DayCostBaselines: ctx.BudgetDayBaselines,
            TreeBudget: ctx.TreeBudget,
            LoopExited: false,
            InMemoryReconciledIds: new Set<string>(),
            PersistedIds: new Set<string>(),
            PendingDurableSettlements: new Map<string, PendingDurableFastJudgeSettlement>(),
            LateSaveChain: Promise.resolve(true),
            ActiveFinalSavePromise: null,
        };
        ctx.CurrentLateJudgeScope = scope;
        ctx.TrackedLateJudgeScopes.add(scope);
    }

    public async WaitForPendingFastJudgeEvaluations(ctx: AgentRunContext): Promise<boolean> {
        await ctx.FastConvergenceJudgeIfInitialized?.WaitForPendingEvaluations();
        this.DrainPendingFastJudgeUsage(ctx);
        return this.FlushPendingLateFastJudgeSaves(ctx);
    }

    public async FlushPendingLateFastJudgeSaves(ctx: AgentRunContext): Promise<boolean> {
        let allPersisted = true;
        for (const scope of Array.from(ctx.TrackedLateJudgeScopes)) {
            if (scope.PendingDurableSettlements.size > 0) {
                const persisted = await this.enqueueScopeLateSave(scope);
                if (!persisted) {
                    allPersisted = false;
                }
            } else {
                await scope.LateSaveChain;
            }
            if (scope.LoopExited && scope.PendingDurableSettlements.size === 0 && scope !== ctx.CurrentLateJudgeScope) {
                ctx.TrackedLateJudgeScopes.delete(scope);
            }
        }
        return allPersisted;
    }

    public AttributeFastJudgeUsage(ctx: AgentRunContext, evaluation: ProgressEvaluationResult): void {
        this.DrainPendingFastJudgeUsage(ctx);
        if (!evaluation.FastJudgeInvoked || !evaluation.FastJudgeResult || evaluation.FastJudgeResult.TimedOut) {
            return;
        }
        const scope = ctx.CurrentLateJudgeScope;
        if (scope) {
            void this.reconcileFastJudgeUsageForScope(ctx, scope, {
                InvocationId: evaluation.FastJudgeResult.InvocationId,
                CostUsd: evaluation.FastJudgeResult.CostUsd,
                TokensUsed: evaluation.FastJudgeResult.TokensUsed,
                SettledAfterDeadline: false,
            });
        }
    }

    public HandleLateFastJudgeUsage(
        ctx: AgentRunContext,
        settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        const scope = ctx.CurrentLateJudgeScope;
        if (!scope) {
            return false;
        }
        return this.HandleLateFastJudgeUsageForScope(ctx, scope, settlement);
    }

    public HandleLateFastJudgeUsageForScope(
        ctx: AgentRunContext,
        scope: RunLateJudgeScope,
        settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        return this.reconcileFastJudgeUsageForScope(ctx, scope, {
            InvocationId: settlement.InvocationId,
            CostUsd: settlement.CostUsd,
            TokensUsed: settlement.TokensUsed,
            SettledAfterDeadline: settlement.SettledAfterDeadline,
        });
    }

    public DrainPendingFastJudgeUsage(ctx: AgentRunContext): void {
        const pending = ctx.FastConvergenceJudgeIfInitialized?.DrainPendingLateUsage();
        if (!pending || pending.length === 0) {
            return;
        }
        for (const settlement of pending) {
            void this.HandleLateFastJudgeUsage(ctx, settlement);
        }
    }

    private reconcileFastJudgeUsageForScope(
        ctx: AgentRunContext,
        scope: RunLateJudgeScope,
        usage: {
            InvocationId?: string;
            CostUsd?: number;
            TokensUsed?: number;
            SettledAfterDeadline: boolean;
        }
    ): Promise<boolean> | boolean {
        const costUsd = typeof usage.CostUsd === 'number' && Number.isFinite(usage.CostUsd) ? Math.max(0, usage.CostUsd) : 0;
        const tokensUsed =
            typeof usage.TokensUsed === 'number' && Number.isFinite(usage.TokensUsed) ? Math.max(0, usage.TokensUsed) : 0;
        if (costUsd <= 0 && tokensUsed <= 0) {
            return true;
        }
        const timestampMs = Date.now();
        const isNewInMemory = !usage.InvocationId || !scope.InMemoryReconciledIds.has(usage.InvocationId);
        if (isNewInMemory) {
            if (usage.InvocationId) {
                scope.InMemoryReconciledIds.add(usage.InvocationId);
            }
            if (ctx.CurrentLateJudgeScope === scope) {
                if (usage.InvocationId) {
                    ctx.ReconciledFastJudgeInvocationIds.add(usage.InvocationId);
                }
                if (costUsd > 0) {
                    ctx.FastJudgeCostUsd += costUsd;
                    ctx.LastRecordedCostUsd += costUsd;
                }
                if (tokensUsed > 0) {
                    ctx.FastJudgeTokensUsed += tokensUsed;
                }
            }
            if (scope.TreeBudget) {
                if (costUsd > 0) {
                    scope.TreeBudget.totalCost += costUsd;
                }
                if (tokensUsed > 0) {
                    scope.TreeBudget.totalTokens += tokensUsed;
                }
            }
            if (scope.AgentRun) {
                BudgetEnforcementGuard.RecordBatchedPromptCost({
                    AgentRun: scope.AgentRun,
                    CostEvents: scope.CostEvents,
                    DayCostBaselines: scope.DayCostBaselines,
                    CostUsd: costUsd,
                    TokensUsed: tokensUsed,
                    TimestampMs: timestampMs,
                });
                if (usage.InvocationId) {
                    scope.AgentRun.Data = AttachReconciledFastJudgeIdToRunData(scope.AgentRun.Data, usage.InvocationId);
                }
            }
        }

        if (!usage.SettledAfterDeadline) {
            return true;
        }
        if (usage.InvocationId && scope.PersistedIds.has(usage.InvocationId)) {
            return true;
        }
        if (!scope.AgentRun?.ID) {
            return false;
        }

        const settlementKey = usage.InvocationId ?? `anon-${timestampMs}-${Math.random().toString(36).slice(2, 8)}`;
        if (!scope.PendingDurableSettlements.has(settlementKey)) {
            scope.PendingDurableSettlements.set(settlementKey, {
                InvocationId: settlementKey,
                CostUsd: costUsd,
                TokensUsed: tokensUsed,
                TimestampMs: timestampMs,
            });
        }

        if (scope.LoopExited || scope.AgentRun.Status !== 'Running') {
            return this.enqueueScopeLateSave(scope);
        }

        return true;
    }

    private enqueueScopeLateSave(scope: RunLateJudgeScope): Promise<boolean> {
        const next = scope.LateSaveChain.then(
            () => this.persistPendingLateJudgeSettlements(scope),
            () => this.persistPendingLateJudgeSettlements(scope)
        );
        scope.LateSaveChain = next;
        return next;
    }

    private async persistPendingLateJudgeSettlements(scope: RunLateJudgeScope): Promise<boolean> {
        if (scope.ActiveFinalSavePromise) {
            await scope.ActiveFinalSavePromise;
        }
        const pendingEntries = Array.from(scope.PendingDurableSettlements.values());
        if (pendingEntries.length === 0) {
            return true;
        }
        const runRef = scope.AgentRun;
        if (!runRef || !runRef.ID) {
            return false;
        }

        let saved = false;
        try {
            saved = await runRef.Save({ SaveReturnMode: 'datestamps_only' });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[BaseAgent] Late FastConvergenceJudge usage save threw for run ${runRef.ID}: ${msg}`);
            saved = false;
        }
        if (saved) {
            this.markScopeSettlementsPersisted(scope, pendingEntries);
            return true;
        }

        try {
            const freshRun = await scope.Provider.GetEntityObject<MJAIAgentRunEntityExtended>(
                'MJ: AI Agent Runs',
                scope.ContextUser
            );
            if (!(await freshRun.Load(runRef.ID))) {
                return false;
            }
            const alreadyOnFresh = ExtractReconciledFastJudgeIdsFromRunData(freshRun.Data);
            const freshEvents = ExtractBudgetCostEventsFromRunData(freshRun.Data);
            const freshBaselines = ExtractBudgetDayBaselinesFromRunData(freshRun.Data);
            const mergedBaselines = { ...freshBaselines, ...scope.DayCostBaselines };
            let mutatedFresh = false;
            for (const entry of pendingEntries) {
                if (alreadyOnFresh.has(entry.InvocationId)) {
                    continue;
                }
                BudgetEnforcementGuard.RecordBatchedPromptCost({
                    AgentRun: freshRun,
                    CostEvents: freshEvents,
                    DayCostBaselines: mergedBaselines,
                    CostUsd: entry.CostUsd,
                    TokensUsed: entry.TokensUsed,
                    TimestampMs: entry.TimestampMs,
                });
                freshRun.Data = AttachReconciledFastJudgeIdToRunData(freshRun.Data, entry.InvocationId);
                mutatedFresh = true;
            }
            if (!mutatedFresh && freshRun !== runRef) {
                this.markScopeSettlementsPersisted(scope, pendingEntries);
                return true;
            }
            const retrySaved = await freshRun.Save({ SaveReturnMode: 'datestamps_only' });
            if (retrySaved) {
                runRef.TotalCost = freshRun.TotalCost;
                runRef.TotalTokensUsed = freshRun.TotalTokensUsed;
                runRef.Data = freshRun.Data;
                this.markScopeSettlementsPersisted(scope, pendingEntries);
                return true;
            }
        } catch (retryErr) {
            const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            LogError(`[BaseAgent] Late FastConvergenceJudge reload-and-retry save failed for run ${runRef.ID}: ${msg}`);
        }
        return false;
    }

    private markScopeSettlementsPersisted(
        scope: RunLateJudgeScope,
        entries: readonly PendingDurableFastJudgeSettlement[]
    ): void {
        for (const entry of entries) {
            scope.PersistedIds.add(entry.InvocationId);
            scope.PendingDurableSettlements.delete(entry.InvocationId);
        }
    }

    public PrepareRunForFinalSave(
        ctx: AgentRunContext,
        run: MJAIAgentRunEntityExtended
    ): { Scope: RunLateJudgeScope | null; ReconciledBeforeSave: string[] } {
        this.DrainPendingFastJudgeUsage(ctx);
        const scope = ctx.CurrentLateJudgeScope;
        const reconciledBeforeSave = scope ? Array.from(scope.InMemoryReconciledIds) : [];
        ctx.Hooks.ApplyTokenStatsToRun(run, ctx.Hooks.CalculateTokenStats());
        for (const id of reconciledBeforeSave) {
            run.Data = AttachReconciledFastJudgeIdToRunData(run.Data, id);
        }
        return { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave };
    }

    public MarkPreSaveFastJudgeIdsPersisted(
        _ctx: AgentRunContext,
        scope: RunLateJudgeScope | null,
        reconciledBeforeSave: readonly string[],
        saved: boolean
    ): void {
        if (!saved || !scope) {
            return;
        }
        for (const id of reconciledBeforeSave) {
            scope.PersistedIds.add(id);
            scope.PendingDurableSettlements.delete(id);
        }
    }

    public async TrackScopeFinalSave<T>(
        _ctx: AgentRunContext,
        scope: RunLateJudgeScope | null,
        saveFn: () => Promise<T>
    ): Promise<T> {
        if (!scope) {
            return saveFn();
        }
        scope.LoopExited = true;
        const promise = saveFn();
        scope.ActiveFinalSavePromise = promise.then(
            () => undefined,
            () => undefined
        );
        try {
            return await promise;
        } finally {
            scope.ActiveFinalSavePromise = null;
        }
    }

    // --- Budget evaluation ledger & non-destructive checkpoint pausing ---

    public BuildBudgetEvaluationInput(ctx: AgentRunContext, params: ExecuteAgentParams): BudgetEnforcementInput {
        const budgets = ctx.ActiveBudgets ?? ctx.Hooks.ResolvedLimits(params).Budgets;
        const tokenStats = ctx.Hooks.CalculateTokenStats();
        const startedAtMs = ctx.AgentRun?.StartedAt ? new Date(ctx.AgentRun.StartedAt).getTime() : Date.now();
        const nowMs = Date.now();
        const currentTotalRunCostUsd = Math.max(0, tokenStats.TotalCost);
        const costDeltaUsd = currentTotalRunCostUsd - ctx.LastRecordedCostUsd;
        if (costDeltaUsd > 0) {
            ctx.BudgetCostEvents.push({ TimestampMs: nowMs, CostUsd: costDeltaUsd });
            ctx.LastRecordedCostUsd = currentTotalRunCostUsd;
        }
        const currentDay = ComputeDayBoundaryWindow(nowMs, budgets.PerUserPerDay.DayBoundaryTimezone);
        if (ctx.LastObservedDaySnapshot && ctx.LastObservedDaySnapshot.DayBucketUTC !== currentDay.DayBucketUTC) {
            ctx.PriorDayCostBaselineUsd = ctx.LastObservedDaySnapshot.CostUsd;
            ctx.PriorDayWallClockBaselineMs = ctx.LastObservedDaySnapshot.WallClockMs;
            ctx.BudgetDayBaselines[currentDay.DayBucketUTC] = ctx.LastObservedDaySnapshot.CostUsd;
        }
        if (ctx.AgentRun && (costDeltaUsd > 0 || Object.keys(ctx.BudgetDayBaselines).length > 0)) {
            ctx.AgentRun.Data = AttachBudgetAttributionToRunData(ctx.AgentRun.Data, {
                CostEvents: ctx.BudgetCostEvents,
                DayCostBaselines: ctx.BudgetDayBaselines,
            });
        }
        return {
            Budgets: budgets,
            AgentRunID: ctx.AgentRun?.ID ?? null,
            UserID: ctx.AgentRun?.UserID ?? params.userId ?? params.contextUser?.ID ?? null,
            RoutineID: params.routineId ?? null,
            CurrentRunCostUsd: tokenStats.TotalCost,
            CurrentRunStartedAtMs: startedAtMs,
            CurrentRunTokens: tokenStats.TotalTokens,
            PriorRunCostUsd: 0,
            PriorDayCostBaselineUsd: ctx.PriorDayCostBaselineUsd,
            PriorDayWallClockBaselineMs: ctx.PriorDayWallClockBaselineMs,
            CostEvents: ctx.BudgetCostEvents,
            DayCostBaselines: ctx.BudgetDayBaselines,
            PausedIntervals: ctx.ResumedCheckpointContext?.PausedIntervals,
            NowMs: nowMs,
            Provider: params.provider || ctx.ActiveProvider,
            ContextUser: params.contextUser,
        };
    }

    private recordDayBudgetSnapshot(
        ctx: AgentRunContext,
        _input: BudgetEnforcementInput,
        ledger: { DayBucketUTC: string; RunCostUsd: number; RunWallClockMs: number }
    ): void {
        ctx.LastObservedDaySnapshot = {
            DayBucketUTC: ledger.DayBucketUTC,
            CostUsd: ledger.RunCostUsd,
            WallClockMs: ledger.RunWallClockMs,
        };
    }

    public async CaptureCurrentBudgetLedger(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<AgentBudgetLedgerSnapshot> {
        const evalInput = this.BuildBudgetEvaluationInput(ctx, params);
        const evalResult = await ctx.BudgetEnforcementGuard.Evaluate(evalInput);
        this.recordDayBudgetSnapshot(ctx, evalInput, evalResult.Ledger);
        return evalResult.Ledger;
    }

    public async PauseNonDestructively(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        details: PauseNonDestructivelyDetails
    ): Promise<PausedRunOutcome | null> {
        if (!ctx.AgentRun) {
            return null;
        }
        await Promise.all([ctx.StepSaveQueue.Flush(), ctx.Hooks.FlushPromptRunnerSaves()]);
        const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } = this.PrepareRunForFinalSave(
            ctx,
            ctx.AgentRun
        );
        const pauseInput: PauseRunWithCheckpointInput = {
            AgentRun: ctx.AgentRun,
            AgentID: params.agent.ID,
            AgentName: params.agent.Name ?? 'Unknown Agent',
            UserID: ctx.AgentRun.UserID ?? params.userId ?? params.contextUser?.ID ?? null,
            RoutineID: params.routineId ?? null,
            PauseReason: details.PauseReason,
            Summary: details.Summary,
            CompletedPromptTurns: ctx.PromptTurnCount,
            ConversationMessages: params.conversationMessages,
            InFlightPayload: details.InFlightPayload,
            Scratchpad: ctx.ScratchpadManager.ToJSON(),
            NextStepToResume: details.NextStepToResume,
            LoopCursor: details.LoopCursor ?? null,
            BudgetBreach: details.BudgetBreach,
            ProgressEvaluation: details.ProgressEvaluation,
            FastJudgeResult: details.FastJudgeResult,
            CumulativeLedger: details.Ledger,
            Provider: params.provider || ctx.ActiveProvider,
            ContextUser: params.contextUser,
            OnOwnerNotification: params.onOwnerPauseNotification,
        };
        let pauseResult: PauseRunWithCheckpointResult | null = null;
        let persistenceError: string | null = null;
        try {
            pauseResult = await this.TrackScopeFinalSave(ctx, scope, () =>
                ctx.CheckpointManager.PauseRunWithCheckpoint(pauseInput)
            );
            if (!pauseResult.Saved) {
                persistenceError =
                    pauseResult.SaveError ?? (ctx.AgentRun.LatestResult?.CompleteMessage || 'Save() returned false');
            } else {
                this.MarkPreSaveFastJudgeIdsPersisted(ctx, scope, reconciledBeforeSave, true);
            }
        } catch (err) {
            persistenceError = err instanceof Error ? err.message : String(err);
            pauseResult = null;
        }

        if (persistenceError || !pauseResult || !pauseResult.Saved) {
            const detail = persistenceError || 'Checkpoint persistence returned Saved=false';
            const retainedResult = pauseResult ?? ctx.CheckpointManager.BuildFallbackCheckpointResult(pauseInput, detail);
            const pendingRecord: PendingRunawayCheckpointPersistence = {
                AgentRunID: ctx.AgentRun.ID,
                AgentRun: ctx.AgentRun,
                Checkpoint: retainedResult.Checkpoint,
                InFlightPayload: details.InFlightPayload,
                NotificationPayload: retainedResult.NotificationPayload,
                OwnerNotificationID: retainedResult.OwnerNotificationID,
                ApprovalRequestID: retainedResult.ApprovalRequestID,
                Provider: pauseInput.Provider,
                ContextUser: params.contextUser,
                LastSaveError: detail,
                OnOwnerNotification: params.onOwnerPauseNotification,
            };
            ctx.PendingCheckpointPersistence = pendingRecord;
            ctx.AgentRun.RunawayCheckpoint = retainedResult.Checkpoint;
            ActiveRunGovernanceRegistry.Instance.MarkPausePersistencePending(pendingRecord);
            ctx.PausedRunOutcome = {
                PauseResult: retainedResult,
                PauseReason: details.PauseReason,
                BudgetBreach: details.BudgetBreach,
                ProgressEvaluation: details.ProgressEvaluation,
                Payload: details.InFlightPayload,
                PausePersistencePending: true,
            };
            if (ctx.CooperativePauseState && ctx.CooperativePauseState.Waiters.length > 0) {
                const waiters = [...ctx.CooperativePauseState.Waiters];
                ctx.CooperativePauseState.Waiters.length = 0;
                ctx.CooperativePauseState.Requested = false;
                const coopPendingRes: CooperativePauseResult = {
                    Paused: false,
                    Pending: true,
                    CheckpointID: retainedResult.Checkpoint.CheckpointID,
                    Status: 'PausePersistencePending',
                    Summary: `Checkpoint persistence pending for pause (${details.PauseReason}): ${detail}`,
                };
                for (const resolve of waiters) {
                    resolve(coopPendingRes);
                }
            }
            ctx.Hooks.LogError(
                `Checkpoint persistence failed for run ${ctx.AgentRun.ID}; retaining safe-point checkpoint ${retainedResult.Checkpoint.CheckpointID} in memory (PausePersistencePending): ${detail}`,
                { agent: params.agent, category: 'RunawayCheckpointPersistence' }
            );
            return ctx.PausedRunOutcome;
        }

        if (ctx.AgentRun.ID) {
            AgentRunWatchdog.Instance.Untrack(ctx.AgentRun.ID);
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(ctx.AgentRun.ID, ctx.ActiveProvider);
        }
        ctx.PendingCheckpointPersistence = null;
        ctx.PausedRunOutcome = {
            PauseResult: pauseResult,
            PauseReason: details.PauseReason,
            BudgetBreach: details.BudgetBreach,
            ProgressEvaluation: details.ProgressEvaluation,
            Payload: details.InFlightPayload,
            PausePersistencePending: false,
        };
        if (ctx.CooperativePauseState && ctx.CooperativePauseState.Waiters.length > 0) {
            const waiters = [...ctx.CooperativePauseState.Waiters];
            ctx.CooperativePauseState.Waiters.length = 0;
            ctx.CooperativePauseState.Requested = false;
            const coopRes: CooperativePauseResult = {
                Paused: true,
                CheckpointID: pauseResult.Checkpoint.CheckpointID,
                Status: ctx.AgentRun.Status,
                Summary: pauseResult.Checkpoint.Summary,
            };
            for (const resolve of waiters) {
                resolve(coopRes);
            }
        }
        return ctx.PausedRunOutcome;
    }

    public BuildPausedExecuteResult<R>(ctx: AgentRunContext, outcome: PausedRunOutcome): ExecuteAgentResult<R> {
        return {
            success: false,
            paused: true,
            ...(outcome.PausePersistencePending ? { pausePersistencePending: true } : {}),
            pausedReason: outcome.PauseReason,
            payload: outcome.Payload as R,
            agentRun: ctx.AgentRun!,
            runawayCheckpoint: outcome.PauseResult.Checkpoint,
            budgetBreach: outcome.BudgetBreach,
            progressEvaluation: outcome.ProgressEvaluation,
            ownerNotificationId: outcome.PauseResult.OwnerNotificationID ?? undefined,
            approvalRequestId: outcome.PauseResult.ApprovalRequestID ?? undefined,
            limitsSnapshot: ctx.AgentRun?.LimitsDiagnosticsSnapshot ?? undefined,
            taintedSources: ctx.TaintedSources.length > 0 ? [...ctx.TaintedSources] : undefined,
            ...(ctx.TreeBudget?.breachDiagnostic ? { limitExceeded: ctx.TreeBudget.breachDiagnostic } : {}),
        };
    }
}
