/**
 * Shape of the `Configuration` column on `MJ: Tests` — the per-test JSON bag every
 * test driver already reads, now typed so CodeGen emits a `ConfigurationObject`
 * accessor instead of a raw string.
 *
 * **Why the index signature.** `Configuration` is shared by every test type (Agent
 * Eval, Workflow, Computer Use), and each driver parses its own shape out of it.
 * The named properties here are the ones the *framework* understands; everything
 * else is a driver's business and passes through untouched. Adding a framework-level
 * option is an edit to this interface plus `mj sync push` — never a migration.
 *
 * **Why the script lives here.** A replay script is a generated artifact of a test,
 * not source. Keeping it in this column means it travels with the test row, arrives
 * already in the TestingEngine's local cache, and needs no second store to keep in
 * step with the test it belongs to.
 *
 * @see plans/regression-testing/dom-selection-and-replay-design.md
 */
export interface ITestConfiguration {
    /**
     * The recorded, replayable trajectory for this test — written by a passing
     * agent-driven run and replayed by later runs at browser speed with no model
     * calls. Absent until the first run records one.
     *
     * Structurally identical to `ComputerUseTrace` in `@memberjunction/computer-use`;
     * `@memberjunction/computer-use-engine` asserts that in both directions at
     * compile time, so the two cannot drift apart silently.
     */
    TestJSONScript?: ITestJSONScript;

    /**
     * Whether a failed replay may fall back to the agent, re-derive the goal, and
     * overwrite {@link TestJSONScript} with what it learned. Defaults to **true**.
     *
     * Set `false` to pin a test to deterministic execution: a drifted script then
     * fails as a divergence instead of being quietly re-derived. That is the right
     * setting wherever a re-derivation could paper over the very regression the
     * test exists to catch.
     */
    AllowLLMFallback?: boolean;

    /** Driver-specific configuration, passed through untouched. */
    [key: string]: unknown;
}

/**
 * A recorded, replayable trajectory for one test.
 *
 * Keyed by {@link ITestJSONScript.TestId}; validated on load against
 * {@link ITestJSONScript.AppBuildHash}, {@link ITestJSONScript.AppVersion} and
 * {@link ITestJSONScript.GoalHash}. An exact build match replays with no healing
 * expected; any mismatch replays with healing; a changed goal falls back to the
 * agent, because the script no longer describes what the test asks for.
 */
export interface ITestJSONScript {
    /** Stable per-test identifier the script is keyed by. */
    TestId: string;
    /**
     * Opaque build identity at record time. Compared, never parsed — a caller
     * supplies whatever stable identity it has. Empty when it has none.
     */
    AppBuildHash: string;
    /** Opaque app/package version at record time. Compared, never parsed. */
    AppVersion: string;
    /** Hash of the frozen goal text — a goal edit invalidates the script. */
    GoalHash: string;
    /** ISO-8601 timestamp when this script was recorded. */
    RecordedAt: string;
    /** Viewport at record time; replay must match it for coordinate-era guards. */
    Viewport: ITestJSONScriptViewport;
    /**
     * Names of the variables the test declares. Values are never stored — only
     * names. Replay substitutes fresh values into the `%placeholder%` tokens that
     * recording left in step text and URLs.
     */
    Variables: string[];
    /** The resolved, ordered replay steps. */
    Steps: ITestJSONScriptStep[];
    /** Final goal-level deterministic assertions. */
    GoalPostconditions: ITestJSONScriptGoalPostcondition[];
}

/** Viewport at record time. */
export interface ITestJSONScriptViewport {
    Width: number;
    Height: number;
}

/** One recorded, replayable step. */
export interface ITestJSONScriptStep {
    /** Human-readable intent, carried from the agent's own reasoning. */
    Instruction: string;
    /** Normalized URL at the start of this step. */
    UrlBefore: string;
    Action: ITestJSONScriptAction;
    Precondition: ITestJSONScriptPrecondition;
    Postcondition?: ITestJSONScriptPostcondition;
}

/**
 * The deterministic subset of browser actions a recorded step can perform.
 * Vision-only primitives are never recorded — replay targets elements, not pixels.
 */
export type ITestJSONScriptActionMethod =
    | 'click'
    | 'type'
    | 'navigate'
    | 'keypress'
    | 'scroll'
    | 'wait'
    | 'goBack'
    | 'goForward'
    | 'refresh';

/**
 * The action a recorded step performs. Only the fields relevant to
 * {@link ITestJSONScriptAction.Method} are populated. Text and URLs carry
 * `%placeholder%` tokens for any declared variable.
 */
export interface ITestJSONScriptAction {
    Method: ITestJSONScriptActionMethod;
    /** Target for click / type / scroll actions. */
    Target?: ITestJSONScriptTarget;
    /** Text to type, possibly with `%placeholder%` variable tokens. */
    Text?: string;
    /** Key or chord to press. */
    Key?: string;
    /** Destination, normalized and variable-tokenized. */
    Url?: string;
    /** Press Enter after typing. */
    PressEnter?: boolean;
    /** 1 = single click, 2 = double. */
    ClickCount?: number;
    Button?: 'left' | 'right' | 'middle';
    /** Wait duration in ms. */
    DurationMs?: number;
}

/**
 * A multi-signal locator for a step's target. `Selector` is the primary signal;
 * `Role` and `Name` are the self-heal fallback, re-resolved from a fresh element
 * list when the selector no longer matches; `BoundingBox` is the weakest guard,
 * stored only for recordings made before element grounding was on.
 */
export interface ITestJSONScriptTarget {
    Role?: string;
    Name?: string;
    Selector?: string;
    BoundingBox?: ITestJSONScriptBoundingBox;
}

/** Rendered position of a target at record time. */
export interface ITestJSONScriptBoundingBox {
    XMin: number;
    YMin: number;
    XMax: number;
    YMax: number;
}

/**
 * Guard evaluated BEFORE a step runs. Fail-fast by contract: a target that never
 * becomes attached and visible within the bound fails the step. Replay never
 * proceeds anyway on a missed precondition.
 */
export interface ITestJSONScriptPrecondition {
    /** Wait for the action's target to be attached and visible before acting. */
    WaitForTarget: boolean;
    /** Expected normalized URL pattern at the start of this step. */
    UrlPattern?: string;
    /** Require the app's readiness beacon before acting. */
    ReadyBeacon: boolean;
}

/**
 * Guard evaluated AFTER a step, confirming it advanced the page the way the
 * recording did. A failure marks the step diverged and starts the heal ladder.
 */
export interface ITestJSONScriptPostcondition {
    /** Expected normalized URL pattern after the step's action ran. */
    UrlPattern?: string;
    /** An element expected to be visible after the step. */
    ExpectVisible?: ITestJSONScriptTarget;
}

/**
 * A goal-level deterministic assertion distilled from a passing run. Replay scores
 * by executing these, so the model-based judge runs only on the agent tier or when
 * an assertion is ambiguous.
 */
export interface ITestJSONScriptGoalPostcondition {
    /**
     * - `'url'` — the final URL matches `UrlPattern`.
     * - `'visible'` — `Target` is present in the end state.
     * - `'absent'` — `Target` is not present (no error toast, say).
     */
    Kind: 'url' | 'visible' | 'absent';
    UrlPattern?: string;
    Target?: ITestJSONScriptTarget;
    /** Provenance — the validation criterion this was distilled from. */
    Description?: string;
}
