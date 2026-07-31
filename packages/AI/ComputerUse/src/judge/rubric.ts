/**
 * Rubric-based judging (CU-D1) — pure, no LLM.
 *
 * Every regression test carries a hand-authored 3–5 item validation-criteria
 * rubric that the judge never saw — so it free-associated against a one-line
 * goal and emitted an uncalibrated confidence float that gated pass/fail at a
 * cliff. Passing the rubric to the judge and requiring a binary per-criterion
 * verdict (`{criterion, met, evidence}`) is far more stable than a scalar
 * (browser-use: "absolute True/False verdicts work best; complex rubrics lead
 * to indecisive judging"). `done = all(met)`, and the coverage doubles as a
 * calibrated confidence — so the cliff disappears.
 *
 * Pure so the done/coverage derivation is unit-testable without a judge call.
 */

/** One criterion's binary verdict from the judge, with its supporting evidence. */
export interface CriterionVerdict {
    /** The criterion text (echoed back from the rubric). */
    criterion: string;
    /** Whether this criterion is satisfied by the observed end-state. */
    met: boolean;
    /** The judge's evidence for the decision (feeds triage + CU-C5 distillation). */
    evidence: string;
}

/** Aggregate of a rubric evaluation. */
export interface RubricEvaluation {
    /** True iff every criterion is met — the binary Done signal. */
    done: boolean;
    /** Fraction of criteria met (0..1) — a calibrated confidence / score. */
    coverage: number;
    /** How many criteria were met. */
    metCount: number;
    /** Total number of criteria. */
    total: number;
    /** The criterion texts that were NOT met (for the feedback/reason string). */
    unmet: string[];
}

/**
 * Derive the Done/coverage signals from per-criterion verdicts (CU-D1).
 * `done` requires ALL criteria met; `coverage` is metCount/total. An empty
 * rubric returns `{done:false, coverage:0, total:0}` so the caller knows there
 * was no rubric and can fall back to the judge's scalar verdict.
 */
export function evaluateRubric(criteria: CriterionVerdict[]): RubricEvaluation {
    const total = criteria.length;
    if (total === 0) {
        return { done: false, coverage: 0, metCount: 0, total: 0, unmet: [] };
    }
    const metCount = criteria.filter(c => c.met).length;
    const unmet = criteria.filter(c => !c.met).map(c => c.criterion);
    return {
        done: metCount === total,
        coverage: metCount / total,
        metCount,
        total,
        unmet,
    };
}
