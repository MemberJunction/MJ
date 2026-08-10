/**
 * Scores a "tour" test — an ordered list of {@link RunCheckpoint} sections the run
 * must pass through. A checkpoint is met when every deterministic assertion
 * (latched free each step) and every visual criterion (latched at a judge call)
 * passes.
 *
 * Latches are **sticky**: once a sub-condition holds it stays held even after the
 * agent navigates away, which is what lets one run verify section 1 and still be
 * scored on it at the end. The aggregate uses the existing {@link JudgeVerdict}
 * shape so `GoalCompletionOracle` needs no change.
 *
 * See `plans/regression-testing/checkpoint-tours-design.md`.
 */

import { RunCheckpoint } from '../types/params.js';
import { JudgeVerdict } from '../types/judge.js';
import type { CriterionVerdict } from '../judge/rubric.js';
import type { InteractiveElement } from '../types/browser.js';
import { executeGoalPostconditions } from './postcondition.js';

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
