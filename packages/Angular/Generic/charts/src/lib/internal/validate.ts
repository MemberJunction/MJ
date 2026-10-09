import { ChartSeries, DonutSlice } from '../chart.types';
import { ChartDataStatus } from './geometry.types';

export type CategoryChartMode = 'bar' | 'area-none' | 'area-stacked' | 'area-percent';

export function IsFiniteValue(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Spec §8.2. Pure — returns a status and never logs; the controller reports it.
 * Details carry series names and indexes only, never data values.
 */
export function ValidateCategorySeries(
    categories: ReadonlyArray<string>,
    series: ReadonlyArray<ChartSeries>,
    mode: CategoryChartMode,
): ChartDataStatus {
    if (categories.length === 0 || series.length === 0) {
        return { Kind: 'empty' };
    }
    for (const s of series) {
        if (s.Values.length !== categories.length) {
            return { Kind: 'invalid', Code: 'length-mismatch', Detail: `series "${s.Name}" has ${s.Values.length} values for ${categories.length} categories` };
        }
    }
    if (mode === 'area-stacked' || mode === 'area-percent') {
        for (const s of series) {
            const index = s.Values.findIndex((v) => IsFiniteValue(v) && v < 0);
            if (index >= 0) {
                return {
                    Kind: 'invalid',
                    Code: mode === 'area-percent' ? 'negative-in-percent' : 'negative-in-stacked-area',
                    Detail: `series "${s.Name}" is negative at category ${index}`,
                };
            }
        }
    }
    return { Kind: 'ok' };
}

/** A donut has nothing to show unless some slice is positive (negative slices are excluded, not invalid). */
export function ValidateSlices(slices: ReadonlyArray<DonutSlice>): ChartDataStatus {
    const hasPositive = slices.some((s) => IsFiniteValue(s.Value) && s.Value > 0);
    return hasPositive ? { Kind: 'ok' } : { Kind: 'empty' };
}
