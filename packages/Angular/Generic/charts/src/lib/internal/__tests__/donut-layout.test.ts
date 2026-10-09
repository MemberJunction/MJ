import { describe, it, expect } from 'vitest';
import { arc } from 'd3';
import { ComputeDonutLayout, ComputeSlicePercents, DonutLayoutInput, SliceValue } from '../donut-layout';
import { TypeMetrics } from '../scales';

const measure = (t: string): number => t.length * 7;
const base = (over: Partial<DonutLayoutInput>): DonutLayoutInput => ({
    Slices: [{ Label: 'a', Value: 3 }, { Label: 'b', Value: 1 }],
    Fills: ['var(--mj-viz-1)', 'var(--mj-viz-2)'],
    InnerRadiusRatio: 0.7,
    ShowPercentLabels: false,
    Size: { Width: 300, Height: 300 },
    Measure: measure,
    Type: TypeMetrics(12),
    ...over,
});

describe('SliceValue', () => {
    it('keeps positive finite values and zeroes the rest', () => {
        expect([3, 0, -2, null, Number.NaN].map(SliceValue)).toEqual([3, 0, 0, 0, 0]);
    });
});

describe('ComputeDonutLayout', () => {
    it('covers the full circle and reports percents', () => {
        const g = ComputeDonutLayout(base({}));
        expect(g.Arcs.map((a) => a.Percent)).toEqual([75, 25]);
        const covered = g.Arcs.reduce((sum, a) => sum + (a.EndAngle - a.StartAngle), 0);
        expect(covered).toBeGreaterThan(2 * Math.PI - 0.05);
        expect(covered).toBeLessThanOrEqual(2 * Math.PI);
        expect(g.InnerRadius).toBeCloseTo(g.OuterRadius * 0.7);
    });

    // 300x300, no labels: outer = 150 - Padding(4) = 146, inner = 0.7 * 146. d3's arc is what applies padAngle.
    const unpadded = (start: number, end: number): string | null => arc()({ innerRadius: 146 * 0.7, outerRadius: 146, startAngle: start, endAngle: end });

    it('a lone positive slice among zero slices is a closed ring: exactly 2π, drawn without a pad notch', () => {
        const g = ComputeDonutLayout(base({
            Slices: [{ Label: 'zero', Value: 0 }, { Label: 'all', Value: 5 }, { Label: 'zero', Value: 0 }, { Label: 'none', Value: null }],
            Fills: ['1', '2', '3', '4'],
        }));
        expect(g.Arcs).toHaveLength(1);
        expect(g.Arcs[0].SliceIndex).toBe(1);
        expect(g.Arcs[0].StartAngle).toBeCloseTo(0, 9);
        expect(g.Arcs[0].EndAngle).toBeCloseTo(2 * Math.PI, 9);
        expect(g.Arcs[0].Percent).toBe(100);
        expect(g.Arcs[0].Path).toBe(unpadded(g.Arcs[0].StartAngle, g.Arcs[0].EndAngle));
    });

    it('two drawn slices still get a pad (their paths differ from the unpadded arcs), keeping the caller slice indexes', () => {
        const g = ComputeDonutLayout(base({
            Slices: [{ Label: 'a', Value: 1 }, { Label: 'zero', Value: 0 }, { Label: 'b', Value: 1 }],
            Fills: ['1', '2', '3'],
        }));
        expect(g.Arcs.map((a) => a.SliceIndex)).toEqual([0, 2]);
        expect(g.Arcs.map((a) => a.Fill)).toEqual(['1', '3']);
        for (const a of g.Arcs) {
            expect(a.Path).not.toBe(unpadded(a.StartAngle, a.EndAngle));
        }
        // The zero slice takes no angle: the two drawn slices split the circle evenly.
        expect(g.Arcs[0].EndAngle).toBeCloseTo(Math.PI, 9);
        expect(g.Arcs[1].StartAngle).toBeCloseTo(Math.PI, 9);
    });

    it('excludes negative and null slices without renumbering the rest', () => {
        const g = ComputeDonutLayout(base({ Slices: [{ Label: 'a', Value: 3 }, { Label: 'b', Value: -1 }, { Label: 'c', Value: null }, { Label: 'd', Value: 1 }], Fills: ['1', '2', '3', '4'] }));
        expect(g.Arcs.map((a) => a.SliceIndex)).toEqual([0, 3]);
        expect(g.Arcs.map((a) => a.Fill)).toEqual(['1', '4']);
    });

    it('places percent labels outside the ring and omits labels on thin slices', () => {
        const g = ComputeDonutLayout(base({ ShowPercentLabels: true, Slices: [{ Label: 'big', Value: 100 }, { Label: 'tiny', Value: 1 }] }));
        const big = g.Arcs[0].LabelPoint!;
        const distance = Math.hypot(big.X - g.CenterX, big.Y - g.CenterY);
        expect(distance).toBeGreaterThan(g.OuterRadius);
        expect(g.Arcs[1].LabelPoint).toBeNull();
    });

    it('reserves room for labels, shrinking the radius', () => {
        const without = ComputeDonutLayout(base({}));
        const withLabels = ComputeDonutLayout(base({ ShowPercentLabels: true }));
        expect(withLabels.OuterRadius).toBeLessThan(without.OuterRadius);
    });

    it('InnerRadiusRatio 0 draws a pie', () => {
        expect(ComputeDonutLayout(base({ InnerRadiusRatio: 0 })).InnerRadius).toBe(0);
    });
});

describe('ComputeSlicePercents', () => {
    it('is null for every slice that is not drawn (zero, negative, null, non-finite) and a percentage for the rest', () => {
        const slices = [{ Label: 'a', Value: 3 }, { Label: 'b', Value: 0 }, { Label: 'c', Value: -4 }, { Label: 'd', Value: null }, { Label: 'e', Value: 1 }];
        expect(ComputeSlicePercents(slices)).toEqual([75, null, null, null, 25]);
    });

    it('is all null when nothing is drawable', () => {
        expect(ComputeSlicePercents([{ Label: 'a', Value: 0 }, { Label: 'b', Value: null }])).toEqual([null, null]);
    });

    it('is the single source of arc percents: every arc equals the helper output for its slice', () => {
        const slices = [{ Label: 'a', Value: 7 }, { Label: 'b', Value: 0 }, { Label: 'c', Value: 2 }, { Label: 'd', Value: -1 }, { Label: 'e', Value: 5 }];
        const percents = ComputeSlicePercents(slices);
        const g = ComputeDonutLayout(base({ Slices: slices, Fills: slices.map((_, i) => `var(--mj-viz-${i + 1})`) }));
        expect(g.Arcs.map((a) => a.SliceIndex)).toEqual([0, 2, 4]);
        g.Arcs.forEach((a) => expect(a.Percent).toBe(percents[a.SliceIndex]));
    });
});

describe('ComputeDonutLayout - type metrics', () => {
    it('a larger font gives percent labels more room, so the donut shrinks', () => {
        const small = ComputeDonutLayout(base({ ShowPercentLabels: true, Type: TypeMetrics(12) }));
        const big = ComputeDonutLayout(base({ ShowPercentLabels: true, Type: TypeMetrics(18), Measure: (t) => t.length * 10.5 }));
        expect(big.OuterRadius).toBeLessThan(small.OuterRadius);
        expect(big.Type.FontSize).toBe(18);
    });

    it('a larger line height costs a height-bound donut exactly the LineHeight difference', () => {
        // 600x150 is height-bound, so the label's vertical allowance (Type.LineHeight) is what limits the radius.
        const wide = { Size: { Width: 600, Height: 150 }, ShowPercentLabels: true, Measure: (t: string): number => t.length * 7 };
        const small = ComputeDonutLayout(base({ ...wide, Type: TypeMetrics(12) }));
        const big = ComputeDonutLayout(base({ ...wide, Type: TypeMetrics(18) }));
        expect(TypeMetrics(18).LineHeight - TypeMetrics(12).LineHeight).toBe(8);
        expect(small.OuterRadius - big.OuterRadius).toBeCloseTo(8);
    });
});
