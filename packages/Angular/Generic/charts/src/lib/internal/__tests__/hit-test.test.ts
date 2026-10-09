import { describe, it, expect } from 'vitest';
import { ComputeBarLayout } from '../bar-layout';
import { ComputeAreaLayout } from '../area-layout';
import { ComputeDonutLayout } from '../donut-layout';
import { TypeMetrics } from '../scales';
import {
    AreaAnchor, AreaCategoryAnchor, AreaPoints, BarAnchor, BarCategoryAnchor, BarPoints, DonutAnchor, DonutPoints, HitTestArea, HitTestBar, HitTestDonut,
    NavigateGrid, NavigateList, SamePoint,
} from '../hit-test';
import { ActivePoint } from '../geometry.types';

const measure = (t: string): number => t.length * 7;
const fmt = (v: number): string => String(v);

const bar = ComputeBarLayout({
    Categories: ['A', 'B'], Series: [{ Name: 's0', Values: [2, 3] }, { Name: 's1', Values: [1, 0] }],
    Fills: ['f0', 'f1'], Orientation: 'vertical', Stacked: true, Size: { Width: 400, Height: 200 }, Measure: measure, Type: TypeMetrics(12), Formatter: fmt,
});
const areaG = ComputeAreaLayout({
    Categories: ['Jan', 'Feb', 'Mar'], Series: [{ Name: 'a', Values: [1, 1, 1] }, { Name: 'b', Values: [1, 1, 1] }],
    Fills: ['f0', 'f1'], StackMode: 'percent', Curve: 'linear', Size: { Width: 400, Height: 200 }, Measure: measure, Type: TypeMetrics(12), Formatter: fmt,
});
const donut = ComputeDonutLayout({
    Slices: [{ Label: 'a', Value: 1 }, { Label: 'b', Value: -1 }, { Label: 'c', Value: 1 }],
    Fills: ['f0', 'f1', 'f2'], InnerRadiusRatio: 0.5, ShowPercentLabels: false, Size: { Width: 200, Height: 200 }, Measure: measure, Type: TypeMetrics(12),
});

describe('HitTestBar', () => {
    it('hits the segment under the pointer', () => {
        const seg = bar.Segments.find((s) => s.Key === '1:0')!;
        expect(HitTestBar(bar, seg.X + seg.Width / 2, seg.Y + seg.Height / 2)).toEqual({ CategoryIndex: 0, SeriesIndex: 1 });
    });
    it('falls back to the nearest segment in the same category band', () => {
        const top = bar.Segments.find((s) => s.Key === '1:0')!;
        expect(HitTestBar(bar, top.X + top.Width / 2, top.Y - 5)).toEqual({ CategoryIndex: 0, SeriesIndex: 1 });
    });
    it('misses outside every band', () => expect(HitTestBar(bar, -50, -50)).toBeNull());
});

describe('HitTestArea', () => {
    it('picks the nearest category and the stacked layer containing y', () => {
        const x = areaG.CategoryX[1];
        const midBottom = ((areaG.Layers[0].Y0[1] ?? 0) + (areaG.Layers[0].Y1[1] ?? 0)) / 2;
        const midTop = ((areaG.Layers[1].Y0[1] ?? 0) + (areaG.Layers[1].Y1[1] ?? 0)) / 2;
        expect(HitTestArea(areaG, x + 3, midBottom)).toEqual({ CategoryIndex: 1, SeriesIndex: 0 });
        expect(HitTestArea(areaG, x - 3, midTop)).toEqual({ CategoryIndex: 1, SeriesIndex: 1 });
    });
    it('misses outside the plot box horizontally', () => {
        expect(HitTestArea(areaG, 0, 0)).toBeNull();
        expect(HitTestArea(areaG, areaG.Box.X + areaG.Box.Width + 1, areaG.Box.Y + 5)).toBeNull();
    });
    it('resolves any y while x is inside the plot: above the box (toward the tooltip) and below it', () => {
        const x = areaG.CategoryX[1];
        const above = HitTestArea(areaG, x, 0);
        expect(above).toEqual({ CategoryIndex: 1, SeriesIndex: 1 });
        expect(HitTestArea(areaG, x, areaG.Box.Y - 500)).toEqual(above);
        expect(HitTestArea(areaG, x, areaG.Box.Y + areaG.Box.Height + 50)).toEqual({ CategoryIndex: 1, SeriesIndex: 0 });
    });
});

describe('HitTestDonut', () => {
    it('hits the ring by angle and keeps the caller slice index', () => {
        const r = (donut.InnerRadius + donut.OuterRadius) / 2;
        // Angle 0 = 12 o'clock; slice 0 starts there.
        expect(HitTestDonut(donut, donut.CenterX + 1, donut.CenterY - r)).toEqual({ CategoryIndex: 0, SeriesIndex: 0 });
        expect(HitTestDonut(donut, donut.CenterX - 1, donut.CenterY + r)).toEqual({ CategoryIndex: 2, SeriesIndex: 0 });
    });
    it('misses the hole and the outside', () => {
        expect(HitTestDonut(donut, donut.CenterX, donut.CenterY)).toBeNull();
        expect(HitTestDonut(donut, 0, 0)).toBeNull();
    });
});

describe('anchors', () => {
    it('bar anchor sits on the far end of the segment', () => {
        const seg = bar.Segments.find((s) => s.Key === '0:1')!;
        expect(BarAnchor(bar, { CategoryIndex: 1, SeriesIndex: 0 })).toEqual({ X: seg.X + seg.Width / 2, Y: seg.Y });
    });
    it('area anchor sits on the layer top edge', () => {
        expect(AreaAnchor(areaG, { CategoryIndex: 2, SeriesIndex: 1 })).toEqual({ X: areaG.CategoryX[2], Y: areaG.Layers[1].Y1[2] });
    });
    it('donut anchor sits mid-ring', () => {
        const a = DonutAnchor(donut, { CategoryIndex: 0, SeriesIndex: 0 })!;
        const d = Math.hypot(a.X - donut.CenterX, a.Y - donut.CenterY);
        expect(d).toBeCloseTo((donut.InnerRadius + donut.OuterRadius) / 2, 1);
    });
    it('returns null for a point that is not drawn', () => expect(BarAnchor(bar, { CategoryIndex: 1, SeriesIndex: 1 })).toBeNull());
});

describe('category anchors (tooltip)', () => {
    const horizontalBar = ComputeBarLayout({
        Categories: ['A', 'B', 'C'], Series: [{ Name: 's0', Values: [2, 3, 0] }, { Name: 's1', Values: [1, 0, 0] }],
        Fills: ['f0', 'f1'], Orientation: 'horizontal', Stacked: true, Size: { Width: 400, Height: 200 }, Measure: measure, Type: TypeMetrics(12), Formatter: fmt,
    });
    const groupedBar = ComputeBarLayout({
        Categories: ['A', 'B'], Series: [{ Name: 's0', Values: [2, 3] }, { Name: 's1', Values: [5, 1] }],
        Fills: ['f0', 'f1'], Orientation: 'vertical', Stacked: false, Size: { Width: 400, Height: 200 }, Measure: measure, Type: TypeMetrics(12), Formatter: fmt,
    });
    const bandCenter = (g: typeof bar, c: number): number => {
        const b = g.CategoryBands.find((x) => x.CategoryIndex === c)!;
        return b.Start + b.Size / 2;
    };

    it('area: the same plot-top anchor at the category x for every layer', () => {
        expect(AreaCategoryAnchor(areaG, 1)).toEqual({ X: areaG.CategoryX[1], Y: areaG.Box.Y });
        expect(AreaCategoryAnchor(areaG, 99)).toBeNull();
    });
    it('vertical stacked bar: band center, top of the whole stack', () => {
        const tops = bar.Segments.filter((s) => s.CategoryIndex === 0).map((s) => s.Y);
        const anchor = BarCategoryAnchor(bar, 0)!;
        expect(anchor.Y).toBe(Math.min(...tops));
        expect(anchor.X).toBeCloseTo(bandCenter(bar, 0), 6);
        // Independent of which segment the pointer is on.
        expect(BarCategoryAnchor(bar, 0)).toEqual(anchor);
    });
    it('vertical grouped bar: top of the tallest bar in the group', () => {
        const tallest = groupedBar.Segments.filter((s) => s.CategoryIndex === 0).reduce((best, s) => (s.Y < best.Y ? s : best));
        expect(BarCategoryAnchor(groupedBar, 0)!.Y).toBe(tallest.Y);
        expect(tallest.SeriesIndex).toBe(1);
    });
    it('horizontal bar: right end of the longest segment, band center', () => {
        const longest = Math.max(...horizontalBar.Segments.filter((s) => s.CategoryIndex === 0).map((s) => s.X + s.Width));
        const anchor = BarCategoryAnchor(horizontalBar, 0)!;
        expect(anchor.X).toBe(longest);
        const b = horizontalBar.CategoryBands.find((x) => x.CategoryIndex === 0)!;
        expect(anchor.Y).toBeCloseTo(b.Start + b.Size / 2, 6);
    });
    it('a category with no segments falls back to the baseline; an unknown category is null', () => {
        expect(BarCategoryAnchor(horizontalBar, 2)!.X).toBe(horizontalBar.Baseline);
        const emptyVertical = ComputeBarLayout({
            Categories: ['A', 'B'], Series: [{ Name: 's0', Values: [2, 0] }],
            Fills: ['f0'], Orientation: 'vertical', Stacked: false, Size: { Width: 400, Height: 200 }, Measure: measure, Type: TypeMetrics(12), Formatter: fmt,
        });
        expect(BarCategoryAnchor(emptyVertical, 1)!.Y).toBe(emptyVertical.Baseline);
        expect(BarCategoryAnchor(bar, 9)).toBeNull();
    });
});

describe('navigable points', () => {
    it('bar points skip undrawn (zero) cells', () => {
        expect(BarPoints(bar)).toEqual([{ CategoryIndex: 0, SeriesIndex: 0 }, { CategoryIndex: 0, SeriesIndex: 1 }, { CategoryIndex: 1, SeriesIndex: 0 }]);
    });
    it('area points cover every defined cell', () => expect(AreaPoints(areaG)).toHaveLength(6));
    it('donut points skip excluded slices without renumbering', () => {
        expect(DonutPoints(donut).map((p) => p.CategoryIndex)).toEqual([0, 2]);
    });
});

describe('NavigateGrid', () => {
    const pts: ActivePoint[] = [
        { CategoryIndex: 0, SeriesIndex: 0 }, { CategoryIndex: 0, SeriesIndex: 1 },
        { CategoryIndex: 1, SeriesIndex: 0 },
        { CategoryIndex: 3, SeriesIndex: 0 }, { CategoryIndex: 3, SeriesIndex: 1 },
    ];
    it('any key with no current point starts at the first point; End goes to the last', () => {
        expect(NavigateGrid(pts, null, 'ArrowRight', 'x')).toEqual(pts[0]);
        expect(NavigateGrid(pts, null, 'End', 'x')).toEqual(pts[4]);
    });
    it('x axis: Left/Right change category (skipping empty ones), Up/Down change series', () => {
        expect(NavigateGrid(pts, pts[1], 'ArrowRight', 'x')).toEqual({ CategoryIndex: 1, SeriesIndex: 0 });
        expect(NavigateGrid(pts, pts[2], 'ArrowRight', 'x')).toEqual({ CategoryIndex: 3, SeriesIndex: 0 });
        expect(NavigateGrid(pts, pts[0], 'ArrowUp', 'x')).toEqual(pts[1]);
        expect(NavigateGrid(pts, pts[1], 'ArrowDown', 'x')).toEqual(pts[0]);
    });
    it('y axis (horizontal bars): Up/Down change category, Left/Right change series', () => {
        expect(NavigateGrid(pts, pts[0], 'ArrowDown', 'y')).toEqual({ CategoryIndex: 1, SeriesIndex: 0 });
        expect(NavigateGrid(pts, pts[0], 'ArrowRight', 'y')).toEqual(pts[1]);
    });
    it('stays put at the edges and recovers when current is stale', () => {
        expect(NavigateGrid(pts, pts[0], 'ArrowLeft', 'x')).toEqual(pts[0]);
        expect(NavigateGrid(pts, { CategoryIndex: 9, SeriesIndex: 9 }, 'ArrowLeft', 'x')).toEqual(pts[0]);
        expect(NavigateGrid([], null, 'Home', 'x')).toBeNull();
    });
});

describe('NavigateList', () => {
    const pts: ActivePoint[] = [{ CategoryIndex: 0, SeriesIndex: 0 }, { CategoryIndex: 2, SeriesIndex: 0 }];
    it('moves through slices with arrows, Home and End', () => {
        expect(NavigateList(pts, pts[0], 'ArrowRight')).toEqual(pts[1]);
        expect(NavigateList(pts, pts[1], 'ArrowLeft')).toEqual(pts[0]);
        expect(NavigateList(pts, pts[1], 'Home')).toEqual(pts[0]);
        expect(NavigateList(pts, pts[0], 'End')).toEqual(pts[1]);
        expect(NavigateList(pts, pts[1], 'ArrowRight')).toEqual(pts[1]);
    });
});

describe('SamePoint', () => {
    it('compares by value and handles null', () => {
        expect(SamePoint({ CategoryIndex: 1, SeriesIndex: 2 }, { CategoryIndex: 1, SeriesIndex: 2 })).toBe(true);
        expect(SamePoint(null, { CategoryIndex: 1, SeriesIndex: 2 })).toBe(false);
        expect(SamePoint(null, null)).toBe(true);
    });
});
