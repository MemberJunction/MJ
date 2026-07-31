/**
 * Deterministic-prelude landing evaluation (CU-C6).
 *
 * A prelude is scripted navigation run before the agentic loop; the plan
 * requires it still VERIFY it landed where intended ("a one-line precondition").
 * This is the pure decision from observed facts; the engine executes the actions
 * and supplies the observations. App-agnostic.
 */

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
 * Whether the prelude reached its declared landing. When nothing was declared
 * (no selector, no URL pattern) it trivially "landed" — the prelude was
 * fire-and-forget setup with no assertion.
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
