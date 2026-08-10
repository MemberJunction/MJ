/**
 * Guards on the `Impossible` verdict, which otherwise ends a run on a single
 * sample from a non-deterministic judge: never accept it while the page is still
 * loading (a boot screen is not evidence of impossibility), and require a quorum
 * of concurring verdicts across ≥2 steps.
 *
 * Pure — the engine owns the running count and acts on the decision.
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
