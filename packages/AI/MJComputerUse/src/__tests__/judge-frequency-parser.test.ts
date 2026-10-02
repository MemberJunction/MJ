import { describe, it, expect } from 'vitest';
import { ParseJudgeFrequency, ParseColonNumber } from '../utils/judge-frequency-parser.js';

// ─── parseColonNumber ─────────────────────────────────────────────
describe('parseColonNumber', () => {
    it('should extract the number after a colon', () => {
        expect(ParseColonNumber('Label:42', 0)).toBe(42);
    });

    it('should return the default when there is no colon', () => {
        expect(ParseColonNumber('NoColon', 7)).toBe(7);
    });

    it('should return the default when the value after the colon is not a number', () => {
        expect(ParseColonNumber('Label:abc', 5)).toBe(5);
    });

    it('should return the default when the value after the colon is zero', () => {
        expect(ParseColonNumber('Label:0', 3)).toBe(3);
    });

    it('should return the default when the value after the colon is negative', () => {
        expect(ParseColonNumber('Label:-1', 3)).toBe(3);
    });

    it('should trim whitespace around the number', () => {
        expect(ParseColonNumber('Label:  10  ', 0)).toBe(10);
    });

    it('should handle an empty string after the colon', () => {
        expect(ParseColonNumber('Label:', 8)).toBe(8);
    });

    it('should handle multiple colons by using everything after the first', () => {
        // "Label:3:extra" -> substring after first colon is "3:extra" -> Number("3:extra") is NaN
        expect(ParseColonNumber('Label:3:extra', 5)).toBe(5);
    });

    it('should handle a decimal number', () => {
        expect(ParseColonNumber('Label:2.5', 1)).toBe(2.5);
    });
});

// ─── parseJudgeFrequency ──────────────────────────────────────────
describe('parseJudgeFrequency', () => {
    describe('EveryStep', () => {
        it('should return EveryStepFrequency for "EveryStep"', () => {
            const result = ParseJudgeFrequency('EveryStep');
            expect(result.Type).toBe('EveryStep');
        });

        it('should be case-insensitive for "everystep"', () => {
            const result = ParseJudgeFrequency('everystep');
            expect(result.Type).toBe('EveryStep');
        });

        it('should be case-insensitive for "EVERYSTEP"', () => {
            const result = ParseJudgeFrequency('EVERYSTEP');
            expect(result.Type).toBe('EveryStep');
        });
    });

    describe('EveryNSteps', () => {
        it('should return EveryNStepsFrequency with correct N for "EveryNSteps:5"', () => {
            const result = ParseJudgeFrequency('EveryNSteps:5');
            expect(result.Type).toBe('EveryNSteps');
            expect((result as { N: number }).N).toBe(5);
        });

        it('should return EveryNStepsFrequency with default N=3 when no colon', () => {
            const result = ParseJudgeFrequency('EveryNSteps');
            expect(result.Type).toBe('EveryNSteps');
            expect((result as { N: number }).N).toBe(3);
        });

        it('should return default N=3 for non-numeric value', () => {
            const result = ParseJudgeFrequency('EveryNSteps:abc');
            expect(result.Type).toBe('EveryNSteps');
            expect((result as { N: number }).N).toBe(3);
        });

        it('should be case-insensitive for "everynsteps:10"', () => {
            const result = ParseJudgeFrequency('everynsteps:10');
            expect(result.Type).toBe('EveryNSteps');
            expect((result as { N: number }).N).toBe(10);
        });

        it('should return default N=3 for zero value', () => {
            const result = ParseJudgeFrequency('EveryNSteps:0');
            expect(result.Type).toBe('EveryNSteps');
            expect((result as { N: number }).N).toBe(3);
        });
    });

    describe('OnStagnation', () => {
        it('should return OnStagnationFrequency with correct threshold for "OnStagnation:5"', () => {
            const result = ParseJudgeFrequency('OnStagnation:5');
            expect(result.Type).toBe('OnStagnation');
            expect((result as { StagnationThreshold: number }).StagnationThreshold).toBe(5);
        });

        it('should return default threshold=5 when no colon', () => {
            const result = ParseJudgeFrequency('OnStagnation');
            expect(result.Type).toBe('OnStagnation');
            expect((result as { StagnationThreshold: number }).StagnationThreshold).toBe(5);
        });

        it('should return default threshold=5 for non-numeric value', () => {
            const result = ParseJudgeFrequency('OnStagnation:xyz');
            expect(result.Type).toBe('OnStagnation');
            expect((result as { StagnationThreshold: number }).StagnationThreshold).toBe(5);
        });

        it('should be case-insensitive for "onstagnation:8"', () => {
            const result = ParseJudgeFrequency('onstagnation:8');
            expect(result.Type).toBe('OnStagnation');
            expect((result as { StagnationThreshold: number }).StagnationThreshold).toBe(8);
        });
    });

    describe('fallback behavior', () => {
        it('should default to EveryStepFrequency for unrecognized strings', () => {
            const result = ParseJudgeFrequency('UnknownFormat');
            expect(result.Type).toBe('EveryStep');
        });

        it('should default to EveryStepFrequency for an empty string', () => {
            const result = ParseJudgeFrequency('');
            expect(result.Type).toBe('EveryStep');
        });

        it('should default to EveryStepFrequency for random text', () => {
            const result = ParseJudgeFrequency('some random text');
            expect(result.Type).toBe('EveryStep');
        });
    });
});
