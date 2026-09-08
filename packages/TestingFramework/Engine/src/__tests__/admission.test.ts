import { describe, it, expect, vi } from 'vitest';
import {
    HealthState,
    admissionDecision,
    readHealthState,
    AdmissionController,
} from '../engine/admission';

describe('admissionDecision', () => {
    it('proceeds when health is missing or healthy', () => {
        expect(admissionDecision(null, 3)).toBe('proceed');
        expect(admissionDecision({ state: 'healthy' }, 3)).toBe('proceed');
    });

    it('pauses when critical', () => {
        expect(admissionDecision({ state: 'critical' }, 0)).toBe('pause');
        expect(admissionDecision({ state: 'critical' }, 5)).toBe('pause');
    });

    it('degraded sheds workers at/above the recommended floor, keeping lower indices', () => {
        const s: HealthState = { state: 'degraded', recommendedWorkers: 2 };
        expect(admissionDecision(s, 0)).toBe('proceed'); // below floor
        expect(admissionDecision(s, 1)).toBe('proceed'); // below floor
        expect(admissionDecision(s, 2)).toBe('exit');    // at floor → shed
        expect(admissionDecision(s, 3)).toBe('exit');    // above floor → shed
    });

    it('degraded NEVER sheds worker 0 (guaranteed drainer), even at recommend 1', () => {
        expect(admissionDecision({ state: 'degraded', recommendedWorkers: 1 }, 0)).toBe('proceed');
        expect(admissionDecision({ state: 'degraded', recommendedWorkers: 1 }, 1)).toBe('exit');
    });

    it('treats a missing recommendedWorkers as floor 1', () => {
        expect(admissionDecision({ state: 'degraded' }, 0)).toBe('proceed');
        expect(admissionDecision({ state: 'degraded' }, 1)).toBe('exit');
    });
});

describe('readHealthState', () => {
    it('parses a valid state file', () => {
        const read = () => JSON.stringify({ state: 'degraded', recommendedWorkers: 2, reasons: ['memory 80%'] });
        expect(readHealthState('/x', read as never)).toMatchObject({ state: 'degraded', recommendedWorkers: 2 });
    });

    it('fails OPEN (null) on a missing file', () => {
        const read = () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); };
        expect(readHealthState('/missing', read as never)).toBeNull();
    });

    it('fails OPEN (null) on malformed JSON', () => {
        expect(readHealthState('/x', (() => 'not json{') as never)).toBeNull();
    });

    it('fails OPEN (null) on an unrecognized state value', () => {
        expect(readHealthState('/x', (() => JSON.stringify({ state: 'meltdown' })) as never)).toBeNull();
    });
});

describe('AdmissionController', () => {
    const noSleep = vi.fn(async () => {});

    it('proceeds immediately when healthy', async () => {
        const c = new AdmissionController({ readHealth: () => ({ state: 'healthy' }), sleep: noSleep });
        expect(await c.admit(2)).toBe('proceed');
        expect(noSleep).not.toHaveBeenCalled();
    });

    it('sheds a high-index worker when degraded', async () => {
        const c = new AdmissionController({ readHealth: () => ({ state: 'degraded', recommendedWorkers: 2 }), sleep: noSleep });
        expect(await c.admit(3)).toBe('exit');
    });

    it('pauses while critical, then proceeds once the host recovers', async () => {
        const states: HealthState[] = [
            { state: 'critical', reasons: ['memory 95%'] },
            { state: 'critical' },
            { state: 'healthy' },
        ];
        let i = 0;
        const sleep = vi.fn(async () => {});
        const c = new AdmissionController({ readHealth: () => states[Math.min(i++, states.length - 1)], pollMs: 10, sleep });
        expect(await c.admit(0)).toBe('proceed');
        expect(sleep).toHaveBeenCalledTimes(2); // paused across the two critical reads
    });

    it('gives up pausing at the cap, fires the hook, and proceeds', async () => {
        const onPauseCapReached = vi.fn();
        const sleep = vi.fn(async () => {});
        const c = new AdmissionController({
            readHealth: () => ({ state: 'critical' }),
            pollMs: 100,
            maxPauseMs: 250,
            sleep,
            onPauseCapReached,
        });
        expect(await c.admit(0)).toBe('proceed'); // never recovers → cap → proceed
        expect(onPauseCapReached).toHaveBeenCalledTimes(1);
    });
});
