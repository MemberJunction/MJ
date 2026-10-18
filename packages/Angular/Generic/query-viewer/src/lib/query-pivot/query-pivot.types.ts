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
    Key: string;
    /** The column header label to display */
    Label: string;
    /** Format style for rendering the aggregated value */
    Format: PivotMeasureFormat;
    /** Aggregation function to apply (defaults to 'sum') */
    Aggregation?: PivotAggregationType;
    /**
     * For a `'currency'` measure: the row column holding each amount's ISO 4217 currency code.
     * The pivot also groups by this column, so amounts in different currencies are never summed
     * into one figure, and each group is formatted in its own currency. Omit for single-currency
     * data, which is then formatted as USD.
     */
    CurrencyColumn?: string;
}

/**
 * Full configuration for computing a pivot table over query rows.
 */
export interface QueryPivotConfig {
    /** Columns to group rows by */
    DimensionColumns: string[];
    /** Measures to aggregate per group */
    MeasureColumns: PivotMeasureColumn[];
    /** Optional date/time column to bucket */
    TimeColumn?: string | null;
    /** Time grain for the timeColumn (e.g., 'hour' or 'day') */
    Grain?: PivotTimeGrain | null;
    /** Whether to calculate comparison window deltas */
    ComparisonWindow?: boolean;
    /**
     * Optional column name indicating whether a row belongs to the current or comparison period.
     * When not supplied but ComparisonWindow is true, rows are split across available time intervals.
     */
    ComparisonPeriodColumn?: string | null;
    /** Header titles for dimension/time columns, keyed by column; unlisted columns show their key. */
    ColumnLabels?: Record<string, string>;
    /**
     * Dimension columns that take part in grouping but are not displayed — e.g. group by an ID and
     * its display name, show only the name, and still have the ID on each output row.
     */
    HiddenColumns?: string[];
}

/**
 * Computed result of a query pivot operation.
 */
export interface PivotResult {
    /** The aggregated rows ready for tabular grid display */
    Rows: Record<string, unknown>[];
    /** Column definitions configured with appropriate alignment and headers */
    ColumnConfigs: QueryGridColumnConfig[];
    /** Total number of raw input rows processed */
    TotalInputRows: number;
    /** Total number of grouped output rows generated */
    GroupedRowCount: number;
}
