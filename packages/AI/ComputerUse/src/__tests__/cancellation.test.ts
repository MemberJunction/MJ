import { describe, it, expect } from 'vitest';
import { CancellationError, abortableDelay } from '../engine/cancellation.js';

describe('CancellationError (CU-B8)', () => {
    it('is an Error with a distinct name for instanceof / catch discrimination', () => {
        const e = new CancellationError();
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(CancellationError);
        expect(e.name).toBe('CancellationError');
    });
});

describe('abortableDelay (CU-B8)', () => {
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
