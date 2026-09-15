import { QueryGridColumnConfig } from '../query-data-grid/models/query-grid-types';

/**
 * Supported display formatting styles for pivot measures.
 */
export type PivotMeasureFormat = 'currency' | 'number' | 'percent' | 'duration';

/**
 * Supported aggregation functions for pivot measures.
 */
export type PivotAggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count';

/**
 * Time grain options for date/time bucketing.
 */
export type PivotTimeGrain = 'hour' | 'day';

/**
 * Configuration for a single measure column in a pivot operation.
 */
export interface PivotMeasureColumn {
    /** The field name/key from the raw query dataset */
    key: string;
    /** The column header label to display */
    label: string;
    /** Format style for rendering the aggregated value */
    format: PivotMeasureFormat;
    /** Aggregation function to apply (defaults to 'sum') */
    aggregation?: PivotAggregationType;
}

/**
 * Full configuration for computing a pivot table over query rows.
 */
export interface QueryPivotConfig {
    /** Columns to group rows by */
    dimensionColumns: string[];
    /** Measures to aggregate per group */
    measureColumns: PivotMeasureColumn[];
    /** Optional date/time column to bucket */
    timeColumn?: string | null;
    /** Time grain for the timeColumn (e.g., 'hour' or 'day') */
    grain?: PivotTimeGrain | null;
    /** Whether to calculate comparison window deltas */
    comparisonWindow?: boolean;
    /**
     * Optional column name indicating whether a row belongs to the current or comparison period.
     * When not supplied but comparisonWindow is true, rows are split across available time intervals.
     */
    comparisonPeriodColumn?: string | null;
}

/**
 * Computed result of a query pivot operation.
 */
export interface PivotResult {
    /** The aggregated rows ready for tabular grid display */
    rows: Record<string, unknown>[];
    /** Column definitions configured with appropriate alignment and headers */
    columnConfigs: QueryGridColumnConfig[];
    /** Total number of raw input rows processed */
    totalInputRows: number;
    /** Total number of grouped output rows generated */
    groupedRowCount: number;
}
