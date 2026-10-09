import { describe, it, expect } from 'vitest';
import { area, curveCatmullRom } from 'd3';
import { AreaLayoutInput, ComputeAreaLayout, ComputePercentShares } from '../area-layout';
import { TypeMetrics } from '../scales';

const measure = (t: string): number => t.length * 7;
const base = (over: Partial<AreaLayoutInput>): AreaLayoutInput => ({
    Categories: ['Jan', 'Feb', 'Mar', 'Apr'],
    Series: [{ Name: 'a', Values: [1, 2, 3, 4] }, { Name: 'b', Values: [4, 3, 2, 1] }],
    Fills: ['var(--mj-viz-1)', 'var(--mj-viz-2)'],
    StackMode: 'none',
    Curve: 'smooth',
    Size: { Width: 400, Height: 200 },
    Measure: measure,
    Type: TypeMetrics(12),
    Formatter: (v) => String(v),
    ...over,
});
const subpaths = (d: string): number => (d.match(/M/g) ?? []).length;
const pathYs = (d: string): number[] => [...d.matchAll(/(-?\d+(?:\.\d+)?(?:e-?\d+)?),(-?\d+(?:\.\d+)?(?:e-?\d+)?)/g)].map((m) => Number(m[2]));

describe('ComputePercentShares', () => {
    it('sums to 1 per non-empty category and is 0 for an all-zero category', () => {
        const shares = ComputePercentShares([{ Name: 'a', Values: [1, 0] }, { Name: 'b', Values: [3, 0] }], 2);
        expect(shares[0][0] + shares[1][0]).toBeCloseTo(1);
        expect(shares[0][0]).toBeCloseTo(0.25);
        expect(shares[0][1]).toBe(0);
        expect(shares[1][1]).toBe(0);
    });
});

describe('ComputeAreaLayout — StackMode none', () => {
    it('renders one path per series and gaps a missing value', () => {
        const g = ComputeAreaLayout(base({ Series: [{ Name: 'a', Values: [1, null, 3, 4] }] , Fills: ['f'] }));
        expect(g.Layers).toHaveLength(1);
        expect(subpaths(g.Layers[0].Path)).toBe(2);
        expect(g.Layers[0].Y1[1]).toBeNull();
        expect(g.Stacked).toBe(false);
    });
});

describe('ComputeAreaLayout — StackMode stacked', () => {
    it('treats missing as 0 and stays continuous', () => {
        const g = ComputeAreaLayout(base({ StackMode: 'stacked', Series: [{ Name: 'a', Values: [1, null, 3, 4] }, { Name: 'b', Values: [1, 1, 1, 1] }] }));
        expect(subpaths(g.Layers[0].Path)).toBe(1);
        expect(g.Layers[0].Y1.every((y) => y !== null)).toBe(true);
        // The missing cell has zero height: its top edge sits exactly on its bottom edge.
        expect(g.Layers[0].Y1[1]).toBe(g.Layers[0].Y0[1]);
        expect(g.Layers[1].Y0).toEqual(g.Layers[0].Y1);
    });
});

describe('ComputeAreaLayout — StackMode percent', () => {
    it('the top layer reaches 100% at every non-empty category; an all-zero category sits at 0', () => {
        const g = ComputeAreaLayout(base({ StackMode: 'percent', Series: [{ Name: 'a', Values: [1, 0, 3, 4] }, { Name: 'b', Values: [1, 0, 1, 1] }] }));
        const top = g.Layers[1];
        const bottom = g.Box.Y + g.Box.Height;
        expect(top.Y1[0]).toBeCloseTo(g.Box.Y);
        expect(top.Y1[1]).toBeCloseTo(bottom);
        expect(g.Percent).toBe(true);
        expect(g.ValueAxis).toHaveLength(5);
    });

    it('smooth curves stay inside the plot (monotoneX does not overshoot 0–100%)', () => {
        const values = { a: [0.02, 0.98, 1, 1, 0.4, 0, 0.95] };
        const series = [
            { Name: 'a', Values: values.a },
            { Name: 'b', Values: values.a.map((v) => 1 - v) },
        ];
        const cats = values.a.map((_, i) => `c${i}`);
        const g = ComputeAreaLayout(base({ StackMode: 'percent', Categories: cats, Series: series }));
        // Smooth must actually emit cubic segments, otherwise the bounds check below proves nothing.
        expect(g.Layers[0].Path).toContain('C');
        for (const layer of g.Layers) {
            for (const y of pathYs(layer.Path)) {
                expect(y).toBeGreaterThanOrEqual(g.Box.Y - 0.01);
                expect(y).toBeLessThanOrEqual(g.Box.Y + g.Box.Height + 0.01);
            }
        }
        // Control: catmull-rom on the same edge overshoots, proving the test can fail.
        const top = g.Layers[0];
        const overshoot = area<number>().x((i) => g.CategoryX[i]).y0((i) => top.Y0[i] ?? 0).y1((i) => top.Y1[i] ?? 0).curve(curveCatmullRom)(cats.map((_, i) => i)) ?? '';
        const ys = pathYs(overshoot);
        expect(Math.min(...ys) < g.Box.Y - 0.01 || Math.max(...ys) > g.Box.Y + g.Box.Height + 0.01).toBe(true);
    });
});

describe('ComputeAreaLayout — layout details', () => {
    it('centers a single category', () => {
        const g = ComputeAreaLayout(base({ Categories: ['Only'], Series: [{ Name: 'a', Values: [2] }], Fills: ['f'] }));
        expect(g.CategoryX[0]).toBeCloseTo(g.Box.X + g.Box.Width / 2);
    });

    it('culls category labels to at most 8', () => {
        const cats = Array.from({ length: 30 }, (_, i) => `d${i}`);
        const g = ComputeAreaLayout(base({ Categories: cats, Series: [{ Name: 'a', Values: cats.map(() => 1) }], Fills: ['f'] }));
        expect(g.CategoryAxis.length).toBeLessThanOrEqual(8);
    });

    it('linear curve draws straight segments (no cubic commands)', () => {
        const g = ComputeAreaLayout(base({ Curve: 'linear' }));
        expect(g.Layers[0].Path).not.toContain('C');
        // Same input with the smooth curve must contain 'C', so the check above is not vacuous.
        const smooth = ComputeAreaLayout(base({ Curve: 'smooth' }));
        expect(smooth.Layers[0].Path).toContain('C');
    });
});

describe('ComputeAreaLayout — data-sized input', () => {
    it('does not overflow the argument limit at 20,000 categories x 10 series', () => {
        const cats = Array.from({ length: 20000 }, (_, i) => `d${i}`);
        const series = Array.from({ length: 10 }, (_, si) => ({ Name: `s${si}`, Values: cats.map(() => 1) }));
        const fills = series.map((_, si) => `var(--mj-viz-${si + 1})`);
        const g = ComputeAreaLayout(base({ Categories: cats, Series: series, Fills: fills, StackMode: 'none' }));
        expect(g.Layers).toHaveLength(10);
    });
});

describe('ComputeAreaLayout — category label anchors', () => {
    const weeks = Array.from({ length: 8 }, (_, i) => `Week of Oct ${10 + i}`);
    const extent = (tick: { Position: number; Label: string; Anchor: 'start' | 'middle' | 'end' }): [number, number] => {
        const w = measure(tick.Label);
        return tick.Anchor === 'start' ? [tick.Position, tick.Position + w] : tick.Anchor === 'end' ? [tick.Position - w, tick.Position] : [tick.Position - w / 2, tick.Position + w / 2];
    };

    it('anchors the first label start, the last end and the rest middle', () => {
        const g = ComputeAreaLayout(base({ Categories: weeks, Series: [{ Name: 'a', Values: weeks.map(() => 1) }], Fills: ['f'] }));
        expect(g.CategoryAxis.map((t) => t.Anchor)).toEqual(['start', 'middle', 'middle', 'middle', 'middle', 'middle', 'middle', 'end']);
    });

    it('keeps every label inside [0, 600] and clear of its neighbour at 600px with long labels', () => {
        const g = ComputeAreaLayout(base({
            Categories: weeks, Size: { Width: 600, Height: 200 },
            Series: [{ Name: 'a', Values: weeks.map((_, i) => i) }], Fills: ['f'], Formatter: (v) => `${v}`,
        }));
        const extents = g.CategoryAxis.map(extent);
        for (const [lo, hi] of extents) {
            expect(lo).toBeGreaterThanOrEqual(0);
            expect(hi).toBeLessThanOrEqual(600);
        }
        extents.slice(1).forEach(([lo], i) => expect(lo).toBeGreaterThanOrEqual(extents[i][1]));
        // The long labels were truncated, not dropped.
        expect(g.CategoryAxis.every((t) => t.Label.length > 0)).toBe(true);
        expect(g.CategoryAxis.some((t) => t.Label !== t.FullLabel)).toBe(true);
    });

    it('stays inside the SVG with a wide value axis and a narrow chart', () => {
        const g = ComputeAreaLayout(base({
            Categories: weeks, Size: { Width: 220, Height: 200 },
            Series: [{ Name: 'a', Values: weeks.map((_, i) => i * 1000) }], Fills: ['f'], Formatter: (v) => `$${v}`,
        }));
        for (const [lo, hi] of g.CategoryAxis.map(extent)) {
            expect(lo).toBeGreaterThanOrEqual(0);
            expect(hi).toBeLessThanOrEqual(220);
        }
    });

    it('a single category is centered; two categories split the gap', () => {
        const one = ComputeAreaLayout(base({ Categories: ['Only week of the year'], Series: [{ Name: 'a', Values: [1] }], Fills: ['f'] }));
        expect(one.CategoryAxis.map((t) => t.Anchor)).toEqual(['middle']);
        const [lo, hi] = extent(one.CategoryAxis[0]);
        expect(lo).toBeGreaterThanOrEqual(0);
        expect(hi).toBeLessThanOrEqual(400);

        const two = ComputeAreaLayout(base({ Categories: ['Week of Oct 10', 'Week of Oct 17'], Series: [{ Name: 'a', Values: [1, 2] }], Fills: ['f'], Size: { Width: 200, Height: 200 } }));
        expect(two.CategoryAxis.map((t) => t.Anchor)).toEqual(['start', 'end']);
        const [a, b] = two.CategoryAxis.map(extent);
        expect(a[1]).toBeLessThanOrEqual(b[0]);
        expect(a[0]).toBeGreaterThanOrEqual(0);
        expect(b[1]).toBeLessThanOrEqual(200);
    });

    it('value-axis ticks are end-anchored: they are drawn left of the plot', () => {
        const g = ComputeAreaLayout(base({}));
        expect(g.ValueAxis.every((t) => t.Anchor === 'end')).toBe(true);
    });

    it.each([9, 10, 12, 19, 40])('with %i categories the kept labels always include the first and the last category, at most 8, inside the SVG', (n) => {
        const cats = Array.from({ length: n }, (_, i) => `Week of Oct ${i + 1}`);
        const g = ComputeAreaLayout(base({ Categories: cats, Size: { Width: 600, Height: 200 }, Series: [{ Name: 'a', Values: cats.map((_, i) => i) }], Fills: ['f'] }));
        const keys = g.CategoryAxis.map((t) => t.Key);
        expect(keys[0]).toBe('c0');
        expect(keys[keys.length - 1]).toBe(`c${n - 1}`);
        expect(g.CategoryAxis.length).toBeLessThanOrEqual(8);
        expect(g.CategoryAxis[g.CategoryAxis.length - 1].Anchor).toBe('end');
        expect(g.CategoryAxis[g.CategoryAxis.length - 1].Position).toBe(g.CategoryX[n - 1]);
        const extents = g.CategoryAxis.map(extent);
        for (const [lo, hi] of extents) {
            expect(lo).toBeGreaterThanOrEqual(0);
            expect(hi).toBeLessThanOrEqual(600);
        }
        extents.slice(1).forEach(([lo], i) => expect(lo).toBeGreaterThanOrEqual(extents[i][1]));
    });
});

describe('ComputeAreaLayout - type metrics', () => {
    it('a larger font shrinks the plot box and raises label offsets', () => {
        const small = ComputeAreaLayout(base({ Type: TypeMetrics(12), Measure: (t) => t.length * 7 }));
        const big = ComputeAreaLayout(base({ Type: TypeMetrics(18), Measure: (t) => t.length * 10.5 }));
        expect(big.Box.Height).toBeLessThan(small.Box.Height);
        expect(big.Type.LineHeight).toBe(24);
    });
    it('a 320px-wide phone layout keeps a non-negative plot box and truncates labels', () => {
        const g = ComputeAreaLayout(base({ Size: { Width: 320, Height: 200 }, Categories: ['A very long category name indeed', 'B', 'Another very long category', 'D'] }));
        expect(g.Box.Width).toBeGreaterThanOrEqual(0);
        expect(g.CategoryAxis[0].Label.endsWith('\u2026')).toBe(true);
    });
});
