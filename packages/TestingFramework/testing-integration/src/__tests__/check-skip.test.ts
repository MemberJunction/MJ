import { describe, it, expect } from 'vitest';
import { CheckSkipped, IsCheckSkipped } from '../check-skip';

describe('CheckSkipped', () => {
    it('carries its reason as both Reason and message', () => {
        const err = new CheckSkipped('needs contracts: not installed');
        expect(err.Reason).toBe('needs contracts: not installed');
        expect(err.message).toBe('needs contracts: not installed');
        expect(err.name).toBe('CheckSkipped');
        expect(err).toBeInstanceOf(Error);
    });

    it('IsCheckSkipped is true for a CheckSkipped and false for any other error or value', () => {
        expect(IsCheckSkipped(new CheckSkipped('x'))).toBe(true);
        expect(IsCheckSkipped(new Error('x'))).toBe(false);
        expect(IsCheckSkipped('x')).toBe(false);
        expect(IsCheckSkipped(undefined)).toBe(false);
    });

    it('a plain error named CheckSkipped is not mistaken for one (the marker decides, not the name)', () => {
        const impostor = new Error('x');
        impostor.name = 'CheckSkipped';
        expect(IsCheckSkipped(impostor)).toBe(false);
    });

    it('recognises an error marked by another copy of the package (shared Symbol.for registry)', () => {
        // Simulates a check module that resolved its own copy: a different class, same global symbol.
        class OtherCopyCheckSkipped extends Error {
            public readonly [Symbol.for('@memberjunction/testing-integration/CheckSkipped')] = true;
        }
        expect(IsCheckSkipped(new OtherCopyCheckSkipped('x'))).toBe(true);
    });
});
