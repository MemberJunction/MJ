/**
 * Brand-token-driven, deterministic SVG chart-kit contracts for MemberJunction Video Studio (§10.3, D11).
 *
 * All primitives in `MJChartKit` are pure functions of `(props, timeSeconds)` returning self-contained
 * SVG markup with every numeric value marked with `data-mj-bound`.
 */

import type { VideoDataFormat } from './video-generation-spec.js';

/**
 * Color and typography tokens controlling chart-kit primitive appearance.
 */
export interface ChartKitTokens {
    /** CSS font-family stack applied to all SVG `<text>` elements. */
    FontFamily: string;
    /** Primary high-contrast foreground color for titles, values, and headers. */
    Text: string;
    /** Secondary foreground color for axis labels, captions, and sub-labels. */
    MutedText: string;
    /** Card or chart surface background color. */
    Background: string;
    /** Subtle divider, baseline, and reference grid line color. */
    Grid: string;
    /** Ordered categorical series palette (cycled across bars, slices, and lines). */
    Series: string[];
    /** Semantic accent color for positive deltas and upward trends. */
    Positive: string;
    /** Semantic accent color for negative deltas and downward trends. */
    Negative: string;
}

/**
 * Viewport geometry, animation timing window, and optional token overrides for a chart-kit primitive.
 */
export interface ChartKitFrame {
    /** SVG viewport width in pixels. */
    Width: number;
    /** SVG viewport height in pixels. */
    Height: number;
    /** Animation start timestamp in seconds (defaults to `0`). */
    StartSeconds?: number;
    /** Animation duration in seconds (defaults to `1.2`). */
    DurationSeconds?: number;
    /** Optional brand token palette (defaults to `DEFAULT_CHART_KIT_TOKENS`). */
    Tokens?: ChartKitTokens;
}

/**
 * Single labeled numeric datum used by categorical and series chart primitives.
 */
export interface ChartKitPoint {
    /** Human-readable category, period, or slice label. */
    Label: string;
    /** Numeric metric value for this datum. */
    Value: number;
}

/**
 * Column definition for `TableRevealProps`.
 */
export interface ChartKitColumn {
    /** Column header text displayed in the table header row. */
    Header: string;
    /** Optional display formatting rules applied to numeric cells in this column. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.KpiTile` (animated KPI hero metric with count-up and label).
 */
export interface KpiTileProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Target numeric metric value reached at `StartSeconds + DurationSeconds`. */
    Value: number;
    /** Human-readable metric caption displayed alongside the KPI value. */
    Label: string;
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on the value element. */
    BindingKey?: string;
    /** Optional display formatting rules for `Value`. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.DeltaBadge` (animated pill with directional SVG arrow and signed delta).
 */
export interface DeltaBadgeProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Signed numeric delta value (positive values automatically receive a leading `+`). */
    Delta: number;
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on the delta element. */
    BindingKey?: string;
    /** Optional display formatting rules for `Delta`. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.Bar` (staggered vertical bar chart with direct value labels on bars).
 */
export interface BarChartProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Ordered categorical data points to render as vertical bars. */
    Points: ChartKitPoint[];
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on bar value elements. */
    BindingKey?: string;
    /** Optional display formatting rules for bar values. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.Line` (progressive line chart with vertex markers and direct value labels).
 */
export interface LineChartProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Ordered series points connected by the line. */
    Points: ChartKitPoint[];
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on point value elements. */
    BindingKey?: string;
    /** Optional display formatting rules for point values. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.Area` (progressive filled area + top stroke chart with direct value labels).
 */
export interface AreaChartProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Ordered series points defining the area curve. */
    Points: ChartKitPoint[];
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on point value elements. */
    BindingKey?: string;
    /** Optional display formatting rules for point values. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.Donut` (staggered arc-segment donut chart with direct slice labels).
 */
export interface DonutChartProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Categorical slices rendered around the donut ring. */
    Points: ChartKitPoint[];
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on slice value elements. */
    BindingKey?: string;
    /** Optional display formatting rules for slice values. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.RankedList` (staggered horizontal ranked bars with rank badges and values).
 */
export interface RankedListProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Ordered items to display in the ranked list. */
    Points: ChartKitPoint[];
    /** Optional cap on the maximum number of items rendered. */
    MaxItems?: number;
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on item value elements. */
    BindingKey?: string;
    /** Optional display formatting rules for item values. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.Sparkline` (compact trend line with terminal marker and direct end label).
 */
export interface SparklineProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Ordered numeric values plotted along the sparkline. */
    Values: number[];
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on value elements. */
    BindingKey?: string;
    /** Optional display formatting rules for displayed sparkline values. */
    Format?: VideoDataFormat;
}

/**
 * Props for `MJChartKit.TableReveal` (staggered row-by-row tabular reveal).
 */
export interface TableRevealProps {
    /** Viewport geometry, animation window, and brand tokens. */
    Frame: ChartKitFrame;
    /** Ordered column headers and optional per-column number formats. */
    Columns: ChartKitColumn[];
    /** Two-dimensional array of cell values (`string | number`) matching `Columns` order. */
    Rows: (string | number)[][];
    /** Optional `VideoDataBinding.Key` written to `data-mj-bound` on cell value elements. */
    BindingKey?: string;
    /** Optional fallback display formatting rules for numeric cells without a column `Format`. */
    Format?: VideoDataFormat;
}

/**
 * Deterministic, seekable SVG chart kit exposed in Node via `CreateMJChartKit()` and in browser
 * compositions at `window.MJChartKit` (§10.3).
 */
export interface MJChartKit {
    /** Renders an animated KPI hero tile with count-up value and label as SVG markup. */
    KpiTile: (props: KpiTileProps, timeSeconds: number) => string;
    /** Renders an animated directional delta pill with SVG arrow shape and signed value as SVG markup. */
    DeltaBadge: (props: DeltaBadgeProps, timeSeconds: number) => string;
    /** Renders a staggered vertical bar chart with direct value labels as SVG markup. */
    Bar: (props: BarChartProps, timeSeconds: number) => string;
    /** Renders a progressive line chart with markers and direct value labels as SVG markup. */
    Line: (props: LineChartProps, timeSeconds: number) => string;
    /** Renders a progressive filled area chart with top stroke and direct value labels as SVG markup. */
    Area: (props: AreaChartProps, timeSeconds: number) => string;
    /** Renders a staggered donut chart with direct slice labels and values as SVG markup. */
    Donut: (props: DonutChartProps, timeSeconds: number) => string;
    /** Renders a staggered horizontal ranked list with `#N` rank badges and values as SVG markup. */
    RankedList: (props: RankedListProps, timeSeconds: number) => string;
    /** Renders a compact progressive sparkline with terminal marker and direct value label as SVG markup. */
    Sparkline: (props: SparklineProps, timeSeconds: number) => string;
    /** Renders a staggered row-by-row table reveal as SVG markup. */
    TableReveal: (props: TableRevealProps, timeSeconds: number) => string;
    /** Formats a bound numeric or date value deterministically without `Intl`. */
    FormatValue: (value: number | string, format?: VideoDataFormat) => string;
}
