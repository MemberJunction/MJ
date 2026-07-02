import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Type } from '@/theme/tokens';
import type { ChartDatum } from './chart-spec';

/** Props for {@link LineChart}. */
export type LineChartProps = {
    /** Ordered data points plotted left-to-right along the x axis. */
    data: ChartDatum[];
    /** Available container width in px; the chart scales to fill it. */
    width: number;
    /** Plot height in px (default 150). */
    height?: number;
    /** Optional heading rendered above the plot. */
    title?: string;
};

const PAD_LEFT = 38;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

/**
 * A minimal line chart (with soft area fill and point markers) built purely on
 * `react-native-svg`. Renders a single accent-colored series with min/max y-axis
 * annotations and first/last x-axis labels — enough context for a mobile glance.
 */
export function LineChart({ data, width, height = 150, title }: LineChartProps) {
    const plotW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
    const plotH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
    const values = data.map((d) => d.value);
    const maxValue = Math.max(...values, 0);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;

    const points = data.map((datum, idx) => {
        const x = PAD_LEFT + (data.length === 1 ? plotW / 2 : (idx / (data.length - 1)) * plotW);
        const y = PAD_TOP + plotH * (1 - (datum.value - minValue) / range);
        return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const baselineY = PAD_TOP + plotH;
    const areaPath = points.length > 0
        ? `${linePath} L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`
        : '';

    return (
        <View>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <Svg width={width} height={height}>
                <Line x1={PAD_LEFT} y1={baselineY} x2={width - PAD_RIGHT} y2={baselineY} stroke={Colors.line2} strokeWidth={1} />
                <SvgText x={0} y={PAD_TOP + 4} fill={Colors.ink3} fontSize={10}>{formatValue(maxValue)}</SvgText>
                <SvgText x={0} y={baselineY} fill={Colors.ink3} fontSize={10}>{formatValue(minValue)}</SvgText>
                {areaPath ? <Path d={areaPath} fill={Colors.brandSoft} /> : null}
                {points.length > 1 ? <Path d={linePath} fill="none" stroke={Colors.brand} strokeWidth={2.2} /> : null}
                {points.map((p, idx) => (
                    <Circle key={`pt-${idx}`} cx={p.x} cy={p.y} r={2.6} fill={Colors.brand} />
                ))}
                {data.length > 0 ? (
                    <SvgText x={PAD_LEFT} y={height - 6} fill={Colors.ink3} fontSize={10}>
                        {truncate(data[0].label, 10)}
                    </SvgText>
                ) : null}
                {data.length > 1 ? (
                    <SvgText x={width - PAD_RIGHT} y={height - 6} fill={Colors.ink3} fontSize={10} textAnchor="end">
                        {truncate(data[data.length - 1].label, 10)}
                    </SvgText>
                ) : null}
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
    return String(Math.round(value));
}

const styles = StyleSheet.create({
    title: {
        fontSize: Type.small,
        fontWeight: Type.semibold,
        color: Colors.ink2,
        marginBottom: Spacing.sm,
    },
});
