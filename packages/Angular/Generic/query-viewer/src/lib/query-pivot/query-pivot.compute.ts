import { QueryGridColumnConfig } from '../query-data-grid/models/query-grid-types';
import {
    PivotAggregationType,
    PivotMeasureColumn,
    PivotMeasureFormat,
    PivotResult,
    PivotTimeGrain,
    QueryPivotConfig
} from './query-pivot.types';

/**
 * Formats a numeric measure value according to the specified format style.
 * Null and undefined values always render as an em dash ('—').
 */
export function FormatMeasureValue(value: number | null | undefined, format: PivotMeasureFormat, currencyCode: string = 'USD'): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '—';
    }

    switch (format) {
        case 'currency':
            return formatCurrencyAmount(value, currencyCode);

        case 'number':
            return value.toLocaleString('en-US', {
                minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
                maximumFractionDigits: 2
            });

        case 'percent':
            return `${value.toLocaleString('en-US', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            })}%`;

        case 'duration':
            return FormatDuration(value);

        default:
            return String(value);
    }
}

/**
 * Formats an amount in the given ISO 4217 currency. A code Intl does not recognise is shown beside
 * the number rather than silently re-labelled as dollars.
 */
function formatCurrencyAmount(value: number, currencyCode: string): string {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    } catch {
        return `${value.toFixed(2)} ${currencyCode}`;
    }
}

/**
 * Formats a duration in milliseconds into a concise readable unit (ms, s, m s).
 */
export function FormatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(2)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

/**
 * Formats a comparison delta percentage with sign prefix and em dash fallback.
 */
export function FormatDelta(deltaPercent: number | null | undefined): string {
    if (deltaPercent === null || deltaPercent === undefined || isNaN(deltaPercent)) {
        return '—';
    }
    const prefix = deltaPercent > 0 ? '+' : '';
    return `${prefix}${deltaPercent.toFixed(1)}%`;
}

/**
 * Buckets a date/time value into the given time grain (hour or day).
 */
export function BucketTimestamp(value: unknown, grain: PivotTimeGrain): string {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const date = value instanceof Date ? value : new Date(String(value));
    if (isNaN(date.getTime())) {
        return String(value);
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    if (grain === 'day') {
        return `${year}-${month}-${day}`;
    }

    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:00`;
}

/**
 * Computes an aggregate over an array of numeric values, ignoring nulls.
 * If all values are null/undefined/NaN, returns null.
 *
 * NOTE: For 'count' aggregation, this returns the count of non-null values
 * for the measure column in this group (matching SQL COUNT(column) semantics).
 */
export function AggregateValues(
    values: (number | null | undefined)[],
    aggregation: PivotAggregationType = 'sum'
): number | null {
    const valid = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(Number(v)));
    if (valid.length === 0) {
        return null;
    }

    switch (aggregation) {
        case 'sum':
            return valid.reduce((acc, curr) => acc + curr, 0);

        case 'avg':
            return valid.reduce((acc, curr) => acc + curr, 0) / valid.length;

        case 'min':
            return Math.min(...valid);

        case 'max':
            return Math.max(...valid);

        case 'count':
            return valid.length;

        default:
            return valid.reduce((acc, curr) => acc + curr, 0);
    }
}

/**
 * Computes percentage delta between current and previous values.
 */
export function ComputeDeltaPercent(current: number | null, previous: number | null): number | null {
    if (current === null || previous === null || previous === 0) {
        return null;
    }
    return ((current - previous) / previous) * 100;
}

/**
 * Helper to build a standard QueryGridColumnConfig.
 */
function createGridColumn(
    field: string,
    title: string,
    order: number,
    align: 'left' | 'center' | 'right' = 'left',
    sqlBaseType: string = 'nvarchar'
): QueryGridColumnConfig {
    return {
        field,
        title,
        order,
        align,
        sqlBaseType,
        sqlFullType: sqlBaseType,
        visible: true,
        sortable: true,
        resizable: true,
        reorderable: true,
        isEntityLink: false,
        pinned: null
    };
}

/**
 * Builds the group key string and dimension values object for a raw data row.
 */
function extractGroupKey(
    row: Record<string, unknown>,
    dimensions: string[],
    timeColumn?: string | null,
    grain?: PivotTimeGrain | null
): { groupKey: string; dimensionValues: Record<string, unknown> } {
    const dimensionValues: Record<string, unknown> = {};
    const keyParts: string[] = [];

    for (const dim of dimensions) {
        const val = row[dim];
        dimensionValues[dim] = val ?? '—';
        keyParts.push(`${dim}:${String(val ?? '—')}`);
    }

    if (timeColumn && grain) {
        const bucketed = BucketTimestamp(row[timeColumn], grain);
        dimensionValues[timeColumn] = bucketed;
        keyParts.push(`${timeColumn}:${bucketed}`);
    }

    return {
        groupKey: keyParts.join('|'),
        dimensionValues
    };
}

/**
 * The columns rows are grouped by: the configured dimensions plus any measure's CurrencyColumn, so a
 * currency measure is never aggregated across currencies.
 */
function effectiveDimensions(config: QueryPivotConfig): string[] {
    const dims = [...config.DimensionColumns];
    for (const measure of config.MeasureColumns) {
        if (measure.Format === 'currency' && measure.CurrencyColumn && !dims.includes(measure.CurrencyColumn)) {
            dims.push(measure.CurrencyColumn);
        }
    }
    return dims;
}

/**
 * Determines whether a given row is in the previous/comparison period.
 */
function isRowInPreviousPeriod(
    row: Record<string, unknown>,
    periodColumn?: string | null
): boolean {
    if (!periodColumn || !(periodColumn in row)) {
        return false;
    }
    const val = row[periodColumn];
    if (typeof val === 'boolean') {
        return val;
    }
    const str = String(val ?? '').toLowerCase();
    return str === 'previous' || str === 'prev' || str === 'prior' || str === 'comparison' || str === '1' || str === 'true';
}

/**
 * Groups raw query rows by dimension keys.
 */
function groupRows(
    rows: Record<string, unknown>[],
    config: QueryPivotConfig
): Map<string, { dimensionValues: Record<string, unknown>; currentRows: Record<string, unknown>[]; prevRows: Record<string, unknown>[] }> {
    const groups = new Map<
        string,
        { dimensionValues: Record<string, unknown>; currentRows: Record<string, unknown>[]; prevRows: Record<string, unknown>[] }
    >();

    for (const row of rows) {
        const { groupKey, dimensionValues } = extractGroupKey(
            row,
            effectiveDimensions(config),
            config.TimeColumn,
            config.Grain
        );

        let group = groups.get(groupKey);
        if (!group) {
            group = { dimensionValues, currentRows: [], prevRows: [] };
            groups.set(groupKey, group);
        }

        if (config.ComparisonWindow && isRowInPreviousPeriod(row, config.ComparisonPeriodColumn)) {
            group.prevRows.push(row);
        } else {
            group.currentRows.push(row);
        }
    }

    return groups;
}

/** The currency a group's amounts are in: its CurrencyColumn value, or USD when none is configured. */
function currencyForGroup(dimensionValues: Record<string, unknown>, measure: PivotMeasureColumn): string {
    if (!measure.CurrencyColumn) {
        return 'USD';
    }
    const code = dimensionValues[measure.CurrencyColumn];
    return typeof code === 'string' && code.length === 3 ? code.toUpperCase() : 'USD';
}

/**
 * Computes measures for a single group with comparison window support.
 */
function computeGroupMeasures(
    group: { dimensionValues: Record<string, unknown>; currentRows: Record<string, unknown>[]; prevRows: Record<string, unknown>[] },
    measureCols: PivotMeasureColumn[],
    comparisonWindow: boolean
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const measure of measureCols) {
        const currency = currencyForGroup(group.dimensionValues, measure);
        const currentVals = group.currentRows.map(r => r[measure.Key] as number | null | undefined);
        const currentAgg = AggregateValues(currentVals, measure.Aggregation);

        result[measure.Key] = FormatMeasureValue(currentAgg, measure.Format, currency);
        result[`${measure.Key}_raw`] = currentAgg;

        if (comparisonWindow) {
            const prevVals = group.prevRows.map(r => r[measure.Key] as number | null | undefined);
            const prevAgg = AggregateValues(prevVals, measure.Aggregation);
            const deltaPercent = ComputeDeltaPercent(currentAgg, prevAgg);
            const diff = currentAgg !== null && prevAgg !== null ? currentAgg - prevAgg : null;

            result[`${measure.Key}_prev`] = FormatMeasureValue(prevAgg, measure.Format, currency);
            result[`${measure.Key}_prev_raw`] = prevAgg;
            result[`${measure.Key}_delta`] = FormatDelta(deltaPercent);
            result[`${measure.Key}_delta_raw`] = diff;
            result[`${measure.Key}_delta_percent`] = deltaPercent;
        }
    }

    return result;
}

/**
 * Builds the grid column configurations for dimensions and measures.
 */
function buildGridColumns(
    config: QueryPivotConfig
): QueryGridColumnConfig[] {
    const columns: QueryGridColumnConfig[] = [];
    let order = 0;

    const labels = config.ColumnLabels ?? {};
    const hidden = new Set(config.HiddenColumns ?? []);
    for (const dim of effectiveDimensions(config)) {
        const column = createGridColumn(dim, labels[dim] ?? dim, order++, 'left', 'nvarchar');
        column.visible = !hidden.has(dim);
        columns.push(column);
    }

    if (config.TimeColumn && config.Grain) {
        const timeHeader = labels[config.TimeColumn]
            ?? (config.Grain === 'hour' ? `${config.TimeColumn} (Hour)` : `${config.TimeColumn} (Day)`);
        columns.push(createGridColumn(config.TimeColumn, timeHeader, order++, 'left', 'nvarchar'));
    }

    for (const measure of config.MeasureColumns) {
        const baseType = measure.Format === 'currency' ? 'money' : (measure.Format === 'number' ? 'decimal' : 'nvarchar');
        columns.push(createGridColumn(measure.Key, measure.Label, order++, 'right', baseType));

        if (config.ComparisonWindow) {
            columns.push(createGridColumn(`${measure.Key}_prev`, `${measure.Label} (Prev)`, order++, 'right', baseType));
            columns.push(createGridColumn(`${measure.Key}_delta`, `${measure.Label} Δ`, order++, 'right', 'nvarchar'));
        }
    }

    return columns;
}

/**
 * Pure pivot function: aggregates query rows by dimensions, applies measure aggregations,
 * computes comparison deltas, formats null values as em dashes ('—'), and builds grid column defs.
 */
export function ComputePivot(
    rows: Record<string, unknown>[],
    config: QueryPivotConfig
): PivotResult {
    if (!rows || rows.length === 0) {
        return {
            Rows: [],
            ColumnConfigs: buildGridColumns(config),
            TotalInputRows: 0,
            GroupedRowCount: 0
        };
    }

    const groups = groupRows(rows, config);
    const outputRows: Record<string, unknown>[] = [];

    for (const group of groups.values()) {
        const measureValues = computeGroupMeasures(group, config.MeasureColumns, !!config.ComparisonWindow);
        outputRows.push({
            ...group.dimensionValues,
            ...measureValues
        });
    }

    return {
        Rows: outputRows,
        ColumnConfigs: buildGridColumns(config),
        TotalInputRows: rows.length,
        GroupedRowCount: outputRows.length
    };
}
