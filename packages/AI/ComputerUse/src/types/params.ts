/**
 * Run parameters for the Computer Use engine. `RunComputerUseParams` is the
 * single entry point for configuring a run — only `Goal` is required.
 * `MJRunComputerUseParams` (Layer 2) extends it with MJ-specific fields.
 */

import { ComputerUseAuthConfig } from './auth.js';
import { BrowserConfig } from './browser.js';
import type { BrowserAction, ContextSeed } from './browser.js';
import { ComputerUseTool } from './tools.js';
import type { JudgeFrequency } from './judge.js';
import type { AppProfile } from './app-profile.js';
import { GoalPostcondition } from './trace.js';

/** Model selection for the controller and judge LLMs. */
export class ModelConfig {
    /** AI vendor identifier (e.g., "anthropic", "openai", "google") */
    public Vendor: string;
    /** Model identifier (e.g., "claude-sonnet-4-5-20250929", "gpt-4o") */
    public Model: string;
    /**
     * Explicit LLM driver class name (e.g., "AnthropicLLM"). When set, used
     * directly for ClassFactory instead of mapping from `Vendor`.
     */
    public DriverClass?: string;

    constructor(vendor: string, model: string, driverClass?: string) {
        this.Vendor = vendor;
        this.Model = model;
        this.DriverClass = driverClass;
    }
}

/**
 * Scripted navigation run before the agentic loop to reach the feature under
 * test. Executes straight through the adapter (nav guard + auth honored) and
 * consumes zero LLM budget.
 */
export class RunPrelude {
    /** Ordered deterministic actions run before the agentic loop. */
    public Actions: BrowserAction[] = [];
    /** Optional: a selector the prelude must reach — verifies it landed. */
    public ExpectSelector?: string;
    /** Optional: a URL pattern the prelude must reach — verifies it landed. */
    public ExpectUrlPattern?: string;
}

/**
 * One section of a multi-section "tour" test. A checkpoint is **met** when all
 * its {@link Assertions} and {@link VisualCriteria} pass. See
 * `plans/regression-testing/checkpoint-tours-design.md`.
 */
export class RunCheckpoint {
    /** Stable label for the section, e.g. "agents-list". */
    public Name: string = '';
    /**
     * Plan hint appended to the goal, and the criterion text in the synthesized
     * final verdict.
     */
    public Instruction?: string;
    /**
     * Deterministic assertions, checked every step at no cost. `visible`/`absent`
     * require {@link RunComputerUseParams.ElementGrounding}. Preferred — most
     * sections are URL-identifiable.
     */
    public Assertions?: GoalPostcondition[];
    /**
     * Criteria requiring an LLM judge (e.g. "the chart rendered with bars").
     * Latched when a judge call reports all of them met.
     */
    public VisualCriteria?: string[];
}

/** Complete configuration for a Computer Use engine run. */
export class RunComputerUseParams {
    /** Natural-language goal for the agent to accomplish */
    public Goal: string = '';

    /** Starting URL to navigate to */
    public StartUrl?: string;

    /** Run browser in headless mode (default: true) */
    public Headless: boolean = true;

    /** Domains the browser may visit. When set, all others are blocked. */
    public AllowedDomains?: string[];

    /** Domains explicitly blocked. Evaluated after AllowedDomains — blocked always wins. */
    public BlockedDomains?: string[];

    /** Maximum controller loop steps before forced termination (default: 30) */
    public MaxSteps: number = 30;

    /**
     * Recent screenshots included in controller context, as a ring buffer.
     * Higher values give more context but increase token usage. (default: 20)
     */
    public ScreenshotHistoryDepth: number = 20;

    /**
     * Delay before each screenshot capture, giving the page time to render.
     * (default: 500, 0 disables). Only the floor fallback when no
     * {@link AppProfile} is supplied — otherwise the settle loop's `MinWaitMs` governs.
     */
    public ScreenshotDelayMs: number = 500;

    /**
     * App-specific readiness/busy signals the adaptive settle loop consults
     * before perceiving. Merged with the engine's app-neutral defaults. Omit for
     * zero-config heuristic settling.
     */
    public AppProfile?: AppProfile;

    /**
     * Maximum *agent* time (ms) before the run expires with `TimeBudgetExceeded`,
     * excluding engine-side settle waiting so a slow app doesn't consume the
     * agent's reasoning budget. On expiry one forced final judge runs so the run
     * is still scored. Omit/0 to disable. Distinct from MaxSteps, which bounds
     * decision count.
     */
    public MaxExecutionTimeMs?: number;

    /** Override for the controller system prompt */
    public ControllerPrompt?: string;

    /** Override for the judge prompt */
    public JudgePrompt?: string;

    /** Model selection for the controller LLM */
    public ControllerModel?: ModelConfig;

    /** Model selection for the judge LLM */
    public JudgeModel?: ModelConfig;

    /** Tools the LLM can invoke during execution */
    public Tools?: ComputerUseTool[];

    /** Per-domain authentication configuration */
    public Auth?: ComputerUseAuthConfig;

    /**
     * Judge evaluation frequency (default: EveryStep). Use EveryNSteps or
     * OnStagnation to reduce LLM costs.
     */
    public JudgeFrequency?: JudgeFrequency;

    /** Browser-specific configuration (viewport, user agent, timeouts) */
    public BrowserConfig?: BrowserConfig;

    /** Receives all engine log messages in addition to console output. */
    public LogCallback?: (level: 'info' | 'warn' | 'error', message: string) => void;

    /**
     * Free-form markdown about the application under test, rendered into the
     * controller prompt under "## Application Context" so the LLM doesn't
     * rediscover navigation landmarks every test. Typically sourced from
     * `TestSuite.Configuration.applicationContext`.
     */
    public ApplicationContext?: string;

    /**
     * The browser context will be destroyed right after this run rather than
     * recycled. Teardown then skips the between-test state scrub, which would
     * otherwise re-navigate to the app origin — a wasted app boot. Leave
     * false/unset for recycled shared contexts, where the scrub is required.
     */
    public EphemeralContext?: boolean;

    /**
     * When set, records a forensic browser trace (DOM + screenshots + network +
     * console) and writes it here on completion, echoed on
     * {@link ComputerUseResult.TracePath}. Retain-or-discard is the caller's
     * policy. Unset skips tracing entirely.
     */
    public TracePath?: string;

    /**
     * Extract the page's interactive elements into a stable indexed list each
     * step so the controller can act by index (ClickElement/TypeIntoElement)
     * with locator-based auto-wait instead of estimating coordinates. Default
     * off (coordinate/vision mode).
     */
    public ElementGrounding?: boolean;

    /**
     * Max browser actions executed per step before the batch stops (default 4).
     * The engine also halts on a failed action, a mid-batch route change, or a
     * page-changing action.
     */
    public MaxActionsPerStep?: number;

    /**
     * The test's authored pass criteria, threaded into the judge, which returns a
     * per-criterion verdict; `Done` is derived as all-criteria-met. Empty →
     * scalar judging.
     */
    public ValidationCriteria?: string[];

    /**
     * Per-test UI hints injected after the goal in the controller prompt — e.g.
     * "the filter panel opens via the funnel icon".
     */
    public Hints?: string[];

    /**
     * Values substituted into the `%placeholder%` tokens a recorded trace stores
     * in typed text / navigate URLs, so a "create record named %recordName%"
     * trace runs with a fresh name each time. Ignored on the LLM tier.
     */
    public VariableValues?: Record<string, string>;

    /**
     * Scripted navigation run before the agentic loop, zero LLM. Omit for tests
     * that begin at {@link StartUrl}, or whose subject IS navigation.
     */
    public Prelude?: RunPrelude;

    /**
     * localStorage + IndexedDB captured once post-login and restored before the
     * app boots, so it doesn't cold-boot its metadata cache. Restored
     * best-effort. Omit to cold-boot.
     */
    public ContextSeed?: ContextSeed;

    /**
     * A memo from a prior failed attempt at this goal, injected into the
     * controller prompt so a retry is non-blind. Typically the previous
     * attempt's {@link ComputerUseResult.FailureMemo}.
     */
    public PreviousAttemptSummary?: string;

    /**
     * Ordered tour checkpoints. When set, the run passes iff every checkpoint
     * latches met (sticky) and the final verdict is synthesized from the latch
     * state rather than a single end-state judge. Empty → single-end-state
     * judging over {@link ValidationCriteria}.
     */
    public Checkpoints?: RunCheckpoint[];
}
