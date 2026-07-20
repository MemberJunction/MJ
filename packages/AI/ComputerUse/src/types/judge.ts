/**
 * Judge-related types for the Computer Use engine.
 *
 * The Judge is the sole authority on whether a goal is met or a run is stuck.
 * The Controller proposes actions; the Judge evaluates outcomes.
 *
 * JudgeFrequency controls when the Judge is consulted:
 * - EveryStep: maximum accuracy, highest cost
 * - EveryNSteps: balance of cost and accuracy
 * - OnStagnation: only when heuristics detect potential stuckness
 */

import { BrowserAction, ActionExecutionResult } from './browser.js';
import { ToolCallRecord } from './tools.js';
import { ComputerUseError } from './errors.js';
import { SettleReason } from './app-profile.js';

// ─── Judge Context ─────────────────────────────────────────
/**
 * Everything the judge needs to evaluate whether the goal is met.
 * Uses a "pull" pattern — the judge receives all context in one object
 * rather than the engine pushing individual pieces.
 */
export class JudgeContext {
    /** The natural-language goal being pursued */
    public Goal: string = '';
    /** Current screenshot as base64 PNG */
    public CurrentScreenshot: string = '';
    /**
     * Perceptual (dHash) fingerprint of the current screenshot (CU-F6). Lets the
     * heuristic judge detect stagnation across near-identical frames — including
     * animated spinners, which byte-equality never catches — without re-decoding
     * the PNG (the engine computes the hash once at capture). '' when unavailable.
     */
    public CurrentScreenshotHash: string = '';
    /** Recent screenshots as base64 PNGs (bounded by ScreenshotHistoryDepth) */
    public ScreenshotHistory: string[] = [];
    /** History of all steps executed so far */
    public StepHistory: StepRecord[] = [];
    /** Current step number (1-indexed) */
    public StepNumber: number = 0;
    /** Maximum steps configured for this run */
    public MaxSteps: number = 0;
    /** Current URL of the browser */
    public CurrentUrl: string = '';
    /** Whether the controller explicitly requested this judgement evaluation. */
    public ControllerRequestedJudgement: boolean = false;
}

// ─── Judge Verdict ─────────────────────────────────────────
/**
 * The judge's evaluation of the current state.
 *
 * `Done` controls engine flow (stop or continue).
 * `Confidence` (0.0-1.0) is available for logging and adaptive strategies.
 * `Feedback` is injected into the Controller's next prompt if the run continues.
 */
export class JudgeVerdict {
    /** Whether the goal has been accomplished */
    public Done: boolean = false;
    /** Whether the judge has determined the goal is impossible to accomplish */
    public Impossible: boolean = false;
    /** Confidence in the verdict (0.0 = no confidence, 1.0 = certain) */
    public Confidence: number = 0;
    /** Actionable feedback for the Controller if the run should continue */
    public Feedback: string = '';
    /** Explanation of why this verdict was reached */
    public Reason: string = '';
    /** Suggested next action for the Controller (optional guidance) */
    public SuggestedNextAction?: string;
}

// ─── Judge Frequency ───────────────────────────────────────
/**
 * Controls how often the Judge is consulted.
 * Discriminated union on the `Type` field.
 */
export type JudgeFrequency =
    | EveryStepFrequency
    | EveryNStepsFrequency
    | OnStagnationFrequency;

export class EveryStepFrequency {
    public readonly Type = 'EveryStep' as const;
}

export class EveryNStepsFrequency {
    public readonly Type = 'EveryNSteps' as const;
    /** Evaluate every N steps */
    public N: number;

    constructor(n: number) {
        this.N = n;
    }
}

export class OnStagnationFrequency {
    public readonly Type = 'OnStagnation' as const;
    /** Number of identical screenshots before considering the run stagnant */
    public StagnationThreshold: number;

    constructor(threshold: number) {
        this.StagnationThreshold = threshold;
    }
}

// ─── Step Record ───────────────────────────────────────────
/**
 * Complete record of a single step in the engine's main loop.
 * Captures everything that happened: screenshot, controller decision,
 * actions executed, tool calls, judge verdict, and timing.
 *
 * This is the primary data structure that flows through:
 * - Judge evaluation (via JudgeContext.StepHistory)
 * - OnStepComplete hook (for Layer 2 persistence)
 * - ComputerUseResult.Steps (final output)
 */
export class StepRecord {
    /** Step number (1-indexed) */
    public StepNumber: number = 0;
    /** Screenshot captured at the start of this step (base64 PNG) */
    public Screenshot: string = '';
    /**
     * Perceptual (dHash) fingerprint of this step's screenshot (CU-F6).
     * 16-char hex, or '' when the frame could not be hashed. Shared signal for
     * loop/stagnation detection, screenshot dedupe, judge-call gating, and
     * failure classification. App-agnostic — derived from pixels only.
     */
    public ScreenshotHash: string = '';
    /** The controller's reasoning for this step */
    public ControllerReasoning: string = '';
    /** Browser actions the controller requested */
    public ActionsRequested: BrowserAction[] = [];
    /** Results of executing each browser action */
    public ActionResults: ActionExecutionResult[] = [];
    /** Tool calls executed during this step */
    public ToolCalls: ToolCallRecord[] = [];
    /** Judge verdict (if the judge was consulted this step) */
    public JudgeVerdict?: JudgeVerdict;
    /**
     * Whether the controller explicitly requested judgement this step (CU-B3).
     * Such a step is a deliberate "am I done?" checkpoint, not a stuck/misconfigured
     * empty step — the main loop must not count it toward the empty-step abort.
     */
    public RequestedJudgement: boolean = false;
    /** Total duration of this step in milliseconds */
    public DurationMs: number = 0;
    /** Error that occurred during this step (if applicable) */
    public Error?: ComputerUseError;
    /**
     * URL of the page at the START of this step (before this step's actions ran).
     * Retained as `Url` for back-compat; prefer `UrlBefore`/`UrlAfter`.
     */
    public Url: string = '';

    // ─── CU-A8: before/after URLs ──────────────────────────
    /** URL at the start of the step (== `Url`). */
    public UrlBefore: string = '';
    /** URL after this step's actions executed. Use this for loop detection and judge context. */
    public UrlAfter: string = '';

    // ─── CU-F1: split-phase timings (ms), for "app slow vs LLM slow vs agent lost" ───
    /** Wall-clock epoch (ms) when this step began. */
    public StartedAt: number = 0;
    /** Time spent waiting for the page to settle before perceiving (engine-side; not agent reasoning). */
    public SettleMs: number = 0;
    /** Why the settle loop stopped waiting this step (CU-A1/A2) — e.g. 'beacon-ready', 'stable', 'budget'. */
    public SettleReason: SettleReason = 'none';
    /** Time spent capturing (and hashing) the screenshot. */
    public ScreenshotMs: number = 0;
    /** Time spent in the controller LLM call. */
    public LlmMs: number = 0;
    /** Time spent executing this step's browser actions + tool calls. */
    public ActionMs: number = 0;
    /** Time spent in the judge (heuristic + LLM) this step. */
    public JudgeMs: number = 0;

    // ─── CU-F2: correlation IDs (opaque strings; populated by Layer 2) ───
    /** Correlation id for the controller LLM invocation (e.g. an MJ AIPromptRun ID). */
    public ControllerPromptRunId?: string;
    /** Correlation id for the judge LLM invocation, when the judge ran this step. */
    public JudgePromptRunId?: string;
}
