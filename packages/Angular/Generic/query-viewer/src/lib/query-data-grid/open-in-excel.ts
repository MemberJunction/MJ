/**
 * @fileoverview When the query grid offers Open in Excel, and the parameter values it sends.
 *
 * Kept out of the component so the rules are testable on their own. A workbook names a SAVED query
 * by ID with the parameter values of the last run; the server re-checks every value, refuses
 * server-set parameters and runs the query as whoever opens the workbook.
 */
import type { MJQueryParameterEntity } from '@memberjunction/core-entities';
import type { ExcelParameterValue } from '@memberjunction/excel-addin';
import type { QueryParameterValues } from './models/query-grid-types';

/** The parts of a query parameter's definition these rules read. */
export type QueryParameterDefinition = Pick<MJQueryParameterEntity, 'Name' | 'IsRequired' | 'IsServerSet' | 'Type'>;

/** The tooltip on the query grid's Open in Excel button. */
export const OPEN_QUERY_IN_EXCEL_TOOLTIP =
    'Download a workbook that loads this query in Excel, with the parameters of the last run, ' +
    'and refreshes it from MemberJunction.';

/** True when a parameter has no usable value: nothing, an empty string, or an empty list for an array parameter. */
export function IsMissingParameterValue(value: QueryParameterValues[string] | undefined, type: QueryParameterDefinition['Type']): boolean {
    if (value === null || value === undefined || value === '') {
        return true;
    }
    return type === 'array' && Array.isArray(value) && value.length === 0;
}

/**
 * True when every required parameter the person fills in has a value. Server-set parameters are
 * never the person's to fill, so they don't count.
 */
export function HasRequiredParameterValues(values: QueryParameterValues | null, definitions: readonly QueryParameterDefinition[]): boolean {
    const given = values ?? {};
    return definitions
        .filter(d => d.IsRequired && !d.IsServerSet)
        .every(d => !IsMissingParameterValue(given[d.Name], d.Type));
}

/**
 * The parameter values a workbook carries: only parameters the query defines and the person sets
 * (never server-set ones), with dates as ISO strings and lists as lists of strings.
 */
export function ToExcelParameterValues(
    values: QueryParameterValues | null,
    definitions: readonly QueryParameterDefinition[],
): Record<string, ExcelParameterValue> {
    const result: Record<string, ExcelParameterValue> = {};
    if (!values) {
        return result;
    }
    for (const definition of definitions) {
        if (definition.IsServerSet || !(definition.Name in values)) {
            continue;
        }
        const converted = toExcelParameterValue(values[definition.Name]);
        if (converted !== undefined) {
            result[definition.Name] = converted;
        }
    }
    return result;
}

/**
 * True when the grid should show Open in Excel: the host allows the button, a saved query is loaded,
 * the MemberJunction host serves the Excel add-in, and no required parameter lacks a value.
 */
export function CanOpenQueryInExcel(
    showButton: boolean,
    queryID: string | null | undefined,
    addinEnabled: boolean,
    values: QueryParameterValues | null,
    definitions: readonly QueryParameterDefinition[],
): boolean {
    if (!showButton || !addinEnabled || typeof queryID !== 'string' || queryID.trim().length === 0) {
        return false;
    }
    return HasRequiredParameterValues(values, definitions);
}

function toExcelParameterValue(value: QueryParameterValues[string] | undefined): ExcelParameterValue | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(v => String(v));
    }
    return value;
}
