/**
 * The per-step decisions the main loop makes, each pure so it is testable without
 * a browser: when the page has settled, whether the agent is looping, whether the
 * page bounced to an identity provider, when the run must stop, and whether a
 * multi-action batch may continue.
 */

import type { SettleReason } from '../types/app-profile.js';
import type { BrowserAction } from '../types/browser.js';

// ─── Settle Exit ───────────────────────────────────────

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

// ─── Loop Detection ────────────────────────────────────

/** A detected loop and the evidence for it (prompt/classifier-facing). */
export interface LoopSignal {
    /** 'repeat-state' = same signature seen ≥ threshold times; 'cycle' = a repeating A→B→A→B sequence. */
    kind: 'repeat-state' | 'cycle';
    /** How many times the repeated state occurred (repeat-state) or the cycle period (cycle). */
    count: number;
    /** Human/prompt-facing evidence sentence. */
    detail: string;
}

/**
 * Normalize a URL for loop comparison: drop the hash fragment and any
 * app-declared volatile query params, keep everything else. Two visits to the
 * "same page" then produce equal strings even if a per-visit token differs.
 * Never throws — a non-URL string is returned trimmed.
 */
export function normalizeUrlForLoop(url: string, volatileParams: readonly string[] = []): string {
    if (!url) {
        return '';
    }
    try {
        const u = new URL(url);
        u.hash = '';
        for (const p of volatileParams) {
            u.searchParams.delete(p);
        }
        // Sort remaining params so ?a=1&b=2 and ?b=2&a=1 compare equal.
        u.searchParams.sort();
        return u.toString();
    } catch {
        return url.trim();
    }
}

/**
 * Build a state signature from a step's post-action URL and perceptual hash.
 * Returns '' when there's no hash (couldn't perceive) so the caller can skip
 * loop scoring for that step rather than treat blanks as a repeated state.
 */
export function computeStateSignature(
    urlAfter: string,
    screenshotHash: string,
    volatileParams: readonly string[] = []
): string {
    if (!screenshotHash) {
        return '';
    }
    return `${normalizeUrlForLoop(urlAfter, volatileParams)}|${screenshotHash}`;
}

/**
 * How many times one page state may recur before it counts as a loop trip, given
 * how many distinct things the goal asks for (`requestedParts` — checkpoints for a
 * tour, validation criteria otherwise).
 *
 * Revisiting a state is a STRUCTURAL consequence of a multi-part goal, not evidence
 * of being stuck. Tours are hub-and-spoke, so walking N sections returns to the hub
 * up to N times; and multi-criteria goals do it too — "clearing the filter RESTORES
 * the fuller list" asks the agent to return to an earlier state *as the pass
 * condition*. At the base threshold of 3 those goals trip the detector on their own
 * shape. Allowing one revisit per requested part plus the base tolerance makes the
 * step/time budgets the real backstop, which is what they are for.
 *
 * `requestedParts <= 0` (a single-goal run) keeps the base threshold unchanged.
 */
export function stateRepeatThresholdFor(baseThreshold: number, requestedParts: number): number {
    if (!Number.isFinite(requestedParts) || requestedParts <= 0) {
        return baseThreshold;
    }
    return baseThreshold + Math.floor(requestedParts);
}

/**
 * Detect a loop in the signature history (most recent last). Empty signatures
 * are ignored. Returns the strongest signal or null.
 *
 * - repeat-state: the most-recent signature has occurred ≥ `stateRepeatThreshold` times.
 * - cycle: the tail is a repeating block of period 2..4 that repeats ≥ twice.
 */
export function detectLoop(
    signatures: readonly string[],
    stateRepeatThreshold: number,
    cycleRepeatThreshold: number = 2
): LoopSignal | null {
    const sigs = signatures.filter(s => s !== '');
    if (sigs.length === 0) {
        return null;
    }

    // (a) repeat-state — same observable state revisited N times.
    const last = sigs[sigs.length - 1];
    const occurrences = sigs.filter(s => s === last).length;
    if (occurrences >= stateRepeatThreshold) {
        return {
            kind: 'repeat-state',
            count: occurrences,
            // Deliberately NOT reporting step numbers: the engine clears this history
            // when a checkpoint latches, so array positions stop matching real step
            // numbers after the first reset. Reporting them anyway put false step
            // numbers in the controller's prompt.
            detail: `the same page state has been reached ${occurrences} times since the last progress`,
        };
    }

    // (c) cycle — the tail is the same block of `period` states repeated
    // `cycleRepeatThreshold` times over.
    //
    // The repeat count is a threshold rather than a hardcoded 2 because ONE
    // repetition of an A→B→A→B block is the normal shape of a multi-section tour:
    // hub → section → hub → section. Tripping on that killed T038 at step 12 of a
    // 90-step budget, right after it had latched 2 of its 6 checkpoints.
    const repeats = Math.max(2, Math.floor(cycleRepeatThreshold));
    for (let period = 2; period <= 4; period++) {
        if (sigs.length < period * repeats) {
            continue;
        }
        const block = sigs.slice(-period);
        let allMatch = true;
        for (let r = 1; r < repeats && allMatch; r++) {
            const prior = sigs.slice(-period * (r + 1), -period * r);
            allMatch = block.every((s, i) => s === prior[i]);
        }
        if (allMatch) {
            return {
                kind: 'cycle',
                count: period,
                detail: `navigation is cycling through the same ${period} states repeatedly (${repeats}× over) with no progress`,
            };
        }
    }

    return null;
}

// ─── Auth Detour ───────────────────────────────────────

/** The outcome of evaluating the current URL against the watchdog config. */
export interface AuthDetourDecision {
    /** The current URL matched an identity-provider pattern. */
    isDetour: boolean;
    /**
     * This detour takes the run's count to/over `maxDetours` — recovery isn't
     * holding, so the run should terminate as an infrastructure AuthDetour
     * rather than be recovered again. Only meaningful when `isDetour` is true.
     */
    shouldTerminate: boolean;
}

/**
 * True when `url` contains any of `patterns` (case-insensitive substring). A
 * substring test (not hostname-only) so path-scoped markers like `/u/consent`
 * work alongside host markers like `auth0.com`. Empty patterns → never a
 * detour (watchdog disabled).
 */
export function isAuthDetourUrl(url: string, patterns: string[]): boolean {
    if (!url || patterns.length === 0) {
        return false;
    }
    const haystack = url.toLowerCase();
    return patterns.some(p => {
        const needle = p.trim().toLowerCase();
        return needle.length > 0 && haystack.includes(needle);
    });
}

/**
 * Evaluate the current URL for the watchdog. `priorDetourCount` is how many
 * detours have already occurred this run (before this one); the caller
 * increments its counter when `isDetour` is true. `shouldTerminate` is set once
 * the count *including this detour* reaches `maxDetours`.
 */
export function evaluateAuthDetour(
    url: string,
    patterns: string[],
    priorDetourCount: number,
    maxDetours: number
): AuthDetourDecision {
    const isDetour = isAuthDetourUrl(url, patterns);
    if (!isDetour) {
        return { isDetour: false, shouldTerminate: false };
    }
    // The count after we record this detour.
    const countAfter = priorDetourCount + 1;
    return { isDetour: true, shouldTerminate: countAfter >= maxDetours };
}

// ─── Run Limits ────────────────────────────────────────

/**
 * Thrown by the engine's cancellation checkpoints to unwind the current step. The
 * main loop maps it to the `Cancelled` status — it is control flow, not an error.
 */
export class CancellationError extends Error {
    constructor(message: string = 'Run cancelled') {
        super(message);
        this.name = 'CancellationError';
    }
}

/**
 * Resolve after `ms`, or early the moment `signal` aborts. Always resolves, never
 * rejects — the caller's next cancellation checkpoint turns the early return into
 * the terminal status.
 */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
        return Promise.resolve();
    }
    return new Promise<void>(resolve => {
        const onAbort = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/** Minimum wall-clock grace over the budget before the engine's own ceiling fires. */
export const WALL_CLOCK_GRACE_MIN_MS = 15_000;
/** Wall-clock grace as a fraction of the budget (whichever is larger wins). */
export const WALL_CLOCK_GRACE_FACTOR = 0.125;

/**
 * The wall-clock ceiling (total elapsed) at which the run expires gracefully.
 *
 * Deliberately HALF the TestEngine watchdog's grace (`max(30s, 0.25 × maxMs)`) so
 * this always trips first and the run ends as a judged `TimeBudgetExceeded`
 * rather than being abandoned unscored by the watchdog. Keep the halving if the
 * watchdog formula changes.
 */
export function wallClockCeilingMs(maxMs: number): number {
    const base = Math.max(0, maxMs);
    return base + Math.max(WALL_CLOCK_GRACE_MIN_MS, Math.round(base * WALL_CLOCK_GRACE_FACTOR));
}

/**
 * Whether the run must expire now and why, or `null` when it is within budget (or
 * no budget is configured). Two independent bounds: agent time, which excludes
 * settle so a slow-rendering app doesn't burn the reasoning budget, and the
 * wall-clock ceiling, which caps total elapsed time.
 */
export function timeBudgetExpiryReason(
    elapsedMs: number,
    cumulativeSettleMs: number,
    maxMs: number | undefined
): string | null {
    if (!maxMs || maxMs <= 0) {
        return null;
    }
    const agentTimeMs = Math.max(0, elapsedMs - cumulativeSettleMs);
    if (agentTimeMs >= maxMs) {
        return `agent-time budget (${maxMs}ms, settle excluded)`;
    }
    const ceiling = wallClockCeilingMs(maxMs);
    if (elapsedMs >= ceiling) {
        return `wall-clock ceiling (${ceiling}ms, settle included)`;
    }
    return null;
}

// ─── Action Batch ──────────────────────────────────────

/** Default cap on actions executed per step before the batch stops. */
export const DEFAULT_MAX_ACTIONS_PER_BATCH = 4;

/** Why a batch stopped before running every queued action. */
export type BatchStopReason = 'action-failed' | 'url-changed' | 'page-changing-action' | 'max-actions';

/**
 * Action types that change the page/route. Nothing queued after one of these
 * should run in the same batch — the DOM the later actions targeted is gone.
 */
export function isPageChangingAction(type: BrowserAction['Type']): boolean {
    return type === 'Navigate' || type === 'GoBack' || type === 'GoForward' || type === 'Refresh';
}

/**
 * After executing one action, decide whether to stop the rest of the batch.
 * Returns the reason, or null to continue. A failed action stops first so queued
 * actions can't fire into the wrong place.
 */
export function evaluateBatchStop(params: {
    actionType: BrowserAction['Type'];
    success: boolean;
    urlChanged: boolean;
    executedCount: number;
    maxActions: number;
}): BatchStopReason | null {
    if (!params.success) {
        return 'action-failed';
    }
    if (params.urlChanged) {
        return 'url-changed';
    }
    if (isPageChangingAction(params.actionType)) {
        return 'page-changing-action';
    }
    if (params.executedCount >= params.maxActions) {
        return 'max-actions';
    }
    return null;
}

/**
 * Matches Playwright's interception lines, both shapes it emits:
 *   - <div class="x">…</div> intercepts pointer events
 *   - <div class="y"></div> from <div class="z">…</div> subtree intercepts pointer events
 * The first tag is the actual blocker in both, so a single capture serves both.
 */
const INTERCEPTION_PATTERN = /-\s*(<[^>]+>)[^\n]*intercepts pointer events/g;

/** Angular's per-component attributes carry no meaning for the controller. */
const ANGULAR_SCOPE_ATTRIBUTE = /\s*_ng(content|host)-[a-z0-9-]+=(""|"[^"]*")/g;

const MAX_BLOCKER_LENGTH = 90;

/** Reduce a logged open tag to a compact, meaningful identifier. */
function condenseTag(tag: string): string {
    const cleaned = tag.replace(ANGULAR_SCOPE_ATTRIBUTE, '');
    return cleaned.length > MAX_BLOCKER_LENGTH ? `${cleaned.slice(0, MAX_BLOCKER_LENGTH)}…>` : cleaned;
}

/**
 * Collapse a raw browser-action error into one actionable line, dropping
 * Playwright's multi-line call log. Returns the headline alone when nothing
 * intercepted, or the headline plus a named-blocker recovery hint when it did —
 * an undistilled timeout reads as "the element isn't there" and the controller
 * retries the identical click.
 */
export function distillActionError(message: string | undefined): string {
    if (!message) {
        return 'unknown';
    }
    const headline = message.split('\n')[0].trim();
    const blockers = [...message.matchAll(INTERCEPTION_PATTERN)].map(match => condenseTag(match[1]));
    if (blockers.length === 0) {
        return headline;
    }

    // Successive retries can report different blockers as the page settles; list
    // each once, in the order Playwright saw them.
    const unique = [...new Set(blockers)];
    const subject = unique.length > 1 ? `${unique.join(' then ')} were` : `${unique[0]} was`;
    return `${headline} The element WAS found, but ${subject} covering it at the click point, so the click could not land. ` +
        `Repeating this exact click will fail the same way. Dismiss whatever is covering it first (press Escape, or click the covering element itself), or reach the target a different way.`;
}
