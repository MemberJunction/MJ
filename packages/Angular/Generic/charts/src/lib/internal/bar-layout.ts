import { scaleBand, ScaleBand, ScaleLinear } from 'd3';
import { BarOrientation, ChartSeries, ChartValueFormatter } from '../chart.types';
import { AxisTick, BarGeometry, BarSegment, CategoryBand, ChartTypeMetrics, PlotBox, PlotSize, TextMeasure } from './geometry.types';
import { IsFiniteValue } from './validate';
import { BuildValueTicks, CreateValueScale, CullTicks, MaxOf, MaxTickLabels, Round2, TruncateLabel, ValueDomain } from './scales';

export interface BarLayoutInput {
    Categories: ReadonlyArray<string>;
    Series: ReadonlyArray<ChartSeries>;
    /** Resolved fill per series index (see colors.ts). */
    Fills: ReadonlyArray<string>;
    Orientation: BarOrientation;
    Stacked: boolean;
    Size: PlotSize;
    Measure: TextMeasure;
    Type: ChartTypeMetrics;
    Formatter: ChartValueFormatter;
}

export const BarLayoutConstants = {
    MaxCategoryAxisShare: 0.35,
    BandPaddingInner: 0.3,
    BandPaddingOuter: 0.15,
    GroupPadding: 0.1,
    MaxCornerRadius: 4,
} as const;

type RoundedEnd = 'right' | 'left' | 'top' | 'bottom';

/** A rectangle whose far end (in the bar's growth direction) has rounded corners. */
export function RoundedEndRectPath(x: number, y: number, width: number, height: number, radius: number, end: RoundedEnd): string {
    const n = Round2;
    const r = n(radius);
    if (r <= 0) {
        return `M${n(x)},${n(y)}h${n(width)}v${n(height)}h${n(-width)}Z`;
    }
    const x2 = n(x + width);
    const y2 = n(y + height);
    switch (end) {
        case 'right':
            return `M${n(x)},${n(y)}H${n(x2 - r)}A${r},${r} 0 0 1 ${x2},${n(y + r)}V${n(y2 - r)}A${r},${r} 0 0 1 ${n(x2 - r)},${y2}H${n(x)}Z`;
        case 'left':
            return `M${x2},${n(y)}V${y2}H${n(x + r)}A${r},${r} 0 0 1 ${n(x)},${n(y2 - r)}V${n(y + r)}A${r},${r} 0 0 1 ${n(x + r)},${n(y)}Z`;
        case 'top':
            return `M${n(x)},${y2}V${n(y + r)}A${r},${r} 0 0 1 ${n(x + r)},${n(y)}H${n(x2 - r)}A${r},${r} 0 0 1 ${x2},${n(y + r)}V${y2}Z`;
        case 'bottom':
            return `M${n(x)},${n(y)}H${x2}V${n(y2 - r)}A${r},${r} 0 0 1 ${n(x2 - r)},${y2}H${n(x + r)}A${r},${r} 0 0 1 ${n(x)},${n(y2 - r)}Z`;
    }
}

export function ComputeBarLayout(input: BarLayoutInput): BarGeometry {
    const C = BarLayoutConstants;
    const horizontal = input.Orientation === 'horizontal';
    const extent = valueExtent(input.Series, input.Categories.length, input.Stacked);
    const domain = ValueDomain(extent.Min, extent.Max);
    const probe = CreateValueScale(domain, 0, 1, false);
    const tickLabelWidth = MaxOf(probe.ticks(MaxTickLabels).map((t) => input.Measure(input.Formatter(t))), 0);
    const box = plotBox(input, horizontal, tickLabelWidth);
    const indices = input.Categories.map((_, i) => i);

    const band = scaleBand<number>()
        .domain(indices)
        .range(horizontal ? [box.Y, box.Y + box.Height] : [box.X, box.X + box.Width])
        .paddingInner(C.BandPaddingInner)
        .paddingOuter(C.BandPaddingOuter);
    const value = horizontal
        ? CreateValueScale(domain, box.X, box.X + box.Width, false)
        : CreateValueScale(domain, box.Y + box.Height, box.Y, false);

    const segments = input.Stacked ? stackedSegments(input, band, value, horizontal) : groupedSegments(input, band, value, horizontal);
    const gap = (band.step() - band.bandwidth()) / 2;
    const categoryBands: CategoryBand[] = indices.map((c) => ({ CategoryIndex: c, Start: Round2((band(c) ?? 0) - gap), Size: Round2(band.step()) }));

    return {
        Size: input.Size,
        Type: input.Type,
        Box: box,
        Orientation: input.Orientation,
        Segments: segments,
        CategoryBands: categoryBands,
        CategoryAxis: categoryTicks(input, band, box, horizontal),
        ValueAxis: BuildValueTicks(value, false, input.Formatter, horizontal ? 'middle' : 'end'),
        Baseline: Round2(value(0)),
    };
}

function valueExtent(series: ReadonlyArray<ChartSeries>, categoryCount: number, stacked: boolean): { Min: number; Max: number } {
    let min = 0;
    let max = 0;
    for (let c = 0; c < categoryCount; c++) {
        let positive = 0;
        let negative = 0;
        for (const s of series) {
            const v = s.Values[c];
            if (!IsFiniteValue(v)) {
                continue;
            }
            if (stacked) {
                if (v >= 0) positive += v; else negative += v;
            } else {
                max = Math.max(max, v);
                min = Math.min(min, v);
            }
        }
        if (stacked) {
            max = Math.max(max, positive);
            min = Math.min(min, negative);
        }
    }
    return { Min: min, Max: max };
}

function plotBox(input: BarLayoutInput, horizontal: boolean, tickLabelWidth: number): PlotBox {
    const C = BarLayoutConstants;
    const { AxisGap, ValueAxisThickness } = input.Type;
    const { Width: width, Height: height } = input.Size;
    if (horizontal) {
        const labelWidth = Math.min(MaxOf(input.Categories.map(input.Measure), 0), width * C.MaxCategoryAxisShare);
        const left = labelWidth + AxisGap;
        const right = tickLabelWidth / 2;
        return { X: Round2(left), Y: 0, Width: Round2(Math.max(0, width - left - right)), Height: Round2(Math.max(0, height - ValueAxisThickness)) };
    }
    const left = tickLabelWidth + AxisGap;
    return { X: Round2(left), Y: AxisGap, Width: Round2(Math.max(0, width - left)), Height: Round2(Math.max(0, height - ValueAxisThickness - AxisGap)) };
}

function makeSegment(
    input: BarLayoutInput, value: ScaleLinear<number, number>, horizontal: boolean,
    seriesIndex: number, categoryIndex: number, start: number, thickness: number, from: number, to: number, rawValue: number, outermost: boolean,
): BarSegment {
    const a = value(from);
    const b = value(to);
    const length = Math.abs(b - a);
    const x = horizontal ? Math.min(a, b) : start;
    const y = horizontal ? start : Math.min(a, b);
    const width = horizontal ? length : thickness;
    const height = horizontal ? thickness : length;
    const positive = to >= from;
    const end: RoundedEnd = horizontal ? (positive ? 'right' : 'left') : (positive ? 'top' : 'bottom');
    const radius = outermost ? Math.min(BarLayoutConstants.MaxCornerRadius, thickness / 2, length) : 0;
    return {
        SeriesIndex: seriesIndex,
        CategoryIndex: categoryIndex,
        X: Round2(x), Y: Round2(y), Width: Round2(width), Height: Round2(height),
        CornerRadius: Round2(radius),
        Path: RoundedEndRectPath(x, y, width, height, radius, end),
        Value: rawValue,
        Fill: input.Fills[seriesIndex],
        Key: `${seriesIndex}:${categoryIndex}`,
    };
}

function stackedSegments(input: BarLayoutInput, band: ScaleBand<number>, value: ScaleLinear<number, number>, horizontal: boolean): BarSegment[] {
    const out: BarSegment[] = [];
    input.Categories.forEach((_, c) => {
        const start = band(c) ?? 0;
        let positive = 0;
        let negative = 0;
        const made: Array<{ S: number; From: number; To: number; Raw: number; Positive: boolean }> = [];
        input.Series.forEach((s, si) => {
            const raw = s.Values[c];
            if (!IsFiniteValue(raw) || raw === 0) {
                return;
            }
            const from = raw > 0 ? positive : negative;
            const to = from + raw;
            if (raw > 0) positive = to; else negative = to;
            made.push({ S: si, From: from, To: to, Raw: raw, Positive: raw > 0 });
        });
        const lastPositive = made.map((m) => m.Positive).lastIndexOf(true);
        const lastNegative = made.map((m) => m.Positive).lastIndexOf(false);
        made.forEach((m, i) => {
            out.push(makeSegment(input, value, horizontal, m.S, c, start, band.bandwidth(), m.From, m.To, m.Raw, i === lastPositive || i === lastNegative));
        });
    });
    return out;
}

function groupedSegments(input: BarLayoutInput, band: ScaleBand<number>, value: ScaleLinear<number, number>, horizontal: boolean): BarSegment[] {
    const inner = scaleBand<number>()
        .domain(input.Series.map((_, i) => i))
        .range([0, band.bandwidth()])
        .padding(BarLayoutConstants.GroupPadding);
    const out: BarSegment[] = [];
    input.Categories.forEach((_, c) => {
        input.Series.forEach((s, si) => {
            const raw = s.Values[c];
            if (!IsFiniteValue(raw) || raw === 0) {
                return;
            }
            const start = (band(c) ?? 0) + (inner(si) ?? 0);
            out.push(makeSegment(input, value, horizontal, si, c, start, inner.bandwidth(), 0, raw, raw, true));
        });
    });
    return out;
}

/** Anchor mirrors where the template draws the label: left of the plot (horizontal) is 'end', under a band (vertical) is 'middle'. */
function categoryTicks(input: BarLayoutInput, band: ScaleBand<number>, box: PlotBox, horizontal: boolean): AxisTick[] {
    const indices = input.Categories.map((_, i) => i);
    const maxLabels = horizontal ? Math.max(1, Math.floor(box.Height / input.Type.LineHeight)) : MaxTickLabels;
    const kept = CullTicks(indices, maxLabels);
    const room = horizontal ? box.X - input.Type.AxisGap : box.Width / Math.max(1, kept.length) - 4;
    return kept.map((c) => ({
        Position: Round2((band(c) ?? 0) + band.bandwidth() / 2),
        Label: TruncateLabel(input.Categories[c], room, input.Measure),
        FullLabel: input.Categories[c],
        Key: `c${c}`,
        Anchor: horizontal ? ('end' as const) : ('middle' as const),
    }));
}
