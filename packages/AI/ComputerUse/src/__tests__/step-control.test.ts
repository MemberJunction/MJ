import { describe, it, expect } from 'vitest';
import {
    resolveSettleExit,
    SettlePollSignals,
    normalizeUrlForLoop,
    computeStateSignature,
    detectLoop,
    stateRepeatThresholdFor,
    isAuthDetourUrl,
    evaluateAuthDetour,
    CancellationError,
    abortableDelay,
    timeBudgetExpiryReason,
    wallClockCeilingMs,
    WALL_CLOCK_GRACE_MIN_MS,
    WALL_CLOCK_GRACE_FACTOR,
    distillActionError,
    isPageChangingAction,
    evaluateBatchStop,
    DEFAULT_MAX_ACTIONS_PER_BATCH,
} from '../engine/step-control.js';

// ─── from settle-decision ───

function signals(overrides: Partial<SettlePollSignals> = {}): SettlePollSignals {
    return {
        beaconDeclared: false,
        beaconPresent: false,
        busy: false,
        hashStable: false,
        sawBusy: false,
        networkIdle: false,
        elapsedMs: 1000,
        floorMs: 0,
        ...overrides,
    };
}

describe('resolveSettleExit', () => {
    it('keeps polling until the adaptive floor elapses, even when fully settled', () => {
        expect(resolveSettleExit(signals({ hashStable: true, elapsedMs: 200, floorMs: 500 }))).toBeNull();
        // Same signals past the floor → exits.
        expect(resolveSettleExit(signals({ hashStable: true, elapsedMs: 600, floorMs: 500 }))).toBe('stable');
    });

    it('beacon present wins over everything (even while busy/unstable)', () => {
        expect(resolveSettleExit(signals({ beaconDeclared: true, beaconPresent: true, busy: true, hashStable: false }))).toBe('beacon-ready');
    });

    it('a declared-but-absent beacon does not short-circuit; falls through to heuristics', () => {
        expect(resolveSettleExit(signals({ beaconDeclared: true, beaconPresent: false, busy: false, hashStable: true }))).toBe('stable');
        expect(resolveSettleExit(signals({ beaconDeclared: true, beaconPresent: false, busy: true, hashStable: true }))).toBeNull();
    });

    it('busy markers block exit regardless of hash stability', () => {
        expect(resolveSettleExit(signals({ busy: true, hashStable: true }))).toBeNull();
    });

    it('requires hash stability when not busy', () => {
        expect(resolveSettleExit(signals({ busy: false, hashStable: false }))).toBeNull();
        expect(resolveSettleExit(signals({ busy: false, hashStable: true }))).toBe('stable');
    });

    it('distinguishes marker-cleared from stable via sawBusy', () => {
        expect(resolveSettleExit(signals({ busy: false, hashStable: true, sawBusy: true }))).toBe('marker-cleared');
        expect(resolveSettleExit(signals({ busy: false, hashStable: true, sawBusy: false }))).toBe('stable');
    });

    it('reports networkidle when it resolved and nothing was ever busy', () => {
        expect(resolveSettleExit(signals({ busy: false, hashStable: true, networkIdle: true }))).toBe('networkidle');
        // sawBusy takes precedence over networkidle in the reason.
        expect(resolveSettleExit(signals({ busy: false, hashStable: true, networkIdle: true, sawBusy: true }))).toBe('marker-cleared');
    });

    it('never exits early via the loop (budget is the caller\'s concern, not this fn)', () => {
        // When nothing indicates readiness, returns null so the caller keeps polling / hits budget.
        expect(resolveSettleExit(signals({ busy: true, hashStable: false }))).toBeNull();
    });
});

// ─── from loop-detection ───

describe('normalizeUrlForLoop', () => {
    it('strips the hash fragment', () => {
        expect(normalizeUrlForLoop('http://h/app/x#frag')).toBe('http://h/app/x');
    });

    it('strips declared volatile params but keeps the rest', () => {
        const out = normalizeUrlForLoop('http://h/app?entity=A&_t=999', ['_t']);
        expect(out).toBe('http://h/app?entity=A');
    });

    it('sorts params so order does not matter', () => {
        expect(normalizeUrlForLoop('http://h/app?b=2&a=1')).toBe(normalizeUrlForLoop('http://h/app?a=1&b=2'));
    });

    it('returns non-URL strings trimmed rather than throwing', () => {
        expect(normalizeUrlForLoop('  not a url  ')).toBe('not a url');
        expect(normalizeUrlForLoop('')).toBe('');
    });
});

describe('computeStateSignature', () => {
    it('combines normalized URL and hash', () => {
        expect(computeStateSignature('http://h/app#x', 'abc123', [])).toBe('http://h/app|abc123');
    });

    it('returns empty when there is no hash (unperceivable step)', () => {
        expect(computeStateSignature('http://h/app', '', [])).toBe('');
    });

    it('same page + same screen → equal signatures even with a volatile token', () => {
        const a = computeStateSignature('http://h/app?_t=1', 'HASH', ['_t']);
        const b = computeStateSignature('http://h/app?_t=2', 'HASH', ['_t']);
        expect(a).toBe(b);
    });
});

describe('detectLoop', () => {
    it('returns null below the repeat threshold', () => {
        expect(detectLoop(['a', 'b', 'a'], 3)).toBeNull();
    });

    it('flags a repeated state at the threshold', () => {
        const loop = detectLoop(['a', 'b', 'a', 'c', 'a'], 3);
        expect(loop?.kind).toBe('repeat-state');
        expect(loop?.count).toBe(3);
        expect(loop?.detail).toContain('3 times');
    });

    it('ignores empty signatures (unperceivable steps do not count as a repeat)', () => {
        expect(detectLoop(['', '', ''], 3)).toBeNull();
    });

    it('detects a period-2 A/B cycle', () => {
        const loop = detectLoop(['x', 'a', 'b', 'a', 'b'], 99); // threshold high so only cycle can fire
        expect(loop?.kind).toBe('cycle');
        expect(loop?.count).toBe(2);
    });

    it('detects a period-3 cycle', () => {
        const loop = detectLoop(['a', 'b', 'c', 'a', 'b', 'c'], 99);
        expect(loop?.kind).toBe('cycle');
        expect(loop?.count).toBe(3);
    });

    it('does not flag a healthy, progressing run', () => {
        expect(detectLoop(['a', 'b', 'c', 'd', 'e'], 3)).toBeNull();
    });

    it('prefers repeat-state over cycle when both apply', () => {
        // "a" appears 3× (threshold) and there is also an a/b cycle.
        const loop = detectLoop(['a', 'b', 'a', 'b', 'a'], 3);
        expect(loop?.kind).toBe('repeat-state');
    });
});

describe('stateRepeatThresholdFor', () => {
    it('leaves a single-goal run on the base threshold', () => {
        expect(stateRepeatThresholdFor(3, 0)).toBe(3);
    });

    it('allows one extra revisit per requested part', () => {
        // A 6-section tour must tolerate returning to its hub once per section.
        expect(stateRepeatThresholdFor(3, 6)).toBe(9);
        expect(stateRepeatThresholdFor(3, 3)).toBe(6);
    });

    it('covers the criteria-scored case that made T124 unpassable', () => {
        // "Clearing the filter RESTORES the fuller list" requires returning to an
        // earlier state as the PASS condition — 3 criteria, so 3 extra revisits.
        expect(stateRepeatThresholdFor(3, 3)).toBe(6);
    });

    it('never returns below the base threshold for junk input', () => {
        expect(stateRepeatThresholdFor(3, -5)).toBe(3);
        expect(stateRepeatThresholdFor(3, Number.NaN)).toBe(3);
        expect(stateRepeatThresholdFor(3, Infinity)).toBe(3);
    });

    it('floors fractional part counts', () => {
        expect(stateRepeatThresholdFor(3, 2.9)).toBe(5);
    });

    it('honors a non-default base threshold from the app profile', () => {
        expect(stateRepeatThresholdFor(5, 4)).toBe(9);
    });
});

describe('cycle tolerance for multi-part goals', () => {
    // hub → section → hub → section: one repetition of a 2-state block.
    const tourShape = ['hub', 'sect', 'hub', 'sect'];

    it('trips on a single A-B-A-B repetition at the default tolerance', () => {
        const signal = detectLoop(tourShape, 99, 2);
        expect(signal?.kind).toBe('cycle');
    });

    it('does NOT trip on that same shape when tolerance is raised', () => {
        // This is the T038 regression: latching 2 of 6 checkpoints requires
        // alternating hub/section, and the old hardcoded 2 killed it at step 12.
        expect(detectLoop(tourShape, 99, 3)).toBeNull();
    });

    it('still trips once the block genuinely repeats enough times', () => {
        const spinning = ['hub', 'sect', 'hub', 'sect', 'hub', 'sect'];
        expect(detectLoop(spinning, 99, 3)?.kind).toBe('cycle');
    });

    it('reports how many repetitions it required', () => {
        const spinning = ['a', 'b', 'a', 'b', 'a', 'b'];
        expect(detectLoop(spinning, 99, 3)?.detail).toContain('3× over');
    });

    it('clamps a nonsense tolerance up to the minimum of 2', () => {
        expect(detectLoop(tourShape, 99, 0)?.kind).toBe('cycle');
        expect(detectLoop(tourShape, 99, -4)?.kind).toBe('cycle');
    });

    it('no longer puts fabricated step numbers in repeat-state evidence', () => {
        // The engine clears this history on checkpoint progress, so array indices
        // stop matching real step numbers — reporting them was misleading.
        const detail = detectLoop(['x', 'x', 'x'], 3)?.detail ?? '';
        expect(detail).toContain('3 times');
        expect(detail).not.toMatch(/steps? \d/);
    });
});

// ─── from auth-detour ───

const PATTERNS = ['auth0.com', 'login.microsoftonline.com', '/u/consent'];

describe('isAuthDetourUrl', () => {
    it('matches a host pattern anywhere in the URL, case-insensitively', () => {
        expect(isAuthDetourUrl('https://dev-abc.us.AUTH0.com/authorize?x=1', PATTERNS)).toBe(true);
        expect(isAuthDetourUrl('https://login.microsoftonline.com/common/oauth2', PATTERNS)).toBe(true);
    });

    it('matches a path-scoped pattern', () => {
        expect(isAuthDetourUrl('https://dev-abc.auth0.com/u/consent?state=xyz', PATTERNS)).toBe(true);
    });

    it('does not match the app itself', () => {
        expect(isAuthDetourUrl('http://localhost:4201/app/home', PATTERNS)).toBe(false);
    });

    it('is disabled (never matches) when patterns are empty', () => {
        expect(isAuthDetourUrl('https://anything.auth0.com/', [])).toBe(false);
    });

    it('ignores empty/whitespace patterns and empty URLs', () => {
        expect(isAuthDetourUrl('https://x.auth0.com', ['   ', ''])).toBe(false);
        expect(isAuthDetourUrl('', PATTERNS)).toBe(false);
    });
});

describe('evaluateAuthDetour', () => {
    it('reports no detour for an app URL', () => {
        const d = evaluateAuthDetour('http://localhost:4201/app', PATTERNS, 0, 2);
        expect(d.isDetour).toBe(false);
        expect(d.shouldTerminate).toBe(false);
    });

    it('recovers the first detour (count 0 → 1) when max is 2', () => {
        const d = evaluateAuthDetour('https://x.auth0.com', PATTERNS, 0, 2);
        expect(d.isDetour).toBe(true);
        expect(d.shouldTerminate).toBe(false);
    });

    it('terminates on the detour that reaches max (count 1 → 2)', () => {
        const d = evaluateAuthDetour('https://x.auth0.com', PATTERNS, 1, 2);
        expect(d.isDetour).toBe(true);
        expect(d.shouldTerminate).toBe(true);
    });

    it('terminates on the first detour when max is 1', () => {
        const d = evaluateAuthDetour('https://x.auth0.com', PATTERNS, 0, 1);
        expect(d.isDetour).toBe(true);
        expect(d.shouldTerminate).toBe(true);
    });
});

// ─── from run-limits ───

describe('CancellationError', () => {
    it('is an Error with a distinct name for instanceof / catch discrimination', () => {
        const e = new CancellationError();
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(CancellationError);
        expect(e.name).toBe('CancellationError');
    });
});

describe('abortableDelay', () => {
    it('resolves immediately when the signal is already aborted', async () => {
        const ac = new AbortController();
        ac.abort();
        const start = Date.now();
        await abortableDelay(10_000, ac.signal);
        expect(Date.now() - start).toBeLessThan(200);
    });

    it('resolves early when the signal aborts mid-wait', async () => {
        const ac = new AbortController();
        const start = Date.now();
        const p = abortableDelay(10_000, ac.signal);
        setTimeout(() => ac.abort(), 20);
        await p;
        expect(Date.now() - start).toBeLessThan(500);
    });

    it('waits the full duration when no signal is provided', async () => {
        const start = Date.now();
        await abortableDelay(30);
        expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    });

    it('waits the full duration when the signal never aborts', async () => {
        const ac = new AbortController();
        const start = Date.now();
        await abortableDelay(30, ac.signal);
        expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    });
});


/**
 * Mirror of TestEngine's `resolveWatchdogMs` (packages/TestingFramework/Engine).
 * Replicated here (not imported) to avoid a cross-package dependency — the engine
 * must not depend on the testing framework. Keep in sync with that formula.
 */
const watchdogMs = (t: number) => t + Math.max(30_000, Math.round(t * 0.25));

describe('timeBudgetExpiryReason (graceful expiry)', () => {
    it('returns null when no budget is configured', () => {
        expect(timeBudgetExpiryReason(999_999, 0, 0)).toBeNull();
        expect(timeBudgetExpiryReason(999_999, 0, undefined)).toBeNull();
    });

    it('returns null while comfortably within budget', () => {
        expect(timeBudgetExpiryReason(100_000, 0, 300_000)).toBeNull();
    });

    it('expires on agent-time when settle is light', () => {
        expect(timeBudgetExpiryReason(300_000, 0, 300_000)).toContain('agent-time');
    });

    it('excludes settle from the agent-time budget (slow render does not burn reasoning)', () => {
        // 350s elapsed, 100s settle → agent-time 250s < 300s budget, and wall
        // (350s) is still under the ceiling (337.5s? no — 350 > 337.5) ... use a
        // case squarely inside both bounds:
        expect(timeBudgetExpiryReason(320_000, 100_000, 300_000)).toBeNull();
    });

    it('expires on the WALL-CLOCK ceiling when settle is heavy (the watchdog-Error case)', () => {
        // T=300s, 150s settle → agent-time 250s < 300s (agent budget NOT hit),
        // but wall 400s ≥ ceiling 337.5s → graceful wall-clock expiry.
        const reason = timeBudgetExpiryReason(400_000, 150_000, 300_000);
        expect(reason).toContain('wall-clock ceiling');
    });

    it('agent-time takes precedence in the reason when both bounds are exceeded', () => {
        // elapsed 500s, no settle, T=300s → agent-time 500s ≥ 300s.
        expect(timeBudgetExpiryReason(500_000, 0, 300_000)).toContain('agent-time');
    });

    it('wall-clock ceiling ALWAYS fires before the TestEngine watchdog, with judge margin', () => {
        for (const t of [60_000, 120_000, 300_000, 420_000, 600_000]) {
            const ceiling = wallClockCeilingMs(t);
            expect(ceiling).toBeLessThan(watchdogMs(t));
            // margin left for the forced final judge before the watchdog abandons
            expect(watchdogMs(t) - ceiling).toBeGreaterThanOrEqual(WALL_CLOCK_GRACE_MIN_MS);
        }
    });

    it('wall-clock ceiling uses the larger of the floor and the fractional grace', () => {
        // small T → 15s floor dominates; large T → 12.5% fraction dominates
        expect(wallClockCeilingMs(60_000)).toBe(60_000 + WALL_CLOCK_GRACE_MIN_MS);
        expect(wallClockCeilingMs(400_000)).toBe(400_000 + Math.round(400_000 * WALL_CLOCK_GRACE_FACTOR));
    });
});

// ─── from action-batch ───

/** Verbatim from run-20260728T201832Z — T124, the filter popover's own backdrop. */
const BACKDROP_INTERCEPTION = `locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('xpath=/html/body[1]/app-root[1]/div[1]/mj-refresh-button[1]/button[1]').first()
    - locator resolved to <button mjbutton="" type="button" title="Refresh" aria-label="Refresh">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="cdk-overlay-backdrop mj-filter-popover-backdrop cdk-overlay-backdrop-showing"></div> from <div class="cdk-overlay-container">…</div> subtree intercepts pointer events
  - retrying click action`;

/** Verbatim from T069 — successive retries name different ancestors. */
const SHIFTING_ANCESTORS = `locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('xpath=/html/body[1]/ps-catalog[1]/button[1]').first()
    - locator resolved to <button class="chip ng-star-inserted" data-testid="ps-catalog-scenario-chip">…</button>
  - attempting click action
    - <div class="ps-panel ps-catalog" data-testid="ps-catalog-panel">…</div> intercepts pointer events
  - retrying click action
    - <mj-ps-studio-resource _nghost-ng-c3215765789="">…</mj-ps-studio-resource> intercepts pointer events
  - retrying click action
    - <div class="ps-panel ps-catalog" data-testid="ps-catalog-panel">…</div> intercepts pointer events`;

/** A genuine "never appeared" timeout — the call log carries no decision signal. */
const NEVER_RESOLVED = `locator.click: Timeout 2000ms exceeded.
Call log:
  - waiting for locator('xpath=/html/body[1]/div[9]/button[1]').first()
  - waiting for locator('xpath=/html/body[1]/div[9]/button[1]').first()`;

describe('distillActionError', () => {
    it('reports unknown for a missing error', () => {
        expect(distillActionError(undefined)).toBe('unknown');
        expect(distillActionError('')).toBe('unknown');
    });

    it('passes a single-line error through unchanged', () => {
        expect(distillActionError('No interactive element at index 12')).toBe('No interactive element at index 12');
    });

    it('keeps only the headline when nothing intercepted', () => {
        // The element genuinely never appeared; the call log is pure noise.
        expect(distillActionError(NEVER_RESOLVED)).toBe('locator.click: Timeout 2000ms exceeded.');
    });

    it('names the blocker and corrects the "element not found" misreading', () => {
        const distilled = distillActionError(BACKDROP_INTERCEPTION);

        expect(distilled).toContain('locator.click: Timeout 8000ms exceeded.');
        expect(distilled).toContain('The element WAS found');
        expect(distilled).toContain('cdk-overlay-backdrop mj-filter-popover-backdrop');
    });

    it('tells the controller not to repeat the identical click', () => {
        // Without this the model retries the same coordinates until the budget dies.
        expect(distillActionError(BACKDROP_INTERCEPTION)).toContain('Repeating this exact click will fail');
    });

    it('offers the recovery that actually dismisses an overlay', () => {
        const distilled = distillActionError(BACKDROP_INTERCEPTION);

        expect(distilled).toContain('Escape');
        expect(distilled).toContain('click the covering element');
    });

    it('lists every distinct blocker once, in the order seen', () => {
        const distilled = distillActionError(SHIFTING_ANCESTORS);

        expect(distilled).toContain('ps-catalog-panel');
        expect(distilled).toContain('mj-ps-studio-resource');
        expect(distilled).toContain('were covering it');
        // The repeated first ancestor must not appear twice.
        expect(distilled.match(/ps-catalog-panel/g)).toHaveLength(1);
    });

    it('uses singular phrasing for a lone blocker', () => {
        expect(distillActionError(BACKDROP_INTERCEPTION)).toContain('was covering it');
    });

    it('strips Angular per-component attributes from blocker tags', () => {
        const distilled = distillActionError(SHIFTING_ANCESTORS);

        expect(distilled).toContain('<mj-ps-studio-resource>');
        expect(distilled).not.toContain('_nghost-');
    });

    it('drops the call log even when it is very long', () => {
        const noisy = `locator.click: Timeout 8000ms exceeded.\nCall log:\n${'  - waiting 20ms\n'.repeat(80)}`;

        expect(distillActionError(noisy)).toBe('locator.click: Timeout 8000ms exceeded.');
    });

    it('truncates a blocker tag that carries a huge attribute list', () => {
        const wide = `locator.click: Timeout 8000ms exceeded.\nCall log:\n  - <div class="${'x'.repeat(300)}">…</div> intercepts pointer events`;

        const distilled = distillActionError(wide);
        expect(distilled).toContain('…>');
        expect(distilled.length).toBeLessThan(500);
    });
});


describe('isPageChangingAction', () => {
    it('flags navigation actions', () => {
        for (const t of ['Navigate', 'GoBack', 'GoForward', 'Refresh'] as const) {
            expect(isPageChangingAction(t)).toBe(true);
        }
    });
    it('does not flag in-page actions', () => {
        for (const t of ['Click', 'Type', 'Scroll', 'Wait', 'ClickElement', 'Keypress'] as const) {
            expect(isPageChangingAction(t)).toBe(false);
        }
    });
});

describe('evaluateBatchStop', () => {
    const base = { actionType: 'Click' as const, success: true, urlChanged: false, executedCount: 1, maxActions: 4 };

    it('continues on a clean in-page action under the cap', () => {
        expect(evaluateBatchStop(base)).toBeNull();
    });

    it('stops on a failed action (compounding-damage fix), even if nothing else fired', () => {
        expect(evaluateBatchStop({ ...base, success: false })).toBe('action-failed');
    });

    it('stops when the URL changed mid-batch', () => {
        expect(evaluateBatchStop({ ...base, urlChanged: true })).toBe('url-changed');
    });

    it('stops after a page-changing action type', () => {
        expect(evaluateBatchStop({ ...base, actionType: 'Navigate' })).toBe('page-changing-action');
    });

    it('stops when the per-step cap is reached', () => {
        expect(evaluateBatchStop({ ...base, executedCount: 4, maxActions: 4 })).toBe('max-actions');
    });

    it('precedence: a failed navigation reports as action-failed, not page-changing', () => {
        expect(evaluateBatchStop({ ...base, actionType: 'Navigate', success: false })).toBe('action-failed');
    });

    it('exposes a sane default cap', () => {
        expect(DEFAULT_MAX_ACTIONS_PER_BATCH).toBe(4);
    });
});
