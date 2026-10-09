import { ActivePoint, AreaGeometry, BarGeometry, BarSegment, ChartAnchor, ChartNavKey, DonutGeometry } from './geometry.types';
import { MaxOf, MinOf } from './scales';

export function SamePoint(a: ActivePoint | null, b: ActivePoint | null): boolean {
    if (a === null || b === null) {
        return a === b;
    }
    return a.CategoryIndex === b.CategoryIndex && a.SeriesIndex === b.SeriesIndex;
}

const toPoint = (seg: BarSegment): ActivePoint => ({ CategoryIndex: seg.CategoryIndex, SeriesIndex: seg.SeriesIndex });
const byCategoryThenSeries = (a: ActivePoint, b: ActivePoint): number => a.CategoryIndex - b.CategoryIndex || a.SeriesIndex - b.SeriesIndex;

export function HitTestBar(g: BarGeometry, x: number, y: number): ActivePoint | null {
    const direct = g.Segments.find((s) => x >= s.X && x <= s.X + s.Width && y >= s.Y && y <= s.Y + s.Height);
    if (direct) {
        return toPoint(direct);
    }
    const horizontal = g.Orientation === 'horizontal';
    const along = horizontal ? y : x;
    const band = g.CategoryBands.find((b) => along >= b.Start && along < b.Start + b.Size);
    if (!band) {
        return null;
    }
    const candidates = g.Segments.filter((s) => s.CategoryIndex === band.CategoryIndex);
    if (candidates.length === 0) {
        return null;
    }
    const distance = (s: BarSegment): number => {
        const lo = horizontal ? s.X : s.Y;
        const hi = horizontal ? s.X + s.Width : s.Y + s.Height;
        const v = horizontal ? x : y;
        return v < lo ? lo - v : v > hi ? v - hi : 0;
    };
    return toPoint(candidates.reduce((best, s) => (distance(s) < distance(best) ? s : best)));
}

export function HitTestArea(g: AreaGeometry, x: number, y: number): ActivePoint | null {
    const box = g.Box;
    // x only: the tooltip anchors at the plot's top edge, so the pointer must be able to travel
    // up (and out of the plot) toward it and still resolve a point (WCAG 1.4.13 hoverable).
    if (x < box.X || x > box.X + box.Width || g.CategoryX.length === 0) {
        return null;
    }
    const category = g.CategoryX.reduce((best, cx, i) => (Math.abs(cx - x) < Math.abs(g.CategoryX[best] - x) ? i : best), 0);
    const defined = g.Layers.filter((l) => l.Y1[category] !== null);
    if (defined.length === 0) {
        return null;
    }
    if (g.Stacked) {
        const containing = defined.find((l) => {
            const top = l.Y1[category] as number;
            const bottom = l.Y0[category] as number;
            return y >= Math.min(top, bottom) && y <= Math.max(top, bottom);
        });
        if (containing) {
            return { CategoryIndex: category, SeriesIndex: containing.SeriesIndex };
        }
    }
    const nearest = defined.reduce((best, l) => (Math.abs((l.Y1[category] as number) - y) < Math.abs((best.Y1[category] as number) - y) ? l : best));
    return { CategoryIndex: category, SeriesIndex: nearest.SeriesIndex };
}

export function HitTestDonut(g: DonutGeometry, x: number, y: number): ActivePoint | null {
    const dx = x - g.CenterX;
    const dy = y - g.CenterY;
    const radius = Math.hypot(dx, dy);
    if (radius < g.InnerRadius || radius > g.OuterRadius) {
        return null;
    }
    // d3 angles: 0 at 12 o'clock, increasing clockwise.
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) {
        angle += 2 * Math.PI;
    }
    const hit = g.Arcs.find((a) => angle >= a.StartAngle && angle < a.EndAngle);
    return hit ? { CategoryIndex: hit.SliceIndex, SeriesIndex: 0 } : null;
}

export function BarAnchor(g: BarGeometry, p: ActivePoint): ChartAnchor | null {
    const seg = g.Segments.find((s) => s.CategoryIndex === p.CategoryIndex && s.SeriesIndex === p.SeriesIndex);
    if (!seg) {
        return null;
    }
    if (g.Orientation === 'horizontal') {
        const positive = seg.X >= g.Baseline - 0.01;
        return { X: positive ? seg.X + seg.Width : seg.X, Y: seg.Y + seg.Height / 2 };
    }
    const positive = seg.Y + seg.Height <= g.Baseline + 0.01;
    return { X: seg.X + seg.Width / 2, Y: positive ? seg.Y : seg.Y + seg.Height };
}

export function AreaAnchor(g: AreaGeometry, p: ActivePoint): ChartAnchor | null {
    const layer = g.Layers.find((l) => l.SeriesIndex === p.SeriesIndex);
    const y = layer?.Y1[p.CategoryIndex];
    if (layer === undefined || y === null || y === undefined) {
        return null;
    }
    return { X: g.CategoryX[p.CategoryIndex], Y: y };
}

/**
 * Tooltip anchor for a category: the top of the plot at the category's x, so the tooltip
 * does not move as the pointer crosses layers on its way to the tooltip (WCAG 1.4.13).
 * AreaAnchor stays per point, for the keyboard focus mark.
 */
export function AreaCategoryAnchor(g: AreaGeometry, categoryIndex: number): ChartAnchor | null {
    const x = g.CategoryX[categoryIndex];
    return x === undefined ? null : { X: x, Y: g.Box.Y };
}

/**
 * Tooltip anchor for a category: past the end of its tallest stack/group (top for vertical bars,
 * right for horizontal), centered on the band; the baseline when the category has no bars.
 * Per category so the tooltip does not jump between segments as the pointer approaches it.
 */
export function BarCategoryAnchor(g: BarGeometry, categoryIndex: number): ChartAnchor | null {
    const band = g.CategoryBands.find((b) => b.CategoryIndex === categoryIndex);
    if (!band) {
        return null;
    }
    const center = band.Start + band.Size / 2;
    const segments = g.Segments.filter((s) => s.CategoryIndex === categoryIndex);
    if (g.Orientation === 'horizontal') {
        return { X: segments.length > 0 ? MaxOf(segments.map((s) => s.X + s.Width), -Infinity) : g.Baseline, Y: center };
    }
    return { X: center, Y: segments.length > 0 ? MinOf(segments.map((s) => s.Y), Infinity) : g.Baseline };
}

export function DonutAnchor(g: DonutGeometry, p: ActivePoint): ChartAnchor | null {
    const a = g.Arcs.find((arc) => arc.SliceIndex === p.CategoryIndex);
    if (!a) {
        return null;
    }
    const mid = (a.StartAngle + a.EndAngle) / 2;
    const r = (g.InnerRadius + g.OuterRadius) / 2;
    return { X: g.CenterX + Math.sin(mid) * r, Y: g.CenterY - Math.cos(mid) * r };
}

export function BarPoints(g: BarGeometry): ActivePoint[] {
    return g.Segments.map(toPoint).sort(byCategoryThenSeries);
}

export function AreaPoints(g: AreaGeometry): ActivePoint[] {
    const out: ActivePoint[] = [];
    g.CategoryX.forEach((_, c) => g.Layers.forEach((l) => {
        if (l.Y1[c] !== null) {
            out.push({ CategoryIndex: c, SeriesIndex: l.SeriesIndex });
        }
    }));
    return out.sort(byCategoryThenSeries);
}

export function DonutPoints(g: DonutGeometry): ActivePoint[] {
    return g.Arcs.map((a) => ({ CategoryIndex: a.SliceIndex, SeriesIndex: 0 }));
}

type Step = -1 | 1;
const categoryStepX: Partial<Record<ChartNavKey, Step>> = { ArrowLeft: -1, ArrowRight: 1 };
const seriesStepX: Partial<Record<ChartNavKey, Step>> = { ArrowDown: -1, ArrowUp: 1 };
const categoryStepY: Partial<Record<ChartNavKey, Step>> = { ArrowUp: -1, ArrowDown: 1 };
const seriesStepY: Partial<Record<ChartNavKey, Step>> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * Keyboard movement over a category × series grid (spec §7.2).
 * categoryAxis 'x': vertical bars and area. 'y': horizontal bars (category 0 at the top).
 */
export function NavigateGrid(points: ReadonlyArray<ActivePoint>, current: ActivePoint | null, key: ChartNavKey, categoryAxis: 'x' | 'y'): ActivePoint | null {
    if (points.length === 0) {
        return null;
    }
    if (key === 'End') {
        return points[points.length - 1];
    }
    if (key === 'Home' || current === null || !points.some((p) => SamePoint(p, current))) {
        return points[0];
    }
    const categoryStep = (categoryAxis === 'x' ? categoryStepX : categoryStepY)[key];
    const seriesStep = (categoryAxis === 'x' ? seriesStepX : seriesStepY)[key];
    if (categoryStep !== undefined) {
        const categories = [...new Set(points.map((p) => p.CategoryIndex))].sort((a, b) => a - b);
        const target = categories[categories.indexOf(current.CategoryIndex) + categoryStep];
        if (target === undefined) {
            return current;
        }
        const inTarget = points.filter((p) => p.CategoryIndex === target);
        return inTarget.reduce((best, p) => (Math.abs(p.SeriesIndex - current.SeriesIndex) < Math.abs(best.SeriesIndex - current.SeriesIndex) ? p : best));
    }
    if (seriesStep !== undefined) {
        const inCategory = points.filter((p) => p.CategoryIndex === current.CategoryIndex).sort(byCategoryThenSeries);
        const index = inCategory.findIndex((p) => SamePoint(p, current));
        return inCategory[index + seriesStep] ?? current;
    }
    return current;
}

/** Keyboard movement over a flat list (donut slices). */
export function NavigateList(points: ReadonlyArray<ActivePoint>, current: ActivePoint | null, key: ChartNavKey): ActivePoint | null {
    if (points.length === 0) {
        return null;
    }
    if (key === 'End') {
        return points[points.length - 1];
    }
    const index = current === null ? -1 : points.findIndex((p) => SamePoint(p, current));
    if (key === 'Home' || index < 0) {
        return points[0];
    }
    const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    return points[index + step] ?? current;
}
