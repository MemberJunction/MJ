/**
 * Post-run failure classification.
 *
 * Turns the signals the engine now emits — loop detection, settle-budget
 * exhaustion + hash stability, readiness beacon, browser
 * diagnostics, terminal status — plus the driver's oracle
 * results into a single machine-readable `failureClass`. The hand-built
 * 44-failure taxonomy becomes a `GROUP BY`, and the retry scheduler can key
 * policy on it (e.g. never retry `assertion`/`app-error`; retry `env-stall`
 * after a health gate; retry `stuck-page` once as a replay).
 *
 * Pure so the ordered decision list is unit-testable. The driver extracts the
 * signals (it has the ComputerUseResult + oracle results + AppProfile); this
 * function only decides.
 */

import type { ComputerUseStatus, ComputerUseFailureReason, BrowserDiagnosticEvent } from '@memberjunction/computer-use';

/** The failure taxonomy. `null` (not a member) is reserved for success. */
export type ComputerUseFailureClass =
    | 'infra'
    | 'auth-detour'
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
    /**
     * A SEVERE, likely-deterministic browser fault occurred — an uncaught page
     * exception or a genuine (non-aborted) request failure (see
     * {@link isSevereBrowserFault}). Deliberately NOT triggered by console errors
     * or navigation-aborted requests: a live SPA emits those constantly during
     * normal agent navigation, so keying the zero-retry `app-error` class on them
     * mislabeled flaky agent failures (loop/timeout) as deterministic app faults.
     */
    hasAppError: boolean;
    /** The settle loop gave up (`budget`) on the final step(s) — the page never settled. */
    settleBudgetExhausted: boolean;
    /** The last few frames were perceptually stable (stuck) vs. changing (progressing). */
    tailHashStable: boolean;
    /** The run declared a readiness beacon. */
    beaconConfigured: boolean;
    /** The beacon fired at least once during the run. */
    beaconEverReady: boolean;
    /** At least one gating oracle failed. */
    oraclesFailed: boolean;
}

/**
 * Regex matching the benign network-abort/cancel error texts Playwright reports
 * for requests cancelled by navigation (Chromium `net::ERR_ABORTED`, Firefox
 * `NS_BINDING_ABORTED`, the `ERR_CANCELED`/`ERR_CANCELLED` variants). These are
 * routine in an SPA the agent navigates heavily — not app faults.
 */
const BENIGN_ABORT_RE = /ERR_ABORTED|NS_BINDING_ABORTED|ERR_CANCELL?ED/i;

/**
 * Whether a browser diagnostic represents a SEVERE, likely-deterministic app
 * fault worth the zero-retry `app-error` class. TRUE for an uncaught page
 * exception (`pageerror`) or a genuine request failure; FALSE for console errors
 * (too noisy to imply a deterministic fault) and navigation-aborted requests
 * (routine SPA churn). `crash` is excluded — it's handled upstream as `infra`.
 */
export function isSevereBrowserFault(d: BrowserDiagnosticEvent): boolean {
    if (d.type === 'pageerror') {
        return true;
    }
    if (d.type === 'requestfailed') {
        return !BENIGN_ABORT_RE.test(d.message ?? '');
    }
    return false;
}

/**
 * Classify a finished run, or return `null` when it succeeded. Ordered decision
 * list — the FIRST match wins, so order encodes precedence.
 *
 * `infra` and `auth-detour` come first: a renderer crash / engine error, or an
 * auth detour, is the authoritative root cause. Then the engine's own EXPLICIT
 * terminal verdicts (`LoopDetected`, `Cancelled`, `Impossible`,
 * `TimeBudgetExceeded`) — these are deliberate conclusions and must outrank
 * `hasAppError`, which is only a passive observation that the app logged
 * something. (Previously `hasAppError` came 3rd and masked those verdicts as
 * `app-error`; because `app-error` gets ZERO retries, that turned flaky agent
 * loops/timeouts into hard failures and cratered the suite pass rate.)
 * `app-error` still outranks the softer symptom heuristics below it (a severe
 * app fault is a better explanation than "the page looked stuck" or "the judge
 * disagreed").
 */
export function classifyFailure(s: FailureSignals): ComputerUseFailureClass | null {
    if (s.status === 'Completed') {
        return null;
    }

    // 1. Infrastructure fault — a crashed renderer or an engine-level error.
    if (s.hasCrash || s.status === 'Error') {
        return 'infra';
    }
    // 2. Auth detour — the engine gave up after the session bounced to
    //    an identity provider past the watchdog's cap. This is the authoritative
    //    root cause, so it outranks the `app-error` its own 401/403s would
    //    otherwise register as: the failed auth requests are the symptom.
    if (s.failureReason === 'AuthDetour') {
        return 'auth-detour';
    }
    // 3. Engine-detected navigation loop — an explicit engine verdict, and a
    //    retryable (LLM-nondeterministic) one, so it must beat incidental app noise.
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
    // 7. Application error — a severe page exception / request failure with no
    //    more-specific engine verdict above. Still ranks above the soft symptom
    //    heuristics: it's the likelier root cause behind a stall or bad oracle.
    if (s.hasAppError) {
        return 'app-error';
    }
    // 8. Page never settled and the frame was frozen — a stuck page.
    if (s.settleBudgetExhausted && s.tailHashStable) {
        return 'stuck-page';
    }
    // 9. A declared beacon never fired and there were no app errors — the app/env
    //    just never became ready (module never loaded), distinct from "agent lost".
    if (s.beaconConfigured && !s.beaconEverReady) {
        return 'env-stall';
    }
    // 10. The engine itself terminated the run Failed (e.g. controller declared
    //    completion but the judge kept disagreeing).
    if (s.status === 'Failed') {
        return 'judge-disagreement';
    }
    // 11. The run finished but the oracles didn't pass — a plain assertion failure.
    if (s.oraclesFailed) {
        return 'assertion';
    }
    return 'unknown';
}
