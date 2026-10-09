import { arc, pie, PieArcDatum } from 'd3';
import { DonutSlice } from '../chart.types';
import { ChartTypeMetrics, DonutArc, DonutGeometry, PlotSize, TextMeasure } from './geometry.types';
import { IsFiniteValue } from './validate';
import { FormatPercent, Round2 } from './scales';

export interface DonutLayoutInput {
    Slices: ReadonlyArray<DonutSlice>;
    Fills: ReadonlyArray<string>;
    /** Already clamped to [0, 0.85] by the component. */
    InnerRadiusRatio: number;
    ShowPercentLabels: boolean;
    Size: PlotSize;
    Measure: TextMeasure;
    Type: ChartTypeMetrics;
}

export const DonutLayoutConstants = {
    Padding: 4,
    LabelOffset: 10,
    LabelGap: 6,
    /** Slices narrower than this (radians, ~17°) get no percent label; the tooltip and table still show it. */
    MinLabelAngle: 0.3,
    PadAngle: 0.008,
} as const;

/** Negative, null and non-finite slices contribute nothing (spec §8.2). */
export function SliceValue(value: number | null): number {
    return IsFiniteValue(value) && value > 0 ? value : 0;
}

/**
 * Each slice's share of the drawable total, 0-100; `null` for a slice that is not drawn
 * (zero, negative, null, non-finite). The single source of percents: the layout's arcs and
 * the component's tooltip / table / announcement all read it, so they cannot drift apart.
 */
export function ComputeSlicePercents(slices: ReadonlyArray<DonutSlice>): Array<number | null> {
    const values = slices.map((s) => SliceValue(s.Value));
    const total = values.reduce((a, b) => a + b, 0);
    return values.map((v) => (v > 0 && total > 0 ? (v / total) * 100 : null));
}

export function ComputeDonutLayout(input: DonutLayoutInput): DonutGeometry {
    const C = DonutLayoutConstants;
    const values = input.Slices.map((s) => SliceValue(s.Value));
    const percents = ComputeSlicePercents(input.Slices);
    const { Width: width, Height: height } = input.Size;
    const centerX = width / 2;
    const centerY = height / 2;
    const labelWidth = input.ShowPercentLabels ? input.Measure(FormatPercent(1)) + C.LabelOffset + C.LabelGap : 0;
    const labelHeight = input.ShowPercentLabels ? input.Type.LineHeight + C.LabelOffset : 0;
    const outer = Math.max(0, Math.min(width / 2 - labelWidth, height / 2 - labelHeight) - C.Padding);
    const inner = outer * input.InnerRadiusRatio;

    // Only drawn (positive) slices go through pie: a zero-value slice still consumes a pad on each
    // side, and a lone slice's pad leaves a notch in a ring that should be closed (100%).
    const drawn = values.flatMap((v, i) => (v > 0 ? [i] : []));
    const pieGen = pie<number>().value((i) => values[i]).sort(null).padAngle(drawn.length === 1 ? 0 : C.PadAngle);
    const arcGen = arc<PieArcDatum<number>>().innerRadius(inner).outerRadius(outer);

    const arcs: DonutArc[] = pieGen(drawn)
        .map((d) => {
            const mid = (d.startAngle + d.endAngle) / 2;
            const labelRadius = outer + C.LabelOffset;
            const showLabel = input.ShowPercentLabels && d.endAngle - d.startAngle >= C.MinLabelAngle;
            return {
                SliceIndex: d.data,
                Path: arcGen(d) ?? '',
                Fill: input.Fills[d.data],
                Percent: percents[d.data] ?? 0,
                StartAngle: d.startAngle,
                EndAngle: d.endAngle,
                LabelPoint: showLabel
                    ? { X: Round2(centerX + Math.sin(mid) * labelRadius), Y: Round2(centerY - Math.cos(mid) * labelRadius), Anchor: Math.sin(mid) >= 0 ? 'start' : 'end' }
                    : null,
            };
        });

    return {
        Size: input.Size,
        Type: input.Type,
        Box: { X: 0, Y: 0, Width: width, Height: height },
        CenterX: Round2(centerX),
        CenterY: Round2(centerY),
        InnerRadius: Round2(inner),
        OuterRadius: Round2(outer),
        Arcs: arcs,
    };
}
