/**
 * TelemetryManager bounds the collections it DERIVES from events, not only the events.
 *
 * trimIfNeeded() used to trim _events alone. _insights grew by one entry per emitted warning,
 * _patterns by one per distinct fingerprint and _insightDedupeWindow by one per dedupe key, for the
 * life of the process. These tests pin the bounds, and that the dedupe sweep compares on the clock
 * the window is stamped with (Date.now()) — on Node getTimestamp() is performance.now(), and a
 * sweep on that clock never finds a Date.now() stamp old enough to release.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager } from '../generic/telemetryManager';

interface Internals {
    _insights: Array<{ id: number }>;
    _patterns: Map<string, { lastSeen: number }>;
    _insightDedupeWindow: Map<string, number>;
    trimIfNeeded(): void;
    getTimestamp(): number;
}

describe('TelemetryManager — derived collections are trimmed', () => {
    let tm: TelemetryManager;
    let t: Internals;

    beforeEach(() => {
        tm = TelemetryManager.Instance;
        tm.Reset();
        t = tm as unknown as Internals;
    });

    it('caps insights at autoTrim.maxInsights (default 1000), keeping the newest', () => {
        expect(tm.Settings.autoTrim.maxInsights).toBe(1000);
        t._insights = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
        t.trimIfNeeded();
        expect(t._insights).toHaveLength(1000);
        expect(t._insights[0].id).toBe(500);
        expect(t._insights[999].id).toBe(1499);
    });

    it('drops patterns unseen for longer than autoTrim.maxAgeMs and keeps recent ones', () => {
        const now = t.getTimestamp();
        const maxAge = tm.Settings.autoTrim.maxAgeMs!;
        t._patterns = new Map([['stale', { lastSeen: now - maxAge - 1_000 }], ['recent', { lastSeen: now }]]);
        t.trimIfNeeded();
        expect(t._patterns.has('stale')).toBe(false);
        expect(t._patterns.has('recent')).toBe(true);
    });

    it('releases dedupe-window entries older than the window, stamped as shouldEmitInsight stamps them (Date.now())', () => {
        t._insightDedupeWindow = new Map([['stale', Date.now() - 10 * 60_000], ['fresh', Date.now()]]);
        t.trimIfNeeded();
        expect(t._insightDedupeWindow.has('stale')).toBe(false);
        expect(t._insightDedupeWindow.has('fresh')).toBe(true);
    });

    it('sweeps the maps at most once a minute', () => {
        t.trimIfNeeded(); // first sweep
        const now = t.getTimestamp();
        t._patterns = new Map([['stale', { lastSeen: now - tm.Settings.autoTrim.maxAgeMs! - 1_000 }]]);
        t.trimIfNeeded(); // inside the minute: not swept again
        expect(t._patterns.has('stale')).toBe(true);
    });
});
