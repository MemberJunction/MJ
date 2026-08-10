import { describe, it, expect } from 'vitest';
import { resolveSettleExit, SettlePollSignals } from '../engine/settle-decision.js';

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
