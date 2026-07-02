/**
 * Chart data model + a tolerant parser for artifact/dashboard chart payloads.
 *
 * This module is pure (no React, no react-native-svg) so it can be imported by
 * both the SVG chart components and the artifact classifier without pulling UI
 * into the data layer. It normalizes the several loosely-shaped JSON payloads
 * agents emit for charts into a single `ChartSpec`.
 */
import { Colors } from '@/theme/tokens';

/** Supported chart renderers. */
export type ChartKind = 'bar' | 'line' | 'pie';

/** A single labeled data point. */
export type ChartDatum = { label: string; value: number };

/** Normalized, render-ready chart description. */
export type ChartSpec = {
    kind: ChartKind;
    title?: string;
    data: ChartDatum[];
};

/**
 * Categorical color palette for multi-series/multi-slice charts, drawn from the
 * agent identity + status design tokens for on-brand, distinct hues.
 */
export const ChartPalette: readonly string[] = [
    Colors.brand,
    Colors.agentResearch,
    Colors.agentAnalyst,
    Colors.agentForecaster,
    Colors.agentEmailDrafter,
    Colors.positive,
    Colors.warn,
    Colors.agentFallback,
] as const;

/** Pick a palette color for the `index`-th series/slice (wraps around). */
export function chartColorAt(index: number): string {
    return ChartPalette[index % ChartPalette.length];
}

/** Type guard for a plain (non-array, non-null) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Coerce a value to a finite number, or `null` if it can't be. */
function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Normalize a free-form chart-type hint into a supported `ChartKind`. */
function normalizeKind(raw: unknown): ChartKind | null {
    if (typeof raw !== 'string') return null;
    const k = raw.trim().toLowerCase();
    if (k === 'bar' || k === 'column' || k === 'histogram') return 'bar';
    if (k === 'line' || k === 'area' || k === 'spline') return 'line';
    if (k === 'pie' || k === 'donut' || k === 'doughnut') return 'pie';
    return null;
}

/** Read the chart-type discriminator from any of the common field names. */
function readKind(obj: Record<string, unknown>): ChartKind | null {
    return (
        normalizeKind(obj.chartType) ??
        normalizeKind(obj.type) ??
        normalizeKind(obj.chart) ??
        normalizeKind(obj.kind)
    );
}

/** Parse an array of `{label,value}`-ish objects into data points. */
function parseObjectRows(rows: unknown[]): ChartDatum[] {
    const out: ChartDatum[] = [];
    rows.forEach((row, idx) => {
        if (!isRecord(row)) return;
        const value = toNumber(row.value ?? row.y ?? row.count ?? row.amount);
        if (value === null) return;
        const rawLabel = row.label ?? row.name ?? row.x ?? row.category;
        const label = rawLabel != null ? String(rawLabel) : `#${idx + 1}`;
        out.push({ label, value });
    });
    return out;
}

/** Zip a parallel numbers array with a labels array into data points. */
function zipValues(values: unknown[], labels: string[]): ChartDatum[] {
    const out: ChartDatum[] = [];
    values.forEach((v, idx) => {
        const value = toNumber(v);
        if (value === null) return;
        out.push({ label: labels[idx] ?? `#${idx + 1}`, value });
    });
    return out;
}

/** Extract string labels from a `labels`/`categories` field. */
function readLabels(obj: Record<string, unknown>): string[] {
    const raw = obj.labels ?? obj.categories;
    return Array.isArray(raw) ? raw.map((l) => String(l)) : [];
}

/** Pull the numeric data array out of a Chart.js-style `series`/`datasets`. */
function firstSeriesValues(series: unknown[]): unknown[] | null {
    if (series.length === 0) return null;
    const first = series[0];
    if (isRecord(first) && Array.isArray(first.data)) return first.data;
    if (typeof first === 'number' || typeof first === 'string') return series;
    return null;
}

/** Resolve the data points from whichever data-bearing field is present. */
function extractData(obj: Record<string, unknown>, labels: string[]): ChartDatum[] {
    const data = obj.data ?? obj.values ?? obj.points;
    if (Array.isArray(data)) {
        if (data.some(isRecord)) return parseObjectRows(data);
        return zipValues(data, labels);
    }
    const seriesLike = obj.series ?? obj.datasets;
    if (Array.isArray(seriesLike)) {
        // A series of `{label,value}` objects (no wrapper) is also valid.
        if (seriesLike.some(isRecord) && seriesLike.every((s) => !isRecord(s) || !('data' in s))) {
            const rows = parseObjectRows(seriesLike);
            if (rows.length > 0) return rows;
        }
        const values = firstSeriesValues(seriesLike);
        if (values) return values.some(isRecord) ? parseObjectRows(values) : zipValues(values, labels);
    }
    return [];
}

/**
 * Parse an arbitrary parsed-JSON value into a `ChartSpec`, or return `null` when
 * the shape isn't recognizably a chart. Requires an explicit chart-type hint (or
 * a `series` field) so ordinary JSON objects aren't mistaken for charts.
 *
 * @param input Parsed JSON (object expected).
 * @returns A normalized `ChartSpec`, or `null` if not a chart payload.
 */
export function parseChartSpec(input: unknown): ChartSpec | null {
    if (!isRecord(input)) return null;

    const kind = readKind(input);
    const hasSeries = Array.isArray(input.series) || Array.isArray(input.datasets);
    if (!kind && !hasSeries) return null;

    const labels = readLabels(input);
    const data = extractData(input, labels);
    if (data.length === 0) return null;

    const title = typeof input.title === 'string' ? input.title : undefined;
    return { kind: kind ?? 'bar', title, data };
}
