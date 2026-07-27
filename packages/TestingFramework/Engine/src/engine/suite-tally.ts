import type { TestRunResult } from '../types';

/** The counts a suite run is judged by. */
export interface SuiteTally {
    totalTests: number;
    passedTests: number;
    /**
     * THE GATE VALUE: everything that is neither a pass nor a deliberate skip. Equals
     * `assertionFailures + errorTests`, so it deliberately OVERLAPS both — it answers
     * "should this build go red?", not "which bucket does this test belong in".
     */
    failedTests: number;
    /**
     * DISJOINT BUCKET: asserted and was wrong (`Failed`). Pairs with {@link errorTests} and maps
     * to `MJTestSuiteRun.FailedTests`, whose column description is "failed at least one check".
     */
    assertionFailures: number;
    /**
     * DISJOINT BUCKET: never produced a verdict at all (`Error` / `Timeout`). Maps to
     * `MJTestSuiteRun.ErrorTests`. Separate from an assertion failure because the distinction is
     * "the product is broken" versus "the harness could not run".
     */
    errorTests: number;
    skippedTests: number;
    /** Tests that actually produced a verdict (total minus skips) — the pass-rate denominator. */
    executedTests: number;
    /** Mean score over executed tests only; 0 when nothing executed. */
    averageScore: number;
}

/**
 * The single definition of how a suite run is scored.
 *
 * `failedTests` is deliberately computed by SUBTRACTION (`total - passed - skipped`) rather than
 * by counting `status === 'Failed'`. The status union also carries `'Error'` (the bundle threw
 * before producing a verdict) and `'Timeout'` (a check hung past its budget). Counting only
 * `'Failed'` makes both invisible, and since `mj test suite` exits non-zero iff `failedTests > 0`,
 * an entire suite of errored tests exits 0 and reports green. Subtraction is failure-closed: a new
 * status added to the union lands in `failedTests` until someone deliberately decides otherwise,
 * which is the safe direction for a CI gate.
 *
 * Skips are excluded from BOTH sides of the score ratio. Averaging a skip in as 0 would understate
 * the tests that ran; as 1 it would manufacture a pass out of something that never executed.
 *
 * Two failure views are returned on purpose, and mixing them up double-counts:
 *   - `failedTests` is the GATE (overlapping: assertionFailures + errorTests).
 *   - `assertionFailures` / `errorTests` PARTITION the failures for persistence and display.
 * `passedTests + assertionFailures + errorTests + skippedTests === totalTests` always holds, which
 * is what lets the Explorer suite-run tiles (Passed | Failed | Errors | Skipped | Total) reconcile.
 */
export function summarizeSuiteResults(testResults: TestRunResult[]): SuiteTally {
    const totalTests = testResults.length;
    const passedTests = testResults.filter(r => r.status === 'Passed').length;
    const skippedTests = testResults.filter(r => r.status === 'Skipped').length;
    const failedTests = totalTests - passedTests - skippedTests;
    const errorTests = testResults.filter(r => r.status === 'Error' || r.status === 'Timeout').length;
    // By subtraction, not by counting 'Failed', so the two buckets always sum to failedTests even
    // if a future status lands in neither — the leftover surfaces as an assertion failure (red)
    // rather than vanishing from the breakdown.
    const assertionFailures = failedTests - errorTests;

    const scored = testResults.filter(r => r.status !== 'Skipped');
    const averageScore = scored.length > 0
        ? scored.reduce((sum, r) => sum + r.score, 0) / scored.length
        : 0;

    return {
        totalTests, passedTests, failedTests, assertionFailures, errorTests, skippedTests,
        executedTests: scored.length, averageScore
    };
}
