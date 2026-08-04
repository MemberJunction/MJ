/**
 * Horizontal bar chart, drawn with `react-native-svg`.
 *
 * Consumes the `ChartDatum[]` carried by a {@link ChartSpec} (see `./chart-spec`)
 * and renders one labeled, palette-colored bar per data point. Used by the
 * {@link Chart} dispatcher for `kind === 'bar'` (and as its default fallback).
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Type } from '@/theme/tokens';
import { chartColorAt, type ChartDatum } from './chart-spec';

/** Props for {@link BarChart}. */
export type BarChartProps = {
    /** Labeled data points, rendered top-to-bottom as horizontal bars. */
    data: ChartDatum[];
    /** Available container width in px; the chart scales to fill it. */
    width: number;
    /** Optional heading rendered above the plot. */
    title?: string;
};

/** Vertical space (px) allotted to each data row. */
const ROW_HEIGHT = 30;
/** Horizontal gutter (px) reserved on the left for category labels. */
const LABEL_WIDTH = 92;
/** Horizontal gutter (px) reserved on the right for the value annotation. */
const VALUE_WIDTH = 52;
/** Thickness (px) of each bar, centered within its row. */
const BAR_HEIGHT = 16;

/**
 * A lightweight horizontal bar chart built purely on `react-native-svg`.
 *
 * Horizontal layout is chosen for mobile: long category labels read cleanly on
 * the left, bars extend to the right, and values are annotated at the bar end.
 * Bars use the categorical palette so adjacent categories stay distinct.
 *
 * @param props See {@link BarChartProps} — data, container width, optional title.
 * @returns A `<View>` wrapping the title and the `react-native-svg` plot.
 */
export function BarChart({ data, width, title }: BarChartProps) {
    const plotHeight = Math.max(ROW_HEIGHT, data.length * ROW_HEIGHT);
    const maxValue = Math.max(...data.map((d) => d.value), 0) || 1;
    const barMax = Math.max(24, width - LABEL_WIDTH - VALUE_WIDTH);

    return (
        <View>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <Svg width={width} height={plotHeight}>
                {data.map((datum, idx) => {
                    const midY = idx * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const barY = idx * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
                    const barWidth = Math.max(1, (datum.value / maxValue) * barMax);
                    return (
                        <G key={`bar-${idx}`}>
                            <SvgText x={0} y={midY} fill={Colors.ink2} fontSize={11} alignmentBaseline="middle">
                                {truncate(datum.label, 14)}
                            </SvgText>
                            <Rect x={LABEL_WIDTH} y={barY} width={barWidth} height={BAR_HEIGHT} rx={4} fill={chartColorAt(idx)} />
                            <SvgText x={LABEL_WIDTH + barWidth + 6} y={midY} fill={Colors.ink3} fontSize={11} alignmentBaseline="middle">
                                {formatValue(datum.value)}
                            </SvgText>
                        </G>
                    );
                })}
            </Svg>
        </View>
    );
}

/** Truncate a label to `max` characters with an ellipsis. */
function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Compact numeric formatting (e.g. 12,500 → 12.5K). */
function formatValue(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return String(value);
}

const styles = StyleSheet.create({
    title: {
        fontSize: Type.small,
        fontWeight: Type.semibold,
        color: Colors.ink2,
        marginBottom: Spacing.sm,
    },
});
