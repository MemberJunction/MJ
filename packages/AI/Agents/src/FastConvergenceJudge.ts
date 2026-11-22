/**
 * @fileoverview Bounded sub-200ms convergence judge invoked STRICTLY when
 * {@link DeterministicProgressDetector} classifies a window as `Ambiguous`.
 *
 * Answers `'is this converging?'` within `FastJudgeTimeoutMs` (default 200ms) using
 * an injected fast evaluator or `AgentDecisionService`, applies `FastJudgeFailureFallback`
 * on timeout or error so it never blocks beyond the deadline, and logs the short reason
 * onto the agent run's diagnostics (`AIAgentRun.Data.__progressDiagnostics`).
 *
 * @module @memberjunction/ai-agents
 */

import { randomUUID } from 'node:crypto';
import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { LimitsConfigResolver, LogError, LogStatus, UserInfo, type MJLimitsProgressDetectorConfig } from '@memberjunction/core';
import {
    AppendProgressDiagnosticToRunData,
    type AIPromptExecutionScope,
    type FastConvergenceJudgeResult,
    type MJAIAgentRunEntityExtended,
    type ProgressEvaluationResult,
} from '@memberjunction/ai-core-plus';
import { AgentDecisionService } from './AgentDecisionService';

/** Evaluator callback signature for {@link FastConvergenceJudge}. */
export type FastConvergenceJudgeEvaluator = (input: {
    StateSummary: string;
    Iteration: number;
    Signal?: AbortSignal;
}) => Promise<FastConvergenceJudgeResult>;

/** Billable usage settlement emitted when a timed-out judge invocation finishes after its deadline. */
export interface FastJudgeUsageSettlement {
    InvocationId: string;
    Iteration: number;
    CostUsd: number;
    TokensUsed: number;
    TimedOut: boolean;
    SettledAfterDeadline: boolean;
}

/** Callback invoked when a timed-out judge call settles after the bounded decision deadline. Returning `false` or rejecting signals that durable persistence failed so the settlement remains retryable. */
export type FastJudgeLateUsageHandler = (settlement: FastJudgeUsageSettlement) => void | boolean | Promise<void | boolean>;

/** Input parameters for {@link FastConvergenceJudge.EvaluateIfAmbiguous}. */
export interface FastJudgeEvaluateInput {
    DetectorResult: ProgressEvaluationResult;
    Iteration: number;
    StateSummary: string;
    Config?: MJLimitsProgressDetectorConfig;
    AgentRun?: Pick<MJAIAgentRunEntityExtended, 'ID' | 'Data'> | null;
    AgentID?: string;
    ContextUser?: UserInfo;
    ExecutionScope?: AIPromptExecutionScope;
    Evaluator?: FastConvergenceJudgeEvaluator;
    OnLateUsageSettled?: FastJudgeLateUsageHandler;
    NowMs?: number;
}

const FAST_JUDGE_REASON_MAX_CHARS = 240; // Tuning: cap diagnostic reason length stored on AIAgentRun.Data

/**
 * Bounded sub-200ms convergence judge that ONLY executes when deterministic progress
 * classification is `'Ambiguous'`.
 */
export class FastConvergenceJudge {
    private lastEvaluatedIteration: number | null = null;
    private readonly decisionService: AgentDecisionService;
    private readonly pendingLateUsages: FastJudgeUsageSettlement[] = [];
    private readonly activeEvaluations = new Set<Promise<void>>();
    private readonly reconciledInvocationIds = new Set<string>();
    private readonly inFlightInvocationIds = new Set<string>();
    private onLateUsageSettled?: FastJudgeLateUsageHandler;

    constructor(decisionService?: AgentDecisionService, onLateUsageSettled?: FastJudgeLateUsageHandler) {
        this.decisionService = decisionService ?? new AgentDecisionService();
        this.onLateUsageSettled = onLateUsageSettled;
    }

    /** Registers or updates the default handler invoked when timed-out judge evaluations settle late. */
    public SetOnLateUsageSettled(handler: FastJudgeLateUsageHandler | undefined): void {
        this.onLateUsageSettled = handler;
    }

    /** Drains any queued late-usage settlements that settled after timeout without a durable consumer. */
    public DrainPendingLateUsage(): FastJudgeUsageSettlement[] {
        if (this.pendingLateUsages.length === 0) {
            return [];
        }
        const drained = this.pendingLateUsages.splice(0, this.pendingLateUsages.length);
        for (const item of drained) {
            this.reconciledInvocationIds.add(item.InvocationId);
        }
        return drained;
    }

    /** Awaits all background late-settling evaluator promises (primarily for clean shutdown and tests). */
    public async WaitForPendingEvaluations(): Promise<void> {
        if (this.activeEvaluations.size === 0) {
            return;
        }
        await Promise.allSettled([...this.activeEvaluations]);
    }

    /** Resets cooldown tracking (e.g. when resetting progress window on human resume). */
    public ResetCooldown(): void {
        this.lastEvaluatedIteration = null;
    }

    /** Clears pending late usage and invocation tracking (e.g. when resetting judge state for a new run). */
    public ResetTracking(): void {
        this.lastEvaluatedIteration = null;
        this.pendingLateUsages.length = 0;
        this.reconciledInvocationIds.clear();
        this.inFlightInvocationIds.clear();
    }

    /**
     * Evaluates convergence ONLY when `input.DetectorResult.Classification === 'Ambiguous'`.
     * For `'Converging'` or `'Stalled'`, returns `input.DetectorResult` untouched without invoking
     * any model call.
     */
    public async EvaluateIfAmbiguous(input: FastJudgeEvaluateInput): Promise<ProgressEvaluationResult> {
        const config = input.Config ?? LimitsConfigResolver.Resolve().Limits.ProgressDetector;
        if (input.DetectorResult.Classification !== 'Ambiguous') {
            this.recordDiagnostics(input.AgentRun, input.DetectorResult, input.Iteration);
            return input.DetectorResult;
        }

        if (!config.FastJudgeEnabled) {
            const disabledResult = this.applyFallbackResult(
                config,
                0,
                false,
                'Fallback',
                'FastConvergenceJudge disabled; applying configured failure fallback',
            );
            const enriched = this.withJudgeResult(input.DetectorResult, disabledResult);
            this.recordDiagnostics(input.AgentRun, enriched, input.Iteration);
            return enriched;
        }

        if (this.isInCooldown(input.Iteration, config.FastJudgeMinIntervalIterations)) {
            const cooldownResult: FastConvergenceJudgeResult = {
                Converging: true,
                Reason: `Fast judge skipped within ${config.FastJudgeMinIntervalIterations}-iteration cooldown`,
                LatencyMs: 0,
                TimedOut: false,
                UsedFallback: true,
                Source: 'Fallback',
            };
            const enriched = this.withJudgeResult(input.DetectorResult, cooldownResult);
            this.recordDiagnostics(input.AgentRun, enriched, input.Iteration);
            return enriched;
        }

        this.lastEvaluatedIteration = input.Iteration;
        const judgeResult = await this.runBoundedEvaluation(input, config);
        const enriched = this.withJudgeResult(input.DetectorResult, judgeResult);
        this.recordDiagnostics(input.AgentRun, enriched, input.Iteration);
        return enriched;
    }

    private isInCooldown(iteration: number, minInterval: number): boolean {
        if (this.lastEvaluatedIteration === null || minInterval <= 1) {
            return false;
        }
        return iteration - this.lastEvaluatedIteration < minInterval;
    }

    private async runBoundedEvaluation(
        input: FastJudgeEvaluateInput,
        config: MJLimitsProgressDetectorConfig,
    ): Promise<FastConvergenceJudgeResult> {
        const invocationId = randomUUID();
        const timeoutMs = Math.max(1, config.FastJudgeTimeoutMs);
        const boundedSummary = input.StateSummary.slice(0, Math.max(1, config.FastJudgeMaxInputChars));
        const startMs = Date.now();
        const abortController = new AbortController();
        let timerId: ReturnType<typeof setTimeout> | undefined;
        let deadlineExpired = false;

        const evaluationPromise = this.invokeEvaluator(input, boundedSummary, abortController.signal);
        const lateSettlementTracker = evaluationPromise
            .then(async (settled) => {
                if (!deadlineExpired) {
                    return;
                }
                await this.recordLateUsageIfNeeded(invocationId, input.Iteration, settled, input.OnLateUsageSettled);
            })
            .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`[FastConvergenceJudge] Late evaluator settlement tracking error: ${msg}`);
            })
            .finally(() => {
                this.activeEvaluations.delete(lateSettlementTracker);
            });
        this.activeEvaluations.add(lateSettlementTracker);

        const timeoutPromise = new Promise<FastConvergenceJudgeResult>((resolve) => {
            timerId = setTimeout(() => {
                deadlineExpired = true;
                if (!abortController.signal.aborted) {
                    abortController.abort(`FastConvergenceJudge exceeded ${timeoutMs}ms budget`);
                }
                const elapsed = Date.now() - startMs;
                resolve(
                    this.applyFallbackResult(
                        config,
                        elapsed,
                        true,
                        'Fallback',
                        `FastConvergenceJudge timed out after ${timeoutMs}ms`,
                    ),
                );
            }, timeoutMs);
        });

        try {
            const result = await Promise.race([evaluationPromise, timeoutPromise]);
            if (!deadlineExpired) {
                this.reconciledInvocationIds.add(invocationId);
            }
            return {
                ...result,
                InvocationId: invocationId,
                Reason: this.truncateReason(result.Reason),
                LatencyMs: Math.min(timeoutMs, Math.max(0, result.LatencyMs || Date.now() - startMs)),
            };
        } finally {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
        }
    }

    private enqueuePendingLateUsage(settlement: FastJudgeUsageSettlement): void {
        if (this.reconciledInvocationIds.has(settlement.InvocationId)) {
            return;
        }
        if (!this.pendingLateUsages.some((existing) => existing.InvocationId === settlement.InvocationId)) {
            this.pendingLateUsages.push(settlement);
        }
    }

    private async recordLateUsageIfNeeded(
        invocationId: string,
        iteration: number,
        settled: FastConvergenceJudgeResult,
        inlineHandler?: FastJudgeLateUsageHandler,
    ): Promise<void> {
        if (this.reconciledInvocationIds.has(invocationId) || this.inFlightInvocationIds.has(invocationId)) {
            return;
        }
        const costUsd = typeof settled.CostUsd === 'number' && Number.isFinite(settled.CostUsd)
            ? Math.max(0, settled.CostUsd)
            : 0;
        const tokensUsed = typeof settled.TokensUsed === 'number' && Number.isFinite(settled.TokensUsed)
            ? Math.max(0, settled.TokensUsed)
            : 0;
        if (costUsd <= 0 && tokensUsed <= 0) {
            return;
        }
        const settlement: FastJudgeUsageSettlement = {
            InvocationId: invocationId,
            Iteration: iteration,
            CostUsd: costUsd,
            TokensUsed: tokensUsed,
            TimedOut: true,
            SettledAfterDeadline: true,
        };
        const handler = inlineHandler ?? this.onLateUsageSettled;
        if (handler) {
            this.inFlightInvocationIds.add(invocationId);
            try {
                const outcome = await handler(settlement);
                if (outcome === false) {
                    this.enqueuePendingLateUsage(settlement);
                    return;
                }
                this.reconciledInvocationIds.add(invocationId);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`[FastConvergenceJudge] OnLateUsageSettled handler failed: ${msg}`);
                this.enqueuePendingLateUsage(settlement);
            } finally {
                this.inFlightInvocationIds.delete(invocationId);
            }
            return;
        }
        this.enqueuePendingLateUsage(settlement);
    }

    private async invokeEvaluator(
        input: FastJudgeEvaluateInput,
        stateSummary: string,
        signal: AbortSignal,
    ): Promise<FastConvergenceJudgeResult> {
        const config = input.Config ?? LimitsConfigResolver.Resolve().Limits.ProgressDetector;
        const startMs = Date.now();
        try {
            if (input.Evaluator) {
                const custom = await input.Evaluator({
                    StateSummary: stateSummary,
                    Iteration: input.Iteration,
                    Signal: signal,
                });
                const elapsedMs = Date.now() - startMs;
                if (!custom || typeof custom.Converging !== 'boolean' || typeof custom.Reason !== 'string') {
                    return this.applyFallbackResult(
                        config,
                        elapsedMs,
                        signal.aborted,
                        'Fallback',
                        'FastConvergenceJudge evaluator returned invalid response format',
                    );
                }
                return {
                    ...custom,
                    LatencyMs: typeof custom.LatencyMs === 'number' && custom.LatencyMs >= 0 ? custom.LatencyMs : elapsedMs,
                };
            }
            return await this.askDecisionModel(input, stateSummary, signal, config, startMs);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return this.applyFallbackResult(
                config,
                Date.now() - startMs,
                signal.aborted,
                'Error',
                `FastConvergenceJudge error: ${msg}`,
            );
        }
    }

    private async askDecisionModel(
        input: FastJudgeEvaluateInput,
        stateSummary: string,
        signal: AbortSignal,
        config: MJLimitsProgressDetectorConfig,
        startMs: number,
    ): Promise<FastConvergenceJudgeResult> {
        if (!input.ContextUser) {
            return this.applyFallbackResult(
                config,
                Date.now() - startMs,
                false,
                'Fallback',
                'No ContextUser available for fast convergence model',
            );
        }

        if (this.isTestLlmStubActive()) {
            return this.applyFallbackResult(
                config,
                Date.now() - startMs,
                false,
                'Fallback',
                'FastConvergenceJudge skipped decision model call while TestLLM stub is active',
            );
        }

        const decision = await this.decisionService.Ask({
            State: stateSummary,
            Questions: {
                isConverging: {
                    Kind: 'Choice',
                    Instructions: 'Is this agent run converging toward completing its goal rather than looping unproductively?',
                    Options: [
                        { Value: 'converging', Description: 'Yes, the run is making meaningful forward progress.' },
                        { Value: 'stalled', Description: 'No, the run appears stuck or repeating work without convergence.' },
                    ],
                },
            },
            ContextUser: input.ContextUser,
            AgentID: input.AgentID,
            ExecutionScope: input.ExecutionScope,
            CancellationToken: signal,
        });

        const latencyMs = Date.now() - startMs;
        const costUsd = Math.max(
            0,
            decision.cost ??
                decision.promptRun?.TotalCost ??
                decision.promptRun?.Cost ??
                decision.DecisionResult?.Usage?.cost ??
                0,
        );
        const tokensUsed = Math.max(
            0,
            decision.tokensUsed ??
                decision.promptRun?.TokensUsedRollup ??
                decision.promptRun?.TokensUsed ??
                decision.DecisionResult?.Usage?.totalTokens ??
                0,
        );
        if (!decision.success) {
            return this.applyFallbackResult(
                config,
                latencyMs,
                signal.aborted,
                'Error',
                decision.errorMessage ?? 'Fast judge decision model failed',
                costUsd,
                tokensUsed,
            );
        }

        const answer = decision.Answers?.isConverging;
        if (answer?.Kind === 'Choice') {
            const normalizedChoice = typeof answer.Value === 'string' ? answer.Value.trim().toLowerCase() : '';
            if (normalizedChoice === 'converging' || normalizedChoice === 'stalled') {
                const converging = normalizedChoice === 'converging';
                return {
                    Converging: converging,
                    Reason: `Fast judge answered ${normalizedChoice} (confidence=${answer.Confidence.toFixed(2)})`,
                    LatencyMs: latencyMs,
                    TimedOut: false,
                    UsedFallback: false,
                    Source: 'Model',
                    ...(costUsd > 0 ? { CostUsd: costUsd } : {}),
                    ...(tokensUsed > 0 ? { TokensUsed: tokensUsed } : {}),
                };
            }
            return this.applyFallbackResult(
                config,
                latencyMs,
                false,
                'Fallback',
                `Fast judge model returned invalid choice value '${String(answer.Value)}'`,
                costUsd,
                tokensUsed,
            );
        }

        return this.applyFallbackResult(
            config,
            latencyMs,
            false,
            'Fallback',
            'Fast judge model returned unexpected answer format',
            costUsd,
            tokensUsed,
        );
    }

    private applyFallbackResult(
        config: MJLimitsProgressDetectorConfig,
        latencyMs: number,
        timedOut: boolean,
        source: FastConvergenceJudgeResult['Source'],
        baseReason: string,
        costUsd?: number,
        tokensUsed?: number,
    ): FastConvergenceJudgeResult {
        const converging = config.FastJudgeFailureFallback === 'ContinueWithWarning';
        return {
            Converging: converging,
            Reason: `${baseReason} (fallback=${config.FastJudgeFailureFallback})`,
            LatencyMs: latencyMs,
            TimedOut: timedOut,
            UsedFallback: true,
            Source: source,
            ...(typeof costUsd === 'number' && costUsd > 0 ? { CostUsd: costUsd } : {}),
            ...(typeof tokensUsed === 'number' && tokensUsed > 0 ? { TokensUsed: tokensUsed } : {}),
        };
    }

    private withJudgeResult(
        detectorResult: ProgressEvaluationResult,
        judgeResult: FastConvergenceJudgeResult,
    ): ProgressEvaluationResult {
        return {
            ...detectorResult,
            Classification: judgeResult.Converging ? 'Converging' : 'Stalled',
            Reason: `${detectorResult.Reason} | FastJudge: ${judgeResult.Reason}`,
            FastJudgeInvoked: true,
            FastJudgeResult: judgeResult,
        };
    }

    private recordDiagnostics(
        agentRun: Pick<MJAIAgentRunEntityExtended, 'ID' | 'Data'> | null | undefined,
        evaluation: ProgressEvaluationResult,
        iteration: number,
    ): void {
        if (evaluation.FastJudgeInvoked && evaluation.FastJudgeResult) {
            LogStatus(
                `[FastConvergenceJudge] Run ${agentRun?.ID ?? 'unknown'} iter=${iteration} converging=${evaluation.FastJudgeResult.Converging} latency=${evaluation.FastJudgeResult.LatencyMs}ms reason="${evaluation.FastJudgeResult.Reason}"`,
            );
        }
        if (agentRun) {
            agentRun.Data = AppendProgressDiagnosticToRunData(agentRun.Data, evaluation, iteration);
        }
    }

    private truncateReason(reason: string): string {
        const trimmed = reason.trim();
        return trimmed.length > FAST_JUDGE_REASON_MAX_CHARS
            ? `${trimmed.slice(0, FAST_JUDGE_REASON_MAX_CHARS - 3)}...`
            : trimmed;
    }

    /**
     * Detects when a scripted `TestLLM` stub is registered as the active `BaseLLM` driver in
     * `ClassFactory`, preventing background convergence checks from consuming scripted agent turns.
     */
    private isTestLlmStubActive(): boolean {
        const factory = MJGlobal.Instance.ClassFactory;
        const allRegs = factory.GetAllRegistrations(BaseLLM);
        const seenKeys = new Set<string>();
        for (const reg of allRegs) {
            const key = reg.Key ?? '';
            if (seenKeys.has(key)) {
                continue;
            }
            seenKeys.add(key);
            const active = reg.Key ? factory.GetRegistration(BaseLLM, reg.Key) : null;
            let ctor: object | null = active?.SubClass ?? null;
            while (ctor) {
                const name = typeof ctor === 'function' ? ctor.name : undefined;
                if (name === 'TestLLM' || name === 'TestLLMRegistrationHandle') {
                    return true;
                }
                ctor = Object.getPrototypeOf(ctor);
            }
        }
        return false;
    }
}
