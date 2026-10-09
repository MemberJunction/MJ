/**
 * Public types for @memberjunction/ng-charts.
 *
 * Everything in this file is the package's published contract (spec §6.3):
 * renaming a member or changing its meaning after release is a breaking change.
 */

/**
 * A design-token color reference: `var(--token-name)`.
 * Any other value (hex, named color, a bare `--token`) is logged once and
 * replaced by the series' default `var(--mj-viz-N)` (spec §4 rule 1).
 */
export type ChartColor = string;

/** One series of a bar or area chart. */
export interface ChartSeries {
    Name: string;
    /** Aligned index-for-index with `Categories`. Missing values follow spec §8.2. */
    Values: ReadonlyArray<number | null>;
    Color?: ChartColor;
}

/** One slice of a donut chart. */
export interface DonutSlice {
    Label: string;
    Value: number | null;
    Color?: ChartColor;
}

/** Formats RAW values for axes, tooltips, the data table and announcements. */
export type ChartValueFormatter = (value: number) => string;

/** Default formatter: locale-aware grouping (e.g. 12,345). */
export const DefaultValueFormatter: ChartValueFormatter = (value: number): string => value.toLocaleString();

/** Emitted by bar and area charts. Indexes always refer to the caller's input arrays. */
export interface ChartPointEvent {
    CategoryIndex: number;
    Category: string;
    SeriesIndex: number;
    SeriesName: string;
    /** The caller's raw value, never the rendered/normalized one. */
    Value: number | null;
    /** 0–100 share of the category total in StackMode 'percent'; null otherwise. */
    Percent: number | null;
}

/** Emitted by the donut chart. */
export interface ChartSliceEvent {
    SliceIndex: number;
    Label: string;
    Value: number | null;
    /** 0–100 share of the non-negative total. */
    Percent: number;
}

export type BarOrientation = 'horizontal' | 'vertical';
export type AreaStackMode = 'none' | 'stacked' | 'percent';
export type AreaCurve = 'smooth' | 'linear';
