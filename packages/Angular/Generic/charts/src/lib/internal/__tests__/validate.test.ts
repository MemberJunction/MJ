import { describe, it, expect } from 'vitest';
import { IsFiniteValue, ValidateCategorySeries, ValidateSlices } from '../validate';
import { ChartSeries } from '../../chart.types';

const cats = ['Q1', 'Q2'];
const s = (Name: string, Values: Array<number | null>): ChartSeries => ({ Name, Values });

describe('IsFiniteValue', () => {
    it('accepts finite numbers only', () => {
        expect([1, 0, -2.5].every(IsFiniteValue)).toBe(true);
        expect([null, undefined, Number.NaN, Infinity, -Infinity].some((v) => IsFiniteValue(v))).toBe(false);
    });
});

describe('ValidateCategorySeries — spec §8.2 matrix', () => {
    it.each(['bar', 'area-none', 'area-stacked', 'area-percent'] as const)('%s: no categories or no series is empty', (mode) => {
        expect(ValidateCategorySeries([], [s('A', [])], mode)).toEqual({ Kind: 'empty' });
        expect(ValidateCategorySeries(cats, [], mode)).toEqual({ Kind: 'empty' });
    });

    it.each(['bar', 'area-none', 'area-stacked', 'area-percent'] as const)('%s: a length mismatch is invalid and names the series', (mode) => {
        const status = ValidateCategorySeries(cats, [s('Revenue', [1])], mode);
        expect(status).toEqual({ Kind: 'invalid', Code: 'length-mismatch', Detail: 'series "Revenue" has 1 values for 2 categories' });
    });

    it.each(['bar', 'area-none', 'area-stacked', 'area-percent'] as const)('%s: all-zero data is ok (zero is data)', (mode) => {
        expect(ValidateCategorySeries(cats, [s('A', [0, 0])], mode)).toEqual({ Kind: 'ok' });
    });

    it.each(['bar', 'area-none', 'area-stacked', 'area-percent'] as const)('%s: null/NaN/Infinity are ok', (mode) => {
        expect(ValidateCategorySeries(cats, [s('A', [null, Number.NaN]), s('B', [Infinity, -Infinity])], mode)).toEqual({ Kind: 'ok' });
    });

    it('negatives are ok for bar and area-none', () => {
        expect(ValidateCategorySeries(cats, [s('A', [-1, 2])], 'bar')).toEqual({ Kind: 'ok' });
        expect(ValidateCategorySeries(cats, [s('A', [-1, 2])], 'area-none')).toEqual({ Kind: 'ok' });
    });

    it('negatives are invalid for stacked and percent area, without leaking the value', () => {
        expect(ValidateCategorySeries(cats, [s('A', [1, -7])], 'area-stacked')).toEqual({
            Kind: 'invalid', Code: 'negative-in-stacked-area', Detail: 'series "A" is negative at category 1',
        });
        expect(ValidateCategorySeries(cats, [s('A', [-7, 1])], 'area-percent')).toEqual({
            Kind: 'invalid', Code: 'negative-in-percent', Detail: 'series "A" is negative at category 0',
        });
    });
});

describe('ValidateSlices', () => {
    it('no slices is empty', () => expect(ValidateSlices([])).toEqual({ Kind: 'empty' }));
    it('a zero/negative/null-only total is empty', () => {
        expect(ValidateSlices([{ Label: 'a', Value: 0 }, { Label: 'b', Value: -3 }, { Label: 'c', Value: null }])).toEqual({ Kind: 'empty' });
    });
    it('any positive slice is ok', () => {
        expect(ValidateSlices([{ Label: 'a', Value: 0 }, { Label: 'b', Value: 2 }])).toEqual({ Kind: 'ok' });
    });
});
