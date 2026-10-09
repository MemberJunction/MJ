import { scaleLinear, ScaleLinear } from 'd3';
import { ChartValueFormatter } from '../chart.types';
import { AxisTick, AxisTickAnchor, ChartTypeMetrics, TextMeasure } from './geometry.types';

export const DefaultFontSize = 12;

/** Every px measure the layouts use, derived from the chart's font size. At 12px these equal the original constants. */
export function TypeMetrics(fontSize: number): ChartTypeMetrics {
    const f = fontSize > 0 && Number.isFinite(fontSize) ? fontSize : DefaultFontSize;
    return {
        FontSize: f,
        LineHeight: Math.round(f * (4 / 3)),
        // Gaps never shrink below the 12px baseline: smaller text still needs the same breathing room around axes.
        AxisGap: Math.max(8, Math.round(f * (2 / 3))),
        ValueAxisThickness: Math.round(f * 2),
        LegendRowHeight: Math.round(f * (5 / 3)),
        LegendSwatch: Math.round(f * (5 / 6)),
    };
}

/** A computed CSS font-size ("16px") as a number; anything unusable falls back to DefaultFontSize. */
export function ParseFontSize(value: string | null | undefined): number {
    const n = typeof value === 'string' ? parseFloat(value) : NaN;
    return Number.isFinite(n) && n > 0 && /px\s*$/.test(value ?? '') ? n : DefaultFontSize;
}

/** Spec §8.3: at most ~8 visible tick labels per axis. */
export const MaxTickLabels = 8;

export interface NumericDomain { Min: number; Max: number; }

/** Percent mode: fixed, never nice()d. */
export const PercentDomain: NumericDomain = { Min: 0, Max: 1 };

const PercentTicks = [0, 0.25, 0.5, 0.75, 1];
const percentFormat = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 });

export function FormatPercent(fraction: number): string {
    return percentFormat.format(fraction);
}

export function Round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Largest value, or `floor` when none exceeds it. Loops rather than `Math.max(...values)`:
 * spreading a data-sized array throws RangeError past the engine's argument limit (~125k).
 */
export function MaxOf(values: Iterable<number>, floor: number): number {
    let best = floor;
    for (const v of values) {
        if (v > best) {
            best = v;
        }
    }
    return best;
}

/** Smallest value, or `ceiling` when none is below it. Loops for the same reason as MaxOf. */
export function MinOf(values: Iterable<number>, ceiling: number): number {
    let best = ceiling;
    for (const v of values) {
        if (v < best) {
            best = v;
        }
    }
    return best;
}

/**
 * A value domain that always includes 0. A zero-width domain is padded to [0, 1]:
 * d3 maps a zero-span domain to the middle of the range, which would float the
 * baseline at half height (spec §8.2).
 */
export function ValueDomain(min: number, max: number): NumericDomain {
    const lo = Math.min(0, min);
    const hi = Math.max(0, max);
    if (hi - lo === 0) {
        return { Min: 0, Max: 1 };
    }
    return { Min: lo, Max: hi };
}

export function CreateValueScale(domain: NumericDomain, rangeStart: number, rangeEnd: number, percent: boolean): ScaleLinear<number, number> {
    const scale = scaleLinear().domain([domain.Min, domain.Max]).range([rangeStart, rangeEnd]);
    return percent ? scale : scale.nice(MaxTickLabels);
}

/** `anchor` is how the template aligns the label to its position: 'end' beside a left axis, 'middle' under a bottom axis. */
export function BuildValueTicks(scale: ScaleLinear<number, number>, percent: boolean, formatter: ChartValueFormatter, anchor: AxisTickAnchor): AxisTick[] {
    const values = percent ? PercentTicks : CullTicks(scale.ticks(MaxTickLabels));
    return values.map((v) => {
        const label = percent ? FormatPercent(v) : formatter(v);
        return { Position: Round2(scale(v)), Label: label, FullLabel: label, Key: `v${v}`, Anchor: anchor };
    });
}

/** Keep every k-th item so at most `max` remain (the first is always kept). */
export function CullTicks<T>(items: ReadonlyArray<T>, max: number = MaxTickLabels): T[] {
    if (items.length <= max) {
        return [...items];
    }
    const step = Math.ceil(items.length / Math.max(1, max));
    return items.filter((_, i) => i % step === 0);
}

/**
 * Like CullTicks, but the last item is always kept (a final category must not silently vanish,
 * and the area chart anchors its last label 'end' at the plot's right edge). Keeps the first,
 * every `step`-th item in between, and the last, where `step` is the smallest whole step that
 * fits `max`; a multiple of `step` that would land closer than `step` to the last is dropped,
 * so no two kept items are ever nearer than `step`.
 */
export function CullKeepingEnds<T>(items: ReadonlyArray<T>, max: number = MaxTickLabels): T[] {
    // Keeping both ends needs room for two items, so a cap below 2 is treated as 2.
    const cap = Math.max(2, max);
    if (items.length <= cap) {
        return [...items];
    }
    const lastIndex = items.length - 1;
    const step = Math.ceil(lastIndex / (cap - 1));
    const kept: number[] = [];
    for (let i = 0; i < lastIndex; i += step) {
        kept.push(i);
    }
    if (lastIndex - kept[kept.length - 1] < step && kept.length > 1) {
        kept.pop();
    }
    kept.push(lastIndex);
    return kept.map((i) => items[i]);
}

/** Widest prefix + "…" that fits `maxWidth`; "" when even "…" does not fit. */
export function TruncateLabel(text: string, maxWidth: number, measure: TextMeasure): string {
    if (measure(text) <= maxWidth) {
        return text;
    }
    const ellipsis = '…';
    if (measure(ellipsis) > maxWidth) {
        return '';
    }
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (measure(text.slice(0, mid) + ellipsis) <= maxWidth) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return text.slice(0, lo).trimEnd() + ellipsis;
}
