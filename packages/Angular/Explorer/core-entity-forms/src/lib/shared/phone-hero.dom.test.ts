import { describe, it, expect } from 'vitest';
import { JoinHeroSummary, CountLabel } from './phone-hero';

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
