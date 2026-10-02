/**
 * Bounding the three collections `TelemetryManager` derives from its event list.
 *
 * `trimIfNeeded()` trims `_events`; these grow alongside it and must be bounded on the same
 * schedule, or a long-lived server retains them for the life of the process:
 *
 * - `_insights` — one entry per emitted warning
 * - `_patterns` — one entry per distinct fingerprint, so it grows with query *variety* rather than
 *   volume, since every new filter combination is a new fingerprint
 * - `_insightDedupeWindow` — one entry per dedupe key
 *
 * `_insights` is capped by count because it is append-only and the newest entries are the useful
 * ones. The two maps are bounded by age instead: an entry that stops recurring should expire, while
 * one that keeps recurring is live data a count cap would evict for nothing. Their sweeps walk the
 * whole map, so they are throttled rather than run on every recorded event — which the cases below
 * also cover, since a throttle that never opens would silently stop bounding anything.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager, TelemetryPattern, TelemetryInsight } from '../generic/telemetryManager';

/** The private surface these tests drive; `trimIfNeeded` is only reachable this way. */
type TelemetryInternals = {
    _insights: TelemetryInsight[];
    _patterns: Map<string, TelemetryPattern>;
    _insightDedupeWindow: Map<string, number>;
    _lastDeepTrimAt: number;
    _settings: {
        autoTrim: { enabled: boolean; maxEvents?: number; maxInsights?: number; maxAgeMs?: number };
        analyzers: { dedupeWindowMs: number };
    };
    getTimestamp(): number;
    trimIfNeeded(): void;
};

function internals(tm: TelemetryManager): TelemetryInternals {
    return tm as unknown as TelemetryInternals;
}

/**
 * A `_lastDeepTrimAt` far enough in the past that the throttled sweep will run.
 *
 * It cannot simply be `0`: the clock is `performance.now()`, which starts near zero at process
 * start, so `0` reads as "swept when the process began" — and in a fresh test process that is less
 * than the sweep interval ago, so the sweep correctly declines to run. (That is also the production
 * behaviour: a server does not sweep during its first minute, when there is nothing to sweep.)
 */
function openThrottle(now: number): number {
    return now - 120_000;
}

function insight(id: string): TelemetryInsight {
    return {
        id,
        severity: 'warning',
        analyzerName: 'test',
        category: 'test',
        title: `insight ${id}`,
        message: 'm',
        suggestion: 's',
        relatedEventIds: [],
        timestamp: 0,
    };
}

function pattern(fingerprint: string, lastSeen: number): TelemetryPattern {
    return {
        fingerprint,
        category: 'RunView',
        operation: 'op',
        sampleParams: {} as TelemetryPattern['sampleParams'],
        count: 1,
        totalElapsedMs: 1,
        avgElapsedMs: 1,
        minElapsedMs: 1,
        maxElapsedMs: 1,
        callerLocations: new Map(),
        firstSeen: lastSeen,
        lastSeen,
        windowStartTime: lastSeen,
    };
}

describe('TelemetryManager — bounded derived collections', () => {
    let tm: TelemetryManager;
    let i: TelemetryInternals;
    let now: number;

    beforeEach(() => {
        tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
        i = internals(tm);
        now = i.getTimestamp();
        i._settings.autoTrim.enabled = true;
    });

    describe('_insights', () => {
        it('is capped at maxInsights, keeping the most recent', () => {
            i._settings.autoTrim.maxInsights = 5;
            i._insights = Array.from({ length: 10 }, (_, n) => insight(`i${n}`));

            i.trimIfNeeded();

            expect(i._insights).toHaveLength(5);
            // The newest are the ones worth keeping.
            expect(i._insights.map(x => x.id)).toEqual(['i5', 'i6', 'i7', 'i8', 'i9']);
        });

        it('leaves a collection already under the cap alone', () => {
            i._settings.autoTrim.maxInsights = 5;
            i._insights = [insight('a'), insight('b')];

            i.trimIfNeeded();

            expect(i._insights.map(x => x.id)).toEqual(['a', 'b']);
        });

        /** The default exists so a process that never configures telemetry is still bounded. */
        it('applies a default cap when none is configured', () => {
            delete i._settings.autoTrim.maxInsights;
            i._insights = Array.from({ length: 1200 }, (_, n) => insight(`i${n}`));

            i.trimIfNeeded();

            expect(i._insights).toHaveLength(1000);
        });
    });

    describe('_patterns', () => {
        it('drops fingerprints not seen within maxAgeMs and keeps live ones', () => {
            i._settings.autoTrim.maxAgeMs = 1000;
            i._patterns.set('stale', pattern('stale', now - 5000));
            i._patterns.set('live', pattern('live', now));
            i._lastDeepTrimAt = openThrottle(now); // let the throttled sweep run

            i.trimIfNeeded();

            expect(i._patterns.has('stale')).toBe(false);
            expect(i._patterns.has('live')).toBe(true);
        });

        it('keeps every fingerprint when no age limit is configured', () => {
            delete i._settings.autoTrim.maxAgeMs;
            i._patterns.set('ancient', pattern('ancient', now - 10_000_000));
            i._lastDeepTrimAt = openThrottle(now);

            i.trimIfNeeded();

            expect(i._patterns.has('ancient')).toBe(true);
        });
    });

    describe('_insightDedupeWindow', () => {
        it('drops keys older than the dedupe window and keeps recent ones', () => {
            i._settings.analyzers.dedupeWindowMs = 1000;
            i._insightDedupeWindow.set('expired', now - 5000);
            i._insightDedupeWindow.set('recent', now);
            i._lastDeepTrimAt = openThrottle(now);

            i.trimIfNeeded();

            expect(i._insightDedupeWindow.has('expired')).toBe(false);
            expect(i._insightDedupeWindow.has('recent')).toBe(true);
        });
    });

    describe('the sweep throttle', () => {
        /**
         * `trimIfNeeded` is called on every recorded event. Walking both maps that often would make
         * telemetry's cost scale with its own history — so the sweeps run at most once a minute and
         * the count cap, which is O(1), runs every time.
         */
        it('does not re-walk the maps on a call immediately following a sweep', () => {
            i._settings.autoTrim.maxAgeMs = 1000;
            i._lastDeepTrimAt = openThrottle(now);
            i._patterns.set('first', pattern('first', now - 5000));

            i.trimIfNeeded();
            expect(i._patterns.has('first')).toBe(false);
            const sweptAt = i._lastDeepTrimAt;
            expect(sweptAt).toBeGreaterThan(0);

            // A second stale fingerprint arrives right after the sweep: it must survive until the
            // next window rather than triggering another full walk.
            i._patterns.set('second', pattern('second', now - 5000));
            i.trimIfNeeded();

            expect(i._patterns.has('second')).toBe(true);
            expect(i._lastDeepTrimAt).toBe(sweptAt);
        });

        it('sweeps again once the interval has elapsed', () => {
            i._settings.autoTrim.maxAgeMs = 1000;
            i._patterns.set('stale', pattern('stale', now - 5000));
            // Pretend the last sweep was well over a minute ago.
            i._lastDeepTrimAt = now - 120_000;

            i.trimIfNeeded();

            expect(i._patterns.has('stale')).toBe(false);
        });

        /** The O(1) count cap must not be gated behind the throttle. */
        it('still caps insights on a call that skips the sweep', () => {
            i._settings.autoTrim.maxInsights = 2;
            i._lastDeepTrimAt = i.getTimestamp(); // throttle closed
            i._insights = [insight('a'), insight('b'), insight('c'), insight('d')];

            i.trimIfNeeded();

            expect(i._insights.map(x => x.id)).toEqual(['c', 'd']);
        });
    });

    it('does nothing at all when auto-trim is disabled', () => {
        i._settings.autoTrim.enabled = false;
        i._settings.autoTrim.maxInsights = 1;
        i._settings.autoTrim.maxAgeMs = 1000;
        i._insights = [insight('a'), insight('b')];
        i._patterns.set('stale', pattern('stale', now - 5000));
        i._lastDeepTrimAt = openThrottle(now);

        i.trimIfNeeded();

        expect(i._insights).toHaveLength(2);
        expect(i._patterns.has('stale')).toBe(true);
    });
});
