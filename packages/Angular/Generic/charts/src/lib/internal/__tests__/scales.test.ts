import { describe, it, expect } from 'vitest';
import { BuildValueTicks, CreateValueScale, CullKeepingEnds, CullTicks, FormatPercent, MaxOf, MinOf, ParseFontSize, PercentDomain, Round2, TruncateLabel, TypeMetrics, ValueDomain } from '../scales';

const measure = (t: string): number => t.length * 10;

describe('ValueDomain', () => {
    it('always includes zero', () => {
        expect(ValueDomain(5, 9)).toEqual({ Min: 0, Max: 9 });
        expect(ValueDomain(-4, -1)).toEqual({ Min: -4, Max: 0 });
    });
    it('pads a zero-width domain to [0, 1] so the baseline sits at the bottom, not mid-height', () => {
        expect(ValueDomain(0, 0)).toEqual({ Min: 0, Max: 1 });
        const scale = CreateValueScale(ValueDomain(0, 0), 300, 0, false);
        expect(scale(0)).toBe(300);
    });
});

describe('CreateValueScale / BuildValueTicks', () => {
    it('percent mode keeps the exact [0, 1] domain and five ticks', () => {
        const scale = CreateValueScale(PercentDomain, 200, 0, true);
        const ticks = BuildValueTicks(scale, true, (v) => String(v), 'end');
        expect(scale.domain()).toEqual([0, 1]);
        expect(ticks.map((t) => t.Position)).toEqual([200, 150, 100, 50, 0]);
        expect(ticks.map((t) => t.Label)).toEqual([0, 0.25, 0.5, 0.75, 1].map(FormatPercent));
    });

    it('value ticks are formatted with the caller formatter and capped at 8', () => {
        const scale = CreateValueScale({ Min: 0, Max: 1000 }, 0, 400, false);
        const ticks = BuildValueTicks(scale, false, (v) => `$${v}`, 'end');
        expect(ticks.length).toBeLessThanOrEqual(8);
        expect(ticks[0].Label).toBe('$0');
        expect(new Set(ticks.map((t) => t.Key)).size).toBe(ticks.length);
    });
});

describe('CullTicks', () => {
    it('keeps everything at or under the cap', () => expect(CullTicks([1, 2, 3], 8)).toEqual([1, 2, 3]));
    it('keeps every k-th item over the cap', () => {
        const kept = CullTicks(Array.from({ length: 20 }, (_, i) => i), 8);
        expect(kept.length).toBeLessThanOrEqual(8);
        expect(kept[0]).toBe(0);
    });
});

describe('CullKeepingEnds', () => {
    const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

    it('keeps everything at or under the cap', () => expect(CullKeepingEnds(range(8), 8)).toEqual(range(8)));

    it.each([9, 10, 12, 19, 100, 2000])('keeps the first and last of %i items, at most 8, ascending and unique', (n) => {
        const kept = CullKeepingEnds(range(n), 8);
        expect(kept[0]).toBe(0);
        expect(kept[kept.length - 1]).toBe(n - 1);
        expect(kept.length).toBeLessThanOrEqual(8);
        expect(kept.every((v, i) => i === 0 || v > kept[i - 1])).toBe(true);
    });

    it('spaces the kept items at least a uniform step apart', () => {
        const kept = CullKeepingEnds(range(12), 8);
        const step = Math.ceil(11 / 7);
        kept.slice(1).forEach((v, i) => expect(v - kept[i]).toBeGreaterThanOrEqual(step));
    });

    it('handles empty and single inputs', () => {
        expect(CullKeepingEnds([], 8)).toEqual([]);
        expect(CullKeepingEnds(['x'], 8)).toEqual(['x']);
    });
});

describe('BuildValueTicks anchor', () => {
    it('tags every tick with the anchor the caller renders it with', () => {
        const scale = CreateValueScale({ Min: 0, Max: 100 }, 100, 0, false);
        expect(BuildValueTicks(scale, false, (v) => `${v}`, 'end').every((t) => t.Anchor === 'end')).toBe(true);
        expect(BuildValueTicks(scale, true, (v) => `${v}`, 'middle').every((t) => t.Anchor === 'middle')).toBe(true);
    });
});

describe('TruncateLabel', () => {
    it('returns short labels unchanged', () => expect(TruncateLabel('abc', 100, measure)).toBe('abc'));
    it('ellipsizes to the widest prefix that fits', () => {
        const out = TruncateLabel('abcdefghij', 50, measure);
        expect(out.endsWith('…')).toBe(true);
        expect(measure(out)).toBeLessThanOrEqual(50);
        expect(out).toBe('abcd…');
    });
    it('returns empty when not even the ellipsis fits', () => expect(TruncateLabel('abc', 5, measure)).toBe(''));
});

describe('Round2', () => {
    it('rounds to two decimals', () => expect(Round2(1.23456)).toBe(1.23));
});

describe('MaxOf / MinOf', () => {
    it('return the extreme value, or the bound when nothing passes it', () => {
        expect(MaxOf([3, 9, 4], 0)).toBe(9);
        expect(MaxOf([-3, -9], 0)).toBe(0);
        expect(MaxOf([], 0)).toBe(0);
        expect(MinOf([3, -9, 4], 0)).toBe(-9);
        expect(MinOf([3, 9], 0)).toBe(0);
        expect(MinOf([], 0)).toBe(0);
    });
    it('handle a 200,000-element array without overflowing the argument limit', () => {
        const big = Array.from({ length: 200000 }, (_, i) => i);
        expect(MaxOf(big, 0)).toBe(199999);
        expect(MinOf(big, 0)).toBe(0);
    });
});

describe('TypeMetrics', () => {
    it('reproduces today\'s constants at 12px', () => {
        expect(TypeMetrics(12)).toEqual({ FontSize: 12, LineHeight: 16, AxisGap: 8, ValueAxisThickness: 24, LegendRowHeight: 20, LegendSwatch: 10 });
    });
    it('scales every metric with the font size', () => {
        const t = TypeMetrics(18);
        expect(t.LineHeight).toBe(24);
        expect(t.ValueAxisThickness).toBe(36);
        expect(t.LegendRowHeight).toBe(30);
        expect(t.LegendSwatch).toBe(15);
        expect(t.AxisGap).toBe(12);
    });
    it('never shrinks gaps below the 12px baseline', () => {
        expect(TypeMetrics(8).AxisGap).toBe(8);
    });
    it.each([[0], [-4], [Number.NaN], [Number.POSITIVE_INFINITY]])('treats %d as the default font size', (bad) => {
        expect(TypeMetrics(bad)).toEqual(TypeMetrics(12));
    });
});

describe('ParseFontSize', () => {
    it.each([['16px', 16], ['12.5px', 12.5], ['', 12], ['var(--x)', 12], [null, 12], [undefined, 12], ['0px', 12], ['-3px', 12]])('%j -> %d', (input, expected) => {
        expect(ParseFontSize(input)).toBe(expected);
    });
});
