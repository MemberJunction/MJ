/**
 * @fileoverview Default code-only `@RegisterClass(BaseAgentLimitsHelper, 'Default')`
 * implementation owning 5-tier execution limits resolution, tree budgets, token accounting,
 * guardrails, rubric self-check, progress detection, inline loop governance, and delegation
 * to {@link AgentCheckpointAndPauseHelper}.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s7`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import {
    type AgentTreeBudget,
    AgentUserPolicyEngine,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type CooperativePauseRequestSignal,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type PendingLoopCursorState,
    type ProgressEvaluationResult,
    ResolveAgentRunLimits,
    type RunawayPauseReason,
    type RunawaySerializable,
    ToRunawayJsonValue,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import {
    type IMetadataProvider,
    LimitsConfigResolver,
    LogError,
    Metadata,
    type MJLimitsConfig,
    type MJLimitsResolutionResult,
    RunView,
} from '@memberjunction/core';
import type { MJAIAgentUserPolicyEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ProviderRubricEngine } from '@memberjunction/rubrics';
import type { CooperativePauseResult } from '../../ActiveRunGovernanceRegistry';
import type { AgentRunTokenStats } from '../../AgentTreeBudgetTracker';
import type { BudgetEnforcementInput } from '../../BudgetEnforcementGuard';
import type { IterationProgressSample } from '../../DeterministicProgressDetector';
import type { FastJudgeUsageSettlement } from '../../FastConvergenceJudge';
import {
    FailingStepError,
    GetMaxRepeatedFailingStep,
    type RepeatedFailingStepTracker,
} from '../../repeated-failing-step';
import type { PauseRunWithCheckpointResult } from '../../RunawayCheckpointManager';
import { ExecuteSelfCheck, PickSelfCheckLink, type SelfCheckLink, type SelfCheckLinkRow } from '../../self-check';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    AgentBudgetLedgerSnapshot,
    GuardrailVerdict,
    InlineLoopGovernanceArgs,
    PausedRunOutcome,
    PauseNonDestructivelyDetails,
    RunLateJudgeScope,
} from '../base-agent-types';
import { AgentCheckpointAndPauseHelper } from './AgentCheckpointAndPauseHelper';
import { BaseAgentLimitsHelper } from './BaseAgentLimitsHelper';

/**
 * Default code-only implementation of {@link BaseAgentLimitsHelper}.
 */
@RegisterClass(BaseAgentLimitsHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentLimitsHelper extends BaseAgentLimitsHelper {
    private readonly _checkpoint = new AgentCheckpointAndPauseHelper();

    // --- Limits & user policy resolution ---

    public override ResolvedLimits(ctx: AgentRunContext, params?: ExecuteAgentParams): MJLimitsConfig {
        return this.ResolveFullRunLimits(ctx, params).Limits;
    }

    public override ResolveFullRunLimits(ctx: AgentRunContext, params?: ExecuteAgentParams): MJLimitsResolutionResult {
        const effectiveUserPolicy = params?.userPolicy ?? ctx.ResolvedUserPolicy ?? null;
        const agentChain =
            params?.agent?.ID && typeof AIEngine.Instance?.GetAgentInheritanceChain === 'function'
                ? AIEngine.Instance.GetAgentInheritanceChain(params.agent.ID)
                : [];
        const ancestorAgents = agentChain.length > 1 ? agentChain.slice(0, -1) : undefined;
        const userId = params?.userId || params?.contextUser?.ID;
        const ancestorUserPolicies =
            ancestorAgents && userId
                ? ancestorAgents
                      .map(a => AgentUserPolicyEngine.Instance.GetCachedPolicy(a.ID, userId, params?.provider))
                      .filter((p): p is MJAIAgentUserPolicyEntity => p != null)
                : undefined;

        return ResolveAgentRunLimits({
            Agent: params?.agent ?? null,
            AncestorAgents: ancestorAgents,
            UserPolicy: effectiveUserPolicy,
            AncestorUserPolicies: ancestorUserPolicies && ancestorUserPolicies.length > 0 ? ancestorUserPolicies : undefined,
            UserPolicyLimitsOverride: params?.userPolicyLimitsOverride ?? null,
            RunParams: params
                ? {
                      absoluteMaxIterations: params.absoluteMaxIterations,
                      maxExecutionTimeMs: params.maxExecutionTimeMs,
                      maxTreeCost: params.maxTreeCost,
                      maxTreeTokens: params.maxTreeTokens,
                      maxTreeDurationMs: params.maxTreeDurationMs,
                      limitsOverride: params.limitsOverride,
                  }
                : null,
            ContextUser: params?.contextUser ?? null,
            Provider: ctx.ProviderToUse,
            Options: {
                EnforceUserPolicyAsCeiling: Boolean(
                    effectiveUserPolicy ||
                        params?.userPolicyLimitsOverride ||
                        (ancestorUserPolicies && ancestorUserPolicies.length > 0)
                ),
                EnforceConfiguredCeilings: Boolean(params?.contextUser),
                AllowAuthorizedCeilingOverride: Boolean(params?.contextUser),
            },
        });
    }

    public override async ResolveServerUserPolicy(
        _ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<
        { status: 'ok'; policy: MJAIAgentUserPolicyEntity | null } | { status: 'error'; policy: null; errorMessage: string }
    > {
        if (params.userPolicy) {
            return { status: 'ok', policy: params.userPolicy };
        }
        const userId = params.userId || params.contextUser?.ID;
        if (!params.agent?.ID || !userId || !params.contextUser) {
            return { status: 'ok', policy: null };
        }
        try {
            const chainIds =
                params.agent.BaseAgentID && typeof AIEngine.Instance?.GetAgentInheritanceChain === 'function'
                    ? AIEngine.Instance.GetAgentInheritanceChain(params.agent.ID).map(a => a.ID)
                    : [params.agent.ID];
            if (chainIds.length > 1) {
                const effectivePolicy = await AgentUserPolicyEngine.Instance.GetEffectivePolicyForAgentChain(
                    chainIds,
                    userId,
                    params.contextUser,
                    { provider: params.provider ?? Metadata.Provider }
                );
                return { status: 'ok', policy: effectivePolicy };
            }
            const lookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                params.agent.ID,
                userId,
                params.contextUser,
                { provider: params.provider ?? Metadata.Provider }
            );
            if (lookup.status === 'found') {
                return { status: 'ok', policy: lookup.policy };
            }
            if (lookup.status === 'none') {
                return { status: 'ok', policy: null };
            }
            return {
                status: 'error',
                policy: null,
                errorMessage: lookup.errorMessage || 'User agent policy lookup returned error status',
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { status: 'error', policy: null, errorMessage: message };
        }
    }

    // --- Budgets, token accounting & execution counts ---

    public override EnsureTreeBudget(ctx: AgentRunContext, params?: ExecuteAgentParams): AgentTreeBudget {
        const budget = ctx.BudgetTracker.EnsureTreeBudget(params, ctx.TreeBudget, ctx.ExecuteParams);
        ctx.TreeBudget = budget;
        return budget;
    }

    public override RecordPromptUsageInTreeBudget(
        ctx: AgentRunContext,
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult<unknown>,
        params?: ExecuteAgentParams
    ): void {
        const budget = ctx.Hooks.EnsureTreeBudget(params);
        ctx.BudgetTracker.RecordPromptUsage(budget, promptRun, promptResult, {
            AgentName: params?.agent?.Name ?? ctx.AgentRun?.Agent,
            RunID: ctx.AgentRun?.ID,
        });
    }

    public override CheckTreeBudgetLimit(ctx: AgentRunContext, params?: ExecuteAgentParams): GuardrailVerdict {
        const budget = ctx.Hooks.EnsureTreeBudget(params);
        const result = ctx.BudgetTracker.CheckTreeBudgetLimit(budget, undefined, {
            AgentName: params?.agent?.Name ?? ctx.AgentRun?.Agent,
            RunID: ctx.AgentRun?.ID,
        });
        return ctx.BudgetTracker.ToLegacyGuardrailVerdict(result);
    }

    public override CalculateTokenStats(ctx: AgentRunContext): AgentRunTokenStats {
        const stats = ctx.BudgetTracker.CalculateRunTokenStats(ctx.AgentRun);
        this._checkpoint.DrainPendingFastJudgeUsage(ctx);
        if (
            ctx.PriorNonStepCostUsd > 0 ||
            ctx.PriorNonStepTokensUsed > 0 ||
            ctx.FastJudgeCostUsd > 0 ||
            ctx.FastJudgeTokensUsed > 0
        ) {
            return {
                ...stats,
                TotalTokens: stats.TotalTokens + ctx.PriorNonStepTokensUsed + ctx.FastJudgeTokensUsed,
                TotalCost: stats.TotalCost + ctx.PriorNonStepCostUsd + ctx.FastJudgeCostUsd,
            };
        }
        return stats;
    }

    public override ApplyTokenStatsToRun(
        ctx: AgentRunContext,
        run: MJAIAgentRunEntityExtended,
        tokenStats: AgentRunTokenStats
    ): void {
        ctx.BudgetTracker.ApplyTokenStatsToRun(run, tokenStats);
    }

    public override async GetActionExecutionCount(
        ctx: AgentRunContext,
        _agentRunId: string,
        actionId: string
    ): Promise<number> {
        return ctx.Hooks.GetExecutionCount(actionId);
    }

    public override async GetSubAgentExecutionCount(
        ctx: AgentRunContext,
        _agentRunId: string,
        subAgentId: string
    ): Promise<number> {
        return ctx.Hooks.GetExecutionCount(subAgentId);
    }

    public override IncrementExecutionCount(ctx: AgentRunContext, itemId: string): void {
        ctx.BudgetTracker.IncrementExecutionCount(ctx.ExecutionCounts, itemId);
    }

    public override GetExecutionCount(ctx: AgentRunContext, itemId: string): number {
        return ctx.BudgetTracker.GetExecutionCount(ctx.ExecutionCounts, itemId);
    }

    public override async CheckMinimumExecutionRequirements(
        ctx: AgentRunContext,
        agent: MJAIAgentEntityExtended,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<string[]> {
        const violations: string[] = [];

        const agentActions = ctx.Hooks.GetEffectiveAgentActions(agent.ID).filter(
            aa => aa.MinExecutionsPerRun != null && aa.MinExecutionsPerRun > 0
        );

        for (const agentAction of agentActions) {
            const executionCount = await ctx.Hooks.GetActionExecutionCount(agentRun.ID, agentAction.ActionID);
            if (executionCount < agentAction.MinExecutionsPerRun!) {
                violations.push(
                    `Action '${agentAction.Action}' requires ${agentAction.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`
                );
            }
        }

        const subAgents = AIEngine.Instance.GetSubAgents(agent.ID, 'Active').filter(
            a => a.MinExecutionsPerRun != null && a.MinExecutionsPerRun > 0
        );

        for (const subAgent of subAgents) {
            const executionCount = await ctx.Hooks.GetSubAgentExecutionCount(agentRun.ID, subAgent.ID);
            if (executionCount < subAgent.MinExecutionsPerRun!) {
                violations.push(
                    `Sub-agent '${subAgent.Name}' requires ${subAgent.MinExecutionsPerRun} execution(s) but was executed ${executionCount} time(s)`
                );
            }
        }

        return violations;
    }

    // --- Guardrails, self-check & repeated-failing-step safety net ---

    public override CheckRepeatedFailingStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tracker: RepeatedFailingStepTracker,
        executedDecision: BaseAgentNextStep<P>,
        nextStep: BaseAgentNextStep<P>
    ): void {
        const count = tracker.Observe(executedDecision, nextStep);
        if (count < GetMaxRepeatedFailingStep()) {
            return;
        }
        const lastError = FailingStepError(nextStep);
        const message = `Agent repeated the same failing ${executedDecision.step} step ${count} times. Last error: ${lastError}`;
        ctx.Hooks.LogError(`⛔ Agent '${params.agent.Name}': ${message}`, {
            agent: params.agent,
            category: 'ExecutionSafetyNet',
            metadata: { repeatedFailures: count, stepType: executedDecision.step, lastError },
        });
        nextStep.step = 'Failed';
        nextStep.terminate = true;
        nextStep.errorMessage = message;
    }

    public override async ApplySelfCheck<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        agentRun: MJAIAgentRunEntityExtended,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P> | null> {
        if (params.cancellationToken?.aborted) return null;
        const provider = params.provider || ctx.ActiveProvider;
        let row = ctx.SelfCheckLinkByAgent.get(agentRun.AgentID);
        if (row === undefined) {
            try {
                const view = RunView.FromMetadataProvider(provider as never);
                const found = await view.RunView(
                    {
                        EntityName: 'MJ: AI Agent Rubrics',
                        ExtraFilter: `AgentID='${agentRun.AgentID}' AND Purpose='SelfCheck' AND Status='Active'`,
                        OrderBy: 'ID',
                        ResultType: 'simple',
                    },
                    params.contextUser
                );
                if (!found.Success) {
                    LogError(`Self-check lookup failed, so the run continues: ${found.ErrorMessage || 'the view did not succeed'}`);
                    return null;
                }
                row = PickSelfCheckLink((found.Results ?? []) as SelfCheckLinkRow[]) ?? null;
                ctx.SelfCheckLinkByAgent.set(agentRun.AgentID, row);
            } catch (error) {
                LogError(
                    `Self-check lookup failed, so the run continues: ${error instanceof Error ? error.message : String(error)}`
                );
                return null;
            }
        }
        if (!row?.RubricID) return null;
        const link: SelfCheckLink & { rubricId: string; passThreshold?: number | null; evaluatorConfig?: string | null } = {
            Purpose: String(row.Purpose ?? ''),
            Status: String(row.Status ?? ''),
            MaxAttempts: row.MaxSelfCheckAttempts ?? null,
            rubricId: String(row.RubricID),
            passThreshold: row.PassThreshold ?? null,
            evaluatorConfig: row.EvaluatorConfig ?? null,
        };
        const attempt = (ctx.SelfCheckAttemptsByRun.get(agentRun.ID) ?? 0) + 1;
        ctx.SelfCheckAttemptsByRun.set(agentRun.ID, attempt);
        const record = async (step: { EvaluationId?: string; Passed: boolean; Message?: string }) => {
            const saved = await ctx.Hooks.CreateStepEntity({
                stepType: 'Validation',
                stepName: 'Rubric self-check',
                contextUser: params.contextUser,
                inputData: { rubricEvaluationId: step.EvaluationId, passed: step.Passed },
            });
            await ctx.Hooks.FinalizeStepEntity(saved, step.Passed, step.Message || undefined);
        };
        try {
            const outcome = await ExecuteSelfCheck({
                engine: ProviderRubricEngine(provider, params.contextUser, ctx.Hooks.RunPromptExecutionScope(params)),
                link,
                runId: agentRun.ID,
                agentKind: ctx.AgentTypeInstance?.constructor?.name === 'LoopAgentType' ? 'loop' : 'flow',
                attempt,
                candidate: { Message: nextStep.message, Payload: nextStep.newPayload ?? currentPayload },
                record,
            });
            if (outcome.step === 'Success') return null;
            if (outcome.step === 'Retry') return { ...nextStep, step: 'Retry', message: outcome.decision.Message };
            return { ...nextStep, step: 'Failed', message: outcome.decision.Message, errorMessage: outcome.decision.Message };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Self-check could not be saved, so the run continues: ${message}`);
            try {
                await record({ Passed: false, Message: message });
            } catch (recordError) {
                LogError(
                    `Self-check validation step could not be recorded: ${recordError instanceof Error ? recordError.message : String(recordError)}`
                );
            }
            return null;
        }
    }

    public override async SelfCheckSuccess<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep<P>,
        payload: P
    ): Promise<BaseAgentNextStep<P>> {
        if (step.step !== 'Success' || !ctx.AgentRun || ctx.AwaitingWorkflowTaskID) return step;
        const checked = await this.ApplySelfCheck(ctx, params, step, ctx.AgentRun, payload);
        return checked ?? step;
    }

    public override async CheckExecutionGuardrails<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        if (nextStep.step === 'Failed' || nextStep.step === 'Chat') {
            return nextStep;
        }
        if (nextStep.step === 'Success') {
            if (this.HasExplicitWorkflowBudgetCaps(ctx, params)) {
                const wfBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
                if (wfBudgetCheck.exceeded) {
                    ctx.Hooks.LogStatus(`⛔ Workflow budget exceeded: ${wfBudgetCheck.reason}`, false, params);
                    return {
                        ...nextStep,
                        step: 'Failed',
                        terminate: true,
                        message: wfBudgetCheck.reason,
                        errorMessage: wfBudgetCheck.reason,
                    };
                }
            }
            const checked = await this.ApplySelfCheck(ctx, params, nextStep, agentRun, currentPayload);
            return checked ?? nextStep;
        }

        const guardrailResult = await ctx.Hooks.HasExceededAgentRunGuardrails(params, agentRun);

        if (guardrailResult.exceeded) {
            const routeToPause =
                (guardrailResult.type === 'cost' || guardrailResult.type === 'time') &&
                Boolean(ctx.AgentRun) &&
                (!this.HasExplicitWorkflowBudgetCaps(ctx, params) || params.enableRunawayGovernance === true);
            if (routeToPause) {
                const pausedOutcome = await this._checkpoint.PauseGuardrailCostOrTimeBreach(
                    ctx,
                    params,
                    nextStep,
                    currentPayload,
                    guardrailResult
                );
                if (pausedOutcome) {
                    return {
                        ...nextStep,
                        step: 'Success',
                        terminate: true,
                        previousPayload: currentPayload,
                        newPayload: currentPayload,
                        message: pausedOutcome.PauseResult.Checkpoint.Summary,
                    };
                }
            }

            ctx.Hooks.LogStatus(`⛔ Execution guardrail exceeded: ${guardrailResult.reason}`, false, params);

            try {
                const guardrailExceeded = {
                    type: guardrailResult.type,
                    limit: guardrailResult.limit,
                    current: guardrailResult.current,
                    reason: guardrailResult.reason,
                    timestamp: new Date().toISOString(),
                };
                const outputData = currentStep.OutputData ? JSON.parse(currentStep.OutputData) : {};
                currentStep.OutputData = JSON.stringify({
                    ...outputData,
                    guardrailExceeded,
                });
                ctx.Hooks.QueueStepSave(currentStep, s => {
                    const existingOutput = s.OutputData ? JSON.parse(s.OutputData) : {};
                    s.OutputData = JSON.stringify({
                        ...existingOutput,
                        guardrailExceeded,
                    });
                });
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                ctx.Hooks.LogError(`Failed to save guardrail violation to step: ${errMsg}`, {
                    category: 'Guardrails',
                    metadata: { stepId: currentStep.ID },
                });
            }

            return {
                ...nextStep,
                step: 'Failed',
                terminate: true,
                message: guardrailResult.reason,
                errorMessage: guardrailResult.reason,
            };
        }

        return nextStep;
    }

    public override HasExplicitWorkflowBudgetCaps(ctx: AgentRunContext, params?: ExecuteAgentParams): boolean {
        return (
            (params?.workflowMaxCostUsd ?? ctx.TreeBudget?.workflowMaxCostUsd) !== undefined ||
            (params?.workflowMaxDurationMs ?? ctx.TreeBudget?.workflowMaxDurationMs) !== undefined
        );
    }

    public override async HasExceededAgentRunGuardrails(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<GuardrailVerdict> {
        if (ctx.AgentRun === agentRun) {
            ctx.Hooks.ApplyTokenStatsToRun(agentRun, ctx.Hooks.CalculateTokenStats());
        }

        const absoluteMaxIterations = ctx.Hooks.ResolvedLimits(params).AgentAbsoluteIterations;
        const maxValidationRetries = LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxValidationRetries;
        const { Result, Budget } = ctx.BudgetTracker.CheckRunAndTreeGuardrails({
            Params: params,
            AgentRun: agentRun,
            ActiveAgentRun: ctx.AgentRun,
            CurrentBudget: ctx.TreeBudget,
            FallbackParams: ctx.ExecuteParams,
            AbsoluteMaxIterations: absoluteMaxIterations,
            ValidationRetryCount: ctx.GeneralValidationRetryCount,
            MaxValidationRetries: maxValidationRetries,
            EffectiveBudgets: ctx.ActiveBudgets,
            PausedIntervals: ctx.ResumedCheckpointContext?.PausedIntervals,
            EnsureTreeBudgetFn: p => ctx.Hooks.EnsureTreeBudget(p),
            CheckTreeBudgetLimitFn: p => ctx.Hooks.CheckTreeBudgetLimit(p),
        });
        ctx.TreeBudget = Budget;
        return ctx.BudgetTracker.ToLegacyGuardrailVerdict(Result);
    }

    // --- Progress evaluation & inline loop governance ---

    public override async EvaluateRunawayGovernanceAfterStep<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        stepCount: number,
        prevCompletedTasksCount: number,
        tokensDelta: number,
        isPromptFailureOrParseRetry: boolean,
        isConsultContinuation: boolean
    ): Promise<PausedRunOutcome | null> {
        const inFlightPayload = nextStep.newPayload ?? nextStep.previousPayload ?? params.payload;
        const budgetPaused = await this._checkpoint.CheckAndPauseOnBudgetBreach(ctx, params, inFlightPayload, nextStep);
        if (budgetPaused) {
            return budgetPaused;
        }

        if (isConsultContinuation) {
            return null;
        }

        const sample = this.BuildProgressSample(ctx, nextStep, stepCount, prevCompletedTasksCount, tokensDelta, inFlightPayload);
        ctx.ProgressDetector.RecordSample(sample);

        const explicitProgressOverride = Boolean(
            params.limitsOverride?.ProgressDetector ||
                params.userPolicyLimitsOverride?.ProgressDetector ||
                params.enableRunawayGovernance
        );
        if (isPromptFailureOrParseRetry && !explicitProgressOverride) {
            return null;
        }

        const limits = ctx.ActiveLimitsResolution?.Limits ?? ctx.Hooks.ResolvedLimits(params);
        const detResult = ctx.ProgressDetector.Evaluate(limits.ProgressDetector);
        if (!detResult.Checked) {
            return null;
        }

        const judgeScope = ctx.CurrentLateJudgeScope;
        const evaluated =
            detResult.Classification === 'Ambiguous'
                ? await ctx.FastConvergenceJudge.EvaluateIfAmbiguous({
                      DetectorResult: detResult,
                      Iteration: stepCount,
                      StateSummary: `${detResult.Reason}\nStep=${nextStep.step}\nPayload=${JSON.stringify(inFlightPayload ?? {}).slice(0, 1000)}`,
                      Config: limits.ProgressDetector,
                      AgentRun: ctx.AgentRun,
                      AgentID: params.agent.ID,
                      ContextUser: params.contextUser,
                      ExecutionScope: ctx.RunExecutionScope,
                      Evaluator: params.fastConvergenceJudgeEvaluator,
                      OnLateUsageSettled: judgeScope
                          ? settlement => this._checkpoint.HandleLateFastJudgeUsageForScope(ctx, judgeScope, settlement)
                          : undefined,
                  })
                : detResult;

        this._checkpoint.AttributeFastJudgeUsage(ctx, evaluated);
        if (evaluated.Classification !== 'Stalled') {
            if (
                evaluated.FastJudgeInvoked &&
                evaluated.FastJudgeResult &&
                ((evaluated.FastJudgeResult.CostUsd ?? 0) > 0 || (evaluated.FastJudgeResult.TokensUsed ?? 0) > 0)
            ) {
                return this._checkpoint.CheckAndPauseOnBudgetBreach(ctx, params, inFlightPayload, nextStep);
            }
            return null;
        }

        const pauseReason: RunawayPauseReason = evaluated.FastJudgeInvoked ? 'FastJudgeStalled' : 'ProgressStalled';
        const budgetSnapshot = await this._checkpoint.CaptureCurrentBudgetLedger(ctx, params);
        return ctx.Hooks.PauseNonDestructively(params, {
            PauseReason: pauseReason,
            Summary: evaluated.Reason,
            InFlightPayload: inFlightPayload as RunawaySerializable,
            NextStepToResume: nextStep,
            ProgressEvaluation: evaluated,
            FastJudgeResult: evaluated.FastJudgeResult,
            Ledger: budgetSnapshot,
        });
    }

    public override async CheckInlineLoopIterationGovernance<P>(
        ctx: AgentRunContext,
        args: InlineLoopGovernanceArgs<P>
    ): Promise<PausedRunOutcome | null> {
        const cursor: PendingLoopCursorState = {
            LoopType: args.LoopType,
            ParentStepID: args.ParentStepID,
            IterationIndex: args.NextIndex,
            CompletedItemResults: args.CompletedResults.map(r => ToRunawayJsonValue(r as RunawaySerializable)),
            WorkingPayload: ToRunawayJsonValue(args.WorkingPayload as RunawaySerializable),
            ...(args.DelayBetweenIterationsMs !== undefined
                ? { DelayBetweenIterationsMs: args.DelayBetweenIterationsMs }
                : {}),
            ...(args.ContinueOnError !== undefined ? { ContinueOnError: args.ContinueOnError } : {}),
        };

        const coopPaused = await this._checkpoint.CheckAndPauseOnCooperativeRequest(
            ctx,
            args.Params,
            args.WorkingPayload,
            args.LoopDecision,
            cursor
        );
        if (coopPaused) {
            return coopPaused;
        }

        const budgetPaused = await this._checkpoint.CheckAndPauseOnBudgetBreach(
            ctx,
            args.Params,
            args.WorkingPayload,
            args.LoopDecision,
            cursor
        );
        if (budgetPaused) {
            return budgetPaused;
        }

        const isBoundedForEachComplete =
            args.LoopType === 'ForEach' && args.TotalItems !== undefined && args.NextIndex >= args.TotalItems;
        const explicitProgressOverride = Boolean(
            args.Params.limitsOverride?.ProgressDetector ||
                args.Params.userPolicyLimitsOverride?.ProgressDetector ||
                args.Params.enableRunawayGovernance
        );
        const skipProgressForBatchContinueOnError =
            args.LoopType === 'ForEach' && args.ContinueOnError === true && !explicitProgressOverride;

        if (args.RecordProgressSample && args.LastIterResult && !isBoundedForEachComplete && !skipProgressForBatchContinueOnError) {
            const sample: IterationProgressSample = {
                IterationIndex: args.NextIndex,
                StepType: args.LoopType,
                StepSignature: `${args.LoopType}:${args.NextIndex}:${args.LastIterResult.step}`,
                RecordsCreatedOrChanged: this.estimateRecordsChanged(args.LastIterResult),
                TasksClosed: 0,
                OutputText: this.extractStepOutputText(args.LastIterResult),
                PayloadFingerprint: args.WorkingPayload !== undefined ? JSON.stringify(args.WorkingPayload) : undefined,
                TokensSpent: Math.max(0, args.TokensDelta ?? 0),
                ErrorSignature: args.LastIterResult.errorMessage ?? null,
                HeapUsedBytes:
                    typeof process !== 'undefined' && typeof process.memoryUsage === 'function'
                        ? process.memoryUsage().heapUsed
                        : undefined,
            };
            ctx.ProgressDetector.RecordSample(sample);
            const limits = ctx.ActiveLimitsResolution?.Limits ?? ctx.Hooks.ResolvedLimits(args.Params);
            const detResult = ctx.ProgressDetector.Evaluate(limits.ProgressDetector);
            if (detResult.Checked) {
                const judgeScope = ctx.CurrentLateJudgeScope;
                const evaluated =
                    detResult.Classification === 'Ambiguous'
                        ? await ctx.FastConvergenceJudge.EvaluateIfAmbiguous({
                              DetectorResult: detResult,
                              Iteration: args.NextIndex,
                              StateSummary: `${detResult.Reason}\nLoop=${args.LoopType}\nIteration=${args.NextIndex}\nPayload=${JSON.stringify(args.WorkingPayload ?? {}).slice(0, 1000)}`,
                              Config: limits.ProgressDetector,
                              AgentRun: ctx.AgentRun,
                              AgentID: args.Params.agent.ID,
                              ContextUser: args.Params.contextUser,
                              ExecutionScope: ctx.RunExecutionScope,
                              Evaluator: args.Params.fastConvergenceJudgeEvaluator,
                              OnLateUsageSettled: judgeScope
                                  ? settlement => this._checkpoint.HandleLateFastJudgeUsageForScope(ctx, judgeScope, settlement)
                                  : undefined,
                          })
                        : detResult;
                this._checkpoint.AttributeFastJudgeUsage(ctx, evaluated);
                if (evaluated.Classification === 'Stalled') {
                    const pauseReason: RunawayPauseReason = evaluated.FastJudgeInvoked ? 'FastJudgeStalled' : 'ProgressStalled';
                    const ledger = await this._checkpoint.CaptureCurrentBudgetLedger(ctx, args.Params);
                    return ctx.Hooks.PauseNonDestructively(args.Params, {
                        PauseReason: pauseReason,
                        Summary: evaluated.Reason,
                        InFlightPayload: args.WorkingPayload as RunawaySerializable,
                        NextStepToResume: args.LoopDecision,
                        LoopCursor: cursor,
                        ProgressEvaluation: evaluated,
                        FastJudgeResult: evaluated.FastJudgeResult,
                        Ledger: ledger,
                    });
                } else if (
                    evaluated.FastJudgeInvoked &&
                    evaluated.FastJudgeResult &&
                    ((evaluated.FastJudgeResult.CostUsd ?? 0) > 0 || (evaluated.FastJudgeResult.TokensUsed ?? 0) > 0)
                ) {
                    const postJudgeBudgetPaused = await this._checkpoint.CheckAndPauseOnBudgetBreach(
                        ctx,
                        args.Params,
                        args.WorkingPayload,
                        args.LoopDecision,
                        cursor
                    );
                    if (postJudgeBudgetPaused) {
                        return postJudgeBudgetPaused;
                    }
                }
            }
        }

        return null;
    }

    public override BuildProgressSample<P>(
        ctx: AgentRunContext,
        nextStep: BaseAgentNextStep<P>,
        stepCount: number,
        prevCompletedTasksCount: number,
        tokensDelta: number,
        inFlightPayload: P
    ): IterationProgressSample {
        const currentCompletedTasks = ctx.ScratchpadManager.GetTaskCounts().completed;
        const tasksClosed = Math.max(0, currentCompletedTasks - prevCompletedTasksCount);
        const recordsChanged = this.estimateRecordsChanged(nextStep);
        const outputText = this.extractStepOutputText(nextStep);
        const payloadFingerprint = inFlightPayload !== undefined ? JSON.stringify(inFlightPayload) : undefined;
        const heapUsedBytes =
            typeof process !== 'undefined' && typeof process.memoryUsage === 'function'
                ? process.memoryUsage().heapUsed
                : undefined;
        const errorSignature =
            nextStep.step === 'Failed'
                ? nextStep.errorMessage || nextStep.message || 'step-failed'
                : nextStep.step === 'Retry' && nextStep.errorMessage
                  ? nextStep.errorMessage
                  : null;

        return {
            IterationIndex: stepCount,
            StepType: nextStep.step ?? 'Unknown',
            StepSignature: `${nextStep.step ?? 'Unknown'}:${nextStep.actions?.map(a => a.name).join(',') ?? nextStep.subAgent?.name ?? ''}`,
            RecordsCreatedOrChanged: recordsChanged,
            TasksClosed: tasksClosed,
            OutputText: outputText,
            PayloadFingerprint: payloadFingerprint,
            TokensSpent: tokensDelta,
            ErrorSignature: errorSignature,
            HeapUsedBytes: heapUsedBytes,
        };
    }

    private estimateRecordsChanged<P>(nextStep: BaseAgentNextStep<P>): number {
        let count = 0;
        if (nextStep.payloadChangeRequest) {
            const req = nextStep.payloadChangeRequest;
            if (req.newElements && Object.keys(req.newElements).length > 0) count += Object.keys(req.newElements).length;
            if (req.updateElements && Object.keys(req.updateElements).length > 0)
                count += Object.keys(req.updateElements).length;
        }
        if (Array.isArray(nextStep.priorStepResult)) {
            for (const item of nextStep.priorStepResult) {
                if (!item || typeof item !== 'object') continue;
                const summary = item as { success?: boolean; actionName?: string };
                const name = (summary.actionName ?? '').toLowerCase();
                if (
                    summary.success === true &&
                    (name.includes('create') ||
                        name.includes('update') ||
                        name.includes('save') ||
                        name.includes('upsert') ||
                        name.includes('delete'))
                ) {
                    count++;
                }
            }
        }
        return count;
    }

    private extractStepOutputText<P>(nextStep: BaseAgentNextStep<P>): string {
        const parts: string[] = [];
        if (nextStep.message) parts.push(nextStep.message);
        if (nextStep.errorMessage) parts.push(nextStep.errorMessage);
        if (nextStep.retryReason) parts.push(nextStep.retryReason);
        if (nextStep.reasoning) parts.push(nextStep.reasoning);
        if (nextStep.priorStepResult !== undefined) {
            parts.push(
                typeof nextStep.priorStepResult === 'string'
                    ? nextStep.priorStepResult
                    : JSON.stringify(nextStep.priorStepResult)
            );
        }
        return parts.join('\n').slice(0, 2000);
    }

    // --- Delegation to AgentCheckpointAndPauseHelper (no `async` wrapper on 1-line pass-throughs) ---

    public override FlushPendingCheckpointPersistence(
        ctx: AgentRunContext,
        agentRunId?: string,
        provider?: IMetadataProvider | null
    ): Promise<PauseRunWithCheckpointResult | null> {
        return this._checkpoint.FlushPendingCheckpointPersistence(ctx, agentRunId, provider);
    }

    public override WaitForPendingFastJudgeEvaluations(ctx: AgentRunContext): Promise<boolean> {
        return this._checkpoint.WaitForPendingFastJudgeEvaluations(ctx);
    }

    public override FlushPendingLateFastJudgeSaves(ctx: AgentRunContext): Promise<boolean> {
        return this._checkpoint.FlushPendingLateFastJudgeSaves(ctx);
    }

    public override CheckAndPauseOnBudgetBreach<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        inFlightPayload: P,
        nextStepToResume: BaseAgentNextStep<P> | null,
        loopCursor?: PendingLoopCursorState | null
    ): Promise<PausedRunOutcome | null> {
        return this._checkpoint.CheckAndPauseOnBudgetBreach(ctx, params, inFlightPayload, nextStepToResume, loopCursor);
    }

    public override RegisterActiveRunForCooperativePause(ctx: AgentRunContext): void {
        this._checkpoint.RegisterActiveRunForCooperativePause(ctx);
    }

    public override RequestCooperativePause(ctx: AgentRunContext, summary?: string): Promise<CooperativePauseResult | null> {
        return this._checkpoint.RequestCooperativePause(ctx, summary);
    }

    public override CheckPersistedCooperativePauseRequest(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        allowRemotePoll?: boolean
    ): Promise<CooperativePauseRequestSignal | null> {
        return this._checkpoint.CheckPersistedCooperativePauseRequest(ctx, params, allowRemotePoll);
    }

    public override CheckAndPauseOnCooperativeRequest<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        inFlightPayload: P,
        nextStepToResume: BaseAgentNextStep<P> | null,
        loopCursor?: PendingLoopCursorState | null,
        allowRemotePoll?: boolean
    ): Promise<PausedRunOutcome | null> {
        return this._checkpoint.CheckAndPauseOnCooperativeRequest(
            ctx,
            params,
            inFlightPayload,
            nextStepToResume,
            loopCursor,
            allowRemotePoll
        );
    }

    public override InitCurrentLateJudgeScope(ctx: AgentRunContext, params: ExecuteAgentParams): void {
        this._checkpoint.InitCurrentLateJudgeScope(ctx, params);
    }

    public override AttributeFastJudgeUsage(ctx: AgentRunContext, evaluation: ProgressEvaluationResult): void {
        this._checkpoint.AttributeFastJudgeUsage(ctx, evaluation);
    }

    public override HandleLateFastJudgeUsage(
        ctx: AgentRunContext,
        settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        return this._checkpoint.HandleLateFastJudgeUsage(ctx, settlement);
    }

    public override HandleLateFastJudgeUsageForScope(
        ctx: AgentRunContext,
        scope: RunLateJudgeScope,
        settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        return this._checkpoint.HandleLateFastJudgeUsageForScope(ctx, scope, settlement);
    }

    public override DrainPendingFastJudgeUsage(ctx: AgentRunContext): void {
        this._checkpoint.DrainPendingFastJudgeUsage(ctx);
    }

    public override PrepareRunForFinalSave(
        ctx: AgentRunContext,
        run: MJAIAgentRunEntityExtended
    ): { Scope: RunLateJudgeScope | null; ReconciledBeforeSave: string[] } {
        return this._checkpoint.PrepareRunForFinalSave(ctx, run);
    }

    public override MarkPreSaveFastJudgeIdsPersisted(
        ctx: AgentRunContext,
        scope: RunLateJudgeScope | null,
        reconciledBeforeSave: readonly string[],
        saved: boolean
    ): void {
        this._checkpoint.MarkPreSaveFastJudgeIdsPersisted(ctx, scope, reconciledBeforeSave, saved);
    }

    public override TrackScopeFinalSave<T>(
        ctx: AgentRunContext,
        scope: RunLateJudgeScope | null,
        saveFn: () => Promise<T>
    ): Promise<T> {
        return this._checkpoint.TrackScopeFinalSave(ctx, scope, saveFn);
    }

    public override BuildBudgetEvaluationInput(ctx: AgentRunContext, params: ExecuteAgentParams): BudgetEnforcementInput {
        return this._checkpoint.BuildBudgetEvaluationInput(ctx, params);
    }

    public override CaptureCurrentBudgetLedger(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<AgentBudgetLedgerSnapshot> {
        return this._checkpoint.CaptureCurrentBudgetLedger(ctx, params);
    }

    public override PauseNonDestructively(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        details: PauseNonDestructivelyDetails
    ): Promise<PausedRunOutcome | null> {
        return this._checkpoint.PauseNonDestructively(ctx, params, details);
    }

    public override BuildPausedExecuteResult<R>(ctx: AgentRunContext, outcome: PausedRunOutcome): ExecuteAgentResult<R> {
        return this._checkpoint.BuildPausedExecuteResult<R>(ctx, outcome);
    }
}
