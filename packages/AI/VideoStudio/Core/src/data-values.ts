/**
 * @fileoverview Frozen data value contracts produced by `CaptureDataSnapshot` for
 * `VideoDataBinding` entries (Plan §10.1, §10.2; VS-DAT-1).
 *
 * Each shape corresponds to one member of {@link VideoDataShape}:
 * - `'Scalar'` → {@link DataScalarValue}
 * - `'Series'` → {@link DataSeriesValue} (`DataSeriesPoint[]`)
 * - `'Table'`  → {@link DataTableValue} (`DataTableRow[]`)
 * - `'Delta'`  → {@link DataDeltaValue}
 *
 * @module @memberjunction/video-studio-core
 */

import type { ChartKitPoint } from './chart-kit-types.js';

/**
 * Frozen value for a `'Scalar'` data binding: the first field of the first row.
 */
export type DataScalarValue = number | string | null;

/**
 * Single data point in a frozen `'Series'` binding.
 *
 * Aliased to {@link ChartKitPoint} (`{ Label: string; Value: number }`) so frozen
 * `'Series'` snapshot arrays pass directly into `MJChartKit` without mapping.
 */
export type DataSeriesPoint = ChartKitPoint;

/**
 * Frozen value for a `'Series'` data binding: an ordered list of `{ Label, Value }` points.
 */
export type DataSeriesValue = DataSeriesPoint[];

/**
 * Primitive cell value permitted inside a frozen `'Table'` binding row.
 */
export type DataTableCellValue = string | number | boolean | null;

/**
 * Single row in a frozen `'Table'` binding, restricted to the binding's selected fields.
 */
export type DataTableRow = Record<string, DataTableCellValue>;

/**
 * Frozen value for a `'Table'` data binding: rows containing only the selected fields.
 */
export type DataTableValue = DataTableRow[];

/**
 * Frozen value for a `'Delta'` data binding, computed from the first two numeric fields
 * of the first row.
 */
export interface DataDeltaValue {
    /** Current period value (first numeric field of the first row). */
    Current: number;
    /** Comparison / previous period value (second numeric field of the first row). */
    Previous: number;
    /** Raw difference (`Current - Previous`). */
    Change: number;
    /**
     * Relative change expressed as a fraction (`(Current - Previous) / Previous`,
     * e.g., `0.12` for `+12%`), or `null` when `Previous === 0`.
     */
    ChangePercent: number | null;
}

/**
 * Union of all frozen value shapes stored in `VideoDataSnapshot.Inline` or a snapshot file.
 */
export type DataBindingValue =
    | DataScalarValue
    | DataSeriesValue
    | DataTableValue
    | DataDeltaValue;
