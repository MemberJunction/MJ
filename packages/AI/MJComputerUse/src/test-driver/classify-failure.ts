/**
 * Post-run failure classification (CU-F5).
 *
 * Turns the signals the engine now emits — loop detection (CU-B1), settle-budget
 * exhaustion + hash stability (CU-A1), readiness beacon (CU-A2), browser
 * diagnostics (CU-A7), terminal status (CU-B4/D4) — plus the driver's oracle
 * results into a single machine-readable `failureClass`. The hand-built
 * 44-failure taxonomy becomes a `GROUP BY`, and the retry scheduler can key
 * policy on it (e.g. never retry `assertion`/`app-error`; retry `env-stall`
 * after a health gate; retry `stuck-page` once as a replay).
 *
 * Pure so the ordered decision list is unit-testable. The driver extracts the
 * signals (it has the ComputerUseResult + oracle results + AppProfile); this
 * function only decides.
 */

import type { ComputerUseStatus, ComputerUseFailureReason } from '@memberjunction/computer-use';

/** The failure taxonomy. `null` (not a member) is reserved for success. */
export type ComputerUseFailureClass =
    | 'infra'
    | 'app-error'
    | 'loop-detected'
    | 'cancelled'
    | 'impossible'
    | 'timeout-stuck'
    | 'timeout-progressing'
    | 'stuck-page'
    | 'env-stall'
    | 'judge-disagreement'
    | 'assertion'
    | 'unknown';

/** Signals extracted from a finished run, consumed by {@link classifyFailure}. */
export interface FailureSignals {
    /** Engine terminal status. */
    status: ComputerUseStatus;
    /** Engine-named failure reason, when set (e.g. 'LoopDetected'). */
    failureReason?: ComputerUseFailureReason;
    /** A page-crash diagnostic occurred. */
    hasCrash: boolean;
    /** Any signal-bearing browser diagnostic occurred (console error / pageerror / failed request). */
    hasAppError: boolean;
    /** The settle loop gave up (`budget`) on the final step(s) — the page never settled. */
    settleBudgetExhausted: boolean;
    /** The last few frames were perceptually stable (stuck) vs. changing (progressing). */
    tailHashStable: boolean;
    /** The run declared a readiness beacon (CU-A2). */
    beaconConfigured: boolean;
    /** The beacon fired at least once during the run. */
    beaconEverReady: boolean;
    /** At least one gating oracle failed. */
    oraclesFailed: boolean;
}

/**
 * Classify a finished run, or return `null` when it succeeded. Ordered decision
 * list — the FIRST match wins, so order encodes precedence. `infra` and
 * `app-error` come first deliberately: an app/infrastructure fault that happens
 * to also look like a loop or a stall should be reported as the fault, not the
 * symptom (the CU-F5 risk note: "app-error first").
 */
export function classifyFailure(s: FailureSignals): ComputerUseFailureClass | null {
    if (s.status === 'Completed') {
        return null;
    }

    // 1. Infrastructure fault — a crashed renderer or an engine-level error.
    if (s.hasCrash || s.status === 'Error') {
        return 'infra';
    }
    // 2. Application error — console errors / failed requests / page errors.
    //    First among non-infra: it's the root cause behind many blank-page loops/stalls.
    if (s.hasAppError) {
        return 'app-error';
    }
    // 3. Engine-detected navigation loop.
    if (s.failureReason === 'LoopDetected') {
        return 'loop-detected';
    }
    // 4. Externally cancelled.
    if (s.status === 'Cancelled') {
        return 'cancelled';
    }
    // 5. Judge declared the goal impossible.
    if (s.status === 'Impossible') {
        return 'impossible';
    }
    // 6. Time budget expired — split by whether the page was still changing.
    if (s.status === 'TimeBudgetExceeded') {
        return s.tailHashStable ? 'timeout-stuck' : 'timeout-progressing';
    }
    // 7. Page never settled and the frame was frozen — a stuck page.
    if (s.settleBudgetExhausted && s.tailHashStable) {
        return 'stuck-page';
    }
    // 8. A declared beacon never fired and there were no app errors — the app/env
    //    just never became ready (module never loaded), distinct from "agent lost".
    if (s.beaconConfigured && !s.beaconEverReady) {
        return 'env-stall';
    }
    // 9. The engine itself terminated the run Failed (e.g. controller declared
    //    completion but the judge kept disagreeing — CU-B3).
    if (s.status === 'Failed') {
        return 'judge-disagreement';
    }
    // 10. The run finished but the oracles didn't pass — a plain assertion failure.
    if (s.oraclesFailed) {
        return 'assertion';
    }
    return 'unknown';
}
