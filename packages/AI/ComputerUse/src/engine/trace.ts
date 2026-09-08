/**
 * The recorded-trace lifecycle: URL normalization for stable keying, distilling a
 * passing run into a replayable trace, deciding which execution tier a test runs
 * in, and diffing a fresh derivation against the stored trace to surface UI drift.
 *
 * Pure and app-agnostic throughout — no browser, clock, or I/O. Callers supply
 * timestamps, build identity, variables, and `volatileParams`.
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

// ─── URL Normalization ─────────────────────────────────

/** Matches a UUID (any version) anywhere in a string; global + case-insensitive. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The token a UUID is replaced with — stable across visits/platforms. */
export const UUID_TOKEN = '{uuid}';

/**
 * Normalize a URL for stable trace keying / comparison. Returns the input
 * (trimmed) unchanged when it can't be parsed as a URL — a best-effort that
 * never throws.
 */
export function normalizeTraceUrl(url: string, volatileParams: string[] = []): string {
    const raw = (url ?? '').trim();
    if (!raw) {
        return '';
    }

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        // Not an absolute URL — normalize UUIDs in the raw string at least, so a
        // path-only pattern (e.g. '/app/record/<uuid>') still keys stably.
        return raw.replace(UUID_RE, UUID_TOKEN);
    }

    const volatile = new Set(volatileParams.map(p => p.toLowerCase()));
    const params: [string, string][] = [];
    parsed.searchParams.forEach((value, name) => {
        if (!volatile.has(name.toLowerCase())) {
            params.push([name, value.replace(UUID_RE, UUID_TOKEN)]);
        }
    });
    params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    const path = parsed.pathname.replace(UUID_RE, UUID_TOKEN);
    const query = params.length > 0
        ? '?' + params.map(([n, v]) => `${n}=${v}`).join('&')
        : '';
    // Hash fragment is intentionally dropped.
    return `${parsed.origin}${path}${query}`;
}

/**
 * Whether an actual URL satisfies a recorded URL pattern. Both are normalized,
 * then the pattern is matched as a substring of the actual — so a full-URL
 * pattern matches exactly and a path-fragment pattern (e.g. `/app/data`)
 * matches any URL containing it. An empty pattern matches anything (no
 * constraint recorded).
 */
export function traceUrlMatches(pattern: string, actualUrl: string, volatileParams: string[] = []): boolean {
    const p = normalizeTraceUrl(pattern, volatileParams);
    if (!p) {
        return true;
    }
    const a = normalizeTraceUrl(actualUrl, volatileParams);
    return a.includes(p);
}

// ─── Recording ─────────────────────────────────────────

/** Options for {@link recordTrace}. */
export interface RecordTraceOptions {
    /** The passing run to distill (assumed to have passed {@link isRecordableRun}). */
    result: ComputerUseResult;
    /** Stable per-test identifier the trace is keyed by. */
    testId: string;
 /** The (frozen) goal text — hashed into the trace forinvalidation. */
    goal: string;
    /** Opaque build identity at record time; '' when the caller has none. */
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
    /** Distilled goal-level postconditions; [] when none. */
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
 * LLM tier. Trivial whitespace differences are collapsed first so
 * reformatting alone doesn't invalidate. Exported sokeying reuses it.
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

// ─── Tier Decision ─────────────────────────────────────

/**
 * Execution tier for a test on a given run:
 * - `'replay'`           — deterministic replay, no heal expected (exact build match).
 * - `'replay-with-heal'` — replay, but tolerate per-step self-heal on drift.
 * - `'llm'`              — full LLM controller (today's engine); records on pass.
 */
export type ReplayTier = 'replay' | 'replay-with-heal' | 'llm';

/** Default heal-rate at/above which a test is demoted from replay to the LLM tier. */
export const DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD = 0.5;

export interface TierDecisionInput {
    /** The recorded trace for this test, or null/undefined when none exists. */
    trace?: ComputerUseTrace | null;
    /** The test's current (live) goal text — hashed and compared to the trace's GoalHash. */
    currentGoal: string;
    /** The current build identity (opaque). Empty/undefined when the stack can't provide one. */
    currentBuildHash?: string;
    /** The current app/version identity (opaque). Advisory alongside the build hash. */
    currentAppVersion?: string;
    /**
     * Rolling heal rate for this test from recent replays (0..1); undefined when
     * unknown (first replay, no telemetry). A high value means the cached
     * trajectory keeps drifting — re-derive rather than heal every step.
     */
    healRate?: number;
    /** Demote to the LLM tier when {@link healRate} ≥ this (default 0.5). */
    healRateThreshold?: number;
}

export interface TierDecision {
    tier: ReplayTier;
    reason: string;
}

/** Whether the live goal text still matches the trace's frozen goal hash. */
export function goalMatchesTrace(trace: ComputerUseTrace, currentGoal: string): boolean {
    return trace.GoalHash === hashGoal(currentGoal);
}

/**
 * Decide the execution tier for a test. Precedence (first match wins):
 *   1. No trace                     → llm
 *   2. Goal reworded since record   → llm (re-derive & re-record)
 *   3. Heal rate over threshold     → llm (persistent drift)
 *   4. Exact build-hash match       → replay
 *   5. Otherwise                    → replay-with-heal (default; build differs/unknown)
 */
export function decideReplayTier(input: TierDecisionInput): TierDecision {
    const { trace, currentGoal, currentBuildHash, healRate } = input;
    const threshold = input.healRateThreshold ?? DEFAULT_HEAL_RATE_DEMOTE_THRESHOLD;

    if (!trace) {
        return { tier: 'llm', reason: 'no recorded trace for this test' };
    }
    if (!goalMatchesTrace(trace, currentGoal)) {
        return { tier: 'llm', reason: 'goal text changed since record — re-derive and re-record' };
    }
    if (healRate !== undefined && healRate >= threshold) {
        return {
            tier: 'llm',
            reason: `heal rate ${(healRate * 100).toFixed(0)}% ≥ ${(threshold * 100).toFixed(0)}% — UI drifted past the cache; re-record`,
        };
    }

    const recordedBuild = trace.AppBuildHash?.trim();
    const liveBuild = currentBuildHash?.trim();
    if (recordedBuild && liveBuild && recordedBuild === liveBuild) {
        return { tier: 'replay', reason: 'exact build match — deterministic replay, no heal expected' };
    }

    return {
        tier: 'replay-with-heal',
        reason: liveBuild || recordedBuild
            ? 'build identity differs from record — replay with heal expected'
            : 'build identity unavailable — replay with heal expected (default)',
    };
}

// ─── Drift Diff ────────────────────────────────────────

/** Classification of how one step's fresh derivation differs from the recording. */
export type TraceStepDiffKind =
    | 'match'           // identical (semantically) — no drift
    | 'selector-drift'  // same role+name, different selector — minor, heals
    | 'target-changed'  // role or name changed — meaningful UI change
    | 'method-changed'  // the action verb changed — meaningful
    | 'url-changed';    // the step's entry URL changed — meaningful

export interface TraceStepDiff {
    index: number;
    kind: TraceStepDiffKind;
    detail: string;
}

export interface TraceDiff {
    /** True when the fresh derivation matches the recording step-for-step (no drift). */
    identical: boolean;
    /** Steps the fresh derivation ADDED beyond the recording's length. */
    addedSteps: number;
    /** Steps the recording had that the fresh derivation dropped. */
    removedSteps: number;
    /** Per-step differences (only non-`match` steps). */
    changedSteps: TraceStepDiff[];
    /** Count of MEANINGFUL drift (excludes minor selector-drift). */
    meaningfulDrift: number;
    /** Human-readable one-line summary for the drift report. */
    summary: string;
}

/**
 * Compare a stored trace against a freshly-derived one (both for the same test).
 * Steps are compared positionally; length differences surface as added/removed.
 */
export function diffTraces(recorded: ComputerUseTrace, fresh: ComputerUseTrace): TraceDiff {
    const recSteps = recorded.Steps;
    const freshSteps = fresh.Steps;
    const common = Math.min(recSteps.length, freshSteps.length);

    const changedSteps: TraceStepDiff[] = [];
    for (let i = 0; i < common; i++) {
        const diff = diffStep(i, recSteps[i], freshSteps[i]);
        if (diff.kind !== 'match') {
            changedSteps.push(diff);
        }
    }

    const addedSteps = Math.max(0, freshSteps.length - recSteps.length);
    const removedSteps = Math.max(0, recSteps.length - freshSteps.length);
    const meaningfulDrift =
        changedSteps.filter(d => d.kind !== 'selector-drift').length + addedSteps + removedSteps;
    const identical = changedSteps.length === 0 && addedSteps === 0 && removedSteps === 0;

    return {
        identical,
        addedSteps,
        removedSteps,
        changedSteps,
        meaningfulDrift,
        summary: buildSummary(identical, meaningfulDrift, changedSteps, addedSteps, removedSteps),
    };
}

// ─── Internals ─────────────────────────────────────────────

function diffStep(index: number, rec: TraceStep, fresh: TraceStep): TraceStepDiff {
    if (rec.Action.Method !== fresh.Action.Method) {
        return { index, kind: 'method-changed', detail: `method ${rec.Action.Method} → ${fresh.Action.Method}` };
    }
    if (rec.UrlBefore !== fresh.UrlBefore) {
        return { index, kind: 'url-changed', detail: `entry URL ${rec.UrlBefore || '(none)'} → ${fresh.UrlBefore || '(none)'}` };
    }
    const targetDiff = diffTarget(rec.Action.Target, fresh.Action.Target);
    if (targetDiff) {
        return { index, ...targetDiff };
    }
    return { index, kind: 'match', detail: 'match' };
}

function diffTarget(
    rec: TraceTarget | undefined,
    fresh: TraceTarget | undefined
): { kind: TraceStepDiffKind; detail: string } | null {
    const recRole = norm(rec?.Role);
    const freshRole = norm(fresh?.Role);
    const recName = norm(rec?.Name);
    const freshName = norm(fresh?.Name);

    if (recRole !== freshRole || recName !== freshName) {
        return { kind: 'target-changed', detail: `target "${recRole} ${recName}" → "${freshRole} ${freshName}"` };
    }
    // Same semantic target; a differing selector is minor, healable drift.
    if ((rec?.Selector ?? '') !== (fresh?.Selector ?? '')) {
        return { kind: 'selector-drift', detail: `selector ${rec?.Selector ?? '(none)'} → ${fresh?.Selector ?? '(none)'}` };
    }
    return null;
}

function norm(s: string | undefined): string {
    return (s ?? '').trim().toLowerCase();
}

function buildSummary(
    identical: boolean,
    meaningfulDrift: number,
    changedSteps: TraceStepDiff[],
    addedSteps: number,
    removedSteps: number
): string {
    if (identical) {
        return 'no drift — fresh derivation matches the recorded trace';
    }
    const parts: string[] = [];
    if (meaningfulDrift > 0) {
        parts.push(`${meaningfulDrift} meaningful drift`);
    }
    const selectorDrift = changedSteps.filter(d => d.kind === 'selector-drift').length;
    if (selectorDrift > 0) {
        parts.push(`${selectorDrift} selector-drift (healable)`);
    }
    if (addedSteps > 0) {
        parts.push(`${addedSteps} added step(s)`);
    }
    if (removedSteps > 0) {
        parts.push(`${removedSteps} removed step(s)`);
    }
    return parts.join(', ');
}
