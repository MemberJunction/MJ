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
 * - 'TimeBudgetExceeded': Hit the agent-time budget (MaxExecutionTimeMs, excluding settle) — gracefully expired with a forced final judge (CU-B4)
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
 * Machine-readable failure reason (CU-B1/F5). A finer-grained classification
 * than {@link ComputerUseStatus} — grows as the engine and classifier learn to
 * name more classes. `'LoopDetected'` is set when the engine terminates a run
 * that was stuck repeating a state.
 */
export type ComputerUseFailureReason = 'LoopDetected';

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
     * can name one (CU-B1). Distinct from the coarse {@link Status}: e.g. a
     * `Failed` run may carry `'LoopDetected'`. Consumed by the failure
     * classifier (CU-F5) and the retry policy (which can decline to retry known
     * classes). Extended as more classes are detected.
     */
    public FailureReason?: ComputerUseFailureReason;

    /** Error details (populated when Status is 'Error') */
    public Error?: ComputerUseError;
}
