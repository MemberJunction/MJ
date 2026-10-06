import { describe, it, expect } from 'vitest';
import { DATABASE_CONFORMANCE_TRAITS, SecondsToShift } from '../testing/DatabaseConformanceHarness';

describe('Database conformance harness helpers', () => {
    it('declares Database transport traits', () => {
        expect(DATABASE_CONFORMANCE_TRAITS).toEqual({ ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 });
    });

    it('rounds elapsed milliseconds up to whole seconds and never shifts by less than one', () => {
        expect(SecondsToShift(1)).toBe(1);
        expect(SecondsToShift(1000)).toBe(1);
        expect(SecondsToShift(1001)).toBe(2);
        expect(SecondsToShift(0)).toBe(1);
    });
});
