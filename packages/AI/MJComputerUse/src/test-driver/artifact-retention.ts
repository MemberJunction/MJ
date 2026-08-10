/**
 * Failure-artifact retention policy — pure decisions, no I/O.
 *
 * A forensic trace (DOM snapshots + network + console) turns the "stuck/blank
 * page" and Auth0 investigations from hours of human log-mining into a 5-minute
 * trace-viewer session. But tracing carries ~5–15% per-run overhead, so it's
 * policy-gated: `off` (never), `retain-on-failure` (trace every run, keep the
 * artifact only when the test failed), or `on` (always keep). This module owns
 * the two decisions — whether to *capture* and whether to *retain* — so the
 * driver's I/O just executes them.
 */

/**
 * Trace/artifact retention policy.
 * - `off`               — don't trace at all (zero overhead). Default.
 * - `retain-on-failure` — trace every run; keep the artifact only on failure.
 * - `on`                — trace every run; always keep the artifact.
 */
export type ArtifactRetentionPolicy = 'off' | 'retain-on-failure' | 'on';

/**
 * Whether to capture (start) the artifact for a run. Both `retain-on-failure`
 * and `on` must capture during the run — you can't retain on failure without
 * having traced. Only `off` skips capture entirely.
 */
export function shouldCaptureArtifact(policy: ArtifactRetentionPolicy): boolean {
    return policy !== 'off';
}

/**
 * Whether to KEEP a captured artifact after the run, given the outcome.
 * `on` always keeps; `retain-on-failure` keeps only when the test did not pass;
 * `off` never keeps (it never captured). A kept artifact is emitted as a
 * TestRunOutput; an unkept one is deleted.
 */
export function shouldRetainArtifact(policy: ArtifactRetentionPolicy, passed: boolean): boolean {
    if (policy === 'on') {
        return true;
    }
    if (policy === 'retain-on-failure') {
        return !passed;
    }
    return false;
}
