/**
 * Result types for the Computer Use engine.
 *
 * ComputerUseResult is the complete output of a run — it contains
 * all steps (with screenshots, actions, judge verdicts), timing,
 * final status, and error details.
 *
 * ComputerUseStatus is a string union (not an enum) per MJ convention.
 * Each value represents a terminal state with clear semantics.
 */

import { JudgeVerdict, StepRecord } from './judge.js';
import { ComputerUseError } from './errors.js';
import type { ReplayInfo } from './trace.js';

// Re-export StepRecord for convenience — it's defined in judge.ts
// because the judge needs it in JudgeContext, but consumers often
// access it via the results module.
export { StepRecord } from './judge.js';

// ─── Run Status ────────────────────────────────────────────
/**
 * Terminal status of a Computer Use run.
 *
 * - 'Completed':       Judge confirmed the goal was met
 * - 'Failed':          Judge confirmed the goal was NOT met after best effort
 * - 'Impossible':      Judge determined the goal cannot be accomplished (e.g., missing permissions, non-existent page)
 * - 'MaxStepsReached': Hit step limit without judge confirmation either way
 * - 'TimeBudgetExceeded': Hit the agent-time budget (MaxExecutionTimeMs, excluding settle) — gracefully expired with a forced final judge
 * - 'Error':           Infrastructure or runtime error (browser crash, LLM failure, etc.)
 * - 'Cancelled':       Externally cancelled via engine.Stop()
 */
export type ComputerUseStatus =
    | 'Completed'
    | 'Failed'
    | 'Impossible'
    | 'MaxStepsReached'
    | 'TimeBudgetExceeded'
    | 'Error'
    | 'Cancelled';

/**
 * Machine-readable failure reason. A finer-grained classification
 * than {@link ComputerUseStatus} — grows as the engine and classifier learn to
 * name more classes.
 * - `'LoopDetected'` — the engine terminated a run stuck repeating a state.
 * - `'AuthDetour'`   — the run bounced to an identity provider more times than
 *   the watchdog's cap allowed: an infrastructure/session fault, not an
 *   agent failure.
 */
export type ComputerUseFailureReason = 'LoopDetected' | 'AuthDetour';

// ─── Run Result ────────────────────────────────────────────
/**
 * Complete result of a Computer Use engine run.
 *
 * Contains the full step history including screenshots (as base64 strings),
 * all actions executed, tool calls, judge verdicts, and timing information.
 *
 * Layer 1 holds everything in memory. Layer 2 (MJComputerUseEngine) persists
 * screenshots via AIPromptRunMedia entities and logs via MJ's audit system.
 */
export class ComputerUseResult {
    /** Whether the run achieved its goal */
    public Success: boolean = false;

    /** Terminal status of the run */
    public Status: ComputerUseStatus = 'Error';

    /** Complete history of all steps executed */
    public Steps: StepRecord[] = [];

    /** Total wall-clock duration of the run in milliseconds */
    public TotalDurationMs: number = 0;

    /** Total number of steps executed */
    public TotalSteps: number = 0;

    /** Final screenshot captured (base64 PNG) */
    public FinalScreenshot: string = '';

    /** Final URL the browser was on when the run ended */
    public FinalUrl: string = '';

    /** The last judge verdict (if the judge was consulted) */
    public FinalJudgeVerdict?: JudgeVerdict;

    /**
     * Machine-readable reason for a non-success terminal state, when the engine
     * can name one. Distinct from the coarse {@link Status}: e.g. a
     * `Failed` run may carry `'LoopDetected'`. Consumed by the failure
     * classifier and the retry policy (which can decline to retry known
     * classes). Extended as more classes are detected.
     */
    public FailureReason?: ComputerUseFailureReason;

    /**
     * How many times the run bounced to an identity provider and was recovered
     * by the auth-detour watchdog. 0 on runs that never detoured. A
     * per-run infrastructure-health signal: a non-zero count on an otherwise
     * successful run still flags a flaky session, and it's the count that
     * decides the `AuthDetour` termination.
     */
    public AuthDetourCount: number = 0;

    /**
     * Filesystem path to the forensic trace written for this run, set
     * only when tracing was requested (via {@link RunComputerUseParams.TracePath})
     * AND a trace file was actually written. Undefined otherwise. The caller
     * decides whether to keep it (e.g. retain-on-failure) or delete it.
     */
    public TracePath?: string;

    /** Error details (populated when Status is 'Error') */
    public Error?: ComputerUseError;

    /**
     * Replay telemetry, set only when the run executed on the replay
     * tier via {@link ComputerUseEngine.Replay}. Undefined for LLM-tier runs.
     * Carries per-step hit/healed/diverged outcomes for the UI-drift report.
     */
    public Replay?: ReplayInfo;

    /**
     * Compact structured memo of why a non-passing run failed, set only
     * on non-`Completed` terminals. The driver's retry policy feeds it back as
     * {@link RunComputerUseParams.PreviousAttemptSummary} so a retry is
     * non-blind ("previous attempt failed because X; avoid Y"). Undefined on a
     * clean pass.
     */
    public FailureMemo?: string;
}
