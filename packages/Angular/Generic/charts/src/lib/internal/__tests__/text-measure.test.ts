import { describe, it, expect } from 'vitest';
import { CreateTextMeasure, EstimateTextMeasure } from '../text-measure';

describe('EstimateTextMeasure', () => {
    it('is proportional to length and font size', () => {
        const m = EstimateTextMeasure(10);
        expect(m('abcd')).toBe(24);
        expect(m('')).toBe(0);
    });
});

describe('CreateTextMeasure', () => {
    it('falls back to the estimate where OffscreenCanvas is unavailable (jsdom)', () => {
        const m = CreateTextMeasure('Inter', 12);
        expect(m('abcd')).toBe(EstimateTextMeasure(12)('abcd'));
    });
});
