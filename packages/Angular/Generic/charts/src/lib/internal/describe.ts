import { ChartPointEvent, ChartSeries, ChartValueFormatter, DonutSlice } from '../chart.types';
import { ActivePoint, ChartTableModel, ChartTooltipModel, LegendFit, ChartTypeMetrics, LegendItem, TextMeasure } from './geometry.types';
import { IsFiniteValue } from './validate';
import { DefaultFontSize, FormatPercent, TypeMetrics } from './scales';

export const MaxTableRows = 500;
export const MissingValueText = '—';

export const LegendConstants = {
    MaxRows: 2,
    SwatchGap: 6,
    ItemGap: 16,
    BottomGap: 8,
} as const;

export function FormatValue(value: number | null | undefined, formatter: ChartValueFormatter): string {
    return IsFiniteValue(value) ? formatter(value) : MissingValueText;
}

function valueWithShare(value: number | null | undefined, share: number | null, formatter: ChartValueFormatter): string {
    if (!IsFiniteValue(value)) {
        return MissingValueText;
    }
    return share === null ? formatter(value) : `${formatter(value)} (${FormatPercent(share)})`;
}

export function BuildCategoryTable(
    caption: string, categories: ReadonlyArray<string>, series: ReadonlyArray<ChartSeries>,
    formatter: ChartValueFormatter, shares: number[][] | null,
): ChartTableModel {
    const shown = categories.slice(0, MaxTableRows);
    return {
        Caption: caption,
        ColumnHeaders: series.map((s) => s.Name),
        Rows: shown.map((category, c) => ({
            Header: category,
            Cells: series.map((s, si) => valueWithShare(s.Values[c], shares ? shares[si][c] : null, formatter)),
            Key: `r${c}`,
        })),
        TruncatedNote: categories.length > MaxTableRows ? `Showing the first ${MaxTableRows} of ${categories.length} categories.` : null,
    };
}

export function BuildSliceTable(caption: string, slices: ReadonlyArray<DonutSlice>, formatter: ChartValueFormatter, percents: ReadonlyArray<number | null>): ChartTableModel {
    const shown = slices.slice(0, MaxTableRows);
    return {
        Caption: caption,
        ColumnHeaders: ['Value', 'Share'],
        Rows: shown.map((s, i) => {
            const percent = percents[i];
            return {
                Header: s.Label,
                Cells: [FormatValue(s.Value, formatter), percent === null || percent === undefined ? MissingValueText : FormatPercent(percent / 100)],
                Key: `r${i}`,
            };
        }),
        TruncatedNote: slices.length > MaxTableRows ? `Showing the first ${MaxTableRows} of ${slices.length} slices.` : null,
    };
}

export function BuildCategoryTooltip(
    categoryIndex: number, activeSeriesIndex: number, categories: ReadonlyArray<string>, series: ReadonlyArray<ChartSeries>,
    fills: ReadonlyArray<string>, formatter: ChartValueFormatter, shares: number[][] | null,
): ChartTooltipModel {
    return {
        Title: categories[categoryIndex],
        Rows: series.map((s, si) => ({
            Label: s.Name,
            Value: valueWithShare(s.Values[categoryIndex], shares ? shares[si][categoryIndex] : null, formatter),
            Color: fills[si],
            Active: si === activeSeriesIndex,
            Key: `s${si}`,
        })),
    };
}

export function BuildSliceTooltip(sliceIndex: number, slices: ReadonlyArray<DonutSlice>, fills: ReadonlyArray<string>, formatter: ChartValueFormatter, percent: number): ChartTooltipModel {
    const slice = slices[sliceIndex];
    return {
        Title: slice.Label,
        Rows: [{ Label: slice.Label, Value: valueWithShare(slice.Value, percent / 100, formatter), Color: fills[sliceIndex], Active: true, Key: `s${sliceIndex}` }],
    };
}

export function DescribeCategoryPoint(
    categoryIndex: number, seriesIndex: number, categories: ReadonlyArray<string>, series: ReadonlyArray<ChartSeries>,
    formatter: ChartValueFormatter, shares: number[][] | null,
): string {
    const s = series[seriesIndex];
    const base = `${categories[categoryIndex]}, ${s.Name}, ${FormatValue(s.Values[categoryIndex], formatter)}`;
    return shares && IsFiniteValue(s.Values[categoryIndex]) ? `${base}, ${FormatPercent(shares[seriesIndex][categoryIndex])}` : base;
}

export function DescribeSlice(sliceIndex: number, slices: ReadonlyArray<DonutSlice>, formatter: ChartValueFormatter, percent: number): string {
    const slice = slices[sliceIndex];
    return `${slice.Label}, ${FormatValue(slice.Value, formatter)}, ${FormatPercent(percent / 100)}`;
}

export function BuildPointEvent(point: ActivePoint, categories: ReadonlyArray<string>, series: ReadonlyArray<ChartSeries>, shares: number[][] | null): ChartPointEvent {
    const s = series[point.SeriesIndex];
    const raw = s.Values[point.CategoryIndex];
    return {
        CategoryIndex: point.CategoryIndex,
        Category: categories[point.CategoryIndex],
        SeriesIndex: point.SeriesIndex,
        SeriesName: s.Name,
        Value: IsFiniteValue(raw) ? raw : null,
        // A missing cell has no share; reporting 0 would read as a real zero-percent point.
        Percent: shares !== null && IsFiniteValue(raw) ? shares[point.SeriesIndex][point.CategoryIndex] * 100 : null,
    };
}

/**
 * Rows needed to lay `widths` left to right in `width`, with ItemGap between items.
 * An item wider than the row still takes a row by itself. Returns 0 for no items.
 */
function rowsNeeded(widths: ReadonlyArray<number>, width: number): number {
    let rows = 0;
    let x = 0;
    for (const w of widths) {
        if (rows === 0 || (x > 0 && x + w > width)) {
            rows += 1;
            x = 0;
        }
        x += w + LegendConstants.ItemGap;
    }
    return rows;
}

/**
 * Keep the largest prefix of legend items whose "+N more" label still fits within `maxRows`
 * rows of `width`; the rest are counted in HiddenCount. Measuring the label after the prefix
 * (not the prefix after the label) keeps the "+N more" text inside the same row budget.
 * `type` sizes the swatch; `measure` must be calibrated to the same font size.
 */
export function FitLegend(items: ReadonlyArray<LegendItem>, width: number, measure: TextMeasure, maxRows: number = LegendConstants.MaxRows, type: ChartTypeMetrics = TypeMetrics(DefaultFontSize)): LegendFit {
    if (items.length === 0) {
        return { Visible: [], HiddenCount: 0, Rows: 0 };
    }
    const C = LegendConstants;
    const itemWidths = items.map((item) => type.LegendSwatch + C.SwatchGap + measure(item.Label));
    const allRows = rowsNeeded(itemWidths, width);
    if (allRows <= maxRows) {
        return { Visible: [...items], HiddenCount: 0, Rows: allRows };
    }
    const moreWidth = (hidden: number): number => measure(`+${hidden} more`);
    for (let k = items.length - 1; k >= 0; k -= 1) {
        const hidden = items.length - k;
        const rows = rowsNeeded([...itemWidths.slice(0, k), moreWidth(hidden)], width);
        if (rows <= maxRows) {
            return { Visible: items.slice(0, k), HiddenCount: hidden, Rows: rows };
        }
    }
    // Only reachable with maxRows < 1: even the bare "+N more" label cannot be placed, so show nothing.
    return { Visible: [], HiddenCount: items.length, Rows: 1 };
}
