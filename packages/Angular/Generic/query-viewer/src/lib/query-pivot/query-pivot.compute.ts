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
export function formatMeasureValue(value: number | null | undefined, format: PivotMeasureFormat): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '—';
    }

    switch (format) {
        case 'currency':
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(value);

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
            return formatDuration(value);

        default:
            return String(value);
    }
}

/**
 * Formats a duration in milliseconds into a concise readable unit (ms, s, m s).
 */
export function formatDuration(ms: number): string {
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
export function formatDelta(deltaPercent: number | null | undefined): string {
    if (deltaPercent === null || deltaPercent === undefined || isNaN(deltaPercent)) {
        return '—';
    }
    const prefix = deltaPercent > 0 ? '+' : '';
    return `${prefix}${deltaPercent.toFixed(1)}%`;
}

/**
 * Buckets a date/time value into the given time grain (hour or day).
 */
export function bucketTimestamp(value: unknown, grain: PivotTimeGrain): string {
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
 * If all values are null/undefined, returns null.
 */
export function aggregateValues(
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
export function computeDeltaPercent(current: number | null, previous: number | null): number | null {
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
        const bucketed = bucketTimestamp(row[timeColumn], grain);
        dimensionValues[timeColumn] = bucketed;
        keyParts.push(`${timeColumn}:${bucketed}`);
    }

    return {
        groupKey: keyParts.join('|'),
        dimensionValues
    };
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
            config.dimensionColumns,
            config.timeColumn,
            config.grain
        );

        let group = groups.get(groupKey);
        if (!group) {
            group = { dimensionValues, currentRows: [], prevRows: [] };
            groups.set(groupKey, group);
        }

        if (config.comparisonWindow && isRowInPreviousPeriod(row, config.comparisonPeriodColumn)) {
            group.prevRows.push(row);
        } else {
            group.currentRows.push(row);
        }
    }

    return groups;
}

/**
 * Computes measures for a single group with comparison window support.
 */
function computeGroupMeasures(
    group: { currentRows: Record<string, unknown>[]; prevRows: Record<string, unknown>[] },
    measureCols: PivotMeasureColumn[],
    comparisonWindow: boolean
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const measure of measureCols) {
        const currentVals = group.currentRows.map(r => r[measure.key] as number | null | undefined);
        const currentAgg = aggregateValues(currentVals, measure.aggregation);

        result[measure.key] = formatMeasureValue(currentAgg, measure.format);
        result[`${measure.key}_raw`] = currentAgg;

        if (comparisonWindow) {
            const prevVals = group.prevRows.map(r => r[measure.key] as number | null | undefined);
            const prevAgg = aggregateValues(prevVals, measure.aggregation);
            const deltaPercent = computeDeltaPercent(currentAgg, prevAgg);
            const diff = currentAgg !== null && prevAgg !== null ? currentAgg - prevAgg : null;

            result[`${measure.key}_prev`] = formatMeasureValue(prevAgg, measure.format);
            result[`${measure.key}_prev_raw`] = prevAgg;
            result[`${measure.key}_delta`] = formatDelta(deltaPercent);
            result[`${measure.key}_delta_raw`] = diff;
            result[`${measure.key}_delta_percent`] = deltaPercent;
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

    for (const dim of config.dimensionColumns) {
        columns.push(createGridColumn(dim, dim, order++, 'left', 'nvarchar'));
    }

    if (config.timeColumn && config.grain) {
        const timeHeader = config.grain === 'hour' ? `${config.timeColumn} (Hour)` : `${config.timeColumn} (Day)`;
        columns.push(createGridColumn(config.timeColumn, timeHeader, order++, 'left', 'nvarchar'));
    }

    for (const measure of config.measureColumns) {
        const baseType = measure.format === 'currency' ? 'money' : (measure.format === 'number' ? 'decimal' : 'nvarchar');
        columns.push(createGridColumn(measure.key, measure.label, order++, 'right', baseType));

        if (config.comparisonWindow) {
            columns.push(createGridColumn(`${measure.key}_prev`, `${measure.label} (Prev)`, order++, 'right', baseType));
            columns.push(createGridColumn(`${measure.key}_delta`, `${measure.label} Δ`, order++, 'right', 'nvarchar'));
        }
    }

    return columns;
}

/**
 * Pure pivot function: aggregates query rows by dimensions, applies measure aggregations,
 * computes comparison deltas, formats null values as em dashes ('—'), and builds grid column defs.
 */
export function computePivot(
    rows: Record<string, unknown>[],
    config: QueryPivotConfig
): PivotResult {
    if (!rows || rows.length === 0) {
        return {
            rows: [],
            columnConfigs: buildGridColumns(config),
            totalInputRows: 0,
            groupedRowCount: 0
        };
    }

    const groups = groupRows(rows, config);
    const outputRows: Record<string, unknown>[] = [];

    for (const group of groups.values()) {
        const measureValues = computeGroupMeasures(group, config.measureColumns, !!config.comparisonWindow);
        outputRows.push({
            ...group.dimensionValues,
            ...measureValues
        });
    }

    return {
        rows: outputRows,
        columnConfigs: buildGridColumns(config),
        totalInputRows: rows.length,
        groupedRowCount: outputRows.length
    };
}
