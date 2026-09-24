/**
 * Rubric-based judging — pure, no LLM.
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
    criterion: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Whether this criterion is satisfied by the observed end-state. */
    met: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
 /** The judge's evidence for the decision (feeds triage + distillation). */
    evidence: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** Aggregate of a rubric evaluation. */
export interface RubricEvaluation {
    /** True iff every criterion is met — the binary Done signal. */
    done: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Fraction of criteria met (0..1) — a calibrated confidence / score. */
    Coverage: number;
    /** How many criteria were met. */
    MetCount: number;
    /** Total number of criteria. */
    Total: number;
    /** The criterion texts that were NOT met (for the feedback/reason string). */
    Unmet: string[];
}

/**
 * Derive the Done/coverage signals from per-criterion verdicts.
 * `done` requires ALL criteria met; `coverage` is metCount/total. An empty
 * rubric returns `{done:false, coverage:0, total:0}` so the caller knows there
 * was no rubric and can fall back to the judge's scalar verdict.
 */
export function EvaluateRubric(criteria: CriterionVerdict[]): RubricEvaluation {
    const total = criteria.length;
    if (total === 0) {
        return { done: false, Coverage: 0, MetCount: 0, Total: 0, Unmet: [] };
    }
    const metCount = criteria.filter(c => c.met).length;
    const unmet = criteria.filter(c => !c.met).map(c => c.criterion);
    return {
        done: metCount === total,
        Coverage: metCount / total,
        MetCount: metCount,
        Total: total,
        Unmet: unmet,
    };
}

/** @deprecated Use {@link EvaluateRubric}. */
export function evaluateRubric(criteria: CriterionVerdict[]): RubricEvaluation {
 return EvaluateRubric(criteria);
}
