/**
 * Shape of the `Configuration` column on `MJ: Tests`.
 *
 * The column is shared by every test type, and each driver parses its own shape
 * out of it — so the named properties here are the ones the *framework*
 * understands and the index signature carries the rest through untouched. Adding
 * a framework-level option is an edit to this interface plus `mj sync push`,
 * never a migration.
 *
 * @see plans/regression-testing/dom-selection-and-replay-design.md
 */
export interface ITestConfiguration {
    /**
     * The recorded, replayable trajectory for this test — written by a passing
     * agent-driven run, replayed by later runs with no model calls. Absent until
     * the first run records one. Held structurally identical to `ComputerUseTrace`
     * by compile-time assertions in `@memberjunction/computer-use-engine`.
     */
    TestJSONScript?: ITestJSONScript;

    /**
     * Whether a failed replay may fall back to the agent, re-derive the goal, and
     * overwrite {@link TestJSONScript}. Defaults to **true**. Set `false` to pin a
     * test to deterministic execution, wherever a silent re-derivation could paper
     * over the regression the test exists to catch.
     */
    AllowLLMFallback?: boolean;

    /** Driver-specific configuration, passed through untouched. */
    [key: string]: unknown;
}

/**
 * A recorded, replayable trajectory for one test. An exact `AppBuildHash` match
 * replays with no healing expected; any mismatch replays with healing; a changed
 * `GoalHash` falls back to the agent, the script no longer describing what the
 * test asks for.
 */
export interface ITestJSONScript {
    /** Stable per-test identifier the script is keyed by. */
    TestId: string;
    /** Opaque build identity at record time. Compared, never parsed; empty when unknown. */
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
     * Names of the variables the test declares. Values are never stored: recording
     * leaves `%name%` tokens in step text and URLs, and replay substitutes fresh
     * values in.
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

/** The deterministic subset of browser actions a step can record — elements, never pixels. */
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

/** Only the fields relevant to {@link ITestJSONScriptAction.Method} are populated. */
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
 * A multi-signal locator. `Selector` is primary; `Role` + `Name` are the heal
 * fallback, re-resolved from a fresh element list when the selector stops
 * matching; `BoundingBox` is weakest, kept only for pre-grounding recordings.
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
 * Guard evaluated BEFORE a step. Fail-fast by contract: a target that never becomes
 * attached and visible fails the step — replay never proceeds anyway.
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
 * Guard evaluated AFTER a step, confirming it advanced the page as the recording
 * did. Failing one marks the step diverged and starts the heal ladder.
 */
export interface ITestJSONScriptPostcondition {
    /** Expected normalized URL pattern after the step's action ran. */
    UrlPattern?: string;
    /** An element expected to be visible after the step. */
    ExpectVisible?: ITestJSONScriptTarget;
}

/**
 * A goal-level assertion distilled from a passing run. Replay scores by executing
 * these, so the model-based judge runs only on the agent tier.
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
