import { area, curveLinear, curveMonotoneX, line } from 'd3';
import { AreaCurve, AreaStackMode, ChartSeries, ChartValueFormatter } from '../chart.types';
import { AreaGeometry, AreaLayer, AxisTick, ChartTypeMetrics, PlotBox, PlotSize, TextMeasure } from './geometry.types';
import { IsFiniteValue } from './validate';
import { BuildValueTicks, CreateValueScale, CullKeepingEnds, FormatPercent, MaxOf, MaxTickLabels, MinOf, PercentDomain, Round2, TruncateLabel, ValueDomain } from './scales';

export interface AreaLayoutInput {
    Categories: ReadonlyArray<string>;
    Series: ReadonlyArray<ChartSeries>;
    Fills: ReadonlyArray<string>;
    StackMode: AreaStackMode;
    Curve: AreaCurve;
    Size: PlotSize;
    Measure: TextMeasure;
    Type: ChartTypeMetrics;
    Formatter: ChartValueFormatter;
}

/** Share of each category's non-negative total, as fractions: [seriesIndex][categoryIndex]. */
export function ComputePercentShares(series: ReadonlyArray<ChartSeries>, categoryCount: number): number[][] {
    const totals = Array.from({ length: categoryCount }, (_, c) =>
        series.reduce((sum, s) => {
            const v = s.Values[c];
            return sum + (IsFiniteValue(v) ? Math.max(0, v) : 0);
        }, 0),
    );
    return series.map((s) =>
        totals.map((total, c) => {
            const v = s.Values[c];
            return total > 0 && IsFiniteValue(v) ? Math.max(0, v) / total : 0;
        }),
    );
}

/** Lazily yields each finite cell, so the extent helpers never copy the whole matrix. */
function* finiteCells(raw: ReadonlyArray<ReadonlyArray<number | null>>): Generator<number> {
    for (const row of raw) {
        for (const v of row) {
            if (v !== null) {
                yield v;
            }
        }
    }
}

export function ComputeAreaLayout(input: AreaLayoutInput): AreaGeometry {
    const count = input.Categories.length;
    const indices = input.Categories.map((_, i) => i);
    const stacked = input.StackMode !== 'none';
    const percent = input.StackMode === 'percent';
    const raw: Array<Array<number | null>> = input.Series.map((s) => indices.map((c) => (IsFiniteValue(s.Values[c]) ? (s.Values[c] as number) : null)));

    // Stacked data space: missing counts as 0 so layers stay continuous (spec §8.2).
    const lower: number[][] = [];
    const upper: number[][] = [];
    let stackMax = 0;
    if (stacked) {
        const shares = percent ? ComputePercentShares(input.Series, count) : null;
        const acc = new Array<number>(count).fill(0);
        input.Series.forEach((_, si) => {
            const lo = acc.slice();
            const hi = acc.map((a, c) => a + (shares ? shares[si][c] : raw[si][c] ?? 0));
            lower.push(lo);
            upper.push(hi);
            hi.forEach((v, c) => (acc[c] = v));
        });
        stackMax = MaxOf(acc, 0);
    }

    const domain = percent ? PercentDomain : stacked ? ValueDomain(0, stackMax) : ValueDomain(MinOf(finiteCells(raw), 0), MaxOf(finiteCells(raw), 0));
    const tickWidth = percent
        ? input.Measure(FormatPercent(1))
        : MaxOf(CreateValueScale(domain, 0, 1, false).ticks(MaxTickLabels).map((t) => input.Measure(input.Formatter(t))), 0);
    const { AxisGap, ValueAxisThickness } = input.Type;
    const box: PlotBox = {
        X: Round2(tickWidth + AxisGap),
        Y: AxisGap,
        Width: Round2(Math.max(0, input.Size.Width - tickWidth - AxisGap * 2)),
        Height: Round2(Math.max(0, input.Size.Height - ValueAxisThickness - AxisGap)),
    };
    const xs = indices.map((c) => Round2(count === 1 ? box.X + box.Width / 2 : box.X + (box.Width * c) / (count - 1)));
    const y = CreateValueScale(domain, box.Y + box.Height, box.Y, percent);
    const curve = input.Curve === 'smooth' ? curveMonotoneX : curveLinear;

    const layers: AreaLayer[] = input.Series.map((_, si) => {
        const y0 = indices.map((c) => (stacked ? Round2(y(lower[si][c])) : raw[si][c] === null ? null : Round2(y(0))));
        const y1 = indices.map((c) => (stacked ? Round2(y(upper[si][c])) : raw[si][c] === null ? null : Round2(y(raw[si][c] as number))));
        const defined = (c: number): boolean => y1[c] !== null;
        const fill = area<number>().x((c) => xs[c]).y0((c) => y0[c] ?? 0).y1((c) => y1[c] ?? 0).defined(defined).curve(curve);
        const top = line<number>().x((c) => xs[c]).y((c) => y1[c] ?? 0).defined(defined).curve(curve);
        return { SeriesIndex: si, Path: fill(indices) ?? '', LinePath: top(indices) ?? '', Fill: input.Fills[si], Y0: y0, Y1: y1 };
    });

    return {
        Size: input.Size,
        Type: input.Type,
        Box: box,
        Layers: layers,
        CategoryX: xs,
        CategoryAxis: categoryTicks(input, CullKeepingEnds(indices, MaxTickLabels), xs, box),
        ValueAxis: BuildValueTicks(y, percent, input.Formatter, 'end'),
        Stacked: stacked,
        Percent: percent,
    };
}

/**
 * Category labels sit on the plot's x positions, and the first/last category sit on the plot's
 * left/right edge, where a centered label would hang out of the SVG. So the first label is
 * anchored 'start' and the last 'end' (a lone category stays 'middle'), and each edge label's
 * room is what is left between the SVG edge and its (already truncated) inner neighbour.
 * `kept` must therefore contain the last category (CullKeepingEnds), or the 'end' label would
 * hang off a tick that is not at the right edge.
 */
function categoryTicks(input: AreaLayoutInput, kept: ReadonlyArray<number>, xs: ReadonlyArray<number>, box: PlotBox): AxisTick[] {
    const middleRoom = box.Width / Math.max(1, kept.length) - 4;
    const tick = (c: number, label: string, anchor: AxisTick['Anchor']): AxisTick =>
        ({ Position: xs[c], Label: label, FullLabel: input.Categories[c], Key: `c${c}`, Anchor: anchor });
    if (kept.length === 0) {
        return [];
    }
    if (kept.length === 1) {
        return [tick(kept[0], TruncateLabel(input.Categories[kept[0]], middleRoom, input.Measure), 'middle')];
    }
    const first = kept[0];
    const last = kept[kept.length - 1];
    const inner = kept.slice(1, -1).map((c) => tick(c, TruncateLabel(input.Categories[c], middleRoom, input.Measure), 'middle'));
    const gap = (a: number, b: number): number => xs[b] - xs[a] - 4;
    // With no inner labels the two edge labels face each other and split the gap.
    const roomBeside = (neighbour: AxisTick | undefined, distance: number): number =>
        neighbour === undefined ? distance / 2 : distance - input.Measure(neighbour.Label) / 2;
    const startRoom = Math.min(input.Size.Width - xs[first], roomBeside(inner[0], gap(first, kept[1])));
    const endRoom = Math.min(xs[last], roomBeside(inner[inner.length - 1], gap(kept[kept.length - 2], last)));
    return [
        tick(first, TruncateLabel(input.Categories[first], startRoom, input.Measure), 'start'),
        ...inner,
        tick(last, TruncateLabel(input.Categories[last], endRoom, input.Measure), 'end'),
    ];
}
