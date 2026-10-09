/**
 * Reading a kit run back in a test: which checks passed, failed (with why) and were skipped, so an expectation shows a
 * driver's whole outcome in one diff.
 */
import { REALTIME_VIDEO_CONFORMANCE_CHECKS, type RealtimeVideoConformanceResult } from '../../testing';

/** A run's outcome: the ids that passed and were skipped, and each failure with its detail. */
export interface RunOutcome {
    Passed: string[];
    Failed: string[];
    Skipped: string[];
}

/** Groups a run's results by status; a failure reads `<id>: <detail>`. */
export function OutcomeOf(results: readonly RealtimeVideoConformanceResult[]): RunOutcome {
    return {
        Passed: results.filter((r) => r.Status === 'Passed').map((r) => r.Id),
        Failed: results.filter((r) => r.Status === 'Failed').map((r) => `${r.Id}: ${r.Detail ?? ''}`),
        Skipped: results.filter((r) => r.Status === 'Skipped').map((r) => r.Id),
    };
}

/** Every check id, VC01-VC15. */
export const ALL_CHECK_IDS: readonly string[] = REALTIME_VIDEO_CONFORMANCE_CHECKS.map((check) => check.Id);

/** The ids other than `ids`, in check order. */
export function AllBut(...ids: string[]): string[] {
    return ALL_CHECK_IDS.filter((id) => !ids.includes(id));
}
