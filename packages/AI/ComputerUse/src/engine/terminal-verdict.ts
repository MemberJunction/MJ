/**
 * Terminal-verdict guards (CU-D6) — pure decisions, no engine state.
 *
 * `Impossible` ends a run and decides pass/fail on a single sample from a
 * temp-0-but-not-deterministic judge — and the literature documents GPT-4
 * wrongly declaring 54.9% of *feasible* tasks impossible under an
 * unachievability hint. Two guards cut that class: (1) never accept Impossible
 * while the page is still loading (a boot screen is not evidence of
 * impossibility), and (2) require a quorum of concurring Impossible verdicts
 * across ≥2 steps before ending the run.
 *
 * Pure so the counting + suppression logic is unit-testable; the engine owns
 * the running count and acts on the decision.
 *
 * NOTE: the confirm-Done leg of CU-D6 is deferred — its "free" form is a
 * deterministic postcondition/oracle (CU-D2/C5, driver-side, not yet landed),
 * and the engine-only fallback (a confirming second judge next step) collides
 * with the CU-G5 "skip judge when state unchanged" gate. This module covers the
 * Impossible guards, the documented high-value half.
 */

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
 * Gate an Impossible verdict (CU-D6). `priorCount` is how many concurring
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
