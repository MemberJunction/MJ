import { describe, it, expect } from 'vitest';
import {
    BuildCategoryTable, BuildCategoryTooltip, BuildPointEvent, BuildSliceTable, BuildSliceTooltip, DescribeCategoryPoint, DescribeSlice,
    FitLegend, FormatValue, MaxTableRows, MissingValueText,
} from '../describe';
import { FormatPercent, TypeMetrics } from '../scales';
import { ChartSeries } from '../../chart.types';

const fmt = (v: number): string => `${v}u`;
const cats = ['Q1', 'Q2'];
const series: ChartSeries[] = [{ Name: 'A', Values: [1, null] }, { Name: 'B', Values: [3, 4] }];

describe('FormatValue', () => {
    it('formats finite values and shows an em dash for missing', () => {
        expect(FormatValue(2, fmt)).toBe('2u');
        expect(FormatValue(null, fmt)).toBe(MissingValueText);
        expect(FormatValue(Number.NaN, fmt)).toBe(MissingValueText);
    });
});

describe('BuildCategoryTable', () => {
    it('one row per category, one column per series, raw values', () => {
        const t = BuildCategoryTable('Sales', cats, series, fmt, null);
        expect(t.Caption).toBe('Sales');
        expect(t.ColumnHeaders).toEqual(['A', 'B']);
        expect(t.Rows.map((r) => [r.Header, ...r.Cells])).toEqual([['Q1', '1u', '3u'], ['Q2', '—', '4u']]);
        expect(t.TruncatedNote).toBeNull();
    });
    it('adds the share in percent mode', () => {
        const t = BuildCategoryTable('Mix', cats, series, fmt, [[0.25, 0], [0.75, 1]]);
        expect(t.Rows[0].Cells).toEqual([`1u (${FormatPercent(0.25)})`, `3u (${FormatPercent(0.75)})`]);
        expect(t.Rows[1].Cells[0]).toBe('—');
    });
    it('caps rows and says so', () => {
        const many = Array.from({ length: MaxTableRows + 5 }, (_, i) => `c${i}`);
        const t = BuildCategoryTable('Big', many, [{ Name: 'A', Values: many.map(() => 1) }], fmt, null);
        expect(t.Rows).toHaveLength(MaxTableRows);
        expect(t.TruncatedNote).toContain(String(MaxTableRows));
    });
});

describe('BuildSliceTable', () => {
    it('lists value and share, dash for excluded slices', () => {
        const t = BuildSliceTable('Mix', [{ Label: 'x', Value: 3 }, { Label: 'y', Value: -1 }], fmt, [100, null]);
        expect(t.ColumnHeaders).toEqual(['Value', 'Share']);
        expect(t.Rows.map((r) => r.Cells)).toEqual([['3u', FormatPercent(1)], ['-1u', '—']]);
    });
});

describe('tooltips', () => {
    it('category tooltip lists every series at the category and marks the active one', () => {
        const tip = BuildCategoryTooltip(0, 1, cats, series, ['f0', 'f1'], fmt, null);
        expect(tip.Title).toBe('Q1');
        expect(tip.Rows.map((r) => [r.Label, r.Value, r.Color, r.Active])).toEqual([['A', '1u', 'f0', false], ['B', '3u', 'f1', true]]);
    });
    it('slice tooltip shows value and share', () => {
        const tip = BuildSliceTooltip(0, [{ Label: 'x', Value: 3 }], ['f0'], fmt, 75);
        expect(tip.Title).toBe('x');
        expect(tip.Rows[0].Value).toBe(`3u (${FormatPercent(0.75)})`);
    });
});

describe('announcements', () => {
    it('reads category, series and value', () => {
        expect(DescribeCategoryPoint(1, 0, cats, series, fmt, null)).toBe('Q2, A, —');
        expect(DescribeCategoryPoint(0, 1, cats, series, fmt, [[0.25], [0.75]])).toBe(`Q1, B, 3u, ${FormatPercent(0.75)}`);
    });
    it('reads slice label, value and share', () => {
        expect(DescribeSlice(0, [{ Label: 'x', Value: 3 }], fmt, 50)).toBe(`x, 3u, ${FormatPercent(0.5)}`);
    });
});

describe('BuildPointEvent', () => {
    it('carries raw values and the share only in percent mode', () => {
        expect(BuildPointEvent({ CategoryIndex: 1, SeriesIndex: 0 }, cats, series, null)).toEqual({
            CategoryIndex: 1, Category: 'Q2', SeriesIndex: 0, SeriesName: 'A', Value: null, Percent: null,
        });
        expect(BuildPointEvent({ CategoryIndex: 0, SeriesIndex: 1 }, cats, series, [[0.25, 0], [0.75, 1]]).Percent).toBe(75);
    });
    it('reports a null percent for a missing cell, never 0', () => {
        expect(BuildPointEvent({ CategoryIndex: 1, SeriesIndex: 0 }, cats, series, [[0.25, 0], [0.75, 1]]).Percent).toBeNull();
    });
});

describe('FitLegend', () => {
    const measure = (t: string): number => t.length * 10;
    const items = Array.from({ length: 10 }, (_, i) => ({ Label: `Item${i}`, Color: `c${i}`, Key: `k${i}` }));
    it('fits everything on one row when there is room', () => {
        const fit = FitLegend(items.slice(0, 2), 1000, measure);
        expect(fit).toEqual({ Visible: items.slice(0, 2), HiddenCount: 0, Rows: 1 });
    });
    it('wraps to at most two rows and counts the rest', () => {
        const fit = FitLegend(items, 200, measure);
        expect(fit.Rows).toBe(2);
        expect(fit.HiddenCount).toBe(items.length - fit.Visible.length);
        expect(fit.HiddenCount).toBeGreaterThan(0);
    });
    // Each item is 10 + 6 + 50 = 66px; ItemGap 16. Row 1 holds Item0 and Item1 at width 200,
    // row 2 holds Item2 plus "+7 more" (70px). Adding Item3 would push "+6 more" to a third row.
    it('keeps the largest prefix whose "+N more" label still fits within two rows at width 200', () => {
        const fit = FitLegend(items, 200, measure);
        expect(fit.Visible).toEqual(items.slice(0, 3));
        expect(fit.HiddenCount).toBe(7);
        expect(fit.Rows).toBe(2);
    });
    // Each item is 66px, so one item per row; "+9 more" (70px) must share row 2 with nothing else.
    it('keeps one item at width 100 and puts "+9 more" on the second row', () => {
        const fit = FitLegend(items, 100, measure);
        expect(fit.Visible).toEqual(items.slice(0, 1));
        expect(fit.HiddenCount).toBe(9);
        expect(fit.Rows).toBe(2);
    });
    // Row 1 holds Item0 (ends at x=66, +16 gap = 82); "+9 more" (70px) fits at 82..152 within 200, so one row suffices.
    it('fits the "+N more" label on the single row when maxRows is 1', () => {
        const fit = FitLegend(items, 200, measure, 1);
        expect(fit.Visible).toEqual(items.slice(0, 1));
        expect(fit.HiddenCount).toBe(9);
        expect(fit.Rows).toBe(1);
    });
    it('fits fewer items per row at a larger font size', () => {
        const small = FitLegend(items, 300, measure, 2, TypeMetrics(12));
        const big = FitLegend(items, 300, (t) => measure(t) * 1.5, 2, TypeMetrics(18));
        expect(big.Visible.length).toBeLessThan(small.Visible.length);
    });
    it('is empty for no items', () => expect(FitLegend([], 200, measure)).toEqual({ Visible: [], HiddenCount: 0, Rows: 0 }));
});
