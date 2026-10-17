```ts
interface ChartKitTokens {
    FontFamily: string;  // CSS font-family stack applied to all SVG `<text>` elements.
    Text: string;  // Primary high-contrast foreground color for titles, values, and headers.
    MutedText: string;  // Secondary foreground color for axis labels, captions, and sub-labels.
    Background: string;  // Card or chart surface background color.
    Grid: string;  // Subtle divider, baseline, and reference grid line color.
    Series: string[];  // Ordered categorical series palette (cycled across bars, slices, and lines).
    Positive: string;  // Semantic accent color for positive deltas and upward trends.
    Negative: string;  // Semantic accent color for negative deltas and downward trends.
}

interface ChartKitFrame {
    Width: number;  // SVG viewport width in pixels.
    Height: number;  // SVG viewport height in pixels.
    StartSeconds?: number;  // Animation start timestamp in seconds (defaults to `0`).
    DurationSeconds?: number;  // Animation duration in seconds (defaults to `1.2`).
    Tokens?: ChartKitTokens;  // Optional brand token palette (defaults to `DEFAULT_CHART_KIT_TOKENS`).
}

interface ChartKitPoint {
    Label: string;  // Human-readable category, period, or slice label.
    Value: number;  // Numeric metric value for this datum.
}

interface ChartKitColumn {
    Header: string;  // Column header text displayed in the table header row.
    Format?: VideoDataFormat;  // Optional display formatting rules applied to numeric cells in this column.
}

interface KpiTileProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Value: number;  // Target numeric metric value reached at `StartSeconds + DurationSeconds`.
    Label: string;  // Human-readable metric caption displayed alongside the KPI value.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on the value element.
    Format?: VideoDataFormat;  // Optional display formatting rules for `Value`.
}

interface DeltaBadgeProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Delta: number;  // Signed numeric delta value (positive values automatically receive a leading `+`).
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on the delta element.
    Format?: VideoDataFormat;  // Optional display formatting rules for `Delta`.
}

interface BarChartProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Points: ChartKitPoint[];  // Ordered categorical data points to render as vertical bars.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on bar value elements.
    Format?: VideoDataFormat;  // Optional display formatting rules for bar values.
}

interface LineChartProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Points: ChartKitPoint[];  // Ordered series points connected by the line.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on point value elements.
    Format?: VideoDataFormat;  // Optional display formatting rules for point values.
}

interface AreaChartProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Points: ChartKitPoint[];  // Ordered series points defining the area curve.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on point value elements.
    Format?: VideoDataFormat;  // Optional display formatting rules for point values.
}

interface DonutChartProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Points: ChartKitPoint[];  // Categorical slices rendered around the donut ring.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on slice value elements.
    Format?: VideoDataFormat;  // Optional display formatting rules for slice values.
}

interface RankedListProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Points: ChartKitPoint[];  // Ordered items to display in the ranked list.
    MaxItems?: number;  // Optional cap on the maximum number of items rendered.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on item value elements.
    Format?: VideoDataFormat;  // Optional display formatting rules for item values.
}

interface SparklineProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Values: number[];  // Ordered numeric values plotted along the sparkline.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on value elements.
    Format?: VideoDataFormat;  // Optional display formatting rules for displayed sparkline values.
}

interface TableRevealProps {
    Frame: ChartKitFrame;  // Viewport geometry, animation window, and brand tokens.
    Columns: ChartKitColumn[];  // Ordered column headers and optional per-column number formats.
    Rows: (string | number)[][];  // Two-dimensional array of cell values (`string | number`) matching `Columns` order.
    BindingKey?: string;  // Optional `VideoDataBinding.Key` written to `data-mj-bound` on cell value elements.
    Format?: VideoDataFormat;  // Optional fallback display formatting rules for numeric cells without a column `Format`.
}

interface MJChartKit {
    KpiTile: (props: KpiTileProps, timeSeconds: number) => string;  // Renders an animated KPI hero tile with count-up value and label as SVG markup.
    DeltaBadge: (props: DeltaBadgeProps, timeSeconds: number) => string;  // Renders an animated directional delta pill with SVG arrow shape and signed value as SVG markup.
    Bar: (props: BarChartProps, timeSeconds: number) => string;  // Renders a staggered vertical bar chart with direct value labels as SVG markup.
    Line: (props: LineChartProps, timeSeconds: number) => string;  // Renders a progressive line chart with markers and direct value labels as SVG markup.
    Area: (props: AreaChartProps, timeSeconds: number) => string;  // Renders a progressive filled area chart with top stroke and direct value labels as SVG markup.
    Donut: (props: DonutChartProps, timeSeconds: number) => string;  // Renders a staggered donut chart with direct slice labels and values as SVG markup.
    RankedList: (props: RankedListProps, timeSeconds: number) => string;  // Renders a staggered horizontal ranked list with `#N` rank badges and values as SVG markup.
    Sparkline: (props: SparklineProps, timeSeconds: number) => string;  // Renders a compact progressive sparkline with terminal marker and direct value label as SVG markup.
    TableReveal: (props: TableRevealProps, timeSeconds: number) => string;  // Renders a staggered row-by-row table reveal as SVG markup.
    FormatValue: (value: number | string, format?: VideoDataFormat) => string;  // Formats a bound numeric or date value deterministically without `Intl`.
}
```
