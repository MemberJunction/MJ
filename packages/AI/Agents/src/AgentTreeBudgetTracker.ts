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
import type {
    AIPromptRunResult,
    AgentTreeBudget,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';

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
                    totalTokens += step.PromptRun.TokensUsedRollup || 0;
                    promptTokens += step.PromptRun.TokensPromptRollup || 0;
                    completionTokens += step.PromptRun.TokensCompletionRollup || 0;
                    cacheReadTokens += step.PromptRun.TokensCacheReadRollup || 0;
                    cacheWriteTokens += step.PromptRun.TokensCacheWriteRollup || 0;
                    totalCost += step.PromptRun.TotalCost || 0;
                } else if (step.StepType === 'Sub-Agent' && step.SubAgentRun) {
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
     */
    public EnsureTreeBudget(
        params?: ExecuteAgentParams,
        currentBudget?: AgentTreeBudget,
        fallbackParams?: ExecuteAgentParams,
        nowMs: number = Date.now()
    ): AgentTreeBudget {
        const effectiveParams = params ?? fallbackParams;
        let budget = effectiveParams?.treeBudget ?? currentBudget;
        if (!budget) {
            budget = {
                maxTreeSteps: effectiveParams?.maxTreeSteps,
                maxTreeTokens: effectiveParams?.maxTreeTokens,
                maxTreeCost: effectiveParams?.maxTreeCost,
                maxTreeDurationMs: effectiveParams?.maxTreeDurationMs,
                totalSteps: 0,
                totalTokens: 0,
                totalCost: 0,
                startedAtMs: nowMs,
            };
        } else if (effectiveParams) {
            this.seedMissingLimits(budget, effectiveParams);
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
     * Increments `totalSteps` on the shared {@link AgentTreeBudget} by `delta` (default `1`).
     */
    public IncrementTreeSteps(
        params?: ExecuteAgentParams,
        currentBudget?: AgentTreeBudget,
        fallbackParams?: ExecuteAgentParams,
        delta: number = 1
    ): AgentTreeBudget {
        const budget = this.EnsureTreeBudget(params, currentBudget, fallbackParams);
        budget.totalSteps += delta;
        return budget;
    }

    /**
     * Accumulates token and cost usage from a completed prompt execution into the shared
     * {@link AgentTreeBudget} for the execution tree.
     */
    public RecordPromptUsage(
        budget: AgentTreeBudget,
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult<unknown>
    ): { TokensDelta: number; CostDelta: number } {
        const tokensDelta = this.extractPromptTokensDelta(promptRun, promptResult);
        const costDelta = this.extractPromptCostDelta(promptRun, promptResult);

        budget.totalTokens += tokensDelta;
        budget.totalCost += costDelta;

        return { TokensDelta: tokensDelta, CostDelta: costDelta };
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
    }

    /**
     * Evaluates whether any cumulative tree budget ceiling (`maxTreeSteps`, `maxTreeTokens`,
     * `maxTreeCost`, `maxTreeDurationMs`) on the shared {@link AgentTreeBudget} has been reached.
     *
     * Stamps `budget.breachedReason` on breach so ancestor and sibling agents in the call tree
     * can terminate immediately.
     */
    public CheckTreeBudgetLimit(
        budget: AgentTreeBudget,
        nowMs: number = Date.now()
    ): AgentGuardrailCheckResult {
        if (budget.maxTreeSteps != null && budget.totalSteps >= budget.maxTreeSteps) {
            const reason =
                budget.breachedReason ??
                `Agent tree step budget exceeded (${budget.totalSteps}/${budget.maxTreeSteps} total steps across tree)`;
            budget.breachedReason = reason;
            return {
                Exceeded: true,
                Type: 'iterations',
                Limit: budget.maxTreeSteps,
                Current: budget.totalSteps,
                Reason: reason,
            };
        }

        if (budget.maxTreeTokens != null && budget.totalTokens >= budget.maxTreeTokens) {
            const reason =
                budget.breachedReason ??
                `Agent tree token budget exceeded (${budget.totalTokens}/${budget.maxTreeTokens} total tokens across tree)`;
            budget.breachedReason = reason;
            return {
                Exceeded: true,
                Type: 'tokens',
                Limit: budget.maxTreeTokens,
                Current: budget.totalTokens,
                Reason: reason,
            };
        }

        if (budget.maxTreeCost != null && budget.totalCost >= budget.maxTreeCost) {
            const reason =
                budget.breachedReason ??
                `Agent tree cost budget exceeded ($${budget.totalCost.toFixed(4)}/$${budget.maxTreeCost.toFixed(4)} across tree)`;
            budget.breachedReason = reason;
            return {
                Exceeded: true,
                Type: 'cost',
                Limit: budget.maxTreeCost,
                Current: budget.totalCost,
                Reason: reason,
            };
        }

        if (budget.maxTreeDurationMs != null) {
            const elapsedMs = nowMs - budget.startedAtMs;
            if (elapsedMs >= budget.maxTreeDurationMs) {
                const reason =
                    budget.breachedReason ??
                    `Agent tree duration budget exceeded (${elapsedMs}ms/${budget.maxTreeDurationMs}ms across tree)`;
                budget.breachedReason = reason;
                return {
                    Exceeded: true,
                    Type: 'time',
                    Limit: budget.maxTreeDurationMs,
                    Current: elapsedMs,
                    Reason: reason,
                };
            }
        }

        if (budget.breachedReason) {
            return {
                Exceeded: true,
                Reason: budget.breachedReason,
            };
        }

        return { Exceeded: false };
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
            nowMs
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

    private seedMissingLimits(budget: AgentTreeBudget, effectiveParams: ExecuteAgentParams): void {
        if (budget.maxTreeSteps === undefined && effectiveParams.maxTreeSteps !== undefined) {
            budget.maxTreeSteps = effectiveParams.maxTreeSteps;
        }
        if (budget.maxTreeTokens === undefined && effectiveParams.maxTreeTokens !== undefined) {
            budget.maxTreeTokens = effectiveParams.maxTreeTokens;
        }
        if (budget.maxTreeCost === undefined && effectiveParams.maxTreeCost !== undefined) {
            budget.maxTreeCost = effectiveParams.maxTreeCost;
        }
        if (budget.maxTreeDurationMs === undefined && effectiveParams.maxTreeDurationMs !== undefined) {
            budget.maxTreeDurationMs = effectiveParams.maxTreeDurationMs;
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
        nowMs: number
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

        if (agent.MaxCostPerRun != null && agentRun.TotalCost != null && agentRun.TotalCost >= agent.MaxCostPerRun) {
            return {
                Exceeded: true,
                Type: 'cost',
                Limit: agent.MaxCostPerRun,
                Current: agentRun.TotalCost,
                Reason: `Maximum cost limit of $${agent.MaxCostPerRun} exceeded. Current cost: $${agentRun.TotalCost.toFixed(4)}`,
            };
        }

        if (
            agent.MaxTokensPerRun != null &&
            agentRun.TotalTokensUsed != null &&
            agentRun.TotalTokensUsed >= agent.MaxTokensPerRun
        ) {
            return {
                Exceeded: true,
                Type: 'tokens',
                Limit: agent.MaxTokensPerRun,
                Current: agentRun.TotalTokensUsed,
                Reason: `Maximum token limit of ${agent.MaxTokensPerRun} exceeded. Current tokens: ${agentRun.TotalTokensUsed}`,
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

        if (agent.MaxTimePerRun != null && agentRun.StartedAt) {
            const elapsedSeconds = Math.floor((nowMs - new Date(agentRun.StartedAt).getTime()) / 1000);
            if (elapsedSeconds >= agent.MaxTimePerRun) {
                return {
                    Exceeded: true,
                    Type: 'time',
                    Limit: agent.MaxTimePerRun,
                    Current: elapsedSeconds,
                    Reason: `Maximum time limit of ${agent.MaxTimePerRun} seconds exceeded. Elapsed time: ${elapsedSeconds} seconds`,
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
