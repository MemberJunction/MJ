import { describe, it, expect } from 'vitest';
import { JoinHeroSummary, CountLabel, RunStatusKind } from './phone-hero';

describe('JoinHeroSummary', () => {
    it('joins the present parts with a middle dot, trimmed, in order', () => {
        expect(JoinHeroSummary(['Communication', ' Generated ', '12 params'])).toBe('Communication · Generated · 12 params');
    });

    it('skips null, undefined, false and blank parts', () => {
        expect(JoinHeroSummary([null, 'A', undefined, false, '  ', 'B'])).toBe('A · B');
    });

    it('is empty when nothing is present', () => {
        expect(JoinHeroSummary([null, false])).toBe('');
    });
});

describe('CountLabel', () => {
    it('uses the singular for one and the plural otherwise', () => {
        expect(CountLabel(1, 'param')).toBe('1 param');
        expect(CountLabel(0, 'param')).toBe('0 params');
        expect(CountLabel(12, 'param')).toBe('12 params');
    });
});

describe('RunStatusKind', () => {
    it('is running until the run has completed, whatever the success flag says', () => {
        expect(RunStatusKind(false, null)).toBe('running');
        expect(RunStatusKind(false, true)).toBe('running');
    });

    it('maps a completed run to success, error, or info when there is no success flag', () => {
        expect(RunStatusKind(true, true)).toBe('success');
        expect(RunStatusKind(true, false)).toBe('error');
        expect(RunStatusKind(true, null)).toBe('info');
        expect(RunStatusKind(true, undefined)).toBe('info');
    });
});
