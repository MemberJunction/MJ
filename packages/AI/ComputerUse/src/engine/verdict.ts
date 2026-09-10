/**
 * Scoring a run: deterministic postcondition and prelude-landing checks, sticky
 * checkpoint-tour latches, the cross-attempt judge-verdict cache, guards on the
 * `Impossible` verdict, and the failure memo a non-blind retry consumes.
 *
 * Pure — the engine supplies observed facts and owns the running counters.
 */

import { GoalPostcondition, TraceTarget } from '../types/trace.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import { RunCheckpoint } from '../types/params.js';
import type { CriterionVerdict } from '../judge/rubric.js';
import { InteractiveElement } from '../types/browser.js';
import { normalizeTraceUrl, traceUrlMatches } from './trace.js';

// ─── Goal Postconditions & Prelude Landing ─────────────

/** Cap on distilled landmark postconditions — a few stable anchors, not the whole page. */
const MAX_LANDMARK_POSTCONDITIONS = 3;

export interface DistillOptions {
    /** The passing run's final step (source of the end-state element list). */
    finalStep?: StepRecord;
    /** The final URL (defaults to the final step's UrlAfter). */
    finalUrl?: string;
    /** The passing judge verdict (reserved for rubric-evidence enrichment). */
    finalVerdict?: JudgeVerdict;
    /** App-specific volatile query params to strip from the recorded URL. */
    volatileParams?: string[];
}

/**
 * Distill a passing run's end-state into deterministic goal postconditions:
 * one URL postcondition (final normalized URL) + up to {@link
 * MAX_LANDMARK_POSTCONDITIONS} `visible` postconditions for the end-state's
 * landmark headings (role/name presence). Returns [] when there's nothing to
 * distill.
 */
export function distillGoalPostconditions(options: DistillOptions): GoalPostcondition[] {
    const posts: GoalPostcondition[] = [];
    const volatile = options.volatileParams ?? [];

    const url = normalizeTraceUrl(options.finalUrl ?? options.finalStep?.UrlAfter ?? options.finalStep?.Url ?? '', volatile);
    if (url) {
        const p = new GoalPostcondition();
        p.Kind = 'url';
        p.UrlPattern = url;
        p.Description = 'final URL of the passing run';
        posts.push(p);
    }

    const elements = options.finalStep?.InteractiveElements ?? [];
    const headings = elements.filter(e => (e.Role ?? '').trim().toLowerCase() === 'heading' && (e.Name ?? '').trim());
    for (const h of headings.slice(0, MAX_LANDMARK_POSTCONDITIONS)) {
        const p = new GoalPostcondition();
        p.Kind = 'visible';
        const t = new TraceTarget();
        t.Role = h.Role;
        t.Name = h.Name;
        t.Selector = h.Selector || undefined;
        p.Target = t;
        p.Description = 'landmark heading present in the passing end-state';
        posts.push(p);
    }
    return posts;
}

export interface GoalPostconditionResult {
    post: GoalPostcondition;
    met: boolean;
    detail: string;
}

/**
 * Execute distilled goal postconditions against an observed end-state (URL +
 * interactive-element list). Pure — the engine supplies the observed facts.
 */
export function executeGoalPostconditions(
    posts: GoalPostcondition[],
    observed: { url: string; elements: InteractiveElement[]; volatileParams?: string[] }
): { passed: boolean; results: GoalPostconditionResult[] } {
    const volatile = observed.volatileParams ?? [];
    const results = posts.map(post => evaluateOne(post, observed.url, observed.elements, volatile));
    return { passed: results.every(r => r.met), results };
}

function evaluateOne(
    post: GoalPostcondition,
    url: string,
    elements: InteractiveElement[],
    volatile: string[]
): GoalPostconditionResult {
    if (post.Kind === 'url') {
        const met = post.UrlPattern ? traceUrlMatches(post.UrlPattern, url, volatile) : true;
        return { post, met, detail: met ? 'URL matched' : `URL did not match ${post.UrlPattern}` };
    }
    const present = post.Target ? elementPresent(post.Target, elements) : false;
    if (post.Kind === 'visible') {
        return { post, met: present, detail: present ? 'element present' : 'expected element not present' };
    }
    // 'absent'
    return { post, met: !present, detail: present ? 'element unexpectedly present' : 'element absent as expected' };
}

/** Presence by role (exact) + name (substring) — robust to minor label drift. */
function elementPresent(target: TraceTarget, elements: InteractiveElement[]): boolean {
    const role = target.Role?.trim().toLowerCase();
    const name = target.Name?.trim().toLowerCase();
    if (!role && !name) {
        return false;
    }
    return elements.some(e =>
        (!role || (e.Role ?? '').trim().toLowerCase() === role) &&
        (!name || (e.Name ?? '').trim().toLowerCase().includes(name))
    );
}

/** What the engine observed about where a deterministic prelude landed. */
export interface PreludeLandingObserved {
    /** Whether a landing selector was declared. */
    hasSelector: boolean;
    /** Whether that selector became visible after the prelude. */
    selectorVisible: boolean;
    /** Whether a landing URL pattern was declared. */
    hasUrl: boolean;
    /** Whether the post-prelude URL matched that pattern. */
    urlMatched: boolean;
}

/**
 * Whether a prelude reached its declared landing. Declaring nothing trivially
 * lands — the prelude was fire-and-forget setup with no assertion.
 */
export function evaluatePreludeLanding(o: PreludeLandingObserved): { landed: boolean; reason: string } {
    if (o.hasSelector && !o.selectorVisible) {
        return { landed: false, reason: 'expected landing element not visible after prelude' };
    }
    if (o.hasUrl && !o.urlMatched) {
        return { landed: false, reason: 'landed on an unexpected URL after prelude' };
    }
    return { landed: true, reason: 'prelude landed as expected' };
}

// ─── Checkpoint Tours ──────────────────────────────────

/** Sticky per-checkpoint latch state accumulated across a run. */
export interface CheckpointLatch {
    /** The checkpoint's {@link RunCheckpoint.Name}. */
    name: string;
    /** All declared deterministic assertions have passed (true when none declared). */
    assertionsMet: boolean;
    /** All declared visual criteria have been judged met (true when none declared). */
    visualMet: boolean;
    /** `assertionsMet && visualMet` — the checkpoint is fully satisfied. */
    met: boolean;
    /** Evidence accumulated as sub-conditions latched (for triage / the final reason). */
    evidence: string;
    /** Step at which `met` first became true (0 while pending). */
    stepLatched: number;
}

/** Observed end-state facts for a deterministic latch pass. */
export interface CheckpointObservation {
    url: string;
    elements: InteractiveElement[];
    volatileParams?: string[];
}

/** Whether this run is a checkpoint tour (has ≥1 checkpoint). */
export function isCheckpointRun(checkpoints?: RunCheckpoint[]): checkpoints is RunCheckpoint[] {
    return Array.isArray(checkpoints) && checkpoints.length > 0;
}

function hasAssertions(cp: RunCheckpoint): boolean {
    return Array.isArray(cp.Assertions) && cp.Assertions.length > 0;
}

function hasVisual(cp: RunCheckpoint): boolean {
    return Array.isArray(cp.VisualCriteria) && cp.VisualCriteria.length > 0;
}

/**
 * Fetch (creating on first touch) the latch for a checkpoint. A checkpoint with
 * no declared checks of a kind starts with that sub-condition already satisfied;
 * one with no checks at all is vacuously met (a misconfig the engine warns about).
 */
function ensureLatch(cp: RunCheckpoint, latches: Map<string, CheckpointLatch>): CheckpointLatch {
    let latch = latches.get(cp.Name);
    if (!latch) {
        const assertionsMet = !hasAssertions(cp);
        const visualMet = !hasVisual(cp);
        latch = { name: cp.Name, assertionsMet, visualMet, met: assertionsMet && visualMet, evidence: '', stepLatched: 0 };
        latches.set(cp.Name, latch);
    }
    return latch;
}

function appendEvidence(existing: string, addition: string): string {
    const add = addition.trim();
    if (!add) return existing;
    return existing ? `${existing}; ${add}` : add;
}

/** Recompute `met` and stamp `stepLatched` on the transition to met. */
function finalize(latch: CheckpointLatch, stepNumber: number): void {
    const nowMet = latch.assertionsMet && latch.visualMet;
    if (nowMet && !latch.met) {
        latch.stepLatched = stepNumber;
    }
    latch.met = nowMet;
}

/**
 * Latch checkpoints whose deterministic assertions now hold, against an observed
 * state. Free (no LLM); call every step. Sticky — a satisfied sub-condition is
 * never re-evaluated. Mutates and returns `latches`.
 */
export function latchDeterministic(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>,
    observed: CheckpointObservation,
    stepNumber: number
): Map<string, CheckpointLatch> {
    for (const cp of checkpoints) {
        const latch = ensureLatch(cp, latches);
        if (latch.assertionsMet) continue; // already satisfied (or none declared)
        const { passed, results } = executeGoalPostconditions(cp.Assertions ?? [], observed);
        if (passed) {
            latch.assertionsMet = true;
            latch.evidence = appendEvidence(latch.evidence, results.map(r => r.detail).join('; '));
            finalize(latch, stepNumber);
        }
    }
    return latches;
}

/**
 * Latch checkpoints whose visual criteria are all reported met by a judge verdict
 * (keyed by criterion text). Call after each judge evaluation in checkpoint mode.
 * Mutates and returns `latches`.
 *
 * Scalar fallback: when the verdict carries NO per-criterion breakdown, the
 * verdict's `Done` decides. `LLMJudge.applyRubric` leaves `CriteriaVerdicts`
 * undefined whenever the model omits or malforms the `criteria` array — a real LLM
 * failure mode — and without this fallback a judge that plainly said "done" would
 * latch nothing and fail the tour. In checkpoint mode the judge is only ever asked
 * about the PENDING visual criteria, so `Done` is precisely an assertion that
 * those are met. This also matches the trust the scalar-rubric replay path already
 * places in `Done`; the per-criterion breakdown is still preferred when present.
 */
export function latchVisualFromVerdict(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>,
    verdict: JudgeVerdict,
    stepNumber: number
): Map<string, CheckpointLatch> {
    const byCriterion = new Map<string, CriterionVerdict>();
    for (const cv of verdict.CriteriaVerdicts ?? []) {
        byCriterion.set(cv.criterion, cv);
    }
    const scalarOnly = byCriterion.size === 0;
    for (const cp of checkpoints) {
        const latch = ensureLatch(cp, latches);
        if (latch.visualMet) continue; // already satisfied (or none declared)
        const criteria = cp.VisualCriteria ?? [];
        const allMet = scalarOnly
            ? verdict.Done === true
            : criteria.every(c => byCriterion.get(c)?.met === true);
        if (allMet) {
            latch.visualMet = true;
            const ev = scalarOnly
                ? (verdict.Reason || 'confirmed by the judge (no per-criterion breakdown)')
                : criteria.map(c => byCriterion.get(c)?.evidence ?? '').filter(Boolean).join('; ');
            latch.evidence = appendEvidence(latch.evidence, ev);
            finalize(latch, stepNumber);
        }
    }
    return latches;
}

/**
 * The union of visual criteria for checkpoints whose visual sub-condition is not
 * yet latched — what the judge should evaluate next in checkpoint mode. Empty
 * when every remaining checkpoint is deterministic-only (⇒ skip the judge).
 */
export function unlatchedVisualCriteria(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>
): string[] {
    const out: string[] = [];
    for (const cp of checkpoints) {
        if (!hasVisual(cp)) continue;
        if (ensureLatch(cp, latches).visualMet) continue;
        for (const c of cp.VisualCriteria ?? []) {
            if (!out.includes(c)) out.push(c);
        }
    }
    return out;
}

/** Find a checkpoint by name (case-insensitive, trimmed) — tolerant of LLM casing drift. */
export function findCheckpoint(checkpoints: RunCheckpoint[], name: string): RunCheckpoint | undefined {
    const key = name.trim().toLowerCase();
    return checkpoints.find(cp => cp.Name.trim().toLowerCase() === key);
}

/**
 * The not-yet-latched visual criteria for a SINGLE named checkpoint (Phase
 * B) — what a controller-signaled judge call should evaluate, scoped to that
 * section so it can't cross-contaminate other sections' criteria. Empty when the
 * name is unknown, the checkpoint has no visual criteria, or they're already latched.
 */
export function checkpointVisualCriteria(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>,
    name: string
): string[] {
    const cp = findCheckpoint(checkpoints, name);
    if (!cp || !hasVisual(cp)) {
        return [];
    }
    if (latches.get(cp.Name)?.visualMet) {
        return [];
    }
    return [...(cp.VisualCriteria ?? [])];
}

/** True iff every checkpoint is fully met. */
export function allCheckpointsMet(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>
): boolean {
    return checkpoints.every(cp => ensureLatch(cp, latches).met);
}

/**
 * How many checkpoints are fully met. The engine samples this before and after
 * each step's latch pass: an increase is TOUR progress, which is the only
 * progress signal a tour has. Pixel-level change is not — a tour section
 * can latch while the frame looks identical (a tree expanding inside a narrow
 * panel, a chip toggling), and returning to a prior state is often *required*
 * (open→cancel, A→B→A). See the loop-reset in the engine's main loop.
 */
export function countMetCheckpoints(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>
): number {
    return checkpoints.filter(cp => ensureLatch(cp, latches).met).length;
}

/**
 * Synthesize the run's final {@link JudgeVerdict} from the latch state — one
 * per-criterion verdict per checkpoint, `Done` = all met, `Confidence` = coverage.
 * This rides the existing verdict → `FinalJudgeVerdict` → `GoalCompletionOracle`
 * path with no oracle change.
 */
export function synthesizeCheckpointVerdict(
    checkpoints: RunCheckpoint[],
    latches: Map<string, CheckpointLatch>
): JudgeVerdict {
    const criteria: CriterionVerdict[] = checkpoints.map(cp => {
        const latch = ensureLatch(cp, latches);
        return {
            criterion: cp.Instruction?.trim() || cp.Name,
            met: latch.met,
            evidence: latch.evidence || (latch.met ? 'reached' : 'not reached'),
        };
    });
    const metCount = criteria.filter(c => c.met).length;
    const total = criteria.length;
    const unmet = criteria.filter(c => !c.met).map(c => c.criterion);

    const verdict = new JudgeVerdict();
    verdict.Done = total > 0 && metCount === total;
    verdict.Confidence = total > 0 ? metCount / total : 0;
    verdict.CriteriaVerdicts = criteria;
    verdict.Reason = `${metCount}/${total} checkpoints reached` + (unmet.length ? `; unmet: ${unmet.join(', ')}` : '');
    verdict.Feedback = unmet.length ? `Not yet reached: ${unmet.join(', ')}` : '';
    return verdict;
}

// ─── Judge-Verdict Cache ───────────────────────────────

/** Build a stable cache key from the goal hash, current URL, and state hash. */
export function makeJudgeCacheKey(
    goalHash: string,
    url: string,
    stateHash: string,
    volatileParams: string[] = []
): string {
    return `${goalHash}|${normalizeTraceUrl(url, volatileParams)}|${stateHash}`;
}

/** An in-memory verdict cache keyed by {@link makeJudgeCacheKey}. */
export class JudgeVerdictCache {
    private store = new Map<string, JudgeVerdict>();

    public get(key: string): JudgeVerdict | undefined {
        return this.store.get(key);
    }
    public set(key: string, verdict: JudgeVerdict): void {
        this.store.set(key, verdict);
    }
    public has(key: string): boolean {
        return this.store.has(key);
    }
    public get size(): number {
        return this.store.size;
    }
    public clear(): void {
        this.store.clear();
    }
}

// ─── Terminal-Verdict Guards ───────────────────────────

/** Default number of concurring Impossible verdicts required to end a run. */
export const DEFAULT_IMPOSSIBLE_QUORUM = 2;

/** The outcome of gating an Impossible verdict. */
export interface ImpossibleGateResult {
    /** End the run as Impossible now (quorum reached). */
    accept: boolean;
    /** The running concurring-Impossible count to carry into the next step. */
    newCount: number;
    /** The verdict was withheld because the page was still loading. */
    suppressed: boolean;
}

/**
 * Gate an Impossible verdict. `priorCount` is how many concurring
 * Impossible verdicts have accumulated on prior steps; the caller carries the
 * returned `newCount` forward. A non-Impossible verdict resets the count. While
 * the page is loading the verdict is suppressed and the count is held (not
 * incremented, not reset) — a boot screen shouldn't build toward *or* clear the
 * quorum.
 */
export function gateImpossibleVerdict(params: {
    impossible: boolean;
    pageLoading: boolean;
    priorCount: number;
    quorum: number;
}): ImpossibleGateResult {
    if (!params.impossible) {
        return { accept: false, newCount: 0, suppressed: false };
    }
    if (params.pageLoading) {
        return { accept: false, newCount: params.priorCount, suppressed: true };
    }
    const newCount = params.priorCount + 1;
    return { accept: newCount >= params.quorum, newCount, suppressed: false };
}

// ─── Failure Memo ──────────────────────────────────────

/** The facts a failure memo is distilled from — supplied by the engine at terminal. */
export interface FailureMemoInput {
    /** Terminal status (e.g. 'MaxStepsReached', 'Failed', 'Impossible', 'TimeBudgetExceeded'). */
    status: string;
    /** Machine failure reason when known (e.g. 'LoopDetected', 'AuthDetour'). */
    failureReason?: string;
    /** URL the run ended on. */
    finalUrl?: string;
    /** The last few distinct URLs visited (most recent last). */
    recentUrls?: string[];
    /** The final judge verdict's reason, when judged. */
    judgeReason?: string;
    /** The final judge verdict's actionable feedback, when any. */
    judgeFeedback?: string;
    /** Engine loop evidence (repeated states) — approaches to avoid on retry. */
    loopEvidence?: string;
}

/** Default cap so the memo stays within the next attempt's prompt budget. */
export const DEFAULT_FAILURE_MEMO_MAX_CHARS = 500;

/**
 * Build a compact, structured memo of why an attempt failed. Returns '' when
 * there is nothing useful to say (e.g. a clean pass — callers only emit it on
 * non-passing terminals). Always bounded to `maxChars`.
 */
export function buildFailureMemo(input: FailureMemoInput, maxChars: number = DEFAULT_FAILURE_MEMO_MAX_CHARS): string {
    const parts: string[] = [];

    const reason = input.failureReason ? `${input.status} (${input.failureReason})` : input.status;
    parts.push(`Previous attempt ended: ${reason}.`);

    const path = shortUrl(input.finalUrl);
    if (path) {
        parts.push(`Ended on ${path}.`);
    }
    if (input.judgeReason?.trim()) {
        parts.push(`Judge: ${input.judgeReason.trim()}`);
    }
    if (input.judgeFeedback?.trim() && input.judgeFeedback.trim() !== input.judgeReason?.trim()) {
        parts.push(`Feedback: ${input.judgeFeedback.trim()}`);
    }
    if (input.loopEvidence?.trim()) {
        parts.push(`Avoid repeating: ${input.loopEvidence.trim()}`);
    }
    const trail = dedupeTrail(input.recentUrls, input.finalUrl);
    if (trail) {
        parts.push(`Recent path: ${trail}.`);
    }

    return truncate(parts.join(' '), maxChars);
}

// ─── Internals ─────────────────────────────────────────────

/** Path + query of a URL (origin dropped for brevity); '' on empty/unparseable. */
function shortUrl(url: string | undefined): string {
    if (!url) {
        return '';
    }
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}`;
    } catch {
        return url;
    }
}

/** A compact "a → b → c" trail of the recent distinct paths (excludes the final, already stated). */
function dedupeTrail(urls: string[] | undefined, finalUrl: string | undefined): string {
    if (!urls || urls.length === 0) {
        return '';
    }
    const finalPath = shortUrl(finalUrl);
    const paths: string[] = [];
    for (const u of urls) {
        const p = shortUrl(u);
        if (p && p !== finalPath && paths[paths.length - 1] !== p) {
            paths.push(p);
        }
    }
    return paths.slice(-4).join(' → ');
}

function truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }
    return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}
