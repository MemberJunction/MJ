/**
 * Trace recorder (CU-C1) — distill a passing run into a replayable trace.
 *
 * The recording side is nearly free: it piggybacks on the {@link StepRecord}s a
 * run already produces and emits the durable, normalized {@link ComputerUseTrace}
 * that everything else in Theme C consumes (replay C2, heal C3, keying C4,
 * postconditions C5).
 *
 * Pure and app-agnostic: no browser, no clock, no I/O. The caller supplies the
 * timestamp, build identity, variables, and (from CU-C5) the goal postconditions;
 * app-specific URL volatility comes in as `volatileParams` (from the AppProfile).
 *
 * Recordable-run gate — which run "counts" (the plan's bar): a clean pass only.
 * Status Completed + judge Done + no FailureReason (no loop trip / auth detour)
 * + no step errors + every essential action is deterministically replayable.
 * Wait/Scroll are dropped (replay's settle + Playwright's action auto-wait /
 * auto-scroll-into-view subsume them); vision-only primitives (drag, raw
 * mouse/key up-down) and tool-call steps make a run NON-recordable rather than
 * yield a lossy trace. Oracle-green is a Layer-2 fact the driver ANDs in before
 * recording — Layer 1 asserts only what a result carries.
 */

import { ComputerUseResult } from '../types/results.js';
import { StepRecord } from '../types/judge.js';
import type { BrowserAction, InteractiveElement, BoundingBox } from '../types/browser.js';
import {
    ComputerUseTrace,
    TraceStep,
    TraceAction,
    TraceTarget,
    TraceViewport,
    StepPrecondition,
    StepPostcondition,
    GoalPostcondition,
    TraceActionMethod,
} from '../types/trace.js';
import { normalizeTraceUrl } from './trace-url.js';

/** Options for {@link recordTrace}. */
export interface RecordTraceOptions {
    /** The passing run to distill (assumed to have passed {@link isRecordableRun}). */
    result: ComputerUseResult;
    /** Stable per-test identifier the trace is keyed by. */
    testId: string;
    /** The (frozen) goal text — hashed into the trace for CU-C4 invalidation. */
    goal: string;
    /** Opaque build identity at record time (CU-C4); '' when the caller has none. */
    appBuildHash?: string;
    /** Opaque app/package version string (generic — Layer 2 stamps its own). */
    appVersion?: string;
    /** ISO-8601 record timestamp — supplied by the caller (recorder is clock-free). */
    recordedAt: string;
    /** Declared variable NAMES (values are never stored). */
    variables?: string[];
    /**
     * Concrete values used this run, keyed by variable name. Used ONLY to
     * tokenize Text/Url back to `%name%` placeholders so the trace is reusable
     * with fresh values. Never stored.
     */
    variableValues?: Record<string, string>;
    /** App-specific volatile query params to strip from recorded URLs (from AppProfile). */
    volatileParams?: string[];
    /** Viewport at record time; defaults to 1280×720. */
    viewport?: { width: number; height: number };
    /** Distilled goal-level postconditions (CU-C5); [] when none. */
    goalPostconditions?: GoalPostcondition[];
}

/** Browser-action types that distill to a replay TraceStep. */
const RECORDABLE_METHODS: Record<string, TraceActionMethod> = {
    Click: 'click',
    ClickElement: 'click',
    Type: 'type',
    TypeIntoElement: 'type',
    Keypress: 'keypress',
    Navigate: 'navigate',
    GoBack: 'goBack',
    GoForward: 'goForward',
    Refresh: 'refresh',
};

/** Action types that are legal in a recordable run but produce NO trace step. */
const DROPPED_TYPES = new Set(['Wait', 'Scroll']);

/**
 * Whether a run is clean enough to record as a trace. Returns a reason on
 * refusal so the caller can log why a pass was not recorded. Layer 2 should
 * additionally require all oracles green before calling {@link recordTrace}.
 */
export function isRecordableRun(result: ComputerUseResult): { recordable: boolean; reason?: string } {
    if (result.Status !== 'Completed') {
        return { recordable: false, reason: `status is ${result.Status}, not Completed` };
    }
    if (!result.FinalJudgeVerdict?.Done) {
        return { recordable: false, reason: 'final judge verdict is not Done' };
    }
    if (result.FailureReason) {
        return { recordable: false, reason: `carries a failure reason (${result.FailureReason})` };
    }
    for (const step of result.Steps) {
        if (step.Error) {
            return { recordable: false, reason: `step ${step.StepNumber} errored` };
        }
        if (step.ToolCalls.length > 0) {
            return { recordable: false, reason: `step ${step.StepNumber} used tool calls (not deterministically replayable)` };
        }
        for (const action of successfulActions(step)) {
            if (!DROPPED_TYPES.has(action.Type) && !(action.Type in RECORDABLE_METHODS)) {
                return { recordable: false, reason: `step ${step.StepNumber} used non-replayable action ${action.Type}` };
            }
        }
    }
    return { recordable: true };
}

/** Distill a passing {@link ComputerUseResult} into a {@link ComputerUseTrace}. */
export function recordTrace(options: RecordTraceOptions): ComputerUseTrace {
    const volatile = options.volatileParams ?? [];
    const trace = new ComputerUseTrace();
    trace.TestId = options.testId;
    trace.AppBuildHash = options.appBuildHash ?? '';
    trace.AppVersion = options.appVersion ?? '';
    trace.GoalHash = hashGoal(options.goal);
    trace.RecordedAt = options.recordedAt;
    trace.Variables = options.variables ?? [];
    trace.GoalPostconditions = options.goalPostconditions ?? [];

    const viewport = new TraceViewport();
    if (options.viewport) {
        viewport.Width = options.viewport.width;
        viewport.Height = options.viewport.height;
    }
    trace.Viewport = viewport;

    for (const step of options.result.Steps) {
        trace.Steps.push(...distillStep(step, volatile, options.variableValues));
    }
    return trace;
}

/**
 * A stable, non-cryptographic hash of the goal text (djb2 → hex). The goal is
 * frozen fixture data: a reword changes the hash and demotes the test to the
 * LLM tier (CU-C4). Trivial whitespace differences are collapsed first so
 * reformatting alone doesn't invalidate. Exported so CU-C4 keying reuses it.
 */
export function hashGoal(goal: string): string {
    const normalized = (goal ?? '').trim().replace(/\s+/g, ' ');
    let h = 5381;
    for (let i = 0; i < normalized.length; i++) {
        h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

// ─── Internals ─────────────────────────────────────────────

/** The successfully-executed actions of a step, in order. */
function successfulActions(step: StepRecord): BrowserAction[] {
    return step.ActionResults.filter(r => r.Success).map(r => r.Action);
}

/**
 * Flatten one recorded step into zero or more replay steps — one per
 * successfully-executed, replayable action. The parent step's instruction +
 * urlBefore ride along; the first emitted step carries the URL precondition and
 * the last carries the navigation postcondition (when the step changed URL).
 */
function distillStep(
    step: StepRecord,
    volatile: string[],
    variableValues?: Record<string, string>
): TraceStep[] {
    const urlBefore = normalizeTraceUrl(step.UrlBefore || step.Url, volatile);
    const urlAfter = normalizeTraceUrl(step.UrlAfter || step.UrlBefore || step.Url, volatile);
    const instruction = compactInstruction(step.ControllerReasoning);
    const elementsByIndex = indexElements(step.InteractiveElements);

    const actions = successfulActions(step).filter(a => a.Type in RECORDABLE_METHODS);
    const out: TraceStep[] = [];
    actions.forEach((action, i) => {
        const traceStep = new TraceStep();
        traceStep.Instruction = instruction;
        traceStep.UrlBefore = urlBefore;
        traceStep.Action = mapAction(action, elementsByIndex, volatile, variableValues);

        const pre = new StepPrecondition();
        pre.WaitForTarget = traceStep.Action.Target !== undefined;
        // Only the first action of a batch asserts the entry URL — later actions
        // in the same step run on a page that may already have moved.
        if (i === 0 && urlBefore) {
            pre.UrlPattern = urlBefore;
        }
        traceStep.Precondition = pre;

        // The last action of a step that changed the URL gets a navigation
        // postcondition — the highest-signal, cheapest drift check.
        if (i === actions.length - 1 && urlAfter && urlAfter !== urlBefore) {
            const post = new StepPostcondition();
            post.UrlPattern = urlAfter;
            traceStep.Postcondition = post;
        }
        out.push(traceStep);
    });
    return out;
}

/** Map a StepRecord's InteractiveElements by their per-snapshot index. */
function indexElements(elements: InteractiveElement[]): Map<number, InteractiveElement> {
    const map = new Map<number, InteractiveElement>();
    for (const el of elements) {
        map.set(el.Index, el);
    }
    return map;
}

/** Translate one recordable browser action into a {@link TraceAction}. */
function mapAction(
    action: BrowserAction,
    elementsByIndex: Map<number, InteractiveElement>,
    volatile: string[],
    variableValues?: Record<string, string>
): TraceAction {
    const ta = new TraceAction();
    ta.Method = RECORDABLE_METHODS[action.Type];

    switch (action.Type) {
        case 'Click':
            ta.Button = action.Button;
            ta.ClickCount = action.ClickCount;
            ta.Target = targetFromSelectorOrBox(action.Selector, action.BoundingBox);
            break;
        case 'ClickElement':
            ta.Button = action.Button;
            ta.ClickCount = action.ClickCount;
            ta.Target = targetFromElement(elementsByIndex.get(action.Index));
            break;
        case 'Type':
            ta.Text = tokenize(action.Text, variableValues);
            ta.Target = action.Selector ? targetFromSelectorOrBox(action.Selector) : undefined;
            break;
        case 'TypeIntoElement':
            ta.Text = tokenize(action.Text, variableValues);
            ta.PressEnter = action.PressEnter;
            ta.Target = targetFromElement(elementsByIndex.get(action.Index));
            break;
        case 'Keypress':
            ta.Key = action.Key;
            break;
        case 'Navigate':
            ta.Url = tokenize(normalizeTraceUrl(action.Url, volatile), variableValues);
            break;
        // GoBack / GoForward / Refresh carry no fields.
    }
    return ta;
}

function targetFromElement(el: InteractiveElement | undefined): TraceTarget | undefined {
    if (!el) {
        return undefined;
    }
    const t = new TraceTarget();
    t.Role = el.Role || undefined;
    t.Name = el.Name || undefined;
    t.Selector = el.Selector || undefined;
    t.BoundingBox = el.BoundingBox;
    return t;
}

function targetFromSelectorOrBox(selector?: string, box?: BoundingBox): TraceTarget | undefined {
    if (!selector && !box) {
        return undefined;
    }
    const t = new TraceTarget();
    t.Selector = selector || undefined;
    t.BoundingBox = box;
    return t;
}

/** Replace concrete variable values with `%name%` placeholders (Stagehand discipline). */
function tokenize(text: string | undefined, variableValues?: Record<string, string>): string | undefined {
    if (text === undefined || !variableValues) {
        return text;
    }
    let out = text;
    for (const [name, value] of Object.entries(variableValues)) {
        if (value) {
            out = out.split(value).join(`%${name}%`);
        }
    }
    return out;
}

/** The heal-prompt seed / human label: first line of the reasoning, bounded. */
function compactInstruction(reasoning: string): string {
    return (reasoning ?? '').trim().split('\n')[0].slice(0, 200);
}
