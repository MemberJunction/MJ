/**
 * The empty-batch watchdog counts only empties at an UNMOVING position. The failure mode it
 * replaces was measured live: a per-item fan-out connector (one upstream call per parent
 * record over sparse data) fired the old empties-only warning dozens of times per run, all
 * false — training operators to dismiss the exact message that a real stuck cursor would wear.
 */
import { describe, it, expect } from 'vitest';
import { EmptyBatchWatchdog } from '../EmptyBatchWatchdog.js';

describe('EmptyBatchWatchdog', () => {
    it('counts consecutive empties at the same position', () => {
        const w = new EmptyBatchWatchdog();
        expect(w.Observe(0, true, [null, null, null, 100, null])).toBe(1);
        expect(w.Observe(0, true, [null, null, null, 100, null])).toBe(2);
        expect(w.Observe(0, true, [null, null, null, 100, null])).toBe(3);
    });

    it('does NOT count empties whose position advanced — sparse pagination is not a bug', () => {
        const w = new EmptyBatchWatchdog();
        // A fan-out connector walking forward: every batch empty, offset always moving.
        for (let offset = 0; offset < 50; offset += 1) {
            expect(w.Observe(0, true, [null, null, null, offset, null])).toBe(1);
        }
    });

    it('a batch with records resets the streak', () => {
        const w = new EmptyBatchWatchdog();
        w.Observe(0, true, ['a']);
        w.Observe(0, true, ['a']);
        expect(w.Observe(3, true, ['a'])).toBe(0);
        expect(w.Observe(0, true, ['a'])).toBe(1);
    });

    it('HasMore=false resets and never counts (the loop is ending anyway)', () => {
        const w = new EmptyBatchWatchdog();
        w.Observe(0, true, ['a']);
        expect(w.Observe(0, false, ['a'])).toBe(0);
        expect(w.Observe(0, true, ['a'])).toBe(1);
    });

    it('any component of the position tuple moving counts as movement', () => {
        const w = new EmptyBatchWatchdog();
        expect(w.Observe(0, true, ['w1', 'k1', 1, 10, 'c1'])).toBe(1);
        expect(w.Observe(0, true, ['w1', 'k1', 1, 10, 'c2'])).toBe(1); // cursor moved
        expect(w.Observe(0, true, ['w2', 'k1', 1, 10, 'c2'])).toBe(1); // watermark moved
        expect(w.Observe(0, true, ['w2', 'k1', 1, 10, 'c2'])).toBe(2); // truly stuck now
    });

    it('null and undefined position components are treated identically', () => {
        // The loop's position vars are a mix of `undefined` (never set) and `null` (cleared);
        // a connector toggling between them has not moved.
        const w = new EmptyBatchWatchdog();
        expect(w.Observe(0, true, [undefined, null, undefined, 5, null])).toBe(1);
        expect(w.Observe(0, true, [null, undefined, null, 5, undefined])).toBe(2);
    });
});
