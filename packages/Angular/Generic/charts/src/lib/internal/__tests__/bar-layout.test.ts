import { describe, it, expect } from 'vitest';
import { ComputeBarLayout, BarLayoutInput, RoundedEndRectPath } from '../bar-layout';
import { ChartSeries } from '../../chart.types';
import { TypeMetrics } from '../scales';

const measure = (t: string): number => t.length * 7;
const base = (over: Partial<BarLayoutInput>): BarLayoutInput => ({
    Categories: ['A', 'B'],
    Series: [{ Name: 's0', Values: [1, 2] }, { Name: 's1', Values: [3, 4] }],
    Fills: ['var(--mj-viz-1)', 'var(--mj-viz-2)'],
    Orientation: 'vertical',
    Stacked: false,
    Size: { Width: 400, Height: 200 },
    Measure: measure,
    Type: TypeMetrics(12),
    Formatter: (v) => String(v),
    ...over,
});
const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(0.02);

describe('RoundedEndRectPath', () => {
    it('draws a plain rectangle when the radius is 0', () => {
        expect(RoundedEndRectPath(0, 0, 10, 20, 0, 'top')).toBe('M0,0h10v20h-10Z');
    });
    it('rounds only the requested end', () => {
        expect(RoundedEndRectPath(0, 0, 10, 20, 4, 'right')).toBe('M0,0H6A4,4 0 0 1 10,4V16A4,4 0 0 1 6,20H0Z');
        expect(RoundedEndRectPath(0, 0, 10, 20, 4, 'top')).toBe('M0,20V4A4,4 0 0 1 4,0H6A4,4 0 0 1 10,4V20Z');
    });
});

describe('ComputeBarLayout — grouped', () => {
    it('draws one segment per finite non-zero cell, with unique keys and rounded ends', () => {
        const g = ComputeBarLayout(base({}));
        expect(g.Segments).toHaveLength(4);
        expect(new Set(g.Segments.map((s) => s.Key)).size).toBe(4);
        expect(g.Segments.every((s) => s.CornerRadius > 0)).toBe(true);
        expect(g.Segments.map((s) => s.Fill)).toEqual(['var(--mj-viz-1)', 'var(--mj-viz-2)', 'var(--mj-viz-1)', 'var(--mj-viz-2)']);
    });

    it('skips null, NaN and zero cells but keeps the others', () => {
        const g = ComputeBarLayout(base({ Series: [{ Name: 's0', Values: [null, 0] }, { Name: 's1', Values: [Number.NaN, 5] }] }));
        expect(g.Segments.map((s) => s.Key)).toEqual(['1:1']);
    });

    it('extends negative bars below the baseline', () => {
        const g = ComputeBarLayout(base({ Series: [{ Name: 's0', Values: [-2, 3] }] }));
        const neg = g.Segments.find((s) => s.CategoryIndex === 0)!;
        const pos = g.Segments.find((s) => s.CategoryIndex === 1)!;
        near(neg.Y, g.Baseline);
        near(pos.Y + pos.Height, g.Baseline);
    });
});

describe('ComputeBarLayout — stacked', () => {
    it('stacks series and rounds only the outermost segment', () => {
        const g = ComputeBarLayout(base({ Stacked: true }));
        const a0 = g.Segments.find((s) => s.Key === '0:0')!;
        const a1 = g.Segments.find((s) => s.Key === '1:0')!;
        near(a1.Y + a1.Height, a0.Y);
        expect(a0.CornerRadius).toBe(0);
        expect(a1.CornerRadius).toBeGreaterThan(0);
    });

    it('reports each segment\'s raw cell value, free of cumulative float noise', () => {
        const g = ComputeBarLayout(base({ Categories: ['A'], Series: [{ Name: 's0', Values: [0.1] }, { Name: 's1', Values: [0.2] }], Fills: ['a', 'b'], Stacked: true }));
        const second = g.Segments.find((s) => s.Key === '1:0')!;
        expect(second.Value).toBe(0.2);
    });

    it('stacks negatives away from zero (diverging) and rounds the outermost on each side', () => {
        const series: ChartSeries[] = [{ Name: 'up', Values: [5] }, { Name: 'down', Values: [-3] }, { Name: 'down2', Values: [-1] }];
        const g = ComputeBarLayout(base({ Categories: ['A'], Series: series, Fills: ['a', 'b', 'c'], Stacked: true }));
        const up = g.Segments.find((s) => s.SeriesIndex === 0)!;
        const down = g.Segments.find((s) => s.SeriesIndex === 1)!;
        const down2 = g.Segments.find((s) => s.SeriesIndex === 2)!;
        near(up.Y + up.Height, g.Baseline);
        near(down.Y, g.Baseline);
        near(down2.Y, down.Y + down.Height);
        expect(up.CornerRadius).toBeGreaterThan(0);
        expect(down.CornerRadius).toBe(0);
        expect(down2.CornerRadius).toBeGreaterThan(0);
    });
});

describe('ComputeBarLayout — horizontal', () => {
    it('grows bars rightward from the baseline and truncates long category labels', () => {
        const long = 'An extremely long category label that cannot fit';
        const g = ComputeBarLayout(base({ Orientation: 'horizontal', Categories: [long, 'B'], Stacked: true }));
        const seg = g.Segments.find((s) => s.Key === '1:0')!;
        expect(seg.Width).toBeGreaterThan(0);
        expect(seg.CornerRadius).toBeGreaterThan(0);
        expect(seg.Path).toBe(RoundedEndRectPath(seg.X, seg.Y, seg.Width, seg.Height, seg.CornerRadius, 'right'));
        near(g.Segments.find((s) => s.Key === '0:0')!.X, g.Baseline);
        const tick = g.CategoryAxis.find((t) => t.FullLabel === long)!;
        expect(tick.Label.endsWith('…')).toBe(true);
        expect(measure(tick.Label)).toBeLessThanOrEqual(g.Box.X);
    });

    it('draws category 0 at the top', () => {
        const g = ComputeBarLayout(base({ Orientation: 'horizontal' }));
        const c0 = g.CategoryAxis.find((t) => t.Key === 'c0')!;
        const c1 = g.CategoryAxis.find((t) => t.Key === 'c1')!;
        expect(c0.Position).toBeLessThan(c1.Position);
    });
});

describe('ComputeBarLayout — degenerate data', () => {
    it('all-zero data still has a value axis and a baseline at the bottom of the plot', () => {
        const g = ComputeBarLayout(base({ Series: [{ Name: 's0', Values: [0, 0] }], Fills: ['a'] }));
        expect(g.Segments).toHaveLength(0);
        expect(g.ValueAxis.length).toBeGreaterThan(0);
        near(g.Baseline, g.Box.Y + g.Box.Height);
    });

    it('vertical: category ticks sit centered under the bars (middle); value ticks sit left of the plot (end)', () => {
        const g = ComputeBarLayout(base({ Orientation: 'vertical' }));
        expect(g.CategoryAxis.every((t) => t.Anchor === 'middle')).toBe(true);
        expect(g.ValueAxis.every((t) => t.Anchor === 'end')).toBe(true);
    });

    it('horizontal: category ticks sit left of the plot (end); value ticks sit centered under the plot (middle)', () => {
        const g = ComputeBarLayout(base({ Orientation: 'horizontal' }));
        expect(g.CategoryAxis.every((t) => t.Anchor === 'end')).toBe(true);
        expect(g.ValueAxis.every((t) => t.Anchor === 'middle')).toBe(true);
    });

    it('category bands tile the category axis for hit testing', () => {
        const g = ComputeBarLayout(base({}));
        expect(g.CategoryBands).toHaveLength(2);
        near(g.CategoryBands[0].Start + g.CategoryBands[0].Size, g.CategoryBands[1].Start);
    });
});

describe('ComputeBarLayout - type metrics', () => {
    it('a larger font shrinks the plot box and raises label offsets', () => {
        const small = ComputeBarLayout(base({ Type: TypeMetrics(12), Measure: (t) => t.length * 7 }));
        const big = ComputeBarLayout(base({ Type: TypeMetrics(18), Measure: (t) => t.length * 10.5 }));
        expect(big.Box.Height).toBeLessThan(small.Box.Height);
        expect(big.Type.LineHeight).toBe(24);
    });
    it('a 320px-wide phone layout keeps a non-negative plot box and truncates labels', () => {
        const g = ComputeBarLayout(base({ Orientation: 'horizontal', Size: { Width: 320, Height: 200 }, Categories: ['A very long category name indeed', 'B'] }));
        expect(g.Box.Width).toBeGreaterThanOrEqual(0);
        expect(g.CategoryAxis[0].Label.endsWith('\u2026')).toBe(true);
    });
});
