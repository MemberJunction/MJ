/**
 * Whether a settle poll's signals mean "stop waiting, and for what reason".
 * Extracted from the effectful settle loop so the priority logic
 * (beacon > busy-markers-cleared+stable > stable/networkidle, all gated by the
 * floor) is testable without a browser.
 */

import type { SettleReason } from '../types/app-profile.js';

/** The observable signals for one settle poll. */
export interface SettlePollSignals {
    /** Whether the profile declared a readiness beacon at all. */
    beaconDeclared: boolean;
    /** Whether the declared beacon currently matches (page declares itself ready). */
    beaconPresent: boolean;
    /** Whether any busy marker is currently present-and-visible. */
    busy: boolean;
    /** Whether the last two frames are perceptually similar. */
    hashStable: boolean;
    /** Whether a busy marker has been seen busy at any earlier point this settle. */
    sawBusy: boolean;
    /** Whether the networkidle fast path resolved (vs. timed out). */
    networkIdle: boolean;
    /** Elapsed settle time so far, ms. */
    elapsedMs: number;
    /** Minimum settle time before we may declare ready, ms. */
    floorMs: number;
}

/**
 * Decide whether the settle loop can stop on this poll, and why.
 * Returns the {@link SettleReason} to exit with, or `null` to keep polling.
 *
 * Priority: the adaptive floor gates everything; a declared+present beacon wins
 * over heuristics; otherwise the page must be non-busy AND hash-stable, and the
 * reason distinguishes "markers cleared" (we saw it busy, then it settled) from
 * a plain "stable"/"networkidle" quiescence.
 */
export function resolveSettleExit(s: SettlePollSignals): SettleReason | null {
    // Honor the adaptive floor: never declare ready before it elapses.
    if (s.elapsedMs < s.floorMs) {
        return null;
    }
    // Declared readiness beacon is the strongest signal.
    if (s.beaconDeclared && s.beaconPresent) {
        return 'beacon-ready';
    }
    // Otherwise require quiescence: nothing busy and two stable frames.
    if (!s.busy && s.hashStable) {
        if (s.sawBusy) {
            return 'marker-cleared';
        }
        return s.networkIdle ? 'networkidle' : 'stable';
    }
    return null;
}
