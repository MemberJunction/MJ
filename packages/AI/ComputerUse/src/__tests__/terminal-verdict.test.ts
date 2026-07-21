import { describe, it, expect } from 'vitest';
import { gateImpossibleVerdict, DEFAULT_IMPOSSIBLE_QUORUM } from '../engine/terminal-verdict.js';

describe('gateImpossibleVerdict (CU-D6)', () => {
    const base = { impossible: true, pageLoading: false, priorCount: 0, quorum: 2 };

    it('does not accept the first Impossible (needs a quorum)', () => {
        const r = gateImpossibleVerdict(base);
        expect(r.accept).toBe(false);
        expect(r.newCount).toBe(1);
        expect(r.suppressed).toBe(false);
    });

    it('accepts the second concurring Impossible', () => {
        const r = gateImpossibleVerdict({ ...base, priorCount: 1 });
        expect(r.accept).toBe(true);
        expect(r.newCount).toBe(2);
    });

    it('resets the count on a non-Impossible verdict', () => {
        const r = gateImpossibleVerdict({ ...base, impossible: false, priorCount: 1 });
        expect(r.accept).toBe(false);
        expect(r.newCount).toBe(0);
    });

    it('suppresses Impossible while the page is loading and holds the count', () => {
        const r = gateImpossibleVerdict({ ...base, pageLoading: true, priorCount: 1 });
        expect(r.accept).toBe(false);
        expect(r.suppressed).toBe(true);
        expect(r.newCount).toBe(1); // held — neither built toward nor cleared
    });

    it('a loading boot screen never reaches quorum on its own', () => {
        let count = 0;
        for (let i = 0; i < 5; i++) {
            const r = gateImpossibleVerdict({ impossible: true, pageLoading: true, priorCount: count, quorum: 2 });
            count = r.newCount;
            expect(r.accept).toBe(false);
        }
        expect(count).toBe(0);
    });

    it('honors a quorum of 1 (accept immediately)', () => {
        expect(gateImpossibleVerdict({ ...base, quorum: 1 }).accept).toBe(true);
    });

    it('exposes a sane default quorum', () => {
        expect(DEFAULT_IMPOSSIBLE_QUORUM).toBe(2);
    });
});
