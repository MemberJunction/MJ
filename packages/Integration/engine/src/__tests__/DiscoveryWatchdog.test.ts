/**
 * The watchdog exists because a hung discovery and a busy one are indistinguishable from outside
 * the process — the failure mode is silence, and silence is also what success looks like until it
 * finishes. These tests pin the registry lifecycle (the ticker exists exactly while samples are in
 * flight), the report's content, and the interval resolution, all with injected clock/timer so no
 * test waits on real time.
 */
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryWatchdog, ResolveWatchdogIntervalMs } from '../DiscoveryWatchdog.js';

function harness(intervalMs = 15_000) {
    let nowMs = 1_000_000;
    const logs: string[] = [];
    const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
    // The watchdog is a BaseSingleton — `new` would return the stored instance and discard these
    // seams — so each harness resets the shared instance and reconfigures it. Reset() also clears
    // any in-flight state a previous test left behind, which is what keeps these independent.
    const watchdog = DiscoveryWatchdog.Instance;
    watchdog.Reset();
    watchdog.Configure({
        IntervalMs: intervalMs,
        Now: () => nowMs,
        Log: m => logs.push(m),
        SetInterval: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
        Clear: handle => { (handle as { cleared: boolean }).cleared = true; },
    });
    return { watchdog, logs, timers, advance: (ms: number) => { nowMs += ms; } };
}

describe('DiscoveryWatchdog', () => {
    it('starts the ticker with the first sample and stops it when the last one ends', () => {
        const { watchdog, timers } = harness();
        const a = watchdog.Start('Applications');
        const b = watchdog.Start('Judges');
        expect(timers).toHaveLength(1);
        watchdog.End(a);
        expect(timers[0].cleared).toBe(false);
        watchdog.End(b);
        expect(timers[0].cleared).toBe(true);
        // A new sample after quiescence gets a fresh ticker.
        watchdog.Start('Media');
        expect(timers).toHaveLength(2);
    });

    it('names every in-flight object with age, stage, progress, and time to deadline', () => {
        const { watchdog, advance } = harness();
        const key = watchdog.Start('Applications', 1_000_000 + 60_000);
        advance(30_000);
        watchdog.Note(key, { Stage: 'FetchChanges#4', Pages: 3, Records: 120 });
        const report = watchdog.BuildReport();
        expect(report).toContain('"Applications" 30s');
        expect(report).toContain('stage=FetchChanges#4');
        expect(report).toContain('pages=3');
        expect(report).toContain('records=120');
        expect(report).toContain('deadlineIn=30s');
    });

    it('reports nothing when idle, and Tick logs only while something is in flight', () => {
        const { watchdog, logs, timers } = harness();
        expect(watchdog.BuildReport()).toBeNull();
        const key = watchdog.Start('Applications');
        timers[0].fn();
        expect(logs).toHaveLength(1);
        watchdog.End(key);
        timers[0].fn();       // a straggling tick after quiescence must not log or throw
        expect(logs).toHaveLength(1);
    });

    it('ignores notes and ends for a sample that already ended — late async callbacks are expected', () => {
        const { watchdog } = harness();
        const key = watchdog.Start('Applications');
        watchdog.End(key);
        expect(() => {
            watchdog.Note(key, { Pages: 9 });
            watchdog.End(key);
            watchdog.Note(undefined, { Pages: 1 });
            watchdog.End(undefined);
        }).not.toThrow();
        expect(watchdog.Peek(key)).toBeUndefined();
    });

    it('never creates a timer when reporting is disabled, but still tracks progress', () => {
        const { watchdog, timers } = harness(0);
        const key = watchdog.Start('Applications');
        expect(timers).toHaveLength(0);
        watchdog.Note(key, { Records: 7 });
        expect(watchdog.Peek(key)?.Records).toBe(7);
    });
});

describe('ResolveWatchdogIntervalMs', () => {
    it('defaults to 15s when unset or malformed, honours a number, and 0 disables', () => {
        expect(ResolveWatchdogIntervalMs(undefined)).toBe(15_000);
        expect(ResolveWatchdogIntervalMs('')).toBe(15_000);
        expect(ResolveWatchdogIntervalMs('nonsense')).toBe(15_000);
        expect(ResolveWatchdogIntervalMs('5000')).toBe(5000);
        expect(ResolveWatchdogIntervalMs('0')).toBe(0);
        expect(ResolveWatchdogIntervalMs('-4')).toBe(0);
    });
});
