/**
 * @fileoverview Hierarchical run and tree budget tracking for MemberJunction AI Agents.
 *
 * Extracted from `BaseAgent` (`WS-4.5a`) to isolate token/cost rollup, shared
 * root-to-leaf `AgentTreeBudget` lifecycle, per-run guardrail evaluation, and
 * action/sub-agent execution attempt counters into an independently testable
 * collaborator while keeping `BaseAgent`'s public and `protected` signatures intact.
 *
 * @module @memberjunction/ai-agents
 */

import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import type { MJLimitsBudgetsConfig } from '@memberjunction/core';
import {
    CreateWorkflowBudget,
    EvaluateWorkflowBudgetCaps,
    RecordWorkflowBudgetUsage,
    SynchronizeWorkflowBudget,
    type AIPromptRunResult,
    type AgentTreeBudget,
    type BudgetPausedInterval,
    type ExecuteAgentParams,
    type MJAIAgentRunEntityExtended,
    type WorkflowBudgetAttributionContext,
    type WorkflowBudgetBreachDiagnostic,
    type WorkflowBudgetDimension,
} from '@memberjunction/ai-core-plus';
import { ComputeTotalPausedMs } from './BudgetEnforcementGuard';

/**
 * The six denormalized token and cost figures rolled up from an agent run's steps.
 * Shared between {@link AgentTreeBudgetTracker.CalculateRunTokenStats} and
 * {@link AgentTreeBudgetTracker.ApplyTokenStatsToRun}.
 */
export interface AgentRunTokenStats {
    TotalTokens: number;
    PromptTokens: number;
    CompletionTokens: number;
    CacheReadTokens: number;
    CacheWriteTokens: number;
    TotalCost: number;
}

/**
 * Guardrail breach dimension.
 */
export type AgentGuardrailLimitType = 'cost' | 'tokens' | 'iterations' | 'time';

/**
 * Result of evaluating per-run or root-tree execution guardrails.
 */
export interface AgentGuardrailCheckResult {
    Exceeded: boolean;
    Type?: AgentGuardrailLimitType;
    Limit?: number;
    Current?: number;
    Reason?: string;
    Diagnostic?: WorkflowBudgetBreachDiagnostic;
}

/**
 * Legacy camelCase guardrail verdict returned by `BaseAgent`'s existing `protected`
 * methods (`hasExceededAgentRunGuardrails` and `checkTreeBudgetLimit`).
 */
export interface LegacyAgentGuardrailVerdict {
    // case-violation-ok-legacy-back-compat: Preserves BaseAgent protected method return shape for subclasses
    exceeded: boolean;
    // case-violation-ok-legacy-back-compat: Preserves BaseAgent protected method return shape for subclasses
    type?: AgentGuardrailLimitType;
    // case-violation-ok-legacy-back-compat: Preserves BaseAgent protected method return shape for subclasses
    limit?: number;
    // case-violation-ok-legacy-back-compat: Preserves BaseAgent protected method return shape for subclasses
    current?: number;
    // case-violation-ok-legacy-back-compat: Preserves BaseAgent protected method return shape for subclasses
    reason?: string;
    // case-violation-ok-legacy-back-compat: Carries structured workflow budget diagnostic for limit-exceeded callers
    diagnostic?: WorkflowBudgetBreachDiagnostic;
}

/**
 * Input parameters for {@link AgentTreeBudgetTracker.CheckRunAndTreeGuardrails}.
 */
export interface AgentGuardrailEvaluationInput {
    Params: ExecuteAgentParams;
    AgentRun: MJAIAgentRunEntityExtended;
    ActiveAgentRun?: MJAIAgentRunEntityExtended | null;
    CurrentBudget?: AgentTreeBudget;
    FallbackParams?: ExecuteAgentParams;
    AbsoluteMaxIterations: number;
    ValidationRetryCount: number;
    MaxValidationRetries: number;
    EffectiveBudgets?: MJLimitsBudgetsConfig | null;
    PausedIntervals?: readonly BudgetPausedInterval[];
    NowMs?: number;
    /**
     * Optional callback routing tree-budget initialization through `BaseAgent.ensureTreeBudget`
     * so subclasses overriding the `protected` method are invoked.
     */
    EnsureTreeBudgetFn?: (params?: ExecuteAgentParams) => AgentTreeBudget;
    /**
     * Optional callback routing tree-budget evaluation through `BaseAgent.checkTreeBudgetLimit`
     * so subclasses overriding the `protected` method are invoked.
     */
    CheckTreeBudgetLimitFn?: (params?: ExecuteAgentParams) => LegacyAgentGuardrailVerdict;
}

/**
 * Tracks hierarchical token, cost, wall-clock duration, and step/attempt budgets
 * across parent -> sub-agent execution trees.
 */
/**
 * Summary returned by {@link AgentTreeBudgetTracker.RecordStepIncrement}.
 */
export interface WorkflowBudgetCheckOutcomeSummary {
    Exceeded: boolean;
    Diagnostic?: WorkflowBudgetBreachDiagnostic;
}

/**
 * Tracks hierarchical token, cost, wall-clock duration, and step/attempt budgets
 * across parent -> sub-agent execution trees.
 */
export class AgentTreeBudgetTracker {
    /**
     * Calculates cumulative token and cost statistics from an agent run's steps.
     *
     * Sums `Prompt`, `Compaction`, and `Decision` steps from their attached `PromptRun`
     * rollup columns and `Sub-Agent` steps from their `SubAgentRun` totals.
     */
    public CalculateRunTokenStats(run: MJAIAgentRunEntityExtended | null | undefined): AgentRunTokenStats {
        let totalTokens = 0;
        let promptTokens = 0;
        let completionTokens = 0;
        let cacheReadTokens = 0;
        let cacheWriteTokens = 0;
        let totalCost = 0;

        if (run?.Steps) {
            for (const step of run.Steps) {
                if (
                    (step.StepType === 'Prompt' || step.StepType === 'Compaction' || step.StepType === 'Decision') &&
                    step.PromptRun
                ) {
                    // Add tokens from prompt runs (rollup fields include any nested child prompt runs).
                    // A Decision step carries its own decision call's run — the Finish check, a single-state
                    // request, or one item of a forEachItemIn request — so each call is counted once.
                    totalTokens += step.PromptRun.TokensUsedRollup || 0;
                    promptTokens += step.PromptRun.TokensPromptRollup || 0;
                    completionTokens += step.PromptRun.TokensCompletionRollup || 0;
                    cacheReadTokens += step.PromptRun.TokensCacheReadRollup || 0;
                    cacheWriteTokens += step.PromptRun.TokensCacheWriteRollup || 0;
                    totalCost += step.PromptRun.TotalCost || 0;
                } else if (step.StepType === 'Sub-Agent' && step.SubAgentRun) {
                    // Add tokens from sub-agent runs (these should already be calculated recursively)
                    totalTokens += step.SubAgentRun.TotalTokensUsed || 0;
                    promptTokens += step.SubAgentRun.TotalPromptTokensUsed || 0;
                    completionTokens += step.SubAgentRun.TotalCompletionTokensUsed || 0;
                    cacheReadTokens += step.SubAgentRun.TotalCacheReadTokensUsed || 0;
                    cacheWriteTokens += step.SubAgentRun.TotalCacheWriteTokensUsed || 0;
                    totalCost += step.SubAgentRun.TotalCost || 0;
                }
            }
        }

        return {
            TotalTokens: totalTokens,
            PromptTokens: promptTokens,
            CompletionTokens: completionTokens,
            CacheReadTokens: cacheReadTokens,
            CacheWriteTokens: cacheWriteTokens,
            TotalCost: totalCost,
        };
    }

    /**
     * Applies a {@link CalculateRunTokenStats} result to a run entity's six denormalized
     * token/cost columns.
     */
    public ApplyTokenStatsToRun(run: MJAIAgentRunEntityExtended, tokenStats: AgentRunTokenStats): void {
        run.TotalTokensUsed = tokenStats.TotalTokens;
        run.TotalPromptTokensUsed = tokenStats.PromptTokens;
        run.TotalCompletionTokensUsed = tokenStats.CompletionTokens;
        run.TotalCacheReadTokensUsed = tokenStats.CacheReadTokens;
        run.TotalCacheWriteTokensUsed = tokenStats.CacheWriteTokens;
        run.TotalCost = tokenStats.TotalCost;
    }

    /**
     * Ensures that a shared {@link AgentTreeBudget} instance exists for the current execution tree
     * and is attached to `params.treeBudget` and `fallbackParams.treeBudget`.
     *
     * - When `params.treeBudget` is already provided (for example, propagated by a parent agent
     *   in `ExecuteSubAgent` or supplied directly by a caller), that exact object reference
     *   is reused so all root, sequential child, and parallel child runs mutate the same shared
     *   counters (`totalSteps`, `totalTokens`, `totalCost`, `startedAtMs`, `breachedReason`).
     * - When `params.treeBudget` is absent (root run), a new {@link AgentTreeBudget} is created
     *   and seeded with any top-level convenience ceilings (`maxTreeSteps`, `maxTreeTokens`,
     *   `maxTreeCost`, `maxTreeDurationMs`) declared on `params`.
     */
    public EnsureTreeBudget(
        params?: ExecuteAgentParams,
        currentBudget?: AgentTreeBudget,
        fallbackParams?: ExecuteAgentParams,
        nowMs: number = Date.now()
    ): AgentTreeBudget {
        const effectiveParams = params ?? fallbackParams;
        let budget = effectiveParams?.treeBudget ?? currentBudget;
        const budgetOptions = {
            MaxTreeSteps: effectiveParams?.maxTreeSteps,
            MaxTreeTokens: effectiveParams?.maxTreeTokens,
            MaxTreeCost: effectiveParams?.maxTreeCost,
            MaxTreeDurationMs: effectiveParams?.maxTreeDurationMs,
            WorkflowMaxCostUsd: effectiveParams?.workflowMaxCostUsd,
            WorkflowMaxDurationMs: effectiveParams?.workflowMaxDurationMs,
            WorkflowStartedAtMs: effectiveParams?.workflowStartedAtMs,
        };
        if (!budget) {
            budget = CreateWorkflowBudget(budgetOptions, nowMs);
        } else {
            SynchronizeWorkflowBudget(budget, budgetOptions);
        }

        if (effectiveParams) {
            effectiveParams.treeBudget = budget;
        }
        if (fallbackParams && fallbackParams !== effectiveParams) {
            fallbackParams.treeBudget = budget;
        }
        return budget;
    }

    /**
     * Accumulates token and cost usage from a completed prompt execution into the shared
     * {@link AgentTreeBudget} for the execution tree.
     *
     * Prefers rollup figures on `promptRun` (`TokensUsedRollup` / `TokensPromptRollup` +
     * `TokensCompletionRollup` and `TotalCost`) so hierarchical child prompts are counted,
     * falling back to direct `promptRun` columns (`TokensUsed` / `TokensPrompt` + `TokensCompletion`
     * and `Cost`) or the `AIPromptRunResult` summary fields when `promptRun` is not populated.
     */
    public RecordPromptUsage(
        budget: AgentTreeBudget,
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult<unknown>,
        attribution?: WorkflowBudgetAttributionContext
    ): { TokensDelta: number; CostDelta: number } {
        const tokensDelta = this.extractPromptTokensDelta(promptRun, promptResult);
        const costDelta = this.extractPromptCostDelta(promptRun, promptResult);

        RecordWorkflowBudgetUsage(
            budget,
            { Tokens: tokensDelta, CostUsd: costDelta },
            { SourceScope: 'AgentTree', ...attribution }
        );

        return { TokensDelta: tokensDelta, CostDelta: costDelta };
    }

    /**
     * Atomically increments cumulative step count on the shared workflow/tree budget.
     */
    public RecordStepIncrement(
        budget: AgentTreeBudget,
        attribution?: WorkflowBudgetAttributionContext
    ): WorkflowBudgetCheckOutcomeSummary {
        const check = RecordWorkflowBudgetUsage(budget, { Steps: 1 }, { SourceScope: 'AgentTree', ...attribution });
        return { Exceeded: check.Exceeded, Diagnostic: check.Diagnostic };
    }

    /**
     * Synchronizes the shared tree budget floor with the current `agentRun`'s metrics so
     * direct guardrail calls with pre-populated `agentRun` entities are reflected in the tree budget.
     */
    public SyncRunFloorIntoTreeBudget(
        budget: AgentTreeBudget,
        agentRun?: MJAIAgentRunEntityExtended | null
    ): void {
        if (!agentRun) {
            return;
        }
        const runStepsCount = Math.max(agentRun.Steps?.length ?? 0, agentRun.TotalPromptIterations ?? 0);
        if (runStepsCount > budget.totalSteps) {
            budget.totalSteps = runStepsCount;
        }
        if ((agentRun.TotalTokensUsed ?? 0) > budget.totalTokens) {
            budget.totalTokens = agentRun.TotalTokensUsed ?? 0;
        }
        if ((agentRun.TotalCost ?? 0) > budget.totalCost) {
            budget.totalCost = agentRun.TotalCost ?? 0;
        }
        if ((budget.cumulativeCostUsd ?? 0) < budget.totalCost) {
            budget.cumulativeCostUsd = budget.totalCost;
        }
    }

    /**
     * Evaluates whether any cumulative tree or whole-workflow budget ceiling
     * (`maxTreeSteps`, `maxTreeTokens`, `maxTreeCost`, `maxTreeDurationMs`,
     * `workflowMaxCostUsd`, `workflowMaxDurationMs`) on the shared {@link AgentTreeBudget}
     * has been reached.
     *
     * Stamps `budget.breachedReason` and `budget.breachDiagnostic` on breach so ancestor
     * and sibling agents in the call tree can terminate deterministically.
     */
    public CheckTreeBudgetLimit(
        budget: AgentTreeBudget,
        nowMs: number = Date.now(),
        attribution?: WorkflowBudgetAttributionContext
    ): AgentGuardrailCheckResult {
        const check = EvaluateWorkflowBudgetCaps(
            budget,
            { SourceScope: 'AgentTree', ...attribution },
            nowMs
        );
        if (!check.Exceeded || !check.Diagnostic) {
            return { Exceeded: false };
        }
        return {
            Exceeded: true,
            Type: this.mapWorkflowDimensionToGuardrailType(check.Diagnostic.Dimension),
            Limit: check.Diagnostic.Limit,
            Current: check.Diagnostic.CurrentValue,
            Reason: check.Diagnostic.Reason,
            Diagnostic: check.Diagnostic,
        };
    }

    /**
     * Evaluates per-run execution guardrails (`absoluteMaxIterations`, `MaxCostPerRun`,
     * `MaxTokensPerRun`, `MaxIterationsPerRun`, `MaxTimePerRun`, validation retries)
     * followed by the shared cumulative root-tree budget.
     */
    public CheckRunAndTreeGuardrails(input: AgentGuardrailEvaluationInput): {
        Result: AgentGuardrailCheckResult;
        Budget: AgentTreeBudget;
    } {
        const {
            Params: params,
            AgentRun: agentRun,
            CurrentBudget: currentBudget,
            FallbackParams: fallbackParams,
            AbsoluteMaxIterations: absoluteMaxIterations,
            ValidationRetryCount: validationRetryCount,
            MaxValidationRetries: maxValidationRetries,
            NowMs: nowMs = Date.now(),
        } = input;

        const perRunCheck = this.evaluatePerRunLimits(
            params,
            agentRun,
            absoluteMaxIterations,
            validationRetryCount,
            maxValidationRetries,
            nowMs,
            input.EffectiveBudgets ?? null,
            input.PausedIntervals,
        );
        const budget = input.EnsureTreeBudgetFn
            ? input.EnsureTreeBudgetFn(params)
            : this.EnsureTreeBudget(params, currentBudget, fallbackParams, nowMs);
        if (perRunCheck.Exceeded) {
            return { Result: perRunCheck, Budget: budget };
        }

        this.SyncRunFloorIntoTreeBudget(budget, agentRun);
        const treeCheck = input.CheckTreeBudgetLimitFn
            ? this.FromLegacyGuardrailVerdict(input.CheckTreeBudgetLimitFn(params))
            : this.CheckTreeBudgetLimit(budget, nowMs);
        return { Result: treeCheck, Budget: budget };
    }

    /**
     * Converts an {@link AgentGuardrailCheckResult} into the legacy camelCase shape
     * returned by `BaseAgent`'s `protected` guardrail hooks.
     */
    public ToLegacyGuardrailVerdict(result: AgentGuardrailCheckResult): LegacyAgentGuardrailVerdict {
        if (!result.Exceeded) {
            return { exceeded: false };
        }
        return {
            exceeded: true,
            ...(result.Type !== undefined ? { type: result.Type } : {}),
            ...(result.Limit !== undefined ? { limit: result.Limit } : {}),
            ...(result.Current !== undefined ? { current: result.Current } : {}),
            ...(result.Reason !== undefined ? { reason: result.Reason } : {}),
        };
    }

    /**
     * Converts a legacy camelCase {@link LegacyAgentGuardrailVerdict} returned by a
     * `BaseAgent.checkTreeBudgetLimit` override into an {@link AgentGuardrailCheckResult}.
     */
    public FromLegacyGuardrailVerdict(verdict: LegacyAgentGuardrailVerdict): AgentGuardrailCheckResult {
        if (!verdict.exceeded) {
            return { Exceeded: false };
        }
        return {
            Exceeded: true,
            ...(verdict.type !== undefined ? { Type: verdict.type } : {}),
            ...(verdict.limit !== undefined ? { Limit: verdict.limit } : {}),
            ...(verdict.current !== undefined ? { Current: verdict.current } : {}),
            ...(verdict.reason !== undefined ? { Reason: verdict.reason } : {}),
        };
    }

    /**
     * Synchronizes extended per-run budget ceilings onto a shared {@link AgentTreeBudget} after
     * a human-approved checkpoint resume so prior tree ceilings or `breachedReason` do not
     * immediately re-trip on the next step.
     */
    public UpdateTreeBudgetFromExtendedBudgets(
        budget: AgentTreeBudget | undefined,
        extendedBudgets: MJLimitsBudgetsConfig,
    ): void {
        if (!budget) {
            return;
        }
        budget.breachedReason = undefined;
        budget.breachDiagnostic = undefined;
        if (budget.maxTreeCost !== undefined) {
            budget.maxTreeCost = extendedBudgets.PerRun.MaxCostUsd ?? undefined;
        }
        if (budget.workflowMaxCostUsd !== undefined) {
            budget.workflowMaxCostUsd = extendedBudgets.PerRun.MaxCostUsd ?? undefined;
        }
        if (budget.maxTreeDurationMs !== undefined) {
            budget.maxTreeDurationMs = extendedBudgets.PerRun.MaxWallClockMs ?? undefined;
        }
        if (budget.workflowMaxDurationMs !== undefined) {
            budget.workflowMaxDurationMs = extendedBudgets.PerRun.MaxWallClockMs ?? undefined;
        }
        if (budget.maxTreeTokens !== undefined) {
            budget.maxTreeTokens = extendedBudgets.PerRun.MaxTokens ?? undefined;
        }
        if (budget.abortController?.signal.aborted) {
            budget.abortController = new AbortController();
        }
    }

    /**
     * Increments the execution counter for an action or sub-agent ID within the run's map.
     */
    public IncrementExecutionCount(counts: Map<string, number>, itemId: string): number {
        const nextCount = (counts.get(itemId) || 0) + 1;
        counts.set(itemId, nextCount);
        return nextCount;
    }

    /**
     * Returns the current execution count for an action or sub-agent ID (0 if never executed).
     */
    public GetExecutionCount(counts: Map<string, number>, itemId: string): number {
        return counts.get(itemId) || 0;
    }

    private mapWorkflowDimensionToGuardrailType(dimension: WorkflowBudgetDimension): AgentGuardrailLimitType {
        switch (dimension) {
            case 'CostUsd':
                return 'cost';
            case 'WallClockMs':
                return 'time';
            case 'Tokens':
                return 'tokens';
            case 'Steps':
                return 'iterations';
        }
    }

    private extractPromptTokensDelta(
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult<unknown>
    ): number {
        if (promptRun) {
            if (promptRun.TokensUsedRollup != null && promptRun.TokensUsedRollup > 0) {
                return promptRun.TokensUsedRollup;
            }
            if (
                (promptRun.TokensPromptRollup != null && promptRun.TokensPromptRollup > 0) ||
                (promptRun.TokensCompletionRollup != null && promptRun.TokensCompletionRollup > 0)
            ) {
                return (promptRun.TokensPromptRollup ?? 0) + (promptRun.TokensCompletionRollup ?? 0);
            }
            if (promptRun.TokensUsed != null && promptRun.TokensUsed > 0) {
                return promptRun.TokensUsed;
            }
            if (
                (promptRun.TokensPrompt != null && promptRun.TokensPrompt > 0) ||
                (promptRun.TokensCompletion != null && promptRun.TokensCompletion > 0)
            ) {
                return (promptRun.TokensPrompt ?? 0) + (promptRun.TokensCompletion ?? 0);
            }
        }
        if (promptResult) {
            if (promptResult.combinedTokensUsed != null && promptResult.combinedTokensUsed > 0) {
                return promptResult.combinedTokensUsed;
            }
            if (
                (promptResult.combinedPromptTokens != null && promptResult.combinedPromptTokens > 0) ||
                (promptResult.combinedCompletionTokens != null && promptResult.combinedCompletionTokens > 0)
            ) {
                return (promptResult.combinedPromptTokens ?? 0) + (promptResult.combinedCompletionTokens ?? 0);
            }
            if (promptResult.tokensUsed != null && promptResult.tokensUsed > 0) {
                return promptResult.tokensUsed;
            }
            if (
                (promptResult.promptTokens != null && promptResult.promptTokens > 0) ||
                (promptResult.completionTokens != null && promptResult.completionTokens > 0)
            ) {
                return (promptResult.promptTokens ?? 0) + (promptResult.completionTokens ?? 0);
            }
        }
        return 0;
    }

    private extractPromptCostDelta(
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult<unknown>
    ): number {
        if (promptRun) {
            if (promptRun.TotalCost != null && promptRun.TotalCost > 0) {
                return promptRun.TotalCost;
            }
            if (promptRun.Cost != null && promptRun.Cost > 0) {
                return promptRun.Cost;
            }
        }
        if (promptResult) {
            if (promptResult.combinedCost != null && promptResult.combinedCost > 0) {
                return promptResult.combinedCost;
            }
            if (promptResult.cost != null && promptResult.cost > 0) {
                return promptResult.cost;
            }
        }
        return 0;
    }

    private evaluatePerRunLimits(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended,
        absoluteMaxIterations: number,
        validationRetryCount: number,
        maxValidationRetries: number,
        nowMs: number,
        effectiveBudgets: MJLimitsBudgetsConfig | null = null,
        pausedIntervals?: readonly BudgetPausedInterval[],
    ): AgentGuardrailCheckResult {
        const agent = params.agent;

        if (agentRun.TotalPromptIterations != null && agentRun.TotalPromptIterations >= absoluteMaxIterations) {
            return {
                Exceeded: true,
                Type: 'iterations',
                Limit: absoluteMaxIterations,
                Current: agentRun.TotalPromptIterations,
                Reason: `Absolute maximum iteration safety limit of ${absoluteMaxIterations} exceeded. Current iterations: ${agentRun.TotalPromptIterations}. This is a system-wide safety measure to prevent infinite loops.`,
            };
        }

        const effectiveMaxCostUsd = effectiveBudgets ? effectiveBudgets.PerRun.MaxCostUsd : agent.MaxCostPerRun;
        if (effectiveMaxCostUsd != null && agentRun.TotalCost != null && agentRun.TotalCost >= effectiveMaxCostUsd) {
            return {
                Exceeded: true,
                Type: 'cost',
                Limit: effectiveMaxCostUsd,
                Current: agentRun.TotalCost,
                Reason: `Maximum cost limit of $${effectiveMaxCostUsd} exceeded. Current cost: $${agentRun.TotalCost.toFixed(4)}`,
            };
        }

        const effectiveMaxTokens = effectiveBudgets ? effectiveBudgets.PerRun.MaxTokens : agent.MaxTokensPerRun;
        if (
            effectiveMaxTokens != null &&
            agentRun.TotalTokensUsed != null &&
            agentRun.TotalTokensUsed >= effectiveMaxTokens
        ) {
            return {
                Exceeded: true,
                Type: 'tokens',
                Limit: effectiveMaxTokens,
                Current: agentRun.TotalTokensUsed,
                Reason: `Maximum token limit of ${effectiveMaxTokens} exceeded. Current tokens: ${agentRun.TotalTokensUsed}`,
            };
        }

        if (
            agent.MaxIterationsPerRun != null &&
            agentRun.TotalPromptIterations != null &&
            agentRun.TotalPromptIterations >= agent.MaxIterationsPerRun
        ) {
            return {
                Exceeded: true,
                Type: 'iterations',
                Limit: agent.MaxIterationsPerRun,
                Current: agentRun.TotalPromptIterations,
                Reason: `Maximum iteration limit of ${agent.MaxIterationsPerRun} exceeded. Current iterations: ${agentRun.TotalPromptIterations}`,
            };
        }

        const effectiveMaxTimeMs = effectiveBudgets
            ? effectiveBudgets.PerRun.MaxWallClockMs
            : (agent.MaxTimePerRun != null ? agent.MaxTimePerRun * 1000 : null);
        if (effectiveMaxTimeMs != null && agentRun.StartedAt) {
            const rawElapsedMs = Math.max(0, nowMs - new Date(agentRun.StartedAt).getTime());
            const pausedMs =
                effectiveBudgets?.CountPausedTimeTowardsWallClock === true
                    ? 0
                    : ComputeTotalPausedMs(pausedIntervals, nowMs);
            const activeElapsedMs = Math.max(0, rawElapsedMs - pausedMs);
            if (activeElapsedMs >= effectiveMaxTimeMs) {
                const limitSeconds = Math.max(1, Math.round(effectiveMaxTimeMs / 1000));
                const elapsedSeconds = Math.floor(activeElapsedMs / 1000);
                return {
                    Exceeded: true,
                    Type: 'time',
                    Limit: agent.MaxTimePerRun ?? limitSeconds,
                    Current: elapsedSeconds,
                    Reason: `Maximum time limit of ${agent.MaxTimePerRun ?? limitSeconds} seconds exceeded. Elapsed time: ${elapsedSeconds} seconds`,
                };
            }
        }

        if (validationRetryCount >= maxValidationRetries) {
            return {
                Exceeded: true,
                Type: 'iterations',
                Limit: maxValidationRetries,
                Current: validationRetryCount,
                Reason: `Maximum validation retries of ${maxValidationRetries} exceeded. The agent is unable to produce valid output after ${validationRetryCount} validation failures.`,
            };
        }

        return { Exceeded: false };
    }
}
