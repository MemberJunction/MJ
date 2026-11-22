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

import { BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { LimitsConfigResolver, LogStatus, UserInfo, type MJLimitsProgressDetectorConfig } from '@memberjunction/core';
import {
    AppendProgressDiagnosticToRunData,
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

/** Input parameters for {@link FastConvergenceJudge.EvaluateIfAmbiguous}. */
export interface FastJudgeEvaluateInput {
    DetectorResult: ProgressEvaluationResult;
    Iteration: number;
    StateSummary: string;
    Config?: MJLimitsProgressDetectorConfig;
    AgentRun?: Pick<MJAIAgentRunEntityExtended, 'ID' | 'Data'> | null;
    AgentID?: string;
    ContextUser?: UserInfo;
    Evaluator?: FastConvergenceJudgeEvaluator;
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

    constructor(decisionService?: AgentDecisionService) {
        this.decisionService = decisionService ?? new AgentDecisionService();
    }

    /** Resets cooldown tracking (e.g. when resetting progress window on human resume). */
    public ResetCooldown(): void {
        this.lastEvaluatedIteration = null;
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
        const timeoutMs = Math.max(1, config.FastJudgeTimeoutMs);
        const boundedSummary = input.StateSummary.slice(0, Math.max(1, config.FastJudgeMaxInputChars));
        const startMs = Date.now();
        const abortController = new AbortController();
        let timerId: ReturnType<typeof setTimeout> | undefined;

        const evaluationPromise = this.invokeEvaluator(input, boundedSummary, abortController.signal);
        const timeoutPromise = new Promise<FastConvergenceJudgeResult>((resolve) => {
            timerId = setTimeout(() => {
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
            return {
                ...result,
                Reason: this.truncateReason(result.Reason),
                LatencyMs: Math.min(timeoutMs, Math.max(0, result.LatencyMs || Date.now() - startMs)),
            };
        } finally {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
        }
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
                return {
                    ...custom,
                    LatencyMs: custom.LatencyMs >= 0 ? custom.LatencyMs : Date.now() - startMs,
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
            CancellationToken: signal,
        });

        const latencyMs = Date.now() - startMs;
        if (!decision.success) {
            return this.applyFallbackResult(
                config,
                latencyMs,
                signal.aborted,
                'Error',
                decision.errorMessage ?? 'Fast judge decision model failed',
            );
        }

        const answer = decision.Answers?.isConverging;
        if (answer?.Kind === 'Choice') {
            const converging = answer.Value === 'converging';
            return {
                Converging: converging,
                Reason: `Fast judge answered ${answer.Value} (confidence=${answer.Confidence.toFixed(2)})`,
                LatencyMs: latencyMs,
                TimedOut: false,
                UsedFallback: false,
                Source: 'Model',
            };
        }

        return this.applyFallbackResult(
            config,
            latencyMs,
            false,
            'Fallback',
            'Fast judge model returned unexpected answer format',
        );
    }

    private applyFallbackResult(
        config: MJLimitsProgressDetectorConfig,
        latencyMs: number,
        timedOut: boolean,
        source: FastConvergenceJudgeResult['Source'],
        baseReason: string,
    ): FastConvergenceJudgeResult {
        const converging = config.FastJudgeFailureFallback === 'ContinueWithWarning';
        return {
            Converging: converging,
            Reason: `${baseReason} (fallback=${config.FastJudgeFailureFallback})`,
            LatencyMs: latencyMs,
            TimedOut: timedOut,
            UsedFallback: true,
            Source: source,
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
