/**
 * Step-summary compaction (CU-E4) — pure, no engine state.
 *
 * The controller step summary grew linearly and unboundedly (35 steps ×
 * reasoning + tool results), inflating per-step input cost and second-half
 * latency. This collapses the OLDER steps into a compact digest — per-path
 * visit counts + error count + step range — while the caller keeps the most
 * recent N steps verbatim. Bounded context regardless of run length; the
 * per-path counts also keep the loop-avoidance signal ("you've been on /x 4×")
 * alive after a step scrolls out of the verbatim window.
 *
 * Pure so the digest is unit-testable without a live run.
 */

import type { StepRecord } from '../types/judge.js';

/** Default number of most-recent steps kept verbatim; older ones are digested. */
export const DEFAULT_MAX_VERBATIM_STEPS = 8;

/** Path + query only (origin dropped), for compact per-path counting. */
function compactPath(url: string): string {
    if (!url) return '';
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}`;
    } catch {
        return url;
    }
}

/**
 * Collapse a run of older steps into a one-line digest: the step-number range,
 * per-path visit counts (paths visited more than once are marked `×N`, which
 * preserves the loop signal), and an error count. Returns '' for an empty input.
 */
export function summarizeOlderSteps(steps: StepRecord[]): string {
    if (steps.length === 0) {
        return '';
    }
    const pathCounts = new Map<string, number>();
    let errorCount = 0;
    for (const step of steps) {
        const path = compactPath(step.UrlAfter || step.Url);
        if (path) {
            pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
        }
        if (step.Error) {
            errorCount++;
        }
    }
    const paths = [...pathCounts.entries()]
        .map(([p, n]) => (n > 1 ? `${p} (×${n})` : p))
        .join(', ');
    const first = steps[0].StepNumber;
    const last = steps[steps.length - 1].StepNumber;
    const errNote = errorCount > 0 ? `; ${errorCount} error(s)` : '';
    const pathNote = paths ? `visited ${paths}` : 'no navigation';
    return `Steps ${first}–${last} (summarized): ${pathNote}${errNote}`;
}
