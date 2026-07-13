/**
 * Donut (pie) chart with an inline legend, drawn with `react-native-svg`.
 *
 * Consumes the `ChartDatum[]` carried by a {@link ChartSpec} (see `./chart-spec`)
 * and renders one palette-colored slice per data point sized by its share of the
 * total. Used by the {@link Chart} dispatcher for `kind === 'pie'`.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors, Spacing, Type } from '@/theme/tokens';
import { chartColorAt, type ChartDatum } from './chart-spec';

/** Props for {@link PieChart}. */
export type PieChartProps = {
    /** Slices; each value contributes proportionally to the whole. */
    data: ChartDatum[];
    /** Available container width in px (donut + legend share this). */
    width: number;
    /** Optional heading rendered above the chart. */
    title?: string;
};

/** Outer diameter (px) of the donut SVG. */
const DIAMETER = 132;
/** Inner-hole radius as a fraction of the outer radius (0 = full pie, 1 = ring). */
const INNER_RATIO = 0.58;

/**
 * A donut chart with an inline legend, built purely on `react-native-svg`.
 *
 * Slices are colored from the categorical palette. The legend lists each label
 * with its value and share of the total, so the chart stays legible on a phone
 * without hover interactions. Slices sweep clockwise from 12 o'clock; negative
 * values are clamped to zero.
 *
 * @param props See {@link PieChartProps} — data, container width, optional title.
 * @returns A `<View>` with the title, the `react-native-svg` donut, and the legend.
 */
export function PieChart({ data, width, title }: PieChartProps) {
    const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
    const radius = DIAMETER / 2;
    const inner = radius * INNER_RATIO;
    const center = radius;

    let cursor = -90; // start at 12 o'clock
    const slices = data.map((datum, idx) => {
        const fraction = total > 0 ? Math.max(0, datum.value) / total : 0;
        const start = cursor;
        const end = cursor + fraction * 360;
        cursor = end;
        return { datum, idx, path: donutSlicePath(center, radius, inner, start, end), fraction };
    });

    return (
        <View>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <View style={styles.row}>
                <Svg width={DIAMETER} height={DIAMETER}>
                    {slices.map((s) => (
                        <Path key={`slice-${s.idx}`} d={s.path} fill={chartColorAt(s.idx)} />
                    ))}
                </Svg>
                <View style={styles.legend}>
                    {data.map((datum, idx) => (
                        <View key={`legend-${idx}`} style={styles.legendRow}>
                            <View style={[styles.swatch, { backgroundColor: chartColorAt(idx) }]} />
                            <Text style={styles.legendLabel} numberOfLines={1}>{datum.label}</Text>
                            <Text style={styles.legendValue}>
                                {formatValue(datum.value)}
                                {total > 0 ? ` · ${Math.round((datum.value / total) * 100)}%` : ''}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

/**
 * Build an SVG path for one donut slice between two angles (degrees), given the
 * center, outer radius, inner radius. A near-full slice is closed as a ring.
 */
function donutSlicePath(center: number, radius: number, inner: number, startDeg: number, endDeg: number): string {
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    const o0 = polar(center, radius, startDeg);
    const o1 = polar(center, radius, endDeg);
    const i1 = polar(center, inner, endDeg);
    const i0 = polar(center, inner, startDeg);
    return [
        `M${o0.x},${o0.y}`,
        `A${radius},${radius} 0 ${largeArc} 1 ${o1.x},${o1.y}`,
        `L${i1.x},${i1.y}`,
        `A${inner},${inner} 0 ${largeArc} 0 ${i0.x},${i0.y}`,
        'Z',
    ].join(' ');
}

/** Convert a polar angle (degrees) + radius to a cartesian point about center. */
function polar(center: number, radius: number, degrees: number): { x: number; y: number } {
    const rad = (degrees * Math.PI) / 180;
    return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
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
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    legend: { flex: 1, gap: Spacing.xs },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    swatch: { width: 10, height: 10, borderRadius: 3 },
    legendLabel: { flex: 1, fontSize: Type.small, color: Colors.ink2 },
    legendValue: { fontSize: Type.caption, color: Colors.ink3, fontWeight: Type.medium },
});
