/**
 * Trace types for deterministic replay.
 *
 * The strategic frame: **first run = compile; subsequent runs = execute.** A
 * passing, judge-approved run is distilled into a {@link ComputerUseTrace} — a
 * resolved, replayable trajectory. Later runs replay it through the same adapter
 * at Playwright speed with zero LLM cost, self-healing on UI drift
 *, keyed/invalidated by build identity, and scored by
 * deterministic postconditions.
 *
 * App-agnostic: nothing here names any specific app. Target descriptors, URL
 * patterns, and build identity are all opaque data the recorder derives from a
 * run's own {@link StepRecord}s (which in turn came from the AppProfile the
 * caller supplied). {@link ComputerUseTrace.AppVersion} is a generic version
 * string — Layer 2 stamps whatever version identity it has (e.g. an MJ package
 * version); Layer 1 only compares it.
 */

import { BoundingBox } from './browser.js';

// ─── Trace Action ──────────────────────────────────────────
/**
 * The deterministic subset of {@link BrowserAction} a recorded step can perform.
 * Vision-only primitives (raw mouse-down/up, drag-by-coordinate) are not
 * recorded — replay targets elements, not pixels.
 */
export type TraceActionMethod =
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
 * A multi-signal locator for a recorded step's target (Momentic's locator-set
 * discipline): a `Selector` is the primary signal, `Role`+`Name` are the
 * self-heal fallback (re-resolved from a fresh element list), and
 * `BoundingBox` is the weakest guard, stored only for coordinate-era recordings
 * made before element grounding was on.
 */
export class TraceTarget {
    /** ARIA/semantic role (e.g. 'button', 'link', 'textbox'), when known. */
    public Role?: string;
    /** Accessible name / label / visible text, when known. */
    public Name?: string;
    /** Selector the adapter can act on / re-resolve — the primary replay signal. */
    public Selector?: string;
    /** Bounding box hint (weakest guard; coordinate-era recordings only). */
    public BoundingBox?: BoundingBox;
}

/**
 * The action a recorded step performs. Only the fields relevant to
 * {@link Method} are populated. Text/Url carry `%placeholder%` tokens for any
 * declared {@link ComputerUseTrace.Variables} (names only — Stagehand
 * discipline), which replay substitutes with fresh values.
 */
export class TraceAction {
    public Method: TraceActionMethod = 'click';
    /** Target for click / type / scroll actions. */
    public Target?: TraceTarget;
    /** Text to type (type), possibly with `%placeholder%` variable tokens. */
    public Text?: string;
    /** Key or chord to press (keypress). */
    public Key?: string;
    /** Destination (navigate), normalized + variable-tokenized. */
    public Url?: string;
    /** Press Enter after typing (type). */
    public PressEnter?: boolean;
    /** Click count (click) — 1 = single, 2 = double. */
    public ClickCount?: number;
    /** Mouse button (click). */
    public Button?: 'left' | 'right' | 'middle';
    /** Wait duration in ms (wait, no target). */
    public DurationMs?: number;
}

// ─── Step Guards ───────────────────────────────────────────
/**
 * Guard evaluated BEFORE a replay step runs. Fail-fast by contract: a target
 * that never becomes attached+visible within the bound FAILS the step — replay
 * never "proceeds anyway" on a missed precondition (the Stagehand
 * `waitForCachedSelector` wart the plan calls out).
 */
export class StepPrecondition {
    /** Wait for the action's target to be attached + visible before acting. */
    public WaitForTarget: boolean = true;
    /** Expected (normalized) URL pattern at the start of this step, when recorded. */
    public UrlPattern?: string;
    /** Require the app's readiness beacon (from the AppProfile) before acting. */
    public ReadyBeacon: boolean = false;
}

/**
 * Guard evaluated AFTER a replay step to confirm it advanced the page as the
 * recording did. A failed postcondition marks the step `diverged` and
 * triggers the heal/re-derive ladder.
 */
export class StepPostcondition {
    /** Expected (normalized) URL pattern after the step's action ran. */
    public UrlPattern?: string;
    /** An element expected to be visible after the step (role/name presence). */
    public ExpectVisible?: TraceTarget;
}

// ─── Goal Postconditions ───────────────────────────────────
/**
 * A final, goal-level deterministic assertion distilled from a passing run's
 * judge verdict + end-state. The replay tier scores by executing these
 * — free, deterministic, and more trustworthy than a judge float — so the LLM
 * judge runs only on the LLM tier or when a postcondition is ambiguous/fails.
 */
export class GoalPostcondition {
    /**
     * - `'url'`     — the final URL matches {@link UrlPattern}.
     * - `'visible'` — {@link Target} (role/name) is present in the end-state.
     * - `'absent'`  — {@link Target} is NOT present (e.g. no error toast).
     */
    public Kind: 'url' | 'visible' | 'absent' = 'visible';
    public UrlPattern?: string;
    public Target?: TraceTarget;
    /** Provenance — e.g. the validation criterion this was distilled from. */
    public Description?: string;
}

// ─── Trace Envelope ────────────────────────────────────────
/** Viewport at record time — replay must match it for coordinate-era guards. */
export class TraceViewport {
    public Width: number = 1280;
    public Height: number = 720;
}

/**
 * A recorded, replayable trajectory for one test. Keyed by
 * {@link TestId}; validated on load by {@link AppBuildHash} + {@link AppVersion}
 * + {@link GoalHash}. The `steps.json` in a run's artifacts is this in
 * embryo — this is the durable, normalized, variable-disciplined form.
 */
export class ComputerUseTrace {
    /** Stable per-test identifier the trace is keyed by. */
    public TestId: string = '';
    /**
     * Opaque build identity at record time. Layer 2 supplies whatever
     * stable build hash it has (e.g. a dist-manifest hash); Layer 1 only
     * compares it to decide the replay tier. Empty when the caller has none.
     */
    public AppBuildHash: string = '';
    /**
     * Opaque app/package version at record time (generic — Layer 2 stamps its
     * own version string, e.g. an MJ package version). Compared, never parsed.
     */
    public AppVersion: string = '';
    /** Hash of the frozen goal text — a goal edit demotes to LLM tier. */
    public GoalHash: string = '';
    /** ISO-8601 timestamp when this trace was recorded. */
    public RecordedAt: string = '';
    /** Viewport at record time. */
    public Viewport: TraceViewport = new TraceViewport();
    /**
     * Names of variables the test declares (e.g. `['recordName']`). Values are
     * NEVER stored — only names; replay substitutes fresh values into the
     * `%placeholder%` tokens in step Text/Url (Stagehand discipline).
     */
    public Variables: string[] = [];
    /** The resolved, ordered replay steps. */
    public Steps: TraceStep[] = [];
    /** Final goal-level deterministic assertions. */
    public GoalPostconditions: GoalPostcondition[] = [];
}

// ─── Replay Telemetry ──────────────────────────────────────
/**
 * Per-step replay outcome (Momentic's Cache pane vocabulary), which doubles as
 * UI-drift telemetry:
 * - `'hit'`      — replayed deterministically; guards passed as recorded.
 * - `'healed'`   — the recorded target drifted; one focused heal call
 *                  re-resolved it and the trace step was rewritten.
 * - `'diverged'` — replay + heal both failed; the run falls back to the LLM tier.
 */
export type ReplayStepOutcome = 'hit' | 'healed' | 'diverged';

/** Outcome of replaying one trace step. */
export class ReplayStepResult {
    /** 0-based index into the trace's Steps. */
    public StepIndex: number = 0;
    /** The step's recorded instruction (for the run log / drift report). */
    public Instruction: string = '';
    public Outcome: ReplayStepOutcome = 'hit';
    /** Human-readable detail — why it healed/diverged, or 'ok'. */
    public Detail: string = '';
}

/**
 * Replay telemetry stamped onto a {@link ComputerUseResult} produced by the
 * replay tier. A suite-wide spike in {@link Healed}/{@link Diverged}
 * after a merge is a free "this PR changed the UI" signal.
 */
export class ReplayInfo {
    /** Which tier this run executed in. */
    public Tier: 'replay' | 'replay-with-heal' = 'replay';
    /** Per-step outcomes in order. */
    public Steps: ReplayStepResult[] = [];
    /** Count of steps that self-healed. */
    public Healed: number = 0;
    /** Count of steps that diverged (unrecovered). */
    public Diverged: number = 0;
    /** Whether every step hit or healed (no unrecovered divergence). */
    public AllStepsSucceeded: boolean = false;
}

/** A recorded, replayable step. */
export class TraceStep {
    /** Human-readable intent (from the controller's reasoning) — the heal prompt seed. */
    public Instruction: string = '';
    /** Normalized URL at the start of this step. */
    public UrlBefore: string = '';
    public Action: TraceAction = new TraceAction();
    public Precondition: StepPrecondition = new StepPrecondition();
    public Postcondition?: StepPostcondition;
}
